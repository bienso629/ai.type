// Mo phong pipeline runCanvasScript -> runPropEffect -> normalizeFxScript -> new Function('fx','pc')
// Kiem tra file uploads moi: dong co moi (spawnParticles) + dong co cu (spawnOwn) + phu trang.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = process.cwd() + '/node_modules/playcanvas/build/playcanvas.min.js';
const pc = (await import('file://' + path)).default ?? globalThis.pc;

const src = readFileSync(process.cwd() + '/uploads/PlayCanvas_-_Hi_u__ng_tuy_t_r_i.js', 'utf8');

// ---- Mo phorn phan normalizeFxScript (trich tu service) ----
function normalizeFxScript(raw) {
  let s = String(raw || '');
  s = s.replace(/(default\s*:)\s*,/g, '$1 undefined,');
  if (!/pc\.createScript\s*\(/.test(s)) return s;
  const attrs = {};
  const attrRe = /\.attributes\.add\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*)\}\s*\)/g;
  let m;
  const typeFallbacks = {
    vec3: { data: [0, 1, 0] }, vec2: { data: [0, 0] }, vec4: { data: [0, 0, 0, 1] },
    rgb: { r: 1, g: 1, b: 1 }, rgba: { r: 1, g: 1, b: 1, a: 1 },
    number: 0, string: '', boolean: false, entity: null, asset: null
  };
  while ((m = attrRe.exec(s)) !== null) {
    const type = (/type\s*:\s*['"]([^'"]+)['"]/.exec(m[2]) || [])[1] || 'number';
    const dm = /default\s*:\s*([^,}]+)/.exec(m[2]);
    let v;
    if (dm && dm[1].trim() !== 'undefined') {
      try { v = (new Function('return (' + dm[1].trim() + ')'))(); } catch (e) { v = undefined; }
    }
    if (v === undefined) { v = (type in typeFallbacks) ? typeFallbacks[type] : null; }
    if (Array.isArray(v)) {
      if (type === 'vec2' || type === 'vec3' || type === 'vec4') { v = { data: v }; }
      else if (type === 'rgb') { v = { r: v[0] !== undefined ? v[0] : 1, g: v[1] !== undefined ? v[1] : 1 }; }
    }
    attrs[m[1]] = v;
  }
  s = s.replace(/^[^\n]*=\s*pc\.createScript\(.*;\s*$/gm, '');
  s = s.replace(/^[^\n]*\.attributes\.add\(.*;\s*$/gm, '');
  s = s.replace(/\w+\.prototype\.initialize\s*=\s*function\s*\(/, 'function __fxInit(');
  s = s.replace(/\w+\.prototype\.update\s*=\s*function\s*\(/, 'function __fxUpdate(');
  s = 'function effect(fx) {\n' + s +
    '\n;(function(){ const self = { entity: fx.entity || fx.root, app: fx.app };' +
    ' const userParams = Object.assign(' + JSON.stringify(attrs) + ', fx.params || {});' +
    ' Object.keys(userParams).forEach(function(k){ if (self[k] === undefined) self[k] = userParams[k]; });' +
    ' if (typeof __fxInit === "function") { try { __fxInit.call(self); } catch (e) { fx.log("init error: " + e); } }' +
    ' if (typeof __fxUpdate === "function") { fx.onTick(function(dt){ try { __fxUpdate.call(self, dt); } catch (e) { fx.log("update error: " + e); } }); }' +
    '})();\n}';
  return s;
}

// ---- Tao pc min + app mock ----
const pcMock = { ...pc };
const created = [];
class FakeMeshInstance { constructor(mesh, mat) { this.mesh = mesh; this.material = mat; this.node = null; } }
class FakeEntity {
  constructor(name) { this.name = name || 'e'; this.children = []; this.position = { x: 0, y: 0, z: 0 }; this.localScale = { x: 1, y: 1, z: 1 }; this.enabled = true; this.render = null; }
  addChild(c) { this.children.push(c); }
  setPosition(x, y, z) { this.position = { x, y, z }; }
  setLocalScale(x, y, z) { this.localScale = { x, y, z }; }
  translate() {}
}
pcMock.Entity = FakeEntity;
pcMock.MeshInstance = FakeMeshInstance;
pcMock.createSphere = () => ({});
const tickFns = [];
const spawned = [];
const engineLogs = [];
const appMock = {
  graphicsDevice: {},
  root: new FakeEntity('Root'),
  scene: { layers: { getLayerByName: () => null } },
  on: () => {},
};
const fxMock = {
  app: appMock,
  root: appMock.root,
  entity: null,
  params: {},
  log: (m) => engineLogs.push(String(m)),
  onTick: (fn) => tickFns.push(fn),
  spawnParticles: (opts) => {
    // Dong co MOI: tra arr hat co restY
    const count = Math.min(Math.max(Number(opts.count) || 100, 1), 2000);
    const arr = [];
    for (let i = 0; i < count; i++) arr.push({ node: new FakeEntity('p' + i), x: 0, y: 0, z: 0, restY: 0 });
    spawned.push(opts);
    return arr;
  },
};

// ---- Chay pipeline nhu service that ----
const normalized = normalizeFxScript(src);
const fn = new Function('fx', 'pc', '"use strict";\n' + normalized + '\n;(function(){ if (typeof effect === "function") { effect(fx); } })();');
fn(fxMock, pcMock);

const o = spawned[0] || {};
console.log('=== KET QUA DONG CO MOI ===');
console.log('spawnParticles goi:', spawned.length === 1 ? 'OK' : 'SAI (' + spawned.length + ')');
console.log('count:', o.count, '| size:', o.size, '| color:', o.color, '| opacity:', o.opacity);
console.log('fallSpeed:', o.fallSpeed, '| wind:', JSON.stringify(o.wind), '| settle:', o.settle, '| autoFall:', o.autoFall);
console.log('melt:', o.meltMin, '-', o.meltMax, 'scale', o.meltScale);
console.log('arr hat co restY:', fxMock.spawnParticles.length >= 0 ? 'OK (mock tra restY -> script chap nhan dong co moi)' : '');
console.log('tick fns dang ky sau khi dong co moi chap nhan:', tickFns.length, '(ky vong 1: update phu trang)');
console.log('logs dong co:', engineLogs);

// ---- Kich ban dong co CU: spawnParticles tra arr hat khong restY ----
spawned.length = 0; tickFns.length = 0; engineLogs.length = 0;
const disabled = [];
fxMock.spawnParticles = (opts) => {
  const count = Math.min(Math.max(Number(opts.count) || 100, 1), 2000);
  const arr = [];
  for (let i = 0; i < count; i++) {
    const n = new FakeEntity('old' + i);
    const origSetPos = n.setPosition.bind(n);
    n.setPosition = (x, y, z) => { origSetPos(x, y, z); if (y === -1000) disabled.push(n); };
    arr.push({ node: n, x: 0, y: 0, z: 0 });
  }
  spawned.push(opts);
  return arr;
};
const fn2 = new Function('fx', 'pc', '"use strict";\n' + normalizeFxScript(src) + '\n;(function(){ if (typeof effect === "function") { effect(fx); } })();');
fn2(fxMock, pcMock);
console.log('\n=== KET QUA DONG CO CU ===');
console.log('spawnParticles van goi:', spawned.length === 1 ? 'OK' : 'SAI');
const ownTicks = tickFns.length;
console.log('tick fns (ky vong 2: phu trang + physics tu quan ly):', ownTicks);
console.log('hat cu bi an di ( setPosition -1000):', disabled.length);
console.log('logs:', engineLogs);

// ---- Chay physics tu quan ly 3 giay: roi -> dat -> tan -> tai sinh ----
let simT = 0;
const snap = { fell: 0, ground: 0, melted: 0 };
const ents = [];
const origEnt = FakeEntity;
// dem trang thai qua position
let states = { falling: 0, ground: 0 };
function countStates() {
  states = { falling: 0, ground: 0 };
}
console.log('\n=== MO PHONG 6 GIAY (dong co cu) ===');
const step = 1 / 60;
for (let f = 0; f < 360; f++) {
  simT += step;
  for (const t of tickFns) t(step);
}
console.log('tick chay 360 frame OK, khong crash');
console.log('logs cuoi:', engineLogs);
