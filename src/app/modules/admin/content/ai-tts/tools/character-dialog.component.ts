import { Component, Inject, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GenaiService } from 'app/genai.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-character-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatInputModule, TextFieldModule, MatIconModule, MatSelectModule, MatProgressSpinnerModule],
    templateUrl: './character-dialog.component.html'
})
export class CharacterDialogComponent {
    editingChar: any;
    isEditMode: boolean = false;
    isGeneratingAvatar: boolean = false;
    masterPrompt: string = '';
    referenceImageUrl: string | null = null;
    private safeUrlCache: { [url: string]: SafeUrl } = {};

    constructor(
        public dialogRef: MatDialogRef<CharacterDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) {
        this.isEditMode = data.index >= 0;
        this.editingChar = data.char ? { 
            ...data.char,
            avatarUrls: data.char.avatarUrls ? [...data.char.avatarUrls] : []
        } : { name: '', variant: '', role: '', appearance: '', personality: '', prompt: '', avatarUrl: null, avatarUrls: [] };
        this.masterPrompt = data.masterPrompt || '';
        
        // Backward compatibility: if avatarUrl exists but avatarUrls is empty
        if (this.editingChar.avatarUrl && (!this.editingChar.avatarUrls || this.editingChar.avatarUrls.length === 0)) {
            this.editingChar.avatarUrls = [this.editingChar.avatarUrl];
        } else if (!this.editingChar.avatarUrls) {
            this.editingChar.avatarUrls = [];
        }
        
        this.updateAvailableReferenceImages();
    }

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

