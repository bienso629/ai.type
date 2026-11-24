import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    ChangeDetectorRef,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'livestream',
    templateUrl: './livestream.component.html',
    styleUrls: ['./livestream.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: false,
})
export class LivestreamComponent implements OnInit, OnDestroy {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';

    uuid: string = '';

    // Dữ liệu kịch bản / dự án livestream
    projectData: any = null;

    // Trạng thái Player
    currentSceneIndex: number = 0;
    currentSubtitleIndex: number = 0;

    currentDisplayedText: string = '';
    currentMediaUrl: string | null = null;
    textChunks: { text: string; weight: number }[] = [];
    currentChunkIndex: number = 0;
    fallbackTimeout: any = null;
    elapsedInterval: any = null;

    isPlaying: boolean = false;
    hasStarted: boolean = false;

    // Đối tượng Audio ẩn chạy ngầm
    audioPlayer: HTMLAudioElement;

    // Trình phát chuỗi video liên hoàn 2 bộ đệm (zero-gap double buffering)
    @ViewChild('chainVideoA') chainVideoARef?: ElementRef<HTMLVideoElement>;
    @ViewChild('chainVideoB') chainVideoBRef?: ElementRef<HTMLVideoElement>;
    activeVideoSlot: 'A' | 'B' = 'A';
    private _slotSrcA: string = '';
    private _slotSrcB: string = '';
    isVideoMuted: boolean = false;

    isMobileRatio: boolean = false;
    showSubtitle: boolean = true;
    exportWithSubtitle: boolean = true;

    // Chế độ Kiểm thử & Livestream sản phẩm Affiliate
    isPreviewMode: boolean = false;
    showDirectorCue: boolean = true;
    showProductCard: boolean = true;
    playbackRate: number = 1;
    elapsedSec: number = 0;

    private readonly _speedCycle = [1, 1.25, 1.5, 2];
    private _usingAudioForCurrentSub = false;
    private _usingSubtitleVideo = false;

    get isAffiliateLivestream(): boolean {
        return this.projectData?.sourceType === 'affiliate_livestream';
    }

    get affiliateProduct(): any {
        return this.projectData?.product || null;
    }

    get hasChainedSubtitleVideos(): boolean {
        const scenes = this.projectData?.scenes;
        if (!Array.isArray(scenes)) return false;
        return scenes.some((sc: any) =>
            Array.isArray(sc?.subtitles) && sc.subtitles.some((sub: any) => !!sub?.videoUrl),
        );
    }

    get isPlayingSubtitleVideo(): boolean {
        return !!(this.hasStarted && this._usingSubtitleVideo && this.currentSubtitle?.videoUrl);
    }

    get isBackdropMedia(): boolean {
        return !!(
            this.isAffiliateLivestream &&
            this.projectData?.backdropImageUrl &&
            this.currentMediaUrl === this.projectData.backdropImageUrl
        );
    }

    get currentScene() {
        return this.projectData?.scenes?.[this.currentSceneIndex];
    }

    get currentSubtitle() {
        return this.currentScene?.subtitles?.[this.currentSubtitleIndex];
    }

    get totalDurationSec(): number {
        if (!this.projectData?.scenes?.length) return 0;
        const sum = this.projectData.scenes.reduce((acc: number, sc: any) => {
            const subSum = (sc.subtitles || []).reduce((t: number, sub: any) => t + (Number(sub.duration) || 5), 0);
            return acc + (subSum > 0 ? subSum : Number(sc.durationSec) || 10);
        }, 0);
        return sum || Number(this.projectData.targetDurationSec) || 0;
    }

    get targetDurationSec(): number {
        return Number(this.projectData?.targetDurationSec) || this.totalDurationSec;
    }

    get progressPercent(): number {
        const total = this.totalDurationSec;
        if (!total) return 0;
        return Math.min(100, Math.round((this.elapsedSec / total) * 100));
    }

    get productDiscountPercent(): number {
        const p = this.affiliateProduct;
        if (!p || !p.original_price || !p.price || p.original_price <= p.price) return 0;
        return Math.round(((p.original_price - p.price) / p.original_price) * 100);
    }

