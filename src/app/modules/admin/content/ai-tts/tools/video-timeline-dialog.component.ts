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

// Interface cho Electron API
interface ElectronAPI {
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
        DragDropModule // Module Kéo thả
    ],
    styles: [`
    /* Tối ưu scrollbar */
    .timeline-container {
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 #f1f5f9;
        scroll-behavior: auto;
    }
    .timeline-container::-webkit-scrollbar {
        height: 6px;
    }
    .timeline-container::-webkit-scrollbar-track {
        background: #f1f5f9;
        border-radius: 3px;
    }
    .timeline-container::-webkit-scrollbar-thumb {
        background-color: #cbd5e1;
        border-radius: 3px;
    }
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }

    /* CSS cho Angular CDK Drag & Drop */
    .cdk-drag-preview {
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        opacity: 0.9;
        cursor: grabbing;
        border-radius: 8px;
    }
    .cdk-drag-placeholder {
        opacity: 0.2;
        background: #e2e8f0;
        border: 2px dashed #cbd5e1;
        border-radius: 8px;
    }
    .cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    .timeline-container.cdk-drop-list-dragging .example-box:not(.cdk-drag-placeholder) {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    .prompt-text {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
  `]
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
        const file: File = event.target.files[0];
        if (file) {
            // Lấy path gốc (chỉ có trong Electron)
            const originalPath: string = (file as any).path;

            if (!originalPath) {
                this.toastr.error('Lỗi: Không lấy được đường dẫn file gốc. App phải chạy trong Electron.');
                return;
            }

            try {
                // Gọi IPC qua bridge
                const electronApi = (window as any).electronAPI as ElectronAPI;
                const localFilePath = await electronApi.selectLocalFile(originalPath);

                // Lưu đường dẫn file:// mới
                scene.imageUrl = localFilePath;
                this.saveData();
                this.toastr.success('Đã áp dụng file cục bộ.');

            } catch (error) {
                console.error('Electron IPC Error:', error);
                this.toastr.error('Có lỗi xảy ra khi copy file.');
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