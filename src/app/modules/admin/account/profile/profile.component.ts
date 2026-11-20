/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ViewEncapsulation,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';
import { UserService } from 'app/core/user/user.service';
import {
  SontinhSceneService,
  GlbBoneInfo,
  GlbBoneKeyframe,
  GlbPropTimelineData,
  VideoFramePoseSample,
  StudioLightingConfig,
  DEFAULT_STUDIO_LIGHTING,
  STUDIO_LIGHTING_PRESETS
} from './sontinh-scene.service';
import { ProfileDataService, UserProfile } from './profile-data.service';
import { GenaiService } from 'app/genai.service';

import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Design3DService, Design3DSnapshot, Design3DPreset } from 'app/_services/design3d.service';

// Scene PlayCanvas mặc định trống: không có món đồ mặc định nào (bàn trưng bày built-in đã bị gỡ bỏ), người dùng tự thêm đồ vật.
const DEFAULT_PROPS: any[] = [];

@Component({
    selector: 'profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [SontinhSceneService, ProfileDataService],
    standalone: false
})
export class ProfileComponent implements AfterViewInit, OnDestroy {

  @ViewChild('sceneCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sceneContainer') sceneContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('glbFileInput') glbFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('photoFileInput') photoFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('avatarFileInput') avatarFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('actionFileInput') actionFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('audioFileInput') audioFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('textFileInput') textFileInput!: ElementRef<HTMLInputElement>;
  /** Input ẩn nhận file .js chứa mã lệnh PlayCanvas chạy trực tiếp trên canvas */
  @ViewChild('scriptFileInput') scriptFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('propGlbFileInput') propGlbFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('promptFileInput') promptFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('promptInputArea') promptInputArea?: ElementRef<HTMLTextAreaElement>;

  isLoading    = true;
  isUploading  = false;
  isProcessingPrompt = false;
  isFullscreen = false;
  isSidebarCollapsed = false;
  loadError: string | null   = null;
  uploadError: string | null = null;
  profile: UserProfile | null = null;
  roomProps: any[] = DEFAULT_PROPS;

  // Đồ vật đang được select trên scene 3D (hiển thị trục XYZ + tọa độ)
  selectedPropId: string | null = null;
  selectedPropPos: { x: number; y: number; z: number } | null = null;
  selectedPropRot: { x: number; y: number; z: number } | null = null;
  selectedPropScl: { x: number; y: number; z: number } | null = null;
  /** Vị trí pixel + trạng thái của cặp nút Delete/Duplicate nổi trên canvas */
  propActionAnchor = { visible: false, x: 0, y: 0, propId: null as string | null };
  /** Do vat dang chon co bi khoa khong (nut khoa tren canvas + chan scrub) */
  get selectedPropLocked(): boolean {
    const p = this.roomProps?.find(pr => pr && pr.id === this.selectedPropId);
    return !!p?.locked;
  }
  private _lastSelectedPropId: string | null = null;
  /** Set lưu runtime propId đang insert GLB — tuyệt đối không ghi cờ tạm lên prop object để tránh serialize xuống props.json */
  private _insertingPropIds = new Set<string>();

  get selectedPropName(): string {
    const found = this.roomProps?.find(pr => pr && pr.id === this.selectedPropId);
    return found?.name || this.selectedPropId || '';
  }

  /** Kéo nút mũi tên pos/rot/scl dưới box tọa độ: chỉnh theo đúng 1 trục, thả ra để lưu */
  onTransformScrubStart(kind: 'pos' | 'rot' | 'scl', axis: number, event: PointerEvent): void {
    const propId = this.selectedPropId;
    if (!propId) return;
    event.preventDefault();
    let lastX = event.clientX;
    let lastY = event.clientY;
    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      // Vị trí: trục Y kéo dọc (kéo lên là tăng); xoay & scale: mọi trục kéo ngang
      const deltaPx = kind === 'pos' && axis === 1 ? -dy : dx;
      this.sceneService.scrubTransform(propId, kind, axis, deltaPx, false);
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.sceneService.scrubTransform(propId, kind, axis, 0, true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  propSearchQuery = '';

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    try {
      localStorage.setItem('profile_sidebar_collapsed', String(this.isSidebarCollapsed));
    } catch (_) {}
    this.cdr.markForCheck();
  }

  get filteredRoomProps(): any[] {
    let queryStr = '';
    if (typeof this.propSearchQuery === 'string') {
      queryStr = this.propSearchQuery;
    } else if (this.propSearchQuery && typeof this.propSearchQuery === 'object' && (this.propSearchQuery as any).name) {
      queryStr = (this.propSearchQuery as any).name;
    }

    if (!queryStr || !queryStr.trim()) {
      // Ẩn các bản sao duplicate từ canvas (hiddenFromList) khỏi menu ĐỒ VẬT
      return (this.roomProps || []).filter(p => p && !p.hiddenFromList);
    }
    const q = queryStr.toLowerCase().trim();

    return (this.roomProps || []).filter(p => {
      if (!p || p.hiddenFromList) return false;
      const matchParent = (p.name && p.name.toLowerCase().includes(q)) || (p.id && p.id.toLowerCase().includes(q));
      if (matchParent) return true;

      if (Array.isArray(p.subDevices) && p.subDevices.length > 0) {
        return p.subDevices.some((sub: any) =>
          (sub.name && sub.name.toLowerCase().includes(q)) ||
          (sub.id && sub.id.toLowerCase().includes(q)) ||
          (sub.type && sub.type.toLowerCase().includes(q)) ||
          (sub.customScript && sub.customScript.toLowerCase().includes(q))
        );
      }
      return false;
    });
  }

  /** Danh sách item đang hiển thị trên canvas kết quả: đồ thường đã insert (visible=true) + bản sao nhân bản (hiddenFromList). Đồ còn nằm chờ trong menu (visible=false) không được liệt kê. */
  get canvasProps(): any[] {
    return (this.roomProps || []).filter(p => p && (p.hiddenFromList || p.visible !== false));
  }

  /** Danh sách hiệu ứng JS đã import (lấy từ scene service) — dùng cho auto-expand panel CANVAS */
  get fxEffects(): any[] {
    return this.sceneService?.fxEffects || [];
  }

  isSubDeviceMatchingSearch(prop: any, sub: any): boolean {
    if (!this.propSearchQuery || (typeof this.propSearchQuery === 'string' && !this.propSearchQuery.trim())) return true;
    let q = '';
    if (typeof this.propSearchQuery === 'string') {
      q = this.propSearchQuery.toLowerCase().trim();
    } else if (this.propSearchQuery && typeof this.propSearchQuery === 'object' && (this.propSearchQuery as any).name) {
      q = (this.propSearchQuery as any).name.toLowerCase().trim();
    }
    if (!q) return true;

    // If parent prop matches, show all sub devices
    if ((prop.name && prop.name.toLowerCase().includes(q)) || (prop.id && prop.id.toLowerCase().includes(q))) {
      return true;
    }
    // Otherwise check if sub device matches
    return (
      (sub.name && sub.name.toLowerCase().includes(q)) ||
      (sub.id && sub.id.toLowerCase().includes(q)) ||
      (sub.type && sub.type.toLowerCase().includes(q)) ||
      (sub.customScript && sub.customScript.toLowerCase().includes(q))
    );
  }

  onSearchChange(): void {
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.propSearchQuery = '';
    this.cdr.markForCheck();
  }

  onPropSelectFromAuto(event: any): void {
    const selectedProp = event.option?.value;
    if (selectedProp) {
      this.onPropClick(selectedProp);
    }
  }

  displayPropName(prop: any): string {
    if (!prop) return '';
    if (typeof prop === 'string') return prop;
    return prop.name || '';
  }

  username = 'admin';
  promptText = '';
  charThumbnail: string | null = null;
  // ── Quản lý mẫu thiết kế 3D (design presets) ──
  designPresets: Design3DPreset[] = [];
  designSearch = '';
  savingDesign = false;
  showDesignSaveForm = false;
  newDesignName = '';
  newDesignDesc = '';
  pendingDesignId: string | null = null; // design đang chờ lưu (đã có id từ nút "Lưu lại")

  userAnimations: Array<{ id: string; name: string; glbPath: string; isMovement?: boolean; speed?: number; uploadedAt?: string }> = [];
  attachedImages: Array<{ dataUrl: string; base64: string; mimeType: string }> = [];
  attachedScripts: Array<{ name: string; code: string; size: number }> = [];

  private _destroy$    = new Subject<void>();
  private _charBlobUrl: string | null = null;

  constructor(
    private sceneService: SontinhSceneService,
    private profileDataService: ProfileDataService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private toastr: ToastrService,
    private genaiService: GenaiService,
    private _fuseConfirmationService: FuseConfirmationService,
    private _design3dService: Design3DService
  ) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      // 1. Lấy username
      const user = await this.userService.user$.pipe(take(1)).toPromise();
      this.username = user?.name || 'admin';

      if ((window as any).electron?.getAvatar) {
        try {
          const res = await (window as any).electron.getAvatar(this.username);
          if (res?.success && res?.dataUrl) {
            this.charThumbnail = res.dataUrl;
          }
        } catch (_) {}
      }
      const savedSidebarState = localStorage.getItem('profile_sidebar_collapsed');
      if (savedSidebarState !== null) {
        this.isSidebarCollapsed = savedSidebarState === 'true';
      }

      if (!this.charThumbnail) {
        const savedAvatar = localStorage.getItem(`profile_avatar_${this.username}`);
        if (savedAvatar) {
          this.charThumbnail = savedAvatar;
        }
      }

      // 2. Load profile từ đĩa qua Electron IPC
      const profile = await this.profileDataService.loadProfile(this.username).toPromise();
      this.profile = profile ?? null;

      // 2a. Nạp danh sách mẫu thiết kế 3D
      this.loadDesignPresets();

      // 2b. Nạp danh sách đồ vật đã lưu NGAY LẬP TỨC (trước khi init scene)
      //     để loadSavedPropGlbs() ở bước 4c có dữ liệu duyệt
      this.roomProps = this.mergeProps((profile as any)?.props || []);
      (this.profile as any).props = this.roomProps;

      // 3. Nếu profile đã có glbPath → đọc file thành Blob URL để PlayCanvas load
      //    glbPath là đường dẫn đĩa, KHÔNG dùng làm URL trực tiếp
      let charGlbObjectUrl: string | null = null;
      const savedGlbPath = profile?.character?.glbPath ?? null;
      if (savedGlbPath) {
        try {
          charGlbObjectUrl = await this.profileDataService
            .readGlbAsObjectUrl(savedGlbPath).toPromise() ?? null;
          this._charBlobUrl = charGlbObjectUrl;
        } catch (e) {
          console.warn('[Profile] Không đọc được GLB đã lưu:', savedGlbPath, e);
        }
      }

      // 3b. Load danh sách hành động (animations) từ đĩa trước khi khởi tạo scene
      if ((window as any).electron?.listAnimations) {
        try {
          const animRes = await (window as any).electron.listAnimations(this.username);
          if (animRes?.success && Array.isArray(animRes.data)) {
            this.userAnimations = animRes.data;
          }
        } catch (e) {
          console.warn('[Profile] Lỗi load danh sách hành động:', e);
        }
      }

      // 4. Khởi động 3D scene
      await this.sceneService.initScene(this.canvasRef.nativeElement, this.profile, charGlbObjectUrl);
      this.lightingConfig = this.sceneService.getStudioLighting();
      this.sceneService.rerunAllFxEffects();

      // 4a. Phát ngay hành động mặc định nếu đã chọn
      const defaultAnimState = profile?.character?.animationState;
      if (defaultAnimState) {
        const found = this.userAnimations.find(a => a.name === defaultAnimState);
        if (found) {
          this.setAnimation(found.name, found.glbPath, found.isMovement, found.speed);
        }
      }

      // Capture thumbnail nếu chưa có avatar tùy chỉnh
      if (profile?.character?.glbPath && !this.charThumbnail) {
        setTimeout(() => {
          const canvas = this.canvasRef?.nativeElement as HTMLCanvasElement;
          if (canvas && !this.charThumbnail) {
            try {
              const snap = canvas.toDataURL('image/jpeg', 0.8);
              if (snap && snap.length > 500) {
                this.charThumbnail = snap;
              }
            } catch (_) {}
            this.cdr.markForCheck();
          }
        }, 2000);
      }

      // 4b. Wire callback: khi user click khung ảnh trên tường mà chưa có ảnh
      this.sceneService.onPictureFrameClick = () => {
        this.photoFileInput?.nativeElement?.click();
      };

      // 4b2. Wire callback: kéo thả đồ vật trên canvas 3D — lưu vị trí mới vào props
      this.sceneService.onPropDragged = (propId: string, pos: { x: number; y: number; z: number }) => {
        const prop = this.roomProps.find(p => p && p.id === propId);
        if (!prop) return;
        prop.position = pos;
        (prop as any)._customPositionSet = true;
        this.profileDataService.saveProps(this.roomProps).subscribe();
        this.cdr.markForCheck();
      };

      // 4b3. Wire callback: hiển thị trục XYZ và tọa độ khi select đồ vật (cập nhật realtime khi kéo)
      this.sceneService.onPropLockChanged = (propId: string, locked: boolean) => {
        this.cdr.markForCheck();
      };
      this.sceneService.onTimelineTimeUpdate = (propId: string, time: number, playing: boolean) => {
        if (this.isGlbTimelineOpen && this.timelinePropId === propId) {
          this.ngZoneRunTimelineUpdate(time, playing);
        }
      };
      this.sceneService.onPropSelected = (propId: string | null, pos: { x: number; y: number; z: number } | null) => {
        this.selectedPropId = propId;
        this.selectedPropPos = pos ? { ...pos } : null;
        // Đổi đồ vật chọn: nạp góc xoay/scale hiện có của prop lên overlay
        if (propId && propId !== this._lastSelectedPropId) {
          const prop = this.roomProps?.find(pr => pr && pr.id === propId);
          const rot = prop?.rotation;
          const scl = prop?.scale;
          this.selectedPropRot = rot && typeof rot.x === 'number' ? { ...rot } : { x: 0, y: 0, z: 0 };
          this.selectedPropScl = scl && typeof scl.x === 'number' ? { ...scl } : { x: 1, y: 1, z: 1 };
          if (this.isGlbTimelineOpen && this.sceneService.hasPropRig(propId)) {
            this.openPropTimeline(propId);
          }
          if (this.isTextureStudioOpen && this.texStudioPropId !== propId) {
            this.openPropTextureStudio(propId);
          }
        }
        if (!propId) {
          this.selectedPropRot = null;
          this.selectedPropScl = null;
        }
        this._lastSelectedPropId = propId;
        this.cdr.markForCheck();
      };

      // 4b3b. Wire callback: sau khi service reset đồ vật, nạp lại panel ĐỒ VẬT
      this.sceneService.onPropsReset = () => {
        this.roomProps = DEFAULT_PROPS.map(p => JSON.parse(JSON.stringify(p)));
        (this.profile as any).props = this.roomProps;
        this.onSearchChange();
        this.cdr.markForCheck();
      };

      // 4b3c. Wire callback: vị trí cặp nút Delete/Duplicate nổi trên canvas (realtime theo ring)
      this.sceneService.onPropActionAnchor = (visible, x, y, pid) => {
        this.propActionAnchor = { visible, x, y, propId: pid };
        this.cdr.markForCheck();
      };

      // 4b3d. Wire callback: sau khi xóa/nhân bản trên canvas, đồng bộ roomProps + lưu đĩa
      this.sceneService.onPropActionChange = (action, pid, newId) => {
        if (action === 'delete') {
          const prop = this.roomProps.find(p => p && p.id === pid);
          if (prop && (prop as any).hiddenFromList) {
            // Bản sao duplicate chỉ tồn tại trên canvas: xóa hẳn record (không còn ý
            // nghĩa "vẫn còn trong menu" như đồ thường). Tạo mảng mới + gán lại
            // profile.props ngay để giữ chuỗi tham chiếu roomProps === profile.props
            // (điều kiện sống còn cho push bản sao clone trong service).
            this.roomProps = this.roomProps.filter(p => p && p.id !== pid);
            (this.profile as any).props = this.roomProps;
          } else if (prop) {
            prop.visible = false; // gỡ khỏi canvas, giữ item trong menu
          }
          if (this.selectedPropId === pid) {
            this.selectedPropId = null;
            this.selectedPropPos = null;
            this.selectedPropRot = null;
            this.selectedPropScl = null;
          }
          if (this.texStudioPropId === pid) {
            this.isTextureStudioOpen = false;
            this.texStudioPropId = null;
          }
          const delMsg = (prop as any)?.hiddenFromList
            ? 'Đã xóa bản sao khỏi canvas'
            : 'Đã gỡ khỏi canvas (vẫn còn trong menu ĐỒ VẬT)';
          this.toastr.info(delMsg, 'Xóa đồ vật');
        } else if (action === 'duplicate' && newId) {
          // Bảo đảm bản sao luôn có mặt trong roomProps ngay cả khi tham chiếu mảng từng bị tách sau thao tác xóa
          if (!this.roomProps.some(p => p && p.id === newId)) {
            const dupProp = this.sceneService.getProfilePropById(newId);
            if (dupProp) {
              this.roomProps.push(dupProp);
            }
          }
        }
        (this.profile as any).props = this.roomProps;
        this.profileDataService.saveProps(this.roomProps).subscribe();
        this.onSearchChange();
        this.cdr.markForCheck();
      };

      // 4b4. Wire callback: realtime khi kéo nút chỉnh xoay/scale trên overlay
      this.sceneService.onPropTransformChanged = (propId, kind, values) => {
        if (propId !== this.selectedPropId) return;
        if (kind === 'pos') this.selectedPropPos = { ...values };
        else if (kind === 'rot') this.selectedPropRot = { ...values };
        else this.selectedPropScl = { ...values };
        this.cdr.markForCheck();
      };

      // 4b5. Wire callback: thả nút chỉnh xoay/scale — lưu vào props (vị trí đã có onPropDragged lo)
      this.sceneService.onPropTransformCommit = (propId, kind, values) => {
        const prop = this.roomProps.find(p => p && p.id === propId);
        if (!prop) return;
        if (kind === 'rot') {
          prop.rotation = { ...values };
          (prop as any)._customRotationSet = true;
        } else if (kind === 'scl') {
          prop.scale = { ...values };
          (prop as any)._customScaleSet = true;
          // Đồng bộ scale mốc re-ground để F5 không re-ground sai với nhà đang bay
          (prop as any)._groundedAtScale = { ...values };
        } else {
          return;
        }
        this.profileDataService.saveProps(this.roomProps).subscribe();
        this.cdr.markForCheck();
      };

      // 4c. Nạp lại các đồ vật GLB đã upload trước đó (dựa vào glbPath lưu trong props)
      this.loadSavedPropGlbs();

      // 5. Subscribe profile changes
      this.profileDataService.profile$.pipe(takeUntil(this._destroy$)).subscribe(p => {
        if (p) {
          this.profile = p;
          this.roomProps = this.mergeProps((p as any).props);
          (p as any).props = this.roomProps;
          this.sceneService.applyProfile(p, { skipCamera: true });
          // FIX: mergeProps thay roomProps bằng mảng object MỚI — phải dựng lại danh sách
          // sidebar ngay để không còn bấm vào object mồ côi (nguyên nhân kẹt insert lại)
          this.onSearchChange();
          this.cdr.markForCheck();
        }
      });

      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[Profile] Init error:', err);
      this.loadError = 'Không thể khởi động scene 3D.';
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private mergeProps(savedProps: any[]): any[] {
    const defaultMap = new Map<string, any>();
    for (const defProp of DEFAULT_PROPS) {
      defaultMap.set(defProp.id, JSON.parse(JSON.stringify(defProp)));
    }

    const resultProps: any[] = [];
    const seenIds = new Set<string>();

    let missingAdded = false;

    if (Array.isArray(savedProps) && savedProps.length > 0) {
      for (const saved of savedProps) {
        if (!saved || !saved.id) continue;

        // Clean stale x=0, y=0, z=0 overrides on structural building floors
        const isStructural = saved.id.startsWith('prop_building_floor') || saved.id === 'prop_building_5story_main' || saved.id === 'prop_room_306_floor' || saved.id.startsWith('prop_room_');
        if (isStructural && saved.position && saved.position.x === 0 && saved.position.y === 0 && saved.position.z === 0) {
          delete saved.position;
          delete saved.rotation;
          delete saved.scale;
          delete saved._modifiedPosition;
        }

        // Tự động phục hồi đồ vật bị văng quá xa khỏi lưới Studio (|x| > 150 hoặc |z| > 150) về tâm sàn (0, y, 0)
        if (!isStructural && saved.position && (Math.abs(Number(saved.position.z) || 0) > 150 || Math.abs(Number(saved.position.x) || 0) > 150)) {
          saved.position = {
            x: 0,
            y: Number(saved.position.y) || 0,
            z: 0
          };
          missingAdded = true;
        }

        const def = defaultMap.get(saved.id) || {};
        const mergedProp = { ...def, ...saved };
        delete (mergedProp as any)._inserting;
        delete (mergedProp as any)._glbLoaded;
        resultProps.push(mergedProp);
        seenIds.add(saved.id);
      }
    }

    const tombstones: string[] = (this.profile as any)?.deletedDefaultProps || [];
    for (const defProp of DEFAULT_PROPS) {
      if (!seenIds.has(defProp.id) && !tombstones.includes(defProp.id)) {
        resultProps.push(JSON.parse(JSON.stringify(defProp)));
        missingAdded = true;
      }
    }

    if (missingAdded && (window as any).electron?.saveProps) {
      this.profileDataService.saveProps(resultProps).subscribe();
    }

    return resultProps;
  }

  getPropIcon(prop: any): string {
    const id = (prop.id || '').toLowerCase();
    const cat = (prop.category || '').toLowerCase();
    const name = (prop.name || '').toLowerCase();

    if (id.includes('desk') || name.includes('bàn')) return 'table_restaurant';
    if (id.includes('chair') || name.includes('ghế')) return 'chair';
    if (id.includes('monitor') || name.includes('màn hình')) return 'desktop_windows';
    if (id.includes('keyboard') || name.includes('bàn phím')) return 'keyboard';
    if (id.includes('aquarium') || name.includes('cá')) return 'water';
    if (id.includes('pegboard') || name.includes('pegboard')) return 'grid_view';
    if (id.includes('ps5') || name.includes('game')) return 'videogame_asset';
    if (id.includes('led') || id.includes('switch') || id.includes('downlight') || cat.includes('lighting')) return 'lightbulb';
    if (id.includes('window') || name.includes('cửa sổ')) return 'window';
    if (id.includes('picture') || name.includes('ảnh')) return 'photo';
    if (id.includes('clock') || name.includes('đồng hồ')) return 'access_time';
    if (id.includes('drawer') || name.includes('tủ')) return 'inventory_2';
    if (id.includes('door') || name.includes('cửa')) return 'meeting_room';
    return 'category';
  }

  focusOnCharacter(): void {
    this.setCameraPreset('CHARACTER');
  }

  /** Bấm nút Plus trên panel CANVAS: mở hộp thoại chọn file .js */
  onPickScriptFile(): void {
    this.scriptFileInput?.nativeElement.click();
  }

  /** Đọc file .js do người dùng chọn rồi gửi xuống scene service thực thi trên canvas PlayCanvas */
  onScriptFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    // Cho phép chọn lại đúng file vừa chạy (reset value để change trigger lần sau)
    input.value = '';
    if (!file) return;
    if (!/\.js$/i.test(file.name)) {
      this.toastr.error('Chỉ nhận file JavaScript (.js).', 'Canvas Script');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const code = String(reader.result ?? '');
      this.sceneService.fileNameHint = file.name;
      const result = this.sceneService.runCanvasScript(code);
      if (result.ok) {
        this.toastr.success(`Đã thực thi "${file.name}" trên canvas.`, 'Canvas Script');
        // Mo dialog cau hinh thuoc tinh dong cho effect vua import
        const reg = this.sceneService.fxEffects;
        const last = reg.length > 0 ? reg[reg.length - 1] : null;
        if (last) this.openFxEffectInspector(last.id);
      } else {
        this.toastr.error(result.error || 'Lỗi thực thi script.', 'Canvas Script');
      }
      this.cdr.markForCheck();
    };
    reader.onerror = () => {
      this.toastr.error('Không đọc được file script.', 'Canvas Script');
    };
    reader.readAsText(file);
  }

  onPropClick(prop: any): void {
    if (!prop) return;
    const propId = prop.id || '';

    // Đồ vật GLB chưa insert vào canvas (visible=false) HOẶC entity đã mất trên canvas
    // (kẹt trạng thái visible=true sau khi xóa / load lỗi): bấm = insert + tự chữa
    // Lưu ý: bản sao duplicate (hiddenFromList) không có GLB riêng — đã tồn tại trên
    // canvas ngay khi nhân bản, chỉ bấm để chọn nên không được tái insert.
    if (prop.glbPath && (prop.visible === false || !this.sceneService.hasPropEntity(propId))) {
      this.insertPropToScene(prop);
      return;
    }

    // FIX: đồ vật KHÔNG có GLB mà entity không còn/không có trên canvas -> bấm đang chết im, báo lỗi rõ ràng thay vì im lặng
    // (bàn trưng bày mặc định prop_display_table đã bị gỡ khỏi scene nên mọi món thiếu GLB đều báo như nhau)
    if (propId && !prop.glbPath && !this.sceneService.hasPropEntity(propId)) {
      this.toastr.warning(
        `"${prop.name}" không có dữ liệu 3D (GLB) nên không thể hiển thị trên canvas. Bạn có thể xóa món này khỏi danh sách.`,
        'Đồ vật thiếu mô hình'
      );
      return;
    }

    if (propId) {
      // Chọn đồ vật từ menu: highlight ring + bảng tọa độ như click trực tiếp trên canvas
      this.sceneService.selectPropById(propId);
      this.setCameraPreset(propId);
    } else if (prop.position) {
      (this.sceneService as any).setCameraPreset?.('custom', prop.position);
    }
  }