    async exportCustomVideo(ratio: '9:16' | '16:9' | '1:1', quality: '1080p' | '2k' | '4k') {
        if (!this.projectData?.scenes?.length) {
            this.toastr.error('Kịch bản trống!');
            return;
        }

        const hasSub = !!this.exportWithSubtitle;
        const payload = {
            ...this.projectData,
            exportRatio: ratio,
            quality: quality,
            withSubtitle: hasSub,
        };

        this.toastr.info('Đang bắt đầu Render...');

        try {
            const res = await (window as any).electron.invoke('render-custom-video', payload);
            if (res?.success) {
                this.toastr.success('Render thành công!');
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
        public cd: ChangeDetectorRef,
    ) {
        this.audioPlayer = new Audio();
    }

    ngOnInit() {
        this.route.params.subscribe(async (params: Params) => {
            this.uuid = params['uuid'];

            if (this.uuid) {
                this.exportWithSubtitle = true;
                this.clearPlaybackTimers();
                this.hasStarted = false;
                this.isPlaying = false;
                this.elapsedSec = 0;

                if (this.multiAccountService.isReady) {
                    try {
                        await this.multiAccountService.isReady;
                    } catch (_) {}
                }

                const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.uuid}`;
                let loaded = this.multiAccountService.getItem(storageKey);
                if (!loaded) {
                    try {
                        const rawSession = sessionStorage.getItem(storageKey);
                        if (rawSession) loaded = JSON.parse(rawSession);
                    } catch (_) {}
                }
                this.projectData = loaded || null;

                const queryMode = this.route.snapshot.queryParamMap.get('mode');
                this.isPreviewMode = queryMode === 'preview' || !!this.projectData?.isPreviewMode;
                this.showDirectorCue = this.isPreviewMode;
                this.showProductCard = this.isAffiliateLivestream;
                this.playbackRate = 1;

                if (this.projectData?.aspectRatio === '9:16') {
                    this.isMobileRatio = true;
                } else if (this.projectData?.aspectRatio === '16:9') {
                    this.isMobileRatio = false;
                }

                if (this.projectData) {
                    try {
                        if (this.projectData?.title) {
                            const prefix = this.isPreviewMode ? 'Kiểm thử Livestream' : 'Livestream AI';
                            this.titleService.setTitle(`${prefix} | ${this.projectData.title}`);
                        }
                    } catch (error) {
                        console.error('Lỗi khi parse dữ liệu Livestream:', error);
                    }
                }

                if (this.projectData && this.projectData.scenes?.length > 0) {
                    this.audioPlayer.onended = () => {
                        this.moveToNextSubtitle();
                    };

                    this.audioPlayer.onerror = () => {
                        console.warn('Lỗi phát audio, tự động chuyển sang đọc phụ đề theo thời lượng...');
                        this._usingAudioForCurrentSub = false;
                        if (this.isPlaying) {
                            this.runTimedSubtitleChunks(this.currentChunkIndex);
                        }
                    };
                }

                this.cd.markForCheck();
            } else {
                this.router.navigate(['/tools']);
            }
        });
    }

    ngOnDestroy(): void {
        this.clearPlaybackTimers();
        this.pauseAllChainVideos(true);
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
            this.audioPlayer.ontimeupdate = null;
        }
    }

    private getVideoElement(slot: 'A' | 'B'): HTMLVideoElement | null {
        return slot === 'A' ? this.chainVideoARef?.nativeElement || null : this.chainVideoBRef?.nativeElement || null;
    }

    private getSlotSrc(slot: 'A' | 'B'): string {
        return slot === 'A' ? this._slotSrcA : this._slotSrcB;
    }

    private setSlotSrc(slot: 'A' | 'B', url: string): void {
        if (slot === 'A') this._slotSrcA = url;
        else this._slotSrcB = url;
    }

    private pauseAllChainVideos(clearSrc = false): void {
        this._usingSubtitleVideo = false;
        (['A', 'B'] as const).forEach((slot) => {
            const el = this.getVideoElement(slot);
            if (el) {
                try {
                    el.pause();
                    if (clearSrc) {
                        el.removeAttribute('src');
                        el.load();
                    }
                } catch (_) {}
            }
            if (clearSrc) {
                this.setSlotSrc(slot, '');
            }
        });
    }

    private getNextSubtitleRef(): { sceneIndex: number; subIndex: number; subtitle: any } | null {
        const scenes = this.projectData?.scenes;
        if (!Array.isArray(scenes) || scenes.length === 0) return null;

        let sIdx = this.currentSceneIndex;
        let subIdx = this.currentSubtitleIndex + 1;
        const totalScenes = scenes.length;

        for (let guard = 0; guard < totalScenes * 60 + 2; guard++) {
            const sc = scenes[sIdx];
            const subs = Array.isArray(sc?.subtitles) ? sc.subtitles : [];
            if (subIdx < subs.length) {
                return { sceneIndex: sIdx, subIndex: subIdx, subtitle: subs[subIdx] };
            }
            sIdx = (sIdx + 1) % totalScenes;
            subIdx = 0;
        }
        return null;
    }

    private preloadNextChainVideo(): void {
        const next = this.getNextSubtitleRef();
        const nextUrl = next?.subtitle?.videoUrl;
        if (!nextUrl) return;

        const standbySlot: 'A' | 'B' = this.activeVideoSlot === 'A' ? 'B' : 'A';
        const standbyEl = this.getVideoElement(standbySlot);
        if (!standbyEl) return;

        if (this.getSlotSrc(standbySlot) !== nextUrl) {
            this.setSlotSrc(standbySlot, nextUrl);
            standbyEl.muted = true;
            standbyEl.preload = 'auto';
            standbyEl.src = nextUrl;
            try {
                standbyEl.load();
            } catch (_) {}
        } else {
            try {
                standbyEl.pause();
                standbyEl.currentTime = 0;
            } catch (_) {}
        }
    }

    toggleVideoMute(): void {
        this.isVideoMuted = !this.isVideoMuted;
        const activeEl = this.getVideoElement(this.activeVideoSlot);
        if (activeEl && this._usingSubtitleVideo) {
            activeEl.muted = this.isVideoMuted;
        }
        this.cd.markForCheck();
    }

    onChainVideoTimeUpdate(slot: 'A' | 'B'): void {
        if (slot !== this.activeVideoSlot || !this._usingSubtitleVideo || !this.isPlaying) return;
        const el = this.getVideoElement(slot);
        if (!el) return;

        if (el.duration && isFinite(el.duration) && this.textChunks.length > 1) {
            const currentTime = el.currentTime;
            const totalDuration = el.duration;
            const totalWeight = this.textChunks.reduce((sum, c) => sum + c.weight, 0) || 1;
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

            this.currentChunkIndex = targetIndex;
            if (this.currentDisplayedText !== this.textChunks[targetIndex].text) {
                this.currentDisplayedText = this.textChunks[targetIndex].text;
                this.cd.markForCheck();
            }
        }
    }

    onChainVideoEnded(slot: 'A' | 'B'): void {
        if (slot !== this.activeVideoSlot || !this._usingSubtitleVideo || !this.isPlaying) return;
        this.moveToNextSubtitle();
    }

    onChainVideoError(slot: 'A' | 'B'): void {
        if (slot !== this.activeVideoSlot || !this._usingSubtitleVideo || !this.isPlaying) return;
        console.warn('[Livestream] Lỗi phát clip video câu thoại, tự động chuyển sang ảnh nền và nhắc lời theo thời lượng.');
        this._usingSubtitleVideo = false;
        this.updateCurrentMediaUrl();
        this.runTimedSubtitleChunks(this.currentChunkIndex);
    }

    private clearPlaybackTimers(): void {
        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            clearInterval(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }
        if (this.elapsedInterval) {
            clearInterval(this.elapsedInterval);
            this.elapsedInterval = null;
        }
    }

    private ensureElapsedTicker(): void {
        if (this.elapsedInterval) return;
        this.elapsedInterval = setInterval(() => {
            if (!this.isPlaying) return;
            this.elapsedSec = this.computeElapsedSeconds();
            this.cd.markForCheck();
        }, 500);
    }

    private computeElapsedSeconds(): number {
        if (!this.projectData?.scenes?.length) return 0;
        let sec = 0;
        for (let s = 0; s < this.currentSceneIndex; s++) {
            const sc = this.projectData.scenes[s];
            const subSum = (sc.subtitles || []).reduce((t: number, sub: any) => t + (Number(sub.duration) || 5), 0);
            sec += subSum > 0 ? subSum : Number(sc.durationSec) || 5;
        }
        const curSubs = this.currentScene?.subtitles || [];
        for (let i = 0; i < this.currentSubtitleIndex && i < curSubs.length; i++) {
            sec += Number(curSubs[i]?.duration) || 5;
        }
        const activeVideo = this._usingSubtitleVideo ? this.getVideoElement(this.activeVideoSlot) : null;
        if (activeVideo && isFinite(activeVideo.currentTime)) {
            sec += activeVideo.currentTime;
        } else if (this._usingAudioForCurrentSub && this.audioPlayer && isFinite(this.audioPlayer.currentTime)) {
            sec += this.audioPlayer.currentTime;
        } else if (this.currentSubtitle && this.textChunks.length > 0) {
            const subDur = Number(this.currentSubtitle.duration) || 5;
            sec += (this.currentChunkIndex / this.textChunks.length) * subDur;
        }
        return Math.round(sec);
    }

    // --- LOGIC ĐIỀU KHIỂN ---

    toggleSubtitle() {
        this.showSubtitle = !this.showSubtitle;
        this.cd.markForCheck();
    }

    toggleDirectorCue() {
        this.showDirectorCue = !this.showDirectorCue;
        this.cd.markForCheck();
    }

    toggleProductCard() {
        this.showProductCard = !this.showProductCard;
        this.cd.markForCheck();
    }

    cyclePlaybackRate() {
        const idx = this._speedCycle.indexOf(this.playbackRate);
        this.playbackRate = this._speedCycle[(idx + 1) % this._speedCycle.length];
        if (this.audioPlayer) {
            this.audioPlayer.playbackRate = this.playbackRate;
        }
        const activeEl = this.getVideoElement(this.activeVideoSlot);
        if (activeEl && this._usingSubtitleVideo) {
            activeEl.playbackRate = this.playbackRate;
        }
        this.cd.markForCheck();
    }

    switchToLiveMode() {
        this.isPreviewMode = false;
        this.showDirectorCue = false;
        this.playbackRate = 1;
        if (this.audioPlayer) {
            this.audioPlayer.playbackRate = 1;
        }
        const activeEl = this.getVideoElement(this.activeVideoSlot);
        if (activeEl) {
            activeEl.playbackRate = 1;
        }
        if (this.projectData?.title) {
            this.titleService.setTitle(`Livestream AI | ${this.projectData.title}`);
        }
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { mode: 'live' },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
        this.toastr.success('Đã chuyển sang chế độ phát Livestream thật (ẩn ghi chú đạo diễn và thông số nội bộ).');
        if (this.hasStarted) {
            this.restartLivestream();
        } else {
            this.cd.markForCheck();
        }
    }

    switchToPreviewMode() {
        this.isPreviewMode = true;
        this.showDirectorCue = true;
        if (this.projectData?.title) {
            this.titleService.setTitle(`Kiểm thử Livestream | ${this.projectData.title}`);
        }
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { mode: 'preview' },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
        this.cd.markForCheck();
    }

    returnToEditScript() {
        this.stopPlaybackOnly();
        const offerId = this.projectData?.offerId;
        if (offerId) {
            this.router.navigate(['/settings'], {
                queryParams: { tab: 'affiliate', livestreamOffer: offerId },
            });
        } else if (this.projectData?.returnUrl) {
            this.router.navigateByUrl(this.projectData.returnUrl);
        } else {
            this.router.navigate(['/settings'], { queryParams: { tab: 'affiliate' } });
        }
    }

    toggleScreenRatio() {
        this.isMobileRatio = !this.isMobileRatio;

        let targetWidth = 1440;
        let targetHeight = 900;

        if (this.isMobileRatio) {
            targetWidth = 450;
            targetHeight = 800;
        }

        if ((window as any).electron && (window as any).electron.resizeWindow) {
            (window as any).electron.resizeWindow(targetWidth, targetHeight);
        }

        this.cd.markForCheck();
    }

    startLivestream() {
        if (!this.projectData) return;
        this.hasStarted = true;
        this.currentSceneIndex = 0;
        this.currentSubtitleIndex = 0;
        this.elapsedSec = 0;
        this.ensureElapsedTicker();
        this.playCurrent();
    }

    restartLivestream() {
        if (!this.projectData?.scenes?.length) return;
        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
        }
        this.pauseAllChainVideos(false);
        this.hasStarted = true;
        this.isPlaying = true;
        this.currentSceneIndex = 0;
        this.currentSubtitleIndex = 0;
        this.elapsedSec = 0;
        this.ensureElapsedTicker();
        this.playCurrent();
    }

    prevScene() {
        if (!this.projectData?.scenes?.length) return;
        const prev = this.currentSceneIndex > 0 ? this.currentSceneIndex - 1 : this.projectData.scenes.length - 1;
        this.jumpToScene(prev, true);
    }

    nextScene() {
        if (!this.projectData?.scenes?.length) return;
        const next = (this.currentSceneIndex + 1) % this.projectData.scenes.length;
        this.jumpToScene(next, true);
    }

    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.ensureElapsedTicker();
            if (this._usingSubtitleVideo) {
                const activeEl = this.getVideoElement(this.activeVideoSlot);
                if (activeEl) {
                    activeEl.playbackRate = this.playbackRate;
                    activeEl.muted = this.isVideoMuted;
                    activeEl.play().catch(() => {});
                }
            } else if (this._usingAudioForCurrentSub && this.audioPlayer.src) {
                this.audioPlayer.playbackRate = this.playbackRate;
                this.audioPlayer.play().catch(() => {});
            } else {
                this.runTimedSubtitleChunks(this.currentChunkIndex);
            }
        } else {
            if (this.fallbackTimeout) {
                clearTimeout(this.fallbackTimeout);
                this.fallbackTimeout = null;
            }
            if (this._usingSubtitleVideo) {
                const activeEl = this.getVideoElement(this.activeVideoSlot);
                if (activeEl) activeEl.pause();
            }
            if (this._usingAudioForCurrentSub && this.audioPlayer) {
                this.audioPlayer.pause();
            }
        }
        this.cd.markForCheck();
    }

    jumpToScene(index: number, force = false) {
        if ((!force && index === this.currentSceneIndex) || index < 0 || index >= this.projectData.scenes.length) {
            return;
        }

        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.pauseAllChainVideos(false);

        this.currentSceneIndex = index;
        this.currentSubtitleIndex = 0;
        this.currentChunkIndex = 0;
        this.hasStarted = true;
        this.isPlaying = true;
        this.elapsedSec = this.computeElapsedSeconds();
        this.ensureElapsedTicker();
        this.updateCurrentMediaUrl();
        this.playCurrent();
    }

    updateCurrentMediaUrl() {
        if (!this.currentScene) {
            this.currentMediaUrl = null;
            return;
        }

        let newMediaUrl = this.currentScene.imageUrl || this.affiliateProduct?.image_url || null;

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

    prepareSubtitleChunks(text: string) {
        this.textChunks = [];
        this.currentChunkIndex = 0;
        if (!text) return;
        const words = text.split(/\s+/).filter(Boolean);
        const wordsPerChunk = this.isMobileRatio ? 16 : 22;

        for (let i = 0; i < words.length; i += wordsPerChunk) {
            const chunkText = words.slice(i, i + wordsPerChunk).join(' ');
            this.textChunks.push({
                text: chunkText,
                weight: Math.max(1, chunkText.length),
            });
        }
    }

    private runTimedSubtitleChunks(startIdx: number): void {
        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }
        if (!this.isPlaying) return;

        if (!this.textChunks.length) {
            this.fallbackTimeout = setTimeout(() => {
                if (this.isPlaying) this.moveToNextSubtitle();
            }, Math.round(3500 / this.playbackRate));
            return;
        }

        this.currentChunkIndex = Math.max(0, Math.min(startIdx, this.textChunks.length - 1));
        this.currentDisplayedText = this.textChunks[this.currentChunkIndex].text;
        this.elapsedSec = this.computeElapsedSeconds();
        this.cd.markForCheck();

        const subDurationSec = Math.max(1, Number(this.currentSubtitle?.duration) || this.textChunks.length * 3.2);
        const totalWeight = this.textChunks.reduce((sum, c) => sum + c.weight, 0) || 1;
        const chunkWeight = this.textChunks[this.currentChunkIndex].weight;
        const chunkMs = Math.max(500, Math.round(((chunkWeight / totalWeight) * subDurationSec * 1000) / this.playbackRate));

        this.fallbackTimeout = setTimeout(() => {
            if (!this.isPlaying) return;
            this.updateCurrentMediaUrl();
            if (this.currentChunkIndex + 1 < this.textChunks.length) {
                this.runTimedSubtitleChunks(this.currentChunkIndex + 1);
            } else {
                this.moveToNextSubtitle();
            }
        }, chunkMs);
    }

    playCurrent() {
        if (!this.currentScene) return;

        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }

        if (!this.currentScene.subtitles || this.currentScene.subtitles.length === 0 || !this.currentSubtitle) {
            this._usingAudioForCurrentSub = false;
            this.currentDisplayedText = '';
            this.isPlaying = true;
            this.updateCurrentMediaUrl();
            this.cd.markForCheck();

            this.fallbackTimeout = setTimeout(() => {
                if (this.isPlaying) this.moveToNextSubtitle();
            }, Math.round(5000 / this.playbackRate));
            return;
        }

        this.prepareSubtitleChunks(this.currentSubtitle.text);
        this.currentDisplayedText = this.textChunks.length > 0 ? this.textChunks[0].text : '';
        this.elapsedSec = this.computeElapsedSeconds();

        // Ưu tiên phát chuỗi video liên hoàn nếu câu thoại hiện tại đã import file video
        const subVideoUrl = this.currentSubtitle.videoUrl;
        if (subVideoUrl) {
            this.audioPlayer.pause();
            this._usingAudioForCurrentSub = false;
            this._usingSubtitleVideo = true;
            this.isPlaying = true;
            this.currentMediaUrl = subVideoUrl;

            const currentSlot = this.activeVideoSlot;
            const standbySlot: 'A' | 'B' = currentSlot === 'A' ? 'B' : 'A';
            const standbyEl = this.getVideoElement(standbySlot);
            const currentEl = this.getVideoElement(currentSlot);

            let targetSlot: 'A' | 'B' = currentSlot;
            let targetEl: HTMLVideoElement | null = currentEl;

            if (standbyEl && this.getSlotSrc(standbySlot) === subVideoUrl) {
                // Đã nạp sẵn vào bộ đệm dự phòng -> tráo khe ngay lập tức (zero-gap transition)
                targetSlot = standbySlot;
                targetEl = standbyEl;
                this.activeVideoSlot = targetSlot;
            } else if (targetEl) {
                if (this.getSlotSrc(targetSlot) !== subVideoUrl) {
                    this.setSlotSrc(targetSlot, subVideoUrl);
                    targetEl.src = subVideoUrl;
                }
            }

            const prevEl = targetSlot === 'A' ? this.getVideoElement('B') : this.getVideoElement('A');
            if (targetEl) {
                try {
                    targetEl.currentTime = 0;
                } catch (_) {}
                targetEl.muted = this.isVideoMuted;
                targetEl.playbackRate = this.playbackRate;
                targetEl
                    .play()
                    .then(() => {
                        if (prevEl && prevEl !== targetEl) {
                            try {
                                prevEl.pause();
                            } catch (_) {}
                        }
                        this.preloadNextChainVideo();
                        this.cd.markForCheck();
                    })
                    .catch(() => {
                        // Nếu trình duyệt chặn autoplay có tiếng, tự động phát tắt tiếng để không gián đoạn chuỗi live
                        if (targetEl) {
                            targetEl.muted = true;
                            this.isVideoMuted = true;
                            targetEl
                                .play()
                                .then(() => {
                                    if (prevEl && prevEl !== targetEl) {
                                        try {
                                            prevEl.pause();
                                        } catch (_) {}
                                    }
                                    this.preloadNextChainVideo();
                                    this.cd.markForCheck();
                                })
                                .catch(() => {
                                    this._usingSubtitleVideo = false;
                                    this.updateCurrentMediaUrl();
                                    this.runTimedSubtitleChunks(0);
                                });
                        }
                    });
            } else {
                this._usingSubtitleVideo = false;
                this.updateCurrentMediaUrl();
                this.runTimedSubtitleChunks(0);
            }

            this.cd.markForCheck();
            return;
        }

        // Nếu câu thoại này không có video riêng, tạm dừng bộ phát chuỗi video và chuyển về ảnh nền + TTS / phụ đề
        if (this._usingSubtitleVideo) {
            this.pauseAllChainVideos(false);
        }

        const audioUrl = this.currentSubtitle.audioUrl;

        if (audioUrl) {
            this._usingAudioForCurrentSub = true;
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.playbackRate = this.playbackRate;
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

                    this.currentChunkIndex = targetIndex;
                    if (this.currentDisplayedText !== this.textChunks[targetIndex].text) {
                        this.currentDisplayedText = this.textChunks[targetIndex].text;
                        this.cd.markForCheck();
                    }
                }
            };

            this.audioPlayer
                .play()
                .then(() => {
                    this.isPlaying = true;
                    this.audioPlayer.playbackRate = this.playbackRate;
                    this.updateCurrentMediaUrl();
                    this.cd.markForCheck();
                })
                .catch((err) => {
                    console.warn('Autoplay bị chặn hoặc file audio không phát được, chuyển sang nhắc lời tự động:', err);
                    this._usingAudioForCurrentSub = false;
                    this.isPlaying = true;
                    this.updateCurrentMediaUrl();
                    this.runTimedSubtitleChunks(0);
                });
        } else {
            this._usingAudioForCurrentSub = false;
            this.isPlaying = true;
            this.updateCurrentMediaUrl();
            this.runTimedSubtitleChunks(0);
        }
    }

    moveToNextSubtitle() {
        if (!this.isPlaying) return;

        this.currentSubtitleIndex++;

        const currentSubLength = this.currentScene?.subtitles ? this.currentScene.subtitles.length : 0;

        if (this.currentSubtitleIndex >= currentSubLength) {
            this.currentSubtitleIndex = 0;
            this.currentSceneIndex++;

            if (this.currentSceneIndex >= this.projectData.scenes.length) {
                this.currentSceneIndex = 0;
                this.elapsedSec = 0;
                if (this.isPreviewMode) {
                    this.toastr.info('Đã chạy hết 1 vòng kịch bản kiểm thử, hệ thống tự động phát lặp lại từ đầu.');
                }
            }
        }

        this.playCurrent();
    }

    private stopPlaybackOnly(): void {
        this.isPlaying = false;
        this.hasStarted = false;
        this.clearPlaybackTimers();
        this.pauseAllChainVideos(true);
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
            this.audioPlayer.ontimeupdate = null;
        }
        this.currentDisplayedText = 'Đã dừng livestream.';
        this.cd.markForCheck();
    }

    stopAudio() {
        this.stopPlaybackOnly();

        if (this.projectData?.returnUrl) {
            this.router.navigateByUrl(this.projectData.returnUrl);
            return;
        }

        const projectName = this.projectData?.title
            ? this.projectData.title
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '')
            : 'project';
        this.router.navigate(['/voice2video', projectName, this.uuid]);
    }

    formatTime(totalSec: number): string {
        const safe = Math.max(0, Math.round(Number(totalSec) || 0));
        const mins = Math.floor(safe / 60);
        const secs = safe % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    formatVnd(amount: number | undefined): string {
        const num = Number(amount) || 0;
        if (num <= 0) return '-';
        return num.toLocaleString('vi-VN') + ' ₫';
    }

    isVideo(url: string | null): boolean {
        if (!url) return false;
        if (url.startsWith('blob:')) return true;
        const cleanUrl = url.replace(/^(file|media):\/+/i, '').split('?')[0];
        const ext = cleanUrl.split('.').pop()?.toLowerCase();
        return ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'flv'].includes(ext || '');
    }

    isImage(url: string | null): boolean {
        if (!url) return false;
        return !this.isVideo(url);
    }
}
