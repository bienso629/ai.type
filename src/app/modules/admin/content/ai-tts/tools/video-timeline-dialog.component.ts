import {
    Component,
    OnInit,
    ViewChild,
    ElementRef,
    Inject,
    CUSTOM_ELEMENTS_SCHEMA,
    ChangeDetectorRef,
    HostListener,
    OnDestroy,
    TemplateRef
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
import { DirectorModeComponent } from './director-mode.component';
import { MatInputModule } from '@angular/material/input';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { EditScenePromptDialogComponent } from './edit-scene-prompt-dialog.component';
import { GenaiService } from 'app/genai.service';
import { VideoProjectConfigDialogComponent } from './video-project-config-dialog.component';

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
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class VideoTimelineDialogComponent implements OnInit, OnDestroy {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';

    // [THÊM BIẾN NÀY] Trạng thái hiển thị Master Prompt
    showMasterPrompt: boolean = true;
    isGeneratingCharacter: boolean = false;

    // Lưu lại Scene hiện tại đang được xử lý (khi bấm Prompt)
    activeDownloadScene: any = null;

    isEditingMasterPrompt: boolean = false;

    allClips: any[] = []; // Chứa danh sách tất cả các câu thoại có trong project

    linkingSourceVideo: any = null;
    linkingSourceSceneIndex: number = -1;
    linkingSourceVideoIndex: number = -1;

    // --- Drag to Link logic ---
    isDraggingLink: boolean = false;
    currentMouseX: number = 0;
    currentMouseY: number = 0;

    onDragLinkStart(e: MouseEvent, video: any, sceneIdx: number, vIdx: number) {
        e.stopPropagation();
        e.preventDefault();

        this.linkingSourceVideo = video;
        this.linkingSourceSceneIndex = sceneIdx;
        this.linkingSourceVideoIndex = vIdx;
        this.isDraggingLink = true;

        this.currentMouseX = e.clientX;
        this.currentMouseY = e.clientY;

        document.addEventListener('mousemove', this.onDragLinkMove);
        document.addEventListener('mouseup', this.onDragLinkEnd);

        this.updateLines();
    }

    onDragLinkMove = (e: MouseEvent) => {
        if (!this.isDraggingLink) return;
        this.currentMouseX = e.clientX;
        this.currentMouseY = e.clientY;
        this.updateLines();
    }

    onDragLinkEnd = (e: MouseEvent) => {
        document.removeEventListener('mousemove', this.onDragLinkMove);
        document.removeEventListener('mouseup', this.onDragLinkEnd);

        if (!this.isDraggingLink) return;
        this.isDraggingLink = false;

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        if (dropTarget) {
            const videoWrapper = dropTarget.closest('[data-scene-idx]');
            if (videoWrapper) {
                const targetSceneIdx = parseInt(videoWrapper.getAttribute('data-scene-idx') || '-1', 10);
                const targetVIdx = parseInt(videoWrapper.getAttribute('data-v-idx') || '-1', 10);

                if (targetSceneIdx !== -1 && targetVIdx !== -1) {
                    const targetVideo = this.projectData?.scenes?.[targetSceneIdx]?.videos?.[targetVIdx];
                    if (targetVideo) {
                        this.completeLinking(targetVideo, targetSceneIdx, targetVIdx);
                        this.updateLines();
                        return;
                    }
                }
            }
        }

        // Hủy nếu không thả vào vùng video hợp lệ
        this.cancelLinking();
        this.updateLines();
    }
    // ----------------------------

    cancelLinking() {
        this.linkingSourceVideo = null;
        this.linkingSourceSceneIndex = -1;
        this.linkingSourceVideoIndex = -1;
    }

    completeLinking(targetVideo: any, targetSceneIdx: number, targetVIdx: number) {
        if (!this.linkingSourceVideo) return;

        if (this.linkingSourceVideo === targetVideo) {
            this.toastr.warning('Không thể liên kết với chính nó.');
            this.cancelLinking();
            return;
        }

        this.linkingSourceVideo.linkedTo = {
            sceneIndex: targetSceneIdx,
            videoIndex: targetVIdx,
            text: `Scene ${targetSceneIdx + 1} - Phần ${targetVIdx + 1}`
        };

        this.saveData();
        this.toastr.success(`Đã tạo liên kết thành công!`);
        this.cancelLinking();
    }

    removeLink(video: any) {
        video.linkedTo = null;
        this.saveData();
    }

    scrollToLinkedVideo(linkedTo: any) {
        if (!linkedTo) return;
        const targetId = `video_${linkedTo.sceneIndex}_${linkedTo.videoIndex}`;
        const element = document.getElementById(targetId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            element.classList.add('ring-4', 'ring-indigo-500');
            setTimeout(() => {
                element.classList.remove('ring-4', 'ring-indigo-500');
            }, 1500);
        } else {
            this.toastr.warning('Không tìm thấy Video đích. Có thể nó đã bị xoá hoặc ẩn.');
        }
    }

    hasIncomingLink(sceneIdx: number, vIdx: number): boolean {
        if (!this.projectData || !this.projectData.scenes) return false;
        for (const scene of this.projectData.scenes) {
            if (!scene.videos) continue;
            for (const video of scene.videos) {
                if (video.linkedTo && video.linkedTo.sceneIndex === sceneIdx && video.linkedTo.videoIndex === vIdx) {
                    return true;
                }
            }
        }
        return false;
    }

    @HostListener('document:keydown.escape', ['$event'])
    onKeydownHandler(event: KeyboardEvent) {
        if (this.linkingSourceVideo) {
            this.cancelLinking();
            this.toastr.info('Đã hủy tạo liên kết.');
        }
    }

    svgLines: { path: string, color: string }[] = [];
    private lastLinesStr = '';
    private animationFrameId: any;

    updateLines() {
        if (!this.projectData || !this.projectData.scenes) {
            this.svgLines = [];
            return;
        }

        const newLines: any[] = [];
        const svgContainer = this.svgLayer?.nativeElement;
        if (!svgContainer) return;

        const containerRect = svgContainer.getBoundingClientRect();

        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (!scene.videos) continue;

            for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                const video = scene.videos[vIdx];
                if (video.linkedTo) {
                    const sourceId = `video_${sIdx}_${vIdx}`;
                    const targetId = `video_${video.linkedTo.sceneIndex}_${video.linkedTo.videoIndex}`;

                    const sourceEl = document.getElementById(sourceId);
                    const targetEl = document.getElementById(targetId);

                    if (sourceEl && targetEl) {
                        const sourceRect = sourceEl.getBoundingClientRect();
                        const targetRect = targetEl.getBoundingClientRect();

                        // Điểm bắt đầu (cạnh ngoài của node phải)
                        const startX = sourceRect.right - containerRect.left + 12;
                        const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top;

                        // Điểm kết thúc (cạnh ngoài của node trái)
                        const endX = targetRect.left - containerRect.left - 12;
                        const endY = targetRect.top + targetRect.height / 2 - containerRect.top;

                        // Tính control points cho đường cong Bezier
                        const distanceX = Math.max(100, Math.abs(endX - startX) * 0.5);

                        // Đường cong M startX startY C cp1X cp1Y, cp2X cp2Y, endX endY
                        const path = `M ${startX} ${startY} C ${startX + distanceX} ${startY}, ${endX - distanceX} ${endY}, ${endX} ${endY}`;

                        // Nếu nối ngược về bên trái thì hiện màu đỏ cảnh báo, bình thường màu indigo
                        const isBackwards = endX < startX;
                        const color = isBackwards ? 'rgba(239, 68, 68, 0.7)' : 'rgba(99, 102, 241, 0.7)';

                        newLines.push({ path, color });
                    }
                }
            }
        }

        // --- Dragging line ---
        if (this.isDraggingLink && this.linkingSourceVideo) {
            const sourceId = `video_${this.linkingSourceSceneIndex}_${this.linkingSourceVideoIndex}`;
            const sourceEl = document.getElementById(sourceId);
            if (sourceEl) {
                const sourceRect = sourceEl.getBoundingClientRect();

                // Điểm bắt đầu (cạnh ngoài của node phải)
                const startX = sourceRect.right - containerRect.left + 12;
                const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top;

                // Điểm kết thúc là tọa độ chuột hiện tại
                const endX = this.currentMouseX - containerRect.left;
                const endY = this.currentMouseY - containerRect.top;

                const distanceX = Math.max(100, Math.abs(endX - startX) * 0.5);
                const path = `M ${startX} ${startY} C ${startX + distanceX} ${startY}, ${endX - distanceX} ${endY}, ${endX} ${endY}`;

                // Hiển thị đường màu cam nét đứt hoặc màu cam đậm
                newLines.push({ path, color: 'rgba(249, 115, 22, 0.9)' });
            }
        }

        const newLinesStr = JSON.stringify(newLines);
        if (newLinesStr !== this.lastLinesStr) {
            this.svgLines = newLines;
            this.lastLinesStr = newLinesStr;
            this.cd.detectChanges();
        }
    }

    @ViewChild('scrollContainer') scrollContainer!: ElementRef;
    @ViewChild('svgLayer') svgLayer!: ElementRef;
    openConfigDialog() {
        const dialogRef = this.dialog.open(VideoProjectConfigDialogComponent, {
            width: '800px',
            maxWidth: '95vw',
            autoFocus: false,
            data: {
                projectData: this.projectData,
                uuid: this.data?.uuid,
                username: this.data?.username || 'anonymous',
                onSave: (newData: any) => {
                    this.projectData = newData;
                    this.saveData();
                }
            }
        });
        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.projectData = result;
                this.saveData();
                this.cd.detectChanges();
            }
        });
    }

    projectData: any;

    editingScenePrompt: any = null;
    editingSceneIndex: number = -1;

    @ViewChild('characterDialogTemplate') characterDialogTemplate!: any;
    editingChar: any = {};
    editingCharIndex: number = -1;
    private characterDialogRef: any = null;
    private editSceneDialogRef: any = null;

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

    onWheelScroll(event: WheelEvent) {
        if (event.deltaY !== 0 && !event.shiftKey) {
            event.preventDefault();
            this.scrollContainer.nativeElement.scrollLeft += event.deltaY;
        } else if (event.deltaX !== 0) {
            event.preventDefault();
            this.scrollContainer.nativeElement.scrollLeft += event.deltaX;
        }
    }

    moveEvent(e: MouseEvent) {
        if (!this.isMouseDown) return;
        e.preventDefault();
        const x = e.pageX - this.scrollContainer.nativeElement.offsetLeft;
        const walk = (x - this.startX) * 1.5;
        this.scrollContainer.nativeElement.scrollLeft = this.scrollLeftStart - walk;
    }

    onSceneDropped(event: CdkDragDrop<any[]>) {
        if (!this.projectData || !this.projectData.scenes) return;
        moveItemInArray(this.projectData.scenes, event.previousIndex, event.currentIndex);
        this.saveData();
        this.toastr.success('Đã thay đổi vị trí Scene');
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

            // ---> THÊM ĐOẠN NÀY: Lấy thời lượng thực tế của Audio
            const audioObj = new Audio(sub.audioUrl);
            audioObj.addEventListener('loadedmetadata', () => {
                sub.duration = audioObj.duration; // Lưu số giây thực tế vào sub
                this.saveData(); // Cập nhật lại data sau khi đã lấy được duration
            });
            // <--- KẾT THÚC ĐOẠN THÊM

            this.saveData();
            this.toastr.success('Đã cập nhật Audio!');
        } catch (e) {
            this.toastr.error('Lỗi: ' + e);
        }
    }

    removeAudio(sub: any) {
        if (sub.audioUrl) {
            delete sub.audioUrl;
            delete sub.duration; // Thêm dòng này để xóa thời lượng thực tế cũ

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

    async generateImage(scene: any, video: any, index: number) {
        // Lấy Master Prompt từ dữ liệu tổng của Project
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";

        // Tự động nối Master Prompt vào Scene Prompt để copy
        const scenePrompt = video.prompt || scene.prompt;
        const finalPrompt = master ? `${master}\n\n${scenePrompt}` : scenePrompt;

        // Copy vào Clipboard
        this.clipboard.copy(finalPrompt);
        this.toastr.info(`Đã copy Master Prompt + Scene #${index + 1} vào khay nhớ tạm!`, 'Thành công');

        // 4. Lưu lại scene để nếu có ảnh download về thì tự động gán vào
        this.activeDownloadScene = video;
    }

    copyCharacterPrompt(char: any) {
        if (!char.prompt) {
            this.toastr.warning('Nhân vật này chưa có câu prompt tạo hình.');
            return;
        }

        // Nối Master Prompt vào để nhân vật cũng giữ đúng phong cách (VD: hoạt hình 3D)
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
        const finalPrompt = master ? `${master}\n\n${char.prompt}` : char.prompt;

        this.clipboard.copy(finalPrompt);
        this.toastr.success(`Đã copy Master Prompt + Nhân vật: ${char.name || char.role}`, 'Thành công');
    }

    addCharacterToMasterPrompt(char: any) {
        if (!char.prompt) {
            this.toastr.warning('Nhân vật này chưa có câu prompt tạo hình.');
            return;
        }

        if (!this.projectData) this.projectData = {};
        const currentPrompt = this.projectData.masterPrompt ? this.projectData.masterPrompt.trim() : '';

        if (currentPrompt) {
            if (currentPrompt.includes(char.prompt)) {
                this.toastr.info('Nhân vật này đã có trong Master Prompt rồi.');
                return;
            }
            this.projectData.masterPrompt = currentPrompt + (currentPrompt.endsWith(',') || currentPrompt.endsWith('.') ? ' ' : '. ') + char.prompt;
        } else {
            this.projectData.masterPrompt = char.prompt;
        }

        this.saveData();
        this.toastr.success(`Đã thêm tạo hình "${char.name || char.role}" vào Master Prompt!`);
    }

    openEditScenePromptDialog(scene: any, video: any, index: number) {
        const dialogRef = this.dialog.open(EditScenePromptDialogComponent, {
            width: '86vw',
            maxWidth: '95vw',
            maxHeight: '95vh',
            disableClose: true,
            data: {
                scene: video,
                index: index,
                characters: this.projectData?.characters || [],
                masterPrompt: this.projectData?.masterPrompt || '',
                projectAspectRatio: this.projectData?.aspectRatio || '16:9'
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                if (!this.projectData || !this.projectData.scenes) return;
                if (index >= 0 && index < this.projectData.scenes.length) {
                    video.prompt = result.prompt;
                    video.imageUrl = result.imageUrl;
                    if (result.imagePrompt !== undefined) video.imagePrompt = result.imagePrompt;
                    if (result.videoUrl !== undefined) video.videoUrl = result.videoUrl;
                    if (result.aspectRatio !== undefined) video.aspectRatio = result.aspectRatio;
                    if (result.duration !== undefined) video.duration = result.duration;
                    this.saveData();
                    this.cd.detectChanges();
                    this.toastr.success('Đã lưu Prompt phân cảnh!');
                }
            }
        });
    }

    toggleVideoCompleted(video: any) {
        video.isCompleted = !video.isCompleted;
        this.saveData();
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

    async prepareForVideoGeneration(silent: boolean = false) {
        if (!this.projectData || !this.projectData.scenes) {
            if (!silent) this.toastr.warning('Không có dữ liệu để rà soát!');
            return;
        }

        if (!silent) this.toastr.info('Đang rà soát và cập nhật thời lượng các file audio...', 'Hệ thống');

        if (!(window as any).electron) {
            this.toastr.warning('Tính năng scan file chỉ hoạt động trên App Desktop.');
        }

        const projectSubPath = `${this.data.username || 'anonymous'}/${this.data.uuid || 'default'}`;
        const promises: Promise<void>[] = [];
        let updatedCount = 0;

        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (!scene.subtitles) continue;

            for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                const sub = scene.subtitles[subIdx];

                // Nếu chưa có audioUrl, thử tìm kiếm dưới local
                if (!sub.audioUrl && sub.text && sub.text.trim() !== '' && (window as any).electron) {
                    const globalIndex = this.getGlobalIndex(sceneIdx, subIdx);
                    const prefix = globalIndex.toString().padStart(3, '0');
                    const shortText = sub.text.substring(0, 50);
                    const slug = this.toSlug(shortText);

                    const possibleFilenames = [
                        `${prefix}_${slug}.mp3`,
                        `${prefix}_${slug}.wav`,
                        `${prefix}_${slug}_ausync.mp3`,
                        `${prefix}_${slug}_ausync.wav`
                    ];

                    for (const fname of possibleFilenames) {
                        try {
                            const payload = {
                                username: projectSubPath,
                                filename: fname
                            };
                            const result = await (window as any).electron.invoke('check-local-file-exists', payload);

                            if (result && result.exists) {
                                sub.audioUrl = result.path.startsWith('file://') ? result.path : `file://${result.path}`;
                                break;
                            }
                        } catch (e) { }
                    }
                }

                if (sub.audioUrl) {
                    const p = new Promise<void>((resolve) => {
                        const audioObj = new Audio(sub.audioUrl);
                        audioObj.addEventListener('loadedmetadata', () => {
                            sub.duration = audioObj.duration;
                            updatedCount++;
                            resolve();
                        });
                        audioObj.addEventListener('error', () => {
                            console.error('Không thể load audio:', sub.audioUrl);
                            // Xóa URL nếu file không tồn tại
                            sub.audioUrl = null;
                            sub.duration = 0;
                            resolve();
                        });
                    });
                    promises.push(p);
                }
            }
        }

        if (promises.length > 0) {
            await Promise.all(promises);
            this.saveData();
            if (!silent) this.toastr.success(`Đã quét và cập nhật thời lượng cho ${updatedCount} file audio thành công!`);
        } else {
            if (!silent) this.toastr.warning('Không tìm thấy file audio nào để rà soát.');
            this.saveData();
        }
    }

    toSlug(str: string): string {
        str = str || '';
        str = str.toLowerCase();
        str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        str = str.replace(/[đĐ]/g, 'd');
        str = str.replace(/([^0-9a-z-\s])/g, '');
        str = str.replace(/(\s+)/g, '-');
        str = str.replace(/^-+|-+$/g, '');
        return str;
    }

    saveData() {
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.multiAccountService.setItem(storageKey, this.projectData);
    }

    close() {
        this.dialogRef.close();
    }

    async onFileSelected(event: any, scene: any, video: any) {
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
                    this.toastr.error('Không thể xác nhận đường dẫn file tải về.');
                    return;
                }

                const localFilePath = await electron.selectLocalFile(originalPath);
                const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;

                if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|avi|mov)$/i)) {
                    video.videoUrl = finalPath;
                    const videoObj = document.createElement('video');
                    videoObj.src = video.videoUrl;
                    videoObj.addEventListener('loadedmetadata', () => {
                        if (videoObj.duration && !isNaN(videoObj.duration)) {
                            video.duration = parseFloat(videoObj.duration.toFixed(1));
                            this.saveData();
                            this.cd.detectChanges();
                            this.updateLines();
                        }
                    });
                } else {
                    video.imageUrl = finalPath;
                }
                
                video.isCompleted = true;
                this.saveData();
                this.cd.detectChanges();
                setTimeout(() => this.updateLines(), 150);
                this.toastr.success('Đã tải file thành công!');
            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    clearVideoMedia(video: any) {
        video.imageUrl = null;
        video.videoUrl = null;
        video.isCompleted = false;
        this.saveData();
        this.cd.detectChanges();
    }

    isImageType(url: string): boolean {
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        ];
        const cleanUrl = url.replace('file://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    selectedSceneIndex: number = -1;

    addNewScene() {
        const dialogRef = this.dialog.open(AddSceneComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '95vh',
            disableClose: true,
            data: {
                selectedClip: null,
                prompt: '',
                characters: this.projectData?.characters || [],
                masterPrompt: this.projectData?.masterPrompt || '',
                availableClips: this.allClips
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.selectedClip && result.prompt) {
                const clip = result.selectedClip;
                const formattedSubtitles = [
                    {
                        id: clip.id,
                        text: clip.description,
                        duration: clip.duration || 0,
                        audioUrl: clip.localFilePath ? `file://${clip.localFilePath.replace(/\\/g, '/')}` : null
                    }
                ];

                const totalDuration = clip.duration || 8;

                const newScene = {
                    id: `manual_${Date.now()}`,
                    subtitles: formattedSubtitles,
                    prompt: result.prompt.trim(),
                    imageUrl: null,
                    videos: [{
                        id: 1,
                        prompt: result.prompt.trim(),
                        imageUrl: null,
                        duration: totalDuration
                    }]
                };

                if (!this.projectData) this.projectData = { scenes: [] };
                if (!this.projectData.scenes) this.projectData.scenes = [];

                if (this.selectedSceneIndex !== -1 && this.selectedSceneIndex < this.projectData.scenes.length) {
                    this.projectData.scenes.splice(this.selectedSceneIndex + 1, 0, newScene);
                } else {
                    this.projectData.scenes.push(newScene);
                }

                // Reset selection
                this.selectedSceneIndex = -1;

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

    openDirectorMode() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '900px',
            maxWidth: '95vw',
            maxHeight: '95vh',
            panelClass: 'dark-theme-dialog',
            data: { prompt: this.projectData?.masterPrompt || '', targetName: 'Apply to Master Prompt' }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                if (!this.projectData) this.projectData = {};
                let currentPrompt = this.projectData.masterPrompt ? this.projectData.masterPrompt.trim() : '';
                currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentPrompt) {
                    this.projectData.masterPrompt = '[Cinematography: ' + result + ']\n\n' + currentPrompt;
                } else {
                    this.projectData.masterPrompt = '[Cinematography: ' + result + ']';
                }
                this.saveData();
                this.toastr.success('Đã áp dụng các thông số Director Mode vào Master Prompt!');
            }
        });
    }

    // Thêm hàm này vào trong class VideoTimelineDialogComponent
    getSceneDuration(scene: any): string {
        if (scene.forcedDuration) {
            return `${scene.forcedDuration}s`;
        }

        if (!scene || !scene.subtitles || scene.subtitles.length === 0) return '0s';

        let totalSeconds = 0;

        for (const sub of scene.subtitles) {
            if (sub.duration) {
                // Nếu đã có sẵn thời lượng thực tế của file audio
                totalSeconds += sub.duration;
            } else if (sub.text) {
                // Ước lượng nếu chưa có file audio (trung bình ~4 từ/giây)
                const words = sub.text.trim().split(/\s+/).length;
                totalSeconds += Math.max(1, words / 4); // Ít nhất là 1 giây
            }
        }

        const total = Math.round(totalSeconds);

        // Format hiển thị (VD: 45s hoặc 1m15s)
        if (total < 60) return `${total}s`;

        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${minutes}m${seconds}s`;
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
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService
    ) { }

    ngOnInit() {
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.projectData = this.multiAccountService.getItem(storageKey);

        const audioStorageKey = `ai_type_audio_merger_data_${this.data.uuid}`;
        const audioData = this.multiAccountService.getItem(audioStorageKey);
        this.allClips = audioData && audioData.clips ? audioData.clips : [];

        // Backward compatibility: Convert old scenes to grouped videos format
        if (this.projectData && this.projectData.scenes) {
            this.projectData.scenes.forEach((scene: any) => {
                if (!scene.videos) {
                    scene.videos = [{
                        id: 1,
                        prompt: scene.prompt,
                        imageUrl: scene.imageUrl || null,
                        duration: scene.forcedDuration || parseFloat(this.getSceneDuration(scene)) || 0
                    }];
                }
            });
        }

        // Tự động kiểm tra file audio ngay khi mở màn hình
        this.prepareForVideoGeneration(true);

        // Lắng nghe sự kiện tải ảnh từ webview (Gemini/Labs)
        const electron = (window as any).electron;
        if (electron && electron.onWebviewDownloadComplete) {
            electron.onWebviewDownloadComplete((res: any) => {
                if (this.activeDownloadScene && res && res.file) {
                    const localPath = res.file;
                    // Gắn URL hình ảnh
                    this.activeDownloadScene.imageUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

                    // Lưu lại và báo thành công
                    this.saveData();
                    this.toastr.success(`Đã gán ảnh vừa tải ảnh vào Phân cảnh!`, "Tải ảnh thành công!");

                    // Xóa scene đang được chọn để tránh gắn nhầm cho các lần tải sau
                    // và ngăn chặn lỗi hiển thị nhiều thông báo do event listener bị trùng lặp
                    this.activeDownloadScene = null;
                }
            });
        }

        // Bắt đầu vòng lặp vẽ SVG
        const startLoop = () => {
            this.updateLines();
            this.animationFrameId = requestAnimationFrame(startLoop);
        };
        startLoop();
    }

    ngOnDestroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
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