// Mo phong logic tick moi (dong bo voi TS sau patch F1-F3)
function sim(label, opts, frames, dt, colliders, onFrame) {
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
      if (dx*dx + dz*dz <= q.footR2) {
        const surfQ = q.y + q.sphereR;
        if (surfQ > rest) rest = surfQ;
      }
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
      onProp: false, footR2: Math.pow(size*(0.55+Math.random()*0.25), 2),
      sphereR: size/2
    };
    p.restY = restYAt(p.x, p.z);
    if (p.y <= p.restY) p.y = p.restY + 0.01;
    arr.push(p);
  }

  let maxSettled = 0, meltRespawn = 0;
  for (let f = 0; f < frames; f++) {
    if (onFrame) onFrame(f, arr);
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
        if (s <= 0.2 || p.meltT > 4.5) {
          const ang2 = Math.random()*Math.PI*2, r2 = Math.sqrt(Math.random())*radius;
          p.x = center.x + Math.cos(ang2)*r2; p.z = center.z + Math.sin(ang2)*r2;
          p.y = topY * (0.85 + 0.15*Math.random());
          p.settled = false; p.melting = false; p.meltT = 0; p.snowAge = 0;
          p.meltDelay = meltMin + Math.random()*(meltMax-meltMin);
          p.onProp = false;
          meltRespawn++;
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
        else { p.settled = true; p.snowAge = 0; p.meltDelay = meltMin+Math.random()*(meltMax-meltMin); p.onProp = restYAt(p.x,p.z) > 0.05; }
      }
    }
    if (settledNow > maxSettled) maxSettled = settledNow;
  }

  const onFloor = arr.filter(p => p.settled && !p.onProp).length;
  const onProps = arr.filter(p => p.settled && p.onProp).length;
  const stillFalling = arr.filter(p => !p.settled && !p.melting).length;
  console.log(`[${label}] tan+tai-sinh=${meltRespawn} | nam-max=${maxSettled} (do-vat=${onProps}, san=${onFloor}) | dang-roi=${stillFalling}`);
  return {meltRespawn, maxSettled, onProps, onFloor, stillFalling};
}

// T1: roi lien tuc 20s — phai co tan chay + tai sinh + van con hat dang roi
const t1 = sim('T1 roi-lien-tuc', {count:200, fallSpeed:1.6, meltMin:4, meltMax:12}, 20*60, 1/60, [], null);
console.assert(t1.meltRespawn > 50, 'T1a FAIL: khong co tan chay + tai sinh');
console.assert(t1.stillFalling > 30, 'T1b FAIL: het tuyet, khong roi lien tuc');
console.log('T1 => ' + (t1.meltRespawn > 50 && t1.stillFalling > 30 ? 'PASS' : 'FAIL'));

// T2: dam tren noc do vat — ban RONG 8x8 (like real table) o giua vung roi
{
  const colliders = [{minX:-4,maxX:4,minZ:-4,maxZ:4,topY:1.0}];
  const t2 = sim('T2 dam-do-vat', {count:200, fallSpeed:1.6}, 10*60, 1/60, colliders, null);
  console.assert(t2.onProps > 10, 'T2 FAIL: khong dam tren noc do vat');
  console.log('T2 => ' + (t2.onProps > 10 ? 'PASS' : 'FAIL'));
}

// T3: keo do vat di giua chung — hat dam phai sa theo bề mặt (restY dong)
{
  const colliders = [{minX:-4,maxX:4,minZ:-4,maxZ:4,topY:1.0}];
  let dragged = false, minSettledYAfter = Infinity, maxSettledYBefore = -1;
  const t3 = sim('T3 keo-do-vat', {count:150, fallSpeed:2.0, meltMin:30, meltMax:40}, 8*60, 1/60, colliders, (f, arr) => {
    if (f === 360) { // giay thu 6: keo ban di xa (hat da dam du)
      for (const p of arr) if (p.settled) maxSettledYBefore = Math.max(maxSettledYBefore, p.y);
      colliders[0].minX = 50; colliders[0].maxX = 58; colliders[0].minZ = 50; colliders[0].maxZ = 58;
      dragged = true;
    }
    if (f === 450) { // sau 1.5 giay keo: hat phai ha xuong san
      for (const p of arr) if (p.settled && !p.melting && p.onProp) minSettledYAfter = Math.min(minSettledYAfter, p.y);
    }
  });
  const ok = dragged && minSettledYAfter < 0.2;
  console.log('T3 => ' + (ok ? 'PASS' : 'FAIL') + ` (maxY-truoc-keo=${maxSettledYBefore.toFixed(2)}, minY-sau-keo-trong-vung-cu=${minSettledYAfter === Infinity ? 'n/a' : minSettledYAfter.toFixed(2)})`);
  console.assert(ok, 'T3 FAIL: hat khong sa xuong khi do vat bi keo di');
}

// T4: chong lop — hat roi xuong PHAI dam TREN nap cau hat da nam duoi (ca hat o san)
{
  const arr = [{settled:true, melting:false, y:0.0, x:0, z:0, footR2:0.0049, sphereR:0.06}];
  const dyn = (x,z,self) => { let rest = 0; for (const q of arr) { if (q===self||!q.settled||q.melting) continue; const dx=x-q.x,dz=z-q.z; if (dx*dx+dz*dz<=q.footR2) { const s=q.y+q.sphereR; if (s>rest) rest=s; } } return rest; };
  const rest = dyn(0.03, 0, null);
  const ok = rest >= 0.06;
  console.log('T4 => ' + (ok ? 'PASS' : 'FAIL') + ` (restY-tren-hat-duoi=${rest.toFixed(3)}, hat-duoi-y=0 sphereR=0.06)`);
  console.assert(ok, 'T4 FAIL: khong chong lop tren hat nam san');
}

// T5: mua settle:false — khong nam khong tan, quay ve dinh ngay
{
  const t5 = sim('T5 mua', {count:100, fallSpeed:6, settle:false}, 5*60, 1/60, [], null);
  const ok = t5.maxSettled === 0 && t5.meltRespawn === 0;
  console.log('T5 => ' + (ok ? 'PASS' : 'FAIL') + ` (nam=${t5.maxSettled}, tan=${t5.meltRespawn})`);
  console.assert(ok, 'T5 FAIL: mua phai khong dam khong tan');
}

console.log('DONE');
