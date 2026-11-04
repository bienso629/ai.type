// Kiểm tra ngữ nghĩa spawnParticles MỚI: rải đều + tự rơi + đọng restY
function makeSpawner(opts) {
  const o = opts || {};
  const count = Math.min(Math.max(Number(o.count) || 100, 1), 2000);
  const hasHost = !!o.hasHost;
  const center = o.center || { x: 0, y: 0, z: 0 };
  const radius = Math.max(Number(o.radius) || (hasHost ? 4.5 : 15), 0.5);
  const topY = Number(o.topY) || (hasHost ? Math.max(center.y, 0) + 7 : 16);
  const fsBase = Number(o.fallSpeed) > 0 ? Number(o.fallSpeed) : 1.5;
  const windX = (o.wind && Number(o.wind.x)) || 0;
  const settle = o.settle !== false;
  const autoFall = o.autoFall !== false;

  // colliders giả lập: sàn y=0 + một cái bàn 3x3 cao 1.0 tại (2,0,2)
  const colliders = [{ minX: 0.5, maxX: 3.5, minZ: 0.5, maxZ: 3.5, topY: 1.0 }];
  const restYAt = (x, z) => {
    let rest = 0;
    for (const c of colliders) if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
    return rest;
  };

  const arr = [];
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const p = {
      x: center.x + Math.cos(ang) * r,
      y: hasHost ? (center.y + 1.5 + Math.random() * 5.5) : (topY * (0.35 + 0.65 * Math.random())),
      z: center.z + Math.sin(ang) * r,
      vx: windX + (Math.random() - 0.5) * 0.4,
      vy: -(fsBase * (0.75 + Math.random() * 0.5)),
      vz: (Math.random() - 0.5) * 0.4,
      ph: Math.random() * Math.PI * 2,
      settled: false, restY: 0
    };
    p.restY = restYAt(p.x, p.z);
    if (p.y <= p.restY) p.y = p.restY + 0.01;
    arr.push(p);
  }

  if (autoFall) {
    return { arr, tick(dt) {
      for (const p of arr) {
        if (p.settled) continue;
        p.x += (p.vx || 0) * dt + Math.sin(p.ph) * 0.12 * dt;
        p.z += (p.vz || 0) * dt + Math.cos(p.ph * 0.8) * 0.12 * dt;
        p.y += (p.vy || -1.5) * dt;
        p.ph += dt * 2.2;
        if (p.y <= p.restY) {
          if (settle) { p.y = p.restY; p.settled = true; }
          else p.y = topY * (0.9 + 0.1 * Math.random());
        }
      }
    }};
  }
  return { arr, tick() {} };
}

// ===== KỊCH BẢN 1: tuyết phủ toàn scene, script chỉ spawn rồi bỏ đó =====
const s1 = makeSpawner({ count: 500, fallSpeed: 2.5 });
const n0 = s1.arr.filter(p => p.y > 0.5).length;
for (let f = 0; f < 600; f++) s1.tick(1 / 60); // 10 giây
const settled1 = s1.arr.filter(p => p.settled).length;
const onTable = s1.arr.filter(p => p.y === 1.0).length;
const floating = s1.arr.filter(p => !p.settled && p.y > 0.2 && p.y < 15).length;
console.log('KỊCH BẢN 1 (tuyết phủ scene):');
console.log('  Hạt ban đầu trên cao:', n0 + '/500');
console.log('  Sau 10s — đã đọng:', settled1 + '/500, đọng trên bàn (y=1):', onTable, ', còn lơ lửng:', floating);
console.log('  => ' + (settled1 === 500 && floating === 0 ? 'ĐẠT: không còn bông nào lơ lửng' : 'THẤT BẠI'));

// ===== KỊCH BẢN 2: tuyết quanh món đồ (center + radius) =====
const s2 = makeSpawner({ count: 200, hasHost: true, center: { x: 2, y: 0, z: 2 }, radius: 4.5, fallSpeed: 2 });
for (let f = 0; f < 600; f++) s2.tick(1 / 60);
const settled2 = s2.arr.filter(p => p.settled).length;
const minR = Math.min(...s2.arr.map(p => Math.hypot(p.x - 2, p.z - 2)));
console.log('KỊCH BẢN 2 (quanh món đồ tại 2,0,2):');
console.log('  Đã đọng:', settled2 + '/200; hạt gần tâm nhất:', minR.toFixed(2), 'm');
console.log('  => ' + (settled2 === 200 ? 'ĐẠT: hạt rơi xong đọng quanh món đồ' : 'THẤT BẠI'));

// ===== KỊCH BẢN 3: mưa (settle: false — chạm nhảy về đỉnh) =====
const s3 = makeSpawner({ count: 100, settle: false, fallSpeed: 8 });
for (let f = 0; f < 300; f++) s3.tick(1 / 60);
const recycled = s3.arr.filter(p => p.y > 10).length;
console.log('KỊCH BẢN 3 (mưa, settle:false):');
console.log('  Hạt đã tái sinh về đỉnh:', recycled + '/100 => ' + (recycled > 0 ? 'ĐẠT: rơi liên tục' : 'THẤT BẠI'));
