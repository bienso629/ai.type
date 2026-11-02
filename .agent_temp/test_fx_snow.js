// ==== Trích xuất normalizeFxScript (bản copy y hệt từ sontinh-scene.service.ts) ====
function normalizeFxScript(raw) {
  let s = String(raw || '');
  // 1) Sua "default:," -> "default: undefined," de tranh SyntaxError
  s = s.replace(/default:\s*,/g, 'default: undefined,');
  if (!/pc\.createScript\s*\(/.test(s)) return s;
  // 2) Thu thap attributes.add thanh bo tham so mac dinh cho fx.params (co fallback theo type)
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
      else if (type === 'rgb') { v = { r: v[0] !== undefined ? v[0] : 1, g: v[1] !== undefined ? v[1] : 1, b: v[2] !== undefined ? v[2] : 1 }; }
      else if (type === 'rgba') { v = { r: v[0] !== undefined ? v[0] : 1, g: v[1] !== undefined ? v[1] : 1, b: v[2] !== undefined ? v[2] : 1, a: v[3] !== undefined ? v[3] : 1 }; }
    }
    attrs[m[1]] = v;
  }
  // 3) Bo khai bao dang Editor de tranh ReferenceError trong sandbox
  s = s.replace(/^[^\n]*=\s*pc\.createScript\(.*;\s*$/gm, '');
  s = s.replace(/^[^\n]*\.attributes\.add\(.*;\s*$/gm, '');
  // 4) Doi prototype.initialize/update thanh ham thuan
  s = s.replace(/\w+\.prototype\.initialize\s*=\s*function\s*\(/, 'function __fxInit(');
  s = s.replace(/\w+\.prototype\.update\s*=\s*function\s*\(/, 'function __fxUpdate(');
  // 5) Dong goi thanh effect(fx): initialize chay ngay 1 lan, update nap vao fx.onTick
  s = 'function effect(fx) {\n' + s +
    '\n;(function(){ const self = { entity: fx.entity || fx.root, app: fx.app };' +
    ' const userParams = Object.assign(' + JSON.stringify(attrs) + ', fx.params || {});' +
    ' Object.keys(userParams).forEach(function(k){ if (self[k] === undefined) self[k] = userParams[k]; });' +
    ' if (typeof __fxInit === "function") { try { __fxInit.call(self); } catch (e) { fx.log("init error: " + e); } }' +
    ' if (typeof __fxUpdate === "function") { fx.onTick(function(dt){ try { __fxUpdate.call(self, dt); } catch (e) { fx.log("update error: " + e); } }); }' +
    '})();\n}';
  return s;
}

// ==== Node shim giả lập PlayCanvas API + sandbox như runPropEffect ====
const attrs = {};
let tickFns = [];
let logs = [];

const pcShim = {
  math: { DEG_TO_RAD: Math.PI / 180 },
  Color: function () { this.set = () => {}; this.clone = () => this; this.fromString = () => true; },
  Vec3: function () {},
  Entity: function () {},
  StandardMaterial: function () {},
  createSphere: () => ({}),
  BLEND_NONE: 0, BLEND_NORMAL: 1
};

const snowScript = require('fs').readFileSync('uploads/PlayCanvas_-_Hi_u__ng_tuy_t_r_i.js', 'utf8');

// Giả lập material entity cho prototype.initialize
const fakeMaterial = { chunks: {}, update: () => {}, diffuse: {} };
const fakeEntity = {
  render: { meshInstances: [{ material: fakeMaterial }] }
};
global.__lastSelf = null;

try {
  const fn = new Function('fx', 'pc', '"use strict";\n' + normalizeFxScript(snowScript) +
    '\n;(function(){ if (typeof effect === "function") { effect(fx); } else if (typeof init === "function") { init(fx); } })();');

  // Patch: trước khi chạy fx, ghi đè __fxInit call để bắt self — mô phỏng bằng cách chạy qua Function bình thường
  const api = {
    params: { count: 500 },
    root: null,
    app: { graphicsDevice: { scope: { resolve: (n) => ({ setValue: (v) => logs.push('uniform ' + n + ' = ' + JSON.stringify(Array.isArray(v) && v.length === 3 ? [...v] : v)) }) } } },
    entity: { entity: fakeEntity, render: fakeEntity.render },
    log: (m) => logs.push('[fx.log] ' + m),
    onTick: (fn) => tickFns.push(fn),
    spawnParticles: () => []
  };

  // normalizeFxScript đổi "this" thành self.entity... nhưng SnowAccumulation dùng this.entity.render.
  // Trong runtime thật: self = { entity: fx.entity || fx.root, app: fx.app }
  // fx.entity phải là Entity thật có .render. Ở đây ta giả lập.
  fn(api, pcShim);

  console.log('=== normalizeFxScript hoat dong ===');
  console.log('tickFns:', tickFns.length);
  console.log('logs:');
  logs.forEach(l => console.log('  ', l));
} catch (e) {
  console.error('CHAY LOI:', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
}
