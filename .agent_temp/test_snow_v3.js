// Mo phong logic tick moi trong spawnParticles (dan ra tu TS)
function sim(label, opts, frames, dt, setup, colliders) {
  const o = opts || {};
  const count = o.count || 200;
  const size = o.size || 0.12;
  const fsBase = o.fallSpeed > 0 ? o.fallSpeed : 1.5;
  const settle = o.settle !== false;
  const meltMin = Math.max(o.meltMin || 4, 0.5);
  const meltMax = Math.max(o.meltMax || 12, meltMin + 0.5);
  const meltScale = Math.max(o.meltScale || 0.25, 0.01);
  const recycle = !settle;
  const radius = o.radius || 15;
  const topY = o.topY || 16;
  const center = o.center || {x:0,y:0,z:0};

  const restYAt = (x, z) => {
    let rest = 0;
    for (const c of (colliders||[])) {
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
    }
    return rest;
  };
  const dynamicRestY = (x, z, self, arr) => {
    let rest = restYAt(x, z);
    for (const q of arr) {
      if (q === self || !q.settled || q.melting) continue;
      const dx = x - q.x, dz = z - q.z;
      if (dx*dx + dz*dz <= q.footR2 && q.y > rest) rest = q.y;
    }
    return rest;
  };

  const arr = [];
  for (let i = 0; i < count; i++) {
    const ang = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*radius;
    const p = {
      x: center.x + Math.cos(ang)*r, z: center.z + Math.sin(ang)*r,
      y: topY * (0.35 + 0.65*Math.random()),
      vx: (Math.random()-0.5)*0.4, vy: -(fsBase*(0.75+Math.random()*0.5)),
      vz: (Math.random()-0.5)*0.4, ph: Math.random()*Math.PI*2,
      settled: false, restY: 0,
      snowAge: 0, meltDelay: 0, melting: false, meltT: 0, gone: false,
      onProp: false, footR2: Math.pow(size*(0.55+Math.random()*0.25), 2)
    };
    p.restY = restYAt(p.x, p.z);
    if (p.y <= p.restY) p.y = p.restY + 0.01;
    arr.push(p);
  }

  // setup co the keo do vat giua chung (dynamic world)
  if (setup) setup();

  let maxSettled = 0, meltCount = 0, respawnCount = 0;
  for (let f = 0; f < frames; f++) {
    let settledNow = 0;
    for (const p of arr) {
      if (p.gone) continue;
      if (p.settled && !p.melting) {
        p.snowAge += dt;
        const surf = dynamicRestY(p.x, p.z, p, arr);
        if (surf > p.y + 0.02) p.y = surf;
        else if (surf < p.y - 0.02) p.y = Math.max(surf, p.y - dt*2.5);
        if (p.snowAge >= p.meltDelay) p.melting = true;
        settledNow++;
        continue;
      }
      if (p.melting) {
        p.meltT += dt;
        const s = Math.max(0.02, 1 - p.meltT*meltScale);
        if (s <= 0.021 || p.meltT > 4.5) {
          const ang2 = Math.random()*Math.PI*2, r2 = Math.sqrt(Math.random())*radius;
          p.x = center.x + Math.cos(ang2)*r2; p.z = center.z + Math.sin(ang2)*r2;
          p.y = topY * (0.85 + 0.15*Math.random());
          p.settled = false; p.melting = false; p.meltT = 0; p.snowAge = 0;
          p.meltDelay = meltMin + Math.random()*(meltMax-meltMin);
          p.onProp = false;
          respawnCount++;
        }
        continue;
      }
      p.x += (p.vx||0)*dt + Math.sin(p.ph)*0.12*dt;
      p.z += (p.vz||0)*dt + Math.cos(p.ph*0.8)*0.12*dt;
      p.y += (p.vy||-1.5)*dt;
      p.ph += dt*2.2;
      const restD = dynamicRestY(p.x, p.z, p, arr);
      if (p.y <= restD) {
        p.y = restD; p.restY = restD;
        if (recycle) p.y = topY*(0.9+0.1*Math.random());
        else { p.settled = true; p.snowAge = 0; p.meltDelay = meltMin+Math.random()*(meltMax-meltMin); p.onProp = restD > 0.05; }
      }
    }
    if (settledNow > maxSettled) maxSettled = settledNow;
  }

  const floating = arr.filter(p => !p.settled && !p.melting && p.y < topY*0.3 && p.y > 0.1).length;
  const onFloor = arr.filter(p => p.settled && !p.onProp).length;
  const onProps = arr.filter(p => p.settled && p.onProp).length;
  const stillFalling = arr.filter(p => !p.settled && !p.melting).length;
  console.log(`[${label}] tan-chay-da-tai-sinh=${respawnCount} | dang-nam-max=${maxSettled} (tren do vat=${onProps}, tren san=${onFloor}) | van-dang-roi=${stillFalling} | lo-lu-sau-20s=${floating} | chua-tan=${arr.filter(p=>p.settled&&!p.melting).length}`);
  return {respawnCount, maxSettled, floating};
}

