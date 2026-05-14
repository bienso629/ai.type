import { Component, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatIconModule } from '@angular/material/icon';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GoogleGenAI } from '@google/genai';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-character-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatInputModule, TextFieldModule, MatIconModule, MatProgressSpinnerModule],
    templateUrl: './character-dialog.component.html'
})
export class CharacterDialogComponent {
    editingChar: any;
    isEditMode: boolean = false;
    isGeneratingAvatar: boolean = false;
    masterPrompt: string = '';

    constructor(
        public dialogRef: MatDialogRef<CharacterDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef
    ) {
        this.isEditMode = data.index >= 0;
        this.editingChar = data.char ? { ...data.char } : { name: '', variant: '', role: '', appearance: '', personality: '', prompt: '', avatarUrl: null, avatarUrls: [] };
        this.masterPrompt = data.masterPrompt || '';
        
        // Backward compatibility: if avatarUrl exists but avatarUrls is empty
        if (this.editingChar.avatarUrl && (!this.editingChar.avatarUrls || this.editingChar.avatarUrls.length === 0)) {
            this.editingChar.avatarUrls = [this.editingChar.avatarUrl];
        } else if (!this.editingChar.avatarUrls) {
            this.editingChar.avatarUrls = [];
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

        if (!secretKey) {
            this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
            return;
        }
        
        const apiKey = secretKey[0];

        this.isGeneratingAvatar = true;
        this.cd.markForCheck();

        try {
            const ai = new GoogleGenAI({ apiKey: apiKey });
            
            // Build the prompt
            let finalPrompt = '';
            if (this.editingChar.prompt) {
                finalPrompt = this.editingChar.prompt;
            } else {
                finalPrompt = `Portrait of ${this.editingChar.name || this.editingChar.role}, ${this.editingChar.appearance}`;
            }
            if (this.masterPrompt) {
                finalPrompt = `${this.masterPrompt}\n\n${finalPrompt}`;
            }

            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: finalPrompt
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
            const result = await electron.saveBase64({
                base64: base64Data,
                fileName: fileName,
                folder: 'avatars',
                username: 'ai_type'
            });

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
                        const localFilePath = await electron.selectLocalFile(originalPath);
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

    save() {
        this.dialogRef.close(this.editingChar);
    }
}