  deleteProp(event: MouseEvent, propId: string): void {
    event.stopPropagation();
    if (!this.profile) return;

    const targetProp = this.roomProps.find(p => p.id === propId);
    const propName = targetProp?.name || propId;

    const dialogRef = this._fuseConfirmationService.open({
      title: 'Xóa đồ vật 3D',
      message: `Bạn có chắc chắn muốn xóa đồ vật <span class="font-semibold text-red-600">${propName}</span> khỏi Căn phòng 306 không?<br>Hành động này không thể hoàn tác!`,
      icon: {
        show: true,
        name: 'feather:alert-triangle',
        color: 'warn'
      },
      actions: {
        confirm: {
          show: true,
          label: 'Xóa ngay',
          color: 'warn'
        },
        cancel: {
          show: true,
          label: 'Hủy bỏ'
        }
      },
      dismissible: true
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result === 'confirmed') {
        this.roomProps = this.roomProps.filter(p => p.id !== propId);
        (this.profile as any).props = this.roomProps;

        try {
          await this.profileDataService.saveProps(this.roomProps).toPromise();
          this.sceneService.applyProfile(this.profile, { skipCamera: true });
          this.sceneService.syncProps(this.roomProps);
          this.onSearchChange();
          this.toastr.success(`Đã xóa đồ vật "${propName}" thành công!`, 'Xóa đồ vật 3D');
          this.cdr.markForCheck();
        } catch (err) {
          console.error('[Profile] Delete prop error:', err);
          this.toastr.error('Không thể xóa đồ vật.', 'Lỗi');
        }
      }
    });
  }

  /** Reset toàn bộ đồ vật về mặc định: xóa đồ đã thêm, chỉ giữ đồ mặc định của app */
  resetPropsToDefault(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.profile) return;

    const userCount = this.roomProps.length;
    const dialogRef = this._fuseConfirmationService.open({
      title: 'Reset đồ vật về mặc định',
      message: `Xóa toàn bộ <span class="font-semibold text-red-600">${userCount}</span> đồ vật đã thêm và trả Căn phòng 306 về trạng thái mặc định?<br>Chỉ giữ lại đồ vật mặc định của app. Hành động này không thể hoàn tác!`,
      icon: {
        show: true,
        name: 'feather:alert-triangle',
        color: 'warn'
      },
      actions: {
        confirm: {
          show: true,
          label: 'Reset ngay',
          color: 'warn'
        },
        cancel: {
          show: true,
          label: 'Hủy bỏ'
        }
      },
      dismissible: true
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result !== 'confirmed') return;
      try {
        // 1. Danh sách props về mặc định (danh sách trống - không còn món mặc định nào)
        this.roomProps = DEFAULT_PROPS.map(p => JSON.parse(JSON.stringify(p)));
        (this.profile as any).props = this.roomProps;

        // 2. Lưu đĩa: props + profile
        await this.profileDataService.saveProps(this.roomProps).toPromise();
        this.profileDataService.saveProfile({ props: this.roomProps } as any).subscribe();

        // 3. Cập nhật scene: xóa toàn bộ entity đồ vật trên canvas
        this.sceneService.applyProfile(this.profile, { skipCamera: true });
        this.sceneService.resetPropsToDefault();
        this.sceneService.syncProps(this.roomProps);

        // 4. Nạp lại panel ĐỒ VẬT + thông báo
        this.onSearchChange();
        this.toastr.success('Đã reset về đồ vật mặc định!', 'Reset Căn phòng 306');
        this.cdr.markForCheck();
      } catch (err) {
        console.error('[Profile] Reset props error:', err);
        this.toastr.error('Không thể reset đồ vật.', 'Lỗi');
      }
    });
  }

  inspectingProp: any | null = null;

  openPropInspector(prop: any): void {
    const cloned = JSON.parse(JSON.stringify(prop));
    if (!cloned.position) cloned.position = { x: 0, y: 0, z: 0 };
    if (!cloned.rotation) cloned.rotation = { x: 0, y: 0, z: 0 };
    if (!cloned.scale) cloned.scale = { x: 1, y: 1, z: 1 };
    if (!cloned.color) cloned.color = '#ffffff';
    if (cloned.opacity === undefined) cloned.opacity = 1.0;
    if (!cloned.category) cloned.category = 'furniture';
    if (!cloned.emissiveColor) cloned.emissiveColor = '#000000';
    if (cloned.emissiveIntensity === undefined) cloned.emissiveIntensity = 0.0;
    if (cloned.metalness === undefined) cloned.metalness = 0.0;
    if (cloned.roughness === undefined) cloned.roughness = 0.5;
    if (cloned.castShadow === undefined) cloned.castShadow = true;
    if (cloned.interactive === undefined) cloned.interactive = true;
    if (!cloned.clickAction) cloned.clickAction = 'focus';
    if (!cloned.floorLevel) cloned.floorLevel = 3;
    if (!cloned.description) cloned.description = '';
    if (!cloned.events) cloned.events = [];
    if (!cloned.subDevices) cloned.subDevices = [];

    const isMonitor = (cloned.id && cloned.id.includes('monitor')) || (cloned.name && cloned.name.toLowerCase().includes('màn hình'));
    if (isMonitor && cloned.activeScreenState === 'clock') {
      const hasEvt = cloned.events.some((e: any) => {
        const t = ((e.customScript || '') + ' ' + (e.name || '')).toLowerCase();
        return t.includes('giờ') || t.includes('thời gian') || t.includes('đồng hồ') || t.includes('clock');
      });
      if (!hasEvt) {
        cloned.events.push({
          id: 'evt_clock',
          name: 'Hiển thị Ngày & Giờ Realtime Hệ thống',
          type: 'custom',
          customScript: 'Hiển thị Ngày & Giờ thời gian thực lên màn hình 3D',
          createdAt: new Date().toISOString()
        });
      }
    }

    this.inspectingProp = cloned;
    this.cdr.markForCheck();
  }

  // ==========================================
  // CANVAS FX EFFECT INSPECTOR (dialog cau hinh dong theo script JS)
  // ==========================================
  fxInspectingId: string | null = null;
  fxInspecting: { id: string; name: string; fileName: string; script: string; params: Record<string, any>; paramsMeta: Array<{ name: string; type: string; value: any; title: string; min?: number; max?: number; step?: number }> } | null = null;
  /** gia tri rgba dang xau '#rrggbb' cho input color; luon giu dong bo voi fxInspecting.params */
  fxColorDrafts: Record<string, string> = {};

  /** Mo dialog cau hinh cho effect trong danh sách Canvas */
  openFxEffectInspector(fxId: string): void {
    const fx = this.sceneService.fxEffects.find((f) => f.id === fxId);
    if (!fx) return;
    this.fxInspectingId = fxId;
    // Ban sao de nguoi dung sua thoai mai; Luu moi ghi vao registry
    this.fxInspecting = JSON.parse(JSON.stringify(fx));
    this.fxColorDrafts = {};
    for (const p of this.fxInspecting.paramsMeta) {
      const v = this.fxInspecting.params[p.name];
      if ((p.type === 'rgb' || p.type === 'rgba') && v && typeof v === 'object') {
        const to2 = (n: number) => Math.max(0, Math.min(255, Math.round((Number(n) || 0) * 255))).toString(16).padStart(2, '0');
        this.fxColorDrafts[p.name] = '#' + to2(v.r) + to2(v.g) + to2(v.b);
      }
    }
    this.cdr.markForCheck();
  }

  closeFxEffectInspector(): void {
    this.fxInspecting = null;
    this.fxInspectingId = null;
    this.fxColorDrafts = {};
    this.cdr.markForCheck();
  }

  /** input type=color chi co rgb — alpha giu nguyen gia tri cu */
  onFxColorChange(name: string, hex: string): void {
    if (!this.fxInspecting) return;
    const p = this.fxInspecting.paramsMeta.find((x) => x.name === name);
    if (!p) return;
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    if (p.type === 'rgb') {
      this.fxInspecting.params[name] = { r, g, b };
    } else {
      const old = this.fxInspecting.params[name] || {};
      this.fxInspecting.params[name] = { r, g, b, a: (typeof old.a === 'number') ? old.a : 1 };
    }
  }

  /** Bat/tat hieu ung tu switch tren the (khong mat cau hinh da chinh) */
  toggleFxEffect(fx: any, event: any): void {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    const checked =
      typeof event?.checked === 'boolean'
        ? event.checked
        : Boolean(event?.target?.checked);
    const ok = this.sceneService.setFxEffectEnabled(fx.id, checked);
    if (ok) {
      this.toastr.success(
        checked ? `Đã bật hiệu ứng "${fx.name}".` : `Đã tắt hiệu ứng "${fx.name}" (giữ nguyên cấu hình).`,
        'Hiệu ứng canvas'
      );
    } else {
      this.toastr.error(`Không bật/tắt được hiệu ứng "${fx.name}".`, 'Hiệu ứng canvas');
      if (event?.source && 'checked' in event.source) {
        event.source.checked = !checked;
      } else if (event?.target) {
        (event.target as HTMLInputElement).checked = !checked;
      }
    }
    this.cdr.markForCheck();
  }

  removeFxFromList(id: string, event?: Event): void {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const fx = this.sceneService.fxEffects.find((f) => f.id === id);
    if (!fx) return;
    const confirmed = window.confirm(`Gỡ hiệu ứng "${fx.name}" khỏi danh sách và dừng nó trên canvas?`);
    if (!confirmed) return;
    this.sceneService.removeFxEffect(id);
    if (this.fxInspectingId === id) this.closeFxEffectInspector();
    this.cdr.markForCheck();
  }

  /** Luu dialog: update params dong — effect restart voi gia tri moi ngay lap tuc */
  saveFxEffectConfig(): void {
    if (!this.fxInspecting) return;
    const ok = this.sceneService.updateFxEffectParams(this.fxInspecting.id, this.fxInspecting.params);
    if (ok) {
      this.toastr.success(`Đã áp dụng cấu hình cho "${this.fxInspecting.name}".`, 'Hiệu ứng canvas');
      this.closeFxEffectInspector();
    } else {
      this.toastr.error('Không áp dụng được cấu hình. Canvas có thể chưa sẵn sàng.', 'Hiệu ứng canvas');
    }
    this.cdr.markForCheck();
  }

  // ==========================================
  // QUẢN LÝ SUB-DEVICES (THÀNH PHẦN CON) TOÀN CỤC
  // ==========================================
  subDeviceSearchQuery = '';
  isSubDevicesModalOpen = false;

  getAllSubDevices(): { sub: any; prop: any; index: number }[] {
    const list: { sub: any; prop: any; index: number }[] = [];
    if (!this.roomProps) return list;
    for (const prop of this.roomProps) {
      if (Array.isArray(prop.subDevices)) {
        prop.subDevices.forEach((sub: any, index: number) => {
          list.push({ sub, prop, index });
        });
      }
    }
    return list;
  }

  // ==========================================
  // TREE VIEW SCENE NODE SYSTEM
  // ==========================================
  expandedPropIds: Set<string> = new Set<string>();

  togglePropTree(propId: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.expandedPropIds.has(propId)) {
      this.expandedPropIds.delete(propId);
    } else {
      this.expandedPropIds.add(propId);
    }
    this.cdr.markForCheck();
  }

  isPropExpanded(propId: string): boolean {
    if (!this.expandedPropIds.has(propId)) {
      const prop = this.roomProps?.find(p => p.id === propId);
      if (prop && Array.isArray(prop.subDevices) && prop.subDevices.length > 0) {
        this.expandedPropIds.add(propId);
        return true;
      }
      return false;
    }
    return true;
  }

  // ==========================================
  // SUB-DEVICE INSPECTOR (THUỘC TÍNH & PHƯƠNG THỨC)
  // ==========================================
  inspectingSubDevice: { sub: any; prop: any } | null = null;

  openSubDeviceInspector(prop: any, sub: any, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (!sub.position) sub.position = { x: 0, y: 0, z: 0 };
    if (!sub.rotation) sub.rotation = { x: 0, y: 0, z: 0 };
    if (!sub.scale) sub.scale = { x: 0.4, y: 0.4, z: 0.4 };
    if (!sub.color) sub.color = '#05dac6';
    if (sub.opacity === undefined) sub.opacity = 1;
    if (!sub.emissiveColor) sub.emissiveColor = '#00ffff';
    if (sub.emissiveIntensity === undefined) sub.emissiveIntensity = 0.8;
    if (sub.metalness === undefined) sub.metalness = 0.1;
    if (sub.roughness === undefined) sub.roughness = 0.3;
    if (sub.castShadow === undefined) sub.castShadow = false;
    if (sub.visible === undefined) sub.visible = sub.enabled !== false;
    if (!sub.events) sub.events = [];

    this.inspectingSubDevice = { prop, sub };
    this.cdr.markForCheck();
  }

  addSubDeviceEvent(sub: any): void {
    if (!sub.events) sub.events = [];
    sub.events.push({
      id: 'sub_evt_' + Date.now(),
      name: 'Sự kiện thành phần con mới',
      customScript: ''
    });
    this.cdr.markForCheck();
  }

  removeSubDeviceEvent(sub: any, index: number): void {
    if (sub.events && sub.events[index]) {
      sub.events.splice(index, 1);
      this.cdr.markForCheck();
    }
  }

  closeSubDeviceInspector(): void {
    this.inspectingSubDevice = null;
    this.cdr.markForCheck();
  }

  async saveSubDeviceInspector(): Promise<void> {
    if (!this.inspectingSubDevice) return;
    const { prop, sub } = this.inspectingSubDevice;

    const idx = this.roomProps.findIndex(p => p.id === prop.id);
    if (idx >= 0) {
      this.roomProps[idx] = JSON.parse(JSON.stringify(prop));
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    await this.profileDataService.saveProps(this.roomProps).toPromise();
    this.sceneService.syncProps(this.roomProps);

    this.inspectingSubDevice = null;
    this.cdr.markForCheck();
    this.toastr.success(`Đã lưu Thuộc tính & Phương thức cho "${sub.name}"!`, 'Thành Phần Con');
  }

  get activeSubDevicesCount(): number {
    return this.getAllSubDevices().filter(i => i.sub && i.sub.enabled !== false).length;
  }

  get propsWithSubDevicesCount(): number {
    return this.roomProps ? this.roomProps.filter(p => Array.isArray(p.subDevices) && p.subDevices.length > 0).length : 0;
  }

  get filteredAllSubDevices(): { sub: any; prop: any; index: number }[] {
    const all = this.getAllSubDevices();
    if (!this.subDeviceSearchQuery || !this.subDeviceSearchQuery.trim()) {
      return all;
    }
    const q = this.subDeviceSearchQuery.toLowerCase().trim();
    return all.filter(item =>
      (item.sub.name && item.sub.name.toLowerCase().includes(q)) ||
      (item.sub.customScript && item.sub.customScript.toLowerCase().includes(q)) ||
      (item.prop.name && item.prop.name.toLowerCase().includes(q))
    );
  }

  openAllSubDevicesModal(): void {
    this.isSubDevicesModalOpen = true;
    this.cdr.markForCheck();
  }

  closeAllSubDevicesModal(): void {
    this.isSubDevicesModalOpen = false;
    this.cdr.markForCheck();
  }

  removeSubDeviceFromGlobal(prop: any, subIndex: number): void {
    if (!prop || !Array.isArray(prop.subDevices)) return;
    const removed = prop.subDevices.splice(subIndex, 1);

    const idx = this.roomProps.findIndex(p => p.id === prop.id);
    if (idx >= 0) {
      this.roomProps[idx] = JSON.parse(JSON.stringify(prop));
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.sceneService.syncProps(this.roomProps);

    this.cdr.markForCheck();
    if (removed.length > 0) {
      this.toastr.info(`Đã xoá thành phần "${removed[0].name}"`, 'Thành Phần Con');
    }
  }

  toggleSubDeviceStateFromGlobal(prop: any, sub: any): void {
    if (!sub || !prop) return;
    const nextState = (sub.enabled === false || sub.visible === false) ? true : false;
    sub.enabled = nextState;
    sub.visible = nextState;

    const idx = this.roomProps.findIndex(p => p.id === prop.id);
    if (idx >= 0) {
      if (Array.isArray(this.roomProps[idx].subDevices)) {
        const subIdx = this.roomProps[idx].subDevices.findIndex((s: any) => s.id === sub.id);
        if (subIdx >= 0) {
          this.roomProps[idx].subDevices[subIdx].enabled = nextState;
          this.roomProps[idx].subDevices[subIdx].visible = nextState;
        }
      }
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.sceneService.syncProps(this.roomProps);

    this.cdr.markForCheck();
    const status = nextState ? 'Bật' : 'Tắt';
    this.toastr.info(`Đã ${status} "${sub.name}" trong không gian 3D`, 'Điều khiển Thành phần');
  }

  addSubDevice(type: string = 'button', defaultName?: string): void {
    if (!this.inspectingProp) return;
    if (!this.inspectingProp.subDevices) {
      this.inspectingProp.subDevices = [];
    }
    const typeNames: Record<string, string> = {
      button: 'Nút bấm gắn thêm',
      light: 'Đèn LED trang trí',
      curtain: 'Rèm cửa tự động',
      sensor: 'Cảm biến an ninh',
      tv: 'Màn hình TV chạm',
      custom: 'Thành phần / Đồ vật con'
    };
    const name = defaultName || typeNames[type] || 'Đồ vật con';
    const count = this.inspectingProp.subDevices.length + 1;
    const sub = {
      id: 'sub_' + Date.now(),
      name: `${name} #${count}`,
      type: type || 'button',
      enabled: true,
      color: '#ffaa00',
      intensity: 5,
      openPercentage: 100,
      customScript: '',
      createdAt: new Date().toISOString()
    };
    this.inspectingProp.subDevices.push(sub);
    this.cdr.markForCheck();
    this.toastr.success(`Đã thêm đồ vật con "${sub.name}"!`, 'Thêm Đồ Vật Con');
  }

  removeSubDevice(index: number): void {
    if (!this.inspectingProp || !this.inspectingProp.subDevices) return;
    const removed = this.inspectingProp.subDevices.splice(index, 1);
    
    // Realtime Sync to roomProps, Profile data, and 3D Canvas
    const idx = this.roomProps.findIndex(p => p.id === this.inspectingProp.id);
    if (idx >= 0) {
      this.roomProps[idx] = JSON.parse(JSON.stringify(this.inspectingProp));
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.sceneService.syncProps(this.roomProps);

    this.cdr.markForCheck();
    if (removed.length > 0) {
      this.toastr.info(`Đã xoá thành phần "${removed[0].name}"`, 'Thành Phần Con');
    }
  }

  toggleSubDeviceState(sub: any, parentProp?: any): void {
    if (!sub) return;
    sub.enabled = !sub.enabled;

    // Realtime Sync to roomProps, Profile data, and 3D Canvas
    if (this.inspectingProp) {
      const idx = this.roomProps.findIndex(p => p.id === this.inspectingProp.id);
      if (idx >= 0) {
        this.roomProps[idx] = JSON.parse(JSON.stringify(this.inspectingProp));
      }
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.sceneService.syncProps(this.roomProps);

    this.cdr.markForCheck();
    const status = sub.enabled ? 'Bật' : 'Tắt';
    this.toastr.info(`Đã ${status} "${sub.name}"`, 'Điều khiển Thành phần');
  }

  async executeSubDevicePrompt(sub: any, parentProp?: any): Promise<void> {
    if (!sub) return;
    const text = (sub.customScript || sub.name || '').trim();
    if (!text) return;

    this.toastr.info(`Đang tạo/cập nhật 3D cho "${sub.name}"...`, 'AI Agent 3D');

    const lower = text.toLowerCase();
    if (lower.includes('tròn') || lower.includes('hình tròn') || lower.includes('circle') || lower.includes('sphere')) {
      sub.shape = 'sphere';
    } else if (lower.includes('vuông') || lower.includes('box')) {
      sub.shape = 'box';
    }

    if (lower.includes('tivi') || lower.includes('tv') || lower.includes('màn hình cảm ứng') || lower.includes('iframe')) {
      sub.type = 'tv';
      this.sceneService.toggleWindowTvIframe(true, 'https://type.vn');
    }

    if (lower.includes('ngày') || lower.includes('giờ') || lower.includes('thời gian') || lower.includes('màn hình') || lower.includes('clock') || lower.includes('date') || lower.includes('time') || lower.includes('screen') || lower.includes('display')) {
      let side: 'left' | 'right' | 'both' = 'both';
      if (parentProp && parentProp.id && parentProp.id.includes('left')) side = 'left';
      else if (parentProp && parentProp.id && parentProp.id.includes('right')) side = 'right';
      this.sceneService.showDateTimeOnMonitor(side);
      this.toastr.success(`Đã hiển thị Ngày & Giờ thời gian thực lên màn hình 3D!`, 'Màn hình 3D Realtime');
    }

    // Realtime Sync to roomProps, Profile data, and 3D Canvas
    if (this.inspectingProp) {
      const idx = this.roomProps.findIndex(p => p.id === this.inspectingProp.id);
      if (idx >= 0) {
        this.roomProps[idx] = JSON.parse(JSON.stringify(this.inspectingProp));
      }
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    await this.profileDataService.saveProps(this.roomProps).toPromise();
    this.sceneService.syncProps(this.roomProps);

    this.cdr.markForCheck();
    this.toastr.success(`Đã tạo/cập nhật 3D thành công cho "${sub.name}"!`, 'Tạo Thành Phần Con');
  }

  getSubDeviceIcon(type: string): string {
    switch (type) {
      case 'light': return 'lightbulb';
      case 'curtain': return 'curtains';
      case 'sensor': return 'sensors';
      case 'button': return 'smart_button';
      case 'tv': return 'tv';
      case 'speaker': return 'volume_up';
      default: return 'widgets';
    }
  }

  addPropEvent(): void {
    if (!this.inspectingProp) return;
    if (!this.inspectingProp.events) {
      this.inspectingProp.events = [];
    }
    const count = (this.inspectingProp.events.length || 0) + 1;
    const newEvt = {
      id: 'btn_' + Date.now(),
      name: `Sự kiện #${count}`,
      type: 'custom',
      customScript: '',
      createdAt: new Date().toISOString()
    };
    this.inspectingProp.events.push(newEvt);
    this.cdr.markForCheck();
    this.toastr.success(`Đã thêm sự kiện mới "${newEvt.name}"!`, 'Thêm Sự Kiện Động');
  }

  removePropEvent(index: number): void {
    if (!this.inspectingProp || !this.inspectingProp.events) return;
    const removed = this.inspectingProp.events.splice(index, 1);
    this.cdr.markForCheck();
    if (removed.length > 0) {
      const rm = removed[0];
      const txt = ((rm.customScript || '') + ' ' + (rm.name || '')).toLowerCase();
      const isClockEvt = txt.includes('ngày') || txt.includes('giờ') || txt.includes('thời gian') || txt.includes('clock') || txt.includes('time') || txt.includes('date');
      const isMonitor = (this.inspectingProp.id && this.inspectingProp.id.includes('monitor')) || (this.inspectingProp.name && this.inspectingProp.name.toLowerCase().includes('màn hình'));

      if (isMonitor && isClockEvt) {
        this.inspectingProp.activeScreenState = 'none';
        let side: 'left' | 'right' | 'both' = 'both';
        if (this.inspectingProp.id && this.inspectingProp.id.includes('left')) side = 'left';
        else if (this.inspectingProp.id && this.inspectingProp.id.includes('right')) side = 'right';
        this.sceneService.clearMonitorDisplay(side);
      }

      this.toastr.info(`Đã xoá sự kiện "${rm.name}"`, 'Quản lý Sự Kiện');
    }
  }

  runSpecificPropEvent(evt: any, parentProp?: any): void {
    if (!evt) return;
    const targetProp = parentProp || this.inspectingProp;
    if (evt.type === 'focus') {
      this.onPropClick(targetProp);
    } else if (evt.type === 'custom' || evt.customScript) {
      const scriptText = evt.customScript || evt.name || 'Thực thi hành động 3D';
      this.processAiPrompt(scriptText, [], targetProp ? [targetProp] : []);
    } else {
      this.executePropEvent(targetProp);
    }
  }

  getEventTypeName(type: string): string {
    const types: Record<string, string> = {
      focus: 'Focus Camera 3D',
      toggleLight: 'Bật/Tắt Đèn LED',
      toggleDoor: 'Mở/Đóng Cửa',
      toggleWindow: 'Mở/Đóng Cửa sổ',
      custom: 'Kịch bản Lệnh tự do (Custom Script)',
      playSound: 'Phát Âm thanh Tương tác'
    };
    return types[type] || type || 'Sự kiện 3D';
  }

  onPropVisibilityToggle(visible: boolean): void {
    if (!this.inspectingProp) return;
    this.inspectingProp.visible = visible;
    const idx = this.roomProps.findIndex(p => p.id === this.inspectingProp.id);
    if (idx >= 0) {
      this.roomProps[idx].visible = visible;
    }
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.sceneService.syncProps(this.roomProps);
    this.cdr.markForCheck();
  }

  async savePropInspector(): Promise<void> {
    if (!this.inspectingProp || !this.profile) return;
    const propId = this.inspectingProp.id || '';
    
    if (this.inspectingProp.position && typeof this.inspectingProp.position.x === 'number') {
      this.inspectingProp._customPositionSet = true;
    }
    if (this.inspectingProp.rotation && typeof this.inspectingProp.rotation.x === 'number') {
      this.inspectingProp._customRotationSet = true;
    }
    if (this.inspectingProp.scale && typeof this.inspectingProp.scale.x === 'number') {
      this.inspectingProp._customScaleSet = true;
    }

    const isMonitor = (propId && propId.includes('monitor')) || (this.inspectingProp.name && this.inspectingProp.name.toLowerCase().includes('màn hình'));

    if (isMonitor) {
      this.inspectingProp._customColorSet = false;
      this.inspectingProp._customPositionSet = false;
      this.inspectingProp._customRotationSet = false;
      this.inspectingProp._customScaleSet = false;

      if (this.inspectingProp.events && Array.isArray(this.inspectingProp.events) && this.inspectingProp.events.length > 0) {
        const lastEvt = this.inspectingProp.events[this.inspectingProp.events.length - 1];
        const txt = ((lastEvt.customScript || '') + ' ' + (lastEvt.name || '')).toLowerCase();
        const isClock = txt.includes('ngày') || txt.includes('giờ') || txt.includes('thời gian') || txt.includes('đồng hồ') || txt.includes('clock');

        if (isClock) {
          this.inspectingProp.activeScreenState = 'clock';
          if (this.inspectingProp.screenOptions) delete this.inspectingProp.screenOptions.screenText;
        } else {
          this.inspectingProp.activeScreenState = 'display';
          if (!this.inspectingProp.screenOptions) this.inspectingProp.screenOptions = {};
          this.inspectingProp.screenOptions.screenText = lastEvt.customScript || lastEvt.name;
        }
      } else if (!this.inspectingProp.activeScreenState || this.inspectingProp.activeScreenState === 'none') {
        this.inspectingProp.activeScreenState = 'clock';
      }
    } else if (this.inspectingProp.color && this.inspectingProp.color.toLowerCase() !== '#ffffff') {
      this.inspectingProp._customColorSet = true;
    }

    if (this.inspectingProp.opacity !== undefined && typeof this.inspectingProp.opacity === 'number' && this.inspectingProp.opacity < 1.0) {
      this.inspectingProp._customOpacitySet = true;
    }
    if (this.inspectingProp.emissiveColor && this.inspectingProp.emissiveIntensity && this.inspectingProp.emissiveIntensity > 0) {
      this.inspectingProp._customEmissiveSet = true;
    }
    if (this.inspectingProp.metalness !== undefined && typeof this.inspectingProp.metalness === 'number' && this.inspectingProp.metalness > 0) {
      this.inspectingProp._customMetalnessSet = true;
    }
    if (this.inspectingProp.roughness !== undefined && typeof this.inspectingProp.roughness === 'number' && this.inspectingProp.roughness !== 0.5) {
      this.inspectingProp._customRoughnessSet = true;
    }

    const idx = this.roomProps.findIndex(p => p.id === propId);

    if (idx >= 0) {
      this.roomProps[idx] = JSON.parse(JSON.stringify(this.inspectingProp));
    } else {
      this.roomProps.push(JSON.parse(JSON.stringify(this.inspectingProp)));
    }
    (this.profile as any).props = this.roomProps;

    try {
      await this.profileDataService.saveProps(this.roomProps).toPromise();
      this.sceneService.applyProfile(this.profile, { skipCamera: true });

      if (isMonitor) {
        let side: 'left' | 'right' | 'both' = 'both';
        if (propId.includes('left')) side = 'left';
        else if (propId.includes('right')) side = 'right';

        if (this.inspectingProp.activeScreenState === 'clock' || this.inspectingProp.activeScreenState === 'display' || this.inspectingProp.activeScreenState === 'image' || this.inspectingProp.screenOptions?.screenText || this.inspectingProp.screenOptions?.imageUrl) {
          this.sceneService.showDateTimeOnMonitor(side, this.inspectingProp.screenOptions);
        } else {
          this.sceneService.clearMonitorDisplay(side);
        }
      }

      this.toastr.success(`Đã cập nhật thuộc tính cho "${this.inspectingProp.name}"!`, 'Thuộc tính Đồ vật 3D');
      this.inspectingProp = null;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[Profile] Save prop inspector error:', err);
      this.toastr.error('Không thể lưu thuộc tính đồ vật.', 'Lỗi');
    }
  }

  executePropEvent(prop: any): void {
    if (!prop) return;
    const action = prop.clickAction || 'focus';

    if (action === 'focus') {
      this.onPropClick(prop);
      this.toastr.info(`Đã định vị góc nhìn camera tới "${prop.name}"`, 'Góc nhìn 3D');
      return;
    }

    if (action === 'toggle') {
      prop.visible = !prop.visible;
      const idx = this.roomProps.findIndex(p => p.id === prop.id);
      if (idx >= 0) this.roomProps[idx].visible = prop.visible;
      this.profileDataService.saveProps(this.roomProps).subscribe();
      this.sceneService.syncProps(this.roomProps);
      this.toastr.info(`Đã ${prop.visible ? 'bật hiển thị' : 'ẩn'} đồ vật "${prop.name}"`, 'Bật/Tắt Đồ vật');
      return;
    }

    if (action === 'custom' && (prop.customScript || (prop.events && prop.events.length > 0))) {
      const scriptText = prop.customScript || (prop.events[0].customScript || prop.events[0].name);
      this.processAiPrompt(scriptText, [], [prop]);
      this.toastr.info(`Đã kích hoạt kịch bản: "${scriptText}"`, 'Kịch bản 3D Tuỳ chỉnh');
      return;
    }

    if (action === 'trigger_event' || action === 'toggleTouchTV') {
      if (action === 'toggleTouchTV') {
        this.setCameraPreset('desk');
        this.toastr.success('📺 Đã chuyển sang Chế độ Tivi màn hình chạm!', 'Tivi Màn Hình Chạm');
        return;
      }
      const triggerName = this.getPropTriggerName(prop.id);
      const executed = this.sceneService.executeEvent(triggerName);
      if (executed) {
        this.toastr.info(`Đã thực thi kịch bản sự kiện "${triggerName}"`, 'Thực thi Hành động 3D');
      } else {
        this.onPropClick(prop);
      }
      return;
    }

    this.onPropClick(prop);
    this.toastr.info(`Đã định vị góc nhìn camera tới "${prop.name}"`, 'Góc nhìn 3D');
  }

  getPropTriggerName(propId: string): string {
    const id = (propId || '').toLowerCase();
    if (id.includes('switch') || id.includes('led')) return 'clickLightSwitch';
    if (id.includes('window')) return 'clickWindow';
    if (id.includes('door')) return 'clickDoor';
    if (id.includes('aquarium')) return 'clickAquarium';
    if (id.includes('drawer')) return 'clickDrawer';
    if (id.includes('picture')) return 'clickPicture';
    if (id.includes('character')) return 'clickCharacter';
    return 'clickProp';
  }

  deletePropFromInspector(event: MouseEvent, propId: string): void {
    this.inspectingProp = null;
    this.deleteProp(event, propId);
  }

  /** Mở file picker khi click vào upload zone */
  triggerUpload(): void {
    this.glbFileInput?.nativeElement?.click();
  }

  /** Đổi góc nhìn camera */
  setCameraPreset(preset: string): void {
    (this.sceneService as any).setCameraPreset?.(preset);
  }

  /** Chọn và phát animation cho nhân vật */
  setAnimation(animName: string, glbPath?: string, isMovement?: boolean, speed?: number): void {
    const found = this.userAnimations.find(a => a.name === animName);
    if (found) {
      glbPath = glbPath || found.glbPath;
      if (typeof isMovement !== 'boolean') isMovement = found.isMovement;
      if (typeof speed !== 'number') speed = found.speed;
    }
    console.log('[Profile] Play animation:', animName, glbPath, isMovement, speed);
    this.sceneService.playAnimation?.(animName, glbPath, isMovement, speed);
    this.cdr.markForCheck();
  }

  /** Đặt 1 hành động làm mặc định cho nhân vật (lưu vào profile) */
  setDefaultAnimation(event: Event, animName: string, glbPath?: string, isMovement?: boolean, speed?: number): void {
    event.stopPropagation();
    const found = this.userAnimations.find(a => a.name === animName);
    if (found) {
      glbPath = glbPath || found.glbPath;
      if (typeof isMovement !== 'boolean') isMovement = found.isMovement;
      if (typeof speed !== 'number') speed = found.speed;
    }
    if (this.profile?.character) {
      this.profile.character.animationState = animName;
    }
    console.log('[Profile] Set default animation:', animName, glbPath, isMovement, speed);
    this.profileDataService.saveCharacter({ animationState: animName }).subscribe();
    this.sceneService.playAnimation?.(animName, glbPath, isMovement, speed);
    this.cdr.markForCheck();
  }

  /** Modal Cấu hình hành động */
  editingAction: { id: string; name: string; isMovement: boolean; speed: number } | null = null;

  openActionConfig(event: MouseEvent, anim: any): void {
    event.stopPropagation();
    this.editingAction = {
      id: anim.id,
      name: anim.name,
      isMovement: anim.isMovement ?? false,
      speed: anim.speed ?? (anim.isMovement ? 11.0 : 0.0)
    };
    this.cdr.markForCheck();
  }

  async saveActionConfig(): Promise<void> {
    if (!this.editingAction) return;
    const { id, name, isMovement, speed } = this.editingAction;
    try {
      if ((window as any).electron?.updateAnimation) {
        const res = await (window as any).electron.updateAnimation(this.username, id, {
          name: name.trim(),
          isMovement,
          speed: isMovement ? (speed > 0 ? speed : 11.0) : 0.0
        });
        if (res?.success && res.data) {
          const idx = this.userAnimations.findIndex(a => a.id === id);
          if (idx >= 0) {
            this.userAnimations[idx] = res.data;
          }
          if (this.profile?.character?.animationState === name) {
            this.setAnimation(res.data.name, res.data.glbPath, res.data.isMovement, res.data.speed);
          }
        }
      }
    } catch (e) {
      console.error('[Profile] Save action config error:', e);
    }
    this.editingAction = null;
    this.cdr.markForCheck();
  }

  closeActionConfig(): void {
    this.editingAction = null;
    this.cdr.markForCheck();
  }

  /** Trigger thêm hành động mới */
  triggerAddAction(): void {
    this.actionFileInput?.nativeElement?.click();
  }

  /** Xử lý khi chọn file animation clip GLB */
  async onActionFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    input.value = '';

    const actionName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
    if (!actionName) return;

    try {
      const buffer = await file.arrayBuffer();
      if ((window as any).electron?.uploadAnimation) {
        const res = await (window as any).electron.uploadAnimation(this.username, actionName, buffer);
        if (res?.success && res.data) {
          const idx = this.userAnimations.findIndex(a => a.name === res.data.name);
          if (idx >= 0) {
            this.userAnimations[idx] = res.data;
          } else {
            this.userAnimations.push(res.data);
          }
          this.setAnimation(res.data.name, res.data.glbPath);
          this.cdr.markForCheck();
        } else {
          alert('Upload hành động thất bại: ' + (res?.error || 'Lỗi không xác định'));
        }
      }
    } catch (err: any) {
      console.error('[Profile] Upload action error:', err);
      alert('Upload hành động thất bại: ' + (err?.message || 'Lỗi không xác định'));
    }
  }

  /** Xoá 1 hành động đã upload */
  async deleteAction(event: MouseEvent, animId: string): Promise<void> {
    event.stopPropagation();
    try {
      if ((window as any).electron?.deleteAnimation) {
        const res = await (window as any).electron.deleteAnimation(this.username, animId);
        if (res?.success) {
          this.userAnimations = this.userAnimations.filter(a => a.id !== animId);
          this.cdr.markForCheck();
        }
      }
    } catch (err) {
      console.error('[Profile] Delete animation error:', err);
    }
  }

  /** Trigger thêm hình ảnh */
  triggerAddImage(): void {
    this.photoFileInput?.nativeElement?.click();
  }

  /** Trigger thêm audio */
  triggerAddAudio(): void {
    this.audioFileInput?.nativeElement?.click();
  }

  /** Trigger thêm text */
  triggerAddText(): void {
    this.textFileInput?.nativeElement?.click();
  }

  /** Xử lý khi user chọn file Audio */
  async onAudioSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    try {
      const audioUrl = URL.createObjectURL(file);
      const audio = new Audio(audioUrl);
      audio.play().catch(e => console.warn('[Profile] Audio play error:', e));
      this.toastr.success(`Đã thêm và phát âm thanh: "${file.name}"`, 'Thêm Audio');
    } catch (err: any) {
      console.error('[Profile] Audio load error:', err);
      this.toastr.error('Không thể phát file audio này.', 'Lỗi Audio');
    }
  }

  /** Xử lý khi user chọn file Text (txt, json, md, srt, vtt) */
  async onTextFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    try {
      const textContent = await file.text();
      // Hiển thị lên cả hai màn hình của góc làm việc 3D
      this.sceneService.showDateTimeOnMonitor('both', {
        screenText: textContent.slice(0, 150)
      });
      // Đưa nội dung vào prompt input nếu đang trống
      if (!this.promptText) {
        this.promptText = textContent.slice(0, 200);
      }
      this.toastr.success(`Đã nạp văn bản từ "${file.name}" lên màn hình 3D!`, 'Thêm Text');
      this.cdr.markForCheck();
    } catch (err: any) {
      console.error('[Profile] Text file read error:', err);
      this.toastr.error('Không thể đọc file văn bản.', 'Lỗi Text');
    }
  }

  /** Nạp lại toàn bộ đồ vật GLB đã lưu khi khởi động scene */
  private async loadSavedPropGlbs(): Promise<void> {
    const glbProps = this.roomProps.filter(p => p?.glbPath && p.visible === true);
    if (glbProps.length === 0) return;
    console.log('[Profile] Nạp lại', glbProps.length, 'đồ vật GLB đã lưu...');
    let anyFailed = false;
    for (const prop of glbProps) {
      try {
        // Nếu glbPath đã có sẵn trong Asset Cache (ví dụ các bản sao nhân bản cùng model),
        // khởi tạo trực tiếp từ GPU asset đã nạp, KHÔNG đọc lại file từ đĩa qua IPC
        if (this.sceneService.hasCachedGlbAsset(prop.glbPath)) {
          const ok = await new Promise<boolean>((resolve) => {
            this.sceneService.loadPropGlb(prop.id, '', prop, (loaded: boolean) => resolve(loaded));
          });
          if (ok) {
            (prop as any)._glbLoaded = true;
            continue;
          }
        }
        const blobUrl = await this.profileDataService.readGlbAsObjectUrl(prop.glbPath).toPromise();
        if (blobUrl) {
          const ok = await new Promise<boolean>((resolve) => {
            this.sceneService.loadPropGlb(prop.id, blobUrl, prop, (loaded: boolean) => resolve(loaded));
          });
          URL.revokeObjectURL(blobUrl);
          if (ok) {
            (prop as any)._glbLoaded = true;
          } else {
            // FIX: nạp thất bại khi khởi động -> hoàn visible=false để món quay về trạng thái
            // xám "chưa dùng", bấm vào sẽ insert lại thay vì kẹt sáng màu mà canvas trống
            prop.visible = false;
            anyFailed = true;
            console.warn('[Profile] Nạp GLB thất bại khi khởi động, hoàn về chưa dùng:', prop?.name);
          }
        } else {
          prop.visible = false;
          anyFailed = true;
          console.warn('[Profile] Blob URL rỗng cho đồ vật:', prop?.name);
        }
      } catch (e) {
        prop.visible = false;
        anyFailed = true;
        console.warn('[Profile] Không nạp được GLB của đồ vật:', prop?.name, prop?.glbPath, e);
      }
    }
    if (anyFailed) {
      this.profileDataService.saveProps(this.roomProps).subscribe();
      this.onSearchChange();
      this.cdr.markForCheck();
    }
  }

  /** Mở hộp thoại chọn file GLB cho đồ vật */
  triggerAddPropGlb(): void {
    this.propGlbFileInput?.nativeElement?.click();
  }

  /** Xử lý khi user chọn file GLB: thêm NHIỀU file, chỉ vào DANH SÁCH ĐỒ VẬT (chưa insert scene) */
  async onPropGlbSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    const glbFiles = files.filter(f => f.name.toLowerCase().endsWith('.glb'));
    if (glbFiles.length === 0) {
      this.toastr.error('Chỉ chấp nhận file .glb', 'Upload GLB');
      return;
    }

    let okCount = 0;
    let failCount = 0;
    for (const file of glbFiles) {
      try {
        const baseName = file.name.replace(/\.glb$/i, '') || 'Mo_hinh';
        const buffer = await file.arrayBuffer();
        const uploadName = `${baseName}_${Date.now()}`;

        // 1. Lưu file qua Electron IPC vào assets/props/ (NHANH — không chèn scene)
        const res: any = await (window as any).electron.uploadProp(
          this.username, uploadName, { x: 0, y: 0, z: 0 }, 1.0, buffer
        );
        if (!res?.success || !res.data?.glbPath) throw new Error(res?.error || 'Không lưu được GLB');
        const saved = res.data;

        // 2. Prop entry: visible=false (chỉ trong danh sách, chưa vào canvas), không transform
        const newProp: any = {
          id: saved.id,
          name: baseName,
          type: 'model',
          glbPath: saved.glbPath,
          visible: false,
          shape: 'model',
          addedAt: saved.addedAt
        };
        this.roomProps.push(newProp);
        (this.profile as any).props = this.roomProps;

        // 3. Thumbnail offscreen: render GLB trong renderer ẩn, KHÔNG đụng scene chính
        const blobUrl = await this.profileDataService.readGlbAsObjectUrl(saved.glbPath).toPromise();
        if (blobUrl) {
          const dataUrl = await this.sceneService.generateGlbThumbnail(blobUrl);
          if (dataUrl) {
            newProp.thumbnail = dataUrl;
          }
          URL.revokeObjectURL(blobUrl);
        }

        this.profileDataService.saveProps(this.roomProps).subscribe();
        okCount++;
      } catch (err: any) {
        console.error('[Profile] Upload prop GLB error:', file.name, err);
        failCount++;
      }
    }

    this.onSearchChange();
    if (okCount > 0 && failCount === 0) {
      this.toastr.success(`Đã thêm ${okCount} đồ vật vào danh sách (chưa hiện trên canvas)`, 'Upload GLB');
    } else if (okCount > 0 && failCount > 0) {
      this.toastr.warning(`Thêm ${okCount} thành công, ${failCount} thất bại`, 'Upload GLB');
    } else {
      this.toastr.error('Upload GLB thất bại', 'Upload GLB');
    }
    this.cdr.markForCheck();
  }

  /**
   * Insert đồ vật từ danh sách vào scene canvas: visible=true + load GLB thật.
   * Sau khi insert thành công: prop hiển thị trên canvas như đồ vật thường.
   */
  async insertPropToScene(inputProp: any): Promise<void> {
    if (!inputProp || !inputProp.glbPath || !this.profile) return;
    // FIX race profile$: sidebar có thể giữ object MỒ CÔI (roomProps đã bị mergeProps
    // thay bằng mảng object mới sau mỗi lần save). Sửa visible trên object mồ côi
    // không bao giờ được lưu đĩa -> applyProfile sẽ tắt entity vừa tạo (enabled=false).
    // Luôn thao tác trên object "sống" hiện tại trong roomProps.
    const propId = inputProp.id;
    const live = this.roomProps.find(p => p && p.id === propId) || inputProp;
    const prop = live;
    delete (prop as any)._inserting; // dọn tàn dư nếu prop cũ từng bị lưu dính _inserting
    if (this._insertingPropIds.has(propId)) return;
    // Chặn insert kép CHỈ khi entity còn sống trên canvas; nếu visible=true nhưng
    // entity đã mất (kẹt sau khi xóa) -> cho insert lại (self-heal)
    if (prop.visible === true && this.sceneService.hasPropEntity(propId)) return;
    this._insertingPropIds.add(propId);

    try {
      // 1. Bật visible + tạo transform mặc định
      prop.visible = true;
      if (!prop.position) prop.position = { x: 0, y: 0, z: 0 };
      if (!prop.rotation) prop.rotation = { x: 0, y: 0, z: 0 };
      if (!prop.scale) prop.scale = { x: 1, y: 1, z: 1 };

      // 2. Đọc GLB thành blob URL (hoặc lấy trực tiếp từ Asset Cache nếu đã nạp) và nạp vào scene PlayCanvas
      const cached = this.sceneService.hasCachedGlbAsset(prop.glbPath);
      const blobUrl = cached ? '' : await this.profileDataService.readGlbAsObjectUrl(prop.glbPath).toPromise();
      if (cached) {
        await new Promise<void>((resolve) => {
          this.sceneService.loadPropGlb(prop.id, '', prop, (ok: boolean) => {
            if (!ok) prop.visible = false;
            resolve();
          });
        });
      } else
      if (blobUrl) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          // Guard 30s: callback loadPropGlb không fire (file cực lớn / hang) thì thoát,
          // tránh kẹt cờ _inserting = true vĩnh viễn khiến bấm lại im lặng
          const guard = setTimeout(done, 30000);
          this.sceneService.loadPropGlb(prop.id, blobUrl, prop, (ok: boolean) => {
            clearTimeout(guard);
            if (!ok) {
              // FIX: GLB nạp thất bại (file hỏng / parse lỗi) -> hoàn tra visible=false
              // để món đồ KHÔNG kẹt ở trạng thái "đã dùng" mà canvas trắng
              prop.visible = false;
              this.toastr.warning(`"${prop.name}" không nạp được vào canvas (file GLB lỗi?), thử upload lại.`, 'Nạp đồ vật');
            }
            done();
          });
        });
        URL.revokeObjectURL(blobUrl);
      }

      // 3. Đồng bộ lại trên object sống mới nhất trong roomProps rồi lưu đĩa
      const latest = this.roomProps.find(p => p && p.id === propId);
      if (latest && latest !== prop) {
        latest.visible = prop.visible;
        latest.position = prop.position;
        latest.rotation = prop.rotation;
        latest.scale = prop.scale;
      }
      this.profileDataService.saveProps(this.roomProps).subscribe();
      this.onSearchChange();
      if (prop.visible !== false) {
        this.toastr.success(`Đã insert "${prop.name}" vào scene!`, 'Thêm đồ vật');
      }
      this.cdr.markForCheck();
    } catch (err: any) {
      console.error('[Profile] Insert prop error:', err);
      this.toastr.error('Insert đồ vật thất bại: ' + (err?.message ?? 'Lỗi không xác định'), 'Lỗi');
      prop.visible = false;
    } finally {
      this._insertingPropIds.delete(propId);
      delete (prop as any)._inserting;
    }
  }

  /** Nút Delete nổi trên canvas: gỡ món đang chọn khỏi scene (giữ item trong menu) */
  onCanvasDeleteProp(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const pid = this.propActionAnchor.propId;
    if (!pid) return;
    this.sceneService.deletePropById(pid);
  }

  /** Nút Duplicate nổi trên canvas: nhân bản món đang chọn, bản sao đặt cạnh */
  onCanvasDuplicateProp(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const pid = this.propActionAnchor.propId;
    if (!pid) return;
    this.sceneService.duplicatePropById(pid);
  }

  /** Nut Khóa/Mở khóa nổi trên canvas: chặn kéo + scrub + scale cho tới khi mở khóa */
  onCanvasToggleLock(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const pid = this.propActionAnchor.propId;
    if (!pid) return;
    const next = !this.sceneService.isPropLocked(pid);
    this.sceneService.togglePropLock(pid, next);
    const live = this.roomProps?.find(p => p?.id === pid);
    if (live) live.locked = next;
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.cdr.markForCheck();
  }

  // ============================================================================
  // GLB BONE & ANIMATION TIMELINE STUDIO
  // ============================================================================
  isGlbTimelineOpen = false;
  timelinePropId: string | null = null;
  timelinePropName = '';
  timelineBones: GlbBoneInfo[] = [];
  timelineBoneSearch = '';
  selectedBoneName = '__root__';
  boneRot = { x: 0, y: 0, z: 0 };
  bonePos = { x: 0, y: 0, z: 0 };
  timelineAutoKey = true;
  timelineClips: Array<{ name: string; duration: number; isCustom?: boolean; kfCount?: number }> = [];
  timelineCurrentTime = 0;
  timelineData: GlbPropTimelineData | null = null;
  private _lastUiTickMs = 0;

  get selectedPropHasRig(): boolean {
    const pid = this.selectedPropId || this.propActionAnchor.propId;
    return !!(pid && this.sceneService.hasPropRig(pid));
  }

  // =========================================================================
  // STUDIO TẠO VIDEO AI TỪ CHUYỂN ĐỘNG NHÂN VẬT 3D + ẢNH MẪU (MÌ TÔM AI)
  // =========================================================================
  isAiVideo3dOpen = false;
  aiVideo3dCapturing = false;
  aiVideo3dGenerating = false;
  aiVideo3dStatusText = '';
  aiVideo3dCaptureSec = 0;
  aiVideo3dRefImages: Array<{ name: string; dataUrl: string; mimeType: string }> = [];
  aiVideo3dPrompt = '';
  aiVideo3dDuration = 5;
  aiVideo3dAspectRatio: '16:9' | '9:16' | '1:1' | '3:4' | '4:3' = '16:9';
  aiVideo3dResolution: '720p' | '1080p' = '720p';
  aiVideo3dHideGrid = true;
  aiVideo3dAutoFrame = true;
  aiVideo3dCapturedMp4Base64: string | null = null;
  aiVideo3dCapturedPreviewUrl: string | null = null;
  aiVideo3dCapturedFilePath: string | null = null;
  aiVideo3dResultPreviewUrl: string | null = null;
  aiVideo3dResultFilePath: string | null = null;
  aiVideo3dResultBase64: string | null = null;

  readonly aiVideo3dDurationOptions: number[] = [5, 6, 8, 10, 12];
  readonly aiVideo3dRatioOptions: Array<'16:9' | '9:16' | '1:1' | '3:4' | '4:3'> = ['16:9', '9:16', '1:1', '3:4', '4:3'];

  get aiVideo3dMitomEnabled(): boolean {
    return this.genaiService.isUModelverseEnabled();
  }

  get aiVideo3dConfiguredModel(): string {
    return this.genaiService.umodelverseVideoModel || 'doubao-seedance-2-0';
  }

  /** Kiểm tra model video đang cấu hình trong Mì Tôm AI có hỗ trợ native reference_video hay không */
  get aiVideo3dConfiguredSupportsRefVideo(): boolean {
    const m = this.aiVideo3dConfiguredModel.toLowerCase();
    return (
      m.includes('seedance-2') ||
      m.includes('seedance2') ||
      m.includes('motion-control') ||
      m.includes('kling-v3') ||
      m.includes('r2v') ||
      m.includes('v2v')
    );
  }

  focusCharacterForAiVideo(): void {
    const activePid = this.timelinePropId || this.selectedPropId || this.sceneService.getFirstRiggedPropId();
    const ok = this.sceneService.autoFramePropForCapture(activePid, 0.68);
    if (!ok) {
      this.toastr.info('Chưa tìm thấy nhân vật 3D đang hiển thị trên canvas.', 'AI Video 3D');
    }
  }

  onAiVideo3dFormatChanged(): void {
    // Xóa bản ghi cũ nếu đổi tỷ lệ khung hình hoặc thời lượng để lần tạo tiếp theo tự ghi đúng chuẩn mới
    if (this.aiVideo3dCapturedMp4Base64) {
      this.clearCaptured3dMotionVideo();
    }
  }

  toggleAiVideo3dStudio(): void {
    if (this.isAiVideo3dOpen) {
      this.closeAiVideo3dStudio();
    } else {
      this.openAiVideo3dStudio();
    }
  }

  openAiVideo3dStudio(): void {
    this.isLightingStudioOpen = false;
    this.isTextureStudioOpen = false;
    // Tự gợi ý thời lượng theo clip 3D đang chạy (kẹp trong 5..12s)
    const activePid = this.timelinePropId || this.selectedPropId;
    if (activePid) {
      const tl = this.sceneService.getPropTimeline(activePid);
      if (tl && typeof tl.duration === 'number' && tl.duration >= 4) {
        const best = this.aiVideo3dDurationOptions.reduce((prev, curr) =>
          Math.abs(curr - tl.duration) < Math.abs(prev - tl.duration) ? curr : prev
        );
        this.aiVideo3dDuration = best;
      }
    }
    this.isAiVideo3dOpen = true;
    this.cdr.markForCheck();
  }

  closeAiVideo3dStudio(): void {
    this.isAiVideo3dOpen = false;
    this.cdr.markForCheck();
  }

  onAiVideo3dRefFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input?.files || []);
    input.value = '';
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        this._addAiVideo3dRefFile(f);
      }
    }
  }

  onAiVideo3dDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files || []);
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        this._addAiVideo3dRefFile(f);
      }
    }
  }

  onAiVideo3dPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          event.preventDefault();
          this._addAiVideo3dRefFile(file);
          return;
        }
      }
    }
  }

  private _addAiVideo3dRefFile(file: File): void {
    if (this.aiVideo3dRefImages.length >= 4) {
      this.toastr.warning('Tối đa 4 ảnh tham chiếu nhân vật / trang phục / bối cảnh.', 'AI Video 3D');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        this.aiVideo3dRefImages.push({
          name: file.name || `anh_mau_${this.aiVideo3dRefImages.length + 1}.png`,
          dataUrl,
          mimeType: mimeMatch ? mimeMatch[1] : (file.type || 'image/png')
        });
        this.cdr.markForCheck();
      }
    };
    reader.readAsDataURL(file);
  }

  removeAiVideo3dRefImage(idx: number): void {
    if (idx < 0 || idx >= this.aiVideo3dRefImages.length) return;
    this.aiVideo3dRefImages.splice(idx, 1);
    this.cdr.markForCheck();
  }

  clearCaptured3dMotionVideo(): void {
    if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
    }
    this.aiVideo3dCapturedMp4Base64 = null;
    this.aiVideo3dCapturedPreviewUrl = null;
    this.aiVideo3dCapturedFilePath = null;
    this.cdr.markForCheck();
  }

  /**
   * Ghi trực tiếp chuyển động của nhân vật 3D trên Canvas theo đúng thời lượng và tỷ lệ khung hình,
   * tạm ẩn vòng chọn & lưới sàn (nếu bật) rồi chuyển sang chuẩn H.264 MP4 qua FFmpeg tích hợp.
   */
  async capture3dMotionVideo(): Promise<string | null> {
    if (this.aiVideo3dCapturing) return null;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !(canvas as any).captureStream || typeof MediaRecorder === 'undefined') {
      this.toastr.error('Trình duyệt / Canvas 3D không hỗ trợ ghi luồng video trực tiếp.', 'AI Video 3D');
      return null;
    }
    const electronWin = typeof window !== 'undefined' ? (window as any) : null;
    if (!electronWin?.electron?.convertExportWebmToMp4) {
      this.toastr.error('Cần chạy trên ứng dụng Desktop (Electron) có FFmpeg để xuất video chuyển động MP4.', 'AI Video 3D');
      return null;
    }

    const durSec = Math.max(3, Math.min(15, Number(this.aiVideo3dDuration) || 5));
    this.aiVideo3dCapturing = true;
    this.aiVideo3dCaptureSec = 0;
    this.aiVideo3dStatusText = `Đang ghi chuyển động 3D (0/${durSec}s)...`;
    this.cdr.markForCheck();

    // Lưu góc camera + ánh sáng hiện tại để phục hồi nguyên vẹn ngay sau khi ghi xong
    const prevCameraSnap = this.aiVideo3dAutoFrame ? this.sceneService.getCameraSnapshot() : null;
    const prevLighting = this.sceneService.getStudioLighting();
    const shouldTempHideGrid = this.aiVideo3dHideGrid && prevLighting.showGrid;
    const bgHex = String(prevLighting.bgColor || '').trim().toLowerCase();
    const shouldTempContrastBg = this.aiVideo3dHideGrid && (bgHex === '#ffffff' || bgHex === '#f8fafc' || bgHex === '#f1f5f9');
    const lightingTempPatch: any = {};
    if (shouldTempHideGrid) lightingTempPatch.showGrid = false;
    // Nền trắng tinh khiến tay/chân mô hình gỗ màu sáng bị hòa nền -> chuyển tạm nền xám studio dịu để AI bám đường nét khớp rõ hơn
    if (shouldTempContrastBg) lightingTempPatch.bgColor = '#dce2ec';

    this.sceneService.setSelectionRingTempHidden(true);
    if (Object.keys(lightingTempPatch).length > 0) {
      this.sceneService.applyStudioLighting(lightingTempPatch);
    }

    // Tự động chọn đúng nhân vật có khớp xương đang ở trên canvas, tua về t=0 rồi phóng cận vừa khung (~68% chiều cao)
    const activePid = this.timelinePropId || this.selectedPropId || this.sceneService.getFirstRiggedPropId();
    if (activePid && this.sceneService.hasPropRig(activePid)) {
      try {
        this.sceneService.seekPropTimeline(activePid, 0);
        this.sceneService.setPropTimelinePlaying(activePid, true);
      } catch (_) {}
    }
    if (this.aiVideo3dAutoFrame) {
      this.sceneService.autoFramePropForCapture(activePid, 0.68);
    }

    let timer: any = null;
    try {
      // Đợi 3 frame để camera auto-frame + tắt lưới/ring + pose t=0 render ổn định trước khi mở MediaRecorder
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));

      const stream: MediaStream = (canvas as any).captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : ''));

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
      recorder.ondataavailable = (ev: any) => {
        if (ev?.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      const startedAt = Date.now();
      recorder.start(120);

      timer = setInterval(() => {
        const elapsed = Math.min(durSec, Math.floor((Date.now() - startedAt) / 1000));
        this.aiVideo3dCaptureSec = elapsed;
        this.aiVideo3dStatusText = `Đang ghi chuyển động 3D (${elapsed}/${durSec}s)...`;
        this.cdr.markForCheck();
      }, 250);

      await new Promise((r) => setTimeout(r, durSec * 1000 + 180));
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      await stopped;
      stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });

      if (timer) { clearInterval(timer); timer = null; }

      const webmBlob = new Blob(chunks, { type: mimeType || 'video/webm' });
      if (webmBlob.size < 1024) {
        throw new Error('Dữ liệu video 3D ghi được quá nhỏ hoặc trống.');
      }

      this.aiVideo3dStatusText = 'Đang chuyển đổi sang chuẩn H.264 MP4 cho Mì Tôm AI...';
      this.cdr.markForCheck();

      const arrBuf = await webmBlob.arrayBuffer();
      const conv = await electronWin.electron.convertExportWebmToMp4(
        this.username || 'admin',
        arrBuf,
        this.aiVideo3dAspectRatio,
        durSec
      );
      if (!conv?.success || !conv.base64) {
        throw new Error(conv?.error || 'Không thể chuyển đổi WebM sang MP4 qua FFmpeg.');
      }

      // Tạo blob preview MP4 để người dùng xem lại video 3D vừa ghi
      if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
      }
      const bin = atob(conv.base64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const mp4Blob = new Blob([u8], { type: 'video/mp4' });

      this.aiVideo3dCapturedMp4Base64 = conv.base64;
      this.aiVideo3dCapturedPreviewUrl = URL.createObjectURL(mp4Blob);
      this.aiVideo3dCapturedFilePath = conv.filePath || null;
      this.aiVideo3dStatusText = '';
      this.cdr.markForCheck();
      return conv.base64;
    } catch (err: any) {
      console.error('[Profile] capture3dMotionVideo error:', err);
      this.toastr.error(err?.message || 'Lỗi ghi chuyển động 3D.', 'AI Video 3D');
      return null;
    } finally {
      if (timer) { clearInterval(timer); timer = null; }
      this.sceneService.setSelectionRingTempHidden(false);
      if (prevCameraSnap) {
        this.sceneService.restoreCameraSnapshot(prevCameraSnap);
      }
      const restorePatch: any = {};
      if (shouldTempHideGrid) restorePatch.showGrid = true;
      if (shouldTempContrastBg) restorePatch.bgColor = prevLighting.bgColor;
      if (Object.keys(restorePatch).length > 0) {
        this.sceneService.applyStudioLighting(restorePatch);
      }
      this.aiVideo3dCapturing = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Tạo Video AI bằng Mì Tôm AI: lấy video chuyển động 3D của nhân vật trên canvas (tự ghi nếu chưa có)
   * kết hợp ảnh mẫu nhân vật/trang phục do người dùng đưa vào để AI "đắp" nhân vật thật lên đúng chuyển động 3D.
   */
  async generateAiVideoFrom3dMotion(): Promise<void> {
    if (this.aiVideo3dGenerating || this.aiVideo3dCapturing) return;

    if (!this.genaiService.isUModelverseEnabled()) {
      this.toastr.warning('Vui lòng bật Mì Tôm AI và cấu hình API Key + Model Video trong Cài đặt trước.', 'Mì Tôm AI');
      return;
    }
    if (this.aiVideo3dRefImages.length === 0) {
      this.toastr.warning('Vui lòng chọn hoặc dán ít nhất 1 ảnh mẫu nhân vật để AI đắp lên chuyển động 3D.', 'AI Video 3D');
      return;
    }

    this.aiVideo3dGenerating = true;
    this.cdr.markForCheck();

    try {
      // 1. Tự động ghi chuyển động 3D trên canvas nếu chưa có bản ghi sẵn
      let mp4Base64 = this.aiVideo3dCapturedMp4Base64;
      if (!mp4Base64) {
        mp4Base64 = await this.capture3dMotionVideo();
        if (!mp4Base64) {
          return;
        }
      }

      // Luôn sử dụng đúng model video đã cấu hình sẵn trong Mì Tôm AI
      const targetModel = this.aiVideo3dConfiguredModel;
      const isMotionModel = this.aiVideo3dConfiguredSupportsRefVideo;

      this.aiVideo3dStatusText = `Đang gửi sang Mì Tôm AI (${targetModel}) — quá trình render video thường mất 1-3 phút...`;
      this.cdr.markForCheck();

      // 2. Đóng gói danh sách tham chiếu: Ảnh nhân vật (CHARACTER_REFERENCE) + Video 3D (REFERENCE_VIDEO)
      // KHÔNG trộn START_FRAME để tương thích chuẩn Volcengine Seedance 2.0/2.5 lẫn Kling V3 Motion Control!
      const referenceImages: any[] = [];
      for (let i = 0; i < this.aiVideo3dRefImages.length; i++) {
        const img = this.aiVideo3dRefImages[i];
        const rawB64 = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
        referenceImages.push({
          image: {
            imageBytes: rawB64,
            mimeType: img.mimeType || 'image/png'
          },
          referenceType: 'CHARACTER_REFERENCE',
          characterName: img.name || `Character_${i + 1}`
        });
      }

      if (isMotionModel) {
        referenceImages.push({
          image: {
            imageBytes: mp4Base64,
            mimeType: 'video/mp4'
          },
          referenceType: 'REFERENCE_VIDEO'
        });
      }

      const userPrompt = (this.aiVideo3dPrompt || '').trim();
      const lowerTargetModel = targetModel.toLowerCase();
      const isSeedanceTarget = lowerTargetModel.includes('seedance');
      const isKlingMotionTarget = lowerTargetModel.includes('motion-control') || lowerTargetModel.includes('kling-v3');

      const imgTags = this.aiVideo3dRefImages.map((_, idx) => `@Image ${idx + 1}`).join(', ');
      let finalPrompt = '';

      if (isSeedanceTarget) {
        // Volcengine Seedance 2.0 / 2.5 bắt buộc nhắc rõ thẻ @Video 1 và @Image 1 trong prompt mới bám chuẩn chuyển động 1:1
        const sceneDesc = userPrompt
          ? `Scene & visual style: ${userPrompt}.`
          : 'Clean minimalist studio background matching the lighting and camera framing of @Video 1.';
        finalPrompt =
          `STRICT 1:1 MOTION TRANSFER FROM @Video 1 TO ${imgTags}: ` +
          `Reproduce the EXACT frame-by-frame full-body motion, skeleton pose, limb angles, torso facing direction (profile/front/back), stride timing, speed, and camera angle from @Video 1. ` +
          `Completely replace the wooden 3D mannequin in @Video 1 with the exact character, face, hair, body build, and clothing from ${imgTags}. ` +
          `${sceneDesc} ` +
          `CRITICAL RULES: Keep the exact same character orientation and motion trajectory as @Video 1 at every single second — do NOT invent different actions, do NOT rotate the character to face the camera if @Video 1 faces sideways, and do NOT render the wooden mannequin.`;
      } else {
        const sceneDesc = userPrompt
          ? `${userPrompt}. `
          : 'Clean cinematic studio lighting, natural realistic shadows. ';
        finalPrompt =
          `${sceneDesc}` +
          `Strictly replicate 100% of the exact full-body motion, joint angles, facing orientation, arm/leg trajectory, timing, and camera perspective from the reference driving video onto the character from the reference image. ` +
          `Replace the 3D mannequin completely with the realistic character, face, hair, and outfit from the reference image. No wooden mannequin, no wireframe, no extra invented poses.`;
      }

      this.toastr.info(
        `Đã gửi video chuyển động 3D + ${this.aiVideo3dRefImages.length} ảnh mẫu tới Mì Tôm AI (${targetModel})...`,
        'AI Video 3D',
        { timeOut: 6000 }
      );

      const outMeta: { url?: string | null; duration?: number; characterOrientation?: 'video' | 'image' } = {
        characterOrientation: isKlingMotionTarget ? 'video' : undefined
      };
      const resultBase64 = await this.genaiService.generateVideoUModelverse(
        finalPrompt,
        this.aiVideo3dAspectRatio,
        referenceImages,
        this.aiVideo3dDuration,
        undefined,
        targetModel,
        this.aiVideo3dResolution,
        outMeta
      );

      if (!resultBase64 && !outMeta.url) {
        throw new Error('Mì Tôm AI không trả về dữ liệu video đầu ra.');
      }

      // 3. Lưu video MP4 đầu ra xuống đĩa & phát xem trước ngay trong panel
      if (this.aiVideo3dResultPreviewUrl && this.aiVideo3dResultPreviewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(this.aiVideo3dResultPreviewUrl); } catch (_) {}
      }

      if (resultBase64) {
        const cleanB64 = resultBase64.includes(',') ? resultBase64.split(',')[1] : resultBase64;
        this.aiVideo3dResultBase64 = cleanB64;
        const bin = atob(cleanB64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const outBlob = new Blob([u8], { type: 'video/mp4' });
        this.aiVideo3dResultPreviewUrl = URL.createObjectURL(outBlob);

        const electronWin = typeof window !== 'undefined' ? (window as any) : null;
        if (electronWin?.electron?.saveAiExportVideo) {
          const saved = await electronWin.electron.saveAiExportVideo(
            this.username || 'admin',
            cleanB64,
            `ai_video_3d_${Date.now()}.mp4`
          );
          if (saved?.success && saved.filePath) {
            this.aiVideo3dResultFilePath = saved.filePath;
          }
        }
      } else if (outMeta.url) {
        this.aiVideo3dResultPreviewUrl = outMeta.url;
      }

      this.aiVideo3dStatusText = '';
      this.toastr.success('Mì Tôm AI đã tạo Video từ chuyển động 3D thành công!', 'AI Video 3D');
    } catch (err: any) {
      console.error('[Profile] generateAiVideoFrom3dMotion error:', err);
      this.aiVideo3dStatusText = '';
      this.toastr.error(err?.message || 'Không thể tạo Video AI lúc này.', 'Lỗi AI Video 3D');
    } finally {
      this.aiVideo3dGenerating = false;
      this.cdr.markForCheck();
    }
  }

  openAiVideoExportsFolder(): void {
    const electronWin = typeof window !== 'undefined' ? (window as any) : null;
    if (electronWin?.electron?.openExportsFolder) {
      electronWin.electron.openExportsFolder(this.username || 'admin');
    }
  }

  downloadAiVideoResult(): void {
    if (!this.aiVideo3dResultPreviewUrl) return;
    const a = document.createElement('a');
    a.href = this.aiVideo3dResultPreviewUrl;
    a.download = `ai_video_3d_${Date.now()}.mp4`;
    a.click();
  }

  // =========================================================================
  // STUDIO ÁNH SÁNG & MÔI TRƯỜNG 3D (3-POINT LIGHTING + IBL + BÓNG ĐỔ)
  // =========================================================================
  isLightingStudioOpen = false;
  lightingSaving = false;
  lightingConfig: StudioLightingConfig = { ...DEFAULT_STUDIO_LIGHTING };
  readonly lightingPresets = STUDIO_LIGHTING_PRESETS;
  readonly lightingBgPresets: Array<{ name: string; hex: string }> = [
    { name: 'Trắng Studio', hex: '#ffffff' },
    { name: 'Xám Nhạt', hex: '#f1f5f9' },
    { name: 'Bạc Dịu', hex: '#e2e8f0' },
    { name: 'Kem Ấm', hex: '#fdf3e7' },
    { name: 'Xanh Trời Nhạt', hex: '#eef5ff' },
    { name: 'Xám Xanh Đậm', hex: '#1e293b' },
    { name: 'Đêm Studio', hex: '#0f172a' },
    { name: 'Đen Tuyền', hex: '#05070c' }
  ];

  toggleLightingStudio(): void {
    this.isLightingStudioOpen = !this.isLightingStudioOpen;
    if (this.isLightingStudioOpen) {
      this.isTextureStudioOpen = false;
      this.isAiVideo3dOpen = false;
      this.lightingConfig = this.sceneService.getStudioLighting();
    }
    this.cdr.markForCheck();
  }

  closeLightingStudio(): void {
    this.isLightingStudioOpen = false;
    this.cdr.markForCheck();
  }

  onLightingPresetSelect(presetId: string): void {
    this.lightingConfig = this.sceneService.applyStudioLightingPreset(presetId);
    this.cdr.markForCheck();
  }

  onLightingConfigChange(): void {
    this.lightingConfig.preset = 'custom';
    this.lightingConfig = this.sceneService.applyStudioLighting(this.lightingConfig);
    this.cdr.markForCheck();
  }

  onLightingBgSelect(hex: string): void {
    this.lightingConfig.bgColor = hex || '#ffffff';
    this.onLightingConfigChange();
  }

  onLightingToneMapChange(mode: 'neutral' | 'aces2' | 'filmic' | 'linear'): void {
    this.lightingConfig.toneMapping = mode;
    this.onLightingConfigChange();
  }

  onLightingShadowSoftnessChange(mode: 'soft' | 'crisp'): void {
    this.lightingConfig.shadowSoftness = mode;
    this.onLightingConfigChange();
  }

  onLightingReset(): void {
    this.lightingConfig = this.sceneService.resetStudioLighting();
    this.toastr.info('Đã khôi phục cấu hình ánh sáng Studio mặc định.', 'Ánh sáng 3D');
    this.cdr.markForCheck();
  }

  async saveLightingConfig(): Promise<void> {
    if (this.lightingSaving) return;
    this.lightingSaving = true;
    this.cdr.markForCheck();
    try {
      const payload = { ...this.lightingConfig };
      if (this.profile) {
        this.profile.scene = {
          ...(this.profile.scene || { cameraPreset: 'default', lightsOn: true }),
          lighting: payload
        };
      }
      await this.profileDataService.saveScene({ lighting: payload }).toPromise();
      this.toastr.success('Đã lưu cấu hình ánh sáng & môi trường 3D.', 'Ánh sáng 3D');
    } catch (err) {
      console.error('[Profile] saveLightingConfig error:', err);
      this.toastr.error('Không thể lưu cấu hình ánh sáng.', 'Lỗi');
    } finally {
      this.lightingSaving = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // STUDIO MÀU SẮC & AI TẠO TEXTURE 3D TỪ ẢNH MẪU (UV-AWARE + DÁN LOGO)
  // =========================================================================
  isTextureStudioOpen = false;
  texStudioPropId: string | null = null;
  texStudioPropName = '';
  texStudioColor = '#ffffff';
  texStudioMetalness = 0.25;
  texStudioRoughness = 0.35;
  texStudioRepeatX = 1;
  texStudioRepeatY = 1;
  texStudioOffsetX = 0;
  texStudioOffsetY = 0;
  texStudioRotation = 0;
  texStudioUvMode: 'cylindrical' | 'box' | 'original' = 'cylindrical';
  texStudioHasNativeUv = false;
  texStudioCylindricalAspect = 1.6;
  texStudioRefImageDataUrl: string | null = null;
  texStudioRefImageName = '';
  texStudioPrompt = '';
  texStudioOriginalUvDataUrl: string | null = null;
  texStudioOriginalAtlasDataUrl: string | null = null;
  texStudioHasOriginalDiffuse = false;
  texStudioGeneratedDataUrl: string | null = null;
  texStudioTextureChanged = false;
  texStudioGenerating = false;
  texStudioSaving = false;
  texStudioShowUvControls = false;

  // Chế độ Dán Logo lên thân đồ vật (tự ghép canvas 1024x1024 chống méo tỷ lệ)
  texStudioLogoMode = false;
  texStudioLogoScale = 0.56;
  texStudioLogoOffsetX = 0;
  texStudioLogoOffsetY = 0;
  texStudioLogoBothSides = true;
  texStudioLogoMetallicRims = true;
  texStudioLogoMatchBg = true;
  private _texStudioLogoTimer: any = null;

  readonly texStudioColorPresets: Array<{ name: string; hex: string }> = [
    { name: 'Trắng gốc', hex: '#ffffff' },
    { name: 'Đỏ Coca', hex: '#dc2626' },
    { name: 'Xanh Pepsi', hex: '#1d4ed8' },
    { name: 'Xanh Sprite', hex: '#16a34a' },
    { name: 'Vàng Gold', hex: '#eab308' },
    { name: 'Cam Fanta', hex: '#f97316' },
    { name: 'Tím Nho', hex: '#9333ea' },
    { name: 'Hồng Đào', hex: '#ec4899' },
    { name: 'Bạc Nhôm', hex: '#cbd5e1' },
    { name: 'Đen Nhám', hex: '#1e293b' },
  ];

  openPropTextureStudio(propId?: string | null, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const pid = propId || this.selectedPropId || this.propActionAnchor.propId;
    if (!pid) return;

    this.isGlbTimelineOpen = false;
    this.isLightingStudioOpen = false;
    this.isAiVideo3dOpen = false;
    this.texStudioPropId = pid;
    const prop = this.roomProps?.find((p) => p && p.id === pid);
    this.texStudioPropName = prop?.name || pid;
    this.texStudioColor = prop?._customColorSet && prop?.color ? prop.color : '#ffffff';
    this.texStudioMetalness = typeof prop?.metalness === 'number' ? prop.metalness : 0.25;
    this.texStudioRoughness = typeof prop?.roughness === 'number' ? prop.roughness : 0.35;
    this.texStudioRepeatX = typeof prop?.textureRepeatX === 'number' ? prop.textureRepeatX : 1;
    this.texStudioRepeatY = typeof prop?.textureRepeatY === 'number' ? prop.textureRepeatY : 1;
    this.texStudioOffsetX = typeof prop?.textureOffsetX === 'number' ? prop.textureOffsetX : 0;
    this.texStudioOffsetY = typeof prop?.textureOffsetY === 'number' ? prop.textureOffsetY : 0;
    this.texStudioRotation = typeof prop?.textureRotation === 'number' ? prop.textureRotation : 0;
    this.texStudioGeneratedDataUrl = null;
    this.texStudioTextureChanged = false;
    this.texStudioShowUvControls = false;
    this.texStudioLogoMode = false;

    const savedUvMode: 'auto' | 'cylindrical' | 'box' | 'original' =
      prop?.textureUvMode === 'cylindrical' || prop?.textureUvMode === 'box' || prop?.textureUvMode === 'original'
        ? prop.textureUvMode
        : 'auto';

    const extracted = this.sceneService.extractPropTextureAtlas(pid, savedUvMode);
    this.texStudioHasOriginalDiffuse = extracted.hasDiffuseMap;
    this.texStudioHasNativeUv = extracted.hasNativeUv;
    this.texStudioUvMode = extracted.activeUvMode;
    this.texStudioCylindricalAspect = extracted.cylindricalAspect || 1.6;
    this.texStudioOriginalAtlasDataUrl = extracted.atlasDataUrl;
    this.texStudioOriginalUvDataUrl = extracted.uvGuideDataUrl || extracted.atlasDataUrl;

    // Nạp lại bản xem trước của texture tùy chỉnh nếu đồ vật đã từng lưu trước đó
    const electronWin = typeof window !== 'undefined' ? (window as any) : null;
    if (prop?.customTexturePath && electronWin?.electron?.readPropTexture) {
      electronWin.electron.readPropTexture(prop.customTexturePath).then((res: any) => {
        if (res?.success && res.dataUrl && this.texStudioPropId === pid && !this.texStudioGeneratedDataUrl) {
          this.texStudioGeneratedDataUrl = res.dataUrl;
          this.cdr.markForCheck();
        }
      }).catch(() => {});
    }

    this.isTextureStudioOpen = true;
    this.cdr.markForCheck();
  }

  closePropTextureStudio(): void {
    if (this._texStudioLogoTimer) {
      clearTimeout(this._texStudioLogoTimer);
      this._texStudioLogoTimer = null;
    }
    this.isTextureStudioOpen = false;
    this.cdr.markForCheck();
  }

  onTexStudioUvModeChange(mode: 'cylindrical' | 'box' | 'original'): void {
    if (!this.texStudioPropId) return;
    if (mode === 'original' && !this.texStudioHasNativeUv) {
      this.toastr.info('Mô hình GLB này không có lưới UV gốc. Hãy dùng UV Trụ hoặc UV Khối.', 'Bản đồ UV');
      return;
    }
    const pid = this.texStudioPropId;
    const extracted = this.sceneService.extractPropTextureAtlas(pid, mode);
    this.texStudioUvMode = extracted.activeUvMode;
    this.texStudioCylindricalAspect = extracted.cylindricalAspect || 1.6;
    this.texStudioOriginalAtlasDataUrl = extracted.atlasDataUrl;
    this.texStudioOriginalUvDataUrl = extracted.uvGuideDataUrl || extracted.atlasDataUrl;

    if (this.texStudioLogoMode && this.texStudioRefImageDataUrl) {
      this._scheduleLogoRecompose(0);
    } else if (this.texStudioGeneratedDataUrl) {
      this.sceneService.applyPropCustomTexture(pid, this.texStudioGeneratedDataUrl, {
        sourceKey: `uvswitch_${Date.now()}`,
        uvMode: this.texStudioUvMode,
        tintHex: null,
        repeatX: this.texStudioRepeatX,
        repeatY: this.texStudioRepeatY,
        offsetX: this.texStudioOffsetX,
        offsetY: this.texStudioOffsetY,
        rotationDeg: this.texStudioRotation
      });
    }
    this.cdr.markForCheck();
  }

  onTexStudioColorChange(hex: string): void {
    if (!this.texStudioPropId) return;
    this.texStudioColor = hex || '#ffffff';
    // Nếu đang ở chế độ dán Logo: đổi màu nền thân vật thể trong canvas để không nhuộm hỏng màu Logo!
    if (this.texStudioLogoMode && this.texStudioRefImageDataUrl) {
      this.texStudioLogoMatchBg = false;
      this._scheduleLogoRecompose(30);
    } else {
      this.sceneService.applyPropLiveMaterial(this.texStudioPropId, {
        color: this.texStudioColor
      });
    }
    this.cdr.markForCheck();
  }

  onTexStudioPbrChange(): void {
    if (!this.texStudioPropId) return;
    this.sceneService.applyPropLiveMaterial(this.texStudioPropId, {
      metalness: Number(this.texStudioMetalness),
      roughness: Number(this.texStudioRoughness)
    });
    this.cdr.markForCheck();
  }

  onTexStudioUvTransformChange(): void {
    if (!this.texStudioPropId) return;
    this.sceneService.applyPropLiveMaterial(this.texStudioPropId, {
      repeatX: Number(this.texStudioRepeatX) || 1,
      repeatY: Number(this.texStudioRepeatY) || 1,
      offsetX: Number(this.texStudioOffsetX) || 0,
      offsetY: Number(this.texStudioOffsetY) || 0,
      rotationDeg: Number(this.texStudioRotation) || 0
    });
    this.cdr.markForCheck();
  }

  onTexStudioLogoControlChange(): void {
    if (!this.texStudioLogoMode || !this.texStudioRefImageDataUrl) return;
    this._scheduleLogoRecompose(35);
    this.cdr.markForCheck();
  }

  private _scheduleLogoRecompose(delayMs = 35): void {
    if (this._texStudioLogoTimer) {
      clearTimeout(this._texStudioLogoTimer);
      this._texStudioLogoTimer = null;
    }
    if (delayMs <= 0) {
      void this._applyComposedLogoTexture(false);
      return;
    }
    this._texStudioLogoTimer = setTimeout(() => {
      this._texStudioLogoTimer = null;
      void this._applyComposedLogoTexture(false);
    }, delayMs);
  }

  onTexStudioRefFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this._readTexStudioRefFile(file);
    input.value = '';
  }

  onTexStudioDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this._readTexStudioRefFile(file);
    }
  }

  onTexStudioPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          event.preventDefault();
          this._readTexStudioRefFile(file);
          return;
        }
      }
    }
  }

  private _readTexStudioRefFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.texStudioRefImageDataUrl = reader.result;
        this.texStudioRefImageName = file.name || 'anh_mau.png';
        this.cdr.markForCheck();
      }
    };
    reader.readAsDataURL(file);
  }

  clearTexStudioRefImage(): void {
    this.texStudioRefImageDataUrl = null;
    this.texStudioRefImageName = '';
    this.texStudioLogoMode = false;
    this.cdr.markForCheck();
  }

  /**
   * Ghép ảnh Logo / nhãn sản phẩm lên bản đồ Texture 1024x1024 có bù tỷ lệ chu vi/chiều cao vật thể 3D,
   * tự khớp màu viền ảnh (hoặc dùng màu người dùng chọn) và giữ nắp trên / đáy màu bạc kim loại.
   */
  private _composeLogoLabelTexture(logoDataUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const SIZE = 1024;
          const isCyl = this.texStudioUvMode === 'cylindrical';

          // Tự lấy mẫu màu nền từ 4 góc + 4 cạnh ngoài của ảnh logo (bỏ qua nếu góc trong suốt PNG)
          let sampledBg: string | null = null;
          try {
            const sc = document.createElement('canvas');
            sc.width = 48;
            sc.height = 48;
            const sctx = sc.getContext('2d');
            if (sctx) {
              sctx.drawImage(img, 0, 0, 48, 48);
              const px = sctx.getImageData(0, 0, 48, 48).data;
              const pts = [
                [1, 1], [46, 1], [1, 46], [46, 46],
                [24, 1], [24, 46], [1, 24], [46, 24]
              ];
              let rSum = 0, gSum = 0, bSum = 0, count = 0;
              for (const [x, y] of pts) {
                const idx = (y * 48 + x) * 4;
                if (px[idx + 3] >= 200) {
                  rSum += px[idx];
                  gSum += px[idx + 1];
                  bSum += px[idx + 2];
                  count++;
                }
              }
              if (count >= 4) {
                const rr = Math.round(rSum / count);
                const gg = Math.round(gSum / count);
                const bb = Math.round(bSum / count);
                sampledBg = `rgb(${rr}, ${gg}, ${bb})`;
              }
            }
          } catch (_) {}

          const bodyBg = this.texStudioLogoMatchBg
            ? (sampledBg || (this.texStudioColor && this.texStudioColor.toLowerCase() !== '#ffffff' ? this.texStudioColor : '#e2e8f0'))
            : (this.texStudioColor || '#ffffff');

          const cv = document.createElement('canvas');
          cv.width = SIZE;
          cv.height = SIZE;
          const ctx = cv.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          // 1. Phủ màu nền toàn thân vật thể
          ctx.fillStyle = bodyBg;
          ctx.fillRect(0, 0, SIZE, SIZE);

          const rimH = (isCyl && this.texStudioLogoMetallicRims) ? Math.round(SIZE * 0.115) : 0;
          const bodyTop = rimH;
          const bodyBottom = SIZE - rimH;
          const bodyH = Math.max(128, bodyBottom - bodyTop);

          // 2. Vẽ Logo giữ đúng tỷ lệ thật trên bề mặt 3D (bù tỷ lệ chu vi / chiều cao cho UV trụ)
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, bodyTop, SIZE, bodyH);
          ctx.clip();

          const imgW = img.naturalWidth || img.width || 512;
          const imgH = img.naturalHeight || img.height || 512;
          const imgAspect = imgW / Math.max(1, imgH);
          const cylAspect = Math.max(0.4, Number(this.texStudioCylindricalAspect) || 1.6);
          const uvAspect = isCyl ? (imgAspect / cylAspect) : imgAspect;

          const scale = Math.max(0.12, Math.min(1.0, Number(this.texStudioLogoScale) || 0.56));
          let drawH = bodyH * scale;
          let drawW = drawH * uvAspect;
          const maxDrawW = isCyl && this.texStudioLogoBothSides ? SIZE * 0.46 : SIZE * 0.92;
          if (drawW > maxDrawW) {
            drawW = maxDrawW;
            drawH = drawW / Math.max(0.08, uvAspect);
          }

          const cy = (bodyTop + bodyBottom) * 0.5 + (Number(this.texStudioLogoOffsetY) || 0) * bodyH;
          const normOffX = (((0.5 + (Number(this.texStudioLogoOffsetX) || 0)) % 1) + 1) % 1;
          const cxMain = normOffX * SIZE;

          const drawWrappedLogo = (centerX: number) => {
            const xLeft = centerX - drawW * 0.5;
            const yTop = cy - drawH * 0.5;
            ctx.drawImage(img, xLeft, yTop, drawW, drawH);
            if (xLeft < 0) {
              ctx.drawImage(img, xLeft + SIZE, yTop, drawW, drawH);
            }
            if (xLeft + drawW > SIZE) {
              ctx.drawImage(img, xLeft - SIZE, yTop, drawW, drawH);
            }
          };

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          drawWrappedLogo(cxMain);
          if (isCyl && this.texStudioLogoBothSides) {
            drawWrappedLogo((cxMain + SIZE * 0.5) % SIZE);
          }
          ctx.restore();

          // 3. Nắp trên & đáy lon màu bạc nhôm kim loại sắc nét (chế độ UV trụ)
          if (rimH > 0) {
            const topGrad = ctx.createLinearGradient(0, 0, 0, rimH);
            topGrad.addColorStop(0.0, '#d8dee9');
            topGrad.addColorStop(0.45, '#f1f5f9');
            topGrad.addColorStop(0.82, '#cbd5e1');
            topGrad.addColorStop(1.0, '#94a3b8');
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, SIZE, rimH);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fillRect(0, rimH - 3, SIZE, 2);

            const botGrad = ctx.createLinearGradient(0, bodyBottom, 0, SIZE);
            botGrad.addColorStop(0.0, '#94a3b8');
            botGrad.addColorStop(0.25, '#e2e8f0');
            botGrad.addColorStop(0.65, '#cbd5e1');
            botGrad.addColorStop(1.0, '#94a3b8');
            ctx.fillStyle = botGrad;
            ctx.fillRect(0, bodyBottom, SIZE, rimH);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillRect(0, bodyBottom + 1, SIZE, 2);
          }

          resolve(cv.toDataURL('image/png'));
        } catch (err) {
          console.error('[Profile] _composeLogoLabelTexture error:', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoDataUrl;
    });
  }

  private async _applyComposedLogoTexture(showToast: boolean): Promise<void> {
    if (!this.texStudioPropId || !this.texStudioRefImageDataUrl) return;
    const pid = this.texStudioPropId;
    const composed = await this._composeLogoLabelTexture(this.texStudioRefImageDataUrl);
    if (!composed) {
      if (showToast) this.toastr.error('Không thể ghép ảnh Logo lên bề mặt 3D.', 'Lỗi Texture');
      return;
    }

    const ok = await this.sceneService.applyPropCustomTexture(pid, composed, {
      sourceKey: `logo_${Date.now()}`,
      uvMode: this.texStudioUvMode,
      tintHex: null,
      repeatX: this.texStudioRepeatX,
      repeatY: this.texStudioRepeatY,
      offsetX: this.texStudioOffsetX,
      offsetY: this.texStudioOffsetY,
      rotationDeg: this.texStudioRotation
    });

    if (ok) {
      this.texStudioGeneratedDataUrl = composed;
      this.texStudioTextureChanged = true;
      // Cập nhật lại lưới UV nếu vừa chuyển chế độ UV
      const extracted = this.sceneService.extractPropTextureAtlas(pid, this.texStudioUvMode);
      this.texStudioOriginalUvDataUrl = extracted.uvGuideDataUrl || extracted.atlasDataUrl;
      if (showToast) {
        this.toastr.success(
          'Đã dán Logo lên đồ vật 3D! Bạn có thể kéo thanh Cỡ Logo / Xoay ngang rồi bấm "Lưu".',
          'Dán Logo 3D'
        );
      }
    } else if (showToast) {
      this.toastr.error('Không thể áp dụng ảnh Logo lên vật thể 3D.', 'Lỗi Texture');
    }
    this.cdr.markForCheck();
  }

  /** Dán ảnh mẫu / Logo trực tiếp lên thân đồ vật 3D (tự tạo UV trụ, bù méo tỷ lệ và không cần AI) */
  async applyReferenceDirectlyAsTexture(): Promise<void> {
    if (!this.texStudioPropId || !this.texStudioRefImageDataUrl) {
      this.toastr.warning('Vui lòng chọn hoặc dán một ảnh mẫu / Logo trước.', 'Texture 3D');
      return;
    }
    // Nếu vật thể đang ở UV gốc rời rạc mà người dùng muốn dán Logo trực tiếp, ưu tiên UV Trụ
    if (this.texStudioUvMode === 'original' && !this.texStudioHasOriginalDiffuse) {
      this.texStudioUvMode = 'cylindrical';
    }
    // Nếu người dùng đã chủ động chọn màu nền khác trắng trước khi bấm Dán Logo, giữ màu đó làm màu thân lon
    this.texStudioLogoMatchBg = !this.texStudioColor || this.texStudioColor.toLowerCase() === '#ffffff';
    this.texStudioLogoMode = true;
    await this._applyComposedLogoTexture(true);
  }

  /**
   * Dùng AI Image Editing tạo bản đồ UV Texture 1024x1024 khớp đúng hình học của mô hình 3D
   * dựa trên Bản đồ UV hiện tại + Ảnh mẫu người dùng cung cấp + Prompt tuỳ chọn.
   */
  async generateAiTextureFromReference(): Promise<void> {
    if (!this.texStudioPropId || this.texStudioGenerating) return;
    if (!this.texStudioRefImageDataUrl && !this.texStudioPrompt.trim()) {
      this.toastr.warning('Hãy tải ảnh mẫu hoặc nhập mô tả màu sắc / chất liệu mong muốn.', 'AI Tạo Texture 3D');
      return;
    }

    this.texStudioGenerating = true;
    this.cdr.markForCheck();

    try {
      const pid = this.texStudioPropId;
      const extracted = this.sceneService.extractPropTextureAtlas(pid, this.texStudioUvMode);
      const baseUvDataUrl = extracted.uvGuideDataUrl || extracted.atlasDataUrl;
      this.texStudioUvMode = extracted.activeUvMode;
      this.texStudioOriginalAtlasDataUrl = extracted.atlasDataUrl;
      this.texStudioOriginalUvDataUrl = baseUvDataUrl;

      const splitDataUrl = (du: string): { mimeType: string; data: string } => {
        const m = du.match(/^data:([^;]+);base64,(.+)$/);
        return m ? { mimeType: m[1], data: m[2] } : { mimeType: 'image/png', data: du };
      };

      const parts: any[] = [];
      if (baseUvDataUrl) {
        const uvPart = splitDataUrl(baseUvDataUrl);
        parts.push({ inlineData: { mimeType: uvPart.mimeType, data: uvPart.data } });
      }
      if (this.texStudioRefImageDataUrl) {
        const refPart = splitDataUrl(this.texStudioRefImageDataUrl);
        parts.push({ inlineData: { mimeType: refPart.mimeType, data: refPart.data } });
      }

      const userExtra = this.texStudioPrompt.trim();
      const propLabel = this.texStudioPropName || '3D object';
      const uvLayoutHint = this.texStudioUvMode === 'cylindrical'
        ? 'IMAGE 1 IS A CYLINDRICAL 360-DEGREE UV WRAP MAP: top 11% cyan band = metallic top lid/pull-tab rim, middle 78% green/light band = 360-degree cylindrical side body (horizontal center X=50% is the front face facing the viewer), bottom 11% yellow band = metallic bottom rim/base.'
        : 'IMAGE 1 IS THE EXACT UV TEXTURE ATLAS LAYOUT OF THIS 3D MESH (green lines = main body UV islands, cyan lines = top cap/lid islands, yellow lines = bottom base islands).';

      const instruction = `TASK: GENERATE A 1024x1024 FLAT UNLIT 3D UV ALBEDO DIFFUSE TEXTURE MAP FOR THE 3D OBJECT "${propLabel}".
${baseUvDataUrl ? uvLayoutHint : ''}
${this.texStudioRefImageDataUrl ? `IMAGE ${baseUvDataUrl ? '2' : '1'} IS THE USER'S REFERENCE PRODUCT / LOGO / COLOR / LABEL STYLE IMAGE.` : ''}

MANDATORY TECHNICAL RULES FOR 3D UV TEXTURE OUTPUT:
1. OUTPUT MUST BE A FLAT 2D UV TEXTURE ATLAS IMAGE (1:1 SQUARE) — NEVER render a 3D perspective product photo, never draw a background studio scene, never draw cast shadows or studio highlights.
2. STRICT UV LAYOUT PRESERVATION: Follow the EXACT UV zones from Image 1 so the texture wraps cleanly onto the 3D mesh without distortion. DO NOT draw any colored wireframe lines, cyan/yellow/green guide overlays, or grid lines in the final output.
3. STYLE, LOGO & COLOR TRANSFER: Transfer the exact colors, brand logo, label graphics, typography, patterns, and surface design from the reference image cleanly onto the main body band (center the main logo cleanly at horizontal X=50%, upright, crisp and legible). Keep the top cap/lid band (top 11%) and bottom base band (bottom 11%) realistic clean brushed silver/metallic aluminum unless requested otherwise.
4. SEAMLESS HORIZONTAL WRAP: Make left edge (X=0%) and right edge (X=100%) match seamlessly in color and pattern so there is no visible vertical seam on the back of the 3D object.
${userExtra ? `5. USER SPECIFIC INSTRUCTIONS: ${userExtra}` : ''}`;

      parts.push({ text: instruction });

      const response: any = await this.genaiService.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '1:1'
          },
          isImageEdit: true
        } as any
      });

      let outBase64 = '';
      let outMime = 'image/png';
      const respParts = response?.candidates?.[0]?.content?.parts || [];
      for (const p of respParts) {
        if (p?.inlineData?.data) {
          outBase64 = p.inlineData.data;
          outMime = p.inlineData.mimeType || 'image/png';
          break;
        }
        if ((p as any)?.image?.data) {
          outBase64 = (p as any).image.data;
          outMime = (p as any).image.mimeType || 'image/png';
          break;
        }
      }

      if (!outBase64) {
        throw new Error('AI không trả về dữ liệu ảnh Texture. Hãy kiểm tra lại cấu hình Model tạo ảnh trong Cài đặt.');
      }

      const generatedDataUrl = `data:${outMime};base64,${outBase64}`;
      this.texStudioGeneratedDataUrl = generatedDataUrl;
      this.texStudioTextureChanged = true;
      this.texStudioLogoMode = false;
      this.texStudioColor = '#ffffff';

      const ok = await this.sceneService.applyPropCustomTexture(pid, generatedDataUrl, {
        sourceKey: `ai_${Date.now()}`,
        uvMode: this.texStudioUvMode,
        tintHex: null,
        repeatX: this.texStudioRepeatX,
        repeatY: this.texStudioRepeatY,
        offsetX: this.texStudioOffsetX,
        offsetY: this.texStudioOffsetY,
        rotationDeg: this.texStudioRotation
      });

      if (ok) {
        this.toastr.success('AI đã tạo và bọc Texture 3D thành công! Bấm "Lưu Texture & Màu sắc" để lưu vĩnh viễn.', 'AI Tạo Texture 3D');
      } else {
        this.toastr.warning('AI đã sinh ảnh Texture nhưng không áp dụng được lên mesh.', 'Texture 3D');
      }
    } catch (err: any) {
      console.error('[Profile] generateAiTextureFromReference error:', err);
      this.toastr.error(err?.message || 'Không thể tạo Texture AI lúc này.', 'Lỗi AI Texture');
    } finally {
      this.texStudioGenerating = false;
      this.cdr.markForCheck();
    }
  }

  /** Khôi phục màu sắc, chất liệu và Texture gốc ban đầu của file GLB */
  async resetTextureStudioToOriginal(): Promise<void> {
    if (!this.texStudioPropId) return;
    const pid = this.texStudioPropId;
    this.sceneService.resetPropMaterialToOriginal(pid);
    this.texStudioColor = '#ffffff';
    this.texStudioMetalness = 0.0;
    this.texStudioRoughness = 0.5;
    this.texStudioRepeatX = 1;
    this.texStudioRepeatY = 1;
    this.texStudioOffsetX = 0;
    this.texStudioOffsetY = 0;
    this.texStudioRotation = 0;
    this.texStudioGeneratedDataUrl = null;
    this.texStudioTextureChanged = false;
    this.texStudioLogoMode = false;

    const extracted = this.sceneService.extractPropTextureAtlas(pid, 'auto');
    this.texStudioUvMode = extracted.activeUvMode;
    this.texStudioOriginalAtlasDataUrl = extracted.atlasDataUrl;
    this.texStudioOriginalUvDataUrl = extracted.uvGuideDataUrl || extracted.atlasDataUrl;

    const idx = this.roomProps.findIndex((p) => p && p.id === pid);
    if (idx >= 0) {
      const target = this.roomProps[idx];
      target.color = '#ffffff';
      target._customColorSet = false;
      target._customMetalnessSet = false;
      target._customRoughnessSet = false;
      delete target.customTexturePath;
      delete target.customTextureDataUrl;
      delete target.textureUvMode;
      delete target.textureRepeatX;
      delete target.textureRepeatY;
      delete target.textureOffsetX;
      delete target.textureOffsetY;
      delete target.textureRotation;
      (this.profile as any).props = this.roomProps;
      try {
        await this.profileDataService.saveProps(this.roomProps).toPromise();
      } catch (_) {}
    }

    this.toastr.info('Đã khôi phục màu sắc và Texture gốc của đồ vật.', 'Màu sắc & Texture 3D');
    this.cdr.markForCheck();
  }

  /** Lưu Texture PNG xuống thư mục assets/textures/ và ghi cấu hình màu sắc/PBR vào props.json */
  async saveTextureStudioChanges(): Promise<void> {
    if (!this.texStudioPropId || this.texStudioSaving) return;
    const pid = this.texStudioPropId;
    const idx = this.roomProps.findIndex((p) => p && p.id === pid);
    if (idx < 0) return;

    this.texStudioSaving = true;
    this.cdr.markForCheck();

    try {
      const target = this.roomProps[idx];
      // Khi màu đã được ghép trực tiếp vào ảnh PNG (chế độ Logo hoặc AI Texture), lưu tint = #ffffff
      // để khi tải lại ứng dụng không bị nhân chồng màu làm tối ảnh logo.
      const colorBakedInTexture = Boolean(this.texStudioLogoMode || this.texStudioGeneratedDataUrl);
      target.color = colorBakedInTexture ? '#ffffff' : (this.texStudioColor || '#ffffff');
      target._customColorSet = !colorBakedInTexture && target.color.toLowerCase() !== '#ffffff';
      target.metalness = Number(this.texStudioMetalness);
      target._customMetalnessSet = true;
      target.roughness = Number(this.texStudioRoughness);
      target._customRoughnessSet = true;
      target.textureUvMode = this.texStudioUvMode;
      target.textureRepeatX = Number(this.texStudioRepeatX) || 1;
      target.textureRepeatY = Number(this.texStudioRepeatY) || 1;
      target.textureOffsetX = Number(this.texStudioOffsetX) || 0;
      target.textureOffsetY = Number(this.texStudioOffsetY) || 0;
      target.textureRotation = Number(this.texStudioRotation) || 0;

      if (this.texStudioTextureChanged && this.texStudioGeneratedDataUrl) {
        const electronWin = typeof window !== 'undefined' ? (window as any) : null;
        const username = this.profileDataService.username || this.profile?.username || 'admin';
        if (electronWin?.electron?.savePropTexture) {
          const saved = await electronWin.electron.savePropTexture(
            username,
            pid,
            this.texStudioGeneratedDataUrl
          );
          if (saved?.success && saved.filePath) {
            target.customTexturePath = saved.filePath;
            delete target.customTextureDataUrl;
          }
        } else {
          target.customTextureDataUrl = this.texStudioGeneratedDataUrl;
        }
        this.texStudioTextureChanged = false;
      }

      (this.profile as any).props = this.roomProps;
      await this.profileDataService.saveProps(this.roomProps).toPromise();
      this.toastr.success(`Đã lưu màu sắc & Texture cho "${target.name}"!`, 'Màu sắc & AI Texture 3D');
    } catch (err: any) {
      console.error('[Profile] saveTextureStudioChanges error:', err);
      this.toastr.error('Không thể lưu Texture của đồ vật.', 'Lỗi');
    } finally {
      this.texStudioSaving = false;
      this.cdr.markForCheck();
    }
  }

  get filteredTimelineBones(): GlbBoneInfo[] {
    const q = (this.timelineBoneSearch || '').trim().toLowerCase();
    if (!q) return this.timelineBones;
    return this.timelineBones.filter(
      (b) => b.label.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)
    );
  }

  get activeBoneTrackNames(): string[] {
    const names = new Set<string>();
    if (this.selectedBoneName) names.add(this.selectedBoneName);
    if (this.timelineData?.keyframes) {
      for (const k of this.timelineData.keyframes) {
        names.add(k.boneName);
      }
    }
    return Array.from(names);
  }

  getBoneLabel(boneName: string): string {
    const found = this.timelineBones.find((b) => b.name === boneName);
    return found ? found.label : boneName;
  }

  getKeyframesForBone(boneName: string): GlbBoneKeyframe[] {
    if (!this.timelineData?.keyframes) return [];
    return this.timelineData.keyframes.filter((k) => k.boneName === boneName);
  }

  get activeKeyframeAtCurrentTime(): GlbBoneKeyframe | null {
    if (!this.timelineData?.keyframes || !this.selectedBoneName) return null;
    return (
      this.timelineData.keyframes.find(
        (k) => k.boneName === this.selectedBoneName && Math.abs(k.time - this.timelineCurrentTime) <= 0.05
      ) || null
    );
  }

  private ngZoneRunTimelineUpdate(time: number, playing: boolean): void {
    const now = performance.now();
    if (now - this._lastUiTickMs < 50 && playing) return;
    this._lastUiTickMs = now;
    this.timelineCurrentTime = Math.round(time * 100) / 100;
    if (this.timelinePropId && this.selectedBoneName && this.timelineData?.mode === 'keyframes') {
      const pose = this.sceneService.getBonePoseDelta(this.timelinePropId, this.selectedBoneName);
      this.boneRot = {
        x: Math.round(pose.rot.x * 10) / 10,
        y: Math.round(pose.rot.y * 10) / 10,
        z: Math.round(pose.rot.z * 10) / 10
      };
      this.bonePos = {
        x: Math.round(pose.pos.x * 100) / 100,
        y: Math.round(pose.pos.y * 100) / 100,
        z: Math.round(pose.pos.z * 100) / 100
      };
    }
    this.cdr.markForCheck();
  }

  openPropTimeline(propId?: string | null, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const pid = propId || this.selectedPropId || this.propActionAnchor.propId;
    if (!pid) return;
    if (!this.sceneService.hasPropRig(pid)) {
      this.toastr.info('Đồ vật này chưa nạp mô hình GLB trên canvas.', 'Timeline 3D');
      return;
    }
    this.timelinePropId = pid;
    const prop = this.roomProps?.find((p) => p && p.id === pid);
    this.timelinePropName = prop?.name || pid;
    this.timelineBones = this.sceneService.getPropBones(pid);

    // Đồng bộ kho Clip Keyframe dùng chung từ các nhân vật khác trong phòng và từ thư mục assets/anims/
    this.syncSharedClipsToProp(pid);

    this.timelineClips = this.sceneService.getPropClips(pid);
    this.timelineData = this.sceneService.getPropTimeline(pid);
    this.timelineCurrentTime = Math.round(this.sceneService.getPropCurrentTime(pid) * 100) / 100;

    // Ưu tiên chọn xương đầu tiên có trong danh sách (bỏ qua __root__ nếu mô hình có xương thật)
    const firstSkinned = this.timelineBones.find((b) => b.isSkinnedBone) || this.timelineBones[1] || this.timelineBones[0];
    this.selectedBoneName = firstSkinned ? firstSkinned.name : '__root__';
    this.selectTimelineBone(this.selectedBoneName);
    this.isGlbTimelineOpen = true;
    this.cdr.markForCheck();
  }

  /** Đồng bộ các Clip Keyframe đã lưu giữa các nhân vật 3D và thư mục ~/Documents/ai.type/data/profiles/{username}/assets/anims/ */
  private async syncSharedClipsToProp(targetPropId: string): Promise<void> {
    if (!targetPropId || !this.sceneService.hasPropRig(targetPropId)) return;
    let changed = false;

    // 1. Đồng bộ từ các đồ vật 3D khác trong cùng căn phòng
    for (const p of this.roomProps || []) {
      const savedList = p?.boneTimeline?.savedClips;
      if (Array.isArray(savedList)) {
        for (const clip of savedList) {
          if (this.sceneService.injectSharedKeyframeClip(targetPropId, clip)) {
            changed = true;
          }
        }
      }
    }

    // 2. Đọc các tệp .glb chuyển động đã xuất trong thư mục assets/anims/
    const electronApi = (window as any).electron;
    if (electronApi?.listAnimations && electronApi?.readGlb) {
      try {
        const listRes = await electronApi.listAnimations(this.username || 'admin');
        const animItems: any[] = Array.isArray(listRes?.data) ? listRes.data : [];
        for (const item of animItems) {
          if (!item?.glbPath) continue;
          const glbRes = await electronApi.readGlb(item.glbPath);
          if (glbRes?.success && glbRes.buffer) {
            const parsedClip = this.sceneService.parseKeyframeClipFromBuffer(glbRes.buffer);
            if (parsedClip && this.sceneService.injectSharedKeyframeClip(targetPropId, parsedClip)) {
              changed = true;
            }
          }
        }
      } catch (_) {}
    }

    if (changed && this.timelinePropId === targetPropId) {
      this.timelineClips = this.sceneService.getPropClips(targetPropId);
      this.timelineData = this.sceneService.getPropTimeline(targetPropId);
      this.cdr.markForCheck();
    }
  }

  closePropTimeline(): void {
    this.isGlbTimelineOpen = false;
    this.sceneService.highlightPropBone(null, null);
    this.cdr.markForCheck();
  }

  selectTimelineBone(boneName: string): void {
    this.selectedBoneName = boneName;
    if (!this.timelinePropId) return;
    this.sceneService.highlightPropBone(this.timelinePropId, boneName);
    const pose = this.sceneService.getBonePoseDelta(this.timelinePropId, boneName);
    this.boneRot = {
      x: Math.round(pose.rot.x * 10) / 10,
      y: Math.round(pose.rot.y * 10) / 10,
      z: Math.round(pose.rot.z * 10) / 10
    };
    this.bonePos = {
      x: Math.round(pose.pos.x * 100) / 100,
      y: Math.round(pose.pos.y * 100) / 100,
      z: Math.round(pose.pos.z * 100) / 100
    };
    this.cdr.markForCheck();
  }

  onBoneTransformChange(): void {
    if (!this.timelinePropId || !this.selectedBoneName) return;
    if (this.timelineData) {
      this.timelineData.mode = 'keyframes';
      this.timelineData.playing = false;
    }
    this.sceneService.setBonePoseDelta(
      this.timelinePropId,
      this.selectedBoneName,
      this.boneRot,
      this.bonePos
    );
    if (this.timelineAutoKey) {
      this.sceneService.upsertBoneKeyframe(
        this.timelinePropId,
        this.selectedBoneName,
        this.timelineCurrentTime,
        this.boneRot,
        this.bonePos
      );
      this.saveTimelineToProp(true);
    }
    this.cdr.markForCheck();
  }

  addCurrentBoneKeyframe(): void {
    if (!this.timelinePropId || !this.selectedBoneName) return;
    const kf = this.sceneService.upsertBoneKeyframe(
      this.timelinePropId,
      this.selectedBoneName,
      this.timelineCurrentTime,
      this.boneRot,
      this.bonePos
    );
    if (kf) {
      this.saveTimelineToProp(true);
      this.toastr.success(
        `Đã lưu Keyframe cho khớp "${this.getBoneLabel(this.selectedBoneName)}" tại ${kf.time.toFixed(2)}s.`,
        'Timeline GLB'
      );
    }
    this.cdr.markForCheck();
  }

  deleteTimelineKeyframe(kfId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.timelinePropId) return;
    this.sceneService.deleteBoneKeyframe(this.timelinePropId, kfId);
    this.saveTimelineToProp(true);
    this.cdr.markForCheck();
  }

  jumpToKeyframe(kf: GlbBoneKeyframe, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.timelinePropId) return;
    this.sceneService.setPropTimelinePlaying(this.timelinePropId, false);
    this.timelineCurrentTime = kf.time;
    this.sceneService.seekPropTimeline(this.timelinePropId, kf.time);
    this.selectTimelineBone(kf.boneName);
  }

  resetCurrentBonePose(): void {
    if (!this.timelinePropId || !this.selectedBoneName) return;
    this.boneRot = { x: 0, y: 0, z: 0 };
    this.bonePos = { x: 0, y: 0, z: 0 };
    this.sceneService.resetBonePose(this.timelinePropId, this.selectedBoneName);
    if (this.timelineAutoKey) {
      this.sceneService.upsertBoneKeyframe(
        this.timelinePropId,
        this.selectedBoneName,
        this.timelineCurrentTime,
        this.boneRot,
        this.bonePos
      );
      this.saveTimelineToProp(true);
    }
    this.cdr.markForCheck();
  }

  resetAllBonesPose(): void {
    if (!this.timelinePropId) return;
    this.boneRot = { x: 0, y: 0, z: 0 };
    this.bonePos = { x: 0, y: 0, z: 0 };
    this.sceneService.resetBonePose(this.timelinePropId);
    this.cdr.markForCheck();
  }

  clearTimelineKeyframes(): void {
    if (!this.timelinePropId) return;
    this.sceneService.clearAllBoneKeyframes(this.timelinePropId);
    this.boneRot = { x: 0, y: 0, z: 0 };
    this.bonePos = { x: 0, y: 0, z: 0 };
    this.saveTimelineToProp(true);
    this.toastr.info('Đã xóa toàn bộ Keyframe và đưa khớp xương về tư thế gốc.', 'Timeline GLB');
    this.cdr.markForCheck();
  }

  onTimelineScrub(timeVal: number): void {
    if (!this.timelinePropId) return;
    const t = Number(timeVal) || 0;
    this.timelineCurrentTime = Math.round(t * 100) / 100;
    this.sceneService.setPropTimelinePlaying(this.timelinePropId, false);
    this.sceneService.seekPropTimeline(this.timelinePropId, this.timelineCurrentTime);
    if (this.selectedBoneName && this.timelineData?.mode === 'keyframes') {
      const pose = this.sceneService.getBonePoseDelta(this.timelinePropId, this.selectedBoneName);
      this.boneRot = {
        x: Math.round(pose.rot.x * 10) / 10,
        y: Math.round(pose.rot.y * 10) / 10,
        z: Math.round(pose.rot.z * 10) / 10
      };
      this.bonePos = {
        x: Math.round(pose.pos.x * 100) / 100,
        y: Math.round(pose.pos.y * 100) / 100,
        z: Math.round(pose.pos.z * 100) / 100
      };
    }
    this.cdr.markForCheck();
  }

  toggleTimelinePlay(): void {
    if (!this.timelinePropId || !this.timelineData) return;
    const next = !this.timelineData.playing;
    if (next && this.timelineData.mode === 'keyframes' && (!this.timelineData.keyframes || this.timelineData.keyframes.length === 0)) {
      this.toastr.warning('Chưa có Keyframe nào trên Timeline. Hãy xoay khớp xương hoặc chọn một mẫu chuyển động nhanh.', 'Timeline GLB');
      return;
    }
    this.sceneService.setPropTimelinePlaying(this.timelinePropId, next);
    this.saveTimelineToProp(true);
    this.cdr.markForCheck();
  }

  stopTimelinePlayback(): void {
    if (!this.timelinePropId) return;
    this.sceneService.setPropTimelinePlaying(this.timelinePropId, false);
    this.timelineCurrentTime = 0;
    this.sceneService.seekPropTimeline(this.timelinePropId, 0);
    this.saveTimelineToProp(true);
    this.cdr.markForCheck();
  }

  onTimelineConfigChange(): void {
    if (!this.timelinePropId || !this.timelineData) return;
    this.sceneService.setPropTimelineConfig(this.timelinePropId, {
      loop: this.timelineData.loop,
      speed: Number(this.timelineData.speed) || 1.0,
      duration: Math.max(0.5, Number(this.timelineData.duration) || 3.0),
      mode: this.timelineData.mode
    });
    this.saveTimelineToProp(true);
    this.cdr.markForCheck();
  }

  selectTimelineClip(clipName: string): void {
    if (!this.timelinePropId) return;
    if (this.sceneService.playPropClip(this.timelinePropId, clipName)) {
      this.timelineData = this.sceneService.getPropTimeline(this.timelinePropId);
      this.saveTimelineToProp(true);
      this.toastr.success(`Đang phát clip chuyển động "${clipName}".`, 'Timeline GLB');
    }
    this.cdr.markForCheck();
  }

  applyBonePreset(preset: 'breathe' | 'wave' | 'bounce' | 'look_around'): void {
    if (!this.timelinePropId) return;
    if (this.sceneService.applyProceduralBonePreset(this.timelinePropId, preset)) {
      this.timelineData = this.sceneService.getPropTimeline(this.timelinePropId);
      this.saveTimelineToProp(true);
      const labelMap = {
        breathe: 'Thở nhịp nhàng',
        wave: 'Vẫy chào',
        bounce: 'Nhún nhảy',
        look_around: 'Xoay nhìn quanh'
      };
      this.toastr.success(`Đã tạo Keyframe mẫu "${labelMap[preset]}" và phát trên Timeline.`, 'Timeline GLB');
    }
    this.cdr.markForCheck();
  }

  async onPropAnimGlbSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file || !this.timelinePropId) return;
    if (!/\.(glb|json)$/i.test(file.name)) {
      this.toastr.error('Vui lòng chọn tệp định dạng .GLB hoặc .JSON chứa dữ liệu chuyển động.', 'Timeline GLB');
      return;
    }
    const rawBuffer = await file.arrayBuffer();
    const blobUrl = URL.createObjectURL(file);
    this.sceneService.importPropAnimationGlb(this.timelinePropId, blobUrl, file.name, rawBuffer).then(async (res) => {
      URL.revokeObjectURL(blobUrl);
      if (res.ok) {
        this.timelineClips = this.sceneService.getPropClips(this.timelinePropId!);
        this.timelineData = this.sceneService.getPropTimeline(this.timelinePropId!);
        // Lưu luôn tệp GLB chuyển động vừa nạp vào thư mục assets/anims/ để dùng lâu dài
        if (/\.glb$/i.test(file.name) && (window as any).electron?.uploadAnimation) {
          try {
            await (window as any).electron.uploadAnimation(
              this.username || 'admin',
              res.clipName || file.name.replace(/\.glb$/i, ''),
              rawBuffer
            );
          } catch (_) {}
        }
        this.saveTimelineToProp(true);
        this.toastr.success(
          `Đã nạp và phát chuyển động "${res.clipName}" (${res.duration?.toFixed(2)}s).`,
          'Timeline GLB'
        );
      } else {
        this.toastr.error(res.error || 'Không nạp được animation từ tệp đã chọn.', 'Timeline GLB');
      }
      this.cdr.markForCheck();
    });
  }

  saveTimelineToProp(silent = false, customClipLabel?: string): void {
    if (!this.timelinePropId) return;
    let bakedClipInfo: { name: string; duration: number; kfCount: number; isNew: boolean } | null = null;
    const currentTl = this.sceneService.getPropTimeline(this.timelinePropId);

    // Khi người dùng bấm nút Lưu (silent === false) hoặc truyền tên clip rõ ràng và trên Timeline đang có Keyframe:
    // tự động đóng gói bộ Keyframe hiện tại thành một Clip chuyển động mới trong tab "Clip Chuyển động"
    // đồng thời xuất tệp .glb riêng biệt vào ~/Documents/ai.type/data/profiles/{username}/assets/anims/
    if ((!silent || customClipLabel) && currentTl && Array.isArray(currentTl.keyframes) && currentTl.keyframes.length > 0) {
      const promptTitle = (this.aiMotionPrompt || '').trim();
      const videoTitle = (this.aiMotionVideoName || '').replace(/\.[^.]+$/, '').trim();
      const customCount = this.timelineClips.filter((c) => c.isCustom).length;
      const autoTitle =
        customClipLabel ||
        (promptTitle ? `AI: ${promptTitle.slice(0, 36)}` : '') ||
        (videoTitle ? `Video: ${videoTitle.slice(0, 32)}` : '') ||
        `Clip Keyframe #${customCount + 1}`;
      bakedClipInfo = this.sceneService.bakeKeyframesToClip(this.timelinePropId, autoTitle);
      this.timelineClips = this.sceneService.getPropClips(this.timelinePropId);

      if (bakedClipInfo) {
        // 1. Xuất tệp nhị phân .glb chuẩn vào thư mục assets/anims/ qua Electron IPC
        const glbBuf = this.sceneService.exportClipToGlbArrayBuffer(this.timelinePropId, bakedClipInfo.name);
        if (glbBuf && (window as any).electron?.uploadAnimation) {
          (window as any).electron
            .uploadAnimation(this.username || 'admin', bakedClipInfo.name, glbBuf)
            .catch((e: any) => console.warn('[Timeline GLB] Không ghi được file clip .glb rời:', e));
        }

        // 2. Chia sẻ ngay Clip mới sang các nhân vật 3D khác đang có trong phòng để tái sử dụng chéo
        const savedObj = this.sceneService
          .getPropTimeline(this.timelinePropId)
          ?.savedClips?.find((c) => c.name === bakedClipInfo!.name);
        if (savedObj) {
          for (const p of this.roomProps || []) {
            if (p && p.id !== this.timelinePropId && this.sceneService.hasPropRig(p.id)) {
              this.sceneService.injectSharedKeyframeClip(p.id, savedObj);
            }
          }
        }
      }
    }

    const tl = this.sceneService.getPropTimeline(this.timelinePropId);
    const prop = this.roomProps?.find((p) => p && p.id === this.timelinePropId);
    if (prop && tl) {
      prop.boneTimeline = JSON.parse(JSON.stringify(tl));
      this.timelineData = tl;
      this.profileDataService.saveProps(this.roomProps).subscribe();
      if (!silent) {
        if (bakedClipInfo) {
          const safeFile = bakedClipInfo.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_') + '.glb';
          this.toastr.success(
            `Đã đóng gói Clip "${bakedClipInfo.name}" (${bakedClipInfo.kfCount} KF) và lưu tệp rời vào assets/anims/${safeFile}!`,
            'Timeline GLB'
          );
        } else {
          this.toastr.success(`Đã lưu Timeline chuyển động cho "${prop.name}".`, 'Timeline GLB');
        }
      }
    }
    this.cdr.markForCheck();
  }

  /** Tải xuống / Xuất tệp .glb độc lập của một Clip Keyframe để chia sẻ hoặc nạp cho nhân vật khác */
  exportTimelineCustomClip(clipName: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.timelinePropId || !clipName) return;
    const glbBuf = this.sceneService.exportClipToGlbArrayBuffer(this.timelinePropId, clipName);
    if (!glbBuf) {
      this.toastr.warning('Không tìm thấy dữ liệu Keyframe của Clip này để xuất.', 'Timeline GLB');
      return;
    }
    const safeName = clipName.replace(/[^a-zA-Z0-9_\-\.]/g, '_') || 'CustomClip';
    if ((window as any).electron?.uploadAnimation) {
      (window as any).electron
        .uploadAnimation(this.username || 'admin', clipName, glbBuf)
        .catch(() => {});
    }
    const blob = new Blob([glbBuf], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.glb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    this.toastr.success(
      `Đã xuất tệp "${safeName}.glb" (và đồng bộ vào thư mục assets/anims/${safeName}.glb)!`,
      'Timeline GLB'
    );
  }

  deleteTimelineCustomClip(clipName: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.timelinePropId || !clipName) return;
    if (this.sceneService.deletePropCustomClip(this.timelinePropId, clipName)) {
      const safeId = clipName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      if ((window as any).electron?.deleteAnimation) {
        (window as any).electron.deleteAnimation(this.username || 'admin', safeId).catch(() => {});
      }
      this.timelineClips = this.sceneService.getPropClips(this.timelinePropId);
      this.timelineData = this.sceneService.getPropTimeline(this.timelinePropId);
      this.saveTimelineToProp(true);
      this.toastr.info(`Đã xóa Clip chuyển động "${clipName}".`, 'Timeline GLB');
      this.cdr.markForCheck();
    }
  }

  // ============================================================================
  // AI MOTION DESIGNER: TỰ ĐỘNG THIẾT KẾ CLIP KEYFRAME TỪ KHỚP XƯƠNG & VIDEO MẪU
  // ============================================================================
  isAiMotionBarOpen = false;
  isDesigningAiMotion = false;
  aiMotionPrompt = '';
  aiMotionVideoName = '';
  aiMotionVideoDuration = 0;
  aiMotionVideoFrames: Array<{
    time: number;
    dataUrl: string;
    base64: string;
    mimeType: string;
    energy: number;
  }> = [];
  aiMotionPoseSamples: VideoFramePoseSample[] = [];

  toggleAiMotionBar(): void {
    this.isAiMotionBarOpen = !this.isAiMotionBarOpen;
    this.cdr.markForCheck();
  }

  clearMotionVideo(): void {
    this.aiMotionVideoName = '';
    this.aiMotionVideoDuration = 0;
    this.aiMotionVideoFrames = [];
    this.aiMotionPoseSamples = [];
    this.cdr.markForCheck();
  }

  /** Trích xuất an toàn đối tượng JSON từ phản hồi của AI (bất kể có thẻ <think> hay markdown bao quanh) */
  private extractJsonFromAiText(rawText: string): any {
    if (!rawText) return null;
    let text = String(rawText)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      text = fenceMatch[1].trim();
    } else {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }
    }
    text = text.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  /**
   * Trích xuất chuỗi khung hình mẫu (keyframes) và phân tích tư thế chuyển động không gian
   * (trọng tâm cơ thể cx/cy, góc xoay hông/thân, độ nâng/gập 2 cánh tay & 2 chân) từ tệp Video mẫu.
   */
  extractKeyFramesFromVideoFile(
    file: File,
    sampleCount = 12
  ): Promise<{
    duration: number;
    frames: Array<{ time: number; dataUrl: string; base64: string; mimeType: string; energy: number }>;
    poseSamples: VideoFramePoseSample[];
  }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) {}
        URL.revokeObjectURL(url);
      };

      const failTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Quá thời gian đọc tệp video mẫu.'));
      }, 25000);

      video.onerror = () => {
        clearTimeout(failTimeout);
        cleanup();
        reject(new Error('Không thể giải mã tệp video mẫu.'));
      };

      video.onloadedmetadata = async () => {
        try {
          const rawDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2.4;
          const clampedDur = Math.round(Math.max(0.8, Math.min(16.0, rawDur)) * 100) / 100;
          const vw = video.videoWidth || 320;
          const vh = video.videoHeight || 320;
          const maxDim = 224;
          const scale = Math.min(1, maxDim / Math.max(vw, vh));
          const cw = Math.max(64, Math.round(vw * scale));
          const ch = Math.max(64, Math.round(vh * scale));

          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('Không khởi tạo được Canvas trích xuất khung hình.');

          const frames: Array<{ time: number; dataUrl: string; base64: string; mimeType: string; energy: number }> = [];
          const poseSamples: VideoFramePoseSample[] = [];
          let prevLuma: Float32Array | null = null;
          const rawDiffs: number[] = [];

          const seekTo = (t: number) =>
            new Promise<void>((resSeek) => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resSeek();
              };
              video.addEventListener('seeked', onSeeked);
              try {
                video.currentTime = t;
              } catch (_) {
                video.removeEventListener('seeked', onSeeked);
                resSeek();
              }
            });

          const totalSamples = Math.max(8, Math.min(20, sampleCount));
          const safeEnd = Math.max(0.1, Math.min(clampedDur, rawDur) - 0.04);

          for (let i = 0; i < totalSamples; i++) {
            const ratio = totalSamples > 1 ? i / (totalSamples - 1) : 0;
            const seekTime = Math.round(ratio * safeEnd * 100) / 100;
            const tlTime = Math.round(ratio * clampedDur * 100) / 100;
            await seekTo(seekTime);
            ctx.drawImage(video, 0, 0, cw, ch);

            const imgData = ctx.getImageData(0, 0, cw, ch).data;
            const numPixels = cw * ch;
            const luma = new Float32Array(numPixels);

            // Ước lượng màu nền từ viền trái/phải của khung hình để tách silhouette nhân vật
            let bgR = 0;
            let bgG = 0;
            let bgB = 0;
            let bgCount = 0;
            for (let y = 0; y < ch; y += 2) {
              for (const bx of [1, 2, cw - 3, cw - 2]) {
                if (bx >= 0 && bx < cw) {
                  const bi = (y * cw + bx) * 4;
                  bgR += imgData[bi];
                  bgG += imgData[bi + 1];
                  bgB += imgData[bi + 2];
                  bgCount++;
                }
              }
            }
            bgR /= Math.max(1, bgCount);
            bgG /= Math.max(1, bgCount);
            bgB /= Math.max(1, bgCount);

            let diffSum = 0;
            let fgWeightSum = 0;
            let sumX = 0;
            let sumY = 0;
            let upperSumX = 0;
            let upperW = 0;
            let lowerTorsSumX = 0;
            let lowerTorsW = 0;
            let leftFlow = 0;
            let rightFlow = 0;

            const fgMask = new Float32Array(numPixels);

            for (let y = 0; y < ch; y++) {
              const ny = y / ch;
              for (let x = 0; x < cw; x++) {
                const nx = x / cw;
                const pIdx = y * cw + x;
                const p4 = pIdx * 4;
                const r = imgData[p4];
                const g = imgData[p4 + 1];
                const b = imgData[p4 + 2];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                luma[pIdx] = lum;

                const mDiff = prevLuma ? Math.abs(lum - prevLuma[pIdx]) : 0;
                diffSum += mDiff;

                const bgDist = Math.abs(r - bgR) * 0.35 + Math.abs(g - bgG) * 0.35 + Math.abs(b - bgB) * 0.3;
                const centerBias = Math.max(0.15, 1 - Math.pow((nx - 0.5) * 1.65, 2));
                const w = Math.max(0, (bgDist > 26 ? bgDist - 18 : 0) * 0.65 + mDiff * 1.85) * centerBias;
                fgMask[pIdx] = w;

                if (w > 12) {
                  fgWeightSum += w;
                  sumX += nx * w;
                  sumY += ny * w;
                  if (ny >= 0.14 && ny <= 0.36) {
                    upperSumX += nx * w;
                    upperW += w;
                  } else if (ny > 0.36 && ny <= 0.58) {
                    lowerTorsSumX += nx * w;
                    lowerTorsW += w;
                  }
                  if (nx < 0.5) leftFlow += mDiff;
                  else rightFlow += mDiff;
                }
              }
            }

            const avgDiff = prevLuma ? diffSum / numPixels : 10;
            rawDiffs.push(avgDiff);
            prevLuma = luma;

            const cx = fgWeightSum > 10 ? Math.max(0.2, Math.min(0.8, sumX / fgWeightSum)) : 0.5;
            const cy = fgWeightSum > 10 ? Math.max(0.25, Math.min(0.75, sumY / fgWeightSum)) : 0.5;
            const upperCx = upperW > 5 ? upperSumX / upperW : cx;
            const lowerCx = lowerTorsW > 5 ? lowerTorsSumX / lowerTorsW : cx;

            // Đo độ rộng vai/thân và vùng tay/chân hai bên so với trục thân cx
            let torsoSpanSum = 0;
            let torsoSpanW = 0;
            let screenLeftArmY = 0;
            let screenLeftArmX = 0;
            let screenLeftArmW = 0;
            let screenRightArmY = 0;
            let screenRightArmX = 0;
            let screenRightArmW = 0;
            let screenLeftLegY = 0;
            let screenLeftLegW = 0;
            let screenRightLegY = 0;
            let screenRightLegW = 0;

            for (let y = 0; y < ch; y++) {
              const ny = y / ch;
              for (let x = 0; x < cw; x++) {
                const nx = x / cw;
                const w = fgMask[y * cw + x];
                if (w <= 14) continue;
                const dxFromCenter = nx - cx;

                if (ny >= 0.22 && ny <= 0.55 && Math.abs(dxFromCenter) < 0.25) {
                  torsoSpanSum += Math.abs(dxFromCenter) * w;
                  torsoSpanW += w;
                }
                // Vùng cánh tay (0.12 <= ny <= 0.58): chia bên trái màn hình (dx < -0.05) và bên phải màn hình (dx > 0.05)
                if (ny >= 0.12 && ny <= 0.58) {
                  if (dxFromCenter < -0.05) {
                    screenLeftArmY += ny * w;
                    screenLeftArmX += Math.abs(dxFromCenter) * w;
                    screenLeftArmW += w;
                  } else if (dxFromCenter > 0.05) {
                    screenRightArmY += ny * w;
                    screenRightArmX += Math.abs(dxFromCenter) * w;
                    screenRightArmW += w;
                  }
                }
                // Vùng hai chân (0.58 < ny <= 0.94)
                if (ny > 0.58 && ny <= 0.94) {
                  if (dxFromCenter < -0.01) {
                    screenLeftLegY += ny * w;
                    screenLeftLegW += w;
                  } else if (dxFromCenter > 0.01) {
                    screenRightLegY += ny * w;
                    screenRightLegW += w;
                  }
                }
              }
            }

            const avgTorsoHalfWidth = torsoSpanW > 5 ? torsoSpanSum / torsoSpanW : 0.09;
            // Khi nhân vật xoay ngang (side profile), bề rộng thân hẹp lại (< 0.075); hướng xoay dựa theo độ lệch flow và hướng di chuyển
            const narrowFactor = Math.max(0, Math.min(1, (0.095 - avgTorsoHalfWidth) / 0.045));
            const flowAsym = (rightFlow - leftFlow) / Math.max(1, rightFlow + leftFlow);
            const turnSign = Math.abs(flowAsym) > 0.04 ? Math.sign(flowAsym) : (i % 2 === 0 ? 1 : -1);
            const torsoTurnY = Math.round(
              Math.max(-85, Math.min(85, turnSign * narrowFactor * 72 + flowAsym * 35))
            );
            const torsoLeanZ = Math.round(Math.max(-28, Math.min(28, (upperCx - lowerCx) * 180)));
            const torsoPitchX = Math.round(Math.max(-25, Math.min(32, (cy - 0.5) * 95)));

            // Khi nhân vật 3D quay mặt về phía camera (+Z):
            // Bên TRÁI màn hình video (screenLeft) tương ứng với TAY PHẢI / CHÂN PHẢI của nhân vật 3D (RightArm / RightUpLeg)
            // Bên PHẢI màn hình video (screenRight) tương ứng với TAY TRÁI / CHÂN TRÁI của nhân vật 3D (LeftArm / LeftUpLeg)
            const sLeftArmMeanY = screenLeftArmW > 5 ? screenLeftArmY / screenLeftArmW : 0.42;
            const sLeftArmSpanX = screenLeftArmW > 5 ? screenLeftArmX / screenLeftArmW : 0.1;
            const sRightArmMeanY = screenRightArmW > 5 ? screenRightArmY / screenRightArmW : 0.42;
            const sRightArmSpanX = screenRightArmW > 5 ? screenRightArmX / screenRightArmW : 0.1;

            const rightArmLift = Math.round(
              Math.max(0, Math.min(95, (0.45 - sLeftArmMeanY) * 210 + (sLeftArmSpanX - 0.09) * 260))
            );
            const leftArmLift = Math.round(
              Math.max(0, Math.min(95, (0.45 - sRightArmMeanY) * 210 + (sRightArmSpanX - 0.09) * 260))
            );

            // Nếu tay nâng cao nhưng độ vươn ngang vừa phải -> tay đang co khuỷu đưa lên phía trước ngực
            const rightElbowBend = Math.round(
              Math.max(12, Math.min(95, (0.46 - sLeftArmMeanY) * 220 + (0.16 - Math.min(0.16, sLeftArmSpanX)) * 320))
            );
            const leftElbowBend = Math.round(
              Math.max(12, Math.min(95, (0.46 - sRightArmMeanY) * 220 + (0.16 - Math.min(0.16, sRightArmSpanX)) * 320))
            );

            const rightArmFwd = Math.round(Math.max(-25, Math.min(85, rightArmLift * 0.45 + rightElbowBend * 0.35)));
            const leftArmFwd = Math.round(Math.max(-25, Math.min(85, leftArmLift * 0.45 + leftElbowBend * 0.35)));

            const sLeftLegMeanY = screenLeftLegW > 5 ? screenLeftLegY / screenLeftLegW : 0.76;
            const sRightLegMeanY = screenRightLegW > 5 ? screenRightLegY / screenRightLegW : 0.76;
            const legBalance = (screenLeftLegW - screenRightLegW) / Math.max(1, screenLeftLegW + screenRightLegW);

            const rightLegPitch = Math.round(
              Math.max(-85, Math.min(40, -(0.77 - sLeftLegMeanY) * 260 + legBalance * 32))
            );
            const leftLegPitch = Math.round(
              Math.max(-85, Math.min(40, -(0.77 - sRightLegMeanY) * 260 - legBalance * 32))
            );
            const rightKneeBend = Math.round(
              Math.max(0, Math.min(95, Math.max(0, -rightLegPitch) * 1.15 + Math.max(0, cy - 0.48) * 180))
            );
            const leftKneeBend = Math.round(
              Math.max(0, Math.min(95, Math.max(0, -leftLegPitch) * 1.15 + Math.max(0, cy - 0.48) * 180))
            );

            poseSamples.push({
              time: tlTime,
              cx: Math.round(cx * 1000) / 1000,
              cy: Math.round(cy * 1000) / 1000,
              torsoTurnY,
              torsoLeanZ,
              torsoPitchX,
              leftArmLift,
              rightArmLift,
              leftArmFwd,
              rightArmFwd,
              leftElbowBend,
              rightElbowBend,
              leftLegPitch,
              rightLegPitch,
              leftKneeBend,
              rightKneeBend,
              energy: 1.0
            });

            const dataUrl = canvas.toDataURL('image/jpeg', 0.76);
            const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
            frames.push({
              time: tlTime,
              dataUrl,
              base64,
              mimeType: 'image/jpeg',
              energy: 1.0
            });
          }

          const meanDiff = rawDiffs.reduce((a, b) => a + b, 0) / Math.max(1, rawDiffs.length) || 1;
          for (let i = 0; i < frames.length; i++) {
            const e = Math.max(0.65, Math.min(1.5, rawDiffs[i] / meanDiff));
            frames[i].energy = e;
            if (poseSamples[i]) poseSamples[i].energy = e;
          }

          clearTimeout(failTimeout);
          cleanup();
          resolve({ duration: clampedDur, frames, poseSamples });
        } catch (err) {
          clearTimeout(failTimeout);
          cleanup();
          reject(err);
        }
      };
    });
  }

  async onMotionVideoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;

    try {
      this.toastr.info(`Đang phân tích tư thế chuyển động từ "${file.name}"...`, 'AI Motion Studio');
      const res = await this.extractKeyFramesFromVideoFile(file, 12);
      this.aiMotionVideoName = file.name;
      this.aiMotionVideoDuration = res.duration;
      this.aiMotionVideoFrames = res.frames;
      this.aiMotionPoseSamples = res.poseSamples;
      this.isAiMotionBarOpen = true;
      if (this.timelineData) {
        this.timelineData.duration = res.duration;
      }

      // Áp dụng ngay lập tức chuyển động bắt chước tư thế Video lên mô hình 3D đang chọn
      const pid = this.timelinePropId || this.selectedPropId;
      let appliedCount = 0;
      if (pid && this.sceneService.hasPropRig(pid) && res.poseSamples.length > 0) {
        appliedCount = this.sceneService.synthesizeVideoPoseBoneMotion(
          pid,
          res.poseSamples,
          res.duration,
          this.aiMotionPrompt
        );
        this.timelineData = this.sceneService.getPropTimeline(pid);
        this.timelineCurrentTime = 0;
        this.saveTimelineToProp(true);
      }

      this.toastr.success(
        appliedCount > 0
          ? `Đã trích xuất ${res.frames.length} khung hình (${res.duration}s) từ "${file.name}" và áp dụng ngay ${appliedCount} Keyframe bắt chước Video!`
          : `Đã trích xuất ${res.frames.length} khung hình mẫu (${res.duration}s) từ "${file.name}". Bấm "AI Thiết kế Clip" để tạo chuyển động!`,
        'AI Motion Studio'
      );
      this.cdr.markForCheck();
    } catch (err: any) {
      this.toastr.error(err?.message || 'Không đọc được tệp video mẫu.', 'AI Motion Studio');
    }
  }

  async designMotionWithAi(): Promise<void> {
    const pid =
      this.timelinePropId ||
      this.selectedPropId ||
      this.roomProps.find((p) => p && p.visible && this.sceneService.hasPropRig(p.id))?.id ||
      null;
    if (!pid || !this.sceneService.hasPropRig(pid)) {
      this.toastr.warning('Vui lòng chọn một nhân vật hoặc đồ vật 3D có khớp xương trước.', 'AI Motion Studio');
      return;
    }
    const prompt = (this.aiMotionPrompt || '').trim();
    if (!prompt && this.aiMotionVideoFrames.length === 0) {
      this.toastr.warning('Hãy chọn một Video mẫu hoặc nhập mô tả chuyển động để AI thiết kế.', 'AI Motion Studio');
      return;
    }

    this.isDesigningAiMotion = true;
    this.cdr.markForCheck();

    const bones = this.sceneService.getPropBones(pid);
    const boneNames = bones.map((b) => b.name);
    const targetDur = this.aiMotionVideoDuration > 0
      ? this.aiMotionVideoDuration
      : (this.timelineData?.duration || 2.4);

    try {
      this.toastr.info('AI Agent đang phân tích khớp xương và thiết kế chuỗi Keyframe...', 'AI Motion Studio', { timeOut: 2500 });

      // Chọn tối đa 8 ảnh đại diện phân bố đều để gửi lên Vision LLM tránh quá tải payload
      const maxVisionFrames = 8;
      const visionFrames = this.aiMotionVideoFrames.length <= maxVisionFrames
        ? this.aiMotionVideoFrames
        : Array.from({ length: maxVisionFrames }, (_, idx) => {
            const fIdx = Math.min(
              this.aiMotionVideoFrames.length - 1,
              Math.round((idx / (maxVisionFrames - 1)) * (this.aiMotionVideoFrames.length - 1))
            );
            return this.aiMotionVideoFrames[fIdx];
          });

      const poseTelemetrySummary = this.aiMotionPoseSamples.length > 0
        ? `\n- Dữ liệu đo tư thế tự động qua từng thời điểm của Video mẫu: ` +
          JSON.stringify(
            this.aiMotionPoseSamples.map((s) => ({
              t: s.time,
              turnY: s.torsoTurnY,
              leanZ: s.torsoLeanZ,
              pitchX: s.torsoPitchX,
              lArmLift: s.leftArmLift,
              rArmLift: s.rightArmLift,
              lElbow: s.leftElbowBend,
              rElbow: s.rightElbowBend,
              lLegRx: s.leftLegPitch,
              rLegRx: s.rightLegPitch,
              lKneeRx: s.leftKneeBend,
              rKneeRx: s.rightKneeBend
            }))
          )
        : '';

      const frameMetaDesc = visionFrames.length > 0
        ? `Người dùng đã đính kèm ${visionFrames.length} khung hình trích xuất theo trình tự thời gian từ Video mẫu "${this.aiMotionVideoName}" (tổng thời lượng ${targetDur}s): ` +
          visionFrames.map((f, idx) => `Ảnh #${idx + 1} tại t=${f.time.toFixed(2)}s`).join(', ') +
          `. Hãy quan sát kỹ tư thế người trong từng khung hình kết hợp thông số đo tư thế để tái tạo chuẩn xác động tác của video.${poseTelemetrySummary}`
        : `Hãy thiết kế chuỗi Keyframe chuyển động mượt mà, đúng giải phẫu cơ thể người trong thời lượng ${targetDur}s dựa trên mô tả của người dùng.`;

      const systemPrompt = `Bạn là **Chuyên gia Diễn hoạt Khớp xương 3D (3D Skeletal Rig & Motion Capture AI Animator)**.
Nhiệm vụ: Thiết kế clip chuyển động Keyframe 3D chính xác trên Hệ tọa độ Chuẩn Nhân vật (Character Cardinal Space).

### DANH SÁCH KHỚP XƯƠNG CỦA MÔ HÌNH HIỆN TẠI (CHỈ ĐƯỢC DÙNG TÊN TRONG DANH SÁCH NÀY):
${JSON.stringify(boneNames)}

### QUY ƯỚC HỆ TRỤC XOAY CHUẨN NHÂN VẬT (CHARACTER CARDINAL SPACE - BẮT BUỘC TUÂN THỦ):
Mọi góc xoay \`rot: { "x": number, "y": number, "z": number }\` (đơn vị: độ) đã được quy chuẩn về trục không gian của nhân vật (tư thế gốc A-pose hai tay xuôi mở ~35 độ):
1. **Trục X (Pitch - Gập trước / Ngả sau)**:
   - Đùi (\`LeftUpLeg\`, \`RightUpLeg\`): **x ÂM (-20 đến -100)** là nâng đùi/đá chân LÊN PHÍA TRƯỚC; **x DƯƠNG (+15 đến +45)** là đưa chân RA PHÍA SAU.
   - Đầu gối (\`LeftLeg\`, \`RightLeg\`): **x DƯƠNG (+15 đến +100)** là gập cẳng chân VỀ PHÍA SAU (TUYỆT ĐỐI KHÔNG dùng x âm cho khớp gối).
   - Cánh tay trên (\`LeftArm\`, \`RightArm\`): **x ÂM (-20 đến -100)** là đưa cánh tay LÊN PHÍA TRƯỚC NGỰC/MẶT; **x DƯƠNG (+15 đến +50)** là đánh tay RA SAU LƯNG.
   - Khuỷu tay / Cẳng tay (\`LeftForeArm\`, \`RightForeArm\`): **x ÂM (-20 đến -100)** là gập khuỷu tay LÊN PHÍA TRƯỚC.
   - Cột sống & Đầu (\`Hips\`, \`Spine02\`, \`Spine01\`, \`Spine\`, \`neck\`, \`Head\`): **x DƯƠNG (+10 đến +45)** là cúi gập người/gật đầu VỀ PHÍA TRƯỚC; **x ÂM (-10 đến -30)** là ngửa ra sau.
2. **Trục Y (Yaw - Xoay trái / Xoay phải quanh trục dọc)**:
   - \`y DƯƠNG\` xoay thân/đầu sang phải, \`y ÂM\` xoay sang trái (Moonwalk hoặc nhìn ngang: \`Hips.rot.y\` khoảng -75 đến +75).
3. **Trục Z (Roll - Giang ngang / Khép tay / Nghiêng lườn)**:
   - Tay trái (\`LeftArm\`): **z DƯƠNG (+15 đến +80)** là giang và nâng cao tay trái lên trời; **z ÂM (-12 đến -25)** là khép tay trái sát vào thân người.
   - Tay phải (\`RightArm\`): **z ÂM (-15 đến -80)** là giang và nâng cao tay phải lên trời; **z DƯƠNG (+12 đến +25)** là khép tay phải sát vào thân người.
4. **Dịch chuyển vị trí \`pos: { "x": number, "y": number, "z": number }\` (đơn vị mét, chỉ áp dụng cho \`Hips\` hoặc \`__root__\`)**:
   - \`pos.y\`: **+0.08 đến +0.35** khi bật nhảy lên không; **-0.08 đến -0.40** khi nhún gối / ngồi squat.
   - \`pos.x\`: **-0.45 đến +0.45** khi bước/lướt sang ngang (như Moonwalk hoặc né người).

### THÔNG TIN VIDEO MẪU & YÊU CẦU:
- ${frameMetaDesc}
- Yêu cầu từ người dùng: "${prompt || 'Bắt chước chính xác chuyển động, hướng xoay thân, bước chân và cử chỉ tay trong các khung hình video mẫu'}"

### YÊU CẦU ĐẦU RA:
- Tạo từ 35 đến 90 keyframes phân bố đều trên tất cả các khớp chính (Hips, Spine02/Spine01/Spine, neck, Head, LeftArm, LeftForeArm, RightArm, RightForeArm, LeftUpLeg, LeftLeg, RightUpLeg, RightLeg) xuyên suốt từ 0.0s đến ${targetDur}s.
- CHỈ TRẢ VỀ JSON THUẦN TÚY đúng cấu trúc sau:
{
  "duration": ${targetDur},
  "loop": true,
  "explanation": "Mô tả ngắn gọn chuyển động vừa thiết kế",
  "keyframes": [
    { "time": 0.0, "boneName": "Hips", "rot": { "x": 0, "y": 0, "z": 0 }, "pos": { "x": 0, "y": 0, "z": 0 } }
  ]
}`;

      const parts: any[] = [{ text: systemPrompt }];
      for (const f of visionFrames) {
        parts.push({
          inlineData: {
            mimeType: f.mimeType || 'image/jpeg',
            data: f.base64
          }
        });
      }

      let appliedCount = 0;
      let explanation = '';
      try {
        const aiRes: any = await this.genaiService.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts }],
          config: {
            bypassAiAgent: true,
            disableThinking: true,
            temperature: 0.2
          } as any
        });
        const rawReply =
          aiRes?.text ||
          aiRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
          '';
        const parsed = this.extractJsonFromAiText(rawReply);
        if (parsed && Array.isArray(parsed.keyframes) && parsed.keyframes.length >= 8) {
          const distinctBones = new Set(parsed.keyframes.map((k: any) => k?.boneName).filter(Boolean));
          if (distinctBones.size >= 3) {
            appliedCount = this.sceneService.applyGeneratedBoneTimeline(pid, {
              duration: Number(parsed.duration) || targetDur,
              loop: parsed.loop !== false,
              keyframes: parsed.keyframes
            });
            explanation = parsed.explanation || '';
          }
        }
      } catch (apiErr) {
        console.warn('[AI Motion Studio] Fallback to smart motion & video pose synthesizer:', apiErr);
      }

      // Nếu AI trả về thiếu keyframe hoặc người dùng cần bắt chước trực tiếp từ dữ liệu tư thế Video + từ khóa kịch bản
      if (appliedCount < 8) {
        const energies = this.aiMotionVideoFrames.map((f) => f.energy);
        appliedCount = this.sceneService.generateSmartBoneMotion(
          pid,
          prompt,
          targetDur,
          energies,
          this.aiMotionPoseSamples
        );
      }

      this.timelineData = this.sceneService.getPropTimeline(pid);
      this.timelineCurrentTime = 0;
      this.saveTimelineToProp(true);
      this.toastr.success(
        explanation || `Đã thiết kế xong ${appliedCount} Keyframe chuyển động trên các khớp xương và bắt đầu phát!`,
        'AI Motion Studio'
      );
    } catch (err: any) {
      this.toastr.error(err?.message || 'Không thể thiết kế chuyển động AI.', 'AI Motion Studio');
    } finally {
      this.isDesigningAiMotion = false;
      this.cdr.markForCheck();
    }
  }

  /** Trigger thêm đồ vật mới */
  triggerAddProp(): void {
    const newProp = {
      id: 'prop_' + Date.now(),
      name: 'Đồ vật mới ' + (this.roomProps.length + 1),
      category: 'furniture',
      color: '#06b6d4',
      position: { x: 0, y: 1.2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.4, y: 0.4, z: 0.4 },
      visible: true,
      events: [],
      subDevices: []
    };
    this.roomProps.unshift(newProp);
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    this.profileDataService.saveProps(this.roomProps).subscribe();
    this.sceneService.syncProps(this.roomProps);
    this.onSearchChange();
    this.cdr.markForCheck();
    this.toastr.success(`Đã thêm đồ vật mới "${newProp.name}"!`, 'Thêm đồ vật');
  }

  /** Mở dialog chọn file ảnh đính kèm cho prompt */
  triggerPromptFileUpload(): void {
    this.promptFileInput?.nativeElement?.click();
  }

  /** Xử lý chọn file ảnh từ dialog */
  onPromptFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          const dataUrl = e.target.result;
          const mimeType = file.type || 'image/png';
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          this.attachedImages.push({ dataUrl, base64, mimeType });
          this.cdr.markForCheck();
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)) {
        this.toastr.info(`Đang phân tích tư thế chuyển động từ video "${file.name}"...`, 'Đính kèm Video mẫu');
        this.extractKeyFramesFromVideoFile(file, 10)
          .then((res) => {
            this.aiMotionVideoName = file.name;
            this.aiMotionVideoDuration = res.duration;
            this.aiMotionVideoFrames = res.frames;
            this.aiMotionPoseSamples = res.poseSamples;
            for (const f of res.frames.slice(0, 6)) {
              this.attachedImages.push({
                dataUrl: f.dataUrl,
                base64: f.base64,
                mimeType: f.mimeType
              });
            }
            this.toastr.success(
              `Đã trích xuất ${res.frames.length} khung hình chuyển động (${res.duration}s) từ "${file.name}"!`,
              'Đính kèm Video mẫu'
            );
            this.cdr.markForCheck();
          })
          .catch((err) => {
            this.toastr.error(err?.message || 'Không thể đọc tệp video đính kèm.', 'Đính kèm Video mẫu');
          });
      } else if (file.type === 'text/javascript' || file.type === 'application/javascript' || /\.js$/i.test(file.name)) {
        // Tệp JS hiệu ứng PlayCanvas: đọc nội dung văn bản để nhúng vào prompt
        if (file.size > 512 * 1024) {
          this.toastr.warning(`Tệp "${file.name}" quá lớn (tối đa 512KB).`, 'Đính kèm script');
          continue;
        }
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.attachedScripts.push({ name: file.name, code: String(e.target.result || ''), size: file.size });
          this.toastr.info(`Đã đính kèm script hiệu ứng "${file.name}"!`, 'Đính kèm script');
          this.cdr.markForCheck();
        };
        reader.readAsText(file);
      }
    }
    input.value = '';
  }

  /** Xử lý dán ảnh từ Clipboard bằng CTRL+V */
  onPromptPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          const reader = new FileReader();
          reader.onload = (e: any) => {
            const dataUrl = e.target.result;
            const mimeType = file.type || 'image/png';
            const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
            this.attachedImages.push({ dataUrl, base64, mimeType });
            this.toastr.info('Đã dán ảnh screenshot từ Clipboard!', 'Đính kèm ảnh');
            this.cdr.markForCheck();
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }

  /** Xóa ảnh đính kèm */
  removeAttachedImage(index: number): void {
    if (index >= 0 && index < this.attachedImages.length) {
      this.attachedImages.splice(index, 1);
      this.cdr.markForCheck();
    }
  }

  /** Xóa tệp script đính kèm */
  removeAttachedScript(index: number): void {
    if (index >= 0 && index < this.attachedScripts.length) {
      this.attachedScripts.splice(index, 1);
      this.cdr.markForCheck();
    }
  }

  /** Có dữ liệu đính kèm nào để gửi không (dùng cho nút Send) */
  hasAnyAttachment(): boolean {
    return this.attachedImages.length > 0 || this.attachedScripts.length > 0 || this.attachedProps.length > 0;
  }

  attachedProps: any[] = [];
  showMentionMenu = false;
  mentionQuery = '';
  filteredMentionProps: any[] = [];
  mentionSelectedIndex = 0;

  onPromptInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    if (!textarea) return;
    const value = textarea.value || '';
    const cursor = textarea.selectionStart || 0;

    const textBeforeCursor = value.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        this.mentionQuery = query.toLowerCase();

        const allMentionables: any[] = [];
        for (const p of this.roomProps) {
          allMentionables.push(p);
          if (p.subDevices && Array.isArray(p.subDevices)) {
            for (const sub of p.subDevices) {
              allMentionables.push({
                ...sub,
                isSubDevice: true,
                parentProp: p,
                displayName: `${sub.name || 'Thành phần con'} (${p.name})`
              });
            }
          }
        }

        this.filteredMentionProps = allMentionables.filter(item =>
          (item.name && item.name.toLowerCase().includes(this.mentionQuery)) ||
          (item.displayName && item.displayName.toLowerCase().includes(this.mentionQuery)) ||
          (item.id && item.id.toLowerCase().includes(this.mentionQuery))
        );

        this.showMentionMenu = this.filteredMentionProps.length > 0;
        this.mentionSelectedIndex = 0;
        this.cdr.markForCheck();
        return;
      }
    }
    this.showMentionMenu = false;
    this.cdr.markForCheck();
  }

  onPromptKeydown(event: KeyboardEvent): void {
    if (this.showMentionMenu && this.filteredMentionProps.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionSelectedIndex = (this.mentionSelectedIndex + 1) % this.filteredMentionProps.length;
        this.cdr.markForCheck();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionSelectedIndex = (this.mentionSelectedIndex - 1 + this.filteredMentionProps.length) % this.filteredMentionProps.length;
        this.cdr.markForCheck();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        this.selectMentionProp(this.filteredMentionProps[this.mentionSelectedIndex]);
        return;
      }
      if (event.key === 'Escape') {
        this.showMentionMenu = false;
        this.cdr.markForCheck();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendPrompt();
    }
  }

  selectMentionProp(item: any): void {
    if (!item) return;
    const value = this.promptText || '';
    const lastAtIndex = value.lastIndexOf('@');
    const nameToInsert = item.name;

    if (lastAtIndex >= 0) {
      this.promptText = value.slice(0, lastAtIndex) + `@${nameToInsert} `;
    } else {
      this.promptText = (value ? value.trim() + ' ' : '') + `@${nameToInsert} `;
    }

    const targetPropToAttach = item.isSubDevice ? item.parentProp : item;
    if (!this.attachedProps.some(p => p.id === targetPropToAttach.id)) {
      this.attachedProps.push(targetPropToAttach);
    }

    this.showMentionMenu = false;
    this.cdr.markForCheck();

    setTimeout(() => {
      if (this.promptInputArea?.nativeElement) {
        const el = this.promptInputArea.nativeElement;
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }

  attachPropToPrompt(prop: any): void {
    if (!this.attachedProps.some(p => p.id === prop.id)) {
      this.attachedProps.push(prop);
    }
    const mentionTag = `@${prop.name}`;
    if (!this.promptText?.includes(mentionTag)) {
      this.promptText = (this.promptText ? this.promptText.trim() + ' ' : '') + `${mentionTag} `;
    }
    this.cdr.markForCheck();

    setTimeout(() => {
      if (this.promptInputArea?.nativeElement) {
        const el = this.promptInputArea.nativeElement;
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }

  removeAttachedProp(index: number): void {
    this.attachedProps.splice(index, 1);
    this.cdr.markForCheck();
  }

  /** Gửi prompt AI để chỉnh sửa chương trình 3D & update realtime lên canvas */
  async sendPrompt(): Promise<void> {
    const text = this.promptText?.trim() || '';
    if (!text && this.attachedImages.length === 0 && this.attachedProps.length === 0 && this.attachedScripts.length === 0) return;

    const imagesToProcess = [...this.attachedImages];
    const propsToProcess = [...this.attachedProps];
    const scriptsToProcess = [...this.attachedScripts];
    this.promptText = '';
    this.attachedImages = [];
    this.attachedProps = [];
    this.attachedScripts = [];
    this.cdr.markForCheck();

    let fullPromptText = text;
    if (propsToProcess.length > 0) {
      const propDetails = propsToProcess.map(p => `[Item: "${p.name}", ID: "${p.id}"]`).join(', ');
      fullPromptText = `${text} (Đồ vật chỉ định: ${propDetails})`;
    }
    // Nhúng mã JS hiệu ứng đính kèm vào prompt để AI đọc và áp dụng lên scene
    if (scriptsToProcess.length > 0) {
      const scriptBlocks = scriptsToProcess.map(s =>
        `--- TỆP SCRIPT ĐÍNH KÈM: ${s.name} (${s.size} bytes) ---\n${s.code}\n--- HẾT TỆP SCRIPT ${s.name} ---`
      ).join('\n\n');
      fullPromptText = `${fullPromptText}\n\n=== TỆP SCRIPT HIỆU ỨNG ĐÍNH KÈM TỪ NGƯỜI DÙNG ===\n${scriptBlocks}\nNgười dùng đã đính kèm các tệp JS PlayCanvas ở trên: hãy phân tích, sau đó trả về lệnh 'applyEffect' (tên hiệu ứng, đích áp dụng, tham số tùy chỉnh theo script) để chạy hiệu ứng này trong scene 3D.`;
    }

    await this.processAiPrompt(fullPromptText, imagesToProcess, propsToProcess, scriptsToProcess);
  }

  private extractColorAndBgFromText(text: string): { color: string | null; bgColor: string | null; colorName: string | null } {
    const lower = text.toLowerCase();

    // Check hex code first
    const hexMatch = lower.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
    if (hexMatch) {
      const hex = hexMatch[0];
      if (lower.includes('nền') || lower.includes('background') || lower.includes('bg')) {
        return { color: null, bgColor: hex, colorName: hex };
      }
      return { color: hex, bgColor: hex, colorName: hex };
    }

    const colorMap: Array<{ keywords: string[]; hex: string; bgHex: string; name: string }> = [
      { keywords: ['hồng', 'pink'], hex: '#ec4899', bgHex: '#831843', name: 'Hồng' },
      { keywords: ['xanh lá', 'xanh cây', 'green'], hex: '#22c55e', bgHex: '#064e3b', name: 'Xanh lá' },
      { keywords: ['xanh dương', 'xanh biển', 'blue'], hex: '#3b82f6', bgHex: '#1e3a8a', name: 'Xanh dương' },
      { keywords: ['xanh cyan', 'cyan', 'xanh ngọc', 'xanh lơ'], hex: '#06b6d4', bgHex: '#164e63', name: 'Xanh cyan' },
      { keywords: ['đỏ', 'red'], hex: '#ef4444', bgHex: '#7f1d1d', name: 'Đỏ' },
      { keywords: ['vàng', 'yellow'], hex: '#eab308', bgHex: '#713f12', name: 'Vàng' },
      { keywords: ['cam', 'orange'], hex: '#f97316', bgHex: '#7c2d12', name: 'Cam' },
      { keywords: ['tím', 'purple'], hex: '#a855f7', bgHex: '#581c87', name: 'Tím' },
      { keywords: ['nâu', 'brown'], hex: '#78350f', bgHex: '#451a03', name: 'Nâu' },
      { keywords: ['đen', 'black', 'tối'], hex: '#0f172a', bgHex: '#020617', name: 'Đen' },
      { keywords: ['trắng', 'white', 'sáng'], hex: '#ffffff', bgHex: '#f8fafc', name: 'Trắng' },
      { keywords: ['xám', 'gray', 'grey'], hex: '#64748b', bgHex: '#1e293b', name: 'Xám' }
    ];

    for (const item of colorMap) {
      if (item.keywords.some(kw => lower.includes(kw))) {
        if (lower.includes('nền') || lower.includes('background') || lower.includes('bg')) {
          return { color: item.hex, bgColor: item.bgHex, colorName: item.name };
        }
        return { color: item.hex, bgColor: item.bgHex, colorName: item.name };
      }
    }

    if (lower.includes('thay màu nền') || lower.includes('đổi màu nền') || lower.includes('màu nền khác') || lower.includes('nền khác')) {
      return { color: '#ec4899', bgColor: '#831843', colorName: 'Hồng Cyberpunk' };
    }

    return { color: null, bgColor: null, colorName: null };
  }

  private syncPropTo3DScene(prop: any): void {
    if (!prop) return;

    // 1. Transform / Material / Visibility update in PlayCanvas
    this.sceneService.updateProp(prop);

    // 2. Monitor Screen state / Clock display update
    const isMonitor = prop.id.includes('monitor') || (prop.name && prop.name.toLowerCase().includes('màn hình'));
    if (isMonitor && (prop.activeScreenState === 'clock' || prop.screenOptions)) {
      let side: 'left' | 'right' | 'both' = 'both';
      if (prop.id.includes('left') || (prop.name && prop.name.toLowerCase().includes('trái'))) side = 'left';
      else if (prop.id.includes('right') || (prop.name && prop.name.toLowerCase().includes('phải'))) side = 'right';

      this.sceneService.showDateTimeOnMonitor(side, prop.screenOptions);
    }
  }

  private deepMergeProp(target: any, source: any): void {
    if (!source || typeof source !== 'object') return;
    for (const key of Object.keys(source)) {
      if (key === 'targetPropId' || key === 'targetPropName') continue;
      const val = source[key];
      if (val === null || val === undefined) continue;

      if (typeof val === 'object' && !Array.isArray(val)) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMergeProp(target[key], val);
      } else {
        target[key] = val;
      }
    }
  }

  /** Xử lý câu lệnh AI prompt và cập nhật tức thì (realtime) lên Canvas 3D */
  async processAiPrompt(prompt: string, images: Array<{ dataUrl: string; base64: string; mimeType: string }> = [], targetProps: any[] = [], scripts: Array<{ name: string; code: string; size: number }> = []): Promise<void> {
    const text = prompt.trim();
    if (!text && images.length === 0 && scripts.length === 0) return;

    this.isProcessingPrompt = true;
    this.cdr.markForCheck();

    try {
      this.toastr.info('Đang chỉnh sửa 3D...', 'AI Assistant', { timeOut: 1500 });
      this.cdr.markForCheck();

      const lower = text.toLowerCase();
      let updated = false;
      let message = 'Đã áp dụng chỉnh sửa AI trực tiếp lên 3D Canvas!';

      // Tạo bản sao profile hiện tại
      const currentProfile: UserProfile = JSON.parse(JSON.stringify(this.profile || {
        username: this.username,
        character: { name: this.username, skin: 'default', glbPath: null, scale: 1.0, facingAngle: 0, animationState: 'Walk' },
        scene: { cameraPreset: 'default', lightsOn: true },
        customizations: {},
        createdAt: null,
        updatedAt: null
      }));

      if (!currentProfile.character) {
        currentProfile.character = { name: this.username, skin: 'default', glbPath: null, scale: 1.0, facingAngle: 0, animationState: 'Walk' };
      }
      if (!currentProfile.scene) {
        currentProfile.scene = { cameraPreset: 'default', lightsOn: true };
      }

      try {
        const animListStr = this.userAnimations.map(a => a.name).join(', ');
        let targetPropInstruction = '';
        if (targetProps && targetProps.length > 0) {
          const names = targetProps.map(p => `"${p.name}" (ID: "${p.id}")`).join(', ');
          targetPropInstruction = `
⚠️ CHÚ Ý QUAN TRỌNG VỀ TARGET SCOPE:
Người dùng đang ĐÍNH KÈM / @MENTION ĐỒ VẬT CHỈ ĐỊNH: [${names}].
- Bạn CHỈ ĐƯỢC PHÉP trả về 'modifyProp' để chỉnh sửa thuộc tính JSON Data (như \`activeScreenState: "clock"\`, \`screenOptions\`, \`color\`, \`position\`, \`rotation\`, \`scale\`, \`visible\`,...) CỦA ĐÚNG MÓN ĐỒ VẬT ĐƯỢC MENTION NÀY!
- Trả về object \`modifyProp\` chứa \`targetPropId\` (hoặc \`targetPropName\`) và \`patch\` chứa ĐÚNG CÁC KEY & GIÁ TRỊ CẦN SỬA (ví dụ khi người dùng yêu cầu đổi màu nền màn hình, hãy sửa \`activeScreenState: "clock"\` và \`screenOptions: { "bgColor": "#HexColor" }\`).
- ĐẶC BIỆT DÀNH CHO MÀN HÌNH (MONITOR): Nếu người dùng yêu cầu hiển thị HÌNH ẢNH / FILE ẢNH (chứa đường dẫn file ảnh .png, .jpg, .webp hoặc url), hãy đặt \`activeScreenState: "image"\` và \`screenOptions: { "imageUrl": "đường_dẫn_file_ảnh" }\`.
- TUYỆT ĐỐI KHÔNG thay đổi nhân vật (animationName, scale nhân vật, position nhân vật) hay hệ thống đèn (lightsOn) khi người dùng đang chỉ định đồ vật!`;
        }

        const domainSystemPrompt = `Bạn là **PlayCanvas 3D Master & Director**, Chuyên gia AI có toàn quyền điều khiển toàn bộ tính năng và thuộc tính trong thế giới 3D PlayCanvas.

### KHÔNG GIAN SHOWROOM STUDIO HIỆN TẠI
- Không gian là Studio 3D trưng bày sản phẩm tối giản, trung tâm là chiếc BÀN TRÒN PHỦ VẢI TRẮNG.
- Tọa độ mặt bàn: Tâm bàn tại (X: 0, Z: 0), chiều cao mặt bàn tại Y ≈ 4.1, bán kính mặt bàn R = 9.0.
- Các vật thể trưng bày đặt trên mặt bàn nên có Y trong khoảng từ 4.2 đến 5.5.
- Sàn xung quanh tại Y = 0.
- Bạn có thể thay đổi màu sắc Studio: màu nền Background, màu mặt bàn Table, màu khăn vải phủ Cloth.

### DANH MỤC TÍNH NĂNG PLAYCANVAS BẠN CÓ THỂ ĐIỀU KHIỂN
1. THÊM ĐỒ VẬT TÙY Ý ('newProp'):
   - name: Tên đồ vật (VD: Quả cầu năng lượng, Hộp quà Noel, Bình hoa, Khối trụ pha lê)
   - shape: 'box' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'plane'
   - color: Mã màu Hex (VD: '#06b6d4', '#ef4444', '#fbbf24', '#a855f7', '#ffffff')
   - position: { x, y, z } (mặt sàn: { x: 0, y: 0, z: 0 })
   - scale: { x, y, z } (kích thước theo 3 trục, VD: { x: 1, y: 1, z: 1 })
   - rotation: { x, y, z } (góc xoay theo độ)
   - animation: 'spin' (tự xoay tròn liên tục) | 'bounce' (nhún nhảy nhịp nhàng) | 'float' (lơ lửng bay bổng) | 'pulse' (phập phồng to nhỏ) | 'none'
   - animSpeed: Tốc độ hiệu ứng (spin mặc định 45-90, float/bounce mặc định 2.5)

2. CHỈNH SỬA MỌI THUỘC TÍNH ĐỒ VẬT HIỆN CÓ ('modifyProp'):
   - Sửa bất kỳ món nào theo targetPropId hoặc targetPropName.
   - patch có thể chứa: color, position, scale, rotation, shape, animation, animSpeed, visible.
${targetPropInstruction}

3. XOÁ ĐỒ VẬT ('removePropName'): Tên đồ vật người dùng yêu cầu bỏ.

4. ĐIỀU KHIỂN HÀNH ĐỘNG & TOÀN BỘ NHÂN VẬT 3D ('characterAction'):
   - animationName: Chọn hành động từ danh sách: [${animListStr}] (hoặc 'Idle' khi muốn đứng yên / dừng lại).
   - position: Đưa nhân vật tới vị trí { x, y, z } (VD dưới sàn { x: 0, y: 0, z: 0 }).
   - facingAngle: Xoay hướng mặt nhân vật (0 đến 360 độ).
   - scale: Thu nhỏ / phóng to nhân vật (VD: 0.5 đến 2.0).
   - visible: Ẩn/hiện nhân vật (true / false).

5. ĐỔI MÀU MÔI TRƯỜNG SHOWROOM STUDIO ('environment'):
   - background: Đổi màu nền Studio (Hex).
   - table: Đổi màu mặt bàn gỗ (Hex).
   - cloth: Đổi màu khăn vải trải bàn (Hex).

6. ĐIỀU KHIỂN CAMERA ('cameraPreset' / 'focusPropName'):
   - cameraPreset: 'default' | 'desk' | 'character' | 'overhead'
   - focusPropName: Tập trung góc nhìn vào một món đồ.

7. KÍCH HOẠT HIỆU ỨNG SCRIPT PLAYCANVAS ('applyEffect'):
   - Khi người dùng yêu cầu hiệu ứng (tuyết rơi, mưa, lá rơi, đom đóm, tim bay, khói...), trả về lệnh:
     {"applyEffect": {"name": "snow", "targetPropName": null, "params": {"count": 500, "speed": 2.5}, "script": "function effect(fx) { ... }"}}
   - name: tên ngắn không dấu (snow, rain, leaves, fireflies...). targetPropName: tên món đồ để hiệu ứng bám quanh (null = phủ toàn scene).
   - QUAN TRỌNG về script (CODE JAVASCRIPT PLAYCANVAS chạy thật trong scene 3D):
     * Nếu người dùng đính kèm tệp .js (phần "TỆP SCRIPT HIỆU ỨNG ĐÍNH KÈM"), hãy COPY NGUYÊN VĂN code đó vào trường script (chỉ điều chỉnh tham số theo yêu cầu của người dùng).
     * Nếu không có tệp đính kèm, TỰ VIẾT script theo API chuẩn sau:
       - fx.params: object tham số từ lệnh applyEffect (count, speed, size, color...).
       - fx.spawnParticles({ count, size, color: '#hex', opacity, fallSpeed, radius, topY, center, wind, settle, autoFall, meltMin, meltMax }): tạo hạt cầu RẢI ĐỀU khắp vùng hiệu ứng (mặc định phủ toàn scene; truyền center {x,y,z} + radius để gom hạt quanh một món đồ). VÒNG ĐỜI HẠT TỰ ĐỘNG ĐẦY ĐỦ, script KHÔNG cần viết code rơi: hạt TỰ RƠI (fallSpeed + gió + bồng bềnh) -> TỰ ĐỌNG khi chạm mặt sàn hoặc NÓC đồ vật/nhân vật (restY ĐỘNG: hạt bám theo bề mặt kể cả khi đồ vật bị kéo đi, và ĐỌNG CHỒNG LỚP lên hạt đã nằm dưới → tuyết TÍCH TỤ dần) -> NẰM một thời gian RANDOM (meltMin..meltMax giây, mặc định 4..12) -> TAN CHẢY co nhỏ dần -> TÁI SINH ở đỉnh vùng rơi -> rơi tiếp → tuyết luôn RƠI LIÊN TỤC. Truyền settle: false để hạt chạm bề mặt là quay về đỉnh ngay (mưa/lá, không nằm). Trả về mảng hạt { node, x, y, z, vx, vy, vz, ph, restY, settled, melting, snowAge }.
       - fx.onTick((dt) => { ... }): đăng ký hàm chạy MỖI KHUNG HÌNH — chỉ dành cho hiệu ứng phụ (đổi màu, đếm, nhấp nháy...). TUYỆT ĐỐI KHÔNG giữ hạt đứng lơ lửng giữa không trung: hạt luôn phải rơi và đọng xuống bề mặt. Mặc định tuyết dùng settle: true (đọng + tích tụ + tan chảy rồi tái sinh). Chỉ đặt autoFall: false khi bạn TỰ cập nhật hoàn toàn vị trí hạt mỗi khung hình (y giảm dần theo dt; khi y <= restY thì đặt y = restY — hạt đọng lại, KHÔNG xuyên xuống, KHÔNG lơ lửng).
       - fx.root: pc.Entity gốc của hiệu ứng, luôn nằm ở tọa độ (0,0,0) — vì vậy h.node.setPosition(h.x, h.y, h.z) chính là tọa độ thế giới; biến pc (PlayCanvas engine) có sẵn trong script; fx.log(msg) để debug console.
       - Quy ước: Y=0 là mặt sàn; mỗi hạt có sẵn restY = độ cao bề mặt (sàn/nóc đồ vật) ngay dưới nó; hiệu ứng rơi = y giảm dần theo dt, khi y <= restY thì đặt y = restY (đọng lại trên bề mặt); dùng settle: false nếu muốn hạt rơi liên tục (chạm restY thì nhảy về đỉnh topY — dùng cho mưa/lá).
     * Script viết dạng "function effect(fx) { ... }", KHÔNG dùng fetch/XHR/DOM/setInterval, chỉ dùng API trên + Math + pc.
     * Script kiểu PlayCanvas Editor (pc.createScript + prototype.initialize/update, có attributes.add) cũng được CHẤP NHẬN: runtime tự chuyển đổi sang effect(fx) và attributes thành fx.params. Nếu file đính kèm có lỗi cú pháp (vd "default:," thiếu giá trị), vẫn copy nguyên văn — runtime tự sửa.

8. THIẾT KẾ CLIP CHUYỂN ĐỘNG KHỚP XƯƠNG 3D TỪ VIDEO MẪU / MÔ TẢ ('designBoneAnimation'):
   - Khi người dùng yêu cầu thiết kế/tạo chuyển động khớp xương (keyframe, moonwalk, trượt chân, vẫy tay, đá chân, cúi chào, nhảy, quyền anh, ngồi squat, xoay người, giơ tay, vỗ tay, đi bộ, chạy...) hoặc đính kèm các khung hình trích xuất từ Video mẫu cho một nhân vật / đồ vật GLB có xương, trả về trường \`designBoneAnimation\`:
     {
       "targetPropId": "id_món_đồ_GLB",
       "duration": 2.4,
       "loop": true,
       "keyframes": [
         { "time": 0.0, "boneName": "Hips", "rot": { "x": 0, "y": 0, "z": 0 }, "pos": { "x": 0, "y": 0, "z": 0 } }
       ]
     }
   - Chỉ sử dụng đúng tên khớp xương trong mảng \`rigBones\` của đồ vật đó ở phần TRẠNG THÁI HIỆN TẠI bên dưới.
   - Quy ước Hệ tọa độ Chuẩn Nhân vật (Character Cardinal Space):
     * Trục X (Pitch): Đùi (LeftUpLeg/RightUpLeg) x âm (-20..-100) nâng chân lên trước, x dương đưa ra sau; Đầu gối (LeftLeg/RightLeg) x dương (+15..+100) gập gối về sau (không dùng x âm); Cánh tay (LeftArm/RightArm) & Khuỷu tay (LeftForeArm/RightForeArm) x âm (-20..-100) đưa/gập tay lên trước ngực; Cột sống & Đầu (Hips/Spine02/Spine01/Spine/neck/Head) x dương (+10..+45) cúi về trước.
     * Trục Y (Yaw): y dương xoay phải, y âm xoay trái.
     * Trục Z (Roll): LeftArm z dương (+15..+80) nâng giang tay trái lên cao, z âm (-15..-25) khép sát thân; RightArm z âm (-15..-80) nâng giang tay phải lên cao, z dương (+15..+25) khép sát thân.
     * Vị trí pos (mét, cho Hips): pos.y dương (+0.1..+0.35) bật nhảy, âm (-0.1..-0.4) nhún/ngồi; pos.x dịch ngang.

---
### TRẠNG THÁI HIỆN TẠI:
${JSON.stringify({
  username: this.username,
  character: currentProfile.character,
  props: this.roomProps.map(p => ({
    id: p.id,
    name: p.name,
    shape: p.shape || 'box',
    color: p.color,
    position: p.position,
    rotation: p.rotation,
    scale: p.scale,
    animation: p.animation || 'none',
    visible: p.visible,
    rigBones: p.visible && this.sceneService.hasPropRig(p.id)
      ? this.sceneService.getPropBones(p.id).map(b => b.name)
      : undefined
  }))
}, null, 2)}

---
### LỆNH NGƯỜI DÙNG: "${text}"

---
### YÊU CẦU ĐẦU RA (JSON THUẦN TÚY):
{
  "newProp": {
    "name": "string",
    "shape": "box",
    "color": "#hex",
    "position": { "x": 0, "y": 4.5, "z": 0 },
    "scale": { "x": 1, "y": 1, "z": 1 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "animation": "spin",
    "animSpeed": 45
  },
  "modifyProp": {
    "targetPropId": "string",
    "patch": {}
  },
  "removePropName": null,
  "characterAction": {
    "animationName": "Walk",
    "position": { "x": 0, "y": 4.1, "z": 0 },
    "facingAngle": 0,
    "scale": 1.0,
    "visible": true
  },
  "environment": {
    "background": null,
    "table": null,
    "cloth": null
  },
  "cameraPreset": null,
  "focusPropName": null,
  "applyEffect": null,
  "designBoneAnimation": null,
  "explanation": "Câu mô tả ngắn gọn vui vẻ về những gì bạn vừa tạo/thay đổi trên PlayCanvas"
}`;
        const parts: any[] = [{ text: domainSystemPrompt }];
        if (images && images.length > 0) {
          for (const img of images) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/png',
                data: img.base64
              }
            });
          }
        }

        const aiRes: any = await this.genaiService.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts }],
          config: {
            bypassAiAgent: true,
            disableThinking: true,
            temperature: 0.2
          } as any
        });

        const rawReply =
          aiRes?.text ||
          aiRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
          '';
        if (rawReply) {
          const hasTargetProps = targetProps && targetProps.length > 0;
          const parsed = this.extractJsonFromAiText(rawReply);
          if (parsed) {
            // 🎨 ĐIỀU KHIỂN MÀU MÔI TRƯỜNG SHOWROOM (background, table, cloth)
            if (parsed.environment) {
              this.sceneService.setEnvironmentColors(parsed.environment);
              (currentProfile as any).environment = { ...((currentProfile as any).environment || {}), ...parsed.environment };
              updated = true;
            }

            // 🕺 ĐIỀU KHIỂN HÀNH ĐỘNG & THUỘC TÍNH TOÀN BỘ NHÂN VẬT 3D
            const charAct = parsed.characterAction || {};
            const animName = charAct.animationName || parsed.animationName;
            if (animName) {
              const lowerAnim = animName.toLowerCase();
              const anim = this.userAnimations.find(a => a.name.toLowerCase() === lowerAnim) ||
                           this.userAnimations.find(a => lowerAnim.includes(a.name.toLowerCase()));
              if (anim) {
                this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
                currentProfile.character.animationState = anim.name;
                updated = true;
              } else if (lowerAnim.includes('idle') || lowerAnim.includes('đứng') || lowerAnim.includes('dừng')) {
                const idleAnim = this.userAnimations.find(a => a.name.toLowerCase().includes('idle')) || this.userAnimations[0];
                if (idleAnim) {
                  this.setAnimation(idleAnim.name, idleAnim.glbPath, false, 0);
                  currentProfile.character.animationState = idleAnim.name;
                  updated = true;
                }
              }
            }
            const charPos = charAct.position || parsed.position;
            if (charPos) {
              currentProfile.character.position = charPos;
              this.sceneService.setCharacterTransform({ position: charPos });
              updated = true;
            }
            const charAngle = typeof charAct.facingAngle === 'number' ? charAct.facingAngle : parsed.facingAngle;
            if (typeof charAngle === 'number') {
              currentProfile.character.facingAngle = charAngle;
              this.sceneService.setCharacterTransform({ facingAngle: charAngle });
              updated = true;
            }
            const charScale = typeof charAct.scale === 'number' ? charAct.scale : parsed.scale;
            if (typeof charScale === 'number') {
              currentProfile.character.scale = charScale;
              this.sceneService.setCharacterTransform({ scale: charScale });
              updated = true;
            }
            if (typeof charAct.visible === 'boolean') {
              this.sceneService.setCharacterVisibility(charAct.visible);
              updated = true;
            }
            // ONLY update global scene / character IF NO target prop was mentioned (@mention)
            if (!hasTargetProps) {
              if (parsed.lightsOn !== null && parsed.lightsOn !== undefined) {
                currentProfile.scene.lightsOn = parsed.lightsOn;
                this.sceneService.clickLightSwitch(parsed.lightsOn);
                updated = true;
              }
              if (parsed.animationName) {
                const anim = this.userAnimations.find(a => a.name.toLowerCase() === parsed.animationName.toLowerCase());
                if (anim) {
                  this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
                  currentProfile.character.animationState = anim.name;
                  updated = true;
                }
              }
              if (parsed.scale !== null && parsed.scale !== undefined) {
                currentProfile.character.scale = parsed.scale;
                updated = true;
              }
              if (parsed.facingAngle !== null && parsed.facingAngle !== undefined) {
                currentProfile.character.facingAngle = parsed.facingAngle;
                updated = true;
              }
              if (parsed.position) {
                currentProfile.character.position = parsed.position;
                updated = true;
              }
              if (parsed.cameraPreset) {
                this.setCameraPreset(parsed.cameraPreset);
                updated = true;
              }
            }
            if (parsed.disableTrigger) {
              if (!Array.isArray((currentProfile as any).disabledEvents)) {
                (currentProfile as any).disabledEvents = [];
              }
              if (!(currentProfile as any).disabledEvents.includes(parsed.disableTrigger)) {
                (currentProfile as any).disabledEvents.push(parsed.disableTrigger);
              }
              this.sceneService.setDisabledTriggers((currentProfile as any).disabledEvents);
              updated = true;
            }
            if (parsed.enableTrigger) {
              if (Array.isArray((currentProfile as any).disabledEvents)) {
                (currentProfile as any).disabledEvents = (currentProfile as any).disabledEvents.filter((t: string) => t !== parsed.enableTrigger);
              }
              this.sceneService.setDisabledTriggers((currentProfile as any).disabledEvents);
              updated = true;
            }
            if (parsed.modifyProp) {
              const mod = parsed.modifyProp;
              const targetId = mod.targetPropId || mod.targetPropName || '';
              const targetName = targetId.toLowerCase();
              const liveProp = (targetProps && targetProps.length > 0)
                ? this.roomProps.find(p => p.id === targetProps[0].id)
                : this.roomProps.find(p => p.id === targetId || (p.name && p.name.toLowerCase().includes(targetName)));

              if (liveProp) {
                const patch = mod.patch || { ...mod };
                delete patch.targetPropId;
                delete patch.targetPropName;
                delete patch.patch;

                this.deepMergeProp(liveProp, patch);

                if (!Array.isArray(liveProp.events)) liveProp.events = [];
                const isMonitor = (liveProp.id && liveProp.id.includes('monitor')) || (liveProp.name && liveProp.name.toLowerCase().includes('màn hình'));
                const txtLower = text.toLowerCase();

                // If user prompt explicitly requests date/time clock ("ngày", "giờ", "thời gian", "đồng hồ", "clock", "time"):
                if (isMonitor && (txtLower.includes('giờ') || txtLower.includes('thời gian') || txtLower.includes('đồng hồ') || txtLower.includes('clock') || txtLower.includes('time'))) {
                  liveProp.activeScreenState = 'clock';
                  if (liveProp.screenOptions) {
                    delete liveProp.screenOptions.screenText;
                    delete liveProp.screenOptions.imageUrl;
                  }
                }
                
                // Extract image file path if prompt contains a local file path / URL
                const imgMatch = text.match(/([a-zA-Z0-9_\-\/\\.]+\.(?:png|jpg|jpeg|webp|gif))/i);
                if (isMonitor && imgMatch) {
                  const pathFound = imgMatch[1];
                  liveProp.activeScreenState = 'image';
                  if (!liveProp.screenOptions) liveProp.screenOptions = {};
                  liveProp.screenOptions.imageUrl = pathFound;
                  delete liveProp.screenOptions.screenText;
                }

                if (isMonitor) {
                  let side: 'left' | 'right' | 'both' = 'both';
                  if (liveProp.id && liveProp.id.includes('left')) side = 'left';
                  else if (liveProp.id && liveProp.id.includes('right')) side = 'right';
                  this.sceneService.showDateTimeOnMonitor(side, liveProp.screenOptions);
                }

                if (patch.color) liveProp._customColorSet = true;
                if (patch.position) liveProp._customPositionSet = true;
                if (patch.scale) liveProp._customScaleSet = true;
                if (patch.rotation) liveProp._customRotationSet = true;
                if (patch.shape) liveProp.shape = patch.shape;
                if (patch.animation) liveProp.animation = patch.animation;
                if (typeof patch.animSpeed === 'number') liveProp.animSpeed = patch.animSpeed;

                this.syncPropTo3DScene(liveProp);
                this.sceneService.syncProps(this.roomProps);

                this.profileDataService.saveProps(this.roomProps).subscribe();
                this.cdr.markForCheck();
                updated = true;
                message = parsed.explanation || `✨ AI Agent đã cập nhật đồ vật "${liveProp.name}"!`;
              }
            }

            if (parsed.newProp) {
              const propObj = parsed.newProp;
              const newProp = {
                id: 'prop_' + Date.now(),
                name: propObj.name || 'Đồ vật mới AI',
                category: propObj.category || 'custom',
                shape: propObj.shape || 'box',
                color: propObj.color || '#06b6d4',
                position: propObj.position || { x: 0, y: 0, z: 0 },
                rotation: propObj.rotation || { x: 0, y: 0, z: 0 },
                scale: propObj.scale || { x: 0.8, y: 0.8, z: 0.8 },
                animation: propObj.animation || 'none',
                animSpeed: typeof propObj.animSpeed === 'number' ? propObj.animSpeed : (propObj.animation === 'spin' ? 45 : 2.5),
                _customPositionSet: true,
                _customScaleSet: true,
                _customRotationSet: true,
                _customColorSet: true,
                visible: true,
                events: Array.isArray(propObj.events) && propObj.events.length > 0
                  ? propObj.events
                  : (propObj.customScript ? [{ id: 'evt_' + Date.now(), name: 'Sự kiện click', type: 'custom', customScript: propObj.customScript, createdAt: new Date().toISOString() }] : []),
                subDevices: propObj.subDevices || []
              };
              this.roomProps.push(newProp);
              (this.profile as any).props = this.roomProps;
              this.profileDataService.saveProps(this.roomProps).subscribe();
              this.sceneService.syncProps(this.roomProps);
              this.onSearchChange();
              this.cdr.markForCheck();
              updated = true;
            }
            if (parsed.attachSubDeviceToProp) {
              const targetName = parsed.attachSubDeviceToProp.targetPropName || '';
              const targetProp = this.roomProps.find(p => p.name && p.name.toLowerCase().includes(targetName.toLowerCase())) || this.roomProps[0];
              if (targetProp) {
                if (!targetProp.subDevices) targetProp.subDevices = [];
                const subObj = parsed.attachSubDeviceToProp.subDevice || {};
                const newSub = {
                  id: 'sub_' + Date.now(),
                  name: subObj.name || 'Nút bấm gắn thêm',
                  type: subObj.type || 'button',
                  enabled: true,
                  customScript: subObj.customScript || '',
                  createdAt: new Date().toISOString()
                };
                targetProp.subDevices.push(newSub);
                this.profileDataService.saveProps(this.roomProps).subscribe();
                this.sceneService.syncProps(this.roomProps);
                this.cdr.markForCheck();
                updated = true;
              }
            }
            if (parsed.removePropName) {
              const propIndex = this.roomProps.findIndex(p => p.name && p.name.toLowerCase().includes(parsed.removePropName.toLowerCase()));
              if (propIndex !== -1) {
                const deleted = this.roomProps.splice(propIndex, 1);
                this.profileDataService.saveProps(this.roomProps).subscribe();
                this.onSearchChange();
                this.cdr.markForCheck();
                updated = true;
              }
            }
            if (parsed.removeSubDeviceName) {
              for (const p of this.roomProps) {
                if (p.subDevices && p.subDevices.length > 0) {
                  const subIdx = p.subDevices.findIndex((s: any) => s.name && s.name.toLowerCase().includes(parsed.removeSubDeviceName.toLowerCase()));
                  if (subIdx !== -1) {
                    p.subDevices.splice(subIdx, 1);
                    this.profileDataService.saveProps(this.roomProps).subscribe();
                    this.cdr.markForCheck();
                    updated = true;
                    break;
                  }
                }
              }
            }
            // 🌟 HIỆU ỨNG SCRIPT PLAYCANVAS (tuyết rơi, lá rơi, đom đóm...) — thực thi code JS thật
            if (parsed.applyEffect) {
              const fxCmds = Array.isArray(parsed.applyEffect) ? parsed.applyEffect : [parsed.applyEffect];
              const fxSpecs: any[] = [];
              for (const f of fxCmds) {
                if (!f || !f.script) continue;
                const ok = this.sceneService.runEffect({
                  name: f.name || 'custom',
                  targetPropId: f.targetPropId || null,
                  targetPropName: f.targetPropName || null,
                  params: f.params || {},
                  script: f.script
                });
                if (ok) fxSpecs.push(f);
              }
              if (fxSpecs.length > 0) {
                // Hieu ung chi choi trong phien hien tai: KHONG ghi vao profile
                // de tranh tu dong chay lai moi lan mo app / F5
                updated = true;
                message = 'AI đã kích hoạt hiệu ứng "' + (fxSpecs[0].name || 'custom') + '" trong scene 3D PlayCanvas!';
              }
            }
            if (parsed.designBoneAnimation) {
              const dba = parsed.designBoneAnimation;
              const targetPid =
                dba.targetPropId ||
                (targetProps && targetProps[0]?.id) ||
                this.timelinePropId ||
                this.selectedPropId ||
                this.roomProps.find((p) => p && p.visible && this.sceneService.hasPropRig(p.id))?.id;
              if (targetPid && this.sceneService.hasPropRig(targetPid)) {
                const count = this.sceneService.applyGeneratedBoneTimeline(targetPid, dba);
                if (count > 0) {
                  this.openPropTimeline(targetPid);
                  this.saveTimelineToProp(true);
                  updated = true;
                  message = parsed.explanation || `AI đã thiết kế xong ${count} Keyframe chuyển động khớp xương!`;
                }
              }
            }
            if (parsed.explanation) {
              message = parsed.explanation;
            }
          }
        }
      } catch (aiErr: any) {
        console.warn('[Profile] AI Agent Service call error:', aiErr?.message || aiErr);
      }

    // Fallback thiết kế chuyển động khớp xương khi đính kèm Video mẫu hoặc yêu cầu diễn hoạt xương
    if (
      !updated &&
      (this.aiMotionVideoFrames.length > 0 ||
        /moonwalk|trượt|keyframe|khớp xương|chuyển động|diễn hoạt|đá|kick|đấm|boxing|võ|kungfu|cúi|chào|vẫy|wave|nhảy|dance|hiphop|jump|ngồi|squat|thụt dầu|xoay người|quay người|spin|giơ tay|ăn mừng|vỗ tay|clap|gật đầu|lắc đầu|đi bộ|walk|chạy|run|thuyết trình|tạo dáng|pose/.test(lower))
    ) {
      const targetPid =
        (targetProps && targetProps[0]?.id) ||
        this.timelinePropId ||
        this.selectedPropId ||
        this.roomProps.find((p) => p && p.visible && this.sceneService.hasPropRig(p.id))?.id;
      if (targetPid && this.sceneService.hasPropRig(targetPid)) {
        const energies = this.aiMotionVideoFrames.map((f) => f.energy);
        const dur = this.aiMotionVideoDuration > 0 ? this.aiMotionVideoDuration : 2.4;
        const count = this.sceneService.generateSmartBoneMotion(
          targetPid,
          text,
          dur,
          energies,
          this.aiMotionPoseSamples
        );
        if (count > 0) {
          this.openPropTimeline(targetPid);
          this.saveTimelineToProp(true);
          updated = true;
          message = `AI đã thiết kế ${count} Keyframe chuyển động khớp xương và phát trên Timeline!`;
        }
      }
    }

    const hasTargetProps = targetProps && targetProps.length > 0;

    // Local fallback rules run ONLY when NO target prop is mentioned (@mention)
    if (!updated && !hasTargetProps) {
      if (lower.includes('đi bộ') || lower.includes('walk')) {
        const anim = this.userAnimations.find(a => a.name.toLowerCase().includes('đi bộ') || a.name.toLowerCase().includes('walk'));
        if (anim) {
          this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
          currentProfile.character.animationState = anim.name;
          updated = true;
          message = `🏃 AI đã đổi hành động nhân vật sang: ${anim.name}!`;
        }
      } else if (lower.includes('đứng') || lower.includes('idle') || lower.includes('dừng lại')) {
        const anim = this.userAnimations.find(a => a.name.toLowerCase().includes('đứng') || a.name.toLowerCase().includes('idle'));
        if (anim) {
          this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
          currentProfile.character.animationState = anim.name;
          updated = true;
          message = `🧍 AI đã chuyển nhân vật sang trạng thái đứng yên!`;
        }
      }
    }

    // 🎛️ 4. Xoay / Điều chỉnh Đồ vật hoặc Tạo nút bấm / Kịch bản sự kiện cho Đồ vật được chỉ định (@mention)
    const activeProps = targetProps && targetProps.length > 0 ? targetProps : this.attachedProps;
    if (!updated && (lower.includes('nút') || lower.includes('bấm') || lower.includes('sự kiện') || lower.includes('chuyển đổi') || lower.includes('màn hình cảm ứng') || lower.includes('tivi'))) {
      const liveProp = (activeProps && activeProps.length > 0)
        ? this.roomProps.find(p => p.id === activeProps[0].id)
        : this.roomProps.find(p => p.name && (lower.includes(p.name.toLowerCase()) || (p.name.toLowerCase().includes('cửa sổ') && lower.includes('cửa sổ'))));
      
      if (liveProp) {
        if (!liveProp.events) liveProp.events = [];
        if (!liveProp.subDevices) liveProp.subDevices = [];

        const scriptText = lower.includes('màn hình cảm ứng') ? 'Chuyển đổi Cửa sổ thành màn hình cảm ứng' : text;
        const btnName = lower.includes('tivi') || lower.includes('tv') ? 'Nút Tắt/Mở TV Cửa Sổ 21:9' : 'Nút bấm tuỳ chỉnh AI';

        const newEvt = {
          id: 'btn_' + Date.now(),
          name: btnName,
          type: 'custom',
          customScript: scriptText,
          createdAt: new Date().toISOString()
        };
        liveProp.events.push(newEvt);

        this.profileDataService.saveProps(this.roomProps).subscribe();
        this.sceneService.syncProps(this.roomProps);
        if (lower.includes('tivi') || lower.includes('tv') || lower.includes('iframe') || lower.includes('màn hình')) {
          this.sceneService.toggleWindowTvIframe(true, 'https://type.vn');
        }
        this.cdr.markForCheck();
        updated = true;
        message = `✨ AI Agent đã tạo 3D Sub-button & kịch bản "${btnName}" trên "${liveProp.name}"!`;
      } else if (lower.includes('tạo') || lower.includes('thêm')) {
        const scriptText = lower.includes('màn hình cảm ứng') ? 'Chuyển đổi Cửa sổ thành màn hình cảm ứng' : text;
        const btnName = lower.includes('màn hình cảm ứng') ? 'Nút bấm Tivi cảm ứng' : 'Đồ vật/Nút bấm mới AI';
        const newProp = {
          id: 'prop_' + Date.now(),
          name: btnName,
          category: 'button',
          color: '#06b6d4',
          position: { x: 0, y: 1.2, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 0.4, y: 0.4, z: 0.4 },
          visible: true,
          events: [
            {
              id: 'btn_' + Date.now(),
              name: 'Sự kiện click',
              type: 'custom',
              customScript: scriptText,
              createdAt: new Date().toISOString()
            }
          ],
          subDevices: []
        };
        this.roomProps.push(newProp);
        (this.profile as any).props = this.roomProps;
        this.profileDataService.saveProps(this.roomProps).subscribe();
        this.sceneService.syncProps(this.roomProps);
        this.onSearchChange();
        this.cdr.markForCheck();
        updated = true;
        message = `✨ AI Agent đã tự động tạo Đồ vật/Nút bấm mới "${btnName}" kèm kịch bản sự kiện "${scriptText}"!`;
      }
    }

    if (activeProps && activeProps.length > 0) {
      for (const targetProp of activeProps) {
        const liveProp = this.roomProps.find(p => p.id === targetProp.id);
        if (liveProp) {
          const isMonitor = liveProp.id.includes('monitor') || (liveProp.name && liveProp.name.toLowerCase().includes('màn hình'));
          const hasColorIntent = lower.includes('màu') || lower.includes('nền') || lower.includes('color') || lower.includes('bg') || lower.includes('sơn');

          if (isMonitor && (lower.includes('nhảy') || lower.includes('đồng hồ') || lower.includes('thời gian') || lower.includes('chạy'))) {
            let side: 'left' | 'right' | 'both' = 'both';
            if (liveProp.id.includes('left') || (liveProp.name && liveProp.name.toLowerCase().includes('trái'))) side = 'left';
            else if (liveProp.id.includes('right') || (liveProp.name && liveProp.name.toLowerCase().includes('phải'))) side = 'right';

            liveProp.activeScreenState = 'clock';
            this.sceneService.showDateTimeOnMonitor(side, liveProp.screenOptions);
            this.sceneService.updateProp(liveProp);
            this.profileDataService.saveProps(this.roomProps).subscribe();
            updated = true;
            message = `⏰ AI đã kích hoạt & phát đồng hồ nhảy số realtime trên "${liveProp.name}"!`;
          } else if (hasColorIntent || isMonitor) {
            const colorInfo = this.extractColorAndBgFromText(text);
            if (isMonitor) {
              let side: 'left' | 'right' | 'both' = 'both';
              if (liveProp.id.includes('left') || (liveProp.name && liveProp.name.toLowerCase().includes('trái'))) side = 'left';
              else if (liveProp.id.includes('right') || (liveProp.name && liveProp.name.toLowerCase().includes('phải'))) side = 'right';

              const newBgColor = colorInfo.bgColor || colorInfo.color || '#831843';
              const screenOpts = {
                ...(liveProp.screenOptions || {}),
                bgColor: newBgColor
              };
              liveProp.activeScreenState = 'clock';
              liveProp.screenOptions = screenOpts;
              this.sceneService.showDateTimeOnMonitor(side, screenOpts);
              this.sceneService.updateProp(liveProp);
              this.profileDataService.saveProps(this.roomProps).subscribe();
              updated = true;
              message = `🎨 AI đã đổi màu nền màn hình 3D "${liveProp.name}" sang màu ${colorInfo.colorName || 'mới'}!`;
            } else if (colorInfo.color) {
              liveProp.color = colorInfo.color;
              liveProp._customColorSet = true;
              this.sceneService.updateProp(liveProp);
              this.profileDataService.saveProps(this.roomProps).subscribe();
              updated = true;
              message = `🎨 AI đã đổi màu đồ vật 3D "${liveProp.name}" sang màu ${colorInfo.colorName || colorInfo.color}!`;
            }
          }

          if (lower.includes('xoay') || lower.includes('quay') || lower.includes('ngược') || lower.includes('đổi')) {
            if (!liveProp.rotation) liveProp.rotation = { x: 0, y: 0, z: 0 };
            liveProp.rotation.y = (liveProp.rotation.y + 180) % 360;
            liveProp._modifiedPosition = true;
            this.sceneService.updateProp(liveProp);
            updated = true;
            message = `🔄 AI đã xoay 180° đồ vật chỉ định "${liveProp.name}"!`;
          }
          if (lower.includes('phóng to') || lower.includes('lớn')) {
            if (!liveProp.scale) liveProp.scale = { x: 1, y: 1, z: 1 };
            liveProp.scale.x *= 1.3;
            liveProp.scale.y *= 1.3;
            liveProp.scale.z *= 1.3;
            liveProp._modifiedPosition = true;
            this.sceneService.updateProp(liveProp);
            updated = true;
            message = `🔍 AI đã phóng to đồ vật chỉ định "${liveProp.name}"!`;
          }
        }
      }
    } else if (!updated) {
      // 🔍 Kiểm tra xem tên đồ vật có xuất hiện trực tiếp trong prompt không (ví dụ @Ghế xoay phải)
      for (const p of this.roomProps) {
        if (p.name && lower.includes(p.name.toLowerCase())) {
          if (lower.includes('xoay') || lower.includes('quay') || lower.includes('ngược') || lower.includes('đổi')) {
            if (!p.rotation) p.rotation = { x: 0, y: 0, z: 0 };
            p.rotation.y = (p.rotation.y + 180) % 360;
            p._modifiedPosition = true;
            this.sceneService.updateProp(p);
            updated = true;
            message = `🔄 AI đã xoay 180° đồ vật "${p.name}"!`;
            break;
          }
        }
      }
    }

    if (!updated && (lower.includes('ghế') || lower.includes('chair'))) {
      // Chỉ chạy khi KHÔNG chỉ định đồ vật cụ thể
      if (lower.includes('quay') || lower.includes('xoay') || lower.includes('ngược') || lower.includes('đổi hướng')) {
        let chairs = this.roomProps.filter(p =>
          p.id.includes('chair') || (p.name && p.name.toLowerCase().includes('ghế'))
        );
        if (lower.includes('trái') || lower.includes('left')) {
          chairs = chairs.filter(c => c.id.includes('left') || (c.name && c.name.toLowerCase().includes('trái')));
        } else if (lower.includes('phải') || lower.includes('right')) {
          chairs = chairs.filter(c => c.id.includes('right') || (c.name && c.name.toLowerCase().includes('phải')));
        }

        if (chairs.length > 0) {
          chairs.forEach(c => {
            if (!c.rotation) c.rotation = { x: 0, y: 0, z: 0 };
            c.rotation.y = (c.rotation.y + 180) % 360;
            c._modifiedPosition = true;
            this.sceneService.updateProp(c);
          });
          updated = true;
          message = `🪑 AI đã xoay 180° (${chairs.map(c => c.name).join(', ')}) và tự động lưu!`;
        }
      }
    }


    // Gắn thông báo nếu chưa có hành động cụ thể nào khớp
    if (!updated) {
      message = `✨ AI đã xử lý xong yêu cầu "${text}" và cập nhật lại 3D Canvas!`;
    }

    // 🚀 1. CẬP NHẬT TỨC THÌ (REALTIME) LÊN CANVAS 3D PLAYCANVAS
    (currentProfile as any).props = this.roomProps;
    this.profile = currentProfile;
    this.sceneService.applyProfile(currentProfile, { skipCamera: true });
    this.sceneService.syncProps(this.roomProps);

    // 💾 2. TỰ ĐỘNG LƯU TRỰC TIẾP VÀO THƯ MỤC Documents/ai.type/data/profiles/{username}/ (props.json, character.json, room.json, profile.json)
    try {
      await this.profileDataService.saveProps(this.roomProps).toPromise();
      await this.profileDataService.saveProfile(currentProfile).toPromise();
      if (currentProfile.character) {
        await this.profileDataService.saveCharacter(currentProfile.character).toPromise();
      }
      if (currentProfile.scene) {
        await this.profileDataService.saveScene(currentProfile.scene).toPromise();
      }
    } catch (saveErr) {
      console.warn('[Profile] Error auto-saving profile files:', saveErr);
    }

      this.toastr.success('Đã cập nhật 3D!', 'Thành công', { timeOut: 1500 });
    } finally {
      this.isProcessingPrompt = false;
      this.cdr.markForCheck();
    }
  }

  /** Enter = gửi, Shift+Enter = xuống dòng */
  onPromptEnter(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendPrompt();
    }
  }

  /** Xử lý khi user chọn file GLB */
  async onGlbSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    // Reset
    input.value = '';
    this.uploadError = null;
    this.isUploading = true;
    this.cdr.markForCheck();

    try {
      // Upload qua Electron IPC → lưu vào ~/Documents/ai.type/data/profiles/{username}/assets/{username}.glb
      const result = await this.profileDataService.uploadCharacterGlb(file).toPromise();
      if (!result?.glbPath) throw new Error('Không nhận được đường dẫn GLB');

      // Revoke blob URL cũ nếu có
      if (this._charBlobUrl) { URL.revokeObjectURL(this._charBlobUrl); this._charBlobUrl = null; }

      // Đọc file vừa lưu thành Blob URL và load vào scene ngay
      const blobUrl = await this.profileDataService.readGlbAsObjectUrl(result.glbPath).toPromise();
      if (blobUrl) {
        this._charBlobUrl = blobUrl;
        this.sceneService.loadCharacterFromBlobUrl(blobUrl);
      }

      this.isUploading = false;
      this.cdr.markForCheck();
    } catch (err: any) {
      console.error('[Profile] Upload GLB error:', err);
      this.uploadError = 'Upload thất bại: ' + (err?.message ?? 'Lỗi không xác định');
      this.isUploading = false;
      this.cdr.markForCheck();
    }
  }

  /** Upload ảnh lên khung trên tường */
  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    try {
      // Đọc file thành ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Lưu qua Electron IPC vào ~/Documents/ai.type/data/profiles/{username}/assets/wall_photo.jpg
      if ((window as any).electron?.saveWallPhoto) {
        await (window as any).electron.saveWallPhoto(this.username, arrayBuffer);
      }

      // Load blob URL vào scene ngay lập tức
      const blob = new Blob([arrayBuffer], { type: file.type || 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      this.sceneService.loadPhotoTexture(blobUrl);
    } catch (err: any) {
      console.error('[Profile] Upload photo error:', err);
    }
  }

  triggerAvatarUpload(): void {
    this.avatarFileInput?.nativeElement?.click();
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop() || 'png';

      // Lưu qua Electron IPC vào ~/Documents/ai.type/data/profiles/{username}/assets/avatar.{ext}
      if ((window as any).electron?.saveAvatar) {
        await (window as any).electron.saveAvatar(this.username, arrayBuffer, ext);
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        const dataUrl = e.target.result;
        this.charThumbnail = dataUrl;
        localStorage.setItem(`profile_avatar_${this.username}`, dataUrl);
        this.toastr.success('Đã lưu ảnh đại diện vào thư mục profile!');
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('[Profile] Save avatar error:', err);
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = !!document.fullscreenElement;
    this.cdr.markForCheck();
  }

  toggleFullScreen(): void {
    const elem = this.sceneContainerRef?.nativeElement || document.querySelector('.profile-scene-wrap');
    if (!elem) return;

    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().then(() => {
          this.isFullscreen = true;
          this.cdr.markForCheck();
        }).catch(err => console.error(err));
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          this.isFullscreen = false;
          this.cdr.markForCheck();
        }).catch(err => console.error(err));
      }
    }
  }

  async reloadScene(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    try {
      if (this.sceneService) {
        try {
          this.sceneService.destroyScene();
        } catch (_) {}
        this.selectedPropId = null;
        this.selectedPropPos = null;
        this.selectedPropRot = null;
        this.selectedPropScl = null;

        await new Promise(r => setTimeout(r, 200));

        let charGlbObjectUrl: string | null = null;
        if (this.profile?.character?.glbPath) {
          charGlbObjectUrl = await this.profileDataService.readGlbAsObjectUrl(this.profile.character.glbPath).toPromise() ?? null;
        }
        await this.sceneService.initScene(this.canvasRef.nativeElement, this.profile, charGlbObjectUrl);
      this.sceneService.rerunAllFxEffects();
        await this.loadSavedPropGlbs();
        const defaultAnimState = this.profile?.character?.animationState;
        if (defaultAnimState) {
          const found = this.userAnimations.find(a => a.name === defaultAnimState);
          if (found) {
            this.setAnimation(found.name, found.glbPath, found.isMovement, found.speed);
          }
        }
      }
      this.toastr.success('Đã tải lại Căn phòng 3D!');
    } catch (e) {
      console.error('[Profile] Reload scene error:', e);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  isRecording = false;
  recordingSeconds = 0;
  recordingTimerText = '00:00';
  private _recordingTimerInterval: any = null;
  private _frameExportInterval: any = null;
  private _mediaRecorder: any = null;
  private _recordedChunks: Blob[] = [];
  private _currentExportSessionFolder = '';

  formatTimer(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  async toggleVideoRecording(): Promise<void> {
    if (!this.isRecording) {
      await this.startVideoRecording();
    } else {
      await this.stopVideoRecording();
    }
  }

  async startVideoRecording(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      this.toastr.error('Không tìm thấy Canvas 3D!');
      return;
    }

    this.isRecording = true;
    this.recordingSeconds = 0;
    this.recordingTimerText = '00:00';
    this._recordedChunks = [];
    this._currentExportSessionFolder = `export_${new Date().toISOString().replace(/[:.]/g, '-')}`;

    // Start timer interval
    this._recordingTimerInterval = setInterval(() => {
      this.recordingSeconds++;
      this.recordingTimerText = this.formatTimer(this.recordingSeconds);
      this.cdr.markForCheck();
    }, 1000);

    // 1. Setup MediaRecorder for WebM video export
    try {
      const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
      if (stream && typeof MediaRecorder !== 'undefined') {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');

        this._mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        this._mediaRecorder.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) {
            this._recordedChunks.push(e.data);
          }
        };
        this._mediaRecorder.start(100);
      }
    } catch (e) {
      console.warn('[Profile] MediaRecorder initialization warning:', e);
    }

    // 2. Setup frame-by-frame PNG extraction into Documents/ai.type/data/profiles/{user}/exports/{session}/
    let frameIndex = 0;
    this._frameExportInterval = setInterval(async () => {
      if (!this.isRecording || !canvas) return;
      frameIndex++;
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          if ((window as any).electron?.saveExportFrame) {
            await (window as any).electron.saveExportFrame(this.username, this._currentExportSessionFolder, frameIndex, bytes.buffer);
          }
        }
      } catch (_) {}
    }, 100); // 10 frames per second

    this.toastr.success(`Đang bắt đầu quay phim & xuất frames vào Documents/ai.type/data/profiles/${this.username}/exports/!`, 'Bắt đầu xuất Video');
    this.cdr.markForCheck();
  }

  async stopVideoRecording(): Promise<void> {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this._recordingTimerInterval) {
      clearInterval(this._recordingTimerInterval);
      this._recordingTimerInterval = null;
    }
    if (this._frameExportInterval) {
      clearInterval(this._frameExportInterval);
      this._frameExportInterval = null;
    }

    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.onstop = async () => {
        await this.saveRecordedVideoBlob();
      };
      this._mediaRecorder.stop();
    } else {
      await this.saveRecordedVideoBlob();
    }

    this.cdr.markForCheck();
  }

  private async saveRecordedVideoBlob(): Promise<void> {
    try {
      if (this._recordedChunks && this._recordedChunks.length > 0) {
        const blob = new Blob(this._recordedChunks, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const videoName = `video_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

        if ((window as any).electron?.saveExportVideo) {
          const res = await (window as any).electron.saveExportVideo(this.username, arrayBuffer, videoName);
          if (res?.success) {
            this.toastr.success(`Đã lưu video thành công: ${res.filePath}`, 'Xuất Video Hoàn Tất', { timeOut: 8000 });
            return;
          }
        }
      }
      this.toastr.success(`Đã lưu các frame hình ảnh thành công vào Documents/ai.type/data/profiles/${this.username}/exports/${this._currentExportSessionFolder}!`, 'Xuất Frames Hoàn Tất', { timeOut: 8000 });
    } catch (e) {
      console.error('[Profile] Save video error:', e);
    }
  }

  exportVideo(): void {
    this.toggleVideoRecording();
  }

  // ═══════════════════════════════════════════════════════════════
  // QUẢN LÝ MẪU THIẾT KẾ 3D (Design Presets)
  // ═══════════════════════════════════════════════════════════════

  /** Nạp danh sách mẫu thiết kế từ backend */
  loadDesignPresets(): void {
    this._design3dService.list().subscribe((res: any) => {
      const list = res?.data || res || [];
      this.designPresets = Array.isArray(list) ? list : [];
      this.cdr.markForCheck();
    });
  }

  /** Snapshot dữ liệu scene hiện tại để lưu */
  private _buildDesignSnapshot(): Design3DSnapshot {
    const currentProfile: any = this.profile || {};
    return {
      props: JSON.parse(JSON.stringify(this.roomProps || [])),
      character: currentProfile.character ? JSON.parse(JSON.stringify(currentProfile.character)) : undefined,
      scene: currentProfile.scene ? JSON.parse(JSON.stringify(currentProfile.scene)) : undefined
    };
  }

  /** Chụp thumbnail từ canvas 3D (PNG base64) */
  private _captureThumbnail(): string | null {
    try {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    } catch (_) {
      return null;
    }
  }

  /** Mở form lưu mẫu thiết kế mới */
  openDesignSaveForm(): void {
    this.newDesignName = 'Thiết kế ' + new Date().toLocaleString('vi-VN');
    this.newDesignDesc = '';
    this.showDesignSaveForm = true;
    this.cdr.markForCheck();
  }

  /** Hủy form lưu */
  cancelDesignSave(): void {
    this.showDesignSaveForm = false;
    this.pendingDesignId = null;
    this.cdr.markForCheck();
  }

  /** Xác nhận lưu: tạo mới hoặc cập nhật (khi pendingDesignId có giá trị) */
  confirmSaveDesign(): void {
    const name = (this.newDesignName || '').trim();
    if (!name) {
      this.toastr.warning('Vui lòng nhập tên mẫu thiết kế.', 'Thiếu thông tin');
      return;
    }
    const snapshot = this._buildDesignSnapshot();
    this.savingDesign = true;

    const save$ = this.pendingDesignId
      ? this._design3dService.save({
          id: this.pendingDesignId,
          name,
          description: this.newDesignDesc || '',
          sceneData: snapshot
        })
      : this._design3dService.save({ name, description: this.newDesignDesc || '', sceneData: snapshot });

    save$.subscribe((res: any) => {
      this.savingDesign = false;
      const ok = res?.success !== false && res?.error === undefined || res?.success === true;
      if (ok) {
        // Xác định designId: ưu tiên res.data, sau đó pendingDesignId, sau đó tự sinh
        const designId = res?.data?.id || res?.data?.designId || this.pendingDesignId || ('design_' + Date.now());
        const thumb = this._captureThumbnail();
        if (thumb) {
          this._design3dService.saveThumbnail(designId, thumb).subscribe(() => {
            this.loadDesignPresets();
          });
        } else {
          this.loadDesignPresets();
        }
        this.showDesignSaveForm = false;
        this.pendingDesignId = null;
        this.toastr.success(`Đã lưu mẫu thiết kế "${name}".`, 'Thành công');
      } else {
        this.toastr.error('Không thể lưu mẫu thiết kế. Vui lòng thử lại.', 'Lỗi');
      }
      this.cdr.markForCheck();
    });
  }

  /** Nạp 1 mẫu thiết kế vào cảnh hiện tại */
  async applyDesignPreset(preset: Design3DPreset): Promise<void> {
    if (!preset?.id) return;
    const res: any = await this._design3dService.get(preset.id).toPromise();
    const sceneData = res?.data?.sceneData || res?.data?.data || res?.sceneData;
    if (!sceneData || !Array.isArray(sceneData.props)) {
      this.toastr.error('Mẫu thiết kế không có dữ liệu hợp lệ.', 'Lỗi');
      return;
    }
    try {
      // 1. Cập nhật state props trong component
      this.roomProps = this.mergeProps(sceneData.props);
      (this.profile as any).props = this.roomProps;

      // 2. Nếu có character thì áp vào profile
      if (sceneData.character && this.profile) {
        this.profile.character = { ...this.profile.character, ...sceneData.character };
      }

      // 3. Áp vào scene 3D
      this.sceneService.applyProfile(this.profile, { skipCamera: true });

      // 4. Nạp GLB cho các đồ vật dùng model GLB
      await this.loadSavedPropGlbs();

      // 5. Lưu profile hiện hành + refresh panel đồ vật
      this.profileDataService.saveProps(this.roomProps).subscribe();
      this.profileDataService.saveProfile({ props: this.roomProps } as any).subscribe();
      this.onSearchChange();
      this.cdr.markForCheck();

      this.toastr.success(`Đã nạp mẫu thiết kế "${preset.name}".`, 'Thành công');
    } catch (e) {
      console.error('[Profile] Nạp mẫu thiết kế lỗi:', e);
      this.toastr.error('Không nạp được mẫu thiết kế.', 'Lỗi');
    }
  }

  /** Nhấn nút Lưu trên 1 mẫu có sẵn: nạp form cập nhật */
  updateDesignPreset(preset: Design3DPreset): void {
    this.pendingDesignId = preset.id;
    this.newDesignName = preset.name;
    this.newDesignDesc = preset.description || '';
    this.showDesignSaveForm = true;
    this.cdr.markForCheck();
  }

  /** Nhân bản mẫu thiết kế */
  duplicateDesignPreset(preset: Design3DPreset): void {
    this._design3dService.duplicate(preset.id).subscribe((res: any) => {
      if (res?.success !== false) {
        this.toastr.success(`Đã nhân bản "${preset.name}".`, 'Thành công');
        this.loadDesignPresets();
      } else {
        this.toastr.error('Không thể nhân bản mẫu thiết kế.', 'Lỗi');
      }
    });
  }

  /** Xóa mẫu thiết kế với hộp thoại xác nhận */
  deleteDesignPreset(preset: Design3DPreset, event: Event): void {
    event.stopPropagation();
    const confirmRef = this._fuseConfirmationService.open({
      title: 'Xóa mẫu thiết kế',
      message: `Bạn chắc chắn muốn xóa mẫu "${preset.name}"? Hành động này không thể hoàn tác.`,
      icon: { name: 'delete_forever', color: 'warn' },
      actions: {
        confirm: { label: 'Xóa' },
        cancel: { label: 'Hủy' }
      },
      dismissible: true
    });
    confirmRef.afterClosed().subscribe((result: any) => {
      if (result !== 'confirmed') return;
      this._design3dService.delete(preset.id).subscribe((res: any) => {
        if (res?.success !== false) {
          this.toastr.success(`Đã xóa mẫu "${preset.name}".`, 'Thành công');
          this.loadDesignPresets();
        } else {
          this.toastr.error('Không thể xóa mẫu thiết kế.', 'Lỗi');
        }
      });
    });
  }

  /** Lọc danh sách mẫu theo ô tìm kiếm */
  get filteredDesignPresets(): Design3DPreset[] {
    const q = (this.designSearch || '').toLowerCase().trim();
    if (!q) return this.designPresets;
    return this.designPresets.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q)
    );
  }

  /** Đường dẫn thumbnail hiển thị */
  designThumbUrl(preset: Design3DPreset): string | null {
    if (preset.sceneData?.thumbnail) return preset.sceneData.thumbnail;
    if (preset.thumbnailPath) return preset.thumbnailPath;
    return null;
  }

  get dataService(): ProfileDataService { return this.profileDataService; }

  ngOnDestroy(): void {
    if (this._recordingTimerInterval) clearInterval(this._recordingTimerInterval);
    if (this._frameExportInterval) clearInterval(this._frameExportInterval);
    this._destroy$.next();
    this._destroy$.complete();
    this.sceneService.destroyScene();
    if (this._charBlobUrl) { URL.revokeObjectURL(this._charBlobUrl); }
  }
}
