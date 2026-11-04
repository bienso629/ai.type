// Mo phong dung logic spawnParticles + physics sau khi vá.
// Scene giong phong that: san y[-0.1,0], ban y[0,1], tuong cao 32m, den tran 32.5m.
const topY = 16, center = {x:0,y:0,z:0}, radius = 15, hasHost = false;
const hardCapY = topY - 0.5;

// colliders "thô" như quét AABB mọi mesh (TRƯỚC khi lọc)
const rawColliders = [
  { minX:-0.1, maxX:40.1, minZ:-0.1, maxZ:40.1, topY:0, name:'san' },
  { minX:1.5, maxX:3.5, minZ:1, maxZ:3, topY:1, name:'ban' },
  { minX:-20.1, maxX:-20, minZ:-20, maxZ:20, topY:32, name:'tuong-trai' }, // cao 32m
  { minX:-0.5, maxX:0.5, minZ:-0.5, maxZ:0.5, topY:32.5, name:'den-tran' },
];

// ===== BỘ LỌC MỚI (patch) =====
const colliders = [];
for (const c of rawColliders) {
  if (c.maxX < center.x - radius || c.minX > center.x + radius) continue;
  if (c.maxZ < center.z - radius || c.minZ > center.z + radius) continue;
  const colH = c.topY - (c.minY || 0);
  const colFoot = (c.maxX - c.minX) * (c.maxZ - c.minZ);
  if (c.topY > topY + 1.5) { console.log('LOC  (tran/den):', c.name); continue; }
  if (colH > 2.2 * Math.max(0.05, topY - c.topY)) { console.log('LOC  (tuong):', c.name); continue; }
  if (colH < 0.02 && colFoot > 4 * radius * radius) { console.log('LOC  (dai mong):', c.name); continue; }
  if (colFoot > 400) { console.log('LOC  (mesh khong lo):', c.name); continue; }
  colliders.push(c);
}
const restYAt = (x, z) => {
  let rest = 0;
  for (const c of colliders) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
  }
  return rest;
};
const dynamicRestY = (x, z) => {
  let rest = restYAt(x, z);
  if (rest > hardCapY) rest = 0;
  return rest;
};

// ===== mo phong 300 hat rơi 25 giay =====
const parts = [];
for (let i = 0; i < 300; i++) {
  const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
  const p = { x: center.x + Math.cos(ang) * r, y: topY * (0.35 + 0.65 * Math.random()),
              z: center.z + Math.sin(ang) * r, vy: -1.6 * (0.75 + Math.random() * 0.5), settled: false };
  const rst = dynamicRestY(p.x, p.z);
  if (p.y <= rst) p.y = rst + 0.01;
  parts.push(p);
}
const dt = 1/60;
for (let f = 0; f < 1500; f++) {
  for (const p of parts) {
    if (p.settled) continue;
    p.y += p.vy * dt;
    const rst = dynamicRestY(p.x, p.z);
    if (p.y <= rst) { p.y = rst; p.settled = true; }
  }
}
// kiem tra: KHONG hat nao "dung im" tren 2m (tren ban 1m ma khong phai ban)
const frozen = parts.filter(p => p.y > 2.5 && p.y <= hardCapY);
const onFloor = parts.filter(p => p.y <= 0.01).length;
const onTable = parts.filter(p => p.y > 0.9 && p.y <= 1.01).length;
console.log('Tong hat:', parts.length);
console.log('Dong tren san:', onFloor, '| dong tren ban:', onTable);
console.log('Hat "dung im" giua troi (2.5m < y <= 15.5m):', frozen.length, frozen.length === 0 ? 'PASS' : 'FAIL — vi du y=' + frozen.slice(0,3).map(p=>p.y.toFixed(1)).join(', '));
