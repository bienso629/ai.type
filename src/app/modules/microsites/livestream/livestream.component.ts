import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'livestream',
    templateUrl: './livestream.component.html',
    styleUrls: ['./livestream.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class LivestreamComponent implements OnInit, OnDestroy {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';
    private readonly STORAGE_AUDIO_KEY = 'ai_type_audio_merger_data';

    uuid: string = '';

    // Để trống ban đầu, sẽ load từ localStorage
    projectData: any = null;

    // Các biến trạng thái của Player
    currentSceneIndex: number = 0;
    currentSubtitleIndex: number = 0;

    currentDisplayedText: string = '';
    currentMediaUrl: string | null = null;
    textChunks: { text: string, weight: number }[] = [];
    fallbackInterval: any;

    isPlaying: boolean = false;
    hasStarted: boolean = false;

    // Đối tượng Audio ẩn chạy ngầm
    audioPlayer: HTMLAudioElement;

    isMobileRatio: boolean = false;

    // [THÊM BIẾN MỚI] Trạng thái bật/tắt phụ đề
    showSubtitle: boolean = true;
    // [THÊM MỚI] Biến quản lý trạng thái bật/tắt phụ đề khi xuất video
    exportWithSubtitle: boolean = true;

    // Các biến Getter
    get currentScene() {
        return this.projectData?.scenes?.[this.currentSceneIndex];
    }

    get currentSubtitle() {
        return this.currentScene?.subtitles?.[this.currentSubtitleIndex];
    }

    // Cập nhật hàm nhận 2 tham số: Tỉ lệ và Chất lượng
    async exportCustomVideo(ratio: '9:16' | '16:9' | '1:1', quality: '1080p' | '2k' | '4k') {
        if (!this.projectData.scenes?.length) {
            this.toastr.error('Kịch bản trống!');
            return;
        }

        // Lấy giá trị thực tế của biến ngay lúc bấm nút
        const hasSub = !!this.exportWithSubtitle;

        // Tạo bản sao để tránh làm hỏng dữ liệu đang livestream
        const payload = {
            ...this.projectData,
            exportRatio: ratio,
            quality: quality,
            withSubtitle: hasSub // Gửi giá trị boolean (true/false)
        };

        this.toastr.info(`Đang bắt đầu Render...`);

        try {
            const res = await (window as any).electron.invoke('render-custom-video', payload);
            if (res?.success) {
                this.toastr.success(`Render thành công!`);
            } else {
                this.toastr.error(`Lỗi: ${res.error}`);
            }
        } catch (err: any) {
            this.toastr.error(`Lỗi kết nối: ${err.message}`);
        }
    }

    constructor(
        private titleService: Title,
        private router: Router,
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService,
        public dialog: MatDialog,
        private route: ActivatedRoute,
        private cd: ChangeDetectorRef
    ) {
        this.audioPlayer = new Audio();
    }

    ngOnInit() {
        this.route.params.subscribe(async (params: Params) => {
            this.uuid = params['uuid'];

            if (this.uuid) {
                this.exportWithSubtitle = true;
                this.cd.markForCheck(); // Thêm dòng này để cập nhật dấu check lên UI

                // 1. Load dữ liệu từ localStorage
                const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.uuid}`;
                this.projectData = this.multiAccountService.getItem(storageKey);
                if (this.projectData) {
                    try {
                        if (this.projectData?.title) {
                            this.titleService.setTitle(`Livestream AI | ${this.projectData.title}`);
                        }
                    } catch (error) {
                        console.error('Lỗi khi parse dữ liệu Livestream:', error);
                    }
                }

                // 2. Lắng nghe sự kiện Audio (Chỉ khi có dữ liệu)
                if (this.projectData && this.projectData.scenes?.length > 0) {
                    this.audioPlayer.onended = () => {
                        this.moveToNextSubtitle();
                    };

                    this.audioPlayer.onerror = () => {
                        console.warn("Lỗi phát audio, tự động bỏ qua và chuyển câu sau 2 giây...");
                        setTimeout(() => this.moveToNextSubtitle(), 2000);
                    };
                }
            } else {
                this.router.navigate(['/tools']);
            }
        });
    }

    ngOnDestroy(): void {
        // Hủy audio khi thoát trang để tránh bị phát tiếng ngầm
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
        }
    }

    // --- LOGIC ĐIỀU KHIỂN ---

    // [THÊM HÀM MỚI] Bật/tắt phụ đề
    toggleSubtitle() {
        this.showSubtitle = !this.showSubtitle;
        this.cd.markForCheck();
    }

    // [THÊM HÀM MỚI] Xử lý đổi tỉ lệ màn hình
    toggleScreenRatio() {
        this.isMobileRatio = !this.isMobileRatio;

        let targetWidth = 1440;
        let targetHeight = 900;

        if (this.isMobileRatio) {
            // Tỉ lệ Mobile (Dọc 9:16) - Kích thước mô phỏng điện thoại
            targetWidth = 450;
            targetHeight = 800;
        } else {
            // Tỉ lệ Desktop (Ngang 16:9) - Kích thước làm việc bình thường
            targetWidth = 1440;
            targetHeight = 900;
        }

        // Gọi lệnh xuống Electron thông qua preload bridge
        if ((window as any).electron && (window as any).electron.resizeWindow) {
            (window as any).electron.resizeWindow(targetWidth, targetHeight);
        } else {
            console.warn('Tính năng đổi kích thước chỉ hoạt động trên App Electron.');
        }

        this.cd.markForCheck();
    }

    startLivestream() {
        if (!this.projectData) return;
        this.hasStarted = true;
        this.currentSceneIndex = 0;
        this.currentSubtitleIndex = 0;
        this.playCurrent();
    }

    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.audioPlayer.play();
        } else {
            this.audioPlayer.pause();
        }
        this.cd.markForCheck();
    }

    // Chuyển nhanh đến một Scene bất kỳ
    jumpToScene(index: number) {
        // Nếu chọn đúng scene đang phát hoặc nằm ngoài mảng thì bỏ qua
        if (index === this.currentSceneIndex || index < 0 || index >= this.projectData.scenes.length) {
            return;
        }

        // 1. Dừng ngay âm thanh hiện tại để tránh bị đè tiếng
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;

        // 2. Cập nhật vị trí mới
        this.currentSceneIndex = index;
        this.currentSubtitleIndex = 0; // Bắt đầu từ câu phụ đề đầu tiên của Scene đó

        // 3. Ép trạng thái thành đang phát và chạy Audio mới
        this.isPlaying = true;
        this.updateCurrentMediaUrl();
        this.playCurrent();
    }

    updateCurrentMediaUrl() {
        if (!this.currentScene) {
            this.currentMediaUrl = null;
            return;
        }

        let newMediaUrl = this.currentScene.imageUrl;

        if (this.currentScene.videos && this.currentScene.videos.length > 0) {
            let elapsedAudioTime = 0;
            if (this.currentScene.subtitles) {
                for (let i = 0; i < this.currentSubtitleIndex; i++) {
                    const sub = this.currentScene.subtitles[i];
                    elapsedAudioTime += sub.duration || 3;
                }
            }
            
            if (this.audioPlayer && this.isPlaying) {
                elapsedAudioTime += this.audioPlayer.currentTime || 0;
            }
            
            let accumulatedVideoTime = 0;
            let found = false;
            for (let i = 0; i < this.currentScene.videos.length; i++) {
                const video = this.currentScene.videos[i];
                accumulatedVideoTime += video.duration || 8;
                if (elapsedAudioTime <= accumulatedVideoTime) {
                    newMediaUrl = video.videoUrl || video.imageUrl || this.currentScene.imageUrl;
                    found = true;
                    break;
                }
            }
            if (!found) {
                const lastVideo = this.currentScene.videos[this.currentScene.videos.length - 1];
                newMediaUrl = lastVideo.videoUrl || lastVideo.imageUrl || this.currentScene.imageUrl;
            }
        }

        if (this.currentMediaUrl !== newMediaUrl) {
            this.currentMediaUrl = newMediaUrl;
            this.cd.markForCheck();
        }
    }

    // --- HÀM MỚI: Cắt chữ ---
    prepareSubtitleChunks(text: string) {
        if (!text) return;
        const words = text.split(' ');
        this.textChunks = [];

        // Tối đa khoảng 22 chữ cho 2 dòng hiển thị đẹp nhất
        const wordsPerChunk = 22;

        for (let i = 0; i < words.length; i += wordsPerChunk) {
            const chunkText = words.slice(i, i + wordsPerChunk).join(' ');
            this.textChunks.push({
                text: chunkText,
                weight: chunkText.length // Dùng độ dài ký tự làm trọng số chia thời gian
            });
        }
    }

    // --- CẬP NHẬT HÀM PLAY ---
    playCurrent() {
        if (!this.currentScene) return;

        // Xóa interval/timeout dự phòng cũ nếu có
        if (this.fallbackInterval) {
            clearInterval(this.fallbackInterval);
            clearTimeout(this.fallbackInterval);
        }

        // ==========================================
        // [QUAN TRỌNG] XỬ LÝ SCENE KHÔNG CÓ PHỤ ĐỀ
        // ==========================================
        if (!this.currentScene.subtitles || this.currentScene.subtitles.length === 0 || !this.currentSubtitle) {
            this.currentDisplayedText = ''; // Xóa chữ trên màn hình
            this.isPlaying = true;
            this.updateCurrentMediaUrl();
            this.cd.markForCheck();

            // Cho hiển thị hình ảnh/video không lời trong 5 giây rồi tự qua Scene tiếp theo
            this.fallbackInterval = setTimeout(() => {
                if (this.isPlaying) this.moveToNextSubtitle();
            }, 5000);
            return;
        }

        // ==========================================
        // XỬ LÝ SCENE CÓ PHỤ ĐỀ BÌNH THƯỜNG
        // ==========================================
        this.prepareSubtitleChunks(this.currentSubtitle.text);
        this.currentDisplayedText = this.textChunks.length > 0 ? this.textChunks[0].text : '';

        const audioUrl = this.currentSubtitle.audioUrl;

        if (audioUrl) {
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.load();

            this.audioPlayer.ontimeupdate = () => {
                this.updateCurrentMediaUrl();
                if (this.audioPlayer.duration && this.textChunks.length > 1) {
                    const currentTime = this.audioPlayer.currentTime;
                    const totalDuration = this.audioPlayer.duration;
                    const totalWeight = this.textChunks.reduce((sum, c) => sum + c.weight, 0);

                    let accumulatedWeight = 0;
                    let targetIndex = 0;

                    for (let i = 0; i < this.textChunks.length; i++) {
                        accumulatedWeight += this.textChunks[i].weight;
                        const chunkEndTime = (accumulatedWeight / totalWeight) * totalDuration;

                        if (currentTime <= chunkEndTime) {
                            targetIndex = i;
                            break;
                        }
                    }

                    if (this.currentDisplayedText !== this.textChunks[targetIndex].text) {
                        this.currentDisplayedText = this.textChunks[targetIndex].text;
                        this.cd.markForCheck();
                    }
                }
            };

            this.audioPlayer.play().then(() => {
                this.isPlaying = true;
                this.updateCurrentMediaUrl();
                this.cd.markForCheck();
            }).catch(err => {
                console.error("Autoplay bị chặn hoặc file lỗi:", err);
                this.isPlaying = false;
                this.updateCurrentMediaUrl();
                this.cd.markForCheck();
            });
        } else {
            // Nếu có chữ nhưng chưa tạo file Audio, giả lập đọc 3 giây/đoạn
            this.isPlaying = true;
            this.updateCurrentMediaUrl();
            this.cd.markForCheck();

            let chunkIdx = 0;
            this.fallbackInterval = setInterval(() => {
                this.updateCurrentMediaUrl();
                chunkIdx++;
                if (chunkIdx < this.textChunks.length) {
                    this.currentDisplayedText = this.textChunks[chunkIdx].text;
                    this.cd.markForCheck();
                } else {
                    clearInterval(this.fallbackInterval);
                    if (this.isPlaying) this.moveToNextSubtitle();
                }
            }, 3000);
        }
    }

    moveToNextSubtitle() {
        if (!this.isPlaying) return;

        this.currentSubtitleIndex++;

        // Đo độ dài mảng thoại (Nếu không có mảng thì coi như độ dài = 0)
        const currentSubLength = this.currentScene.subtitles ? this.currentScene.subtitles.length : 0;

        // Hết câu thoại trong Scene (hoặc Scene đó rỗng) -> Chuyển Scene
        if (this.currentSubtitleIndex >= currentSubLength) {
            this.currentSubtitleIndex = 0;
            this.currentSceneIndex++;

            // Hết Scenes -> Lặp lại từ đầu (Loop Livestream)
            if (this.currentSceneIndex >= this.projectData.scenes.length) {
                this.currentSceneIndex = 0;
                console.log("=== Vòng lặp mới Livestream ===");
            }
        }

        this.playCurrent();
    }

    // Dừng âm thanh và dọn dẹp tiến trình ngay lập tức khi bấm nút X
    stopAudio() {
        this.isPlaying = false;
        this.hasStarted = false;

        // 1. Hủy bỏ bộ đếm thời gian ngay lập tức
        if (this.fallbackInterval) {
            clearInterval(this.fallbackInterval);
            this.fallbackInterval = null;
        }

        // 2. Giải phóng bộ nhớ Audio
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = ''; // Xóa nguồn để tránh tải ngầm
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
        }

        this.currentDisplayedText = 'Đã dừng livestream.';

        // 3. Ép Angular cập nhật lại UI (Cực kỳ quan trọng với OnPush)
        this.cd.markForCheck();

        const projectName = this.projectData?.title ? 
            this.projectData.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : 
            'project';
        this.router.navigate(['/voice2video', projectName, this.uuid]);
    }

    // --- TIỆN ÍCH KIỂM TRA ĐUÔI FILE ---
    isVideo(url: string | null): boolean {
        if (!url) return false;
        const cleanUrl = url.replace('file://', '').split('?')[0];
        const ext = cleanUrl.split('.').pop()?.toLowerCase();
        return ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
    }

    isImage(url: string | null): boolean {
        if (!url) return false;
        return !this.isVideo(url);
    }
}