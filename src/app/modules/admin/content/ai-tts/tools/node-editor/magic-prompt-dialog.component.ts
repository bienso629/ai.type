import { TranslocoModule } from '@ngneat/transloco';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { GenaiService } from 'app/genai.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';

@Component({
    selector: 'app-magic-prompt-dialog',
    standalone: true,
    imports: [
        TranslocoModule,
        CommonModule,
        MatDialogModule,
        MatProgressSpinnerModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
        FormsModule,
        MatInputModule,
        TextFieldModule
    ],
    templateUrl: './magic-prompt-dialog.component.html',
    styles: [`
        .light-theme { background-color: #ffffff; color: #111827; }
        .section-card { padding: 0; margin-bottom: 16px; }
        .section-card:last-child { margin-bottom: 0; }
    `]
})
export class MagicPromptDialogComponent implements OnInit {
    currentPrompt: string = '';
    userInstruction: string = '';
    generatedPrompt: string = '';
    isGenerating: boolean = false;
    imageFile: File | null = null;
    imageBase64: string | null = null;

    constructor(
        public dialogRef: MatDialogRef<MagicPromptDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private genaiService: GenaiService
    ) {
        if (data?.currentPrompt) {
            this.currentPrompt = data.currentPrompt;
        }
    }

    ngOnInit(): void {}

    cancel(): void {
        this.dialogRef.close();
    }

    apply(): void {
        this.dialogRef.close(this.generatedPrompt || this.currentPrompt);
    }

    onFileSelected(event: any): void {
        const file = event.target.files[0];
        if (file) {
            this.imageFile = file;
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.imageBase64 = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    removeImage(): void {
        this.imageFile = null;
        this.imageBase64 = null;
    }

    async generate(): Promise<void> {
        this.isGenerating = true;
        try {
            let promptText = `Bạn là một chuyên gia viết prompt cho AI tạo ảnh và video. Tôi có một prompt gốc như sau:\n"${this.currentPrompt}"\n\n`;
            
            if (this.userInstruction) {
                promptText += `Yêu cầu bổ sung để chỉnh sửa/phát triển prompt này:\n"${this.userInstruction}"\n\n`;
            }
            
            if (this.data?.type === 'character') {
                promptText += `Hãy viết lại và bổ sung thật chi tiết (ngoại hình, quần áo, góc mặt, phong cách...) để dùng tạo nhân vật nhất quán.\n`;
            } else {
                promptText += `Hãy viết lại và bổ sung thật chi tiết (ánh sáng, góc máy, môi trường, hành động...) để dùng tạo video điện ảnh.\n`;
            }
            
            promptText += `Trả về CHỈ kết quả prompt đã được viết lại bằng tiếng Anh (hoặc ngôn ngữ gốc nếu là tiếng Việt, nhưng ưu tiên tiếng Anh cho AI tạo ảnh). Không giải thích gì thêm.`;

            const contents: any[] = [{ text: promptText }];
            if (this.imageBase64) {
                const base64Data = this.imageBase64.split(',')[1];
                contents.push({
                    inlineData: {
                        data: base64Data,
                        mimeType: this.imageFile?.type || 'image/jpeg'
                    }
                });
            }

            const res = await this.genaiService.generateText({
                model: 'gemini-1.5-pro',
                contents: contents
            } as any);

            this.generatedPrompt = res || '';
            
            if (!this.generatedPrompt) {
                this.toastr.warning('Không có kết quả trả về từ AI.');
            }
        } catch (error: any) {
            console.error('Error generating prompt:', error);
            this.toastr.error('Lỗi khi tạo prompt: ' + (error.message || 'Unknown error'));
        } finally {
            this.isGenerating = false;
        }
    }
}
