import { TranslocoModule } from '@ngneat/transloco';
import {
    Component,
    OnInit,
    ViewChild,
    ElementRef,
    Inject,
    CUSTOM_ELEMENTS_SCHEMA,
    ChangeDetectorRef,
    HostListener,
    OnDestroy,
    TemplateRef,
    AfterViewInit,
    Optional
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { GoogleGenAI } from '@google/genai';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialog,
    MatDialogModule,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import WaveSurfer from 'wavesurfer.js';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import {
    DragDropModule,
    CdkDragDrop,
    moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AddSceneComponent } from './add-scene.component';
import { DirectorModeComponent } from './director-mode.component';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { EditScenePromptDialogComponent } from './edit-scene-prompt-dialog.component';
import { GenaiService } from 'app/genai.service';
import { VideoProjectConfigDialogComponent } from './video-project-config-dialog.component';
import { BroadcastPreviewDialogComponent } from './broadcast-preview-dialog.component';

interface electron {
    selectLocalFile: (filePath: string) => Promise<string>;
}

export interface VideoFrameTemplate {
    id: string;
    name: string;
    aspectRatio: '9:16' | '16:9' | '1:1';
    icon: string;
    bgPath: string;
    maskPath?: string;
    thumbPath: string;
    bgDataUrl?: string;
    thumbDataUrl?: string;
    description?: string;
    quad: {
        topLeft: { x: number, y: number };
        topRight: { x: number, y: number };
        bottomRight: { x: number, y: number };
        bottomLeft: { x: number, y: number };
    };
    canvasWidth: number;
    canvasHeight: number;
}

@Component({
    selector: 'app-video-timeline-dialog',
    standalone: true,
    templateUrl: 'video-timeline-dialog.component.html',
    imports: [
        TranslocoModule,
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        DragDropModule,
        ScrollingModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        MatMenuModule,
        MatDividerModule
    ],
    styles: [`
        input[type=range].volume-slider {
            -webkit-appearance: none;
            appearance: none;
            background: #27272a;
            height: 6px;
            border-radius: 9999px;
            border: 0 !important;
            outline: none !important;
            box-shadow: none !important;
            cursor: pointer;
        }
        input[type=range].volume-slider:focus {
            outline: none !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        input[type=range].volume-slider::-webkit-slider-runnable-track {
            -webkit-appearance: none;
            border: 0 !important;
            outline: none !important;
            box-shadow: none !important;
            background: transparent;
            height: 6px;
        }
        input[type=range].volume-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #a855f7;
            border: 0 !important;
            outline: none !important;
            box-shadow: 0 0 6px rgba(168, 85, 247, 0.6);
            cursor: pointer;
            margin-top: -4px;
        }
        input[type=range].volume-slider::-moz-range-track {
            border: 0 !important;
            outline: none !important;
            background: transparent;
            height: 6px;
        }
        input[type=range].volume-slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #a855f7;
            border: 0 !important;
            outline: none !important;
            box-shadow: 0 0 6px rgba(168, 85, 247, 0.6);
            cursor: pointer;
        }
        select {
            padding-right: 28px !important;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") !important;
            background-position: right 6px center !important;
            background-repeat: no-repeat !important;
            background-size: 16px 16px !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
        }
        select option, select optgroup {
            background-color: #171821;
            color: #e5e7eb;
        }
    `],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class VideoTimelineDialogComponent implements OnInit, OnDestroy, AfterViewInit {
    private saveTimeout: any = null;
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';

    // [THÊM BIẾN NÀY] Trạng thái hiển thị Master Prompt
    showMasterPrompt: boolean = true;
    isGeneratingCharacter: boolean = false;

    // --- Frame Templates (Mockup 9:16) ---
    AVAILABLE_FRAMES: VideoFrameTemplate[] = [
        {
            id: 'none',
            name: 'Không dùng khung (Mặc định)',
            aspectRatio: '16:9',
            icon: 'fullscreen',
            bgPath: '',
            maskPath: '',
            thumbPath: '',
            description: 'Phát video toàn màn hình gốc không lồng khung mockup',
            quad: { topLeft: { x: 0, y: 0 }, topRight: { x: 1920, y: 0 }, bottomRight: { x: 1920, y: 1080 }, bottomLeft: { x: 0, y: 1080 } },
            canvasWidth: 1920,
            canvasHeight: 1080
        },
        {
            id: 'tiktok_frame_1',
            name: 'TikTok Video Frame No.1 (9:16)',
            aspectRatio: '9:16',
            icon: 'desktop_windows',
            bgPath: 'src/assets/video_frames/tiktok_frame_bg.jpg',
            maskPath: 'src/assets/video_frames/tiktok_frame_mask.png',
            thumbPath: 'src/assets/video_frames/tiktok_frame_thumb.jpg',
            description: 'Khung bàn làm việc Gaming PC 3D nghiêng TikTok 9:16 chuẩn nghệ thuật',
            quad: {
                topLeft: { x: 380.7, y: 1261.2 },
                topRight: { x: 1964.0, y: 1378.5 },
                bottomRight: { x: 1958.0, y: 2275.0 },
                bottomLeft: { x: 395.7, y: 2376.3 }
            },
            canvasWidth: 2286,
            canvasHeight: 4096
        },
        {
            id: 'tiktok_frame_2',
            name: 'TikTok Video Frame No.2 (9:16)',
            aspectRatio: '9:16',
            icon: 'tv',
            bgPath: 'src/assets/video_frames/tiktok_frame_2_bg.jpg',
            maskPath: 'src/assets/video_frames/tiktok_frame_2_mask.png',
            thumbPath: 'src/assets/video_frames/tiktok_frame_2_thumb.jpg',
            description: 'Khung Mockup No.2 TikTok 9:16 sang trọng, phối cảnh chuẩn nét',
            quad: {
                topLeft: { x: 493.0, y: 421.0 },
                topRight: { x: 1794.0, y: 421.0 },
                bottomRight: { x: 1794.0, y: 2589.0 },
                bottomLeft: { x: 505.4, y: 2597.0 }
            },
            canvasWidth: 2286,
            canvasHeight: 4096
        },
        {
            id: 'youtube_frame_3',
            name: 'YouTube Video Frame No.3 (16:9)',
            aspectRatio: '16:9',
            icon: 'smart_display',
            bgPath: 'src/assets/video_frames/youtube_frame_3_bg.jpg',
            maskPath: 'src/assets/video_frames/youtube_frame_3_mask.png',
            thumbPath: 'src/assets/video_frames/youtube_frame_3_thumb.jpg',
            description: 'Khung TV phòng khách gia đình YouTube 16:9 siêu nét, không gian ấm cúng',
            quad: {
                topLeft: { x: 1128.0, y: 532.0 },
                topRight: { x: 2970.0, y: 532.0 },
                bottomRight: { x: 2970.0, y: 1581.0 },
                bottomLeft: { x: 1135.5, y: 1588.0 }
            },
            canvasWidth: 4096,
            canvasHeight: 2286
        },
        {
            id: 'tiktok_frame_4',
            name: 'TikTok Video Frame No.4 (9:16)',
            aspectRatio: '9:16',
            icon: 'stay_current_portrait',
            bgPath: 'src/assets/video_frames/tiktok_frame_4_bg.jpg',
            maskPath: 'src/assets/video_frames/tiktok_frame_4_mask.png',
            thumbPath: 'src/assets/video_frames/tiktok_frame_4_thumb.jpg',
            description: 'Khung Mockup No.4 TikTok 9:16 phối cảnh 3D nghiêng hiện đại',
            quad: {
                topLeft: { x: 819.0, y: 1012.5 },
                topRight: { x: 1670.5, y: 879.5 },
                bottomRight: { x: 1660.5, y: 2632.5 },
                bottomLeft: { x: 828.0, y: 2546.0 }
            },
            canvasWidth: 2286,
            canvasHeight: 4096
        },
        {
            id: 'tiktok_frame_5',
            name: 'TikTok Video Frame No.5 (9:16)',
            aspectRatio: '9:16',
            icon: 'mobile_friendly',
            bgPath: 'src/assets/video_frames/tiktok_frame_5_bg.jpg',
            maskPath: 'src/assets/video_frames/tiktok_frame_5_mask.png',
            thumbPath: 'src/assets/video_frames/tiktok_frame_5_thumb.jpg',
            description: 'Khung Mockup No.5 TikTok 9:16 góc nghiêng nghệ thuật, phối cảnh độc đáo',
            quad: {
                topLeft: { x: 135.0, y: 901.5 },
                topRight: { x: 2234.5, y: 679.0 },
                bottomRight: { x: 2158.5, y: 2329.5 },
                bottomLeft: { x: 200.5, y: 2059.0 }
            },
            canvasWidth: 2286,
            canvasHeight: 4096
        }
    ];

    selectedFrame: VideoFrameTemplate | null = null;
    isFrameModalOpen: boolean = false;
    isExportingFrameVideo: boolean = false;
    showGrid: boolean = true;
    frameFilterRatio: 'all' | '16:9' | '9:16' = 'all';

    get filteredFrames(): VideoFrameTemplate[] {
        if (this.frameFilterRatio === 'all') {
            return this.AVAILABLE_FRAMES;
        }
        return this.AVAILABLE_FRAMES.filter(frame => frame.id === 'none' || frame.aspectRatio === this.frameFilterRatio);
    }

    getEffectiveAspectRatio(): string {
        if (this.selectedFrame && this.selectedFrame.id !== 'none' && this.selectedFrame.aspectRatio) {
            return this.selectedFrame.aspectRatio;
        }
        return this.projectData?.aspectRatio || '16:9';
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
    }

    async loadFrameAssets() {
        const electron = (window as any).electron;
        for (const frame of this.AVAILABLE_FRAMES) {
            if (frame.id === 'none') continue;
            try {
                if (electron && electron.readFileBase64) {
                    if (frame.thumbPath && !frame.thumbDataUrl) {
                        const thumbRes = await electron.readFileBase64(frame.thumbPath);
                        if (thumbRes && thumbRes.dataUrl) frame.thumbDataUrl = thumbRes.dataUrl;
                    }
                    if (frame.bgPath && !frame.bgDataUrl) {
                        const bgRes = await electron.readFileBase64(frame.bgPath);
                        if (bgRes && bgRes.dataUrl) frame.bgDataUrl = bgRes.dataUrl;
                    }
                }
            } catch (err) {
                console.warn('[loadFrameAssets] Lỗi tải asset cho frame:', frame.id, err);
            }
        }
        this.cd.detectChanges();
    }

    openFrameModal() {
        this.isFrameModalOpen = true;
        this.loadFrameAssets();
        this.cd.detectChanges();
    }

    closeFrameModal() {
        this.isFrameModalOpen = false;
        this.cd.detectChanges();
    }

    async selectFrame(frame: VideoFrameTemplate) {
        if (frame.id === 'none') {
            this.selectedFrame = null;
            this.mockupVideoStyle = {};
            this.toastr.info('Đã tắt khung Frame template.');
        } else {
            this.selectedFrame = frame;
            if (!frame.bgDataUrl) {
                await this.loadFrameAssets();
            }
            this.updateMockupVideoStyle();
            this.toastr.success(`Đã áp dụng khung xem trước: ${frame.name}`);
        }
        this.isFrameModalOpen = false;
        this.cd.detectChanges();
    }

    getHomographyMatrix3D(src: [number, number][], dst: [number, number][]): number[] {
        const A: number[][] = [];
        const B: number[] = [];
        for (let i = 0; i < 4; i++) {
            const [sx, sy] = src[i];
            const [dx, dy] = dst[i];
            A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
            B.push(dx);
            A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
            B.push(dy);
        }
        for (let i = 0; i < 8; i++) {
            let max = i;
            for (let j = i + 1; j < 8; j++) {
                if (Math.abs(A[j][i]) > Math.abs(A[max][i])) max = j;
            }
            [A[i], A[max]] = [A[max], A[i]];
            [B[i], B[max]] = [B[max], B[i]];

            for (let j = i + 1; j < 8; j++) {
                const factor = A[j][i] / A[i][i];
                for (let k = i; k < 8; k++) A[j][k] -= factor * A[i][k];
                B[j] -= factor * B[i];
            }
        }
        const h: number[] = new Array(8);
        for (let i = 7; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < 8; j++) sum += A[i][j] * h[j];
            h[i] = (B[i] - sum) / A[i][i];
        }
        return [
            h[0], h[3], 0, h[6],
            h[1], h[4], 0, h[7],
            0,    0,    1, 0,
            h[2], h[5], 0, 1
        ];
    }

    getMockupScreenStyle(containerEl?: HTMLElement): { [key: string]: string } {
        if (!this.selectedFrame) return {};
        const q = this.selectedFrame.quad;
        if (!q) return {};
        const canvasW = this.selectedFrame.canvasWidth || 2286;
        const canvasH = this.selectedFrame.canvasHeight || 4096;

        const frameW = (containerEl && containerEl.clientWidth > 0) ? containerEl.clientWidth : (this.selectedFrame.aspectRatio === '16:9' ? 640 : 360);
        const frameH = (containerEl && containerEl.clientHeight > 0) ? containerEl.clientHeight : (this.selectedFrame.aspectRatio === '16:9' ? 360 : 645);

        // Tính kích thước tự nhiên thực tế của vùng Mockup Quad
        const topEdge = Math.hypot(q.topRight.x - q.topLeft.x, q.topRight.y - q.topLeft.y);
        const bottomEdge = Math.hypot(q.bottomRight.x - q.bottomLeft.x, q.bottomRight.y - q.bottomLeft.y);
        const leftEdge = Math.hypot(q.bottomLeft.x - q.topLeft.x, q.bottomLeft.y - q.topLeft.y);
        const rightEdge = Math.hypot(q.bottomRight.x - q.topRight.x, q.bottomRight.y - q.topRight.y);

        const screenVirtualW = Math.max(100, Math.round((topEdge + bottomEdge) / 2));
        const screenVirtualH = Math.max(100, Math.round((leftEdge + rightEdge) / 2));

        const src: [number, number][] = [
            [0, 0],
            [screenVirtualW, 0],
            [screenVirtualW, screenVirtualH],
            [0, screenVirtualH]
        ];

        // Mở rộng 4 góc ra 4px theo tỷ lệ canvas để phủ khít viền màn hình (scale 4px)
        const scale4 = 4;
        const dst: [number, number][] = [
            [(q.topLeft.x - scale4) / canvasW * frameW, (q.topLeft.y - scale4) / canvasH * frameH],
            [(q.topRight.x + scale4) / canvasW * frameW, (q.topRight.y - scale4) / canvasH * frameH],
            [(q.bottomRight.x + scale4) / canvasW * frameW, (q.bottomRight.y + scale4) / canvasH * frameH],
            [(q.bottomLeft.x - scale4) / canvasW * frameW, (q.bottomLeft.y + scale4) / canvasH * frameH]
        ];

        const m = this.getHomographyMatrix3D(src, dst);
        const matrixStr = `matrix3d(${m.map(v => Number(v.toFixed(8))).join(', ')})`;

        return {
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: `${screenVirtualW}px`,
            height: `${screenVirtualH}px`,
            transform: matrixStr,
            '-webkit-transform': matrixStr,
            'transform-origin': '0 0',
            '-webkit-transform-origin': '0 0',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'background-color': '#000000',
            overflow: 'hidden'
        };
    }

    updateMockupVideoStyle(containerEl?: HTMLElement) {
        // Handled dynamically by getMockupScreenStyle
    }

    clearSelectedFrame(event?: MouseEvent) {
        if (event) event.stopPropagation();
        this.selectedFrame = null;
        this.mockupVideoStyle = {};
        this.toastr.info('Đã tắt khung Frame template.');
        this.cd.detectChanges();
    }

    getMockupBoundingBox(): { x: number, y: number, width: number, height: number } {
        if (!this.selectedFrame) return { x: 0, y: 0, width: 1920, height: 1080 };
        const q = this.selectedFrame.quad;
        const minX = Math.min(q.topLeft.x, q.bottomLeft.x);
        const minY = Math.min(q.topLeft.y, q.topRight.y);
        const maxX = Math.max(q.topRight.x, q.bottomRight.x);
        const maxY = Math.max(q.bottomLeft.y, q.bottomRight.y);
        return {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY)
        };
    }

    async exportVideoWithFrame() {
        if (!this.selectedFrame || this.selectedFrame.id === 'none') {
            this.toastr.warning('Vui lòng chọn 1 khung Frame trước khi xuất!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.renderVideoWithFrame) {
            this.toastr.error('Môi trường Electron chưa hỗ trợ render video with frame!');
            return;
        }

        let rawVideoUrl = this.previewVideoUrl;
        if (!rawVideoUrl && this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos && scene.videos.length > 0) {
                    const vid = scene.videos.find((v: any) => v.videoUrl);
                    if (vid) {
                        rawVideoUrl = vid.videoUrl;
                        break;
                    }
                }
            }
        }

        if (!rawVideoUrl) {
            this.toastr.error('Chưa tìm thấy video nguồn để ghép vào khung!');
            return;
        }

        let cleanVideoPath = rawVideoUrl;
        if (cleanVideoPath.startsWith('media://')) cleanVideoPath = decodeURIComponent(cleanVideoPath.substring(8));
        else if (cleanVideoPath.startsWith('file://')) cleanVideoPath = decodeURIComponent(cleanVideoPath.substring(7));
        if (cleanVideoPath.match(/^\/[a-zA-Z]:[\\/]/)) cleanVideoPath = cleanVideoPath.substring(1);

        const frameBgPath = this.selectedFrame.bgPath || `src/assets/video_frames/tiktok_frame_bg.jpg`;
        const frameMaskPath = this.selectedFrame.maskPath || `src/assets/video_frames/tiktok_frame_mask.png`;

        const outDir = `/home/yenai/Downloads/AI.TYPING/${this.data?.uuid || 'exports'}`;
        const outputPath = `${outDir}/video_frame_${Date.now()}.mp4`;

        // Thu thập phụ đề trong project để burn trực tiếp lên video xuất ra
        const allSubs: any[] = [];
        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        if (sub.disabled) continue;
                        const matchingExt = scene.extractedAudios ? (scene.extractedAudios.find((a: any) => 
                            (sub.audioId && a.id && sub.audioId === a.id) ||
                            (Math.abs((Number(a.startTime) || 0) - (Number(sub.startTime) || 0)) < 0.25)
                        )) : null;

                        let original = sub.originalText || (sub.translations && sub.translations['original']) || (sub.translations && sub.translations['en']) || matchingExt?.originalText || '';
                        let vietnamese = sub.vietnameseText || (sub.translations && sub.translations['vi']) || matchingExt?.vietnameseText || '';

                        if (!vietnamese && sub.text && this.isLikelyVietnamese(sub.text)) {
                            vietnamese = sub.text;
                        }
                        if (!original && sub.text && !this.isLikelyVietnamese(sub.text)) {
                            original = sub.text;
                        }

                        let primary = '';
                        let secondary = '';
                        if (original && vietnamese && original.trim().toLowerCase() !== vietnamese.trim().toLowerCase()) {
                            primary = original.trim();
                            secondary = vietnamese.trim();
                        } else {
                            primary = (sub.text || original || vietnamese || '').trim();
                        }

                        if (primary || secondary) {
                            allSubs.push({
                                startTime: Number(sub.startTime) || 0,
                                duration: Number(sub.duration) || 3,
                                primaryText: primary,
                                secondaryText: secondary,
                                fontFamily: sub.fontFamily || this.currentSubtitleFont,
                                fontSize: sub.fontSize || this.currentSubtitleFontSize
                            });
                        }
                    }
                }

                if (scene.texts) {
                    for (const txt of scene.texts) {
                        if (txt.disabled) continue;
                        const textStr = (txt.text || '').trim();
                        if (textStr) {
                            allSubs.push({
                                startTime: Number(txt.startTime) || 0,
                                duration: Number(txt.duration) || 3,
                                primaryText: textStr,
                                secondaryText: '',
                                fontFamily: txt.fontFamily || this.currentSubtitleFont,
                                fontSize: txt.fontSize || this.currentSubtitleFontSize
                            });
                        }
                    }
                }
            }
        }

        this.isExportingFrameVideo = true;
        this.cd.detectChanges();
        this.toastr.info(`Đang xuất video lồng khung 9:16${allSubs.length > 0 ? ` cùng ${allSubs.length} đoạn phụ đề` : ''}...`, 'Đang render');

        try {
            const res = await electron.renderVideoWithFrame({
                videoPath: cleanVideoPath,
                frameBgPath: frameBgPath,
                frameMaskPath: frameMaskPath,
                outputPath: outputPath,
                quad: this.selectedFrame.quad,
                canvasWidth: this.selectedFrame.canvasWidth,
                canvasHeight: this.selectedFrame.canvasHeight,
                subtitles: allSubs,
                subtitleBottom: this.currentSubtitleBottom,
                subtitleFontSize: this.currentSubtitleFontSize,
                subtitleFontFamily: this.currentSubtitleFont,
                previewHeight: this.mockupFrameContainer?.nativeElement?.clientHeight || this.mainVideoPlayer?.nativeElement?.clientHeight || 570,
                previewWidth: this.mockupFrameContainer?.nativeElement?.clientWidth || this.mainVideoPlayer?.nativeElement?.clientWidth || 320
            });

            if (res && res.success) {
                this.toastr.success(`Đã xuất video lồng khung thành công: ${outputPath}`, 'Hoàn tất');
                if (electron.selectLocalFile) {
                    electron.selectLocalFile(outputPath);
                }
            } else {
                throw new Error(res?.error || 'Lỗi render FFmpeg');
            }
        } catch (err: any) {
            console.error('[exportVideoWithFrame] Lỗi:', err);
            this.toastr.error(`Lỗi xuất video: ${err?.message || err}`);
        } finally {
            this.isExportingFrameVideo = false;
            this.cd.detectChanges();
        }
    }

    async exportVideoWithSubtitles() {
        // 1. Nếu đang chọn khung Mockup 9:16 -> Xuất video lồng khung 9:16 kèm phụ đề
        if (this.selectedFrame && this.selectedFrame.id !== 'none') {
            return this.exportVideoWithFrame();
        }

        // 2. Nếu là video bình thường -> Xuất video gốc và BẮN THẲNG SUBTITLES lên video
        const electron = (window as any).electron;
        if (!electron || (!electron.renderVideoWithSubtitles && !electron.renderVideoWithFrame)) {
            this.toastr.warning('Chức năng xuất video phụ đề chỉ hỗ trợ trên ứng dụng Electron Desktop!');
            return;
        }

        // Tìm đường dẫn file video gốc
        let cleanVideoPath = '';
        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos && scene.videos.length > 0) {
                    const firstVid = scene.videos.find((v: any) => v.videoUrl || v.sourceUrl);
                    if (firstVid) {
                        cleanVideoPath = firstVid.videoUrl || '';
                        break;
                    }
                }
            }
        }
        if (!cleanVideoPath && this.previewVideoUrl) {
            cleanVideoPath = this.previewVideoUrl;
        }

        if (!cleanVideoPath) {
            this.toastr.error('Không tìm thấy file video nguồn để xuất!');
            return;
        }

        if (cleanVideoPath.startsWith('http://localhost') || cleanVideoPath.startsWith('http://127.0.0.1')) {
            const parsed = new URL(cleanVideoPath);
            const rawFile = parsed.searchParams.get('file') || parsed.searchParams.get('path');
            if (rawFile) cleanVideoPath = rawFile;
        }

        const outDir = `/home/yenai/Downloads/AI.TYPING/${this.data?.uuid || 'exports'}`;
        const safeTitle = (this.projectData?.title || 'video').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_').substring(0, 50);
        const outputPath = `${outDir}/${safeTitle}_hardsub_${Date.now()}.mp4`;

        // Thu thập toàn bộ phụ đề từ project
        const allSubs: any[] = [];
        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        if (sub.disabled) continue;

                        let original = sub.originalText || (sub.translations && (sub.translations['original'] || sub.translations['en'])) || '';
                        let vietnamese = sub.vietnameseText || (sub.translations && sub.translations['vi']) || '';

                        if (!original && sub.text && !this.isLikelyVietnamese(sub.text)) original = sub.text;
                        if (!vietnamese && sub.text && this.isLikelyVietnamese(sub.text)) vietnamese = sub.text;

                        let primary = '';
                        let secondary = '';
                        if (original && vietnamese && original.trim().toLowerCase() !== vietnamese.trim().toLowerCase()) {
                            primary = original.trim();
                            secondary = vietnamese.trim();
                        } else {
                            primary = (sub.text || original || vietnamese || '').trim();
                        }

                        if (primary || secondary) {
                            allSubs.push({
                                startTime: Number(sub.startTime) || 0,
                                duration: Number(sub.duration) || 3,
                                primaryText: primary,
                                secondaryText: secondary,
                                fontFamily: sub.fontFamily || this.currentSubtitleFont,
                                fontSize: sub.fontSize || this.currentSubtitleFontSize
                            });
                        }
                    }
                }

                if (scene.texts) {
                    for (const txt of scene.texts) {
                        if (txt.disabled) continue;
                        const textStr = (txt.text || '').trim();
                        if (textStr) {
                            allSubs.push({
                                startTime: Number(txt.startTime) || 0,
                                duration: Number(txt.duration) || 3,
                                primaryText: textStr,
                                secondaryText: '',
                                fontFamily: txt.fontFamily || this.currentSubtitleFont,
                                fontSize: txt.fontSize || this.currentSubtitleFontSize
                            });
                        }
                    }
                }
            }
        }

        this.isExportingFrameVideo = true;
        this.cd.detectChanges();
        this.toastr.info(`Đang xuất video và bắn thẳng ${allSubs.length} đoạn phụ đề (Font: ${this.currentSubtitleFont}, Size: ${this.currentSubtitleFontSize}px, Bottom: ${this.currentSubtitleBottom}px)...`, 'Đang xử lý');

        try {
            const res = await electron.renderVideoWithSubtitles({
                videoPath: cleanVideoPath,
                outputPath: outputPath,
                subtitles: allSubs,
                subtitleBottom: this.currentSubtitleBottom,
                subtitleFontSize: this.currentSubtitleFontSize,
                subtitleFontFamily: this.currentSubtitleFont,
                previewHeight: this.mainVideoPlayer?.nativeElement?.clientHeight || 450,
                previewWidth: this.mainVideoPlayer?.nativeElement?.clientWidth || 800
            });

            if (res && res.success) {
                this.toastr.success(`Đã xuất video thành công: ${outputPath}`, 'Hoàn tất');
                if (electron.selectLocalFile) {
                    electron.selectLocalFile(outputPath);
                }
            } else {
                throw new Error(res?.error || 'Lỗi render FFmpeg');
            }
        } catch (err: any) {
            console.error('[exportVideoWithSubtitles] Lỗi:', err);
            this.toastr.error(`Lỗi xuất video: ${err?.message || err}`);
        } finally {
            this.isExportingFrameVideo = false;
            this.cd.detectChanges();
        }
    }

    // Loading / Blind status
    isExtractingAudio: boolean = false;
    isProcessing: boolean = false;
    isProcessingVideo: boolean = false;
    processingStatusTitle: string = '';
    processingStatusMessage: string = '';

    // Lưu lại Scene hiện tại đang được xử lý (khi bấm Prompt)
    activeDownloadScene: any = null;

    isEditingMasterPrompt: boolean = false;

    allClips: any[] = []; // Chứa danh sách tất cả các câu thoại có trong project

    // --- Timeline & Drag Logic ---
    pixelsPerSecond: number = 20;
    draggingVideo: any = null;
    dragType: 'move' | 'left' | 'right' | null = null;
    dragStartX: number = 0;
    dragStartLeft: number = 0;
    dragStartWidth: number = 0;

    // --- Timeline Zoom & Scale ---
    zoomInTimeline(event?: MouseEvent) {
        if (event) {
            event.stopPropagation();
        }
        if (this.pixelsPerSecond < 100) {
            this.pixelsPerSecond = Math.min(100, this.pixelsPerSecond + 5);
            this.onZoomChanged();
        }
    }

    zoomOutTimeline(event?: MouseEvent) {
        if (event) {
            event.stopPropagation();
        }
        if (this.pixelsPerSecond > 5) {
            this.pixelsPerSecond = Math.max(5, this.pixelsPerSecond - 5);
            this.onZoomChanged();
        }
    }

    resetZoom(event?: MouseEvent) {
        if (event) {
            event.stopPropagation();
        }
        this.pixelsPerSecond = 20;
        this.onZoomChanged();
    }

    private zoomDebounceTimer: any = null;
    onZoomChanged() {
        this.updateRulerTicks();
        if (this.zoomDebounceTimer) {
            clearTimeout(this.zoomDebounceTimer);
        }
        this.zoomDebounceTimer = setTimeout(() => {
            if (this.hasAnyExtractedAudio) {
                this.initWaveSurfers();
            }
        }, 150);
    }

    rulerTicks: number[] = Array.from({ length: 50 }, (_, i) => i);
    trackIndices: number[] = [0];
    timelineTotalWidth: number = 5000;
    currentSubtitleInfo: { primaryText: string, secondaryText?: string, fontFamily?: string, fontSize?: number, bottom?: number } | null = null;
    filteredMediaItems: any[] = [];
    mockupVideoStyle: { [key: string]: string } = {};

    updateRulerTicks() {
        const count = Math.max(50, Math.ceil(this.timelineTotalWidth / (10 * this.pixelsPerSecond)) + 5);
        if (this.rulerTicks.length !== count) {
            this.rulerTicks = Array.from({ length: count }, (_, i) => i);
        }
        if (this.trackIndices.length !== this.trackCount) {
            this.trackIndices = Array.from({ length: this.trackCount }, (_, i) => i);
        }
    }

    trackByIndex(index: number, item: any): number {
        return index;
    }

    updateTimelineTotalWidth() {
        let maxTime = 120;
        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.images) {
                    for (const img of scene.images) {
                        const end = (img.startTime || 0) + (img.duration || 5);
                        if (end > maxTime) maxTime = end;
                    }
                }
                if (scene.videos) {
                    for (const v of scene.videos) {
                        const end = (v.startTime || 0) + (v.duration || 5);
                        if (end > maxTime) maxTime = end;
                    }
                }
                if (scene.subtitles) {
                    for (const s of scene.subtitles) {
                        const end = (s.startTime || 0) + (s.duration || 2);
                        if (end > maxTime) maxTime = end;
                    }
                }
                if (scene.texts) {
                    for (const t of scene.texts) {
                        const end = (t.startTime || 0) + (t.duration || 3);
                        if (end > maxTime) maxTime = end;
                    }
                }
                if (scene.extractedAudios) {
                    for (const a of scene.extractedAudios) {
                        const end = (a.startTime || 0) + (a.duration || 5);
                        if (end > maxTime) maxTime = end;
                    }
                }
            }
        }
        this.timelineTotalWidth = Math.max(5000, Math.ceil((maxTime + 30) * this.pixelsPerSecond + 300));
        this.updateRulerTicks();
    }

    get rulerTickCount(): number {
        return this.rulerTicks.length;
    }

    // --- Preview Area ---
    previewVideoUrl: string | null = null;
    previewImageUrl: string | null = null;
    previewOverlayImageUrl: string | null = null;
    previewAudioUrl: string | null = null;

    // --- Timeline Player ---
    isPlayingTimeline: boolean = false;
    isPreviewPlaying: boolean = false;

    get hasAnyExtractedAudio(): boolean {
        if (!this.projectData || !this.projectData.scenes) return false;
        return this.projectData.scenes.some((scene: any) => 
            scene.extractedAudios && scene.extractedAudios.length > 0
        );
    }

    get hasAnySubtitle(): boolean {
        if (!this.projectData || !this.projectData.scenes) return false;
        return this.projectData.scenes.some((scene: any) => 
            scene.subtitles && scene.subtitles.some((sub: any) => sub.audioUrl)
        );
    }

    get hasAnyTextTrack(): boolean {
        if (!this.projectData || !this.projectData.scenes) return false;
        return this.projectData.scenes.some((scene: any) => 
            scene.subtitles && scene.subtitles.length > 0
        );
    }

    updateActiveSubtitleInfo() {
        if (!this.projectData || !this.projectData.scenes) {
            this.currentSubtitleInfo = null;
            return;
        }
        for (const scene of this.projectData.scenes) {
            if (scene.subtitles) {
                for (const sub of scene.subtitles) {
                    if (sub.disabled) continue;
                    const start = sub.startTime || 0;
                    const end = start + (sub.duration || 3);
                    if (this.currentTimelineTime >= start && this.currentTimelineTime < end) {
                        const matchingExt = scene.extractedAudios ? (scene.extractedAudios.find((a: any) => 
                            (sub.audioId && a.id && sub.audioId === a.id) ||
                            (Math.abs((Number(a.startTime) || 0) - (Number(sub.startTime) || 0)) < 0.25)
                        )) : null;

                        let original = sub.originalText || (sub.translations && (sub.translations['original'] || sub.translations['en'])) || matchingExt?.originalText || '';
                        let vietnamese = sub.vietnameseText || (sub.translations && sub.translations['vi']) || matchingExt?.vietnameseText || '';

                        if (this.currentSubtitleLang === 'vi' && sub.text && this.isLikelyVietnamese(sub.text)) {
                            vietnamese = sub.text;
                        } else if ((this.currentSubtitleLang === 'original' || this.currentSubtitleLang === 'en') && sub.text && !this.isLikelyVietnamese(sub.text)) {
                            original = sub.text;
                        }

                        if (!vietnamese && sub.text && this.isLikelyVietnamese(sub.text)) {
                            vietnamese = sub.text;
                        }
                        if (!original && sub.text && !this.isLikelyVietnamese(sub.text)) {
                            original = sub.text;
                        }

                        // Nếu có cả câu gốc và câu tiếng Việt khác nhau -> hiển thị song ngữ 2 dòng
                        if (original && vietnamese && original.trim().toLowerCase() !== vietnamese.trim().toLowerCase()) {
                            this.currentSubtitleInfo = {
                                primaryText: original.trim(),
                                secondaryText: vietnamese.trim(),
                                fontFamily: sub.fontFamily || this.currentSubtitleFont,
                                fontSize: sub.fontSize || this.currentSubtitleFontSize,
                                bottom: sub.bottom !== undefined ? sub.bottom : this.currentSubtitleBottom
                            };
                            return;
                        }

                        const mainText = sub.text || original || vietnamese || '';
                        this.currentSubtitleInfo = mainText ? { 
                            primaryText: mainText,
                            fontFamily: sub.fontFamily || this.currentSubtitleFont,
                            fontSize: sub.fontSize || this.currentSubtitleFontSize,
                            bottom: sub.bottom !== undefined ? sub.bottom : this.currentSubtitleBottom
                        } : null;
                        return;
                    }
                }
            }

            if (scene.texts) {
                for (const txt of scene.texts) {
                    if (txt.disabled) continue;
                    const start = txt.startTime || 0;
                    const end = start + (txt.duration || 3);
                    if (this.currentTimelineTime >= start && this.currentTimelineTime < end) {
                        const mainText = txt.text || '';
                        if (mainText) {
                            this.currentSubtitleInfo = {
                                primaryText: mainText,
                                fontFamily: txt.fontFamily || this.currentSubtitleFont,
                                fontSize: txt.fontSize || this.currentSubtitleFontSize,
                                bottom: txt.bottom !== undefined ? txt.bottom : this.currentSubtitleBottom
                            };
                            return;
                        }
                    }
                }
            }
        }
        this.currentSubtitleInfo = null;
    }

    onSubtitleTextChange(sub: any) {
        if (!sub) return;
        if (this.currentSubtitleLang === 'vi') {
            sub.vietnameseText = sub.text;
            if (!sub.translations) sub.translations = {};
            sub.translations['vi'] = sub.text;
        } else if (this.currentSubtitleLang === 'original') {
            sub.originalText = sub.text;
            if (!sub.translations) sub.translations = {};
            sub.translations['original'] = sub.text;
        } else if (this.currentSubtitleLang) {
            if (!sub.translations) sub.translations = {};
            sub.translations[this.currentSubtitleLang] = sub.text;
        }

        if (this.isLikelyVietnamese(sub.text)) {
            sub.vietnameseText = sub.text;
        } else if (sub.text) {
            sub.originalText = sub.text;
        }

        this.updateActiveSubtitleInfo();
        this.updateFilteredMediaItems();
        this.markDirty();
        this.cd.detectChanges();
    }

    get currentSubtitleText(): string | null {
        const info = this.currentSubtitleInfo;
        if (!info) return null;
        return info.secondaryText ? `${info.primaryText}\n${info.secondaryText}` : info.primaryText;
    }

    currentTimelineTime: number = 0;
    timelineTimer: any = null;
    activeVideo: any = null;
    activeAudio: any = null;

    // Khai báo ViewChild để truy cập video tag trong template
    @ViewChild('mockupFrameContainer') mockupFrameContainer?: ElementRef<HTMLDivElement>;
    @ViewChild('mainVideoPlayer') mainVideoPlayer?: ElementRef<HTMLVideoElement>;
    @ViewChild('mainAudioPlayer') mainAudioPlayer?: ElementRef<HTMLAudioElement>;
    @ViewChild('playheadNeedle') playheadNeedle?: ElementRef<HTMLDivElement>;
    @ViewChild('imageContextMenuTrigger', { read: MatMenuTrigger }) imageContextMenuTrigger?: MatMenuTrigger;
    @ViewChild('videoContextMenuTrigger', { read: MatMenuTrigger }) videoContextMenuTrigger?: MatMenuTrigger;
    @ViewChild('audioContextMenuTrigger', { read: MatMenuTrigger }) audioContextMenuTrigger?: MatMenuTrigger;
    @ViewChild('textContextMenuTrigger', { read: MatMenuTrigger }) textContextMenuTrigger?: MatMenuTrigger;
    @ViewChild('customTextContextMenuTrigger', { read: MatMenuTrigger }) customTextContextMenuTrigger?: MatMenuTrigger;
    
    contextMenuPosition = { x: 0, y: 0 };
    selectedContextData: any = null;

    // Quản lý chọn nhiều item & kéo chọn vùng (Marquee selection)
    selectedItems = new Set<any>();
    isMarqueeSelecting = false;
    marqueeStartPos = { x: 0, y: 0 };
    marqueeBox = { left: 0, top: 0, width: 0, height: 0, visible: false };

    isItemSelected(item: any): boolean {
        return item ? this.selectedItems.has(item) : false;
    }

    onTracksAreaMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        // Bỏ qua nếu bấm vào: sticky header, button, resize scrubber/trim, video move drag
        if (target.closest('.sticky') || target.closest('button') || target.closest('.cursor-ew-resize') || target.closest('.cursor-move')) {
            return;
        }

        e.preventDefault();

        const container = document.getElementById('timeline-content-inner');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        this.isMarqueeSelecting = true;
        this.marqueeStartPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.marqueeBox = {
            left: this.marqueeStartPos.x,
            top: this.marqueeStartPos.y,
            width: 0,
            height: 0,
            visible: false
        };

        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            if (!target.closest('.timeline-block')) {
                this.selectedItems.clear();
                this.activeItem = null;
            }
        }
    }

    @HostListener('document:mousemove', ['$event'])
    onDocumentMouseMove(e: MouseEvent) {
        if (!this.isMarqueeSelecting) return;
        e.preventDefault();

        const container = document.getElementById('timeline-content-inner');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        const left = Math.min(this.marqueeStartPos.x, curX);
        const top = Math.min(this.marqueeStartPos.y, curY);
        const width = Math.abs(curX - this.marqueeStartPos.x);
        const height = Math.abs(curY - this.marqueeStartPos.y);

        if (width > 3 || height > 3) {
            this.marqueeBox = {
                left,
                top,
                width,
                height,
                visible: true
            };

            // Tính toán khoảng thời gian (trục X)
            const selStartPx = Math.max(0, left);
            const selEndPx = Math.max(0, left + width);
            const selStartTime = selStartPx / this.pixelsPerSecond;
            const selEndTime = selEndPx / this.pixelsPerSecond;

            // Tính toán khoảng quét theo trục Y (để chọn riêng từng Track: Video, Phụ đề, hoặc Audio)
            const selTop = top;
            const selBottom = top + height;

            const imagesTrackEl = document.getElementById('timeline-track-images');
            const videoTrackEl = document.getElementById('timeline-track-video');
            const subsTrackEl = document.getElementById('timeline-track-subtitles');
            const textsTrackEl = document.getElementById('timeline-track-texts');
            const audioTrackEl = document.getElementById('timeline-track-audio');

            let selectImages = false;
            let selectVideo = false;
            let selectSubs = false;
            let selectTexts = false;
            let selectAudio = false;

            if (imagesTrackEl) {
                const tr = imagesTrackEl.getBoundingClientRect();
                const trackTop = tr.top - rect.top;
                const trackBottom = tr.bottom - rect.top;
                if (selBottom >= trackTop && selTop <= trackBottom) selectImages = true;
            }

            if (videoTrackEl) {
                const tr = videoTrackEl.getBoundingClientRect();
                const trackTop = tr.top - rect.top;
                const trackBottom = tr.bottom - rect.top;
                if (selBottom >= trackTop && selTop <= trackBottom) selectVideo = true;
            } else {
                if (selBottom >= 28 && selTop <= 124) selectVideo = true;
            }

            if (subsTrackEl) {
                const tr = subsTrackEl.getBoundingClientRect();
                const trackTop = tr.top - rect.top;
                const trackBottom = tr.bottom - rect.top;
                if (selBottom >= trackTop && selTop <= trackBottom) selectSubs = true;
            } else {
                if (selBottom >= 124 && selTop <= 180) selectSubs = true;
            }

            if (textsTrackEl) {
                const tr = textsTrackEl.getBoundingClientRect();
                const trackTop = tr.top - rect.top;
                const trackBottom = tr.bottom - rect.top;
                if (selBottom >= trackTop && selTop <= trackBottom) selectTexts = true;
            }

            if (audioTrackEl) {
                const tr = audioTrackEl.getBoundingClientRect();
                const trackTop = tr.top - rect.top;
                const trackBottom = tr.bottom - rect.top;
                if (selBottom >= trackTop && selTop <= trackBottom) selectAudio = true;
            } else {
                if (selBottom >= 180 && selTop <= 280) selectAudio = true;
            }

            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                this.selectedItems.clear();
            }

            if (this.projectData && this.projectData.scenes) {
                for (const scene of this.projectData.scenes) {
                    // Check images (chỉ khi vùng chọn chạm vào dòng Hình ảnh)
                    if (selectImages && scene.images) {
                        for (const img of scene.images) {
                            const iStart = img.startTime || 0;
                            const iEnd = iStart + (img.duration || 5);
                            if (iEnd > selStartTime && iStart < selEndTime) {
                                this.selectedItems.add(img);
                            }
                        }
                    }
                    // Check videos (chỉ khi vùng chọn chạm vào dòng Video)
                    if (selectVideo && scene.videos) {
                        for (const v of scene.videos) {
                            const vStart = v.startTime || 0;
                            const vEnd = vStart + (v.duration || 5);
                            if (vEnd > selStartTime && vStart < selEndTime) {
                                this.selectedItems.add(v);
                            }
                        }
                    }
                    // Check subtitles (chỉ khi vùng chọn chạm vào dòng Phụ đề)
                    if (selectSubs && scene.subtitles) {
                        for (const sub of scene.subtitles) {
                            const sStart = sub.startTime || 0;
                            const sEnd = sStart + (sub.duration || 3);
                            if (sEnd > selStartTime && sStart < selEndTime) {
                                this.selectedItems.add(sub);
                            }
                        }
                    }
                    // Check texts (chỉ khi vùng chọn chạm vào dòng Text riêng biệt)
                    if (selectTexts && scene.texts) {
                        for (const txt of scene.texts) {
                            const tStart = txt.startTime || 0;
                            const tEnd = tStart + (txt.duration || 3);
                            if (tEnd > selStartTime && tStart < selEndTime) {
                                this.selectedItems.add(txt);
                            }
                        }
                    }
                    // Check extractedAudios (chỉ khi vùng chọn chạm vào dòng Âm thanh gốc)
                    if (selectAudio && scene.extractedAudios) {
                        for (const ext of scene.extractedAudios) {
                            const eStart = ext.startTime || 0;
                            const eEnd = eStart + (ext.duration || 5);
                            if (eEnd > selStartTime && eStart < selEndTime) {
                                this.selectedItems.add(ext);
                            }
                        }
                    }
                }
            }
        }
    }

    @HostListener('document:mouseup', ['$event'])
    onDocumentMouseUp(e: MouseEvent) {
        if (!this.isMarqueeSelecting) return;
        this.isMarqueeSelecting = false;
        this.marqueeBox.visible = false;
        if (this.selectedItems.size > 0 && !this.activeItem) {
            this.activeItem = Array.from(this.selectedItems)[0];
        }
        this.cd.detectChanges();
    }

    selectAllItems() {
        this.selectedItems.clear();
        if (!this.projectData || !this.projectData.scenes) return;

        let totalCount = 0;
        for (const scene of this.projectData.scenes) {
            if (scene.images) {
                for (const img of scene.images) {
                    this.selectedItems.add(img);
                    totalCount++;
                }
            }
            if (scene.videos) {
                for (const v of scene.videos) {
                    this.selectedItems.add(v);
                    totalCount++;
                }
            }
            if (scene.subtitles) {
                for (const s of scene.subtitles) {
                    this.selectedItems.add(s);
                    totalCount++;
                }
            }
            if (scene.texts) {
                for (const t of scene.texts) {
                    this.selectedItems.add(t);
                    totalCount++;
                }
            }
            if (scene.extractedAudios) {
                for (const a of scene.extractedAudios) {
                    this.selectedItems.add(a);
                    totalCount++;
                }
            }
        }

        if (totalCount > 0) {
            this.toastr.info(`Đã chọn toàn bộ ${totalCount} đối tượng trên Timeline! Nhấn Delete / Backspace để xoá.`);
            this.cd.detectChanges();
        }
    }

    deleteSelectedItems() {
        let count = 0;
        if (this.selectedItems.size === 0) {
            if (this.activeItem) {
                this.selectedItems.add(this.activeItem);
            } else {
                return;
            }
        }

        if (this.projectData && this.projectData.scenes) {
            for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
                const scene = this.projectData.scenes[sceneIdx];

                if (scene.images) {
                    const beforeLen = scene.images.length;
                    scene.images = scene.images.filter((img: any) => !this.selectedItems.has(img));
                    count += (beforeLen - scene.images.length);
                }

                if (scene.videos) {
                    const beforeLen = scene.videos.length;
                    scene.videos = scene.videos.filter((v: any) => !this.selectedItems.has(v));
                    count += (beforeLen - scene.videos.length);
                }

                if (scene.subtitles) {
                    const beforeLen = scene.subtitles.length;
                    scene.subtitles = scene.subtitles.filter((s: any) => !this.selectedItems.has(s));
                    count += (beforeLen - scene.subtitles.length);
                }

                if (scene.texts) {
                    const beforeLen = scene.texts.length;
                    scene.texts = scene.texts.filter((t: any) => !this.selectedItems.has(t));
                    count += (beforeLen - scene.texts.length);
                }

                if (scene.extractedAudios) {
                    const beforeLen = scene.extractedAudios.length;
                    scene.extractedAudios = scene.extractedAudios.filter((a: any) => !this.selectedItems.has(a));
                    count += (beforeLen - scene.extractedAudios.length);
                }
            }
        }

        this.selectedItems.clear();
        this.activeItem = null;
        this.activeVideo = null;
        this.previewVideoUrl = null;
        this.previewImageUrl = null;
        if (this.isPlayingTimeline) {
            this.pauseTimeline();
        }
        this.currentTimelineTime = 0;

        if (count > 0) {
            this.toastr.success(`Đã xoá ${count} mục khỏi Timeline!`);
            this.normalizeData();
            this.saveData(true);
            this.cd.markForCheck();
            this.cd.detectChanges();
            setTimeout(() => {
                this.cleanupOrphanedWaveSurfers();
                this.updateLines();
                this.initWaveSurfers();
            }, 50);
        }
    }

    onPreviewContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        if (this.activeVideo) {
            // Tìm sceneIdx và vIdx của activeVideo
            let foundScene = null;
            let foundSceneIdx = -1;
            let foundVIdx = -1;
            if (this.projectData?.scenes) {
                for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                    const scene = this.projectData.scenes[sIdx];
                    if (scene.videos) {
                        const vIdx = scene.videos.indexOf(this.activeVideo);
                        if (vIdx !== -1) {
                            foundScene = scene;
                            foundSceneIdx = sIdx;
                            foundVIdx = vIdx;
                            break;
                        }
                    }
                }
            }
            this.onVideoContextMenu(event, this.activeVideo, foundScene, foundSceneIdx, foundVIdx);
        } else if (this.activeItem && this.activeItem.imageUrl) {
            let foundScene = null;
            let foundSceneIdx = -1;
            let foundImgIdx = -1;
            if (this.projectData?.scenes) {
                for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                    const scene = this.projectData.scenes[sIdx];
                    if (scene.images) {
                        const imgIdx = scene.images.indexOf(this.activeItem);
                        if (imgIdx !== -1) {
                            foundScene = scene;
                            foundSceneIdx = sIdx;
                            foundImgIdx = imgIdx;
                            break;
                        }
                    }
                }
            }
            this.onImageContextMenu(event, this.activeItem, foundScene, foundSceneIdx, foundImgIdx);
        } else if (this.projectData?.scenes?.length && this.projectData.scenes[0]?.videos?.length) {
            const firstScene = this.projectData.scenes[0];
            const firstVideo = firstScene.videos[0];
            this.onVideoContextMenu(event, firstVideo, firstScene, 0, 0);
        }
    }

    onVideoContextMenu(event: MouseEvent, video: any, scene: any, sceneIdx: number, vIdx: number) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.selectedItems.has(video)) {
            this.selectedItems.clear();
            this.selectedItems.add(video);
            this.activeItem = video;
        }
        this.selectedContextData = { video, scene, sceneIdx, vIdx, type: 'video' };
        this.contextMenuPosition = { x: event.clientX, y: event.clientY };
        this.cd.detectChanges();
        if (this.videoContextMenuTrigger) {
            this.videoContextMenuTrigger.openMenu();
        }
    }

    onAudioContextMenu(event: MouseEvent, item: any, scene: any, sceneIdx: number, itemIdx: number, type: 'sub' | 'extracted') {
        event.preventDefault();
        event.stopPropagation();
        if (!this.selectedItems.has(item)) {
            this.selectedItems.clear();
            this.selectedItems.add(item);
            this.activeItem = item;
        }
        this.selectedContextData = {
            item,
            scene,
            sceneIdx,
            subIdx: type === 'sub' ? itemIdx : undefined,
            aIdx: type === 'extracted' ? itemIdx : undefined,
            type
        };
        this.contextMenuPosition = { x: event.clientX, y: event.clientY };
        this.cd.detectChanges();
        if (this.audioContextMenuTrigger) {
            this.audioContextMenuTrigger.openMenu();
        }
    }

    onTextContextMenu(event: MouseEvent, item: any, scene: any, sceneIdx: number, subIdx: number) {
        this.onSubtitleContextMenu(event, item, scene, sceneIdx, subIdx);
    }

    onSubtitleContextMenu(event: MouseEvent, item: any, scene: any, sceneIdx: number, subIdx: number) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.selectedItems.has(item)) {
            this.selectedItems.clear();
            this.selectedItems.add(item);
            this.activeItem = item;
        }
        this.selectedContextData = {
            item,
            scene,
            sceneIdx,
            subIdx,
            type: 'text'
        };
        this.contextMenuPosition = { x: event.clientX, y: event.clientY };
        this.cd.detectChanges();
        if (this.textContextMenuTrigger) {
            this.textContextMenuTrigger.openMenu();
        }
    }

    onImageContextMenu(event: MouseEvent, item: any, scene: any, sceneIdx: number, imgIdx: number) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.selectedItems.has(item)) {
            this.selectedItems.clear();
            this.selectedItems.add(item);
            this.activeItem = item;
        }
        this.selectedContextData = {
            item,
            scene,
            sceneIdx,
            imgIdx,
            type: 'image'
        };
        this.contextMenuPosition = { x: event.clientX, y: event.clientY };
        this.cd.detectChanges();
        if (this.imageContextMenuTrigger) {
            this.imageContextMenuTrigger.openMenu();
        }
    }

    onCustomTextContextMenu(event: MouseEvent, item: any, scene: any, sceneIdx: number, textIdx: number) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.selectedItems.has(item)) {
            this.selectedItems.clear();
            this.selectedItems.add(item);
            this.activeItem = item;
        }
        this.selectedContextData = {
            item,
            scene,
            sceneIdx,
            textIdx,
            type: 'customText'
        };
        this.contextMenuPosition = { x: event.clientX, y: event.clientY };
        this.cd.detectChanges();
        if (this.customTextContextMenuTrigger) {
            this.customTextContextMenuTrigger.openMenu();
        }
    }

    openEditTextDialog(sub: any) {
        if (!sub) return;
        const newText = prompt('Chỉnh sửa nội dung phụ đề:', sub.text || '');
        if (newText !== null) {
            sub.text = newText.trim();
            this.saveData();
            this.toastr.success('Đã cập nhật nội dung phụ đề!');
        }
    }

    openEditCustomTextDialog(txt: any) {
        if (!txt) return;
        const newText = prompt('Chỉnh sửa nội dung văn bản (Track Text):', txt.text || '');
        if (newText !== null) {
            txt.text = newText.trim();
            this.saveData();
            this.toastr.success('Đã cập nhật nội dung văn bản!');
        }
    }

    addNewTextTrackItem() {
        this.addNewSubtitleItem();
    }

    addNewSubtitleItem() {
        if (!this.projectData) this.projectData = { scenes: [] };
        if (!this.projectData.scenes || this.projectData.scenes.length === 0) {
            this.projectData.scenes.push({
                id: `scene_${Date.now()}`,
                subtitles: [],
                texts: [],
                videos: [],
                prompt: ''
            });
        }
        const text = prompt('Nhập nội dung phụ đề mới:');
        if (!text || !text.trim()) return;

        const firstScene = this.projectData.scenes[0];
        if (!firstScene.subtitles) firstScene.subtitles = [];

        const startTime = this.currentTimelineTime || 0;
        const newItem = {
            id: Date.now(),
            text: text.trim(),
            startTime: startTime,
            duration: 3,
            type: 'subtitle'
        };
        firstScene.subtitles.push(newItem);

        this.setActiveItem(newItem);
        this.updateTimelineTotalWidth();
        this.updateRulerTicks();
        this.updateActiveSubtitleInfo();
        this.saveData();
        this.cd.detectChanges();
        this.toastr.success('Đã thêm đoạn phụ đề mới!');
    }

    addNewCustomTextItem() {
        if (!this.projectData) this.projectData = { scenes: [] };
        if (!this.projectData.scenes || this.projectData.scenes.length === 0) {
            this.projectData.scenes.push({
                id: `scene_${Date.now()}`,
                subtitles: [],
                texts: [],
                videos: [],
                prompt: ''
            });
        }
        const text = prompt('Nhập nội dung đoạn Text mới:');
        if (!text || !text.trim()) return;

        const firstScene = this.projectData.scenes[0];
        if (!firstScene.texts) firstScene.texts = [];

        const startTime = this.currentTimelineTime || 0;
        const newItem = {
            id: Date.now(),
            text: text.trim(),
            startTime: startTime,
            duration: 3,
            type: 'customText'
        };
        firstScene.texts.push(newItem);

        this.setActiveItem(newItem);
        this.updateTimelineTotalWidth();
        this.updateRulerTicks();
        this.saveData();
        this.cd.detectChanges();
        this.toastr.success('Đã thêm đoạn Text mới vào Track Văn bản!');
    }

    removeCustomText(sceneIdx: number, textIdx: number) {
        const scene = this.projectData?.scenes?.[sceneIdx];
        if (!scene || !scene.texts) return;

        this.alert({
            title: 'Xóa đoạn Text',
            message: 'Bạn có chắc chắn muốn xóa đoạn Text này khỏi Track Text không?',
            confirm: 'Xóa',
            cb: () => {
                scene.texts.splice(textIdx, 1);
                this.selectedItems.clear();
                this.activeItem = null;
                this.saveData();
                this.toastr.warning('Đã xóa đoạn text!');
                this.cd.detectChanges();
            }
        });
    }

    async addNewImageItem() {
        if (!this.projectData) this.projectData = { scenes: [] };
        if (!this.projectData.scenes || this.projectData.scenes.length === 0) {
            this.projectData.scenes.push({
                id: `scene_${Date.now()}`,
                subtitles: [],
                texts: [],
                videos: [],
                images: [],
                prompt: ''
            });
        }

        const electronApi = (window as any).electron;
        if (electronApi && electronApi.getPathForFile && electronApi.selectLocalFile) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) return;

                const originalPath = electronApi.getPathForFile(file);
                if (!originalPath) {
                    this.toastr.error('Không thể xác nhận đường dẫn file.');
                    return;
                }

                this.toastr.info('Đang xử lý hình ảnh, vui lòng đợi...');
                const uuid = this.projectData?.uuid || this.data?.uuid;
                const customDir = uuid ? `tts/admin/${uuid}` : undefined;
                const localFilePath = await electronApi.selectLocalFile(originalPath, customDir);
                const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;

                const firstScene = this.projectData.scenes[0];
                if (!firstScene.images) firstScene.images = [];

                let maxStart = this.currentTimelineTime || 0;
                firstScene.images.forEach((img: any) => {
                    const end = (img.startTime || 0) + (img.duration || 5);
                    if (end > maxStart) maxStart = end;
                });

                const newItem = {
                    id: Date.now(),
                    imageUrl: finalPath,
                    title: file.name || ('Hình ảnh ' + (firstScene.images.length + 1)),
                    startTime: maxStart,
                    duration: 5,
                    type: 'image'
                };
                firstScene.images.push(newItem);

                this.setActiveItem(newItem);
                this.previewImageUrl = finalPath;
                this.previewVideoUrl = null;
                this.updateTimelineTotalWidth();
                this.updateRulerTicks();
                this.saveData(true);
                this.cd.detectChanges();
                this.toastr.success('Đã thêm Hình ảnh mới vào Track Hình ảnh!');
            };
            input.click();
            return;
        }

        const imgUrl = prompt('Nhập đường dẫn hình ảnh (URL hoặc đường dẫn file):');
        if (!imgUrl || !imgUrl.trim()) return;

        const firstScene = this.projectData.scenes[0];
        if (!firstScene.images) firstScene.images = [];

        const startTime = this.currentTimelineTime || 0;
        const newItem = {
            id: Date.now(),
            imageUrl: imgUrl.trim(),
            title: 'Hình ảnh ' + (firstScene.images.length + 1),
            startTime: startTime,
            duration: 5,
            type: 'image'
        };
        firstScene.images.push(newItem);

        this.setActiveItem(newItem);
        this.previewImageUrl = imgUrl.trim();
        this.previewVideoUrl = null;
        this.updateTimelineTotalWidth();
        this.updateRulerTicks();
        this.saveData(true);
        this.cd.detectChanges();
        this.toastr.success('Đã thêm Hình ảnh mới vào Track Hình ảnh!');
    }

    removeImageItem(sceneIdx: number, imgIdx: number) {
        const scene = this.projectData?.scenes?.[sceneIdx];
        if (!scene || !scene.images) return;

        this.alert({
            title: 'Xóa Hình ảnh',
            message: 'Bạn có chắc chắn muốn xóa hình ảnh này khỏi Track Hình ảnh không?',
            confirm: 'Xóa',
            cb: () => {
                scene.images.splice(imgIdx, 1);
                this.selectedItems.clear();
                this.activeItem = null;
                this.saveData();
                this.toastr.warning('Đã xóa hình ảnh!');
                this.cd.detectChanges();
            }
        });
    }

    toggleDisableItem(item: any) {
        if (!item) return;
        item.disabled = !item.disabled;
        this.saveData();
    }

    wavesurfers: { [key: string]: WaveSurfer } = {};

    playPreview(video: any) {
        this.clearPreview();
        this.pauseTimeline(); // Dừng timeline nếu đang phát
        if (video.videoUrl) {
            this.previewVideoUrl = video.videoUrl;
        } else if (video.imageUrl) {
            this.previewImageUrl = video.imageUrl;
        }
    }

    // ===== TIMELINE PLAYER LOGIC =====
    toggleTimelinePlay() {
        if (this.isPlayingTimeline) {
            this.pauseTimeline();
        } else {
            this.playTimeline();
        }
    }

    onReferenceImageSelectedOut(event: any, video: any, sceneIdx: number, tIdx: number) {
        const file = event.target.files[0];
        if (file) {
            video.aiReferenceImageLocalUrl = URL.createObjectURL(file);
            this.autoGenerateStoryboard(video, sceneIdx, tIdx);
        }
        event.target.value = '';
    }

    togglePreviewPlay() {
        this.toggleTimelinePlay();
    }

    onVideoPlayEvent() {
        if (!this.isPlayingTimeline) {
            this.playTimeline();
        }
    }

    onVideoPauseEvent() {
        if (this.isPlayingTimeline) {
            this.pauseTimeline();
        }
    }

    onVideoEnded() {
        if (this.isPlayingTimeline) {
            const maxTime = this.getMaxTimelineTime();
            if (this.currentTimelineTime >= maxTime - 0.3) {
                this.currentTimelineTime = maxTime;
                this.pauseTimeline();
                this.cd.detectChanges();
            } else {
                this.updateTimelineSync();
            }
        }
    }

    getMaxTimelineTime(): number {
        if (!this.projectData || !this.projectData.scenes) return 0;
        let maxTime = 0;
        for (const scene of this.projectData.scenes) {
            if (scene.videos) {
                for (const v of scene.videos) {
                    const end = (v.startTime || 0) + (v.duration || 5);
                    if (end > maxTime) maxTime = end;
                }
            }
            if (scene.subtitles) {
                for (const s of scene.subtitles) {
                    const end = (s.startTime || 0) + (s.duration || 5);
                    if (end > maxTime) maxTime = end;
                }
            }
            if (scene.extractedAudios) {
                for (const a of scene.extractedAudios) {
                    const end = (a.startTime || 0) + (a.duration || 5);
                    if (end > maxTime) maxTime = end;
                }
            }
        }
        return maxTime;
    }

    playTimeline() {
        if (!this.projectData || !this.projectData.scenes) return;

        // Tính toán độ dài tối đa của timeline
        let maxTime = this.getMaxTimelineTime();

        if (maxTime === 0) return;

        // Nếu đã chạy tới cuối (hoặc gần cuối), phát lại từ đầu
        if (this.currentTimelineTime >= maxTime - 0.1) {
            this.currentTimelineTime = 0;
            if (this.playheadNeedle?.nativeElement) {
                this.playheadNeedle.nativeElement.style.transform = `translateX(0px)`;
            }
        }

        this.isPlayingTimeline = true;
        this.isPreviewPlaying = true;

        let lastTimestamp = performance.now();
        let lastCdTimestamp = 0;

        // Đồng bộ video/audio trước khi bắt đầu tick (forceSeek = true để chắc chắn seek về đúng giây)
        this.updateTimelineSync(true);

        const tick = (timestamp: number) => {
            if (!this.isPlayingTimeline) return;

            let deltaSeconds = (timestamp - lastTimestamp) / 1000;
            lastTimestamp = timestamp;

            const vidEl = this.mainVideoPlayer?.nativeElement;

            if (this.activeVideo && this.activeVideo.videoUrl && vidEl) {
                if (vidEl.seeking || vidEl.readyState < 2) {
                    // Video is seeking or buffering, pause the timeline clock
                    deltaSeconds = 0;
                } else if (!vidEl.paused && !vidEl.ended) {
                    // Video is playing smoothly, let video drive the timeline
                    const videoCurrent = (this.activeVideo.startTime || 0) + vidEl.currentTime - (this.activeVideo.trimStart || 0);
                    if (videoCurrent >= 0) {
                        this.currentTimelineTime = videoCurrent;
                        deltaSeconds = 0;
                    }
                }
            }

            this.currentTimelineTime += deltaSeconds;

            if (this.currentTimelineTime >= maxTime) {
                this.currentTimelineTime = maxTime;
                this.pauseTimeline();
                this.cd.detectChanges();
                return;
            }

            // Cập nhật vị trí kim playhead trực tiếp trên DOM
            if (this.playheadNeedle?.nativeElement) {
                this.playheadNeedle.nativeElement.style.transform = `translateX(${this.currentTimelineTime * this.pixelsPerSecond}px)`;
            }

            // Kiểm tra và phát hiện chuyển cảnh / chuyển đổi giữa Video hoặc Hình ảnh
            let sceneChanged = false;
            let currentPlayingVideo = null;
            let currentPlayingImage = null;

            if (this.projectData?.scenes) {
                for (const sc of this.projectData.scenes) {
                    if (sc.videos) {
                        for (const v of sc.videos) {
                            if (v.disabled) continue;
                            const s = v.startTime || 0;
                            const e = s + (v.duration || 5);
                            if (this.currentTimelineTime >= s && this.currentTimelineTime < e) {
                                currentPlayingVideo = v;
                                break;
                            }
                        }
                    }
                    if (sc.images) {
                        for (const img of sc.images) {
                            if (img.disabled) continue;
                            const s = img.startTime || 0;
                            const e = s + (img.duration || 5);
                            if (this.currentTimelineTime >= s && this.currentTimelineTime < e) {
                                currentPlayingImage = img;
                                break;
                            }
                        }
                    }
                    if (currentPlayingVideo && currentPlayingImage) break;
                }
            }

            const activeOverlayUrl = currentPlayingImage ? (currentPlayingImage.imageUrl || currentPlayingImage.controlImageUrl || null) : null;

            if (currentPlayingVideo !== this.activeVideo || this.previewOverlayImageUrl !== activeOverlayUrl) {
                this.updateTimelineSync();
                sceneChanged = true;
            }

            // Đồng bộ âm thanh (WaveSurfers) theo từng mili-giây của timeline
            this.syncAudioWithTimeline();

            // Chạy change detection 10 lần/giây thay vì 60 lần/giây để tiết kiệm 95% CPU
            if (sceneChanged || (timestamp - lastCdTimestamp > 100)) {
                lastCdTimestamp = timestamp;
                this.updateActiveSubtitleInfo();
                this.cd.detectChanges();
            }

            if (this.isPlayingTimeline) {
                this.timelineTimer = requestAnimationFrame(tick);
            }
        };

        this.timelineTimer = requestAnimationFrame(tick);
    }

    pauseTimeline() {
        this.isPlayingTimeline = false;
        this.isPreviewPlaying = false;
        if (this.timelineTimer) {
            cancelAnimationFrame(this.timelineTimer);
            this.timelineTimer = null;
        }

        if (this.mainVideoPlayer && this.mainVideoPlayer.nativeElement) {
            this.mainVideoPlayer.nativeElement.pause();
        }
        if (this.mainAudioPlayer && this.mainAudioPlayer.nativeElement) {
            this.mainAudioPlayer.nativeElement.pause();
        }
        for (const key in this.wavesurfers) {
            if (this.wavesurfers[key].isPlaying()) {
                this.wavesurfers[key].pause();
            }
        }
    }

    syncAudioWithTimeline() {
        if (!this.projectData || !this.projectData.scenes) return;

        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];

            // 1. Đồng bộ Track Subtitles
            if (scene.subtitles) {
                for (let sIdx = 0; sIdx < scene.subtitles.length; sIdx++) {
                    const sub = scene.subtitles[sIdx];
                    const ws = this.wavesurfers[`waveform-sub-${sceneIdx}-${sIdx}`];
                    if (ws) {
                        const start = sub.startTime || 0;
                        const end = start + (sub.duration || 5);
                        const isPlayingNow = !sub.disabled && this.currentTimelineTime >= start && this.currentTimelineTime < end;

                        if (isPlayingNow) {
                            const expectedTime = Math.max(0, this.currentTimelineTime - start);
                            if (this.isPlayingTimeline) {
                                if (!ws.isPlaying()) {
                                    ws.setTime(expectedTime);
                                    ws.play().catch(() => {});
                                } else if (Math.abs(ws.getCurrentTime() - expectedTime) > 0.4) {
                                    ws.setTime(expectedTime);
                                }
                            } else {
                                if (ws.isPlaying()) ws.pause();
                                ws.setTime(expectedTime);
                            }
                        } else {
                            if (ws.isPlaying()) ws.pause();
                        }
                    }
                }
            }

            // 2. Đồng bộ Track Extracted Audios (Âm thanh bóc tách / Audio segments)
            if (scene.extractedAudios) {
                for (let aIdx = 0; aIdx < scene.extractedAudios.length; aIdx++) {
                    const audio = scene.extractedAudios[aIdx];
                    const ws = this.wavesurfers[`waveform-${sceneIdx}-${aIdx}`];
                    if (ws) {
                        const start = audio.startTime || 0;
                        const end = start + (audio.duration || 5);
                        const isMuted = this.isAudioMuted(audio, scene);
                        const isPlayingNow = !isMuted && this.currentTimelineTime >= start && this.currentTimelineTime < end;

                        if (isPlayingNow) {
                            const expectedTime = Math.max(0, this.currentTimelineTime - start);
                            const vol = audio.volume !== undefined ? Math.max(0, audio.volume / 100) : 1;
                            try { ws.setVolume(vol); } catch (e) {}
                            if (this.isPlayingTimeline) {
                                if (!ws.isPlaying()) {
                                    ws.setTime(expectedTime);
                                    ws.play().catch(() => {});
                                } else if (Math.abs(ws.getCurrentTime() - expectedTime) > 0.4) {
                                    ws.setTime(expectedTime);
                                }
                            } else {
                                if (ws.isPlaying()) ws.pause();
                                ws.setTime(expectedTime);
                            }
                        } else {
                            if (ws.isPlaying()) ws.pause();
                        }
                    }
                }
            }
        }
    }

    updateTimelineSync(forceSeek: boolean = false) {
        if (!this.projectData || !this.projectData.scenes) return;

        let foundVideo = null;
        let foundScene = null;
        let foundImage = null;

        for (const scene of this.projectData.scenes) {
            // Find active video
            if (scene.videos) {
                for (const v of scene.videos) {
                    if (v.disabled) continue;
                    const start = v.startTime || 0;
                    const end = start + (v.duration || 5);
                    if (this.currentTimelineTime >= start && this.currentTimelineTime < end) {
                        foundVideo = v;
                        foundScene = scene;
                        break;
                    }
                }
            }
            // Find active overlay image (Track Images)
            if (scene.images) {
                for (const img of scene.images) {
                    if (img.disabled) continue;
                    const start = img.startTime || 0;
                    const end = start + (img.duration || 5);
                    if (this.currentTimelineTime >= start && this.currentTimelineTime < end) {
                        foundImage = img;
                        break;
                    }
                }
            }
            if (foundVideo && foundImage) break;
        }

        // Cập nhật URL ảnh Overlay từ Track Images
        const targetOverlayImageUrl = foundImage ? (foundImage.imageUrl || foundImage.controlImageUrl || null) : null;
        this.previewOverlayImageUrl = targetOverlayImageUrl;

        // Kiểm tra xem clip video này đã có phân đoạn âm thanh rời (extracted audio) chưa
        const isVideoCoveredByExtractedAudio = foundVideo && foundScene && this.hasExtractedAudio(foundScene, foundVideo);
        const shouldMuteVideoEl = foundVideo ? (foundVideo.muted || isVideoCoveredByExtractedAudio) : true;

        // Handle Video
        const targetVideoUrl = foundVideo?.videoUrl || null;
        const targetImageUrl = foundVideo?.imageUrl || null;

        if (this.previewVideoUrl !== targetVideoUrl || this.previewImageUrl !== (targetImageUrl || (targetVideoUrl ? null : targetOverlayImageUrl)) || foundVideo !== this.activeVideo) {
            this.activeVideo = foundVideo;
            this.previewVideoUrl = targetVideoUrl;
            this.previewImageUrl = targetImageUrl || (targetVideoUrl ? null : targetOverlayImageUrl);

            if (foundVideo && targetVideoUrl) {
                // Cần setTimeout để chờ view update tag video/img
                setTimeout(() => {
                    if (this.mainVideoPlayer && this.mainVideoPlayer.nativeElement && this.previewVideoUrl) {
                        const vidEl = this.mainVideoPlayer.nativeElement;
                        if (vidEl.readyState >= 1) {
                            vidEl.currentTime = Math.max(0, this.currentTimelineTime - (foundVideo.startTime || 0) + (foundVideo.trimStart || 0));
                        }
                        vidEl.muted = shouldMuteVideoEl;
                        if (this.isPlayingTimeline) {
                            vidEl.play().catch(e => console.error("Error playing video:", e));
                        } else {
                            vidEl.pause();
                        }
                    }
                }, 0);
            }
        } else if (this.activeVideo && this.activeVideo.videoUrl) {
            if (this.mainVideoPlayer && this.mainVideoPlayer.nativeElement) {
                const vidEl = this.mainVideoPlayer.nativeElement;
                vidEl.muted = shouldMuteVideoEl;

                const expectedTime = Math.max(0, this.currentTimelineTime - (this.activeVideo.startTime || 0) + (this.activeVideo.trimStart || 0));

                if ((forceSeek || vidEl.ended || Math.abs(vidEl.currentTime - expectedTime) > 0.3) && vidEl.readyState >= 1) {
                    if (!vidEl.seeking) {
                        vidEl.currentTime = expectedTime;
                    }
                }

                if (this.isPlayingTimeline && (vidEl.paused || vidEl.ended)) {
                    vidEl.play().catch(e => console.error("Error playing video:", e));
                } else if (!this.isPlayingTimeline && !vidEl.paused) {
                    vidEl.pause();
                }
            }
        }

        // Handle Subtitles & Extracted Audios
        this.syncAudioWithTimeline();
    }

    playWaveform(type: 'sub' | 'extracted', sceneIdx: number, idx: number, item?: any) {
        // Pause all wavesurfers first
        for (const key in this.wavesurfers) {
            if (this.wavesurfers[key].isPlaying()) {
                this.wavesurfers[key].pause();
            }
        }

        // Play the selected one
        const prefix = type === 'sub' ? 'waveform-sub' : 'waveform';
        const ws = this.wavesurfers[`${prefix}-${sceneIdx}-${idx}`];
        if (ws) {
            try {
                ws.setTime(0);
                ws.play();
                return;
            } catch (e) {
                console.warn('WaveSurfer play error, falling back to direct Audio:', e);
            }
        }

        // Direct audio playback fallback
        const audioUrl = item?.audioUrl || (type === 'extracted' ? this.projectData?.scenes?.[sceneIdx]?.extractedAudios?.[idx]?.audioUrl : this.projectData?.scenes?.[sceneIdx]?.subtitles?.[idx]?.audioUrl);
        if (audioUrl) {
            this.playDirectAudio(audioUrl);
        }
    }

    async playDirectAudio(audioUrl: string) {
        if (!audioUrl) return;
        if (this.previewSnippetAudio) {
            try { this.previewSnippetAudio.pause(); } catch (e) {}
            this.previewSnippetAudio = null;
        }
        try {
            const rawUrl = this.getRawMediaUrl(audioUrl) as string;
            this.previewSnippetAudio = new Audio(rawUrl);
            await this.previewSnippetAudio.play();
        } catch (e) {
            console.warn('Direct audio play error with raw URL, trying fallback:', e);
            const playUrl = this.getAudioPlayUrl(audioUrl);
            this.previewSnippetAudio = new Audio(playUrl);
            this.previewSnippetAudio.play().catch(e2 => console.error('Fallback Audio failed:', e2));
        }
    }

    clearPreview() {
        this.previewVideoUrl = null;
        this.previewImageUrl = null;
        this.previewAudioUrl = null;
    }

    // --- Scrubber Drag Logic ---
    isDraggingScrubber: boolean = false;

    wasPlayingBeforeDrag: boolean = false;

    onScrubberMouseDown(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.wasPlayingBeforeDrag = this.isPlayingTimeline;
        this.pauseTimeline();
        this.setActiveItem(null); // Clear active item so timeline takes priority
        this.isDraggingScrubber = true;
        document.addEventListener('mousemove', this.onScrubberMouseMove);
        document.addEventListener('mouseup', this.onScrubberMouseUp);
    }

    onTimelineScroll(event: WheelEvent) {
        if (event.ctrlKey) {
            event.preventDefault();
            if (event.deltaY < 0) {
                this.zoomInTimeline();
            } else if (event.deltaY > 0) {
                this.zoomOutTimeline();
            }
            return;
        }
        if (event.deltaY !== 0) {
            const container = document.getElementById('timeline-scroll-container');
            if (container) {
                container.scrollLeft += event.deltaY;
                event.preventDefault();
            }
        }
    }

    onTimeRulerMouseDown(e: MouseEvent) {
        e.preventDefault();
        this.wasPlayingBeforeDrag = this.isPlayingTimeline;
        this.pauseTimeline(); // Pause while dragging
        this.setActiveItem(null); // Clear active item so timeline takes priority
        this.isDraggingScrubber = true;
        this.seekTimelineToMouse(e);
        document.addEventListener('mousemove', this.onScrubberMouseMove);
        document.addEventListener('mouseup', this.onScrubberMouseUp);
    }

    onScrubberMouseMove = (e: MouseEvent) => {
        if (!this.isDraggingScrubber) return;
        this.seekTimelineToMouse(e);
    }

    onScrubberMouseUp = (e: MouseEvent) => {
        if (!this.isDraggingScrubber) return;
        this.isDraggingScrubber = false;
        document.removeEventListener('mousemove', this.onScrubberMouseMove);
        document.removeEventListener('mouseup', this.onScrubberMouseUp);
        if (this.wasPlayingBeforeDrag) {
            this.playTimeline(); // Resume playing if it was playing before
        }
    }

    seekTimelineToMouse(e: MouseEvent) {
        const contentContainer = document.getElementById('timeline-content-inner');
        if (!contentContainer) return;

        const rect = contentContainer.getBoundingClientRect();
        let x = e.clientX - rect.left;
        if (x < 0) x = 0;

        const newTime = x / this.pixelsPerSecond;
        let maxTime = this.getMaxTimelineTime();
        if (maxTime === 0) maxTime = 100; // Default max if empty

        this.currentTimelineTime = Math.min(newTime, maxTime);
        this.updateTimelineSync();
        this.cd.detectChanges();
    }

    // Tính toán số Track hiển thị
    get trackCount(): number {
        return 1;
    }

    packTimeline(save: boolean = true) {
        if (!this.projectData || !this.projectData.scenes) return;

        let currentTime = 0;
        for (const scene of this.projectData.scenes) {
            const oldSceneStart = scene.videos && scene.videos.length > 0 ? (scene.videos[0].startTime || 0) : currentTime;
            const sceneDelta = currentTime - oldSceneStart;

            if (scene.videos && scene.videos.length > 0) {
                for (let i = 0; i < scene.videos.length; i++) {
                    const v = scene.videos[i];
                    if (v) {
                        v.startTime = (v.startTime !== undefined && v.startTime !== null) ? v.startTime + sceneDelta : currentTime;
                        currentTime = Math.max(currentTime, (v.startTime || 0) + (v.duration || 5));
                    }
                }
            } else {
                currentTime += (scene.forcedDuration || 5);
            }

            if (scene.images) {
                for (const img of scene.images) {
                    if (img.startTime !== undefined && img.startTime !== null) {
                        img.startTime = Math.max(0, img.startTime + sceneDelta);
                    }
                }
            }

            if (scene.subtitles) {
                for (const sub of scene.subtitles) {
                    if (sub.startTime !== undefined && sub.startTime !== null) {
                        sub.startTime = Math.max(0, sub.startTime + sceneDelta);
                    }
                }
            }

            if (scene.texts) {
                for (const txt of scene.texts) {
                    if (txt.startTime !== undefined && txt.startTime !== null) {
                        txt.startTime = Math.max(0, txt.startTime + sceneDelta);
                    }
                }
            }

            if (scene.extractedAudios) {
                for (const ext of scene.extractedAudios) {
                    if (ext.startTime !== undefined && ext.startTime !== null) {
                        ext.startTime = Math.max(0, ext.startTime + sceneDelta);
                    }
                }
            }
        }

        if (save) {
            this.saveData();
            this.cd.detectChanges();
            setTimeout(() => this.updateLines(), 100);
        }
    }

    normalizeData() {
        if (!this.projectData || !this.projectData.scenes) return;

        let currentTime = 0;
        let currentAudioTime = 0;
        for (const scene of this.projectData.scenes) {
            // Dọn dẹp các [Âm thanh gốc] cũ vô tình bị lưu vào subtitles
            if (scene.subtitles) {
                const legacyExtracted = scene.subtitles.filter((sub: any) => sub.text === '[Âm thanh gốc]');
                if (legacyExtracted.length > 0) {
                    if (!scene.extractedAudios) scene.extractedAudios = [];
                    // Di chuyển chúng sang mảng extractedAudios
                    scene.extractedAudios.push(...legacyExtracted);
                    // Loại bỏ khỏi subtitles
                    scene.subtitles = scene.subtitles.filter((sub: any) => sub.text !== '[Âm thanh gốc]');
                }
            }
        }

        // Tự động khử trùng lặp và khử đè/chồng chéo các phụ đề và audio trên dòng thời gian
        for (const scene of this.projectData.scenes) {
            if (scene.subtitles && Array.isArray(scene.subtitles)) {
                // Sắp xếp tăng dần theo mốc thời gian
                const sortedSubs = [...scene.subtitles].sort((a: any, b: any) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));
                const validSubs: any[] = [];
                let lastSubEnd = 0;

                for (const sub of sortedSubs) {
                    let sStart = Math.max(0, Math.round((Number(sub.startTime) || 0) * 100) / 100);
                    let sDur = Math.max(0.2, Math.round((Number(sub.duration) || 2) * 100) / 100);

                    // Nếu start nằm trước lastSubEnd (bị lấn/đè bởi block trước)
                    if (sStart < lastSubEnd) {
                        // Nếu block này bị bao phủ hoàn toàn bởi block trước -> Bỏ qua
                        if (sStart + sDur <= lastSubEnd + 0.1) {
                            continue;
                        }
                        // Điều chỉnh start và duration để tiếp giáp ngay sau block trước
                        sDur = Math.round((sStart + sDur - lastSubEnd) * 100) / 100;
                        sStart = lastSubEnd;
                        if (sDur < 0.2) continue;
                    }

                    sub.startTime = sStart;
                    sub.duration = sDur;
                    lastSubEnd = Math.round((sStart + sDur) * 100) / 100;
                    validSubs.push(sub);
                }
                scene.subtitles = validSubs;
            }

            if (scene.extractedAudios && Array.isArray(scene.extractedAudios)) {
                // Sắp xếp tăng dần theo mốc thời gian
                const sortedAudios = [...scene.extractedAudios].sort((a: any, b: any) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));
                const validAudios: any[] = [];
                let lastAudEnd = 0;

                for (const aud of sortedAudios) {
                    let aStart = Math.max(0, Math.round((Number(aud.startTime) || 0) * 100) / 100);
                    let aDur = Math.max(0.2, Math.round((Number(aud.duration) || 2) * 100) / 100);

                    if (aStart < lastAudEnd) {
                        if (aStart + aDur <= lastAudEnd + 0.1) {
                            continue;
                        }
                        aDur = Math.round((aStart + aDur - lastAudEnd) * 100) / 100;
                        aStart = lastAudEnd;
                        if (aDur < 0.2) continue;
                    }

                    aud.startTime = aStart;
                    aud.duration = aDur;
                    lastAudEnd = Math.round((aStart + aDur) * 100) / 100;
                    validAudios.push(aud);
                }
                scene.extractedAudios = validAudios;
            }
        }

        // Tự động đồng bộ câu thoại gốc (originalText) và tiếng Việt (vietnameseText) giữa audio và subtitles
        this.syncSubtitlesWithExtractedAudios();

        for (const scene of this.projectData.scenes) {
            if (!scene.videos || !Array.isArray(scene.videos)) {
                scene.videos = [];
            }

            // Clean up any null/undefined videos
            scene.videos = scene.videos.filter((v: any) => v);

            for (const video of scene.videos) {
                // Ensure duration is a valid number
                let dur = typeof video.duration === 'number' ? video.duration : parseFloat(String(video.duration).replace('s', ''));
                if (isNaN(dur) || dur <= 0) {
                    dur = 5;
                }
                video.duration = dur;
                if (video.maxDuration === undefined && (video.videoUrl || video.audioUrl)) {
                    video.maxDuration = video.duration;
                }

                // Ensure startTime is a valid number
                if (video.startTime === undefined || isNaN(video.startTime) || video.startTime === null) {
                    video.startTime = currentTime;
                } else {
                    // Try parsing if it's a string somehow
                    let start = parseFloat(String(video.startTime));
                    if (isNaN(start) || start > 100000 || !isFinite(start)) start = currentTime;
                    if (start < 0) start = 0; // Prevent negative start
                    video.startTime = start;
                }

                if (!isFinite(video.duration) || video.duration > 100000) video.duration = 5;

                currentTime = Math.max(currentTime, video.startTime + video.duration);
            }

            // Gán startTime cho các phần tử audio/subtitle/text độc lập với video nếu chưa có
            if (scene.subtitles) {
                const sceneVideoStart = (scene.videos && scene.videos.length > 0 && scene.videos[0].startTime !== undefined) 
                    ? Number(scene.videos[0].startTime) 
                    : currentTime;
                let sceneSubTime = sceneVideoStart;

                for (const sub of scene.subtitles) {
                    let subDur = sub.duration;
                    if (!subDur || isNaN(subDur) || subDur <= 0) {
                        subDur = Math.max(1, (sub.text ? sub.text.trim().split(/\s+/).length / 4 : 2));
                        sub.duration = subDur;
                    }
                    if (sub.maxDuration === undefined && sub.audioUrl) {
                        sub.maxDuration = sub.duration;
                    }
                    
                    if (sub.startTime === undefined || isNaN(sub.startTime) || sub.startTime === null) {
                        sub.startTime = sceneSubTime;
                    } else {
                        let start = parseFloat(String(sub.startTime));
                        if (isNaN(start) || start > 100000 || !isFinite(start)) start = sceneSubTime;
                        if (start < 0) start = 0;
                        sub.startTime = start;
                    }
                    
                    sceneSubTime = sub.startTime + subDur;
                }
            }

            if (scene.images) {
                const sceneVideoStart = (scene.videos && scene.videos.length > 0 && scene.videos[0].startTime !== undefined) 
                    ? Number(scene.videos[0].startTime) 
                    : currentTime;
                let sceneImgTime = sceneVideoStart;

                for (const img of scene.images) {
                    let imgDur = img.duration;
                    if (!imgDur || isNaN(imgDur) || imgDur <= 0) {
                        imgDur = 5;
                        img.duration = imgDur;
                    }
                    if (img.startTime === undefined || isNaN(img.startTime) || img.startTime === null) {
                        img.startTime = sceneImgTime;
                    } else {
                        let start = parseFloat(String(img.startTime));
                        if (isNaN(start) || start > 100000 || !isFinite(start)) start = sceneImgTime;
                        if (start < 0) start = 0;
                        img.startTime = start;
                    }
                    sceneImgTime = img.startTime + imgDur;
                }
            }

            if (scene.texts) {
                const sceneVideoStart = (scene.videos && scene.videos.length > 0 && scene.videos[0].startTime !== undefined) 
                    ? Number(scene.videos[0].startTime) 
                    : currentTime;
                let sceneTxtTime = sceneVideoStart;

                for (const txt of scene.texts) {
                    let txtDur = txt.duration;
                    if (!txtDur || isNaN(txtDur) || txtDur <= 0) {
                        txtDur = Math.max(1, (txt.text ? txt.text.trim().split(/\s+/).length / 4 : 3));
                        txt.duration = txtDur;
                    }
                    if (txt.startTime === undefined || isNaN(txt.startTime) || txt.startTime === null) {
                        txt.startTime = sceneTxtTime;
                    } else {
                        let start = parseFloat(String(txt.startTime));
                        if (isNaN(start) || start > 100000 || !isFinite(start)) start = sceneTxtTime;
                        if (start < 0) start = 0;
                        txt.startTime = start;
                    }
                    sceneTxtTime = txt.startTime + txtDur;
                }
            }
        }
        this.updateTimelineTotalWidth();
        this.updateFilteredMediaItems();
        this.updateActiveSubtitleInfo();
        this.saveData();

        if (this.hasAnyExtractedAudio) {
            setTimeout(() => this.initWaveSurfers(), 300);
        }
    }

    cleanupOrphanedWaveSurfers() {
        for (const key in this.wavesurfers) {
            const container = document.getElementById(key);
            if (!container) {
                try {
                    this.wavesurfers[key].destroy();
                } catch (e) {}
                delete this.wavesurfers[key];
            }
        }
    }

    getAudioPlayUrl(playUrl: string): string {
        if (!playUrl) return '';
        if (playUrl.startsWith('file://')) {
            const mediaDir = this.projectData?.mediaDir || this.data?.mediaDir || '';
            let projectUuid = this.projectData?.uuid || this.data?.uuid;
            if (!projectUuid) {
                const parts = window.location.href.split('/');
                projectUuid = parts[parts.length - 1];
            }
            let originalPath = playUrl.replace(/^file:\/\//i, '').split('?')[0];
            if (!/^[a-zA-Z]:/.test(originalPath) && !originalPath.startsWith('/')) {
                originalPath = '/' + originalPath;
            }
            return `mediacors://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=${encodeURIComponent(projectUuid || 'default')}`;
        } else if (playUrl.startsWith('media://')) {
            return playUrl.replace(/^media:\/+/i, 'mediacors:///');
        } else {
            return playUrl.replace(/^mediacors:\/+/i, 'mediacors:///');
        }
    }

    async getSafeBlobUrl(rawPath: string): Promise<string> {
        if (!rawPath) return '';
        return (this.getRawMediaUrl(rawPath) as string) || rawPath;
    }

    async loadAudioToWaveSurfer(ws: WaveSurfer, audioUrl: string): Promise<boolean> {
        if (!ws || !audioUrl) return false;
        const clean = audioUrl.toLowerCase().split('?')[0].split('#')[0];
        // Tuyệt đối không nạp file video lớn (mp4, mkv, avi, webm, ...) vào WebAudio decode của WaveSurfer
        if (clean.endsWith('.mp4') || clean.endsWith('.mkv') || clean.endsWith('.avi') || clean.endsWith('.mov') || clean.endsWith('.webm') || clean.endsWith('.flv')) {
            return false;
        }
        try {
            const rawUrl = this.getRawMediaUrl(audioUrl) as string;
            await ws.load(rawUrl);
            return true;
        } catch (err) {
            try {
                const playUrl = this.getAudioPlayUrl(audioUrl);
                await ws.load(playUrl);
                return true;
            } catch (e2) {
                return false;
            }
        }
    }

    private _waveSurferRetryCount: number = 0;
    private _isRetryingWaveSurfers: boolean = false;

    initWaveSurfers() {
        if (!this.projectData || !this.projectData.scenes) return;
        if (!this.hasAnyExtractedAudio && !this.hasAnySubtitle) return;

        // Cleanup orphaned WaveSurfers without destroying existing ones
        this.cleanupOrphanedWaveSurfers();

        let pendingCount = 0;

        // Create new ones for extractedAudios (only if missing)
        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (scene.extractedAudios) {
                for (let aIdx = 0; aIdx < scene.extractedAudios.length; aIdx++) {
                    const audio = scene.extractedAudios[aIdx];
                    const containerId = `waveform-${sceneIdx}-${aIdx}`;
                    if (this.wavesurfers[containerId]) continue; // Đã khởi tạo rồi, giữ nguyên không phá huỷ

                    const container = document.getElementById(containerId);
                    if (container && audio.audioUrl) {
                        try {
                            container.innerHTML = '';
                            const ws = WaveSurfer.create({
                                container: container,
                                waveColor: '#4f46e5',
                                progressColor: '#818cf8',
                                height: 40,
                                barWidth: 2,
                                interact: false
                            });
                            
                            this.loadAudioToWaveSurfer(ws, audio.audioUrl);
                            this.wavesurfers[containerId] = ws;
                        } catch (e) {
                            console.error('[WaveSurfer] Error initializing', containerId, e);
                        }
                    } else if (audio.audioUrl) {
                        pendingCount++;
                    }
                }
            }

            // Create new ones for subtitles (only if missing)
            if (scene.subtitles) {
                for (let sIdx = 0; sIdx < scene.subtitles.length; sIdx++) {
                    const sub = scene.subtitles[sIdx];
                    const containerId = `waveform-sub-${sceneIdx}-${sIdx}`;
                    if (this.wavesurfers[containerId]) continue; // Đã khởi tạo rồi, giữ nguyên

                    const container = document.getElementById(containerId);
                    if (container && sub.audioUrl) {
                        try {
                            container.innerHTML = '';
                            const ws = WaveSurfer.create({
                                container: container,
                                waveColor: '#4f46e5',
                                progressColor: '#818cf8',
                                height: 40,
                                barWidth: 2,
                                interact: false
                            });
                            
                            this.loadAudioToWaveSurfer(ws, sub.audioUrl);
                            this.wavesurfers[containerId] = ws;
                        } catch (e) {
                            console.error('[WaveSurfer Sub] Error initializing', containerId, e);
                        }
                    } else if (sub.audioUrl) {
                        pendingCount++;
                    }
                }
            }
        }

        // Nếu container chưa render xong trong DOM, thử lại tối đa 3 lần
        if (pendingCount > 0 && !this._isRetryingWaveSurfers && this._waveSurferRetryCount < 3) {
            this._isRetryingWaveSurfers = true;
            this._waveSurferRetryCount++;
            setTimeout(() => {
                this._isRetryingWaveSurfers = false;
                this.initWaveSurfers();
            }, 300);
        } else if (pendingCount === 0) {
            this._waveSurferRetryCount = 0;
        }
    }

    dragInitialStarts: Map<any, number> = new Map();
    dragSceneIdx: number = -1;
    dragVideoIdx: number = -1;

    onDragBlockStart(e: MouseEvent, video: any, sceneIdx: number) {
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();
        this.draggingVideo = video;
        this.setActiveItem(video); // Activate & show preview
        this.dragType = 'move';
        this.dragStartX = e.clientX;
        this.dragStartLeft = video.startTime || 0;
        this.dragSceneIdx = sceneIdx;

        this.dragVideoIdx = -1;
        const scene = this.projectData?.scenes?.[sceneIdx];
        if (scene && scene.videos) {
            this.dragVideoIdx = scene.videos.indexOf(video);
        }

        this.dragInitialStarts.clear();
        if (this.projectData?.scenes) {
            for (const s of this.projectData.scenes) {
                if (s.images) s.images.forEach((img: any) => this.dragInitialStarts.set(img, img.startTime || 0));
                if (s.videos) s.videos.forEach((v: any) => this.dragInitialStarts.set(v, v.startTime || 0));
                if (s.subtitles) s.subtitles.forEach((sub: any) => this.dragInitialStarts.set(sub, sub.startTime || 0));
                if (s.texts) s.texts.forEach((txt: any) => this.dragInitialStarts.set(txt, txt.startTime || 0));
                if (s.extractedAudios) s.extractedAudios.forEach((ext: any) => this.dragInitialStarts.set(ext, ext.startTime || 0));
            }
        }

        document.addEventListener('mousemove', this.onTimelineMouseMove);
        document.addEventListener('mouseup', this.onTimelineMouseUp);
    }

    dragStartTrim: number = 0;

    onResizeStart(e: MouseEvent, video: any, type: 'left' | 'right') {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.draggingVideo = video;
        this.setActiveItem(video); // Activate & show preview
        this.dragType = type;
        this.dragStartX = e.clientX;
        this.dragStartLeft = video.startTime || 0;
        this.dragStartWidth = video.duration || 5;
        this.dragStartTrim = video.trimStart || 0;

        document.addEventListener('mousemove', this.onTimelineMouseMove);
        document.addEventListener('mouseup', this.onTimelineMouseUp);
    }

    onTimelineMouseMove = (e: MouseEvent) => {
        if (!this.draggingVideo) return;
        const deltaX = e.clientX - this.dragStartX;
        const deltaSeconds = deltaX / this.pixelsPerSecond;
        const snapThreshold = 15 / this.pixelsPerSecond; // Khoảng cách hút dính (15 pixels)

        // Thu thập tất cả các điểm snap (bỏ qua item đang kéo và các video/subtitles bị kéo theo)
        const snapPoints: number[] = [0];
        if (this.projectData?.scenes) {
            for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                const scene = this.projectData.scenes[sIdx];
                if (scene.videos) {
                    for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                        const v = scene.videos[vIdx];
                        if (v === this.draggingVideo) continue;
                        if (vIdx === this.dragVideoIdx && sIdx > this.dragSceneIdx && this.dragType === 'move') continue;

                        if (v.startTime !== undefined) {
                            snapPoints.push(v.startTime);
                            snapPoints.push(v.startTime + (v.duration || 0));
                        }
                    }
                }
                if (scene.images) {
                    for (const img of scene.images) {
                        if (img === this.draggingVideo) continue;
                        if (img.startTime !== undefined) {
                            snapPoints.push(img.startTime);
                            snapPoints.push(img.startTime + (img.duration || 0));
                        }
                    }
                }
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        if (sub === this.draggingVideo) continue;
                        if (sub.startTime !== undefined) {
                            snapPoints.push(sub.startTime);
                            snapPoints.push(sub.startTime + (sub.duration || 0));
                        }
                    }
                }
                if (scene.texts) {
                    for (const txt of scene.texts) {
                        if (txt === this.draggingVideo) continue;
                        if (txt.startTime !== undefined) {
                            snapPoints.push(txt.startTime);
                            snapPoints.push(txt.startTime + (txt.duration || 0));
                        }
                    }
                }
            }
        }

        if (this.dragType === 'move') {
            let newStart = this.dragStartLeft + deltaSeconds;

            // Tìm điểm snap gần nhất
            let bestSnap = newStart;
            let minDiff = snapThreshold;
            for (const point of snapPoints) {
                if (Math.abs(newStart - point) < minDiff) {
                    minDiff = Math.abs(newStart - point);
                    bestSnap = point;
                }
                const endPos = newStart + (this.draggingVideo.duration || 0);
                if (Math.abs(endPos - point) < minDiff) {
                    minDiff = Math.abs(endPos - point);
                    bestSnap = point - (this.draggingVideo.duration || 0);
                }
            }

            const targetVisualStart = Math.max(0, bestSnap);
            this.draggingVideo.startTime = targetVisualStart;
            const totalDelta = targetVisualStart - this.dragStartLeft;

            // Đồng bộ subtitle và audio nếu đây là video chính (track 0)
            if (this.dragVideoIdx === 0 && this.projectData?.scenes) {
                const scene = this.projectData.scenes[this.dragSceneIdx];
                if (scene) {
                    if (scene.subtitles) {
                        scene.subtitles.forEach((sub: any) => {
                            sub.startTime = (this.dragInitialStarts.get(sub) || 0) + totalDelta;
                        });
                    }
                    if (scene.extractedAudios) {
                        scene.extractedAudios.forEach((ext: any) => {
                            ext.startTime = (this.dragInitialStarts.get(ext) || 0) + totalDelta;
                        });
                    }
                }
            }

            // Realtime sort and pack
            if (this.projectData?.scenes) {
                this.projectData.scenes.sort((a, b) => {
                    const startA = (a.videos && a.videos.length > 0) ? (a.videos[0].startTime || 0) : 0;
                    const startB = (b.videos && b.videos.length > 0) ? (b.videos[0].startTime || 0) : 0;
                    return startA - startB;
                });

                // Cập nhật lại dragSceneIdx do vị trí mảng đã thay đổi sau khi sort
                if (this.dragVideoIdx === 0) {
                    const newIdx = this.projectData.scenes.findIndex(s => s.videos && s.videos[0] === this.draggingVideo);
                    if (newIdx >= 0) this.dragSceneIdx = newIdx;
                }

                // Đóng gói giả (không save) để các scene khác tự dạt ra realtime
                this.packTimeline(false);

                // Khôi phục lại vị trí visual của scene đang kéo để nó vẫn dính vào chuột
                if (this.dragVideoIdx === 0) {
                    const scene = this.projectData.scenes[this.dragSceneIdx];
                    if (scene && scene.videos && scene.videos.length > 0) {
                        const packedStart = scene.videos[0].startTime || 0;
                        const restoreDelta = targetVisualStart - packedStart;

                        scene.videos[0].startTime = targetVisualStart;
                        for (let i = 1; i < scene.videos.length; i++) {
                            scene.videos[i].startTime = (scene.videos[i].startTime || 0) + restoreDelta;
                        }
                        if (scene.subtitles) {
                            scene.subtitles.forEach((sub: any) => sub.startTime = (sub.startTime || 0) + restoreDelta);
                        }
                        if (scene.extractedAudios) {
                            scene.extractedAudios.forEach((ext: any) => ext.startTime = (ext.startTime || 0) + restoreDelta);
                        }
                    }
                } else {
                    this.draggingVideo.startTime = targetVisualStart;
                }
            }
        } else if (this.dragType === 'left') {
            let newStart = this.dragStartLeft + deltaSeconds;
            let newDuration = this.dragStartWidth - deltaSeconds;

            // Tìm điểm snap gần nhất cho đầu video
            let bestSnapStart = newStart;
            let minDiff = snapThreshold;
            for (const point of snapPoints) {
                if (Math.abs(newStart - point) < minDiff) {
                    minDiff = Math.abs(newStart - point);
                    bestSnapStart = point;
                }
            }

            if (bestSnapStart !== newStart) {
                newDuration = this.dragStartLeft + this.dragStartWidth - bestSnapStart;
                newStart = bestSnapStart;
            }

            const minDuration = 0.2;
            if (newDuration < minDuration) {
                newDuration = minDuration;
                newStart = this.dragStartLeft + this.dragStartWidth - minDuration;
            }

            // Cap at maxDuration if media
            let maxAllowable = this.draggingVideo.maxDuration;
            if (!this.draggingVideo.videoUrl && !this.draggingVideo.audioUrl) {
                maxAllowable = Infinity;
            } else if (!maxAllowable) {
                maxAllowable = this.dragStartWidth;
            } else {
                // Trimming from left means we can't expand beyond maxDuration
                maxAllowable = maxAllowable - (this.draggingVideo.trimStart || 0);
            }

            // Limit how far left we can drag (can't go below trimStart = 0 if media)
            if (this.draggingVideo.videoUrl || this.draggingVideo.audioUrl) {
                let appliedDelta = newStart - this.dragStartLeft;
                let newTrimStart = this.dragStartTrim + appliedDelta;

                if (newTrimStart < 0) {
                    newTrimStart = 0;
                    newStart = this.dragStartLeft - this.dragStartTrim;
                    newDuration = this.dragStartWidth + this.dragStartTrim;
                }
                
                if (newDuration < minDuration) {
                    newDuration = minDuration;
                    newStart = this.dragStartLeft + this.dragStartWidth - minDuration;
                    newTrimStart = this.dragStartTrim + (this.dragStartWidth - minDuration);
                }

                if (newStart < 0) {
                    newStart = 0;
                    newDuration = this.dragStartWidth + this.dragStartLeft;
                    newTrimStart = this.dragStartTrim - this.dragStartLeft;
                    if (newTrimStart < 0) newTrimStart = 0;
                }
                this.draggingVideo.trimStart = newTrimStart;
            } else {
                if (newStart < 0) {
                    newStart = 0;
                    newDuration = this.dragStartLeft + this.dragStartWidth;
                }
            }
            
            this.draggingVideo.startTime = Math.max(0, newStart);
            this.draggingVideo.duration = Math.max(minDuration, newDuration);
        } else if (this.dragType === 'right') {
            let newDuration = this.dragStartWidth + deltaSeconds;
            let newEnd = this.dragStartLeft + newDuration;

            // Tìm điểm snap gần nhất cho đuôi video
            let bestSnapEnd = newEnd;
            let minDiff = snapThreshold;
            for (const point of snapPoints) {
                if (Math.abs(newEnd - point) < minDiff) {
                    minDiff = Math.abs(newEnd - point);
                    bestSnapEnd = point;
                }
            }

            if (bestSnapEnd !== newEnd) {
                newDuration = bestSnapEnd - this.dragStartLeft;
            }

            const minDuration = 0.2;
            if (newDuration < minDuration) newDuration = minDuration;

            // Cap at maxDuration if media
            let maxAllowable = this.draggingVideo.maxDuration;
            if (!this.draggingVideo.videoUrl && !this.draggingVideo.audioUrl) {
                maxAllowable = Infinity;
            } else if (!maxAllowable) {
                maxAllowable = this.dragStartWidth;
            } else {
                maxAllowable = maxAllowable - (this.draggingVideo.trimStart || 0);
            }
            if (newDuration > maxAllowable) {
                newDuration = maxAllowable;
            }

            this.draggingVideo.duration = Math.max(minDuration, newDuration);
        }

        // Logic cập nhật audio theo dragType left/right (nếu là video chính)
        if (this.dragType !== 'move' && this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos && scene.videos[0] === this.draggingVideo) {
                    let subTime = this.draggingVideo.startTime || 0;
                    if (scene.subtitles) {
                        for (const sub of scene.subtitles) {
                            sub.startTime = subTime;
                            subTime += (sub.duration || 0);
                        }
                    }
                    let extTime = this.draggingVideo.startTime || 0;
                    if (scene.extractedAudios) {
                        for (const ext of scene.extractedAudios) {
                            ext.startTime = extTime;
                            extTime += (ext.duration || 0);
                        }
                    }
                    break;
                }
            }
        }

        this.updateLines();
    }

    onTimelineMouseUp = () => {
        if (this.draggingVideo) {
            if (this.dragType === 'move' && this.projectData && this.projectData.scenes) {
                // Sắp xếp lại mảng scenes dựa trên startTime trực quan sau khi kéo
                this.projectData.scenes.sort((a, b) => {
                    const startA = (a.videos && a.videos.length > 0) ? (a.videos[0].startTime || 0) : 0;
                    const startB = (b.videos && b.videos.length > 0) ? (b.videos[0].startTime || 0) : 0;
                    return startA - startB;
                });
                // Tính toán lại timeline để các video xếp nối tiếp nhau tự động
                this.packTimeline();
            }
            this.saveData();
        }
        this.draggingVideo = null;
        this.dragType = null;
        document.removeEventListener('mousemove', this.onTimelineMouseMove);
        document.removeEventListener('mouseup', this.onTimelineMouseUp);
    }
    // ----------------------------

    linkingSourceVideo: any = null;
    linkingSourceSceneIndex: number = -1;
    linkingSourceVideoIndex: number = -1;

    // --- Drag to Link logic ---
    isDraggingLink: boolean = false;
    currentMouseX: number = 0;
    currentMouseY: number = 0;

    onDragLinkStart(e: MouseEvent, video: any, sceneIdx: number, vIdx: number) {}
    onDragLinkMove = (e: MouseEvent) => {}
    onDragLinkEnd = (e: MouseEvent) => {}
    cancelLinking() {}


    private getGeminiKey(): string | null {
        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        const keys = secretKey.map((k: string) => k.trim()).filter((k: string) => k);
        if (keys.length === 0) return null;

        return keys[Math.floor(Math.random() * keys.length)];
    }

    private getBase64FromImageUrl(url: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            if (!url) {
                reject('Empty URL');
                return;
            }

            let finalUrl = url;
            if (!finalUrl.startsWith('http') && !finalUrl.startsWith('data:') && !finalUrl.startsWith('blob:') && !finalUrl.startsWith('media://')) {
                finalUrl = finalUrl.replace(/^unsafe:/, '');
                let originalPath = finalUrl.split('?')[0];
                originalPath = originalPath.replace(/^file:\/\//i, '');
                if (!/^[a-zA-Z]:/.test(originalPath) && !originalPath.startsWith('/')) {
                    originalPath = '/' + originalPath;
                }
                const mediaDir = ''; 
                finalUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=default`;
            }

            try {
                if (finalUrl.startsWith('media://') || finalUrl.startsWith('blob:') || finalUrl.startsWith('data:video/')) {
                    const res = await fetch(finalUrl);
                    const blob = await res.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        resolve(result.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                    return;
                }
            } catch (e) {
                console.warn('Fetch fallback failed, trying Image element...', e);
            }

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let targetW = img.width;
                let targetH = img.height;
                
                if (targetW < 512 || targetH < 512) {
                    const scale = Math.max(512 / targetW, 512 / targetH);
                    targetW = Math.round(targetW * scale);
                    targetH = Math.round(targetH * scale);
                }
                
                if (targetW > 1536 || targetH > 1536) {
                    const scale = Math.min(1536 / targetW, 1536 / targetH);
                    targetW = Math.round(targetW * scale);
                    targetH = Math.round(targetH * scale);
                }

                // Kiểm tra tỷ lệ khung hình (Kling giới hạn 1:2.5 đến 2.5:1)
                // Ta sẽ pad (thêm viền) nếu tỷ lệ vượt quá 1:2 hoặc 2:1 để an toàn
                let finalW = targetW;
                let finalH = targetH;
                const ratio = targetW / targetH;
                
                if (ratio > 2) {
                    // Quá rộng -> thêm viền trên dưới
                    finalH = Math.round(targetW / 2);
                } else if (ratio < 0.5) {
                    // Quá cao -> thêm viền 2 bên
                    finalW = Math.round(targetH / 2);
                }

                canvas.width = finalW;
                canvas.height = finalH;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Lót nền trắng để tránh bị đen do ảnh PNG trong suốt chuyển sang JPEG
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, finalW, finalH);
                    
                    // Vẽ ảnh vào giữa canvas
                    const offsetX = (finalW - targetW) / 2;
                    const offsetY = (finalH - targetH) / 2;
                    ctx.drawImage(img, offsetX, offsetY, targetW, targetH);
                }

                const dataURL = canvas.toDataURL('image/jpeg', 0.85);
                resolve(dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""));
            };
            img.onerror = error => reject(error);
            img.src = finalUrl;
        });
    }

    async autoGenerateStoryboard(video: any, sceneIdx: number, vIdx: number) {
        if (!video.prompt) return;

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) return;

        const apiKey = this.getGeminiKey();
        if (!apiKey) return;

        video.isGeneratingImage = true;
        this.cd.detectChanges();

        try {
            this.toastr.info(`Đang tự động vẽ Storyboard cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}...`, 'Hệ thống');

            let promptText = video.imagePrompt || video.prompt || '';
            promptText = promptText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();

            const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
            if (master) {
                promptText = master + '\n\n' + promptText;
            }
            const noSplitScreenConstraint = "\n\n[MANDATORY: Generate exactly ONE single, unified frame. Do NOT generate multiple panels, split screens, storyboards, comic strips, collages, or grids. This must be a single cohesive image.]";

            let requestParts: any[] = [{ text: promptText + noSplitScreenConstraint }];

            // Gắn thêm ảnh tham khảo do người dùng tải lên (nếu có từ nút Tải ảnh mẫu)
            if (video.aiReferenceImageLocalUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(video.aiReferenceImageLocalUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                    video.aiReferenceImageLocalUrl = null; // consume it
                } catch (e) {
                    console.error('Không thể đọc ảnh reference upload', e);
                }
            }

            // Gắn thêm ảnh reference của nhân vật được tick nếu có
            // Tìm các nhân vật có tên xuất hiện trong prompt
            if (this.projectData?.characters) {
                for (const char of this.projectData.characters) {
                    const charName = char.name || char.role;
                    if (charName && video.prompt.includes(`[Character '${charName}'`)) {
                        const imgUrl = char.avatarUrl || (char.avatarUrls && char.avatarUrls.length > 0 ? char.avatarUrls[0] : null);
                        if (imgUrl) {
                            try {
                                const base64Data = await this.getBase64FromImageUrl(imgUrl);
                                requestParts.push({
                                    inlineData: {
                                        data: base64Data,
                                        mimeType: 'image/png'
                                    }
                                });
                            } catch (e) {
                                console.error('Không thể đọc ảnh reference cho', char.name, e);
                            }
                        }
                    }
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: requestParts }],
                config: {
                    aspectRatio: this.projectData?.aspectRatio || '16:9',
                    responseModalities: ['IMAGE']
                } as any
            });

            let base64Data = null;
            if (response.candidates && response.candidates.length > 0) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        base64Data = part.inlineData.data;
                        break;
                    }
                }
            }

            if (base64Data) {
                const fileName = `scene_auto_${Date.now()}_${sceneIdx}_${vIdx}.png`;
                const result = await electron.saveBase64({
                    base64: base64Data,
                    fileName: fileName,
                    customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
                });

                if (result && result.success) {
                    const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                    video.imageUrl = finalPath;
                    this.saveData();
                    this.cd.detectChanges();
                    this.toastr.success(`Đã tự động tạo ảnh Storyboard cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}!`);
                }
            }
        } catch (error) {
            console.error('Lỗi tự động tạo Storyboard:', error);
        } finally {
            video.isGeneratingImage = false;
            this.cd.detectChanges();
        }
    }

    triggerUploadVideo(video: any) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e: any) => this.onUploadVideoFromPC(e, video);
        input.click();
    }

    async onUploadVideoFromPC(event: any, video: any) {
        const file = event.target.files[0];
        if (file) {
            const electron = (window as any).electron;
            if (!electron || !electron.getPathForFile) {
                this.toastr.error('Tính năng này yêu cầu môi trường Desktop (Electron) để thao tác.');
                return;
            }
            try {
                const originalPath = electron.getPathForFile(file);
                if (!originalPath) {
                    this.toastr.error('Không thể xác nhận đường dẫn file.');
                    return;
                }
                const uuid = this.projectData?.uuid || this.data?.uuid;
                const customDir = uuid ? `tts/admin/${uuid}` : undefined;
                const localFilePath = await electron.selectLocalFile(originalPath, customDir);
                const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;

                video.videoUrl = finalPath;
                video.imageUrl = null;
                
                const videoObj = document.createElement('video');
                videoObj.src = this.getRawMediaUrl(video.videoUrl) as string;
                videoObj.addEventListener('loadedmetadata', () => {
                    if (videoObj.duration && !isNaN(videoObj.duration)) {
                        video.duration = parseFloat(videoObj.duration.toFixed(1));
                        video.maxDuration = video.duration;
                        this.saveData();
                        this.cd.detectChanges();
                    }
                });

                this.saveData();
                this.toastr.success('Đã tải lên video thành công!');
                this.cd.detectChanges();
            } catch (error: any) {
                console.error('Error uploading video:', error);
                this.toastr.error('Lỗi khi tải video: ' + error.message);
            }
        }
    }

    async autoGenerateVideo(scene: any, video: any, sceneIdx: number, vIdx: number, isMagic: boolean = false) {
        if (!video.prompt) {
            this.toastr.warning('Vui lòng nhập prompt phân cảnh trước khi tạo video!');
            return;
        }
        
        if (isMagic && video.duration > 10) {
            video.duration = 10;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        video.isGeneratingVideo = true;
        this.cd.detectChanges();

        try {
            this.toastr.info(`Đang tự động tạo Video cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}...`, 'Hệ thống', { timeOut: 5000 });
            let base64 = '';

            const isProxy = this._genaiService.isUModelverseEnabled();
            
            let referenceImages: any[] = [];
            // Gắn thêm ảnh Storyboard làm reference
            if (video.imageUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(video.imageUrl);
                    referenceImages.push({
                        image: { imageBytes: base64Data, mimeType: 'image/jpeg' },
                        referenceType: 'START_FRAME'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Storyboard làm reference cho video:', e);
                }
            }

            // [NEW] Gắn thêm ảnh cuối từ video liên kết (nếu có)
            if (video.linkedTo) {
                const targetScene = this.projectData?.scenes?.[video.linkedTo.sceneIndex];
                const targetVideo = targetScene?.videos?.[video.linkedTo.videoIndex];
                if (targetVideo && targetVideo.imageUrl) {
                    try {
                        const base64DataEnd = await this.getBase64FromImageUrl(targetVideo.imageUrl);
                        referenceImages.push({
                            image: { imageBytes: base64DataEnd, mimeType: 'image/jpeg' },
                            referenceType: 'END_FRAME'
                        });
                    } catch (e) {
                        console.error('Không thể đọc ảnh đích làm reference cho video:', e);
                    }
                }
            }

            // Gắn thêm ảnh Khung xương/Bố cục (ControlNet / Pose reference)
            let controlImg = video.controlImageUrl || this.projectData?.masterControlImageUrl;
            if (controlImg) {
                try {
                    const base64DataControl = await this.getBase64FromImageUrl(controlImg);
                    referenceImages.push({
                        image: { imageBytes: base64DataControl, mimeType: 'image/jpeg' },
                        referenceType: 'CONTROL_IMAGE'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Khung xương/Bố cục làm reference cho video:', e);
                }
            }

            // Gắn thêm video hiện tại làm tham chiếu chuyển động (Motion Control)
            if (isMagic && video.videoUrl) {
                try {
                    let finalVideoUrl = video.videoUrl;
                    
                    // Kling v3 Motion Control chỉ hỗ trợ tối đa 10s, cắt nếu vượt quá
                    const originalDuration = parseFloat(video.maxDuration) || 999;
                    let targetDuration = parseFloat(video.duration);
                    if (isNaN(targetDuration) || targetDuration > 10) targetDuration = 10;
                    
                    let needsTrim = false;
                    if ((video.trimStart && video.trimStart > 0) || originalDuration > 10) {
                        needsTrim = true;
                    } else if (originalDuration > targetDuration + 0.1) {
                        needsTrim = true;
                    }

                    if (needsTrim) {
                        const electron = (window as any).electron;
                        if (electron && electron.invoke) {
                            try {
                                this.toastr.info(`Đang tự động cắt video tham chiếu xuống ${targetDuration}s...`);
                                const trimRes = await electron.invoke('trim-video', {
                                    videoUrl: video.videoUrl,
                                    trimStart: video.trimStart || 0,
                                    duration: targetDuration
                                });
                                if (trimRes && trimRes.success) {
                                    finalVideoUrl = trimRes.path.replace(/\\/g, '/');
                                } else {
                                    console.warn('Lỗi cắt video:', trimRes?.error);
                                    this.toastr.error('Lỗi khi cắt video: ' + trimRes?.error);
                                    throw new Error('Không thể cắt video tham chiếu xuống dưới 10s.');
                                }
                            } catch (e) {
                                console.error('Lỗi gọi cắt video:', e);
                                this.toastr.error('Ứng dụng Electron không phản hồi khi gọi lệnh cắt video.');
                                throw new Error('Không thể gọi lệnh cắt video qua Electron.');
                            }
                        }
                    }

                    // Luôn luôn upload lên CDN nếu file là local
                    if (!finalVideoUrl.startsWith('http')) {
                        try {
                            this.toastr.info(`Đang tải video lên hệ thống CDN...`);
                            const base64Video = await this.getBase64FromImageUrl(finalVideoUrl);
                            const cdnUrl = await this._genaiService.uploadBase64ToCdn(`data:video/mp4;base64,${base64Video}`, `reference_video_${Date.now()}.mp4`);
                            if (cdnUrl) {
                                video.videoUrl = cdnUrl; // Cập nhật lại UI luôn
                                finalVideoUrl = cdnUrl;
                            }
                        } catch (uploadErr) {
                            console.error('Lỗi upload video:', uploadErr);
                            this.toastr.warning('Không thể upload video, sẽ dùng file local.');
                        }
                    }

                    // Nếu là URL local hoặc có file, ta có thể phải tải về để lấy base64. 
                    // Tạm thời nếu là URL http thì có thể truyền trực tiếp hoặc phải getBase64.
                    if (finalVideoUrl.startsWith('http')) {
                        referenceImages.push({
                            image: { imageBytes: finalVideoUrl, mimeType: 'video/mp4' },
                            referenceType: 'REFERENCE_VIDEO'
                        });
                    } else {
                        const base64Video = await this.getBase64FromImageUrl(finalVideoUrl);
                        referenceImages.push({
                            image: { imageBytes: base64Video, mimeType: 'video/mp4' },
                            referenceType: 'REFERENCE_VIDEO'
                        });
                    }
                } catch (e) {
                    console.error('Không thể đọc video hiện tại làm reference cho Kling:', e);
                    this.toastr.warning('Lỗi khi nạp video tham chiếu. Sẽ tiếp tục không có video.');
                }
            }

            // Gắn ảnh avatar nhân vật để giữ nhất quán nhân vật giữa các video
            let hasCharacterRef = false;
            if (this.projectData?.characters) {
                for (const char of this.projectData.characters) {
                    const charName = char.name || char.role;
                    if (charName && video.prompt.includes(`[Character '${charName}'`)) {
                        const imgUrl = char.avatarUrl || (char.avatarUrls && char.avatarUrls.length > 0 ? char.avatarUrls[0] : null);
                        if (imgUrl) {
                            try {
                                const base64Data = await this.getBase64FromImageUrl(imgUrl);
                                referenceImages.push({
                                    image: { imageBytes: base64Data, mimeType: 'image/jpeg' },
                                    referenceType: 'ASSET'
                                });
                                hasCharacterRef = true;
                            } catch (e) {
                                console.error('Không thể đọc ảnh reference cho video:', char.name, e);
                            }
                        }
                    }
                }
            }

            let promptText = video.prompt || '';
            const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
            let basePrompt = master ? `${master}\n\n${promptText}` : promptText;
            
            let mandatoryTags = '';
            if (video.duration) {
                mandatoryTags += `\n[MANDATORY: Generate video with exact duration of ${video.duration} seconds]`;
            }

            if (referenceImages && referenceImages.length > 0) {
                mandatoryTags += `\n[MANDATORY: Strictly follow layout, skeleton & character references 100%. No hallucinations or extra details.]`;
                const hasControlImage = referenceImages.some(img => img.referenceType === 'CONTROL_IMAGE');
                if (hasControlImage) {
                    mandatoryTags += `\n[CRITICAL INSTRUCTION: The attached reference image is a SKETCH/StoryBoard layout. DO NOT render the video in a sketch, drawing, or wireframe style. Use the image ONLY for pose, composition, and framing. The final video MUST be highly photorealistic and cinematic according to the prompt.]`;
                }
            }

            let finalPrompt = basePrompt + mandatoryTags;
            let byteLength = new TextEncoder().encode(finalPrompt).length;

            if (byteLength > 2500 && isProxy) {
                this.toastr.warning(`Đoạn video có tổng độ dài prompt (${byteLength} bytes) vượt quá 2500 của hệ thống. Đã bỏ qua đoạn này.`);
                return;
            }
            if (isProxy || isMagic) {
                base64 = await this._genaiService.generateVideoUModelverse(
                    finalPrompt,
                    this.projectData?.aspectRatio || '16:9',
                    referenceImages,
                    video.duration,
                    undefined,
                    isMagic ? 'kling-v3-motion-control' : undefined
                );
            } else {
                const apiKey = this.getGeminiKey();
                if (!apiKey) {
                    this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
                    return;
                }

                const ai = this._genaiService.googleAi || new GoogleGenAI({ apiKey: apiKey });
                let operation: any;
                const videoConfig: any = {};
                if (this.projectData?.aspectRatio) {
                    videoConfig.aspectRatio = this.projectData.aspectRatio;
                }
                if (referenceImages.length > 0) {
                    videoConfig.referenceImages = referenceImages.slice(0, 3).map(img => {
                        return {
                            ...img,
                            referenceType: 'ASSET'
                        };
                    });
                }

                operation = await ai.models.generateVideos({
                    model: 'veo-3.1-generate-preview',
                    prompt: finalPrompt,
                    config: videoConfig
                });

                let pollCount = 0;
                const MAX_POLLS = 60; 

                while (!operation.done) {
                    if (pollCount >= MAX_POLLS) throw new Error('Quá thời gian chờ tạo video (10 phút).');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    operation = await ai.operations.getVideosOperation({ operation: operation });
                    pollCount++;
                }

                if (!operation.response || !operation.response.generatedVideos || operation.response.generatedVideos.length === 0) {
                    throw new Error('Không nhận được video từ AI.');
                }

                const videoUri = operation.response.generatedVideos[0].video.uri;
                if (!videoUri) throw new Error('Không tìm thấy URI tải video.');

                this.toastr.info('Đang tải video về máy...', 'Hệ thống');
                const res = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
                if (!res.ok) throw new Error('Không thể tải file video từ Google.');

                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                const chunkSize = 8192;
                for (let i = 0; i < len; i += chunkSize) {
                    base64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
                }
                base64 = btoa(base64);
            }

            const fileName = `scene_video_${Date.now()}_${sceneIdx}_${vIdx}.mp4`;
            const result = await electron.saveBase64({
                base64: base64,
                fileName: fileName,
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                video.videoUrl = finalPath;
                this.saveData();
                this.cd.detectChanges();
                this.toastr.success(`Đã tự động tạo Video cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}!`);
            } else {
                throw new Error(result.error || 'Lỗi lưu file video.');
            }
        } catch (error: any) {
            console.error('Lỗi tự động tạo Video:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo video AI: ' + errorMsg);
        } finally {
            video.isGeneratingVideo = false;
            this.cd.detectChanges();
        }
    }

    private formatGeminiError(error: any): string {
        let msg = error.message || error.toString() || 'Lỗi không xác định';

        try {
            const match = msg.match(/\{"error":[\s\S]*?\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.error && parsed.error.message) {
                    msg = parsed.error.message;
                }
            }
        } catch { }

        if (
            msg.includes('trace_id') ||
            msg.toLowerCase().includes('model') ||
            msg.toLowerCase().includes('umodelverse') ||
            msg.toLowerCase().includes('support')
        ) {
            return msg;
        }

        if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            return 'Tài khoản API Key đã hết hạn mức (Quota Exceeded) hoặc bị giới hạn tốc độ. Vui lòng thiết lập thẻ thanh toán trên Google AI Studio hoặc thử lại sau.';
        }
        if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
            return 'Lỗi cấu hình (400): Prompt không hợp lệ hoặc chứa nội dung bị cấm.';
        }
        if (msg.includes('500') || msg.includes('INTERNAL')) {
            return 'Lỗi máy chủ Google (500). Hệ thống AI đang gặp sự cố, vui lòng thử lại sau.';
        }
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            return 'Lỗi mạng, không thể kết nối tới Google AI.';
        }

        return msg;
    }

    completeLinking(targetVideo: any, targetSceneIdx: number, targetVIdx: number) {}
    removeLink(video: any) {}
    scrollToLinkedVideo(linkedTo: any) {}
    hasIncomingLink(sceneIdx: number, vIdx: number): boolean { return false; }

    @HostListener('document:keydown', ['$event'])
    onKeydownHandler(event: KeyboardEvent) {
        const target = event.target as HTMLElement;
        const isEditingInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

        if (event.key === 'Escape') {
            if (this.linkingSourceVideo) {
                this.cancelLinking();
                this.toastr.info('Đã hủy tạo liên kết.');
            }
        } else if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
            if (isEditingInput) return;
            event.preventDefault();
            this.selectAllItems();
        } else if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
            event.preventDefault();
            this.saveData(true);
        } else if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'B' || event.code === 'KeyB')) {
            if (isEditingInput) return;
            event.preventDefault();
            this.splitVideoAtPlayhead();
        } else if (event.code === 'Space') {
            if (isEditingInput) return;
            event.preventDefault();
            this.toggleTimelinePlay();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            if (isEditingInput) return;
            event.preventDefault();
            this.deleteSelectedItems();
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !isEditingInput) {
            if (event.key === 'c' || event.key === 'C') {
                event.preventDefault();
                this.splitVideoAtPlayhead();
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                const step = event.shiftKey ? 1.0 : 0.2;
                this.seekTimelineTo(Math.max(0, this.currentTimelineTime - step));
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                const step = event.shiftKey ? 1.0 : 0.2;
                this.seekTimelineTo(Math.min(this.getMaxTimelineTime(), this.currentTimelineTime + step));
            }
        }
    }

    splitVideoAtPlayhead(targetVideo?: any, targetSceneIdx?: number, targetVIdx?: number) {
        const time = this.currentTimelineTime;
        let vidToSplit = targetVideo || (this.activeItem && (this.activeItem.videoUrl || this.activeItem.videoId) ? this.activeItem : null);

        // Nếu chưa chọn video cụ thể, tìm video đang nằm trực tiếp dưới kim phát Playhead
        if (!vidToSplit && this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos) {
                    for (const v of scene.videos) {
                        const start = v.startTime || 0;
                        const end = start + (v.duration || 0);
                        if (time >= start && time <= end) {
                            vidToSplit = v;
                            break;
                        }
                    }
                }
                if (vidToSplit) break;
            }
        }
        
        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (!scene.videos) continue;
            
            for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                const video = scene.videos[vIdx];
                if (vidToSplit && video !== vidToSplit && video.id !== vidToSplit.id) continue;

                const start = video.startTime || 0;
                const duration = video.duration || 0;
                const end = start + duration;
                
                let splitPointInSecs = time - start;
                if (splitPointInSecs <= 0.2 || splitPointInSecs >= duration - 0.2) {
                    splitPointInSecs = duration / 2;
                }

                if (duration > 0.4) {
                    const firstDur = Math.max(0.2, Math.round(splitPointInSecs * 100) / 100);
                    const secondDur = Math.max(0.2, Math.round((duration - splitPointInSecs) * 100) / 100);

                    // Clone video
                    const newVideo = JSON.parse(JSON.stringify(video));
                    
                    // Modify old
                    video.duration = firstDur;
                    
                    // Modify new
                    newVideo.id = Date.now() + Math.random();
                    newVideo.videoId = 'vid_' + Math.random().toString(36).substr(2, 9);
                    newVideo.trimStart = Math.round(((newVideo.trimStart || 0) + firstDur) * 100) / 100;
                    newVideo.duration = secondDur;
                    newVideo.startTime = Math.round((start + firstDur) * 100) / 100;
                    
                    // Insert
                    scene.videos.splice(vIdx + 1, 0, newVideo);
                    
                    this.normalizeData();
                    this.saveData(true);
                    this.updateTimelineTotalWidth();
                    this.updateFilteredMediaItems();
                    this.toastr.success('Đã tách đoạn video (Ctrl + B) thành công.');
                    
                    // Focus new video
                    setTimeout(() => {
                        this.setActiveItem(newVideo);
                        this.cd.detectChanges();
                        this.updateLines();
                    });
                    
                    return; // Done
                }
            }
        }
        
        this.toastr.warning('Không tìm thấy đoạn video nào phù hợp để tách.');
    }

    splitAudioItem(audio: any, sceneIdx: number, aIdx: number) {
        if (!audio) return;
        const scene = this.projectData?.scenes?.[sceneIdx];
        if (!scene || !scene.extractedAudios) return;

        const start = Number(audio.startTime) || 0;
        const duration = Number(audio.duration) || 3;
        const end = start + duration;

        let cutTime = this.currentTimelineTime;
        if (cutTime <= start + 0.3 || cutTime >= end - 0.3) {
            cutTime = start + (duration / 2);
        }

        const firstDuration = Math.max(0.2, Math.round((cutTime - start) * 100) / 100);
        const secondDuration = Math.max(0.2, Math.round((end - cutTime) * 100) / 100);

        audio.duration = firstDuration;

        const newAudio = {
            ...audio,
            id: Date.now() + Math.random(),
            startTime: Math.round(cutTime * 100) / 100,
            duration: secondDuration
        };

        const targetIdx = (aIdx !== undefined && aIdx >= 0) ? aIdx + 1 : scene.extractedAudios.indexOf(audio) + 1;
        scene.extractedAudios.splice(targetIdx, 0, newAudio);

        this.normalizeData();
        this.saveData(true);
        this.cd.detectChanges();
        setTimeout(() => {
            this.initWaveSurfers();
            this.updateLines();
        }, 200);
        this.toastr.success('Đã tách phân đoạn âm thanh thành công!');
    }

    @HostListener('window:resize', ['$event'])
    onWindowResize() {
        this.updateLines();
    }

    svgLines: { path: string, color: string }[] = [];
    private lastLinesStr = '';
    private animationFrameId: any;
    isSvgReady = false;

    updateLines() {}

    @ViewChild('svgLayer') svgLayer!: ElementRef;

    // Fallback cho scroll (đã loại bỏ CdkVirtualScroll)
    get scrollContainer() {
        return {
            elementRef: {
                nativeElement: document.getElementById('timeline-scroll-container')
            }
        };
    }

    openConfigDialog() {
        const dialogRef = this.dialog.open(VideoProjectConfigDialogComponent, {
            width: '800px',
            maxWidth: '95vw',
            autoFocus: false,
            data: {
                projectData: this.projectData,
                uuid: this.data?.uuid,
                username: this.data?.username || 'anonymous',
                onSave: (newData: any) => {
                    this.projectData = newData;
                    this.saveData();
                }
            }
        });
        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.projectData = result;
                this.saveData();
                this.cd.detectChanges();
            }
        });
    }

    projectData: any;

    editingScenePrompt: any = null;
    editingSceneIndex: number = -1;

    @ViewChild('characterDialogTemplate') characterDialogTemplate!: any;
    editingChar: any = {};
    editingCharIndex: number = -1;
    private characterDialogRef: any = null;
    private editSceneDialogRef: any = null;

    // Pan (Kéo Timeline)
    private isMouseDown = false;
    private startX = 0;
    private scrollLeftStart = 0;

    onWheelScroll(event: WheelEvent) {
        // Có thể để trống hoặc thêm logic scroll timeline
    }

    onSceneWheel(event: WheelEvent) {
        // Đã không còn Scene Columns dọc
    }

    startDragging(e: MouseEvent) {
        if ((e.target as HTMLElement).closest('.cdk-drag-handle')) return;
        this.isMouseDown = true;
        this.startX = e.pageX - this.scrollContainer.elementRef.nativeElement.offsetLeft;
        this.scrollLeftStart = this.scrollContainer.elementRef.nativeElement.scrollLeft;
    }

    stopDragging() {
        this.isMouseDown = false;
    }



    getGlobalIndex(sceneIdx: number, subIdx: number): number {
        if (!this.projectData || !this.projectData.scenes) return 0;
        let total = 0;
        for (let i = 0; i < sceneIdx; i++) {
            total += this.projectData.scenes[i].subtitles?.length || 0;
        }
        return total + subIdx + 1;
    }

    async onAudioFileSelected(event: any, sub: any) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const electron = (window as any).electron;
            const originalPath = electron.getPathForFile(file);
            const localPath = await electron.selectLocalFile(originalPath);
            sub.audioUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

            const audioObj = new Audio(this.getRawMediaUrl(sub.audioUrl) as string);
            audioObj.addEventListener('loadedmetadata', () => {
                sub.duration = audioObj.duration;
                sub.maxDuration = sub.duration;
                this.saveData();
                this.cd.detectChanges();
            });

            this.saveData();
            this.toastr.success('Đã cập nhật Audio!');
        } catch (e) {
            this.toastr.error('Lỗi: ' + e);
        }
    }

    removeAudio(sub: any) {
        if (sub.audioUrl) {
            delete sub.audioUrl;
            delete sub.duration;
            delete sub.maxDuration;

            this.saveData();
            this.toastr.info('Đã xóa liên kết âm thanh câu thoại.');
        }
    }

    // --- Logic Sửa Subtitle Inline ---
    enableEditSub(sub: any) {
        sub.isEditing = true;
        sub.tempText = sub.text;
    }

    saveEditSub(scene: any, sub: any) {
        const newText = sub.tempText ? sub.tempText.trim() : '';

        // NẾU NGƯỜI DÙNG ĐỂ TRỐNG: Xóa subtitle này khỏi scene
        if (newText === '') {
            const index = scene.subtitles.indexOf(sub);
            if (index !== -1) {
                scene.subtitles.splice(index, 1);
                this.toastr.warning('Đã xóa câu thoại do nội dung bị bỏ trống.');
                this.saveData();
            }
            return;
        }

        // NẾU CÓ NỘI DUNG: Lưu bình thường
        sub.text = newText;
        sub.isEditing = false;

        if (sub.audioUrl && sub.text !== sub.tempText) {
            this.toastr.info('Bạn vừa sửa lời thoại. Hãy cẩn thận vì file âm thanh cũ có thể không còn khớp nữa nhé!', 'Lưu ý');
        } else {
            this.toastr.success('Đã cập nhật câu thoại!');
        }

        this.saveData();
    }

    cancelEditSub(sub: any) {
        sub.isEditing = false;
        delete sub.tempText;
    }
    // ---------------------------------

    async generateImage(scene: any, video: any, index: number) {
        // Lấy Master Prompt từ dữ liệu tổng của Project
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";

        // Tự động nối Master Prompt vào Scene Prompt để copy
        const scenePrompt = video.prompt || scene.prompt;
        const finalPrompt = master ? `${master}\n\n${scenePrompt}` : scenePrompt;

        // Copy vào Clipboard
        this.clipboard.copy(finalPrompt);
        this.toastr.info(`Đã copy Master Prompt + Scene #${index + 1} vào khay nhớ tạm!`, 'Thành công');

        // 4. Lưu lại scene để nếu có ảnh download về thì tự động gán vào
        this.activeDownloadScene = video;
    }

    copyCharacterPrompt(char: any) {
        if (!char.prompt) {
            this.toastr.warning('Nhân vật này chưa có câu prompt tạo hình.');
            return;
        }

        // Nối Master Prompt vào để nhân vật cũng giữ đúng phong cách (VD: hoạt hình 3D)
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
        const finalPrompt = master ? `${master}\n\n${char.prompt}` : char.prompt;

        this.clipboard.copy(finalPrompt);
        this.toastr.success(`Đã copy Master Prompt + Nhân vật: ${char.name || char.role}`, 'Thành công');
    }

    addCharacterToMasterPrompt(char: any) {
        if (!char.prompt) {
            this.toastr.warning('Nhân vật này chưa có câu prompt tạo hình.');
            return;
        }

        if (!this.projectData) this.projectData = {};
        const currentPrompt = this.projectData.masterPrompt ? this.projectData.masterPrompt.trim() : '';

        if (currentPrompt) {
            if (currentPrompt.includes(char.prompt)) {
                this.toastr.info('Nhân vật này đã có trong Master Prompt rồi.');
                return;
            }
            this.projectData.masterPrompt = currentPrompt + (currentPrompt.endsWith(',') || currentPrompt.endsWith('.') ? ' ' : '. ') + char.prompt;
        } else {
            this.projectData.masterPrompt = char.prompt;
        }

        this.saveData();
        this.toastr.success(`Đã thêm tạo hình "${char.name || char.role}" vào Master Prompt!`);
    }

    openEditScenePromptDialog(scene: any, video: any, index: number, vIdx: number = -1) {
        this.pauseTimeline(); // Dừng timeline để tập trung edit prompt

        let previousVideoUrl: string | null = null;
        if (vIdx > 0 && scene.videos && scene.videos[vIdx - 1]) {
            previousVideoUrl = scene.videos[vIdx - 1].videoUrl || null;
        } else if (index > 0 && this.projectData?.scenes?.[index - 1]) {
            const prevScene = this.projectData.scenes[index - 1];
            if (prevScene.videos && prevScene.videos.length > 0) {
                previousVideoUrl = prevScene.videos[prevScene.videos.length - 1].videoUrl || null;
            } else if (prevScene.videoUrl) {
                previousVideoUrl = prevScene.videoUrl;
            }
        }

        const dialogRef = this.dialog.open(EditScenePromptDialogComponent, {
            data: {
                scene,
                video,
                index,
                vIdx,
                previousVideoUrl,
                characters: this.projectData?.characters || [],
                projectAspectRatio: this.projectData?.aspectRatio || '16:9',
                masterPrompt: this.projectData?.masterPrompt || '',
                masterControlImageUrl: this.projectData?.masterControlImageUrl || '',
                globalContext: this.projectData?.globalContext || null,
                mediaDir: this.projectData?.mediaDir || '',
                uuid: this.projectData?.uuid || this.data?.uuid,
                username: this.projectData?.username || this.data?.username
            },
            width: '75vw',
            maxWidth: '90vw',
            maxHeight: '90vh',
            disableClose: true
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                if (!this.projectData || !this.projectData.scenes) return;
                if (index >= 0 && index < this.projectData.scenes.length) {
                    video.prompt = result.prompt;
                    video.imageUrl = result.imageUrl;
                    if (result.imagePrompt !== undefined) video.imagePrompt = result.imagePrompt;
                    if (result.videoUrl !== undefined) video.videoUrl = result.videoUrl;
                    if (result.aspectRatio !== undefined) video.aspectRatio = result.aspectRatio;
                    if (result.duration !== undefined) {
                        video.duration = result.duration;
                        video.maxDuration = result.duration;
                    }
                    if (result.usePreviousSceneFrame !== undefined) video.usePreviousSceneFrame = result.usePreviousSceneFrame;
                    if (result.controlImageUrl !== undefined) video.controlImageUrl = result.controlImageUrl;
                    if (result.trimStart !== undefined) video.trimStart = result.trimStart;
                    this.saveData();
                    this.cd.detectChanges();
                    this.toastr.success('Đã lưu Prompt phân cảnh!');
                }
            }
        });
    }

    toggleVideoCompleted(video: any) {
        video.isCompleted = !video.isCompleted;
        this.saveData();
    }

    openBroadcastPreviewModal(): void {
        this.saveData();

        // 1. Thu thập toàn bộ phụ đề từ các Scene
        const allSubtitles: any[] = [];
        if (this.projectData && this.projectData.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        if (!sub.disabled && (sub.text || sub.originalText || sub.vietnameseText)) {
                            allSubtitles.push({
                                id: sub.id,
                                text: (sub.text || sub.originalText || sub.vietnameseText || '').trim(),
                                originalText: sub.originalText || (sub.translations && (sub.translations['original'] || sub.translations['en'])) || '',
                                vietnameseText: sub.vietnameseText || (sub.translations && sub.translations['vi']) || '',
                                translations: sub.translations || {},
                                startTime: sub.startTime || 0,
                                duration: sub.duration || 3
                            });
                        }
                    }
                }
            }
        }
        allSubtitles.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

        // 2. Tìm video URL và Online Source URL
        let videoUrl: string | null = null;
        let sourceUrl: string | null = null;

        if (this.projectData) {
            sourceUrl = this.projectData.sourceUrl || this.projectData.originalUrl || this.projectData.url || null;
            if (this.projectData.scenes) {
                for (const scene of this.projectData.scenes) {
                    if (scene.videos && scene.videos.length > 0) {
                        const firstVid = scene.videos.find((v: any) => v.videoUrl || v.sourceUrl);
                        if (firstVid) {
                            videoUrl = firstVid.videoUrl || null;
                            if (firstVid.sourceUrl) sourceUrl = firstVid.sourceUrl;
                            if (firstVid.originalUrl) sourceUrl = firstVid.originalUrl;
                            break;
                        }
                    }
                }
            }
        }

        if (!videoUrl && this.previewVideoUrl) {
            videoUrl = this.previewVideoUrl;
        }

        // 3. Tra cứu ngược từ downloadCache hoặc uuidMap để tìm URL Facebook / YouTube gốc
        if (!sourceUrl || !sourceUrl.startsWith('http')) {
            const downloadCache = this.multiAccountService.getItem('ai_type_video_download_cache') || {};
            for (const [origUrl, cachedPath] of Object.entries(downloadCache)) {
                if (origUrl.startsWith('http') && typeof cachedPath === 'string') {
                    if (videoUrl && (cachedPath === videoUrl || videoUrl.includes(cachedPath.replace(/^file:\/\//, '')) || (cachedPath.includes('video_') && videoUrl.includes(cachedPath.substring(cachedPath.indexOf('video_')))))) {
                        sourceUrl = origUrl;
                        break;
                    }
                }
            }
        }

        if (!sourceUrl || !sourceUrl.startsWith('http')) {
            const currentUuid = this.projectData?.uuid || this.data?.uuid;
            if (currentUuid) {
                try {
                    const allKeys = Object.keys(localStorage || {});
                    for (const k of allKeys) {
                        if (k.startsWith('ai_type_video_uuid_map')) {
                            const uMap = this.multiAccountService.getItem(k) || {};
                            for (const [origUrl, uId] of Object.entries(uMap)) {
                                if (uId === currentUuid && origUrl.startsWith('http')) {
                                    sourceUrl = origUrl;
                                    break;
                                }
                            }
                        }
                    }
                } catch (e) { }
            }
        }

        if (videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) && !videoUrl.includes('localhost') && !videoUrl.includes('127.0.0.1')) {
            sourceUrl = videoUrl;
        }

        this.dialog.open(BroadcastPreviewDialogComponent, {
            width: '96vw',
            maxWidth: '1240px',
            height: '88vh',
            maxHeight: '820px',
            panelClass: ['dark-broadcast-dialog', 'dialog-no-padding'],
            data: {
                title: this.projectData?.title || this.projectData?.extraPrompt || 'Phát sóng video',
                videoUrl: videoUrl || undefined,
                sourceUrl: sourceUrl || undefined,
                subtitles: allSubtitles,
                projectData: this.projectData
            }
        });
    }

    generateAllImages(): void {
        this.saveData();

        if (
            !this.projectData ||
            !this.projectData.scenes ||
            this.projectData.scenes.length === 0
        ) {
            this.toastr.warning('Không có cảnh nào để tạo audio!');
            return;
        }

        this.projectData['username'] = this.data.username || 'anonymous';

        this.alert({
            title: 'Khởi tạo Audio thành công!',
            message: `Hệ thống đã hoàn tất tạo âm thanh cho toàn bộ Video Timeline. <span class="font-medium text-blue-600">Bạn có muốn tiếp tục render Video không?</span>`,
            confirm: 'Tiếp tục Production',
            cb: () => {
                this.goBack();
                this.router.navigate(['/livestream', this.projectData.uuid || 'unknown_project']);
            },
            cc: () => {
                this.toastr.info('Hủy tiến trình tạo Audio.');
            },
        });
    }

    async prepareForVideoGeneration(silent: boolean = false) {
        if (!this.projectData || !this.projectData.scenes) {
            if (!silent) this.toastr.warning('Không có dữ liệu để rà soát!');
            return;
        }

        if (!silent) this.toastr.info('Đang rà soát và cập nhật thời lượng các file audio...', 'Hệ thống');

        if (!(window as any).electron) {
            this.toastr.warning('Tính năng scan file chỉ hoạt động trên App Desktop.');
        }

        const projectSubPath = `${this.data.username || 'anonymous'}/${this.data.uuid || 'default'}`;
        const promises: Promise<void>[] = [];
        let updatedCount = 0;

        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (!scene.subtitles) continue;

            for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                const sub = scene.subtitles[subIdx];

                // Nếu chưa có audioUrl, thử tìm kiếm dưới local
                if (!sub.audioUrl && sub.text && sub.text.trim() !== '' && (window as any).electron) {
                    const globalIndex = this.getGlobalIndex(sceneIdx, subIdx);
                    const prefix = globalIndex.toString().padStart(3, '0');
                    const shortText = sub.text.substring(0, 50);
                    const slug = this.toSlug(shortText);

                    const possibleFilenames = [
                        `${prefix}_${slug}.mp3`,
                        `${prefix}_${slug}.wav`,
                        `${prefix}_${slug}_ausync.mp3`,
                        `${prefix}_${slug}_ausync.wav`
                    ];

                    for (const fname of possibleFilenames) {
                        try {
                            const payload = {
                                username: projectSubPath,
                                filename: fname
                            };
                            const result = await (window as any).electron.invoke('check-local-file-exists', payload);

                            if (result && result.exists) {
                                sub.audioUrl = result.path.startsWith('file://') ? result.path : `file://${result.path}`;
                                break;
                            }
                        } catch (e) { }
                    }
                }

                if (sub.audioUrl) {
                    const p = new Promise<void>((resolve) => {
                        const audioObj = new Audio(this.getRawMediaUrl(sub.audioUrl) as string);
                        audioObj.addEventListener('loadedmetadata', () => {
                            sub.duration = audioObj.duration;
                            sub.maxDuration = sub.duration;
                            updatedCount++;
                            resolve();
                        });
                        audioObj.addEventListener('error', () => {
                            console.error('Không thể load audio:', sub.audioUrl);
                            // Xóa URL nếu file không tồn tại
                            sub.audioUrl = null;
                            sub.duration = 0;
                            resolve();
                        });
                    });
                    promises.push(p);
                }
            }
        }

        if (promises.length > 0) {
            await Promise.all(promises);
            this.saveData();
            if (!silent) this.toastr.success(`Đã quét và cập nhật thời lượng cho ${updatedCount} file audio thành công!`);
        } else {
            if (!silent) this.toastr.warning('Không tìm thấy file audio nào để rà soát.');
            this.saveData();
        }
    }

    toSlug(str: string): string {
        str = str || '';
        str = str.toLowerCase();
        str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        str = str.replace(/[đĐ]/g, 'd');
        str = str.replace(/(\s+)/g, '-');
        str = str.replace(/^-+|-+$/g, '');
        return str;
    }

    hasUnsavedChanges: boolean = false;

    isSaving: boolean = false;

    markDirty() {
        this.hasUnsavedChanges = true;
        this.cd.detectChanges();
    }

    async saveData(force: boolean = false) {
        const executeSave = async () => {
            const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
            await this.multiAccountService.setItem(storageKey, this.projectData);
            if (force) {
                await this.multiAccountService.forceSave();
            }
            this.hasUnsavedChanges = false;
            this.cd.detectChanges();
        };

        if (force) {
            if (this.isSaving) return;
            this.isSaving = true;
            this.cd.detectChanges();

            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
                this.saveTimeout = null;
            }

            try {
                await executeSave();
                this.toastr.success('Đã lưu!');
            } catch (err: any) {
                console.error('[SaveData] Lỗi lưu:', err);
                this.toastr.error('Lỗi khi lưu dữ liệu: ' + (err?.message || err));
            } finally {
                setTimeout(() => {
                    this.isSaving = false;
                    this.cd.detectChanges();
                }, 300);
            }
        } else {
            // Đánh dấu cần lưu trong RAM mà không ghi đĩa / DB liên tục gây lag
            this.markDirty();
        }
    }

    close() {
        this.goBack();
    }

    trackByScene(index: number, scene: any): any {
        return scene;
    }

    async onFileSelected(event: any, scene: any, video: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];

            try {
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình.');
                    return;
                }

                const originalPath = electron.getPathForFile(file);

                if (!originalPath) {
                    this.toastr.error('Không thể xác nhận đường dẫn file tải về.');
                    return;
                }

                const uuid = this.projectData?.uuid || this.data?.uuid;
                const customDir = uuid ? `tts/admin/${uuid}` : undefined;
                const localFilePath = await electron.selectLocalFile(originalPath, customDir);
                const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;

                if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|avi|mov)$/i)) {
                    video.videoUrl = finalPath;
                    const videoObj = document.createElement('video');
                    videoObj.src = this.getRawMediaUrl(video.videoUrl) as string;
                    videoObj.addEventListener('loadedmetadata', () => {
                        if (videoObj.duration && !isNaN(videoObj.duration)) {
                            video.duration = parseFloat(videoObj.duration.toFixed(1));
                            video.maxDuration = video.duration;
                        }
                    });
                } else {
                    video.imageUrl = finalPath;
                }

                video.isCompleted = true;
                this.saveData();
                this.cd.detectChanges();
                setTimeout(() => this.updateLines(), 150);
                this.toastr.success('Đã tải file thành công!');
            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    async addNewMediaBlock(type: 'video' | 'image' | 'audio') {
        const electronApi = (window as any).electron;
        if (!electronApi || !electronApi.getPathForFile) {
            this.toastr.error('Lỗi cấu hình. Tính năng này chỉ dùng trên App Desktop.');
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        if (type === 'video') {
            input.accept = 'video/*';
        } else if (type === 'image') {
            input.accept = 'image/*';
        } else {
            input.accept = 'audio/*';
        }

        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const originalPath = electronApi.getPathForFile(file);
            if (!originalPath) {
                this.toastr.error('Không thể xác nhận đường dẫn file.');
                return;
            }

            this.toastr.info('Đang xử lý file, vui lòng đợi...');

            const uuid = this.projectData?.uuid || this.data?.uuid;
            const customDir = uuid ? `tts/admin/${uuid}` : undefined;
            const localFilePath = await electronApi.selectLocalFile(originalPath, customDir);
            const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;

            if (!this.projectData) this.projectData = { scenes: [] };
            if (!this.projectData.scenes || this.projectData.scenes.length === 0) {
                this.projectData.scenes.push({
                    id: `scene_${Date.now()}`,
                    subtitles: [],
                    videos: [],
                    prompt: ''
                });
            }

            // Mặc định ném vào scene cuối cùng
            const scene = this.projectData.scenes[this.projectData.scenes.length - 1];

            if (type === 'image') {
                if (!scene.images) scene.images = [];
                let maxStart = 0;
                scene.images.forEach((img: any) => {
                    const end = (img.startTime || 0) + (img.duration || 5);
                    if (end > maxStart) maxStart = end;
                });

                const newImage: any = {
                    id: Date.now(),
                    imageUrl: finalPath,
                    title: file.name || ('Hình ảnh ' + (scene.images.length + 1)),
                    startTime: maxStart,
                    duration: 5,
                    type: 'image'
                };

                scene.images.push(newImage);
                this.setActiveItem(newImage);
                this.previewImageUrl = finalPath;
                this.previewVideoUrl = null;
                this.updateTimelineTotalWidth();
                this.updateRulerTicks();
                this.normalizeData();
                this.saveData(true);
                this.cd.detectChanges();
                setTimeout(() => {
                    this.autoScanAndLoadCompanionAssets();
                    this.updateLines();
                }, 100);
            } else if (type === 'video') {
                if (!scene.videos) scene.videos = [];
                let maxStart = 0;
                scene.videos.forEach((v: any) => {
                    const end = (v.startTime || 0) + (v.duration || 0);
                    if (end > maxStart) maxStart = end;
                });

                let realDur = 5;
                if (electronApi.getMediaDuration) {
                    try {
                        const durRes = await electronApi.getMediaDuration(finalPath);
                        if (durRes && durRes.success && durRes.duration > 0) {
                            realDur = Math.round(durRes.duration * 10) / 10;
                        }
                    } catch (e) {}
                }

                const newVideo: any = {
                    id: `video_${Date.now()}`,
                    prompt: '',
                    startTime: maxStart,
                    duration: realDur,
                    maxDuration: realDur,
                    videoUrl: finalPath,
                    isCompleted: true
                };

                scene.videos.push(newVideo);
                this.setActiveItem(newVideo);
                this.previewVideoUrl = newVideo.videoUrl || null;
                this.previewImageUrl = null;
                this.normalizeData();
                this.saveData(true);
                this.cd.detectChanges();
                setTimeout(() => {
                    this.autoScanAndLoadCompanionAssets();
                    this.updateLines();
                }, 100);
            } else {
                if (!scene.subtitles) scene.subtitles = [];
                let maxStart = 0;
                scene.subtitles.forEach((s: any) => {
                    const end = (s.startTime || 0) + (s.duration || 0);
                    if (end > maxStart) maxStart = end;
                });

                const newSub: any = {
                    id: `sub_${Date.now()}`,
                    text: 'Audio tùy chỉnh',
                    startTime: maxStart,
                    duration: 5,
                    maxDuration: 5,
                    audioUrl: finalPath
                };
                
                const audioObj = document.createElement('audio');
                audioObj.src = this.getRawMediaUrl(finalPath) as string;
                audioObj.addEventListener('loadedmetadata', () => {
                    if (audioObj.duration && !isNaN(audioObj.duration)) {
                        newSub.duration = parseFloat(audioObj.duration.toFixed(1));
                        newSub.maxDuration = newSub.duration;
                        this.saveData(true);
                        this.cd.detectChanges();
                    }
                });

                scene.subtitles.push(newSub);
            }

            this.saveData(true);
            this.cd.detectChanges();
            setTimeout(() => this.updateLines(), 150);
            this.toastr.success('Đã thêm file thành công!');
        };

        input.click();
    }

    async addOnlineVideoBlock() {
        const url = prompt('Nhập link video Online (Facebook Reel/Video, YouTube, TikTok...):');
        if (!url || !url.trim()) return;

        const electronApi = (window as any).electron;
        if (!electronApi) {
            this.toastr.error('Tính năng lấy luồng Online yêu cầu chạy trên ứng dụng Desktop.');
            return;
        }

        this.toastr.info('Đang phân tích link và trích xuất luồng video trực tiếp...', 'Vui lòng đợi', { timeOut: 10000 });

        try {
            const res = electronApi.extractOnlineVideoStream 
                ? await electronApi.extractOnlineVideoStream(url.trim())
                : await electronApi.invoke('extract-online-video-stream', url.trim());

            if (!res || !res.success || !res.streamUrl) {
                this.toastr.error(res?.error || 'Không thể trích xuất luồng video từ link này.');
                return;
            }

            if (!this.projectData) this.projectData = { scenes: [] };
            if (!this.projectData.scenes || this.projectData.scenes.length === 0) {
                this.projectData.scenes.push({
                    id: `scene_${Date.now()}`,
                    subtitles: [],
                    videos: [],
                    prompt: ''
                });
            }

            const scene = this.projectData.scenes[this.projectData.scenes.length - 1];
            if (!scene.videos) scene.videos = [];

            let maxStart = 0;
            scene.videos.forEach((v: any) => {
                const end = (v.startTime || 0) + (v.duration || 0);
                if (end > maxStart) maxStart = end;
            });

            const newVideo: any = {
                id: `video_${Date.now()}`,
                prompt: res.title || 'Online Video',
                startTime: maxStart,
                duration: res.duration || 10,
                maxDuration: res.duration || 10,
                videoUrl: res.streamUrl,
                sourceUrl: url.trim(),
                isOnlineStream: true,
                isCompleted: true
            };

            if (!scene.videos) scene.videos = [];
            scene.videos.push(newVideo);
            this.activeItem = newVideo;
            this.previewVideoUrl = res.streamUrl;
            this.previewImageUrl = null;

            this.saveData(true);
            this.cd.detectChanges();
            this.updateLines();

            this.toastr.success(`Đã kết nối video Online: "${res.title || 'Video'}" (${res.duration}s)!`, 'Thành công');
        } catch (e: any) {
            this.toastr.error('Lỗi: ' + (e.message || e));
        }
    }

    parseSrtContent(srtText: string): Array<{ text: string, startTime: number, duration: number }> {
        const results: Array<{ text: string, startTime: number, duration: number }> = [];
        if (!srtText) return results;

        const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = normalized.split(/\n\s*\n/);

        const parseTimestampToSeconds = (timeStr: string): number => {
            const parts = timeStr.trim().split(':');
            if (parts.length < 3) return 0;
            const hours = parseFloat(parts[0]) || 0;
            const minutes = parseFloat(parts[1]) || 0;
            const secParts = parts[2].split(/[,\.]/);
            const seconds = parseFloat(secParts[0]) || 0;
            const ms = parseFloat(secParts[1] || '0') || 0;
            return hours * 3600 + minutes * 60 + seconds + (ms / 1000);
        };

        for (const block of blocks) {
            const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            let timeLineIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('-->')) {
                    timeLineIndex = i;
                    break;
                }
            }

            if (timeLineIndex === -1) continue;

            const timeLine = lines[timeLineIndex];
            const [startStr, endStr] = timeLine.split('-->');
            if (!startStr || !endStr) continue;

            const startSec = parseTimestampToSeconds(startStr);
            const endSec = parseTimestampToSeconds(endStr);
            const duration = Math.max(0.1, parseFloat((endSec - startSec).toFixed(2)));

            const textLines = lines.slice(timeLineIndex + 1);
            const text = textLines.join(' ').replace(/<[^>]*>/g, '').trim();

            if (text) {
                results.push({
                    text,
                    startTime: parseFloat(startSec.toFixed(2)),
                    duration
                });
            }
        }
        return results;
    }

    importSrtFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.srt,.vtt,.txt';

        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event: any) => {
                const content = event.target.result;
                const parsedSubs = this.parseSrtContent(content);
                if (!parsedSubs || parsedSubs.length === 0) {
                    this.toastr.error('Không tìm thấy nội dung phụ đề hợp lệ trong file SRT.');
                    return;
                }

                if (!this.projectData) this.projectData = { scenes: [] };
                if (!this.projectData.scenes || this.projectData.scenes.length === 0) {
                    this.projectData.scenes.push({
                        id: `scene_${Date.now()}`,
                        subtitles: [],
                        videos: [],
                        prompt: ''
                    });
                }

                const scene = this.projectData.scenes[0];
                if (!scene.subtitles) scene.subtitles = [];

                const newItems = parsedSubs.map((sub, idx) => ({
                    id: Date.now() + idx,
                    text: sub.text,
                    startTime: sub.startTime,
                    duration: sub.duration,
                    maxDuration: sub.duration
                }));

                scene.subtitles = newItems;
                this.saveData(true);
                this.cd.detectChanges();
                this.updateLines();
                this.toastr.success(`Đã nạp thành công ${newItems.length} câu phụ đề từ file SRT!`, 'Thành công');
            };
            reader.readAsText(file, 'utf-8');
        };
        input.click();
    }

    clearVideoMedia(video: any) {
        video.imageUrl = null;
        video.videoUrl = null;
        video.isCompleted = false;
        video.maxDuration = undefined;
        this.saveData();
        this.cd.detectChanges();
    }

    async splitVideoScenesAI(video: any, scene: any, sceneIdx: number, vIdx: number) {
        if (!video || !video.videoUrl) {
            this.toastr.warning('Không tìm thấy đường dẫn video để phân tích phân cảnh.');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.invoke) {
            this.toastr.error('Tính năng yêu cầu môi trường Desktop Electron.');
            return;
        }

        video.isAnalyzingScenes = true;
        this.isProcessing = true;
        this.processingStatusTitle = 'Đang phân tích phân cảnh video bằng AI...';
        this.processingStatusMessage = 'Hệ thống đang trích xuất khung hình và gọi AI để nhận diện các chuyển cảnh (shots / scenes)...';
        this.cd.detectChanges();
        this.toastr.info('Đang trích xuất khung hình video để AI phân tích phân cảnh...', 'AI đang xử lý', { timeOut: 8000 });

        try {
            let originalPath = video.videoUrl;
            if (originalPath.startsWith('media://')) {
                originalPath = decodeURIComponent(originalPath.substring(8));
            } else if (originalPath.startsWith('file://')) {
                originalPath = decodeURIComponent(originalPath.substring(7));
            }
            if (originalPath.match(/^\/[a-zA-Z]:[\\/]/)) {
                originalPath = originalPath.substring(1);
            }

            const clipTrimStart = Number(video.trimStart) || 0;
            const clipDuration = Number(video.duration) || 10;
            const videoStart = (video.startTime !== undefined && video.startTime !== null && !isNaN(video.startTime)) ? Number(video.startTime) : 0;
            const originalMaxDuration = Number(video.maxDuration) || clipDuration;

            // 1. Trích xuất frames và mốc thời gian từ FFmpeg
            const extractRes = await electron.invoke('detect-video-scenes-and-frames', {
                videoPath: originalPath,
                startTime: clipTrimStart,
                duration: clipDuration
            });

            if (!extractRes || !extractRes.success || !extractRes.frames || extractRes.frames.length === 0) {
                throw new Error('Không trích xuất được khung hình từ video');
            }

            const frames = extractRes.frames || [];
            const actualDuration = Number(extractRes.totalDuration) || clipDuration;
            const naturalScenes: any[] = extractRes.scenes || [];

            this.toastr.info(`Đã phát hiện ${naturalScenes.length} phân cảnh tự nhiên. Đang gửi cho Gemini AI phân tích nội dung và góc quay...`, 'AI Vision', { timeOut: 10000 });

            // 2. Chuẩn bị ảnh gửi Gemini AI để sinh Prompt cho từng phân cảnh tự nhiên
            const maxFramesToSend = Math.min(24, frames.length);
            const step = Math.max(1, Math.floor(frames.length / maxFramesToSend));
            const selectedFrames: any[] = [];
            for (let i = 0; i < frames.length; i += step) {
                selectedFrames.push(frames[i]);
                if (selectedFrames.length >= maxFramesToSend) break;
            }

            const prompt = `Bạn là chuyên gia phân tích thị giác và đạo diễn điện ảnh AI.
Dưới đây là các khung hình đại diện cho các phân cảnh tự nhiên vừa được bóc tách từ video (tổng thời lượng ${actualDuration.toFixed(2)}s):
${selectedFrames.map((f, idx) => `- Ảnh ${idx + 1}: tại ${f.timestamp.toFixed(2)}s (thời lượng phân cảnh: ${(f.duration || 5).toFixed(1)}s)`).join('\n')}

NHIỆM VỤ:
Với mỗi khung hình gửi kèm, hãy quan sát bối cảnh, nhân vật, hành động, ánh sáng để viết mô tả điện ảnh:
1. "prompt": Mô tả chi tiết phân cảnh bằng tiếng Việt điện ảnh sống động (bối cảnh, nhân vật, hành động, ánh sáng, góc quay) kèm prompt tiếng Anh ngắn gọn.
2. "cameraMovement": Góc quay / Chuyển động máy (ví dụ: "Toàn cảnh góc rộng", "Cận cảnh nhân vật", "Lia máy", "Dolly zoom", "Camera tĩnh").

TRẢ VỀ DUY NHẤT MẢNG JSON CÓ CẤU TRÚC:
[
  {
    "index": 0,
    "prompt": "Cận cảnh nhân vật kiếm sĩ bí ẩn với mái tóc buông xõa trong màn đêm sương mù. (Cinematic close-up of mysterious lone swordsman in misty night)",
    "cameraMovement": "Close-up, slow pan"
  }
]`;

            const parts: any[] = [{ text: prompt }];
            for (const f of selectedFrames) {
                if (f.base64) {
                    parts.push({
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: f.base64
                        }
                    });
                }
            }

            let aiDescriptions: any[] = [];

            try {
                const response: any = await this._genaiService.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: parts }],
                    config: {
                        maxOutputTokens: 8192,
                        temperature: 0.2,
                        responseMimeType: 'application/json',
                        skipTTS: true,
                        maxTurns: 1,
                        systemInstruction: 'Bạn là chuyên gia phân tích thị giác video. Hãy mô tả điện ảnh cho từng khung hình phân cảnh được cung cấp.'
                    } as any
                });

                let rawText = '';
                if (typeof response === 'string') rawText = response;
                else if ((response as any)?.text) rawText = typeof (response as any).text === 'function' ? (response as any).text() : (response as any).text;
                else if ((response as any)?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    rawText = (response as any).candidates[0].content.parts[0].text;
                }

                console.log('[SplitVideoScenesAI] Phản hồi AI:', rawText);
                const cleanText = (rawText || '').replace(/```json/gi, '').replace(/```/g, '').trim();
                let parsed: any = null;
                try {
                    parsed = JSON.parse(cleanText);
                } catch (e) {
                    const sArr = cleanText.indexOf('[');
                    const eArr = cleanText.lastIndexOf(']');
                    if (sArr >= 0 && eArr > sArr) {
                        try { parsed = JSON.parse(cleanText.substring(sArr, eArr + 1)); } catch (e2) {}
                    }
                }
                if (Array.isArray(parsed)) {
                    aiDescriptions = parsed;
                }
            } catch (aiErr) {
                console.error('[SplitVideoScenesAI] Lỗi gọi AI vision:', aiErr);
            }

            // Gán mô tả AI vào từng phân cảnh tự nhiên
            let detectedScenes: Array<{ startTime: number, endTime: number, prompt: string, cameraMovement?: string, keyframeIndex?: number }> = [];

            if (naturalScenes.length > 0) {
                detectedScenes = naturalScenes.map((sc, i) => {
                    // Tìm mô tả AI gần nhất
                    const desc = aiDescriptions.find(d => d.index === i) || aiDescriptions[Math.min(aiDescriptions.length - 1, Math.floor((i / naturalScenes.length) * aiDescriptions.length))];
                    return {
                        startTime: sc.startTime,
                        endTime: sc.endTime,
                        prompt: desc?.prompt ? String(desc.prompt).trim() : `Phân cảnh ${i + 1}: ${video.prompt || 'Đoạn video gốc'} (${sc.startTime}s - ${sc.endTime}s)`,
                        cameraMovement: desc?.cameraMovement ? String(desc.cameraMovement).trim() : 'Cinematic shot',
                        keyframeIndex: i
                    };
                });
            } else {
                // Fallback nếu không có naturalScenes
                detectedScenes = [{
                    startTime: 0,
                    endTime: actualDuration,
                    prompt: video.prompt || 'Phân cảnh gốc',
                    cameraMovement: 'Cinematic shot',
                    keyframeIndex: 0
                }];
            }

            // Sắp xếp và đảm bảo nối liền mạch
            detectedScenes.sort((a, b) => a.startTime - b.startTime);
            detectedScenes[0].startTime = 0;
            detectedScenes[detectedScenes.length - 1].endTime = actualDuration;
            for (let i = 0; i < detectedScenes.length - 1; i++) {
                detectedScenes[i + 1].startTime = detectedScenes[i].endTime;
            }

            this.processingStatusMessage = 'AI đã phân tích xong. FFmpeg đang cắt video thành các clip phân cảnh riêng biệt kèm âm thanh...';
            this.cd.detectChanges();

            let splitClipsRes: any = null;
            try {
                splitClipsRes = await electron.invoke('split-video-clips-ffmpeg', {
                    videoPath: originalPath,
                    scenes: detectedScenes
                });
                console.log('[SplitVideoScenesAI] Cắt video thành công:', splitClipsRes);
            } catch (cutErr) {
                console.warn('[SplitVideoScenesAI] Cắt video bằng FFmpeg thất bại, dùng clip tham chiếu:', cutErr);
            }

            // 3. Tạo các khối video blocks mới
            const newVideoBlocks: any[] = [];
            for (let i = 0; i < detectedScenes.length; i++) {
                const sc = detectedScenes[i];
                const scDur = Math.max(0.3, Math.round((sc.endTime - sc.startTime) * 100) / 100);
                const scStart = Math.round((videoStart + sc.startTime) * 100) / 100;
                const clipObj = splitClipsRes?.clips?.[i];

                // Chọn ảnh thumbnail
                let chosenThumbUrl = clipObj?.imageUrl || video.imageUrl || null;
                if (!chosenThumbUrl) {
                    const targetFrame = frames[sc.keyframeIndex ?? 0] || frames[Math.min(frames.length - 1, Math.floor((i / detectedScenes.length) * frames.length))];
                    if (targetFrame && targetFrame.url) {
                        chosenThumbUrl = targetFrame.url;
                    }
                }

                newVideoBlocks.push({
                    id: Date.now() + i,
                    videoUrl: clipObj?.videoUrl || video.videoUrl,
                    imageUrl: chosenThumbUrl,
                    prompt: sc.prompt || `Phân cảnh ${i + 1}`,
                    cameraMovement: sc.cameraMovement || '',
                    startTime: scStart,
                    duration: clipObj ? clipObj.duration : scDur,
                    maxDuration: clipObj ? clipObj.duration : originalMaxDuration,
                    trimStart: clipObj ? 0 : Math.round((clipTrimStart + sc.startTime) * 100) / 100,
                    trimEnd: clipObj ? clipObj.duration : Math.round((clipTrimStart + sc.endTime) * 100) / 100,
                    muted: video.muted || false,
                    isAiSplitScene: true,
                    sceneIndex: i + 1
                });
            }

            // 4. Thay thế video clip cũ bằng danh sách các video clip phân cảnh mới
            if (scene && scene.videos && Array.isArray(scene.videos)) {
                const targetIdx = (vIdx !== undefined && vIdx >= 0) ? vIdx : scene.videos.indexOf(video);
                if (targetIdx >= 0) {
                    scene.videos.splice(targetIdx, 1, ...newVideoBlocks);
                } else {
                    scene.videos = newVideoBlocks;
                }
            }

            // 5. Cập nhật dữ liệu & Timeline
            this.normalizeData();
            this.saveData(true);
            this.cd.markForCheck();
            this.cd.detectChanges();
            setTimeout(() => {
                this.updateLines();
                this.initWaveSurfers();
                this.cd.detectChanges();
            }, 200);

            this.toastr.success(`AI đã phân tích và chia video thành ${newVideoBlocks.length} phân cảnh chi tiết!`, 'Bóc tách phân cảnh thành công', { timeOut: 7000 });
        } catch (err: any) {
            console.error('[SplitVideoScenesAI] Lỗi:', err);
            this.toastr.error('Lỗi khi bóc tách phân cảnh video: ' + (err?.message || err));
        } finally {
            video.isAnalyzingScenes = false;
            this.isProcessing = false;
            this.processingStatusTitle = '';
            this.processingStatusMessage = '';
            this.cd.detectChanges();
        }
    }

    magicKlingV3(video: any, scene: any, sceneIdx: number, vIdx: number) {
        const dialogRef = this.dialog.open(MagicKlingPromptDialogComponent, {
            width: '680px',
            data: { prompt: video.prompt || '', attachmentUrl: video.aiReferenceImageLocalUrl || null }
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (!result || result.prompt === undefined) return; // User cancelled
            
            // Update the prompt
            video.prompt = result.prompt.trim();
            if (result.attachmentUrl) {
                video.aiReferenceImageLocalUrl = result.attachmentUrl;
            } else {
                video.aiReferenceImageLocalUrl = null;
            }
            
            // Mock AI processing
            await this.processMagicKlingV3(video, scene, sceneIdx, vIdx);
        });
    }

    async processMagicKlingV3(video: any, scene: any, sceneIdx: number, vIdx: number) {
        const electronApi = (window as any).electron;
        if (!electronApi || !video.videoUrl) return;

        this.toastr.info('Hệ thống đang trích xuất frame để gửi cho AI...', 'Đang xử lý');
        
        try {
            const extractPayload = { 
                videoPath: video.videoUrl, 
                startTime: video.trimStart || 0,
                duration: video.duration 
            };
            const extractResult = await electronApi.invoke('extract-video-frames', extractPayload);
            
            if (extractResult && extractResult.success && extractResult.paths.length > 0) {
                const fps = extractResult.fps || 1;
                const firstFramePath = extractResult.paths[0].replace('file://', '');
                const dirPath = firstFramePath.substring(0, Math.max(firstFramePath.lastIndexOf('/'), firstFramePath.lastIndexOf('\\')));
                
                this.toastr.info(`Đã trích xuất ${extractResult.paths.length} frame. Đang gửi cho Hệ thống AI (3 Tầng) xử lý từng frame một...`, 'Đang xử lý', { timeOut: 5000 });
                
                // Chuẩn bị ảnh tham khảo (Reference Image)
                let referenceBase64 = null;
                if (video.aiReferenceImageLocalUrl) {
                    try {
                        referenceBase64 = await this.getBase64FromImageUrl(video.aiReferenceImageLocalUrl);
                    } catch (e) {
                        console.error("Lỗi đọc ảnh reference:", e);
                    }
                }
                
                const prompt = video.prompt || "Thực hiện face swap hoặc thay đổi chi tiết như yêu cầu.";
                let successCount = 0;

                // Xử lý từng frame bằng AI 3 Tầng thông qua GenaiService
                if (this._genaiService) {
                    for (let i = 0; i < extractResult.paths.length; i++) {
                        try {
                            const pathStr = extractResult.paths[i];
                            const frameBase64 = await this.getBase64FromImageUrl(pathStr.startsWith('file://') ? pathStr : 'file://' + pathStr);
                            
                            const parts: any[] = [{ text: prompt }];
                            
                            // 1. Ảnh frame gốc cần sửa (LUÔN ĐỨNG TRƯỚC ĐỂ LÀM BASE IMAGE TRONG IMAGE-TO-IMAGE)
                            parts.push({
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: frameBase64
                                }
                            });
                            
                            // 2. Ảnh tham khảo (Control Image / Face)
                            if (referenceBase64) {
                                parts.push({
                                    inlineData: {
                                        mimeType: 'image/png',
                                        data: referenceBase64
                                    }
                                });
                            }
                            
                            // Gọi Tầng AI cao nhất đang được cấu hình
                            const response = await this._genaiService.generateContent({
                                model: 'gemini-3.6-flash', // Tự động fallback trong service
                                contents: [{ role: 'user', parts: parts }],
                                config: {
                                    responseModalities: ['IMAGE']
                                } as any
                            });
                            
                            let editedBase64 = null;
                            if (response.candidates && response.candidates.length > 0) {
                                for (const part of response.candidates[0].content.parts) {
                                    if (part.inlineData) {
                                        editedBase64 = part.inlineData.data;
                                        break;
                                    }
                                }
                            }
                            
                            if (editedBase64) {
                                await electronApi.invoke('overwrite-file-base64', {
                                    filePath: pathStr,
                                    base64: editedBase64
                                });
                                successCount++;
                                if (i % 5 === 0) {
                                    this.toastr.info(`Đã AI hóa xong frame ${i + 1}/${extractResult.paths.length}...`);
                                }
                            } else {
                                console.warn(`AI không trả về ảnh cho frame ${i + 1}`);
                            }
                        } catch (frameErr: any) {
                            console.error(`Lỗi xử lý frame ${i + 1}:`, frameErr);
                        }
                    }
                } else {
                    this.toastr.warning("Hệ thống AI không khả dụng. Bỏ qua chỉnh sửa.");
                }
                
                this.toastr.info(`Đã AI hóa thành công ${successCount}/${extractResult.paths.length} frames. Đang gộp lại thành video...`);
                
                const mergePayload = { dirPath, fps };
                const mergeResult = await electronApi.invoke('merge-frames-to-video', mergePayload);
                
                if (mergeResult && mergeResult.success) {
                    let finalUrl = mergeResult.videoPath;
                    if (!finalUrl.startsWith('file://')) {
                        finalUrl = `file://${finalUrl.replace(/\\/g, '/')}`;
                    }
                    
                    // Cập nhật video block
                    video.videoUrl = finalUrl;
                    video.magicKlingApplied = true;
                    video.trimStart = 0;
                    video.trimEnd = undefined;
                    video.maxDuration = undefined;
                    
                    this.normalizeData();
                    this.saveData(true);
                    this.cd.detectChanges();
                    setTimeout(() => this.updateLines(), 200);
                    
                    this.toastr.success('Hoàn tất! Video đã được AI (3 Tầng) tái tạo xong!');
                }
            } else {
                console.error("extractResult:", extractResult);
                this.toastr.error('Không thể trích xuất khung hình. Chi tiết: ' + JSON.stringify(extractResult));
            }
        } catch (err: any) {
            console.error('Lỗi quy trình Magic Kling:', err);
            this.toastr.error('Có lỗi xảy ra: ' + (err.message || String(err)));
        }
    }

    isImageType(url: string): boolean {
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        ];
        let cleanUrl = url.replace('file://', '').replace('media://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    selectedSceneIndex: number = -1;

    addNode(insertAfterIndex: number, type: string) {
        if (!this.projectData) this.projectData = { scenes: [] };
        if (!this.projectData.scenes) this.projectData.scenes = [];

        const newScene = {
            id: `manual_${Date.now()}`,
            subtitles: [],
            prompt: '',
            imageUrl: null,
            type: type,
            videos: [{
                id: 1,
                prompt: '',
                imageUrl: null,
                duration: 5,
                maxDuration: 5,
                referenceType: type === 'first_frame' ? 'START_FRAME' : (type === 'last_frame' ? 'END_FRAME' : undefined)
            }]
        };

        if (insertAfterIndex !== undefined && insertAfterIndex >= 0) {
            this.projectData.scenes.splice(insertAfterIndex + 1, 0, newScene);
        } else {
            this.projectData.scenes.push(newScene);
        }
        
        this.saveData();
        this.cd.detectChanges();
    }

    addNewScene(insertAfterIndex?: number) {
        const dialogRef = this.dialog.open(AddSceneComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            disableClose: true,
            data: {
                selectedClip: null,
                prompt: '',
                characters: this.projectData?.characters || [],
                masterPrompt: this.projectData?.masterPrompt || '',
                availableClips: this.allClips
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.selectedClip && result.prompt) {
                const clip = result.selectedClip;
                const formattedSubtitles = [
                    {
                        id: clip.id,
                        text: clip.description,
                        duration: clip.duration || 0,
                        maxDuration: clip.duration || 0,
                        audioUrl: clip.localFilePath ? `file://${clip.localFilePath.replace(/\\/g, '/')}` : null
                    }
                ];

                const totalDuration = clip.duration || 8;

                const newScene = {
                    id: `manual_${Date.now()}`,
                    subtitles: formattedSubtitles,
                    prompt: result.prompt.trim(),
                    imageUrl: null,
                    videos: [{
                        id: 1,
                        prompt: result.prompt.trim(),
                        imageUrl: null,
                        duration: totalDuration,
                        maxDuration: totalDuration
                    }]
                };

                if (!this.projectData) this.projectData = { scenes: [] };
                if (!this.projectData.scenes) this.projectData.scenes = [];

                let targetIndex = this.projectData.scenes.length;
                
                if (insertAfterIndex !== undefined && insertAfterIndex !== null) {
                    targetIndex = insertAfterIndex + 1;
                } else if (this.activeItem) {
                    // activeItem is the raw video/audio object, find its scene index
                    for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                        const s = this.projectData.scenes[sIdx];
                        if ((s.videos && s.videos.includes(this.activeItem)) ||
                            (s.subtitles && s.subtitles.includes(this.activeItem)) ||
                            (s.extractedAudios && s.extractedAudios.includes(this.activeItem))) {
                            targetIndex = sIdx + 1; // Insert AFTER the scene containing the active item
                            break;
                        }
                    }
                }

                if (targetIndex < this.projectData.scenes.length) {
                    this.projectData.scenes.splice(targetIndex, 0, newScene);
                } else {
                    this.projectData.scenes.push(newScene);
                }

                // Cập nhật lại thời gian cho các cảnh do đã chèn vào giữa
                this.normalizeData();
                this.saveData();

                // Tự động focus vào video mới tạo
                setTimeout(() => {
                    this.setActiveItem(newScene.videos[0]);
                    this.currentTimelineTime = (newScene.videos[0] as any).startTime || 0;
                    this.updateTimelineSync();
                    this.cd.detectChanges();
                }, 100);
                this.toastr.success('Đã thêm Scene mới thành công!');

                setTimeout(() => {
                    const el = this.scrollContainer.elementRef.nativeElement;
                    const startX = ((newScene.videos[0] as any).startTime || 0) * this.pixelsPerSecond;
                    // Chỉ scroll nếu điểm bắt đầu nằm ngoài màn hình
                    if (startX < el.scrollLeft || startX > el.scrollLeft + el.clientWidth) {
                        el.scrollLeft = Math.max(0, startX - 100); // 100px padding
                    }
                    this.updateLines();
                }, 100);
            }
        });
    }

    isAudioMuted(audio: any, scene?: any): boolean {
        if (!audio) return false;
        if (audio.muted || audio.disabled) return true;
        const parentScene = scene || (this.projectData?.scenes ? this.projectData.scenes.find((s: any) => s.extractedAudios && s.extractedAudios.includes(audio)) : null);
        if (parentScene && parentScene.videos) {
            const start = audio.startTime || 0;
            const end = start + (audio.duration || 5);
            const cov = parentScene.videos.find((v: any) => {
                const vStart = v.startTime || 0;
                const vEnd = vStart + (v.duration || 5);
                return (start >= vStart - 0.05 && start < vEnd) || (end > vStart && end <= vEnd + 0.05);
            });
            if (cov && (cov.muted || cov.disabled)) return true;
        }
        return false;
    }

    toggleMute(video: any) {
        if (!video) return;
        video.muted = !video.muted;

        const vStart = video.startTime || 0;
        const vEnd = vStart + (video.duration || 5);

        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos && scene.videos.includes(video) && scene.extractedAudios) {
                    for (const audio of scene.extractedAudios) {
                        const aStart = audio.startTime || 0;
                        const aEnd = aStart + (audio.duration || 5);
                        if ((aStart >= vStart - 0.05 && aStart < vEnd) || (aEnd > vStart && aEnd <= vEnd + 0.05)) {
                            audio.muted = video.muted;
                        }
                    }
                }
            }
        }

        // Tạm dừng ngay lập tức bất kỳ wavesurfer nào đang phát nếu bị mute
        if (video.muted) {
            for (const key in this.wavesurfers) {
                if (this.wavesurfers[key].isPlaying()) {
                    this.wavesurfers[key].pause();
                }
            }
        }

        this.updateTimelineSync(true);
        this.saveData();
        this.cd.detectChanges();
        this.toastr.info(video.muted ? 'Đã tắt âm thanh video và âm thanh gốc.' : 'Đã bật lại âm thanh video và âm thanh gốc.');
    }

    toggleVideoDisabled(video: any) {
        if (!video) return;
        video.disabled = !video.disabled;

        const vStart = video.startTime || 0;
        const vEnd = vStart + (video.duration || 5);

        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos && scene.videos.includes(video) && scene.extractedAudios) {
                    for (const audio of scene.extractedAudios) {
                        const aStart = audio.startTime || 0;
                        const aEnd = aStart + (audio.duration || 5);
                        if ((aStart >= vStart - 0.05 && aStart < vEnd) || (aEnd > vStart && aEnd <= vEnd + 0.05)) {
                            audio.disabled = video.disabled;
                        }
                    }
                }
            }
        }

        if (video.disabled) {
            for (const key in this.wavesurfers) {
                if (this.wavesurfers[key].isPlaying()) {
                    this.wavesurfers[key].pause();
                }
            }
        }

        this.updateTimelineSync(true);
        this.saveData();
        this.cd.detectChanges();
        this.toastr.info(video.disabled ? 'Đã tạm tắt video và âm thanh gốc.' : 'Đã bật lại video và âm thanh gốc.');
    }

    async extractAudio(video: any, sceneIdx: number) {
        if (!video.videoUrl) return;
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene) return;

        const electron = (window as any).electron;
        if (!electron || !electron.extractAudio || !electron.getPathForFile) {
            this.toastr.error('Tính năng tách audio không khả dụng (Electron error).');
            return;
        }

        video.isExtractingAudio = true;
        this.isExtractingAudio = true;
        this.processingStatusTitle = 'Đang bóc tách âm thanh AI...';
        this.processingStatusMessage = 'AI đang lắng nghe và nhận diện câu thoại khớp theo thời lượng video...';
        this.cd.detectChanges();

        try {
            this.toastr.info('Đang trích xuất âm thanh gốc từ video...', 'Đang xử lý');
            let originalPath = video.videoUrl;
            if (originalPath.startsWith('media://')) {
                originalPath = decodeURIComponent(originalPath.substring(8));
            } else if (originalPath.startsWith('file://')) {
                originalPath = decodeURIComponent(originalPath.substring(7));
            }
            if (originalPath.match(/^\/[a-zA-Z]:[\\/]/)) {
                originalPath = originalPath.substring(1);
            }
            
            // 1. Tách audio tổng khớp chính xác thời lượng và trim của video clip
            const clipDuration = Number(video.duration) || 5;
            const clipTrimStart = Number(video.trimStart) || 0;
            const extractRes = await electron.extractAudio({
                videoPath: originalPath,
                startTime: clipTrimStart,
                duration: clipDuration
            });

            const extractedAudioPath = typeof extractRes === 'string' ? extractRes : extractRes.audioPath;
            const exactAudioDur = (typeof extractRes === 'object' && extractRes.duration > 0) ? Number(extractRes.duration) : clipDuration;
            const actualDuration = exactAudioDur > 0 ? Math.round(exactAudioDur * 100) / 100 : clipDuration;
            video.duration = actualDuration;
            if (video.maxDuration === undefined || video.maxDuration < actualDuration) {
                video.maxDuration = actualDuration;
            }

            this.toastr.info('Đang gửi âm thanh cho AI để nhận diện lời thoại & ngắt câu...', 'AI đang xử lý', { timeOut: 10000 });

            let segments: Array<{ text: string, vietnameseText?: string, startTime: number, endTime?: number, duration?: number }> = [];

            try {
                const base64Res = await electron.invoke('read-file-base64', { filePath: extractedAudioPath });
                if (!base64Res || !base64Res.success || !base64Res.base64) {
                    throw new Error('Không đọc được file âm thanh: ' + (base64Res?.error || 'Lỗi đọc file'));
                }

                const prompt = `Bạn là chuyên gia phân tích âm thanh, nhận diện giọng nói và bóc tách phụ đề đa ngôn ngữ hàng đầu thế giới.
Tổng thời lượng file âm thanh: ${actualDuration.toFixed(2)} giây.

NHIỆM VỤ QUAN TRỌNG:
1. BÓC TÁCH LIỀN MẠCH, BAO PHỦ 100% DÒNG THỜI GIAN (TUYỆT ĐỐI KHÔNG BỎ SÓT BẤT KỲ ĐOẠN NÀO):
   - Phân đoạn đầu tiên BẮT BUỘC bắt đầu từ 0.00s.
   - Phân đoạn cuối cùng BẮT BUỘC kết thúc đúng tại ${actualDuration.toFixed(2)}s.
   - Các phân đoạn phải nối tiếp nhau liên tục từ 0.00s đến ${actualDuration.toFixed(2)}s sao cho toàn bộ dải âm thanh được bao phủ trọn vẹn 100%.

2. QUY TẮC NGẮT CÂU & PHÂN ĐOẠN PHỤ ĐỀ BẮT BUỘC (CỰC KỲ QUAN TRỌNG - BẮT BUỘC TUÂN THỦ):
   - TUYỆT ĐỐI KHÔNG TẠO CÂU PHỤ ĐỀ DÀI HOẶC GỘP NHIỀU CÂU/VẾ CÂU VÀO MỘT PHÂN ĐOẠN.
   - CỨ CÓ DẤU CÂU (dấu chấm '.', dấu hỏi '?', dấu than '!', dấu phẩy ',', ';', ':', hoặc xuống dòng '\n') LÀ BẮT BUỘC PHẢI NGẮT THÀNH MỘT PHÂN ĐOẠN MỚI RIÊNG BIỆT.
   - Mỗi phân đoạn câu thoại chỉ dài từ 3 đến 8 từ (tối đa 40 ký tự), thời lượng chuẩn từ 1.0s đến 3.0s để người xem kịp đọc.
   - Ví dụ:
     * Thay vì gộp 1 câu dài: "Hello everyone. I'm Donnie Yen, creative consultant for Phantom Blade Zero and the actor behind."
     * BẮT BUỘC PHẢI TÁCH THÀNH 3 PHÂN ĐOẠN RIÊNG BIỆT:
       1) "text": "Hello everyone.", "vietnameseText": "Chào mọi người.", "startTime": 54.70, "endTime": 56.00
       2) "text": "I'm Donnie Yen, creative consultant for Phantom Blade Zero", "vietnameseText": "Tôi là Chân Tử Đan, cố vấn sáng tạo cho Phantom Blade Zero", "startTime": 56.00, "endTime": 59.10
       3) "text": "and the actor behind.", "vietnameseText": "và là diễn viên đứng sau.", "startTime": 59.10, "endTime": 60.30
   - Đoạn không có lời thoại (nhạc nền mở đầu, tiếng nổ, tiếng bước chân, nhạc kịch tính, khoảng lặng, nhạc kết thúc): ghi nhãn mô tả trong ngoặc vuông (ví dụ: "[Nhạc nền mở đầu]", "[Tiếng nổ]", "[Nhạc kịch tính]", "[Nhạc kết thúc]").

3. DỊCH VÀ XUẤT ĐẦY ĐỦ 2 NGÔN NGỮ (NGÔN NGỮ GỐC & TIẾNG VIỆT) CHO TẤT CẢ PHÂN ĐOẠN:
   - "text": Câu thoại gốc đúng từng từ theo ngôn ngữ gốc nhân vật nói (tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Hàn, tiếng Pháp, tiếng Việt...) hoặc nhãn âm thanh gốc.
   - "vietnameseText": BẮT BUỘC dịch chuẩn xác, tự nhiên, sát nghĩa sang Tiếng Việt chuẩn điện ảnh (nếu câu thoại gốc đã là tiếng Việt thì giữ nguyên).

4. ĐỘ CHÍNH XÁC MỐC THỜI GIAN (TIMESTAMP):
   - "startTime": Mốc thời gian bắt đầu (giây, chính xác 2 chữ số thập phân, vd: 0.00, 1.80, 4.20).
   - "endTime": Mốc thời gian kết thúc (giây, chính xác 2 chữ số thập phân, vd: 1.80, 4.20, ${actualDuration.toFixed(2)}).

TRẢ VỀ DUY NHẤT MẢNG JSON THEO CẤU TRÚC:
[
  {
    "text": "[Nhạc nền mở đầu]",
    "vietnameseText": "[Nhạc nền mở đầu]",
    "startTime": 0.00,
    "endTime": 1.80
  },
  {
    "text": "Hello everyone.",
    "vietnameseText": "Chào mọi người.",
    "startTime": 1.80,
    "endTime": 3.10
  },
  {
    "text": "We're survivors.",
    "vietnameseText": "Chúng ta là những người sống sót.",
    "startTime": 3.10,
    "endTime": 4.90
  },
  {
    "text": "[Nhạc kịch tính kết thúc]",
    "vietnameseText": "[Nhạc kịch tính kết thúc]",
    "startTime": 4.90,
    "endTime": ${actualDuration.toFixed(2)}
  }
]`;

                const response: any = await this._genaiService.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: 'audio/mp3',
                                        data: base64Res.base64
                                    }
                                }
                            ]
                        }
                    ],
                    config: {
                        maxOutputTokens: 8192,
                        temperature: 0.1,
                        responseMimeType: 'application/json',
                        skipTTS: true,
                        maxTurns: 1,
                        systemInstruction: 'Bạn là chuyên gia nhận diện âm thanh và bóc tách phụ đề video. Hãy phân tích audio và trả về DUY NHẤT mảng JSON theo format yêu cầu.'
                    } as any
                });

                let rawText = '';
                if (typeof response === 'string') {
                    rawText = response;
                } else if ((response as any)?.text) {
                    rawText = typeof (response as any).text === 'function' ? (response as any).text() : (response as any).text;
                } else if ((response as any)?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    rawText = (response as any).candidates[0].content.parts[0].text;
                } else if ((response as any)?.choices?.[0]?.message?.content) {
                    rawText = (response as any).choices[0].message.content;
                }

                console.log('[ExtractAudio] Phản hồi thô từ AI:', rawText);
                const cleanText = (rawText || '')
                    .replace(/```json\s*/gi, '')
                    .replace(/```\s*/g, '')
                    .trim();

                const cleanSegmentText = (txt: string): string => {
                    let t = String(txt || '').trim();
                    if (/^"?(?:text|content|sentence|subtitle|dialogue|vietnameseText|viText|translation)"?\s*:\s*/i.test(t)) {
                        t = t.replace(/^"?(?:text|content|sentence|subtitle|dialogue|vietnameseText|viText|translation)"?\s*:\s*/i, '');
                    }
                    t = t.replace(/^["'\s]+|["',\s]+$/g, '').trim();
                    return t;
                };

                // 1. Thử parse JSON tổng
                let parsed: any = null;
                try {
                    parsed = JSON.parse(cleanText);
                } catch (e) {
                    const startArr = cleanText.indexOf('[');
                    const endArr = cleanText.lastIndexOf(']');
                    if (startArr >= 0 && endArr > startArr) {
                        try {
                            parsed = JSON.parse(cleanText.substring(startArr, endArr + 1));
                        } catch (e2) {}
                    }
                    if (!parsed) {
                        const startObj = cleanText.indexOf('{');
                        const endObj = cleanText.lastIndexOf('}');
                        if (startObj >= 0 && endObj > startObj) {
                            try {
                                parsed = JSON.parse(cleanText.substring(startObj, endObj + 1));
                            } catch (e3) {}
                        }
                    }
                }

                if (parsed) {
                    let list: any[] = [];
                    if (Array.isArray(parsed)) {
                        list = parsed;
                    } else if (typeof parsed === 'object') {
                        for (const key of ['segments', 'subtitles', 'data', 'result', 'results', 'items', 'dialogues', 'lines']) {
                            if (Array.isArray(parsed[key])) {
                                list = parsed[key];
                                break;
                            }
                        }
                        if (list.length === 0) {
                            for (const k in parsed) {
                                if (Array.isArray(parsed[k])) {
                                    list = parsed[k];
                                    break;
                                }
                            }
                        }
                    }

                    if (list.length > 0) {
                        segments = list.map((item: any) => {
                            let text = cleanSegmentText(item.text || item.content || item.sentence || item.subtitle || item.transcript || item.dialogue || '');
                            let viText = cleanSegmentText(item.vietnameseText || item.viText || item.translation || item.vietnamese || item.vi || text);
                            if (!viText) viText = text;
                            if (!text || text.length <= 1) {
                                return null;
                            }
                            const start = Math.max(0, Math.min(actualDuration - 0.2, Number(item.startTime ?? item.start ?? item.start_time ?? item.from) || 0));
                            let end = Number(item.endTime ?? item.end ?? item.end_time ?? item.to);
                            if (isNaN(end) || end <= start) {
                                const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
                                end = Math.min(actualDuration, start + Math.max(1.2, wordCount * 0.45));
                            }
                            end = Math.min(actualDuration, Math.max(start + 0.3, end));

                            return {
                                text: text,
                                vietnameseText: viText,
                                startTime: Math.round(start * 100) / 100,
                                endTime: Math.round(end * 100) / 100,
                                duration: Math.round((end - start) * 100) / 100
                            };
                        }).filter((s: any) => s !== null && s.text.length > 1 && s.startTime < actualDuration);
                    }
                }

                // 1.5. Trích xuất từng object JSON { ... } bằng Regex nếu JSON tổng bị lỗi
                if ((!segments || segments.length === 0) && cleanText.length > 0) {
                    const objPattern = /\{[^{}]*"(?:text|content|sentence|subtitle|dialogue)"\s*:[^{}]*\}/g;
                    const matches = cleanText.match(objPattern);
                    if (matches && matches.length > 0) {
                        const parsedItems: any[] = [];
                        for (const m of matches) {
                            try {
                                parsedItems.push(JSON.parse(m));
                            } catch (e) {
                                const tMatch = m.match(/"(?:text|content|sentence|subtitle|dialogue)"\s*:\s*"([^"]+)"/i);
                                const viMatch = m.match(/"(?:vietnameseText|viText|translation|vietnamese)"\s*:\s*"([^"]+)"/i);
                                const sMatch = m.match(/"(?:startTime|start|start_time|from)"\s*:\s*([\d.]+)/i);
                                const eMatch = m.match(/"(?:endTime|end|end_time|to)"\s*:\s*([\d.]+)/i);
                                if (tMatch && sMatch) {
                                    parsedItems.push({
                                        text: tMatch[1],
                                        vietnameseText: viMatch ? viMatch[1] : tMatch[1],
                                        startTime: parseFloat(sMatch[1]),
                                        endTime: eMatch ? parseFloat(eMatch[1]) : undefined
                                    });
                                }
                            }
                        }
                        if (parsedItems.length > 0) {
                            segments = parsedItems.map((item: any) => {
                                let text = cleanSegmentText(item.text || item.content || item.sentence || item.subtitle || item.transcript || item.dialogue || '');
                                let viText = cleanSegmentText(item.vietnameseText || item.viText || item.translation || item.vietnamese || item.vi || text);
                                if (!viText) viText = text;
                                if (!text || text.length <= 1) return null;
                                const start = Math.max(0, Math.min(actualDuration - 0.2, Number(item.startTime ?? item.start ?? item.start_time ?? item.from) || 0));
                                let end = Number(item.endTime ?? item.end ?? item.end_time ?? item.to);
                                if (isNaN(end) || end <= start) {
                                    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
                                    end = Math.min(actualDuration, start + Math.max(1.2, wordCount * 0.45));
                                }
                                end = Math.min(actualDuration, Math.max(start + 0.3, end));
                                return {
                                    text: text,
                                    vietnameseText: viText,
                                    startTime: Math.round(start * 100) / 100,
                                    endTime: Math.round(end * 100) / 100,
                                    duration: Math.round((end - start) * 100) / 100
                                };
                            }).filter((s: any) => s !== null && s.text.length > 1 && s.startTime < actualDuration);
                        }
                    }
                }

                // 2. Fallback: Parse theo dòng timestamp / SRT / regex
                if ((!segments || segments.length === 0) && cleanText.length > 0) {
                    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const timeRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2}(?:\.\d+)?)\s*(?:-->|-|đến|to)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2}(?:\.\d+)?)/i;
                    const secRegex = /(?:\[|\()?\s*(\d+(?:\.\d+)?)\s*s?\s*(?:-->|-|đến|to)\s*(\d+(?:\.\d+)?)\s*s?\s*(?:\]|\))?/i;
                    const parseToSec = (h: string, m: string, s: string): number => (Number(h || 0) * 3600) + (Number(m || 0) * 60) + Number(s || 0);

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.includes('"startTime"') || line.includes('"endTime"') || line.startsWith('{') || line.startsWith('}') || line.startsWith('[') || line.startsWith(']')) {
                            continue;
                        }
                        let startSec: number | null = null;
                        let endSec: number | null = null;
                        let lineText = '';

                        const matchTime = line.match(timeRegex);
                        if (matchTime) {
                            startSec = parseToSec(matchTime[1], matchTime[2], matchTime[3]);
                            endSec = parseToSec(matchTime[4], matchTime[5], matchTime[6]);
                            lineText = line.replace(timeRegex, '').replace(/^[:\-\s]+/, '').trim();
                            if (!lineText && i + 1 < lines.length && !lines[i + 1].match(timeRegex)) {
                                lineText = lines[++i];
                            }
                        } else {
                            const matchSec = line.match(secRegex);
                            if (matchSec) {
                                startSec = Number(matchSec[1]);
                                endSec = Number(matchSec[2]);
                                lineText = line.replace(secRegex, '').replace(/^[:\-\s]+/, '').trim();
                            }
                        }

                        lineText = cleanSegmentText(lineText);
                        if (startSec !== null && endSec !== null && lineText && lineText.length > 1) {
                            startSec = Math.max(0, Math.min(actualDuration - 0.2, startSec));
                            if (endSec <= startSec) {
                                const wordCount = lineText.split(/\s+/).filter(w => w.length > 0).length;
                                endSec = Math.min(actualDuration, startSec + Math.max(1.2, wordCount * 0.45));
                            }
                            endSec = Math.min(actualDuration, Math.max(startSec + 0.3, endSec));
                            segments.push({
                                text: lineText,
                                vietnameseText: lineText,
                                startTime: Math.round(startSec * 100) / 100,
                                endTime: Math.round(endSec * 100) / 100,
                                duration: Math.round((endSec - startSec) * 100) / 100
                            });
                        }
                    }
                }

                // 3. Fallback: Parse theo câu văn bản thông thường nếu AI trả về văn bản tự do
                if ((!segments || segments.length === 0) && cleanText.length > 5) {
                    const sentences = cleanText
                        .split(/(?<=[.?!…\n])\s+/)
                        .map(s => cleanSegmentText(s))
                        .filter(s => s.length > 1 && !s.startsWith('{') && !s.startsWith('[') && !s.includes('"startTime"') && !s.includes('"endTime"'));
                    
                    if (sentences.length > 0) {
                        const totalChars = sentences.reduce((acc, s) => acc + s.length, 0) || 1;
                        let curTime = 0;
                        for (const sent of sentences) {
                            const sentDur = Math.max(1.5, Math.min(6.0, (sent.length / totalChars) * actualDuration));
                            const end = Math.min(actualDuration, curTime + sentDur);
                            segments.push({
                                text: sent,
                                vietnameseText: sent,
                                startTime: Math.round(curTime * 100) / 100,
                                endTime: Math.round(end * 100) / 100,
                                duration: Math.round((end - curTime) * 100) / 100
                            });
                            curTime = end;
                            if (curTime >= actualDuration) break;
                        }
                    }
                }
            } catch (aiErr: any) {
                console.error('Lỗi khi gọi AI nhận diện âm thanh:', aiErr);
                this.toastr.warning(`Lỗi AI nhận diện âm thanh: ${aiErr?.message || aiErr}. Hệ thống sẽ sử dụng toàn bộ dải âm thanh gốc.`, 'Dùng âm thanh gốc', { timeOut: 8000 });
                segments = [];
            }

            if (!segments || segments.length === 0) {
                console.warn('[ExtractAudio] Không có segments chi tiết, chuyển sang fallback âm thanh tổng.');
            }

            // Chuẩn hoá và Lấp đầy 100% dòng thời gian để bảo toàn toàn bộ âm thanh của video (Track 3)
            const fullCoverageSegments: Array<{ text: string, vietnameseText?: string, startTime: number, endTime?: number, duration: number }> = [];
            if (segments && segments.length > 0) {
                const splitRawSegmentsByPunctuation = (rawList: any[]): any[] => {
                    const output: any[] = [];
                    for (const seg of rawList) {
                        const text = String(seg.text || '').trim();
                        const viText = String(seg.vietnameseText || seg.viText || text).trim();
                        const start = Math.max(0, Number(seg.startTime) || 0);
                        const end = Math.max(start + 0.3, Number(seg.endTime) || (start + (Number(seg.duration) || 2)));
                        const totalDur = end - start;

                        // Nếu là nhãn âm thanh hệ thống (ví dụ: [Nhạc nền], [Tiếng nổ]), không ngắt
                        if (/^\[.+\]$/.test(text) || totalDur < 0.8) {
                            output.push({
                                text: text,
                                vietnameseText: viText,
                                startTime: Math.round(start * 100) / 100,
                                endTime: Math.round(end * 100) / 100,
                                duration: Math.round(totalDur * 100) / 100
                            });
                            continue;
                        }

                        // 1. Tách theo dấu kết câu trước: chấm (.), hỏi (?), than (!), ba chấm (…), xuống dòng (\n)
                        let parts = text.split(/(?<=[.?!…\n])\s+/).map(p => p.trim()).filter(p => p.length > 0);

                        // 2. Nếu một phần vẫn còn dài (> 32 ký tự hoặc > 6 từ) và có dấu phẩy/chấm phẩy/hai chấm/gạch ngang -> tách tiếp theo vế câu
                        const refinedParts: string[] = [];
                        for (const p of parts) {
                            const pWords = p.split(/\s+/).filter(w => w.length > 0);
                            if ((p.length > 32 || pWords.length > 6) && /[,;:—–]/.test(p)) {
                                const subParts = p.split(/(?<=[,;:—–])\s+/).map(sp => sp.trim()).filter(sp => sp.length > 0);
                                refinedParts.push(...subParts);
                            } else {
                                refinedParts.push(p);
                            }
                        }
                        parts = refinedParts;

                        if (parts.length <= 1) {
                            output.push({
                                text: text,
                                vietnameseText: viText,
                                startTime: Math.round(start * 100) / 100,
                                endTime: Math.round(end * 100) / 100,
                                duration: Math.round(totalDur * 100) / 100
                            });
                            continue;
                        }

                        // Tách câu tiếng Việt tương ứng
                        let viParts: string[] = [];
                        if (viText && viText !== text) {
                            viParts = viText.split(/(?<=[.?!…\n])\s+/).map(p => p.trim()).filter(p => p.length > 0);
                            const refinedVi: string[] = [];
                            for (const vp of viParts) {
                                const vpWords = vp.split(/\s+/).filter(w => w.length > 0);
                                if ((vp.length > 32 || vpWords.length > 6) && /[,;:—–]/.test(vp)) {
                                    refinedVi.push(...vp.split(/(?<=[,;:—–])\s+/).map(sp => sp.trim()).filter(sp => sp.length > 0));
                                } else {
                                    refinedVi.push(vp);
                                }
                            }
                            viParts = refinedVi;

                            if (viParts.length !== parts.length) {
                                const viWords = viText.split(/\s+/).filter(w => w.length > 0);
                                const totalWords = viWords.length;
                                viParts = [];
                                let viWordCursor = 0;
                                const totalChars = parts.reduce((acc, p) => acc + p.length, 0) || 1;
                                for (let i = 0; i < parts.length; i++) {
                                    if (i === parts.length - 1) {
                                        viParts.push(viWords.slice(viWordCursor).join(' '));
                                    } else {
                                        const chunkCount = Math.max(1, Math.round(totalWords * (parts[i].length / totalChars)));
                                        viParts.push(viWords.slice(viWordCursor, viWordCursor + chunkCount).join(' '));
                                        viWordCursor += chunkCount;
                                    }
                                }
                            }
                        }

                        const totalChars = parts.reduce((acc, p) => acc + p.length, 0) || 1;
                        let curTime = start;

                        for (let i = 0; i < parts.length; i++) {
                            const pText = parts[i];
                            const pVi = viParts[i] || (this.isLikelyVietnamese(pText) ? pText : '');
                            const pDur = (i === parts.length - 1)
                                ? Math.max(0.3, Math.round((end - curTime) * 100) / 100)
                                : Math.max(0.3, Math.round((totalDur * (pText.length / totalChars)) * 100) / 100);
                            const pEnd = Math.min(end, Math.round((curTime + pDur) * 100) / 100);

                            output.push({
                                text: pText,
                                vietnameseText: pVi,
                                startTime: Math.round(curTime * 100) / 100,
                                endTime: pEnd,
                                duration: Math.round((pEnd - curTime) * 100) / 100
                            });

                            curTime = pEnd;
                        }
                    }
                    return output;
                };

                const validRaw = splitRawSegmentsByPunctuation(segments)
                    .map(seg => {
                        const sStart = Math.max(0, Math.min(actualDuration, Number(seg.startTime) || 0));
                        const sEnd = Math.max(sStart + 0.3, Math.min(actualDuration, Number(seg.endTime) || (sStart + 2)));
                        return {
                            text: String(seg.text || '').trim(),
                            vietnameseText: String((seg as any).vietnameseText || seg.text || '').trim(),
                            startTime: Math.round(sStart * 100) / 100,
                            endTime: Math.round(sEnd * 100) / 100,
                            duration: Math.round((sEnd - sStart) * 100) / 100
                        };
                    })
                    .filter(seg => seg.text && seg.text.length > 0 && seg.duration > 0.2)
                    .sort((a, b) => a.startTime - b.startTime);

                let currentCursor = 0;
                for (const seg of validRaw) {
                    // Nếu có khoảng trống phía trước (> 0.15s), tự động chèn phân đoạn âm thanh [Nhạc nền] để không bị mất tiếng
                    if (seg.startTime - currentCursor > 0.15) {
                        const gapDur = Math.round((seg.startTime - currentCursor) * 100) / 100;
                        fullCoverageSegments.push({
                            text: '[Nhạc nền]',
                            vietnameseText: '[Nhạc nền]',
                            startTime: Math.round(currentCursor * 100) / 100,
                            endTime: Math.round(seg.startTime * 100) / 100,
                            duration: gapDur
                        });
                    }

                    fullCoverageSegments.push(seg);
                    currentCursor = Math.max(currentCursor, seg.endTime);
                }

                // Nếu còn khoảng trống ở cuối đến hết video (> 0.15s)
                if (actualDuration - currentCursor > 0.15) {
                    const gapDur = Math.round((actualDuration - currentCursor) * 100) / 100;
                    fullCoverageSegments.push({
                        text: '[Nhạc nền]',
                        vietnameseText: '[Nhạc nền]',
                        startTime: Math.round(currentCursor * 100) / 100,
                        endTime: Math.round(actualDuration * 100) / 100,
                        duration: gapDur
                    });
                }
                segments = fullCoverageSegments;
            }

            // 3. Cắt audio thành từng file audio segment bằng FFmpeg & sinh file .SRT (gốc + tiếng Việt)
            this.toastr.info('Đang cắt từng đoạn audio câu thoại & sinh file phụ đề SRT...', 'Đang xử lý');
            const splitResults = await electron.splitAudioSegments({
                audioPath: extractedAudioPath,
                segments: segments
            });

            // 4. Cắt tỉa và thay thế chính xác các audio / subtitles cũ trong phạm vi [videoStart, videoEnd], bảo toàn toàn bộ âm thanh của các clip khác
            const videoStart = (video.startTime !== undefined && video.startTime !== null && !isNaN(video.startTime)) ? Number(video.startTime) : 0;
            const videoEnd = videoStart + Math.max(actualDuration, Number(video.duration) || 0);

            const sliceTrackItems = (items: any[]) => {
                const newItems: any[] = [];
                for (const item of items) {
                    const iStart = Number(item.startTime) || 0;
                    const iDur = Number(item.duration) || 0;
                    const iEnd = iStart + iDur;

                    // Không dính đến khoảng [videoStart, videoEnd] -> Giữ nguyên
                    if (iEnd <= videoStart + 0.05 || iStart >= videoEnd - 0.05) {
                        newItems.push(item);
                    } else if (iStart < videoStart && iEnd > videoEnd) {
                        // Trùm qua toàn bộ clip -> Tách thành 2 mảnh (trước và sau)
                        const pieceBefore = { ...item, duration: Math.max(0.2, Math.round((videoStart - iStart) * 100) / 100) };
                        const pieceAfter = {
                            ...item,
                            id: Date.now() + Math.random(),
                            startTime: Math.round(videoEnd * 100) / 100,
                            duration: Math.max(0.2, Math.round((iEnd - videoEnd) * 100) / 100)
                        };
                        newItems.push(pieceBefore, pieceAfter);
                    } else if (iStart < videoStart && iEnd > videoStart) {
                        // Cắt phần đuôi bị lấn sang clip này
                        item.duration = Math.max(0.2, Math.round((videoStart - iStart) * 100) / 100);
                        newItems.push(item);
                    } else if (iStart < videoEnd && iEnd > videoEnd) {
                        // Cắt phần đầu bị lấn trong clip này
                        item.startTime = Math.round(videoEnd * 100) / 100;
                        item.duration = Math.max(0.2, Math.round((iEnd - videoEnd) * 100) / 100);
                        newItems.push(item);
                    }
                }
                return newItems;
            };

            if (this.projectData?.scenes) {
                for (const sc of this.projectData.scenes) {
                    if (sc.extractedAudios) {
                        sc.extractedAudios = sliceTrackItems(sc.extractedAudios);
                    }
                    if (sc.subtitles) {
                        sc.subtitles = sliceTrackItems(sc.subtitles);
                    }
                }
            }

            // Huỷ toàn bộ các WaveSurfer cũ để giải phóng RAM và làm mới hoàn toàn
            for (const key in this.wavesurfers) {
                try {
                    this.wavesurfers[key]?.destroy();
                } catch (e) {}
            }
            this.wavesurfers = {};

            // Đảm bảo các mảng dữ liệu luôn tồn tại
            if (!scene.extractedAudios) {
                scene.extractedAudios = [];
            }
            if (!scene.subtitles) {
                scene.subtitles = [];
            }

            if (splitResults && splitResults.length > 0) {
                splitResults.forEach((res: any, idx: number) => {
                    const segUrl = `media://${res.audioPath.replace(/\\/g, '/')}`;
                    const segStart = Math.round((videoStart + Number(res.startTime)) * 100) / 100;
                    const segDur = Math.max(0.3, Math.round((Number(res.duration) || (Number(res.endTime) - Number(res.startTime)) || 2) * 100) / 100);
                    const segOrigText = String(res.originalText || (segments[idx] as any)?.originalText || res.text || (segments[idx] as any)?.text || '').trim() || `Phần ${idx + 1}`;
                    const segViText = String(res.vietnameseText || (segments[idx] as any)?.vietnameseText || segOrigText).trim();

                    if (segStart < videoEnd + 0.05 && segDur > 0.2) {
                        const itemCommonId = Date.now() + idx;
                        // 1. Thêm vào Track Extracted Audio (Bảo toàn 100% âm thanh toàn bộ video)
                        scene.extractedAudios.push({
                            id: itemCommonId,
                            text: segOrigText,
                            originalText: segOrigText,
                            vietnameseText: segViText,
                            audioUrl: segUrl,
                            startTime: segStart,
                            duration: segDur,
                            maxDuration: segDur
                        });

                        // 2. Thêm vào Track Subtitles (Bảo đảm đầy đủ 1-1 tất cả các phân đoạn như audio)
                        const subText = (this.currentSubtitleLang === 'vi') ? (segViText || segOrigText) : (segOrigText || segViText);
                        scene.subtitles.push({
                            id: itemCommonId + 100000,
                            audioId: itemCommonId,
                            text: subText,
                            originalText: segOrigText,
                            vietnameseText: segViText,
                            translations: {
                                'vi': segViText,
                                'original': segOrigText,
                                'en': segOrigText
                            },
                            startTime: segStart,
                            duration: segDur
                        });
                    }
                });
            } else {
                // Fallback nếu không cắt được
                const audioUrl = `media://${extractedAudioPath.replace(/\\/g, '/')}`;
                scene.extractedAudios.push({
                    text: '[Âm thanh gốc]',
                    audioUrl: audioUrl,
                    startTime: videoStart,
                    duration: clipDuration,
                    maxDuration: clipDuration
                });
            }

            // Tự động chuẩn hoá dòng thời gian, chống đè chập và khử trùng lặp
            this.normalizeData();

            // Đồng bộ hoá danh sách media bên trái, subtitle preview và dọn dẹp WaveSurfers
            this.syncSubtitlesWithExtractedAudios();
            this.updateFilteredMediaItems();
            this.updateActiveSubtitleInfo();
            this.updateTimelineSync(true);
            this.cleanupOrphanedWaveSurfers();

            this.toastr.success(`Đã trích xuất âm thanh AI & tự động tạo mới phụ đề Tiếng Việt (.srt) thành công!`, 'Hoàn tất', { timeOut: 6000 });
            this.saveData(true);
            this.cd.detectChanges();
            setTimeout(() => {
                this.initWaveSurfers();
                this.updateLines();
                this.updateFilteredMediaItems();
                this.updateActiveSubtitleInfo();
                this.cd.detectChanges();
            }, 300);
        } catch (err: any) {
            console.error('Extract audio error', err);
            this.toastr.error(`Lỗi khi tách âm thanh: ${err?.message || err}`);
        } finally {
            video.isExtractingAudio = false;
            this.isExtractingAudio = false;
            this.processingStatusTitle = '';
            this.processingStatusMessage = '';
            this.cd.detectChanges();
        }
    }

    hasExtractedAudio(scene: any, video: any): boolean {
        if (!scene || !scene.extractedAudios || !video) return false;
        return scene.extractedAudios.some((a: any) => 
            a.startTime >= (video.startTime || 0) && a.startTime < (video.startTime || 0) + (video.duration || 5)
        );
    }

    findSubtitleSceneAndIndex(sub: any): { scene: any, sceneIdx: number, subIdx: number } | null {
        if (!sub || !this.projectData?.scenes) return null;
        const target = sub._raw || sub;
        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.subtitles && Array.isArray(scene.subtitles)) {
                const idx = scene.subtitles.findIndex((s: any) => s === target || (target.id && s.id === target.id));
                if (idx !== -1) {
                    return { scene, sceneIdx: sIdx, subIdx: idx };
                }
            }
        }
        return null;
    }

    splitTextAndTranslations(sub: any, splitRatio: number, customPart1Text?: string, customPart2Text?: string) {
        const text = String(sub.text || '').trim();
        let part1Text = customPart1Text;
        let part2Text = customPart2Text;

        if (part1Text === undefined || part2Text === undefined) {
            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length > 1) {
                const midIndex = Math.max(1, Math.min(words.length - 1, Math.round(words.length * splitRatio)));
                part1Text = words.slice(0, midIndex).join(' ');
                part2Text = words.slice(midIndex).join(' ');
            } else {
                const midChar = Math.max(1, Math.round(text.length * splitRatio));
                part1Text = text.substring(0, midChar);
                part2Text = text.substring(midChar);
            }
        }

        const splitSecondary = (secText: string): { part1: string, part2: string } => {
            const clean = String(secText || '').trim();
            if (!clean) return { part1: '', part2: '' };
            if (clean === text) return { part1: part1Text!, part2: part2Text! };

            const endsWithPunct = /[.?!;:\n]$/.test(part1Text!.trim());
            if (endsWithPunct) {
                const punctMatch = clean.match(/^([\s\S]+?[.?!;:\n])\s+([\s\S]+)$/);
                if (punctMatch && punctMatch[1] && punctMatch[2]) {
                    return { part1: punctMatch[1].trim(), part2: punctMatch[2].trim() };
                }
            }

            const secWords = clean.split(/\s+/).filter(w => w.length > 0);
            if (secWords.length > 1) {
                const midSec = Math.max(1, Math.min(secWords.length - 1, Math.round(secWords.length * splitRatio)));
                return {
                    part1: secWords.slice(0, midSec).join(' '),
                    part2: secWords.slice(midSec).join(' ')
                };
            }
            return { part1: clean, part2: '' };
        };

        const viSplit = splitSecondary(sub.vietnameseText);
        const origSplit = splitSecondary(sub.originalText);

        const trans1: any = {};
        const trans2: any = {};
        if (sub.translations && typeof sub.translations === 'object') {
            for (const k in sub.translations) {
                const s = splitSecondary(sub.translations[k]);
                trans1[k] = s.part1;
                trans2[k] = s.part2;
            }
        }

        return {
            part1Text: (part1Text || '').trim(),
            part2Text: (part2Text || '').trim(),
            viPart1: viSplit.part1 || (this.isLikelyVietnamese(part1Text || '') ? (part1Text || '').trim() : ''),
            viPart2: viSplit.part2 || (this.isLikelyVietnamese(part2Text || '') ? (part2Text || '').trim() : ''),
            origPart1: origSplit.part1 || (!this.isLikelyVietnamese(part1Text || '') ? (part1Text || '').trim() : ''),
            origPart2: origSplit.part2 || (!this.isLikelyVietnamese(part2Text || '') ? (part2Text || '').trim() : ''),
            trans1,
            trans2
        };
    }

    splitSubtitleItem(sub: any, sceneIdx?: number, sIdx?: number, customCutTime?: number) {
        if (!sub) sub = this.activeItem;
        if (!sub) return;

        const loc = this.findSubtitleSceneAndIndex(sub);
        if (!loc) return;
        const scene = loc.scene;
        const targetIdx = loc.subIdx;
        const targetSub = scene.subtitles[targetIdx];

        const start = Number(targetSub.startTime) || 0;
        const duration = Number(targetSub.duration) || 3;
        const end = start + duration;

        let cutTime = customCutTime !== undefined ? customCutTime : this.currentTimelineTime;
        if (cutTime <= start + 0.2 || cutTime >= end - 0.2) {
            cutTime = start + (duration / 2);
        }

        const firstDuration = Math.max(0.2, Math.round((cutTime - start) * 100) / 100);
        const secondDuration = Math.max(0.2, Math.round((end - cutTime) * 100) / 100);
        const ratio = Math.max(0.1, Math.min(0.9, firstDuration / duration));

        const splitData = this.splitTextAndTranslations(targetSub, ratio);

        targetSub.duration = firstDuration;
        targetSub.text = splitData.part1Text;
        targetSub.vietnameseText = splitData.viPart1;
        targetSub.originalText = splitData.origPart1;
        targetSub.translations = splitData.trans1;

        const newSub = {
            ...targetSub,
            id: Date.now() + Math.random(),
            startTime: Math.round(cutTime * 100) / 100,
            duration: secondDuration,
            text: splitData.part2Text,
            vietnameseText: splitData.viPart2,
            originalText: splitData.origPart2,
            translations: splitData.trans2
        };

        scene.subtitles.splice(targetIdx + 1, 0, newSub);

        this.normalizeData();
        this.saveData(true);
        this.updateActiveSubtitleInfo();
        this.updateFilteredMediaItems();
        this.cd.detectChanges();
        this.toastr.success('Đã tách phân đoạn phụ đề thành công!');
    }

    splitActiveSubtitleAtCursor(textarea?: any) {
        const sub = this.activeItem;
        if (!sub) {
            this.toastr.warning('Vui lòng chọn một phân đoạn phụ đề để tách.');
            return;
        }

        const loc = this.findSubtitleSceneAndIndex(sub);
        if (!loc) return;
        const targetSub = loc.scene.subtitles[loc.subIdx];
        const text = String(targetSub.text || '');

        let cursorPos = -1;
        if (textarea && typeof textarea.selectionStart === 'number') {
            cursorPos = textarea.selectionStart;
        }

        if (cursorPos <= 0 || cursorPos >= text.length) {
            const punctIdx = text.search(/[.?!…\n]/);
            if (punctIdx > 0 && punctIdx < text.length - 1) {
                cursorPos = punctIdx + 1;
            } else {
                const words = text.split(/\s+/).filter(w => w.length > 0);
                if (words.length > 1) {
                    const mid = Math.ceil(words.length / 2);
                    const p1 = words.slice(0, mid).join(' ');
                    cursorPos = p1.length;
                } else {
                    cursorPos = Math.floor(text.length / 2);
                }
            }
        }

        const p1 = text.substring(0, cursorPos).trim();
        const p2 = text.substring(cursorPos).trim();

        if (!p1 || !p2) {
            this.toastr.warning('Vui lòng đặt con trỏ vào giữa ô văn bản để tách.');
            return;
        }

        const totalLen = Math.max(1, text.length);
        const ratio = Math.max(0.1, Math.min(0.9, p1.length / totalLen));

        const totalDur = Number(targetSub.duration) || 3;
        const d1 = Math.max(0.3, Math.round(totalDur * ratio * 10) / 10);
        const d2 = Math.max(0.3, Math.round((totalDur - d1) * 10) / 10);
        const start = Number(targetSub.startTime) || 0;
        const cutTime = Math.round((start + d1) * 100) / 100;

        const splitData = this.splitTextAndTranslations(targetSub, ratio, p1, p2);

        targetSub.duration = d1;
        targetSub.text = splitData.part1Text;
        targetSub.vietnameseText = splitData.viPart1;
        targetSub.originalText = splitData.origPart1;
        targetSub.translations = splitData.trans1;

        const newSub = {
            ...targetSub,
            id: Date.now() + Math.random(),
            startTime: cutTime,
            duration: d2,
            text: splitData.part2Text,
            vietnameseText: splitData.viPart2,
            originalText: splitData.origPart2,
            translations: splitData.trans2
        };

        loc.scene.subtitles.splice(loc.subIdx + 1, 0, newSub);

        this.normalizeData();
        this.saveData(true);
        this.updateActiveSubtitleInfo();
        this.updateFilteredMediaItems();
        this.cd.detectChanges();
        this.toastr.success(`Đã tách phụ đề thành 2 đoạn: "${p1.length > 20 ? p1.substring(0, 20) + '...' : p1}" (${d1}s) và "${p2.length > 20 ? p2.substring(0, 20) + '...' : p2}" (${d2}s)!`);
    }

    splitActiveSubtitleAtPlayhead() {
        if (!this.activeItem) return;
        const loc = this.findSubtitleSceneAndIndex(this.activeItem);
        if (!loc) return;
        this.splitSubtitleItem(this.activeItem, loc.sceneIdx, loc.subIdx, this.currentTimelineTime);
    }

    splitActiveSubtitleInHalf(targetSub?: any) {
        const sub = targetSub || this.activeItem;
        if (!sub) return;
        const loc = this.findSubtitleSceneAndIndex(sub);
        if (!loc) return;
        const target = loc.scene.subtitles[loc.subIdx];
        const cutTime = (Number(target.startTime) || 0) + ((Number(target.duration) || 3) / 2);
        this.splitSubtitleItem(target, loc.sceneIdx, loc.subIdx, cutTime);
    }

    smartAutoSplitSubtitle(targetSub?: any) {
        const sub = targetSub || this.activeItem;
        if (!sub) return;

        const loc = this.findSubtitleSceneAndIndex(sub);
        if (!loc) return;
        const target = loc.scene.subtitles[loc.subIdx];
        const text = String(target.text || '').trim();
        const duration = Number(target.duration) || 3;
        const startTime = Number(target.startTime) || 0;

        let parts = text.split(/(?<=[.?!…\n])\s+/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length <= 1) {
            parts = text.split(/(?<=[,;:—–])\s+/).map(p => p.trim()).filter(p => p.length > 0);
        }
        if (parts.length <= 1) {
            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length >= 6) {
                const mid = Math.ceil(words.length / 2);
                parts = [
                    words.slice(0, mid).join(' '),
                    words.slice(mid).join(' ')
                ];
            }
        }

        if (parts.length <= 1) {
            this.toastr.info('Phụ đề này đã đủ ngắn gọn, không cần tách thêm.');
            return;
        }

        let viParts: string[] = [];
        if (target.vietnameseText && target.vietnameseText.trim() !== text) {
            const viText = target.vietnameseText.trim();
            viParts = viText.split(/(?<=[.?!…\n])\s+/).map(p => p.trim()).filter(p => p.length > 0);
            if (viParts.length !== parts.length) {
                viParts = viText.split(/(?<=[,;:—–])\s+/).map(p => p.trim()).filter(p => p.length > 0);
            }
            if (viParts.length !== parts.length) {
                const viWords = viText.split(/\s+/).filter(w => w.length > 0);
                const totalWords = viWords.length;
                viParts = [];
                let viWordCursor = 0;
                const totalChars = parts.reduce((acc, p) => acc + p.length, 0) || 1;
                for (let i = 0; i < parts.length; i++) {
                    if (i === parts.length - 1) {
                        viParts.push(viWords.slice(viWordCursor).join(' '));
                    } else {
                        const chunkCount = Math.max(1, Math.round(totalWords * (parts[i].length / totalChars)));
                        viParts.push(viWords.slice(viWordCursor, viWordCursor + chunkCount).join(' '));
                        viWordCursor += chunkCount;
                    }
                }
            }
        }

        const totalChars = parts.reduce((acc, p) => acc + p.length, 0) || 1;
        const newSubs: any[] = [];
        let curTime = startTime;

        for (let i = 0; i < parts.length; i++) {
            const pText = parts[i];
            const pViText = viParts[i] || (this.isLikelyVietnamese(pText) ? pText : '');
            const pDur = (i === parts.length - 1)
                ? Math.max(0.3, Math.round((startTime + duration - curTime) * 100) / 100)
                : Math.max(0.3, Math.round(duration * (pText.length / totalChars) * 100) / 100);

            newSubs.push({
                ...target,
                id: Date.now() + i + Math.random(),
                startTime: Math.round(curTime * 100) / 100,
                duration: pDur,
                text: pText,
                vietnameseText: pViText,
                originalText: !this.isLikelyVietnamese(pText) ? pText : '',
                translations: {
                    'vi': pViText,
                    'original': !this.isLikelyVietnamese(pText) ? pText : pText,
                    'en': !this.isLikelyVietnamese(pText) ? pText : ''
                }
            });

            curTime += pDur;
        }

        loc.scene.subtitles.splice(loc.subIdx, 1, ...newSubs);

        this.activeItem = newSubs[0];
        this.normalizeData();
        this.saveData(true);
        this.updateActiveSubtitleInfo();
        this.updateFilteredMediaItems();
        this.cd.detectChanges();
        this.toastr.success(`Đã tự động tách phụ đề thành ${newSubs.length} phân đoạn ngắn gọn!`);
    }

    autoSplitAllLongSubtitles(scope: 'all' | 'selected' = 'all') {
        if (!this.projectData?.scenes) return;

        let splitCount = 0;
        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (!scene.subtitles || !Array.isArray(scene.subtitles)) continue;

            const newSubList: any[] = [];
            for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                const sub = scene.subtitles[subIdx];
                if (scope === 'selected' && !this.selectedItems.has(sub) && this.activeItem !== sub) {
                    newSubList.push(sub);
                    continue;
                }

                const text = String(sub.text || '').trim();
                const words = text.split(/\s+/).filter(w => w.length > 0);
                const hasMultipleSentences = /(?<=[.?!…\n])\s+/.test(text);
                const isLong = text.length > 35 || words.length > 8 || hasMultipleSentences;

                if (isLong && (Number(sub.duration) || 0) >= 1.5) {
                    let parts = text.split(/(?<=[.?!…\n])\s+/).map(p => p.trim()).filter(p => p.length > 0);
                    if (parts.length <= 1) {
                        parts = text.split(/(?<=[,;:—–])\s+/).map(p => p.trim()).filter(p => p.length > 0);
                    }
                    if (parts.length <= 1 && words.length >= 8) {
                        const mid = Math.ceil(words.length / 2);
                        parts = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
                    }

                    if (parts.length > 1) {
                        splitCount++;
                        const duration = Number(sub.duration) || 3;
                        const startTime = Number(sub.startTime) || 0;
                        const totalChars = parts.reduce((acc, p) => acc + p.length, 0) || 1;

                        let viParts: string[] = [];
                        if (sub.vietnameseText && sub.vietnameseText.trim() !== text) {
                            const viText = sub.vietnameseText.trim();
                            viParts = viText.split(/(?<=[.?!…\n])\s+/).map(p => p.trim()).filter(p => p.length > 0);
                            if (viParts.length !== parts.length) {
                                viParts = viText.split(/(?<=[,;:—–])\s+/).map(p => p.trim()).filter(p => p.length > 0);
                            }
                            if (viParts.length !== parts.length) {
                                const viWords = viText.split(/\s+/).filter(w => w.length > 0);
                                const totalWords = viWords.length;
                                viParts = [];
                                let viWordCursor = 0;
                                for (let i = 0; i < parts.length; i++) {
                                    if (i === parts.length - 1) {
                                        viParts.push(viWords.slice(viWordCursor).join(' '));
                                    } else {
                                        const chunkCount = Math.max(1, Math.round(totalWords * (parts[i].length / totalChars)));
                                        viParts.push(viWords.slice(viWordCursor, viWordCursor + chunkCount).join(' '));
                                        viWordCursor += chunkCount;
                                    }
                                }
                            }
                        }

                        let curTime = startTime;
                        for (let i = 0; i < parts.length; i++) {
                            const pText = parts[i];
                            const pViText = viParts[i] || (this.isLikelyVietnamese(pText) ? pText : '');
                            const pDur = (i === parts.length - 1)
                                ? Math.max(0.3, Math.round((startTime + duration - curTime) * 100) / 100)
                                : Math.max(0.3, Math.round(duration * (pText.length / totalChars) * 100) / 100);

                            newSubList.push({
                                ...sub,
                                id: Date.now() + i + Math.random(),
                                startTime: Math.round(curTime * 100) / 100,
                                duration: pDur,
                                text: pText,
                                vietnameseText: pViText,
                                originalText: !this.isLikelyVietnamese(pText) ? pText : '',
                                translations: {
                                    'vi': pViText,
                                    'original': !this.isLikelyVietnamese(pText) ? pText : pText,
                                    'en': !this.isLikelyVietnamese(pText) ? pText : ''
                                }
                            });
                            curTime += pDur;
                        }
                        continue;
                    }
                }
                newSubList.push(sub);
            }
            scene.subtitles = newSubList;
        }

        if (splitCount > 0) {
            this.normalizeData();
            this.saveData(true);
            this.updateActiveSubtitleInfo();
            this.updateFilteredMediaItems();
            this.cd.detectChanges();
            this.toastr.success(`Đã tự động tách ${splitCount} câu phụ đề dài thành các phân đoạn ngắn!`);
        } else {
            this.toastr.info('Không có phân đoạn phụ đề nào quá dài cần tách.');
        }
    }

    async exportCurrentSubtitles() {
        const electron = (window as any).electron;
        if (!electron || !electron.exportSubtitles) {
            this.toastr.warning('Tính năng chỉ hỗ trợ trên Desktop.');
            return;
        }

        const allSubs: any[] = [];
        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        if (!sub.disabled && sub.text && sub.text.trim()) {
                            allSubs.push({
                                text: sub.text.trim(),
                                startTime: Number(sub.startTime) || 0,
                                duration: Number(sub.duration) || 2
                            });
                        }
                    }
                }
            }
        }

        if (allSubs.length === 0) {
            this.toastr.warning('Chưa có nội dung phụ đề nào để xuất.');
            return;
        }

        const videoPath = this.activeVideo?.videoUrl || this.projectData?.scenes?.[0]?.videos?.[0]?.videoUrl || 'project_subtitles';
        const result = await electron.exportSubtitles({
            videoPath: videoPath,
            subtitles: allSubs,
            filename: `subtitles_${this.data.uuid || Date.now()}`
        });

        if (result && result.success) {
            this.toastr.success(`Đã xuất phụ đề: ${result.srtPath}`, 'Thành công', { timeOut: 6000 });
        } else {
            this.toastr.error('Lỗi khi xuất file phụ đề: ' + (result?.error || ''));
        }
    }

    activeItem: any = null;

    setActiveItem(item: any, event?: MouseEvent) {
        if (event) event.stopPropagation();

        if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
            if (item) {
                if (this.selectedItems.has(item)) {
                    this.selectedItems.delete(item);
                    if (this.activeItem === item) {
                        this.activeItem = this.selectedItems.size > 0 ? Array.from(this.selectedItems)[0] : null;
                    }
                } else {
                    this.selectedItems.add(item);
                    this.activeItem = item;
                }
            }
        } else {
            this.activeItem = item;
            if (item) {
                if (!this.selectedItems.has(item)) {
                    this.selectedItems.clear();
                    this.selectedItems.add(item);
                }
            } else {
                this.selectedItems.clear();
            }
        }

        if (this.activeItem && this.activeItem.audioUrl) {
            this.initInspectorWaveSurfer(this.activeItem.audioUrl);
        } else {
            this.destroyInspectorWaveSurfer();
        }

        if (item && item.videoUrl) {
            this.previewVideoUrl = item.videoUrl;
            this.previewImageUrl = item.imageUrl || null;
        } else if (item && item.imageUrl && !item.videoUrl) {
            this.previewVideoUrl = null;
            this.previewImageUrl = item.imageUrl;
        }

        if (!item) {
            this.updateTimelineSync();
        }
    }

    inspectorWaveSurfer: WaveSurfer | null = null;
    isInspectorAudioPlaying: boolean = false;

    destroyInspectorWaveSurfer() {
        if (this.inspectorWaveSurfer) {
            try {
                this.inspectorWaveSurfer.destroy();
            } catch (e) { }
            this.inspectorWaveSurfer = null;
            this.isInspectorAudioPlaying = false;
        }
    }

    initInspectorWaveSurfer(audioUrl: string) {
        this.destroyInspectorWaveSurfer();
        if (!audioUrl) return;

        setTimeout(() => {
            const container = document.getElementById('inspector-waveform-audio-container')
                || document.getElementById('inspector-waveform-sub-container')
                || document.getElementById('inspector-waveform-container');
            if (!container) return;

            try {
                container.innerHTML = '';
                const ws = WaveSurfer.create({
                    container: container,
                    waveColor: '#818cf8',
                    progressColor: '#c084fc',
                    cursorColor: '#f43f5e',
                    height: 44,
                    barWidth: 2,
                    barGap: 2,
                    barRadius: 2,
                    interact: true
                });

                this.loadAudioToWaveSurfer(ws, audioUrl);

                ws.on('play', () => {
                    this.isInspectorAudioPlaying = true;
                    this.cd.detectChanges();
                });

                ws.on('pause', () => {
                    this.isInspectorAudioPlaying = false;
                    this.cd.detectChanges();
                });

                ws.on('finish', () => {
                    this.isInspectorAudioPlaying = false;
                    this.cd.detectChanges();
                });

                this.inspectorWaveSurfer = ws;
            } catch (err) {
                console.error('Error creating inspector WaveSurfer:', err);
            }
        }, 120);
    }

    toggleInspectorWaveSurfer() {
        if (this.inspectorWaveSurfer) {
            try {
                if (this.inspectorWaveSurfer.isPlaying()) {
                    this.inspectorWaveSurfer.pause();
                } else {
                    this.inspectorWaveSurfer.play();
                }
                return;
            } catch (e) {
                console.warn('Inspector WaveSurfer play error:', e);
            }
        }
        if (this.activeItem && this.activeItem.audioUrl) {
            this.playDirectAudio(this.activeItem.audioUrl);
        }
    }

    mediaFilterTab: 'image' | 'video' | 'audio' | 'text' = 'video';
    mediaSearchText: string = '';
    previewSnippetAudio: HTMLAudioElement | null = null;
    playingAudioSnippetUrl: string | null = null;

    seekTimelineTo(seconds: number) {
        this.currentTimelineTime = Math.max(0, seconds || 0);
        this.updateTimelineSync(true);
        this.cd.detectChanges();
    }

    seekTimelineToStart() {
        this.seekTimelineTo(0);
    }

    formatTimelineTime(seconds: number): string {
        if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
        const totalSecs = Math.floor(seconds);
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    getAllProjectVideos(): any[] {
        const list: any[] = [];
        if (!this.projectData || !this.projectData.scenes) return list;
        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.videos) {
                for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                    const v = scene.videos[vIdx];
                    list.push({
                        ...v,
                        get duration() { return v.duration; },
                        get startTime() { return v.startTime; },
                        get maxDuration() { return v.maxDuration; },
                        get prompt() { return v.prompt; },
                        get imageUrl() { return v.imageUrl || v.controlImageUrl; },
                        get controlImageUrl() { return v.controlImageUrl; },
                        get videoUrl() { return v.videoUrl; },
                        _raw: v,
                        sceneIdx: sIdx,
                        vIdx: vIdx,
                        type: 'video'
                    });
                }
            }
        }
        return list;
    }

    getAllProjectImages(): any[] {
        const list: any[] = [];
        if (!this.projectData || !this.projectData.scenes) return list;
        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.images) {
                for (let imgIdx = 0; imgIdx < scene.images.length; imgIdx++) {
                    const img = scene.images[imgIdx];
                    list.push({
                        ...img,
                        get duration() { return img.duration; },
                        get startTime() { return img.startTime; },
                        get maxDuration() { return img.maxDuration; },
                        get prompt() { return img.prompt || img.title; },
                        get imageUrl() { return img.imageUrl || img.controlImageUrl; },
                        get controlImageUrl() { return img.controlImageUrl; },
                        _raw: img,
                        sceneIdx: sIdx,
                        imgIdx: imgIdx,
                        type: 'image',
                        title: img.title || img.prompt || ('Hình ảnh ' + (imgIdx + 1))
                    });
                }
            }
            if (scene.videos) {
                for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                    const v = scene.videos[vIdx];
                    const imgUrl = v.imageUrl || v.controlImageUrl;
                    if (!imgUrl) continue;
                    list.push({
                        ...v,
                        get duration() { return v.duration; },
                        get startTime() { return v.startTime; },
                        get maxDuration() { return v.maxDuration; },
                        get prompt() { return v.prompt; },
                        get imageUrl() { return imgUrl; },
                        get controlImageUrl() { return v.controlImageUrl; },
                        get videoUrl() { return v.videoUrl; },
                        _raw: v,
                        sceneIdx: sIdx,
                        vIdx: vIdx,
                        type: 'image',
                        title: v.imagePrompt || v.prompt || ('Hình ảnh cảnh ' + (sIdx + 1))
                    });
                }
            }
        }
        return list;
    }

    getAllProjectAudios(): any[] {
        const list: any[] = [];
        if (!this.projectData || !this.projectData.scenes) return list;
        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.extractedAudios) {
                for (let aIdx = 0; aIdx < scene.extractedAudios.length; aIdx++) {
                    list.push({
                        ...scene.extractedAudios[aIdx],
                        _raw: scene.extractedAudios[aIdx],
                        sceneIdx: sIdx,
                        aIdx: aIdx,
                        type: 'extractedAudio',
                        title: 'Âm thanh #' + (aIdx + 1)
                    });
                }
            }
            if (scene.subtitles) {
                for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                    const sub = scene.subtitles[subIdx];
                    if (sub.audioUrl) {
                        list.push({
                            ...sub,
                            _raw: sub,
                            sceneIdx: sIdx,
                            subIdx: subIdx,
                            type: 'audio',
                            title: sub.text ? (sub.text.length > 25 ? sub.text.substring(0, 25) + '...' : sub.text) : ('Audio #' + (subIdx + 1))
                        });
                    }
                }
            }
        }
        return list;
    }

    getAllProjectSubtitles(): any[] {
        const list: any[] = [];
        if (!this.projectData || !this.projectData.scenes) return list;
        const seenKeys = new Set<string>();

        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.subtitles) {
                for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                    const sub = scene.subtitles[subIdx];
                    const key = `${sub.id || `${sIdx}_${subIdx}`}_${Math.round((sub.startTime || 0) * 100)}`;
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);

                    list.push({
                        ...sub,
                        _raw: sub,
                        sceneIdx: sIdx,
                        subIdx: subIdx,
                        type: 'subtitle'
                    });
                }
            }
        }
        return list;
    }

    getAllProjectTexts(): any[] {
        const list: any[] = [];
        if (!this.projectData || !this.projectData.scenes) return list;
        const seenKeys = new Set<string>();

        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.texts) {
                for (let textIdx = 0; textIdx < scene.texts.length; textIdx++) {
                    const txt = scene.texts[textIdx];
                    const key = `${txt.id || `${sIdx}_${textIdx}`}_${Math.round((txt.startTime || 0) * 100)}`;
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);

                    list.push({
                        ...txt,
                        _raw: txt,
                        sceneIdx: sIdx,
                        textIdx: textIdx,
                        type: 'customText'
                    });
                }
            }
        }
        return list;
    }

    currentSubtitleLang: string = 'original';
    isTranslatingSubtitles: boolean = false;

    readonly SUBTITLE_LANGUAGES: Array<{ code: string, label: string, icon: string }> = [
        { code: 'original', label: 'Ngôn ngữ gốc (Transcript)', icon: '🌐' },
        { code: 'vi', label: 'Tiếng Việt', icon: '🇻🇳' },
        { code: 'en', label: 'Tiếng Anh (English)', icon: '🇬🇧' },
        { code: 'zh', label: 'Tiếng Trung (中文)', icon: '🇨🇳' },
        { code: 'ja', label: 'Tiếng Nhật (日本語)', icon: '🇯🇵' },
        { code: 'ko', label: 'Tiếng Hàn (한국어)', icon: '🇰🇷' },
        { code: 'fr', label: 'Tiếng Pháp (Français)', icon: '🇫🇷' },
        { code: 'es', label: 'Tiếng Tây Ban Nha (Español)', icon: '🇪🇸' },
        { code: 'de', label: 'Tiếng Đức (Deutsch)', icon: '🇩🇪' },
        { code: 'th', label: 'Tiếng Thái (ไทย)', icon: '🇹🇭' }
    ];

    trackByLangCode(index: number, item: any): string {
        return item?.code || index.toString();
    }

    getSubtitleLangBadge(): string {
        if (!this.currentSubtitleLang || this.currentSubtitleLang === 'original') return 'OG';
        return this.currentSubtitleLang.substring(0, 2).toUpperCase();
    }

    isLikelyVietnamese(text: string): boolean {
        if (!text) return false;
        return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
    }

    getAvailableSubtitleLanguages(): Array<{ code: string, label: string, count: number, isCurrent: boolean, icon: string }> {
        const list: Array<{ code: string, label: string, count: number, isCurrent: boolean, icon: string }> = [];
        const allSubs = this.getAllProjectSubtitles();
        const totalCount = allSubs.length;

        for (const lang of this.SUBTITLE_LANGUAGES) {
            list.push({
                code: lang.code,
                label: lang.label,
                count: totalCount,
                isCurrent: this.currentSubtitleLang === lang.code,
                icon: lang.icon
            });
        }

        return list;
    }

    async readSrtFileDirect(filePath: string): Promise<string | null> {
        const electron = (window as any).electron;
        if (!electron || !electron.invoke) return null;
        try {
            const res = await electron.invoke('read-file-base64', { filePath });
            if (res && res.success && res.base64) {
                const binString = atob(res.base64);
                const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
                return new TextDecoder().decode(bytes);
            }
        } catch (e) {
            console.warn('[readSrtFileDirect] Lỗi đọc file:', filePath, e);
        }
        return null;
    }

    async loadSubtitlesFromDiskFiles(): Promise<boolean> {
        console.log('[loadSubtitlesFromDiskFiles] Bắt đầu tìm kiếm file audio & phụ đề từ đĩa...');
        const electron = (window as any).electron;
        if (!electron || !electron.invoke) return false;

        const candidateDirs = new Set<string>();

        const extractDirFromUrl = (rawUrl: string) => {
            if (!rawUrl) return;
            let clean = rawUrl;
            if (clean.startsWith('media://')) clean = decodeURIComponent(clean.substring(8));
            else if (clean.startsWith('file://')) clean = decodeURIComponent(clean.substring(7));
            else if (clean.startsWith('mediacors://')) clean = decodeURIComponent(clean.substring(12));
            if (clean.match(/^\/[a-zA-Z]:[\\/]/)) clean = clean.substring(1);

            const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
            if (lastSlash >= 0) {
                candidateDirs.add(clean.substring(0, lastSlash));
            }
        };

        if (this.projectData?.mediaDir) {
            candidateDirs.add(this.projectData.mediaDir);
        }
        if (this.data?.mediaDir) {
            candidateDirs.add(this.data.mediaDir);
        }

        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos) {
                    for (const v of scene.videos) {
                        if (v.videoUrl) extractDirFromUrl(v.videoUrl);
                    }
                }
            }
        }

        const projectUuid = this.projectData?.uuid || this.data?.uuid;
        if (projectUuid) {
            candidateDirs.add(`/home/yenai/Downloads/AI.TYPING/${projectUuid}`);
            candidateDirs.add(`/home/yenai/Downloads/AI.TYPING/video_${projectUuid}`);
        }

        console.log('[loadSubtitlesFromDiskFiles] Candidate directories:', Array.from(candidateDirs));

        let scanResult: any = null;
        for (const dir of candidateDirs) {
            try {
                const res = await electron.invoke('scan-subtitles-in-project', { dir });
                if (res && res.success && (res.originalContent || (res.audioSegments && res.audioSegments.length > 0))) {
                    scanResult = res;
                    console.log('[loadSubtitlesFromDiskFiles] TÌM THẤY DỮ LIỆU TẠI THƯ MỤC:', dir, res);
                    break;
                }
            } catch (e) {}
        }

        if (!scanResult) {
            console.log('[loadSubtitlesFromDiskFiles] Không tìm thấy dữ liệu trên đĩa.');
            return false;
        }

        const origSubs = scanResult.originalContent ? this.parseSrtContent(scanResult.originalContent) : [];
        const viSubs = scanResult.viContent ? this.parseSrtContent(scanResult.viContent) : [];
        const audioSegs: any[] = scanResult.audioSegments || [];
        const mainAudio = scanResult.mainAudio;

        console.log(`[loadSubtitlesFromDiskFiles] Đọc được: ${origSubs.length} câu SRT gốc, ${viSubs.length} câu tiếng Việt, ${audioSegs.length} file audio mp3`);

        if (this.projectData?.scenes && this.projectData.scenes.length > 0) {
            const firstScene = this.projectData.scenes[0];

            // Nếu scene.extractedAudios bị rỗng hoặc thiếu files, tái tạo lại toàn bộ từ các file đã cắt trên đĩa
            if (!firstScene.extractedAudios || firstScene.extractedAudios.length === 0 || firstScene.extractedAudios.length < audioSegs.length) {
                const restoredAudios: any[] = [];
                const restoredSubs: any[] = [];

                const count = Math.max(origSubs.length, audioSegs.length);
                for (let i = 0; i < count; i++) {
                    const srt: any = origSubs[i] || {};
                    const viSrt: any = viSubs[i] || {};
                    const segFile = audioSegs[i] || audioSegs.find((a: any) => a.index === i) || (mainAudio ? mainAudio : null);
                    const segUrl = segFile ? segFile.url : null;
                    const segStart = srt.startTime !== undefined ? srt.startTime : (i * 2);
                    const segDur = srt.duration !== undefined ? srt.duration : 2;
                    const segOrigText = srt.text || `Phần ${i + 1}`;
                    const segViText = viSrt.text || segOrigText;

                    if (segUrl) {
                        restoredAudios.push({
                            id: Date.now() + i,
                            text: segOrigText,
                            originalText: segOrigText,
                            vietnameseText: segViText,
                            audioUrl: segUrl,
                            startTime: segStart,
                            duration: segDur,
                            maxDuration: segDur
                        });
                    }

                    restoredSubs.push({
                        id: Date.now() + 1000 + i,
                        text: this.currentSubtitleLang === 'original' || this.currentSubtitleLang === 'en' ? segOrigText : segViText,
                        originalText: segOrigText,
                        vietnameseText: segViText,
                        translations: {
                            'vi': segViText,
                            'original': segOrigText,
                            'en': segOrigText
                        },
                        startTime: segStart,
                        duration: segDur
                    });
                }

                if (restoredAudios.length > 0) {
                    firstScene.extractedAudios = restoredAudios;
                }
                if (restoredSubs.length > 0) {
                    firstScene.subtitles = restoredSubs;
                }
                if (firstScene.videos) {
                    firstScene.videos.forEach((v: any) => v.muted = true);
                }
            } else {
                // Đã có extractedAudios, chỉ cần đồng bộ lại đường dẫn audioUrl và text
                for (let i = 0; i < firstScene.extractedAudios.length; i++) {
                    const a = firstScene.extractedAudios[i];
                    const segFile = audioSegs[i] || audioSegs.find((s: any) => s.index === i);
                    if (segFile && segFile.url) {
                        a.audioUrl = segFile.url;
                    }
                    if (origSubs[i] && origSubs[i].text) {
                        a.originalText = origSubs[i].text;
                        a.text = origSubs[i].text;
                    }
                    if (viSubs[i] && viSubs[i].text) {
                        a.vietnameseText = viSubs[i].text;
                    }
                }

                if (firstScene.subtitles) {
                    for (let i = 0; i < firstScene.subtitles.length; i++) {
                        const sub = firstScene.subtitles[i];
                        if (!sub.translations) sub.translations = {};
                        if (origSubs[i] && origSubs[i].text) {
                            sub.originalText = origSubs[i].text;
                            sub.translations['original'] = origSubs[i].text;
                            sub.translations['en'] = origSubs[i].text;
                        }
                        if (viSubs[i] && viSubs[i].text) {
                            sub.vietnameseText = viSubs[i].text;
                            sub.translations['vi'] = viSubs[i].text;
                        }
                    }
                }
            }

            this.applySubtitleLanguage(this.currentSubtitleLang);
            this.normalizeData();
            this.saveData();
            this.cd.markForCheck();
            this.cd.detectChanges();
            setTimeout(() => {
                this.initWaveSurfers();
                this.updateLines();
            }, 300);
        }

        return true;
    }

    syncSubtitlesWithExtractedAudios() {
        if (!this.projectData?.scenes) return;

        for (const scene of this.projectData.scenes) {
            if (!scene.extractedAudios || scene.extractedAudios.length === 0) continue;
            if (!scene.subtitles) scene.subtitles = [];

            // 1. Tự động bổ sung các phân đoạn subtitle còn thiếu nếu extractedAudios có mà subtitles chưa có (đầy đủ 100% như audio)
            for (const aud of scene.extractedAudios) {
                const aStart = Number(aud.startTime) || 0;
                const aDur = Number(aud.duration) || 2;
                const aOrig = String(aud.originalText || aud.text || '').trim();
                const aVi = String(aud.vietnameseText || aud.text || '').trim();

                const existingSub = scene.subtitles.find((s: any) => 
                    (s.audioId && aud.id && s.audioId === aud.id) ||
                    (s.id && aud.id && (s.id === aud.id || s.id === aud.id + 100000 || s.id === aud.id + 1000)) ||
                    (Math.abs((Number(s.startTime) || 0) - aStart) < 0.25)
                );

                if (!existingSub && (aOrig || aVi)) {
                    const subText = this.currentSubtitleLang === 'vi' ? (aVi || aOrig) : (aOrig || aVi);
                    scene.subtitles.push({
                        id: (aud.id ? aud.id + 100000 : Date.now() + Math.random()),
                        audioId: aud.id,
                        text: subText,
                        originalText: aOrig,
                        vietnameseText: aVi,
                        translations: {
                            'vi': aVi,
                            'original': aOrig,
                            'en': aOrig
                        },
                        startTime: aStart,
                        duration: aDur
                    });
                }
            }

            // Sắp xếp lại subtitles theo timeline
            scene.subtitles.sort((a: any, b: any) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

            // 2. Đồng bộ hoá chính xác từng subtitle với audio tương ứng (KHÔNG dùng index mảng bừa bãi)
            for (let i = 0; i < scene.subtitles.length; i++) {
                const sub = scene.subtitles[i];
                const subStart = Number(sub.startTime) || 0;
                const matchingAudio = scene.extractedAudios.find((a: any) => 
                    (sub.audioId && a.id && sub.audioId === a.id) ||
                    (sub.id && a.id && (a.id === sub.id || a.id === sub.id - 100000 || a.id === sub.id - 1000)) ||
                    (Math.abs((Number(a.startTime) || 0) - subStart) < 0.25) ||
                    (subStart >= (Number(a.startTime) || 0) - 0.05 && subStart < (Number(a.startTime) || 0) + (Number(a.duration) || 0))
                );

                if (matchingAudio) {
                    if (matchingAudio.originalText && matchingAudio.originalText !== '[Âm thanh gốc]') {
                        sub.originalText = matchingAudio.originalText;
                    } else if (matchingAudio.text && matchingAudio.text !== '[Âm thanh gốc]' && !this.isLikelyVietnamese(matchingAudio.text)) {
                        sub.originalText = matchingAudio.text;
                    }

                    if (matchingAudio.vietnameseText && matchingAudio.vietnameseText !== '[Âm thanh gốc]') {
                        sub.vietnameseText = matchingAudio.vietnameseText;
                    }
                }

                if (!sub.vietnameseText && sub.text && this.isLikelyVietnamese(sub.text)) {
                    sub.vietnameseText = sub.text;
                }

                if (!sub.translations) sub.translations = {};
                if (sub.vietnameseText) sub.translations['vi'] = sub.vietnameseText;
                if (sub.originalText) {
                    sub.translations['original'] = sub.originalText;
                    if (!this.isLikelyVietnamese(sub.originalText)) {
                        sub.translations['en'] = sub.originalText;
                    }
                }
            }
        }
    }

    applySubtitleLanguage(langCode: string) {
        if (!this.projectData || !this.projectData.scenes) return;

        this.currentSubtitleLang = langCode;
        this.syncSubtitlesWithExtractedAudios();

        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (scene.subtitles) {
                for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                    const sub = scene.subtitles[subIdx];

                    if (langCode === 'vi') {
                        const vi = sub.vietnameseText || (sub.translations && sub.translations['vi']);
                        if (vi) sub.text = vi;
                    } else if (langCode === 'original' || langCode === 'en' || langCode === 'zh') {
                        const orig = sub.originalText || (sub.translations && (sub.translations['original'] || sub.translations['zh'] || sub.translations['en']));
                        if (orig) sub.text = orig;
                    } else if (sub.translations && sub.translations[langCode]) {
                        sub.text = sub.translations[langCode];
                    }
                }
            }
        }

        this.updateFilteredMediaItems();
        this.markDirty();
        this.saveData();
        this.cd.markForCheck();
        this.cd.detectChanges();
        setTimeout(() => this.updateLines(), 50);
    }

    async switchSubtitleLanguage(langCode: string) {
        console.log('[switchSubtitleLanguage] CLICKED CHUYỂN SANG:', langCode);
        if (!this.projectData || !this.projectData.scenes) return;
        this.currentSubtitleLang = langCode;

        // 1. Quét và nạp trực tiếp file SRT từ đĩa
        await this.loadSubtitlesFromDiskFiles();

        // 2. Đồng bộ câu thoại
        this.syncSubtitlesWithExtractedAudios();

        // 3. Áp dụng ngôn ngữ hiển thị
        this.applySubtitleLanguage(langCode);

        const targetLangObj = this.SUBTITLE_LANGUAGES.find(l => l.code === langCode);
        const targetLangName = targetLangObj ? targetLangObj.label : langCode;

        // 4. Nếu là ngôn ngữ khác chưa dịch -> Dùng AI dịch
        if (langCode !== 'vi' && langCode !== 'original' && langCode !== 'en') {
            const allSubs: any[] = [];
            for (const scene of this.projectData.scenes) {
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        allSubs.push(sub);
                    }
                }
            }

            const alreadyTranslated = allSubs.every(s => s.translations && s.translations[langCode] && s.translations[langCode].trim().length > 0);
            if (!alreadyTranslated) {
                try {
                    this.isTranslatingSubtitles = true;
                    this.cd.detectChanges();
                    this.toastr.info(`AI đang dịch ${allSubs.length} đoạn phụ đề sang ${targetLangName}...`, 'Đang dịch AI');

                    const subsToTranslate = allSubs.map((s, idx) => ({
                        index: idx,
                        text: s.vietnameseText || s.originalText || s.text || ''
                    }));

                    const prompt = `Translate the following list of video subtitles to ${targetLangName} (${langCode}).
Rules:
1. Translate all dialogue naturally into ${targetLangName}.
2. For audio bracket tags like [Nhạc nền], [Tiếng nổ], [Á!]: translate them (e.g. into English: [Background music], [Explosion], [Ah!]).
3. Return ONLY a JSON array in format: [{"index": 0, "translatedText": "..."}]

Subtitles list:
${JSON.stringify(subsToTranslate, null, 2)}`;

                    const response: any = await this._genaiService.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        config: {
                            temperature: 0.1,
                            responseMimeType: 'application/json',
                            skipTTS: true,
                            bypassAiAgent: true,
                            bypassModelOverride: true
                        } as any
                    });

                    let rawText = '';
                    if (typeof response === 'string') rawText = response;
                    else if ((response as any)?.text) rawText = typeof (response as any).text === 'function' ? (response as any).text() : (response as any).text;
                    else if ((response as any)?.candidates?.[0]?.content?.parts?.[0]?.text) {
                        rawText = (response as any).candidates[0].content.parts[0].text;
                    }

                    const cleanText = (rawText || '').replace(/```json/gi, '').replace(/```/g, '').trim();
                    let parsedItems: any[] = [];
                    try {
                        const parsed = JSON.parse(cleanText);
                        if (Array.isArray(parsed)) parsedItems = parsed;
                        else if (parsed && typeof parsed === 'object') {
                            for (const key of ['translations', 'subtitles', 'data', 'result', 'results', 'items', 'list']) {
                                if (Array.isArray(parsed[key])) {
                                    parsedItems = parsed[key];
                                    break;
                                }
                            }
                        }
                    } catch (e) {}

                    if (parsedItems.length > 0) {
                        for (let i = 0; i < parsedItems.length; i++) {
                            const item = parsedItems[i];
                            const idx = item.index !== undefined ? Number(item.index) : i;
                            const transText = String(item.translatedText || item.translation || item.text || item.content || '').trim();
                            if (allSubs[idx] && transText) {
                                const targetSub = allSubs[idx];
                                if (!targetSub.translations) targetSub.translations = {};
                                targetSub.translations[langCode] = transText;
                                targetSub.text = transText;
                            }
                        }
                    }

                    this.applySubtitleLanguage(langCode);
                    this.toastr.success(`Đã dịch và chuyển phụ đề sang: ${targetLangName}!`);
                } catch (err: any) {
                    console.error('[SwitchSubtitleLanguage] Lỗi dịch phụ đề AI:', err);
                    this.applySubtitleLanguage(langCode);
                } finally {
                    this.isTranslatingSubtitles = false;
                    this.cd.detectChanges();
                }
                return;
            }
        }

        this.toastr.success(`Đã chuyển hiển thị phụ đề sang: ${targetLangName}`);
    }

    setMediaFilterTab(tab: 'image' | 'video' | 'audio' | 'text') {
        this.mediaFilterTab = tab;
        this.updateFilteredMediaItems();
        this.cd.detectChanges();
    }

    updateFilteredMediaItems() {
        let items: any[] = [];
        if (this.mediaFilterTab === 'video') {
            items = items.concat(this.getAllProjectVideos().filter(v => v.videoUrl));
        }
        if (this.mediaFilterTab === 'image') {
            items = items.concat(this.getAllProjectImages());
        }
        if (this.mediaFilterTab === 'audio') {
            items = items.concat(this.getAllProjectAudios());
        }
        if (this.mediaFilterTab === 'text') {
            items = items.concat(this.getAllProjectSubtitles()).concat(this.getAllProjectTexts());
        }

        if (this.mediaSearchText && this.mediaSearchText.trim()) {
            const q = this.mediaSearchText.trim().toLowerCase();
            items = items.filter(it => {
                const textMatch = it.text && it.text.toLowerCase().includes(q);
                const promptMatch = it.prompt && it.prompt.toLowerCase().includes(q);
                const titleMatch = it.title && it.title.toLowerCase().includes(q);
                return textMatch || promptMatch || titleMatch;
            });
        }
        this.filteredMediaItems = items;
    }

    getFilteredMediaItems(): any[] {
        if (!this.filteredMediaItems) {
            this.updateFilteredMediaItems();
        }
        return this.filteredMediaItems;
    }

    trackByMediaItem(index: number, item: any): string {
        if (!item) return String(index);
        const raw = item._raw || item;
        const id = raw.id || `${item.type}_${item.sceneIdx}_${item.vIdx ?? item.subIdx ?? item.aIdx ?? index}`;
        return `${item.type}_${id}_${raw.text || ''}_${this.currentSubtitleLang}`;
    }

    playSnippetAudio(url: string, event?: MouseEvent) {
        if (event) event.stopPropagation();
        if (!url) return;

        if (this.playingAudioSnippetUrl === url && this.previewSnippetAudio) {
            this.previewSnippetAudio.pause();
            this.previewSnippetAudio = null;
            this.playingAudioSnippetUrl = null;
            return;
        }

        if (this.previewSnippetAudio) {
            this.previewSnippetAudio.pause();
            this.previewSnippetAudio = null;
        }

        const rawUrl = this.getRawMediaUrl(url);
        if (!rawUrl) return;

        this.previewSnippetAudio = new Audio(rawUrl as string);
        this.playingAudioSnippetUrl = url;
        this.previewSnippetAudio.play().catch(() => { });
        this.previewSnippetAudio.onended = () => {
            this.playingAudioSnippetUrl = null;
            this.previewSnippetAudio = null;
            this.cd.detectChanges();
        };
    }

    getSelectedAudios(): any[] {
        const audios: any[] = [];
        if (this.selectedItems && this.selectedItems.size > 0) {
            for (const item of this.selectedItems) {
                if (this.getItemType(item) === 'audio') {
                    audios.push(item);
                }
            }
        }
        if (audios.length === 0 && this.activeItem && this.getItemType(this.activeItem) === 'audio') {
            audios.push(this.activeItem);
        }
        return audios;
    }

    get hasAudioSelection(): boolean {
        return this.getSelectedAudios().length > 0;
    }

    get isMultiAudioSelected(): boolean {
        return this.getSelectedAudios().length > 1;
    }

    get selectedAudioCount(): number {
        return this.getSelectedAudios().length;
    }

    getSelectedSubtitles(): any[] {
        const subs: any[] = [];
        if (this.selectedItems && this.selectedItems.size > 0) {
            for (const item of this.selectedItems) {
                if (this.getItemType(item) === 'text') {
                    subs.push(item);
                }
            }
        }
        if (subs.length === 0 && this.activeItem && this.getItemType(this.activeItem) === 'text') {
            subs.push(this.activeItem);
        }
        return subs;
    }

    get hasTextSelection(): boolean {
        return this.getSelectedSubtitles().length > 0;
    }

    get isMultiTextSelected(): boolean {
        return this.getSelectedSubtitles().length > 1;
    }

    get selectedTextCount(): number {
        return this.getSelectedSubtitles().length;
    }

    getSelectedVideos(): any[] {
        const vids: any[] = [];
        if (this.selectedItems && this.selectedItems.size > 0) {
            for (const item of this.selectedItems) {
                if (this.getItemType(item) === 'video') {
                    vids.push(item);
                }
            }
        }
        if (vids.length === 0 && this.activeItem && this.getItemType(this.activeItem) === 'video') {
            vids.push(this.activeItem);
        }
        return vids;
    }

    get hasVideoSelection(): boolean {
        return this.getSelectedVideos().length > 0;
    }

    get isMultiVideoSelected(): boolean {
        return this.getSelectedVideos().length > 1;
    }

    get selectedVideoCount(): number {
        return this.getSelectedVideos().length;
    }

    get currentInspectorType(): 'audio' | 'text' | 'video' | 'empty' {
        if (this.activeItem) {
            const t = this.getItemType(this.activeItem);
            if (t === 'audio' && this.hasAudioSelection) return 'audio';
            if (t === 'text' && this.hasTextSelection) return 'text';
            if (t === 'video' && this.hasVideoSelection) return 'video';
        }
        if (this.hasAudioSelection) return 'audio';
        if (this.hasTextSelection) return 'text';
        if (this.hasVideoSelection) return 'video';
        return 'empty';
    }

    DEFAULT_FONTS = [
        { label: 'Mặc định (Sans-Serif)', value: 'sans-serif' },
        { label: 'Be Vietnam Pro', value: 'Be Vietnam Pro' },
        { label: 'Montserrat', value: 'Montserrat' },
        { label: 'Roboto', value: 'Roboto' },
        { label: 'Inter', value: 'Inter' },
        { label: 'Oswald (Đậm cá tính)', value: 'Oswald' },
        { label: 'Playfair Display (Serif sang trọng)', value: 'Playfair Display' },
        { label: 'DejaVu Sans (Chuẩn Video/ASS)', value: 'DejaVu Sans' },
        { label: 'Arial', value: 'Arial' },
        { label: 'Courier New (Monospace)', value: 'Courier New' }
    ];

    systemFontList: { label: string; value: string; folderName?: string }[] = [];

    async loadSystemFonts(): Promise<void> {
        try {
            let groups: any[] = [];
            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('fonts:list');
                if (res && res.success && res.groups) {
                    groups = res.groups;
                }
            } else {
                const saved = localStorage.getItem('ai_type_web_font_groups');
                if (saved) {
                    groups = JSON.parse(saved);
                }
            }

            const sysFonts: { label: string; value: string; folderName?: string }[] = [];
            for (const group of groups) {
                if (!group.fonts) continue;
                for (const item of group.fonts) {
                    if (!item.fontName) continue;
                    sysFonts.push({
                        label: item.fontName,
                        value: item.fontName,
                        folderName: group.folderName
                    });

                    // Đăng ký @font-face vào document head để hiển thị trực tiếp
                    if (item.dataUrl) {
                        const styleId = `font-face-timeline-${item.fontName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                        if (!document.getElementById(styleId)) {
                            const styleEl = document.createElement('style');
                            styleEl.id = styleId;
                            let format = 'truetype';
                            if (item.extension === '.otf') format = 'opentype';
                            else if (item.extension === '.woff') format = 'woff';
                            else if (item.extension === '.woff2') format = 'woff2';

                            styleEl.appendChild(document.createTextNode(`
                                @font-face {
                                    font-family: '${item.fontName}';
                                    src: url('${item.dataUrl}') format('${format}');
                                    font-weight: normal;
                                    font-style: normal;
                                    font-display: swap;
                                }
                            `));
                            document.head.appendChild(styleEl);
                        }
                    }
                }
            }
            this.systemFontList = sysFonts;
            this.cd.detectChanges();
        } catch (e) {
            console.warn('Lỗi nạp font hệ thống cho Video Timeline:', e);
        }
    }

    get currentSubtitleFont(): string {
        if (this.projectData && this.projectData.subtitleFontFamily) return this.projectData.subtitleFontFamily;
        const subs = this.getSelectedSubtitles();
        if (subs.length > 0 && subs[0].fontFamily) return subs[0].fontFamily;
        return 'sans-serif';
    }

    setSubtitleFont(font: string) {
        if (!font) return;
        if (this.projectData) {
            this.projectData.subtitleFontFamily = font;
            if (this.projectData.scenes) {
                for (const scene of this.projectData.scenes) {
                    if (scene.subtitles) {
                        for (const sub of scene.subtitles) {
                            sub.fontFamily = font;
                        }
                    }
                }
            }
        }
        if (this.currentSubtitleInfo) {
            this.currentSubtitleInfo.fontFamily = font;
        }
        this.markDirty();
        this.cd.detectChanges();
    }

    get currentSubtitleFontSize(): number {
        if (this.projectData && this.projectData.subtitleFontSize) return this.projectData.subtitleFontSize;
        const subs = this.getSelectedSubtitles();
        if (subs.length > 0 && subs[0].fontSize) return subs[0].fontSize;
        return 24;
    }

    setSubtitleFontSize(size: number | string, isFinal = true) {
        if (size === '' || size === null || size === undefined) return;
        const num = Number(size);
        if (isNaN(num)) return;

        let numSize = num;
        if (isFinal) {
            numSize = Math.max(12, Math.min(72, num));
        } else {
            if (num < 1 || num > 150) return;
        }

        if (this.projectData) {
            this.projectData.subtitleFontSize = numSize;
            if (this.projectData.scenes) {
                for (const scene of this.projectData.scenes) {
                    if (scene.subtitles) {
                        for (const sub of scene.subtitles) {
                            sub.fontSize = numSize;
                        }
                    }
                }
            }
        }
        if (this.currentSubtitleInfo) {
            this.currentSubtitleInfo.fontSize = numSize;
        }
        this.markDirty();
        this.cd.detectChanges();
    }

    onSubtitleFontSizeBlur(event: any) {
        const val = event.target.value;
        const num = Number(val);
        const clamped = isNaN(num) || !val ? (this.currentSubtitleFontSize || 24) : Math.max(12, Math.min(72, num));
        event.target.value = clamped;
        this.setSubtitleFontSize(clamped, true);
    }

    get currentSubtitleBottom(): number {
        if (this.projectData && this.projectData.subtitleBottom !== undefined && this.projectData.subtitleBottom !== null) {
            return this.projectData.subtitleBottom;
        }
        const subs = this.getSelectedSubtitles();
        if (subs.length > 0 && subs[0].bottom !== undefined) return subs[0].bottom;
        return 20;
    }

    setSubtitleBottom(bottom: number | string, isFinal = true) {
        if (bottom === '' || bottom === null || bottom === undefined) return;
        const num = Number(bottom);
        if (isNaN(num)) return;

        let numBottom = num;
        if (isFinal) {
            numBottom = Math.max(0, Math.min(300, num));
        } else {
            if (num < 0 || num > 500) return;
        }

        if (this.projectData) {
            this.projectData.subtitleBottom = numBottom;
            if (this.projectData.scenes) {
                for (const scene of this.projectData.scenes) {
                    if (scene.subtitles) {
                        for (const sub of scene.subtitles) {
                            sub.bottom = numBottom;
                        }
                    }
                }
            }
        }
        if (this.currentSubtitleInfo) {
            this.currentSubtitleInfo.bottom = numBottom;
        }
        this.markDirty();
        this.cd.detectChanges();
    }

    onSubtitleBottomBlur(event: any) {
        const val = event.target.value;
        const num = Number(val);
        const clamped = isNaN(num) || !val ? (this.currentSubtitleBottom || 20) : Math.max(0, Math.min(300, num));
        event.target.value = clamped;
        this.setSubtitleBottom(clamped, true);
    }

    onIndividualSubFontSizeInput(sub: any, val: string) {
        if (!val || val.trim() === '') return;
        const num = Number(val);
        if (!isNaN(num) && num >= 1 && num <= 150) {
            sub.fontSize = num;
            this.markDirty();
        }
    }

    onIndividualSubFontSizeBlur(sub: any, event: any) {
        const val = event.target.value;
        const num = Number(val);
        const clamped = isNaN(num) || !val ? (this.currentSubtitleFontSize || 24) : Math.max(12, Math.min(72, num));
        sub.fontSize = clamped;
        event.target.value = clamped;
        this.markDirty();
        this.cd.detectChanges();
    }

    applySubtitleStyleToAll() {
        if (!this.projectData || !this.projectData.scenes) return;
        const font = this.currentSubtitleFont;
        const size = this.currentSubtitleFontSize;
        let count = 0;
        for (const scene of this.projectData.scenes) {
            if (scene.subtitles) {
                for (const sub of scene.subtitles) {
                    sub.fontFamily = font;
                    sub.fontSize = size;
                    count++;
                }
            }
        }
        this.markDirty();
        this.toastr.success(`Đã áp dụng Font và Cỡ chữ cho toàn bộ ${count} phụ đề trong dự án!`);
        this.cd.detectChanges();
    }

    get audioVolumeValue(): number {
        const audios = this.getSelectedAudios();
        if (audios.length > 0) {
            return audios[0].volume !== undefined ? audios[0].volume : 100;
        }
        return 100;
    }

    setAudioVolume(val: number | string, isFinal = true) {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) return;

        let numVal = num;
        if (isFinal) {
            numVal = Math.max(0, Math.min(200, num));
        } else {
            if (num < 0 || num > 300) return;
        }

        const audios = this.getSelectedAudios();
        for (const audio of audios) {
            audio.volume = numVal;
        }

        // Cập nhật real-time âm lượng cho các Wavesurfer đang phát
        if (this.projectData && this.projectData.scenes) {
            for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
                const scene = this.projectData.scenes[sceneIdx];
                if (scene.extractedAudios) {
                    for (let aIdx = 0; aIdx < scene.extractedAudios.length; aIdx++) {
                        const audio = scene.extractedAudios[aIdx];
                        if (audios.includes(audio)) {
                            const ws = this.wavesurfers[`waveform-${sceneIdx}-${aIdx}`];
                            if (ws) {
                                try { ws.setVolume(numVal / 100); } catch (e) {}
                            }
                        }
                    }
                }
            }
        }

        if (this.inspectorWaveSurfer) {
            try { this.inspectorWaveSurfer.setVolume(numVal / 100); } catch (e) {}
        }

        this.markDirty();
        this.cd.detectChanges();
    }

    onAudioVolumeBlur(event: any) {
        const val = event.target.value;
        const num = Number(val);
        const clamped = isNaN(num) || !val ? 100 : Math.max(0, Math.min(200, num));
        event.target.value = clamped;
        this.setAudioVolume(clamped, true);
    }

    getItemType(item: any): 'text' | 'audio' | 'video' | 'unknown' {
        if (!item) return 'unknown';

        // 1. Explicit type tag
        if (item.type === 'extractedAudio' || item.type === 'audio') return 'audio';
        if (item.type === 'video' || item.type === 'image') return 'video';
        if (item.type === 'subtitle' || item.type === 'text' || item.type === 'customText') return 'text';

        // 2. Direct membership in projectData scenes
        if (this.projectData && this.projectData.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.images && scene.images.includes(item)) {
                    return 'video';
                }
                if (scene.extractedAudios && scene.extractedAudios.includes(item)) {
                    return 'audio';
                }
                if (scene.videos && scene.videos.includes(item)) {
                    return 'video';
                }
                if (scene.subtitles && scene.subtitles.includes(item)) {
                    return 'text';
                }
                if (scene.texts && scene.texts.includes(item)) {
                    return 'text';
                }
            }
        }

        // 3. Extracted Audio markers
        if (item.isExtractedAudio || item.text === '[Âm thanh gốc]') return 'audio';

        // 4. Video markers
        if (item.videoUrl || item.imageUrl || (item.prompt !== undefined && !item.audioUrl)) return 'video';

        // 5. Audio vs Subtitle
        if (item.audioUrl && (item.text === undefined || item.text === '[Âm thanh gốc]' || !item.text)) return 'audio';
        if (item.text !== undefined) return 'text';
        if (item.audioUrl) return 'audio';

        return 'unknown';
    }

    deleteActiveItem() {
        if (this.selectedItems && this.selectedItems.size > 1) {
            this.deleteSelectedItems();
            return;
        }
        if (!this.activeItem && this.selectedItems.size > 0) {
            this.deleteSelectedItems();
            return;
        }
        if (!this.activeItem) return;
        const item = this.activeItem;
        const type = this.getItemType(item);

        let typeTitle = 'mục đang chọn';
        let typeLabel = 'mục này';
        if (type === 'text') {
            typeTitle = 'Phụ đề';
            typeLabel = 'đoạn phụ đề này';
        } else if (type === 'audio') {
            typeTitle = 'Audio';
            typeLabel = 'đoạn âm thanh này';
        } else if (type === 'video') {
            typeTitle = 'Video';
            typeLabel = 'đoạn video này';
        }

        const dialogRef = this._fuseConfirmationService.open({
            title: `Xoá ${typeTitle}?`,
            message: `Bạn có chắc chắn muốn xoá ${typeLabel} khỏi dự án không? Thao tác này không thể hoàn tác.`,
            icon: { show: true, name: 'heroicons_outline:trash', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Xoá ngay', color: 'warn' },
                cancel: { show: true, label: 'Huỷ bỏ' }
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result !== 'confirmed') return;

            if (this.projectData && this.projectData.scenes) {
                for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                    const scene = this.projectData.scenes[sIdx];
                    if (type === 'text' && scene.subtitles) {
                        const idx = scene.subtitles.indexOf(item);
                        if (idx !== -1) {
                            scene.subtitles.splice(idx, 1);
                            this.activeItem = null;
                            this.destroyInspectorWaveSurfer();
                            this.saveData();
                            this.toastr.warning(`Đã xoá phụ đề!`);
                            setTimeout(() => this.initWaveSurfers(), 300);
                            return;
                        }
                    }
                    if (type === 'audio' && scene.extractedAudios) {
                        const idx = scene.extractedAudios.indexOf(item);
                        if (idx !== -1) {
                            const audio = scene.extractedAudios[idx];
                            if (scene.videos) {
                                const video = scene.videos.find((v: any) => v.startTime === audio.startTime);
                                if (video) video.muted = false;
                            }
                            scene.extractedAudios.splice(idx, 1);
                            this.activeItem = null;
                            this.destroyInspectorWaveSurfer();
                            this.saveData();
                            this.toastr.warning(`Đã xoá âm thanh!`);
                            setTimeout(() => this.initWaveSurfers(), 300);
                            return;
                        }
                    }
                    if (type === 'video' && scene.videos) {
                        const idx = scene.videos.indexOf(item);
                        if (idx !== -1) {
                            const deletedVideo = scene.videos[idx];
                            const shiftAmount = deletedVideo.duration || 0;

                            let passedDeleted = false;
                            for (let s = 0; s < this.projectData.scenes.length; s++) {
                                const currentScene = this.projectData.scenes[s];
                                if (!currentScene.videos) continue;
                                if (s > sIdx) passedDeleted = true;
                                for (let v = 0; v < currentScene.videos.length; v++) {
                                    const vid = currentScene.videos[v];
                                    if (s === sIdx && v > idx) passedDeleted = true;
                                    if (passedDeleted) {
                                        vid.startTime = Math.max(0, (vid.startTime || 0) - shiftAmount);
                                    }
                                }
                            }
                            scene.videos.splice(idx, 1);
                            this.activeItem = null;
                            this.destroyInspectorWaveSurfer();
                            this.saveData();
                            this.toastr.warning(`Đã xoá video!`);
                            this.cd.detectChanges();
                            return;
                        }
                    }
                }
            }
        });
    }

    removeSubtitle(sceneIdx: number, subIdx: number) {
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene || !scene.subtitles) return;

        this.alert({
            title: 'Xóa Track Audio',
            message: `Bạn có chắc chắn muốn xóa đoạn audio này không?`,
            confirm: 'Xóa',
            cb: () => {
                scene.subtitles.splice(subIdx, 1);
                this.saveData();
                this.toastr.warning(`Đã xóa audio!`);
                setTimeout(() => this.initWaveSurfers(), 500);
            }
        });
    }

    removeExtractedAudio(sceneIdx: number, aIdx: number) {
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene || !scene.extractedAudios) return;

        this.alert({
            title: 'Xóa Âm thanh',
            message: `Bạn có chắc chắn muốn xóa đoạn âm thanh này không?`,
            confirm: 'Xóa',
            cb: () => {
                const audio = scene.extractedAudios[aIdx];
                if (scene.videos) {
                    const video = scene.videos.find((v: any) => v.startTime === audio.startTime);
                    if (video) video.muted = false;
                }
                scene.extractedAudios.splice(aIdx, 1);
                this.saveData();
                this.toastr.warning(`Đã xóa âm thanh!`);
                setTimeout(() => this.initWaveSurfers(), 500);
            }
        });
    }

    async trimVideo(video: any, event: Event) {
        event.stopPropagation();
        
        const duration = video.duration || 5;
        const trimStart = video.trimStart || 0;
        const maxDur = video.maxDuration || duration;

        // If not really trimmed
        if (trimStart === 0 && duration >= maxDur) {
            this.toastr.info('Video này chưa bị cắt.');
            return;
        }

        this.alert({
            title: 'Cắt Video',
            message: `Hệ thống sẽ dùng FFmpeg để cắt file gốc. Bạn muốn xuất file mới hay lưu đè đoạn đã cắt vào Timeline?`,
            confirm: 'Lưu vào Timeline',
            cancel: 'Chỉ xuất File',
            cb: async () => {
                // Thay thế vào timeline
                await this.executeTrim(video, true);
            },
            cc: async () => {
                // Chỉ xuất file
                await this.executeTrim(video, false);
            }
        });
    }

    async executeTrim(video: any, replaceTimeline: boolean) {
        if (!video.videoUrl) return;
        
        video.isGeneratingVideo = true;
        this.cd.detectChanges();

        try {
            const electron = (window as any).electron;
            const payload = {
                videoUrl: video.videoUrl,
                trimStart: video.trimStart || 0,
                duration: video.duration || 5
            };

            const result = await electron.invoke('trim-video', payload);
            if (result && result.success) {
                if (replaceTimeline) {
                    video.videoUrl = 'file://' + result.path;
                    video.trimStart = 0;
                    video.maxDuration = video.duration;
                    this.saveData();
                    this.toastr.success('Đã lưu đoạn cắt đè lên Timeline.');
                } else {
                    this.toastr.success('Cắt video thành công!');
                    electron.invoke('open-external', result.path); // Open the folder/file
                }
            } else {
                this.toastr.error('Cắt video thất bại!');
                console.error(result?.error);
            }
        } catch (e) {
            console.error(e);
            this.toastr.error('Có lỗi xảy ra khi cắt video.');
        } finally {
            video.isGeneratingVideo = false;
            this.cd.detectChanges();
        }
    }

    isTrimmed(video: any): boolean {
        if (!video || !video.videoUrl) return false;
        const trimStart = video.trimStart || 0;
        const duration = video.duration || 0;
        const maxDuration = video.maxDuration || duration;
        
        return trimStart > 0 || duration < maxDuration;
    }

    removeVideo(sceneIdx: number, vIdx: number) {
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene || !scene.videos || !scene.videos[vIdx]) return;

        this.alert({
            title: 'Xóa Video',
            message: `Bạn có chắc chắn muốn xóa video này không? Các video phía sau sẽ tự động dồn lên.`,
            confirm: 'Xóa liền',
            cb: () => {
                const deletedVideo = scene.videos[vIdx];
                const shiftAmount = deletedVideo.duration || 0;

                // 1. Dịch chuyển các video phía sau sang trái TRƯỚC KHI xoá phần tử trong mảng
                let passedDeleted = false;
                for (let s = 0; s < this.projectData.scenes.length; s++) {
                    const currentScene = this.projectData.scenes[s];
                    if (!currentScene.videos) continue;

                    if (s > sceneIdx) passedDeleted = true;

                    for (let v = 0; v < currentScene.videos.length; v++) {
                        const vid = currentScene.videos[v];
                        if (s === sceneIdx && v > vIdx) {
                            passedDeleted = true;
                        }

                        if (passedDeleted && vid.startTime !== undefined) {
                            vid.startTime = Math.max(0, vid.startTime - shiftAmount);
                        }
                    }
                }

                // 2. Xoá video khỏi danh sách
                scene.videos.splice(vIdx, 1);

                // 3. Nếu scene trống thì xoá luôn scene
                if (scene.videos.length === 0) {
                    this.projectData.scenes.splice(sceneIdx, 1);
                }

                this.saveData();
                this.toastr.warning(`Đã xóa video và dồn timeline!`);
                setTimeout(() => this.updateLines(), 100);
            },
        });
    }

    openDirectorMode() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            panelClass: 'dark-theme-dialog',
            data: { 
                prompt: this.projectData?.masterPrompt || '', 
                targetName: 'Apply to Master Prompt',
                globalContext: this.projectData?.globalContext || null,
                aspectRatio: this.projectData?.aspectRatio || '16:9'
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                let promptResult = typeof result === 'string' ? result : result.prompt;
                
                if (!this.projectData) this.projectData = {};
                let currentPrompt = this.projectData.masterPrompt ? this.projectData.masterPrompt.trim() : '';
                currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentPrompt) {
                    this.projectData.masterPrompt = '[Cinematography: ' + promptResult + ']\n\n' + currentPrompt;
                } else {
                    this.projectData.masterPrompt = '[Cinematography: ' + promptResult + ']';
                }
                
                if (typeof result !== 'string' && result.controlImageUrl) {
                    this.projectData.masterControlImageUrl = result.controlImageUrl;
                }

                if (typeof result !== 'string' && result.globalContext) {
                    this.projectData.globalContext = { ...result.globalContext };
                }
                
                this.saveData();
                this.toastr.success('Đã áp dụng các thông số Director Mode vào Master Prompt!');
            }
        });
    }

    // Thêm hàm này vào trong class VideoTimelineDialogComponent
    getSceneDuration(scene: any): string {
        if (scene.forcedDuration) {
            return `${scene.forcedDuration}s`;
        }

        if (!scene || !scene.subtitles || scene.subtitles.length === 0) return '0s';

        let totalSeconds = 0;

        for (const sub of scene.subtitles) {
            if (sub.duration) {
                // Nếu đã có sẵn thời lượng thực tế của file audio
                totalSeconds += sub.duration;
            } else if (sub.text) {
                // Ước lượng nếu chưa có file audio (trung bình ~4 từ/giây)
                const words = sub.text.trim().split(/\s+/).length;
                totalSeconds += Math.max(1, words / 4); // Ít nhất là 1 giây
            }
        }

        const total = Math.round(totalSeconds);

        // Format hiển thị (VD: 45s hoặc 1m15s)
        if (total < 60) return `${total}s`;

        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${minutes}m${seconds}s`;
    }

    public data: any = {};
    constructor(
        private route: ActivatedRoute,
        private clipboard: Clipboard,
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer,
        @Optional() @Inject(MAT_DIALOG_DATA) public dialogData: any
    ) { 
        this.data = this.dialogData || {};
        if (!this.data.uuid) {
            this.data.uuid = this.route.snapshot.paramMap.get('uuid');
        }
        if (!this.data.username) {
            this.data.username = this.route.snapshot.paramMap.get('name');
        }
    }

    private safeUrlCache: { [url: string]: SafeUrl } = {};
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

        if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:') || cleanUrl.startsWith('media://') || cleanUrl.startsWith('mediacors://') || cleanUrl.startsWith('assets/')) {
            cleanUrl = cleanUrl + hash;
        } else if (cleanUrl.startsWith('src/assets/')) {
            cleanUrl = cleanUrl.substring(4) + hash;
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            let originalPath = cleanUrl.split('?')[0];
            originalPath = originalPath.replace(/^file:\/{2,3}/i, '');
            
            // Fix for Linux/Mac: if it doesn't look like a Windows drive letter, ensure it starts with /
            if (!/^[a-zA-Z]:/.test(originalPath) && !originalPath.startsWith('/')) {
                originalPath = '/' + originalPath;
            }

            cleanUrl = `media://${originalPath.replace(/\\/g, '/')}${hash}`;
        }
        return cleanUrl;
    }

    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        
        if (this.safeUrlCache[url]) {
            return this.safeUrlCache[url];
        }
        
        const rawUrl = this.getRawMediaUrl(url);
        if (!rawUrl) return url;
        
        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(rawUrl);
        this.safeUrlCache[url] = safeUrl;
        return safeUrl;
    }

    ngAfterViewInit() {
        const el = document.getElementById('timeline-scroll-container');
        if (el) {
            el.addEventListener('scroll', () => {
                this.updateLines();
            });
        }
        if (this.hasAnyExtractedAudio || this.hasAnySubtitle) {
            setTimeout(() => this.initWaveSurfers(), 300);
        }
    }

    goBack() {
        this.router.navigate(['../'], { relativeTo: this.route });
    }

    async captureVideoThumbnail(videoUrl: string, seekTime = 0.5): Promise<string> {
        return new Promise((resolve) => {
            try {
                const rawUrl = this.getRawMediaUrl(videoUrl);
                if (!rawUrl) {
                    resolve('');
                    return;
                }
                const video = document.createElement('video');
                video.crossOrigin = 'anonymous';
                video.src = rawUrl as string;
                video.muted = true;
                video.preload = 'auto';

                let resolved = false;
                const finish = (result: string) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    try { video.removeAttribute('src'); video.load(); video.remove(); } catch (e) {}
                    resolve(result);
                };

                const timeout = setTimeout(() => {
                    finish('');
                }, 4000);

                video.onloadeddata = () => {
                    video.currentTime = Math.min(seekTime, (video.duration && video.duration > 1) ? seekTime : 0.1);
                };

                video.onseeked = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.min(video.videoWidth || 640, 640);
                        canvas.height = Math.round(canvas.width * (video.videoHeight || 360) / (video.videoWidth || 640)) || 360;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                            finish(dataUrl);
                            return;
                        }
                    } catch (e) {
                        console.warn('[captureVideoThumbnail] Canvas error:', e);
                    }
                    finish('');
                };

                video.onerror = () => {
                    finish('');
                };
            } catch (err) {
                resolve('');
            }
        });
    }

    async autoGenerateMissingVideoThumbnails() {
        if (!this.projectData || !this.projectData.scenes) return;
        let anyGenerated = false;

        for (const scene of this.projectData.scenes) {
            if (scene.videos) {
                for (const video of scene.videos) {
                    if (video.videoUrl && !video.imageUrl && !video.controlImageUrl) {
                        const thumb = await this.captureVideoThumbnail(video.videoUrl);
                        if (thumb) {
                            video.imageUrl = thumb;
                            anyGenerated = true;
                        }
                    }
                }
            }
        }

        if (anyGenerated) {
            this.saveData(true);
            this.updateFilteredMediaItems();
            this.cd.detectChanges();
        }
    }

    async syncVideoDurationsWithDisk() {
        const electron = (window as any).electron;
        if (!electron || !electron.getMediaDuration) return;
        if (!this.projectData?.scenes) return;

        let changed = false;
        for (const scene of this.projectData.scenes) {
            if (scene.videos) {
                for (const vid of scene.videos) {
                    if (vid.videoUrl && (vid.duration === 5 || !vid.maxDuration || vid.duration <= 0)) {
                        try {
                            const res = await electron.getMediaDuration(vid.videoUrl);
                            if (res && res.success && res.duration > 0) {
                                const realDur = Math.round(res.duration * 10) / 10;
                                vid.duration = realDur;
                                vid.maxDuration = realDur;
                                changed = true;
                            }
                        } catch (e) {}
                    }
                }
            }
        }
        if (changed) {
            this.normalizeData();
            this.updateTimelineTotalWidth();
            this.cd.detectChanges();
        }
    }

    async autoScanAndLoadCompanionAssets(force = false) {
        const electron = (window as any).electron;
        if (!electron || !electron.invoke) return;
        if (!this.projectData?.scenes) return;

        let anyLoaded = false;

        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (!scene.videos || scene.videos.length === 0) continue;

            const video = scene.videos[0];
            if (!video.videoUrl) continue;

            // Nếu scene đã có phụ đề và audio rồi và không force -> bỏ qua
            const hasSubs = scene.subtitles && scene.subtitles.length > 0;
            const hasAudio = scene.extractedAudios && scene.extractedAudios.length > 0;
            if (!force && (hasSubs || hasAudio)) continue;

            let originalPath = video.videoUrl;
            if (originalPath.startsWith('media://')) {
                originalPath = decodeURIComponent(originalPath.substring(8));
            } else if (originalPath.startsWith('file://')) {
                originalPath = decodeURIComponent(originalPath.substring(7));
            }
            if (originalPath.match(/^\/[a-zA-Z]:[\\/]/)) {
                originalPath = originalPath.substring(1);
            }

            try {
                const res = await electron.invoke('scan-companion-video-assets', { videoPath: originalPath });
                if (res && res.success && res.hasCompanion) {
                    if (!scene.subtitles) scene.subtitles = [];
                    if (!scene.extractedAudios) scene.extractedAudios = [];

                    let parsedViSubs: any[] = [];
                    let parsedOrigSubs: any[] = [];

                    const rawVi = res.viContent || res.viSrtContent;
                    const rawOrig = res.originalContent || res.origSrtContent;

                    if (rawVi) {
                        parsedViSubs = this.parseSrtContent(rawVi);
                    }
                    if (rawOrig) {
                        parsedOrigSubs = this.parseSrtContent(rawOrig);
                    }

                    if (parsedViSubs.length === 0 && parsedOrigSubs.length === 0 && res.srtContent) {
                        const parsed = this.parseSrtContent(res.srtContent);
                        if (parsed.length > 0) {
                            if (this.isLikelyVietnamese(parsed[0].text)) {
                                parsedViSubs = parsed;
                            } else {
                                parsedOrigSubs = parsed;
                            }
                        }
                    }

                    const count = Math.max(parsedViSubs.length, parsedOrigSubs.length);
                    const videoStart = Number(video.startTime) || 0;
                    const audioSegs = res.audioSegments || [];

                    if (count > 0) {
                        const newSubs: any[] = [];
                        const newAudios: any[] = [];

                        for (let idx = 0; idx < count; idx++) {
                            const origSub = parsedOrigSubs[idx];
                            const viSub = parsedViSubs[idx];
                            const baseSeg = origSub || viSub;

                            const origText = origSub?.text || (baseSeg && !this.isLikelyVietnamese(baseSeg.text) ? baseSeg.text : '');
                            const viText = viSub?.text || (baseSeg && this.isLikelyVietnamese(baseSeg.text) ? baseSeg.text : '');
                            const segStart = Math.round((videoStart + Number(baseSeg.startTime)) * 100) / 100;
                            const segDur = Math.max(0.3, Math.round(Number(baseSeg.duration) * 100) / 100);

                            // Match audio segment
                            const matchingAudio = audioSegs.find((a: any) => a.index === idx) || audioSegs[idx];
                            const audioUrl = matchingAudio ? matchingAudio.audioUrl : (res.fullAudioUrl || null);

                            if (audioUrl) {
                                newAudios.push({
                                    id: Date.now() + idx,
                                    text: origText || viText,
                                    originalText: origText || viText,
                                    vietnameseText: viText || origText,
                                    audioUrl: audioUrl,
                                    startTime: segStart,
                                    duration: segDur,
                                    maxDuration: segDur
                                });
                            }

                            const currentText = this.currentSubtitleLang === 'vi' ? (viText || origText) : (origText || viText);
                            newSubs.push({
                                id: Date.now() + 100000 + idx,
                                audioId: Date.now() + idx,
                                text: currentText,
                                originalText: origText || viText,
                                vietnameseText: viText || origText,
                                translations: {
                                    'vi': viText || origText,
                                    'original': origText || viText,
                                    'en': origText || viText
                                },
                                startTime: segStart,
                                duration: segDur
                            });
                        }

                        if (newSubs.length > 0 || newAudios.length > 0) {
                            if (!hasSubs || force) scene.subtitles = newSubs;
                            if (!hasAudio || force) scene.extractedAudios = newAudios;
                            anyLoaded = true;
                        }
                    } else if (res.fullAudioUrl && (!hasAudio || force)) {
                        scene.extractedAudios = [{
                            id: Date.now(),
                            text: '[Âm thanh gốc]',
                            audioUrl: res.fullAudioUrl,
                            startTime: videoStart,
                            duration: Number(video.duration) || 5,
                            maxDuration: Number(video.duration) || 5
                        }];
                        anyLoaded = true;
                    }
                }
            } catch (err) {
                console.error('[AutoScanCompanionAssets] Error scanning assets:', err);
            }
        }

        if (anyLoaded) {
            this.normalizeData();
            this.saveData(true);
            this.updateTimelineTotalWidth();
            this.updateFilteredMediaItems();
            this.cd.detectChanges();
            setTimeout(() => {
                this.initWaveSurfers();
                this.updateLines();
            }, 300);
            this.toastr.success('Đã tự động quét và nạp phụ đề & âm thanh có sẵn từ thư mục video!', 'Tự động đồng bộ', { timeOut: 5000 });
        }
    }

    onVideoLoadedMetadata(event: Event) {
        const vidEl = event.target as HTMLVideoElement;
        if (!vidEl || !vidEl.duration || !isFinite(vidEl.duration) || vidEl.duration <= 0) return;
        const realDuration = Math.round(vidEl.duration * 10) / 10;

        let changed = false;
        if (this.activeVideo) {
            if (this.activeVideo.duration !== realDuration && (this.activeVideo.duration === 5 || !this.activeVideo.maxDuration || this.activeVideo.duration <= 0)) {
                this.activeVideo.duration = realDuration;
                this.activeVideo.maxDuration = realDuration;
                changed = true;
            }
        }
        if (this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos) {
                    for (const vid of scene.videos) {
                        if (vid.videoUrl === this.previewVideoUrl || (scene.videos.length === 1 && this.projectData.scenes.length === 1)) {
                            if (vid.duration !== realDuration && (vid.duration === 5 || !vid.maxDuration || vid.duration <= 0)) {
                                vid.duration = realDuration;
                                vid.maxDuration = realDuration;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
        if (changed) {
            this.normalizeData();
            this.updateTimelineTotalWidth();
            this.cd.detectChanges();
        }
    }

    ngOnInit() {
        if (!this.data.uuid) {
            this.data.uuid = this.route.snapshot.paramMap.get('uuid');
        }
        if (!this.data.username) {
            this.data.username = this.route.snapshot.paramMap.get('name');
        }
        if (!this.data.uuid) { this.goBack(); return; }

        this.loadFrameAssets();
        this.loadSystemFonts();
        this.isSvgReady = false;
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        const readyKey = `ai_type_video_ready_data_${this.data.uuid}`;
        this.projectData = this.data?.projectData || this.multiAccountService.getItem(readyKey) || this.multiAccountService.getItem(storageKey);

        const audioStorageKey = `ai_type_audio_merger_data_${this.data.uuid}`;
        const audioData = this.multiAccountService.getItem(audioStorageKey);
        this.allClips = audioData && audioData.clips ? audioData.clips : [];

        // Backward compatibility: Convert old scenes to grouped videos format
        if (this.projectData && this.projectData.scenes) {
            this.projectData.scenes.forEach((scene: any) => {
                // Clear any stale generating flags
                if (scene.videos) {
                    scene.videos.forEach((video: any) => {
                        video.isGeneratingImage = false;
                        video.isGeneratingVideo = false;
                    });
                }

                if (!scene.videos && (scene.prompt || scene.imageUrl || scene.videoUrl)) {
                    let defaultDuration = scene.forcedDuration || 5;
                    if (!scene.forcedDuration && scene.subtitles) {
                        let totalSecs = 0;
                        for (const sub of scene.subtitles) {
                            if (sub.duration) totalSecs += sub.duration;
                            else if (sub.text) totalSecs += Math.max(1, sub.text.trim().split(/\s+/).length / 4);
                        }
                        if (totalSecs > 0) defaultDuration = Math.round(totalSecs);
                    }
                    scene.videos = [{
                        id: 1,
                        prompt: scene.prompt || '',
                        imageUrl: scene.imageUrl || null,
                        videoUrl: scene.videoUrl || null,
                        duration: defaultDuration
                    }];
                } else if (!scene.videos) {
                    scene.videos = [];
                }
            });
        }

        // Khởi tạo Timeline (gán startTime cho các video)
        this.normalizeData();
        this.syncVideoDurationsWithDisk();
        this.autoScanAndLoadCompanionAssets();
        this.autoGenerateMissingVideoThumbnails();
        this.syncSubtitlesWithExtractedAudios();
        const allSubs = this.getAllProjectSubtitles();
        if (allSubs.length > 0) {
            const viCount = allSubs.filter(s => this.isLikelyVietnamese(s.text)).length;
            this.currentSubtitleLang = (viCount > allSubs.length / 2) ? 'vi' : 'original';
        }
        this.updateFilteredMediaItems();

        // Select the first video by default
        if (this.projectData && this.projectData.scenes && this.projectData.scenes.length > 0) {
            const firstScene = this.projectData.scenes[0];
            if (firstScene.videos && firstScene.videos.length > 0) {
                const firstVideo = firstScene.videos[0];
                this.setActiveItem(firstVideo);
                this.currentTimelineTime = firstVideo.startTime || 0;
                this.updateTimelineSync();
            }
        }

        // Lắng nghe sự kiện tải ảnh từ webview (Gemini/Labs)
        const electron = (window as any).electron;
        if (electron && electron.onWebviewDownloadComplete) {
            electron.onWebviewDownloadComplete((res: any) => {
                if (this.activeDownloadScene && res && res.file) {
                    const localPath = res.file;
                    // Gắn URL hình ảnh
                    this.activeDownloadScene.imageUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

                    // Lưu lại và báo thành công
                    this.saveData();
                    this.toastr.success(`Đã gán ảnh vừa tải ảnh vào Phân cảnh!`, "Tải ảnh thành công!");

                    // Xóa scene đang được chọn để tránh gắn nhầm cho các lần tải sau
                    // và ngăn chặn lỗi hiển thị nhiều thông báo do event listener bị trùng lặp
                    this.activeDownloadScene = null;
                }
            });
        }

        setTimeout(() => {
            this.updateLines();
            this.isSvgReady = true;
            this.cd.detectChanges();
        }, 150);
    }

    ngOnDestroy() {
        this.pauseTimeline();

        // Huỷ toàn bộ WaveSurfer
        this.destroyInspectorWaveSurfer();
        for (const key in this.wavesurfers) {
            try {
                this.wavesurfers[key]?.destroy();
            } catch (e) {}
        }
        this.wavesurfers = {};

        // Dừng tất cả phần tử HTML Video / Audio
        if (this.mainVideoPlayer?.nativeElement) {
            try {
                this.mainVideoPlayer.nativeElement.pause();
                this.mainVideoPlayer.nativeElement.src = '';
                this.mainVideoPlayer.nativeElement.load();
            } catch (e) {}
        }
        if (this.mainAudioPlayer?.nativeElement) {
            try {
                this.mainAudioPlayer.nativeElement.pause();
                this.mainAudioPlayer.nativeElement.src = '';
                this.mainAudioPlayer.nativeElement.load();
            } catch (e) {}
        }

        // Dừng bất kỳ thẻ audio/video nào khác nếu có trong dialog
        try {
            const allMedia = document.querySelectorAll('video, audio');
            allMedia.forEach((el: any) => {
                if (el.closest('mat-dialog-container')) {
                    el.pause();
                    el.src = '';
                }
            });
        } catch (e) {}

        // Hủy listeners toàn cục
        document.removeEventListener('mousemove', this.onScrubberMouseMove);
        document.removeEventListener('mouseup', this.onScrubberMouseUp);
        document.removeEventListener('mousemove', this.onTimelineMouseMove);
        document.removeEventListener('mouseup', this.onTimelineMouseUp);
    }

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: alert ? alert.title : 'Xác nhận',
            message: alert
                ? alert.message
                : 'Bạn có chắc chắn muốn thực hiện thao tác này?',
            icon: { show: true, name: alert?.icon || 'heroicons_outline:exclamation-triangle', color: alert?.color || 'warn' },
            actions: {
                confirm: { show: true, label: alert ? alert.confirm : 'Xác nhận', color: alert?.color || 'warn' },
                cancel: { show: true, label: alert ? alert.cancel : 'Huỷ bỏ' },
            },
            dismissible: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (alert && alert.cb) alert.cb();
            } else {
                if (alert && alert.cc) alert.cc();
            }
        });
    }

    resetVideoDuration(e: MouseEvent, video: any) {
        e.preventDefault();
        e.stopPropagation();
        if (video && video.maxDuration !== undefined) {
            video.duration = video.maxDuration;
            this.saveData();
            this.cd.detectChanges();
        }
    }
}

