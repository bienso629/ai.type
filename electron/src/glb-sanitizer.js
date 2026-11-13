// electron/src/glb-sanitizer.js
// Bộ chuẩn hóa nhị phân GLB 2.0 thuần Node.js (không phụ thuộc công cụ ngoài):
// 1. Hàn kín vi khe hở biên UV seam (open boundary micro-cracks) có kiểm soát chống suy biến & chống lật mặt.
// 2. Loại bỏ tam giác suy biến diện tích ~0.
// 3. Khôi phục pháp tuyến đỉnh (NORMAL) bị NaN / độ dài 0 / ngược chiều mặt và làm mượt pháp tuyến qua đường may UV phẳng.
// 4. Đồng bộ 100% chiều quấn chỉ số tam giác (winding order) khớp với pháp tuyến đỉnh để twoSidedLighting trong WebGL không tạo mảnh đen.
// 5. Sinh tiếp tuyến trực chuẩn (TANGENT vec4) trọng số diện tích 3D để khử nhiễu dFdx/dFdy trên mặt có UV suy biến.
// 6. Chuẩn hóa alphaMode bị xuất nhầm thành BLEND/MASK trên texture JPEG không có kênh alpha.

'use strict';

const fs = require('fs');

const GLB_MAGIC = 0x46546c67; // 'glTF'
const JSON_CHUNK_TYPE = 0x4e4f534a; // 'JSON'
const BIN_CHUNK_TYPE = 0x004e4942; // 'BIN\0'
const SANITIZER_VERSION = 2;

const COMPONENT_BYTE_SIZE = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4  // FLOAT
};

const TYPE_NUM_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};

function makeOrthonormalTangent(nx, ny, nz) {
  let rx = 0, ry = 1, rz = 0;
  if (Math.abs(ny) > 0.99) {
    rx = 1; ry = 0; rz = 0;
  }
  // T = normalize(ref x N)
  let tx = ry * nz - rz * ny;
  let ty = rz * nx - rx * nz;
  let tz = rx * ny - ry * nx;
  const len = Math.hypot(tx, ty, tz) || 1;
  return [tx / len, ty / len, tz / len, 1.0];
}

function readFloatAccessor(gltf, binBuf, accIdx) {
  const acc = gltf.accessors?.[accIdx];
  if (!acc || acc.bufferView === undefined || acc.sparse || acc.componentType !== 5126) return null;
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv || (bv.buffer ?? 0) !== 0) return null;
  const comps = TYPE_NUM_COMPONENTS[acc.type];
  if (!comps) return null;
  const count = acc.count || 0;
  const stride = bv.byteStride || comps * 4;
  const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  if (baseOffset + (count > 0 ? (count - 1) * stride + comps * 4 : 0) > binBuf.length) return null;

  const out = new Float32Array(count * comps);
  const dv = new DataView(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength);
  for (let i = 0; i < count; i++) {
    const off = baseOffset + i * stride;
    for (let c = 0; c < comps; c++) {
      out[i * comps + c] = dv.getFloat32(off + c * 4, true);
    }
  }
  return { data: out, count, comps, stride, baseOffset, acc, bv };
}

function writeFloatAccessor(binBuf, info, computeMinMax) {
  const { data, count, comps, stride, baseOffset, acc } = info;
  const dv = new DataView(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength);
  const minArr = computeMinMax ? new Array(comps).fill(Infinity) : null;
  const maxArr = computeMinMax ? new Array(comps).fill(-Infinity) : null;

  for (let i = 0; i < count; i++) {
    const off = baseOffset + i * stride;
    for (let c = 0; c < comps; c++) {
      const v = data[i * comps + c];
      dv.setFloat32(off + c * 4, v, true);
      if (computeMinMax) {
        if (v < minArr[c]) minArr[c] = v;
        if (v > maxArr[c]) maxArr[c] = v;
      }
    }
  }
  if (computeMinMax && count > 0) {
    acc.min = minArr;
    acc.max = maxArr;
  }
}

function readIndexAccessor(gltf, binBuf, accIdx) {
  const acc = gltf.accessors?.[accIdx];
  if (!acc || acc.bufferView === undefined || acc.sparse || acc.type !== 'SCALAR') return null;
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv || (bv.buffer ?? 0) !== 0) return null;
  const bpe = COMPONENT_BYTE_SIZE[acc.componentType];
  if (!bpe || (acc.componentType !== 5121 && acc.componentType !== 5123 && acc.componentType !== 5125)) return null;
  const count = acc.count || 0;
  const stride = bv.byteStride || bpe;
  const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  if (baseOffset + (count > 0 ? (count - 1) * stride + bpe : 0) > binBuf.length) return null;

  const out = new Uint32Array(count);
  const dv = new DataView(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength);
  for (let i = 0; i < count; i++) {
    const off = baseOffset + i * stride;
    if (acc.componentType === 5121) out[i] = dv.getUint8(off);
    else if (acc.componentType === 5123) out[i] = dv.getUint16(off, true);
    else out[i] = dv.getUint32(off, true);
  }
  return { data: out, count, bpe, stride, baseOffset, acc, bv, accIdx };
}

function writeIndexAccessorInPlace(binBuf, info, newIndices, newCount) {
  const { stride, baseOffset, acc } = info;
  const dv = new DataView(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength);
  let minIdx = Infinity;
  let maxIdx = 0;
  for (let i = 0; i < newCount; i++) {
    const idx = newIndices[i];
    if (idx < minIdx) minIdx = idx;
    if (idx > maxIdx) maxIdx = idx;
    const off = baseOffset + i * stride;
    if (acc.componentType === 5121) dv.setUint8(off, idx);
    else if (acc.componentType === 5123) dv.setUint16(off, idx, true);
    else dv.setUint32(off, idx, true);
  }
  acc.count = newCount;
  if (newCount > 0) {
    acc.min = [minIdx];
    acc.max = [maxIdx];
  } else {
    acc.min = [0];
    acc.max = [0];
  }
}

