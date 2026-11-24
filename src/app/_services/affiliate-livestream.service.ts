import { Injectable } from '@angular/core';
import { GenaiService } from 'app/genai.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { ShopeeOfferItem } from 'app/_services/shopee-offers.service';

export type AffiliateLivestreamStyle = string;
export type AffiliateLivestreamVoice = 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural' | 'none';
export type AffiliateLivestreamAspect = '9:16' | '16:9';
export type AffiliateReferenceRole = 'actor' | 'background' | 'product';

export interface AffiliateReferenceImage {
    id: string;
    name: string;
    dataUrl: string;
    mimeType: string;
    role: AffiliateReferenceRole;
}

export interface AffiliateLivestreamSubtitle {
    id: string;
    text: string;
    duration: number;
    audioUrl?: string;
    voiceHash?: string;
    videoUrl?: string;
    videoLocalPath?: string;
    videoName?: string;
}

export interface AffiliateLivestreamScene {
    id: string;
    title: string;
    phase: string;
    actionCue: string;
    durationSec: number;
    imageUrl: string;
    subtitles: AffiliateLivestreamSubtitle[];
}

export interface AffiliateLivestreamDraft {
    uuid: string;
    offerId: string;
    product: ShopeeOfferItem;
    brief: string;
    durationMinutes: number;
    maxSubtitleSeconds?: number;
    style: AffiliateLivestreamStyle;
    styleDescription?: string;
    voice: AffiliateLivestreamVoice;
    aspectRatio: AffiliateLivestreamAspect;
    title: string;
    hookSummary: string;
    scenes: AffiliateLivestreamScene[];
    productImages?: string[];
    selectedProductImageUrl?: string;
    productAttributes?: Array<{ name: string; value: string }>;
    productVariations?: Array<{ name: string; options: string[] }>;
    productDescription?: string;
    referenceImages?: AffiliateReferenceImage[];
    backdropImageUrl?: string;
    backdropLocalPath?: string;
    backdropAspectRatio?: AffiliateLivestreamAspect;
    generatedBy: 'ai' | 'template';
    updatedAt: string;
}

export interface GenerateBackdropImageParams {
    product: ShopeeOfferItem;
    selectedProductImageUrl?: string;
    brief: string;
    style: string;
    styleDescription?: string;
    voice: AffiliateLivestreamVoice;
    aspectRatio: AffiliateLivestreamAspect;
    referenceImages: AffiliateReferenceImage[];
    username: string;
    uuid: string;
    scriptTitle?: string;
}

export interface GenerateBackdropImageResult {
    imageUrl: string;
    localPath?: string;
    dataUrl?: string;
}

export interface GenerateAffiliateScriptParams {
    product: ShopeeOfferItem;
    brief: string;
    durationMinutes: number;
    maxSubtitleSeconds?: number;
    style: AffiliateLivestreamStyle;
    styleDescription?: string;
    ctaTemplate?: string;
}

export interface GenerateAffiliateScriptResult {
    title: string;
    hookSummary: string;
    scenes: AffiliateLivestreamScene[];
    generatedBy: 'ai' | 'template';
    warning?: string;
}

const LEGACY_STYLE_MAP: Record<string, string> = {
    energetic: 'Năng lượng cao, chốt đơn nhanh, tạo cảm giác khan hiếm và hào hứng',
    expert_review: 'Chuyên gia phân tích chân thật, đi sâu tính năng, so sánh thực tế',
    storytelling: 'Gần gũi, kể chuyện trải nghiệm đời thường, dễ đồng cảm',
    luxury: 'Thanh lịch, tinh tế, nhấn mạnh chất lượng và đẳng cấp sản phẩm',
};

@Injectable({
    providedIn: 'root',
})
export class AffiliateLivestreamService {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';
    private readonly DRAFT_KEY_PREFIX = 'affiliate_livestream_draft_';

    constructor(
        private _genaiService: GenaiService,
        private _multiAccountService: MultiAccountService,
    ) {}

    getOfferKey(product: ShopeeOfferItem): string {
        const raw = product?._id || product?.id || (product?.shop_id && product?.item_id ? `offer_${product.shop_id}_${product.item_id}` : product?.item_id || 'offer');
        return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    getLivestreamUuid(product: ShopeeOfferItem): string {
        return `aff_live_${this.getOfferKey(product)}`;
    }

    hasDraft(product: ShopeeOfferItem): boolean {
        try {
            const existing = this.loadDraft(product);
            return this.isDraftInProgress(existing);
        } catch (_) {
            return false;
        }
    }

    isDraftInProgress(draft: AffiliateLivestreamDraft | null | undefined): boolean {
        if (!draft || typeof draft !== 'object') return false;
        const hasScenes = Array.isArray(draft.scenes) && draft.scenes.length > 0;
        const hasBackdrop = !!String(draft.backdropImageUrl || '').trim();
        const hasBrief = !!String(draft.brief || '').trim();
        const hasVideo =
            hasScenes &&
            draft.scenes.some(
                (sc) => Array.isArray(sc?.subtitles) && sc.subtitles.some((sub) => !!String(sub?.videoUrl || '').trim()),
            );
        return hasScenes || hasBackdrop || hasVideo || hasBrief;
    }

    getInProgressDrafts(): AffiliateLivestreamDraft[] {
        try {
            const allDrafts = (this._multiAccountService.getItemsByPrefix(this.DRAFT_KEY_PREFIX) || []) as AffiliateLivestreamDraft[];
            const valid = allDrafts.filter((d) => this.isDraftInProgress(d) && d?.product);
            valid.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

            // Khử trùng lặp theo item_id hoặc offerId (giữ bản cập nhật mới nhất)
            const seen = new Set<string>();
            const deduped: AffiliateLivestreamDraft[] = [];
            for (const d of valid) {
                const key = String(d.product?.item_id || d.offerId || d.product?._id || d.product?.id || '').trim();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                deduped.push(d);
            }
            return deduped;
        } catch (_) {
            return [];
        }
    }

    loadDraft(product: ShopeeOfferItem): AffiliateLivestreamDraft | null {
        const direct = this.loadDraftByOfferId(this.getOfferKey(product));
        if (direct) return direct;

        // Dự phòng: tìm theo item_id trong trường hợp _id của offer đổi từ offer_<itemId> sang offer_<shopId>_<itemId> sau khi đồng bộ
        const itemId = String(product?.item_id || '').trim();
        if (!itemId) return null;

        const byItemKey = this.loadDraftByOfferId(`offer_${itemId}`);
        if (byItemKey) return byItemKey;

        try {
            const allDrafts = this._multiAccountService.getItemsByPrefix(this.DRAFT_KEY_PREFIX) || [];
            const matched = allDrafts
                .filter(
                    (d: any) =>
                        d &&
                        typeof d === 'object' &&
                        (String(d.product?.item_id || '').trim() === itemId ||
                            String(d.offerId || '').endsWith(`_${itemId}`)),
                )
                .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
            if (matched.length > 0) {
                return matched[0] as AffiliateLivestreamDraft;
            }
        } catch (_) {}
        return null;
    }

    loadDraftByOfferId(offerId: string): AffiliateLivestreamDraft | null {
        try {
            if (!offerId) return null;
            const key = `${this.DRAFT_KEY_PREFIX}${offerId}`;
            const data = this._multiAccountService.getItem(key);
            if (data && typeof data === 'object') {
                return data as AffiliateLivestreamDraft;
            }
        } catch (_) {}
        return null;
    }

    async saveDraft(draft: AffiliateLivestreamDraft): Promise<void> {
        const key = `${this.DRAFT_KEY_PREFIX}${draft.offerId}`;
        const updated: AffiliateLivestreamDraft = {
            ...draft,
            updatedAt: new Date().toISOString(),
        };
        await this._multiAccountService.setItem(key, updated);
    }

    public readonly MAX_SCENE_DURATION_SEC = 40;

    calculateSceneCount(durationMinutes: number): number {
        const mins = Math.max(1, Math.min(180, Number(durationMinutes) || 5));
        const targetSec = mins * 60;
        return Math.max(2, Math.ceil(targetSec / this.MAX_SCENE_DURATION_SEC));
    }

    /**
     * Đảm bảo TUYỆT ĐỐI mọi phân cảnh có tổng thời lượng <= maxSceneSec (mặc định 40s).
     * Nếu 1 cảnh vượt quá 40s, tự động tách các câu thoại tràn sang phân cảnh nối tiếp mà không làm mất lời thoại hay video/audio đã gắn.
     */
    enforceMaxSceneDuration(
        scenes: AffiliateLivestreamScene[],
        maxSceneSec = this.MAX_SCENE_DURATION_SEC,
        maxSubtitleSec = this.MAX_SCENE_DURATION_SEC,
    ): AffiliateLivestreamScene[] {
        const sceneLimit = Math.max(1, Math.round(Number(maxSceneSec) || this.MAX_SCENE_DURATION_SEC));
        const subLimit = Math.max(1, Math.min(sceneLimit, Math.round(Number(maxSubtitleSec) || sceneLimit)));
        const result: AffiliateLivestreamScene[] = [];

        for (let sIdx = 0; sIdx < (scenes || []).length; sIdx++) {
            const sc = scenes[sIdx];
            if (!sc) continue;
            const subs = (sc.subtitles || [])
                .filter((sub) => !!sub)
                .map((sub) => ({
                    ...sub,
                    duration: Math.max(1, Math.min(subLimit, Math.round(Number(sub.duration) || 1))),
                }));
            if (subs.length === 0) continue;

            const chunks: AffiliateLivestreamSubtitle[][] = [];
            let currentChunk: AffiliateLivestreamSubtitle[] = [];
            let currentSum = 0;

            for (const sub of subs) {
                if (currentChunk.length > 0 && currentSum + sub.duration > sceneLimit) {
                    chunks.push(currentChunk);
                    currentChunk = [sub];
                    currentSum = sub.duration;
                } else {
                    currentChunk.push(sub);
                    currentSum += sub.duration;
                }
            }
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }

            chunks.forEach((chunkSubs, cIdx) => {
                const dur = chunkSubs.reduce((acc, item) => acc + item.duration, 0);
                const baseTitle = String(sc.title || `Phân cảnh ${result.length + 1}`).replace(/\s*\(Phần\s+\d+\)\s*$/i, '').trim();
                result.push({
                    ...sc,
                    id: cIdx === 0 ? sc.id : `${sc.id}_p${cIdx + 1}_${Math.random().toString(36).slice(2, 5)}`,
                    title: chunks.length > 1 ? `${baseTitle} (Phần ${cIdx + 1})` : baseTitle,
                    durationSec: Math.min(sceneLimit, dur),
                    subtitles: chunkSubs,
                });
            });
        }

        return result;
    }

