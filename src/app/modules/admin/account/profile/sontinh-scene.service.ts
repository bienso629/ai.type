import { Injectable, NgZone, OnDestroy } from '@angular/core';
import * as pc from 'playcanvas';
import { UserProfile } from './profile-data.service';

/** Meta mot thuoc tinh dong cua effect script (parse tu attributes.add hoac fx.params) */
export interface FxParamMeta { name: string; type: string; value: any; title: string; min?: number; max?: number; step?: number; }
export interface RoomProp {
  id: string;
  name: string;
  type: string;
  shape?: 'model' | 'box' | 'sphere' | 'capsule' | 'cone' | 'cylinder';
  glbPath?: string;
  thumbnail?: string | null;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  color?: string | null;
  visible?: boolean;
  interactive?: boolean;
  clickAction?: string;
  hiddenFromList?: boolean;
  locked?: boolean; // New property for lock/unlock feature
  subDevices?: any[];
  castShadow?: boolean;
  opacity?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  activeScreenState?: string;
  screenOptions?: any;
  _customPositionSet?: boolean;
  _customRotationSet?: boolean;
  _customScaleSet?: boolean;
  _customColorSet?: boolean;
  _customOpacitySet?: boolean;
  _customEmissiveSet?: boolean;
  _customMetalnessSet?: boolean;
  _customRoughnessSet?: boolean;
  _groundedAtScale?: { x: number; y: number; z: number };
}


// JSON config imports — loaded as assets via HTTP in service method
// (These are fetched from Angular assets at runtime)

/**
 * SontinhSceneService
 * Wraps the full PlayCanvas 3D "Căn phòng của Yên" scene
 * from /yenai.vn/sontinh as an Angular Injectable service.
 */
@Injectable()
export class SontinhSceneService implements OnDestroy {

  private app: pc.Application | null = null;
  private _destroyed = false;

  // Exposed scene controls for applyProfile()
  private _charBodyRoot: pc.Entity | null = null;
  private _loadAndPlayAnim: ((key: string, glbPath?: string, isMovement?: boolean, speed?: number) => void) | null = null;
  private _toggleRoomLights: ((on?: boolean) => void) | null = null;
  private _profile: UserProfile | null = null;

  // Picture frame
  private _loadPhotoTexture: ((blobUrl: string) => void) | null = null;
  private _hasPhoto = false;

  /** Gọi khi user click vào khung ảnh mà chưa có ảnh — component override để mở file picker */
  onPictureFrameClick: (() => void) | null = null;

  /** Gọi khi user kéo thả xong một đồ vật — component override để lưu vị trí mới */
  onPropDragged: ((propId: string, pos: { x: number; y: number; z: number }) => void) | null = null;
  /** Gọi khi user click chọn một đồ vật trong canvas 3D */
  onPropClicked: ((propId: string) => void) | null = null;

  /** Gọi khi selection đồ vật thay đổi: chọn mới, realtime khi kéo, bỏ chọn (propId/pos = null) */
  onPropSelected: ((propId: string | null, pos: { x: number; y: number; z: number } | null) => void) | null = null;

  /** Gọi realtime khi user kéo nút chỉnh transform — component cập nhật overlay theo kind */
  onPropTransformChanged: ((propId: string, kind: 'pos' | 'rot' | 'scl', values: { x: number; y: number; z: number }) => void) | null = null;
  /** Gọi một lần khi thả nút chỉnh transform — component lưu giá trị cuối vào props */
  onPropTransformCommit: ((propId: string, kind: 'pos' | 'rot' | 'scl', values: { x: number; y: number; z: number }) => void) | null = null;

  /** Gọi một lần khi toàn bộ đồ vật về mặc định (Reset) — component nạp lại panel ĐỒ VẬT */
  onPropsReset: (() => void) | null = null;

  /** Gọi một lần khi xóa / nhân bản đồ vật ngay trên canvas — component đồng bộ roomProps + lưu đĩa */
  onPropActionChange: ((action: 'delete' | 'duplicate', propId: string, newPropId: string | null) => void) | null = null;

  /** Phát khi điểm neo nút del/dup đổi (pixel màn hình). visible=false: ẩn nút */
  onPropActionAnchor: ((visible: boolean, x: number, y: number, propId: string | null) => void) | null = null;

  // Nội bộ: hàm scrub chỉnh transform từ UI (được gán bên trong _initPlayCanvasScene)
  private _scrubTransform: ((propId: string, kind: 'pos' | 'rot' | 'scl', axis: number, deltaPx: number, commit: boolean) => void) | null = null;
  // Nội bộ: hàm chọn đồ vật từ menu danh sách (được gán bên trong _initPlayCanvasScene)
  private _selectPropById: ((propId: string) => void) | null = null;
  private _resetPropsToDefault: (() => void) | null = null;
  private _deletePropById: ((propId: string) => boolean) | null = null;
  /** Callback phat khi trang thai khoa cua prop doi (UI cap nhat nut khoa) */
  onPropLockChanged: ((propId: string, locked: boolean) => void) | null = null;
  private _duplicatePropById: ((propId: string) => string | null) | null = null;
  // 🌟 Custom effect runtime (tuyet roi, la roi...): closure gan khi scene init
  private _runPropEffect: ((cmd: any) => boolean) | null = null;
  private _stopPropEffect: ((name: string) => void) | null = null;

  playAnimation(key: string, glbPath?: string, isMovement?: boolean, speed?: number): void {
    if (this._loadAndPlayAnim) {
      this._loadAndPlayAnim(key, glbPath, isMovement, speed);
    }
  }

  /** Gọi từ component sau khi user chọn ảnh — truyền blob URL vào để update texture */
  loadPhotoTexture(blobUrl: string): void {
    this._loadPhotoTexture?.(blobUrl);
  }

  /** Trigger sự kiện click công tắc đèn 3D trên tường (lật phím công tắc & bật/tắt đèn) */
  clickLightSwitch(on?: boolean): void {
    if (this._toggleRoomLights) {
      this._toggleRoomLights(on);
    }
  }

    private _setCharacterTransformFn: ((options: { position?: { x: number; y: number; z: number }; facingAngle?: number; scale?: number }) => void) | null = null;
  private _setCharacterVisibilityFn: ((visible: boolean) => void) | null = null;
  private _setEnvironmentColorsFn: ((options: { bg?: string; table?: string; cloth?: string }) => void) | null = null;

  setCharacterTransform(options: { position?: { x: number; y: number; z: number }; facingAngle?: number; scale?: number }): void {
    if (this._setCharacterTransformFn) {
      this._setCharacterTransformFn(options);
    }
  }

  setCharacterVisibility(visible: boolean): void {
    if (this._setCharacterVisibilityFn) {
      this._setCharacterVisibilityFn(visible);
    }
  }

  setEnvironmentColors(options: { bg?: string; table?: string; cloth?: string }): void {
    if (this._setEnvironmentColorsFn) {
      this._setEnvironmentColorsFn(options);
    }
  }

  private _disabledTriggers: Set<string> = new Set();
  private _applyCameraPreset: ((preset: string) => void) | null = null;
  private _applyProps: ((props: any[], fullSync?: boolean) => void) | null = null;
  private _toggleWindowTvIframe: ((show?: boolean, url?: string) => void) | null = null;

  private _showDateTimeOnMonitorFn: ((targetSide?: 'left' | 'right' | 'both', options?: { textColor?: string; bgColor?: string; screenText?: string; imageUrl?: string }) => void) | null = null;
  private _clearMonitorDisplayFn: ((targetSide?: 'left' | 'right' | 'both') => void) | null = null;

  showDateTimeOnMonitor(targetSide: 'left' | 'right' | 'both' = 'both', options?: { textColor?: string; bgColor?: string; screenText?: string; imageUrl?: string }): void {
    if (this._showDateTimeOnMonitorFn) {
      this._showDateTimeOnMonitorFn(targetSide, options);
    }
  }

  clearMonitorDisplay(targetSide: 'left' | 'right' | 'both' = 'both'): void {
    if (this._clearMonitorDisplayFn) {
      this._clearMonitorDisplayFn(targetSide);
    }
  }

  toggleWindowTvIframe(show?: boolean, url?: string): void {
    if (this._toggleWindowTvIframe) {
      this._toggleWindowTvIframe(show, url);
    }
  }

  updateProp(prop: any): void {
    if (this._applyProps && prop) {
      this._applyProps([prop]);
    }
  }

  syncProps(props: any[]): void {
    if (this._applyProps && Array.isArray(props)) {
      this._applyProps(props, true);
    }
  }

  setDisabledTriggers(triggers: string[]): void {
    this._disabledTriggers = new Set(triggers);
  }

  isTriggerDisabled(trigger: string): boolean {
    return this._disabledTriggers.has(trigger);
  }

  setCameraPreset(preset: string): void {
    if (this._applyCameraPreset) {
      this._applyCameraPreset(preset);
    }
  }

  /** Thực thi kịch bản chuỗi hành động sự kiện 3D từ events.json */
  executeEvent(triggerName: string): boolean {
    if (this.isTriggerDisabled(triggerName)) return false;
    const events = (this._profile as any)?.events;
    if (!Array.isArray(events)) return false;

    const matchedEvent = events.find((e: any) => e.trigger === triggerName || e.id === triggerName);
    if (!matchedEvent || matchedEvent.disabled || !Array.isArray(matchedEvent.actions)) return false;

    for (const act of matchedEvent.actions) {
      if (act.type === 'playAnimation' && act.animation) {
        this.playAnimation(act.animation);
      } else if (act.type === 'toggleLights' || act.type === 'setLight') {
        this.clickLightSwitch(act.value !== undefined ? act.value : true);
      }
    }
    return true;
  }

  constructor(private ngZone: NgZone) {
    this._loadFxRegistry();
  }

  /**
   * Initialize the full 3D scene on the given canvas element.
   * All JSON configs are fetched from /assets/sontinh/*.json
   */
  async initScene(canvasEl: HTMLCanvasElement, profile?: UserProfile | null, charGlbObjectUrl?: string | null): Promise<void> {
    this._destroyed = false;
    this._profile = profile ?? null;
    const svc = this;                    // tham chiếu service trong inner functions
    const username = profile?.username || 'default';

    // Fetch JSON configs from Angular assets (dùng đường dẫn tương đối assets/ để chạy được trên file:// trong Electron packaged app)
    const [room306Data, furniture306Data, decorations306Data, shophousesData, trafficData] = await Promise.all([
      fetch('assets/sontinh/room306.json').then(r => r.json()),
      fetch('assets/sontinh/furniture306.json').then(r => r.json()),
      fetch('assets/sontinh/decorations306.json').then(r => r.json()),
      fetch('assets/sontinh/shophouses.json').then(r => r.json()),
      fetch('assets/sontinh/traffic.json').then(r => r.json()),
    ]);

    // charGlbObjectUrl: Blob URL từ file trên đĩa qua Electron IPC
    // null = chưa có character, scene sẽ skip load (không gọi HTTP)
    const charGlbUrl = charGlbObjectUrl ?? null;
    if (charGlbUrl) {
      console.log(`[SontinhScene] Dùng character của "${username}":`, charGlbUrl);
    } else {
      console.log(`[SontinhScene] Chưa có character — chờ user upload.`);
    }

    // Run all PlayCanvas scene code outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      this._initPlayCanvasScene(canvasEl, username, charGlbUrl, room306Data, furniture306Data, decorations306Data, shophousesData, trafficData);
    });
  }

  /**
   * Apply a UserProfile to the live scene:
   * - set camera preset from profile.scene.cameraPreset
   * - set character position, rotation, scale
   * - toggle lights per scene.lightsOn
   * - update props from profile.props
   * - switch animation state
   */
  /** 🌟 Chay hieu ung script JS (tuyet roi, la roi...) — goi tu AI prompt handler */
  runEffect(cmd: { name?: string; targetPropId?: string | null; targetPropName?: string | null; params?: any; script?: string }): boolean {
    if (!cmd || !cmd.script || !this._runPropEffect) return false;
    return this._runPropEffect(cmd);
  }

  /** Dung hieu ung theo ten */
  stopEffect(name: string): void {
    if (this._stopPropEffect) this._stopPropEffect(name);
  }

  // ================= FX SCRIPT REGISTRY (Canvas Effects) =================
  // Danh sach cac file .js da import vao canvas qua nut Plus cua panel CANVAS.
  // Moi entry giu nguyen van script + bo thuoc tinh dong parse tu script
  // (attributes.add cua dang PlayCanvas Editor) de dialog cau hinh render
  // control theo dung type cua tung thuoc tinh.
  fxEffects: Array<{ id: string; name: string; fileName: string; script: string; params: Record<string, any>; paramsMeta: FxParamMeta[]; createdAt: string; enabled?: boolean }> = [];

  /**
   * Parse dong bo thuoc tinh tu script: ho tro ca dang PlayCanvas Editor
   * (Snow.attributes.add('name', { type, default, title, min, max, step }))
   * va dang data-API thuan (fx.params = { ... } hoac FX_PARAMS = {...}).
   * Brace-balanced de khong gay vo regex don gian khi object long nhau.
   */
  parseFxScriptParams(script: string): FxParamMeta[] {
    const out: FxParamMeta[] = [];
    if (!script) return out;
    const typeFallbacks: Record<string, any> = {
      vec3: { data: [0, 1, 0] }, vec2: { data: [0, 0] }, vec4: { data: [0, 0, 0, 1] },
      rgb: { r: 1, g: 1, b: 1 }, rgba: { r: 1, g: 1, b: 1, a: 1 },
      number: 0, string: '', boolean: false, entity: null, asset: null
    };
    // Trich title tu body attribute (ho tro tieng Viet co dau)
    const titleOf = (body: string): string => {
      const tm = /(?:title|label|desc|description)\s*:\s*(['"])([\s\S]*?)\1/.exec(body);
      return tm ? tm[2] : '';
    };
    // --- Dang 1: attributes.add('ten', { ... }) — brace-balanced ---
    const re = /\.attributes\.add\(\s*['"]([A-Za-z_$][\w$]*)['"]\s*,\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(script)) !== null) {
      const start = m.index + m[0].length - 1; // vi tri '{'
      let depth = 0, end = -1, i = start;
      for (; i < script.length; i++) {
        const ch = script[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      const body = script.slice(start + 1, end);
      const typeM = /(?:^|,)\s*type\s*:\s*['"]([a-zA-Z0-9_]+)['"]/.exec(body);
      const type = typeM ? typeM[1] : 'number';
      let value: any;
      const dm = /(?:^|,)\s*default\s*:/.exec(body);
      if (dm) {
        const dvStart = dm.index + dm[0].length;
        // Lay gia tri den dau phan tu ke tiep (toan tu dau }, hoac , o depth 0)
        let d = 0, valEnd = body.length;
        for (let j = dvStart; j < body.length; j++) {
          const ch = body[j];
          if (ch === '{' || ch === '[') d++;
          else if (ch === '}' || ch === ']') { if (d === 0) { valEnd = j; break; } d--; }
          else if (ch === ',' && d === 0) { valEnd = j; break; }
        }
        const rawVal = body.slice(dvStart, valEnd).trim();
        if (rawVal && rawVal !== 'undefined') {
          try { value = (new Function('return (' + rawVal + ')'))(); } catch (e) { value = undefined; }
        }
      }
      if (value === undefined) value = (type in typeFallbacks) ? typeFallbacks[type] : null;
      // Chuan hoa gia tri cho control dialog: array -> object theo type
      // (default trong script viet dang array [1,1,1,1] nhung sandbox va
      // dialog dung object {r,g,b,a} / {data:[...]})
      if (Array.isArray(value)) {
        if (type === 'rgb') {
          value = { r: value[0] ?? 1, g: value[1] ?? 1, b: value[2] ?? 1 };
        } else if (type === 'rgba') {
          value = { r: value[0] ?? 1, g: value[1] ?? 1, b: value[2] ?? 1, a: value[3] ?? 1 };
        } else if (type === 'vec2' || type === 'vec3' || type === 'vec4') {
          value = { data: value };
        }
      } else if (type === 'rgb' && value && typeof value === 'object' && !value.data) {
        value = { r: value.r ?? 1, g: value.g ?? 1, b: value.b ?? 1 };
      } else if (type === 'rgba' && value && typeof value === 'object' && !value.data) {
        value = { r: value.r ?? 1, g: value.g ?? 1, b: value.b ?? 1, a: value.a ?? 1 };
      }
      const numAttr = (key: string): number | undefined => {
        const nm = new RegExp('(?:^|,\\s*)' + key + '\\s*:\\s*(-?[0-9.]+)').exec(body);
        return nm ? parseFloat(nm[1]) : undefined;
      };
      out.push({ name: m[1], type, value, title: titleOf(body), min: numAttr('min'), max: numAttr('max'), step: numAttr('step') });
    }
    // --- Dang 2: fx.params = {...} hoac FX_PARAMS = {...} (script engine-thuan) ---
    if (out.length === 0) {
      const p2 = /(?:fx\.params|FX_PARAMS)\s*=\s*\{/;
      const pm = p2.exec(script);
      if (pm) {
        const start = pm.index + pm[0].length - 1;
        let depth = 0, end = -1;
        for (let i = start; i < script.length; i++) {
          const ch = script[i];
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) {
          const raw = script.slice(start, end + 1);
          try {
            const obj = (new Function('return (' + raw + ')'))();
            if (obj && typeof obj === 'object') {
              for (const k of Object.keys(obj)) {
                const v = obj[k];
                let type = 'number';
                if (typeof v === 'boolean') type = 'boolean';
                else if (typeof v === 'string') type = 'string';
                else if (v && typeof v === 'object' && v.r !== undefined) type = (v.a !== undefined) ? 'rgba' : 'rgb';
                else if (Array.isArray(v) && v.length >= 3) type = 'vec3';
                out.push({ name: k, type, value: v, title: '' });
              }
            }
          } catch (e) { /* bo qua object khong parse duoc */ }
        }
      }
    }
    return out;
  }

  /** Dang ky effect moi vao danh sach Canvas (goi sau khi runCanvasScript thanh cong) */
  registerFxEffect(name: string, fileName: string, script: string, params?: Record<string, any>): void {
    const existing = this.fxEffects.findIndex((f) => f.name === name);
    if (existing >= 0) this.fxEffects.splice(existing, 1);
    const paramsMeta = this.parseFxScriptParams(script);
    // Ghe params nguoi dung luu trong registry (neu co) de dialog hien gia tri moi
    const merged: Record<string, any> = {};
    for (const p of paramsMeta) merged[p.name] = (params && params[p.name] !== undefined) ? params[p.name] : p.value;
    this.fxEffects.push({
      id: 'fx_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36),
      name, fileName, script,
      params: merged,
      paramsMeta,
      createdAt: new Date().toISOString(),
      enabled: true
    });
    this._saveFxRegistry();
  }

  /** Bat/tat effect: tat = dung effect tren scene (giu cau hinh), bat = chay lai voi cau hinh da luu */
  setFxEffectEnabled(id: string, enabled: boolean): boolean {
    const fx = this.fxEffects.find((f) => f.id === id);
    if (!fx) return false;
    fx.enabled = !!enabled;
    this._saveFxRegistry();
    if (fx.enabled) {
      return this._runPropEffect?.({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' }) ?? false;
    }
    // Quan trong: truyen ten goc — ham stop tu chuon hoa de khop key da luu
    // (runPropEffect luu key "Tuy_t r_i" -> "Tuy_t_r_i").
    if (this._stopPropEffect) this._stopPropEffect(fx.name);
    return true;
  }

  /** Effect hien dang bat hay tat (mac dinh bat voi du lieu cu chua co cot enabled) */
  isFxEffectEnabled(id: string): boolean {
    const fx = this.fxEffects.find((f) => f.id === id);
    return !fx ? false : fx.enabled !== false;
  }

  /** Xoa effect khoi danh sach Canvas + dung no tren scene */
  removeFxEffect(id: string): void {
    const idx = this.fxEffects.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const fx = this.fxEffects[idx];
    // Ten goc — stopPropEffect tu chuan hoa de khop key "Tuy_t_r_i" trong map
    if (this._stopPropEffect) this._stopPropEffect(fx.name);
    this.fxEffects.splice(idx, 1);
    this._saveFxRegistry();
  }

  /** Luu registry vao localStorage de giu danh sach + cau hinh qua F5 */
  private _saveFxRegistry(): void {
    try {
      localStorage.setItem('sontinh_fx_registry', JSON.stringify(this.fxEffects));
    } catch (e) { /* day dai hoac tab che do rieng tu */ }
  }

  private _loadFxRegistry(): void {
    try {
      const raw = localStorage.getItem('sontinh_fx_registry');
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0 && this.fxEffects.length === 0) {
        this.fxEffects = arr.filter((f) => f && f.name && f.script).map((f: any) => ({ ...f, enabled: f.enabled !== false }));
      }
    } catch (e) { /* registry hong — bo qua */ }
  }



  /**
   * Cap nhat tham so dong cho effect: restart voi params moi.
   * Params duoc truyen vao sandbox qua wrapper (userParams) nen script
   * nhan gia tri moi ngay tu initialize ma khong can sua script.
   */
  updateFxEffectParams(id: string, params: Record<string, any>): boolean {
    const fx = this.fxEffects.find((f) => f.id === id);
    if (!fx) return false;
    fx.params = Object.assign({}, fx.params, params || {});
    this._saveFxRegistry();
    // Effect dang TAT: chi luu cau hinh moi, khong tu dong bat effect
    if (fx.enabled === false) return true;
    const ok = this._runPropEffect?.({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' }) ?? false;
    return ok;
  }

  /** Chay lai effect voi gia tri tham so hien tai trong registry */
  rerunFxEffect(id: string): boolean {
    const fx = this.fxEffects.find((f) => f.id === id);
    if (!fx) return false;
    return this._runPropEffect?.({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' }) ?? false;
  }

  /** Chay lai toan bo effect trong registry (goi sau initScene de phuc hoi hieu ung sau F5) */
  rerunAllFxEffects(): void {
    if (this.fxEffects.length === 0 || !this._runPropEffect) return;
    let n = 0;
    for (const fx of this.fxEffects) {
      if (fx.enabled === false) continue; // effect nguoi dung tat: khong khoi phuc
      try {
        if (this._runPropEffect({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' })) n++;
      } catch (e) { /* bo qua effect loi, chay tiep con lai */ }
    }
    if (n > 0) console.log('[SontinhScene] Restored ' + n + '/' + this.fxEffects.length + ' canvas effect(s) after scene init.');
  }

  applyProfile(profile: UserProfile, opts?: { skipCamera?: boolean }): void {
    this._profile = profile;
    if (Array.isArray((profile as any).disabledEvents)) {
      this.setDisabledTriggers((profile as any).disabledEvents);
    }
    this.ngZone.runOutsideAngular(() => {
      // 1. Dynamic Camera Preset from ~/Documents/ai.type/data/profiles/{username}/
      // FIX(khong reset goc nhin khi keo do vat): bo qua camera cho cac luong
      // chi-luu-props (drag/xoa/them/AI) — chi init scene va preset cu the moi ap camera.
      if (profile.scene?.cameraPreset && !opts?.skipCamera) {
        this.setCameraPreset(profile.scene.cameraPreset);
      }

      // 2. Room Lighting
      if (profile.scene && this._toggleRoomLights) {
        this._toggleRoomLights(profile.scene.lightsOn);
      }

      // 3. Character transform
      if (profile.character && this._charBodyRoot) {
        const char = profile.character;
        if (char.position) {
          this._charBodyRoot.setPosition(char.position.x, char.position.y, char.position.z);
        }
        if (char.facingAngle !== undefined) {
          this._charBodyRoot.setEulerAngles(0, char.facingAngle, 0);
        }
        if (char.scale !== undefined) {
          const s = char.scale;
          this._charBodyRoot.setLocalScale(s, s, s);
        }
      }

      // 4. Room Props from ~/Documents/ai.type/data/profiles/{username}/props.json
      if (Array.isArray((profile as any).props) && this._applyProps) {
        this._applyProps((profile as any).props, true);
      }

      // Animation state (chỉ khi đã có character loaded)
      if (profile.character?.animationState && this._loadAndPlayAnim) {
        this._loadAndPlayAnim(profile.character.animationState);
      }
    });
  }

  /** Load a custom character GLB from URL (user-uploaded asset) */
  private _loadCustomCharacterGlb(glbUrl: string, initialAnim: string): void {
    if (!this.app || this._destroyed) return;
    this.app.assets.loadFromUrl(glbUrl, 'container', (err: any, asset?: pc.Asset) => {
      if (err || !asset?.resource) {
        console.warn('[SontinhSceneService] Custom GLB load failed:', glbUrl, err);
        return;
      }
      const charContainer = asset.resource as any;
      const newEntity = (charContainer.instantiateRenderEntity() ?? charContainer.instantiateModelEntity()) as pc.Entity;
      if (!newEntity || !this._charBodyRoot) return;

      // Replace existing character visuals
      while (this._charBodyRoot.children.length > 0) {
        this._charBodyRoot.children[0].destroy();
      }

      const wrapper = new pc.Entity('CustomCharScaleWrapper');
      const s = this._profile?.character?.scale ?? 1.0;
      wrapper.setLocalScale(s, s, s);
      this._charBodyRoot.addChild(wrapper);
      wrapper.addChild(newEntity);
      newEntity.setLocalPosition(0, 0, 0);

      console.log('[SontinhSceneService] Custom character GLB loaded:', glbUrl);
    });
  }

  /**
   * Load character vào scene từ Blob URL (sau khi user upload GLB).
   * Gọi method này từ component sau khi upload thành công.
   */
  loadCharacterFromBlobUrl(blobUrl: string): void {
    if (!this.app || this._destroyed) return;
    this._loadCustomCharacterGlb(blobUrl, this._profile?.character?.animationState ?? 'Walk');
  }

  /**
   * Load GLB đồ vật do người dùng upload vào scene (blob URL).
   * Wrapper đặt tên PropGLB_<id> để _applyProps tìm và cập nhật transform sau này.
   */
  loadPropGlb(propId: string, blobUrl: string, prop?: any, onLoaded?: (ok: boolean) => void): void {
    if (!this.app || this._destroyed || !propId) { onLoaded?.(false); return; }
    this.app.assets.loadFromUrl(blobUrl, 'container', (err: any, asset?: pc.Asset) => {
      if (err || !asset?.resource) {
        console.warn('[SontinhSceneService] Prop GLB load failed:', propId, err);
        onLoaded?.(false);
        return;
      }
      if (this._destroyed || !this.app) { onLoaded?.(false); return; }
      const container = asset.resource as any;
      const glbEntity = (container.instantiateRenderEntity?.() ?? container.instantiateModelEntity?.()) as pc.Entity;
      if (!glbEntity) { onLoaded?.(false); return; }

      // Gỡ bản cũ nếu đồ vật được nạp lại
      const old = this.app.root.findByName(`PropGLB_${propId}`);
      if (old) old.destroy();

      // Gỡ khối hộp dự phòng đã tạo nhầm khi GLB chưa nạp xong (race condition)
      const legacyBox = this.app.root.findByName(propId);
      if (legacyBox && (legacyBox as any).tags?.has('user_prop')) {
        try { legacyBox.destroy(); } catch (_) {}
      }

      // Đọc AABB không gian local của GLB ngay sau instantiate (chuỗi transform
      // ngoài vẫn là identity) — đọc TRƯỚC khi gắn vào wrapper có scale/rotation
      // để giá trị xác định, không phụ thuộc việc engine sync world transform.
      let bMin: pc.Vec3 | null = null;
      let bMax: pc.Vec3 | null = null;
      const meshComps: any[] = [
        ...((glbEntity.findComponents('render') as any[]) || []),
        ...((glbEntity.findComponents('model') as any[]) || [])
      ];
      for (const r of meshComps) {
        const mis = r.meshInstances || [];
        for (const mi of mis) {
          const a = mi.aabb;
          if (!a) continue;
          const lo = new pc.Vec3(a.center.x - a.halfExtents.x, a.center.y - a.halfExtents.y, a.center.z - a.halfExtents.z);
          const hi = new pc.Vec3(a.center.x + a.halfExtents.x, a.center.y + a.halfExtents.y, a.center.z + a.halfExtents.z);
          if (!bMin) { bMin = lo; bMax = hi; }
          else {
            bMin.x = Math.min(bMin.x, lo.x); bMin.y = Math.min(bMin.y, lo.y); bMin.z = Math.min(bMin.z, lo.z);
            bMax.x = Math.max(bMax.x, hi.x); bMax.y = Math.max(bMax.y, hi.y); bMax.z = Math.max(bMax.z, hi.z);
          }
        }
      }

      const wrapper = new pc.Entity(`PropGLB_${propId}`);
      wrapper.tags.add('user_prop');
      wrapper.tags.add('prop_glb');

      const p = prop?.position && typeof prop.position.x === 'number' ? prop.position : { x: 0, y: 0, z: 0 };
      const s = prop?.scale && typeof prop.scale.x === 'number' ? prop.scale : { x: 1, y: 1, z: 1 };
      wrapper.setLocalScale(s.x, s.y, s.z);
      if (prop?.rotation && typeof prop.rotation.x === 'number') {
        wrapper.setEulerAngles(prop.rotation.x, prop.rotation.y, prop.rotation.z);
      }

      // Đáy món đồ trong world sau scale + rotation của wrapper: biến đổi
      // 8 đỉnh AABB local qua scale rồi rotation, lấy Y nhỏ nhất.
      let bottomWorldY: number | null = null;
      if (bMin && bMax) {
        const rot = wrapper.getRotation();
        const ys: number[] = [];
        for (const cx of [bMin.x, bMax.x]) {
          for (const cy of [bMin.y, bMax.y]) {
            for (const cz of [bMin.z, bMax.z]) {
              const v = new pc.Vec3(cx * s.x, cy * s.y, cz * s.z);
              rot.transformVector(v, v);
              ys.push(v.y);
            }
          }
        }
        bottomWorldY = Math.min.apply(null, ys);
      }

      // Ghi đáy AABB local của GLB lên wrapper để mọi đường đổi scale
      // (scrub / AI / panel) tính nâng Y giữ đáy cố định so với sàn
      (wrapper as any)._bottomLocalY = bMin ? bMin.y : null;
      wrapper.addChild(glbEntity);
      glbEntity.setLocalPosition(0, 0, 0);
      this.app.root.addChild(wrapper);

      // Đặt Y theo chiều cao món đồ: đáy bounding box chạm đúng mặt sàn
      // PlayCanvas (y=0) thay vì hardcode Y=4.6 cũ. Nếu user đã tự kéo/đặt
      // (_customPositionSet) và Y KHÔNG còn là giá trị 4.6 mặc định cũ thì
      // giữ nguyên vị trí người dùng đã lưu.
      const isCustom = !!(prop as any)?._customPositionSet;
      const isLegacyDefaultY = Math.abs(p.y - 4.6) < 0.005;
      // Scale da doi so voi lan cham san truoc? (_groundedAtScale luu scale ap
      // dung cho wrapper lan nap/dong bo truoc, persist theo prop) Neu doi thi
      // Y cu khong con phu hop voi geometry scale moi -> re-ground de khong lun.
      const grounded = (prop as any)?._groundedAtScale;
      const scaleChanged = !!grounded && typeof grounded.x === 'number' &&
        (Math.abs(grounded.x - s.x) > 1e-3 || Math.abs(grounded.y - s.y) > 1e-3 || Math.abs(grounded.z - s.z) > 1e-3);
      let finalY = p.y;
      if (!isCustom || isLegacyDefaultY || scaleChanged) {
        finalY = bottomWorldY !== null ? -bottomWorldY : 0;
        if (prop) {
          prop.position = { x: p.x, y: Math.round(finalY * 100) / 100, z: p.z };
        }
      }
      if (prop) (prop as any)._groundedAtScale = { x: s.x, y: s.y, z: s.z };
      wrapper.setPosition(p.x, finalY, p.z);
      console.log('[SontinhSceneService] Prop GLB loaded:', propId, 'bottomWorldY=', bottomWorldY, 'finalY=', finalY);
      onLoaded?.(true);
    });
  }

  /**
   * Tạo thumbnail PNG (nền trong suốt) cho file GLB bằng mini renderer offscreen:
   * canvas ẩn + PlayCanvas tạm, load GLB, fit camera theo bounding box,
   * chụp 1 frame rồi dọn dẹp. Trả về dataUrl hoặc null nếu thất bại.
   */
  generateGlbThumbnail(blobUrl: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const cv = document.createElement('canvas');
      cv.width = 160;
      cv.height = 160;
      let app: any = null;
      let settled = false;
      const finish = (result: string | null) => {
        if (settled) return;
        settled = true;
        try { if (app) app.destroy(); } catch (_) {}
        try { cv.width = 1; cv.height = 1; } catch (_) {}
        resolve(result);
      };
      const timeout = setTimeout(() => finish(null), 15000);
      try {
        app = new pc.Application(cv, {
          graphicsDeviceOptions: { antialias: true, alpha: true, preserveDrawingBuffer: true, depth: true }
        });
        app.setCanvasFillMode(pc.FILLMODE_NONE);
        try { app.graphicsDevice.maxPixelRatio = 1; } catch (_) {}
        app.scene.ambientLight = new pc.Color(0.6, 0.6, 0.65);
        const cam = new pc.Entity('ThumbCam');
        cam.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0), fov: 45 });
        app.root.addChild(cam);
        const keyLight = new pc.Entity('ThumbKeyLight');
        keyLight.addComponent('light', { type: 'directional', color: new pc.Color(1, 1, 1), intensity: 2.0 });
        keyLight.setEulerAngles(35, 40, 0);
        app.root.addChild(keyLight);
        const fillLight = new pc.Entity('ThumbFillLight');
        fillLight.addComponent('light', { type: 'directional', color: new pc.Color(0.75, 0.8, 0.9), intensity: 0.8 });
        fillLight.setEulerAngles(-15, -140, 0);
        app.root.addChild(fillLight);

        app.assets.loadFromUrl(blobUrl, 'container', (err: any, asset?: any) => {
          if (settled) return;
          if (err || !asset?.resource) { clearTimeout(timeout); finish(null); return; }
          try {
            const ent = (asset.resource.instantiateRenderEntity?.() ?? asset.resource.instantiateModelEntity?.()) as pc.Entity;
            if (!ent) { clearTimeout(timeout); finish(null); return; }
            app.root.addChild(ent);

            // Fit camera theo bounding box (thuần số học từ aabb mesh instances)
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            let hasMesh = false;
            const gather = (node: any) => {
              if (node?.render?.meshInstances) {
                for (const mi of node.render.meshInstances) {
                  const a = mi.aabb;
                  if (!a) continue;
                  hasMesh = true;
                  minX = Math.min(minX, a.center.x - a.halfExtents.x);
                  minY = Math.min(minY, a.center.y - a.halfExtents.y);
                  minZ = Math.min(minZ, a.center.z - a.halfExtents.z);
                  maxX = Math.max(maxX, a.center.x + a.halfExtents.x);
                  maxY = Math.max(maxY, a.center.y + a.halfExtents.y);
                  maxZ = Math.max(maxZ, a.center.z + a.halfExtents.z);
                }
              }
              for (const c of node.children || []) gather(c);
            };
            gather(ent);
            if (!hasMesh) { clearTimeout(timeout); finish(null); return; }

            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
            const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 || 1;
            const dist = radius * 3.2;
            cam.setPosition(cx + dist * 0.5, cy + dist * 0.42, cz + dist * 0.75);
            cam.lookAt(cx, cy, cz);
            if (cam.camera) {
              cam.camera.nearClip = Math.max(0.01, dist * 0.02);
              cam.camera.farClip = dist * 12;
            }

            app.start();
            // Chờ vài frame cho render ổn định rồi chụp ảnh
            let frames = 0;
            const grab = () => {
              if (settled) return;
              frames++;
              if (frames >= 4) {
                clearTimeout(timeout);
                let dataUrl: string | null = null;
                try { dataUrl = cv.toDataURL('image/png'); } catch (_) { dataUrl = null; }
                finish(dataUrl);
              } else {
                requestAnimationFrame(grab);
              }
            };
            requestAnimationFrame(grab);
          } catch (e) {
            clearTimeout(timeout);
            finish(null);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        finish(null);
      }
    });
  }

  /**
   * Kéo nút mũi tên trên UI: chỉnh vị trí / góc xoay / scale của đồ vật theo đúng một trục.
   * commit = false: cập nhật realtime theo pixel kéo; commit = true: kết thúc, phát giá trị cuối.
   */
  scrubTransform(propId: string, kind: 'pos' | 'rot' | 'scl', axis: number, deltaPx: number, commit: boolean): void {
    if (!propId) return;
    this._scrubTransform?.(propId, kind, axis, deltaPx, commit);
  }

  /** Chọn đồ vật từ menu danh sách (panel ĐỒ VẬT): highlight ring + phát callback như click trực tiếp trên canvas */
  selectPropById(propId: string): void {
    if (!propId) return;
    this._selectPropById?.(propId);
  }

  /** Đếm số entity bản sao nhân bản (PropGLB_*) đang tồn tại trên canvas 3D */
  get canvasPropCount(): number {
    if (!this.app || !this.app.root) return 0;
    return this.app.root.findByTag('prop_glb').length;
  }

  /** Kiểm tra entity của đồ vật có đang tồn tại trên canvas không (tra theo id trong danh sách) */
  hasPropEntity(propId: string): boolean {
    if (!propId || !this.app || !this.app.root) return false;
    return !!this.app.root.findByName(`PropGLB_${propId}`) || !!this.app.root.findByName(propId);
  }

  /** Reset toàn bộ đồ vật về mặc định: xóa đồ thêm vào, giữ đồ mặc định của app */
  /**
   * Thực thi mã JavaScript do người dùng cung cấp ngay trên ứng dụng PlayCanvas.
   * Mã chạy bên trong hàm với tham số sẵn có:
   *   app   — pc.Application của scene
   *   root  — app.root (thực thể gốc)
   *   pc    — namespace PlayCanvas engine
   *   service — SontinhSceneService (truy cập syncProps, hasPropEntity...)
   * Trả về { ok: true } hoặc { ok: false, error: thông điệp }
   */
  /** Ten file .js dang duoc import (component gan truoc khi goi runCanvasScript de registry hien ten that) */
  fileNameHint: string | null = null;

  runCanvasScript(code: string): { ok: boolean; error?: string } {
    if (!this.app) {
      return { ok: false, error: 'Canvas chưa sẵn sàng. Hãy mở phòng 3D trước.' };
    }
    if (!code || !code.trim()) {
      return { ok: false, error: 'File script rỗng.' };
    }
    const app = this.app;
    const root = app.root;
    const service = this;
    // (1) Tu chua loi cu phap "default:," (thieu gia tri) pho bien khi copy
    // script tu PlayCanvas Editor / web — lam new Function compile fail.
    let safe = code;
    try {
      safe = code.replace(/(default\s*:)\s*,/g, '$1 undefined,');
    } catch (e) { /* giu nguyen neu xu ly chuỗi gặp vấn đề */ }
    // (2) Neu la script kieu PlayCanvas Editor (pc.createScript + prototype.initialize/update):
    // chuyen sang pipeline effect da co san (normalizeFxScript + runPropEffect)
    // de script duoc gan vao Floor/san va nhan update tu engine.
    if (/pc\.createScript\s*\(/.test(safe) || /\.prototype\.(initialize|update)\s*=\s*function/.test(safe)) {
      try {
        // Thu hoi effect cung ten (neu co) de chay lai sach se
        const matched = /['"]([A-Za-z0-9_-]+)['"]\s*\)/.exec(safe);
        const effName = matched ? matched[1] : 'editor_' + Date.now();
        const okFx = this._runPropEffect?.({
          name: effName,
          script: safe,
          // Script Editor thuong thao tac tren material cua entity chua no
          // (vd script phu tuyet len san) — mac dinh gan vao Floor.
          targetPropName: 'Floor'
        });
        if (okFx) {
          // Dang ky vao danh sach Canvas Effects de dialog cau hinh dong
          // (chi voi script dang Editor co thuat toan ghe vao scene)
          if (this.fileNameHint) this.registerFxEffect(effName, this.fileNameHint, safe, {});
          else this.registerFxEffect(effName, 'script.js', safe, {});
          return { ok: true };
        }
        // runPropEffect khong kha dung (scene chua init effect runtime) — fail qua nhanh
        if (okFx === false && this._runPropEffect) {
          return { ok: false, error: 'Script Editor bị lỗi khi chạy qua effect runtime. Xem console để biết chi tiết.' };
        }
      } catch (fxErr: any) {
        console.warn('[SontinhSceneService] Editor-script effect pipeline failed, fallback raw:', fxErr);
      }
      // fallback: chay raw nhu cu (truong hop script engine-thuan khong phai Editor)
    }
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('app', 'root', 'pc', 'service', '"use strict";\n' + safe);
      fn(app, root, pc, service);
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[SontinhSceneService] Canvas script error:', err);
      return { ok: false, error: msg };
    }
  }

  resetPropsToDefault(): void {
    this._resetPropsToDefault?.();
  }

  /** Xóa một đồ vật ngay trên canvas (nút Delete cạnh ring): trả về true nếu xóa được */
  deletePropById(propId: string): boolean {
    if (!propId) return false;
    const ok = this._deletePropById?.(propId) ?? false;
    if (ok && this.onPropActionChange) this.ngZone.run(() => this.onPropActionChange!('delete', propId, null));
    return ok;
  }

  /** Nhân bản đồ vật đang chọn ra bản sao đặt cạnh (nút Duplicate cạnh ring): trả về id mới */
  duplicatePropById(propId: string): string | null {
    if (!propId) return null;
    const newId = this._duplicatePropById?.(propId) ?? null;
    if (newId && this.onPropActionChange) this.ngZone.run(() => this.onPropActionChange!('duplicate', propId, newId));
    return newId;
  }

  /** Bat/tat khoa cho do vat: khoa = khong keo duoc (Shift+keo), khong scrub vi tri/xoay/scale duoc */
  togglePropLock(propId: string, locked: boolean): void {
    const p = (this._profile as any)?.props?.find((pr: any) => pr?.id === propId);
    if (p) p.locked = !!locked;
    if (this.onPropLockChanged) this.ngZone.run(() => this.onPropLockChanged!(propId, !!locked));
  }

  /** Do vat dang bi khoa? */
  isPropLocked(propId: string): boolean {
    if (!propId) return false;
    const p = (this._profile as any)?.props?.find((pr: any) => pr?.id === propId);
    return !!p?.locked;
  }

  private _initPlayCanvasScene(
    canvas: HTMLCanvasElement,
    username: string,
    charGlbUrl: string | null,
    room306Data: any,
    furniture306Data: any,
    decorations306Data: any,
    shophousesData: any,
    trafficData: any
  ): void {
    if (this._destroyed) return;
    const self = this;
    const propAnimMap = new Map<string, { type: string; speed: number; basePos: pc.Vec3; baseScale: pc.Vec3 }>();

    // -------------------------------------------------------------
    // DRAG & DROP DO VAT (select bang click, keo tha di chuyen)
    // -------------------------------------------------------------
    let propDragCandidate: { ent: pc.Entity; propId: string } | null = null;
    let propDragActive = false;
    let dragPlaneY = 0;
    let dragStartPos = new pc.Vec3();
    let dragOffset = new pc.Vec3();
    let dragAccY = 0;
    let lastDragY: number | null = null;
    let prevShift = false;
    let selRing: pc.Entity | null = null;
    let selRingPropId: string | null = null; // propId đang được chọn (để nút del/dup làm việc)
    let lastAnchorVisible = false;
    let lastAnchorX = -1;
    let lastAnchorY = -1;
    // Kích thước ring gốc lúc fit (để ring tự co giãn theo scale khi kéo chỉnh)
    let selRingBaseD = 0;
    let selRingBaseScaleXZ = 1;
    let selRingBaseScaleY = 1;
    let selRingBaseOffsetY = 0.4;

    let ringOffsetY = 0;
    // Chỉnh transform (vị trí / góc xoay / scale) theo trục X/Y/Z từ nút mũi tên trên UI
    type TransformKind = 'pos' | 'rot' | 'scl';
    let tScrubEnt: pc.Entity | null = null;
    let tScrubPropId = '';
    let tScrubKind: TransformKind = 'pos';
    let tScrubAxis = -1;
    let tScrubActive = false;
    let tScrubAccum = 0;
    const tScrubStartPos = new pc.Vec3();
    const tScrubStartEuler = new pc.Vec3();
    const tScrubStartScale = new pc.Vec3();
    const normDeg = (v: number): number => { let r = (v + 180) % 360; if (r < 0) r += 360; return r - 180; };
    const round2 = (v: number): number => Math.round(v * 100) / 100;
    // Kéo nhóm đồ vật: đồng bộ các entity phụ của đồ vật (hiện không có món mặc định nào dùng nhóm)
    let propDragExtras: pc.Entity[] = [];
    let propExtrasBase: pc.Vec3[] = [];
    let propMainBase = new pc.Vec3();

    function collectAabb(ent: pc.Entity): pc.BoundingBox | null {
      const renders = ent.findComponents('render') as any[];
      let bb: pc.BoundingBox | null = null;
      for (const r of renders) {
        const mis = r.meshInstances || [];
        for (const mi of mis) {
          const a = mi.aabb;
          if (!a) continue;
          if (!bb) bb = a.clone();
          else bb.add(a);
        }
      }
      return bb;
    }

    function ensureSelRing() {
      if (selRing) return;
      selRing = new pc.Entity('PropSelRing');
      const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = new pc.Color(0.02, 0.85, 0.75);
      m.emissiveIntensity = 1.2;
      m.cull = pc.CULLFACE_NONE;
      m.update();
      const ringMesh = pc.Mesh.fromGeometry(
        app.graphicsDevice,
        new pc.TorusGeometry({
          ringRadius: 0.485,
          tubeRadius: 0.015,
          segments: 64,
          sides: 16
        })
      );
      const mi = new pc.MeshInstance(ringMesh, m);
      mi.castShadow = false;
      selRing.addComponent('render', { meshInstances: [mi] });
      (selRing.render as any).castShadows = false;
      selRing.tags.add('sel_ring');
      app.root.addChild(selRing);
      selRing.enabled = false;
    }

    function hideSelRing() {
      if (selRing) selRing.enabled = false;
      // FIX(bug bo nut Delete/Duplicate treo tren canvas): phai reset luon
      // selRingPropId va KHONG tu gan lastAnchorVisible = false tai day.
      // Gan tracker = false o nay de ticker trong app.on('update') thay
      // visible === lastAnchorVisible (false === false) nen khong bao gio
      // phat callback onPropActionAnchor(false,...) de an cap nut HTML.
      // Giu nguyen gia tri tracker cu de ticker tu nhan ra lech trang thai
      // (false !== true) va phat lenh an nut dung mot lan duy nhat.
      selRingPropId = null;
    }

    // ── Chỉnh tọa độ theo trục X/Y/Z từ nút mũi tên trên UI ─────────────────────
    // (gizmo 3D gắn vào đồ vật hay bị model che khuất, chuyển thành nút kéo trên UI)
    function findPropEntityById(propId: string): pc.Entity | null {
      const glb = app.root.findByName(`PropGLB_${propId}`) as pc.Entity | null;
      if (glb) return glb;
      return app.root.findByName(propId) as pc.Entity | null;
    }

    function beginTransformScrub(propId: string, kind: TransformKind, axis: number): boolean {
      const ent = findPropEntityById(propId);
      if (!ent) return false;
      if (self.isPropLocked(propId)) return false; // do vat khoa: khong scrub
      tScrubEnt = ent;
      tScrubPropId = propId;
      tScrubKind = kind;
      tScrubAxis = axis;
      tScrubActive = false;
      tScrubAccum = 0;
      preparePropExtras(ent);
      return true;
    }

    function moveTransformScrub(deltaPx: number): void {
      const ent = tScrubEnt;
      if (!ent || tScrubAxis < 0) return;
      if (!tScrubActive) {
        if (deltaPx === 0) return;
        tScrubActive = true;
        const p0 = ent.getPosition();
        tScrubStartPos.set(p0.x, p0.y, p0.z);
        const e0 = ent.getEulerAngles();
        tScrubStartEuler.set(e0.x, e0.y, e0.z);
        const s0 = ent.getLocalScale();
        tScrubStartScale.set(s0.x, s0.y, s0.z);
        tScrubAccum = 0;
        if (tScrubKind === 'pos') showSelRing(ent);
      }
      if (tScrubKind === 'pos') {
        // Đổi pixel thành đơn vị scene: co giãn theo khoảng cách camera, zoom gần chỉnh càng tinh
        const k = Math.max(0.008, orbitDistance * 0.0011);
        tScrubAccum += deltaPx * k;
        const nx = tScrubStartPos.x + (tScrubAxis === 0 ? tScrubAccum : 0);
        const ny = tScrubAxis === 1 ? tScrubStartPos.y + tScrubAccum : tScrubStartPos.y; // Y tu do, khong gioi han
        const nz = tScrubStartPos.z + (tScrubAxis === 2 ? tScrubAccum : 0);
        ent.setPosition(nx, ny, nz);
        if (propDragExtras.length) {
          const ddx = nx - propMainBase.x, ddy = ny - propMainBase.y, ddz = nz - propMainBase.z;
          for (let i = 0; i < propDragExtras.length; i++) {
            const b = propExtrasBase[i];
            propDragExtras[i].setPosition(b.x + ddx, b.y + ddy, b.z + ddz);
          }
        }
        moveSelRing(ent);
      } else if (tScrubKind === 'rot') {
        // 0.5 độ / pixel: kéo 360px quay hết một vòng
        tScrubAccum += deltaPx * 0.5;
        const nx = tScrubAxis === 0 ? normDeg(tScrubStartEuler.x + tScrubAccum) : tScrubStartEuler.x;
        const ny = tScrubAxis === 1 ? normDeg(tScrubStartEuler.y + tScrubAccum) : tScrubStartEuler.y;
        const nz = tScrubAxis === 2 ? normDeg(tScrubStartEuler.z + tScrubAccum) : tScrubStartEuler.z;
        ent.setEulerAngles(nx, ny, nz);
        // Xoay đồng bộ các entity phụ của đồ vật (nếu có)
        for (let i = 0; i < propDragExtras.length; i++) propDragExtras[i].setEulerAngles(nx, ny, nz);
      } else {
        // 1% / pixel — scale ĐỒNG ĐỀU cả 3 trục X, Y, Z (giữ nguyên tỷ lệ hình dạng)
        tScrubAccum += deltaPx * 0.01;
        const f = 1 + tScrubAccum;
        const cl = (v: number) => Math.max(0.05, Math.min(50, v * f));
        const nx = cl(tScrubStartScale.x);
        const ny = cl(tScrubStartScale.y);
        const nz = cl(tScrubStartScale.z);
        ent.setLocalScale(nx, ny, nz);
        // Scale thuần túy: KHÔNG đụng vào vị trí — tọa độ giữ nguyên tuyệt đối.
        // (đã bỏ cơ chế tự nâng/hạ Y khi scale GLB: nó khiến kéo scale nhìn như
        // đang kéo vị trí Y, gây hiểu lầm panel tọa độ nhảy theo)
        for (let i = 0; i < propDragExtras.length; i++) propDragExtras[i].setLocalScale(nx, ny, nz);
        // Prop pulse lấy gốc scale mới để không giật lại giá trị cũ
        const animCfgS = propAnimMap.get(ent.name) || propAnimMap.get(tScrubPropId);
        if (animCfgS) animCfgS.baseScale.set(nx, ny, nz);
        // Vòng chọn co giãn theo scale mới
        moveSelRing(ent);
      }
      const tp = ent.getPosition();
      const tpR = { x: round2(tp.x), y: round2(tp.y), z: round2(tp.z) };
      if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(tScrubPropId, tpR));
      if (_svc.onPropTransformChanged) {
        if (tScrubKind === 'rot') {
          const e2 = ent.getEulerAngles();
          const vr = { x: round2(normDeg(e2.x)), y: round2(normDeg(e2.y)), z: round2(normDeg(e2.z)) };
          _svc.ngZone.run(() => _svc.onPropTransformChanged!(tScrubPropId, 'rot', vr));
        } else if (tScrubKind === 'scl') {
          const s2 = ent.getLocalScale();
          const vs = { x: round2(s2.x), y: round2(s2.y), z: round2(s2.z) };
          _svc.ngZone.run(() => _svc.onPropTransformChanged!(tScrubPropId, 'scl', vs));
        } else {
          _svc.ngZone.run(() => _svc.onPropTransformChanged!(tScrubPropId, 'pos', tpR));
        }
      }
    }

    function endTransformScrub(): void {
      const ent = tScrubEnt;
      const propId = tScrubPropId;
      const kind = tScrubKind;
      tScrubEnt = null;
      tScrubPropId = '';
      tScrubAxis = -1;
      tScrubAccum = 0;
      const wasActive = tScrubActive;
      tScrubActive = false;
      propDragExtras = [];
      propExtrasBase = [];
      if (!ent || !wasActive) return;
      const tp = ent.getPosition();
      const tpR = { x: round2(tp.x), y: round2(tp.y), z: round2(tp.z) };
      if (kind === 'pos') {
        const p = ent.getPosition();
        const animCfg = propAnimMap.get(ent.name) || propAnimMap.get(propId);
        if (animCfg) animCfg.basePos.set(p.x, p.y, p.z);
        const pos = { x: round2(p.x), y: round2(p.y), z: round2(p.z) };
        if (_svc.onPropDragged) _svc.ngZone.run(() => _svc.onPropDragged!(propId, pos));
        if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(propId, pos));
        if (_svc.onPropTransformCommit) _svc.ngZone.run(() => _svc.onPropTransformCommit!(propId, 'pos', pos));
      } else if (kind === 'rot') {
        const e = ent.getEulerAngles();
        const vals = { x: round2(normDeg(e.x)), y: round2(normDeg(e.y)), z: round2(normDeg(e.z)) };
        if (_svc.onPropTransformCommit) _svc.ngZone.run(() => _svc.onPropTransformCommit!(propId, 'rot', vals));
        if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(propId, tpR));
      } else {
        const s = ent.getLocalScale();
        const vals = { x: round2(s.x), y: round2(s.y), z: round2(s.z) };
        const animCfg = propAnimMap.get(ent.name) || propAnimMap.get(propId);
        if (animCfg) animCfg.baseScale.set(vals.x, vals.y, vals.z);
        if (_svc.onPropTransformCommit) _svc.ngZone.run(() => _svc.onPropTransformCommit!(propId, 'scl', vals));
        if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(propId, tpR));
        // GLB: persist luon Y da nang theo ty le scale (day khong lun) vao prop
        if (ent.tags.has('prop_glb') && _svc.onPropDragged) _svc.ngZone.run(() => _svc.onPropDragged!(propId, tpR));
      }
    }

    // Component gọi service.scrubTransform() khi kéo nút mũi tên pos/rot/scl dưới box tọa độ
    self._scrubTransform = (propId: string, kind: TransformKind, axis: number, deltaPx: number, commit: boolean) => {
      if (commit) {
        endTransformScrub();
        return;
      }
      if (!tScrubEnt || tScrubPropId !== propId || tScrubKind !== kind || tScrubAxis !== axis) {
        if (!beginTransformScrub(propId, kind, axis)) return;
      }
      moveTransformScrub(deltaPx);
    };

    // Chọn đồ vật từ menu danh sách (panel ĐỒ VẬT): hiện ring + phát callback như click trực tiếp
    self._selectPropById = (propId: string) => {
      const ent = findPropEntityById(propId);
      if (!ent) return;
      showSelRing(ent);
      const p = ent.getPosition();
      const pos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100 };
      if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(propId, pos));
    };

    // Reset đồ vật về mặc định: bỏ chọn, hủy scrub, xóa toàn bộ đồ vật người dùng (không còn món mặc định nào)
    self._resetPropsToDefault = () => {
      // Dừng mọi phiên kéo transform đang chạy
      try { endTransformScrub(); } catch (_) {}
      tScrubPropId = '';

      // Bỏ chọn đồ vật hiện tại (ẩn ring + overlay)
      hideSelRing();
      if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(null, null));

      // Xóa mọi entity đồ vật người dùng (GLB wrapper + primitive)
      if (app?.root) {
        for (const ent of app.root.findByTag('user_prop') as pc.Entity[]) {
          try { ent.destroy(); } catch (_) {}
        }
      }

      // Sync dọn dẹp + phát callback component nạp lại panel
      if (_svc.onPropsReset) _svc.ngZone.run(() => _svc.onPropsReset!());
    };

    // Xóa một đồ vật ngay trên canvas (nút Delete cạnh ring)
    self._deletePropById = (propId: string): boolean => {
      if (!propId) return false;
      const ent = findPropEntityById(propId);
      if (!ent) return false;
      try { endTransformScrub(); } catch (_) {}
      tScrubPropId = '';
      try {
        ent.destroy();
      } catch (e) {
        console.warn('[SontinhScene] Delete prop failed:', propId, e);
        return false;
      }
      if (propAnimMap.has(propId)) propAnimMap.delete(propId);
      if (selRingPropId === propId || tScrubPropId === propId) hideSelRing();
      hideSelRing();
      if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(null, null));
      return true;
    };

    // Nhân bản đồ vật đang chọn: bản sao đặt cạnh phải, tự gán id mới
    self._duplicatePropById = (propId: string): string | null => {
      if (!propId || !app) return null;
      const src = findPropEntityById(propId);
      if (!src) return null;
      try {
        const newId = `${propId}_${Date.now()}`;
        const clone = src.clone() as pc.Entity;
        clone.name = `PropGLB_${newId}`;
        if (!(clone as any).tags?.has('user_prop')) (clone as any).tags?.add('user_prop');
        if (!(clone as any).tags?.has('prop_glb')) (clone as any).tags?.add('prop_glb');

        // Vị trí bản sao: cạnh phải món gốc theo bounding box, lề 0.5
        let aabb = collectAabb(src);
        let off = 1.2;
        if (aabb) off = aabb.halfExtents.x * 2 + 0.5;
        const sp = src.getPosition();
        const np = { x: sp.x + off, y: sp.y, z: sp.z };
        clone.setPosition(np.x, np.y, np.z);

        app.root.addChild(clone);

        // Đưa bản sao vào danh sách roomProps để sync không dọn nhầm + lưu đĩa
        const srcProp = (_svc._profile as any)?.props?.find((pr: any) => pr?.id === propId);
        const name0 = srcProp?.name || propId;
        const cnt = ((_svc._profile as any)?.props || []).filter((pr: any) => pr?.name?.startsWith(name0)).length;
        const newProp = {
          id: newId,
          name: cnt > 0 ? `${name0} ${cnt + 1}` : name0,
          type: srcProp?.type || 'model',
          // Giữ shape của món gốc (model/primitive) để syncProps không sinh khối hộp ma cho bản sao
          shape: srcProp?.shape || 'model',
          glbPath: srcProp?.glbPath || '',
          thumbnail: srcProp?.thumbnail || null,
          position: { x: Math.round(np.x * 100) / 100, y: Math.round(np.y * 100) / 100, z: Math.round(np.z * 100) / 100 },
          rotation: srcProp?.rotation ? { ...srcProp.rotation } : { x: 0, y: 0, z: 0 },
          scale: srcProp?.scale ? { ...srcProp.scale } : { x: 1, y: 1, z: 1 },
          color: srcProp?.color ?? null,
          visible: true,
          interactive: srcProp?.interactive ?? true,
          clickAction: srcProp?.clickAction || 'focus',
          locked: !!srcProp?.locked,
          // Bản sao chỉ tồn tại trên canvas 3D: không thêm mục mới trong menu ĐỒ VẬT
          hiddenFromList: true
        };
        const arr = ((_svc._profile as any).props = ((_svc._profile as any).props || []));
        arr.push(newProp);

        // Chọn luôn bản sao mới (ring ôm bản sao)
        showSelRing(clone);
        const p2 = clone.getPosition();
        const pos2 = { x: Math.round(p2.x * 100) / 100, y: Math.round(p2.y * 100) / 100, z: Math.round(p2.z * 100) / 100 };
        if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(newId, pos2));
        return newId;
      } catch (e) {
        console.warn('[SontinhScene] Duplicate prop failed:', propId, e);
        return null;
      }
    };

    function showSelRing(ent: pc.Entity) {
      ensureSelRing();
      if (!selRing) return;
      const bb = collectAabb(ent);
      const p = ent.getPosition();
      if (bb) {
        const r = Math.max(bb.halfExtents.x, bb.halfExtents.z) + 0.25;
        const d = Math.max(0.6, r * 2);
        selRing.setLocalScale(d, 0.25, d);
        ringOffsetY = p.y - (bb.center.y - bb.halfExtents.y);
        selRing.setPosition(p.x, p.y - ringOffsetY + 0.04, p.z);
      } else {
        ringOffsetY = 0.4;
        selRing.setLocalScale(1.6, 0.25, 1.6);
        selRing.setPosition(p.x, p.y - 0.4, p.z);
      }
      selRingBaseD = selRing.getLocalScale().x;
      selRingBaseOffsetY = ringOffsetY;
      const s0 = ent.getLocalScale();
      selRingBaseScaleXZ = Math.max(0.0001, (s0.x + s0.z) * 0.5);
      selRingBaseScaleY = Math.max(0.0001, s0.y);
      selRing.enabled = true;
      const nm = ent.name;
      selRingPropId = nm.startsWith('PropGLB_') ? nm.slice(8) : nm;
    }

    function moveSelRing(ent: pc.Entity) {
      if (!selRing || !selRing.enabled) return;
      // Ring co giãn theo scale hiện tại của đồ vật (kéo chỉnh scale là ring tự theo)
      const s = ent.getLocalScale();
      const fXZ = Math.max(0.0001, (s.x + s.z) * 0.5) / selRingBaseScaleXZ;
      const fY = Math.max(0.0001, s.y / selRingBaseScaleY);
      const d = Math.max(0.6, selRingBaseD * fXZ);
      selRing.setLocalScale(d, 0.25, d);
      ringOffsetY = selRingBaseOffsetY * fY;
      const p = ent.getPosition();
      selRing.setPosition(p.x, p.y - ringOffsetY + 0.04, p.z);
    }

    function rayPlaneHit(sx: number, sy: number, planeY: number): pc.Vec3 | null {
      if (!camera || !camera.camera) return null;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(sx, sy, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(sx, sy, camera.camera.farClip, rayTo);
      const dir = rayTo.clone().sub(rayFrom).normalize();
      if (Math.abs(dir.y) < 1e-5) return null;
      const t = (planeY - rayFrom.y) / dir.y;
      if (t <= 0) return null;
      return rayFrom.add(dir.scale(t));
    }

    function pickUserPropAt(sx: number, sy: number): { ent: pc.Entity; propId: string } | null {
      if (!camera || !camera.camera) return null;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(sx, sy, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(sx, sy, camera.camera.farClip, rayTo);
      const dir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, dir);
      let best: { ent: pc.Entity; propId: string } | null = null;
      let bestT = Infinity;
      for (const ent of app.root.findByTag('user_prop') as pc.Entity[]) {
        if (!ent.enabled) continue;
        const bb = collectAabb(ent);
        if (!bb) continue;
        const hit = new pc.Vec3();
        if (bb.intersectsRay(ray, hit)) {
          const t = hit.clone().sub(rayFrom).length();
          if (t < bestT) {
            bestT = t;
            const en0 = ent.name;
            const pid0 = en0.startsWith('PropGLB_') ? en0.slice(8) : en0;
            best = { ent, propId: pid0 };
          }
        }
      }
      return best;
    }

    function preparePropExtras(ent: pc.Entity) {
      propDragExtras = [];
      propExtrasBase = [];
      propMainBase.copy(ent.getPosition());
    }

    function beginPropDrag(hit: { ent: pc.Entity; propId: string }) {
      propDragCandidate = hit;
      propDragActive = false;
      preparePropExtras(hit.ent);
    }

    function handlePropDragMove(sx: number, sy: number) {
      if (!propDragCandidate) return;
      if (self.isPropLocked(propDragCandidate.propId)) return; // do vat khoa: khong keo (click van chon duoc qua mouseup)
      if (!propDragActive) {
        if (Math.hypot(sx - mouseDownPos.x, sy - mouseDownPos.y) < 3) return;
        propDragActive = true;
        const p = propDragCandidate.ent.getPosition();
        dragStartPos.copy(p);
        dragPlaneY = p.y;
        const hit = rayPlaneHit(mouseDownPos.x, mouseDownPos.y, dragPlaneY);
        dragOffset = hit ? hit.clone().sub(p) : new pc.Vec3();
        dragAccY = 0;
        lastDragY = sy;
        prevShift = false;
        showSelRing(propDragCandidate.ent);
      }
      const ent = propDragCandidate.ent;
      const shift = !!(wasdKeys['ShiftLeft'] || wasdKeys['ShiftRight']);
      if (shift) {
        const k = Math.max(0.02, orbitDistance * 0.0022);
        dragAccY += ((lastDragY ?? sy) - sy) * k;
        lastDragY = sy;
        const ny = dragStartPos.y + dragAccY; // Y tu do, khong gioi han
        ent.setPosition(dragStartPos.x, ny, dragStartPos.z);
        dragPlaneY = ny;
      } else {
        if (prevShift) dragStartPos.copy(ent.getPosition());
        const hit = rayPlaneHit(sx, sy, dragPlaneY);
        if (hit) {
          const np = hit.clone().add(dragOffset);
          ent.setPosition(np.x, dragPlaneY, np.z);
        }
      }
      prevShift = shift;
      if (propDragExtras.length) {
        const cpn = ent.getPosition();
        const ddx = cpn.x - propMainBase.x, ddy = cpn.y - propMainBase.y, ddz = cpn.z - propMainBase.z;
        for (let i = 0; i < propDragExtras.length; i++) {
          const b = propExtrasBase[i];
          propDragExtras[i].setPosition(b.x + ddx, b.y + ddy, b.z + ddz);
        }
      }
      moveSelRing(ent);
      const tp = ent.getPosition();
      const tpR = { x: Math.round(tp.x * 100) / 100, y: Math.round(tp.y * 100) / 100, z: Math.round(tp.z * 100) / 100 };
      const pidTick = propDragCandidate ? propDragCandidate.propId : '';
      if (pidTick && _svc.onPropSelected) {
        _svc.ngZone.run(() => _svc.onPropSelected!(pidTick, tpR));
      }
    }

    function handlePropMouseUp(_sx: number, _sy: number, dist: number) {
      isDragging = false;
      propDragExtras = [];
      propExtrasBase = [];
      const cand = propDragCandidate;
      propDragCandidate = null;
      if (!cand) { propDragActive = false; return; }
      const ent = cand.ent;
      if (propDragActive && dist >= 3) {
        propDragActive = false;
        const p = ent.getPosition();
        const animCfg = propAnimMap.get(ent.name) || propAnimMap.get(cand.propId);
        if (animCfg) animCfg.basePos.set(p.x, p.y, p.z);
        showSelRing(ent);
        const pos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100 };
        if (_svc.onPropDragged) _svc.ngZone.run(() => _svc.onPropDragged!(cand.propId, pos));
        if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(cand.propId, pos));
      } else {
        propDragActive = false;
        showSelRing(ent);
        const pClick = ent.getPosition();
        const posClick = { x: Math.round(pClick.x * 100) / 100, y: Math.round(pClick.y * 100) / 100, z: Math.round(pClick.z * 100) / 100 };
        if (_svc.onPropClicked) _svc.ngZone.run(() => _svc.onPropClicked!(cand.propId));
        if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(cand.propId, posClick));
      }
    }

    this._setCharacterTransformFn = (opts) => {
      const pivot = app.root.findByName("Char_Yen_Root") || app.root.findByName("Char_BodyRoot");
      if (pivot) {
        if (opts.position) {
          pivot.setPosition(opts.position.x, opts.position.y, opts.position.z);
          charCurrentPos.x = opts.position.x;
          charCurrentPos.z = opts.position.z;
        }
        if (typeof opts.facingAngle === "number") {
          charCurrentYaw = opts.facingAngle;
          pivot.setEulerAngles(0, opts.facingAngle, 0);
        }
      }
      const body = self._charBodyRoot || app.root.findByName("Char_BodyRoot");
      if (body && typeof opts.scale === "number") {
        body.setLocalScale(opts.scale, opts.scale, opts.scale);
      }
    };

    this._setCharacterVisibilityFn = (visible: boolean) => {
      const pivot = app.root.findByName("Char_Yen_Root") || app.root.findByName("Char_BodyRoot");
      if (pivot) (pivot as any).enabled = visible;
    };

    this._setEnvironmentColorsFn = (opts) => {
      if (opts.bg && camera.camera) {
        camera.camera.clearColor = new pc.Color().fromString(opts.bg);
      }
      if (opts.table) {
        const table = app.root.findByName("Showroom_TableTop");
        if (table && (table as any).render?.material) {
          (table as any).render.material.diffuse = new pc.Color().fromString(opts.table);
          (table as any).render.material.update();
        }
      }
      if (opts.cloth) {
        const cloth = app.root.findByName("Showroom_Cloth");
        if (cloth && (cloth as any).render?.meshInstances?.[0]?.material) {
          (cloth as any).render.meshInstances[0].material.diffuse = new pc.Color().fromString(opts.cloth);
          (cloth as any).render.meshInstances[0].material.update();
        }
      }
    };
    // Scene mặc định trống: ẩn toàn bộ tòa nhà / phòng / phố dựng sẵn,
    // người dùng tự thêm đồ vật vào scene PlayCanvas của họ.
    const EMPTY_SCENE = true;
    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      keyboard: new pc.Keyboard(window),
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
        stencil: true
      }
    });
    
    // FILLMODE_NONE: canvas tự resize theo parent container, không fill toàn window
    // → sidebar và các UI khác không bị che
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // 🚀 Pixel ratio
    app.graphicsDevice.maxPixelRatio = window.devicePixelRatio || 1;

    // Resize canvas theo parent container (content area), không theo toàn window
    const resizeToContainer = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width  = Math.floor(w * (window.devicePixelRatio || 1));
        canvas.height = Math.floor(h * (window.devicePixelRatio || 1));
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        app.resizeCanvas(w, h);
      }
    };

    // ResizeObserver theo dõi parent container — phản ứng ngay khi sidebar toggle
    const ro = new ResizeObserver(resizeToContainer);
    ro.observe(canvas.parentElement!);
    resizeToContainer(); // initial size

    // Cleanup khi destroy
    const origDestroy = app.destroy.bind(app);
    app.destroy = () => { ro.disconnect(); origDestroy(); };

    // 🎬 CINEMATIC PHOTOREALISTIC LIGHTING PIPELINE
    app.scene.exposure = 1.25;
    
    app.start();
    
    // -------------------------------------------------------------
    // GLOBAL ROOM 306 DIMENSIONS & ANCHORS (LOADED DYNAMICALLY FROM MODULAR JSON DATA)
    // -------------------------------------------------------------
    const ROOM_WIDTH_X = room306Data.dimensions.width;
    const ROOM_DEPTH_Z = room306Data.dimensions.depth;
    const WALL_H = room306Data.dimensions.height;
    
    const BACK_WALL_Z = -ROOM_DEPTH_Z / 2; // -40.0m Back Wall anchor point
    const WS_DY     = 2.8; // Workstation Y lift for desk surface
    const CHAIR_LIFT = WS_DY - 0.8; // Chair seat sits 0.8 units lower than desk for ergonomic fit
    
    // -------------------------------------------------------------
    // 1. DYNAMIC AMBIENT & ULTRA-HIGH QUALITY LIGHTING (8K SHADOW MAPS)
    // -------------------------------------------------------------
    app.scene.ambientLight = new pc.Color(0.24, 0.26, 0.35);
    
    // Main Sun Directional Light (Ultra 8K 8192 Shadow Map Resolution)
    const sunLight = new pc.Entity('SunLight');
    sunLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1.0, 0.94, 0.82),
      intensity: 2.8,
      castShadows: true,
      shadowBias: 0.03,
      normalOffsetBias: 0.02,
      shadowResolution: 8192
    });
    sunLight.setEulerAngles(35, 120, 0);
    app.root.addChild(sunLight);
    
    // ☀️ Warm Golden Sunbeam Streaming through the Taller Window (Right Wall X: 40)
    const window2Light = new pc.Entity('Window2Light');
    window2Light.addComponent('light', {
      type: 'spot',
      color: new pc.Color(1.0, 0.88, 0.65),
      intensity: 1.8,
      range: 110,
      innerConeAngle: 35,
      outerConeAngle: 65,
      castShadows: true,
      shadowResolution: 2048
    });
    window2Light.setPosition(40, 20.0, 0);
    window2Light.setEulerAngles(-28, -90, 0);
    app.root.addChild(window2Light);
    
    // 💡 4 HIGH-WALL LINEAR LED DOWNLIGHTS
    const backLedLight = new pc.Entity('BackLedLight');
    backLedLight.addComponent('light', { type: 'omni', color: new pc.Color(0.95, 0.98, 1.0), intensity: 4.8, range: 95 });
    backLedLight.setPosition(0, 32.5, BACK_WALL_Z + 1.0);
    app.root.addChild(backLedLight);
    
    const frontLedLight = new pc.Entity('FrontLedLight');
    frontLedLight.addComponent('light', { type: 'omni', color: new pc.Color(0.95, 0.98, 1.0), intensity: 4.8, range: 95 });
    frontLedLight.setPosition(0, 32.5, -BACK_WALL_Z - 1.0);
    app.root.addChild(frontLedLight);
    
    const leftLedLight = new pc.Entity('LeftLedLight');
    leftLedLight.addComponent('light', { type: 'omni', color: new pc.Color(0.95, 0.98, 1.0), intensity: 4.8, range: 95 });
    leftLedLight.setPosition(-ROOM_WIDTH_X / 2 + 1.0, 32.5, 0);
    app.root.addChild(leftLedLight);
    
    const rightLedLight = new pc.Entity('RightLedLight');
    rightLedLight.addComponent('light', { type: 'omni', color: new pc.Color(0.95, 0.98, 1.0), intensity: 4.8, range: 95 });
    rightLedLight.setPosition(ROOM_WIDTH_X / 2 - 1.0, 32.5, 0);
    app.root.addChild(rightLedLight);
    
    // Under-Pegboard Warm LED Strip Backlight
    const pegboardBacklight = new pc.Entity('PegboardBacklight');
    pegboardBacklight.addComponent('light', {
      type: 'omni',
      color: new pc.Color(1.0, 0.75, 0.4),
      intensity: 4.5,
      range: 20
    });
    pegboardBacklight.setPosition(-9.0, 7.5 + WS_DY, BACK_WALL_Z + 1.8);
    app.root.addChild(pegboardBacklight);
    
    // Left Workstation Monitor Glow — hắt ánh sáng xanh dương khi tắt đèn
    const leftMonitorGlow = new pc.Entity('LeftMonitorGlow');
    leftMonitorGlow.addComponent('light', {
      type: 'omni',
      color: new pc.Color(0.2, 0.7, 1.0),
      intensity: 4.0,
      range: 22
    });
    leftMonitorGlow.setPosition(-15.0, 5.2 + WS_DY, BACK_WALL_Z + 5.0);
    app.root.addChild(leftMonitorGlow);
    
    // Right Workstation Monitor Glow — hắt ánh sáng hồng tím khi tắt đèn
    const rightMonitorGlow = new pc.Entity('RightMonitorGlow');
    rightMonitorGlow.addComponent('light', {
      type: 'omni',
      color: new pc.Color(0.8, 0.3, 0.9),
      intensity: 4.0,
      range: 22
    });
    rightMonitorGlow.setPosition(-3.0, 5.2 + WS_DY, BACK_WALL_Z + 5.0);
    app.root.addChild(rightMonitorGlow);
    
    // -------------------------------------------------------------
    // 2. 3D INTERACTIVE ORBIT CAMERA CONTROLLER & PRESETS
    // -------------------------------------------------------------
    const cameraParent = new pc.Entity('CameraParent');
    app.root.addChild(cameraParent);
    
    const camera = new pc.Entity('Camera');
    camera.addComponent('camera', {
      clearColor: new pc.Color(0.06, 0.08, 0.12),
      farClip: 600,
      fov: 52
    });
    cameraParent.addChild(camera);
    
    // Camera Presets
    const DESK_VIEW = {
      pivot: new pc.Vec3(-9.0, 8.5 + WS_DY, BACK_WALL_Z + 10.5),
      yaw: 28,
      pitch: 24,
      distance: 32
    };
    
    const STREET_WINDOW_VIEW = {
      pivot: new pc.Vec3(70.0, 8.0, 0.0),
      yaw: -85,
      pitch: 28,
      distance: 42
    };
    
    const PICTURE_VIEW = {
      pivot: new pc.Vec3(69.65, 16.0, 28.5),
      yaw: -90,
      pitch: 0,
      distance: 14.0
    };
    
    const AQUARIUM_VIEW = {
      pivot: new pc.Vec3(0.0, 4.95 + WS_DY, BACK_WALL_Z + 2.0),
      yaw: 0,
      pitch: 6,
      distance: 7.5
    };
    
    let isWindowViewActive = false;
    let isPictureViewActive = false;
    let isAquariumViewActive = false;
    let isPropCameraActive = false;
    
    let targetPivot = DESK_VIEW.pivot.clone();
    let currentPivot = DESK_VIEW.pivot.clone();
    
    let orbitYaw = DESK_VIEW.yaw;     
    let orbitPitch = DESK_VIEW.pitch;     
    let orbitDistance = DESK_VIEW.distance;  
    
    let targetYaw = DESK_VIEW.yaw;
    let targetPitch = DESK_VIEW.pitch;
    let targetDistance = DESK_VIEW.distance;
    
    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;

    self._applyCameraPreset = (presetName: string) => {
      let p = (presetName || '').toLowerCase();
      if (EMPTY_SCENE && !p.startsWith('prop_') && p !== 'custom') p = 'default'; // studio trống: luôn nhìn chính diện bàn
      isWindowViewActive = false;
      isPictureViewActive = false;
      isAquariumViewActive = false;
      isPropCameraActive = true;

      switch (p) {
        case 'prop_main_desk':
        case 'desk':
        case 'desk_view':
          targetPivot.set(0.0, 4.2 + WS_DY, BACK_WALL_Z + 4.0);
          targetYaw = 0; targetPitch = 20; targetDistance = 18;
          break;

        case 'prop_chair_left':
        case 'chair_left':
          targetPivot.set(-6.0, 2.5, BACK_WALL_Z + 8.2);
          targetYaw = 30; targetPitch = 15; targetDistance = 12;
          break;

        case 'prop_chair_right':
        case 'chair_right':
          targetPivot.set(6.0, 2.5, BACK_WALL_Z + 8.2);
          targetYaw = -30; targetPitch = 15; targetDistance = 12;
          break;

        case 'prop_monitor_left':
        case 'monitor_left':
          targetPivot.set(-6.0, 6.2 + WS_DY, BACK_WALL_Z + 2.5);
          targetYaw = 15; targetPitch = 10; targetDistance = 10;
          break;

        case 'prop_monitor_right':
        case 'monitor_right':
          targetPivot.set(6.0, 6.2 + WS_DY, BACK_WALL_Z + 2.5);
          targetYaw = -15; targetPitch = 10; targetDistance = 10;
          break;

        case 'prop_mechanical_keyboard_left':
        case 'keyboard_left':
          targetPivot.set(-6.6, 4.2 + WS_DY, BACK_WALL_Z + 4.3);
          targetYaw = 20; targetPitch = 25; targetDistance = 8;
          break;

        case 'prop_mechanical_keyboard_right':
        case 'keyboard_right':
          targetPivot.set(5.4, 4.2 + WS_DY, BACK_WALL_Z + 4.3);
          targetYaw = -20; targetPitch = 25; targetDistance = 8;
          break;

        case 'prop_aquarium':
        case 'aquarium':
        case 'aquarium_view':
          targetPivot.set(0.0, 4.95 + WS_DY, BACK_WALL_Z + 2.0);
          targetYaw = 0; targetPitch = 8; targetDistance = 8;
          break;

        case 'prop_pegboard':
        case 'pegboard':
          targetPivot.set(0.0, 12.8 + WS_DY, BACK_WALL_Z + 0.5);
          targetYaw = 0; targetPitch = 10; targetDistance = 14;
          break;

        case 'prop_ps5_pro':
        case 'ps5_pro':
        case 'ps5':
          targetPivot.set(0.0, 10.5 + WS_DY, BACK_WALL_Z + 1.2);
          targetYaw = 0; targetPitch = 12; targetDistance = 10;
          break;

        case 'prop_tech_led_bar':
        case 'tech_led_bar':
        case 'led_bar':
          targetPivot.set(0.0, 7.2 + WS_DY, BACK_WALL_Z + 2.4);
          targetYaw = 0; targetPitch = 15; targetDistance = 10;
          break;

        case 'prop_wall_switch':
        case 'wall_switch':
        case 'switch':
          targetPivot.set(-69.5, 11.8, 6.8);
          targetYaw = 90; targetPitch = 10; targetDistance = 12;
          break;

        case 'prop_window_21_9':
        case 'window_21_9':
        case 'window':
        case 'street_window_view':
          targetPivot.set(70.0, 16.0, 0.0);
          targetYaw = -85; targetPitch = 20; targetDistance = 35;
          break;

        case 'prop_picture_frame':
        case 'picture_frame':
        case 'picture':
        case 'picture_view':
          targetPivot.set(69.65, 16.0, 28.5);
          targetYaw = -90; targetPitch = 0; targetDistance = 14;
          break;

        case 'prop_wall_clock':
        case 'wall_clock':
        case 'clock':
          targetPivot.set(0.0, 28.5, 39.5);
          targetYaw = 180; targetPitch = 10; targetDistance = 20;
          break;

        case 'prop_clothing_drawer':
        case 'clothing_drawer':
        case 'drawer':
        case 'wardrobe_view':
          targetPivot.set(12.0, 5.0, -18.0);
          targetYaw = 45; targetPitch = 15; targetDistance = 20;
          break;

        case 'prop_main_door':
        case 'main_door':
        case 'door':
        case 'door_view':
          targetPivot.set(-70.0, 10.0, 0.0);
          targetYaw = 90; targetPitch = 10; targetDistance = 25;
          break;

        case 'prop_ceiling_downlight_front':
        case 'downlight_front':
          targetPivot.set(0.0, 34.5, 38.75);
          targetYaw = 180; targetPitch = 45; targetDistance = 25;
          break;

        case 'prop_ceiling_downlight_back':
        case 'downlight_back':
          targetPivot.set(0.0, 34.5, -38.75);
          targetYaw = 0; targetPitch = 45; targetDistance = 25;
          break;

        case 'prop_ceiling_downlight_left':
        case 'downlight_left':
          targetPivot.set(-38.75, 34.5, 0.0);
          targetYaw = 90; targetPitch = 45; targetDistance = 25;
          break;

        case 'prop_ceiling_downlight_right':
        case 'downlight_right':
          targetPivot.set(38.75, 34.5, 0.0);
          targetYaw = -90; targetPitch = 45; targetDistance = 25;
          break;

        case 'prop_street_shophouses':
        case 'street_shophouses':
          targetPivot.set(70.0, 0.0, 0.0);
          targetYaw = -90; targetPitch = 25; targetDistance = 45;
          break;

        case 'prop_building_floor1':
        case 'floor1':
          targetPivot.set(0.0, -48.0, 0.0);
          targetYaw = 20; targetPitch = 25; targetDistance = 60;
          break;

        case 'prop_building_floor2':
        case 'floor2':
          targetPivot.set(0.0, -16.0, 0.0);
          targetYaw = 20; targetPitch = 25; targetDistance = 60;
          break;

        case 'prop_building_floor4':
        case 'floor4':
          targetPivot.set(0.0, 48.0, 0.0);
          targetYaw = 20; targetPitch = 25; targetDistance = 60;
          break;

        case 'prop_building_floor5':
        case 'floor5':
          targetPivot.set(0.0, 80.0, 0.0);
          targetYaw = 20; targetPitch = 25; targetDistance = 60;
          break;

        case 'prop_street_traffic_lanes':
        case 'street_traffic_lanes':
          targetPivot.set(90.0, -2.0, 0.0);
          targetYaw = -90; targetPitch = 35; targetDistance = 55;
          break;

        case 'prop_display_table':
        case 'display_table':
          targetPivot.set(0, 3.4, 0);
          targetYaw = 0; targetPitch = 14; targetDistance = 26;
          break;

        case 'character':
        case 'character_view':
          isPropCameraActive = false;
          const cp = charPivot ? charPivot.getPosition() : new pc.Vec3(0, 0, 0);
          targetPivot.set(cp.x, cp.y + 5, cp.z);
          targetYaw = 0; targetPitch = 12; targetDistance = 15;
          break;

        case 'overhead':
        case 'overhead_view':
          isPropCameraActive = false;
          targetPivot.set(0, 10, 0);
          targetYaw = 0; targetPitch = 85; targetDistance = 50;
          break;

        case 'default':
        case 'default_view':
        default:
          if (p !== 'custom') {
            isPropCameraActive = false;
            if (EMPTY_SCENE) {
              // Góc nhìn studio mặc định: chính diện, hơi cao
              targetPivot.set(0, 7, 0);
              targetYaw = 0; targetPitch = 12; targetDistance = 85;
            } else {
              targetPivot.set(0, 10, 0);
              targetYaw = 20; targetPitch = 30; targetDistance = 65;
            }
          }
          break;
      }
    };
    
    function toggleWindowStreetView() {
      isPictureViewActive = false;
      isAquariumViewActive = false;
      isWindowViewActive = !isWindowViewActive;
      if (isWindowViewActive) {
        targetPivot.copy(STREET_WINDOW_VIEW.pivot);
        targetYaw = STREET_WINDOW_VIEW.yaw;
        targetPitch = STREET_WINDOW_VIEW.pitch;
        targetDistance = STREET_WINDOW_VIEW.distance;
      } else {
        targetPivot.copy(DESK_VIEW.pivot);
        targetYaw = DESK_VIEW.yaw;
        targetPitch = DESK_VIEW.pitch;
        targetDistance = DESK_VIEW.distance;
      }
    }
    
    function togglePictureView() {
      isWindowViewActive = false;
      isAquariumViewActive = false;
      isPictureViewActive = !isPictureViewActive;
      if (isPictureViewActive) {
        targetPivot.copy(PICTURE_VIEW.pivot);
        targetYaw = PICTURE_VIEW.yaw;
        targetPitch = PICTURE_VIEW.pitch;
        targetDistance = PICTURE_VIEW.distance;
      } else {
        targetPivot.copy(DESK_VIEW.pivot);
        targetYaw = DESK_VIEW.yaw;
        targetPitch = DESK_VIEW.pitch;
        targetDistance = DESK_VIEW.distance;
      }
    }
    
    function toggleAquariumView() {
      isWindowViewActive = false;
      isPictureViewActive = false;
      isAquariumViewActive = !isAquariumViewActive;
      if (isAquariumViewActive) {
        targetPivot.copy(AQUARIUM_VIEW.pivot);
        targetYaw = AQUARIUM_VIEW.yaw;
        targetPitch = AQUARIUM_VIEW.pitch;
        targetDistance = AQUARIUM_VIEW.distance;
      } else {
        targetPivot.copy(DESK_VIEW.pivot);
        targetYaw = DESK_VIEW.yaw;
        targetPitch = DESK_VIEW.pitch;
        targetDistance = DESK_VIEW.distance;
      }
    }
    
    // Mouse & Touch Controls
    if (app.mouse) {
      app.mouse.on(pc.EVENT_MOUSEDOWN, (e: pc.MouseEvent) => {
        if (e.button === pc.MOUSEBUTTON_LEFT) {
          mouseDownPos.x = e.x;
          mouseDownPos.y = e.y;
          lastMouseX = e.x;
          lastMouseY = e.y;
          const hit = pickUserPropAt(e.x, e.y);
          if (hit) {
            beginPropDrag(hit);
            isDragging = false;
          } else {
            isDragging = true;
          }
        }
      });
    
      app.mouse.on(pc.EVENT_MOUSEUP, (e: pc.MouseEvent) => {
        const distMoved = Math.hypot(e.x - mouseDownPos.x, e.y - mouseDownPos.y);
        if (propDragCandidate || propDragActive) { handlePropMouseUp(e.x, e.y, distMoved); return; }
        if (distMoved < 5) {
          if (selRing && selRing.enabled && _svc.onPropSelected) {
            _svc.ngZone.run(() => _svc.onPropSelected!(null, null));
          }
          hideSelRing();
        }
        if (distMoved < 5) {
          if (!tryClickDrawer(e.x, e.y)) {
            if (!tryClickAquarium(e.x, e.y)) {
              if (!tryClickPicture(e.x, e.y)) {
                if (!tryClickCharacter(e.x, e.y)) {
                  if (!tryClickSubDevice(e.x, e.y)) {
                    if (!tryClickWindow(e.x, e.y)) {
                      if (!tryClickDoor(e.x, e.y)) {
                        tryClickLightSwitch(e.x, e.y);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
    
      app.mouse.on(pc.EVENT_MOUSEMOVE, (e: pc.MouseEvent) => {
        if (propDragCandidate || propDragActive) { handlePropDragMove(e.x, e.y); return; }
        if (!isDragging) return;
        const dx = e.x - lastMouseX;
        const dy = e.y - lastMouseY;
        lastMouseX = e.x;
        lastMouseY = e.y;
    
        targetYaw -= dx * 0.35;
        targetPitch = Math.max(-20, Math.min(80, targetPitch + dy * 0.35));
      });
    
      app.mouse.on(pc.EVENT_MOUSEWHEEL, (e: pc.MouseEvent) => {
        let delta = e.wheelDelta || 0;
        if (Math.abs(delta) > 10) delta = Math.sign(delta) * 2;
        // Zoom theo tỷ lệ khoảng cách hiện tại: camera càng xa cuộn càng nhanh, càng gần càng tinh
        const zoomDir = Math.sign(delta);
        if (zoomDir !== 0) {
          const zoomSpeed = 0.16; // 16% mỗi notch chuột giữa
          targetDistance = Math.max(3.5, Math.min(300.0, targetDistance * (1 - zoomDir * zoomSpeed)));
        }
      });
    }
    
    window.addEventListener('mouseup', () => {
      isDragging = false;
      if (propDragActive || propDragCandidate) handlePropMouseUp(lastMouseX, lastMouseY, 99);
      propDragCandidate = null;
    });
    
    // ── WASD / Arrow key state ───────────────────────────────────────────────────
    const wasdKeys: Record<string, boolean> = {};
    let wasdWasActive = false;
    
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Skip when typing in text fields
      }
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code) ||
          ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
      wasdKeys[code] = true;
      if (key) wasdKeys[key] = true;
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';
      wasdKeys[code] = false;
      if (key) wasdKeys[key] = false;
    });
    
    let lastPinchDist = 0;

    app.touch?.on(pc.EVENT_TOUCHSTART, (e: pc.TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].x;
        lastTouchY = e.touches[0].y;
        mouseDownPos.x = e.touches[0].x;
        mouseDownPos.y = e.touches[0].y;
        const hit = pickUserPropAt(e.touches[0].x, e.touches[0].y);
        if (hit) { beginPropDrag(hit); isDragging = false; }
        else { propDragCandidate = null; }
      } else if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].x - e.touches[1].x,
          e.touches[0].y - e.touches[1].y
        );
      }
    });
    
    app.touch?.on(pc.EVENT_TOUCHEND, (e: pc.TouchEvent) => {
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const distMoved = Math.hypot(touch.x - mouseDownPos.x, touch.y - mouseDownPos.y);
        if (propDragCandidate || propDragActive) { handlePropMouseUp(touch.x, touch.y, distMoved); isDragging = false; return; }
        if (distMoved < 5) {
          if (selRing && selRing.enabled && _svc.onPropSelected) {
            _svc.ngZone.run(() => _svc.onPropSelected!(null, null));
          }
          hideSelRing();
        }
        if (distMoved < 5) {
          if (!tryClickDrawer(touch.x, touch.y)) {
            if (!tryClickAquarium(touch.x, touch.y)) {
              if (!tryClickPicture(touch.x, touch.y)) {
                if (!tryClickCharacter(touch.x, touch.y)) {
                  if (!tryClickSubDevice(touch.x, touch.y)) {
                    if (!tryClickWindow(touch.x, touch.y)) {
                      if (!tryClickDoor(touch.x, touch.y)) {
                        tryClickLightSwitch(touch.x, touch.y);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      isDragging = false;
    });
    
    app.touch?.on(pc.EVENT_TOUCHMOVE, (e: pc.TouchEvent) => {
      if (e.touches.length === 1) {
        if (propDragCandidate || propDragActive) { handlePropDragMove(e.touches[0].x, e.touches[0].y); lastTouchX = e.touches[0].x; lastTouchY = e.touches[0].y; return; }
        const dx = e.touches[0].x - lastTouchX;
        const dy = e.touches[0].y - lastTouchY;
        lastTouchX = e.touches[0].x;
        lastTouchY = e.touches[0].y;
    
        targetYaw -= dx * 0.4;
        targetPitch = Math.max(-20, Math.min(80, targetPitch + dy * 0.4));
      } else if (e.touches.length === 2) {
        const currentDist = Math.hypot(
          e.touches[0].x - e.touches[1].x,
          e.touches[0].y - e.touches[1].y
        );
        if (lastPinchDist > 0) {
          const pinchDelta = lastPinchDist - currentDist;
          targetDistance = Math.max(3.5, Math.min(110.0, targetDistance + pinchDelta * 0.08));
        }
        lastPinchDist = currentDist;
      }
    });
    
    // -------------------------------------------------------------
    // 3. MATERIALS DESIGN SYSTEM
    // -------------------------------------------------------------
    function createMat(color: pc.Color, spec = new pc.Color(0.2, 0.2, 0.2), opacity = 1.0) {
      const mat = new pc.StandardMaterial();
      mat.diffuse = color;
      mat.specular = spec;
      if (opacity < 1.0) {
        mat.opacity = opacity;
        mat.blendType = pc.BLEND_NORMAL;
      }
      mat.update();
      return mat;
    }
    
    const matHighWallLed = new pc.StandardMaterial();
    matHighWallLed.diffuse = new pc.Color(0.95, 0.98, 1.0);
    matHighWallLed.specular = new pc.Color(1.0, 1.0, 1.0);
    matHighWallLed.emissive = new pc.Color(0.98, 0.99, 1.0);
    matHighWallLed.update();
    
    const matLedHousing = createMat(new pc.Color(0.08, 0.08, 0.1), new pc.Color(0.6, 0.6, 0.6));
    
    const matOakWood = createMat(new pc.Color(0.48, 0.32, 0.18), new pc.Color(0.35, 0.3, 0.25));
    matOakWood.useMetalness = false;
    matOakWood.update();
    
    const matRoadAsphalt = createMat(new pc.Color(0.15, 0.16, 0.18), new pc.Color(0.2, 0.2, 0.2));
    const matYellowLine = createMat(new pc.Color(0.95, 0.8, 0.1), new pc.Color(0.3, 0.3, 0.3));
    const matSidewalkTile = createMat(new pc.Color(0.65, 0.6, 0.55), new pc.Color(0.3, 0.3, 0.3));
    
    const matShopYellow = createMat(new pc.Color(0.92, 0.82, 0.45), new pc.Color(0.2, 0.2, 0.2));
    const matShopRed = createMat(new pc.Color(0.78, 0.22, 0.18), new pc.Color(0.2, 0.2, 0.2));
    const matShopCyan = createMat(new pc.Color(0.2, 0.6, 0.65), new pc.Color(0.2, 0.2, 0.2));
    
    const matSignPho = new pc.StandardMaterial();
    matSignPho.diffuse = new pc.Color(1.0, 0.2, 0.1);
    matSignPho.emissive = new pc.Color(1.0, 0.3, 0.1);
    matSignPho.update();
    
    const matSignCafe = new pc.StandardMaterial();
    matSignCafe.diffuse = new pc.Color(0.2, 0.8, 1.0);
    matSignCafe.emissive = new pc.Color(0.3, 0.85, 1.0);
    matSignCafe.update();
    
    const matSignBanhMi = new pc.StandardMaterial();
    matSignBanhMi.diffuse = new pc.Color(1.0, 0.8, 0.1);
    matSignBanhMi.emissive = new pc.Color(1.0, 0.85, 0.2);
    matSignBanhMi.update();
    
    const matRedStool = createMat(new pc.Color(0.9, 0.1, 0.08), new pc.Color(0.4, 0.4, 0.4));
    
    const matMotorbikeRed = createMat(new pc.Color(0.85, 0.1, 0.1), new pc.Color(0.6, 0.6, 0.6));
    const matMotorbikeBlue = createMat(new pc.Color(0.1, 0.4, 0.85), new pc.Color(0.6, 0.6, 0.6));
    const matMotorbikeWhite = createMat(new pc.Color(0.95, 0.95, 0.95), new pc.Color(0.6, 0.6, 0.6));
    const matMotorbikeYellow = createMat(new pc.Color(0.95, 0.8, 0.1), new pc.Color(0.6, 0.6, 0.6));
    const matCarBlack = createMat(new pc.Color(0.1, 0.1, 0.12), new pc.Color(0.8, 0.8, 0.8));
    
    // 🚘 3D CITY TRAFFIC CAR MATERIALS
    const matCarRed = createMat(new pc.Color(0.85, 0.12, 0.10), new pc.Color(0.8, 0.8, 0.8));
    const matCarWhite = createMat(new pc.Color(0.96, 0.96, 0.98), new pc.Color(0.8, 0.8, 0.8));
    const matCarBlue = createMat(new pc.Color(0.12, 0.38, 0.88), new pc.Color(0.8, 0.8, 0.8));
    const matCarSilver = createMat(new pc.Color(0.82, 0.85, 0.88), new pc.Color(0.9, 0.9, 0.9));
    const matCarYellow = createMat(new pc.Color(0.95, 0.80, 0.05), new pc.Color(0.8, 0.8, 0.8));
    
    const matHeadlightEmissive = new pc.StandardMaterial();
    matHeadlightEmissive.diffuse = new pc.Color(1.0, 1.0, 0.9);
    matHeadlightEmissive.emissive = new pc.Color(1.0, 1.0, 0.8);
    matHeadlightEmissive.update();
    
    const matTaillightEmissive = new pc.StandardMaterial();
    matTaillightEmissive.diffuse = new pc.Color(0.9, 0.1, 0.1);
    matTaillightEmissive.emissive = new pc.Color(0.9, 0.1, 0.1);
    matTaillightEmissive.update();
    
    // 🇻🇳 HANOI OLD QUARTER & XÍCH LÔ MATERIALS (CLONED 100% FROM 0c39da4a9aa34083b75ae981adf1571b.jpeg)
    const matFrenchOchre = createMat(new pc.Color(0.88, 0.72, 0.42), new pc.Color(0.2, 0.2, 0.2)); // French Colonial Ochre Yellow Plaster
    const matTileRoof = createMat(new pc.Color(0.78, 0.32, 0.18), new pc.Color(0.3, 0.2, 0.2)); // Terracotta Roof Tiles
    const matStoreAwning = createMat(new pc.Color(0.22, 0.24, 0.28), new pc.Color(0.3, 0.3, 0.3)); // Dark Storefront Canvas Awning
    const matVietFlag = new pc.StandardMaterial(); // Vietnamese National Red Flag
    matVietFlag.diffuse = new pc.Color(0.92, 0.12, 0.10);
    matVietFlag.emissive = new pc.Color(0.30, 0.04, 0.03);
    matVietFlag.update();
    
    const matNonLa = createMat(new pc.Color(0.90, 0.82, 0.58), new pc.Color(0.3, 0.3, 0.2)); // Conical Hat (Nón lá)
    const matCycloCanopy = createMat(new pc.Color(0.88, 0.18, 0.14), new pc.Color(0.4, 0.4, 0.4)); // Cyclo Red Sunshade Roof
    const matCableWire = createMat(new pc.Color(0.04, 0.04, 0.05), new pc.Color(0.1, 0.1, 0.1)); // Overhead Power Cable Wires
    
    // 🇻🇳 RUSTIC HANOI ALLEY MATERIALS (CLONED 100% FROM c735c13e31ea47698421d108a5f27b39.jpeg - "Đơn sơ")
    const matStripedAwningGreen = createMat(new pc.Color(0.12, 0.65, 0.42), new pc.Color(0.3, 0.3, 0.3)); // Green & White Striped Canvas Awning ("CHÈ BƯỜI HƯNG THỊNH")
    const matStripedAwningBrown = createMat(new pc.Color(0.68, 0.52, 0.36), new pc.Color(0.3, 0.3, 0.3)); // Brown & Gold Striped Canvas Awning ("ĐẶC SẢN CHÁO")
    const matTinRoof = createMat(new pc.Color(0.28, 0.32, 0.36), new pc.Color(0.4, 0.4, 0.4)); // Corrugated Tin Roof
    const matRusticBrick = createMat(new pc.Color(0.72, 0.42, 0.28), new pc.Color(0.2, 0.2, 0.2)); // Weathered Brick Wall Plaster
    
    // 💡 WARM GLOWING STORE INTERIOR LIGHTING MATERIAL
    const matWarmStoreInterior = new pc.StandardMaterial();
    matWarmStoreInterior.diffuse = new pc.Color(1.0, 0.88, 0.65);
    matWarmStoreInterior.emissive = new pc.Color(0.85, 0.70, 0.45);
    matWarmStoreInterior.update();
    
    // 🍜 2D CANVAS TEXT TEXTURE GENERATOR FOR CRISP 3D SIGNBOARDS (NO BORDERS / NO STROKES)
    function createDynamicTextSignTexture(app: pc.Application, mainText: string, subText: string, bgColor: string, textColor: string, subColor: string = '#fef08a'): pc.StandardMaterial {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
    
      if (ctx) {
        // 1. Solid Background Fill (No Stroke Border)
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        // 2. Main Title Text (BÚN ĐẬU MẮM TÔM, CƠM TẤM SÀI GÒN, BÁNH MÌ SÀI GÒN)
        ctx.fillStyle = textColor;
        ctx.font = '900 80px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const centerY = subText ? 95 : 128;
        ctx.fillText(mainText, canvas.width / 2, centerY);
    
        // 3. Subtitle Text
        if (subText) {
          ctx.fillStyle = subColor;
          ctx.font = 'bold 42px sans-serif';
          ctx.fillText(subText, canvas.width / 2, 180);
        }
      }
    
      const texture = new pc.Texture(app.graphicsDevice, {
        width: canvas.width,
        height: canvas.height,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR
      });
      texture.setSource(canvas);
    
      const mat = new pc.StandardMaterial();
      mat.diffuseMap = texture;
      mat.emissiveMap = texture;
      mat.emissive = new pc.Color(1.0, 1.0, 1.0);
      mat.emissiveIntensity = 1.4; // 100% Crisp 24/7 Illuminated Text Glow!
      mat.useLighting = false;
      mat.update();
    
      return mat;
    }
    const matBougainvillea = new pc.StandardMaterial(); // Pink Bougainvillea Flowers on Balcony
    matBougainvillea.diffuse = new pc.Color(0.95, 0.25, 0.55);
    matBougainvillea.emissive = new pc.Color(0.25, 0.05, 0.15);
    matBougainvillea.update();
    
    const matSignChao = new pc.StandardMaterial();
    matSignChao.diffuse = new pc.Color(0.88, 0.75, 0.32);
    matSignChao.emissive = new pc.Color(0.88, 0.75, 0.32);
    matSignChao.update();
    
    const matSignCheBuoi = new pc.StandardMaterial();
    matSignCheBuoi.diffuse = new pc.Color(0.12, 0.75, 0.45);
    matSignCheBuoi.emissive = new pc.Color(0.12, 0.75, 0.45);
    matSignCheBuoi.update();
    
    const matWalnut = createMat(new pc.Color(0.24, 0.15, 0.09), new pc.Color(0.4, 0.35, 0.3));
    matWalnut.useMetalness = false;
    matWalnut.update();
    
    const matCabinetBody = createMat(new pc.Color(0.12, 0.12, 0.14), new pc.Color(0.3, 0.3, 0.3));
    
    const matBlackMetal = createMat(new pc.Color(0.08, 0.08, 0.1), new pc.Color(0.7, 0.7, 0.7));
    matBlackMetal.useMetalness = true;
    matBlackMetal.metalness = 0.85;
    matBlackMetal.update();
    
    const matCasterWheel = createMat(new pc.Color(0.05, 0.05, 0.06), new pc.Color(0.6, 0.6, 0.6));
    matCasterWheel.useMetalness = true;
    matCasterWheel.metalness = 0.75;
    matCasterWheel.update();
    
    const matPegboard = createMat(new pc.Color(0.25, 0.28, 0.32), new pc.Color(0.4, 0.4, 0.4));
    const matPegDot = createMat(new pc.Color(0.1, 0.1, 0.12), new pc.Color(0.1, 0.1, 0.1));
    
    // 🏛️ SEAMLESS 1024x1024 LUXURY BLACK GRANITE SQUARE CERAMIC TILE MATERIAL (GẠCH MEN MÀU ĐEN SANG TRỌNG 80CM X 80CM)
    function createMarbleTileFloorMaterial(app: pc.Application): pc.StandardMaterial {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
    
      if (ctx) {
        // Grout line background color (Đường ron gạch xi măng xám chuẩn)
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 1024, 1024);
    
        // Render 2x2 Grid of 4 Luxury Polished Jet Black Square Ceramic Tiles (each 498x498px with 14px grout gap)
        const tileSize = 498;
        const groutGap = 14;
    
        const tileShades = [
          { start: '#161b26', end: '#090b10' }, // Tile (0,0) - Deep Obsidian Black
          { start: '#121620', end: '#06070b' }, // Tile (1,0) - Jet Midnight Black
          { start: '#181e2b', end: '#0a0d13' }, // Tile (0,1) - Charcoal Onyx
          { start: '#141823', end: '#07090e' }, // Tile (1,1) - Dark Obsidian
        ];
    
        let tileIdx = 0;
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 2; c++) {
            const tx = c * (tileSize + groutGap) + 7;
            const ty = r * (tileSize + groutGap) + 7;
            const shade = tileShades[tileIdx++];
    
            // Square Tile Base Fill - Luxury Jet Black Gradient
            const tGrad = ctx.createLinearGradient(tx, ty, tx + tileSize, ty + tileSize);
            tGrad.addColorStop(0, shade.start);
            tGrad.addColorStop(1, shade.end);
            ctx.fillStyle = tGrad;
            ctx.fillRect(tx, ty, tileSize, tileSize);
    
            // Square Tile Bevel Border Highlight for crisp 3D black ceramic square tile edges
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 4;
            ctx.strokeRect(tx + 2, ty + 2, tileSize - 4, tileSize - 4);
    
            // Fine Silver Marble Veining Inside Each Black Tile
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx + 40, ty + 60);
            ctx.bezierCurveTo(tx + 180, ty + 120, tx + 280, ty + 80, tx + 460, ty + 320);
            ctx.stroke();
          }
        }
    
        // Outer Grout Grid Line Border (Slate contrast for 100% visible black square tiles)
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 14;
        ctx.strokeRect(0, 0, 1024, 1024);
      }
    
      const texture = new pc.Texture(app.graphicsDevice, {
        width: 1024,
        height: 1024,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_REPEAT,
        addressV: pc.ADDRESS_REPEAT,
        anisotropy: 16
      });
      texture.setSource(canvas);
    
      const mat = new pc.StandardMaterial();
      mat.useLighting = true;
      mat.diffuse = new pc.Color(0.20, 0.22, 0.28); // Luxury obsidian jet black tile tone
      mat.specular = new pc.Color(0.28, 0.30, 0.35); // Elegant polished ceramic tile sheen
      mat.diffuseMap = texture;
      // 140m X x 80m Z -> Tiling (35, 20) yields exactly 2m x 2m square tiles everywhere!
      mat.diffuseMapTiling = new pc.Vec2(35, 20);
      mat.useMetalness = false;
      mat.gloss = 0.60;
      mat.update();
    
      return mat;
    }
    
    const matMarbleFloor = createMarbleTileFloorMaterial(app);
    const matMarbleBorder = createMat(new pc.Color(0.2, 0.2, 0.22), new pc.Color(0.5, 0.5, 0.5));
    const matSunPatch = createMat(new pc.Color(1.0, 0.92, 0.72), new pc.Color(1.0, 1.0, 0.9), 0.45);
    
    const matWall = createMat(new pc.Color(0.15, 0.18, 0.26), new pc.Color(0.15, 0.15, 0.15)); 
    const matGlass = createMat(new pc.Color(0.75, 0.92, 1.0), new pc.Color(1.0, 1.0, 1.0), 0.20); 
    matGlass.update();
    
    // 🐠 MODERN AQUARIUM MATERIALS
    const matAquariumGlass = createMat(new pc.Color(0.8, 0.98, 1.0), new pc.Color(1.0, 1.0, 1.0), 0.18);
    matAquariumGlass.update();
    
    const matAquaWater = createMat(new pc.Color(0.15, 0.72, 0.88), new pc.Color(0.6, 0.95, 1.0), 0.32);
    const matAquaSand = createMat(new pc.Color(0.94, 0.92, 0.88), new pc.Color(0.3, 0.3, 0.3));
    
    const matAquaLedHood = createMat(new pc.Color(0.08, 0.08, 0.1), new pc.Color(0.7, 0.7, 0.7));
    matAquaLedHood.useMetalness = true;
    matAquaLedHood.metalness = 0.85;
    matAquaLedHood.update();
    
    // 🖥️ TECH MONITOR SCREEN WINDOW FRAME MATERIALS
    const matTechDisplayBezel = createMat(new pc.Color(0.08, 0.09, 0.12), new pc.Color(0.75, 0.75, 0.75));
    matTechDisplayBezel.useMetalness = true;
    matTechDisplayBezel.metalness = 0.88;
    matTechDisplayBezel.update();
    
    const matTechBezelTrim = createMat(new pc.Color(0.18, 0.20, 0.24), new pc.Color(0.9, 0.9, 0.9));
    matTechBezelTrim.useMetalness = true;
    matTechBezelTrim.metalness = 0.9;
    matTechBezelTrim.update();
    
    const matTechScreenLed = new pc.StandardMaterial();
    matTechScreenLed.diffuse = new pc.Color(0.2, 0.8, 1.0);
    matTechScreenLed.emissive = new pc.Color(0.2, 0.8, 1.0);
    matTechScreenLed.update();
    
    
    // 🎮 PLAYSTATION 5 PRO MATERIALS (CLONED 100% FROM ps5-pro-image-1726018700573-1726018701318847234225.webp)
    const matPs5WhitePlate = createMat(new pc.Color(0.96, 0.97, 0.99), new pc.Color(0.8, 0.8, 0.8)); // Pure White Curved Plates
    const matPs5BlackCore = createMat(new pc.Color(0.08, 0.09, 0.11), new pc.Color(0.7, 0.7, 0.7)); // Glossy Dark Charcoal Core Tower
    matPs5BlackCore.useMetalness = true;
    matPs5BlackCore.metalness = 0.65;
    matPs5BlackCore.update();
    
    const matPs5SilverStand = createMat(new pc.Color(0.82, 0.85, 0.88), new pc.Color(0.9, 0.9, 0.9)); // Metallic Silver Disc Base Stand
    matPs5SilverStand.useMetalness = true;
    matPs5SilverStand.metalness = 0.9;
    matPs5SilverStand.update();
    
    const matPs5BlueLedGlow = new pc.StandardMaterial(); // Blue LED Accent Seam Light Glow
    matPs5BlueLedGlow.diffuse = new pc.Color(0.2, 0.6, 1.0);
    matPs5BlueLedGlow.emissive = new pc.Color(0.3, 0.75, 1.0);
    matPs5BlueLedGlow.update();
    
    // 🐟 GOLDFISH MATERIALS (CLONED 100% FROM images44444.jpeg)
    const matGoldenYellowBody = new pc.StandardMaterial();
    matGoldenYellowBody.diffuse = new pc.Color(1.0, 0.78, 0.05);
    matGoldenYellowBody.specular = new pc.Color(0.4, 0.35, 0.2);
    matGoldenYellowBody.emissive = new pc.Color(0.20, 0.12, 0.0);
    matGoldenYellowBody.update();
    
    const matGoldenYellowFin = new pc.StandardMaterial();
    matGoldenYellowFin.diffuse = new pc.Color(1.0, 0.82, 0.12);
    matGoldenYellowFin.specular = new pc.Color(0.4, 0.35, 0.2);
    matGoldenYellowFin.emissive = new pc.Color(0.20, 0.10, 0.0);
    matGoldenYellowFin.update();
    
    const matRedOrangeBody = new pc.StandardMaterial();
    matRedOrangeBody.diffuse = new pc.Color(1.0, 0.3, 0.05);
    matRedOrangeBody.specular = new pc.Color(0.4, 0.3, 0.2);
    matRedOrangeBody.emissive = new pc.Color(0.20, 0.04, 0.0);
    matRedOrangeBody.update();
    
    const matRedOrangeFin = new pc.StandardMaterial();
    matRedOrangeFin.diffuse = new pc.Color(1.0, 0.42, 0.10);
    matRedOrangeFin.specular = new pc.Color(0.4, 0.3, 0.2);
    matRedOrangeFin.emissive = new pc.Color(0.20, 0.05, 0.0);
    matRedOrangeFin.update();
    
    const matFishEyePupil = createMat(new pc.Color(0.02, 0.02, 0.03), new pc.Color(0.8, 0.8, 0.8));
    
    // ⌨️ CUSTOM TRI-COLOR MECHANICAL KEYBOARD MATERIALS (CLONED 100% FROM 01_ad818cf015b348839b54affef913b675_master.webp)
    const matKbdWhiteCase = createMat(new pc.Color(0.96, 0.96, 0.98), new pc.Color(0.8, 0.8, 0.8)); // Pure White Anodized Frame
    const matKbdCoralRedKey = new pc.StandardMaterial(); // Coral Orange Esc / Spacebar
    matKbdCoralRedKey.diffuse = new pc.Color(1.0, 0.38, 0.30);
    matKbdCoralRedKey.specular = new pc.Color(0.4, 0.3, 0.3);
    matKbdCoralRedKey.update();
    
    const matKbdNavyBlueKey = new pc.StandardMaterial(); // Deep Navy Blue Keys (5-8 & Modifiers)
    matKbdNavyBlueKey.diffuse = new pc.Color(0.12, 0.22, 0.36);
    matKbdNavyBlueKey.specular = new pc.Color(0.3, 0.3, 0.4);
    matKbdNavyBlueKey.update();
    
    const matKbdOffWhiteKey = createMat(new pc.Color(0.94, 0.95, 0.97), new pc.Color(0.4, 0.4, 0.4)); // Off-White Letter Keys
    
    const matKbdRgbGlow = new pc.StandardMaterial(); // Rainbow Per-key Underglow Light Strip
    matKbdRgbGlow.diffuse = new pc.Color(0.3, 0.8, 1.0);
    matKbdRgbGlow.emissive = new pc.Color(0.5, 0.85, 1.0);
    matKbdRgbGlow.update();
    
    // 🖱️ LOGITECH M185 WIRELESS MOUSE MATERIALS (CLONED 100% FROM images000.jpeg)
    const matLogiOuterFrameGrey = createMat(new pc.Color(0.38, 0.42, 0.46), new pc.Color(0.5, 0.5, 0.5)); // Light Slate/Gunmetal Outer Ring Frame
    const matLogiInnerDarkShell = createMat(new pc.Color(0.15, 0.17, 0.19), new pc.Color(0.4, 0.4, 0.4)); // Dark Charcoal Matte Top Body Shell
    const matLogiScrollWheelGrey = createMat(new pc.Color(0.68, 0.72, 0.76), new pc.Color(0.6, 0.6, 0.6)); // Light Grey Ribbed Scroll Wheel
    const matLogiSlotDarkPocket = createMat(new pc.Color(0.08, 0.09, 0.10), new pc.Color(0.3, 0.3, 0.3)); // Recessed Dark Wheel Pocket
    
    // Outer Wall Metal Frame
    const matOuterFrame = createMat(new pc.Color(0.06, 0.06, 0.08), new pc.Color(0.8, 0.8, 0.8)); 
    matOuterFrame.useMetalness = true;
    matOuterFrame.metalness = 0.9;
    matOuterFrame.update();
    
    // Sleek Thin Black Inner Door Leaf Sash Frame
    const matInnerBlackSash = createMat(new pc.Color(0.03, 0.03, 0.04), new pc.Color(0.85, 0.85, 0.85));
    matInnerBlackSash.useMetalness = true;
    matInnerBlackSash.metalness = 0.95;
    matInnerBlackSash.update();
    
    const matDoorWood = createMat(new pc.Color(0.38, 0.24, 0.15), new pc.Color(0.35, 0.35, 0.35)); 
    
    const matDoorHandleGold = new pc.StandardMaterial();
    matDoorHandleGold.diffuse = new pc.Color(0.95, 0.8, 0.25);
    matDoorHandleGold.specular = new pc.Color(1.0, 0.95, 0.7);
    matDoorHandleGold.useMetalness = true;
    matDoorHandleGold.metalness = 0.9;
    matDoorHandleGold.update();
    
    const matLockPlate = new pc.StandardMaterial();
    matLockPlate.diffuse = new pc.Color(0.12, 0.12, 0.15);
    matLockPlate.specular = new pc.Color(0.8, 0.8, 0.8);
    matLockPlate.useMetalness = true;
    matLockPlate.metalness = 0.9;
    matLockPlate.update();
    
    // 💡 INTERACTIVE WALL LIGHT SWITCH MATERIALS
    const matSwitchFacePlate = createMat(new pc.Color(0.95, 0.95, 0.97), new pc.Color(0.5, 0.5, 0.5));
    const matSwitchRocker = createMat(new pc.Color(0.85, 0.86, 0.88), new pc.Color(0.6, 0.6, 0.6));
    const matSwitchLedOn = new pc.StandardMaterial();
    matSwitchLedOn.diffuse = new pc.Color(0.1, 1.0, 0.3);
    matSwitchLedOn.emissive = new pc.Color(0.1, 1.0, 0.3);
    matSwitchLedOn.update();
    
    const matSwitchLedOff = new pc.StandardMaterial();
    matSwitchLedOff.diffuse = new pc.Color(0.2, 0.05, 0.05);
    matSwitchLedOff.emissive = new pc.Color(0.2, 0.05, 0.05);
    matSwitchLedOff.update();
    
    const matDeskMat = createMat(new pc.Color(0.1, 0.1, 0.12), new pc.Color(0.2, 0.2, 0.2));
    const matCRTPlastic = createMat(new pc.Color(0.87, 0.84, 0.78), new pc.Color(0.25, 0.24, 0.22));
    const matScreenLeft = createMat(new pc.Color(0.05, 0.05, 0.08), new pc.Color(0.02, 0.02, 0.02));
    const matScreenRight = createMat(new pc.Color(0.05, 0.05, 0.08), new pc.Color(0.02, 0.02, 0.02));

    let clockCanvasTimer: any = null;
    let clockCanvasTexture: pc.Texture | null = null;

    const showDateTimeOnMonitorFn = (targetSide: 'left' | 'right' | 'both' = 'both', options?: { textColor?: string; bgColor?: string; screenText?: string; imageUrl?: string }) => {
      if (clockCanvasTimer) {
        clearInterval(clockCanvasTimer);
        clockCanvasTimer = null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const device = app.graphicsDevice;
      const tex = new pc.Texture(device, {
        width: 1024,
        height: 512,
        format: pc.PIXELFORMAT_R8_G8_B8_A8,
        mipmaps: false
      });
      clockCanvasTexture = tex;

      if (options?.imageUrl) {
        let imgPath = options.imageUrl;
        if (!imgPath.startsWith('http') && !imgPath.startsWith('file://')) {
          imgPath = 'file://' + imgPath;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.fillStyle = options?.bgColor || '#050814';
          ctx.fillRect(0, 0, 1024, 512);

          const scale = Math.min(1024 / img.width, 512 / img.height);
          const nw = img.width * scale;
          const nh = img.height * scale;
          const nx = (1024 - nw) / 2;
          const ny = (512 - nh) / 2;

          ctx.drawImage(img, nx, ny, nw, nh);

          if (!this._destroyed && app && app.graphicsDevice && (app.graphicsDevice as any).gl && tex && tex.device) {
            try {
              tex.setSource(canvas);
              tex.upload();
            } catch (_) {}
          }

          const applyMat = (mat: pc.StandardMaterial) => {
            if (!mat) return;
            mat.diffuse = new pc.Color(0, 0, 0);
            mat.specular = new pc.Color(0.02, 0.02, 0.02);
            mat.emissive = new pc.Color(1.0, 1.0, 1.0);
            mat.emissiveMap = tex;
            mat.useLighting = false;
            mat.update();
          };

          if (targetSide === 'left' || targetSide === 'both') applyMat(matScreenLeft);
          if (targetSide === 'right' || targetSide === 'both') applyMat(matScreenRight);
        };
        img.onerror = () => {
          console.warn('[MonitorImage] Error loading image:', imgPath);
        };
        img.src = imgPath;
        return;
      }

      const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

      const renderCanvas = () => {
        const textColor = options?.textColor || '#00f0ff';
        const isBlackText = textColor.toLowerCase() === '#000000' || textColor.toLowerCase() === 'black';

        // Background Fill
        const grad = ctx.createLinearGradient(0, 0, 1024, 512);
        if (options?.bgColor) {
          grad.addColorStop(0, options.bgColor);
          grad.addColorStop(1, options.bgColor);
        } else {
          grad.addColorStop(0, '#0a2040');
          grad.addColorStop(0.5, '#122d55');
          grad.addColorStop(1, '#1a3a70');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1024, 512);

        // Grid lines background texture
        ctx.strokeStyle = isBlackText ? 'rgba(0, 0, 0, 0.08)' : 'rgba(6, 182, 212, 0.12)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 1024; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
        }
        for (let y = 0; y < 512; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
        }

        if (options?.screenText) {
          // ==========================================
          // PURE CUSTOM CONTENT MODE (Clean Full-Screen Display)
          // No clock OS headers, dates, or CPU/RAM clutter!
          // ==========================================
          const txt = options.screenText;
          const fontSize = txt.length > 30 ? 40 : (txt.length > 15 ? 56 : 76);
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.shadowColor = isBlackText ? 'rgba(0, 0, 0, 0.2)' : textColor;
          ctx.shadowBlur = 24;
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, 512, 256);
        } else {
          // ==========================================
          // CLOCK OS SYSTEM DASHBOARD MODE
          // ==========================================
          const now = new Date();
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const dayName = daysOfWeek[now.getDay()];
          const day = String(now.getDate()).padStart(2, '0');
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const year = now.getFullYear();

          // Top Status Header Bar
          ctx.fillStyle = isBlackText ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.8)';
          ctx.fillRect(40, 30, 944, 50);
          ctx.fillStyle = isBlackText ? '#0f172a' : '#06b6d4';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('SƠN TINH AI 3D WORKSTATION OS v2.5', 60, 62);
          ctx.fillStyle = isBlackText ? '#059669' : '#10b981';
          ctx.font = '18px monospace';
          ctx.fillText('● SYSTEM ONLINE | REALTIME 3D', 680, 62);

          // Main Clock Box
          ctx.fillStyle = isBlackText ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 41, 59, 0.85)';
          ctx.strokeStyle = isBlackText ? '#0284c7' : '#06b6d4';
          ctx.lineWidth = 3;
          ctx.beginPath();
          if ((ctx as any).roundRect) {
            (ctx as any).roundRect(160, 110, 704, 250, 24);
          } else {
            ctx.rect(160, 110, 704, 250);
          }
          ctx.fill();
          ctx.stroke();

          // Clock Digits
          ctx.shadowColor = isBlackText ? 'rgba(0, 0, 0, 0.15)' : '#06b6d4';
          ctx.shadowBlur = isBlackText ? 4 : 20;
          ctx.fillStyle = textColor;
          ctx.font = 'bold 110px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${hours}:${minutes}:${seconds}`, 512, 260);

          // Date Sub-header
          ctx.shadowColor = isBlackText ? 'transparent' : '#3b82f6';
          ctx.shadowBlur = isBlackText ? 0 : 10;
          ctx.fillStyle = isBlackText ? '#0369a1' : '#38bdf8';
          ctx.font = 'bold 36px sans-serif';
          ctx.fillText(`${dayName}, ${day}/${month}/${year}`, 512, 320);

          // Hardware Specs Footer
          let gpuName = 'RTX 4090';
          try {
            const gl = (app.graphicsDevice as any).gl || (app.graphicsDevice as any).device;
            if (gl && gl.getExtension) {
              const ext = gl.getExtension('WEBGL_debug_renderer_info');
              if (ext) {
                const vendor = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
                if (vendor) {
                  gpuName = vendor
                    .replace(/ANGLE \((.*)\)/, '$1')
                    .split(',')[0]
                    .replace(/^NVIDIA Corporation /i, '')
                    .replace(/^AMD /i, '')
                    .replace(/^Mesa /i, '')
                    .replace(/Direct3D11.*$/i, '')
                    .trim();
                }
              }
            }
          } catch (e) {}

          let cpuUsage = 14;
          let ramUsed = '12.8';
          let ramTotal = (navigator as any).deviceMemory || 64;

          if ((window as any).electron?.invoke) {
            (window as any).electron.invoke('system:get-specs').then((specs: any) => {
              if (specs) {
                if (specs.cpuUsage) cpuUsage = specs.cpuUsage;
                if (specs.ramUsedGb) ramUsed = specs.ramUsedGb;
                if (specs.ramTotalGb) ramTotal = specs.ramTotalGb;
              }
            }).catch(() => {});
          }

          ctx.shadowBlur = 0;
          ctx.textAlign = 'center';
          ctx.fillStyle = isBlackText ? '#334155' : 'rgba(255, 255, 255, 0.7)';
          ctx.font = '16px monospace';
          ctx.fillText(`CPU: ${cpuUsage}% | RAM: ${ramUsed}GB / ${ramTotal}GB | GPU: ${gpuName}`, 512, 410);
        }

        if (this._destroyed || !app || !app.graphicsDevice || !(app.graphicsDevice as any).gl || !tex || !tex.device || !(tex.device as any).gl) {
          if (clockCanvasTimer) {
            clearInterval(clockCanvasTimer);
            clockCanvasTimer = null;
          }
          return;
        }

        try {
          tex.setSource(canvas);
          tex.upload();
          if (targetSide === 'left' || targetSide === 'both') {
            matScreenLeft?.update();
          }
          if (targetSide === 'right' || targetSide === 'both') {
            matScreenRight?.update();
          }
        } catch (err) {
          if (clockCanvasTimer) {
            clearInterval(clockCanvasTimer);
            clockCanvasTimer = null;
          }
        }
      };

      renderCanvas();
      clockCanvasTimer = setInterval(renderCanvas, 1000);

      const applyToMat = (mat: pc.StandardMaterial) => {
        if (!mat) return;
        mat.diffuse = new pc.Color(0, 0, 0);
        mat.specular = new pc.Color(0.02, 0.02, 0.02);
        mat.emissive = new pc.Color(1.0, 1.0, 1.0);
        mat.emissiveMap = tex;
        mat.useLighting = false;
        mat.update();
      };

      if (targetSide === 'left' || targetSide === 'both') {
        applyToMat(matScreenLeft);
      }
      if (targetSide === 'right' || targetSide === 'both') {
        applyToMat(matScreenRight);
      }
    };
    self._showDateTimeOnMonitorFn = showDateTimeOnMonitorFn;

    const clearMonitorDisplayFn = (targetSide: 'left' | 'right' | 'both' = 'both') => {
      if (clockCanvasTimer) {
        clearInterval(clockCanvasTimer);
        clockCanvasTimer = null;
      }
      const resetMat = (mat: pc.StandardMaterial) => {
        if (!mat) return;
        mat.diffuse = new pc.Color(0.05, 0.05, 0.08);
        mat.specular = new pc.Color(0.02, 0.02, 0.02);
        mat.emissive = new pc.Color(0.0, 0.0, 0.0);
        mat.emissiveMap = null;
        mat.diffuseMap = null;
        mat.useLighting = false;
        mat.update();
      };
      if (targetSide === 'left' || targetSide === 'both') resetMat(matScreenLeft);
      if (targetSide === 'right' || targetSide === 'both') resetMat(matScreenRight);
    };
    self._clearMonitorDisplayFn = clearMonitorDisplayFn;
    const matChairMesh = createMat(new pc.Color(0.15, 0.17, 0.2), new pc.Color(0.3, 0.3, 0.3));
    const matChairFrame = createMat(new pc.Color(0.08, 0.08, 0.1), new pc.Color(0.5, 0.5, 0.5));
    const matChairLeatherSeat = createMat(new pc.Color(0.12, 0.13, 0.15), new pc.Color(0.4, 0.4, 0.4));
    const matPlantLeaf = createMat(new pc.Color(0.2, 0.65, 0.35), new pc.Color(0.1, 0.2, 0.1));
    
    // -------------------------------------------------------------
    // 4. RECTANGULAR GRAND STUDIO HALL GEOMETRY (140m X x 80m Z, 35m WALL HEIGHT)
    // -------------------------------------------------------------
    
    // Main Marble Tile Floor (140x80m Seamless Porcelain Marble Tiles Flush to All Walls)
    const floor = new pc.Entity('Floor');
    floor.addComponent('render', { type: 'box', material: matMarbleFloor });
    floor.setLocalScale(ROOM_WIDTH_X, 0.4, ROOM_DEPTH_Z);
    floor.setPosition(0, -0.2, 0); // Top surface sits flush at exactly Y = 0.0m!
    app.root.addChild(floor);
    
    // 🏛️ CEILING (TRẦN NHÀ MÀU ĐEN TUYỀN SANG TRỌNG - MATTE JET BLACK CEILING)
    const matCeiling = createMat(new pc.Color(0.05, 0.06, 0.08), new pc.Color(0.1, 0.1, 0.1));
    matCeiling.emissive = new pc.Color(0.05, 0.06, 0.08);
    matCeiling.useLighting = false;
    matCeiling.update();

    const ceiling = new pc.Entity('Ceiling');
    ceiling.addComponent('render', { type: 'box', material: matCeiling });
    ceiling.setLocalScale(ROOM_WIDTH_X + 2.0, 0.5, ROOM_DEPTH_Z + 2.0);
    ceiling.setPosition(0, WALL_H - 0.25, 0);
    app.root.addChild(ceiling);
    
    // 1. BACK WALL (TƯỜNG SƠN PHẲNG LIỀN MẠCH RỘNG 140M Z: -40.0M)
    const backWall = new pc.Entity('BackWall');
    backWall.addComponent('render', { type: 'box', material: matWall });
    backWall.setLocalScale(ROOM_WIDTH_X, WALL_H, 0.5);
    backWall.setPosition(0, WALL_H / 2, -ROOM_DEPTH_Z / 2);
    app.root.addChild(backWall);
    
    // 2. FRONT WALL (TƯỜNG TRƯỚC SƠN PHẲNG LIỀN MẠCH RỘNG 140M Z: +40.0M)
    const frontWall = new pc.Entity('FrontWall');
    frontWall.addComponent('render', { type: 'box', material: matWall });
    frontWall.setLocalScale(ROOM_WIDTH_X, WALL_H, 0.5);
    frontWall.setPosition(0, WALL_H / 2, ROOM_DEPTH_Z / 2);
    app.root.addChild(frontWall);
    
    // 🚪 3. TƯỜNG TRÁI (LEFT WALL X: -70.0M) CHỨA CỬA CHÍNH VỚI KHUNG NGOÀI & KHUNG CÁNH NHỎ MÀU ĐEN KHỚP HOÀN HẢO
    const wallSideLen = (ROOM_DEPTH_Z - 10.0) / 2; // 35.0m side wall length
    const wallSideBackZ = -5.0 - wallSideLen / 2;  // -22.5m Z center
    const wallSideFrontZ = 5.0 + wallSideLen / 2;   // +22.5m Z center
    
    const leftWallBack = new pc.Entity('LeftWallBack');
    leftWallBack.addComponent('render', { type: 'box', material: matWall });
    leftWallBack.setLocalScale(0.5, WALL_H, wallSideLen);
    leftWallBack.setPosition(-ROOM_WIDTH_X / 2, WALL_H / 2, wallSideBackZ);
    app.root.addChild(leftWallBack);
    
    const leftWallFront = new pc.Entity('LeftWallFront');
    leftWallFront.addComponent('render', { type: 'box', material: materialLeftWallFront() });
    leftWallFront.setLocalScale(0.5, WALL_H, wallSideLen);
    leftWallFront.setPosition(-ROOM_WIDTH_X / 2, WALL_H / 2, wallSideFrontZ);
    app.root.addChild(leftWallFront);
    
    function materialLeftWallFront() { return matWall; }
    
    const leftWallTop = new pc.Entity('LeftWallTop');
    leftWallTop.addComponent('render', { type: 'box', material: matWall });
    leftWallTop.setLocalScale(0.5, WALL_H - 20.0, 10.0);
    leftWallTop.setPosition(-ROOM_WIDTH_X / 2, 20.0 + (WALL_H - 20.0) / 2, 0.0);
    app.root.addChild(leftWallTop);
    
    // 1. KHUNG BAO CỬA CHÍNH NGOÀI GẮN VÀO TƯỜNG (OUTER WALL DOOR FRAME - 10M WIDE X 20M HIGH CUTOUT)
    const doorFrameBack = new pc.Entity('DoorFrameBack');
    doorFrameBack.addComponent('render', { type: 'box', material: matOuterFrame });
    doorFrameBack.setLocalScale(0.6, 20.0, 0.3);
    doorFrameBack.setPosition(-ROOM_WIDTH_X / 2, 10.0, -5.15);
    app.root.addChild(doorFrameBack);
    
    const doorFrameFront = new pc.Entity('DoorFrameFront');
    doorFrameFront.addComponent('render', { type: 'box', material: matOuterFrame });
    doorFrameFront.setLocalScale(0.6, 20.0, 0.3);
    doorFrameFront.setPosition(-ROOM_WIDTH_X / 2, 10.0, 5.15);
    app.root.addChild(doorFrameFront);
    
    const doorFrameTop = new pc.Entity('DoorFrameTop');
    doorFrameTop.addComponent('render', { type: 'box', material: matOuterFrame });
    doorFrameTop.setLocalScale(0.6, 0.3, 10.6);
    doorFrameTop.setPosition(-ROOM_WIDTH_X / 2, 20.15, 0.0);
    app.root.addChild(doorFrameTop);
    
    const doorThreshold = new pc.Entity('DoorThreshold');
    doorThreshold.addComponent('render', { type: 'box', material: matOuterFrame });
    doorThreshold.setLocalScale(0.6, 0.1, 10.2);
    doorThreshold.setPosition(-ROOM_WIDTH_X / 2, 0.05, 0.0);
    app.root.addChild(doorThreshold);
    
    // Cánh cửa & Pivot (Hinge at Z = -4.95m, Latch at Z = +4.95m)
    const doorPivot = new pc.Entity('DoorPivot');
    doorPivot.setPosition(-ROOM_WIDTH_X / 2, 0, -4.95);
    app.root.addChild(doorPivot);
    
    const doorPanel = new pc.Entity('DoorPanel');
    doorPanel.addComponent('render', { type: 'box', material: matDoorWood });
    doorPanel.setLocalScale(0.32, 19.6, 9.6);
    doorPanel.setPosition(0, 10.0, 4.95);
    doorPivot.addChild(doorPanel);
    
    // 2. KHUNG CÁNH CỬA NHỎ MÀU ĐEN ÔM SÁT VIỀN CÁNH CỬA GỖ (SLEEK THIN BLACK INNER DOOR SASH FRAME - PERFECTLY FLUSH FIT)
    const sashTop = new pc.Entity('SashTop');
    sashTop.addComponent('render', { type: 'box', material: matInnerBlackSash });
    sashTop.setLocalScale(0.36, 0.16, 9.9);
    sashTop.setPosition(0, 19.82, 4.95);
    doorPivot.addChild(sashTop);
    
    const sashBottom = new pc.Entity('SashBottom');
    sashBottom.addComponent('render', { type: 'box', material: matInnerBlackSash });
    sashBottom.setLocalScale(0.36, 0.16, 9.9);
    sashBottom.setPosition(0, 0.18, 4.95);
    doorPivot.addChild(sashBottom);
    
    const sashLeft = new pc.Entity('SashLeft');
    sashLeft.addComponent('render', { type: 'box', material: matInnerBlackSash });
    sashLeft.setLocalScale(0.36, 19.8, 0.16);
    sashLeft.setPosition(0, 10.0, 0.08);
    doorPivot.addChild(sashLeft);
    
    const sashRight = new pc.Entity('SashRight');
    sashRight.addComponent('render', { type: 'box', material: matInnerBlackSash });
    sashRight.setLocalScale(0.36, 19.8, 0.16);
    sashRight.setPosition(0, 10.0, 9.82);
    doorPivot.addChild(sashRight);
    
    const handleAssembly = new pc.Entity('HandleAssembly');
    handleAssembly.setPosition(0, 10.0, 9.0);
    doorPivot.addChild(handleAssembly);
    
    const plateInside = new pc.Entity('PlateInside');
    plateInside.addComponent('render', { type: 'box', material: matLockPlate });
    plateInside.setLocalScale(0.05, 0.8, 0.2);
    plateInside.setPosition(0.22, 0, 0);
    handleAssembly.addChild(plateInside);
    
    const plateOutside = new pc.Entity('PlateOutside');
    plateOutside.addComponent('render', { type: 'box', material: matLockPlate });
    plateOutside.setLocalScale(0.05, 0.8, 0.2);
    plateOutside.setPosition(-0.22, 0, 0);
    handleAssembly.addChild(plateOutside);
    
    const leverInsideStem = new pc.Entity('LeverInsideStem');
    leverInsideStem.addComponent('render', { type: 'cylinder', material: matDoorHandleGold });
    leverInsideStem.setLocalScale(0.1, 0.25, 0.1);
    leverInsideStem.setPosition(0.32, 0.12, 0);
    leverInsideStem.setEulerAngles(0, 0, 90);
    handleAssembly.addChild(leverInsideStem);
    
    const leverInsideBar = new pc.Entity('LeverInsideBar');
    leverInsideBar.addComponent('render', { type: 'box', material: matDoorHandleGold });
    leverInsideBar.setLocalScale(0.1, 0.1, 0.5);
    leverInsideBar.setPosition(0.42, 0.12, -0.2);
    handleAssembly.addChild(leverInsideBar);
    
    const leverOutsideStem = new pc.Entity('LeverOutsideStem');
    leverOutsideStem.addComponent('render', { type: 'cylinder', material: matDoorHandleGold });
    leverOutsideStem.setLocalScale(0.1, 0.25, 0.1);
    leverOutsideStem.setPosition(-0.32, 0.12, 0);
    leverOutsideStem.setEulerAngles(0, 0, -90);
    handleAssembly.addChild(leverOutsideStem);
    
    const leverOutsideBar = new pc.Entity('LeverOutsideBar');
    leverOutsideBar.addComponent('render', { type: 'box', material: matDoorHandleGold });
    leverOutsideBar.setLocalScale(-0.42, 0.12, -0.2);
    handleAssembly.addChild(leverOutsideBar);
    
    let isDoorOpen = false;
    let currentDoorAngle = 0; // State variable tracking smooth door angle from 0 to 95 degrees
    
    function toggleDoor() { isDoorOpen = !isDoorOpen; }
    
    function tryClickDoor(screenX: number, screenY: number) {
      if (EMPTY_SCENE) return false;
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);
    
      const doorRender = doorPanel.render;
      if (doorRender && doorRender.meshInstances.length > 0) {
        const aabb = doorRender.meshInstances[0].aabb;
        const hitPoint = new pc.Vec3();
        if (aabb.intersectsRay(ray, hitPoint)) {
          toggleDoor();
          return true;
        }
      }
      return false;
    }
    
    // -------------------------------------------------------------
    // 💡 CÔNG TẮC ĐÈN 3D CẠNH CỬA RA VÀO (INTERACTIVE WALL LIGHT SWITCH NEXT TO ENTRANCE DOOR - HIGHER POSITION Y: 11.8M)
    // -------------------------------------------------------------
    const wallSwitchBase = new pc.Entity('WallSwitchBase');
    wallSwitchBase.addComponent('render', { type: 'box', material: matSwitchFacePlate });
    wallSwitchBase.setLocalScale(0.08, 0.75, 0.50);
    wallSwitchBase.setPosition(-ROOM_WIDTH_X / 2 + 0.28, 11.8, 6.8);
    app.root.addChild(wallSwitchBase);
    
    const wallSwitchBezel = new pc.Entity('WallSwitchBezel');
    wallSwitchBezel.addComponent('render', { type: 'box', material: matSwitchFacePlate });
    wallSwitchBezel.setLocalScale(0.10, 0.68, 0.44);
    wallSwitchBezel.setPosition(-ROOM_WIDTH_X / 2 + 0.30, 11.8, 6.8);
    app.root.addChild(wallSwitchBezel);
    
    const wallSwitchRocker = new pc.Entity('WallSwitchRocker');
    wallSwitchRocker.addComponent('render', { type: 'box', material: matSwitchRocker });
    wallSwitchRocker.setLocalScale(0.12, 0.48, 0.30);
    wallSwitchRocker.setPosition(-ROOM_WIDTH_X / 2 + 0.32, 11.8, 6.8);
    wallSwitchRocker.setLocalEulerAngles(0, 0, 8);
    app.root.addChild(wallSwitchRocker);
    
    const wallSwitchLedDot = new pc.Entity('WallSwitchLedDot');
    wallSwitchLedDot.addComponent('render', { type: 'box', material: matSwitchLedOn });
    wallSwitchLedDot.setLocalScale(0.13, 0.08, 0.08);
    wallSwitchLedDot.setPosition(-ROOM_WIDTH_X / 2 + 0.33, 11.95, 6.8);
    app.root.addChild(wallSwitchLedDot);
    
    // ✨ PHOSPHOR NEON NIGHT GLOW LIGHT HALO (SELF-EMISSIVE IN TOTAL DARKNESS)
    const wallSwitchGlowLight = new pc.Entity('WallSwitchGlowLight');
    wallSwitchGlowLight.addComponent('light', {
      type: 'omni',
      color: new pc.Color(0.2, 0.95, 0.45),
      intensity: 0.0,
      range: 6.0
    });
    wallSwitchGlowLight.setPosition(-ROOM_WIDTH_X / 2 + 0.6, 11.8, 6.8);
    app.root.addChild(wallSwitchGlowLight);
    
    let isHighWallLedOn = true;
    
    function toggleRoomLights(explicitState?: boolean) {
      if (EMPTY_SCENE) return; // bục trưng bày tự quản lý ánh sáng
      if (typeof explicitState === 'boolean') {
        isHighWallLedOn = explicitState;
      } else {
        isHighWallLedOn = !isHighWallLedOn;
      }
    
      if (isHighWallLedOn) {
        app.scene.ambientLight = new pc.Color(0.24, 0.26, 0.35);
        if (sunLight.light) sunLight.light.intensity = 1.2;
        if (window2Light.light) window2Light.light.intensity = 1.8;
        matHighWallLed.emissive = new pc.Color(0.98, 0.99, 1.0);
        matHighWallLed.update();
        if (backLedLight.light) backLedLight.light.intensity = 4.8;
        if (frontLedLight.light) frontLedLight.light.intensity = 4.8;
        if (leftLedLight.light) leftLedLight.light.intensity = 4.8;
        if (rightLedLight.light) rightLedLight.light.intensity = 4.8;
        // Khung tranh và pegboard bật lại khi đèn phòng bật
        if (pegboardBacklight.light) pegboardBacklight.light.intensity = 4.5;
        if (familyFrameBacklight.light) familyFrameBacklight.light.intensity = 2.8;
        if (wallSwitchLedDot.render) wallSwitchLedDot.render.material = matSwitchLedOn;
        wallSwitchRocker.setLocalEulerAngles(0, 0, 8);
    
        // Turn off phosphor glow when room lights are on
        matSwitchFacePlate.emissive = new pc.Color(0, 0, 0);
        matSwitchFacePlate.update();
        matSwitchRocker.emissive = new pc.Color(0, 0, 0);
        matSwitchRocker.update();
        if (wallSwitchGlowLight.light) wallSwitchGlowLight.light.intensity = 0.0;
      } else {
        app.scene.ambientLight = new pc.Color(0.04, 0.05, 0.08);
        if (sunLight.light) sunLight.light.intensity = 0.4;
        if (window2Light.light) window2Light.light.intensity = 0.6;
        matHighWallLed.emissive = new pc.Color(0.0, 0.0, 0.0);
        matHighWallLed.update();
        if (backLedLight.light) backLedLight.light.intensity = 0.0;
        if (frontLedLight.light) frontLedLight.light.intensity = 0.0;
        if (leftLedLight.light) leftLedLight.light.intensity = 0.0;
        if (rightLedLight.light) rightLedLight.light.intensity = 0.0;
        // Tắt hẳn đèn pegboard và khung tranh khi phòng tối
        if (pegboardBacklight.light) pegboardBacklight.light.intensity = 0.0;
        if (familyFrameBacklight.light) familyFrameBacklight.light.intensity = 0.0;
        if (wallSwitchLedDot.render) wallSwitchLedDot.render.material = matSwitchLedOn;
        wallSwitchRocker.setLocalEulerAngles(0, 0, -8);
    
        // ✨ SELF-EMISSIVE PHOSPHOR NEON GLOW IN THE DARK WHEN ALL LIGHTS ARE TURNED OFF!
        matSwitchFacePlate.emissive = new pc.Color(0.12, 0.65, 0.30);
        matSwitchFacePlate.update();
        matSwitchRocker.emissive = new pc.Color(0.25, 0.95, 0.45);
        matSwitchRocker.update();
        if (wallSwitchGlowLight.light) wallSwitchGlowLight.light.intensity = 3.5;
      }
    }
    this._toggleRoomLights = toggleRoomLights;
    
    const PROP_ENTITY_CONFIG: Record<string, { primary: string; targets: string[] }> = {
      // 🏢 Kiến trúc Tòa nhà & Phòng 306
      'prop_building_5story_main': { primary: 'LeftWallBack', targets: ['LowerBuildingBase', 'CorniceFloor1_Group', 'CorniceFloor2_Group', 'CorniceFloor3_Group', 'CorniceFloor4_Group', 'CorniceFloor5_Group'] },
      'prop_room_306_floor': { primary: 'Floor', targets: ['Floor', 'Ceiling', 'BackWall', 'FrontWall', 'LeftWallBack', 'LeftWallFront', 'LeftWallTop', 'RightWallB', 'RightWallT', 'RightWallL', 'RightWallR'] },
      'prop_building_floor1': { primary: 'CorniceFloor1_Group', targets: ['CorniceFloor1_Group', 'Floor1_WindowOuterFrame', 'Floor1_WindowGlass'] },
      'prop_building_floor2': { primary: 'CorniceFloor2_Group', targets: ['CorniceFloor2_Group', 'Floor2_WindowOuterFrame', 'Floor2_WindowGlass'] },
      'prop_building_floor4': { primary: 'CorniceFloor4_Group', targets: ['CorniceFloor4_Group', 'Floor4_WindowOuterFrame', 'Floor4_WindowGlass'] },
      'prop_building_floor5': { primary: 'CorniceFloor5_Group', targets: ['CorniceFloor5_Group', 'Floor5_WindowOuterFrame', 'Floor5_WindowGlass'] },
      'prop_room_marble_floor': { primary: 'Floor', targets: ['Floor'] },
      'prop_room_walls': { primary: 'BackWall', targets: ['BackWall', 'FrontWall', 'LeftWallBack', 'LeftWallFront', 'LeftWallTop', 'RightWallB', 'RightWallT', 'RightWallL', 'RightWallR'] },
      'prop_room_ceiling': { primary: 'Ceiling', targets: ['Ceiling'] },
      'prop_main_door': { primary: 'DoorPivot', targets: ['DoorPanel', 'DoorFrameBack', 'DoorFrameFront', 'DoorFrameTop', 'DoorThreshold', 'DoorPivot', 'SashTop', 'SashBottom', 'SashLeft', 'SashRight', 'HandleAssembly', 'PlateInside', 'PlateOutside', 'LeverInsideStem', 'LeverInsideBar', 'LeverOutsideStem', 'LeverOutsideBar'] },
      'prop_window_21_9': { primary: 'ChillWindowOuterFrame', targets: ['ChillWindowOuterFrame', 'ChillWindowFrameTop', 'ChillWindowFrameBottom', 'ChillWindowFrameLeft', 'ChillWindowFrameRight', 'ChillGlassPane', 'WindowGlassPane'] },

      // 🪑 Nội thất
      'prop_main_desk': { primary: 'DeskTop', targets: ['DeskTop', 'LeftLegCurve', 'RightLegCurve', 'DeskFrame'] },
      'prop_chair_left': { primary: 'Chair1_Pivot', targets: ['Chair1_Pivot', 'Chair1_SeatCenter', 'Chair1_SeatCorner_FL', 'Chair1_SeatCorner_FR', 'Chair1_SeatCorner_BL', 'Chair1_SeatCorner_BR', 'Chair1_SeatSide_F', 'Chair1_SeatSide_B', 'Chair1_SeatSide_L', 'Chair1_SeatSide_R', 'Chair1_BackMeshMain', 'Chair1_BackFrameMain', 'Chair1_HeadrestCenter', 'Chair1_HeadrestLeft', 'Chair1_HeadrestRight', 'Chair1_ArmLeftPad', 'Chair1_ArmRightPad'] },
      'prop_chair_right': { primary: 'Chair2_Pivot', targets: ['Chair2_Pivot', 'Chair2_SeatCenter', 'Chair2_SeatCorner_FL', 'Chair2_SeatCorner_FR', 'Chair2_SeatCorner_BL', 'Chair2_SeatCorner_BR', 'Chair2_SeatSide_F', 'Chair2_SeatSide_B', 'Chair2_SeatSide_L', 'Chair2_SeatSide_R', 'Chair2_BackMeshMain', 'Chair2_BackFrameMain', 'Chair2_HeadrestCenter', 'Chair2_HeadrestLeft', 'Chair2_HeadrestRight', 'Chair2_ArmLeftPad', 'Chair2_ArmRightPad'] },
      'prop_pegboard': { primary: 'PegboardWall', targets: ['PegboardWall', 'PegboardShelf', 'PegboardBacklight'] },
      'prop_clothing_drawer': { primary: 'ClothingDrawer', targets: ['ClothingDrawer', 'DrawerCabinet'] },
      'prop_desk_mat_left': { primary: 'LeftDeskMat', targets: ['LeftDeskMat'] },
      'prop_desk_mat_right': { primary: 'RightDeskMat', targets: ['RightDeskMat'] },

      // 🖥️ Thiết bị Điện tử
      'prop_monitor_left': { primary: 'LeftMonitorBody', targets: ['LeftMonitorStand', 'LeftMonitorBody', 'LeftMonitorScreen'] },
      'prop_monitor_right': { primary: 'RightMonitorBody', targets: ['RightMonitorStand', 'RightMonitorBody', 'RightMonitorScreen'] },
      'prop_mechanical_keyboard_left': { primary: 'LeftKbd', targets: ['LeftKbd'] },
      'prop_mechanical_keyboard_right': { primary: 'RightKbd', targets: ['RightKbd'] },
      'prop_mouse_left': { primary: 'LeftMouse', targets: ['LeftMouse'] },
      'prop_mouse_right': { primary: 'RightMouse', targets: ['RightMouse'] },
      'prop_ps5_pro': { primary: 'ShelfPS5Pro_Pivot', targets: ['ShelfPS5Pro_Pivot', 'ShelfPS5Pro_StandBase', 'ShelfPS5Pro_CoreTower', 'ShelfPS5Pro_LeftPlateLower', 'ShelfPS5Pro_LeftPlateUpper', 'ShelfPS5Pro_RightPlateLower', 'ShelfPS5Pro_RightPlateUpper', 'ShelfPS5Pro_FrontLedStrip', 'ShelfPS5Pro_CtrlPivot'] },

      // 💡 Đèn & Trang trí
      'prop_aquarium': { primary: 'AquaBase', targets: ['AquaBase', 'AquaSand', 'AquaWater', 'AquaGlass', 'AquaTopHood', 'AquaLight'] },
      'prop_picture_frame': { primary: 'FamilyPictureFrame', targets: ['FamilyPictureFrame', 'FamilyFrameBacklight', 'FamilyFrameGlass'] },
      'prop_wall_clock': { primary: '3DWallClock_Pivot', targets: ['3DWallClock_Pivot', 'ClockOuterFrame', 'ClockFace', 'ClockCenterCap', 'HourHandBody', 'MinuteHandBody', 'SecondHandBody', 'HourHandPivot', 'MinuteHandPivot', 'SecondHandPivot', 'ClockTicks'] },
      'prop_tech_led_bar': { primary: 'LedBarLeft', targets: ['LedBarLeft', 'LedBarRight'] },
      'prop_wall_switch': { primary: 'WallSwitchBase', targets: ['WallSwitchBase', 'WallSwitchRocker', 'WallSwitchLedDot', 'WallSwitchBezel', 'WallSwitchGlowLight'] },
      'prop_ceiling_downlight_front': { primary: 'FrontLedLight', targets: ['FrontLedLight'] },
      'prop_ceiling_downlight_back': { primary: 'BackLedLight', targets: ['BackLedLight'] },
      'prop_ceiling_downlight_left': { primary: 'LeftLedLight', targets: ['LeftLedLight'] },
      'prop_ceiling_downlight_right': { primary: 'RightLedLight', targets: ['RightLedLight'] },

      // 🚗 Cảnh quan Ngoại thất
      'prop_street_cars': { primary: 'TrafficLanes', targets: ['TrafficLanes', 'TrafficCars'] },
      'prop_street_trees': { primary: 'StreetTrees', targets: ['StreetTrees', 'BonsaiTree'] },
      'prop_street_shophouses': { primary: 'LowerBuildingBase', targets: ['LowerBuildingBase', 'ShopHouses'] },
      'prop_street_traffic_lanes': { primary: 'RoadAsphalt', targets: ['RoadAsphalt'] }
    };

    this._applyProps = (props: any[], fullSync = false) => {
      if (!this.app || !props || !Array.isArray(props)) return;
      const matUserPropDefault = createMat(new pc.Color(0.02, 0.71, 0.83));

      for (const prop of props) {
        if (!prop || !prop.id) continue;
        const propId = prop.id;
        if (EMPTY_SCENE && PROP_ENTITY_CONFIG[propId]) continue; // bỏ qua đồ dựng sẵn
        const isVisible = prop.visible !== false;

        const updateMaterialProps = (ent: any) => {
          if (!ent) return;
          const applyToMesh = (node: any) => {
            if (node.render) {
              if (prop.castShadow !== undefined) {
                node.render.castShadows = prop.castShadow;
              } else {
                node.render.castShadows = false;
              }
              let mat = node.render.material as pc.StandardMaterial;
              if (mat) {
                let changed = false;

                // 🎨 Custom Diffuse Color (Apply ONLY when explicitly customized by user and not default #ffffff)
                if (prop._customColorSet && prop.color && typeof prop.color === 'string' && prop.color.toLowerCase() !== '#ffffff') {
                  if (!(mat as any)._isClonedInstance) {
                    mat = mat.clone() as pc.StandardMaterial;
                    (mat as any)._isClonedInstance = true;
                    node.render.material = mat;
                  }
                  mat.diffuse = new pc.Color().fromString(prop.color);
                  changed = true;
                }

                // 💧 Custom Opacity (Apply ONLY when explicitly set < 1.0)
                if (prop._customOpacitySet && prop.opacity !== undefined && typeof prop.opacity === 'number' && prop.opacity < 1.0) {
                  if (!(mat as any)._isClonedInstance) {
                    mat = mat.clone() as pc.StandardMaterial;
                    (mat as any)._isClonedInstance = true;
                    node.render.material = mat;
                  }
                  mat.opacity = prop.opacity;
                  mat.blendType = pc.BLEND_NORMAL;
                  changed = true;
                }

                // 💡 Custom Emissive (Apply ONLY when emissiveColor is provided and intensity > 0)
                if (prop._customEmissiveSet && prop.emissiveColor && prop.emissiveIntensity && prop.emissiveIntensity > 0) {
                  if (!(mat as any)._isClonedInstance) {
                    mat = mat.clone() as pc.StandardMaterial;
                    (mat as any)._isClonedInstance = true;
                    node.render.material = mat;
                  }
                  const c = new pc.Color().fromString(prop.emissiveColor);
                  const intensity = prop.emissiveIntensity || 0;
                  mat.emissive = new pc.Color(c.r * intensity, c.g * intensity, c.b * intensity);
                  changed = true;
                }

                // ⚙️ Custom Metalness (Apply ONLY when explicitly customized)
                if (prop._customMetalnessSet && prop.metalness !== undefined && typeof prop.metalness === 'number') {
                  if (!(mat as any)._isClonedInstance) {
                    mat = mat.clone() as pc.StandardMaterial;
                    (mat as any)._isClonedInstance = true;
                    node.render.material = mat;
                  }
                  mat.useMetalness = true;
                  mat.metalness = prop.metalness;
                  changed = true;
                }

                // ⚙️ Custom Roughness (Apply ONLY when explicitly customized)
                if (prop._customRoughnessSet && prop.roughness !== undefined && typeof prop.roughness === 'number') {
                  if (!(mat as any)._isClonedInstance) {
                    mat = mat.clone() as pc.StandardMaterial;
                    (mat as any)._isClonedInstance = true;
                    node.render.material = mat;
                  }
                  mat.useMetalness = true;
                  mat.gloss = Math.max(0, Math.min(1, 1.0 - prop.roughness));
                  changed = true;
                }

                if (changed) mat.update();
              }
            }
            if (node.children && Array.isArray(node.children)) {
              for (const child of node.children) {
                applyToMesh(child);
              }
            }
          };
          applyToMesh(ent);
        };

        const cfg = PROP_ENTITY_CONFIG[propId];
        if (cfg) {
          if (propId.includes('monitor') || propId.includes('window') || propId.includes('door') || propId.includes('building') || propId.includes('room')) {
            prop._customPositionSet = false;
            prop._customRotationSet = false;
            prop._customScaleSet = false;
            delete prop.position;
          }
          // 1. Toggle visibility on primary root entity
          const primaryEntity = this.app.root.findByName(cfg.primary);
          if (primaryEntity) {
            (primaryEntity as any).enabled = isVisible;
            if (!propId.includes('monitor')) {
              updateMaterialProps(primaryEntity);
            }
            if (prop._customPositionSet && prop.position && typeof prop.position.x === 'number') {
              (primaryEntity as any).setPosition(prop.position.x, prop.position.y, prop.position.z);
            }
            if (prop._customRotationSet && prop.rotation && typeof prop.rotation.x === 'number') {
              (primaryEntity as any).setEulerAngles(prop.rotation.x, prop.rotation.y, prop.rotation.z);
            }
            if (prop._customScaleSet && prop.scale && typeof prop.scale.x === 'number') {
              (primaryEntity as any).setLocalScale(prop.scale.x, prop.scale.y, prop.scale.z);
            }
          }
          // 2. Toggle visibility & update PBR material properties of target entities
          for (const name of cfg.targets) {
            const entity = this.app.root.findByName(name);
            if (entity) {
              (entity as any).enabled = isVisible;
              if (!name.includes('Screen')) {
                updateMaterialProps(entity);
              }
            }
          }

          if (propId.includes('monitor')) {
            let side: 'left' | 'right' | 'both' = 'both';
            if (propId.includes('left')) side = 'left';
            else if (propId.includes('right')) side = 'right';

            if (prop.activeScreenState === 'clock' || prop.activeScreenState === 'display' || prop.activeScreenState === 'image' || prop.screenOptions?.imageUrl) {
              showDateTimeOnMonitorFn(side, prop.screenOptions);
            } else if (prop.activeScreenState === 'none') {
              clearMonitorDisplayFn(side);
            }
          }

          // Restores active screen state (e.g. Realtime Clock Display) on page load / F5 refresh
          if (prop.activeScreenState === 'clock') {
            let side: 'left' | 'right' | 'both' = 'both';
            if (propId.includes('left')) side = 'left';
            else if (propId.includes('right')) side = 'right';
            this.showDateTimeOnMonitor(side, prop.screenOptions);
          }
        } else {
          // Fallback entity lookup by propId or name
          let entity = this.app.root.findByName(propId);
          if (!entity && prop.name) {
            entity = this.app.root.findByName(prop.name);
          }
          // GLB prop: chỉ dùng wrapper đã nạp, không bao giờ tạo khối hộp dự phòng
          const isModelProp = prop.shape === 'model' || !!prop.glbPath;
          if (isModelProp) {
            const wrapper = this.app.root.findByName(`PropGLB_${propId}`);
            if (wrapper) {
              entity = wrapper;
              const legacyBox = this.app.root.findByName(propId);
              if (legacyBox && legacyBox !== wrapper && (legacyBox as any).tags?.has('user_prop')) {
                try { legacyBox.destroy(); } catch (_) {}
              }
            } else {
              // GLB chưa nạp xong (bất đồng bộ): dọn khối hộp dự phòng cũ nếu có rồi chờ wrapper
              if (entity && (entity as any).tags?.has('user_prop')) {
                try { entity.destroy(); } catch (_) {}
              }
              entity = null;
            }
          }
          // Đồ vật thường (không phải GLB): tạo khối hộp hiển thị trong scene
          if (!entity && !isModelProp) {
            const userEnt = new pc.Entity(propId);
            userEnt.addComponent('render', { type: 'box', material: matUserPropDefault });
            userEnt.tags.add('user_prop');
            const pos = prop.position && typeof prop.position.x === 'number' ? prop.position : { x: 0, y: 1.2, z: 0 };
            const scl = prop.scale && typeof prop.scale.x === 'number' ? prop.scale : { x: 0.4, y: 0.4, z: 0.4 };
            userEnt.setPosition(pos.x, pos.y, pos.z);
            userEnt.setLocalScale(scl.x, scl.y, scl.z);
            if (prop.rotation && typeof prop.rotation.x === 'number') {
              userEnt.setEulerAngles(prop.rotation.x, prop.rotation.y, prop.rotation.z);
            }
            if (prop.color && typeof prop.color === 'string') {
              const m = createMat(new pc.Color().fromString(prop.color));
              if (userEnt.render) userEnt.render.material = m;
            }
            app.root.addChild(userEnt);
            entity = userEnt;
          } else if (entity && (entity as any).tags?.has('user_prop') && prop.color && typeof prop.color === 'string') {
            const r = (entity as any).render;
            if (r && r.material) {
              const m = r.material as pc.StandardMaterial;
              m.diffuse = new pc.Color().fromString(prop.color);
              m.update();
            }
          }
          if (entity && (entity as any).tags?.has('builtin_scene')) {
            entity = null; // không bật lại vật thể dựng sẵn đã ẩn
          }
          if (entity) {
            (entity as any).enabled = isVisible;
            updateMaterialProps(entity);
            if (prop._customPositionSet && prop.position && typeof prop.position.x === 'number') {
              (entity as any).setPosition(prop.position.x, prop.position.y, prop.position.z);
            }
            if (prop._customRotationSet && prop.rotation && typeof prop.rotation.x === 'number') {
              (entity as any).setEulerAngles(prop.rotation.x, prop.rotation.y, prop.rotation.z);
            }
            const entGlb: any = entity;
            if (entGlb.tags?.has('prop_glb') && prop.scale && typeof prop.scale.x === 'number') {
              // GLB (AI prompt / panel Inspector): khi scale doi so voi scale dang
              // hien thi cua entity, nang Y theo cong thuc giu day AABB co dinh:
              // Y_new = Y_cur + bottomLocal * (s_cur - s_new) — chinh xac ca truong
              // hop mon do dang chạm sàn lẫn đang được nâng cao tay.
              const curS = entGlb.getLocalScale();
              const curP = entGlb.getPosition();
              const scaleDiff = Math.abs(curS.x - prop.scale.x) > 1e-3 ||
                Math.abs(curS.y - prop.scale.y) > 1e-3 || Math.abs(curS.z - prop.scale.z) > 1e-3;
              if (scaleDiff) {
                entGlb.setLocalScale(prop.scale.x, prop.scale.y, prop.scale.z);
                const bl = entGlb._bottomLocalY;
                const nyPos = (typeof bl === 'number')
                  ? curP.y + bl * (curS.y - prop.scale.y)
                  : curP.y * (prop.scale.y / Math.max(1e-4, curS.y));
                entGlb.setPosition(curP.x, nyPos, curP.z);
                prop.position = { x: curP.x, y: Math.round(nyPos * 100) / 100, z: curP.z };
              }
              (prop as any)._groundedAtScale = { x: prop.scale.x, y: prop.scale.y, z: prop.scale.z };
            } else if (prop._customScaleSet && prop.scale && typeof prop.scale.x === 'number') {
              (entity as any).setLocalScale(prop.scale.x, prop.scale.y, prop.scale.z);
            }
          }
        }
      }

      // 🔹 Render & Realtime Sync 3D Sub-Devices / Buttons attached to props
      const activeSubEntIds = new Set<string>();
      const matSubButton = createMat(new pc.Color(0.02, 0.85, 0.75), new pc.Color(0.2, 0.9, 0.8));

      for (const prop of props) {
        if (!prop || !prop.id) continue;
        const parentVisible = prop.visible !== false;
        if (Array.isArray(prop.subDevices) && prop.subDevices.length > 0) {
          for (let i = 0; i < prop.subDevices.length; i++) {
            const sub = prop.subDevices[i];
            const isSubVisible = parentVisible && (sub.enabled !== false) && (sub.visible !== false);

            const subEntName = `sub_btn_${prop.id}_${sub.id || i}`;
            if (isSubVisible) {
              activeSubEntIds.add(subEntName);

              const shapeType = (sub.shape === 'sphere' || (sub.customScript && sub.customScript.toLowerCase().includes('tròn'))) ? 'sphere' : 'box';

              let subEnt = app.root.findByName(subEntName) as pc.Entity;
              if (!subEnt) {
                subEnt = new pc.Entity(subEntName);
                subEnt.addComponent('render', { type: shapeType, material: matSubButton });
                subEnt.tags.add('sub_device_button');
                app.root.addChild(subEnt);
              }
              (subEnt as any).enabled = true;
              (subEnt as any)._subDeviceData = sub;
              (subEnt as any)._parentProp = prop;

              // 1. Tọa độ 3D Position
              if (sub.position && (sub.position.x !== 0 || sub.position.y !== 0 || sub.position.z !== 0)) {
                subEnt.setPosition(sub.position.x, sub.position.y, sub.position.z);
              } else {
                const isWindow = prop.id.includes('window') || (prop.name && prop.name.toLowerCase().includes('cửa sổ'));
                if (isWindow) {
                  subEnt.setPosition(ROOM_WIDTH_X / 2 - 0.05, 16.0 - WINDOW_21_9_HEIGHT / 2 + 0.2, (i - (prop.subDevices.length - 1) / 2) * 1.3);
                } else if (prop.position && typeof prop.position.x === 'number') {
                  subEnt.setPosition(prop.position.x, prop.position.y + 0.6, prop.position.z + i * 0.8);
                } else {
                  subEnt.setPosition(0, 1.0 + i * 0.5, 0);
                }
              }

              // 2. Góc xoay 3D Rotation
              if (sub.rotation) {
                subEnt.setEulerAngles(sub.rotation.x || 0, sub.rotation.y || 0, sub.rotation.z || 0);
              }

              // 3. Co giãn 3D Scale
              if (sub.scale) {
                subEnt.setLocalScale(sub.scale.x || 0.4, sub.scale.y || 0.4, sub.scale.z || 0.4);
              } else if (shapeType === 'sphere') {
                subEnt.setLocalScale(0.4, 0.4, 0.4);
              } else {
                subEnt.setLocalScale(0.4, 0.2, 0.7);
              }

              // 4. Chất liệu PBR, Màu sắc, Phát sáng & Đổ bóng Realtime
              if (subEnt.render) {
                subEnt.render.castShadows = sub.castShadow === true;
                const mat = subEnt.render.material as pc.StandardMaterial;
                if (mat) {
                  if (sub.color) mat.diffuse = new pc.Color().fromString(sub.color);
                  if (sub.opacity !== undefined) {
                    mat.opacity = sub.opacity;
                    mat.blendType = sub.opacity < 1.0 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
                  }
                  if (sub.emissiveColor) {
                    const c = new pc.Color().fromString(sub.emissiveColor);
                    const intensity = sub.emissiveIntensity !== undefined ? sub.emissiveIntensity : 0.8;
                    mat.emissive = new pc.Color(c.r * intensity, c.g * intensity, c.b * intensity);
                  }
                  if (sub.metalness !== undefined) {
                    mat.useMetalness = true;
                    mat.metalness = sub.metalness;
                  }
                  if (sub.roughness !== undefined) {
                    mat.useMetalness = true;
                    mat.gloss = Math.max(0, Math.min(1, 1.0 - sub.roughness));
                  }
                  mat.update();
                }
              }
            } else {
              const existingSubEnt = app.root.findByName(subEntName) as pc.Entity;
              if (existingSubEnt) {
                existingSubEnt.enabled = false;
              }
            }
          }
        }
      }

      // Đồng bộ đầy đủ: xoá các khối đồ vật người dùng không còn trong danh sách
      if (fullSync) {
        const keepIds = new Set(props.filter(p => p && p.id).map(p => p.id));
        for (const ent of app.root.findByTag('user_prop') as pc.Entity[]) {
          const nmFs = ent.name;
          const rawId = nmFs.startsWith('PropGLB_') ? nmFs.slice(8) : nmFs;
          if (!keepIds.has(rawId)) {
            try { ent.destroy(); } catch (_) {}
          }
        }
      }

      // Realtime Cleanup: Disable & Destroy sub-button entities that are inactive
      const existingSubBtns = app.root.findByTag('sub_device_button') as pc.Entity[];
      for (const btnEnt of existingSubBtns) {
        if (!activeSubEntIds.has(btnEnt.name)) {
          btnEnt.enabled = false;
          try { btnEnt.destroy(); } catch (_) {}
        }
      }
    };

    let isTvOverlayOpen = false;
    function toggleWindowTvIframe(show?: boolean, url?: string) {
      const targetState = show !== undefined ? show : !isTvOverlayOpen;
      isTvOverlayOpen = targetState;

      let existingOverlay = document.getElementById('sontinh-window-tv-overlay') as HTMLDivElement;
      if (!targetState) {
        if (existingOverlay) {
          existingOverlay.style.display = 'none';
        }
        return;
      }

      const targetUrl = url || 'https://type.vn';
      if (!existingOverlay) {
        existingOverlay = document.createElement('div');
        existingOverlay.id = 'sontinh-window-tv-overlay';
        existingOverlay.className = 'absolute inset-x-4 top-16 bottom-16 z-[9999] bg-slate-900/95 backdrop-blur-md rounded-2xl border border-teal-500/40 shadow-2xl flex flex-col overflow-hidden animate-fadeIn';
        existingOverlay.innerHTML = `
          <div class="h-10 bg-slate-950/80 px-4 flex items-center justify-between border-b border-slate-800 text-xs font-semibold text-slate-200">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              <span class="ml-2 text-teal-400 font-mono">📺 MÀN HÌNH TV CỬA SỔ 21:9 (${targetUrl})</span>
            </div>
            <button id="close-tv-overlay-btn" class="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded transition-colors text-xs font-medium cursor-pointer">
              ✕ Tắt TV (Quay lại Cửa Sổ)
            </button>
          </div>
          <iframe src="${targetUrl}" class="w-full h-full border-0 bg-white" allow="autoplay; fullscreen"></iframe>
        `;
        const container = canvas.parentElement || document.body;
        if (getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }
        container.appendChild(existingOverlay);

        const closeBtn = existingOverlay.querySelector('#close-tv-overlay-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleWindowTvIframe(false);
          });
        }
      } else {
        const iframe = existingOverlay.querySelector('iframe');
        if (iframe && targetUrl) iframe.src = targetUrl;
        existingOverlay.style.display = 'flex';
      }
    }

    self.toggleWindowTvIframe = toggleWindowTvIframe;
    this._toggleWindowTvIframe = toggleWindowTvIframe;

    function tryClickSubDevice(screenX: number, screenY: number): boolean {
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);

      const subButtons = app.root.findByTag('sub_device_button') as pc.Entity[];
      for (const btn of subButtons) {
        if (!btn.enabled || !btn.render || btn.render.meshInstances.length === 0) continue;
        const aabb = btn.render.meshInstances[0].aabb;
        const hitPoint = new pc.Vec3();
        if (aabb.intersectsRay(ray, hitPoint)) {
          const subData = (btn as any)._subDeviceData;
          console.log('[SontinhScene] Clicked 3D Sub-Button:', subData?.name);
          toggleWindowTvIframe();
          return true;
        }
      }
      return false;
    }
    
    function tryClickLightSwitch(screenX: number, screenY: number) {
      if (EMPTY_SCENE) return false;
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);
    
      const switchRender = wallSwitchBase.render;
      if (switchRender && switchRender.meshInstances.length > 0) {
        const aabb = switchRender.meshInstances[0].aabb;
        const hitPoint = new pc.Vec3();
        if (aabb.intersectsRay(ray, hitPoint)) {
          toggleRoomLights();
          return true;
        }
      }
      return false;
    }
    
    // -------------------------------------------------------------
    // 🪟 4. TƯỜNG PHẢI & KHUNG CỬA SỔ 21:9 VUÔNG VẮN MINIMALIST (MINIMALIST SHARP 90° 21:9 WINDOW X: +70.0M)
    // -------------------------------------------------------------
    
    const WINDOW_21_9_HEIGHT = 16.0; // Y: 8.0m to 24.0m
    // -------------------------------------------------------------
    // 🏢 3-STORY BUILDING FACADE BASE UNDERNEATH 3RD FLOOR STUDIO ROOM (HEIGHT: 24.0M FROM GROUND_Y: -24.0M TO 0.0M)
    // -------------------------------------------------------------
    const GROUND_Y = -64.0; // Street ground level is 64 meters below 3rd floor studio room (Floors 1 & 2 are 32m height each)!
    
    const matBuildingFacade = createMat(new pc.Color(0.16, 0.19, 0.26), new pc.Color(0.2, 0.2, 0.2)); // Dark Slate Building Base Facade
    const matCorniceTrim = createMat(new pc.Color(0.06, 0.06, 0.08), new pc.Color(0.3, 0.3, 0.3));     // Sleek Matte Black Architectural Molding Trim
    
    // 1. Ground Foundation Base Structure (Bệ móng tòa nhà bên dưới Tầng 1)
    const lowerBuildingBase = new pc.Entity('LowerBuildingBase');
    lowerBuildingBase.addComponent('render', { type: 'box', material: matBuildingFacade });
    lowerBuildingBase.setLocalScale(ROOM_WIDTH_X + 2.0, 16.0, ROOM_DEPTH_Z + 2.0);
    lowerBuildingBase.setPosition(0, -72.0, 0);
    app.root.addChild(lowerBuildingBase);
    
    // 2. Architectural Floor Black Exterior Moldings (Gờ chỉ viền đen phân tầng ốp mặt ngoài tòa nhà, không chồng lấn sàn trong)
    function createExteriorFloorCornice(namePrefix: string, yPos: number) {
      const corniceGroup = new pc.Entity(`${namePrefix}_Group`);
      corniceGroup.setPosition(0, yPos, 0);
      app.root.addChild(corniceGroup);

      // Back Exterior Trim
      const bTrim = new pc.Entity(`${namePrefix}_BackTrim`);
      bTrim.addComponent('render', { type: 'box', material: matCorniceTrim });
      bTrim.setLocalScale(ROOM_WIDTH_X + 1.2, 0.6, 0.4);
      bTrim.setPosition(0, 0, -ROOM_DEPTH_Z / 2 - 0.2);
      corniceGroup.addChild(bTrim);

      // Front Exterior Trim
      const fTrim = new pc.Entity(`${namePrefix}_FrontTrim`);
      fTrim.addComponent('render', { type: 'box', material: matCorniceTrim });
      fTrim.setLocalScale(ROOM_WIDTH_X + 1.2, 0.6, 0.4);
      fTrim.setPosition(0, 0, ROOM_DEPTH_Z / 2 + 0.2);
      corniceGroup.addChild(fTrim);

      // Left Exterior Trim
      const lTrim = new pc.Entity(`${namePrefix}_LeftTrim`);
      lTrim.addComponent('render', { type: 'box', material: matCorniceTrim });
      lTrim.setLocalScale(0.4, 0.6, ROOM_DEPTH_Z + 1.2);
      lTrim.setPosition(-ROOM_WIDTH_X / 2 - 0.2, 0, 0);
      corniceGroup.addChild(lTrim);

      // Right Exterior Trim
      const rTrim = new pc.Entity(`${namePrefix}_RightTrim`);
      rTrim.addComponent('render', { type: 'box', material: matCorniceTrim });
      rTrim.setLocalScale(0.4, 0.6, ROOM_DEPTH_Z + 1.2);
      rTrim.setPosition(ROOM_WIDTH_X / 2 + 0.2, 0, 0);
      corniceGroup.addChild(rTrim);
    }

    createExteriorFloorCornice('CorniceFloor1', -64.0);
    createExteriorFloorCornice('CorniceFloor2', -32.0);
    createExteriorFloorCornice('CorniceFloor3', 0.0);
    createExteriorFloorCornice('CorniceFloor4', 32.0);
    createExteriorFloorCornice('CorniceFloor5', 64.0);
    createExteriorFloorCornice('CorniceRoof', 96.0);
    
    
    const WINDOW_21_9_WIDTH = 37.33; // Z: -18.665m to +18.665m (37.33m / 16.0m = 2.333 ~ 21:9 Ultrawide Aspect Ratio!)
    
    // Wall surrounds around cutout on Right Wall X: +70.0m
    const rightWallB = new pc.Entity('RightWallB');
    rightWallB.addComponent('render', { type: 'box', material: matWall });
    rightWallB.setLocalScale(0.5, 8.0, ROOM_DEPTH_Z);
    rightWallB.setPosition(ROOM_WIDTH_X / 2, 4.0, 0);
    app.root.addChild(rightWallB);
    
    const rightWallT = new pc.Entity('RightWallT');
    rightWallT.addComponent('render', { type: 'box', material: matWall });
    rightWallT.setLocalScale(0.5, WALL_H - 24.0, ROOM_DEPTH_Z);
    rightWallT.setPosition(ROOM_WIDTH_X / 2, 24.0 + (WALL_H - 24.0) / 2, 0);
    app.root.addChild(rightWallT);
    
    const rightWallSideLen = (ROOM_DEPTH_Z - WINDOW_21_9_WIDTH) / 2; // (80 - 37.33) / 2 = 21.335m
    
    const rightWallL = new pc.Entity('RightWallL');
    rightWallL.addComponent('render', { type: 'box', material: matWall });
    rightWallL.setLocalScale(0.5, WINDOW_21_9_HEIGHT, rightWallSideLen);
    rightWallL.setPosition(ROOM_WIDTH_X / 2, 16.0, -18.665 - rightWallSideLen / 2);
    app.root.addChild(rightWallL);
    
    const rightWallR = new pc.Entity('RightWallR');
    rightWallR.addComponent('render', { type: 'box', material: matWall });
    rightWallR.setLocalScale(0.5, WINDOW_21_9_HEIGHT, rightWallSideLen);
    rightWallR.setPosition(ROOM_WIDTH_X / 2, 16.0, 18.665 + rightWallSideLen / 2);
    app.root.addChild(rightWallR);
    
    // 💻 KHUNG CỬA SỔ 21:9 THIẾT KẾ CÔNG NGHỆ CAO PHẲNG ĐẸP CHUẨN XÁC (HIGH-TECH 21:9 FLUSH WINDOW BEZEL ASSEMBLY)
    const chillWindowOuterFrame = new pc.Entity('ChillWindowOuterFrame');
    chillWindowOuterFrame.addComponent('render', { type: 'box', material: matTechDisplayBezel });
    chillWindowOuterFrame.setLocalScale(0.50, WINDOW_21_9_HEIGHT, WINDOW_21_9_WIDTH);
    chillWindowOuterFrame.setPosition(ROOM_WIDTH_X / 2, 16.0, 0);
    app.root.addChild(chillWindowOuterFrame);

    // 🪟 MẶT KÍNH CỬA SỔ MINIMALIST 21:9 (PURE MINIMALIST CLEAR GLASS PANE)
    const chillGlassPane = new pc.Entity('ChillGlassPane');
    chillGlassPane.addComponent('render', { type: 'box', material: matGlass });
    chillGlassPane.setLocalScale(0.08, WINDOW_21_9_HEIGHT - 0.2, WINDOW_21_9_WIDTH - 0.2);
    chillGlassPane.setPosition(ROOM_WIDTH_X / 2, 16.0, 0);
    app.root.addChild(chillGlassPane);

    // 🏢 TẠO CẤU TRÚC KIẾN TRÚC TẦNG GIỐNG 100% TẦNG 3 (ROOM 306) VỚI ĐỘ CAO KHÔNG GIAN TỰ NHIÊN
    function createEmptyFloorStructure(floorPrefix: string, offsetY: number, floorHeight: number = WALL_H) {
      const rootEnt = new pc.Entity(`${floorPrefix}_Root`);
      rootEnt.setPosition(0, offsetY, 0);
      app.root.addChild(rootEnt);

      const h = floorHeight;
      const winH = Math.min(WINDOW_21_9_HEIGHT, h * 0.5);
      const winY = h * 0.5;

      // 1. Sàn đá Cẩm thạch Marble
      const floorEnt = new pc.Entity(`${floorPrefix}_Floor`);
      floorEnt.addComponent('render', { type: 'box', material: matMarbleFloor });
      floorEnt.setLocalScale(ROOM_WIDTH_X, 0.4, ROOM_DEPTH_Z);
      floorEnt.setPosition(0, -0.2, 0); // Top surface sits flush at Y = 0.0m relative to floor root!
      rootEnt.addChild(floorEnt);

      // 2. Tường Sau (Back Wall - Z: -40.0m)
      const bWall = new pc.Entity(`${floorPrefix}_BackWall`);
      bWall.addComponent('render', { type: 'box', material: matWall });
      bWall.setLocalScale(ROOM_WIDTH_X, h, 0.5);
      bWall.setPosition(0, h / 2, -ROOM_DEPTH_Z / 2);
      rootEnt.addChild(bWall);

      // 3. Tường Trước (Front Wall - Z: +40.0m)
      const fWall = new pc.Entity(`${floorPrefix}_FrontWall`);
      fWall.addComponent('render', { type: 'box', material: matWall });
      fWall.setLocalScale(ROOM_WIDTH_X, h, 0.5);
      fWall.setPosition(0, h / 2, ROOM_DEPTH_Z / 2);
      rootEnt.addChild(fWall);

      // 3. Tường Trái với Khung Cửa Ra Vào Tầng chuẩn y hệt Tầng 3 (Left Wall with Door Cutout & Assembly - X: -70.0m)
      const lWallBack = new pc.Entity(`${floorPrefix}_LeftWallBack`);
      lWallBack.addComponent('render', { type: 'box', material: matWall });
      lWallBack.setLocalScale(0.5, h, 35.0);
      lWallBack.setPosition(-ROOM_WIDTH_X / 2, h / 2, -22.5);
      rootEnt.addChild(lWallBack);

      const lWallFront = new pc.Entity(`${floorPrefix}_LeftWallFront`);
      lWallFront.addComponent('render', { type: 'box', material: matWall });
      lWallFront.setLocalScale(0.5, h, 35.0);
      lWallFront.setPosition(-ROOM_WIDTH_X / 2, h / 2, 22.5);
      rootEnt.addChild(lWallFront);

      const doorH = Math.min(20.0, h * 0.7);
      const lWallTopH = Math.max(0.5, h - doorH);

      const lWallTop = new pc.Entity(`${floorPrefix}_LeftWallTop`);
      lWallTop.addComponent('render', { type: 'box', material: matWall });
      lWallTop.setLocalScale(0.5, lWallTopH, 10.0);
      lWallTop.setPosition(-ROOM_WIDTH_X / 2, doorH + lWallTopH / 2, 0.0);
      rootEnt.addChild(lWallTop);

      // 🚪 Cửa Ra Vào Tầng chuẩn Y Hệt Tầng 3 (Main Entrance Door Frame & Panel Assembly)
      const doorFrameBack = new pc.Entity(`${floorPrefix}_DoorFrameBack`);
      doorFrameBack.addComponent('render', { type: 'box', material: matOuterFrame });
      doorFrameBack.setLocalScale(0.6, doorH, 0.3);
      doorFrameBack.setPosition(-ROOM_WIDTH_X / 2, doorH / 2, -5.15);
      rootEnt.addChild(doorFrameBack);

      const doorFrameFront = new pc.Entity(`${floorPrefix}_DoorFrameFront`);
      doorFrameFront.addComponent('render', { type: 'box', material: matOuterFrame });
      doorFrameFront.setLocalScale(0.6, doorH, 0.3);
      doorFrameFront.setPosition(-ROOM_WIDTH_X / 2, doorH / 2, 5.15);
      rootEnt.addChild(doorFrameFront);

      const doorFrameTop = new pc.Entity(`${floorPrefix}_DoorFrameTop`);
      doorFrameTop.addComponent('render', { type: 'box', material: matOuterFrame });
      doorFrameTop.setLocalScale(0.6, 0.3, 10.6);
      doorFrameTop.setPosition(-ROOM_WIDTH_X / 2, doorH + 0.15, 0.0);
      rootEnt.addChild(doorFrameTop);

      const doorThreshold = new pc.Entity(`${floorPrefix}_DoorThreshold`);
      doorThreshold.addComponent('render', { type: 'box', material: matOuterFrame });
      doorThreshold.setLocalScale(0.6, 0.1, 10.2);
      doorThreshold.setPosition(-ROOM_WIDTH_X / 2, 0.05, 0.0);
      rootEnt.addChild(doorThreshold);

      const doorPivot = new pc.Entity(`${floorPrefix}_DoorPivot`);
      doorPivot.setPosition(-ROOM_WIDTH_X / 2, 0, -4.95);
      rootEnt.addChild(doorPivot);

      const doorPanel = new pc.Entity(`${floorPrefix}_DoorPanel`);
      doorPanel.addComponent('render', { type: 'box', material: matDoorWood });
      doorPanel.setLocalScale(0.32, doorH - 0.4, 9.6);
      doorPanel.setPosition(0, doorH / 2, 4.95);
      doorPivot.addChild(doorPanel);

      const sashTop = new pc.Entity(`${floorPrefix}_SashTop`);
      sashTop.addComponent('render', { type: 'box', material: matInnerBlackSash });
      sashTop.setLocalScale(0.36, 0.16, 9.9);
      sashTop.setPosition(0, doorH - 0.18, 4.95);
      doorPivot.addChild(sashTop);

      const sashBottom = new pc.Entity(`${floorPrefix}_SashBottom`);
      sashBottom.addComponent('render', { type: 'box', material: matInnerBlackSash });
      sashBottom.setLocalScale(0.36, 0.16, 9.9);
      sashBottom.setPosition(0, 0.1, 4.95);
      doorPivot.addChild(sashBottom);

      const handle = new pc.Entity(`${floorPrefix}_Handle`);
      handle.addComponent('render', { type: 'box', material: matDoorHandleGold });
      handle.setLocalScale(0.48, 1.2, 0.15);
      handle.setPosition(0, doorH * 0.5, 9.2);
      doorPivot.addChild(handle);

      // 4. Cửa sổ Minimalist 21:9 & Tường Phải (Right Wall Cutout - X: +70.0m)
      const rightWallB = new pc.Entity(`${floorPrefix}_RightWallB`);
      rightWallB.addComponent('render', { type: 'box', material: matWall });
      rightWallB.setLocalScale(0.5, h * 0.25, ROOM_DEPTH_Z);
      rightWallB.setPosition(ROOM_WIDTH_X / 2, h * 0.125, 0);
      rootEnt.addChild(rightWallB);

      const rightWallT = new pc.Entity(`${floorPrefix}_RightWallT`);
      rightWallT.addComponent('render', { type: 'box', material: matWall });
      rightWallT.setLocalScale(0.5, h * 0.25, ROOM_DEPTH_Z);
      rightWallT.setPosition(ROOM_WIDTH_X / 2, h * 0.875, 0);
      rootEnt.addChild(rightWallT);

      const rightWallSideLen = (ROOM_DEPTH_Z - WINDOW_21_9_WIDTH) / 2;

      const rightWallL = new pc.Entity(`${floorPrefix}_RightWallL`);
      rightWallL.addComponent('render', { type: 'box', material: matWall });
      rightWallL.setLocalScale(0.5, winH, rightWallSideLen);
      rightWallL.setPosition(ROOM_WIDTH_X / 2, winY, -18.665 - rightWallSideLen / 2);
      rootEnt.addChild(rightWallL);

      const rightWallR = new pc.Entity(`${floorPrefix}_RightWallR`);
      rightWallR.addComponent('render', { type: 'box', material: matWall });
      rightWallR.setLocalScale(0.5, winH, rightWallSideLen);
      rightWallR.setPosition(ROOM_WIDTH_X / 2, winY, 18.665 + rightWallSideLen / 2);
      rootEnt.addChild(rightWallR);

      const winOuter = new pc.Entity(`${floorPrefix}_WindowOuterFrame`);
      winOuter.addComponent('render', { type: 'box', material: matTechDisplayBezel });
      winOuter.setLocalScale(0.6, winH + 1.2, WINDOW_21_9_WIDTH + 1.2);
      winOuter.setPosition(ROOM_WIDTH_X / 2, winY, 0);
      rootEnt.addChild(winOuter);

      const winGlass = new pc.Entity(`${floorPrefix}_WindowGlass`);
      winGlass.addComponent('render', { type: 'box', material: matGlass });
      winGlass.setLocalScale(0.1, winH, WINDOW_21_9_WIDTH);
      winGlass.setPosition(ROOM_WIDTH_X / 2 + 0.1, winY, 0);
      rootEnt.addChild(winGlass);


    }

    // Khởi tạo 5 tầng kiến trúc tòa nhà với chiều cao WALL_H (35m) đồng nhất 100%
    createEmptyFloorStructure('Floor1', -WALL_H * 2, WALL_H);
    createEmptyFloorStructure('Floor2', -WALL_H, WALL_H);
    createEmptyFloorStructure('Floor4', WALL_H, WALL_H);
    createEmptyFloorStructure('Floor5', WALL_H * 2, WALL_H);
    
    
    // 🖱️ Raycast Click Detection for Window Glass
    // Click on CHARACTER — opens animation overlay. Called before tryClickWindow
    // to prevent the glass-pane street-view from firing on character area.
    function tryClickCharacter(screenX: number, screenY: number): boolean {
      if (self.isTriggerDisabled('clickCharacter')) return false;
      if (!camera?.camera || !charPivot || !charAnimReady) return false;
    
      const near = new pc.Vec3(), far = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, 0.01, near);
      camera.camera.screenToWorld(screenX, screenY, 200,  far);
      const dir = new pc.Vec3().sub2(far, near).normalize();
    
      // Character bounding sphere: center at hip height (~6 units), radius 4
      const cp = charPivot.getPosition();
      const center = new pc.Vec3(cp.x, cp.y + 6, cp.z);
      const RADIUS = 4;
    
      const oc = new pc.Vec3().sub2(near, center);
      const b = 2 * oc.dot(dir);
      const c = oc.dot(oc) - RADIUS * RADIUS;
      const disc = b * b - 4 * c;
      if (disc < 0) return false; // ray misses sphere
    
      if (self.executeEvent('clickCharacter')) return true;
      toggleAnimOverlay();
      return true;
    }
    
    function tryClickWindow(screenX: number, screenY: number) {
      if (EMPTY_SCENE) return false;
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);
    
      const glassRender = chillGlassPane.render;
      if (glassRender && glassRender.meshInstances.length > 0) {
        const aabb = glassRender.meshInstances[0].aabb;
        const hitPoint = new pc.Vec3();
        if (aabb.intersectsRay(ray, hitPoint)) {
          toggleWindowStreetView();
          return true;
        }
      }
      return false;
    }
    
    // -------------------------------------------------------------
    // 🇻🇳 5. BÊN NGOÀI CỬA SỔ: CẢNH PHỐ XÁ VIỆT NAM NHỘN NHỊP 3D (VIETNAMESE CITY STREETSCAPE OUTSIDE RIGHT WINDOW)
    // -------------------------------------------------------------
    
    const STREET_OFFSET_X = ROOM_WIDTH_X / 2;
    
    
    // 🛣️ ĐƯỜNG PHỐ NHỰA ASPHALT 2 LÀN XE Ô TÔ CHẠY RỘNG 12M (X: +99M TỚI +111M)
    const streetRoad = new pc.Entity('StreetRoad');
    streetRoad.addComponent('render', { type: 'box', material: matRoadAsphalt });
    streetRoad.setLocalScale(12.0, 0.3, 80.0);
    streetRoad.setPosition(STREET_OFFSET_X + 35.0, GROUND_Y - 0.15, 0);
    app.root.addChild(streetRoad);
    
    const streetYellowLine = new pc.Entity('StreetYellowLine');
    streetYellowLine.addComponent('render', { type: 'box', material: matYellowLine });
    streetYellowLine.setLocalScale(0.3, 0.32, 80.0);
    streetYellowLine.setPosition(STREET_OFFSET_X + 35.0, GROUND_Y - 0.14, 0);
    app.root.addChild(streetYellowLine);
    
    // 🚶‍♂️ VỈA HÈ PHÍA TÒA NHÀ 5 TẦNG TĂNG GẤP ĐÔI SIÊU RỘNG (29.0M PROMENADE X: +70M TỚI +99M)
    const sidewalkNear = new pc.Entity('SidewalkNear');
    sidewalkNear.addComponent('render', { type: 'box', material: matSidewalkTile });
    sidewalkNear.setLocalScale(29.0, 0.4, 80.0);
    sidewalkNear.setPosition(STREET_OFFSET_X + 14.5, GROUND_Y + 0.2, 0);
    app.root.addChild(sidewalkNear);

    const sidewalkCurbNear = new pc.Entity('SidewalkCurbNear');
    sidewalkCurbNear.addComponent('render', { type: 'box', material: matMarbleBorder });
    sidewalkCurbNear.setLocalScale(0.4, 0.45, 80.0);
    sidewalkCurbNear.setPosition(STREET_OFFSET_X + 29.0, GROUND_Y + 0.22, 0);
    app.root.addChild(sidewalkCurbNear);
    
    // 🚶‍♂️ VỈA HÈ BÊN ĐỐI DIỆN 3 QUÁN (X: +111M TỚI +130M)
    const sidewalkCurbFar = new pc.Entity('SidewalkCurbFar');
    sidewalkCurbFar.addComponent('render', { type: 'box', material: matMarbleBorder });
    sidewalkCurbFar.setLocalScale(0.4, 0.45, 80.0);
    sidewalkCurbFar.setPosition(STREET_OFFSET_X + 41.0, GROUND_Y + 0.22, 0);
    app.root.addChild(sidewalkCurbFar);
    
    const sidewalkPedestrianFar = new pc.Entity('SidewalkPedestrianFar');
    sidewalkPedestrianFar.addComponent('render', { type: 'box', material: matSidewalkTile });
    sidewalkPedestrianFar.setLocalScale(19.0, 0.4, 80.0);
    sidewalkPedestrianFar.setPosition(STREET_OFFSET_X + 50.5, GROUND_Y + 0.2, 0);
    app.root.addChild(sidewalkPedestrianFar);
    
    // 🚲 HELPER: BUILD 3D VIETNAMESE TRADITIONAL XÍCH LÔ (CYCLO WITH NÓN LÁ DRIVER)
    function createVietnameseCyclo3D(namePrefix: string, posX: number, posZ: number) {
      const cycloPivot = new pc.Entity(`${namePrefix}_Pivot`);
      cycloPivot.setPosition(posX, 0, posZ);
      app.root.addChild(cycloPivot);
    
      // 1. Black Steel Frame & Wheel Chassis
      const frameBase = new pc.Entity(`${namePrefix}_FrameBase`);
      frameBase.addComponent('render', { type: 'box', material: matBlackMetal });
      frameBase.setLocalScale(1.4, 0.12, 2.4);
      frameBase.setPosition(0, 0.5, 0);
      cycloPivot.addChild(frameBase);
    
      // 2 Front Wheels
      const wheelFL = new pc.Entity(`${namePrefix}_WheelFL`);
      wheelFL.addComponent('render', { type: 'cylinder', material: matCasterWheel });
      wheelFL.setLocalScale(0.8, 0.10, 0.8);
      wheelFL.setPosition(-0.75, 0.4, -0.6);
      wheelFL.setEulerAngles(0, 0, 90);
      cycloPivot.addChild(wheelFL);
    
      const wheelFR = new pc.Entity(`${namePrefix}_WheelFR`);
      wheelFR.addComponent('render', { type: 'cylinder', material: matCasterWheel });
      wheelFR.setLocalScale(0.8, 0.10, 0.8);
      wheelFR.setPosition(0.75, 0.4, -0.6);
      wheelFR.setEulerAngles(0, 0, 90);
      cycloPivot.addChild(wheelFR);
    
      // 1 Rear Wheel
      const wheelRear = new pc.Entity(`${namePrefix}_WheelRear`);
      wheelRear.addComponent('render', { type: 'cylinder', material: matCasterWheel });
      wheelRear.setLocalScale(0.8, 0.10, 0.8);
      wheelRear.setPosition(0, 0.4, 1.0);
      wheelRear.setEulerAngles(0, 0, 90);
      cycloPivot.addChild(wheelRear);
    
      // 2. Passenger Front Seat with Red Canopy Roof
      const passengerSeat = new pc.Entity(`${namePrefix}_PassengerSeat`);
      passengerSeat.addComponent('render', { type: 'box', material: matChairLeatherSeat });
      passengerSeat.setLocalScale(1.1, 0.6, 1.0);
      passengerSeat.setPosition(0, 0.85, -0.5);
      cycloPivot.addChild(passengerSeat);
    
      const canopyTop = new pc.Entity(`${namePrefix}_CanopyTop`);
      canopyTop.addComponent('render', { type: 'box', material: matCycloCanopy });
      canopyTop.setLocalScale(1.3, 0.08, 1.2);
      canopyTop.setPosition(0, 2.1, -0.5);
      cycloPivot.addChild(canopyTop);
    
      const canopyStemL = new pc.Entity(`${namePrefix}_CanopyStemL`);
      canopyStemL.addComponent('render', { type: 'box', material: matBlackMetal });
      canopyStemL.setLocalScale(0.06, 1.2, 0.06);
      canopyStemL.setPosition(-0.6, 1.5, -0.5);
      cycloPivot.addChild(canopyStemL);
    
      const canopyStemR = new pc.Entity(`${namePrefix}_CanopyStemR`);
      canopyStemR.addComponent('render', { type: 'box', material: matBlackMetal });
      canopyStemR.setLocalScale(0.06, 1.2, 0.06);
      canopyStemR.setPosition(0.6, 1.5, -0.5);
      cycloPivot.addChild(canopyStemR);
    
      // 3. Driver Seat & Conical Hat (Nón Lá) Rider
      const driverSeat = new pc.Entity(`${namePrefix}_DriverSeat`);
      driverSeat.addComponent('render', { type: 'cylinder', material: matBlackMetal });
      driverSeat.setLocalScale(0.35, 0.6, 0.35);
      driverSeat.setPosition(0, 1.1, 0.8);
      cycloPivot.addChild(driverSeat);
    
      const nonLaHat = new pc.Entity(`${namePrefix}_NonLaHat`);
      nonLaHat.addComponent('render', { type: 'cone', material: matNonLa });
      nonLaHat.setLocalScale(0.7, 0.35, 0.7);
      nonLaHat.setPosition(0, 2.2, 0.8);
      cycloPivot.addChild(nonLaHat);

      return cycloPivot;
    }

    // 🏢 DÃY 3 QUÁN ẨM THỰC VIỆT NAM ĐỐI DIỆN TÒA NHÀ (SÁT VỈA HÈ ĐƯỜNG PHỐ Y: -64.0M)
    
    // HD TEXT SIGNBOARD MATERIALS (Gam màu truyền thống nhã nhặn, sang trọng)
    const matSignBunDauText = createDynamicTextSignTexture(
      app,
      'BÚN ĐẬU MẮM TÔM',
      'ĐẶC SẢN HÀ NỘI • PHỐ CỔ',
      '#701a75',
      '#fef08a',
      '#fef08a'
    );
    
    const matSignComTamText = createDynamicTextSignTexture(
      app,
      'CƠM TẤM SÀI GÒN',
      'SƯỜN BÌ CHẢ TÔM • CHÍNH GỐC',
      '#15803d',
      '#ffffff',
      '#fef08a'
    );
    
    const matSignBanhMiText = createDynamicTextSignTexture(
      app,
      'BÁNH MÌ SÀI GÒN',
      'GIÒ LỤA • THỊT NƯỚNG • PÂTÉ',
      '#0f766e',
      '#facc15',
      '#ffffff'
    );

    // 1. 🍲 QUÁN BÚN ĐẬU MẮM TÔM
    const shopBunDauBuilding = new pc.Entity('ShopBunDauBuilding');
    shopBunDauBuilding.addComponent('render', { type: 'box', material: matShopYellow });
    shopBunDauBuilding.setLocalScale(10.0, 24.0, 20.0);
    shopBunDauBuilding.setPosition(STREET_OFFSET_X + 65.0, GROUND_Y + 12.0, -20.0);
    app.root.addChild(shopBunDauBuilding);
    
    const roofBunDau = new pc.Entity('RoofBunDau');
    roofBunDau.addComponent('render', { type: 'box', material: matTileRoof });
    roofBunDau.setLocalScale(10.6, 1.4, 20.6);
    roofBunDau.setPosition(STREET_OFFSET_X + 65.0, GROUND_Y + 24.7, -20.0);
    app.root.addChild(roofBunDau);
    
    const signBunDau = new pc.Entity('SignBunDau');
    signBunDau.addComponent('render', { type: 'box', material: matSignBunDauText });
    signBunDau.setLocalScale(0.6, 2.8, 14.0);
    signBunDau.setPosition(STREET_OFFSET_X + 59.6, GROUND_Y + 16.5, -20.0);
    app.root.addChild(signBunDau);

    const doorBunDauInterior = new pc.Entity('DoorBunDauInterior');
    doorBunDauInterior.addComponent('render', { type: 'box', material: matWarmStoreInterior });
    doorBunDauInterior.setLocalScale(0.3, 5.0, 6.5);
    doorBunDauInterior.setPosition(STREET_OFFSET_X + 59.5, GROUND_Y + 2.5, -20.0);
    app.root.addChild(doorBunDauInterior);
    
    const doorBunDauFrame = new pc.Entity('DoorBunDauFrame');
    doorBunDauFrame.addComponent('render', { type: 'box', material: matWalnut });
    doorBunDauFrame.setLocalScale(0.5, 5.2, 6.8);
    doorBunDauFrame.setPosition(STREET_OFFSET_X + 59.2, GROUND_Y + 2.6, -20.0);
    app.root.addChild(doorBunDauFrame);

    // 2. 🍖 QUÁN CƠM TẤM SÀI GÒN
    const shopComTamBuilding = new pc.Entity('ShopComTamBuilding');
    shopComTamBuilding.addComponent('render', { type: 'box', material: matFrenchOchre });
    shopComTamBuilding.setLocalScale(10.0, 26.0, 18.0);
    shopComTamBuilding.setPosition(STREET_OFFSET_X + 65.0, GROUND_Y + 13.0, 0.0);
    app.root.addChild(shopComTamBuilding);
    
    const roofComTam = new pc.Entity('RoofComTam');
    roofComTam.addComponent('render', { type: 'box', material: matTileRoof });
    roofComTam.setLocalScale(10.6, 1.4, 18.6);
    roofComTam.setPosition(STREET_OFFSET_X + 65.0, GROUND_Y + 26.7, 0.0);
    app.root.addChild(roofComTam);
    
    const signComTam = new pc.Entity('SignComTam');
    signComTam.addComponent('render', { type: 'box', material: matSignComTamText });
    signComTam.setLocalScale(0.6, 3.0, 15.0);
    signComTam.setPosition(STREET_OFFSET_X + 59.6, GROUND_Y + 18.2, 0.0);
    app.root.addChild(signComTam);

    const doorComTamInterior = new pc.Entity('DoorComTamInterior');
    doorComTamInterior.addComponent('render', { type: 'box', material: matWarmStoreInterior });
    doorComTamInterior.setLocalScale(0.3, 5.2, 7.0);
    doorComTamInterior.setPosition(STREET_OFFSET_X + 59.5, GROUND_Y + 2.6, 0.0);
    app.root.addChild(doorComTamInterior);

    // 3. 🥖 TIỆM BÁNH MÌ SÀI GÒN
    const shopBanhMiSaiGonBuilding = new pc.Entity('ShopBanhMiSaiGonBuilding');
    shopBanhMiSaiGonBuilding.addComponent('render', { type: 'box', material: matShopYellow });
    shopBanhMiSaiGonBuilding.setLocalScale(10.0, 23.0, 18.0);
    shopBanhMiSaiGonBuilding.setPosition(STREET_OFFSET_X + 65.0, GROUND_Y + 11.5, 20.0);
    app.root.addChild(shopBanhMiSaiGonBuilding);
    
    const roofBanhMi = new pc.Entity('RoofBanhMi');
    roofBanhMi.addComponent('render', { type: 'box', material: matTileRoof });
    roofBanhMi.setLocalScale(10.6, 1.4, 18.6);
    roofBanhMi.setPosition(STREET_OFFSET_X + 65.0, GROUND_Y + 23.7, 20.0);
    app.root.addChild(roofBanhMi);

    const signBanhMiSaiGon = new pc.Entity('SignBanhMiSaiGon');
    signBanhMiSaiGon.addComponent('render', { type: 'box', material: matSignBanhMiText });
    signBanhMiSaiGon.setLocalScale(0.6, 2.6, 14.0);
    signBanhMiSaiGon.setPosition(STREET_OFFSET_X + 59.6, GROUND_Y + 15.5, 20.0);
    app.root.addChild(signBanhMiSaiGon);

    const doorBanhMiInterior = new pc.Entity('DoorBanhMiInterior');
    doorBanhMiInterior.addComponent('render', { type: 'box', material: matWarmStoreInterior });
    doorBanhMiInterior.setLocalScale(0.3, 4.8, 6.2);
    doorBanhMiInterior.setPosition(STREET_OFFSET_X + 59.5, GROUND_Y + 2.4, 20.0);
    app.root.addChild(doorBanhMiInterior);

    
    
    // 🚘 HELPER: CREATE 3D AUTOMOBILE CAR WITH WHEELS, HEADLIGHTS & TAILLIGHTS
    function create3DCarEntity(name: string, bodyMaterial: pc.StandardMaterial, posX: number, posZ: number, isReverseDirection: boolean = false) {
      const carPivot = new pc.Entity(`${name}_Pivot`);
      carPivot.setPosition(posX, GROUND_Y + 0.2, posZ);
      if (isReverseDirection) {
        carPivot.setEulerAngles(0, 180, 0);
      }
      app.root.addChild(carPivot);
    
      // Car Body Base Shell
      const bodyBase = new pc.Entity(`${name}_BodyBase`);
      bodyBase.addComponent('render', { type: 'box', material: bodyMaterial });
      bodyBase.setLocalScale(2.4, 1.2, 5.2);
      bodyBase.setPosition(0, 0.8, 0);
      carPivot.addChild(bodyBase);
    
      // Car Cabin Roof / Windshield Glass
      const cabinRoof = new pc.Entity(`${name}_CabinRoof`);
      cabinRoof.addComponent('render', { type: 'box', material: matGlass });
      cabinRoof.setLocalScale(2.1, 1.1, 2.8);
      cabinRoof.setPosition(0, 1.85, -0.2);
      carPivot.addChild(cabinRoof);
    
      // 4 Wheels
      const wheelOffsets = [
        { x: -1.25, z: 1.6 },
        { x: 1.25, z: 1.6 },
        { x: -1.25, z: -1.6 },
        { x: 1.25, z: -1.6 },
      ];
      wheelOffsets.forEach((w, idx) => {
        const wheel = new pc.Entity(`${name}_Wheel_${idx}`);
        wheel.addComponent('render', { type: 'cylinder', material: matCasterWheel });
        wheel.setLocalScale(0.85, 0.28, 0.85);
        wheel.setPosition(w.x, 0.45, w.z);
        wheel.setEulerAngles(0, 0, 90);
        carPivot.addChild(wheel);
      });
    
      // Front Headlights
      const headL = new pc.Entity(`${name}_HeadL`);
      headL.addComponent('render', { type: 'box', material: matHeadlightEmissive });
      headL.setLocalScale(0.4, 0.2, 0.1);
      headL.setPosition(-0.8, 0.85, -2.62);
      carPivot.addChild(headL);
    
      const headR = new pc.Entity(`${name}_HeadR`);
      headR.addComponent('render', { type: 'box', material: matHeadlightEmissive });
      headR.setLocalScale(0.4, 0.2, 0.1);
      headR.setPosition(0.8, 0.85, -2.62);
      carPivot.addChild(headR);
    
      // Rear Red Taillights
      const tailL = new pc.Entity(`${name}_TailL`);
      tailL.addComponent('render', { type: 'box', material: matTaillightEmissive });
      tailL.setLocalScale(0.4, 0.2, 0.1);
      tailL.setPosition(-0.8, 0.85, 2.62);
      carPivot.addChild(tailL);
    
      const tailR = new pc.Entity(`${name}_TailR`);
      tailR.addComponent('render', { type: 'box', material: matTaillightEmissive });
      tailR.setLocalScale(0.4, 0.2, 0.1);
      tailR.setPosition(0.8, 0.85, 2.62);
      carPivot.addChild(tailR);
    
      return carPivot;
    }
    
    // 🚗 INSTANTIATE 6 MULTI-COLORED 3D CARS DRIVING BACK AND FORTH IN BOTH DIRECTIONS IN ROAD LANES (X: +102M & +108M)
    const carRedSedan = create3DCarEntity('CarRedSedan', matCarRed, STREET_OFFSET_X + 32.0, -22.0, false);
    const carWhiteSUV = create3DCarEntity('CarWhiteSUV', matCarWhite, STREET_OFFSET_X + 32.0, 12.0, false);
    const carBlueSport = create3DCarEntity('CarBlueSport', matCarBlue, STREET_OFFSET_X + 32.0, -42.0, false);
    
    const carBlackLuxury = create3DCarEntity('CarBlackLuxury', matCarBlack, STREET_OFFSET_X + 38.0, 25.0, true);
    const carSilverCoupe = create3DCarEntity('CarSilverCoupe', matCarSilver, STREET_OFFSET_X + 38.0, -15.0, true);
    const carYellowTaxi = create3DCarEntity('CarYellowTaxi', matCarYellow, STREET_OFFSET_X + 38.0, 45.0, true);
    
    // 🛵 XE CỘ ĐI LẠI NHỘN NHỊP TRÊN LÒNG ĐƯỜNG
    const motorbike1 = new pc.Entity('Motorbike1');
    motorbike1.addComponent('render', { type: 'box', material: matMotorbikeRed });
    motorbike1.setLocalScale(0.8, 1.4, 2.6);
    motorbike1.setPosition(STREET_OFFSET_X + 31.0, GROUND_Y + 0.9, -15.0);
    app.root.addChild(motorbike1);
    
    const motorbike2 = new pc.Entity('Motorbike2');
    motorbike2.addComponent('render', { type: 'box', material: matMotorbikeYellow });
    motorbike2.setLocalScale(0.8, 1.4, 2.6);
    motorbike2.setPosition(STREET_OFFSET_X + 31.0, GROUND_Y + 0.9, 8.0);
    app.root.addChild(motorbike2);
    
    const motorbike3 = new pc.Entity('Motorbike3');
    motorbike3.addComponent('render', { type: 'box', material: matMotorbikeBlue });
    motorbike3.setLocalScale(0.8, 1.4, 2.6);
    motorbike3.setPosition(STREET_OFFSET_X + 39.0, GROUND_Y + 0.9, -8.0);
    app.root.addChild(motorbike3);
    
    const motorbike4 = new pc.Entity('Motorbike4');
    motorbike4.addComponent('render', { type: 'box', material: matMotorbikeWhite });
    motorbike4.setLocalScale(0.8, 1.4, 2.6);
    motorbike4.setPosition(STREET_OFFSET_X + 39.0, GROUND_Y + 0.9, 18.0);
    app.root.addChild(motorbike4);
    
    const streetCar = new pc.Entity('StreetCar');
    streetCar.addComponent('render', { type: 'box', material: matCarBlack });
    streetCar.setLocalScale(2.2, 1.8, 4.8);
    streetCar.setPosition(STREET_OFFSET_X + 38.0, GROUND_Y + 1.1, -25.0);
    app.root.addChild(streetCar);
    
    // 🌳 CÂY XANH ĐƯỜNG PHỐ VIỆT NAM (Tán cây vươn cao sát mép vỉa hè X: +98m)
    for (let t = -25; t <= 25; t += 12) {
      const treeTrunk = new pc.Entity(`StreetTreeTrunk_${t}`);
      treeTrunk.addComponent('render', { type: 'cylinder', material: matOakWood });
      treeTrunk.setLocalScale(0.8, 12.0, 0.8);
      treeTrunk.setPosition(STREET_OFFSET_X + 28.0, GROUND_Y + 6.0, t);
      app.root.addChild(treeTrunk);
    
      const treeCanopy = new pc.Entity(`StreetTreeCanopy_${t}`);
      treeCanopy.addComponent('render', { type: 'sphere', material: matPlantLeaf });
      treeCanopy.setLocalScale(6.5, 6.0, 6.5);
      treeCanopy.setPosition(STREET_OFFSET_X + 28.0, GROUND_Y + 13.0, t);
      app.root.addChild(treeCanopy);
    }
    
    // -------------------------------------------------------------
    // 💡 4 BÓNG ĐÈN LED DÀI GẮN SÁT TƯỜNG, NỐI LIỀN TẠO THÀNH 1 VÒNG KHÉP KÍN DÀNH CHO CĂN PHÒNG (CONTINUOUS 360° WALL-MOUNTED LED RING)
    // -------------------------------------------------------------
    
    // 1. Đèn LED Tường Sau (North Wall LED Strip - Full 140m Width)
    const backLedHousing = new pc.Entity('BackLedHousing');
    backLedHousing.addComponent('render', { type: 'box', material: matLedHousing });
    backLedHousing.setLocalScale(ROOM_WIDTH_X, 0.35, 0.35);
    backLedHousing.setPosition(0, 33.5, BACK_WALL_Z + 0.175);
    app.root.addChild(backLedHousing);
    
    const backLedStrip = new pc.Entity('BackLedStrip');
    backLedStrip.addComponent('render', { type: 'box', material: matHighWallLed });
    backLedStrip.setLocalScale(ROOM_WIDTH_X, 0.20, 0.20);
    backLedStrip.setPosition(0, 33.5, BACK_WALL_Z + 0.26);
    app.root.addChild(backLedStrip);
    
    // 2. Đèn LED Tường Trước (South Wall LED Strip - Full 140m Width)
    const frontLedHousing = new pc.Entity('FrontLedHousing');
    frontLedHousing.addComponent('render', { type: 'box', material: matLedHousing });
    frontLedHousing.setLocalScale(ROOM_WIDTH_X, 0.35, 0.35);
    frontLedHousing.setPosition(0, 33.5, -BACK_WALL_Z - 0.175);
    app.root.addChild(frontLedHousing);
    
    const frontLedStrip = new pc.Entity('FrontLedStrip');
    frontLedStrip.addComponent('render', { type: 'box', material: matHighWallLed });
    frontLedStrip.setLocalScale(ROOM_WIDTH_X, 0.20, 0.20);
    frontLedStrip.setPosition(0, 33.5, -BACK_WALL_Z - 0.26);
    app.root.addChild(frontLedStrip);
    
    // 3. Đèn LED Tường Trái (West Wall LED Strip - Full 80m Depth)
    const leftLedHousing = new pc.Entity('LeftLedHousing');
    leftLedHousing.addComponent('render', { type: 'box', material: matLedHousing });
    leftLedHousing.setLocalScale(0.35, 0.35, ROOM_DEPTH_Z);
    leftLedHousing.setPosition(-ROOM_WIDTH_X / 2 + 0.175, 33.5, 0);
    app.root.addChild(leftLedHousing);
    
    const leftLedStrip = new pc.Entity('LeftLedStrip');
    leftLedStrip.addComponent('render', { type: 'box', material: matHighWallLed });
    leftLedStrip.setLocalScale(0.20, 0.20, ROOM_DEPTH_Z);
    leftLedStrip.setPosition(-ROOM_WIDTH_X / 2 + 0.26, 33.5, 0);
    app.root.addChild(leftLedStrip);
    
    // 4. Đèn LED Tường Phải (East Wall LED Strip - Full 80m Depth)
    const rightLedHousing = new pc.Entity('RightLedHousing');
    rightLedHousing.addComponent('render', { type: 'box', material: matLedHousing });
    rightLedHousing.setLocalScale(0.35, 0.35, ROOM_DEPTH_Z);
    rightLedHousing.setPosition(ROOM_WIDTH_X / 2 - 0.175, 33.5, 0);
    app.root.addChild(rightLedHousing);
    
    const rightLedStrip = new pc.Entity('RightLedStrip');
    rightLedStrip.addComponent('render', { type: 'box', material: matHighWallLed });
    rightLedStrip.setLocalScale(0.20, 0.20, ROOM_DEPTH_Z);
    rightLedStrip.setPosition(ROOM_WIDTH_X / 2 - 0.26, 33.5, 0);
    app.root.addChild(rightLedStrip);
    
    // -------------------------------------------------------------
    // 6. 🖥️ BÀN LÀM VIỆC ĐÔI SIÊU NGẦU (HAIGO BHS230-2 DOUBLE DESK SETUP)
    // -------------------------------------------------------------
    
    // -------------------------------------------------------------
    // 7. 🎧 DUAL WORKSTATIONS & LOGITECH M185 WIRELESS MICE & CUSTOM KEYBOARDS
    // -------------------------------------------------------------
    
    // HELPER: BUILD CLEAN, MODERN, MINIMALIST ERGONOMIC SWIVEL CHAIR 3D WITH 4-CORNER ROUNDED SEAT CUSHION
    function createHaigoChair(namePrefix: string, posX: number, posZ: number) {
      const localMatLeatherSeat = matChairLeatherSeat.clone() as pc.StandardMaterial;
      (localMatLeatherSeat as any)._isClonedInstance = true;

      const localMatMesh = matChairMesh.clone() as pc.StandardMaterial;
      (localMatMesh as any)._isClonedInstance = true;

      const localMatFrame = matChairFrame.clone() as pc.StandardMaterial;
      (localMatFrame as any)._isClonedInstance = true;

      const chairPivot = new pc.Entity(`${namePrefix}_Pivot`);
      chairPivot.setPosition(posX, 0, posZ);
      chairPivot.setEulerAngles(0, 0, 0);
      app.root.addChild(chairPivot);
    
      // 1. Sleek Leather Seat Cushion with Smooth 4-Corner Rounding ("Bọc tròn 4 góc") - THICKENED SEAT CUSHION (0.52m thick)
      const seatCenter = new pc.Entity(`${namePrefix}_SeatCenter`);
      seatCenter.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      seatCenter.setLocalScale(2.0, 0.52, 1.9);
      seatCenter.setPosition(0, 2.2 + CHAIR_LIFT, 0);
      chairPivot.addChild(seatCenter);
    
      // 4 Rounded Corner Capsules (Front-Left, Front-Right, Back-Left, Back-Right)
      const cornerPos = [
        { name: 'FL', x: -0.95, z: 0.90 },
        { name: 'FR', x: 0.95, z: 0.90 },
        { name: 'BL', x: -0.95, z: -0.90 },
        { name: 'BR', x: 0.95, z: -0.90 }
      ];
    
      cornerPos.forEach(c => {
        const corner = new pc.Entity(`${namePrefix}_SeatCorner_${c.name}`);
        corner.addComponent('render', { type: 'cylinder', material: localMatLeatherSeat });
        corner.setLocalScale(0.70, 0.52, 0.70);
        corner.setPosition(c.x, 2.2 + CHAIR_LIFT, c.z);
        chairPivot.addChild(corner);
      });
    
      // 4 Side Infill Bars between Corners
      const sideF = new pc.Entity(`${namePrefix}_SeatSide_F`);
      sideF.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      sideF.setLocalScale(1.9, 0.52, 0.70);
      sideF.setPosition(0, 2.2 + CHAIR_LIFT, 0.90);
      chairPivot.addChild(sideF);
    
      const sideB = new pc.Entity(`${namePrefix}_SeatSide_B`);
      sideB.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      sideB.setLocalScale(1.9, 0.52, 0.70);
      sideB.setPosition(0, 2.2 + CHAIR_LIFT, -0.90);
      chairPivot.addChild(sideB);
    
      const sideL = new pc.Entity(`${namePrefix}_SeatSide_L`);
      sideL.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      sideL.setLocalScale(0.70, 0.52, 1.8);
      sideL.setPosition(-0.95, 2.2 + CHAIR_LIFT, 0);
      chairPivot.addChild(sideL);
    
      const sideR = new pc.Entity(`${namePrefix}_SeatSide_R`);
      sideR.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      sideR.setLocalScale(0.70, 0.52, 1.8);
      sideR.setPosition(0.95, 2.2 + CHAIR_LIFT, 0);
      chairPivot.addChild(sideR);
    
      // 2. Sleek Minimalist Mesh Backrest Panel with Top Headrest Cushion ("Cho 1 cái nệm ở trên cùng")
      const backPivot = new pc.Entity(`${namePrefix}_BackPivot`);
      backPivot.setPosition(0, 3.7 + CHAIR_LIFT, -1.20);
      backPivot.setLocalEulerAngles(-6, 0, 0);
      chairPivot.addChild(backPivot);
    
      // Mesh Panel
      const backMeshMain = new pc.Entity(`${namePrefix}_BackMeshMain`);
      backMeshMain.addComponent('render', { type: 'box', material: localMatMesh });
      backMeshMain.setLocalScale(2.3, 2.5, 0.12);
      backMeshMain.setPosition(0, -0.1, 0);
      backPivot.addChild(backMeshMain);
    
      // Outer Minimalist Frame Trim
      const backFrameMain = new pc.Entity(`${namePrefix}_BackFrameMain`);
      backFrameMain.addComponent('render', { type: 'box', material: localMatFrame });
      backFrameMain.setLocalScale(2.42, 2.62, 0.10);
      backFrameMain.setPosition(0, -0.1, -0.02);
      backPivot.addChild(backFrameMain);
    
      // 🛋️ TOP LEATHER HEADREST CUSHION ("Nệm dày ra một chút nữa")
      const headrestCenter = new pc.Entity(`${namePrefix}_HeadrestCenter`);
      headrestCenter.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      headrestCenter.setLocalScale(1.6, 0.58, 0.38);
      headrestCenter.setPosition(0, 1.32, 0.11);
      backPivot.addChild(headrestCenter);
    
      const headrestLeft = new pc.Entity(`${namePrefix}_HeadrestLeft`);
      headrestLeft.addComponent('render', { type: 'cylinder', material: localMatLeatherSeat });
      headrestLeft.setLocalScale(0.58, 0.38, 0.58);
      headrestLeft.setPosition(-0.8, 1.32, 0.11);
      headrestLeft.setLocalEulerAngles(90, 0, 0);
      backPivot.addChild(headrestLeft);
    
      const headrestRight = new pc.Entity(`${namePrefix}_HeadrestRight`);
      headrestRight.addComponent('render', { type: 'cylinder', material: localMatLeatherSeat });
      headrestRight.setLocalScale(0.58, 0.38, 0.58);
      headrestRight.setPosition(0.8, 1.32, 0.11);
      headrestRight.setLocalEulerAngles(90, 0, 0);
      backPivot.addChild(headrestRight);
    
      // 3. Simple T-Bar Armrests with Soft Pads
      // Left Armrest
      const armLeftStem = new pc.Entity(`${namePrefix}_ArmLeftStem`);
      armLeftStem.addComponent('render', { type: 'box', material: localMatFrame });
      armLeftStem.setLocalScale(0.12, 0.9, 0.12);
      armLeftStem.setPosition(-1.35, 2.65 + CHAIR_LIFT, 0.0);
      chairPivot.addChild(armLeftStem);
    
      const armLeftPad = new pc.Entity(`${namePrefix}_ArmLeftPad`);
      armLeftPad.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      armLeftPad.setLocalScale(0.35, 0.12, 1.8);
      armLeftPad.setPosition(-1.35, 3.15 + CHAIR_LIFT, 0.0);
      chairPivot.addChild(armLeftPad);
    
      // Right Armrest
      const armRightStem = new pc.Entity(`${namePrefix}_ArmRightStem`);
      armRightStem.addComponent('render', { type: 'box', material: localMatFrame });
      armRightStem.setLocalScale(0.12, 0.9, 0.12);
      armRightStem.setPosition(1.35, 2.65 + CHAIR_LIFT, 0.0);
      chairPivot.addChild(armRightStem);
    
      const armRightPad = new pc.Entity(`${namePrefix}_ArmRightPad`);
      armRightPad.addComponent('render', { type: 'box', material: localMatLeatherSeat });
      armRightPad.setLocalScale(0.35, 0.12, 1.8);
      armRightPad.setPosition(1.35, 3.15 + CHAIR_LIFT, 0.0);
      chairPivot.addChild(armRightPad);
    
      // 4. Polished Silver Chrome Central Cylinder & 5-Star Caster Base (Nổi bật 100% trên nền sàn đen)
      const piston = new pc.Entity(`${namePrefix}_Piston`);
      piston.addComponent('render', { type: 'cylinder', material: matPs5SilverStand });
      const pistonH = CHAIR_LIFT + 2.2; // tall enough to fill from floor to seat
      piston.setLocalScale(0.35, pistonH, 0.35);
      piston.setPosition(0, pistonH / 2, 0);
      chairPivot.addChild(piston);
    
      for (let i = 0; i < 5; i++) {
        const angle = i * (Math.PI * 2 / 5);
        const legLength = 1.35;
        const legX = Math.sin(angle) * (legLength / 2);
        const legZ = Math.cos(angle) * (legLength / 2);
    
        const spoke = new pc.Entity(`${namePrefix}_Spoke_${i}`);
        spoke.addComponent('render', { type: 'box', material: matPs5SilverStand });
        spoke.setLocalScale(0.22, 0.16, legLength);
        spoke.setPosition(legX, 0.28, legZ);
        spoke.setEulerAngles(0, angle * (180 / Math.PI), 0);
        chairPivot.addChild(spoke);
    
        const wheelX = Math.sin(angle) * legLength;
        const wheelZ = Math.cos(angle) * legLength;
    
        const wheel = new pc.Entity(`${namePrefix}_Wheel_${i}`);
        wheel.addComponent('render', { type: 'cylinder', material: matPs5SilverStand });
        wheel.setLocalScale(0.32, 0.26, 0.32);
        wheel.setPosition(wheelX, 0.16, wheelZ);
        chairPivot.addChild(wheel);
      }
    
      return chairPivot;
    }
    
    // ⌨️ HELPER: BUILD HIGH-END 65% CUSTOM TRI-COLOR RGB MECHANICAL KEYBOARD 3D
    function createCustomTriColorMechanicalKeyboard(namePrefix: string, posX: number, posY: number, posZ: number) {
      const kbdPivot = new pc.Entity(`${namePrefix}_Pivot`);
      kbdPivot.setPosition(posX, posY, posZ);
      app.root.addChild(kbdPivot);
    
      // 1. Pure White Anodized Aluminum Outer Frame Case
      const whiteCase = new pc.Entity(`${namePrefix}_WhiteCase`);
      whiteCase.addComponent('render', { type: 'box', material: matKbdWhiteCase });
      whiteCase.setLocalScale(3.4, 0.24, 1.35);
      whiteCase.setPosition(0, 0, 0);
      kbdPivot.addChild(whiteCase);
    
      // 2. Per-Key RGB Underglow Light Strip
      const rgbGlow = new pc.Entity(`${namePrefix}_RgbGlow`);
      rgbGlow.addComponent('render', { type: 'box', material: matKbdRgbGlow });
      rgbGlow.setLocalScale(3.25, 0.04, 1.20);
      rgbGlow.setPosition(0, 0.13, 0);
      kbdPivot.addChild(rgbGlow);
    
      // 3. Multi-Color Keycap Layout Grid (5 Rows x 14 Columns)
      const rows = 5;
      const cols = 14;
      const startX = -1.45;
      const startZ = -0.48;
      const stepX = 0.22;
      const stepZ = 0.24;
    
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Keycap position
          const kX = startX + c * stepX;
          const kZ = startZ + r * stepZ;
    
          // Skip center of bottom row to place Coral Spacebar
          if (r === 4 && c >= 4 && c <= 8) continue;
    
          // Determine Keycap Material matching reference photo 01_ad818cf015b348839b54affef913b675:
          let keyMat = matKbdOffWhiteKey; // Default off-white alphanumeric
    
          // Esc Key (Row 0, Col 0): Coral Orange
          if (r === 0 && c === 0) {
            keyMat = matKbdCoralRedKey;
          }
          // Keys 5-8 (Row 0, Cols 5,6,7,8): Deep Navy Blue
          else if (r === 0 && c >= 5 && c <= 8) {
            keyMat = matKbdNavyBlueKey;
          }
          // Left/Right Modifiers (Tab, CapsLock, Shifts, Backspace, Ctrl, Alt, Fn): Deep Navy Blue
          else if (c === 0 || c === cols - 1 || (r === 4 && c !== 4)) {
            keyMat = matKbdNavyBlueKey;
          }
    
          const keycap = new pc.Entity(`${namePrefix}_Key_${r}_${c}`);
          keycap.addComponent('render', { type: 'box', material: keyMat });
          keycap.setLocalScale(0.18, 0.12, 0.18);
          keycap.setPosition(kX, 0.19, kZ);
          kbdPivot.addChild(keycap);
        }
      }
    
      // 4. Accent Coral Orange Spacebar (Bottom Row Center)
      const spacebar = new pc.Entity(`${namePrefix}_Spacebar`);
      spacebar.addComponent('render', { type: 'box', material: matKbdCoralRedKey });
      spacebar.setLocalScale(1.04, 0.12, 0.18);
      spacebar.setPosition(startX + 6 * stepX, 0.19, startZ + 4 * stepZ);
      kbdPivot.addChild(spacebar);
    
      return kbdPivot;
    }
    
    // 🖱️ HELPER: BUILD LOGITECH M185 WIRELESS COMPACT MOUSE 3D (CLONED 100% FROM images000.jpeg)
    function createLogitechM185Mouse3D(namePrefix: string, posX: number, posY: number, posZ: number) {
      const mousePivot = new pc.Entity(`${namePrefix}_Pivot`);
      mousePivot.setPosition(posX, posY, posZ);
      app.root.addChild(mousePivot);
    
      // 1. Light Slate/Gunmetal Grey Outer Perimeter Frame Ring (Smooth rounded perimeter)
      const outerRingFrame = new pc.Entity(`${namePrefix}_OuterRingFrame`);
      outerRingFrame.addComponent('render', { type: 'sphere', material: matLogiOuterFrameGrey });
      outerRingFrame.setLocalScale(0.56, 0.24, 0.82);
      outerRingFrame.setPosition(0, 0.12, 0);
      mousePivot.addChild(outerRingFrame);
    
      // 2. Dark Charcoal Matte Top Body Shell (Contoured Ergonomic Faceplate)
      const innerDarkShell = new pc.Entity(`${namePrefix}_InnerDarkShell`);
      innerDarkShell.addComponent('render', { type: 'sphere', material: matLogiInnerDarkShell });
      innerDarkShell.setLocalScale(0.48, 0.26, 0.76);
      innerDarkShell.setPosition(0, 0.14, 0);
      mousePivot.addChild(innerDarkShell);
    
      // 3. Recessed Dark Pocket Slot surrounding the Scroll Wheel (Oval Pocket matching images000.jpeg)
      const scrollWheelPocket = new pc.Entity(`${namePrefix}_ScrollWheelPocket`);
      scrollWheelPocket.addComponent('render', { type: 'box', material: matLogiSlotDarkPocket });
      scrollWheelPocket.setLocalScale(0.08, 0.06, 0.20);
      scrollWheelPocket.setPosition(0, 0.245, -0.18);
      mousePivot.addChild(scrollWheelPocket);
    
      // 4. Light Grey Ribbed Scroll Wheel (Correct Horizontal Axle Orientation: setEulerAngles(0, 0, 90))
      const scrollWheel = new pc.Entity(`${namePrefix}_ScrollWheel`);
      scrollWheel.addComponent('render', { type: 'cylinder', material: matLogiScrollWheelGrey });
      scrollWheel.setLocalScale(0.10, 0.05, 0.10);
      scrollWheel.setPosition(0, 0.27, -0.18);
      scrollWheel.setEulerAngles(0, 0, 90); // Horizontal axle along X-axis
      mousePivot.addChild(scrollWheel);
    
      return mousePivot;
    }
    
    // 🎮 HELPER: BUILD HIGH-PRECISION DUALSENSE CONTROLLER 3D MODEL (AUTHENTIC SLEEK PROPORTIONS)
    function createPS5ProConsole3D(namePrefix: string, posX: number, posY: number, posZ: number) {
      const ps5Pivot = new pc.Entity(`${namePrefix}_Pivot`);
      ps5Pivot.setPosition(posX, posY, posZ);
      ps5Pivot.setEulerAngles(0, -25, 0);
      app.root.addChild(ps5Pivot);
    
      // 1. Circular Metallic Silver Stand Base Disc at Bottom
      const standBase = new pc.Entity(`${namePrefix}_StandBase`);
      standBase.addComponent('render', { type: 'cylinder', material: matPs5SilverStand });
      standBase.setLocalScale(1.15, 0.06, 1.15);
      standBase.setPosition(0, 0.03, 0);
      ps5Pivot.addChild(standBase);
    
      // 2. Glossy Dark Charcoal Core Tower (Central body containing disc drive & port array)
      const coreTower = new pc.Entity(`${namePrefix}_CoreTower`);
      coreTower.addComponent('render', { type: 'box', material: matPs5BlackCore });
      coreTower.setLocalScale(0.38, 3.2, 0.95);
      coreTower.setPosition(0, 1.63, 0);
      ps5Pivot.addChild(coreTower);
    
      // 3. PS5 Pro Signature 3 Horizontal Slatted Racing Vent Stripes (Mid-section Vents)
      for (let v = 0; v < 3; v++) {
        const ventStripe = new pc.Entity(`${namePrefix}_VentStripe_${v}`);
        ventStripe.addComponent('render', { type: 'box', material: matPs5BlackCore });
        ventStripe.setLocalScale(0.44, 0.06, 1.02);
        ventStripe.setPosition(0, 1.48 + v * 0.12, 0);
        ps5Pivot.addChild(ventStripe);
      }
    
      // 4. White Curved Outer Plate Shells (Flaring outward elegantly at top and bottom per ps5-pro-image.webp)
      // Left White Plate
      const leftPlateLower = new pc.Entity(`${namePrefix}_LeftPlateLower`);
      leftPlateLower.addComponent('render', { type: 'box', material: matPs5WhitePlate });
      leftPlateLower.setLocalScale(0.08, 1.35, 1.06);
      leftPlateLower.setPosition(-0.22, 0.72, 0);
      leftPlateLower.setEulerAngles(0, 0, -2.5);
      ps5Pivot.addChild(leftPlateLower);
    
      const leftPlateUpper = new pc.Entity(`${namePrefix}_LeftPlateUpper`);
      leftPlateUpper.addComponent('render', { type: 'box', material: matPs5WhitePlate });
      leftPlateUpper.setLocalScale(0.08, 1.35, 1.06);
      leftPlateUpper.setPosition(-0.22, 2.50, 0);
      leftPlateUpper.setEulerAngles(0, 0, 2.5);
      ps5Pivot.addChild(leftPlateUpper);
    
      // Right White Plate
      const rightPlateLower = new pc.Entity(`${namePrefix}_RightPlateLower`);
      rightPlateLower.addComponent('render', { type: 'box', material: matPs5WhitePlate });
      rightPlateLower.setLocalScale(0.08, 1.35, 1.06);
      rightPlateLower.setPosition(0.22, 0.72, 0);
      rightPlateLower.setEulerAngles(0, 0, 2.5);
      ps5Pivot.addChild(rightPlateLower);
    
      const rightPlateUpper = new pc.Entity(`${namePrefix}_RightPlateUpper`);
      rightPlateUpper.addComponent('render', { type: 'box', material: matPs5WhitePlate });
      rightPlateUpper.setLocalScale(0.08, 1.35, 1.06);
      rightPlateUpper.setPosition(0.22, 2.50, 0);
      rightPlateUpper.setEulerAngles(0, 0, -2.5);
      ps5Pivot.addChild(rightPlateUpper);
    
      // 5. Blue LED Emissive Accent Strip along Front Seam
      const frontLedStrip = new pc.Entity(`${namePrefix}_FrontLedStrip`);
      frontLedStrip.addComponent('render', { type: 'box', material: matPs5BlueLedGlow });
      frontLedStrip.setLocalScale(0.04, 3.1, 0.04);
      frontLedStrip.setPosition(0, 1.63, -0.48);
      ps5Pivot.addChild(frontLedStrip);
    
      // 🎮 6. DUALSENSE WIRELESS CONTROLLER 3D MODEL (AUTHENTIC ERGONOMIC DUAL-TONE ACCURACY)
      const ctrlPivot = new pc.Entity(`${namePrefix}_CtrlPivot`);
      ctrlPivot.setPosition(-1.25, 0.18, 0.45);
      ctrlPivot.setEulerAngles(0, 40, 0);
      ps5Pivot.addChild(ctrlPivot);
    
      // ⚪ 1. Left White Handle Grip (Smooth Rounded Capsule)
      const ctrlLeftGrip = new pc.Entity(`${namePrefix}_CtrlLeftGrip`);
      ctrlLeftGrip.addComponent('render', { type: 'sphere', material: matPs5WhitePlate });
      ctrlLeftGrip.setLocalScale(0.24, 0.22, 0.65);
      ctrlLeftGrip.setPosition(-0.36, 0.05, 0.15);
      ctrlLeftGrip.setEulerAngles(22, -18, -12);
      ctrlPivot.addChild(ctrlLeftGrip);
    
      // ⚪ 2. Right White Handle Grip (Smooth Rounded Capsule)
      const ctrlRightGrip = new pc.Entity(`${namePrefix}_CtrlRightGrip`);
      ctrlRightGrip.addComponent('render', { type: 'sphere', material: matPs5WhitePlate });
      ctrlRightGrip.setLocalScale(0.24, 0.22, 0.65);
      ctrlRightGrip.setPosition(0.36, 0.05, 0.15);
      ctrlRightGrip.setEulerAngles(22, 18, 12);
      ctrlPivot.addChild(ctrlRightGrip);
    
      // ⚪ 3. Top White Touchpad Surface (Centered rectangular pad)
      const ctrlTouchpad = new pc.Entity(`${namePrefix}_CtrlTouchpad`);
      ctrlTouchpad.addComponent('render', { type: 'box', material: matPs5WhitePlate });
      ctrlTouchpad.setLocalScale(0.38, 0.04, 0.22);
      ctrlTouchpad.setPosition(0, 0.22, -0.06);
      ctrlPivot.addChild(ctrlTouchpad);
    
      // 🟦 4. Subtle Blue LED Light Bar Slit Accent
      const ctrlLightBar = new pc.Entity(`${namePrefix}_CtrlLightBar`);
      ctrlLightBar.addComponent('render', { type: 'box', material: matPs5BlueLedGlow });
      ctrlLightBar.setLocalScale(0.40, 0.02, 0.24);
      ctrlLightBar.setPosition(0, 0.20, -0.06);
      ctrlPivot.addChild(ctrlLightBar);
    
      // ⬛ 5. Sleek Slim Black Center Accent V-Piece (Compact accent under sticks & D-pad)
      const ctrlBlackAccent = new pc.Entity(`${namePrefix}_CtrlBlackAccent`);
      ctrlBlackAccent.addComponent('render', { type: 'box', material: matPs5BlackCore });
      ctrlBlackAccent.setLocalScale(0.36, 0.06, 0.20);
      ctrlBlackAccent.setPosition(0, 0.14, 0.04);
      ctrlPivot.addChild(ctrlBlackAccent);
    
      // ⬛ 6. Left & Right Compact Black Analog Stick Nubs
      const stickL = new pc.Entity(`${namePrefix}_StickL`);
      stickL.addComponent('render', { type: 'cylinder', material: matPs5BlackCore });
      stickL.setLocalScale(0.10, 0.08, 0.10);
      stickL.setPosition(-0.14, 0.18, 0.10);
      ctrlPivot.addChild(stickL);
    
      const stickR = new pc.Entity(`${namePrefix}_StickR`);
      stickR.addComponent('render', { type: 'cylinder', material: matPs5BlackCore });
      stickR.setLocalScale(0.10, 0.08, 0.10);
      stickR.setPosition(0.14, 0.18, 0.10);
    ctrlPivot.addChild(stickR);
    
      // ⬛ 7. Left D-Pad Cross & Right Action Buttons (Triangle, Circle, Cross, Square)
      const dpad = new pc.Entity(`${namePrefix}_DPad`);
      dpad.addComponent('render', { type: 'box', material: matPs5BlackCore });
      dpad.setLocalScale(0.14, 0.04, 0.14);
      dpad.setPosition(-0.28, 0.20, -0.02);
      ctrlPivot.addChild(dpad);
    
      const actionBtns = new pc.Entity(`${namePrefix}_ActionBtns`);
      actionBtns.addComponent('render', { type: 'box', material: matPs5BlackCore });
      actionBtns.setLocalScale(0.14, 0.04, 0.14);
      actionBtns.setPosition(0.28, 0.20, -0.02);
      ctrlPivot.addChild(actionBtns);
    
      return ps5Pivot;
    }
    const doubleDeskTop = new pc.Entity('DoubleDeskTop');
    doubleDeskTop.addComponent('render', { type: 'box', material: matWalnut });
    doubleDeskTop.setLocalScale(23.0, 0.45, 6.5);
    doubleDeskTop.setPosition(0.0, 3.8 + WS_DY, BACK_WALL_Z + 3.5);
    app.root.addChild(doubleDeskTop);
    
    const LEG_H  = 3.575 + WS_DY; // floor → desk bottom (dynamic with WS_DY)
    const LEG_CY = LEG_H / 2;     // center Y of leg
    
    const centralCabinet = new pc.Entity('CentralCabinet');
    centralCabinet.addComponent('render', { type: 'box', material: matCabinetBody });
    centralCabinet.setLocalScale(4.8, LEG_H, 6.2);
    centralCabinet.setPosition(0.0, LEG_CY, BACK_WALL_Z + 3.5);
    app.root.addChild(centralCabinet);
    
    const NUM_DESK_DRAWERS = 5;
    const drawerPivots: pc.Entity[] = [];
    const drawerFrontRenders: pc.Entity[] = [];
    const drawerStates: number[] = [0, 0, 0, 0, 0];
    const drawerProgress: number[] = [0, 0, 0, 0, 0];
    const DRAWER_BASE_Z = BACK_WALL_Z + 3.5;
    const DRAWER_OPEN_OFFSET_Z = 3.4;
    const drawerBaseYList: number[] = [];
    
    const drawerMarginB = 0.25;
    const drawerMarginT = 0.25;
    const drawerGap = 0.10;
    const drawerUsableH = LEG_H - drawerMarginB - drawerMarginT;
    const dH = (drawerUsableH - (NUM_DESK_DRAWERS - 1) * drawerGap) / NUM_DESK_DRAWERS;
    
    for (let i = 0; i < NUM_DESK_DRAWERS; i++) {
      const dY = drawerMarginB + dH / 2 + i * (dH + drawerGap);
      drawerBaseYList.push(dY);
    
      const drawerPivot = new pc.Entity(`DeskDrawerPivot_${i}`);
      drawerPivot.setPosition(0.0, dY, DRAWER_BASE_Z);
      app.root.addChild(drawerPivot);
      drawerPivots.push(drawerPivot);
    
      // 1. Front Walnut Panel
      const drawerFront = new pc.Entity(`DeskDrawerFront_${i}`);
      drawerFront.addComponent('render', { type: 'box', material: matWalnut });
      drawerFront.setLocalScale(4.4, dH, 0.15);
      drawerFront.setPosition(0.0, 0.0, 3.15);
      drawerPivot.addChild(drawerFront);
      drawerFrontRenders.push(drawerFront);
    
      // 2. Handle
      const drawerHandle = new pc.Entity(`DeskDrawerHandle_${i}`);
      drawerHandle.addComponent('render', { type: 'box', material: matBlackMetal });
      drawerHandle.setLocalScale(1.8, 0.12, 0.2);
      drawerHandle.setPosition(0.0, 0.0, 3.28);
      drawerPivot.addChild(drawerHandle);
    
      // 3. Interior 3D Drawer Box (Revealed when pulled open)
      const drawerBoxBot = new pc.Entity(`DeskDrawerBoxBot_${i}`);
      drawerBoxBot.addComponent('render', { type: 'box', material: matCabinetBody });
      drawerBoxBot.setLocalScale(4.1, 0.08, 5.5);
      drawerBoxBot.setPosition(0.0, -dH / 2 + 0.04, 0.3);
      drawerPivot.addChild(drawerBoxBot);
    
      const drawerBoxL = new pc.Entity(`DeskDrawerBoxL_${i}`);
      drawerBoxL.addComponent('render', { type: 'box', material: matCabinetBody });
      drawerBoxL.setLocalScale(0.1, dH - 0.16, 5.5);
      drawerBoxL.setPosition(-2.0, 0.0, 0.3);
      drawerPivot.addChild(drawerBoxL);
    
      const drawerBoxR = new pc.Entity(`DeskDrawerBoxR_${i}`);
      drawerBoxR.addComponent('render', { type: 'box', material: matCabinetBody });
      drawerBoxR.setLocalScale(0.1, dH - 0.16, 5.5);
      drawerBoxR.setPosition(2.0, 0.0, 0.3);
      drawerPivot.addChild(drawerBoxR);
    
      const drawerBoxB = new pc.Entity(`DeskDrawerBoxB_${i}`);
      drawerBoxB.addComponent('render', { type: 'box', material: matCabinetBody });
      drawerBoxB.setLocalScale(4.1, dH - 0.16, 0.1);
      drawerBoxB.setPosition(0.0, 0.0, -2.45);
      drawerPivot.addChild(drawerBoxB);
    
      // 4. Interior Drawer Items (Gadgets, notebook inside)
      if (i === 4) {
        const notebook = new pc.Entity(`DrawerItem_Notebook_${i}`);
        notebook.addComponent('render', { type: 'box', material: matBlackMetal });
        notebook.setLocalScale(1.4, 0.1, 2.0);
        notebook.setPosition(-0.8, -dH / 2 + 0.15, 0.5);
        drawerPivot.addChild(notebook);
      } else if (i === 2) {
        const techGadget = new pc.Entity(`DrawerItem_Gadget_${i}`);
        techGadget.addComponent('render', { type: 'box', material: matPs5BlackCore });
        techGadget.setLocalScale(1.6, 0.25, 1.2);
        techGadget.setPosition(0.6, -dH / 2 + 0.2, 0.2);
        drawerPivot.addChild(techGadget);
      }
    }
    
    // 🗄️ Raycast Click Detection for Desk Cabinet Drawers (STRICT SINGLE-DRAWER OPEN LOCK)
    function tryClickDrawer(screenX: number, screenY: number): boolean {
      if (EMPTY_SCENE) return false;
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);
    
      const hitPoint = new pc.Vec3();
      for (let i = 0; i < NUM_DESK_DRAWERS; i++) {
        const frontEntity = drawerFrontRenders[i];
        if (frontEntity && frontEntity.render && frontEntity.render.meshInstances.length > 0) {
          const aabb = frontEntity.render.meshInstances[0].aabb;
          if (aabb.intersectsRay(ray, hitPoint)) {
            if (drawerStates[i] === 1) {
              // Bấm vào ngăn đang mở -> Đóng ngăn đó lại
              drawerStates[i] = 0;
            } else {
              // Bấm vào ngăn đang đóng: Chỉ cho phép mở nếu KHÔNG có ngăn nào khác đang mở
              const isAnyOtherOpen = drawerStates.some((st, idx) => idx !== i && st === 1) ||
                                     drawerProgress.some((prog, idx) => idx !== i && prog > 0.05);
              if (!isAnyOtherOpen) {
                drawerStates[i] = 1;
              }
            }
            return true;
          }
        }
      }
      return false;
    }
    
    const leftLegCurve = new pc.Entity('LeftLegCurve');
    leftLegCurve.addComponent('render', { type: 'box', material: matBlackMetal });
    leftLegCurve.setLocalScale(0.5, LEG_H, 6.2);
    leftLegCurve.setPosition(-11.0, LEG_CY, BACK_WALL_Z + 3.5);
    app.root.addChild(leftLegCurve);
    
    const rightLegCurve = new pc.Entity('RightLegCurve');
    rightLegCurve.addComponent('render', { type: 'box', material: matBlackMetal });
    rightLegCurve.setLocalScale(0.5, LEG_H, 6.2);
    rightLegCurve.setPosition(11.0, LEG_CY, BACK_WALL_Z + 3.5);
    app.root.addChild(rightLegCurve);
    
    // WORKSTATION 1 (LEFT X: -6.0)
    const leftMonitorStand = new pc.Entity('LeftMonitorStand');
    leftMonitorStand.addComponent('render', { type: 'box', material: matBlackMetal });
    leftMonitorStand.setLocalScale(0.6, 2.4, 0.35);
    leftMonitorStand.setPosition(-6.0, 5.0 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(leftMonitorStand);
    
    const leftMonitorBody = new pc.Entity('LeftMonitorBody');
    leftMonitorBody.addComponent('render', { type: 'box', material: matBlackMetal });
    leftMonitorBody.setLocalScale(7.2, 3.8, 0.2);
    leftMonitorBody.setPosition(-6.0, 6.2 + WS_DY, BACK_WALL_Z + 2.4);
    app.root.addChild(leftMonitorBody);
    
    const leftMonitorScreen = new pc.Entity('LeftMonitorScreen');
    leftMonitorScreen.addComponent('render', { type: 'box', material: matScreenLeft });
    leftMonitorScreen.setLocalScale(7.12, 3.72, 0.05);
    leftMonitorScreen.setPosition(-6.0, 6.2 + WS_DY, BACK_WALL_Z + 2.51);
    app.root.addChild(leftMonitorScreen);

    const leftDeskMat = new pc.Entity('LeftDeskMat');
    leftDeskMat.addComponent('render', { type: 'box', material: matDeskMat });
    leftDeskMat.setLocalScale(6.5, 0.02, 2.6);
    leftDeskMat.setPosition(-6.0, 4.04 + WS_DY, BACK_WALL_Z + 4.3);
    app.root.addChild(leftDeskMat);
    
    createCustomTriColorMechanicalKeyboard('LeftKbd', -6.6, 4.12 + WS_DY, BACK_WALL_Z + 4.3);
    createLogitechM185Mouse3D('LeftMouse', -3.8, 4.04 + WS_DY, BACK_WALL_Z + 4.3);
    createHaigoChair('Chair1', -6.0, BACK_WALL_Z + 8.2);
    
    // WORKSTATION 2 (RIGHT X: +6.0)
    const rightMonitorStand = new pc.Entity('RightMonitorStand');
    rightMonitorStand.addComponent('render', { type: 'box', material: matBlackMetal });
    rightMonitorStand.setLocalScale(0.6, 2.4, 0.35);
    rightMonitorStand.setPosition(6.0, 5.0 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(rightMonitorStand);
    
    const rightMonitorBody = new pc.Entity('RightMonitorBody');
    rightMonitorBody.addComponent('render', { type: 'box', material: matBlackMetal });
    rightMonitorBody.setLocalScale(7.2, 3.8, 0.2);
    rightMonitorBody.setPosition(6.0, 6.2 + WS_DY, BACK_WALL_Z + 2.4);
    app.root.addChild(rightMonitorBody);
    
    const rightMonitorScreen = new pc.Entity('RightMonitorScreen');
    rightMonitorScreen.addComponent('render', { type: 'box', material: matScreenRight });
    rightMonitorScreen.setLocalScale(7.12, 3.72, 0.05);
    rightMonitorScreen.setPosition(6.0, 6.2 + WS_DY, BACK_WALL_Z + 2.51);
    app.root.addChild(rightMonitorScreen);

    function materialScreenRight() { return matScreenRight; }
    
    const rightDeskMat = new pc.Entity('RightDeskMat');
    rightDeskMat.addComponent('render', { type: 'box', material: matDeskMat });
    rightDeskMat.setLocalScale(6.5, 0.02, 2.6);
    rightDeskMat.setPosition(6.0, 4.04 + WS_DY, BACK_WALL_Z + 4.3);
    app.root.addChild(rightDeskMat);
    
    createCustomTriColorMechanicalKeyboard('RightKbd', 5.4, 4.12 + WS_DY, BACK_WALL_Z + 4.3);
    createLogitechM185Mouse3D('RightMouse', 8.2, 4.04 + WS_DY, BACK_WALL_Z + 4.3);
    createHaigoChair('Chair2', 6.0, BACK_WALL_Z + 8.2);
    
    // 🐠 NEAT COMPACT 3D DESKTOP AQUARIUM (FLUSH FIT IN BETWEEN MONITORS AT X: 0.0M)
    const aquaBase = new pc.Entity('AquaBase');
    aquaBase.addComponent('render', { type: 'box', material: matAquaLedHood });
    aquaBase.setLocalScale(3.4, 0.14, 2.1);
    aquaBase.setPosition(0.0, 4.09 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(aquaBase);
    
    const aquaSand = new pc.Entity('AquaSand');
    aquaSand.addComponent('render', { type: 'box', material: matAquaSand });
    aquaSand.setLocalScale(3.1, 0.14, 1.8);
    aquaSand.setPosition(0.0, 4.23 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(aquaSand);
    
    const aquaWater = new pc.Entity('AquaWater');
    aquaWater.addComponent('render', { type: 'box', material: matAquaWater });
    aquaWater.setLocalScale(3.05, 1.35, 1.75);
    aquaWater.setPosition(0.0, 4.95 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(aquaWater);
    
    const aquaGlass = new pc.Entity('AquaGlass');
    aquaGlass.addComponent('render', { type: 'box', material: matAquariumGlass });
    aquaGlass.setLocalScale(3.2, 1.5, 1.9);
    aquaGlass.setPosition(0.0, 4.95 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(aquaGlass);
    
    const aquaTopHood = new pc.Entity('AquaTopHood');
    aquaTopHood.addComponent('render', { type: 'box', material: matAquaLedHood });
    aquaTopHood.setLocalScale(3.4, 0.18, 2.1);
    aquaTopHood.setPosition(0.0, 5.75 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(aquaTopHood);
    
    const aquaLight = new pc.Entity('AquaLight');
    aquaLight.addComponent('light', {
      type: 'omni',
      color: new pc.Color(0.2, 0.95, 0.9),
      intensity: 4.2,
      range: 10.0
    });
    aquaLight.setPosition(0.0, 5.1 + WS_DY, BACK_WALL_Z + 2.0);
    app.root.addChild(aquaLight);
    
    // 🐠 Raycast Click Detection for Desktop Aquarium Fish Tank
    function tryClickAquarium(screenX: number, screenY: number): boolean {
      if (EMPTY_SCENE) return false;
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);
    
      const targets = [aquaGlass, aquaTopHood, aquaBase, aquaWater];
      const hitPoint = new pc.Vec3();
      for (const ent of targets) {
        if (ent && ent.render && ent.render.meshInstances.length > 0) {
          const aabb = ent.render.meshInstances[0].aabb;
          if (aabb.intersectsRay(ray, hitPoint)) {
            toggleAquariumView();
            return true;
          }
        }
      }
      return false;
    }
    
    
    // 🐟 100% EDGE-TO-EDGE FULL TANK SWIMMING 3D GOLDFISH AI
    const AQUA_MIN_X = -1.45;
    const AQUA_MAX_X = 1.45;
    const AQUA_MIN_Y = 4.35 + WS_DY;
    const AQUA_MAX_Y = 5.55 + WS_DY;
    const AQUA_MIN_Z = BACK_WALL_Z + 1.2;
    const AQUA_MAX_Z = BACK_WALL_Z + 2.8;
    
    interface SimpleFishData {
      pivot: pc.Entity;
      body: pc.Entity;
      tailPivot: pc.Entity;
      finLeft: pc.Entity;
      finRight: pc.Entity;
      pos: pc.Vec3;
      target: pc.Vec3;
      speed: number;
      phase: number;
      currentYaw: number;
      currentPitch: number;
    }
    
    const simpleFishes: SimpleFishData[] = [];
    
    function getRand3DAquaTargetEdge(): pc.Vec3 {
      if (Math.random() < 0.6) {
        const side = Math.floor(Math.random() * 6);
        switch (side) {
          case 0: return new pc.Vec3(AQUA_MIN_X, AQUA_MIN_Y + Math.random() * (AQUA_MAX_Y - AQUA_MIN_Y), AQUA_MIN_Z + Math.random() * (AQUA_MAX_Z - AQUA_MIN_Z));
          case 1: return new pc.Vec3(AQUA_MAX_X, AQUA_MIN_Y + Math.random() * (AQUA_MAX_Y - AQUA_MIN_Y), AQUA_MIN_Z + Math.random() * (AQUA_MAX_Z - AQUA_MIN_Z));
          case 2: return new pc.Vec3(AQUA_MIN_X + Math.random() * (AQUA_MAX_X - AQUA_MIN_X), AQUA_MIN_Y, AQUA_MIN_Z + Math.random() * (AQUA_MAX_Z - AQUA_MIN_Z));
          case 3: return new pc.Vec3(AQUA_MIN_X + Math.random() * (AQUA_MAX_X - AQUA_MIN_X), AQUA_MAX_Y, AQUA_MIN_Z + Math.random() * (AQUA_MAX_Z - AQUA_MIN_Z));
          case 4: return new pc.Vec3(AQUA_MIN_X + Math.random() * (AQUA_MAX_X - AQUA_MIN_X), AQUA_MIN_Y + Math.random() * (AQUA_MAX_Y - AQUA_MIN_Y), AQUA_MIN_Z);
          case 5: return new pc.Vec3(AQUA_MIN_X + Math.random() * (AQUA_MAX_X - AQUA_MIN_X), AQUA_MIN_Y + Math.random() * (AQUA_MAX_Y - AQUA_MIN_Y), AQUA_MAX_Z);
        }
      }
    
      return new pc.Vec3(
        AQUA_MIN_X + Math.random() * (AQUA_MAX_X - AQUA_MIN_X),
        AQUA_MIN_Y + Math.random() * (AQUA_MAX_Y - AQUA_MIN_Y),
        AQUA_MIN_Z + Math.random() * (AQUA_MAX_Z - AQUA_MIN_Z)
      );
    }
    
    function createSmoothGoldfish(
      name: string,
      matBody: pc.StandardMaterial,
      matFin: pc.StandardMaterial,
      scaleFactor: number,
      initPos: pc.Vec3,
      startYaw: number = 0
    ) {
      const fishPivot = new pc.Entity(`${name}_Pivot`);
      fishPivot.setPosition(initPos);
      fishPivot.setEulerAngles(0, startYaw, 0);
      app.root.addChild(fishPivot);
    
      const body = new pc.Entity(`${name}_Body`);
      body.addComponent('render', { type: 'sphere', material: matBody });
      body.setLocalScale(0.70 * scaleFactor, 0.45 * scaleFactor, 0.28 * scaleFactor);
      body.setPosition(0, 0, 0);
      fishPivot.addChild(body);
    
      const snout = new pc.Entity(`${name}_Snout`);
      snout.addComponent('render', { type: 'sphere', material: matBody });
      snout.setLocalScale(0.24 * scaleFactor, 0.22 * scaleFactor, 0.20 * scaleFactor);
      snout.setPosition(0.32 * scaleFactor, -0.02 * scaleFactor, 0);
      fishPivot.addChild(snout);
    
      const eyeLPupil = new pc.Entity(`${name}_EyeLPupil`);
      eyeLPupil.addComponent('render', { type: 'sphere', material: matFishEyePupil });
      eyeLPupil.setLocalScale(0.08 * scaleFactor, 0.08 * scaleFactor, 0.05 * scaleFactor);
      eyeLPupil.setPosition(0.26 * scaleFactor, 0.04 * scaleFactor, 0.125 * scaleFactor);
      fishPivot.addChild(eyeLPupil);
    
      const eyeRPupil = new pc.Entity(`${name}_EyeRPupil`);
      eyeRPupil.addComponent('render', { type: 'sphere', material: matFishEyePupil });
      eyeRPupil.setLocalScale(0.08 * scaleFactor, 0.08 * scaleFactor, 0.05 * scaleFactor);
      eyeRPupil.setPosition(0.26 * scaleFactor, 0.04 * scaleFactor, -0.125 * scaleFactor);
      fishPivot.addChild(eyeRPupil);
    
      const dorsalFinMain = new pc.Entity(`${name}_DorsalFinMain`);
      dorsalFinMain.addComponent('render', { type: 'box', material: matFin });
      dorsalFinMain.setLocalScale(0.32 * scaleFactor, 0.08 * scaleFactor, 0.03 * scaleFactor);
      dorsalFinMain.setPosition(0.04 * scaleFactor, 0.23 * scaleFactor, 0);
      dorsalFinMain.setEulerAngles(-6, 0, 0);
      fishPivot.addChild(dorsalFinMain);
    
      const finLeft = new pc.Entity(`${name}_FinLeft`);
      finLeft.addComponent('render', { type: 'box', material: matFin });
      finLeft.setLocalScale(0.07 * scaleFactor, 0.20 * scaleFactor, 0.03 * scaleFactor);
      finLeft.setPosition(0.08 * scaleFactor, -0.12 * scaleFactor, 0.12 * scaleFactor);
      finLeft.setEulerAngles(35, -20, 45);
      fishPivot.addChild(finLeft);
    
      const finRight = new pc.Entity(`${name}_FinRight`);
      finRight.addComponent('render', { type: 'box', material: matFin });
      finRight.setLocalScale(0.07 * scaleFactor, 0.20 * scaleFactor, 0.03 * scaleFactor);
      finRight.setPosition(0.08 * scaleFactor, -0.12 * scaleFactor, -0.12 * scaleFactor);
      finRight.setEulerAngles(-35, 20, 45);
      fishPivot.addChild(finRight);
    
      const pelvicBottom = new pc.Entity(`${name}_PelvicBottom`);
      pelvicBottom.addComponent('render', { type: 'box', material: matFin });
      pelvicBottom.setLocalScale(0.07 * scaleFactor, 0.18 * scaleFactor, 0.03 * scaleFactor);
      pelvicBottom.setPosition(-0.08 * scaleFactor, -0.20 * scaleFactor, 0);
      pelvicBottom.setEulerAngles(25, 0, 80);
      fishPivot.addChild(pelvicBottom);
    
      const tailPivot = new pc.Entity(`${name}_TailPivot`);
      tailPivot.setPosition(-0.24 * scaleFactor, 0, 0);
      fishPivot.addChild(tailPivot);
    
      const tailBaseJoint = new pc.Entity(`${name}_TailBaseJoint`);
      tailBaseJoint.addComponent('render', { type: 'sphere', material: matFin });
      tailBaseJoint.setLocalScale(0.10 * scaleFactor, 0.10 * scaleFactor, 0.08 * scaleFactor);
      tailBaseJoint.setPosition(-0.03 * scaleFactor, 0, 0);
      tailPivot.addChild(tailBaseJoint);
    
      const tailFan = new pc.Entity(`${name}_TailFan`);
      tailFan.addComponent('render', { type: 'box', material: matFin });
      tailFan.setLocalScale(0.24 * scaleFactor, 0.22 * scaleFactor, 0.03 * scaleFactor);
      tailFan.setPosition(-0.14 * scaleFactor, 0, 0);
      tailPivot.addChild(tailFan);
    
      const tailUpperLobe = new pc.Entity(`${name}_TailUpperLobe`);
      tailUpperLobe.addComponent('render', { type: 'sphere', material: matFin });
      tailUpperLobe.setLocalScale(0.20 * scaleFactor, 0.13 * scaleFactor, 0.025 * scaleFactor);
      tailUpperLobe.setPosition(-0.19 * scaleFactor, 0.07 * scaleFactor, 0);
      tailPivot.addChild(tailUpperLobe);
    
      const tailLowerLobe = new pc.Entity(`${name}_TailLowerLobe`);
      tailLowerLobe.addComponent('render', { type: 'sphere', material: matFin });
      tailLowerLobe.setLocalScale(0.20 * scaleFactor, 0.13 * scaleFactor, 0.025 * scaleFactor);
      tailLowerLobe.setPosition(-0.19 * scaleFactor, -0.07 * scaleFactor, 0);
      tailPivot.addChild(tailLowerLobe);
    
      simpleFishes.push({
        pivot: fishPivot,
        body: body,
        tailPivot: tailPivot,
        finLeft: finLeft,
        finRight: finRight,
        pos: initPos.clone(),
        target: getRand3DAquaTargetEdge(),
        speed: 0.32 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
        currentYaw: startYaw,
        currentPitch: 0
      });
    }
    
    createSmoothGoldfish('YellowFish_1', matGoldenYellowBody, matGoldenYellowFin, 0.55, new pc.Vec3(-0.8, 5.0, BACK_WALL_Z + 1.8), 0);
    createSmoothGoldfish('YellowFish_2', matGoldenYellowBody, matGoldenYellowFin, 0.42, new pc.Vec3(0.8, 4.6, BACK_WALL_Z + 2.4), 180);
    createSmoothGoldfish('RedFish_1', matRedOrangeBody, matRedOrangeFin, 0.38, new pc.Vec3(-1.1, 5.2, BACK_WALL_Z + 2.6), 0);
    createSmoothGoldfish('RedFish_2', matRedOrangeBody, matRedOrangeFin, 0.30, new pc.Vec3(1.1, 4.5, BACK_WALL_Z + 1.6), 180);
    
    // -------------------------------------------------------------
    // 8. 🎛️ HAIGO BHS230-2 PEGBOARD WALL & DISPLAY SHELF (CENTERED AT X: 0.0M)
    // -------------------------------------------------------------
    
    const pegboardWall = new pc.Entity('PegboardWall');
    pegboardWall.addComponent('render', { type: 'box', material: matPegboard });
    pegboardWall.setLocalScale(22.5, 5.8, 0.15);
    pegboardWall.setPosition(0.0, 12.8 + WS_DY, BACK_WALL_Z + 0.3);
    app.root.addChild(pegboardWall);
    
    for (let px = -10; px <= 10; px += 1.5) {
      for (let py = 10.5; py <= 15.0; py += 1.2) {
        const dot = new pc.Entity(`PegDot_${px}_${py}`);
        dot.addComponent('render', { type: 'cylinder', material: matPegDot });
        dot.setLocalScale(0.12, 0.2, 0.12);
        dot.setPosition(px, py + WS_DY, BACK_WALL_Z + 0.4);
        dot.setEulerAngles(90, 0, 0);
        app.root.addChild(dot);
      }
    }
    
    const pegboardShelf = new pc.Entity('PegboardShelf');
    pegboardShelf.addComponent('render', { type: 'box', material: matWalnut });
    pegboardShelf.setLocalScale(7.5, 0.18, 1.8);
    pegboardShelf.setPosition(0.0, 10.4 + WS_DY, BACK_WALL_Z + 1.2);
    app.root.addChild(pegboardShelf);

    // 🎮 PLAYSTATION 5 PRO CONSOLE & DUAL-TONE WHITE/BLACK DUALSENSE CONTROLLER
    createPS5ProConsole3D('ShelfPS5Pro', 0.0, 10.5 + WS_DY, BACK_WALL_Z + 1.2);
    
    // -------------------------------------------------------------
    // 🕰️ 3D REAL-TIME ANALOG WALL CLOCK MOUNTED HIGH ON FRONT WALL (COMPACT 2.6M DIAMETER AT Y: 28.5M)
    // -------------------------------------------------------------
    const clockPivot = new pc.Entity('3DWallClock_Pivot');
    clockPivot.setPosition(0.0, 28.5, ROOM_DEPTH_Z / 2 - 0.25);
    clockPivot.setEulerAngles(0, 180, 0);
    app.root.addChild(clockPivot);
    
    // Outer Ring Frame (Dark Walnut Wood Backing Board & Rim)
    const clockOuterFrame = new pc.Entity('ClockOuterFrame');
    clockOuterFrame.addComponent('render', { type: 'cylinder', material: matWalnut });
    clockOuterFrame.setLocalScale(2.6, 0.05, 2.6);
    clockOuterFrame.setEulerAngles(90, 0, 0);
    clockPivot.addChild(clockOuterFrame);
    
    // Clock Face Dial (Off-White Porcelain)
    const clockFace = new pc.Entity('ClockFace');
    clockFace.addComponent('render', { type: 'cylinder', material: matKbdOffWhiteKey });
    clockFace.setLocalScale(2.35, 0.02, 2.35);
    clockFace.setPosition(0, 0, -0.035);
    clockFace.setEulerAngles(90, 0, 0);
    clockPivot.addChild(clockFace);
    
    // 12 Hour Ticks Markers around the dial
    for (let i = 0; i < 12; i++) {
      const angleRad = (i * 30) * pc.math.DEG_TO_RAD;
      const tickRadius = 1.0;
      const tx = Math.sin(angleRad) * tickRadius;
      const ty = Math.cos(angleRad) * tickRadius;
    
      const tick = new pc.Entity(`ClockTick_${i}`);
      tick.addComponent('render', { type: 'box', material: matBlackMetal });
      const isMajor = (i % 3 === 0);
      tick.setLocalScale(isMajor ? 0.08 : 0.04, isMajor ? 0.25 : 0.14, 0.04);
      tick.setPosition(tx, ty, -0.06);
      tick.setEulerAngles(0, 0, -i * 30);
      clockPivot.addChild(tick);
    }
    
    // Center Cap (Gold Metallic)
    const clockCenterCap = new pc.Entity('ClockCenterCap');
    clockCenterCap.addComponent('render', { type: 'cylinder', material: matDoorHandleGold });
    clockCenterCap.setLocalScale(0.20, 0.06, 0.20);
    clockCenterCap.setPosition(0, 0, -0.07);
    clockCenterCap.setEulerAngles(90, 0, 0);
    clockPivot.addChild(clockCenterCap);
    
    // Hour Hand Pivot
    const hourHandPivot = new pc.Entity('HourHandPivot');
    hourHandPivot.setPosition(0, 0, -0.08);
    clockPivot.addChild(hourHandPivot);
    
    const hourHand = new pc.Entity('HourHandBody');
    hourHand.addComponent('render', { type: 'box', material: matBlackMetal });
    hourHand.setLocalScale(0.08, 0.65, 0.03);
    hourHand.setPosition(0, 0.325, 0);
    hourHandPivot.addChild(hourHand);
    
    // Minute Hand Pivot
    const minuteHandPivot = new pc.Entity('MinuteHandPivot');
    minuteHandPivot.setPosition(0, 0, -0.10);
    clockPivot.addChild(minuteHandPivot);
    
    const minuteHand = new pc.Entity('MinuteHandBody');
    minuteHand.addComponent('render', { type: 'box', material: matBlackMetal });
    minuteHand.setLocalScale(0.06, 0.90, 0.03);
    minuteHand.setPosition(0, 0.45, 0);
    minuteHandPivot.addChild(minuteHand);
    
    // Second Hand Pivot
    const secondHandPivot = new pc.Entity('SecondHandPivot');
    secondHandPivot.setPosition(0, 0, -0.12);
    clockPivot.addChild(secondHandPivot);
    
    const secondHand = new pc.Entity('SecondHandBody');
    secondHand.addComponent('render', { type: 'box', material: matKbdCoralRedKey });
    secondHand.setLocalScale(0.03, 1.00, 0.02);
    secondHand.setPosition(0, 0.50, 0);
    secondHandPivot.addChild(secondHand);
    
    // -------------------------------------------------------------
    // 🖼️ 3D LUXURY FAMILY PICTURE FRAME ON WALL RIGHT OF 21:9 WINDOW (X: +69.65M, Y: 16.0M, Z: +28.5M)
    // -------------------------------------------------------------
    const matFamilyPhoto = new pc.StandardMaterial();
    matFamilyPhoto.useLighting = true;
    matFamilyPhoto.diffuse = new pc.Color(0.92, 0.92, 0.92); // màu trắng ngà khi chưa có ảnh
    matFamilyPhoto.specular = new pc.Color(0.15, 0.15, 0.15);
    matFamilyPhoto.gloss = 0.40;

    // Helper: load ảnh từ blob URL vào texture
    this._loadPhotoTexture = (blobUrl: string) => {
      const img = new Image();
      img.onload = () => {
        const tex = new pc.Texture(app.graphicsDevice, {
          width: img.width, height: img.height,
          format: pc.PIXELFORMAT_RGBA8,
          mipmaps: true,
          minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
          magFilter: pc.FILTER_LINEAR
        });
        tex.setSource(img);
        matFamilyPhoto.diffuseMap = tex;
        matFamilyPhoto.update();
        this._hasPhoto = true;
        URL.revokeObjectURL(blobUrl);
      };
      img.src = blobUrl;
    };

    // Load ảnh đã lưu nếu có (truyền qua profile)
    const savedPhotoPath = (this._profile as any)?.room?.wallPhotoPath ?? null;
    if (savedPhotoPath && (window as any).electron?.readGlb) {
      (window as any).electron.readGlb(savedPhotoPath)
        .then((res: any) => {
          if (res?.success && res.buffer) {
            const bytes = res.buffer instanceof ArrayBuffer
              ? new Uint8Array(res.buffer)
              : new Uint8Array(res.buffer.buffer, res.buffer.byteOffset, res.buffer.byteLength);
            const blob = new Blob([bytes], { type: 'image/jpeg' });
            this._loadPhotoTexture!(URL.createObjectURL(blob));
          }
        }).catch((e: any) => console.warn('[Scene] Load wall photo error:', e));
    }
    
    const familyFramePivot = new pc.Entity('FamilyPictureFrame_Pivot');
    familyFramePivot.setPosition(ROOM_WIDTH_X / 2 - 0.28, 16.0, 28.5);
    familyFramePivot.setEulerAngles(0, -90, 0);
    app.root.addChild(familyFramePivot);
    
    // 1. Dark Walnut Outer Frame Moulding (5.8m W x 8.8m H)
    const familyFrameOuter = new pc.Entity('FamilyFrameOuter');
    familyFrameOuter.addComponent('render', { type: 'box', material: matWalnut });
    familyFrameOuter.setLocalScale(5.8, 8.8, 0.22);
    familyFrameOuter.setPosition(0, 0, 0);
    familyFramePivot.addChild(familyFrameOuter);
    
    // 2. Off-White Linen Bevel Mat Board / Passe-Partout (5.0m W x 8.0m H)
    const familyFrameMat = new pc.Entity('FamilyFrameMat');
    familyFrameMat.addComponent('render', { type: 'box', material: matKbdOffWhiteKey });
    familyFrameMat.setLocalScale(5.0, 8.0, 0.24);
    familyFrameMat.setPosition(0, 0, 0.02);
    familyFramePivot.addChild(familyFrameMat);
    
    // 3. Family Photo Printed Canvas (4.4m W x 7.4m H - Portrait aspect 1:1.68)
    const familyPhotoCanvas = new pc.Entity('FamilyPhotoCanvas');
    familyPhotoCanvas.addComponent('render', { type: 'box', material: matFamilyPhoto });
    familyPhotoCanvas.setLocalScale(4.4, 7.4, 0.26);
    familyPhotoCanvas.setPosition(0, 0, 0.04);
    familyFramePivot.addChild(familyPhotoCanvas);
    
    // 4. Glass Shield Protection Pane
    const familyFrameGlass = new pc.Entity('FamilyFrameGlass');
    familyFrameGlass.addComponent('render', { type: 'box', material: matAquariumGlass });
    familyFrameGlass.setLocalScale(4.5, 7.5, 0.05);
    familyFrameGlass.setPosition(0, 0, 0.18);
    familyFramePivot.addChild(familyFrameGlass);
    
    // 5. Warm Golden LED Picture Backlight Spot/Omni Light
    const familyFrameBacklight = new pc.Entity('FamilyFrameBacklight');
    familyFrameBacklight.addComponent('light', {
      type: 'omni',
      color: new pc.Color(1.0, 0.85, 0.55),
      intensity: 2.8,
      range: 14.0
    });
    familyFrameBacklight.setPosition(ROOM_WIDTH_X / 2 - 1.2, 16.0, 28.5);
    app.root.addChild(familyFrameBacklight);
    
    // -------------------------------------------------------------
    // 🧹 EMPTY SCENE: tắt mọi entity dựng sẵn (giữ camera + đèn mặt trời)
    // -------------------------------------------------------------
    if (EMPTY_SCENE) {
      const keepNames = new Set(['CameraParent', 'SunLight']);
      for (const child of [...app.root.children] as pc.Entity[]) {
        if (keepNames.has(child.name)) continue;
        child.tags.add('builtin_scene');
        child.enabled = false;
      }
      sunLight.enabled = false; // mặt trời tự đổi theo giờ thực, không hợp với studio
      buildStudioLights();
      buildStudioGrid();
    }

    // -------------------------------------------------------------
    // STUDIO TRẮNG (mặc định khi scene trống) — KHÔNG còn bàn trưng bày.
    // Nền trắng trơn + 2 đèn studio: đèn nắng chính có cookie bóng lá,
    // đèn phụ mềm phía trước. Người dùng tự thêm đồ vật của họ.
    // -------------------------------------------------------------
    function buildStudioLights() {
      const WALL_Z = -16;

      app.scene.ambientLight = new pc.Color(0.82, 0.82, 0.82);
      camera.camera!.clearColor = new pc.Color(1, 1, 1);

      const root = new pc.Entity('Showroom_Lights');
      app.root.addChild(root);

      const canvasTex = (cv: HTMLCanvasElement) => {
        const t = new pc.Texture(app.graphicsDevice, { width: cv.width, height: cv.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
        t.setSource(cv);
        return t;
      };

      // --- Bóng lá in lên tường: cookie texture cho đèn spot ---
      const leafCv = document.createElement('canvas');
      leafCv.width = leafCv.height = 512;
      const lctx = leafCv.getContext('2d')!;
      lctx.fillStyle = '#fff';
      lctx.fillRect(0, 0, 512, 512);
      lctx.filter = 'blur(7px)';
      lctx.fillStyle = 'rgba(70,70,70,0.75)';
      const branch = (x0: number, y0: number, ang: number, len: number) => {
        for (let s = 0; s < len; s += 22) {
          const x = x0 + Math.cos(ang) * s, y = y0 + Math.sin(ang) * s;
          for (const side of [-1, 1]) {
            lctx.save();
            lctx.translate(x, y);
            lctx.rotate(ang + side * (0.7 + Math.random() * 0.4));
            lctx.beginPath();
            lctx.ellipse(18, 0, 18 + Math.random() * 8, 7, 0, 0, Math.PI * 2);
            lctx.fill();
            lctx.restore();
          }
        }
      };
      branch(-20, 40, 0.55, 300);
      branch(60, -20, 0.95, 280);
      branch(330, -10, 1.9, 260);
      branch(520, 160, 2.6, 240);
      const leafTex = canvasTex(leafCv);
      leafTex.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
      leafTex.addressV = pc.ADDRESS_CLAMP_TO_EDGE;

      // Đèn nắng chính: chiếu chéo từ trên-trái-trước, có bóng lá
      const sun = new pc.Entity('Showroom_SunSpot');
      sun.addComponent('light', {
        type: 'spot', color: new pc.Color(1.0, 0.96, 0.9), intensity: 1.6, range: 140,
        innerConeAngle: 30, outerConeAngle: 48,
        castShadows: true, shadowResolution: 2048, shadowBias: 0.05, normalOffsetBias: 0.05,
        cookie: leafTex, cookieIntensity: 0.85
      });
      sun.setLocalPosition(-30, 50, 40);
      root.addChild(sun);
      sun.lookAt(4, 10, WALL_Z);
      sun.rotateLocal(90, 0, 0); // spot chiếu theo trục -Y, lookAt hướng trục -Z

      // Đèn phụ mềm phía trước
      const fill = new pc.Entity('Showroom_Fill');
      fill.addComponent('light', { type: 'omni', color: new pc.Color(1.0, 0.98, 0.95), intensity: 0.45, range: 70, castShadows: false });
      fill.setLocalPosition(8, 14, 28);
      root.addChild(fill);

      self._applyCameraPreset?.('default');
      currentPivot.copy(targetPivot);
      orbitYaw = targetYaw; orbitPitch = targetPitch; orbitDistance = targetDistance;

    }

    // -------------------------------------------------------------
    // LUOI CO VUA THEO TRUC (kieu viewport Blender): o nho 1m mo, o lon 10m dam,
    // trung tam la 2 truc mau X (do) / Z (xanh duong) ve tren mat phang Y=0.
    // Grid nam tren layer rieng 'GridLayer' va mesh instance co pick=false
    // nen khong bi bat raycast khi click / keo tha do vat.
    // -------------------------------------------------------------
    function buildStudioGrid() {
      const GRID_HALF = 80; // phu 160x160m quanh goc toa do
      const gridLayer = new pc.Layer({ name: 'GridLayer', enabled: true });
      app.scene.layers.push(gridLayer);
      // cho camera hien thi them layer grid
      camera.camera!.layers = camera.camera!.layers.concat([gridLayer.id]);

      // CHU Y: pc.createMesh mac dinh tao PRIMITIVE_TRIANGLES. Day chi 2 dinh moi doan
      // se bien GPU doc dia chi rac va sinh tam giac khong lo phu man hinh.
      // Giai phap: no moi doan ke thanh 1 dai chu nhat mong (2 tam giac, 4 dinh).
      const makeLines = (segments: number[], col: pc.Color, opacity: number, name: string, width = 0.04) => {
        const mat = new pc.StandardMaterial();
        mat.diffuse = new pc.Color(0, 0, 0);
        mat.emissive = col.clone();
        mat.useLighting = false;
        mat.opacity = opacity;
        mat.blendType = pc.BLEND_NORMAL;
        mat.depthWrite = false;
        mat.update();
        const positions: number[] = [];
        const indices: number[] = [];
        const segCount = Math.floor(segments.length / 6);
        for (let s = 0; s < segCount; s++) {
          const x1 = segments[s * 6],     y1 = segments[s * 6 + 1], z1 = segments[s * 6 + 2];
          const x2 = segments[s * 6 + 3], y2 = segments[s * 6 + 4], z2 = segments[s * 6 + 5];
          const dx = x2 - x1, dz = z2 - z1;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          const nx = (-dz / len) * width, nz = (dx / len) * width;
          const b = positions.length / 3;
          positions.push(
            x1 - nx, y1, z1 - nz,
            x1 + nx, y1, z1 + nz,
            x2 - nx, y2, z2 - nz,
            x2 + nx, y2, z2 + nz
          );
          indices.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
        }
        const mesh = pc.createMesh(app.graphicsDevice, positions, { indices });
        const mi = new pc.MeshInstance(mesh, mat);
        mi.pick = false;
        mi.cull = false;
        // nhich nhe len Y=0.01 de tranh z-fighting voi mat phang Y=0
        mi.node = new pc.GraphNode();
        mi.node.setLocalPosition(0, 0.01, 0);
        gridLayer.addMeshInstances([mi]);
      };

      const minor: number[] = [];
      const major: number[] = [];
      for (let i = -GRID_HALF; i <= GRID_HALF; i++) {
        if (i === 0) continue; // truc 0 ve rieng
        const arr = (i % 10 === 0) ? major : minor;
        arr.push(-GRID_HALF, 0, i, GRID_HALF, 0, i);
        arr.push(i, 0, -GRID_HALF, i, 0, GRID_HALF);
      }
      makeLines(minor, new pc.Color(0.75, 0.75, 0.75), 0.16, 'Studio_Grid_Minor');
      makeLines(major, new pc.Color(0.6, 0.6, 0.6), 0.45, 'Studio_Grid_Major');
      makeLines([-GRID_HALF, 0, 0, GRID_HALF, 0, 0], new pc.Color(0.85, 0.15, 0.15), 0.9, 'Studio_Grid_AxisX');
      makeLines([0, 0, -GRID_HALF, 0, 0, GRID_HALF], new pc.Color(0.15, 0.3, 0.9), 0.9, 'Studio_Grid_AxisZ');
    }

    // 👤 3D HUMAN CHARACTER (YÊN) — REBUILT WITH CORRECT PROPORTIONS
    // Tỉ lệ theo ảnh: đầu to, vai rộng, chân dài — CS=4.0 → ~14 units cao
    // -------------------------------------------------------------
    const charData = furniture306Data.character;
    const CS = 4.0; // scale: room door 16 units = 2.1m real → CS=4.0 gives ~14 unit person
    
    // Materials
    const matSkin        = createMat(new pc.Color(0.82, 0.61, 0.46), new pc.Color(0.22, 0.16, 0.12));
    const matTankTop     = createMat(new pc.Color(0.96, 0.96, 0.97), new pc.Color(0.32, 0.32, 0.32));
    const matKhakiShorts = createMat(new pc.Color(0.74, 0.67, 0.52), new pc.Color(0.18, 0.15, 0.10));
    const matGlassFrame  = createMat(new pc.Color(0.05, 0.05, 0.07), new pc.Color(0.55, 0.55, 0.55));
    const matHair        = createMat(new pc.Color(0.15, 0.12, 0.10), new pc.Color(0.06, 0.06, 0.06));
    const matSandal      = createMat(new pc.Color(0.28, 0.18, 0.12), new pc.Color(0.12, 0.08, 0.06));
    const matSandalStrap = createMat(new pc.Color(0.38, 0.26, 0.18), new pc.Color(0.12, 0.08, 0.06));
    
    // Root pivot at floor
    const charPivot = new pc.Entity('Char_Yen_Root');
    charPivot.setPosition(charData.position[0], 0.0, charData.position[2]);
    app.root.addChild(charPivot);
    
    const charBodyRoot = new pc.Entity('Char_BodyRoot');
    charBodyRoot.setPosition(0, 0, 0);
    charPivot.addChild(charBodyRoot);
    
    // 🎭 ANIMATED CHARACTER — Meshy AI "Yen AI" (Casual Summer Portrait, Biped)
    // character_walk.glb   = Walking animation (eager load, mesh + skin + anim)
    // public/anims/ya_*.glb = 19 more animations (lazy load on demand)
    // Scale: charScale = 13.5/1.70 ≈ 7.94 (model is 1.70m tall in glTF meters)
    // footOffset = 0 (feet already at Y=0 in Meshy export)
    // ─────────────────────────────────────────────────────────────────────────────
    
    let glbCharEntity: pc.Entity | null = null;
    let charAnimReady  = false;
    let animComp: any  = null;
    
    const loadedAnims = new Set<string>();
    interface BoardHitArea { key: string; u0: number; v0: number; u1: number; v1: number; }
    const boardHitAreas: BoardHitArea[] = [];
    let _boardTex: pc.Texture | null = null;
    let _boardCanvas: HTMLCanvasElement | null = null;
    let activeWalkAnim = 'Walk';
    let activeIdleAnim = 'Boxing';
    let manualAnimOverride: string | null = null;
    
    // ── Animation catalog (Meshy AI Yen AI biped) ─────────────────────────────────
    const ANIM_CATALOG: { key: string; url: string; label: string; emoji: string; category: string }[] = [
      // Move
      { key: 'Walk',          url: '/character_walk.glb',                label: 'Walk',           emoji: '🚶', category: 'Move'   },
      { key: 'Running',       url: '/anims/ya_Running.glb',              label: 'Run',            emoji: '🏃', category: 'Move'   },
      { key: 'ConfidentStrut',url: '/anims/ya_Confident_Strut.glb',      label: 'Strut',          emoji: '👠', category: 'Move'   },
      { key: 'ExcitedWalkF',  url: '/anims/ya_Excited_Walk_F.glb',       label: 'Excited Walk F', emoji: '💃', category: 'Move'   },
      { key: 'ExcitedWalkM',  url: '/anims/ya_Excited_Walk_M.glb',       label: 'Excited Walk M', emoji: '🕺', category: 'Move'   },
      // Combat
      { key: 'Boxing',        url: '/anims/ya_Boxing_Practice.glb',      label: 'Boxing',         emoji: '🥊', category: 'Combat' },
      { key: 'BoxingWarmup',  url: '/anims/ya_Boxing_Warmup.glb',        label: 'Warmup',         emoji: '🔥', category: 'Combat' },
      { key: 'Counterstrike', url: '/anims/ya_Counterstrike.glb',        label: 'Counterstrike',  emoji: '🛡️', category: 'Combat' },
      { key: 'StandDodge',    url: '/anims/ya_Stand_Dodge_3.glb',        label: 'Stand Dodge',    emoji: '💢', category: 'Combat' },
      { key: 'PunchCombo',    url: '/anims/ya_Punch_Combo_2.glb',        label: 'Punch Combo',    emoji: '👊', category: 'Combat' },
      { key: 'HighKick',      url: '/anims/ya_Step_in_High_Kick.glb',    label: 'High Kick',      emoji: '🦵', category: 'Combat' },
      { key: 'FistKick',      url: '/anims/ya_Flying_Fist_Kick.glb',     label: 'Flying Fist Kick',emoji: '💥', category: 'Combat' },
      { key: 'Backflip',      url: '/anims/ya_Backflip.glb',             label: 'Backflip',       emoji: '🤸', category: 'Combat' },
      // Emote
      { key: 'DontDare',      url: '/anims/ya_Dont_You_Dare.glb',        label: "Don't Dare",     emoji: '✋', category: 'Emote'  },
      { key: 'SpinJump',      url: '/anims/ya_360_Power_Spin_Jump.glb',  label: '360 Spin Jump',  emoji: '🌀', category: 'Emote'  },
      // Dance
      { key: 'AllNight',      url: '/anims/ya_All_Night_Dance.glb',      label: 'All Night',      emoji: '🌙', category: 'Dance'  },
      { key: 'ArmShuffle',    url: '/anims/ya_Arm_Circle_Shuffle.glb',   label: 'Arm Shuffle',    emoji: '🕺', category: 'Dance'  },
      { key: 'CardioDance',   url: '/anims/ya_Cardio_Dance.glb',         label: 'Cardio Dance',   emoji: '❤️', category: 'Dance'  },
      { key: 'FunnyDancing',  url: '/anims/ya_FunnyDancing_01.glb',      label: 'Funny Dance',    emoji: '🤪', category: 'Dance'  },
      { key: 'GangnamGroove', url: '/anims/ya_Gangnam_Groove.glb',       label: 'Gangnam Groove', emoji: '😎', category: 'Dance'  },
    ];
    
    // Movement speed (world-units/s) matching each animation clip's visual stride.
    // These are tuned so feet don't visually slide against the floor.
    const ANIM_MOVE_SPEED: Record<string, number> = {
      'Walk':     11.0,
      'Running':  24.0,
    };
    
    let activeAnimIsMovement = false;
    let activeAnimSpeed = 11.0;

    function getEffectiveWalkSpeed(): number {
      if (activeAnimIsMovement) {
        return activeAnimSpeed > 0 ? activeAnimSpeed : charWalkSpeed;
      }
      return 0.0;
    }
    
    function ensureAnimComponent(): any {
      if (!glbCharEntity) return null;
      if (animComp) return animComp;
      if (glbCharEntity.anim) { animComp = glbCharEntity.anim; return animComp; }
      if ((glbCharEntity as any).animation) { animComp = (glbCharEntity as any).animation; return animComp; }
      try {
        animComp = glbCharEntity.addComponent('anim', { activate: true });
        return animComp;
      } catch (e) {
        console.warn('[Scene] Could not add anim component:', e);
        return null;
      }
    }

    function playAnimTrack(key: string, animResource: any) {
      if (!glbCharEntity) return;
      const targetAnimComp = ensureAnimComponent();
      manualAnimOverride = key;
      drawAnimStatusBoard(key);

      if (!targetAnimComp) return;

      try {
        if (targetAnimComp.assignAnimation) {
          targetAnimComp.assignAnimation(key, animResource);
          if (targetAnimComp.baseLayer) {
            targetAnimComp.baseLayer.transition(key, 0.2);
            targetAnimComp.playing = true;
          }
        } else if (targetAnimComp.addClip) {
          targetAnimComp.addClip(animResource, key);
          targetAnimComp.play(key, 0.2);
        }
        console.log('▶ Playing animation track on character:', key);
      } catch (e) {
        console.error('Error playing animation track:', key, e);
      }
    }

    // ── Lazy-load an animation by key (built-in or custom user GLB) ─────────────
    function loadAndPlayAnim(key: string, customGlbPath?: string, isMovement?: boolean, speed?: number) {
      if (!glbCharEntity) return;

      activeAnimIsMovement = typeof isMovement === 'boolean' ? isMovement : /walk|run|move|chay|di/i.test(key);
      activeAnimSpeed = typeof speed === 'number' ? speed : (activeAnimIsMovement ? 11.0 : 0.0);

      manualAnimOverride = key;
      drawAnimStatusBoard(key);

      if (loadedAnims.has(key)) {
        playAnim(key);
        return;
      }

      // 1. Check built-in catalog
      const entry = ANIM_CATALOG.find(a => a.key.toLowerCase() === key.toLowerCase());
      if (entry) {
        app.assets.loadFromUrl(entry.url, 'container', (err: any, asset?: pc.Asset) => {
          if (err || !asset?.resource) { console.warn('Anim load failed:', key, err); return; }
          const anims: any[] = (asset.resource as any).animations ?? [];
          if (anims.length > 0) {
            loadedAnims.add(key);
            playAnimTrack(key, anims[0].resource);
          }
        });
        return;
      }

      // 2. Custom user uploaded GLB animation
      let targetPath = customGlbPath;
      if (!targetPath && (_svc as any)._profile?.username && (window as any).electron?.listAnimations) {
        const username = (_svc as any)._profile.username;
        (window as any).electron.listAnimations(username).then((res: any) => {
          if (res?.success && Array.isArray(res.data)) {
            const found = res.data.find((a: any) => a.name === key || a.id === key);
            if (found && found.glbPath) {
              loadAndPlayAnim(found.name, found.glbPath, found.isMovement, found.speed);
            }
          }
        }).catch((e: any) => console.warn('[Scene] Error listing animations:', e));
        return;
      }

      if (targetPath && (window as any).electron?.readGlb) {
        (window as any).electron.readGlb(targetPath).then((res: any) => {
          if (res?.success && res.buffer) {
            const bytes = res.buffer instanceof ArrayBuffer
              ? new Uint8Array(res.buffer)
              : new Uint8Array(res.buffer.buffer, res.buffer.byteOffset, res.buffer.byteLength);
            const blob = new Blob([bytes], { type: 'model/gltf-binary' });
            const blobUrl = URL.createObjectURL(blob);

            app.assets.loadFromUrl(blobUrl, 'container', (err: any, asset?: pc.Asset) => {
              URL.revokeObjectURL(blobUrl);
              if (err || !asset?.resource) {
                console.warn('[Scene] Custom GLB anim load failed:', key, targetPath, err);
                return;
              }
              const anims: any[] = (asset.resource as any).animations ?? [];
              if (anims.length > 0) {
                loadedAnims.add(key);
                console.log('✅ Loaded custom GLB anim track:', key);
                playAnimTrack(key, anims[0].resource);
              } else {
                console.warn('[Scene] No animation tracks inside custom GLB:', targetPath);
              }
            });
          }
        }).catch((e: any) => console.error('[Scene] Error reading custom GLB anim file:', e));
      }
    }
    
    function playAnim(key: string) {
      if (!charAnimReady || !glbCharEntity) return;
      const targetAnimComp = ensureAnimComponent();
      if (targetAnimComp?.baseLayer) {
        (targetAnimComp.baseLayer as any)?.transition(key, 0.25);
      } else if (targetAnimComp?.play) {
        targetAnimComp.play(key, 0.25);
      }
      drawAnimStatusBoard(key);
    }

    this._loadAndPlayAnim = loadAndPlayAnim;
    
    // ── 3D LED Status Board (minimal wall display) ───────────────────────
    // Shows current animation. Clicking opens the full overlay control panel.
    
    const BOARD_TEX_W = 512;
    const BOARD_TEX_H = 256; // shorter — just a status strip
    const BOARD_CX = 69.5, BOARD_CY = 13, BOARD_CZ = -27;
    const BOARD_W_WU = 16;
    const BOARD_H_WU = 10;  // compact status display
    
    const BOARD_CATS = [
      { label: 'MOVE',   color: '#00ff99', keys: ANIM_CATALOG.filter(a => a.category === 'Move')   },
      { label: 'COMBAT', color: '#ff4466', keys: ANIM_CATALOG.filter(a => a.category === 'Combat') },
      { label: 'EMOTE',  color: '#ffcc00', keys: ANIM_CATALOG.filter(a => a.category === 'Emote')  },
      { label: 'DANCE',  color: '#cc66ff', keys: ANIM_CATALOG.filter(a => a.category === 'Dance')  },
    ];
    
    // Draws a minimal status display on the 3D wall board
    function drawAnimStatusBoard(activeKey: string | null) {
      if (!_boardCanvas || !_boardTex) return;
      const ctx = _boardCanvas.getContext('2d')!;
      const W = BOARD_TEX_W, H = BOARD_TEX_H;
    
      ctx.fillStyle = '#020308';
      ctx.fillRect(0, 0, W, H);
    
      // Scanlines
      for (let y = 0; y < H; y += 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, y, W, 1);
      }
    
      // Blue glow border
      ctx.shadowColor = '#0088ff'; ctx.shadowBlur = 12;
      ctx.strokeStyle = '#0066cc'; ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.shadowBlur = 0;
    
      // Header
      ctx.fillStyle = '#00ddff';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#00ccff'; ctx.shadowBlur = 8;
      ctx.fillText('◈ ANIMATION CONTROL ◈', W / 2, 30);
      ctx.shadowBlur = 0;
    
      ctx.fillStyle = 'rgba(0,100,200,0.4)';
      ctx.fillRect(16, 38, W - 32, 1);
    
      // Current animation
      const entry = activeKey ? ANIM_CATALOG.find(a => a.key === activeKey) : null;
      const cat = entry ? BOARD_CATS.find(c => c.keys.some(k => k.key === activeKey)) : null;
      const color = cat?.color ?? '#00ff99';
    
      ctx.fillStyle = '#334455';
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NOW PLAYING', W / 2, 58);
    
      ctx.fillStyle = color;
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.shadowColor = color; ctx.shadowBlur = 14;
      ctx.textAlign = 'center';
      ctx.fillText(entry ? `${entry.emoji}  ${entry.label}` : '— idle —', W / 2, 90);
      ctx.shadowBlur = 0;
    
      // Blinking click hint
      ctx.fillStyle = 'rgba(0,150,255,0.55)';
      ctx.fillRect(16, H - 36, W - 32, 1);
      ctx.fillStyle = '#4488aa';
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[ TAP TO OPEN PANEL ]', W / 2, H - 14);
    
      _boardTex.setSource(_boardCanvas);
    }
    
    // ── HTML Overlay Panel (shown/hidden on board click) ──────────────────────
    let _animOverlay: HTMLElement | null = null;
    let _overlayBtnMap: Record<string, HTMLButtonElement> = {};
    
    function buildAnimOverlay() {
      const style = document.createElement('style');
      style.textContent = `
        #anim-overlay-backdrop {
          position: fixed; inset: 0; z-index: 9000;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          opacity: 0; pointer-events: none;
          transition: opacity 0.25s ease;
        }
        #anim-overlay-backdrop.open {
          opacity: 1; pointer-events: all;
        }
        #anim-overlay {
          width: 340px;
          max-height: calc(100vh - 80px);
          overflow-y: auto;
          margin: 40px 0;
          background: #030510;
          border: 2px solid #0055aa;
          border-radius: 4px;
          box-shadow: 0 0 40px rgba(0,100,255,0.4), 0 0 80px rgba(0,50,150,0.2);
          font-family: "Courier New", monospace;
          color: #fff;
          overflow: hidden;
          transform: scale(0.92); transition: transform 0.25s ease;
        }
        #anim-overlay-backdrop.open #anim-overlay { transform: scale(1); }
        #anim-overlay-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px;
          background: linear-gradient(90deg, #001133, #002266, #001133);
          border-bottom: 1px solid #0044aa;
        }
        #anim-overlay-title {
          color: #00ddff; font-size: 14px; font-weight: bold; letter-spacing: 2px;
          text-shadow: 0 0 10px #00aaff;
        }
        #anim-overlay-close {
          background: none; border: 1px solid #0055aa; color: #0088cc;
          cursor: pointer; font-family: "Courier New", monospace;
          font-size: 16px; width: 28px; height: 28px; border-radius: 3px;
          transition: all 0.15s;
        }
        #anim-overlay-close:hover { background: #0044aa; color: #fff; }
        #anim-overlay-body { padding: 12px 14px 14px; }
        .ov-cat-label {
          font-size: 10px; letter-spacing: 2px; font-weight: bold;
          margin: 10px 0 5px 2px; display: flex; align-items: center; gap: 6px;
        }
        .ov-cat-label::after {
          content:''; flex:1; height:1px; background:currentColor; opacity:0.25;
        }
        .ov-cat-label:first-child { margin-top: 2px; }
        .ov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .ov-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px; border-radius: 3px; border: 1px solid #0e1428;
          cursor: pointer; font-size: 12px; font-family: "Courier New", monospace;
          background: #07091a; color: #556677;
          transition: all 0.15s ease;
        }
        .ov-btn:hover { background: #0a1030; color: #99aacc; border-color: #2244aa; }
        .ov-btn.ov-active { border-color: var(--cat-color); color: var(--cat-color);
          background: color-mix(in srgb, var(--cat-color) 12%, #07091a);
          box-shadow: 0 0 8px color-mix(in srgb, var(--cat-color) 30%, transparent);
        }
      `;
      document.head.appendChild(style);
    
      const backdrop = document.createElement('div');
      backdrop.id = 'anim-overlay-backdrop';
      backdrop.innerHTML = `
        <div id="anim-overlay">
          <div id="anim-overlay-header">
            <span id="anim-overlay-title">◈  ANIMATIONS  ◈</span>
            <button id="anim-overlay-close">✕</button>
          </div>
          <div id="anim-overlay-body"></div>
        </div>
      `;
    
      const body = backdrop.querySelector('#anim-overlay-body') as HTMLElement;
      BOARD_CATS.forEach(cat => {
        const label = document.createElement('div');
        label.className = 'ov-cat-label';
        label.style.color = cat.color;
        label.textContent = '▸ ' + cat.label;
        body.appendChild(label);
    
        const grid = document.createElement('div');
        grid.className = 'ov-grid';
        cat.keys.forEach(entry => {
          const btn = document.createElement('button');
          btn.className = 'ov-btn';
          btn.style.setProperty('--cat-color', cat.color);
          btn.innerHTML = `<span>${entry.emoji}</span><span>${entry.label}</span>`;
          btn.onclick = () => { loadAndPlayAnim(entry.key); toggleAnimOverlay(false); };
          if (entry.key === 'Walk') btn.classList.add('ov-active');
          _overlayBtnMap[entry.key] = btn;
          grid.appendChild(btn);
        });
        body.appendChild(grid);
      });
    
      // Close on backdrop click or X button
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) toggleAnimOverlay(false);
      });
      backdrop.querySelector('#anim-overlay-close')!.addEventListener('click', () => toggleAnimOverlay(false));
    
      document.body.appendChild(backdrop);
      _animOverlay = backdrop;
    }
    
    function toggleAnimOverlay(force?: boolean) {
      if (!_animOverlay) return;
      const open = force !== undefined ? force : !_animOverlay.classList.contains('open');
      _animOverlay.classList.toggle('open', open);
    }
    
    function updateAnimOverlayActive(key: string) {
      Object.entries(_overlayBtnMap).forEach(([k, b]) => {
        b.classList.toggle('ov-active', k === key);
      });
    }
    
    function buildAnimBoard3D() {
      // Canvas + texture for internal status tracking (no 3D mesh on wall)
      _boardCanvas = document.createElement('canvas');
      _boardCanvas.width  = BOARD_TEX_W;
      _boardCanvas.height = BOARD_TEX_H;
      _boardTex = new pc.Texture(app.graphicsDevice, {
        name: 'animBoardTex', format: pc.PIXELFORMAT_RGBA8,
        minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE, mipmaps: false
      });
      drawAnimStatusBoard('Walk');
      buildAnimOverlay();
    }
    
    // Auto-switch only when no manual override is active
    function switchCharAnim(state: string) {
      if (!glbCharEntity?.anim || !charAnimReady) return;
      if (manualAnimOverride !== null) return;
      glbCharEntity.anim.speed = 1.0;
      (glbCharEntity.anim.baseLayer as any)?.transition(state, 0.5);
    }
    
    // ── Load Character GLB — nếu không có charGlbUrl thì bỏ qua (scene vẫn chạy, chưa có nhân vật)
    if (!charGlbUrl) {
      console.log('[SontinhScene] Không có character GLB — chờ user upload.');
      buildAnimBoard3D();
    } else {
    console.log(`[SontinhScene] Loading character for "${username}":`, charGlbUrl);
    app.assets.loadFromUrl(charGlbUrl, 'container', (err: any, asset?: pc.Asset) => {
      if (err || !asset?.resource) {
        console.warn('[SontinhScene] Character GLB không tìm thấy — cần upload:', err?.message ?? err);
        buildAnimBoard3D();
        return;
      }
    
      const charContainer = asset.resource as any;
      glbCharEntity = (charContainer.instantiateRenderEntity() ?? charContainer.instantiateModelEntity()) as pc.Entity;
      if (!glbCharEntity) { console.error('GLB entity creation failed'); return; }
    
      // Clear old placeholder geometry
      while (charBodyRoot.children.length > 0) charBodyRoot.children[0].destroy();
    
      // Wrapper entity — apply scene scale here WITHOUT touching the GLB's internal
      // root scale (which converts cm bone-space → m world-space for skinning).
      const charScaleWrapper = new pc.Entity('CharScaleWrapper');
      charScaleWrapper.setLocalScale(13.5 / 1.70, 13.5 / 1.70, 13.5 / 1.70);
      
      // Add a slight Y offset so the feet don't sink into the floor
      charScaleWrapper.setLocalPosition(0, 0.35, 0);
      
      charBodyRoot.addChild(charScaleWrapper);
      charScaleWrapper.addChild(glbCharEntity);
    
      // Only set position/rotation on GLB entity — do NOT touch its scale
      glbCharEntity.setLocalPosition(0, 0, 0);
      glbCharEntity.setLocalEulerAngles(0, 0, 0);
    
      // NOTE: do NOT call fixMatteMaterials — Meshy model has proper PBR textures

      charAnimReady = true;
      animComp = ensureAnimComponent();
      if ((_svc as any)._profile?.character?.animationState) {
        loadAndPlayAnim((_svc as any)._profile.character.animationState);
      }
      buildAnimBoard3D();
      console.log('✅ Character loaded & animComp ready');
    }); // end loadFromUrl character
    } // end else (charGlbUrl exists)


    // ── WALKING AI ────────────────────────────────────────────────
    // Waypoints stay safely inside the room (X∈[-70,70], Z∈[-40,40]).
    // Margin: 15 units from X side-walls, 12 units from Z front/back walls.
    // Avoids door gap area (left wall X=-70, Z∈[-5,5]) and furniture clusters.
    const roomWaypoints = [
      new pc.Vec3(  0.0, 0.0,  -5.0),
      new pc.Vec3( 20.0, 0.0,  10.0),
      new pc.Vec3( 40.0, 0.0,  18.0),
      new pc.Vec3( 28.0, 0.0, -22.0),
      new pc.Vec3( -5.0, 0.0, -26.0),
      new pc.Vec3(-35.0, 0.0,   5.0),
      new pc.Vec3(-25.0, 0.0,  22.0),
      new pc.Vec3( 10.0, 0.0,  26.0),
    ];
    let charCurrentPos  = new pc.Vec3(0.0, 0.0, -5.0);
    let charTargetIndex = 1;
    // charWalkSpeed: matched to animation cycle so feet don't slide.
    // Animation cycle = 1.067s (2 steps). Human stride ~0.75m/step × 7.71 units/m = 5.78 units/step.
    // Speed = 5.78 / (1.067/2) ≈ 10.8 units/s → use 11.0 for natural feel.
    const charWalkSpeed = 11.0;
    let charCurrentYaw  = 0;
    let charWaitTimer   = 0.0;
    let charIsWalking   = true;
    function spawnStepGlowRipple(x: number, z: number) {
      // Hiệu ứng tỏa sáng dưới chân nhân vật đã được tắt theo yêu cầu người dùng
    }

    // ── WASD PLAYER CONTROL ───────────────────────────────────────────────────────
    // Camera-relative: W=forward, S=back, A=left, D=right.
    // Returns true if WASD is active (caller should skip AI update).
    function updateWASDMovement(dt: number): boolean {
      const w = wasdKeys['KeyW'] || wasdKeys['w'] || wasdKeys['ArrowUp'] || wasdKeys['arrowup'];
      const s = wasdKeys['KeyS'] || wasdKeys['s'] || wasdKeys['ArrowDown'] || wasdKeys['arrowdown'];
      const a = wasdKeys['KeyA'] || wasdKeys['a'] || wasdKeys['ArrowLeft'] || wasdKeys['arrowleft'];
      const d = wasdKeys['KeyD'] || wasdKeys['d'] || wasdKeys['ArrowRight'] || wasdKeys['arrowright'];
      const anyKey = w || s || a || d;
    
      if (!anyKey || !charAnimReady) {
        if (wasdWasActive) {
          wasdWasActive = false;
          // Brief pause so AI doesn't immediately walk away
          charIsWalking = false;
          charWaitTimer = 1.5;
        }
        return false;
      }
    
      wasdWasActive = true;
      charIsWalking = true; // keep AI from resetting to waypoint logic

      // Camera orbit yaw → camera-relative axes (XZ plane only)
      const yawRad = targetYaw * pc.math.DEG_TO_RAD;
      const fwdX = -Math.sin(yawRad),  fwdZ = -Math.cos(yawRad); // W direction
      const rgtX =  Math.cos(yawRad),  rgtZ = -Math.sin(yawRad); // D direction

      let moveX = 0, moveZ = 0;
      if (w) { moveX += fwdX; moveZ += fwdZ; }
      if (s) { moveX -= fwdX; moveZ -= fwdZ; }
      if (a) { moveX -= rgtX; moveZ -= rgtZ; }
      if (d) { moveX += rgtX; moveZ += rgtZ; }

      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 0.001) {
        moveX /= len; moveZ /= len;

        const spd = getEffectiveWalkSpeed();
        charCurrentPos.x += moveX * spd * dt;
        charCurrentPos.z += moveZ * spd * dt;

        // Room bounds
        const BOUND_X = 55, BOUND_Z = 28;
        charCurrentPos.x = Math.max(-BOUND_X, Math.min(BOUND_X, charCurrentPos.x));
        charCurrentPos.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, charCurrentPos.z));

        // Smooth facing toward movement direction
        const desiredYaw = Math.atan2(moveX, moveZ) * pc.math.RAD_TO_DEG;
        let dyaw = desiredYaw - charCurrentYaw;
        while (dyaw >  180) dyaw -= 360;
        while (dyaw < -180) dyaw += 360;
        charCurrentYaw += dyaw * Math.min(1.0, dt * 12);
      }

    charPivot.setPosition(charCurrentPos.x, 0, charCurrentPos.z);
    charPivot.setEulerAngles(0, charCurrentYaw, 0);
    charBodyRoot.setLocalEulerAngles(0, 0, 0);

    // Trigger footstep glow on floor
    if (moveX !== 0 || moveZ !== 0) {
      spawnStepGlowRipple(charCurrentPos.x, charCurrentPos.z);
    }

      // Camera pivot stays static until user clicks a prop item

      return true;
    }
    
    // ── WALKING AI ────────────────────────────────────────────────────────────────
    // The AnimComponent on glbCharEntity plays the embedded skeleton walk animation.
    // This function only handles: position navigation + yaw facing direction.
    // Body animation (legs/arms) is driven entirely by the GLB animation clip.
    
    let charWasWalking = true; // track last state to trigger animation switch on change
    let charCurrentSpeed = 0;  // actual speed, ramped up/down for smooth start/stop
    const CHAR_ACCEL = 14.0;   // units/s² acceleration / deceleration rate
    
    function updateCharacterWalkingAI(dt: number) {
      if (manualAnimOverride !== null) {
        if (activeAnimIsMovement && activeAnimSpeed > 0) {
          // Hành động thuộc loại Di chuyển (VD: 8.0 units/s) → di chuyển nhân vật tiến về phía trước theo bước chân!
          const yawRad = charCurrentYaw * pc.math.DEG_TO_RAD;
          const fwdX = Math.sin(yawRad);
          const fwdZ = Math.cos(yawRad);

          charCurrentPos.x += fwdX * activeAnimSpeed * dt;
          charCurrentPos.z += fwdZ * activeAnimSpeed * dt;

          // Xử lý va chạm tường phòng (nếu chạm tường thì tự quay đầu)
          const BOUND_X = 55, BOUND_Z = 28;
          if (charCurrentPos.x > BOUND_X) { charCurrentPos.x = BOUND_X; charCurrentYaw += 150; }
          if (charCurrentPos.x < -BOUND_X) { charCurrentPos.x = -BOUND_X; charCurrentYaw += 150; }
          if (charCurrentPos.z > BOUND_Z) { charCurrentPos.z = BOUND_Z; charCurrentYaw += 150; }
          if (charCurrentPos.z < -BOUND_Z) { charCurrentPos.z = -BOUND_Z; charCurrentYaw += 150; }

          charPivot.setPosition(charCurrentPos.x, 0, charCurrentPos.z);
          charPivot.setEulerAngles(0, charCurrentYaw, 0);
          spawnStepGlowRipple(charCurrentPos.x, charCurrentPos.z);
        } else {
          // Hành động Tại chỗ (speed = 0) → đứng yên vị trí
          charPivot.setPosition(charCurrentPos.x, 0, charCurrentPos.z);
        }
        return;
      }

      const targetWP = roomWaypoints[charTargetIndex];
    
      // ── IDLE ─────────────────────────────────────────────────────────────────────
      if (!charIsWalking) {
        charWaitTimer -= dt;
        charPivot.setPosition(charCurrentPos.x, 0, charCurrentPos.z);
        charBodyRoot.setLocalEulerAngles(0, 0, 0);
    
        if (charWasWalking) {
          charWasWalking = false;
          switchCharAnim(activeIdleAnim);
        }
    
        if (charWaitTimer <= 0) {
          charIsWalking = true;
          let next = Math.floor(Math.random() * roomWaypoints.length);
          if (next === charTargetIndex) next = (next + 1) % roomWaypoints.length;
          charTargetIndex = next;
        }
        return;
      }
    
      // ── WALKING ───────────────────────────────────────────────────────────────────
      if (!charWasWalking) {
        charWasWalking = true;
        switchCharAnim(activeWalkAnim);
      }
    
      const dx   = targetWP.x - charCurrentPos.x;
      const dz   = targetWP.z - charCurrentPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 2.0) {
        // If user forced a 'Move' animation (like Running), don't pause at waypoints!
        const isOverrideMove = manualAnimOverride && ANIM_CATALOG.find(a => a.key === manualAnimOverride)?.category === 'Move';
        if (isOverrideMove) {
          let next = Math.floor(Math.random() * roomWaypoints.length);
          if (next === charTargetIndex) next = (next + 1) % roomWaypoints.length;
          charTargetIndex = next;
          return;
        }
    
        charIsWalking = false;
        charWaitTimer = 2.0 + Math.random() * 4.5;
        return;
      }
    
      // Constant walk speed — driven by active animation to avoid foot sliding
      const spd = getEffectiveWalkSpeed();
      
      if (spd > 0) {
        // Smooth yaw: turn fast enough to track movement direction but no snapping
        const desiredYaw = Math.atan2(dx, dz) * pc.math.RAD_TO_DEG;
        let dyaw = desiredYaw - charCurrentYaw;
        while (dyaw >  180) dyaw -= 360;
        while (dyaw < -180) dyaw += 360;
        charCurrentYaw += dyaw * Math.min(1.0, dt * 3.8);
    
        charCurrentPos.x += (dx / dist) * spd * dt;
        charCurrentPos.z += (dz / dist) * spd * dt;
      }
    
      // ── WALL CLAMP ───────────────────────────────────────────────────────────────
      const BOUND_X = 55, BOUND_Z = 28;
      charCurrentPos.x = Math.max(-BOUND_X, Math.min(BOUND_X, charCurrentPos.x));
      charCurrentPos.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, charCurrentPos.z));
    
      charBodyRoot.setLocalEulerAngles(0, 0, 0);
      charPivot.setPosition(charCurrentPos.x, 0, charCurrentPos.z);
      charPivot.setEulerAngles(0, charCurrentYaw, 0);
    }
    
    
    // 🖱️ Raycast Click Detection for 3D Picture Frame
    const _svc = this;
    function tryClickPicture(screenX: number, screenY: number) {
      if (EMPTY_SCENE) return false;
      if (!camera.camera) return false;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(screenX, screenY, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(screenX, screenY, camera.camera.farClip, rayTo);
      const rayDir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, rayDir);

      const frameRender = familyFrameOuter.render;
      if (frameRender && frameRender.meshInstances.length > 0) {
        const aabb = frameRender.meshInstances[0].aabb;
        const hitPoint = new pc.Vec3();
        if (aabb.intersectsRay(ray, hitPoint)) {
          if (!_svc._hasPhoto && _svc.onPictureFrameClick) {
            _svc.ngZone.run(() => _svc.onPictureFrameClick!());
          } else {
            togglePictureView();
          }
          return true;
        }
      }
      return false;
    }
    
    function getRealTimeHour(): number {
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    }

    function updateRealTimeClockUI() {
      const now = new Date();
      const sec = now.getSeconds() + now.getMilliseconds() / 1000;
      const min = now.getMinutes() + sec / 60;
      const hr = (now.getHours() % 12) + min / 60;

      const secAngle = sec * 6;
      const minAngle = min * 6;
      const hrAngle = hr * 30;

      secondHandPivot.setLocalEulerAngles(0, 0, -secAngle);
      minuteHandPivot.setLocalEulerAngles(0, 0, -minAngle);
      hourHandPivot.setLocalEulerAngles(0, 0, -hrAngle);
    }

    function updateRealTimeSunAndSky(dt: number) {
      const hr = getRealTimeHour();

      let targetSkyR = 0, targetSkyG = 0, targetSkyB = 0;
      let targetAmbR = 0, targetAmbG = 0, targetAmbB = 0;
      let targetSunR = 0, targetSunG = 0, targetSunB = 0;
      let targetSunIntensity = 0;
      let targetSunPitch = 0, targetSunYaw = 120;
      let targetWindowIntensity = 0;

      let bgR = 0, bgG = 0, bgB = 0; // Sky Backdrop Emissive Color

      if (hr >= 5.0 && hr < 7.0) {
        // 🌄 DAWN / SUNRISE (5:00 AM - 7:00 AM - NGẮM TRỜI MỌC)
        const dawnProgress = (hr - 5.0) / 2.0;
        targetSkyR = pc.math.lerp(0.015, 0.18, dawnProgress);
        targetSkyG = pc.math.lerp(0.020, 0.12, dawnProgress);
        targetSkyB = pc.math.lerp(0.035, 0.16, dawnProgress);

        targetAmbR = pc.math.lerp(0.05, 0.18, dawnProgress);
        targetAmbG = pc.math.lerp(0.06, 0.16, dawnProgress);
        targetAmbB = pc.math.lerp(0.09, 0.22, dawnProgress);

        targetSunR = 1.0;
        targetSunG = pc.math.lerp(0.50, 0.75, dawnProgress);
        targetSunB = pc.math.lerp(0.20, 0.40, dawnProgress);

        targetSunIntensity = pc.math.lerp(0.6, 2.2, dawnProgress);
        targetSunPitch = pc.math.lerp(5, 20, dawnProgress);
        targetWindowIntensity = pc.math.lerp(3.0, 8.0, dawnProgress);

        bgR = pc.math.lerp(0.02, 1.0, dawnProgress);
        bgG = pc.math.lerp(0.03, 0.50, dawnProgress);
        bgB = pc.math.lerp(0.06, 0.30, dawnProgress);

      } else if (hr >= 7.0 && hr < 17.0) {
        // ☀️ DAYTIME (7:00 AM - 5:00 PM - TRỜI SÁNG RỰC RỠ)
        const dayProgress = (hr - 7.0) / 10.0;
        targetSkyR = 0.08; targetSkyG = 0.14; targetSkyB = 0.28;
        targetAmbR = 0.24; targetAmbG = 0.26; targetAmbB = 0.35;
        targetSunR = 1.0;  targetSunG = 0.95; targetSunB = 0.85;
        targetSunIntensity = 1.2;
        targetSunPitch = 20 + Math.sin(dayProgress * Math.PI) * 40;
        targetWindowIntensity = 1.8;

        bgR = 0.25; bgG = 0.60; bgB = 0.95;

      } else if (hr >= 17.0 && hr < 19.0) {
        // 🌇 SUNSET / TWILIGHT (5:00 PM - 7:00 PM - NGẮM HOÀNG HÔN / CHẠM HOÀNG HÔN - Current time ~ 18:08!)
        const duskProgress = (hr - 17.0) / 2.0;
        targetSkyR = pc.math.lerp(0.08, 0.02, duskProgress);
        targetSkyG = pc.math.lerp(0.14, 0.025, duskProgress);
        targetSkyB = pc.math.lerp(0.28, 0.05, duskProgress);

        targetAmbR = pc.math.lerp(0.24, 0.07, duskProgress);
        targetAmbG = pc.math.lerp(0.26, 0.06, duskProgress);
        targetAmbB = pc.math.lerp(0.35, 0.10, duskProgress);

        targetSunR = 1.0;
        targetSunG = pc.math.lerp(0.70, 0.35, duskProgress);
        targetSunB = pc.math.lerp(0.40, 0.10, duskProgress);

        targetSunIntensity = pc.math.lerp(1.2, 0.4, duskProgress);
        targetSunPitch = pc.math.lerp(20, 5, duskProgress);
        targetWindowIntensity = pc.math.lerp(1.8, 0.6, duskProgress);

        bgR = pc.math.lerp(0.12, 0.03, duskProgress);
        bgG = pc.math.lerp(0.25, 0.05, duskProgress);
        bgB = pc.math.lerp(0.55, 0.15, duskProgress);

      } else {
        // 🌙 NIGHTTIME (7:00 PM - 5:00 AM - TRỜI TỐI ĐÊM KHUYA)
        targetSkyR = 0.015; targetSkyG = 0.02; targetSkyB = 0.035;
        targetAmbR = 0.05;  targetAmbG = 0.06; targetAmbB = 0.09;
        targetSunR = 0.45;  targetSunG = 0.65; targetSunB = 0.95;
        targetSunIntensity = 0.5;
        targetSunPitch = 25;
        targetWindowIntensity = 2.5;

        bgR = 0.015; bgG = 0.025; bgB = 0.06;
      }

      // Smoothly dim environment when room wall lights are switched off
      if (!isHighWallLedOn) {
        targetAmbR *= 0.25;
        targetAmbG *= 0.25;
        targetAmbB *= 0.25;
        targetSunIntensity *= 0.3;
        targetWindowIntensity *= 0.2;
      }

      if (sunLight.light) {
        const curColor = sunLight.light.color;
        curColor.lerp(curColor, new pc.Color(targetSunR, targetSunG, targetSunB), dt * 3.0);
        sunLight.light.color = curColor;
        sunLight.light.intensity = pc.math.lerp(sunLight.light.intensity, targetSunIntensity, dt * 3.0);
      }

      if (window2Light.light) {
        window2Light.light.intensity = pc.math.lerp(window2Light.light.intensity, targetWindowIntensity, dt * 3.0);
      }

      sunLight.setEulerAngles(targetSunPitch, targetSunYaw, 0);
    }
    
    // 🛡️ CAMERA WALL ANTI-CLIPPING / ROOM BOUNDARY COLLISION SYSTEM
    function clampCameraPositionInsideRoom(pivot: pc.Vec3, targetCamPos: pc.Vec3): pc.Vec3 {
      const marginX = 2.0; // 2.0m away from Left/Right walls
      const marginZ = 2.0; // 2.0m away from Back/Front walls
      const marginY = 1.2; // 1.2m away from Floor/Ceiling

      // Studio trong (EMPTY_SCENE): hop khoa rat rong de camera zoom-out tu do;
      // phong that: giu margin sat tuong nhu cu.
      const minX = EMPTY_SCENE ? -250 : -ROOM_WIDTH_X / 2 + marginX;
      const maxX = EMPTY_SCENE ?  250 :  ROOM_WIDTH_X / 2 - marginX;
      const minZ = EMPTY_SCENE ? -250 : -ROOM_DEPTH_Z / 2 + marginZ;
      const maxZ = EMPTY_SCENE ?  250 :  ROOM_DEPTH_Z / 2 - marginZ;
      const minY = EMPTY_SCENE ? 0.5 : 1.2;     // van khong chui duoi san
      const maxY = EMPTY_SCENE ? 400 : WALL_H - marginY;

      const vx = targetCamPos.x - pivot.x;
      const vy = targetCamPos.y - pivot.y;
      const vz = targetCamPos.z - pivot.z;

      let minT = 1.0;

      // Outer Room X planes
      if (vx > 0.0001) {
        const t = (maxX - pivot.x) / vx;
        if (t > 0 && t < minT) minT = t;
      } else if (vx < -0.0001) {
        const t = (minX - pivot.x) / vx;
        if (t > 0 && t < minT) minT = t;
      }

      // Outer Room Y planes
      if (vy > 0.0001) {
        const t = (maxY - pivot.y) / vy;
        if (t > 0 && t < minT) minT = t;
      } else if (vy < -0.0001) {
        const t = (minY - pivot.y) / vy;
        if (t > 0 && t < minT) minT = t;
      }

      // Intersect Outer Room Z planes
      if (vz > 0.0001) {
        const t = (maxZ - pivot.z) / vz;
        if (t > 0 && t < minT) minT = t;
      } else if (vz < -0.0001) {
        const t = (minZ - pivot.z) / vz;
        if (t > 0 && t < minT) minT = t;
      }

      minT = Math.max(0.1, Math.min(1.0, minT));

      const cx = pc.math.clamp(pivot.x + vx * minT, minX, maxX);
      const cy = pc.math.clamp(pivot.y + vy * minT, minY, maxY);
      const cz = pc.math.clamp(pivot.z + vz * minT, minZ, maxZ);

      return new pc.Vec3(cx, cy, cz);
    }
    
    // -------------------------------------------------------------
    // 9. MAIN RENDER TICKER LOOP & DYNAMIC VIETNAMESE TRAFFIC & 100% FORWARD 3D STEERING FISH AI
    // -------------------------------------------------------------
    let timer = 0;
    
    app.on('update', (dt: number) => {
      timer += dt;

      // 🌟 CUSTOM EFFECT RUNTIME — tick script hieu ung moi khung hinh
      if (activeEffects.size > 0) {
        activeEffects.forEach((fx) => {
          for (const fn of fx.tickFns) {
            try { fn(dt); } catch (e) { /* nuot loi script nguoi dung, khong lam vo vong update */ }
          }
        });
      }

      // Cặp nút Delete/Duplicate HTML: chiếu điểm neo (đỉnh ring) ra pixel màn hình.
      // Chỉ phát callback khi trạng thái/vị trí đổi đáng kể (tránh spam Change Detection).
      if (_svc.onPropActionAnchor) {
        let ax = -1, ay = -1;
        const visible = !!(selRing && selRing.enabled && selRingPropId);
        if (visible) {
          const rp = selRing.getPosition();
          // Điểm neo: đỉnh trên của ring (nút lơ lửng phía trên đồ vật)
          const anchor = new pc.Vec3(rp.x, rp.y + 0.39, rp.z);
          if (camera && camera.camera) {
            const sp = camera.camera.worldToScreen(anchor, new pc.Vec3());
            ax = Math.round(sp.x);
            ay = Math.round(sp.y);
          }
        }
        const moved = Math.abs(ax - lastAnchorX) > 2 || Math.abs(ay - lastAnchorY) > 2;
        if (visible !== lastAnchorVisible || (visible && moved)) {
          lastAnchorVisible = visible;
          lastAnchorX = ax; lastAnchorY = ay;
          const pid = selRingPropId;
          _svc.ngZone.run(() => _svc.onPropActionAnchor!(visible, ax, ay, pid));
        }
      }

      // 🌀 PROPS ANIMATION TICKER (spin, bounce, float, pulse)
      propAnimMap.forEach((cfg, entName) => {
        const e = app.root.findByName(entName);
        if (e && (e as any).enabled) {
          if (cfg.type === "spin") {
            e.rotateLocal(0, dt * cfg.speed, 0);
          } else if (cfg.type === "bounce") {
            const dy = Math.abs(Math.sin(timer * cfg.speed)) * 0.6;
            e.setPosition(cfg.basePos.x, cfg.basePos.y + dy, cfg.basePos.z);
          } else if (cfg.type === "float") {
            const dy = Math.sin(timer * cfg.speed) * 0.3;
            e.setPosition(cfg.basePos.x, cfg.basePos.y + dy, cfg.basePos.z);
          } else if (cfg.type === "pulse") {
            const f = 1.0 + Math.sin(timer * cfg.speed) * 0.2;
            e.setLocalScale(cfg.baseScale.x * f, cfg.baseScale.y * f, cfg.baseScale.z * f);
          }
        }
      });
    
      // ⏰ REAL-TIME CLOCK & ATMOSPHERE UPDATE
      updateRealTimeClockUI();
      updateRealTimeSunAndSky(dt);
    
      // 🕹️ WASD / Arrow keys — player-controlled movement (overrides AI while held)
      const wasdHandled = updateWASDMovement(dt);
    
      // 🚶‍♂️ 3D CHARACTER WALKING & STEERING AI UPDATE
      if (!wasdHandled) updateCharacterWalkingAI(dt);
    
      // Orbit camera smooth control
      orbitYaw = pc.math.lerp(orbitYaw, targetYaw, dt * 10);
      orbitPitch = pc.math.lerp(orbitPitch, targetPitch, dt * 10);
      orbitDistance = pc.math.lerp(orbitDistance, targetDistance, dt * 10);
      currentPivot.lerp(currentPivot, targetPivot, dt * 10);
    
      const pitchRad = orbitPitch * pc.math.DEG_TO_RAD;
      const yawRad = orbitYaw * pc.math.DEG_TO_RAD;
    
      const rawX = currentPivot.x + orbitDistance * Math.sin(yawRad) * Math.cos(pitchRad);
      const rawY = currentPivot.y + orbitDistance * Math.sin(pitchRad);
      const rawZ = currentPivot.z + orbitDistance * Math.cos(yawRad) * Math.cos(pitchRad);
    
      const idealCamPos = new pc.Vec3(rawX, rawY, rawZ);
    
      // 🛡️ Apply Raycast Wall Anti-Clipping (unless viewing street outside window)
      const finalCamPos = isWindowViewActive
        ? idealCamPos
        : clampCameraPositionInsideRoom(currentPivot, idealCamPos);
    
      camera.setPosition(finalCamPos);
      camera.lookAt(currentPivot);
    
      // 🚪 100% SMOOTH JITTER-FREE DOOR ANIMATION (Direct state variable interpolation)
      const targetDoorAngle = isDoorOpen ? 95 : 0;
      currentDoorAngle = pc.math.lerp(currentDoorAngle, targetDoorAngle, dt * 6.0);
      doorPivot.setLocalEulerAngles(0, currentDoorAngle, 0);
    
      // 🗄️ 100% SMOOTH INTERACTIVE DESK DRAWER ANIMATION
      for (let i = 0; i < NUM_DESK_DRAWERS; i++) {
        drawerProgress[i] = pc.math.lerp(drawerProgress[i], drawerStates[i], Math.min(1.0, dt * 7.0));
        const currentZ = DRAWER_BASE_Z + drawerProgress[i] * DRAWER_OPEN_OFFSET_Z;
        drawerPivots[i].setPosition(0.0, drawerBaseYList[i], currentZ);
      }
    
      // 🚗 ANIMATE MULTIPLE 3D CARS DRIVING BACK AND FORTH IN BOTH DIRECTIONS
      const animateCar = (carEntity: pc.Entity, speed: number, direction: number, minZ: number, maxZ: number) => {
        const pos = carEntity.getPosition().clone();
        pos.z += dt * speed * direction;
        if (direction > 0 && pos.z > maxZ) pos.z = minZ;
        if (direction < 0 && pos.z < minZ) pos.z = maxZ;
        carEntity.setPosition(pos);
      };
    
      animateCar(carRedSedan, 22.0, 1, -55.0, 55.0);
      animateCar(carWhiteSUV, 18.0, 1, -55.0, 55.0);
      animateCar(carBlueSport, 26.0, 1, -55.0, 55.0);
    
      animateCar(carBlackLuxury, 20.0, -1, -55.0, 55.0);
      animateCar(carSilverCoupe, 28.0, -1, -55.0, 55.0);
      animateCar(carYellowTaxi, 19.0, -1, -55.0, 55.0);
      const mb1Pos = motorbike1.getPosition().clone();
      mb1Pos.z += dt * 14.0;
      if (mb1Pos.z > 35.0) mb1Pos.z = -35.0;
      motorbike1.setPosition(mb1Pos);
    
      const mb2Pos = motorbike2.getPosition().clone();
      mb2Pos.z += dt * 18.0;
      if (mb2Pos.z > 35.0) mb2Pos.z = -35.0;
      motorbike2.setPosition(mb2Pos);
    
      const mb3Pos = motorbike3.getPosition().clone();
      mb3Pos.z -= dt * 16.0;
      if (mb3Pos.z < -35.0) mb3Pos.z = 35.0;
      motorbike3.setPosition(mb3Pos);
    
      const mb4Pos = motorbike4.getPosition().clone();
      mb4Pos.z -= dt * 20.0;
      if (mb4Pos.z < -35.0) mb4Pos.z = 35.0;
      motorbike4.setPosition(mb4Pos);
    
      const carPos = streetCar.getPosition().clone();
      carPos.z -= dt * 12.0;
      if (carPos.z < -35.0) carPos.z = 35.0;
      streetCar.setPosition(carPos);
    
      // 🐟 100% EDGE-TO-EDGE FULL TANK SWIMMING 3D GOLDFISH AI (SWIMMING SÁT THÀNH BỂ BƠI VÒNG LẠI)
      for (let i = 0; i < simpleFishes.length; i++) {
        const f = simpleFishes[i];
    
        const distToTarget = f.pos.distance(f.target);
    
        // Pick new 3D edge target when close to target or close to glass bounds
        if (distToTarget < 0.35 || f.pos.x <= AQUA_MIN_X + 0.05 || f.pos.x >= AQUA_MAX_X - 0.05 || f.pos.z <= AQUA_MIN_Z + 0.05 || f.pos.z >= AQUA_MAX_Z - 0.05) {
          f.target = getRand3DAquaTargetEdge();
        }
    
        // Direction vector towards target in 3D space
        const dir = f.target.clone().sub(f.pos);
        if (dir.length() > 0.001) {
          dir.normalize();
    
          // 🎯 EXACT 3D FORWARD SNOUT HEADING FORMULA:
          // Local snout is at +X (+0.32 * scaleFactor).
          const targetYaw = Math.atan2(-dir.z, dir.x) * pc.math.RAD_TO_DEG;
          const targetPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * pc.math.RAD_TO_DEG;
    
          // Smoothly interpolate rotation (gracefully turn left / turn right / pitch up / pitch down)
          f.currentYaw = pc.math.lerpAngle(f.currentYaw, targetYaw, dt * 3.2);
          f.currentPitch = pc.math.lerpAngle(f.currentPitch, targetPitch, dt * 3.2);
    
          f.pivot.setEulerAngles(f.currentPitch, f.currentYaw, 0);
    
          // 🚀 MOVE FORWARD ALONG FISH'S NOSE DIRECTION (100% FORWARD MOVEMENT, ZERO BACKWARD MOVEMENT)
          const radYaw = f.currentYaw * pc.math.DEG_TO_RAD;
          const radPitch = f.currentPitch * pc.math.DEG_TO_RAD;
    
          // Local nose direction vector in world coordinates
          const forwardDir = new pc.Vec3(
            Math.cos(radYaw) * Math.cos(radPitch),
            Math.sin(radPitch),
            -Math.sin(radYaw) * Math.cos(radPitch)
          );
    
          f.pos.add(forwardDir.scale(f.speed * dt));
    
          // Clamp position strictly inside full tank water volume
          f.pos.x = Math.max(AQUA_MIN_X, Math.min(AQUA_MAX_X, f.pos.x));
          f.pos.y = Math.max(AQUA_MIN_Y, Math.min(AQUA_MAX_Y, f.pos.y));
          f.pos.z = Math.max(AQUA_MIN_Z, Math.min(AQUA_MAX_Z, f.pos.z));
    
          f.pivot.setPosition(f.pos);
        }
    
        // Dynamic tail swaying speed matching swim velocity
        const tailSway = Math.sin(timer * 6.5 + f.phase) * 18.0;
        f.tailPivot.setLocalEulerAngles(0, tailSway, 0);
    
        // Vây ngực vẫy nhẹ sinh động
        const finSway = Math.cos(timer * 7.0 + f.phase) * 16.0;
        f.finLeft.setLocalEulerAngles(35 + finSway, -20, 45);
        f.finRight.setLocalEulerAngles(-35 - finSway, 20, 45);
      }
    
      // Subtle breathing lighting effects on gear & aquarium water
      if (leftMonitorGlow.light) {
        leftMonitorGlow.light.intensity = 3.0 + Math.sin(timer * 2.5) * 0.5;
      }
      if (rightMonitorGlow.light) {
        rightMonitorGlow.light.intensity = 3.0 + Math.cos(timer * 2.5) * 0.5;
      }
      if (aquaLight.light) {
        aquaLight.light.intensity = 4.2 + Math.sin(timer * 3.0) * 0.6;
      }
    });
    
    // 🌟 CUSTOM EFFECT RUNTIME — thuc thi script JS hieu ung (tuyet roi, la roi, dom dom...)
    // Script nguoi dung/AI viet theo API: function effect(fx) { fx.spawnParticles(...); fx.onTick(...) }
    const activeEffects = new Map<string, { root: pc.Entity; tickFns: Array<(dt: number) => void>; mis: pc.MeshInstance[] }>();
    const fxWorldLayer = () => app.scene.layers.getLayerByName('World') || app.scene.layers.getLayerByName('Skybox') || null;

    // Chuon hoa ten giong hec runPropEffect luu key: "Tuy_t r_i" -> "Tuy_t_r_i".
    // BUG da sua: switch tat truyen ten GOC ("Tuy_t r_i") nhung key trong map la
    // ten DA chuan hoa ("Tuy_t_r_i") -> get tra undefined -> ham thoat som ->
    // khong don hat, tuyet van roi du switch dang o trang thai tat.
    function stopPropEffect(name: string): void {
      const normFxName = (s: string) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom';
      const wanted = normFxName(name);
      let key: string | null = activeEffects.has(wanted) ? wanted : null;
      if (!key) {
        for (const k of Array.from(activeEffects.keys())) {
          if (normFxName(k) === wanted) { key = k; break; }
        }
      }
      if (!key) return;
      const fx = activeEffects.get(key)!;
      const wl = fxWorldLayer();
      for (const mi of fx.mis) {
        try { if (wl) wl.removeMeshInstances([mi]); } catch (e) { /* ignore */ }
      }
      try {
        fx.root.getChildren().slice().forEach((c) => { (c as pc.Entity).destroy(); });
        fx.root.destroy();
      } catch (e) { /* ignore */ }
      activeEffects.delete(key);
      console.log('[SontinhScene] Effect stopped:', key);
    }

    // Bien hoa script kieu PlayCanvas Editor (pc.createScript + prototype.initialize/update)
    // thanh khuon mau "function effect(fx)" ma sandbox hieu, dong thoi tu sua loi cu phap
    // pho bien "default:," (thieu gia tri) khi copy attributes tu PlayCanvas Editor.
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

    function runPropEffect(cmd: { name?: string; targetPropId?: string | null; targetPropName?: string | null; params?: any; script?: string }): boolean {
      if (!cmd || !cmd.script) return false;
      const fxName = String(cmd.name || 'custom').replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom';
      stopPropEffect(fxName); // chay de hieu ung trung ten

      const fxRoot = new pc.Entity('FX_' + fxName);
      app.root.addChild(fxRoot);
      let hostEntity: pc.Entity | null = null;
      // Registry Canvas rerun effect với targetPropName 'Floor' — được hiểu là
      // "phủ toàn scene" (không rải hạt quanh tâm sàn). Floor chỉ làm host cho
      // phần material (phủ trắng), không làm tâm vùng rơi hạt.
      const hostIsFloor = String(cmd.targetPropName || '').trim().toLowerCase() === 'floor';

      // Dinh vi dich: bam theo mon do neu co targetPropName/Id
      if (cmd.targetPropId || cmd.targetPropName) {
        const wantName = String(cmd.targetPropName || '');
        const host = findPropEntityById(String(cmd.targetPropId || '')) || app.root.findByName(wantName);
        if (host) {
          hostEntity = host as pc.Entity;
          // KHONG tu dong bat lai host bi an (vd san marble cua showroom bi
          // EMPTY_SCENE studio tat) — tao/bat san thay nguoi dung la hanh vi
          // sai (phan hoi: "sao phai tao them san ben duoi"). Effect van gan
          // vao host: phan phu san ton tai an tren material (neu sau nay san
          // duoc bat lai thi tuyet hien), phan hat roi van chay binh thuong
          // vi snowRoot duoc them vao app.root (khong ke thua trang thai an).
          if (!hostEntity.enabled) {
            console.log('[SontinhScene] Host "' + wantName + '" dang an (studio trong) — chi chay hat roi, khong phu san.');
          }
          // FIX "đống tuyết lơ lửng": KHÔNG dời fxRoot tới vị trí món đồ nữa.
          // fxRoot giữ ở gốc (0,0,0) để mọi h.node.setPosition(h.x, h.y, h.z)
          // trong script hiệu ứng chính là tọa độ THẾ GIỚI. Hạt muốn bám quanh
          // món đồ do spawnParticles tự rải quanh tâm món (center) thay vì
          // dồn hết về một điểm duy nhất tại gốc hiệu ứng.
        }
        // Khong tim thay host -> KHONG tu tao san moi. hostEntity = null,
        // api.entity = fxRoot trong suot; script tu degrade (chi chay phan
        // khong can material — hat roi).
      }

      const worldLayer = fxWorldLayer();
      const tickFns: Array<(dt: number) => void> = [];
      const mis: pc.MeshInstance[] = [];

      const api: any = {
        params: cmd.params || {},
        root: fxRoot,
        app: app,
        entity: hostEntity || fxRoot,
        log: (msg: any) => console.log('[FX:' + fxName + ']', msg),
        onTick: (fn: (dt: number) => void) => { if (typeof fn === 'function') tickFns.push(fn); },
        spawnParticles: (opts: any) => {
          const o = opts || {};
          const count = Math.min(Math.max(Number(o.count) || 100, 1), 2000);
          const size = Math.max(Number(o.size) || 0.12, 0.01);
          const col = new pc.Color();
          try { col.fromString(String(o.color || '#ffffff')); } catch (e) { col.set(1, 1, 1, 1); }
          const opacity = Math.min(Math.max(o.opacity === undefined ? 1 : Number(o.opacity), 0.05), 1);
          const mat = new pc.StandardMaterial();
          mat.diffuse = new pc.Color(0, 0, 0);
          mat.emissive = col.clone();
          mat.useLighting = false;
          mat.opacity = opacity;
          mat.blendType = opacity >= 0.99 ? pc.BLEND_NONE : pc.BLEND_NORMAL;
          mat.depthWrite = opacity >= 0.99;
          mat.update();
          const mesh = pc.createSphere(app.graphicsDevice, { radius: size / 2, latitudeBands: 6, longitudeBands: 6 });

          // ===== FIX "đống bông tuyết đứng lơ lửng giữa không trung" =====
          // Trước đây: MỌI hạt sinh chồng nhau tại đúng một điểm (0,0,0) quanh
          // gốc hiệu ứng (nếu có targetPropName thì gốc còn bị dời vào tâm món
          // đồ) và hạt đứng im trừ khi script tự viết gravity. Giờ:
          //  1) Hạt được RẢI ĐỀU trong đĩa bán kính radius quanh center (mặc định:
          //     quanh món đồ nếu có target, ngược lại phủ toàn scene).
          //  2) Hạt TỰ RƠI theo physics mặc định (fallSpeed + gió + bồng bềnh sin)
          //     và TỰ ĐỤNG LẠI khi chạm mặt sàn (y=0) hoặc NÓC đồ vật/nhân vật
          //     (restY tính sẵn từ AABB các mesh đang hiện trên canvas).
          //  3) Script hiệu ứng không cần viết gravity — kể cả script chỉ gọi
          //     spawnParticles rồi bỏ đó, tuyết vẫn rơi đúng và đọng xuống bề mặt.
          const hasHost = !!(hostEntity && !hostIsFloor);
          const center: pc.Vec3 = (o.center && typeof o.center === 'object')
            ? new pc.Vec3(Number(o.center.x) || 0, Number(o.center.y) || 0, Number(o.center.z) || 0)
            : (hasHost ? (hostEntity as pc.Entity).getPosition().clone() : new pc.Vec3(0, 0, 0));
          const radius = Math.max(Number(o.radius) || (hasHost ? 4.5 : 15), 0.5);
          const topY = Number(o.topY) || (hasHost ? Math.max(center.y, 0) + 7 : 16);
          // Tran cua tang roi: moi gia tri "be mat" cao hon nay la RAT LE (tran
          // nha, AABB loi, den treo...) — se bi coi nhu san (y=0) o moi noi dung.
          const hardCapY = topY - 0.5;
          const fsBase = Number(o.fallSpeed) > 0 ? Number(o.fallSpeed) : 1.5;
          const windX = (o.wind && Number(o.wind.x)) || 0;
          const windZ = (o.wind && Number(o.wind.z)) || 0;
          const settle = o.settle !== false; // true: đọng lại trên bề mặt; false: chạm rồi nhảy về đỉnh (mưa/lá)
          const autoFall = o.autoFall !== false; // false: script tự điều khiển hoàn toàn vị trí hạt

          // Độ cao đọng (restY) cho mỗi cột (x,z): quét AABB mọi mesh ĐANG HIỆN trên
          // canvas (sàn, đồ vật, nhân vật) trong vùng hiệu ứng. Đồ vật đang ẨN
          // (enabled=false) bị bỏ qua — hạt không đọng trên nóc đồ vô hình.
          const colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; topY: number }> = [];
          try {
            const seen = new Set<any>();
            const addTree = (e: any) => {
              if (!e || seen.has(e)) return;
              seen.add(e);
              if (e.enabled === false) return; // nhánh bị ẩn: bỏ cả subtree
              const nm = String(e.name || '');
              if (nm.startsWith('FX_') || nm.startsWith('FXP_') || nm.startsWith('PropSelRing')) return;
              const r = e.render;
              if (r && Array.isArray(r.meshInstances)) {
                for (const mi of r.meshInstances) {
                  const a = mi && mi.aabb;
                  if (!a) continue;
                  const aMin = a.getMin(), aMax = a.getMax();
                  if (aMax.x < center.x - radius || aMin.x > center.x + radius) continue;
                  if (aMax.z < center.z - radius || aMin.z > center.z + radius) continue;
                  // FIX "đống tuyết đứng im giữa không trung": lọc collider SAI
                  // — mặt trần/nóc phòng, đèn treo trần, tường, nhân vật skinned
                  // (AABB bindpose khổng lồ), AABB dàn trải bất thường. Tuyết rơi
                  // trúng cột (x,z) của các mesh đó sẽ "đọng" lên nóc ở giữa trời
                  // (32m với phòng này) rồi nằm im tới khi tan.
                  // Nguyên tắc: bề mặt ĐỌNG tuyết phải là mặt ĐỨNG nằm dưới tầng
                  // rơi và có diện tích hiện hữu (không phải dải mỏng dọc).
                  const colH = aMax.y - aMin.y;                       // chiều cao collider
                  const colFoot = (aMax.x - aMin.x) * (aMax.z - aMin.z); // diện tích chân
                  if (aMax.y > topY + 1.5) continue;                  // đỉnh cao hơn tầng rơi: TRẦN/đèn trần — bỏ
                  if (colH > 2.2 * Math.max(0.05, topY - aMax.y)) continue; // cột quá cao so với khoảng trống phía trên: TƯỜNG — bỏ
                  if (colH < 0.02 && colFoot > 4 * radius * radius) continue; // dải mỏng dàn trải: sàn phóng AABB — bỏ
                  if (colFoot > 400) continue;                        // chân quá rộng: mesh khổng lồ (nhân vật/đất lớn) — bỏ
                  colliders.push({ minX: aMin.x, maxX: aMax.x, minZ: aMin.z, maxZ: aMax.z, topY: aMax.y });
                }
              }
              const ch = e.children;
              if (Array.isArray(ch)) for (const c of ch) addTree(c);
            };
            addTree(app.root);
          } catch (e) { /* không quét được: hạt đọng tại y = 0 (mặt sàn) */ }
          const restYAt = (x: number, z: number): number => {
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
            }
            return rest;
          };
          // restY AN TOÀN: chốt trên bởi hardCapY — mọi nơi dùng (spawn, physics,
          // phân loại đồ) đều không thể nhận giá trị "bề mặt giữa trời" nữa.
          const restYAnToan = (x: number, z: number): number => {
            const r = restYAt(x, z);
            return r > hardCapY ? 0 : r;
          };

          const arr: any[] = [];
          for (let i = 0; i < count; i++) {
            const ent = new pc.Entity('FXP_' + fxName + '_' + i);
            fxRoot.addChild(ent);
            const mi = new pc.MeshInstance(mesh, mat);
            mi.node = ent;
            mi.pick = false;
            if (worldLayer) worldLayer.addMeshInstances([mi]);
            mis.push(mi);
            const ang = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * radius; // rải đều theo diện tích đĩa
            const p: any = {
              node: ent,
              x: center.x + Math.cos(ang) * r,
              y: hasHost ? (center.y + 1.5 + Math.random() * 5.5) : (topY * (0.35 + 0.65 * Math.random())),
              z: center.z + Math.sin(ang) * r,
              vx: windX + (Math.random() - 0.5) * 0.4,
              vy: -(fsBase * (0.75 + Math.random() * 0.5)),
              vz: windZ + (Math.random() - 0.5) * 0.4,
              ph: Math.random() * Math.PI * 2,
              settled: false,
              restY: 0,
              // Vong doi hat tuyet: Roi -> Dong -> Nam random -> Tan chy -> Tai sinh
              snowAge: 0,
              meltDelay: 0,
              melting: false,
              meltT: 0,
              gone: false,
              onProp: false,
              footR2: Math.pow(size * (0.55 + Math.random() * 0.25), 2),
              sphereR: size / 2 // nắp cầu: lớp tuyết sau đọng lên đây
            };
            p.restY = restYAnToan(p.x, p.z);
            if (p.y <= p.restY) p.y = p.restY + 0.01; // sinh dưới nóc đồ: nhấc lên trên nóc
            arr.push(p);
            ent.setPosition(p.x, p.y, p.z);
          }
          api.__lastSpawned = arr; // danh dau effect nay co he thong hat that

          if (autoFall) {
            // Physics mặc định chạy mỗi khung hình. Đầy đủ vòng đời hạt:
            //   RÔI (gió + bồng bềnh) -> CHẠM BỀ MẶT (restY ĐỘNG: hạt bám theo nóc
            //   đồ vật ngay cả khi hạt trôi ngang vào, và ĐỌNG CHỒNG LỚP lên hạt
            //   tuyết đã nằm dưới) -> NẰM MỘT THỜI GIAN RANDOM -> TAN CHẢY (co
            //   nhỏ dần rồi biến mất) -> TÁI SINH ở đỉnh -> rơi tiếp. Kết quả:
            //   tuyết RƠI LIÊN TỤC, phủ dần và tích tụ trên đồ vật.
            const meltMin = Math.max(Number(o.meltMin) || 4, 0.5);   // giây nằm tối thiểu
            const meltMax = Math.max(Number(o.meltMax) || 12, meltMin + 0.5); // giây nằm tối đa
            const meltScale = Math.max(Number(o.meltScale) || 0.25, 0.01); // tốc độ co hạt khi tan
            const respawnJitter = Math.max(Number(o.respawnJitter) || 0.6, 0); // độ trễ tái sinh
            const recycle = !settle; // mưa/lá: chạm bề mặt là quay về đỉnh ngay

            // restY ĐỘNG: tính lại độ cao bề mặt ngay dưới hạt MỖI KHUNG HÌNH từ
            // AABB mesh (đồ vật có thể bị kéo đi) + CHỒNG LỚP trên hạt đã đọng.
            const dynamicRestY = (x: number, z: number, self: any): number => {
              let rest = restYAnToan(x, z);
              for (const q of arr) {
                if (q === self || !q.settled || q.melting) continue;
                const dx = x - q.x, dz = z - q.z;
                if (dx * dx + dz * dz <= q.footR2) {
                  const surfQ = q.y + q.sphereR; // đọng chồng lên NẮP CẦU của hạt dưới (hạt sát sàn y=0 vẫn tính)
                  if (surfQ > rest) rest = surfQ;
                }
              }
              return rest;
            };

            tickFns.push((dt: number) => {
              for (const p of arr) {
                if (p.gone) continue;

                if (p.settled && !p.melting) {
                  // đang nằm trên bề mặt: đếm thời gian random rồi bắt đầu TAN
                  p.snowAge += dt;
                  // bám theo bề mặt động: nếu nóc đồ dưới chân thay đổi (kéo đồ),
                  // hạt trượt theo — không rơi xuyên hay lơ lửng.
                  const surf = dynamicRestY(p.x, p.z, p);
                  if (surf > p.y + 0.02) { p.y = surf; } // nền dâng lên: nâng hạt theo
                  else if (surf < p.y - 0.02) { p.y = Math.max(surf, p.y - dt * 2.5); } // nền hạ/thay đổi: hạt sà theo bề mặt
                  if (p.snowAge >= p.meltDelay) { p.melting = true; }
                  try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { p.gone = true; }
                  continue;
                }

                if (p.melting) {
                  // TAN CHẢY: co dần kích thước rồi biến mất + tái sinh ở đỉnh.
                  p.meltT += dt;
                  const s = Math.max(0.02, 1 - p.meltT * meltScale);
                  try { p.node.setLocalScale(s, s, s); } catch (e2) { p.gone = true; }
                  if (s <= 0.021 || p.meltT > 4.5) {
                    // TÁI SINH: hạt quay lại đỉnh vùng rơi với kích thước gốc.
                    const ang2 = Math.random() * Math.PI * 2;
                    const r2 = Math.sqrt(Math.random()) * radius;
                    p.x = center.x + Math.cos(ang2) * r2;
                    p.z = center.z + Math.sin(ang2) * r2;
                    p.y = hasHost ? Math.max(center.y, restYAt(p.x, p.z)) + 6 + Math.random() * 3
                                  : topY * (0.85 + 0.15 * Math.random());
                    p.vx = windX + (Math.random() - 0.5) * 0.4;
                    p.vz = windZ + (Math.random() - 0.5) * 0.4;
                    p.ph = Math.random() * Math.PI * 2;
                    p.settled = false;
                    p.melting = false;
                    p.meltT = 0;
                    p.snowAge = 0;
                    p.meltDelay = meltMin + Math.random() * (meltMax - meltMin);
                    p.onProp = false;
                    try { p.node.setLocalScale(1, 1, 1); } catch (e3) { p.gone = true; }
                  }
                  try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { p.gone = true; }
                  continue;
                }

                // ---- đang RƠI ----
                p.x += (p.vx || 0) * dt + Math.sin(p.ph) * 0.12 * dt;
                p.z += (p.vz || 0) * dt + Math.cos(p.ph * 0.8) * 0.12 * dt;
                p.y += (p.vy || -1.5) * dt;
                p.ph += dt * 2.2;
                const restD = dynamicRestY(p.x, p.z, p);
                if (p.y <= restD) {
                  p.y = restD;
                  p.restY = restD;
                  if (recycle) {
                    // mưa/lá: chạm là quay về đỉnh, không nằm
                    p.y = topY * (0.9 + 0.1 * Math.random());
                  } else {
                    // TUYẾT: ĐỌNG LẠI, bắt đầu đếm thời gian tan ngẫu nhiên
                    p.settled = true;
                    p.snowAge = 0;
                    p.meltDelay = meltMin + Math.random() * (meltMax - meltMin);
                    p.onProp = restYAnToan(p.x, p.z) > 0.05; // nóc đồ theo HÌNH HỌC (lớp tuyết chồng trên sàn không tính là đồ)
                  }
                }
                try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { p.gone = true; }
              }
            });
          }
          return arr;
        }
      };

      try {
        const fn = new Function('fx', 'pc', '"use strict";\n' + normalizeFxScript(cmd.script) +
          '\n;(function(){ if (typeof effect === "function") { effect(fx); } else if (typeof init === "function") { init(fx); } })();');
        fn(api, pc);
      } catch (e) {
        console.warn('[SontinhScene] Effect script error:', e);
        try { fxRoot.destroy(); } catch (e2) { /* ignore */ }
        return false;
      }

      // ===== FIX "import script tuyet ma khong co hat nao roi" =====
      // Nhung script copy tu PlayCanvas Editor/web dat ten "tuyet roi" nhung
      // thuc chat chi PHU TRANG material (vd SnowAccumulation: doi mau san
      // dan dan theo thoi gian) — khong spawn hat nao ca. Nguoi dung thay
      // gi do tuyet roi la khong co. Runtime nhan dien y dinh tu ten effect
      // + noi dung script: neu co tin hieu TUYET ma trong effect khong co
      // he thong hat nao (khong spawnParticles, khong tick di chuyen) thi
      // tu them mot lop hat tuyet roi chuan (roi tu tren cao, dung lai khi
      // cham san/do vat) de dam bao ket qua nhin thay duoc.
      try {
        const lowName = fxName.toLowerCase();
        const lowScript = String(cmd.script || '').toLowerCase();
        const snowSignal = /snow|tuyet|tuy\u1ebft|tuy\u00ea/.test(lowName) ||
          /snow|snowfall|snowflake/.test(lowScript) || /tuyet|tuy\u1ebft/.test(lowScript);
        const hasParticleSystem = Array.isArray(api.__lastSpawned) && api.__lastSpawned.length > 0;
        // Chu y: khong xet tickFns.length — script chi phu material van co
        // update() (tang snowAmount) nen tickFns > 0 la BINH THUONG. Chi can
        // script chua spawn hat nao thi them lop hat roi song song voi viec
        // phu trang material (roi tuyet + san trang dan = dung y tuyet roi).
        if (snowSignal && !hasParticleSystem) {
          console.log('[SontinhScene] Script chi phu material (khong co hat) — tu them lop hat tuyet roi chuan.');
          const hostTargeted = !!(hostEntity && !hostIsFloor);
          api.spawnParticles({
            count: 600,
            size: 0.14,
            color: '#ffffff',
            opacity: 0.92,
            radius: hostTargeted ? 4.5 : 15,
            fallSpeed: 1.6,
            settle: true,
            // Vong doi day du: dong lai -> nam 4-12 giay random -> tan chay
            // -> tai sinh o dinh -> roi tiep. Tuyet ROI LIEN TUC chu khong cau.
            meltMin: 4,
            meltMax: 12,
            meltScale: 0.25
          });
        }
      } catch (e) {
        console.warn('[SontinhScene] Snow auto-layer fallback loi (bo qua):', e);
      }

      activeEffects.set(fxName, { root: fxRoot, tickFns, mis });
      console.log('[SontinhScene] Effect started:', fxName, '— tickFns:', tickFns.length);
      return true;
    }

    this._runPropEffect = runPropEffect;
    this._stopPropEffect = stopPropEffect;

    this.app = app;

    // Expose charBodyRoot reference for applyProfile()
    // charBodyRoot is declared in the scene body as: const charBodyRoot = new pc.Entity('CharBodyRoot');
    // We grab it by name after the scene is set up
    setTimeout(() => {
      if (app && !this._destroyed) {
        const found = app.root.findByName('Char_BodyRoot') || app.root.findByName('CharBodyRoot') || app.root.findByName('Char_Yen_Root');
        if (found) this._charBodyRoot = found as pc.Entity;
      }
    }, 500);

    // Apply profile after scene init if one was provided at init time
    if (this._profile) {
      setTimeout(() => {
        if (this._profile) this.applyProfile(this._profile);
      }, 1500); // Wait for character to load
    }
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    if (this.app) {
      try {
        this.app.destroy();
      } catch (e) {
        console.warn('[SontinhScene] App destroy warning:', e);
      }
      this.app = null;
    }
  }

  destroyScene(): void {
    this.ngOnDestroy();
  }
}