function appendAlignedBufferAccessor(gltf, extraChunks, extraState, typedArray, componentType, typeStr, target) {
  const rawBuf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const padPre = (4 - (extraState.offset % 4)) % 4;
  if (padPre > 0) {
    extraChunks.push(Buffer.alloc(padPre));
    extraState.offset += padPre;
  }
  const byteOffset = extraState.offset;
  extraChunks.push(rawBuf);
  extraState.offset += rawBuf.length;

  gltf.bufferViews = gltf.bufferViews || [];
  const bvIdx = gltf.bufferViews.length;
  const bv = {
    buffer: 0,
    byteOffset,
    byteLength: rawBuf.length
  };
  if (target) bv.target = target;
  gltf.bufferViews.push(bv);

  const comps = TYPE_NUM_COMPONENTS[typeStr];
  const count = typedArray.length / comps;
  gltf.accessors = gltf.accessors || [];
  const accIdx = gltf.accessors.length;
  gltf.accessors.push({
    bufferView: bvIdx,
    byteOffset: 0,
    componentType,
    count,
    type: typeStr
  });
  return accIdx;
}

/**
 * Hàn kín vi khe hở biên UV seam (chỉ dịch chuyển POSITION của đỉnh biên hở thực sự,
 * giữ nguyên số lượng đỉnh, thứ tự đỉnh và UV).
 */
