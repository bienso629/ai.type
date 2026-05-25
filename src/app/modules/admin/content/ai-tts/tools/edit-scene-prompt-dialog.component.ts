import { Component, Inject, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ToastrService } from 'ngx-toastr';
import { DirectorModeComponent } from './director-mode.component';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GoogleGenAI } from '@google/genai';
import { GenaiService } from 'app/genai.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MatSelectModule } from '@angular/material/select';

@Component({
    selector: 'app-edit-scene-prompt-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatInputModule, TextFieldModule, MatProgressSpinnerModule, MatTooltipModule, MatSelectModule],
    templateUrl: './edit-scene-prompt-dialog.component.html'
})
export class EditScenePromptDialogComponent {
    editingScenePrompt: any;
    editingSceneIndex: number;
    characters: any[] = [];
    masterPrompt: string = '';
    selectedReferenceChars = new Set<any>();

    isGeneratingImage: boolean = false;
    isGeneratingVideo: boolean = false;

    selectedAspectRatio: string = '9:16';
    aspectRatios = [
        { value: '16:9', label: '16:9 (Ngang)' },
        { value: '9:16', label: '9:16 (Dọc)' },
        { value: '4:3', label: '4:3' },
        { value: '3:4', label: '3:4' },
        { value: '1:1', label: '1:1 (Vuông)' }
    ];

    getAspectRatioStyle() {
        switch (this.selectedAspectRatio) {
            case '16:9': return { 'width': '192px', 'height': '108px' };
            case '9:16': return { 'width': '108px', 'height': '192px' };
            case '4:3': return { 'width': '160px', 'height': '120px' };
            case '3:4': return { 'width': '120px', 'height': '160px' };
            case '1:1': return { 'width': '144px', 'height': '144px' };
            default: return { 'width': '192px', 'height': '108px' };
        }
    }

