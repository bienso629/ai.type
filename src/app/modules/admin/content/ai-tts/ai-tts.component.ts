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
import { filter, interval, Subject, switchMap, take, takeUntil, debounceTime } from 'rxjs';
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

import { HttpClient } from '@angular/common/http';
import WaveSurfer from 'wavesurfer.js';
import { MatDialog } from '@angular/material/dialog';
import { VideoTimelineDialogComponent } from './tools/video-timeline-dialog.component';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GenaiService } from 'app/genai.service';
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
    localFilePath?: string | null;
    isEditing?: boolean;
    tempDescription?: string;
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
    videoFormat: string = 'video'; // Biến lưu định dạng tác phẩm
    aspectRatio: string = '16:9'; // [MỚI] Tỉ lệ khung hình
    maxDuration: number = 8; // [MỚI] Thời lượng mặc định của mỗi cảnh
    attachedVideoFiles: { file: File, base64: string, mimeType: string }[] = [];

    // [MỚI] Lưu lại params để dùng cho tính năng "Làm mới" (Reload)
    currentUuid: string | null = null;
    currentName: string | null = null;
    originalArchiveData: any = null; // [MỚI] Lưu lại toàn bộ dữ liệu gốc từ Server

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
    private saveSubject = new Subject<string | undefined>();

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
            audio.onloadedmetadata = () => {
                // Trả về thời lượng dạng giây, làm tròn 2 chữ số thập phân
                resolve(Number(audio.duration.toFixed(2)));
                audio.removeAttribute('src');
            };
            audio.onerror = () => {
                console.warn('Không thể đọc duration từ:', blobUrl);
                resolve(0);
                audio.removeAttribute('src');
            };
        });
    }

    async generateAll() {
        const pendingClips = this.audioList;

        this.isGlobalProcessing = true;
        this.isCancelled = false;
        this.cd.markForCheck();

        // Kiểm tra xem có clip nào dùng giọng khác Nam Minh và Hoài My không
        const fastVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        const hasSlowVoice = pendingClips.some(clip => !fastVoices.includes(clip.voice));

        // Đặt giới hạn luồng = 3 cho Nam Minh/Hoài My, các giọng khác (như OmniVoice) = 1
        const concurrencyLimit = hasSlowVoice ? 1 : 3;
        this.toastr.info(`Bắt đầu xử lý ${pendingClips.length} mục (Chạy song song ${concurrencyLimit} mục cùng lúc)...`, 'System');

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
                this.update(); // Tự động lưu lên server sau khi tạo xong
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
                const fileSuffix = this.uuid;
                if (isEdgeVoice) {
                    const niceFilename = `${prefix}_${slug}_${fileSuffix}`;
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
                        const niceFilename = `${prefix}_${slug}_${fileSuffix}`;
                        const voiceInfo = this.myvoices.filter((v: any) => (v['id'] === voice_id));

                        if (!voiceInfo || voiceInfo.length === 0) throw new Error("Không tìm thấy thông tin API Key cho giọng đọc này.");

                        // Xử lý text để tránh lỗi ở backend khi câu quá ngắn bị cắt nhỏ thêm
                        let safeText = clip.description;
                        if (safeText.length < 150) {
                            safeText = safeText.replace(/[.!?\n]+/g, ', ');
                            safeText = safeText.replace(/,\s*$/, '').trim();
                        }

                        const payload = {
                            text: safeText,
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
                        const niceFilename = `${prefix}_${slug}_ausync_${fileSuffix}`;
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
                            this.update(); // Tự động lưu lên server
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
                this.toastr.info(`Đang tạo audio cho: ${clip.name}...`);
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

    private handleTTSError(
        clip: AudioClip,
        errorMessage: string,
        resolveCallback?: () => void,
    ) {
        clip.isProcessing = false;

        // Reset properties to ensure it doesn't look like it's done if it failed
        clip.localFilePath = null;
        clip.audioFileName = null;
        clip.url = null;
        clip.rawUrl = null;
        clip.duration = 0;

        this.calculateTotalDuration();
        this.cd.markForCheck();

        // Hiển thị thông báo lỗi lên góc phải màn hình cho người dùng biết
        this.toastr.error(`Lỗi khi tạo "${clip.name}": ${errorMessage}`, 'Thất bại');

        if (resolveCallback) resolveCallback();

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
    onInputChanged() {
        this.saveSubject.next(undefined);
    }

    saveToLocal(currentUuid?: string) {
        // Ưu tiên dùng uuid truyền vào, nếu không thì dùng uuid hiện tại của component
        const targetUuid = currentUuid || this.uuid;
        if (!targetUuid) return;

        // 1. GOM DỮ LIỆU VÀ LƯU AUDIO LIST
        const dataToSave = {
            uuid: targetUuid,
            title: this.projectTitle,
            extraPrompt: this.extraPrompt,
            videoFormat: this.videoFormat,
            aspectRatio: this.aspectRatio,
            maxDuration: this.maxDuration,
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
            this.videoProject.aspectRatio = this.aspectRatio || '16:9';
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

                if (parsed.extraPrompt !== undefined) {
                    this.extraPrompt = parsed.extraPrompt;
                }

                if (parsed.videoFormat !== undefined) {
                    this.videoFormat = parsed.videoFormat;
                }

                if (parsed.aspectRatio !== undefined) {
                    this.aspectRatio = parsed.aspectRatio;
                }

                if (parsed.maxDuration !== undefined) {
                    this.maxDuration = parsed.maxDuration;
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
        this.audioList = clips.map((item: any) => {
            if (item.description) {
                const doc = new DOMParser().parseFromString(item.description, 'text/html');
                item.description = doc.documentElement.textContent || item.description;
            }
            if (item.name) {
                const doc = new DOMParser().parseFromString(item.name, 'text/html');
                item.name = doc.documentElement.textContent || item.name;
            }

            let restoredUrl = null;
            let restoredRawUrl = null;

            const offlineVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
            const offlineKeywords = ['ausync', 'tts.type.vn'];
            const isOfflineVoice =
                (item.voice && offlineVoices.includes(item.voice)) ||
                (item.voice && offlineKeywords.some((k) => item.voice.includes(k))) ||
                (item.audioFileName &&
                    offlineKeywords.some((k) =>
                        item.audioFileName.includes(k),
                    ));

            // Khởi tạo đối tượng mới trước để có thể truyền vào loadLocalAudioContent
            const newItem = {
                ...item,
                file: null,
                url: null,
                rawUrl: null,
                isProcessing: false,
            };

            if (item.audioFileName) {
                // [CẬP NHẬT TRỌNG TÂM]: Kiểm tra localFilePath ĐẦU TIÊN
                if (item.localFilePath || isOfflineVoice) {

                    // NẾU CÓ localFilePath (C:\...) HOẶC LÀ GIỌNG EDGE TTS 
                    // => ĐÂY LÀ FILE ĐANG NẰM Ở Ổ CỨNG, BẮT BUỘC ĐỌC TỪ LOCAL

                    setTimeout(() => {
                        this.loadLocalAudioContent(newItem);
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

    // Hàm trung gian: Kiểm tra file tồn tại trên ổ cứng -> Gán trực tiếp file:/// protocol vào Clip

    async loadLocalAudioContent(
        clip: AudioClip,
        retryCount = 0,
    ): Promise<boolean> {
        if (!(window as any).electron) return false;

        let filePath = clip['localFilePath'];
        if (!filePath) return false;

        try {
            // Kiểm tra xem tệp tin cục bộ có thực sự tồn tại trên ổ cứng hay không
            const result = await (window as any).electron.invoke(
                'check-local-file-exists',
                {
                    path: filePath,
                    filename: clip.audioFileName,
                    username: this.user?.name || 'admin',
                    targetUuid: this.uuid
                },
            );

            if (result && result.exists) {
                // Luôn sử dụng absolute path trả về từ backend (result.path)
                let cleanPath = result.path.replace(/\\/g, '/');
                if (cleanPath.startsWith('file:///')) {
                    cleanPath = cleanPath.slice(8);
                } else if (cleanPath.startsWith('file://')) {
                    cleanPath = cleanPath.slice(7);
                }

                // Dùng protocol media:// để không bị Chromium chặn
                const fileUrl = cleanPath.startsWith('/') ? `media://${cleanPath}` : `media:///${cleanPath}`;

                // Nếu clip đã được gán đúng URL này rồi, không cần gán lại hay đo lại duration (tránh nhấp nháy WaveSurfer)
                if (clip.rawUrl === fileUrl) {
                    return true;
                }

                clip.rawUrl = fileUrl;
                clip.url = this.sanitizer.bypassSecurityTrustUrl(fileUrl);

                // ==========================================
                // [MỚI] ĐO VÀ CẬP NHẬT DURATION NGAY LẬP TỨC
                // ==========================================
                // Luôn cập nhật lại duration với file mới nhất từ ổ cứng
                clip.duration = await this.getAudioDuration(fileUrl);
                this.calculateTotalDuration(); // Cập nhật ngay tổng thời gian của toàn project
                this.cd.markForCheck();
                // ==========================================

                return true;
            } else {
                if (retryCount < 3) {
                    console.warn(`Chưa thấy file, thử lại sau 500ms...`);
                    await new Promise((r) => setTimeout(r, 500));
                    return this.loadLocalAudioContent(clip, retryCount + 1);
                } else {
                    // Báo lỗi cho người dùng và reset trạng thái file để có thể tạo lại
                    clip['localFilePath'] = null;
                    clip.audioFileName = null;
                    clip.url = null;
                    clip.rawUrl = null;
                    clip.duration = 0;
                    if (this.wavesurfer) {
                        this.wavesurfer.empty();
                    }
                    this.calculateTotalDuration();
                    this.cd.markForCheck();
                    this.saveToLocal(); // [QUAN TRỌNG] Lưu lại trạng thái vào local để không bị lặp lại lỗi khi F5
                    this.toastr.warning(`File audio của đoạn "${clip.name}" không tồn tại trên máy. Vui lòng tạo lại!`, 'Lỗi File');
                }
            }
        } catch (e) {
            console.error('Lỗi load local file:', e);
            if (retryCount < 3) {
                console.warn(`Lỗi đọc file, thử lại sau 500ms...`);
                await new Promise((r) => setTimeout(r, 500));
                return this.loadLocalAudioContent(clip, retryCount + 1);
            } else {
                // Xử lý lỗi catch tương tự để người dùng biết
                clip['localFilePath'] = null;
                clip.audioFileName = null;
                clip.url = null;
                clip.rawUrl = null;
                clip.duration = 0;
                if (this.wavesurfer) {
                    this.wavesurfer.empty();
                }
                this.calculateTotalDuration();
                this.cd.markForCheck();
                this.saveToLocal(); // [QUAN TRỌNG] Lưu lại trạng thái vào local
                this.toastr.warning(`File audio của đoạn "${clip.name}" bị lỗi hoặc không tồn tại.`, 'Lỗi File');
            }
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
                        clip['localFilePath'] = fname; // Chỉ lưu basename
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

    onVideoAttachmentSelected(event: any) {
        const files: FileList = event.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = () => {
                const base64String = (reader.result as string).split(',')[1];
                this.attachedVideoFiles.push({
                    file: file,
                    base64: base64String,
                    mimeType: file.type
                });
            };
            reader.readAsDataURL(file);
        }
        this.toastr.success(`Đã đính kèm ${files.length} tệp tài liệu.`, 'Thành công');
        event.target.value = ''; // Reset input
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

        // let geminiKey = this.secretKey[6] || this.secretKey[0];
        // this.ai = new GoogleGenAI({ apiKey: geminiKey });

        // Lấy data từ MultiAccountService
        const storageKey = `${this.STORAGE_AUDIO_KEY}_${this.uuid}`;
        const data = this.multiAccountService.getItem(storageKey);

        if (!data || !data.clips) {
            this.toastr.warning('Không tìm thấy dữ liệu âm thanh để phân tích.');
            this.isAnalyzing = false;
            return;
        }

        const allClips = data.clips;

        // KIỂM TRA FILE TRÊN Ổ CỨNG TRƯỚC KHI TIẾN HÀNH
        for (const clip of allClips) {
            if (clip.localFilePath) {
                try {
                    const result = await (window as any).electron.invoke('check-local-file-exists', { path: clip.localFilePath });
                    if (!result || !result.exists) {
                        clip.localFilePath = null;
                    }
                } catch (e) {
                    clip.localFilePath = null;
                }
            }
        }

        let hasMissingAudio = false;
        for (const clip of allClips) {
            if (!clip.localFilePath) {
                hasMissingAudio = true;
                clip.duration = 0; // Đặt về 0 để Gemini tự tính cho chính xác
            }
        }

        if (hasMissingAudio) {
            this.toastr.info('Hệ thống đang yêu cầu AI tự động ước lượng thời gian cho các cảnh hành động...', 'Thông báo');
        }

        // Rút gọn format đầu vào để AI dễ đọc. Phân biệt rõ dòng nào có thoại (có số giây), dòng nào hành động (NO_AUDIO)
        // Nếu chọn "Tự do" (maxDuration === 0), giấu luôn số giây để AI không cố gắng cộng trừ cho khớp
        const continuousText = allClips
            .map((c: any) => {
                if (this.maxDuration === 0) {
                    return `[${c.id}] ${c.description}`;
                }
                return `[${c.id} | ${c.localFilePath ? (c.duration + 's') : 'NO_AUDIO'}] ${c.description}`;
            })
            .join('\n');

        // Lấy định dạng từ select box
        const userFormat = this.extraPrompt && this.extraPrompt.trim() !== ''
            ? this.extraPrompt.trim()
            : "Cinematic chuyên nghiệp";

        const isComic = this.videoFormat === 'comic';
        const isSlide = this.videoFormat === 'slide';
        const isPodcast = this.videoFormat === 'podcast';
        const isVideo = this.videoFormat === 'video';

        // Nhận diện tỉ lệ dọc để tinh chỉnh nhắc nhở AI
        const isVertical = this.aspectRatio === '9:16' || this.aspectRatio === '3:4';

        let formatText = "Video";
        switch (this.videoFormat) {
            case 'video': formatText = "Video"; break;
            case 'comic': formatText = "Truyện tranh"; break;
            case 'slide': formatText = "Slide Thuyết trình / Khung hình tĩnh"; break;
            case 'podcast': formatText = "Podcast / Kể chuyện Audio"; break;
        }

        // Tự động giải thích tỉ lệ cho AI
        let aspectDesc = `Tỉ lệ ${this.aspectRatio}`;
        if (this.aspectRatio === '9:16') aspectDesc += " (Khung hình dọc mỏng - Tiktok/Shorts)";
        if (this.aspectRatio === '16:9') aspectDesc += " (Khung hình ngang tiêu chuẩn)";
        if (this.aspectRatio === '3:4') aspectDesc += " (Khung hình dọc vừa)";
        if (this.aspectRatio === '4:3') aspectDesc += " (Khung hình ngang truyền thống)";

        const finalFormatRequest = `${formatText} - ${aspectDesc}. Phong cách/Yêu cầu: ${userFormat}`;

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
            if (this.maxDuration > 0) {
                timeConstraintPrompt = `Tôi có kịch bản thoại với TỔNG THỜI LƯỢNG CHÍNH XÁC: ${durationString} (${totalSecs}s).`;
            } else {
                timeConstraintPrompt = `Tôi có kịch bản thoại chi tiết. Bạn hoàn toàn làm chủ nhịp điệu.`;
            }

            if (this.maxDuration > 0) {
                maxDurationRule = `
            - GIỚI HẠN THỜI GIAN: Tối đa ${this.maxDuration} GIÂY cho mỗi Phân cảnh.
            - ⚠️ NGOẠI LỆ BẮT BUỘC: Nếu bản thân MỘT đoạn thoại (1 ID) đã có thời lượng dài hơn ${this.maxDuration} giây, BẠN PHẢI xếp ID đó đứng một mình trong một scene. VÀ BẮT BUỘC trong nội dung "prompt" của scene đó, bạn phải chủ động chia thành nhiều câu prompt nhỏ (mỗi prompt đại diện cho tối đa ${this.maxDuration}s, kết hợp thay đổi góc máy để sinh động) để người dùng có thể tạo nhiều video nối tiếp. 
              (Ví dụ: "Prompt 1 (${this.maxDuration}s): Góc máy rộng... \\nPrompt 2 (6s): Góc máy cận cảnh..."). 
            TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý CHIA CẮT một ID ra làm nhiều scene riêng biệt trong JSON.`;
            } else {
                maxDurationRule = `
            - THỜI LƯỢNG TỰ DO: Bạn TỰ QUYẾT ĐỊNH thời lượng hợp lý (thường từ 3s đến 8s) cho mỗi video clip dựa vào nội dung. ĐẶC BIỆT chú ý:
              + TỐI GIẢN HOÁ CẢNH QUAY: Phân tích ĐOẠN VĂN và gom nhóm triệt để các ID thoại thành chung 1 scene nếu chúng miêu tả cùng một chuỗi hành động/bối cảnh. CÀNG SÚC TÍCH, CÔ ĐỌNG CÀNG TỐT (VD: một chuỗi dài chỉ cần 1-3 cảnh là đủ).
              + TUYỆT ĐỐI KHÔNG CHIA NHỎ MÔ TẢ: Không bao giờ được chia nhỏ 1 mô tả ra thành nhiều đoạn "Prompt 1", "Prompt 2" ở trong JSON. Mỗi scene trong JSON chỉ được chứa MỘT câu prompt duy nhất.
              + LƯỢC BỎ TỪ NGỮ THỪA THÃI: Rút gọn prompt cực kỳ ngắn gọn (Tối đa 15-20 từ). Chỉ tập trung vào Danh từ (Chủ thể, Đạo cụ) và Động từ (Hành động). Bỏ qua những chi tiết rườm rà.
              + TẬP TRUNG VÀO HÀNH ĐỘNG CỐT LÕI: Nếu câu thoại dài lê thê nhưng hình ảnh chỉ diễn tả MỘT CẢNH TĨNH hoặc hành động lặp lại, hãy CHỈ VIẾT 1 PROMPT DUY NHẤT và gán thời gian vừa đủ cho hành động đó (VD: 5s). KHÔNG CẦN cố đẻ thêm hình ảnh để lấp đầy thời gian đọc thoại.
              + BẮT BUỘC ghi rõ thời lượng ước tính "estimatedDuration" cho mỗi scene. TUYỆT ĐỐI KHÔNG tự ý chia cắt 1 ID ra nhiều scene riêng biệt.`;
            }

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

        let targetLanguage = "TIẾNG ANH (ENGLISH)";
        if (this.settings?.language) {
            const langMap: { [key: string]: string } = {
                'vi': 'TIẾNG VIỆT',
                'en': 'TIẾNG ANH',
                'fr': 'TIẾNG PHÁP',
                'es': 'TIẾNG TÂY BAN NHA',
                'ja': 'TIẾNG NHẬT',
                'ko': 'TIẾNG HÀN',
                'zh': 'TIẾNG TRUNG'
            };
            targetLanguage = langMap[this.settings.language] || `MÃ NGÔN NGỮ: ${this.settings.language.toUpperCase()}`;
        }

        // PROMPT TỔNG LỰC GỬI CHO GEMINI
        const promptText = `
            BẠN LÀ GIÁM ĐỐC SÁNG TẠO ĐA PHƯƠNG TIỆN XUẤT SẮC. 
            ${timeConstraintPrompt}

            🎯 ĐỊNH DẠNG TÁC PHẨM YÊU CẦU: "${finalFormatRequest}"${formatInstruction}

            🌍 QUY TẮC NGÔN NGỮ BẮT BUỘC:
            - TẤT CẢ CÁC TRƯỜNG "masterPrompt", "characters" (kể cả "prompt" tạo hình nhân vật), "imagePrompt", và "prompt" bên trong "scenes" BẮT BUỘC PHẢI VIẾT BẰNG ${targetLanguage}.
            - Riêng phần tên nhân vật ("name") nếu là tên riêng thì giữ nguyên ngôn ngữ gốc (VD: "Ông Bảy", "Lan").
            - Mọi mô tả, hành động, bối cảnh, hãy sử dụng các từ khóa chuyên ngành kỹ thuật điện ảnh (như Close-up, Tracking shot, Cinematic lighting...) để AI video dễ hiểu nhất.

            NHIỆM VỤ CỦA BẠN:
            1. Sáng tạo MASTER PROMPT: Viết prompt định hướng hình ảnh chung. Định hình rõ phong cách chia khung (nếu là truyện tranh). ${masterPromptDurationLimit}
            2. Xây dựng TẠO HÌNH (CHARACTER DESIGN): Mô tả NHẤT QUÁN và CỐ ĐỊNH về ngoại hình nhân vật (tuổi, tóc, trang phục đặc trưng).
            3. CHIA PHÂN CẢNH VÀ TẠO BỐI CẢNH (STORYBOARD/SHOT LIST): Đây là bản thiết kế kỹ thuật (blueprint) để hình ảnh hóa kịch bản. Bạn phải gom nhóm các câu thoại và TỰ ĐỘNG phân tích nội dung để tạo ra bối cảnh (prompt) chi tiết, định hướng rõ ràng cho khâu tiền kỳ và hậu kỳ.

            QUY TẮC BẮT BUỘC (QUAN TRỌNG NHẤT):${maxDurationRule}${antiDuplicationRule}
            - 👤 TỐI ƯU NHÂN VẬT: TUYỆT ĐỐI KHÔNG mô tả lại ngoại hình chi tiết của nhân vật trong cảnh. Việc tạo hình do hệ thống tự động xử lý.
            - 👤 ĐỊNH DANH NHÂN VẬT (RẤT QUAN TRỌNG): Trong câu "prompt" của từng scene, BẮT BUỘC PHẢI DÙNG CHÍNH XÁC TÊN NHÂN VẬT đã khai báo trong danh sách "characters" làm Chủ thể (Subject) thay vì dùng các từ chung chung như "he", "the man", "an old man" (Ví dụ sai: "an old man is wiping the glass". Ví dụ ĐÚNG: "Ông Bảy is wiping the glass"). Việc gọi đúng tên này giúp hệ thống tự động nhận diện và áp dụng đúng ngoại hình (Character Reference).
            - 🎬 CÔNG THỨC PROMPT DỰNG PHIM CHUẨN ĐIỆN ẢNH (BẮT BUỘC CHO MỌI SCENE):
              Bắt buộc tuân thủ cấu trúc sau cho "prompt" video: [Chủ thể (Tên nhân vật)] + [Hành động chi tiết, đơn hướng] + [Bối cảnh/Môi trường] + [Góc máy & Chuyển động camera] + [Ánh sáng] + [Phong cách & Thông số chất lượng].
              (Ví dụ: "Maria typing on a laptop, close-up shot on hands, dark office background, cinematic lighting, dramatic shadows, 4k, photorealistic").
            - 🎬 TÁCH BIỆT "BỐI CẢNH" (imagePrompt) VÀ "HÀNH ĐỘNG" (prompt) THEO CÔNG THỨC:
              + "imagePrompt": Bản thiết kế bối cảnh. PHẢI LÀ CẢNH TRỐNG (Empty Set). Chỉ bao gồm: [Bối cảnh] + [Góc máy] + [Ánh sáng] + [Phong cách]. TUYỆT ĐỐI KHÔNG CÓ CON NGƯỜI HAY NHÂN VẬT.
              + "prompt": Bản thiết kế hành động. Gom đủ 6 yếu tố của CÔNG THỨC TRÊN. Phải bao gồm toàn bộ không gian từ imagePrompt VÀ BỔ SUNG THÊM Chủ thể, Hành động, Chuyển động camera. Hãy TỐI GIẢN HOÁ, chỉ cần 15-20 từ.
            - 🌓 NHẤT QUÁN BỐI CẢNH & THỜI GIAN (TUYỆT ĐỐI QUAN TRỌNG): Xuyên suốt toàn bộ câu chuyện, bạn PHẢI phân tích bối cảnh chung và giữ CỐ ĐỊNH Thời gian (VD: "night time", "daylight") và Thiết lập Ánh sáng (VD: "cinematic lighting", "bright sunlight"). NẾU ĐÃ LÀ BAN ĐÊM, TẤT CẢ CÁC CẢNH TIẾP THEO PHẢI CÓ "night time" trong prompt, KHÔNG ĐƯỢC để tự động chuyển sang ban ngày.
            - 🎥 CHẤT LƯỢNG HÌNH ẢNH (REALISTIC VIDEO): BẮT BUỘC chèn cụm từ "photorealistic, hyper-realistic, live-action, 8k resolution, shot on 35mm lens" vào cuối MỌI PROMPT để đảm bảo video có chất lượng giống cảnh quay người thật (TRỪ KHI master prompt yêu cầu thể loại khác như hoạt hình 3D, 3D animation, anime, comic, illustration thì tuyệt đối KHÔNG được chèn các từ live-action, photorealistic).
            - 🎯 KIÊN ĐỊNH PHONG CÁCH: Khi miêu tả phong cách ở Master Prompt, hãy xác định MỘT phong cách duy nhất và kiên định với nó. TUYỆT ĐỐI KHÔNG sử dụng văn phong lựa chọn kiểu "hoặc thế này hoặc thế kia".
            - 🖼️ BẢO TOÀN KHUNG TRUYỆN: (Nếu là truyện tranh) BẮT BUỘC nhắc lại quy cách khung viền thống nhất ở mọi trang.
            - 🚫 TUYỆT ĐỐI KHÔNG CÓ CHỮ (NO TEXT): Không yêu cầu có chữ viết, bảng hiệu, logo trong hình. Hình ảnh phải hoàn toàn sạch.
            - ⏱️ THỜI LƯỢNG CẢNH (estimatedDuration): BẮT BUỘC NẾU toàn bộ các ID trong scene đều mang trạng thái là NO_AUDIO. Bạn phải tự tưởng tượng một cảnh hành động như vậy tốn bao nhiêu giây trong thực tế để gán số (ví dụ: 2, 3.5, 5). KHÔNG cộng dồn thời gian một cách vô lý.
            - GIỮ NGUYÊN THỨ TỰ thoại, không bỏ sót ID nào.

            DỮ LIỆU ĐẦU VÀO:
            ${continuousText}

            KẾT QUẢ TRẢ VỀ DUY NHẤT LÀ JSON OBJECT NÀY:
            {
              "masterPrompt": "Write a detailed Master Prompt about art style and render quality in the requested language...",
              "characters": [
                {
                  "name": "Tên nhân vật (giữ nguyên nếu là tên riêng)",
                  "role": "Role in the story in the requested language...",
                  "appearance": "Detailed physical description in the requested language...",
                  "personality": "Personality description in the requested language...",
                  "prompt": "Character design prompt (IN REQUESTED LANGUAGE). Focus on highly detailed appearance, clothing, colors, materials. Write it as a 'Character design sheet, multiple angles (front, back, side view), highly detailed materials'."
                }
              ],
              "scenes": [
                {
                  "imagePrompt": "[Setting] + [Camera Angle] + [Lighting] + [Style] (IN REQUESTED LANGUAGE, EMPTY SCENE NO CHARACTERS)",
                  "prompt": "[Subject (Character Name and Physical Appearance ONLY. DO NOT USE 'character design sheet' or 'multiple angles' here!)] + [Action] + [Setting] + [Camera Angle & Movement] + [Lighting] + [Quality] (IN REQUESTED LANGUAGE)",
                  "subtitleIds": ["id1", "id2"],
                  "estimatedDuration": 3 // BẮT BUỘC (nhập số giây ước lượng cho shot hình này, vd: 2, 3.5, 4.2)
                }
              ]
            }
        `;

        try {
            let retries = 3;
            let delay = 2000;
            let response = null;

            let finalContents: any = promptText;

            if (this.attachedVideoFiles.length > 0) {
                finalContents = [
                    {
                        role: 'user',
                        parts: [
                            ...this.attachedVideoFiles.map(f => ({
                                inlineData: {
                                    data: f.base64,
                                    mimeType: f.mimeType
                                }
                            })),
                            { text: promptText }
                        ]
                    }
                ];
            }

            for (let i = 0; i < retries; i++) {
                try {
                    response = await this._genaiService.generateContent({
                        model: 'gemini-3.5-flash',
                        contents: finalContents,
                        config: {
                            responseMimeType: "application/json",
                            maxOutputTokens: 8192
                        }
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

            // Không dán masterPrompt vào prompt tạo hình nhân vật nữa,
            // để khung nhập liệu trong form Sửa Nhân Vật được gọn gàng.
            // Component hiển thị (CharacterDialogComponent) sẽ tự động dính masterPrompt vào khi copy hoặc render ảnh.

            const finalScenes = aiResponseScenes.map((scene: any) => {
                let exactSceneDuration = 0;
                let hasAnyAudio = false;

                const mappedSubtitles = scene.subtitleIds.map((id: string) => {
                    const originalClip = allClips.find((c: any) => c.id === id);
                    let safeAudioUrl = null;
                    let clipDuration = 0;

                    if (originalClip) {
                        clipDuration = originalClip.duration || 0;
                        exactSceneDuration += clipDuration;

                        if (originalClip.localFilePath) {
                            hasAnyAudio = true;
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

                if (isVideo && this.maxDuration === 0 && scene.estimatedDuration) {
                    exactSceneDuration = scene.estimatedDuration;
                } else if (!isVideo && hasAnyAudio) {
                    // Cố định exactSceneDuration = tổng thời lượng các audio của scene này
                    // Không lấy estimatedDuration từ AI để đảm bảo khớp tổng thời gian
                } else if (!hasAnyAudio && scene.estimatedDuration) {
                    exactSceneDuration = scene.estimatedDuration;
                }

                const roundedDuration = Math.round(exactSceneDuration * 10) / 10;

                // KHÔNG TỰ ĐỘNG DÁN MASTER PROMPT VÀO ĐÂY vì ở VideoTimelineDialogComponent (khi bấm Copy) đã có logic tự dán masterPrompt rồi!
                // Nếu dán ở đây sẽ bị nhân đôi. Chỉ lấy đúng prompt của scene do AI tạo ra.
                if (scene.sketchPrompt) {
                    scene.sketchPrompt = scene.sketchPrompt.trim();
                }
                let originalScenePrompt = scene.prompt ? scene.prompt.trim() : '';
                let originalImagePrompt = scene.imagePrompt ? scene.imagePrompt.trim() : originalScenePrompt;

                // Tự động bổ sung bối cảnh vào prompt video nếu AI tạo prompt quá sơ sài
                if (!originalScenePrompt) {
                    originalScenePrompt = originalImagePrompt;
                } else if (originalImagePrompt.length > originalScenePrompt.length) {
                    // Nếu prompt video ngắn hơn prompt hình ảnh, AI đã làm mất mô tả phong cảnh
                    if (originalImagePrompt.includes(originalScenePrompt)) {
                        // AI chỉ lấy một đoạn ngắn (vd: Góc máy, tỉ lệ), ghi đè bằng toàn bộ bối cảnh
                        originalScenePrompt = originalImagePrompt;
                    } else {
                        // AI viết câu mới nhưng ngắn hơn, ghép bối cảnh vào
                        originalScenePrompt = originalImagePrompt + '\n\n' + originalScenePrompt;
                    }
                }
                let masterText = aiResponse.masterPrompt ? aiResponse.masterPrompt.trim() : '';

                // Lọc bỏ masterText khỏi originalScenePrompt nếu AI lỡ tay lặp lại do không có hành động
                if (masterText && originalScenePrompt.includes(masterText)) {
                    originalScenePrompt = originalScenePrompt.replace(masterText, '').trim();
                }
                if (masterText && originalImagePrompt.includes(masterText)) {
                    originalImagePrompt = originalImagePrompt.replace(masterText, '').trim();
                }

                let constraintStr = "completely textless, no text, no watermark, no signature, clean background";
                if (isComic) {
                    constraintStr += ", distinct comic panel layout, clear white gutters, split frames, strict panel borders";
                }

                let finalScenePrompt = originalScenePrompt + `\n\n(Constraints: ${constraintStr})`;
                let finalImagePrompt = originalImagePrompt + `\n\n(Constraints: ${constraintStr})`;

                // Tự động nhận diện nhân vật và gắn mô tả (appearance/prompt) vào
                const characters = aiResponse.characters || [];

                let videos = [];
                const maxVideoLength = this.maxDuration;

                // Cố gắng tách các "Prompt 1 (5s):", "Prompt 2:" ra nếu AI có sinh ra
                let individualPrompts: string[] = [];
                let individualDurations: number[] = [];

                const splitRegex = /(?:Prompt|Phân đoạn|Phần|Cảnh|Part)\s*\d+[^:]*:/gi;
                let match;
                let headers = [];
                while ((match = splitRegex.exec(originalScenePrompt)) !== null) {
                    headers.push({ index: match.index, text: match[0] });
                }

                if (headers.length > 0) {
                    for (let i = 0; i < headers.length; i++) {
                        const header = headers[i];
                        const startIndex = header.index + header.text.length;
                        const endIndex = (i + 1 < headers.length) ? headers[i + 1].index : originalScenePrompt.length;

                        const promptText = originalScenePrompt.substring(startIndex, endIndex).trim();
                        if (promptText) {
                            individualPrompts.push(promptText);
                            const timeMatch = header.text.match(/\(([\d\.]+)[sS]?\)/);
                            individualDurations.push(timeMatch && timeMatch[1] ? parseFloat(timeMatch[1]) : 0);
                        }
                    }
                }

                // Chỉ gắn thời lượng chính xác nếu định dạng là VIDEO
                if (isVideo && maxVideoLength > 0 && roundedDuration > maxVideoLength) {
                    const parts = Math.ceil(roundedDuration / maxVideoLength);

                    for (let i = 0; i < parts; i++) {
                        let partDuration = maxVideoLength;
                        if (i === parts - 1) {
                            partDuration = Math.round((roundedDuration - (i * maxVideoLength)) * 10) / 10;
                            if (partDuration <= 0) partDuration = maxVideoLength;
                        }

                        let basePrompt = finalScenePrompt;
                        let baseImagePrompt = finalImagePrompt;
                        if (individualPrompts.length > 0) {
                            basePrompt = individualPrompts[Math.min(i, individualPrompts.length - 1)] + `\n\n(Constraints: ${constraintStr})`;
                            // Nếu có split video prompt, image prompt giữ nguyên ảnh tĩnh ban đầu
                            baseImagePrompt = finalImagePrompt;
                        }

                        videos.push({
                            id: i + 1,
                            prompt: `${basePrompt}\n[NOTE: This scene is ${partDuration} seconds long. Generate video continuation Part ${i + 1}/${parts}. MANDATORY: Seamless continuous motion from previous frame. NO teleportation. NO cuts.]`,
                            imagePrompt: baseImagePrompt,
                            imageUrl: null,
                            duration: partDuration
                        });
                    }
                } else if (isVideo && maxVideoLength === 0 && individualPrompts.length > 1) {
                    for (let i = 0; i < individualPrompts.length; i++) {
                        let partDuration = individualDurations[i] || 5; // Mặc định 5s nếu AI không ghi rõ
                        // GIỚI HẠN CỨNG: Không để clip nào quá 10s dù AI có ảo giác ghi số lớn
                        if (partDuration > 10) {
                            partDuration = 10;
                        }
                        videos.push({
                            id: i + 1,
                            prompt: `${individualPrompts[i]}\n\n(Constraints: ${constraintStr})\n[NOTE: Auto-split scene based on story pacing. MANDATORY: Seamless continuous motion from previous frame. NO teleportation. NO cuts.]`,
                            imagePrompt: finalImagePrompt,
                            imageUrl: null,
                            duration: partDuration
                        });
                    }
                } else {
                    let singlePrompt = finalScenePrompt;
                    let cleanImagePrompt = finalImagePrompt;

                    if (isVideo && maxVideoLength === 0) {
                        let partDuration = roundedDuration > 0 ? roundedDuration : 5; // Lấy từ estimatedDuration do AI quyết định
                        // Cố gắng tìm (5s) hoặc (6.5s) trong prompt phòng trường hợp AI vẫn nhét vào
                        const timeMatch = singlePrompt.match(/\(([\d\.]+)[sS]?\)/);
                        if (timeMatch && timeMatch[1]) {
                            partDuration = parseFloat(timeMatch[1]);
                        }
                        // GIỚI HẠN CỨNG: Không quá 10s
                        if (partDuration > 10) partDuration = 10;

                        videos.push({
                            id: 1,
                            prompt: singlePrompt,
                            imagePrompt: cleanImagePrompt,
                            imageUrl: null,
                            duration: partDuration
                        });
                    } else {
                        if (isVideo) {
                            singlePrompt += `\n[MANDATORY: Generate video with exact duration of ${roundedDuration} seconds]`;
                        }

                        videos.push({
                            id: 1,
                            prompt: singlePrompt,
                            imagePrompt: cleanImagePrompt,
                            imageUrl: null,
                            duration: roundedDuration
                        });
                    }
                }

                return {
                    prompt: finalScenePrompt,
                    visualPrompt: finalImagePrompt,
                    sketchPrompt: scene.sketchPrompt || '',
                    imageUrl: null,
                    subtitles: mappedSubtitles,
                    videos: videos,
                    forcedDuration: roundedDuration
                };
            });

            this.videoProject = {
                uuid: data.uuid,
                title: data.title,
                masterPrompt: aiResponse.masterPrompt || "",
                extraPrompt: this.extraPrompt,
                characters: aiResponse.characters || [],
                totalOriginalClips: allClips.length,
                totalScenes: finalScenes.length,
                scenes: finalScenes,
                aspectRatio: this.aspectRatio // Lưu tỉ lệ khung hình để render sau này
            };

            // Lưu danh sách nhân vật dưới local
            if (aiResponse.characters && aiResponse.characters.length > 0) {
                this.multiAccountService.setItem(`casting_list_${data.uuid}`, aiResponse.characters);
            }

            // [QUAN TRỌNG] Xóa editorLayout cũ vì kịch bản đã được tạo mới hoàn toàn
            // Tránh tình trạng lưu lại các node cũ (vd: sinh ra 8 cảnh nhưng trên UI vẫn còn node thứ 9 cũ)
            const storageKey = `ai_type_video_ready_data_${data.uuid}`;
            const existingData = this.multiAccountService.getItem(storageKey);
            if (existingData && existingData.editorLayout) {
                delete existingData.editorLayout;
                this.multiAccountService.setItem(storageKey, existingData);
            }
            // Đảm bảo object hiện tại cũng không bị dính layout cũ
            delete this.videoProject.editorLayout;

            this.saveToLocal();
            this.openTimelineDialog(this.videoProject);
            this.toastr.success(`Đã tối ưu thành ${finalScenes.length} phân cảnh!`);

        } catch (error: any) {
            console.error('Lỗi logic gom nhóm:', error);
            const msg = error?.message || 'Hệ thống AI hiện đang quá tải. Vui lòng thử lại sau.';
            this.toastr.error(msg, 'Lỗi AI');
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
                    this.openTimelineDialog(videoProject);
                }
            } catch (e) {
                console.error('Dữ liệu video cũ bị lỗi:', e);
            }
        }
    }

    // Hàm bổ trợ để mở Dialog
    async openTimelineDialog(data: any) {
        data['username'] = this.user?.name || 'anonymous'; // Đảm bảo có username trong data
        data.aspectRatio = this.aspectRatio || '16:9';

        // Đồng bộ và kiểm tra file audio thực sự tồn tại trước khi gắn vào kịch bản
        if (data.scenes && data.scenes.length > 0) {
            for (const scene of data.scenes) {
                if (scene.subtitles && scene.subtitles.length > 0) {
                    for (const sub of scene.subtitles) {
                        const originalClip = this.audioList.find((c: any) => c.id === sub.id);
                        if (originalClip) {
                            sub.duration = originalClip.duration || sub.duration;
                            if (originalClip.localFilePath) {
                                try {
                                    const result = await (window as any).electron.invoke('check-local-file-exists', {
                                        path: originalClip.localFilePath,
                                        filename: originalClip.audioFileName,
                                        username: this.user?.name || 'admin',
                                        targetUuid: this.uuid
                                    });
                                    if (result && result.exists) {
                                        originalClip.localFilePath = result.path;
                                        const safePath = originalClip.localFilePath.replace(/\\/g, '/');
                                        sub.audioUrl = safePath.startsWith('/') ? `file://${safePath}` : `file:///${safePath}`;
                                    } else {
                                        sub.audioUrl = null;
                                        originalClip.localFilePath = null; // Xóa đường dẫn hỏng khỏi clip gốc
                                    }
                                } catch (e) {
                                    sub.audioUrl = null;
                                }
                            } else {
                                sub.audioUrl = null;
                            }
                        }
                    }
                }
            }

            // Cập nhật lại vào bộ nhớ
            this.videoProject = data;
            if (!this.videoProject.uuid) {
                this.videoProject.uuid = this.uuid;
            }
            this.saveToLocal();
        }

        this.router.navigate(['/voice2video', this.user?.name || 'anonymous', this.uuid, 'node']);
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
                // Thêm timestamp để tránh cache trình duyệt (đảm bảo đọc fresh file từ đĩa, đặc biệt khi file bị xóa/tạo lại)
                let playUrl = clip.rawUrl.startsWith('file://') ? `${clip.rawUrl}?t=${Date.now()}` : clip.rawUrl;
                playUrl = playUrl.replace('media://', 'mediacors://');
                this.wavesurfer.load(playUrl);
                this.wavesurfer.once('ready', () => {
                    this.wavesurfer.play();
                });
            } else {
                if (this.wavesurfer) {
                    this.wavesurfer.empty();
                }
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
        this.update(false);
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
                this.update(false);
                this.cd.markForCheck();
            }
        });
    }

    editClip(clip: any) {
        clip.tempDescription = clip.description;
        clip.isEditing = true;
    }

    async exportProject() {
        const mediaPaths: string[] = [];

        const processPath = (filePath: string) => {
            if (!filePath) return null;
            if (filePath.startsWith('http') || filePath.startsWith('data:') || filePath.startsWith('blob:')) return filePath;
            // Extract filename
            const filename = filePath.split(/[/\\]/).pop();
            mediaPaths.push(filePath);
            return filename;
        };

        const exportData: any = {
            title: this.projectTitle,
            uuid: this.uuid,
            createdAt: new Date().toISOString(),
            extraPrompt: this.extraPrompt,
            videoFormat: this.videoFormat,
            aspectRatio: this.aspectRatio,
            maxDuration: this.maxDuration,
            videoProject: null,
            clips: []
        };

        // Clone videoProject to avoid modifying the current state
        if (this.videoProject) {
            exportData.videoProject = JSON.parse(JSON.stringify(this.videoProject));

            // Đảm bảo lấy danh sách nhân vật mới nhất từ localStorage casting_list_${this.uuid}
            const localCharacters = this.multiAccountService.getItem(`casting_list_${this.uuid}`);
            if (localCharacters) {
                exportData.videoProject.characters = localCharacters;
            }

            // Extract from videoProject scenes
            if (exportData.videoProject.scenes) {
                exportData.videoProject.scenes.forEach((scene: any) => {
                    if (scene.audioLocalPath) {
                        scene.audioLocalPath = processPath(scene.audioLocalPath);
                    }
                    if (scene.customVideoPath) {
                        scene.customVideoPath = processPath(scene.customVideoPath);
                    }
                    if (scene.imageUrl) {
                        scene.imageUrl = processPath(scene.imageUrl);
                    }
                    if (scene.videoUrl) {
                        scene.videoUrl = processPath(scene.videoUrl);
                    }
                    if (scene.videos && Array.isArray(scene.videos)) {
                        scene.videos.forEach((video: any) => {
                            if (video.imageUrl) {
                                video.imageUrl = processPath(video.imageUrl);
                            }
                            if (video.videoUrl) {
                                video.videoUrl = processPath(video.videoUrl);
                            }
                            if (video.customVideoPath) {
                                video.customVideoPath = processPath(video.customVideoPath);
                            }
                        });
                    }
                });
            }
            // Xử lý hình ảnh nhân vật trong characters
            if (exportData.videoProject.characters) {
                exportData.videoProject.characters.forEach((char: any) => {
                    if (char.avatarUrl) {
                        char.avatarUrl = processPath(char.avatarUrl);
                    }
                    if (char.avatarUrls && Array.isArray(char.avatarUrls)) {
                        char.avatarUrls = char.avatarUrls.map((url: string) => processPath(url));
                    }
                });
            }
            // Xử lý hình ảnh nhân vật trong existingCharacters (nếu có)
            if (exportData.videoProject.existingCharacters) {
                exportData.videoProject.existingCharacters.forEach((char: any) => {
                    if (char.avatarUrl) {
                        char.avatarUrl = processPath(char.avatarUrl);
                    }
                    if (char.avatarUrls && Array.isArray(char.avatarUrls)) {
                        char.avatarUrls = char.avatarUrls.map((url: string) => processPath(url));
                    }
                });
            }
        }

        exportData.clips = this.audioList.map((clip) => {
            const clone = { ...clip };
            if (clone.localFilePath) {
                clone.localFilePath = processPath(clone.localFilePath);
            }
            // Blob URL needs to be re-loaded upon import, so we drop it
            if (clone.url && (clone.url as string).startsWith?.('blob:')) {
                clone.url = undefined;
                clone.rawUrl = undefined;
            }
            return clone;
        });

        const jsonStr = JSON.stringify(exportData, null, 2);

        this.toastr.info('Đang đóng gói dự án...', 'Export');
        try {
            const res = await (window as any).electron.invoke('export-project', {
                projectJSON: jsonStr,
                mediaPaths,
                username: this.user?.name || 'admin'
            });
            if (res.success) {
                this.toastr.success(`Đã xuất thành công: ${res.filePath}`, 'Export');
            } else if (!res.canceled) {
                this.toastr.error(`Lỗi xuất dự án: ${res.error}`, 'Export');
            }
        } catch (error) {
            console.error(error);
            this.toastr.error('Có lỗi xảy ra khi gọi hàm xuất dự án', 'Export');
        }
    }

    async importProject() {
        try {
            const res = await (window as any).electron.invoke('import-project', {
                currentUuid: this.uuid,
                username: this.user?.name || 'admin'
            });

            if (res.success) {
                this.toastr.info('Đang nạp dự án...', 'Import');
                const data = res.projectData;

                // Kiểm tra xem kịch bản này đã từng tồn tại trong chương trình chưa
                const storageKey = `${this.STORAGE_AUDIO_KEY}_${res.targetUuid}`;
                const isExistingScenario = !!this.multiAccountService.getItem(storageKey);

                // Cập nhật UUID nếu đây là một kịch bản mới/khác kịch bản hiện tại
                if (res.isNewScenario && res.targetUuid) {
                    this.uuid = res.targetUuid;
                }

                if (data.title) this.projectTitle = data.title;
                if (data.extraPrompt !== undefined) this.extraPrompt = data.extraPrompt;
                if (data.videoFormat !== undefined) this.videoFormat = data.videoFormat;
                if (data.aspectRatio !== undefined) this.aspectRatio = data.aspectRatio;
                if (data.maxDuration !== undefined) this.maxDuration = data.maxDuration;

                if (data.videoProject) {
                    this.videoProject = data.videoProject;
                    // Đồng bộ hóa danh sách nhân vật vào localStorage casting_list_${this.uuid}
                    if (this.videoProject.characters) {
                        this.multiAccountService.setItem(`casting_list_${this.uuid}`, this.videoProject.characters);
                    }
                }

                if (data.clips) {
                    this.restoreClips(data.clips);
                }

                this.saveToLocal();
                this.toastr.success(
                    isExistingScenario
                        ? `Đã cập nhật dữ liệu kịch bản: ${this.projectTitle}`
                        : `Đã nhập thành kịch bản mới: ${this.projectTitle}`,
                    'Import'
                );

                if (res.isNewScenario && res.targetUuid) {
                    // Chuyển hướng sang route mới của kịch bản mới vừa import
                    const routeName = this.currentName || this.user?.name || 'admin';
                    this.router.navigate(['/voice2video', routeName, res.targetUuid]);
                } else {
                    // Cần load lại Audio Content từ disk vào thẻ <audio>
                    setTimeout(() => {
                        this.loadAudiosFromLocal(this.uuid);
                    }, 500);
                }

            } else if (!res.canceled) {
                this.toastr.error(`Lỗi nhập dự án: ${res.error}`, 'Import');
            }
        } catch (error) {
            console.error(error);
            this.toastr.error('Có lỗi xảy ra khi gọi hàm nhập dự án', 'Import');
        }
    }

    saveClipEdit(clip: any) {
        if (!clip.tempDescription || clip.tempDescription.trim() === '') {
            this.toastr.warning('Nội dung không được để trống');
            return;
        }
        clip.description = clip.tempDescription.trim();
        // Cập nhật lại clip.name để hiển thị bản tóm tắt
        clip.name = clip.description.length > 50 ? clip.description.substring(0, 50) + '...' : clip.description;
        clip.isEditing = false;

        // Cập nhật subtitle trong videoProject nếu có liên kết
        if (this.videoProject && this.videoProject.scenes) {
            for (let scene of this.videoProject.scenes) {
                if (scene.subtitles) {
                    let sub = scene.subtitles.find((s: any) => s.id === clip.id);
                    if (sub) {
                        sub.text = clip.description;
                    }
                }
            }
        }

        this.saveToLocal();
        this.update(); // Đồng bộ thay đổi lên Server!
        this.cd.markForCheck();
        this.toastr.success('Đã lưu thay đổi');
    }

    cancelClipEdit(clip: any) {
        clip.isEditing = false;
    }

    /**
     * Sửa archive đồng bộ lên Server
     */
    update(confirm: boolean = false) {
        if (!this.uuid) return;

        // Nếu có bản gốc (được nạp từ Server bằng hàm detail) thì lấy làm cơ sở
        let data = this.originalArchiveData ? { ...this.originalArchiveData } : {
            uuid: this.uuid,
            title: this.projectTitle
        };

        // Ghi đè các trường quan trọng
        data.done = this.audioList.map(clip => `<p>${clip.description}</p>`);
        data.confirm = confirm;
        data.username = this.user?.name;

        // Chỉ định new_version = -1 để ghi đè lên bản gốc
        data.new_version = -1;
        if (this.originalArchiveData && this.originalArchiveData.createdAt) {
            data.createdAt = this.originalArchiveData.createdAt;
        }

        this._crawlService
            .archiveUpdate(data)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                error: (err) => {
                    console.error('Lỗi khi đồng bộ lên Server', err);
                },
                complete: () => {
                    // Không cần thông báo thành công ở đây vì saveClipEdit đã thông báo rồi
                    // Để phòng hờ có thể thêm 1 thông báo nhỏ:
                    // this.toastr.info('Đã đồng bộ nội dung lên Server');
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

                        // Lưu lại bản gốc từ server để có thể update() lên lại
                        this.originalArchiveData = JSON.parse(JSON.stringify(result.data));

                        this.audioList = result.data.done.map(
                            (htmlItem: any, index: number) => {
                                let cleanText = this.removeHTML.transform(htmlItem);
                                if (cleanText) {
                                    const doc = new DOMParser().parseFromString(cleanText, 'text/html');
                                    cleanText = doc.documentElement.textContent || cleanText;
                                }

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

    selectedAudioIndex: number = -1;

    async processFiles(files: FileList) {
        const promises: Promise<AudioClip>[] = [];
        for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('audio/'))
                promises.push(this.createAudioClipFromFile(files[i]));
        }
        try {
            const newClips = await Promise.all(promises);
            if (this.selectedAudioIndex !== -1 && this.selectedAudioIndex < this.audioList.length) {
                this.audioList.splice(this.selectedAudioIndex + 1, 0, ...newClips);
                this.audioList = [...this.audioList];
            } else {
                this.audioList = [...this.audioList, ...newClips];
            }
            this.selectedAudioIndex = -1;
            this.calculateTotalDuration();
            this.saveToLocal();
            this.update(false);
            this.cd.markForCheck();
            this.toastr.success(`Đã thêm ${newClips.length} files.`);
        } catch (err) { }
    }

    addEmptyClip() {
        const newClip: AudioClip = {
            id: this.generateId(),
            name: 'Đoạn thoại mới',
            duration: 0,
            description: '',
            username: this.user?.name || '',
            voice: 'vi-VN-Standard-A',
            rate: 1.0,
            pitch: 0,
            isEditing: true, // Auto open edit mode
            tempDescription: ''
        };
        if (this.selectedAudioIndex !== -1 && this.selectedAudioIndex < this.audioList.length) {
            this.audioList.splice(this.selectedAudioIndex + 1, 0, newClip);
            this.audioList = [...this.audioList];
        } else {
            this.audioList = [...this.audioList, newClip];
        }
        this.selectedAudioIndex = -1;
        this.saveToLocal();
        this.update(false);
        this.cd.markForCheck();
    }

    splitClipText(text: string, maxLength: number = 300): string[] {
        if (!text) return [];

        // Thêm khoảng trắng sau dấu câu nếu bị dính liền (ví dụ: "có.Power" -> "có. Power")
        text = text.replace(/([.!?])([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴEÈÉẸẺẼÊỀẾỆỂỄIÌÍỊỈĨOÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠUÙÚỤỦŨƯỪỨỰỬỮYỲÝỴỶỸĐ])/g, '$1 $2');

        // Tách theo dấu . ! ? hoặc xuống dòng (giữ lại dấu câu)
        const sentences = text
            .split(/([.!?\n]+(?:\s+|$))/)
            .reduce((acc: string[], val: string, i: number, arr: string[]) => {
                if (i % 2 === 0) {
                    const next = arr[i + 1] || '';
                    const combined = (val + next).trim();
                    if (combined) {
                        acc.push(combined);
                    }
                }
                return acc;
            }, []);

        const result: string[] = [];

        for (let sentence of sentences) {
            sentence = sentence.trim();
            if (!sentence) continue;

            if (sentence.length <= maxLength) {
                result.push(sentence);
            } else {
                // Nếu câu dài hơn maxLength, tách theo dấu phẩy, chấm phẩy
                const parts = sentence
                    .split(/([,;]+(?:\s+|$))/)
                    .reduce((acc: string[], val: string, i: number, arr: string[]) => {
                        if (i % 2 === 0) {
                            const next = arr[i + 1] || '';
                            const combined = (val + next).trim();
                            if (combined) acc.push(combined);
                        }
                        return acc;
                    }, []);

                let currentPart = '';
                for (const part of parts) {
                    if ((currentPart + ' ' + part).trim().length <= maxLength) {
                        currentPart = (currentPart + ' ' + part).trim();
                    } else {
                        if (currentPart) result.push(currentPart);
                        if (part.length > maxLength) {
                            const words = part.split(' ');
                            let tempWord = '';
                            for (const word of words) {
                                if ((tempWord + ' ' + word).trim().length <= maxLength) {
                                    tempWord = (tempWord + ' ' + word).trim();
                                } else {
                                    if (tempWord) result.push(tempWord);
                                    tempWord = word;
                                }
                            }
                            if (tempWord) currentPart = tempWord;
                        } else {
                            currentPart = part;
                        }
                    }
                }
                if (currentPart) result.push(currentPart);
            }
        }
        return result;
    }

    splitClip(clip: any, index: number) {
        if (!clip.description) {
            this.toastr.warning("Đoạn văn trống, không thể chia nhỏ.");
            return;
        }

        const parts = this.splitClipText(clip.description, 300);

        if (parts.length <= 1) {
            this.toastr.info("Đoạn văn này đã đủ ngắn, không cần chia nhỏ.");
            return;
        }

        const newClips = parts.map(part => {
            return {
                ...clip,
                id: this.generateId(),
                description: part,
                name: part.substring(0, 50) + (part.length > 50 ? '...' : ''),
                url: null,
                audioFileName: null,
                localFilePath: null,
                duration: 0,
                tempDescription: part,
                isEditing: false
            };
        });

        this.audioList.splice(index, 1, ...newClips);
        this.audioList = [...this.audioList];

        this.selectedAudioIndex = -1;
        this.saveToLocal();
        this.update(false);
        this.cd.markForCheck();
        this.toastr.success(`Đã chia nhỏ thành ${parts.length} đoạn ngắn.`);
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
        private _genaiService: GenaiService,
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
        this.saveSubject.pipe(
            debounceTime(2500),
            takeUntil(this._unsubscribeAll)
        ).subscribe((uuid) => {
            this.saveToLocal(uuid);
        });

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