function weldOpenBoundarySeams(pos, numVerts, primIndicesList, diag) {
  const exactInv = 1.0 / Math.max(diag * 1e-6, 1e-9);
  const posIdOfVert = new Int32Array(numVerts);
  const uniqueCoords = [];
  const posKeyMap = new Map();

  for (let v = 0; v < numVerts; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const k = `${Math.round(x * exactInv)},${Math.round(y * exactInv)},${Math.round(z * exactInv)}`;
    let pid = posKeyMap.get(k);
    if (pid === undefined) {
      pid = uniqueCoords.length / 3;
      posKeyMap.set(k, pid);
      uniqueCoords.push(x, y, z);
    }
    posIdOfVert[v] = pid;
  }

  const numPos = uniqueCoords.length / 3;
  if (numPos < 4) return false;

  // Đếm cạnh vô hướng theo posId và lưu quan hệ kề tam giác
  const edgeCounts = new Map();
  const adjSet = new Array(numPos);
  const allTrisPos = [];

  const makeEdgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const addAdj = (a, b) => {
    if (!adjSet[a]) adjSet[a] = new Set();
    if (!adjSet[b]) adjSet[b] = new Set();
    adjSet[a].add(b);
    adjSet[b].add(a);
  };

  for (const idxInfo of primIndicesList) {
    const idx = idxInfo.data;
    const nTri = Math.floor(idx.length / 3);
    for (let t = 0; t < nTri; t++) {
      const p0 = posIdOfVert[idx[t * 3]];
      const p1 = posIdOfVert[idx[t * 3 + 1]];
      const p2 = posIdOfVert[idx[t * 3 + 2]];
      if (p0 === p1 || p1 === p2 || p2 === p0) continue;

      const ax = uniqueCoords[p0 * 3], ay = uniqueCoords[p0 * 3 + 1], az = uniqueCoords[p0 * 3 + 2];
      const bx = uniqueCoords[p1 * 3], by = uniqueCoords[p1 * 3 + 1], bz = uniqueCoords[p1 * 3 + 2];
      const cx = uniqueCoords[p2 * 3], cy = uniqueCoords[p2 * 3 + 1], cz = uniqueCoords[p2 * 3 + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      const area2 = Math.hypot(fnx, fny, fnz);
      if (area2 < 1e-12 * diag * diag) continue;

      const k01 = makeEdgeKey(p0, p1);
      const k12 = makeEdgeKey(p1, p2);
      const k20 = makeEdgeKey(p2, p0);
      edgeCounts.set(k01, (edgeCounts.get(k01) || 0) + 1);
      edgeCounts.set(k12, (edgeCounts.get(k12) || 0) + 1);
      edgeCounts.set(k20, (edgeCounts.get(k20) || 0) + 1);
      addAdj(p0, p1);
      addAdj(p1, p2);
      addAdj(p2, p0);

      allTrisPos.push({
        p0, p1, p2,
        area2,
        ux: fnx / area2,
        uy: fny / area2,
        uz: fnz / area2
      });
    }
  }

  const isOpenPos = new Uint8Array(numPos);
  const openEdges = [];
  edgeCounts.forEach((cnt, key) => {
    if (cnt === 1) {
      const sep = key.indexOf('_');
      const a = Number(key.slice(0, sep));
      const b = Number(key.slice(sep + 1));
      isOpenPos[a] = 1;
      isOpenPos[b] = 1;
      openEdges.push([a, b]);
    }
  });

  const openList = [];
  for (let p = 0; p < numPos; p++) {
    if (isOpenPos[p]) openList.push(p);
  }
  if (openList.length < 2) return false;

  // Liên kết mỗi open posId tới các tam giác chứa nó để kiểm tra bảo toàn pháp tuyến
  const incidentTris = new Map();
  for (let ti = 0; ti < allTrisPos.length; ti++) {
    const tr = allTrisPos[ti];
    if (isOpenPos[tr.p0]) {
      let arr = incidentTris.get(tr.p0);
      if (!arr) { arr = []; incidentTris.set(tr.p0, arr); }
      arr.push(tr);
    }
    if (isOpenPos[tr.p1]) {
      let arr = incidentTris.get(tr.p1);
      if (!arr) { arr = []; incidentTris.set(tr.p1, arr); }
      arr.push(tr);
    }
    if (isOpenPos[tr.p2]) {
      let arr = incidentTris.get(tr.p2);
      if (!arr) { arr = []; incidentTris.set(tr.p2, arr); }
      arr.push(tr);
    }
  }

  const curCoords = new Float64Array(uniqueCoords);
  const parent = new Int32Array(numPos);
  for (let i = 0; i < numPos; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const checkMoveValid = (movedSet, nx, ny, nz) => {
    for (const pid of movedSet) {
      const tris = incidentTris.get(pid);
      if (!tris) continue;
      for (const tr of tris) {
        const r0 = find(tr.p0), r1 = find(tr.p1), r2 = find(tr.p2);
        const m0 = movedSet.has(r0), m1 = movedSet.has(r1), m2 = movedSet.has(r2);
        if ((m0 && m1) || (m1 && m2) || (m0 && m2)) return false;
        const ax = m0 ? nx : curCoords[r0 * 3];
        const ay = m0 ? ny : curCoords[r0 * 3 + 1];
        const az = m0 ? nz : curCoords[r0 * 3 + 2];
        const bx = m1 ? nx : curCoords[r1 * 3];
        const by = m1 ? ny : curCoords[r1 * 3 + 1];
        const bz = m1 ? nz : curCoords[r1 * 3 + 2];
        const cx = m2 ? nx : curCoords[r2 * 3];
        const cy = m2 ? ny : curCoords[r2 * 3 + 1];
        const cz = m2 ? nz : curCoords[r2 * 3 + 2];

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        const fnx = e1y * e2z - e1z * e2y;
        const fny = e1z * e2x - e1x * e2z;
        const fnz = e1x * e2y - e1y * e2x;
        const newArea2 = Math.hypot(fnx, fny, fnz);
        if (newArea2 < tr.area2 * 0.45) return false;
        const dot = (fnx * tr.ux + fny * tr.uy + fnz * tr.uz) / newArea2;
        if (dot < 0.88) return false;
      }
    }
    return true;
  };

  // Pass 1A: Hàn cặp đỉnh biên hở trong bán kính <= 0.003 * diag
  const weldEps = diag * 0.003;
  const weldEpsSq = weldEps * weldEps;
  const invCell = 1.0 / weldEps;
  const grid = new Map();

  for (const pid of openList) {
    const gx = Math.floor(curCoords[pid * 3] * invCell);
    const gy = Math.floor(curCoords[pid * 3 + 1] * invCell);
    const gz = Math.floor(curCoords[pid * 3 + 2] * invCell);
    const gk = `${gx},${gy},${gz}`;
    let cell = grid.get(gk);
    if (!cell) { cell = []; grid.set(gk, cell); }
    cell.push(pid);
  }

  const pairs = [];
  for (let idxA = 0; idxA < openList.length; idxA++) {
    const a = openList[idxA];
    const ax = curCoords[a * 3], ay = curCoords[a * 3 + 1], az = curCoords[a * 3 + 2];
    const gx = Math.floor(ax * invCell);
    const gy = Math.floor(ay * invCell);
    const gz = Math.floor(az * invCell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!cell) continue;
          for (const b of cell) {
            if (b <= a) continue;
            if (adjSet[a]?.has(b)) continue;
            const ddx = curCoords[b * 3] - ax;
            const ddy = curCoords[b * 3 + 1] - ay;
            const ddz = curCoords[b * 3 + 2] - az;
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 <= weldEpsSq) {
              pairs.push({ a, b, d2 });
            }
          }
        }
      }
    }
  }

  pairs.sort((p, q) => p.d2 - q.d2);
  const clusterMembers = new Map();
  for (const pid of openList) clusterMembers.set(pid, [pid]);

  let changed = false;
  for (const pr of pairs) {
    const ra = find(pr.a);
    const rb = find(pr.b);
    if (ra === rb) continue;
    const memA = clusterMembers.get(ra) || [ra];
    const memB = clusterMembers.get(rb) || [rb];
    if (memA.length + memB.length > 8) continue;

    // Đảm bảo không có 2 thành viên nào trong cụm mới cùng thuộc 1 tam giác
    let sharesEdge = false;
    for (const ma of memA) {
      const adj = adjSet[ma];
      if (!adj) continue;
      for (const mb of memB) {
        if (adj.has(mb)) { sharesEdge = true; break; }
      }
      if (sharesEdge) break;
    }
    if (sharesEdge) continue;

    const ddx = curCoords[rb * 3] - curCoords[ra * 3];
    const ddy = curCoords[rb * 3 + 1] - curCoords[ra * 3 + 1];
    const ddz = curCoords[rb * 3 + 2] - curCoords[ra * 3 + 2];
    if (ddx * ddx + ddy * ddy + ddz * ddz > weldEpsSq) continue;

    const mx = 0.5 * (curCoords[ra * 3] + curCoords[rb * 3]);
    const my = 0.5 * (curCoords[ra * 3 + 1] + curCoords[rb * 3 + 1]);
    const mz = 0.5 * (curCoords[ra * 3 + 2] + curCoords[rb * 3 + 2]);
    const movedSet = new Set([...memA, ...memB, ra, rb]);

    if (!checkMoveValid(movedSet, mx, my, mz)) continue;

    parent[rb] = ra;
    curCoords[ra * 3] = mx;
    curCoords[ra * 3 + 1] = my;
    curCoords[ra * 3 + 2] = mz;
    for (const mb of memB) {
      curCoords[mb * 3] = mx;
      curCoords[mb * 3 + 1] = my;
      curCoords[mb * 3 + 2] = mz;
      memA.push(mb);
    }
    for (const ma of memA) {
      curCoords[ma * 3] = mx;
      curCoords[ma * 3 + 1] = my;
      curCoords[ma * 3 + 2] = mz;
    }
    clusterMembers.delete(rb);
    changed = true;
  }

  // Pass 1B: Khép khe T-junction của đỉnh biên hở lên cạnh biên hở đối diện (<= 0.002 * diag)
  const tEps = diag * 0.002;
  const tEpsSq = tEps * tEps;
  const tInvCell = 1.0 / tEps;
  const tGrid = new Map();
  const activeRoots = [];
  const seenRoot = new Set();

  for (const pid of openList) {
    const r = find(pid);
    if (seenRoot.has(r)) continue;
    seenRoot.add(r);
    activeRoots.push(r);
    const gx = Math.floor(curCoords[r * 3] * tInvCell);
    const gy = Math.floor(curCoords[r * 3 + 1] * tInvCell);
    const gz = Math.floor(curCoords[r * 3 + 2] * tInvCell);
    const gk = `${gx},${gy},${gz}`;
    let cell = tGrid.get(gk);
    if (!cell) { cell = []; tGrid.set(gk, cell); }
    cell.push(r);
  }

  const maxSegLenSq = (diag * 0.15) * (diag * 0.15);
  const minSegLenSq = (tEps * 1.5) * (tEps * 1.5);

  for (const [e0, e1] of openEdges) {
    const r0 = find(e0);
    const r1 = find(e1);
    if (r0 === r1) continue;
    const ax = curCoords[r0 * 3], ay = curCoords[r0 * 3 + 1], az = curCoords[r0 * 3 + 2];
    const bx = curCoords[r1 * 3], by = curCoords[r1 * 3 + 1], bz = curCoords[r1 * 3 + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    if (lenSq < minSegLenSq || lenSq > maxSegLenSq) continue;

    const minGx = Math.floor((Math.min(ax, bx) - tEps) * tInvCell);
    const maxGx = Math.floor((Math.max(ax, bx) + tEps) * tInvCell);
    const minGy = Math.floor((Math.min(ay, by) - tEps) * tInvCell);
    const maxGy = Math.floor((Math.max(ay, by) + tEps) * tInvCell);
    const minGz = Math.floor((Math.min(az, bz) - tEps) * tInvCell);
    const maxGz = Math.floor((Math.max(az, bz) + tEps) * tInvCell);
    if ((maxGx - minGx + 1) * (maxGy - minGy + 1) * (maxGz - minGz + 1) > 512) continue;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const cell = tGrid.get(`${gx},${gy},${gz}`);
          if (!cell) continue;
          for (const rp of cell) {
            if (rp === r0 || rp === r1) continue;
            const px = curCoords[rp * 3], py = curCoords[rp * 3 + 1], pz = curCoords[rp * 3 + 2];
            const t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
            if (t <= 0.05 || t >= 0.95) continue;
            const qx = ax + t * abx;
            const qy = ay + t * aby;
            const qz = az + t * abz;
            const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy) + (pz - qz) * (pz - qz);
            if (d2 > tEpsSq) continue;

            const memP = clusterMembers.get(rp) || [rp];
            let shares = false;
            for (const mp of memP) {
              if (adjSet[mp]?.has(r0) || adjSet[mp]?.has(r1) || adjSet[mp]?.has(e0) || adjSet[mp]?.has(e1)) {
                shares = true;
                break;
              }
            }
            if (shares) continue;

            const movedSet = new Set([...memP, rp]);
            if (!checkMoveValid(movedSet, qx, qy, qz)) continue;

            curCoords[rp * 3] = qx;
            curCoords[rp * 3 + 1] = qy;
            curCoords[rp * 3 + 2] = qz;
            for (const mp of memP) {
              curCoords[mp * 3] = qx;
              curCoords[mp * 3 + 1] = qy;
              curCoords[mp * 3 + 2] = qz;
            }
            changed = true;
          }
        }
      }
    }
  }

  if (!changed) return false;

  for (let v = 0; v < numVerts; v++) {
    const pid = posIdOfVert[v];
    if (!isOpenPos[pid]) continue;
    const r = find(pid);
    pos[v * 3] = curCoords[r * 3];
    pos[v * 3 + 1] = curCoords[r * 3 + 1];
    pos[v * 3 + 2] = curCoords[r * 3 + 2];
  }
  return true;
}

