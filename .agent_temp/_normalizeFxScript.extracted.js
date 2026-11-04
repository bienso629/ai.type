function normalizeFxScript(raw) {
      let s = String(raw || '');
      // 1) Sua "default:," -> "default: undefined," de tranh SyntaxError
      s = s.replace(/default:\s*,/g, 'default: undefined,');
      // 1b) Sua token shader khong ton tai trong engine: engine 2.x dung
      // uniform 'material_diffuse' cho mau diffuse cua material trong chunk diffusePS.
      s = s.replace(/dDiffuseTexControls/g, 'material_diffuse');
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
      // 4b) Chuan hoa custom chunk diffusePS: nhieu script copy tu web
      // dung texture_diffuseMap (chi ton tai khi material co diffuseMap)
      // va quen khai bao uniform material_diffuse (engine chi khai bao
      // no ben trong chunk mac dinh). Chen preamble dieu kien de shader
      // luon compile du khi material khong co texture.
      if (/void\s+getAlbedo\s*\(\)/.test(s) && /texture_diffuseMap/.test(s) && !/uniform\s+vec3\s+material_diffuse/.test(s)) {
        // Goi-site texture2D(texture_diffuseMap, X) -> fxAlbedoSample():
        // chunk custom duoc thay the hoan toan nen sampler/varying do engine
        // khai bao cho chunk mac dinh mat theo. Wrapper 0-arg giup shader
        // compile du tren MOI material: co diffuseMap (nhanh #ifdef dung
        // sampler + vUv0 that cua engine) hay khong (nhanh #else tra mau
        // trang, khong cham vao sampler/varying nao de tranh undeclared).
        s = s.replace(/texture2D\s*\(\s*texture_diffuseMap\s*,\s*[^)]*\)/g, 'fxAlbedoSample()');
        // KHONG dung vUv0/texture_diffuseMap trong wrapper: material co
        // diffuseMapTiling (vd san marble tiling 35x20) thi engine sinh
        // varying vUV0_<transform> chu KHONG phai vUv0 -> hardcode vUv0 lam
        // shader fail compile. Wrapper tra trang * material_diffuse (uniform
        // engine luon upload cho material lit) = giu dung mau goc material,
        // compile du tren 100% material lit (co hay khong texture).
        const shaderPreamble =
          'uniform vec3 material_diffuse;\\n' +
          'vec3 fxAlbedoSample() { return vec3(1.0); }\\n';
        // Preamble phai duoc JS-escape khi chen vao source: ban thay the
        // truoc day chen GLSL co newline THAT vao string literal
        // ('void getAlbedo() {') -> string gay hai dong -> SyntaxError
        // Invalid or unexpected token -> TOAN BO script fail compile ->
        // khong co tuyet, khong co hat, khong co gi ca. Day chinh la ly
        // do "chua thay tuyet roi" o cac lan thu truoc.
        s = s.replace(/(void\s+getAlbedo\s*\(\))/, shaderPreamble + '$1');
      }
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

    