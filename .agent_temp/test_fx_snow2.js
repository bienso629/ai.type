// Mở rộng test: mô phỏng đầy đủ vòng đời runPropEffect với script snow
const fs = require('fs');
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

const snowScript = fs.readFileSync('uploads/PlayCanvas_-_Hi_u__ng_tuy_t_r_i.js', 'utf8');
const normalized = normalizeFxScript(snowScript);

// In script đã normalize để kiểm tra code shape
console.log('===== NORMALIZED SCRIPT (đo đầu) =====');
console.log(normalized.split('\n').slice(0, 30).join('\n'));
console.log('...');
console.log('===== KIỂM TRA CHUẨN BỊ CHẠY =====');

// Shim pc đầy đủ hơn — nhất là graphicsDevice.scope
const uniforms = {};
const pcShim = {
  math: { DEG_TO_RAD: Math.PI / 180 },
  Color: function (r, g, b) { this.r = r; this.g = g; this.b = b; this.a = 1; this.set = () => this; this.clone = () => this; this.fromString = () => true; },
  Vec3: function () {},
  Entity: function () {},
  StandardMaterial: function () {},
  createSphere: () => ({}),
  BLEND_NONE: 0, BLEND_NORMAL: 1
};

const fakeMaterial = { chunks: {}, update() { this.updated = true; } };
const fakeEntity = { render: { meshInstances: [{ material: fakeMaterial }] }, name: 'Ground' };

let tickFns = [];
const logs = [];

const api = {
  params: {},
  root: null,
  app: {
    graphicsDevice: {
      scope: {
        resolve: (n) => ({ setValue: (v) => { uniforms[n] = v; } })
      }
    }
  },
  entity: fakeEntity,
  log: (m) => logs.push(m),
  onTick: (fn) => tickFns.push(fn),
  spawnParticles: () => []
};

try {
  const fn = new Function('fx', 'pc', '"use strict";\n' + normalized +
    '\n;(function(){ if (typeof effect === "function") { effect(fx); } else if (typeof init === "function") { init(fx); } })();');
  fn(api, pcShim);

  // Chạy thử 3 frame update(dt) như runtime thật
  const dtSteps = [0.016, 0.016, 0.016];
  dtSteps.forEach((dt, i) => {
    tickFns.forEach(tf => tf(dt));
    console.log(`frame ${i + 1}: uSnowAmount =`, uniforms['uSnowAmount']);
  });

  console.log('uniforms sau 3 frame:', JSON.stringify(uniforms, (k, v) => v instanceof Float32Array ? [...v] : v));
  console.log('logs:', logs);
  console.log('material.diffusePS replaced:', !!fakeMaterial.chunks.diffusePS);
  console.log('KẾT LUẬN: Script tuyết CHẠY ĐƯỢC qua sandbox effect(fx).');
} catch (e) {
  console.error('CHẠY LỖI:', e.message);
  console.error(e.stack.split('\n').slice(0, 8).join('\n'));
}
