import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserClientService } from 'app/_services/user';
import { ShopeeOfferItem, ShopeeOffersService } from 'app/_services/shopee-offers.service';
import {
    AffiliateLivestreamAspect,
    AffiliateLivestreamDraft,
    AffiliateLivestreamScene,
    AffiliateLivestreamService,
    AffiliateLivestreamStyle,
    AffiliateLivestreamVoice,
    AffiliateReferenceImage,
    AffiliateReferenceRole,
} from 'app/_services/affiliate-livestream.service';

export interface AppWritingStyle {
    name: string;
    desc?: string;
    avatar?: string;
}

export interface AffiliateLivestreamDialogData {
    product: ShopeeOfferItem;
    username: string;
    ctaTemplate?: string;
}

export interface AffiliateLivestreamDialogResult {
    action: 'preview';
    uuid: string;
    offerId: string;
}

@Component({
    selector: 'affiliate-livestream-dialog',
    templateUrl: './affiliate-livestream-dialog.component.html',
    styleUrls: ['./affiliate-livestream-dialog.component.scss'],
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class AffiliateLivestreamDialogComponent implements OnInit, OnDestroy {
    product: ShopeeOfferItem;
    username = 'admin';
    ctaTemplate = '';

    // Cấu hình người dùng nhập
    brief = '';
    durationMinutes = 10;
    maxSubtitleSeconds = 15;
    style: AffiliateLivestreamStyle = '';
    voice: AffiliateLivestreamVoice = 'vi-VN-HoaiMyNeural';
    aspectRatio: AffiliateLivestreamAspect = '9:16';

    // Danh sách phong cách có sẵn trong Cài đặt -> Phong cách của tài khoản
    appStyles: AppWritingStyle[] = [];
    private _unsubscribeAll = new Subject<void>();

    // Dữ liệu kịch bản đã tạo
    scriptTitle = '';
    hookSummary = '';
    scenes: AffiliateLivestreamScene[] = [];
    generatedBy: 'ai' | 'template' = 'ai';
    hasLoadedDraft = false;

    // Ảnh sản phẩm, chi tiết sản phẩm, mô tả sản phẩm và ảnh khung nền livestream
    productImages: string[] = [];
    productImagesFolderPath = '';
    selectedProductImageUrl = '';
    productAttributes: Array<{ name: string; value: string }> = [];
    productVariations: Array<{ name: string; options: string[] }> = [];
    productDescription = '';
    showProductDetailPanel = false;
    productFetchBlocked = false;
    isCapturingFromWebTools = false;
    private _webToolsPollTimer: any = null;
    previewLightboxUrl = '';
    isLoadingProductImages = false;
    referenceImages: AffiliateReferenceImage[] = [];
    backdropImageUrl = '';
    backdropPreviewSrc = '';
    backdropLocalPath = '';
    backdropAspectRatio: AffiliateLivestreamAspect = '9:16';

    // Trạng thái xử lý
    isGeneratingScript = false;
    isGeneratingBackdrop = false;
    generationPhaseText = '';
    isPreparingPreview = false;
    ttsProgressDone = 0;
    ttsProgressTotal = 0;
    ttsStatusText = '';
    private _skipTtsRequested = false;

    readonly minDurationMinutes = 1;
    readonly maxDurationMinutes = 180;
    readonly maxSceneDurationSec = 40;
    readonly durationPresets = [1, 30, 60, 90, 120, 150, 180];
    readonly subtitleDurationOptions: number[] = [1, 5, 10, 15, 20, 25, 30];

    readonly briefPresets: Array<{ label: string; text: string }> = [
        {
            label: 'Săn deal Flash Sale',
            text: 'Nhấn mạnh mức giá giảm sâu duy nhất trong khung giờ livestream, tạo cảm giác khan hiếm số lượng mã ưu đãi và nhắc người xem bấm vào giỏ hàng góc trái màn hình chốt đơn ngay.',
        },
        {
            label: 'Review thực tế & Demo',
            text: 'Mở hộp và quay cận chi tiết sản phẩm, phân tích ưu điểm nổi bật khi dùng thực tế, so sánh với sản phẩm cùng phân khúc để tạo sự tin tưởng trước khi chốt đơn.',
        },
        {
            label: 'Tư vấn hỏi đáp Q&A',
            text: 'Chủ động giải đáp các thắc mắc phổ biến của khách về chất lượng, cách chọn phân loại, bảo hành, miễn phí vận chuyển và chính sách đổi trả trên Shopee.',
        },
        {
            label: 'Chốt đơn giỏ hàng Affiliate',
            text: 'Hướng dẫn người xem bấm vào giỏ hàng góc trái, áp thêm mã voucher freeship của sàn và lặp lại lời kêu gọi đặt hàng sau mỗi 2 phút.',
        },
    ];

    readonly voiceOptions: Array<{ value: AffiliateLivestreamVoice; label: string }> = [
        { value: 'vi-VN-HoaiMyNeural', label: 'Giọng nữ - Hoài My (Edge TTS)' },
        { value: 'vi-VN-NamMinhNeural', label: 'Giọng nam - Nam Minh (Edge TTS)' },
        { value: 'none', label: 'Chỉ chạy phụ đề nhắc lời (không tạo giọng)' },
    ];

    readonly aspectOptions: Array<{ value: AffiliateLivestreamAspect; label: string }> = [
        { value: '9:16', label: 'Dọc 9:16 (Shopee Live / TikTok)' },
        { value: '16:9', label: 'Ngang 16:9 (YouTube / Facebook)' },
    ];

    get isElectronEnv(): boolean {
        return !!(window as any).electron?.invoke;
    }

    get estimatedSceneCount(): number {
        return this._livestreamService.calculateSceneCount(this.durationMinutes);
    }

    get totalScriptSeconds(): number {
        return this._livestreamService.computeTotalDurationSec(this.scenes);
    }

    get totalScriptLines(): number {
        return this.scenes.reduce((acc, s) => acc + (s.subtitles?.length || 0), 0);
    }

    get importedVideoItems(): Array<{
        order: number;
        sceneIndex: number;
        subIndex: number;
        scene: AffiliateLivestreamScene;
        sub: any;
        name: string;
        duration: number;
    }> {
        const list: Array<{
            order: number;
            sceneIndex: number;
            subIndex: number;
            scene: AffiliateLivestreamScene;
            sub: any;
            name: string;
            duration: number;
        }> = [];
        let order = 0;
        this.scenes.forEach((scene, sceneIndex) => {
            (scene.subtitles || []).forEach((sub, subIndex) => {
                if (sub?.videoUrl) {
                    order += 1;
                    list.push({
                        order,
                        sceneIndex,
                        subIndex,
                        scene,
                        sub,
                        name: sub.videoName || `video_${order}.mp4`,
                        duration: Number(sub.duration) || 1,
                    });
                }
            });
        });
        return list;
    }

    get importedVideoCount(): number {
        return this.importedVideoItems.length;
    }

    get ttsProgressPercent(): number {
        if (!this.ttsProgressTotal) return 0;
        return Math.min(100, Math.round((this.ttsProgressDone / this.ttsProgressTotal) * 100));
    }

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: AffiliateLivestreamDialogData,
        private _dialogRef: MatDialogRef<AffiliateLivestreamDialogComponent, AffiliateLivestreamDialogResult>,
        private _livestreamService: AffiliateLivestreamService,
        private _shopeeOffersService: ShopeeOffersService,
        private _multiAccountService: MultiAccountService,
        private _userClientService: UserClientService,
        private _toastr: ToastrService,
        private _cdr: ChangeDetectorRef,
    ) {
        this.product = data?.product || ({} as ShopeeOfferItem);
        this.username = data?.username || 'admin';
        this.ctaTemplate = data?.ctaTemplate || '';
        if (!this.isElectronEnv) {
            this.voice = 'none';
        }
    }

    ngOnInit(): void {
        let draft: AffiliateLivestreamDraft | null = null;
        try {
            draft = this._livestreamService.loadDraft(this.product);
            if (draft) {
                this.brief = draft.brief || '';
                this.durationMinutes = draft.durationMinutes || 10;
                this.maxSubtitleSeconds = this.subtitleDurationOptions.includes(Number(draft.maxSubtitleSeconds))
                    ? Number(draft.maxSubtitleSeconds)
                    : 15;
                this.style = draft.style || '';
                this.voice = this.isElectronEnv ? draft.voice || 'vi-VN-HoaiMyNeural' : 'none';
                this.aspectRatio = draft.aspectRatio || '9:16';
                this.scriptTitle = draft.title || '';
                this.hookSummary = draft.hookSummary || '';
                this.scenes = Array.isArray(draft.scenes)
                    ? this._livestreamService.enforceMaxSceneDuration(
                          draft.scenes.filter(Boolean).map((sc) => ({
                              ...sc,
                              subtitles: (sc.subtitles || []).filter(Boolean).map((sub) => ({
                                  ...sub,
                                  videoUrl:
                                      sub.videoUrl && this.isElectronEnv
                                          ? this._livestreamService.toElectronMediaUrl(sub.videoUrl)
                                          : sub.videoUrl || '',
                              })),
                          })),
                          this.maxSceneDurationSec,
                          this.maxSceneDurationSec,
                      )
                    : [];
                this.generatedBy = draft.generatedBy || 'ai';
                this.referenceImages = Array.isArray(draft.referenceImages)
                    ? draft.referenceImages.filter(Boolean).map((r) => ({ ...r }))
                    : [];
                const normalizedBackdropUrl = draft.backdropImageUrl
                    ? this.isElectronEnv
                        ? this._livestreamService.toElectronMediaUrl(draft.backdropImageUrl)
                        : draft.backdropImageUrl
                    : '';
                this.backdropImageUrl = normalizedBackdropUrl;
                this.backdropPreviewSrc = normalizedBackdropUrl;
                this.backdropLocalPath = draft.backdropLocalPath || '';
                this.backdropAspectRatio = draft.backdropAspectRatio || this.aspectRatio;
                this.selectedProductImageUrl = draft.selectedProductImageUrl || '';
                this.hasLoadedDraft = this.scenes.length > 0;
            }
        } catch (err) {
            console.warn('[AffiliateLivestreamDialog] Lỗi nạp bản nháp:', err);
        }

        // Khởi tạo bộ ảnh, chi tiết & mô tả sản phẩm từ dữ liệu đã đồng bộ / bản nháp
        const initialServerImgCount = Array.isArray(this.product?.images) ? this.product.images.length : 0;
        const initialServerHasDesc = !!(this.product?.description && this.product.description.trim());
        this.mergeProductImages([
            this.product?.image_url || '',
            ...(Array.isArray(this.product?.images) ? this.product.images : []),
            ...(Array.isArray(draft?.productImages) ? draft.productImages : []),
            ...(Array.isArray(draft?.product?.images) ? draft.product.images : []),
        ]);
        this.applyProductDetails({
            attributes: this.product?.attributes?.length ? this.product.attributes : draft?.productAttributes || [],
            variations: this.product?.variations?.length ? this.product.variations : draft?.productVariations || [],
            description: this.product?.description || draft?.productDescription || '',
        });
        if (!this.selectedProductImageUrl || !this.productImages.includes(this.selectedProductImageUrl)) {
            this.selectedProductImageUrl = this.productImages[0] || this.product?.image_url || '';
        }

        if (this.isElectronEnv) {
            this.hydrateFromLocalDbAndSync(initialServerImgCount, initialServerHasDesc);
        }

        // Nạp danh sách phong cách có sẵn trong Cài đặt -> Phong cách
        const cachedStyles = this._multiAccountService.getItem('styles');
        if (Array.isArray(cachedStyles) && cachedStyles.length > 0) {
            this.applyLoadedStyles(cachedStyles);
        }

        this._multiAccountService.activeAccount$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((account: any) => {
                if (account && Array.isArray(account.styles) && account.styles.length > 0) {
                    this.applyLoadedStyles(account.styles);
                }
            });

        if (this.appStyles.length === 0 && this.username) {
            this._userClientService
                .profile({ name: this.username })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res: any) => {
                        if (res?.success && Array.isArray(res?.data?.styles) && res.data.styles.length > 0) {
                            this._multiAccountService.setItem('styles', res.data.styles);
                            this.applyLoadedStyles(res.data.styles);
                        }
                    },
                    error: () => {},
                });
        }

        this._cdr.markForCheck();
    }

    ngOnDestroy(): void {
        this.stopWebToolsCapture();
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    private applyLoadedStyles(rawStyles: any[]): void {
        const normalized: AppWritingStyle[] = (rawStyles || [])
            .filter((s) => s && typeof s === 'object' && String(s.name || '').trim())
            .map((s) => ({
                name: String(s.name).trim(),
                desc: String(s.desc || '').trim(),
                avatar: s.avatar || '',
            }));

        this.appStyles = normalized;

        // Nếu chưa chọn phong cách hoặc đang mang mã cũ trước đây -> tự chọn phong cách bán hàng/review phù hợp hoặc mục đầu tiên
        const legacyCodes = ['energetic', 'expert_review', 'storytelling', 'luxury'];
        if (normalized.length > 0 && (!this.style || legacyCodes.includes(this.style))) {
            const preferred =
                normalized.find((s) => /bán hàng|livestream|live|chốt đơn/i.test(s.name)) ||
                normalized.find((s) => /review/i.test(s.name)) ||
                normalized[0];
            this.style = preferred.name;
        }
        this._cdr.markForCheck();
    }

    hasStyleOption(styleName: string): boolean {
        return this.appStyles.some((s) => s.name === styleName);
    }

    private getSelectedStyleDescription(): string {
        const matched = this.appStyles.find((s) => s.name === this.style);
        return matched?.desc || '';
    }

    selectDurationPreset(mins: number): void {
        this.durationMinutes = mins;
        this._cdr.markForCheck();
    }

    getDurationPercent(mins: number): number {
        const span = this.maxDurationMinutes - this.minDurationMinutes;
        if (span <= 0) return 0;
        return ((mins - this.minDurationMinutes) / span) * 100;
    }

    onSliderInput(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        if (!target) return;
        const val = Number(target.value);
        if (isFinite(val)) {
            this.durationMinutes = Math.max(
                this.minDurationMinutes,
                Math.min(this.maxDurationMinutes, Math.round(val)),
            );
            this._cdr.markForCheck();
        }
    }

    onDurationInputChange(): void {
        const num = Number(this.durationMinutes);
        if (!isFinite(num) || num < this.minDurationMinutes) {
            this.durationMinutes = this.minDurationMinutes;
        } else if (num > this.maxDurationMinutes) {
            this.durationMinutes = this.maxDurationMinutes;
        } else {
            this.durationMinutes = Math.round(num);
        }
        this._cdr.markForCheck();
    }

    applyBriefPreset(presetText: string): void {
        const current = (this.brief || '').trim();
        if (!current) {
            this.brief = presetText;
        } else if (!current.includes(presetText)) {
            this.brief = `${current}\n${presetText}`;
        }
        this._cdr.markForCheck();
    }

    getSceneTimeRange(sceneIndex: number): string {
        let startSec = 0;
        for (let i = 0; i < sceneIndex; i++) {
            const sc = this.scenes[i];
            startSec += (sc.subtitles || []).reduce((acc, sub) => acc + (Number(sub.duration) || 5), 0);
        }
        const curSc = this.scenes[sceneIndex];
        const dur = (curSc?.subtitles || []).reduce((acc, sub) => acc + (Number(sub.duration) || 5), 0);
        return `${this._livestreamService.formatDurationMMSS(startSec)} - ${this._livestreamService.formatDurationMMSS(startSec + dur)}`;
    }

    formatMMSS(seconds: number): string {
        return this._livestreamService.formatDurationMMSS(seconds);
    }

    formatVnd(amount: number | undefined): string {
        const num = Number(amount) || 0;
        if (num <= 0) return '-';
        return num.toLocaleString('vi-VN') + ' ₫';
    }

    getSceneDurationSec(scene: AffiliateLivestreamScene): number {
        return (scene?.subtitles || []).reduce((acc, sub) => acc + Math.max(1, Math.round(Number(sub?.duration) || 1)), 0);
    }

    addScene(): void {
        const idx = this.scenes.length + 1;
        const defaultDur = Math.min(this.maxSubtitleSeconds || 15, this.maxSceneDurationSec);
        this.scenes.push({
            id: `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            phase: `Phân cảnh ${idx}`,
            title: `Nội dung bổ sung ${idx}`,
            actionCue: 'Giơ rõ sản phẩm trước camera và nhắc khách bấm vào giỏ hàng góc trái.',
            durationSec: defaultDur,
            imageUrl: this.backdropImageUrl || this.selectedProductImageUrl || this.product?.image_url || '',
            subtitles: [
                {
                    id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                    text: '',
                    duration: defaultDur,
                },
            ],
        });
        this._cdr.markForCheck();
    }

    addSubtitleLine(scene: AffiliateLivestreamScene): void {
        if (!scene.subtitles) scene.subtitles = [];
        const currentSec = this.getSceneDurationSec(scene);
        const remainingSec = this.maxSceneDurationSec - currentSec;
        if (remainingSec <= 0) {
            this._toastr.warning(
                `Mỗi cảnh chỉ được phép tối đa ${this.maxSceneDurationSec} giây. Hãy bấm "+ Thêm phân cảnh mới" để tiếp tục viết lời thoại.`,
                'Giới hạn thời lượng cảnh',
            );
            return;
        }
        scene.subtitles.push({
            id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            text: '',
            duration: Math.max(1, Math.min(this.maxSubtitleSeconds || 15, remainingSec)),
        });
        this.recalcSceneDuration(scene);
        this._cdr.markForCheck();
    }

    removeSubtitleLine(scene: AffiliateLivestreamScene, subIndex: number): void {
        if (!scene.subtitles || scene.subtitles.length <= 1) {
            this._toastr.warning('Mỗi phân cảnh cần giữ lại ít nhất 1 câu thoại.');
            return;
        }
        scene.subtitles.splice(subIndex, 1);
        this.recalcSceneDuration(scene);
        this._cdr.markForCheck();
    }

    removeScene(sceneIndex: number): void {
        if (this.scenes.length <= 1) {
            this._toastr.warning('Kịch bản cần có ít nhất 1 phân cảnh.');
            return;
        }
        this.scenes.splice(sceneIndex, 1);
        this._cdr.markForCheck();
    }

    onSubtitleDurationChange(scene: AffiliateLivestreamScene, sub: any): void {
        let val = Math.round(Number(sub?.duration) || 1);
        if (!isFinite(val) || val < 1) val = 1;
        if (val > this.maxSceneDurationSec) val = this.maxSceneDurationSec;

        const otherSum = (scene?.subtitles || []).reduce(
            (acc, item) => (item === sub ? acc : acc + Math.max(1, Math.round(Number(item?.duration) || 1))),
            0,
        );
        const maxAllowedForSub = Math.max(1, this.maxSceneDurationSec - otherSum);
        if (val > maxAllowedForSub) {
            val = maxAllowedForSub;
            this._toastr.warning(
                `Mỗi cảnh chỉ được phép tối đa ${this.maxSceneDurationSec} giây (còn trống ${maxAllowedForSub}s cho câu này).`,
                'Giới hạn thời lượng cảnh',
            );
        }
        sub.duration = val;
        this.recalcSceneDuration(scene);
        this._cdr.markForCheck();
    }

    recalcSceneDuration(scene: AffiliateLivestreamScene): void {
        scene.durationSec = (scene.subtitles || []).reduce(
            (acc, sub) => acc + Math.max(1, Math.round(Number(sub.duration) || 1)),
            0,
        );
    }

    onSubtitleTextChanged(sub: any): void {
        // Khi người dùng sửa lời thoại, hủy audio cũ để lần kiểm thử tạo lại giọng khớp nội dung mới
        if (sub.audioUrl) {
            sub.audioUrl = '';
            sub.voiceHash = '';
        }
    }

    private probeVideoElementDuration(url: string): Promise<number> {
        return new Promise((resolve) => {
            try {
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.muted = true;
                const cleanup = () => {
                    v.onloadedmetadata = null;
                    v.onerror = null;
                    v.src = '';
                };
                v.onloadedmetadata = () => {
                    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
                    cleanup();
                    resolve(dur);
                };
                v.onerror = () => {
                    cleanup();
                    resolve(0);
                };
                v.src = url;
            } catch (_) {
                resolve(0);
            }
        });
    }

    private extractFileBasename(rawPath: string): string {
        const clean = String(rawPath || '').replace(/\\/g, '/').split('?')[0];
        return clean.split('/').pop() || 'video.mp4';
    }

    async importVideoForSubtitle(scene: AffiliateLivestreamScene, sub: any): Promise<void> {
        if (this.isGeneratingScript || this.isGeneratingBackdrop || this.isPreparingPreview) return;

        const electron = (window as any).electron;
        if (electron?.invoke) {
            try {
                const selectedPath: string | null = await electron.invoke('select-video-file');
                if (!selectedPath) return;

                let finalPath = String(selectedPath).trim();
                // Đảm bảo định dạng H.264 tương thích Chromium nếu là file mp4
                if (finalPath.toLowerCase().endsWith('.mp4') && electron.ensurePlayableVideo) {
                    try {
                        const conv = await electron.ensurePlayableVideo(finalPath);
                        if (conv?.success && conv?.outputPath) {
                            finalPath = conv.outputPath;
                        }
                    } catch (_) {}
                }

                const mediaUrl = this._livestreamService.toElectronMediaUrl(finalPath);
                sub.videoUrl = mediaUrl;
                sub.videoLocalPath = finalPath;
                sub.videoName = this.extractFileBasename(finalPath);

                // Tự động đọc thời lượng thật của video để đồng bộ dòng thời gian phát liền mạch
                let detectedSec = 0;
                if (electron.getMediaDuration) {
                    try {
                        const durRes = await electron.getMediaDuration(finalPath);
                        const d = typeof durRes === 'number' ? durRes : Number(durRes?.duration || 0);
                        if (d > 0.3 && isFinite(d)) detectedSec = d;
                    } catch (_) {}
                }
                if (!detectedSec) {
                    detectedSec = await this.probeVideoElementDuration(mediaUrl);
                }
                if (detectedSec > 0.3) {
                    const roundedSec = Math.max(1, Math.round(detectedSec));
                    if (roundedSec > this.maxSceneDurationSec) {
                        sub.duration = this.maxSceneDurationSec;
                        this._toastr.warning(
                            `Video "${sub.videoName}" dài ${roundedSec}s vượt giới hạn ${this.maxSceneDurationSec}s/cảnh, đã giới hạn thời lượng ở ${this.maxSceneDurationSec}s.`,
                            'Giới hạn thời lượng cảnh',
                        );
                    } else {
                        sub.duration = roundedSec;
                    }
                    this.recalcSceneDuration(scene);
                    if (this.getSceneDurationSec(scene) > this.maxSceneDurationSec) {
                        this.scenes = this._livestreamService.enforceMaxSceneDuration(
                            this.scenes,
                            this.maxSceneDurationSec,
                            this.maxSceneDurationSec,
                        );
                    }
                }

                await this._livestreamService.saveDraft(this.buildDraftObject());
                this._toastr.success(
                    `Đã thêm "${sub.videoName}" (${sub.duration}s) vào chuỗi video livestream.`,
                    'Import video thành công',
                );
                this._cdr.markForCheck();
                try {
                    this._cdr.detectChanges();
                } catch (_) {}
            } catch (err: any) {
                this._toastr.error(`Không thể import file video: ${err?.message || 'Lỗi không xác định'}`);
            }
            return;
        }

        // Dự phòng cho môi trường trình duyệt web thuần
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            const blobUrl = URL.createObjectURL(file);
            sub.videoUrl = blobUrl;
            sub.videoLocalPath = '';
            sub.videoName = file.name || 'video.mp4';
            const detectedSec = await this.probeVideoElementDuration(blobUrl);
            if (detectedSec > 0.3) {
                const roundedSec = Math.max(1, Math.round(detectedSec));
                if (roundedSec > this.maxSceneDurationSec) {
                    sub.duration = this.maxSceneDurationSec;
                    this._toastr.warning(
                        `Video "${sub.videoName}" dài ${roundedSec}s vượt giới hạn ${this.maxSceneDurationSec}s/cảnh, đã giới hạn ở ${this.maxSceneDurationSec}s.`,
                        'Giới hạn thời lượng cảnh',
                    );
                } else {
                    sub.duration = roundedSec;
                }
                this.recalcSceneDuration(scene);
                if (this.getSceneDurationSec(scene) > this.maxSceneDurationSec) {
                    this.scenes = this._livestreamService.enforceMaxSceneDuration(
                        this.scenes,
                        this.maxSceneDurationSec,
                        this.maxSceneDurationSec,
                    );
                }
            }
            await this._livestreamService.saveDraft(this.buildDraftObject());
            this._toastr.success(`Đã thêm "${sub.videoName}" vào chuỗi video livestream.`);
            this._cdr.markForCheck();
        };
        input.click();
    }

    async removeVideoFromSubtitle(scene: AffiliateLivestreamScene, sub: any): Promise<void> {
        if (!sub?.videoUrl) return;
        if (String(sub.videoUrl).startsWith('blob:')) {
            try {
                URL.revokeObjectURL(sub.videoUrl);
            } catch (_) {}
        }
        sub.videoUrl = '';
        sub.videoLocalPath = '';
        sub.videoName = '';
        this.recalcSceneDuration(scene);
        await this._livestreamService.saveDraft(this.buildDraftObject());
        this._cdr.markForCheck();
        try {
            this._cdr.detectChanges();
        } catch (_) {}
    }

    private mergeProductImages(candidates: string[]): void {
        const seen = new Set<string>();
        const merged: string[] = [];
        const all = [...this.productImages, ...(candidates || [])];
        for (const raw of all) {
            const url = String(raw || '').trim();
            if (!url) continue;
            const fileKey = url.split('/file/')[1] || url;
            const dedupeKey = fileKey.replace(/_tn(?=\.[a-z0-9]+$|$)/i, '').replace(/\.(?:webp|jpg|jpeg|png)$/i, '').toLowerCase();
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                merged.push(url);
            }
        }
        this.productImages = merged.slice(0, 30);
        if (this.product) {
            this.product.images = [...this.productImages];
        }
    }

    selectProductImage(url: string): void {
        if (!url) return;
        this.selectedProductImageUrl = url;
        this._cdr.markForCheck();
    }

    openImageLightbox(url: string, event?: Event): void {
        event?.stopPropagation();
        if (!url) return;
        this.previewLightboxUrl = url;
        this._cdr.markForCheck();
    }

    closeImageLightbox(): void {
        this.previewLightboxUrl = '';
        this._cdr.markForCheck();
    }

    private applyProductDetails(details: {
        attributes?: Array<{ name: string; value: string }>;
        variations?: Array<{ name: string; options: string[] }>;
        description?: string;
    }): void {
        if (Array.isArray(details.attributes) && details.attributes.length > 0) {
            this.productAttributes = details.attributes
                .filter((a) => a && a.name && a.value)
                .slice(0, 40);
            if (this.product) this.product.attributes = [...this.productAttributes];
        }
        if (Array.isArray(details.variations) && details.variations.length > 0) {
            this.productVariations = details.variations
                .filter((v) => v && v.name && Array.isArray(v.options) && v.options.length > 0)
                .slice(0, 10);
            if (this.product) this.product.variations = [...this.productVariations];
        }
        if (typeof details.description === 'string' && details.description.trim().length > this.productDescription.length) {
            this.productDescription = details.description.trim();
            if (this.product) this.product.description = this.productDescription;
        }
    }

    private async hydrateFromLocalDbAndSync(initialServerImgCount: number, initialServerHasDesc: boolean): Promise<void> {
        const electron = (window as any).electron;
        let hydratedFromLocal = false;

        // 1. Nạp ngay dữ liệu đầy đủ (images, attributes, variations, description) từ SQLite cục bộ trước
        if (electron?.getLocalShopeeOffer || electron?.invoke) {
            try {
                const payload = {
                    username: this.username,
                    id: this.product?._id || this.product?.id || '',
                    itemId: this.product?.item_id || '',
                    shopId: this.product?.shop_id || '',
                };
                const localRes = electron.getLocalShopeeOffer
                    ? await electron.getLocalShopeeOffer(payload)
                    : await electron.invoke('get-local-shopee-offer', payload);
                const localOffer = localRes?.success ? localRes.data : null;
                if (localOffer) {
                    const prevImgCount = this.productImages.length;
                    const prevAttrCount = this.productAttributes.length;
                    const prevDescLen = this.productDescription.length;
                    this.mergeProductImages([
                        localOffer.image_url || '',
                        ...(Array.isArray(localOffer.images) ? localOffer.images : []),
                    ]);
                    this.applyProductDetails({
                        attributes: localOffer.attributes,
                        variations: localOffer.variations,
                        description: localOffer.description,
                    });
                    if (!this.selectedProductImageUrl && this.productImages.length > 0) {
                        this.selectedProductImageUrl = this.productImages[0];
                    }
                    hydratedFromLocal =
                        this.productImages.length > prevImgCount ||
                        this.productAttributes.length > prevAttrCount ||
                        this.productDescription.length > prevDescLen;
                    if (hydratedFromLocal) {
                        this._cdr.markForCheck();
                        try {
                            this._cdr.detectChanges();
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        }

        // 2. Luôn lưu toàn bộ hình ảnh sản phẩm hiện có về Documents/ai.type/affiliate/Product Offer/<Tên_SP>_<itemId>/
        if (this.productImages.length > 0) {
            this.saveProductImagesToLocalFolder();
        }

        // 3. Nếu SQLite có dữ liệu phong phú hơn Server 3 -> đồng bộ ngược lên Server 3 để DB máy chủ luôn khớp
        if (
            (this.productImages.length > initialServerImgCount && this.productImages.length > 1) ||
            (!initialServerHasDesc && this.hasProductDetailContent)
        ) {
            this._shopeeOffersService
                .syncSingleOfferDetails(
                    {
                        ...this.product,
                        images: [...this.productImages],
                        attributes: [...this.productAttributes],
                        variations: [...this.productVariations],
                        description: this.productDescription,
                    },
                    this.username,
                )
                .catch(() => {});
        }

        // 4. Chỉ tải thêm từ Shopee ở nền nếu sau khi nạp SQLite vẫn thiếu gallery ảnh hoặc thiếu mô tả sản phẩm
        if (
            (this.productImages.length <= 1 || !this.productDescription) &&
            (this.product?.item_id || this.product?.product_link)
        ) {
            this.loadAllProductImages(false);
        }
    }

    private persistProductDetailsToLocalDb(): void {
        const electron = (window as any).electron;
        if (electron?.invoke) {
            electron
                .invoke('update-local-shopee-offer-images', {
                    username: this.username,
                    id: this.product?._id || this.product?.id || '',
                    itemId: this.product?.item_id || '',
                    shopId: this.product?.shop_id || '',
                    productName: this.product?.product_name || '',
                    imageUrl: this.product?.image_url || this.productImages[0] || '',
                    productLink: this.product?.product_link || '',
                    offerLink: this.product?.offer_link || '',
                    price: this.product?.price || 0,
                    images: this.productImages,
                    attributes: this.productAttributes,
                    variations: this.productVariations,
                    description: this.productDescription,
                })
                .catch(() => {});
        }

        // Đồng bộ luôn dữ liệu chi tiết/ảnh vừa lấy được lên CouchDB máy chủ
        this._shopeeOffersService
            .syncSingleOfferDetails(
                {
                    ...this.product,
                    images: [...this.productImages],
                    attributes: [...this.productAttributes],
                    variations: [...this.productVariations],
                    description: this.productDescription,
                },
                this.username,
            )
            .catch(() => {});

        // Cập nhật kèm vào bản nháp hiện có (nếu đã từng tạo nháp) mà không làm mất kịch bản/ảnh nền
        try {
            const existingDraft = this._livestreamService.loadDraft(this.product);
            if (existingDraft) {
                this._livestreamService
                    .saveDraft({
                        ...existingDraft,
                        product: {
                            ...existingDraft.product,
                            images: [...this.productImages],
                            attributes: [...this.productAttributes],
                            variations: [...this.productVariations],
                            description: this.productDescription,
                        },
                        productImages: [...this.productImages],
                        productAttributes: [...this.productAttributes],
                        productVariations: [...this.productVariations],
                        productDescription: this.productDescription,
                    })
                    .catch(() => {});
            }
        } catch (_) {}

        this.saveProductImagesToLocalFolder();
    }

    async saveProductImagesToLocalFolder(): Promise<string> {
        const electron = (window as any).electron;
        if (!electron?.invoke || this.productImages.length === 0) return this.productImagesFolderPath;
        try {
            const res = await electron.invoke('save-shopee-product-images-local', {
                productName: this.product?.product_name || '',
                itemId: this.product?.item_id || '',
                shopId: this.product?.shop_id || '',
                offerId: this.product?._id || this.product?.id || '',
                images: this.productImages,
            });
            if (res?.success && res.folderPath) {
                this.productImagesFolderPath = res.folderPath;
                this._cdr.markForCheck();
                return res.folderPath;
            }
        } catch (_) {}
        return this.productImagesFolderPath;
    }

    async openProductImagesFolder(): Promise<void> {
        const electron = (window as any).electron;
        if (!electron?.invoke) return;
        let folder = this.productImagesFolderPath;
        if (!folder) {
            folder = await this.saveProductImagesToLocalFolder();
        }
        if (folder) {
            await electron.invoke('open-file-path', folder);
        } else {
            this._toastr.warning('Chưa có ảnh sản phẩm được lưu cục bộ.');
        }
    }

    get hasProductDetailContent(): boolean {
        return !!(
            this.productAttributes.length > 0 ||
            this.productVariations.length > 0 ||
            this.productDescription.trim().length > 0
        );
    }

    toggleProductDetailPanel(): void {
        this.showProductDetailPanel = !this.showProductDetailPanel;
        this._cdr.markForCheck();
    }

    stopWebToolsCapture(): void {
        if (this._webToolsPollTimer) {
            clearInterval(this._webToolsPollTimer);
            this._webToolsPollTimer = null;
        }
        this.isCapturingFromWebTools = false;
    }

    openProductInWebToolsAndCapture(): void {
        const shopId = String(this.product?.shop_id || '').trim();
        const itemId = String(this.product?.item_id || '').trim();
        const productUrl =
            shopId && itemId
                ? `https://shopee.vn/product/${shopId}/${itemId}`
                : String(this.product?.product_link || this.product?.offer_link || '').trim();
        if (!productUrl) {
            this._toastr.warning('Sản phẩm chưa có đường dẫn Shopee.');
            return;
        }

        // Mở trang sản phẩm Shopee trực tiếp trên Web Tools (phiên người dùng thật)
        window.dispatchEvent(
            new CustomEvent('open-web-tool', {
                detail: {
                    name: 'Shopee Product',
                    url: productUrl,
                },
            }),
        );

        this.stopWebToolsCapture();
        this.isCapturingFromWebTools = true;
        this._cdr.markForCheck();
        this._toastr.info(
            'Đang mở trang sản phẩm trên Web Tools. Nếu Shopee yêu cầu đăng nhập/xác minh, bạn thao tác trực tiếp trên cửa sổ Web Tools để hệ thống tự nạp đủ ảnh, chi tiết và mô tả.',
            'Lấy dữ liệu sản phẩm Shopee',
            { timeOut: 7000 },
        );

        const startedAt = Date.now();
        const readScript = `
            (function () {
                try {
                    var href = String(location.href || '');
                    if (/\\/buyer\\/login|\\/verify|captcha|\\/account\\/signin/i.test(href)) {
                        return { ready: false, waitingAuth: true };
                    }
                    var bodyText = (document.body && document.body.innerText) || '';
                    if (/verify to continue|xác minh để tiếp tục|trượt để xác minh|captcha/i.test(bodyText.slice(0, 1200))) {
                        return { ready: false, waitingAuth: true };
                    }

                    // Cài passive hook bắt JSON /api/v4/pdp/get_pc nếu trang mới tải lại
                    if (!window.__aiTypeShopeePdpHooked) {
                        window.__aiTypeShopeePdpHooked = true;
                        window.__aiTypeShopeePdpCache = null;
                        var origFetch = window.fetch;
                        if (typeof origFetch === 'function') {
                            window.fetch = function () {
                                var p = origFetch.apply(this, arguments);
                                try {
                                    var reqUrl = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url) || '';
                                    if (reqUrl.includes('/api/v4/pdp/get_pc') || reqUrl.includes('/api/v4/item/get')) {
                                        p.then(function (resp) {
                                            return resp.clone().json().then(function (j) { window.__aiTypeShopeePdpCache = j; }).catch(function () {});
                                        }).catch(function () {});
                                    }
                                } catch (_) {}
                                return p;
                            };
                        }
                    }

                    var normalizeImg = function (raw) {
                        if (!raw || typeof raw !== 'string') return '';
                        var s = raw.trim();
                        if (!s || s.startsWith('data:') || s.startsWith('blob:')) return '';
                        if (s.startsWith('//')) s = 'https:' + s;
                        if (!/^https?:\\/\\//i.test(s)) {
                            if (!/^[a-zA-Z0-9._-]{10,}$/.test(s)) return '';
                            s = 'https://down-vn.img.susercontent.com/file/' + s.replace(/^\\/+/, '');
                        }
                        if (/(?:avatar|logo|icon|badge|flag|overlay|placeholder|static\\.shopee|deo\\.shopeemobile)/i.test(s)) return '';
                        if (/(?:susercontent\\.com|shopee\\.vn)\\/file\\//i.test(s)) {
                            s = s.split('@')[0].split('?')[0].replace(/_tn(?=\\.[a-z0-9]+$|$)/i, '');
                        }
                        return s;
                    };

                    var imgSet = {};
                    var images = [];
                    var pushImg = function (u) {
                        var nu = normalizeImg(u);
                        if (!nu) return;
                        var fk = (nu.split('/file/')[1] || nu).replace(/\\.(?:webp|jpg|jpeg|png)$/i, '').toLowerCase();
                        if (!imgSet[fk]) { imgSet[fk] = true; images.push(nu); }
                    };

                    var attrs = [];
                    var attrSet = {};
                    var pushAttr = function (k, v) {
                        var kk = String(k || '').trim();
                        var vv = String(v || '').trim();
                        if (!kk || !vv) return;
                        if (!attrSet[kk.toLowerCase()]) { attrSet[kk.toLowerCase()] = true; attrs.push({ name: kk, value: vv }); }
                    };

                    var variations = [];
                    var desc = '';

                    // 1. Đọc từ JSON PDP nếu bắt được
                    var cached = window.__aiTypeShopeePdpCache;
                    var itemObj = cached && cached.data && (cached.data.item || cached.data.product);
                    if (itemObj) {
                        if (Array.isArray(itemObj.images)) itemObj.images.forEach(pushImg);
                        if (cached.data.product_images && Array.isArray(cached.data.product_images.images)) {
                            cached.data.product_images.images.forEach(pushImg);
                        }
                        if (Array.isArray(itemObj.tier_variations)) {
                            itemObj.tier_variations.forEach(function (tv) {
                                if (tv && Array.isArray(tv.images)) tv.images.forEach(pushImg);
                                if (tv && tv.name && Array.isArray(tv.options) && tv.options.length) {
                                    variations.push({ name: String(tv.name).trim(), options: tv.options.map(String).filter(Boolean) });
                                }
                            });
                        }
                        if (Array.isArray(itemObj.attributes)) {
                            itemObj.attributes.forEach(function (a) { pushAttr(a && a.name, a && a.value); });
                        }
                        if (typeof itemObj.description === 'string' && itemObj.description.trim()) {
                            desc = itemObj.description.trim();
                        }
                    }

                    // 1b. Đọc JSON-LD Product schema nếu trang có nhúng
                    try {
                        var ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                        for (var ld = 0; ld < ldScripts.length; ld++) {
                            var ldObj = JSON.parse(ldScripts[ld].textContent || '{}');
                            var ldList = Array.isArray(ldObj) ? ldObj : [ldObj];
                            for (var li = 0; li < ldList.length; li++) {
                                var node = ldList[li];
                                if (!node || typeof node !== 'object') continue;
                                if (Array.isArray(node.image)) node.image.forEach(pushImg);
                                else if (typeof node.image === 'string') pushImg(node.image);
                                if (typeof node.description === 'string' && node.description.trim().length > desc.length) {
                                    desc = node.description.trim();
                                }
                                if (node.brand && (node.brand.name || typeof node.brand === 'string')) {
                                    pushAttr('Thương hiệu', typeof node.brand === 'string' ? node.brand : node.brand.name);
                                }
                            }
                        }
                    } catch (_) {}

                    // 2. Đọc từ DOM thực tế đang hiển thị trên trang sản phẩm Shopee (img + picture source + inline bg)
                    var allImgs = Array.from(document.querySelectorAll('img'));
                    for (var i = 0; i < allImgs.length; i++) {
                        var im = allImgs[i];
                        var rect = im.getBoundingClientRect();
                        if (rect.top > 1300 || rect.top < -300) continue;
                        if ((im.naturalWidth && im.naturalWidth < 60) || (rect.width > 0 && rect.width < 32)) continue;
                        var src = im.currentSrc || im.src || im.getAttribute('data-src') || '';
                        if (src && (src.includes('susercontent.com/file/') || src.includes('shopee.vn/file/'))) {
                            pushImg(src);
                        }
                    }
                    var allSources = Array.from(document.querySelectorAll('picture source[srcset]'));
                    for (var si = 0; si < allSources.length; si++) {
                        var srcEl = allSources[si];
                        var pRect = srcEl.parentElement ? srcEl.parentElement.getBoundingClientRect() : null;
                        if (pRect && (pRect.top > 1300 || pRect.top < -300)) continue;
                        var srcset = srcEl.getAttribute('srcset') || '';
                        var matches = srcset.match(/https?:\\/\\/[^\\s,]+(?:susercontent\\.com|shopee\\.vn)\\/file\\/[^\\s,]+/gi) || [];
                        for (var mi = 0; mi < matches.length; mi++) pushImg(matches[mi]);
                    }

                    // Đọc CHI TIẾT SẢN PHẨM & MÔ TẢ SẢN PHẨM từ DOM
                    var headings = Array.from(document.querySelectorAll('h2, h3, div'));
                    for (var h = 0; h < headings.length; h++) {
                        var el = headings[h];
                        if (el.children.length > 1) continue;
                        var t = (el.innerText || '').trim().toUpperCase();
                        if (t === 'CHI TIẾT SẢN PHẨM' && attrs.length === 0) {
                            var sec = el.parentElement;
                            if (sec) {
                                var pairs = Array.from(sec.querySelectorAll('div')).filter(function (d) {
                                    return d.children.length === 2 && d.querySelector('label');
                                });
                                for (var p = 0; p < pairs.length; p++) {
                                    var lbl = pairs[p].querySelector('label');
                                    pushAttr(lbl && lbl.innerText, pairs[p].children[1] && pairs[p].children[1].innerText);
                                }
                            }
                        } else if (t === 'MÔ TẢ SẢN PHẨM' && !desc) {
                            var secD = el.parentElement;
                            if (secD) {
                                var txt = (secD.innerText || '').replace(/^MÔ TẢ SẢN PHẨM\\s*/i, '').trim();
                                if (txt.length > 15) desc = txt;
                            }
                        }
                    }

                    var hasEnough = images.length >= 2 || attrs.length > 0 || desc.length > 20;
                    return { ready: hasEnough, waitingAuth: false, images: images, attributes: attrs, variations: variations, description: desc };
                } catch (e) {
                    return { ready: false, error: String(e) };
                }
            })();
        `;

        let firstCapturedAt = 0;
        let toastedFirst = false;
        this._webToolsPollTimer = setInterval(async () => {
            if (Date.now() - startedAt > 90000) {
                this.stopWebToolsCapture();
                this._cdr.markForCheck();
                return;
            }
            try {
                const container = document.getElementById('webview-container-div');
                if (!container) return;
                const webviews = Array.from(container.querySelectorAll('webview')) as any[];
                const targetWv = webviews.find((wv) => {
                    try {
                        const u = (typeof wv.getURL === 'function' ? wv.getURL() : wv.getAttribute('src')) || '';
                        return u.includes('shopee.vn/product/') || u.includes('-i.') || (itemId && u.includes(itemId));
                    } catch (_) {
                        return false;
                    }
                });
                if (!targetWv || typeof targetWv.executeJavaScript !== 'function') return;

                const data = await targetWv.executeJavaScript(readScript);
                if (data && data.ready) {
                    const prevImgs = this.productImages.length;
                    const prevAttrs = this.productAttributes.length;
                    const prevDescLen = this.productDescription.length;

                    if (Array.isArray(data.images) && data.images.length > 0) {
                        this.mergeProductImages(data.images);
                    }
                    this.applyProductDetails({
                        attributes: data.attributes,
                        variations: data.variations,
                        description: data.description,
                    });

                    const changed =
                        this.productImages.length > prevImgs ||
                        this.productAttributes.length > prevAttrs ||
                        this.productDescription.length > prevDescLen;

                    if (changed) {
                        this.productFetchBlocked = false;
                        this.persistProductDetailsToLocalDb();
                        this._cdr.markForCheck();
                        try {
                            this._cdr.detectChanges();
                        } catch (_) {}
                    }

                    if (!firstCapturedAt) firstCapturedAt = Date.now();
                    const gotComplete = this.productImages.length >= 2 && this.hasProductDetailContent;
                    const waitedEnough = Date.now() - firstCapturedAt >= 8000;

                    if (gotComplete || waitedEnough) {
                        this.stopWebToolsCapture();
                        if (!toastedFirst || changed) {
                            toastedFirst = true;
                            this._toastr.success(
                                `Đã nạp ${this.productImages.length} ảnh${this.productAttributes.length ? `, ${this.productAttributes.length} thông số chi tiết` : ''}${this.productDescription ? ' và mô tả sản phẩm' : ''} từ Shopee.`,
                                'Đã cập nhật sản phẩm',
                            );
                        }
                        this._cdr.markForCheck();
                        try {
                            this._cdr.detectChanges();
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        }, 1800);
    }

    async loadAllProductImages(manual = false): Promise<void> {
        if (this.isLoadingProductImages) return;
        const electron = (window as any).electron;
        if (!electron?.invoke) return;

        this.isLoadingProductImages = true;
        this._cdr.markForCheck();
        try {
            const res = await electron.invoke('fetch-shopee-product-images', {
                shopId: this.product?.shop_id || '',
                itemId: this.product?.item_id || '',
                offerId: this.product?._id || this.product?.id || '',
                productName: this.product?.product_name || '',
                productLink: this.product?.product_link || '',
                offerLink: this.product?.offer_link || '',
                coverImageUrl: this.product?.image_url || '',
                existingImages: this.productImages,
            });
            if (res?.success) {
                const beforeCount = this.productImages.length;
                if (res.localFolderPath) {
                    this.productImagesFolderPath = res.localFolderPath;
                }
                if (Array.isArray(res.images) && res.images.length > 0) {
                    this.mergeProductImages(res.images);
                }
                this.applyProductDetails({
                    attributes: res.attributes,
                    variations: res.variations,
                    description: res.description,
                });
                if (!this.selectedProductImageUrl && this.productImages.length > 0) {
                    this.selectedProductImageUrl = this.productImages[0];
                }
                this.productFetchBlocked = !!res.blocked || (this.productImages.length <= 1 && !this.productDescription);
                if (this.productImages.length > 1 || this.hasProductDetailContent) {
                    this.persistProductDetailsToLocalDb();
                }
                if (manual) {
                    if (this.productImages.length > beforeCount || this.hasProductDetailContent) {
                        this._toastr.success(
                            `Đã tải ${this.productImages.length} hình ảnh${this.hasProductDetailContent ? ' cùng chi tiết và mô tả sản phẩm' : ''}.`,
                        );
                    } else {
                        this._toastr.info(
                            'Shopee yêu cầu mở trực tiếp trang sản phẩm để xem đủ ảnh & chi tiết. Hãy bấm nút "Lấy từ Shopee" bên cạnh.',
                            'Cần mở trang Shopee',
                            { timeOut: 6000 },
                        );
                    }
                }
            }
        } catch (_) {
            this.productFetchBlocked = true;
            if (manual) {
                this._toastr.info('Hãy bấm nút "Lấy từ Shopee" để mở trang sản phẩm trên Web Tools và nạp đủ ảnh, chi tiết, mô tả.');
            }
        } finally {
            this.isLoadingProductImages = false;
            this._cdr.markForCheck();
            try {
                this._cdr.detectChanges();
            } catch (_) {}
        }
    }

    async onReferenceFilesSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement | null;
        const files = input?.files;
        if (!files || files.length === 0) return;

        const maxFiles = 5;
        const remaining = maxFiles - this.referenceImages.length;
        if (remaining <= 0) {
            this._toastr.warning(`Chỉ hỗ trợ tối đa ${maxFiles} ảnh tham chiếu.`);
            if (input) input.value = '';
            return;
        }

        const picked = Array.from(files).slice(0, remaining);
        if (files.length > remaining) {
            this._toastr.info(`Đã chọn ${remaining} ảnh đầu tiên (tối đa ${maxFiles} ảnh tham chiếu).`);
        }

        for (let i = 0; i < picked.length; i++) {
            const file = picked[i];
            if (!file.type.startsWith('image/')) continue;
            try {
                // Ảnh đầu tiên mặc định gắn vai trò Diễn viên, ảnh tiếp theo là Bối cảnh nếu đã có Diễn viên
                const hasActor = this.referenceImages.some((r) => r.role === 'actor');
                const defaultRole: AffiliateReferenceRole = !hasActor ? 'actor' : 'background';
                const compressed = await this._livestreamService.readAndCompressImageFile(file, defaultRole);
                this.referenceImages = [...this.referenceImages, compressed];
                this._cdr.markForCheck();
            } catch (err: any) {
                this._toastr.error(`Không thể đọc ảnh "${file.name}": ${err?.message || 'Lỗi không xác định'}`);
            }
        }

        if (input) input.value = '';
        this._cdr.markForCheck();
    }

    removeReferenceImage(index: number): void {
        if (index < 0 || index >= this.referenceImages.length) return;
        this.referenceImages = this.referenceImages.filter((_, idx) => idx !== index);
        this._cdr.markForCheck();
    }

    cycleReferenceRole(ref: AffiliateReferenceImage): void {
        const order: AffiliateReferenceRole[] = ['actor', 'background', 'product'];
        const nextIdx = (order.indexOf(ref.role) + 1) % order.length;
        ref.role = order[nextIdx];
        this._cdr.markForCheck();
    }

    getReferenceRoleLabel(role: AffiliateReferenceRole): string {
        switch (role) {
            case 'actor':
                return 'Diễn viên';
            case 'background':
                return 'Bối cảnh';
            case 'product':
                return 'Sản phẩm';
            default:
                return 'Tham chiếu';
        }
    }

    async downloadBackdropImage(): Promise<void> {
        let src = this.backdropPreviewSrc || this.backdropImageUrl;
        if (!src) return;
        const fileName = `livestream_backdrop_${this.backdropAspectRatio.replace(':', 'x')}_${this._livestreamService.getOfferKey(this.product)}.png`;
        let blobUrlToRevoke = '';

        try {
            if (!src.startsWith('data:')) {
                const electron = (window as any).electron;
                const electronAPI = (window as any).electronAPI;
                if ((electron || electronAPI) && this.backdropLocalPath) {
                    const res = electronAPI?.readFileBase64
                        ? await electronAPI.readFileBase64(this.backdropLocalPath)
                        : electron?.readFileBase64
                          ? await electron.readFileBase64(this.backdropLocalPath)
                          : electron?.invoke
                            ? await electron.invoke('read-file-base64', { filePath: this.backdropLocalPath })
                            : null;
                    if (res?.success && res.base64) {
                        const mime = this.backdropLocalPath.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png';
                        src = `data:${mime};base64,${res.base64}`;
                    }
                }
                if (!src.startsWith('data:')) {
                    const resp = await fetch(src);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        blobUrlToRevoke = URL.createObjectURL(blob);
                        src = blobUrlToRevoke;
                    }
                }
            }
        } catch (_) {}

        const a = document.createElement('a');
        a.href = src;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (blobUrlToRevoke) {
            setTimeout(() => URL.revokeObjectURL(blobUrlToRevoke), 1500);
        }
    }

    private buildDraftObject(): AffiliateLivestreamDraft {
        const offerId = this._livestreamService.getOfferKey(this.product);
        const rawCleanScenes = this.scenes
            .map((sc) => ({
                ...sc,
                imageUrl: this.backdropImageUrl || sc.imageUrl || this.product.image_url || '',
                subtitles: (sc.subtitles || [])
                    .map((sub) => ({
                        ...sub,
                        text: String(sub.text || '').trim(),
                        duration: Math.max(1, Math.min(this.maxSceneDurationSec, Math.round(Number(sub.duration) || 1))),
                    }))
                    .filter((sub) => sub.text.length > 0),
            }))
            .filter((sc) => sc.subtitles.length > 0);

        const cleanScenes = this._livestreamService.enforceMaxSceneDuration(
            rawCleanScenes,
            this.maxSceneDurationSec,
            this.maxSceneDurationSec,
        );

        return {
            uuid: this._livestreamService.getLivestreamUuid(this.product),
            offerId,
            product: this.product,
            brief: (this.brief || '').trim(),
            durationMinutes: Math.max(1, Math.min(180, Math.round(Number(this.durationMinutes) || 10))),
            maxSubtitleSeconds: this.maxSubtitleSeconds || 15,
            style: this.style,
            styleDescription: this.getSelectedStyleDescription(),
            voice: this.voice,
            aspectRatio: this.aspectRatio,
            title: (this.scriptTitle || '').trim() || `Livestream ${this.durationMinutes} phút - ${this.product.product_name}`,
            hookSummary: (this.hookSummary || '').trim(),
            scenes: cleanScenes,
            productImages: [...this.productImages],
            selectedProductImageUrl: this.selectedProductImageUrl || this.product.image_url || '',
            productAttributes: [...this.productAttributes],
            productVariations: [...this.productVariations],
            productDescription: this.productDescription || '',
            referenceImages: this.referenceImages.map((r) => ({ ...r })),
            backdropImageUrl: this.backdropImageUrl || undefined,
            backdropLocalPath: this.backdropLocalPath || undefined,
            backdropAspectRatio: this.backdropImageUrl ? this.backdropAspectRatio : undefined,
            generatedBy: this.generatedBy,
            updatedAt: new Date().toISOString(),
        };
    }

    async generateBackdropOnly(): Promise<boolean> {
        if (this.isGeneratingScript || this.isGeneratingBackdrop || this.isPreparingPreview) return false;
        this.isGeneratingBackdrop = true;
        this._cdr.markForCheck();

        try {
            const uuid = this._livestreamService.getLivestreamUuid(this.product);
            const res = await this._livestreamService.generateLivestreamBackdropImage({
                product: this.product,
                selectedProductImageUrl: this.selectedProductImageUrl || this.product.image_url,
                brief: this.brief,
                style: this.style,
                styleDescription: this.getSelectedStyleDescription(),
                voice: this.voice,
                aspectRatio: this.aspectRatio,
                referenceImages: this.referenceImages,
                username: this.username,
                uuid,
                scriptTitle: this.scriptTitle,
            });

            this.backdropImageUrl = res.imageUrl;
            this.backdropPreviewSrc = res.dataUrl || res.imageUrl;
            this.backdropLocalPath = res.localPath || '';
            this.backdropAspectRatio = this.aspectRatio;

            for (const sc of this.scenes) {
                sc.imageUrl = res.imageUrl;
            }

            if (this.scenes.length > 0) {
                await this._livestreamService.saveDraft(this.buildDraftObject());
            }

            this._toastr.success(
                `Đã tạo ảnh khung nền livestream chuẩn tỉ lệ ${this.aspectRatio} (diễn viên + sản phẩm).`,
                'Ảnh khung nền Livestream',
            );
            return true;
        } catch (err: any) {
            this._toastr.warning(
                `Chưa tạo được ảnh khung nền livestream: ${err?.message || 'Lỗi không xác định'}. Bạn vẫn có thể kiểm thử bằng ảnh sản phẩm gốc.`,
                'Ảnh khung nền Livestream',
                { timeOut: 7000 },
            );
            return false;
        } finally {
            this.isGeneratingBackdrop = false;
            this._cdr.markForCheck();
            try {
                this._cdr.detectChanges();
            } catch (_) {}
        }
    }

    async generateScript(): Promise<boolean> {
        if (this.isGeneratingScript || this.isGeneratingBackdrop || this.isPreparingPreview) return false;
        this.onDurationInputChange();

        this.isGeneratingScript = true;
        this.generationPhaseText = 'Đang tạo kịch bản bằng AI...';
        this._cdr.markForCheck();

        try {
            const res = await this._livestreamService.generateScript({
                product: this.product,
                brief: this.brief,
                durationMinutes: this.durationMinutes,
                maxSubtitleSeconds: this.maxSubtitleSeconds,
                style: this.style,
                styleDescription: this.getSelectedStyleDescription(),
                ctaTemplate: this.ctaTemplate,
            });

            this.scriptTitle = res.title;
            this.hookSummary = res.hookSummary;
            this.scenes = res.scenes;
            this.generatedBy = res.generatedBy;

            // Tự động tạo ảnh khung nền livestream đúng tỉ lệ + diễn viên + sản phẩm để sẵn sàng làm video tiếp theo
            this.isGeneratingBackdrop = true;
            this.generationPhaseText = `Đang tạo ảnh khung nền livestream (${this.aspectRatio})...`;
            this._cdr.markForCheck();

            let backdropOk = false;
            try {
                const uuid = this._livestreamService.getLivestreamUuid(this.product);
                const bgRes = await this._livestreamService.generateLivestreamBackdropImage({
                    product: this.product,
                    selectedProductImageUrl: this.selectedProductImageUrl || this.product.image_url,
                    brief: this.brief,
                    style: this.style,
                    styleDescription: this.getSelectedStyleDescription(),
                    voice: this.voice,
                    aspectRatio: this.aspectRatio,
                    referenceImages: this.referenceImages,
                    username: this.username,
                    uuid,
                    scriptTitle: this.scriptTitle,
                });
                this.backdropImageUrl = bgRes.imageUrl;
                this.backdropPreviewSrc = bgRes.dataUrl || bgRes.imageUrl;
                this.backdropLocalPath = bgRes.localPath || '';
                this.backdropAspectRatio = this.aspectRatio;
                for (const sc of this.scenes) {
                    sc.imageUrl = bgRes.imageUrl;
                }
                backdropOk = true;
            } catch (bgErr: any) {
                console.warn('[AffiliateLivestream] Tạo ảnh khung nền thất bại:', bgErr);
                this._toastr.warning(
                    `Đã tạo kịch bản, nhưng chưa tạo được ảnh khung nền livestream (${bgErr?.message || 'kiểm tra cấu hình model tạo ảnh AI'}).`,
                    'Ảnh khung nền Livestream',
                    { timeOut: 7000 },
                );
            } finally {
                this.isGeneratingBackdrop = false;
            }

            await this._livestreamService.saveDraft(this.buildDraftObject());

            if (res.warning) {
                this._toastr.info(res.warning, 'Kịch bản Livestream', { timeOut: 7000 });
            } else {
                this._toastr.success(
                    `Đã tạo xong kịch bản ${this.scenes.length} phân cảnh (${this.formatMMSS(this.totalScriptSeconds)})${backdropOk ? ' và ảnh khung nền livestream ' + this.aspectRatio : ''}.`,
                    'Tạo kịch bản thành công',
                );
            }
            return true;
        } catch (err: any) {
            this._toastr.error(`Không thể tạo kịch bản livestream: ${err?.message || 'Lỗi không xác định'}`);
            return false;
        } finally {
            this.isGeneratingScript = false;
            this.isGeneratingBackdrop = false;
            this.generationPhaseText = '';
            this._cdr.markForCheck();
            try {
                this._cdr.detectChanges();
            } catch (_) {}
        }
    }

    async saveDraftOnly(): Promise<void> {
        const draft = this.buildDraftObject();
        if (draft.scenes.length === 0) {
            this._toastr.warning('Hãy tạo kịch bản trước khi lưu nháp.');
            return;
        }
        await this._livestreamService.saveDraft(draft);
        this._toastr.success('Đã lưu bản nháp kịch bản livestream cho sản phẩm này.');
    }

    skipVoiceSynthesis(): void {
        this._skipTtsRequested = true;
    }

    async startPreviewTest(): Promise<void> {
        if (this.isGeneratingScript || this.isPreparingPreview) return;

        // Nếu chưa có kịch bản -> tự động tạo kịch bản trước rồi vào ngay màn hình kiểm thử
        if (this.scenes.length === 0) {
            const ok = await this.generateScript();
            if (!ok || this.scenes.length === 0) return;
        }

        const draft = this.buildDraftObject();
        if (draft.scenes.length === 0) {
            this._toastr.warning('Kịch bản đang trống, vui lòng nhập ít nhất 1 câu thoại.');
            return;
        }

        this.isPreparingPreview = true;
        this._skipTtsRequested = false;
        this.ttsProgressDone = 0;
        const linesNeedingTts = draft.scenes.reduce(
            (acc, s) => acc + (s.subtitles || []).filter((sub) => !sub.videoUrl).length,
            0,
        );
        this.ttsProgressTotal = linesNeedingTts;
        this.ttsStatusText =
            this.voice !== 'none' && this.isElectronEnv && linesNeedingTts > 0
                ? 'Đang khởi tạo giọng đọc kiểm thử...'
                : 'Đang chuẩn bị phòng kiểm thử Livestream Studio...';
        this._cdr.markForCheck();

        try {
            if (this.voice !== 'none' && this.isElectronEnv && linesNeedingTts > 0) {
                await this._livestreamService.synthesizeVoicesForScenes(draft.scenes, {
                    voice: this.voice,
                    username: this.username,
                    uuid: draft.uuid,
                    isCancelled: () => this._skipTtsRequested,
                    onProgress: (done, total, text) => {
                        this.ttsProgressDone = done;
                        this.ttsProgressTotal = total;
                        this.ttsStatusText = `Đang tạo giọng đọc câu ${done}/${total}: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`;
                        this._cdr.markForCheck();
                    },
                });
            }

            const uuid = await this._livestreamService.prepareLivestreamStudioSession(draft, {
                username: this.username,
                previewMode: true,
                returnUrl: '/settings?tab=affiliate',
            });

            this._dialogRef.close({
                action: 'preview',
                uuid,
                offerId: draft.offerId,
            });
        } catch (err: any) {
            this._toastr.error(`Lỗi chuẩn bị màn hình kiểm thử: ${err?.message || 'Không xác định'}`);
            this.isPreparingPreview = false;
            this._cdr.markForCheck();
        }
    }

    close(): void {
        if (this.isPreparingPreview) {
            this._skipTtsRequested = true;
        }
        this._dialogRef.close();
    }
}
