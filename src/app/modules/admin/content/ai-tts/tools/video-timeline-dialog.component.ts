import { Component, OnInit, ViewChild, ElementRef, Inject, Component as NgComponent, Inject as NgInject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common'; // Cần cho *ngIf, *ngFor cũ (trong isImageType)
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

// Angular Material & CDK Imports
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

import { AddSceneComponent } from './add-scene.component';
import { MatInputModule } from '@angular/material/input';

// Interface cho Electron API
interface electron {
    selectLocalFile: (filePath: string) => Promise<string>;
}

// --- COMPONENT CHÍNH: Standalone ---
@Component({
    selector: 'app-video-timeline-dialog',
    standalone: true,
    templateUrl: 'video-timeline-dialog.component.html',
    imports: [
        CommonModule, // Cần CommonModule cho các directive cơ bản
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule, // Cần MatLabelModule cho mat-label
        DragDropModule // Module Kéo thả
    ]
})
export class VideoTimelineDialogComponent implements OnInit {
    @ViewChild('scrollContainer') scrollContainer!: ElementRef;

    projectData: any;

    // Các biến phục vụ kéo thả bằng chuột (manual scroll ngang)
    private isMouseDown = false;
    private startX = 0;
    private scrollLeftStart = 0;

    constructor(
        public dialogRef: MatDialogRef<VideoTimelineDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private dialog: MatDialog // Cần MatDialog để mở form thêm cảnh
    ) {
    }

    ngOnInit() {
        // Load dữ liệu từ LocalStorage
        const raw = localStorage.getItem('ai_type_video_ready_data');
        if (raw) {
            this.projectData = JSON.parse(raw);
        }
    }

    // --- Logic Kéo thả bằng chuột (Manual Scroll Ngang) ---
    startDragging(e: MouseEvent) {
        // Chỉ scroll nếu không phải đang cầm vào handle kéo thả cảnh
        if ((e.target as HTMLElement).closest('.cdk-drag-handle')) return;

        this.isMouseDown = true;
        this.startX = e.pageX - this.scrollContainer.nativeElement.offsetLeft;
        this.scrollLeftStart = this.scrollContainer.nativeElement.scrollLeft;
    }

    stopDragging() {
        this.isMouseDown = false;
    }

    moveEvent(e: MouseEvent) {
        if (!this.isMouseDown) return;
        e.preventDefault();
        const x = e.pageX - this.scrollContainer.nativeElement.offsetLeft;
        const walk = (x - this.startX) * 1.5;
        this.scrollContainer.nativeElement.scrollLeft = this.scrollLeftStart - walk;
    }
    // ---------------------

    // --- Logic CDk Drag & Drop (Sắp xếp lại thứ tự Scene) ---
    onSceneDropped(event: CdkDragDrop<any[]>) {
        if (event.previousIndex === event.currentIndex) {
            return;
        }
        // Di chuyển phần tử trong mảng dữ liệu (Hàm của CDK)
        moveItemInArray(this.projectData.scenes, event.previousIndex, event.currentIndex);
        // Lưu lại dữ liệu mới
        this.saveData();
        console.log("New scene order saved.");
    }
    // ------------------------------------------------

    async generateImage(scene: any, index: number) {
        this.toastr.info(`Generating image for Scene #${index + 1}...`);
        // Giả lập
        scene.imageUrl = 'https://via.placeholder.com/400x225?text=Generating...';
        this.saveData();
    }

    generateAllImages() {
        if (!this.projectData?.scenes?.length) return;
        this.toastr.warning(`Bắt đầu tạo ${this.projectData.scenes.length} hình ảnh tự động...`);
    }

    saveData() {
        localStorage.setItem('ai_type_video_ready_data', JSON.stringify(this.projectData));
    }

    close() { this.dialogRef.close(); }

    // Xử lý file cục bộ thông qua Electron File System
    async onFileSelected(event: any, scene: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];

            try {
                const electron = (window as any).electron;

                // 1. Kiểm tra xem bridge có tồn tại không
                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình.');
                    return;
                }

                // 2. Lấy đường dẫn thật qua webUtils (đã được expose qua bridge)
                const originalPath = electron.getPathForFile(file);

                if (!originalPath) {
                    this.toastr.error('Không thể xác định đường dẫn file trên ổ đĩa.');
                    return;
                }

                // 3. Gọi hàm copy file vào thư mục app (IPC đã viết ở main.js)
                const localFilePath = await electron.selectLocalFile(originalPath);

                scene.imageUrl = localFilePath;
                this.saveData();
                this.toastr.success('Đã tải file thành công!');

            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    // Kiểm tra loại file để hiển thị img hoặc video
    isImageType(url: string): boolean {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        const cleanUrl = url.replace('file://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    // --- Logic NÚT MỚI: Thêm Scene mới ---
    addNewScene() {
        // Mở một Dialog con làm form nhập liệu
        const dialogRef = this.dialog.open(AddSceneComponent, {
            width: '550px',
            disableClose: true, // Buộc dùng nút Hủy/Thêm
            data: { subtitles: '', prompt: '' } // Khởi tạo data trống
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result && result.subtitles && result.prompt) {
                // 'result' chứa data người dùng nhập

                // 1. Chuyển đổi subtitles (chuỗi xuống dòng) thành mảng {id, text}
                const subtitleTexts = result.subtitles.split('\n').filter((s: string) => s.trim() !== '');
                const formattedSubtitles = subtitleTexts.map((text: string, index: number) => ({
                    id: index + 1, // Tạm thời dùng index làm ID
                    text: text.trim()
                }));

                // 2. Tạo đối tượng Scene mới
                const newScene = {
                    id: `manual_${Date.now()}`, // Tạo ID duy nhất
                    subtitles: formattedSubtitles,
                    prompt: result.prompt.trim(),
                    imageUrl: null // Cảnh mới chưa có ảnh/video
                };

                // 3. Thêm cảnh mới vào cuối mảng scenes
                if (!this.projectData) this.projectData = { scenes: [] };
                if (!this.projectData.scenes) this.projectData.scenes = [];

                this.projectData.scenes.push(newScene);

                // 4. Lưu dữ liệu
                this.saveData();
                this.toastr.success('Đã thêm Scene mới thành công!');

                // Tùy chọn: Tự động scroll về cuối timeline
                setTimeout(() => {
                    this.scrollContainer.nativeElement.scrollLeft = this.scrollContainer.nativeElement.scrollWidth;
                }, 100);
            }
        });
    }
}