@Component({
    selector: 'app-magic-kling-prompt-dialog',
    standalone: true,
    imports: [CommonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FormsModule, MatIconModule],
    template: `
        <div class="flex items-center justify-between mb-4">
            <div class="text-2xl font-bold text-gray-800 tracking-tight">Tách cảnh và chỉnh sửa</div>
            <button mat-icon-button (click)="dialogRef.close()" type="button">
                <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
            </button>
        </div>

        <div mat-dialog-content class="mt-4 p-0 overflow-hidden">
            <mat-form-field class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0" [subscriptSizing]="'dynamic'">
                <textarea class="px-2" [(ngModel)]="prompt" rows="4" [placeholder]="'Nhập prompt yêu cầu chỉnh sửa cho đoạn video này (VD: cinematic lighting, snow...)'" type="text" required matInput cdkTextareaAutosize></textarea>
            </mat-form-field>

            <div class="flex flex-col gap-3 mt-4">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">File đính kèm (Ảnh / Video tham khảo)</span>
                    <button mat-icon-button color="primary" matTooltip="Tải lên" (click)="fileInput.click()">
                        <mat-icon [svgIcon]="'heroicons_outline:paper-clip'"></mat-icon>
                    </button>
                    <input type="file" #fileInput class="hidden" accept="image/*,video/*" (change)="onFileSelected($event)">
                </div>

                <div *ngIf="attachedFileUrl" class="relative flex items-center justify-center w-full h-48 border border-gray-300 rounded overflow-hidden mt-2 bg-gray-50 group transition-all">
                    <img *ngIf="isImage" [src]="attachedFileUrl" class="h-full w-full object-contain" />
                    <video *ngIf="!isImage" [src]="attachedFileUrl" class="h-full w-full object-contain" controls></video>
                    
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <button mat-mini-fab color="warn" class="pointer-events-auto shadow-lg" (click)="removeAttachment()" matTooltip="Xóa file này">
                            <mat-icon>delete</mat-icon>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
            <button mat-flat-button color="primary" (click)="submit()" class="">
                Xác nhận
            </button>
        </div>
    `
})
export class MagicKlingPromptDialogComponent {
    prompt: string = '';
    attachedFileUrl: any = null;
    attachedFilePath: string | null = null;
    isImage: boolean = true;

