import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GenaiService } from 'app/genai.service';

@Component({
    selector: 'app-add-scene',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatSelectModule
    ],
    template: `
    <div class="min-w-[480px] bg-white rounded-lg">
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center text-xl font-semibold text-primary">
                <mat-icon class="mr-2 text-primary">add_to_photos</mat-icon>
                Thêm Scene mới thủ công
            </div>
        </div>
        
        <div class="flex flex-col gap-5 pt-4">
            <mat-form-field appearance="outline" class="w-full">
                <mat-label>Chọn câu thoại có sẵn</mat-label>
                <mat-select [(ngModel)]="data.selectedClip" placeholder="Tìm và chọn một câu thoại..." required (selectionChange)="generateAIPrompt()">
                    <mat-option *ngFor="let item of data.availableClips; let i = index" [value]="item" [title]="item.description">
                        <span class="line-clamp-1">#{{ i + 1 }} {{ item.description }}</span>
                    </mat-option>
                </mat-select>
            </mat-form-field>

            <div class="relative w-full">
                <div class="flex items-center mb-2">
                    <mat-label class="text-sm font-medium text-gray-700">Prompt (Mô tả hình ảnh bằng tiếng Anh)</mat-label>
                    <div *ngIf="isGenerating" class="flex items-center ml-3 text-primary">
                        <mat-spinner diameter="16" class="mr-1 inline-block"></mat-spinner>
                        <span class="text-xs font-medium">Đang tạo...</span>
                    </div>
                </div>
                <mat-form-field appearance="outline" class="w-full">
                    <textarea matInput [(ngModel)]="data.prompt" rows="4" required 
                        placeholder="Hệ thống sẽ tự động tạo Prompt dựa trên Câu thoại và Nội dung truyện (Master Prompt)..."></textarea>
                    <mat-hint>Mô tả càng chi tiết, AI tạo ảnh càng đẹp.</mat-hint>
                </mat-form-field>
            </div>
        </div>
        
        <div mat-dialog-actions class="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
            <button mat-flat-button color="accent" (click)="onCancel()">Hủy bỏ</button>
            <button mat-flat-button color="primary" 
                    [mat-dialog-close]="data" 
                    [disabled]="!data.selectedClip || !data.prompt?.trim()">
                <mat-icon class="icon-size-5">add_task</mat-icon>
                <mat-label class="ml-2">Thêm vào Timeline</mat-label>
            </button>
        </div>
    </div>
    `,
    styles: [`
        :host {
            display: block;
            background: white;
        }
        mat-form-field {
            width: 100%;
        }
    `]
})
export class AddSceneComponent {
    isGenerating: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<AddSceneComponent>,
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService,
        private _genaiService: GenaiService,
        @Inject(MAT_DIALOG_DATA) public data: { selectedClip: any, prompt: string, characters?: any[], masterPrompt?: string, availableClips?: any[] }
    ) {
        // Đảm bảo data không bị undefined
        if (!this.data) {
            this.data = { selectedClip: null, prompt: '' };
        }
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    async generateAIPrompt() {
        if (!this.data.selectedClip) {
            this.toastr.warning('Vui lòng chọn một câu thoại trước khi sử dụng AI sinh Prompt.');
            return;
        }

        const subtitleText = this.data.selectedClip.description;

        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        if (!secretKey) {
            this.toastr.error('Thiếu API Key cho AI. Vui lòng kiểm tra cài đặt.');
            return;
        }

        // const geminiKey = secretKey[6] || secretKey[0];
        // const ai = new GoogleGenAI({ apiKey: geminiKey });

        this.isGenerating = true;

        let characterContext = '';
        if (this.data.characters && this.data.characters.length > 0) {
            const charList = this.data.characters.map((c: any) => `- Name: ${c.name || c.role}\n  Appearance: ${c.appearance || 'Unknown'}`).join('\n');
            characterContext = `\nCASTING INFORMATION:\n${charList}\n`;
        }

        let masterContext = '';
        if (this.data.masterPrompt) {
            masterContext = `\nMASTER PROMPT (Global Style):\n${this.data.masterPrompt}\n`;
        }

        const promptText = `
            You are a professional Cinematic Director and AI Prompt Engineer.
            I have a set of subtitles for a scene in my video.
            Please generate a highly detailed image generation prompt in ENGLISH for this scene.

            ${masterContext}
            ${characterContext}

            SUBTITLES:
            "${subtitleText}"

            RULES:
            1. Respond ONLY with the prompt text. No explanations, no introductory text.
            2. Focus on describing the character's ACTIONS, EXPRESSIONS, AND ENVIRONMENT based on the subtitles.
            3. DO NOT describe the art style, lighting, or camera angles if the MASTER PROMPT already covers it, just focus on the scene contents.
            4. If characters from the CASTING INFORMATION are mentioned or implied, use their names or roles, but do not re-describe their appearance.
            5. The result must be purely in English.
        `;

        try {
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-preview',
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
            });

            if (response && response.text) {
                this.data.prompt = response.text.trim();
                this.toastr.success('AI đã sinh Prompt thành công!');
            } else {
                throw new Error('Empty response');
            }
        } catch (error: any) {
            console.error('Error generating prompt:', error);
            const isOverloaded = error?.message?.includes('503') || error?.status === 503;
            if (isOverloaded) {
                this.toastr.error('Hệ thống AI đang quá tải (503). Vui lòng thử lại sau vài giây.');
            } else {
                this.toastr.error('Lỗi khi sinh Prompt. Vui lòng thử lại.');
            }
        } finally {
            this.isGenerating = false;
        }
    }
}