import {
    Component,
    OnInit,
    ViewChild,
    ElementRef,
    Inject,
} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialog,
    MatDialogModule,
} from '@angular/material/dialog';
import { CommonModule } from '@angular/common'; 
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
    DragDropModule,
    CdkDragDrop,
    moveItemInArray,
} from '@angular/cdk/drag-drop';

import { AddSceneComponent } from './add-scene.component';
import { MatInputModule } from '@angular/material/input';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { VideoGenerationComponent } from './video-generation.component';
import { Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

interface electron {
    selectLocalFile: (filePath: string) => Promise<string>;
}

@Component({
    selector: 'app-video-timeline-dialog',
    standalone: true,
    templateUrl: 'video-timeline-dialog.component.html',
    imports: [
        CommonModule, 
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule, 
        DragDropModule, 
    ]
})
export class VideoTimelineDialogComponent implements OnInit {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';
    private readonly STORAGE_AUDIO_KEY = 'ai_type_audio_merger_data';

    @ViewChild('scrollContainer') scrollContainer!: ElementRef;

    projectData: any;

    private isMouseDown = false;
    private startX = 0;
    private scrollLeftStart = 0;

    startDragging(e: MouseEvent) {
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

    onSceneDropped(event: CdkDragDrop<any[]>) {
        if (event.previousIndex === event.currentIndex) {
            return;
        }
        moveItemInArray(
            this.projectData.scenes,
            event.previousIndex,
            event.currentIndex,
        );
        this.saveData();
        console.log('New scene order saved.');
    }

    getGlobalIndex(sceneIdx: number, subIdx: number): number {
        if (!this.projectData || !this.projectData.scenes) return 0;
        let total = 0;
        for (let i = 0; i < sceneIdx; i++) {
            total += this.projectData.scenes[i].subtitles?.length || 0;
        }
        return total + subIdx + 1;
    }

    async onAudioFileSelected(event: any, sub: any) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const electron = (window as any).electron;
            const originalPath = electron.getPathForFile(file);
            const localPath = await electron.selectLocalFile(originalPath);
            sub.audioUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
            this.saveData(); 
            this.toastr.success('Đã cập nhật Audio!');
        } catch (e) {
            this.toastr.error('Lỗi: ' + e);
        }
    }

    removeAudio(sub: any) {
        if (sub.audioUrl) {
            delete sub.audioUrl;
            this.saveData();
            this.toastr.info('Đã xóa liên kết âm thanh câu thoại.');
        }
    }

    // --- Logic Sửa Subtitle Inline ---
    enableEditSub(sub: any) {
        sub.isEditing = true;
        sub.tempText = sub.text;
    }

    saveEditSub(scene: any, sub: any) {
        const newText = sub.tempText ? sub.tempText.trim() : '';

        // NẾU NGƯỜI DÙNG ĐỂ TRỐNG: Xóa subtitle này khỏi scene
        if (newText === '') {
            const index = scene.subtitles.indexOf(sub);
            if (index !== -1) {
                scene.subtitles.splice(index, 1); 
                this.toastr.warning('Đã xóa câu thoại do nội dung bị bỏ trống.');
                this.saveData(); 
            }
            return; 
        }

        // NẾU CÓ NỘI DUNG: Lưu bình thường
        sub.text = newText;
        sub.isEditing = false;
        
        if (sub.audioUrl && sub.text !== sub.tempText) {
            this.toastr.info('Bạn vừa sửa lời thoại. Hãy cẩn thận vì file âm thanh cũ có thể không còn khớp nữa nhé!', 'Lưu ý');
        } else {
            this.toastr.success('Đã cập nhật câu thoại!');
        }

        this.saveData();
    }

    cancelEditSub(sub: any) {
        sub.isEditing = false;
        delete sub.tempText; 
    }
    // ---------------------------------

    async generateImage(scene: any, index: number) {
        this.clipboard.copy(scene.prompt);
        this.toastr.info(`Đã copy prompt cho Scene #${index + 1}...`);
    }

    generateAllImages(): void {
        this.saveData();

        if (
            !this.projectData ||
            !this.projectData.scenes ||
            this.projectData.scenes.length === 0
        ) {
            this.toastr.warning('Không có cảnh nào để tạo audio!');
            return;
        }

        this.projectData['username'] = this.data.username || 'anonymous'; 

        this.alert({
            title: 'Khởi tạo Audio thành công!',
            message: `Hệ thống đã hoàn tất tạo âm thanh cho toàn bộ Video Timeline. <span class="font-medium text-blue-600">Bạn có muốn tiếp tục render Video không?</span>`,
            confirm: 'Tiếp tục Production',
            cb: () => {
                this.dialogRef.close(this.projectData);
                this.router.navigate(['/livestream', this.projectData.uuid || 'unknown_project']);
            },
            cc: () => {
                this.toastr.info('Hủy tiến trình tạo Audio.');
            },
        });
    }

    prepareForVideoGeneration() {
        const processDialogRef = this.dialog.open(VideoGenerationComponent, {
            width: '550px',
            disableClose: true, 
            data: this.projectData, 
        });

        processDialogRef.afterClosed().subscribe((updatedProjectData) => {
            if (updatedProjectData) {
                this.projectData = updatedProjectData;
                this.saveData();
            } else {
                this.toastr.info('Hủy tiến trình tạo Audio.');
            }
        });
    }

    saveData() {
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.multiAccountService.setItem(storageKey, this.projectData);
    }

    close() {
        this.dialogRef.close();
    }

    async onFileSelected(event: any, scene: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];

            try {
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình.');
                    return;
                }

                const originalPath = electron.getPathForFile(file);

                if (!originalPath) {
                    this.toastr.error(
                        'Không thể xác định đường dẫn file trên ổ đĩa.',
                    );
                    return;
                }

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

    isImageType(url: string): boolean {
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        ];
        const cleanUrl = url.replace('file://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    addNewScene() {
        const dialogRef = this.dialog.open(AddSceneComponent, {
            width: '550px',
            disableClose: true, 
            data: { subtitles: '', prompt: '' }, 
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.subtitles && result.prompt) {
                const subtitleTexts = result.subtitles
                    .split('\n')
                    .filter((s: string) => s.trim() !== '');
                const formattedSubtitles = subtitleTexts.map(
                    (text: string, index: number) => ({
                        id: index + 1, 
                        text: text.trim(),
                    }),
                );

                const newScene = {
                    id: `manual_${Date.now()}`, 
                    subtitles: formattedSubtitles,
                    prompt: result.prompt.trim(),
                    imageUrl: null, 
                };

                if (!this.projectData) this.projectData = { scenes: [] };
                if (!this.projectData.scenes) this.projectData.scenes = [];

                this.projectData.scenes.push(newScene);

                this.saveData();
                this.toastr.success('Đã thêm Scene mới thành công!');

                setTimeout(() => {
                    this.scrollContainer.nativeElement.scrollLeft =
                        this.scrollContainer.nativeElement.scrollWidth;
                }, 100);
            }
        });
    }

    removeScene(index: number) {
        this.alert({
            title: 'Nhắc nhở',
            message: `Bạn có chắc chắn muốn xóa Scene #${index + 1} không?`,
            confirm: 'Xóa liền',
            cb: () => {
                this.projectData.scenes.splice(index, 1);
                this.saveData();
                this.toastr.warning(`Đã xóa Scene #${index + 1}`);
            },
        });
    }

    constructor(
        public dialogRef: MatDialogRef<VideoTimelineDialogComponent>,
        private clipboard: Clipboard,
        private multiAccountService: MultiAccountService,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private dialog: MatDialog, 
    ) { }

    ngOnInit() {
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.projectData = this.multiAccountService.getItem(storageKey);
    }

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: alert ? alert.title : 'Hoàn tất!',
            message: alert
                ? alert.message
                : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu. <span class="font-medium">Hãy tiếp tục với một URL mới luôn nào!</span>',
            icon: { show: true, name: 'feather:check', color: 'primary' },
            actions: {
                confirm: { show: true, label: alert ? alert.confirm : 'Khởi động lại', color: 'primary' },
                cancel: { show: true, label: alert ? alert.cancel : 'Đóng cửa sổ' },
            },
            dismissible: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (alert.cb) alert.cb();
            } else {
                if (alert.cc) alert.cc();
            }
        });
    }
}