/**
 * Chuẩn hóa tập primitive dùng chung bộ đệm POSITION/NORMAL.
 */
function sanitizePrimitiveGroup(gltf, binBuf, extraChunks, extraState, group) {
  const posInfo = readFloatAccessor(gltf, binBuf, group.posAccIdx);
  if (!posInfo || posInfo.comps !== 3 || posInfo.count === 0) return false;

  const numVerts = posInfo.count;
  const pos = posInfo.data;
  let normInfo = group.normAccIdx !== undefined ? readFloatAccessor(gltf, binBuf, group.normAccIdx) : null;
  if (normInfo && (normInfo.comps !== 3 || normInfo.count !== numVerts)) normInfo = null;

  // Tính hộp bao & đường chéo
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let v = 0; v < numVerts; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (!Number.isFinite(x)) { x = 0; pos[v * 3] = 0; }
    if (!Number.isFinite(y)) { y = 0; pos[v * 3 + 1] = 0; }
    if (!Number.isFinite(z)) { z = 0; pos[v * 3 + 2] = 0; }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  if (!Number.isFinite(diag) || diag < 1e-9) return false;

  const primEntries = [];
  for (const prim of group.prims) {
    if (prim.indices === undefined) continue;
    const idxInfo = readIndexAccessor(gltf, binBuf, prim.indices);
    if (!idxInfo || idxInfo.count < 3) continue;
    primEntries.push({ prim, idxInfo });
  }
  if (primEntries.length === 0) return false;

  let modified = false;

  // 1. Hàn khe biên UV seam trên mesh tĩnh (không skinning, không morph targets)
  if (!group.hasSkin && !group.hasMorph) {
    const welded = weldOpenBoundarySeams(
      pos,
      numVerts,
      primEntries.map((e) => e.idxInfo),
      diag
    );
    if (welded) {
      writeFloatAccessor(binBuf, posInfo, true);
      modified = true;
    }
  }

  // 2. Chuẩn bị mảng pháp tuyến đỉnh
  const norm = normInfo ? normInfo.data : new Float32Array(numVerts * 3);
  const hasValidN = new Uint8Array(numVerts);
  let normModified = !normInfo;

  if (normInfo) {
    for (let v = 0; v < numVerts; v++) {
      const nx = norm[v * 3], ny = norm[v * 3 + 1], nz = norm[v * 3 + 2];
      const lenSq = nx * nx + ny * ny + nz * nz;
      if (Number.isFinite(lenSq) && lenSq > 1e-10) {
        const inv = 1.0 / Math.sqrt(lenSq);
        norm[v * 3] = nx * inv;
        norm[v * 3 + 1] = ny * inv;
        norm[v * 3 + 2] = nz * inv;
        hasValidN[v] = 1;
      } else {
        norm[v * 3] = 0;
        norm[v * 3 + 1] = 0;
        norm[v * 3 + 2] = 0;
        normModified = true;
      }
    }
  }

  // 3. Lọc tam giác suy biến & căn chỉnh chiều quấn tam giác sơ bộ theo pháp tuyến đỉnh đã có
  const minAreaSq = Math.max(1e-28, (diag * 1e-11) * (diag * 1e-11));
  const accFn = new Float64Array(numVerts * 3);
  const cleanedPerPrim = [];

  for (const entry of primEntries) {
    const src = entry.idxInfo.data;
    const nTri = Math.floor(entry.idxInfo.count / 3);
    const dst = new Uint32Array(nTri * 3);
    let outCount = 0;
    let idxChanged = false;

    for (let t = 0; t < nTri; t++) {
      let i0 = src[t * 3];
      let i1 = src[t * 3 + 1];
      let i2 = src[t * 3 + 2];
      if (i0 >= numVerts || i1 >= numVerts || i2 >= numVerts || i0 === i1 || i1 === i2 || i0 === i2) {
        idxChanged = true;
        continue;
      }

      const p0x = pos[i0 * 3], p0y = pos[i0 * 3 + 1], p0z = pos[i0 * 3 + 2];
      const e1x = pos[i1 * 3] - p0x, e1y = pos[i1 * 3 + 1] - p0y, e1z = pos[i1 * 3 + 2] - p0z;
      const e2x = pos[i2 * 3] - p0x, e2y = pos[i2 * 3 + 1] - p0y, e2z = pos[i2 * 3 + 2] - p0z;
      let fnx = e1y * e2z - e1z * e2y;
      let fny = e1z * e2x - e1x * e2z;
      let fnz = e1x * e2y - e1y * e2x;
      const fnLenSq = fnx * fnx + fny * fny + fnz * fnz;
      if (!Number.isFinite(fnLenSq) || fnLenSq <= minAreaSq) {
        idxChanged = true;
        continue;
      }

      const vnx = norm[i0 * 3] + norm[i1 * 3] + norm[i2 * 3];
      const vny = norm[i0 * 3 + 1] + norm[i1 * 3 + 1] + norm[i2 * 3 + 1];
      const vnz = norm[i0 * 3 + 2] + norm[i1 * 3 + 2] + norm[i2 * 3 + 2];
      const vnLenSq = vnx * vnx + vny * vny + vnz * vnz;

      if (vnLenSq > 1e-8 && fnx * vnx + fny * vny + fnz * vnz < 0) {
        const tmp = i1; i1 = i2; i2 = tmp;
        fnx = -fnx; fny = -fny; fnz = -fnz;
        idxChanged = true;
      }

      dst[outCount++] = i0;
      dst[outCount++] = i1;
      dst[outCount++] = i2;

      accFn[i0 * 3] += fnx; accFn[i0 * 3 + 1] += fny; accFn[i0 * 3 + 2] += fnz;
      accFn[i1 * 3] += fnx; accFn[i1 * 3 + 1] += fny; accFn[i1 * 3 + 2] += fnz;
      accFn[i2 * 3] += fnx; accFn[i2 * 3 + 1] += fny; accFn[i2 * 3 + 2] += fnz;
    }

    if (outCount !== entry.idxInfo.count) idxChanged = true;
    cleanedPerPrim.push({ entry, dst, outCount, idxChanged });
  }

  // 4. Khôi phục pháp tuyến đỉnh suy biến hoặc lệch ngược (>83 độ) so với mặt định hướng
  for (let v = 0; v < numVerts; v++) {
    const fx = accFn[v * 3], fy = accFn[v * 3 + 1], fz = accFn[v * 3 + 2];
    const fLen = Math.hypot(fx, fy, fz);
    if (!hasValidN[v]) {
      if (fLen > 1e-18) {
        norm[v * 3] = fx / fLen;
        norm[v * 3 + 1] = fy / fLen;
        norm[v * 3 + 2] = fz / fLen;
      } else {
        norm[v * 3] = 0;
        norm[v * 3 + 1] = 1;
        norm[v * 3 + 2] = 0;
      }
      normModified = true;
    } else if (fLen > 1e-18) {
      const fux = fx / fLen, fuy = fy / fLen, fuz = fz / fLen;
      const dot = norm[v * 3] * fux + norm[v * 3 + 1] * fuy + norm[v * 3 + 2] * fuz;
      if (dot < 0.12) {
        norm[v * 3] = fux;
        norm[v * 3 + 1] = fuy;
        norm[v * 3 + 2] = fuz;
        normModified = true;
      }
    }
  }

  // 4b. Làm mượt pháp tuyến trên đường may UV phẳng (chỉ khi hai mặt kề lệch < 38 độ)
  if (!group.hasSkin && !group.hasMorph) {
    const seamInv = 1.0 / Math.max(diag * 1e-5, 1e-9);
    const posGroups = new Map();
    for (let v = 0; v < numVerts; v++) {
      const k = `${Math.round(pos[v * 3] * seamInv)},${Math.round(pos[v * 3 + 1] * seamInv)},${Math.round(pos[v * 3 + 2] * seamInv)}`;
      let arr = posGroups.get(k);
      if (!arr) { arr = []; posGroups.set(k, arr); }
      arr.push(v);
    }
    posGroups.forEach((verts) => {
      if (verts.length < 2 || verts.length > 16) return;
      let gx = 0, gy = 0, gz = 0;
      const v0 = verts[0];
      const refX = norm[v0 * 3], refY = norm[v0 * 3 + 1], refZ = norm[v0 * 3 + 2];
      for (let i = 0; i < verts.length; i++) {
        const vi = verts[i];
        const nx = norm[vi * 3], ny = norm[vi * 3 + 1], nz = norm[vi * 3 + 2];
        if (nx * refX + ny * refY + nz * refZ < 0.78) return; // Giữ nguyên cạnh sắc kiến trúc
        gx += nx; gy += ny; gz += nz;
      }
      const gLen = Math.hypot(gx, gy, gz);
      if (gLen < 1e-6) return;
      gx /= gLen; gy /= gLen; gz /= gLen;
      for (const vi of verts) {
        const bx = 0.55 * norm[vi * 3] + 0.45 * gx;
        const by = 0.55 * norm[vi * 3 + 1] + 0.45 * gy;
        const bz = 0.55 * norm[vi * 3 + 2] + 0.45 * gz;
        const bLen = Math.hypot(bx, by, bz) || 1;
        norm[vi * 3] = bx / bLen;
        norm[vi * 3 + 1] = by / bLen;
        norm[vi * 3 + 2] = bz / bLen;
      }
      normModified = true;
    });
  }

  // 5. Đảm bảo tuyệt đối 100% tam giác có dot(fn, vn) >= 0 và ghi lại chỉ số
  for (const item of cleanedPerPrim) {
    const { entry, dst, outCount } = item;
    let idxChanged = item.idxChanged;
    const nTri = outCount / 3;
    for (let t = 0; t < nTri; t++) {
      const i0 = dst[t * 3];
      const i1 = dst[t * 3 + 1];
      const i2 = dst[t * 3 + 2];
      const p0x = pos[i0 * 3], p0y = pos[i0 * 3 + 1], p0z = pos[i0 * 3 + 2];
      const e1x = pos[i1 * 3] - p0x, e1y = pos[i1 * 3 + 1] - p0y, e1z = pos[i1 * 3 + 2] - p0z;
      const e2x = pos[i2 * 3] - p0x, e2y = pos[i2 * 3 + 1] - p0y, e2z = pos[i2 * 3 + 2] - p0z;
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      const vnx = norm[i0 * 3] + norm[i1 * 3] + norm[i2 * 3];
      const vny = norm[i0 * 3 + 1] + norm[i1 * 3 + 1] + norm[i2 * 3 + 1];
      const vnz = norm[i0 * 3 + 2] + norm[i1 * 3 + 2] + norm[i2 * 3 + 2];
      if (fnx * vnx + fny * vny + fnz * vnz < 0) {
        dst[t * 3 + 1] = i2;
        dst[t * 3 + 2] = i1;
        idxChanged = true;
      }
    }
    if (idxChanged) {
      writeIndexAccessorInPlace(binBuf, entry.idxInfo, dst, outCount);
      modified = true;
    }
  }

  if (normModified) {
    if (normInfo) {
      writeFloatAccessor(binBuf, normInfo, true);
    } else if (!group.hasMorph) {
      const newNormAccIdx = appendAlignedBufferAccessor(gltf, extraChunks, extraState, norm, 5126, 'VEC3', 34962);
      for (const prim of group.prims) {
        prim.attributes.NORMAL = newNormAccIdx;
      }
    }
    modified = true;
  }

  // 6. Bổ sung hoặc sửa TANGENT trực chuẩn (khi có TEXCOORD_0 và không có morph targets)
  if (!group.hasMorph) {
    const firstUvAcc = group.prims[0]?.attributes?.TEXCOORD_0;
    const allShareUv = firstUvAcc !== undefined && group.prims.every((p) => p.attributes?.TEXCOORD_0 === firstUvAcc);
    const existingTanAcc = group.prims[0]?.attributes?.TANGENT;

    if (existingTanAcc !== undefined) {
      const tanInfo = readFloatAccessor(gltf, binBuf, existingTanAcc);
      if (tanInfo && tanInfo.comps === 4 && tanInfo.count === numVerts) {
        let tanFixed = false;
        const td = tanInfo.data;
        for (let v = 0; v < numVerts; v++) {
          const tx = td[v * 4], ty = td[v * 4 + 1], tz = td[v * 4 + 2], tw = td[v * 4 + 3];
          const lenSq = tx * tx + ty * ty + tz * tz;
          if (!Number.isFinite(lenSq) || !Number.isFinite(tw) || lenSq < 1e-8 || Math.abs(tw) < 1e-4) {
            const fb = makeOrthonormalTangent(norm[v * 3], norm[v * 3 + 1], norm[v * 3 + 2]);
            td[v * 4] = fb[0]; td[v * 4 + 1] = fb[1]; td[v * 4 + 2] = fb[2]; td[v * 4 + 3] = fb[3];
            tanFixed = true;
          }
        }
        if (tanFixed) {
          writeFloatAccessor(binBuf, tanInfo, false);
          modified = true;
        }
      }
    } else if (allShareUv) {
      const uvInfo = readFloatAccessor(gltf, binBuf, firstUvAcc);
      if (uvInfo && uvInfo.comps === 2 && uvInfo.count === numVerts) {
        const uv = uvInfo.data;
        const tan1 = new Float64Array(numVerts * 3);
        const tan2 = new Float64Array(numVerts * 3);

        for (const item of cleanedPerPrim) {
          const { dst, outCount } = item;
          const nTri = outCount / 3;
          for (let t = 0; t < nTri; t++) {
            const i0 = dst[t * 3], i1 = dst[t * 3 + 1], i2 = dst[t * 3 + 2];
            const du1 = uv[i1 * 2] - uv[i0 * 2];
            const dv1 = uv[i1 * 2 + 1] - uv[i0 * 2 + 1];
            const du2 = uv[i2 * 2] - uv[i0 * 2];
            const dv2 = uv[i2 * 2 + 1] - uv[i0 * 2 + 1];
            const uvArea = du1 * dv2 - du2 * dv1;
            if (!Number.isFinite(uvArea) || Math.abs(uvArea) < 1e-9) continue;

            const x1 = pos[i1 * 3] - pos[i0 * 3];
            const y1 = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
            const z1 = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
            const x2 = pos[i2 * 3] - pos[i0 * 3];
            const y2 = pos[i2 * 3 + 1] - pos[i0 * 3 + 1];
            const z2 = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];

            const triArea3D = Math.hypot(
              y1 * z2 - z1 * y2,
              z1 * x2 - x1 * z2,
              x1 * y2 - y1 * x2
            );
            if (triArea3D <= 1e-14) continue;

            const sgn = uvArea > 0 ? 1.0 : -1.0;
            let sx = (dv2 * x1 - dv1 * x2) * sgn;
            let sy = (dv2 * y1 - dv1 * y2) * sgn;
            let sz = (dv2 * z1 - dv1 * z2) * sgn;
            const sLen = Math.hypot(sx, sy, sz);
            if (sLen <= 1e-12) continue;
            const sw = triArea3D / sLen;
            sx *= sw; sy *= sw; sz *= sw;

            let tx = (du1 * x2 - du2 * x1) * sgn;
            let ty = (du1 * y2 - du2 * y1) * sgn;
            let tz = (du1 * z2 - du2 * z1) * sgn;
            const tLen = Math.hypot(tx, ty, tz) || 1;
            const tw = triArea3D / tLen;
            tx *= tw; ty *= tw; tz *= tw;

            tan1[i0 * 3] += sx; tan1[i0 * 3 + 1] += sy; tan1[i0 * 3 + 2] += sz;
            tan1[i1 * 3] += sx; tan1[i1 * 3 + 1] += sy; tan1[i1 * 3 + 2] += sz;
            tan1[i2 * 3] += sx; tan1[i2 * 3 + 1] += sy; tan1[i2 * 3 + 2] += sz;

            tan2[i0 * 3] += tx; tan2[i0 * 3 + 1] += ty; tan2[i0 * 3 + 2] += tz;
            tan2[i1 * 3] += tx; tan2[i1 * 3 + 1] += ty; tan2[i1 * 3 + 2] += tz;
            tan2[i2 * 3] += tx; tan2[i2 * 3 + 1] += ty; tan2[i2 * 3 + 2] += tz;
          }
        }

        const outTan = new Float32Array(numVerts * 4);
        for (let v = 0; v < numVerts; v++) {
          const nx = norm[v * 3], ny = norm[v * 3 + 1], nz = norm[v * 3 + 2];
          const t1x = tan1[v * 3], t1y = tan1[v * 3 + 1], t1z = tan1[v * 3 + 2];
          const ndott = nx * t1x + ny * t1y + nz * t1z;
          const ox = t1x - nx * ndott;
          const oy = t1y - ny * ndott;
          const oz = t1z - nz * ndott;
          const oLen = Math.hypot(ox, oy, oz);
          if (oLen > 1e-5) {
            const ux = ox / oLen, uy = oy / oLen, uz = oz / oLen;
            const cx = ny * uz - nz * uy;
            const cy = nz * ux - nx * uz;
            const cz = nx * uy - ny * ux;
            const w = cx * tan2[v * 3] + cy * tan2[v * 3 + 1] + cz * tan2[v * 3 + 2] < 0 ? -1.0 : 1.0;
            outTan[v * 4] = ux;
            outTan[v * 4 + 1] = uy;
            outTan[v * 4 + 2] = uz;
            outTan[v * 4 + 3] = w;
          } else {
            const fb = makeOrthonormalTangent(nx, ny, nz);
            outTan[v * 4] = fb[0];
            outTan[v * 4 + 1] = fb[1];
            outTan[v * 4 + 2] = fb[2];
            outTan[v * 4 + 3] = fb[3];
          }
        }

        const tanAccIdx = appendAlignedBufferAccessor(gltf, extraChunks, extraState, outTan, 5126, 'VEC4', 34962);
        for (const prim of group.prims) {
          prim.attributes.TANGENT = tanAccIdx;
        }
        modified = true;
      }
    }
  }

  return modified;
}

