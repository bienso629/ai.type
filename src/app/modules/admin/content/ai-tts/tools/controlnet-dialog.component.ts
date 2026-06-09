import { Component, Inject, ChangeDetectorRef, ViewChild, ElementRef, OnInit } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastrService } from 'ngx-toastr';
import { GenaiService } from 'app/genai.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'app-controlnet-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatTooltipModule
    ],
    templateUrl: './controlnet-dialog.component.html'
})
export class ControlNetDialogComponent implements OnInit {
    isUploadingControlImage: boolean = false;
    savedControlTemplates: any[] = [];
    extractedFrames: string[] = [];
    loadingMessage: string = '';
    isPromptingForPose: boolean = false;
    posePromptText: string = '';
    poseReferenceImageUrl: string | null = null;
    
    @ViewChild('videoUploadInput') videoUploadInput: any;
    @ViewChild('poseImageInput') poseImageInput: any;

    controlImageUrl: string | null = null;
    projectId: string | null = null;
    selectedAspectRatio: string = '16:9';

    private cacheBuster: number = Date.now();
    private safeUrlCache: { [url: string]: SafeUrl } = {};

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: any,
        private dialogRef: MatDialogRef<ControlNetDialogComponent>,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) {
        this.controlImageUrl = data.controlImageUrl || null;
        this.projectId = data.projectId || null;
        this.selectedAspectRatio = data.aspectRatio || '16:9';
        
        let initialPrompt = data.prompt || '';
        // Remove tags like [Cinematography: ...] or [Director: ...]
        initialPrompt = initialPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').trim();
        this.posePromptText = initialPrompt;
    }

    ngOnInit() {
        this.loadSavedControlTemplates();
    }

    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        if (cleanUrl.startsWith('http') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
            // do nothing
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            // Loại bỏ query string cũ nếu có để tránh lỗi và bỏ prefix file://
            let originalPath = cleanUrl.split('?')[0];
            originalPath = originalPath.replace(/^file:\/\//i, '');

            const mediaDir = this.data?.mediaDir || '';
            let projectUuid = this.projectId;
            if (!projectUuid) {
                const parts = window.location.href.split('/');
                projectUuid = parts[parts.length - 1];
            }

            cleanUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=${encodeURIComponent(projectUuid || 'default')}&_t=${this.cacheBuster}`;
        }

        if (this.safeUrlCache[cleanUrl]) return this.safeUrlCache[cleanUrl];

        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(cleanUrl);
        this.safeUrlCache[cleanUrl] = safeUrl;
        return safeUrl;
    }

    private getGeminiKey(): string | null {
        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        const keys = secretKey?.map((k: string) => k.trim()).filter((k: string) => k) || [];
        if (keys.length === 0) return null;

        return keys[Math.floor(Math.random() * keys.length)];
    }

    private getBase64FromImageUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject('Empty URL');
                return;
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

                let finalW = targetW;
                let finalH = targetH;
                const ratio = targetW / targetH;
                
                if (ratio > 2) {
                    finalH = Math.round(targetW / 2);
                } else if (ratio < 0.5) {
                    finalW = Math.round(targetH / 2);
                }

                canvas.width = finalW;
                canvas.height = finalH;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, finalW, finalH);
                    const offsetX = (finalW - targetW) / 2;
                    const offsetY = (finalH - targetH) / 2;
                    ctx.drawImage(img, offsetX, offsetY, targetW, targetH);
                }

                const dataURL = canvas.toDataURL('image/jpeg', 0.85);
                resolve(dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""));
            };
            img.onerror = error => reject(error);
            img.src = url;
        });
    }

    get currentProjectId(): string {
        if (this.projectId) return this.projectId;
        const parts = window.location.href.split('/');
        return parts[parts.length - 1] || 'default';
    }

    loadSavedControlTemplates() {
        const key = `saved_control_templates_${this.currentProjectId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                this.savedControlTemplates = JSON.parse(saved);
            } catch (e) { }
        }
    }

    onPoseReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.poseReferenceImageUrl = URL.createObjectURL(file);
        }
        event.target.value = '';
    }

    removePoseReferenceImage() {
        this.poseReferenceImageUrl = null;
    }

    openPosePrompt(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        this.isPromptingForPose = true;
    }

    async submitGeneratePose(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!this.posePromptText || !this.posePromptText.trim()) {
            this.toastr.warning('Vui lòng nhập mô tả tư thế/bố cục.');
            return;
        }

        const apiKey = this.getGeminiKey();
        if (!apiKey) {
            this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
            return;
        }



        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang vẽ phác thảo...';
        this.cd.markForCheck();

        try {
            let requestParts: any[] = [{ text: "Create a highly detailed skeleton/pose reference sketch for video generation. It is CRITICAL that the sketch EXACTLY captures the specific pose and illustrates the full sequence of actions or movements of the character from the beginning to the end, as described in this prompt: " + this.posePromptText }];
            if (this.poseReferenceImageUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.poseReferenceImageUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/jpeg'
                        }
                    });
                } catch(e) {
                    console.error("Error reading pose reference image", e);
                }
            }
            
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ role: 'user', parts: requestParts }],
                config: {
                    aspectRatio: this.selectedAspectRatio,
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

            if (!base64Data) {
                throw new Error('Không nhận được dữ liệu ảnh từ AI.');
            }

            const fileName = `control_${Date.now()}.png`;
            const electron = (window as any).electron;
            if (electron && electron.saveBase64) {
                const result = await electron.saveBase64({
                    base64: base64Data,
                    fileName: fileName,
                    folder: 'scenes',
                    username: 'ai_type',
                    customDir: `tts/${this.data?.username || 'anonymous'}/${this.currentProjectId}`
                });

                if (result && result.success) {
                    const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                    this.autoSaveControlTemplate(finalPath, this.posePromptText || 'AI Phác thảo');
                    this.isPromptingForPose = false;
                    this.toastr.success('Đã tạo ảnh phác thảo thành công!');
                    this.controlImageUrl = finalPath;
                    this.dialogRef.close({ 
                        controlImageUrl: finalPath,
                        posePromptText: this.posePromptText
                    });
                } else {
                    throw new Error(result.error || 'Lỗi lưu file.');
                }
            } else {
                const finalPath = `data:image/jpeg;base64,${base64Data}`;
                this.autoSaveControlTemplate(finalPath, this.posePromptText || 'AI Phác thảo');
                this.isPromptingForPose = false;
                this.toastr.success('Đã tạo ảnh phác thảo thành công!');
                this.controlImageUrl = finalPath;
                this.dialogRef.close({ 
                    controlImageUrl: finalPath,
                    posePromptText: this.posePromptText
                });
            }
        } catch (err: any) {
            console.error('Lỗi khi AI vẽ phác thảo:', err);
            this.toastr.error('Lỗi tạo ảnh: ' + (err.message || err));
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            this.cd.markForCheck();
        }
    }

    triggerVideoUpload(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.videoUploadInput) {
            this.videoUploadInput.nativeElement.click();
        }
    }

    async extractFramesFromVideoBrowser(file: File, frameCount: number = 5): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.crossOrigin = 'anonymous';
            video.muted = true;
            
            video.addEventListener('loadedmetadata', () => {
                const duration = video.duration;
                if (!duration) {
                    reject('Không thể lấy độ dài video.');
                    return;
                }
                
                const interval = duration / (frameCount + 1);
                const times: number[] = [];
                for (let i = 1; i <= frameCount; i++) {
                    times.push(interval * i);
                }
                
                const frames: string[] = [];
                let currentTimeIndex = 0;
                
                const captureFrame = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        frames.push(canvas.toDataURL('image/jpeg', 0.8));
                    }
                    
                    currentTimeIndex++;
                    if (currentTimeIndex < times.length) {
                        video.currentTime = times[currentTimeIndex];
                    } else {
                        URL.revokeObjectURL(video.src);
                        resolve(frames);
                    }
                };
                
                video.addEventListener('seeked', captureFrame);
                video.currentTime = times[0];
            });
            
            video.addEventListener('error', (e: any) => {
                reject('Lỗi load video: ' + (e?.message || 'Unknown error'));
            });
        });
    }

    async onVideoSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        const electron = (window as any).electron;
        if (!electron || !electron.extractFramesFromVideo) {
            this.isUploadingControlImage = true;
            this.loadingMessage = 'Đang trích xuất khung hình...';
            this.cd.markForCheck();
            try {
                const frames = await this.extractFramesFromVideoBrowser(file, 5);
                if (frames && frames.length > 0) {
                    this.extractedFrames = frames;
                    this.toastr.success(`Đã trích xuất ${this.extractedFrames.length} khung hình.`);
                } else {
                    throw new Error('Không có khung hình nào được trích xuất.');
                }
            } catch (err: any) {
                console.error('Extract frames error:', err);
                this.toastr.error('Lỗi trích xuất: ' + (err.message || err));
            } finally {
                this.isUploadingControlImage = false;
                this.loadingMessage = '';
                if (this.videoUploadInput && this.videoUploadInput.nativeElement) {
                    this.videoUploadInput.nativeElement.value = '';
                }
                this.cd.markForCheck();
            }
            return;
        }

        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang trích xuất khung hình...';
        this.cd.markForCheck();

        try {
            const result = await electron.extractFramesFromVideo({
                videoPath: file.path,
                frameCount: 5,
                folder: 'scenes',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.currentProjectId}`
            });

            if (result && result.success && result.frames && result.frames.length > 0) {
                this.extractedFrames = result.frames.map((f: string) => `file://${f.replace(/\\/g, '/')}`);
                this.toastr.success(`Đã trích xuất ${this.extractedFrames.length} khung hình.`);
            } else {
                throw new Error(result?.error || 'Lỗi không xác định.');
            }
        } catch (err: any) {
            console.error('Extract frames error:', err);
            this.toastr.error('Lỗi trích xuất: ' + (err.message || err));
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            
            if (this.videoUploadInput && this.videoUploadInput.nativeElement) {
                this.videoUploadInput.nativeElement.value = '';
            }
            this.cd.markForCheck();
        }
    }

    selectExtractedFrame(frameUrl: string) {
        this.controlImageUrl = frameUrl;
        this.extractedFrames = [];
        this.autoSaveControlTemplate(frameUrl, 'Frame Video');
        this.close();
    }

    onFramesScroll(event: WheelEvent) {
        event.preventDefault();
        const container = event.currentTarget as HTMLElement;
        container.scrollLeft += event.deltaY;
    }

    async onControlImageSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        const electron = (window as any).electron;
        if (!electron || !electron.uploadLocalFile) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.controlImageUrl = e.target.result;
                this.autoSaveControlTemplate(this.controlImageUrl, file.name);
                this.toastr.success('Tải ảnh bố cục thành công!');
                event.target.value = '';
                this.close();
                this.cd.markForCheck();
            };
            reader.readAsDataURL(file);
            return;
        }

        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang tải ảnh lên...';
        this.cd.markForCheck();

        try {
            const fileName = `control_${Date.now()}_${file.name}`;
            const result = await electron.uploadLocalFile({
                filePath: file.path,
                fileName: fileName,
                folder: 'scenes',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.currentProjectId}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.controlImageUrl = finalPath;
                this.autoSaveControlTemplate(finalPath, file.name);
                this.toastr.success('Tải ảnh bố cục thành công!');
                this.close();
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (error: any) {
            console.error('Lỗi tải ảnh:', error);
            this.toastr.error('Lỗi tải ảnh: ' + (error.message || error));
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            event.target.value = '';
            this.cd.markForCheck();
        }
    }

    autoSaveControlTemplate(imageUrl: string, promptText: string) {
        const exists = this.savedControlTemplates.find(t => t.imageUrl === imageUrl);
        if (!exists) {
            const newTemplate = {
                id: Date.now().toString(),
                imageUrl: imageUrl,
                prompt: promptText
            };
            this.savedControlTemplates.push(newTemplate);
            const key = `saved_control_templates_${this.currentProjectId}`;
            localStorage.setItem(key, JSON.stringify(this.savedControlTemplates));
        }
    }

    deleteControlTemplate(id: string, event: Event) {
        event.stopPropagation();
        const template = this.savedControlTemplates.find(t => t.id === id);
        if (template && this.controlImageUrl === template.imageUrl) {
            this.controlImageUrl = null;
        }
        this.savedControlTemplates = this.savedControlTemplates.filter(t => t.id !== id);
        const key = `saved_control_templates_${this.currentProjectId}`;
        localStorage.setItem(key, JSON.stringify(this.savedControlTemplates));
    }

    selectControlTemplate(template: any) {
        this.controlImageUrl = template.imageUrl;
        this.close();
    }
    
    close() {
        this.dialogRef.close({ controlImageUrl: this.controlImageUrl });
    }
}
