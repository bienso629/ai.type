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
    
    isPlaying: boolean = false;
    hasStarted: boolean = false; 
    
    // Đối tượng Audio ẩn chạy ngầm
    audioPlayer: HTMLAudioElement;

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

    playCurrent() {
        if (!this.currentSubtitle) return;

        const audioUrl = this.currentSubtitle.audioUrl;
        
        if (audioUrl) {
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.load();
            this.audioPlayer.play().then(() => {
                this.isPlaying = true;
                this.cd.markForCheck(); 
            }).catch(err => {
                console.error("Autoplay bị chặn hoặc file lỗi:", err);
                this.isPlaying = false;
                this.cd.markForCheck();
            });
        } else {
            // Đóng vai trò fallback nếu câu thoại bị thiếu audio
            this.isPlaying = true;
            this.cd.markForCheck();
            setTimeout(() => {
                if (this.isPlaying) this.moveToNextSubtitle();
            }, 3000);
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