/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ViewEncapsulation,
  ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';
import { UserService } from 'app/core/user/user.service';
import { SontinhSceneService } from './sontinh-scene.service';
import { ProfileDataService, UserProfile } from './profile-data.service';

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
  @ViewChild('glbFileInput') glbFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('photoFileInput') photoFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('actionFileInput') actionFileInput!: ElementRef<HTMLInputElement>;

  isLoading    = true;
  isUploading  = false;
  loadError: string | null   = null;
  uploadError: string | null = null;
  profile: UserProfile | null = null;
  username = 'admin';
  promptText = '';
  charThumbnail: string | null = null;
  userAnimations: Array<{ id: string; name: string; glbPath: string; uploadedAt?: string }> = [];

  private _destroy$    = new Subject<void>();
  private _charBlobUrl: string | null = null;

  constructor(
    private sceneService: SontinhSceneService,
    private profileDataService: ProfileDataService,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      // 1. Lấy username
      const user = await this.userService.user$.pipe(take(1)).toPromise();
      this.username = user?.name || 'admin';

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

      // 4. Khởi động 3D scene
      await this.sceneService.initScene(this.canvasRef.nativeElement, this.profile, charGlbObjectUrl);

      // Capture thumbnail sau khi scene render frame đầu
      if (profile?.character?.glbPath) {
        setTimeout(() => {
          const canvas = this.canvasRef?.nativeElement as HTMLCanvasElement;
          if (canvas) {
            try { this.charThumbnail = canvas.toDataURL('image/jpeg', 0.8); } catch (_) {}
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
        if (p) { this.profile = p; this.sceneService.applyProfile(p); this.cdr.markForCheck(); }
      });

      // 6. Load danh sách hành động (animations) từ đĩa
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

      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[Profile] Init error:', err);
      this.loadError = 'Không thể khởi động scene 3D.';
      this.isLoading = false;
      this.cdr.markForCheck();
    }
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
  setAnimation(animName: string, glbPath?: string): void {
    if (!glbPath) {
      const found = this.userAnimations.find(a => a.name === animName);
      if (found) glbPath = found.glbPath;
    }
    console.log('[Profile] Play animation:', animName, glbPath);
    this.sceneService.playAnimation?.(animName, glbPath);
    this.cdr.markForCheck();
  }

  /** Đặt 1 hành động làm mặc định cho nhân vật (lưu vào profile) */
  setDefaultAnimation(event: Event, animName: string, glbPath?: string): void {
    event.stopPropagation();
    if (!glbPath) {
      const found = this.userAnimations.find(a => a.name === animName);
      if (found) glbPath = found.glbPath;
    }
    if (this.profile?.character) {
      this.profile.character.animationState = animName;
    }
    console.log('[Profile] Set default animation:', animName, glbPath);
    this.profileDataService.saveCharacter({ animationState: animName }).subscribe();
    this.sceneService.playAnimation?.(animName, glbPath);
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

  /** Gửi prompt */
  sendPrompt(): void {
    const text = this.promptText?.trim();
    if (!text) return;
    console.log('[Profile] Prompt:', text);
    this.promptText = '';
    this.cdr.markForCheck();
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

  get dataService(): ProfileDataService { return this.profileDataService; }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
    this.sceneService.destroyScene();
    if (this._charBlobUrl) { URL.revokeObjectURL(this._charBlobUrl); }
  }
}
