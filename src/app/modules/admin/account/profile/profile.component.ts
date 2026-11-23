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
import { Router } from '@angular/router';
import { UserService } from 'app/core/user/user.service';
import {
  SontinhSceneService,
  GlbBoneInfo,
  GlbBoneKeyframe,
  GlbPropTimelineData,
  GlbSavedPose,
  VideoFramePoseSample,
  StudioLightingConfig,
  DEFAULT_STUDIO_LIGHTING,
  STUDIO_LIGHTING_PRESETS,
  CaptureScenePropInfo,
  CaptureSceneSummary,
  CameraKeyframe
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
  @ViewChild('photoFileInput') photoFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('audioFileInput') audioFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('textFileInput') textFileInput!: ElementRef<HTMLInputElement>;
  /** Input ẩn nhận file .js chứa mã lệnh PlayCanvas chạy trực tiếp trên canvas */
  @ViewChild('scriptFileInput') scriptFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('propGlbFileInput') propGlbFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('promptFileInput') promptFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('poseRefFileInput') poseRefFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('promptInputArea') promptInputArea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('aiMotionPromptInput') aiMotionPromptInput?: ElementRef<HTMLInputElement>;

  isLoading    = true;
  isProcessingPrompt = false;
  isFullscreen = false;
  isSidebarCollapsed = false;
  loadError: string | null   = null;
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
  // ── Quản lý mẫu thiết kế 3D (design presets) ──
  designPresets: Design3DPreset[] = [];
  designSearch = '';
  savingDesign = false;
  showDesignSaveForm = false;
  newDesignName = '';
  newDesignDesc = '';
  pendingDesignId: string | null = null; // design đang chờ lưu (đã có id từ nút "Lưu lại")

  attachedImages: Array<{ dataUrl: string; base64: string; mimeType: string }> = [];
  attachedScripts: Array<{ name: string; code: string; size: number }> = [];

  private _destroy$    = new Subject<void>();

  constructor(
    private sceneService: SontinhSceneService,
    private profileDataService: ProfileDataService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private toastr: ToastrService,
    private genaiService: GenaiService,
    private _fuseConfirmationService: FuseConfirmationService,
    private _design3dService: Design3DService,
    private router: Router
  ) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      // 1. Lấy username và kiểm tra quyền truy cập màn hình Hồ sơ (chỉ admin hoặc nhóm "làm-phim")
      const user = this.userService.user || await this.userService.user$.pipe(take(1)).toPromise();
      if (!this.userService.canAccessProfile(user)) {
        this.isLoading = false;
        this.loadError = 'Bạn bị từ chối truy cập';
        this.toastr.error('Bạn bị từ chối truy cập', '', {
          timeOut: 4000,
          positionClass: 'toast-top-center'
        });
        this.cdr.markForCheck();
        this.router.navigate(['/tools']);
        return;
      }

      // Theo dõi thay đổi quyền nhóm (VD: vừa bị thu hồi khỏi nhóm "làm-phim" sau đồng bộ nền)
      this.userService.user$
        .pipe(takeUntil(this._destroy$))
        .subscribe((latestUser) => {
          if (latestUser && !this.userService.canAccessProfile(latestUser)) {
            this.isLoading = false;
            this.loadError = 'Bạn bị từ chối truy cập';
            this.toastr.error('Bạn bị từ chối truy cập', '', {
              timeOut: 4000,
              positionClass: 'toast-top-center'
            });
            this.cdr.markForCheck();
            this.router.navigate(['/tools']);
          }
        });
      this.username = user?.name || 'admin';

      const savedSidebarState = localStorage.getItem('profile_sidebar_collapsed');
      if (savedSidebarState !== null) {
        this.isSidebarCollapsed = savedSidebarState === 'true';
      }
      this.isCameraZoomLocked = localStorage.getItem('profile_camera_zoom_locked') === 'true';
      this.isCameraRotateLocked = localStorage.getItem('profile_camera_rotate_locked') === 'true';
      this.sceneService.setCameraZoomLocked(this.isCameraZoomLocked);
      this.sceneService.setCameraRotateLocked(this.isCameraRotateLocked);

      // 2. Load profile từ đĩa qua Electron IPC
      const profile = await this.profileDataService.loadProfile(this.username).toPromise();
      this.profile = profile ?? null;

      // 2a. Nạp danh sách mẫu thiết kế 3D
      this.loadDesignPresets();

      // 2b. Nạp danh sách đồ vật đã lưu NGAY LẬP TỨC (trước khi init scene)
      //     để loadSavedPropGlbs() ở bước 4c có dữ liệu duyệt
      this.roomProps = this.mergeProps((profile as any)?.props || []);
      (this.profile as any).props = this.roomProps;

      // 3. Khởi động 3D scene (mọi mô hình/nhân vật 3D được quản lý thống nhất qua danh sách Đồ vật GLB)
      await this.sceneService.initScene(this.canvasRef.nativeElement, this.profile, null);
      this.lightingConfig = this.sceneService.getStudioLighting();
      this.sceneService.rerunAllFxEffects();

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

      // 4d. Khôi phục mẫu thiết kế đang kích hoạt & toàn bộ trạng thái + lịch sử VIDEO CẢNH 3D sau F5
      const savedSceneObj: any = (this.profile as any)?.scene || (this.profile as any)?.room || {};
      this.activeDesignPresetId = savedSceneObj?.activeDesignPresetId || null;
      if (savedSceneObj?.aiVideo3d) {
        if (this.activeDesignPresetId) {
          this._designAiVideo3dCache.set(this.activeDesignPresetId, JSON.parse(JSON.stringify(savedSceneObj.aiVideo3d)));
        }
        this.restoreAiVideo3dState(savedSceneObj.aiVideo3d);
      }

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

  /** Đổi góc nhìn camera */
  setCameraPreset(preset: string): void {
    (this.sceneService as any).setCameraPreset?.(preset);
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
  onCanvasDeleteProp(event: Event, propId?: string | null): void {
    event.stopPropagation();
    event.preventDefault();
    const pid = propId || this.selectedPropId || this.propActionAnchor.propId;
    if (!pid) return;
    this.sceneService.deletePropById(pid);
  }

  /** Nút Duplicate nổi trên canvas: nhân bản món đang chọn, bản sao đặt cạnh */
  onCanvasDuplicateProp(event: Event, propId?: string | null): void {
    event.stopPropagation();
    event.preventDefault();
    const pid = propId || this.selectedPropId || this.propActionAnchor.propId;
    if (!pid) return;
    this.sceneService.duplicatePropById(pid);
  }

  /** Nut Khóa/Mở khóa nổi trên canvas: chặn kéo + scrub + scale cho tới khi mở khóa */
  onCanvasToggleLock(event: Event, propId?: string | null): void {
    event.stopPropagation();
    event.preventDefault();
    const pid = propId || this.selectedPropId || this.propActionAnchor.propId;
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
  editingClipModal: {
    propId: string;
    originalName: string;
    nameDraft: string;
    isCustom: boolean;
    duration: number;
    kfCount: number;
    aiPrompt: string;
    hasAiSegments: boolean;
    summaryText: string;
    editInstruction: string;
    saveAsNew: boolean;
    isProcessing: boolean;
  } | null = null;
  timelineCurrentTime = 0;
  timelineData: GlbPropTimelineData | null = null;
  private _lastUiTickMs = 0;

  // AI Chỉnh tư thế nhân vật ngay trong bảng Khớp xương
  posePromptText = '';
  isApplyingAiPose = false;
  lastAiPoseExplanation = '';
  isPoseRefDragOver = false;
  savedPoses: GlbSavedPose[] = [];
  activeSavedPoseId: string | null = null;
  isPoseSaveBoxOpen = false;
  poseSaveNameDraft = '';
  private _lastPoseLabelHint = '';
  private _poseAutoSaveTimer: any = null;
  poseRefFiles: Array<{
    id: string;
    name: string;
    kind: 'image' | 'text';
    dataUrl?: string;
    base64?: string;
    mimeType?: string;
    textContent?: string;
  }> = [];
  private _aiPoseUndoStack: Array<{
    propId: string;
    time: number;
    autoKey: boolean;
    snapshot: {
      bones: Array<{
        boneName: string;
        rot: { x: number; y: number; z: number };
        pos: { x: number; y: number; z: number };
      }>;
      keyframes: GlbBoneKeyframe[];
    };
  }> = [];

  get canUndoAiPose(): boolean {
    return (
      this._aiPoseUndoStack.length > 0 &&
      this._aiPoseUndoStack[this._aiPoseUndoStack.length - 1].propId === this.timelinePropId
    );
  }

  get selectedPropHasRig(): boolean {
    const pid = this.selectedPropId || this.propActionAnchor.propId;
    return !!(pid && this.sceneService.hasPropRig(pid));
  }

  // =========================================================================
  // STUDIO TẠO VIDEO AI TỪ CẢNH 3D (ĐA ĐỒ VẬT + HIỆU ỨNG FX + ẢNH MẪU -> MÌ TÔM AI)
  // =========================================================================
  isAiVideo3dOpen = false;
  isCameraZoomLocked = false;
  isCameraRotateLocked = false;

  toggleCameraZoomLock(): void {
    this.isCameraZoomLocked = !this.isCameraZoomLocked;
    this.sceneService.setCameraZoomLocked(this.isCameraZoomLocked);
    try { localStorage.setItem('profile_camera_zoom_locked', String(this.isCameraZoomLocked)); } catch (_) {}
    this.cdr.markForCheck();
  }

  toggleCameraRotateLock(): void {
    this.isCameraRotateLocked = !this.isCameraRotateLocked;
    this.sceneService.setCameraRotateLocked(this.isCameraRotateLocked);
    try { localStorage.setItem('profile_camera_rotate_locked', String(this.isCameraRotateLocked)); } catch (_) {}
    this.cdr.markForCheck();
  }
  aiVideo3dCapturing = false;
  aiVideo3dGenerating = false;
  aiVideo3dStatusText = '';
  aiVideo3dCaptureSec = 0;
  aiVideo3dRefImages: Array<{ name: string; dataUrl: string; mimeType: string; targetKey: string }> = [];
  aiVideo3dPrompt = '';
  aiVideo3dDuration = 5;
  aiVideo3dAspectRatio: '16:9' | '9:16' | '1:1' | '3:4' | '4:3' = '16:9';
  aiVideo3dResolution: '720p' | '1080p' = '720p';
  aiVideo3dHideGrid = true;
  aiVideo3dShowViewfinder = true;
  /** Chế độ khung camera khi ghi 3D: 'keep' giữ góc / quay tay trực tiếp, 'path' chạy mượt qua Camera Keyframes, 'all' gom cả cảnh, 'selected' cận 1 vật */
  aiVideo3dCameraMode: 'keep' | 'path' | 'all' | 'selected' = 'keep';
  aiVideo3dCameraKeyframes: CameraKeyframe[] = [];
  aiVideo3dCameraPreviewing = false;
  aiVideo3dCameraPreviewSec = 0;
  aiVideo3dCameraAiPrompt = '';
  aiVideo3dCameraAiLoading = false;
  aiVideo3dCapturedHasCameraMotion = false;
  aiVideo3dCapturedCameraSummary = '';
  private _aiVideo3dCameraPrePreviewSnap: { pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number } | null = null;
  aiVideo3dSceneProps: CaptureScenePropInfo[] = [];
  aiVideo3dActiveFxNames: string[] = [];
  private _aiVideo3dCapturedSummary: CaptureSceneSummary | null = null;
  aiVideo3dCapturedMp4Base64: string | null = null;
  aiVideo3dCapturedPreviewUrl: string | null = null;
  aiVideo3dCapturedFilePath: string | null = null;
  aiVideo3dResultPreviewUrl: string | null = null;
  aiVideo3dResultFilePath: string | null = null;
  aiVideo3dResultBase64: string | null = null;
  aiVideo3dResultRemoteUrl: string | null = null;
  aiVideo3dHistory: Array<{
    id: string;
    createdAt: number;
    prompt: string;
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1' | '3:4' | '4:3';
    resolution: '720p' | '1080p';
    model?: string;
    capturedFilePath?: string | null;
    resultFilePath?: string | null;
    resultUrl?: string | null;
    refImageCount?: number;
    cameraMode?: 'keep' | 'path' | 'all' | 'selected';
  }> = [];
  aiVideo3dActiveHistoryId: string | null = null;
  activeDesignPresetId: string | null = null;
  private _aiVideo3dSaveTimer: any = null;
  private _aiVideo3dRestoreSeq = 0;
  private _aiVideo3dRestoring = false;
  private _aiVideo3dHasSavedDuration = false;
  private _applyDesignSeq = 0;
  duplicatingDesign = false;
  private _switchingDesignPreset = false;
  private _designAiVideo3dCache = new Map<string, any>();

  get activeDesignPresetName(): string | null {
    if (!this.activeDesignPresetId || !Array.isArray(this.designPresets)) return null;
    const found = this.designPresets.find((p) => p && p.id === this.activeDesignPresetId);
    return found?.name || null;
  }

  readonly aiVideo3dDurationOptions: number[] = [5, 6, 8, 10, 12, 15, 20, 25, 30];
  readonly aiVideo3dRatioOptions: Array<'16:9' | '9:16' | '1:1' | '3:4' | '4:3'> = ['16:9', '9:16', '1:1', '3:4', '4:3'];

  get aiVideo3dAspectRatioValue(): number {
    switch (this.aiVideo3dAspectRatio) {
      case '9:16': return 9 / 16;
      case '1:1':  return 1;
      case '3:4':  return 3 / 4;
      case '4:3':  return 4 / 3;
      default:     return 16 / 9;
    }
  }

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

  refreshAiVideo3dSceneSummary(): CaptureSceneSummary {
    const summary = this.sceneService.getCaptureSceneSummary();
    this.aiVideo3dSceneProps = summary.props;
    this.aiVideo3dActiveFxNames = summary.fxNames;
    // Chỉ đặt lại targetKey khi scene đã nạp xong đồ vật và prop tương ứng thực sự không còn hiển thị
    if (summary.props.length > 0) {
      const validIds = new Set(summary.props.map((p) => p.id));
      const roomVisibleIds = new Set(
        (this.roomProps || []).filter((p) => p && p.visible !== false).map((p) => p.id)
      );
      for (const img of this.aiVideo3dRefImages) {
        if (
          img.targetKey &&
          img.targetKey !== 'auto' &&
          img.targetKey !== 'bg' &&
          !validIds.has(img.targetKey) &&
          !roomVisibleIds.has(img.targetKey)
        ) {
          img.targetKey = 'auto';
        }
      }
    }
    this.cdr.markForCheck();
    return summary;
  }

  getAiVideo3dSpatialLabel(p: CaptureScenePropInfo): string {
    const depthLabel = p.depthLayer === 'front' ? 'phía trước' : (p.depthLayer === 'back' ? 'phía sau' : '');
    const horizLabel = p.screenZone === 'left' ? 'bên trái' : (p.screenZone === 'right' ? 'bên phải' : '');
    if (depthLabel && horizLabel) return `${depthLabel}, ${horizLabel}`;
    if (depthLabel) return depthLabel;
    if (horizLabel) return horizLabel;
    return 'chính giữa';
  }

  focusCharacterForAiVideo(): void {
    const activePid = this.timelinePropId || this.selectedPropId || this.sceneService.getFirstRiggedPropId();
    const frameMode: 'all' | 'selected' = this.aiVideo3dCameraMode === 'selected' ? 'selected' : 'all';
    const ok = this.sceneService.autoFrameSceneForCapture(frameMode, activePid, 0.68, this.aiVideo3dAspectRatio);
    if (!ok) {
      this.toastr.info('Chưa tìm thấy đồ vật hoặc nhân vật 3D đang hiển thị trên canvas.', 'AI Video 3D');
      return;
    }
    requestAnimationFrame(() => this.refreshAiVideo3dSceneSummary());
  }

  setAiVideo3dCameraMode(mode: 'keep' | 'path' | 'all' | 'selected'): void {
    if (mode !== 'path') {
      this.stopCameraPathPreview(false);
    }
    this.aiVideo3dCameraMode = mode;
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
  }

  onAiVideo3dFormatChanged(): void {
    this.stopCameraPathPreview(false);
    this._aiVideo3dHasSavedDuration = true;
    // Tự co giãn thời điểm các mốc Camera Keyframes theo thời lượng mới (nếu có >= 2 mốc)
    const n = this.aiVideo3dCameraKeyframes.length;
    if (n >= 2) {
      const dur = Math.max(4, Number(this.aiVideo3dDuration) || 5);
      const maxOld = Math.max(...this.aiVideo3dCameraKeyframes.map((k) => Number(k.time) || 0));
      if (maxOld > 0.1) {
        const ratio = dur / maxOld;
        this.aiVideo3dCameraKeyframes.forEach((kf) => {
          kf.time = Math.round(Math.max(0, Math.min(dur, (Number(kf.time) || 0) * ratio)) * 10) / 10;
        });
      }
    }
    // Xóa bản ghi cũ nếu đổi tỷ lệ khung hình hoặc thời lượng để lần tạo tiếp theo tự ghi đúng chuẩn mới
    if (this.aiVideo3dCapturedMp4Base64 || this.aiVideo3dCapturedFilePath) {
      this.clearCaptured3dMotionVideo(true);
    }
    this.scheduleSaveAiVideo3dState(true);
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
    this.refreshAiVideo3dSceneSummary();
    // Chỉ tự gợi ý thời lượng theo clip 3D nếu cảnh này chưa có cấu hình/video đã lưu trước đó
    const hasCustomSetup =
      this._aiVideo3dHasSavedDuration ||
      this.aiVideo3dCameraKeyframes.length > 0 ||
      !!this.aiVideo3dCapturedFilePath ||
      this.aiVideo3dHistory.length > 0;
    if (!hasCustomSetup) {
      const activePid = this.timelinePropId || this.selectedPropId || this.sceneService.getFirstRiggedPropId();
      if (activePid) {
        const tl = this.sceneService.getPropTimeline(activePid);
        if (tl && typeof tl.duration === 'number' && tl.duration >= 4) {
          const best = this.aiVideo3dDurationOptions.reduce((prev, curr) =>
            Math.abs(curr - tl.duration) < Math.abs(prev - tl.duration) ? curr : prev
          );
          this.aiVideo3dDuration = best;
        }
      }
    }
    this.isAiVideo3dOpen = true;
    this.cdr.markForCheck();
  }

  closeAiVideo3dStudio(): void {
    this.stopCameraPathPreview(false);
    this.isAiVideo3dOpen = false;
    this.cdr.markForCheck();
  }

  private _base64ToBlobUrl(b64: string, mime = 'video/mp4'): string | null {
    try {
      if (!b64 || typeof b64 !== 'string') return null;
      const clean = b64.includes(',') ? b64.split(',')[1] : b64;
      const bin = atob(clean);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([u8], { type: mime }));
    } catch (_) {
      return null;
    }
  }

  /** Đóng gói toàn bộ dữ liệu & lịch sử VIDEO CẢNH 3D để lưu theo từng mẫu thiết kế và giữ qua F5 */
  private _buildAiVideo3dState(): any {
    const refImages = (this.aiVideo3dRefImages || []).slice(0, 4).map((img) => ({
      name: img.name || 'anh_mau.png',
      dataUrl: img.dataUrl,
      mimeType: img.mimeType || 'image/png',
      targetKey: img.targetKey || 'auto'
    }));
    const cameraKeyframes = (this.aiVideo3dCameraKeyframes || []).map((kf) => ({
      id: kf.id,
      time: Number(kf.time) || 0,
      label: kf.label || '',
      pivot: kf.pivot ? { x: Number(kf.pivot.x) || 0, y: Number(kf.pivot.y) || 0, z: Number(kf.pivot.z) || 0 } : { x: 0, y: 0, z: 0 },
      yaw: Number(kf.yaw) || 0,
      pitch: Number(kf.pitch) || 0,
      distance: Number(kf.distance) || 12,
      easing: kf.easing === 'linear' ? 'linear' : 'smooth'
    }));
    const history = (this.aiVideo3dHistory || []).slice(0, 20).map((h) => ({ ...h }));
    return {
      refImages,
      prompt: this.aiVideo3dPrompt || '',
      duration: Number(this.aiVideo3dDuration) || 5,
      aspectRatio: this.aiVideo3dAspectRatio || '16:9',
      resolution: this.aiVideo3dResolution || '720p',
      hideGrid: !!this.aiVideo3dHideGrid,
      showViewfinder: !!this.aiVideo3dShowViewfinder,
      cameraMode: this.aiVideo3dCameraMode || 'keep',
      cameraKeyframes,
      cameraAiPrompt: this.aiVideo3dCameraAiPrompt || '',
      capturedFilePath: this.aiVideo3dCapturedFilePath || null,
      capturedHasCameraMotion: !!this.aiVideo3dCapturedHasCameraMotion,
      capturedCameraSummary: this.aiVideo3dCapturedCameraSummary || '',
      resultFilePath: this.aiVideo3dResultFilePath || null,
      resultUrl: this.aiVideo3dResultRemoteUrl || null,
      activeHistoryId: this.aiVideo3dActiveHistoryId || null,
      history,
      updatedAt: Date.now()
    };
  }

  /** Lên lịch tự động lưu trạng thái & lịch sử VIDEO CẢNH 3D vào profile.json và mẫu thiết kế đang mở */
  scheduleSaveAiVideo3dState(immediate = false): void {
    if (this._aiVideo3dRestoring || this._switchingDesignPreset) return;
    if (this._aiVideo3dSaveTimer) {
      clearTimeout(this._aiVideo3dSaveTimer);
      this._aiVideo3dSaveTimer = null;
    }
    if (immediate) {
      this._flushSaveAiVideo3dState();
      return;
    }
    this._aiVideo3dSaveTimer = setTimeout(() => {
      this._aiVideo3dSaveTimer = null;
      this._flushSaveAiVideo3dState();
    }, 350);
  }

  private _flushSaveAiVideo3dState(): void {
    void this._flushSaveAiVideo3dStateAsync();
  }

  private async _flushSaveAiVideo3dStateAsync(
    overridePresetId?: string | null,
    overrideState?: any
  ): Promise<void> {
    if (!overrideState && (this._aiVideo3dRestoring || this._switchingDesignPreset)) return;
    const state = overrideState || this._buildAiVideo3dState();
    const targetPresetId = overridePresetId !== undefined ? overridePresetId : this.activeDesignPresetId;

    if (targetPresetId) {
      // Cập nhật bộ nhớ đệm đồng bộ NGAY LẬP TỨC để không bao giờ mất dữ liệu khi bấm chuyển mẫu liên tục
      this._designAiVideo3dCache.set(targetPresetId, JSON.parse(JSON.stringify(state)));
      const item = this.designPresets?.find((p) => p && p.id === targetPresetId);
      if (item) {
        item.camKeyframeCount = Array.isArray(state.cameraKeyframes) ? state.cameraKeyframes.length : 0;
        item.videoCount = Array.isArray(state.history) && state.history.length > 0
          ? state.history.length
          : ((state.resultFilePath || state.resultUrl) ? 1 : 0);
        item.hasVideoSetup = !!(
          item.videoCount > 0 ||
          item.camKeyframeCount > 0 ||
          (Array.isArray(state.refImages) && state.refImages.length > 0) ||
          (state.prompt && String(state.prompt).trim()) ||
          state.capturedFilePath
        );
        this.cdr.markForCheck();
      }
    }

    if (!overridePresetId && this.profile) {
      this.profile.scene = {
        ...(this.profile.scene || { cameraPreset: 'DESK_VIEW', lightsOn: true }),
        aiVideo3d: state,
        activeDesignPresetId: this.activeDesignPresetId
      };
    }

    const tasks: Array<Promise<any>> = [];
    if (!overridePresetId) {
      tasks.push(
        this.profileDataService.saveSceneSilent({
          aiVideo3d: state,
          activeDesignPresetId: this.activeDesignPresetId
        }).toPromise().catch(() => {})
      );
    }

    if (targetPresetId) {
      tasks.push(
        this._design3dService.patchVideoState(targetPresetId, state).toPromise().then((res: any) => {
          const meta = res?.data;
          const item = this.designPresets?.find((p) => p && p.id === targetPresetId);
          if (item && meta) {
            if (typeof meta.videoCount === 'number') item.videoCount = meta.videoCount;
            if (typeof meta.camKeyframeCount === 'number') item.camKeyframeCount = meta.camKeyframeCount;
            if (typeof meta.hasVideoSetup === 'boolean') item.hasVideoSetup = meta.hasVideoSetup;
            this.cdr.markForCheck();
          }
        }).catch(() => {})
      );
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  /** Khôi phục (hoặc đặt lại sạch) toàn bộ trạng thái, video bản ghi 3D, video AI và lịch sử của 1 cảnh */
  async restoreAiVideo3dState(saved: any): Promise<void> {
    const seq = ++this._aiVideo3dRestoreSeq;
    this._aiVideo3dRestoring = true;
    try {
      this.stopCameraPathPreview(false);
      if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
      }
      if (this.aiVideo3dResultPreviewUrl && this.aiVideo3dResultPreviewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(this.aiVideo3dResultPreviewUrl); } catch (_) {}
      }

      this.aiVideo3dCapturedMp4Base64 = null;
      this.aiVideo3dCapturedPreviewUrl = null;
      this.aiVideo3dResultBase64 = null;
      this.aiVideo3dResultPreviewUrl = null;
      this.aiVideo3dStatusText = '';
      this._aiVideo3dCapturedSummary = null;

      if (!saved || typeof saved !== 'object') {
        this.aiVideo3dRefImages = [];
        this.aiVideo3dPrompt = '';
        this.aiVideo3dDuration = 5;
        this.aiVideo3dAspectRatio = '16:9';
        this.aiVideo3dResolution = '720p';
        this.aiVideo3dHideGrid = true;
        this.aiVideo3dShowViewfinder = true;
        this.aiVideo3dCameraMode = 'keep';
        this.aiVideo3dCameraKeyframes = [];
        this.aiVideo3dCameraAiPrompt = '';
        this.aiVideo3dCapturedFilePath = null;
        this.aiVideo3dCapturedHasCameraMotion = false;
        this.aiVideo3dCapturedCameraSummary = '';
        this.aiVideo3dResultFilePath = null;
        this.aiVideo3dResultRemoteUrl = null;
        this.aiVideo3dHistory = [];
        this.aiVideo3dActiveHistoryId = null;
        this._aiVideo3dHasSavedDuration = false;
        this.cdr.markForCheck();
        return;
      }

      this.aiVideo3dRefImages = Array.isArray(saved.refImages)
        ? saved.refImages
            .filter((img: any) => img && typeof img.dataUrl === 'string' && img.dataUrl.length > 0)
            .slice(0, 4)
            .map((img: any) => ({
              name: String(img.name || 'anh_mau.png'),
              dataUrl: img.dataUrl,
              mimeType: String(img.mimeType || 'image/png'),
              targetKey: String(img.targetKey || 'auto')
            }))
        : [];
      this.aiVideo3dPrompt = typeof saved.prompt === 'string' ? saved.prompt : '';
      const dur = Number(saved.duration);
      this.aiVideo3dDuration = this.aiVideo3dDurationOptions.includes(dur) ? dur : 5;
      this._aiVideo3dHasSavedDuration = Number.isFinite(dur) && dur > 0;
      const validRatios: Array<'16:9' | '9:16' | '1:1' | '3:4' | '4:3'> = ['16:9', '9:16', '1:1', '3:4', '4:3'];
      this.aiVideo3dAspectRatio = validRatios.includes(saved.aspectRatio) ? saved.aspectRatio : '16:9';
      this.aiVideo3dResolution = saved.resolution === '1080p' ? '1080p' : '720p';
      this.aiVideo3dHideGrid = saved.hideGrid !== undefined ? !!saved.hideGrid : true;
      this.aiVideo3dShowViewfinder = saved.showViewfinder !== undefined ? !!saved.showViewfinder : true;
      const validCamModes: Array<'keep' | 'path' | 'all' | 'selected'> = ['keep', 'path', 'all', 'selected'];
      this.aiVideo3dCameraMode = validCamModes.includes(saved.cameraMode) ? saved.cameraMode : 'keep';
      this.aiVideo3dCameraKeyframes = Array.isArray(saved.cameraKeyframes)
        ? saved.cameraKeyframes.map((kf: any, idx: number) => ({
            id: String(kf?.id || `camkf_${Date.now().toString(36)}_${idx}`),
            time: Number(kf?.time) || 0,
            label: String(kf?.label || `Góc ${idx + 1}`),
            pivot: {
              x: Number(kf?.pivot?.x) || 0,
              y: Number(kf?.pivot?.y) || 0,
              z: Number(kf?.pivot?.z) || 0
            },
            yaw: Number(kf?.yaw) || 0,
            pitch: Number(kf?.pitch) || 0,
            distance: Number(kf?.distance) || 12,
            easing: kf?.easing === 'linear' ? 'linear' : 'smooth'
          }))
        : [];
      this.aiVideo3dCameraAiPrompt = typeof saved.cameraAiPrompt === 'string' ? saved.cameraAiPrompt : '';
      this.aiVideo3dCapturedFilePath = typeof saved.capturedFilePath === 'string' && saved.capturedFilePath ? saved.capturedFilePath : null;
      this.aiVideo3dCapturedHasCameraMotion = !!saved.capturedHasCameraMotion;
      this.aiVideo3dCapturedCameraSummary = typeof saved.capturedCameraSummary === 'string' ? saved.capturedCameraSummary : '';
      this.aiVideo3dResultFilePath = typeof saved.resultFilePath === 'string' && saved.resultFilePath ? saved.resultFilePath : null;
      this.aiVideo3dResultRemoteUrl = typeof saved.resultUrl === 'string' && saved.resultUrl ? saved.resultUrl : null;
      this.aiVideo3dHistory = Array.isArray(saved.history)
        ? saved.history.slice(0, 20).map((h: any, idx: number) => ({
            id: String(h?.id || `vid_${Date.now().toString(36)}_${idx}`),
            createdAt: Number(h?.createdAt) || Date.now(),
            prompt: String(h?.prompt || ''),
            duration: Number(h?.duration) || 5,
            aspectRatio: validRatios.includes(h?.aspectRatio) ? h.aspectRatio : '16:9',
            resolution: h?.resolution === '1080p' ? '1080p' : '720p',
            model: h?.model ? String(h.model) : undefined,
            capturedFilePath: h?.capturedFilePath || null,
            resultFilePath: h?.resultFilePath || null,
            resultUrl: h?.resultUrl || null,
            refImageCount: typeof h?.refImageCount === 'number' ? h.refImageCount : undefined,
            cameraMode: validCamModes.includes(h?.cameraMode) ? h.cameraMode : undefined
          }))
        : [];
      this.aiVideo3dActiveHistoryId =
        typeof saved.activeHistoryId === 'string' && this.aiVideo3dHistory.some((h) => h.id === saved.activeHistoryId)
          ? saved.activeHistoryId
          : (this.aiVideo3dHistory[0]?.id || null);

      this.cdr.markForCheck();
    } finally {
      this._aiVideo3dRestoring = false;
    }

    // Nạp lại file MP4 xem trước từ đĩa (không khóa UI, kiểm tra seq chống race khi bấm chuyển mẫu nhanh)
    await this._reloadAiVideo3dMediaFromDisk(seq, this.aiVideo3dCapturedFilePath, this.aiVideo3dResultFilePath, this.aiVideo3dResultRemoteUrl);
  }

  private async _reloadAiVideo3dMediaFromDisk(
    seq: number,
    capturedPath: string | null,
    resultPath: string | null,
    resultRemoteUrl: string | null
  ): Promise<void> {
    const electronWin = typeof window !== 'undefined' ? (window as any) : null;
    const readBase64Fn = electronWin?.electron?.readFileBase64;

    const tasks: Array<Promise<void>> = [];

    if (capturedPath && typeof readBase64Fn === 'function') {
      tasks.push(
        readBase64Fn(capturedPath)
          .then((res: any) => {
            if (seq !== this._aiVideo3dRestoreSeq) return;
            if (res?.success && res.base64) {
              if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
              }
              this.aiVideo3dCapturedMp4Base64 = res.base64;
              this.aiVideo3dCapturedPreviewUrl = this._base64ToBlobUrl(res.base64, 'video/mp4');
              this.cdr.markForCheck();
            }
          })
          .catch(() => {})
      );
    }

    if (resultPath && typeof readBase64Fn === 'function') {
      tasks.push(
        readBase64Fn(resultPath)
          .then((res: any) => {
            if (seq !== this._aiVideo3dRestoreSeq) return;
            if (res?.success && res.base64) {
              if (this.aiVideo3dResultPreviewUrl && this.aiVideo3dResultPreviewUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(this.aiVideo3dResultPreviewUrl); } catch (_) {}
              }
              this.aiVideo3dResultBase64 = res.base64;
              this.aiVideo3dResultPreviewUrl = this._base64ToBlobUrl(res.base64, 'video/mp4');
              this.cdr.markForCheck();
            } else if (resultRemoteUrl) {
              this.aiVideo3dResultPreviewUrl = resultRemoteUrl;
              this.cdr.markForCheck();
            }
          })
          .catch(() => {
            if (seq === this._aiVideo3dRestoreSeq && resultRemoteUrl) {
              this.aiVideo3dResultPreviewUrl = resultRemoteUrl;
              this.cdr.markForCheck();
            }
          })
      );
    } else if (resultRemoteUrl) {
      if (seq === this._aiVideo3dRestoreSeq) {
        this.aiVideo3dResultPreviewUrl = resultRemoteUrl;
        this.cdr.markForCheck();
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  /** Xem lại 1 video đã tạo trong lịch sử của cảnh hiện tại */
  async loadAiVideo3dHistoryItem(item: {
    id: string;
    capturedFilePath?: string | null;
    resultFilePath?: string | null;
    resultUrl?: string | null;
  }): Promise<void> {
    if (!item) return;
    const seq = ++this._aiVideo3dRestoreSeq;
    this.aiVideo3dActiveHistoryId = item.id;
    if (this.aiVideo3dResultPreviewUrl && this.aiVideo3dResultPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.aiVideo3dResultPreviewUrl); } catch (_) {}
    }
    this.aiVideo3dResultPreviewUrl = null;
    this.aiVideo3dResultBase64 = null;
    this.aiVideo3dResultFilePath = item.resultFilePath || null;
    this.aiVideo3dResultRemoteUrl = item.resultUrl || null;

    if (item.capturedFilePath && item.capturedFilePath !== this.aiVideo3dCapturedFilePath) {
      if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
      }
      this.aiVideo3dCapturedPreviewUrl = null;
      this.aiVideo3dCapturedMp4Base64 = null;
      this.aiVideo3dCapturedFilePath = item.capturedFilePath;
    }

    this.cdr.markForCheck();
    await this._reloadAiVideo3dMediaFromDisk(
      seq,
      item.capturedFilePath && !this.aiVideo3dCapturedPreviewUrl ? item.capturedFilePath : null,
      this.aiVideo3dResultFilePath,
      this.aiVideo3dResultRemoteUrl
    );
    this.scheduleSaveAiVideo3dState();
  }

  /** Nạp lại prompt & thông số xuất video từ 1 bản ghi lịch sử */
  applyAiVideo3dHistoryPrompt(item: {
    prompt: string;
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1' | '3:4' | '4:3';
    resolution: '720p' | '1080p';
  }, event: Event): void {
    event.stopPropagation();
    if (!item) return;
    this.aiVideo3dPrompt = item.prompt || '';
    if (this.aiVideo3dDurationOptions.includes(item.duration)) {
      this.aiVideo3dDuration = item.duration;
      this._aiVideo3dHasSavedDuration = true;
    }
    if (this.aiVideo3dRatioOptions.includes(item.aspectRatio)) {
      this.aiVideo3dAspectRatio = item.aspectRatio;
    }
    this.aiVideo3dResolution = item.resolution === '1080p' ? '1080p' : '720p';
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
    this.toastr.info('Đã nạp lại prompt và thông số video từ lịch sử.', 'AI Video 3D');
  }

  /** Xóa 1 mục khỏi lịch sử video của cảnh hiện tại */
  deleteAiVideo3dHistoryItem(item: { id: string; resultFilePath?: string | null }, event: Event): void {
    event.stopPropagation();
    if (!item) return;
    this.aiVideo3dHistory = this.aiVideo3dHistory.filter((h) => h.id !== item.id);
    if (this.aiVideo3dActiveHistoryId === item.id) {
      this.aiVideo3dActiveHistoryId = this.aiVideo3dHistory[0]?.id || null;
      if (item.resultFilePath && this.aiVideo3dResultFilePath === item.resultFilePath) {
        if (this.aiVideo3dResultPreviewUrl && this.aiVideo3dResultPreviewUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(this.aiVideo3dResultPreviewUrl); } catch (_) {}
        }
        this.aiVideo3dResultPreviewUrl = null;
        this.aiVideo3dResultBase64 = null;
        this.aiVideo3dResultFilePath = null;
        this.aiVideo3dResultRemoteUrl = null;
      }
    }
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
  }

  /** Chia thời gian tự động theo đúng tốc độ quang học (góc xoay + tỷ lệ zoom logarit + dịch chuyển tâm) để cú máy lướt đều vận tốc từ đầu đến cuối */
  private _rebalanceCameraKeyframeTimesBySpeed(list: CameraKeyframe[], duration: number): void {
    const n = list.length;
    if (n === 0) return;
    if (n === 1) {
      list[0].time = 0;
      return;
    }
    const dur = Math.max(4, Number(duration) || 5);
    const weights: number[] = [];
    let totalW = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      const dYaw = Math.abs((Number(b.yaw) || 0) - (Number(a.yaw) || 0)) / 45;
      const dPitch = Math.abs((Number(b.pitch) || 0) - (Number(a.pitch) || 0)) / 35;
      const distA = Math.max(0.5, Number(a.distance) || 12);
      const distB = Math.max(0.5, Number(b.distance) || 12);
      const dLogZoom = Math.abs(Math.log(distB / distA)) / 0.55;
      const meanDist = Math.max(1.0, (distA + distB) * 0.5);
      const dPivot = Math.hypot(
        (b.pivot?.x || 0) - (a.pivot?.x || 0),
        (b.pivot?.y || 0) - (a.pivot?.y || 0),
        (b.pivot?.z || 0) - (a.pivot?.z || 0)
      ) / meanDist;
      const w = Math.max(0.18, Math.hypot(dYaw, dPitch, dLogZoom, dPivot));
      weights.push(w);
      totalW += w;
    }
    let acc = 0;
    list[0].time = 0;
    for (let i = 1; i < n - 1; i++) {
      acc += weights[i - 1];
      list[i].time = Math.round(((dur * acc) / Math.max(1e-4, totalW)) * 10) / 10;
    }
    list[n - 1].time = dur;
  }

  /** Lưu góc camera & độ zoom hiện tại trên Canvas 3D thành 1 mốc Camera Keyframe mới */
  addCameraKeyframeAtCurrentView(): void {
    const snap = this.sceneService.getCameraSnapshot();
    if (!snap) {
      this.toastr.warning('Chưa đọc được góc camera 3D hiện tại.', 'Camera Keyframe');
      return;
    }
    this.stopCameraPathPreview(false);
    const dur = Math.max(4, Number(this.aiVideo3dDuration) || 5);
    const list = [...this.aiVideo3dCameraKeyframes].sort((a, b) => a.time - b.time);

    const kf: CameraKeyframe = {
      id: 'camkf_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36),
      time: dur,
      label: `Góc ${list.length + 1}`,
      pivot: {
        x: Math.round(snap.pivot.x * 100) / 100,
        y: Math.round(snap.pivot.y * 100) / 100,
        z: Math.round(snap.pivot.z * 100) / 100
      },
      yaw: Math.round(snap.yaw * 10) / 10,
      pitch: Math.round(snap.pitch * 10) / 10,
      distance: Math.round(snap.distance * 100) / 100,
      easing: 'smooth'
    };

    list.push(kf);
    this._rebalanceCameraKeyframeTimesBySpeed(list, dur);
    this.aiVideo3dCameraKeyframes = list;
    if (list.length >= 2) {
      this.aiVideo3dCameraMode = 'path';
    }
    this.clearCaptured3dMotionVideo(true);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
    this.toastr.success(
      `Đã lưu ${kf.label} tại ${kf.time.toFixed(1)}s (góc ${Math.round(kf.yaw)}°, khoảng cách ${kf.distance.toFixed(1)}).`,
      'Camera Keyframe'
    );
  }

  /** Cập nhật lại góc xoay & zoom của một mốc Camera Keyframe theo góc nhìn đang hiển thị trên Canvas */
  updateCameraKeyframeFromCurrentView(kf: CameraKeyframe): void {
    const snap = this.sceneService.getCameraSnapshot();
    if (!snap || !kf) return;
    this.stopCameraPathPreview(false);
    kf.pivot = {
      x: Math.round(snap.pivot.x * 100) / 100,
      y: Math.round(snap.pivot.y * 100) / 100,
      z: Math.round(snap.pivot.z * 100) / 100
    };
    kf.yaw = Math.round(snap.yaw * 10) / 10;
    kf.pitch = Math.round(snap.pitch * 10) / 10;
    kf.distance = Math.round(snap.distance * 100) / 100;
    this.clearCaptured3dMotionVideo(true);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
    this.toastr.info(`Đã cập nhật lại góc nhìn cho mốc ${kf.time.toFixed(1)}s.`, 'Camera Keyframe');
  }

  /** Nhảy camera ngay lập tức tới góc quay đã lưu của 1 mốc */
  jumpToCameraKeyframe(kf: CameraKeyframe): void {
    if (!kf) return;
    this.stopCameraPathPreview(false);
    this.sceneService.restoreCameraSnapshot({
      pivot: kf.pivot,
      yaw: kf.yaw,
      pitch: kf.pitch,
      distance: kf.distance
    });
  }

  /** Xóa 1 mốc Camera Keyframe */
  removeCameraKeyframe(id: string): void {
    this.stopCameraPathPreview(false);
    this.aiVideo3dCameraKeyframes = this.aiVideo3dCameraKeyframes.filter((k) => k.id !== id);
    if (this.aiVideo3dCameraKeyframes.length < 2 && this.aiVideo3dCameraMode === 'path') {
      this.aiVideo3dCameraMode = 'keep';
    }
    this.clearCaptured3dMotionVideo(true);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
  }

  /** Xóa toàn bộ mốc Camera Keyframes */
  clearCameraKeyframes(): void {
    this.stopCameraPathPreview(false);
    this.aiVideo3dCameraKeyframes = [];
    if (this.aiVideo3dCameraMode === 'path') {
      this.aiVideo3dCameraMode = 'keep';
    }
    this.clearCaptured3dMotionVideo(true);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
  }

  /** Chia đều tốc độ camera (tự phân bổ giây theo độ xoay & tỷ lệ zoom thực tế giữa từng cặp mốc) */
  distributeCameraKeyframesEvenly(): void {
    if (this.aiVideo3dCameraKeyframes.length < 2) return;
    const dur = Math.max(4, Number(this.aiVideo3dDuration) || 5);
    this._rebalanceCameraKeyframeTimesBySpeed(this.aiVideo3dCameraKeyframes, dur);
    this.clearCaptured3dMotionVideo(true);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
    this.toastr.info('Đã cân đều tốc độ xoay & zoom mượt qua toàn bộ các mốc camera.', 'Camera Keyframe');
  }

  /** Chuẩn hóa & sắp xếp lại danh sách mốc khi người dùng chỉnh tay số giây */
  onCameraKeyframeTimeChange(kf: CameraKeyframe): void {
    const dur = Math.max(4, Number(this.aiVideo3dDuration) || 5);
    kf.time = Math.round(Math.max(0, Math.min(dur, Number(kf.time) || 0)) * 10) / 10;
    this.aiVideo3dCameraKeyframes = [...this.aiVideo3dCameraKeyframes].sort((a, b) => a.time - b.time);
    this.clearCaptured3dMotionVideo(true);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
  }

  /** Bật/tắt xem thử đường chạy Camera Keyframes mượt đồng bộ cùng chuyển động 3D trên Canvas */
  toggleCameraPathPreview(): void {
    if (this.aiVideo3dCameraPreviewing) {
      this.stopCameraPathPreview(true);
      return;
    }
    if (this.aiVideo3dCameraKeyframes.length < 2) {
      this.toastr.warning('Cần lưu ít nhất 2 mốc góc quay để xem thử đường chạy camera.', 'Camera Keyframe');
      return;
    }
    this._aiVideo3dCameraPrePreviewSnap = this.sceneService.getCameraSnapshot();
    const dur = Math.max(4, Number(this.aiVideo3dDuration) || 5);
    this.sceneService.syncAllRiggedPropsForCapture();
    this.sceneService.onCameraPathTick = (t, playing) => {
      this.aiVideo3dCameraPreviewSec = Math.round(t * 10) / 10;
      if (!playing) {
        this.aiVideo3dCameraPreviewing = false;
      }
      this.cdr.markForCheck();
    };
    this.aiVideo3dCameraPreviewing = true;
    this.aiVideo3dCameraPreviewSec = 0;
    this.sceneService.startCameraKeyframePlayback(this.aiVideo3dCameraKeyframes, dur, true, 0);
    this.cdr.markForCheck();
  }

  stopCameraPathPreview(restorePrev = false): void {
    this.sceneService.stopCameraKeyframePlayback();
    this.sceneService.onCameraPathTick = null;
    this.aiVideo3dCameraPreviewing = false;
    this.aiVideo3dCameraPreviewSec = 0;
    if (restorePrev && this._aiVideo3dCameraPrePreviewSnap) {
      this.sceneService.restoreCameraSnapshot(this._aiVideo3dCameraPrePreviewSnap);
    }
    this._aiVideo3dCameraPrePreviewSnap = null;
    this.cdr.markForCheck();
  }

  /**
   * AI Đạo diễn Camera: Người dùng mô tả ý tưởng cú máy (vd: "Xoay vòng 180 độ quanh nhân vật rồi zoom cận mặt"),
   * Gemini tự suy luận và sinh chuỗi CameraKeyframes mượt từ góc camera hiện tại để xem thử & ghi 3D ngay.
   */
  async generateCameraKeyframesWithAi(): Promise<void> {
    const prompt = (this.aiVideo3dCameraAiPrompt || '').trim();
    if (!prompt || this.aiVideo3dCameraAiLoading || this.aiVideo3dCapturing) return;

    const baseSnap = this.sceneService.getCameraSnapshot();
    if (!baseSnap) {
      this.toastr.warning('Chưa đọc được góc camera hiện tại.', 'AI Đạo diễn Camera');
      return;
    }

    this.stopCameraPathPreview(false);
    this.aiVideo3dCameraAiLoading = true;
    this.cdr.markForCheck();

    const dur = Math.max(4, Number(this.aiVideo3dDuration) || 5);
    const summary = this.refreshAiVideo3dSceneSummary();

    const systemPrompt = `Bạn là **Đạo diễn Hình ảnh & Camera 3D (3D Cinematographer AI)**.
Nhiệm vụ: Dựa vào mô tả cú máy của người dùng, hãy thiết kế một chuỗi **Camera Keyframes** liên tục, mượt mà trong thời lượng \`${dur}s\` trên hệ tọa độ quỹ đạo cầu (Orbit Camera) của PlayCanvas.

### TRẠNG THÁI CAMERA HIỆN TẠI (t = 0s):
- \`pivot\`: { "x": ${baseSnap.pivot.x.toFixed(2)}, "y": ${baseSnap.pivot.y.toFixed(2)}, "z": ${baseSnap.pivot.z.toFixed(2)} } (tâm điểm camera đang nhìn vào)
- \`yaw\`: ${baseSnap.yaw.toFixed(1)} (độ xoay ngang quanh nhân vật; tăng +90 là xoay vòng sang phải, giảm -90 là xoay vòng sang trái, +180 là vòng ra sau lưng, +360 là quay trọn 1 vòng)
- \`pitch\`: ${baseSnap.pitch.toFixed(1)} (góc nghiêng cao độ tính bằng độ, phạm vi an toàn 4..65; thấp ~6-10 là góc nhìn thấp oai vệ, cao ~35-55 là góc trên cao nhìn xuống)
- \`distance\`: ${baseSnap.distance.toFixed(2)} (khoảng cách camera tới pivot; giảm distance = **ZOOM IN** cận cảnh, tăng distance = **ZOOM OUT** toàn cảnh; phạm vi an toàn ${(Math.max(1.5, baseSnap.distance * 0.25)).toFixed(1)}..${(Math.max(25, baseSnap.distance * 2.8)).toFixed(1)})
- Đồ vật đang có trong cảnh: ${JSON.stringify(summary.props.map((p) => p.name))}

### QUY TẮC THIẾT KẾ CÚ MÁY ĐẸP:
1. Tạo từ 3 đến 6 mốc \`keyframes\` từ \`time: 0\` đến \`time: ${dur}\`.
2. Mốc đầu \`time: 0\` nên xuất phát từ góc gần với trạng thái hiện tại (trừ khi người dùng yêu cầu bắt đầu từ góc khác như từ trên cao hay từ cận mặt).
3. Nếu zoom cận mặt nhân vật: tăng nhẹ \`pivot.y\` lên vùng đầu/ngực (cộng thêm ~1.2..2.2 so với pivot trung tâm) và giảm \`distance\` xuống ~35-50% khoảng cách ban đầu.
4. Nếu xoay vòng 180° hoặc 360°: chia mốc trung gian mỗi 90°..120° với \`yaw\` tăng/giảm liên tục (vd: 0 -> 90 -> 180 -> 270 -> 360) để quay tròn mượt 1 chiều.
5. Nếu muốn quay lia chậm đều không dừng nghỉ ở giữa, dùng \`"easing": "linear"\` ở mốc trung gian và \`"easing": "smooth"\` ở mốc cuối.

### YÊU CẦU TỪ NGƯỜI DÙNG:
- "${prompt}"

### ĐẦU RA (CHỈ TRẢ VỀ JSON THUẦN TÚY):
{
  "explanation": "Mô tả ngắn gọn cú máy vừa biên đạo",
  "keyframes": [
    { "time": 0, "label": "Toàn cảnh", "pivot": { "x": ${baseSnap.pivot.x.toFixed(2)}, "y": ${baseSnap.pivot.y.toFixed(2)}, "z": ${baseSnap.pivot.z.toFixed(2)} }, "yaw": ${baseSnap.yaw.toFixed(1)}, "pitch": ${baseSnap.pitch.toFixed(1)}, "distance": ${baseSnap.distance.toFixed(2)}, "easing": "smooth" }
  ]
}`;

    try {
      const aiRes: any = await this.genaiService.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        config: {
          skipTTS: true,
          disableThinking: true,
          temperature: 0.25
        } as any
      });
      const rawReply =
        aiRes?.text ||
        aiRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
        '';
      const parsed = this.extractJsonFromAiText(rawReply);
      const rawKfs: any[] = Array.isArray(parsed?.keyframes) ? parsed.keyframes : [];

      if (rawKfs.length < 2) {
        this.toastr.warning('AI chưa tạo đủ mốc góc quay. Hãy mô tả rõ hơn góc quay hoặc thao tác zoom.', 'AI Đạo diễn Camera');
        return;
      }

      const built: CameraKeyframe[] = rawKfs
        .map((k: any, idx: number) => ({
          id: 'camkf_' + Date.now().toString(36) + '_' + idx,
          time: Math.round(Math.max(0, Math.min(dur, Number(k?.time) || 0)) * 10) / 10,
          label: String(k?.label || `Góc ${idx + 1}`).slice(0, 24),
          pivot: {
            x: Math.round((Number(k?.pivot?.x) ?? baseSnap.pivot.x) * 100) / 100,
            y: Math.round(Math.max(0, Number(k?.pivot?.y) ?? baseSnap.pivot.y) * 100) / 100,
            z: Math.round((Number(k?.pivot?.z) ?? baseSnap.pivot.z) * 100) / 100
          },
          yaw: Math.round((Number(k?.yaw) ?? baseSnap.yaw) * 10) / 10,
          pitch: Math.round(Math.max(2, Math.min(80, Number(k?.pitch) ?? baseSnap.pitch)) * 10) / 10,
          distance: Math.round(Math.max(1.0, Math.min(180, Number(k?.distance) ?? baseSnap.distance)) * 100) / 100,
          easing: (k?.easing === 'linear' ? 'linear' : 'smooth') as 'smooth' | 'linear'
        }))
        .sort((a, b) => a.time - b.time);

      this.aiVideo3dCameraKeyframes = built;
      this.aiVideo3dCameraMode = 'path';
      this.clearCaptured3dMotionVideo(true);
      this.scheduleSaveAiVideo3dState(true);
      this.cdr.markForCheck();
      this.toastr.success(
        parsed?.explanation || `AI đã biên đạo xong đường camera gồm ${built.length} mốc (${dur}s)!`,
        'AI Đạo diễn Camera'
      );
      this.toggleCameraPathPreview();
    } catch (err: any) {
      console.error('[AI Camera Director] Error:', err);
      this.toastr.error(err?.message || 'Không thể kết nối AI để tạo đường camera.', 'AI Đạo diễn Camera');
    } finally {
      this.aiVideo3dCameraAiLoading = false;
      this.cdr.markForCheck();
    }
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

  private _pickDefaultRefTargetKey(): string {
    const used = new Set(this.aiVideo3dRefImages.map((it) => it.targetKey));
    // Ưu tiên gán nhân vật có khung xương chưa được gán, tiếp đến các đồ vật 3D còn lại từ trái sang phải
    const orderedProps = [
      ...this.aiVideo3dSceneProps.filter((p) => p.hasRig),
      ...this.aiVideo3dSceneProps.filter((p) => !p.hasRig)
    ];
    for (const p of orderedProps) {
      if (!used.has(p.id)) return p.id;
    }
    if (this.aiVideo3dSceneProps.length > 0 && !used.has('bg')) {
      return 'bg';
    }
    return 'auto';
  }

  private _addAiVideo3dRefFile(file: File): void {
    if (this.aiVideo3dRefImages.length >= 4) {
      this.toastr.warning('Tối đa 4 ảnh tham chiếu đồ vật / nhân vật / bối cảnh.', 'AI Video 3D');
      return;
    }
    this.refreshAiVideo3dSceneSummary();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        this.aiVideo3dRefImages.push({
          name: file.name || `anh_mau_${this.aiVideo3dRefImages.length + 1}.png`,
          dataUrl,
          mimeType: mimeMatch ? mimeMatch[1] : (file.type || 'image/png'),
          targetKey: this._pickDefaultRefTargetKey()
        });
        this.scheduleSaveAiVideo3dState(true);
        this.cdr.markForCheck();
      }
    };
    reader.readAsDataURL(file);
  }

  removeAiVideo3dRefImage(idx: number): void {
    if (idx < 0 || idx >= this.aiVideo3dRefImages.length) return;
    this.aiVideo3dRefImages.splice(idx, 1);
    this.scheduleSaveAiVideo3dState(true);
    this.cdr.markForCheck();
  }

  clearCaptured3dMotionVideo(silent = false): void {
    if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
    }
    this.aiVideo3dCapturedMp4Base64 = null;
    this.aiVideo3dCapturedPreviewUrl = null;
    this.aiVideo3dCapturedFilePath = null;
    this._aiVideo3dCapturedSummary = null;
    this.aiVideo3dCapturedHasCameraMotion = false;
    this.aiVideo3dCapturedCameraSummary = '';
    if (!silent) {
      this.scheduleSaveAiVideo3dState(true);
    }
    this.cdr.markForCheck();
  }

  downloadCaptured3dMotionVideo(): void {
    if (!this.aiVideo3dCapturedPreviewUrl) return;
    const a = document.createElement('a');
    a.href = this.aiVideo3dCapturedPreviewUrl;
    a.download = `scene_3d_${Date.now()}.mp4`;
    a.click();
  }

  /**
   * Ghi trực tiếp toàn bộ cảnh 3D (một hoặc nhiều đồ vật + bóng đổ + hiệu ứng FX tuyết/hạt...) trên Canvas
   * theo đúng thời lượng và tỷ lệ khung hình, đồng bộ tất cả timeline về t=0 rồi chuyển sang H.264 MP4 qua FFmpeg.
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

    // Seedance 2.0/2.5 Video Editing hỗ trợ video đầu vào 4..30 giây
    const durSec = Math.max(4, Math.min(30, Number(this.aiVideo3dDuration) || 5));
    this.stopCameraPathPreview(false);
    this.aiVideo3dCapturing = true;
    this.aiVideo3dCaptureSec = 0;
    this.aiVideo3dStatusText = `Đang ghi cảnh 3D (0/${durSec}s)...`;
    this.cdr.markForCheck();

    const initialSummary = this.refreshAiVideo3dSceneSummary();
    const hasActiveFx = initialSummary.fxNames.length > 0;

    // Lưu góc camera + ánh sáng hiện tại để phục hồi nguyên vẹn ngay sau khi ghi xong
    const useCameraPath = this.aiVideo3dCameraMode === 'path' && this.aiVideo3dCameraKeyframes.length >= 2;
    const shouldAutoFrame = this.aiVideo3dCameraMode === 'all' || this.aiVideo3dCameraMode === 'selected';
    const prevCameraSnap = this.sceneService.getCameraSnapshot();
    const prevLighting = this.sceneService.getStudioLighting();
    const shouldTempHideGrid = this.aiVideo3dHideGrid && prevLighting.showGrid;
    const bgHex = String(prevLighting.bgColor || '').trim().toLowerCase();
    const isVeryLightBg = bgHex === '#ffffff' || bgHex === '#f8fafc' || bgHex === '#f1f5f9';
    const shouldTempContrastBg = this.aiVideo3dHideGrid && isVeryLightBg;
    const lightingTempPatch: any = {};
    if (shouldTempHideGrid) lightingTempPatch.showGrid = false;
    // Khi nền gốc quá sáng, chuyển sang nền xám trung tính #94a3b8 (hoặc #64748b khi có FX tuyết/hạt) để cả mô hình trắng (lon nước), hình nộm gỗ lẫn tuyết đều nổi rõ đường biên
    if (shouldTempContrastBg) {
      lightingTempPatch.bgColor = hasActiveFx ? '#64748b' : '#94a3b8';
    }

    this.sceneService.setSelectionRingTempHidden(true);
    if (Object.keys(lightingTempPatch).length > 0) {
      this.sceneService.applyStudioLighting(lightingTempPatch);
    }

    // Đồng bộ tua toàn bộ nhân vật/đồ vật có khung xương về t=0 và chạy cùng lúc
    this.sceneService.syncAllRiggedPropsForCapture();
    if (useCameraPath) {
      // Đưa camera về đúng mốc t=0 trước khi mở MediaRecorder
      this.sceneService.seekCameraKeyframesAtTime(this.aiVideo3dCameraKeyframes, 0);
    } else if (shouldAutoFrame) {
      const activePid = this.timelinePropId || this.selectedPropId || this.sceneService.getFirstRiggedPropId();
      this.sceneService.autoFrameSceneForCapture(
        this.aiVideo3dCameraMode === 'selected' ? 'selected' : 'all',
        activePid,
        0.68,
        this.aiVideo3dAspectRatio
      );
    }

    const camSamples: Array<{ pivot: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number }> = [];
    let timer: any = null;
    try {
      // Đợi 3 frame để camera + nền tương phản + tắt lưới/ring + pose t=0 ổn định trước khi mở MediaRecorder
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));

      // Chụp lại bản đồ vị trí Trái/Giữa/Phải của các đồ vật theo đúng góc camera lúc ghi hình
      const capturedSummary = this.refreshAiVideo3dSceneSummary();
      const firstCam = this.sceneService.getCameraSnapshot();
      if (firstCam) camSamples.push(firstCam);

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
      if (useCameraPath) {
        // Khởi động đường chạy Camera Keyframes đồng bộ đúng thời điểm bắt đầu ghi hình
        this.sceneService.startCameraKeyframePlayback(this.aiVideo3dCameraKeyframes, durSec, false, 0);
      }

      timer = setInterval(() => {
        const elapsed = Math.min(durSec, Math.floor((Date.now() - startedAt) / 1000));
        this.aiVideo3dCaptureSec = elapsed;
        this.aiVideo3dStatusText = useCameraPath
          ? `Đang ghi cảnh 3D theo đường Camera (${elapsed}/${durSec}s)...`
          : `Đang ghi cảnh 3D (${elapsed}/${durSec}s)...`;
        const curCam = this.sceneService.getCameraSnapshot();
        if (curCam) camSamples.push(curCam);
        this.cdr.markForCheck();
      }, 250);

      // Cộng dư 380ms khi ghi WebM rồi FFmpeg cắt chuẩn -t durSec để chắc chắn video đầu ra đủ tối thiểu >= 4.0s
      await new Promise((r) => setTimeout(r, durSec * 1000 + 380));
      const endCam = this.sceneService.getCameraSnapshot();
      if (endCam) camSamples.push(endCam);
      if (useCameraPath) {
        this.sceneService.stopCameraKeyframePlayback();
      }
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      await stopped;
      stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });

      if (timer) { clearInterval(timer); timer = null; }

      // Phân tích tự động xem trong suốt quá trình ghi (dù bằng Camera Keyframes hay xoay/zoom tay trực tiếp) camera có di chuyển không
      let totalYawTravel = 0;
      let totalPitchTravel = 0;
      let totalPivotTravel = 0;
      let minDist = Infinity;
      let maxDist = 0;
      for (let i = 0; i < camSamples.length; i++) {
        const c = camSamples[i];
        if (c.distance < minDist) minDist = c.distance;
        if (c.distance > maxDist) maxDist = c.distance;
        if (i > 0) {
          const prev = camSamples[i - 1];
          totalYawTravel += Math.abs(c.yaw - prev.yaw);
          totalPitchTravel += Math.abs(c.pitch - prev.pitch);
          totalPivotTravel += Math.hypot(c.pivot.x - prev.pivot.x, c.pivot.y - prev.pivot.y, c.pivot.z - prev.pivot.z);
        }
      }
      const distChangeRatio = minDist > 0 && Number.isFinite(minDist) ? (maxDist - minDist) / Math.max(0.5, minDist) : 0;
      const hasCamMotion =
        useCameraPath ||
        totalYawTravel > 4.0 ||
        totalPitchTravel > 3.0 ||
        distChangeRatio > 0.06 ||
        totalPivotTravel > 0.35;

      const camParts: string[] = [];
      if (totalYawTravel > 4.0) camParts.push(`orbits smoothly ~${Math.round(totalYawTravel)} deg horizontally`);
      if (totalPitchTravel > 3.0) camParts.push(`tilts vertically ~${Math.round(totalPitchTravel)} deg`);
      if (distChangeRatio > 0.06 && camSamples.length >= 2) {
        const startD = camSamples[0].distance;
        const endD = camSamples[camSamples.length - 1].distance;
        if (endD < startD * 0.92) camParts.push('zooms IN smoothly closer to the subject');
        else if (endD > startD * 1.08) camParts.push('zooms OUT smoothly to a wider framing');
        else camParts.push('zooms in and out dynamically');
      }
      if (totalPivotTravel > 0.35) camParts.push('pans/tracks smoothly across the 3D scene');

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
      this._aiVideo3dCapturedSummary = capturedSummary;
      this.aiVideo3dCapturedHasCameraMotion = hasCamMotion;
      this.aiVideo3dCapturedCameraSummary = camParts.length > 0
        ? camParts.join(', ')
        : 'smoothly moves camera viewpoint and framing';
      this.aiVideo3dStatusText = '';
      this.scheduleSaveAiVideo3dState(true);
      this.cdr.markForCheck();
      return conv.base64;
    } catch (err: any) {
      console.error('[Profile] capture3dMotionVideo error:', err);
      this.toastr.error(err?.message || 'Lỗi ghi cảnh 3D.', 'AI Video 3D');
      return null;
    } finally {
      if (timer) { clearInterval(timer); timer = null; }
      this.sceneService.stopCameraKeyframePlayback();
      this.sceneService.setSelectionRingTempHidden(false);
      if ((useCameraPath || shouldAutoFrame) && prevCameraSnap) {
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
   * Tạo Video AI bằng đúng model video cấu hình trong Mì Tôm AI:
   * hỗ trợ cả cảnh 1 nhân vật lẫn cảnh nhiều đồ vật 3D + hiệu ứng FX (tuyết rơi, mưa, hạt...)
   * và ánh xạ chính xác từng ảnh mẫu (@Image 1..4) vào đúng đồ vật theo vị trí Trái/Giữa/Phải trên @Video 1.
   */
  async generateAiVideoFrom3dMotion(): Promise<void> {
    if (this.aiVideo3dGenerating || this.aiVideo3dCapturing) return;

    if (!this.genaiService.isUModelverseEnabled()) {
      this.toastr.warning('Vui lòng bật Mì Tôm AI và cấu hình API Key + Model Video trong Cài đặt trước.', 'Mì Tôm AI');
      return;
    }
    if (this.aiVideo3dRefImages.length === 0 && !(this.aiVideo3dConfiguredSupportsRefVideo && (this.aiVideo3dPrompt || '').trim().length > 0)) {
      this.toastr.warning('Vui lòng chọn ít nhất 1 ảnh mẫu hoặc nhập mô tả bối cảnh để AI dựng video từ cảnh 3D.', 'AI Video 3D');
      return;
    }

    this.aiVideo3dGenerating = true;
    this.cdr.markForCheck();

    try {
      // 1. Tự động ghi cảnh 3D trên canvas nếu chưa có bản ghi sẵn
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
      const sceneSummary = this._aiVideo3dCapturedSummary || this.refreshAiVideo3dSceneSummary();
      const visibleProps = sceneSummary.props;
      const activeFxNames = sceneSummary.fxNames;

      this.aiVideo3dStatusText = `Đang gửi sang Mì Tôm AI (${targetModel}) — quá trình render video thường mất 1-3 phút...`;
      this.cdr.markForCheck();

      // 2. Đóng gói danh sách tham chiếu: Ảnh mẫu (CHARACTER_REFERENCE) + Video 3D (REFERENCE_VIDEO)
      // KHÔNG trộn START_FRAME để tương thích chuẩn Volcengine Seedance 2.0/2.5
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
          characterName: img.name || `Reference_${i + 1}`
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

      const describePropSpatialEng = (p: CaptureScenePropInfo): string => {
        const horiz = p.screenZone === 'left'
          ? 'on the LEFT side'
          : (p.screenZone === 'right' ? 'on the RIGHT side' : 'near the CENTER');
        if (p.depthLayer === 'front') {
          return `in the FOREGROUND (in FRONT, closest to the camera, ${horiz})`;
        }
        if (p.depthLayer === 'back') {
          return `in the BACKGROUND (BEHIND the foreground subject, farther from the camera, ${horiz})`;
        }
        return `${horiz} of the frame`;
      };

      const hasDepthStack =
        visibleProps.some((p) => p.depthLayer === 'front') &&
        visibleProps.some((p) => p.depthLayer === 'back');
      const videoRef = isSeedanceTarget ? '@Video 1' : 'the driving video';

      // Xây dựng câu lệnh ánh xạ chính xác từng ảnh @Image k vào từng đồ vật 3D theo đúng cấu trúc chiều sâu trước-sau & trái-phải
      const mappedPropIds = new Set<string>();
      const mappingLines: string[] = [];
      const bgImageTags: string[] = [];

      this.aiVideo3dRefImages.forEach((img, idx) => {
        const tag = isSeedanceTarget ? `@Image ${idx + 1}` : `Reference Image ${idx + 1}`;
        if (img.targetKey === 'bg') {
          bgImageTags.push(tag);
          mappingLines.push(
            `- ${tag}: use strictly as the background environment, lighting, and visual atmosphere of the scene.`
          );
          return;
        }
        const matchedProp = img.targetKey && img.targetKey !== 'auto'
          ? visibleProps.find((p) => p.id === img.targetKey)
          : null;
        if (matchedProp) {
          mappedPropIds.add(matchedProp.id);
          const posDesc = visibleProps.length > 1
            ? `${describePropSpatialEng(matchedProp)} of ${videoRef}`
            : `in ${videoRef}`;
          if (matchedProp.hasRig) {
            if (matchedProp.hasActiveMotion === false) {
              mappingLines.push(
                `- ${tag}: replace ONLY the 3D human mannequin "${matchedProp.name}" (${posDesc}) with the exact character, face, hair, body build, and clothing from ${tag}; strictly HOLD its exact frozen/static pose, limb angles, torso facing direction, 2D screen position, and depth layer from ${videoRef} — do NOT add unrequested walking, gesturing, turning, or body choreography.`
              );
            } else {
              mappingLines.push(
                `- ${tag}: replace ONLY the articulated 3D human mannequin "${matchedProp.name}" (${posDesc}) with the exact character, face, hair, body build, and clothing from ${tag}; strictly preserve 100% of its exact 2D screen position, depth layer, skeleton pose, limb angles, torso facing direction, and timing.`
              );
            }
          } else {
            mappingLines.push(
              `- ${tag}: replace ONLY the 3D prop/object "${matchedProp.name}" (${posDesc}) with the exact subject/object appearance from ${tag}; keep it strictly at its EXACT 3D coordinates, depth layer, apparent perspective size, and independent motion/rotation from ${videoRef} — NEVER copy the foreground character's running/T-pose limbs onto it and NEVER relocate it side-by-side next to the foreground character.`
            );
          }
        } else {
          mappingLines.push(
            `- ${tag}: apply this visual appearance ONLY to its corresponding element in ${videoRef} without changing its 3D depth layer, occlusion, or screen coordinates.`
          );
        }
      });

      const unmappedProps = visibleProps.filter((p) => !mappedPropIds.has(p.id));
      const unmappedRule = unmappedProps.length > 0
        ? `Keep all other visible 3D objects (${unmappedProps.map((p) => `"${p.name}" ${describePropSpatialEng(p)}`).join(', ')}) rendered realistically as their true object type in their EXACT 3D depth layer, occlusion order, scale, and motion from ${videoRef} — do NOT turn an unmapped prop into a second human and do NOT remove it.`
        : '';

      const hasDynamicCamera = this.aiVideo3dCapturedHasCameraMotion;
      const camMotionDesc = this.aiVideo3dCapturedCameraSummary || 'continuous orbit, pan, and zoom in/out';

      const depthStructureRule = hasDynamicCamera
        ? `CONTINUOUS 3D PERSPECTIVE & OCCLUSION SYNC: Follow the EXACT frame-by-frame 3D depth occlusion, parallax, and changing apparent scale of every object as the camera moves and zooms continuously in ${videoRef}. Keep every subject anchored accurately in 3D space relative to the ground plane.`
        : (hasDepthStack
            ? `STRICT FOREGROUND-TO-BACKGROUND DEPTH & OCCLUSION LOCK: ${videoRef} has a FRONT-AND-BACK 3D depth layout where the foreground subject stands IN FRONT of and partially overlaps the background object behind it. Preserve this EXACT front-to-back occlusion, depth separation, and exact (X, Y) pixel coordinates of every object throughout every frame. NEVER rearrange front-and-back objects into a side-by-side horizontal lineup!`
            : `STRICT 2D & 3D LAYOUT LOCK: Preserve the exact (X, Y) screen coordinates, perspective depth, and relative apparent sizes of every object in ${videoRef} — NEVER reposition or rearrange objects.`);

      const fxRule = activeFxNames.length > 0
        ? `ENVIRONMENTAL & PARTICLE FX (${activeFxNames.join(', ')}): Strictly preserve and realistically render the active atmospheric/particle effects visible in ${videoRef} (such as falling snow, rain, or floating particles) matching the exact falling direction, speed, and depth across the entire frame.`
        : '';

      const sceneDesc = userPrompt
        ? `Scene & visual style: ${userPrompt}.`
        : (bgImageTags.length > 0
            ? `Match the environment, lighting, and cinematic color grading of ${bgImageTags.join(', ')} with natural grounded shadows.`
            : `Clean cinematic background and realistic studio lighting matching the camera framing and grounded shadows of ${videoRef}.`);

      const seedanceCameraRule = hasDynamicCamera
        ? `DYNAMIC CAMERA MOTION & ZOOM TRANSFER: Strictly follow 100% of the continuous camera trajectory recorded in @Video 1 (${camMotionDesc}) frame-by-frame — match every orbit angle change, tilt, pan, and zoom in/out speed seamlessly with realistic 3D environment parallax and zero sudden cuts.`
        : `LOCKED CAMERA PERSPECTIVE: Strictly preserve 100% of the exact camera angle, viewpoint elevation, focal length, framing distance, and horizon tilt of @Video 1 from start to finish — ZERO unrequested camera orbit, pan, zoom, or angle cuts.`;

      const genericCameraRule = hasDynamicCamera
        ? `DYNAMIC CAMERA FOLLOW: Strictly replicate 100% of the exact continuous camera rotation, pan, tilt, and zoom in/out trajectory from ${videoRef} (${camMotionDesc}) with realistic 3D parallax and zero cuts.`
        : `LOCKED CAMERA: Strictly keep the exact same camera angle, distance, perspective, and framing as ${videoRef} with zero camera drift or angle changes.`;

      const allRiggedAreStatic =
        visibleProps.some((p) => p.hasRig) &&
        visibleProps.filter((p) => p.hasRig).every((p) => p.hasActiveMotion === false);
      const staticPoseRule = allRiggedAreStatic
        ? `STATIC SUBJECT POSE LOCK: The 3D character(s) in ${videoRef} hold a deliberate fixed pose with NO body animation attached — keep their exact pose, limb angles, and body orientation unchanged throughout the video (no unrequested walking, waving, or invented actions).`
        : '';

      let finalPrompt = '';
      if (isSeedanceTarget) {
        finalPrompt = [
          `STRICT 1:1 3D SCENE STRUCTURE, CAMERA & MOTION TRANSFER FROM @Video 1:`,
          seedanceCameraRule,
          staticPoseRule,
          depthStructureRule,
          ...(mappingLines.length > 0 ? ['EXACT ELEMENT MAPPING:', ...mappingLines] : []),
          unmappedRule,
          fxRule,
          sceneDesc,
          `CRITICAL RULES: Follow the EXACT camera motion/framing, front-to-back occlusion order, 3D positions, and individual motion of each element in @Video 1 at every second. Never move a background object beside a foreground character, never duplicate one character's pose onto another object, and never leave raw wooden mannequins or untextured 3D meshes.`
        ].filter(Boolean).join(' ');
      } else {
        finalPrompt = [
          sceneDesc,
          genericCameraRule,
          staticPoseRule,
          depthStructureRule,
          ...mappingLines,
          unmappedRule,
          fxRule,
          `Replace placeholder 3D models cleanly with realistic subjects and materials while keeping exact depth occlusion and camera movement. No wooden mannequin, no wireframe.`
        ].filter(Boolean).join(' ');
      }

      if (finalPrompt.length > 2400) {
        finalPrompt = finalPrompt.substring(0, 2400);
      }

      this.toastr.info(
        `Đã gửi cảnh 3D (${visibleProps.length} đồ vật${activeFxNames.length ? ' + ' + activeFxNames.length + ' FX' : ''}) + ${this.aiVideo3dRefImages.length} ảnh mẫu tới Mì Tôm AI (${targetModel})...`,
        'AI Video 3D',
        { timeOut: 6000 }
      );

      const outMeta: { url?: string | null; duration?: number; characterOrientation?: 'video' | 'image' } = {
        characterOrientation: isKlingMotionTarget ? 'video' : undefined
      };
      // Volcengine Seedance 2.0/2.5 khi chỉnh sửa/thay thế đối tượng trên @Video 1 (video editing)
      // bắt buộc truyền ratio='adaptive' và duration=-1 để bám đúng tỷ lệ & độ dài của video 3D đầu vào (đã cắt chuẩn bởi FFmpeg).
      const reqAspectRatio = (isSeedanceTarget && isMotionModel) ? 'adaptive' : this.aiVideo3dAspectRatio;
      const reqDuration = (isSeedanceTarget && isMotionModel) ? -1 : this.aiVideo3dDuration;
      const resultBase64 = await this.genaiService.generateVideoUModelverse(
        finalPrompt,
        reqAspectRatio,
        referenceImages,
        reqDuration,
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

      this.aiVideo3dResultRemoteUrl = outMeta.url || null;
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
        this.aiVideo3dResultFilePath = null;
        this.aiVideo3dResultPreviewUrl = outMeta.url;
      }

      // Lưu bản ghi vào lịch sử Video AI của cảnh hiện tại (giữ tối đa 20 video gần nhất)
      const histItem = {
        id: 'vid_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36),
        createdAt: Date.now(),
        prompt: (this.aiVideo3dPrompt || '').trim(),
        duration: Number(this.aiVideo3dDuration) || 5,
        aspectRatio: this.aiVideo3dAspectRatio,
        resolution: this.aiVideo3dResolution,
        model: targetModel,
        capturedFilePath: this.aiVideo3dCapturedFilePath || null,
        resultFilePath: this.aiVideo3dResultFilePath || null,
        resultUrl: this.aiVideo3dResultRemoteUrl || null,
        refImageCount: this.aiVideo3dRefImages.length,
        cameraMode: this.aiVideo3dCameraMode
      };
      this.aiVideo3dHistory = [histItem, ...this.aiVideo3dHistory].slice(0, 20);
      this.aiVideo3dActiveHistoryId = histItem.id;
      this.scheduleSaveAiVideo3dState(true);

      this.aiVideo3dStatusText = '';
      this.toastr.success('Mì Tôm AI đã tạo Video từ cảnh 3D thành công!', 'AI Video 3D');
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
    if (this.timelinePropId !== pid) {
      this._aiPoseUndoStack = [];
      this.lastAiPoseExplanation = '';
      this.poseRefFiles = [];
      this.isPoseSaveBoxOpen = false;
      this.poseSaveNameDraft = '';
      this.activeSavedPoseId = null;
    }
    this.timelinePropId = pid;
    const prop = this.roomProps?.find((p) => p && p.id === pid);
    this.timelinePropName = prop?.name || pid;
    this.timelineBones = this.sceneService.getPropBones(pid);

    // Đồng bộ kho Clip Keyframe dùng chung từ các nhân vật khác trong phòng và từ thư mục assets/anims/
    this.syncSharedClipsToProp(pid);

    this.timelineClips = this.sceneService.getPropClips(pid);
    this.timelineData = this.sceneService.getPropTimeline(pid);
    this.savedPoses = [...this.sceneService.getPropSavedPoses(pid)];
    this.timelineCurrentTime = Math.round(this.sceneService.getPropCurrentTime(pid) * 100) / 100;

    // Ưu tiên chọn xương đầu tiên có trong danh sách (bỏ qua __root__ nếu mô hình có xương thật)
    const firstSkinned = this.timelineBones.find((b) => b.isSkinnedBone) || this.timelineBones[1] || this.timelineBones[0];
    this.selectedBoneName = firstSkinned ? firstSkinned.name : '__root__';
    this.selectTimelineBone(this.selectedBoneName);
    this.isGlbTimelineOpen = true;
    this.cdr.markForCheck();
  }

  get timelineHasActiveHandGrab(): boolean {
    return !!(this.timelineData?.handGrabs && this.timelineData.handGrabs.length > 0);
  }

  clearActivePropHandGrabs(): void {
    const pid = this.timelinePropId;
    if (!pid) return;
    const cleared = this.sceneService.clearPropHandGrabs(pid, true);
    if (cleared) {
      this.timelineData = this.sceneService.getPropTimeline(pid);
      this.saveTimelineToProp(true);
      this.toastr.info('Đã thả liên kết tay và trả đồ vật về vị trí ban đầu.', 'Timeline 3D');
    }
    this.cdr.markForCheck();
  }

  /** Đồng bộ các Clip Keyframe đã lưu giữa các nhân vật 3D và thư mục ~/Documents/ai.type/data/profiles/{username}/assets/anims/ */
  private async syncSharedClipsToProp(targetPropId: string): Promise<void> {
    if (!targetPropId || !this.sceneService.hasPropRig(targetPropId)) return;
    let changed = false;

    // 1. Đồng bộ từ các đồ vật 3D khác trong cùng căn phòng (không ghi đè clip cùng tên đã có trên nhân vật hiện tại)
    for (const p of this.roomProps || []) {
      if (!p || p.id === targetPropId) continue;
      const savedList = p?.boneTimeline?.savedClips;
      if (Array.isArray(savedList)) {
        for (const clip of savedList) {
          if (this.sceneService.injectSharedKeyframeClip(targetPropId, clip, false)) {
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
            if (parsedClip && this.sceneService.injectSharedKeyframeClip(targetPropId, parsedClip, false)) {
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
    this.editingClipModal = null;
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
    }
    this.activeSavedPoseId = null;
    this.scheduleSilentPoseSave();
    this.cdr.markForCheck();
  }

  private scheduleSilentPoseSave(): void {
    if (this._poseAutoSaveTimer) {
      clearTimeout(this._poseAutoSaveTimer);
    }
    this._poseAutoSaveTimer = setTimeout(() => {
      this._poseAutoSaveTimer = null;
      if (this.timelinePropId) {
        this.saveTimelineToProp(true);
      }
    }, 280);
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
    }
    this.activeSavedPoseId = null;
    this.saveTimelineToProp(true);
    this.cdr.markForCheck();
  }

  resetAllBonesPose(): void {
    if (!this.timelinePropId) return;
    this.boneRot = { x: 0, y: 0, z: 0 };
    this.bonePos = { x: 0, y: 0, z: 0 };
    this.sceneService.resetBonePose(this.timelinePropId);
    this.activeSavedPoseId = null;
    this.saveTimelineToProp(true);
    this.cdr.markForCheck();
  }

  /** Reset toàn bộ dáng về gốc (lưu Hoàn tác + đồng bộ Keyframe tại mốc hiện tại nếu bật Auto-Key) */
  resetAllBonesPoseWithKey(): void {
    const pid = this.timelinePropId;
    if (!pid || !this.sceneService.hasPropRig(pid)) return;
    const prevSnapshot = this.sceneService.capturePoseSnapshot(pid);
    this._aiPoseUndoStack.push({
      propId: pid,
      time: this.timelineCurrentTime,
      autoKey: this.timelineAutoKey,
      snapshot: prevSnapshot
    });
    if (this._aiPoseUndoStack.length > 15) {
      this._aiPoseUndoStack.shift();
    }
    this.sceneService.resetBonePose(pid);
    if (this.timelineAutoKey) {
      const zeroRot = { x: 0, y: 0, z: 0 };
      const zeroPos = { x: 0, y: 0, z: 0 };
      const touched = new Set<string>(prevSnapshot.bones.map((b) => b.boneName));
      for (const kf of prevSnapshot.keyframes) {
        touched.add(kf.boneName);
      }
      for (const boneName of touched) {
        this.sceneService.upsertBoneKeyframe(pid, boneName, this.timelineCurrentTime, zeroRot, zeroPos);
      }
    }
    this.activeSavedPoseId = null;
    this.saveTimelineToProp(true);
    this.timelineData = this.sceneService.getPropTimeline(pid);
    this.boneRot = { x: 0, y: 0, z: 0 };
    this.bonePos = { x: 0, y: 0, z: 0 };
    this.lastAiPoseExplanation = 'Đã đưa toàn bộ khớp xương về tư thế gốc.';
    this.cdr.markForCheck();
  }

  openSavePoseBox(): void {
    const pid = this.timelinePropId;
    if (!pid || !this.sceneService.hasPropRig(pid)) return;
    const refHint = this.poseRefFiles[0]?.name
      ? this.poseRefFiles[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
      : '';
    const promptHint = (this.posePromptText || this._lastPoseLabelHint || '').trim();
    const defaultName =
      (promptHint ? promptHint.slice(0, 36) : '') ||
      (refHint ? refHint.slice(0, 36) : '') ||
      `Tư thế #${this.savedPoses.length + 1}`;
    this.poseSaveNameDraft = defaultName;
    this.isPoseSaveBoxOpen = true;
    this.cdr.markForCheck();
  }

  cancelSavePoseBox(): void {
    this.isPoseSaveBoxOpen = false;
    this.poseSaveNameDraft = '';
    this.cdr.markForCheck();
  }

  onSavePoseNameKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter' && !(event as any).isComposing) {
      event.preventDefault();
      this.confirmSaveCurrentPose();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelSavePoseBox();
    }
  }

  confirmSaveCurrentPose(): void {
    const pid = this.timelinePropId;
    if (!pid || !this.sceneService.hasPropRig(pid)) return;
    const name = (this.poseSaveNameDraft || '').trim() || `Tư thế #${this.savedPoses.length + 1}`;
    const saved = this.sceneService.saveCurrentPosePreset(pid, name);
    if (!saved) {
      this.toastr.warning('Không thể lưu tư thế hiện tại.', 'Lưu tư thế');
      return;
    }
    this.savedPoses = [...this.sceneService.getPropSavedPoses(pid)];
    this.activeSavedPoseId = saved.id;
    this.isPoseSaveBoxOpen = false;
    this.poseSaveNameDraft = '';
    this.saveTimelineToProp(true);
    this.lastAiPoseExplanation = `Đã lưu tư thế "${saved.name}" (${saved.bones.length} khớp).`;
    this.toastr.success(`Đã lưu tư thế "${saved.name}" (${saved.bones.length} khớp)!`, 'Lưu tư thế');
    this.cdr.markForCheck();
  }

  applySavedPose(pose: GlbSavedPose): void {
    const pid = this.timelinePropId;
    if (!pid || !pose || !this.sceneService.hasPropRig(pid)) return;
    const res = this.sceneService.applySavedPosePreset(pid, pose.id, {
      time: this.timelineCurrentTime,
      autoKey: this.timelineAutoKey
    });
    if (!res.pose) return;
    this._aiPoseUndoStack.push({
      propId: pid,
      time: this.timelineCurrentTime,
      autoKey: this.timelineAutoKey,
      snapshot: res.previousSnapshot
    });
    if (this._aiPoseUndoStack.length > 15) {
      this._aiPoseUndoStack.shift();
    }
    this.activeSavedPoseId = pose.id;
    this.timelineData = this.sceneService.getPropTimeline(pid);
    this.syncSelectedBoneSliders(pid);
    this.saveTimelineToProp(true);
    this.lastAiPoseExplanation = `Đã nạp tư thế "${pose.name}".`;
    this.cdr.markForCheck();
  }

  deleteSavedPose(pose: GlbSavedPose, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const pid = this.timelinePropId;
    if (!pid || !pose) return;
    if (this.sceneService.deleteSavedPosePreset(pid, pose.id)) {
      this.savedPoses = [...this.sceneService.getPropSavedPoses(pid)];
      if (this.activeSavedPoseId === pose.id) {
        this.activeSavedPoseId = null;
      }
      this.saveTimelineToProp(true);
      this.toastr.info(`Đã xóa tư thế "${pose.name}".`, 'Tư thế đã lưu');
      this.cdr.markForCheck();
    }
  }

  onPosePromptKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey && !(event as any).isComposing) {
      event.preventDefault();
      this.applyAiPosePrompt();
    }
  }

  triggerPoseRefFileUpload(): void {
    if (this.isApplyingAiPose) return;
    this.poseRefFileInput?.nativeElement?.click();
  }

  removePoseRefFile(id: string): void {
    this.poseRefFiles = this.poseRefFiles.filter((f) => f.id !== id);
    this.cdr.markForCheck();
  }

  onPosePromptPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      this.ingestPoseRefFiles(files);
    }
  }

  onPoseRefDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isPoseRefDragOver) {
      this.isPoseRefDragOver = true;
      this.cdr.markForCheck();
    }
  }

  onPoseRefDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isPoseRefDragOver) {
      this.isPoseRefDragOver = false;
      this.cdr.markForCheck();
    }
  }

  onPoseRefDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isPoseRefDragOver = false;
    const fileList = event.dataTransfer?.files;
    if (fileList && fileList.length > 0) {
      this.ingestPoseRefFiles(Array.from(fileList));
    }
    this.cdr.markForCheck();
  }

  onPoseRefFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length > 0) {
      this.ingestPoseRefFiles(files);
    }
  }

  private async ingestPoseRefFiles(files: File[]): Promise<void> {
    const maxTotal = 4;
    let added = 0;

    for (const file of files) {
      if (this.poseRefFiles.length >= maxTotal) {
        this.toastr.info(`Chỉ đính kèm tối đa ${maxTotal} tệp mẫu tư thế cùng lúc.`, 'AI Chỉnh tư thế');
        break;
      }

      const id = 'pref_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e5).toString(36);
      const fname = file.name || `anh-mau-${this.poseRefFiles.length + 1}.png`;

      if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fname)) {
        try {
          const encoded = await this.encodePoseRefImageFile(file);
          this.poseRefFiles.push({
            id,
            name: fname,
            kind: 'image',
            dataUrl: encoded.dataUrl,
            base64: encoded.base64,
            mimeType: encoded.mimeType
          });
          added++;
        } catch (e: any) {
          this.toastr.warning(`Không đọc được ảnh "${fname}".`, 'AI Chỉnh tư thế');
        }
      } else if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(fname)) {
        try {
          const frame = await this.extractSinglePoseFrameFromVideo(file);
          this.poseRefFiles.push({
            id,
            name: fname,
            kind: 'image',
            dataUrl: frame.dataUrl,
            base64: frame.base64,
            mimeType: frame.mimeType
          });
          added++;
        } catch (e: any) {
          this.toastr.warning(`Không trích xuất được khung hình từ video "${fname}".`, 'AI Chỉnh tư thế');
        }
      } else if (file.type.startsWith('text/') || /\.(json|txt|md)$/i.test(fname)) {
        try {
          const text = (await file.text()).slice(0, 12000);
          this.poseRefFiles.push({
            id,
            name: fname,
            kind: 'text',
            textContent: text
          });
          added++;
        } catch (e: any) {
          this.toastr.warning(`Không đọc được tệp văn bản "${fname}".`, 'AI Chỉnh tư thế');
        }
      } else {
        this.toastr.warning(`Định dạng "${fname}" chưa hỗ trợ. Hãy chọn ảnh, video hoặc file JSON/TXT.`, 'AI Chỉnh tư thế');
      }
    }

    if (added > 0) {
      this.cdr.markForCheck();
    }
  }

  private encodePoseRefImageFile(file: File): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.onload = () => {
        const rawDataUrl = String(reader.result || '');
        const img = new Image();
        img.onerror = () => {
          const mime = file.type || 'image/png';
          const b64 = rawDataUrl.replace(/^data:[^;]+;base64,/, '');
          resolve({ dataUrl: rawDataUrl, base64: b64, mimeType: mime });
        };
        img.onload = () => {
          const maxDim = 1024;
          const iw = img.naturalWidth || img.width || 512;
          const ih = img.naturalHeight || img.height || 512;
          const scale = Math.min(1, maxDim / Math.max(iw, ih));
          const cw = Math.max(64, Math.round(iw * scale));
          const ch = Math.max(64, Math.round(ih * scale));
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const mime = file.type || 'image/png';
            resolve({ dataUrl: rawDataUrl, base64: rawDataUrl.replace(/^data:[^;]+;base64,/, ''), mimeType: mime });
            return;
          }
          ctx.drawImage(img, 0, 0, cw, ch);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve({
            dataUrl,
            base64: dataUrl.replace(/^data:[^;]+;base64,/, ''),
            mimeType: 'image/jpeg'
          });
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  private extractSinglePoseFrameFromVideo(file: File): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) {}
        URL.revokeObjectURL(url);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout extracting video frame'));
      }, 15000);

      video.onerror = () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error('Video decode error'));
      };

      video.onloadedmetadata = () => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const targetT = Math.min(Math.max(0.1, dur * 0.35), Math.max(0.1, dur - 0.05));
        video.onseeked = () => {
          clearTimeout(timer);
          try {
            const maxDim = 1024;
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            const scale = Math.min(1, maxDim / Math.max(vw, vh));
            const cw = Math.max(64, Math.round(vw * scale));
            const ch = Math.max(64, Math.round(vh * scale));
            const canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas unavailable');
            ctx.drawImage(video, 0, 0, cw, ch);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
            cleanup();
            resolve({
              dataUrl,
              base64: dataUrl.replace(/^data:[^;]+;base64,/, ''),
              mimeType: 'image/jpeg'
            });
          } catch (err) {
            cleanup();
            reject(err);
          }
        };
        try {
          video.currentTime = targetT;
        } catch (err) {
          clearTimeout(timer);
          cleanup();
          reject(err);
        }
      };
    });
  }

  undoAiPose(): void {
    const pid = this.timelinePropId;
    if (!pid || !this.canUndoAiPose) return;
    const entry = this._aiPoseUndoStack.pop();
    if (!entry) return;
    this.sceneService.restorePoseSnapshot(pid, entry.snapshot);
    this.timelineData = this.sceneService.getPropTimeline(pid);
    if (this.selectedBoneName) {
      const pose = this.sceneService.getBonePoseDelta(pid, this.selectedBoneName);
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
    this.activeSavedPoseId = null;
    this.saveTimelineToProp(true);
    this.lastAiPoseExplanation = 'Đã hoàn tác về tư thế trước đó.';
    this.toastr.info('Đã hoàn tác về tư thế trước đó.', 'AI Chỉnh tư thế');
    this.cdr.markForCheck();
  }

  async applyAiPosePrompt(): Promise<void> {
    const pid = this.timelinePropId;
    const prompt = (this.posePromptText || '').trim();
    const hasRefFiles = this.poseRefFiles.length > 0;
    if (!pid || !this.sceneService.hasPropRig(pid)) {
      this.toastr.warning('Vui lòng chọn một nhân vật hoặc mô hình 3D có khớp xương trước.', 'AI Chỉnh tư thế');
      return;
    }
    if ((!prompt && !hasRefFiles) || this.isApplyingAiPose) {
      return;
    }

    const poseCtx = this.sceneService.getPropPoseContext(pid);
    if (!poseCtx) {
      this.toastr.warning('Không đọc được cấu trúc khớp xương của mô hình này.', 'AI Chỉnh tư thế');
      return;
    }

    this.isApplyingAiPose = true;
    this.cdr.markForCheck();

    try {
      const refImages = this.poseRefFiles.filter((f) => f.kind === 'image' && !!f.base64);
      const refTexts = this.poseRefFiles.filter((f) => f.kind === 'text' && !!f.textContent);

      // =========================================================================
      // BƯỚC 1 (ƯU TIÊN TUYỆT ĐỐI KHI CÓ ẢNH THAM CHIẾU):
      // Dùng bộ ước lượng khung xương 3D SMPL thật (NLF NeurIPS 2024 qua Electron)
      // để tái tạo CHÍNH XÁC 1:1 tư thế toàn thân 20 khớp trong ảnh tham chiếu!
      // =========================================================================
      let nlfApplied = false;
      let undoSnapshotBeforeRun: any = null;
      const elec = (window as any).electron;

      if (refImages.length > 0 && poseCtx.hasSkinnedSkeleton && typeof elec?.extractImagePose3d === 'function') {
        try {
          this.lastAiPoseExplanation = 'Đang đo khung xương 3D chính xác từ ảnh tham chiếu...';
          this.cdr.markForCheck();

          const primaryImg = refImages[0];
          const nlfRes = await elec.extractImagePose3d({
            base64: primaryImg.base64,
            filename: primaryImg.name || 'pose-ref.jpg'
          });

          if (nlfRes?.success && nlfRes?.data && Array.isArray(nlfRes.data.bones) && nlfRes.data.bones.length >= 8) {
            const nlfApplyRes = this.sceneService.applyAiStaticPose(
              pid,
              {
                mode: 'replace',
                poseSpace: 'tpose',
                sourceLegLength: Number(nlfRes.data.sourceLegLength) || 0,
                bones: nlfRes.data.bones
              },
              {
                time: this.timelineCurrentTime,
                autoKey: this.timelineAutoKey
              }
            );

            if (nlfApplyRes.appliedBones.length >= 6) {
              nlfApplied = true;
              undoSnapshotBeforeRun = nlfApplyRes.previousSnapshot;

              // Nếu người dùng KHÔNG gõ thêm yêu cầu tinh chỉnh riêng (chỉ đính ảnh mẫu để bắt chước đúng tư thế),
              // giữ nguyên 100% kết quả khung xương 3D SMPL chính xác tuyệt đối — không để LLM ước lượng lại làm sai góc!
              if (!prompt) {
                this._aiPoseUndoStack.push({
                  propId: pid,
                  time: this.timelineCurrentTime,
                  autoKey: this.timelineAutoKey,
                  snapshot: undoSnapshotBeforeRun
                });
                if (this._aiPoseUndoStack.length > 15) {
                  this._aiPoseUndoStack.shift();
                }

                this.timelineData = this.sceneService.getPropTimeline(pid);
                this.syncSelectedBoneSliders(pid);
                this.activeSavedPoseId = null;
                this._lastPoseLabelHint = (primaryImg.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
                this.saveTimelineToProp(true);

                const devLabel = String(nlfRes.data.device || 'gpu').toUpperCase();
                const msg = `Đã sao chép chính xác tư thế 3D từ ảnh mẫu (${nlfApplyRes.appliedBones.length} khớp · SMPL ${devLabel}).`;
                this.lastAiPoseExplanation = msg;
                this.toastr.success(msg, 'AI Chỉnh tư thế');
                return;
              }
            }
          }
        } catch (nlfErr) {
          console.warn('[AI Pose] NLF 3D image pose fallback sang Vision AI:', nlfErr);
        }
      }

      // Đọc lại ngữ cảnh tư thế mới nhất (sau khi NLF đã áp tư thế gốc từ ảnh nếu có)
      const activePoseCtx = nlfApplied ? (this.sceneService.getPropPoseContext(pid) || poseCtx) : poseCtx;

      const armRestNote = activePoseCtx.poseSpace === 'tpose'
        ? 'Nhân vật đang ở hệ chuẩn T-Pose (góc 0° là hai cánh tay dang ngang 90° so với thân). Để hạ tay buông xuôi sát thân cần lArm.z ≈ -72°, rArm.z ≈ +72°.'
        : activePoseCtx.restArmDropDeg >= 30
          ? `Nhân vật ở tư thế nghỉ A-Pose (hai cánh tay gốc đã xuôi xuống sẵn ~${activePoseCtx.restArmDropDeg}° so với phương ngang). Để hạ tay xuôi sát thân chỉ cần lArm.z ≈ -${Math.max(10, 72 - activePoseCtx.restArmDropDeg)}°, rArm.z ≈ +${Math.max(10, 72 - activePoseCtx.restArmDropDeg)}°; để dang ngang chữ T cần lArm.z ≈ +${activePoseCtx.restArmDropDeg}°, rArm.z ≈ -${activePoseCtx.restArmDropDeg}°; để giơ tay thẳng lên trời cần lArm.z ≈ +${Math.min(165, 85 + activePoseCtx.restArmDropDeg)}°, rArm.z ≈ -${Math.min(165, 85 + activePoseCtx.restArmDropDeg)}°.`
          : `Nhân vật ở tư thế nghỉ gần T-Pose (hai cánh tay gốc gần như dang ngang, góc hạ ~${activePoseCtx.restArmDropDeg}°). Để hạ tay xuôi sát thân cần lArm.z ≈ -${Math.max(55, 72 - activePoseCtx.restArmDropDeg)}°, rArm.z ≈ +${Math.max(55, 72 - activePoseCtx.restArmDropDeg)}°; để giơ tay thẳng lên trời cần lArm.z ≈ +85°, rArm.z ≈ -85°.`;

      const fingerInfo = activePoseCtx.fingerBones.length > 0
        ? `- Các khớp ngón tay (CHỈ chỉnh khi yêu cầu hoặc ảnh mẫu có cử chỉ nắm tay / chỉ tay / cầm nắm / xòe ngón rõ rệt): ${JSON.stringify(activePoseCtx.fingerBones)}`
        : '- Mô hình không có khớp ngón tay riêng.';

      const currentPoseJson = activePoseCtx.currentPose.length > 0
        ? JSON.stringify(activePoseCtx.currentPose)
        : '[] (đang ở tư thế nghỉ mặc định)';

      // Nếu NLF SMPL 3D ĐÃ áp tư thế chuẩn từ ảnh mẫu và người dùng có gõ thêm prompt:
      // chụp ảnh 3D hiện tại để AI đối chiếu ảnh mẫu + render 3D và CHỈ chỉnh phần sửa thêm / ngón tay theo đúng prompt!
      let currentRenderSnap: { dataUrl: string; base64: string; mimeType: string } | null = null;
      if (nlfApplied) {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        currentRenderSnap = this.sceneService.captureSceneSnapshotBase64(640);
      }

      const refSectionParts: string[] = [];
      if (refImages.length > 0) {
        if (nlfApplied) {
          refSectionParts.push(
            `### TRẠNG THÁI ĐÃ TRÍCH XUẤT KHUNG XƯƠNG 3D SMPL TỪ ẢNH MẪU (${refImages.map((f) => f.name).join(', ')}):\n` +
            `- Hệ thống thị giác 3D SMPL vừa đo chính xác 20 khớp thân từ Ảnh #1 (ảnh tham chiếu) và áp lên nhân vật 3D${currentRenderSnap ? ' (xem Ảnh cuối cùng là kết quả 3D hiện tại)' : ''}.\n` +
            `- **QUY TẮC BẮT BUỘC**: LUÔN trả về \`"mode": "adjust"\`. KHÔNG ĐƯỢC reset hay phá hỏng tư thế 20 khớp thân đã khớp với ảnh tham chiếu!\n` +
            `- Nếu yêu cầu của người dùng CHỈ muốn bắt chước đúng ảnh mẫu (và kết quả 3D đã khớp đúng dáng ảnh mẫu) thì trả về \`"bones": []\` (hoặc CHỈ tinh chỉnh nhẹ các ngón tay/bàn tay/góc đầu nếu thật sự lệch so với ảnh mẫu).\n` +
            `- Nếu người dùng yêu cầu chỉnh SỬA THÊM (VD: "nhưng nắm chặt bàn tay phải", "quay đầu nhìn sang trái", "nâng chân cao hơn") thì CHỈ xuất các khớp cần sửa đổi thêm đó.`
          );
        } else {
          refSectionParts.push(
            `### ẢNH MẪU TƯ THẾ ĐÍNH KÈM (${refImages.length} ảnh: ${refImages.map((f) => f.name).join(', ')}):\n` +
            `- BẮT BUỘC nhân vật 3D phải bắt chước CHÍNH XÁC tư thế trong ảnh mẫu:\n` +
            `  1. Đo đúng góc nghiêng/bay/té ngã của toàn thân (\`hips.rot.x/y/z\`) và độ cao trọng tâm \`hips.pos.y\`.\n` +
            `  2. Phân biệt CHÍNH XÁC bên TRÁI giải phẫu (\`lArm\`, \`lUpLeg\`) và bên PHẢI giải phẫu (\`rArm\`, \`rUpLeg\`) của chính nhân vật trong ảnh (lưu ý nếu ảnh nhìn từ phía trước thì phía bên trái của khung ảnh là tay PHẢI của nhân vật!).\n` +
            `  3. Khớp chặt góc vai, bắp tay, khuỷu tay, cổ tay, đầu/cổ, đùi, đầu gối và cổ chân sao cho bóng dáng (silhouette) giống ảnh mẫu tối đa.`
          );
        }
      }
      if (refTexts.length > 0) {
        refSectionParts.push(
          `### TỆP DỮ LIỆU MẪU ĐÍNH KÈM:\n` +
          refTexts.map((f) => `--- ${f.name} ---\n${f.textContent}`).join('\n\n')
        );
      }
      const refSection = refSectionParts.length > 0 ? `\n${refSectionParts.join('\n\n')}\n` : '';
      const effectivePrompt = prompt || 'Bắt chước chính xác tuyệt đối tư thế toàn thân của nhân vật trong ảnh mẫu đính kèm.';

      const systemPrompt = `Bạn là **Chuyên gia Tạo dáng & Giải phẫu Nhân vật 3D (3D Character Rigging & Posing Artist)**.
Nhiệm vụ: Thiết kế góc xoay (Euler độ) và dịch chuyển vị trí (mét) cho các khớp xương của nhân vật 3D để đạt ĐÚNG tư thế người dùng yêu cầu (bắt buộc bám sát ảnh/tệp mẫu đính kèm nếu có), tự nhiên, cân đối và không xuyên thấu thân thể.

### THÔNG TIN BỘ XƯƠNG NHÂN VẬT HIỆN TẠI:
- Loại mô hình: ${activePoseCtx.hasSkinnedSkeleton ? 'Nhân vật có khung xương mềm (Skinned Humanoid)' : 'Mô hình khớp cứng'}
- Tư thế nghỉ gốc (0, 0, 0): ${armRestNote}
- Ánh xạ khớp xương chính của riêng nhân vật này (ƯU TIÊN dùng đúng tên khớp thực trong bảng này):
${JSON.stringify(activePoseCtx.anatomy, null, 2)}
- Tất cả khớp thân an toàn: ${JSON.stringify(activePoseCtx.safeBoneNames)}
${fingerInfo}
- Khớp người dùng đang chọn trên bảng: "${this.selectedBoneName || '__root__'}"
- Tư thế hiện tại của nhân vật (các khớp đang khác 0): ${currentPoseJson}

### QUY ƯỚC HỆ TRỤC CHUẨN NHÂN VẬT (CHARACTER CARDINAL SPACE):
Tất cả góc xoay \`rot: {x, y, z}\` đều tính bằng **độ (-180..180)** theo hệ trục chuẩn nhân vật (+X = sang TRÁI nhân vật, +Y = hướng ĐỈNH ĐẦU, +Z = hướng TRƯỚC MẶT):
1. **Cột sống, cổ, đầu (\`hips\`, \`lowerSpine\`, \`midSpine\`, \`chest\`, \`neck\`, \`head\`)**:
   - \`x > 0\` (+10..+85): cúi người / gật đầu / ngã nhào về trước; \`x < 0\` (-10..-45): ngửa người / ngẩng đầu.
   - \`y > 0\` (+10..+45): xoay sang TRÁI; \`y < 0\` (-10..-45): xoay sang PHẢI.
   - \`z > 0\`: nghiêng sang PHẢI; \`z < 0\`: nghiêng sang TRÁI.
2. **Chân (\`lUpLeg\`, \`rUpLeg\`, \`lLeg\`, \`rLeg\`, \`lFoot\`, \`rFoot\`)**:
   - Đùi (\`lUpLeg\`, \`rUpLeg\`): \`x < 0\` (-20..-105) nâng đùi lên trước (ngồi ghế ≈ -85..-95°); \`x > 0\` (+10..+55) duỗi chân ra sau; \`z > 0\` dang chân trái ra ngoài / khép chân phải, \`z < 0\` dang chân phải ra ngoài.
   - Đầu gối (\`lLeg\`, \`rLeg\`): **LUÔN \`x >= 0\`** (+15..+125) gập cẳng chân ra sau (ngồi ghế ≈ +85..+95°; KHÔNG bao giờ dùng \`x < 0\`).
   - Bàn chân (\`lFoot\`, \`rFoot\`): \`x > 0\` duỗi mũi chân xuống, \`x < 0\` gập mũi chân lên.
3. **Cánh tay & Cẳng tay (\`lShoulder\`, \`rShoulder\`, \`lArm\`, \`rArm\`, \`lForeArm\`, \`rForeArm\`, \`lHand\`, \`rHand\`)**:
   - Luôn tính góc delta so với tư thế nghỉ gốc đã mô tả ở trên!
   - \`lArm\` (tay trái): \`z > 0\` nâng giang tay lên cao, \`z < 0\` hạ sát thân; \`y < 0\` đưa cánh tay về phía trước ngực, \`y > 0\` đưa ra sau lưng; \`x < 0\` xoay/nâng tay lên trước.
   - \`rArm\` (tay phải): \`z < 0\` nâng giang tay lên cao, \`z > 0\` hạ sát thân; \`y > 0\` đưa cánh tay về phía trước ngực, \`y < 0\` đưa ra sau lưng; \`x < 0\` xoay/nâng tay lên trước.
   - Khuỷu tay (\`lForeArm\`, \`rForeArm\`): gập cẳng tay tự nhiên về phía trước/trong (vd \`lForeArm\`: \`y: -55..-110\` hoặc \`x: -40..-90\`, \`rForeArm\`: \`y: +55..+110\` hoặc \`x: -40..-90\` tùy hướng xoay bắp tay).
4. **Hạ thấp/nâng trọng tâm (\`hips.pos.y\`, đơn vị mét)**:
   - Ngồi ghế: \`pos.y ≈ -0.35..-0.45\`; ngồi xổm/squat: \`pos.y ≈ -0.25..-0.42\`; quỳ/ngồi bệt/té ngã gần sàn: \`pos.y ≈ -0.55..-0.85\`; nhảy lên: \`pos.y ≈ +0.15..+0.35\`.

### CHỌN CHẾ ĐỘ \`mode\`:
- \`"replace"\`: Khi người dùng mô tả một tư thế toàn thân mới hoặc đính kèm ảnh mẫu toàn thân (CHỈ dùng khi chưa có SMPL 3D trích xuất sẵn).
- \`"adjust"\`: Khi tinh chỉnh một bộ phận trên tư thế hiện tại (HOẶC BẮT BUỘC khi SMPL 3D đã trích xuất sẵn tư thế từ ảnh mẫu).
${refSection}
### YÊU CẦU TỪ NGƯỜI DÙNG:
"${effectivePrompt}"

### ĐỊNH DẠNG ĐẦU RA (CHỈ TRẢ VỀ JSON THUẦN TÚY, KHÔNG GIẢI THÍCH NGOÀI JSON):
{
  "mode": "${nlfApplied ? 'adjust' : 'replace'}",
  "explanation": "Mô tả ngắn gọn 1 câu tiếng Việt về tư thế vừa chỉnh",
  "bones": [
    { "boneName": "${activePoseCtx.anatomy['hips'] || '__root__'}", "rot": { "x": 0, "y": 0, "z": 0 }, "pos": { "x": 0, "y": 0, "z": 0 } }
  ]
}`;

      const parts: any[] = [{ text: systemPrompt }];
      for (const img of refImages) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: img.base64
          }
        });
      }
      if (currentRenderSnap) {
        parts.push({
          inlineData: {
            mimeType: currentRenderSnap.mimeType,
            data: currentRenderSnap.base64
          }
        });
      }

      const aiRes: any = await this.genaiService.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts }],
        config: {
          skipTTS: true,
          disableThinking: true,
          temperature: 0.15
        } as any
      });

      const rawReply =
        aiRes?.text ||
        aiRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
        '';
      const parsed = this.extractJsonFromAiText(rawReply);

      if (!nlfApplied && (!parsed || !Array.isArray(parsed.bones) || parsed.bones.length === 0)) {
        this.toastr.warning('AI chưa trả về dữ liệu khớp xương hợp lệ. Hãy thử mô tả tư thế rõ ràng hơn.', 'AI Chỉnh tư thế');
        return;
      }

      let appliedBonesCount = nlfApplied ? 20 : 0;
      if (parsed && Array.isArray(parsed.bones) && parsed.bones.length > 0) {
        const result = this.sceneService.applyAiStaticPose(
          pid,
          {
            mode: nlfApplied ? 'adjust' : (parsed.mode === 'adjust' ? 'adjust' : 'replace'),
            poseSpace: 'rest',
            bones: parsed.bones
          },
          {
            time: this.timelineCurrentTime,
            autoKey: this.timelineAutoKey
          }
        );
        if (!undoSnapshotBeforeRun) {
          undoSnapshotBeforeRun = result.previousSnapshot;
        }
        appliedBonesCount = nlfApplied ? Math.max(20, result.appliedBones.length) : result.appliedBones.length;

        // Vòng đối chiếu trực quan tự động (chỉ chạy ở chế độ fallback không có NLF SMPL khi có ảnh mẫu):
        // chụp ảnh 3D vừa dựng, so sánh với ảnh tham chiếu và tự chỉnh lại các khớp còn sai lệch!
        if (!nlfApplied && refImages.length > 0 && result.appliedBones.length > 0) {
          try {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const renderSnap = this.sceneService.captureSceneSnapshotBase64(640);
            const postCtx = this.sceneService.getPropPoseContext(pid);
            if (renderSnap && postCtx) {
              this.lastAiPoseExplanation = 'Đang đối chiếu trực quan 3D với ảnh mẫu để tinh chỉnh sát hơn...';
              this.cdr.markForCheck();
              const verifyPrompt = `Bạn đang kiểm định chất lượng tư thế 3D so với ảnh mẫu.
- Ảnh #1: Ảnh tham chiếu gốc mà nhân vật BẮT BUỘC phải bắt chước chính xác tư thế.
- Ảnh #2: Ảnh chụp kết quả nhân vật 3D hiện tại trên sân khấu.
- Góc xoay các khớp hiện tại (Character Cardinal Space): ${JSON.stringify(postCtx.currentPose)}
- Ánh xạ tên khớp chuẩn của nhân vật: ${JSON.stringify(postCtx.anatomy)}

Hãy so sánh THẬT KỸ Ảnh #2 với Ảnh #1:
1. Góc nghiêng toàn thân (\`hips.rot.x/y/z\`) đã giống hướng bay/ngã/nghiêng trong Ảnh #1 chưa?
2. Tay trái (\`lArm\`, \`lForeArm\`) và tay phải (\`rArm\`, \`rForeArm\`) có bị ngược trái-phải hoặc chưa vươn/gập đúng góc như Ảnh #1 không?
3. Hai chân (\`lUpLeg\`, \`lLeg\`, \`rUpLeg\`, \`rLeg\`) và đầu (\`head\`) có khớp silhouette Ảnh #1 chưa?

Trả về JSON thuần túy với \`"mode": "adjust"\` chỉ chứa các khớp CẦN SỬA LẠI góc TỔNG MỚI để Ảnh #2 khớp sát Ảnh #1 nhất (nếu đã khớp tốt thì trả về \`"bones": []\`):
{
  "mode": "adjust",
  "explanation": "Mô tả ngắn các khớp vừa căn chỉnh lại cho khớp ảnh mẫu",
  "bones": []
}`;
              const verifyRes: any = await this.genaiService.generateContent({
                model: 'gemini-3.8-flash',
                contents: [{
                  role: 'user',
                  parts: [
                    { text: verifyPrompt },
                    { inlineData: { mimeType: refImages[0].mimeType || 'image/jpeg', data: refImages[0].base64 } },
                    { inlineData: { mimeType: renderSnap.mimeType, data: renderSnap.base64 } }
                  ]
                }],
                config: { skipTTS: true, disableThinking: true, temperature: 0.1 } as any
              });
              const vRaw =
                verifyRes?.text ||
                verifyRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
                '';
              const vParsed = this.extractJsonFromAiText(vRaw);
              if (vParsed && Array.isArray(vParsed.bones) && vParsed.bones.length > 0) {
                this.sceneService.applyAiStaticPose(
                  pid,
                  { mode: 'adjust', poseSpace: 'rest', bones: vParsed.bones },
                  { time: this.timelineCurrentTime, autoKey: this.timelineAutoKey }
                );
              }
            }
          } catch (_) {}
        }
      }

      if (appliedBonesCount === 0) {
        this.toastr.warning('Không khớp được tên khớp xương nào trên mô hình hiện tại.', 'AI Chỉnh tư thế');
        return;
      }

      if (undoSnapshotBeforeRun) {
        this._aiPoseUndoStack.push({
          propId: pid,
          time: this.timelineCurrentTime,
          autoKey: this.timelineAutoKey,
          snapshot: undoSnapshotBeforeRun
        });
        if (this._aiPoseUndoStack.length > 15) {
          this._aiPoseUndoStack.shift();
        }
      }

      this.timelineData = this.sceneService.getPropTimeline(pid);
      this.syncSelectedBoneSliders(pid);
      this.activeSavedPoseId = null;
      this._lastPoseLabelHint = prompt || (refImages[0]?.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      this.saveTimelineToProp(true);

      const summaryMsg =
        (typeof parsed?.explanation === 'string' && parsed.explanation.trim()) ||
        (nlfApplied
          ? 'Đã bắt chước chính xác tư thế 3D từ ảnh tham chiếu và áp dụng tinh chỉnh.'
          : `Đã chỉnh tư thế trên ${appliedBonesCount} khớp xương.`);
      this.lastAiPoseExplanation = summaryMsg;
      this.posePromptText = '';
      this.toastr.success(summaryMsg, 'AI Chỉnh tư thế');
    } catch (err: any) {
      this.toastr.error(err?.message || 'Không thể chỉnh tư thế bằng AI lúc này.', 'AI Chỉnh tư thế');
    } finally {
      this.isApplyingAiPose = false;
      this.cdr.markForCheck();
    }
  }

  private syncSelectedBoneSliders(pid: string): void {
    if (!this.selectedBoneName) return;
    const pose = this.sceneService.getBonePoseDelta(pid, this.selectedBoneName);
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
      mode: this.timelineData.mode,
      inPlace: this.timelineData.inPlace !== false
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

    // Chỉ tự động đóng gói bộ Keyframe thành Clip mới khi có tên clip rõ ràng (từ AI / Video)
    // hoặc khi người dùng bấm nút Lưu lúc đang biên tập trực tiếp ở tab Keyframe Khớp xương (tránh bấm Lưu ở tab Clip làm nhân bản clip cũ)
    const shouldAutoBake = Boolean(customClipLabel) || (!silent && currentTl?.mode === 'keyframes');
    if (shouldAutoBake && currentTl && Array.isArray(currentTl.keyframes) && currentTl.keyframes.length > 0) {
      const promptTitle = (this.aiMotionPrompt || '').trim();
      const videoTitle = (this.aiMotionVideoName || '').replace(/\.[^.]+$/, '').trim();
      const existingActiveCustom = this.timelineClips.find(
        (c) => c.isCustom && c.name === currentTl.activeClipName
      );
      const customCount = this.timelineClips.filter((c) => c.isCustom).length;
      const autoTitle =
        customClipLabel ||
        (promptTitle ? `AI: ${promptTitle.slice(0, 36)}` : '') ||
        (videoTitle ? `Video: ${videoTitle.slice(0, 32)}` : '') ||
        existingActiveCustom?.name ||
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

    // Luôn đồng bộ ảnh chụp tư thế tĩnh & mốc thời gian hiện tại vào timeline trước khi ghi props.json (để F5 không bị mất tư thế)
    this.sceneService.syncStaticPoseToTimeline(this.timelinePropId);

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

  /**
   * Xuất tệp .glb chuyển động độc lập (hỗ trợ CẢ Clip gốc nhúng sẵn trong GLB lẫn Clip Keyframe tùy chỉnh),
   * tự động lưu vào thư mục assets/anims/, đồng bộ chia sẻ ngay sang tất cả nhân vật 3D khác trong phòng để kế thừa,
   * và tải tệp .glb rời về máy.
   */
  exportTimelineCustomClip(clipName: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.timelinePropId || !clipName) return;

    // Tạo tên gọn đẹp nếu clip gốc trong GLB mang tên UUID (vd: 27dd30be-3d01-...)
    const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(clipName) || /^animation_\d+$/i.test(clipName) || /^mixamo\.com$/i.test(clipName);
    let preferredName: string | undefined = undefined;
    if (isUuidLike) {
      const cleanProp = (this.timelinePropName || 'Character')
        .replace(/\.glb$/i, '')
        .replace(/^Meshy_AI_/i, '')
        .replace(/_withSkin.*$/i, '')
        .replace(/_biped_Animation_/i, ' ')
        .replace(/_/g, ' ')
        .trim();
      preferredName = cleanProp ? `${cleanProp.slice(0, 36)} (Anim)` : `Anim_${clipName.slice(0, 8)}`;
    }

    const portableClip = this.sceneService.extractPortableClip(this.timelinePropId, clipName, preferredName);
    if (!portableClip) {
      this.toastr.warning('Không trích xuất được dữ liệu khớp xương từ Clip này để xuất.', 'Timeline GLB');
      return;
    }

    const glbBuf = this.sceneService.exportClipToGlbArrayBuffer(this.timelinePropId, clipName, portableClip);
    if (!glbBuf) {
      this.toastr.warning('Không đóng gói được tệp .GLB từ Clip này.', 'Timeline GLB');
      return;
    }

    const exportTitle = portableClip.name || clipName;
    const safeName = exportTitle.replace(/[^a-zA-Z0-9_\-\.]/g, '_') || 'ExportedAnim';

    // 1. Ghi tệp .glb portable vào thư mục chung assets/anims/ để mọi nhân vật mở sau này tự động kế thừa
    if ((window as any).electron?.uploadAnimation) {
      (window as any).electron
        .uploadAnimation(this.username || 'admin', exportTitle, glbBuf)
        .catch((e: any) => console.warn('[Timeline GLB] Không ghi được file clip .glb rời:', e));
    }

    // 2. Chia sẻ & kế thừa NGAY LẬP TỨC cho tất cả nhân vật 3D khác đang có trong phòng
    let sharedCount = 0;
    for (const p of this.roomProps || []) {
      if (p && p.id !== this.timelinePropId && this.sceneService.hasPropRig(p.id)) {
        if (this.sceneService.injectSharedKeyframeClip(p.id, portableClip)) {
          const otherTl = this.sceneService.getPropTimeline(p.id);
          if (otherTl) {
            p.boneTimeline = JSON.parse(JSON.stringify(otherTl));
          }
          sharedCount++;
        }
      }
    }
    if (sharedCount > 0) {
      this.profileDataService.saveProps(this.roomProps).subscribe();
    }

    // 3. Tải tệp .glb rời về máy để người dùng có thể nạp thủ công (Nạp Anim .GLB) hoặc lưu trữ
    const blob = new Blob([glbBuf], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.glb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    const shareNote = sharedCount > 0
      ? ` Đã kế thừa ngay cho ${sharedCount} nhân vật khác trong phòng!`
      : ' Các nhân vật khác mở lên sẽ tự động kế thừa từ thư viện chuyển động.';
    this.toastr.success(
      `Đã xuất "${safeName}.glb" (lưu vào assets/anims/${safeName}.glb).${shareNote}`,
      'Timeline GLB',
      { timeOut: 6000 }
    );
  }

  openClipEditDialog(clipName: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.timelinePropId || !clipName) return;

    // Phát ngay clip đang chọn trên scene 3D để người dùng vừa quan sát vừa mô tả điểm cần chỉnh
    this.selectTimelineClip(clipName);

    const summary = this.sceneService.summarizePropClipForAi(this.timelinePropId, clipName);
    if (!summary) return;

    const parts: string[] = [`${summary.duration.toFixed(2)}s`];
    if (summary.isCustom) parts.push(`${summary.kfCount} KF`);
    if (summary.totalDistanceMeters > 0.2) parts.push(`Quãng đường ~${summary.totalDistanceMeters}m`);
    if (summary.aiSegments?.length) parts.push(`${summary.aiSegments.length} chặng AI`);
    else if (!summary.isCustom) parts.push('Clip gốc nhúng trong GLB');

    this.editingClipModal = {
      propId: this.timelinePropId,
      originalName: summary.name,
      nameDraft: summary.name,
      isCustom: summary.isCustom,
      duration: summary.duration,
      kfCount: summary.kfCount,
      aiPrompt: summary.aiPrompt || '',
      hasAiSegments: !!summary.aiSegments?.length,
      summaryText: parts.join(' · '),
      editInstruction: '',
      saveAsNew: !summary.isCustom,
      isProcessing: false
    };
    this.cdr.markForCheck();
  }

  closeClipEditDialog(): void {
    if (this.editingClipModal?.isProcessing) return;
    this.editingClipModal = null;
    this.cdr.markForCheck();
  }

  private async persistRenamedClip(
    propId: string,
    oldName: string,
    newName: string,
    isCustom: boolean
  ): Promise<void> {
    for (const p of this.roomProps || []) {
      if (!p) continue;
      if (p.id === propId) {
        const curTl = this.sceneService.getPropTimeline(propId);
        if (curTl) {
          p.boneTimeline = JSON.parse(JSON.stringify(curTl));
        }
        continue;
      }
      if (!isCustom) continue;
      if (this.sceneService.hasPropRig(p.id)) {
        this.sceneService.renamePropClip(p.id, oldName, newName);
        const otherTl = this.sceneService.getPropTimeline(p.id);
        if (otherTl) {
          p.boneTimeline = JSON.parse(JSON.stringify(otherTl));
        }
      } else if (p.boneTimeline) {
        const bt = p.boneTimeline;
        if (Array.isArray(bt.savedClips)) {
          const matched = bt.savedClips.find((c: any) => c && c.name === oldName);
          if (matched) matched.name = newName;
        }
        if (bt.activeClipName === oldName) {
          bt.activeClipName = newName;
        }
      }
    }

    if (isCustom) {
      const electronApi = (window as any).electron;
      const oldSafeId = oldName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      if (electronApi?.deleteAnimation) {
        try {
          await electronApi.deleteAnimation(this.username || 'admin', oldSafeId, oldName);
        } catch (e) {
          console.warn('[Timeline GLB] Không xóa được bản animation cũ khi đổi tên:', e);
        }
      }
      const glbBuf = this.sceneService.exportClipToGlbArrayBuffer(propId, newName);
      if (glbBuf && electronApi?.uploadAnimation) {
        try {
          await electronApi.uploadAnimation(this.username || 'admin', newName, glbBuf);
        } catch (e) {
          console.warn('[Timeline GLB] Không ghi được tệp animation mới sau khi đổi tên:', e);
        }
      }
    }

    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    try {
      await this.profileDataService.saveProps(this.roomProps).toPromise();
    } catch (e) {
      console.warn('[Timeline GLB] Không lưu được props sau khi đổi tên Clip:', e);
    }
  }

  async saveClipEditNameOnly(): Promise<void> {
    const modal = this.editingClipModal;
    if (!modal || modal.isProcessing) return;
    const oldName = modal.originalName;
    const newName = (modal.nameDraft || '').trim();
    if (!newName) {
      this.toastr.warning('Tên Clip chuyển động không được để trống.', 'Chỉnh sửa Clip');
      return;
    }
    if (newName === oldName) {
      this.editingClipModal = null;
      this.cdr.markForCheck();
      return;
    }

    const res = this.sceneService.renamePropClip(modal.propId, oldName, newName);
    if (res.conflict) {
      this.toastr.warning(`Đã có Clip chuyển động mang tên "${newName}". Vui lòng chọn tên khác.`, 'Chỉnh sửa Clip');
      return;
    }
    if (!res.renamed) return;

    modal.isProcessing = true;
    this.cdr.markForCheck();

    await this.persistRenamedClip(modal.propId, oldName, newName, res.isCustom);

    if (this.timelinePropId === modal.propId) {
      this.timelineClips = this.sceneService.getPropClips(modal.propId);
      this.timelineData = this.sceneService.getPropTimeline(modal.propId);
    }
    this.editingClipModal = null;
    this.toastr.success(`Đã đổi tên Clip chuyển động thành "${newName}".`, 'Chỉnh sửa Clip');
    this.cdr.markForCheck();
  }

  /**
   * Dùng AI tinh chỉnh trực tiếp một Clip chuyển động hiện có (giữ nguyên những phần đang đúng,
   * chỉ sửa đúng điểm sai/chưa ưng theo mô tả của người dùng), đồng thời hỗ trợ đổi tên hoặc lưu thành bản mới.
   */
  async refineClipWithAi(): Promise<void> {
    const modal = this.editingClipModal;
    if (!modal || modal.isProcessing) return;

    const instruction = (modal.editInstruction || '').trim();
    const desiredName = (modal.nameDraft || '').trim() || modal.originalName;

    // Nếu người dùng không nhập yêu cầu sửa hành động mà chỉ sửa tên -> lưu tên luôn
    if (!instruction) {
      await this.saveClipEditNameOnly();
      return;
    }

    const pid = modal.propId;
    const rigSummary = this.sceneService.getPropRigSummary(pid);
    const clipSummary = this.sceneService.summarizePropClipForAi(pid, modal.originalName);
    if (!rigSummary || !clipSummary) {
      this.toastr.warning('Không đọc được dữ liệu Clip hiện tại để chỉnh sửa.', 'Chỉnh sửa Clip');
      return;
    }

    modal.isProcessing = true;
    this.cdr.markForCheck();

    const isRigidModel = rigSummary.isRigidModel;
    const autoWheelCount = rigSummary.autoWheelCount || 0;
    const embeddedClips = rigSummary.embeddedClipNames || [];
    const editSceneTargets = !isRigidModel ? this.sceneService.getScenePropsForInteraction(pid) : [];
    const boneNames = rigSummary.safeBoneNames?.length
      ? rigSummary.safeBoneNames
      : this.sceneService.getPropBones(pid).map((b) => b.name);

    const currentClipJson = JSON.stringify({
      name: clipSummary.name,
      duration: clipSummary.duration,
      loop: clipSummary.loop,
      originalPrompt: clipSummary.aiPrompt || null,
      currentSegments: clipSummary.aiSegments || null,
      totalDistanceMeters: clipSummary.totalDistanceMeters,
      rootTrajectorySamples: clipSummary.aiSegments ? undefined : clipSummary.rootTrajectorySamples,
      animatedBones: clipSummary.animatedBones,
      currentKeyframes: clipSummary.editableKeyframes || undefined
    }, null, 2);

    const systemPrompt = `Bạn là **Đạo diễn & Chuyên gia Hiệu chỉnh Chuyển động 3D (3D Motion Refinement Director)**.
Người dùng đã có sẵn một Clip chuyển động 3D nhưng còn hơi sai hoặc chưa ưng ý một vài chi tiết.
Nhiệm vụ của bạn: Đọc kỹ dữ liệu Clip hiện tại bên dưới, **GIỮ NGUYÊN toàn bộ phần đang đúng** và **CHỈ SỬA ĐÚNG NHỮNG ĐIỂM NGƯỜI DÙNG YÊU CẦU CHỈNH SỬA**!

### THÔNG TIN MÔ HÌNH HIỆN TẠI:
- Loại mô hình: ${isRigidModel ? `Vật thể cứng / phương tiện (autoWheelCount: ${autoWheelCount}${autoWheelCount >= 3 ? ', xe 4 bánh -> PHẢI giữ leanDeg = 0 để cả 4 bánh bám sàn' : ''})` : 'Nhân vật có bộ xương khớp (Skinned Humanoid)'}
- Hướng tiến gốc: ${rigSummary.forwardAxis}, kích thước X=${rigSummary.modelSize.x.toFixed(2)}, Y=${rigSummary.modelSize.y.toFixed(2)}, Z=${rigSummary.modelSize.z.toFixed(2)}
- Các khớp/node an toàn: ${JSON.stringify(boneNames)}
- Các clip mocap gốc nhúng sẵn trong GLB: ${JSON.stringify(embeddedClips)}
${editSceneTargets.length > 0 ? `- Bản đồ các đồ vật / nhân vật khác trong cảnh 3D (tọa độ tương đối theo nhân vật): ${JSON.stringify(editSceneTargets.map((t) => ({ id: t.id, name: t.name, isHumanoid: t.isHumanoid, distanceMeters: t.distanceMeters, angleDeg: t.angleDeg, forwardM: t.relForwardMeters, leftM: t.relLeftMeters, heightM: t.heightMeters, height: t.heightLabel })))}` : ''}

### DỮ LIỆU CLIP CHUYỂN ĐỘNG HIỆN TẠI CẦN SỬA:
${currentClipJson}

### YÊU CẦU CHỈNH SỬA TỪ NGƯỜI DÙNG:
- "${instruction}"

### HƯỚNG DẪN CHỈNH SỬA CHÍNH XÁC:
1. Nếu Clip hiện tại đã có \`currentSegments\` hoặc có quỹ đạo di chuyển không gian (\`rootTrajectorySamples\` có dịch chuyển X/Z hoặc người dùng yêu cầu sửa quãng đường/hướng rẽ/góc quay/tốc độ/thêm hành động nối tiếp/tương tác đồ vật trong cảnh):
   - Hãy trả về mảng \`segments\` đã được chỉnh sửa hoàn chỉnh!
   - Các loại đoạn hợp lệ (tự do ghép nối theo mọi thứ tự):
     * \`{ "type": "move", "distance": number (mét, âm hoặc reverse:true=lùi), "duration": number, "dy": 0, "angleDeg": 0, "reverse": false, "gait": "${isRigidModel ? 'none' : (embeddedClips.length > 0 ? 'embedded' : 'walk')}" | "walk" | "run" | "none"${embeddedClips.length > 0 ? `, "clipName": "${embeddedClips[0]}"` : ''}, "keyframes": [] }\`
     * \`{ "type": "turn", "angleDeg": number (+ quay TRÁI, - quay PHẢI, 180 = quay đầu), "duration": number, "gait": "${isRigidModel ? 'none' : 'walk'}" | "none" }\`
     * \`{ "type": "arc", "radius": number (bán kính = đường kính / 2), "sweepDeg": number (+ cua TRÁI, - cua PHẢI, vòng tròn = -360/+360), "duration": number, "reverse": false, "leanDeg": ${autoWheelCount >= 3 || !isRigidModel ? '0' : '9'}, "centerOnOrigin": true/false, "gait": "${isRigidModel ? 'none' : (embeddedClips.length > 0 ? 'embedded' : 'walk')}" }\`
     * \`{ "type": "waypoints", "points": [{"x":0,"y":0,"z":5},...], "relative": true, "duration": number, "faceVelocity": true, "reverse": false, "gait": "${isRigidModel ? 'none' : (embeddedClips.length > 0 ? 'embedded' : 'walk')}" }\`
     * \`{ "type": "figure8", "width": number, "duration": number, "leanDeg": ${autoWheelCount >= 3 || !isRigidModel ? '0' : '10'}, "gait": "${isRigidModel ? 'none' : (embeddedClips.length > 0 ? 'embedded' : 'walk')}" }\`
     * \`{ "type": "pose", "duration": number, "keyframes": [ { "time": 0, "boneName": "...", "rot": {"x":0,"y":0,"z":0}, "pos": {"x":0,"y":0,"z":0} } ] }\`
     * \`{ "type": "wait", "duration": number }\`${!isRigidModel ? `
     * \`{ "type": "approach", "targetPropId": "<id>", "stopDistance": 0.55, "gait": "walk" | "run", "duration": number }\` — tự quay mặt và đi/chạy tới sát đồ vật/nhân vật đích trong cảnh.
     * \`{ "type": "reach_and_grab", "targetPropId": "<id>", "hand": "right" | "left", "attach": true, "duration": 0.55 }\` — giải 2-Bone IK đưa tay chạm đúng món đồ, gập ngón nắm và gắn đồ đi theo tay xuyên suốt các đoạn sau.
     * \`{ "type": "reach_pose", "hand": "right" | "left", "targetOffset": { "forward": 0.35, "up": 1.25, "side": 0.14 }, "duration": 0.75, "keyframes": [] }\` — giải 2-Bone IK đưa tay (cùng món đồ đang cầm) tới vị trí 3D bất kỳ (giơ lên cao, đưa trước mặt xem, hạ xuống sàn, hoặc truyền \`targetPropId\` để đưa tới đồ/người khác).
     * \`{ "type": "release", "targetPropId": "<id>", "hand": "right" | "left", "duration": 0.35 }\` — mở ngón tay và thả món đồ tại đúng vị trí hiện tại.` : ''}
2. Nếu Clip hiện tại là động tác khớp xương thuần tại chỗ (\`currentKeyframes\` không di chuyển \`__root__\`):
   - Trả về mảng \`keyframes\` đã hiệu chỉnh trực tiếp các góc xoay/vị trí khớp xương theo đúng yêu cầu (giữ nguyên các khớp không liên quan).
   - Quy ước Character Cardinal Space: Đùi x ÂM (-20..-100) nâng lên trước, Đầu gối x DƯƠNG (+15..+100) gập về sau, Tay & Khuỷu x ÂM (-20..-100) đưa/gập lên trước, Thân/Đầu x DƯƠNG cúi trước; LeftArm z DƯƠNG nâng cao tay trái, RightArm z ÂM nâng cao tay phải; Hips.pos.y dương bật nhảy, âm ngồi/nhún.
3. TUYỆT ĐỐI KHÔNG xoay các sub-mesh không an toàn trên mô hình cứng; với xe 4 bánh luôn đặt \`leanDeg: 0\`.

### ĐẦU RA (CHỈ TRẢ VỀ JSON THUẦN TÚY):
{
  "loop": ${clipSummary.loop ? 'true' : 'false'},
  "duration": ${clipSummary.duration},
  "explanation": "Giải thích ngắn gọn bạn đã chỉnh sửa điểm nào so với clip cũ",
  "segments": [ ... ],
  "keyframes": [ ... ]
}`;

    try {
      const aiRes: any = await this.genaiService.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        config: {
          skipTTS: true,
          disableThinking: true,
          temperature: 0.2
        } as any
      });
      const rawReply =
        aiRes?.text ||
        aiRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
        '';
      const parsed = this.extractJsonFromAiText(rawReply);

      const combinedPrompt = clipSummary.aiPrompt
        ? `${clipSummary.aiPrompt} | Chỉnh sửa: ${instruction}`
        : `${modal.originalName} | Chỉnh sửa: ${instruction}`;

      let appliedCount = 0;
      let newSegments: any[] | undefined = undefined;
      if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        newSegments = parsed.segments;
        appliedCount = this.sceneService.applyAiMotionPlan(pid, {
          ...parsed,
          prompt: combinedPrompt
        });
      } else if (parsed && Array.isArray(parsed.keyframes) && parsed.keyframes.length >= (isRigidModel ? 2 : 4)) {
        appliedCount = this.sceneService.applyGeneratedBoneTimeline(pid, {
          duration: Number(parsed.duration) || clipSummary.duration,
          loop: parsed.loop !== undefined ? !!parsed.loop : clipSummary.loop,
          keyframes: parsed.keyframes
        });
      }

      if (appliedCount <= 0) {
        this.toastr.warning('AI chưa trả về dữ liệu chuyển động hợp lệ. Bạn hãy mô tả cụ thể hơn điểm cần chỉnh.', 'Chỉnh sửa Clip');
        modal.isProcessing = false;
        this.cdr.markForCheck();
        return;
      }

      // Quyết định tên đích: ghi đè chính clip hiện tại hay lưu thành clip mới
      let targetClipName = desiredName;
      const shouldReplaceInPlace = modal.isCustom && !modal.saveAsNew;
      if (!shouldReplaceInPlace && targetClipName === modal.originalName) {
        targetClipName = `${desiredName} (Sửa)`;
      }

      if (shouldReplaceInPlace && targetClipName !== modal.originalName) {
        // Đổi tên trước rồi ghi đè dữ liệu mới lên tên mới (xóa tên cũ trên đĩa & các nhân vật khác)
        const renameRes = this.sceneService.renamePropClip(pid, modal.originalName, targetClipName);
        if (renameRes.conflict) {
          this.toastr.warning(`Đã có Clip mang tên "${targetClipName}", hệ thống sẽ lưu đè trên tên cũ "${modal.originalName}".`, 'Chỉnh sửa Clip');
          targetClipName = modal.originalName;
        } else if (renameRes.renamed) {
          await this.persistRenamedClip(pid, modal.originalName, targetClipName, true);
        }
      }

      // Đóng gói keyframes mới vào đúng targetClipName (kèm aiPrompt & aiSegments mới)
      const baked = this.sceneService.bakeKeyframesToClip(pid, targetClipName, {
        aiPrompt: combinedPrompt,
        aiSegments: newSegments
      });
      const finalName = baked?.name || targetClipName;

      // Đồng bộ tệp .glb rời trong assets/anims/ và chia sẻ sang các nhân vật khác trong phòng
      const glbBuf = this.sceneService.exportClipToGlbArrayBuffer(pid, finalName);
      if (glbBuf && (window as any).electron?.uploadAnimation) {
        try {
          await (window as any).electron.uploadAnimation(this.username || 'admin', finalName, glbBuf);
        } catch (e) {
          console.warn('[Chỉnh sửa Clip] Không ghi được tệp .glb rời:', e);
        }
      }

      const savedObj = this.sceneService
        .getPropTimeline(pid)
        ?.savedClips?.find((c) => c.name === finalName);

      for (const p of this.roomProps || []) {
        if (!p) continue;
        if (p.id === pid) {
          const curTl = this.sceneService.getPropTimeline(pid);
          if (curTl) p.boneTimeline = JSON.parse(JSON.stringify(curTl));
        } else if (savedObj && this.sceneService.hasPropRig(p.id)) {
          this.sceneService.injectSharedKeyframeClip(p.id, savedObj, true);
          const otherTl = this.sceneService.getPropTimeline(p.id);
          if (otherTl) p.boneTimeline = JSON.parse(JSON.stringify(otherTl));
        }
      }

      if (this.profile) {
        (this.profile as any).props = this.roomProps;
      }
      try {
        await this.profileDataService.saveProps(this.roomProps).toPromise();
      } catch (e) {
        console.warn('[Chỉnh sửa Clip] Không lưu được props:', e);
      }

      // Phát ngay clip đã chỉnh sửa để người dùng kiểm tra trực tiếp trên sân khấu 3D
      this.sceneService.playPropClip(pid, finalName);
      if (this.timelinePropId === pid) {
        this.timelineClips = this.sceneService.getPropClips(pid);
        this.timelineData = this.sceneService.getPropTimeline(pid);
        this.timelineCurrentTime = 0;
      }

      this.editingClipModal = null;
      this.toastr.success(
        parsed?.explanation || `AI đã chỉnh sửa xong Clip "${finalName}" (${appliedCount} KF) và đang phát!`,
        'AI Chỉnh sửa Chuyển động',
        { timeOut: 5500 }
      );
    } catch (err: any) {
      console.error('[Chỉnh sửa Clip] Lỗi gọi AI:', err);
      this.toastr.error(err?.message || 'Không thể kết nối AI để chỉnh sửa chuyển động.', 'Chỉnh sửa Clip');
      if (this.editingClipModal) this.editingClipModal.isProcessing = false;
    } finally {
      this.cdr.markForCheck();
    }
  }

  async deleteTimelineCustomClip(clipName: string, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.timelinePropId || !clipName) return;

    const currentPropId = this.timelinePropId;
    let removed = this.sceneService.deletePropCustomClip(currentPropId, clipName);

    // Xóa đồng bộ Clip này khỏi TẤT CẢ các đồ vật/nhân vật khác trong phòng (kể cả nhân vật đang ẩn trong props.json)
    // để syncSharedClipsToProp không nạp lại bản sao cũ sau khi F5
    for (const p of this.roomProps || []) {
      if (!p) continue;
      if (p.id === currentPropId) {
        const curTl = this.sceneService.getPropTimeline(currentPropId);
        if (curTl) {
          p.boneTimeline = JSON.parse(JSON.stringify(curTl));
        }
        continue;
      }
      if (this.sceneService.hasPropRig(p.id)) {
        if (this.sceneService.deletePropCustomClip(p.id, clipName, { isSecondaryProp: true })) {
          removed = true;
        }
        const otherTl = this.sceneService.getPropTimeline(p.id);
        if (otherTl) {
          p.boneTimeline = JSON.parse(JSON.stringify(otherTl));
        }
      } else if (p.boneTimeline) {
        const bt = p.boneTimeline;
        if (Array.isArray(bt.savedClips)) {
          const beforeLen = bt.savedClips.length;
          bt.savedClips = bt.savedClips.filter((c: any) => c && c.name !== clipName);
          if (bt.savedClips.length !== beforeLen) removed = true;
        }
        if (bt.activeClipName === clipName) {
          removed = true;
          const isStaticHidden = !bt.playing && bt.mode !== 'clip' && Array.isArray(bt.staticPose) && bt.staticPose.length > 0;
          if (isStaticHidden) {
            bt.activeClipName = null;
          } else {
            const nextSaved = Array.isArray(bt.savedClips) && bt.savedClips.length > 0 ? bt.savedClips[0] : null;
            bt.activeClipName = bt.mode === 'clip' && nextSaved ? nextSaved.name : null;
            if (!nextSaved || bt.mode !== 'clip') {
              bt.playing = false;
              bt.keyframes = [];
            } else {
              bt.keyframes = Array.isArray(nextSaved.keyframes) ? JSON.parse(JSON.stringify(nextSaved.keyframes)) : [];
            }
          }
        }
      }
    }

    if (!removed) return;

    this.timelineClips = this.sceneService.getPropClips(currentPropId);
    this.timelineData = this.sceneService.getPropTimeline(currentPropId);
    this.timelineCurrentTime = Math.round(this.sceneService.getPropCurrentTime(currentPropId) * 100) / 100;
    this.cdr.markForCheck();

    // Xóa triệt để bản ghi trong animations.json và tệp .glb rời trong assets/anims/ (khớp theo cả id lẫn name)
    const safeId = clipName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    if ((window as any).electron?.deleteAnimation) {
      try {
        await (window as any).electron.deleteAnimation(this.username || 'admin', safeId, clipName);
      } catch (e) {
        console.warn('[Timeline GLB] Không xóa được tệp animation rời:', e);
      }
    }

    // Ghi đồng bộ xuống cả props.json và profile.json trước khi báo hoàn tất
    if (this.profile) {
      (this.profile as any).props = this.roomProps;
    }
    try {
      await this.profileDataService.saveProps(this.roomProps).toPromise();
    } catch (e) {
      console.warn('[Timeline GLB] Không lưu được props sau khi xóa Clip:', e);
    }

    this.toastr.info(`Đã xóa vĩnh viễn Clip chuyển động "${clipName}".`, 'Timeline GLB');
    this.cdr.markForCheck();
  }

  // ============================================================================
  // AI MOTION DESIGNER: TỰ ĐỘNG THIẾT KẾ CLIP KEYFRAME TỪ KHỚP XƯƠNG & VIDEO MẪU
  // ============================================================================
  isAiMotionBarOpen = false;
  isDesigningAiMotion = false;
  aiMotionError = '';
  aiMotionPrompt = '';
  showAiMotionMentionMenu = false;
  aiMotionMentionQuery = '';
  aiMotionMentionAtIndex = -1;
  aiMotionMentionIndex = 0;
  filteredAiMotionMentionProps: Array<{
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
    dirLabel: string;
  }> = [];
  private _aiMotionMentionBlurTimer: any = null;
  aiMotionVideoName = '';
  aiMotionVideoDuration = 0;
  aiMotionVideoFile: File | null = null;
  aiMotionVideoPath = '';
  private _aiMotionAbortController: AbortController | null = null;
  private _aiMotionRunSeq = 0;
  aiMotionProgressPercent = 0;
  aiMotionProgressStage = '';
  aiMotionLastEngine = '';
  private _unsubMocapProgress: (() => void) | null = null;
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
    if (!this.isAiMotionBarOpen) {
      this.showAiMotionMentionMenu = false;
    }
    this.cdr.markForCheck();
  }

  private _getActiveMotionActorId(): string | null {
    return (
      this.timelinePropId ||
      this.selectedPropId ||
      this.roomProps.find((p) => p && p.visible && this.sceneService.hasPropRig(p.id))?.id ||
      null
    );
  }

  private _normalizeMentionText(text: string): string {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[\s_.-]+/g, '');
  }

  private _formatMentionDirLabel(angleDeg: number): string {
    const a = Number(angleDeg) || 0;
    if (Math.abs(a) <= 35) return 'trước mặt';
    if (Math.abs(a) >= 145) return 'phía sau';
    return a > 0 ? 'bên trái' : 'bên phải';
  }

  private _getAiMotionMentionCandidates(actorPropId: string | null) {
    const rawTargets = this.sceneService.getScenePropsForInteraction(actorPropId);
    const propNameById = new Map<string, string>();
    for (const p of this.roomProps || []) {
      if (p?.id && p?.name) propNameById.set(p.id, String(p.name));
    }
    return rawTargets.map((t) => ({
      ...t,
      name: propNameById.get(t.id) || t.name,
      dirLabel: this._formatMentionDirLabel(t.angleDeg)
    }));
  }

  onAiMotionPromptInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    const value = input.value || '';
    const cursor = input.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : '';
      const validBoundary = lastAtIndex === 0 || /[\s,.;:!?(\[{'"/-]/.test(charBeforeAt);
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (validBoundary && !query.includes('\n') && !/\s{2,}/.test(query)) {
        const candidates = this._getAiMotionMentionCandidates(this._getActiveMotionActorId());
        const qLower = query.trim().toLowerCase();
        const qNorm = this._normalizeMentionText(query);
        const matched = qLower.length === 0
          ? candidates
          : candidates.filter((item) => {
              const nameLower = item.name.toLowerCase();
              const idLower = item.id.toLowerCase();
              return (
                nameLower.includes(qLower) ||
                idLower.includes(qLower) ||
                (qNorm.length > 0 && (
                  this._normalizeMentionText(item.name).includes(qNorm) ||
                  this._normalizeMentionText(item.id).includes(qNorm)
                ))
              );
            });

        // Nếu người dùng đã gõ xong khoảng trắng sau 1 mention không còn khớp gì, tự đóng menu để không cản trở gõ tiếp
        if (query.includes(' ') && matched.length === 0) {
          this.showAiMotionMentionMenu = false;
          this.aiMotionMentionAtIndex = -1;
          this.cdr.markForCheck();
          return;
        }

        this.aiMotionMentionQuery = query;
        this.aiMotionMentionAtIndex = lastAtIndex;
        this.filteredAiMotionMentionProps = matched;
        this.aiMotionMentionIndex = 0;
        this.showAiMotionMentionMenu = candidates.length > 0;
        this.cdr.markForCheck();
        return;
      }
    }

    this.showAiMotionMentionMenu = false;
    this.aiMotionMentionAtIndex = -1;
    this.cdr.markForCheck();
  }

  onAiMotionPromptKeydown(event: KeyboardEvent): void {
    if (this.showAiMotionMentionMenu) {
      if (event.key === 'ArrowDown' && this.filteredAiMotionMentionProps.length > 0) {
        event.preventDefault();
        this.aiMotionMentionIndex = (this.aiMotionMentionIndex + 1) % this.filteredAiMotionMentionProps.length;
        this.cdr.markForCheck();
        return;
      }
      if (event.key === 'ArrowUp' && this.filteredAiMotionMentionProps.length > 0) {
        event.preventDefault();
        this.aiMotionMentionIndex =
          (this.aiMotionMentionIndex - 1 + this.filteredAiMotionMentionProps.length) % this.filteredAiMotionMentionProps.length;
        this.cdr.markForCheck();
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && this.filteredAiMotionMentionProps.length > 0) {
        event.preventDefault();
        const picked = this.filteredAiMotionMentionProps[this.aiMotionMentionIndex] || this.filteredAiMotionMentionProps[0];
        if (picked) this.selectAiMotionMention(picked);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.showAiMotionMentionMenu = false;
        this.aiMotionMentionAtIndex = -1;
        this.cdr.markForCheck();
        return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.showAiMotionMentionMenu = false;
      this.designMotionWithAi();
    }
  }

  onAiMotionPromptBlur(): void {
    if (this._aiMotionMentionBlurTimer) clearTimeout(this._aiMotionMentionBlurTimer);
    this._aiMotionMentionBlurTimer = setTimeout(() => {
      this.showAiMotionMentionMenu = false;
      this.cdr.markForCheck();
    }, 150);
  }

  triggerAiMotionMentionInsert(): void {
    if (this.isDesigningAiMotion) return;
    if (this._aiMotionMentionBlurTimer) clearTimeout(this._aiMotionMentionBlurTimer);
    const input = this.aiMotionPromptInput?.nativeElement;
    const value = this.aiMotionPrompt || '';
    const cursor = input ? (input.selectionStart ?? value.length) : value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before) && !before.endsWith('@');
    const insertStr = before.endsWith('@') ? '' : (needsLeadingSpace ? ' @' : '@');
    const nextVal = before + insertStr + after;
    const nextCursor = before.length + insertStr.length;
    this.aiMotionPrompt = nextVal;
    const candidates = this._getAiMotionMentionCandidates(this._getActiveMotionActorId());
    this.aiMotionMentionQuery = '';
    this.aiMotionMentionAtIndex = nextCursor - 1;
    this.filteredAiMotionMentionProps = candidates;
    this.aiMotionMentionIndex = 0;
    this.showAiMotionMentionMenu = candidates.length > 0;
    if (candidates.length === 0) {
      this.toastr.info('Chưa có đồ vật hoặc nhân vật nào khác đang hiển thị trong cảnh 3D.', 'AI Motion Studio');
    }
    this.cdr.markForCheck();
    setTimeout(() => {
      if (this.aiMotionPromptInput?.nativeElement) {
        const el = this.aiMotionPromptInput.nativeElement;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    }, 0);
  }

  selectAiMotionMention(item: { id: string; name: string }): void {
    if (!item) return;
    if (this._aiMotionMentionBlurTimer) clearTimeout(this._aiMotionMentionBlurTimer);
    const input = this.aiMotionPromptInput?.nativeElement;
    const value = this.aiMotionPrompt || '';
    const cursor = input ? (input.selectionStart ?? value.length) : value.length;
    const atIdx =
      this.aiMotionMentionAtIndex >= 0 && value[this.aiMotionMentionAtIndex] === '@'
        ? this.aiMotionMentionAtIndex
        : value.slice(0, cursor).lastIndexOf('@');

    const inserted = `@${item.name} `;
    let nextVal = value;
    let nextCursor = value.length;
    if (atIdx >= 0) {
      const suffix = value.slice(cursor);
      const cleanSuffix = suffix.startsWith(' ') ? suffix.slice(1) : suffix;
      nextVal = value.slice(0, atIdx) + inserted + cleanSuffix;
      nextCursor = atIdx + inserted.length;
    } else {
      const prefix = value.trim() ? value.trim() + ' ' : '';
      nextVal = prefix + inserted;
      nextCursor = nextVal.length;
    }

    this.aiMotionPrompt = nextVal;
    this.showAiMotionMentionMenu = false;
    this.aiMotionMentionQuery = '';
    this.aiMotionMentionAtIndex = -1;
    this.cdr.markForCheck();

    setTimeout(() => {
      if (this.aiMotionPromptInput?.nativeElement) {
        const el = this.aiMotionPromptInput.nativeElement;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    }, 0);
  }

  private _resolveAiMotionMentionTargets(
    prompt: string,
    targets: ReturnType<SontinhSceneService['getScenePropsForInteraction']>
  ): Array<{
    mentionText: string;
    target: ReturnType<SontinhSceneService['getScenePropsForInteraction']>[number];
  }> {
    if (!prompt || !Array.isArray(targets) || targets.length === 0) return [];
    const propNameById = new Map<string, string>();
    for (const p of this.roomProps || []) {
      if (p?.id && p?.name) propNameById.set(p.id, String(p.name));
    }
    const enriched = targets.map((t) => ({
      ...t,
      name: propNameById.get(t.id) || t.name
    }));

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const foundByPos: Array<{ pos: number; end: number; mentionText: string; target: (typeof enriched)[number] }> = [];
    const claimedRanges: Array<[number, number]> = [];
    const overlaps = (s: number, e: number) => claimedRanges.some(([a, b]) => s < b && e > a);

    // 1. Khớp chính xác @<tên đầy đủ> (kể cả tên có khoảng trắng như "@human-base-rigged 2") hoặc @<id>, ưu tiên tên dài trước
    const byLongestName = [...enriched].sort((a, b) => b.name.length - a.name.length);
    for (const t of byLongestName) {
      for (const candidateLabel of [t.name, t.id]) {
        if (!candidateLabel) continue;
        const re = new RegExp(`@${escapeRegex(candidateLabel)}(?=$|[\\s,.;:!?()\\[\\]{}'"\\/])`, 'gi');
        let m: RegExpExecArray | null;
        while ((m = re.exec(prompt)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          if (!overlaps(start, end)) {
            claimedRanges.push([start, end]);
            foundByPos.push({ pos: start, end, mentionText: m[0], target: t });
          }
        }
      }
    }

    // 2. Fallback cho các @token người dùng tự gõ ngắn (vd "@titan", "@black") chưa khớp ở bước 1
    const tokenRe = /@([^\s,.;:!?()\[\]{}'"]+)/g;
    let tm: RegExpExecArray | null;
    while ((tm = tokenRe.exec(prompt)) !== null) {
      const start = tm.index;
      const end = start + tm[0].length;
      if (overlaps(start, end)) continue;
      const qNorm = this._normalizeMentionText(tm[1]);
      if (!qNorm) continue;
      const match = enriched.find((t) => {
        const nNorm = this._normalizeMentionText(t.name);
        const idNorm = this._normalizeMentionText(t.id);
        return nNorm === qNorm || idNorm === qNorm || nNorm.includes(qNorm) || idNorm.includes(qNorm);
      });
      if (match) {
        claimedRanges.push([start, end]);
        foundByPos.push({ pos: start, end, mentionText: tm[0], target: match });
      }
    }

    foundByPos.sort((a, b) => a.pos - b.pos);
    const seenIds = new Set<string>();
    const ordered: Array<{ mentionText: string; target: (typeof enriched)[number] }> = [];
    for (const entry of foundByPos) {
      if (seenIds.has(entry.target.id)) continue;
      seenIds.add(entry.target.id);
      ordered.push({ mentionText: entry.mentionText, target: entry.target });
    }
    return ordered;
  }

  private _normalizePlanSegmentTargets(
    segments: any[],
    resolvedMentions: Array<{ mentionText: string; target: { id: string; name: string } }>,
    allTargets: Array<{ id: string; name: string }>
  ): void {
    if (!Array.isArray(segments) || allTargets.length === 0) return;
    const validIdSet = new Set(allTargets.map((t) => t.id));
    const lookupByLabel = (raw: string): string | null => {
      const cleaned = String(raw || '').trim().replace(/^@+/, '');
      if (!cleaned) return null;
      if (validIdSet.has(cleaned)) return cleaned;
      const cLower = cleaned.toLowerCase();
      const cNorm = this._normalizeMentionText(cleaned);
      const pools = [resolvedMentions.map((m) => m.target), allTargets];
      for (const pool of pools) {
        const exact = pool.find((t) => t.id.toLowerCase() === cLower || t.name.toLowerCase() === cLower);
        if (exact) return exact.id;
        const fuzzy = pool.find(
          (t) =>
            this._normalizeMentionText(t.name) === cNorm ||
            this._normalizeMentionText(t.id) === cNorm ||
            (cNorm.length >= 3 && (this._normalizeMentionText(t.name).includes(cNorm) || this._normalizeMentionText(t.id).includes(cNorm)))
        );
        if (fuzzy) return fuzzy.id;
      }
      return null;
    };

    const singleMentionId = resolvedMentions.length === 1 ? resolvedMentions[0].target.id : null;
    const mentionedIdSet = new Set(resolvedMentions.map((m) => m.target.id));

    for (const seg of segments) {
      if (!seg || typeof seg !== 'object') continue;
      const isTargetSeg =
        seg.type === 'approach' ||
        seg.type === 'reach_and_grab' ||
        seg.type === 'release' ||
        seg.type === 'walk_and_grab';

      if (typeof seg.targetPropId === 'string' && seg.targetPropId.trim()) {
        const mapped = lookupByLabel(seg.targetPropId);
        if (mapped) {
          seg.targetPropId = mapped;
        } else if (singleMentionId && isTargetSeg) {
          seg.targetPropId = singleMentionId;
        }
      } else if (singleMentionId && isTargetSeg) {
        seg.targetPropId = singleMentionId;
      }

      // Nếu người dùng chỉ @mention đúng 1 đồ vật duy nhất, bảo đảm approach/reach_and_grab/release luôn nhắm đúng đồ vật đó
      if (singleMentionId && isTargetSeg && seg.targetPropId && !mentionedIdSet.has(seg.targetPropId)) {
        seg.targetPropId = singleMentionId;
      }
    }
  }

  clearMotionVideo(): void {
    this.aiMotionVideoName = '';
    this.aiMotionVideoDuration = 0;
    this.aiMotionVideoFile = null;
    this.aiMotionVideoPath = '';
    this.aiMotionVideoFrames = [];
    this.aiMotionPoseSamples = [];
    this.aiMotionProgressPercent = 0;
    this.aiMotionProgressStage = '';
    this.aiMotionLastEngine = '';
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

  /**
   * Trích xuất chuyển động 3D SMPL thật (NLF NeurIPS 2024 qua Electron GPU CUDA/CPU) từ Video mẫu
   * và áp dụng trực tiếp lên toàn bộ khớp xương của nhân vật 3D trong không gian Canonical T-Pose.
   */
  private async runReal3dVideoMocap(
    pid: string,
    file: File | null,
    directFilePath = ''
  ): Promise<{ ok: boolean; appliedCount: number; duration: number; frameCount: number; error?: string }> {
    const elec = (window as any).electron;
    if (!elec?.extractVideoMocap3d) {
      return { ok: false, appliedCount: 0, duration: 0, frameCount: 0, error: 'Chưa có cầu nối Electron 3D MoCap.' };
    }
    const resolvedPath = (directFilePath || (file as any)?.path || '').trim();
    if (!resolvedPath && !file) {
      return { ok: false, appliedCount: 0, duration: 0, frameCount: 0, error: 'Chưa chọn tệp video mẫu.' };
    }

    this.isDesigningAiMotion = true;
    this.aiMotionProgressPercent = 2;
    this.aiMotionProgressStage = 'Đang bắt đầu phân tích chuyển động từ video...';
    this.cdr.detectChanges();

    try {
      if (this._unsubMocapProgress) {
        try { this._unsubMocapProgress(); } catch (_) {}
        this._unsubMocapProgress = null;
      }
      if (typeof elec.onMocapProgress === 'function') {
        this._unsubMocapProgress = elec.onMocapProgress((msg: any) => {
          if (!msg) return;
          if (typeof msg.percent === 'number') this.aiMotionProgressPercent = msg.percent;
          if (typeof msg.stage === 'string') this.aiMotionProgressStage = msg.stage;
          this.cdr.detectChanges();
        });
      }

      const payload: any = {
        username: this.username || 'admin',
        filename: file?.name || this.aiMotionVideoName || 'video.mp4'
      };
      if (resolvedPath) {
        payload.filePath = resolvedPath;
      } else if (file) {
        payload.buffer = await file.arrayBuffer();
      }

      const res = await elec.extractVideoMocap3d(payload);
      if (!res?.success || !res?.data || !Array.isArray(res.data.keyframes) || res.data.keyframes.length === 0) {
        return {
          ok: false,
          appliedCount: 0,
          duration: 0,
          frameCount: 0,
          error: res?.error || 'Không trích xuất được dữ liệu khớp xương 3D từ video.'
        };
      }

      const mocap = res.data;
      const dur = Number(mocap.duration) || this.aiMotionVideoDuration || 4.0;
      this.aiMotionVideoDuration = Math.round(dur * 100) / 100;
      this.aiMotionLastEngine = `${mocap.engine || 'nlf-smpl-3d-adaptive'} (${String(mocap.device || 'gpu').toUpperCase()})`;

      const appliedCount = this.sceneService.applyGeneratedBoneTimeline(pid, {
        duration: dur,
        loop: true,
        poseSpace: 'tpose',
        footLock: mocap.footLock === true,
        sourceLegLength: Number(mocap.sourceLegLength) || 0,
        keyframes: mocap.keyframes
      });

      this.timelineData = this.sceneService.getPropTimeline(pid);
      this.timelineCurrentTime = 0;

      const baseVideoName = (this.aiMotionVideoName || file?.name || 'Video')
        .replace(/\.[^.]+$/, '')
        .trim()
        .slice(0, 32);
      const clipLabel = `Video: ${baseVideoName}`;
      this.saveTimelineToProp(true, clipLabel);
      this.timelineClips = this.sceneService.getPropClips(pid);

      this.toastr.success(
        `Đã tạo xong chuyển động theo video "${baseVideoName}" (${dur.toFixed(2)}s, ${appliedCount} keyframe)!`,
        'AI Thiết kế chuyển động'
      );

      return { ok: true, appliedCount, duration: dur, frameCount: Number(mocap.frameCount) || 0 };
    } catch (err: any) {
      return {
        ok: false,
        appliedCount: 0,
        duration: 0,
        frameCount: 0,
        error: err?.message || String(err)
      };
    } finally {
      if (this._unsubMocapProgress) {
        try { this._unsubMocapProgress(); } catch (_) {}
        this._unsubMocapProgress = null;
      }
      this.isDesigningAiMotion = false;
      this.aiMotionProgressPercent = 0;
      this.aiMotionProgressStage = '';
      this.cdr.detectChanges();
    }
  }

  async onMotionVideoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;

    try {
      this.aiMotionVideoFile = file;
      this.aiMotionVideoPath = String((file as any)?.path || '');
      this.aiMotionVideoName = file.name;
      this.isAiMotionBarOpen = true;
      this.cdr.markForCheck();

      this.toastr.info(`Đang phân tích chuyển động từ video "${file.name}"...`, 'AI Thiết kế chuyển động');
      const res = await this.extractKeyFramesFromVideoFile(file, 10);
      this.aiMotionVideoDuration = res.duration;
      this.aiMotionVideoFrames = res.frames;
      this.aiMotionPoseSamples = res.poseSamples;
      if (this.timelineData) {
        this.timelineData.duration = res.duration;
      }
      this.cdr.markForCheck();

      const pid =
        this.timelinePropId ||
        this.selectedPropId ||
        this.roomProps.find((p) => p && p.visible && this.sceneService.hasPropRig(p.id))?.id ||
        null;

      if (pid && this.sceneService.hasPropRig(pid)) {
        const mocapRes = await this.runReal3dVideoMocap(pid, file, this.aiMotionVideoPath);
        if (mocapRes.ok) {
          return;
        }
        console.warn('[Video Motion] Fallback sang bộ tổng hợp tư thế nhẹ:', mocapRes.error);
        if (res.poseSamples.length > 0) {
          const appliedCount = this.sceneService.synthesizeVideoPoseBoneMotion(
            pid,
            res.poseSamples,
            res.duration,
            this.aiMotionPrompt
          );
          this.timelineData = this.sceneService.getPropTimeline(pid);
          this.timelineCurrentTime = 0;
          this.saveTimelineToProp(true);
          this.toastr.warning(
            `Đã tạo chuyển động cơ bản (${appliedCount} keyframe) từ video mẫu.`,
            'AI Thiết kế chuyển động'
          );
        }
      } else {
        this.toastr.info(
          `Đã nạp ${res.frames.length} khung hình mẫu (${res.duration}s). Hãy chọn nhân vật 3D có khớp xương rồi bấm "Tạo chuyển động".`,
          'AI Thiết kế chuyển động'
        );
      }
      this.cdr.markForCheck();
    } catch (err: any) {
      this.toastr.error(err?.message || 'Không đọc được tệp video mẫu.', 'AI Thiết kế chuyển động');
    }
  }

  stopAiMotionDesign(silent = false): void {
    this._aiMotionRunSeq++;
    if (this._aiMotionAbortController) {
      try { this._aiMotionAbortController.abort(); } catch (_) {}
      this._aiMotionAbortController = null;
    }
    try { this.genaiService.cancelLocalAgent(); } catch (_) {}
    if (this._unsubMocapProgress) {
      try { this._unsubMocapProgress(); } catch (_) {}
      this._unsubMocapProgress = null;
    }
    const wasRunning = this.isDesigningAiMotion;
    this.isDesigningAiMotion = false;
    this.aiMotionProgressPercent = 0;
    this.aiMotionProgressStage = '';
    this.cdr.detectChanges();
    if (wasRunning && !silent) {
      this.toastr.info('Đã dừng tạo chuyển động AI.', 'AI Thiết kế chuyển động');
    }
  }

  private formatAiMotionError(err: any): string {
    const raw = String(err?.message || err || '').trim();
    // Giữ nguyên thông báo chi tiết nếu có lỗi từ AI Agent cục bộ (AGY / Claude CLI) để không che nguyên nhân gốc
    if (/AI Agent|AGY|Claude|CLI|nhóm-x-cms/i.test(raw)) {
      return raw;
    }
    if (/503|UNAVAILABLE|overloaded|high demand/i.test(raw)) {
      return 'Máy chủ AI (Gemini) đang quá tải (HTTP 503). Vui lòng thử lại sau ít giây hoặc bật Mì Tôm AI / AI Agent.';
    }
    if (/429|RESOURCE_EXHAUSTED|quota|hạn mức/i.test(raw)) {
      return 'API Key đã chạm giới hạn hạn mức (HTTP 429). Vui lòng chờ hoặc thêm API Key khác.';
    }
    if (/401|403|API key|API_KEY_INVALID|chưa được cấu hình/i.test(raw)) {
      return 'API Key không hợp lệ hoặc chưa được cấu hình. Vui lòng kiểm tra trong mục Cài đặt.';
    }
    if (/Failed to fetch|NetworkError|timeout|quá thời gian/i.test(raw)) {
      return 'Mất kết nối hoặc hết thời gian chờ máy chủ AI. Vui lòng kiểm tra mạng và thử lại.';
    }
    return raw || 'Không thể thiết kế chuyển động AI do lỗi máy chủ.';
  }

  async designMotionWithAi(): Promise<void> {
    const pid =
      this.timelinePropId ||
      this.selectedPropId ||
      this.roomProps.find((p) => p && p.visible && this.sceneService.hasPropRig(p.id))?.id ||
      null;
    if (!pid || !this.sceneService.hasPropRig(pid)) {
      this.toastr.warning('Vui lòng chọn một nhân vật hoặc đồ vật 3D có khớp xương trước.', 'AI Thiết kế chuyển động');
      return;
    }
    const prompt = (this.aiMotionPrompt || '').trim();
    if (!prompt && !this.aiMotionVideoFile && !this.aiMotionVideoPath && this.aiMotionVideoFrames.length === 0) {
      this.toastr.warning('Hãy chọn một Video mẫu hoặc nhập mô tả chuyển động để AI tạo.', 'AI Thiết kế chuyển động');
      return;
    }

    this.aiMotionError = '';
    this.showAiMotionMentionMenu = false;

    // CHỈ chạy trích xuất Mocap 3D tại chỗ thuần túy khi người dùng KHÔNG nhập prompt mô tả.
    // Khi người dùng đã nhập prompt kịch bản (VD: "Đi tới cầm chiếc điện thoại lên và xem"),
    // LUÔN chạy qua AI Motion Director (không bỏ qua prompt!) và tự tái sử dụng clip mocap từ video mẫu làm dáng bước chân.
    const hasVideoAttached = !!(this.aiMotionVideoFile || this.aiMotionVideoPath);
    const hasTextPrompt = prompt.length > 0;

    if (hasVideoAttached && !hasTextPrompt) {
      const mocapRes = await this.runReal3dVideoMocap(pid, this.aiMotionVideoFile, this.aiMotionVideoPath);
      if (mocapRes.ok) {
        return;
      }
      this.toastr.warning(
        `Chuyển sang chế độ AI dự phòng để tạo chuyển động...`,
        'AI Thiết kế chuyển động'
      );
    }

    // Nếu người dùng vừa có video mẫu đính kèm (VD: video dáng đi bộ) vừa nhập prompt kịch bản,
    // đảm bảo clip mocap của video mẫu đã được trích sẵn để AI tái sử dụng làm dáng bước chân và giữ nguyên tư thế tay/thân rồi đi tiếp sang AI Director!
    let reusableVideoClipName = '';
    if (hasVideoAttached && hasTextPrompt) {
      const baseVidName = (this.aiMotionVideoName || '').replace(/\.[^/.]+$/, '').trim().toLowerCase();
      const existingClips = this.sceneService.getPropClips(pid) || [];
      const alreadyExtracted = [...existingClips].reverse().find((c) => {
        const cn = String(c?.name || '').toLowerCase();
        if (!cn.startsWith('video:')) return false;
        return baseVidName ? cn.includes(baseVidName.slice(0, 18)) : true;
      });
      if (alreadyExtracted) {
        reusableVideoClipName = alreadyExtracted.name;
      } else {
        const mocapRes = await this.runReal3dVideoMocap(pid, this.aiMotionVideoFile, this.aiMotionVideoPath);
        if (mocapRes.ok) {
          const latestClips = this.sceneService.getPropClips(pid) || [];
          const found = [...latestClips].reverse().find((c) => {
            const cn = String(c?.name || '').toLowerCase();
            if (!cn.startsWith('video:')) return false;
            return baseVidName ? cn.includes(baseVidName.slice(0, 18)) : true;
          });
          reusableVideoClipName = found?.name || '';
        }
      }
    } else if (!hasVideoAttached && hasTextPrompt) {
      // Nếu người dùng vừa chạy trích xuất video mẫu trước đó (clip đang phát bắt đầu bằng "Video:"), vẫn tự động kế thừa clip đó!
      const curActiveClip = String(this.timelineData?.activeClipName || '').trim();
      if (/^video:/i.test(curActiveClip)) {
        reusableVideoClipName = curActiveClip;
      }
    }

    const runSeq = ++this._aiMotionRunSeq;
    const abortCtrl = new AbortController();
    this._aiMotionAbortController = abortCtrl;
    this.isDesigningAiMotion = true;
    this.aiMotionProgressPercent = 0;
    this.aiMotionProgressStage = 'Đang xác định nguồn AI ưu tiên...';
    this.cdr.markForCheck();

    try {
      const activeProviderLabel = await this.genaiService.getActiveAiProviderLabel(false);
      if (this._aiMotionRunSeq === runSeq) {
        this.aiMotionProgressStage = `Đang biên đạo qua ${activeProviderLabel}...`;
        this.cdr.markForCheck();
      }
    } catch (_) {
      this.aiMotionProgressStage = 'AI đang phân tích cảnh 3D và biên đạo chuyển động...';
    }

    const rigSummary = this.sceneService.getPropRigSummary(pid);
    const isRigidModel = !!rigSummary?.isRigidModel;
    const autoWheelCount = rigSummary?.autoWheelCount || 0;
    const embeddedClips = rigSummary?.embeddedClipNames || [];
    // Thu thập thêm các clip dáng đi/chạy mocap đã trích từ Video mẫu trên nhân vật để AI có thể tái sử dụng làm gait!
    const customGaitClipNames = (this.sceneService.getPropClips(pid) || [])
      .filter(
        (c) =>
          c.isCustom &&
          (/^video:/i.test(c.name) || (/walk|run|đi bộ|di bo|chạy|chay/i.test(c.name) && !/điện thoại|cầm|nắm|\d+m/i.test(c.name)))
      )
      .map((c) => c.name);
    const allReusableGaitClips = Array.from(new Set([
      ...(reusableVideoClipName ? [reusableVideoClipName] : []),
      ...embeddedClips,
      ...customGaitClipNames
    ]));
    const propNameById = new Map<string, string>();
    for (const p of this.roomProps || []) {
      if (p?.id && p?.name) propNameById.set(p.id, String(p.name));
    }
    const sceneInteractTargets = this.sceneService.getScenePropsForInteraction(pid).map((t) => ({
      ...t,
      name: propNameById.get(t.id) || t.name
    }));
    const resolvedMentionTargets = this._resolveAiMotionMentionTargets(prompt, sceneInteractTargets);
    const mentionDirectiveBlock = resolvedMentionTargets.length > 0
      ? `\n- **ĐỒ VẬT / NHÂN VẬT ĐƯỢC NGƯỜI DÙNG CHỈ ĐỊNH CHÍNH XÁC QUA @MENTION (BẮT BUỘC DÙNG ĐÚNG \`targetPropId\` NÀY)**: ${JSON.stringify(
          resolvedMentionTargets.map((m) => ({
            mention: m.mentionText,
            targetPropId: m.target.id,
            name: m.target.name,
            isHumanoid: m.target.isHumanoid,
            distanceMeters: m.target.distanceMeters,
            angleDeg: m.target.angleDeg,
            forwardM: m.target.relForwardMeters,
            leftM: m.target.relLeftMeters,
            heightM: m.target.heightMeters,
            height: m.target.heightLabel
          }))
        )}\n  QUY TẮC BẮT BUỘC VỚI @MENTION: Mọi đoạn \`approach\`, \`reach_and_grab\`, \`reach_pose\`, \`release\` tương tác với \`@mention\` PHẢI truyền chính xác chuỗi \`"targetPropId"\` từ danh sách trên (KHÔNG dùng tên hay chuỗi \`@...\`, KHÔNG tự chọn nhầm đồ vật khác).`
      : '';
    const boneNames = rigSummary?.safeBoneNames?.length
      ? rigSummary.safeBoneNames
      : this.sceneService.getPropBones(pid).map((b) => b.name);
    const targetDur = !hasTextPrompt && this.aiMotionVideoDuration > 0
      ? this.aiMotionVideoDuration
      : (this.timelineData?.duration || 3.5);

    try {
      this.toastr.info('AI Agent đang phân tích mô hình và biên đạo kế hoạch chuyển động...', 'AI Motion Studio', { timeOut: 2500 });

      // Gửi khung hình Video mẫu phù hợp theo kịch bản:
      // - Chỉ có video mẫu (không prompt): gửi tối đa 8 khung hình + thông số đo tư thế
      // - Có cả video mẫu + prompt + tương tác cảnh 3D: gửi 1 khung hình đại diện tư thế Video mẫu CÙNG 1 ảnh chụp cảnh 3D
      //   để AI nhìn thấy rõ dáng tay/thân mà video mẫu đã trích mocap sẵn (tránh bịa keyframes đè hỏng mocap video!)
      const hasExtractedVideoClip = !!reusableVideoClipName;
      const useFullVideoVision = !hasTextPrompt && this.aiMotionVideoFrames.length > 0;
      const maxVisionFrames = useFullVideoVision ? 8 : (sceneInteractTargets.length > 0 ? 1 : (hasExtractedVideoClip ? 2 : 6));
      const visionFrames = this.aiMotionVideoFrames.length === 0
        ? []
        : (useFullVideoVision
            ? (this.aiMotionVideoFrames.length <= maxVisionFrames
                ? this.aiMotionVideoFrames
                : Array.from({ length: maxVisionFrames }, (_, idx) => {
                    const fIdx = Math.min(
                      this.aiMotionVideoFrames.length - 1,
                      Math.round((idx / (maxVisionFrames - 1)) * (this.aiMotionVideoFrames.length - 1))
                    );
                    return this.aiMotionVideoFrames[fIdx];
                  }))
            : (maxVisionFrames === 1
                ? [this.aiMotionVideoFrames[Math.min(2, this.aiMotionVideoFrames.length - 1)]]
                : [
                    this.aiMotionVideoFrames[Math.floor(this.aiMotionVideoFrames.length * 0.25)],
                    this.aiMotionVideoFrames[Math.floor(this.aiMotionVideoFrames.length * 0.65)]
                  ].filter(Boolean)));

      const poseTelemetrySummary = useFullVideoVision && this.aiMotionPoseSamples.length > 0
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

      const includeSceneSnap = sceneInteractTargets.length > 0 && !useFullVideoVision;
      const frameMetaDesc = useFullVideoVision && visionFrames.length > 0
        ? `Người dùng đã đính kèm ${visionFrames.length} khung hình trích xuất theo trình tự thời gian từ Video mẫu "${this.aiMotionVideoName}" (tổng thời lượng ${targetDur}s): ` +
          visionFrames.map((f, idx) => `Ảnh #${idx + 1} tại t=${f.time.toFixed(2)}s`).join(', ') +
          `. Hãy quan sát kỹ tư thế người trong từng khung hình kết hợp thông số đo tư thế để tái tạo chuẩn xác động tác của video.${poseTelemetrySummary}`
        : (hasExtractedVideoClip
            ? (visionFrames.length > 0
                ? `${visionFrames.map((f, idx) => `Ảnh #${idx + 1}: khung hình đại diện tư thế gốc của Video mẫu "${this.aiMotionVideoName}" tại t=${f.time.toFixed(2)}s`).join('; ')}${includeSceneSnap ? `; Ảnh #${visionFrames.length + 1}: ảnh chụp trực tiếp khung cảnh 3D hiện tại cùng bản đồ tọa độ 3D của các đồ vật/nhân vật khác` : ''}. Toàn bộ chuyển động 3D thật (chân, hông, cột sống, vai và 2 tay đúng như Video mẫu) ĐÃ được trích xuất sẵn vào clip "${reusableVideoClipName}". Hãy kế thừa trực tiếp clip này bằng \`"gait": "embedded", "clipName": "${reusableVideoClipName}"\` và dùng \`"keepFromClip"\` khi cần giữ nguyên tay/dáng từ video ở các đoạn sau.`
                : `Clip mocap 3D toàn thân thật "${reusableVideoClipName}" ĐÃ trích xuất sẵn chuyển động từ Video mẫu (gồm cả bước chân, hông, cột sống, vai và 2 tay).${includeSceneSnap ? ' Đã đính kèm 1 ảnh chụp trực tiếp khung cảnh 3D hiện tại.' : ''} Hãy kế thừa trực tiếp clip "${reusableVideoClipName}" và dùng \`"keepFromClip"\` khi cần giữ nguyên tư thế tay/thân của video.`)
            : (includeSceneSnap
                ? `Đã đính kèm 1 ảnh chụp trực tiếp khung cảnh 3D hiện tại cùng bản đồ tọa độ 3D của các đồ vật/nhân vật khác. Hãy quan sát ảnh và biên đạo đầy đủ mảng \`segments\` (di chuyển, tiếp cận, nắm/cầm/nâng/thả đồ vật...) đáp ứng chính xác kịch bản của người dùng.`
                : `Hãy tự do suy nghĩ, phân tích và biên đạo kế hoạch chuyển động chuẩn xác nhất theo đúng mô tả của người dùng.`));

      const systemPrompt = isRigidModel
        ? `Bạn là **Đạo diễn & Chuyên gia Diễn hoạt Vật thể / Phương tiện 3D (3D Rigid-Body & Vehicle Motion Director)**.
Nhiệm vụ: Tự do suy nghĩ và biên đạo chuỗi hành động / quỹ đạo chuyển động 3D đáp ứng CHÍNH XÁC mọi yêu cầu của người dùng (kể cả kịch bản nhiều bước phức tạp như đi thẳng, rẽ trái/phải, lùi xe, chạy vòng tròn, hình vuông, zig-zag, hình số 8, dừng chờ...).

### THÔNG TIN MÔ HÌNH HIỆN TẠI:
- Loại mô hình: Vật thể cứng / phương tiện (\`isRigidModel: true\`), số cụm bánh xe tự động lăn/đánh lái: \`${autoWheelCount}\` (${autoWheelCount >= 3 ? 'Xe 4 bánh — PHẢI giữ thân xe cân phẳng bám sàn, leanDeg = 0; engine sẽ tự quay lăn cả 4 bánh & đánh lái bánh trước theo quỹ đạo!' : autoWheelCount > 0 ? 'Xe 2 bánh — có thể đặt leanDeg nhẹ 8..10 độ khi vào cua; engine sẽ tự động quay lăn cả 2 bánh theo đúng quãng đường di chuyển!' : 'Đồ vật / phương tiện cứng'}).
- Các node an toàn: ${JSON.stringify(boneNames)}
- Kích thước gốc: rộng X=${rigSummary?.modelSize.x.toFixed(2)}, cao Y=${rigSummary?.modelSize.y.toFixed(2)}, dài Z=${rigSummary?.modelSize.z.toFixed(2)} (hướng tiến: ${rigSummary?.forwardAxis || '+z'}).
${sceneInteractTargets.length > 0 ? `- Bản đồ các đồ vật / nhân vật khác đang có trong cảnh 3D: ${JSON.stringify(sceneInteractTargets.map((t) => ({ id: t.id, name: t.name, isHumanoid: t.isHumanoid, distanceMeters: t.distanceMeters, angleDeg: t.angleDeg, forwardM: t.relForwardMeters, leftM: t.relLeftMeters, heightM: t.heightMeters })))}` : ''}${mentionDirectiveBlock}

### NGÔN NGỮ BIÊN ĐẠO QUỸ ĐẠO (\`segments\` — KHUYÊN DÙNG CHO MỌI QUỸ ĐẠO DI CHUYỂN):
Bạn có thể tự do kết hợp BẤT KỲ số lượng và thứ tự các đoạn \`segments\` nối tiếp liên tục (mỗi đoạn tự nối từ vị trí & hướng kết thúc của đoạn trước):
1. \`{ "type": "move", "distance": number (mét, dương=tiến, âm hoặc reverse:true=lùi), "duration": number (giây), "dy": 0, "angleDeg": 0, "reverse": false }\`
2. \`{ "type": "turn", "angleDeg": number (độ xoay tại chỗ: dương = xoay TRÁI, âm = xoay PHẢI, vd +90, -90, 180), "duration": number }\`
3. \`{ "type": "arc", "radius": number (bán kính mét; nếu đề bài cho đường kính/rộng D mét thì radius = D/2), "sweepDeg": number (góc cung độ: dương = cua TRÁI, âm = cua PHẢI; vòng tròn kín = -360 hoặc +360; cua vuông góc = -90 hoặc +90; quay chữ U = 180), "duration": number, "reverse": false, "leanDeg": ${autoWheelCount >= 3 ? '0' : '9'}, "centerOnOrigin": true/false }\`
4. \`{ "type": "waypoints", "points": [{"x": 0, "y": 0, "z": 5}, ...], "relative": true, "duration": number, "faceVelocity": true, "reverse": false }\` — đi qua chuỗi điểm bất kỳ (hình vuông, zig-zag, chữ L, bay lên/xuống).
5. \`{ "type": "figure8", "width": number (chiều rộng mét), "duration": number, "leanDeg": ${autoWheelCount >= 3 ? '0' : '10'} }\`
6. \`{ "type": "approach", "targetPropId": "<id chính xác từ bản đồ cảnh / @mention>", "stopDistance": 1.2, "duration": number }\` — tự quay đầu và di chuyển tới sát đồ vật/nhân vật đích trong cảnh.
7. \`{ "type": "wait", "duration": number }\` — dừng nghỉ tại chỗ.

### QUY TẮC BẮT BUỘC:
- KHÔNG tự ý bịa hay xoay các sub-mesh con (bánh xe, khung, ghi đông...) làm vỡ cấu trúc xe.
- Với xe 4 bánh (\`autoWheelCount >= 3\`), luôn đặt \`leanDeg: 0\` để cả 4 bánh luôn chạm sàn.
- Chỉ dùng \`keyframes\` trực tiếp trên \`__root__\` khi là hiệu ứng đơn giản tại chỗ (rung lắc, xoay trưng bày, bật nảy); mọi chuyển động di chuyển theo đường/quãng đường/nhiều chặng hãy trả về mảng \`segments\`.

### YÊU CẦU TỪ NGƯỜI DÙNG:
- "${prompt || 'Tạo chuyển động trình diễn mượt mà cho mô hình'}"

### YÊU CẦU ĐẦU RA (CHỈ TRẢ VỀ JSON THUẦN TÚY):
{
  "loop": true,
  "explanation": "Mô tả ngắn gọn kế hoạch chuyển động bạn vừa biên đạo",
  "segments": [
    { "type": "arc", "radius": 5, "sweepDeg": -360, "duration": 9.0, "leanDeg": ${autoWheelCount >= 3 ? '0' : '9'}, "centerOnOrigin": true }
  ]
}`
        : `Bạn là **Đạo diễn & Chuyên gia Diễn hoạt Nhân vật 3D (3D Character Motion Director & Skeletal Animator)**.
Nhiệm vụ: Tự do suy nghĩ, hiểu sâu mọi kịch bản tự nhiên của người dùng (1 hành động hay chuỗi nhiều hành động nối tiếp như đi bộ -> dừng lại vẫy tay -> quay đầu đi tiếp -> nhảy ăn mừng -> chạy hình vuông/vòng tròn/zig-zag...) và biên đạo kế hoạch chuyển động chuẩn xác.

### THÔNG TIN NHÂN VẬT HIỆN TẠI:
- Các khớp xương an toàn (CHỈ dùng tên trong danh sách này): ${JSON.stringify(boneNames)}
- Các clip dáng đi/chạy mocap có sẵn trên nhân vật (gồm cả clip nhúng GLB và clip đã trích từ video mẫu): ${JSON.stringify(allReusableGaitClips)} ${allReusableGaitClips.length > 0 ? `(KHUYÊN DÙNG: gán \`"gait": "embedded"\` và \`"clipName": "${allReusableGaitClips[0]}"\` trong các đoạn \`approach\` / \`move\` / \`waypoints\` / \`arc\` để tái sử dụng dáng bước chân mocap thật của nhân vật!)` : '(Không có clip mocap sẵn — dùng `gait: "walk"` hoặc `"run"` để engine đồng bộ bước chân theo tốc độ)'}
${sceneInteractTargets.length > 0 ? `- Bản đồ các đồ vật / nhân vật khác đang có trong cảnh 3D (tính trong hệ tọa độ của chính nhân vật đang chọn: \`forwardM\` dương=trước mặt, \`leftM\` dương=bên trái, \`angleDeg\` dương=quay trái / âm=quay phải, \`heightM\`=độ cao tính từ sàn): ${JSON.stringify(sceneInteractTargets.map((t) => ({ id: t.id, name: t.name, isHumanoid: t.isHumanoid, distanceMeters: t.distanceMeters, angleDeg: t.angleDeg, forwardM: t.relForwardMeters, leftM: t.relLeftMeters, heightM: t.heightMeters, height: t.heightLabel })))}` : ''}${mentionDirectiveBlock}

### HỆ THỐNG BIÊN ĐẠO TỰ DO (\`segments\` + \`keyframes\` — TỰ DO GHÉP NỐI MỌI KỊCH BẢN):
- **Khi yêu cầu có di chuyển không gian, tương tác/nắm đồ vật trong cảnh, đi vòng tránh vật cản, quay đầu, hoặc chuỗi nhiều hành động nối tiếp**: trả về mảng \`segments\` nối tiếp nhau liên tục (engine tự nối tọa độ & hướng, ghép dáng đi/chạy đồng bộ không trượt chân, giải 2-Bone IK chạm đúng đồ vật và tự giữ ổn định tay đang cầm đồ xuyên suốt các đoạn sau):
  1. \`{ "type": "move", "distance": number (mét, dương=tiến tới, âm hoặc reverse:true=đi lùi), "duration": number (~distance/1.35 cho đi bộ, ~distance/2.5 cho chạy), "gait": "${allReusableGaitClips.length > 0 ? 'embedded' : 'walk'}" | "walk" | "run" | "none", ${allReusableGaitClips.length > 0 ? `"clipName": "${allReusableGaitClips[0]}", ` : ''}"keyframes": [/* tùy chọn: cử chỉ tay/đầu khi đang đi */] }\`
  2. \`{ "type": "turn", "angleDeg": number (độ xoay tại chỗ: dương = quay TRÁI, âm = quay PHẢI, quay đầu 180° = 180), "duration": 0.85, "gait": "walk" | "none" }\`
  3. \`{ "type": "arc", "radius": number (bán kính mét; đường kính D => radius = D/2), "sweepDeg": number (dương=cua trái, âm=cua phải; vòng tròn kín = -360 hoặc +360), "duration": number, "gait": "${allReusableGaitClips.length > 0 ? 'embedded' : 'walk'}" | "run", ${allReusableGaitClips.length > 0 ? `"clipName": "${allReusableGaitClips[0]}", ` : ''}"centerOnOrigin": true/false }\`
  4. \`{ "type": "waypoints", "points": [{"x": 0, "y": 0, "z": 5}, ...], "relative": true, "duration": number, "gait": "${allReusableGaitClips.length > 0 ? 'embedded' : 'walk'}" | "run"${allReusableGaitClips.length > 0 ? `, "clipName": "${allReusableGaitClips[0]}"` : ''} }\` — đi theo đường gấp khúc / vòng tránh người hoặc vật cản (\`x\` dương=sang trái, \`z\` dương=tiến trước theo hướng nhân vật).
  5. \`{ "type": "figure8", "width": number, "duration": number, "gait": "${allReusableGaitClips.length > 0 ? 'embedded' : 'walk'}" | "run" }\`
  6. \`{ "type": "pose", "duration": number, "keepFromClip": ["rightArm" | "leftArm" | "arms" | "upperBody"], "keyframes": [ { "time": 0.0, "boneName": "RightArm", "rot": {"x": -35, "y": 0, "z": -70} }, ... ] }\` — đứng tại chỗ diễn tả cảm xúc/cử chỉ khớp xương tự do (vẫy tay, cúi chào, nhảy, đấm, đá, nhìn quanh, ăn mừng...).
  7. \`{ "type": "approach", "targetPropId": "<id chính xác từ bản đồ cảnh>", "stopDistance": 0.55, "gait": "${allReusableGaitClips.length > 0 ? 'embedded' : 'walk'}" | "walk" | "run"${allReusableGaitClips.length > 0 ? `, "clipName": "${allReusableGaitClips[0]}"` : ''}, "duration": number }\` — tự xoay mặt và đi/chạy tới sát đồ vật hoặc nhân vật đích trong cảnh (có thể ghép sau \`waypoints\` nếu cần đi vòng tránh vật cản trước!).
  8. \`{ "type": "reach_and_grab", "targetPropId": "<id chính xác từ bản đồ cảnh>", "hand": "right" | "left", "attach": true, "keepFromClip": ["rightArm" | "leftArm"], "duration": 0.55 }\` — tự giải 2-Bone Analytical IK đưa bàn tay chạm chính xác tâm món đồ (tự cúi/vươn theo độ cao thật), gập ngón tay nắm và gắn dính món đồ đi theo bàn tay. Từ sau đoạn này, món đồ tự di chuyển theo tay qua mọi đoạn tiếp theo!
  9. \`{ "type": "reach_pose", "hand": "right" | "left", "targetOffset": { "forward": 0.34, "up": 1.28, "side": 0.12 }, "keepFromClip": ["rightArm" | "leftArm"], "duration": 0.75, "keyframes": [/* tùy chọn: xoay đầu/mắt nhìn vào đồ vật */] }\` — tự giải 2-Bone IK đưa bàn tay (cùng món đồ đang cầm) đến vị trí 3D bất kỳ theo ý bạn (\`forward\`: mét phía trước mặt, \`up\`: độ cao tính từ sàn 0.15m=sàn .. 1.25m=ngực .. 1.95m=giơ cao trên đầu, \`side\`: lệch sang phía tay cầm; hoặc truyền \`targetPropId\` thay \`targetOffset\` để đưa món đồ tới gần nhân vật/vật thể khác!).
  10. \`{ "type": "release", "targetPropId": "<id>", "hand": "right" | "left", "keepFromClip": ["rightArm" | "leftArm"], "duration": 0.35 }\` — mở ngón tay và thả món đồ đang cầm xuống đúng vị trí hiện tại của bàn tay (sau đó có thể đi tiếp tay không!).
  11. \`{ "type": "wait", "duration": number, "keepFromClip": ["rightArm" | "leftArm" | "arms"] }\` — dừng giữ tư thế hiện tại (kể cả khi đang cầm đồ và giữ nguyên tay còn lại từ video mẫu).
${hasExtractedVideoClip ? `- **QUY TẮC BẮT BUỘC BẢO TOÀN ĐỘNG TÁC VIDEO MẪU ("${reusableVideoClipName}")**:
  1. Clip \`"${reusableVideoClipName}"\` ĐÃ chứa mocap 3D thật cho TOÀN BỘ cơ thể (chân, hông, cột sống, vai/xương đòn và CẢ 2 CÁNH TAY/CỔ TAY đúng như dáng người trong Video mẫu).
  2. Trên mọi đoạn di chuyển (\`approach\`, \`move\`, \`waypoints\`, \`arc\`, \`figure8\`), BẮT BUỘC dùng \`"gait": "embedded", "clipName": "${reusableVideoClipName}"\` và **TUYỆT ĐỐI KHÔNG** viết thêm \`keyframes\` cho tay/vai/thân nếu tư thế đó ĐÃ có sẵn trong Video mẫu (viết \`keyframes\` đè lên sẽ phá hỏng động tác mocap thật của video!). CHỈ viết \`keyframes\` kèm \`"overrideVideoBones": true\` khi người dùng yêu cầu thay đổi 1 bộ phận KHÁC HẲN với Video mẫu.
  3. Trên các đoạn tương tác/dừng sau đó (\`reach_and_grab\`, \`reach_pose\`, \`wait\`, \`pose\`, \`release\`), nếu muốn giữ nguyên tư thế thật từ Video mẫu cho cánh tay kia (VD: tay trái cầm điện thoại còn *"tay phải vẫn giữ nguyên"* dáng chống nạnh từ video), HÃY DÙNG \`"keepFromClip": ["rightArm"]\` (hoặc \`"leftArm"\`, \`"arms"\`, \`"upperBody"\`; truyền \`[]\` nếu muốn thả lỏng tay về nghỉ) và **KHÔNG** tự bịa góc Euler \`keyframes\` cho cánh tay được giữ nguyên!` : ''}
- **Lưu ý đạo diễn tương tác đồ vật**: Tự do biên đạo trọn vẹn ý đồ người dùng bằng cách ghép nối các đoạn trên (VD: \`waypoints\` vòng qua người -> \`approach\` -> \`reach_and_grab\` -> \`reach_pose\` giơ lên xem hoặc giơ cao ăn mừng -> \`turn\` -> \`move\` mang đi -> \`reach_pose\` hạ thấp -> \`release\` đặt xuống!). Đặt \`"loop": false\` khi kịch bản là một hành động tương tác có đầu có cuối (lấy đồ, đặt đồ, mang đi...).
- **Khi yêu cầu là động tác thuần tại chỗ hoặc bắt chước Video mẫu** (nhảy múa, đấm bốc, đá, moonwalk, cúi chào, tạo dáng... không có quãng đường): trả về trực tiếp \`keyframes\` (35-90 keyframes phân bố đều trên các khớp chính từ \`0\` đến \`duration\`).
- **Mẹo khép vòng lặp mượt**: Nếu muốn kịch bản quay đầu khép kín vòng lặp \`loop: true\` (vd: đi 10m rồi quay đầu đi lại 10m), hãy thêm 1 đoạn \`turn\` 180° ở cuối để nhân vật xoay lại đúng hướng ban đầu trước khi lặp!

### QUY ƯỚC HỆ TRỤC XOAY CHUẨN NHÂN VẬT (CHARACTER CARDINAL SPACE - cho mọi \`keyframes\`):
1. **Trục X (Pitch)**: Đùi (\`LeftUpLeg\`, \`RightUpLeg\`) x ÂM (-20..-100) nâng chân lên trước, x DƯƠNG (+15..+45) đưa ra sau; Đầu gối (\`LeftLeg\`, \`RightLeg\`) x DƯƠNG (+15..+100) gập gối về sau (KHÔNG dùng x âm); Cánh tay (\`LeftArm\`, \`RightArm\`) & Khuỷu tay (\`LeftForeArm\`, \`RightForeArm\`) x ÂM (-20..-100) đưa/gập tay lên trước; Cột sống & Đầu (\`Hips\`, \`Spine\`, \`Head\`) x DƯƠNG (+10..+45) cúi về trước.
2. **Trục Y (Yaw)**: y DƯƠNG xoay sang trái/phải quanh trục đứng.
3. **Trục Z (Roll)**: \`LeftArm\` z DƯƠNG (+15..+80) nâng giang tay trái lên cao, z ÂM (-12..-25) khép sát thân; \`RightArm\` z ÂM (-15..-80) nâng giang tay phải lên cao, z DƯƠNG (+12..+25) khép sát thân.
4. **Vị trí \`pos\` (mét)**: \`Hips.pos.y\` +0.08..+0.35 khi bật nhảy, -0.08..-0.40 khi nhún/squat.

### THÔNG TIN VIDEO MẪU & YÊU CẦU:
- ${frameMetaDesc}
- Yêu cầu từ người dùng: "${prompt || 'Bắt chước chính xác chuyển động, hướng xoay thân, bước chân và cử chỉ tay trong các khung hình video mẫu'}"

### YÊU CẦU ĐẦU RA (CHỈ TRẢ VỀ JSON THUẦN TÚY):
- Dùng \`segments\` cho kịch bản có di chuyển / nhiều bước, HOẶC dùng \`keyframes\` cho động tác tại chỗ / video mẫu:
{
  "loop": true,
  "duration": ${targetDur},
  "explanation": "Mô tả ngắn gọn kế hoạch chuyển động bạn vừa suy nghĩ và biên đạo",
  "segments": [ ... ],
  "keyframes": [ ... ]
}`;

      const parts: any[] = [{ text: systemPrompt }];
      if (visionFrames.length > 0) {
        for (const f of visionFrames) {
          parts.push({
            inlineData: {
              mimeType: f.mimeType || 'image/jpeg',
              data: f.base64
            }
          });
        }
      }
      if (includeSceneSnap) {
        // Đính kèm 1 ảnh chụp khung cảnh 3D hiện tại để AI Vision quan sát trực tiếp bố cục các nhân vật và đồ vật trong cảnh
        const sceneSnap = this.sceneService.captureSceneSnapshotBase64(640);
        if (sceneSnap?.base64) {
          parts.push({
            inlineData: {
              mimeType: sceneSnap.mimeType || 'image/jpeg',
              data: sceneSnap.base64
            }
          });
        }
      }

      let appliedCount = 0;
      let usedAiPlan = false;
      let explanation = '';
      let apiFailureMsg = '';
      try {
        const aiRes: any = await this.genaiService.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts }],
          config: {
            skipTTS: true,
            disableThinking: true,
            temperature: 0.25,
            abortSignal: abortCtrl.signal
          } as any
        });
        if (this._aiMotionRunSeq !== runSeq || abortCtrl.signal.aborted) {
          return;
        }
        const rawReply =
          aiRes?.text ||
          aiRes?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
          '';
        const parsed = this.extractJsonFromAiText(rawReply);
        if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
          this._normalizePlanSegmentTargets(parsed.segments, resolvedMentionTargets, sceneInteractTargets);
          appliedCount = this.sceneService.applyAiMotionPlan(pid, {
            ...parsed,
            prompt,
            referenceClipName: reusableVideoClipName || undefined
          });
          if (appliedCount >= 2) {
            usedAiPlan = true;
            explanation = parsed.explanation || '';
          }
        } else if (parsed && Array.isArray(parsed.keyframes) && parsed.keyframes.length >= (isRigidModel ? 4 : 8)) {
          const distinctBones = new Set(parsed.keyframes.map((k: any) => k?.boneName).filter(Boolean));
          const minDistinctBones = isRigidModel ? 1 : 3;
          if (distinctBones.size >= minDistinctBones) {
            appliedCount = this.sceneService.applyGeneratedBoneTimeline(pid, {
              duration: Number(parsed.duration) || targetDur,
              loop: parsed.loop !== false,
              keyframes: parsed.keyframes
            });
            if (appliedCount >= (isRigidModel ? 4 : 8)) {
              usedAiPlan = true;
              explanation = parsed.explanation || '';
            }
          }
        }
        if (!usedAiPlan) {
          apiFailureMsg = 'AI chưa trả về kế hoạch chuyển động hợp lệ. Vui lòng thử mô tả rõ hơn hoặc bấm thử lại.';
        }
      } catch (apiErr: any) {
        if (
          this._aiMotionRunSeq !== runSeq ||
          abortCtrl.signal.aborted ||
          apiErr?.name === 'AbortError' ||
          String(apiErr?.message || '').includes('Đã hủy yêu cầu AI')
        ) {
          return;
        }
        console.warn('[AI Motion Studio] AI call error:', apiErr);
        apiFailureMsg = this.formatAiMotionError(apiErr);
      }

      if (this._aiMotionRunSeq !== runSeq || abortCtrl.signal.aborted) {
        return;
      }

      if (!usedAiPlan) {
        this.aiMotionError = apiFailureMsg || 'Không thể tạo chuyển động bằng AI.';
        this.toastr.error(this.aiMotionError, 'AI Thiết kế chuyển động', { timeOut: 6000 });
        this.cdr.markForCheck();
        return;
      }

      this.aiMotionError = '';
    this.showAiMotionMentionMenu = false;
      this.timelineData = this.sceneService.getPropTimeline(pid);
      this.timelineCurrentTime = 0;
      const clipLabel = prompt ? prompt.slice(0, 32) : undefined;
      this.saveTimelineToProp(true, clipLabel);
      this.timelineClips = this.sceneService.getPropClips(pid);
      const usedProvider = this.genaiService.lastUsedProvider ? `[${this.genaiService.lastUsedProvider}] ` : '';
      this.toastr.success(
        `${usedProvider}${explanation || `AI đã thiết kế xong ${appliedCount} Keyframe chuyển động và bắt đầu phát!`}`,
        'AI Motion Studio'
      );
    } catch (err: any) {
      if (this._aiMotionRunSeq !== runSeq || abortCtrl.signal.aborted || err?.name === 'AbortError') {
        return;
      }
      this.aiMotionError = this.formatAiMotionError(err);
      this.toastr.error(this.aiMotionError, 'AI Thiết kế chuyển động', { timeOut: 6000 });
    } finally {
      if (this._aiMotionRunSeq === runSeq) {
        this._aiMotionAbortController = null;
        this.isDesigningAiMotion = false;
        this.aiMotionProgressPercent = 0;
        this.aiMotionProgressStage = '';
        this.cdr.markForCheck();
      }
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
        let targetPropInstruction = '';
        if (targetProps && targetProps.length > 0) {
          const names = targetProps.map(p => `"${p.name}" (ID: "${p.id}")`).join(', ');
          targetPropInstruction = `
⚠️ CHÚ Ý QUAN TRỌNG VỀ TARGET SCOPE:
Người dùng đang ĐÍNH KÈM / @MENTION ĐỒ VẬT CHỈ ĐỊNH: [${names}].
- Bạn CHỈ ĐƯỢC PHÉP trả về 'modifyProp' (hoặc 'designBoneAnimation' nếu yêu cầu tạo chuyển động khớp xương cho đối tượng này) để chỉnh sửa thuộc tính JSON Data (như \`activeScreenState: "clock"\`, \`screenOptions\`, \`color\`, \`position\`, \`rotation\`, \`scale\`, \`visible\`,...) CỦA ĐÚNG MÓN ĐỒ VẬT ĐƯỢC MENTION NÀY!
- Trả về object \`modifyProp\` chứa \`targetPropId\` (hoặc \`targetPropName\`) và \`patch\` chứa ĐÚNG CÁC KEY & GIÁ TRỊ CẦN SỬA (ví dụ khi người dùng yêu cầu đổi màu nền màn hình, hãy sửa \`activeScreenState: "clock"\` và \`screenOptions: { "bgColor": "#HexColor" }\`).
- ĐẶC BIỆT DÀNH CHO MÀN HÌNH (MONITOR): Nếu người dùng yêu cầu hiển thị HÌNH ẢNH / FILE ẢNH (chứa đường dẫn file ảnh .png, .jpg, .webp hoặc url), hãy đặt \`activeScreenState: "image"\` và \`screenOptions: { "imageUrl": "đường_dẫn_file_ảnh" }\`.
- TUYỆT ĐỐI KHÔNG thay đổi hệ thống đèn (lightsOn) khi người dùng đang chỉ định đồ vật!`;
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

4. ĐỔI MÀU MÔI TRƯỜNG SHOWROOM STUDIO ('environment'):
   - background: Đổi màu nền Studio (Hex).
   - table: Đổi màu mặt bàn gỗ (Hex).
   - cloth: Đổi màu khăn vải trải bàn (Hex).

5. ĐIỀU KHIỂN CAMERA ('cameraPreset' / 'focusPropName'):
   - cameraPreset: 'default' | 'desk' | 'overhead'
   - focusPropName: Tập trung góc nhìn vào một món đồ.

6. KÍCH HOẠT HIỆU ỨNG SCRIPT PLAYCANVAS ('applyEffect'):
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

8. THIẾT KẾ CLIP CHUYỂN ĐỘNG KHỚP XƯƠNG & QUỸ ĐẠO 3D ('designBoneAnimation'):
   - Khi người dùng yêu cầu diễn hoạt nhân vật hoặc di chuyển nhân vật/xe theo bất kỳ quãng đường, quỹ đạo hay chuỗi hành động nào (đi bộ 10m rồi quay đầu, đi bộ rồi dừng vẫy tay, chạy hình vuông/vòng tròn/zig-zag, lùi xe, nhảy, đá, đấm, vẫy tay, cúi chào...), BẮT BUỘC trả về \`designBoneAnimation\` (KHÔNG dùng \`modifyProp.position\`):
     * Nếu có di chuyển không gian / quãng đường / nhiều chặng, hãy tự biên đạo mảng \`segments\` nối tiếp nhau:
       - \`{ "type": "move", "distance": number (mét, âm hoặc reverse:true = lùi), "duration": number, "gait": "embedded"|"walk"|"run"|"none", "clipName": string }\`
       - \`{ "type": "turn", "angleDeg": number (+ trái, - phải, 180 = quay đầu), "duration": 0.85, "gait": "walk"|"none" }\`
       - \`{ "type": "arc", "radius": number (bán kính = đường kính / 2), "sweepDeg": number (+ cua trái, - cua phải; vòng tròn = -360/+360), "duration": number, "reverse": false, "leanDeg": 0 (xe 4 bánh luôn 0, xe 2 bánh 8..10), "centerOnOrigin": true/false, "gait": "embedded"|"walk"|"run" }\`
       - \`{ "type": "waypoints", "points": [{"x":0,"y":0,"z":5},...], "relative": true, "duration": number, "gait": "embedded"|"walk"|"run" }\`
       - \`{ "type": "figure8", "width": number, "duration": number, "leanDeg": 0 }\`
       - \`{ "type": "pose", "duration": number, "keyframes": [ { "time": 0.0, "boneName": "...", "rot": {"x":0,"y":0,"z":0}, "pos": {"x":0,"y":0,"z":0} } ] }\`
     * Nếu là động tác tại chỗ thuần túy hoặc bắt chước video, trả về trực tiếp \`keyframes\`:
       { "targetPropId": "id_món_đồ_GLB", "duration": 2.4, "loop": true, "segments": [...], "keyframes": [...] }
   - Chỉ sử dụng tên khớp trong \`rigBones\` và tên clip nhúng trong \`embeddedClips\` của đồ vật đó ở TRẠNG THÁI HIỆN TẠI bên dưới.
   - Với vật thể cứng / xe cộ (\`isRigidModel: true\`): không xoay sub-mesh con; với xe 4 bánh (\`autoWheelCount >= 3\`), luôn đặt \`leanDeg: 0\` (bánh xe tự lăn & đánh lái theo quỹ đạo).
   - Quy ước Character Cardinal Space cho \`keyframes\`:
     * X (Pitch): Đùi x âm (-20..-100) nâng lên trước, x dương ra sau; Đầu gối x dương (+15..+100) gập về sau; Tay & Khuỷu x âm (-20..-100) đưa/gập lên trước; Thân/Đầu x dương (+10..+45) cúi trước.
     * Y (Yaw): xoay quanh trục đứng.
     * Z (Roll): LeftArm z dương (+15..+80) nâng cao, z âm khép sát; RightArm z âm (-15..-80) nâng cao, z dương khép sát.
     * pos (mét): Hips.pos.y dương bật nhảy, âm nhún/ngồi.

---
### TRẠNG THÁI HIỆN TẠI:
${JSON.stringify({
  username: this.username,
  props: this.roomProps.map(p => {
    const rigInfo = p.visible && this.sceneService.hasPropRig(p.id)
      ? this.sceneService.getPropRigSummary(p.id)
      : null;
    return {
      id: p.id,
      name: p.name,
      shape: p.shape || 'box',
      color: p.color,
      position: p.position,
      rotation: p.rotation,
      scale: p.scale,
      animation: p.animation || 'none',
      visible: p.visible,
      isRigidModel: rigInfo ? rigInfo.isRigidModel : undefined,
      autoWheelCount: rigInfo ? rigInfo.autoWheelCount : undefined,
      embeddedClips: rigInfo && rigInfo.embeddedClipNames.length > 0 ? rigInfo.embeddedClipNames : undefined,
      rigBones: rigInfo ? rigInfo.safeBoneNames : undefined
    };
  })
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
            skipTTS: true,
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

            // ONLY update global scene IF NO target prop was mentioned (@mention)
            if (!hasTargetProps) {
              if (parsed.lightsOn !== null && parsed.lightsOn !== undefined) {
                currentProfile.scene.lightsOn = parsed.lightsOn;
                this.sceneService.clickLightSwitch(parsed.lightsOn);
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
                const count = Array.isArray(dba.segments) && dba.segments.length > 0
                  ? this.sceneService.applyAiMotionPlan(targetPid, { ...dba, prompt: text })
                  : this.sceneService.applyGeneratedBoneTimeline(targetPid, dba);
                if (count > 0) {
                  this.openPropTimeline(targetPid);
                  this.saveTimelineToProp(true, text.slice(0, 32));
                  updated = true;
                  message = parsed.explanation || `AI đã biên đạo và tạo xong ${count} Keyframe chuyển động!`;
                }
              }
            }
            if (parsed.explanation && !updated) {
              message = parsed.explanation;
            } else if (parsed.explanation && !parsed.designBoneAnimation) {
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
        /moonwalk|trượt|keyframe|khớp xương|chuyển động|diễn hoạt|đá|kick|đấm|boxing|võ|kungfu|cúi|chào|vẫy|wave|nhảy|dance|hiphop|jump|ngồi|squat|thụt dầu|xoay người|quay người|quay đầu|quay lại|spin|giơ tay|ăn mừng|vỗ tay|clap|gật đầu|lắc đầu|đi bộ|walk|chạy|run|thuyết trình|tạo dáng|pose/.test(lower))
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

    // 💾 2. TỰ ĐỘNG LƯU TRỰC TIẾP VÀO THƯ MỤC Documents/ai.type/data/profiles/{username}/ (props.json, room.json, profile.json)
    try {
      await this.profileDataService.saveProps(this.roomProps).toPromise();
      await this.profileDataService.saveProfile(currentProfile).toPromise();
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

        await this.sceneService.initScene(this.canvasRef.nativeElement, this.profile, null);
        this.sceneService.rerunAllFxEffects();
        await this.loadSavedPropGlbs();
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

  /** Snapshot dữ liệu scene hiện tại để lưu (đồng bộ luôn tư thế tĩnh mới nhất, ánh sáng & góc máy) */
  private _buildDesignSnapshot(): Design3DSnapshot {
    const currentProfile: any = this.profile || {};
    const cleanProps = (this.roomProps || []).map((p: any) => {
      if (!p || typeof p !== 'object') return p;
      if (this.sceneService.hasPropRig(p.id)) {
        this.sceneService.syncStaticPoseToTimeline(p.id);
        const liveTl = this.sceneService.getPropTimeline(p.id);
        if (liveTl) {
          p.boneTimeline = JSON.parse(JSON.stringify(liveTl));
        }
      }
      const copy = JSON.parse(JSON.stringify(p));
      delete copy._inserting;
      delete copy._glbLoaded;
      if (copy.customTexturePath) {
        delete copy.customTextureDataUrl;
      }
      return copy;
    });

    const baseScene = currentProfile.scene ? JSON.parse(JSON.stringify(currentProfile.scene)) : {};
    const camSnap = this.sceneService.getCameraSnapshot();
    const lightSnap = this.sceneService.getStudioLighting();
    const aiVideo3dSnap = this._buildAiVideo3dState();
    if (camSnap) baseScene.camera = camSnap;
    if (lightSnap) baseScene.lighting = lightSnap;
    baseScene.aiVideo3d = aiVideo3dSnap;

    return {
      props: cleanProps,
      character: currentProfile.character ? JSON.parse(JSON.stringify(currentProfile.character)) : undefined,
      scene: baseScene,
      aiVideo3d: aiVideo3dSnap
    };
  }

  /** Chụp thumbnail gọn nhẹ (JPEG 320px) từ canvas 3D */
  private _captureThumbnail(): string | null {
    try {
      const snap = this.sceneService.captureSceneSnapshotBase64(320);
      if (snap?.dataUrl) return snap.dataUrl;
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) return null;
      return canvas.toDataURL('image/jpeg', 0.82);
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
      const ok = !!res && (res.success === true || (res.success !== false && !res.error));
      if (ok) {
        // Xác định designId: ưu tiên res.data, sau đó pendingDesignId, sau đó tự sinh
        const designId = res?.data?.id || res?.data?.designId || this.pendingDesignId || ('design_' + Date.now());
        this.activeDesignPresetId = designId;
        if (snapshot.aiVideo3d) {
          this._designAiVideo3dCache.set(designId, JSON.parse(JSON.stringify(snapshot.aiVideo3d)));
        }
        this.profileDataService.saveSceneSilent({
          aiVideo3d: snapshot.aiVideo3d,
          activeDesignPresetId: designId
        }).subscribe();
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
        const reason = typeof res?.error === 'string' && res.error.trim() ? ` (${res.error.trim()})` : '';
        this.toastr.error(`Không thể lưu mẫu thiết kế${reason}. Vui lòng thử lại.`, 'Lỗi');
      }
      this.cdr.markForCheck();
    });
  }

  /** Nạp 1 mẫu thiết kế vào cảnh hiện tại (chống race khi bấm chuyển qua lại liên tục trong CỦA TÔI) */
  async applyDesignPreset(preset: Design3DPreset): Promise<void> {
    if (!preset?.id) return;

    // 1. Chốt & chờ lưu xong hoàn toàn trạng thái VIDEO CẢNH 3D (đường máy, ảnh mẫu, prompt, lịch sử) của mẫu trước đó
    if (this._aiVideo3dSaveTimer) {
      clearTimeout(this._aiVideo3dSaveTimer);
      this._aiVideo3dSaveTimer = null;
    }
    if (!this._switchingDesignPreset && !this._aiVideo3dRestoring && this.activeDesignPresetId) {
      const prevId = this.activeDesignPresetId;
      const prevState = this._buildAiVideo3dState();
      await this._flushSaveAiVideo3dStateAsync(prevId, prevState);
    }

    const mySeq = ++this._applyDesignSeq;
    const prevActiveId = this.activeDesignPresetId;
    this._switchingDesignPreset = true;
    this.activeDesignPresetId = preset.id;
    this.cdr.markForCheck();

    let res: any;
    try {
      res = await this._design3dService.get(preset.id).toPromise();
    } catch (e) {
      if (mySeq === this._applyDesignSeq) {
        this.activeDesignPresetId = prevActiveId;
        this._switchingDesignPreset = false;
        this.cdr.markForCheck();
      }
      this.toastr.error('Không đọc được dữ liệu mẫu thiết kế.', 'Lỗi');
      return;
    }

    if (mySeq !== this._applyDesignSeq) return;

    const sceneData =
      res?.data?.sceneData ||
      res?.data?.data ||
      (Array.isArray(res?.data?.props) ? res.data : null) ||
      res?.sceneData;
    if (!sceneData || !Array.isArray(sceneData.props)) {
      this.activeDesignPresetId = prevActiveId;
      this._switchingDesignPreset = false;
      this.cdr.markForCheck();
      this.toastr.error('Mẫu thiết kế không có dữ liệu hợp lệ.', 'Lỗi');
      return;
    }

    try {
      // 2. Nạp NGAY dữ liệu VIDEO CẢNH 3D & đường máy của mẫu mới (ưu tiên bản mới hơn giữa đĩa sidecar và cache RAM)
      const diskAiVideo3d = sceneData.aiVideo3d || sceneData.scene?.aiVideo3d || null;
      const cachedAiVideo3d = this._designAiVideo3dCache.get(preset.id) || null;
      let presetAiVideo3d: any = diskAiVideo3d;
      if (cachedAiVideo3d && (!diskAiVideo3d || (Number(cachedAiVideo3d.updatedAt) || 0) >= (Number(diskAiVideo3d.updatedAt) || 0))) {
        presetAiVideo3d = cachedAiVideo3d;
      }
      if (presetAiVideo3d) {
        this._designAiVideo3dCache.set(preset.id, JSON.parse(JSON.stringify(presetAiVideo3d)));
      }

      // Khôi phục toàn bộ trường đường máy / ảnh mẫu / prompt / lịch sử ngay trước khi nạp GLB nặng (không đợi đọc MP4 khóa UI)
      const restorePromise = this.restoreAiVideo3dState(presetAiVideo3d);
      if (mySeq === this._applyDesignSeq) {
        this._switchingDesignPreset = false;
      }

      // 3. Cập nhật state props, character, scene trong component
      this.roomProps = this.mergeProps(sceneData.props);
      (this.profile as any).props = this.roomProps;

      if (sceneData.character && this.profile) {
        this.profile.character = { ...this.profile.character, ...sceneData.character };
      }
      if (sceneData.scene && this.profile) {
        this.profile.scene = { ...(this.profile.scene || {} as any), ...sceneData.scene };
      }

      // 4. Áp vào scene 3D, nạp GLB và khôi phục tư thế (boneTimeline/staticPose), ánh sáng, camera
      this.sceneService.applyProfile(this.profile, { skipCamera: true });
      await this.loadSavedPropGlbs();
      if (mySeq !== this._applyDesignSeq) return;

      for (const prop of this.roomProps) {
        if (prop && prop.visible !== false && this.sceneService.hasPropRig(prop.id)) {
          this.sceneService.applySavedTimelineToRig(prop.id, prop.boneTimeline);
        }
      }
      if (sceneData.scene?.lighting) {
        this.sceneService.applyStudioLighting(sceneData.scene.lighting);
        this.lightingConfig = this.sceneService.getStudioLighting();
      }
      if (sceneData.scene?.camera) {
        this.sceneService.restoreCameraSnapshot(sceneData.scene.camera);
      }

      await restorePromise;
      if (mySeq !== this._applyDesignSeq) return;

      if (this.isAiVideo3dOpen) {
        this.refreshAiVideo3dSceneSummary();
      }

      // 5. Lưu tuần tự props rồi mới lưu scene mới nhất (đọc tươi _buildAiVideo3dState để không bao giờ ghi đè bằng bản cũ)
      this.profileDataService.saveProps(this.roomProps).subscribe(() => {
        if (mySeq !== this._applyDesignSeq) return;
        const freshScenePatch: any = {
          ...(sceneData.scene?.lighting ? { lighting: sceneData.scene.lighting } : {}),
          ...(sceneData.scene?.camera ? { camera: sceneData.scene.camera } : {}),
          aiVideo3d: this._buildAiVideo3dState(),
          activeDesignPresetId: preset.id
        };
        this.profileDataService.saveSceneSilent(freshScenePatch).subscribe();
      });
      this.onSearchChange();
      this.cdr.markForCheck();

      this.toastr.success(`Đã nạp mẫu thiết kế "${preset.name}".`, 'Thành công');
    } catch (e) {
      if (mySeq === this._applyDesignSeq) {
        this._switchingDesignPreset = false;
      }
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
  /**
   * Nhân bản mẫu thiết kế theo kiểu "cảnh nối tiếp": khung hình cuối cùng của cảnh gốc
   * (tư thế cuối của từng nhân vật/đồ vật + góc camera cuối) trở thành khung hình đầu tiên của cảnh mới.
   */
  async duplicateDesignPreset(preset: Design3DPreset): Promise<void> {
    if (!preset?.id || this.duplicatingDesign) return;

    const canUseCanvas =
      !!this.canvasRef?.nativeElement &&
      typeof (this.sceneService as any).captureRigsEndFramePoses === 'function';
    if (!canUseCanvas) {
      this._duplicateDesignPresetRaw(preset);
      return;
    }

    this.duplicatingDesign = true;
    this.cdr.markForCheck();
    try {
      // 1. Bảo đảm cảnh gốc đang hiển thị trên canvas để đọc đúng khung hình cuối
      if (this.activeDesignPresetId !== preset.id) {
        await this.applyDesignPreset(preset);
        if (this.activeDesignPresetId !== preset.id) {
          throw new Error('Không nạp được mẫu gốc.');
        }
        await this._waitFrames(3);
      }
      this.stopCameraPathPreview(false);

      // 2. Chụp trạng thái cảnh gốc
      const srcAiVideo = this._buildAiVideo3dState();
      const snapshot = this._buildDesignSnapshot();
      const sceneDur = Math.max(1, Number(srcAiVideo.duration) || 5);

      // 3. Khung hình cuối của mọi nhân vật / đồ vật có khung xương (kèm vị trí cuối của các đồ vật đang bị cầm trên tay)
      const endPoses = await this.sceneService.captureRigsEndFramePoses(sceneDur);
      const grabEndTransforms = this.sceneService.captureHandGrabEndTransforms(sceneDur);

      // 4. Góc camera cuối (cuối Đường máy nếu có, ngược lại là góc camera đang dùng để ghi)
      let endCam: any = null;
      if (srcAiVideo.cameraMode === 'path' && Array.isArray(srcAiVideo.cameraKeyframes) && srcAiVideo.cameraKeyframes.length >= 2) {
        endCam = this.sceneService.evaluateCameraKeyframesAtTime(srcAiVideo.cameraKeyframes, sceneDur);
      }
      if (!endCam) {
        endCam = this.sceneService.getCameraSnapshot();
      }

      // 5. Dựng dữ liệu cảnh mới: tư thế cuối => keyframe t = 0 + tư thế tĩnh
      const stamp = Date.now().toString(36);
      let posedCount = 0;
      const newProps = (snapshot.props || []).map((p: any) => {
        if (!p || !p.id) return p;
        const grabEnd = grabEndTransforms.get(p.id);
        const pose = endPoses.get(p.id);
        let updated: any = p;
        if (grabEnd) {
          updated = {
            ...updated,
            position: { ...grabEnd.pos },
            rotation: { ...grabEnd.rot },
            _customPositionSet: true,
            _customRotationSet: true
          };
        }
        if (!pose) return updated;
        posedCount++;
        const srcTl = updated.boneTimeline || {};
        const startKeyframes = pose.map((b, i) => ({
          id: `kf_${stamp}_${i}`,
          time: 0,
          boneName: b.boneName,
          rot: { ...b.rot },
          pos: b.pos ? { ...b.pos } : { x: 0, y: 0, z: 0 }
        }));
        const nextTl: any = {
          ...srcTl,
          enabled: true,
          playing: false,
          mode: 'keyframes',
          poseSpace: 'rest',
          savedTime: 0,
          staticPose: pose,
          handGrabs: [],
          keyframes: startKeyframes
        };
        delete nextTl.lastAiPrompt;
        delete nextTl.lastAiSegments;
        return { ...updated, boneTimeline: nextTl };
      });

      const startCamKeyframes = endCam
        ? [{
            id: `camkf_${stamp}_0`,
            time: 0,
            label: 'Nối từ cảnh trước',
            pivot: {
              x: Math.round(endCam.pivot.x * 100) / 100,
              y: Math.round(endCam.pivot.y * 100) / 100,
              z: Math.round(endCam.pivot.z * 100) / 100
            },
            yaw: Math.round(endCam.yaw * 10) / 10,
            pitch: Math.round(endCam.pitch * 10) / 10,
            distance: Math.round(endCam.distance * 100) / 100,
            easing: 'smooth'
          }]
        : [];

      const newAiVideo = {
        ...srcAiVideo,
        cameraMode: 'keep',
        cameraKeyframes: startCamKeyframes,
        cameraAiPrompt: '',
        capturedFilePath: null,
        capturedHasCameraMotion: false,
        capturedCameraSummary: '',
        resultFilePath: null,
        resultUrl: null,
        activeHistoryId: null,
        history: [],
        updatedAt: Date.now()
      };
      const newScene: any = { ...(snapshot.scene || {}), aiVideo3d: newAiVideo };
      if (startCamKeyframes.length > 0) {
        const k0 = startCamKeyframes[0];
        newScene.camera = { pivot: { ...k0.pivot }, yaw: k0.yaw, pitch: k0.pitch, distance: k0.distance };
      }
      delete newScene.activeDesignPresetId;

      const newId = 'design_' + Date.now();
      const newName = `${preset.name} (tiếp nối)`;
      const saveRes: any = await this._design3dService.save({
        id: newId,
        name: newName,
        description: preset.description || '',
        sceneData: { props: newProps, character: snapshot.character, scene: newScene, aiVideo3d: newAiVideo }
      }).toPromise();
      const ok = !!saveRes && (saveRes.success === true || (saveRes.success !== false && !saveRes.error));
      if (!ok) {
        throw new Error(typeof saveRes?.error === 'string' ? saveRes.error : 'Không lưu được cảnh nhân bản.');
      }
      const savedId = saveRes?.data?.id || newId;
      this._designAiVideo3dCache.set(savedId, JSON.parse(JSON.stringify(newAiVideo)));

      // 6. Mở ngay cảnh mới (bắt đầu từ khung hình cuối của cảnh gốc) và chụp thumbnail
      await this.applyDesignPreset({ id: savedId, name: newName, description: preset.description || '' } as Design3DPreset);
      await this._waitFrames(3);
      const thumb = this._captureThumbnail();
      if (thumb) {
        await this._design3dService.saveThumbnail(savedId, thumb).toPromise().catch(() => null);
      }
      this.loadDesignPresets();

      this.toastr.success(
        posedCount > 0
          ? `Đã nhân bản "${preset.name}": khung hình cuối (${posedCount} nhân vật/đồ vật + góc camera) là khung hình đầu của cảnh mới.`
          : `Đã nhân bản "${preset.name}": góc camera cuối là khung hình đầu của cảnh mới.`,
        'Nhân bản cảnh nối tiếp',
        { timeOut: 5000 }
      );
    } catch (e: any) {
      console.error('[Profile] Nhân bản cảnh nối tiếp lỗi:', e);
      this.toastr.error(e?.message || 'Không thể nhân bản mẫu thiết kế.', 'Lỗi');
    } finally {
      this.duplicatingDesign = false;
      this.cdr.markForCheck();
    }
  }

  private _waitFrames(n = 2): Promise<void> {
    return new Promise<void>((resolve) => {
      let left = Math.max(1, n);
      const step = () => {
        left--;
        if (left <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** Nhân bản thô 1:1 qua Electron (dự phòng khi không có canvas 3D) */
  private _duplicateDesignPresetRaw(preset: Design3DPreset): void {
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
          this._designAiVideo3dCache.delete(preset.id);
          if (this.activeDesignPresetId === preset.id) {
            this.activeDesignPresetId = null;
            this.profileDataService.saveSceneSilent({ activeDesignPresetId: null }).subscribe();
          }
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
    if (preset.thumbnailDataUrl) return preset.thumbnailDataUrl;
    if (preset.sceneData?.thumbnail) return preset.sceneData.thumbnail;
    if (preset.thumbnailPath && /^(https?:|data:|blob:)/i.test(preset.thumbnailPath)) return preset.thumbnailPath;
    return null;
  }

  get dataService(): ProfileDataService { return this.profileDataService; }

  ngOnDestroy(): void {
    this.stopAiMotionDesign(true);
    if (this._poseAutoSaveTimer) {
      clearTimeout(this._poseAutoSaveTimer);
      this._poseAutoSaveTimer = null;
      if (this.timelinePropId) {
        try { this.saveTimelineToProp(true); } catch (_) {}
      }
    }
    if (this._aiVideo3dSaveTimer) {
      clearTimeout(this._aiVideo3dSaveTimer);
      this._aiVideo3dSaveTimer = null;
      try { this._flushSaveAiVideo3dState(); } catch (_) {}
    }
    if (this.aiVideo3dCapturedPreviewUrl && this.aiVideo3dCapturedPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.aiVideo3dCapturedPreviewUrl); } catch (_) {}
    }
    if (this.aiVideo3dResultPreviewUrl && this.aiVideo3dResultPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.aiVideo3dResultPreviewUrl); } catch (_) {}
    }
    if (this._recordingTimerInterval) clearInterval(this._recordingTimerInterval);
    if (this._frameExportInterval) clearInterval(this._frameExportInterval);
    if (this._unsubMocapProgress) {
      try { this._unsubMocapProgress(); } catch (_) {}
      this._unsubMocapProgress = null;
    }
    this._destroy$.next();
    this._destroy$.complete();
    this.sceneService.destroyScene();
  }
}
