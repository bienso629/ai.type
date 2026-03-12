import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

@Component({
    selector: 'livestream',
    templateUrl: './livestream.component.html',
    styleUrls: ['./livestream.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class LivestreamComponent implements OnInit, OnDestroy {
    // Để trống ban đầu, sẽ load từ localStorage
    projectData: any = null;

    // Các biến trạng thái của Player
    currentSceneIndex: number = 0;
    currentSubtitleIndex: number = 0;

    currentDisplayedText: string = '';
    textChunks: { text: string, weight: number }[] = [];
    fallbackInterval: any;

    isPlaying: boolean = false;
    hasStarted: boolean = false;

    // Đối tượng Audio ẩn chạy ngầm
    audioPlayer: HTMLAudioElement;

    isMobileRatio: boolean = false;

    // Các biến Getter
    get currentScene() {
        return this.projectData?.scenes?.[this.currentSceneIndex];
    }

    get currentSubtitle() {
        return this.currentScene?.subtitles?.[this.currentSubtitleIndex];
    }

    constructor(
        private titleService: Title,
        private router: Router,
        public dialog: MatDialog,
        private cd: ChangeDetectorRef
    ) {
        this.audioPlayer = new Audio();
    }

    ngOnInit() {
        // 1. Load dữ liệu từ localStorage
        const rawData = localStorage.getItem('ai_type_video_ready_data');
        if (rawData) {
            try {
                this.projectData = JSON.parse(rawData);
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
    }

    ngOnDestroy(): void {
        // Hủy audio khi thoát trang để tránh bị phát tiếng ngầm
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
        }
    }

    // --- LOGIC ĐIỀU KHIỂN ---

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
        this.playCurrent();
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
        if (!this.currentSubtitle) return;

        // 1. Chuẩn bị cắt chữ và gán đoạn đầu tiên lên màn hình
        this.prepareSubtitleChunks(this.currentSubtitle.text);
        this.currentDisplayedText = this.textChunks.length > 0 ? this.textChunks[0].text : '';

        const audioUrl = this.currentSubtitle.audioUrl;

        // Xóa interval dự phòng cũ nếu có
        if (this.fallbackInterval) clearInterval(this.fallbackInterval);

        if (audioUrl) {
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.load();

            // 2. Bắt sự kiện thời gian thực của Audio để đổi chữ
            this.audioPlayer.ontimeupdate = () => {
                if (this.audioPlayer.duration && this.textChunks.length > 1) {
                    const currentTime = this.audioPlayer.currentTime;
                    const totalDuration = this.audioPlayer.duration;

                    // Tính tổng trọng số (tổng số ký tự)
                    const totalWeight = this.textChunks.reduce((sum, c) => sum + c.weight, 0);

                    let accumulatedWeight = 0;
                    let targetIndex = 0;

                    // Tìm xem với giây hiện tại thì đang đọc tới đoạn chunk nào
                    for (let i = 0; i < this.textChunks.length; i++) {
                        accumulatedWeight += this.textChunks[i].weight;
                        const chunkEndTime = (accumulatedWeight / totalWeight) * totalDuration;

                        if (currentTime <= chunkEndTime) {
                            targetIndex = i;
                            break;
                        }
                    }

                    // Nếu nhảy sang đoạn mới thì cập nhật UI
                    if (this.currentDisplayedText !== this.textChunks[targetIndex].text) {
                        this.currentDisplayedText = this.textChunks[targetIndex].text;
                        this.cd.markForCheck();
                    }
                }
            };

            this.audioPlayer.play().then(() => {
                this.isPlaying = true;
                this.cd.markForCheck();
            }).catch(err => {
                console.error("Autoplay bị chặn hoặc file lỗi:", err);
                this.isPlaying = false;
                this.cd.markForCheck();
            });
        } else {
            // Nếu không có Audio, giả lập đổi chữ mỗi 3 giây
            this.isPlaying = true;
            this.cd.markForCheck();

            let chunkIdx = 0;
            this.fallbackInterval = setInterval(() => {
                chunkIdx++;
                if (chunkIdx < this.textChunks.length) {
                    this.currentDisplayedText = this.textChunks[chunkIdx].text;
                    this.cd.markForCheck();
                } else {
                    clearInterval(this.fallbackInterval);
                    if (this.isPlaying) this.moveToNextSubtitle();
                }
            }, 3000); // 3 giây đổi 1 đoạn
        }
    }

    moveToNextSubtitle() {
        if (!this.isPlaying) return;

        this.currentSubtitleIndex++;

        // Hết câu thoại trong Scene -> Chuyển Scene
        if (this.currentSubtitleIndex >= this.currentScene.subtitles.length) {
            this.currentSubtitleIndex = 0;
            this.currentSceneIndex++;

            // Hết Scenes -> Lặp lại từ đầu (Loop)
            if (this.currentSceneIndex >= this.projectData.scenes.length) {
                this.currentSceneIndex = 0;
                console.log("=== Vòng lặp mới Livestream ===");
            }
        }

        this.playCurrent();
    }

    // --- TIỆN ÍCH KIỂM TRA ĐUÔI FILE ---
    isVideo(url: string): boolean {
        if (!url) return false;
        const cleanUrl = url.replace('file://', '').split('?')[0];
        const ext = cleanUrl.split('.').pop()?.toLowerCase();
        return ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
    }

    isImage(url: string): boolean {
        if (!url) return false;
        return !this.isVideo(url);
    }
}