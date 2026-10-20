import { TranslocoModule } from '@jsverse/transloco';
import {
    Component,
    Inject,
    OnInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialogModule,
} from '@angular/material/dialog';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { GenaiService } from 'app/genai.service';
import { MultiAccountService } from 'app/_services/multi-account.service';

import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
    selector: 'app-magic-prompt-dialog',
    imports: [
        TranslocoModule,
        MatDialogModule,
        MatProgressSpinnerModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
        FormsModule,
        MatInputModule,
        TextFieldModule,
    ],
    templateUrl: './magic-prompt-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            .light-theme {
                background-color: #ffffff;
                color: #111827;
            }
            .section-card {
                padding: 0;
                margin-bottom: 16px;
            }
            .section-card:last-child {
                margin-bottom: 0;
            }
        `,
    ],
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
        private genaiService: GenaiService,
        private sanitizer: DomSanitizer,
        private cdr: ChangeDetectorRef,
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
                this.cdr.detectChanges();
            };
            reader.readAsDataURL(file);
        }
    }

    removeImage(): void {
        this.imageFile = null;
        this.imageBase64 = null;
        this.cdr.detectChanges();
    }

    isVideo(): boolean {
        return this.imageFile?.type?.startsWith('video/') || false;
    }

    getSafeUrl(): SafeUrl | string {
        return this.imageBase64
            ? this.sanitizer.bypassSecurityTrustUrl(this.imageBase64)
            : '';
    }

    async generate(): Promise<void> {
        this.isGenerating = true;
        this.cdr.detectChanges();
        try {
            let promptText = `Bạn là một chuyên gia kỹ thuật AI Prompt Engineering xuất sắc nhất thế giới cho các hệ thống tạo ảnh và video (Gemini, Midjourney, Kling, Stable Diffusion, v.v.).\n\n`;
            promptText += `=== CÂU PROMPT GỐC CẦN CHỈNH SỬA ===\n${this.currentPrompt}\n=== HẾT PROMPT GỐC ===\n\n`;

            if (this.userInstruction && this.userInstruction.trim()) {
                promptText += `=== YÊU CẦU BỔ SUNG / CHỈNH SỬA MỚI TỪ NGƯỜI DÙNG ===\n${this.userInstruction.trim()}\n=== HẾT YÊU CẦU BỔ SUNG ===\n\n`;
            }

            if (this.imageBase64) {
                promptText += `=== HÌNH ẢNH / TỆP THAM CHIẾU ĐÍNH KÈM ===\n`;
                promptText += `Người dùng đã đính kèm một hình ảnh/tệp tham chiếu. Hãy phân tích kỹ lưỡng hình ảnh này (đặc điểm nhân vật, khuôn mặt, biểu cảm, trang phục, màu sắc, phong cách nghệ thuật, ánh sáng, bối cảnh, tư thế) và tích hợp các đặc trưng then chốt đó vào nội dung prompt được sửa lại theo đúng yêu cầu mới.\n=== HẾT CHỈ DẪN ẢNH THAM CHIẾU ===\n\n`;
            }

            if (this.data?.type === 'character') {
                promptText += `[QUY TẮC ĐẶC BIỆT CHO NHÂN VẬT]: Đây là prompt tạo nhân vật hoặc bảng thiết kế nhân vật nhất quán. Cần mô tả tỉ mỉ các chi tiết nhận diện (khuôn mặt, kiểu tóc, trang phục đặc trưng, góc nhìn, phong cách mỹ thuật).\n\n`;
            } else {
                promptText += `[QUY TẮC ĐẶC BIỆT CHO PHÂN CẢNH / VIDEO]: Cần mô tả chi tiết góc quay, ánh sáng, chuyển động máy quay, bầu không khí và hành động của nhân vật/khung cảnh.\n\n`;
            }

            promptText += `=== NGUYÊN TẮC BẮT BUỘC KHI XUẤT KẾT QUẢ ===\n`;
            promptText += `1. GIỮ NGUYÊN CHUẨN CẤU TRÚC VÀ ĐỊNH DẠNG: Giữ đúng định dạng, cấu trúc trường và phong cách của prompt gốc (ví dụ: nếu prompt gốc có các mục như 'Master Prompt:', 'Characters:', 'Appearance:', 'Personality:', 'Prompt:', v.v., BẮT BUỘC giữ nguyên cấu trúc các mục đó). Sửa đổi hoặc thêm bớt các thông tin bên trong từng mục theo đúng yêu cầu mới của người dùng và hình ảnh tham chiếu.\n`;
            promptText += `2. ĐỒNG BỘ NGÔN NGỮ: Giữ nguyên ngôn ngữ gốc của prompt cũ (nếu prompt cũ viết bằng tiếng Việt, kết quả phải là tiếng Việt; nếu prompt cũ là tiếng Anh hoặc song ngữ, giữ đúng phong cách đó; tuyệt đối không tự ý dịch toàn bộ sang tiếng Anh nếu prompt cũ đang là tiếng Việt).\n`;
            promptText += `3. ĐẦU RA SẠCH TUYỆT ĐỐI: CHỈ trả về duy nhất nội dung câu prompt hoàn chỉnh đã được chỉnh sửa. Không bọc câu trả lời trong cặp dấu nháy kép ngoài cùng hay khối markdown code block (không dùng \`\`\` hoặc \`\`\`markdown). Tuyệt đối không thêm lời chào, giải thích, phân tích hay ghi chú ngoài lề.`;

            const parts: any[] = [{ text: promptText }];
            if (this.imageBase64) {
                let base64Data = this.imageBase64;
                let mimeType = this.imageFile?.type || 'image/jpeg';
                if (base64Data.startsWith('data:')) {
                    const match = base64Data.match(/^data:([^;]+);base64,(.*)$/);
                    if (match) {
                        mimeType = match[1];
                        base64Data = match[2];
                    } else {
                        base64Data = base64Data.split(',')[1] || '';
                    }
                }
                parts.push({
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType,
                    },
                });
            }

            const selectedModel = this.data?.selectedModel || 'gemini-3.8-flash';
            const contents: any[] = [{ role: 'user', parts: parts }];

            const res = await this.genaiService.generateText({
                model: selectedModel,
                contents: contents,
            } as any);

            let cleanRes = (res || '').trim();
            // Làm sạch code block nếu AI vô tình trả về markdown code fences
            if (cleanRes.startsWith('```')) {
                cleanRes = cleanRes.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
            }

            this.generatedPrompt = cleanRes;

            if (!this.generatedPrompt) {
                this.toastr.warning('Không có kết quả trả về từ AI.');
            }
        } catch (error: any) {
            console.error('Error generating prompt:', error);
            this.toastr.error(
                'Lỗi khi tạo prompt: ' + (error.message || 'Unknown error'),
            );
        } finally {
            this.isGenerating = false;
            this.cdr.detectChanges();
        }
    }
}
