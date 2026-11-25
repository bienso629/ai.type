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

export interface LivestreamOverlayImage {
    id: string;
    name: string;
    src: string;
    xPct: number;
    yPct: number;
    widthPct: number;
    naturalWidth?: number;
    naturalHeight?: number;
    visible: boolean;
}

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
    @ViewChild('stageFrame') stageFrameRef?: ElementRef<HTMLDivElement>;
    @ViewChild('productCardEl') productCardRef?: ElementRef<HTMLDivElement>;
    @ViewChild('chainVideoA') chainVideoARef?: ElementRef<HTMLVideoElement>;
    @ViewChild('chainVideoB') chainVideoBRef?: ElementRef<HTMLVideoElement>;
    activeVideoSlot: 'A' | 'B' = 'A';
    private _slotSrcA: string = '';
    private _slotSrcB: string = '';
    isVideoMuted: boolean = false;

    // Vị trí kéo thả thẻ ghim sản phẩm trong khung video
    productCardPos: { x: number; y: number } | null = null;
    isDraggingProductCard: boolean = false;
    private _dragStartPointerX = 0;
    private _dragStartPointerY = 0;
    private _dragStartCardX = 0;
    private _dragStartCardY = 0;
    private readonly _dragPadding = 8;
    private _isDestroyed = false;
    private _boundPointerMove = (e: PointerEvent) => this.onProductCardPointerMove(e);
    private _boundPointerUp = () => this.onProductCardPointerUp();
    private _boundWindowResize = () => this.clampProductCardPosition();

    // Danh sách hình ảnh lớp phủ (PNG, JPG, WebP, GIF, SVG nền trong suốt) kéo thả & chỉnh cỡ trong khung video
    overlayImages: LivestreamOverlayImage[] = [];
    activeOverlayId: string | null = null;
    private _overlayActionMode: 'drag' | 'resize' | null = null;
    private _overlayActionStartPointerX = 0;
    private _overlayActionStartPointerY = 0;
    private _overlayActionStartXPct = 0;
    private _overlayActionStartYPct = 0;
    private _overlayActionStartWidthPct = 0;
    private _overlayActionElemHeightPct = 0;
    private _lastOverlaySyncAt = 0;
    private _boundOverlayPointerMove = (e: PointerEvent) => this.onOverlayPointerMove(e);
    private _boundOverlayPointerUp = () => this.onOverlayPointerUp();

    isMobileRatio: boolean = false;
    showSubtitle: boolean = false;
    exportWithSubtitle: boolean = true;

    // Chế độ Kiểm thử & Livestream sản phẩm Affiliate
    isPreviewMode: boolean = false;
    isStandaloneLiveWindow: boolean = false;
    isLiveWindowOpen: boolean = false;
    showDirectorCue: boolean = false;
    showProductCard: boolean = false;
    playbackRate: number = 1;
    elapsedSec: number = 0;
    private _pendingProductCardRatio: { xRatio: number; yRatio: number } | null = null;
    private _unsubLiveCommand: (() => void) | null = null;
    private _unsubLiveState: (() => void) | null = null;
    private _unsubLiveClosed: (() => void) | null = null;
    private _broadcastChannel: BroadcastChannel | null = null;
    private _browserLivePopup: Window | null = null;
    private _browserPopupPollTimer: any = null;
    private _lastPosSyncAt = 0;

    private readonly _speedCycle = [1, 1.25, 1.5, 2];
    private _usingAudioForCurrentSub = false;
    private _usingSubtitleVideo = false;
    private _usingSceneVideo = false;
    private _playingSceneVideoIndex = -1;

    private get _usingChainVideo(): boolean {
        return this._usingSceneVideo || this._usingSubtitleVideo;
    }

    get isAffiliateLivestream(): boolean {
        return this.projectData?.sourceType === 'affiliate_livestream';
    }

    get affiliateProduct(): any {
        return this.projectData?.product || null;
    }

    get hasChainedSubtitleVideos(): boolean {
        const scenes = this.projectData?.scenes;
        if (!Array.isArray(scenes)) return false;
        return scenes.some(
            (sc: any) =>
                !!sc?.videoUrl ||
                (Array.isArray(sc?.subtitles) && sc.subtitles.some((sub: any) => !!sub?.videoUrl)),
        );
    }

    get isPlayingSubtitleVideo(): boolean {
        return !!(
            this.hasStarted &&
            ((this._usingSceneVideo && this.currentScene?.videoUrl) ||
                (this._usingSubtitleVideo && this.currentSubtitle?.videoUrl))
        );
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
            if (sc?.videoUrl && Number(sc?.videoDurationSec) > 0) {
                return acc + Number(sc.videoDurationSec);
            }
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
        window.addEventListener('resize', this._boundWindowResize);
        this.route.params.subscribe(async (params: Params) => {
            this.uuid = params['uuid'];

            if (this.uuid) {
                this.exportWithSubtitle = true;
                this.clearPlaybackTimers();
                this.hasStarted = false;
                this.isPlaying = false;
                this.elapsedSec = 0;
                this.productCardPos = null;
                this.isDraggingProductCard = false;

                if (this.multiAccountService.isReady) {
                    try {
                        await this.multiAccountService.isReady;
                    } catch (_) {}
                }

                const queryMode = this.route.snapshot.queryParamMap.get('mode');
                const queryWindow = this.route.snapshot.queryParamMap.get('window');
                const queryRatio = this.route.snapshot.queryParamMap.get('ratio');
                const queryAutostart = this.route.snapshot.queryParamMap.get('autostart');
                this.isStandaloneLiveWindow = queryWindow === '1' || queryWindow === 'true';

                const snapshotKey = `livestream_live_snapshot_${this.uuid}`;
                let liveSnapshot: any = null;
                try {
                    const rawSnap = localStorage.getItem(snapshotKey);
                    if (rawSnap) liveSnapshot = JSON.parse(rawSnap);
                } catch (_) {}

                const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.uuid}`;
                let loaded =
                    this.isStandaloneLiveWindow && liveSnapshot?.projectData
                        ? liveSnapshot.projectData
                        : this.multiAccountService.getItem(storageKey);
                if (!loaded && liveSnapshot?.projectData) {
                    loaded = liveSnapshot.projectData;
                }
                if (!loaded) {
                    try {
                        const rawSession = sessionStorage.getItem(storageKey);
                        if (rawSession) loaded = JSON.parse(rawSession);
                    } catch (_) {}
                }
                this.projectData = loaded || null;

                this.isPreviewMode =
                    queryMode === 'live'
                        ? false
                        : queryMode === 'preview' || !!this.projectData?.isPreviewMode;
                this.showDirectorCue = false;
                this.showProductCard =
                    this.isStandaloneLiveWindow && liveSnapshot ? !!liveSnapshot.showProductCard : false;
                this.showSubtitle =
                    this.isStandaloneLiveWindow && liveSnapshot ? !!liveSnapshot.showSubtitle : false;
                if (this.isStandaloneLiveWindow && liveSnapshot && typeof liveSnapshot.isVideoMuted === 'boolean') {
                    this.isVideoMuted = liveSnapshot.isVideoMuted;
                }
                this._pendingProductCardRatio =
                    this.isStandaloneLiveWindow && liveSnapshot?.productCardPosRatio
                        ? liveSnapshot.productCardPosRatio
                        : null;
                this.overlayImages = this.loadInitialOverlayImages(liveSnapshot);
                this.activeOverlayId = null;
                this._overlayActionMode = null;
                this.playbackRate = 1;

                const effectiveRatio =
                    queryRatio ||
                    (this.isStandaloneLiveWindow ? liveSnapshot?.aspectRatio : '') ||
                    this.projectData?.aspectRatio;
                if (effectiveRatio === '9:16') {
                    this.isMobileRatio = true;
                } else if (effectiveRatio === '16:9') {
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

                    if (queryAutostart === '1' || queryAutostart === 'true') {
                        setTimeout(() => {
                            if (this._isDestroyed) return;
                            this.startLivestream();
                            this.applyPendingProductCardPosition();
                            this.broadcastLiveState();
                        }, 60);
                    }
                }

                this.setupLiveControlBridge();
                this.cd.markForCheck();
            } else {
                this.router.navigate(['/tools']);
            }
        });
    }

    ngOnDestroy(): void {
        this._isDestroyed = true;
        if (this.isStandaloneLiveWindow) {
            try {
                this._broadcastChannel?.postMessage({ channel: 'closed', uuid: this.uuid });
            } catch (_) {}
        } else if (this.isLiveWindowOpen) {
            this.closeLiveBroadcastWindow(true);
        }
        this.teardownLiveControlBridge();
        window.removeEventListener('pointermove', this._boundPointerMove);
        window.removeEventListener('pointerup', this._boundPointerUp);
        window.removeEventListener('pointercancel', this._boundPointerUp);
        window.removeEventListener('pointermove', this._boundOverlayPointerMove);
        window.removeEventListener('pointerup', this._boundOverlayPointerUp);
        window.removeEventListener('pointercancel', this._boundOverlayPointerUp);
        window.removeEventListener('resize', this._boundWindowResize);
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
        this._usingSceneVideo = false;
        this._playingSceneVideoIndex = -1;
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

    private getNextChainVideoUrl(): string {
        const scenes = this.projectData?.scenes;
        if (!Array.isArray(scenes) || scenes.length === 0) return '';

        if (this._usingSceneVideo) {
            const nextSceneIdx = (this.currentSceneIndex + 1) % scenes.length;
            const nextScene = scenes[nextSceneIdx];
            if (nextScene?.videoUrl) return nextScene.videoUrl;
            return nextScene?.subtitles?.[0]?.videoUrl || '';
        }

        const next = this.getNextSubtitleRef();
        if (!next) return '';
        if (next.sceneIndex !== this.currentSceneIndex && scenes[next.sceneIndex]?.videoUrl) {
            return scenes[next.sceneIndex].videoUrl;
        }
        return next.subtitle?.videoUrl || '';
    }

    private preloadNextChainVideo(): void {
        const nextUrl = this.getNextChainVideoUrl();
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
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'toggle-mute', value: this.isVideoMuted });
            this.cd.markForCheck();
            return;
        }
        const activeEl = this.getVideoElement(this.activeVideoSlot);
        if (activeEl && this._usingChainVideo) {
            activeEl.muted = this.isVideoMuted;
        }
        if (this.audioPlayer) {
            this.audioPlayer.muted = this.isVideoMuted;
        }
        this.broadcastLiveState();
        this.cd.markForCheck();
    }

    onChainVideoTimeUpdate(slot: 'A' | 'B'): void {
        if (slot !== this.activeVideoSlot || !this._usingChainVideo || !this.isPlaying) return;
        const el = this.getVideoElement(slot);
        if (!el) return;

        // Chế độ video tổng theo cảnh: tự động đồng bộ chuyển tiếp qua tất cả câu thoại trong cảnh theo tiến độ thực của video
        if (this._usingSceneVideo) {
            const subs = Array.isArray(this.currentScene?.subtitles) ? this.currentScene.subtitles : [];
            if (!subs.length || !el.duration || !isFinite(el.duration) || el.duration <= 0) return;

            const currentTime = Math.max(0, el.currentTime);
            const totalDuration = el.duration;
            const weights = subs.map((sub: any) => Math.max(1, Number(sub?.duration) || 1));
            const totalSubWeight = weights.reduce((sum: number, w: number) => sum + w, 0) || 1;

            let accWeight = 0;
            let targetSubIdx = subs.length - 1;
            let subStartTime = 0;
            let subEndTime = totalDuration;

            for (let i = 0; i < subs.length; i++) {
                const start = (accWeight / totalSubWeight) * totalDuration;
                accWeight += weights[i];
                const end = (accWeight / totalSubWeight) * totalDuration;
                if (currentTime <= end || i === subs.length - 1) {
                    targetSubIdx = i;
                    subStartTime = start;
                    subEndTime = end;
                    break;
                }
            }

            let changed = false;
            if (this.currentSubtitleIndex !== targetSubIdx) {
                this.currentSubtitleIndex = targetSubIdx;
                this.prepareSubtitleChunks(subs[targetSubIdx]?.text || '');
                changed = true;
            }

            if (this.textChunks.length > 0) {
                const subSpan = Math.max(0.1, subEndTime - subStartTime);
                const localTime = Math.max(0, currentTime - subStartTime);
                const totalChunkWeight = this.textChunks.reduce((sum, c) => sum + c.weight, 0) || 1;
                let accChunk = 0;
                let targetChunkIdx = 0;

                for (let j = 0; j < this.textChunks.length; j++) {
                    accChunk += this.textChunks[j].weight;
                    const chunkEnd = (accChunk / totalChunkWeight) * subSpan;
                    if (localTime <= chunkEnd || j === this.textChunks.length - 1) {
                        targetChunkIdx = j;
                        break;
                    }
                }

                this.currentChunkIndex = targetChunkIdx;
                const nextText = this.textChunks[targetChunkIdx].text;
                if (this.currentDisplayedText !== nextText) {
                    this.currentDisplayedText = nextText;
                    changed = true;
                }
            } else if (this.currentDisplayedText !== '') {
                this.currentDisplayedText = '';
                changed = true;
            }

            if (changed) {
                this.cd.markForCheck();
            }
            return;
        }

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
        if (slot !== this.activeVideoSlot || !this._usingChainVideo || !this.isPlaying) return;
        if (this._usingSceneVideo) {
            this.moveToNextScene();
            return;
        }
        this.moveToNextSubtitle();
    }

    onChainVideoError(slot: 'A' | 'B'): void {
        if (slot !== this.activeVideoSlot || !this._usingChainVideo || !this.isPlaying) return;
        console.warn('[Livestream] Lỗi phát video livestream, tự động chuyển sang ảnh nền và nhắc lời theo thời lượng.');
        this._usingSceneVideo = false;
        this._usingSubtitleVideo = false;
        this._playingSceneVideoIndex = -1;
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
            this.broadcastLiveState();
            this.cd.markForCheck();
        }, 500);
    }

    private computeElapsedSeconds(): number {
        if (!this.projectData?.scenes?.length) return 0;
        let sec = 0;
        for (let s = 0; s < this.currentSceneIndex; s++) {
            const sc = this.projectData.scenes[s];
            if (sc?.videoUrl && Number(sc?.videoDurationSec) > 0) {
                sec += Number(sc.videoDurationSec);
            } else {
                const subSum = (sc.subtitles || []).reduce((t: number, sub: any) => t + (Number(sub.duration) || 5), 0);
                sec += subSum > 0 ? subSum : Number(sc.durationSec) || 5;
            }
        }
        if (this._usingSceneVideo) {
            const activeVideo = this.getVideoElement(this.activeVideoSlot);
            if (activeVideo && isFinite(activeVideo.currentTime)) {
                sec += activeVideo.currentTime;
            }
            return Math.round(sec);
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
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'toggle-subtitle', value: this.showSubtitle });
            this.cd.markForCheck();
            return;
        }
        this.broadcastLiveState();
        this.cd.markForCheck();
    }

    toggleDirectorCue() {
        this.showDirectorCue = !this.showDirectorCue;
        this.cd.markForCheck();
    }

    toggleProductCard() {
        this.showProductCard = !this.showProductCard;
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({
                type: 'toggle-product-card',
                value: this.showProductCard,
                productCardPosRatio: this.getNormalizedProductCardRatio(),
            });
            this.cd.markForCheck();
            if (this.showProductCard && this.productCardPos) {
                setTimeout(() => this.clampProductCardPosition(), 0);
            }
            return;
        }
        this.broadcastLiveState();
        this.cd.markForCheck();
        if (this.showProductCard && this.productCardPos) {
            setTimeout(() => this.clampProductCardPosition(), 0);
        }
    }

    onProductCardPointerDown(event: PointerEvent): void {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const stageEl = this.stageFrameRef?.nativeElement;
        const cardEl = this.productCardRef?.nativeElement;
        if (!stageEl || !cardEl) return;

        event.stopPropagation();
        event.preventDefault();

        const stageRect = stageEl.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();
        const currentX = this.productCardPos ? this.productCardPos.x : cardRect.left - stageRect.left;
        const currentY = this.productCardPos ? this.productCardPos.y : cardRect.top - stageRect.top;

        this._dragStartPointerX = event.clientX;
        this._dragStartPointerY = event.clientY;
        this._dragStartCardX = currentX;
        this._dragStartCardY = currentY;
        this.productCardPos = { x: Math.round(currentX), y: Math.round(currentY) };
        this.isDraggingProductCard = true;

        window.addEventListener('pointermove', this._boundPointerMove, { passive: false });
        window.addEventListener('pointerup', this._boundPointerUp);
        window.addEventListener('pointercancel', this._boundPointerUp);
        this.cd.markForCheck();
    }

    private onProductCardPointerMove(event: PointerEvent): void {
        if (!this.isDraggingProductCard || this._isDestroyed) return;
        const stageEl = this.stageFrameRef?.nativeElement;
        const cardEl = this.productCardRef?.nativeElement;
        if (!stageEl || !cardEl) return;

        event.preventDefault();
        const dx = event.clientX - this._dragStartPointerX;
        const dy = event.clientY - this._dragStartPointerY;

        const pad = this._dragPadding;
        const maxX = Math.max(pad, stageEl.clientWidth - cardEl.offsetWidth - pad);
        const maxY = Math.max(pad, stageEl.clientHeight - cardEl.offsetHeight - pad);

        const nextX = Math.round(Math.min(maxX, Math.max(pad, this._dragStartCardX + dx)));
        const nextY = Math.round(Math.min(maxY, Math.max(pad, this._dragStartCardY + dy)));

        this.productCardPos = { x: nextX, y: nextY };
        try {
            this.cd.detectChanges();
        } catch (_) {}

        const now = Date.now();
        if (now - this._lastPosSyncAt >= 32) {
            this._lastPosSyncAt = now;
            if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
                const ratio = this.getNormalizedProductCardRatio();
                if (ratio) {
                    this.sendControlToLiveWindow({ type: 'set-product-card-pos', ratio });
                }
            } else if (this.isStandaloneLiveWindow) {
                this.broadcastLiveState();
            }
        }
    }

    private onProductCardPointerUp(): void {
        if (!this.isDraggingProductCard) return;
        this.isDraggingProductCard = false;
        window.removeEventListener('pointermove', this._boundPointerMove);
        window.removeEventListener('pointerup', this._boundPointerUp);
        window.removeEventListener('pointercancel', this._boundPointerUp);
        if (!this._isDestroyed) {
            if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
                const ratio = this.getNormalizedProductCardRatio();
                if (ratio) {
                    this.sendControlToLiveWindow({ type: 'set-product-card-pos', ratio });
                }
            } else if (this.isStandaloneLiveWindow) {
                this.broadcastLiveState();
            }
            this.cd.markForCheck();
        }
    }

    private clampProductCardPosition(): void {
        if (!this.productCardPos || this._isDestroyed) return;
        const stageEl = this.stageFrameRef?.nativeElement;
        const cardEl = this.productCardRef?.nativeElement;
        if (!stageEl || !cardEl) return;

        const pad = this._dragPadding;
        const maxX = Math.max(pad, stageEl.clientWidth - cardEl.offsetWidth - pad);
        const maxY = Math.max(pad, stageEl.clientHeight - cardEl.offsetHeight - pad);
        const clampedX = Math.round(Math.min(maxX, Math.max(pad, this.productCardPos.x)));
        const clampedY = Math.round(Math.min(maxY, Math.max(pad, this.productCardPos.y)));

        if (clampedX !== this.productCardPos.x || clampedY !== this.productCardPos.y) {
            this.productCardPos = { x: clampedX, y: clampedY };
            this.cd.markForCheck();
        }
    }

    // --- HÌNH ẢNH LỚP PHỦ (PNG, JPG, WebP, GIF, SVG NỀN TRONG SUỐT) ---

    private getOverlayStorageKey(): string {
        return `livestream_overlays_${this.uuid || 'default'}`;
    }

    private loadInitialOverlayImages(liveSnapshot: any): LivestreamOverlayImage[] {
        if (this.isStandaloneLiveWindow && Array.isArray(liveSnapshot?.overlayImages)) {
            return liveSnapshot.overlayImages.filter((o: any) => o && o.src).map((o: any) => ({ ...o }));
        }
        try {
            const raw = localStorage.getItem(this.getOverlayStorageKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed.filter((o: any) => o && o.src).map((o: any) => ({ ...o }));
                }
            }
        } catch (_) {}
        return [];
    }

    private persistOverlayImages(): void {
        if (this.isStandaloneLiveWindow) return;
        try {
            localStorage.setItem(this.getOverlayStorageKey(), JSON.stringify(this.overlayImages));
        } catch (_) {}
    }

    private syncOverlayImagesToLiveWindow(immediate = true): void {
        if (!this.isLiveWindowOpen || this.isStandaloneLiveWindow) return;
        const now = Date.now();
        if (!immediate && now - this._lastOverlaySyncAt < 32) return;
        this._lastOverlaySyncAt = now;
        this.sendControlToLiveWindow({
            type: 'sync-overlays',
            overlayImages: this.overlayImages.map((o) => ({ ...o })),
        });
    }

    private toElectronMediaUrl(filePath: string): string {
        const raw = String(filePath || '').trim();
        if (!raw) return '';
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:') || raw.startsWith('media://')) {
            return raw;
        }
        const normalized = raw.replace(/\\/g, '/').replace(/^file:\/+/i, '');
        if (/^[a-zA-Z]:\//.test(normalized)) {
            return `media:///${normalized}`;
        }
        return `media:///${normalized.replace(/^\/+/, '')}`;
    }

    private readFileAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh.'));
            reader.readAsDataURL(file);
        });
    }

    private probeImageDimensions(src: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = src;
        });
    }

    private guessImageExt(file: File): string {
        const lowerName = String(file.name || '').toLowerCase();
        const match = lowerName.match(/\.(png|jpe?g|webp|gif|svg|avif)$/);
        if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
        const mime = String(file.type || '').toLowerCase();
        if (mime.includes('png')) return 'png';
        if (mime.includes('webp')) return 'webp';
        if (mime.includes('gif')) return 'gif';
        if (mime.includes('svg')) return 'svg';
        if (mime.includes('avif')) return 'avif';
        return 'png';
    }

    async onOverlayImagesSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement | null;
        const files = input?.files;
        if (!files || files.length === 0) return;

        const electronApi = (window as any).electron;
        const username = this.projectData?.username || 'admin';
        const stageAspect = this.isMobileRatio ? 9 / 16 : 16 / 9;
        let addedCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isValidImg =
                file.type.startsWith('image/') ||
                /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(file.name || '');
            if (!isValidImg) continue;

            try {
                const dataUrl = await this.readFileAsDataUrl(file);
                if (!dataUrl) continue;
                const dims = await this.probeImageDimensions(dataUrl);

                let finalSrc = dataUrl;
                if (electronApi?.saveBase64 && dataUrl.startsWith('data:')) {
                    const b64Part = dataUrl.split(',')[1] || '';
                    if (b64Part) {
                        try {
                            const ext = this.guessImageExt(file);
                            const safeFileName = `overlay_${Date.now()}_${i}.${ext}`;
                            const saveRes = await electronApi.saveBase64({
                                base64: b64Part,
                                fileName: safeFileName,
                                customDataSubDir: `tts/${username}/${this.uuid || 'default'}/overlays`,
                            });
                            if (saveRes?.success && saveRes.path) {
                                finalSrc = this.toElectronMediaUrl(saveRes.path);
                            }
                        } catch (_) {}
                    }
                }

                // Tự động nhận diện ảnh khung viền toàn màn hình (đúng tỉ lệ khung 9:16 hoặc 16:9) so với logo/sticker
                const imgAspect = dims.width > 0 && dims.height > 0 ? dims.width / dims.height : 0;
                const isFullFrameOverlay =
                    imgAspect > 0 &&
                    dims.width >= 500 &&
                    dims.height >= 500 &&
                    Math.abs(imgAspect - stageAspect) / stageAspect <= 0.14;

                const idxOffset = this.overlayImages.length;
                const newOverlay: LivestreamOverlayImage = {
                    id: `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                    name: file.name || `image_${idxOffset + 1}.png`,
                    src: finalSrc,
                    xPct: isFullFrameOverlay ? 0 : 6 + ((idxOffset * 6) % 28),
                    yPct: isFullFrameOverlay ? 0 : 12 + ((idxOffset * 6) % 32),
                    widthPct: isFullFrameOverlay ? 100 : this.isMobileRatio ? 32 : 22,
                    naturalWidth: dims.width || undefined,
                    naturalHeight: dims.height || undefined,
                    visible: true,
                };

                this.overlayImages = [...this.overlayImages, newOverlay];
                this.activeOverlayId = newOverlay.id;
                addedCount += 1;
            } catch (err: any) {
                this.toastr.error(`Không thể import ảnh "${file.name}": ${err?.message || 'Lỗi không xác định'}`);
            }
        }

        if (input) input.value = '';

        if (addedCount > 0) {
            this.persistOverlayImages();
            this.syncOverlayImagesToLiveWindow(true);
            this.toastr.success(
                `Đã thêm ${addedCount} hình ảnh lớp phủ. Bạn có thể kéo thả hoặc kéo góc phải dưới để chỉnh kích thước trực tiếp trong khung video.`,
                'Hình ảnh lớp phủ',
            );
            this.cd.markForCheck();
        }
    }

    isInteractingWithOverlay(overlayId: string): boolean {
        return !!(this._overlayActionMode && this.activeOverlayId === overlayId);
    }

    onOverlayPointerDown(event: PointerEvent, overlay: LivestreamOverlayImage, mode: 'drag' | 'resize'): void {
        if (this.isStandaloneLiveWindow) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const stageEl = this.stageFrameRef?.nativeElement;
        if (!stageEl || !stageEl.clientWidth || !stageEl.clientHeight) return;

        event.stopPropagation();
        event.preventDefault();

        const targetWrap = (event.currentTarget as HTMLElement)?.closest('.ls-overlay-item') as HTMLElement | null;
        const elemHeightPct =
            targetWrap && stageEl.clientHeight > 0
                ? (targetWrap.offsetHeight / stageEl.clientHeight) * 100
                : 15;

        this.activeOverlayId = overlay.id;
        this._overlayActionMode = mode;
        this._overlayActionStartPointerX = event.clientX;
        this._overlayActionStartPointerY = event.clientY;
        this._overlayActionStartXPct = overlay.xPct;
        this._overlayActionStartYPct = overlay.yPct;
        this._overlayActionStartWidthPct = overlay.widthPct;
        this._overlayActionElemHeightPct = Math.min(100, Math.max(2, elemHeightPct));

        window.addEventListener('pointermove', this._boundOverlayPointerMove, { passive: false });
        window.addEventListener('pointerup', this._boundOverlayPointerUp);
        window.addEventListener('pointercancel', this._boundOverlayPointerUp);
        this.cd.markForCheck();
    }

    private onOverlayPointerMove(event: PointerEvent): void {
        if (!this._overlayActionMode || !this.activeOverlayId || this._isDestroyed) return;
        const stageEl = this.stageFrameRef?.nativeElement;
        if (!stageEl || !stageEl.clientWidth || !stageEl.clientHeight) return;

        const target = this.overlayImages.find((o) => o.id === this.activeOverlayId);
        if (!target) return;

        event.preventDefault();
        const dxPct = ((event.clientX - this._overlayActionStartPointerX) / stageEl.clientWidth) * 100;
        const dyPct = ((event.clientY - this._overlayActionStartPointerY) / stageEl.clientHeight) * 100;

        if (this._overlayActionMode === 'drag') {
            const maxX = Math.max(0, 100 - target.widthPct);
            const maxY = Math.max(0, 100 - this._overlayActionElemHeightPct);
            target.xPct = Math.round(Math.min(maxX, Math.max(0, this._overlayActionStartXPct + dxPct)) * 100) / 100;
            target.yPct = Math.round(Math.min(maxY, Math.max(0, this._overlayActionStartYPct + dyPct)) * 100) / 100;
        } else if (this._overlayActionMode === 'resize') {
            const maxWidth = Math.max(6, 100 - target.xPct);
            const nextWidth = Math.min(maxWidth, Math.max(6, this._overlayActionStartWidthPct + dxPct));
            target.widthPct = Math.round(nextWidth * 100) / 100;
        }

        try {
            this.cd.detectChanges();
        } catch (_) {}

        this.syncOverlayImagesToLiveWindow(false);
    }

    private onOverlayPointerUp(): void {
        if (!this._overlayActionMode) return;
        this._overlayActionMode = null;
        window.removeEventListener('pointermove', this._boundOverlayPointerMove);
        window.removeEventListener('pointerup', this._boundOverlayPointerUp);
        window.removeEventListener('pointercancel', this._boundOverlayPointerUp);
        if (!this._isDestroyed) {
            this.persistOverlayImages();
            this.syncOverlayImagesToLiveWindow(true);
            this.cd.markForCheck();
        }
    }

    toggleOverlayFullFrame(event: Event, overlay: LivestreamOverlayImage): void {
        event.stopPropagation();
        if (overlay.widthPct >= 99 && overlay.xPct <= 1 && overlay.yPct <= 1) {
            overlay.widthPct = this.isMobileRatio ? 35 : 24;
            overlay.xPct = 8;
            overlay.yPct = 12;
        } else {
            overlay.xPct = 0;
            overlay.yPct = 0;
            overlay.widthPct = 100;
        }
        this.persistOverlayImages();
        this.syncOverlayImagesToLiveWindow(true);
        this.cd.markForCheck();
    }

    bringOverlayToFront(event: Event, overlay: LivestreamOverlayImage): void {
        event.stopPropagation();
        this.overlayImages = [...this.overlayImages.filter((o) => o.id !== overlay.id), overlay];
        this.activeOverlayId = overlay.id;
        this.persistOverlayImages();
        this.syncOverlayImagesToLiveWindow(true);
        this.cd.markForCheck();
    }

    removeOverlayImage(event: Event, overlayId: string): void {
        event.stopPropagation();
        this.overlayImages = this.overlayImages.filter((o) => o.id !== overlayId);
        if (this.activeOverlayId === overlayId) {
            this.activeOverlayId = null;
        }
        this.persistOverlayImages();
        this.syncOverlayImagesToLiveWindow(true);
        this.cd.markForCheck();
    }

    cyclePlaybackRate() {
        const idx = this._speedCycle.indexOf(this.playbackRate);
        this.playbackRate = this._speedCycle[(idx + 1) % this._speedCycle.length];
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'set-playback-rate', rate: this.playbackRate });
            this.cd.markForCheck();
            return;
        }
        if (this.audioPlayer) {
            this.audioPlayer.playbackRate = this.playbackRate;
        }
        const activeEl = this.getVideoElement(this.activeVideoSlot);
        if (activeEl && this._usingChainVideo) {
            activeEl.playbackRate = this.playbackRate;
        }
        this.cd.markForCheck();
    }

    private getNormalizedProductCardRatio(): { xRatio: number; yRatio: number } | null {
        if (!this.productCardPos) return null;
        const stageEl = this.stageFrameRef?.nativeElement;
        const cardEl = this.productCardRef?.nativeElement;
        if (!stageEl || !cardEl) return null;

        const pad = this._dragPadding;
        const rangeX = Math.max(1, stageEl.clientWidth - cardEl.offsetWidth - pad * 2);
        const rangeY = Math.max(1, stageEl.clientHeight - cardEl.offsetHeight - pad * 2);
        const xRatio = Math.min(1, Math.max(0, (this.productCardPos.x - pad) / rangeX));
        const yRatio = Math.min(1, Math.max(0, (this.productCardPos.y - pad) / rangeY));
        return { xRatio, yRatio };
    }

    private applyPendingProductCardPosition(): void {
        const pending = this._pendingProductCardRatio;
        if (!pending || !this.showProductCard) return;
        setTimeout(() => {
            if (this._isDestroyed) return;
            const stageEl = this.stageFrameRef?.nativeElement;
            const cardEl = this.productCardRef?.nativeElement;
            if (!stageEl || !cardEl) return;
            const pad = this._dragPadding;
            const rangeX = Math.max(0, stageEl.clientWidth - cardEl.offsetWidth - pad * 2);
            const rangeY = Math.max(0, stageEl.clientHeight - cardEl.offsetHeight - pad * 2);
            this.productCardPos = {
                x: Math.round(pad + pending.xRatio * rangeX),
                y: Math.round(pad + pending.yRatio * rangeY),
            };
            this._pendingProductCardRatio = null;
            this.cd.markForCheck();
        }, 80);
    }

    private teardownLiveControlBridge(): void {
        try {
            this._unsubLiveCommand?.();
        } catch (_) {}
        try {
            this._unsubLiveState?.();
        } catch (_) {}
        try {
            this._unsubLiveClosed?.();
        } catch (_) {}
        this._unsubLiveCommand = null;
        this._unsubLiveState = null;
        this._unsubLiveClosed = null;
        if (this._browserPopupPollTimer) {
            clearInterval(this._browserPopupPollTimer);
            this._browserPopupPollTimer = null;
        }
        if (this._broadcastChannel) {
            try {
                this._broadcastChannel.close();
            } catch (_) {}
            this._broadcastChannel = null;
        }
    }

    private setupLiveControlBridge(): void {
        this.teardownLiveControlBridge();
        const electronApi = (window as any).electron;

        if (this.isStandaloneLiveWindow) {
            if (electronApi?.onLivestreamCommand) {
                this._unsubLiveCommand = electronApi.onLivestreamCommand((cmd: any) => {
                    this.handleIncomingLiveCommand(cmd);
                });
            }
            if (typeof BroadcastChannel !== 'undefined' && this.uuid) {
                try {
                    this._broadcastChannel = new BroadcastChannel(`aitype_livestream_ctrl_${this.uuid}`);
                    this._broadcastChannel.onmessage = (ev: MessageEvent) => {
                        if (ev?.data?.channel === 'command') {
                            this.handleIncomingLiveCommand(ev.data.payload);
                        }
                    };
                } catch (_) {}
            }
            return;
        }

        // Cửa sổ chính (Control Deck): nhận trạng thái phát và thông báo đóng từ cửa sổ Livestream riêng
        if (electronApi?.onLivestreamState) {
            this._unsubLiveState = electronApi.onLivestreamState((state: any) => {
                this.handleIncomingLiveState(state);
            });
        }
        if (electronApi?.onLivestreamWindowClosed) {
            this._unsubLiveClosed = electronApi.onLivestreamWindowClosed(() => {
                this.onExternalLiveWindowClosed();
            });
        }
        if (typeof BroadcastChannel !== 'undefined' && this.uuid) {
            try {
                this._broadcastChannel = new BroadcastChannel(`aitype_livestream_ctrl_${this.uuid}`);
                this._broadcastChannel.onmessage = (ev: MessageEvent) => {
                    if (ev?.data?.channel === 'state') {
                        this.handleIncomingLiveState(ev.data.payload);
                    } else if (ev?.data?.channel === 'closed') {
                        this.onExternalLiveWindowClosed();
                    }
                };
            } catch (_) {}
        }
    }

    private sendControlToLiveWindow(payload: any): void {
        const msg = { ...payload, uuid: this.uuid };
        const electronApi = (window as any).electron;
        if (electronApi?.sendLivestreamCommand) {
            electronApi.sendLivestreamCommand(msg);
        } else if (this._broadcastChannel) {
            try {
                this._broadcastChannel.postMessage({ channel: 'command', payload: msg });
            } catch (_) {}
        }
    }

    private broadcastLiveState(): void {
        if (!this.isStandaloneLiveWindow || this._isDestroyed) return;
        const state = {
            uuid: this.uuid,
            isPlaying: this.isPlaying,
            hasStarted: this.hasStarted,
            currentSceneIndex: this.currentSceneIndex,
            currentSubtitleIndex: this.currentSubtitleIndex,
            elapsedSec: this.elapsedSec,
            currentDisplayedText: this.currentDisplayedText,
            showProductCard: this.showProductCard,
            showSubtitle: this.showSubtitle,
            isVideoMuted: this.isVideoMuted,
            isMobileRatio: this.isMobileRatio,
            productCardPosRatio: this.getNormalizedProductCardRatio(),
        };
        const electronApi = (window as any).electron;
        if (electronApi?.sendLivestreamState) {
            electronApi.sendLivestreamState(state);
        } else if (this._broadcastChannel) {
            try {
                this._broadcastChannel.postMessage({ channel: 'state', payload: state });
            } catch (_) {}
        }
    }

    private handleIncomingLiveCommand(cmd: any): void {
        if (!cmd || this._isDestroyed) return;
        if (cmd.uuid && this.uuid && cmd.uuid !== this.uuid) return;

        switch (cmd.type) {
            case 'toggle-play-pause':
                if (!this.hasStarted) {
                    this.startLivestream();
                } else {
                    this.togglePlayPause();
                }
                break;
            case 'prev-scene':
                this.prevScene();
                break;
            case 'next-scene':
                this.nextScene();
                break;
            case 'restart':
                this.restartLivestream();
                break;
            case 'jump-scene':
                if (typeof cmd.index === 'number') {
                    this.jumpToScene(cmd.index, true);
                }
                break;
            case 'toggle-product-card':
                this.showProductCard = typeof cmd.value === 'boolean' ? cmd.value : !this.showProductCard;
                if (cmd.productCardPosRatio) {
                    this._pendingProductCardRatio = cmd.productCardPosRatio;
                }
                this.cd.markForCheck();
                if (this.showProductCard) {
                    if (this._pendingProductCardRatio) {
                        this.applyPendingProductCardPosition();
                    } else if (this.productCardPos) {
                        setTimeout(() => this.clampProductCardPosition(), 0);
                    }
                }
                break;
            case 'toggle-subtitle':
                this.showSubtitle = typeof cmd.value === 'boolean' ? cmd.value : !this.showSubtitle;
                this.cd.markForCheck();
                break;
            case 'toggle-mute': {
                this.isVideoMuted = typeof cmd.value === 'boolean' ? cmd.value : !this.isVideoMuted;
                const activeEl = this.getVideoElement(this.activeVideoSlot);
                if (activeEl && this._usingChainVideo) {
                    activeEl.muted = this.isVideoMuted;
                }
                if (this.audioPlayer) {
                    this.audioPlayer.muted = this.isVideoMuted;
                }
                this.cd.markForCheck();
                break;
            }
            case 'set-ratio':
                this.isMobileRatio = cmd.aspectRatio === '9:16';
                this.cd.markForCheck();
                if (this.productCardPos) {
                    setTimeout(() => this.clampProductCardPosition(), 200);
                }
                break;
            case 'set-playback-rate': {
                const nextRate = Number(cmd.rate) || 1;
                this.playbackRate = nextRate;
                if (this.audioPlayer) this.audioPlayer.playbackRate = nextRate;
                const activeEl = this.getVideoElement(this.activeVideoSlot);
                if (activeEl && this._usingChainVideo) activeEl.playbackRate = nextRate;
                this.cd.markForCheck();
                break;
            }
            case 'set-product-card-pos':
                if (cmd.ratio) {
                    this.applyProductCardRatioImmediate(cmd.ratio);
                }
                break;
            case 'sync-overlays':
                if (Array.isArray(cmd.overlayImages)) {
                    this.overlayImages = cmd.overlayImages.filter((o: any) => o && o.src).map((o: any) => ({ ...o }));
                    try {
                        this.cd.detectChanges();
                    } catch (_) {}
                }
                break;
            case 'close':
                this.stopPlaybackOnly();
                window.close();
                return;
            case 'request-state':
                break;
        }
        this.broadcastLiveState();
    }

    private applyProductCardRatioImmediate(ratio: { xRatio: number; yRatio: number }): void {
        const stageEl = this.stageFrameRef?.nativeElement;
        const cardEl = this.productCardRef?.nativeElement;
        if (!stageEl || !cardEl) {
            this._pendingProductCardRatio = ratio;
            return;
        }
        const pad = this._dragPadding;
        const rangeX = Math.max(0, stageEl.clientWidth - cardEl.offsetWidth - pad * 2);
        const rangeY = Math.max(0, stageEl.clientHeight - cardEl.offsetHeight - pad * 2);
        this.productCardPos = {
            x: Math.round(pad + ratio.xRatio * rangeX),
            y: Math.round(pad + ratio.yRatio * rangeY),
        };
        try {
            this.cd.detectChanges();
        } catch (_) {}
    }

    private handleIncomingLiveState(state: any): void {
        if (!state || this.isStandaloneLiveWindow || this._isDestroyed) return;
        if (state.uuid && this.uuid && state.uuid !== this.uuid) return;
        if (!this.isLiveWindowOpen) return;

        this.hasStarted = true;
        this.isPlaying = !!state.isPlaying;
        if (typeof state.currentSceneIndex === 'number') {
            this.currentSceneIndex = state.currentSceneIndex;
        }
        if (typeof state.currentSubtitleIndex === 'number') {
            this.currentSubtitleIndex = state.currentSubtitleIndex;
        }
        if (typeof state.elapsedSec === 'number') {
            this.elapsedSec = state.elapsedSec;
        }
        if (typeof state.currentDisplayedText === 'string') {
            this.currentDisplayedText = state.currentDisplayedText;
        }
        if (typeof state.showProductCard === 'boolean') {
            this.showProductCard = state.showProductCard;
        }
        if (typeof state.showSubtitle === 'boolean') {
            this.showSubtitle = state.showSubtitle;
        }
        if (typeof state.isVideoMuted === 'boolean') {
            this.isVideoMuted = state.isVideoMuted;
        }
        if (typeof state.isMobileRatio === 'boolean') {
            this.isMobileRatio = state.isMobileRatio;
        }
        if (state.productCardPosRatio && !this.isDraggingProductCard && this.showProductCard) {
            this.applyProductCardRatioImmediate(state.productCardPosRatio);
        }
        this.updateCurrentMediaUrl();
        this.cd.markForCheck();
    }

    private onExternalLiveWindowClosed(): void {
        if (this._isDestroyed || this.isStandaloneLiveWindow) return;
        if (this._browserPopupPollTimer) {
            clearInterval(this._browserPopupPollTimer);
            this._browserPopupPollTimer = null;
        }
        this._browserLivePopup = null;
        if (this.isLiveWindowOpen) {
            this.isLiveWindowOpen = false;
            this.isPlaying = false;
            this.toastr.info('Cửa sổ Phát Livestream đã đóng. Đã quay lại chế độ Kiểm thử.');
            this.cd.markForCheck();
        }
    }

    private pauseLocalPreviewForLiveWindow(): void {
        this.clearPlaybackTimers();
        this.pauseAllChainVideos(false);
        if (this.audioPlayer) {
            this.audioPlayer.pause();
        }
        this.hasStarted = true;
        this.isPlaying = true;
        this.updateCurrentMediaUrl();
    }

    async closeLiveBroadcastWindow(silent = false): Promise<void> {
        if (!this.isLiveWindowOpen) return;
        const electronApi = (window as any).electron;
        if (electronApi?.closeLivestreamWindow) {
            try {
                await electronApi.closeLivestreamWindow();
            } catch (_) {}
        } else if (electronApi?.sendLivestreamCommand) {
            electronApi.sendLivestreamCommand({ type: 'close', uuid: this.uuid });
        } else {
            this.sendControlToLiveWindow({ type: 'close' });
            try {
                this._browserLivePopup?.close();
            } catch (_) {}
        }
        if (this._browserPopupPollTimer) {
            clearInterval(this._browserPopupPollTimer);
            this._browserPopupPollTimer = null;
        }
        this._browserLivePopup = null;
        this.isLiveWindowOpen = false;
        this.isPlaying = false;
        if (!silent) {
            this.toastr.info('Đã đóng cửa sổ Phát Livestream thật.');
        }
        this.cd.markForCheck();
    }

    async switchToLiveMode() {
        const aspectRatio: '9:16' | '16:9' = this.isMobileRatio ? '9:16' : '16:9';

        // Nếu đang ở màn hình Kiểm thử (cửa sổ chính), mở một cửa sổ mới độc lập theo đúng tỉ lệ khung hình để phát Livestream thật
        if (!this.isStandaloneLiveWindow && this.projectData) {
            this.pauseLocalPreviewForLiveWindow();

            const liveProjectData = {
                ...this.projectData,
                isPreviewMode: false,
                aspectRatio,
            };
            const snapshot = {
                projectData: liveProjectData,
                aspectRatio,
                showProductCard: this.showProductCard,
                showSubtitle: this.showSubtitle,
                isVideoMuted: this.isVideoMuted,
                productCardPosRatio: this.getNormalizedProductCardRatio(),
                overlayImages: this.overlayImages.map((o) => ({ ...o })),
                updatedAt: Date.now(),
            };
            try {
                localStorage.setItem(`livestream_live_snapshot_${this.uuid}`, JSON.stringify(snapshot));
            } catch (_) {}

            const routeHash = `/livestream/${encodeURIComponent(this.uuid)}?mode=live&window=1&ratio=${encodeURIComponent(aspectRatio)}&autostart=1`;
            const liveTitle = `Livestream | ${this.projectData?.title || this.affiliateProduct?.product_name || 'Phát trực tiếp'}`;
            const electronApi = (window as any).electron;

            if (electronApi?.openLivestreamWindow || electronApi?.invoke) {
                try {
                    const res = electronApi.openLivestreamWindow
                        ? await electronApi.openLivestreamWindow({
                              uuid: this.uuid,
                              aspectRatio,
                              title: liveTitle,
                              routeHash,
                          })
                        : await electronApi.invoke('open-livestream-window', {
                              uuid: this.uuid,
                              aspectRatio,
                              title: liveTitle,
                              routeHash,
                          });
                    if (res?.success) {
                        this.isLiveWindowOpen = true;
                        this.cd.markForCheck();
                        this.toastr.success(
                            `Đã mở cửa sổ Phát Livestream thật đúng tỉ lệ ${aspectRatio} (${res.width}×${res.height}). Mọi thao tác điều khiển thực hiện trực tiếp tại cửa sổ app chính này.`,
                            'Phát Livestream thật',
                        );
                        return;
                    }
                } catch (err) {
                    console.error('[Livestream] Lỗi mở cửa sổ phát livestream riêng:', err);
                }
            } else {
                const popupW = aspectRatio === '9:16' ? 450 : 1280;
                const popupH = aspectRatio === '9:16' ? 800 : 720;
                const left = Math.max(0, Math.round((window.screen.availWidth - popupW) / 2));
                const top = Math.max(0, Math.round((window.screen.availHeight - popupH) / 2));
                const baseHref = window.location.href.split('#')[0];
                const opened = window.open(
                    `${baseHref}#${routeHash}`,
                    `aitype_live_${this.uuid}`,
                    `width=${popupW},height=${popupH},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`,
                );
                if (opened) {
                    this._browserLivePopup = opened;
                    this.isLiveWindowOpen = true;
                    this._browserPopupPollTimer = setInterval(() => {
                        if (!this._browserLivePopup || this._browserLivePopup.closed) {
                            this.onExternalLiveWindowClosed();
                        }
                    }, 800);
                    this.cd.markForCheck();
                    this.toastr.success(
                        `Đã mở cửa sổ Phát Livestream thật đúng tỉ lệ ${aspectRatio}. Điều khiển trực tiếp từ cửa sổ app chính này.`,
                    );
                    return;
                }
            }
        }

        // Dự phòng: chuyển trực tiếp sang chế độ Live trong cùng cửa sổ nếu trình duyệt chặn popup
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
        this.toastr.success('Đã chuyển sang chế độ phát Livestream thật.');
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
        if (this.isLiveWindowOpen) {
            this.closeLiveBroadcastWindow(true);
        }
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
        const nextAspect: '9:16' | '16:9' = this.isMobileRatio ? '9:16' : '16:9';

        // Khi đang điều khiển cửa sổ phát live riêng -> chỉ đổi tỉ lệ của cửa sổ live, giữ nguyên kích thước cửa sổ app chính
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'set-ratio', aspectRatio: nextAspect });
            this.cd.markForCheck();
            if (this.productCardPos) {
                setTimeout(() => this.clampProductCardPosition(), 350);
            }
            return;
        }

        let targetWidth = 1440;
        let targetHeight = 900;

        if (this.isMobileRatio) {
            targetWidth = 450;
            targetHeight = 800;
        }

        if ((window as any).electron && (window as any).electron.resizeWindow) {
            (window as any).electron.resizeWindow(
                targetWidth,
                targetHeight,
                nextAspect,
            );
        }

        this.cd.markForCheck();
        if (this.productCardPos) {
            setTimeout(() => this.clampProductCardPosition(), 350);
        }
    }

    startLivestream() {
        if (!this.projectData) return;
        this.hasStarted = true;
        this.currentSceneIndex = 0;
        this.currentSubtitleIndex = 0;
        this.elapsedSec = 0;
        this.ensureElapsedTicker();
        this.playCurrent();
        this.broadcastLiveState();
    }

    restartLivestream() {
        if (!this.projectData?.scenes?.length) return;
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'restart' });
            return;
        }
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
        this.broadcastLiveState();
    }

    prevScene() {
        if (!this.projectData?.scenes?.length) return;
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'prev-scene' });
            return;
        }
        const prev = this.currentSceneIndex > 0 ? this.currentSceneIndex - 1 : this.projectData.scenes.length - 1;
        this.jumpToScene(prev, true);
    }

    nextScene() {
        if (!this.projectData?.scenes?.length) return;
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'next-scene' });
            return;
        }
        const next = (this.currentSceneIndex + 1) % this.projectData.scenes.length;
        this.jumpToScene(next, true);
    }

    togglePlayPause() {
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.isPlaying = !this.isPlaying;
            this.sendControlToLiveWindow({ type: 'toggle-play-pause' });
            this.cd.markForCheck();
            return;
        }
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.ensureElapsedTicker();
            if (this._usingChainVideo) {
                const activeEl = this.getVideoElement(this.activeVideoSlot);
                if (activeEl) {
                    activeEl.playbackRate = this.playbackRate;
                    activeEl.muted = this.isVideoMuted;
                    activeEl.play().catch(() => {});
                }
            } else if (this._usingAudioForCurrentSub && this.audioPlayer.src) {
                this.audioPlayer.playbackRate = this.playbackRate;
                this.audioPlayer.muted = this.isVideoMuted;
                this.audioPlayer.play().catch(() => {});
            } else {
                this.runTimedSubtitleChunks(this.currentChunkIndex);
            }
        } else {
            if (this.fallbackTimeout) {
                clearTimeout(this.fallbackTimeout);
                this.fallbackTimeout = null;
            }
            if (this._usingChainVideo) {
                const activeEl = this.getVideoElement(this.activeVideoSlot);
                if (activeEl) activeEl.pause();
            }
            if (this._usingAudioForCurrentSub && this.audioPlayer) {
                this.audioPlayer.pause();
            }
        }
        this.broadcastLiveState();
        this.cd.markForCheck();
    }

    jumpToScene(index: number, force = false) {
        if ((!force && index === this.currentSceneIndex) || index < 0 || index >= this.projectData.scenes.length) {
            return;
        }
        if (this.isLiveWindowOpen && !this.isStandaloneLiveWindow) {
            this.sendControlToLiveWindow({ type: 'jump-scene', index });
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
        this.broadcastLiveState();
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

    private startChainVideoPlayback(videoUrl: string, onFallback: () => void): void {
        const currentSlot = this.activeVideoSlot;
        const standbySlot: 'A' | 'B' = currentSlot === 'A' ? 'B' : 'A';
        const standbyEl = this.getVideoElement(standbySlot);
        const currentEl = this.getVideoElement(currentSlot);

        let targetSlot: 'A' | 'B' = currentSlot;
        let targetEl: HTMLVideoElement | null = currentEl;

        if (standbyEl && this.getSlotSrc(standbySlot) === videoUrl) {
            // Đã nạp sẵn vào bộ đệm dự phòng -> tráo khe ngay lập tức (zero-gap transition)
            targetSlot = standbySlot;
            targetEl = standbyEl;
            this.activeVideoSlot = targetSlot;
        } else if (targetEl) {
            if (this.getSlotSrc(targetSlot) !== videoUrl) {
                this.setSlotSrc(targetSlot, videoUrl);
                targetEl.src = videoUrl;
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
                                onFallback();
                            });
                    }
                });
        } else {
            onFallback();
        }
    }

    playCurrent() {
        if (!this.currentScene) return;

        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }

        // Ưu tiên phát video tổng của toàn phân cảnh (liên hoàn giữa các cảnh không khoảng trễ)
        const sceneVideoUrl = this.currentScene.videoUrl;
        if (sceneVideoUrl) {
            if (this._usingSceneVideo && this._playingSceneVideoIndex === this.currentSceneIndex && this.isPlaying) {
                this.cd.markForCheck();
                return;
            }

            this.audioPlayer.pause();
            this._usingAudioForCurrentSub = false;
            this._usingSubtitleVideo = false;
            this._usingSceneVideo = true;
            this._playingSceneVideoIndex = this.currentSceneIndex;
            this.isPlaying = true;
            this.currentMediaUrl = sceneVideoUrl;

            const subs = Array.isArray(this.currentScene.subtitles) ? this.currentScene.subtitles : [];
            if (subs.length > 0) {
                const safeSubIdx = Math.max(0, Math.min(this.currentSubtitleIndex, subs.length - 1));
                this.currentSubtitleIndex = safeSubIdx;
                this.prepareSubtitleChunks(subs[safeSubIdx].text);
                this.currentDisplayedText = this.textChunks.length > 0 ? this.textChunks[0].text : '';
            } else {
                this.textChunks = [];
                this.currentDisplayedText = '';
            }
            this.elapsedSec = this.computeElapsedSeconds();

            this.startChainVideoPlayback(sceneVideoUrl, () => {
                this._usingSceneVideo = false;
                this._playingSceneVideoIndex = -1;
                this.updateCurrentMediaUrl();
                this.runTimedSubtitleChunks(0);
            });

            this.cd.markForCheck();
            return;
        }

        if (!this.currentScene.subtitles || this.currentScene.subtitles.length === 0 || !this.currentSubtitle) {
            if (this._usingChainVideo) {
                this.pauseAllChainVideos(false);
            }
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

        // Phát clip video gắn riêng theo từng câu thoại khi phân cảnh không có video tổng
        const subVideoUrl = this.currentSubtitle.videoUrl;
        if (subVideoUrl) {
            this.audioPlayer.pause();
            this._usingAudioForCurrentSub = false;
            this._usingSceneVideo = false;
            this._playingSceneVideoIndex = -1;
            this._usingSubtitleVideo = true;
            this.isPlaying = true;
            this.currentMediaUrl = subVideoUrl;

            this.startChainVideoPlayback(subVideoUrl, () => {
                this._usingSubtitleVideo = false;
                this.updateCurrentMediaUrl();
                this.runTimedSubtitleChunks(0);
            });

            this.cd.markForCheck();
            return;
        }

        // Nếu cả cảnh và câu thoại đều không có video, tạm dừng bộ phát chuỗi video và chuyển về ảnh nền + TTS / phụ đề
        if (this._usingChainVideo) {
            this.pauseAllChainVideos(false);
        }

        const audioUrl = this.currentSubtitle.audioUrl;

        if (audioUrl) {
            this._usingAudioForCurrentSub = true;
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.playbackRate = this.playbackRate;
            this.audioPlayer.muted = this.isVideoMuted;
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

    private moveToNextScene(): void {
        if (!this.isPlaying || !this.projectData?.scenes?.length) return;
        this._playingSceneVideoIndex = -1;
        this.currentSubtitleIndex = 0;
        this.currentSceneIndex++;

        if (this.currentSceneIndex >= this.projectData.scenes.length) {
            this.currentSceneIndex = 0;
            this.elapsedSec = 0;
            if (this.isPreviewMode) {
                this.toastr.info('Đã chạy hết 1 vòng kịch bản kiểm thử, hệ thống tự động phát lặp lại từ đầu.');
            }
        }

        this.playCurrent();
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
        if (this.isLiveWindowOpen) {
            this.closeLiveBroadcastWindow(true);
        }
        this.stopPlaybackOnly();

        if (this.isStandaloneLiveWindow) {
            window.close();
            return;
        }

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
