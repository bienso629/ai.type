import {
    Component,
    OnInit,
    ViewChild,
    ElementRef,
    Inject,
    CUSTOM_ELEMENTS_SCHEMA,
    ChangeDetectorRef
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
import { AudioGenerationComponent } from './audio-generation.component';
import { Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { CharacterDialogComponent } from './character-dialog.component';
import { EditScenePromptDialogComponent } from './edit-scene-prompt-dialog.component';
import { GenaiService } from 'app/genai.service';

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
export class VideoTimelineDialogComponent implements OnInit {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';

    // [THÊM BIẾN NÀY] Trạng thái hiển thị Master Prompt
    showMasterPrompt: boolean = true;
    isGeneratingCharacter: boolean = false;

    // Lưu lại Scene hiện tại đang được xử lý (khi bấm Prompt)
    activeDownloadScene: any = null;

    isEditingMasterPrompt: boolean = false;

    allClips: any[] = []; // Chứa danh sách tất cả các câu thoại có trong project

    @ViewChild('scrollContainer') scrollContainer!: ElementRef;
    @ViewChild('editScenePromptTemplate') editScenePromptTemplate!: any;

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
        // 1. Lấy Master Prompt từ dữ liệu tổng của Project
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";

        // 2. Tự động nối Master Prompt vào Scene Prompt để giữ phong cách xuyên suốt
        const scenePrompt = video.prompt || scene.prompt;
        const finalPrompt = master ? `${master}\n\n${scenePrompt}` : scenePrompt;

        // 3. Copy vào Clipboard
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

    async generateCharacterAndOpenDialog() {
        if (!this.projectData?.masterPrompt) {
            this.openCharacterDialog();
            return;
        }

        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        if (!secretKey) {
            this.toastr.error('Thiếu API Key cho AI. Đang mở form mặc định...');
            this.openCharacterDialog();
            return;
        }

        const randomKey = secretKey[Math.floor(Math.random() * secretKey.length)];

        this.isGeneratingCharacter = true;
        this.cd.markForCheck();

        const existingNames = (this.projectData.characters || []).map((c: any) => c.name || c.role).join(', ');
        const ignoreInstruction = existingNames ? `DO NOT generate these characters because they already exist: ${existingNames}. Generate a NEW character from the story.` : 'Extract the main character or a significant character from the story.';

        const systemPrompt = `
            You are an expert Casting Director and Character Designer.
            I will provide you with a story or video concept (Master Prompt).
            Your task is to extract ONE character from this story and provide their details in JSON format.
            
            ${ignoreInstruction}
            
            Return ONLY a valid JSON object with the following structure:
            {
                "name": "Character's Name (or a descriptive title if unnamed)",
                "role": "Their role in the story (e.g., Protagonist, Villain, Supporting)",
                "appearance": "Detailed physical description (hair, eyes, clothes, age, etc.)",
                "personality": "Their personality traits",
                "prompt": "A highly detailed image generation prompt in ENGLISH for this character (e.g., 'A 25yo man, cinematic lighting, highly detailed face...')"
            }
        `;

        try {
            // const ai = new GoogleGenAI({ apiKey: randomKey });

            const response = await this._genaiService.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: this.projectData.masterPrompt }] }],
                config: {
                    systemInstruction: systemPrompt,
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
            width: '600px',
            maxWidth: '95vw',
            height: 'auto',
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

                this.multiAccountService.setItem(`casting_list_${this.data.uuid}`, this.projectData.characters);
                this.saveData();

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
        this.multiAccountService.setItem(`casting_list_${this.data.uuid}`, this.projectData.characters);
        this.saveData();

        this.toastr.success(`Đã nhân bản nhân vật: ${char.name || char.role}`);
    }

    openEditScenePromptDialog(scene: any, video: any, index: number) {
        const dialogRef = this.dialog.open(EditScenePromptDialogComponent, {
            width: '700px',
            maxWidth: '95vw',
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
                    if (result.imageUrl) video.imageUrl = result.imageUrl;
                    if (result.aspectRatio) video.aspectRatio = result.aspectRatio;
                    this.saveData();
                    this.toastr.success('Đã lưu Prompt phân cảnh!');
                }
            }
        });
    }

    toggleEditMasterPrompt() {
        if (this.isEditingMasterPrompt) {
            this.saveData();
            this.toastr.success('Đã lưu Master Prompt!');
        }
        this.isEditingMasterPrompt = !this.isEditingMasterPrompt;
    }

    toggleVideoCompleted(video: any) {
        video.isCompleted = !video.isCompleted;
        this.saveData();
    }

    removeCharacter(index: number) {
        this.alert({
            title: 'Xóa nhân vật',
            message: 'Bạn có chắc chắn muốn xóa nhân vật này khỏi hồ sơ Casting?',
            confirm: 'Xóa ngay',
            cb: () => {
                this.projectData.characters.splice(index, 1);
                this.multiAccountService.setItem(`casting_list_${this.data.uuid}`, this.projectData.characters);
                this.saveData();
                this.toastr.warning('Đã xóa nhân vật.');
            }
        });
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

                video.imageUrl = localFilePath;
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
            width: '650px',
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

    openDirectorMode() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '900px',
            maxWidth: '95vw',
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