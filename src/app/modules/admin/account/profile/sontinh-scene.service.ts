import { Injectable, NgZone, OnDestroy } from '@angular/core';
import * as pc from 'playcanvas';
import { UserProfile } from './profile-data.service';

/** Meta mot thuoc tinh dong cua effect script (parse tu attributes.add hoac fx.params) */
export interface FxParamMeta { name: string; type: string; value: any; title: string; min?: number; max?: number; step?: number; }

export interface CaptureScenePropInfo {
  id: string;
  name: string;
  hasRig: boolean;
  /** true nếu nhân vật/đồ vật thực sự đang chạy hành động (clip/keyframe chuyển động); false nếu đang đứng yên ở 1 tư thế tĩnh */
  hasActiveMotion?: boolean;
  screenZone: 'left' | 'center' | 'right';
  depthLayer: 'front' | 'mid' | 'back';
  screenX: number;
  camDepth: number;
}

export interface CaptureSceneSummary {
  props: CaptureScenePropInfo[];
  fxNames: string[];
}

export interface CameraKeyframe {
  id: string;
  time: number;
  label?: string;
  pivot: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  distance: number;
  easing?: 'smooth' | 'linear';
}

export interface GlbBoneKeyframe {
  id: string;
  time: number;
  boneName: string;
  rot: { x: number; y: number; z: number };
  pos: { x: number; y: number; z: number };
}

export interface GlbPropGrabConstraint {
  id: string;
  /** ID của đồ vật bị nắm trong cảnh */
  targetPropId: string;
  /** Tay nắm: 'right' | 'left' */
  hand: 'right' | 'left';
  /** Thời điểm (giây) bàn tay bắt đầu nắm dính đồ vật */
  grabTime: number;
  /** Thời điểm (giây) thả đồ vật (null/undefined = giữ tới hết clip) */
  releaseTime?: number | null;
  /** Offset vị trí (đơn vị world) trong hệ xoay của xương bàn tay */
  localOffset: { x: number; y: number; z: number };
  /** Độ lệch góc xoay (Quaternion xyzw) giữa xương bàn tay và đồ vật */
  localRotOffset: { x: number; y: number; z: number; w: number };
  /** Vị trí & góc xoay world gốc của đồ vật trước khi bị nắm */
  restWorldPos: { x: number; y: number; z: number };
  restWorldRot: { x: number; y: number; z: number };
  /** Vị trí & góc xoay world tại thời điểm thả (nếu có releaseTime) */
  releaseWorldPos?: { x: number; y: number; z: number };
  releaseWorldRot?: { x: number; y: number; z: number };
}

export interface GlbSavedKeyframeClip {
  name: string;
  duration: number;
  loop?: boolean;
  speed?: number;
  /** Không gian tư thế tham chiếu: 'tpose' = chuẩn hóa về T-Pose giải phẫu (retarget chính xác giữa A-Pose/T-Pose & mọi số lượng khớp), 'rest' = tư thế nghỉ gốc */
  poseSpace?: 'tpose' | 'rest';
  createdAt?: string;
  /** Câu lệnh gốc và kế hoạch biên đạo segments do AI tạo (để lần sau AI có thể chỉnh sửa chính xác từng chi tiết nhỏ) */
  aiPrompt?: string;
  aiSegments?: any[];
  /** Các ràng buộc nắm/cầm đồ vật gắn kèm clip */
  handGrabs?: GlbPropGrabConstraint[];
  keyframes: GlbBoneKeyframe[];
}

export interface GlbBonePoseEntry {
  boneName: string;
  rot: { x: number; y: number; z: number };
  pos?: { x: number; y: number; z: number };
}

export interface GlbSavedPose {
  id: string;
  name: string;
  poseSpace?: 'tpose' | 'rest';
  createdAt?: number;
  bones: GlbBonePoseEntry[];
}

export interface GlbPropTimelineData {
  enabled: boolean;
  playing: boolean;
  loop: boolean;
  speed: number;
  duration: number;
  mode: 'keyframes' | 'clip';
  /** Khóa chuyển động tại chỗ (triệt tiêu trôi ngang X/Z của xương gốc Hips, giữ nguyên nhảy/nhún trục Y). Mặc định true */
  inPlace?: boolean;
  /** Không gian tư thế tham chiếu cho keyframes đang phát ('tpose' | 'rest') */
  poseSpace?: 'tpose' | 'rest';
  /** Mốc thời gian đang dừng trên Timeline (giữ nguyên qua F5) */
  savedTime?: number;
  /** Ảnh chụp tư thế tĩnh hiện tại của các khớp xương (giữ nguyên tư thế qua F5) */
  staticPose?: GlbBonePoseEntry[];
  /** Danh sách các Tư thế đã lưu để áp dụng lại bằng 1 chạm */
  savedPoses?: GlbSavedPose[];
  activeClipName?: string | null;
  keyframes: GlbBoneKeyframe[];
  savedClips?: GlbSavedKeyframeClip[];
  /** Bản đồ đổi tên hiển thị cho các Clip gốc nhúng sẵn trong file GLB (rawName -> displayName) */
  clipAliases?: Record<string, string>;
  /** Ngữ cảnh kế hoạch AI gần nhất đang gắn với timeline hiện tại */
  lastAiPrompt?: string;
  lastAiSegments?: any[];
  /** Ràng buộc tay nhân vật nắm/cầm đồ vật khác trong cảnh theo thời gian */
  handGrabs?: GlbPropGrabConstraint[];
}

export interface GlbBoneInfo {
  name: string;
  label: string;
  depth: number;
  isSkinnedBone: boolean;
}

export interface VideoFramePoseSample {
  time: number;
  cx: number;
  cy: number;
  torsoTurnY: number;
  torsoLeanZ: number;
  torsoPitchX: number;
  leftArmLift: number;
  rightArmLift: number;
  leftArmFwd: number;
  rightArmFwd: number;
  leftElbowBend: number;
  rightElbowBend: number;
  leftLegPitch: number;
  rightLegPitch: number;
  leftKneeBend: number;
  rightKneeBend: number;
  energy: number;
}

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
  boneTimeline?: GlbPropTimelineData;
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
export interface StudioLightingConfig {
  preset: string;
  exposure: number;
  toneMapping: 'neutral' | 'aces2' | 'filmic' | 'linear';
  envIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  keyEnabled: boolean;
  keyColor: string;
  keyIntensity: number;
  keyPitch: number;
  keyYaw: number;
  fillEnabled: boolean;
  fillColor: string;
  fillIntensity: number;
  rimEnabled: boolean;
  rimColor: string;
  rimIntensity: number;
  shadowsEnabled: boolean;
  shadowIntensity: number;
  shadowSoftness: 'soft' | 'crisp';
  bgColor: string;
  showGrid: boolean;
  showFloorShadow: boolean;
}

export interface StudioLightingPreset {
  id: string;
  name: string;
  swatchA: string;
  swatchB: string;
  config: Partial<StudioLightingConfig>;
}

export const DEFAULT_STUDIO_LIGHTING: StudioLightingConfig = {
  preset: 'studio_bright',
  exposure: 1.15,
  toneMapping: 'neutral',
  envIntensity: 0.95,
  ambientColor: '#e2e8f0',
  ambientIntensity: 0.62,
  keyEnabled: true,
  keyColor: '#fff9f0',
  keyIntensity: 1.55,
  keyPitch: 48,
  keyYaw: 36,
  fillEnabled: true,
  fillColor: '#e0eeff',
  fillIntensity: 0.58,
  rimEnabled: true,
  rimColor: '#ffffff',
  rimIntensity: 0.65,
  shadowsEnabled: true,
  shadowIntensity: 0.45,
  shadowSoftness: 'soft',
  bgColor: '#ffffff',
  showGrid: true,
  showFloorShadow: true
};

export const STUDIO_LIGHTING_PRESETS: StudioLightingPreset[] = [
  {
    id: 'studio_bright',
    name: 'Studio Sáng',
    swatchA: '#ffffff',
    swatchB: '#fde68a',
    config: { ...DEFAULT_STUDIO_LIGHTING }
  },
  {
    id: 'soft_daylight',
    name: 'Ban Ngày',
    swatchA: '#e0f2fe',
    swatchB: '#fef08a',
    config: {
      preset: 'soft_daylight',
      exposure: 1.18,
      toneMapping: 'neutral',
      envIntensity: 1.1,
      ambientColor: '#dbeafe',
      ambientIntensity: 0.58,
      keyEnabled: true,
      keyColor: '#fff7e0',
      keyIntensity: 1.9,
      keyPitch: 55,
      keyYaw: 45,
      fillEnabled: true,
      fillColor: '#bae6fd',
      fillIntensity: 0.68,
      rimEnabled: true,
      rimColor: '#f8fafc',
      rimIntensity: 0.55,
      shadowsEnabled: true,
      shadowIntensity: 0.52,
      shadowSoftness: 'soft',
      bgColor: '#f0f7ff',
      showGrid: true,
      showFloorShadow: true
    }
  },
  {
    id: 'golden_hour',
    name: 'Hoàng Hôn',
    swatchA: '#fde68a',
    swatchB: '#fb923c',
    config: {
      preset: 'golden_hour',
      exposure: 1.12,
      toneMapping: 'aces2',
      envIntensity: 0.85,
      ambientColor: '#fed7aa',
      ambientIntensity: 0.42,
      keyEnabled: true,
      keyColor: '#ffb35c',
      keyIntensity: 2.35,
      keyPitch: 18,
      keyYaw: 62,
      fillEnabled: true,
      fillColor: '#c7d2fe',
      fillIntensity: 0.45,
      rimEnabled: true,
      rimColor: '#fde047',
      rimIntensity: 1.25,
      shadowsEnabled: true,
      shadowIntensity: 0.62,
      shadowSoftness: 'soft',
      bgColor: '#fdf3e7',
      showGrid: true,
      showFloorShadow: true
    }
  },
  {
    id: 'dark_studio',
    name: 'Studio Tối',
    swatchA: '#0f172a',
    swatchB: '#38bdf8',
    config: {
      preset: 'dark_studio',
      exposure: 1.2,
      toneMapping: 'aces2',
      envIntensity: 1.05,
      ambientColor: '#334155',
      ambientIntensity: 0.28,
      keyEnabled: true,
      keyColor: '#ffffff',
      keyIntensity: 2.1,
      keyPitch: 42,
      keyYaw: 32,
      fillEnabled: true,
      fillColor: '#60a5fa',
      fillIntensity: 0.48,
      rimEnabled: true,
      rimColor: '#38bdf8',
      rimIntensity: 1.45,
      shadowsEnabled: true,
      shadowIntensity: 0.72,
      shadowSoftness: 'soft',
      bgColor: '#0f172a',
      showGrid: true,
      showFloorShadow: true
    }
  },
  {
    id: 'dramatic',
    name: 'Điện Ảnh',
    swatchA: '#18181b',
    swatchB: '#f59e0b',
    config: {
      preset: 'dramatic',
      exposure: 1.1,
      toneMapping: 'filmic',
      envIntensity: 0.72,
      ambientColor: '#1e293b',
      ambientIntensity: 0.22,
      keyEnabled: true,
      keyColor: '#ffd199',
      keyIntensity: 2.45,
      keyPitch: 30,
      keyYaw: -48,
      fillEnabled: true,
      fillColor: '#0ea5e9',
      fillIntensity: 0.55,
      rimEnabled: true,
      rimColor: '#fbbf24',
      rimIntensity: 1.65,
      shadowsEnabled: true,
      shadowIntensity: 0.8,
      shadowSoftness: 'crisp',
      bgColor: '#14171f',
      showGrid: true,
      showFloorShadow: true
    }
  },
  {
    id: 'neon_cyber',
    name: 'Neon Cyber',
    swatchA: '#1e1b4b',
    swatchB: '#ec4899',
    config: {
      preset: 'neon_cyber',
      exposure: 1.22,
      toneMapping: 'aces2',
      envIntensity: 0.9,
      ambientColor: '#312e81',
      ambientIntensity: 0.34,
      keyEnabled: true,
      keyColor: '#f472b6',
      keyIntensity: 2.15,
      keyPitch: 36,
      keyYaw: 40,
      fillEnabled: true,
      fillColor: '#22d3ee',
      fillIntensity: 1.15,
      rimEnabled: true,
      rimColor: '#a78bfa',
      rimIntensity: 1.85,
      shadowsEnabled: true,
      shadowIntensity: 0.72,
      shadowSoftness: 'soft',
      bgColor: '#0b091a',
      showGrid: true,
      showFloorShadow: true
    }
  }
];

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
  private _applyStudioLightingFn: ((cfg: StudioLightingConfig) => void) | null = null;
  private _studioLighting: StudioLightingConfig = { ...DEFAULT_STUDIO_LIGHTING };
  private _lastAppliedProfileLightingKey = '';

  getStudioLighting(): StudioLightingConfig {
    return { ...this._studioLighting };
  }

  applyStudioLighting(patch: Partial<StudioLightingConfig>): StudioLightingConfig {
    this._studioLighting = {
      ...this._studioLighting,
      ...patch
    };
    if (this._applyStudioLightingFn) {
      this.ngZone.runOutsideAngular(() => {
        try { this._applyStudioLightingFn!(this._studioLighting); } catch (e) {
          console.warn('[SontinhScene] applyStudioLighting warning:', e);
        }
      });
    }
    return { ...this._studioLighting };
  }

  applyStudioLightingPreset(presetId: string): StudioLightingConfig {
    const found = STUDIO_LIGHTING_PRESETS.find((p) => p.id === presetId);
    if (!found) return this.getStudioLighting();
    return this.applyStudioLighting({ ...DEFAULT_STUDIO_LIGHTING, ...found.config, preset: found.id });
  }

  resetStudioLighting(): StudioLightingConfig {
    return this.applyStudioLighting({ ...DEFAULT_STUDIO_LIGHTING });
  }

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
    if (this._stopPropEffect) {
      this._stopPropEffect(fx.name);
      if (this.fxEffects.every((f) => f.enabled === false)) {
        this._stopPropEffect('*');
      }
    }
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
    this.fxEffects.splice(idx, 1);
    this._saveFxRegistry();
    // Ten goc — stopPropEffect tu chuan hoa de khop key "Tuy_t_r_i" trong map
    if (this._stopPropEffect) {
      this._stopPropEffect(fx.name);
      if (this.fxEffects.every((f) => f.enabled === false)) {
        this._stopPropEffect('*');
      }
    }
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

      // 2. Room Lighting & Studio Lighting Config
      if (profile.scene && this._toggleRoomLights) {
        this._toggleRoomLights(profile.scene.lightsOn);
      }
      const savedLighting = (profile.scene as any)?.lighting;
      if (savedLighting && typeof savedLighting === 'object' && this._applyStudioLightingFn) {
        const key = JSON.stringify(savedLighting);
        if (!opts?.skipCamera || key !== this._lastAppliedProfileLightingKey) {
          this._lastAppliedProfileLightingKey = key;
          this.applyStudioLighting(savedLighting);
        }
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

  private _texAlphaProfileCache = new WeakMap<object, 'opaque' | 'all_zero' | 'cutout' | 'translucent' | 'unknown'>();

  /**
   * Phan loai kenh alpha thuc te cua texture trong GLB de tranh truong hop
   * exporter gan nham alphaMode = BLEND (lam tat depthWrite va gay rach/xuyen tam giac).
   */
  private _classifyTextureAlpha(tex: any): 'opaque' | 'all_zero' | 'cutout' | 'translucent' | 'unknown' {
    if (!tex || typeof tex !== 'object') return 'unknown';
    const cached = this._texAlphaProfileCache.get(tex);
    if (cached) return cached;

    let result: 'opaque' | 'all_zero' | 'cutout' | 'translucent' | 'unknown' = 'unknown';
    try {
      const fmt = tex.format;
      if (
        fmt === pc.PIXELFORMAT_RGB8 ||
        fmt === (pc as any).PIXELFORMAT_SRGB ||
        fmt === pc.PIXELFORMAT_R5_G6_B5
      ) {
        result = 'opaque';
        this._texAlphaProfileCache.set(tex, result);
        return result;
      }

      const src = tex.getSource?.(0) ?? tex._levels?.[0];
      const isDrawable =
        (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) ||
        (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) ||
        (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) ||
        (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas);

      if (isDrawable) {
        const rawW = Number((src as any).width || (src as any).naturalWidth) || 0;
        const rawH = Number((src as any).height || (src as any).naturalHeight) || 0;
        if (rawW > 0 && rawH > 0) {
          const sw = Math.min(128, rawW);
          const sh = Math.min(128, rawH);
          const cv = document.createElement('canvas');
          cv.width = sw;
          cv.height = sh;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(src as CanvasImageSource, 0, 0, sw, sh);
            const data = ctx.getImageData(0, 0, sw, sh).data;
            const total = sw * sh;
            let minA = 255;
            let maxA = 0;
            let transparentCount = 0;
            let opaqueCount = 0;
            let midCount = 0;

            for (let i = 3; i < data.length; i += 4) {
              const a = data[i];
              if (a < minA) minA = a;
              if (a > maxA) maxA = a;
              if (a <= 15) transparentCount++;
              else if (a >= 240) opaqueCount++;
              else midCount++;
            }

            if (maxA <= 5) {
              result = 'all_zero';
            } else if (minA >= 248) {
              result = 'opaque';
            } else if (opaqueCount < total * 0.35 && midCount > total * 0.30) {
              result = 'translucent';
            } else {
              result = 'cutout';
            }
          }
          cv.width = 1;
          cv.height = 1;
        }
      }
    } catch (_) {
      result = 'unknown';
    }

    this._texAlphaProfileCache.set(tex, result);
    return result;
  }

  /**
   * Tao envAtlas HDR (RGBM) thuat toan cho anh sang moi truong (IBL diffuse + GGX specular reflection),
   * giup cac chi tiet kim loai (ngoi sao, vien vang, charm, kinh, giap...) khong bi den tuyen
   * khi useMetalness = true, dong thoi giu nguyen nen clearColor cua camera (tat lop Skybox).
   */
  private _createProceduralEnvAtlas(device: any): pc.Texture | null {
    if (!device) return null;
    let skyTex: pc.Texture | null = null;
    let lightingSrc: pc.Texture | null = null;
    try {
      const w = 128;
      const h = 64;
      skyTex = new pc.Texture(device, {
        name: 'proceduralStudioEnvEquirect',
        width: w,
        height: h,
        format: pc.PIXELFORMAT_RGBA8,
        type: pc.TEXTURETYPE_RGBM,
        projection: pc.TEXTUREPROJECTION_EQUIRECT,
        addressU: pc.ADDRESS_REPEAT,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        mipmaps: false
      });

      const pixels = skyTex.lock() as Uint8Array;
      const sunX = 0.4472, sunY = 0.6859, sunZ = 0.5740;
      const fillX = -0.5345, fillY = 0.4454, fillZ = -0.7181;

      for (let y = 0; y < h; y++) {
        // flipY = true mac dinh trong PlayCanvas -> y = 0 la dinh bau troi (+Y), y = h - 1 la mat san (-Y)
        const v = (y + 0.5) / h;
        const theta = v * Math.PI;
        const sinT = Math.sin(theta);
        const dirY = Math.cos(theta);

        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w;
          const phi = (u * 2.0 - 1.0) * Math.PI;
          const dirX = sinT * Math.cos(phi);
          const dirZ = sinT * Math.sin(phi);

          let lr: number, lg: number, lb: number;
          if (dirY >= 0) {
            const t = Math.pow(dirY, 0.65);
            lr = 0.78 * (1.0 - t) + 0.62 * t;
            lg = 0.80 * (1.0 - t) + 0.74 * t;
            lb = 0.84 * (1.0 - t) + 0.94 * t;
          } else {
            const t = Math.min(1.0, Math.pow(-dirY, 0.75));
            lr = 0.78 * (1.0 - t) + 0.38 * t;
            lg = 0.80 * (1.0 - t) + 0.36 * t;
            lb = 0.84 * (1.0 - t) + 0.33 * t;
          }

          const dotSun = Math.max(0, dirX * sunX + dirY * sunY + dirZ * sunZ);
          if (dotSun > 0) {
            const specLobe = Math.pow(dotSun, 24) * 2.4 + Math.pow(dotSun, 4) * 0.28;
            lr += specLobe * 1.0;
            lg += specLobe * 0.96;
            lb += specLobe * 0.88;
          }

          const dotFill = Math.max(0, dirX * fillX + dirY * fillY + dirZ * fillZ);
          if (dotFill > 0) {
            const fillLobe = Math.pow(dotFill, 8) * 0.45;
            lr += fillLobe * 0.86;
            lg += fillLobe * 0.92;
            lb += fillLobe * 1.0;
          }

          // Ma hoa RGBM cua PlayCanvas: decodeRGBM(raw) = ((8.0 * raw.a) * raw.rgb)^2
          const sr = Math.sqrt(Math.max(0, lr));
          const sg = Math.sqrt(Math.max(0, lg));
          const sb = Math.sqrt(Math.max(0, lb));
          const maxS = Math.min(1.0, Math.max(sr, sg, sb, 1e-4) / 8.0);
          const aByte = Math.max(1, Math.min(255, Math.ceil(maxS * 255)));
          const denom = 8.0 * (aByte / 255.0);

          const off = (y * w + x) * 4;
          pixels[off] = Math.min(255, Math.round((sr / denom) * 255));
          pixels[off + 1] = Math.min(255, Math.round((sg / denom) * 255));
          pixels[off + 2] = Math.min(255, Math.round((sb / denom) * 255));
          pixels[off + 3] = aByte;
        }
      }
      skyTex.unlock();

      const envLighting = (pc as any).EnvLighting;
      if (!envLighting?.generateAtlas) {
        skyTex.destroy();
        return null;
      }
      lightingSrc = envLighting.generateLightingSource
        ? envLighting.generateLightingSource(skyTex)
        : null;
      const atlas: pc.Texture = envLighting.generateAtlas(lightingSrc || skyTex);
      if (lightingSrc) lightingSrc.destroy();
      skyTex.destroy();
      return atlas;
    } catch (_) {
      try { if (lightingSrc) lightingSrc.destroy(); } catch (__) {}
      try { if (skyTex) skyTex.destroy(); } catch (__) {}
      return null;
    }
  }

  private _applySceneEnvAtlas(scene: any, envAtlas: pc.Texture | null, intensity = 0.95): void {
    if (!scene || !envAtlas) return;
    try {
      scene.envAtlas = envAtlas;
      scene.skyboxIntensity = intensity;
      const skyLayer =
        scene.layers?.getLayerById?.(pc.LAYERID_SKYBOX) ??
        scene.layers?.getLayerByName?.('Skybox');
      if (skyLayer) {
        skyLayer.enabled = false;
      }
    } catch (_) {}
  }

  private _makeOrthonormalTangent(nx: number, ny: number, nz: number): [number, number, number, number] {
    let rx = 0, ry = 1, rz = 0;
    if (Math.abs(ny) > 0.99) {
      rx = 1; ry = 0; rz = 0;
    }
    const tx = ry * nz - rz * ny;
    const ty = rz * nx - rx * nz;
    const tz = rx * ny - ry * nx;
    const len = Math.hypot(tx, ty, tz) || 1;
    return [tx / len, ty / len, tz / len, 1.0];
  }

  /**
   * Han kin vi khe ho bien UV seam tren mang POSITION (giu nguyen so luong dinh, thu tu dinh va UV,
   * kiem tra nghiem ngat khong suy bien canh va khong lam lech phap tuyen mat > 28 do).
   */
  private _weldOpenBoundaryPositions(
    pos: Float32Array,
    numVerts: number,
    indexViews: ArrayLike<number>[],
    diag: number
  ): boolean {
    const exactInv = 1.0 / Math.max(diag * 1e-6, 1e-9);
    const posIdOfVert = new Int32Array(numVerts);
    const uniqueCoords: number[] = [];
    const posKeyMap = new Map<string, number>();

    for (let v = 0; v < numVerts; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const k = `${Math.round(x * exactInv)},${Math.round(y * exactInv)},${Math.round(z * exactInv)}`;
      let pid = posKeyMap.get(k);
      if (pid === undefined) {
        pid = uniqueCoords.length / 3;
        posKeyMap.set(k, pid);
        uniqueCoords.push(x, y, z);
      }
      posIdOfVert[v] = pid;
    }

    const numPos = uniqueCoords.length / 3;
    if (numPos < 4) return false;

    const edgeCounts = new Map<string, number>();
    const adjSet: Array<Set<number> | undefined> = new Array(numPos);
    const allTrisPos: Array<{
      p0: number; p1: number; p2: number;
      area2: number; ux: number; uy: number; uz: number;
    }> = [];

    const makeEdgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const addAdj = (a: number, b: number) => {
      if (!adjSet[a]) adjSet[a] = new Set<number>();
      if (!adjSet[b]) adjSet[b] = new Set<number>();
      adjSet[a]!.add(b);
      adjSet[b]!.add(a);
    };

    for (const idx of indexViews) {
      const nTri = Math.floor(idx.length / 3);
      for (let t = 0; t < nTri; t++) {
        const p0 = posIdOfVert[idx[t * 3]];
        const p1 = posIdOfVert[idx[t * 3 + 1]];
        const p2 = posIdOfVert[idx[t * 3 + 2]];
        if (p0 === p1 || p1 === p2 || p2 === p0) continue;

        const ax = uniqueCoords[p0 * 3], ay = uniqueCoords[p0 * 3 + 1], az = uniqueCoords[p0 * 3 + 2];
        const bx = uniqueCoords[p1 * 3], by = uniqueCoords[p1 * 3 + 1], bz = uniqueCoords[p1 * 3 + 2];
        const cx = uniqueCoords[p2 * 3], cy = uniqueCoords[p2 * 3 + 1], cz = uniqueCoords[p2 * 3 + 2];
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        const fnx = e1y * e2z - e1z * e2y;
        const fny = e1z * e2x - e1x * e2z;
        const fnz = e1x * e2y - e1y * e2x;
        const area2 = Math.hypot(fnx, fny, fnz);
        if (area2 < 1e-12 * diag * diag) continue;

        const k01 = makeEdgeKey(p0, p1);
        const k12 = makeEdgeKey(p1, p2);
        const k20 = makeEdgeKey(p2, p0);
        edgeCounts.set(k01, (edgeCounts.get(k01) || 0) + 1);
        edgeCounts.set(k12, (edgeCounts.get(k12) || 0) + 1);
        edgeCounts.set(k20, (edgeCounts.get(k20) || 0) + 1);
        addAdj(p0, p1);
        addAdj(p1, p2);
        addAdj(p2, p0);

        allTrisPos.push({
          p0, p1, p2, area2,
          ux: fnx / area2, uy: fny / area2, uz: fnz / area2
        });
      }
    }

    const isOpenPos = new Uint8Array(numPos);
    const openEdges: Array<[number, number]> = [];
    edgeCounts.forEach((cnt, key) => {
      if (cnt === 1) {
        const sep = key.indexOf('_');
        const a = Number(key.slice(0, sep));
        const b = Number(key.slice(sep + 1));
        isOpenPos[a] = 1;
        isOpenPos[b] = 1;
        openEdges.push([a, b]);
      }
    });

    const openList: number[] = [];
    for (let p = 0; p < numPos; p++) {
      if (isOpenPos[p]) openList.push(p);
    }
    if (openList.length < 2) return false;

    const incidentTris = new Map<number, typeof allTrisPos>();
    for (const tr of allTrisPos) {
      for (const vp of [tr.p0, tr.p1, tr.p2]) {
        if (!isOpenPos[vp]) continue;
        let arr = incidentTris.get(vp);
        if (!arr) { arr = []; incidentTris.set(vp, arr); }
        arr.push(tr);
      }
    }

    const curCoords = new Float64Array(uniqueCoords);
    const parent = new Int32Array(numPos);
    for (let i = 0; i < numPos; i++) parent[i] = i;
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };

    const checkMoveValid = (movedSet: Set<number>, nx: number, ny: number, nz: number): boolean => {
      for (const pid of movedSet) {
        const tris = incidentTris.get(pid);
        if (!tris) continue;
        for (const tr of tris) {
          const r0 = find(tr.p0), r1 = find(tr.p1), r2 = find(tr.p2);
          const m0 = movedSet.has(r0), m1 = movedSet.has(r1), m2 = movedSet.has(r2);
          if ((m0 && m1) || (m1 && m2) || (m0 && m2)) return false;
          const ax = m0 ? nx : curCoords[r0 * 3], ay = m0 ? ny : curCoords[r0 * 3 + 1], az = m0 ? nz : curCoords[r0 * 3 + 2];
          const bx = m1 ? nx : curCoords[r1 * 3], by = m1 ? ny : curCoords[r1 * 3 + 1], bz = m1 ? nz : curCoords[r1 * 3 + 2];
          const cx = m2 ? nx : curCoords[r2 * 3], cy = m2 ? ny : curCoords[r2 * 3 + 1], cz = m2 ? nz : curCoords[r2 * 3 + 2];
          const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
          const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
          const fnx = e1y * e2z - e1z * e2y;
          const fny = e1z * e2x - e1x * e2z;
          const fnz = e1x * e2y - e1y * e2x;
          const newArea2 = Math.hypot(fnx, fny, fnz);
          if (newArea2 < tr.area2 * 0.45) return false;
          const dot = (fnx * tr.ux + fny * tr.uy + fnz * tr.uz) / newArea2;
          if (dot < 0.88) return false;
        }
      }
      return true;
    };

    const weldEps = diag * 0.003;
    const weldEpsSq = weldEps * weldEps;
    const invCell = 1.0 / weldEps;
    const grid = new Map<string, number[]>();

    for (const pid of openList) {
      const gk = `${Math.floor(curCoords[pid * 3] * invCell)},${Math.floor(curCoords[pid * 3 + 1] * invCell)},${Math.floor(curCoords[pid * 3 + 2] * invCell)}`;
      let cell = grid.get(gk);
      if (!cell) { cell = []; grid.set(gk, cell); }
      cell.push(pid);
    }

    const pairs: Array<{ a: number; b: number; d2: number }> = [];
    for (const a of openList) {
      const ax = curCoords[a * 3], ay = curCoords[a * 3 + 1], az = curCoords[a * 3 + 2];
      const gx = Math.floor(ax * invCell), gy = Math.floor(ay * invCell), gz = Math.floor(az * invCell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cell = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
            if (!cell) continue;
            for (const b of cell) {
              if (b <= a || adjSet[a]?.has(b)) continue;
              const ddx = curCoords[b * 3] - ax, ddy = curCoords[b * 3 + 1] - ay, ddz = curCoords[b * 3 + 2] - az;
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 <= weldEpsSq) pairs.push({ a, b, d2 });
            }
          }
        }
      }
    }

    pairs.sort((p, q) => p.d2 - q.d2);
    const clusterMembers = new Map<number, number[]>();
    for (const pid of openList) clusterMembers.set(pid, [pid]);

    let changed = false;
    for (const pr of pairs) {
      const ra = find(pr.a), rb = find(pr.b);
      if (ra === rb) continue;
      const memA = clusterMembers.get(ra) || [ra];
      const memB = clusterMembers.get(rb) || [rb];
      if (memA.length + memB.length > 8) continue;

      let sharesEdge = false;
      for (const ma of memA) {
        const adj = adjSet[ma];
        if (!adj) continue;
        for (const mb of memB) {
          if (adj.has(mb)) { sharesEdge = true; break; }
        }
        if (sharesEdge) break;
      }
      if (sharesEdge) continue;

      const ddx = curCoords[rb * 3] - curCoords[ra * 3];
      const ddy = curCoords[rb * 3 + 1] - curCoords[ra * 3 + 1];
      const ddz = curCoords[rb * 3 + 2] - curCoords[ra * 3 + 2];
      if (ddx * ddx + ddy * ddy + ddz * ddz > weldEpsSq) continue;

      const mx = 0.5 * (curCoords[ra * 3] + curCoords[rb * 3]);
      const my = 0.5 * (curCoords[ra * 3 + 1] + curCoords[rb * 3 + 1]);
      const mz = 0.5 * (curCoords[ra * 3 + 2] + curCoords[rb * 3 + 2]);
      const movedSet = new Set<number>([...memA, ...memB, ra, rb]);
      if (!checkMoveValid(movedSet, mx, my, mz)) continue;

      parent[rb] = ra;
      for (const mb of memB) memA.push(mb);
      for (const m of memA) {
        curCoords[m * 3] = mx;
        curCoords[m * 3 + 1] = my;
        curCoords[m * 3 + 2] = mz;
      }
      clusterMembers.delete(rb);
      changed = true;
    }

    // Khep khe T-junction nho (<= 0.002 * diag)
    const tEps = diag * 0.002;
    const tEpsSq = tEps * tEps;
    const tInvCell = 1.0 / tEps;
    const tGrid = new Map<string, number[]>();
    const seenRoot = new Set<number>();
    for (const pid of openList) {
      const r = find(pid);
      if (seenRoot.has(r)) continue;
      seenRoot.add(r);
      const gk = `${Math.floor(curCoords[r * 3] * tInvCell)},${Math.floor(curCoords[r * 3 + 1] * tInvCell)},${Math.floor(curCoords[r * 3 + 2] * tInvCell)}`;
      let cell = tGrid.get(gk);
      if (!cell) { cell = []; tGrid.set(gk, cell); }
      cell.push(r);
    }

    const maxSegLenSq = (diag * 0.15) * (diag * 0.15);
    const minSegLenSq = (tEps * 1.5) * (tEps * 1.5);
    for (const [e0, e1] of openEdges) {
      const r0 = find(e0), r1 = find(e1);
      if (r0 === r1) continue;
      const ax = curCoords[r0 * 3], ay = curCoords[r0 * 3 + 1], az = curCoords[r0 * 3 + 2];
      const bx = curCoords[r1 * 3], by = curCoords[r1 * 3 + 1], bz = curCoords[r1 * 3 + 2];
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const lenSq = abx * abx + aby * aby + abz * abz;
      if (lenSq < minSegLenSq || lenSq > maxSegLenSq) continue;

      const minGx = Math.floor((Math.min(ax, bx) - tEps) * tInvCell);
      const maxGx = Math.floor((Math.max(ax, bx) + tEps) * tInvCell);
      const minGy = Math.floor((Math.min(ay, by) - tEps) * tInvCell);
      const maxGy = Math.floor((Math.max(ay, by) + tEps) * tInvCell);
      const minGz = Math.floor((Math.min(az, bz) - tEps) * tInvCell);
      const maxGz = Math.floor((Math.max(az, bz) + tEps) * tInvCell);
      if ((maxGx - minGx + 1) * (maxGy - minGy + 1) * (maxGz - minGz + 1) > 512) continue;

      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
          for (let gz = minGz; gz <= maxGz; gz++) {
            const cell = tGrid.get(`${gx},${gy},${gz}`);
            if (!cell) continue;
            for (const rp of cell) {
              if (rp === r0 || rp === r1) continue;
              const px = curCoords[rp * 3], py = curCoords[rp * 3 + 1], pz = curCoords[rp * 3 + 2];
              const t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
              if (t <= 0.05 || t >= 0.95) continue;
              const qx = ax + t * abx, qy = ay + t * aby, qz = az + t * abz;
              const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy) + (pz - qz) * (pz - qz);
              if (d2 > tEpsSq) continue;
              const memP = clusterMembers.get(rp) || [rp];
              let shares = false;
              for (const mp of memP) {
                if (adjSet[mp]?.has(r0) || adjSet[mp]?.has(r1) || adjSet[mp]?.has(e0) || adjSet[mp]?.has(e1)) {
                  shares = true;
                  break;
                }
              }
              if (shares) continue;
              const movedSet = new Set<number>([...memP, rp]);
              if (!checkMoveValid(movedSet, qx, qy, qz)) continue;
              for (const mp of movedSet) {
                curCoords[mp * 3] = qx;
                curCoords[mp * 3 + 1] = qy;
                curCoords[mp * 3 + 2] = qz;
              }
              changed = true;
            }
          }
        }
      }
    }

    if (!changed) return false;
    for (let v = 0; v < numVerts; v++) {
      const pid = posIdOfVert[v];
      if (!isOpenPos[pid]) continue;
      const r = find(pid);
      pos[v * 3] = curCoords[r * 3];
      pos[v * 3 + 1] = curCoords[r * 3 + 1];
      pos[v * 3 + 2] = curCoords[r * 3 + 2];
    }
    return true;
  }

  /**
   * Chuan hoa dong bo toan bo nhom pc.Mesh dung chung VertexBuffer:
   * - Han kin vi khe ho bien UV seam (mesh tinh).
   * - Loai bo tam giac suy bien va dao chieu quan (winding) de dot(fn, vn) >= 0 tuyet doi,
   *   tranh loi twoSidedLighting (!gl_FrontFacing) lat nguoc normal tao manh den.
   * - Khoi phuc vertex normal suy bien / nguoc chieu va lam muot seam tren mat cong.
   * - Bo sung hoac sua SEMANTIC_TANGENT truc chuan trong so dien tich 3D de khu nhieu dFdx/dFdy.
   */
  private _sanitizeVbMeshGroup(vb: any, meshes: pc.Mesh[], device?: any): number {
    if (!vb || !meshes.length) return 0;
    if (vb._glbVbGroupSanitized) {
      return Number(vb._glbDegUvRatio) || 0;
    }
    vb._glbVbGroupSanitized = true;

    let degUvRatio = 0;
    try {
      const fmt = vb.getFormat?.() ?? vb.format;
      const numVerts = vb.getNumVertices?.() ?? vb.numVertices ?? 0;
      const elements: any[] = fmt?.elements || [];
      if (numVerts <= 0 || !elements.length) return 0;

      const posEl = elements.find((e) => e.name === pc.SEMANTIC_POSITION && e.dataType === pc.TYPE_FLOAT32 && e.numComponents >= 3);
      const normEl = elements.find((e) => e.name === pc.SEMANTIC_NORMAL && e.dataType === pc.TYPE_FLOAT32 && e.numComponents >= 3);
      const uv0El = elements.find((e) => e.name === pc.SEMANTIC_TEXCOORD0 && e.dataType === pc.TYPE_FLOAT32 && e.numComponents >= 2);
      const tanEl = elements.find((e) => e.name === pc.SEMANTIC_TANGENT && e.dataType === pc.TYPE_FLOAT32 && e.numComponents >= 4);
      const colEl = elements.find((e) => e.name === pc.SEMANTIC_COLOR && e.dataType === pc.TYPE_FLOAT32 && e.numComponents >= 3);

      const hasSkin =
        meshes.some((m) => !!(m as any).skin) ||
        elements.some((e) => e.name === pc.SEMANTIC_BLENDINDICES || e.name === pc.SEMANTIC_BLENDWEIGHT);
      const hasMorph = meshes.some((m) => !!(m as any).morph);

      const vbRaw = vb.lock?.();
      if (!vbRaw) return 0;
      const vbBytes = ArrayBuffer.isView(vbRaw)
        ? new Uint8Array(vbRaw.buffer, vbRaw.byteOffset, vbRaw.byteLength)
        : new Uint8Array(vbRaw as ArrayBuffer);
      if (vbBytes.byteLength < 12) return 0;
      const vbDv = new DataView(vbBytes.buffer, vbBytes.byteOffset, vbBytes.byteLength);

      let vbModified = false;

      // Sanitize float color neu co NaN/am
      if (colEl) {
        const comps = Math.min(4, colEl.numComponents);
        for (let v = 0; v < numVerts; v++) {
          const off = v * colEl.stride + colEl.offset;
          if (off + comps * 4 > vbBytes.byteLength) break;
          for (let c = 0; c < comps; c++) {
            const val = vbDv.getFloat32(off + c * 4, true);
            if (!Number.isFinite(val)) {
              vbDv.setFloat32(off + c * 4, 1, true);
              vbModified = true;
            } else if (val < 0) {
              vbDv.setFloat32(off + c * 4, 0, true);
              vbModified = true;
            }
          }
        }
      }

      if (!posEl || !normEl) {
        if (vbModified) vb.unlock?.();
        return 0;
      }

      const pos = new Float32Array(numVerts * 3);
      const norm = new Float32Array(numVerts * 3);
      const uv0 = uv0El ? new Float32Array(numVerts * 2) : null;

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      for (let v = 0; v < numVerts; v++) {
        const pOff = v * posEl.stride + posEl.offset;
        let px = vbDv.getFloat32(pOff, true);
        let py = vbDv.getFloat32(pOff + 4, true);
        let pz = vbDv.getFloat32(pOff + 8, true);
        if (!Number.isFinite(px)) { px = 0; vbModified = true; }
        if (!Number.isFinite(py)) { py = 0; vbModified = true; }
        if (!Number.isFinite(pz)) { pz = 0; vbModified = true; }
        pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
        if (px < minX) minX = px; if (py < minY) minY = py; if (pz < minZ) minZ = pz;
        if (px > maxX) maxX = px; if (py > maxY) maxY = py; if (pz > maxZ) maxZ = pz;

        const nOff = v * normEl.stride + normEl.offset;
        norm[v * 3] = vbDv.getFloat32(nOff, true);
        norm[v * 3 + 1] = vbDv.getFloat32(nOff + 4, true);
        norm[v * 3 + 2] = vbDv.getFloat32(nOff + 8, true);

        if (uv0 && uv0El) {
          const uOff = v * uv0El.stride + uv0El.offset;
          const u = vbDv.getFloat32(uOff, true);
          const vCoord = vbDv.getFloat32(uOff + 4, true);
          uv0[v * 2] = Number.isFinite(u) ? u : 0;
          uv0[v * 2 + 1] = Number.isFinite(vCoord) ? vCoord : 0;
        }
      }

      const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
      if (!Number.isFinite(diag) || diag < 1e-9) {
        if (vbModified) vb.unlock?.();
        return 0;
      }

      // Lay danh sach IndexBuffer tam giac cua cac mesh dung chung VB
      const ibEntries: Array<{ mesh: pc.Mesh; ib: any; view: Uint8Array | Uint16Array | Uint32Array; count: number }> = [];
      for (const mesh of meshes) {
        const prim = (mesh as any).primitive?.[0];
        if (!prim || prim.type !== pc.PRIMITIVE_TRIANGLES) continue;
        const ib = (mesh as any).indexBuffer?.[0];
        if (!ib) continue;
        const ibRaw = ib.lock?.();
        if (!ibRaw) continue;
        const ibFmt = ib.getFormat?.() ?? ib.format;
        const numIdx = Math.min(prim.count ?? (ib.getNumIndices?.() ?? ib.numIndices ?? 0), ib.getNumIndices?.() ?? ib.numIndices ?? 0);
        if (numIdx < 3) continue;

        let view: Uint8Array | Uint16Array | Uint32Array | null = null;
        if (ArrayBuffer.isView(ibRaw)) {
          if (ibFmt === pc.INDEXFORMAT_UINT8) view = new Uint8Array(ibRaw.buffer, ibRaw.byteOffset, numIdx);
          else if (ibFmt === pc.INDEXFORMAT_UINT16) view = new Uint16Array(ibRaw.buffer, ibRaw.byteOffset, numIdx);
          else view = new Uint32Array(ibRaw.buffer, ibRaw.byteOffset, numIdx);
        } else if (ibRaw instanceof ArrayBuffer) {
          if (ibFmt === pc.INDEXFORMAT_UINT8) view = new Uint8Array(ibRaw, 0, numIdx);
          else if (ibFmt === pc.INDEXFORMAT_UINT16) view = new Uint16Array(ibRaw, 0, numIdx);
          else view = new Uint32Array(ibRaw, 0, numIdx);
        }
        if (view) ibEntries.push({ mesh, ib, view, count: numIdx });
      }

      let posModified = false;
      if (!hasSkin && !hasMorph && ibEntries.length > 0) {
        posModified = this._weldOpenBoundaryPositions(
          pos,
          numVerts,
          ibEntries.map((e) => e.view),
          diag
        );
        if (posModified) vbModified = true;
      }

      // Chuan hoa normal ban dau
      const hasValidN = new Uint8Array(numVerts);
      for (let v = 0; v < numVerts; v++) {
        const nx = norm[v * 3], ny = norm[v * 3 + 1], nz = norm[v * 3 + 2];
        const lenSq = nx * nx + ny * ny + nz * nz;
        if (Number.isFinite(lenSq) && lenSq > 1e-10) {
          const inv = 1.0 / Math.sqrt(lenSq);
          norm[v * 3] = nx * inv;
          norm[v * 3 + 1] = ny * inv;
          norm[v * 3 + 2] = nz * inv;
          hasValidN[v] = 1;
        } else {
          norm[v * 3] = 0; norm[v * 3 + 1] = 0; norm[v * 3 + 2] = 0;
          vbModified = true;
        }
      }

      // Can chinh winding & tich luy phap tuyen mat dinh huong
      const minAreaSq = Math.max(1e-28, (diag * 1e-11) * (diag * 1e-11));
      const accFn = new Float64Array(numVerts * 3);
      const ibDirty = new Uint8Array(ibEntries.length);

      for (let ei = 0; ei < ibEntries.length; ei++) {
        const { view, count } = ibEntries[ei];
        const nTri = Math.floor(count / 3);
        for (let t = 0; t < nTri; t++) {
          let i0 = view[t * 3], i1 = view[t * 3 + 1], i2 = view[t * 3 + 2];
          if (i0 >= numVerts || i1 >= numVerts || i2 >= numVerts || i0 === i1 || i1 === i2 || i0 === i2) {
            if (i1 !== i0 || i2 !== i0) {
              const safeIdx = i0 < numVerts ? i0 : 0;
              view[t * 3] = safeIdx; view[t * 3 + 1] = safeIdx; view[t * 3 + 2] = safeIdx;
              ibDirty[ei] = 1;
            }
            continue;
          }

          const p0x = pos[i0 * 3], p0y = pos[i0 * 3 + 1], p0z = pos[i0 * 3 + 2];
          const e1x = pos[i1 * 3] - p0x, e1y = pos[i1 * 3 + 1] - p0y, e1z = pos[i1 * 3 + 2] - p0z;
          const e2x = pos[i2 * 3] - p0x, e2y = pos[i2 * 3 + 1] - p0y, e2z = pos[i2 * 3 + 2] - p0z;
          let fnx = e1y * e2z - e1z * e2y;
          let fny = e1z * e2x - e1x * e2z;
          let fnz = e1x * e2y - e1y * e2x;
          const fnLenSq = fnx * fnx + fny * fny + fnz * fnz;
          if (!Number.isFinite(fnLenSq) || fnLenSq <= minAreaSq) {
            view[t * 3 + 1] = i0;
            view[t * 3 + 2] = i0;
            ibDirty[ei] = 1;
            continue;
          }

          const vnx = norm[i0 * 3] + norm[i1 * 3] + norm[i2 * 3];
          const vny = norm[i0 * 3 + 1] + norm[i1 * 3 + 1] + norm[i2 * 3 + 1];
          const vnz = norm[i0 * 3 + 2] + norm[i1 * 3 + 2] + norm[i2 * 3 + 2];
          const vnLenSq = vnx * vnx + vny * vny + vnz * vnz;
          if (vnLenSq > 1e-8 && fnx * vnx + fny * vny + fnz * vnz < 0) {
            view[t * 3 + 1] = i2;
            view[t * 3 + 2] = i1;
            const tmp = i1; i1 = i2; i2 = tmp;
            fnx = -fnx; fny = -fny; fnz = -fnz;
            ibDirty[ei] = 1;
          }

          accFn[i0 * 3] += fnx; accFn[i0 * 3 + 1] += fny; accFn[i0 * 3 + 2] += fnz;
          accFn[i1 * 3] += fnx; accFn[i1 * 3 + 1] += fny; accFn[i1 * 3 + 2] += fnz;
          accFn[i2 * 3] += fnx; accFn[i2 * 3 + 1] += fny; accFn[i2 * 3 + 2] += fnz;
        }
      }

      // Sua normal suy bien hoac lech nguoc > 83 do so voi mat dinh huong
      for (let v = 0; v < numVerts; v++) {
        const fx = accFn[v * 3], fy = accFn[v * 3 + 1], fz = accFn[v * 3 + 2];
        const fLen = Math.hypot(fx, fy, fz);
        if (!hasValidN[v]) {
          if (fLen > 1e-18) {
            norm[v * 3] = fx / fLen; norm[v * 3 + 1] = fy / fLen; norm[v * 3 + 2] = fz / fLen;
          } else {
            norm[v * 3] = 0; norm[v * 3 + 1] = 1; norm[v * 3 + 2] = 0;
          }
          vbModified = true;
        } else if (fLen > 1e-18) {
          const fux = fx / fLen, fuy = fy / fLen, fuz = fz / fLen;
          if (norm[v * 3] * fux + norm[v * 3 + 1] * fuy + norm[v * 3 + 2] * fuz < 0.12) {
            norm[v * 3] = fux; norm[v * 3 + 1] = fuy; norm[v * 3 + 2] = fuz;
            vbModified = true;
          }
        }
      }

      // Lam muot normal qua duong may UV tren mat cong (< 38 do)
      if (!hasSkin && !hasMorph && ibEntries.length > 0) {
        const seamInv = 1.0 / Math.max(diag * 1e-5, 1e-9);
        const posGroups = new Map<string, number[]>();
        for (let v = 0; v < numVerts; v++) {
          const k = `${Math.round(pos[v * 3] * seamInv)},${Math.round(pos[v * 3 + 1] * seamInv)},${Math.round(pos[v * 3 + 2] * seamInv)}`;
          let arr = posGroups.get(k);
          if (!arr) { arr = []; posGroups.set(k, arr); }
          arr.push(v);
        }
        posGroups.forEach((verts) => {
          if (verts.length < 2 || verts.length > 16) return;
          const v0 = verts[0];
          const refX = norm[v0 * 3], refY = norm[v0 * 3 + 1], refZ = norm[v0 * 3 + 2];
          let gx = 0, gy = 0, gz = 0;
          for (const vi of verts) {
            const nx = norm[vi * 3], ny = norm[vi * 3 + 1], nz = norm[vi * 3 + 2];
            if (nx * refX + ny * refY + nz * refZ < 0.78) return;
            gx += nx; gy += ny; gz += nz;
          }
          const gLen = Math.hypot(gx, gy, gz);
          if (gLen < 1e-6) return;
          gx /= gLen; gy /= gLen; gz /= gLen;
          for (const vi of verts) {
            const bx = 0.55 * norm[vi * 3] + 0.45 * gx;
            const by = 0.55 * norm[vi * 3 + 1] + 0.45 * gy;
            const bz = 0.55 * norm[vi * 3 + 2] + 0.45 * gz;
            const bLen = Math.hypot(bx, by, bz) || 1;
            norm[vi * 3] = bx / bLen; norm[vi * 3 + 1] = by / bLen; norm[vi * 3 + 2] = bz / bLen;
          }
          vbModified = true;
        });
      }

      // Dam bao tuyet doi 100% tam giac dot(fn, vn) >= 0 va unlock IndexBuffer neu thay doi
      let totalValidTris = 0;
      let degUvTris = 0;

      for (let ei = 0; ei < ibEntries.length; ei++) {
        const { ib, view, count } = ibEntries[ei];
        const nTri = Math.floor(count / 3);
        for (let t = 0; t < nTri; t++) {
          const i0 = view[t * 3], i1 = view[t * 3 + 1], i2 = view[t * 3 + 2];
          if (i0 === i1 || i1 === i2 || i0 === i2) continue;
          totalValidTris++;
          if (uv0) {
            const du1 = uv0[i1 * 2] - uv0[i0 * 2], dv1 = uv0[i1 * 2 + 1] - uv0[i0 * 2 + 1];
            const du2 = uv0[i2 * 2] - uv0[i0 * 2], dv2 = uv0[i2 * 2 + 1] - uv0[i0 * 2 + 1];
            if (Math.abs(du1 * dv2 - du2 * dv1) < 1e-9) degUvTris++;
          }
          const p0x = pos[i0 * 3], p0y = pos[i0 * 3 + 1], p0z = pos[i0 * 3 + 2];
          const e1x = pos[i1 * 3] - p0x, e1y = pos[i1 * 3 + 1] - p0y, e1z = pos[i1 * 3 + 2] - p0z;
          const e2x = pos[i2 * 3] - p0x, e2y = pos[i2 * 3 + 1] - p0y, e2z = pos[i2 * 3 + 2] - p0z;
          const fnx = e1y * e2z - e1z * e2y;
          const fny = e1z * e2x - e1x * e2z;
          const fnz = e1x * e2y - e1y * e2x;
          const vnx = norm[i0 * 3] + norm[i1 * 3] + norm[i2 * 3];
          const vny = norm[i0 * 3 + 1] + norm[i1 * 3 + 1] + norm[i2 * 3 + 1];
          const vnz = norm[i0 * 3 + 2] + norm[i1 * 3 + 2] + norm[i2 * 3 + 2];
          if (fnx * vnx + fny * vny + fnz * vnz < 0) {
            view[t * 3 + 1] = i2;
            view[t * 3 + 2] = i1;
            ibDirty[ei] = 1;
          }
        }
        if (ibDirty[ei]) {
          ib.unlock?.();
        }
      }

      degUvRatio = totalValidTris > 0 ? degUvTris / totalValidTris : 0;
      vb._glbDegUvRatio = degUvRatio;

      // Neu chua co SEMANTIC_TANGENT va co UV0 + device (khong morph): tinh tangent va nang cap VertexBuffer
      if (!tanEl && uv0 && !hasMorph && device && ibEntries.length > 0) {
        const tan1 = new Float64Array(numVerts * 3);
        const tan2 = new Float64Array(numVerts * 3);

        for (const { view, count } of ibEntries) {
          const nTri = Math.floor(count / 3);
          for (let t = 0; t < nTri; t++) {
            const i0 = view[t * 3], i1 = view[t * 3 + 1], i2 = view[t * 3 + 2];
            if (i0 === i1 || i1 === i2 || i0 === i2) continue;
            const du1 = uv0[i1 * 2] - uv0[i0 * 2], dv1 = uv0[i1 * 2 + 1] - uv0[i0 * 2 + 1];
            const du2 = uv0[i2 * 2] - uv0[i0 * 2], dv2 = uv0[i2 * 2 + 1] - uv0[i0 * 2 + 1];
            const uvArea = du1 * dv2 - du2 * dv1;
            if (!Number.isFinite(uvArea) || Math.abs(uvArea) < 1e-9) continue;

            const x1 = pos[i1 * 3] - pos[i0 * 3], y1 = pos[i1 * 3 + 1] - pos[i0 * 3 + 1], z1 = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
            const x2 = pos[i2 * 3] - pos[i0 * 3], y2 = pos[i2 * 3 + 1] - pos[i0 * 3 + 1], z2 = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
            const triArea3D = Math.hypot(y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2);
            if (triArea3D <= 1e-14) continue;

            const sgn = uvArea > 0 ? 1.0 : -1.0;
            let sx = (dv2 * x1 - dv1 * x2) * sgn;
            let sy = (dv2 * y1 - dv1 * y2) * sgn;
            let sz = (dv2 * z1 - dv1 * z2) * sgn;
            const sLen = Math.hypot(sx, sy, sz);
            if (sLen <= 1e-12) continue;
            const sw = triArea3D / sLen;
            sx *= sw; sy *= sw; sz *= sw;

            let tx = (du1 * x2 - du2 * x1) * sgn;
            let ty = (du1 * y2 - du2 * y1) * sgn;
            let tz = (du1 * z2 - du2 * z1) * sgn;
            const tLen = Math.hypot(tx, ty, tz) || 1;
            const tw = triArea3D / tLen;
            tx *= tw; ty *= tw; tz *= tw;

            tan1[i0 * 3] += sx; tan1[i0 * 3 + 1] += sy; tan1[i0 * 3 + 2] += sz;
            tan1[i1 * 3] += sx; tan1[i1 * 3 + 1] += sy; tan1[i1 * 3 + 2] += sz;
            tan1[i2 * 3] += sx; tan1[i2 * 3 + 1] += sy; tan1[i2 * 3 + 2] += sz;

            tan2[i0 * 3] += tx; tan2[i0 * 3 + 1] += ty; tan2[i0 * 3 + 2] += tz;
            tan2[i1 * 3] += tx; tan2[i1 * 3 + 1] += ty; tan2[i1 * 3 + 2] += tz;
            tan2[i2 * 3] += tx; tan2[i2 * 3 + 1] += ty; tan2[i2 * 3 + 2] += tz;
          }
        }

        const outTan = new Float32Array(numVerts * 4);
        for (let v = 0; v < numVerts; v++) {
          const nx = norm[v * 3], ny = norm[v * 3 + 1], nz = norm[v * 3 + 2];
          const t1x = tan1[v * 3], t1y = tan1[v * 3 + 1], t1z = tan1[v * 3 + 2];
          const ndott = nx * t1x + ny * t1y + nz * t1z;
          const ox = t1x - nx * ndott, oy = t1y - ny * ndott, oz = t1z - nz * ndott;
          const oLen = Math.hypot(ox, oy, oz);
          if (oLen > 1e-5) {
            const ux = ox / oLen, uy = oy / oLen, uz = oz / oLen;
            const cx = ny * uz - nz * uy, cy = nz * ux - nx * uz, cz = nx * uy - ny * ux;
            const w = cx * tan2[v * 3] + cy * tan2[v * 3 + 1] + cz * tan2[v * 3 + 2] < 0 ? -1.0 : 1.0;
            outTan[v * 4] = ux; outTan[v * 4 + 1] = uy; outTan[v * 4 + 2] = uz; outTan[v * 4 + 3] = w;
          } else {
            const fb = this._makeOrthonormalTangent(nx, ny, nz);
            outTan[v * 4] = fb[0]; outTan[v * 4 + 1] = fb[1]; outTan[v * 4 + 2] = fb[2]; outTan[v * 4 + 3] = fb[3];
          }
        }

        const desc: any[] = elements.map((el) => ({
          semantic: el.name,
          components: el.numComponents,
          type: el.dataType,
          normalize: !!el.normalize,
          asInt: !!el.asInt
        }));
        desc.push({
          semantic: pc.SEMANTIC_TANGENT,
          components: 4,
          type: pc.TYPE_FLOAT32,
          normalize: false
        });

        const newFmt = new pc.VertexFormat(device, desc);
        const newVb = new pc.VertexBuffer(device, newFmt, numVerts, {
          usage: vb.getUsage?.() ?? pc.BUFFER_STATIC
        });
        const newRaw = newVb.lock();
        const dstBytes = ArrayBuffer.isView(newRaw)
          ? new Uint8Array(newRaw.buffer, newRaw.byteOffset, newRaw.byteLength)
          : new Uint8Array(newRaw as ArrayBuffer);
        const dstDv = new DataView(dstBytes.buffer, dstBytes.byteOffset, dstBytes.byteLength);
        const newElements: any[] = (newFmt as any).elements || [];

        for (const srcEl of elements) {
          const dstEl = newElements.find((e) => e.name === srcEl.name);
          if (!dstEl) continue;
          const copyBytes = Math.min(srcEl.size, dstEl.size);
          for (let v = 0; v < numVerts; v++) {
            const sOff = v * srcEl.stride + srcEl.offset;
            const dOff = v * dstEl.stride + dstEl.offset;
            for (let b = 0; b < copyBytes; b++) {
              dstBytes[dOff + b] = vbBytes[sOff + b];
            }
          }
        }

        const dstPosEl = newElements.find((e) => e.name === pc.SEMANTIC_POSITION);
        const dstNormEl = newElements.find((e) => e.name === pc.SEMANTIC_NORMAL);
        const dstTanEl = newElements.find((e) => e.name === pc.SEMANTIC_TANGENT);

        for (let v = 0; v < numVerts; v++) {
          if (dstPosEl) {
            const pOff = v * dstPosEl.stride + dstPosEl.offset;
            dstDv.setFloat32(pOff, pos[v * 3], true);
            dstDv.setFloat32(pOff + 4, pos[v * 3 + 1], true);
            dstDv.setFloat32(pOff + 8, pos[v * 3 + 2], true);
          }
          if (dstNormEl) {
            const nOff = v * dstNormEl.stride + dstNormEl.offset;
            dstDv.setFloat32(nOff, norm[v * 3], true);
            dstDv.setFloat32(nOff + 4, norm[v * 3 + 1], true);
            dstDv.setFloat32(nOff + 8, norm[v * 3 + 2], true);
          }
          if (dstTanEl) {
            const tOff = v * dstTanEl.stride + dstTanEl.offset;
            dstDv.setFloat32(tOff, outTan[v * 4], true);
            dstDv.setFloat32(tOff + 4, outTan[v * 4 + 1], true);
            dstDv.setFloat32(tOff + 8, outTan[v * 4 + 2], true);
            dstDv.setFloat32(tOff + 12, outTan[v * 4 + 3], true);
          }
        }

        newVb.unlock();
        (newVb as any)._glbVbGroupSanitized = true;
        (newVb as any)._glbDegUvRatio = degUvRatio;

        for (const m of meshes) {
          m.vertexBuffer = newVb;
          if (posModified && m.aabb) {
            m.aabb.compute(pos, numVerts);
          }
        }
        try { vb.destroy?.(); } catch (_) {}
        return degUvRatio;
      }

      // Neu da co SEMANTIC_TANGENT (hoac mesh co morph/khong UV): sua tangent tai cho & ghi lai pos/norm
      if (tanEl) {
        for (let v = 0; v < numVerts; v++) {
          const tOff = v * tanEl.stride + tanEl.offset;
          if (tOff + 16 > vbBytes.byteLength) break;
          const tx = vbDv.getFloat32(tOff, true);
          const ty = vbDv.getFloat32(tOff + 4, true);
          const tz = vbDv.getFloat32(tOff + 8, true);
          const tw = vbDv.getFloat32(tOff + 12, true);
          const lenSq = tx * tx + ty * ty + tz * tz;
          if (!Number.isFinite(lenSq) || !Number.isFinite(tw) || lenSq < 1e-8 || Math.abs(tw) < 1e-4) {
            const fb = this._makeOrthonormalTangent(norm[v * 3], norm[v * 3 + 1], norm[v * 3 + 2]);
            vbDv.setFloat32(tOff, fb[0], true);
            vbDv.setFloat32(tOff + 4, fb[1], true);
            vbDv.setFloat32(tOff + 8, fb[2], true);
            vbDv.setFloat32(tOff + 12, fb[3], true);
            vbModified = true;
          }
        }
      }

      if (vbModified) {
        for (let v = 0; v < numVerts; v++) {
          if (posModified) {
            const pOff = v * posEl.stride + posEl.offset;
            vbDv.setFloat32(pOff, pos[v * 3], true);
            vbDv.setFloat32(pOff + 4, pos[v * 3 + 1], true);
            vbDv.setFloat32(pOff + 8, pos[v * 3 + 2], true);
          }
          const nOff = v * normEl.stride + normEl.offset;
          vbDv.setFloat32(nOff, norm[v * 3], true);
          vbDv.setFloat32(nOff + 4, norm[v * 3 + 1], true);
          vbDv.setFloat32(nOff + 8, norm[v * 3 + 2], true);
        }
        vb.unlock?.();
        if (posModified) {
          for (const m of meshes) {
            if (m.aabb) m.aabb.compute(pos, numVerts);
          }
        }
      }
    } catch (_) {}

    return degUvRatio;
  }

  /**
   * Chuan hoa toan ven geometry, winding, vertex normals/tangents, filtering va material cua GLB sau khi instantiate:
   * 1. Han kin vi khe ho bien UV seam, loai tam giac suy bien va dong bo 100% chieu quan (winding) khop phap tuyen dinh.
   * 2. Sua normal suy bien/nguoc chieu va tinh SEMANTIC_TANGENT truc chuan de khu nhieu dFdx/dFdy tren tam giac UV suy bien.
   * 3. Bat render 2 mat (CULLFACE_NONE + twoSidedLighting) an toan ma khong gay manh den tren mat ngoai.
   * 4. Chuyen cac vat lieu bi gan nham BLEND sang OPAQUE hoac alpha-cutout co depthWrite = true.
   * 5. Tang anisotropic filtering, dieu tiet bumpiness tren mesh decimate va ha alphaCutoff hop ly.
   */
  private _sanitizeGlbEntity(rootEntity: pc.Entity | null | undefined, device?: any): void {
    if (!rootEntity) return;
    const compSet = new Set<any>();
    if ((rootEntity as any).render) compSet.add((rootEntity as any).render);
    if ((rootEntity as any).model) compSet.add((rootEntity as any).model);
    for (const r of (rootEntity.findComponents('render') as any[]) || []) compSet.add(r);
    for (const m of (rootEntity.findComponents('model') as any[]) || []) compSet.add(m);

    const maxAniso = Math.min(8, Math.max(1, Number(device?.maxAnisotropy) || 4));
    const texSlots = [
      'diffuseMap',
      'opacityMap',
      'normalMap',
      'emissiveMap',
      'metalnessMap',
      'glossMap',
      'aoMap',
      'specularMap'
    ];

    // 1. Gom nhom pc.Mesh theo VertexBuffer de xu ly dong bo geometry, winding, normal va tangent
    const vbToMeshes = new Map<any, Set<pc.Mesh>>();
    const allMis: any[] = [];
    compSet.forEach((comp) => {
      const mis: any[] = comp?.meshInstances || [];
      for (const mi of mis) {
        if (!mi) continue;
        allMis.push(mi);
        const mesh = mi.mesh as pc.Mesh | undefined;
        const vb = mesh?.vertexBuffer;
        if (mesh && vb) {
          let set = vbToMeshes.get(vb);
          if (!set) { set = new Set<pc.Mesh>(); vbToMeshes.set(vb, set); }
          set.add(mesh);
        }
      }
    });

    const meshDegUvRatio = new Map<pc.Mesh, number>();
    vbToMeshes.forEach((meshSet, vb) => {
      const meshes = Array.from(meshSet);
      const ratio = this._sanitizeVbMeshGroup(vb, meshes, device);
      for (const m of meshes) {
        meshDegUvRatio.set(m, ratio);
      }
    });

    // 2. Chuan hoa StandardMaterial & Texture filtering
    for (const mi of allMis) {
      const mat = mi.material as pc.StandardMaterial;
      if (!mat || (mat as any)._glbMatSanitized) continue;
      (mat as any)._glbMatSanitized = true;

      try {
        for (const slot of texSlots) {
          const tex = (mat as any)[slot];
          if (tex && typeof tex === 'object' && typeof tex.anisotropy === 'number') {
            if (tex.anisotropy < maxAniso) {
              tex.anisotropy = maxAniso;
            }
          }
        }

        // Luon tat backface culling va bat two-sided lighting (nay da an toan tuyet doi do winding da khop 100% voi normal)
        mat.cull = pc.CULLFACE_NONE;
        mat.twoSidedLighting = true;
        mat.depthTest = true;

        // Dieu tiet bumpiness nhe khi mesh AI decimate co nhieu tam giac UV suy bien de tranh soc den normal map
        const degRatio = mi.mesh ? (meshDegUvRatio.get(mi.mesh) ?? 0) : 0;
        if (mat.normalMap && degRatio > 0.03) {
          const curBump = typeof mat.bumpiness === 'number' ? mat.bumpiness : 1.0;
          mat.bumpiness = Math.min(curBump, 0.72);
        }

        // Tat dynamic refraction neu GLB co KHR_materials_volume / transmission nhung scene khong bat grab pass
        if ((mat as any).useDynamicRefraction) {
          const refr = Number((mat as any).refraction) || 0;
          const curOp = typeof mat.opacity === 'number' ? mat.opacity : 1;
          if (refr > 0.25 && !(mat as any).refractionMap && curOp >= 0.92) {
            mat.opacity = Math.max(0.25, 1 - refr * 0.65);
          }
          (mat as any).useDynamicRefraction = false;
          (mat as any).refraction = 0;
        }

        const scalarOpacity = typeof mat.opacity === 'number' ? mat.opacity : 1.0;

        if (mat.blendType !== pc.BLEND_NONE) {
          if (scalarOpacity < 0.92) {
            if (mat.opacityMap && this._classifyTextureAlpha(mat.opacityMap) === 'all_zero') {
              mat.opacityMap = null as any;
            }
            mat.depthWrite = false;
          } else if (mat.opacityMap) {
            const alphaProfile = this._classifyTextureAlpha(mat.opacityMap);
            if (alphaProfile === 'opaque') {
              mat.blendType = pc.BLEND_NONE;
              mat.depthWrite = true;
              mat.alphaTest = 0;
              mat.opacityMap = null as any;
            } else if (alphaProfile === 'all_zero') {
              mat.blendType = pc.BLEND_NONE;
              mat.depthWrite = true;
              mat.alphaTest = 0;
              mat.opacityMap = null as any;
              mat.opacity = 1;
            } else if (alphaProfile === 'translucent') {
              mat.blendType = pc.BLEND_NORMAL;
              mat.depthWrite = false;
            } else {
              mat.blendType = pc.BLEND_NONE;
              mat.depthWrite = true;
              mat.alphaTest = mat.alphaTest > 0 ? Math.min(mat.alphaTest, 0.3) : 0.22;
            }
          } else {
            mat.blendType = pc.BLEND_NONE;
            mat.depthWrite = true;
          }
        } else {
          mat.depthWrite = true;
          if (mat.opacityMap) {
            const alphaProfile = this._classifyTextureAlpha(mat.opacityMap);
            if (alphaProfile === 'opaque' || alphaProfile === 'all_zero') {
              mat.alphaTest = 0;
              mat.opacityMap = null as any;
            } else if (mat.alphaTest > 0) {
              mat.alphaTest = Math.min(mat.alphaTest, 0.3);
            }
          }
        }

        (mat as any)._baseBlendType = mat.blendType;
        (mat as any)._baseDepthWrite = mat.depthWrite;
        (mat as any)._baseOpacity = mat.opacity;
        mat.update();
      } catch (_) {}
    }
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
      this._sanitizeGlbEntity(newEntity, this.app?.graphicsDevice);

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

  // Cache pc.Asset theo glbPath để các đồ vật nhân bản (duplicate) dùng chung GPU mesh/texture
  private _glbAssetCache = new Map<string, pc.Asset>();
  private _propIdToGlbKey = new Map<string, string>();
  private _propIdToSoloAsset = new Map<string, pc.Asset>();

  /** Giải phóng pc.Asset, Rig và Texture tùy chỉnh của propId khi xóa đồ vật nếu không còn bản sao nào khác tham chiếu */
  releasePropGlbAsset(propId: string): void {
    if (!propId) return;

    // Dọn dẹp Rig/Timeline đang chạy để không tick zombie mỗi frame sau khi xóa
    const rig = this._propRigMap.get(propId);
    if (rig) {
      this._stopRigClipAnim(rig);
      this._propRigMap.delete(propId);
    }

    // Dọn dẹp Texture tùy chỉnh trong VRAM của riêng propId này
    const customTex = this._propCustomTextures.get(propId);
    if (customTex) {
      this._propCustomTextures.delete(propId);
      try { customTex.texture?.destroy?.(); } catch (_) {}
    }

    const solo = this._propIdToSoloAsset.get(propId);
    if (solo) {
      this._propIdToSoloAsset.delete(propId);
      let soloStillUsed = false;
      this._propIdToSoloAsset.forEach((a) => {
        if (a === solo) soloStillUsed = true;
      });
      if (!soloStillUsed) {
        try {
          solo.unload();
          this.app?.assets?.remove(solo);
        } catch (_) {}
      }
    }
    const key = this._propIdToGlbKey.get(propId);
    if (!key) return;
    this._propIdToGlbKey.delete(propId);
    // Kiểm tra còn propId nào khác dùng chung glbPath này không
    let stillUsed = false;
    this._propIdToGlbKey.forEach((v) => {
      if (v === key) stillUsed = true;
    });
    if (!stillUsed) {
      const cached = this._glbAssetCache.get(key);
      if (cached) {
        this._glbAssetCache.delete(key);
        try {
          cached.unload();
          this.app?.assets?.remove(cached);
        } catch (_) {}
      }
    }
  }

  /** Giải phóng toàn bộ GLB cache khi reset hoặc hủy scene */
  clearAllPropGlbAssets(): void {
    this._propIdToSoloAsset.forEach((asset) => {
      try { asset.unload(); this.app?.assets?.remove(asset); } catch (_) {}
    });
    this._propIdToSoloAsset.clear();
    this._glbAssetCache.forEach((asset) => {
      try { asset.unload(); this.app?.assets?.remove(asset); } catch (_) {}
    });
    this._glbAssetCache.clear();
    this._propIdToGlbKey.clear();
    this._propRigMap.clear();
    this._highlightedBoneNode = null;
    if (this._boneHighlightEntity) {
      try { this._boneHighlightEntity.destroy(); } catch (_) {}
      this._boneHighlightEntity = null;
    }
  }

  // ============================================================================
  // GLB SKELETAL RIG, ANIMATION CLIPS & BONE KEYFRAME TIMELINE ENGINE
  // ============================================================================
  private _propRigMap = new Map<string, {
    propId: string;
    wrapper: pc.Entity;
    glbEntity: pc.Entity;
    hipsNode: pc.GraphNode | null;
    hasSkinnedSkeleton: boolean;
    modelSize: { x: number; y: number; z: number };
    forwardAxis: '+z' | '+x';
    meterScale: number;
    wheelbase: number;
    autoWheels: Array<{
      id: string;
      isFront: boolean;
      radius: number;
      axleX: number;
      axleY: number;
      axleZ: number;
      steerPivot: pc.Entity;
      spinPivot: pc.Entity;
    }>;
    bones: Map<string, {
      name: string;
      label: string;
      depth: number;
      isSkinnedBone: boolean;
      isRootOrHips: boolean;
      isRigidPartSafe: boolean;
      node: pc.GraphNode;
      restPos: pc.Vec3;
      restQuat: pc.Quat;
      restScale: pc.Vec3;
      charRestQuat: pc.Quat;
      parentCharRestQuat: pc.Quat;
      tposeLocalQuat: pc.Quat;
      tposeCharQuat: pc.Quat;
      posUnitScale: number;
      curRotDelta: { x: number; y: number; z: number };
      curPosDelta: { x: number; y: number; z: number };
    }>;
    clips: Array<{
      name: string;
      rawName?: string;
      duration: number;
      resource: any;
      isCustomKeyframeClip?: boolean;
      poseSpace?: 'tpose' | 'rest';
      keyframes?: GlbBoneKeyframe[];
    }>;
    animComp: any | null;
    timeline: GlbPropTimelineData;
    currentTime: number;
  }>();

  private _boneHighlightEntity: pc.Entity | null = null;
  private _highlightedBoneNode: pc.GraphNode | null = null;
  onTimelineTimeUpdate: ((propId: string, time: number, playing: boolean) => void) | null = null;

  /** Tắt hoàn toàn AnimComponent của clip nhúng để không ghi đè tư thế khớp xương ở chế độ Keyframes */
  private _stopRigClipAnim(rig: any): void {
    if (!rig) return;
    const comps = [
      rig.animComp,
      rig.glbEntity?.anim,
      (rig.glbEntity as any)?.animation
    ];
    let wasAnimActive = false;
    for (const c of comps) {
      if (!c) continue;
      if (c.enabled || c.playing) wasAnimActive = true;
      try {
        c.playing = false;
        c.speed = 0;
        c.enabled = false;
      } catch (_) {}
    }
    // Chỉ đặt lại vị trí cục bộ của glbEntity khi vừa tắt clip nhúng có root-motion lock,
    // KHÔNG xóa vị trí khi chế độ keyframes đang di chuyển __root__ (vd: xe chạy vòng tròn)
    if (wasAnimActive && rig.glbEntity && rig.timeline?.mode === 'keyframes') {
      const rootBone = rig.bones?.get?.('__root__');
      const hasRootPos = !!(
        rootBone?.curPosDelta &&
        (Math.abs(rootBone.curPosDelta.x || 0) > 1e-4 ||
          Math.abs(rootBone.curPosDelta.y || 0) > 1e-4 ||
          Math.abs(rootBone.curPosDelta.z || 0) > 1e-4)
      );
      if (!hasRootPos) {
        const lp = rig.glbEntity.getLocalPosition();
        if (Math.abs(lp.x) > 1e-5 || Math.abs(lp.y) > 1e-5 || Math.abs(lp.z) > 1e-5) {
          rig.glbEntity.setLocalPosition(0, 0, 0);
        }
      }
    }
  }

  /**
   * Biến đổi góc xoay và vị trí từ Hệ tọa độ Chuẩn Nhân vật (Character Cardinal Space:
   * +X = Trái nhân vật / Pitch, +Y = Đỉnh đầu / Yaw, +Z = Trước mặt / Roll)
   * sang Hệ tọa độ Cục bộ (Local Bone Space) của từng khớp xương bất kể hướng trục xương gốc trong GLB/FBX.
   */
  private _applyCharacterSpaceBoneQuat(
    bone: {
      isSkinnedBone: boolean;
      isRootOrHips: boolean;
      node: pc.GraphNode;
      restPos: pc.Vec3;
      restQuat: pc.Quat;
      charRestQuat: pc.Quat;
      parentCharRestQuat: pc.Quat;
      tposeLocalQuat?: pc.Quat;
      tposeCharQuat?: pc.Quat;
      posUnitScale: number;
      curRotDelta: { x: number; y: number; z: number };
      curPosDelta: { x: number; y: number; z: number };
    },
    qCharDelta: pc.Quat,
    rotEuler: { x: number; y: number; z: number },
    posDelta?: { x: number; y: number; z: number },
    useTPoseSpace = false
  ): void {
    bone.curRotDelta = {
      x: Number(rotEuler?.x) || 0,
      y: Number(rotEuler?.y) || 0,
      z: Number(rotEuler?.z) || 0
    };
    if (posDelta) {
      bone.curPosDelta = {
        x: Number(posDelta.x) || 0,
        y: Number(posDelta.y) || 0,
        z: Number(posDelta.z) || 0
      };
    }

    // Khi clip đã được chuẩn hóa về Canonical T-Pose (poseSpace === 'tpose'),
    // áp xoay từ tư thế T-Pose chuẩn của nhân vật đích để retarget khớp 1:1 giữa mọi tư thế nghỉ (A-Pose <-> T-Pose) và mọi số lượng khớp xương.
    const baseLocalQuat = (useTPoseSpace && bone.tposeLocalQuat) ? bone.tposeLocalQuat : bone.restQuat;
    const baseCharQuat = (useTPoseSpace && bone.tposeCharQuat) ? bone.tposeCharQuat : bone.charRestQuat;

    // qLocalDelta = inv(baseCharQuat) * qCharDelta * baseCharQuat
    // finalQuat   = baseLocalQuat * qLocalDelta
    const qCharInv = baseCharQuat.clone().invert();
    const qTmp = new pc.Quat().mul2(qCharInv, qCharDelta);
    const qLocalDelta = new pc.Quat().mul2(qTmp, baseCharQuat);
    const finalQuat = new pc.Quat().mul2(baseLocalQuat, qLocalDelta).normalize();
    bone.node.setLocalRotation(finalQuat);

    // Dịch chuyển vị trí theo đơn vị mét của nhân vật (tự động nhân hệ số cm nếu Armature scale 0.01)
    const scale = bone.posUnitScale || 1;
    const vChar = new pc.Vec3(
      bone.curPosDelta.x * scale,
      bone.curPosDelta.y * scale,
      bone.curPosDelta.z * scale
    );
    const qParentInv = bone.parentCharRestQuat.clone().invert();
    const vLocal = new pc.Vec3();
    qParentInv.transformVector(vChar, vLocal);

    bone.node.setLocalPosition(
      bone.restPos.x + vLocal.x,
      bone.restPos.y + vLocal.y,
      bone.restPos.z + vLocal.z
    );
  }

  private _registerPropRig(propId: string, wrapper: pc.Entity, glbEntity: pc.Entity, container: any, prop?: any): void {
    const bonesMap = new Map<string, {
      name: string;
      label: string;
      depth: number;
      isSkinnedBone: boolean;
      isRootOrHips: boolean;
      isRigidPartSafe: boolean;
      node: pc.GraphNode;
      restPos: pc.Vec3;
      restQuat: pc.Quat;
      restScale: pc.Vec3;
      charRestQuat: pc.Quat;
      parentCharRestQuat: pc.Quat;
      tposeLocalQuat: pc.Quat;
      tposeCharQuat: pc.Quat;
      posUnitScale: number;
      curRotDelta: { x: number; y: number; z: number };
      curPosDelta: { x: number; y: number; z: number };
    }>();

    // 1. Tập hợp các xương thực sự từ skinInstance.bones (nếu mô hình có rigged skin)
    const skinnedNodes = new Set<any>();
    const meshComps: any[] = [
      ...((glbEntity.findComponents('render') as any[]) || []),
      ...((glbEntity.findComponents('model') as any[]) || [])
    ];
    for (const r of meshComps) {
      const mis = r.meshInstances || [];
      for (const mi of mis) {
        const skin = mi?.skinInstance;
        if (skin && Array.isArray(skin.bones)) {
          for (const b of skin.bones) {
            if (b) skinnedNodes.add(b);
          }
        }
      }
    }
    const hasSkinnedSkeleton = skinnedNodes.size > 0;

    // Đếm số sub-mesh tĩnh cùng cha đều đặt pivot tại gốc (0,0,0) (dạng tách mesh theo vật liệu CAD/Sketchfab
    // như xe đạp BMX có 18 bộ phận cùng gốc (0,0,0) — xoay riêng từng bộ phận sẽ làm bung/lật ngược kết cấu mô hình!)
    const bakedOriginSiblingCountByParent = new Map<any, number>();
    const countBakedChildren = (parent: any) => {
      const chs: any[] = parent?.children || [];
      let bakedCount = 0;
      for (const ch of chs) {
        const lp = ch?.getLocalPosition ? ch.getLocalPosition() : null;
        const atOrigin = !lp || lp.length() < 0.005;
        const hasMesh = !!(ch?.render || ch?.model);
        if (atOrigin && hasMesh && !skinnedNodes.has(ch)) {
          bakedCount++;
        }
        countBakedChildren(ch);
      }
      bakedOriginSiblingCountByParent.set(parent, bakedCount);
    };
    countBakedChildren(glbEntity);

    // Đọc kích thước gốc cục bộ của mô hình để xác định hướng tiến (+Z hay +X) và hệ số mét
    const rawMin: pc.Vec3 | null = (wrapper as any)?._localAabbMin || null;
    const rawMax: pc.Vec3 | null = (wrapper as any)?._localAabbMax || null;
    const sizeX = rawMin && rawMax ? Math.max(0.01, Math.abs(rawMax.x - rawMin.x)) : 1.0;
    const sizeY = rawMin && rawMax ? Math.max(0.01, Math.abs(rawMax.y - rawMin.y)) : 1.0;
    const sizeZ = rawMin && rawMax ? Math.max(0.01, Math.abs(rawMax.z - rawMin.z)) : 1.0;
    const maxDim = Math.max(sizeX, sizeY, sizeZ);
    const meterScale = maxDim > 300 ? 1000 : (maxDim > 20 ? 100 : 1);
    // Nhân vật có bộ xương (humanoid glTF/Mixamo/Meshy) luôn quay mặt về +Z dù vai rộng (X) > độ dày ngực (Z)
    const forwardAxis: '+z' | '+x' = hasSkinnedSkeleton ? '+z' : (sizeZ >= sizeX * 0.92 ? '+z' : '+x');

    // 2. Duyệt cây phân cấp của glbEntity để thu thập xương và hệ trục xoay chuẩn Character Space
    const usedNames = new Set<string>();
    const addBoneEntry = (
      node: pc.GraphNode,
      rawName: string,
      label: string,
      depth: number,
      isSkinned: boolean,
      isRigidPartSafe: boolean,
      charRestQuat: pc.Quat,
      parentCharRestQuat: pc.Quat,
      parentAccumScale: number
    ) => {
      let key = rawName || 'Bone';
      let suffix = 1;
      while (usedNames.has(key)) {
        suffix++;
        key = `${rawName}_${suffix}`;
      }
      usedNames.add(key);
      const restPos = node.getLocalPosition().clone();
      const restQuat = node.getLocalRotation().clone();
      const restScale = node.getLocalScale().clone();
      const cleanCheck = label.replace(/^mixamorig:?/i, '').trim();
      const isRootOrHips = key === '__root__' || /^(hips|pelvis|root|armature|center)$/i.test(cleanCheck);
      const posUnitScale = parentAccumScale < 0.05
        ? (1 / Math.max(1e-4, parentAccumScale))
        : (isRootOrHips && restPos.length() > 25 ? 100 : 1);

      bonesMap.set(key, {
        name: key,
        label,
        depth,
        isSkinnedBone: isSkinned,
        isRootOrHips,
        isRigidPartSafe,
        node,
        restPos,
        restQuat,
        restScale,
        charRestQuat: charRestQuat.clone(),
        parentCharRestQuat: parentCharRestQuat.clone(),
        tposeLocalQuat: restQuat.clone(),
        tposeCharQuat: charRestQuat.clone(),
        posUnitScale,
        curRotDelta: { x: 0, y: 0, z: 0 },
        curPosDelta: { x: 0, y: 0, z: 0 }
      });
    };

    const identityQuat = new pc.Quat(0, 0, 0, 1);
    const identityMat = new pc.Mat4();
    const nodeRestCharMat = new Map<any, pc.Mat4>();
    const nodeParentMap = new Map<any, any>();
    nodeRestCharMat.set(glbEntity, identityMat.clone());

    // Luôn thêm node gốc để kể cả GLB chỉ có 1 mesh vẫn tạo chuyển động keyframe được
    addBoneEntry(glbEntity, '__root__', 'Toàn bộ mô hình (Root)', 0, false, true, identityQuat, identityQuat, 1);

    const walk = (node: any, depth: number, parentCharQuat: pc.Quat, parentScale: number, parentCharMat: pc.Mat4) => {
      if (!node) return;
      const children: any[] = node.children || [];
      const bakedSiblings = bakedOriginSiblingCountByParent.get(node) || 0;
      for (const ch of children) {
        const nm = String(ch?.name || '').trim();
        const isSkinned = skinnedNodes.has(ch);
        const localPos = (ch as pc.GraphNode).getLocalPosition
          ? (ch as pc.GraphNode).getLocalPosition().clone()
          : new pc.Vec3(0, 0, 0);
        const localQuat = (ch as pc.GraphNode).getLocalRotation
          ? (ch as pc.GraphNode).getLocalRotation().clone()
          : new pc.Quat(0, 0, 0, 1);
        const localScale = (ch as pc.GraphNode).getLocalScale
          ? (ch as pc.GraphNode).getLocalScale()
          : new pc.Vec3(1, 1, 1);
        const charQuat = new pc.Quat().mul2(parentCharQuat, localQuat).normalize();
        const nextScale = parentScale * Math.max(1e-4, Math.abs(localScale.y || 1));
        const localMat = new pc.Mat4().setTRS(localPos, localQuat, localScale);
        const charMat = new pc.Mat4().mul2(parentCharMat, localMat);
        nodeRestCharMat.set(ch, charMat);
        nodeParentMap.set(ch, node);

        // Xác định node con có an toàn để AI xoay độc lập không:
        // - Nếu có skin bone thật -> luôn an toàn.
        // - Nếu mô hình có skeleton thật mà node này là mesh ngoài skin -> KHÔNG an toàn (dễ lệch mesh).
        // - Nếu mô hình không có skin (đồ vật/xe/props): chỉ an toàn khi node đặt đúng tâm khớp (localPos != 0)
        //   và KHÔNG thuộc nhóm nhiều sub-mesh vật liệu dùng chung pivot gốc (0,0,0).
        let isRigidPartSafe = false;
        if (isSkinned) {
          isRigidPartSafe = true;
        } else if (!hasSkinnedSkeleton) {
          const atOrigin = localPos.length() < 0.005;
          const childBakedCount = bakedOriginSiblingCountByParent.get(ch) || 0;
          if (!atOrigin && bakedSiblings < 2) {
            isRigidPartSafe = true;
          } else if (atOrigin && bakedSiblings < 2 && childBakedCount === 0 && (ch?.render || ch?.model)) {
            // Kiểm tra xem tâm hình học của mesh có nằm gần pivot (0,0,0) không
            const mis = (ch.render?.meshInstances || ch.model?.meshInstances || []) as any[];
            if (mis.length > 0 && mis[0]?.mesh?.aabb) {
              const a = mis[0].mesh.aabb;
              const centerDist = Math.hypot(a.center.x, a.center.y, a.center.z);
              const maxHalf = Math.max(0.01, a.halfExtents.x, a.halfExtents.y, a.halfExtents.z);
              isRigidPartSafe = centerDist <= Math.max(0.03, maxHalf * 0.2);
            }
          }
        }

        if (nm && (isSkinned || skinnedNodes.size === 0 || !nm.startsWith('Untitled'))) {
          const cleanLabel = nm.replace(/^mixamorig:?/i, '');
          addBoneEntry(ch as pc.GraphNode, nm, cleanLabel, depth, isSkinned, isRigidPartSafe, charQuat, parentCharQuat, parentScale);
        }
        walk(ch, depth + 1, charQuat, nextScale, charMat);
      }
    };
    walk(glbEntity, 1, identityQuat, 1, identityMat);

    // 2a. Tự động nhận diện & dựng bộ khớp bánh xe ảo (Steer Pivot + Spin Pivot) cho mô hình phương tiện (ô tô, xe tải, xe 2 bánh tách rời bánh)
    // mà KHÔNG cần chỉnh file GLB gốc — mỗi bánh (lốp + vành + trục + nan hoa + phanh) được gom đúng tâm trục quay của chính bánh đó.
    const autoWheels: Array<{
      id: string;
      isFront: boolean;
      radius: number;
      axleX: number;
      axleY: number;
      axleZ: number;
      steerPivot: pc.Entity;
      spinPivot: pc.Entity;
    }> = [];
    let wheelbase = Math.max(0.5, (forwardAxis === '+z' ? sizeZ : sizeX) * 0.6);

    if (!hasSkinnedSkeleton) {
      const WHEEL_PART_RE = /(?:^|[\s_.-])(wheel|tire|tyre|rim|hub|spoke|alloy|rotor|brake|caliper|banh|lop)/i;
      const WHEEL_EXCLUDE_RE = /(steering|spare|wheelwell|arch|fender|mudguard|body|door|glass|mirror|seat|pedal|chain|crank|drivetrain|handlebar|fork|cockpit|accessories|accessory)/i;
      const PRIMARY_WHEEL_RE = /(?:^|[\s_.-])(tire|tyre|wheel|banh|lop)/i;
      const STEER_ONLY_RE = /(?:^|[\s_.-])(brake|caliper)/i;

      type WheelCand = {
        node: any;
        name: string;
        cx: number;
        cy: number;
        cz: number;
        mnY: number;
        mxY: number;
        sx: number;
        sy: number;
        sz: number;
        isPrimary: boolean;
        isSteerOnly: boolean;
        charMat: pc.Mat4;
      };

      const candidates: WheelCand[] = [];
      const mergedCandidates: WheelCand[] = [];
      const tmpPt = new pc.Vec3();
      const tmpOut = new pc.Vec3();

      nodeRestCharMat.forEach((charMat, node) => {
        if (node === glbEntity) return;
        const nm = String(node?.name || '').trim();
        if (!nm || !WHEEL_PART_RE.test(nm) || WHEEL_EXCLUDE_RE.test(nm)) return;
        const mis = (node?.render?.meshInstances || node?.model?.meshInstances || []) as any[];
        if (!mis || mis.length === 0) return;

        let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
        let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
        for (const mi of mis) {
          const ma = mi?.mesh?.aabb;
          if (!ma) continue;
          const loX = ma.center.x - ma.halfExtents.x, hiX = ma.center.x + ma.halfExtents.x;
          const loY = ma.center.y - ma.halfExtents.y, hiY = ma.center.y + ma.halfExtents.y;
          const loZ = ma.center.z - ma.halfExtents.z, hiZ = ma.center.z + ma.halfExtents.z;
          for (const x of [loX, hiX]) {
            for (const y of [loY, hiY]) {
              for (const z of [loZ, hiZ]) {
                tmpPt.set(x, y, z);
                charMat.transformPoint(tmpPt, tmpOut);
                if (tmpOut.x < mnX) mnX = tmpOut.x;
                if (tmpOut.y < mnY) mnY = tmpOut.y;
                if (tmpOut.z < mnZ) mnZ = tmpOut.z;
                if (tmpOut.x > mxX) mxX = tmpOut.x;
                if (tmpOut.y > mxY) mxY = tmpOut.y;
                if (tmpOut.z > mxZ) mxZ = tmpOut.z;
              }
            }
          }
        }
        if (!Number.isFinite(mnX)) return;
        const sx = Math.max(1e-4, mxX - mnX);
        const sy = Math.max(1e-4, mxY - mnY);
        const sz = Math.max(1e-4, mxZ - mnZ);
        const longSpan = forwardAxis === '+z' ? sz : sx;
        const latSpan = forwardAxis === '+z' ? sx : sz;
        const vehicleLength = forwardAxis === '+z' ? sizeZ : sizeX;
        const vehicleWidth = forwardAxis === '+z' ? sizeX : sizeZ;

        const candObj: WheelCand = {
          node,
          name: nm,
          cx: (mnX + mxX) * 0.5,
          cy: (mnY + mxY) * 0.5,
          cz: (mnZ + mxZ) * 0.5,
          mnY,
          mxY,
          sx,
          sy,
          sz,
          isPrimary: false,
          isSteerOnly: STEER_ONLY_RE.test(nm),
          charMat
        };

        // Mesh gộp nhiều bánh cùng lúc (vd: xe đạp BMX gộp cả 2 bánh trước+sau vào cùng 1 mesh Tyres/Rims/Spokes/Hubs)
        if (longSpan > Math.max(sy * 1.45, vehicleLength * 0.48)) {
          candObj.isPrimary = PRIMARY_WHEEL_RE.test(nm) && sy >= sizeY * 0.12;
          mergedCandidates.push(candObj);
          return;
        }
        if (latSpan > vehicleWidth * 0.48) return;

        const circRatio = Math.max(longSpan, sy) / Math.max(1e-4, Math.min(longSpan, sy));
        candObj.isPrimary = PRIMARY_WHEEL_RE.test(nm) && sy >= sizeY * 0.08 && circRatio <= 1.38;
        candidates.push(candObj);
      });

      const decomposeMat = (m: pc.Mat4): { pos: pc.Vec3; quat: pc.Quat; scale: pc.Vec3 } => {
        const pos = m.getTranslation(new pc.Vec3());
        const scale = m.getScale(new pc.Vec3());
        const d = m.data;
        const rotM = new pc.Mat4();
        const rd = rotM.data;
        const sx = Math.abs(scale.x) > 1e-6 ? scale.x : 1;
        const sy = Math.abs(scale.y) > 1e-6 ? scale.y : 1;
        const sz = Math.abs(scale.z) > 1e-6 ? scale.z : 1;
        rd[0] = d[0] / sx; rd[1] = d[1] / sx; rd[2] = d[2] / sx; rd[3] = 0;
        rd[4] = d[4] / sy; rd[5] = d[5] / sy; rd[6] = d[6] / sy; rd[7] = 0;
        rd[8] = d[8] / sz; rd[9] = d[9] / sz; rd[10] = d[10] / sz; rd[11] = 0;
        rd[12] = 0; rd[13] = 0; rd[14] = 0; rd[15] = 1;
        const quat = new pc.Quat().setFromMat4(rotM).normalize();
        return { pos, quat, scale };
      };

      // Fallback nếu mô hình chỉ đặt tên rim/hub mà không có từ khóa tire/wheel
      let primaryList = candidates.filter((c) => c.isPrimary);
      if (primaryList.length < 2) {
        primaryList = candidates.filter((c) => {
          const longSpan = forwardAxis === '+z' ? c.sz : c.sx;
          const circRatio = Math.max(longSpan, c.sy) / Math.max(1e-4, Math.min(longSpan, c.sy));
          return /(?:^|[\s_.-])(rim|wheel)/i.test(c.name) && c.sy >= sizeY * 0.08 && circRatio <= 1.38;
        });
      }

      if (primaryList.length >= 2) {
        type WheelCluster = {
          axleX: number;
          axleY: number;
          axleZ: number;
          radius: number;
          hasFrontName: boolean;
          hasRearName: boolean;
          parts: WheelCand[];
        };
        const clusters: WheelCluster[] = [];

        for (const prim of primaryList) {
          const rad = Math.max(prim.sy, forwardAxis === '+z' ? prim.sz : prim.sx) * 0.5;
          const existing = clusters.find(
            (cl) =>
              Math.hypot(cl.axleX - prim.cx, cl.axleY - prim.cy, cl.axleZ - prim.cz) < Math.max(cl.radius, rad) * 0.45
          );
          if (existing) {
            existing.parts.push(prim);
            if (rad > existing.radius) {
              existing.radius = rad;
              existing.axleX = prim.cx;
              existing.axleY = prim.cy;
              existing.axleZ = prim.cz;
            }
            if (/front|trước|truoc/i.test(prim.name)) existing.hasFrontName = true;
            if (/rear|back|sau/i.test(prim.name)) existing.hasRearName = true;
          } else {
            clusters.push({
              axleX: prim.cx,
              axleY: prim.cy,
              axleZ: prim.cz,
              radius: rad,
              hasFrontName: /front|trước|truoc/i.test(prim.name),
              hasRearName: /rear|back|sau/i.test(prim.name),
              parts: [prim]
            });
          }
        }

        // Gắn các bộ phận con (vành, trục, 5 nan hoa, phanh đĩa...) vào đúng cụm bánh gần nhất cùng phía trái/phải
        const usedNodes = new Set<any>(primaryList.map((p) => p.node));
        const bodyCenterLat = rawMin && rawMax
          ? (forwardAxis === '+z' ? (rawMin.x + rawMax.x) * 0.5 : (rawMin.z + rawMax.z) * 0.5)
          : 0;

        for (const cand of candidates) {
          if (usedNodes.has(cand.node)) continue;
          const candLat = (forwardAxis === '+z' ? cand.cx : cand.cz) - bodyCenterLat;
          let bestCl: WheelCluster | null = null;
          let bestDist = Infinity;
          for (const cl of clusters) {
            const clLat = (forwardAxis === '+z' ? cl.axleX : cl.axleZ) - bodyCenterLat;
            // Không gắn bộ phận bên trái sang bánh bên phải (nếu xe có 2 dãy bánh rõ ràng)
            if (clusters.length >= 4 && Math.abs(clLat) > 0.05 && Math.abs(candLat) > 0.05 && clLat * candLat < 0) {
              continue;
            }
            const d = Math.hypot(cl.axleX - cand.cx, cl.axleY - cand.cy, cl.axleZ - cand.cz);
            if (d <= cl.radius * 1.18 && d < bestDist) {
              bestDist = d;
              bestCl = cl;
            }
          }
          if (bestCl) {
            bestCl.parts.push(cand);
            usedNodes.add(cand.node);
            if (/front|trước|truoc/i.test(cand.name)) bestCl.hasFrontName = true;
            if (/rear|back|sau/i.test(cand.name)) bestCl.hasRearName = true;
          }
        }

        if (clusters.length >= 2) {
          const longs = clusters.map((c) => (forwardAxis === '+z' ? c.axleZ : c.axleX));
          const minL = Math.min(...longs);
          const maxL = Math.max(...longs);
          const midL = (minL + maxL) * 0.5;
          if (maxL - minL > 0.05) {
            wheelbase = maxL - minL;
          }

          const reparentedNodes = new Set<any>();

          clusters.forEach((cl, idx) => {
            const clusterNodeSet = new Set<any>(cl.parts.map((p) => p.node));
            const longCoord = forwardAxis === '+z' ? cl.axleZ : cl.axleX;
            const isFront = cl.hasFrontName
              ? true
              : cl.hasRearName
                ? false
                : longCoord > midL;

            const steerPivot = new pc.Entity(`AutoWheelSteer_${idx}`);
            steerPivot.setLocalPosition(cl.axleX, cl.axleY, cl.axleZ);
            steerPivot.setLocalRotation(0, 0, 0, 1);
            steerPivot.setLocalScale(1, 1, 1);
            glbEntity.addChild(steerPivot);

            const spinPivot = new pc.Entity(`AutoWheelSpin_${idx}`);
            spinPivot.setLocalPosition(0, 0, 0);
            spinPivot.setLocalRotation(0, 0, 0, 1);
            spinPivot.setLocalScale(1, 1, 1);
            steerPivot.addChild(spinPivot);

            for (const part of cl.parts) {
              // Bỏ qua nếu nút cha trực tiếp của nó đã nằm trong cùng cụm bánh
              let anc = nodeParentMap.get(part.node);
              let coveredByAnc = false;
              while (anc && anc !== glbEntity) {
                if (clusterNodeSet.has(anc)) {
                  coveredByAnc = true;
                  break;
                }
                anc = nodeParentMap.get(anc);
              }
              if (coveredByAnc) continue;

              const { pos, quat, scale } = decomposeMat(part.charMat);
              const targetParent = part.isSteerOnly ? steerPivot : spinPivot;
              try {
                if (part.node.parent) {
                  part.node.parent.removeChild(part.node);
                }
                targetParent.addChild(part.node);
                part.node.setLocalPosition(pos.x - cl.axleX, pos.y - cl.axleY, pos.z - cl.axleZ);
                part.node.setLocalRotation(quat);
                part.node.setLocalScale(scale);
                reparentedNodes.add(part.node);
              } catch (_) {}
            }

            autoWheels.push({
              id: `wheel_${idx}`,
              isFront,
              radius: Math.max(0.05, cl.radius),
              axleX: cl.axleX,
              axleY: cl.axleY,
              axleZ: cl.axleZ,
              steerPivot,
              spinPivot
            });
          });

          // Đồng bộ lại restPos/restQuat/restScale của các node bánh xe đã reparent để resetBonePose giữ nguyên vị trí chuẩn
          bonesMap.forEach((b) => {
            if (reparentedNodes.has(b.node)) {
              b.restPos = b.node.getLocalPosition().clone();
              b.restQuat = b.node.getLocalRotation().clone();
              b.restScale = b.node.getLocalScale().clone();
              b.isRigidPartSafe = false;
            }
          });
        }
      } else if (mergedCandidates.length > 0 && this.app?.graphicsDevice) {
        // Trường hợp xe 2 bánh hoặc 4 bánh gộp chung các bánh vào cùng 1 mesh theo vật liệu (vd: xe đạp BMX gộp bánh trước + bánh sau trong Tyres/Rims/Spokes/Hubs):
        // tự động tách tam giác theo đúng tâm trục từng bánh tại runtime (giữ nguyên 100% vật liệu, UV, normal và không cần sửa file GLB gốc!).
        const device = this.app.graphicsDevice;

        const readMeshPositionsAndIndices = (mesh: any): { positions: Float32Array; indices: Uint32Array } | null => {
          if (!mesh?.vertexBuffer) return null;
          const vb = mesh.vertexBuffer;
          const numVerts = vb.getNumVertices ? vb.getNumVertices() : 0;
          if (numVerts < 3) return null;
          const posArr: number[] = [];
          try {
            mesh.getPositions(posArr);
          } catch (_) {}
          if (posArr.length < numVerts * 3) return null;
          const positions = new Float32Array(posArr);

          const prim = mesh.primitive?.[0];
          const primCount = prim?.count || 0;
          const primBase = prim?.base || 0;
          if (prim && prim.indexed) {
            const idxArr: number[] = [];
            try {
              mesh.getIndices(idxArr);
            } catch (_) {}
            if (idxArr.length >= 3) {
              const slice = primCount > 0 && primBase + primCount <= idxArr.length
                ? idxArr.slice(primBase, primBase + primCount)
                : idxArr;
              return { positions, indices: new Uint32Array(slice) };
            }
            const ib = mesh.indexBuffer?.[0];
            if (ib?.lock) {
              const rawBuf = ib.lock();
              if (rawBuf) {
                const is32 = ib.getFormat && ib.getFormat() === pc.INDEXFORMAT_UINT32;
                const view = is32 ? new Uint32Array(rawBuf) : new Uint16Array(rawBuf);
                const end = primCount > 0 ? Math.min(view.length, primBase + primCount) : view.length;
                const out = new Uint32Array(Math.max(0, end - primBase));
                for (let k = primBase; k < end; k++) out[k - primBase] = view[k];
                if (out.length >= 3) return { positions, indices: out };
              }
            }
            return null;
          }
          const count = primCount > 0 ? primCount : numVerts;
          const out = new Uint32Array(count);
          for (let k = 0; k < count; k++) out[k] = primBase + k;
          return { positions, indices: out };
        };

        const primaryMerged = mergedCandidates
          .filter((c) => c.isPrimary || /(?:^|[\s_.-])(tyre|tire|rim|wheel)/i.test(c.name))
          .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || b.sy - a.sy)[0];

        if (primaryMerged) {
          const pmMis = (primaryMerged.node?.render?.meshInstances || primaryMerged.node?.model?.meshInstances || []) as any[];
          const pmData = pmMis.length === 1 ? readMeshPositionsAndIndices(pmMis[0]?.mesh) : null;
          if (pmData && pmData.indices.length >= 6) {
            const { positions, indices } = pmData;
            const nVerts = Math.floor(positions.length / 3);
            const charPts = new Float32Array(nVerts * 3);
            for (let i = 0; i < nVerts; i++) {
              tmpPt.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
              primaryMerged.charMat.transformPoint(tmpPt, tmpOut);
              charPts[i * 3] = tmpOut.x;
              charPts[i * 3 + 1] = tmpOut.y;
              charPts[i * 3 + 2] = tmpOut.z;
            }

            const vehicleWidth = forwardAxis === '+z' ? sizeX : sizeZ;
            const mergedLatSpan = forwardAxis === '+z' ? primaryMerged.sx : primaryMerged.sz;
            const isFourWaySplit = mergedLatSpan > vehicleWidth * 0.48;
            const midLong = forwardAxis === '+z' ? primaryMerged.cz : primaryMerged.cx;
            const midLat = forwardAxis === '+z' ? primaryMerged.cx : primaryMerged.cz;
            const bucketCount = isFourWaySplit ? 4 : 2;
            const buckets = Array.from({ length: bucketCount }, () => ({
              mnX: Infinity, mnY: Infinity, mnZ: Infinity,
              mxX: -Infinity, mxY: -Infinity, mxZ: -Infinity,
              triCount: 0
            }));
            let crossTris = 0;
            const totalTris = Math.floor(indices.length / 3);

            const getBucketIdx = (vx: number, vz: number): number => {
              const longV = forwardAxis === '+z' ? vz : vx;
              const isFrontB = longV >= midLong ? 1 : 0;
              if (!isFourWaySplit) return isFrontB;
              const latV = forwardAxis === '+z' ? vx : vz;
              const isPosLat = latV >= midLat ? 1 : 0;
              return isFrontB * 2 + isPosLat;
            };

            for (let t = 0; t + 2 < indices.length; t += 3) {
              const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
              const b0 = getBucketIdx(charPts[i0 * 3], charPts[i0 * 3 + 2]);
              const b1 = getBucketIdx(charPts[i1 * 3], charPts[i1 * 3 + 2]);
              const b2 = getBucketIdx(charPts[i2 * 3], charPts[i2 * 3 + 2]);
              if (b0 !== b1 || b1 !== b2) {
                crossTris++;
                continue;
              }
              const bk = buckets[b0];
              bk.triCount++;
              for (const vi of [i0, i1, i2]) {
                const vx = charPts[vi * 3], vy = charPts[vi * 3 + 1], vz = charPts[vi * 3 + 2];
                if (vx < bk.mnX) bk.mnX = vx; if (vx > bk.mxX) bk.mxX = vx;
                if (vy < bk.mnY) bk.mnY = vy; if (vy > bk.mxY) bk.mxY = vy;
                if (vz < bk.mnZ) bk.mnZ = vz; if (vz > bk.mxZ) bk.mxZ = vz;
              }
            }

            const validSplit =
              totalTris >= 8 &&
              crossTris / Math.max(1, totalTris) <= 0.02 &&
              buckets.every((bk) => {
                if (bk.triCount < 4 || !Number.isFinite(bk.mnX)) return false;
                const bsy = bk.mxY - bk.mnY;
                const bLong = forwardAxis === '+z' ? (bk.mxZ - bk.mnZ) : (bk.mxX - bk.mnX);
                const circRatio = Math.max(bLong, bsy) / Math.max(1e-4, Math.min(bLong, bsy));
                return bsy >= sizeY * 0.10 && circRatio <= 1.38;
              });

            if (validSplit) {
              const splitClusters = buckets.map((bk, bIdx) => {
                const axleX = (bk.mnX + bk.mxX) * 0.5;
                const axleY = (bk.mnY + bk.mxY) * 0.5;
                const axleZ = (bk.mnZ + bk.mxZ) * 0.5;
                const bsy = bk.mxY - bk.mnY;
                const bLong = forwardAxis === '+z' ? (bk.mxZ - bk.mnZ) : (bk.mxX - bk.mnX);
                const radius = Math.max(0.05, Math.max(bsy, bLong) * 0.5);
                const isFront = isFourWaySplit ? bIdx >= 2 : bIdx === 1;

                const steerPivot = new pc.Entity(`AutoWheelSteer_${bIdx}`);
                steerPivot.setLocalPosition(axleX, axleY, axleZ);
                steerPivot.setLocalRotation(0, 0, 0, 1);
                steerPivot.setLocalScale(1, 1, 1);
                glbEntity.addChild(steerPivot);

                const spinPivot = new pc.Entity(`AutoWheelSpin_${bIdx}`);
                spinPivot.setLocalPosition(0, 0, 0);
                spinPivot.setLocalRotation(0, 0, 0, 1);
                spinPivot.setLocalScale(1, 1, 1);
                steerPivot.addChild(spinPivot);

                return { id: `wheel_${bIdx}`, isFront, radius, axleX, axleY, axleZ, steerPivot, spinPivot };
              });

              const longs = splitClusters.map((c) => (forwardAxis === '+z' ? c.axleZ : c.axleX));
              const spanL = Math.max(...longs) - Math.min(...longs);
              if (spanL > 0.05) wheelbase = spanL;

              const wheelMinY = Math.min(...splitClusters.map((c) => c.axleY - c.radius * 1.18));
              const wheelMaxY = Math.max(...splitClusters.map((c) => c.axleY + c.radius * 1.18));
              let splitSuccessCount = 0;

              for (const mc of mergedCandidates) {
                // Với xe 2 bánh gộp mesh (xe đạp/xe máy), giữ nguyên cụm phanh (brake/caliper) cố định trên khung, chỉ tách phần quay của bánh
                if (!isFourWaySplit && mc.isSteerOnly) continue;
                // Chỉ tách các bộ phận nằm trong dải chiều cao bánh xe (loại trừ ghi đông/khung nếu đặt tên nhầm)
                if (mc.mnY < wheelMinY - 0.05 || mc.mxY > wheelMaxY + 0.05) continue;
                const origRender = mc.node?.render;
                const mis = (origRender?.meshInstances || mc.node?.model?.meshInstances || []) as any[];
                if (!mis || mis.length === 0) continue;

                const { pos: nodePos, quat: nodeQuat, scale: nodeScale } = decomposeMat(mc.charMat);
                const createdForNode: Array<{ parent: pc.Entity; ent: pc.Entity }> = [];
                let nodeSplitOk = true;

                for (let miIdx = 0; miIdx < mis.length; miIdx++) {
                  const origMi = mis[miIdx];
                  const origMesh = origMi?.mesh;
                  const mData = readMeshPositionsAndIndices(origMesh);
                  if (!mData || !origMesh?.vertexBuffer?.lock) {
                    nodeSplitOk = false;
                    break;
                  }

                  const vb = origMesh.vertexBuffer;
                  const fmt = vb.getFormat();
                  const origRawBuf = vb.lock();
                  if (!origRawBuf || !fmt) {
                    nodeSplitOk = false;
                    break;
                  }
                  const origBytes = new Uint8Array(origRawBuf);
                  const { positions: mPos, indices: mIdx } = mData;
                  const mVerts = Math.floor(mPos.length / 3);
                  const mCharPts = new Float32Array(mVerts * 3);
                  for (let vi = 0; vi < mVerts; vi++) {
                    tmpPt.set(mPos[vi * 3], mPos[vi * 3 + 1], mPos[vi * 3 + 2]);
                    mc.charMat.transformPoint(tmpPt, tmpOut);
                    mCharPts[vi * 3] = tmpOut.x;
                    mCharPts[vi * 3 + 1] = tmpOut.y;
                    mCharPts[vi * 3 + 2] = tmpOut.z;
                  }

                  const perClusterIdx: number[][] = splitClusters.map(() => []);
                  let rejectedTris = 0;
                  const mTotalTris = Math.floor(mIdx.length / 3);

                  for (let t = 0; t + 2 < mIdx.length; t += 3) {
                    const i0 = mIdx[t], i1 = mIdx[t + 1], i2 = mIdx[t + 2];
                    const cxT = (mCharPts[i0 * 3] + mCharPts[i1 * 3] + mCharPts[i2 * 3]) / 3;
                    const cyT = (mCharPts[i0 * 3 + 1] + mCharPts[i1 * 3 + 1] + mCharPts[i2 * 3 + 1]) / 3;
                    const czT = (mCharPts[i0 * 3 + 2] + mCharPts[i1 * 3 + 2] + mCharPts[i2 * 3 + 2]) / 3;
                    let bestC = -1;
                    let bestD = Infinity;
                    for (let ci = 0; ci < splitClusters.length; ci++) {
                      const cl = splitClusters[ci];
                      const d = Math.hypot(cxT - cl.axleX, cyT - cl.axleY, czT - cl.axleZ);
                      if (d < bestD) {
                        bestD = d;
                        bestC = ci;
                      }
                    }
                    if (bestC < 0 || bestD > splitClusters[bestC].radius * 1.22) {
                      rejectedTris++;
                      continue;
                    }
                    perClusterIdx[bestC].push(i0, i1, i2);
                  }

                  if (mTotalTris === 0 || rejectedTris / mTotalTris > 0.05) {
                    nodeSplitOk = false;
                    break;
                  }

                  const canCompact = fmt.interleaved !== false && fmt.size > 0 && origBytes.byteLength >= mVerts * fmt.size;
                  const vStride = fmt.size || 0;

                  for (let ci = 0; ci < splitClusters.length; ci++) {
                    const bIndices = perClusterIdx[ci];
                    if (bIndices.length < 3) continue;
                    const cl = splitClusters[ci];

                    let subVb: pc.VertexBuffer;
                    let finalIndices: Uint16Array | Uint32Array;
                    let bMnX = Infinity, bMnY = Infinity, bMnZ = Infinity;
                    let bMxX = -Infinity, bMxY = -Infinity, bMxZ = -Infinity;

                    if (canCompact) {
                      const remap = new Map<number, number>();
                      const usedVerts: number[] = [];
                      for (let k = 0; k < bIndices.length; k++) {
                        const oldVi = bIndices[k];
                        if (!remap.has(oldVi)) {
                          remap.set(oldVi, usedVerts.length);
                          usedVerts.push(oldVi);
                          const lx = mPos[oldVi * 3], ly = mPos[oldVi * 3 + 1], lz = mPos[oldVi * 3 + 2];
                          if (lx < bMnX) bMnX = lx; if (lx > bMxX) bMxX = lx;
                          if (ly < bMnY) bMnY = ly; if (ly > bMxY) bMxY = ly;
                          if (lz < bMnZ) bMnZ = lz; if (lz > bMxZ) bMxZ = lz;
                        }
                      }
                      const packed = new Uint8Array(usedVerts.length * vStride);
                      for (let nv = 0; nv < usedVerts.length; nv++) {
                        const srcOff = usedVerts[nv] * vStride;
                        packed.set(origBytes.subarray(srcOff, srcOff + vStride), nv * vStride);
                      }
                      subVb = new pc.VertexBuffer(device, fmt, usedVerts.length, {
                        usage: pc.BUFFER_STATIC,
                        data: packed.buffer
                      });
                      const use32 = usedVerts.length > 65535;
                      finalIndices = use32 ? new Uint32Array(bIndices.length) : new Uint16Array(bIndices.length);
                      for (let k = 0; k < bIndices.length; k++) {
                        finalIndices[k] = remap.get(bIndices[k])!;
                      }
                    } else {
                      let maxVi = 0;
                      for (let k = 0; k < bIndices.length; k++) {
                        const vi = bIndices[k];
                        if (vi > maxVi) maxVi = vi;
                        const lx = mPos[vi * 3], ly = mPos[vi * 3 + 1], lz = mPos[vi * 3 + 2];
                        if (lx < bMnX) bMnX = lx; if (lx > bMxX) bMxX = lx;
                        if (ly < bMnY) bMnY = ly; if (ly > bMxY) bMxY = ly;
                        if (lz < bMnZ) bMnZ = lz; if (lz > bMxZ) bMxZ = lz;
                      }
                      const cloned = origBytes.slice();
                      subVb = new pc.VertexBuffer(device, fmt, mVerts, {
                        usage: pc.BUFFER_STATIC,
                        data: cloned.buffer
                      });
                      const use32 = maxVi > 65535;
                      finalIndices = use32 ? new Uint32Array(bIndices) : new Uint16Array(bIndices);
                    }

                    const subIb = new pc.IndexBuffer(
                      device,
                      finalIndices instanceof Uint32Array ? pc.INDEXFORMAT_UINT32 : pc.INDEXFORMAT_UINT16,
                      finalIndices.length,
                      pc.BUFFER_STATIC,
                      finalIndices
                    );
                    const subMesh = new pc.Mesh(device);
                    subMesh.vertexBuffer = subVb;
                    subMesh.indexBuffer[0] = subIb;
                    subMesh.primitive[0] = {
                      type: pc.PRIMITIVE_TRIANGLES,
                      base: 0,
                      baseVertex: 0,
                      count: finalIndices.length,
                      indexed: true
                    };
                    subMesh.aabb = new pc.BoundingBox(
                      new pc.Vec3((bMnX + bMxX) * 0.5, (bMnY + bMxY) * 0.5, (bMnZ + bMxZ) * 0.5),
                      new pc.Vec3(Math.max(1e-4, (bMxX - bMnX) * 0.5), Math.max(1e-4, (bMxY - bMnY) * 0.5), Math.max(1e-4, (bMxZ - bMnZ) * 0.5))
                    );

                    const subEnt = new pc.Entity(`AutoWheelSplit_${ci}_${mc.name.slice(0, 24)}_${miIdx}`);
                    subEnt.setLocalPosition(nodePos.x - cl.axleX, nodePos.y - cl.axleY, nodePos.z - cl.axleZ);
                    subEnt.setLocalRotation(nodeQuat);
                    subEnt.setLocalScale(nodeScale);
                    subEnt.addComponent('render', {
                      type: 'asset',
                      castShadows: origRender?.castShadows ?? true,
                      receiveShadows: origRender?.receiveShadows ?? true,
                      layers: origRender?.layers ? [...origRender.layers] : undefined
                    });
                    const newMi = new pc.MeshInstance(subMesh, origMi.material, subEnt);
                    newMi.castShadow = origMi.castShadow ?? true;
                    newMi.receiveShadow = origMi.receiveShadow ?? true;
                    if (subEnt.render) {
                      subEnt.render.meshInstances = [newMi];
                    }
                    createdForNode.push({
                      parent: mc.isSteerOnly ? cl.steerPivot : cl.spinPivot,
                      ent: subEnt
                    });
                  }
                }

                if (nodeSplitOk && createdForNode.length >= splitClusters.length) {
                  for (const item of createdForNode) {
                    item.parent.addChild(item.ent);
                  }
                  mc.node.enabled = false;
                  bonesMap.forEach((b) => {
                    if (b.node === mc.node) b.isRigidPartSafe = false;
                  });
                  splitSuccessCount++;
                } else {
                  for (const item of createdForNode) {
                    try { item.ent.destroy(); } catch (_) {}
                  }
                }
              }

              if (splitSuccessCount > 0) {
                for (const cl of splitClusters) {
                  autoWheels.push(cl);
                }
              } else {
                for (const cl of splitClusters) {
                  try { cl.steerPivot.destroy(); } catch (_) {}
                }
              }
            }
          }
        }
      }
    }

    // 2b. Chuẩn hóa tư thế nghỉ (A-Pose / T-Pose / góc vai khác nhau) về chung Canonical T-Pose giải phẫu
    // (Cánh tay trái = +X, cánh tay phải = -X, đùi & cẳng chân = -Y) để retarget chính xác giữa các mô hình khác nhau về tư thế nghỉ & số lượng khớp!
    if (skinnedNodes.size >= 4) {
      const anatRest = this._resolveRigAnatomy({ bones: bonesMap });
      const getCharPos = (boneKey: string): pc.Vec3 | null => {
        const b = bonesMap.get(boneKey);
        if (!b || !b.node) return null;
        const m = nodeRestCharMat.get(b.node);
        return m ? m.getTranslation() : null;
      };
      // Xác định hướng ngang trái/phải theo hệ tọa độ nhân vật (chuẩn glTF facing +Z: LeftArm.x > RightArm.x)
      const pLArm = getCharPos(anatRest.lArm);
      const pRArm = getCharPos(anatRest.rArm);
      const leftSign = (pLArm && pRArm && pLArm.x < pRArm.x) ? -1 : 1;

      const fromToQuat = (uRaw: pc.Vec3, vRaw: pc.Vec3): pc.Quat => {
        const u = uRaw.clone().normalize();
        const v = vRaw.clone().normalize();
        const dot = Math.max(-1, Math.min(1, u.dot(v)));
        if (dot > 0.99999) return new pc.Quat(0, 0, 0, 1);
        const axis = new pc.Vec3().cross(u, v);
        if (axis.lengthSq() < 1e-8) {
          return new pc.Quat().setFromAxisAngle(new pc.Vec3(0, 0, 1), 180);
        }
        axis.normalize();
        return new pc.Quat().setFromAxisAngle(axis, (Math.acos(dot) * 180) / Math.PI).normalize();
      };

      const limbSpecs: Array<[string, string, pc.Vec3]> = [
        [anatRest.lArm, anatRest.lForeArm, new pc.Vec3(leftSign, 0, 0)],
        [anatRest.lForeArm, anatRest.lHand, new pc.Vec3(leftSign, 0, 0)],
        [anatRest.rArm, anatRest.rForeArm, new pc.Vec3(-leftSign, 0, 0)],
        [anatRest.rForeArm, anatRest.rHand, new pc.Vec3(-leftSign, 0, 0)],
        [anatRest.lUpLeg, anatRest.lLeg, new pc.Vec3(0, -1, 0)],
        [anatRest.lLeg, anatRest.lFoot, new pc.Vec3(0, -1, 0)],
        [anatRest.rUpLeg, anatRest.rLeg, new pc.Vec3(0, -1, 0)],
        [anatRest.rLeg, anatRest.rFoot, new pc.Vec3(0, -1, 0)]
      ];

      const alignByNode = new Map<any, { childNode: any; targetDir: pc.Vec3 }>();
      for (const [parentKey, childKey, targetDir] of limbSpecs) {
        if (!parentKey || !childKey || parentKey === '__root__' || childKey === '__root__' || parentKey === childKey) continue;
        const pb = bonesMap.get(parentKey);
        const cb = bonesMap.get(childKey);
        if (pb?.node && cb?.node && !alignByNode.has(pb.node)) {
          alignByNode.set(pb.node, { childNode: cb.node, targetDir });
        }
      }

      const nodeAccTPose = new Map<any, pc.Quat>();
      const nodeTPoseCharQuat = new Map<any, pc.Quat>();
      nodeAccTPose.set(glbEntity, identityQuat.clone());
      nodeTPoseCharQuat.set(glbEntity, identityQuat.clone());

      const walkTPose = (node: any, parentCharQuat: pc.Quat) => {
        const children: any[] = node?.children || [];
        for (const ch of children) {
          const localQuat = (ch as pc.GraphNode).getLocalRotation
            ? (ch as pc.GraphNode).getLocalRotation().clone()
            : new pc.Quat(0, 0, 0, 1);
          const charQuat = new pc.Quat().mul2(parentCharQuat, localQuat).normalize();
          const pAcc = nodeAccTPose.get(node) || identityQuat;
          let acc = pAcc.clone();

          const spec = alignByNode.get(ch);
          if (spec) {
            const mP = nodeRestCharMat.get(ch);
            const mC = nodeRestCharMat.get(spec.childNode);
            if (mP && mC) {
              const dRest = mC.getTranslation().sub(mP.getTranslation());
              if (dRest.lengthSq() > 1e-8) {
                dRest.normalize();
                const dCur = pAcc.transformVector(dRest, new pc.Vec3()).normalize();
                const qFix = fromToQuat(dCur, spec.targetDir);
                acc = new pc.Quat().mul2(qFix, pAcc).normalize();
              }
            }
          }

          nodeAccTPose.set(ch, acc);
          nodeTPoseCharQuat.set(ch, new pc.Quat().mul2(acc, charQuat).normalize());
          walkTPose(ch, charQuat);
        }
      };
      walkTPose(glbEntity, identityQuat);

      bonesMap.forEach((b) => {
        if (b.name === '__root__') return;
        const tpChar = nodeTPoseCharQuat.get(b.node);
        const parentNd = nodeParentMap.get(b.node);
        const parentTpChar = parentNd ? nodeTPoseCharQuat.get(parentNd) : null;
        if (tpChar) {
          b.tposeCharQuat = tpChar.clone();
          b.tposeLocalQuat = parentTpChar
            ? new pc.Quat().mul2(parentTpChar.clone().invert(), tpChar).normalize()
            : tpChar.clone();
        }
      });
    }

    // 3. Thu thập các Animation Clip có sẵn trong file GLB và các Clip Keyframe đã lưu
    const savedTl: GlbPropTimelineData | undefined = prop?.boneTimeline;
    const savedClipAliases: Record<string, string> =
      savedTl?.clipAliases && typeof savedTl.clipAliases === 'object'
        ? { ...savedTl.clipAliases }
        : {};
    const clips: Array<{
      name: string;
      rawName?: string;
      duration: number;
      resource: any;
      isCustomKeyframeClip?: boolean;
      poseSpace?: 'tpose' | 'rest';
      keyframes?: GlbBoneKeyframe[];
    }> = [];
    const rawAnims: any[] = Array.isArray(container?.animations) ? container.animations : [];
    for (let i = 0; i < rawAnims.length; i++) {
      const a = rawAnims[i];
      const track = a?.resource || a;
      if (!track) continue;
      const rawName = String(a?.name || track?.name || `Animation_${i + 1}`);
      const cName = (savedClipAliases[rawName] && String(savedClipAliases[rawName]).trim()) || rawName;
      const dur = Math.max(0.1, Number(track?.duration) || 2.5);
      clips.push({ name: cName, rawName, duration: dur, resource: track, isCustomKeyframeClip: false });
    }

    // 4. Khởi tạo hoặc khôi phục cấu hình Timeline từ prop.boneTimeline
    // Với xe 4 bánh (autoWheels >= 3), tự động cân phẳng các clip chạy mặt đất cũ từng bị gán nhầm độ nghiêng kiểu xe đạp (<= 12.5° khi pos.y = 0)
    // để cả 4 bánh luôn bám phẳng tuyệt đối trên mặt sàn (y = 0).
    const levelFlatFourWheelerKeyframes = (kfs: GlbBoneKeyframe[]) => {
      if (autoWheels.length < 3 || !Array.isArray(kfs) || kfs.length < 2) return;
      const rootKfs = kfs.filter((k) => k && k.boneName === '__root__');
      if (rootKfs.length < 2) return;
      let maxTiltDeg = 0;
      let maxAbsY = 0;
      const tmpUp = new pc.Vec3();
      const tmpFwd = new pc.Vec3();
      const fwdBase = forwardAxis === '+x' ? new pc.Vec3(1, 0, 0) : new pc.Vec3(0, 0, 1);
      const yawOff = forwardAxis === '+x' ? -90 : 0;
      for (const k of rootKfs) {
        maxAbsY = Math.max(maxAbsY, Math.abs(Number(k.pos?.y) || 0));
        const q = new pc.Quat().setFromEulerAngles(k.rot?.x || 0, k.rot?.y || 0, k.rot?.z || 0);
        q.transformVector(new pc.Vec3(0, 1, 0), tmpUp);
        const tilt = (Math.acos(Math.max(-1, Math.min(1, tmpUp.y))) * 180) / Math.PI;
        if (tilt > maxTiltDeg) maxTiltDeg = tilt;
      }
      if (maxAbsY < 0.02 && maxTiltDeg > 0.25 && maxTiltDeg <= 12.5) {
        for (const k of rootKfs) {
          const q = new pc.Quat().setFromEulerAngles(k.rot?.x || 0, k.rot?.y || 0, k.rot?.z || 0);
          q.transformVector(fwdBase, tmpFwd);
          const yawDeg = (Math.atan2(tmpFwd.x, tmpFwd.z) * 180) / Math.PI + yawOff;
          const wrappedYaw = (((yawDeg + 180) % 360) + 360) % 360 - 180;
          k.rot = { x: 0, y: Math.round(wrappedYaw * 100) / 100, z: 0 };
        }
      }
    };

    const savedCustomClips: GlbSavedKeyframeClip[] = Array.isArray(savedTl?.savedClips)
      ? JSON.parse(JSON.stringify(savedTl!.savedClips))
      : [];
    for (const sc of savedCustomClips) {
      if (!sc || !sc.name || !Array.isArray(sc.keyframes)) continue;
      levelFlatFourWheelerKeyframes(sc.keyframes);
      const existIdx = clips.findIndex((c) => c.name === sc.name);
      const entry = {
        name: sc.name,
        duration: Math.max(0.5, Number(sc.duration) || 2.4),
        resource: null,
        isCustomKeyframeClip: true,
        poseSpace: sc.poseSpace,
        keyframes: JSON.parse(JSON.stringify(sc.keyframes))
      };
      if (existIdx >= 0) clips[existIdx] = entry;
      else clips.push(entry);
    }

    const defaultMode: 'keyframes' | 'clip' = savedTl?.mode
      ? savedTl.mode
      : (clips.length > 0 ? 'clip' : 'keyframes');
    const defaultClipName = savedTl?.activeClipName || (clips.length > 0 ? clips[0].name : null);
    const matchedClip = clips.find((c) => c.name === defaultClipName) || clips[0];
    const defaultDuration = savedTl?.duration
      ? Math.max(0.5, Number(savedTl.duration))
      : (matchedClip ? matchedClip.duration : 3.0);

    const initialKeyframes: GlbBoneKeyframe[] = Array.isArray(savedTl?.keyframes)
      ? JSON.parse(JSON.stringify(savedTl!.keyframes))
      : [];
    levelFlatFourWheelerKeyframes(initialKeyframes);

    const savedStaticPose: GlbBonePoseEntry[] = Array.isArray(savedTl?.staticPose)
      ? JSON.parse(JSON.stringify(savedTl!.staticPose))
      : [];
    const savedPosesList: GlbSavedPose[] = Array.isArray(savedTl?.savedPoses)
      ? JSON.parse(JSON.stringify(savedTl!.savedPoses))
      : [];
    const restoredTime =
      typeof savedTl?.savedTime === 'number' && Number.isFinite(savedTl.savedTime)
        ? Math.max(0, Math.min(defaultDuration, savedTl.savedTime))
        : 0;

    const timeline: GlbPropTimelineData = {
      enabled: savedTl ? savedTl.enabled !== false : (clips.length > 0),
      playing: savedTl ? savedTl.playing !== false : (clips.length > 0),
      loop: savedTl ? savedTl.loop !== false : true,
      speed: savedTl && typeof savedTl.speed === 'number' ? savedTl.speed : 1.0,
      duration: defaultDuration,
      mode: defaultMode,
      inPlace: savedTl && typeof savedTl.inPlace === 'boolean' ? savedTl.inPlace : true,
      poseSpace: savedTl?.poseSpace,
      savedTime: restoredTime,
      staticPose: savedStaticPose,
      savedPoses: savedPosesList,
      activeClipName: defaultClipName,
      keyframes: initialKeyframes,
      savedClips: savedCustomClips,
      clipAliases: savedClipAliases,
      handGrabs: Array.isArray(savedTl?.handGrabs) ? JSON.parse(JSON.stringify(savedTl!.handGrabs)) : []
    };

    // Xác định xương chậu / gốc chính (Hips/Pelvis/Root) để khóa chuyển động tại chỗ (triệt tiêu root-motion trôi ngang X/Z)
    let hipsNode: pc.GraphNode | null = null;
    let fallbackRootBone: { node: pc.GraphNode; depth: number } | null = null;
    bonesMap.forEach((b) => {
      if (!b.isSkinnedBone) return;
      const clean = b.label.replace(/^mixamorig:?/i, '').trim();
      if (!hipsNode && /^(hips|pelvis|bip01[_\s-]*pelvis|root[_\s-]*jnt)$/i.test(clean)) {
        hipsNode = b.node;
      } else if (!fallbackRootBone || b.depth < fallbackRootBone.depth) {
        fallbackRootBone = { node: b.node, depth: b.depth };
      }
    });
    if (!hipsNode && fallbackRootBone) {
      hipsNode = (fallbackRootBone as { node: pc.GraphNode; depth: number }).node;
    }

    const rig = {
      propId,
      wrapper,
      glbEntity,
      hipsNode,
      hasSkinnedSkeleton,
      modelSize: { x: sizeX, y: sizeY, z: sizeZ },
      forwardAxis,
      meterScale,
      wheelbase,
      autoWheels,
      bones: bonesMap,
      clips,
      animComp: null as any,
      timeline,
      currentTime: restoredTime
    };
    this._propRigMap.set(propId, rig);

    // Nếu ở chế độ clip và có clip sẵn, gắn component anim và phát ngay
    if (timeline.mode === 'clip' && matchedClip && timeline.playing) {
      this.playPropClip(propId, matchedClip.name);
    } else if (timeline.mode === 'keyframes') {
      this._stopRigClipAnim(rig);
      if (!timeline.playing && savedStaticPose.length > 0) {
        this.resetBonePose(propId);
        for (const entry of savedStaticPose) {
          if (entry && entry.boneName) {
            this.setBonePoseDelta(propId, entry.boneName, entry.rot, entry.pos);
          }
        }
      } else if (timeline.keyframes.length > 0) {
        this.evaluatePropKeyframesAtTime(propId, restoredTime);
      }
    }
  }

  hasPropRig(propId: string | null | undefined): boolean {
    if (!propId) return false;
    return this._propRigMap.has(propId);
  }

  getPropRigSummary(propId: string | null | undefined): {
    hasSkinnedSkeleton: boolean;
    isRigidModel: boolean;
    safeBoneNames: string[];
    allBoneCount: number;
    autoWheelCount: number;
    embeddedClipNames: string[];
    modelSize: { x: number; y: number; z: number };
    forwardAxis: '+z' | '+x';
    meterScale: number;
  } | null {
    if (!propId) return null;
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;
    const safeBoneNames: string[] = [];
    rig.bones.forEach((b) => {
      if (b.isRigidPartSafe) {
        safeBoneNames.push(b.name);
      }
    });
    if (safeBoneNames.length === 0 && rig.bones.has('__root__')) {
      safeBoneNames.push('__root__');
    }
    const embeddedClipNames = rig.clips
      .filter((c) => !c.isCustomKeyframeClip && !!c.resource)
      .map((c) => c.name);
    return {
      hasSkinnedSkeleton: rig.hasSkinnedSkeleton,
      isRigidModel: !rig.hasSkinnedSkeleton,
      safeBoneNames,
      allBoneCount: rig.bones.size,
      autoWheelCount: rig.autoWheels.length,
      embeddedClipNames,
      modelSize: { ...rig.modelSize },
      forwardAxis: rig.forwardAxis,
      meterScale: rig.meterScale
    };
  }

  getPropBones(propId: string): GlbBoneInfo[] {
    const rig = this._propRigMap.get(propId);
    if (!rig) return [];
    const list: GlbBoneInfo[] = [];
    rig.bones.forEach((b) => {
      list.push({
        name: b.name,
        label: b.label,
        depth: b.depth,
        isSkinnedBone: b.isSkinnedBone
      });
    });
    return list;
  }

  getPropClips(propId: string): Array<{ name: string; duration: number; isCustom?: boolean; kfCount?: number }> {
    const rig = this._propRigMap.get(propId);
    if (!rig) return [];
    return rig.clips.map((c) => ({
      name: c.name,
      duration: c.duration,
      isCustom: !!c.isCustomKeyframeClip,
      kfCount: Array.isArray(c.keyframes) ? c.keyframes.length : undefined
    }));
  }

  getPropTimeline(propId: string): GlbPropTimelineData | null {
    const rig = this._propRigMap.get(propId);
    return rig ? rig.timeline : null;
  }

  getPropCurrentTime(propId: string): number {
    const rig = this._propRigMap.get(propId);
    return rig ? rig.currentTime : 0;
  }

  /** Hiển thị quả cầu đánh dấu vị trí khớp xương đang chọn trên màn hình 3D */
  highlightPropBone(propId: string | null, boneName: string | null): void {
    if (!this.app || !propId || !boneName) {
      this._highlightedBoneNode = null;
      if (this._boneHighlightEntity) this._boneHighlightEntity.enabled = false;
      return;
    }
    const rig = this._propRigMap.get(propId);
    const bone = rig?.bones.get(boneName);
    if (!bone || !bone.node) {
      this._highlightedBoneNode = null;
      if (this._boneHighlightEntity) this._boneHighlightEntity.enabled = false;
      return;
    }
    this._highlightedBoneNode = bone.node;
    if (!this._boneHighlightEntity) {
      const marker = new pc.Entity('BoneHighlightMarker');
      marker.addComponent('render', { type: 'sphere' });
      const mat = new pc.StandardMaterial();
      mat.diffuse = new pc.Color(0, 0, 0);
      mat.emissive = new pc.Color(0.0, 0.95, 0.85);
      mat.useLighting = false;
      mat.opacity = 0.88;
      mat.blendType = pc.BLEND_NORMAL;
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.update();
      if (marker.render) {
        marker.render.meshInstances.forEach((mi: any) => {
          mi.material = mat;
          mi.pick = false;
        });
      }
      marker.setLocalScale(0.32, 0.32, 0.32);
      this.app.root.addChild(marker);
      this._boneHighlightEntity = marker;
    }
    this._boneHighlightEntity.enabled = true;
    const wp = bone.node.getPosition();
    this._boneHighlightEntity.setPosition(wp.x, wp.y, wp.z);
  }

  getBonePoseDelta(propId: string, boneName: string): { rot: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } } {
    const rig = this._propRigMap.get(propId);
    const bone = rig?.bones.get(boneName);
    if (!bone) {
      return { rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } };
    }
    return {
      rot: { ...bone.curRotDelta },
      pos: { ...bone.curPosDelta }
    };
  }

  setBonePoseDelta(
    propId: string,
    boneName: string,
    rot: { x: number; y: number; z: number },
    pos?: { x: number; y: number; z: number }
  ): void {
    const rig = this._propRigMap.get(propId);
    const bone = rig?.bones.get(boneName);
    if (!bone) return;

    // Tắt hoàn toàn animComp của clip khi chỉnh sửa/đánh giá pose ở chế độ keyframes
    if (rig && rig.timeline.mode === 'keyframes') {
      this._stopRigClipAnim(rig);
    }

    const rx = Number(rot?.x) || 0;
    const ry = Number(rot?.y) || 0;
    const rz = Number(rot?.z) || 0;
    const qCharDelta = new pc.Quat().setFromEulerAngles(rx, ry, rz);
    const useTPose = rig?.timeline?.poseSpace === 'tpose';
    this._applyCharacterSpaceBoneQuat(bone, qCharDelta, { x: rx, y: ry, z: rz }, pos, useTPose);
  }

  resetBonePose(propId: string, boneName?: string): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    if (boneName) {
      const b = rig.bones.get(boneName);
      if (b) {
        b.curRotDelta = { x: 0, y: 0, z: 0 };
        b.curPosDelta = { x: 0, y: 0, z: 0 };
        b.node.setLocalRotation(b.restQuat);
        b.node.setLocalPosition(b.restPos);
        b.node.setLocalScale(b.restScale);
      }
      return;
    }
    rig.bones.forEach((b) => {
      b.curRotDelta = { x: 0, y: 0, z: 0 };
      b.curPosDelta = { x: 0, y: 0, z: 0 };
      b.node.setLocalRotation(b.restQuat);
      b.node.setLocalPosition(b.restPos);
      b.node.setLocalScale(b.restScale);
    });
    if (rig.autoWheels && rig.autoWheels.length > 0) {
      for (const w of rig.autoWheels) {
        w.steerPivot.setLocalRotation(0, 0, 0, 1);
        w.spinPivot.setLocalRotation(0, 0, 0, 1);
      }
    }
  }

  /**
   * Trích xuất ngữ cảnh tư thế hiện tại và thông số giải phẫu (T-Pose / A-Pose, xương chính, ngón tay, góc xoay hiện có)
   * phục vụ cho AI chỉnh tư thế nhân vật chuẩn xác trên mọi bộ rig (Mixamo, Unreal/Avery, Blender, Meshy...).
   */
  getPropPoseContext(propId: string): {
    hasSkinnedSkeleton: boolean;
    poseSpace: 'rest' | 'tpose';
    restArmDropDeg: number;
    anatomy: Record<string, string>;
    safeBoneNames: string[];
    fingerBones: string[];
    currentPose: Array<{
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos: { x: number; y: number; z: number };
    }>;
  } | null {
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;

    const anat = this._resolveRigAnatomy(rig);
    const poseSpace: 'rest' | 'tpose' = rig.timeline.poseSpace === 'tpose' ? 'tpose' : 'rest';

    // Đo góc hạ cánh tay ở tư thế nghỉ gốc (0° = T-Pose dang ngang, ~45° = A-Pose, ~70° = buông dọc thân)
    let restArmDropDeg = 0;
    if (poseSpace !== 'tpose' && rig.hasSkinnedSkeleton) {
      const angles: number[] = [];
      const measureArmDrop = (armKey: string, sign: 1 | -1) => {
        if (!armKey || armKey === '__root__') return;
        const b = rig.bones.get(armKey);
        if (!b || !b.tposeCharQuat || !b.charRestQuat) return;
        // qToTPose đưa cánh tay từ rest -> T-Pose ngang: xoay quanh trục Z dương cho tay trái (+1) hoặc âm cho tay phải (-1)
        const qToTPose = new pc.Quat().mul2(b.tposeCharQuat, b.charRestQuat.clone().invert()).normalize();
        const euler = qToTPose.getEulerAngles();
        const zDeg = sign * euler.z;
        if (Number.isFinite(zDeg) && zDeg >= -15 && zDeg <= 95) {
          angles.push(Math.max(0, Math.min(85, zDeg)));
        }
      };
      measureArmDrop(anat.lArm, 1);
      measureArmDrop(anat.rArm, -1);
      if (angles.length > 0) {
        restArmDropDeg = Math.round(angles.reduce((s, v) => s + v, 0) / angles.length);
      }
    }

    const fingerRe = /(thumb|index|middle|ring|pinky|little|finger)/i;
    const safeBoneNames: string[] = [];
    const fingerBones: string[] = [];
    const currentPose: Array<{
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos: { x: number; y: number; z: number };
    }> = [];

    rig.bones.forEach((b) => {
      if (b.isRigidPartSafe !== false) {
        if (fingerRe.test(b.label) || fingerRe.test(b.name)) {
          fingerBones.push(b.name);
        } else {
          safeBoneNames.push(b.name);
        }
      }
      const hasRot =
        Math.abs(b.curRotDelta.x) > 0.2 ||
        Math.abs(b.curRotDelta.y) > 0.2 ||
        Math.abs(b.curRotDelta.z) > 0.2;
      const hasPos =
        Math.abs(b.curPosDelta.x) > 0.005 ||
        Math.abs(b.curPosDelta.y) > 0.005 ||
        Math.abs(b.curPosDelta.z) > 0.005;
      if (hasRot || hasPos) {
        currentPose.push({
          boneName: b.name,
          rot: {
            x: Math.round(b.curRotDelta.x * 10) / 10,
            y: Math.round(b.curRotDelta.y * 10) / 10,
            z: Math.round(b.curRotDelta.z * 10) / 10
          },
          pos: {
            x: Math.round(b.curPosDelta.x * 100) / 100,
            y: Math.round(b.curPosDelta.y * 100) / 100,
            z: Math.round(b.curPosDelta.z * 100) / 100
          }
        });
      }
    });

    return {
      hasSkinnedSkeleton: rig.hasSkinnedSkeleton,
      poseSpace,
      restArmDropDeg,
      anatomy: anat,
      safeBoneNames,
      fingerBones,
      currentPose
    };
  }

  /**
   * Chụp nhanh trạng thái góc xoay/vị trí toàn bộ khớp xương và danh sách Keyframe hiện tại (phục vụ Hoàn tác / Undo).
   */
  capturePoseSnapshot(propId: string): {
    bones: Array<{
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos: { x: number; y: number; z: number };
    }>;
    keyframes: GlbBoneKeyframe[];
  } {
    const rig = this._propRigMap.get(propId);
    if (!rig) return { bones: [], keyframes: [] };
    const bones: Array<{
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos: { x: number; y: number; z: number };
    }> = [];
    rig.bones.forEach((b) => {
      const hasRot =
        Math.abs(b.curRotDelta.x) > 0.01 ||
        Math.abs(b.curRotDelta.y) > 0.01 ||
        Math.abs(b.curRotDelta.z) > 0.01;
      const hasPos =
        Math.abs(b.curPosDelta.x) > 0.001 ||
        Math.abs(b.curPosDelta.y) > 0.001 ||
        Math.abs(b.curPosDelta.z) > 0.001;
      if (hasRot || hasPos) {
        bones.push({
          boneName: b.name,
          rot: { ...b.curRotDelta },
          pos: { ...b.curPosDelta }
        });
      }
    });
    const keyframes = rig.timeline.keyframes.map((k) => ({
      ...k,
      rot: { ...k.rot },
      pos: k.pos ? { ...k.pos } : { x: 0, y: 0, z: 0 }
    }));
    return { bones, keyframes };
  }

  /**
   * Đồng bộ ảnh chụp tư thế tĩnh hiện tại của tất cả khớp xương & mốc thời gian vào rig.timeline
   * để đảm bảo khi lưu props.json và nhấn F5, tư thế nhân vật được khôi phục nguyên vẹn 100%.
   */
  syncStaticPoseToTimeline(propId: string): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    const snap = this.capturePoseSnapshot(propId);
    rig.timeline.staticPose = snap.bones.map((b) => ({
      boneName: b.boneName,
      rot: {
        x: Math.round(b.rot.x * 10) / 10,
        y: Math.round(b.rot.y * 10) / 10,
        z: Math.round(b.rot.z * 10) / 10
      },
      pos: {
        x: Math.round(b.pos.x * 100) / 100,
        y: Math.round(b.pos.y * 100) / 100,
        z: Math.round(b.pos.z * 100) / 100
      }
    }));
    rig.timeline.savedTime = Math.round((Number(rig.currentTime) || 0) * 100) / 100;
  }

  getPropSavedPoses(propId: string): GlbSavedPose[] {
    const rig = this._propRigMap.get(propId);
    if (!rig || !Array.isArray(rig.timeline.savedPoses)) return [];
    return rig.timeline.savedPoses;
  }

  saveCurrentPosePreset(propId: string, rawName: string): GlbSavedPose | null {
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;
    const name = String(rawName || '').trim() || `Tư thế #${(rig.timeline.savedPoses?.length || 0) + 1}`;
    const snap = this.capturePoseSnapshot(propId);
    const bones: GlbBonePoseEntry[] = snap.bones.map((b) => ({
      boneName: b.boneName,
      rot: {
        x: Math.round(b.rot.x * 10) / 10,
        y: Math.round(b.rot.y * 10) / 10,
        z: Math.round(b.rot.z * 10) / 10
      },
      pos: {
        x: Math.round(b.pos.x * 100) / 100,
        y: Math.round(b.pos.y * 100) / 100,
        z: Math.round(b.pos.z * 100) / 100
      }
    }));
    if (!Array.isArray(rig.timeline.savedPoses)) {
      rig.timeline.savedPoses = [];
    }
    const existingIdx = rig.timeline.savedPoses.findIndex(
      (p) => p && p.name.trim().toLowerCase() === name.toLowerCase()
    );
    const poseEntry: GlbSavedPose = {
      id: existingIdx >= 0 ? rig.timeline.savedPoses[existingIdx].id : ('pose_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36)),
      name,
      poseSpace: rig.timeline.poseSpace === 'tpose' ? 'tpose' : 'rest',
      createdAt: Date.now(),
      bones
    };
    if (existingIdx >= 0) {
      rig.timeline.savedPoses[existingIdx] = poseEntry;
    } else {
      rig.timeline.savedPoses.unshift(poseEntry);
    }
    this.syncStaticPoseToTimeline(propId);
    return poseEntry;
  }

  applySavedPosePreset(
    propId: string,
    poseId: string,
    opts?: { time?: number; autoKey?: boolean }
  ): {
    pose: GlbSavedPose | null;
    appliedBones: string[];
    previousSnapshot: {
      bones: Array<{
        boneName: string;
        rot: { x: number; y: number; z: number };
        pos: { x: number; y: number; z: number };
      }>;
      keyframes: GlbBoneKeyframe[];
    };
  } {
    const previousSnapshot = this.capturePoseSnapshot(propId);
    const rig = this._propRigMap.get(propId);
    if (!rig || !Array.isArray(rig.timeline.savedPoses)) {
      return { pose: null, appliedBones: [], previousSnapshot };
    }
    const found = rig.timeline.savedPoses.find((p) => p && p.id === poseId) || null;
    if (!found) {
      return { pose: null, appliedBones: [], previousSnapshot };
    }
    // Nếu tư thế đã lưu rỗng (tư thế gốc 0,0,0), reset về dáng gốc
    if (!Array.isArray(found.bones) || found.bones.length === 0) {
      this._stopRigClipAnim(rig);
      rig.timeline.mode = 'keyframes';
      rig.timeline.enabled = true;
      rig.timeline.playing = false;
      this.resetBonePose(propId);
      this.syncStaticPoseToTimeline(propId);
      return { pose: found, appliedBones: [], previousSnapshot };
    }
    const res = this.applyAiStaticPose(
      propId,
      {
        mode: 'replace',
        poseSpace: found.poseSpace === 'tpose' ? 'tpose' : 'rest',
        bones: found.bones
      },
      opts
    );
    return { pose: found, appliedBones: res.appliedBones, previousSnapshot: res.previousSnapshot };
  }

  deleteSavedPosePreset(propId: string, poseId: string): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig || !Array.isArray(rig.timeline.savedPoses)) return false;
    const before = rig.timeline.savedPoses.length;
    rig.timeline.savedPoses = rig.timeline.savedPoses.filter((p) => p && p.id !== poseId);
    return rig.timeline.savedPoses.length < before;
  }

  /**
   * Khôi phục nhanh toàn bộ khớp xương & Keyframe từ một bản chụp đã lưu trước đó.
   */
  restorePoseSnapshot(
    propId: string,
    snapshot: {
      bones: Array<{
        boneName: string;
        rot: { x: number; y: number; z: number };
        pos: { x: number; y: number; z: number };
      }>;
      keyframes?: GlbBoneKeyframe[];
    }
  ): void {
    const rig = this._propRigMap.get(propId);
    if (!rig || !snapshot) return;
    this._stopRigClipAnim(rig);
    rig.timeline.mode = 'keyframes';
    rig.timeline.playing = false;
    if (Array.isArray(snapshot.keyframes)) {
      rig.timeline.keyframes = snapshot.keyframes.map((k) => ({
        ...k,
        rot: { ...k.rot },
        pos: k.pos ? { ...k.pos } : { x: 0, y: 0, z: 0 }
      }));
    }
    this.resetBonePose(propId);
    for (const entry of snapshot.bones || []) {
      this.setBonePoseDelta(propId, entry.boneName, entry.rot, entry.pos);
    }
    this.syncStaticPoseToTimeline(propId);
  }

  /**
   * Áp dụng trực tiếp dữ liệu boneTimeline (staticPose, savedPoses, keyframes, clip) vào 1 rig đã nạp sẵn trên scene
   * — dùng khi người dùng chuyển giữa các Mẫu thiết kế (Design Presets) mà không cần F5.
   */
  applySavedTimelineToRig(propId: string, savedTl?: GlbPropTimelineData | null): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    this._stopRigClipAnim(rig);
    if (!savedTl) {
      rig.timeline.mode = 'keyframes';
      rig.timeline.playing = false;
      rig.timeline.keyframes = [];
      rig.timeline.staticPose = [];
      rig.currentTime = 0;
      this.resetBonePose(propId);
      return;
    }

    const dur = Math.max(0.5, Number(savedTl.duration) || rig.timeline.duration || 3.0);
    const restoredTime =
      typeof savedTl.savedTime === 'number' && Number.isFinite(savedTl.savedTime)
        ? Math.max(0, Math.min(dur, savedTl.savedTime))
        : 0;

    rig.timeline.enabled = savedTl.enabled !== false;
    rig.timeline.playing = !!savedTl.playing;
    rig.timeline.loop = savedTl.loop !== false;
    rig.timeline.speed = typeof savedTl.speed === 'number' && savedTl.speed > 0 ? savedTl.speed : 1.0;
    rig.timeline.duration = dur;
    rig.timeline.mode = savedTl.mode === 'clip' ? 'clip' : 'keyframes';
    rig.timeline.inPlace = typeof savedTl.inPlace === 'boolean' ? savedTl.inPlace : true;
    rig.timeline.poseSpace = savedTl.poseSpace;
    rig.timeline.savedTime = restoredTime;
    rig.timeline.activeClipName = savedTl.activeClipName ?? rig.timeline.activeClipName;
    rig.timeline.keyframes = Array.isArray(savedTl.keyframes) ? JSON.parse(JSON.stringify(savedTl.keyframes)) : [];
    rig.timeline.staticPose = Array.isArray(savedTl.staticPose) ? JSON.parse(JSON.stringify(savedTl.staticPose)) : [];
    rig.timeline.savedPoses = Array.isArray(savedTl.savedPoses) ? JSON.parse(JSON.stringify(savedTl.savedPoses)) : [];
    rig.timeline.handGrabs = Array.isArray(savedTl.handGrabs) ? JSON.parse(JSON.stringify(savedTl.handGrabs)) : [];
    rig.currentTime = restoredTime;

    if (rig.timeline.mode === 'clip' && rig.timeline.activeClipName && rig.timeline.playing) {
      this.playPropClip(propId, rig.timeline.activeClipName);
    } else {
      this.resetBonePose(propId);
      if (!rig.timeline.playing && rig.timeline.staticPose.length > 0) {
        for (const entry of rig.timeline.staticPose) {
          if (entry && entry.boneName) {
            this.setBonePoseDelta(propId, entry.boneName, entry.rot, entry.pos);
          }
        }
      } else if (rig.timeline.keyframes.length > 0) {
        this.evaluatePropKeyframesAtTime(propId, restoredTime);
      }
    }
  }

  /**
   * Chụp ảnh màn hình 3D hiện tại (thu gọn về maxDim) để Vision AI đối chiếu trực quan tư thế vừa dựng với ảnh mẫu.
   */
  captureSceneSnapshotBase64(maxDim = 640): { dataUrl: string; base64: string; mimeType: string } | null {
    const cv = this.app?.graphicsDevice?.canvas as HTMLCanvasElement | undefined;
    if (!cv || !cv.width || !cv.height) return null;
    try {
      const scale = Math.min(1, maxDim / Math.max(cv.width, cv.height));
      const cw = Math.max(64, Math.round(cv.width * scale));
      const ch = Math.max(64, Math.round(cv.height * scale));
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(cv, 0, 0, cw, ch);
      const dataUrl = out.toDataURL('image/jpeg', 0.86);
      return {
        dataUrl,
        base64: dataUrl.replace(/^data:[^;]+;base64,/, ''),
        mimeType: 'image/jpeg'
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Áp dụng một tư thế tĩnh (hoặc tinh chỉnh từng khớp) do NLF SMPL 3D hoặc AI tạo trực tiếp lên bộ xương nhân vật
   * tại mốc thời gian hiện tại (và tự động tạo/cập nhật Keyframe nếu Auto-Key đang bật).
   * Tự động quy đổi chính xác từ không gian Canonical T-Pose (poseSpace: 'tpose') sang hệ poseSpace hiện hành của timeline
   * bằng đẳng thức quaternion tuyệt đối để mọi bộ rig (A-Pose / T-Pose / Mixamo / Unreal) khớp 1:1 không sai lệch.
   */
  applyAiStaticPose(
    propId: string,
    spec: {
      mode?: 'replace' | 'adjust';
      poseSpace?: 'tpose' | 'rest';
      sourceLegLength?: number;
      bones: Array<{
        boneName: string;
        rot?: { x?: number; y?: number; z?: number };
        pos?: { x?: number; y?: number; z?: number };
      }>;
    },
    opts?: {
      time?: number;
      autoKey?: boolean;
    }
  ): {
    appliedBones: string[];
    previousSnapshot: {
      bones: Array<{
        boneName: string;
        rot: { x: number; y: number; z: number };
        pos: { x: number; y: number; z: number };
      }>;
      keyframes: GlbBoneKeyframe[];
    };
  } {
    const previousSnapshot = this.capturePoseSnapshot(propId);
    const rig = this._propRigMap.get(propId);
    if (!rig || !spec || !Array.isArray(spec.bones)) {
      return { appliedBones: [], previousSnapshot };
    }

    const mode: 'replace' | 'adjust' = spec.mode === 'adjust' ? 'adjust' : 'replace';
    const inputPoseSpace: 'tpose' | 'rest' = spec.poseSpace === 'tpose' ? 'tpose' : 'rest';
    const time = Math.max(0, Math.min(rig.timeline.duration, Number(opts?.time ?? rig.currentTime) || 0));
    const autoKey = opts?.autoKey !== false;

    this._stopRigClipAnim(rig);
    rig.timeline.mode = 'keyframes';
    rig.timeline.enabled = true;
    rig.timeline.playing = false;

    const anat = this._resolveRigAnatomy(rig);
    const hasInvertedMeshySpine =
      anat.lowerSpine !== anat.chest &&
      /spine02/i.test(anat.lowerSpine) &&
      /^spine$/i.test(anat.chest.replace(/^mixamorig:?/i, '').trim());

    const aliasMap: Record<string, string> = {
      hips: anat.hips,
      pelvis: anat.hips,
      root: anat.hips,
      spine: anat.lowerSpine,
      spine1: anat.midSpine,
      spine01: anat.lowerSpine,
      spine2: anat.chest,
      spine02: anat.midSpine,
      spine03: anat.chest,
      chest: anat.chest,
      upperchest: anat.chest,
      torso: anat.chest,
      neck: anat.neck,
      neck01: anat.neck,
      head: anat.head,
      leftshoulder: anat.lShoulder !== anat.chest ? anat.lShoulder : anat.lArm,
      claviclel: anat.lShoulder !== anat.chest ? anat.lShoulder : anat.lArm,
      rightshoulder: anat.rShoulder !== anat.chest ? anat.rShoulder : anat.rArm,
      clavicler: anat.rShoulder !== anat.chest ? anat.rShoulder : anat.rArm,
      leftarm: anat.lArm,
      leftupperarm: anat.lArm,
      upperarml: anat.lArm,
      rightarm: anat.rArm,
      rightupperarm: anat.rArm,
      upperarmr: anat.rArm,
      leftforearm: anat.lForeArm,
      leftlowerarm: anat.lForeArm,
      lowerarml: anat.lForeArm,
      rightforearm: anat.rForeArm,
      rightlowerarm: anat.rForeArm,
      lowerarmr: anat.rForeArm,
      lefthand: anat.lHand,
      handl: anat.lHand,
      righthand: anat.rHand,
      handr: anat.rHand,
      leftupleg: anat.lUpLeg,
      leftthigh: anat.lUpLeg,
      thighl: anat.lUpLeg,
      rightupleg: anat.rUpLeg,
      rightthigh: anat.rUpLeg,
      thighr: anat.rUpLeg,
      leftleg: anat.lLeg,
      leftcalf: anat.lLeg,
      leftshin: anat.lLeg,
      calfl: anat.lLeg,
      rightleg: anat.rLeg,
      rightcalf: anat.rLeg,
      rightshin: anat.rLeg,
      calfr: anat.rLeg,
      leftfoot: anat.lFoot,
      footl: anat.lFoot,
      rightfoot: anat.rFoot,
      footr: anat.rFoot
    };

    const resolveBoneName = (raw: string): string | null => {
      if (!raw) return null;
      const trimmed = String(raw).trim();
      const clean = trimmed.replace(/^mixamorig:?/i, '').replace(/[\s_.-]+/g, '').toLowerCase();
      if (hasInvertedMeshySpine && (clean === 'spine' || clean === 'spine1' || clean === 'spine2')) {
        if (aliasMap[clean] && rig.bones.has(aliasMap[clean])) {
          return aliasMap[clean];
        }
      }
      if (rig.bones.has(trimmed)) return trimmed;
      for (const b of rig.bones.values()) {
        const bClean = b.label.replace(/^mixamorig:?/i, '').replace(/[\s_.-]+/g, '').toLowerCase();
        if (b.name.toLowerCase() === trimmed.toLowerCase() || bClean === clean) {
          return b.name;
        }
      }
      if (aliasMap[clean] && rig.bones.has(aliasMap[clean])) {
        return aliasMap[clean];
      }
      for (const b of rig.bones.values()) {
        const bClean = b.label.replace(/[\s_.-]+/g, '').toLowerCase();
        if (bClean.includes(clean) || clean.includes(bClean)) {
          return b.name;
        }
      }
      return null;
    };

    const clampAngle = (v: any): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      const wrapped = (((n + 180) % 360) + 360) % 360 - 180;
      return Math.round(wrapped * 10) / 10;
    };
    const clampPos = (v: any, isHipsOrRoot: boolean): number => {
      const lim = isHipsOrRoot ? 2.5 : 0.4;
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.round(Math.max(-lim, Math.min(lim, n)) * 100) / 100;
    };

    // Đo tỷ lệ chiều dài chân thực tế của rig đích nếu nguồn SMPL có cung cấp sourceLegLength
    let legPosScale = 1.0;
    if (inputPoseSpace === 'tpose' && Number(spec.sourceLegLength) > 0.1 && rig.hasSkinnedSkeleton) {
      const bLU = rig.bones.get(anat.lUpLeg);
      const bLL = rig.bones.get(anat.lLeg);
      const bLF = rig.bones.get(anat.lFoot);
      const bRU = rig.bones.get(anat.rUpLeg);
      const bRL = rig.bones.get(anat.rLeg);
      const bRF = rig.bones.get(anat.rFoot);
      if (bLU?.node && bLL?.node && bLF?.node && bRU?.node && bRL?.node && bRF?.node) {
        const invGlb = rig.glbEntity.getWorldTransform().clone().invert();
        const getL = (nd: pc.GraphNode) => invGlb.transformPoint(nd.getPosition(), new pc.Vec3());
        const rigLeg =
          0.5 * (getL(bLU.node).distance(getL(bLL.node)) + getL(bRU.node).distance(getL(bRL.node))) +
          0.5 * (getL(bLL.node).distance(getL(bLF.node)) + getL(bRL.node).distance(getL(bRF.node)));
        if (rigLeg > 0.15) {
          legPosScale = Math.max(0.4, Math.min(2.2, rigLeg / Number(spec.sourceLegLength)));
        }
      }
    }

    const timelineUsesTPose = rig.timeline.poseSpace === 'tpose';
    const mergedByBone = new Map<string, { quat: pc.Quat; pos: { x: number; y: number; z: number } }>();

    for (const item of spec.bones) {
      if (!item || !item.boneName) continue;
      const resolved = resolveBoneName(item.boneName);
      if (!resolved) continue;
      const targetBone = rig.bones.get(resolved);
      if (!targetBone || targetBone.isRigidPartSafe === false) continue;

      const isHipsOrRoot = resolved === '__root__' || resolved === anat.hips || targetBone.isRootOrHips;
      let rx = clampAngle(item.rot?.x);
      const ry = clampAngle(item.rot?.y);
      const rz = clampAngle(item.rot?.z);

      // Ràng buộc giải phẫu khớp gối chỉ áp khi AI tự ước lượng thô ở không gian 'rest' (không bóp méo SMPL 3D chuẩn)
      if (
        rig.hasSkinnedSkeleton &&
        inputPoseSpace !== 'tpose' &&
        !timelineUsesTPose &&
        (resolved === anat.lLeg || resolved === anat.rLeg) &&
        resolved !== anat.lUpLeg &&
        resolved !== anat.rUpLeg
      ) {
        if (rx < -5) rx = Math.abs(rx);
      }

      const qStep = new pc.Quat().setFromEulerAngles(rx, ry, rz);
      const posStep = item.pos
        ? {
            x: clampPos((Number(item.pos.x) || 0) * (isHipsOrRoot ? legPosScale : 1), isHipsOrRoot),
            y: clampPos((Number(item.pos.y) || 0) * (isHipsOrRoot ? legPosScale : 1), isHipsOrRoot),
            z: clampPos((Number(item.pos.z) || 0) * (isHipsOrRoot ? legPosScale : 1), isHipsOrRoot)
          }
        : {
            x: mode === 'adjust' ? targetBone.curPosDelta.x : 0,
            y: mode === 'adjust' ? targetBone.curPosDelta.y : 0,
            z: mode === 'adjust' ? targetBone.curPosDelta.z : 0
          };

      const existing = mergedByBone.get(resolved);
      if (existing) {
        // Cộng dồn chuỗi động học cha -> con khi nhiều khớp SMPL ánh xạ vào cùng 1 xương đích
        existing.quat = new pc.Quat().mul2(existing.quat, qStep).normalize();
        existing.pos = {
          x: clampPos(existing.pos.x + posStep.x, isHipsOrRoot),
          y: clampPos(existing.pos.y + posStep.y, isHipsOrRoot),
          z: clampPos(existing.pos.z + posStep.z, isHipsOrRoot)
        };
      } else {
        mergedByBone.set(resolved, { quat: qStep, pos: posStep });
      }
    }

    if (mergedByBone.size === 0) {
      return { appliedBones: [], previousSnapshot };
    }

    // Quy đổi chính xác giữa Canonical T-Pose ('tpose') và không gian hiện hành của Timeline ('rest' hoặc 'tpose')
    const resolvedEntries = new Map<string, { rot: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } }>();
    for (const [boneName, entry] of mergedByBone.entries()) {
      const b = rig.bones.get(boneName);
      if (!b) continue;
      let qOut = entry.quat;

      if (inputPoseSpace === 'tpose' && !timelineUsesTPose && b.tposeLocalQuat && b.tposeCharQuat) {
        // qTargetLocal = tposeLocalQuat * inv(tposeCharQuat) * qTPoseChar * tposeCharQuat
        // qLocalDelta  = inv(restQuat) * qTargetLocal
        // qRestChar    = charRestQuat * qLocalDelta * inv(charRestQuat)
        const qTpInv = b.tposeCharQuat.clone().invert();
        const qLocalTpDelta = new pc.Quat().mul2(new pc.Quat().mul2(qTpInv, entry.quat), b.tposeCharQuat);
        const qTargetLocal = new pc.Quat().mul2(b.tposeLocalQuat, qLocalTpDelta).normalize();
        const qLocalFromRest = new pc.Quat().mul2(b.restQuat.clone().invert(), qTargetLocal).normalize();
        const qRestChar = new pc.Quat().mul2(
          new pc.Quat().mul2(b.charRestQuat, qLocalFromRest),
          b.charRestQuat.clone().invert()
        ).normalize();
        qOut = qRestChar;
      }

      const eOut = qOut.getEulerAngles();
      resolvedEntries.set(boneName, {
        rot: {
          x: Math.round(eOut.x * 10) / 10,
          y: Math.round(eOut.y * 10) / 10,
          z: Math.round(eOut.z * 10) / 10
        },
        pos: entry.pos
      });
    }

    if (mode === 'replace') {
      const previouslyAffected = new Set<string>();
      for (const b of previousSnapshot.bones) {
        previouslyAffected.add(b.boneName);
      }
      for (const kf of rig.timeline.keyframes) {
        previouslyAffected.add(kf.boneName);
      }
      this.resetBonePose(propId);
      if (autoKey) {
        const zeroRot = { x: 0, y: 0, z: 0 };
        const zeroPos = { x: 0, y: 0, z: 0 };
        for (const oldBone of previouslyAffected) {
          if (!resolvedEntries.has(oldBone)) {
            const hasOtherTimeKf = rig.timeline.keyframes.some(
              (k) => k.boneName === oldBone && Math.abs(k.time - time) > 0.04
            );
            if (hasOtherTimeKf) {
              this.upsertBoneKeyframe(propId, oldBone, time, zeroRot, zeroPos);
            } else {
              rig.timeline.keyframes = rig.timeline.keyframes.filter(
                (k) => !(k.boneName === oldBone && Math.abs(k.time - time) <= 0.04)
              );
            }
          }
        }
      }
    }

    const appliedBones: string[] = [];
    for (const [boneName, tf] of resolvedEntries.entries()) {
      this.setBonePoseDelta(propId, boneName, tf.rot, tf.pos);
      if (autoKey) {
        this.upsertBoneKeyframe(propId, boneName, time, tf.rot, tf.pos);
      }
      appliedBones.push(boneName);
    }

    rig.currentTime = time;
    this.syncStaticPoseToTimeline(propId);

    return { appliedBones, previousSnapshot };
  }

  upsertBoneKeyframe(
    propId: string,
    boneName: string,
    time: number,
    rot: { x: number; y: number; z: number },
    pos?: { x: number; y: number; z: number }
  ): GlbBoneKeyframe | null {
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;
    rig.timeline.mode = 'keyframes';
    rig.timeline.enabled = true;
    this._stopRigClipAnim(rig);
    const clampedTime = Math.round(Math.max(0, Math.min(rig.timeline.duration, Number(time) || 0)) * 100) / 100;
    const cleanRot = {
      x: Math.round((Number(rot?.x) || 0) * 10) / 10,
      y: Math.round((Number(rot?.y) || 0) * 10) / 10,
      z: Math.round((Number(rot?.z) || 0) * 10) / 10
    };
    const cleanPos = {
      x: Math.round((Number(pos?.x) || 0) * 100) / 100,
      y: Math.round((Number(pos?.y) || 0) * 100) / 100,
      z: Math.round((Number(pos?.z) || 0) * 100) / 100
    };

    // Nếu đã có keyframe cùng xương ở cùng mốc thời gian (sai số <= 0.04s) thì cập nhật
    const existing = rig.timeline.keyframes.find(
      (k) => k.boneName === boneName && Math.abs(k.time - clampedTime) <= 0.04
    );
    if (existing) {
      existing.time = clampedTime;
      existing.rot = cleanRot;
      existing.pos = cleanPos;
      return existing;
    }

    const created: GlbBoneKeyframe = {
      id: 'kf_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e5).toString(36),
      time: clampedTime,
      boneName,
      rot: cleanRot,
      pos: cleanPos
    };
    rig.timeline.keyframes.push(created);
    rig.timeline.keyframes.sort((a, b) => a.time - b.time);
    return created;
  }

  deleteBoneKeyframe(propId: string, kfId: string): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    const idx = rig.timeline.keyframes.findIndex((k) => k.id === kfId);
    if (idx >= 0) {
      rig.timeline.keyframes.splice(idx, 1);
      this.evaluatePropKeyframesAtTime(propId, rig.currentTime);
    }
  }

  clearAllBoneKeyframes(propId: string): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    this.clearPropHandGrabs(propId, true);
    rig.timeline.keyframes = [];
    rig.timeline.playing = false;
    this.resetBonePose(propId);
  }

  /** Nội suy tư thế toàn bộ khớp xương tại thời điểm t bằng Quaternion Slerp trong Character Cardinal Space */
  evaluatePropKeyframesAtTime(propId: string, time: number): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    if (rig.timeline.mode === 'keyframes') {
      this._stopRigClipAnim(rig);
    }
    const dur = Math.max(0.1, rig.timeline.duration || 3.0);
    const t = Math.max(0, Math.min(dur, time));
    rig.currentTime = t;

    const kfs = rig.timeline.keyframes;
    if (!Array.isArray(kfs) || kfs.length === 0) return;

    // Nhóm keyframes theo boneName
    const byBone = new Map<string, GlbBoneKeyframe[]>();
    for (const k of kfs) {
      if (!byBone.has(k.boneName)) byBone.set(k.boneName, []);
      byBone.get(k.boneName)!.push(k);
    }

    byBone.forEach((list, boneName) => {
      const bone = rig.bones.get(boneName);
      if (!bone || list.length === 0) return;
      list.sort((a, b) => a.time - b.time);

      if (list.length === 1) {
        const only = list[0];
        this.setBonePoseDelta(propId, boneName, only.rot, only.pos);
        return;
      }

      // Tìm cặp keyframe kề trước và kề sau thời điểm t
      let kfA: GlbBoneKeyframe | null = null;
      let kfB: GlbBoneKeyframe | null = null;
      let span = 0;
      let localT = 0;

      if (Math.abs(t - list[0].time) <= 0.0005) {
        this.setBonePoseDelta(propId, boneName, list[0].rot, list[0].pos);
        return;
      }
      if (Math.abs(t - list[list.length - 1].time) <= 0.0005) {
        const last = list[list.length - 1];
        this.setBonePoseDelta(propId, boneName, last.rot, last.pos);
        return;
      }

      if (t < list[0].time) {
        if (rig.timeline.loop && list.length >= 2) {
          kfA = list[list.length - 1];
          kfB = list[0];
          span = (dur - kfA.time) + kfB.time;
          localT = (dur - kfA.time) + t;
        } else {
          this.setBonePoseDelta(propId, boneName, list[0].rot, list[0].pos);
          return;
        }
      } else if (t > list[list.length - 1].time) {
        if (rig.timeline.loop && list.length >= 2) {
          kfA = list[list.length - 1];
          kfB = list[0];
          span = (dur - kfA.time) + kfB.time;
          localT = t - kfA.time;
        } else {
          const last = list[list.length - 1];
          this.setBonePoseDelta(propId, boneName, last.rot, last.pos);
          return;
        }
      } else {
        for (let i = 0; i < list.length - 1; i++) {
          if (t >= list[i].time && t <= list[i + 1].time) {
            kfA = list[i];
            kfB = list[i + 1];
            span = kfB.time - kfA.time;
            localT = t - kfA.time;
            break;
          }
        }
      }

      if (!kfA || !kfB || span <= 0.0001) {
        const fallback = kfA || list[0];
        this.setBonePoseDelta(propId, boneName, fallback.rot, fallback.pos);
        return;
      }

      const useTPose = rig.timeline.poseSpace === 'tpose';
      const rawAlpha = Math.max(0, Math.min(1, localT / span));
      // Với clip mocap/GLB mẫu dày (poseSpace === 'tpose') hoặc quỹ đạo cong dày (>= 12 điểm, vd: xe chạy vòng tròn)
      // dùng nội suy tuyến tính để giữ vận tốc đều mượt, không bị khựng giật tại từng mốc keyframe.
      const useLinear = useTPose || list.length >= 12;
      const alpha = useLinear ? rawAlpha : (rawAlpha * rawAlpha * (3 - 2 * rawAlpha));
      const qA = new pc.Quat().setFromEulerAngles(kfA.rot.x, kfA.rot.y, kfA.rot.z);
      const qB = new pc.Quat().setFromEulerAngles(kfB.rot.x, kfB.rot.y, kfB.rot.z);
      const qInterp = new pc.Quat().slerp(qA, qB, alpha);
      const eulerInterp = qInterp.getEulerAngles();

      const posInterp = {
        x: (kfA.pos?.x || 0) + ((kfB.pos?.x || 0) - (kfA.pos?.x || 0)) * alpha,
        y: (kfA.pos?.y || 0) + ((kfB.pos?.y || 0) - (kfA.pos?.y || 0)) * alpha,
        z: (kfA.pos?.z || 0) + ((kfB.pos?.z || 0) - (kfA.pos?.z || 0)) * alpha
      };

      this._applyCharacterSpaceBoneQuat(
        bone,
        qInterp,
        { x: eulerInterp.x, y: eulerInterp.y, z: eulerInterp.z },
        posInterp,
        useTPose
      );
    });

    // Tự động quay bánh xe & đánh lái bánh trước theo đúng quãng đường lăn và bán kính cua thực tế của __root__
    const rootList = byBone.get('__root__');
    if (rig.autoWheels && rig.autoWheels.length > 0 && rootList && rootList.length >= 2) {
      this._updateAutoWheelsFromRootTrack(rig, rootList, t, dur);
    }

    // Đồng bộ thời gian thực các đồ vật đang được tay nhân vật nắm giữ
    if (Array.isArray(rig.timeline.handGrabs) && rig.timeline.handGrabs.length > 0) {
      this._applyHandGrabsForRig(rig, t);
    }
  }

  /**
   * Động học bánh xe theo thời gian thực:
   * - Góc quay bánh = quãng đường lăn có dấu s(t) / bán kính bánh (lăn thật không trượt trên mặt sàn).
   * - Góc đánh lái bánh trước (Ackermann) = atan(wheelbase * độ cong quỹ đạo), tự rẽ trái/phải/thẳng theo đường chạy.
   */
  private _updateAutoWheelsFromRootTrack(
    rig: {
      forwardAxis: '+z' | '+x';
      wheelbase: number;
      timeline: GlbPropTimelineData;
      autoWheels: Array<{
        isFront: boolean;
        radius: number;
        steerPivot: pc.Entity;
        spinPivot: pc.Entity;
      }>;
    },
    rootList: GlbBoneKeyframe[],
    time: number,
    dur: number
  ): void {
    const fwdLocal = rig.forwardAxis === '+x' ? new pc.Vec3(1, 0, 0) : new pc.Vec3(0, 0, 1);
    const sampleRootAt = (sampleT: number): { x: number; z: number; q: pc.Quat } => {
      let st = sampleT;
      if (rig.timeline.loop) {
        st = ((st % dur) + dur) % dur;
      } else {
        st = Math.max(0, Math.min(dur, st));
      }
      let a = rootList[0];
      let b = rootList[rootList.length - 1];
      let span = 0;
      let loc = 0;
      if (st <= rootList[0].time) {
        if (rig.timeline.loop) {
          a = rootList[rootList.length - 1];
          b = rootList[0];
          span = (dur - a.time) + b.time;
          loc = (dur - a.time) + st;
        } else {
          return {
            x: a.pos?.x || 0,
            z: a.pos?.z || 0,
            q: new pc.Quat().setFromEulerAngles(a.rot.x, a.rot.y, a.rot.z)
          };
        }
      } else if (st >= rootList[rootList.length - 1].time) {
        if (rig.timeline.loop) {
          a = rootList[rootList.length - 1];
          b = rootList[0];
          span = (dur - a.time) + b.time;
          loc = st - a.time;
        } else {
          return {
            x: b.pos?.x || 0,
            z: b.pos?.z || 0,
            q: new pc.Quat().setFromEulerAngles(b.rot.x, b.rot.y, b.rot.z)
          };
        }
      } else {
        for (let i = 0; i < rootList.length - 1; i++) {
          if (st >= rootList[i].time && st <= rootList[i + 1].time) {
            a = rootList[i];
            b = rootList[i + 1];
            span = b.time - a.time;
            loc = st - a.time;
            break;
          }
        }
      }
      if (span <= 1e-5) {
        return {
          x: a.pos?.x || 0,
          z: a.pos?.z || 0,
          q: new pc.Quat().setFromEulerAngles(a.rot.x, a.rot.y, a.rot.z)
        };
      }
      const alpha = Math.max(0, Math.min(1, loc / span));
      const qA = new pc.Quat().setFromEulerAngles(a.rot.x, a.rot.y, a.rot.z);
      const qB = new pc.Quat().setFromEulerAngles(b.rot.x, b.rot.y, b.rot.z);
      return {
        x: (a.pos?.x || 0) + ((b.pos?.x || 0) - (a.pos?.x || 0)) * alpha,
        z: (a.pos?.z || 0) + ((b.pos?.z || 0) - (a.pos?.z || 0)) * alpha,
        q: new pc.Quat().slerp(qA, qB, alpha)
      };
    };

    // 1. Tích phân quãng đường lăn có dấu s(t) từ t=0 đến time
    let signedDist = 0;
    const tmpFwd = new pc.Vec3();
    for (let i = 0; i < rootList.length - 1; i++) {
      const a = rootList[i];
      const b = rootList[i + 1];
      if (time <= a.time) break;
      const segDur = Math.max(1e-5, b.time - a.time);
      const frac = time >= b.time ? 1 : Math.max(0, Math.min(1, (time - a.time) / segDur));
      const dx = (b.pos?.x || 0) - (a.pos?.x || 0);
      const dz = (b.pos?.z || 0) - (a.pos?.z || 0);
      const segLen = Math.hypot(dx, dz);
      if (segLen > 1e-5) {
        const qA = new pc.Quat().setFromEulerAngles(a.rot.x, a.rot.y, a.rot.z);
        const qB = new pc.Quat().setFromEulerAngles(b.rot.x, b.rot.y, b.rot.z);
        const qMid = new pc.Quat().slerp(qA, qB, frac * 0.5);
        qMid.transformVector(fwdLocal, tmpFwd);
        const dot = dx * tmpFwd.x + dz * tmpFwd.z;
        signedDist += (dot >= 0 ? 1 : -1) * segLen * frac;
      }
      if (time < b.time) break;
    }

    // 2. Tính góc đánh lái bánh trước từ tốc độ xoay hướng (dYaw / ds) tại thời điểm hiện tại
    const eps = Math.min(0.12, Math.max(0.02, dur * 0.015));
    const sPrev = sampleRootAt(time - eps);
    const sCur = sampleRootAt(time);
    const sNext = sampleRootAt(time + eps);
    const dxTot = sNext.x - sPrev.x;
    const dzTot = sNext.z - sPrev.z;
    const ds = Math.hypot(dxTot, dzTot);
    let steerDeg = 0;
    if (ds > 1e-4) {
      const fPrev = sPrev.q.transformVector(fwdLocal, new pc.Vec3());
      const fCur = sCur.q.transformVector(fwdLocal, new pc.Vec3());
      const fNext = sNext.q.transformVector(fwdLocal, new pc.Vec3());
      const hPrev = Math.atan2(fPrev.x, fPrev.z);
      const hNext = Math.atan2(fNext.x, fNext.z);
      let dYaw = hNext - hPrev;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const moveSign = (dxTot * fCur.x + dzTot * fCur.z) >= 0 ? 1 : -1;
      const kappa = dYaw / ds;
      const steerRad = Math.atan((rig.wheelbase || 2.5) * kappa * moveSign);
      steerDeg = Math.max(-34, Math.min(34, (steerRad * 180) / Math.PI));
    }

    // 3. Áp góc đánh lái (cho xe >= 3 bánh) và góc quay lăn lên từng cụm bánh xe (xe 2 bánh giữ thẳng trong phuộc để không đâm xuyên càng trước)
    const allowFrontSteer = rig.autoWheels.length >= 3;
    for (const w of rig.autoWheels) {
      const spinDeg = (signedDist / Math.max(0.05, w.radius)) * (180 / Math.PI);
      w.steerPivot.setLocalEulerAngles(0, (allowFrontSteer && w.isFront) ? steerDeg : 0, 0);
      if (rig.forwardAxis === '+x') {
        w.spinPivot.setLocalEulerAngles(0, 0, -spinDeg);
      } else {
        w.spinPivot.setLocalEulerAngles(spinDeg, 0, 0);
      }
    }
  }

  seekPropTimeline(propId: string, time: number): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    const clamped = Math.max(0, Math.min(rig.timeline.duration, Number(time) || 0));
    rig.currentTime = clamped;
    const activeClip = rig.clips.find((c) => c.name === rig.timeline.activeClipName);
    if (rig.timeline.mode === 'clip' && !activeClip?.isCustomKeyframeClip && rig.animComp?.baseLayer) {
      try {
        rig.animComp.baseLayer.activeStateCurrentTime = clamped;
      } catch (_) {}
    } else {
      this.evaluatePropKeyframesAtTime(propId, clamped);
    }
  }

  setPropTimelinePlaying(propId: string, playing: boolean): void {
    const rig = this._propRigMap.get(propId);
    if (!rig) return;
    rig.timeline.playing = !!playing;
    rig.timeline.enabled = true;
    const activeClip = rig.clips.find((c) => c.name === rig.timeline.activeClipName);
    if (rig.timeline.mode === 'clip' && !activeClip?.isCustomKeyframeClip) {
      if (rig.timeline.playing) {
        const clipName = rig.timeline.activeClipName || rig.clips[0]?.name;
        if (clipName) this.playPropClip(propId, clipName);
      } else if (rig.animComp) {
        try { rig.animComp.speed = 0; } catch (_) {}
      }
    } else {
      this._stopRigClipAnim(rig);
    }
  }

  setPropTimelineConfig(propId: string, cfg: Partial<GlbPropTimelineData>): void {
    const rig = this._propRigMap.get(propId);
    if (!rig || !cfg) return;
    if (typeof cfg.loop === 'boolean') rig.timeline.loop = cfg.loop;
    if (typeof cfg.inPlace === 'boolean') {
      rig.timeline.inPlace = cfg.inPlace;
      this._applyRigRootMotionLock(rig);
    }
    if (typeof cfg.speed === 'number' && cfg.speed > 0) {
      rig.timeline.speed = cfg.speed;
      if (rig.animComp && rig.timeline.mode === 'clip' && rig.timeline.playing) {
        try { rig.animComp.speed = cfg.speed; } catch (_) {}
      }
    }
    if (typeof cfg.duration === 'number' && cfg.duration >= 0.5) {
      rig.timeline.duration = Math.min(120, cfg.duration);
    }
    if (cfg.mode === 'clip' || cfg.mode === 'keyframes') {
      rig.timeline.mode = cfg.mode;
      if (cfg.mode === 'keyframes') {
        this._stopRigClipAnim(rig);
        this.resetBonePose(propId);
        this.evaluatePropKeyframesAtTime(propId, rig.currentTime);
      } else if (cfg.mode === 'clip') {
        const clipName = rig.timeline.activeClipName || rig.clips[0]?.name;
        if (clipName) this.playPropClip(propId, clipName);
      }
    }
  }

  /**
   * Đóng gói (bake) bộ Keyframe hiện tại trên Timeline thành một mục Clip Chuyển động mới
   * trong danh sách Clip Chuyển động của mô hình GLB và lưu bền vững vào savedClips.
   */
  bakeKeyframesToClip(
    propId: string,
    preferredName?: string,
    aiMeta?: { aiPrompt?: string; aiSegments?: any[] }
  ): { name: string; duration: number; kfCount: number; isNew: boolean } | null {
    const rig = this._propRigMap.get(propId);
    if (!rig || !Array.isArray(rig.timeline.keyframes) || rig.timeline.keyframes.length === 0) {
      return null;
    }

    if (!Array.isArray(rig.timeline.savedClips)) {
      rig.timeline.savedClips = [];
    }

    const customCount = rig.clips.filter((c) => c.isCustomKeyframeClip).length;
    let clipName = (preferredName || '').trim();
    if (!clipName) {
      const currentActive = rig.clips.find(
        (c) => c.name === rig.timeline.activeClipName && c.isCustomKeyframeClip
      );
      clipName = currentActive ? currentActive.name : `Clip Keyframe #${customCount + 1}`;
    }

    // Tránh ghi đè lên tên clip gốc nhúng sẵn trong file GLB
    const nativeCollision = rig.clips.find((c) => c.name === clipName && !c.isCustomKeyframeClip);
    if (nativeCollision) {
      clipName = `${clipName} (Custom #${customCount + 1})`;
    }

    const clonedKfs: GlbBoneKeyframe[] = JSON.parse(JSON.stringify(rig.timeline.keyframes));
    const dur = Math.max(0.5, Number(rig.timeline.duration) || 2.4);

    const existingSavedIdx = rig.timeline.savedClips.findIndex((c) => c.name === clipName);
    const existingSaved = existingSavedIdx >= 0 ? rig.timeline.savedClips[existingSavedIdx] : null;
    const resolvedPrompt =
      (aiMeta?.aiPrompt && aiMeta.aiPrompt.trim()) ||
      (rig.timeline.lastAiPrompt && rig.timeline.lastAiPrompt.trim()) ||
      existingSaved?.aiPrompt ||
      undefined;
    const resolvedSegments =
      (Array.isArray(aiMeta?.aiSegments) && aiMeta!.aiSegments.length > 0
        ? JSON.parse(JSON.stringify(aiMeta!.aiSegments))
        : (Array.isArray(rig.timeline.lastAiSegments) && rig.timeline.lastAiSegments.length > 0
          ? JSON.parse(JSON.stringify(rig.timeline.lastAiSegments))
          : (existingSaved?.aiSegments ? JSON.parse(JSON.stringify(existingSaved.aiSegments)) : undefined)));

    const savedEntry: GlbSavedKeyframeClip = {
      name: clipName,
      duration: dur,
      loop: rig.timeline.loop,
      speed: rig.timeline.speed,
      poseSpace: rig.timeline.poseSpace,
      createdAt: new Date().toISOString(),
      ...(resolvedPrompt ? { aiPrompt: resolvedPrompt } : {}),
      ...(resolvedSegments ? { aiSegments: resolvedSegments } : {}),
      ...(Array.isArray(rig.timeline.handGrabs) && rig.timeline.handGrabs.length > 0
        ? { handGrabs: JSON.parse(JSON.stringify(rig.timeline.handGrabs)) }
        : {}),
      keyframes: clonedKfs
    };

    const isNew = existingSavedIdx < 0;
    if (existingSavedIdx >= 0) {
      rig.timeline.savedClips[existingSavedIdx] = savedEntry;
    } else {
      rig.timeline.savedClips.push(savedEntry);
    }

    const existingClipIdx = rig.clips.findIndex((c) => c.name === clipName);
    const rigClipEntry = {
      name: clipName,
      duration: dur,
      resource: null,
      isCustomKeyframeClip: true,
      poseSpace: rig.timeline.poseSpace,
      keyframes: JSON.parse(JSON.stringify(clonedKfs))
    };
    if (existingClipIdx >= 0) {
      rig.clips[existingClipIdx] = rigClipEntry;
    } else {
      rig.clips.push(rigClipEntry);
    }

    rig.timeline.activeClipName = clipName;
    return {
      name: clipName,
      duration: dur,
      kfCount: clonedKfs.length,
      isNew
    };
  }

  /**
   * Trích xuất bản tóm tắt cấu trúc của một Clip chuyển động hiện có để gửi cho AI tinh chỉnh:
   * - Nếu clip có lưu `aiSegments` gốc -> trả nguyên mảng `aiSegments` + `aiPrompt` để AI sửa chính xác từng đoạn.
   * - Nếu là clip keyframe cũ / clip gốc nhúng -> lấy mẫu quỹ đạo `__root__` (mét & góc yaw) và danh sách khớp xương
   *   (gửi kèm keyframes gọn nếu clip có <= 100 KF) để AI nắm rõ clip hiện tại đang làm gì trước khi chỉnh sửa.
   */
  summarizePropClipForAi(
    propId: string,
    clipName: string
  ): {
    name: string;
    isCustom: boolean;
    duration: number;
    loop: boolean;
    kfCount: number;
    aiPrompt?: string;
    aiSegments?: any[];
    rootTrajectorySamples: Array<{ t: number; x: number; y: number; z: number; rx: number; ry: number; rz: number }>;
    totalDistanceMeters: number;
    animatedBones: string[];
    editableKeyframes?: Array<{ time: number; boneName: string; rot: { x: number; y: number; z: number }; pos?: { x: number; y: number; z: number } }>;
  } | null {
    const rig = this._propRigMap.get(propId);
    if (!rig || !clipName) return null;
    const clip = rig.clips.find((c) => c.name === clipName);
    if (!clip) return null;

    const isCustom = !!clip.isCustomKeyframeClip;
    const savedMeta = isCustom
      ? rig.timeline.savedClips?.find((sc) => sc && sc.name === clipName)
      : undefined;
    const rawKfs: GlbBoneKeyframe[] = isCustom && Array.isArray(clip.keyframes)
      ? clip.keyframes
      : (savedMeta && Array.isArray(savedMeta.keyframes) ? savedMeta.keyframes : []);
    const meterScale = rig.meterScale || 1;

    const rootKfs = rawKfs
      .filter((k) => k && k.boneName === '__root__')
      .sort((a, b) => a.time - b.time);

    let totalDistanceMeters = 0;
    for (let i = 1; i < rootKfs.length; i++) {
      const a = rootKfs[i - 1];
      const b = rootKfs[i];
      const dx = ((b.pos?.x || 0) - (a.pos?.x || 0)) / meterScale;
      const dy = ((b.pos?.y || 0) - (a.pos?.y || 0)) / meterScale;
      const dz = ((b.pos?.z || 0) - (a.pos?.z || 0)) / meterScale;
      totalDistanceMeters += Math.hypot(dx, dy, dz);
    }

    const maxRootSamples = 18;
    const sampledRoot = rootKfs.length <= maxRootSamples
      ? rootKfs
      : Array.from({ length: maxRootSamples }, (_, idx) => {
          const i = Math.min(rootKfs.length - 1, Math.round((idx / (maxRootSamples - 1)) * (rootKfs.length - 1)));
          return rootKfs[i];
        });
    const rootTrajectorySamples = sampledRoot.map((k) => ({
      t: Math.round((Number(k.time) || 0) * 100) / 100,
      x: Math.round(((Number(k.pos?.x) || 0) / meterScale) * 100) / 100,
      y: Math.round(((Number(k.pos?.y) || 0) / meterScale) * 100) / 100,
      z: Math.round(((Number(k.pos?.z) || 0) / meterScale) * 100) / 100,
      rx: Math.round((Number(k.rot?.x) || 0) * 10) / 10,
      ry: Math.round((Number(k.rot?.y) || 0) * 10) / 10,
      rz: Math.round((Number(k.rot?.z) || 0) * 10) / 10
    }));

    const animatedBoneSet = new Set<string>();
    for (const k of rawKfs) {
      if (k?.boneName && k.boneName !== '__root__') {
        animatedBoneSet.add(k.boneName);
      }
    }

    const hasAiSegments = Array.isArray(savedMeta?.aiSegments) && savedMeta!.aiSegments.length > 0;
    const editableKeyframes = !hasAiSegments && rawKfs.length > 0 && rawKfs.length <= 100
      ? rawKfs.map((k) => ({
          time: Math.round((Number(k.time) || 0) * 100) / 100,
          boneName: k.boneName,
          rot: {
            x: Math.round((Number(k.rot?.x) || 0) * 10) / 10,
            y: Math.round((Number(k.rot?.y) || 0) * 10) / 10,
            z: Math.round((Number(k.rot?.z) || 0) * 10) / 10
          },
          pos: {
            x: Math.round(((Number(k.pos?.x) || 0) / (k.boneName === '__root__' ? meterScale : 1)) * 100) / 100,
            y: Math.round(((Number(k.pos?.y) || 0) / (k.boneName === '__root__' ? meterScale : 1)) * 100) / 100,
            z: Math.round(((Number(k.pos?.z) || 0) / (k.boneName === '__root__' ? meterScale : 1)) * 100) / 100
          }
        }))
      : undefined;

    return {
      name: clip.name,
      isCustom,
      duration: Math.round((Number(clip.duration) || 2.4) * 100) / 100,
      loop: savedMeta?.loop !== undefined ? !!savedMeta.loop : rig.timeline.loop !== false,
      kfCount: rawKfs.length,
      aiPrompt: savedMeta?.aiPrompt,
      aiSegments: hasAiSegments ? JSON.parse(JSON.stringify(savedMeta!.aiSegments)) : undefined,
      rootTrajectorySamples,
      totalDistanceMeters: Math.round(totalDistanceMeters * 10) / 10,
      animatedBones: Array.from(animatedBoneSet),
      editableKeyframes
    };
  }

  /** Đổi tên một Clip chuyển động (hỗ trợ cả Clip Keyframe tùy chỉnh lẫn Clip gốc nhúng trong GLB) */
  renamePropClip(
    propId: string,
    oldName: string,
    newName: string
  ): { renamed: boolean; isCustom: boolean; finalName: string; conflict?: boolean } {
    const rig = this._propRigMap.get(propId);
    const trimmed = String(newName || '').trim();
    if (!rig || !oldName || !trimmed || trimmed === oldName) {
      return { renamed: false, isCustom: false, finalName: oldName };
    }
    const target = rig.clips.find((c) => c.name === oldName);
    if (!target) {
      return { renamed: false, isCustom: false, finalName: oldName };
    }
    const conflict = rig.clips.some((c) => c !== target && c.name === trimmed);
    if (conflict) {
      return { renamed: false, isCustom: !!target.isCustomKeyframeClip, finalName: oldName, conflict: true };
    }

    target.name = trimmed;
    const isCustom = !!target.isCustomKeyframeClip;
    if (isCustom) {
      if (Array.isArray(rig.timeline.savedClips)) {
        const saved = rig.timeline.savedClips.find((sc) => sc && sc.name === oldName);
        if (saved) saved.name = trimmed;
      }
    } else {
      if (!rig.timeline.clipAliases || typeof rig.timeline.clipAliases !== 'object') {
        rig.timeline.clipAliases = {};
      }
      const rawKey = target.rawName || oldName;
      rig.timeline.clipAliases[rawKey] = trimmed;
    }

    if (rig.timeline.activeClipName === oldName) {
      rig.timeline.activeClipName = trimmed;
    }

    return { renamed: true, isCustom, finalName: trimmed };
  }

  /** Xóa một Clip Keyframe tùy chỉnh đã lưu khỏi danh sách Clip Chuyển động */
  deletePropCustomClip(propId: string, clipName: string): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig || !clipName) return false;
    let removed = false;
    const clipIdx = rig.clips.findIndex((c) => c.name === clipName && c.isCustomKeyframeClip);
    if (clipIdx >= 0) {
      rig.clips.splice(clipIdx, 1);
      removed = true;
    }
    if (Array.isArray(rig.timeline.savedClips)) {
      const beforeLen = rig.timeline.savedClips.length;
      rig.timeline.savedClips = rig.timeline.savedClips.filter((c) => c.name !== clipName);
      if (rig.timeline.savedClips.length !== beforeLen) removed = true;
    }
    if (!removed && rig.timeline.activeClipName !== clipName) {
      return false;
    }
    if (rig.timeline.activeClipName === clipName) {
      // Xóa sạch bộ keyframe cũ đang tải trên timeline để tránh bị đóng gói lại thành "Clip Keyframe #1" khi bấm Lưu
      rig.timeline.keyframes = [];
      rig.currentTime = 0;
      rig.timeline.activeClipName = rig.clips[0]?.name || null;
      if (rig.timeline.mode === 'clip' && rig.timeline.activeClipName) {
        this.playPropClip(propId, rig.timeline.activeClipName);
      } else {
        this._stopRigClipAnim(rig);
        rig.timeline.playing = false;
        this.resetBonePose(propId);
      }
      removed = true;
    }
    return removed;
  }

  playPropClip(propId: string, clipName: string): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig) return false;
    const clip = rig.clips.find((c) => c.name === clipName) || rig.clips[0];
    if (!clip) return false;

    rig.timeline.mode = 'clip';
    rig.timeline.activeClipName = clip.name;
    rig.timeline.duration = clip.duration;
    rig.timeline.playing = true;
    rig.timeline.enabled = true;

    // Nếu là Clip Keyframe tùy chỉnh đã lưu -> tự động ánh xạ xương giải phẫu (hỗ trợ dùng chung giữa các nhân vật khác nhau) và phát
    if (clip.isCustomKeyframeClip && Array.isArray(clip.keyframes) && clip.keyframes.length > 0) {
      this._stopRigClipAnim(rig);
      const savedMeta = rig.timeline.savedClips?.find((sc) => sc.name === clip.name);
      this.applyGeneratedBoneTimeline(propId, {
        duration: clip.duration,
        loop: rig.timeline.loop,
        speed: rig.timeline.speed,
        poseSpace: clip.poseSpace || savedMeta?.poseSpace || 'rest',
        keyframes: clip.keyframes
      });
      rig.timeline.handGrabs = Array.isArray(savedMeta?.handGrabs)
        ? JSON.parse(JSON.stringify(savedMeta!.handGrabs))
        : [];
      rig.timeline.mode = 'clip';
      rig.timeline.activeClipName = clip.name;
      rig.timeline.playing = true;
      rig.currentTime = 0;
      this.evaluatePropKeyframesAtTime(propId, 0);
      return true;
    }

    try {
      this.resetBonePose(propId);
      if (!rig.animComp) {
        rig.animComp = rig.glbEntity.anim || (rig.glbEntity as any).animation || rig.glbEntity.addComponent('anim', { activate: true });
      }
      if (rig.animComp) {
        rig.animComp.enabled = true;
        if (rig.animComp.assignAnimation) {
          rig.animComp.assignAnimation(clip.name, clip.resource);
          if (rig.animComp.baseLayer) {
            rig.animComp.baseLayer.transition(clip.name, 0.15);
          }
          rig.animComp.playing = true;
          rig.animComp.speed = rig.timeline.speed || 1.0;
        } else if (rig.animComp.addClip) {
          rig.animComp.addClip(clip.resource, clip.name);
          rig.animComp.play(clip.name, 0.15);
        }
        return true;
      }
    } catch (e) {
      console.warn('[SontinhScene] playPropClip error:', e);
    }
    return false;
  }

  /** Nạp một Clip Keyframe dùng chung (từ thư mục assets/anims/ hoặc nhân vật khác) vào danh sách Clip của mô hình hiện tại */
  injectSharedKeyframeClip(propId: string, clip: GlbSavedKeyframeClip, overwrite = true): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig || !clip || !clip.name || !Array.isArray(clip.keyframes) || clip.keyframes.length === 0) {
      return false;
    }
    const existClip = rig.clips.find((c) => c.name === clip.name);
    if (existClip && (!existClip.isCustomKeyframeClip || !overwrite)) {
      return false;
    }
    const entry = {
      name: clip.name,
      duration: Math.max(0.5, Number(clip.duration) || 2.4),
      resource: null,
      isCustomKeyframeClip: true,
      poseSpace: clip.poseSpace,
      keyframes: JSON.parse(JSON.stringify(clip.keyframes))
    };
    const cIdx = rig.clips.findIndex((c) => c.name === clip.name);
    if (cIdx >= 0) rig.clips[cIdx] = entry;
    else rig.clips.push(entry);

    if (!Array.isArray(rig.timeline.savedClips)) {
      rig.timeline.savedClips = [];
    }
    const sIdx = rig.timeline.savedClips.findIndex((c) => c.name === clip.name);
    const savedCopy: GlbSavedKeyframeClip = JSON.parse(JSON.stringify(clip));
    if (sIdx >= 0) rig.timeline.savedClips[sIdx] = savedCopy;
    else rig.timeline.savedClips.push(savedCopy);
    return true;
  }

  /**
   * Trích xuất một Clip chuyển động bất kỳ (kể cả Clip gốc nhúng sẵn trong file GLB lẫn Clip Keyframe tùy chỉnh)
   * sang định dạng GlbSavedKeyframeClip trong Hệ tọa độ Chuẩn Nhân vật (Character Cardinal Space) + tên xương chuẩn hóa,
   * giúp mọi nhân vật 3D khác (Meshy / Mixamo / Blender / người gỗ...) đều có thể kế thừa và phát mượt mà.
   */
  extractPortableClip(
    propId: string,
    clipName?: string,
    preferredExportName?: string,
    targetSpace: 'tpose' | 'rest' = 'tpose'
  ): GlbSavedKeyframeClip | null {
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;

    const targetName = clipName || rig.timeline.activeClipName || rig.clips[0]?.name || 'CustomClip';

    // 1. Nếu là Clip Keyframe đã lưu sẵn -> trả về bản sao trực tiếp
    const savedClip = rig.timeline.savedClips?.find((c) => c.name === targetName);
    if (savedClip && Array.isArray(savedClip.keyframes) && savedClip.keyframes.length > 0) {
      return JSON.parse(JSON.stringify(savedClip));
    }
    const rigClip = rig.clips.find((c) => c.name === targetName);
    if (rigClip?.isCustomKeyframeClip && Array.isArray(rigClip.keyframes) && rigClip.keyframes.length > 0) {
      return {
        name: rigClip.name,
        duration: Math.max(0.5, Number(rigClip.duration) || 2.4),
        loop: rig.timeline.loop,
        speed: rig.timeline.speed,
        createdAt: new Date().toISOString(),
        keyframes: JSON.parse(JSON.stringify(rigClip.keyframes))
      };
    }

    // 2. Nếu là Clip gốc nhúng trong GLB (PlayCanvas AnimTrack) -> lấy mẫu toàn bộ các curve và quy đổi sang Character Cardinal Space
    const track: any = rigClip?.resource;
    if (!track) {
      if (Array.isArray(rig.timeline.keyframes) && rig.timeline.keyframes.length > 0) {
        return {
          name: preferredExportName || targetName,
          duration: Math.max(0.5, Number(rig.timeline.duration) || 2.4),
          loop: rig.timeline.loop,
          speed: rig.timeline.speed,
          createdAt: new Date().toISOString(),
          keyframes: JSON.parse(JSON.stringify(rig.timeline.keyframes))
        };
      }
      return null;
    }

    const curves: any[] = track.curves || track._curves || [];
    const inputs: any[] = track.inputs || track._inputs || [];
    const outputs: any[] = track.outputs || track._outputs || [];
    const dur = Math.max(0.2, Number(track.duration ?? track._duration ?? rigClip?.duration) || 2.0);
    if (!curves.length || !inputs.length || !outputs.length) return null;

    // Xây dựng bảng ánh xạ ngược từ tên xương trên rig nguồn sang tên giải phẫu chuẩn hóa (tránh ngược thứ tự Spine02/Spine giữa Meshy & Mixamo)
    const anat = this._resolveRigAnatomy(rig);
    const sourceToCanonical = new Map<string, string>();
    const regCanon = (srcBone: string, canonName: string) => {
      if (srcBone && srcBone !== '__root__' && !sourceToCanonical.has(srcBone)) {
        sourceToCanonical.set(srcBone, canonName);
      }
    };
    regCanon(anat.hips, 'Hips');
    regCanon(anat.lowerSpine, 'Spine');
    if (anat.midSpine !== anat.lowerSpine) regCanon(anat.midSpine, 'Spine1');
    if (anat.chest !== anat.midSpine && anat.chest !== anat.lowerSpine) regCanon(anat.chest, 'Spine2');
    if (anat.neck !== anat.chest) regCanon(anat.neck, 'Neck');
    if (anat.head !== anat.neck) regCanon(anat.head, 'Head');
    if (anat.lShoulder !== anat.chest) regCanon(anat.lShoulder, 'LeftShoulder');
    if (anat.rShoulder !== anat.chest) regCanon(anat.rShoulder, 'RightShoulder');
    regCanon(anat.lArm, 'LeftArm');
    regCanon(anat.rArm, 'RightArm');
    if (anat.lForeArm !== anat.lArm) regCanon(anat.lForeArm, 'LeftForeArm');
    if (anat.rForeArm !== anat.rArm) regCanon(anat.rForeArm, 'RightForeArm');
    if (anat.lHand !== anat.lForeArm) regCanon(anat.lHand, 'LeftHand');
    if (anat.rHand !== anat.rForeArm) regCanon(anat.rHand, 'RightHand');
    regCanon(anat.lUpLeg, 'LeftUpLeg');
    regCanon(anat.rUpLeg, 'RightUpLeg');
    if (anat.lLeg !== anat.lUpLeg) regCanon(anat.lLeg, 'LeftLeg');
    if (anat.rLeg !== anat.rUpLeg) regCanon(anat.rLeg, 'RightLeg');
    if (anat.lFoot !== anat.lLeg) regCanon(anat.lFoot, 'LeftFoot');
    if (anat.rFoot !== anat.rLeg) regCanon(anat.rFoot, 'RightFoot');

    // Hàm tra khớp xương tương ứng trong rig.bones từ tên node trong entityPath của AnimCurve
    const findRigBoneByNodeName = (nodeName: string) => {
      if (!nodeName) return null;
      if (rig.bones.has(nodeName)) return rig.bones.get(nodeName)!;
      const lower = nodeName.toLowerCase();
      const stripped = nodeName.replace(/^mixamorig:?/i, '').toLowerCase();
      for (const b of rig.bones.values()) {
        if (b.name === '__root__') continue;
        if (
          b.name.toLowerCase() === lower ||
          String(b.node?.name || '').toLowerCase() === lower ||
          b.label.toLowerCase() === stripped
        ) {
          return b;
        }
      }
      return null;
    };

    // Gom các curve localRotation và localPosition theo từng xương
    const boneCurves = new Map<string, {
      bone: any;
      rotCurve?: any;
      posCurve?: any;
    }>();

    for (const curve of curves) {
      const paths: any[] = curve?.paths || curve?._paths || [];
      for (const p of paths) {
        const entityPath: string[] = Array.isArray(p?.entityPath) ? p.entityPath : [];
        const propPath: string[] = Array.isArray(p?.propertyPath) ? p.propertyPath : [];
        const nodeName = entityPath.length > 0 ? String(entityPath[entityPath.length - 1]) : '';
        const propName = propPath.length > 0 ? String(propPath[0]) : '';
        if (!nodeName || (propName !== 'localRotation' && propName !== 'localPosition')) continue;

        const bone = findRigBoneByNodeName(nodeName);
        if (!bone || !bone.isSkinnedBone) continue;
        if (!boneCurves.has(bone.name)) {
          boneCurves.set(bone.name, { bone });
        }
        const entry = boneCurves.get(bone.name)!;
        if (propName === 'localRotation') entry.rotCurve = curve;
        else if (propName === 'localPosition' && bone.isRootOrHips) entry.posCurve = curve;
      }
    }

    if (boneCurves.size === 0) return null;

    // Hàm nội suy giá trị curve tại thời điểm t (hỗ trợ STEP, LINEAR và CUBICSPLINE)
    const sampleCurve = (curve: any, t: number, expectedComps: 3 | 4): number[] | null => {
      const inIdx = curve.input ?? curve._input;
      const outIdx = curve.output ?? curve._output;
      const interp = curve.interpolation ?? curve._interpolation ?? 1;
      const inData = inputs[inIdx]?.data || inputs[inIdx]?._data;
      const outData = outputs[outIdx]?.data || outputs[outIdx]?._data;
      const comps = Number(outputs[outIdx]?.components || outputs[outIdx]?._components || expectedComps);
      if (!inData || !outData || inData.length === 0 || comps < expectedComps) return null;

      const keyCount = inData.length;
      const isCubic = interp === 2 && outData.length >= keyCount * comps * 3;
      const readKeyVal = (kIdx: number): number[] => {
        const base = isCubic ? (kIdx * 3 + 1) * comps : kIdx * comps;
        const res: number[] = [];
        for (let c = 0; c < expectedComps; c++) {
          res.push(Number(outData[base + c]) || 0);
        }
        return res;
      };

      if (keyCount === 1 || t <= inData[0]) return readKeyVal(0);
      if (t >= inData[keyCount - 1]) return readKeyVal(keyCount - 1);

      // Tìm nhị phân cặp mốc thời gian kề nhau
      let lo = 0;
      let hi = keyCount - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (inData[mid] <= t) lo = mid;
        else hi = mid;
      }
      if (interp === 0) return readKeyVal(lo);

      const t0 = Number(inData[lo]) || 0;
      const t1 = Number(inData[hi]) || t0;
      const alpha = t1 > t0 + 1e-6 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
      const v0 = readKeyVal(lo);
      const v1 = readKeyVal(hi);

      if (expectedComps === 4) {
        const q0 = new pc.Quat(v0[0], v0[1], v0[2], v0[3]).normalize();
        const q1 = new pc.Quat(v1[0], v1[1], v1[2], v1[3]).normalize();
        const q = new pc.Quat().slerp(q0, q1, alpha).normalize();
        return [q.x, q.y, q.z, q.w];
      }
      return [
        v0[0] + (v1[0] - v0[0]) * alpha,
        v0[1] + (v1[1] - v0[1]) * alpha,
        v0[2] + (v1[2] - v0[2]) * alpha
      ];
    };

    // Lấy mẫu ~15 fps (tối thiểu 12 mốc, tối đa 150 mốc) — đủ mượt tuyệt đối mà file .glb vẫn gọn nhẹ
    const sampleCount = Math.max(12, Math.min(150, Math.round(dur * 15) + 1));
    const sampleTimes: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const tm = i === sampleCount - 1 ? dur : (dur * i) / (sampleCount - 1);
      sampleTimes.push(Math.round(tm * 1000) / 1000);
    }

    const extractedKeyframes: GlbBoneKeyframe[] = [];
    let kfSeq = 0;

    boneCurves.forEach(({ bone, rotCurve, posCurve }) => {
      const isCanonicalBone = sourceToCanonical.has(bone.name);
      const canonBoneName = sourceToCanonical.get(bone.name) || bone.label || bone.name;
      // Quy đổi góc xoay tương đối so với Canonical T-Pose (mặc định khi xuất portable) hoặc Rest Pose (khi ghép cùng keyframe AI trên cùng nhân vật)
      const useRestSpace = targetSpace === 'rest';
      const baseLocalQuat = useRestSpace ? bone.restQuat : (bone.tposeLocalQuat || bone.restQuat);
      const baseCharQuat = useRestSpace ? bone.charRestQuat : (bone.tposeCharQuat || bone.charRestQuat);
      const baseLocalQuatInv = baseLocalQuat.clone().invert();
      const baseCharQuatInv = baseCharQuat.clone().invert();
      const posScale = Math.max(1e-4, Number(bone.posUnitScale) || 1);

      const perBoneFrames: Array<{
        time: number;
        rot: { x: number; y: number; z: number };
        pos: { x: number; y: number; z: number };
      }> = [];
      let maxRotMag = 0;
      let maxPosY = 0;

      for (const tm of sampleTimes) {
        let rx = 0, ry = 0, rz = 0;
        if (rotCurve) {
          const qArr = sampleCurve(rotCurve, tm, 4);
          if (qArr) {
            const finalQuat = new pc.Quat(qArr[0], qArr[1], qArr[2], qArr[3]).normalize();
            // Công thức nghịch đảo chính xác trong không gian Canonical T-Pose:
            // qLocalDelta = inv(tposeLocalQuat) * finalQuat
            // qCharDelta  = tposeCharQuat * qLocalDelta * inv(tposeCharQuat)
            const qLocalDelta = new pc.Quat().mul2(baseLocalQuatInv, finalQuat);
            const qTmp = new pc.Quat().mul2(baseCharQuat, qLocalDelta);
            const qCharDelta = new pc.Quat().mul2(qTmp, baseCharQuatInv).normalize();
            const e = qCharDelta.getEulerAngles();
            rx = Math.round(e.x * 10) / 10;
            ry = Math.round(e.y * 10) / 10;
            rz = Math.round(e.z * 10) / 10;
            maxRotMag = Math.max(maxRotMag, Math.abs(rx), Math.abs(ry), Math.abs(rz));
          }
        }

        let py = 0;
        if (posCurve && bone.isRootOrHips) {
          const pArr = sampleCurve(posCurve, tm, 3);
          if (pArr) {
            const vLocal = new pc.Vec3(
              pArr[0] - bone.restPos.x,
              pArr[1] - bone.restPos.y,
              pArr[2] - bone.restPos.z
            );
            const vChar = new pc.Vec3();
            bone.parentCharRestQuat.transformVector(vLocal, vChar);
            // Bảo toàn 100% độ nhún/nhảy trục Y (mét) và khóa X/Z tại chỗ để mọi nhân vật kế thừa đứng chuẩn giữa vòng chọn
            py = Math.max(-2.5, Math.min(2.5, Math.round((vChar.y / posScale) * 1000) / 1000));
            maxPosY = Math.max(maxPosY, Math.abs(py));
          }
        }

        perBoneFrames.push({
          time: tm,
          rot: { x: rx, y: ry, z: rz },
          pos: { x: 0, y: py, z: 0 }
        });
      }

      // Luôn giữ các xương chính trong chuỗi giải phẫu để bảo toàn chuỗi T-Pose; chỉ lọc bỏ xương phụ hoàn toàn bất động
      if (!isCanonicalBone && maxRotMag < 0.4 && maxPosY < 0.004) return;

      for (const fr of perBoneFrames) {
        extractedKeyframes.push({
          id: `ext_${++kfSeq}_${Math.round(fr.time * 100)}`,
          time: fr.time,
          boneName: canonBoneName,
          rot: fr.rot,
          pos: fr.pos
        });
      }
    });

    if (extractedKeyframes.length === 0) return null;

    // Tạo tên hiển thị dễ đọc nếu tên clip gốc trong GLB là chuỗi UUID khó nhớ
    const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(targetName) || /^animation_\d+$/i.test(targetName) || /^mixamo\.com$/i.test(targetName);
    let cleanName = String(preferredExportName || '').trim();
    if (!cleanName) {
      if (!isUuidLike) {
        const pipeParts = targetName.split('|').map((s) => s.trim()).filter((s) => s && !/^(armature|baselayer)$/i.test(s));
        cleanName = pipeParts[0] || targetName;
      } else {
        cleanName = `Anim_${targetName.slice(0, 8)}`;
      }
    }

    return {
      name: cleanName,
      duration: Math.round(dur * 100) / 100,
      loop: rig.timeline.loop !== false,
      speed: rig.timeline.speed || 1.0,
      poseSpace: targetSpace === 'rest' ? 'rest' : 'tpose',
      createdAt: new Date().toISOString(),
      keyframes: extractedKeyframes
    };
  }

  /**
   * Đóng gói một Clip Chuyển động (cả Clip Keyframe lẫn Clip gốc nhúng trong GLB) thành tệp nhị phân chuẩn glTF 2.0 (.glb) chứa cả:
   * 1. Hệ thống Node xương và Animation Track chuẩn glTF 2.0 (samplers/channels VEC4 Quaternion & VEC3 Translation)
   * 2. Siêu dữ liệu portable `asset.extras.aitypeKeyframeClip` để tái ánh xạ (retarget) chính xác sang mọi nhân vật 3D khác.
   */
  exportClipToGlbArrayBuffer(
    propId: string,
    clipName?: string,
    overrideClipPayload?: GlbSavedKeyframeClip | null
  ): ArrayBuffer | null {
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;

    const clipPayload: GlbSavedKeyframeClip | null = overrideClipPayload
      ? JSON.parse(JSON.stringify(overrideClipPayload))
      : this.extractPortableClip(propId, clipName);
    if (!clipPayload || !Array.isArray(clipPayload.keyframes) || clipPayload.keyframes.length === 0) {
      return null;
    }

    const targetName = clipPayload.name || clipName || rig.timeline.activeClipName || 'CustomClip';
    const kfs: GlbBoneKeyframe[] = clipPayload.keyframes;
    const dur = Math.max(0.2, Number(clipPayload.duration) || 2.4);
    clipPayload.duration = dur;

    // Nhóm keyframes theo boneName
    const byBone = new Map<string, GlbBoneKeyframe[]>();
    for (const kf of kfs) {
      if (!kf || !kf.boneName) continue;
      if (!byBone.has(kf.boneName)) byBone.set(kf.boneName, []);
      byBone.get(kf.boneName)!.push(kf);
    }

    const nodes: any[] = [{ name: 'Armature_Root', children: [] as number[] }];
    const samplers: any[] = [];
    const channels: any[] = [];
    const accessors: any[] = [];
    const bufferViews: any[] = [];
    const floatChunks: Float32Array[] = [];
    let byteOffset = 0;

    const appendFloatArray = (arr: Float32Array, type: 'SCALAR' | 'VEC3' | 'VEC4', computeMinMax = false): number => {
      const byteLen = arr.byteLength;
      const bvIdx = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset,
        byteLength: byteLen
      });
      byteOffset += byteLen;
      floatChunks.push(arr);

      const comps = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4;
      const count = Math.floor(arr.length / comps);
      const acc: any = {
        bufferView: bvIdx,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count,
        type
      };
      if (computeMinMax && count > 0) {
        const minV = new Array(comps).fill(Infinity);
        const maxV = new Array(comps).fill(-Infinity);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < comps; c++) {
            const v = arr[i * comps + c];
            if (v < minV[c]) minV[c] = v;
            if (v > maxV[c]) maxV[c] = v;
          }
        }
        acc.min = minV;
        acc.max = maxV;
      }
      const accIdx = accessors.length;
      accessors.push(acc);
      return accIdx;
    };

    byBone.forEach((list, boneName) => {
      list.sort((a, b) => a.time - b.time);
      const bone = rig.bones.get(boneName);
      const nodeIdx = nodes.length;
      nodes[0].children.push(nodeIdx);
      nodes.push({
        name: bone ? bone.label : boneName,
        translation: bone ? [bone.restPos.x, bone.restPos.y, bone.restPos.z] : [0, 0, 0],
        rotation: bone ? [bone.restQuat.x, bone.restQuat.y, bone.restQuat.z, bone.restQuat.w] : [0, 0, 0, 1]
      });

      const n = list.length;
      const times = new Float32Array(n);
      const rots = new Float32Array(n * 4);
      const trans = new Float32Array(n * 3);
      let hasTranslation = false;

      for (let i = 0; i < n; i++) {
        const item = list[i];
        times[i] = Math.max(0, Number(item.time) || 0);
        const qChar = new pc.Quat().setFromEulerAngles(
          Number(item.rot?.x) || 0,
          Number(item.rot?.y) || 0,
          Number(item.rot?.z) || 0
        );
        let finalQuat = qChar;
        if (bone) {
          const useTP = clipPayload.poseSpace === 'tpose';
          const baseLocal = (useTP && bone.tposeLocalQuat) ? bone.tposeLocalQuat : bone.restQuat;
          const baseChar = (useTP && bone.tposeCharQuat) ? bone.tposeCharQuat : bone.charRestQuat;
          const qCharInv = baseChar.clone().invert();
          const qTmp = new pc.Quat().mul2(qCharInv, qChar);
          const qLocalDelta = new pc.Quat().mul2(qTmp, baseChar);
          finalQuat = new pc.Quat().mul2(baseLocal, qLocalDelta).normalize();
        }
        rots[i * 4] = finalQuat.x;
        rots[i * 4 + 1] = finalQuat.y;
        rots[i * 4 + 2] = finalQuat.z;
        rots[i * 4 + 3] = finalQuat.w;

        const px = Number(item.pos?.x) || 0;
        const py = Number(item.pos?.y) || 0;
        const pz = Number(item.pos?.z) || 0;
        if (Math.abs(px) > 1e-4 || Math.abs(py) > 1e-4 || Math.abs(pz) > 1e-4) {
          hasTranslation = true;
        }
        if (bone) {
          const scale = bone.posUnitScale || 1;
          const vChar = new pc.Vec3(px * scale, py * scale, pz * scale);
          const vLocal = new pc.Vec3();
          bone.parentCharRestQuat.clone().invert().transformVector(vChar, vLocal);
          trans[i * 3] = bone.restPos.x + vLocal.x;
          trans[i * 3 + 1] = bone.restPos.y + vLocal.y;
          trans[i * 3 + 2] = bone.restPos.z + vLocal.z;
        } else {
          trans[i * 3] = px;
          trans[i * 3 + 1] = py;
          trans[i * 3 + 2] = pz;
        }
      }

      const timeAccIdx = appendFloatArray(times, 'SCALAR', true);
      const rotAccIdx = appendFloatArray(rots, 'VEC4', false);
      const rotSamplerIdx = samplers.length;
      samplers.push({
        input: timeAccIdx,
        interpolation: 'LINEAR',
        output: rotAccIdx
      });
      channels.push({
        sampler: rotSamplerIdx,
        target: { node: nodeIdx, path: 'rotation' }
      });

      if (hasTranslation) {
        const transAccIdx = appendFloatArray(trans, 'VEC3', false);
        const transSamplerIdx = samplers.length;
        samplers.push({
          input: timeAccIdx,
          interpolation: 'LINEAR',
          output: transAccIdx
        });
        channels.push({
          sampler: transSamplerIdx,
          target: { node: nodeIdx, path: 'translation' }
        });
      }
    });

    const binPad = (4 - (byteOffset % 4)) % 4;
    const totalBinBytes = byteOffset + binPad;

    const gltfJson = {
      asset: {
        version: '2.0',
        generator: 'AI.Type 3D Motion Studio',
        extras: {
          _aitypeSanitized: 2,
          aitypeKeyframeClip: clipPayload
        }
      },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes,
      animations: [
        {
          name: targetName,
          samplers,
          channels
        }
      ],
      accessors,
      bufferViews,
      buffers: [{ byteLength: byteOffset }]
    };

    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(JSON.stringify(gltfJson));
    const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
    const totalJsonBytes = jsonBytes.byteLength + jsonPad;

    const totalGlbBytes = 12 + 8 + totalJsonBytes + 8 + totalBinBytes;
    const outBuffer = new ArrayBuffer(totalGlbBytes);
    const dv = new DataView(outBuffer);
    const u8 = new Uint8Array(outBuffer);

    // 1. GLB Header (12 bytes)
    dv.setUint32(0, 0x46546c67, true); // 'glTF'
    dv.setUint32(4, 2, true); // version 2
    dv.setUint32(8, totalGlbBytes, true);

    // 2. JSON Chunk Header (8 bytes) + JSON Payload
    dv.setUint32(12, totalJsonBytes, true);
    dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
    u8.set(jsonBytes, 20);
    for (let p = 0; p < jsonPad; p++) {
      u8[20 + jsonBytes.byteLength + p] = 0x20; // space padding
    }

    // 3. BIN Chunk Header (8 bytes) + Binary Float32 Payload
    const binHeaderOffset = 20 + totalJsonBytes;
    dv.setUint32(binHeaderOffset, totalBinBytes, true);
    dv.setUint32(binHeaderOffset + 4, 0x004e4942, true); // 'BIN\0'
    let cursor = binHeaderOffset + 8;
    for (const chunk of floatChunks) {
      u8.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), cursor);
      cursor += chunk.byteLength;
    }

    return outBuffer;
  }

  /** Đọc dữ liệu GlbSavedKeyframeClip từ tệp .glb (chứa aitypeKeyframeClip) hoặc tệp .json */
  parseKeyframeClipFromBuffer(rawBuffer: ArrayBuffer): GlbSavedKeyframeClip | null {
    if (!rawBuffer || rawBuffer.byteLength < 16) return null;
    try {
      const dv = new DataView(rawBuffer);
      const magic = dv.getUint32(0, true);
      const decoder = new TextDecoder('utf-8');
      if (magic === 0x46546c67 && rawBuffer.byteLength >= 20) {
        const jsonLen = dv.getUint32(12, true);
        const jsonType = dv.getUint32(16, true);
        if (jsonType === 0x4e4f534a && 20 + jsonLen <= rawBuffer.byteLength) {
          const jsonStr = decoder.decode(new Uint8Array(rawBuffer, 20, jsonLen));
          const gltf = JSON.parse(jsonStr);
          const embedded: GlbSavedKeyframeClip | undefined =
            gltf?.asset?.extras?.aitypeKeyframeClip || gltf?.extras?.aitypeKeyframeClip;
          if (embedded && Array.isArray(embedded.keyframes) && embedded.keyframes.length > 0) {
            return embedded;
          }
        }
        return null;
      }
      // Thử parse dưới dạng tệp JSON (.clip.json / .json)
      const txt = decoder.decode(new Uint8Array(rawBuffer)).trim();
      if (txt.startsWith('{')) {
        const parsed = JSON.parse(txt);
        const clip = parsed?.aitypeKeyframeClip || parsed;
        if (clip && Array.isArray(clip.keyframes) && clip.keyframes.length > 0) {
          return {
            name: String(clip.name || 'Imported_Clip'),
            duration: Math.max(0.5, Number(clip.duration) || 2.4),
            loop: clip.loop !== false,
            speed: Number(clip.speed) || 1.0,
            createdAt: clip.createdAt || new Date().toISOString(),
            keyframes: clip.keyframes
          };
        }
      }
    } catch (_) {}
    return null;
  }

  importPropAnimationGlb(
    propId: string,
    blobUrl: string,
    fileName: string,
    rawBuffer?: ArrayBuffer
  ): Promise<{ ok: boolean; clipName?: string; duration?: number; isKeyframeClip?: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      const rig = this._propRigMap.get(propId);
      if (!rig || !this.app) {
        resolve({ ok: false, error: 'Đồ vật GLB chưa sẵn sàng trên canvas.' });
        return;
      }

      const baseLabel = String(fileName || 'CustomAnim').replace(/\.(clip\.json|json|glb)$/i, '');

      // 1. Kiểm tra nếu tệp .glb hoặc .json chứa bộ Keyframe chuẩn AI.Type -> tự động tái ánh xạ (retarget) sang khớp xương nhân vật hiện tại
      try {
        let buf = rawBuffer;
        if (!buf && blobUrl) {
          const resp = await fetch(blobUrl);
          buf = await resp.arrayBuffer();
        }
        if (buf) {
          const kfClip = this.parseKeyframeClipFromBuffer(buf);
          if (kfClip && Array.isArray(kfClip.keyframes) && kfClip.keyframes.length > 0) {
            const count = this.applyGeneratedBoneTimeline(propId, {
              duration: kfClip.duration,
              loop: kfClip.loop,
              speed: kfClip.speed,
              poseSpace: kfClip.poseSpace || 'rest',
              keyframes: kfClip.keyframes
            });
            if (count > 0) {
              const baked = this.bakeKeyframesToClip(propId, kfClip.name || baseLabel);
              const finalName = baked?.name || kfClip.name || baseLabel;
              this.playPropClip(propId, finalName);
              resolve({
                ok: true,
                clipName: finalName,
                duration: kfClip.duration,
                isKeyframeClip: true
              });
              return;
            }
          }
        }
      } catch (_) {}

      // 2. Nếu là tệp .glb animation thuần từ Mixamo / Blender / Meshy
      this.app.assets.loadFromUrl(blobUrl, 'container', (err: any, asset?: pc.Asset) => {
        if (err || !asset?.resource) {
          resolve({ ok: false, error: 'Không đọc được tệp GLB chuyển động.' });
          return;
        }
        const rawAnims: any[] = Array.isArray((asset.resource as any).animations) ? (asset.resource as any).animations : [];
        if (rawAnims.length === 0) {
          resolve({ ok: false, error: 'Tệp GLB này không chứa dữ liệu chuyển động (animation track) nào.' });
          return;
        }
        let firstAddedName = '';
        let firstDur = 2.5;
        for (let i = 0; i < rawAnims.length; i++) {
          const a = rawAnims[i];
          const track = a?.resource || a;
          if (!track) continue;
          const cName = rawAnims.length === 1 ? baseLabel : `${baseLabel}_${i + 1}`;
          const dur = Math.max(0.1, Number(track?.duration) || 2.5);
          const existingIdx = rig.clips.findIndex((c) => c.name === cName);
          if (existingIdx >= 0) rig.clips.splice(existingIdx, 1);
          rig.clips.push({ name: cName, duration: dur, resource: track });
          if (!firstAddedName) {
            firstAddedName = cName;
            firstDur = dur;
          }
        }
        if (firstAddedName) {
          this.playPropClip(propId, firstAddedName);
          resolve({ ok: true, clipName: firstAddedName, duration: firstDur });
        } else {
          resolve({ ok: false, error: 'Không trích xuất được animation track hợp lệ.' });
        }
      });
    });
  }

  /** Phân giải chính xác bộ khung xương giải phẫu (Hips, Spine02/01/Spine, Neck, Head, Arms, Legs) cho cả Meshy, Mixamo, VRM & Blender Rig */
  private _resolveRigAnatomy(rig: {
    bones: Map<string, { name: string; label: string; depth: number; isSkinnedBone: boolean }>;
  }): {
    hips: string;
    lowerSpine: string;
    midSpine: string;
    chest: string;
    neck: string;
    head: string;
    lShoulder: string;
    lArm: string;
    lForeArm: string;
    lHand: string;
    rShoulder: string;
    rArm: string;
    rForeArm: string;
    rHand: string;
    lUpLeg: string;
    lLeg: string;
    lFoot: string;
    rUpLeg: string;
    rLeg: string;
    rFoot: string;
  } {
    const entries = Array.from(rig.bones.values()).filter((b) => b.name !== '__root__');
    const findExactOrRegex = (exactList: RegExp[], fallback = '__root__'): string => {
      for (const re of exactList) {
        const hit = entries.find((b) => re.test(b.label.trim()));
        if (hit) return hit.name;
      }
      return fallback;
    };

    const hips = findExactOrRegex([/^(hips|pelvis|hip|c_pos|root_bone|root)$/i, /^(?!.*[._-][lr]$).*(hips|pelvis)/i, /hips|pelvis/i], '__root__');

    // Thu thập chuỗi xương sống theo thứ tự cây phân cấp (từ gần Hips lên tới ngực)
    const spineChain = entries
      .filter((b) => /^(spine|spine[_\s.-]?\d+|chest|upper[_\s.-]?chest|torso)$/i.test(b.label.trim()))
      .sort((a, b) => a.depth - b.depth);

    const lowerSpine = spineChain[0]?.name || findExactOrRegex([/spine02|spine_01|spine01|spine1|^spine$/i], hips);
    const midSpine = spineChain[1]?.name || spineChain[0]?.name || lowerSpine;
    const chest = spineChain[spineChain.length - 1]?.name || midSpine;

    const neck = findExactOrRegex([/^neck$/i, /^neck[_\s.-]?0?1$/i, /neck/i], chest);
    const head = findExactOrRegex([/^head$/i, /^head[_\s.-]?0?1$/i, /^(?!.*(top|end)).*head/i], neck);

    const lShoulder = findExactOrRegex([/^leftshoulder$/i, /^clavicle[._-]?l$/i, /^shoulder0?1[._-]?l$/i, /shoulder.*l|l.*shoulder|clavicle.*l/i], chest);
    const lArm = findExactOrRegex([/^leftarm$/i, /^upperarm[._-]?l$/i, /^upperarm0?1[._-]?l$/i, /leftarm|upperarm0?1.*l|upperarm.*l|arm[._-]?l|l[._-]?arm/i], lShoulder);
    const lForeArm = findExactOrRegex([/^leftforearm$/i, /^lowerarm[._-]?l$/i, /^lowerarm0?1[._-]?l$/i, /leftforearm|forearm.*l|lowerarm0?1.*l|lowerarm.*l/i], lArm);
    const lHand = findExactOrRegex([/^lefthand$/i, /^hand[._-]?l$/i, /^wrist[._-]?l$/i, /lefthand|hand[._-]?l|l[._-]?hand|wrist.*l/i], lForeArm);

    const rShoulder = findExactOrRegex([/^rightshoulder$/i, /^clavicle[._-]?r$/i, /^shoulder0?1[._-]?r$/i, /shoulder.*r|r.*shoulder|clavicle.*r/i], chest);
    const rArm = findExactOrRegex([/^rightarm$/i, /^upperarm[._-]?r$/i, /^upperarm0?1[._-]?r$/i, /rightarm|upperarm0?1.*r|upperarm.*r|arm[._-]?r|r[._-]?arm/i], rShoulder);
    const rForeArm = findExactOrRegex([/^rightforearm$/i, /^lowerarm[._-]?r$/i, /^lowerarm0?1[._-]?r$/i, /rightforearm|forearm.*r|lowerarm0?1.*r|lowerarm.*r/i], rArm);
    const rHand = findExactOrRegex([/^righthand$/i, /^hand[._-]?r$/i, /^wrist[._-]?r$/i, /righthand|hand[._-]?r|r[._-]?hand|wrist.*r/i], rForeArm);

    const lUpLeg = findExactOrRegex([/^leftupleg$/i, /^thigh[._-]?l$/i, /^upperleg0?1[._-]?l$/i, /leftupleg|thigh.*l|upleg.*l|upperleg0?1.*l|upperleg.*l/i], hips);
    const lLeg = findExactOrRegex([/^leftleg$/i, /^calf[._-]?l$/i, /^shin[._-]?l$/i, /^lowerleg0?1[._-]?l$/i, /leftleg|calf.*l|shin.*l|lowerleg0?1.*l|lowerleg.*l/i], lUpLeg);
    const lFoot = findExactOrRegex([/^leftfoot$/i, /^foot[._-]?l$/i, /leftfoot|foot[._-]?l|l[._-]?foot/i], lLeg);

    const rUpLeg = findExactOrRegex([/^rightupleg$/i, /^thigh[._-]?r$/i, /^upperleg0?1[._-]?r$/i, /rightupleg|thigh.*r|upleg.*r|upperleg0?1.*r|upperleg.*r/i], hips);
    const rLeg = findExactOrRegex([/^rightleg$/i, /^calf[._-]?r$/i, /^shin[._-]?r$/i, /^lowerleg0?1[._-]?r$/i, /rightleg|calf.*r|shin.*r|lowerleg0?1.*r|lowerleg.*r/i], rUpLeg);
    const rFoot = findExactOrRegex([/^rightfoot$/i, /^foot[._-]?r$/i, /rightfoot|foot[._-]?r|r[._-]?foot/i], rLeg);

    return {
      hips,
      lowerSpine,
      midSpine,
      chest,
      neck,
      head,
      lShoulder,
      lArm,
      lForeArm,
      lHand,
      rShoulder,
      rArm,
      rForeArm,
      rHand,
      lUpLeg,
      lLeg,
      lFoot,
      rUpLeg,
      rLeg,
      rFoot
    };
  }

  /** Tạo nhanh bộ Keyframe mẫu tự động cho các khớp xương của GLB (Thở, Vẫy tay, Nhún nhảy, Nhìn quanh) */
  applyProceduralBonePreset(propId: string, preset: 'breathe' | 'wave' | 'bounce' | 'look_around'): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig) return false;
    this._stopRigClipAnim(rig);
    this.resetBonePose(propId);
    rig.timeline.keyframes = [];
    rig.timeline.mode = 'keyframes';
    rig.timeline.duration = 2.4;
    rig.timeline.loop = true;

    const anat = this._resolveRigAnatomy(rig);
    const addKf = (boneName: string, time: number, rx: number, ry: number, rz: number, py = 0, px = 0) => {
      if (!boneName) return;
      this.upsertBoneKeyframe(propId, boneName, time, { x: rx, y: ry, z: rz }, { x: px, y: py, z: 0 });
    };

    if (preset === 'breathe') {
      for (const t of [0.0, 2.4]) {
        addKf(anat.hips, t, 0, 0, 0, 0);
        addKf(anat.lowerSpine, t, 0, 0, 0);
        addKf(anat.chest, t, 0, 0, 0);
        addKf(anat.head, t, 0, 0, 0);
        addKf(anat.lArm, t, 0, 0, -18);
        addKf(anat.rArm, t, 0, 0, 18);
      }
      addKf(anat.hips, 1.2, 0, 0, 0, 0.02);
      addKf(anat.lowerSpine, 1.2, -3, 0, 0);
      addKf(anat.chest, 1.2, -5, 0, 0);
      addKf(anat.head, 1.2, -4, 3, 0);
      addKf(anat.lArm, 1.2, -4, 0, -14);
      addKf(anat.rArm, 1.2, -4, 0, 14);
    } else if (preset === 'wave') {
      for (const t of [0.0, 2.4]) {
        addKf(anat.hips, t, 0, 0, 0, 0);
        addKf(anat.chest, t, 0, 0, 0);
        addKf(anat.head, t, 0, 0, 0);
        addKf(anat.lArm, t, 0, 0, -18);
        addKf(anat.rArm, t, 0, 0, 18);
        addKf(anat.rForeArm, t, 0, 0, 0);
      }
      addKf(anat.chest, 0.5, 0, -6, 4);
      addKf(anat.chest, 1.2, 0, -8, 5);
      addKf(anat.chest, 1.9, 0, -6, 4);
      addKf(anat.head, 0.6, -5, 8, -6);
      addKf(anat.head, 1.2, -5, 10, 6);
      addKf(anat.head, 1.8, -5, 8, -6);
      // Giơ cao tay phải lên ngang đầu và vẫy cẳng tay qua lại
      addKf(anat.rArm, 0.45, -35, 0, -65);
      addKf(anat.rArm, 0.9, -35, 0, -75);
      addKf(anat.rArm, 1.4, -35, 0, -58);
      addKf(anat.rArm, 1.9, -35, 0, -75);
      addKf(anat.rForeArm, 0.45, -55, 0, -25);
      addKf(anat.rForeArm, 0.9, -55, 0, 20);
      addKf(anat.rForeArm, 1.4, -55, 0, -30);
      addKf(anat.rForeArm, 1.9, -55, 0, 20);
    } else if (preset === 'bounce') {
      const steps = [0.0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4];
      steps.forEach((t, idx) => {
        const isPeak = idx % 2 === 1;
        const side = idx === 1 ? -1 : idx === 3 ? 1 : idx === 5 ? -1 : 0;
        addKf(anat.hips, t, isPeak ? -5 : 8, side * 12, side * 4, isPeak ? 0.16 : -0.1, side * 0.06);
        addKf(anat.lowerSpine, t, isPeak ? -4 : 10, -side * 10, -side * 4);
        addKf(anat.head, t, isPeak ? -6 : 6, side * 8, 0);
        addKf(anat.lUpLeg, t, isPeak ? -15 : -38, 0, 0);
        addKf(anat.rUpLeg, t, isPeak ? -15 : -38, 0, 0);
        addKf(anat.lLeg, t, isPeak ? 10 : 48, 0, 0);
        addKf(anat.rLeg, t, isPeak ? 10 : 48, 0, 0);
        addKf(anat.lArm, t, isPeak ? -45 : -15, 0, isPeak ? 25 : -15);
        addKf(anat.rArm, t, isPeak ? -45 : -15, 0, isPeak ? -25 : 15);
        addKf(anat.lForeArm, t, isPeak ? -40 : -20, 0, 0);
        addKf(anat.rForeArm, t, isPeak ? -40 : -20, 0, 0);
      });
    } else if (preset === 'look_around') {
      for (const t of [0.0, 2.4]) {
        addKf(anat.hips, t, 0, 0, 0, 0);
        addKf(anat.lowerSpine, t, 0, 0, 0);
        addKf(anat.chest, t, 0, 0, 0);
        addKf(anat.neck, t, 0, 0, 0);
        addKf(anat.head, t, 0, 0, 0);
        addKf(anat.lArm, t, 0, 0, -18);
        addKf(anat.rArm, t, 0, 0, 18);
      }
      addKf(anat.hips, 0.75, 0, -12, 0);
      addKf(anat.lowerSpine, 0.75, 0, -15, 0);
      addKf(anat.chest, 0.75, -3, -18, 0);
      addKf(anat.neck, 0.75, -3, -15, 0);
      addKf(anat.head, 0.75, -5, -32, -4);

      addKf(anat.hips, 1.65, 0, 12, 0);
      addKf(anat.lowerSpine, 1.65, 0, 15, 0);
      addKf(anat.chest, 1.65, -3, 18, 0);
      addKf(anat.neck, 1.65, -3, 15, 0);
      addKf(anat.head, 1.65, -5, 32, 4);
    }

    rig.currentTime = 0;
    rig.timeline.playing = true;
    this.evaluatePropKeyframesAtTime(propId, 0);
    return true;
  }

  /**
   * Áp dụng danh sách Keyframe khớp xương do AI Agent thiết kế (từ Video mẫu và/hoặc Prompt)
   * lên mô hình GLB hiện tại, tự động ánh xạ tên xương linh hoạt và phát ngay trên Timeline.
   */
  applyGeneratedBoneTimeline(
    propId: string,
    spec: {
      duration?: number;
      loop?: boolean;
      speed?: number;
      poseSpace?: 'tpose' | 'rest';
      footLock?: boolean;
      sourceLegLength?: number;
      allowUnsafeParts?: boolean;
      keyframes?: Array<{
        time: number;
        boneName: string;
        rot?: { x?: number; y?: number; z?: number };
        pos?: { x?: number; y?: number; z?: number };
      }>;
    }
  ): number {
    const rig = this._propRigMap.get(propId);
    if (!rig || !spec || !Array.isArray(spec.keyframes)) return 0;

    this._stopRigClipAnim(rig);
    this.resetBonePose(propId);
    rig.timeline.keyframes = [];
    rig.timeline.mode = 'keyframes';
    rig.timeline.enabled = true;
    rig.timeline.poseSpace = spec.poseSpace || 'rest';
    const isTPoseClip = rig.timeline.poseSpace === 'tpose';
    const dur = Math.max(0.5, Math.min(60, Number(spec.duration) || 2.4));
    rig.timeline.duration = Math.round(dur * 100) / 100;
    rig.timeline.loop = spec.loop !== undefined ? !!spec.loop : true;
    if (typeof spec.speed === 'number' && spec.speed > 0) {
      rig.timeline.speed = spec.speed;
    }

    const anat = this._resolveRigAnatomy(rig);
    const aliasMap: Record<string, string> = {
      hips: anat.hips,
      pelvis: anat.hips,
      root: anat.hips,
      spine: anat.lowerSpine,
      spine1: anat.midSpine,
      spine01: anat.midSpine,
      spine2: anat.chest,
      spine02: anat.lowerSpine,
      chest: anat.chest,
      upperchest: anat.chest,
      torso: anat.chest,
      neck: anat.neck,
      head: anat.head,
      leftshoulder: anat.lShoulder !== anat.chest ? anat.lShoulder : anat.lArm,
      rightshoulder: anat.rShoulder !== anat.chest ? anat.rShoulder : anat.rArm,
      leftarm: anat.lArm,
      leftupperarm: anat.lArm,
      upperarm_l: anat.lArm,
      rightarm: anat.rArm,
      rightupperarm: anat.rArm,
      upperarm_r: anat.rArm,
      leftforearm: anat.lForeArm,
      leftlowerarm: anat.lForeArm,
      lowerarm_l: anat.lForeArm,
      rightforearm: anat.rForeArm,
      rightlowerarm: anat.rForeArm,
      lowerarm_r: anat.rForeArm,
      lefthand: anat.lHand,
      righthand: anat.rHand,
      leftupleg: anat.lUpLeg,
      leftthigh: anat.lUpLeg,
      thigh_l: anat.lUpLeg,
      rightupleg: anat.rUpLeg,
      rightthigh: anat.rUpLeg,
      thigh_r: anat.rUpLeg,
      leftleg: anat.lLeg,
      leftcalf: anat.lLeg,
      leftshin: anat.lLeg,
      calf_l: anat.lLeg,
      rightleg: anat.rLeg,
      rightcalf: anat.rLeg,
      rightshin: anat.rLeg,
      calf_r: anat.rLeg,
      leftfoot: anat.lFoot,
      rightfoot: anat.rFoot
    };

    // Kiểm tra xem rig đích có thứ tự cột sống đảo ngược kiểu Meshy (Spine02 là lưng dưới, Spine là ngực) hay không
    const hasInvertedMeshySpine =
      anat.lowerSpine !== anat.chest &&
      /spine02/i.test(anat.lowerSpine) &&
      /^spine$/i.test(anat.chest.replace(/^mixamorig:?/i, '').trim());

    const resolveBoneName = (raw: string): string | null => {
      if (!raw) return null;
      const trimmed = String(raw).trim();
      const clean = trimmed.replace(/^mixamorig:?/i, '').replace(/[\s_.-]+/g, '').toLowerCase();
      // Với các tên cột sống chuẩn hóa (Spine / Spine1 / Spine2) trên rig Meshy đảo ngược, ưu tiên ánh xạ theo giải phẫu chuẩn
      if (hasInvertedMeshySpine && (clean === 'spine' || clean === 'spine1' || clean === 'spine2')) {
        if (aliasMap[clean] && rig.bones.has(aliasMap[clean])) {
          return aliasMap[clean];
        }
      }
      if (rig.bones.has(trimmed)) return trimmed;
      for (const b of rig.bones.values()) {
        const bClean = b.label.replace(/[\s_.-]+/g, '').toLowerCase();
        if (b.name.toLowerCase() === clean || bClean === clean) {
          return b.name;
        }
      }
      if (aliasMap[clean] && rig.bones.has(aliasMap[clean])) {
        return aliasMap[clean];
      }
      for (const b of rig.bones.values()) {
        if (b.label.toLowerCase().includes(clean) || clean.includes(b.label.toLowerCase())) {
          return b.name;
        }
      }
      return null;
    };

    // Chuẩn hóa góc theo chu kỳ 360° về (-180, 180] thay vì cắt cứng ở ±180° (tránh kẹt/gãy góc khi xoay vòng tròn 270°/360°)
    const wrapAngle = (v: any) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return (((n + 180) % 360) + 360) % 360 - 180;
    };
    const clampOffset = (v: any, isRoot: boolean) => {
      const lim = isRoot ? 200 : 5;
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(-lim, Math.min(lim, n)) : 0;
    };

    let addedCount = 0;
    // Khi một nhân vật đích có ÍT đốt xương hơn (vd: chỉ có 1 xương sống thay vì 3 đốt Spine/Spine1/Spine2),
    // cộng dồn góc xoay quaternion tại cùng mốc thời gian thay vì ghi đè mất động tác!
    const mergedByBoneTime = new Map<string, {
      boneName: string;
      time: number;
      quat: pc.Quat;
      pos: { x: number; y: number; z: number };
    }>();

    for (const kf of spec.keyframes) {
      if (!kf || !kf.boneName) continue;
      const resolved = resolveBoneName(kf.boneName);
      if (!resolved) continue;
      const targetBone = rig.bones.get(resolved);
      if (!targetBone) continue;
      // Bảo vệ cấu trúc hình học: CHẶN xoay/dịch các sub-mesh vật liệu dùng chung pivot gốc (0,0,0)
      // (như xe đạp/đồ vật không có skin bone) để không bao giờ bị tách rời hay lật ngược các bộ phận!
      if (!spec.allowUnsafeParts && targetBone.isRigidPartSafe === false) {
        continue;
      }
      const isRootBone = resolved === '__root__';
      const t = Math.max(0, Math.min(rig.timeline.duration, Number(kf.time) || 0));
      let rx = wrapAngle(kf.rot?.x);
      const ry = wrapAngle(kf.rot?.y);
      const rz = wrapAngle(kf.rot?.z);

      // Ràng buộc giải phẫu khớp gối chỉ áp cho nhân vật có xương thật (skinned) khi AI tạo thô ('rest')
      if (rig.hasSkinnedSkeleton && !isTPoseClip && (resolved === anat.lLeg || resolved === anat.rLeg) && resolved !== anat.lUpLeg && resolved !== anat.rUpLeg) {
        if (rx < -5) rx = Math.abs(rx);
      }

      const qStep = new pc.Quat().setFromEulerAngles(rx, ry, rz);
      const posStep = {
        x: clampOffset(kf.pos?.x, isRootBone),
        y: clampOffset(kf.pos?.y, isRootBone),
        z: clampOffset(kf.pos?.z, isRootBone)
      };
      const slotKey = `${resolved}|${Math.round(t * 1000)}`;
      const existing = mergedByBoneTime.get(slotKey);
      if (existing) {
        // Thứ tự chuỗi động học cha -> con: qTotal = qParent * qChild
        existing.quat = new pc.Quat().mul2(existing.quat, qStep).normalize();
        existing.pos.x = clampOffset(existing.pos.x + posStep.x, isRootBone);
        existing.pos.y = clampOffset(existing.pos.y + posStep.y, isRootBone);
        existing.pos.z = clampOffset(existing.pos.z + posStep.z, isRootBone);
      } else {
        mergedByBoneTime.set(slotKey, {
          boneName: resolved,
          time: t,
          quat: qStep,
          pos: posStep
        });
      }
    }

    const baseIdStamp = Date.now().toString(36);
    let seq = 0;

    // Nếu clip có bật khóa 2 chân bám sàn (footLock) trên nền Canonical T-Pose:
    // đo chính xác tỷ lệ chiều dài đùi/cẳng chân của chính rig đích (nguoigo_rigged / Meshy / Mixamo...),
    // co giãn Hips.pos (x,y,z) đúng tỷ lệ và giải lại 2-Bone Analytical Leg IK trực tiếp trên chiều dài xương thật
    // để đảm bảo 2 bàn chân đứng cố định tuyệt đối 0.000mm trên mặt sàn ở mọi mô hình 3D!
    if (spec.footLock && isTPoseClip && anat.hips && anat.lUpLeg !== anat.hips && anat.lLeg !== anat.lUpLeg && anat.lFoot !== anat.lLeg && anat.rUpLeg !== anat.hips && anat.rLeg !== anat.rUpLeg && anat.rFoot !== anat.rLeg) {
      const bHips = rig.bones.get(anat.hips);
      const bLUp = rig.bones.get(anat.lUpLeg);
      const bLLeg = rig.bones.get(anat.lLeg);
      const bLFoot = rig.bones.get(anat.lFoot);
      const bRUp = rig.bones.get(anat.rUpLeg);
      const bRLeg = rig.bones.get(anat.rLeg);
      const bRFoot = rig.bones.get(anat.rFoot);
      if (bHips?.node && bLUp?.node && bLLeg?.node && bLFoot?.node && bRUp?.node && bRLeg?.node && bRFoot?.node) {
        const invGlb = rig.glbEntity.getWorldTransform().clone().invert();
        const getLocal = (nd: pc.GraphNode): pc.Vec3 => invGlb.transformPoint(nd.getPosition(), new pc.Vec3());
        const pH0 = getLocal(bHips.node);
        const pLU0 = getLocal(bLUp.node);
        const pLL0 = getLocal(bLLeg.node);
        const pLF0 = getLocal(bLFoot.node);
        const pRU0 = getLocal(bRUp.node);
        const pRL0 = getLocal(bRLeg.node);
        const pRF0 = getLocal(bRFoot.node);

        const lThigh = 0.5 * (pLU0.distance(pLL0) + pRU0.distance(pRL0));
        const lShin = 0.5 * (pLL0.distance(pLF0) + pRL0.distance(pRF0));
        const rigLegLen = lThigh + lShin;
        const hipOffL = pLU0.clone().sub(pH0);
        const hipOffR = pRU0.clone().sub(pH0);
        const restHipY = pH0.y - 0.5 * (pLF0.y + pRF0.y);

        if (rigLegLen > 0.05 && lThigh > 0.02 && lShin > 0.02) {
          const srcLegLen = Number(spec.sourceLegLength) > 0.1 ? Number(spec.sourceLegLength) : rigLegLen;
          const posScaleRatio = rigLegLen / srcLegLen;

          // Gom theo mốc thời gian (ms)
          const byTimeMs = new Map<number, Map<string, { boneName: string; time: number; quat: pc.Quat; pos: { x: number; y: number; z: number } }>>();
          mergedByBoneTime.forEach((entry) => {
            const ms = Math.round(entry.time * 1000);
            if (!byTimeMs.has(ms)) byTimeMs.set(ms, new Map());
            byTimeMs.get(ms)!.set(entry.boneName, entry);
          });

          const sortedMs = Array.from(byTimeMs.keys()).sort((a, b) => a - b);
          const vDownThigh = new pc.Vec3(0, -lThigh, 0);
          const vDownShin = new pc.Vec3(0, -lShin, 0);

          // 1. Scale Hips.pos theo tỷ lệ chân rig đích & lấy trung vị vị trí 2 cổ chân làm điểm neo cố định trên sàn
          const lAnkSamples: pc.Vec3[] = [];
          const rAnkSamples: pc.Vec3[] = [];
          for (const ms of sortedMs) {
            const frame = byTimeMs.get(ms)!;
            const eH = frame.get(anat.hips);
            if (!eH) continue;
            eH.pos.x *= posScaleRatio;
            eH.pos.y *= posScaleRatio;
            eH.pos.z *= posScaleRatio;

            const qH = eH.quat;
            const pH = new pc.Vec3(eH.pos.x, restHipY + eH.pos.y, eH.pos.z);
            const eLU = frame.get(anat.lUpLeg);
            const eLL = frame.get(anat.lLeg);
            const eRU = frame.get(anat.rUpLeg);
            const eRL = frame.get(anat.rLeg);
            if (eLU && eLL && eRU && eRL) {
              const qLT = new pc.Quat().mul2(qH, eLU.quat);
              const qLS = new pc.Quat().mul2(qLT, eLL.quat);
              const pLH = pH.clone().add(qH.transformVector(hipOffL, new pc.Vec3()));
              const pLA = pLH.clone().add(qLT.transformVector(vDownThigh, new pc.Vec3())).add(qLS.transformVector(vDownShin, new pc.Vec3()));
              lAnkSamples.push(pLA);

              const qRT = new pc.Quat().mul2(qH, eRU.quat);
              const qRS = new pc.Quat().mul2(qRT, eRL.quat);
              const pRH = pH.clone().add(qH.transformVector(hipOffR, new pc.Vec3()));
              const pRA = pRH.clone().add(qRT.transformVector(vDownThigh, new pc.Vec3())).add(qRS.transformVector(vDownShin, new pc.Vec3()));
              rAnkSamples.push(pRA);
            }
          }

          const medianCoord = (arr: pc.Vec3[], comp: 'x' | 'y' | 'z', fallback: number): number => {
            if (!arr.length) return fallback;
            const vals = arr.map((v) => v[comp]).sort((a, b) => a - b);
            return vals[Math.floor(vals.length / 2)];
          };
          const stanceHalfX = Math.max(
            Math.abs(hipOffL.x) * 1.1,
            Math.min(rigLegLen * 0.36, 0.5 * Math.abs(medianCoord(lAnkSamples, 'x', hipOffL.x) - medianCoord(rAnkSamples, 'x', hipOffR.x)))
          );
          const lAnkZ = Math.max(-rigLegLen * 0.16, Math.min(rigLegLen * 0.16, medianCoord(lAnkSamples, 'z', 0)));
          const rAnkZ = Math.max(-rigLegLen * 0.16, Math.min(rigLegLen * 0.16, medianCoord(rAnkSamples, 'z', 0)));
          const leftSign = hipOffL.x >= hipOffR.x ? 1 : -1;
          const lAnkFixed = new pc.Vec3(leftSign * stanceHalfX, 0, lAnkZ);
          const rAnkFixed = new pc.Vec3(-leftSign * stanceHalfX, 0, rAnkZ);
          const midFixed = lAnkFixed.clone().add(rAnkFixed).mulScalar(0.5);
          const maxReach = rigLegLen * 0.975;

          const makeBasisQuat = (xAxis: pc.Vec3, yAxis: pc.Vec3, zAxis: pc.Vec3): pc.Quat => {
            const m = new pc.Mat4();
            const d = m.data;
            d[0] = xAxis.x; d[1] = xAxis.y; d[2] = xAxis.z; d[3] = 0;
            d[4] = yAxis.x; d[5] = yAxis.y; d[6] = yAxis.z; d[7] = 0;
            d[8] = zAxis.x; d[9] = zAxis.y; d[10] = zAxis.z; d[11] = 0;
            d[12] = 0; d[13] = 0; d[14] = 0; d[15] = 1;
            return new pc.Quat().setFromMat4(m).normalize();
          };

          const solveLegIkPc = (
            pHip: pc.Vec3,
            pAnk: pc.Vec3,
            poleHint: pc.Vec3,
            toeOutDeg: number
          ): { qThigh: pc.Quat; qShin: pc.Quat; qFoot: pc.Quat } => {
            const vec = pAnk.clone().sub(pHip);
            const rawD = vec.length();
            const minD = Math.max(0.05, Math.abs(lThigh - lShin) + 0.02);
            const d = Math.max(minD, Math.min(rigLegLen * 0.994, rawD));
            const dirHA = rawD > 1e-6 ? vec.clone().mulScalar(1 / rawD) : new pc.Vec3(0, -1, 0);
            const a = (lThigh * lThigh + d * d - lShin * lShin) / (2 * d);
            const h = Math.sqrt(Math.max(0, lThigh * lThigh - a * a));
            const poleProj = poleHint.clone().sub(dirHA.clone().mulScalar(poleHint.dot(dirHA)));
            if (poleProj.lengthSq() < 1e-6) {
              poleProj.set(0, 0, 1).sub(dirHA.clone().mulScalar(dirHA.z));
            }
            poleProj.normalize();
            const pKnee = pHip.clone().add(dirHA.clone().mulScalar(a)).add(poleProj.clone().mulScalar(h));
            const vThigh = pKnee.clone().sub(pHip).normalize();
            const vShin = pAnk.clone().sub(pKnee).normalize();

            let xHinge = new pc.Vec3().cross(vThigh, vShin);
            if (xHinge.lengthSq() < 1e-6) {
              xHinge = new pc.Vec3().cross(poleProj, dirHA);
            }
            xHinge.normalize();
            if (xHinge.x * leftSign < 0) xHinge.mulScalar(-1);

            const yT = vThigh.clone().mulScalar(-1);
            const zT = new pc.Vec3().cross(xHinge, yT).normalize();
            const xT = new pc.Vec3().cross(yT, zT).normalize();
            const qThigh = makeBasisQuat(xT, yT, zT);

            const yS = vShin.clone().mulScalar(-1);
            const zS = new pc.Vec3().cross(xHinge, yS).normalize();
            const xS = new pc.Vec3().cross(yS, zS).normalize();
            const qShin = makeBasisQuat(xS, yS, zS);

            const qFoot = new pc.Quat().setFromEulerAngles(0, toeOutDeg, 0);
            return { qThigh, qShin, qFoot };
          };

          const poleL = new pc.Vec3(leftSign * 0.28, 0.12, 1.0).normalize();
          const poleR = new pc.Vec3(-leftSign * 0.28, 0.12, 1.0).normalize();

          for (const ms of sortedMs) {
            const frame = byTimeMs.get(ms)!;
            const eH = frame.get(anat.hips);
            if (!eH) continue;
            const qH = eH.quat;
            const pH = new pc.Vec3(eH.pos.x, Math.max(rigLegLen * 0.34, restHipY + eH.pos.y), eH.pos.z);

            for (let it = 0; it < 4; it++) {
              const pLH = pH.clone().add(qH.transformVector(hipOffL, new pc.Vec3()));
              const pRH = pH.clone().add(qH.transformVector(hipOffR, new pc.Vec3()));
              const dMax = Math.max(pLH.distance(lAnkFixed), pRH.distance(rAnkFixed));
              if (dMax <= maxReach) break;
              const shrink = (maxReach - 0.004) / Math.max(1e-6, dMax);
              pH.copy(midFixed).add(pH.clone().sub(midFixed).mulScalar(shrink));
            }
            eH.pos.x = pH.x;
            eH.pos.y = pH.y - restHipY;
            eH.pos.z = pH.z;

            const qHInv = qH.clone().invert();
            const pLH = pH.clone().add(qH.transformVector(hipOffL, new pc.Vec3()));
            const pRH = pH.clone().add(qH.transformVector(hipOffR, new pc.Vec3()));

            const ikL = solveLegIkPc(pLH, lAnkFixed, poleL, leftSign * 10);
            const ikR = solveLegIkPc(pRH, rAnkFixed, poleR, -leftSign * 10);

            const setBoneQ = (bName: string, qVal: pc.Quat) => {
              const slot = `${bName}|${ms}`;
              const ex = mergedByBoneTime.get(slot);
              if (ex) {
                ex.quat = qVal;
              } else {
                mergedByBoneTime.set(slot, {
                  boneName: bName,
                  time: eH.time,
                  quat: qVal,
                  pos: { x: 0, y: 0, z: 0 }
                });
              }
            };

            setBoneQ(anat.lUpLeg, new pc.Quat().mul2(qHInv, ikL.qThigh).normalize());
            setBoneQ(anat.lLeg, new pc.Quat().mul2(ikL.qThigh.clone().invert(), ikL.qShin).normalize());
            setBoneQ(anat.lFoot, new pc.Quat().mul2(ikL.qShin.clone().invert(), ikL.qFoot).normalize());

            setBoneQ(anat.rUpLeg, new pc.Quat().mul2(qHInv, ikR.qThigh).normalize());
            setBoneQ(anat.rLeg, new pc.Quat().mul2(ikR.qThigh.clone().invert(), ikR.qShin).normalize());
            setBoneQ(anat.rFoot, new pc.Quat().mul2(ikR.qShin.clone().invert(), ikR.qFoot).normalize());
          }
        }
      }
    }

    mergedByBoneTime.forEach((entry) => {
      const e = entry.quat.getEulerAngles();
      const clampedT = Math.round(Math.max(0, Math.min(rig.timeline.duration, entry.time)) * 1000) / 1000;
      const rot = {
        x: Math.round(e.x * 100) / 100,
        y: Math.round(e.y * 100) / 100,
        z: Math.round(e.z * 100) / 100
      };
      const pos = {
        x: Math.round((Number(entry.pos?.x) || 0) * 1000) / 1000,
        y: Math.round((Number(entry.pos?.y) || 0) * 1000) / 1000,
        z: Math.round((Number(entry.pos?.z) || 0) * 1000) / 1000
      };
      rig.timeline.keyframes.push({
        id: `kf_${baseIdStamp}_${seq++}`,
        time: clampedT,
        boneName: entry.boneName,
        rot,
        pos
      });
      addedCount++;
    });

    if (addedCount > 0) {
      rig.timeline.keyframes.sort((a, b) => a.time - b.time);
      const hasRootTravel = rig.timeline.keyframes.some(
        (k) =>
          k.boneName === '__root__' &&
          k.pos &&
          (Math.abs(k.pos.x || 0) > 0.05 || Math.abs(k.pos.z || 0) > 0.05)
      );
      if (hasRootTravel) {
        rig.timeline.inPlace = false;
      }
      rig.currentTime = 0;
      rig.timeline.playing = true;
      this.evaluatePropKeyframesAtTime(propId, 0);
    }
    return addedCount;
  }

  /**
   * Chuyển đổi trực tiếp chuỗi dữ liệu tư thế khung hình Video (VideoFramePoseSample[])
   * sang hệ thống Keyframe 3D trên toàn bộ khớp xương nhân vật (Motion Retargeting).
   */
  synthesizeVideoPoseBoneMotion(
    propId: string,
    samples: VideoFramePoseSample[],
    duration: number,
    promptHint = ''
  ): number {
    const rig = this._propRigMap.get(propId);
    if (!rig || !Array.isArray(samples) || samples.length === 0) return 0;

    const anat = this._resolveRigAnatomy(rig);
    const dur = Math.max(0.8, Math.min(60, Number(duration) || 3.0));
    const kfs: Array<{
      time: number;
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos?: { x: number; y: number; z: number };
    }> = [];

    const push = (boneName: string, time: number, rx: number, ry: number, rz: number, px = 0, py = 0, pz = 0) => {
      if (!boneName) return;
      kfs.push({
        time: Math.round(time * 100) / 100,
        boneName,
        rot: {
          x: Math.round(Math.max(-135, Math.min(135, rx)) * 10) / 10,
          y: Math.round(Math.max(-150, Math.min(150, ry)) * 10) / 10,
          z: Math.round(Math.max(-135, Math.min(135, rz)) * 10) / 10
        },
        pos: {
          x: Math.round(Math.max(-1.2, Math.min(1.2, px)) * 100) / 100,
          y: Math.round(Math.max(-0.65, Math.min(0.65, py)) * 100) / 100,
          z: Math.round(Math.max(-1.2, Math.min(1.2, pz)) * 100) / 100
        }
      });
    };

    const baseCx = samples[0]?.cx ?? 0.5;
    const baseCy = samples[0]?.cy ?? 0.5;
    const lowerHint = (promptHint || '').toLowerCase();
    const isHighEnergyHint = /nhảy|dance|hiphop|võ|đá|kick|đấm|boxing/.test(lowerHint);
    const ampScale = isHighEnergyHint ? 1.25 : 1.05;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const t = Math.max(0, Math.min(dur, Number(s.time) || (i / Math.max(1, samples.length - 1)) * dur));

      // Dịch chuyển Hips theo chuyển động ngang (cx) và độ nhún/bật dọc (cy) của chủ thể trong video
      const dx = (s.cx - baseCx) * 1.15;
      const dy = (baseCy - s.cy) * 0.75;
      const turnY = (s.torsoTurnY || 0) * ampScale;
      const leanZ = (s.torsoLeanZ || 0) * ampScale;
      const pitchX = (s.torsoPitchX || 0) * ampScale;

      push(anat.hips, t, pitchX * 0.35, turnY * 0.55, leanZ * 0.35, dx, dy, 0);
      if (anat.lowerSpine !== anat.hips) {
        push(anat.lowerSpine, t, pitchX * 0.35, turnY * 0.25, leanZ * 0.35);
      }
      if (anat.midSpine !== anat.lowerSpine && anat.midSpine !== anat.hips) {
        push(anat.midSpine, t, pitchX * 0.2, turnY * 0.15, leanZ * 0.2);
      }
      if (anat.chest !== anat.midSpine && anat.chest !== anat.lowerSpine) {
        push(anat.chest, t, pitchX * 0.2, turnY * 0.15, leanZ * 0.2);
      }
      if (anat.neck !== anat.chest) {
        push(anat.neck, t, -pitchX * 0.15, -turnY * 0.12, -leanZ * 0.15);
      }
      if (anat.head !== anat.neck) {
        push(anat.head, t, pitchX * 0.25 - 3, -turnY * 0.2, -leanZ * 0.2);
      }

      // Cánh tay & Khuỷu tay (tư thế gốc A-pose ~35 độ, khép nhẹ vào thân khi hạ tay, mở rộng khi vung tay)
      const lArmRz = (s.leftArmLift - 22) * ampScale;
      const rArmRz = -(s.rightArmLift - 22) * ampScale;
      const lArmRx = -(s.leftArmFwd || 0) * ampScale;
      const rArmRx = -(s.rightArmFwd || 0) * ampScale;

      push(anat.lArm, t, lArmRx, (s.leftElbowBend > 35 ? -15 : 8), lArmRz);
      push(anat.rArm, t, rArmRx, (s.rightElbowBend > 35 ? 15 : -8), rArmRz);

      if (anat.lForeArm !== anat.lArm) {
        const lElbow = Math.max(0, s.leftElbowBend || 0) * ampScale;
        push(anat.lForeArm, t, -lElbow, 0, -lElbow * 0.28);
      }
      if (anat.rForeArm !== anat.rArm) {
        const rElbow = Math.max(0, s.rightElbowBend || 0) * ampScale;
        push(anat.rForeArm, t, -rElbow, 0, rElbow * 0.28);
      }

      // Đùi, Đầu gối & Bàn chân
      const lThighRx = (s.leftLegPitch || 0) * ampScale;
      const rThighRx = (s.rightLegPitch || 0) * ampScale;
      const lKneeRx = Math.max(0, (s.leftKneeBend || 0) * ampScale);
      const rKneeRx = Math.max(0, (s.rightKneeBend || 0) * ampScale);

      push(anat.lUpLeg, t, lThighRx, 0, Math.max(-18, Math.min(18, leanZ * 0.25)));
      push(anat.rUpLeg, t, rThighRx, 0, Math.max(-18, Math.min(18, leanZ * 0.25)));

      if (anat.lLeg !== anat.lUpLeg) {
        push(anat.lLeg, t, lKneeRx, 0, 0);
      }
      if (anat.rLeg !== anat.rUpLeg) {
        push(anat.rLeg, t, rKneeRx, 0, 0);
      }
      if (anat.lFoot !== anat.lLeg) {
        push(anat.lFoot, t, -(lThighRx + lKneeRx) * 0.35, 0, 0);
      }
      if (anat.rFoot !== anat.rLeg) {
        push(anat.rFoot, t, -(rThighRx + rKneeRx) * 0.35, 0, 0);
      }
    }

    return this.applyGeneratedBoneTimeline(propId, {
      duration: dur,
      loop: true,
      keyframes: kfs
    });
  }

  /**
   * Trình biên dịch Kế hoạch Chuyển động do AI suy luận & biên đạo (`applyAiMotionPlan`):
   * - AI (LLM) tự do hiểu và phân tích bất kỳ yêu cầu tự nhiên nào (1 bước hay chuỗi nhiều bước phức tạp) và trả về
   *   mảng `segments` (`move` / `turn` / `arc` / `waypoints` / `figure8` / `pose` / `wait`) kết hợp tùy chọn `keyframes` khớp xương.
   * - Engine thực thi tính toán hình học, động học quỹ đạo 3D liên tục trên `__root__`, xoay mượt SLERP không lật góc,
   *   lăn/đánh lái bánh xe tự động không trượt, giữ cân bằng xe 4 bánh, và ghép dáng đi/chạy mocap (hoặc procedural)
   *   đồng bộ với các tư thế pose của AI trên cùng một không gian `'rest'`.
   */
  applyAiMotionPlan(
    propId: string,
    plan: {
      duration?: number;
      loop?: boolean;
      speed?: number;
      poseSpace?: 'tpose' | 'rest';
      prompt?: string;
      referenceClipName?: string;
      segments?: Array<{
        type: 'move' | 'turn' | 'arc' | 'waypoints' | 'figure8' | 'pose' | 'wait' | 'walk_and_grab' | 'approach' | 'reach_and_grab' | 'reach_pose' | 'release';
        duration?: number;
        targetPropId?: string;
        hand?: 'right' | 'left';
        attach?: boolean;
        stopDistance?: number;
        targetOffset?: { forward?: number; up?: number; side?: number };
        afterGrab?: 'inspect' | 'hold' | 'carry_back';
        distance?: number;
        dy?: number;
        angleDeg?: number;
        radius?: number;
        sweepDeg?: number;
        width?: number;
        centerOnOrigin?: boolean;
        reverse?: boolean;
        faceVelocity?: boolean;
        leanDeg?: number;
        points?: Array<{ x?: number; y?: number; z?: number }>;
        relative?: boolean;
        gait?: 'auto' | 'walk' | 'run' | 'embedded' | 'idle' | 'none';
        clipName?: string;
        keepFromClip?: string | string[];
        overrideVideoBones?: boolean;
        keyframes?: Array<{
          time: number;
          boneName: string;
          rot?: { x?: number; y?: number; z?: number };
          pos?: { x?: number; y?: number; z?: number };
        }>;
      }>;
      keyframes?: Array<{
        time: number;
        boneName: string;
        rot?: { x?: number; y?: number; z?: number };
        pos?: { x?: number; y?: number; z?: number };
      }>;
    }
  ): number {
    const rig = this._propRigMap.get(propId);
    if (!rig || !plan) return 0;

    const segments = Array.isArray(plan.segments) ? plan.segments.filter((s) => s && s.type) : [];
    // Tương thích ngược nếu kế hoạch chỉ có 1 đoạn walk_and_grab duy nhất
    if (segments.length === 1 && segments[0].type === 'walk_and_grab' && segments[0].targetPropId) {
      const grabSeg = segments[0];
      const res = this.generateWalkAndGrabTimeline(propId, {
        targetPropId: grabSeg.targetPropId,
        hand: grabSeg.hand === 'left' ? 'left' : 'right',
        gait: grabSeg.gait === 'run' ? 'run' : 'walk',
        afterGrab:
          grabSeg.afterGrab === 'hold' || grabSeg.afterGrab === 'carry_back'
            ? grabSeg.afterGrab
            : 'inspect',
        duration: Number(grabSeg.duration) || Number(plan.duration) || undefined,
        prompt: plan.prompt
      });
      return res?.appliedCount || 0;
    }

    // Nếu AI chỉ trả về keyframes trực tiếp (động tác tại chỗ / nhảy / bắt chước video) -> áp trực tiếp
    if (segments.length === 0) {
      if (Array.isArray(plan.keyframes) && plan.keyframes.length > 0) {
        return this.applyGeneratedBoneTimeline(propId, plan);
      }
      return 0;
    }

    const hasSceneInteractionSegs = segments.some((s) =>
      s.type === 'approach' || s.type === 'reach_and_grab' || s.type === 'reach_pose' || s.type === 'release' || s.type === 'walk_and_grab'
    );
    if (hasSceneInteractionSegs) {
      // Trả đồ vật đang bị nắm trước đó (nếu có) về vị trí gốc trước khi lập kế hoạch tương tác mới
      this.clearPropHandGrabs(propId, true);
    }

    const isHumanoid = rig.hasSkinnedSkeleton;
    const isFourWheeler = !isHumanoid && rig.autoWheels.length >= 3;
    const allowTurnLean = !isHumanoid && !isFourWheeler;
    const meterScale = rig.meterScale || 1;
    const forwardAxis = rig.forwardAxis || '+z';
    const baseFwd = forwardAxis === '+x' ? new pc.Vec3(1, 0, 0) : new pc.Vec3(0, 0, 1);
    const baseLeft = new pc.Vec3().cross(new pc.Vec3(0, 1, 0), baseFwd).normalize();

    const getBasisAtYaw = (yawDeg: number) => {
      const q = new pc.Quat().setFromEulerAngles(0, yawDeg, 0);
      const fwd = q.transformVector(baseFwd, new pc.Vec3());
      const left = q.transformVector(baseLeft, new pc.Vec3());
      return { fwd, left };
    };

    const normBoneKey = (name: string): string =>
      String(name || '').replace(/^mixamorig:?/i, '').replace(/[\s_.-]+/g, '').toLowerCase();

    // Bộ đệm trích xuất clip mocap nhúng HOẶC clip mocap đã trích từ Video mẫu (quy đổi chuẩn xác tpose -> rest để ghép 1:1 với mọi segment!)
    const embeddedClips = rig.clips.filter((c) => !c.isCustomKeyframeClip && !!c.resource);
    const customGaitClips = rig.clips.filter((c) => {
      if (!c.isCustomKeyframeClip || !Array.isArray(c.keyframes) || c.keyframes.length < 20) return false;
      const isVideoClip = /^video:/i.test(String(c.name || '').trim());
      // Chỉ dùng làm gait lặp nếu clip là video mẫu HOẶC dáng đi/chạy tại chỗ (không mang quỹ đạo __root__ di chuyển xa) và khớp xương của rig hiện tại
      const hasRootMove = !isVideoClip && c.keyframes.some(
        (k) => k && k.boneName === '__root__' && k.pos && (Math.abs(k.pos.x || 0) > 0.25 || Math.abs(k.pos.z || 0) > 0.25)
      );
      if (hasRootMove) return false;
      const matchedBones = new Set<string>();
      for (const k of c.keyframes) {
        if (k && k.boneName && k.boneName !== '__root__' && rig.bones.has(k.boneName)) {
          matchedBones.add(k.boneName);
          if (matchedBones.size >= 6) return true;
        }
      }
      return false;
    });
    const defaultRefClipName =
      String(plan.referenceClipName || '').trim() ||
      String(segments.find((s) => typeof s.clipName === 'string' && /^video:/i.test(s.clipName.trim()))?.clipName || '').trim();
    const extractedClipCache = new Map<string, GlbSavedKeyframeClip | null>();
    const convertCustomClipToRest = (clipObj: any): GlbSavedKeyframeClip | null => {
      if (!clipObj || !Array.isArray(clipObj.keyframes) || clipObj.keyframes.length === 0) return null;
      const isTPose = clipObj.poseSpace === 'tpose';
      const outKfs: GlbBoneKeyframe[] = [];
      for (const bk of clipObj.keyframes) {
        if (!bk || !bk.boneName || bk.boneName === '__root__') continue;
        const bone = rig.bones.get(bk.boneName);
        if (!bone) continue;
        let rot = { x: Number(bk.rot?.x) || 0, y: Number(bk.rot?.y) || 0, z: Number(bk.rot?.z) || 0 };
        if (isTPose && bone.tposeLocalQuat && bone.tposeCharQuat && bone.restQuat && bone.charRestQuat) {
          // Quy đổi chính xác 1:1 từ Canonical T-Pose sang Rest Space:
          // qTargetLocal   = tposeLocalQuat * inv(tposeCharQuat) * qTPose * tposeCharQuat
          // qLocalFromRest = inv(restQuat) * qTargetLocal
          // qRest          = charRestQuat * qLocalFromRest * inv(charRestQuat)
          const qTPose = new pc.Quat().setFromEulerAngles(rot.x, rot.y, rot.z);
          const qTpInv = bone.tposeCharQuat.clone().invert();
          const qLocalTpDelta = new pc.Quat().mul2(new pc.Quat().mul2(qTpInv, qTPose), bone.tposeCharQuat);
          const qTargetLocal = new pc.Quat().mul2(bone.tposeLocalQuat, qLocalTpDelta).normalize();
          const qLocalFromRest = new pc.Quat().mul2(bone.restQuat.clone().invert(), qTargetLocal).normalize();
          const qRest = new pc.Quat().mul2(
            new pc.Quat().mul2(bone.charRestQuat, qLocalFromRest),
            bone.charRestQuat.clone().invert()
          ).normalize();
          const eRest = qRest.getEulerAngles();
          rot = {
            x: Math.round((Number(eRest.x) || 0) * 10) / 10,
            y: Math.round((Number(eRest.y) || 0) * 10) / 10,
            z: Math.round((Number(eRest.z) || 0) * 10) / 10
          };
        }
        outKfs.push({
          id: bk.id || '',
          time: Number(bk.time) || 0,
          boneName: bk.boneName,
          rot,
          pos: { x: 0, y: Number(bk.pos?.y) || 0, z: 0 }
        });
      }
      if (outKfs.length === 0) return null;
      return {
        name: clipObj.name,
        duration: Math.max(0.4, Number(clipObj.duration) || 1.2),
        poseSpace: 'rest',
        keyframes: outKfs
      };
    };

    const getEmbeddedClipRest = (preferredName?: string, gaitHint?: string): GlbSavedKeyframeClip | null => {
      if (!isHumanoid) return null;
      const allGaitCandidates = [...embeddedClips, ...customGaitClips];
      if (allGaitCandidates.length === 0) return null;

      let chosen = preferredName
        ? allGaitCandidates.find((c) => c.name === preferredName || c.name.toLowerCase().includes(preferredName.toLowerCase()))
        : undefined;
      // Khi có Video mẫu đính kèm (referenceClipName), tự động ưu tiên dùng clip video mẫu ngay cả khi AI chỉ ghi gait: "walk" mà quên truyền clipName
      if (!chosen && !preferredName && defaultRefClipName && gaitHint !== 'run') {
        chosen = allGaitCandidates.find(
          (c) => c.name === defaultRefClipName || c.name.toLowerCase().includes(defaultRefClipName.toLowerCase())
        );
      }
      if (!chosen) {
        const wantRun = gaitHint === 'run';
        chosen = allGaitCandidates.find((c) => {
          const n = String(c.name || '').toLowerCase();
          return wantRun ? /run|jog|sprint|chạy|chay/.test(n) : /walk|stride|stroll|đi bộ|di bo|bước|buoc/.test(n);
        });
      }
      if (!chosen && defaultRefClipName) {
        chosen = allGaitCandidates.find(
          (c) => c.name === defaultRefClipName || c.name.toLowerCase().includes(defaultRefClipName.toLowerCase())
        );
      }
      if (!chosen && gaitHint === 'embedded' && allGaitCandidates.length > 0) {
        chosen = allGaitCandidates[0];
      }
      if (!chosen && embeddedClips.length === 1) {
        const pn = String(rig.propId || '').toLowerCase();
        if ((gaitHint === 'run' && /run|jog/.test(pn)) || (gaitHint !== 'run' && /walk/.test(pn))) {
          chosen = embeddedClips[0];
        }
      }
      if (!chosen) return null;
      if (!extractedClipCache.has(chosen.name)) {
        try {
          if (chosen.isCustomKeyframeClip) {
            extractedClipCache.set(chosen.name, convertCustomClipToRest(chosen));
          } else {
            extractedClipCache.set(chosen.name, this.extractPortableClip(propId, chosen.name, undefined, 'rest'));
          }
        } catch (_) {
          extractedClipCache.set(chosen.name, null);
        }
      }
      return extractedClipCache.get(chosen.name) || null;
    };

    // Ngữ cảnh không gian & 2-Bone Analytical IK dùng chung cho mọi đoạn tương tác đồ vật trong cảnh (approach / reach_and_grab / reach_pose / release)
    const anat = isHumanoid ? this._resolveRigAnatomy(rig) : null;
    const invWrapperMat = rig.wrapper.getWorldTransform().clone().invert();
    const wrapperScale = Math.max(0.01, Math.abs(rig.wrapper.getLocalScale().y || 1));
    const worldPerMeter = wrapperScale * meterScale;
    let actorFloorY = 0;
    let actorHeightW = 1.7 * worldPerMeter;
    let armReachW = 0.62 * worldPerMeter;
    let shoulderAxisC = new pc.Vec3(1, 0, 0);
    const fingerBonesByHand: Record<'right' | 'left', string[]> = { right: [], left: [] };
    const handAnatomyBySide: Record<'right' | 'left', ReturnType<SontinhSceneService['_analyzeRigHandAnatomy']>> = {
      right: null,
      left: null
    };

    if (hasSceneInteractionSegs && isHumanoid && anat) {
      this._stopRigClipAnim(rig);
      rig.timeline.mode = 'keyframes';
      rig.timeline.poseSpace = 'rest';
      this.resetBonePose(propId);
      const ab = this._getEntityVisualWorldBounds(rig.wrapper);
      actorFloorY = ab.min.y;
      actorHeightW = Math.max(0.5, ab.size.y);
      const lArmN = rig.bones.get(anat.lArm)?.node;
      const rArmN = rig.bones.get(anat.rArm)?.node;
      const rForeN = rig.bones.get(anat.rForeArm)?.node;
      const rHandN = rig.bones.get(anat.rHand)?.node;
      if (rArmN && rForeN && rHandN) {
        armReachW = Math.max(actorHeightW * 0.34, rArmN.getPosition().distance(rForeN.getPosition()) + rForeN.getPosition().distance(rHandN.getPosition()));
      }
      if (lArmN && rArmN) {
        const invRq = rig.glbEntity.getRotation().clone().normalize().invert();
        shoulderAxisC = invRq.transformVector(new pc.Vec3().sub2(lArmN.getPosition(), rArmN.getPosition()), new pc.Vec3()).normalize();
      }
      handAnatomyBySide.left = this._analyzeRigHandAnatomy(rig, anat, 'left', actorHeightW, baseFwd);
      handAnatomyBySide.right = this._analyzeRigHandAnatomy(rig, anat, 'right', actorHeightW, baseFwd);
      if (handAnatomyBySide.left) {
        fingerBonesByHand.left = handAnatomyBySide.left.fingers.map((f) => f.boneName);
      }
      if (handAnatomyBySide.right) {
        fingerBonesByHand.right = handAnatomyBySide.right.fingers.map((f) => f.boneName);
      }
    }

    const resolveTargetLocalM = (targetPropId?: string): {
      wrapper: pc.Entity;
      centerW: pc.Vec3;
      txM: number;
      tzM: number;
      heightRatio: number;
      restPos: pc.Vec3;
      restRot: pc.Vec3;
    } | null => {
      if (!targetPropId || targetPropId === propId) return null;
      const tw = this._findPropWrapperEntity(targetPropId);
      if (!tw || !tw.enabled) return null;
      const bb = this._getEntityVisualWorldBounds(tw);
      const localPt = invWrapperMat.transformPoint(bb.center, new pc.Vec3());
      return {
        wrapper: tw,
        centerW: bb.center.clone(),
        txM: localPt.x / meterScale,
        tzM: localPt.z / meterScale,
        heightRatio: (bb.center.y - actorFloorY) / Math.max(0.5, actorHeightW),
        restPos: tw.getPosition().clone(),
        restRot: tw.getEulerAngles().clone()
      };
    };

    const quatFromTo = (a: pc.Vec3, b: pc.Vec3): pc.Quat => {
      const va = a.clone().normalize();
      const vb = b.clone().normalize();
      const d = Math.max(-1, Math.min(1, va.dot(vb)));
      if (d > 0.99995) return new pc.Quat(0, 0, 0, 1);
      if (d < -0.99995) {
        const ortho = Math.abs(va.y) < 0.9 ? new pc.Vec3(0, 1, 0) : new pc.Vec3(1, 0, 0);
        const axis = new pc.Vec3().cross(va, ortho).normalize();
        return new pc.Quat().setFromAxisAngle(axis, 180);
      }
      const axis = new pc.Vec3().cross(va, vb).normalize();
      return new pc.Quat().setFromAxisAngle(axis, (Math.acos(d) * 180) / Math.PI);
    };

    const solveTwoBoneArmIk = (
      handSide: 'right' | 'left',
      rootXM: number,
      rootZM: number,
      rootYawDeg: number,
      bodyPose: Array<{ boneName: string; rot: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } }>,
      worldAimPoint: pc.Vec3,
      wristMode: 'grab' | 'inspect' | 'carry' | 'neutral' = 'neutral',
      heightRatioHint = 0.65
    ): {
      armName: string;
      foreArmName: string;
      handName: string;
      armRot: { x: number; y: number; z: number };
      foreRot: { x: number; y: number; z: number };
      handRot: { x: number; y: number; z: number };
      handWorldPos: pc.Vec3;
      palmWorldPos: pc.Vec3;
    } | null => {
      if (!isHumanoid || !anat) return null;
      const armName = handSide === 'left' ? anat.lArm : anat.rArm;
      const foreArmName = handSide === 'left' ? anat.lForeArm : anat.rForeArm;
      const handName = handSide === 'left' ? anat.lHand : anat.rHand;
      const armB = rig.bones.get(armName);
      const foreB = rig.bones.get(foreArmName);
      const handB = rig.bones.get(handName);
      if (!armB?.node || !foreB?.node || !handB?.node) return null;

      this.resetBonePose(propId);
      this.setBonePoseDelta(propId, '__root__', { x: 0, y: rootYawDeg, z: 0 }, { x: rootXM * meterScale, y: 0, z: rootZM * meterScale });
      for (const bp of bodyPose) {
        if (bp.boneName && bp.boneName !== '__root__') {
          this.setBonePoseDelta(propId, bp.boneName, bp.rot, bp.pos);
        }
      }

      const rootQ = rig.glbEntity.getRotation().clone().normalize();
      const invRootQ = rootQ.clone().invert();
      const toChar = (v: pc.Vec3) => invRootQ.transformVector(v, new pc.Vec3());
      const handAnat = handAnatomyBySide[handSide];
      const palmDistW = handAnat ? handAnat.localPalmOffset.length() : 0;

      const sW = armB.node.getPosition().clone();
      const eW = foreB.node.getPosition().clone();
      const hW = handB.node.getPosition().clone();

      // Khi mục tiêu là nắm đồ vật, lùi mục tiêu cổ tay về sau đúng khoảng cách cổ tay -> lòng bàn tay để LÒNG BÀN TAY chạm đúng tâm đồ vật
      let effectiveWristAimW = worldAimPoint.clone();
      if (wristMode === 'grab' && palmDistW > 1e-4) {
        const approachW = new pc.Vec3().sub2(worldAimPoint, sW);
        if (approachW.lengthSq() > 1e-6) {
          approachW.normalize();
          effectiveWristAimW.sub(approachW.mulScalar(palmDistW * 0.85));
        }
      }

      const vU = toChar(new pc.Vec3().sub2(eW, sW));
      const vF = toChar(new pc.Vec3().sub2(hW, eW));
      const vT = toChar(new pc.Vec3().sub2(effectiveWristAimW, sW));
      const L1 = Math.max(1e-4, vU.length());
      const L2 = Math.max(1e-4, vF.length());
      const rawDist = vT.length();
      const minD = Math.abs(L1 - L2) + Math.min(L1, L2) * 0.08;
      const maxD = (L1 + L2) * 0.985;
      const dist = Math.max(minD, Math.min(maxD, rawDist));

      const dirT = rawDist > 1e-4 ? vT.clone().normalize() : baseFwd.clone();
      const cosAlpha = Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
      const alpha = Math.acos(cosAlpha);

      const sideDir = handSide === 'left' ? shoulderAxisC : shoulderAxisC.clone().mulScalar(-1);
      const pole = new pc.Vec3(sideDir.x * 0.48 - baseFwd.x * 0.35, -0.82, sideDir.z * 0.48 - baseFwd.z * 0.35).normalize();
      const bendDir = new pc.Vec3().sub2(pole, dirT.clone().mulScalar(pole.dot(dirT)));
      if (bendDir.lengthSq() < 1e-5) bendDir.set(sideDir.x, -0.5, sideDir.z);
      bendDir.normalize();

      const uDes = new pc.Vec3(
        dirT.x * Math.cos(alpha) + bendDir.x * Math.sin(alpha),
        dirT.y * Math.cos(alpha) + bendDir.y * Math.sin(alpha),
        dirT.z * Math.cos(alpha) + bendDir.z * Math.sin(alpha)
      ).normalize();

      const qArm = quatFromTo(vU, uDes);
      const eArm = qArm.getEulerAngles();
      const armRot = { x: Math.round(eArm.x * 10) / 10, y: Math.round(eArm.y * 10) / 10, z: Math.round(eArm.z * 10) / 10 };
      this.setBonePoseDelta(propId, armName, armRot);

      const e2W = foreB.node.getPosition().clone();
      const h2W = handB.node.getPosition().clone();
      const vF2 = toChar(new pc.Vec3().sub2(h2W, e2W));
      const vRem = toChar(new pc.Vec3().sub2(effectiveWristAimW, e2W));
      const qFore = new pc.Quat().mul2(qArm.clone().invert(), quatFromTo(vF2, vRem)).mul(qArm).normalize();
      const eFore = qFore.getEulerAngles();
      const foreRot = { x: Math.round(eFore.x * 10) / 10, y: Math.round(eFore.y * 10) / 10, z: Math.round(eFore.z * 10) / 10 };
      this.setBonePoseDelta(propId, foreArmName, foreRot);

      let handRot = { x: 0, y: 0, z: 0 };
      if (handAnat && wristMode !== 'neutral') {
        const headNode = rig.bones.get(anat.head)?.node;
        const headPosW = headNode
          ? headNode.getPosition().clone()
          : new pc.Vec3(sW.x, actorFloorY + actorHeightW * 0.9, sW.z);
        const sideWorld = rootQ.transformVector(sideDir, new pc.Vec3()).normalize();
        handRot = this._solveWristOrientation(propId, rig, handAnat, wristMode, {
          headPosW,
          sideWorld,
          heightRatio: heightRatioHint,
          actorHeightW
        });
      }

      const finalHandPosW = handB.node.getPosition().clone();
      const finalHandQuatW = handB.node.getRotation().clone().normalize();
      const palmWorldPos = handAnat
        ? finalHandPosW.clone().add(finalHandQuatW.transformVector(handAnat.localPalmOffset, new pc.Vec3()))
        : finalHandPosW.clone();

      return { armName, foreArmName, handName, armRot, foreRot, handRot, handWorldPos: finalHandPosW, palmWorldPos };
    };

    const estimateSegmentDur = (seg: any): number => {
      const explicit = Number(seg.duration);
      if (Number.isFinite(explicit) && explicit > 0.1) {
        return Math.max(0.2, Math.min(45, explicit));
      }
      const gait = String(seg.gait || 'auto').toLowerCase();
      const defaultSpeed = isHumanoid
        ? (gait === 'run' ? 2.5 : 1.35)
        : (isFourWheeler ? 4.2 : 3.2);
      if (seg.type === 'approach' || seg.type === 'walk_and_grab') {
        const tgt = resolveTargetLocalM(seg.targetPropId);
        const dist = tgt ? Math.max(0.5, Math.hypot(tgt.txM, tgt.tzM) - 0.5) : 2.5;
        return Math.max(0.7, Math.min(18, dist / Math.max(0.4, defaultSpeed)));
      }
      if (seg.type === 'reach_and_grab') return 0.55;
      if (seg.type === 'reach_pose') return 0.75;
      if (seg.type === 'release') return 0.35;
      if (seg.type === 'move') {
        const dist = Math.abs(Number(seg.distance) || 0);
        const dy = Math.abs(Number(seg.dy) || 0);
        const len = Math.hypot(dist, dy);
        return Math.max(0.6, Math.min(30, len / Math.max(0.4, defaultSpeed)));
      }
      if (seg.type === 'turn') {
        const ang = Math.abs(Number(seg.angleDeg) || 90);
        return Math.max(0.45, Math.min(6.0, (ang / 180) * 0.85));
      }
      if (seg.type === 'arc') {
        const r = Math.max(0.5, Math.abs(Number(seg.radius) || 4));
        const sw = Math.abs(Number(seg.sweepDeg) || 90);
        const arcLen = r * ((sw * Math.PI) / 180);
        return Math.max(0.8, Math.min(35, arcLen / Math.max(0.4, defaultSpeed)));
      }
      if (seg.type === 'figure8') {
        const w = Math.max(2, Math.abs(Number(seg.width) || 10));
        return Math.max(2.5, Math.min(40, (w * 3.1) / Math.max(0.4, defaultSpeed)));
      }
      if (seg.type === 'waypoints' && Array.isArray(seg.points) && seg.points.length > 0) {
        let len = 0;
        let px = 0, py = 0, pz = 0;
        for (const pt of seg.points) {
          const nx = Number(pt?.x) || 0;
          const ny = Number(pt?.y) || 0;
          const nz = Number(pt?.z) || 0;
          len += Math.hypot(nx - px, ny - py, nz - pz);
          px = nx; py = ny; pz = nz;
        }
        return Math.max(1.0, Math.min(40, Math.max(1, len) / Math.max(0.4, defaultSpeed)));
      }
      if (Array.isArray(seg.keyframes) && seg.keyframes.length > 0) {
        const maxLocalT = Math.max(...seg.keyframes.map((k: any) => Number(k?.time) || 0));
        if (maxLocalT > 0.2) return Math.max(0.5, Math.min(20, maxLocalT));
      }
      return 1.5;
    };

    const rawDurs = segments.map((s) => estimateSegmentDur(s));
    const rawTotal = rawDurs.reduce((a, b) => a + b, 0);
    if (rawTotal <= 0.1) return 0;

    let durScale = 1.0;
    const requestedTotal = Number(plan.duration);
    if (Number.isFinite(requestedTotal) && requestedTotal >= 0.5 && requestedTotal <= 58 && segments.every((s) => !(Number(s.duration) > 0))) {
      durScale = requestedTotal / rawTotal;
    } else if (rawTotal > 58) {
      durScale = 58 / rawTotal;
    }
    const segDurs = rawDurs.map((d) => Math.max(0.15, d * durScale));
    const totalDur = Math.round(segDurs.reduce((a, b) => a + b, 0) * 100) / 100;

    const kfs: Array<{
      time: number;
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos?: { x: number; y?: number; z?: number };
    }> = [];

    const lastWrittenMsByBone = new Map<string, number>();
    const pushKfSafe = (
      t: number,
      boneName: string,
      rot: { x: number; y: number; z: number },
      pos: { x: number; y: number; z: number },
      minGapMs = 12
    ) => {
      const clampedT = Math.round(Math.max(0, Math.min(totalDur, t)) * 1000) / 1000;
      const ms = Math.round(clampedT * 1000);
      const bKey = normBoneKey(boneName);
      const prev = lastWrittenMsByBone.get(bKey);
      if (prev !== undefined && Math.abs(ms - prev) < minGapMs) return;
      lastWrittenMsByBone.set(bKey, ms);
      kfs.push({ time: clampedT, boneName, rot, pos });
    };

    const pushRoot = (t: number, xM: number, yM: number, zM: number, yawDeg: number, leanDeg = 0) => {
      const safeLean = allowTurnLean ? Math.max(-25, Math.min(25, Number(leanDeg) || 0)) : 0;
      let rx = 0, ry = yawDeg, rz = 0;
      if (Math.abs(safeLean) > 0.05) {
        const qYaw = new pc.Quat().setFromEulerAngles(0, yawDeg, 0);
        const qLean = forwardAxis === '+x'
          ? new pc.Quat().setFromEulerAngles(safeLean, 0, 0)
          : new pc.Quat().setFromEulerAngles(0, 0, safeLean);
        const qFinal = new pc.Quat().mul2(qYaw, qLean).normalize();
        const e = qFinal.getEulerAngles();
        rx = Math.round(e.x * 100) / 100;
        ry = Math.round(e.y * 100) / 100;
        rz = Math.round(e.z * 100) / 100;
      } else {
        ry = Math.round(yawDeg * 100) / 100;
      }
      pushKfSafe(
        t,
        '__root__',
        { x: rx, y: ry, z: rz },
        {
          x: Math.round(xM * meterScale * 1000) / 1000,
          y: Math.round(yM * meterScale * 1000) / 1000,
          z: Math.round(zM * meterScale * 1000) / 1000
        },
        10
      );
    };

    const gaitTouchedBones = new Set<string>();
    const lastMocapBonePose = new Map<
      string,
      { boneName: string; rot: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } }
    >();
    const isVideoReferenceClip = (clip: GlbSavedKeyframeClip | null | undefined): boolean => {
      if (!clip) return false;
      return /^video:/i.test(String(clip.name || '').trim()) || (!!defaultRefClipName && clip.name === defaultRefClipName);
    };
    const captureClipFrameToMocapMap = (clip: GlbSavedKeyframeClip, targetTimeSec?: number) => {
      if (!clip || !Array.isArray(clip.keyframes) || clip.keyframes.length === 0) return;
      const byTime = new Map<number, GlbBoneKeyframe[]>();
      for (const bk of clip.keyframes) {
        if (!bk || !bk.boneName || bk.boneName === '__root__') continue;
        const ms = Math.round((Number(bk.time) || 0) * 1000);
        if (!byTime.has(ms)) byTime.set(ms, []);
        byTime.get(ms)!.push(bk);
      }
      const uniqueMs = Array.from(byTime.keys()).sort((a, b) => a - b);
      if (uniqueMs.length === 0) return;
      const targetMs = Math.round(
        (targetTimeSec !== undefined ? targetTimeSec : Math.min(0.25, (Number(clip.duration) || 1.2) * 0.15)) * 1000
      );
      const chosenMs = uniqueMs.reduce(
        (best, cur) => (Math.abs(cur - targetMs) < Math.abs(best - targetMs) ? cur : best),
        uniqueMs[0]
      );
      for (const bk of byTime.get(chosenMs) || []) {
        lastMocapBonePose.set(normBoneKey(bk.boneName), {
          boneName: bk.boneName,
          rot: { x: Number(bk.rot?.x) || 0, y: Number(bk.rot?.y) || 0, z: Number(bk.rot?.z) || 0 },
          pos: { x: 0, y: Number(bk.pos?.y) || 0, z: 0 }
        });
      }
    };
    let usedVideoRefClip = false;
    if (isHumanoid && defaultRefClipName) {
      const refRest = getEmbeddedClipRest(defaultRefClipName, 'embedded');
      if (refRest) {
        captureClipFrameToMocapMap(refRest);
        if (isVideoReferenceClip(refRest)) usedVideoRefClip = true;
      }
    }

    const collectHandBoneKeys = (side: 'right' | 'left'): Set<string> => {
      const out = new Set<string>();
      if (!anat) return out;
      const shoulder = side === 'left' ? anat.lShoulder : anat.rShoulder;
      const arm = side === 'left' ? anat.lArm : anat.rArm;
      const fore = side === 'left' ? anat.lForeArm : anat.rForeArm;
      const hand = side === 'left' ? anat.lHand : anat.rHand;
      if (shoulder && shoulder !== anat.chest) out.add(normBoneKey(shoulder));
      if (arm) out.add(normBoneKey(arm));
      if (fore) out.add(normBoneKey(fore));
      if (hand) out.add(normBoneKey(hand));
      const sideRegex = side === 'left'
        ? /(?:(?:clavicle|shoulder|upperarm|lowerarm|forearm|arm|wrist|hand).*(?:[._-]l$|left)|^left(?:shoulder|arm|forearm|hand))/i
        : /(?:(?:clavicle|shoulder|upperarm|lowerarm|forearm|arm|wrist|hand).*(?:[._-]r$|right)|^right(?:shoulder|arm|forearm|hand))/i;
      lastMocapBonePose.forEach((v, k) => {
        if (sideRegex.test(v.boneName)) out.add(k);
      });
      return out;
    };

    const resolveKeepFromClipKeys = (spec: string | string[]): Set<string> => {
      const out = new Set<string>();
      if (!anat || lastMocapBonePose.size === 0) return out;
      const items = Array.isArray(spec) ? spec : [spec];
      const addIfPresent = (bn?: string) => {
        if (!bn) return;
        const k = normBoneKey(bn);
        if (lastMocapBonePose.has(k)) out.add(k);
      };
      const addRightArm = () => collectHandBoneKeys('right').forEach((k) => { if (lastMocapBonePose.has(k)) out.add(k); });
      const addLeftArm = () => collectHandBoneKeys('left').forEach((k) => { if (lastMocapBonePose.has(k)) out.add(k); });
      const addTorso = () => {
        [anat.hips, anat.lowerSpine, anat.midSpine, anat.chest].forEach(addIfPresent);
        lastMocapBonePose.forEach((v, k) => {
          if (/spine|chest|pelvis|hips|waist|abdomen/i.test(v.boneName)) out.add(k);
        });
      };
      const addHead = () => {
        [anat.neck, anat.head].forEach(addIfPresent);
        lastMocapBonePose.forEach((v, k) => {
          if (/neck|head/i.test(v.boneName)) out.add(k);
        });
      };
      const addLeg = (side: 'left' | 'right') => {
        const list = side === 'left' ? [anat.lUpLeg, anat.lLeg, anat.lFoot] : [anat.rUpLeg, anat.rLeg, anat.rFoot];
        list.forEach(addIfPresent);
        const re = side === 'left'
          ? /(?:(?:thigh|upleg|upperleg|lowerleg|calf|shin|leg|foot|toe).*(?:[._-]l$|left)|^left(?:upleg|leg|foot|toebase))/i
          : /(?:(?:thigh|upleg|upperleg|lowerleg|calf|shin|leg|foot|toe).*(?:[._-]r$|right)|^right(?:upleg|leg|foot|toebase))/i;
        lastMocapBonePose.forEach((v, k) => {
          if (re.test(v.boneName)) out.add(k);
        });
      };

      for (const raw of items) {
        const tok = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (!tok || tok === 'none' || tok === 'false') continue;
        if (tok === 'rightarm' || tok === 'rarm' || tok === 'righthand' || tok === 'tayphai') {
          addRightArm();
        } else if (tok === 'leftarm' || tok === 'larm' || tok === 'lefthand' || tok === 'taytrai') {
          addLeftArm();
        } else if (tok === 'arms' || tok === 'botharms' || tok === 'hands' || tok === 'haitay' || tok === '2tay') {
          addLeftArm();
          addRightArm();
        } else if (tok === 'torso' || tok === 'spine' || tok === 'than') {
          addTorso();
        } else if (tok === 'head' || tok === 'neck' || tok === 'dau') {
          addHead();
        } else if (tok === 'upperbody' || tok === 'thantren') {
          addTorso();
          addHead();
          addLeftArm();
          addRightArm();
        } else if (tok === 'leftleg' || tok === 'lleg' || tok === 'chantrai') {
          addLeg('left');
        } else if (tok === 'rightleg' || tok === 'rleg' || tok === 'chanphai') {
          addLeg('right');
        } else if (tok === 'legs' || tok === 'lowerbody' || tok === 'haichan' || tok === '2chan') {
          addLeg('left');
          addLeg('right');
        } else if (tok === 'all' || tok === 'body' || tok === 'full' || tok === 'fullbody' || tok === 'toanthan') {
          lastMocapBonePose.forEach((_, k) => out.add(k));
        } else {
          const nk = normBoneKey(String(raw || ''));
          if (lastMocapBonePose.has(nk)) out.add(nk);
        }
      }
      return out;
    };

    const emitHumanoidGaitWindow = (
      tStart: number,
      tEnd: number,
      gaitMode: 'walk' | 'run' | 'embedded',
      clipName: string | undefined,
      isPivotTurn: boolean,
      skipBones: Set<string>
    ) => {
      if (!isHumanoid || !anat) return;
      const winDur = tEnd - tStart;
      if (winDur < 0.08) return;

      const embedded = gaitMode === 'embedded'
        ? getEmbeddedClipRest(clipName, 'embedded')
        : getEmbeddedClipRest(clipName, gaitMode);

      if (embedded && Array.isArray(embedded.keyframes) && embedded.keyframes.length > 0 && !isPivotTurn) {
        if (isVideoReferenceClip(embedded)) usedVideoRefClip = true;
        const rawCycDur = Math.max(0.45, Math.min(20.0, Number(embedded.duration) || 1.07));
        const wholeCycles = Math.max(1, Math.round(winDur / rawCycDur));
        const effCycDur = rawCycDur <= winDur && Math.abs(winDur / wholeCycles - rawCycDur) <= rawCycDur * 0.25
          ? (winDur / wholeCycles)
          : rawCycDur;

        const byTime = new Map<number, GlbBoneKeyframe[]>();
        const fullByTime = new Map<number, GlbBoneKeyframe[]>();
        for (const bk of embedded.keyframes) {
          if (!bk || bk.boneName === '__root__') continue;
          const ms = Math.round((Number(bk.time) || 0) * 1000);
          if (!fullByTime.has(ms)) fullByTime.set(ms, []);
          fullByTime.get(ms)!.push(bk);
          if (skipBones.has(normBoneKey(bk.boneName))) continue;
          if (!byTime.has(ms)) byTime.set(ms, []);
          byTime.get(ms)!.push(bk);
        }
        const uniqueMs = Array.from(byTime.keys()).sort((a, b) => a - b);
        const targetFrames = Math.max(8, Math.min(48, Math.round(rawCycDur * (wholeCycles >= 6 ? 6 : 9))));
        const strideStep = uniqueMs.length > targetFrames + 2 ? Math.ceil(uniqueMs.length / targetFrames) : 1;
        const pickedMs: number[] = [];
        for (let idx = 0; idx < uniqueMs.length; idx += strideStep) {
          pickedMs.push(uniqueMs[idx]);
        }

        const nLoop = Math.ceil(winDur / effCycDur) + 1;
        for (let cyc = 0; cyc < nLoop; cyc++) {
          const baseT = tStart + cyc * effCycDur;
          if (baseT > tEnd + 0.005) break;
          for (const ms of pickedMs) {
            const frac = Math.min(1, (ms / 1000) / rawCycDur);
            if (frac >= 0.96 && cyc < nLoop - 1) continue;
            const absT = Math.min(tEnd, baseT + frac * effCycDur);
            if (absT > tEnd + 0.002) break;
            const fl = byTime.get(ms) || [];
            for (const bk of fl) {
              gaitTouchedBones.add(bk.boneName);
              pushKfSafe(
                absT,
                bk.boneName,
                { x: bk.rot.x, y: bk.rot.y, z: bk.rot.z },
                bk.pos ? { x: 0, y: bk.pos.y || 0, z: 0 } : { x: 0, y: 0, z: 0 },
                14
              );
            }
            if (absT >= tEnd - 0.004) break;
          }
        }
        // Khép mốc cuối đoạn theo phase khớp tại tEnd (nếu đủ >= 1 chu kỳ thì khép về phase đầu để lặp mượt; nếu clip dài hơn đoạn thì lấy đúng frame tại winDur)
        let closeMs = pickedMs.length > 0 ? pickedMs[0] : -1;
        if (pickedMs.length > 0 && winDur < rawCycDur * 0.92) {
          const targetMs = Math.round(winDur * 1000);
          closeMs = uniqueMs.reduce((best, cur) =>
            Math.abs(cur - targetMs) < Math.abs(best - targetMs) ? cur : best,
            uniqueMs[0]
          );
        }
        const closeList = closeMs >= 0 ? (byTime.get(closeMs) || []) : [];
        for (const bk of closeList) {
          gaitTouchedBones.add(bk.boneName);
          pushKfSafe(
            tEnd,
            bk.boneName,
            { x: bk.rot.x, y: bk.rot.y, z: bk.rot.z },
            bk.pos ? { x: 0, y: bk.pos.y || 0, z: 0 } : { x: 0, y: 0, z: 0 },
            14
          );
        }
        // Ghi nhớ tư thế mocap thật cuối đoạn để các đoạn sau (keepFromClip / giữ nguyên tay từ video) nối mượt 0 độ giật
        if (closeMs >= 0) {
          for (const bk of fullByTime.get(closeMs) || []) {
            lastMocapBonePose.set(normBoneKey(bk.boneName), {
              boneName: bk.boneName,
              rot: { x: Number(bk.rot?.x) || 0, y: Number(bk.rot?.y) || 0, z: Number(bk.rot?.z) || 0 },
              pos: { x: 0, y: Number(bk.pos?.y) || 0, z: 0 }
            });
          }
        }
        return;
      }

      const isRun = gaitMode === 'run' && !isPivotTurn;
      const baseCyc = isRun ? 0.72 : (isPivotTurn ? 0.65 : 1.04);
      const wholeCycles = Math.max(1, Math.round(winDur / baseCyc));
      const steps = wholeCycles * (isPivotTurn ? 6 : 8);
      const swing = isPivotTurn ? 14 : (isRun ? 48 : 34);
      const pushLimb = (bName: string, t: number, rx: number, ry: number, rz: number, py = 0) => {
        if (!bName || bName === '__root__' || skipBones.has(normBoneKey(bName))) return;
        pushKfSafe(
          t,
          bName,
          { x: Math.round(rx * 10) / 10, y: Math.round(ry * 10) / 10, z: Math.round(rz * 10) / 10 },
          { x: 0, y: Math.round(py * 1000) / 1000, z: 0 },
          14
        );
      };
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const t = i === steps ? tEnd : tStart + f * winDur;
        const phase = f * wholeCycles * Math.PI * 2;
        const s = Math.sin(phase);
        const c = Math.cos(phase);
        pushLimb(anat.hips, t, isRun ? 10 : 2, s * (isPivotTurn ? 4 : 7), c * 2.5, Math.abs(c) * (isRun ? 0.09 : 0.03));
        pushLimb(anat.lowerSpine, t, isRun ? 8 : 2, -s * 6, 0);
        if (anat.chest !== anat.lowerSpine) pushLimb(anat.chest, t, isRun ? 6 : 2, -s * 5, 0);
        if (anat.head !== anat.chest) pushLimb(anat.head, t, isRun ? -5 : 0, s * 3, 0);
        pushLimb(anat.lUpLeg, t, -s * swing, 0, 0);
        pushLimb(anat.rUpLeg, t, s * swing, 0, 0);
        if (anat.lLeg !== anat.lUpLeg) pushLimb(anat.lLeg, t, (s < 0 ? -s : 0.16) * (swing * 1.05), 0, 0);
        if (anat.rLeg !== anat.rUpLeg) pushLimb(anat.rLeg, t, (s > 0 ? s : 0.16) * (swing * 1.05), 0, 0);
        if (anat.lFoot !== anat.lLeg) pushLimb(anat.lFoot, t, s > 0 ? -10 * s : 12 * (-s), 0, 0);
        if (anat.rFoot !== anat.rLeg) pushLimb(anat.rFoot, t, s < 0 ? 10 * s : 12 * s, 0, 0);
        pushLimb(anat.lArm, t, s * (swing * 0.68), 0, -16);
        pushLimb(anat.rArm, t, -s * (swing * 0.68), 0, 16);
        if (anat.lForeArm !== anat.lArm) pushLimb(anat.lForeArm, t, isRun ? -62 : -22, 0, 0);
        if (anat.rForeArm !== anat.rArm) pushLimb(anat.rForeArm, t, isRun ? -62 : -22, 0, 0);
      }
    };

    const emitNeutralRestBones = (t: number, skipBones: Set<string>) => {
      if (!isHumanoid || !anat) return;
      const bodyBones = [
        anat.hips, anat.lowerSpine, anat.midSpine, anat.chest, anat.neck, anat.head,
        anat.lArm, anat.lForeArm, anat.rArm, anat.rForeArm,
        anat.lUpLeg, anat.lLeg, anat.lFoot, anat.rUpLeg, anat.rLeg, anat.rFoot,
        ...Array.from(gaitTouchedBones)
      ];
      const seen = new Set<string>();
      for (const bn of bodyBones) {
        const nk = normBoneKey(bn);
        if (!bn || bn === '__root__' || seen.has(nk) || skipBones.has(nk)) continue;
        seen.add(nk);
        pushKfSafe(t, bn, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 14);
      }
    };

    let curX = 0;
    let curY = 0;
    let curZ = 0;
    let curYaw = 0;
    let curT = 0;

    // Theo dõi các bàn tay đang cầm đồ vật trong chuỗi đoạn để giữ ổn định tay cầm & tạo ràng buộc handGrabs tự động
    const heldHands = new Map<'right' | 'left', {
      armName: string;
      foreArmName: string;
      handName: string;
      armRot: { x: number; y: number; z: number };
      foreRot: { x: number; y: number; z: number };
      handRot: { x: number; y: number; z: number };
      gripStyle: 'flat' | 'cylinder' | 'wide';
      targetPropId: string;
    }>();
    const pendingGrabs: Array<{
      id: string;
      targetPropId: string;
      hand: 'right' | 'left';
      grabTime: number;
      releaseTime: number | null;
      restPos: pc.Vec3;
      restRot: pc.Vec3;
    }> = [];

    const emitHandFingers = (
      t: number,
      handSide: 'right' | 'left',
      curled: boolean | number,
      gripStyle: 'flat' | 'cylinder' | 'wide' = 'cylinder'
    ) => {
      const closure = typeof curled === 'number' ? Math.max(0, Math.min(1, curled)) : (curled ? 1 : 0);
      const handAnat = handAnatomyBySide[handSide];
      if (handAnat && handAnat.fingers.length > 0) {
        const poses = this._computeAnatomicalFingerCurl(handAnat, gripStyle, closure);
        for (const p of poses) {
          pushKfSafe(t, p.boneName, p.rot, { x: 0, y: 0, z: 0 }, 10);
        }
        return;
      }
      for (const fName of fingerBonesByHand[handSide]) {
        pushKfSafe(t, fName, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 10);
      }
    };

    const buildBodyPoseForHeight = (heightRatio: number, handSide: 'right' | 'left') => {
      const out: Array<{ boneName: string; rot: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } }> = [];
      if (!anat) return out;
      const s = handSide === 'right' ? 1 : -1;
      if (heightRatio < 0.36) {
        const crouchY = -Math.max(0.14, Math.min(0.36, (0.42 - heightRatio) * 0.78));
        out.push(
          { boneName: anat.hips, rot: { x: 18, y: s * 8, z: 0 }, pos: { x: 0, y: crouchY, z: 0 } },
          { boneName: anat.lowerSpine, rot: { x: 26, y: s * 8, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.chest, rot: { x: 14, y: s * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.head, rot: { x: 22, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.lUpLeg, rot: { x: -46, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.rUpLeg, rot: { x: -46, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.lLeg, rot: { x: 72, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.rLeg, rot: { x: 72, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
        );
      } else if (heightRatio < 0.62) {
        out.push(
          { boneName: anat.hips, rot: { x: 6, y: s * 6, z: 0 }, pos: { x: 0, y: -0.04, z: 0 } },
          { boneName: anat.lowerSpine, rot: { x: 16, y: s * 8, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.chest, rot: { x: 10, y: s * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.head, rot: { x: 16, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
        );
      } else if (heightRatio <= 0.94) {
        out.push(
          { boneName: anat.lowerSpine, rot: { x: 6, y: s * 8, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.chest, rot: { x: 5, y: s * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.head, rot: { x: 6, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
        );
      } else {
        out.push(
          { boneName: anat.lowerSpine, rot: { x: -6, y: s * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.chest, rot: { x: -6, y: s * 5, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { boneName: anat.head, rot: { x: -16, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
        );
      }
      return out;
    };

    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      const segDur = segDurs[sIdx];
      const segStart = curT;
      const segEnd = sIdx === segments.length - 1 ? totalDur : (curT + segDur);
      const isReverse = !!seg.reverse;
      const segCustomBones = new Set<string>();
      let segIsApproachMove = false;
      const segHandledIkHands = new Set<'right' | 'left'>();
      const segExcludedKeepHands = new Set<'right' | 'left'>();
      const explicitSegKfBoneKeys = new Set<string>(
        Array.isArray(seg.keyframes)
          ? seg.keyframes.filter((k) => k && k.boneName && k.boneName !== '__root__').map((k) => normBoneKey(k.boneName))
          : []
      );

      if (seg.type === 'approach' || seg.type === 'walk_and_grab') {
        const tgt = resolveTargetLocalM(seg.targetPropId);
        if (tgt) {
          const dx = tgt.txM - curX;
          const dz = tgt.tzM - curZ;
          const distToTgt = Math.hypot(dx, dz);
          const stopDist = typeof seg.stopDistance === 'number' && Number.isFinite(seg.stopDistance)
            ? Math.max(0.15, Math.min(3.0, seg.stopDistance))
            : Math.max(0.32, (armReachW / worldPerMeter) * 0.74);
          const moveDist = Math.max(0, distToTgt - stopDist);
          let targetYaw = curYaw;
          if (distToTgt > 0.04) {
            targetYaw = forwardAxis === '+x'
              ? (Math.atan2(-dz, dx) * 180) / Math.PI
              : (Math.atan2(dx, dz) * 180) / Math.PI;
          }
          let dYaw = targetYaw - curYaw;
          while (dYaw > 180) dYaw -= 360;
          while (dYaw < -180) dYaw += 360;
          const turnFrac = Math.abs(dYaw) > 12 ? Math.min(0.32, (Math.abs(dYaw) / 180) * 0.35) : 0;
          const turnEnd = segStart + segDur * turnFrac;
          if (turnFrac > 0.01) {
            const tSteps = Math.max(2, Math.ceil(Math.abs(dYaw) / 30));
            for (let k = 0; k <= tSteps; k++) {
              pushRoot(segStart + (k / tSteps) * (turnEnd - segStart), curX, curY, curZ, curYaw + (k / tSteps) * dYaw, 0);
            }
          }
          curYaw += dYaw;
          const ux = distToTgt > 1e-4 ? dx / distToTgt : 0;
          const uz = distToTgt > 1e-4 ? dz / distToTgt : 0;
          const endX = curX + ux * moveDist;
          const endZ = curZ + uz * moveDist;
          const wSteps = Math.max(4, Math.min(24, Math.ceil(moveDist * 2.5)));
          for (let k = 0; k <= wSteps; k++) {
            const f = k / wSteps;
            const t = k === wSteps ? segEnd : turnEnd + f * (segEnd - turnEnd);
            pushRoot(t, curX + (endX - curX) * f, curY, curZ + (endZ - curZ) * f, curYaw, 0);
          }
          curX = endX;
          curZ = endZ;
          segIsApproachMove = moveDist > 0.08;
        } else {
          pushRoot(segStart, curX, curY, curZ, curYaw, 0);
          pushRoot(segEnd, curX, curY, curZ, curYaw, 0);
        }
      } else if (seg.type === 'reach_and_grab') {
        const handSide: 'right' | 'left' = seg.hand === 'left' ? 'left' : 'right';
        const tgt = resolveTargetLocalM(seg.targetPropId);
        if (tgt && isHumanoid && anat) {
          // Quay mặt hướng vào món đồ & hiệu chỉnh bước vi mô nếu cổ tay còn hụt tầm với
          const dx = tgt.txM - curX;
          const dz = tgt.tzM - curZ;
          const distNow = Math.hypot(dx, dz);
          if (distNow > 0.05) {
            let aimYaw = forwardAxis === '+x'
              ? (Math.atan2(-dz, dx) * 180) / Math.PI
              : (Math.atan2(dx, dz) * 180) / Math.PI;
            let dYaw = aimYaw - curYaw;
            while (dYaw > 180) dYaw -= 360;
            while (dYaw < -180) dYaw += 360;
            curYaw += dYaw;
          }
          const bodyPose = buildBodyPoseForHeight(tgt.heightRatio, handSide);
          const propMetrics = this._measurePropLocalBounds(tgt.wrapper);
          const handAnat = handAnatomyBySide[handSide];
          const gripStyle = this._classifyPropGripStyle(propMetrics, handAnat?.handLengthW || actorHeightW * 0.105);

          // Hiệu chỉnh vị trí đứng bằng FK thực tế để LÒNG BÀN TAY (palmWorldPos) chạm sát tâm đồ vật
          const probe = solveTwoBoneArmIk(handSide, curX, curZ, curYaw, bodyPose, tgt.centerW, 'grab', tgt.heightRatio);
          let endX = curX;
          let endZ = curZ;
          if (probe) {
            const targetPt = invWrapperMat.transformPoint(tgt.centerW, new pc.Vec3());
            const palmPt = invWrapperMat.transformPoint(probe.palmWorldPos, new pc.Vec3());
            const errX = (targetPt.x - palmPt.x) / meterScale;
            const errZ = (targetPt.z - palmPt.z) / meterScale;
            if (Math.hypot(errX, errZ) > 0.03) {
              endX += Math.max(-0.95, Math.min(0.95, errX));
              endZ += Math.max(-0.95, Math.min(0.95, errZ));
            }
          }
          pushRoot(segStart, curX, curY, curZ, curYaw, 0);
          pushRoot(segEnd, endX, curY, endZ, curYaw, 0);
          curX = endX;
          curZ = endZ;

          const ik = solveTwoBoneArmIk(handSide, curX, curZ, curYaw, bodyPose, tgt.centerW, 'grab', tgt.heightRatio);
          if (ik) {
            segHandledIkHands.add(handSide);
            segExcludedKeepHands.add(handSide);
            segCustomBones.add(normBoneKey(ik.armName));
            segCustomBones.add(normBoneKey(ik.foreArmName));
            const ikHandKey = normBoneKey(ik.handName);
            for (const fn of fingerBonesByHand[handSide]) segCustomBones.add(normBoneKey(fn));
            for (const bp of bodyPose) {
              if (bp.boneName && bp.boneName !== '__root__') {
                const bpKey = normBoneKey(bp.boneName);
                const isHeadOrNeck = bpKey === normBoneKey(anat.head) || bpKey === normBoneKey(anat.neck);
                if (isHeadOrNeck && explicitSegKfBoneKeys.has(bpKey)) continue;
                segCustomBones.add(bpKey);
                pushKfSafe(segEnd, bp.boneName, bp.rot, bp.pos, 10);
              }
            }
            pushKfSafe(segEnd, ik.armName, ik.armRot, { x: 0, y: 0, z: 0 }, 10);
            pushKfSafe(segEnd, ik.foreArmName, ik.foreRot, { x: 0, y: 0, z: 0 }, 10);
            if (!explicitSegKfBoneKeys.has(ikHandKey)) {
              segCustomBones.add(ikHandKey);
              pushKfSafe(segEnd, ik.handName, ik.handRot, { x: 0, y: 0, z: 0 }, 10);
            }
            // Ngón tay mở khi bắt đầu vươn -> khum nhẹ chuẩn bị ôm -> gập khít đúng dáng món đồ tại thời điểm chạm
            emitHandFingers(segStart, handSide, 0, gripStyle);
            if (segEnd - segStart >= 0.25) {
              emitHandFingers(segStart + (segEnd - segStart) * 0.62, handSide, 0.32, gripStyle);
            }
            emitHandFingers(segEnd, handSide, 1.0, gripStyle);

            if (seg.attach !== false && seg.targetPropId) {
              heldHands.set(handSide, {
                armName: ik.armName,
                foreArmName: ik.foreArmName,
                handName: ik.handName,
                armRot: ik.armRot,
                foreRot: ik.foreRot,
                handRot: ik.handRot,
                gripStyle,
                targetPropId: seg.targetPropId
              });
              pendingGrabs.push({
                id: 'grab_' + Date.now().toString(36) + '_' + sIdx,
                targetPropId: seg.targetPropId,
                hand: handSide,
                grabTime: Math.round(segEnd * 1000) / 1000,
                releaseTime: null,
                restPos: tgt.restPos,
                restRot: tgt.restRot
              });
            }
          }
        } else {
          pushRoot(segStart, curX, curY, curZ, curYaw, 0);
          pushRoot(segEnd, curX, curY, curZ, curYaw, 0);
        }
      } else if (seg.type === 'reach_pose') {
        const handSide: 'right' | 'left' = seg.hand === 'left' ? 'left' : 'right';
        pushRoot(segStart, curX, curY, curZ, curYaw, 0);
        pushRoot(segEnd, curX, curY, curZ, curYaw, 0);
        if (isHumanoid && anat) {
          let aimWorldPt: pc.Vec3 | null = null;
          let hRatio = 0.72;
          let fwdOffsetM = 0.34;
          if (seg.targetPropId) {
            const tgt = resolveTargetLocalM(seg.targetPropId);
            if (tgt) {
              aimWorldPt = tgt.centerW;
              hRatio = tgt.heightRatio;
            }
          }
          if (!aimWorldPt) {
            const fwdM = Number(seg.targetOffset?.forward ?? 0.34);
            fwdOffsetM = fwdM;
            const upM = Math.max(0.08, Math.min(2.3, Number(seg.targetOffset?.up ?? 1.22)));
            const sideM = Number(seg.targetOffset?.side ?? 0.14);
            const qNow = new pc.Quat().setFromEulerAngles(0, curYaw, 0);
            const fwdL = qNow.transformVector(baseFwd, new pc.Vec3()).normalize();
            const sideVecC = handSide === 'left' ? shoulderAxisC : shoulderAxisC.clone().mulScalar(-1);
            const sideL = qNow.transformVector(sideVecC, new pc.Vec3()).normalize();
            const aimLocal = new pc.Vec3(
              (curX + fwdL.x * fwdM + sideL.x * sideM) * meterScale,
              (upM * worldPerMeter) / wrapperScale,
              (curZ + fwdL.z * fwdM + sideL.z * sideM) * meterScale
            );
            aimWorldPt = rig.wrapper.getWorldTransform().transformPoint(aimLocal, new pc.Vec3());
            hRatio = (aimWorldPt.y - actorFloorY) / Math.max(0.5, actorHeightW);
          }
          const bodyPose = buildBodyPoseForHeight(hRatio, handSide);
          const heldBefore = heldHands.get(handSide);
          const wristMode: 'grab' | 'inspect' | 'carry' | 'neutral' = heldBefore
            ? (!seg.targetPropId && hRatio >= 0.54 && fwdOffsetM <= 0.6 ? 'inspect' : 'carry')
            : 'grab';
          const ik = solveTwoBoneArmIk(handSide, curX, curZ, curYaw, bodyPose, aimWorldPt, wristMode, hRatio);
          if (ik) {
            segHandledIkHands.add(handSide);
            segExcludedKeepHands.add(handSide);
            segCustomBones.add(normBoneKey(ik.armName));
            segCustomBones.add(normBoneKey(ik.foreArmName));
            const ikHandKey = normBoneKey(ik.handName);
            for (const bp of bodyPose) {
              if (bp.boneName && bp.boneName !== '__root__') {
                const bpKey = normBoneKey(bp.boneName);
                const isHeadOrNeck = bpKey === normBoneKey(anat.head) || bpKey === normBoneKey(anat.neck);
                if (isHeadOrNeck && explicitSegKfBoneKeys.has(bpKey)) continue;
                segCustomBones.add(bpKey);
                pushKfSafe(segEnd, bp.boneName, bp.rot, bp.pos, 10);
              }
            }
            pushKfSafe(segEnd, ik.armName, ik.armRot, { x: 0, y: 0, z: 0 }, 10);
            pushKfSafe(segEnd, ik.foreArmName, ik.foreRot, { x: 0, y: 0, z: 0 }, 10);
            const held = heldHands.get(handSide);
            if (!explicitSegKfBoneKeys.has(ikHandKey)) {
              segCustomBones.add(ikHandKey);
              pushKfSafe(segEnd, ik.handName, ik.handRot, { x: 0, y: 0, z: 0 }, 10);
            }
            if (held) {
              held.armRot = ik.armRot;
              held.foreRot = ik.foreRot;
              if (!explicitSegKfBoneKeys.has(ikHandKey)) {
                held.handRot = ik.handRot;
              }
              for (const fn of fingerBonesByHand[handSide]) segCustomBones.add(normBoneKey(fn));
              emitHandFingers(segEnd, handSide, 1.0, held.gripStyle);
            }
          }
        }
      } else if (seg.type === 'release') {
        const handSide: 'right' | 'left' = seg.hand === 'left' ? 'left' : 'right';
        pushRoot(segStart, curX, curY, curZ, curYaw, 0);
        pushRoot(segEnd, curX, curY, curZ, curYaw, 0);
        const match = [...pendingGrabs].reverse().find((g) =>
          g.releaseTime === null && (seg.targetPropId ? g.targetPropId === seg.targetPropId : g.hand === handSide)
        );
        if (match) {
          match.releaseTime = Math.round(segEnd * 1000) / 1000;
          segExcludedKeepHands.add(match.hand);
          heldHands.delete(match.hand);
          emitHandFingers(segEnd, match.hand, false);
        } else {
          segExcludedKeepHands.add(handSide);
          heldHands.delete(handSide);
          emitHandFingers(segEnd, handSide, false);
        }
      } else if (seg.type === 'move') {
        const rawDist = Number(seg.distance) || 0;
        const dist = isReverse ? -Math.abs(rawDist) : rawDist;
        const dy = Number(seg.dy) || 0;
        const dYaw = Number(seg.angleDeg) || 0;
        const steps = Math.max(6, Math.min(28, Math.ceil(Math.max(Math.abs(dist), Math.abs(dYaw) / 25) * 1.5)));
        const { fwd } = getBasisAtYaw(curYaw);
        const startX = curX, startY = curY, startZ = curZ, startYaw = curYaw;
        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const t = i === steps ? segEnd : segStart + f * segDur;
          pushRoot(t, startX + fwd.x * dist * f, startY + dy * f, startZ + fwd.z * dist * f, startYaw + dYaw * f, 0);
        }
        curX = startX + fwd.x * dist;
        curY = startY + dy;
        curZ = startZ + fwd.z * dist;
        curYaw = startYaw + dYaw;
      } else if (seg.type === 'turn') {
        const angle = Number(seg.angleDeg) || 0;
        const steps = Math.max(2, Math.min(24, Math.ceil(Math.abs(angle) / 30)));
        const startYaw = curYaw;
        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const t = i === steps ? segEnd : segStart + f * segDur;
          pushRoot(t, curX, curY, curZ, startYaw + angle * f, 0);
        }
        curYaw = startYaw + angle;
      } else if (seg.type === 'arc') {
        const radius = Math.max(0.5, Math.min(80, Math.abs(Number(seg.radius) || 5)));
        const rawSweep = Number(seg.sweepDeg);
        const sweepDeg = Number.isFinite(rawSweep) && Math.abs(rawSweep) > 0.5 ? rawSweep : -360;
        const side = sweepDeg >= 0 ? 1 : -1;
        const dirSign = isReverse ? -1 : 1;
        const absSweep = Math.abs(sweepDeg);
        const steps = Math.max(8, Math.min(48, Math.ceil(absSweep / 10)));
        const defaultLean = allowTurnLean
          ? (seg.leanDeg !== undefined ? Number(seg.leanDeg) : side * 9)
          : 0;
        const centerOnOrigin = seg.centerOnOrigin !== undefined
          ? !!seg.centerOnOrigin
          : (segments.length === 1 && absSweep >= 355);

        const { left: left0 } = getBasisAtYaw(curYaw);
        const cx = centerOnOrigin ? 0 : (curX + side * radius * left0.x);
        const cz = centerOnOrigin ? 0 : (curZ + side * radius * left0.z);
        const startYaw = curYaw;
        const startY = curY;
        const dy = Number(seg.dy) || 0;

        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const t = i === steps ? segEnd : segStart + f * segDur;
          const yaw = startYaw + dirSign * side * absSweep * f;
          const { left } = getBasisAtYaw(yaw);
          pushRoot(t, cx - side * radius * left.x, startY + dy * f, cz - side * radius * left.z, yaw, defaultLean);
        }
        curYaw = startYaw + dirSign * side * absSweep;
        const { left: leftEnd } = getBasisAtYaw(curYaw);
        curX = cx - side * radius * leftEnd.x;
        curZ = cz - side * radius * leftEnd.z;
        curY = startY + dy;
      } else if (seg.type === 'figure8') {
        const halfSpan = Math.max(1.5, Math.min(40, Math.abs(Number(seg.width) || 10) * 0.5));
        const steps = 48;
        const { fwd: f0, left: l0 } = getBasisAtYaw(curYaw);
        const startX = curX, startY = curY, startZ = curZ, startYaw = curYaw;
        const baseLeanAmp = allowTurnLean ? (seg.leanDeg !== undefined ? Math.abs(Number(seg.leanDeg)) : 10) : 0;
        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const th = f * Math.PI * 2;
          const localFwd = halfSpan * Math.sin(th);
          const localLeft = halfSpan * Math.sin(th) * Math.cos(th);
          const dFwd = halfSpan * Math.cos(th);
          const dLeft = halfSpan * (Math.cos(th) * Math.cos(th) - Math.sin(th) * Math.sin(th));
          const x = startX + f0.x * localFwd + l0.x * localLeft;
          const z = startZ + f0.z * localFwd + l0.z * localLeft;
          const vx = f0.x * dFwd + l0.x * dLeft;
          const vz = f0.z * dFwd + l0.z * dLeft;
          const yaw = forwardAxis === '+x'
            ? (Math.atan2(-vz, vx) * 180) / Math.PI
            : (Math.atan2(vx, vz) * 180) / Math.PI;
          pushRoot(i === steps ? segEnd : segStart + f * segDur, x, startY, z, yaw, Math.sin(th) * baseLeanAmp);
        }
        curX = startX;
        curZ = startZ;
        curYaw = startYaw;
      } else if (seg.type === 'waypoints' && Array.isArray(seg.points) && seg.points.length > 0) {
        const isRel = seg.relative !== false;
        const { fwd: f0, left: l0 } = getBasisAtYaw(curYaw);
        const pts: Array<{ x: number; y: number; z: number }> = [{ x: curX, y: curY, z: curZ }];
        for (const p of seg.points) {
          const px = Number(p?.x) || 0;
          const py = Number(p?.y) || 0;
          const pz = Number(p?.z) || 0;
          if (isRel) {
            pts.push({
              x: curX + f0.x * pz + l0.x * px,
              y: curY + py,
              z: curZ + f0.z * pz + l0.z * px
            });
          } else {
            pts.push({ x: px, y: py, z: pz });
          }
        }
        const legLens: number[] = [];
        let totLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z);
          legLens.push(d);
          totLen += d;
        }
        const faceVel = seg.faceVelocity !== false;
        let accT = segStart;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const len = legLens[i];
          const legDur = totLen > 1e-4 ? (segDur * (len / totLen)) : (segDur / Math.max(1, pts.length - 1));
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          let targetYaw = curYaw;
          if (faceVel && Math.hypot(dx, dz) > 0.02) {
            const tx = isReverse ? -dx : dx;
            const tz = isReverse ? -dz : dz;
            targetYaw = forwardAxis === '+x'
              ? (Math.atan2(-tz, tx) * 180) / Math.PI
              : (Math.atan2(tx, tz) * 180) / Math.PI;
          }
          let dYaw = targetYaw - curYaw;
          while (dYaw > 180) dYaw -= 360;
          while (dYaw < -180) dYaw += 360;
          const turnFrac = Math.abs(dYaw) > 35 ? Math.min(0.22, (Math.abs(dYaw) / 180) * 0.22) : 0;
          const turnDur = legDur * turnFrac;
          const walkDur = legDur - turnDur;
          if (turnDur > 0.05) {
            const tSteps = Math.max(2, Math.ceil(Math.abs(dYaw) / 30));
            for (let k = 0; k <= tSteps; k++) {
              pushRoot(accT + (k / tSteps) * turnDur, a.x, a.y, a.z, curYaw + (k / tSteps) * dYaw, 0);
            }
          }
          curYaw += dYaw;
          const moveSteps = Math.max(4, Math.min(18, Math.ceil(len * 1.5)));
          for (let k = 0; k <= moveSteps; k++) {
            const f = k / moveSteps;
            const t = (i === pts.length - 2 && k === moveSteps) ? segEnd : (accT + turnDur + f * walkDur);
            pushRoot(t, a.x + dx * f, a.y + (b.y - a.y) * f, a.z + dz * f, curYaw, 0);
          }
          accT += legDur;
        }
        const lastPt = pts[pts.length - 1];
        curX = lastPt.x;
        curY = lastPt.y;
        curZ = lastPt.z;
      } else {
        pushRoot(segStart, curX, curY, curZ, curYaw, 0);
        pushRoot(segEnd, curX, curY, curZ, curYaw, 0);
      }

      // Xác định trước chế độ gait / clip Video mẫu của đoạn này để bảo vệ nguyên vẹn mocap thật từ video mẫu
      const gaitRaw = String(seg.gait || 'auto').toLowerCase();
      const isSpatialMove = seg.type === 'move' || seg.type === 'arc' || seg.type === 'figure8' || seg.type === 'waypoints' || segIsApproachMove;
      const isTurnSeg = seg.type === 'turn';
      const isIkPoseSeg = seg.type === 'reach_and_grab' || seg.type === 'reach_pose' || seg.type === 'release';
      const willPlayGaitClip = isHumanoid && (
        ((isSpatialMove || isTurnSeg) && gaitRaw !== 'none' && gaitRaw !== 'idle') ||
        ((seg.type === 'pose' || seg.type === 'wait') && (gaitRaw === 'embedded' || gaitRaw === 'walk' || gaitRaw === 'run' || !!seg.clipName))
      );
      const gaitModeForSeg: 'walk' | 'run' | 'embedded' =
        gaitRaw === 'run'
          ? 'run'
          : (gaitRaw === 'embedded' || ((seg.type === 'pose' || seg.type === 'wait') && gaitRaw !== 'walk') ? 'embedded' : 'walk');
      const segResolvedClip = willPlayGaitClip && !isTurnSeg
        ? getEmbeddedClipRest(seg.clipName, gaitModeForSeg)
        : null;
      const isVideoGaitSeg = isVideoReferenceClip(segResolvedClip);
      const segVideoBoneKeys = new Set<string>();
      if (isVideoGaitSeg && segResolvedClip) {
        for (const bk of segResolvedClip.keyframes) {
          if (bk?.boneName && bk.boneName !== '__root__') {
            segVideoBoneKeys.add(normBoneKey(bk.boneName));
          }
        }
      }

      // Phân tích các xương AI xuất trong seg.keyframes để phân biệt cử chỉ động (vẫy tay...) với pose tĩnh bịa đè lên video mẫu
      const segKfMaxDeltaByBone = new Map<string, number>();
      if (Array.isArray(seg.keyframes) && seg.keyframes.length > 0) {
        const firstRotByBone = new Map<string, { x: number; y: number; z: number }>();
        for (const bk of seg.keyframes) {
          if (!bk || !bk.boneName || bk.boneName === '__root__') continue;
          const bKey = normBoneKey(bk.boneName);
          const rx = Number(bk.rot?.x) || 0;
          const ry = Number(bk.rot?.y) || 0;
          const rz = Number(bk.rot?.z) || 0;
          const f = firstRotByBone.get(bKey);
          if (!f) {
            firstRotByBone.set(bKey, { x: rx, y: ry, z: rz });
            segKfMaxDeltaByBone.set(bKey, 0);
          } else {
            const d = Math.max(Math.abs(rx - f.x), Math.abs(ry - f.y), Math.abs(rz - f.z));
            if (d > (segKfMaxDeltaByBone.get(bKey) || 0)) {
              segKfMaxDeltaByBone.set(bKey, d);
            }
          }
        }
      }
      const isStaticInSegKf = (bKey: string): boolean => (segKfMaxDeltaByBone.get(bKey) || 0) < 12;

      // Tập hợp các xương đang do IK hoặc tay cầm đồ kiểm soát -> KHÔNG bao giờ bị keepFromClip ghi đè
      const ikOrHeldBoneKeys = new Set<string>();
      if (isHumanoid && anat) {
        const excludedHands = new Set<'right' | 'left'>([
          ...Array.from(segExcludedKeepHands),
          ...Array.from(heldHands.keys())
        ]);
        excludedHands.forEach((hSide) => {
          collectHandBoneKeys(hSide).forEach((k) => ikOrHeldBoneKeys.add(k));
          for (const fn of fingerBonesByHand[hSide]) ikOrHeldBoneKeys.add(normBoneKey(fn));
        });
      }

      // Tính danh sách xương giữ nguyên tư thế mocap thật từ Video mẫu (`keepFromClip` hoặc tự động bảo toàn tay đối diện sau khi chạy video mẫu)
      const keptClipBoneKeys = new Set<string>();
      if (isHumanoid && anat && lastMocapBonePose.size > 0) {
        if (seg.keepFromClip !== undefined) {
          resolveKeepFromClipKeys(seg.keepFromClip).forEach((k) => {
            if (!ikOrHeldBoneKeys.has(k)) keptClipBoneKeys.add(k);
          });
        } else if (
          usedVideoRefClip &&
          seg.overrideVideoBones !== true &&
          !segResolvedClip &&
          (seg.type === 'reach_and_grab' || seg.type === 'reach_pose' || seg.type === 'wait' || seg.type === 'release')
        ) {
          (['left', 'right'] as const).forEach((hSide) => {
            if (segExcludedKeepHands.has(hSide) || heldHands.has(hSide)) return;
            const sideKeys = collectHandBoneKeys(hSide);
            // Nếu AI tự diễn hoạt cử chỉ động rõ ràng (vd vẫy tay, delta >= 12 độ) trên tay đối diện thì tôn trọng AI;
            // ngược lại giữ nguyên tư thế mocap thật của tay đối diện từ video mẫu (tránh bật về A-pose hoặc góc Euler bịa)
            let hasDynamicAiOnSide = false;
            sideKeys.forEach((k) => {
              if (segKfMaxDeltaByBone.has(k) && !isStaticInSegKf(k)) hasDynamicAiOnSide = true;
            });
            if (!hasDynamicAiOnSide) {
              sideKeys.forEach((k) => {
                if (lastMocapBonePose.has(k) && !ikOrHeldBoneKeys.has(k)) keptClipBoneKeys.add(k);
              });
            }
          });
        }
      }

      if (Array.isArray(seg.keyframes) && seg.keyframes.length > 0) {
        const maxLocalT = Math.max(...seg.keyframes.map((k) => Number(k?.time) || 0));
        const timeRatio = maxLocalT > segDur + 0.05 ? (segDur / maxLocalT) : 1.0;
        const headKey = anat ? normBoneKey(anat.head) : '';
        const neckKey = anat ? normBoneKey(anat.neck) : '';
        for (const bk of seg.keyframes) {
          if (!bk || !bk.boneName || bk.boneName === '__root__') continue;
          const bKey = normBoneKey(bk.boneName);
          // 1. Nếu xương này được bảo toàn từ Video mẫu (keepFromClip / tay đối diện giữ nguyên) -> bỏ qua góc Euler AI bịa
          if (keptClipBoneKeys.has(bKey)) continue;
          // 2. Nếu đoạn đang chạy chính clip Video mẫu (approach/move/waypoints/arc) và AI KHÔNG đặt overrideVideoBones:true,
          //    bảo vệ toàn bộ xương có sẵn trong video khỏi pose tĩnh bịa (chỉ cho phép xoay đầu/cổ hoặc cử chỉ động thật)
          if (
            isVideoGaitSeg &&
            seg.overrideVideoBones !== true &&
            segVideoBoneKeys.has(bKey) &&
            bKey !== headKey &&
            bKey !== neckKey &&
            isStaticInSegKf(bKey)
          ) {
            continue;
          }
          segCustomBones.add(bKey);
          const localT = Math.max(0, (Number(bk.time) || 0) * timeRatio);
          const rotVal = {
            x: Number(bk.rot?.x) || 0,
            y: Number(bk.rot?.y) || 0,
            z: Number(bk.rot?.z) || 0
          };
          heldHands.forEach((held) => {
            if (normBoneKey(held.handName) === bKey) {
              held.handRot = { ...rotVal };
            }
          });
          pushKfSafe(
            segStart + localT,
            bk.boneName,
            rotVal,
            {
              x: Number(bk.pos?.x) || 0,
              y: Number(bk.pos?.y) || 0,
              z: Number(bk.pos?.z) || 0
            },
            10
          );
        }
      }

      // Xuất keyframe giữ nguyên tư thế mocap thật từ Video mẫu cho các xương trong keptClipBoneKeys (khi đoạn không phát clip mocap sống)
      if (isHumanoid && keptClipBoneKeys.size > 0 && !segResolvedClip) {
        keptClipBoneKeys.forEach((bKey) => {
          if (segCustomBones.has(bKey)) return;
          const pose = lastMocapBonePose.get(bKey);
          if (!pose) return;
          segCustomBones.add(bKey);
          pushKfSafe(segStart, pose.boneName, pose.rot, pose.pos, 10);
          pushKfSafe(segEnd, pose.boneName, pose.rot, pose.pos, 10);
        });
      }

      // Tự động bảo vệ cánh tay & ngón tay đang cầm đồ vật xuyên suốt các chặng đi/quay/chờ tiếp theo
      if (isHumanoid && heldHands.size > 0) {
        heldHands.forEach((held, hSide) => {
          if (segHandledIkHands.has(hSide)) return;
          const armKey = normBoneKey(held.armName);
          const foreKey = normBoneKey(held.foreArmName);
          const handKey = normBoneKey(held.handName);
          const aiOverrodeArm = segCustomBones.has(armKey) || segCustomBones.has(foreKey);
          for (const fn of fingerBonesByHand[hSide]) segCustomBones.add(normBoneKey(fn));
          emitHandFingers(segEnd, hSide, 1.0, held.gripStyle);
          if (!aiOverrodeArm) {
            segCustomBones.add(armKey);
            segCustomBones.add(foreKey);
            pushKfSafe(segStart, held.armName, held.armRot, { x: 0, y: 0, z: 0 }, 10);
            pushKfSafe(segStart, held.foreArmName, held.foreRot, { x: 0, y: 0, z: 0 }, 10);
            pushKfSafe(segEnd, held.armName, held.armRot, { x: 0, y: 0, z: 0 }, 10);
            pushKfSafe(segEnd, held.foreArmName, held.foreRot, { x: 0, y: 0, z: 0 }, 10);
            if (!segCustomBones.has(handKey)) {
              segCustomBones.add(handKey);
              pushKfSafe(segStart, held.handName, held.handRot, { x: 0, y: 0, z: 0 }, 10);
              pushKfSafe(segEnd, held.handName, held.handRot, { x: 0, y: 0, z: 0 }, 10);
            }
          }
        });
      }

      if (isHumanoid) {
        if (isSpatialMove && gaitRaw !== 'none' && gaitRaw !== 'idle') {
          const mode: 'walk' | 'run' | 'embedded' =
            gaitRaw === 'run' ? 'run' : (gaitRaw === 'embedded' ? 'embedded' : 'walk');
          emitHumanoidGaitWindow(segStart, segEnd, mode, seg.clipName, false, segCustomBones);
        } else if (isTurnSeg && gaitRaw !== 'none' && gaitRaw !== 'idle') {
          const mode: 'walk' | 'run' | 'embedded' =
            gaitRaw === 'run' ? 'run' : (gaitRaw === 'embedded' ? 'embedded' : 'walk');
          emitHumanoidGaitWindow(segStart, segEnd, mode, seg.clipName, true, segCustomBones);
        } else if ((seg.type === 'pose' || seg.type === 'wait') && (gaitRaw === 'embedded' || gaitRaw === 'walk' || gaitRaw === 'run' || !!seg.clipName)) {
          const mode: 'walk' | 'run' | 'embedded' =
            gaitRaw === 'run' ? 'run' : (gaitRaw === 'walk' ? 'walk' : 'embedded');
          emitHumanoidGaitWindow(segStart, segEnd, mode, seg.clipName, false, segCustomBones);
        } else if (isIkPoseSeg) {
          emitNeutralRestBones(segEnd, segCustomBones);
        } else {
          const pad = Math.min(0.14, segDur * 0.15);
          emitNeutralRestBones(segStart + pad, segCustomBones);
          if (segEnd - segStart > pad * 2.5) {
            emitNeutralRestBones(segEnd - pad, segCustomBones);
          }
        }
      }

      curT = segEnd;
    }

    if (Array.isArray(plan.keyframes) && plan.keyframes.length > 0) {
      for (const bk of plan.keyframes) {
        if (!bk || !bk.boneName || bk.boneName === '__root__') continue;
        pushKfSafe(
          Number(bk.time) || 0,
          bk.boneName,
          {
            x: Number(bk.rot?.x) || 0,
            y: Number(bk.rot?.y) || 0,
            z: Number(bk.rot?.z) || 0
          },
          {
            x: Number(bk.pos?.x) || 0,
            y: Number(bk.pos?.y) || 0,
            z: Number(bk.pos?.z) || 0
          },
          10
        );
      }
    }

    const applied = this.applyGeneratedBoneTimeline(propId, {
      duration: totalDur,
      loop: pendingGrabs.length > 0 ? (plan.loop === true) : (plan.loop !== false),
      speed: plan.speed,
      poseSpace: 'rest',
      keyframes: kfs
    });
    if (applied > 0) {
      // Hoàn tất ràng buộc handGrabs trực tiếp trên bộ keyframe cuối cùng -> áp sát món đồ khít lòng bàn tay & căn hướng tự nhiên
      if (pendingGrabs.length > 0 && anat) {
        rig.timeline.handGrabs = [];
        const finalized: GlbPropGrabConstraint[] = [];
        for (const pg of pendingGrabs) {
          const handBoneName = pg.hand === 'left' ? anat.lHand : anat.rHand;
          const handB = rig.bones.get(handBoneName);
          const targetWrapper = this._findPropWrapperEntity(pg.targetPropId);
          if (!handB?.node || !targetWrapper) continue;
          this.evaluatePropKeyframesAtTime(propId, pg.grabTime);
          const headNode = rig.bones.get(anat.head)?.node;
          const headPosW = headNode
            ? headNode.getPosition().clone()
            : new pc.Vec3(pg.restPos.x, actorFloorY + actorHeightW * 0.9, pg.restPos.z);
          const handAnat = handAnatomyBySide[pg.hand];
          const seated = this._computeSeatedHandGrabAttachment(
            handB.node,
            handAnat,
            targetWrapper,
            pg.restPos,
            pg.restRot,
            headPosW
          );
          const locOff = seated.locOff;
          const locRotQ = seated.locRotQ;
          finalized.push({
            id: pg.id,
            targetPropId: pg.targetPropId,
            hand: pg.hand,
            grabTime: pg.grabTime,
            releaseTime: pg.releaseTime,
            localOffset: {
              x: Math.round(locOff.x * 10000) / 10000,
              y: Math.round(locOff.y * 10000) / 10000,
              z: Math.round(locOff.z * 10000) / 10000
            },
            localRotOffset: {
              x: Math.round(locRotQ.x * 100000) / 100000,
              y: Math.round(locRotQ.y * 100000) / 100000,
              z: Math.round(locRotQ.z * 100000) / 100000,
              w: Math.round(locRotQ.w * 100000) / 100000
            },
            restWorldPos: {
              x: Math.round(pg.restPos.x * 1000) / 1000,
              y: Math.round(pg.restPos.y * 1000) / 1000,
              z: Math.round(pg.restPos.z * 1000) / 1000
            },
            restWorldRot: {
              x: Math.round(pg.restRot.x * 100) / 100,
              y: Math.round(pg.restRot.y * 100) / 100,
              z: Math.round(pg.restRot.z * 100) / 100
            }
          });
        }
        rig.timeline.handGrabs = finalized;
        // Ghi vị trí thả đồ chính xác nếu AI có đoạn release
        for (const fg of finalized) {
          if (typeof fg.releaseTime === 'number' && Number.isFinite(fg.releaseTime)) {
            this.evaluatePropKeyframesAtTime(propId, Math.max(fg.grabTime, fg.releaseTime - 0.002));
            const tw = this._findPropWrapperEntity(fg.targetPropId);
            if (tw) {
              const p = tw.getPosition();
              const e = tw.getEulerAngles();
              fg.releaseWorldPos = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 };
              fg.releaseWorldRot = { x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100, z: Math.round(e.z * 100) / 100 };
            }
          }
        }
        rig.currentTime = 0;
        this.evaluatePropKeyframesAtTime(propId, 0);
      }

      rig.timeline.lastAiSegments = JSON.parse(JSON.stringify(segments));
      if (plan.prompt && String(plan.prompt).trim()) {
        rig.timeline.lastAiPrompt = String(plan.prompt).trim();
      }
    }
    return applied;
  }

  // ============================================================================
  // TƯƠNG TÁC NHÂN VẬT ĐI TỚI & NẮM ĐỒ VẬT KHÁC TRONG CẢNH (2-BONE IK + HAND GRAB)
  // ============================================================================

  /** Tìm entity wrapper của bất kỳ đồ vật 3D nào trong cảnh (kể cả vật cứng không có xương) */
  private _findPropWrapperEntity(propId: string): pc.Entity | null {
    if (!propId) return null;
    const rig = this._propRigMap.get(propId);
    if (rig?.wrapper) return rig.wrapper;
    if (!this.app?.root) return null;
    const tagged = (this.app.root.findByTag('user_prop') as pc.Entity[]) || [];
    for (const ent of tagged) {
      if (!ent) continue;
      if (
        (ent as any)._propId === propId ||
        ent.name === propId ||
        ent.name === `prop_${propId}` ||
        ent.name === `user_prop_${propId}`
      ) {
        return ent;
      }
    }
    return null;
  }

  /** Đo bounding box hiển thị thực tế (world space) của 1 entity trong cảnh */
  private _getEntityVisualWorldBounds(ent: pc.Entity): {
    center: pc.Vec3;
    min: pc.Vec3;
    max: pc.Vec3;
    size: pc.Vec3;
  } {
    const min = new pc.Vec3(Infinity, Infinity, Infinity);
    const max = new pc.Vec3(-Infinity, -Infinity, -Infinity);
    let found = false;
    const comps: any[] = [
      ...((ent.findComponents('render') as any[]) || []),
      ...((ent.findComponents('model') as any[]) || [])
    ];
    for (const c of comps) {
      if (!c || c.enabled === false) continue;
      const mis: any[] = c.meshInstances || [];
      for (const mi of mis) {
        const aabb = mi?.aabb;
        if (!aabb) continue;
        const mn = aabb.getMin();
        const mx = aabb.getMax();
        if (!Number.isFinite(mn.x) || !Number.isFinite(mx.x)) continue;
        if (mn.x < min.x) min.x = mn.x;
        if (mn.y < min.y) min.y = mn.y;
        if (mn.z < min.z) min.z = mn.z;
        if (mx.x > max.x) max.x = mx.x;
        if (mx.y > max.y) max.y = mx.y;
        if (mx.z > max.z) max.z = mx.z;
        found = true;
      }
    }
    if (!found) {
      const p = ent.getPosition().clone();
      return {
        center: p.clone(),
        min: p.clone(),
        max: p.clone(),
        size: new pc.Vec3(0.2, 0.2, 0.2)
      };
    }
    const center = new pc.Vec3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
    const size = new pc.Vec3(
      Math.max(0.02, max.x - min.x),
      Math.max(0.02, max.y - min.y),
      Math.max(0.02, max.z - min.z)
    );
    return { center, min, max, size };
  }

  /**
   * Đo kích thước thực (world-scale, chưa xoay) và vector từ pivot tới tâm hình học của đồ vật trong hệ trục cục bộ (X, Y, Z)
   * mà không làm biến đổi transform của entity trong cảnh.
   */
  private _measurePropLocalBounds(ent: pc.Entity): {
    size: pc.Vec3;
    localPivotToCenter: pc.Vec3;
    dThin: number;
    dMid: number;
    dLong: number;
    axisThin: pc.Vec3;
    axisMid: pc.Vec3;
    axisLong: pc.Vec3;
  } {
    const wPos = ent.getPosition().clone();
    const invWQuat = ent.getRotation().clone().normalize().invert();
    const minL = new pc.Vec3(Infinity, Infinity, Infinity);
    const maxL = new pc.Vec3(-Infinity, -Infinity, -Infinity);
    let found = false;
    const tmpCorner = new pc.Vec3();
    const tmpWorld = new pc.Vec3();
    const tmpRel = new pc.Vec3();
    const tmpUnrot = new pc.Vec3();

    const comps: any[] = [
      ...((ent.findComponents('render') as any[]) || []),
      ...((ent.findComponents('model') as any[]) || [])
    ];
    for (const c of comps) {
      if (!c || c.enabled === false) continue;
      const mis: any[] = c.meshInstances || [];
      for (const mi of mis) {
        const meshAabb = mi?.mesh?.aabb;
        const worldAabb = !meshAabb ? mi?.aabb : null;
        const srcAabb = meshAabb || worldAabb;
        if (!srcAabb) continue;
        const mn = srcAabb.getMin();
        const mx = srcAabb.getMax();
        if (!Number.isFinite(mn.x) || !Number.isFinite(mx.x)) continue;
        const wt = meshAabb && mi?.node ? mi.node.getWorldTransform() : null;
        for (let ix = 0; ix < 2; ix++) {
          for (let iy = 0; iy < 2; iy++) {
            for (let iz = 0; iz < 2; iz++) {
              tmpCorner.set(ix ? mx.x : mn.x, iy ? mx.y : mn.y, iz ? mx.z : mn.z);
              if (wt) {
                wt.transformPoint(tmpCorner, tmpWorld);
              } else {
                tmpWorld.copy(tmpCorner);
              }
              tmpRel.sub2(tmpWorld, wPos);
              invWQuat.transformVector(tmpRel, tmpUnrot);
              if (tmpUnrot.x < minL.x) minL.x = tmpUnrot.x;
              if (tmpUnrot.y < minL.y) minL.y = tmpUnrot.y;
              if (tmpUnrot.z < minL.z) minL.z = tmpUnrot.z;
              if (tmpUnrot.x > maxL.x) maxL.x = tmpUnrot.x;
              if (tmpUnrot.y > maxL.y) maxL.y = tmpUnrot.y;
              if (tmpUnrot.z > maxL.z) maxL.z = tmpUnrot.z;
              found = true;
            }
          }
        }
      }
    }

    const size = found
      ? new pc.Vec3(
          Math.max(0.01, maxL.x - minL.x),
          Math.max(0.01, maxL.y - minL.y),
          Math.max(0.01, maxL.z - minL.z)
        )
      : new pc.Vec3(0.2, 0.2, 0.2);
    const localPivotToCenter = found
      ? new pc.Vec3((minL.x + maxL.x) * 0.5, (minL.y + maxL.y) * 0.5, (minL.z + maxL.z) * 0.5)
      : new pc.Vec3(0, 0, 0);

    const axes = [
      { dim: size.x, vec: new pc.Vec3(1, 0, 0) },
      { dim: size.y, vec: new pc.Vec3(0, 1, 0) },
      { dim: size.z, vec: new pc.Vec3(0, 0, 1) }
    ].sort((a, b) => a.dim - b.dim);

    return {
      size,
      localPivotToCenter,
      dThin: axes[0].dim,
      dMid: axes[1].dim,
      dLong: axes[2].dim,
      axisThin: axes[0].vec,
      axisMid: axes[1].vec,
      axisLong: axes[2].vec
    };
  }

  /** Phân loại dáng cầm thích ứng theo tỷ lệ hình học thực tế của đồ vật so với kích thước bàn tay */
  private _classifyPropGripStyle(
    metrics: { dThin: number; dMid: number; dLong: number },
    handLengthW: number
  ): 'flat' | 'cylinder' | 'wide' {
    const safeHand = Math.max(0.05, handLengthW);
    if (metrics.dThin < metrics.dMid * 0.56) return 'flat';
    if (metrics.dThin > safeHand * 0.55) return 'wide';
    return 'cylinder';
  }

  /**
   * Phân tích trực tiếp giải phẫu 3D của bàn tay ở tư thế nghỉ gốc (bất kể MakeHuman, Mixamo, Unreal, Blender, A-Pose hay T-Pose):
   * - Đo hệ trục trực chuẩn bàn tay (hướng ngón tay, hướng ngón cái, pháp tuyến lòng bàn tay) & tâm lòng bàn tay thật.
   * - Tính chính xác trục gập `curlAxisC` cho từng đốt ngón tay (1..5, đốt 1..3) để gập +angle luôn ôm vào lòng bàn tay.
   */
  private _analyzeRigHandAnatomy(
    rig: any,
    anat: ReturnType<SontinhSceneService['_resolveRigAnatomy']>,
    handSide: 'right' | 'left',
    actorHeightW: number,
    baseFwd: pc.Vec3
  ): {
    handSide: 'right' | 'left';
    handName: string;
    foreArmName: string;
    localFwd: pc.Vec3;
    localThumb: pc.Vec3;
    localPalm: pc.Vec3;
    localPalmOffset: pc.Vec3;
    handLengthW: number;
    palmWidthW: number;
    fingers: Array<{
      boneName: string;
      fingerIdx: 1 | 2 | 3 | 4 | 5;
      phalanxIdx: 1 | 2 | 3;
      curlAxisC: pc.Vec3;
    }>;
  } | null {
    const handName = handSide === 'left' ? anat.lHand : anat.rHand;
    const foreArmName = handSide === 'left' ? anat.lForeArm : anat.rForeArm;
    const handB = rig?.bones?.get(handName);
    const foreB = rig?.bones?.get(foreArmName);
    if (!handB?.node || !foreB?.node) return null;

    const isDescendantOf = (node: pc.GraphNode | null | undefined, ancestor: pc.GraphNode): boolean => {
      let cur = node?.parent;
      let guard = 0;
      while (cur && guard++ < 24) {
        if (cur === ancestor) return true;
        cur = cur.parent;
      }
      return false;
    };

    const sideRe = handSide === 'left'
      ? /(?:[._-]l$|^left|left[._-]?|l[._-](?:thumb|index|middle|ring|pinky|finger))/i
      : /(?:[._-]r$|^right|right[._-]?|r[._-](?:thumb|index|middle|ring|pinky|finger))/i;

    const classifyFingerIdx = (label: string): (1 | 2 | 3 | 4 | 5) | null => {
      if (/thumb|finger1|f_?thumb/i.test(label)) return 1;
      if (/index|finger2|point/i.test(label)) return 2;
      if (/middle|finger3|mid/i.test(label)) return 3;
      if (/ring|finger4/i.test(label)) return 4;
      if (/pinky|little|finger5/i.test(label)) return 5;
      return null;
    };

    const rawByFinger = new Map<1 | 2 | 3 | 4 | 5, Array<{ bone: any; depth: number }>>();
    rig.bones.forEach((b: any) => {
      if (!b?.isSkinnedBone || !b?.node || b.name === '__root__' || b.name === handName) return;
      if (/metacarpal|carpal|palm|hand_?end|tip_?end/i.test(b.label || b.name)) return;
      const inHandTree = isDescendantOf(b.node, handB.node);
      if (!inHandTree && !sideRe.test(b.label || b.name)) return;
      if (!inHandTree && !/(finger|thumb|index|middle|ring|pinky|little)/i.test(b.label || b.name)) return;
      const fIdx = classifyFingerIdx(b.label || b.name);
      if (!fIdx) return;
      let depth = 0;
      let cur = b.node.parent;
      let g = 0;
      while (cur && cur !== handB.node && g++ < 20) {
        depth++;
        cur = cur.parent;
      }
      if (!rawByFinger.has(fIdx)) rawByFinger.set(fIdx, []);
      rawByFinger.get(fIdx)!.push({ bone: b, depth });
    });

    rawByFinger.forEach((arr) => arr.sort((a, b) => a.depth - b.depth || a.bone.name.localeCompare(b.bone.name)));

    const wristPosW = handB.node.getPosition().clone();
    const forePosW = foreB.node.getPosition().clone();
    const getProxPos = (fIdx: 1 | 2 | 3 | 4 | 5): pc.Vec3 | null => {
      const arr = rawByFinger.get(fIdx);
      return arr && arr.length > 0 ? arr[0].bone.node.getPosition().clone() : null;
    };
    const pThumb = getProxPos(1);
    const pIndex = getProxPos(2);
    const pMiddle = getProxPos(3);
    const pRing = getProxPos(4);
    const pPinky = getProxPos(5);

    const centralKnuckles = [pIndex, pMiddle, pRing].filter((p): p is pc.Vec3 => !!p);
    let knuckleCenterW: pc.Vec3;
    if (centralKnuckles.length > 0) {
      knuckleCenterW = new pc.Vec3();
      for (const kp of centralKnuckles) knuckleCenterW.add(kp);
      knuckleCenterW.mulScalar(1 / centralKnuckles.length);
    } else {
      const foreDir = new pc.Vec3().sub2(wristPosW, forePosW);
      if (foreDir.lengthSq() < 1e-6) foreDir.set(handSide === 'left' ? 1 : -1, -0.5, 0);
      foreDir.normalize();
      knuckleCenterW = wristPosW.clone().add(foreDir.mulScalar(actorHeightW * 0.05));
    }

    const uFwdW = new pc.Vec3().sub2(knuckleCenterW, wristPosW);
    if (uFwdW.lengthSq() < 1e-6) uFwdW.sub2(wristPosW, forePosW);
    if (uFwdW.lengthSq() < 1e-6) uFwdW.set(handSide === 'left' ? 1 : -1, 0, 0);
    uFwdW.normalize();

    const rootQ0 = rig.glbEntity.getRotation().clone().normalize();
    const invRootQ0 = rootQ0.clone().invert();
    const baseFwdW = rootQ0.transformVector(baseFwd, new pc.Vec3()).normalize();

    let rawThumbW = new pc.Vec3();
    if (pIndex && pPinky) {
      rawThumbW.sub2(pIndex, pPinky);
    } else if (pIndex && pRing) {
      rawThumbW.sub2(pIndex, pRing);
    } else if (pThumb && pMiddle) {
      rawThumbW.sub2(pThumb, pMiddle);
    } else {
      rawThumbW.copy(baseFwdW);
    }
    rawThumbW.sub(uFwdW.clone().mulScalar(rawThumbW.dot(uFwdW)));
    if (rawThumbW.lengthSq() < 1e-6) {
      rawThumbW.copy(baseFwdW).sub(uFwdW.clone().mulScalar(baseFwdW.dot(uFwdW)));
      if (rawThumbW.lengthSq() < 1e-6) rawThumbW.set(0, 0, 1);
    }
    const uThumbW = rawThumbW.normalize();
    if (pThumb) {
      const toThumb = new pc.Vec3().sub2(pThumb, knuckleCenterW);
      if (uThumbW.dot(toThumb) < 0) uThumbW.mulScalar(-1);
    }

    // Chuẩn giải phẫu bất biến cho mọi tư thế nghỉ (A-Pose / T-Pose / lòng bàn tay úp hay ngửa):
    // Tay trái: uFwd × uThumb = uPalm; Tay phải: uThumb × uFwd = uPalm
    const uPalmW = handSide === 'left'
      ? new pc.Vec3().cross(uFwdW, uThumbW).normalize()
      : new pc.Vec3().cross(uThumbW, uFwdW).normalize();
    const uThumbOrthoW = handSide === 'left'
      ? new pc.Vec3().cross(uPalmW, uFwdW).normalize()
      : new pc.Vec3().cross(uFwdW, uPalmW).normalize();

    const wristToKnuckleW = Math.max(actorHeightW * 0.035, Math.min(actorHeightW * 0.075, knuckleCenterW.distance(wristPosW)));
    let maxFingerDistW = wristToKnuckleW * 1.95;
    rawByFinger.forEach((arr, fIdx) => {
      if (fIdx === 1) return;
      for (const item of arr) {
        const d = item.bone.node.getPosition().distance(wristPosW);
        if (d > maxFingerDistW) maxFingerDistW = d;
      }
    });
    const handLengthW = Math.max(actorHeightW * 0.085, Math.min(actorHeightW * 0.145, maxFingerDistW * 1.12));
    const palmWidthW = (pIndex && pPinky)
      ? Math.max(actorHeightW * 0.036, Math.min(actorHeightW * 0.072, pIndex.distance(pPinky) * 1.25))
      : handLengthW * 0.46;

    // Tâm bề mặt da lòng bàn tay: nằm giữa cổ tay & khớp gốc ngón tay, dịch nhẹ ra mặt lòng bàn tay
    const palmCenterOffsetW = uFwdW.clone().mulScalar(wristToKnuckleW * 0.74)
      .add(uPalmW.clone().mulScalar(handLengthW * 0.105));

    const handRestWorldQ = handB.node.getRotation().clone().normalize();
    const invHandRestQ = handRestWorldQ.clone().invert();
    const localFwd = invHandRestQ.transformVector(uFwdW, new pc.Vec3()).normalize();
    const localThumb = invHandRestQ.transformVector(uThumbOrthoW, new pc.Vec3()).normalize();
    const localPalm = invHandRestQ.transformVector(uPalmW, new pc.Vec3()).normalize();
    const localPalmOffset = invHandRestQ.transformVector(palmCenterOffsetW, new pc.Vec3());

    const uFwdC = invRootQ0.transformVector(uFwdW, new pc.Vec3()).normalize();
    const uThumbC = invRootQ0.transformVector(uThumbOrthoW, new pc.Vec3()).normalize();
    const uPalmC = invRootQ0.transformVector(uPalmW, new pc.Vec3()).normalize();

    const fingers: Array<{
      boneName: string;
      fingerIdx: 1 | 2 | 3 | 4 | 5;
      phalanxIdx: 1 | 2 | 3;
      curlAxisC: pc.Vec3;
    }> = [];

    rawByFinger.forEach((arr, fIdx) => {
      let prevDirC = uFwdC.clone();
      for (let idx = 0; idx < arr.length; idx++) {
        const b = arr[idx].bone;
        const phalanxIdx = Math.min(3, idx + 1) as 1 | 2 | 3;
        const pCurW = b.node.getPosition();
        let dirW: pc.Vec3 | null = null;
        if (idx + 1 < arr.length) {
          const d = new pc.Vec3().sub2(arr[idx + 1].bone.node.getPosition(), pCurW);
          if (d.lengthSq() > 1e-6) dirW = d.normalize();
        } else {
          const children: pc.GraphNode[] = (b.node.children as pc.GraphNode[]) || [];
          for (const ch of children) {
            const d = new pc.Vec3().sub2(ch.getPosition(), pCurW);
            if (d.lengthSq() > 1e-6) {
              dirW = d.normalize();
              break;
            }
          }
        }
        const vBoneC = dirW ? invRootQ0.transformVector(dirW, new pc.Vec3()).normalize() : prevDirC.clone();
        prevDirC = vBoneC;

        let curlAxisC: pc.Vec3;
        if (fIdx === 1) {
          // Ngón cái xoay đối xứng ngang qua lòng bàn tay để kẹp chắc đối diện 4 ngón còn lại
          const thumbTargetC = phalanxIdx === 1
            ? new pc.Vec3(
                uPalmC.x * 0.72 - uThumbC.x * 0.68 + uFwdC.x * 0.22,
                uPalmC.y * 0.72 - uThumbC.y * 0.68 + uFwdC.y * 0.22,
                uPalmC.z * 0.72 - uThumbC.z * 0.68 + uFwdC.z * 0.22
              ).normalize()
            : new pc.Vec3(
                uPalmC.x * 0.64 - uThumbC.x * 0.76,
                uPalmC.y * 0.64 - uThumbC.y * 0.76,
                uPalmC.z * 0.64 - uThumbC.z * 0.76
              ).normalize();
          curlAxisC = new pc.Vec3().cross(vBoneC, thumbTargetC);
          if (curlAxisC.lengthSq() < 1e-5) {
            curlAxisC = new pc.Vec3().cross(uFwdC, thumbTargetC);
          }
        } else {
          // 4 ngón trỏ/giữa/áp út/út: k = vBone × uPalm => xoay góc DƯƠNG luôn gập vào đúng lòng bàn tay!
          curlAxisC = new pc.Vec3().cross(vBoneC, uPalmC);
          if (curlAxisC.lengthSq() < 1e-5) {
            curlAxisC = handSide === 'left' ? uThumbC.clone().mulScalar(-1) : uThumbC.clone();
          }
        }
        curlAxisC.normalize();
        fingers.push({ boneName: b.name, fingerIdx: fIdx, phalanxIdx, curlAxisC });
      }
    });

    return {
      handSide,
      handName,
      foreArmName,
      localFwd,
      localThumb,
      localPalm,
      localPalmOffset,
      handLengthW,
      palmWidthW,
      fingers
    };
  }

  /** Tính chính xác góc gập từng đốt ngón tay theo giải phẫu thực tế & dáng món đồ ('flat' / 'cylinder' / 'wide') */
  private _computeAnatomicalFingerCurl(
    handAnat: NonNullable<ReturnType<SontinhSceneService['_analyzeRigHandAnatomy']>>,
    gripStyle: 'flat' | 'cylinder' | 'wide',
    closureFraction: number
  ): Array<{ boneName: string; rot: { x: number; y: number; z: number } }> {
    const closure = Math.max(0, Math.min(1, Number(closureFraction) || 0));
    const cascadeByFinger: Record<number, number> = { 1: 1.0, 2: 0.90, 3: 1.00, 4: 1.07, 5: 1.14 };
    const anglesByStyle = {
      flat: { finger: [28, 72, 46], thumb: [30, 22, 15] },
      cylinder: { finger: [56, 82, 54], thumb: [40, 30, 22] },
      wide: { finger: [26, 36, 24], thumb: [24, 18, 12] }
    }[gripStyle];

    const out: Array<{ boneName: string; rot: { x: number; y: number; z: number } }> = [];
    for (const f of handAnat.fingers) {
      if (closure <= 0.01) {
        out.push({ boneName: f.boneName, rot: { x: 0, y: 0, z: 0 } });
        continue;
      }
      const baseDeg = f.fingerIdx === 1
        ? anglesByStyle.thumb[Math.min(2, f.phalanxIdx - 1)]
        : anglesByStyle.finger[Math.min(2, f.phalanxIdx - 1)];
      const angleDeg = baseDeg * closure * (cascadeByFinger[f.fingerIdx] || 1);
      const q = new pc.Quat().setFromAxisAngle(f.curlAxisC, angleDeg);
      const e = q.getEulerAngles();
      out.push({
        boneName: f.boneName,
        rot: {
          x: Math.round((Number(e.x) || 0) * 10) / 10,
          y: Math.round((Number(e.y) || 0) * 10) / 10,
          z: Math.round((Number(e.z) || 0) * 10) / 10
        }
      });
    }
    return out;
  }

  /**
   * Giải góc xoay cổ tay (wrist) chuẩn giải phẫu ngay sau 2-Bone Arm IK:
   * - 'inspect': xoay ngửa lòng bàn tay hướng trực diện về phía mắt nhân vật (để xem điện thoại/đồ vật)
   * - 'grab': xoay lòng bàn tay úp/hướng vào món đồ khi vươn tay nắm
   * - 'carry': hướng lòng bàn tay tự nhiên vào phía thân người khi mang đồ
   */
  private _solveWristOrientation(
    propId: string,
    rig: any,
    handAnat: NonNullable<ReturnType<SontinhSceneService['_analyzeRigHandAnatomy']>>,
    mode: 'grab' | 'inspect' | 'carry' | 'neutral',
    ctx: { headPosW: pc.Vec3; sideWorld: pc.Vec3; heightRatio: number; actorHeightW: number }
  ): { x: number; y: number; z: number } {
    if (mode === 'neutral') return { x: 0, y: 0, z: 0 };
    const handB = rig?.bones?.get(handAnat.handName);
    const foreB = rig?.bones?.get(handAnat.foreArmName);
    if (!handB?.node || !foreB?.node) return { x: 0, y: 0, z: 0 };

    const handPosW = handB.node.getPosition().clone();
    const forePosW = foreB.node.getPosition().clone();
    const foreDirW = new pc.Vec3().sub2(handPosW, forePosW);
    if (foreDirW.lengthSq() < 1e-6) return { x: 0, y: 0, z: 0 };
    foreDirW.normalize();

    const curHandQ = handB.node.getRotation().clone().normalize();
    const parentQ = handB.node.parent ? handB.node.parent.getRotation().clone().normalize() : new pc.Quat();
    const worldUp = new pc.Vec3(0, 1, 0);

    let desFwdW = new pc.Vec3();
    let desThumbW = new pc.Vec3();
    let desPalmW = new pc.Vec3();

    if (mode === 'inspect') {
      desPalmW.sub2(ctx.headPosW, handPosW);
      desPalmW.y += ctx.actorHeightW * 0.06;
      if (desPalmW.lengthSq() < 1e-6) desPalmW.set(0, 0.3, -1);
      desPalmW.normalize();

      const idealThumb = worldUp.clone().sub(desPalmW.clone().mulScalar(worldUp.dot(desPalmW)));
      if (idealThumb.lengthSq() < 1e-5) idealThumb.set(0, 1, 0);
      idealThumb.normalize();

      const idealFwd = handAnat.handSide === 'left'
        ? new pc.Vec3().cross(idealThumb, desPalmW).normalize()
        : new pc.Vec3().cross(desPalmW, idealThumb).normalize();

      // Pha nhẹ hướng cẳng tay tự nhiên (35%) với hướng ngang ngực (65%) để cổ tay thoải mái không gập gắt
      const foreProj = foreDirW.clone().sub(desPalmW.clone().mulScalar(foreDirW.dot(desPalmW)));
      if (foreProj.lengthSq() > 1e-5) {
        foreProj.normalize();
        desFwdW.set(
          idealFwd.x * 0.68 + foreProj.x * 0.32,
          idealFwd.y * 0.68 + foreProj.y * 0.32,
          idealFwd.z * 0.68 + foreProj.z * 0.32
        );
        desFwdW.sub(desPalmW.clone().mulScalar(desFwdW.dot(desPalmW)));
      } else {
        desFwdW.copy(idealFwd);
      }
      if (desFwdW.lengthSq() < 1e-5) desFwdW.copy(idealFwd);
      desFwdW.normalize();

      desThumbW = handAnat.handSide === 'left'
        ? new pc.Vec3().cross(desPalmW, desFwdW).normalize()
        : new pc.Vec3().cross(desFwdW, desPalmW).normalize();
    } else if (mode === 'grab') {
      desFwdW.copy(foreDirW);
      const sw = ctx.sideWorld;
      const rawPalm = ctx.heightRatio < 0.45
        ? new pc.Vec3(-sw.x * 0.45, -0.88, -sw.z * 0.45)
        : new pc.Vec3(-sw.x * 0.88, -0.35, -sw.z * 0.88);
      rawPalm.sub(desFwdW.clone().mulScalar(rawPalm.dot(desFwdW)));
      if (rawPalm.lengthSq() < 1e-5) rawPalm.set(0, -1, 0).sub(desFwdW.clone().mulScalar(-desFwdW.y));
      if (rawPalm.lengthSq() < 1e-5) rawPalm.set(1, 0, 0);
      desPalmW.copy(rawPalm).normalize();
      desThumbW = handAnat.handSide === 'left'
        ? new pc.Vec3().cross(desPalmW, desFwdW).normalize()
        : new pc.Vec3().cross(desFwdW, desPalmW).normalize();
    } else {
      desFwdW.copy(foreDirW);
      const rawPalm = ctx.sideWorld.clone().mulScalar(-1);
      rawPalm.sub(desFwdW.clone().mulScalar(rawPalm.dot(desFwdW)));
      if (rawPalm.lengthSq() < 1e-5) rawPalm.set(0, -1, 0);
      desPalmW.copy(rawPalm).normalize();
      desThumbW = handAnat.handSide === 'left'
        ? new pc.Vec3().cross(desPalmW, desFwdW).normalize()
        : new pc.Vec3().cross(desFwdW, desPalmW).normalize();
    }

    // Dựng ma trận xoay R = M_des * transpose(M_local) đưa hệ trục bàn tay cục bộ khớp hệ trục mong muốn
    const [d0, d1, d2] = handAnat.handSide === 'left'
      ? [desFwdW, desThumbW, desPalmW]
      : [desThumbW, desFwdW, desPalmW];
    const [l0, l1, l2] = handAnat.handSide === 'left'
      ? [handAnat.localFwd, handAnat.localThumb, handAnat.localPalm]
      : [handAnat.localThumb, handAnat.localFwd, handAnat.localPalm];

    const mDes = new pc.Mat4();
    mDes.data[0] = d0.x; mDes.data[1] = d0.y; mDes.data[2] = d0.z; mDes.data[3] = 0;
    mDes.data[4] = d1.x; mDes.data[5] = d1.y; mDes.data[6] = d1.z; mDes.data[7] = 0;
    mDes.data[8] = d2.x; mDes.data[9] = d2.y; mDes.data[10] = d2.z; mDes.data[11] = 0;
    mDes.data[12] = 0;   mDes.data[13] = 0;   mDes.data[14] = 0;    mDes.data[15] = 1;

    const mLocT = new pc.Mat4();
    mLocT.data[0] = l0.x; mLocT.data[4] = l0.y; mLocT.data[8]  = l0.z; mLocT.data[12] = 0;
    mLocT.data[1] = l1.x; mLocT.data[5] = l1.y; mLocT.data[9]  = l1.z; mLocT.data[13] = 0;
    mLocT.data[2] = l2.x; mLocT.data[6] = l2.y; mLocT.data[10] = l2.z; mLocT.data[14] = 0;
    mLocT.data[3] = 0;    mLocT.data[7] = 0;    mLocT.data[11] = 0;    mLocT.data[15] = 1;

    const mRot = new pc.Mat4().mul2(mDes, mLocT);
    const qDesWorld = new pc.Quat().setFromMat4(mRot).normalize();

    // Giới hạn góc xoay cổ tay trong ngưỡng sinh học (~135° tối đa) tránh vặn cổ tay quá đà
    let dot = curHandQ.x * qDesWorld.x + curHandQ.y * qDesWorld.y + curHandQ.z * qDesWorld.z + curHandQ.w * qDesWorld.w;
    if (dot < 0) {
      qDesWorld.set(-qDesWorld.x, -qDesWorld.y, -qDesWorld.z, -qDesWorld.w);
      dot = -dot;
    }
    const angDeg = (2 * Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    const qFinalWorld = angDeg > 135
      ? new pc.Quat().slerp(curHandQ, qDesWorld, 135 / angDeg).normalize()
      : qDesWorld;

    const finalLocalQ = new pc.Quat().mul2(parentQ.clone().invert(), qFinalWorld).normalize();
    const qLocalDelta = new pc.Quat().mul2(handB.restQuat.clone().invert(), finalLocalQ).normalize();
    const qHandCharDelta = new pc.Quat()
      .mul2(new pc.Quat().mul2(handB.charRestQuat, qLocalDelta), handB.charRestQuat.clone().invert())
      .normalize();
    const eHand = qHandCharDelta.getEulerAngles();
    const handRot = {
      x: Math.round((Number(eHand.x) || 0) * 10) / 10,
      y: Math.round((Number(eHand.y) || 0) * 10) / 10,
      z: Math.round((Number(eHand.z) || 0) * 10) / 10
    };
    this.setBonePoseDelta(propId, handAnat.handName, handRot);
    return handRot;
  }

  /**
   * Tính toán điểm gắn & góc xoay áp sát đồ vật khít vào lòng bàn tay:
   * - Mặt sau/cạnh mỏng của đồ vật tiếp xúc trực tiếp bề mặt da lòng bàn tay (0 khoảng hở, không trôi lơ lửng)
   * - Chiều dài (đầu trên của điện thoại/chai/cốc) thẳng hàng hướng ngón cái; mặt màn hình/mặt trước hướng ra ngoài lòng bàn tay
   */
  private _computeSeatedHandGrabAttachment(
    handNode: pc.GraphNode,
    handAnat: ReturnType<SontinhSceneService['_analyzeRigHandAnatomy']>,
    targetWrapper: pc.Entity,
    restPos: pc.Vec3,
    restRot: pc.Vec3,
    headPosW: pc.Vec3
  ): { locOff: pc.Vec3; locRotQ: pc.Quat; gripStyle: 'flat' | 'cylinder' | 'wide' } {
    const handPos = handNode.getPosition().clone();
    const handQuat = handNode.getRotation().clone().normalize();
    const invHandQ = handQuat.clone().invert();
    const restQ = new pc.Quat().setFromEulerAngles(restRot.x, restRot.y, restRot.z).normalize();

    if (!handAnat) {
      const diffW = new pc.Vec3().sub2(restPos, handPos);
      return {
        locOff: invHandQ.transformVector(diffW, new pc.Vec3()),
        locRotQ: new pc.Quat().mul2(invHandQ, restQ).normalize(),
        gripStyle: 'cylinder'
      };
    }

    const metrics = this._measurePropLocalBounds(targetWrapper);
    const gripStyle = this._classifyPropGripStyle(metrics, handAnat.handLengthW);
    const isGraspable = metrics.dThin <= handAnat.handLengthW * 1.45 && metrics.dMid <= handAnat.handLengthW * 2.6;

    if (!isGraspable) {
      const diffW = new pc.Vec3().sub2(restPos, handPos);
      return {
        locOff: invHandQ.transformVector(diffW, new pc.Vec3()),
        locRotQ: new pc.Quat().mul2(invHandQ, restQ).normalize(),
        gripStyle
      };
    }

    // 1. Chọn chiều dương cho trục dài (hướng đầu trên -> hướng ngón cái) và trục mỏng (mặt trước/màn hình -> hướng ra khỏi lòng bàn tay)
    const eLong = metrics.axisLong.clone();
    const worldLong = restQ.transformVector(eLong, new pc.Vec3());
    if (worldLong.y < -0.15) eLong.mulScalar(-1);

    const eThin = metrics.axisThin.clone();
    const toEyes = new pc.Vec3().sub2(headPosW, restPos);
    if (toEyes.lengthSq() > 1e-6) toEyes.normalize();
    const preferFaceW = new pc.Vec3(toEyes.x * 0.65, toEyes.y * 0.65 + 0.75, toEyes.z * 0.65).normalize();
    const worldThin = restQ.transformVector(eThin, new pc.Vec3());
    if (worldThin.dot(preferFaceW) < 0) eThin.mulScalar(-1);

    const isLeft = handAnat.handSide === 'left';
    const eMid = isLeft
      ? new pc.Vec3().cross(eLong, eThin).normalize()
      : new pc.Vec3().cross(eThin, eLong).normalize();

    const [h0, h1, h2] = isLeft
      ? [handAnat.localFwd, handAnat.localThumb, handAnat.localPalm]
      : [handAnat.localThumb, handAnat.localFwd, handAnat.localPalm];
    const [p0, p1, p2] = isLeft
      ? [eMid, eLong, eThin]
      : [eLong, eMid, eThin];

    const mHand = new pc.Mat4();
    mHand.data[0] = h0.x; mHand.data[1] = h0.y; mHand.data[2] = h0.z; mHand.data[3] = 0;
    mHand.data[4] = h1.x; mHand.data[5] = h1.y; mHand.data[6] = h1.z; mHand.data[7] = 0;
    mHand.data[8] = h2.x; mHand.data[9] = h2.y; mHand.data[10] = h2.z; mHand.data[11] = 0;
    mHand.data[12] = 0;   mHand.data[13] = 0;   mHand.data[14] = 0;    mHand.data[15] = 1;

    const mPropT = new pc.Mat4();
    mPropT.data[0] = p0.x; mPropT.data[4] = p0.y; mPropT.data[8]  = p0.z; mPropT.data[12] = 0;
    mPropT.data[1] = p1.x; mPropT.data[5] = p1.y; mPropT.data[9]  = p1.z; mPropT.data[13] = 0;
    mPropT.data[2] = p2.x; mPropT.data[6] = p2.y; mPropT.data[10] = p2.z; mPropT.data[14] = 0;
    mPropT.data[3] = 0;    mPropT.data[7] = 0;    mPropT.data[11] = 0;    mPropT.data[15] = 1;

    const mRot = new pc.Mat4().mul2(mHand, mPropT);
    const locRotQ = new pc.Quat().setFromMat4(mRot).normalize();

    // 2. Đặt tâm hình học đồ vật nằm khít bề mặt da lòng bàn tay (dịch nửa bề dày theo pháp tuyến lòng bàn tay)
    const halfSeatDepth = Math.min(metrics.dThin * 0.5, handAnat.handLengthW * 0.42);
    const fwdNudge = gripStyle === 'flat' ? Math.min(metrics.dMid * 0.08, handAnat.handLengthW * 0.14) : 0;
    const targetCenterInHand = handAnat.localPalmOffset.clone()
      .add(handAnat.localPalm.clone().mulScalar(halfSeatDepth))
      .add(handAnat.localFwd.clone().mulScalar(fwdNudge));
    const rotatedPivotToCenter = locRotQ.transformVector(metrics.localPivotToCenter, new pc.Vec3());
    const locOff = new pc.Vec3().sub2(targetCenterInHand, rotatedPivotToCenter);

    return { locOff, locRotQ, gripStyle };
  }

  /** Đồng bộ vị trí/góc xoay của các đồ vật đang gắn vào tay nhân vật tại mốc thời gian timeSec */
  private _applyHandGrabsForRig(rig: any, timeSec: number): void {
    const grabs: GlbPropGrabConstraint[] = Array.isArray(rig?.timeline?.handGrabs) ? rig.timeline.handGrabs : [];
    if (grabs.length === 0) return;
    const anat = this._resolveRigAnatomy(rig);
    const tmpOff = new pc.Vec3();
    const tmpWorldOff = new pc.Vec3();
    const tmpRotOff = new pc.Quat();
    const tmpFinalQuat = new pc.Quat();
    const tmpRestQuat = new pc.Quat();
    const tmpBlendQuat = new pc.Quat();

    for (const g of grabs) {
      if (!g || !g.targetPropId) continue;
      const targetWrapper = this._findPropWrapperEntity(g.targetPropId);
      if (!targetWrapper || !targetWrapper.enabled) continue;

      if (timeSec + 1e-4 < g.grabTime) {
        if (g.restWorldPos) {
          targetWrapper.setPosition(g.restWorldPos.x, g.restWorldPos.y, g.restWorldPos.z);
        }
        if (g.restWorldRot) {
          targetWrapper.setEulerAngles(g.restWorldRot.x, g.restWorldRot.y, g.restWorldRot.z);
        }
        continue;
      }

      if (typeof g.releaseTime === 'number' && Number.isFinite(g.releaseTime) && timeSec >= g.releaseTime) {
        if (g.releaseWorldPos) {
          targetWrapper.setPosition(g.releaseWorldPos.x, g.releaseWorldPos.y, g.releaseWorldPos.z);
        }
        if (g.releaseWorldRot) {
          targetWrapper.setEulerAngles(g.releaseWorldRot.x, g.releaseWorldRot.y, g.releaseWorldRot.z);
        }
        continue;
      }

      const handBoneName = g.hand === 'left' ? anat.lHand : anat.rHand;
      const handBone = rig.bones.get(handBoneName);
      if (!handBone?.node) continue;

      const handPos = handBone.node.getPosition();
      const handQuat = handBone.node.getRotation().clone().normalize();
      tmpOff.set(g.localOffset?.x || 0, g.localOffset?.y || 0, g.localOffset?.z || 0);
      handQuat.transformVector(tmpOff, tmpWorldOff);
      const seatX = handPos.x + tmpWorldOff.x;
      const seatY = handPos.y + tmpWorldOff.y;
      const seatZ = handPos.z + tmpWorldOff.z;

      tmpRotOff.set(
        g.localRotOffset?.x || 0,
        g.localRotOffset?.y || 0,
        g.localRotOffset?.z || 0,
        g.localRotOffset?.w !== undefined ? g.localRotOffset.w : 1
      ).normalize();
      tmpFinalQuat.mul2(handQuat, tmpRotOff).normalize();

      // Pha mượt đồ vật từ vị trí đứng yên vào khít lòng bàn tay trong 0.16s đầu tiên sau grabTime (tránh giật đột ngột)
      const holdSpan = typeof g.releaseTime === 'number' && Number.isFinite(g.releaseTime)
        ? Math.max(0.05, g.releaseTime - g.grabTime)
        : 1.0;
      const seatBlendDur = Math.min(0.16, holdSpan * 0.4);
      const dtSinceGrab = timeSec - g.grabTime;
      if (dtSinceGrab < seatBlendDur && g.restWorldPos && g.restWorldRot) {
        const u = Math.max(0, Math.min(1, dtSinceGrab / Math.max(1e-4, seatBlendDur)));
        const s = u * u * (3 - 2 * u);
        targetWrapper.setPosition(
          g.restWorldPos.x + (seatX - g.restWorldPos.x) * s,
          g.restWorldPos.y + (seatY - g.restWorldPos.y) * s,
          g.restWorldPos.z + (seatZ - g.restWorldPos.z) * s
        );
        tmpRestQuat.setFromEulerAngles(g.restWorldRot.x, g.restWorldRot.y, g.restWorldRot.z).normalize();
        tmpBlendQuat.slerp(tmpRestQuat, tmpFinalQuat, s).normalize();
        targetWrapper.setRotation(tmpBlendQuat);
      } else {
        targetWrapper.setPosition(seatX, seatY, seatZ);
        targetWrapper.setRotation(tmpFinalQuat);
      }
    }
  }

  /** Gỡ toàn bộ ràng buộc nắm đồ vật của 1 nhân vật và trả đồ vật về vị trí ban đầu */
  clearPropHandGrabs(propId: string, restoreTargets = true): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig || !rig.timeline) return false;
    const grabs: GlbPropGrabConstraint[] = Array.isArray(rig.timeline.handGrabs) ? rig.timeline.handGrabs : [];
    if (grabs.length === 0) return false;
    if (restoreTargets) {
      for (const g of grabs) {
        if (!g?.targetPropId) continue;
        const targetWrapper = this._findPropWrapperEntity(g.targetPropId);
        if (targetWrapper) {
          if (g.restWorldPos) {
            targetWrapper.setPosition(g.restWorldPos.x, g.restWorldPos.y, g.restWorldPos.z);
          }
          if (g.restWorldRot) {
            targetWrapper.setEulerAngles(g.restWorldRot.x, g.restWorldRot.y, g.restWorldRot.z);
          }
        }
      }
    }
    rig.timeline.handGrabs = [];
    return true;
  }

  /** Liệt kê các đồ vật/nhân vật khác đang hiển thị trong cảnh kèm tọa độ 3D tương đối so với nhân vật đang chọn */
  getScenePropsForInteraction(actorPropId?: string | null): Array<{
    id: string;
    name: string;
    hasRig: boolean;
    isHumanoid: boolean;
    distanceMeters: number;
    angleDeg: number;
    relForwardMeters: number;
    relLeftMeters: number;
    heightMeters: number;
    heightLabel: string;
  }> {
    const summary = this.getCaptureSceneSummary();
    const actorRig = actorPropId ? this._propRigMap.get(actorPropId) : null;
    const actorBounds = actorRig?.wrapper ? this._getEntityVisualWorldBounds(actorRig.wrapper) : null;
    const actorFloorY = actorBounds ? actorBounds.min.y : 0;
    const actorHeightW = actorBounds ? Math.max(0.5, actorBounds.size.y) : 1.7;
    const worldPerMeter = actorRig?.wrapper
      ? Math.max(0.01, Math.abs(actorRig.wrapper.getLocalScale().y || 1) * (actorRig.meterScale || 1))
      : 1;
    const invActorMat = actorRig?.wrapper ? actorRig.wrapper.getWorldTransform().clone().invert() : null;
    const fwdAxis = actorRig?.forwardAxis || '+z';
    const meterScale = actorRig?.meterScale || 1;

    const out: Array<{
      id: string;
      name: string;
      hasRig: boolean;
      isHumanoid: boolean;
      distanceMeters: number;
      angleDeg: number;
      relForwardMeters: number;
      relLeftMeters: number;
      heightMeters: number;
      heightLabel: string;
    }> = [];

    for (const p of summary.props) {
      if (!p || p.id === actorPropId) continue;
      const ent = this._findPropWrapperEntity(p.id);
      if (!ent || !ent.enabled) continue;
      const bb = this._getEntityVisualWorldBounds(ent);
      const tRig = this._propRigMap.get(p.id);
      let distanceMeters = 0;
      let angleDeg = 0;
      let relForwardMeters = 0;
      let relLeftMeters = 0;
      if (invActorMat) {
        const loc = invActorMat.transformPoint(bb.center, new pc.Vec3());
        const lx = loc.x / meterScale;
        const lz = loc.z / meterScale;
        distanceMeters = Math.round(Math.hypot(lx, lz) * 10) / 10;
        if (fwdAxis === '+x') {
          relForwardMeters = Math.round(lx * 10) / 10;
          relLeftMeters = Math.round(-lz * 10) / 10;
          angleDeg = Math.round((Math.atan2(-lz, lx) * 180) / Math.PI);
        } else {
          relForwardMeters = Math.round(lz * 10) / 10;
          relLeftMeters = Math.round(lx * 10) / 10;
          angleDeg = Math.round((Math.atan2(lx, lz) * 180) / Math.PI);
        }
      }
      const heightMeters = Math.round(((bb.center.y - actorFloorY) / worldPerMeter) * 100) / 100;
      const hRatio = (bb.center.y - actorFloorY) / actorHeightW;
      const heightLabel =
        hRatio < 0.35 ? 'thấp gần sàn'
          : (hRatio < 0.62 ? 'ngang hông'
            : (hRatio <= 0.92 ? 'ngang ngực/vai' : 'trên cao'));
      out.push({
        id: p.id,
        name: p.name,
        hasRig: p.hasRig,
        isHumanoid: !!tRig?.hasSkinnedSkeleton,
        distanceMeters,
        angleDeg,
        relForwardMeters,
        relLeftMeters,
        heightMeters,
        heightLabel
      });
    }
    out.sort((a, b) => Number(a.isHumanoid) - Number(b.isHumanoid) || a.distanceMeters - b.distanceMeters);
    return out;
  }

  /**
   * Tạo chuỗi hành động chuẩn 3D: Nhân vật quay mặt, đi/chạy tới đúng tầm với của món đồ khác trong cảnh,
   * giải 2-Bone Analytical IK để bàn tay chạm đúng món đồ, gập ngón tay nắm lấy và gắn ràng buộc đồ vật
   * di chuyển dính chặt theo bàn tay (Cầm lên xem / Giữ tại chỗ / Mang quay lại).
   */
  generateWalkAndGrabTimeline(
    actorPropId: string,
    opts: {
      targetPropId: string;
      hand?: 'right' | 'left';
      gait?: 'walk' | 'run';
      afterGrab?: 'inspect' | 'hold' | 'carry_back';
      duration?: number;
      prompt?: string;
    }
  ): {
    appliedCount: number;
    duration: number;
    grabTime: number;
    targetName: string;
    explanation: string;
  } | null {
    const rig = this._propRigMap.get(actorPropId);
    if (!rig || !rig.hasSkinnedSkeleton || !opts?.targetPropId || opts.targetPropId === actorPropId) {
      return null;
    }
    const targetWrapper = this._findPropWrapperEntity(opts.targetPropId);
    if (!targetWrapper || !targetWrapper.enabled) {
      return null;
    }

    // Nếu nhân vật đang giữ sẵn đồ vật cũ, trả đồ vật về vị trí gốc trước khi tính toán đường đi mới
    this.clearPropHandGrabs(actorPropId, true);

    const handSide: 'right' | 'left' = opts.hand === 'left' ? 'left' : 'right';
    const gaitMode: 'walk' | 'run' = opts.gait === 'run' ? 'run' : 'walk';
    const afterGrab: 'inspect' | 'hold' | 'carry_back' =
      opts.afterGrab === 'hold' || opts.afterGrab === 'carry_back' ? opts.afterGrab : 'inspect';

    const profileProps: any[] = Array.isArray((this._profile as any)?.props) ? (this._profile as any).props : [];
    const targetMeta = profileProps.find((p: any) => p && p.id === opts.targetPropId);
    const targetName = String(targetMeta?.name || opts.targetPropId);

    const restWorldPos = targetWrapper.getPosition().clone();
    const restWorldRot = targetWrapper.getEulerAngles().clone();
    const targetBounds = this._getEntityVisualWorldBounds(targetWrapper);
    const targetCenterW = targetBounds.center.clone();

    const anat = this._resolveRigAnatomy(rig);
    const meterScale = rig.meterScale || 1;
    const forwardAxis = rig.forwardAxis || '+z';
    const baseFwd = forwardAxis === '+x' ? new pc.Vec3(1, 0, 0) : new pc.Vec3(0, 0, 1);

    const armName = handSide === 'left' ? anat.lArm : anat.rArm;
    const foreArmName = handSide === 'left' ? anat.lForeArm : anat.rForeArm;
    const handName = handSide === 'left' ? anat.lHand : anat.rHand;
    const armBone = rig.bones.get(armName);
    const foreArmBone = rig.bones.get(foreArmName);
    const handBone = rig.bones.get(handName);
    if (!armBone?.node || !foreArmBone?.node || !handBone?.node) {
      return null;
    }

    // Đưa nhân vật tạm về tư thế nghỉ gốc tại (0,0,0) để đo chuẩn hình học giải phẫu
    this._stopRigClipAnim(rig);
    rig.timeline.mode = 'keyframes';
    rig.timeline.poseSpace = 'rest';
    this.resetBonePose(actorPropId);

    const actorBounds = this._getEntityVisualWorldBounds(rig.wrapper);
    const actorFloorY = actorBounds.min.y;
    const actorHeightW = Math.max(0.5, actorBounds.size.y);
    const wrapperScale = Math.max(0.01, Math.abs(rig.wrapper.getLocalScale().y || 1));
    const worldPerMeter = wrapperScale * meterScale;

    const handAnat = this._analyzeRigHandAnatomy(rig, anat, handSide, actorHeightW, baseFwd);
    const fingerBoneNames: string[] = handAnat ? handAnat.fingers.map((f) => f.boneName) : [];
    const targetMetrics = this._measurePropLocalBounds(targetWrapper);
    const targetGripStyle = this._classifyPropGripStyle(targetMetrics, handAnat?.handLengthW || actorHeightW * 0.105);

    const restArmPosW = armBone.node.getPosition().clone();
    const restForePosW = foreArmBone.node.getPosition().clone();
    const restHandPosW = handBone.node.getPosition().clone();
    const upperArmLenW = Math.max(0.05, restArmPosW.distance(restForePosW));
    const foreArmLenW = Math.max(0.05, restForePosW.distance(restHandPosW));
    const armReachW = Math.max(actorHeightW * 0.34, upperArmLenW + foreArmLenW);

    // Xác định hướng trục ngang (trái/phải) thực tế của nhân vật trong Character Space
    const rootQuat0 = rig.glbEntity.getRotation().clone().normalize();
    const invRootQuat0 = rootQuat0.clone().invert();
    const lArmNode = rig.bones.get(anat.lArm)?.node;
    const rArmNode = rig.bones.get(anat.rArm)?.node;
    const shoulderAxisC = (lArmNode && rArmNode)
      ? invRootQuat0.transformVector(new pc.Vec3().sub2(lArmNode.getPosition(), rArmNode.getPosition()), new pc.Vec3()).normalize()
      : new pc.Vec3(1, 0, 0);
    const sideDirC = handSide === 'left' ? shoulderAxisC.clone() : shoulderAxisC.clone().mulScalar(-1);

    // Chuyển tọa độ món đồ đích vào không gian mét cục bộ của wrapper nhân vật
    const invWrapperMat = rig.wrapper.getWorldTransform().clone().invert();
    const targetLocal = invWrapperMat.transformPoint(targetCenterW, new pc.Vec3());
    const txM = targetLocal.x / meterScale;
    const tzM = targetLocal.z / meterScale;
    const horizDistM = Math.hypot(txM, tzM);

    let yawToTargetDeg = 0;
    if (horizDistM > 0.05) {
      yawToTargetDeg = forwardAxis === '+x'
        ? (Math.atan2(-tzM, txM) * 180) / Math.PI
        : (Math.atan2(txM, tzM) * 180) / Math.PI;
      while (yawToTargetDeg > 180) yawToTargetDeg -= 360;
      while (yawToTargetDeg < -180) yawToTargetDeg += 360;
    }

    const heightRatio = (targetCenterW.y - actorFloorY) / actorHeightW;
    // Tư thế thân & chân thích ứng theo độ cao thực tế của món đồ
    const bodyGrabPose: Array<{ boneName: string; rot: { x: number; y: number; z: number }; pos: { x: number; y: number; z: number } }> = [];
    const sideTwistSign = handSide === 'right' ? 1 : -1;
    if (heightRatio < 0.36) {
      const crouchY = -Math.max(0.14, Math.min(0.36, (0.42 - heightRatio) * 0.78));
      bodyGrabPose.push(
        { boneName: anat.hips, rot: { x: 18, y: sideTwistSign * 8, z: 0 }, pos: { x: 0, y: crouchY, z: 0 } },
        { boneName: anat.lowerSpine, rot: { x: 26, y: sideTwistSign * 8, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.chest, rot: { x: 14, y: sideTwistSign * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.head, rot: { x: 22, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.lUpLeg, rot: { x: -46, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.rUpLeg, rot: { x: -46, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.lLeg, rot: { x: 72, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.rLeg, rot: { x: 72, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
      );
    } else if (heightRatio < 0.62) {
      bodyGrabPose.push(
        { boneName: anat.hips, rot: { x: 6, y: sideTwistSign * 6, z: 0 }, pos: { x: 0, y: -0.04, z: 0 } },
        { boneName: anat.lowerSpine, rot: { x: 16, y: sideTwistSign * 8, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.chest, rot: { x: 10, y: sideTwistSign * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.head, rot: { x: 16, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
      );
    } else if (heightRatio <= 0.94) {
      bodyGrabPose.push(
        { boneName: anat.lowerSpine, rot: { x: 6, y: sideTwistSign * 8, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.chest, rot: { x: 5, y: sideTwistSign * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.head, rot: { x: 6, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
      );
    } else {
      bodyGrabPose.push(
        { boneName: anat.lowerSpine, rot: { x: -6, y: sideTwistSign * 6, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.chest, rot: { x: -6, y: sideTwistSign * 5, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
        { boneName: anat.head, rot: { x: -16, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
      );
    }

    // Helper: Quaternion xoay ngắn nhất từ vector đơn vị a sang vector đơn vị b
    const quatFromTo = (a: pc.Vec3, b: pc.Vec3): pc.Quat => {
      const va = a.clone().normalize();
      const vb = b.clone().normalize();
      const d = Math.max(-1, Math.min(1, va.dot(vb)));
      if (d > 0.99995) return new pc.Quat(0, 0, 0, 1);
      if (d < -0.99995) {
        const ortho = Math.abs(va.y) < 0.9 ? new pc.Vec3(0, 1, 0) : new pc.Vec3(1, 0, 0);
        const axis = new pc.Vec3().cross(va, ortho).normalize();
        return new pc.Quat().setFromAxisAngle(axis, 180);
      }
      const axis = new pc.Vec3().cross(va, vb).normalize();
      const angleDeg = (Math.acos(d) * 180) / Math.PI;
      return new pc.Quat().setFromAxisAngle(axis, angleDeg);
    };

    // Helper: Giải 2-Bone Analytical IK trực tiếp trên skeleton PlayCanvas thật cho cánh tay -> bất kể T-Pose / A-Pose!
    const solveTwoBoneArmIk = (
      rootXM: number,
      rootZM: number,
      rootYawDeg: number,
      bodyPose: typeof bodyGrabPose,
      worldAimPoint: pc.Vec3,
      wristMode: 'grab' | 'inspect' | 'carry' | 'neutral' = 'grab',
      heightRatioHint = heightRatio
    ): {
      armRot: { x: number; y: number; z: number };
      foreRot: { x: number; y: number; z: number };
      handRot: { x: number; y: number; z: number };
      handWorldPos: pc.Vec3;
      palmWorldPos: pc.Vec3;
    } => {
      this.resetBonePose(actorPropId);
      this.setBonePoseDelta(
        actorPropId,
        '__root__',
        { x: 0, y: rootYawDeg, z: 0 },
        { x: rootXM * meterScale, y: 0, z: rootZM * meterScale }
      );
      for (const bp of bodyPose) {
        if (bp.boneName && bp.boneName !== '__root__') {
          this.setBonePoseDelta(actorPropId, bp.boneName, bp.rot, bp.pos);
        }
      }

      const rootQ = rig.glbEntity.getRotation().clone().normalize();
      const invRootQ = rootQ.clone().invert();
      const toChar = (v: pc.Vec3) => invRootQ.transformVector(v, new pc.Vec3());

      const sW = armBone.node.getPosition().clone();
      const eW = foreArmBone.node.getPosition().clone();
      const hW = handBone.node.getPosition().clone();

      const palmDistW = handAnat ? handAnat.localPalmOffset.length() : 0;
      const effectiveWristAimW = worldAimPoint.clone();
      if (wristMode === 'grab' && palmDistW > 1e-4) {
        const approachW = new pc.Vec3().sub2(worldAimPoint, sW);
        if (approachW.lengthSq() > 1e-6) {
          approachW.normalize();
          effectiveWristAimW.sub(approachW.mulScalar(palmDistW * 0.85));
        }
      }

      const vU = toChar(new pc.Vec3().sub2(eW, sW));
      const vF = toChar(new pc.Vec3().sub2(hW, eW));
      const vT = toChar(new pc.Vec3().sub2(effectiveWristAimW, sW));
      const L1 = Math.max(1e-4, vU.length());
      const L2 = Math.max(1e-4, vF.length());
      const rawDist = vT.length();
      const minD = Math.abs(L1 - L2) + Math.min(L1, L2) * 0.08;
      const maxD = (L1 + L2) * 0.985;
      const dist = Math.max(minD, Math.min(maxD, rawDist));

      const dirT = rawDist > 1e-4 ? vT.clone().normalize() : baseFwd.clone();
      const cosAlpha = Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
      const alpha = Math.acos(cosAlpha);

      // Pole vector: khuỷu tay gập tự nhiên hướng xuống dưới + hơi ra ngoài + hơi ra sau
      const pole = new pc.Vec3(
        sideDirC.x * 0.48 - baseFwd.x * 0.35,
        -0.82,
        sideDirC.z * 0.48 - baseFwd.z * 0.35
      ).normalize();
      const proj = dirT.clone().mulScalar(pole.dot(dirT));
      const bendDir = new pc.Vec3().sub2(pole, proj);
      if (bendDir.lengthSq() < 1e-5) {
        bendDir.set(sideDirC.x, -0.5, sideDirC.z);
      }
      bendDir.normalize();

      const uDes = new pc.Vec3(
        dirT.x * Math.cos(alpha) + bendDir.x * Math.sin(alpha),
        dirT.y * Math.cos(alpha) + bendDir.y * Math.sin(alpha),
        dirT.z * Math.cos(alpha) + bendDir.z * Math.sin(alpha)
      ).normalize();

      const qArm = quatFromTo(vU, uDes);
      const eArm = qArm.getEulerAngles();
      const armRot = {
        x: Math.round(eArm.x * 10) / 10,
        y: Math.round(eArm.y * 10) / 10,
        z: Math.round(eArm.z * 10) / 10
      };
      this.setBonePoseDelta(actorPropId, armName, armRot);

      const e2W = foreArmBone.node.getPosition().clone();
      const h2W = handBone.node.getPosition().clone();
      const vF2 = toChar(new pc.Vec3().sub2(h2W, e2W));
      const vRem = toChar(new pc.Vec3().sub2(effectiveWristAimW, e2W));
      const qWorldSwing = quatFromTo(vF2, vRem);
      // Quy đổi vào không gian trước phép xoay cha qArm để triệt tiêu xoay chồng khớp
      const qFore = new pc.Quat()
        .mul2(qArm.clone().invert(), qWorldSwing)
        .mul(qArm)
        .normalize();
      const eFore = qFore.getEulerAngles();
      const foreRot = {
        x: Math.round(eFore.x * 10) / 10,
        y: Math.round(eFore.y * 10) / 10,
        z: Math.round(eFore.z * 10) / 10
      };
      this.setBonePoseDelta(actorPropId, foreArmName, foreRot);

      let handRot = { x: 0, y: 0, z: 0 };
      if (handAnat && wristMode !== 'neutral') {
        const headNode = rig.bones.get(anat.head)?.node;
        const headPosW = headNode
          ? headNode.getPosition().clone()
          : new pc.Vec3(sW.x, actorFloorY + actorHeightW * 0.9, sW.z);
        const sideWorld = rootQ.transformVector(sideDirC, new pc.Vec3()).normalize();
        handRot = this._solveWristOrientation(actorPropId, rig, handAnat, wristMode, {
          headPosW,
          sideWorld,
          heightRatio: heightRatioHint,
          actorHeightW
        });
      }

      const handWorldPos = handBone.node.getPosition().clone();
      const handWorldQ = handBone.node.getRotation().clone().normalize();
      const palmWorldPos = handAnat
        ? handWorldPos.clone().add(handWorldQ.transformVector(handAnat.localPalmOffset, new pc.Vec3()))
        : handWorldPos.clone();
      return { armRot, foreRot, handRot, handWorldPos, palmWorldPos };
    };

    // Tính vị trí dừng ban đầu (cách tâm món đồ đúng tầm với tay tự nhiên ~74% sải tay)
    const reachHorizM = Math.max(0.32, (armReachW / worldPerMeter) * 0.74);
    const rawWalkDistM = Math.max(0, horizDistM - reachHorizM);
    const dirXM = horizDistM > 1e-4 ? txM / horizDistM : baseFwd.x;
    const dirZM = horizDistM > 1e-4 ? tzM / horizDistM : baseFwd.z;
    let stopXM = dirXM * rawWalkDistM;
    let stopZM = dirZM * rawWalkDistM;

    // HIỆU CHỈNH VI MÔ BẰNG FK THỰC TẾ: thử áp 2-Bone IK tại (stopXM, stopZM) rồi dịch chân 1 lần cho LÒNG BÀN TAY chạm sát món đồ!
    const probe1 = solveTwoBoneArmIk(stopXM, stopZM, yawToTargetDeg, bodyGrabPose, targetCenterW, 'grab', heightRatio);
    const errW1 = new pc.Vec3().sub2(targetCenterW, probe1.palmWorldPos);
    const errHorizW = Math.hypot(errW1.x, errW1.z);
    if (errHorizW > worldPerMeter * 0.03) {
      const targetPt1 = invWrapperMat.transformPoint(targetCenterW, new pc.Vec3());
      const palmPt1 = invWrapperMat.transformPoint(probe1.palmWorldPos, new pc.Vec3());
      const corrXM = Math.max(-0.95, Math.min(0.95, (targetPt1.x - palmPt1.x) / meterScale));
      const corrZM = Math.max(-0.95, Math.min(0.95, (targetPt1.z - palmPt1.z) / meterScale));
      stopXM += corrXM;
      stopZM += corrZM;
    }

    // Tính lại hướng quay mặt cuối cùng theo điểm dừng đã hiệu chỉnh
    const finalWalkDistM = Math.hypot(stopXM, stopZM);
    const walkYawDeg = finalWalkDistM > 0.08
      ? (forwardAxis === '+x'
        ? (Math.atan2(-stopZM, stopXM) * 180) / Math.PI
        : (Math.atan2(stopXM, stopZM) * 180) / Math.PI)
      : yawToTargetDeg;
    const faceTargetAtStopYawDeg = (() => {
      const rx = txM - stopXM;
      const rz = tzM - stopZM;
      if (Math.hypot(rx, rz) < 0.05) return yawToTargetDeg;
      let y = forwardAxis === '+x'
        ? (Math.atan2(-rz, rx) * 180) / Math.PI
        : (Math.atan2(rx, rz) * 180) / Math.PI;
      while (y > 180) y -= 360;
      while (y < -180) y += 360;
      return y;
    })();

    // Giải 2-Bone IK lần cuối tại vị trí dừng chuẩn xác & tính điểm áp sát khít vào lòng bàn tay
    const grabIk = solveTwoBoneArmIk(stopXM, stopZM, faceTargetAtStopYawDeg, bodyGrabPose, targetCenterW, 'grab', heightRatio);
    const headNodeAtGrab = rig.bones.get(anat.head)?.node;
    const headPosAtGrabW = headNodeAtGrab
      ? headNodeAtGrab.getPosition().clone()
      : new pc.Vec3(restWorldPos.x, actorFloorY + actorHeightW * 0.9, restWorldPos.z);
    const seatedGrab = this._computeSeatedHandGrabAttachment(
      handBone.node,
      handAnat,
      targetWrapper,
      restWorldPos,
      restWorldRot,
      headPosAtGrabW
    );
    const localOffsetVec = seatedGrab.locOff;
    const localRotQuat = seatedGrab.locRotQ;

    // Tính tư thế tay sau khi nắm (Cầm lên xem trước ngực hoặc mang về) bằng cùng 2-Bone IK + xoay cổ tay tự nhiên!
    const inspectBodyPose: typeof bodyGrabPose = [
      { boneName: anat.lowerSpine, rot: { x: 4, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
      { boneName: anat.chest, rot: { x: 4, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
      { boneName: anat.head, rot: { x: 16, y: sideTwistSign * -6, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
    ];
    const carryBodyPose: typeof bodyGrabPose = [
      { boneName: anat.lowerSpine, rot: { x: 2, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
    ];

    // Mục tiêu cổ tay khi "Cầm lên xem": trước ngực/cằm ~0.34m, hơi lệch sang phía tay cầm
    const qFace = new pc.Quat().setFromEulerAngles(0, faceTargetAtStopYawDeg, 0);
    const fwdAtStopLocal = qFace.transformVector(baseFwd, new pc.Vec3()).normalize();
    const sideAtStopLocal = qFace.transformVector(sideDirC, new pc.Vec3()).normalize();
    const inspectLocalPt = new pc.Vec3(
      (stopXM + fwdAtStopLocal.x * 0.34 + sideAtStopLocal.x * 0.12) * meterScale,
      (actorHeightW * 0.72) / wrapperScale,
      (stopZM + fwdAtStopLocal.z * 0.34 + sideAtStopLocal.z * 0.12) * meterScale
    );
    const inspectWorldPt = rig.wrapper.getWorldTransform().transformPoint(inspectLocalPt, new pc.Vec3());
    const inspectIk = solveTwoBoneArmIk(stopXM, stopZM, faceTargetAtStopYawDeg, inspectBodyPose, inspectWorldPt, 'inspect', 0.72);

    const carryLocalPt = new pc.Vec3(
      (stopXM + fwdAtStopLocal.x * 0.28 + sideAtStopLocal.x * 0.18) * meterScale,
      (actorHeightW * 0.56) / wrapperScale,
      (stopZM + fwdAtStopLocal.z * 0.28 + sideAtStopLocal.z * 0.18) * meterScale
    );
    const carryWorldPt = rig.wrapper.getWorldTransform().transformPoint(carryLocalPt, new pc.Vec3());
    const carryIk = solveTwoBoneArmIk(stopXM, stopZM, faceTargetAtStopYawDeg, carryBodyPose, carryWorldPt, 'carry', 0.56);

    // Thời lượng từng chặng (tự nhiên, mượt mà)
    let normWalkYaw = walkYawDeg;
    while (normWalkYaw > 180) normWalkYaw -= 360;
    while (normWalkYaw < -180) normWalkYaw += 360;
    const turnDur = Math.abs(normWalkYaw) > 10 ? Math.max(0.32, Math.min(0.8, (Math.abs(normWalkYaw) / 180) * 0.72)) : 0;
    const walkSpeed = gaitMode === 'run' ? 2.4 : 1.35;
    const walkDur = finalWalkDistM > 0.1 ? Math.max(0.6, Math.min(10.0, finalWalkDistM / walkSpeed)) : 0;
    const reachDur = 0.55;
    const settleDur = afterGrab === 'hold' ? 1.1 : (afterGrab === 'inspect' ? 1.8 : 0.55);
    const backTurnDur = afterGrab === 'carry_back' && finalWalkDistM > 0.15 ? 0.65 : 0;
    const backWalkDur = afterGrab === 'carry_back' && finalWalkDistM > 0.15 ? Math.max(0.6, Math.min(10.0, finalWalkDistM / 1.3)) : 0;

    const rawTotal = turnDur + walkDur + reachDur + settleDur + backTurnDur + backWalkDur;
    const scaleT = (opts.duration && opts.duration >= 1.5 && opts.duration <= 45) ? (opts.duration / Math.max(0.5, rawTotal)) : 1.0;

    const t0 = 0;
    const tTurnEnd = t0 + turnDur * scaleT;
    const tArrive = tTurnEnd + walkDur * scaleT;
    const tGrab = tArrive + reachDur * scaleT;
    const tSettleEnd = tGrab + settleDur * scaleT;
    const tBackTurnEnd = tSettleEnd + backTurnDur * scaleT;
    const totalDur = Math.round((tBackTurnEnd + backWalkDur * scaleT) * 100) / 100;

    const kfs: Array<{
      time: number;
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos?: { x: number; y?: number; z?: number };
    }> = [];
    const normBoneKey = (name: string): string =>
      String(name || '').replace(/^mixamorig:?/i, '').replace(/[\s_.-]+/g, '').toLowerCase();
    const lastMs = new Map<string, number>();
    const pushKf = (
      t: number,
      boneName: string,
      rot: { x: number; y: number; z: number },
      pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
      minGapMs = 10
    ) => {
      if (!boneName) return;
      const clampedT = Math.round(Math.max(0, Math.min(totalDur, t)) * 1000) / 1000;
      const ms = Math.round(clampedT * 1000);
      const key = normBoneKey(boneName);
      const prev = lastMs.get(key);
      if (prev !== undefined && Math.abs(ms - prev) < minGapMs) return;
      lastMs.set(key, ms);
      kfs.push({ time: clampedT, boneName, rot, pos });
    };
    const pushRoot = (t: number, xM: number, zM: number, yawDeg: number) => {
      pushKf(
        t,
        '__root__',
        { x: 0, y: Math.round(yawDeg * 10) / 10, z: 0 },
        { x: Math.round(xM * meterScale * 1000) / 1000, y: 0, z: Math.round(zM * meterScale * 1000) / 1000 },
        10
      );
    };

    const emitProceduralWalk = (tStart: number, tEnd: number, isRun: boolean, skipSet: Set<string>) => {
      const winDur = tEnd - tStart;
      if (winDur < 0.08) return;
      const baseCyc = isRun ? 0.72 : 1.02;
      const wholeCycles = Math.max(1, Math.round(winDur / baseCyc));
      const steps = wholeCycles * 8;
      const swing = isRun ? 44 : 32;
      const emitLimb = (bName: string, t: number, rx: number, ry: number, rz: number, py = 0) => {
        if (!bName || bName === '__root__' || skipSet.has(normBoneKey(bName))) return;
        pushKf(t, bName, { x: Math.round(rx * 10) / 10, y: Math.round(ry * 10) / 10, z: Math.round(rz * 10) / 10 }, { x: 0, y: Math.round(py * 1000) / 1000, z: 0 }, 14);
      };
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const t = i === steps ? tEnd : tStart + f * winDur;
        const ph = f * wholeCycles * Math.PI * 2;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        emitLimb(anat.hips, t, isRun ? 8 : 2, s * 6, c * 2, Math.abs(c) * (isRun ? 0.07 : 0.025));
        emitLimb(anat.lowerSpine, t, isRun ? 6 : 2, -s * 5, 0);
        if (anat.chest !== anat.lowerSpine) emitLimb(anat.chest, t, isRun ? 5 : 2, -s * 4, 0);
        if (anat.head !== anat.chest) emitLimb(anat.head, t, 0, s * 2.5, 0);
        emitLimb(anat.lUpLeg, t, -s * swing, 0, 0);
        emitLimb(anat.rUpLeg, t, s * swing, 0, 0);
        if (anat.lLeg !== anat.lUpLeg) emitLimb(anat.lLeg, t, (s < 0 ? -s : 0.14) * (swing * 1.05), 0, 0);
        if (anat.rLeg !== anat.rUpLeg) emitLimb(anat.rLeg, t, (s > 0 ? s : 0.14) * (swing * 1.05), 0, 0);
        if (anat.lFoot !== anat.lLeg) emitLimb(anat.lFoot, t, s > 0 ? -9 * s : 11 * (-s), 0, 0);
        if (anat.rFoot !== anat.rLeg) emitLimb(anat.rFoot, t, s < 0 ? 9 * s : 11 * s, 0, 0);
        emitLimb(anat.lArm, t, s * (swing * 0.65), 0, -14);
        emitLimb(anat.rArm, t, -s * (swing * 0.65), 0, 14);
        if (anat.lForeArm !== anat.lArm) emitLimb(anat.lForeArm, t, isRun ? -58 : -20, 0, 0);
        if (anat.rForeArm !== anat.rArm) emitLimb(anat.rForeArm, t, isRun ? -58 : -20, 0, 0);
      }
    };

    const emitNeutralPose = (t: number, skipSet: Set<string>) => {
      const list = [
        anat.hips, anat.lowerSpine, anat.chest, anat.head,
        anat.lArm, anat.lForeArm, anat.rArm, anat.rForeArm,
        anat.lUpLeg, anat.lLeg, anat.lFoot, anat.rUpLeg, anat.rLeg, anat.rFoot
      ];
      const seen = new Set<string>();
      for (const bn of list) {
        const nk = normBoneKey(bn);
        if (!bn || bn === '__root__' || seen.has(nk) || skipSet.has(nk)) continue;
        seen.add(nk);
        pushKf(t, bn, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 12);
      }
    };

    const emitFingers = (t: number, curled: boolean | number) => {
      const closure = typeof curled === 'number' ? Math.max(0, Math.min(1, curled)) : (curled ? 1 : 0);
      if (handAnat && handAnat.fingers.length > 0) {
        const poses = this._computeAnatomicalFingerCurl(handAnat, targetGripStyle, closure);
        for (const p of poses) {
          pushKf(t, p.boneName, p.rot, { x: 0, y: 0, z: 0 }, 10);
        }
        return;
      }
      for (const fName of fingerBoneNames) {
        pushKf(t, fName, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 10);
      }
    };

    // 1. Chặng quay mặt về phía món đồ
    pushRoot(0, 0, 0, 0);
    emitNeutralPose(0, new Set());
    emitFingers(0, false);
    if (turnDur > 0) {
      const tSteps = Math.max(3, Math.ceil(Math.abs(normWalkYaw) / 30));
      for (let i = 1; i <= tSteps; i++) {
        pushRoot((i / tSteps) * tTurnEnd, 0, 0, normWalkYaw * (i / tSteps));
      }
    }

    // 2. Chặng đi/chạy tới sát món đồ
    if (walkDur > 0) {
      const wSteps = Math.max(6, Math.min(24, Math.ceil(finalWalkDistM * 3)));
      for (let i = 1; i <= wSteps; i++) {
        const f = i / wSteps;
        const yawNow = normWalkYaw + (faceTargetAtStopYawDeg - normWalkYaw) * Math.pow(f, 2);
        pushRoot(tTurnEnd + f * (tArrive - tTurnEnd), stopXM * f, stopZM * f, yawNow);
      }
      emitProceduralWalk(tTurnEnd, tArrive, gaitMode === 'run', new Set());
    } else {
      pushRoot(tArrive, stopXM, stopZM, faceTargetAtStopYawDeg);
    }

    // 3. Chặng vươn tay chạm & nắm lấy món đồ (tArrive -> tGrab)
    pushRoot(tGrab, stopXM, stopZM, faceTargetAtStopYawDeg);
    emitFingers(tArrive, 0);
    if (tGrab - tArrive >= 0.25) {
      emitFingers(tArrive + (tGrab - tArrive) * 0.62, 0.32);
    }
    const grabSkip = new Set<string>([normBoneKey(armName), normBoneKey(foreArmName), normBoneKey(handName)]);
    for (const bp of bodyGrabPose) {
      if (bp.boneName && bp.boneName !== '__root__') {
        grabSkip.add(normBoneKey(bp.boneName));
        pushKf(tGrab, bp.boneName, bp.rot, bp.pos, 10);
      }
    }
    emitNeutralPose(tGrab, grabSkip);
    pushKf(tGrab, armName, grabIk.armRot, { x: 0, y: 0, z: 0 }, 10);
    pushKf(tGrab, foreArmName, grabIk.foreRot, { x: 0, y: 0, z: 0 }, 10);
    pushKf(tGrab, handName, grabIk.handRot, { x: 0, y: 0, z: 0 }, 10);
    emitFingers(tGrab, 1.0);

    // 4. Chặng sau khi nắm
    if (afterGrab === 'inspect') {
      const tLift = tGrab + (tSettleEnd - tGrab) * 0.45;
      pushRoot(tLift, stopXM, stopZM, faceTargetAtStopYawDeg);
      pushRoot(totalDur, stopXM, stopZM, faceTargetAtStopYawDeg);
      const inspSkip = new Set<string>([normBoneKey(armName), normBoneKey(foreArmName), normBoneKey(handName)]);
      for (const bp of inspectBodyPose) {
        if (bp.boneName && bp.boneName !== '__root__') {
          inspSkip.add(normBoneKey(bp.boneName));
          pushKf(tLift, bp.boneName, bp.rot, bp.pos, 10);
          pushKf(totalDur, bp.boneName, bp.rot, bp.pos, 10);
        }
      }
      emitNeutralPose(tLift, inspSkip);
      emitNeutralPose(totalDur, inspSkip);
      pushKf(tLift, armName, inspectIk.armRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(tLift, foreArmName, inspectIk.foreRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(tLift, handName, inspectIk.handRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, armName, inspectIk.armRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, foreArmName, inspectIk.foreRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, handName, inspectIk.handRot, { x: 0, y: 0, z: 0 }, 10);
      emitFingers(totalDur, 1.0);
    } else if (afterGrab === 'hold') {
      pushRoot(totalDur, stopXM, stopZM, faceTargetAtStopYawDeg);
      for (const bp of bodyGrabPose) {
        if (bp.boneName && bp.boneName !== '__root__') {
          pushKf(totalDur, bp.boneName, bp.rot, bp.pos, 10);
        }
      }
      emitNeutralPose(totalDur, grabSkip);
      pushKf(totalDur, armName, grabIk.armRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, foreArmName, grabIk.foreRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, handName, grabIk.handRot, { x: 0, y: 0, z: 0 }, 10);
      emitFingers(totalDur, 1.0);
    } else {
      // carry_back: thu tay cầm sát thân -> quay đầu 180° -> đi bộ quay về điểm xuất phát (giữ nguyên tay cầm đồ!)
      const carrySkip = new Set<string>([
        normBoneKey(armName),
        normBoneKey(foreArmName),
        normBoneKey(handName),
        ...fingerBoneNames.map((f) => normBoneKey(f))
      ]);
      pushRoot(tSettleEnd, stopXM, stopZM, faceTargetAtStopYawDeg);
      emitNeutralPose(tSettleEnd, carrySkip);
      pushKf(tSettleEnd, armName, carryIk.armRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(tSettleEnd, foreArmName, carryIk.foreRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(tSettleEnd, handName, carryIk.handRot, { x: 0, y: 0, z: 0 }, 10);
      emitFingers(tSettleEnd, 1.0);

      const backYawDeg = faceTargetAtStopYawDeg + (faceTargetAtStopYawDeg >= 0 ? -180 : 180);
      if (backTurnDur > 0) {
        const btSteps = 6;
        for (let i = 1; i <= btSteps; i++) {
          const f = i / btSteps;
          pushRoot(tSettleEnd + f * (tBackTurnEnd - tSettleEnd), stopXM, stopZM, faceTargetAtStopYawDeg + (backYawDeg - faceTargetAtStopYawDeg) * f);
        }
      }
      if (backWalkDur > 0) {
        const bwSteps = Math.max(6, Math.min(24, Math.ceil(finalWalkDistM * 3)));
        for (let i = 1; i <= bwSteps; i++) {
          const f = i / bwSteps;
          pushRoot(tBackTurnEnd + f * (totalDur - tBackTurnEnd), stopXM * (1 - f), stopZM * (1 - f), backYawDeg);
        }
        emitProceduralWalk(tBackTurnEnd, totalDur, false, carrySkip);
      } else {
        pushRoot(totalDur, stopXM, stopZM, backYawDeg);
      }
      pushKf(totalDur, armName, carryIk.armRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, foreArmName, carryIk.foreRot, { x: 0, y: 0, z: 0 }, 10);
      pushKf(totalDur, handName, carryIk.handRot, { x: 0, y: 0, z: 0 }, 10);
      emitFingers(totalDur, 1.0);
    }

    const grabConstraint: GlbPropGrabConstraint = {
      id: 'grab_' + Date.now().toString(36),
      targetPropId: opts.targetPropId,
      hand: handSide,
      grabTime: Math.round(tGrab * 1000) / 1000,
      releaseTime: null,
      localOffset: {
        x: Math.round(localOffsetVec.x * 10000) / 10000,
        y: Math.round(localOffsetVec.y * 10000) / 10000,
        z: Math.round(localOffsetVec.z * 10000) / 10000
      },
      localRotOffset: {
        x: Math.round(localRotQuat.x * 100000) / 100000,
        y: Math.round(localRotQuat.y * 100000) / 100000,
        z: Math.round(localRotQuat.z * 100000) / 100000,
        w: Math.round(localRotQuat.w * 100000) / 100000
      },
      restWorldPos: {
        x: Math.round(restWorldPos.x * 1000) / 1000,
        y: Math.round(restWorldPos.y * 1000) / 1000,
        z: Math.round(restWorldPos.z * 1000) / 1000
      },
      restWorldRot: {
        x: Math.round(restWorldRot.x * 100) / 100,
        y: Math.round(restWorldRot.y * 100) / 100,
        z: Math.round(restWorldRot.z * 100) / 100
      }
    };

    const appliedCount = this.applyGeneratedBoneTimeline(actorPropId, {
      duration: totalDur,
      loop: false,
      poseSpace: 'rest',
      keyframes: kfs
    });

    if (appliedCount > 0) {
      rig.timeline.handGrabs = [grabConstraint];
      rig.timeline.lastAiSegments = [{
        type: 'walk_and_grab',
        targetPropId: opts.targetPropId,
        hand: handSide,
        gait: gaitMode,
        afterGrab,
        duration: totalDur
      }];
      if (opts.prompt && String(opts.prompt).trim()) {
        rig.timeline.lastAiPrompt = String(opts.prompt).trim();
      }
      rig.currentTime = 0;
      this.evaluatePropKeyframesAtTime(actorPropId, 0);
    }

    const actionLabel =
      afterGrab === 'inspect' ? 'cầm lên xem'
        : (afterGrab === 'carry_back' ? 'mang quay lại' : 'nắm giữ tại chỗ');
    const handLabel = handSide === 'left' ? 'tay trái' : 'tay phải';
    const explanation = `Đã tạo hành động ${gaitMode === 'run' ? 'chạy' : 'đi bộ'} tới (${finalWalkDistM.toFixed(1)}m), dùng ${handLabel} nắm "${targetName}" tại ${grabConstraint.grabTime.toFixed(1)}s và ${actionLabel} (${totalDur}s).`;
    return {
      appliedCount,
      duration: totalDur,
      grabTime: grabConstraint.grabTime,
      targetName,
      explanation
    };
  }

  /**
   * Bộ tổng hợp chuyển động khớp xương thông minh dựa trên từ khóa kịch bản tiếng Việt/Anh
   * (hỗ trợ cả chuỗi hành động liên tiếp nhau như "vẫy tay rồi cúi chào", phân biệt trái/phải)
   * kết hợp dữ liệu khung hình Video mẫu (VideoFramePoseSample[]).
   */
  /**
   * Tổng hợp quỹ đạo chuyển động chuẩn vật lý/hình học (chạy vòng tròn, hình số 8, chạy thẳng)
   * trên node gốc `__root__` cho xe cộ / vật thể cứng không có bộ xương khớp (hoặc khi người dùng
   * yêu cầu di chuyển theo quỹ đạo), giữ nguyên 100% kết cấu sub-mesh của mô hình.
   */
  tryGenerateRigidPathMotion(
    propId: string,
    promptText: string,
    preferredDuration?: number
  ): { count: number; duration: number; explanation: string } | null {
    const rig = this._propRigMap.get(propId);
    if (!rig) return null;
    const raw = (promptText || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();

    const isCircle = /vòng\s*tròn|vong\s*tron|chạy\s*tròn|lượn\s*tròn|đi\s*tròn|xoay\s*vòng\s*rộng|circle|orbit/.test(lower);
    const isFigure8 = /số\s*8|so\s*8|figure[\s-]*8/.test(lower);
    const isStraight = /chạy\s*thẳng|đi\s*thẳng|tiến\s*thẳng|lướt\s*thẳng|chạy\s*tới\s*lui|straight/.test(lower);

    if (!isCircle && !isFigure8 && !isStraight) {
      return null;
    }

    // Trích xuất kích thước (mét) từ lệnh người dùng: phân biệt rõ "bán kính" vs "rộng / đường kính"
    let radiusMeters = 5.0;
    const radiusMatch = lower.match(/(?:bán\s*kính|ban\s*kinh|radius|\br\s*=)\s*(\d+(?:[.,]\d+)?)\s*(?:m|mét|met)?/i);
    const diameterMatch = lower.match(/(?:đường\s*kính|duong\s*kinh|rộng|rong|diameter|wide)\s*(\d+(?:[.,]\d+)?)\s*(?:m|mét|met)?/i);
    const genericMeterMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:m|mét|met)(?:\b|$)/i);

    if (radiusMatch) {
      radiusMeters = parseFloat(radiusMatch[1].replace(',', '.'));
    } else if (diameterMatch) {
      const val = parseFloat(diameterMatch[1].replace(',', '.'));
      radiusMeters = isStraight ? val : val / 2;
    } else if (genericMeterMatch) {
      const val = parseFloat(genericMeterMatch[1].replace(',', '.'));
      radiusMeters = isStraight ? val : val / 2;
    } else {
      radiusMeters = isStraight ? 8.0 : 4.0;
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) radiusMeters = 5.0;
    radiusMeters = Math.max(0.5, Math.min(80, radiusMeters));

    // Nếu người dùng nêu rõ thời lượng ("trong 8 giây", "8s") thì ưu tiên theo đó
    const durMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:giây|giay|sec|s\b)/i);
    let duration = durMatch ? parseFloat(durMatch[1].replace(',', '.')) : 0;

    const meterScale = rig.meterScale || 1;
    const forwardAxis = rig.forwardAxis || '+z';
    const forwardYawOffset = forwardAxis === '+x' ? -90 : 0;
    // Phân biệt chính xác xe 4 bánh (ô tô, SUV, xe tải: giữ thân xe bám phẳng 4 bánh trên đường, KHÔNG nghiêng kiểu xe đạp!)
    // với xe 2 bánh (xe đạp, mô tô, xe máy: nghiêng vào tâm cua 10°).
    const widthToHeight = Math.min(rig.modelSize.x, rig.modelSize.z) / Math.max(0.01, rig.modelSize.y);
    const isFourWheeler =
      (rig.autoWheels && rig.autoWheels.length >= 3) ||
      /ô\s*tô|o\s*to|xe\s*hơi|xe\s*hoi|sedan|suv|car|truck|xe\s*tải|xe\s*tai|bus|xe\s*buýt|xe\s*khách|van\b|coupe|pickup|jeep|taxi/.test(lower) ||
      (widthToHeight > 0.95 && !/xe\s*đạp|xe\s*dap|bmx|bike|bicycle|mô\s*tô|moto|xe\s*máy|xe\s*may|scooter/.test(lower));
    const isTwoWheeler =
      !isFourWheeler &&
      (/xe\s*đạp|xe\s*dap|bmx|bike|bicycle|mô\s*tô|moto|xe\s*máy|xe\s*may|scooter/.test(lower) ||
        (rig.autoWheels && rig.autoWheels.length === 2));

    const kfs: Array<{
      time: number;
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos: { x: number; y: number; z: number };
    }> = [];

    const composeRootRot = (yawDeg: number, leanDeg: number): { x: number; y: number; z: number } => {
      const qYaw = new pc.Quat().setFromEulerAngles(0, yawDeg, 0);
      const qLean =
        forwardAxis === '+x'
          ? new pc.Quat().setFromEulerAngles(leanDeg, 0, 0)
          : new pc.Quat().setFromEulerAngles(0, 0, leanDeg);
      const qTotal = new pc.Quat().mul2(qYaw, qLean).normalize();
      const e = qTotal.getEulerAngles();
      return {
        x: Math.round(e.x * 100) / 100,
        y: Math.round(e.y * 100) / 100,
        z: Math.round(e.z * 100) / 100
      };
    };

    let explanation = '';
    const wheelNote = rig.autoWheels && rig.autoWheels.length > 0
      ? ` — tự động quay ${rig.autoWheels.length} bánh xe và đánh lái bánh trước theo bán kính cua`
      : ' — giữ nguyên 100% kết cấu mô hình';

    if (isCircle) {
      const circumference = 2 * Math.PI * radiusMeters;
      if (!duration || !Number.isFinite(duration)) {
        const autoDur = Math.max(4.0, Math.min(18.0, circumference / 5.0));
        duration = preferredDuration && preferredDuration >= 4.0 ? preferredDuration : Math.round(autoDur * 10) / 10;
      }
      duration = Math.max(1.5, Math.min(60, duration));

      const turnLeft = /ngược\s*chiều|nguoc\s*chieu|bên\s*trái|sang\s*trái|ccw/.test(lower);
      const dir = turnLeft ? -1 : 1; // +1: quay thuận (tâm nằm bên phải hướng chạy)
      const rLocal = radiusMeters * meterScale;
      // Chỉ xe 2 bánh mới nghiêng vào tâm cua (+10°); ô tô & vật thể 4 bánh giữ phẳng hoàn toàn (0°) trên mặt đường
      const leanDeg = isTwoWheeler ? (10 * dir) : 0;
      const steps = 36; // mỗi bước 10° để slerp tròn mượt tuyệt đối

      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const theta = frac * Math.PI * 2 * dir;
        const px = rLocal * Math.cos(theta);
        const pz = rLocal * Math.sin(theta);
        // Tiếp tuyến (dx/dtheta, dz/dtheta) theo chiều chuyển động thực
        const vx = -dir * Math.sin(theta);
        const vz = dir * Math.cos(theta);
        const yawDeg = (Math.atan2(vx, vz) * 180) / Math.PI + forwardYawOffset;

        kfs.push({
          time: Math.round(frac * duration * 1000) / 1000,
          boneName: '__root__',
          rot: composeRootRot(yawDeg, leanDeg),
          pos: {
            x: Math.round(px * 1000) / 1000,
            y: 0,
            z: Math.round(pz * 1000) / 1000
          }
        });
      }
      const diamStr = Number((radiusMeters * 2).toFixed(1));
      explanation = `Đã tạo quỹ đạo chạy vòng tròn đường kính ${diamStr}m (bán kính ${Number(radiusMeters.toFixed(1))}m, ${duration}s)${wheelNote}.`;
    } else if (isFigure8) {
      const halfSpan = radiusMeters;
      if (!duration || !Number.isFinite(duration)) {
        duration = Math.max(6.0, Math.min(20.0, Math.round(halfSpan * 1.6 * 10) / 10));
      }
      duration = Math.max(2.0, Math.min(60, duration));
      const a = halfSpan * meterScale;
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const th = frac * Math.PI * 2;
        const px = a * Math.sin(th);
        const pz = a * Math.sin(th) * Math.cos(th);
        const vx = a * Math.cos(th);
        const vz = a * (Math.cos(th) * Math.cos(th) - Math.sin(th) * Math.sin(th));
        const yawDeg = (Math.atan2(vx, vz) * 180) / Math.PI + forwardYawOffset;
        const leanDeg = isTwoWheeler ? (10 * Math.sin(th)) : 0;
        kfs.push({
          time: Math.round(frac * duration * 1000) / 1000,
          boneName: '__root__',
          rot: composeRootRot(yawDeg, leanDeg),
          pos: {
            x: Math.round(px * 1000) / 1000,
            y: 0,
            z: Math.round(pz * 1000) / 1000
          }
        });
      }
      explanation = `Đã tạo quỹ đạo chạy hình số 8 rộng ${Number((halfSpan * 2).toFixed(1))}m (${duration}s)${wheelNote}.`;
    } else {
      // Chạy thẳng
      const distMeters = radiusMeters;
      if (!duration || !Number.isFinite(duration)) {
        duration = Math.max(2.5, Math.min(15.0, Math.round((distMeters / 3.5) * 10) / 10));
      }
      duration = Math.max(1.0, Math.min(60, duration));
      const halfLocal = (distMeters * 0.5) * meterScale;
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const d = -halfLocal + frac * (halfLocal * 2);
        kfs.push({
          time: Math.round(frac * duration * 1000) / 1000,
          boneName: '__root__',
          rot: { x: 0, y: 0, z: 0 },
          pos: forwardAxis === '+x'
            ? { x: Math.round(d * 1000) / 1000, y: 0, z: 0 }
            : { x: 0, y: 0, z: Math.round(d * 1000) / 1000 }
        });
      }
      explanation = `Đã tạo quỹ đạo chạy thẳng ${Number(distMeters.toFixed(1))}m (${duration}s)${wheelNote}.`;
    }

    const count = this.applyGeneratedBoneTimeline(propId, {
      duration,
      loop: true,
      keyframes: kfs
    });
    return count > 0 ? { count, duration, explanation } : null;
  }

  /**
   * Tổng hợp chuyển động di chuyển thực tế trong không gian 3D cho NHÂN VẬT CÓ XƯƠNG (Humanoid Locomotion):
   * - Hỗ trợ: "Đi bộ 10m rồi quay đầu lại đi bộ 10m", "đi thẳng 8m", "chạy 15m rồi quay lại", "đi bộ/chạy vòng tròn rộng 10m", "đi bộ hình số 8".
   * - Di chuyển toàn bộ nhân vật trên `__root__` đúng số mét yêu cầu + xoay đầu mượt 180° khi quay lại.
   * - Tự động tận dụng clip đi bộ/chạy gốc nhúng sẵn trong GLB (nếu nhân vật có sẵn như Meshy Walking) để bước chân tự nhiên như mocap,
   *   hoặc tự sinh chu kỳ sải chân/đánh tay đồng bộ theo đúng vận tốc di chuyển (không bị đi bộ tại chỗ!).
   */
  tryGenerateHumanoidLocomotionMotion(
    propId: string,
    promptText: string,
    preferredDuration?: number
  ): { count: number; duration: number; explanation: string } | null {
    const rig = this._propRigMap.get(propId);
    if (!rig || !rig.hasSkinnedSkeleton) return null;
    const raw = (promptText || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();

    const isWalkOrRun = /đi\s*bộ|di\s*bo|đi\s*thẳng|di\s*thang|đi\s*tới|đi\s*lại|bước\s*đi|dạo\s*bước|walk|chạy|chay|run\b|jog/.test(lower);
    if (!isWalkOrRun) return null;

    const isTurnAround = /quay\s*đầu|quay\s*dau|quay\s*lại|quay\s*lai|vòng\s*lại|vong\s*lai|trở\s*lại|tro\s*lai|đi\s*lại|chạy\s*về|đi\s*về|turn\s*around|come\s*back|back\s*and\s*forth/.test(lower);
    const isCircle = /vòng\s*tròn|vong\s*tron|chạy\s*tròn|đi\s*tròn|circle|orbit/.test(lower);
    const isFigure8 = /số\s*8|so\s*8|figure[\s-]*8/.test(lower);
    const meterMatches = Array.from(lower.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m|mét|met)(?:\b|$)/gi))
      .map((m) => parseFloat(m[1].replace(',', '.')))
      .filter((n) => Number.isFinite(n) && n > 0);
    const hasStraightCue = /thẳng|thang|tiến\s*lên|straight/.test(lower);

    // Chỉ kích hoạt khi người dùng thực sự muốn di chuyển có quãng đường / quỹ đạo / quay đầu (không chặn đi bộ tại chỗ nếu cố tình ghi "tại chỗ")
    if (/tại\s*chỗ|tai\s*cho|in[\s-]*place/.test(lower)) return null;
    if (!isTurnAround && !isCircle && !isFigure8 && meterMatches.length === 0 && !hasStraightCue) {
      return null;
    }

    const isRun = /chạy|chay|run\b|jog/.test(lower) && !/đi\s*bộ|di\s*bo|walk/.test(lower);
    const meterScale = rig.meterScale || 1;

    // Kiểm tra xem nhân vật có sẵn clip đi bộ/chạy nhúng trong GLB để tái sử dụng dáng đi mocap thật hay không
    const embeddedClips = rig.clips.filter((c) => !c.isCustomKeyframeClip && !!c.resource);
    let embeddedGaitClip = embeddedClips.find((c) => {
      const n = String(c.name || '').toLowerCase();
      return isRun ? /run|jog|sprint/.test(n) : /walk|stride|stroll/.test(n);
    });
    if (!embeddedGaitClip && embeddedClips.length === 1) {
      const propNameLower = String(rig.propId || '').toLowerCase();
      if ((isRun && /run|jog/.test(propNameLower)) || (!isRun && /walk/.test(propNameLower))) {
        embeddedGaitClip = embeddedClips[0];
      }
    }

    let extractedBaseCycle: GlbSavedKeyframeClip | null = null;
    if (embeddedGaitClip) {
      try {
        extractedBaseCycle = this.extractPortableClip(propId, embeddedGaitClip.name);
      } catch (_) {
        extractedBaseCycle = null;
      }
    }

    const cycleDur = extractedBaseCycle
      ? Math.max(0.45, Math.min(2.5, Number(extractedBaseCycle.duration) || 1.07))
      : (isRun ? 0.72 : 1.05);
    // Vận tốc đồng bộ theo đúng độ dài sải chân 1 chu kỳ (2 bước ~ 1.42m đi bộ, ~ 2.4m chạy) để tránh trượt chân
    const speedMps = isRun ? (2.4 / cycleDur) : (1.42 / cycleDur);

    const kfs: Array<{
      time: number;
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos?: { x: number; y: number; z: number };
    }> = [];

    let totalDur = 0;
    let explanation = '';
    const durMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:giây|giay|sec|s\b)/i);
    const forcedDur = durMatch ? parseFloat(durMatch[1].replace(',', '.')) : 0;
    const snapToCycles = (rawSec: number, minCycles = 2): number => {
      if (forcedDur > 0) return Math.max(1.0, Math.min(58.0, Math.round(forcedDur * 100) / 100));
      const clamped = Math.max(cycleDur * minCycles, Math.min(56.0, rawSec));
      const nCyc = Math.max(minCycles, Math.round(clamped / cycleDur));
      return Math.round(Math.min(58.0, nCyc * cycleDur) * 100) / 100;
    };

    if (isCircle) {
      const radiusMatch = lower.match(/(?:bán\s*kính|ban\s*kinh|radius|\br\s*=)\s*(\d+(?:[.,]\d+)?)\s*(?:m|mét|met)?/i);
      let radiusMeters = radiusMatch
        ? parseFloat(radiusMatch[1].replace(',', '.'))
        : (meterMatches.length > 0 ? meterMatches[0] / 2 : 4.0);
      radiusMeters = Math.max(0.8, Math.min(50, radiusMeters));
      const circ = 2 * Math.PI * radiusMeters;
      totalDur = snapToCycles(Math.max(4.0, circ / speedMps), 3);
      const turnLeft = /ngược\s*chiều|nguoc\s*chieu|bên\s*trái|sang\s*trái|ccw/.test(lower);
      const dir = turnLeft ? -1 : 1;
      const rLocal = radiusMeters * meterScale;
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const theta = frac * Math.PI * 2 * dir;
        const px = rLocal * Math.cos(theta);
        const pz = rLocal * Math.sin(theta);
        const vx = -dir * Math.sin(theta);
        const vz = dir * Math.cos(theta);
        const yawDeg = (Math.atan2(vx, vz) * 180) / Math.PI;
        kfs.push({
          time: Math.round(frac * totalDur * 1000) / 1000,
          boneName: '__root__',
          rot: { x: 0, y: Math.round(yawDeg * 100) / 100, z: 0 },
          pos: { x: Math.round(px * 1000) / 1000, y: 0, z: Math.round(pz * 1000) / 1000 }
        });
      }
      explanation = `Đã tạo chuyển động ${isRun ? 'chạy' : 'đi bộ'} vòng tròn đường kính ${Number((radiusMeters * 2).toFixed(1))}m (${totalDur}s) với bước chân đồng bộ trên sàn.`;
    } else if (isFigure8) {
      const halfSpan = Math.max(1.5, Math.min(35, meterMatches.length > 0 ? meterMatches[0] / 2 : 5.0));
      const approxLen = halfSpan * 6.0;
      totalDur = snapToCycles(Math.max(5.0, approxLen / speedMps), 4);
      const a = halfSpan * meterScale;
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const th = frac * Math.PI * 2;
        const px = a * Math.sin(th);
        const pz = a * Math.sin(th) * Math.cos(th);
        const vx = a * Math.cos(th);
        const vz = a * (Math.cos(th) * Math.cos(th) - Math.sin(th) * Math.sin(th));
        const yawDeg = (Math.atan2(vx, vz) * 180) / Math.PI;
        kfs.push({
          time: Math.round(frac * totalDur * 1000) / 1000,
          boneName: '__root__',
          rot: { x: 0, y: Math.round(yawDeg * 100) / 100, z: 0 },
          pos: { x: Math.round(px * 1000) / 1000, y: 0, z: Math.round(pz * 1000) / 1000 }
        });
      }
      explanation = `Đã tạo chuyển động ${isRun ? 'chạy' : 'đi bộ'} hình số 8 rộng ${Number((halfSpan * 2).toFixed(1))}m (${totalDur}s).`;
    } else if (isTurnAround) {
      // Đi thẳng d1 mét -> quay đầu mượt 180° -> đi về d2 mét -> quay đầu mượt 180° khép vòng lặp
      const d1 = Math.max(1.0, Math.min(60, meterMatches[0] || 10.0));
      const d2 = Math.max(1.0, Math.min(60, meterMatches[1] || d1));
      let tTurn1 = 0.85;
      let tTurn2 = Math.abs(d1 - d2) < 0.25 ? 0.85 : 0;
      let tLeg1 = Math.max(1.0, d1 / speedMps);
      let tLeg2 = Math.max(1.0, d2 / speedMps);
      const rawSum = tLeg1 + tTurn1 + tLeg2 + tTurn2;
      totalDur = snapToCycles(rawSum, 3);
      const scaleTime = totalDur / Math.max(0.1, rawSum);
      tLeg1 *= scaleTime;
      tTurn1 *= scaleTime;
      tLeg2 *= scaleTime;
      tTurn2 *= scaleTime;
      const zEnd1 = d1 * meterScale;
      const zEnd2 = (d1 - d2) * meterScale;

      const pushRoot = (t: number, z: number, yaw: number) => {
        kfs.push({
          time: Math.round(Math.max(0, Math.min(totalDur, t)) * 1000) / 1000,
          boneName: '__root__',
          rot: { x: 0, y: yaw, z: 0 },
          pos: { x: 0, y: 0, z: Math.round(z * 1000) / 1000 }
        });
      };

      // Chặng 1: đi thẳng từ 0 -> +d1 (hướng +Z, yaw = 0°)
      const leg1Steps = Math.max(8, Math.min(24, Math.ceil(d1)));
      for (let i = 0; i <= leg1Steps; i++) {
        const f = i / leg1Steps;
        pushRoot(f * tLeg1, f * zEnd1, 0);
      }

      // Quay đầu mượt 180° (6 bước, mỗi bước 30° để SLERP quay thuận 1 chiều liên tục)
      const turn1Start = tLeg1;
      for (let i = 1; i <= 6; i++) {
        const f = i / 6;
        pushRoot(turn1Start + f * tTurn1, zEnd1, Math.round(f * 180 * 10) / 10);
      }

      // Chặng 2: quay đầu đi về từ +d1 -> +(d1 - d2) (hướng -Z, yaw = 180°)
      const leg2Start = tLeg1 + tTurn1;
      const leg2Steps = Math.max(8, Math.min(24, Math.ceil(d2)));
      for (let i = 1; i <= leg2Steps; i++) {
        const f = i / leg2Steps;
        pushRoot(leg2Start + f * tLeg2, zEnd1 + f * (zEnd2 - zEnd1), 180);
      }

      // Nếu quay lại đúng điểm xuất phát (d1 ≈ d2): quay thêm 180° mượt để khép vòng lặp liên tục
      if (tTurn2 > 0) {
        const turn2Start = leg2Start + tLeg2;
        for (let i = 1; i <= 6; i++) {
          const f = i / 6;
          const tVal = i === 6 ? totalDur : turn2Start + f * tTurn2;
          pushRoot(tVal, zEnd2, Math.round((180 + f * 180) * 10) / 10);
        }
      }

      explanation = `Đã tạo chuyển động ${isRun ? 'chạy' : 'đi bộ'} ${Number(d1.toFixed(1))}m rồi quay đầu ${isRun ? 'chạy' : 'đi bộ'} lại ${Number(d2.toFixed(1))}m (${totalDur}s)${extractedBaseCycle ? ' kết hợp dáng đi mocap gốc của nhân vật' : ''}.`;
    } else {
      // Đi thẳng 1 chiều d1 mét
      const d1 = Math.max(1.0, Math.min(60, meterMatches[0] || 10.0));
      totalDur = snapToCycles(Math.max(1.5, d1 / speedMps), 2);
      const zEnd = d1 * meterScale;
      const steps = Math.max(12, Math.min(28, Math.ceil(d1 * 1.5)));
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        kfs.push({
          time: Math.round(f * totalDur * 1000) / 1000,
          boneName: '__root__',
          rot: { x: 0, y: 0, z: 0 },
          pos: { x: 0, y: 0, z: Math.round(f * zEnd * 1000) / 1000 }
        });
      }
      explanation = `Đã tạo chuyển động ${isRun ? 'chạy' : 'đi bộ'} thẳng ${Number(d1.toFixed(1))}m (${totalDur}s)${extractedBaseCycle ? ' kết hợp dáng đi mocap gốc của nhân vật' : ''}.`;
    }

    // Ghép lớp chuyển động thân/chân/tay đồng bộ với quãng đường trên __root__
    if (extractedBaseCycle && Array.isArray(extractedBaseCycle.keyframes) && extractedBaseCycle.keyframes.length > 0) {
      // Nhóm keyframe 1 chu kỳ theo mốc thời gian và lấy mẫu gọn (8-10 mốc/chu kỳ) để vừa nhẹ dữ liệu vừa mượt tuyệt đối
      const byTime = new Map<number, GlbBoneKeyframe[]>();
      for (const bk of extractedBaseCycle.keyframes) {
        if (!bk || bk.boneName === '__root__') continue;
        const ms = Math.round((Number(bk.time) || 0) * 1000);
        if (!byTime.has(ms)) byTime.set(ms, []);
        byTime.get(ms)!.push(bk);
      }
      const uniqueMs = Array.from(byTime.keys()).sort((a, b) => a - b);
      const estCycles = Math.max(1, Math.round(totalDur / cycleDur));
      const targetFramesPerCycle = estCycles >= 8 ? 8 : 10;
      const strideStep = uniqueMs.length > targetFramesPerCycle + 2 ? Math.ceil(uniqueMs.length / targetFramesPerCycle) : 1;
      const pickedMs: number[] = [];
      for (let idx = 0; idx < uniqueMs.length; idx += strideStep) {
        pickedMs.push(uniqueMs[idx]);
      }

      const numCycles = Math.ceil(totalDur / cycleDur) + 1;
      const lastWrittenMsByBone = new Map<string, number>();

      for (let cyc = 0; cyc < numCycles; cyc++) {
        const baseT = cyc * cycleDur;
        if (baseT > totalDur + 0.005) break;
        const nextCycleStart = (cyc + 1) * cycleDur;
        for (const ms of pickedMs) {
          const localSec = ms / 1000;
          // Tránh trùng mốc cuối chu kỳ trước với mốc 0 chu kỳ sau (gây nhân đôi quaternion)
          if (localSec >= cycleDur - 0.025 && cyc < numCycles - 1) continue;
          const absT = Math.min(totalDur, baseT + localSec);
          const absMs = Math.round(absT * 1000);
          if (absT > totalDur + 0.002) break;
          const frameList = byTime.get(ms) || [];
          for (const bk of frameList) {
            const prevMs = lastWrittenMsByBone.get(bk.boneName);
            if (prevMs !== undefined && Math.abs(absMs - prevMs) < 15) continue;
            lastWrittenMsByBone.set(bk.boneName, absMs);
            kfs.push({
              time: Math.round(absT * 1000) / 1000,
              boneName: bk.boneName,
              rot: { x: bk.rot.x, y: bk.rot.y, z: bk.rot.z },
              pos: bk.pos ? { x: 0, y: bk.pos.y || 0, z: 0 } : { x: 0, y: 0, z: 0 }
            });
          }
          if (absT >= totalDur - 0.005) break;
        }
        if (nextCycleStart > totalDur) break;
      }

      // Khép mốc cuối tại đúng t = totalDur theo frame mở đầu chu kỳ (phase 0) để lặp lại hoàn toàn liền mạch
      const firstFrameList = pickedMs.length > 0 ? (byTime.get(pickedMs[0]) || []) : [];
      const endMs = Math.round(totalDur * 1000);
      for (const bk of firstFrameList) {
        const prevMs = lastWrittenMsByBone.get(bk.boneName);
        if (prevMs !== undefined && Math.abs(endMs - prevMs) < 15) continue;
        lastWrittenMsByBone.set(bk.boneName, endMs);
        kfs.push({
          time: totalDur,
          boneName: bk.boneName,
          rot: { x: bk.rot.x, y: bk.rot.y, z: bk.rot.z },
          pos: bk.pos ? { x: 0, y: bk.pos.y || 0, z: 0 } : { x: 0, y: 0, z: 0 }
        });
      }

      const count = this.applyGeneratedBoneTimeline(propId, {
        duration: totalDur,
        loop: true,
        poseSpace: extractedBaseCycle.poseSpace || 'tpose',
        keyframes: kfs
      });
      return count > 0 ? { count, duration: totalDur, explanation } : null;
    }

    // Fallback cho nhân vật không có sẵn clip đi bộ nhúng trong GLB: sinh chu kỳ bước chân procedural mượt đồng bộ theo tốc độ
    const anat = this._resolveRigAnatomy(rig);
    const swing = isRun ? 48 : 34;
    const wholeCycles = Math.max(1, Math.round(totalDur / cycleDur));
    const stepsPerCycle = 8;
    const totalSteps = wholeCycles * stepsPerCycle;
    const pushLimb = (boneName: string, t: number, rx: number, ry: number, rz: number, py = 0) => {
      if (!boneName || boneName === '__root__') return;
      kfs.push({
        time: Math.round(t * 1000) / 1000,
        boneName,
        rot: { x: Math.round(rx * 10) / 10, y: Math.round(ry * 10) / 10, z: Math.round(rz * 10) / 10 },
        pos: { x: 0, y: Math.round(py * 1000) / 1000, z: 0 }
      });
    };

    for (let i = 0; i <= totalSteps; i++) {
      const t = i === totalSteps ? totalDur : (i / totalSteps) * totalDur;
      const phase = (i / totalSteps) * wholeCycles * Math.PI * 2;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pushLimb(anat.hips, t, isRun ? 10 : 3, s * 7, c * 3, Math.abs(c) * (isRun ? 0.1 : 0.04));
      pushLimb(anat.lowerSpine, t, isRun ? 8 : 3, -s * 8, 0);
      if (anat.chest !== anat.lowerSpine) pushLimb(anat.chest, t, isRun ? 6 : 2, -s * 6, 0);
      if (anat.head !== anat.chest) pushLimb(anat.head, t, isRun ? -6 : 0, s * 4, 0);
      pushLimb(anat.lUpLeg, t, -s * swing, 0, 0);
      pushLimb(anat.rUpLeg, t, s * swing, 0, 0);
      if (anat.lLeg !== anat.lUpLeg) pushLimb(anat.lLeg, t, (s < 0 ? -s : 0.18) * (swing * 1.08), 0, 0);
      if (anat.rLeg !== anat.rUpLeg) pushLimb(anat.rLeg, t, (s > 0 ? s : 0.18) * (swing * 1.08), 0, 0);
      if (anat.lFoot !== anat.lLeg) pushLimb(anat.lFoot, t, s > 0 ? -12 * s : 14 * (-s), 0, 0);
      if (anat.rFoot !== anat.rLeg) pushLimb(anat.rFoot, t, s < 0 ? 12 * s : 14 * s, 0, 0);
      pushLimb(anat.lArm, t, s * (swing * 0.72), 0, -16);
      pushLimb(anat.rArm, t, -s * (swing * 0.72), 0, 16);
      if (anat.lForeArm !== anat.lArm) pushLimb(anat.lForeArm, t, isRun ? -65 : -24, 0, 0);
      if (anat.rForeArm !== anat.rArm) pushLimb(anat.rForeArm, t, isRun ? -65 : -24, 0, 0);
    }

    const count = this.applyGeneratedBoneTimeline(propId, {
      duration: totalDur,
      loop: true,
      poseSpace: 'rest',
      keyframes: kfs
    });
    return count > 0 ? { count, duration: totalDur, explanation } : null;
  }

  generateSmartBoneMotion(
    propId: string,
    promptText: string,
    duration = 2.4,
    frameEnergies: number[] = [],
    poseSamples: VideoFramePoseSample[] = []
  ): number {
    const rig = this._propRigMap.get(propId);
    if (!rig) return 0;

    // Với mô hình cứng / phương tiện không có xương khớp (xe đạp, ô tô, đồ vật), ưu tiên bộ tạo quỹ đạo chuẩn vật lý trên __root__
    if (!rig.hasSkinnedSkeleton) {
      const rigidRes = this.tryGenerateRigidPathMotion(propId, promptText, duration);
      if (rigidRes) return rigidRes.count;
      // Fallback an toàn cho vật thể cứng: chỉ chuyển động nhẹ trên __root__, tuyệt đối không xoay các sub-mesh làm vỡ cấu trúc
      const safeDur = Math.max(1.5, Math.min(20.0, Number(duration) || 3.0));
      return this.applyGeneratedBoneTimeline(propId, {
        duration: safeDur,
        loop: true,
        keyframes: [
          { time: 0, boneName: '__root__', rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { time: safeDur * 0.25, boneName: '__root__', rot: { x: 0, y: 90, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { time: safeDur * 0.5, boneName: '__root__', rot: { x: 0, y: 180, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { time: safeDur * 0.75, boneName: '__root__', rot: { x: 0, y: 270, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
          { time: safeDur, boneName: '__root__', rot: { x: 0, y: 360, z: 0 }, pos: { x: 0, y: 0, z: 0 } }
        ]
      });
    }

    // Với nhân vật có xương yêu cầu đi bộ / chạy có quãng đường, quay đầu hoặc quỹ đạo (vòng tròn, thẳng, số 8):
    // di chuyển thực tế trên __root__ thay vì đi bộ tại chỗ!
    if (!poseSamples || poseSamples.length < 3) {
      const locoRes = this.tryGenerateHumanoidLocomotionMotion(propId, promptText, duration);
      if (locoRes) return locoRes.count;
    }

    const cleanPrompt = (promptText || '').trim();
    const lower = cleanPrompt.toLowerCase();

    // Nếu có dữ liệu trích xuất tư thế từ Video mẫu và người dùng không ép một động tác đơn lẻ đối lập,
    // ưu tiên tái tạo chuyển động bám sát từng khung hình của Video mẫu
    const hasSpecificActionKeyword =
      /moonwalk|trượt|đá|kick|taekwondo|karate|đấm|boxing|punch|võ|kungfu|vẫy|wave|cúi|chào|bow|bật nhảy|nhảy cao|jump|ngồi|squat|thụt dầu|xoay người|quay người|spin|giơ tay|ăn mừng|cheer|vỗ tay|clap|gật đầu|nod|lắc đầu|shake|đi bộ|walk|chạy|run|thuyết trình|nói chuyện|tạo dáng|pose|nhảy|dance|hiphop/.test(
        lower
      );
    if (poseSamples && poseSamples.length >= 3 && (!cleanPrompt || /video|bắt chước|mẫu|\.mp4|\.webm|\.mov/i.test(cleanPrompt) || !hasSpecificActionKeyword)) {
      return this.synthesizeVideoPoseBoneMotion(propId, poseSamples, duration, cleanPrompt);
    }

    const anat = this._resolveRigAnatomy(rig);
    const dur = Math.max(1.0, Math.min(20.0, Number(duration) || 2.4));
    const kfs: Array<{
      time: number;
      boneName: string;
      rot: { x: number; y: number; z: number };
      pos?: { x: number; y: number; z: number };
    }> = [];

    const push = (boneName: string, time: number, rx: number, ry: number, rz: number, py = 0, px = 0, pz = 0) => {
      if (!boneName) return;
      kfs.push({
        time: Math.round(time * 100) / 100,
        boneName,
        rot: { x: Math.round(rx * 10) / 10, y: Math.round(ry * 10) / 10, z: Math.round(rz * 10) / 10 },
        pos: {
          x: Math.round(px * 100) / 100,
          y: Math.round(py * 100) / 100,
          z: Math.round(pz * 100) / 100
        }
      });
    };

    const setRestPoseAt = (t: number) => {
      push(anat.hips, t, 0, 0, 0, 0, 0, 0);
      push(anat.lowerSpine, t, 0, 0, 0);
      if (anat.midSpine !== anat.lowerSpine) push(anat.midSpine, t, 0, 0, 0);
      if (anat.chest !== anat.midSpine) push(anat.chest, t, 0, 0, 0);
      if (anat.neck !== anat.chest) push(anat.neck, t, 0, 0, 0);
      if (anat.head !== anat.neck) push(anat.head, t, 0, 0, 0);
      push(anat.lArm, t, 0, 0, -18);
      push(anat.rArm, t, 0, 0, 18);
      if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -10, 0, 0);
      if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -10, 0, 0);
      push(anat.lUpLeg, t, 0, 0, 0);
      push(anat.rUpLeg, t, 0, 0, 0);
      if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, t, 0, 0, 0);
      if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, t, 0, 0, 0);
      if (anat.lFoot !== anat.lLeg) push(anat.lFoot, t, 0, 0, 0);
      if (anat.rFoot !== anat.rLeg) push(anat.rFoot, t, 0, 0, 0);
    };

    const energyBoost = frameEnergies.length > 0
      ? Math.max(0.85, Math.min(1.35, frameEnergies.reduce((a, b) => a + b, 0) / frameEnergies.length))
      : 1.0;

    // Tách chuỗi hành động nếu người dùng mô tả nhiều bước liên tiếp ("vẫy tay rồi cúi chào", "đấm sau đó đá")
    const rawClauses = lower
      .split(/\s+(?:rồi|sau đó|tiếp theo|xong|và|then|and then)\s+|[,;]+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const clauses = rawClauses.length > 0 ? rawClauses : [lower];

    const buildClauseSegment = (clause: string, tStart: number, tEnd: number) => {
      const segDur = Math.max(0.4, tEnd - tStart);
      const at = (r: number) => tStart + segDur * r;
      const useLeftOnly = /trái|left/.test(clause) && !/phải|right|hai|cả/.test(clause);
      const useRightOnly = /phải|right/.test(clause) && !/trái|left|hai|cả/.test(clause);
      const useBothSides = /hai|2|cả hai|both/.test(clause);

      setRestPoseAt(tStart);

      if (/moonwalk|trượt|michael jackson|glide/.test(clause)) {
        // Moonwalk: xoay ngang thân 78 độ, lướt lùi từ phải qua trái kèm miết mũi chân & gập gối luân phiên
        const steps = 6;
        for (let i = 1; i < steps; i++) {
          const r = i / steps;
          const t = at(r);
          const phase = r * Math.PI * 2;
          const s = Math.sin(phase);
          const slideX = 0.28 - r * 0.56;
          push(anat.hips, t, 4, -78, 0, -0.03 * Math.abs(s), slideX, 0);
          push(anat.lowerSpine, t, 6, 0, 0);
          push(anat.chest, t, 8, 0, 0);
          push(anat.head, t, 18, 0, 0);
          push(anat.lUpLeg, t, s * 28, 0, 0);
          push(anat.rUpLeg, t, -s * 28, 0, 0);
          if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, t, s > 0 ? 45 * s : 5, 0, 0);
          if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, t, s < 0 ? 45 * -s : 5, 0, 0);
          if (anat.lFoot !== anat.lLeg) push(anat.lFoot, t, s > 0 ? 25 * s : -10, 0, 0);
          if (anat.rFoot !== anat.rLeg) push(anat.rFoot, t, s < 0 ? 25 * -s : -10, 0, 0);
          push(anat.lArm, t, -s * 22, 0, -16);
          push(anat.rArm, t, s * 22, 0, 16);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -25, 0, 0);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -25, 0, 0);
        }
      } else if (/đá|kick|taekwondo|karate|vung chân/.test(clause)) {
        const kickLeft = useLeftOnly;
        const kickUpLeg = kickLeft ? anat.lUpLeg : anat.rUpLeg;
        const kickKnee = kickLeft ? anat.lLeg : anat.rLeg;
        const supportUpLeg = kickLeft ? anat.rUpLeg : anat.lUpLeg;
        const supportKnee = kickLeft ? anat.rLeg : anat.lLeg;
        const turnSign = kickLeft ? -1 : 1;

        // 1. Co gối lấy đà (chamber)
        push(anat.hips, at(0.25), -10, turnSign * 18, -turnSign * 8, -0.05);
        push(anat.lowerSpine, at(0.25), -8, -turnSign * 10, -turnSign * 6);
        push(kickUpLeg, at(0.25), -65 * energyBoost, 0, 0);
        if (kickKnee !== kickUpLeg) push(kickKnee, at(0.25), 85, 0, 0);
        push(supportUpLeg, at(0.25), -12, 0, 0);
        if (supportKnee !== supportUpLeg) push(supportKnee, at(0.25), 18, 0, 0);
        push(anat.lArm, at(0.25), -45, 15, -10);
        push(anat.rArm, at(0.25), -45, -15, 10);
        if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, at(0.25), -75, 0, 0);
        if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.25), -75, 0, 0);

        // 2. Tung cú đá thẳng lên cao (extension peak)
        push(anat.hips, at(0.52), -22, turnSign * 32, -turnSign * 14, 0.08);
        push(anat.lowerSpine, at(0.52), -16, -turnSign * 18, -turnSign * 10);
        push(anat.chest, at(0.52), -10, -turnSign * 12, 0);
        push(kickUpLeg, at(0.52), -98 * energyBoost, -turnSign * 12, turnSign * 15);
        if (kickKnee !== kickUpLeg) push(kickKnee, at(0.52), 6, 0, 0);
        push(supportUpLeg, at(0.52), 10, 0, 0);
        if (supportKnee !== supportUpLeg) push(supportKnee, at(0.52), 12, 0, 0);
        push(anat.lArm, at(0.52), kickLeft ? 25 : -55, 20, 15);
        push(anat.rArm, at(0.52), kickLeft ? -55 : 25, -20, -15);

        // 3. Thu chân hạ thế (rechamber)
        push(anat.hips, at(0.78), -8, turnSign * 12, 0, -0.03);
        push(kickUpLeg, at(0.78), -45, 0, 0);
        if (kickKnee !== kickUpLeg) push(kickKnee, at(0.78), 60, 0, 0);
      } else if (/đấm|boxing|punch|chiến đấu|combat|võ|kungfu/.test(clause)) {
        // Thủ thế võ thuật + tung liên hoàn đấm trái (Jab) & đấm phải (Cross)
        push(anat.hips, at(0.15), 6, -18, 0, -0.06);
        push(anat.lowerSpine, at(0.15), 10, -12, 0);
        push(anat.lUpLeg, at(0.15), -22, 0, 0, 0);
        push(anat.rUpLeg, at(0.15), 16, 0, 0, 0);
        if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, at(0.15), 28, 0, 0);
        if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, at(0.15), 22, 0, 0);
        push(anat.lArm, at(0.15), -45, 15, -15);
        push(anat.rArm, at(0.15), -45, -15, 15);
        if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, at(0.15), -85, 0, -15);
        if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.15), -85, 0, 15);

        // Đấm thẳng tay trái (Left Jab)
        if (!useRightOnly) {
          push(anat.hips, at(0.4), 8, 22, 0, -0.04, 0, 0.06);
          push(anat.lowerSpine, at(0.4), 12, 26, 0);
          push(anat.chest, at(0.4), 8, 20, 0);
          push(anat.head, at(0.4), 5, -25, 0);
          push(anat.lArm, at(0.4), -88 * energyBoost, -18, 10);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, at(0.4), -8, 0, 0);
          push(anat.rArm, at(0.4), -40, -18, 18);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.4), -90, 0, 20);
        }

        // Đấm móc/thẳng tay phải (Right Cross)
        if (!useLeftOnly) {
          push(anat.hips, at(0.72), 10, -28, 0, -0.05, 0, 0.08);
          push(anat.lowerSpine, at(0.72), 14, -32, 0);
          push(anat.chest, at(0.72), 10, -24, 0);
          push(anat.head, at(0.72), 5, 28, 0);
          push(anat.rArm, at(0.72), -92 * energyBoost, 18, -10);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.72), -8, 0, 0);
          push(anat.lArm, at(0.72), -40, 18, -18);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, at(0.72), -90, 0, -20);
        }
      } else if (/vẫy|wave|tạm biệt|bye|hi\b|hello/.test(clause)) {
        const waveLeft = useLeftOnly || useBothSides;
        const waveRight = !useLeftOnly || useBothSides;
        const times = [at(0.25), at(0.45), at(0.65), at(0.85)];
        times.forEach((t, idx) => {
          const swing = idx % 2 === 0 ? 1 : -1;
          push(anat.chest, t, -3, waveLeft && !waveRight ? 6 : -6, swing * 4);
          push(anat.head, t, -5, swing * 8, swing * 6);
          if (waveRight) {
            push(anat.rArm, t, -35, 0, -68 + swing * 12);
            if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -58, 0, swing * 28);
          }
          if (waveLeft) {
            push(anat.lArm, t, -35, 0, 68 + swing * 12);
            if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -58, 0, swing * 28);
          }
        });
      } else if (/cúi|chào|bow|cảm ơn|kính lễ/.test(clause)) {
        push(anat.hips, at(0.35), 18, 0, 0, -0.04, 0, -0.06);
        push(anat.lowerSpine, at(0.35), 22 * energyBoost, 0, 0);
        push(anat.midSpine, at(0.35), 18 * energyBoost, 0, 0);
        push(anat.chest, at(0.35), 16 * energyBoost, 0, 0);
        push(anat.neck, at(0.35), 12, 0, 0);
        push(anat.head, at(0.35), 18, 0, 0);
        push(anat.lArm, at(0.35), -15, 10, -22);
        push(anat.rArm, at(0.35), -25, -20, 24);
        if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.35), -65, 0, 35);

        push(anat.hips, at(0.62), 20, 0, 0, -0.04, 0, -0.06);
        push(anat.lowerSpine, at(0.62), 25 * energyBoost, 0, 0);
        push(anat.midSpine, at(0.62), 20 * energyBoost, 0, 0);
        push(anat.chest, at(0.62), 18 * energyBoost, 0, 0);
        push(anat.head, at(0.62), 22, 0, 0);
        push(anat.rArm, at(0.62), -25, -20, 24);
        if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.62), -65, 0, 35);
      } else if (/bật nhảy|nhảy cao|nhảy lên|jump|jumping jack/.test(clause)) {
        // 1. Nhún gối lấy đà (Anticipation crouch)
        push(anat.hips, at(0.22), 16, 0, 0, -0.22);
        push(anat.lowerSpine, at(0.22), 18, 0, 0);
        push(anat.lUpLeg, at(0.22), -55, 0, 0);
        push(anat.rUpLeg, at(0.22), -55, 0, 0);
        if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, at(0.22), 72, 0, 0);
        if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, at(0.22), 72, 0, 0);
        push(anat.lArm, at(0.22), 25, 0, -15);
        push(anat.rArm, at(0.22), 25, 0, 15);

        // 2. Bật tung lên không trung, vung 2 tay lên cao (Airborne peak)
        push(anat.hips, at(0.5), -8, 0, 0, 0.34 * energyBoost);
        push(anat.lowerSpine, at(0.5), -10, 0, 0);
        push(anat.head, at(0.5), -12, 0, 0);
        push(anat.lUpLeg, at(0.5), -18, 0, 14);
        push(anat.rUpLeg, at(0.5), -18, 0, -14);
        if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, at(0.5), 22, 0, 0);
        if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, at(0.5), 22, 0, 0);
        push(anat.lArm, at(0.5), -40, 0, 72);
        push(anat.rArm, at(0.5), -40, 0, -72);
        if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, at(0.5), -25, 0, 0);
        if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(0.5), -25, 0, 0);

        // 3. Tiếp đất nhún giảm chấn (Landing absorb)
        push(anat.hips, at(0.78), 14, 0, 0, -0.18);
        push(anat.lowerSpine, at(0.78), 15, 0, 0);
        push(anat.lUpLeg, at(0.78), -48, 0, 0);
        push(anat.rUpLeg, at(0.78), -48, 0, 0);
        if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, at(0.78), 64, 0, 0);
        if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, at(0.78), 64, 0, 0);
        push(anat.lArm, at(0.78), -20, 0, 5);
        push(anat.rArm, at(0.78), -20, 0, -5);
      } else if (/ngồi|squat|thụt dầu|nhún sâu|cúi nhặt/.test(clause)) {
        for (const r of [0.35, 0.65]) {
          push(anat.hips, at(r), 15, 0, 0, -0.34, 0, -0.05);
          push(anat.lowerSpine, at(r), 20, 0, 0);
          push(anat.chest, at(r), 12, 0, 0);
          push(anat.head, at(r), -14, 0, 0);
          push(anat.lUpLeg, at(r), -82, 0, 8);
          push(anat.rUpLeg, at(r), -82, 0, -8);
          if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, at(r), 88, 0, 0);
          if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, at(r), 88, 0, 0);
          if (anat.lFoot !== anat.lLeg) push(anat.lFoot, at(r), -18, 0, 0);
          if (anat.rFoot !== anat.rLeg) push(anat.rFoot, at(r), -18, 0, 0);
          push(anat.lArm, at(r), -68, 0, -10);
          push(anat.rArm, at(r), -68, 0, 10);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, at(r), -25, 0, 0);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, at(r), -25, 0, 0);
        }
      } else if (/xoay người|quay người|xoay vòng|quay vòng|spin|turn/.test(clause)) {
        const dir = useLeftOnly ? -1 : 1;
        const angles = [0, 90 * dir, 180 * dir, -90 * dir, 0];
        angles.forEach((ang, idx) => {
          if (idx === 0 || idx === angles.length - 1) return;
          const r = idx / (angles.length - 1);
          const t = at(r);
          push(anat.hips, t, 0, ang, 0, 0.05);
          push(anat.lowerSpine, t, -4, dir * 15, 0);
          push(anat.lArm, t, -25, 0, 22);
          push(anat.rArm, t, -25, 0, -22);
          push(anat.lUpLeg, t, idx % 2 === 1 ? -22 : 10, 0, 0);
          push(anat.rUpLeg, t, idx % 2 === 0 ? -22 : 10, 0, 0);
          if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, t, idx % 2 === 1 ? 30 : 5, 0, 0);
          if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, t, idx % 2 === 0 ? 30 : 5, 0, 0);
        });
      } else if (/vỗ tay|clap/.test(clause)) {
        const beats = [0.2, 0.35, 0.5, 0.65, 0.8];
        beats.forEach((r, idx) => {
          const isClap = idx % 2 === 0;
          const t = at(r);
          push(anat.hips, t, 0, isClap ? 4 : -4, 0, isClap ? 0.03 : 0);
          push(anat.chest, t, 5, 0, 0);
          push(anat.head, t, isClap ? 4 : -3, 0, 0);
          push(anat.lArm, t, -55, isClap ? -28 : -8, isClap ? -28 : -10);
          push(anat.rArm, t, -55, isClap ? 28 : 8, isClap ? 28 : 10);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -65, 0, isClap ? -25 : -5);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -65, 0, isClap ? 25 : 5);
        });
      } else if (/giơ tay|ăn mừng|chiến thắng|cheer|victory|hô vang/.test(clause)) {
        const leftUp = !useRightOnly;
        const rightUp = !useLeftOnly;
        for (const [r, bounce] of [[0.25, 0.1], [0.5, 0.02], [0.75, 0.12]] as Array<[number, number]>) {
          const t = at(r);
          push(anat.hips, t, -6, 0, 0, bounce);
          push(anat.lowerSpine, t, -8, 0, 0);
          push(anat.chest, t, -10, 0, 0);
          push(anat.head, t, -12, 0, 0);
          if (leftUp) {
            push(anat.lArm, t, -35, 0, 78 + bounce * 80);
            if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -30, 0, 15);
          }
          if (rightUp) {
            push(anat.rArm, t, -35, 0, -78 - bounce * 80);
            if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -30, 0, -15);
          }
        }
      } else if (/gật đầu|nod|đồng ý/.test(clause)) {
        for (const [r, pitch] of [[0.25, 22], [0.45, -6], [0.68, 24], [0.85, -4]] as Array<[number, number]>) {
          const t = at(r);
          push(anat.chest, t, pitch * 0.2, 0, 0);
          push(anat.neck, t, pitch * 0.4, 0, 0);
          push(anat.head, t, pitch, 0, 0);
        }
      } else if (/lắc đầu|shake head|từ chối/.test(clause)) {
        for (const [r, yaw] of [[0.22, -28], [0.45, 28], [0.68, -28], [0.85, 22]] as Array<[number, number]>) {
          const t = at(r);
          push(anat.chest, t, 0, yaw * 0.18, 0);
          push(anat.neck, t, 0, yaw * 0.4, 0);
          push(anat.head, t, 0, yaw, 0);
        }
      } else if (/đi bộ|walk|chạy|run|bước|dạo/.test(clause)) {
        const isRun = /chạy|run/.test(clause);
        const swing = (isRun ? 48 : 32) * energyBoost;
        const numSteps = 8;
        for (let i = 1; i < numSteps; i++) {
          const r = i / numSteps;
          const t = at(r);
          const phase = r * Math.PI * 2;
          const s = Math.sin(phase);
          const c = Math.cos(phase);
          push(anat.hips, t, isRun ? 10 : 3, s * 8, c * 3, Math.abs(c) * (isRun ? 0.14 : 0.05));
          push(anat.lowerSpine, t, isRun ? 8 : 3, -s * 10, 0);
          push(anat.chest, t, isRun ? 6 : 2, -s * 8, 0);
          push(anat.head, t, isRun ? -6 : 0, s * 5, 0);
          push(anat.lUpLeg, t, -s * swing, 0, 0);
          push(anat.rUpLeg, t, s * swing, 0, 0);
          if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, t, (s < 0 ? -s : 0.2) * (swing * 1.05), 0, 0);
          if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, t, (s > 0 ? s : 0.2) * (swing * 1.05), 0, 0);
          push(anat.lArm, t, s * (swing * 0.75), 0, -16);
          push(anat.rArm, t, -s * (swing * 0.75), 0, 16);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, isRun ? -65 : -28, 0, 0);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, isRun ? -65 : -28, 0, 0);
        }
      } else if (/thuyết trình|nói|talk|present|tạo dáng|pose|mẫu|khoác/.test(clause)) {
        // Tạo dáng người mẫu / thuyết trình tự nhiên (tay co trước ngực, xoay hông & vai nhẹ nhàng)
        const poses = [
          { r: 0.22, hy: -12, sy: 10, hyOff: 0.02, lArmRx: -32, rArmRx: -38, lElb: -68, rElb: -74, headY: 10 },
          { r: 0.48, hy: 14, sy: -12, hyOff: -0.02, lArmRx: -42, rArmRx: -28, lElb: -78, rElb: -58, headY: -12 },
          { r: 0.75, hy: -8, sy: 8, hyOff: 0.02, lArmRx: -35, rArmRx: -35, lElb: -72, rElb: -72, headY: 6 }
        ];
        for (const p of poses) {
          const t = at(p.r);
          push(anat.hips, t, 2, p.hy, p.hy > 0 ? 4 : -4, p.hyOff, p.hy * 0.003);
          push(anat.lowerSpine, t, -3, p.sy * 0.6, 0);
          push(anat.chest, t, -4, p.sy, 0);
          push(anat.head, t, -4, p.headY, p.headY * 0.3);
          push(anat.lArm, t, p.lArmRx, -12, -16);
          push(anat.rArm, t, p.rArmRx, 12, 16);
          if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, p.lElb, 0, -22);
          if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, p.rElb, 0, 22);
          push(anat.lUpLeg, t, p.hy > 0 ? -12 : 4, 0, 0);
          push(anat.rUpLeg, t, p.hy < 0 ? -12 : 4, 0, 0);
          if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, t, p.hy > 0 ? 18 : 4, 0, 0);
          if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, t, p.hy < 0 ? 18 : 4, 0, 0);
        }
      } else {
        // Vũ đạo Nhảy múa / Hiphop / Dance năng động đa nhịp
        const numBeats = Math.max(6, Math.min(12, Math.round(segDur * 2.5)));
        for (let i = 1; i < numBeats; i++) {
          const r = i / numBeats;
          const t = at(r);
          const e = frameEnergies[i % Math.max(1, frameEnergies.length)] ?? energyBoost;
          const sign = i % 2 === 1 ? 1 : -1;
          const subPhase = i % 4;

          push(anat.hips, t, 6 * e, sign * 24 * e, sign * 7, (i % 2 === 1 ? 0.11 : -0.07) * e, sign * 0.08);
          push(anat.lowerSpine, t, 6 * e, -sign * 14 * e, -sign * 5);
          push(anat.chest, t, -4, -sign * 16 * e, -sign * 5);
          push(anat.head, t, -6, sign * 18 * e, sign * 6);

          if (subPhase === 1 || subPhase === 3) {
            push(anat.lArm, t, -48 * e, -15, sign > 0 ? 45 * e : -12);
            push(anat.rArm, t, -48 * e, 15, sign < 0 ? -45 * e : 12);
            if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -65 * e, 0, -18);
            if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -65 * e, 0, 18);
          } else {
            push(anat.lArm, t, -28 * e, 12, -10);
            push(anat.rArm, t, -28 * e, -12, 10);
            if (anat.lForeArm !== anat.lArm) push(anat.lForeArm, t, -78 * e, 0, -25);
            if (anat.rForeArm !== anat.rArm) push(anat.rForeArm, t, -78 * e, 0, 25);
          }

          push(anat.lUpLeg, t, sign > 0 ? -36 * e : -8, 0, sign > 0 ? 10 : 0);
          push(anat.rUpLeg, t, sign < 0 ? -36 * e : -8, 0, sign < 0 ? -10 : 0);
          if (anat.lLeg !== anat.lUpLeg) push(anat.lLeg, t, sign > 0 ? 48 * e : 12, 0, 0);
          if (anat.rLeg !== anat.rUpLeg) push(anat.rLeg, t, sign < 0 ? 48 * e : 12, 0, 0);
        }
      }

      setRestPoseAt(tEnd);
    };

    const sliceDur = dur / clauses.length;
    for (let cIdx = 0; cIdx < clauses.length; cIdx++) {
      buildClauseSegment(clauses[cIdx], cIdx * sliceDur, (cIdx + 1) * sliceDur);
    }

    return this.applyGeneratedBoneTimeline(propId, {
      duration: dur,
      loop: true,
      keyframes: kfs
    });
  }

  /**
   * Khóa chuyển động tại chỗ (In-Place) cho các clip animation có root-motion trôi ngang X/Z trên xương Hips
   * (thường gặp trên Meshy AI / Mixamo như Boxing_Practice, Flying_Fist_Kick, Walking...).
   * Tính bù trực tiếp trong không gian world nên bất biến với Armature scale 0.01 hay xoay -90°,
   * đồng thời bảo toàn 100% chuyển động nhảy/nhún trục Y và mọi góc xoay khớp xương.
   */
  private _applyRigRootMotionLock(rig: any): void {
    if (!rig?.wrapper || !rig?.glbEntity || !rig?.hipsNode || !rig.wrapper.enabled) return;
    const tl = rig.timeline;
    if (!tl || tl.mode !== 'clip') return;

    if (tl.inPlace === false) {
      const lp = rig.glbEntity.getLocalPosition();
      if (Math.abs(lp.x) > 1e-5 || Math.abs(lp.y) > 1e-5 || Math.abs(lp.z) > 1e-5) {
        rig.glbEntity.setLocalPosition(0, 0, 0);
      }
      return;
    }

    const wrapPos = rig.wrapper.getPosition();
    const glbPos = rig.glbEntity.getPosition();
    const hipsPos = rig.hipsNode.getPosition();
    const relX = hipsPos.x - glbPos.x;
    const relZ = hipsPos.z - glbPos.z;
    if (Number.isFinite(relX) && Number.isFinite(relZ)) {
      rig.glbEntity.setPosition(wrapPos.x - relX, wrapPos.y, wrapPos.z - relZ);
    }
  }

  /** Được gọi mỗi khung hình từ vòng lặp update chính của PlayCanvas */
  private _tickAllPropTimelines(dt: number): void {
    if (this._boneHighlightEntity && this._boneHighlightEntity.enabled && this._highlightedBoneNode) {
      try {
        const wp = this._highlightedBoneNode.getPosition();
        this._boneHighlightEntity.setPosition(wp.x, wp.y, wp.z);
      } catch (_) {
        this._boneHighlightEntity.enabled = false;
      }
    }

    if (this._propRigMap.size === 0) return;
    this._propRigMap.forEach((rig) => {
      const tl = rig.timeline;
      if (!tl || !tl.enabled) return;

      if (tl.mode === 'clip') {
        const activeClip = rig.clips.find((c) => c.name === tl.activeClipName);
        if (activeClip?.isCustomKeyframeClip) {
          if (tl.playing && tl.keyframes.length > 0) {
            const dur = Math.max(0.1, tl.duration || 3.0);
            rig.currentTime += dt * (tl.speed || 1.0);
            if (rig.currentTime >= dur) {
              if (tl.loop) {
                rig.currentTime = rig.currentTime % dur;
              } else {
                rig.currentTime = dur;
                tl.playing = false;
              }
            }
            this.evaluatePropKeyframesAtTime(rig.propId, rig.currentTime);
            if (this.onTimelineTimeUpdate) {
              this.onTimelineTimeUpdate(rig.propId, rig.currentTime, tl.playing);
            }
          }
          // Với Clip Keyframe tùy chỉnh (đặc biệt MoCap 3D khóa 2 chân bám sàn), giữ nguyên dịch chuyển hông (Hips.pos x/y/z)
          // và chỉ khóa glbEntity tại gốc (0,0,0) khi clip KHÔNG di chuyển trực tiếp __root__ (vd: xe chạy vòng tròn)
          const hasRootPosMotion = tl.keyframes.some(
            (k) =>
              k.boneName === '__root__' &&
              k.pos &&
              (Math.abs(k.pos.x || 0) > 1e-4 || Math.abs(k.pos.y || 0) > 1e-4 || Math.abs(k.pos.z || 0) > 1e-4)
          );
          if (!hasRootPosMotion) {
            const lp = rig.glbEntity.getLocalPosition();
            if (Math.abs(lp.x) > 1e-5 || Math.abs(lp.y) > 1e-5 || Math.abs(lp.z) > 1e-5) {
              rig.glbEntity.setLocalPosition(0, 0, 0);
            }
          }
          return;
        }
        if (rig.animComp?.baseLayer && tl.playing) {
          const cur = Number(rig.animComp.baseLayer.activeStateCurrentTime) || 0;
          const dur = Math.max(0.1, tl.duration || 2.5);
          rig.currentTime = cur % dur;
          if (this.onTimelineTimeUpdate) {
            this.onTimelineTimeUpdate(rig.propId, rig.currentTime, true);
          }
        }
        // Luôn áp dụng khóa tại chỗ (kể cả lúc đang pause hoặc scrub) vì app.on('update') chạy ngay sau animationUpdate
        this._applyRigRootMotionLock(rig);
        return;
      }

      if (tl.mode === 'keyframes' && tl.playing && tl.keyframes.length > 0) {
        const dur = Math.max(0.1, tl.duration || 3.0);
        rig.currentTime += dt * (tl.speed || 1.0);
        if (rig.currentTime >= dur) {
          if (tl.loop) {
            rig.currentTime = rig.currentTime % dur;
          } else {
            rig.currentTime = dur;
            tl.playing = false;
          }
        }
        this.evaluatePropKeyframesAtTime(rig.propId, rig.currentTime);
        if (this.onTimelineTimeUpdate) {
          this.onTimelineTimeUpdate(rig.propId, rig.currentTime, tl.playing);
        }
      }
    });
  }

  /** Kiểm tra xem glbPath đã có sẵn trong Asset Cache chưa (tránh đọc lại file từ đĩa) */
  hasCachedGlbAsset(glbPath?: string | null): boolean {
    if (!glbPath || !this.app || this._destroyed) return false;
    const asset = this._glbAssetCache.get(glbPath);
    return !!(asset && asset.resource);
  }

  private _propCustomTextures = new Map<string, { texture: pc.Texture; sourceKey: string }>();

  private _findPropEntity(propId: string): pc.Entity | null {
    if (!this.app || !propId) return null;
    const glb = this.app.root.findByName(`PropGLB_${propId}`) as pc.Entity | null;
    if (glb) return glb;
    return this.app.root.findByName(propId) as pc.Entity | null;
  }

  private _collectPropMeshInstances(ent: pc.Entity | null): any[] {
    if (!ent) return [];
    const compSet = new Set<any>();
    if ((ent as any).render) compSet.add((ent as any).render);
    if ((ent as any).model) compSet.add((ent as any).model);
    for (const r of (ent.findComponents('render') as any[]) || []) compSet.add(r);
    for (const m of (ent.findComponents('model') as any[]) || []) compSet.add(m);
    const out: any[] = [];
    compSet.forEach((comp) => {
      const mis: any[] = comp?.meshInstances || [];
      for (const mi of mis) {
        if (mi) out.push(mi);
      }
    });
    return out;
  }

  private _ensurePropClonedMaterial(mi: any): pc.StandardMaterial | null {
    const srcMat = mi?.material as pc.StandardMaterial | undefined;
    if (!srcMat) return null;
    if ((srcMat as any)._isClonedInstance) {
      return srcMat;
    }
    const cloned = srcMat.clone() as pc.StandardMaterial;
    (cloned as any)._isClonedInstance = true;
    (cloned as any)._baseBlendType = (srcMat as any)._baseBlendType ?? srcMat.blendType;
    (cloned as any)._baseDepthWrite = (srcMat as any)._baseDepthWrite ?? srcMat.depthWrite;
    (cloned as any)._baseOpacity = (srcMat as any)._baseOpacity ?? srcMat.opacity;
    (cloned as any)._origDiffuseMap = ('_origDiffuseMap' in (srcMat as any))
      ? (srcMat as any)._origDiffuseMap
      : (srcMat.diffuseMap ?? null);
    (cloned as any)._origDiffuseColor = (srcMat as any)._origDiffuseColor
      ? (srcMat as any)._origDiffuseColor.clone()
      : (srcMat.diffuse ? srcMat.diffuse.clone() : new pc.Color(1, 1, 1));
    (cloned as any)._origDiffuseTint = (srcMat as any)._origDiffuseTint ?? Boolean((srcMat as any).diffuseTint);
    (cloned as any)._origMetalness = (srcMat as any)._origMetalness ?? srcMat.metalness;
    (cloned as any)._origGloss = (srcMat as any)._origGloss ?? srcMat.gloss;
    (cloned as any)._origUseMetalness = (srcMat as any)._origUseMetalness ?? Boolean(srcMat.useMetalness);
    (cloned as any)._origEmissive = (srcMat as any)._origEmissive
      ? (srcMat as any)._origEmissive.clone()
      : (srcMat.emissive ? srcMat.emissive.clone() : new pc.Color(0, 0, 0));
    (cloned as any)._origDiffuseMapTiling = (srcMat as any)._origDiffuseMapTiling
      ? (srcMat as any)._origDiffuseMapTiling.clone()
      : (srcMat.diffuseMapTiling ? srcMat.diffuseMapTiling.clone() : new pc.Vec2(1, 1));
    (cloned as any)._origDiffuseMapOffset = (srcMat as any)._origDiffuseMapOffset
      ? (srcMat as any)._origDiffuseMapOffset.clone()
      : (srcMat.diffuseMapOffset ? srcMat.diffuseMapOffset.clone() : new pc.Vec2(0, 0));
    (cloned as any)._origDiffuseMapRotation = (srcMat as any)._origDiffuseMapRotation ?? (Number((srcMat as any).diffuseMapRotation) || 0);
    mi.material = cloned;
    return cloned;
  }

  private _getMaterialOriginalDiffuseMap(mat: any): pc.Texture | null {
    if (!mat) return null;
    if ('_origDiffuseMap' in mat) return mat._origDiffuseMap ?? null;
    return mat.diffuseMap ?? null;
  }

  /**
   * Khảo sát hình học và trạng thái UV gốc của đồ vật 3D (có TEXCOORD0 gốc hay không,
   * kích thước bao AABB và tỷ lệ chu vi/chiều cao để dán logo không bị kéo giãn).
   */
  inspectPropMeshGeometry(propId: string): {
    meshCount: number;
    hasNativeUv: boolean;
    activeUvMode: 'original' | 'cylindrical' | 'box';
    spanX: number;
    spanY: number;
    spanZ: number;
    cylindricalAspect: number;
  } {
    const empty = {
      meshCount: 0,
      hasNativeUv: false,
      activeUvMode: 'cylindrical' as const,
      spanX: 1,
      spanY: 1,
      spanZ: 1,
      cylindricalAspect: 1.6
    };
    const ent = this._findPropEntity(propId);
    if (!ent) return empty;
    const mis = this._collectPropMeshInstances(ent);
    if (mis.length === 0) return empty;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let hasNativeUv = false;
    let synthMode: 'cylindrical' | 'box' | null = null;

    const seenMeshes = new Set<any>();
    for (const mi of mis) {
      const mesh = mi?.mesh as any;
      if (!mesh || seenMeshes.has(mesh)) continue;
      seenMeshes.add(mesh);

      if (mesh._synthesizedUvMode === 'cylindrical' || mesh._synthesizedUvMode === 'box') {
        synthMode = mesh._synthesizedUvMode;
      }

      const srcVb = mesh._origVertexBuffer || mesh.vertexBuffer;
      if (!srcVb) continue;
      const fmt = srcVb.getFormat?.();
      const els: any[] = fmt?.elements || [];
      const posEl = els.find((e: any) => e.name === pc.SEMANTIC_POSITION);
      const uvEl = els.find((e: any) => e.name === pc.SEMANTIC_TEXCOORD0);

      if (typeof mesh._hasNativeUv === 'boolean') {
        if (mesh._hasNativeUv) hasNativeUv = true;
      } else if (uvEl) {
        // Kiểm tra xem UV gốc có thực sự hợp lệ (không bị suy biến về 1 điểm)
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        const raw = srcVb.lock?.();
        if (raw) {
          const bytes = ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : new Uint8Array(raw as ArrayBuffer);
          const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const n = srcVb.getNumVertices?.() || 0;
          const step = Math.max(1, Math.floor(n / 2000));
          for (let v = 0; v < n; v += step) {
            const off = v * uvEl.stride + uvEl.offset;
            if (off + 8 > bytes.byteLength) break;
            const u = dv.getFloat32(off, true);
            const tv = dv.getFloat32(off + 4, true);
            if (Number.isFinite(u) && Number.isFinite(tv)) {
              if (u < minU) minU = u;
              if (u > maxU) maxU = u;
              if (tv < minV) minV = tv;
              if (tv > maxV) maxV = tv;
            }
          }
          srcVb.unlock?.();
        }
        const valid = (maxU - minU > 0.02) || (maxV - minV > 0.02);
        mesh._hasNativeUv = valid;
        if (valid) hasNativeUv = true;
      } else {
        mesh._hasNativeUv = false;
      }

      if (posEl) {
        const raw = srcVb.lock?.();
        if (raw) {
          const bytes = ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : new Uint8Array(raw as ArrayBuffer);
          const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const n = srcVb.getNumVertices?.() || 0;
          for (let v = 0; v < n; v++) {
            const off = v * posEl.stride + posEl.offset;
            if (off + 12 > bytes.byteLength) break;
            const px = dv.getFloat32(off, true);
            const py = dv.getFloat32(off + 4, true);
            const pz = dv.getFloat32(off + 8, true);
            if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
              if (px < minX) minX = px; if (px > maxX) maxX = px;
              if (py < minY) minY = py; if (py > maxY) maxY = py;
              if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
            }
          }
          srcVb.unlock?.();
        }
      }
    }

    const spanX = Number.isFinite(maxX - minX) ? Math.max(1e-4, maxX - minX) : 1;
    const spanY = Number.isFinite(maxY - minY) ? Math.max(1e-4, maxY - minY) : 1;
    const spanZ = Number.isFinite(maxZ - minZ) ? Math.max(1e-4, maxZ - minZ) : 1;
    const avgDiam = (spanX + spanZ) * 0.5;
    const cylindricalAspect = (Math.PI * avgDiam) / spanY;

    return {
      meshCount: seenMeshes.size,
      hasNativeUv,
      activeUvMode: synthMode || (hasNativeUv ? 'original' : 'cylindrical'),
      spanX,
      spanY,
      spanZ,
      cylindricalAspect
    };
  }

  /**
   * Đảm bảo mọi mesh của đồ vật đều có tọa độ UV (SEMANTIC_TEXCOORD0) chuẩn để PlayCanvas 2.5
   * bật lấy mẫu DiffuseMap trong shader. Hỗ trợ:
   * - 'auto': giữ nguyên UV gốc nếu GLB đã có, tự động tạo UV trụ (cylindrical) kèm tách đường seam nếu GLB chưa có UV.
   * - 'cylindrical': ép tạo bản đồ UV trụ sạch (có tách seam phía sau -Z để không bị vệt sọc kéo giãn), lý tưởng cho lon/chai/cốc/dán logo.
   * - 'box': chiếu UV 6 mặt theo pháp tuyến đỉnh, phù hợp đồ vật dạng hộp/bàn/tường.
   * - 'original': khôi phục bộ đệm UV nguyên bản của GLB (nếu có).
   */
  ensurePropMeshUvs(
    propId: string,
    mode: 'auto' | 'cylindrical' | 'box' | 'original' = 'auto'
  ): { appliedMode: 'original' | 'cylindrical' | 'box'; synthesized: boolean } {
    if (!this.app || this._destroyed || !propId) {
      return { appliedMode: 'original', synthesized: false };
    }
    const ent = this._findPropEntity(propId);
    if (!ent) return { appliedMode: 'original', synthesized: false };
    const mis = this._collectPropMeshInstances(ent);
    if (mis.length === 0) return { appliedMode: 'original', synthesized: false };

    const device = this.app.graphicsDevice;
    const geomInfo = this.inspectPropMeshGeometry(propId);

    let targetMode: 'original' | 'cylindrical' | 'box';
    if (mode === 'original') {
      targetMode = geomInfo.hasNativeUv ? 'original' : 'cylindrical';
    } else if (mode === 'auto') {
      targetMode = geomInfo.hasNativeUv ? 'original' : 'cylindrical';
    } else {
      targetMode = mode;
    }

    // Gom các mesh duy nhất cùng danh sách meshInstances trỏ tới chúng
    const meshToMis = new Map<any, any[]>();
    for (const mi of mis) {
      const mesh = mi?.mesh;
      if (!mesh) continue;
      let arr = meshToMis.get(mesh);
      if (!arr) { arr = []; meshToMis.set(mesh, arr); }
      arr.push(mi);
    }

    // Tính AABB chung toàn vật thể từ buffer gốc để UV liên tục trên mọi sub-mesh
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    meshToMis.forEach((_, mesh) => {
      const srcVb = mesh._origVertexBuffer || mesh.vertexBuffer;
      if (!srcVb) return;
      const fmt = srcVb.getFormat?.();
      const posEl = (fmt?.elements || []).find((e: any) => e.name === pc.SEMANTIC_POSITION);
      if (!posEl) return;
      const raw = srcVb.lock?.();
      if (!raw) return;
      const bytes = ArrayBuffer.isView(raw)
        ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
        : new Uint8Array(raw as ArrayBuffer);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const n = srcVb.getNumVertices?.() || 0;
      for (let v = 0; v < n; v++) {
        const off = v * posEl.stride + posEl.offset;
        if (off + 12 > bytes.byteLength) break;
        const px = dv.getFloat32(off, true);
        const py = dv.getFloat32(off + 4, true);
        const pz = dv.getFloat32(off + 8, true);
        if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
        }
      }
      srcVb.unlock?.();
    });

    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const spanX = Math.max(1e-4, maxX - minX);
    const spanY = Math.max(1e-4, maxY - minY);
    const spanZ = Math.max(1e-4, maxZ - minZ);

    let anySynthesized = false;

    meshToMis.forEach((miList, mesh) => {
      // Khôi phục UV gốc nếu người dùng yêu cầu và mesh có UV gốc
      if (targetMode === 'original') {
        if (mesh._synthesizedUvMode && mesh._origVertexBuffer) {
          const oldSynthVb = mesh.vertexBuffer;
          const oldSynthIb = mesh.indexBuffer?.[0];
          mesh.vertexBuffer = mesh._origVertexBuffer;
          if (mesh._origIndexBuffer !== undefined && mesh.indexBuffer) {
            mesh.indexBuffer[0] = mesh._origIndexBuffer;
          }
          const prim = mesh.primitive?.[0];
          if (prim && typeof mesh._origPrimCount === 'number') {
            prim.base = mesh._origPrimBase ?? 0;
            prim.count = mesh._origPrimCount;
            prim.indexed = Boolean(mesh._origPrimIndexed);
          }
          mesh._synthesizedUvMode = null;
          if (oldSynthVb && oldSynthVb !== mesh._origVertexBuffer) {
            try { oldSynthVb.destroy?.(); } catch (_) {}
          }
          if (oldSynthIb && oldSynthIb !== mesh._origIndexBuffer) {
            try { oldSynthIb.destroy?.(); } catch (_) {}
          }
          for (const mi of miList) {
            try { mi.clearShaders?.(); } catch (_) {}
          }
        }
        return;
      }

      // Đã ở đúng chế độ UV yêu cầu -> bỏ qua tái tạo thừa
      if (mesh._synthesizedUvMode === targetMode) {
        anySynthesized = true;
        return;
      }

      // Lưu bản sao dự phòng của VB/IB nguyên bản lần đầu tiên
      if (!mesh._origVertexBuffer && mesh.vertexBuffer) {
        mesh._origVertexBuffer = mesh.vertexBuffer;
        mesh._origIndexBuffer = mesh.indexBuffer?.[0] ?? null;
        const prim0 = mesh.primitive?.[0];
        mesh._origPrimBase = prim0?.base ?? 0;
        mesh._origPrimCount = prim0?.count ?? 0;
        mesh._origPrimIndexed = Boolean(prim0?.indexed);
      }

      const srcVb = mesh._origVertexBuffer || mesh.vertexBuffer;
      if (!srcVb) return;
      const srcFmt = srcVb.getFormat?.();
      const srcEls: any[] = srcFmt?.elements || [];
      const posEl = srcEls.find((e: any) => e.name === pc.SEMANTIC_POSITION);
      const normEl = srcEls.find((e: any) => e.name === pc.SEMANTIC_NORMAL);
      if (!posEl) return;

      const rawVb = srcVb.lock?.();
      if (!rawVb) return;
      const srcBytes = ArrayBuffer.isView(rawVb)
        ? new Uint8Array(rawVb.buffer, rawVb.byteOffset, rawVb.byteLength)
        : new Uint8Array(rawVb as ArrayBuffer);
      const srcDv = new DataView(srcBytes.buffer, srcBytes.byteOffset, srcBytes.byteLength);
      const numVerts = srcVb.getNumVertices?.() || 0;
      if (numVerts <= 0) {
        srcVb.unlock?.();
        return;
      }

      const baseU = new Float32Array(numVerts);
      const baseV = new Float32Array(numVerts);
      const TWO_PI = Math.PI * 2;

      for (let v = 0; v < numVerts; v++) {
        const pOff = v * posEl.stride + posEl.offset;
        const px = srcDv.getFloat32(pOff, true);
        const py = srcDv.getFloat32(pOff + 4, true);
        const pz = srcDv.getFloat32(pOff + 8, true);
        const normY = Math.max(0, Math.min(1, (py - minY) / spanY));

        if (targetMode === 'box') {
          let nx = 0, ny = 0, nz = 1;
          if (normEl) {
            const nOff = v * normEl.stride + normEl.offset;
            nx = srcDv.getFloat32(nOff, true);
            ny = srcDv.getFloat32(nOff + 4, true);
            nz = srcDv.getFloat32(nOff + 8, true);
          }
          const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
          if (ay >= ax && ay >= az) {
            baseU[v] = (px - minX) / spanX;
            baseV[v] = (pz - minZ) / spanZ;
          } else if (az >= ax && az >= ay) {
            baseU[v] = nz >= 0 ? (px - minX) / spanX : 1 - (px - minX) / spanX;
            baseV[v] = 1 - normY;
          } else {
            baseU[v] = nx >= 0 ? 1 - (pz - minZ) / spanZ : (pz - minZ) / spanZ;
            baseV[v] = 1 - normY;
          }
        } else {
          // UV Trụ chuẩn glTF: u = 0.5 tại mặt trước (+Z), text đọc xuôi từ trái (-X) sang phải (+X),
          // đường seam nằm gọn phía sau (-Z); v = 0 ở đỉnh (nắp trên), v = 1 ở đáy.
          const dx = px - cx;
          const dz = pz - cz;
          const theta = Math.atan2(dx, dz); // [-PI, PI], 0 tại +Z
          let u = 0.5 + theta / TWO_PI;
          if (u < 0) u += 1;
          if (u > 1) u -= 1;
          baseU[v] = u;
          baseV[v] = 1 - normY;
        }
      }

      // Đọc chỉ số tam giác nguyên bản để tách sạch đỉnh tại đường nối seam (chế độ trụ)
      const prim = mesh.primitive?.[0];
      const origIb = mesh._origIndexBuffer ?? mesh.indexBuffer?.[0] ?? null;
      const origBase = typeof mesh._origPrimBase === 'number' ? mesh._origPrimBase : (prim?.base || 0);
      const origIndexed = typeof mesh._origPrimIndexed === 'boolean' ? mesh._origPrimIndexed : Boolean(prim?.indexed && origIb);
      let indices: Uint32Array | null = null;

      if (origIndexed && origIb) {
        const rawIb = origIb.lock?.();
        if (rawIb) {
          const ibBytes = ArrayBuffer.isView(rawIb)
            ? new Uint8Array(rawIb.buffer, rawIb.byteOffset, rawIb.byteLength)
            : new Uint8Array(rawIb as ArrayBuffer);
          const ibDv = new DataView(ibBytes.buffer, ibBytes.byteOffset, ibBytes.byteLength);
          const idxFmt = origIb.getFormat?.();
          const count = (typeof mesh._origPrimCount === 'number' && mesh._origPrimCount > 0)
            ? mesh._origPrimCount
            : (prim?.count || origIb.getNumIndices?.() || 0);
          indices = new Uint32Array(count);
          for (let i = 0; i < count; i++) {
            const k = origBase + i;
            if (idxFmt === pc.INDEXFORMAT_UINT8) indices[i] = ibDv.getUint8(k);
            else if (idxFmt === pc.INDEXFORMAT_UINT32) indices[i] = ibDv.getUint32(k * 4, true);
            else indices[i] = ibDv.getUint16(k * 2, true);
          }
          origIb.unlock?.();
        }
      }

      // Tách đỉnh cắt ngang seam (-Z) ở chế độ UV trụ để không bao giờ xuất hiện sọc kéo giãn mặt sau
      const dupSourceVerts: number[] = [];
      const dupUValues: number[] = [];
      let indicesModified = false;

      if (targetMode === 'cylindrical' && indices && indices.length >= 3) {
        const seamDupMap = new Map<number, number>();
        const triCount = Math.floor(indices.length / 3);
        for (let t = 0; t < triCount; t++) {
          const i0 = indices[t * 3];
          const i1 = indices[t * 3 + 1];
          const i2 = indices[t * 3 + 2];
          if (i0 >= numVerts || i1 >= numVerts || i2 >= numVerts) continue;
          const u0 = baseU[i0], u1 = baseU[i1], u2 = baseU[i2];
          const maxU = Math.max(u0, u1, u2);
          const minU = Math.min(u0, u1, u2);
          if (maxU - minU > 0.5) {
            const tri = [i0, i1, i2];
            for (let c = 0; c < 3; c++) {
              const vi = tri[c];
              if (baseU[vi] < 0.5) {
                let dupIdx = seamDupMap.get(vi);
                if (dupIdx === undefined) {
                  dupIdx = numVerts + dupSourceVerts.length;
                  seamDupMap.set(vi, dupIdx);
                  dupSourceVerts.push(vi);
                  dupUValues.push(baseU[vi] + 1.0);
                }
                indices[t * 3 + c] = dupIdx;
                indicesModified = true;
              }
            }
          }
        }
      }

      const totalVerts = numVerts + dupSourceVerts.length;

      // Dựng VertexFormat mới bảo toàn toàn bộ thuộc tính cũ + đảm bảo có SEMANTIC_TEXCOORD0 (FLOAT32 x 2)
      const desc: any[] = [];
      let hasTex0InDesc = false;
      for (const el of srcEls) {
        if (el.name === pc.SEMANTIC_TEXCOORD0) {
          desc.push({
            semantic: pc.SEMANTIC_TEXCOORD0,
            components: 2,
            type: pc.TYPE_FLOAT32,
            normalize: false
          });
          hasTex0InDesc = true;
        } else {
          desc.push({
            semantic: el.name,
            components: el.numComponents,
            type: el.dataType,
            normalize: !!el.normalize,
            asInt: !!el.asInt
          });
        }
      }
      if (!hasTex0InDesc) {
        desc.push({
          semantic: pc.SEMANTIC_TEXCOORD0,
          components: 2,
          type: pc.TYPE_FLOAT32,
          normalize: false
        });
      }

      const newFmt = new pc.VertexFormat(device, desc);
      const newVb = new pc.VertexBuffer(device, newFmt, totalVerts, {
        usage: srcVb.getUsage?.() ?? pc.BUFFER_STATIC
      });
      const newRaw = newVb.lock();
      const dstBytes = ArrayBuffer.isView(newRaw)
        ? new Uint8Array(newRaw.buffer, newRaw.byteOffset, newRaw.byteLength)
        : new Uint8Array(newRaw as ArrayBuffer);
      const dstDv = new DataView(dstBytes.buffer, dstBytes.byteOffset, dstBytes.byteLength);
      const dstEls: any[] = (newFmt as any).elements || [];

      // Sao chép toàn bộ thuộc tính gốc (POSITION, NORMAL, TANGENT, SKIN...) cho cả đỉnh gốc & đỉnh tách seam
      for (const sEl of srcEls) {
        if (sEl.name === pc.SEMANTIC_TEXCOORD0) continue;
        const dEl = dstEls.find((e) => e.name === sEl.name);
        if (!dEl) continue;
        const copyBytes = Math.min(sEl.size, dEl.size);
        for (let v = 0; v < numVerts; v++) {
          const sOff = v * sEl.stride + sEl.offset;
          const dOff = v * dEl.stride + dEl.offset;
          for (let b = 0; b < copyBytes; b++) {
            dstBytes[dOff + b] = srcBytes[sOff + b];
          }
        }
        for (let d = 0; d < dupSourceVerts.length; d++) {
          const sv = dupSourceVerts[d];
          const dvIdx = numVerts + d;
          const sOff = sv * sEl.stride + sEl.offset;
          const dOff = dvIdx * dEl.stride + dEl.offset;
          for (let b = 0; b < copyBytes; b++) {
            dstBytes[dOff + b] = srcBytes[sOff + b];
          }
        }
      }

      // Ghi tọa độ UV mới vào SEMANTIC_TEXCOORD0
      const dstUvEl = dstEls.find((e) => e.name === pc.SEMANTIC_TEXCOORD0);
      if (dstUvEl) {
        for (let v = 0; v < numVerts; v++) {
          const uOff = v * dstUvEl.stride + dstUvEl.offset;
          dstDv.setFloat32(uOff, baseU[v], true);
          dstDv.setFloat32(uOff + 4, baseV[v], true);
        }
        for (let d = 0; d < dupSourceVerts.length; d++) {
          const sv = dupSourceVerts[d];
          const dvIdx = numVerts + d;
          const uOff = dvIdx * dstUvEl.stride + dstUvEl.offset;
          dstDv.setFloat32(uOff, dupUValues[d], true);
          dstDv.setFloat32(uOff + 4, baseV[sv], true);
        }
      }

      srcVb.unlock?.();
      newVb.unlock();

      // Dựng IndexBuffer mới nếu có tách đỉnh seam
      const prevSynthVb = mesh.vertexBuffer;
      const prevSynthIb = mesh.indexBuffer?.[0];

      mesh.vertexBuffer = newVb;

      if (indices && indicesModified) {
        const useUint32 = totalVerts > 65535;
        const idxFormat = useUint32 ? pc.INDEXFORMAT_UINT32 : pc.INDEXFORMAT_UINT16;
        const newIb = new pc.IndexBuffer(device, idxFormat, indices.length, pc.BUFFER_STATIC);
        const ibRaw = newIb.lock();
        if (useUint32) {
          const u32 = new Uint32Array(ibRaw as ArrayBuffer);
          u32.set(indices);
        } else {
          const u16 = new Uint16Array(ibRaw as ArrayBuffer);
          for (let i = 0; i < indices.length; i++) u16[i] = indices[i];
        }
        newIb.unlock();
        if (mesh.indexBuffer) {
          mesh.indexBuffer[0] = newIb;
        }
        if (prim) {
          prim.base = 0;
          prim.count = indices.length;
          prim.indexed = true;
        }
      } else if (mesh._origIndexBuffer !== undefined && mesh.indexBuffer) {
        mesh.indexBuffer[0] = mesh._origIndexBuffer;
        if (prim && typeof mesh._origPrimCount === 'number') {
          prim.base = mesh._origPrimBase ?? 0;
          prim.count = mesh._origPrimCount;
          prim.indexed = Boolean(mesh._origPrimIndexed);
        }
      }

      mesh._synthesizedUvMode = targetMode;
      anySynthesized = true;

      // Dọn bộ nhớ VRAM của buffer tổng hợp trước đó (không bao giờ hủy buffer gốc)
      if (prevSynthVb && prevSynthVb !== mesh._origVertexBuffer && prevSynthVb !== newVb) {
        try { prevSynthVb.destroy?.(); } catch (_) {}
      }
      if (prevSynthIb && prevSynthIb !== mesh._origIndexBuffer && prevSynthIb !== mesh.indexBuffer?.[0]) {
        try { prevSynthIb.destroy?.(); } catch (_) {}
      }

      // Ép PlayCanvas 2.5 biên dịch lại shader với uvMask mới (bật vUv0!)
      for (const mi of miList) {
        try { mi.clearShaders?.(); } catch (_) {}
      }
    });

    return { appliedMode: targetMode, synthesized: anySynthesized };
  }

  /**
   * Trích xuất bản đồ Texture gốc (DiffuseMap) và Bản đồ lưới UV (UV Island Layout) 1024x1024
   * của đồ vật 3D hiện tại để AI vẽ lại Texture khớp chính xác từng vùng UV (thân lon, nắp, đáy...).
   * Nếu GLB chưa có UV gốc (ví dụ bản hình khối Meshy _generate_), tự động tạo UV trụ trước khi vẽ lưới.
   */
  extractPropTextureAtlas(
    propId: string,
    uvMode: 'auto' | 'cylindrical' | 'box' | 'original' = 'auto'
  ): {
    hasDiffuseMap: boolean;
    hasUv: boolean;
    hasNativeUv: boolean;
    activeUvMode: 'original' | 'cylindrical' | 'box';
    cylindricalAspect: number;
    atlasDataUrl: string | null;
    uvGuideDataUrl: string | null;
    meshCount: number;
    materialNames: string[];
  } {
    const empty = {
      hasDiffuseMap: false,
      hasUv: false,
      hasNativeUv: false,
      activeUvMode: 'cylindrical' as const,
      cylindricalAspect: 1.6,
      atlasDataUrl: null,
      uvGuideDataUrl: null,
      meshCount: 0,
      materialNames: [] as string[]
    };
    const ent = this._findPropEntity(propId);
    if (!ent) return empty;

    // Tự động đảm bảo đồ vật có tọa độ UV trước khi trích xuất lưới UV
    const uvRes = this.ensurePropMeshUvs(propId, uvMode);
    const geomInfo = this.inspectPropMeshGeometry(propId);

    const mis = this._collectPropMeshInstances(ent);
    if (mis.length === 0) return empty;

    const SIZE = 1024;
    let hasDiffuseMap = false;
    let atlasDataUrl: string | null = null;
    let origFlipY = false;
    const matNames = new Set<string>();

    // 1. Trích xuất ảnh DiffuseMap gốc của GLB (dùng _getMaterialOriginalDiffuseMap để không nhầm với texture custom!)
    const useOrigDiffuseAsBg = uvRes.appliedMode === 'original';
    for (const mi of mis) {
      const mat = mi?.material as any;
      if (!mat) continue;
      if (mat.name) matNames.add(String(mat.name));
      const baseTex = this._getMaterialOriginalDiffuseMap(mat);
      if (!baseTex || hasDiffuseMap) continue;
      origFlipY = uvRes.synthesized ? false : Boolean(baseTex.flipY);
      const src = baseTex.getSource?.(0) ?? baseTex._levels?.[0];
      const isDrawable =
        (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) ||
        (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) ||
        (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) ||
        (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas);
      if (isDrawable) {
        try {
          const cv = document.createElement('canvas');
          cv.width = SIZE;
          cv.height = SIZE;
          const ctx = cv.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#d4d4d8';
            ctx.fillRect(0, 0, SIZE, SIZE);
            ctx.drawImage(src as CanvasImageSource, 0, 0, SIZE, SIZE);
            atlasDataUrl = cv.toDataURL('image/png');
            hasDiffuseMap = true;
          }
        } catch (_) {}
      }
    }

    // 2. Vẽ bản đồ lưới UV (UV Island Layout) phân vùng theo chiều cao 3D (Nắp trên / Thân giữa / Đáy dưới)
    let hasUv = false;
    let uvGuideDataUrl: string | null = null;
    try {
      const uvCv = document.createElement('canvas');
      uvCv.width = SIZE;
      uvCv.height = SIZE;
      const ctx = uvCv.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Nếu đang ở chế độ UV gốc và GLB có DiffuseMap gốc, vẽ nền mờ ảnh gốc để AI bám sát chi tiết AO
        if (useOrigDiffuseAsBg && hasDiffuseMap && atlasDataUrl) {
          for (const mi of mis) {
            const mat = mi?.material as any;
            const baseTex = this._getMaterialOriginalDiffuseMap(mat);
            const src = baseTex?.getSource?.(0) ?? baseTex?._levels?.[0];
            if (src && (src instanceof HTMLImageElement || src instanceof ImageBitmap || src instanceof HTMLCanvasElement)) {
              ctx.globalAlpha = 0.72;
              ctx.drawImage(src as CanvasImageSource, 0, 0, SIZE, SIZE);
              ctx.globalAlpha = 1.0;
              break;
            }
          }
        }

        // Tìm khoảng Y thực tế của toàn bộ mesh để phân biệt vùng Nắp trên / Thân / Đáy
        let minY = Infinity;
        let maxY = -Infinity;
        for (const mi of mis) {
          const mesh = mi?.mesh as any;
          const vb = mesh?.vertexBuffer;
          if (!vb) continue;
          const fmt = vb.getFormat?.();
          const els: any[] = fmt?.elements || [];
          const posEl = els.find((e: any) => e.name === pc.SEMANTIC_POSITION);
          if (!posEl) continue;
          const raw = vb.lock?.();
          if (!raw) continue;
          const bytes = ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : new Uint8Array(raw as ArrayBuffer);
          const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const n = vb.getNumVertices?.() || 0;
          for (let v = 0; v < n; v++) {
            const off = v * posEl.stride + posEl.offset;
            if (off + 12 > bytes.byteLength) break;
            const py = dv.getFloat32(off + 4, true);
            if (Number.isFinite(py)) {
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
          }
          vb.unlock?.();
        }
        const spanY = Math.max(1e-4, maxY - minY);

        for (const mi of mis) {
          const mesh = mi?.mesh as any;
          const vb = mesh?.vertexBuffer;
          if (!vb) continue;
          const fmt = vb.getFormat?.();
          const els: any[] = fmt?.elements || [];
          const uvEl = els.find((e: any) => e.name === pc.SEMANTIC_TEXCOORD0);
          const posEl = els.find((e: any) => e.name === pc.SEMANTIC_POSITION);
          if (!uvEl) continue;

          const rawVb = vb.lock?.();
          if (!rawVb) continue;
          const vbBytes = ArrayBuffer.isView(rawVb)
            ? new Uint8Array(rawVb.buffer, rawVb.byteOffset, rawVb.byteLength)
            : new Uint8Array(rawVb as ArrayBuffer);
          const vbDv = new DataView(vbBytes.buffer, vbBytes.byteOffset, vbBytes.byteLength);
          const numVerts = vb.getNumVertices?.() || 0;
          const uvs = new Float32Array(numVerts * 2);
          const normYs = new Float32Array(numVerts);

          for (let v = 0; v < numVerts; v++) {
            const uOff = v * uvEl.stride + uvEl.offset;
            if (uOff + 8 <= vbBytes.byteLength) {
              uvs[v * 2] = vbDv.getFloat32(uOff, true);
              uvs[v * 2 + 1] = vbDv.getFloat32(uOff + 4, true);
            }
            if (posEl) {
              const pOff = v * posEl.stride + posEl.offset;
              if (pOff + 12 <= vbBytes.byteLength) {
                const py = vbDv.getFloat32(pOff + 4, true);
                normYs[v] = (py - minY) / spanY;
              }
            }
          }
          vb.unlock?.();

          const prim = mesh.primitive?.[0];
          const ib = mesh.indexBuffer?.[0];
          let indices: Uint32Array | null = null;
          if (prim?.indexed && ib) {
            const rawIb = ib.lock?.();
            if (rawIb) {
              const ibBytes = ArrayBuffer.isView(rawIb)
                ? new Uint8Array(rawIb.buffer, rawIb.byteOffset, rawIb.byteLength)
                : new Uint8Array(rawIb as ArrayBuffer);
              const idxFmt = ib.getFormat?.();
              const count = prim.count || ib.getNumIndices?.() || 0;
              const base = prim.base || 0;
              indices = new Uint32Array(count);
              const ibDv = new DataView(ibBytes.buffer, ibBytes.byteOffset, ibBytes.byteLength);
              for (let i = 0; i < count; i++) {
                const k = base + i;
                if (idxFmt === pc.INDEXFORMAT_UINT8) indices[i] = ibDv.getUint8(k);
                else if (idxFmt === pc.INDEXFORMAT_UINT32) indices[i] = ibDv.getUint32(k * 4, true);
                else indices[i] = ibDv.getUint16(k * 2, true);
              }
              ib.unlock?.();
            }
          } else {
            const count = prim?.count || numVerts;
            indices = new Uint32Array(count);
            for (let i = 0; i < count; i++) indices[i] = (prim?.base || 0) + i;
          }

          if (!indices || indices.length < 3) continue;
          hasUv = true;

          const triCount = Math.floor(indices.length / 3);
          const step = triCount > 18000 ? Math.ceil(triCount / 18000) : 1;

          const mapUv = (u: number, v: number): [number, number] => {
            const uu = ((u % 1) + 1) % 1;
            const vv = ((v % 1) + 1) % 1;
            const x = uu * SIZE;
            const y = origFlipY ? (1 - vv) * SIZE : vv * SIZE;
            return [x, y];
          };

          for (let t = 0; t < triCount; t += step) {
            const i0 = indices[t * 3];
            const i1 = indices[t * 3 + 1];
            const i2 = indices[t * 3 + 2];
            if (i0 >= numVerts || i1 >= numVerts || i2 >= numVerts) continue;
            const [x0, y0] = mapUv(uvs[i0 * 2], uvs[i0 * 2 + 1]);
            const [x1, y1] = mapUv(uvs[i1 * 2], uvs[i1 * 2 + 1]);
            const [x2, y2] = mapUv(uvs[i2 * 2], uvs[i2 * 2 + 1]);

            if (Math.abs(x0 - x1) > SIZE * 0.5 || Math.abs(x1 - x2) > SIZE * 0.5 || Math.abs(x2 - x0) > SIZE * 0.5) {
              continue;
            }
            const avgY = (normYs[i0] + normYs[i1] + normYs[i2]) / 3;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.closePath();

            if (!useOrigDiffuseAsBg || !hasDiffuseMap) {
              if (avgY > 0.88) ctx.fillStyle = 'rgba(125, 211, 252, 0.72)'; // Nắp trên
              else if (avgY < 0.11) ctx.fillStyle = 'rgba(253, 224, 71, 0.62)'; // Đáy dưới
              else ctx.fillStyle = 'rgba(226, 232, 240, 0.88)'; // Thân chính
              ctx.fill();
            }
            ctx.strokeStyle = avgY > 0.88
              ? 'rgba(14, 165, 233, 0.45)'
              : (avgY < 0.11 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.3)');
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }

        if (hasUv || hasDiffuseMap) {
          uvGuideDataUrl = uvCv.toDataURL('image/png');
        }
      }
    } catch (err) {
      console.warn('[SontinhSceneService] extractPropTextureAtlas UV guide warning:', err);
    }

    return {
      hasDiffuseMap,
      hasUv,
      hasNativeUv: geomInfo.hasNativeUv,
      activeUvMode: uvRes.appliedMode,
      cylindricalAspect: geomInfo.cylindricalAspect,
      atlasDataUrl,
      uvGuideDataUrl,
      meshCount: mis.length,
      materialNames: Array.from(matNames)
    };
  }

  /**
   * Bọc ảnh Texture (từ AI sinh ra hoặc ảnh logo đã ghép) trực tiếp lên vật thể 3D trong PlayCanvas.
   * Tự động tạo UV nếu GLB gốc chưa có TEXCOORD0, ép nạp lại shader để bật lấy mẫu ảnh và dọn VRAM cũ.
   */
  applyPropCustomTexture(
    propId: string,
    imageDataUrl: string,
    opts?: {
      sourceKey?: string;
      uvMode?: 'auto' | 'cylindrical' | 'box' | 'original';
      tintHex?: string | null;
      repeatX?: number;
      repeatY?: number;
      offsetX?: number;
      offsetY?: number;
      rotationDeg?: number;
    }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.app || this._destroyed || !propId || !imageDataUrl) {
        resolve(false);
        return;
      }
      const ent = this._findPropEntity(propId);
      if (!ent) {
        resolve(false);
        return;
      }

      // 1. Đảm bảo mesh có UV hợp lệ TRƯỚC khi áp DiffuseMap (khắc phục hoàn toàn lỗi GLB không có TEXCOORD0)
      const uvRes = this.ensurePropMeshUvs(propId, opts?.uvMode ?? 'auto');

      const mis = this._collectPropMeshInstances(ent);
      if (mis.length === 0) {
        resolve(false);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!this.app || this._destroyed) {
          resolve(false);
          return;
        }
        try {
          // Xác định flipY chuẩn: UV tổng hợp luôn theo chuẩn glTF (flipY = false, v=0 trên cùng)
          let targetFlipY = uvRes.synthesized ? false : !ent.tags?.has('prop_glb');
          if (!uvRes.synthesized) {
            for (const mi of mis) {
              const origTex = this._getMaterialOriginalDiffuseMap(mi?.material);
              if (origTex && typeof origTex.flipY === 'boolean') {
                targetFlipY = origTex.flipY;
                break;
              }
            }
          }

          const device = this.app.graphicsDevice;
          const maxAniso = Math.min(8, Math.max(1, Number((device as any)?.maxAnisotropy) || 4));
          const tex = new pc.Texture(device, {
            width: img.naturalWidth || img.width || 1024,
            height: img.naturalHeight || img.height || 1024,
            format: pc.PIXELFORMAT_RGBA8,
            mipmaps: true,
            minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: pc.FILTER_LINEAR,
            addressU: pc.ADDRESS_REPEAT,
            addressV: pc.ADDRESS_REPEAT,
            anisotropy: maxAniso,
            flipY: targetFlipY
          });
          (tex as any).srgb = true;
          tex.setSource(img);
          try { tex.upload(); } catch (_) {}

          const prev = this._propCustomTextures.get(propId);
          this._propCustomTextures.set(propId, {
            texture: tex,
            sourceKey: opts?.sourceKey || imageDataUrl.slice(0, 128)
          });

          const repX = typeof opts?.repeatX === 'number' && opts.repeatX > 0 ? opts.repeatX : 1;
          const repY = typeof opts?.repeatY === 'number' && opts.repeatY > 0 ? opts.repeatY : 1;
          const offX = typeof opts?.offsetX === 'number' ? opts.offsetX : 0;
          const offY = typeof opts?.offsetY === 'number' ? opts.offsetY : 0;
          const rotDeg = typeof opts?.rotationDeg === 'number' ? opts.rotationDeg : 0;
          const hasTint = Boolean(opts?.tintHex && opts.tintHex.toLowerCase() !== '#ffffff');

          for (const mi of mis) {
            const mat = this._ensurePropClonedMaterial(mi);
            if (!mat) continue;
            mat.diffuseMap = tex;
            (mat as any).diffuseMapUv = 0;
            (mat as any).diffuseMapChannel = 'rgb';
            mat.diffuseMapTiling = new pc.Vec2(repX, repY);
            mat.diffuseMapOffset = new pc.Vec2(offX, offY);
            (mat as any).diffuseMapRotation = rotDeg;
            if (hasTint && opts?.tintHex) {
              mat.diffuse = new pc.Color().fromString(opts.tintHex);
              (mat as any).diffuseTint = true;
            } else {
              mat.diffuse = new pc.Color(1, 1, 1);
              (mat as any).diffuseTint = false;
            }
            try { mi.clearShaders?.(); } catch (_) {}
            mat.update();
          }

          if (prev && prev.texture && prev.texture !== tex) {
            try { prev.texture.destroy(); } catch (_) {}
          }
          resolve(true);
        } catch (err) {
          console.error('[SontinhSceneService] applyPropCustomTexture error:', err);
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = imageDataUrl;
    });
  }

  /** Cập nhật màu sắc, Metalness, Roughness, UV Tiling trực tiếp theo thời gian thực trên Canvas 3D */
  applyPropLiveMaterial(
    propId: string,
    patch: {
      color?: string | null;
      metalness?: number;
      roughness?: number;
      opacity?: number;
      emissiveColor?: string;
      emissiveIntensity?: number;
      repeatX?: number;
      repeatY?: number;
      offsetX?: number;
      offsetY?: number;
      rotationDeg?: number;
    }
  ): boolean {
    const ent = this._findPropEntity(propId);
    if (!ent) return false;
    const mis = this._collectPropMeshInstances(ent);
    if (mis.length === 0) return false;

    for (const mi of mis) {
      const mat = this._ensurePropClonedMaterial(mi);
      if (!mat) continue;
      let changed = false;

      if (patch.color !== undefined) {
        if (patch.color && typeof patch.color === 'string' && patch.color.toLowerCase() !== '#ffffff') {
          mat.diffuse = new pc.Color().fromString(patch.color);
          (mat as any).diffuseTint = true;
        } else {
          mat.diffuse = (mat as any)._origDiffuseColor
            ? (mat as any)._origDiffuseColor.clone()
            : new pc.Color(1, 1, 1);
          (mat as any).diffuseTint = Boolean((mat as any)._origDiffuseTint);
        }
        changed = true;
      }

      if (typeof patch.metalness === 'number') {
        mat.useMetalness = true;
        mat.metalness = Math.max(0, Math.min(1, patch.metalness));
        changed = true;
      }

      if (typeof patch.roughness === 'number') {
        mat.useMetalness = true;
        mat.gloss = Math.max(0, Math.min(1, 1.0 - patch.roughness));
        changed = true;
      }

      if (typeof patch.opacity === 'number') {
        if (patch.opacity < 0.99) {
          mat.opacity = Math.max(0, Math.min(1, patch.opacity));
          mat.blendType = pc.BLEND_NORMAL;
          mat.depthWrite = false;
        } else {
          mat.opacity = (mat as any)._baseOpacity ?? 1.0;
          mat.blendType = (mat as any)._baseBlendType ?? pc.BLEND_NONE;
          mat.depthWrite = (mat as any)._baseDepthWrite ?? true;
        }
        changed = true;
      }

      if (patch.emissiveColor !== undefined || patch.emissiveIntensity !== undefined) {
        const c = new pc.Color().fromString(patch.emissiveColor || '#000000');
        const intensity = Math.max(0, Number(patch.emissiveIntensity) || 0);
        mat.emissive = new pc.Color(c.r * intensity, c.g * intensity, c.b * intensity);
        changed = true;
      }

      if (typeof patch.repeatX === 'number' || typeof patch.repeatY === 'number') {
        const curT = mat.diffuseMapTiling || new pc.Vec2(1, 1);
        mat.diffuseMapTiling = new pc.Vec2(
          typeof patch.repeatX === 'number' && patch.repeatX > 0 ? patch.repeatX : curT.x,
          typeof patch.repeatY === 'number' && patch.repeatY > 0 ? patch.repeatY : curT.y
        );
        changed = true;
      }

      if (typeof patch.offsetX === 'number' || typeof patch.offsetY === 'number') {
        const curO = mat.diffuseMapOffset || new pc.Vec2(0, 0);
        mat.diffuseMapOffset = new pc.Vec2(
          typeof patch.offsetX === 'number' ? patch.offsetX : curO.x,
          typeof patch.offsetY === 'number' ? patch.offsetY : curO.y
        );
        changed = true;
      }

      if (typeof patch.rotationDeg === 'number') {
        (mat as any).diffuseMapRotation = patch.rotationDeg;
        changed = true;
      }

      if (changed) mat.update();
    }
    return true;
  }

  /** Khôi phục toàn bộ màu sắc, Texture, UV và PBR của đồ vật 3D về nguyên bản ban đầu của file GLB */
  resetPropMaterialToOriginal(propId: string): boolean {
    const ent = this._findPropEntity(propId);
    if (!ent) return false;
    // Khôi phục UV gốc nếu GLB vốn có UV nguyên bản
    try {
      const info = this.inspectPropMeshGeometry(propId);
      if (info.hasNativeUv) {
        this.ensurePropMeshUvs(propId, 'original');
      }
    } catch (_) {}

    const mis = this._collectPropMeshInstances(ent);
    const prev = this._propCustomTextures.get(propId);
    this._propCustomTextures.delete(propId);

    for (const mi of mis) {
      const mat = mi?.material as any;
      if (!mat || !mat._isClonedInstance) continue;
      mat.diffuseMap = this._getMaterialOriginalDiffuseMap(mat);
      mat.diffuse = mat._origDiffuseColor ? mat._origDiffuseColor.clone() : new pc.Color(1, 1, 1);
      mat.diffuseTint = Boolean(mat._origDiffuseTint);
      if (typeof mat._origUseMetalness === 'boolean') mat.useMetalness = mat._origUseMetalness;
      if (typeof mat._origMetalness === 'number') mat.metalness = mat._origMetalness;
      if (typeof mat._origGloss === 'number') mat.gloss = mat._origGloss;
      mat.emissive = mat._origEmissive ? mat._origEmissive.clone() : new pc.Color(0, 0, 0);
      mat.opacity = mat._baseOpacity ?? 1.0;
      mat.blendType = mat._baseBlendType ?? pc.BLEND_NONE;
      mat.depthWrite = mat._baseDepthWrite ?? true;
      mat.diffuseMapTiling = mat._origDiffuseMapTiling ? mat._origDiffuseMapTiling.clone() : new pc.Vec2(1, 1);
      mat.diffuseMapOffset = mat._origDiffuseMapOffset ? mat._origDiffuseMapOffset.clone() : new pc.Vec2(0, 0);
      mat.diffuseMapRotation = mat._origDiffuseMapRotation ?? 0;
      try { mi.clearShaders?.(); } catch (_) {}
      mat.update();
    }

    if (prev?.texture) {
      try { prev.texture.destroy(); } catch (_) {}
    }
    return true;
  }

  /** Tự động nạp lại ảnh customTexturePath / customTextureDataUrl từ đĩa lên vật thể khi load lại scene */
  private _hydratePropCustomTexture(propId: string, prop: any): void {
    const texPath = typeof prop?.customTexturePath === 'string' ? prop.customTexturePath.trim() : '';
    const texData = typeof prop?.customTextureDataUrl === 'string' ? prop.customTextureDataUrl.trim() : '';
    const sourceKey = texPath || (texData ? texData.slice(0, 128) : '');
    if (!sourceKey) return;

    const existing = this._propCustomTextures.get(propId);
    if (existing && existing.sourceKey === sourceKey) return;

    const uvMode: 'auto' | 'cylindrical' | 'box' | 'original' =
      prop?.textureUvMode === 'cylindrical' || prop?.textureUvMode === 'box' || prop?.textureUvMode === 'original'
        ? prop.textureUvMode
        : 'auto';

    const opts = {
      sourceKey,
      uvMode,
      tintHex: prop?._customColorSet && prop?.color ? prop.color : null,
      repeatX: prop?.textureRepeatX ?? 1,
      repeatY: prop?.textureRepeatY ?? 1,
      offsetX: prop?.textureOffsetX ?? 0,
      offsetY: prop?.textureOffsetY ?? 0,
      rotationDeg: prop?.textureRotation ?? 0
    };

    if (texData) {
      this.applyPropCustomTexture(propId, texData, opts);
      return;
    }

    const electronWin = typeof window !== 'undefined' ? (window as any) : null;
    if (texPath && electronWin?.electron?.readPropTexture) {
      electronWin.electron.readPropTexture(texPath).then((res: any) => {
        if (res?.success && res.dataUrl && !this._destroyed) {
          this.applyPropCustomTexture(propId, res.dataUrl, opts);
        }
      }).catch(() => {});
    }
  }

  /**
   * Load GLB đồ vật do người dùng upload vào scene (blob URL hoặc từ cache glbPath).
   * Wrapper đặt tên PropGLB_<id> để _applyProps tìm và cập nhật transform sau này.
   */
  loadPropGlb(propId: string, blobUrl: string, prop?: any, onLoaded?: (ok: boolean) => void): void {
    if (!this.app || this._destroyed || !propId) { onLoaded?.(false); return; }
    const cacheKey: string | null = (prop && typeof prop.glbPath === 'string' && prop.glbPath.trim()) ? prop.glbPath.trim() : null;

    const instantiateFromAsset = (asset: pc.Asset) => {
      if (this._destroyed || !this.app || !asset?.resource) { onLoaded?.(false); return; }
      if (cacheKey) {
        this._glbAssetCache.set(cacheKey, asset);
        this._propIdToGlbKey.set(propId, cacheKey);
      } else {
        this._propIdToSoloAsset.set(propId, asset);
      }
      const container = asset.resource as any;
      const glbEntity = (container.instantiateRenderEntity?.() ?? container.instantiateModelEntity?.()) as pc.Entity;
      if (!glbEntity) { onLoaded?.(false); return; }
      this._sanitizeGlbEntity(glbEntity, this.app.graphicsDevice);

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

      // Ghi đáy & AABB local của GLB lên wrapper để đo khoảng cách thực tế tới mặt sàn (y = 0)
      // chính xác ở mọi góc xoay / tỷ lệ scale và không bị nhiễu khi nhân vật đang chạy animation
      (wrapper as any)._bottomLocalY = bMin ? bMin.y : null;
      (wrapper as any)._localAabbMin = bMin ? bMin.clone() : null;
      (wrapper as any)._localAabbMax = bMax ? bMax.clone() : null;
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
      if (this._applyProps && prop) {
        try { this._applyProps([prop]); } catch (_) {}
      }
      try {
        this._registerPropRig(propId, wrapper, glbEntity, container, prop);
      } catch (rigErr) {
        console.warn('[SontinhSceneService] Register prop rig warning:', rigErr);
      }
      console.log('[SontinhSceneService] Prop GLB loaded:', propId, 'bottomWorldY=', bottomWorldY, 'finalY=', finalY);
      onLoaded?.(true);
    };

    if (cacheKey && this._glbAssetCache.has(cacheKey)) {
      const cachedAsset = this._glbAssetCache.get(cacheKey)!;
      if (cachedAsset.resource) {
        instantiateFromAsset(cachedAsset);
        return;
      }
      this._glbAssetCache.delete(cacheKey);
    }

    if (!blobUrl) { onLoaded?.(false); return; }
    this.app.assets.loadFromUrl(blobUrl, 'container', (err: any, asset?: pc.Asset) => {
      if (err || !asset?.resource) {
        console.warn('[SontinhSceneService] Prop GLB load failed:', propId, err);
        onLoaded?.(false);
        return;
      }
      instantiateFromAsset(asset);
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
      let envAtlas: pc.Texture | null = null;
      let settled = false;
      const finish = (result: string | null) => {
        if (settled) return;
        settled = true;
        const gl = app?.graphicsDevice?.gl;
        try { if (envAtlas) { envAtlas.destroy(); envAtlas = null; } } catch (_) {}
        try { if (app) app.destroy(); } catch (_) {}
        try { gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch (_) {}
        try { cv.width = 1; cv.height = 1; } catch (_) {}
        resolve(result);
      };
      const timeout = setTimeout(() => finish(null), 15000);
      try {
        app = new pc.Application(cv, {
          graphicsDeviceOptions: { antialias: true, alpha: true, preserveDrawingBuffer: true, depth: true, stencil: false }
        });
        app.setCanvasFillMode(pc.FILLMODE_NONE);
        try { app.graphicsDevice.maxPixelRatio = 1; } catch (_) {}
        app.scene.ambientLight = new pc.Color(0.6, 0.6, 0.65);
        envAtlas = this._createProceduralEnvAtlas(app.graphicsDevice);
        this._applySceneEnvAtlas(app.scene, envAtlas, 1.05);
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
            this._sanitizeGlbEntity(ent, app.graphicsDevice);
            app.root.addChild(ent);

            // Fit camera theo bounding box (thuần số học từ aabb mesh instances)
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            let hasMesh = false;
            const gather = (node: any) => {
              const mis = node?.render?.meshInstances || node?.model?.meshInstances;
              if (mis) {
                for (const mi of mis) {
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
  private _setSelectionRingTempHidden: ((hidden: boolean) => void) | null = null;
  private _getCameraSnapshotFn: (() => { pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number }) | null = null;
  private _restoreCameraSnapshotFn: ((snap: { pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number }) => void) | null = null;
  private _autoFrameSceneForCaptureFn: ((mode: 'all' | 'selected', propId?: string | null, fillRatio?: number, aspectRatio?: string) => boolean) | null = null;
  private _getCaptureSceneSummaryFn: (() => CaptureSceneSummary) | null = null;
  private _getPropFloorElevationFn: ((propId: string) => number | null) | null = null;
  private _snapPropToFloorFn: ((propId: string) => { x: number; y: number; z: number } | null) | null = null;

  /** Đo khoảng cách từ điểm thấp nhất của đồ vật/nhân vật tới mặt sàn studio (y = 0): 0 = chạm sàn, >0 = cao hơn sàn, <0 = lún dưới sàn */
  getPropFloorElevation(propId: string): number | null {
    if (!propId || !this._getPropFloorElevationFn) return null;
    return this._getPropFloorElevationFn(propId);
  }

  /** Đưa điểm thấp nhất của đồ vật/nhân vật về đúng mặt sàn studio (y = 0) và trả về tọa độ mới */
  snapPropToFloor(propId: string): { x: number; y: number; z: number } | null {
    if (!propId || !this._snapPropToFloorFn) return null;
    return this._snapPropToFloorFn(propId);
  }

  /** Ẩn/hiện tạm thời vòng tròn chọn màu xanh khi ghi video 3D để không dính vòng chọn vào video AI */
  setSelectionRingTempHidden(hidden: boolean): void {
    this._setSelectionRingTempHidden?.(hidden);
  }

  /** Lưu nhanh góc camera hiện tại để phục hồi ngay sau khi ghi video 3D */
  getCameraSnapshot(): { pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number } | null {
    return this._getCameraSnapshotFn ? this._getCameraSnapshotFn() : null;
  }

  /** Khôi phục ngay lập tức góc camera đã lưu (không trễ lerp) */
  restoreCameraSnapshot(snap: { pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number } | null): void {
    if (snap && this._restoreCameraSnapshotFn) {
      this._restoreCameraSnapshotFn(snap);
    }
  }

  /** Khóa thao tác zoom (cuộn chuột / chụm 2 ngón) trên canvas 3D */
  cameraZoomLocked = false;
  /** Khóa thao tác xoay quỹ đạo camera (kéo chuột trái / vuốt 1 ngón) trên canvas 3D */
  cameraRotateLocked = false;

  setCameraZoomLocked(locked: boolean): void {
    this.cameraZoomLocked = !!locked;
  }

  setCameraRotateLocked(locked: boolean): void {
    this.cameraRotateLocked = !!locked;
  }

  // ============================================================================
  // CAMERA KEYFRAME PATH ENGINE (XOAY GÓC + ZOOM IN/OUT MƯỢT LIÊN TỤC 60FPS)
  // ============================================================================
  private _cameraPathActive = false;
  private _cameraPathTime = 0;
  private _cameraPathDuration = 5;
  private _cameraPathLoop = false;
  private _cameraPathLastUiTick = -1;
  private _cameraPathKeyframes: CameraKeyframe[] = [];
  onCameraPathTick: ((time: number, playing: boolean) => void) | null = null;

  /**
   * Nội suy vị trí camera (pivot, yaw, pitch, distance) mượt chuẩn điện ảnh (C1 Continuous Monotone Cubic Hermite Spline):
   * - Không phanh dừng khựng lại tại các mốc trung gian (chỉ ease-in/out êm ái ở mốc đầu & mốc cuối).
   * - Nội suy `distance` trong không gian logarit (`exp(spline(ln(d)))`) để tốc độ zoom quang học đều tuyệt đối
   *   khi zoom từ rất xa (d=150) vào cận cảnh (d=3.5) mà không bị vọt tốc đột ngột ở cuối.
   * - Kẹp đơn điệu Fritsch-Carlson chống vọt lố (overshoot) giúp camera không bao giờ lắc ngược hay chui xuống sàn.
   */
  evaluateCameraKeyframesAtTime(
    keyframes: CameraKeyframe[],
    time: number
  ): { pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number } | null {
    if (!Array.isArray(keyframes) || keyframes.length === 0) return null;
    const sorted = [...keyframes].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
    const n = sorted.length;
    const t = Math.max(0, Number(time) || 0);
    if (n === 1 || t <= sorted[0].time) {
      const k = sorted[0];
      return {
        pivot: { x: k.pivot.x, y: k.pivot.y, z: k.pivot.z },
        yaw: k.yaw,
        pitch: k.pitch,
        distance: Math.max(0.5, k.distance)
      };
    }
    const last = sorted[n - 1];
    if (t >= last.time) {
      return {
        pivot: { x: last.pivot.x, y: last.pivot.y, z: last.pivot.z },
        yaw: last.yaw,
        pitch: last.pitch,
        distance: Math.max(0.5, last.distance)
      };
    }

    let segIdx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (t >= sorted[i].time && t <= sorted[i + 1].time) {
        segIdx = i;
        break;
      }
    }

    const times = sorted.map((k) => Number(k.time) || 0);
    const evalChannelSpline = (vals: number[]): number => {
      const h = Math.max(1e-4, times[segIdx + 1] - times[segIdx]);
      const u = Math.max(0, Math.min(1, (t - times[segIdx]) / h));
      if (sorted[segIdx + 1].easing === 'linear') {
        return vals[segIdx] + (vals[segIdx + 1] - vals[segIdx]) * u;
      }

      // Tính độ dốc dây cung d[k] trên từng khoảng thời gian
      const d: number[] = new Array(n - 1);
      for (let k = 0; k < n - 1; k++) {
        const dtSeg = Math.max(1e-4, times[k + 1] - times[k]);
        d[k] = (vals[k + 1] - vals[k]) / dtSeg;
      }

      // Tính tiếp tuyến C1 tại mỗi mốc (m[0] = m[n-1] = 0 để khởi hành & dừng cuối êm ái;
      // các mốc giữa dùng trung bình điều hòa có trọng số thời gian -> chạy liền mạch không khựng dừng!)
      const m: number[] = new Array(n).fill(0);
      for (let k = 1; k < n - 1; k++) {
        const dPrev = d[k - 1];
        const dNext = d[k];
        if (dPrev * dNext <= 0) {
          // Đảo chiều chuyển động tại mốc k -> tiếp tuyến 0 để đảo chiều mượt, không vượt lố
          m[k] = 0;
        } else {
          const hPrev = Math.max(1e-4, times[k] - times[k - 1]);
          const hNext = Math.max(1e-4, times[k + 1] - times[k]);
          const w1 = 2 * hNext + hPrev;
          const w2 = hNext + 2 * hPrev;
          m[k] = (w1 + w2) / (w1 / dPrev + w2 / dNext);
        }
      }

      // Ràng buộc đơn điệu Fritsch-Carlson trên đoạn [segIdx, segIdx+1]
      const dk = d[segIdx];
      let m0 = m[segIdx];
      let m1 = m[segIdx + 1];
      if (Math.abs(dk) < 1e-7) {
        m0 = 0;
        m1 = 0;
      } else {
        const a = m0 / dk;
        const b = m1 / dk;
        const mag = Math.hypot(a, b);
        if (mag > 3) {
          const tau = 3 / mag;
          m0 = tau * a * dk;
          m1 = tau * b * dk;
        }
      }

      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return h00 * vals[segIdx] + h10 * h * m0 + h01 * vals[segIdx + 1] + h11 * h * m1;
    };

    const px = evalChannelSpline(sorted.map((k) => Number(k.pivot.x) || 0));
    const py = evalChannelSpline(sorted.map((k) => Number(k.pivot.y) || 0));
    const pz = evalChannelSpline(sorted.map((k) => Number(k.pivot.z) || 0));
    const yaw = evalChannelSpline(sorted.map((k) => Number(k.yaw) || 0));
    const pitch = evalChannelSpline(sorted.map((k) => Number(k.pitch) || 12));
    // Nội suy khoảng cách trên thang logarit để tốc độ zoom quang học mượt và đồng đều tuyệt đối
    const logDist = evalChannelSpline(sorted.map((k) => Math.log(Math.max(0.5, Number(k.distance) || 12))));
    const distance = Math.max(0.5, Math.exp(logDist));

    return {
      pivot: { x: px, y: py, z: pz },
      yaw,
      pitch,
      distance
    };
  }

  /** Bắt đầu phát đường đi Camera Keyframes đồng bộ 60fps ngay trong vòng lặp render PlayCanvas */
  startCameraKeyframePlayback(
    keyframes: CameraKeyframe[],
    duration: number,
    loop = false,
    startTime = 0
  ): boolean {
    if (!Array.isArray(keyframes) || keyframes.length === 0) return false;
    this._cameraPathKeyframes = [...keyframes]
      .map((k) => ({
        ...k,
        pivot: { x: Number(k.pivot?.x) || 0, y: Number(k.pivot?.y) || 0, z: Number(k.pivot?.z) || 0 },
        yaw: Number(k.yaw) || 0,
        pitch: Number(k.pitch) || 12,
        distance: Math.max(0.5, Number(k.distance) || 12),
        time: Math.max(0, Number(k.time) || 0)
      }))
      .sort((a, b) => a.time - b.time);
    const maxKfTime = this._cameraPathKeyframes[this._cameraPathKeyframes.length - 1]?.time || 0;
    this._cameraPathDuration = Math.max(0.5, Number(duration) || maxKfTime || 5);
    this._cameraPathLoop = !!loop;
    this._cameraPathTime = Math.max(0, Math.min(this._cameraPathDuration, Number(startTime) || 0));
    this._cameraPathLastUiTick = this._cameraPathTime;
    this._cameraPathActive = true;

    const initialSnap = this.evaluateCameraKeyframesAtTime(this._cameraPathKeyframes, this._cameraPathTime);
    if (initialSnap) {
      this.restoreCameraSnapshot(initialSnap);
    }
    this.onCameraPathTick?.(this._cameraPathTime, true);
    return true;
  }

  /** Nhảy camera ngay lập tức tới thời điểm t trên đường Camera Keyframes */
  seekCameraKeyframesAtTime(keyframes: CameraKeyframe[], time: number): void {
    const snap = this.evaluateCameraKeyframesAtTime(keyframes, time);
    if (snap) {
      this.restoreCameraSnapshot(snap);
    }
  }

  /** Dừng phát đường đi Camera Keyframes */
  stopCameraKeyframePlayback(): void {
    const wasActive = this._cameraPathActive;
    this._cameraPathActive = false;
    if (wasActive) {
      this.onCameraPathTick?.(this._cameraPathTime, false);
    }
  }

  isCameraKeyframePlaybackActive(): boolean {
    return this._cameraPathActive;
  }

  /**
   * Tự động căn camera vừa khung cho 1 đối tượng ('selected') hoặc gom trọn tất cả đồ vật đang hiển thị ('all'),
   * tính đồng thời theo cả chiều dọc lẫn chiều ngang của tỷ lệ khung hình mục tiêu để không cắt hụt vật thể.
   */
  autoFrameSceneForCapture(
    mode: 'all' | 'selected' = 'all',
    propId?: string | null,
    fillRatio = 0.68,
    aspectRatio = '16:9'
  ): boolean {
    return this._autoFrameSceneForCaptureFn
      ? this._autoFrameSceneForCaptureFn(mode, propId, fillRatio, aspectRatio)
      : false;
  }

  /** Wrapper tương thích ngược: căn cận 1 đồ vật */
  autoFramePropForCapture(propId?: string | null, fillRatio = 0.68): boolean {
    return this.autoFrameSceneForCapture('selected', propId, fillRatio, '16:9');
  }

  /** Đọc danh sách các đồ vật 3D đang hiển thị (kèm vị trí trái/giữa/phải trên màn hình) và hiệu ứng FX đang bật */
  getCaptureSceneSummary(): CaptureSceneSummary {
    if (this._getCaptureSceneSummaryFn) {
      return this._getCaptureSceneSummaryFn();
    }
    const fxNames = (this.fxEffects || [])
      .filter((f) => f && f.enabled !== false)
      .map((f) => String(f.name || f.fileName || '').trim())
      .filter(Boolean);
    return { props: [], fxNames };
  }

  /** Tìm ID nhân vật có khung xương đầu tiên đang hiển thị trên canvas (nếu người dùng chưa chọn cụ thể) */
  getFirstRiggedPropId(): string | null {
    for (const [pid, rig] of this._propRigMap.entries()) {
      if (rig?.wrapper?.enabled) return pid;
    }
    return null;
  }

  /**
   * Kiểm tra nhân vật/đồ vật có thực sự đang được gắn & bật chạy một hành động chuyển động hay không.
   * Trả về false nếu nhân vật đang đứng yên ở một tư thế tĩnh (chưa gắn hành động, đang tạm dừng,
   * hoặc chỉ có keyframe tại 1 mốc thời gian duy nhất).
   */
  isPropActivelyAnimating(propId: string): boolean {
    const rig = this._propRigMap.get(propId);
    if (!rig || !rig.wrapper?.enabled || !rig.timeline) return false;
    if (!rig.timeline.playing) return false;
    if (rig.timeline.mode === 'clip') {
      const activeName = rig.timeline.activeClipName;
      return !!(activeName && rig.clips.some((c) => c.name === activeName));
    }
    const kfs = rig.timeline.keyframes;
    if (!Array.isArray(kfs) || kfs.length < 2) return false;
    let minT = Infinity;
    let maxT = -Infinity;
    for (const k of kfs) {
      const t = Number(k?.time);
      if (!Number.isFinite(t)) continue;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    return (maxT - minT) > 0.05;
  }

  /**
   * Tua đồng bộ về t=0 CHỈ đối với các nhân vật/đồ vật đang thực sự chạy hành động.
   * Nhân vật nào đang đứng yên ở 1 tư thế tĩnh (chưa gắn hành động hoặc đang dừng) sẽ được GIỮ NGUYÊN
   * tuyệt đối tư thế hiện tại, KHÔNG tự ý bật chạy clip hay keyframe cũ khi ghi video 3D.
   */
  syncAllRiggedPropsForCapture(): number {
    let count = 0;
    for (const [pid, rig] of this._propRigMap.entries()) {
      if (!rig?.wrapper?.enabled) continue;
      if (!this.isPropActivelyAnimating(pid)) continue;
      try {
        this.seekPropTimeline(pid, 0);
        this.setPropTimelinePlaying(pid, true);
        count++;
      } catch (_) {}
    }
    return count;
  }

  /**
   * Đọc tư thế thực tế đang hiển thị của toàn bộ khớp xương (kể cả khi do clip GLB gốc điều khiển)
   * và quy đổi ngược về độ lệch so với tư thế nghỉ trong Character Cardinal Space (poseSpace = 'rest'),
   * đúng nghịch đảo của _applyCharacterSpaceBoneQuat(useTPoseSpace = false).
   */
  private _readRigPoseAsRestDeltas(rig: any): GlbBonePoseEntry[] {
    const out: GlbBonePoseEntry[] = [];
    if (!rig?.bones) return out;
    rig.bones.forEach((b: any) => {
      if (!b?.node || !b.restQuat || !b.charRestQuat) return;
      const lq = b.node.getLocalRotation();
      // qLocalDelta = inv(restQuat) * localQuat ; qCharDelta = charRest * qLocalDelta * inv(charRest)
      const qLocalDelta = new pc.Quat().mul2(b.restQuat.clone().invert(), lq);
      const qTmp = new pc.Quat().mul2(b.charRestQuat, qLocalDelta);
      const qCharDelta = new pc.Quat().mul2(qTmp, b.charRestQuat.clone().invert()).normalize();
      const e = qCharDelta.getEulerAngles();

      const lp = b.node.getLocalPosition();
      const vLocal = new pc.Vec3(lp.x - b.restPos.x, lp.y - b.restPos.y, lp.z - b.restPos.z);
      const vChar = new pc.Vec3();
      (b.parentCharRestQuat || new pc.Quat()).transformVector(vLocal, vChar);
      const scale = b.posUnitScale || 1;

      const rot = {
        x: Math.round((Number(e.x) || 0) * 100) / 100,
        y: Math.round((Number(e.y) || 0) * 100) / 100,
        z: Math.round((Number(e.z) || 0) * 100) / 100
      };
      const pos = {
        x: Math.round(((vChar.x / scale) || 0) * 1000) / 1000,
        y: Math.round(((vChar.y / scale) || 0) * 1000) / 1000,
        z: Math.round(((vChar.z / scale) || 0) * 1000) / 1000
      };
      const hasRot = Math.abs(rot.x) > 0.05 || Math.abs(rot.y) > 0.05 || Math.abs(rot.z) > 0.05;
      const hasPos = Math.abs(pos.x) > 0.001 || Math.abs(pos.y) > 0.001 || Math.abs(pos.z) > 0.001;
      if (hasRot || hasPos) {
        out.push({ boneName: b.name, rot, pos });
      }
    });
    return out;
  }

  /**
   * Lấy "khung hình cuối" của cảnh: tư thế của mọi nhân vật/đồ vật có khung xương tại giây kết thúc video cảnh
   * (sceneDurationSec, tính theo đúng logic ghi video: các rig đang chạy hành động được đồng bộ từ t = 0 và lặp theo clip;
   * rig đang đứng yên giữ nguyên tư thế tĩnh). Sau khi đọc xong, toàn bộ rig được khôi phục lại trạng thái ban đầu.
   */
  async captureRigsEndFramePoses(sceneDurationSec: number): Promise<Map<string, GlbBonePoseEntry[]>> {
    const result = new Map<string, GlbBonePoseEntry[]>();
    const T = Math.max(0.5, Number(sceneDurationSec) || 5);

    // Lưu trạng thái hiện tại của các đồ vật đang gắn ràng buộc handGrabs để khôi phục sạch sau khi chụp
    const savedGrabTargets: Array<{ wrapper: pc.Entity; pos: pc.Vec3; rot: pc.Quat }> = [];
    const seenGrabTargetIds = new Set<string>();
    for (const [, rig] of this._propRigMap.entries()) {
      const grabs: GlbPropGrabConstraint[] = Array.isArray(rig?.timeline?.handGrabs) ? rig.timeline.handGrabs : [];
      for (const g of grabs) {
        if (!g?.targetPropId || seenGrabTargetIds.has(g.targetPropId)) continue;
        seenGrabTargetIds.add(g.targetPropId);
        const tw = this._findPropWrapperEntity(g.targetPropId);
        if (tw) {
          savedGrabTargets.push({ wrapper: tw, pos: tw.getPosition().clone(), rot: tw.getRotation().clone() });
        }
      }
    }

    const savedStates: Array<{
      pid: string;
      rig: any;
      playing: boolean;
      loop: boolean;
      currentTime: number;
      animSpeed: number | null;
      animTime: number | null;
      bones: Array<{ b: any; rot: pc.Quat; pos: pc.Vec3; rd: any; pd: any }>;
    }> = [];

    for (const [pid, rig] of this._propRigMap.entries()) {
      if (!rig?.wrapper?.enabled || !rig.timeline) continue;
      const tl = rig.timeline;
      const animating = this.isPropActivelyAnimating(pid);
      const state = {
        pid,
        rig,
        playing: !!tl.playing,
        loop: tl.loop !== false,
        currentTime: Number(rig.currentTime) || 0,
        animSpeed: rig.animComp ? (Number(rig.animComp.speed) || 0) : null,
        animTime: rig.animComp?.baseLayer ? (Number(rig.animComp.baseLayer.activeStateCurrentTime) || 0) : null,
        bones: [] as Array<{ b: any; rot: pc.Quat; pos: pc.Vec3; rd: any; pd: any }>
      };
      rig.bones.forEach((b: any) => {
        if (!b?.node) return;
        state.bones.push({
          b,
          rot: b.node.getLocalRotation().clone(),
          pos: b.node.getLocalPosition().clone(),
          rd: { ...b.curRotDelta },
          pd: { ...b.curPosDelta }
        });
      });
      savedStates.push(state);
      if (!animating) continue;

      const dur = Math.max(0.1, Number(tl.duration) || 3.0);
      let tEnd: number;
      let holdLast = false;
      if (state.loop) {
        const m = T % dur;
        if (m < 1e-3) {
          tEnd = dur;
          holdLast = true;
        } else {
          tEnd = m;
        }
      } else {
        tEnd = Math.min(T, dur);
        holdLast = tEnd >= dur - 1e-3;
      }

      tl.playing = false;
      const activeClip = rig.clips.find((c: any) => c.name === tl.activeClipName);
      const isNativeClip = tl.mode === 'clip' && !activeClip?.isCustomKeyframeClip && !!rig.animComp?.baseLayer;
      if (isNativeClip) {
        try {
          rig.animComp.speed = 0;
          rig.animComp.baseLayer.activeStateCurrentTime = holdLast ? Math.max(0, dur - 1 / 60) : tEnd;
        } catch (_) {}
        rig.currentTime = tEnd;
      } else {
        if (holdLast) tl.loop = false;
        this.evaluatePropKeyframesAtTime(pid, tEnd);
        tl.loop = state.loop;
      }
    }

    // Chờ vòng lặp PlayCanvas đánh giá xong clip GLB gốc (animComp) tại thời điểm cuối
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(), 30)));
    });

    for (const s of savedStates) {
      try {
        result.set(s.pid, this._readRigPoseAsRestDeltas(s.rig));
      } catch (e) {
        console.warn('[SontinhScene] Đọc khung hình cuối lỗi:', s.pid, e);
      }
    }

    // Khôi phục nguyên trạng các rig
    for (const s of savedStates) {
      const tl = s.rig.timeline;
      tl.loop = s.loop;
      tl.playing = s.playing;
      s.rig.currentTime = s.currentTime;
      if (s.rig.animComp) {
        try {
          if (s.animTime !== null && s.rig.animComp.baseLayer) {
            s.rig.animComp.baseLayer.activeStateCurrentTime = s.animTime;
          }
          if (s.animSpeed !== null) s.rig.animComp.speed = s.animSpeed;
        } catch (_) {}
      }
      for (const bs of s.bones) {
        bs.b.node.setLocalRotation(bs.rot);
        bs.b.node.setLocalPosition(bs.pos);
        bs.b.curRotDelta = bs.rd;
        bs.b.curPosDelta = bs.pd;
      }
    }
    for (const gt of savedGrabTargets) {
      gt.wrapper.setPosition(gt.pos);
      gt.wrapper.setRotation(gt.rot);
    }

    return result;
  }

  /**
   * Đọc vị trí & góc xoay world cuối cùng của các đồ vật đang bị nhân vật nắm giữ tại giây cuối cùng của cảnh
   * (dùng khi bấm Nhân bản để đồ vật đó nằm sẵn trong tay nhân vật ở cảnh tiếp nối).
   */
  captureHandGrabEndTransforms(sceneDurationSec: number): Map<string, { pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number } }> {
    const out = new Map<string, { pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number } }>();
    const T = Math.max(0.5, Number(sceneDurationSec) || 5);
    for (const [pid, rig] of this._propRigMap.entries()) {
      const grabs: GlbPropGrabConstraint[] = Array.isArray(rig?.timeline?.handGrabs) ? rig.timeline.handGrabs : [];
      if (!rig?.wrapper?.enabled || grabs.length === 0) continue;
      const dur = Math.max(0.1, Number(rig.timeline?.duration) || 3.0);
      const tEnd = rig.timeline?.loop ? ((T % dur) < 1e-3 ? dur : (T % dur)) : Math.min(T, dur);
      const prevTime = Number(rig.currentTime) || 0;
      const prevPlaying = !!rig.timeline.playing;
      const savedTargets = grabs.map((g) => {
        const tw = this._findPropWrapperEntity(g.targetPropId);
        return tw ? { id: g.targetPropId, tw, pos: tw.getPosition().clone(), rot: tw.getRotation().clone() } : null;
      }).filter(Boolean) as Array<{ id: string; tw: pc.Entity; pos: pc.Vec3; rot: pc.Quat }>;

      try {
        rig.timeline.playing = false;
        this.evaluatePropKeyframesAtTime(pid, tEnd);
        for (const st of savedTargets) {
          const p = st.tw.getPosition();
          const e = st.tw.getEulerAngles();
          out.set(st.id, {
            pos: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100 },
            rot: { x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100, z: Math.round(e.z * 100) / 100 }
          });
        }
      } finally {
        rig.timeline.playing = prevPlaying;
        this.evaluatePropKeyframesAtTime(pid, prevTime);
        for (const st of savedTargets) {
          st.tw.setPosition(st.pos);
          st.tw.setRotation(st.rot);
        }
      }
    }
    return out;
  }
  getProfilePropById(propId: string): any | null {
    const arr = (this._profile as any)?.props;
    if (!Array.isArray(arr) || !propId) return null;
    return arr.find((p: any) => p && p.id === propId) || null;
  }

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
    let propDragCandidate: { ent: pc.Entity; propId: string; hitPoint?: pc.Vec3 } | null = null;
    let propDragActive = false;
    let dragPlaneY = 0;
    const dragPlaneOrigin = new pc.Vec3();
    const dragPlaneNormal = new pc.Vec3(0, 1, 0);
    let dragStartPos = new pc.Vec3();
    let dragOffset = new pc.Vec3();
    let dragAccY = 0;
    let lastDragY: number | null = null;
    let prevShift = false;
    let selRing: pc.Entity | null = null;
    let selFloorRing: pc.Entity | null = null;
    let selDropLine: pc.Entity | null = null;
    let selFloorRingMat: pc.StandardMaterial | null = null;
    let selDropLineMat: pc.StandardMaterial | null = null;
    let selFloorGuideTone = 0; // 1 = cao hơn sàn (amber), -1 = lún dưới sàn (rose), 0 = chưa đặt
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
      // Nếu nhân vật đang chạy root-motion tự do (tắt In-Place) và xương Hips đi ra xa rest-AABB, dịch tâm ngang theo Hips để click chọn / căn khung luôn trúng
      const nm = String(ent?.name || '');
      const pid = nm.startsWith('PropGLB_') ? nm.slice(8) : nm;
      const rig = pid ? self._propRigMap.get(pid) : null;
      if (bb && rig?.hipsNode) {
        const hp = rig.hipsNode.getPosition();
        const dx = hp.x - bb.center.x;
        const dz = hp.z - bb.center.z;
        if (Math.hypot(dx, dz) > Math.max(0.35, Math.max(bb.halfExtents.x, bb.halfExtents.z) * 0.6)) {
          bb.center.x = hp.x;
          bb.center.z = hp.z;
        }
      }
      return bb;
    }

    /** Tính tọa độ Y thế giới của điểm thấp nhất của đồ vật/nhân vật (sàn chuẩn là Y = 0) */
    function computeEntityBottomWorldY(ent: pc.Entity): number | null {
      if (!ent) return null;
      const p = ent.getPosition();
      const s = ent.getLocalScale();
      const localMin = (ent as any)._localAabbMin as pc.Vec3 | null | undefined;
      const localMax = (ent as any)._localAabbMax as pc.Vec3 | null | undefined;
      if (localMin && localMax) {
        const rot = ent.getRotation();
        let minCornerY = Infinity;
        const v = new pc.Vec3();
        for (const cx of [localMin.x, localMax.x]) {
          for (const cy of [localMin.y, localMax.y]) {
            for (const cz of [localMin.z, localMax.z]) {
              v.set(cx * s.x, cy * s.y, cz * s.z);
              rot.transformVector(v, v);
              if (v.y < minCornerY) minCornerY = v.y;
            }
          }
        }
        if (Number.isFinite(minCornerY)) {
          return p.y + minCornerY;
        }
      }
      const bottomLocalY = (ent as any)._bottomLocalY;
      if (typeof bottomLocalY === 'number' && Number.isFinite(bottomLocalY)) {
        return p.y + bottomLocalY * s.y;
      }
      // Fallback tức thời cho đồ vật primitive / mesh không có _localAabbMin: biến đổi mesh.aabb bằng worldTransform hiện tại
      let minMeshY = Infinity;
      const renders = ent.findComponents('render') as any[];
      const pt = new pc.Vec3();
      const out = new pc.Vec3();
      for (const r of renders) {
        const mis = r.meshInstances || [];
        for (const mi of mis) {
          const ma = mi?.mesh?.aabb;
          const wt = mi?.node?.getWorldTransform?.();
          if (ma && wt) {
            const loX = ma.center.x - ma.halfExtents.x, hiX = ma.center.x + ma.halfExtents.x;
            const loY = ma.center.y - ma.halfExtents.y, hiY = ma.center.y + ma.halfExtents.y;
            const loZ = ma.center.z - ma.halfExtents.z, hiZ = ma.center.z + ma.halfExtents.z;
            for (const cx of [loX, hiX]) {
              for (const cy of [loY, hiY]) {
                for (const cz of [loZ, hiZ]) {
                  pt.set(cx, cy, cz);
                  wt.transformPoint(pt, out);
                  if (out.y < minMeshY) minMeshY = out.y;
                }
              }
            }
          }
        }
      }
      if (Number.isFinite(minMeshY)) return minMeshY;
      const bb = collectAabb(ent);
      return bb ? (bb.center.y - bb.halfExtents.y) : null;
    }

    /** Hiển thị vòng chiếu lên mặt sàn (y = 0) + đường dóng thẳng đứng khi đối tượng đang chọn lơ lửng hoặc lún dưới sàn */
    function syncFloorGuide(ent: pc.Entity, cx: number, cz: number): void {
      if (!selFloorRing || !selDropLine || !selFloorRingMat || !selDropLineMat) return;
      if (!selRing || !selRing.enabled) {
        selFloorRing.enabled = false;
        selDropLine.enabled = false;
        return;
      }
      const bottomY = computeEntityBottomWorldY(ent);
      if (bottomY === null || Math.abs(bottomY) <= 0.03) {
        selFloorRing.enabled = false;
        selDropLine.enabled = false;
        return;
      }
      const isAbove = bottomY > 0;
      const tone = isAbove ? 1 : -1;
      if (selFloorGuideTone !== tone) {
        selFloorGuideTone = tone;
        const cr = 0.96;
        const cg = isAbove ? 0.62 : 0.25;
        const cb = isAbove ? 0.08 : 0.37;
        selFloorRingMat.emissive.set(cr, cg, cb);
        selFloorRingMat.update();
        selDropLineMat.emissive.set(cr, cg, cb);
        selDropLineMat.update();
      }
      const ringS = selRing.getLocalScale();
      const d = Math.max(0.6, ringS.x);
      selFloorRing.setLocalScale(d, 0.2, d);
      selFloorRing.setPosition(cx, 0.02, cz);
      selFloorRing.enabled = true;

      const spanH = Math.max(0.02, Math.abs(bottomY));
      const lineThickness = Math.max(0.035, Math.min(0.11, d * 0.016));
      selDropLine.setLocalScale(lineThickness, spanH, lineThickness);
      selDropLine.setPosition(cx, bottomY * 0.5, cz);
      selDropLine.enabled = true;
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

      // Vòng chiếu trên mặt sàn (y = 0.02) và đường dóng dọc báo trực quan độ cao lơ lửng / lún sàn
      selFloorRing = new pc.Entity('PropSelRing_FloorRef');
      selFloorRingMat = new pc.StandardMaterial();
      selFloorRingMat.diffuse = new pc.Color(0, 0, 0);
      selFloorRingMat.emissive = new pc.Color(0.96, 0.62, 0.08);
      selFloorRingMat.emissiveIntensity = 1.15;
      selFloorRingMat.opacity = 0.72;
      selFloorRingMat.blendType = pc.BLEND_NORMAL;
      selFloorRingMat.depthWrite = false;
      selFloorRingMat.cull = pc.CULLFACE_NONE;
      selFloorRingMat.update();
      const floorRingMesh = pc.Mesh.fromGeometry(
        app.graphicsDevice,
        new pc.TorusGeometry({
          ringRadius: 0.485,
          tubeRadius: 0.012,
          segments: 48,
          sides: 12
        })
      );
      const floorMi = new pc.MeshInstance(floorRingMesh, selFloorRingMat);
      floorMi.castShadow = false;
      floorMi.pick = false;
      selFloorRing.addComponent('render', { meshInstances: [floorMi], castShadows: false, receiveShadows: false });
      selFloorRing.tags.add('sel_ring');
      app.root.addChild(selFloorRing);
      selFloorRing.enabled = false;

      selDropLine = new pc.Entity('PropSelRing_DropLine');
      selDropLineMat = new pc.StandardMaterial();
      selDropLineMat.diffuse = new pc.Color(0, 0, 0);
      selDropLineMat.emissive = new pc.Color(0.96, 0.62, 0.08);
      selDropLineMat.emissiveIntensity = 1.2;
      selDropLineMat.opacity = 0.85;
      selDropLineMat.blendType = pc.BLEND_NORMAL;
      selDropLineMat.depthWrite = false;
      selDropLineMat.update();
      const dropMesh = pc.Mesh.fromGeometry(
        app.graphicsDevice,
        new pc.CylinderGeometry({
          radius: 0.5,
          height: 1,
          heightSegments: 1,
          capSegments: 10
        })
      );
      const dropMi = new pc.MeshInstance(dropMesh, selDropLineMat);
      dropMi.castShadow = false;
      dropMi.pick = false;
      selDropLine.addComponent('render', { meshInstances: [dropMi], castShadows: false, receiveShadows: false });
      selDropLine.tags.add('sel_ring');
      app.root.addChild(selDropLine);
      selDropLine.enabled = false;
    }

    function hideSelRing() {
      if (selRing) selRing.enabled = false;
      if (selFloorRing) selFloorRing.enabled = false;
      if (selDropLine) selDropLine.enabled = false;
      // FIX(bug bo nut Delete/Duplicate treo tren canvas): phai reset luon
      // selRingPropId va KHONG tu gan lastAnchorVisible = false tai day.
      // Gan tracker = false o nay de ticker trong app.on('update') thay
      // visible === lastAnchorVisible (false === false) nen khong bao gio
      // phat callback onPropActionAnchor(false,...) de an cap nut HTML.
      // Giu nguyen gia tri tracker cu de ticker tu nhan ra lech trang thai
      // (false !== true) va phat lenh an nut dung mot lan duy nhat.
      selRingPropId = null;
    }

    let _selRingWasEnabledBeforeTempHide = false;
    self._setSelectionRingTempHidden = (hidden: boolean) => {
      if (!selRing) return;
      if (hidden) {
        _selRingWasEnabledBeforeTempHide = Boolean(selRing.enabled);
        selRing.enabled = false;
        if (selFloorRing) selFloorRing.enabled = false;
        if (selDropLine) selDropLine.enabled = false;
      } else if (_selRingWasEnabledBeforeTempHide && selRingPropId) {
        selRing.enabled = true;
        _selRingWasEnabledBeforeTempHide = false;
        const ent = findPropEntityById(selRingPropId);
        if (ent) {
          const rp = selRing.getPosition();
          syncFloorGuide(ent, rp.x, rp.z);
        }
      }
    };

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
        moveSelRing(ent);
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

    self._getPropFloorElevationFn = (propId: string): number | null => {
      const ent = findPropEntityById(propId);
      if (!ent) return null;
      const bottomY = computeEntityBottomWorldY(ent);
      if (bottomY === null || !Number.isFinite(bottomY)) return null;
      const val = round2(bottomY);
      return Math.abs(val) < 0.005 ? 0 : val;
    };

    self._snapPropToFloorFn = (propId: string): { x: number; y: number; z: number } | null => {
      if (!propId || self.isPropLocked(propId)) return null;
      const ent = findPropEntityById(propId);
      if (!ent) return null;
      const bottomY = computeEntityBottomWorldY(ent);
      if (bottomY === null || !Number.isFinite(bottomY)) return null;
      const p = ent.getPosition();
      const targetY = round2(p.y - bottomY);
      ent.setPosition(p.x, targetY, p.z);
      const animCfg = propAnimMap.get(ent.name) || propAnimMap.get(propId);
      if (animCfg) animCfg.basePos.set(p.x, targetY, p.z);
      const pos = { x: round2(p.x), y: targetY, z: round2(p.z) };
      const s = ent.getLocalScale();
      const rec = (_svc._profile as any)?.props?.find((pr: any) => pr && pr.id === propId);
      if (rec) {
        rec.position = { ...pos };
        rec._customPositionSet = true;
        rec._groundedAtScale = { x: round2(s.x), y: round2(s.y), z: round2(s.z) };
      }
      if (selRingPropId === propId) {
        showSelRing(ent);
      }
      if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(propId, pos));
      return pos;
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

      // Xóa mọi entity đồ vật người dùng (GLB wrapper + primitive) và giải phóng GPU asset
      if (app?.root) {
        for (const ent of app.root.findByTag('user_prop') as pc.Entity[]) {
          try { ent.destroy(); } catch (_) {}
        }
      }
      self.clearAllPropGlbAssets();

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
      self.releasePropGlbAsset(propId);
      if (propAnimMap.has(ent.name)) propAnimMap.delete(ent.name);
      if (propAnimMap.has(propId)) propAnimMap.delete(propId);
      if (selRingPropId === propId || tScrubPropId === propId) hideSelRing();
      hideSelRing();
      if (_svc.onPropSelected) _svc.ngZone.run(() => _svc.onPropSelected!(null, null));
      return true;
    };

    // Nhân bản đồ vật/nhân vật đang chọn: bản sao đặt cạnh phải, tự khởi tạo lại rig khớp xương +
    // chuyển động + chất liệu/texture độc lập để hoạt động NGAY lập tức không cần F5.
    self._duplicatePropById = (propId: string): string | null => {
      if (!propId || !app) return null;
      const src = findPropEntityById(propId);
      if (!src) return null;
      try {
        const newId = `${propId}_${Date.now()}`;

        // Vị trí bản sao: cạnh phải món gốc theo bounding box, lề 0.5
        const aabb = collectAabb(src);
        let off = 1.2;
        if (aabb) off = aabb.halfExtents.x * 2 + 0.5;
        const sp = src.getPosition();
        const np = { x: sp.x + off, y: sp.y, z: sp.z };
        const sr = src.getEulerAngles();
        const ss = src.getLocalScale();

        const srcProp = (_svc._profile as any)?.props?.find((pr: any) => pr?.id === propId);
        const srcRig = self._propRigMap.get(propId) || null;
        const name0 = srcProp?.name || propId;
        const cnt = ((_svc._profile as any)?.props || []).filter((pr: any) => pr?.name?.startsWith(name0)).length;

        // Sao chép trọn bộ cấu hình Timeline sống (ưu tiên trạng thái đang phát trên canvas)
        let clonedBoneTimeline: GlbPropTimelineData | undefined = undefined;
        if (srcRig?.timeline) {
          clonedBoneTimeline = JSON.parse(JSON.stringify(srcRig.timeline));
        } else if (srcProp?.boneTimeline) {
          clonedBoneTimeline = JSON.parse(JSON.stringify(srcProp.boneTimeline));
        }

        // Xây dựng record bản sao giữ đầy đủ thuộc tính transform, PBR, texture, animation & timeline
        const newProp: any = {
          id: newId,
          name: cnt > 0 ? `${name0} ${cnt + 1}` : name0,
          type: srcProp?.type || 'model',
          // Giữ shape của món gốc (model/primitive) để syncProps không sinh khối hộp ma cho bản sao
          shape: srcProp?.shape || 'model',
          glbPath: srcProp?.glbPath || '',
          thumbnail: srcProp?.thumbnail || null,
          position: { x: Math.round(np.x * 100) / 100, y: Math.round(np.y * 100) / 100, z: Math.round(np.z * 100) / 100 },
          _customPositionSet: true,
          rotation: {
            x: Math.round((srcProp?.rotation?.x ?? sr.x) * 10) / 10,
            y: Math.round((srcProp?.rotation?.y ?? sr.y) * 10) / 10,
            z: Math.round((srcProp?.rotation?.z ?? sr.z) * 10) / 10
          },
          _customRotationSet: true,
          scale: {
            x: Math.round(ss.x * 1000) / 1000,
            y: Math.round(ss.y * 1000) / 1000,
            z: Math.round(ss.z * 1000) / 1000
          },
          _customScaleSet: true,
          _groundedAtScale: {
            x: Math.round(ss.x * 1000) / 1000,
            y: Math.round(ss.y * 1000) / 1000,
            z: Math.round(ss.z * 1000) / 1000
          },
          color: srcProp?.color ?? null,
          _customColorSet: Boolean(srcProp?._customColorSet),
          visible: true,
          interactive: srcProp?.interactive ?? true,
          clickAction: srcProp?.clickAction || 'focus',
          locked: !!srcProp?.locked,
          // Bản sao chỉ tồn tại trên canvas 3D: không thêm mục mới trong menu ĐỒ VẬT
          hiddenFromList: true
        };

        if (srcProp) {
          if (srcProp.castShadow !== undefined) newProp.castShadow = srcProp.castShadow;
          if (typeof srcProp.metalness === 'number') newProp.metalness = srcProp.metalness;
          if (srcProp._customMetalnessSet) newProp._customMetalnessSet = true;
          if (typeof srcProp.roughness === 'number') newProp.roughness = srcProp.roughness;
          if (srcProp._customRoughnessSet) newProp._customRoughnessSet = true;
          if (typeof srcProp.opacity === 'number') newProp.opacity = srcProp.opacity;
          if (srcProp._customOpacitySet) newProp._customOpacitySet = true;
          if (srcProp.emissiveColor !== undefined) newProp.emissiveColor = srcProp.emissiveColor;
          if (srcProp.emissiveIntensity !== undefined) newProp.emissiveIntensity = srcProp.emissiveIntensity;
          if (srcProp._customEmissiveSet) newProp._customEmissiveSet = true;
          if (srcProp.customTexturePath) newProp.customTexturePath = srcProp.customTexturePath;
          if (srcProp.customTextureDataUrl) newProp.customTextureDataUrl = srcProp.customTextureDataUrl;
          if (srcProp.textureUvMode) newProp.textureUvMode = srcProp.textureUvMode;
          if (typeof srcProp.textureRepeatX === 'number') newProp.textureRepeatX = srcProp.textureRepeatX;
          if (typeof srcProp.textureRepeatY === 'number') newProp.textureRepeatY = srcProp.textureRepeatY;
          if (typeof srcProp.textureOffsetX === 'number') newProp.textureOffsetX = srcProp.textureOffsetX;
          if (typeof srcProp.textureOffsetY === 'number') newProp.textureOffsetY = srcProp.textureOffsetY;
          if (typeof srcProp.textureRotation === 'number') newProp.textureRotation = srcProp.textureRotation;
          if (srcProp.animation) newProp.animation = JSON.parse(JSON.stringify(srcProp.animation));
        }
        if (clonedBoneTimeline) {
          newProp.boneTimeline = clonedBoneTimeline;
        }

        // Tìm pc.Asset container đã lưu trong RAM để instantiate mới hoàn toàn (SkinInstance + xương + anim độc lập)
        const cacheKey = self._propIdToGlbKey.get(propId) || (srcProp?.glbPath ? String(srcProp.glbPath).trim() : null);
        const cachedAsset =
          (cacheKey ? self._glbAssetCache.get(cacheKey) : null) ||
          self._propIdToSoloAsset.get(propId) ||
          null;

        let clone: pc.Entity;

        if (cachedAsset?.resource && (src.tags?.has('prop_glb') || src.name.startsWith('PropGLB_'))) {
          // Ghi nhận tham chiếu cache cho bản sao để xóa bản gốc không hủy nhầm GPU asset của bản sao
          if (cacheKey && self._glbAssetCache.has(cacheKey)) {
            self._propIdToGlbKey.set(newId, cacheKey);
          } else {
            self._propIdToSoloAsset.set(newId, cachedAsset);
          }

          const container = cachedAsset.resource as any;
          const glbEntity = (container.instantiateRenderEntity?.() ?? container.instantiateModelEntity?.()) as pc.Entity;
          if (!glbEntity) return null;
          self._sanitizeGlbEntity(glbEntity, app.graphicsDevice);

          const wrapper = new pc.Entity(`PropGLB_${newId}`);
          wrapper.tags.add('user_prop');
          wrapper.tags.add('prop_glb');
          (wrapper as any)._bottomLocalY = (src as any)._bottomLocalY ?? null;
          (wrapper as any)._localAabbMin = (src as any)._localAabbMin ? (src as any)._localAabbMin.clone() : null;
          (wrapper as any)._localAabbMax = (src as any)._localAabbMax ? (src as any)._localAabbMax.clone() : null;

          wrapper.setLocalScale(ss.x, ss.y, ss.z);
          wrapper.setRotation(src.getRotation().clone());
          wrapper.setPosition(np.x, np.y, np.z);
          wrapper.addChild(glbEntity);
          glbEntity.setLocalPosition(0, 0, 0);
          app.root.addChild(wrapper);
          clone = wrapper;

          // Đồng bộ mảng profile.props trước khi áp material & rig
          const arr = ((_svc._profile as any).props = ((_svc._profile as any).props || []));
          arr.push(newProp);

          // Áp PBR & custom texture đã lưu
          if (self._applyProps) {
            try { self._applyProps([newProp]); } catch (_) {}
          }

          // Nếu bản gốc có texture tùy chỉnh chưa kịp lưu ra đĩa, sao chép ảnh trực tiếp từ RAM sang bản sao
          const srcCustomTex = self._propCustomTextures.get(propId);
          if (srcCustomTex && !newProp.customTexturePath && !newProp.customTextureDataUrl) {
            try {
              const rawImg: any = srcCustomTex.texture?.getSource?.(0) ?? (srcCustomTex.texture as any)?._levels?.[0];
              let liveDataUrl: string | null = null;
              if (rawImg && typeof rawImg.src === 'string' && rawImg.src.startsWith('data:')) {
                liveDataUrl = rawImg.src;
              } else if (rawImg && (rawImg instanceof HTMLImageElement || rawImg instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && rawImg instanceof ImageBitmap))) {
                const cv = document.createElement('canvas');
                cv.width = (rawImg as any).naturalWidth || (rawImg as any).width || 1024;
                cv.height = (rawImg as any).naturalHeight || (rawImg as any).height || 1024;
                const ctx = cv.getContext('2d');
                if (ctx) {
                  ctx.drawImage(rawImg, 0, 0, cv.width, cv.height);
                  liveDataUrl = cv.toDataURL('image/png');
                }
              }
              if (liveDataUrl) {
                const geomInfo = self.inspectPropMeshGeometry(propId);
                newProp.customTextureDataUrl = liveDataUrl;
                newProp.textureUvMode = newProp.textureUvMode || geomInfo.activeUvMode;
                void self.applyPropCustomTexture(newId, liveDataUrl, {
                  sourceKey: `dup_${Date.now()}`,
                  uvMode: newProp.textureUvMode || 'auto',
                  tintHex: newProp._customColorSet && newProp.color ? newProp.color : null,
                  repeatX: newProp.textureRepeatX ?? 1,
                  repeatY: newProp.textureRepeatY ?? 1,
                  offsetX: newProp.textureOffsetX ?? 0,
                  offsetY: newProp.textureOffsetY ?? 0,
                  rotationDeg: newProp.textureRotation ?? 0
                });
              }
            } catch (_) {}
          }

          // Đăng ký khung xương (Rig), chép cả các clip animation nạp ngoài từ bản gốc và kích hoạt chuyển động NGAY
          try {
            self._registerPropRig(newId, wrapper, glbEntity, container, newProp);
            const newRig = self._propRigMap.get(newId);
            if (srcRig && newRig) {
              // Sao chép các clip .glb animation rời đã nạp thêm vào bản gốc (không có sẵn trong container gốc)
              for (const c of srcRig.clips) {
                if (!c || c.isCustomKeyframeClip || !c.resource) continue;
                if (!newRig.clips.some((nc) => nc.name === c.name)) {
                  newRig.clips.push({
                    name: c.name,
                    duration: c.duration,
                    resource: c.resource,
                    isCustomKeyframeClip: false
                  });
                }
              }
              // Đồng bộ chính xác clip đang phát / thời điểm đang chạy hoặc đang tạm dừng theo trạng thái sống của srcRig
              const srcTl = srcRig.timeline;
              const tl = newRig.timeline;
              tl.enabled = srcTl.enabled;
              tl.playing = srcTl.playing;
              tl.loop = srcTl.loop;
              tl.speed = srcTl.speed;
              tl.mode = srcTl.mode;
              const desiredClipName = srcTl.activeClipName || tl.activeClipName;
              const startTime = Number(srcRig.currentTime) || 0;
              if (srcTl.mode === 'clip' && desiredClipName) {
                const targetClip = newRig.clips.find((c) => c.name === desiredClipName) || newRig.clips[0];
                if (targetClip) {
                  tl.activeClipName = targetClip.name;
                  tl.duration = targetClip.duration;
                  if (srcTl.playing) {
                    self.playPropClip(newId, targetClip.name);
                    if (targetClip.isCustomKeyframeClip) {
                      newRig.currentTime = startTime % Math.max(0.1, tl.duration || 3.0);
                      self.evaluatePropKeyframesAtTime(newId, newRig.currentTime);
                    } else if (newRig.animComp?.baseLayer) {
                      try {
                        newRig.animComp.baseLayer.transition(targetClip.name, 0);
                        newRig.animComp.baseLayer.activeStateCurrentTime = startTime % Math.max(0.1, targetClip.duration || 2.5);
                        newRig.animComp.speed = tl.speed || 1.0;
                        newRig.animComp.playing = true;
                      } catch (_) {}
                    }
                  } else {
                    self.playPropClip(newId, targetClip.name);
                    self.setPropTimelinePlaying(newId, false);
                    self.seekPropTimeline(newId, startTime);
                  }
                }
              } else if (srcTl.mode === 'keyframes' && tl.keyframes.length > 0) {
                self._stopRigClipAnim(newRig);
                newRig.currentTime = startTime % Math.max(0.1, tl.duration || 3.0);
                self.evaluatePropKeyframesAtTime(newId, newRig.currentTime);
              }
            }
          } catch (rigErr) {
            console.warn('[SontinhScene] Duplicate rig registration warning:', rigErr);
          }
        } else {
          // Fallback cho đồ vật primitive / hình khối không dùng GLB container
          clone = src.clone() as pc.Entity;
          clone.name = src.name.startsWith('PropGLB_') ? `PropGLB_${newId}` : newId;
          if (!(clone as any).tags?.has('user_prop')) (clone as any).tags?.add('user_prop');
          if (src.tags?.has('prop_glb') && !(clone as any).tags?.has('prop_glb')) {
            (clone as any).tags?.add('prop_glb');
          }
          clone.setPosition(np.x, np.y, np.z);
          app.root.addChild(clone);

          const arr = ((_svc._profile as any).props = ((_svc._profile as any).props || []));
          arr.push(newProp);
          if (self._applyProps) {
            try { self._applyProps([newProp]); } catch (_) {}
          }
        }

        // Sao chép chuyển động procedural (nổi/xoay/nhịp) nếu bản gốc đang có trong propAnimMap
        const srcProcAnim = propAnimMap.get(src.name) || propAnimMap.get(propId);
        if (srcProcAnim) {
          propAnimMap.set(clone.name, {
            type: srcProcAnim.type,
            speed: srcProcAnim.speed,
            basePos: new pc.Vec3(np.x, np.y, np.z),
            baseScale: clone.getLocalScale().clone()
          });
        }

        // Chọn luôn bản sao mới (ring ôm bản sao) — gọi SAU khi đăng ký rig để nút Timeline sáng ngay
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

    function getPropSelectionCenterWorld(ent: pc.Entity, propId?: string | null): { x: number; y: number; z: number } {
      const ep = ent.getPosition();
      const pid = propId || (ent.name.startsWith('PropGLB_') ? ent.name.slice(8) : ent.name);
      const rig = pid ? _svc._propRigMap.get(pid) : null;
      if (rig?.hipsNode) {
        const hp = rig.hipsNode.getPosition();
        return { x: hp.x, y: ep.y, z: hp.z };
      }
      if (rig?.glbEntity) {
        const localMin: pc.Vec3 | null = (ent as any)._localAabbMin || null;
        const localMax: pc.Vec3 | null = (ent as any)._localAabbMax || null;
        if (localMin && localMax) {
          const cx = (localMin.x + localMax.x) * 0.5;
          const cz = (localMin.z + localMax.z) * 0.5;
          const wt = rig.glbEntity.getWorldTransform();
          const worldCenter = wt.transformPoint(new pc.Vec3(cx, 0, cz), new pc.Vec3());
          return { x: worldCenter.x, y: rig.glbEntity.getPosition().y, z: worldCenter.z };
        }
        const gp = rig.glbEntity.getPosition();
        return { x: gp.x, y: gp.y, z: gp.z };
      }
      return { x: ep.x, y: ep.y, z: ep.z };
    }

    function showSelRing(ent: pc.Entity) {
      ensureSelRing();
      if (!selRing) return;
      const nm = ent.name;
      const pid = nm.startsWith('PropGLB_') ? nm.slice(8) : nm;
      const bb = collectAabb(ent);
      const p = ent.getPosition();
      const c = getPropSelectionCenterWorld(ent, pid);
      const bottomY = computeEntityBottomWorldY(ent);
      const extraY = c.y - p.y;
      if (bb) {
        const r = Math.max(bb.halfExtents.x, bb.halfExtents.z) + 0.25;
        const d = Math.max(0.6, r * 2);
        selRing.setLocalScale(d, 0.25, d);
        ringOffsetY = bottomY !== null ? (p.y - bottomY) : (p.y - (bb.center.y - bb.halfExtents.y));
        selRing.setPosition(c.x, p.y - ringOffsetY + extraY + 0.04, c.z);
      } else {
        ringOffsetY = bottomY !== null ? (p.y - bottomY) : 0.4;
        selRing.setLocalScale(1.6, 0.25, 1.6);
        selRing.setPosition(c.x, p.y - ringOffsetY + extraY + 0.04, c.z);
      }
      selRingBaseD = selRing.getLocalScale().x;
      selRingBaseOffsetY = ringOffsetY;
      const s0 = ent.getLocalScale();
      selRingBaseScaleXZ = Math.max(0.0001, (s0.x + s0.z) * 0.5);
      selRingBaseScaleY = Math.max(0.0001, s0.y);
      selRing.enabled = true;
      selRingPropId = pid;
      syncFloorGuide(ent, c.x, c.z);
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
      const c = getPropSelectionCenterWorld(ent, selRingPropId);
      const bottomY = computeEntityBottomWorldY(ent);
      const extraY = c.y - p.y;
      const ringY = (bottomY !== null ? bottomY + extraY : p.y - ringOffsetY + extraY) + 0.04;
      selRing.setPosition(c.x, ringY, c.z);
      syncFloorGuide(ent, c.x, c.z);
    }

    function setupDragPlane(sx: number, sy: number, entPos: pc.Vec3, initialHitPoint?: pc.Vec3) {
      if (initialHitPoint) {
        dragPlaneOrigin.copy(initialHitPoint);
      } else {
        dragPlaneOrigin.copy(entPos);
      }
      // Khi góc nhìn camera thấp (ví dụ pitch = 12 độ ở chế độ Studio), mặt phẳng nằm ngang thuần túy
      // sẽ cắt đường chân trời ngay giữa màn hình khiến tia ray trượt ra vô cực phía xa.
      // Nghiêng nhẹ pháp tuyến mặt phẳng kéo về phía camera tối thiểu 32 độ giúp kéo gần/xa mượt tuyệt đối.
      const tiltRad = Math.max(0, (32 - orbitPitch) * pc.math.DEG_TO_RAD);
      const yawRad = orbitYaw * pc.math.DEG_TO_RAD;
      const sinT = Math.sin(tiltRad);
      const cosT = Math.cos(tiltRad);
      dragPlaneNormal.set(
        Math.sin(yawRad) * sinT,
        cosT,
        Math.cos(yawRad) * sinT
      ).normalize();

      const hit0 = rayDragPlaneHit(sx, sy);
      // QUAN TRỌNG: np = hit + dragOffset => tại điểm bắt đầu kéo (hit = hit0), np phải bằng đúng entPos:
      // entPos = hit0 + dragOffset  ==>  dragOffset = entPos - hit0
      dragOffset = hit0 ? entPos.clone().sub(hit0) : new pc.Vec3();
    }

    function rayDragPlaneHit(sx: number, sy: number): pc.Vec3 | null {
      if (!camera || !camera.camera) return null;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(sx, sy, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(sx, sy, camera.camera.farClip, rayTo);
      const dir = rayTo.clone().sub(rayFrom).normalize();
      const denom = dir.dot(dragPlaneNormal);
      if (Math.abs(denom) < 1e-4) return null;
      const diff = dragPlaneOrigin.clone().sub(rayFrom);
      const t = diff.dot(dragPlaneNormal) / denom;
      if (t <= 0) return null;
      const maxT = Math.max(250, orbitDistance * 4.5);
      return rayFrom.add(dir.scale(Math.min(t, maxT)));
    }

    function pickUserPropAt(sx: number, sy: number): { ent: pc.Entity; propId: string; hitPoint: pc.Vec3 } | null {
      if (!camera || !camera.camera) return null;
      const rayFrom = new pc.Vec3();
      const rayTo = new pc.Vec3();
      camera.camera.screenToWorld(sx, sy, camera.camera.nearClip, rayFrom);
      camera.camera.screenToWorld(sx, sy, camera.camera.farClip, rayTo);
      const dir = rayTo.clone().sub(rayFrom).normalize();
      const ray = new pc.Ray(rayFrom, dir);
      let best: { ent: pc.Entity; propId: string; hitPoint: pc.Vec3 } | null = null;
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
            best = { ent, propId: pid0, hitPoint: hit.clone() };
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

    function beginPropDrag(hit: { ent: pc.Entity; propId: string; hitPoint?: pc.Vec3 }) {
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
        setupDragPlane(mouseDownPos.x, mouseDownPos.y, p, propDragCandidate.hitPoint);
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
        const curPos = ent.getPosition();
        ent.setPosition(curPos.x, ny, curPos.z);
        dragPlaneY = ny;
      } else {
        if (prevShift) {
          const curP = ent.getPosition();
          dragStartPos.copy(curP);
          dragPlaneY = curP.y;
          setupDragPlane(sx, sy, curP);
        }
        const hit = rayDragPlaneHit(sx, sy);
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
        this._studioLighting.bgColor = opts.bg;
        if (this._applyStudioLightingFn) {
          try { this._applyStudioLightingFn(this._studioLighting); } catch (_) {}
        }
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
        depth: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
        stencil: false
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

    const sceneEnvAtlas = this._createProceduralEnvAtlas(app.graphicsDevice);
    this._applySceneEnvAtlas(app.scene, sceneEnvAtlas, 0.95);

    // Cleanup khi destroy
    const origDestroy = app.destroy.bind(app);
    app.destroy = () => {
      ro.disconnect();
      try { if (sceneEnvAtlas) sceneEnvAtlas.destroy(); } catch (_) {}
      origDestroy();
    };

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
      shadowBias: 0.05,
      normalOffsetBias: 0.05,
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
      nearClip: 0.25,
      farClip: 1500,
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

    self._getCameraSnapshotFn = () => ({
      pivot: { x: currentPivot.x, y: currentPivot.y, z: currentPivot.z },
      yaw: orbitYaw,
      pitch: orbitPitch,
      distance: orbitDistance
    });

    self._restoreCameraSnapshotFn = (snap) => {
      if (!snap) return;
      targetPivot.set(snap.pivot.x, snap.pivot.y, snap.pivot.z);
      currentPivot.copy(targetPivot);
      targetYaw = orbitYaw = snap.yaw;
      targetPitch = orbitPitch = snap.pitch;
      targetDistance = orbitDistance = snap.distance;
    };

    const extractPropIdFromEntity = (ent: pc.Entity): string => {
      const raw = String(ent?.name || '');
      return raw.startsWith('PropGLB_') ? raw.slice(8) : raw;
    };

    self._autoFrameSceneForCaptureFn = (
      mode: 'all' | 'selected' = 'all',
      propId?: string | null,
      fillRatio = 0.68,
      aspectRatio = '16:9'
    ): boolean => {
      const visibleProps = ((app.root.findByTag('user_prop') as pc.Entity[]) || []).filter((e) => e && e.enabled);
      let bb: pc.BoundingBox | null = null;

      if (mode === 'all' && visibleProps.length > 0) {
        for (const ent of visibleProps) {
          const eb = collectAabb(ent);
          if (!eb) continue;
          if (!bb) bb = eb.clone();
          else bb.add(eb);
        }
      } else {
        let targetEnt: pc.Entity | null = propId ? findPropEntityById(propId) : null;
        if (!targetEnt || !targetEnt.enabled) {
          const firstRigId = self.getFirstRiggedPropId();
          if (firstRigId) targetEnt = findPropEntityById(firstRigId);
        }
        if (!targetEnt || !targetEnt.enabled) {
          targetEnt = visibleProps[0] || null;
        }
        if (targetEnt) {
          bb = collectAabb(targetEnt);
        }
      }
      if (!bb) return false;

      const ratioNums: Record<string, number> = {
        '16:9': 16 / 9,
        '9:16': 9 / 16,
        '1:1': 1,
        '3:4': 3 / 4,
        '4:3': 4 / 3
      };
      const targetAspect = ratioNums[String(aspectRatio || '16:9')] || (16 / 9);
      const cw = Math.max(1, canvas.clientWidth || canvas.width || 1280);
      const ch = Math.max(1, canvas.clientHeight || canvas.height || 720);
      const canvasAspect = cw / ch;

      // Khi FFmpeg scale+center-crop sang targetAspect, xác định phần khung hình hữu dụng theo trục dọc & ngang
      const effVert = Math.min(1, canvasAspect / targetAspect);
      const effHoriz = Math.min(canvasAspect, targetAspect);

      const fovDeg = Number(camera.camera?.fov) || 52;
      const tanHalfFov = Math.tan((fovDeg * 0.5) * pc.math.DEG_TO_RAD);
      const clampedFill = Math.max(0.4, Math.min(0.82, Number(fillRatio) || 0.68));

      const yawRad = orbitYaw * pc.math.DEG_TO_RAD;
      const halfHeight = Math.max(0.25, bb.halfExtents.y);
      // Chiếu bề rộng hộp bao theo trục ngang (Right vector) của camera ở góc yaw hiện tại + biên an toàn cho chuyển động tay chân/xoay
      const halfHoriz = Math.max(
        0.25,
        (Math.abs(Math.cos(yawRad)) * bb.halfExtents.x + Math.abs(Math.sin(yawRad)) * bb.halfExtents.z) * 1.12
      );
      const depthRadius = Math.max(bb.halfExtents.x, bb.halfExtents.z);

      const distV = halfHeight / (tanHalfFov * clampedFill * effVert);
      const horizFill = Math.min(0.88, clampedFill + 0.16);
      const distH = halfHoriz / (tanHalfFov * effHoriz * horizFill);
      const fitDist = Math.max(1.2, Math.max(distV, distH) + depthRadius * 0.15);

      isWindowViewActive = false;
      isPictureViewActive = false;
      isAquariumViewActive = false;
      isPropCameraActive = true;

      targetPivot.copy(bb.center);
      currentPivot.copy(bb.center);
      // Giữ góc xoay ngang người dùng đang chọn, điều tiết pitch vừa tầm mắt nếu đang nhìn quá chúc từ trên xuống
      const cleanPitch = Math.max(4, Math.min(28, orbitPitch));
      targetPitch = orbitPitch = cleanPitch;
      targetYaw = orbitYaw;
      targetDistance = orbitDistance = fitDist;
      return true;
    };

    self._getCaptureSceneSummaryFn = (): CaptureSceneSummary => {
      const visibleProps = ((app.root.findByTag('user_prop') as pc.Entity[]) || []).filter((e) => e && e.enabled);
      const profileProps: any[] = Array.isArray((self._profile as any)?.props) ? (self._profile as any).props : [];
      const cw = Math.max(1, canvas.clientWidth || canvas.width || 1280);
      const screenPt = new pc.Vec3();
      const camPos = camera.getPosition();
      const camFwd = camera.forward;
      const toObj = new pc.Vec3();
      const rawItems: Array<{ id: string; name: string; hasRig: boolean; hasActiveMotion: boolean; screenX: number; camDepth: number }> = [];

      for (const ent of visibleProps) {
        const pid = extractPropIdFromEntity(ent);
        if (!pid) continue;
        const meta = profileProps.find((p: any) => p && p.id === pid);
        const displayName = String(meta?.name || pid).trim() || pid;
        const hasRig = self._propRigMap.has(pid);
        const hasActiveMotion = hasRig ? self.isPropActivelyAnimating(pid) : false;
        const bb = collectAabb(ent);
        const worldCenter = bb ? bb.center : ent.getPosition();
        let screenX = 0.5;
        if (camera?.camera) {
          camera.camera.worldToScreen(worldCenter, screenPt);
          if (Number.isFinite(screenPt.x)) {
            screenX = Math.max(0, Math.min(1, screenPt.x / cw));
          }
        }
        toObj.sub2(worldCenter, camPos);
        const projDepth = toObj.dot(camFwd);
        const camDepth = Number.isFinite(projDepth) && projDepth > 0 ? projDepth : toObj.length();
        rawItems.push({ id: pid, name: displayName, hasRig, hasActiveMotion, screenX, camDepth });
      }

      // Tính tầng chiều sâu (phía trước / giữa / phía sau) dựa trên khoảng cách thực từ camera
      const minDepth = rawItems.length > 0 ? Math.min(...rawItems.map((it) => it.camDepth)) : 0;
      const maxDepth = rawItems.length > 0 ? Math.max(...rawItems.map((it) => it.camDepth)) : 0;
      const depthSpread = maxDepth - minDepth;
      const hasDistinctDepth = rawItems.length >= 2 && depthSpread >= Math.max(0.6, minDepth * 0.05);

      // Tính độ tách ngang thực tế — TUYỆT ĐỐI không ép 2 vật đứng trước-sau gần giữa thành Trái/Phải
      const minX = rawItems.length > 0 ? Math.min(...rawItems.map((it) => it.screenX)) : 0.5;
      const maxX = rawItems.length > 0 ? Math.max(...rawItems.map((it) => it.screenX)) : 0.5;
      const horizSpread = maxX - minX;

      // Sắp xếp ưu tiên vật gần camera hơn (tiền cảnh) lên trước, cùng tầng sâu thì từ trái sang phải
      rawItems.sort((a, b) => {
        if (hasDistinctDepth && Math.abs(a.camDepth - b.camDepth) >= Math.max(0.5, minDepth * 0.04)) {
          return a.camDepth - b.camDepth;
        }
        return a.screenX - b.screenX;
      });

      const props: CaptureScenePropInfo[] = rawItems.map((it) => {
        let depthLayer: 'front' | 'mid' | 'back' = 'mid';
        if (hasDistinctDepth) {
          if (rawItems.length === 2) {
            depthLayer = Math.abs(it.camDepth - minDepth) <= Math.abs(it.camDepth - maxDepth) ? 'front' : 'back';
          } else {
            const normD = depthSpread > 1e-4 ? (it.camDepth - minDepth) / depthSpread : 0.5;
            depthLayer = normD < 0.35 ? 'front' : (normD > 0.65 ? 'back' : 'mid');
          }
        }

        let screenZone: 'left' | 'center' | 'right' = 'center';
        if (rawItems.length >= 2 && horizSpread >= 0.14) {
          if (it.screenX < 0.42) screenZone = 'left';
          else if (it.screenX > 0.58) screenZone = 'right';
          else screenZone = 'center';
        }
        return { ...it, screenZone, depthLayer };
      });

      const fxNames = (self.fxEffects || [])
        .filter((f) => f && f.enabled !== false)
        .map((f) => String(f.name || f.fileName || '').trim())
        .filter(Boolean);

      return { props, fxNames };
    };
    
    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;

    self._applyCameraPreset = (presetName: string) => {
      let p = (presetName || '').toLowerCase();
      // Nếu presetName là ID của một đồ vật GLB người dùng đang hiển thị trên canvas, hội tụ tâm camera vào đồ vật đó
      if (presetName && p !== 'default' && p !== 'default_view' && p !== 'overhead' && p !== 'overhead_view' && p !== 'character' && p !== 'character_view' && p !== 'custom') {
        const userEnt = findPropEntityById(presetName);
        if (userEnt && userEnt.enabled) {
          isWindowViewActive = false;
          isPictureViewActive = false;
          isAquariumViewActive = false;
          isPropCameraActive = true;
          const bb = collectAabb(userEnt);
          if (bb) {
            targetPivot.copy(bb.center);
            const r = Math.max(bb.halfExtents.x, bb.halfExtents.y, bb.halfExtents.z, 1.5);
            targetDistance = Math.max(12, Math.min(120, r * 3.6));
          } else {
            const ep = userEnt.getPosition();
            targetPivot.set(ep.x, ep.y + 3, ep.z);
          }
          return;
        }
      }
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
    let isPanning = false;
    const panCameraByScreenDelta = (dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return;
      const yawRad = orbitYaw * pc.math.DEG_TO_RAD;
      const pitchRad = orbitPitch * pc.math.DEG_TO_RAD;

      // Vector Right (ngang màn hình) và Up (dọc màn hình) chuẩn theo góc nhìn hiện tại của camera
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);
      const upX = -Math.sin(yawRad) * Math.sin(pitchRad);
      const upY = Math.cos(pitchRad);
      const upZ = -Math.cos(yawRad) * Math.sin(pitchRad);

      const fovDeg = camera?.camera?.fov || 45;
      const viewH = Math.max(1, canvas.clientHeight || 600);
      // Tỷ lệ 1:1 giữa pixel kéo chuột và khoảng cách dịch chuyển trong không gian 3D tại tâm nhìn
      const worldPerPixel = (2 * orbitDistance * Math.tan((fovDeg * Math.PI) / 360)) / viewH;

      const moveRight = -dx * worldPerPixel;
      const moveUp = dy * worldPerPixel;

      targetPivot.x += rightX * moveRight + upX * moveUp;
      targetPivot.y += upY * moveUp;
      targetPivot.z += rightZ * moveRight + upZ * moveUp;

      // Giới hạn vùng dịch chuyển để camera không bị chạm tường/sàn làm lệch góc nhìn hoặc độ zoom
      const marginX = 2.0, marginZ = 2.0, marginY = 1.2;
      const minX = EMPTY_SCENE ? -500 : -ROOM_WIDTH_X / 2 + marginX;
      const maxX = EMPTY_SCENE ?  500 :  ROOM_WIDTH_X / 2 - marginX;
      const minZ = EMPTY_SCENE ? -500 : -ROOM_DEPTH_Z / 2 + marginZ;
      const maxZ = EMPTY_SCENE ?  500 :  ROOM_DEPTH_Z / 2 - marginZ;
      const minY = EMPTY_SCENE ? -250 : 1.2;
      const maxY = EMPTY_SCENE ?  500 : WALL_H - marginY;

      const offX = targetDistance * Math.sin(yawRad) * Math.cos(pitchRad);
      const offY = targetDistance * Math.sin(pitchRad);
      const offZ = targetDistance * Math.cos(yawRad) * Math.cos(pitchRad);

      targetPivot.x = pc.math.clamp(targetPivot.x, minX - offX, maxX - offX);
      targetPivot.y = pc.math.clamp(targetPivot.y, minY - offY, maxY - offY);
      targetPivot.z = pc.math.clamp(targetPivot.z, minZ - offZ, maxZ - offZ);
    };

    try {
      canvas.addEventListener('contextmenu', (ev: MouseEvent) => ev.preventDefault());
    } catch (e) { /* ignore */ }

    if (app.mouse) {
      try { app.mouse.disableContextMenu(); } catch (e) { /* ignore */ }

      app.mouse.on(pc.EVENT_MOUSEDOWN, (e: pc.MouseEvent) => {
        const domTarget = (e as any)?.event?.target as HTMLElement | null;
        if (domTarget && domTarget !== canvas) return;
        if (e.button === pc.MOUSEBUTTON_RIGHT || e.button === pc.MOUSEBUTTON_MIDDLE) {
          mouseDownPos.x = e.x;
          mouseDownPos.y = e.y;
          lastMouseX = e.x;
          lastMouseY = e.y;
          isPanning = true;
          isDragging = false;
          try { canvas.style.cursor = 'grabbing'; } catch (err) { /* ignore */ }
          return;
        }
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
        const domTarget = (e as any)?.event?.target as HTMLElement | null;
        if (!isDragging && !isPanning && !propDragCandidate && !propDragActive && domTarget && domTarget !== canvas) {
          return;
        }
        if (e.button === pc.MOUSEBUTTON_RIGHT || e.button === pc.MOUSEBUTTON_MIDDLE || isPanning) {
          isPanning = false;
          try { canvas.style.cursor = ''; } catch (err) { /* ignore */ }
          if (e.button !== pc.MOUSEBUTTON_LEFT) return;
        }
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
        if (isPanning) {
          const dx = e.x - lastMouseX;
          const dy = e.y - lastMouseY;
          lastMouseX = e.x;
          lastMouseY = e.y;
          panCameraByScreenDelta(dx, dy);
          return;
        }
        if (!isDragging) return;
        const dx = e.x - lastMouseX;
        const dy = e.y - lastMouseY;
        lastMouseX = e.x;
        lastMouseY = e.y;
        if (_svc.cameraRotateLocked) return;

        targetYaw -= dx * 0.35;
        targetPitch = Math.max(-20, Math.min(80, targetPitch + dy * 0.35));
      });
    
      app.mouse.on(pc.EVENT_MOUSEWHEEL, (e: pc.MouseEvent) => {
        const domTarget = (e as any)?.event?.target as HTMLElement | null;
        if (domTarget && domTarget !== canvas) return;
        if (_svc.cameraZoomLocked) return;
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
      if (isPanning) {
        isPanning = false;
        try { canvas.style.cursor = ''; } catch (err) { /* ignore */ }
      }
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
        if (_svc.cameraRotateLocked) return;

        targetYaw -= dx * 0.4;
        targetPitch = Math.max(-20, Math.min(80, targetPitch + dy * 0.4));
      } else if (e.touches.length === 2) {
        const currentDist = Math.hypot(
          e.touches[0].x - e.touches[1].x,
          e.touches[0].y - e.touches[1].y
        );
        if (!_svc.cameraZoomLocked && lastPinchDist > 0) {
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
          const cloneMatPreservingBase = (srcMat: pc.StandardMaterial): pc.StandardMaterial => {
            const cloned = srcMat.clone() as pc.StandardMaterial;
            (cloned as any)._isClonedInstance = true;
            (cloned as any)._baseBlendType = (srcMat as any)._baseBlendType ?? srcMat.blendType;
            (cloned as any)._baseDepthWrite = (srcMat as any)._baseDepthWrite ?? srcMat.depthWrite;
            (cloned as any)._baseOpacity = (srcMat as any)._baseOpacity ?? srcMat.opacity;
            (cloned as any)._origDiffuseMap = ('_origDiffuseMap' in (srcMat as any))
              ? (srcMat as any)._origDiffuseMap
              : (srcMat.diffuseMap ?? null);
            (cloned as any)._origDiffuseColor = (srcMat as any)._origDiffuseColor
              ? (srcMat as any)._origDiffuseColor.clone()
              : (srcMat.diffuse ? srcMat.diffuse.clone() : new pc.Color(1, 1, 1));
            (cloned as any)._origDiffuseTint = (srcMat as any)._origDiffuseTint ?? Boolean((srcMat as any).diffuseTint);
            (cloned as any)._origMetalness = (srcMat as any)._origMetalness ?? srcMat.metalness;
            (cloned as any)._origGloss = (srcMat as any)._origGloss ?? srcMat.gloss;
            (cloned as any)._origUseMetalness = (srcMat as any)._origUseMetalness ?? Boolean(srcMat.useMetalness);
            (cloned as any)._origEmissive = (srcMat as any)._origEmissive
              ? (srcMat as any)._origEmissive.clone()
              : (srcMat.emissive ? srcMat.emissive.clone() : new pc.Color(0, 0, 0));
            (cloned as any)._origDiffuseMapTiling = (srcMat as any)._origDiffuseMapTiling
              ? (srcMat as any)._origDiffuseMapTiling.clone()
              : (srcMat.diffuseMapTiling ? srcMat.diffuseMapTiling.clone() : new pc.Vec2(1, 1));
            (cloned as any)._origDiffuseMapOffset = (srcMat as any)._origDiffuseMapOffset
              ? (srcMat as any)._origDiffuseMapOffset.clone()
              : (srcMat.diffuseMapOffset ? srcMat.diffuseMapOffset.clone() : new pc.Vec2(0, 0));
            (cloned as any)._origDiffuseMapRotation = (srcMat as any)._origDiffuseMapRotation ?? (Number((srcMat as any).diffuseMapRotation) || 0);
            return cloned;
          };
          const customizeMat = (origMat: pc.StandardMaterial, assignMat: (m: pc.StandardMaterial) => void) => {
            if (!origMat) return;
            let mat = origMat;
            let changed = false;
            const ensureClone = () => {
              if (!(mat as any)._isClonedInstance) {
                mat = cloneMatPreservingBase(mat);
                assignMat(mat);
              }
            };

            if (prop._customColorSet && prop.color && typeof prop.color === 'string' && prop.color.toLowerCase() !== '#ffffff') {
              ensureClone();
              mat.diffuse = new pc.Color().fromString(prop.color);
              (mat as any).diffuseTint = true;
              changed = true;
            } else if ((mat as any)._isClonedInstance && (!prop._customColorSet || !prop.color || prop.color.toLowerCase() === '#ffffff')) {
              mat.diffuse = (mat as any)._origDiffuseColor ? (mat as any)._origDiffuseColor.clone() : new pc.Color(1, 1, 1);
              (mat as any).diffuseTint = Boolean((mat as any)._origDiffuseTint);
              changed = true;
            }

            if (prop._customOpacitySet && prop.opacity !== undefined && typeof prop.opacity === 'number') {
              if (prop.opacity < 0.99) {
                ensureClone();
                mat.opacity = prop.opacity;
                mat.blendType = pc.BLEND_NORMAL;
                mat.depthWrite = false;
                changed = true;
              } else if ((mat as any)._isClonedInstance) {
                mat.opacity = (mat as any)._baseOpacity ?? 1.0;
                mat.blendType = (mat as any)._baseBlendType ?? pc.BLEND_NONE;
                mat.depthWrite = (mat as any)._baseDepthWrite ?? true;
                changed = true;
              }
            }

            if (prop._customEmissiveSet && prop.emissiveColor && prop.emissiveIntensity && prop.emissiveIntensity > 0) {
              ensureClone();
              const c = new pc.Color().fromString(prop.emissiveColor);
              const intensity = prop.emissiveIntensity || 0;
              mat.emissive = new pc.Color(c.r * intensity, c.g * intensity, c.b * intensity);
              changed = true;
            }

            if (prop._customMetalnessSet && prop.metalness !== undefined && typeof prop.metalness === 'number') {
              ensureClone();
              mat.useMetalness = true;
              mat.metalness = prop.metalness;
              changed = true;
            }

            if (prop._customRoughnessSet && prop.roughness !== undefined && typeof prop.roughness === 'number') {
              ensureClone();
              mat.useMetalness = true;
              mat.gloss = Math.max(0, Math.min(1, 1.0 - prop.roughness));
              changed = true;
            }

            if (changed) mat.update();
          };

          const applyToMesh = (node: any) => {
            const comp = node.render || node.model;
            if (comp) {
              const shouldCast = EMPTY_SCENE
                ? Boolean(this._studioLighting.shadowsEnabled)
                : (prop.castShadow !== undefined ? Boolean(prop.castShadow) : Boolean(this._studioLighting.shadowsEnabled));
              comp.castShadows = shouldCast;
              if ('receiveShadows' in comp) {
                comp.receiveShadows = true;
              }
              const misShadow: any[] | undefined = comp.meshInstances;
              if (misShadow && misShadow.length > 0) {
                for (const mi of misShadow) {
                  if (mi) {
                    mi.castShadow = shouldCast;
                    mi.receiveShadow = true;
                  }
                }
              }
              const mis: any[] | undefined = comp.meshInstances;
              if (mis && mis.length > 0) {
                for (const mi of mis) {
                  if (mi?.material) {
                    customizeMat(mi.material as pc.StandardMaterial, (m) => { mi.material = m; });
                  }
                }
              } else if (node.render?.material) {
                customizeMat(node.render.material as pc.StandardMaterial, (m) => { node.render.material = m; });
              }
            }
            if (node.children && Array.isArray(node.children)) {
              for (const child of node.children) {
                applyToMesh(child);
              }
            }
          };
          applyToMesh(ent);
          if (prop.customTexturePath || prop.customTextureDataUrl) {
            this._hydratePropCustomTexture(propId, prop);
          }
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
            self.releasePropGlbAsset(rawId);
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
    
    // Khai báo biến lưới studio TRƯỚC khi gọi buildStudioLights()/buildStudioGrid() để tránh lỗi TDZ
    let studioGridLayer: pc.Layer | null = null;
    let studioGridMinorMat: pc.StandardMaterial | null = null;
    let studioGridMajorMat: pc.StandardMaterial | null = null;

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
    // STUDIO 3-ĐIỂM + IBL + BÓNG ĐỔ SÀN KHÔNG VIỀN (SHADOW CATCHER)
    // Cho phép tinh chỉnh toàn bộ ánh sáng (Key/Fill/Rim, hướng chiếu,
    // độ phơi sáng, Tone Mapping, IBL, bóng đổ, màu nền, lưới) theo thời gian thực.
    // -------------------------------------------------------------

    function buildStudioLights() {
      const root = new pc.Entity('Showroom_Lights');
      app.root.addChild(root);

      // 1. Đèn chính (Key Light — Directional 2K 2-Cascade soft shadow)
      const keyLight = new pc.Entity('Studio_KeyLight');
      keyLight.addComponent('light', {
        type: 'directional',
        color: new pc.Color(1.0, 0.97, 0.94),
        intensity: 1.55,
        castShadows: true,
        shadowResolution: 2048,
        shadowDistance: 120,
        numCascades: 2,
        cascadeDistribution: 0.5,
        shadowType: (pc as any).SHADOW_PCF5 ?? pc.SHADOW_PCF3,
        shadowBias: 0.08,
        normalOffsetBias: 0.05,
        shadowIntensity: 0.45
      });
      root.addChild(keyLight);

      // 2. Đèn phụ mềm (Fill Light — cân bằng vùng tối đối diện đèn chính, không đổ bóng cứng)
      const fillLight = new pc.Entity('Studio_FillLight');
      fillLight.addComponent('light', {
        type: 'directional',
        color: new pc.Color(0.88, 0.93, 1.0),
        intensity: 0.58,
        castShadows: false
      });
      root.addChild(fillLight);

      // 3. Đèn viền tách chủ thể (Rim / Back Light — tạo đường viền sáng nổi bật khối 3D & kim loại)
      const rimLight = new pc.Entity('Studio_RimLight');
      rimLight.addComponent('light', {
        type: 'directional',
        color: new pc.Color(1.0, 1.0, 1.0),
        intensity: 0.65,
        castShadows: false
      });
      root.addChild(rimLight);

      // 4. Sàn hứng bóng tàng hình gốc của PlayCanvas 2.23 (shadowCatcher = true + BLEND_MULTIPLICATIVE):
      // Vùng ngoài bóng xuất vec3(1.0) -> nhân nền giữ nguyên 100% không viền; vùng có bóng đổ tối mềm tự nhiên.
      let shadowFloor: pc.Entity | null = null;
      try {
        shadowFloor = new pc.Entity('Studio_ShadowFloor');
        const floorGeom = new pc.PlaneGeometry({ halfExtents: new pc.Vec2(90, 90), widthSegments: 1, lengthSegments: 1 });
        const floorMesh = pc.Mesh.fromGeometry(app.graphicsDevice, floorGeom);
        const shadowFloorMat = new pc.StandardMaterial();
        (shadowFloorMat as any).shadowCatcher = true;
        shadowFloorMat.blendType = pc.BLEND_MULTIPLICATIVE;
        shadowFloorMat.depthWrite = false;
        shadowFloorMat.useSkybox = false;
        shadowFloorMat.useFog = false;
        shadowFloorMat.update();

        const floorMi = new pc.MeshInstance(floorMesh, shadowFloorMat);
        floorMi.pick = false;
        floorMi.castShadow = false;
        floorMi.receiveShadow = true;
        shadowFloor.addComponent('render', {
          meshInstances: [floorMi],
          castShadows: false,
          receiveShadows: true
        });
        shadowFloor.setLocalPosition(0, -0.002, 0);
        root.addChild(shadowFloor);
      } catch (e) {
        console.warn('[SontinhScene] Shadow floor init warning:', e);
      }

      const safeColor = (hex: string | undefined, fallback: string): pc.Color => {
        try {
          return new pc.Color().fromString(hex || fallback);
        } catch (_) {
          return new pc.Color().fromString(fallback);
        }
      };

      const applyLightingNow = (cfg: StudioLightingConfig) => {
        // 1. Exposure, Tone Mapping & IBL Environment
        app.scene.exposure = Math.max(0.2, Math.min(3.0, Number(cfg.exposure) || 1.15));
        (app.scene as any).skyboxIntensity = Math.max(0, Math.min(3.0, Number(cfg.envIntensity) ?? 0.95));

        const tmMap: Record<string, number> = {
          linear: (pc as any).TONEMAP_LINEAR ?? 0,
          filmic: (pc as any).TONEMAP_FILMIC ?? 1,
          aces2: (pc as any).TONEMAP_ACES2 ?? (pc as any).TONEMAP_ACES ?? 4,
          neutral: (pc as any).TONEMAP_NEUTRAL ?? 5
        };
        const tmVal = tmMap[cfg.toneMapping || 'neutral'] ?? ((pc as any).TONEMAP_NEUTRAL ?? 5);
        if (camera.camera) {
          (camera.camera as any).toneMapping = tmVal;
        }
        try { (app.scene as any).toneMapping = tmVal; } catch (_) {}

        // 2. Ambient Light
        const ambCol = safeColor(cfg.ambientColor, '#e2e8f0');
        const ambInt = Math.max(0, Math.min(2.0, Number(cfg.ambientIntensity) ?? 0.62));
        app.scene.ambientLight = new pc.Color(ambCol.r * ambInt, ambCol.g * ambInt, ambCol.b * ambInt);

        // 3. Backdrop & Adaptive Grid
        const bgCol = safeColor(cfg.bgColor, '#ffffff');
        if (camera.camera) {
          camera.camera.clearColor = bgCol;
        }
        if (studioGridLayer) {
          studioGridLayer.enabled = cfg.showGrid !== false;
        }
        const bgLum = bgCol.r * 0.299 + bgCol.g * 0.587 + bgCol.b * 0.114;
        const isDarkBg = bgLum < 0.35;
        if (studioGridMinorMat) {
          studioGridMinorMat.emissive = isDarkBg ? new pc.Color(0.55, 0.62, 0.74) : new pc.Color(0.75, 0.75, 0.75);
          studioGridMinorMat.opacity = isDarkBg ? 0.12 : 0.16;
          studioGridMinorMat.update();
        }
        if (studioGridMajorMat) {
          studioGridMajorMat.emissive = isDarkBg ? new pc.Color(0.65, 0.75, 0.88) : new pc.Color(0.6, 0.6, 0.6);
          studioGridMajorMat.opacity = isDarkBg ? 0.28 : 0.45;
          studioGridMajorMat.update();
        }

        // 4. Key Light (Pitch: 5..85 deg elevation from horizon -> PlayCanvas tiltX = 90 - pitch)
        const keyPitch = Math.max(5, Math.min(85, Number(cfg.keyPitch) || 48));
        const keyYaw = Number(cfg.keyYaw) || 0;
        const keyCol = safeColor(cfg.keyColor, '#fff9f0');
        const keyInt = Math.max(0, Math.min(5.0, Number(cfg.keyIntensity) ?? 1.55));
        const shadowInt = Math.max(0, Math.min(1.0, Number(cfg.shadowIntensity) ?? 0.45));
        keyLight.enabled = cfg.keyEnabled !== false;
        keyLight.setEulerAngles(90 - keyPitch, keyYaw, 0);
        if (keyLight.light) {
          keyLight.light.color = keyCol;
          keyLight.light.intensity = keyInt;
          keyLight.light.castShadows = Boolean(cfg.shadowsEnabled);
          keyLight.light.shadowIntensity = shadowInt;
          keyLight.light.shadowType =
            cfg.shadowSoftness === 'crisp'
              ? pc.SHADOW_PCF3
              : ((pc as any).SHADOW_PCF5 ?? pc.SHADOW_PCF3);
        }

        // 5. Fill Light (đối diện đèn chính +135°)
        fillLight.enabled = cfg.fillEnabled !== false;
        fillLight.setEulerAngles(58, keyYaw + 135, 0);
        if (fillLight.light) {
          fillLight.light.color = safeColor(cfg.fillColor, '#e0eeff');
          fillLight.light.intensity = Math.max(0, Math.min(4.0, Number(cfg.fillIntensity) ?? 0.58));
        }

        // 6. Rim / Back Light (phía sau chủ thể -155°)
        rimLight.enabled = cfg.rimEnabled !== false;
        rimLight.setEulerAngles(64, keyYaw - 155, 0);
        if (rimLight.light) {
          rimLight.light.color = safeColor(cfg.rimColor, '#ffffff');
          rimLight.light.intensity = Math.max(0, Math.min(4.0, Number(cfg.rimIntensity) ?? 0.65));
        }

        // 7. Đồng bộ sàn hứng bóng tàng hình (Shadow Catcher) & cờ castShadows của mọi đồ vật trên canvas
        if (shadowFloor) {
          const floorActive =
            Boolean(cfg.shadowsEnabled) &&
            cfg.showFloorShadow !== false &&
            cfg.keyEnabled !== false &&
            keyInt > 0.01 &&
            shadowInt > 0.01;
          shadowFloor.enabled = floorActive;
        }

        // Cập nhật castShadows / receiveShadows trên mọi đồ vật & nhân vật người dùng đang ở trên canvas
        try {
          const shouldCast = Boolean(cfg.shadowsEnabled);
          for (const ent of (app.root.findByTag('user_prop') as pc.Entity[])) {
            const comps = [
              ...((ent.findComponents('render') as any[]) || []),
              ...((ent.findComponents('model') as any[]) || [])
            ];
            if ((ent as any).render) comps.push((ent as any).render);
            if ((ent as any).model) comps.push((ent as any).model);
            for (const c of comps) {
              c.castShadows = shouldCast;
              if ('receiveShadows' in c) c.receiveShadows = true;
              const mis: any[] = c.meshInstances || [];
              for (const mi of mis) {
                if (mi) {
                  mi.castShadow = shouldCast;
                  mi.receiveShadow = true;
                }
              }
            }
          }
        } catch (_) {}
      };

      self._applyStudioLightingFn = applyLightingNow;

      // Nạp cấu hình ánh sáng đã lưu trong profile (nếu có) hoặc dùng mặc định Studio Sáng
      const savedInitLighting = (self._profile?.scene as any)?.lighting;
      if (savedInitLighting && typeof savedInitLighting === 'object') {
        self._studioLighting = { ...DEFAULT_STUDIO_LIGHTING, ...savedInitLighting };
        self._lastAppliedProfileLightingKey = JSON.stringify(savedInitLighting);
      } else {
        self._studioLighting = { ...DEFAULT_STUDIO_LIGHTING };
      }
      try {
        applyLightingNow(self._studioLighting);
      } catch (lightErr) {
        console.warn('[SontinhScene] Initial applyLightingNow warning:', lightErr);
      }

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
      const gridLayer = new pc.Layer({ name: 'GridLayer', enabled: self._studioLighting.showGrid !== false });
      studioGridLayer = gridLayer;
      app.scene.layers.push(gridLayer);
      // cho camera hien thi them layer grid
      camera.camera!.layers = camera.camera!.layers.concat([gridLayer.id]);

      // CHU Y: pc.createMesh mac dinh tao PRIMITIVE_TRIANGLES. Day chi 2 dinh moi doan
      // se bien GPU doc dia chi rac va sinh tam giac khong lo phu man hinh.
      // Giai phap: no moi doan ke thanh 1 dai chu nhat mong (2 tam giac, 4 dinh).
      const makeLines = (segments: number[], col: pc.Color, opacity: number, name: string, width = 0.04): pc.StandardMaterial => {
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
        return mat;
      };

      const minor: number[] = [];
      const major: number[] = [];
      for (let i = -GRID_HALF; i <= GRID_HALF; i++) {
        if (i === 0) continue; // truc 0 ve rieng
        const arr = (i % 10 === 0) ? major : minor;
        arr.push(-GRID_HALF, 0, i, GRID_HALF, 0, i);
        arr.push(i, 0, -GRID_HALF, i, 0, GRID_HALF);
      }
      studioGridMinorMat = makeLines(minor, new pc.Color(0.75, 0.75, 0.75), 0.16, 'Studio_Grid_Minor');
      studioGridMajorMat = makeLines(major, new pc.Color(0.6, 0.6, 0.6), 0.45, 'Studio_Grid_Major');
      makeLines([-GRID_HALF, 0, 0, GRID_HALF, 0, 0], new pc.Color(0.85, 0.15, 0.15), 0.9, 'Studio_Grid_AxisX');
      makeLines([0, 0, -GRID_HALF, 0, 0, GRID_HALF], new pc.Color(0.15, 0.3, 0.9), 0.9, 'Studio_Grid_AxisZ');
      // Đồng bộ lại màu lưới theo màu nền đang chọn (sáng/tối) ngay sau khi dựng lưới
      if (self._applyStudioLightingFn) {
        try { self._applyStudioLightingFn(self._studioLighting); } catch (_) {}
      }
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
      self._sanitizeGlbEntity(glbCharEntity, app.graphicsDevice);
    
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

      // Studio trong (EMPTY_SCENE): hop khoa rat rong de camera zoom-out va pan tu do;
      // phong that: giu margin sat tuong nhu cu.
      const minX = EMPTY_SCENE ? -500 : -ROOM_WIDTH_X / 2 + marginX;
      const maxX = EMPTY_SCENE ?  500 :  ROOM_WIDTH_X / 2 - marginX;
      const minZ = EMPTY_SCENE ? -500 : -ROOM_DEPTH_Z / 2 + marginZ;
      const maxZ = EMPTY_SCENE ?  500 :  ROOM_DEPTH_Z / 2 - marginZ;
      const minY = EMPTY_SCENE ? -250 : 1.2;
      const maxY = EMPTY_SCENE ?  500 : WALL_H - marginY;

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

      // 🌟 GLB SKELETAL RIG & BONE KEYFRAME TIMELINE TICKER
      try { _svc._tickAllPropTimelines(dt); } catch (_) {}

      // 🌟 CUSTOM EFFECT RUNTIME — tick script hieu ung moi khung hinh
      if (activeEffects.size > 0) {
        activeEffects.forEach((fx) => {
          for (const fn of fx.tickFns) {
            try { fn(dt); } catch (e) { /* nuot loi script nguoi dung, khong lam vo vong update */ }
          }
        });
      }

      // Đồng bộ vòng tròn chọn (selRing) bám theo tâm chân thực tế của nhân vật/đồ vật mỗi khung hình
      // (kể cả khi tắt Khóa tại chỗ để chạy root motion tự do, khi __root__ di chuyển theo quỹ đạo vòng tròn, hoặc hiệu ứng bounce/float)
      if (selRing && selRing.enabled && selRingPropId && !propDragActive && !tScrubActive) {
        const selEnt = findPropEntityById(selRingPropId);
        if (selEnt && selEnt.enabled) {
          const ep = selEnt.getPosition();
          const c = getPropSelectionCenterWorld(selEnt, selRingPropId);
          const bottomY = computeEntityBottomWorldY(selEnt);
          const extraY = c.y - ep.y;
          const ringY = (bottomY !== null ? bottomY + extraY : ep.y - ringOffsetY + extraY) + 0.04;
          selRing.setPosition(c.x, ringY, c.z);
          syncFloorGuide(selEnt, c.x, c.z);
        }
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
    
      // Orbit camera smooth control (hoặc nội suy chính xác 60fps theo Camera Keyframes khi đang xem thử / ghi video)
      if (self._cameraPathActive && self._cameraPathKeyframes.length > 0) {
        self._cameraPathTime += Math.min(dt, 0.05);
        if (self._cameraPathTime >= self._cameraPathDuration) {
          if (self._cameraPathLoop) {
            self._cameraPathTime = self._cameraPathTime % Math.max(0.1, self._cameraPathDuration);
            self._cameraPathLastUiTick = -1;
          } else {
            self._cameraPathTime = self._cameraPathDuration;
            self._cameraPathActive = false;
          }
        }
        const pathSnap = self.evaluateCameraKeyframesAtTime(self._cameraPathKeyframes, self._cameraPathTime);
        if (pathSnap) {
          targetPivot.set(pathSnap.pivot.x, pathSnap.pivot.y, pathSnap.pivot.z);
          currentPivot.copy(targetPivot);
          targetYaw = orbitYaw = pathSnap.yaw;
          targetPitch = orbitPitch = pathSnap.pitch;
          targetDistance = orbitDistance = pathSnap.distance;
        }
        // Giới hạn tần suất báo UI (~6Hz) để Angular không re-check toàn bộ DOM ở 60fps gây khựng khung hình
        if (!self._cameraPathActive || Math.abs(self._cameraPathTime - self._cameraPathLastUiTick) >= 0.16) {
          self._cameraPathLastUiTick = self._cameraPathTime;
          self.onCameraPathTick?.(self._cameraPathTime, self._cameraPathActive);
        }
      } else {
        orbitYaw = pc.math.lerp(orbitYaw, targetYaw, dt * 10);
        orbitPitch = pc.math.lerp(orbitPitch, targetPitch, dt * 10);
        orbitDistance = pc.math.lerp(orbitDistance, targetDistance, dt * 10);
        currentPivot.lerp(currentPivot, targetPivot, dt * 10);
      }
    
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
      if (camera.camera) {
        const camDist = finalCamPos.distance(currentPivot);
        camera.camera.nearClip = Math.max(0.1, Math.min(0.8, camDist * 0.005));
        camera.camera.farClip = Math.max(1500, camDist * 10);
      }
    
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
    const activeEffects = new Map<string, { root: pc.Entity; tickFns: Array<(dt: number) => void>; mis: pc.MeshInstance[]; cleanupFns: Array<() => void> }>();
    const fxWorldLayer = () => app.scene.layers.getLayerByName('World') || app.scene.layers.getLayerByName('Skybox') || null;

    // Chuon hoa ten giong hec runPropEffect luu key: "Tuy_t r_i" -> "Tuy_t_r_i".
    function stopPropEffect(name: string): void {
      if (name === '*') {
        for (const k of Array.from(activeEffects.keys())) {
          stopPropEffect(k);
        }
        try {
          const allChildren = (app.root.children || []).slice();
          for (const c of allChildren) {
            const nm = String((c as any)?.name || '');
            if (nm.startsWith('FX_') || nm.startsWith('FXP_')) {
              try { (c as pc.Entity).destroy(); } catch (e) { /* ignore */ }
            }
          }
        } catch (e) { /* ignore */ }
        return;
      }

      const normFxName = (s: string) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom';
      const wanted = normFxName(name);
      const keysToStop: string[] = [];
      for (const k of Array.from(activeEffects.keys())) {
        if (k === wanted || normFxName(k) === wanted || k.toLowerCase() === wanted.toLowerCase()) {
          keysToStop.push(k);
        }
      }

      const wl = fxWorldLayer();
      const allLayers: any[] = (app.scene?.layers as any)?.layerList || (wl ? [wl] : []);

      for (const key of keysToStop) {
        const fx = activeEffects.get(key);
        if (!fx) continue;
        fx.tickFns.length = 0;

        if (Array.isArray(fx.mis) && fx.mis.length > 0) {
          for (const mi of fx.mis) {
            try { (mi as any).visible = false; } catch (e) { /* ignore */ }
          }
          for (const layer of allLayers) {
            try { layer?.removeMeshInstances?.(fx.mis); } catch (e) {
              for (const mi of fx.mis) {
                try { layer?.removeMeshInstances?.([mi]); } catch (e2) { /* ignore */ }
              }
            }
          }
          fx.mis.length = 0;
        }

        if (Array.isArray(fx.cleanupFns)) {
          for (const cleanFn of fx.cleanupFns) {
            try { cleanFn(); } catch (e) { /* ignore */ }
          }
          fx.cleanupFns.length = 0;
        }

        try {
          fx.root.getChildren().slice().forEach((c) => { (c as pc.Entity).destroy(); });
          fx.root.destroy();
        } catch (e) { /* ignore */ }
        activeEffects.delete(key);
        console.log('[SontinhScene] Effect stopped:', key);
      }

      // Dọn dẹp các node FX_ / FXP_ còn sót trực tiếp dưới app.root có tên khớp
      try {
        const rootCh = (app.root.children || []).slice();
        for (const c of rootCh) {
          const nm = String((c as any)?.name || '');
          if (nm === 'FX_' + wanted || nm.startsWith('FXP_' + wanted + '_')) {
            try { (c as pc.Entity).destroy(); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) { /* ignore */ }
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

      const cleanupFns: Array<() => void> = [];
      const rootChildrenBefore = new Set<any>((app.root.children || []).slice());
      const hostChildrenBefore = new Set<any>(hostEntity ? (hostEntity.children || []).slice() : []);
      const hadParticleOnHost = !!(hostEntity && (hostEntity as any).particlesystem);
      const origAppOn = app.on.bind(app);
      (app as any).on = (evt: string, handler: any, scope?: any) => {
        cleanupFns.push(() => {
          try { app.off(evt, handler, scope); } catch (e) { /* ignore */ }
        });
        return origAppOn(evt, handler, scope);
      };

      try {
        const fn = new Function('fx', 'pc', '"use strict";\n' + normalizeFxScript(cmd.script) +
          '\n;(function(){ if (typeof effect === "function") { effect(fx); } else if (typeof init === "function") { init(fx); } })();');
        fn(api, pc);
      } catch (e) {
        (app as any).on = origAppOn;
        console.warn('[SontinhScene] Effect script error:', e);
        try { fxRoot.destroy(); } catch (e2) { /* ignore */ }
        return false;
      } finally {
        (app as any).on = origAppOn;
      }

      // Ghi nhận mọi entity hoặc particlesystem mà script tự gắn trực tiếp vào app.root / hostEntity
      try {
        for (const c of (app.root.children || []).slice()) {
          if (c !== fxRoot && !rootChildrenBefore.has(c)) {
            cleanupFns.push(() => {
              try { (c as pc.Entity).destroy(); } catch (e) { /* ignore */ }
            });
          }
        }
        if (hostEntity) {
          for (const c of (hostEntity.children || []).slice()) {
            if (!hostChildrenBefore.has(c)) {
              cleanupFns.push(() => {
                try { (c as pc.Entity).destroy(); } catch (e) { /* ignore */ }
              });
            }
          }
          if (!hadParticleOnHost && (hostEntity as any).particlesystem) {
            cleanupFns.push(() => {
              try {
                (hostEntity as any).particlesystem?.stop?.();
                (hostEntity as any).particlesystem?.reset?.();
                hostEntity?.removeComponent?.('particlesystem');
              } catch (e) { /* ignore */ }
            });
          }
        }
      } catch (e) { /* ignore */ }

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

      activeEffects.set(fxName, { root: fxRoot, tickFns, mis, cleanupFns });
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
    this.clearAllPropGlbAssets();
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
