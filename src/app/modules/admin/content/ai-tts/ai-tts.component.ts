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
import { MyKeysService } from 'app/modules/_services/mykey';

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
    providers: [CrawlService, MyKeysService],
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
    videoProject: any = null; // [MỚI] Biến lưu trữ kịch bản phân cảnh (scenes)
    extraPrompt: string = ''; // [MỚI] Biến lưu trữ prompt người dùng nhập thêm

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
    isCancelled: boolean = false; // Thêm biến này
    myvoices: any = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getMyKeys() {
        this._voice.getMyKeys({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.myvoices = result.data;
                        this.myvoices.map((voice: any) => {
                            if (voice.base === 'ausynclab.io' || voice.base === 'tts.type.vn') {
                                this.voiceList.push({
                                    id: `${voice.id}-${voice.base}`,
                                    name: voice.name
                                });
                            }
                        });
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Tải video thất bại.');
                },
                complete: () => { }
            });
    }

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

    // Hàm hỗ trợ đọc thời lượng file Audio bằng HTML5
    // [MỚI] Hàm lấy thời lượng Audio trực tiếp trên Trình duyệt
    private getAudioDuration(blobUrl: string): Promise<number> {
        return new Promise((resolve) => {
            const audio = new Audio(blobUrl);
            audio.addEventListener('loadedmetadata', () => {
                // Trả về thời lượng dạng giây, làm tròn 2 chữ số thập phân
                resolve(Number(audio.duration.toFixed(2)));
            });
            audio.addEventListener('error', () => {
                console.warn('Không thể đọc duration từ:', blobUrl);
                resolve(0);
            });
        });
    }

    async generateAll() {
        const pendingClips = this.audioList;

        this.isGlobalProcessing = true;
        this.isCancelled = false;
        this.cd.markForCheck();

        // Lấy thông tin voice của clip đầu tiên để quyết định số luồng
        const sampleVoice = pendingClips[0].voice || this.selectedVoice;
        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        const isEdgeVoice = edgeVoices.includes(sampleVoice);
        const isTTSTypeVoice = sampleVoice.indexOf('tts.type.vn') !== -1;

        // Xác định số luồng chạy song song
        const concurrencyLimit = (isEdgeVoice || isTTSTypeVoice) ? 3 : 1;
        this.toastr.info(`Bắt đầu xử lý ${pendingClips.length} mục (Số luồng đồng thời: ${concurrencyLimit})...`, 'System');

        try {
            let currentIndex = 0;

            // Tạo hàm Worker xử lý liên tục
            const worker = async () => {
                while (currentIndex < pendingClips.length) {
                    if (this.isCancelled) {
                        console.log('Tiến trình worker đã dừng do người dùng hủy.');
                        break;
                    }

                    const taskIndex = currentIndex++;
                    const clip = pendingClips[taskIndex];
                    const globalIndex = this.audioList.indexOf(clip); // Lấy vị trí thật trong mảng tổng

                    await this.generateAudio(clip, globalIndex);

                    // Lưu dữ liệu ngay sau khi xong 1 clip
                    this.saveToLocal();
                }
            };

            // Kích hoạt các workers chạy cùng lúc
            const workers = [];
            for (let i = 0; i < concurrencyLimit; i++) {
                workers.push(worker());
            }

            await Promise.all(workers);

            if (!this.isCancelled) {
                this.toastr.success('Đã hoàn tất toàn bộ danh sách!');
            }
        } catch (err) {
            console.error('Concurrency processing error:', err);
            this.toastr.error('Có lỗi xảy ra trong quá trình xử lý liên tục.');
        } finally {
            this.isGlobalProcessing = false;
            this.cd.markForCheck();
        }
    }

    // Tìm đến hàm generateAudio và sửa lại như sau:
    async generateAudio(clip: AudioClip, globalIndex?: number): Promise<void> {
        return new Promise(async (resolve) => {
            if (!clip.description || !clip.description.trim()) {
                this.toastr.warning(`"${clip.name}" không có nội dung text`);
                resolve();
                return;
            }

            if (!(window as any).electron || !(window as any).electron.invoke) {
                this.toastr.error('Cần chạy trên App Desktop (Electron).');
                resolve();
                return;
            }

            clip.isProcessing = true;
            this.cd.markForCheck();

            const username = this.user?.name || 'anonymous';
            const subPath = `${username}/${this.uuid || 'default'}`;

            // Nếu không truyền globalIndex (ví dụ bấm tạo lẻ từng cái), tự tìm index của nó
            const actualIndex = globalIndex !== undefined ? globalIndex : this.audioList.indexOf(clip);
            const prefix = (actualIndex >= 0 ? actualIndex + 1 : 0).toString().padStart(3, '0');
            const slug = this.toSlug(clip.description.substring(0, 50));

            // Lấy thông tin voice của clip
            const clipVoice = clip.voice || this.selectedVoice;
            const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
            const isEdgeVoice = edgeVoices.includes(clipVoice);

            let res: any;

            try {
                if (isEdgeVoice) {
                    const niceFilename = `${prefix}_${slug}`;
                    const payload = {
                        text: clip.description,
                        voice: clipVoice,
                        rate: clip.rate || 1.0,
                        pitch: clip.pitch || 0,
                        filename: niceFilename,
                        username: subPath,
                    };
                    res = await (window as any).electron.invoke('tts-generate', payload);
                } else {
                    const selectedVoiceSplit = clipVoice.split('-');
                    const voice_id = selectedVoiceSplit[0];

                    if (clipVoice.indexOf('tts.type.vn') !== -1) {
                        const niceFilename = `${prefix}_${slug}`;
                        const voiceInfo = this.myvoices.filter((v: any) => (v['id'] === voice_id));

                        if (!voiceInfo || voiceInfo.length === 0) throw new Error("Không tìm thấy thông tin API Key cho giọng đọc này.");

                        const payload = {
                            text: clip.description,
                            voice_id: voiceInfo[0]['id'],
                            key: voiceInfo[0]['api_key'],
                            ref_audio_name: voiceInfo[0]['ref_audio_name'],
                            ref_text: voiceInfo[0]['ref_text'],
                            speed: clip.rate || voiceInfo[0]['speed'] || 1.0,
                            num_step: voiceInfo[0]['num_step'] || 16,
                            filename: niceFilename,
                            username: subPath,
                        };
                        res = await (window as any).electron.invoke('tts-type-generate', payload);
                    } else {
                        const niceFilename = `${prefix}_${slug}_ausync`;
                        const voiceInfo = this.myvoices.filter((v: any) => (v['id'] === voice_id));

                        if (!voiceInfo || voiceInfo.length === 0) throw new Error("Không tìm thấy thông tin API Key cho giọng đọc này.");

                        const payload = {
                            text: clip.description,
                            voice_id: voice_id,
                            key: voiceInfo[0]['api_key'],
                            speed: clip.rate || voiceInfo[0]['speed'] || 1.0,
                            filename: niceFilename,
                            username: subPath,
                        };
                        res = await (window as any).electron.invoke('tts-ausync-generate', payload);
                    }
                }

                // Xử lý kết quả trả về
                if (res && res.success !== false && !res.error) {
                    const rawPath = res.filePath || res.url || res.result;
                    if (rawPath) {
                        clip['localFilePath'] = rawPath;
                        clip.audioFileName = rawPath.split(/[\\/]/).pop();
                        clip.username = subPath;
                        clip.rawUrl = null; // Bắt buộc set null để load lại blob mới
                        clip.isProcessing = false;

                        // Load lại blob để wavesurfer có thể play được
                        await this.loadLocalAudioContent(clip);

                        if (!this.isGlobalProcessing) {
                            this.playClip(clip);
                            this.toastr.success(`Đã tạo: ${clip.audioFileName}`);
                        }
                        this.saveToLocal();
                    }
                } else {
                    const errorMsg = res?.error || 'Lỗi không xác định từ API';
                    this.handleTTSError(clip, errorMsg, resolve);
                    return; // Dừng tại đây, hàm handleTTSError sẽ quyết định gọi resolve sau
                }
            } catch (err: any) {
                console.error(`Lỗi cho clip ${clip.name}:`, err.message);
                this.handleTTSError(clip, err.message, resolve);
                return;
            } finally {
                clip.isProcessing = false;
                this.cd.markForCheck();
                resolve();
            }
        });
    }

    async cancelProcessing() {
        this.isCancelled = true;
        this.toastr.warning('Đang dừng quá trình tạo Audio...');
        try {
            if ((window as any).electron) {
                await (window as any).electron.invoke('cancel-tts');
            }
        } catch (err) { }
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
        const niceFilename = `${prefix}_${slug}`;

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

        const niceFilename = `${prefix}_${slug}`;

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

        // console.error(`Error processing clip ${clip.name}:`, errorMessage);

        // // Mở dialog hỏi người dùng
        // const dialogRef = this._fuseConfirmationService.open({
        //     title: 'Lỗi chuyển đổi',
        //     message: `Không thể tạo audio cho: "<b>${clip.name}</b>"<br>Lỗi: <span class="text-red-500">${errorMessage}</span><br>Bạn có muốn thử lại đoạn này không?`,
        //     icon: {
        //         show: true,
        //         name: 'heroicons_outline:exclamation-circle',
        //         color: 'warn',
        //     },
        //     actions: {
        //         confirm: {
        //             show: true,
        //             label: 'Thử lại ngay',
        //             color: 'primary',
        //         },
        //         cancel: { show: true, label: 'Bỏ qua' },
        //     },
        //     dismissible: false,
        // });

        // dialogRef.afterClosed().subscribe((result) => {
        //     if (result === 'confirmed') {
        //         // Retry: Gọi lại generateAudio
        //         this.generateAudio(clip).then(() => {
        //             if (resolveCallback) resolveCallback();
        //         });
        //     } else {
        //         // Ignore: Resolve để Promise.all tiếp tục chạy các task khác
        //         if (resolveCallback) resolveCallback();
        //     }
        // });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ STORAGE & LEGACY SERVER MERGE
    // -----------------------------------------------------------------------------------------------------
    saveToLocal(currentUuid?: string) {
        // Ưu tiên dùng uuid truyền vào, nếu không thì dùng uuid hiện tại của component
        const targetUuid = currentUuid || this.uuid;
        if (!targetUuid) return;

        // 1. GOM DỮ LIỆU VÀ LƯU AUDIO LIST
        const dataToSave = {
            uuid: targetUuid,
            title: this.projectTitle,
            clips: this.audioList.map((clip) => ({
                id: clip.id,
                name: clip.name,
                description: clip.description,
                voice: clip.voice,
                rate: clip.rate || 1.0,
                pitch: clip.pitch || 0,
                duration: clip.duration,
                audioFileName: clip.audioFileName,
                username: clip.username,
                prompt: clip.prompt,
                localFilePath: clip['localFilePath'] || null,
            })),
        };

        const storageKeyAudio = `${this.STORAGE_AUDIO_KEY}_${targetUuid}`;
        this.multiAccountService.setItem(storageKeyAudio, dataToSave);

        // 2. [MỚI] LƯU VIDEO TIMELINE (SCENES) NẾU CÓ DỮ LIỆU
        if (this.videoProject) {
            const storageKeyVideo = `${this.STORAGE_CLIPS_KEY}_${targetUuid}`;
            this.multiAccountService.setItem(storageKeyVideo, this.videoProject);
        }
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

        const storageKey = `${this.STORAGE_CLIPS_KEY}_${currentUuid}`;
        const videoProject = this.multiAccountService.getItem(storageKey);

        if (videoProject) {
            try {
                // Kiểm tra xem project có dữ liệu scenes thực tế không
                if (videoProject.scenes && videoProject.scenes.length > 0) {
                    this.videoProject = videoProject; // [MỚI] Gán vào biến class

                    const isDialogOpen = this.dialog.openDialogs.some(
                        (d) => d.componentInstance instanceof VideoTimelineDialogComponent
                    );

                    if (!isDialogOpen) {
                        this.openTimelineDialog(this.videoProject);
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

            // Vẫn giữ check cũ để phòng hờ các project cũ chưa có localFilePath
            const isOfflineVoice =
                (item.voice && offlineVoices.includes(item.voice)) ||
                (item.audioFileName &&
                    offlineKeywords.some((k) =>
                        item.audioFileName.includes(k),
                    ));

            if (item.audioFileName) {
                // [CẬP NHẬT TRỌNG TÂM]: Kiểm tra localFilePath ĐẦU TIÊN
                if (item.localFilePath || isOfflineVoice) {

                    // NẾU CÓ localFilePath (C:\...) HOẶC LÀ GIỌNG EDGE TTS 
                    // => ĐÂY LÀ FILE ĐANG NẰM Ở Ổ CỨNG, BẮT BUỘC ĐỌC TỪ LOCAL

                    setTimeout(() => {
                        this.loadLocalAudioContent(item);
                    }, 100);

                } else {
                    // CHỈ KHI NÀO KHÔNG CÓ localFilePath THÌ MỚI GẮN LINK SERVER
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
                ...item,
                file: null,
                url: restoredUrl,
                rawUrl: restoredRawUrl,
                isProcessing: false,
            };
        });

        this.calculateTotalDuration();
        this.syncSettingsFromFirst(); // [MỚI] Tự động đồng bộ cài đặt từ clip đầu tiên
        this.cd.markForCheck();

        // Tự động quét các file ở dưới local để map nếu có sẵn
        setTimeout(() => {
            this.scanAndAttachLocalFiles();
        }, 300);
    }

    // Hàm trung gian: Gọi Electron lấy file -> Biến thành Blob -> Gán vào Clip
    async loadLocalAudioContent(
        clip: AudioClip,
        retryCount = 0,
    ): Promise<boolean> {
        if (!(window as any).electron) return false;

        let filePath = clip['localFilePath'];

        // Nếu clip có rawUrl là blob rồi thì thôi
        if (clip.rawUrl && clip.rawUrl.startsWith('blob:')) return true;

        try {
            const result = await (window as any).electron.invoke(
                'read-local-audio',
                {
                    path: filePath,
                    filename: clip.audioFileName,
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

                // ==========================================
                // [MỚI] ĐO VÀ CẬP NHẬT DURATION NGAY LẬP TỨC
                // ==========================================
                // Luôn cập nhật lại duration với file mới nhất
                clip.duration = await this.getAudioDuration(blobUrl);
                this.calculateTotalDuration(); // Cập nhật ngay tổng thời gian của toàn project
                // ==========================================

                return true;
            } else {
                if (retryCount < 3) {
                    console.warn(`Chưa thấy file, thử lại sau 500ms...`);
                    await new Promise((r) => setTimeout(r, 500));
                    return this.loadLocalAudioContent(clip, retryCount + 1);
                }
            }
        } catch (e) {
            console.error('Lỗi load local file:', e);
        }
        return false;
    }

    async scanAndAttachLocalFiles() {
        if (!(window as any).electron) return;

        let modified = false;
        const baseUsername = this.user?.name || 'anonymous';
        const projectSubPath = `${baseUsername}/${this.uuid || 'default'}`;

        for (let i = 0; i < this.audioList.length; i++) {
            const clip = this.audioList[i];

            // Bỏ qua nếu đã tải hoặc file thực tế
            if (clip['localFilePath'] || clip.file || (clip.rawUrl && clip.rawUrl.startsWith('blob:'))) continue;

            let possibleFilenames = [];
            if (clip.audioFileName) {
                possibleFilenames.push(clip.audioFileName);
            } else if (clip.description && clip.description.trim() !== '') {
                // Tạo guess
                const prefix = (i >= 0 ? i + 1 : 0).toString().padStart(3, '0');
                const shortText = clip.description.substring(0, 50);
                const slug = this.toSlug(shortText);

                possibleFilenames.push(`${prefix}_${slug}.mp3`);
                possibleFilenames.push(`${prefix}_${slug}.wav`);
                possibleFilenames.push(`${prefix}_${slug}_ausync.mp3`);
                possibleFilenames.push(`${prefix}_${slug}_ausync.wav`);
            }

            for (const fname of possibleFilenames) {
                try {
                    const payload = {
                        username: projectSubPath,
                        filename: fname
                    };
                    const result = await (window as any).electron.invoke('check-local-file-exists', payload);

                    if (result && result.exists) {
                        clip['localFilePath'] = result.path;
                        clip.audioFileName = fname;
                        clip.username = projectSubPath;

                        modified = true;

                        // Tiến hành load luôn cho WaveSurfer có blob
                        await this.loadLocalAudioContent(clip);
                        break;
                    }
                } catch (e) { }
            }
        }

        if (modified) {
            this.cd.markForCheck();
            this.saveToLocal();
        }
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
            this.isAnalyzing = false;
            return;
        }

        let geminiKey = this.secretKey[6] || this.secretKey[0];
        this.ai = new GoogleGenAI({ apiKey: geminiKey });

        // Lấy data từ MultiAccountService
        const storageKey = `${this.STORAGE_AUDIO_KEY}_${this.uuid}`;
        const data = this.multiAccountService.getItem(storageKey);

        if (!data || !data.clips) {
            this.toastr.warning('Không tìm thấy dữ liệu âm thanh để phân tích.');
            this.isAnalyzing = false;
            return;
        }

        const allClips = data.clips;

        // Rút gọn format đầu vào để AI dễ đọc
        const continuousText = allClips
            .map((c: any) => `[${c.id} | ${c.duration || 2}s] ${c.description}`)
            .join('\n');

        // Phân tích định dạng yêu cầu từ người dùng
        const defaultFormat = "Video Cinematic chuyên nghiệp";
        const userFormat = this.extraPrompt && this.extraPrompt.trim() !== ''
            ? this.extraPrompt.trim()
            : defaultFormat;

        const userFormatLower = userFormat.toLowerCase();

        // Nhận diện các định dạng đặc thù
        const isComic = userFormatLower.includes('truyện') || userFormatLower.includes('comic') || userFormatLower.includes('manga') || userFormatLower.includes('webtoon');
        const isSlide = userFormatLower.includes('slide') || userFormatLower.includes('trình chiếu') || userFormatLower.includes('thuyết trình') || userFormatLower.includes('powerpoint');
        const isPodcast = userFormatLower.includes('podcast') || userFormatLower.includes('radio') || userFormatLower.includes('kể chuyện audio');

        // Mặc định là Video nếu không thuộc các loại trên
        const isVideo = !isComic && !isSlide && !isPodcast;
        const isVertical = userFormatLower.includes('9:16') || userFormatLower.includes('dọc') || userFormatLower.includes('tiktok') || userFormatLower.includes('shorts') || userFormatLower.includes('reels');

        // Quy đổi tổng thời gian (Chỉ dùng thông báo cho Video)
        const totalSecs = Math.round(this.totalDuration || 0);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const durationString = mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;

        // Khởi tạo các biến điều hướng Prompt
        let maxDurationRule = "";
        let formatInstruction = "";
        let timeConstraintPrompt = "Tôi có một kịch bản thoại chi tiết.";
        let masterPromptDurationLimit = "";

        if (isVideo) {
            // LUẬT KHẮT KHE CHO VIDEO (Để AI render không bị lỗi)
            timeConstraintPrompt = `Tôi có kịch bản thoại với TỔNG THỜI LƯỢNG CHÍNH XÁC: ${durationString} (${totalSecs}s).`;
            masterPromptDurationLimit = `\n               👉 BẮT BUỘC: Ở cuối Master Prompt ghi: "Tổng thời lượng tác phẩm: ${durationString}."`;

            maxDurationRule = `
            - GIỚI HẠN THỜI GIAN: Tối đa 8 GIÂY cho mỗi Phân cảnh.
            - ⚠️ NGOẠI LỆ BẮT BUỘC: Nếu bản thân MỘT đoạn thoại (1 ID) đã có thời lượng dài hơn 8 giây, BẠN PHẢI xếp ID đó đứng một mình trong một scene. TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý CHIA CẮT một ID ra làm nhiều scene.`;

            if (isVertical) {
                formatInstruction = `\n👉 HƯỚNG DẪN CHO VIDEO DỌC (9:16): Mỗi "scene" là một phân cảnh khung hình dọc. Hãy đảm bảo chủ thể luôn được đặt ở trung tâm.`;
            } else {
                formatInstruction = `\n👉 HƯỚNG DẪN CHO VIDEO TĨNH/ĐỘNG: Mỗi "scene" là một góc máy đơn lẻ, tập trung vào một hành động cụ thể.`;
            }
        } else {
            // LUẬT TỰ DO CHO TRUYỆN TRANH, SLIDE, PODCAST
            maxDurationRule = `
            - GOM NHÓM TỰ DO: Gom nhóm các thoại phù hợp với diễn biến câu chuyện, KHÔNG bị giới hạn số giây cho mỗi scene.`;

            if (isComic) {
                if (isVertical) {
                    formatInstruction = `\n👉 HƯỚNG DẪN CHO TRUYỆN TRANH DỌC (WEBTOON 9:16): Mỗi "scene" đại diện cho MỘT TRANG TRUYỆN CUỘN DỌC. Prompt BẮT BUỘC mở đầu: "Một đoạn truyện tranh webtoon cuộn dọc, bố cục chia thành nhiều khung hình (panels) xếp chồng lên nhau, ngăn cách bằng khoảng trắng rõ ràng..."`;
                } else {
                    formatInstruction = `\n👉 HƯỚNG DẪN CHO TRUYỆN TRANH NGANG: Mỗi "scene" đại diện cho MỘT TRANG TRUYỆN. Prompt BẮT BUỘC mở đầu: "Bố cục một trang truyện tranh với nhiều ô truyện, các khung hình được phân chia bằng viền trắng rành mạch..."`;
                }
            } else if (isSlide) {
                formatInstruction = `\n👉 HƯỚNG DẪN CHO SLIDESHOW/TRÌNH CHIẾU: Mỗi "scene" là MỘT SLIDE ẢNH. Chừa khoảng trống (không gian âm) tinh tế để chèn chữ.`;
            } else if (isPodcast) {
                formatInstruction = `\n👉 HƯỚNG DẪN CHO PODCAST/RADIO: Mỗi "scene" đại diện cho một bối cảnh. CÁC SCENE LIÊN TIẾP PHẢI MIÊU TẢ CÙNG MỘT BỐI CẢNH TĨNH LẶNG nhưng thay đổi nhẹ góc máy để tạo chiều sâu.`;
            }
        }

        const antiDuplicationRule = `
            - 🚫 CHỐNG TRÙNG LẶP: Mỗi ID thoại CHỈ ĐƯỢC XUẤT HIỆN ĐÚNG 1 LẦN DUY NHẤT trong toàn bộ JSON trả về.`;

        // PROMPT TỔNG LỰC GỬI CHO GEMINI
        const promptText = `
            BẠN LÀ GIÁM ĐỐC SÁNG TẠO ĐA PHƯƠNG TIỆN XUẤT SẮC. 
            ${timeConstraintPrompt}

            🎯 ĐỊNH DẠNG TÁC PHẨM YÊU CẦU: "${userFormat}"${formatInstruction}

            🌍 QUY TẮC NGÔN NGỮ BẮT BUỘC:
            - SỬ DỤNG 100% TIẾNG VIỆT cho toàn bộ kết quả trả về.
            - TUYỆT ĐỐI KHÔNG chèn tiếng Anh vào mô tả.

            NHIỆM VỤ CỦA BẠN:
            1. Sáng tạo MASTER PROMPT: Viết prompt định hướng hình ảnh chung. Định hình rõ phong cách chia khung (nếu là truyện tranh). ${masterPromptDurationLimit}
            2. Xây dựng TẠO HÌNH (CHARACTER DESIGN): Mô tả NHẤT QUÁN và CỐ ĐỊNH về ngoại hình nhân vật (tuổi, tóc, trang phục đặc trưng).
            3. CHIA PHÂN CẢNH: Gom nhóm các câu thoại.

            QUY TẮC BẮT BUỘC (QUAN TRỌNG NHẤT):${maxDurationRule}${antiDuplicationRule}
            - 👤 BẢO TOÀN NHÂN VẬT: Trong "prompt" từng scene, khi nhân vật xuất hiện, BẮT BUỘC PHẢI CHÈN LẠI mô tả ngoại hình đặc trưng của họ.
            - 🖼️ BẢO TOÀN KHUNG TRUYỆN: (Nếu là truyện tranh) BẮT BUỘC nhắc lại quy cách khung viền thống nhất ở mọi trang.
            - 🚫 TUYỆT ĐỐI KHÔNG CÓ CHỮ (NO TEXT): Không yêu cầu có chữ viết, bảng hiệu, logo trong hình. Hình ảnh phải hoàn toàn sạch.
            - GIỮ NGUYÊN THỨ TỰ thoại, không bỏ sót ID nào.

            DỮ LIỆU ĐẦU VÀO:
            ${continuousText}

            KẾT QUẢ TRẢ VỀ DUY NHẤT LÀ JSON OBJECT NÀY:
            {
              "masterPrompt": "Viết Master Prompt chi tiết bằng Tiếng Việt...",
              "characters": [
                {
                  "role": "Tên/Vai trò",
                  "personality": "Mô tả chi tiết và cố định bằng Tiếng Việt..."
                }
              ],
              "scenes": [
                {
                  "prompt": "Mô tả chi tiết hình ảnh bằng Tiếng Việt (Chứa mô tả nhân vật và khung viền nếu có)...",
                  "subtitleIds": ["id1", "id2"]
                }
              ]
            }
        `;

        try {
            let retries = 3;
            let delay = 2000;
            let response = null;

            for (let i = 0; i < retries; i++) {
                try {
                    response = await this.ai.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: promptText,
                    });
                    break;
                } catch (apiError: any) {
                    const isOverloaded = apiError?.message?.includes('503') || apiError?.status === 503;
                    if (isOverloaded && i < retries - 1) {
                        this.toastr.info(`AI đang bận, tự động thử lại lần ${i + 1}...`, 'Hệ thống');
                        await new Promise(r => setTimeout(r, delay));
                        delay *= 2;
                    } else {
                        throw apiError;
                    }
                }
            }

            if (!response) throw new Error("Không nhận được phản hồi từ AI.");

            const aiResponse = this.helperService.safeJsonParseFromAI(response.text);
            const aiResponseScenes = aiResponse.scenes || [];

            const finalScenes = aiResponseScenes.map((scene: any) => {
                let exactSceneDuration = 0;

                const mappedSubtitles = scene.subtitleIds.map((id: string) => {
                    const originalClip = allClips.find((c: any) => c.id === id);
                    let safeAudioUrl = null;
                    let clipDuration = 0;

                    if (originalClip) {
                        clipDuration = originalClip.duration || 0;
                        exactSceneDuration += clipDuration;

                        if (originalClip.localFilePath) {
                            const safePath = originalClip.localFilePath.replace(/\\/g, '/');
                            safeAudioUrl = safePath.startsWith('/') ? `file://${safePath}` : `file:///${safePath}`;
                        }
                    }

                    return {
                        id: id,
                        text: originalClip ? originalClip.description : "",
                        duration: clipDuration,
                        audioUrl: safeAudioUrl
                    };
                });

                const roundedDuration = Math.round(exactSceneDuration * 10) / 10;

                // [XỬ LÝ HẬU KỲ PROMPT]: Gắn cứng thần chú cấm chữ và ép khung truyện bằng tiếng Anh
                let finalScenePrompt = scene.prompt.trim();

                let constraintStr = "completely textless, no text, no watermark, no signature, clean background";
                if (isComic) {
                    constraintStr += ", distinct comic panel layout, clear white gutters, split frames, strict panel borders";
                }

                finalScenePrompt += `\n\n(Constraints: ${constraintStr})`;

                // Chỉ gắn thời lượng chính xác nếu định dạng là VIDEO
                if (isVideo) {
                    finalScenePrompt += `\n[BẮT BUỘC: Tạo video có độ dài chính xác ${roundedDuration} giây]`;
                }

                return {
                    prompt: finalScenePrompt,
                    imageUrl: null,
                    subtitles: mappedSubtitles
                };
            });

            this.videoProject = {
                uuid: data.uuid,
                title: data.title,
                masterPrompt: aiResponse.masterPrompt || "",
                characters: aiResponse.characters || [],
                totalOriginalClips: allClips.length,
                totalScenes: finalScenes.length,
                scenes: finalScenes,
            };

            this.saveToLocal();
            this.openTimelineDialog(this.videoProject);
            this.toastr.success(`Đã tối ưu thành ${finalScenes.length} phân cảnh!`);

        } catch (error) {
            console.error('Lỗi logic gom nhóm:', error);
            this.toastr.error('Hệ thống AI hiện đang quá tải. Vui lòng thử lại sau.');
        } finally {
            this.isAnalyzing = false;
            this.cd.markForCheck();
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
            width: '95%', // Lấy 95% chiều rộng của left-pane (được giới hạn bởi overlay container)
            maxHeight: '95vh', // Tăng thêm một chút chiều cao 
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

    // [CẬP NHẬT] Hàm Clear - Làm mới thông minh (Chỉ cập nhật text, giữ nguyên Audio)
    clear() {
        this.toastr.info(
            'Đang đồng bộ lại văn bản từ Server, giữ nguyên Audio cũ...',
            'Làm mới thông minh',
        );

        // Gọi detail với tham số thứ 3 báo hiệu đây là Reload
        this.detail(this.currentUuid, this.currentName || '', true);
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
     * Đồng bộ cấu hình từ dòng đầu tiên (clip 0) cho tất cả các clip khác
     */
    syncSettingsFromFirst(): void {
        if (!this.audioList || this.audioList.length <= 1) return;

        const firstClip = this.audioList[0];
        const voice = firstClip.voice;
        const rate = firstClip.rate;
        const pitch = firstClip.pitch;

        let count = 0;
        for (let i = 1; i < this.audioList.length; i++) {
            const clip = this.audioList[i];
            if (!clip.file) { // Chỉ áp dụng cho clip text
                if (voice) clip.voice = voice;
                if (rate !== undefined) clip.rate = rate;
                if (pitch !== undefined) clip.pitch = pitch;
                count++;
            }
        }

        if (count > 0) {
            this.saveToLocal(); // Lưu vào IndexedDB ngay
            this.toastr.success(`Đã đồng bộ cấu hình xuống ${count} clips thành công!`);
            this.cd.markForCheck();
        }
    }

    detail(uuid: string, name: string, isReload: boolean = false) {
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

                        // Lưu lại danh sách cũ để đối chiếu
                        const oldAudioList = this.audioList || [];

                        this.audioList = result.data.done.map(
                            (htmlItem: any, index: number) => {
                                const cleanText = this.removeHTML.transform(htmlItem);
                                const shortName = cleanText.length > 50
                                    ? cleanText.substring(0, 50) + '...'
                                    : cleanText;

                                // Nếu đang Reload VÀ vị trí này đã có clip cũ -> Giữ nguyên file, đắp text mới
                                if (isReload && index < oldAudioList.length) {
                                    const oldClip = oldAudioList[index];
                                    return {
                                        ...oldClip,             // Giữ nguyên url, audioFileName, duration, ID, voice...
                                        description: cleanText, // Ghi đè text thoại mới
                                        name: shortName         // Ghi đè tiêu đề mới
                                    };
                                }

                                // Nếu tạo mới (hoặc đoạn văn mới được thêm vào từ Server)
                                return {
                                    id: this.generateId(),
                                    name: shortName,
                                    duration: 0,
                                    description: cleanText,
                                    isProcessing: false,
                                    voice: 'vi-VN-NamMinhNeural',
                                    rate: 1.0,
                                    pitch: 0,
                                    prompt: '',
                                };
                            },
                        );

                        this.calculateTotalDuration();
                        this.syncSettingsFromFirst(); // [MỚI] Tự động đồng bộ cài đặt từ clip đầu tiên

                        // Lưu đè lại Storage (Lúc này Storage đã chứa Text mới + Link Audio cũ)
                        this.saveToLocal(uuid);
                        this.cd.markForCheck();

                        if (isReload) {
                            this.toastr.success('Đã cập nhật văn bản mới thành công!');
                        }
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
        private _voice: MyKeysService,
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
                this.getMyKeys();

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
