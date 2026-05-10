import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatIconModule } from '@angular/material/icon';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-character-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatInputModule, TextFieldModule, MatIconModule],
    templateUrl: './character-dialog.component.html'
})
export class CharacterDialogComponent {
    editingChar: any;
    isEditMode: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<CharacterDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService
    ) {
        this.isEditMode = data.index >= 0;
        this.editingChar = data.char ? { ...data.char } : { name: '', variant: '', role: '', appearance: '', personality: '', prompt: '', avatarUrl: null, avatarUrls: [] };
        
        // Backward compatibility: if avatarUrl exists but avatarUrls is empty
        if (this.editingChar.avatarUrl && (!this.editingChar.avatarUrls || this.editingChar.avatarUrls.length === 0)) {
            this.editingChar.avatarUrls = [this.editingChar.avatarUrl];
        } else if (!this.editingChar.avatarUrls) {
            this.editingChar.avatarUrls = [];
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
