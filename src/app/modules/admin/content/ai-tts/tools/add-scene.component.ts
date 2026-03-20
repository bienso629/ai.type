import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

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
        MatIconModule
    ],
    template: `
    <div class="min-w-[480px] bg-white rounded-lg">
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center text-xl font-semibold text-primary">
                <mat-icon class="mr-2 text-primary">add_to_photos</mat-icon>
                Thêm Scene mới thủ công
            </div>
        </div>
        
        <div class="flex flex-col gap-5 pt-4">
            <mat-form-field appearance="outline" class="w-full">
                <mat-label>Subtitles (Mỗi câu thoại một dòng)</mat-label>
                <textarea matInput [(ngModel)]="data.subtitles" rows="6" required 
                    placeholder="Ví dụ:&#10;Bloom bước ra khỏi nhà.&#10;Ông nhìn lên bầu trời Dublin."></textarea>
                <mat-hint>Hệ thống sẽ tự động tách từng dòng thành các câu thoại riêng biệt.</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
                <mat-label>Prompt (Mô tả hình ảnh bằng tiếng Anh)</mat-label>
                <textarea matInput [(ngModel)]="data.prompt" rows="4" required 
                    placeholder="Ví dụ: Cinematic shot of a man in 1904 Dublin attire..."></textarea>
                <mat-hint>Mô tả càng chi tiết, AI tạo ảnh càng đẹp.</mat-hint>
            </mat-form-field>
        </div>
        
        <div mat-dialog-actions class="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
            <button mat-stroked-button color="basic" (click)="onCancel()">Hủy bỏ</button>
            <button mat-flat-button color="primary" 
                    [mat-dialog-close]="data" 
                    [disabled]="!data.subtitles?.trim() || !data.prompt?.trim()">
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
    constructor(
        public dialogRef: MatDialogRef<AddSceneComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { subtitles: string, prompt: string }
    ) {
        // Đảm bảo data không bị undefined
        if (!this.data) {
            this.data = { subtitles: '', prompt: '' };
        }
    }

    onCancel(): void {
        this.dialogRef.close();
    }
}