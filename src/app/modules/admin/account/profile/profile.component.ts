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
import { SontinhSceneService } from './sontinh-scene.service';
import { ProfileDataService, UserProfile } from './profile-data.service';
import { GenaiService } from 'app/genai.service';

import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';

const DEFAULT_PROPS = [
  // 🏢 KIẾN TRÚC TÒA NHÀ & CĂN PHÒNG 306
  { id: 'prop_building_5story_main', name: 'Tòa nhà chính 5 tầng (Sơn Tinh Tower)', category: 'architecture', visible: true },
  { id: 'prop_room_306_floor', name: 'Tầng 3 - Căn phòng 306 Studio', category: 'architecture', visible: true },
  { id: 'prop_building_floor1', name: 'Tầng 1 - Sảnh chính & Cửa kính lớn', category: 'architecture', visible: true },
  { id: 'prop_building_floor2', name: 'Tầng 2 - Ban công & Khung kính lớn', category: 'architecture', visible: true },
  { id: 'prop_building_floor4', name: 'Tầng 4 - Khối văn phòng sáng đèn', category: 'architecture', visible: true },
  { id: 'prop_building_floor5', name: 'Tầng 5 - Áp mái & Tầng thượng Penthouse', category: 'architecture', visible: true },
  { id: 'prop_room_marble_floor', name: 'Sàn đá Cẩm thạch Marble cao cấp', category: 'architecture', visible: true },
  { id: 'prop_room_walls', name: 'Tường sơn phẳng liền mạch bao quanh', category: 'architecture', visible: true },
  { id: 'prop_room_ceiling', name: 'Trần nhà sơn đồng bộ 306', category: 'architecture', visible: true },
  { id: 'prop_main_door', name: 'Cửa chính ra vào căn phòng', category: 'architecture', visible: true },
  { id: 'prop_window_21_9', name: 'Cửa sổ nhôm kính Minimalist 21:9', category: 'architecture', visible: true },

  // 🪑 NỘI THẤT BÀN GHẾ & TỦ
  { id: 'prop_main_desk', name: 'Bàn làm việc đôi Haigo BHS230-2', category: 'furniture', visible: true },
  { id: 'prop_chair_left', name: 'Ghế xoay ergonomic trái', category: 'furniture', visible: true },
  { id: 'prop_chair_right', name: 'Ghế xoay ergonomic phải', category: 'furniture', visible: true },
  { id: 'prop_pegboard', name: 'Tủ Pegboard treo tường', category: 'furniture', visible: true },
  { id: 'prop_clothing_drawer', name: 'Tủ đồ quần áo gỗ', category: 'furniture', visible: true },
  { id: 'prop_desk_mat_left', name: 'Thảm lót bàn làm việc trái', category: 'furniture', visible: true },
  { id: 'prop_desk_mat_right', name: 'Thảm lót bàn làm việc phải', category: 'furniture', visible: true },

  // 🖥️ THIẾT BỊ ĐIỆN TỬ & CÔNG NGHỆ
  { id: 'prop_monitor_left', name: 'Màn hình cong ultrawide trái', category: 'electronics', visible: true },
  { id: 'prop_monitor_right', name: 'Màn hình cong ultrawide phải', category: 'electronics', visible: true },
  { id: 'prop_mechanical_keyboard_left', name: 'Bàn phím cơ custom trái', category: 'electronics', visible: true },
  { id: 'prop_mechanical_keyboard_right', name: 'Bàn phím cơ custom phải', category: 'electronics', visible: true },
  { id: 'prop_mouse_left', name: 'Chuột không dây Logitech M185 trái', category: 'electronics', visible: true },
  { id: 'prop_mouse_right', name: 'Chuột không dây Logitech M185 phải', category: 'electronics', visible: true },
  { id: 'prop_ps5_pro', name: 'Máy chơi game PS5 Pro', category: 'electronics', visible: true },

  // 💡 ĐÈN & TRANG TRÍ
  { id: 'prop_aquarium', name: 'Bể cá thủy sinh bàn làm việc', category: 'decoration', visible: true },
  { id: 'prop_picture_frame', name: 'Khung ảnh gia đình treo tường', category: 'decoration', visible: true },
  { id: 'prop_wall_clock', name: 'Đồng hồ treo tường Gỗ Óc chó', category: 'decoration', visible: true },
  { id: 'prop_tech_led_bar', name: 'Đèn LED Bar màn hình', category: 'lighting', visible: true },
  { id: 'prop_wall_switch', name: 'Công tắc đèn tường dạ quang', category: 'lighting', visible: true },
  { id: 'prop_ceiling_downlight_front', name: 'Đèn âm trần LED trước', category: 'lighting', visible: true },
  { id: 'prop_ceiling_downlight_back', name: 'Đèn âm trần LED sau', category: 'lighting', visible: true },
  { id: 'prop_ceiling_downlight_left', name: 'Đèn âm trần LED trái', category: 'lighting', visible: true },
  { id: 'prop_ceiling_downlight_right', name: 'Đèn âm trần LED phải', category: 'lighting', visible: true },

  // 🚗 CẢNH QUAN & NGOẠI THẤT
  { id: 'prop_street_cars', name: 'Các xe ô tô di chuyển đường phố', category: 'environment', visible: true },
  { id: 'prop_street_trees', name: 'Hàng cây xanh cảnh quan đường phố', category: 'environment', visible: true },
  { id: 'prop_street_shophouses', name: 'Dãy nhà phố thương mại ngoài sổ', category: 'environment', visible: true },
  { id: 'prop_street_traffic_lanes', name: 'Làn xe giao thông đường phố', category: 'environment', visible: true }
];

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
      return this.roomProps || [];
    }
    const q = queryStr.toLowerCase().trim();

    return (this.roomProps || []).filter(p => {
      if (!p) return false;
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
  userAnimations: Array<{ id: string; name: string; glbPath: string; isMovement?: boolean; speed?: number; uploadedAt?: string }> = [];
  attachedImages: Array<{ dataUrl: string; base64: string; mimeType: string }> = [];

  private _destroy$    = new Subject<void>();
  private _charBlobUrl: string | null = null;

  constructor(
    private sceneService: SontinhSceneService,
    private profileDataService: ProfileDataService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private toastr: ToastrService,
    private genaiService: GenaiService,
    private _fuseConfirmationService: FuseConfirmationService
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

      // 5. Subscribe profile changes
      this.profileDataService.profile$.pipe(takeUntil(this._destroy$)).subscribe(p => {
        if (p) {
          this.profile = p;
          this.roomProps = this.mergeProps((p as any).props);
          (p as any).props = this.roomProps;
          this.sceneService.applyProfile(p);
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

        const def = defaultMap.get(saved.id) || {};
        const mergedProp = { ...def, ...saved };
        resultProps.push(mergedProp);
        seenIds.add(saved.id);
      }
    }

    let missingAdded = false;
    for (const defProp of DEFAULT_PROPS) {
      if (!seenIds.has(defProp.id)) {
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

  onPropClick(prop: any): void {
    if (!prop) return;
    const propId = prop.id || '';
    if (propId) {
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
          this.sceneService.applyProfile(this.profile);
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
    if (cloned.castShadow === undefined) cloned.castShadow = false;
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
      this.sceneService.applyProfile(this.profile);

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
    if (!text && this.attachedImages.length === 0 && this.attachedProps.length === 0) return;

    const imagesToProcess = [...this.attachedImages];
    const propsToProcess = [...this.attachedProps];
    this.promptText = '';
    this.attachedImages = [];
    this.attachedProps = [];
    this.cdr.markForCheck();

    let fullPromptText = text;
    if (propsToProcess.length > 0) {
      const propDetails = propsToProcess.map(p => `[Item: "${p.name}", ID: "${p.id}"]`).join(', ');
      fullPromptText = `${text} (Đồ vật chỉ định: ${propDetails})`;
    }

    await this.processAiPrompt(fullPromptText, imagesToProcess, propsToProcess);
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
  async processAiPrompt(prompt: string, images: Array<{ dataUrl: string; base64: string; mimeType: string }> = [], targetProps: any[] = []): Promise<void> {
    const text = prompt.trim();
    if (!text && images.length === 0) return;

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

        const domainSystemPrompt = `Bạn là **Sơn Tinh AI 3D Scene Director**, Chuyên gia AI Agent am hiểu toàn bộ LOGIC NGHIỆP VỤ & CÁCH ĐIỀU CHỈNH 3D CĂN PHÒNG / NHÂN VẬT.

### 📁 DỮ LIỆU PROFILE
- Thư mục: Documents/ai.type/data/profiles/${this.username}/

### 🏠 KIẾN THỨC NGHIỆP VỤ 306
1. **HỆ THỐNG ĐÈN**: lightsOn = true/false (Bật/tắt đèn phòng).
2. **ĐIỀU KHIỂN NHÂN VẬT**: position, facingAngle, scale (0.4 - 2.5), animationName. Động tác khả dụng: [${animListStr}].
3. **CAMERA**: "default", "desk", "character", "overhead".
4. **ĐỒ VẬT TƯƠNG TÁC**: Bàn, Ghế, Bàn phím, Bể cá, Tủ, Khung ảnh, Cửa.
5. **THAY ĐỔI / CẬP NHẬT THUỘC TÍNH ĐỒ VẬT VIA AI ('modifyProp')**:
   - Bạn xem toàn bộ các key hiện có của đồ vật trong DỮ LIỆU PROFILE (như \`activeScreenState\`, \`screenOptions\` bao gồm \`screenOptions.bgColor\`, \`screenOptions.textColor\`, \`screenOptions.screenText\`, \`color\`, \`position\`, \`rotation\`, \`scale\`, \`visible\`, v.v.).
   - Trả về object \`modifyProp\` chứa \`targetPropId\` (hoặc \`targetPropName\`) và \`patch\` chứa ĐÚNG CÁC KEY & GIÁ TRỊ CẦN SỬA (ví dụ khi người dùng yêu cầu đổi màu nền màn hình, hãy sửa \`activeScreenState: "clock"\` và \`screenOptions: { "bgColor": "#HexColor" }\`).
${targetPropInstruction}

6. **TẠO / THÊM ĐỒ VẬT MỚI & ĐỒ VẬT CON VIA AI**:
   - Thêm đồ vật chính mới ('newProp'): { "name": string, "category": string, "color": string, "position": {x,y,z} }
   - Gắn thêm đồ vật con / nút bấm lên đồ vật hiện có ('attachSubDeviceToProp'):
     { "targetPropName": string, "subDevice": { "name": string, "type": "button" | "light" | "curtain" | "sensor" | "tv" | "custom", "customScript"?: string } }

7. **XOÁ / BỚT ĐỒ VẬT & ĐỒ VẬT CON VIA AI**:
   - Xoá đồ vật chính ('removePropName'): Tên đồ vật cần xoá.
   - Xoá đồ vật con / nút bấm ('removeSubDeviceName'): Tên đồ vật con cần xoá.

---
### 📊 TRẠNG THÁI CĂN PHÒNG & NHÂN VẬT (FULL PROPS SCHEMA & LIVE STATE):
${JSON.stringify({
  username: this.username,
  character: currentProfile.character,
  scene: currentProfile.scene,
  props: this.roomProps.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    visible: p.visible,
    activeScreenState: p.activeScreenState,
    screenOptions: p.screenOptions,
    color: p.color,
    position: p.position,
    rotation: p.rotation,
    scale: p.scale,
    subDevices: p.subDevices || []
  }))
}, null, 2)}

---
### 💬 LỆNH NGƯỜI DÙNG: "${text}"

---
### 📤 YÊU CẦU ĐẦU RA (JSON ONLY):
{
  "lightsOn": boolean | null,
  "animationName": string | null,
  "scale": number | null,
  "facingAngle": number | null,
  "position": { "x": number, "y": number, "z": number } | null,
  "cameraPreset": "default" | "desk" | "character" | "overhead" | null,
  "disableTrigger": string | null,
  "enableTrigger": string | null,
  "modifyProp": {
    "targetPropId": string,
    "patch": object
  } | null,
  "newProp": { "name": string, "category": string, "color": string, "position": { "x": number, "y": number, "z": number }, "subDevices": Array<{ name: string, type: string, enabled: boolean, color?: string }> } | null,
  "attachSubDeviceToProp": { "targetPropName": string, "subDevice": { "name": string, "type": string, "customScript"?: string } } | null,
  "removePropName": string | null,
  "removeSubDeviceName": string | null,
  "explanation": string
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
          model: 'gemini-2.5-flash',
          contents: parts
        });

        if (aiRes && aiRes.text) {
          let cleanJson = aiRes.text.trim();
          if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
          if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();

          const hasTargetProps = targetProps && targetProps.length > 0;
          const parsed = JSON.parse(cleanJson);
          if (parsed) {
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

                this.syncPropTo3DScene(liveProp);

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
                category: propObj.category || 'button',
                color: propObj.color || '#06b6d4',
                position: propObj.position || { x: 0, y: 1.2, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 0.4, y: 0.4, z: 0.4 },
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
            if (parsed.explanation) {
              message = parsed.explanation;
            }
          }
        }
      } catch (aiErr: any) {
        console.warn('[Profile] AI Agent Service call error:', aiErr?.message || aiErr);
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
    this.sceneService.applyProfile(currentProfile);
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

        await new Promise(r => setTimeout(r, 200));

        let charGlbObjectUrl: string | null = null;
        if (this.profile?.character?.glbPath) {
          charGlbObjectUrl = await this.profileDataService.readGlbAsObjectUrl(this.profile.character.glbPath).toPromise() ?? null;
        }
        await this.sceneService.initScene(this.canvasRef.nativeElement, this.profile, charGlbObjectUrl);
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