    private getBase64FromImageUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject('Empty URL');
                return;
            }
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

    cleanName(name: string) {
        if (!name) return '';
        return name.trim().toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9]/g, '');
    }

    availableReferenceImages: { url: string, name: string, variant: string }[] = [];

    updateAvailableReferenceImages() {
        const existingChars = this.data.existingCharacters || [];
        const result: { url: string, name: string, variant: string }[] = [];
        const seenUrls = new Set<string>();
        
        existingChars.forEach((c: any, idx: number) => {
            // Include all characters except the current one being edited
            if (idx !== this.data.index || c.variant !== this.editingChar.variant) {
                if (c.avatarUrls && c.avatarUrls.length > 0) {
                    c.avatarUrls.forEach((url: string) => {
                        if (!seenUrls.has(url)) {
                            result.push({ url, name: c.name || 'Vô danh', variant: c.variant || 'Gốc' });
                            seenUrls.add(url);
                        }
                    });
                } else if (c.avatarUrl && !seenUrls.has(c.avatarUrl)) {
                    result.push({ url: c.avatarUrl, name: c.name || 'Vô danh', variant: c.variant || 'Gốc' });
                    seenUrls.add(c.avatarUrl);
                }
            }
        });

        // Ưu tiên đưa các ảnh có cùng tên nhân vật lên đầu
        const cleanNameStr = this.cleanName(this.editingChar.name);
        if (cleanNameStr) {
            result.sort((a, b) => {
                const aMatch = this.cleanName(a.name) === cleanNameStr ? -1 : 1;
                const bMatch = this.cleanName(b.name) === cleanNameStr ? -1 : 1;
                return aMatch - bMatch;
            });
        }
        
        this.availableReferenceImages = result;
        
        // If the current reference image is not in the list anymore, clear it
        if (this.referenceImageUrl && !result.find(img => img.url === this.referenceImageUrl)) {
            this.referenceImageUrl = null;
        }
    }

    async generateAvatar() {
        if (!this.editingChar.prompt && !this.editingChar.appearance) {
            this.toastr.warning('Vui lòng điền Prompt Tạo hình hoặc Ngoại hình trước khi tạo ảnh!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Tính năng này yêu cầu App Desktop (Electron).');
            return;
        }

        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        const keys = secretKey.map((k: string) => k.trim()).filter((k: string) => k);
        if (keys.length === 0) {
            this.toastr.warning('Bạn chưa cung cấp API Key hợp lệ.');
            return;
        }
        
        const apiKey = keys[Math.floor(Math.random() * keys.length)];

        this.isGeneratingAvatar = true;
        this.cd.markForCheck();

        try {
            // const ai = new GoogleGenAI({ apiKey: apiKey });
            
            // Build the prompt
            let promptPartsText = [];
            if (this.editingChar.name || this.editingChar.role) promptPartsText.push(`Subject: ${this.editingChar.name || this.editingChar.role}`);
            if (this.editingChar.appearance) promptPartsText.push(`Appearance: ${this.editingChar.appearance}`);
            if (this.editingChar.personality) promptPartsText.push(`Personality/Expression: ${this.editingChar.personality}`);
            if (this.editingChar.prompt) promptPartsText.push(`Style/Additional Prompt: ${this.editingChar.prompt}`);
            
            let finalPrompt = promptPartsText.join('\n');

            let requestParts: any[] = [{ text: finalPrompt }];

            let refImgUrl = null;

            const targetCleanName = this.cleanName(this.editingChar.name);

            // Thứ tự ưu tiên nạp ảnh tham chiếu (đồng bộ gương mặt):
            // 0. Ưu tiên cao nhất: Ảnh do người dùng chủ động đính kèm vào phần Prompt
            if (this.referenceImageUrl) {
                refImgUrl = this.referenceImageUrl;
            }
            // 1. Ưu tiên 1: Lấy ảnh hiện tại đang hoạt động của chính nhân vật này (nếu đã có ảnh trước đó và muốn tạo tư thế mới)
            else if (this.editingChar.avatarUrl) {
                refImgUrl = this.editingChar.avatarUrl;
            } else if (this.editingChar.avatarUrls && this.editingChar.avatarUrls.length > 0) {
                refImgUrl = this.editingChar.avatarUrls[0];
            } 
            // 2. Ưu tiên 2: Nếu chưa có ảnh, tìm nhân vật gốc cùng tên để đồng bộ gương mặt chéo giữa các phiên bản
            else {
                const existingChars = this.data.existingCharacters || [];
                const originalChar = existingChars.find((c: any, idx: number) => 
                    c.name && this.editingChar.name &&
                    this.cleanName(c.name) === targetCleanName && 
                    (c.avatarUrl || (c.avatarUrls && c.avatarUrls.length > 0)) &&
                    idx !== this.data.index &&
                    c.variant !== this.editingChar.variant
                );

                if (originalChar) {
                    refImgUrl = originalChar.avatarUrl || (originalChar.avatarUrls && originalChar.avatarUrls.length > 0 ? originalChar.avatarUrls[0] : null);
                    if (refImgUrl) {
                        this.toastr.info(`Đã tìm thấy phiên bản "${originalChar.variant || 'gốc'}" của ${this.editingChar.name}, đang tự động đồng bộ gương mặt nhân vật...`, 'Đồng bộ khuôn mặt');
                    }
                }
            }

            if (refImgUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(refImgUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh gốc làm reference để đồng bộ:', e);
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ role: 'user', parts: requestParts }],
                config: {
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

            const fileName = `avatar_${this.editingChar.name || 'char'}_${Date.now()}.png`.replace(/[^a-zA-Z0-9_.]/g, '');
            const uuid = this.data?.uuid;
            const username = this.data?.username || 'anonymous';
            const saveParams: any = {
                base64: base64Data,
                fileName: fileName
            };
            if (uuid) {
                saveParams.customDir = `tts/${username}/${uuid}`;
            } else {
                saveParams.folder = 'avatars';
                saveParams.username = username;
            }

            const result = await electron.saveBase64(saveParams);

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                if (!this.editingChar.avatarUrls) {
                    this.editingChar.avatarUrls = [];
                }
                this.editingChar.avatarUrls.push(finalPath);
                
                if (this.editingChar.avatarUrls.length === 1) {
                    this.editingChar.avatarUrl = this.editingChar.avatarUrls[0];
                }
                
                this.toastr.success('Đã tạo ảnh nhân vật thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (error: any) {
            console.error('Error generating avatar:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo ảnh AI: ' + errorMsg);
        } finally {
            this.isGeneratingAvatar = false;
            this.cd.markForCheck();
        }
    }

    private formatGeminiError(error: any): string {
        let msg = error.message || error.toString() || 'Lỗi không xác định';
        
        // Cố gắng parse JSON nếu Google trả về cục JSON error gộp trong string
        try {
            const match = msg.match(/\{"error":.*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.error && parsed.error.message) {
                    msg = parsed.error.message;
                }
            }
        } catch {}

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

    async onAvatarSelected(event: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            try {
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình. Tính năng này yêu cầu App Desktop.');
                    return;
                }

                if (!this.editingChar.avatarUrls) {
                    this.editingChar.avatarUrls = [];
                }

                for (let i = 0; i < fileInput.files.length; i++) {
                    const file = fileInput.files[i];
                    const originalPath = electron.getPathForFile(file);

                    if (originalPath) {
                        const uuid = this.data?.uuid;
                        const username = this.data?.username || 'anonymous';
                        const customDir = uuid ? `tts/${username}/${uuid}` : undefined;
                        
                        const localFilePath = await electron.selectLocalFile(originalPath, customDir);
                        const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath}`;
                        if (!this.editingChar.avatarUrls.includes(finalPath)) {
                            this.editingChar.avatarUrls.push(finalPath);
                        }
                    }
                }
                
                if (this.editingChar.avatarUrls.length > 0) {
                    this.editingChar.avatarUrl = this.editingChar.avatarUrls[0];
                }

                this.toastr.success('Đã tải ảnh nhân vật thành công!');
            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    removeAvatar(index: number) {
        if (this.editingChar.avatarUrls && this.editingChar.avatarUrls.length > index) {
            this.editingChar.avatarUrls.splice(index, 1);
            this.editingChar.avatarUrl = this.editingChar.avatarUrls.length > 0 ? this.editingChar.avatarUrls[0] : null;
        }
    }

    removeRefImage() {
        this.referenceImageUrl = null;
        this.cd.detectChanges();
    }

    save() {
        this.dialogRef.close(this.editingChar);
    }

    copyPrompt(text: string) {
        if (!text) {
            this.toastr.warning('Không có nội dung để copy.');
            return;
        }

        navigator.clipboard.writeText(text.trim()).then(() => {
            this.toastr.success('Đã copy Prompt!');
        }).catch(err => {
            this.toastr.error('Lỗi khi copy: ' + err);
        });
    }
}
