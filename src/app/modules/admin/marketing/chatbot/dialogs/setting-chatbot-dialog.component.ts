import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TaskProgressService } from 'app/layout/common/task-progress/task-progress.service';

@Component({
    selector: 'app-setting-chatbot-dialog',
    templateUrl: './setting-chatbot-dialog.component.html'
})
export class SettingChatbotDialogComponent {
    selectedDataSource: 'documents' | 'website' | 'all' = 'documents';
    docTypes: any[] = [];
    selectedDocTypes: string[] = [];
    domainOptions: any[] = [];
    selectedSettingsDomains: string[] = [];
    customPrompt: string = '';
    isMinerUEnabled: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<SettingChatbotDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private taskProgress: TaskProgressService
    ) {
        this.selectedDataSource = data.selectedDataSource || 'documents';
        this.docTypes = data.docTypes || [];
        this.selectedDocTypes = [...(data.selectedDocTypes || [])];
        this.domainOptions = data.domainOptions || [];
        this.selectedSettingsDomains = [...(data.selectedSettingsDomains || [])];
        this.customPrompt = data.customPrompt || '';
        
        // Đọc trạng thái từ localStorage
        this.isMinerUEnabled = localStorage.getItem('isMinerUEnabled') === 'true';
    }

    toggleDocType(value: string) {
        const index = this.selectedDocTypes.indexOf(value);
        if (index > -1) {
            this.selectedDocTypes.splice(index, 1);
        } else {
            this.selectedDocTypes.push(value);
        }
    }

    toggleSettingsDomain(domain: string) {
        const index = this.selectedSettingsDomains.indexOf(domain);
        if (index > -1) {
            this.selectedSettingsDomains.splice(index, 1);
        } else {
            this.selectedSettingsDomains.push(domain);
        }
    }

    async toggleMinerU(event: any) {
        if (event.checked) {
            // Tạm thời giữ công tắc ở trạng thái TẮT cho đến khi tải xong
            event.source.checked = false;
            this.isMinerUEnabled = false;

            const electron = (window as any).electron;
            if (!electron) return;

            try {
                // Kiểm tra trước xem model đã có chưa
                const isExist = await electron.invoke('check-mineru-model');
                
                if (isExist) {
                    // Đã có model -> Bật luôn không cần hiển thị popup rườm rà
                    this.isMinerUEnabled = true;
                    event.source.checked = true;
                    localStorage.setItem('isMinerUEnabled', 'true');
                    return;
                }

                // Nếu chưa có, bắt đầu hiển thị giao diện tải về
                this.taskProgress.show('Đang chuẩn bị mô hình AI', 'Đang tải dữ liệu...');
                
                // Đăng ký nhận luồng dữ liệu tiến trình download từ Electron
                const cleanup = electron.onPdfProgress((data: string) => {
                    this.taskProgress.updateMessage(data);
                });

                // Gọi Electron để download & extract model
                await electron.invoke('setup-mineru-model');
                this.taskProgress.done('Cài đặt mô hình AI hoàn tất!');
                
                // Tải thành công -> BẬT công tắc
                this.isMinerUEnabled = true;
                event.source.checked = true;
                localStorage.setItem('isMinerUEnabled', 'true');
                
                cleanup();
            } catch (error: any) {
                console.error("Lỗi cài đặt AI:", error);
                this.taskProgress.error('Có lỗi xảy ra: ' + (error?.message || error));
                
                // Giữ nguyên trạng thái TẮT
                this.isMinerUEnabled = false;
                event.source.checked = false;
                localStorage.setItem('isMinerUEnabled', 'false');
            }
        } else {
            // User chủ động tắt
            this.isMinerUEnabled = false;
            localStorage.setItem('isMinerUEnabled', 'false');
        }
    }

    onClose(): void {
        this.dialogRef.close();
    }

    onConfirm(): void {
        this.dialogRef.close({
            selectedDataSource: this.selectedDataSource,
            selectedDocTypes: this.selectedDocTypes,
            selectedSettingsDomains: this.selectedSettingsDomains,
            customPrompt: this.customPrompt
        });
    }
}
