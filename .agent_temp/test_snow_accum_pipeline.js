// Mo phong pipeline chay file uploads/PlayCanvas_-_Hi_u__ng_tuy_t_r_i.js
// (SnowAccumulation) qua runCanvasScript -> runPropEffect -> normalizeFxScript.
const fs = require('fs');

// 1) Lay normalizeFxScript that tu source
const src = fs.readFileSync('src/app/modules/admin/account/profile/sontinh-scene.service.ts', 'utf8');
const start = src.indexOf('function normalizeFxScript(raw)');
const end = src.indexOf('function runPropEffect(');
const normalizeFxScript = new Function('return ' + src.slice(start, end))();

// 2) Doc script tuyet goc user upload
const userScript = fs.readFileSync('uploads/PlayCanvas_-_Hi_u__ng_tuy_t_r_i.js', 'utf8');

// 3) Mock runtime toi thieu
const tickFns = [];
const api = {
  params: {}, root: {}, app: {}, entity: {}, __lastSpawned: null,
  log: () => {},
  onTick: (fn) => tickFns.push(fn),
  spawnParticles: (opts) => { api.__lastSpawned = [{ x: 1, y: 2, z: 3 }]; return api.__lastSpawned; }
};

// 4) Chay dung nhu runPropEffect: new Function + effect(fx)
const fn = new Function('fx', 'pc', '"use strict";\n' + normalizeFxScript(userScript) +
  '\n;(function(){ if (typeof effect === "function") { effect(fx); } else if (typeof init === "function") { init(fx); } })();');
fn(api, {});

console.log('--- Sau khi effect(fx) chay xong ---');
console.log('tickFns (update snowAmount):', tickFns.length);
console.log('api.__lastSpawned:', api.__lastSpawned ? api.__lastSpawned.length + ' hat' : 'null (khong co hat)');

// 5) Dap ung fallback moi trong runPropEffect (sau dong effect(fx))
const lowName = 'snowAccumulation';
const lowScript = userScript.toLowerCase();
const snowSignal = /snow|tuyet|tuy\u1ebft|tuy\u00ea/.test(lowName) ||
  /snow|snowfall|snowflake/.test(lowScript) || /tuyet|tuy\u1ebft/.test(lowScript);
const hasParticleSystem = Array.isArray(api.__lastSpawned) && api.__lastSpawned.length > 0;
console.log('--- Fallback logic ---');
console.log('snowSignal:', snowSignal, '| hasParticleSystem:', hasParticleSystem);
console.log('=> Fallback them lop hat:', snowSignal && !hasParticleSystem ? 'CO (600 hat roi)' : 'KHONG');

// 6) Kiem tra material chunk patch (phu trang san van hoat dong song song)
const normalized = normalizeFxScript(userScript);
console.log('--- Material chunk ---');
console.log('Co preamble uniform material_diffuse:', normalized.includes('uniform vec3 material_diffuse;'));
console.log('Co wrapper fxAlbedoSample():', normalized.includes('fxAlbedoSample()'));
console.log('Khong con texture_diffuseMap thuan:', !/texture2D\s*\(\s*texture_diffuseMap/.test(normalized));
console.log('getAlbedo() hop le (mot dong preamble):', /uniform vec3 material_diffuse;\nvec3 fxAlbedoSample\(\) \{ return vec3\(1\.0\); \}\nvoid getAlbedo\(\)/.test(normalized));
