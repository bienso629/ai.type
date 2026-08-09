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
  { id: 'prop_main_door', name: 'Cửa chính gỗ ra vào căn phòng', category: 'architecture', visible: true },
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
  providers: [SontinhSceneService, ProfileDataService]
})
export class ProfileComponent implements AfterViewInit, OnDestroy {

  @ViewChild('sceneCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sceneContainer') sceneContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('glbFileInput') glbFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('photoFileInput') photoFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('avatarFileInput') avatarFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('actionFileInput') actionFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('promptFileInput') promptFileInput!: ElementRef<HTMLInputElement>;

  isLoading    = true;
  isUploading  = false;
  isProcessingPrompt = false;
  isFullscreen = false;
  loadError: string | null   = null;
  uploadError: string | null = null;
  profile: UserProfile | null = null;
  roomProps: any[] = DEFAULT_PROPS;
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
    const propsMap = new Map<string, any>();

    for (const defProp of DEFAULT_PROPS) {
      propsMap.set(defProp.id, JSON.parse(JSON.stringify(defProp)));
    }

    if (Array.isArray(savedProps)) {
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

        if (propsMap.has(saved.id)) {
          const existing = propsMap.get(saved.id);
          propsMap.set(saved.id, { ...existing, ...saved });
        } else {
          propsMap.set(saved.id, saved);
        }
      }
    }

    return Array.from(propsMap.values());
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
    if (cloned.castShadow === undefined) cloned.castShadow = true;
    if (cloned.interactive === undefined) cloned.interactive = true;
    if (!cloned.clickAction) cloned.clickAction = 'focus';
    if (!cloned.floorLevel) cloned.floorLevel = 3;
    if (!cloned.description) cloned.description = '';
    this.inspectingProp = cloned;
    this.cdr.markForCheck();
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
      this.sceneService.applyProfile(this.profile);
    }
    this.cdr.markForCheck();
  }

  async savePropInspector(): Promise<void> {
    if (!this.inspectingProp || !this.profile) return;
    this.inspectingProp._modifiedPosition = true;
    const propId = this.inspectingProp.id;
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
      this.toastr.success(`Đã cập nhật thuộc tính cho "${this.inspectingProp.name}"!`, 'Thuộc tính Đồ vật 3D');
      this.inspectingProp = null;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[Profile] Save prop inspector error:', err);
      this.toastr.error('Không thể lưu thuộc tính đồ vật.', 'Lỗi');
    }
  }

  executePropEvent(prop: any): void {
    const triggerName = this.getPropTriggerName(prop.id);
    const executed = this.sceneService.executeEvent(triggerName);
    if (executed) {
      this.toastr.info(`Đã thực thi kịch bản sự kiện "${triggerName}"`, 'Thực thi Hành động 3D');
    } else {
      this.onPropClick(prop);
      this.toastr.info(`Đã định vị góc nhìn camera tới "${prop.name}"`, 'Góc nhìn 3D');
    }
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

  /** Trigger thêm đồ vật mới */
  triggerAddProp(): void {
    console.log('[Profile] Trigger add prop dialog/upload');
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
        this.filteredMentionProps = this.roomProps.filter(p =>
          (p.name && p.name.toLowerCase().includes(this.mentionQuery)) ||
          (p.id && p.id.toLowerCase().includes(this.mentionQuery))
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

  selectMentionProp(prop: any): void {
    if (!prop) return;
    const value = this.promptText || '';
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      this.promptText = value.slice(0, lastAtIndex) + `@${prop.name} `;
    } else {
      this.promptText = (value ? value.trim() + ' ' : '') + `@${prop.name} `;
    }
    if (!this.attachedProps.some(p => p.id === prop.id)) {
      this.attachedProps.push(prop);
    }
    this.showMentionMenu = false;
    this.cdr.markForCheck();
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

    // 🤖 GỌI AI THÔNG QUA GENAI SERVICE (TUÂN THỦ QUY TẮC BẮT BUỘC TRONG thu_tu_su_dung_ai_agent_2026.md)
    // Tầng 1: Sơn Tinh Agent (https://sontinh.type.vn)
    // Tầng 2: Mì Tôm AI (Backend ChatGPT)
    // Tầng 3: Gemini API Key Miễn Phí
    try {
      const animListStr = this.userAnimations.map(a => a.name).join(', ');
      const domainSystemPrompt = `Bạn là **Sơn Tinh AI 3D Scene Director**, Chuyên gia AI Agent am hiểu toàn bộ LOGIC NGHIỆP VỤ & CÁCH ĐIỀU CHỈNH 3D CĂN PHÒNG / NHÂN VẬT trong màn hình Profile (/app/modules/admin/account/profile) thuộc hệ thống AI Type.

### 📁 THƯ MỤC DỮ LIỆU PROFILE CHUẨN ĐA NỀN TẢNG (Windows, Linux, macOS):
- AI Agent luôn tương tác và nạp/ghi trực tiếp vào thư mục dữ liệu profile người dùng:
  \`Documents/ai.type/data/profiles/${this.username}/\`
  + Windows OS: \`C:\\Users\\${this.username}\\Documents\\ai.type\\data\\profiles\\${this.username}\\\`
  + Linux / macOS OS: \`~/Documents/ai.type/data/profiles/${this.username}/\`
- Các tệp tin dữ liệu 3D bao gồm: \`profile.json\`, \`character.json\`, \`room.json\`, \`animations.json\`, \`events.json\`, \`props.json\`.

### 🏠 KIẾN THỨC NGHIỆP VỤ CĂN PHÒNG 306 & ĐIỀU KHIỂN NHÂN VẬT 3D (PROFILE 3D DOMAIN LOGIC MANUAL):

1. **HỆ THỐNG ĐÈN & ÁNH SÁNG PHÒNG (Room Lighting Operations)**:
   - \`lightsOn\` = true: Bật sáng hệ thống đèn trần & đèn bàn trong Căn phòng 306 (chế độ ban ngày / bật đèn làm việc).
   - \`lightsOn\` = false: Tắt đèn phòng 3D (chế độ ban đêm, ánh sáng mờ dịu).
   - Công tắc đèn 3D (\`tryClickLightSwitch\`): Bật/tắt công tắc bên cạnh cửa ra vào.

2. **ĐIỀU KHIỂN VỊ TRÍ & BIẾN ĐỔI NHÂN VẬT (Character Spatial Movement & Transform)**:
   - Di chuyển vị trí bằng bàn phím phím WASD / Phím mũi tên (Arrow keys):
     + W / Up Arrow: Tiến lên phía trước (-Z).
     + S / Down Arrow: Lùi lại (+Z).
     + A / Left Arrow: Xoay nhân vật sang trái.
     + D / Right Arrow: Xoay nhân vật sang phải.
   - \`position\`: Tọa độ 3D trong Căn phòng 306 dạng \`{ x: number, y: number, z: number }\`.
   - \`facingAngle\`: Góc xoay hướng mặt nhân vật từ 0° đến 360° (0° = nhìn thẳng, 90° = quay phải, 180° = quay lưng, 270° = quay trái).
   - \`scale\`: Kích thước phóng to / thu nhỏ nhân vật từ 0.4 đến 2.5 (Mặc định là 1.0).

3. **CỬ ĐỘNG & HÀNH ĐỘNG NHÂN VẬT (Character Animation Operations)**:
   - Động tác mặc định: "Walk" (Đi bộ), "Idle" (Đứng yên), "Dance" (Nhảy/Múa), "Run" (Chạy), "Wave" (Vẫy tay), "Kick" (Cú đá).
   - Động tác custom GLB người dùng đã tải lên: [${animListStr}]
   - Khi nhận lệnh như "múa", "đi bộ", "đứng lại", "chạy", hãy gán \`animationName\` tương ứng.

4. **GÓC NHÌN CAMERA 3D (Camera Presets & Angles)**:
   - \`cameraPreset\`:
     + "default": Góc nhìn toàn cảnh bao quát Căn phòng 306.
     + "desk": Góc nhìn cận cảnh Bàn làm việc & Bàn phím cơ.
     + "character": Góc nhìn cận cảnh khuôn mặt nhân vật.
     + "overhead": Góc nhìn từ trên cao xuống.

5. **ĐỒ VẬT TƯƠNG TÁC TRONG PHÒNG 3D (Interactive 3D Objects)**:
   - Bàn làm việc, Ghế xoay, Bàn phím cơ 3 màu, Bể cá cảnh (\`tryClickAquarium\`), Tủ đồ quần áo (\`tryClickDrawer\`), Khung ảnh treo tường (\`tryClickPicture\`), Cửa sổ phòng (\`tryClickWindow\`), Cửa ra vào (\`tryClickDoor\`).

---
### 📊 TRẠNG THÁI CĂN PHÒNG & NHÂN VẬT HIỆN TẠI (LIVE PROFILE STATE):
${JSON.stringify({
  username: this.username,
  character: currentProfile.character,
  scene: currentProfile.scene
}, null, 2)}

---
### 💬 LỆNH TỰ NHIÊN CỦA NGƯỜI DÙNG: "${text || 'Chỉnh sửa không gian 3D dựa trên ảnh screenshot gửi kèm'}"

---
### 📤 YÊU CẦU ĐẦU RA (JSON ONLY):
Trả về DUY NHẤT một chuỗi JSON hợp lệ (KHÔNG dùng markdown, KHÔNG bọc trong \`\`\`json, KHÔNG có text dư thừa bên ngoài).
Cấu trúc JSON:
{
  "lightsOn": boolean | null,
  "animationName": string | null,
  "scale": number | null,
  "facingAngle": number | null,
  "position": { "x": number, "y": number, "z": number } | null,
  "cameraPreset": "default" | "desk" | "character" | "overhead" | null,
  "disableTrigger": "clickCharacter" | "clickLightSwitch" | "clickDoor" | "clickAquarium" | "clickDrawer" | "clickPicture" | "clickWindow" | null,
  "enableTrigger": string | null,
  "explanation": "Lời giải thích nghiệp vụ ngắn gọn bằng tiếng Việt về thay đổi AI vừa thực hiện"
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

      const aiRes = await this.genaiService.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts }]
      });

      let jsonText = aiRes?.text || '';
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      if (jsonText.startsWith('{') && jsonText.endsWith('}')) {
        const parsed = JSON.parse(jsonText);
        if (parsed) {
          if (typeof parsed.lightsOn === 'boolean') {
            currentProfile.scene.lightsOn = parsed.lightsOn;
            this.sceneService.clickLightSwitch(parsed.lightsOn);
            updated = true;
          }
          if (parsed.animationName) {
            const targetAnim = parsed.animationName;
            const foundUser = this.userAnimations.find(a => a.name.toLowerCase() === targetAnim.toLowerCase() || a.name.toLowerCase().includes(targetAnim.toLowerCase()));
            if (foundUser) {
              this.setAnimation(foundUser.name, foundUser.glbPath, foundUser.isMovement, foundUser.speed);
              currentProfile.character.animationState = foundUser.name;
              updated = true;
            } else {
              this.setAnimation(targetAnim);
              currentProfile.character.animationState = targetAnim;
              updated = true;
            }
          }
          if (typeof parsed.scale === 'number') {
            currentProfile.character.scale = Math.max(0.4, Math.min(2.5, +parsed.scale.toFixed(2)));
            updated = true;
          }
          if (typeof parsed.facingAngle === 'number') {
            currentProfile.character.facingAngle = Math.abs(parsed.facingAngle) % 360;
            updated = true;
          }
          if (parsed.position && typeof parsed.position.x === 'number') {
            currentProfile.character.position = parsed.position;
            updated = true;
          }
          if (parsed.cameraPreset) {
            currentProfile.scene.cameraPreset = parsed.cameraPreset;
            updated = true;
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
          if (parsed.explanation) {
            message = parsed.explanation;
          }
        }
      }
    } catch (aiErr: any) {
      console.warn('[Profile] AI Agent Service call error:', aiErr?.message || aiErr);
    }

    // 1. Điều khiển ánh sáng đèn (Bật/tắt đèn căn phòng - Fallback local rule)
    if (!updated && (lower.includes('tắt đèn') || lower.includes('tắt ánh sáng') || lower.includes('tối đi') || lower.includes('dark'))) {
      currentProfile.scene.lightsOn = false;
      this.sceneService.clickLightSwitch(false);
      updated = true;
      message = '💡 AI đã tắt hệ thống đèn phòng 3D!';
    } else if (!updated && (lower.includes('bật đèn') || lower.includes('mở đèn') || lower.includes('bật sáng') || lower.includes('light'))) {
      currentProfile.scene.lightsOn = true;
      this.sceneService.clickLightSwitch(true);
      updated = true;
      message = '💡 AI đã bật sáng hệ thống đèn phòng 3D!';
    }

    // Tắt / Bỏ sự kiện click tương tác (Fallback local rule)
    if (!updated && (lower.includes('bỏ') || lower.includes('tắt') || lower.includes('xóa') || lower.includes('hủy') || lower.includes('không cho')) && (lower.includes('click') || lower.includes('bấm') || lower.includes('sự kiện'))) {
      let trig = 'clickCharacter';
      if (lower.includes('cửa sổ')) trig = 'clickWindow';
      else if (lower.includes('cửa phòng') || lower.includes('cửa ra vào')) trig = 'clickDoor';
      else if (lower.includes('bể cá')) trig = 'clickAquarium';
      else if (lower.includes('tủ đồ')) trig = 'clickDrawer';
      else if (lower.includes('khung ảnh')) trig = 'clickPicture';
      else if (lower.includes('công tắc')) trig = 'clickLightSwitch';

      if (!Array.isArray((currentProfile as any).disabledEvents)) {
        (currentProfile as any).disabledEvents = [];
      }
      if (!(currentProfile as any).disabledEvents.includes(trig)) {
        (currentProfile as any).disabledEvents.push(trig);
      }
      this.sceneService.setDisabledTriggers((currentProfile as any).disabledEvents);
      updated = true;
      message = `🚫 AI đã tắt sự kiện click vào ${trig}!`;
    }

    // 2. Chuyển đổi cử động / hành động nhân vật (Animation - Fallback local rule)
    if (!updated && (lower.includes('nhảy') || lower.includes('dance') || lower.includes('múa'))) {
      const anim = this.userAnimations.find(a => a.name.toLowerCase().includes('múa') || a.name.toLowerCase().includes('dance') || a.name.toLowerCase().includes('nhảy'));
      if (anim) {
        this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
        currentProfile.character.animationState = anim.name;
        updated = true;
        message = `💃 AI đã đổi hành động nhân vật sang: ${anim.name}!`;
      }
    } else if (!updated && (lower.includes('đi bộ') || lower.includes('walk') || lower.includes('đi'))) {
      const anim = this.userAnimations.find(a => a.name.toLowerCase().includes('đi bộ') || a.name.toLowerCase().includes('walk'));
      if (anim) {
        this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
        currentProfile.character.animationState = anim.name;
        updated = true;
        message = `🏃 AI đã đổi hành động nhân vật sang: ${anim.name}!`;
      }
    } else if (!updated && (lower.includes('đứng') || lower.includes('idle') || lower.includes('dừng lại'))) {
      const anim = this.userAnimations.find(a => a.name.toLowerCase().includes('đứng') || a.name.toLowerCase().includes('idle'));
      if (anim) {
        this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
        currentProfile.character.animationState = anim.name;
        updated = true;
        message = `🧍 AI đã chuyển nhân vật sang trạng thái đứng yên!`;
      }
    } else if (!updated) {
      // Tìm theo tên hành động khớp trong danh sách
      for (const anim of this.userAnimations) {
        if (lower.includes(anim.name.toLowerCase())) {
          this.setAnimation(anim.name, anim.glbPath, anim.isMovement, anim.speed);
          currentProfile.character.animationState = anim.name;
          updated = true;
          message = `🎭 AI đã đổi hành động nhân vật sang: ${anim.name}!`;
          break;
        }
      }
    }

    // 3. Tùy chỉnh kích thước / góc xoay nhân vật (Scale & Rotation - Fallback local rule)
    if (!updated && (lower.includes('phóng to') || lower.includes('lớn hơn') || lower.includes('to hơn') || lower.includes('phóng'))) {
      currentProfile.character.scale = Math.min(2.5, +( (currentProfile.character.scale || 1.0) + 0.3 ).toFixed(2));
      updated = true;
      message = `🔍 AI đã phóng to nhân vật (Scale: ${currentProfile.character.scale})!`;
    } else if (!updated && (lower.includes('thu nhỏ') || lower.includes('nhỏ hơn') || lower.includes('bé lại') || lower.includes('nhỏ'))) {
      currentProfile.character.scale = Math.max(0.4, +( (currentProfile.character.scale || 1.0) - 0.3 ).toFixed(2));
      updated = true;
      message = `🔍 AI đã thu nhỏ nhân vật (Scale: ${currentProfile.character.scale})!`;
    }

    // 🎛️ 4. Xoay / Điều chỉnh Đồ vật được chỉ định bằng thẻ @mention hoặc targetProps
    const activeProps = targetProps && targetProps.length > 0 ? targetProps : this.attachedProps;
    if (activeProps && activeProps.length > 0) {
      for (const targetProp of activeProps) {
        const liveProp = this.roomProps.find(p => p.id === targetProp.id);
        if (liveProp) {
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

  @HostListener('document:fullscreenchange', ['$event'])
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