    computeTotalDurationSec(scenes: AffiliateLivestreamScene[]): number {
        if (!Array.isArray(scenes)) return 0;
        return scenes.reduce((acc, s) => {
            const subSum = (s.subtitles || []).reduce((t, sub) => t + (Number(sub.duration) || 5), 0);
            return acc + (subSum > 0 ? subSum : (Number(s.durationSec) || 15));
        }, 0);
    }

    formatDurationMMSS(totalSec: number): string {
        const safe = Math.max(0, Math.round(Number(totalSec) || 0));
        const mins = Math.floor(safe / 60);
        const secs = safe % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    private formatPriceVnd(price: number | undefined): string {
        const n = Number(price) || 0;
        if (n <= 0) return 'giá ưu đãi trên giỏ hàng';
        return `${n.toLocaleString('vi-VN')} đồng`;
    }

    private estimateSpeechDurationSec(text: string, maxSubtitleSeconds = 15): number {
        const maxSec = Math.max(1, Math.min(30, Math.round(Number(maxSubtitleSeconds) || 15)));
        const minSec = maxSec <= 1 ? 1 : Math.min(3, maxSec);
        const words = String(text || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
        // Tốc độ dẫn livestream tiếng Việt tự nhiên: ~2.3 từ/giây
        const raw = words <= 3 ? 1 : Math.round(words / 2.3) + (maxSec >= 5 ? 1 : 0);
        return Math.max(minSec, Math.min(maxSec, raw));
    }

    private splitTextToFitMaxSeconds(text: string, maxSec: number): string[] {
        const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) return [];
        const maxWords = Math.max(3, Math.floor(maxSec * 2.4));
        const words = cleaned.split(' ');
        if (words.length <= Math.ceil(maxWords * 1.2)) {
            return [cleaned];
        }

        // Tách ưu tiên theo dấu câu trước, sau đó cắt theo cụm từ để mỗi câu thoại vừa vặn thời lượng tối đa
        const clauses = cleaned
            .split(/(?<=[.!?;,])\s+/)
            .map((c) => c.trim())
            .filter(Boolean);
        const chunks: string[] = [];
        let buffer = '';

        const flushBuffer = () => {
            if (buffer.trim()) {
                chunks.push(buffer.trim());
                buffer = '';
            }
        };

        for (const clause of clauses) {
            const cWords = clause.split(/\s+/).filter(Boolean);
            if (cWords.length > maxWords) {
                flushBuffer();
                for (let i = 0; i < cWords.length; i += maxWords) {
                    chunks.push(cWords.slice(i, i + maxWords).join(' '));
                }
                continue;
            }
            const combined = buffer ? `${buffer} ${clause}` : clause;
            if (combined.split(/\s+/).filter(Boolean).length <= maxWords) {
                buffer = combined;
            } else {
                flushBuffer();
                buffer = clause;
            }
        }
        flushBuffer();
        return chunks.length > 0 ? chunks : [cleaned];
    }

    private normalizeScenesToTargetDuration(
        rawScenes: any[],
        product: ShopeeOfferItem,
        durationMinutes: number,
        maxSubtitleSeconds = 15,
    ): AffiliateLivestreamScene[] {
        const targetTotalSec = Math.max(60, Math.round((Number(durationMinutes) || 5) * 60));
        const maxSec = Math.max(1, Math.min(30, Math.round(Number(maxSubtitleSeconds) || 15)));
        const minSec = maxSec <= 1 ? 1 : Math.min(3, maxSec);
        const fallbackImg = product?.image_url || './assets/images/logo/favicon.svg';

        const cleaned: AffiliateLivestreamScene[] = (rawScenes || [])
            .filter((s) => s && typeof s === 'object')
            .map((s, sIdx) => {
                const rawSubs = Array.isArray(s.subtitles)
                    ? s.subtitles
                    : Array.isArray(s.lines)
                      ? s.lines
                      : Array.isArray(s.scripts)
                        ? s.scripts
                        : typeof s.script === 'string'
                          ? s.script.split(/\n+/).filter(Boolean)
                          : [];

                const subtitles: AffiliateLivestreamSubtitle[] = [];
                rawSubs.forEach((item: any, lIdx: number) => {
                    const text =
                        typeof item === 'string'
                            ? item.trim()
                            : String(item?.text || item?.content || item?.line || '').trim();
                    if (!text) return;
                    const explicitDur = typeof item === 'object' ? Number(item?.duration || item?.durationSec || 0) : 0;
                    const parts = this.splitTextToFitMaxSeconds(text, maxSec);
                    parts.forEach((partText, pIdx) => {
                        const est = this.estimateSpeechDurationSec(partText, maxSec);
                        const rawDur =
                            parts.length === 1 && explicitDur >= 1
                                ? Math.round(explicitDur)
                                : est;
                        subtitles.push({
                            id: `sub_${sIdx}_${lIdx}_${pIdx}_${Date.now().toString(36)}`,
                            text: partText,
                            duration: Math.max(minSec, Math.min(maxSec, rawDur)),
                        });
                    });
                });

                if (subtitles.length === 0) {
                    const fallbackText = String(s.text || s.summary || s.title || '').trim();
                    if (fallbackText) {
                        const parts = this.splitTextToFitMaxSeconds(fallbackText, maxSec);
                        parts.forEach((partText, pIdx) => {
                            subtitles.push({
                                id: `sub_${sIdx}_0_${pIdx}_${Date.now().toString(36)}`,
                                text: partText,
                                duration: this.estimateSpeechDurationSec(partText, maxSec),
                            });
                        });
                    }
                }

                const sceneSum = subtitles.reduce((acc, item) => acc + item.duration, 0);
                return {
                    id: `scene_${sIdx}_${Date.now().toString(36)}`,
                    title: String(s.title || s.name || `Phân cảnh ${sIdx + 1}`).trim(),
                    phase: String(s.phase || s.stage || `Phần ${sIdx + 1}`).trim(),
                    actionCue: String(s.actionCue || s.action_cue || s.direction || s.note || '').trim(),
                    durationSec: sceneSum || maxSec,
                    imageUrl: String(s.imageUrl || fallbackImg).trim() || fallbackImg,
                    subtitles,
                };
            })
            .filter((s) => s.subtitles.length > 0);

        if (cleaned.length === 0) {
            return [];
        }

        // Cân chỉnh thời lượng từng câu thoại theo tỷ lệ để bám sát thời lượng mục tiêu nhưng TUYỆT ĐỐI không vượt quá maxSec và mỗi cảnh tối đa 40s
        const currentTotal = cleaned.reduce(
            (sum, sc) => sum + sc.subtitles.reduce((t, sub) => t + (sub.duration || minSec), 0),
            0,
        );

        if (currentTotal > 0) {
            const ratio = targetTotalSec / currentTotal;
            for (const sc of cleaned) {
                let scSum = 0;
                for (const sub of sc.subtitles) {
                    const scaled =
                        ratio < 0.88 || ratio > 1.12
                            ? Math.round(sub.duration * ratio)
                            : sub.duration;
                    sub.duration = Math.max(minSec, Math.min(maxSec, scaled));
                    scSum += sub.duration;
                }
                sc.durationSec = scSum;
            }
        }

        // Bắt buộc tách cảnh nếu bất kỳ phân cảnh nào vượt quá 40s
        return this.enforceMaxSceneDuration(cleaned, this.MAX_SCENE_DURATION_SEC, maxSec);
    }

    private extractJsonObject(rawText: string): any | null {
        if (!rawText) return null;
        let cleaned = String(rawText).trim();
        // Bỏ markdown code fences nếu có
        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1]) {
            cleaned = fenceMatch[1].trim();
        }
        try {
            return JSON.parse(cleaned);
        } catch (_) {}

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const sub = cleaned.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(sub);
            } catch (_) {
                // Thử bỏ dấu phẩy thừa trước dấu đóng ngoặc
                try {
                    const relaxed = sub.replace(/,\s*([}\]])/g, '$1');
                    return JSON.parse(relaxed);
                } catch (_2) {}
            }
        }
        return null;
    }

    private buildFallbackScript(params: GenerateAffiliateScriptParams): GenerateAffiliateScriptResult {
        const { product, brief, durationMinutes, style } = params;
        const mins = Math.max(1, Math.min(180, Number(durationMinutes) || 5));
        const name = product.product_name || 'Sản phẩm ưu đãi Shopee';
        const priceStr = this.formatPriceVnd(product.price);
        const origStr = product.original_price && product.original_price > product.price
            ? this.formatPriceVnd(product.original_price)
            : '';
        const discountPct =
            product.original_price && product.original_price > product.price
                ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
                : 0;
        const shopText = product.shop_name ? `từ gian hàng ${product.shop_name}` : 'chính hãng trên Shopee';
        const soldText = product.sales > 0 ? `đã có hơn ${product.sales.toLocaleString('vi-VN')} lượt bán thực tế` : 'đang được rất nhiều khách săn đón';
        const briefText = String(brief || '').trim();
        const styleTone = params.style
            ? `theo đúng phong cách "${params.style}"`
            : 'tự nhiên, gần gũi và thuyết phục chốt đơn';

        const templates = [
            {
                phase: 'Mở đầu hút view',
                title: 'Chào khán giả và tung điểm nhấn sản phẩm',
                actionCue: `Giơ sát "${name}" trước camera, mỉm cười chào người xem mới vào phòng live, giữ nhịp nói ${styleTone}.`,
                subtitles: [
                    { text: `Xin chào cả nhà đang có mặt trong phiên livestream hôm nay! Ai vừa vào live nhớ thả tim và ở lại ít phút vì deal hôm nay cực kỳ đáng săn.` },
                    { text: `Trên tay mình ngay lúc này là ${name} ${shopText}, mức giá trong khung live hôm nay chỉ ${priceStr}${discountPct > 0 ? `, tiết kiệm tới ${discountPct}% so với giá gốc ${origStr}` : ''}.` },
                    { text: `Ai đang quan tâm sản phẩm này hãy bình luận số 1 bên dưới để mình ghim ngay vào giỏ hàng góc trái màn hình nhé.` },
                ],
            },
            {
                phase: 'Giới thiệu chi tiết',
                title: 'Bóc tách công dụng và yêu cầu trọng tâm của phiên live',
                actionCue: 'Xoay sản phẩm 360 độ, quay cận chất liệu, tem nhãn và phụ kiện đi kèm.',
                subtitles: [
                    { text: `Đầu tiên mình sẽ đi thẳng vào những điểm ăn tiền nhất của ${name} để mọi người dễ quyết định.` },
                    {
                        text: briefText
                            ? `Trong phiên live ${mins} phút này, mình tập trung chia sẻ kỹ nhất phần: ${briefText}.`
                            : `Thiết kế gọn gàng, hoàn thiện chắc chắn và tối ưu trải nghiệm sử dụng hằng ngày ngay từ lần đầu mở hộp.`,
                    },
                    { text: `Không phải tự nhiên mà mã này ${soldText}. Những khách đã mua đều đánh giá cao sự tiện lợi và mức giá rất dễ tiếp cận.` },
                ],
            },
            {
                phase: 'Demo thực tế & So sánh',
                title: 'Trải nghiệm trực tiếp và nổi bật giá trị đồng tiền',
                actionCue: 'Thực hiện thao tác dùng thử/kiểm tra thực tế trực tiếp trên sóng, chỉ vào màn hình giá.',
                subtitles: [
                    { text: `Mọi người nhìn kỹ chi tiết thực tế trên camera giúp mình nhé, quay trực tiếp không chỉnh sửa để cả nhà thấy đúng chất lượng khi nhận hàng.` },
                    { text: `So với việc mua ngoài với giá cao hơn thì hôm nay chốt trực tiếp qua giỏ hàng live chỉ ${priceStr}, lại có thêm mã miễn phí vận chuyển và voucher sàn áp chồng.` },
                    { text: `Nếu bạn mua cho bản thân hay mua làm quà đều rất hợp lý vì đóng gói chỉnh chu và kiểm tra hàng thoải mái.` },
                ],
            },
            {
                phase: 'Giải đáp thắc mắc Q&A',
                title: 'Xử lý băn khoăn phổ biến của người xem',
                actionCue: 'Đọc bình luận giả lập từ khán giả, giải đáp rõ về bảo hành, đổi trả và cách đặt hàng.',
                subtitles: [
                    { text: `Có bạn hỏi đặt hôm nay bao lâu nhận được hàng và có đảm bảo chính hãng không? Sản phẩm xuất trực tiếp ${shopText}, áp dụng chính sách đồng kiểm và đổi trả minh bạch trên Shopee.` },
                    { text: `Bạn nào còn băn khoăn về phân loại hoặc cách sử dụng cứ bình luận ngay trên màn hình, mình sẽ tư vấn chi tiết từng trường hợp.` },
                    { text: `Mẹo nhỏ cho mọi người là bấm vào giỏ hàng, chọn đúng phân loại cần mua và nhớ tick toàn bộ mã giảm giá freeship trước khi bấm đặt hàng nhé.` },
                ],
            },
            {
                phase: 'Chốt đơn & Kêu gọi hành động',
                title: 'Tạo độ khan hiếm và chốt đơn giỏ hàng Affiliate',
                actionCue: 'Chỉ tay rõ về phía nút Giỏ hàng góc trái màn hình, đếm ngược nhẹ để kích thích chốt đơn.',
                subtitles: [
                    { text: `Số lượng mã ưu đãi trong phiên live ${mins} phút hôm nay có giới hạn, hết giờ là giá sẽ tự động quay về mức ban đầu.` },
                    { text: `Cả nhà bấm ngay vào giỏ hàng góc trái màn hình, chọn ${name} ở mức giá ${priceStr} và hoàn tất đơn ngay bây giờ để giữ ưu đãi nhé.` },
                    { text: `Cảm ơn mọi người đã theo dõi phiên live! Ai đã chốt đơn thành công nhớ bình luận "Đã chốt" để mình cảm ơn trực tiếp trên sóng nhé.` },
                ],
            },
        ];

        const desiredCount = Math.min(this.calculateSceneCount(mins), 30);
        const expanded: any[] = [];
        for (let i = 0; i < desiredCount; i++) {
            const base = templates[i % templates.length];
            const cycle = Math.floor(i / templates.length) + 1;
            expanded.push({
                ...base,
                title: cycle > 1 ? `${base.title} (Đợt ${cycle})` : base.title,
                phase: cycle > 1 ? `${base.phase} #${cycle}` : base.phase,
                subtitles: base.subtitles.map((s) => ({ ...s })),
            });
        }

        const maxLineSec = Math.max(1, Math.min(30, Math.round(Number(params.maxSubtitleSeconds) || 15)));
        const scenes = this.normalizeScenesToTargetDuration(expanded, product, mins, maxLineSec);
        return {
            title: `Kịch bản Livestream ${mins} phút - ${name}`,
            hookSummary: `Tập trung giới thiệu ${name} với mức giá ${priceStr} và dẫn dắt người xem chốt đơn qua giỏ hàng Affiliate.`,
            scenes,
            generatedBy: 'template',
        };
    }

    async generateScript(params: GenerateAffiliateScriptParams): Promise<GenerateAffiliateScriptResult> {
        const mins = Math.max(1, Math.min(180, Number(params.durationMinutes) || 5));
        const maxSceneSec = this.MAX_SCENE_DURATION_SEC;
        const maxLineSec = Math.max(1, Math.min(30, Math.round(Number(params.maxSubtitleSeconds) || 15)));
        const minLineSec = maxLineSec <= 1 ? 1 : Math.min(3, maxLineSec);
        const maxWordsPerLine = Math.max(3, Math.floor(maxLineSec * 2.3));
        const totalRequiredScenes = this.calculateSceneCount(mins);
        // Giới hạn tối đa 24 phân cảnh độc lập trong 1 lượt gọi AI để tránh bị cắt cụt JSON với phiên live siêu dài (30p-180p)
        const sceneCount = Math.min(totalRequiredScenes, 24);
        const targetSec = mins * 60;
        const targetPerSceneSec = Math.min(maxSceneSec, Math.max(15, Math.round(targetSec / sceneCount)));
        const product = params.product;
        const priceStr = this.formatPriceVnd(product.price);
        const origStr = product.original_price && product.original_price > product.price
            ? this.formatPriceVnd(product.original_price)
            : 'Không có';
        const styleName = String(params.style || '').trim();
        const styleDesc =
            String(params.styleDescription || '').trim() ||
            LEGACY_STYLE_MAP[styleName] ||
            (styleName ? `Thể hiện đậm nét giọng điệu và văn phong "${styleName}"` : 'Tự nhiên, gần gũi, dễ nghe và thuyết phục chốt đơn');
        const maxLinesFitInScene = Math.max(1, Math.floor(maxSceneSec / Math.max(1, maxLineSec)));
        const idealLinesPerScene = Math.max(
            1,
            Math.min(maxLinesFitInScene, Math.round(targetPerSceneSec / Math.max(2, maxLineSec * 0.85))),
        );
        const minLinesPerScene = Math.max(1, idealLinesPerScene - 1);
        const linesPerScene =
            minLinesPerScene === idealLinesPerScene
                ? `${idealLinesPerScene}`
                : `${minLinesPerScene} đến ${idealLinesPerScene}`;
        const sampleLineCount = Math.min(2, maxLinesFitInScene);
        const sampleSceneDur = Math.min(maxSceneSec, maxLineSec * sampleLineCount);

        const attrsText = Array.isArray(product.attributes) && product.attributes.length > 0
            ? product.attributes
                  .slice(0, 15)
                  .map((a) => `  + ${a.name}: ${a.value}`)
                  .join('\n')
            : '';
        const varsText = Array.isArray(product.variations) && product.variations.length > 0
            ? product.variations
                  .map((v) => `  + ${v.name}: ${(v.options || []).join(', ')}`)
                  .join('\n')
            : '';
        const descText = String(product.description || '').trim().slice(0, 1800);

        const prompt = `Hãy xây dựng kịch bản livestream bán hàng tiếp thị liên kết (Shopee Affiliate) hoàn chỉnh bằng tiếng Việt tự nhiên, dễ đọc thành tiếng trực tiếp trên sóng.

THÔNG TIN SẢN PHẨM AFFILIATE:
- Tên sản phẩm: ${product.product_name}
- Gian hàng: ${product.shop_name || 'Shop chính hãng Shopee'}
- Giá bán hiện tại: ${priceStr}
- Giá gốc trước giảm: ${origStr}
- Lượt đã bán: ${product.sales || 0}
- Đánh giá: ${product.rating_star || 0}/5
- Mẫu CTA gợi ý (nếu phù hợp): ${params.ctaTemplate || 'Bấm vào giỏ hàng góc trái màn hình để chốt đơn ngay'}${
            varsText ? `\n- Phân loại hàng trên Shopee:\n${varsText}` : ''
        }${
            attrsText ? `\n- CHI TIẾT SẢN PHẨM THỰC TẾ:\n${attrsText}` : ''
        }${
            descText ? `\n- MÔ TẢ SẢN PHẨM TỪ SHOP:\n${descText}` : ''
        }

YÊU CẦU CÔNG VIỆC LIVESTREAM CỦA NGƯỜI DÙNG:
"${params.brief.trim() || 'Giới thiệu sản phẩm, nhấn mạnh công dụng nổi bật, tạo độ tin cậy và kêu gọi người xem bấm vào giỏ hàng đặt mua.'}"

THÔNG SỐ PHIÊN LIVESTREAM:
- Tổng thời lượng mục tiêu: ${mins} phút (${targetSec} giây)
- GIỚI HẠN THỜI LƯỢNG MỖI PHÂN CẢNH: TỔNG THỜI LƯỢNG CỦA MỖI CẢNH TUYỆT ĐỐI KHÔNG VƯỢT QUÁ ${maxSceneSec} GIÂY (durationSec <= ${maxSceneSec}, tổng trường "duration" của tất cả các câu thoại trong cùng 1 cảnh PHẢI <= ${maxSceneSec} giây).
- GIỚI HẠN THỜI LƯỢNG MỖI CÂU THOẠI: tối đa KHÔNG VƯỢT QUÁ ${maxLineSec} giây/câu (mỗi câu tối đa khoảng ${maxWordsPerLine} từ tiếng Việt để đọc vừa khít trong ${maxLineSec} giây).
- Số phân cảnh cần chia: đúng ${sceneCount} phân cảnh ngắn gọn, nối tiếp mạch lạc (mỗi cảnh <= ${maxSceneSec} giây; Mở đầu hút view -> Giới thiệu & Công dụng -> Demo/Trải nghiệm/So sánh -> Giải đáp thắc mắc Q&A -> Đẩy ưu đãi & Chốt đơn giỏ hàng; nếu nhiều cảnh thì tổ chức nhiều nhịp demo/tương tác/chốt đơn tự nhiên)
- Mỗi phân cảnh gồm khoảng ${linesPerScene} câu thoại tự nhiên, súc tích sao cho tổng thời lượng cảnh nằm khoảng ${Math.min(maxSceneSec, Math.max(10, targetPerSceneSec - 5))} đến tối đa ${maxSceneSec} giây.
- Phong cách dẫn live: ${styleName || 'Mặc định tự nhiên'}
- Yêu cầu thể hiện phong cách: ${styleDesc}

QUY TẮC BẮT BUỘC:
1. Lời thoại phải giống người bán hàng livestream thật tại Việt Nam (xưng "mình/em" - "cả nhà/mọi người/anh chị"), KHÔNG dùng gạch đầu dòng hay ký hiệu markdown trong lời thoại, KHÔNG nhắc đến tỷ lệ hoa hồng affiliate với khách xem live.
2. MỌI câu thoại trong "subtitles" PHẢI có trường "duration" nằm trong khoảng từ ${minLineSec} đến tối đa ${maxLineSec} giây (TUYỆT ĐỐI không câu nào vượt quá ${maxLineSec} giây), VÀ TỔNG "duration" của các câu thoại trong 1 phân cảnh TUYỆT ĐỐI KHÔNG VƯỢT QUÁ ${maxSceneSec} giây.
3. Mỗi phân cảnh có trường "actionCue" mô tả ngắn gọn hành động của người dẫn live (giơ sản phẩm, zoom cận cảnh, chỉ giỏ hàng, đọc comment...).
4. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ (không thêm giải thích ngoài JSON) theo cấu trúc sau:
{
  "title": "Tiêu đề ngắn gọn cho phiên livestream",
  "hookSummary": "Tóm tắt 1 câu chiến lược hút view và chốt đơn",
  "scenes": [
    {
      "phase": "Tên giai đoạn (VD: Mở đầu hút view)",
      "title": "Tiêu đề phân cảnh",
      "actionCue": "Hướng dẫn hành động/góc quay cho người live",
      "durationSec": ${sampleSceneDur},
      "subtitles": [
        { "text": "Lời thoại câu 1...", "duration": ${Math.min(maxLineSec, sampleSceneDur)} }${sampleLineCount >= 2 ? `,\n        { "text": "Lời thoại câu 2...", "duration": ${Math.min(maxLineSec, Math.max(1, sampleSceneDur - maxLineSec))} }` : ''}
      ]
    }
  ]
}`;

        try {
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-3.8-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction:
                        'Bạn là đạo diễn kịch bản livestream thương mại điện tử hàng đầu Việt Nam. Luôn trả về JSON thuần hợp lệ, không kèm văn bản giải thích ngoài JSON.',
                    responseMimeType: 'application/json',
                    skipTTS: true,
                    disableThinking: true,
                } as any,
            });

            const rawText =
                response?.text ||
                response?.candidates?.[0]?.content?.parts?.[0]?.text ||
                '';

            const parsed = this.extractJsonObject(rawText);
            if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
                const scenes = this.normalizeScenesToTargetDuration(parsed.scenes, product, mins, maxLineSec);
                if (scenes.length > 0) {
                    return {
                        title: String(parsed.title || `Livestream ${mins} phút - ${product.product_name}`).trim(),
                        hookSummary: String(parsed.hookSummary || '').trim(),
                        scenes,
                        generatedBy: 'ai',
                    };
                }
            }

            const fallback = this.buildFallbackScript(params);
            return {
                ...fallback,
                warning: 'AI trả về định dạng chưa chuẩn, hệ thống đã tự động dựng kịch bản mẫu theo đúng sản phẩm và thời lượng để bạn chỉnh sửa hoặc kiểm thử ngay.',
            };
        } catch (err: any) {
            const fallback = this.buildFallbackScript(params);
            return {
                ...fallback,
                warning: `Không kết nối được AI (${err?.message || 'chưa cấu hình khóa AI'}), hệ thống đã dựng sẵn kịch bản chuẩn theo sản phẩm để bạn chỉnh sửa và kiểm thử ngay.`,
            };
        }
    }

    async synthesizeVoicesForScenes(
        scenes: AffiliateLivestreamScene[],
        options: {
            voice: AffiliateLivestreamVoice;
            username: string;
            uuid: string;
            onProgress?: (done: number, total: number, currentText: string) => void;
            isCancelled?: () => boolean;
        },
    ): Promise<{ generatedCount: number; failedCount: number }> {
        if (!options.voice || options.voice === 'none') {
            return { generatedCount: 0, failedCount: 0 };
        }
        const electronApi = (window as any).electron;
        if (!electronApi?.invoke) {
            return { generatedCount: 0, failedCount: 0 };
        }

        const tasks: Array<{ sceneIdx: number; subIdx: number; sub: AffiliateLivestreamSubtitle }> = [];
        scenes.forEach((sc, sceneIdx) => {
            (sc.subtitles || []).forEach((sub, subIdx) => {
                // Nếu câu thoại đã import file video riêng thì ưu tiên phát âm thanh gốc của video, bỏ qua tạo TTS đè lên
                if (sub?.text?.trim() && !sub.videoUrl) {
                    tasks.push({ sceneIdx, subIdx, sub });
                }
            });
        });

        const total = tasks.length;
        let done = 0;
        let generatedCount = 0;
        let failedCount = 0;
        const subPath = `${options.username || 'admin'}/${options.uuid}`;

        for (const task of tasks) {
            if (options.isCancelled?.()) break;
            done += 1;
            options.onProgress?.(done, total, task.sub.text);

            const hash = `${options.voice}::${task.sub.text.trim()}`;
            if (task.sub.audioUrl && task.sub.voiceHash === hash) {
                generatedCount += 1;
                continue;
            }

            try {
                const filename = `s${String(task.sceneIdx + 1).padStart(2, '0')}_l${String(task.subIdx + 1).padStart(2, '0')}_${Date.now().toString(36)}`;
                const res = await electronApi.invoke('tts-generate', {
                    text: task.sub.text.trim(),
                    voice: options.voice,
                    rate: 1.05,
                    pitch: 0,
                    filename,
                    username: subPath,
                });

                if (res && res.success !== false && (res.url || res.filePath)) {
                    const rawPath = String(res.url || res.filePath);
                    task.sub.audioUrl =
                        rawPath.startsWith('http://') ||
                        rawPath.startsWith('https://') ||
                        rawPath.startsWith('media://')
                            ? rawPath
                            : this.toElectronMediaUrl(rawPath);
                    task.sub.voiceHash = hash;

                    if (electronApi.getMediaDuration) {
                        try {
                            const durRes = await electronApi.getMediaDuration(res.filePath || rawPath);
                            const durNum = typeof durRes === 'number' ? durRes : Number(durRes?.duration || 0);
                            if (durNum > 0.5 && isFinite(durNum)) {
                                task.sub.duration = Math.max(1, Math.min(this.MAX_SCENE_DURATION_SEC, Math.round(durNum)));
                            }
                        } catch (_) {}
                    }
                    generatedCount += 1;
                } else {
                    failedCount += 1;
                }
            } catch (_) {
                failedCount += 1;
            }
        }

        // Cập nhật lại tổng thời lượng và tự tách phân cảnh tại chỗ nếu audio TTS thực tế khiến cảnh vượt quá 40s
        const normalizedScenes = this.enforceMaxSceneDuration(scenes, this.MAX_SCENE_DURATION_SEC, this.MAX_SCENE_DURATION_SEC);
        scenes.splice(0, scenes.length, ...normalizedScenes);

        return { generatedCount, failedCount };
    }

    /**
     * Nén và chuẩn hóa tệp ảnh người dùng đính kèm thành Data URL gọn nhẹ (tối đa 1280px)
     */
    async readAndCompressImageFile(file: File, role: AffiliateReferenceRole = 'actor'): Promise<AffiliateReferenceImage> {
        const rawDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Không đọc được tệp ảnh đính kèm.'));
            reader.readAsDataURL(file);
        });

        let finalDataUrl = rawDataUrl;
        let finalMime = file.type || 'image/jpeg';

        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error('Ảnh không hợp lệ.'));
                el.src = rawDataUrl;
            });

            const maxDim = 1280;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                finalDataUrl = canvas.toDataURL('image/jpeg', 0.88);
                finalMime = 'image/jpeg';
            }
        } catch (_) {
            // Giữ nguyên rawDataUrl nếu canvas không xử lý được
        }

        return {
            id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name || 'reference.jpg',
            dataUrl: finalDataUrl,
            mimeType: finalMime,
            role,
        };
    }

    toElectronMediaUrl(filePath: string): string {
        const raw = String(filePath || '').trim();
        if (!raw) return '';
        if (
            raw.startsWith('http://') ||
            raw.startsWith('https://') ||
            raw.startsWith('data:') ||
            raw.startsWith('media://')
        ) {
            return raw;
        }
        const normalized = raw.replace(/\\/g, '/').replace(/^file:\/+/i, '');
        if (/^[a-zA-Z]:\//.test(normalized)) {
            return `media:///${normalized}`;
        }
        return `media:///${normalized.replace(/^\/+/, '')}`;
    }

    private async resolveImageUrlToBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
        if (!url) return null;

        if (url.startsWith('data:image/')) {
            const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (match) {
                return { mimeType: match[1], base64: match[2] };
            }
            return null;
        }

        const electron = (window as any).electron;
        const electronAPI = (window as any).electronAPI;
        if (
            (electron || electronAPI) &&
            (url.startsWith('file://') || url.startsWith('media://') || url.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(url))
        ) {
            try {
                let cleanPath = url.replace(/^(file|media):\/+/i, '');
                try {
                    cleanPath = decodeURIComponent(cleanPath);
                } catch (_) {}
                if (!/^[a-zA-Z]:[\\/]/.test(cleanPath) && !cleanPath.startsWith('/')) {
                    cleanPath = '/' + cleanPath;
                }
                const res = electronAPI?.readFileBase64
                    ? await electronAPI.readFileBase64(cleanPath)
                    : electron?.readFileBase64
                      ? await electron.readFileBase64(cleanPath)
                      : electron?.invoke
                        ? await electron.invoke('read-file-base64', { filePath: cleanPath })
                        : null;
                if (res?.success && res.base64) {
                    const ext = cleanPath.toLowerCase().endsWith('.png')
                        ? 'image/png'
                        : cleanPath.toLowerCase().endsWith('.webp')
                          ? 'image/webp'
                          : 'image/jpeg';
                    return { base64: res.base64, mimeType: ext };
                }
            } catch (_) {}
        }

        if (/^https?:\/\//i.test(url)) {
            try {
                const resp = await fetch(url);
                if (resp.ok) {
                    const blob = await resp.blob();
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(String(reader.result || ''));
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
                    if (m) {
                        return { mimeType: m[1], base64: m[2] };
                    }
                }
            } catch (_) {}

            // Fallback qua Image + Canvas nếu fetch bị chặn
            try {
                const base64 = await new Promise<string | null>((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        try {
                            const maxDim = 1024;
                            let w = img.naturalWidth || img.width;
                            let h = img.naturalHeight || img.height;
                            if (w > maxDim || h > maxDim) {
                                const r = Math.min(maxDim / w, maxDim / h);
                                w = Math.round(w * r);
                                h = Math.round(h * r);
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = Math.max(1, w);
                            canvas.height = Math.max(1, h);
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return resolve(null);
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            const out = canvas.toDataURL('image/jpeg', 0.9);
                            resolve(out.split(',')[1] || null);
                        } catch (_c) {
                            resolve(null);
                        }
                    };
                    img.onerror = () => resolve(null);
                    img.src = url;
                });
                if (base64) {
                    return { base64, mimeType: 'image/jpeg' };
                }
            } catch (_) {}
        }

        return null;
    }

    private isWearableApparelProduct(productName: string): boolean {
        const normalized = ` ${String(productName || '').toLowerCase()} `;
        return /(?:^|[\s\[\(\-,/])(áo\s+(?:thun|phông|sơ\s*mi|kiểu|khoác|len|nỉ|hoodie|polo|croptop|crop\s*top|ba\s*lỗ|hai\s*dây|2\s*dây|dài|ngắn|tay|ôm|body|giữ\s*nhiệt|cardigan|blazer|vest|gile|tập|thể\s*thao|chống\s*nắng|nữ|nam)|váy|đầm|chân\s*váy|quần\s+(?:jean|jeans|tây|âu|kaki|short|sooc|đùi|dài|ống|jogger|legging|thể\s*thao|nữ|nam|suông|baggy)|set\s+(?:đồ|bộ|áo|váy)|bộ\s+(?:đồ|mặc\s*nhà|ngủ|thể\s*thao)|đồ\s+(?:bộ|ngủ|tập)|pijama|pyjama|hoodie|cardigan|blazer|jumpsuit|t-shirt|tee\b|dress\b|jacket\b)/i.test(
            normalized,
        );
    }

    /**
     * Tạo ảnh khung nền livestream chuẩn tỉ lệ (9:16 hoặc 16:9) kết hợp:
     * - Diễn viên / MC (từ ảnh tham chiếu đính kèm nếu có)
     * - Sản phẩm affiliate thật (từ ảnh sản phẩm gốc + ảnh tham chiếu sản phẩm)
     * - Bối cảnh phòng livestream thương mại điện tử chuyên nghiệp, sẵn sàng dùng làm video tiếp theo
     */
    async generateLivestreamBackdropImage(
        params: GenerateBackdropImageParams,
    ): Promise<GenerateBackdropImageResult> {
        const requestParts: any[] = [];
        const refDescriptions: string[] = [];
        let refIndex = 0;
        const isWearable = this.isWearableApparelProduct(params.product?.product_name || '');

        // 1. Luôn tự động gắn ảnh sản phẩm Affiliate thật trước để AI giữ đúng ngoại hình sản phẩm
        const primaryProductImgUrl = params.selectedProductImageUrl || params.product?.image_url;
        if (primaryProductImgUrl) {
            const prodImg = await this.resolveImageUrlToBase64(primaryProductImgUrl);
            if (prodImg?.base64) {
                refIndex += 1;
                requestParts.push({
                    inlineData: {
                        data: prodImg.base64,
                        mimeType: prodImg.mimeType || 'image/jpeg',
                    },
                });
                refDescriptions.push(
                    `- Reference Image #${refIndex}: THE REAL SHOPEE AFFILIATE PRODUCT ("${params.product.product_name}"). CRITICAL 1:1 PRODUCT FIDELITY SOURCE: Inspect the MAIN HERO PRODUCT in this image (ignore surrounding Shopee promotional text/badges/size icons) and replicate its EXACT hero colorway, exact silhouette/cut, exact neckline/collar/cap/lid/hardware/trim details, exact fabric/surface texture, and exact proportions faithfully. DO NOT substitute a different colorway, DO NOT redesign the shape/collar/fit, and DO NOT replace it with a generic lookalike.`,
                );
            }
        }

        // 2. Gắn toàn bộ ảnh tham chiếu người dùng đính kèm (Diễn viên / Bối cảnh / Sản phẩm phụ)
        const userRefs = Array.isArray(params.referenceImages) ? params.referenceImages : [];
        let hasActorRef = false;
        let hasBgRef = false;

        for (const ref of userRefs) {
            const resolved = await this.resolveImageUrlToBase64(ref.dataUrl);
            if (!resolved?.base64) continue;
            refIndex += 1;
            requestParts.push({
                inlineData: {
                    data: resolved.base64,
                    mimeType: resolved.mimeType || ref.mimeType || 'image/jpeg',
                },
            });

            if (ref.role === 'actor') {
                hasActorRef = true;
                refDescriptions.push(
                    `- Reference Image #${refIndex}: THE LIVESTREAM HOST / ACTOR (${ref.name}). Preserve this exact person's facial identity, hairstyle, skin tone, and warm expression as the main presenter${isWearable ? ' (REPLACE their original outfit from this reference with the exact featured garment from Reference Image #1, and REMOVE any green screen background)' : ' (remove any green screen background and place them naturally in the livestream studio)'}.`,
                );
            } else if (ref.role === 'background') {
                hasBgRef = true;
                refDescriptions.push(
                    `- Reference Image #${refIndex}: THE LIVESTREAM STUDIO / BACKGROUND (${ref.name}). Match this studio atmosphere, lighting, and decor style.`,
                );
            } else {
                refDescriptions.push(
                    `- Reference Image #${refIndex}: ADDITIONAL REAL PRODUCT ANGLE / DETAIL (${ref.name}). Use together with Reference Image #1 to preserve exact 1:1 product appearance.`,
                );
            }
        }

        const isVertical = params.aspectRatio === '9:16';
        const aspectText = isVertical
            ? 'strict vertical 9:16 portrait composition (1080x1920, Shopee Live / TikTok Live mobile broadcast frame)'
            : 'strict horizontal 16:9 widescreen composition (1920x1080, YouTube / Facebook Live desktop studio frame)';

        const defaultActorDesc =
            params.voice === 'vi-VN-NamMinhNeural'
                ? 'a charismatic, well-groomed young Vietnamese male livestream host'
                : 'a charming, radiant young Vietnamese female livestream host';

        const actorInstruction = isWearable
            ? hasActorRef
                ? 'The main host MUST have the exact face, hairstyle, and identity from the attached actor reference image(s), smiling warmly toward the camera, and MUST BE WEARING THE EXACT PRIMARY HERO GARMENT from Reference Image #1 (exact hero color, exact fit/silhouette, exact neckline/collar placket construction, exact sleeve length, exact fabric texture — replacing the actor reference\'s original clothes completely). Do NOT keep the actor\'s old outfit and do NOT hold a stiff boxy cutout shirt in front of them; if Reference Image #1 displays secondary color variants, those extra colors may be neatly folded on the presenter desk or hung on a tidy clothing rack nearby.'
                : `Feature ${defaultActorDesc}, smiling warmly toward the camera while WEARING THE EXACT PRIMARY HERO GARMENT from Reference Image #1 (exact hero color, exact fit/silhouette, exact neckline/collar construction, exact sleeve length, exact fabric texture). Any extra color variants shown in Reference Image #1 may be neatly folded on the desk or hanging on a garment rack beside them.`
            : hasActorRef
              ? 'The main host MUST be the exact person shown in the attached actor reference image(s), naturally smiling toward the camera while holding or presenting the EXACT primary hero product from Reference Image #1 clearly near chest/desk height at realistic real-world scale.'
              : `Feature ${defaultActorDesc} in neat modern studio attire, smiling warmly toward the camera while naturally holding or presenting the EXACT primary hero product from Reference Image #1 in hand or on a clean presenter table at realistic real-world scale.`;

        const productFidelityInstruction = isWearable
            ? `MANDATORY 1:1 GARMENT FIDELITY FOR "${params.product?.product_name || 'the garment'}": Copy the MAIN HERO garment from Reference Image #1 (the primary garment worn by the model or largest featured garment in the Shopee listing) onto the host with exact accuracy — identical primary color, identical neckline/collar placket shape and trim width, identical sleeve length, identical slim/tailored fit, and identical ribbed/woven fabric texture. NEVER swap the hero color to a random color, NEVER widen or alter the silhouette into a loose boxy tee, and NEVER change the neckline cut.`
            : `MANDATORY 1:1 PRODUCT FIDELITY FOR "${params.product?.product_name || 'the product'}": Copy the MAIN HERO physical product from Reference Image #1 with exact accuracy — identical color, identical shape and dimensions, identical lid/cap/handle/accessories/buttons, identical surface material/texture, and realistic physical scale in hands or on the desk. Strip only floating Shopee promotional banners/icons around the product, NEVER redesign or alter the product itself.`;

        const bgInstruction = hasBgRef
            ? 'Match the studio background, color palette, and lighting mood from the attached background reference image.'
            : 'Modern bright Vietnamese e-commerce livestream studio background: clean soft-focus lifestyle room, warm LED accent lights, tidy display shelves with subtle depth-of-field bokeh, flattering studio ring-light on the host and crisp highlights on the product.';

        const styleSummary = [params.style, params.styleDescription].filter(Boolean).join(' - ').slice(0, 320);
        const briefSummary = String(params.brief || '').trim().slice(0, 400);

        const promptText = `Create ONE ultra-clean, photorealistic commercial e-commerce livestream studio master keyframe image ready for AI video production.

MANDATORY COMPOSITION & ASPECT RATIO:
- Aspect Ratio: ${aspectText}.
- Framing: Medium-close livestream broadcast shot from waist/hip up, host centered slightly above midline with a neat presenter desk in the foreground, leaving clean breathing space near the bottom for live captions and product pin overlays.

ATTACHED REFERENCE IMAGES (PASS ALL REFERENCE IMAGE FILES DIRECTLY TO THE IMAGE GENERATOR):
${refDescriptions.length > 0 ? refDescriptions.join('\n') : `- Product to showcase: "${params.product?.product_name || 'Affiliate product'}"`}

SUBJECTS & SCENE REQUIREMENTS:
1. HOST / ACTOR: ${actorInstruction}
2. FEATURED PRODUCT (HIGHEST PRIORITY — MUST MATCH SHOPEE PRODUCT 1:1): ${productFidelityInstruction}
3. STUDIO BACKGROUND: ${bgInstruction}
4. MOOD & PRESENTATION STYLE: ${styleSummary || 'Energetic, trustworthy Vietnamese live-commerce broadcast'}.
${briefSummary ? `5. LIVESTREAM BRIEF CONTEXT: ${briefSummary}` : ''}

STRICT QUALITY & VERIFICATION RULES:
- Photorealistic 4K DSLR broadcast camera look, natural skin tones, authentic hands, balanced studio key + fill lighting.
- ABSOLUTELY NO floating overlaid text, NO Shopee promo banners, NO price tags, NO size charts, NO watermarks, NO live chat UI icons, NO borders, NO split-screen collages (keep only authentic details physically belonging on the product itself).
- CRITICAL SELF-CHECK: After generating the image, inspect the generated image against Reference Image #1 (the Shopee product). Verify that the product's hero color, exact cut/shape, collar/neckline/lid/accessories, and proportions faithfully match Reference Image #1; if they noticeably differ, refine and regenerate once before returning the final file path.`;

        requestParts.unshift({ text: promptText });

        const response: any = await this._genaiService.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [{ role: 'user', parts: requestParts }],
            config: {
                aspectRatio: params.aspectRatio,
                responseModalities: ['TEXT', 'IMAGE'],
                skipTTS: true,
                imageConfig: {
                    aspectRatio: params.aspectRatio,
                    imageSize: '2K',
                },
            } as any,
        });

        let base64Data = '';
        let mimeType = 'image/png';
        const parts = response?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
            if (p?.inlineData?.data) {
                base64Data = p.inlineData.data;
                mimeType = p.inlineData.mimeType || 'image/png';
                break;
            }
            if ((p as any)?.image?.data) {
                base64Data = (p as any).image.data;
                mimeType = (p as any).image.mimeType || 'image/png';
                break;
            }
            if (typeof (p as any)?.imageUrl === 'string' && (p as any).imageUrl.startsWith('data:image/')) {
                const m = (p as any).imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
                if (m) {
                    mimeType = m[1];
                    base64Data = m[2];
                    break;
                }
            }
        }
        if (!base64Data && response?.generatedImages?.[0]?.image?.imageBytes) {
            base64Data = response.generatedImages[0].image.imageBytes;
            mimeType = response.generatedImages[0].image.mimeType || 'image/png';
        }
        // Dự phòng: trích xuất đường dẫn ảnh cục bộ nếu AI Agent trả link file trong phần text
        if (!base64Data) {
            const combinedText = [
                response?.text || '',
                ...parts.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text),
            ].join('\n');
            const pathMatch = combinedText.match(/(?:file:\/\/\/?|\/|[a-zA-Z]:[\\/])[^\s"'`<>()\[\]]+\.(?:png|jpe?g|webp)/i);
            if (pathMatch && pathMatch[0]) {
                const resolved = await this.resolveImageUrlToBase64(pathMatch[0]);
                if (resolved?.base64) {
                    base64Data = resolved.base64;
                    mimeType = resolved.mimeType || 'image/jpeg';
                }
            }
        }

        if (!base64Data) {
            throw new Error('AI không trả về dữ liệu hình ảnh cho khung nền livestream.');
        }

        const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `livestream_backdrop_${params.aspectRatio.replace(':', 'x')}_${Date.now()}.${ext}`;
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        const electron = (window as any).electron;

        if (electron?.saveBase64) {
            try {
                const saveRes = await electron.saveBase64({
                    base64: base64Data,
                    fileName,
                    customDataSubDir: `tts/${params.username || 'admin'}/${params.uuid}`,
                });
                if (saveRes?.success && saveRes.path) {
                    return {
                        imageUrl: this.toElectronMediaUrl(saveRes.path),
                        localPath: saveRes.path,
                        dataUrl,
                    };
                }
            } catch (saveErr) {
                console.warn('[AffiliateLivestream] Lưu ảnh khung nền xuống máy thất bại, thử upload CDN:', saveErr);
            }
        }

        try {
            const cdnUrl = await this._genaiService.uploadBase64ToCdn(dataUrl, fileName, 'scenes');
            if (cdnUrl) {
                return { imageUrl: cdnUrl, dataUrl };
            }
        } catch (_) {}

        return { imageUrl: dataUrl, dataUrl };
    }

    async prepareLivestreamStudioSession(
        draft: AffiliateLivestreamDraft,
        options: {
            username: string;
            previewMode: boolean;
            returnUrl: string;
        },
    ): Promise<string> {
        const uuid = draft.uuid || this.getLivestreamUuid(draft.product);
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${uuid}`;
        const totalDurationSec = this.computeTotalDurationSec(draft.scenes);
        const preferredImg = draft.backdropImageUrl || draft.product?.image_url || './assets/images/logo/favicon.svg';

        const projectPayload = {
            uuid,
            title: draft.title || draft.product?.product_name || 'Livestream Affiliate',
            username: options.username || 'admin',
            sourceType: 'affiliate_livestream',
            isPreviewMode: options.previewMode,
            returnUrl: options.returnUrl,
            offerId: draft.offerId,
            durationMinutes: draft.durationMinutes,
            targetDurationSec: Math.max(60, Math.round((draft.durationMinutes || 5) * 60)),
            estimatedDurationSec: totalDurationSec,
            livestreamBrief: draft.brief,
            style: draft.style,
            voice: draft.voice,
            aspectRatio: draft.aspectRatio,
            hookSummary: draft.hookSummary,
            backdropImageUrl: draft.backdropImageUrl || '',
            backdropLocalPath: draft.backdropLocalPath || '',
            product: {
                _id: draft.product._id || draft.product.id,
                id: draft.product.id || draft.product._id,
                item_id: draft.product.item_id,
                shop_id: draft.product.shop_id,
                product_name: draft.product.product_name,
                shop_name: draft.product.shop_name || '',
                price: draft.product.price || 0,
                original_price: draft.product.original_price || 0,
                commission_rate: draft.product.commission_rate || 0,
                commission_amount: draft.product.commission_amount || 0,
                sales: draft.product.sales || 0,
                image_url: draft.product.image_url || '',
                product_link: draft.product.product_link || '',
                offer_link: draft.product.offer_link || '',
                short_link: draft.product.short_link || '',
            },
            scenes: draft.scenes.map((sc) => ({
                id: sc.id,
                title: sc.title,
                phase: sc.phase,
                actionCue: sc.actionCue,
                durationSec: sc.durationSec,
                imageUrl: draft.backdropImageUrl || sc.imageUrl || preferredImg,
                subtitles: (sc.subtitles || []).map((sub) => ({
                    id: sub.id,
                    text: sub.text,
                    duration: Number(sub.duration) || 5,
                    audioUrl: sub.videoUrl ? '' : (sub.audioUrl || ''),
                    videoUrl: sub.videoUrl || '',
                    videoLocalPath: sub.videoLocalPath || '',
                    videoName: sub.videoName || '',
                })),
            })),
            updatedAt: new Date().toISOString(),
        };

        await this.saveDraft({ ...draft, uuid });
        await this._multiAccountService.setItem(storageKey, projectPayload);
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(projectPayload));
        } catch (_) {}

        return uuid;
    }
}