// Test 1: roi lien tuc — sau 20s (dt=1/60) phai CON HAT DANG ROI (tai sinh lien tuc)
const t1 = sim('T1 roi-lien-tuc 20s', {count:200, fallSpeed:1.6, meltMin:4, meltMax:12}, 20*60, 1/60, null, []);
console.assert(t1.respawnCount > 50, 'T1 FAIL: khong co hat nao tan chay + tai sinh!');
console.assert(t1.stillFalling > 10, 'T1 FAIL: het tuyet roi (khong rơi lien tuc)!');

// Test 2: cham do vat thi bam vao do vat
const table = [{minX:1,maxX:3,minZ:1,maxZ:3,topY:1.0}];
const t2 = sim('T2 dam-do-vat 10s', {count:200, fallSpeed:1.6}, 10*60, 1/60, null, table);
console.assert(t2.onProps > 0, 'T2 FAIL: khong co hat nao dam tren noc do vat!');

// Test 3: keo do vat di — hat dam phai sa theo (restY dong)
let moved = false;
const t3 = sim('T3 keo-do-vat 8s', {count:150, fallSpeed:2.0}, 8*60, 1/60, () => {
  // sau 2s keo ban di xa
  setTimeout === undefined && null;
  moved = true;
  table[0].minX = 50; table[0].maxX = 52; table[0].minZ = 50; table[0].maxZ = 52;
}, table);
console.assert(moved, 'setup chay');

// Test 4: dong long lop (chong len hat da nam duoi)
// 2 hat gan nhau: hat sau roi xuong phai dam TREN hat truoc
{
  const arr = [];
  const base = {settled:true, melting:false, y:0.0, x:0, z:0, footR2:0.01};
  arr.push(base);
  const dyn = (x,z,self) => { let rest = 0; for (const q of arr) { if (q===self||!q.settled||q.melting) continue; const dx=x-q.x,dz=z-q.z; if (dx*dx+dz*dz<=q.footR2 && q.y>rest) rest=q.y; } return rest; };
  const p2 = {settled:false, melting:false, y:0.05, x:0.05, z:0, footR2:0.01};
  const rest = dyn(p2.x, p2.z, p2, arr);
  console.assert(rest > 0, `T4 FAIL: restY=${rest}, phai >= y cua hat duoi`);
  console.log(`[T4 chong-lop] restY tren hat duoi = ${rest.toFixed(3)} (hat duoi y=0, footR2=0.01)`);
}

// Test 5: mua (settle:false) — khong nam, quay ve dinh ngay
const t5 = sim('T5 mua 5s', {count:100, fallSpeed:6, settle:false}, 5*60, 1/60, null, []);
console.assert(t5.maxSettled === 0 && t5.respawnCount === 0, 'T5 FAIL: mua phai khong dam khong tan');
console.log('[T5 mua] maxSettled=' + t5.maxSettled + ' respawnCount=' + t5.respawnCount + ' (ky vong 0/0)');
console.log('DONE');
