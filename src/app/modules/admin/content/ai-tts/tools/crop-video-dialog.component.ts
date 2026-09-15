import {
    Component,
    Inject,
    ViewChild,
    ElementRef,
    OnInit,
    AfterViewInit,
    OnDestroy,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    MatDialogModule,
    MatDialogRef,
    MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';

interface electron {
    invoke: (channel: string, data?: any) => Promise<any>;
}
declare const electron: electron;

export interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

@Component({
    selector: 'app-crop-video-dialog',
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './crop-video-dialog.component.html',
})
export class CropVideoDialogComponent
    implements OnInit, AfterViewInit, OnDestroy
{
    @ViewChild('videoElement') videoRef!: ElementRef<HTMLVideoElement>;
    @ViewChild('cropCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('containerRef') containerRef!: ElementRef<HTMLDivElement>;

    isVideoLoaded: boolean = false;
    isProcessing: boolean = false;
    isPlaying: boolean = false;

    naturalWidth: number = 1920;
    naturalHeight: number = 1080;
    duration: number = 0;
    currentTime: number = 0;

    canvasDisplayWidth: number = 640;
    canvasDisplayHeight: number = 360;

    cropRect: CropRect = { x: 0, y: 0, w: 1920, h: 1080 };
    activeRatio: '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | 'free' = '16:9';
    targetRatioNumber: number | null = 16 / 9;
    videoSrc: SafeUrl | string = '';

    // Chế độ Crop
    cropMode: 'crop_pad' | 'crop_resize' = 'crop_pad'; // 'crop_pad': Giữ nguyên tỉ lệ & toạ độ video (Cắt biên); 'crop_resize': Thu nhỏ khung hình theo vùng chọn
    marginTop: number = 0;
    marginBottom: number = 0;
    marginLeft: number = 0;
    marginRight: number = 0;

    private ctx!: CanvasRenderingContext2D;
    private animFrameId: number | null = null;

    // Kéo thả Crop Box
    private dragTarget:
        | 'box'
        | 'tl'
        | 'tr'
        | 'bl'
        | 'br'
        | 't'
        | 'b'
        | 'l'
        | 'r'
        | null = null;
    private startMousePos = { x: 0, y: 0 };
    private startCropRect: CropRect = { x: 0, y: 0, w: 0, h: 0 };
    private readonly HANDLE_SIZE = 14;

    constructor(
        public dialogRef: MatDialogRef<CropVideoDialogComponent>,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            video: any;
            scene?: any;
            sceneIdx?: number;
            vIdx?: number;
        },
        private sanitizer: DomSanitizer,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        this.dialogRef.updateSize('85vw', '85vh');

        // Chuẩn bị URL video
        const rawVideoUrl = this.data?.video?.videoUrl;
        if (rawVideoUrl) {
            this.videoSrc = this.getSafeUrl(rawVideoUrl);
        }

        // Fallback kích thước từ dữ liệu ban đầu
        if (this.data?.video) {
            if (this.data.video.width && this.data.video.height) {
                this.naturalWidth = this.data.video.width;
                this.naturalHeight = this.data.video.height;
            }
            if (this.data.video.duration) {
                this.duration = this.data.video.duration;
            }
        }
    }

    ngAfterViewInit(): void {
        if (this.canvasRef?.nativeElement) {
            const ctx = this.canvasRef.nativeElement.getContext('2d');
            if (ctx) this.ctx = ctx;
        }

        // Tự động kiểm tra và tải frame nếu video đã có sẵn
        const checkAndInit = () => {
            if (this.videoRef?.nativeElement) {
                const v = this.videoRef.nativeElement;
                if (!v.src && this.videoSrc) {
                    const raw = this.getRawMediaUrl(this.data?.video?.videoUrl);
                    if (raw) v.src = raw;
                }
                if (v.readyState >= 1 || v.videoWidth > 0 || v.duration > 0) {
                    this.onVideoMetadataLoaded();
                } else {
                    try {
                        v.load();
                    } catch (e) {}
                }
            }
        };

        checkAndInit();
        setTimeout(checkAndInit, 100);
        setTimeout(checkAndInit, 300);
        setTimeout(checkAndInit, 700);

        // Fallback an toàn: nếu sau 1.5s chưa load xong metadata từ thẻ video nhưng có sẵn dữ liệu thì bật giao diện
        setTimeout(() => {
            if (!this.isVideoLoaded) {
                this.isVideoLoaded = true;
                this.calculateCanvasDisplaySize();
                this.draw();
                this.cd.detectChanges();
            }
        }, 1500);

        // Tự động điều chỉnh kích thước hiển thị Canvas theo container
        window.addEventListener('resize', this.onResize);
    }

    ngOnDestroy(): void {
        window.removeEventListener('resize', this.onResize);
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
        }
        if (this.videoRef?.nativeElement) {
            this.videoRef.nativeElement.pause();
            this.videoRef.nativeElement.removeAttribute('src');
            this.videoRef.nativeElement.load();
        }
    }

    getRawMediaUrl(url: string | null): string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        let hash = '';
        const hashIndex = cleanUrl.indexOf('#');
        if (hashIndex !== -1) {
            hash = cleanUrl.substring(hashIndex);
            cleanUrl = cleanUrl.substring(0, hashIndex);
        }

        if (
            cleanUrl.startsWith('http://') ||
            cleanUrl.startsWith('https://') ||
            cleanUrl.startsWith('data:') ||
            cleanUrl.startsWith('blob:') ||
            cleanUrl.startsWith('media://') ||
            cleanUrl.startsWith('mediacors://') ||
            cleanUrl.startsWith('assets/')
        ) {
            cleanUrl = cleanUrl + hash;
        } else if (cleanUrl.startsWith('src/assets/')) {
            cleanUrl = cleanUrl.substring(4) + hash;
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            let originalPath = cleanUrl.split('?')[0];
            originalPath = originalPath.replace(/^file:\/{2,3}/i, '');

            if (
                !/^[a-zA-Z]:/.test(originalPath) &&
                !originalPath.startsWith('/')
            ) {
                originalPath = '/' + originalPath;
            }

            cleanUrl = `media://${originalPath.replace(/\\/g, '/')}${hash}`;
        }
        return cleanUrl;
    }

    getSafeUrl(url: string | null): SafeUrl | string {
        if (!url) return '';
        const raw = this.getRawMediaUrl(url);
        if (!raw) return '';
        return this.sanitizer.bypassSecurityTrustUrl(raw);
    }

    onVideoMetadataLoaded(): void {
        const v = this.videoRef?.nativeElement;
        if (!v) return;
        if (v.videoWidth && v.videoHeight) {
            this.naturalWidth = v.videoWidth;
            this.naturalHeight = v.videoHeight;
        } else if (this.data?.video?.width && this.data?.video?.height) {
            this.naturalWidth = this.data.video.width;
            this.naturalHeight = this.data.video.height;
        }
        this.duration = v.duration || this.data?.video?.duration || 0;
        this.isVideoLoaded = true;

        if (this.canvasRef?.nativeElement) {
            this.canvasRef.nativeElement.width = this.naturalWidth;
            this.canvasRef.nativeElement.height = this.naturalHeight;
        }

        this.calculateCanvasDisplaySize();

        // Đặt vùng crop mặc định (9:16 hoặc 16:9 tùy theo tỷ lệ video gốc)
        if (this.naturalWidth >= this.naturalHeight) {
            this.setCropRatio(16, 9);
        } else {
            this.setCropRatio(9, 16);
        }

        // Bắt đầu vẽ frame đầu tiên
        this.draw();
        try {
            if (v.currentTime === 0 && this.duration > 0.05) {
                v.currentTime = 0.01;
            }
        } catch (e) {}
        this.cd.detectChanges();
    }

    onVideoCanPlay(): void {
        this.onVideoMetadataLoaded();
    }

    onVideoError(event: any): void {
        console.error('Lỗi tải video trong Crop Video Dialog:', event);
        this.isVideoLoaded = true;
        this.cd.detectChanges();
        this.toastr.error(
            'Không thể tải hoặc giải mã video. Vui lòng kiểm tra định dạng hoặc đường dẫn file!',
        );
    }

    onVideoTimeUpdate(): void {
        if (this.videoRef?.nativeElement) {
            this.currentTime = this.videoRef.nativeElement.currentTime;
            this.draw();
        }
    }

    private onResize = () => {
        this.calculateCanvasDisplaySize();
        this.draw();
    };

    private calculateCanvasDisplaySize(): void {
        if (!this.containerRef?.nativeElement) return;
        const containerW = Math.max(
            200,
            this.containerRef.nativeElement.clientWidth - 48,
        );
        const containerH = Math.max(
            200,
            this.containerRef.nativeElement.clientHeight - 80,
        );

        const videoRatio =
            this.naturalWidth && this.naturalHeight
                ? this.naturalWidth / this.naturalHeight
                : 16 / 9;
        const containerRatio = containerW / containerH;

        if (videoRatio > containerRatio) {
            this.canvasDisplayWidth = Math.round(containerW);
            this.canvasDisplayHeight = Math.round(containerW / videoRatio);
        } else {
            this.canvasDisplayHeight = Math.round(containerH);
            this.canvasDisplayWidth = Math.round(containerH * videoRatio);
        }
        this.cd.detectChanges();
    }

    // ===== ĐIỀU KHIỂN PLAYBACK =====
    togglePlay(): void {
        const v = this.videoRef?.nativeElement;
        if (!v) return;

        if (!v.src) {
            const raw = this.getRawMediaUrl(this.data?.video?.videoUrl);
            if (raw) v.src = raw;
        }

        if (v.paused || v.ended) {
            if (
                v.ended ||
                (this.duration > 0 && v.currentTime >= this.duration - 0.05)
            ) {
                v.currentTime = 0;
            }
            v.muted = true; // Đảm bảo mute để tránh browser policy chặn play
            const playPromise = v.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        this.isPlaying = true;
                        this.startRenderLoop();
                        this.cd.detectChanges();
                    })
                    .catch((e) => {
                        console.warn('Lỗi play video:', e);
                        this.isPlaying = false;
                        this.cd.detectChanges();
                    });
            } else {
                this.isPlaying = true;
                this.startRenderLoop();
                this.cd.detectChanges();
            }
        } else {
            v.pause();
            this.isPlaying = false;
            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
            this.cd.detectChanges();
        }
    }

    onVideoEnded(): void {
        this.isPlaying = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        this.cd.detectChanges();
    }

    seekVideo(time: number): void {
        const v = this.videoRef?.nativeElement;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(this.duration || 0, Number(time)));
        this.currentTime = v.currentTime;
        this.draw();
        this.cd.detectChanges();
    }

    private startRenderLoop(): void {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        const loop = () => {
            if (this.isPlaying && this.videoRef?.nativeElement) {
                this.currentTime = this.videoRef.nativeElement.currentTime;
                this.draw();
                this.animFrameId = requestAnimationFrame(loop);
            }
        };
        this.animFrameId = requestAnimationFrame(loop);
    }

    // ===== VẼ CANVAS & CROP OVERLAY =====
    draw(): void {
        if (!this.ctx || !this.videoRef?.nativeElement) return;
        const v = this.videoRef.nativeElement;
        const w = this.naturalWidth;
        const h = this.naturalHeight;

        // 1. Vẽ frame video gốc
        this.ctx.clearRect(0, 0, w, h);
        try {
            this.ctx.drawImage(v, 0, 0, w, h);
        } catch (e) {}

        // 2. Vẽ màn tối xung quanh vùng Crop (Dimming)
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        this.ctx.fillRect(0, 0, w, h);

        // 3. Xóa màn tối ở vùng Crop để làm sáng vùng chọn
        this.ctx.clearRect(
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
        );

        // 4. Vẽ lại frame video bên trong vùng Crop
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
        );
        this.ctx.clip();
        try {
            this.ctx.drawImage(v, 0, 0, w, h);
        } catch (e) {}
        this.ctx.restore();

        // 5. Vẽ lưới 1/3 (Rule of Thirds)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        // Cột dọc
        this.ctx.moveTo(this.cropRect.x + this.cropRect.w / 3, this.cropRect.y);
        this.ctx.lineTo(
            this.cropRect.x + this.cropRect.w / 3,
            this.cropRect.y + this.cropRect.h,
        );
        this.ctx.moveTo(
            this.cropRect.x + (2 * this.cropRect.w) / 3,
            this.cropRect.y,
        );
        this.ctx.lineTo(
            this.cropRect.x + (2 * this.cropRect.w) / 3,
            this.cropRect.y + this.cropRect.h,
        );
        // Hàng ngang
        this.ctx.moveTo(this.cropRect.x, this.cropRect.y + this.cropRect.h / 3);
        this.ctx.lineTo(
            this.cropRect.x + this.cropRect.w,
            this.cropRect.y + this.cropRect.h / 3,
        );
        this.ctx.moveTo(
            this.cropRect.x,
            this.cropRect.y + (2 * this.cropRect.h) / 3,
        );
        this.ctx.lineTo(
            this.cropRect.x + this.cropRect.w,
            this.cropRect.y + (2 * this.cropRect.h) / 3,
        );
        this.ctx.stroke();

        // 6. Vẽ khung viền chính màu xanh dương sáng
        this.ctx.strokeStyle = '#6366f1';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
        );

        // 7. Vẽ các tay nắm kéo góc & cạnh (Handles)
        const hs = this.getCropHandles(this.cropRect);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#6366f1';
        this.ctx.lineWidth = 2;

        const hSize =
            this.HANDLE_SIZE * (this.naturalWidth / this.canvasDisplayWidth);
        for (const k in hs) {
            const hPt = hs[k];
            this.ctx.fillRect(
                hPt.x - hSize / 2,
                hPt.y - hSize / 2,
                hSize,
                hSize,
            );
            this.ctx.strokeRect(
                hPt.x - hSize / 2,
                hPt.y - hSize / 2,
                hSize,
                hSize,
            );
        }
    }

    private getCropHandles(r: CropRect): {
        [key: string]: { x: number; y: number };
    } {
        return {
            tl: { x: r.x, y: r.y },
            tr: { x: r.x + r.w, y: r.y },
            bl: { x: r.x, y: r.y + r.h },
            br: { x: r.x + r.w, y: r.y + r.h },
            t: { x: r.x + r.w / 2, y: r.y },
            b: { x: r.x + r.w / 2, y: r.y + r.h },
            l: { x: r.x, y: r.y + r.h / 2 },
            r: { x: r.x + r.w, y: r.y + r.h / 2 },
        };
    }

    // ===== TƯƠNG TÁC CHUỘT KÉO THẢ CROP BOX =====
    private getCanvasMousePos(event: MouseEvent): { x: number; y: number } {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const scaleX = this.naturalWidth / rect.width;
        const scaleY = this.naturalHeight / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    }

    onMouseDown(event: MouseEvent): void {
        if (!this.isVideoLoaded || this.isProcessing) return;
        const pos = this.getCanvasMousePos(event);
        const handles = this.getCropHandles(this.cropRect);
        const hitRadius =
            (this.HANDLE_SIZE * 1.5 * this.naturalWidth) /
            this.canvasDisplayWidth;

        // Kiểm tra xem chuột có click vào các Handle kéo không
        for (const k in handles) {
            const hPt = handles[k];
            if (
                Math.abs(pos.x - hPt.x) <= hitRadius &&
                Math.abs(pos.y - hPt.y) <= hitRadius
            ) {
                this.dragTarget = k as any;
                this.startMousePos = pos;
                this.startCropRect = { ...this.cropRect };
                return;
            }
        }

        // Kiểm tra click bên trong thân Crop Box (di chuyển vị trí)
        if (
            pos.x >= this.cropRect.x &&
            pos.x <= this.cropRect.x + this.cropRect.w &&
            pos.y >= this.cropRect.y &&
            pos.y <= this.cropRect.y + this.cropRect.h
        ) {
            this.dragTarget = 'box';
            this.startMousePos = pos;
            this.startCropRect = { ...this.cropRect };
        }
    }

    onMouseMove(event: MouseEvent): void {
        if (!this.isVideoLoaded || this.isProcessing) return;
        const pos = this.getCanvasMousePos(event);

        if (!this.dragTarget) {
            // Thay đổi icon con trỏ chuột
            const handles = this.getCropHandles(this.cropRect);
            const hitRadius =
                (this.HANDLE_SIZE * 1.5 * this.naturalWidth) /
                this.canvasDisplayWidth;
            let cursor = 'default';

            for (const k in handles) {
                const hPt = handles[k];
                if (
                    Math.abs(pos.x - hPt.x) <= hitRadius &&
                    Math.abs(pos.y - hPt.y) <= hitRadius
                ) {
                    if (k === 'tl' || k === 'br') cursor = 'nwse-resize';
                    else if (k === 'tr' || k === 'bl') cursor = 'nesw-resize';
                    else if (k === 't' || k === 'b') cursor = 'ns-resize';
                    else if (k === 'l' || k === 'r') cursor = 'ew-resize';
                    break;
                }
            }

            if (
                cursor === 'default' &&
                pos.x >= this.cropRect.x &&
                pos.x <= this.cropRect.x + this.cropRect.w &&
                pos.y >= this.cropRect.y &&
                pos.y <= this.cropRect.y + this.cropRect.h
            ) {
                cursor = 'move';
            }

            this.canvasRef.nativeElement.style.cursor = cursor;
            return;
        }

        const dx = pos.x - this.startMousePos.x;
        const dy = pos.y - this.startMousePos.y;

        if (this.dragTarget === 'box') {
            // Di chuyển hộp crop
            let newX = this.startCropRect.x + dx;
            let newY = this.startCropRect.y + dy;
            newX = Math.max(
                0,
                Math.min(this.naturalWidth - this.cropRect.w, newX),
            );
            newY = Math.max(
                0,
                Math.min(this.naturalHeight - this.cropRect.h, newY),
            );
            this.cropRect.x = Math.round(newX);
            this.cropRect.y = Math.round(newY);
        } else {
            // Thay đổi kích thước
            let newW = this.startCropRect.w;
            let newH = this.startCropRect.h;
            let newX = this.startCropRect.x;
            let newY = this.startCropRect.y;

            if (this.dragTarget === 'br') {
                newW = Math.max(80, this.startCropRect.w + dx);
                newH = this.targetRatioNumber
                    ? newW / this.targetRatioNumber
                    : Math.max(80, this.startCropRect.h + dy);
            } else if (this.dragTarget === 'tl') {
                newW = Math.max(80, this.startCropRect.w - dx);
                newH = this.targetRatioNumber
                    ? newW / this.targetRatioNumber
                    : Math.max(80, this.startCropRect.h - dy);
                newX = this.startCropRect.x + (this.startCropRect.w - newW);
                newY = this.startCropRect.y + (this.startCropRect.h - newH);
            } else if (this.dragTarget === 'tr') {
                newW = Math.max(80, this.startCropRect.w + dx);
                newH = this.targetRatioNumber
                    ? newW / this.targetRatioNumber
                    : Math.max(80, this.startCropRect.h - dy);
                newY = this.startCropRect.y + (this.startCropRect.h - newH);
            } else if (this.dragTarget === 'bl') {
                newW = Math.max(80, this.startCropRect.w - dx);
                newH = this.targetRatioNumber
                    ? newW / this.targetRatioNumber
                    : Math.max(80, this.startCropRect.h + dy);
                newX = this.startCropRect.x + (this.startCropRect.w - newW);
            } else if (this.dragTarget === 'r') {
                newW = Math.max(80, this.startCropRect.w + dx);
                if (this.targetRatioNumber)
                    newH = newW / this.targetRatioNumber;
            } else if (this.dragTarget === 'b') {
                newH = Math.max(80, this.startCropRect.h + dy);
                if (this.targetRatioNumber)
                    newW = newH * this.targetRatioNumber;
            } else if (this.dragTarget === 'l') {
                newW = Math.max(80, this.startCropRect.w - dx);
                if (this.targetRatioNumber)
                    newH = newW / this.targetRatioNumber;
                newX = this.startCropRect.x + (this.startCropRect.w - newW);
            } else if (this.dragTarget === 't') {
                newH = Math.max(80, this.startCropRect.h - dy);
                if (this.targetRatioNumber)
                    newW = newH * this.targetRatioNumber;
                newY = this.startCropRect.y + (this.startCropRect.h - newH);
            }

            // Đảm bảo không vượt quá biên video
            if (newX < 0) {
                newW += newX;
                newX = 0;
            }
            if (newY < 0) {
                newH += newY;
                newY = 0;
            }
            if (newX + newW > this.naturalWidth)
                newW = this.naturalWidth - newX;
            if (newY + newH > this.naturalHeight)
                newH = this.naturalHeight - newY;

            this.cropRect.x = Math.round(newX);
            this.cropRect.y = Math.round(newY);
            this.cropRect.w = Math.round(newW);
            this.cropRect.h = Math.round(newH);
        }

        this.syncMarginsFromCropRect();
        this.draw();
        this.cd.detectChanges();
    }

    onMouseUp(): void {
        this.dragTarget = null;
        this.syncMarginsFromCropRect();
    }

    // ===== THIẾT LẬP TỶ LỆ CROP =====
    setCropRatio(wRatio: number, hRatio: number): void {
        this.targetRatioNumber = wRatio / hRatio;
        const rKey = `${wRatio}:${hRatio}`;
        if (rKey === '16:9') this.activeRatio = '16:9';
        else if (rKey === '9:16') this.activeRatio = '9:16';
        else if (rKey === '1:1') this.activeRatio = '1:1';
        else if (rKey === '4:5') this.activeRatio = '4:5';
        else if (rKey === '4:3') this.activeRatio = '4:3';
        else this.activeRatio = 'free';

        const vidW = this.naturalWidth;
        const vidH = this.naturalHeight;

        let cropW = vidW;
        let cropH = cropW / this.targetRatioNumber;

        if (cropH > vidH) {
            cropH = vidH;
            cropW = cropH * this.targetRatioNumber;
        }

        this.cropRect.w = Math.round(cropW);
        this.cropRect.h = Math.round(cropH);
        this.centerCropRect();
    }

    setFreeRatio(): void {
        this.activeRatio = 'free';
        this.targetRatioNumber = null;
    }

    centerCropRect(): void {
        this.cropRect.x = Math.max(
            0,
            Math.round((this.naturalWidth - this.cropRect.w) / 2),
        );
        this.cropRect.y = Math.max(
            0,
            Math.round((this.naturalHeight - this.cropRect.h) / 2),
        );
        this.syncMarginsFromCropRect();
        this.draw();
        this.cd.detectChanges();
    }

    onManualCropSizeChange(): void {
        if (this.cropRect.w <= 0) this.cropRect.w = 100;
        if (this.cropRect.h <= 0) this.cropRect.h = 100;
        if (this.cropRect.x + this.cropRect.w > this.naturalWidth) {
            this.cropRect.x = Math.max(0, this.naturalWidth - this.cropRect.w);
        }
        if (this.cropRect.y + this.cropRect.h > this.naturalHeight) {
            this.cropRect.y = Math.max(0, this.naturalHeight - this.cropRect.h);
        }
        this.syncMarginsFromCropRect();
        this.draw();
    }

    getAspectRatioLabel(w: number, h: number): string {
        if (!w || !h) return '16:9';
        const r = w / h;
        if (Math.abs(r - 16 / 9) < 0.05) return '16:9 (Ngang)';
        if (Math.abs(r - 9 / 16) < 0.05) return '9:16 (Dọc)';
        if (Math.abs(r - 1) < 0.05) return '1:1 (Vuông)';
        if (Math.abs(r - 4 / 5) < 0.05) return '4:5';
        if (Math.abs(r - 4 / 3) < 0.05) return '4:3';
        return `${w}:${h}`;
    }

    formatTime(sec: number): string {
        const s = Math.max(0, sec || 0);
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    syncMarginsFromCropRect(): void {
        this.marginLeft = Math.max(0, this.cropRect.x);
        this.marginTop = Math.max(0, this.cropRect.y);
        this.marginRight = Math.max(
            0,
            this.naturalWidth - (this.cropRect.x + this.cropRect.w),
        );
        this.marginBottom = Math.max(
            0,
            this.naturalHeight - (this.cropRect.y + this.cropRect.h),
        );
    }

    onMarginChange(): void {
        this.marginLeft = Math.max(
            0,
            Math.min(this.naturalWidth - 40, Number(this.marginLeft) || 0),
        );
        this.marginRight = Math.max(
            0,
            Math.min(
                this.naturalWidth - this.marginLeft - 40,
                Number(this.marginRight) || 0,
            ),
        );
        this.marginTop = Math.max(
            0,
            Math.min(this.naturalHeight - 40, Number(this.marginTop) || 0),
        );
        this.marginBottom = Math.max(
            0,
            Math.min(
                this.naturalHeight - this.marginTop - 40,
                Number(this.marginBottom) || 0,
            ),
        );

        this.cropRect.x = Math.round(this.marginLeft);
        this.cropRect.y = Math.round(this.marginTop);
        this.cropRect.w = Math.round(
            this.naturalWidth - this.marginLeft - this.marginRight,
        );
        this.cropRect.h = Math.round(
            this.naturalHeight - this.marginTop - this.marginBottom,
        );

        this.draw();
        this.cd.detectChanges();
    }

    setCropMode(mode: 'crop_pad' | 'crop_resize'): void {
        this.cropMode = mode;
        if (mode === 'crop_pad') {
            this.setFreeRatio();
        }
        this.cd.detectChanges();
    }

    // ===== ÁP DỤNG CROP BẰNG FFMPEG =====
    async applyCrop(): Promise<void> {
        const video = this.data?.video;
        if (!video?.videoUrl) {
            this.toastr.error('Không tìm thấy đường dẫn video nguồn để crop!');
            return;
        }

        if (this.cropRect.w <= 0 || this.cropRect.h <= 0) {
            this.toastr.warning('Vui lòng chọn vùng crop hợp lệ!');
            return;
        }

        this.isProcessing = true;
        this.cd.detectChanges();

        try {
            const res = await electron.invoke('crop-video-ffmpeg', {
                videoPath: video.videoUrl,
                cropX: this.cropRect.x,
                cropY: this.cropRect.y,
                cropWidth: this.cropRect.w,
                cropHeight: this.cropRect.h,
                originalWidth: this.naturalWidth,
                originalHeight: this.naturalHeight,
                mode: this.cropMode,
            });

            if (res && res.success) {
                this.toastr.success('Cắt video thành công!');
                this.dialogRef.close({
                    videoUrl: res.videoUrl,
                    imageUrl: res.imageUrl,
                    width: res.width,
                    height: res.height,
                    aspectRatio:
                        this.cropMode === 'crop_pad'
                            ? this.data?.video?.aspectRatio ||
                              `${this.naturalWidth}:${this.naturalHeight}`
                            : this.activeRatio === 'free'
                              ? `${res.width}:${res.height}`
                              : this.activeRatio,
                });
            } else {
                throw new Error(res?.error || 'Không thể crop video');
            }
        } catch (err: any) {
            console.error('Lỗi khi crop video:', err);
            this.toastr.error('Lỗi khi crop video: ' + (err.message || err));
        } finally {
            this.isProcessing = false;
            this.cd.detectChanges();
        }
    }

    cancel(): void {
        this.dialogRef.close(null);
    }
}
