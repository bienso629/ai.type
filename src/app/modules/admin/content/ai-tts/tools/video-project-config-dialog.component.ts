import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { CharacterDialogComponent } from './character-dialog.component';
import { DirectorModeComponent } from './director-mode.component';
import { GenaiService } from 'app/genai.service';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';

@Component({
    selector: 'app-video-project-config-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatTooltipModule
    ],
    templateUrl: './video-project-config-dialog.component.html',
})
export class VideoProjectConfigDialogComponent implements OnInit {
    projectData: any;
    isEditingMasterPrompt: boolean = false;
    isGeneratingCharacter: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<VideoProjectConfigDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private _fuseConfirmationService: FuseConfirmationService
    ) {
        this.projectData = this.data?.projectData || {};
        if (!this.projectData.characters) {
            this.projectData.characters = [];
        }
    }

    ngOnInit(): void { }

    close() {
        this.dialogRef.close(this.projectData);
    }

    save() {
        if (this.data.onSave) {
            this.data.onSave(this.projectData);
        }
    }

    toggleEditMasterPrompt() {
        if (this.isEditingMasterPrompt) {
            this.save();
            this.toastr.success('Đã lưu Master Prompt!');
        }
        this.isEditingMasterPrompt = !this.isEditingMasterPrompt;
    }

    openDirectorMode() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '800px',
            maxWidth: '95vw',
            data: {
                projectData: this.projectData
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.projectData = result;
                this.save();
            }
        });
    }

    async generateCharacterAndOpenDialog() {
        this.isGeneratingCharacter = true;
        this.cd.markForCheck();

        try {
            const prompt = `Từ kịch bản gốc và master prompt sau đây, hãy trích xuất hoặc sáng tạo ra MỘT nhân vật chính/quan trọng nhất chưa có trong danh sách dàn cast hiện tại. 
Yêu cầu trả về định dạng JSON thuần túy (không có markdown \`\`\`json) với cấu trúc:
{
    "role": "Vai trò của nhân vật (ví dụ: Chuyên gia CNTT, Khách hàng, Giám đốc...)",
    "name": "Tên nhân vật (nếu có)",
    "appearance": "Mô tả chi tiết về ngoại hình, độ tuổi, trang phục, kiểu tóc...",
    "personality": "Mô tả tính cách, thái độ, biểu cảm..."
}

Master Prompt:
${this.projectData.masterPrompt || 'Không có'}

Danh sách nhân vật hiện tại:
${this.projectData.characters?.map((c: any) => `- ${c.name || c.role}: ${c.appearance}`).join('\n') || 'Chưa có ai'}

Lưu ý: Chỉ trả về object JSON, không kèm thêm bất kỳ text nào khác.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.7,
                }
            });
            const text = response.text;
            if (text) {
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
                if (jsonMatch) {
                    const charData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    this.toastr.success('AI đã trích xuất thành công nhân vật mới!');
                    this.openCharacterDialog(charData);
                    return;
                }
            }
            this.toastr.error('AI không trả về dữ liệu chuẩn, mở form trống...');
            this.openCharacterDialog();
        } catch (error: any) {
            console.error('Error generating character:', error);
            this.toastr.error('Lỗi AI, đang mở form trống...');
            this.openCharacterDialog();
        } finally {
            this.isGeneratingCharacter = false;
            this.cd.markForCheck();
        }
    }

    openCharacterDialog(char: any = null, index: number = -1) {
        const dialogRef = this.dialog.open(CharacterDialogComponent, {
            width: '86vw',
            maxWidth: '95vw',
            height: 'auto',
            maxHeight: '90vh',
            disableClose: true,
            data: {
                char: char,
                index: index,
                masterPrompt: this.projectData?.masterPrompt || '',
                existingCharacters: this.projectData?.characters || []
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                if (!this.projectData) this.projectData = {};
                if (!this.projectData.characters) this.projectData.characters = [];

                if (index >= 0) {
                    const oldChar = this.projectData.characters[index];
                    const oldPrompt = oldChar?.prompt ? oldChar.prompt.trim() : '';
                    const newPrompt = result.prompt ? result.prompt.trim() : '';

                    this.projectData.characters[index] = result;

                    // Tự động tìm và thay thế (Replace) câu prompt cũ bằng câu mới ở tất cả mọi nơi
                    if (oldPrompt && newPrompt && oldPrompt !== newPrompt) {
                        let replacedCount = 0;

                        // 1. Cập nhật Master Prompt
                        if (this.projectData.masterPrompt && this.projectData.masterPrompt.includes(oldPrompt)) {
                            this.projectData.masterPrompt = this.projectData.masterPrompt.split(oldPrompt).join(newPrompt);
                            replacedCount++;
                        }

                        // 2. Cập nhật tất cả các Phân cảnh (Scenes & Videos)
                        if (this.projectData.scenes) {
                            this.projectData.scenes.forEach((scene: any) => {
                                if (scene.prompt && scene.prompt.includes(oldPrompt)) {
                                    scene.prompt = scene.prompt.split(oldPrompt).join(newPrompt);
                                    replacedCount++;
                                }
                                if (scene.videos) {
                                    scene.videos.forEach((video: any) => {
                                        if (video.prompt && video.prompt.includes(oldPrompt)) {
                                            video.prompt = video.prompt.split(oldPrompt).join(newPrompt);
                                            replacedCount++;
                                        }
                                    });
                                }
                            });
                        }

                        if (replacedCount > 0) {
                            this.toastr.info(`Đã tự động cập nhật tạo hình nhân vật này cho ${replacedCount} đoạn Prompt!`);
                        }
                    }

                } else {
                    this.projectData.characters.push(result);
                }

                if (this.data.uuid) {
                    this.multiAccountService.setItem(`casting_list_${this.data.uuid}`, this.projectData.characters);
                }
                this.save();

                this.toastr.success(index >= 0 ? 'Đã cập nhật nhân vật' : 'Đã thêm nhân vật mới');
            }
        });
    }

    duplicateCharacter(char: any) {
        if (!this.projectData) this.projectData = {};
        if (!this.projectData.characters) this.projectData.characters = [];

        const newChar = { ...char };
        newChar.variant = newChar.variant ? `${newChar.variant} (Copy)` : 'Phiên bản mới';

        this.projectData.characters.push(newChar);
        if (this.data.uuid) {
            this.multiAccountService.setItem(`casting_list_${this.data.uuid}`, this.projectData.characters);
        }
        this.save();

        this.toastr.success(`Đã nhân bản nhân vật: ${char.name || char.role}`);
    }

    removeCharacter(index: number) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa nhân vật',
            message: 'Bạn có chắc chắn muốn xóa nhân vật này? Các prompt có sử dụng mô tả của nhân vật này sẽ không tự động bị xóa.',
            icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Xóa', color: 'warn' },
                cancel: { show: true, label: 'Hủy' }
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result === 'confirmed') {
                this.projectData.characters.splice(index, 1);
                if (this.data.uuid) {
                    this.multiAccountService.setItem(`casting_list_${this.data.uuid}`, this.projectData.characters);
                }
                this.save();
                this.toastr.warning('Đã xóa nhân vật');
            }
        });
    }
}