    toggleReferenceChar(char: any) {
        if (this.selectedReferenceChars.has(char)) {
            this.selectedReferenceChars.delete(char);

            // Tự động xóa thông tin nhân vật khỏi prompt
            const charName = char.name || char.role;
            if (charName && this.editingScenePrompt.prompt) {
                const escapedName = charName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\s*\\[Character '${escapedName}'[\\s\\S]*?\\]`, 'g');
                this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(regex, '').trim();
            }
        } else {
            this.selectedReferenceChars.add(char);

            // Tự động chèn thông tin nhân vật vào prompt nếu chưa có
            const charName = char.name || char.role;
            const charToken = `[Character '${charName}'`;

            if (this.editingScenePrompt.prompt) {
                if (!this.editingScenePrompt.prompt.includes(charToken)) {
                    let charDesc = char.appearance ? char.appearance : `Portrait of ${charName}`;
                    this.editingScenePrompt.prompt += `\n\n[Character '${charName}': ${charDesc}]`;
                }
            } else {
                let charDesc = char.appearance ? char.appearance : `Portrait of ${charName}`;
                this.editingScenePrompt.prompt = `[Character '${charName}': ${charDesc}]`;
            }
        }
    }

    isReferenceCharSelected(char: any): boolean {
        return this.selectedReferenceChars.has(char);
    }

    private getBase64FromImageUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject('Empty URL');
                return;
            }
            // Nếu url đã là base64 thì trả về phần data
            if (url.startsWith('data:image')) {
                resolve(url.split(',')[1]);
                return;
            }

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                resolve(dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""));
            };
            img.onerror = error => reject(error);
            img.src = url;
        });
    }

    constructor(
        public dialogRef: MatDialogRef<EditScenePromptDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private dialog: MatDialog,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) {
        this.editingSceneIndex = data.index;
        this.editingScenePrompt = { ...data.scene };
        this.selectedAspectRatio = this.editingScenePrompt.aspectRatio || data.projectAspectRatio || '16:9';
        this.characters = data.characters || [];
        this.masterPrompt = data.masterPrompt ? data.masterPrompt.trim() : '';

        // Không còn dán masterPrompt vào Scene Prompt nữa
        // Theo yêu cầu mới, masterPrompt đã được đưa thẳng vào Character Prompt.

        // Tự động active các nhân vật đã có sẵn trong prompt
        if (this.editingScenePrompt.prompt) {
            for (const char of this.characters) {
                const charName = char.name || char.role;
                if (charName && this.editingScenePrompt.prompt.includes(`[Character '${charName}'`)) {
                    this.selectedReferenceChars.add(char);
                }
            }
        }

        // Tự động đồng bộ thời lượng trong prompt nếu có sự lệch hướng khi mở dialog
        if (this.editingScenePrompt.duration && this.editingScenePrompt.prompt) {
            const regex = /(NOTE:\s*This\s*scene\s*is\s*)([\d.]+)(\s*seconds?\s*long)/gi;
            this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(
                regex,
                `$1${this.editingScenePrompt.duration}$3`
            );
        }
    }

    private safeUrlCache: { [url: string]: SafeUrl } = {};
    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        if (cleanUrl.startsWith('http') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
            // do nothing
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            let basename = cleanUrl.split(/[/\\]/).pop() || cleanUrl;
            basename = basename.replace(/^\d{13}_/, '');
            
            const mediaDir = this.data?.mediaDir || '';
            if (mediaDir) {
                cleanUrl = `media://${mediaDir}/${basename}`;
            } else {
                let projectUuid = this.data?.uuid;
                if (!projectUuid) {
                    const parts = window.location.href.split('/');
                    projectUuid = parts[parts.length - 1];
                }
                cleanUrl = `media://AUTO_FIND/${projectUuid || 'default'}/${basename}`;
            }
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

        const keys = secretKey.map((k: string) => k.trim()).filter((k: string) => k);
        if (keys.length === 0) return null;
        
        // Random load balancing cho các tính năng render ảnh/video phụ trợ
        return keys[Math.floor(Math.random() * keys.length)];
    }

    getFullImagePrompt(): string {
        // Lấy prompt dành cho ảnh (không có lệnh tạo video)
        let baseText = this.editingScenePrompt.imagePrompt || this.editingScenePrompt.prompt || '';
        
        // Loại bỏ các thẻ [Character ...] cũ nếu có để tạo lại từ các checkbox hiện tại
        baseText = baseText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();

        let addedChars = [];
        for (const char of this.selectedReferenceChars) {
            let charDesc = char.prompt || char.appearance || '';
            if (this.masterPrompt && charDesc.startsWith(this.masterPrompt.trim())) {
                charDesc = charDesc.substring(this.masterPrompt.trim().length).trim();
            }
            if (charDesc) {
                addedChars.push(`[Character '${char.name}': ${charDesc}]`);
            }
        }
        
        if (addedChars.length > 0) {
            baseText = addedChars.join('\n') + '\n\n' + baseText;
        }

        if (this.masterPrompt) {
            baseText = this.masterPrompt.trim() + '\n\n' + baseText;
        }

        return baseText;
    }

    getFullVideoPrompt(): string {
        // Lấy prompt dành cho video
        let baseText = this.editingScenePrompt.prompt || '';
        
        // Loại bỏ các thẻ [Character ...] cũ nếu có để tạo lại từ các checkbox hiện tại
        baseText = baseText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();

        let addedChars = [];
        for (const char of this.selectedReferenceChars) {
            let charDesc = char.prompt || char.appearance || '';
            if (this.masterPrompt && charDesc.startsWith(this.masterPrompt.trim())) {
                charDesc = charDesc.substring(this.masterPrompt.trim().length).trim();
            }
            if (charDesc) {
                addedChars.push(`[Character '${char.name}': ${charDesc}]`);
            }
        }
        
        if (addedChars.length > 0) {
            baseText = addedChars.join('\n') + '\n\n' + baseText;
        }

        if (this.masterPrompt) {
            baseText = this.masterPrompt.trim() + '\n\n' + baseText;
        }

        return baseText;
    }

    async generateImage() {
        if (!this.editingScenePrompt.prompt) {
            this.toastr.warning('Vui lòng nhập prompt phân cảnh trước khi tạo ảnh!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        const apiKey = this.getGeminiKey();
        if (!apiKey) {
            this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
            return;
        }

        this.isGeneratingImage = true;
        this.cd.markForCheck();

        try {
            // Thay vì dùng prompt cho video, ta dùng prompt đã clean của ảnh
            let promptText = this.editingScenePrompt.imagePrompt || this.editingScenePrompt.prompt || '';
            
            // Xóa các tag character cũ vì bên dưới ta sẽ đẩy vào mảng requestParts (tránh lặp)
            promptText = promptText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();
            
            if (this.masterPrompt) {
                promptText = this.masterPrompt + '\n\n' + promptText;
            }
            const noSplitScreenConstraint = "\n\n[MANDATORY: Generate exactly ONE single, unified frame. Do NOT generate multiple panels, split screens, storyboards, comic strips, collages, or grids. This must be a single cohesive image.]";
            
            let requestParts: any[] = [{ text: promptText + noSplitScreenConstraint }];

            // Gắn thêm ảnh reference của nhân vật vào parts
            for (const char of this.selectedReferenceChars) {
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

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview', // Thay thế bằng model phù hợp của Gemini
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

            const fileName = `scene_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: base64Data,
                fileName: fileName,
                folder: 'scenes',
                username: 'ai_type'
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.editingScenePrompt.imageUrl = finalPath;
                this.toastr.success('Đã tạo Storyboard thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (error: any) {
            console.error('Error generating scene image:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo ảnh AI: ' + errorMsg);
        } finally {
            this.isGeneratingImage = false;
            this.cd.markForCheck();
        }
    }

    async generateVideo() {
        if (!this.editingScenePrompt.prompt) {
            this.toastr.warning('Vui lòng nhập prompt phân cảnh trước khi tạo video!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        this.isGeneratingVideo = true;
        this.cd.markForCheck();

        try {
            let base64 = '';

            const isProxy = this._genaiService.isUModelverseEnabled();
            console.log("generateVideo: UModelverse proxy enabled status =", isProxy, "URL =", this._genaiService.umodelverseUrl);

            // Fetch storyboard image if exists
            let referenceImages: any[] = [];
            if (this.editingScenePrompt.imageUrl && this.isImageType(this.editingScenePrompt.imageUrl)) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.editingScenePrompt.imageUrl);
                    referenceImages.push({
                        image: {
                            imageBytes: base64Data,
                            mimeType: 'image/png'
                        },
                        referenceType: 'ASSET'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Storyboard làm reference cho video:', e);
                }
            }

            // Fetch character reference images if selected
            for (const char of this.selectedReferenceChars) {
                const imgUrl = char.avatarUrl || (char.avatarUrls && char.avatarUrls.length > 0 ? char.avatarUrls[0] : null);
                if (imgUrl) {
                    try {
                        const base64Data = await this.getBase64FromImageUrl(imgUrl);
                        referenceImages.push({
                            image: {
                                imageBytes: base64Data,
                                mimeType: 'image/png'
                            },
                            referenceType: 'ASSET'
                        });
                    } catch (e) {
                        console.error('Không thể đọc ảnh reference cho video:', char.name, e);
                    }
                }
            }

            let finalPrompt = this.editingScenePrompt.prompt;
            if (this.masterPrompt) {
                finalPrompt = this.masterPrompt + '\n\n' + finalPrompt;
            }
            if (this.editingScenePrompt.duration) {
                finalPrompt += `\n[MANDATORY: Generate video with exact duration of ${this.editingScenePrompt.duration} seconds]`;
            }

            if (isProxy) {
                // Sử dụng Mì Tôm AI (Proxy) để tạo Video
                const modelName = this._genaiService.umodelverseVideoModel || 'cogvideox-5b';
                this.toastr.info(`Đang gửi yêu cầu tạo video qua Mì Tôm AI (Base URL: ${this._genaiService.umodelverseUrl}, Model: ${modelName})...`, 'Hệ thống', { timeOut: 5000 });
                
                base64 = await this._genaiService.generateVideoUModelverse(
                    finalPrompt,
                    this.selectedAspectRatio,
                    referenceImages,
                    this.editingScenePrompt.duration
                );
            } else {
                // Chạy trực tiếp qua máy chủ Google bằng SDK chính thức
                const apiKey = this.getGeminiKey();
                if (!apiKey) {
                    this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
                    this.isGeneratingVideo = false;
                    this.cd.markForCheck();
                    return;
                }

                const ai = this._genaiService.googleAi || new GoogleGenAI({ apiKey: apiKey });
                let operation: any;

                const videoConfig: any = {};
                if (this.selectedAspectRatio) {
                    videoConfig.aspectRatio = this.selectedAspectRatio;
                }
                if (referenceImages.length > 0) {
                    videoConfig.referenceImages = referenceImages.slice(0, 3);
                }

                operation = await ai.models.generateVideos({
                    model: 'veo-3.1-generate-preview',
                    prompt: finalPrompt,
                    config: videoConfig
                });

                let pollCount = 0;
                const MAX_POLLS = 60; // 10 minutes max

                while (!operation.done) {
                    if (pollCount >= MAX_POLLS) {
                        throw new Error('Quá thời gian chờ tạo video (10 phút).');
                    }
                    await new Promise(resolve => setTimeout(resolve, 10000));

                    // Refresh operation status
                    operation = await ai.operations.getVideosOperation({
                        operation: operation,
                    });
                    pollCount++;
                }

                if (!operation.response || !operation.response.generatedVideos || operation.response.generatedVideos.length === 0) {
                    throw new Error('Không nhận được video từ AI.');
                }

                const videoInfo = operation.response.generatedVideos[0];
                const videoUri = videoInfo.video.uri;

                if (!videoUri) {
                    throw new Error('Không tìm thấy URI tải video.');
                }

                this.toastr.info('Đang tải video về máy...', 'Hệ thống');

                // Download video using fetch with API key header
                const res = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
                if (!res.ok) throw new Error('Không thể tải file video từ Google.');

                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;

                // Optimization for large base64 conversion
                const chunkSize = 8192;
                for (let i = 0; i < len; i += chunkSize) {
                    base64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
                }
                base64 = btoa(base64);
            }

            const fileName = `scene_video_${Date.now()}.mp4`;
            const result = await electron.saveBase64({
                base64: base64,
                fileName: fileName,
                folder: 'scenes_videos',
                username: 'ai_type'
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.editingScenePrompt.videoUrl = finalPath;
                this.toastr.success('Đã tạo và tải Video phân cảnh thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file video.');
            }
        } catch (error: any) {
            console.error('Error generating scene video:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo video AI: ' + errorMsg);
        } finally {
            this.isGeneratingVideo = false;
            this.cd.markForCheck();
        }
    }

    private formatGeminiError(error: any): string {
        let msg = error.message || error.toString() || 'Lỗi không xác định';

        try {
            const match = msg.match(/\{"error":.*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.error && parsed.error.message) {
                    msg = parsed.error.message;
                }
            }
        } catch { }

        // Nếu là lỗi của Proxy UModelverse hoặc chứa trace_id / model mismatch, giữ nguyên để hiển thị
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

    onDurationChanged(newDuration: number) {
        if (!this.editingScenePrompt) return;
        this.editingScenePrompt.duration = newDuration;

        if (this.editingScenePrompt.prompt && newDuration !== null && newDuration !== undefined) {
            const regex = /(NOTE:\s*This\s*scene\s*is\s*)([\d.]+)(\s*seconds?\s*long)/gi;
            this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(
                regex,
                `$1${newDuration}$3`
            );
        }
    }

    addCharToScenePrompt(char: any) {
        if (!this.editingScenePrompt) return;

        const currentPrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
        let charDesc = char.appearance ? char.appearance : char.prompt;
        if (!charDesc) return;

        if (charDesc.toLowerCase().startsWith('mặc ') || charDesc.toLowerCase().startsWith('đang mặc ')) {
            charDesc = charDesc.charAt(0).toLowerCase() + charDesc.slice(1);
        }

        const textToInsert = `${char.name || char.role}: ${charDesc}`;

        if (currentPrompt) {
            if (currentPrompt.includes(charDesc) || currentPrompt.includes(textToInsert)) {
                this.toastr.info('Nhân vật này đã có trong phân cảnh rồi.');
                return;
            }

            let insertIndex = currentPrompt.length;
            const constraintsMatch = currentPrompt.match(/\n*(\(Constraints:|\[BẮT BUỘC:)/i);
            if (constraintsMatch && constraintsMatch.index !== undefined) {
                insertIndex = constraintsMatch.index;
            }

            if (insertIndex < currentPrompt.length) {
                const firstPart = currentPrompt.substring(0, insertIndex).trim();
                const lastPart = currentPrompt.substring(insertIndex).trim();
                const separator = firstPart.endsWith(',') || firstPart.endsWith('.') ? '\n\n' : '.\n\n';
                this.editingScenePrompt.prompt = firstPart + separator + textToInsert + '\n\n' + lastPart;
            } else {
                const separator = currentPrompt.endsWith(',') || currentPrompt.endsWith('.') ? '\n\n' : '.\n\n';
                this.editingScenePrompt.prompt = currentPrompt + separator + textToInsert;
            }
        } else {
            this.editingScenePrompt.prompt = textToInsert;
        }

        this.toastr.success(`Đã thêm nhân vật "${char.name || char.role}" vào phân cảnh!`);
    }

    openDirectorModeForScene() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '1024px',
            maxWidth: '95vw',
            panelClass: 'dark-theme-dialog',
            data: { prompt: this.editingScenePrompt?.prompt || '', targetName: 'Apply to Scene Prompt' }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                // 1. Áp dụng cho Video Prompt
                let currentPrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
                currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentPrompt) {
                    this.editingScenePrompt.prompt = '[Cinematography: ' + result + ']\n\n' + currentPrompt;
                } else {
                    this.editingScenePrompt.prompt = '[Cinematography: ' + result + ']';
                }

                // 2. Áp dụng cho Image Prompt (Blueprint)
                let currentImagePrompt = this.editingScenePrompt.imagePrompt ? this.editingScenePrompt.imagePrompt.trim() : '';
                currentImagePrompt = currentImagePrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentImagePrompt) {
                    this.editingScenePrompt.imagePrompt = '[Cinematography: ' + result + ']\n\n' + currentImagePrompt;
                } else {
                    this.editingScenePrompt.imagePrompt = '[Cinematography: ' + result + ']';
                }

                this.toastr.success('Đã áp dụng thông số Director Mode cho cả Hình Ảnh và Video!');
            }
        });
    }

    removeMedia() {
        this.editingScenePrompt.imageUrl = null;
        this.editingScenePrompt.videoUrl = null;
    }

    isImageType(url: string): boolean {
        if (!url) return false;
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        ];
        const cleanUrl = url.replace('file://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    async onImageSelected(event: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            try {
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình. Tính năng này yêu cầu App Desktop.');
                    return;
                }

                const file = fileInput.files[0];
                const originalPath = electron.getPathForFile(file);

                if (originalPath) {
                    const localFilePath = await electron.selectLocalFile(originalPath);
                    const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath}`;
                    this.editingScenePrompt.imageUrl = finalPath;
                }

                this.toastr.success('Đã tải ảnh Storyboard thành công!');
            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    autoFixVideoPrompt() {
        let originalScenePrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
        let originalImagePrompt = this.editingScenePrompt.imagePrompt ? this.editingScenePrompt.imagePrompt.trim() : originalScenePrompt;

        if (!originalScenePrompt) {
            originalScenePrompt = originalImagePrompt;
        } else if (originalImagePrompt.length > originalScenePrompt.length) {
            if (originalImagePrompt.includes(originalScenePrompt)) {
                originalScenePrompt = originalImagePrompt;
            } else {
                originalScenePrompt = originalImagePrompt + '\n\n' + originalScenePrompt;
            }
        }
        
        this.editingScenePrompt.prompt = originalScenePrompt;
        this.toastr.success('Đã tự động bù đắp bối cảnh từ Hình ảnh sang Video', 'Auto-fix');
    }

    copyPrompt(text: string) {
        if (!text) {
            this.toastr.warning('Không có nội dung để copy.');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this.toastr.success('Đã copy Prompt phân cảnh (bao gồm Master Prompt & Nhân vật)!');
        }).catch(err => {
            console.error('Lỗi khi copy:', err);
            this.toastr.error('Lỗi khi copy!');
        });
    }

    save() {
        if (this.editingScenePrompt) {
            this.editingScenePrompt.aspectRatio = this.selectedAspectRatio;
            // Đảm bảo đồng bộ thời lượng trong prompt một lần nữa trước khi lưu
            if (this.editingScenePrompt.duration && this.editingScenePrompt.prompt) {
                const regex = /(NOTE:\s*This\s*scene\s*is\s*)([\d.]+)(\s*seconds?\s*long)/gi;
                this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(
                    regex,
                    `$1${this.editingScenePrompt.duration}$3`
                );
            }
        }
        this.dialogRef.close(this.editingScenePrompt);
    }
}