    constructor(
        public dialogRef: MatDialogRef<MagicKlingPromptDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { prompt: string, attachmentUrl?: string },
        private sanitizer: DomSanitizer,
        private toastr: ToastrService
    ) {
        this.prompt = data.prompt || '';
        if (data.attachmentUrl) {
            this.attachedFilePath = data.attachmentUrl;
            this.isImage = !!data.attachmentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) || !data.attachmentUrl.match(/\.(mp4|webm|avi|mov)$/i);
            this.attachedFileUrl = this.sanitizer.bypassSecurityTrustUrl(data.attachmentUrl);
        }
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        
        const electronApi = (window as any).electron;
        if (electronApi && electronApi.getPathForFile) {
            const originalPath = electronApi.getPathForFile(file);
            if (originalPath) {
                try {
                    const localFilePath = await electronApi.selectLocalFile(originalPath, 'tts/admin/attachments');
                    const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;
                    this.attachedFilePath = finalPath;
                    this.isImage = !!(file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
                    this.attachedFileUrl = this.sanitizer.bypassSecurityTrustUrl(finalPath);
                } catch (e: any) {
                    this.toastr.error('Lỗi khi đính kèm file: ' + e.message);
                }
            }
        } else {
            const url = URL.createObjectURL(file);
            this.attachedFilePath = url;
            this.isImage = file.type.startsWith('image/');
            this.attachedFileUrl = this.sanitizer.bypassSecurityTrustUrl(url);
        }
        event.target.value = '';
    }

    removeAttachment() {
        this.attachedFilePath = null;
        this.attachedFileUrl = null;
    }

    submit() {
        this.dialogRef.close({
            prompt: this.prompt,
            attachmentUrl: this.attachedFilePath
        });
    }
}