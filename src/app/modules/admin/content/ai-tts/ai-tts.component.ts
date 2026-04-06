import {
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewEncapsulation,
    AfterViewInit,
} from '@angular/core';
import { Title, DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { filter, interval, Subject, switchMap, take, takeUntil } from 'rxjs';
import { UserService } from 'app/core/user/user.service';
import { HelperService } from 'app/helper.service';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/modules/_services/crawl';
import { RemoveHTMLPipe } from 'app/app.pipe';
import { Clipboard } from '@angular/cdk/clipboard';
import { GoogleGenAI } from '@google/genai';
import { HttpClient } from '@angular/common/http';
import WaveSurfer from 'wavesurfer.js';
import { MatDialog } from '@angular/material/dialog';
import { VideoTimelineDialogComponent } from './tools/video-timeline-dialog.component';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

export interface AudioClip {
    id: string;
    name: string;
    duration: number;
    file?: File;
    url?: SafeUrl | string;
    rawUrl?: string;
    audioFileName?: string;
    username?: string;
    description?: string;
    originalHtml?: string;
    isProcessing?: boolean;
    voice?: string;
    rate?: number;  // Thêm mới: Tốc độ (0.5 đến 2.0)
    pitch?: number; // Thêm mới: Cao độ (-20 đến 20)
    prompt?: string;
}

@Component({
    selector: 'ai-tts',
    styleUrls: ['./ai-tts.component.scss'],
    templateUrl: './ai-tts.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [CrawlService],
})
export class Voice2videoComponent implements OnInit, OnDestroy, AfterViewInit {
    config: AppConfig;
    user: User;
    wavesurfer: WaveSurfer;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    ai: any;
    useImageAI: boolean = false;
    uuid: string = '';

    isAnalyzing: boolean = false; // Biến trạng thái loading cho việc tạo video
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';
    private readonly STORAGE_AUDIO_KEY = 'ai_type_audio_merger_data';
    private SERVER_AUDIO_URL: string;
    private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    projectTitle: string = 'Dự án mới';

    // [MỚI] Lưu lại params để dùng cho tính năng "Làm mới" (Reload)
    currentUuid: string | null = null;
    currentName: string | null = null;

    voiceList = [
        { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh' },
        { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My' },
        // { id: 'nam-calm', name: 'Nam điềm tĩnh (Server)' },
        // { id: 'nam-cham', name: 'Nam chậm (Server)' },
        // { id: 'nam-nhanh', name: 'Nam nhanh (Server)' },
        // { id: 'nam-truyen-cam', name: 'Nam truyền cảm (Server)' },
        // { id: 'nu-calm', name: 'Nữ điềm tĩnh (Server)' },
        // { id: 'nu-cham', name: 'Nữ chậm (Server)' },
        // { id: 'nu-luu-loat', name: 'Nữ lưu loát (Server)' },
        // { id: 'nu-nhe-nhang', name: 'Nữ nhẹ nhàng (Server)' }
    ];

    selectedVoice = 'vi-VN-HoaiMyNeural';
    isDownloadingModel: boolean = false; // Thêm biến này

    removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();
    audioList: AudioClip[] = [];
    isDraggingOver: boolean = false;
    totalDuration: number = 0;

    isGlobalProcessing: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    cleanupBlobs() {
        this.audioList.forEach((clip) => {
            if (clip.rawUrl && clip.rawUrl.startsWith('blob:')) {
                URL.revokeObjectURL(clip.rawUrl);
            }
        });
    }

    async downloadVoiceModel() {
        if (!(window as any).electron) return;

        this.isDownloadingModel = true;
        this.cd.markForCheck();
        this.toastr.info("Đang kiểm tra và tải Model Yenai. Vui lòng không tắt app...", "Hệ thống");

        try {
            const res = await (window as any).electron.invoke('download-rvc-models', {});
            if (res.success) {
                this.toastr.success("Đã tải/cập nhật xong Giọng Yenai!");
            } else {
                this.error("Lỗi tải Model: " + res.error);
            }
        } catch (e: any) {
            this.error("Ngoại lệ: " + e.message);
        } finally {
            this.isDownloadingModel = false;
            this.cd.markForCheck();
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ CORE TTS LOGIC (CONCURRENT & RETRY)
    // -----------------------------------------------------------------------------------------------------

    async generateAll() {
        const pendingClips = this.audioList.filter((c) => !c.url && !c.file);

        if (pendingClips.length === 0) {
            this.toastr.info('Tất cả đã có audio.');
            return;
        }

        if (this.isGlobalProcessing) return;
        this.isGlobalProcessing = true;

        // Chia nhỏ danh sách để xử lý theo batch (tránh treo máy)
        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        const isEdgeVoice = edgeVoices.includes(this.selectedVoice);
        const batchSize = (isEdgeVoice) ? 3 : 1;
        this.toastr.info(`Bắt đầu xử lý ${pendingClips.length} mục (Batch size: ${batchSize})...`);

        for (let i = 0; i < pendingClips.length; i += batchSize) {
            const batch = pendingClips.slice(i, i + batchSize);
            await Promise.all(batch.map(clip => this.generateAudio(clip)));

            // Nghỉ một chút giữa các batch để máy "thở"
            await new Promise(r => setTimeout(r, 500));
        }

        this.isGlobalProcessing = false;
        this.toastr.success('Đã hoàn tất toàn bộ danh sách!');
        this.cd.markForCheck();
    }

    // Tìm đến hàm generateAudio và sửa lại như sau:
    async generateAudio(clip: AudioClip): Promise<void> {
        if (!clip.description || !clip.description.trim()) {
            this.toastr.warning(`"${clip.name}" không có nội dung text`);
            return Promise.resolve();
        }

        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];

        // Nếu là giọng Edge TTS Offline
        if (clip.voice && edgeVoices.includes(clip.voice)) {
            return this.generateEdgeTTSLocal(clip);
        }

        // [MỚI] Nếu là giọng Huệ (ID: 1248295) hoặc các giọng từ AusyncLab
        return this.generateAusyncTTS(clip);
    }

    // Thêm hàm generateAusyncTTS vào class Voice2videoComponent
    async generateAusyncTTS(clip: AudioClip): Promise<void> {
        if (!(window as any).electron || !(window as any).electron.invoke) {
            this.toastr.error('Cần chạy trên App Desktop.');
            return;
        }

        clip.isProcessing = true;
        this.cd.markForCheck();

        const username = this.user?.name || 'anonymous';
        const subPath = `${username}/${this.uuid || 'default'}`;
        const index = this.audioList.indexOf(clip);
        const prefix = (index >= 0 ? index + 1 : 0).toString().padStart(3, '0');
        const slug = this.toSlug(clip.description.substring(0, 50));
        const niceFilename = `${prefix}_${slug}_ausync`;

        const payload = {
            text: clip.description,
            voice_id: clip.voice, // Ví dụ: 1248295
            speed: 1.0,
            filename: niceFilename,
            username: subPath,
        };

        try {
            // Gọi Electron để xử lý chuỗi API phức tạp (POST -> GET -> DOWNLOAD)
            const res = await (window as any).electron.invoke('tts-ausync-generate', payload);

            if (res && res.success) {
                clip.audioFileName = res.filePath.split(/[\\/]/).pop();
                clip.username = subPath;
                clip['localFilePath'] = res.filePath;
                clip.rawUrl = null;
                clip.isProcessing = false;

                await this.loadLocalAudioContent(clip);

                if (!this.isGlobalProcessing) {
                    this.playClip(clip);
                }

                this.saveToLocal();
                this.toastr.success(`Đã tải xong: ${clip.audioFileName}`);
            } else {
                this.handleTTSError(clip, res.error || 'Lỗi từ AusyncLab API');
            }
        } catch (err: any) {
            this.handleTTSError(clip, 'Lỗi hệ thống: ' + err.message);
        } finally {
            this.cd.markForCheck();
        }
    }

    async generateEdgeTTSLocal(clip: AudioClip): Promise<void> {
        if (!(window as any).electron || !(window as any).electron.invoke) {
            this.toastr.error('Cần chạy trên App Desktop (Electron).');
            return;
        }

        clip.isProcessing = true;
        this.cd.markForCheck();

        const username = this.user?.name || 'anonymous';
        const subPath = `${username}/${this.uuid || 'default'}`;
        const index = this.audioList.indexOf(clip);
        const prefix = (index >= 0 ? index + 1 : 0).toString().padStart(3, '0');
        const shortText = clip.description.substring(0, 50);
        const slug = this.toSlug(shortText);

        const niceFilename = `${prefix}_${slug}_${clip.voice}`;

        const payload = {
            text: clip.description,
            voice: clip.voice, // Lấy đúng giọng trên giao diện (Nam Minh/Hoài My)
            rate: clip.rate || 1.0,
            pitch: clip.pitch || 0,
            filename: niceFilename,
            username: subPath,
        };

        try {
            // BƯỚC 1: SINH AUDIO GỐC (EDGE TTS) + FILE .VTT
            const ttsRes = await (window as any).electron.invoke('tts-generate', payload);

            if (ttsRes && ttsRes.success) {
                clip.audioFileName = ttsRes.filePath.split(/[\\/]/).pop();
                clip.username = subPath;
                clip['localFilePath'] = ttsRes.filePath;
                clip.rawUrl = null;
                clip.isProcessing = false;

                await this.loadLocalAudioContent(clip);

                if (!this.isGlobalProcessing) {
                    this.playClip(clip);
                }

                this.saveToLocal();
                this.toastr.success(`Đã tạo: ${clip.audioFileName}`);
            } else {
                this.handleTTSError(clip, ttsRes.error || 'Lỗi tạo giọng đọc gốc.');
            }
        } catch (err: any) {
            console.error(err);
            this.handleTTSError(clip, 'Lỗi hệ thống: ' + err.message);
        } finally {
            this.cd.markForCheck();
        }
    }

    // =====================================================================
    // [MỚI] HÀM KIỂM TRA VÀ GỌI RVC RIÊNG LẺ
    // =====================================================================
    async applyRvcToClip(clip: AudioClip) {
        if (!(window as any).electron || !(window as any).electron.invoke) {
            this.toastr.error('Tính năng này chỉ hoạt động trên ứng dụng Desktop.');
            return;
        }

        clip.isProcessing = true;
        this.cd.markForCheck();

        try {
            // 1. NẾU CHƯA CÓ FILE GỐC -> Gọi AI sinh Audio nháp trước
            if (!clip['localFilePath'] || !clip.url) {
                this.toastr.info(`Đang tạo audio gốc (đọc nháp) cho: ${clip.name}...`);
                await this.generateAudio(clip);

                // Nếu gọi xong mà vẫn không sinh ra được file (do lỗi mạng/API) thì dừng
                if (!clip['localFilePath']) {
                    throw new Error("Không thể tạo audio gốc để xử lý RVC.");
                }
            }

            // 2. BẮT ĐẦU QUÁ TRÌNH CLONE GIỌNG RVC
            this.toastr.info('Đang biến đổi qua RVC AI...', 'Hệ thống');

            const inputPath = clip['localFilePath'];
            // GHI ĐÈ THẲNG TÊN GỐC (chỉ đổi đuôi thành .wav cho chuẩn RVC)
            const outputPath = inputPath.replace(/\.(mp3|wav)$/i, `.wav`);

            // ĐƯỜNG DẪN MODEL (Tùy chỉnh model của bạn tại đây)
            const envPath = inputPath.split('ai.type')[0];
            const pthPath = `${envPath}ai.type\\data\\models\\muaphosaigon\\muaphosaigon_3700e_18500s.pth`;
            const indexPath = `${envPath}ai.type\\data\\models\\muaphosaigon\\added_IVF44_Flat_nprobe_1_muaphosaigon_v2.index`;

            // Giữ nguyên Tone mặc định
            const finalPitch = clip.pitch || 0;

            const data = {
                inputAudio: inputPath,
                outputAudio: outputPath,
                pitch: finalPitch,
                pthPath: pthPath,
                indexPath: indexPath
            };

            // 3. GỌI API PYTHON ĐỂ CLONE
            const rvcRes = await (window as any).electron.invoke('apply-rvc', data);

            if (rvcRes && rvcRes.success) {
                // 4. CẬP NHẬT FILE MỚI VÀO GIAO DIỆN
                clip['localFilePath'] = outputPath;
                clip.audioFileName = outputPath.split(/[\\/]/).pop();
                clip.rawUrl = null; // Bắt buộc set null để WaveSurfer xóa đệm cũ

                await this.loadLocalAudioContent(clip);
                this.saveToLocal();
                this.toastr.success(`Đã đổi giọng thành công!`);

                if (!this.isGlobalProcessing) {
                    this.playClip(clip);
                }
            } else {
                throw new Error(rvcRes?.error || "Lỗi không xác định từ RVC Engine");
            }

        } catch (err: any) {
            console.error(err);
            this.toastr.error('Lỗi RVC: ' + err.message);
        } finally {
            clip.isProcessing = false;
            this.cd.markForCheck();
        }
    }

    // [RETRY] Hàm xử lý lỗi: Bật Dialog Confirm
    private handleTTSError(
        clip: AudioClip,
        errorMessage: string,
        resolveCallback?: () => void,
    ) {
        clip.isProcessing = false;
        this.cd.markForCheck();

        console.error(`Error processing clip ${clip.name}:`, errorMessage);

        // Mở dialog hỏi người dùng
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Lỗi chuyển đổi',
            message: `Không thể tạo audio cho: "<b>${clip.name}</b>"<br>Lỗi: <span class="text-red-500">${errorMessage}</span><br>Bạn có muốn thử lại đoạn này không?`,
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation-circle',
                color: 'warn',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Thử lại ngay',
                    color: 'primary',
                },
                cancel: { show: true, label: 'Bỏ qua' },
            },
            dismissible: false,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                // Retry: Gọi lại generateAudio
                this.generateAudio(clip).then(() => {
                    if (resolveCallback) resolveCallback();
                });
            } else {
                // Ignore: Resolve để Promise.all tiếp tục chạy các task khác
                if (resolveCallback) resolveCallback();
            }
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ STORAGE & LEGACY SERVER MERGE
    // -----------------------------------------------------------------------------------------------------
    saveToLocal(currentUuid?: string) {
        // Ưu tiên dùng uuid truyền vào, nếu không thì dùng uuid hiện tại của component
        const targetUuid = currentUuid || this.uuid;

        if (!targetUuid) return;

        const dataToSave = {
            uuid: targetUuid,
            title: this.projectTitle,
            clips: this.audioList.map((clip) => ({
                id: clip.id,
                name: clip.name,
                description: clip.description,
                voice: clip.voice,
                rate: clip.rate || 1.0,   // Lưu rate
                pitch: clip.pitch || 0,   // Lưu pitch
                duration: clip.duration,
                audioFileName: clip.audioFileName,
                username: clip.username,
                prompt: clip.prompt,
                localFilePath: clip['localFilePath'] || null,
            })),
        };

        // Lưu vào IndexedDB (thông qua Service) với key định danh theo UUID
        const storageKey = `${this.STORAGE_AUDIO_KEY}_${targetUuid}`;
        this.multiAccountService.setItem(storageKey, dataToSave);
    }

    loadAudiosFromLocal(currentUuid: string): boolean {
        if (!currentUuid) return false;

        const storageKey = `${this.STORAGE_AUDIO_KEY}_${currentUuid}`;
        const parsed = this.multiAccountService.getItem(storageKey);

        if (parsed) {
            try {
                if (parsed.title) {
                    this.projectTitle = parsed.title;
                }

                if (parsed.uuid) {
                    this.uuid = parsed.uuid;
                }

                const clips = parsed.clips || [];
                if (Array.isArray(clips) && clips.length > 0) {
                    this.restoreClips(clips);
                    return true;
                }
            } catch (e) {
                console.error('Lỗi khi khôi phục Audio Clips:', e);
                return false;
            }
        }
        return false;
    }

    loadClipsFromLocal(currentUuid?: string): boolean {
        if (!currentUuid) return false;

        // [CẬP NHẬT]: Lấy data từ MultiAccountService
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${currentUuid}`;
        const videoProject = this.multiAccountService.getItem(storageKey);

        if (videoProject) {
            try {
                // Kiểm tra xem project có dữ liệu scenes thực tế không
                if (videoProject.scenes && videoProject.scenes.length > 0) {
                    const isDialogOpen = this.dialog.openDialogs.some(
                        (d) => d.componentInstance instanceof VideoTimelineDialogComponent
                    );

                    if (!isDialogOpen) {
                        this.openTimelineDialog(videoProject);
                    }
                    return true;
                }
            } catch (e) {
                console.error('Dữ liệu video cũ bị lỗi:', e);
                return false;
            }
        }
        return false;
    }

    restoreClips(clips: any[]) {
        const offlineKeywords = ['NamMinhNeural', 'HoaiMyNeural'];
        const offlineVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];

        this.audioList = clips.map((item: any) => {
            let restoredUrl = null;
            let restoredRawUrl = null;

            // Logic nhận diện file Offline chuẩn xác hơn
            const isOfflineVoice =
                (item.voice && offlineVoices.includes(item.voice)) ||
                (item.audioFileName &&
                    offlineKeywords.some((k) =>
                        item.audioFileName.includes(k),
                    ));

            if (item.audioFileName) {
                if (isOfflineVoice) {
                    // FILE OFFLINE: Không gắn link Server bậy bạ
                    // Tự động load file local sau 100ms
                    setTimeout(() => {
                        this.loadLocalAudioContent(item);
                    }, 100);
                } else {
                    // FILE SERVER: Gắn link https bình thường
                    let userFolder =
                        item.username || this.user?.name || 'anonymous';
                    let baseUrl = this.SERVER_AUDIO_URL || '';
                    if (baseUrl && !baseUrl.endsWith('/')) baseUrl += '/';

                    if (baseUrl) {
                        const fullUrl = `${baseUrl}${userFolder}/${item.audioFileName}`;
                        restoredRawUrl = fullUrl;
                        restoredUrl =
                            this.sanitizer.bypassSecurityTrustUrl(fullUrl);
                    }
                }
            }

            return {
                ...item, // Copy lại toàn bộ dữ liệu (bao gồm description)
                file: null,
                url: restoredUrl,
                rawUrl: restoredRawUrl,
                isProcessing: false,
            };
        });

        this.calculateTotalDuration();
        this.cd.markForCheck();
    }

    // Hàm trung gian: Gọi Electron lấy file -> Biến thành Blob -> Gán vào Clip
    async loadLocalAudioContent(
        clip: AudioClip,
        retryCount = 0,
    ): Promise<boolean> {
        if (!(window as any).electron) return false;

        // Nếu path chưa có, thử dựng lại path (đề phòng F5 mất data)
        let filePath = clip['localFilePath'];

        // Nếu clip có rawUrl là blob rồi thì thôi
        if (clip.rawUrl && clip.rawUrl.startsWith('blob:')) return true;

        try {
            const result = await (window as any).electron.invoke(
                'read-local-audio',
                {
                    path: filePath,
                    filename: clip.audioFileName, // Fallback nếu bên main cần
                },
            );

            if (result && result.base64) {
                const byteCharacters = atob(result.base64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/mp3' });
                const blobUrl = URL.createObjectURL(blob);

                clip.rawUrl = blobUrl;
                clip.url = this.sanitizer.bypassSecurityTrustUrl(blobUrl);
                return true;
            } else {
                // [CƠ CHẾ RETRY] Nếu không thấy file và mới thử dưới 3 lần
                if (retryCount < 3) {
                    console.warn(`Chưa thấy file, thử lại sau 500ms...`);
                    await new Promise((r) => setTimeout(r, 500)); // Đợi 0.5s
                    return this.loadLocalAudioContent(clip, retryCount + 1); // Gọi đệ quy
                }
            }
        } catch (e) {
            console.error('Lỗi load local file:', e);
        }
        return false;
    }

    uploadLocalFile(clip: AudioClip): Promise<string | null> {
        return new Promise((resolve) => {
            if (!clip.file) return resolve(null);
            if (clip.file.size > this.MAX_FILE_SIZE) {
                this.toastr.error(`File lớn >10MB`);
                return resolve(null);
            }
            const formData = new FormData();
            formData.append('file', clip.file);
            formData.append('username', this.user?.name || 'anonymous');
            let baseUrl = this.SERVER_AUDIO_URL || '';
            if (!baseUrl.endsWith('/')) baseUrl += '/';
            this.http.post(`${baseUrl}upload-audio`, formData).subscribe({
                next: (res: any) =>
                    resolve(res && res.filename ? res.filename : null),
                error: () => {
                    this.toastr.error(`Lỗi upload`);
                    resolve(null);
                },
            });
        });
    }

    async createVideo() {
        this.isAnalyzing = true;

        // 1. Lấy thông tin cấu hình AI từ Settings
        this.settings = this.multiAccountService.getItem('settings');

        this.secretKey = this.settings.secretKey
            ? this.settings.secretKey.split(';')
            : undefined;

        if (!this.secretKey) {
            this.toastr.error(
                'Thiếu API Key cho AI. Vui lòng kiểm tra cài đặt.',
            );
            return;
        }

        let geminiKey = this.secretKey[6] || this.secretKey[0];
        this.ai = new GoogleGenAI({ apiKey: geminiKey });

        // [CẬP NHẬT]: Lấy data từ MultiAccountService thay vì localStorage
        const storageKey = `${this.STORAGE_AUDIO_KEY}_${this.uuid}`;
        const data = this.multiAccountService.getItem(storageKey);

        if (!data || !data.clips) {
            this.toastr.warning('Không tìm thấy dữ liệu âm thanh để phân tích.');
            this.isAnalyzing = false;
            return;
        }

        const allClips = data.clips;

        // 3. Tạo một dòng văn bản duy nhất kèm ID để AI biết đoạn nào thuộc ID nào
        // Cấu trúc: [ID:abc] Nội dung văn bản... [ID:xyz] Nội dung...
        const continuousText = allClips
            .map((c: any) => `[ID:${c.id}] ${c.description}`)
            .join(' ');

        // 4. Prompt ép buộc gom nhóm (Grouping Logic)
        const promptText = `
            BẠN LÀ BIÊN TẬP VIÊN VIDEO. 
            Ví dụ tôi có tổng 138 đoạn văn bản (được đánh dấu bằng [ID:xxx]). 
            Nhiệm vụ của bạn là gom nhóm chúng lại thành các phân cảnh (scenes), càng ít càng tốt (có thể là dưới 20 phân cảnh thôi).

            YÊU CẦU:
            1. Mỗi phân cảnh (scene) PHẢI có:
            - "prompt": Tạo video bằng tiếng Việt.
            - "subtitles": Mảng chứa các object { "id": "ID_GỐC", "text": "NỘI DUNG" }.
            2. Logic gom nhóm: Những đoạn văn bản có nội dung liền mạch hoặc ngắn thì gom chung vào 1 "prompt" ảnh.
            3. KHÔNG ĐƯỢC bỏ sót bất kỳ ID nào. Phải đảm bảo đủ 138 text gốc.

            DỮ LIỆU ĐẦU VÀO:
            ${continuousText}

            KẾT QUẢ TRẢ VỀ LÀ JSON ARRAY NHƯ VÍ DỤ SAU:
            [
            {
                "prompt": "Tạo video cho nhóm này",
                "subtitles": [
                { "id": "3l8bm4hkp", "text": "Trân trọng giới thiệu..." },
                { "id": "aanpwkn1d", "text": "CHƯƠNG I..." }
                ]
            }
            ]
        `;

        try {
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: promptText,
            });

            // Lấy text từ cấu trúc candidates
            const finalScenes = this.helperService.safeJsonParseFromAI(
                response.text,
            );

            // 5. Lưu cấu trúc mới (Cấu trúc này tối ưu cho Render)
            // Thay vì lưu theo Clips, ta lưu theo danh sách SCENES
            const videoProject = {
                uuid: data.uuid,
                title: data.title,
                totalOriginalClips: allClips.length,
                totalScenes: finalScenes.length, // Sẽ khoảng 100
                scenes: finalScenes,
            };

            // [CẬP NHẬT]: Lưu vào MultiAccountService theo UUID
            const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.uuid}`;
            this.multiAccountService.setItem(storageKey, videoProject);

            // 2. MỞ DIALOG NGAY LẬP TỨC
            this.openTimelineDialog(videoProject);

            this.toastr.success(
                `Đã tối ưu thành ${finalScenes.length} phân cảnh!`,
                'Thành công',
            );

            this.isAnalyzing = false;
        } catch (error) {
            console.error('Lỗi logic gom nhóm:', error);

            this.isAnalyzing = false;
            this.toastr.error(
                'Lỗi khi tối ưu nội dung bằng AI. Vui lòng thử lại.',
            );
        }
    }

    checkAndOpenVideoTimeline(rawData?: string) {
        if (rawData) {
            try {
                const videoProject = JSON.parse(rawData);

                // Kiểm tra xem project có dữ liệu scenes thực tế không
                if (
                    videoProject &&
                    videoProject.scenes &&
                    videoProject.scenes.length > 0
                ) {
                    // Kiểm tra xem dialog đã mở chưa (tránh mở nhiều cái trùng nhau)
                    const isDialogOpen = this.dialog.openDialogs.some(
                        (d) =>
                            d.componentInstance instanceof
                            VideoTimelineDialogComponent,
                    );

                    if (!isDialogOpen) {
                        this.openTimelineDialog(videoProject);
                    }
                }
            } catch (e) {
                console.error('Dữ liệu video cũ bị lỗi:', e);
            }
        }
    }

    // Hàm bổ trợ để mở Dialog
    openTimelineDialog(data: any) {
        data['username'] = this.user?.name || 'anonymous'; // Đảm bảo có username trong data

        this.dialog.open(VideoTimelineDialogComponent, {
            width: '95vw', // Chiều rộng chiếm 95% màn hình
            maxHeight: '90vh', // Chỉ giới hạn chiều cao tối đa
            height: 'auto', // Tự động co giãn theo nội dung
            data: data, // Truyền dữ liệu trực tiếp vào dialog
            panelClass: 'custom-timeline-container', // Class để bạn style thêm nếu cần
            autoFocus: false, // Tránh việc tự động nhảy focus làm cuộn timeline lung tung
        });
    }

    async exportMerge() {
        if (this.audioList.length === 0) {
            this.toastr.warning('Danh sách trống!');
            return;
        }
        this.toastr.info('Chuẩn bị file...', 'System');

        for (let clip of this.audioList) {
            if (clip.file && !clip.audioFileName) {
                clip.isProcessing = true;
                this.cd.markForCheck();
                try {
                    const serverFilename = await this.uploadLocalFile(clip);
                    if (serverFilename) {
                        clip.audioFileName = serverFilename;
                        clip.username = this.user?.name || 'anonymous';
                    }
                } catch (e) { }
                clip.isProcessing = false;
                this.cd.markForCheck();
            }
        }

        const validClips = this.audioList.filter((c) => c.audioFileName);
        if (validClips.length === 0) {
            this.toastr.error('Chưa có file nào hợp lệ.');
            return;
        }

        const filenames = validClips.map((c) => c.audioFileName);
        let baseUrl = this.SERVER_AUDIO_URL || '';
        if (!baseUrl.endsWith('/')) baseUrl += '/';

        const payload = { filenames, username: this.user?.name || 'anonymous' };
        this.http.post(`${baseUrl}submit-audio-merge`, payload).subscribe({
            next: (res: any) => {
                if (res && res.job_id) {
                    this.toastr.info('Server đang ghép file...', 'Đang chờ');
                    this.pollMergeJob(res.job_id, baseUrl);
                }
            },
            error: () => this.toastr.error('Lỗi khi gửi yêu cầu ghép.'),
        });
    }

    pollMergeJob(jobId: string, baseUrl: string) {
        const polling$ = interval(3000).pipe(
            switchMap(() =>
                this.http.get(`${baseUrl}job-status/${jobId}`, {
                    responseType: 'blob',
                    observe: 'response',
                }),
            ),
            switchMap(async (resp: any) => {
                const headers = resp.headers;
                const body = resp.body;
                const contentType =
                    headers.get('content-type') || body.type || '';
                if (contentType.startsWith('audio/'))
                    return { done: true, blob: body };
                return { done: false, blob: null };
            }),
            filter((res) => res.done),
            take(1),
        );
        polling$.subscribe({
            next: (res: any) => {
                const url = window.URL.createObjectURL(res.blob);
                const a = document.createElement('a');
                a.href = url;
                const safeTitle = this.toSlug(this.projectTitle).replace(
                    /-/g,
                    '_',
                );
                a.download = `${safeTitle}_merged.wav`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                this.toastr.success('Ghép file thành công!');
            },
            error: () => this.toastr.error('Lỗi ghép file.'),
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ EVENTS & UI HELPERS
    // -----------------------------------------------------------------------------------------------------

    initWaveSurfer() {
        if (!document.getElementById('waveform')) return;
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4f46e5',
            progressColor: '#312e81',
            cursorColor: '#312e81',
            barWidth: 3,
            barRadius: 3,
            cursorWidth: 1,
            height: 80,
            barGap: 3,
            normalize: true,
        });
        this.wavesurfer.on('finish', () => {
            this.wavesurfer.stop();
        });
    }

    async playClip(clip: AudioClip) {
        if (!this.wavesurfer) return;

        // 1. Nếu là file Server (HTTP) -> Tải về
        if (clip.rawUrl && clip.rawUrl.startsWith('http')) {
            // Chặn lỗi Offline bị gán link Server
            if (
                clip.audioFileName &&
                (clip.audioFileName.includes('NamMinhNeural') ||
                    clip.audioFileName.includes('HoaiMyNeural'))
            ) {
                clip.rawUrl = null; // Reset để nhảy xuống bước 3
            } else {
                this.handleServerAudio(clip);
                return;
            }
        }

        // 2. Nếu đã có Blob (do loadLocalAudioContent tạo ra) -> Play luôn
        if (clip.rawUrl && clip.rawUrl.startsWith('blob:')) {
            this.wavesurfer.load(clip.rawUrl);
            this.wavesurfer.once('ready', () => {
                this.wavesurfer.play();
            });
            return;
        }

        // 3. Nếu chưa có gì cả -> Gọi hàm load từ ổ cứng
        if (clip.audioFileName && (window as any).electron) {
            // this.toastr.info('Đang đọc file...', 'System');
            const success = await this.loadLocalAudioContent(clip);

            if (success && clip.rawUrl) {
                this.wavesurfer.load(clip.rawUrl);
                this.wavesurfer.once('ready', () => {
                    this.wavesurfer.play();
                });
            } else {
                this.toastr.error('Không tìm thấy file audio trên máy.');
            }
        }
    }

    // Hàm hỗ trợ tải file từ URL Server về Blob để tránh lỗi CORS của WaveSurfer
    handleServerAudio(clip: AudioClip) {
        if (!clip.rawUrl) return;

        // Dừng player cũ nếu đang chạy
        if (this.wavesurfer) this.wavesurfer.stop();

        // Hiển thị thông báo nhỏ để người dùng biết đang tải (nếu mạng chậm)
        // this.toastr.info('Đang tải audio...', 'System');

        this.http.get(clip.rawUrl, { responseType: 'blob' }).subscribe({
            next: (blob) => {
                // Tạo Blob URL mới từ dữ liệu vừa tải về
                const newBlobUrl = URL.createObjectURL(blob);

                // Cập nhật lại vào clip:
                // Lần sau bấm play, nó sẽ thấy đây là blob:http... và play luôn, không cần tải lại
                clip.rawUrl = newBlobUrl;
                clip.url = this.sanitizer.bypassSecurityTrustUrl(newBlobUrl);

                // Load vào WaveSurfer và Play
                if (this.wavesurfer) {
                    this.wavesurfer.load(newBlobUrl);
                    this.wavesurfer.once('ready', () => {
                        this.wavesurfer.play();
                    });
                }
            },
            error: (err) => {
                console.error('Lỗi tải file audio từ server:', err);
                this.toastr.error('Không thể phát file này (Lỗi tải/CORS).');
            },
        });
    }

    drop(event: CdkDragDrop<AudioClip[]>) {
        moveItemInArray(
            this.audioList,
            event.previousIndex,
            event.currentIndex,
        );
        this.saveToLocal();
    }

    removeClip(index: number) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa clip',
            message: 'Bạn có chắc chắn muốn xóa?',
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation',
                color: 'warn',
            },
            actions: {
                confirm: { show: true, label: 'Xóa', color: 'warn' },
                cancel: { show: true, label: 'Hủy' },
            },
        });
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (this.audioList[index].rawUrl?.startsWith('blob:'))
                    URL.revokeObjectURL(this.audioList[index].rawUrl);
                this.audioList.splice(index, 1);
                this.calculateTotalDuration();
                this.saveToLocal();
                this.cd.markForCheck();
            }
        });
    }

    downloadClip(clip: AudioClip) {
        if (!clip.rawUrl) return;
        const link = document.createElement('a');
        link.href = clip.rawUrl;
        link.download = clip.audioFileName || `${this.toSlug(clip.name)}.mp3`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // [CẬP NHẬT] Hàm Clear - Làm mới thông minh
    clear() {
        this.toastr.info(
            'Đang tải lại dữ liệu gốc từ Server...',
            'Làm mới',
        );
        const storageKey = `${this.STORAGE_AUDIO_KEY}_${this.currentUuid}`;
        localStorage.removeItem(storageKey);
        this.detail(this.currentUuid, this.currentName || '');
    }

    calculateTotalDuration() {
        this.totalDuration = this.audioList.reduce(
            (acc, curr) => acc + (curr.duration || 0),
            0,
        );
    }

    exportProject() {
        const exportData = {
            title: this.projectTitle,
            createdAt: new Date().toISOString(),
            clips: this.audioList.map((clip) => ({
                id: clip.id,
                name: clip.name,
                description: clip.description,
                voice: clip.voice,
                duration: clip.duration,
                audioFileName: clip.audioFileName,
                username: clip.username,
            })),
        };
        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const safeTitle = this.toSlug(this.projectTitle).replace(/-/g, '_');
        const fileName = `${safeTitle || 'project'}_${new Date().getTime()}.json`;
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toastr.success(`Đã xuất file: ${fileName}`);
    }

    triggerImport() {
        const fileInput = document.getElementById(
            'importInput',
        ) as HTMLInputElement;
        if (fileInput) fileInput.click();
    }
    onImportFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e: any) => {
            try {
                const importedData = JSON.parse(e.target.result);
                let clipsToRestore = Array.isArray(importedData)
                    ? importedData
                    : importedData.clips;
                if (importedData.title) this.projectTitle = importedData.title;
                this.restoreClips(clipsToRestore);
                this.saveToLocal();
                this.toastr.success(`Đã nhập dự án: ${this.projectTitle}`);
            } catch (err) {
                this.toastr.error('Lỗi khi đọc file dự án.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    async createImgWithDreamina(url: string, prompt: string) {
        this.copy(prompt);

        const uniqueID = Math.random().toString(36).substr(2, 9);
        await (window as any).electron.tools({
            url: url,
            command: 'dreamina.capcut',
            uniqueID,
            username: this.user.name,
            filenamePrefix: 'dream_',
            width: 1600,
            height: 900,
        });
    }

    copy(text: string) {
        this.clipboard.copy(text);
        this.toastr.success(`Copy prompt xong.`);
    }

    genaralImageFromPrompt(done: any): Promise<string | null> {
        return Promise.resolve(null);
    }

    /**
 * Áp dụng cấu hình hàng loạt cho tất cả các clip chưa có file upload
 */
    applyBulkSettings(voice: string, rate: number, pitch: number): void {
        if (!this.audioList || this.audioList.length === 0) return;

        let count = 0;
        this.audioList.forEach(clip => {
            // Chỉ áp dụng cho các clip dạng text (không phải file audio người dùng tự upload lên)
            if (!clip.file) {
                if (voice) clip.voice = voice;
                if (rate !== undefined) clip.rate = rate;
                if (pitch !== undefined) clip.pitch = pitch;
                count++;
            }
        });

        if (count > 0) {
            this.saveToLocal(); // Lưu vào IndexedDB ngay
            this.toastr.success(`Đã cập nhật cấu hình cho ${count} clips thành công!`);
            this.cd.markForCheck();
        }
    }

    detail(uuid: string, name: string) {
        this._crawlService
            .detail({ uuid: uuid, username: name })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.data && result.data.done) {
                        if (result.data.title) {
                            this.projectTitle = result.data.title;
                            this.titleService.setTitle(
                                `${this.projectTitle} | Audio Manager`,
                            );
                        }
                        this.audioList = result.data.done.map(
                            (htmlItem: any, index: number) => {
                                const cleanText =
                                    this.removeHTML.transform(htmlItem);
                                return {
                                    id: this.generateId(),
                                    name:
                                        cleanText.length > 50
                                            ? cleanText.substring(0, 50) + '...'
                                            : cleanText,
                                    duration: 0,
                                    description: cleanText,
                                    isProcessing: false,
                                    voice: 'vi-VN-NamMinhNeural',
                                    rate: 1.0, // Mặc định tốc độ chuẩn
                                    pitch: 0,   // Mặc định cao độ chuẩn
                                    prompt: '',
                                };
                            },
                        );
                        this.calculateTotalDuration();
                        this.saveToLocal(uuid);
                        this.cd.markForCheck();
                    }
                },
            });
    }

    onFileSelected(event: any) {
        const files: FileList = event.target.files;
        if (files?.length > 0) this.processFiles(files);
        event.target.value = '';
    }
    onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDraggingOver = true;
    }
    onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDraggingOver = false;
    }
    onDropFile(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDraggingOver = false;
        const files = event.dataTransfer?.files;
        if (files?.length > 0) this.processFiles(files);
    }

    async processFiles(files: FileList) {
        const promises: Promise<AudioClip>[] = [];
        for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('audio/'))
                promises.push(this.createAudioClipFromFile(files[i]));
        }
        try {
            const newClips = await Promise.all(promises);
            this.audioList = [...this.audioList, ...newClips];
            this.calculateTotalDuration();
            this.saveToLocal();
            this.cd.markForCheck();
            this.toastr.success(`Đã thêm ${newClips.length} files.`);
        } catch (err) { }
    }

    private createAudioClipFromFile(file: File): Promise<AudioClip> {
        return new Promise((resolve) => {
            const objectUrl = URL.createObjectURL(file);
            const audio = new Audio();
            audio.onloadedmetadata = () => {
                resolve({
                    id: this.generateId(),
                    name: file.name,
                    duration: Math.round(audio.duration),
                    file: file,
                    rawUrl: objectUrl,
                    url: this.sanitizer.bypassSecurityTrustUrl(objectUrl),
                    description: file.name.replace(/\.[^/.]+$/, ''),
                    voice: 'nam-calm',
                });
            };
            audio.src = objectUrl;
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ UTILS
    // -----------------------------------------------------------------------------------------------------

    getDateStr(): string {
        const d = new Date();
        const day = ('0' + d.getDate()).slice(-2);
        const month = ('0' + (d.getMonth() + 1)).slice(-2);
        const year = d.getFullYear();
        return `${day}${month}${year}`;
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

    generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ LIFECYCLE
    // -----------------------------------------------------------------------------------------------------

    constructor(
        private titleService: Title,
        private _crawlService: CrawlService,
        private _userService: UserService,
        private helperService: HelperService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private sanitizer: DomSanitizer,
        private clipboard: Clipboard,
        private dialog: MatDialog,
        private multiAccountService: MultiAccountService,
        private router: Router,
        private route: ActivatedRoute,
        private _fuseConfigService: FuseConfigService,
        private http: HttpClient,
        private _fuseConfirmationService: FuseConfirmationService,
    ) {
        this.titleService.setTitle(`chương trình làm video | ai.type`);

        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            try {
                this.secretKey = this.settings.secretKey
                    ? this.settings.secretKey.split(';')
                    : undefined;
            } catch { }
        }

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                if (user.reputation < 50000) {
                    this.error(
                        'Tài khoản của bạn không đủ điều kiện để truy cập!',
                    );
                    return;
                }
            });
    }

    ngOnInit(): void {
        let settings = this.multiAccountService.getItem('settings');
        if (settings) {
            try {
                if (settings['tts']) {
                    this.SERVER_AUDIO_URL = settings['tts'];
                }
            } catch (e) {
                console.error('Error parsing settings:', e);
            }
        }

        this.route.params.subscribe(async (params: Params) => {
            this.uuid = params['uuid'];
            let name = params['name'];

            this.currentUuid = this.uuid;
            this.currentName = name;

            if (this.uuid) {
                // Đảm bảo IndexedDB đã sẵn sàng
                await this.multiAccountService.isReady;

                // 1. Thử load danh sách Audio Clips từ máy trước
                const hasAudioLocal = this.loadAudiosFromLocal(this.uuid);

                // 2. Nếu không có dữ liệu cũ, mới gọi API detail từ server
                if (!hasAudioLocal) {
                    this.detail(this.uuid, name);
                }

                // 3. Load project video (scenes) nếu có
                this.loadClipsFromLocal(this.uuid);

            } else {
                this.router.navigate(['/tools']);
            }
        });
    }

    ngAfterViewInit(): void {
        this.initWaveSurfer();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
        if (this.wavesurfer) this.wavesurfer.destroy();

        // Hàm này sẽ dọn sạch cả các blob vừa được tạo ra từ playClip (Trường hợp 2)
        this.cleanupBlobs();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message
                ? message
                : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error',
            },
            actions: {
                confirm: { show: true, label: 'Đóng', color: 'warn' },
                cancel: { show: false, label: 'Đóng lại' },
            },
            dismissible: false,
        });
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}