/**
 * Đọc nhanh header JSON của GLB để kiểm tra đã được chuẩn hóa phiên bản mới nhất chưa.
 */
function isGlbAlreadySanitized(buf) {
  if (!buf || buf.length < 28) return false;
  if (buf.readUInt32LE(0) !== GLB_MAGIC || buf.readUInt32LE(4) !== 2) return false;
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== JSON_CHUNK_TYPE || 20 + jsonLen > buf.length) return false;
  try {
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    return gltf?.asset?.extras?._aitypeSanitized === SANITIZER_VERSION;
  } catch {
    return false;
  }
}

/**
 * Chuẩn hóa toàn bộ Buffer GLB 2.0 và trả về Buffer mới (hoặc Buffer gốc nếu không phải GLB mesh).
 */
function sanitizeGlbBuffer(inputBuffer, options = {}) {
  try {
    const buf = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
    if (buf.length < 28) return buf;
    if (buf.readUInt32LE(0) !== GLB_MAGIC || buf.readUInt32LE(4) !== 2) return buf;

    const jsonLen = buf.readUInt32LE(12);
    const jsonType = buf.readUInt32LE(16);
    if (jsonType !== JSON_CHUNK_TYPE || 20 + jsonLen > buf.length) return buf;

    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    if (!options.force && gltf?.asset?.extras?._aitypeSanitized === SANITIZER_VERSION) {
      return buf;
    }

    // Bỏ qua file chỉ chứa animation clip mà không có mesh
    if (!Array.isArray(gltf.meshes) || gltf.meshes.length === 0) {
      return buf;
    }

    const binHeaderOff = 20 + jsonLen;
    if (binHeaderOff + 8 > buf.length) return buf;
    const binLen = buf.readUInt32LE(binHeaderOff);
    const binType = buf.readUInt32LE(binHeaderOff + 4);
    if (binType !== BIN_CHUNK_TYPE || binHeaderOff + 8 + binLen > buf.length) return buf;

    const binBuf = Buffer.from(buf.subarray(binHeaderOff + 8, binHeaderOff + 8 + binLen));
    const extraChunks = [];
    const extraState = { offset: binBuf.length };

    // Chuẩn hóa vật liệu bị gán nhầm BLEND/MASK khi dùng ảnh JPEG (không có kênh alpha)
    if (Array.isArray(gltf.materials)) {
      for (const mat of gltf.materials) {
        if (!mat) continue;
        mat.doubleSided = true;
        const pbr = mat.pbrMetallicRoughness;
        const alphaFactor = Array.isArray(pbr?.baseColorFactor) ? pbr.baseColorFactor[3] : 1.0;
        const texIdx = pbr?.baseColorTexture?.index;
        const imgIdx = texIdx !== undefined ? gltf.textures?.[texIdx]?.source : undefined;
        const mime = imgIdx !== undefined ? gltf.images?.[imgIdx]?.mimeType : undefined;
        const hasTransmission = !!(mat.extensions?.KHR_materials_transmission || mat.extensions?.KHR_materials_volume);
        if ((mat.alphaMode === 'BLEND' || mat.alphaMode === 'MASK') && !hasTransmission && alphaFactor >= 0.95 && mime === 'image/jpeg') {
          delete mat.alphaMode;
          delete mat.alphaCutoff;
        }
      }
    }

    // Gom nhóm primitive theo cặp (POSITION, NORMAL) để xử lý đồng bộ trên buffer dùng chung
    const hasGlobalSkins = Array.isArray(gltf.skins) && gltf.skins.length > 0;
    const groups = new Map();

    for (const mesh of gltf.meshes) {
      if (!mesh || !Array.isArray(mesh.primitives)) continue;
      for (const prim of mesh.primitives) {
        if (!prim || !prim.attributes) continue;
        const mode = prim.mode === undefined ? 4 : prim.mode;
        if (mode !== 4) continue;
        if (prim.extensions?.KHR_draco_mesh_compression || prim.extensions?.EXT_meshopt_compression) continue;
        const posAcc = prim.attributes.POSITION;
        if (posAcc === undefined || prim.indices === undefined) continue;
        const normAcc = prim.attributes.NORMAL;
        const key = `${posAcc}:${normAcc ?? 'none'}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            posAccIdx: posAcc,
            normAccIdx: normAcc,
            hasSkin: hasGlobalSkins,
            hasMorph: false,
            prims: []
          };
          groups.set(key, g);
        }
        if (prim.attributes.JOINTS_0 !== undefined || prim.attributes.WEIGHTS_0 !== undefined) {
          g.hasSkin = true;
        }
        if (Array.isArray(prim.targets) && prim.targets.length > 0) {
          g.hasMorph = true;
        }
        g.prims.push(prim);
      }
    }

    groups.forEach((group) => {
      sanitizePrimitiveGroup(gltf, binBuf, extraChunks, extraState, group);
    });

    gltf.asset = gltf.asset || { version: '2.0' };
    gltf.asset.extras = { ...(gltf.asset.extras || {}), _aitypeSanitized: SANITIZER_VERSION };

    const totalBinRaw = extraState.offset;
    const binPad = (4 - (totalBinRaw % 4)) % 4;
    if (binPad > 0) extraChunks.push(Buffer.alloc(binPad));
    const finalBinLen = totalBinRaw + binPad;

    if (Array.isArray(gltf.buffers) && gltf.buffers[0]) {
      gltf.buffers[0].byteLength = totalBinRaw;
    }

    const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const finalJsonLen = jsonRaw.length + jsonPad;
    const jsonPadBuf = jsonPad > 0 ? Buffer.alloc(jsonPad, 0x20) : Buffer.alloc(0);

    const totalLength = 12 + 8 + finalJsonLen + 8 + finalBinLen;
    const header = Buffer.alloc(20);
    header.writeUInt32LE(GLB_MAGIC, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);
    header.writeUInt32LE(finalJsonLen, 12);
    header.writeUInt32LE(JSON_CHUNK_TYPE, 16);

    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(finalBinLen, 0);
    binChunkHeader.writeUInt32LE(BIN_CHUNK_TYPE, 4);

    return Buffer.concat([header, jsonRaw, jsonPadBuf, binChunkHeader, binBuf, ...extraChunks], totalLength);
  } catch (err) {
    console.warn('[GlbSanitizer] Sanitize fallback to original buffer:', err?.message || err);
    return Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
  }
}

/**
 * Chuẩn hóa tệp GLB trên đĩa nếu chưa có dấu _aitypeSanitized hiện hành.
 * Bỏ qua các tệp chỉ chứa animation trong thư mục /anims/.
 */
function ensureGlbFileSanitized(filePath) {
  const buf = fs.readFileSync(filePath);
  if (/[/\\]anims[/\\]/i.test(filePath) || isGlbAlreadySanitized(buf)) {
    return buf;
  }
  const sanitized = sanitizeGlbBuffer(buf);
  if (sanitized !== buf) {
    try {
      const tmpPath = `${filePath}.tmp_${process.pid}`;
      fs.writeFileSync(tmpPath, sanitized);
      fs.renameSync(tmpPath, filePath);
    } catch (_) {
      // Nếu thư mục chỉ đọc thì vẫn trả về buffer đã chuẩn hóa trên RAM
    }
  }
  return sanitized;
}

module.exports = {
  SANITIZER_VERSION,
  isGlbAlreadySanitized,
  sanitizeGlbBuffer,
  ensureGlbFileSanitized
};
