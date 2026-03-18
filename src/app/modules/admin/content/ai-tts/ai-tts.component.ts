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
import { BlogService } from 'app/modules/_services/blog';
import { RemoveHTMLPipe } from 'app/app.pipe';
import { Clipboard } from '@angular/cdk/clipboard';
import { GoogleGenAI } from '@google/genai';
import { HttpResponse, HttpClient } from '@angular/common/http';
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
    prompt?: string;
}

@Component({
    selector: 'ai-tts',
    styleUrls: ['./ai-tts.component.scss'],
    templateUrl: './ai-tts.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [CrawlService, BlogService],
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
        { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Neural - Offline)' },
        { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Neural - Offline)' },
        // { id: 'nam-calm', name: 'Nam điềm tĩnh (Server)' },
        // { id: 'nam-cham', name: 'Nam chậm (Server)' },
        // { id: 'nam-nhanh', name: 'Nam nhanh (Server)' },
        // { id: 'nam-truyen-cam', name: 'Nam truyền cảm (Server)' },
        // { id: 'nu-calm', name: 'Nữ điềm tĩnh (Server)' },
        // { id: 'nu-cham', name: 'Nữ chậm (Server)' },
        // { id: 'nu-luu-loat', name: 'Nữ lưu loát (Server)' },
        // { id: 'nu-nhe-nhang', name: 'Nữ nhẹ nhàng (Server)' }
    ];

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
        this.toastr.info(
            `Bắt đầu xử lý song song ${pendingClips.length} mục...`,
            'System',
        );

        // [SONG SONG] Tạo mảng các Promises để chạy cùng lúc
        const tasks = pendingClips.map((clip) => this.generateAudio(clip));

        try {
            // Đợi tất cả chạy xong
            await Promise.all(tasks);
            this.toastr.success('Đã hoàn tất quá trình xử lý!');
        } catch (err) {
            console.error('Batch error:', err);
        } finally {
            this.isGlobalProcessing = false;
            this.cd.markForCheck();
        }
    }

    async generateAudio(clip: AudioClip): Promise<void> {
        if (!clip.description || !clip.description.trim()) {
            this.toastr.warning(`"${clip.name}" không có nội dung text`);
            return Promise.resolve();
        }

        // Ưu tiên Edge TTS Offline
        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        if (clip.voice && edgeVoices.includes(clip.voice)) {
            return this.generateEdgeTTSLocal(clip);
        }

        // Fallback: XTTS Server
        return new Promise((resolve) => {
            clip.isProcessing = true;
            this.cd.markForCheck();

            const payload = {
                tts_text: clip.description.split(/\r?\n|\r|\n/g),
                speaker_audio: `${clip.voice || 'nam-calm'}.wav`,
                language: 'vi',
                normalize_text: true,
                use_filter: false,
                output_sr: 48000,
                crossfade_ms: 30,
                concurrency: 2,
                join_silence_ms: 800,
                flat: true,
                username: this.user.name || 'anonymous',
            };

            this._blogService
                .text2speech3(payload)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res: any) => {
                        if (res?.job_id) {
                            this.pollJobUntilDone(res.job_id, clip, resolve);
                        } else {
                            this.handleTTSError(
                                clip,
                                'Không nhận được job từ server.',
                                resolve,
                            );
                        }
                    },
                    error: (err) => {
                        this.handleTTSError(
                            clip,
                            'Lỗi kết nối server API.',
                            resolve,
                        );
                    },
                });
        });
    }

    async generateEdgeTTSLocal(clip: AudioClip): Promise<void> {
        if (!(window as any).electron || !(window as any).electron.invoke) {
            this.toastr.error('Cần chạy trên App Desktop (Electron).');
            return;
        }

        clip.isProcessing = true;
        this.cd.markForCheck();

        // ... (Giữ nguyên đoạn tạo payload date/username/filename cũ của bạn) ...
        const dateFolder = this.getDateStr();
        const username = this.user?.name || 'anonymous';
        const subPath = `${username}/${dateFolder}/${this.uuid || 'default'}`;
        const index = this.audioList.indexOf(clip);
        const prefix = (index >= 0 ? index + 1 : 0).toString().padStart(3, '0');
        const shortText = clip.description.substring(0, 50);
        const slug = this.toSlug(shortText);
        const niceFilename = `${prefix}_${slug}_${clip.voice}`;

        const payload = {
            text: clip.description,
            voice: clip.voice,
            filename: niceFilename,
            username: subPath,
        };

        try {
            const res = await (window as any).electron.invoke(
                'tts-generate',
                payload,
            );

            if (res && res.success) {
                const filename = res.filePath
                    ? res.filePath.split(/[\\/]/).pop()
                    : `${payload.filename}.mp3`;

                clip.audioFileName = filename;
                clip.username = subPath;
                clip['localFilePath'] = res.filePath; // Lưu đường dẫn gốc

                // [QUAN TRỌNG] Reset rawUrl về null để ép hàm load chạy
                clip.rawUrl = null;
                clip.isProcessing = false;

                // Gọi hàm load ngay lập tức để chuyển file vừa tạo thành Blob
                await this.loadLocalAudioContent(clip);

                // Nếu không phải đang chạy hàng loạt thì Play luôn cho ngầu
                if (!this.isGlobalProcessing) {
                    this.playClip(clip);
                }

                this.saveToLocal();
                this.toastr.success(`Đã tạo: ${filename}`);
            } else {
                this.handleTTSError(
                    clip,
                    res.error || 'Lỗi tạo giọng đọc (Unknown).',
                );
            }
        } catch (err: any) {
            console.error(err);
            this.handleTTSError(clip, 'Lỗi Electron: ' + err.message);
        } finally {
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

    private pollJobUntilDone(
        jobId: string,
        clip: AudioClip,
        resolveCallback?: () => void,
    ) {
        const polling$ = interval(3000).pipe(
            switchMap(() => this._blogService.getJobStatus(jobId)),
            switchMap(async (resp: any) => {
                const httpResp = resp as HttpResponse<Blob>;
                const headers = httpResp.headers;
                const body = httpResp.body as Blob;
                const contentType =
                    headers.get('content-type') || body.type || '';
                if (contentType.startsWith('audio/')) {
                    let filename = '';
                    const cd = headers.get('content-disposition') || '';
                    const match = /filename="?([^"]+)"?/i.exec(cd);
                    if (match && match[1]) filename = match[1];
                    if (!filename) filename = `${jobId}.wav`;
                    return { done: true, blob: body, filename: filename };
                }
                const text = await body.text();
                try {
                    const json = JSON.parse(text);
                    if (json.status === 'failed')
                        throw new Error(
                            json.error || 'Server processing failed',
                        );
                } catch (e) {
                    if (e instanceof Error && e.message.includes('failed'))
                        throw e;
                }
                return { done: false, blob: null, filename: '' };
            }),
            filter((res) => res.done),
            take(1),
        );

        polling$.pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                const blob = res.blob as Blob;
                const objectUrl = URL.createObjectURL(blob);

                clip.rawUrl = objectUrl;
                clip.url = this.sanitizer.bypassSecurityTrustUrl(objectUrl);
                clip.audioFileName = res.filename;
                clip.username = this.user.name || 'anonymous';
                clip.isProcessing = false;

                if (!this.isGlobalProcessing) this.playClip(clip);

                this.saveToLocal();
                this.cd.markForCheck();
                if (resolveCallback) resolveCallback();
            },
            error: (err) => {
                this.handleTTSError(
                    clip,
                    err.message || 'Lỗi khi chờ kết quả từ Server.',
                    resolveCallback,
                );
            },
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ STORAGE & LEGACY SERVER MERGE
    // -----------------------------------------------------------------------------------------------------
    saveToLocal(currentUuid?: string) {
        let savedUuid = currentUuid;
        if (!savedUuid) {
            const oldData = localStorage.getItem(this.STORAGE_AUDIO_KEY);
            if (oldData) {
                try {
                    savedUuid = JSON.parse(oldData).uuid;
                } catch {}
            }
        }

        const dataToSave = {
            uuid: savedUuid,
            title: this.projectTitle,
            clips: this.audioList.map((clip) => ({
                // LƯU ĐẦY ĐỦ CÁC TRƯỜNG QUAN TRỌNG:
                id: clip.id,
                name: clip.name,
                description: clip.description, // <--- QUAN TRỌNG: Nội dung text để đọc
                voice: clip.voice,
                duration: clip.duration,
                audioFileName: clip.audioFileName,
                username: clip.username,
                prompt: clip.prompt,

                // Trường mở rộng cho tính năng Offline:
                localFilePath: clip['localFilePath'] || null,
            })),
        };
        localStorage.setItem(
            this.STORAGE_AUDIO_KEY,
            JSON.stringify(dataToSave),
        );
    }

    loadAudiosFromLocal(currentUuid?: string): boolean {
        const data = localStorage.getItem(this.STORAGE_AUDIO_KEY);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (currentUuid && parsed.uuid !== currentUuid) return false;

                if (parsed.title) {
                    this.projectTitle = parsed.title;
                }

                if (parsed.uuid) {
                    this.uuid = parsed.uuid;
                }

                const clips = parsed.clips || parsed;
                if (Array.isArray(clips) && clips.length > 0) {
                    this.restoreClips(clips);
                    return true;
                }
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    loadClipsFromLocal(currentUuid?: string): boolean {
        const data = localStorage.getItem(this.STORAGE_CLIPS_KEY);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (currentUuid && parsed.uuid !== currentUuid) return false;

                if (parsed.uuid) {
                    this.uuid = parsed.uuid;
                }

                this.checkAndOpenVideoTimeline(data);
            } catch (e) {
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

        // 2. Lấy 138 items từ LocalStorage
        const mergerDataRaw = localStorage.getItem('ai_type_audio_merger_data');
        if (!mergerDataRaw) return;
        const data = JSON.parse(mergerDataRaw);
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
            - "prompt": 1 mô tả hình ảnh tiếng Việt.
            - "subtitles": Mảng chứa các object { "id": "ID_GỐC", "text": "NỘI DUNG" }.
            2. Logic gom nhóm: Những đoạn văn bản có nội dung liền mạch hoặc ngắn thì gom chung vào 1 "prompt" ảnh.
            3. KHÔNG ĐƯỢC bỏ sót bất kỳ ID nào. Phải đảm bảo đủ 138 text gốc.

            DỮ LIỆU ĐẦU VÀO:
            ${continuousText}

            TRẢ VỀ DUY NHẤT JSON ARRAY trong tag \`\`\`json ... \`\`\`:
            [
            {
                "prompt": "Mô tả hình ảnh cho nhóm này",
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

            localStorage.setItem(
                this.STORAGE_CLIPS_KEY,
                JSON.stringify(videoProject),
            );

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
                } catch (e) {}
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
        this.cleanupBlobs(); // Xóa RAM

        // Trường hợp 1: Nếu đang có danh sách Text -> Chỉ xóa trạng thái Audio (Soft Reset)
        if (this.audioList.length > 0) {
            this.audioList.forEach((clip) => {
                clip.url = undefined;
                clip.rawUrl = undefined;
                clip.file = undefined;
                clip.audioFileName = undefined;
                clip.isProcessing = false;
                clip.duration = 0;
            });
            this.calculateTotalDuration();
            this.saveToLocal();
            this.cd.markForCheck();
            this.toastr.success('Đã xóa Audio, giữ lại danh sách văn bản.');
        }
        // Trường hợp 2: Nếu danh sách trống và đang ở trong project (có UUID) -> Reload lại từ đầu (Hard Reload)
        else if (this.currentUuid) {
            this.toastr.info(
                'Đang tải lại dữ liệu gốc từ Server...',
                'Làm mới',
            );
            localStorage.removeItem(this.STORAGE_AUDIO_KEY);
            this.detail(this.currentUuid, this.currentName || '');
        } else {
            // Trường hợp 3: Không có gì cả -> Xóa sạch
            this.audioList = [];
            this.totalDuration = 0;
            localStorage.removeItem(this.STORAGE_AUDIO_KEY);
            this.toastr.info('Đã làm mới.');
        }
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
        } catch (err) {}
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
        private _blogService: BlogService,
        private _userService: UserService,
        private helperService: HelperService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private sanitizer: DomSanitizer,
        private _fuseConfirmationService: FuseConfirmationService,
        private clipboard: Clipboard,
        private dialog: MatDialog,
        private multiAccountService: MultiAccountService,
        private router: Router,
        private route: ActivatedRoute,
        private _fuseConfigService: FuseConfigService,
        private http: HttpClient,
    ) {
        this.titleService.setTitle(`chương trình làm video | ai.type`);

        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            try {
                this.secretKey = this.settings.secretKey
                    ? this.settings.secretKey.split(';')
                    : undefined;
            } catch {}
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

        this.route.params.subscribe((params: Params) => {
            this.uuid = params['uuid'];
            let name = params['name'];

            // [CẬP NHẬT] Lưu params để dùng cho hàm Clear (Reload)
            this.currentUuid = this.uuid;
            this.currentName = name;

            if (this.uuid) {
                // const hasAudioLocalData = this.loadAudioFromLocal(this.uuid);
                // if (!hasAudioLocalData)
                this.detail(this.uuid, name);
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
