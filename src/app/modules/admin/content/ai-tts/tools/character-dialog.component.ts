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
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-character-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatInputModule, TextFieldModule, MatIconModule, MatSelectModule, MatProgressSpinnerModule, MatMenuModule, MatTooltipModule],
    templateUrl: './character-dialog.component.html'
})
export class CharacterDialogComponent {
    editingChar: any;
    isEditMode: boolean = false;
    isGeneratingAvatar: boolean = false;
    masterPrompt: string = '';
    referenceImageUrl: string | null = null;
    
    aiProfilePrompt: string = '';
    isGeneratingProfile: boolean = false;
    showFullForm: boolean = false;
    
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
        this.showFullForm = this.isEditMode;
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
            const originalPath = cleanUrl;

            const mediaDir = this.data?.mediaDir || '';
            let projectUuid = this.data?.uuid;
            if (!projectUuid) {
                const parts = window.location.href.split('/');
                projectUuid = parts[parts.length - 1];
            }

            cleanUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=${encodeURIComponent(projectUuid || 'default')}`;
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

            let finalUrl = url;
            if (!finalUrl.startsWith('http') && !finalUrl.startsWith('data:') && !finalUrl.startsWith('blob:') && !finalUrl.startsWith('media://')) {
                finalUrl = finalUrl.replace(/^unsafe:/, '');
                let originalPath = finalUrl.split('?')[0];
                originalPath = originalPath.replace(/^file:\/\//i, '');
                const mediaDir = ''; // Need to extract this from somewhere, or just leave empty and rely on uuid
                finalUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=default`;
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
            img.src = finalUrl;
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

    onReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.referenceImageUrl = URL.createObjectURL(file);
            this.generateAvatar();
        }
        event.target.value = '';
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
            // Build the prompt
            let promptPartsText = [];
            if (this.editingChar.name || this.editingChar.role) promptPartsText.push(`Subject: ${this.editingChar.name || this.editingChar.role}`);
            if (this.editingChar.appearance) promptPartsText.push(`Appearance: ${this.editingChar.appearance}`);
            if (this.editingChar.personality) promptPartsText.push(`Personality/Expression: ${this.editingChar.personality}`);
            if (this.editingChar.prompt) promptPartsText.push(`Style/Additional Prompt: ${this.editingChar.prompt}`);
            
            let finalPrompt = promptPartsText.join('\n');
            
            // Lấy phong cách visual từ master prompt (master prompt quy định style toàn bộ project)
            if (this.masterPrompt && this.masterPrompt.trim()) {
                finalPrompt += `\n\n[VISUAL STYLE FROM PROJECT: ${this.masterPrompt.trim()}]\n[IMPORTANT: The character avatar MUST strictly follow the visual style described above. Match the same art style, rendering technique, and aesthetic.]`;
            }
            
            finalPrompt += '\n\n[MANDATORY: Generate a professional "Character Reference Sheet" showing the character from multiple angles (front, side, back) on a single cohesive canvas. Neutral background.]';

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
            this.referenceImageUrl = null;
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

    async generateProfileByAI() {
        if (!this.aiProfilePrompt && (!this.editingChar.avatarUrls || this.editingChar.avatarUrls.length === 0)) {
            this.toastr.warning('Vui lòng nhập ý tưởng hoặc tải lên một ảnh để AI có dữ liệu tạo hồ sơ!');
            return;
        }

        this.isGeneratingProfile = true;
        this.cd.markForCheck();

        try {
            const prompt = `Bạn là Giám đốc Sáng tạo và Chuyên gia Thiết kế Nhân vật.
Tôi muốn tạo một hồ sơ nhân vật hoàn chỉnh dựa trên ý tưởng và hình ảnh (nếu có) sau.

- Master Prompt (Bối cảnh chung của dự án): ${this.masterPrompt || 'Không có'}
- Ý tưởng/Yêu cầu của tôi: ${this.aiProfilePrompt || 'Không có yêu cầu cụ thể, hãy tự sáng tạo dựa trên ảnh hoặc bối cảnh.'}

Nếu tôi có đính kèm ảnh, hãy phân tích chi tiết gương mặt, trang phục, phong cách từ ảnh đó để viết ra ngoại hình và prompt tạo hình thật sát với ảnh gốc. Nếu không có ảnh, hãy tự sáng tạo dựa trên ý tưởng.

Yêu cầu trả về định dạng JSON thuần túy (không có markdown \`\`\`json) với cấu trúc:
{
    "name": "Tên nhân vật (ngắn gọn, phù hợp với ý tưởng)",
    "role": "Vai trò của nhân vật",
    "appearance": "Mô tả chi tiết về ngoại hình, độ tuổi, trang phục, kiểu tóc, phụ kiện...",
    "personality": "Mô tả tính cách, thái độ, biểu cảm...",
    "prompt": "Câu prompt tạo hình nhân vật (BẰNG TIẾNG ANH). YÊU CẦU: BẮT BUỘC phải mô tả rõ GIỚI TÍNH, ĐỘ TUỔI, trang phục, màu sắc. RẤT QUAN TRỌNG: Bắt buộc phải bắt đầu bằng cụm từ 'Character reference sheet, character turnaround, multiple views, front view, side view, back view, white background'."
}

Lưu ý: Chỉ trả về object JSON thuần túy.`;

            let requestParts: any[] = [{ text: prompt }];

            // Gửi ảnh đầu tiên (nếu có) cho AI phân tích
            if (this.editingChar.avatarUrls && this.editingChar.avatarUrls.length > 0) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.editingChar.avatarUrls[0]);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh đính kèm:', e);
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3-flash-preview', // Use a model capable of reading images
                contents: [{ role: 'user', parts: requestParts }],
                config: { temperature: 0.7 }
            });

            const text = response.text;
            if (text) {
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
                if (jsonMatch) {
                    const charData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    
                    this.editingChar.name = charData.name || this.editingChar.name;
                    this.editingChar.role = charData.role || this.editingChar.role;
                    this.editingChar.appearance = charData.appearance || this.editingChar.appearance;
                    this.editingChar.personality = charData.personality || this.editingChar.personality;
                    this.editingChar.prompt = charData.prompt || this.editingChar.prompt;
                    
                    this.showFullForm = true;
                    this.toastr.success('AI đã tạo xong hồ sơ nhân vật!');
                    this.cd.markForCheck();
                    return;
                }
            }
            this.toastr.error('AI không trả về đúng định dạng, vui lòng thử lại.');
        } catch (error: any) {
            console.error('Error generating profile:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi AI: ' + errorMsg);
        } finally {
            this.isGeneratingProfile = false;
            this.cd.markForCheck();
        }
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
