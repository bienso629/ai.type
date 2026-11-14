import { Injectable, computed, signal } from '@angular/core';
import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';
import { getModelverseConfig, getTextModelConfig, TextModelConfig } from './modelverse.config';
import { ToastrService } from 'ngx-toastr';
import { PdfTextService } from './_services/pdf-text.service';

type Scope = string | number;

// Domain máy chủ AI Agent Plugin
const AI_AGENT_BASE_URL = 'https://agent.type.vn';

import { getSettings } from './_services/user-settings.service';

@Injectable({ providedIn: 'root' })
export class GenaiService {
    // --- State management ---
    private _active = signal(0);
    readonly isLoading = computed(() => this._active() > 0);
    private _scopes = signal<Record<string, number>>({});

    private _aiInstance?: GoogleGenAI;
    private _currentKey: string = '';

    private _umodelverseUrl: string = '';
    private _umodelverseKey: string = '';
    private _umodelverseChatModel: string = '';
    private _umodelverseImageModel: string = '';
    public _umodelverseVideoModel: string = '';
    // Model van ban nguoi dung cau hinh rieng cho Gemini AI Studio (mien phi)
    private _geminiTextModel: string = '';
    private _enableUmodelverse: boolean = false;
    private _lastUmodelverseVideoUrl: string = '';

    private static readonly VOLCE_ASSET_CACHE_KEY = 'ai_type_volce_asset_cache_v1';
    private static _volceAssetGroupCache: Record<string, string> = {};
    private static _volceAssetUrlCache: Record<string, string> | null = null;
    private static _volceGroupInFlight = new Map<string, Promise<string>>();
    private static _volceAssetInFlight = new Map<string, Promise<string>>();
    private static _cdnUploadCache = new Map<string, string>();
    private static _cdnUploadInFlight = new Map<string, Promise<string | null>>();
    private static _lastCdnUploadStartMs = 0;
    private static _modelsListCache = new Map<string, { ids: string[]; expiresAt: number }>();
    private static _modelsListInFlight = new Map<string, Promise<string[]>>();
    private static _lastVideoTaskSubmitMs = 0;

    private localAgentAbortController?: AbortController;

    public cancelLocalAgent() {
        if (this.localAgentAbortController) {
            this.localAgentAbortController.abort();
            this.localAgentAbortController = undefined;
        }
        
        // Gửi lệnh qua IPC để khởi chạy lại process AI Agent ở Electron (port 54321) để hủy mọi tiến trình Python/C++ đang chạy ngầm
        if ((window as any).electron && (window as any).electron.invoke) {
            (window as any).electron.invoke('toggle-ai-agent', false).then(() => {
                // Đợi 1.2 giây để hệ điều hành giải phóng hoàn toàn cổng 54321 rồi mới khởi chạy lại
                setTimeout(() => {
                    (window as any).electron.invoke('toggle-ai-agent', true);
                }, 1200);
            });
        }
    }

    public aiAgentCustomInstructions: string | null = null;
    public updateAiAgentContext(instructions: string | null) {
        this.aiAgentCustomInstructions = instructions;
    }

    constructor(
        private toastr: ToastrService,
        private _pdfTextService: PdfTextService
    ) { }

    /**
     * Upload ảnh base64 lên CDN (cdn1.type.vn) và trả về URL HTTPS.
     * CDN server chạy ở localhost:3333, endpoint POST /upload, field name 'files'.
     * Dùng cho Kling API vì UModelverse proxy không hỗ trợ ConvertImageRequest.
     */
    public async uploadBase64ToCdn(base64Data: string, filename?: string, folder?: string): Promise<string | null> {
        let mimeType = 'image/jpeg';
        let rawBase64 = base64Data || '';
        if (rawBase64.startsWith('data:')) {
            const match = rawBase64.match(/^data:([a-zA-Z0-9]+\/[^;]+);base64,/);
            if (match) mimeType = match[1];
            rawBase64 = rawBase64.split(',')[1] || '';
        }
        if (!rawBase64) return null;

        const cacheKey = `${folder || ''}|${mimeType}|${rawBase64.length}|${GenaiService.computeVolceSourceHash(rawBase64)}`;
        const cachedCdnUrl = GenaiService._cdnUploadCache.get(cacheKey);
        if (cachedCdnUrl) {
            return cachedCdnUrl;
        }
        const inFlightUpload = GenaiService._cdnUploadInFlight.get(cacheKey);
        if (inFlightUpload) {
            return inFlightUpload;
        }

        const uploadPromise = (async (): Promise<string | null> => {
            try {
                const dataUri = `data:${mimeType};base64,${rawBase64}`;
                const fileResp = await fetch(dataUri);
                const blob = await fileResp.blob();

                // Tạo File + FormData
                let ext = 'jpg';
                if (mimeType.includes('png')) ext = 'png';
                else if (mimeType.includes('mp4')) ext = 'mp4';
                else if (mimeType.includes('webm')) ext = 'webm';
                else if (mimeType.includes('quicktime')) ext = 'mov';

                // Giãn tối thiểu 35ms giữa hai lượt upload song song để tránh trùng timestamp Date.now() phía CDN server
                const nowMs = Date.now();
                const scheduledMs = Math.max(nowMs, GenaiService._lastCdnUploadStartMs + 35);
                GenaiService._lastCdnUploadStartMs = scheduledMs;
                const delayMs = scheduledMs - nowMs;
                if (delayMs > 0) {
                    await new Promise((r) => setTimeout(r, delayMs));
                }

                const randSuffix = Math.random().toString(36).slice(2, 7);
                const fname = filename || `kling_upload_${Date.now()}_${randSuffix}.${ext}`;
                const file = new File([blob], fname, { type: mimeType });

                const formData = new FormData();
                formData.append('files', file); // CDN server dùng multer.array('files')
                if (folder) {
                    formData.append('folder', folder);
                }

                // Upload lên CDN server (cdn1.type.vn)
                const uploadUrl = 'https://cdn1.type.vn/upload';
                console.log(`[CDN Upload] Uploading ${fname} (${Math.round(rawBase64.length / 1024)}KB) to ${uploadUrl}...`);

                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: {
                        'x-api-key': 'type-vn-secret-key-2026-yenai-dep-trai'
                    },
                    body: formData
                });

                if (!response.ok) {
                    console.error(`[CDN Upload] HTTP ${response.status}: ${await response.text()}`);
                    return null;
                }

                const result = await response.json();

                let resolvedUrl: string | null = null;
                // Server trả về { url: "origin/public/filename", filename: "timestamp.ext" }
                if (result?.filename) {
                    resolvedUrl = `https://cdn1.type.vn/public/${result.filename}`;
                    console.log(`[CDN Upload] Thành công! URL: ${resolvedUrl}`);
                } else if (result?.url) {
                    // Fallback: nếu server trả url trực tiếp, thay origin bằng domain CDN thật
                    resolvedUrl = result.url.replace(/^https?:\/\/[^\/]+/, 'https://cdn1.type.vn');
                    console.log(`[CDN Upload] Thành công (fallback)! URL: ${resolvedUrl}`);
                } else {
                    console.warn('[CDN Upload] Không tìm thấy filename/url trong response:', result);
                }

                if (resolvedUrl) {
                    if (GenaiService._cdnUploadCache.size >= 250) {
                        const oldestKey = GenaiService._cdnUploadCache.keys().next().value;
                        if (oldestKey) GenaiService._cdnUploadCache.delete(oldestKey);
                    }
                    GenaiService._cdnUploadCache.set(cacheKey, resolvedUrl);
                }
                return resolvedUrl;
            } catch (err) {
                console.error('[CDN Upload] Lỗi upload:', err);
                return null;
            }
        })();

        GenaiService._cdnUploadInFlight.set(cacheKey, uploadPromise);
        try {
            return await uploadPromise;
        } finally {
            GenaiService._cdnUploadInFlight.delete(cacheKey);
        }
    }

    private static getVolceAssetUrlCache(): Record<string, string> {
        if (GenaiService._volceAssetUrlCache) {
            return GenaiService._volceAssetUrlCache;
        }
        GenaiService._volceAssetUrlCache = {};
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(GenaiService.VOLCE_ASSET_CACHE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        GenaiService._volceAssetUrlCache = parsed;
                    }
                }
            }
        } catch {
            GenaiService._volceAssetUrlCache = {};
        }
        return GenaiService._volceAssetUrlCache!;
    }

    private static saveVolceAssetUrlCache(): void {
        try {
            if (typeof localStorage !== 'undefined' && GenaiService._volceAssetUrlCache) {
                const entries = Object.entries(GenaiService._volceAssetUrlCache);
                const trimmed = entries.length > 300 ? Object.fromEntries(entries.slice(entries.length - 300)) : GenaiService._volceAssetUrlCache;
                GenaiService._volceAssetUrlCache = trimmed;
                localStorage.setItem(GenaiService.VOLCE_ASSET_CACHE_KEY, JSON.stringify(trimmed));
            }
        } catch {
            // Ignore storage quota errors
        }
    }

    private static computeKeyFingerprint(apiKey: string): string {
        const s = String(apiKey || 'anon').trim();
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    private static computeVolceSourceHash(source: string): string {
        const s = String(source || '');
        const len = s.length;
        let h1 = 2166136261 ^ len;
        let h2 = 16777619 ^ (len >>> 1);
        const step = Math.max(1, Math.floor(len / 512));
        for (let i = 0; i < len; i += step) {
            const c = s.charCodeAt(i);
            h1 ^= c;
            h1 = Math.imul(h1, 16777619);
            h2 ^= (c + (i & 255));
            h2 = Math.imul(h2, 2246822507);
        }
        const tailStart = Math.max(0, len - 128);
        for (let i = tailStart; i < len; i++) {
            const c = s.charCodeAt(i);
            h1 ^= c;
            h1 = Math.imul(h1, 16777619);
            h2 ^= c;
            h2 = Math.imul(h2, 3266489909);
        }
        return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
    }

    /**
     * Đảm bảo ảnh thỏa mãn ràng buộc Volcengine Asset Library (docs/ByteDance:
     * width & height thuộc khoảng mở (300, 6000) px, tỷ lệ width/height thuộc (0.4, 2.5), URL công khai HTTPS).
     */
    private async ensureVolceCompatibleImageUrl(imageSource: string, hash: string): Promise<string> {
        if (!imageSource || imageSource.startsWith('asset://')) {
            return imageSource;
        }

        let loadableDataUri = '';
        if (imageSource.startsWith('data:')) {
            loadableDataUri = imageSource;
        } else if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
            try {
                const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
                const resp = await fetch(imageSource, ctrl ? { signal: ctrl.signal } : undefined);
                if (timer) clearTimeout(timer);
                if (resp.ok) {
                    const blob = await resp.blob();
                    loadableDataUri = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                        reader.onerror = () => resolve('');
                        reader.readAsDataURL(blob);
                    });
                }
            } catch {
                // Nếu CORS chặn fetch, dùng trực tiếp URL HTTPS gốc bên dưới
            }
        } else {
            loadableDataUri = `data:image/png;base64,${imageSource}`;
        }

        if (loadableDataUri && typeof document !== 'undefined' && typeof Image !== 'undefined') {
            const imgEl = await new Promise<HTMLImageElement | null>((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = loadableDataUri;
            });

            if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                const origW = imgEl.naturalWidth;
                const origH = imgEl.naturalHeight;
                const origRatio = origW / origH;
                const needsNormalize =
                    origW < 320 ||
                    origH < 320 ||
                    origW > 4096 ||
                    origH > 4096 ||
                    origRatio <= 0.42 ||
                    origRatio >= 2.45;

                if (!needsNormalize) {
                    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
                        return imageSource;
                    }
                    const uploaded = await this.uploadBase64ToCdn(loadableDataUri, `volce_img_${hash}.png`);
                    if (!uploaded) {
                        throw new Error('Không thể tải ảnh lên CDN để đăng ký Volcengine Asset.');
                    }
                    return uploaded;
                }

                let drawW = origW;
                let drawH = origH;
                const minSide = Math.min(drawW, drawH);
                if (minSide < 320) {
                    const up = 320 / minSide;
                    drawW = Math.round(drawW * up);
                    drawH = Math.round(drawH * up);
                }
                const maxSide = Math.max(drawW, drawH);
                if (maxSide > 4096) {
                    const down = 4096 / maxSide;
                    drawW = Math.round(drawW * down);
                    drawH = Math.round(drawH * down);
                }

                let canvasW = drawW;
                let canvasH = drawH;
                const curRatio = canvasW / canvasH;
                if (curRatio < 0.45) {
                    canvasW = Math.ceil(canvasH * 0.48);
                } else if (curRatio > 2.4) {
                    canvasH = Math.ceil(canvasW / 2.35);
                }

                const canvas = document.createElement('canvas');
                canvas.width = canvasW;
                canvas.height = canvasH;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#141414';
                    ctx.fillRect(0, 0, canvasW, canvasH);
                    ctx.drawImage(imgEl, Math.round((canvasW - drawW) / 2), Math.round((canvasH - drawH) / 2), drawW, drawH);
                    const normalizedUri = canvas.toDataURL('image/jpeg', 0.92);
                    const uploadedNorm = await this.uploadBase64ToCdn(normalizedUri, `volce_norm_${hash}.jpg`);
                    if (uploadedNorm) {
                        return uploadedNorm;
                    }
                }
            }
        }

        if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
            return imageSource;
        }
        const fallbackUrl = await this.uploadBase64ToCdn(loadableDataUri || imageSource, `volce_img_${hash}.png`);
        if (!fallbackUrl) {
            throw new Error('Không thể chuẩn bị URL HTTPS công khai để đăng ký Volcengine Asset.');
        }
        return fallbackUrl;
    }

    /**
     * Tìm hoặc tạo nhóm tài nguyên AIGC trên Volcengine Asset Library theo đúng vùng (cn / overseas).
     */
    private async getOrCreateVolceAigcGroup(
        baseWithV1: string,
        headers: Record<string, string>,
        keyFp: string,
        assetRegion: 'cn' | 'overseas'
    ): Promise<string> {
        const groupCacheKey = `${baseWithV1}|${keyFp}|${assetRegion}`;
        if (GenaiService._volceAssetGroupCache[groupCacheKey]) {
            return GenaiService._volceAssetGroupCache[groupCacheKey];
        }
        const existingInFlight = GenaiService._volceGroupInFlight.get(groupCacheKey);
        if (existingInFlight) {
            return existingInFlight;
        }

        const groupPromise = (async (): Promise<string> => {
            try {
                const listRes = await fetch(`${baseWithV1}/volce-asset/groups/list`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        asset_region: assetRegion,
                        page_number: 1,
                        page_size: 50
                    })
                });
                const listText = await listRes.text();
                let listData: any = {};
                try { listData = JSON.parse(listText); } catch { listData = {}; }
                const items: any[] = listData?.output?.data?.items || listData?.data?.items || listData?.items || [];
                if (Array.isArray(items)) {
                    const matched = items.find(
                        (g: any) => g && g.id && g.group_type === 'AIGC' && (g.asset_region || 'cn') === assetRegion
                    );
                    if (matched?.id) {
                        GenaiService._volceAssetGroupCache[groupCacheKey] = matched.id;
                        return matched.id;
                    }
                }
            } catch (err) {
                console.warn('[VolceAsset] Lỗi truy vấn danh sách group, tiến hành tạo mới:', err);
            }

            const createRes = await fetch(`${baseWithV1}/volce-asset/groups/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: `ai-type-aigc-${assetRegion}`,
                    description: 'AI.Type AIGC media assets for ByteDance Seedance',
                    group_type: 'AIGC',
                    asset_region: assetRegion
                })
            });
            const createText = await createRes.text();
            let createData: any = {};
            try { createData = JSON.parse(createText); } catch { createData = {}; }
            const groupId = createData?.output?.data?.id || createData?.data?.id || createData?.id || '';
            if (!groupId) {
                throw new Error(`Không thể khởi tạo nhóm Volcengine AIGC Asset (${assetRegion}): ${createText.substring(0, 240)}`);
            }
            GenaiService._volceAssetGroupCache[groupCacheKey] = groupId;
            return groupId;
        })();

        GenaiService._volceGroupInFlight.set(groupCacheKey, groupPromise);
        try {
            return await groupPromise;
        } finally {
            GenaiService._volceGroupInFlight.delete(groupCacheKey);
        }
    }

    /**
     * Đăng ký ảnh/video vào Volcengine Asset Library (group_type: AIGC) để nhận định danh asset://<id>,
     * cho phép Seedance 2.0/2.5 tạo video với ảnh nhân vật có khuôn mặt người/chân thực mà không bị chặn PrivacyInformation.
     */
    private async registerVolceMediaAsset(
        baseWithV1: string,
        headers: Record<string, string>,
        keyFp: string,
        mediaSource: string,
        assetRegion: 'cn' | 'overseas',
        assetType: 'Image' | 'Video' = 'Image',
        forceRefresh: boolean = false
    ): Promise<string> {
        if (!mediaSource) {
            throw new Error('Nguồn dữ liệu media trống khi đăng ký Volcengine Asset.');
        }
        if (mediaSource.startsWith('asset://') && !forceRefresh) {
            return mediaSource;
        }

        const hash = GenaiService.computeVolceSourceHash(mediaSource);
        const cacheKey = `${baseWithV1}|${keyFp}|${assetRegion}|${hash}`;
        const urlCache = GenaiService.getVolceAssetUrlCache();

        if (!forceRefresh && urlCache[cacheKey] && urlCache[cacheKey].startsWith('asset://')) {
            return urlCache[cacheKey];
        }
        if (!forceRefresh) {
            const pendingAsset = GenaiService._volceAssetInFlight.get(cacheKey);
            if (pendingAsset) {
                return pendingAsset;
            }
        }
        if (forceRefresh && urlCache[cacheKey]) {
            delete urlCache[cacheKey];
            GenaiService.saveVolceAssetUrlCache();
        }

        const registerPromise = (async (): Promise<string> => {
            const groupId = await this.getOrCreateVolceAigcGroup(baseWithV1, headers, keyFp, assetRegion);
            const assetName = `aigc-${assetRegion}-${hash}`;

            const lookupExistingByName = async (): Promise<{ id: string; status: string } | null> => {
                try {
                    const listRes = await fetch(`${baseWithV1}/volce-asset/assets/list`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            asset_region: assetRegion,
                            filter: {
                                group_ids: [groupId],
                                group_type: 'AIGC',
                                name: assetName
                            },
                            page_number: 1,
                            page_size: 10
                        })
                    });
                    const listText = await listRes.text();
                    let listData: any = {};
                    try { listData = JSON.parse(listText); } catch { listData = {}; }
                    const items: any[] = listData?.output?.data?.items || listData?.data?.items || listData?.items || [];
                    if (!Array.isArray(items) || items.length === 0) return null;
                    const exact = items.filter((it: any) => it && it.id && it.name === assetName);
                    const pool = exact.length > 0 ? exact : items.filter((it: any) => it && it.id);
                    const activeItem = pool.find((it: any) => it.status === 'Active');
                    if (activeItem) return { id: activeItem.id, status: 'Active' };
                    const procItem = pool.find((it: any) => it.status === 'Processing');
                    if (procItem) return { id: procItem.id, status: 'Processing' };
                    return null;
                } catch {
                    return null;
                }
            };

            let assetId = '';
            if (!forceRefresh) {
                const existing = await lookupExistingByName();
                if (existing?.status === 'Active') {
                    const uri = `asset://${existing.id}`;
                    urlCache[cacheKey] = uri;
                    GenaiService.saveVolceAssetUrlCache();
                    console.log(`[VolceAsset] Tái sử dụng asset có sẵn (${assetRegion}): ${uri}`);
                    return uri;
                }
                if (existing?.status === 'Processing') {
                    assetId = existing.id;
                    console.log(`[VolceAsset] Asset đang xử lý sẵn (${assetRegion}): ${assetId}, chuyển sang chờ Active...`);
                }
            }

            if (!assetId) {
                const publicUrl = assetType === 'Image'
                    ? await this.ensureVolceCompatibleImageUrl(mediaSource, hash)
                    : mediaSource;

                console.log(`[VolceAsset] Đang đăng ký ${assetType} vào group ${groupId} (${assetRegion}): ${publicUrl}`);
                let createRawText = '';
                try {
                    const createRes = await fetch(`${baseWithV1}/volce-asset/assets/create`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            group_id: groupId,
                            url: publicUrl,
                            name: assetName,
                            asset_type: assetType,
                            asset_region: assetRegion
                        })
                    });
                    createRawText = await createRes.text();
                    let createData: any = {};
                    try { createData = JSON.parse(createRawText); } catch { createData = {}; }
                    assetId = createData?.output?.data?.id || createData?.data?.id || createData?.id || '';
                } catch (createErr: any) {
                    createRawText = String(createErr?.message || createErr || '');
                    console.warn('[VolceAsset] Ngoại lệ khi gọi assets/create, thử truy vấn lại qua assets/list:', createRawText);
                }

                // Phục hồi khi cổng proxy (Cloudflare 524) timeout nhưng Volcengine backend vẫn tạo asset thành công
                if (!assetId) {
                    const recovered = await lookupExistingByName();
                    if (recovered?.status === 'Active') {
                        const uri = `asset://${recovered.id}`;
                        urlCache[cacheKey] = uri;
                        GenaiService.saveVolceAssetUrlCache();
                        console.log(`[VolceAsset] Phục hồi thành công asset Active sau gateway timeout (${assetRegion}): ${uri}`);
                        return uri;
                    }
                    if (recovered?.id) {
                        assetId = recovered.id;
                        console.log(`[VolceAsset] Phục hồi ID asset đang xử lý (${assetRegion}): ${assetId}`);
                    }
                }

                if (!assetId) {
                    throw new Error(`Đăng ký ảnh nhân vật lên Volcengine Asset thất bại: ${createRawText.substring(0, 240)}`);
                }
            }

            for (let attempt = 1; attempt <= 48; attempt++) {
                try {
                    const getRes = await fetch(`${baseWithV1}/volce-asset/assets/get`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            id: assetId,
                            asset_region: assetRegion
                        })
                    });
                    const getText = await getRes.text();
                    let getData: any = {};
                    try { getData = JSON.parse(getText); } catch { getData = {}; }
                    const status = getData?.output?.data?.status || getData?.data?.status || getData?.status || '';
                    if (status === 'Active') {
                        const uri = `asset://${assetId}`;
                        urlCache[cacheKey] = uri;
                        GenaiService.saveVolceAssetUrlCache();
                        console.log(`[VolceAsset] Asset đã Active (${assetRegion}): ${uri}`);
                        return uri;
                    }
                    if (status === 'Failed') {
                        const failReason = getData?.output?.data?.error?.message || getData?.error?.message || getData?.message || 'Volcengine từ chối xử lý ảnh';
                        throw new Error(`Volcengine Asset báo trạng thái Failed: ${failReason}`);
                    }
                } catch (pollErr: any) {
                    if (pollErr?.message && pollErr.message.includes('Volcengine Asset báo trạng thái Failed')) {
                        throw pollErr;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 2500));
            }

            throw new Error(`Quá thời gian chờ Volcengine kích hoạt Asset (${assetId}). Vui lòng bấm tạo lại cảnh này sau ít giây.`);
        })();

        GenaiService._volceAssetInFlight.set(cacheKey, registerPromise);
        try {
            return await registerPromise;
        } finally {
            GenaiService._volceAssetInFlight.delete(cacheKey);
        }
    }

    public get googleAi(): GoogleGenAI | null {
        if (!this._aiInstance && !this.isUModelverseEnabled()) {
            this.syncConfigFromStorage();
        }
        return this._aiInstance || null;
    }

    private getSettingsFromStorage(): any {
        // [Refactor 2026-11-11] Settings chi doc tu server (cache RAM cua du lieu server).
        return getSettings() || {};
    }

    /** Tóm tắt ngắn gọn lỗi của một API Key để hiển thị trong thông báo tổng hợp */
    private summarizeKeyError(err: any): string {
        const msg = String(err?.message || err || '');
        if (msg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || msg.includes('API key not valid') || msg.includes('UNAUTHENTICATED') || msg.includes('401')) {
            return 'bị Google từ chối, HTTP 401';
        }
        if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
            return 'không có quyền, HTTP 403';
        }
        const codeMatch = msg.match(/"code"\s*:\s*(\d{3})/);
        if (codeMatch) return `HTTP ${codeMatch[1]}`;
        return msg.length > 80 ? msg.substring(0, 80) + '...' : (msg || 'không rõ lỗi');
    }

    /**
     * [PATCH 2026-10-22] Trích xuất số giây Google yêu cầu chờ (RetryInfo) từ lỗi 429 Rate Limit.
     * Hỗ trợ cả message dạng JSON (ApiError của @google/genai) lẫn text thuần ("Please retry in 38s" / "3h35m40s").
     * Trả về -1 nếu không xác định được.
     */
    private extractRetrySeconds(error: any): number {
        try {
            const msg = typeof error?.message === 'string' ? error.message : String(error || '');
            if (!msg) return -1;
            const jsonStart = msg.indexOf('{');
            if (jsonStart !== -1) {
                try {
                    const parsed = JSON.parse(msg.slice(jsonStart));
                    const details = parsed?.error?.details || [];
                    for (const d of details) {
                        const rd = d?.retryDelay;
                        if (rd) {
                            const m = String(rd).trim().match(/^([\d.]+)s$/);
                            if (m) return Math.ceil(parseFloat(m[1]));
                        }
                    }
                } catch (e) {}
            }
            const hm = msg.match(/retry in (\d+)h(\d+)m([\d.]+)s/i);
            if (hm) return Math.ceil(parseInt(hm[1], 10) * 3600 + parseInt(hm[2], 10) * 60 + parseFloat(hm[3]));
            const sm = msg.match(/retry in ([\d.]+)s/i);
            if (sm) return Math.ceil(parseFloat(sm[1]));
        } catch (e) {}
        return -1;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    }

    private syncConfigFromStorage() {
        try {
            const settings = this.getSettingsFromStorage();

            // Cập nhật cấu hình Mì Tôm AI
            this._enableUmodelverse = settings.enableUmodelverse === true;
            this._umodelverseUrl = settings.umodelverseUrl?.trim() || '';
            this._umodelverseKey = settings.umodelverseKey?.trim() || '';
            this._umodelverseChatModel = settings.umodelverseChatModel?.trim() || '';
            this._umodelverseImageModel = settings.umodelverseImageModel?.trim() || '';
            this._umodelverseVideoModel = settings.umodelverseVideoModel?.trim() || '';
            this._geminiTextModel = settings.geminiTextModel?.trim() || '';

            // [PATCH] Model da bi Google khai tu ma van duoc luu trong cai dat se bi bo qua de he thong dung mac dinh con song
            const deadGeminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.6-flash'];
            for (const cfgKey of ['Chat', 'Image', 'Video'] as const) {
                const field = ('_umodelverse' + cfgKey + 'Model') as keyof this;
                const val = String(this[field] || '').toLowerCase();
                if (val && deadGeminiModels.includes(val)) {
                    console.warn(`[GenaiService] Model Mì Tôm AI ${cfgKey.toLowerCase()} cai dat (${val}) da bi khai tu, tu dong bo qua de dung model mac dinh.`);
                    (this as any)[field] = '';
                }
            }

            // Nếu umodelverseUrl bị thiếu giao thức, thêm vào (mặc định https)
            if (this._umodelverseUrl && !this._umodelverseUrl.startsWith('http')) {
                this._umodelverseUrl = 'https://' + this._umodelverseUrl;
            }
            // Chuẩn hoá URL: Tự động loại bỏ các path phụ đuôi như /v1/chat/completions, /chat/completions...
            this._umodelverseUrl = this._umodelverseUrl
                .replace(/\/v1\/chat\/completions\/?$/i, '')
                .replace(/\/chat\/completions\/?$/i, '')
                .replace(/\/v1beta\/?$/i, '');
            if (this._umodelverseUrl.endsWith('/')) {
                this._umodelverseUrl = this._umodelverseUrl.slice(0, -1);
            }

            const keys = settings.secretKey ? settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];

            if (keys.length > 0) {
                // Chọn ngẫu nhiên một key trong mảng để tránh Rate Limit (429)
                const randomKey = keys[Math.floor(Math.random() * keys.length)];
                if (randomKey !== this._currentKey || !this._aiInstance) {
                    this._currentKey = randomKey;
                    this._aiInstance = new GoogleGenAI({ apiKey: randomKey });
                    console.log("GenaiService: Đã đổi sang API Key mới (Random Load Balancing).");
                }
            } else {
                this._currentKey = '';
                this._aiInstance = undefined;
            }
        } catch (e) {
            console.error("GenaiService: Lỗi parse settings từ localStorage", e);
            this._currentKey = '';
            this._enableUmodelverse = false;
            this._umodelverseUrl = '';
            this._umodelverseKey = '';
            this._umodelverseChatModel = '';
            this._umodelverseImageModel = '';
            this._umodelverseVideoModel = '';
            this._geminiTextModel = '';
        }
    }

    public isUModelverseEnabled(): boolean {
        this.syncConfigFromStorage();
        return this._enableUmodelverse && !!this._umodelverseUrl;
    }

    public isAiAgentEnabled(): boolean {
        const settings = this.getSettingsFromStorage();
        return settings?.enableAiAgent === true;
    }

    public isAiAvailable(): boolean {
        const settings = this.getSettingsFromStorage();
        const hasUmodelverse = this.isUModelverseEnabled();
        const hasAiAgent = settings?.enableAiAgent === true;
        const hasSecretKey = !!(settings?.secretKey && settings.secretKey.trim());
        return hasUmodelverse || hasAiAgent || hasSecretKey;
    }

    public get umodelverseUrl(): string { return this._umodelverseUrl; }
    public get umodelverseKey(): string { return this._umodelverseKey; }
    public get umodelverseChatModel(): string { return this._umodelverseChatModel; }
    public get umodelverseImageModel(): string { return this._umodelverseImageModel; }
    public get umodelverseVideoModel(): string { return this._umodelverseVideoModel; }

    /** Base URL đang trỏ thẳng tới API gốc của Anthropic (api.anthropic.com) hay không. */
    public static isAnthropicDirectUrl(url: string): boolean {
        try {
            const raw = (url || '').trim();
            const host = new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.toLowerCase();
            return host === 'api.anthropic.com';
        } catch {
            return false;
        }
    }

    /**
     * Header xác thực cho Mì Tôm AI. API gốc Anthropic dùng x-api-key + anthropic-version
     * (kèm cờ cho phép gọi thẳng từ renderer để không dính CORS), các proxy khác dùng Bearer.
     */
    public static buildUModelverseHeaders(url: string, key: string, withJson = true): Record<string, string> {
        const headers: Record<string, string> = {};
        if (withJson) headers['Content-Type'] = 'application/json';
        if (GenaiService.isAnthropicDirectUrl(url)) {
            headers['x-api-key'] = key;
            headers['anthropic-version'] = '2023-06-01';
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
        } else {
            headers['Authorization'] = `Bearer ${key}`;
        }
        return headers;
    }

    /** Các Base URL mà model Claude phải đi theo chuẩn OpenAI (/chat/completions) vì proxy không có /messages. */
    private static _claudeOpenAiFallbackBases = new Set<string>();
    /** Ghi nhớ các cặp base|model mà proxy từ chối tham số điều khiển suy luận (thinking / enable_thinking / reasoning_effort). */
    private static _unsupportedThinkingParamKeys = new Set<string>();
    /** Ghi nhớ các cặp base|model từng cạn max_tokens khi suy luận để tự động tắt deep-thinking ngay từ lượt gọi đầu. */
    private static _forceDisableThinkingModels = new Set<string>();

    /**
     * Chuẩn hoá Base URL cho mọi dịch vụ tương thích OpenAI.
     * - versioned: gốc đã gồm phiên bản API, dùng để nối /chat/completions, /models, /images/..., /messages.
     *   Nếu Base URL đã có đoạn phiên bản (/v1, /v3, /v4, /v1beta/openai...) thì giữ nguyên, chưa có thì gắn /v1.
     * - root: phần đứng trước đoạn phiên bản (dùng cho đường riêng như /v1beta/models/... của Gemini, /v1/{model} của Mì Tôm).
     */
    public static resolveApiBase(url: string): { versioned: string; root: string } {
        let base = (url || '').trim();
        if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
        base = base.replace(/\/+$/, '')
            .replace(/\/chat\/completions$/i, '')
            .replace(/\/messages$/i, '')
            .replace(/\/models$/i, '')
            .replace(/\/+$/, '');
        let origin = base;
        let segments: string[] = [];
        try {
            const parsed = new URL(base);
            origin = parsed.origin;
            segments = parsed.pathname.split('/').filter(Boolean);
        } catch {
            return { versioned: `${base}/v1`, root: base };
        }
        const versionIdx = segments.findIndex(seg => /^v\d+[a-z0-9.]*$/i.test(seg));
        if (versionIdx < 0) {
            return { versioned: `${base}/v1`, root: base };
        }
        const rootPath = segments.slice(0, versionIdx).join('/');
        return { versioned: base, root: rootPath ? `${origin}/${rootPath}` : origin };
    }

    public async getUModelverseModels(): Promise<string[]> {
        this.syncConfigFromStorage();
        if (!this.isUModelverseEnabled()) {
            return [];
        }
        try {
            const modelsEndpoint = `${GenaiService.resolveApiBase(this._umodelverseUrl).versioned}/models`;
            const modelsRes = await fetch(modelsEndpoint, {
                method: 'GET',
                headers: GenaiService.buildUModelverseHeaders(this._umodelverseUrl, this._umodelverseKey, false)
            });
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                if (modelsData && Array.isArray(modelsData.data)) {
                    return modelsData.data.map((m: any) => m.id);
                }
            }
        } catch (e) {
            console.error("[GenAIService] Error fetching models from UModelverse:", e);
        }
        return [];
    }

    isLoadingFor(scope: Scope): boolean {
        const m = this._scopes();
        return (m[String(scope)] ?? 0) > 0;
    }

    private _start(scope?: Scope) {
        this._active.update(n => n + 1);
        if (scope !== undefined) {
            const k = String(scope);
            const next = { ...this._scopes() };
            next[k] = (next[k] ?? 0) + 1;
            this._scopes.set(next);
        }
    }

    private _stop(scope?: Scope) {
        this._active.update(n => Math.max(0, n - 1));
        if (scope !== undefined) {
            const k = String(scope);
            const next: Record<string, number> = { ...this._scopes() };
            next[k] = Math.max(0, (next[k] ?? 1) - 1);
            if (next[k] === 0) delete next[k];
            this._scopes.set(next);
        }
    }

    async generateContent(
        params: GenerateContentParameters,
        scope?: Scope
    ): Promise<GenerateContentResponse> {
        this.syncConfigFromStorage();

        // [PATCH PDF] Luoi an toan: neu request chua inlineData PDF thi trich xuat van ban
        // ngay phia client. Cac tang proxy dinh dang OpenAI-style khong ho tro inlineData
        // PDF (bi bo qua yen lang), khien AI "khong thay" file dinh kem.
        try {
            await this._convertPdfAttachmentsToText(params);
        } catch (e) {
            console.warn('[GenaiService] Khong the trich xuat van ban tu file PDF dinh kem:', e);
        }

        // [PATCH] Luoi an toan: cac model Gemini da bi Google khai tu (404 NOT_FOUND) se tu dong nang len model hien hanh
        const deprecatedGeminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.6-flash'];
        const hasCustomModality = !!params.config?.responseModalities?.length;
        if (params.model && !hasCustomModality && deprecatedGeminiModels.includes(String(params.model).toLowerCase())) {
            console.warn(`[GenaiService] Model ${params.model} da ngung hoat dong tren Google, tu dong chuyen sang gemini-3.8-flash.`);
            params.model = 'gemini-3.8-flash';
        }

        // Restore model compatibility with existing UModelverse config
        const bypassModelOverride = (params.config as any)?.bypassModelOverride === true;
        const settingsRaw = this.getSettingsFromStorage();
        let isAiAgentActive = settingsRaw?.enableAiAgent === true;
        if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
            try {
                const list = await (window as any).electronAPI.getPluginsStatus();
                const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                if (aiAgent && aiAgent.enabled !== undefined) {
                    // Nếu trong settings đã bật hoặc trên desktop plugin đã bật thì kích hoạt AI Agent
                    isAiAgentActive = aiAgent.enabled === true || isAiAgentActive;
                }
            } catch(e) {}
        }

        const isVideoRequest = params.config?.responseModalities?.includes('VIDEO');
        const isImageRequest = params.config?.responseModalities?.includes('IMAGE');
        const isImageEdit = (params.config as any)?.isImageEdit === true;
        const bypassAiAgent = (params.config as any)?.bypassAiAgent === true;

        const isUModelverse = this.isUModelverseEnabled();
        const configuredAgentModel = settingsRaw?.aiAgentModel || 'glm-5.3';

        if (isUModelverse) {
            // Khi Mì Tôm AI được bật trong tài khoản, ưu tiên áp dụng model của Mì Tôm AI
            if ((isImageRequest || isImageEdit) && this._umodelverseImageModel && !bypassModelOverride) {
                // Nếu người dùng đã cài đặt model ảnh riêng trong Mì Tôm AI, ưu tiên dùng model đó cho cả tạo mới ảnh lẫn sửa ảnh
                params.model = this._umodelverseImageModel;
            } else if (isImageRequest && !isImageEdit && (!params.model || params.model.includes('gemini-') && !params.model.includes('image') || params.model.includes('claude'))) {
                params.model = this._umodelverseImageModel || 'dall-e-3';
            } else if (!bypassModelOverride && !isImageEdit) {
                if (params.model?.startsWith('gemini-3.8-flash') || params.model?.startsWith('gemini-3.7-flash') || params.model?.startsWith('gemini-3.8-flash')) {
                    if (this._umodelverseChatModel) {
                        params.model = this._umodelverseChatModel;
                    }
                } else if (
                    params.model === 'imagen-3.0-generate-001' ||
                    params.model === 'imagen-3.0-generate-002' ||
                    params.model === 'gemini-3-pro-image-preview' ||
                    params.model === 'gemini-3-pro-image' ||
                    params.model?.includes('image') ||
                    params.model?.includes('imagen')
                ) {
                    params.model = this._umodelverseImageModel || 'dall-e-3';
                }
            }
        } else if (isAiAgentActive && !isVideoRequest && !isImageRequest && !bypassAiAgent) {
            // Khi Mì Tôm AI không bật, ưu tiên sang AI Agent
            params.model = configuredAgentModel;
        } else if (isImageRequest && !isImageEdit && (!params.model || params.model.includes('gemini-') && !params.model.includes('image') || params.model.includes('claude'))) {
            params.model = 'imagen-3.0-generate-002';
        }

        this._start(scope);
        try {
            const bypassUModelverse = (params.config as any)?.bypassUModelverse === true;
            let lastError: any = null;

            // 1. Tầng Ưu Tiên 1: Mì Tôm AI / UModelverse (Nếu người dùng bật Mì Tôm AI trong tài khoản)
            if (this.isUModelverseEnabled() && !bypassUModelverse) {
                try {
                    return await this.generateWithUModelverse(params); // Ưu tiên hàng đầu!
                } catch (uErr: any) {
                    console.warn(`[GenaiService] Mì Tôm AI lỗi (${uErr?.message || uErr}).`);
                    // Tuyệt đối không fallback sang model nào khác nếu đang tạo Video bằng Mì Tôm AI!
                    if (isVideoRequest) {
                        throw uErr;
                    }
                    console.warn(`[GenaiService] Đang chuyển sang tầng tiếp theo...`);
                    lastError = uErr;
                }
            }

            // 2. Tầng Dự Phòng 2: AI Agent (agent.type.vn) nếu đang hoạt động
            if (isAiAgentActive && !isVideoRequest && !bypassAiAgent) {
                try {
                    const agentRes = await this.generateWithAiAgent(params, scope);
                    return agentRes;
                } catch (agentErr: any) {
                    console.warn(`[GenaiService] AI Agent lỗi (${agentErr?.message || agentErr}). Đang chuyển sang tầng tiếp theo...`);
                    lastError = agentErr;
                }
            }

            // Nếu là yêu cầu tạo Video nhưng Mì Tôm AI không khả dụng hoặc bị lỗi, dừng lại ngay, không nhảy sang Gemini Studio
            if (isVideoRequest) {
                throw lastError || new Error("Không thể tạo video: Mì Tôm AI bị lỗi hoặc chưa được cấu hình. Vui lòng kiểm tra lại cấu hình hoặc model.");
            }

            // 3. Tầng Dự Phòng 3: Gemini Studio mặc định của app (Google AI API Key)
            const keys = settingsRaw?.secretKey ? settingsRaw.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];

            if (keys.length === 0) {
                console.error("API Key is missing in localStorage.");
                throw lastError || new Error("API Key không hợp lệ hoặc chưa được cấu hình.");
            }

            // Xáo trộn mảng keys để random load balancing
            const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
            if (this._currentKey && shuffledKeys.includes(this._currentKey)) {
                shuffledKeys.splice(shuffledKeys.indexOf(this._currentKey), 1);
                shuffledKeys.unshift(this._currentKey);
            }

            const keyRetryCounts: Record<string, number> = {};
            // Ghi lại lỗi của từng key để báo tổng hợp khi tất cả đều thất bại
            const keyFailures: { key: string; error: any }[] = [];
            for (let i = 0; i < shuffledKeys.length; i++) {
                const key = shuffledKeys[i];
                    try {
                        let aiInstance = this._aiInstance;
                        if (key !== this._currentKey || !aiInstance) {
                            aiInstance = new GoogleGenAI({ apiKey: key });
                        }

                        let googleModel = params.model;
                        if (!googleModel || googleModel === 'agent') {
                            googleModel = isImageEdit ? 'gemini-3.1-flash-image-preview' : (this._geminiTextModel || 'gemini-3.8-flash');
                        }
                        const candidateGoogleModels = isImageEdit ? [
                            googleModel,
                            'gemini-3.1-flash-image-preview',
                            'gemini-2.5-flash-image',
                            'gemini-3-pro-image-preview'
                        ].filter((v, idx, arr) => arr.indexOf(v) === idx && v && v.startsWith('gemini-')) : [
                            this._geminiTextModel || googleModel,
                            googleModel,
                            'gemini-3.8-flash',
                            'gemini-3.7-flash'
                        ].filter((v, idx, arr) => arr.indexOf(v) === idx && v && (v.startsWith('gemini-') || v.startsWith('tunedModels/')));

                        // Lọc sạch config chuẩn cho Google GenAI SDK (không ép maxOutputTokens=8192 làm nghẽn suy luận trên Gemini 2.5/3.x)
                        const cleanConfig: any = {};
                        const googleDisableThinking = !isImageRequest && !isImageEdit && (params.config as any)?.disableThinking === true;
                        if (params.config) {
                            if (params.config.maxOutputTokens && params.config.maxOutputTokens !== 8192) {
                                cleanConfig.maxOutputTokens = params.config.maxOutputTokens;
                            }
                            if (params.config.temperature !== undefined) cleanConfig.temperature = params.config.temperature;
                            if (params.config.topP !== undefined) cleanConfig.topP = params.config.topP;
                            if (params.config.topK !== undefined) cleanConfig.topK = params.config.topK;
                            if (params.config.systemInstruction) cleanConfig.systemInstruction = params.config.systemInstruction;
                            if (params.config.responseMimeType) cleanConfig.responseMimeType = params.config.responseMimeType;
                            if (params.config.responseSchema) cleanConfig.responseSchema = params.config.responseSchema;
                            if (params.config.responseModalities) cleanConfig.responseModalities = params.config.responseModalities;
                            if ((params.config as any).thinkingConfig) {
                                cleanConfig.thinkingConfig = (params.config as any).thinkingConfig;
                            }
                            // [PATCH 2026-10-17] Giữ nguyên imageConfig do editor gửi lên, chuẩn hóa imageSize dạng pixel (1920x1080) sang chuẩn Google (1K/2K/4K) để tránh lỗi HTTP 400
                            if ((params.config as any).imageConfig) {
                                const rawCfg = { ...(params.config as any).imageConfig };
                                const rawSz = String(rawCfg.imageSize || '');
                                const pxm = rawSz.match(/^(\d+)x(\d+)$/);
                                if (pxm) {
                                    const maxPx = Math.max(parseInt(pxm[1], 10), parseInt(pxm[2], 10));
                                    rawCfg.imageSize = maxPx >= 3500 ? '4K' : (maxPx >= 1900 ? '2K' : '1K');
                                }
                                cleanConfig.imageConfig = rawCfg;
                            }
                        }

                        let result;
                        let googleErr: any = null;
                        for (const m of candidateGoogleModels) {
                            let attempt = 0;
                            let stripThinkingForModel = false;
                            while (true) {
                                try {
                                    const perModelConfig: any = { ...cleanConfig };
                                    if (googleDisableThinking && !stripThinkingForModel && !perModelConfig.thinkingConfig) {
                                        perModelConfig.thinkingConfig = {
                                            thinkingBudget: m.toLowerCase().includes('pro') ? 1024 : 0
                                        };
                                    }
                                    result = await aiInstance.models.generateContent({
                                        ...params,
                                        model: m,
                                        config: Object.keys(perModelConfig).length > 0 ? perModelConfig : undefined
                                    });

                                    // Nếu Gemini chạm MAX_TOKENS trong quá trình suy luận mà chưa sinh ra text, tự động thử lại ngay với thinkingBudget tối thiểu
                                    const cand = result?.candidates?.[0];
                                    const nonThoughtText = (cand?.content?.parts || [])
                                        .filter((p: any) => p?.text && !p?.thought)
                                        .map((p: any) => p.text)
                                        .join('');
                                    const hasMediaOrFn = (cand?.content?.parts || []).some(
                                        (p: any) => Boolean(p?.inlineData || p?.functionCall)
                                    );
                                    if (cand?.finishReason === 'MAX_TOKENS' && !nonThoughtText && !hasMediaOrFn) {
                                        console.warn(`[GenaiService] Model ${m} chạm MAX_TOKENS khi suy luận trên Google AI, tự động gửi lại ở chế độ trực tiếp...`);
                                        const retryCfg: any = { ...cleanConfig };
                                        delete retryCfg.maxOutputTokens;
                                        if (!stripThinkingForModel) {
                                            retryCfg.thinkingConfig = {
                                                thinkingBudget: m.toLowerCase().includes('pro') ? 1024 : 0
                                            };
                                        }
                                        result = await aiInstance.models.generateContent({
                                            ...params,
                                            model: m,
                                            config: Object.keys(retryCfg).length > 0 ? retryCfg : undefined
                                        });
                                    }

                                    if (result) break;
                                } catch (mErr: any) {
                                    googleErr = mErr;
                                    const mErrMsg = String(mErr?.message || mErr || '');
                                    // Model Gemini đời cũ (vd 1.5) không nhận thinkingConfig => tự bỏ thinkingConfig và gửi lại ngay
                                    if (!stripThinkingForModel && googleDisableThinking && (mErrMsg.includes('thinking') || mErrMsg.includes('thinkingBudget') || mErrMsg.includes('400'))) {
                                        stripThinkingForModel = true;
                                        continue;
                                    }
                                    const isM429 = mErrMsg.includes('429') || mErrMsg.includes('RESOURCE_EXHAUSTED');
                                    const mRetrySec = this.extractRetrySeconds(mErr);
                                    // [PATCH 2026-10-22] 429 Free Tier: Google trả kèm RetryInfo ngắn (vd 8s/38s).
                                    // Đợi đúng số giây đó rồi thử lại model, thay vì nhảy model/key ngay.
                                    if (isM429 && mRetrySec >= 0 && mRetrySec <= 90 && attempt < 2) {
                                        attempt++;
                                        console.warn(`[GenaiService] Model ${m} bị 429 Rate Limit trên Google AI, tự động đợi ${mRetrySec}s rồi thử lại (lần ${attempt}/2).`);
                                        await this.sleep(mRetrySec * 1000 + 500);
                                        continue;
                                    }
                                    console.warn(`[GenaiService] Model ${m} lỗi trên Google AI:`, mErr?.message || mErr);
                                    break;
                                }
                            }
                            if (result) break;
                        }
                        if (!result && googleErr) throw googleErr;

                        // Nếu thành công thì lưu lại key này làm key mặc định cho các lượt tiếp theo
                        if (key !== this._currentKey) {
                            this._currentKey = key;
                            this._aiInstance = aiInstance;
                            console.log(`GenaiService: Đã chuyển sang Key an toàn (${key.substring(0, 8)}...)`);
                        }
                        return result;
                    } catch (error: any) {
                        lastError = error;
                        const errMsg = String(error?.message || error || '');
                        const isErr429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');
                        const errRetrySec = this.extractRetrySeconds(error);

                        // [PATCH 2026-10-22] Retry thông minh cho Free Tier: Google trả kèm RetryInfo (vd: "Please retry in 38s").
                        // Nếu thời gian chờ ngắn (<= 90s), tự động đợi rồi thử lại đúng key đó thay vì bỏ qua ngay.
                        if (isErr429 && errRetrySec >= 0 && errRetrySec <= 90 && (keyRetryCounts[key] || 0) < 2) {
                            keyRetryCounts[key] = (keyRetryCounts[key] || 0) + 1;
                            console.warn(`GenaiService: API Key ${key.substring(0, 8)}... bị 429 Rate Limit, tự động đợi ${errRetrySec}s rồi thử lại (lần ${keyRetryCounts[key]}/2).`);
                            await this.sleep(errRetrySec * 1000 + 500);
                            i--; // thử lại cùng key này
                            continue;
                        }

                        console.warn(`GenaiService: Lỗi với API Key ${key.substring(0, 8)}... - Thử key tiếp theo nếu có.`, error);
                        keyFailures.push({ key, error });
                        // Nếu là lỗi cuối cùng thì tổng hợp lỗi của tất cả các key rồi ném ra ngoài
                        if (i === shuffledKeys.length - 1) {
                            const isQuotaErr = (e: any) => {
                                const m = String(e?.message || e || '');
                                return m.includes('429') || m.includes('RESOURCE_EXHAUSTED');
                            };
                            const quotaFailures = keyFailures.filter(f => isQuotaErr(f.error));
                            const otherFailures = keyFailures.filter(f => !isQuotaErr(f.error));

                            // Có key hết hạn mức và có key lỗi khác: báo đủ cả hai nhóm
                            if (quotaFailures.length > 0 && otherFailures.length > 0) {
                                const otherDetail = otherFailures
                                    .map(f => `${f.key.substring(0, 8)}... (${this.summarizeKeyError(f.error)})`)
                                    .join('; ');
                                throw new Error(`Không còn API Key nào dùng được: ${quotaFailures.length}/${shuffledKeys.length} key đã hết hạn mức (HTTP 429), ${otherFailures.length} key lỗi khác: ${otherDetail}. Vui lòng chờ hạn mức được khôi phục hoặc thay các key bị lỗi.`);
                            }

                            // Tất cả đều hết hạn mức: giữ nguyên thông báo cũ
                            if (quotaFailures.length > 0) {
                                const finalRetrySec = this.extractRetrySeconds(quotaFailures[quotaFailures.length - 1].error);
                                if (finalRetrySec > 0 && finalRetrySec <= 3600) {
                                    const waitLabel = finalRetrySec >= 60 ? `${Math.ceil(finalRetrySec / 60)} phút` : `${finalRetrySec} giây`;
                                    throw new Error(`Tất cả ${shuffledKeys.length} API Key của bạn đều đã chạm trần hạn mức tạm thời (HTTP 429). Google yêu cầu đợi khoảng ${waitLabel} rồi thử lại. Vui lòng thêm key mới để xoay vòng nếu muốn dùng ngay!`);
                                }
                                throw new Error(`Tất cả ${shuffledKeys.length} API Key của bạn đều đã hết hạn mức (Quota Exceeded). Vui lòng thêm key mới hoặc chờ ngày mai!`);
                            }

                            // Không key nào hết hạn mức mà tất cả đều lỗi khác
                            if (keyFailures.length > 1) {
                                const detail = keyFailures
                                    .map(f => `${f.key.substring(0, 8)}... (${this.summarizeKeyError(f.error)})`)
                                    .join('; ');
                                throw new Error(`Tất cả ${keyFailures.length} API Key đều lỗi: ${detail}`);
                            }
                            throw lastError;
                        }
                    }
                }
                throw lastError;
        } catch (error) {
            console.error("Lỗi AI API:", error);
            throw error;
        } finally {
            this._stop(scope);
        }
    }

    public async generateWithAiAgent(params: GenerateContentParameters, scope?: Scope): Promise<any> {
        let promptText = '';
        const formData = new FormData();

        if (scope) {
            formData.append('conversation_id', String(scope));
        }

        const isFirstMessage = !Array.isArray(params.contents) || params.contents.length === 1;
        formData.append('is_first_message', isFirstMessage ? 'true' : 'false');

        if (params.contents) {
            let contentsArr: any[] = Array.isArray(params.contents) ? params.contents : [params.contents];
            let historyText = '';
            let latestText = '';

            for (let index = 0; index < contentsArr.length; index++) {
                const content = contentsArr[index];
                const isLast = (index === contentsArr.length - 1);
                const role = (content.role === 'model' || content.role === 'assistant') ? 'AI Agent' : 'User';
                
                let textParts = '';
                if (typeof content === 'string') {
                    textParts = content;
                } else {
                    const parts = (content as any).parts;
                    if (parts) {
                        for (let i = 0; i < parts.length; i++) {
                            const p = parts[i];
                            if (typeof p === 'string') {
                                textParts += p + '\n';
                            } else if (p.text) {
                                textParts += p.text + '\n';
                            }
                            
                            if (isLast && p.inlineData) {
                                const mimeType = p.inlineData.mimeType || 'image/jpeg';
                                let b64Data = p.inlineData.data;
                                if (b64Data && b64Data.startsWith('data:')) {
                                    b64Data = b64Data.split(',')[1];
                                }
                                
                                if (b64Data) {
                                    const dataUri = `data:${mimeType};base64,${b64Data}`;
                                    const fileResp = await fetch(dataUri);
                                    const blob = await fileResp.blob();
                                    
                                    let ext = 'jpg';
                                    if (mimeType.includes('png')) ext = 'png';
                                    else if (mimeType.includes('mp4')) ext = 'mp4';
                                    else if (mimeType.includes('wav')) ext = 'wav';
                                    else if (mimeType.includes('mp3')) ext = 'mp3';
                                    else if (mimeType.includes('markdown') || mimeType.includes('md')) ext = 'md';
                                    else if (mimeType.includes('plain')) ext = 'txt';
                                    const file = new File([blob], `media_${Date.now()}_${i}.${ext}`, { type: mimeType });
                                    formData.append('files', file);
                                }
                            }
                        }
                    }
                }
                
                if (textParts.trim()) {
                    if (isLast) {
                        latestText = textParts.trim();
                    } else {
                        historyText += `${role}: ${textParts.trim()}\n\n`;
                    }
                }
            }
            
            // Bỏ việc nhồi lịch sử chat vào prompt vì AI Agent (agy) đã tự động quản lý qua conversation_id
            promptText = latestText;
        }

        let finalPrompt = promptText.trim() || 'Xin chào';
        
        if (params.config && params.config.responseModalities) {
            if (params.config.responseModalities.includes('VIDEO')) {
                finalPrompt = 'Bắt buộc tạo video: ' + finalPrompt;
            }
        }
        // [PATCH 2026-10-16] SỬA ẢNH qua AI Agent: nhét chỉ thị cứng buộc dựa trên ảnh đính kèm, không vẽ mới
        const isImageEditAgent = (params.config as any)?.isImageEdit === true;
        if (isImageEditAgent) {
            finalPrompt = 'Bắt buộc CHỈNH SỬA dựa trên ảnh người dùng đính kèm trong files (giữ nguyên bố cục, nhân vật, phong cách ảnh gốc; chỉ thay đổi đúng theo yêu cầu). Tuyệt đối không vẽ ảnh mới hoàn toàn. Yêu cầu chỉnh sửa: ' + finalPrompt;
        }
        
        const isImageRequest = params.config?.responseModalities?.includes('IMAGE');

        let configRatio = (params.config as any)?.aspectRatio || (params.config as any)?.imageConfig?.aspectRatio;
        if (configRatio) {
            finalPrompt += `\n[Yêu cầu kỹ thuật: Tỉ lệ khung hình (Aspect Ratio) là ${configRatio}]`;
        }

        let imageSize = (params.config as any)?.imageConfig?.imageSize || (params.config as any)?.quality;
        if (isImageRequest && (!imageSize || imageSize.toLowerCase() === '4k')) {
            imageSize = '4k';
        }
        if (imageSize && !finalPrompt.includes('kích thước là')) {
            finalPrompt += `\n[Yêu cầu kỹ thuật: Kích thước là ${imageSize}]`;
        }
        
        formData.append('prompt', finalPrompt);
        const settings = this.getSettingsFromStorage();
        const configuredAgentModel = isImageRequest ? (params.model || 'gemini-3.7-flash') : (settings.aiAgentModel || params.model || 'gemini-3.7-flash');
        formData.append('model', configuredAgentModel);
        let sysContent = '';
        if (params.config && params.config.systemInstruction) {
            if (typeof params.config.systemInstruction === 'string') {
                sysContent = params.config.systemInstruction;
            } else if ((params.config.systemInstruction as any).parts) {
                sysContent = (params.config.systemInstruction as any).parts.map((p: any) => p.text).join('\n');
            }
        } else {
            sysContent = 'Bạn là Global AI Agent toàn năng. Bạn có khả năng phân tích, điều khiển và thực thi mọi tác vụ trong hệ thống phần mềm để tự động hóa công việc cho người dùng.';
            if (this.aiAgentCustomInstructions) {
                sysContent += `\n\n--- HƯỚNG DẪN DÀNH CHO AI AGENT (CONTEXT TỪ MÀN HÌNH HIỆN TẠI) ---\n${this.aiAgentCustomInstructions}\n--- HẾT HƯỚNG DẪN ---`;
            }
            if (settings.aiAgentPrompt) {
                sysContent += `\n\n--- HƯỚNG DẪN BỔ SUNG TỪ NGƯỜI DÙNG ---\n${settings.aiAgentPrompt}\n--- HẾT HƯỚNG DẪN BỔ SUNG ---`;
            }
        }

        formData.append('system_instructions', sysContent);

        // Bổ sung max_turns và chế độ tắt suy luận trung gian cho Agent (nếu có)
        const maxTurns = (params.config as any)?.maxTurns || (params.config as any)?.max_turns || settings.aiAgentMaxTurns || 25;
        formData.append('max_turns', String(maxTurns));
        if ((params.config as any)?.disableThinking === true) {
            formData.append('disable_thinking', 'true');
        }

        this.localAgentAbortController = new AbortController();
        let isAiAgentActive = false;
        let secretApiKey = 'type-vn-local-agent-2026';
        const targetEndpoint = isImageRequest ? '/api/image' : '/api/chat';
        let apiUrl = `${AI_AGENT_BASE_URL}${targetEndpoint}`;

        if (settings.enableAiAgent === true) {
            isAiAgentActive = true;
        }

        if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
            try {
                const list = await (window as any).electronAPI.getPluginsStatus();
                const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                if (aiAgent && aiAgent.enabled !== undefined) {
                    isAiAgentActive = aiAgent.enabled === true || isAiAgentActive;
                    if (aiAgent.apiKey) secretApiKey = aiAgent.apiKey;
                }
            } catch(e) {}
            if (settings.aiAgentApiKey && (secretApiKey === 'type-vn-local-agent-2026' || !secretApiKey)) {
                secretApiKey = settings.aiAgentApiKey;
            }
            if (secretApiKey && (secretApiKey.startsWith('http://') || secretApiKey.startsWith('https://'))) {
                // Giả định cú pháp setting là: URL|API_KEY (VD: https://agent.type.vn|my-secret)
                const parts = secretApiKey.split('|');
                const baseUrlClean = parts[0].replace(/\/api\/(chat|image)\/?$/, '');
                apiUrl = baseUrlClean + targetEndpoint;
                secretApiKey = parts[1] || 'type-vn-local-agent-2026';
            } else {
                // AI Agent chạy hoàn toàn qua domain https://agent.type.vn (không dùng daemon cục bộ nữa)
                apiUrl = `${AI_AGENT_BASE_URL}${targetEndpoint}`;
            }
        } else {
            // Web / Mobile / Another Account fallback logic
            if (settings.aiAgentApiKey) secretApiKey = settings.aiAgentApiKey;
            
            if (secretApiKey && (secretApiKey.startsWith('http://') || secretApiKey.startsWith('https://'))) {
                const parts = secretApiKey.split('|');
                const baseUrlClean = parts[0].replace(/\/api\/(chat|image)\/?$/, '');
                apiUrl = baseUrlClean + targetEndpoint;
                secretApiKey = parts[1] || 'type-vn-local-agent-2026';
            }
        }

        if (!isAiAgentActive) {
            throw new Error("Plugin AI Agent chưa được bật.");
        }
        
        let ttsVoice = settings.ttsVoice || 'vi-VN-HoaiMyNeural';
        if (params.config && (params.config as any).ttsVoice !== undefined) {
            ttsVoice = (params.config as any).ttsVoice;
        }
        const ttsRate = settings.ttsRate || '+0%';
        formData.append('tts_voice', ttsVoice === 'local' ? 'none' : ttsVoice);
        formData.append('tts_rate', ttsRate);
        
        try {
            const localTTSQueue = {
                buffer: '',
                play: function(force = false) {
                    if (ttsVoice !== 'local') return;
                    if (!window.speechSynthesis) return;
                    
                    let match = this.buffer.match(/([^.?!:\n]+[.?!:\n]+)(.*)/);
                    if (force && this.buffer.trim()) {
                         match = [this.buffer, this.buffer, ''];
                    }
                    if (match) {
                        const sentence = match[1].trim();
                        this.buffer = match[2] || '';
                        
                        if (sentence) {
                            const utterance = new SpeechSynthesisUtterance(sentence);
                            utterance.lang = 'vi-VN';
                            let rate = 1.25;
                            if (ttsRate === '-10%') rate = 1.0;
                            else if (ttsRate === '+10%') rate = 1.5;
                            else if (ttsRate === '+25%') rate = 1.75;
                            utterance.rate = rate;
                            window.speechSynthesis.speak(utterance);
                        }
                        if (force) this.play(true);
                        else this.play();
                    }
                }
            };
            // Audio queue để phát lần lượt các luồng TTS streaming
            const audioQueue = {
                queue: [] as string[],
                isPlaying: false,
                add: function(base64: string) {
                    if (ttsVoice === 'none') return;
                    this.queue.push(base64);
                    this.playNext();
                },
                playNext: function() {
                    if (this.isPlaying || this.queue.length === 0) return;
                    if (ttsVoice === 'none') {
                        this.queue = [];
                        return;
                    }
                    this.isPlaying = true;
                    const b64 = this.queue.shift();
                    const audio = new Audio('data:audio/mp3;base64,' + b64);
                    
                    // Boost the playback rate on frontend to make it faster
                    let rateMultiplier = 1.25;
                    if (ttsRate === '-10%') rateMultiplier = 1.0;
                    else if (ttsRate === '+10%') rateMultiplier = 1.45;
                    else if (ttsRate === '+25%') rateMultiplier = 1.7;
                    
                    audio.playbackRate = rateMultiplier;
                    
                    audio.onended = () => {
                        this.isPlaying = false;
                        this.playNext();
                    };
                    audio.play().catch(e => {
                        this.isPlaying = false;
                        this.playNext();
                    });
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'x-api-key': secretApiKey
                },
                body: formData,
                signal: this.localAgentAbortController.signal
            });

            if (!response.ok) {
                let errDetail = '';
                try {
                    const errJson = await response.json();
                    if (errJson && (errJson.detail || errJson.message || errJson.error)) {
                        errDetail = errJson.detail || errJson.message || errJson.error;
                    }
                } catch(e) {
                    try {
                        errDetail = await response.text();
                    } catch(e2) {}
                }

                if (response.status === 401 || response.status === 403) {
                    throw new Error(`Xác thực AI Agent (${apiUrl}) thất bại (HTTP ${response.status}): ${errDetail || 'Sai hoặc thiếu Secret API Key'}. Vui lòng nhập đúng Secret API Key của máy chủ trong Cài đặt -> Plugins -> AI Agent.`);
                }
                throw new Error(`AI Agent (${apiUrl}) phản hồi lỗi HTTP ${response.status}${errDetail ? ': ' + errDetail : ''}`);
            }

            let replyText = '';
            let imageBase64: string | undefined;
            let videoBase64: string | undefined;
            let audioBase64: string | undefined;
            let conversationId: string | undefined;
            
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = '';
                const startTime = Date.now();
                let lastActiveTime = Date.now();

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    lastActiveTime = Date.now(); // Cập nhật thời gian nhận tín hiệu từ server
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    let batchStreamedContent = '';
                    
                    for (let line of lines) {
                        line = line.trim();
                        if (!line || line.startsWith(':')) continue;
                        if (line.startsWith('data: ')) {
                            line = line.slice(6).trim();
                        }
                        if (line === '[DONE]') continue;
                        
                        try {
                            const chunk = JSON.parse(line);
                            if (chunk.success === false) {
                                throw new Error(chunk.error || 'AI Agent xử lý thất bại');
                            }
                            
                            // Bỏ qua các tin nhắn waiting nội bộ của subagent/background task
                            if (chunk.content && (chunk.content.includes('waiting for background') || chunk.content.includes('waiting for subagent'))) {
                                continue;
                            }

                            // Streaming chunk
                            let shouldIgnoreTTS = false;
                            const isSplitTask = replyText.includes('===SPLIT===') || finalPrompt.includes('===SPLIT===') || (params.config as any)?.skipTTS === true || finalPrompt.toLowerCase().includes('tách đoạn');
                            if (chunk.content) {
                                replyText += chunk.content;
                                batchStreamedContent += chunk.content;
                                
                                const backticksCount = (replyText.match(/```/g) || []).length;
                                const isInsideMarkdownCode = (backticksCount % 2 !== 0);
                                const isRawJsonData = replyText.includes('"action": "save_to_outline"') || replyText.includes('"action":"save_to_outline"');
                                shouldIgnoreTTS = isInsideMarkdownCode || isRawJsonData || isSplitTask;
                                
                                if (!shouldIgnoreTTS) {
                                    localTTSQueue.buffer += chunk.content;
                                    localTTSQueue.play();
                                }
                            }
                            // Fallback cho luồng cũ (trả 1 lần)
                            if (chunk.result !== undefined && !chunk.content) {
                                replyText = chunk.result;
                                if ((params.config as any)?.onStream) (params.config as any).onStream(chunk.result, true);
                            }
                            
                            if (chunk.image_base64) imageBase64 = chunk.image_base64;
                            if (chunk.video_base64) videoBase64 = chunk.video_base64;
                            if (chunk.audio_base64 && !shouldIgnoreTTS) {
                                audioQueue.add(chunk.audio_base64);
                            }
                            if (chunk.conversation_id) {
                                conversationId = chunk.conversation_id;
                            }
                        } catch (e) {
                            // Bỏ qua lỗi parse JSON nếu chunk chưa hoàn thiện
                        }
                    }
                    
                    if (batchStreamedContent && (params.config as any)?.onStream) {
                        (params.config as any).onStream(batchStreamedContent, false);
                    }

                    // Timeout nếu mất kết nối hoàn toàn (> 60s không nhận được cả ping) hoặc tổng thời gian > 180s
                    if (Date.now() - lastActiveTime > 60000 || Date.now() - startTime > 180000) {
                        reader.cancel();
                        throw new Error("AI Agent phản hồi quá thời gian cho phép (mất kết nối hoặc quá 3 phút).");
                    }
                }
                
                // Xử lý nốt buffer cuối
                if (buffer.trim()) {
                    try {
                        let line = buffer.trim();
                        if (line.startsWith('data: ')) line = line.slice(6).trim();
                        const chunk = JSON.parse(line);
                        if (chunk.success === false) throw new Error(chunk.error);
                        let shouldIgnoreTTS = false;
                        if (chunk.content) {
                            replyText += chunk.content;
                            const backticksCount = (replyText.match(/```/g) || []).length;
                            const isInsideMarkdownCode = (backticksCount % 2 !== 0);
                            const isRawJsonData = replyText.includes('"action": "save_to_outline"') || replyText.includes('"action":"save_to_outline"');
                            shouldIgnoreTTS = isInsideMarkdownCode || isRawJsonData;
                            
                            if (!shouldIgnoreTTS) {
                                localTTSQueue.buffer += chunk.content;
                            }
                        }
                        if (chunk.result !== undefined && !chunk.content) replyText = chunk.result;
                        if (chunk.image_base64) imageBase64 = chunk.image_base64;
                        if (chunk.video_base64) videoBase64 = chunk.video_base64;
                        if (chunk.audio_base64 && !shouldIgnoreTTS) audioQueue.add(chunk.audio_base64);
                        if (chunk.conversation_id) conversationId = chunk.conversation_id;
                    } catch (e) {}
                }
            } else {
                const data = await response.json();
                if (!data.success) throw new Error(data.error || 'AI Agent xử lý thất bại');
                replyText = data.result || '';
                imageBase64 = data.image_base64;
                videoBase64 = data.video_base64;
                audioBase64 = data.audio_base64;
                conversationId = data.conversation_id;
            }
            
            localTTSQueue.play(true);

            // Xử lý nạp ảnh từ Local Storage nếu AI Agent trả về thẻ ảnh markdown chứa đường dẫn local
            // Phục vụ cho AGY CLI trả về ![caption](/absolute/path/to/file.jpg) hoặc file:///
            const mdImageRegex = /!\[.*?\]\((file:\/\/\/|\/)([^\)]+)\)/g;
            let match;
            let hasLocalImages = false;
            
            while ((match = mdImageRegex.exec(replyText)) !== null) {
                const prefix = match[1];
                let filePath = match[2];
                if (prefix === '/') filePath = '/' + filePath; // Khôi phục lại dấu / ở đầu nếu là absolute path
                
                try {
                    // Trong môi trường Web/Electron, fetch 'file://' có thể bị chặn.
                    // Thử dùng API electron đọc file nếu có
                    let b64 = '';
                    if ((window as any).electronAPI && (window as any).electronAPI.readFileBase64) {
                        b64 = await (window as any).electronAPI.readFileBase64(filePath);
                    } else {
                        // Fallback dùng fetch (chỉ chạy trong một số cấu hình Electron lỏng lẻo)
                        const fileResp = await fetch('file://' + filePath);
                        const blob = await fileResp.blob();
                        b64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                resolve(result.split(',')[1]); // Lấy phần base64
                            };
                            reader.readAsDataURL(blob);
                        });
                    }
                    
                    if (b64) {
                        const ext = filePath.split('.').pop()?.toLowerCase() || 'jpeg';
                        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                        const dataUri = `data:${mime};base64,${b64}`;
                        replyText = replyText.replace(match[0], match[0].replace(match[1] + match[2], dataUri));
                        
                        if (!imageBase64) {
                            imageBase64 = b64; // Gán cho output parts
                        }
                        hasLocalImages = true;
                    }
                } catch (e) {
                    console.error('[AI Agent] Lỗi đọc file local từ thẻ markdown:', filePath, e);
                }
            }
            
            // Fallback tag cũ
            const oldMatch = replyText.match(/\[LOCAL_IMAGE:\s*(.+?)\]/);
            if (oldMatch && oldMatch[1]) {
                const filePath = oldMatch[1];
                replyText = replyText.replace(oldMatch[0], '').trim();
                try {
                    let b64 = '';
                    if ((window as any).electronAPI && (window as any).electronAPI.readFileBase64) {
                        b64 = await (window as any).electronAPI.readFileBase64(filePath);
                    } else {
                        const fileResp = await fetch('file://' + filePath);
                        const blob = await fileResp.blob();
                        b64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                resolve(result.split(',')[1]);
                            };
                            reader.readAsDataURL(blob);
                        });
                    }
                    if (b64) imageBase64 = b64;
                } catch (e) {
                    console.error('[AI Agent] Lỗi đọc file local cũ:', filePath, e);
                }
            }

            // [PATCH 2026-10-17] KIỂM CHỨNG SỬA ẢNH qua AI Agent: nếu Agent vẽ ảnh mới bỏ qua file gốc thì NÉM LỖI (generateContent sẽ tự chuyển tầng dự phòng giữ ảnh gốc)
            if (isImageEditAgent && imageBase64) {
                let origB64: string | null = null;
                try {
                    const contentsArrCk: any[] = Array.isArray(params.contents) ? params.contents : [params.contents];
                    const lastContentCk = contentsArrCk[contentsArrCk.length - 1];
                    const imgPartCk = lastContentCk?.parts?.find((pp: any) => pp.inlineData && pp.inlineData.data);
                    if (imgPartCk) origB64 = imgPartCk.inlineData.data;
                } catch (e) {}
                if (origB64) {
                    const ok = await this.verifyImageEditSimilarity(origB64, imageBase64);
                    if (!ok) {
                        console.warn(`[AI Agent] TỪ CHỐI kết quả sửa ảnh: ảnh trả về KHÔNG còn giữ bố cục ảnh gốc. Ném lỗi để generateContent chuyển tầng dự phòng.`);
                        throw new Error('Sửa ảnh qua AI Agent bị từ chối: kết quả không còn giống ảnh gốc (mất bố cục).');
                    }
                }
            }
            if (replyText) {
                replyText = replyText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                if (/<think>(?![\s\S]*<\/think>)/i.test(replyText)) {
                    replyText = replyText.replace(/<think>[\s\S]*$/i, '').trim();
                }
            }
            const parts: any[] = [{ text: replyText }];
            if (imageBase64) {
                parts.push({
                    inlineData: {
                        mimeType: 'image/png',
                        data: imageBase64
                    },
                    imageUrl: 'data:image/png;base64,' + imageBase64
                });
            }
            if (videoBase64) {
                parts.push({
                    inlineData: {
                        mimeType: 'video/mp4',
                        data: videoBase64
                    },
                    videoUrl: 'data:video/mp4;base64,' + videoBase64
                });
            }
            if (audioBase64) {
                parts.push({
                    inlineData: {
                        mimeType: 'audio/mp3',
                        data: audioBase64
                    },
                    audioUrl: 'data:audio/mp3;base64,' + audioBase64
                });
            }

            if (!replyText.trim() && !imageBase64 && !videoBase64) {
                throw new Error("AI Agent phản hồi rỗng hoặc chưa nhận được kết quả.");
            }

            return {
                get text() {
                    return replyText;
                },
                conversation_id: conversationId,
                candidates: [
                    {
                        content: {
                            parts: parts,
                            role: 'model'
                        }
                    }
                ]
            };
        } catch (e: any) {
            console.error('[AI Agent Error]', e);
            throw new Error(`Không thể kết nối đến máy chủ AI Agent: ${e.message}`);
        } finally {
            this.localAgentAbortController = undefined;
        }
    }

    public async generateWithUModelverse(params: GenerateContentParameters): Promise<any> {
        this.syncConfigFromStorage();
        const url = this._umodelverseUrl;
        if (!url) {
            throw new Error("Vui lòng cấu hình Base URL (Mì tôm AI) trong mục Cài đặt trước khi sử dụng.");
        }
        const key = this._umodelverseKey;
        const headers = GenaiService.buildUModelverseHeaders(url, key);

        const isImageGeneration = params.config?.responseModalities?.includes('IMAGE');
        const isVideoGeneration = params.config?.responseModalities?.includes('VIDEO');

        if (isImageGeneration && GenaiService.isAnthropicDirectUrl(url)) {
            throw new Error("Anthropic (api.anthropic.com) không cung cấp API tạo/sửa ảnh. Vui lòng dùng proxy khác hoặc nguồn Gemini cho chức năng tạo ảnh.");
        }

        if (isImageGeneration) {
            return await this.generateImageUModelverse(url, headers, params);
        } else if (isVideoGeneration) {
            let promptText = '';
            let referenceImages: any[] = [];
            
            if (params.contents && (params.contents as any).length > 0) {
                const firstContent = params.contents[0];
                if (firstContent.parts) {
                    promptText = firstContent.parts
                        .filter((p: any) => p.text)
                        .map((p: any) => p.text)
                        .join(' ');
                    
                    const imageParts = firstContent.parts.filter((p: any) => p.inlineData);
                    if (imageParts && imageParts.length > 0) {
                        for (let i = 0; i < imageParts.length; i++) {
                            const p = imageParts[i];
                            let refType = p.referenceType;
                            const partMime = String(p.inlineData?.mimeType || '').toLowerCase();
                            
                            if (!refType) {
                                refType = partMime.startsWith('video/')
                                    ? 'REFERENCE_VIDEO'
                                    : (i === 0 ? 'START_FRAME' : 'CONTROL_IMAGE');
                            } else if (refType === 'first_frame') {
                                refType = 'START_FRAME';
                            } else if (refType === 'last_frame') {
                                refType = 'END_FRAME';
                            } else if (refType === 'CHARACTER' || refType === 'reference_image') {
                                refType = 'CHARACTER_REFERENCE';
                            } else if (refType === 'reference_video') {
                                refType = 'REFERENCE_VIDEO';
                            }

                            referenceImages.push({
                                referenceType: refType,
                                characterName: p.characterName,
                                mimeType: p.inlineData?.mimeType,
                                image: {
                                    imageBytes: p.inlineData.data
                                }
                            });
                        }
                    }
                }
            }

            const overrideModel = params.model;
            const configRatio = (params.config as any)?.aspectRatio || '16:9';
            const configDuration = (params.config as any)?.duration !== undefined
                ? (params.config as any).duration
                : 5;
            const configResolution = (params.config as any)?.resolution || undefined;
            const videoMeta: { url?: string | null } = {};
            const b64 = await this.generateVideoUModelverse(
                promptText,
                configRatio,
                referenceImages,
                configDuration,
                undefined,
                overrideModel,
                configResolution,
                videoMeta
            );
            
            return {
                video: {
                    base64: b64,
                    url: videoMeta.url || null
                }
            };
        } else {
            return await this.generateChatUModelverse(url, headers, params);
        }
    }

    private async generateChatUModelverse(url: string, headers: any, params: GenerateContentParameters): Promise<any> {
        let hasAudio = false;
        if (params.contents && Array.isArray(params.contents)) {
            for (const content of params.contents) {
                const parts = (content as any)?.parts;
                if (parts && Array.isArray(parts)) {
                    if (parts.some((p: any) => p.inlineData?.mimeType?.startsWith('audio/'))) {
                        hasAudio = true;
                        break;
                    }
                }
            }
        }

        let overrideModel = params.model;
        if (!hasAudio && overrideModel && (overrideModel.includes('gemini') || overrideModel === 'agent')) {
            overrideModel = null;
        }
        let targetModel = overrideModel || this._umodelverseChatModel || (hasAudio ? 'gemini-3.8-flash' : 'gpt-4o');
        if (targetModel === 'agent') {
            targetModel = this._umodelverseChatModel || (hasAudio ? 'gemini-3.8-flash' : 'gpt-4o');
        }
        const isAnthropicDirect = GenaiService.isAnthropicDirectUrl(url);
        if (isAnthropicDirect) {
            if (hasAudio) {
                throw new Error("Anthropic (api.anthropic.com) không hỗ trợ đầu vào âm thanh. Vui lòng dùng proxy khác hoặc nguồn Gemini cho chức năng này.");
            }
            // API gốc Anthropic chỉ phục vụ model Claude: model không phải Claude thì dùng model chat đã cấu hình
            if (!targetModel.toLowerCase().includes('claude')) {
                targetModel = this._umodelverseChatModel;
            }
            if (!targetModel || !targetModel.toLowerCase().includes('claude')) {
                throw new Error("Đang dùng Anthropic (api.anthropic.com): vui lòng nhập model Claude hợp lệ vào ô Model chat của Mì Tôm AI trong Cài đặt.");
            }
        }
        const apiBase = GenaiService.resolveApiBase(url);
        let config: TextModelConfig = isAnthropicDirect
            ? { ...getTextModelConfig('claude'), apiFormat: 'anthropic', endpointOverride: '/messages' }
            : getTextModelConfig(targetModel);
        // Proxy đã xác nhận không có /messages: model Claude đi theo chuẩn OpenAI /chat/completions
        const canFallbackToOpenAi = !isAnthropicDirect && config.apiFormat === 'anthropic';
        if (canFallbackToOpenAi && GenaiService._claudeOpenAiFallbackBases.has(apiBase.versioned)) {
            config = { apiFormat: 'openai', thinkingControl: 'reasoning_effort' };
        }

        const messages: any[] = [];



        // Xử lý contents
        if (params.contents) {
            if (typeof params.contents === 'string') {
                messages.push({ role: 'user', content: params.contents });
            } else if (Array.isArray(params.contents)) {
                for (const content of params.contents) {
                    const role = (content as any).role === 'model' ? 'assistant' : 'user';
                    const parts = (content as any).parts;

                    if (parts && parts.length === 1 && parts[0].text && !parts[0].inlineData) {
                        messages.push({ role, content: parts[0].text });
                    } else if (parts && parts.length > 0) {
                        const mappedParts = parts.map((p: any) => {
                            if (p.inlineData) {
                                const mimeType = p.inlineData.mimeType || '';
                                if (mimeType.startsWith('audio/')) {
                                    let format = 'mp3';
                                    if (mimeType.includes('wav')) format = 'wav';
                                    return {
                                        type: 'input_audio',
                                        input_audio: {
                                            data: p.inlineData.data,
                                            format: format
                                        }
                                    };
                                } else if (config.apiFormat === 'anthropic') {
                                    // Chuẩn Anthropic: PDF dùng block "document", ảnh dùng block "image" (base64)
                                    if (mimeType === 'application/pdf') {
                                        return {
                                            type: 'document',
                                            source: { type: 'base64', media_type: mimeType, data: p.inlineData.data }
                                        };
                                    }
                                    return {
                                        type: 'image',
                                        source: { type: 'base64', media_type: mimeType || 'image/png', data: p.inlineData.data }
                                    };
                                } else {
                                    return {
                                        type: 'image_url',
                                        image_url: { url: `data:${mimeType};base64,${p.inlineData.data}` }
                                    };
                                }
                            }
                            return { type: 'text', text: p.text || '' };
                        });
                        messages.push({ role, content: mappedParts });
                    }
                }
            }
        }


        // Endpoint tương đối so với gốc đã có phiên bản (VD: .../v1, .../v4, .../v1beta/openai)
        let endpointPath = (config.endpointOverride || '/chat/completions').replace(/^\/v1(?=\/)/i, '');
        if (endpointPath.includes('{model}')) {
            endpointPath = endpointPath.replace('{model}', targetModel);
        }
        let body: any = {};

        // Xử lý systemInstruction chung cho các format OpenAI / Claude / Gemini
        let sysContent = '';
        if (params.config && params.config.systemInstruction) {
            if (typeof params.config.systemInstruction === 'string') {
                sysContent = params.config.systemInstruction;
            } else if ((params.config.systemInstruction as any).parts) {
                sysContent = (params.config.systemInstruction as any).parts.map((p: any) => p.text).join('\n');
            }
        }

        if (this.aiAgentCustomInstructions) {
            sysContent += `\n\n--- HƯỚNG DẪN DÀNH CHO AI AGENT (CONTEXT TỪ MÀN HÌNH HIỆN TẠI) ---\n${this.aiAgentCustomInstructions}\n--- HẾT HƯỚNG DẪN ---`;
        }

        const lowerTargetModel = targetModel.toLowerCase();
        const thinkingCacheKey = `${apiBase.versioned}|${lowerTargetModel}`;
        const directDirective =
            'QUAN TRỌNG: Không suy luận trung gian dài dòng. Hãy xuất trực tiếp kết quả cuối cùng đúng định dạng yêu cầu ngay lập tức.';
        const shouldDisableThinking =
            (params.config as any)?.disableThinking === true ||
            GenaiService._forceDisableThinkingModels.has(thinkingCacheKey);
        const canSendThinkingParam = !GenaiService._unsupportedThinkingParamKeys.has(thinkingCacheKey);

        // Chèn hướng dẫn trả lời trực tiếp cho model/proxy đã biết là không nhận tham số điều khiển suy luận nhưng từng cạn token hoặc cần tắt suy luận
        if (shouldDisableThinking && !canSendThinkingParam) {
            sysContent = sysContent ? `${directDirective}\n\n${sysContent}` : directDirective;
        }

        // Hàm gắn cấu hình tắt / giảm suy luận trung gian phổ quát cho TẤT CẢ các dòng model & định dạng API
        const applyThinkingControlToBody = (reqBody: any, forceForAnyModel: boolean): void => {
            if (!canSendThinkingParam) return;
            if (config.apiFormat === 'gemini') {
                reqBody.generationConfig = reqBody.generationConfig || {};
                reqBody.generationConfig.thinkingConfig = {
                    thinkingBudget: lowerTargetModel.includes('pro') ? 1024 : 0
                };
                return;
            }
            if (config.apiFormat === 'anthropic') {
                delete reqBody.thinking;
                if (forceForAnyModel || lowerTargetModel.includes('thinking')) {
                    reqBody.thinking = { type: 'disabled' };
                }
                return;
            }

            // Chuẩn OpenAI (/chat/completions) - hỗ trợ mọi hệ sinh thái model
            const controlMode = config.thinkingControl || 'reasoning_effort';
            if (controlMode === 'thinking_object') {
                reqBody.thinking = { type: 'disabled' };
            } else if (controlMode === 'enable_thinking') {
                reqBody.enable_thinking = false;
            } else {
                // Đối với reasoning_effort: gửi ngay cho các model có tư duy (GPT-5, o1/o3/o4, Gemini 2.5/3.x, Grok, DeepSeek-R1, Magistral, Nemotron...)
                // hoặc gửi phổ quát cho MỌI model (kể cả model tuỳ chỉnh / router alias) khi forceForAnyModel=true hoặc đã học trong _forceDisableThinkingModels
                const isKnownReasoningEffortModel =
                    forceForAnyModel ||
                    GenaiService._forceDisableThinkingModels.has(thinkingCacheKey) ||
                    Boolean(config.useMaxCompletionTokens) ||
                    lowerTargetModel.includes('gpt-5') ||
                    lowerTargetModel.includes('o1') ||
                    lowerTargetModel.includes('o3') ||
                    lowerTargetModel.includes('o4') ||
                    lowerTargetModel.includes('gemini-2.5') ||
                    lowerTargetModel.includes('gemini-3') ||
                    lowerTargetModel.includes('grok') ||
                    lowerTargetModel.includes('r1') ||
                    lowerTargetModel.includes('reasoner') ||
                    lowerTargetModel.includes('thinking') ||
                    lowerTargetModel.includes('magistral') ||
                    lowerTargetModel.includes('nemotron');
                if (isKnownReasoningEffortModel) {
                    reqBody.reasoning_effort = 'low';
                }
            }
        };

        const useMaxCompletionTokens =
            Boolean(config.useMaxCompletionTokens) ||
            lowerTargetModel.includes('gpt-5') ||
            lowerTargetModel.includes('o1') ||
            lowerTargetModel.includes('o3') ||
            lowerTargetModel.includes('o4') ||
            lowerTargetModel.includes('deepseek-reasoner');
        const isLegacyDoubao4k = lowerTargetModel.includes('doubao') && lowerTargetModel.includes('4k');
        const explicitMaxTokens =
            params.config?.maxOutputTokens && params.config.maxOutputTokens !== 8192
                ? params.config.maxOutputTokens
                : undefined;

        if (config.apiFormat === 'gemini') {
            body = {
                contents: params.contents,
                generationConfig: {
                    temperature: params.config?.temperature,
                    topP: params.config?.topP,
                    ...(explicitMaxTokens ? { maxOutputTokens: explicitMaxTokens } : {})
                }
            };
            if (sysContent) {
                body.systemInstruction = { parts: [{ text: sysContent }] };
            }
            if ((params as any).tools) {
                body.tools = (params as any).tools;
            }
            if (shouldDisableThinking) {
                applyThinkingControlToBody(body, false);
            }
            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        } else if (config.apiFormat === 'anthropic') {
            body = {
                model: targetModel,
                messages: messages,
                // Không khóa cứng ở 8192 để các model Claude có extended thinking đủ hạn mức sinh câu trả lời; nếu model cũ giới hạn 8192 sẽ tự lùi trong executePostRequest
                max_tokens: explicitMaxTokens || 16384,
                temperature: params.config?.temperature,
                // Các model Claude mới không cho gửi đồng thời temperature và top_p
                top_p: params.config?.temperature !== undefined ? undefined : params.config?.topP
            };
            if (sysContent) {
                body.system = sysContent;
            }
            if (shouldDisableThinking) {
                applyThinkingControlToBody(body, false);
            }
            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        } else {
            // Chuẩn OpenAI mặc định: KHÔNG áp cứng max_tokens=8192 lên bất kỳ model nào để tránh nghẽn suy luận (reasoning + content) trên mọi dòng model
            if (sysContent) {
                messages.unshift({ role: 'system', content: sysContent });
            }
            body = {
                model: targetModel,
                messages: messages,
                temperature: params.config?.temperature,
                top_p: params.config?.topP,
            };

            if (explicitMaxTokens) {
                if (useMaxCompletionTokens) {
                    body.max_completion_tokens = explicitMaxTokens;
                } else {
                    body.max_tokens = isLegacyDoubao4k ? Math.min(explicitMaxTokens, 4096) : explicitMaxTokens;
                }
            } else if (isLegacyDoubao4k) {
                body.max_tokens = 4096;
            }

            if (shouldDisableThinking) {
                applyThinkingControlToBody(body, false);
            }

            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        }

        const executePostRequest = async (
            requestBody: any
        ): Promise<{ response: Response; data: any; redirected?: any }> => {
            let res = await fetch(`${apiBase.versioned}${endpointPath}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody, null, 2)
            });

            // Proxy không có /messages cho Claude => ghi nhớ và gửi lại theo chuẩn OpenAI /chat/completions
            if (canFallbackToOpenAi && config.apiFormat === 'anthropic' && (res.status === 404 || res.status === 405)) {
                console.warn(`[UModelverse Chat] ${apiBase.versioned}${endpointPath} trả về ${res.status}, chuyển model ${targetModel} sang chuẩn OpenAI /chat/completions.`);
                GenaiService._claudeOpenAiFallbackBases.add(apiBase.versioned);
                const redirected = await this.generateChatUModelverse(url, headers, params);
                return { response: res, data: {}, redirected };
            }

            let txt = await res.text();
            let parsedData: any = {};
            try {
                parsedData = txt ? JSON.parse(txt) : {};
            } catch {
                parsedData = {};
            }

            // Nếu proxy báo HTTP 400/422 khi gửi kèm tham số điều khiển suy luận hoặc max_tokens cao (> 8192), tự động hạ/lược bỏ và gửi lại ngay
            const hasThinkingControlParam =
                requestBody.thinking !== undefined ||
                requestBody.enable_thinking !== undefined ||
                requestBody.reasoning_effort !== undefined ||
                Boolean(requestBody.generationConfig?.thinkingConfig);
            const hasElevatedTokenLimit =
                (typeof requestBody.max_tokens === 'number' && requestBody.max_tokens > 8192) ||
                (typeof requestBody.max_completion_tokens === 'number' && requestBody.max_completion_tokens > 8192) ||
                (typeof requestBody.generationConfig?.maxOutputTokens === 'number' && requestBody.generationConfig.maxOutputTokens > 8192);

            if ((res.status === 400 || res.status === 422) && (hasThinkingControlParam || hasElevatedTokenLimit)) {
                const fallbackBody = JSON.parse(JSON.stringify(requestBody));
                if (hasThinkingControlParam) {
                    GenaiService._unsupportedThinkingParamKeys.add(thinkingCacheKey);
                    delete fallbackBody.thinking;
                    delete fallbackBody.enable_thinking;
                    delete fallbackBody.reasoning_effort;
                    if (fallbackBody.generationConfig) {
                        delete fallbackBody.generationConfig.thinkingConfig;
                    }
                }
                if (hasElevatedTokenLimit) {
                    if (config.apiFormat === 'anthropic') {
                        fallbackBody.max_tokens = 8192;
                    } else {
                        delete fallbackBody.max_tokens;
                        delete fallbackBody.max_completion_tokens;
                        if (fallbackBody.generationConfig) {
                            delete fallbackBody.generationConfig.maxOutputTokens;
                        }
                    }
                }
                res = await fetch(`${apiBase.versioned}${endpointPath}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(fallbackBody, null, 2)
                });
                txt = await res.text();
                try {
                    parsedData = txt ? JSON.parse(txt) : {};
                } catch {
                    parsedData = {};
                }
            }

            return { response: res, data: parsedData };
        };

        // Lọc sạch thẻ <think>...</think> (DeepSeek-R1, QwQ, Qwen3, MiniMax, Hunyuan, vLLM/Ollama...) và phát hiện trường hợp đứt gãy ngay trong thẻ <think>
        const sanitizeReplyContent = (
            rawContent: string
        ): { cleanedText: string; truncatedInsideThinkTag: boolean } => {
            if (!rawContent) {
                return { cleanedText: '', truncatedInsideThinkTag: false };
            }
            const withoutClosedThink = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (/<think>(?![\s\S]*<\/think>)/i.test(withoutClosedThink)) {
                const beforeOpenThink = withoutClosedThink.replace(/<think>[\s\S]*$/i, '').trim();
                return {
                    cleanedText: beforeOpenThink,
                    truncatedInsideThinkTag: !beforeOpenThink
                };
            }
            return { cleanedText: withoutClosedThink, truncatedInsideThinkTag: false };
        };

        const extractReplyFromData = (
            payload: any
        ): {
            replyText: string;
            finishReason: string;
            hasToolCalls: boolean;
            truncatedInsideThinkTag: boolean;
        } => {
            if (config.apiFormat === 'gemini') {
                const candidate = payload.candidates?.[0];
                const parts = candidate?.content?.parts || [];
                const rawJoined = parts
                    .filter((p: any) => p?.text && !p?.thought)
                    .map((p: any) => p.text)
                    .join('');
                const sanitized = sanitizeReplyContent(rawJoined);
                return {
                    replyText: sanitized.cleanedText,
                    finishReason: candidate?.finishReason || '',
                    hasToolCalls: parts.some((p: any) => Boolean(p?.functionCall)),
                    truncatedInsideThinkTag: sanitized.truncatedInsideThinkTag
                };
            }
            if (config.apiFormat === 'anthropic') {
                const blocks = Array.isArray(payload.content) ? payload.content : [];
                const rawJoined = blocks
                    .filter((c: any) => c?.type === 'text')
                    .map((c: any) => c.text || '')
                    .join('');
                const sanitized = sanitizeReplyContent(rawJoined);
                return {
                    replyText: sanitized.cleanedText,
                    finishReason: payload.stop_reason || '',
                    hasToolCalls: blocks.some((c: any) => c?.type === 'tool_use'),
                    truncatedInsideThinkTag: sanitized.truncatedInsideThinkTag
                };
            }
            const choice = payload.choices?.[0];
            const rawContent =
                typeof choice?.message?.content === 'string'
                    ? choice.message.content
                    : Array.isArray(choice?.message?.content)
                    ? choice.message.content
                          .filter((c: any) => c?.type === 'text' || typeof c?.text === 'string')
                          .map((c: any) => c.text || '')
                          .join('')
                    : '';
            const sanitized = sanitizeReplyContent(rawContent);
            return {
                replyText: sanitized.cleanedText,
                finishReason: choice?.finish_reason || '',
                hasToolCalls: Boolean(choice?.message?.tool_calls?.length),
                truncatedInsideThinkTag: sanitized.truncatedInsideThinkTag
            };
        };

        let { response, data, redirected } = await executePostRequest(body);
        if (redirected) {
            return redirected;
        }

        if (!response.ok) {
            const errMsg = (data?.error && (data.error.message || (typeof data.error === 'string' ? data.error : ''))) || data?.message;
            throw new Error(errMsg || `HTTP Error: ${response.status} (${apiBase.versioned}${endpointPath})`);
        }

        let { replyText, finishReason, hasToolCalls, truncatedInsideThinkTag } = extractReplyFromData(data);
        const isLengthFinish = (reason: string) =>
            reason === 'length' || reason === 'max_tokens' || reason === 'MAX_TOKENS';

        // Cơ chế tự phục hồi phổ quát cho TẤT CẢ các model khi cạn token lúc suy luận (content rỗng hoặc bị cắt ngang giữa thẻ <think>)
        if (((isLengthFinish(finishReason) && !replyText) || truncatedInsideThinkTag) && !hasToolCalls) {
            console.warn(`[UModelverse Chat] Model ${targetModel} cạn token khi suy luận (finish_reason=${finishReason}). Tự động gửi lại ở chế độ trả lời trực tiếp...`);
            const retryBody = JSON.parse(JSON.stringify(body));

            if (config.apiFormat === 'gemini') {
                const prevSys = retryBody.systemInstruction?.parts?.map((p: any) => p.text).join('\n') || '';
                retryBody.systemInstruction = {
                    parts: [{ text: prevSys ? `${directDirective}\n\n${prevSys}` : directDirective }]
                };
                retryBody.generationConfig = retryBody.generationConfig || {};
                delete retryBody.generationConfig.maxOutputTokens;
                applyThinkingControlToBody(retryBody, true);
            } else if (config.apiFormat === 'anthropic') {
                retryBody.system = retryBody.system ? `${directDirective}\n\n${retryBody.system}` : directDirective;
                retryBody.max_tokens = Math.max(retryBody.max_tokens || 8192, 16384);
                applyThinkingControlToBody(retryBody, true);
            } else {
                if (Array.isArray(retryBody.messages)) {
                    const sysMsg = retryBody.messages.find((m: any) => m.role === 'system');
                    if (sysMsg && typeof sysMsg.content === 'string') {
                        if (!sysMsg.content.includes(directDirective)) {
                            sysMsg.content = `${directDirective}\n\n${sysMsg.content}`;
                        }
                    } else {
                        retryBody.messages.unshift({ role: 'system', content: directDirective });
                    }
                }
                delete retryBody.max_tokens;
                delete retryBody.max_completion_tokens;

                applyThinkingControlToBody(retryBody, true);

                if (useMaxCompletionTokens) {
                    retryBody.max_completion_tokens = 16384;
                } else if (!isLegacyDoubao4k) {
                    retryBody.max_tokens = 16384;
                }
            }

            const retryResult = await executePostRequest(retryBody);
            if (retryResult.response.ok) {
                data = retryResult.data;
                const extractedRetry = extractReplyFromData(data);
                replyText = extractedRetry.replyText;
                finishReason = extractedRetry.finishReason;
                hasToolCalls = extractedRetry.hasToolCalls;
                truncatedInsideThinkTag = extractedRetry.truncatedInsideThinkTag;

                // Ghi nhớ cho MỌI model (không giới hạn riêng họ model nào) để các lượt kế tiếp tự động tắt suy luận dài dòng ngay từ đầu
                if (replyText) {
                    GenaiService._forceDisableThinkingModels.add(thinkingCacheKey);
                }
            }
        }

        if (((isLengthFinish(finishReason) && !replyText) || truncatedInsideThinkTag) && !hasToolCalls) {
            throw new Error(`Model ${targetModel} đã đạt giới hạn độ dài (max tokens) trong quá trình suy luận và bị ngắt giữa chừng. Vui lòng tăng giới hạn token trên proxy hoặc chọn model khác.`);
        }

        return {
            get text() {
                return replyText;
            },
            candidates: [
                {
                    content: {
                        parts: [{ text: replyText }],
                        role: 'model'
                    }
                }
            ],
            usageMetadata: {
                promptTokenCount: data.usage?.prompt_tokens ?? data.usage?.input_tokens,
                candidatesTokenCount: data.usage?.completion_tokens ?? data.usage?.output_tokens,
                totalTokenCount: data.usage?.total_tokens ?? (
                    data.usage?.input_tokens !== undefined ? (data.usage.input_tokens + (data.usage.output_tokens || 0)) : undefined
                )
            }
        };
    }

    // [PATCH 2026-10-17] BỘ KIỂM CHỨNG SỬA ẢNH: so sánh ảnh gốc và ảnh AI trả về bằng "dấu vân tay" ảnh (downsample 8x8 grayscale + khoảng cách Hamming).
    // Mục đích: chặn proxy/model trả về HTTP 200 "thành công" nhưng lặng lẽ VẼ ẢNH MỚI hoàn toàn (bỏ qua file ảnh gốc đính kèm).
    // Trả về true nếu ảnh kết quả vẫn giữ được bố cục/tông màu tổng thể của ảnh gốc (đủ tương đồng) => chấp nhận.
    private async verifyImageEditSimilarity(originalB64: string, resultB64: string, maxDistance = 26): Promise<boolean> {
        try {
            const loadDims = (b64: string): Promise<{ w: number, h: number } | null> => new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
                img.onerror = () => resolve(null);
                img.src = 'data:image/png;base64,' + b64;
            });
            const drawGray = (srcB64: string): Promise<number[]> => new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 8; canvas.height = 8;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve([]); return; }
                    ctx.drawImage(img, 0, 0, 8, 8);
                    const d = ctx.getImageData(0, 0, 8, 8).data;
                    const gray: number[] = [];
                    for (let i = 0; i < 64; i++) {
                        gray.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
                    }
                    resolve(gray);
                };
                img.onerror = () => resolve([]);
                img.src = 'data:image/png;base64,' + srcB64;
            });
            const oDims = await loadDims(originalB64);
            if (!oDims || oDims.w === 0 || oDims.h === 0) return true; // Không đọc được ảnh gốc => không chặn
            const rDims = await loadDims(resultB64);
            if (!rDims || rDims.w === 0 || rDims.h === 0) return false;
            const gA = await drawGray(originalB64);
            const gB = await drawGray(resultB64);
            if (gA.length !== 64 || gB.length !== 64) return true; // Không đo được => không chặn
            const avgA = gA.reduce((a, b) => a + b, 0) / 64;
            const avgB = gB.reduce((a, b) => a + b, 0) / 64;
            let dist = 0;
            for (let i = 0; i < 64; i++) {
                const bitA = gA[i] >= avgA ? 1 : 0;
                const bitB = gB[i] >= avgB ? 1 : 0;
                if (bitA !== bitB) dist++;
            }
            console.log(`[ImageEdit Verify] Khoảng cách tương đồng ảnh gốc vs kết quả: ${dist}/64 (ngưỡng chặn ${maxDistance})`);
            return dist <= maxDistance;
        } catch (e) {
            console.warn('[ImageEdit Verify] Lỗi kiểm chứng (không chặn):', e);
            return true;
        }
    }

    private async generateImageUModelverse(url: string, headers: any, params: GenerateContentParameters): Promise<any> {
        let promptText = '';
        
        const isImageEdit = (params.config as any)?.isImageEdit === true;
        const bypassModelOverride = (params.config as any)?.bypassModelOverride === true || isImageEdit;
        let overrideModel = params.model;
        if (!isImageEdit && (overrideModel === 'gemini-3-pro-image' || overrideModel === 'imagen-3.0-generate-002' || overrideModel === 'agent')) {
            overrideModel = null;
        }
        // [PATCH 2026-10-17] SỬA ẢNH: tôn trọng model do editor chỉ định (bypassModelOverride) — không đè bằng model text-to-image của proxy
        let model = (bypassModelOverride && overrideModel) ? overrideModel : (this._umodelverseImageModel || overrideModel || 'dall-e-3');
        let referenceBase64: string | null = null;
        if (params.contents && (params.contents as any).length > 0) {
            const firstContent = params.contents[0];
            if (firstContent.parts) {
                // Chỉ trích xuất phần text, bỏ qua phần reference images nhị phân (inlineData) để tránh lỗi định dạng prompt
                promptText = firstContent.parts
                    .filter((p: any) => p.text)
                    .map((p: any) => p.text)
                    .join(' ');

                // Trích xuất ảnh gốc (nếu có) để gửi cho các model hỗ trợ Image-to-Image qua chuẩn OpenAI
                const imgPart = firstContent.parts.find((p: any) => p.inlineData);
                if (imgPart && imgPart.inlineData) {
                    // Định dạng base64 đúng chuẩn OpenAI/Astraflow có thể yêu cầu 'data:image/png;base64,...'
                    // Ở đây phần data chỉ là chuỗi base64 thuần (từ character-dialog)
                    referenceBase64 = imgPart.inlineData.data;
                }
            }
        }

        // Tự động map aspect ratio (tỉ lệ màn hình) sang size chuẩn OpenAI-compatible
        const configRatio = (params.config as any)?.aspectRatio || (params.config as any)?.imageConfig?.aspectRatio;
        let size = (params.config as any)?.imageConfig?.imageSize || '1024x1024';

        let activeModel = model;
        
        let ratioStr = '16:9';
        if (configRatio) {
            ratioStr = String(configRatio).trim();
            const isDalle = activeModel.includes('dall-e');
            
            if (['16:9', '3:2', '4:3', '21:9', '5:4', '8:1', '4:1'].includes(ratioStr)) {
                size = isDalle ? '1792x1024' : '1920x1080'; // Chiều ngang rộng (Landscape)
            } else if (['9:16', '2:3', '3:4', '1:4', '4:5', '1:8'].includes(ratioStr)) {
                size = isDalle ? '1024x1792' : '1080x1920'; // Chiều dọc cao (Portrait)
            } else if (ratioStr === '1:1') {
                size = '1024x1024'; // Vuông
            }
        }

        // Auto-correct model names for UModelverse / Astraflow
        if (activeModel === 'gemini-3-pro-image') {
            activeModel = 'gemini-3-pro-image-preview'; // Sửa theo chuẩn tên phổ biến nhất của Google
        }

        // --- XỬ LÝ RIÊNG CHO GEMINI MODELS BẰNG GEMINI COMPATIBLE INTERFACE ---
        if (activeModel.includes('gemini')) {
            console.log(`[UModelverse Image] Dùng Gemini Compatible Interface cho model: ${activeModel}`);

            // Proxy UModelverse dùng đường dẫn /v1beta/models/{model}:generateContent
            // Base URL là .../v1 nên cần bỏ /v1 rồi thêm /v1beta/models/...
            const geminiUrl = `${GenaiService.resolveApiBase(url).root}/v1beta/models/${activeModel}:generateContent`;

            try {
                // Keep all original parts (text and any attached images)
                const originalParts = params.contents?.[0]?.parts || [{ text: promptText }];
                
                const geminiBody: any = {
                    contents: [
                        {
                            role: 'user',
                            parts: originalParts
                        }
                    ]
                };

                // Không bật google_search cho image editing để tránh can thiệp
                if (!isImageEdit) {
                    geminiBody.tools = [{ google_search: {} }];
                }

                // Cập nhật generationConfig theo tài liệu mới nhất của proxy
                // [PATCH 2026-10-17] SỬA ẢNH: editor gửi imageSize dạng pixel (VD 1920x1080) => quy đổi sang định mức chuẩn Google (1K/2K/4K)
                let outImageSize = '1K';
                try {
                    const rawSize = ((params.config as any)?.imageConfig?.imageSize || '') as string;
                    const rawRes = String((params.config as any)?.resolution || '').trim().toLowerCase();
                    const pxMatch = String(rawSize).match(/^(\d+)x(\d+)$/);
                    if (pxMatch) {
                        const maxPx = Math.max(parseInt(pxMatch[1], 10), parseInt(pxMatch[2], 10));
                        outImageSize = maxPx >= 3500 ? '4K' : (maxPx >= 1900 ? '2K' : '1K');
                    } else if (['1K', '2K', '4K'].includes(String(rawSize).toUpperCase())) {
                        outImageSize = String(rawSize).toUpperCase();
                    } else if (rawRes === '4k' || rawRes === '2160p') {
                        outImageSize = '4K';
                    } else if (rawRes === '1080p') {
                        outImageSize = '2K';
                    }
                } catch (e) {}
                geminiBody.generationConfig = {
                    responseModalities: ["TEXT", "IMAGE"],
                    imageConfig: { imageSize: outImageSize }
                };

                // Nếu user có setting configRatio
                if (configRatio) {
                    geminiBody.generationConfig.imageConfig.aspectRatio = String(configRatio).trim();
                }

                // Proxy Gemini endpoint hỗ trợ cả Authorization: Bearer và x-goog-api-key
                const apiKey = (headers['Authorization'] || '').replace('Bearer ', '').trim();
                const geminiHeaders = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'x-goog-api-key': apiKey
                };

                const geminiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: geminiHeaders,
                    body: JSON.stringify(geminiBody)
                });

                const geminiResponseText = await geminiResponse.text();
                let geminiData: any = {};
                try {
                    geminiData = JSON.parse(geminiResponseText);
                } catch (e) {
                    throw new Error(`Proxy trả về dữ liệu không hợp lệ (Mã lỗi ${geminiResponse.status})`);
                }

                if (geminiResponse.ok && geminiData.candidates && geminiData.candidates.length > 0) {
                    console.log(`[UModelverse Image] Tạo ảnh thành công bằng Gemini Compatible Interface!`);
                    // [PATCH 2026-10-17] KIỂM CHỨNG SỬA ẢNH: chặn proxy trả về ảnh vẽ mới hoàn toàn dù HTTP 200
                    if (isImageEdit && referenceBase64 && geminiData.candidates?.[0]?.content?.parts) {
                        const rPart = geminiData.candidates[0].content.parts.find((pp: any) => pp.inlineData && pp.inlineData.data);
                        if (rPart) {
                            const ok = await this.verifyImageEditSimilarity(referenceBase64, rPart.inlineData.data);
                            if (!ok) {
                                console.warn(`[UModelverse Image] TỪ CHỐI kết quả sửa ảnh: ảnh trả về KHÔNG còn giữ bố cục ảnh gốc (proxy đã vẽ ảnh mới). Ném lỗi để generateContent chuyển tầng dự phòng.`);
                                throw new Error('Sửa ảnh qua Gemini Interface bị từ chối: kết quả không còn giống ảnh gốc (mất bố cục).');
                            }
                        }
                    }
                    return geminiData;
                } else {
                    const errMsg = geminiData?.error?.message || geminiResponseText;
                    console.warn(`[UModelverse Image] Gemini Compatible Interface thất bại (mã ${geminiResponse.status}):`, errMsg);
                    if (isImageEdit) {
                        // Với tác vụ chỉnh sửa ảnh trực tiếp, nếu proxy không thực hiện được qua Gemini Compatible Interface thì ném lỗi ngay
                        // để hệ thống tự động fallback sang Tầng 3 (Gemini Studio API Key trực tiếp của Google) với inlineData gốc,
                        // TUYỆT ĐỐI KHÔNG fallback sang OpenAI text-to-image /images/generations vì sẽ làm mất ảnh gốc và sinh ra người/nội dung mới hoàn toàn!
                        throw new Error(`UModelverse Gemini Image Edit thất bại (Mã lỗi ${geminiResponse.status}): ${errMsg}`);
                    }
                    // Nếu proxy UModelverse không hỗ trợ endpoint Gemini Native /v1beta/models, chuyển activeModel sang model hình ảnh Mì Tôm AI (hoặc dall-e-3) để tiếp tục thử OpenAI format
                    if (this._umodelverseImageModel && this._umodelverseImageModel !== activeModel) {
                        activeModel = this._umodelverseImageModel;
                    } else if (activeModel.includes('gemini')) {
                        activeModel = this._umodelverseImageModel || 'dall-e-3';
                    }
                }
            } catch (e: any) {
                console.warn(`[UModelverse Image] Lỗi khi gọi Gemini Interface:`, e.message);
                if (isImageEdit) {
                    // Ném lỗi để fallback sang Gemini Studio trực tiếp bảo đảm giữ nguyên ảnh gốc
                    throw e;
                }
                if (this._umodelverseImageModel && this._umodelverseImageModel !== activeModel) {
                    activeModel = this._umodelverseImageModel;
                } else if (activeModel.includes('gemini')) {
                    activeModel = this._umodelverseImageModel || 'dall-e-3';
                }
            }
        }
        // --- KẾT THÚC XỬ LÝ GEMINI ---

        let b64DataUris: string[] = [];
        if (params.contents && params.contents[0] && params.contents[0].parts) {
            const imgParts = params.contents[0].parts.filter((p: any) => p.inlineData && p.inlineData.data);
            for (const imgPart of imgParts) {
                b64DataUris.push(`data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`);
            }
        }

        const candidateRequests: any[] = [];

        if (b64DataUris.length > 0) {
            candidateRequests.push(
                // 1. Chuẩn OpenAI Image-to-Image / Edit phổ biến nhất (dùng size, prompt, ref_image, image)
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    image: b64DataUris[0],
                    ref_image: b64DataUris[0]
                },
                // 2. Chuẩn chỉ dùng 'image' đơn lẻ
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    image: b64DataUris[0]
                },
                // 3. Chuẩn chỉ dùng 'ref_image' đơn lẻ
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    ref_image: b64DataUris[0]
                },
                // 4. Chuẩn tối giản chỉ image tham chiếu + prompt
                {
                    model: activeModel,
                    prompt: promptText,
                    image: b64DataUris[0]
                },
                // 5. Chuẩn tối giản chỉ ref_image tham chiếu + prompt
                {
                    model: activeModel,
                    prompt: promptText,
                    ref_image: b64DataUris[0]
                },
                // 6. Chuẩn OpenAI tiêu chuẩn bỏ image tham chiếu nếu proxy chỉ hỗ trợ text2image (chỉ cho phép khi KHÔNG PHẢI tác vụ sửa ảnh isImageEdit)
                ...(!isImageEdit ? [{
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size
                }] : []),
                // 7. Chuẩn kèm aspect_ratio nếu model đặc thù yêu cầu (đặt ở cuối để ưu tiên chuẩn không có aspect_ratio trước)
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    aspect_ratio: ratioStr,
                    image: b64DataUris[0]
                }
            );
        } else {
            candidateRequests.push(
                // 1. Chuẩn OpenAI tiêu chuẩn: model, prompt, n, size (không có aspect_ratio)
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size
                },
                // 2. Chuẩn có aspect_ratio cho các model sinh ảnh đặc thù
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    aspect_ratio: ratioStr
                }
            );
        }

        // Option: Format siêu tối giản (bỏ n, size, image) để bypass các strict validation của model khác (chỉ khi không phải sửa ảnh)
        if (!isImageEdit) {
            candidateRequests.push({
                model: activeModel,
                prompt: promptText
            });
        }

        let lastErrorMsg = '';
        let lastResponseStatus = 200;
        let data: any = null;

        console.log(`[UModelverse Image] Bắt đầu quá trình tạo ảnh với model = ${activeModel}`);

        // --- SỬA ẢNH THEO CHUẨN OPENAI: POST /images/edits (multipart/form-data, ảnh gốc gửi dạng file) ---
        if (isImageEdit && b64DataUris.length > 0) {
            try {
                const firstImg = params.contents![0].parts!.find((p: any) => p.inlineData && p.inlineData.data) as any;
                const mime = firstImg.inlineData.mimeType || 'image/png';
                const bin = atob(firstImg.inlineData.data);
                const bytes = new Uint8Array(bin.length);
                for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
                const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : (mime.includes('webp') ? 'webp' : 'png');

                const form = new FormData();
                form.append('model', activeModel);
                form.append('prompt', promptText);
                form.append('n', '1');
                form.append('image', new Blob([bytes], { type: mime }), `image.${ext}`);

                // Không gửi 'Content-Type' để trình duyệt tự đặt boundary cho multipart
                const editHeaders: any = { 'Authorization': headers['Authorization'] };
                console.log(`[UModelverse Image] Sửa ảnh qua ${GenaiService.resolveApiBase(url).versioned}/images/edits với model = ${activeModel}`);
                const editRes = await fetch(`${GenaiService.resolveApiBase(url).versioned}/images/edits`, { method: 'POST', headers: editHeaders, body: form });
                const editText = await editRes.text();
                let editData: any = null;
                try { editData = JSON.parse(editText); } catch { /* ignore */ }

                if (editRes.ok && editData) {
                    let b64 = editData.data?.[0]?.b64_json;
                    if (!b64 && editData.data?.[0]?.url) {
                        const imgRes = await fetch(editData.data[0].url);
                        if (!imgRes.ok) throw new Error(`Không thể fetch ảnh từ url: ${imgRes.statusText}`);
                        const blob = await imgRes.blob();
                        b64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }
                    if (b64) {
                        // [PATCH 2026-10-17] KIỂM CHỨNG SỬA ẢNH: chặn proxy trả HTTP 200 nhưng vẽ ảnh mới bỏ qua file gốc
                        const ok = await this.verifyImageEditSimilarity(firstImg.inlineData.data, b64);
                        if (!ok) {
                            console.warn(`[UModelverse Image] TỪ CHỐI kết quả /images/edits: ảnh trả về KHÔNG còn giữ bố cục ảnh gốc. Ném lỗi để generateContent chuyển tầng dự phòng.`);
                            throw new Error('Sửa ảnh qua /images/edits bị từ chối: kết quả không còn giống ảnh gốc (mất bố cục).');
                        }
                        return {
                            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }], role: 'model' } }]
                        };
                    }
                    lastErrorMsg = 'Không nhận được dữ liệu ảnh từ /images/edits';
                } else {
                    lastErrorMsg = editData?.error?.message || editData?.message || `HTTP Error: ${editRes.status} ${editText.substring(0, 100)}`;
                }
                console.warn(`[UModelverse Image] /images/edits thất bại:`, lastErrorMsg);
            } catch (editErr: any) {
                lastErrorMsg = editErr?.message || String(editErr);
                console.warn(`[UModelverse Image] /images/edits gặp lỗi ngoại lệ:`, lastErrorMsg);
            }
        }

        // [PATCH 2026-10-16] SỬA ẢNH (isImageEdit): TUYỆT ĐỐI KHÔNG được rơi vào vòng /images/generations.
        // generations là text-to-image thuần: proxy bỏ qua các trường image/ref_image không chuẩn
        // và vẽ ảnh MỚI hoàn toàn từ prompt => mất ảnh gốc (triệu chứng: "chỉnh sửa" nhưng ra ảnh chả liên quan).
        // /images/edits đã thất bại ở trên => ném lỗi để GenaiService chuyển tầng dự phòng (AI Agent / Google trực tiếp) vốn giữ nguyên ảnh gốc.
        if (isImageEdit) {
            throw new Error(`Sửa ảnh thất bại trên proxy Mì Tôm AI (/images/edits): ${lastErrorMsg || 'không rõ nguyên nhân'}. Hệ thống sẽ chuyển sang tầng dự phòng giữ nguyên ảnh gốc.`);
        }

        for (let i = 0; i < candidateRequests.length; i++) {
            const body = candidateRequests[i];
            console.log(`[UModelverse Image] Thử nghiệm cấu hình request ${i}:`, JSON.stringify(body));

            try {
                let targetUrl = `${GenaiService.resolveApiBase(url).versioned}/images/generations`;
                if (activeModel.includes('flux')) {
                    targetUrl = `${GenaiService.resolveApiBase(url).root}/v1/${activeModel}`;
                }

                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });

                lastResponseStatus = response.status;
                const responseText = await response.text();
                try {
                    data = JSON.parse(responseText);
                } catch (e) {
                    throw new Error(`Mã lỗi ${response.status}: Proxy trả về HTML hoặc text không hợp lệ thay vì JSON. (Dữ liệu trả về: ${responseText.substring(0, 50)}...)`);
                }

                if (response.ok) {
                    console.log(`[UModelverse Image] Cấu hình request ${i} thành công!`);

                    let b64 = data.data?.[0]?.b64_json;

                    // Nếu không có b64_json nhưng trả về url, tải ảnh từ URL và chuyển sang base64
                    if (!b64 && data.data?.[0]?.url) {
                        const imageUrl = data.data[0].url;
                        try {
                            const imgRes = await fetch(imageUrl);
                            if (imgRes.ok) {
                                const blob = await imgRes.blob();
                                b64 = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                        const result = reader.result as string;
                                        const base64Str = result.split(',')[1];
                                        resolve(base64Str);
                                    };
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                            } else {
                                throw new Error(`Không thể fetch ảnh từ url: ${imgRes.statusText}`);
                            }
                        } catch (err: any) {
                            throw new Error(`Không thể chuyển đổi ảnh từ URL sang base64: ${err.message || err}`);
                        }
                    }

                    if (!b64) throw new Error("Không nhận được dữ liệu ảnh (base64 hoặc URL) từ proxy");

                    // Fake GenerateContentResponse format
                    return {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            inlineData: {
                                                mimeType: 'image/png',
                                                data: b64
                                            }
                                        }
                                    ],
                                    role: 'model'
                                }
                            }
                        ]
                    };
                } else {
                    lastErrorMsg = (data?.error && data.error.message) || data?.message || (typeof data?.error === 'string' ? data.error : '') || `HTTP Error: ${response.status}`;
                    console.warn(`[UModelverse Image] Cấu hình request ${i} thất bại:`, lastErrorMsg);

                    // Nếu lỗi do model không tồn tại thì không cần thử các format payload nữa, break ra để fallback model
                    if (lastErrorMsg.includes('does not exist') || lastResponseStatus === 404) {
                        break;
                    }
                }
            } catch (err: any) {
                lastErrorMsg = err.message || err.toString();
                console.error(`[UModelverse Image] Cấu hình request ${i} gặp lỗi ngoại lệ:`, err);
            }
        }

        // --- LỚP DỰ PHÒNG CHÓT: QUÉT DANH SÁCH MODEL ĐỂ THAY THẾ (NẾU TẤT CẢ PAYLOAD ĐỀU FAIL CHO MODEL NÀY) ---
        if (!isImageEdit) {
            console.warn(`[UModelverse Image Warning] Không thể tạo ảnh với model ${activeModel}. Đang quét tìm model sinh ảnh thay thế...`);
            try {
                const modelsRes = await fetch(`${GenaiService.resolveApiBase(url).versioned}/models`, {
                    method: 'GET',
                    headers: { 'Authorization': headers['Authorization'] }
                });
            if (modelsRes.ok) {
                const modelsText = await modelsRes.text();
                let modelsData: any = {};
                try {
                    modelsData = JSON.parse(modelsText);
                } catch (e) {
                    console.warn('[UModelverse Image Fallback Error]: Cannot parse /models response');
                }
                if (modelsData && Array.isArray(modelsData.data)) {
                    const modelIds = modelsData.data.map((m: any) => m.id);
                    const alternativeModel = modelIds.find((id: string) => {
                        const lid = id.toLowerCase();
                        return (lid.includes('flux') || lid.includes('dall') || lid.includes('sdxl') || lid.includes('stable-diffusion') || lid.includes('playground') || lid.includes('art') || lid.includes('mj') || lid.includes('midjourney')) && id !== activeModel;
                    });

                    if (alternativeModel) {
                        console.log(`[UModelverse Image Fallback] Tìm thấy model thay thế: '${alternativeModel}'. Bắt đầu thử tạo lại với payload cơ bản...`);

                        const retryBody = {
                            model: alternativeModel,
                            prompt: promptText,
                            n: 1,
                            size: size
                        };

                        const retryResponse = await fetch(`${GenaiService.resolveApiBase(url).versioned}/images/generations`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(retryBody)
                        });
                        const retryText = await retryResponse.text();
                        let retryData: any = {};
                        try {
                            retryData = JSON.parse(retryText);
                        } catch (e) { }

                        if (retryResponse.ok) {
                            let b64 = retryData.data?.[0]?.b64_json;
                            if (!b64 && retryData.data?.[0]?.url) {
                                const imgRes = await fetch(retryData.data[0].url);
                                const blob = await imgRes.blob();
                                b64 = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                            }
                            if (b64) {
                                return {
                                    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }], role: 'model' } }]
                                };
                            }
                        } else {
                            lastErrorMsg = retryData?.error?.message || `HTTP Error: ${retryResponse.status}`;
                        }
                    }
                }
                }
            } catch (err) {
                console.error("[UModelverse Image Dynamic Fallback Exception]", err);
            }
        }

        throw new Error(lastErrorMsg || `HTTP Error: ${lastResponseStatus}`);
    }

    async generateText(
        params: GenerateContentParameters,
        scope?: Scope
    ): Promise<string> {
        try {
            const res = await this.generateContent(params, scope);

            const candidate = res.candidates?.[0];
            if (candidate?.content?.parts) {
                const textParts = candidate.content.parts
                    .filter((p: any) => p.text && !p.thought)
                    .map((p: any) => String(p.text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim())
                    .filter((t: string) => t.length > 0);
                if (textParts.length > 0) {
                    return textParts.join('\n\n');
                }
            }

            return '';
        } catch (error) {
            console.error("GenaiService: Lỗi khi trích xuất text:", error);
            return '';
        }
    }

    /**
     * [MULTI-CHARACTER] Ghep cac anh nhan vat thanh 1 anh Character Sheet duy nhat
     * (moi anh mot o, co ten nhan vat phia duoi) de model chi nhan 1 anh van thay du
     * toan bo nhan vat. Ai doc canvas truc tiep (khong qua Electron) vi anh da la base64.
     */
    private async composeCharacterSheet(
        characterRefUrls: string[],
        characterLabels: string[]
    ): Promise<string> {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            const count = characterRefUrls.length;
            const cols = Math.min(count, 2);
            const rows = Math.ceil(count / cols);
            const cellW = 512;
            const cellH = 640;
            const labelH = 48;
            canvas.width = cols * cellW;
            canvas.height = rows * (cellH + labelH);

            // Nen trang
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const loadImage = async (src: string): Promise<HTMLImageElement | null> => {
                let finalSrc = src;
                // [CRITICAL-FIX] Uu tien fetch -> data URI truoc khi ve de tranh canvas bi taint
                // (CORS) gay SecurityError tai toDataURL() -> mat toan bo Character Sheet.
                if (/^https?:/i.test(src)) {
                    try {
                        const res = await fetch(src);
                        if (res.ok) {
                            const blob = await res.blob();
                            finalSrc = await new Promise<string>((resolve2) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve2(reader.result as string);
                                reader.onerror = () => resolve2(src);
                                reader.readAsDataURL(blob);
                            });
                        }
                    } catch (e) {
                        console.warn('[CharacterSheet] Fetch anh that bai, dung URL goc:', src);
                    }
                }
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = finalSrc;
                });
            };

            for (let i = 0; i < count; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = col * cellW;
                const y = row * (cellH + labelH);

                const img = await loadImage(characterRefUrls[i]);
                if (img) {
                    // cover-fit vao o
                    const scale = Math.max(cellW / img.width, cellH / img.height);
                    const dw = img.width * scale;
                    const dh = img.height * scale;
                    ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
                } else {
                    ctx.fillStyle = '#eeeeee';
                    ctx.fillRect(x, y, cellW, cellH);
                    ctx.fillStyle = '#999999';
                    ctx.font = '16px sans-serif';
                    ctx.fillText('Image failed to load', x + 20, y + cellH / 2);
                }

                // Ky ten nhan vat ben duoi moi o
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 28px sans-serif';
                ctx.textAlign = 'center';
                const label = (characterLabels[i] || `Character ${i + 1}`).substring(0, 30);
                ctx.fillText(label, x + cellW / 2, y + cellH + 34);
                ctx.textAlign = 'left';
            }

            return canvas.toDataURL('image/jpeg', 0.9);
        } catch (e) {
            console.error('[CharacterSheet] Compose failed:', e);
            return '';
        }
    }

    /**
     * [CRITICAL-FIX] Kiem tra payload co chua anh tham chieu that su khong
     * (bo qua cac truong prompt/text de tranh nham lan tu khoa "image" trong loi van).
     */
    private payloadHasImageRef(req: any): boolean {
        const stripPrompts = (obj: any): any => {
            if (Array.isArray(obj)) return obj.map(stripPrompts);
            if (obj && typeof obj === 'object') {
                const out: any = {};
                for (const k of Object.keys(obj)) {
                    const kl = k.toLowerCase();
                    if (kl === 'prompt' || kl === 'text' || kl === 'negative_prompt') continue;
                    out[k] = stripPrompts(obj[k]);
                }
                return out;
            }
            return obj;
        };
        const hasRealImageValue = (obj: any): boolean => {
            if (typeof obj === 'string') {
                return obj.length > 0; // chuỗi non-empty (base64/URL/data URI) được coi là dữ liệu ảnh
            }
            if (Array.isArray(obj)) return obj.some(hasRealImageValue);
            if (obj && typeof obj === 'object') {
                return Object.values(obj).some(hasRealImageValue);
            }
            return false;
        };
        try {
            const stripped = stripPrompts(req);
            if (!hasRealImageValue(stripped)) return false;
            const s = JSON.stringify(stripped).toLowerCase();
            return s.includes('image') || s.includes('img_url') || s.includes('img_') || s.includes('video_url');
        } catch (e) {
            return false;
        }
    }

    public async generateVideoUModelverse(
        prompt: string,
        aspectRatio?: string,
        referenceImages?: any[],
        duration?: number,
        seed?: number,
        overrideModel?: string,
        resolution?: string,
        outMeta?: { url?: string | null }
    ): Promise<string> {
        this.syncConfigFromStorage();

        const rawRes = String(resolution || '').trim().toLowerCase();
        const normalizedResolution: '480p' | '720p' | '1080p' | '4k' =
            rawRes === '480p'
                ? '480p'
                : rawRes === '1080p'
                  ? '1080p'
                  : rawRes === '4k' || rawRes === '2160p'
                    ? '4k'
                    : '720p';

        const url = this._umodelverseUrl;
        const key = this._umodelverseKey;
        let model = overrideModel;
        if (model && (model.includes('gemini') || model === 'agent')) {
            model = null;
        }
        model = model || this._umodelverseVideoModel || 'cogvideox-5b';

        if (GenaiService.isAnthropicDirectUrl(url)) {
            throw new Error("Anthropic (api.anthropic.com) không cung cấp API tạo video. Vui lòng dùng proxy khác cho chức năng tạo video.");
        }

        const headers = GenaiService.buildUModelverseHeaders(url, key);
        const videoApiBase = GenaiService.resolveApiBase(url);

        // --- KIỂM TRA MODEL CÓ ĐƯỢC HỖ TRỢ TRÊN PROXY KHÔNG (CÓ CACHE + DEDUPLICATE KHI CHẠY SONG SONG) ---
        try {
            const modelsEndpoint = `${videoApiBase.versioned}/models`;
            const modelsCacheKey = `${modelsEndpoint}|${GenaiService.computeKeyFingerprint(key)}`;
            let modelIds: string[] | null = null;
            const cachedModels = GenaiService._modelsListCache.get(modelsCacheKey);
            if (cachedModels && cachedModels.expiresAt > Date.now()) {
                modelIds = cachedModels.ids;
            } else {
                let inFlightModels = GenaiService._modelsListInFlight.get(modelsCacheKey);
                if (!inFlightModels) {
                    inFlightModels = (async (): Promise<string[]> => {
                        console.log(`[UModelverse] Đang kiểm tra danh sách model được hỗ trợ từ: ${modelsEndpoint} ...`);
                        const modelsRes = await fetch(modelsEndpoint, {
                            method: 'GET',
                            headers: GenaiService.buildUModelverseHeaders(url, key, false)
                        });
                        if (!modelsRes.ok) {
                            console.warn(`[UModelverse] Không thể tải danh sách model, HTTP status: ${modelsRes.status}`);
                            return [];
                        }
                        const modelsData = await modelsRes.json();
                        if (modelsData && Array.isArray(modelsData.data)) {
                            const ids = modelsData.data.map((m: any) => m.id);
                            GenaiService._modelsListCache.set(modelsCacheKey, {
                                ids,
                                expiresAt: Date.now() + 60000
                            });
                            return ids;
                        }
                        return [];
                    })();
                    GenaiService._modelsListInFlight.set(modelsCacheKey, inFlightModels);
                }
                try {
                    modelIds = await inFlightModels;
                } finally {
                    GenaiService._modelsListInFlight.delete(modelsCacheKey);
                }
            }

            if (modelIds && modelIds.length > 0) {
                const isSupported = modelIds.includes(model);
                if (!isSupported) {
                    const videoModels = modelIds.filter((id: string) =>
                        id.toLowerCase().includes('video') ||
                        id.toLowerCase().includes('seedance') ||
                        id.toLowerCase().includes('veo') ||
                        id.toLowerCase().includes('cog') ||
                        id.toLowerCase().includes('kling') ||
                        id.toLowerCase().includes('luma') ||
                        id.toLowerCase().includes('vidu') ||
                        id.toLowerCase().includes('wan') ||
                        id.toLowerCase().includes('sora') ||
                        id.toLowerCase().includes('mimo') ||
                        id.toLowerCase().includes('runway')
                    );
                    console.warn(`[UModelverse Warning] Model [${model}] không có mặt trong danh sách công khai của /models. Phần mềm vẫn sẽ thử gửi request, nhưng có thể sẽ bị proxy từ chối nếu bạn chưa mua gói hoặc API key không hỗ trợ. Danh sách các model video đang hiển thị: ${videoModels.join(', ')}`);
                }
            }
        } catch (e: any) {
            console.error("[UModelverse Model Check Exception]", e);
        }

        const config = getModelverseConfig(model);
        const rawCleanPrompt = prompt;
        const isDoubaoSeedance = config?.payloadFormat === 'doubao_sdk';
        const isSeedance15Model = isDoubaoSeedance && (model.toLowerCase().includes('1-5') || model.toLowerCase().includes('1.5'));
        const isSeedanceV2Plus = isDoubaoSeedance && !isSeedance15Model;

        const hasExplicitStartFrame = Boolean(
            referenceImages?.some(
                (img: any) =>
                    img.referenceType === 'START_FRAME' ||
                    img.referenceType === 'STORYBOARD' ||
                    img.referenceType === 'CONTROL_IMAGE'
            )
        );
        const hasExplicitEndFrame = Boolean(
            referenceImages?.some((img: any) => img.referenceType === 'END_FRAME')
        );
        const hasExplicitRefVideo = Boolean(
            referenceImages?.some((img: any) => img.referenceType === 'REFERENCE_VIDEO')
        );

        // Chuẩn hoá referenceImages sang các định dạng phổ biến cho Video model
        let refBase64Raw = '';
        let refBase64RawOriginal = ''; // Giữ lại bản base64 gốc cho các model cần (Kling v3 motion)
        let refBase64DataUri = '';
        let refBase64CdnUrl = ''; // URL CDN sau khi upload
        let refMimeType = 'image/png';
        if (referenceImages && referenceImages.length > 0) {
            // Lấy START_FRAME hoặc STORYBOARD. Nếu không có, lấy CONTROL_IMAGE làm fallback.
            // Riêng Seedance 2.0/2.5 hỗ trợ native role: "reference_image", nên không gộp CHARACTER_REFERENCE vào first_frame.
            const startImg = referenceImages.find(img => img.referenceType === 'START_FRAME' || img.referenceType === 'STORYBOARD')
                || referenceImages.find(img => img.referenceType === 'CONTROL_IMAGE')
                || (!isSeedanceV2Plus
                    ? referenceImages.find(img => img.referenceType === 'CHARACTER_REFERENCE' || img.referenceType === 'ASSET' || img.referenceType === 'STYLE_REFERENCE')
                    : undefined);
            if (startImg) {
                refBase64Raw = startImg.image?.imageBytes || (typeof startImg === 'string' ? startImg : '');
                if (refBase64Raw && refBase64Raw.startsWith('http')) {
                    refBase64DataUri = refBase64Raw;
                    refBase64CdnUrl = refBase64Raw;
                } else if (refBase64Raw && !refBase64Raw.startsWith('data:')) {
                    refBase64DataUri = `data:image/png;base64,${refBase64Raw}`;
                } else if (refBase64Raw.startsWith('data:')) {
                    refBase64DataUri = refBase64Raw;
                    refMimeType = refBase64Raw.substring(5, refBase64Raw.indexOf(';'));
                    refBase64Raw = refBase64Raw.split(',')[1];
                }
                refBase64RawOriginal = refBase64Raw; // Lưu bản base64 gốc
                
                // Upload ảnh lên CDN để tránh gửi chuỗi base64 quá lớn làm lỗi API proxy
                if (!refBase64Raw.startsWith('http')) {
                    try {
                        let imgHash = 0;
                        for (let i = 0; i < refBase64DataUri.length; i += 100) {
                            imgHash = (imgHash << 5) - imgHash + refBase64DataUri.charCodeAt(i);
                            imgHash |= 0;
                        }
                        const imgUrl = await this.uploadBase64ToCdn(refBase64DataUri, `kling_img_${Math.abs(imgHash)}.png`);
                        if (imgUrl) {
                            refBase64CdnUrl = imgUrl;
                            refBase64Raw = imgUrl; // Các model khác dùng URL
                        }
                    } catch (e) {
                        console.error("[UModelverse Image Upload Exception]", e);
                    }
                }
            }
        }

        // [NEW] Xử lý ảnh cuối (END_FRAME) cho Luma/Kling/Wan/Veo
        let endRefBase64Raw = '';
        let endRefBase64RawOriginal = ''; // Giữ bản base64 gốc
        let endRefBase64DataUri = '';
        let endRefMimeType = 'image/png';
        if (referenceImages && referenceImages.length > 0) {
            // Lấy END_FRAME hoặc REFERENCE_VIDEO
            const endImg = referenceImages.find(img => img.referenceType === 'END_FRAME' || img.referenceType === 'REFERENCE_VIDEO');
            if (endImg) {
                endRefBase64Raw = endImg.image?.imageBytes || (typeof endImg === 'string' ? endImg : '');
                if (endRefBase64Raw && endRefBase64Raw.startsWith('http')) {
                    // Nếu là URL http thì bỏ qua upload và gán thẳng
                    endRefBase64DataUri = endRefBase64Raw;
                } else if (endRefBase64Raw && !endRefBase64Raw.startsWith('data:')) {
                    const mime = endImg.referenceType === 'REFERENCE_VIDEO' ? 'video/mp4' : 'image/png';
                    endRefBase64DataUri = `data:${mime};base64,${endRefBase64Raw}`;
                } else if (endRefBase64Raw.startsWith('data:')) {
                    endRefBase64DataUri = endRefBase64Raw;
                    endRefMimeType = endRefBase64Raw.substring(5, endRefBase64Raw.indexOf(';'));
                    endRefBase64Raw = endRefBase64Raw.split(',')[1];
                }
                endRefBase64RawOriginal = endRefBase64Raw;
                
                // Upload ảnh/video lên CDN để tránh gửi chuỗi base64 quá lớn làm lỗi API proxy
                if (!endRefBase64Raw.startsWith('http')) {
                    try {
                        let hash = 0;
                        for (let i = 0; i < endRefBase64DataUri.length; i += 100) {
                            hash = (hash << 5) - hash + endRefBase64DataUri.charCodeAt(i);
                            hash |= 0;
                        }
                        const ext = endImg.referenceType === 'REFERENCE_VIDEO' ? 'mp4' : 'png';
                        const fileUrl = await this.uploadBase64ToCdn(endRefBase64DataUri, `kling_ref_${Math.abs(hash)}.${ext}`);
                        if (fileUrl) {
                            endRefBase64Raw = fileUrl;
                            endRefBase64DataUri = fileUrl;
                        }
                    } catch (e) {
                        console.error("[UModelverse Ref Upload Exception]", e);
                    }
                }
            }
        }

        // [MULTI-CHARACTER] Thu thập TẤT CẢ ảnh nhân vật / phong cách (CHARACTER_REFERENCE / ASSET / STYLE_REFERENCE).
        // Mỗi nhân vật xuất hiện trong prompt phải được gửi kèm ảnh tham chiếu tương ứng.
        let characterRefUrls: string[] = [];
        let characterRefNames: string[] = [];
        if (referenceImages && referenceImages.length > 0) {
            const charRefItems = referenceImages.filter(
                (img: any) =>
                    img.referenceType === 'CHARACTER_REFERENCE' ||
                    img.referenceType === 'ASSET' ||
                    img.referenceType === 'STYLE_REFERENCE',
            );
            for (const charImg of charRefItems) {
                let raw = charImg.image?.imageBytes || (typeof charImg === 'string' ? charImg : '');
                if (!raw) continue;
                let dataUri = '';
                if (raw.startsWith('http') || raw.startsWith('asset://')) {
                    if (!characterRefUrls.includes(raw)) {
                        characterRefUrls.push(raw);
                        characterRefNames.push(charImg.characterName || `Character ${characterRefUrls.length}`);
                    }
                    continue;
                }
                if (raw.startsWith('data:')) {
                    dataUri = raw;
                    raw = raw.split(',')[1];
                } else {
                    dataUri = `data:image/png;base64,${raw}`;
                }
                try {
                    let hash = 0;
                    for (let i = 0; i < dataUri.length; i += 100) {
                        hash = (hash << 5) - hash + dataUri.charCodeAt(i);
                        hash |= 0;
                    }
                    const cdnUrl = await this.uploadBase64ToCdn(dataUri, `char_ref_${Math.abs(hash)}.png`);
                    const finalUrl = cdnUrl || dataUri;
                    if (!characterRefUrls.includes(finalUrl)) {
                        characterRefUrls.push(finalUrl);
                        characterRefNames.push(charImg.characterName || `Character ${characterRefUrls.length}`);
                    }
                } catch (e) {
                    if (!characterRefUrls.includes(dataUri)) {
                        characterRefUrls.push(dataUri);
                        characterRefNames.push(charImg.characterName || `Character ${characterRefUrls.length}`);
                    }
                }
            }
            if (characterRefUrls.length > 0) {
                console.log(`[UModelverse] Đã chuẩn bị ${characterRefUrls.length} ảnh nhân vật tham chiếu để gửi kèm prompt:`, characterRefNames.join(', '));
            }
        }

        // [MULTI-CHARACTER] Tạo ảnh Character Sheet tổng hợp (ghép tất cả nhân vật vào 1 ảnh
        // có tên ký tên) - dùng làm ảnh chính khi model chỉ hỗ trợ 1 ảnh tham chiếu.
        // Bỏ qua với Seedance 2.0/2.5 vì API hỗ trợ native tới 4 ảnh role: "reference_image".
        let characterSheetDataUri = '';
        if (characterRefUrls.length > 0 && !isSeedanceV2Plus) {
            characterSheetDataUri = await this.composeCharacterSheet(characterRefUrls, characterRefNames);
            if (characterSheetDataUri) {
                console.log(`[UModelverse] Đã tạo Character Sheet tổng hợp ${characterRefUrls.length} nhân vật.`);
            }
        }

        // [MULTI-CHARACTER] Nếu KHÔNG có ảnh storyboard/start frame, dùng Character Sheet
        // làm ảnh chính cho các format payload đơn ảnh.
        if (!isSeedanceV2Plus && !refBase64Raw && !refBase64DataUri && characterSheetDataUri) {
            try {
                const sheetCdn = await this.uploadBase64ToCdn(characterSheetDataUri, `char_sheet_main_${Date.now()}.jpg`);
                const sheetUrl = sheetCdn || characterSheetDataUri;
                refBase64CdnUrl = sheetCdn || '';
                refBase64DataUri = sheetUrl;
                refBase64Raw = sheetUrl;
                refBase64RawOriginal = characterSheetDataUri.split(',')[1] || '';
                refMimeType = 'image/jpeg';
                prompt = `${prompt}\n[CHARACTER REFERENCE: The attached image is a character reference sheet. Each cell shows one character with the character's name labeled below it. Strictly match each character's appearance, face, hairstyle and outfit to the corresponding labeled cell.]`;
                console.log('[UModelverse] Không có storyboard -> dùng Character Sheet làm ảnh chính:', sheetUrl);
            } catch (e) {
                console.error('[UModelverse] Lỗi upload Character Sheet chính:', e);
            }
        }

        // [MULTI-CHARACTER-FIX] Neu Character Sheet tao that bai nhung van co anh nhan vat,
        // dung anh nhan vat dau tien lam anh chinh de moi payload deu co anh.
        if (!isSeedanceV2Plus && !refBase64Raw && !refBase64DataUri && !characterSheetDataUri && characterRefUrls.length > 0) {
            const firstCharUrl = characterRefUrls[0];
            refBase64DataUri = firstCharUrl;
            refBase64Raw = firstCharUrl.startsWith('data:') ? firstCharUrl.split(',')[1] : firstCharUrl;
            if (!refBase64CdnUrl && firstCharUrl.startsWith('http')) {
                refBase64CdnUrl = firstCharUrl;
            }
            prompt = `${prompt}\n[CHARACTER REFERENCE: The attached image is the main character reference. Strictly match the character's appearance to the attached image.]`;
            console.log('[UModelverse] Character Sheet that bai -> dung anh nhan vat dau tien lam anh chinh.');
        }

        // --- XÂY DỰNG PAYLOAD DỰA TRÊN CONFIG ---
        let candidateTaskRequests: any[] = [];
        const seedanceOriginalMediaMap = new Map<string, string>();

        if (config) {
            console.log(`[UModelverse Async Video] Tìm thấy config cho model ${model}:`, config);
            const inputPayload: any = {
                [config.promptKey]: prompt
            };

            // Gắn ảnh bắt đầu
            if (refBase64DataUri || refBase64Raw) {
                if (config.imageKey) {
                    inputPayload[config.imageKey] = config.useDataUri ? refBase64DataUri : refBase64Raw;
                }
            }

            // Gắn ảnh kết thúc (nếu có)
            if (endRefBase64DataUri || endRefBase64Raw) {
                if (config.endImageKey) {
                    inputPayload[config.endImageKey] = config.useDataUri ? endRefBase64DataUri : endRefBase64Raw;
                }
            }

            // Thêm các tham số extra nếu có
            if (config.extraParams) {
                Object.assign(inputPayload, config.extraParams);
            }

            let actualModel = model;
            if (actualModel.toLowerCase() === 'veo-3.1' || actualModel === 'Veo-3.1') {
                actualModel = 'veo-3.1-generate-001';
            } else if (actualModel.toLowerCase().includes('pixverse')) {
                actualModel = actualModel.toLowerCase();
            }

            let payload: any;
            if (config.payloadFormat === 'kling_v3_omni') {
                let klingImageList: any[] = [];
                let modifiedPrompt = prompt;

                if (referenceImages && referenceImages.length > 0) {
                    for (const ref of referenceImages) {
                        let imgRaw = ref.image?.imageBytes || (typeof ref === 'string' ? ref : '');
                        let imgForUpload = imgRaw;
                        if (imgRaw.startsWith('data:')) {
                            imgRaw = imgRaw.split(',')[1];
                        }

                        const sizeKB = Math.round(imgRaw.length / 1024);
                        if (sizeKB / 1024 > 10) continue;

                        let imageUrl: string = imgRaw;
                        try {
                            const cdnUrl = await this.uploadBase64ToCdn(imgForUpload, `kling_${ref.referenceType || 'ref'}_${Date.now()}.jpg`);
                            if (cdnUrl) imageUrl = cdnUrl;
                        } catch (uploadErr) { }

                        if (ref.referenceType === 'START_FRAME' || ref.referenceType === 'STORYBOARD') {
                            klingImageList.push({ image_url: imageUrl, type: "first_frame" });
                        } else if (ref.referenceType === 'END_FRAME') {
                            klingImageList.push({ image_url: imageUrl, type: "end_frame" });
                        } else if (ref.referenceType === 'CONTROL_IMAGE') {
                            const hasStartFrame = referenceImages.some((r: any) => r.referenceType === 'START_FRAME' || r.referenceType === 'STORYBOARD');
                            if (!hasStartFrame) {
                                klingImageList.push({ image_url: imageUrl });
                                modifiedPrompt = `<<<image_${klingImageList.length}>>> [CRITICAL: The reference image is a pose/skeleton/sketch control image. DO NOT draw a skeleton or sketch. ONLY use it as a strict reference for the character's body pose, camera angle, and scene composition. Render the final output in the requested visual style.] ${modifiedPrompt}`;
                            }
                        } else {
                            klingImageList.push({ image_url: imageUrl });
                            modifiedPrompt = `<<<image_${klingImageList.length}>>> ${modifiedPrompt}`;
                        }
                    }
                }

                // [MULTI-CHARACTER] Đảm bảo mỗi nhân vật trong prompt đều có ảnh trong image_list
                // (mỗi nhân vật một ảnh tham chiếu riêng).
                if (characterRefUrls.length > 0) {
                    const existingUrls = klingImageList.map((k: any) => k.image_url);
                    for (const charUrl of characterRefUrls) {
                        if (!existingUrls.includes(charUrl)) {
                            klingImageList.push({ image_url: charUrl });
                            modifiedPrompt = `<<<image_${klingImageList.length}>>> ${modifiedPrompt}`;
                        }
                    }
                }

                payload = {
                    model: model,
                    input: { prompt: modifiedPrompt },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: 5,
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                    }
                };

                if (klingImageList.length > 0) {
                    payload.parameters.image_list = klingImageList;
                }
            } else if (config.payloadFormat === 'kling_v3') {
                payload = {
                    model: model,
                    input: { prompt: prompt },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: 5,
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                    }
                };
                if (refBase64Raw) {
                    payload.parameters.image = refBase64Raw;
                }
                if (endRefBase64Raw) {
                    payload.parameters.image_tail = endRefBase64Raw;
                }
            } else if (config.payloadFormat === 'kling_v3_motion' || model === 'kling-v3-motion-control') {
                // Đổi format chuẩn xác theo như generate_kling.py
                const motionControlPayload: any = {
                    model: 'kling-v3',
                    input: {
                        prompt: prompt
                    },
                    parameters: {
                        kling_v3_type: 'motion_control',
                        character_orientation: 'image',
                        mode: normalizedResolution === '1080p' || normalizedResolution === '4k' ? 'pro' : 'std',
                        duration: Math.ceil(duration || 10),
                        aspect_ratio: aspectRatio || '16:9'
                    }
                };
                // img_url: ảnh nhân vật tham chiếu (bắt buộc theo doc)
                if (refBase64CdnUrl || refBase64Raw) {
                    motionControlPayload.input.img_url = refBase64CdnUrl || refBase64Raw;
                }
                // video_url: video tham chiếu chuyển động (bắt buộc theo doc)
                if (endRefBase64Raw) {
                    motionControlPayload.input.video_url = endRefBase64Raw;
                }
                candidateTaskRequests.push(motionControlPayload);
            } else if (config.payloadFormat === 'nested_input') {
                payload = {
                    model: actualModel,
                    input: inputPayload,
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || config.defaultDuration || 5),
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                    }
                };
            } else if (config.payloadFormat === 'flat') {
                payload = {
                    model: actualModel,
                    ...inputPayload,
                    aspect_ratio: aspectRatio || '16:9',
                    duration: Math.ceil(duration || config.defaultDuration || 5),
                    ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                };
            } else if (config.payloadFormat === 'google_sdk') {
                // Xử lý riêng cho Veo / Google SDK format
                let veoDuration = Math.ceil(duration || config.defaultDuration || 6);
                if (actualModel.toLowerCase().includes('veo')) {
                    if (![4, 6, 8].includes(veoDuration)) {
                        veoDuration = veoDuration >= 8 ? 8 : (veoDuration >= 6 ? 6 : 4);
                    }
                }

                const veoResolution =
                    normalizedResolution === '1080p' || normalizedResolution === '4k'
                        ? '1080p'
                        : '720p';

                payload = {
                    model: actualModel,
                    input: {
                        prompt: prompt,
                        ...(refBase64RawOriginal ? {
                            image: {
                                bytesBase64Encoded: refBase64RawOriginal,
                                mimeType: refMimeType
                            }
                        } : {}),
                        ...(endRefBase64RawOriginal ? {
                            last_frame: {
                                bytesBase64Encoded: endRefBase64RawOriginal,
                                mimeType: endRefMimeType
                            }
                        } : {})
                    },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        resolution: veoResolution,
                        generate_audio: false,
                        duration: veoDuration
                    }
                };
            } else if (config.payloadFormat === 'doubao_sdk') {
                const lowerSeedanceModel = actualModel.toLowerCase();
                const isSeedance25Model = lowerSeedanceModel.includes('2-5') || lowerSeedanceModel.includes('2.5');
                const seedanceAssetRegion: 'cn' | 'overseas' = lowerSeedanceModel.includes('global') ? 'overseas' : 'cn';
                const seedanceKeyFp = GenaiService.computeKeyFingerprint(key);
                const volceUrlCache = GenaiService.getVolceAssetUrlCache();

                const resolveSeedanceMediaUrl = (rawUrl: string): string => {
                    if (!rawUrl || rawUrl.startsWith('asset://')) {
                        return rawUrl;
                    }
                    const h = GenaiService.computeVolceSourceHash(rawUrl);
                    const ck = `${videoApiBase.versioned}|${seedanceKeyFp}|${seedanceAssetRegion}|${h}`;
                    const cachedUri = volceUrlCache[ck];
                    if (cachedUri && cachedUri.startsWith('asset://')) {
                        seedanceOriginalMediaMap.set(cachedUri, rawUrl);
                        return cachedUri;
                    }
                    seedanceOriginalMediaMap.set(rawUrl, rawUrl);
                    return rawUrl;
                };

                let seedancePrompt = (isSeedanceV2Plus ? rawCleanPrompt : prompt) || '';
                if (seedancePrompt.length > 2480) {
                    seedancePrompt = seedancePrompt.substring(0, 2480);
                }

                const contentArr: any[] = [];
                if (seedancePrompt) {
                    contentArr.push({ type: 'text', text: seedancePrompt });
                }

                const validSeedanceRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
                const normalizedRequestedRatio =
                    aspectRatio && validSeedanceRatios.includes(aspectRatio)
                        ? aspectRatio
                        : '16:9';
                let effectiveRatio = normalizedRequestedRatio;

                if (hasExplicitStartFrame || hasExplicitEndFrame) {
                    // Quy tắc Volcengine Seedance: first_frame / last_frame KHÔNG được trộn với reference_image / reference_video,
                    // và parameters.ratio bắt buộc phải là "adaptive" (tỷ lệ khung hình tự theo ảnh đầu).
                    if (hasExplicitStartFrame && (refBase64CdnUrl || refBase64Raw)) {
                        const firstUrl = refBase64CdnUrl || refBase64Raw;
                        contentArr.push({
                            type: 'image_url',
                            image_url: { url: resolveSeedanceMediaUrl(firstUrl) },
                            role: 'first_frame'
                        });
                    }
                    if (hasExplicitEndFrame && endRefBase64Raw) {
                        contentArr.push({
                            type: 'image_url',
                            image_url: { url: resolveSeedanceMediaUrl(endRefBase64Raw) },
                            role: 'last_frame'
                        });
                    }
                    effectiveRatio = 'adaptive';
                } else if (isSeedanceV2Plus) {
                    // Chế độ Reference Media (Seedance 2.0 / 2.5): gửi tối đa 4 ảnh role: "reference_image" + tùy chọn role: "reference_video",
                    // đồng thời giữ nguyên tỷ lệ khung hình người dùng chọn (9:16, 16:9, 1:1...).
                    const refImgs = characterRefUrls.length > 0
                        ? characterRefUrls.slice(0, 4)
                        : ((refBase64CdnUrl || refBase64Raw) ? [refBase64CdnUrl || refBase64Raw] : []);
                    for (const imgUrl of refImgs) {
                        contentArr.push({
                            type: 'image_url',
                            image_url: { url: resolveSeedanceMediaUrl(imgUrl) },
                            role: 'reference_image'
                        });
                    }
                    if (hasExplicitRefVideo && endRefBase64Raw) {
                        contentArr.push({
                            type: 'video_url',
                            video_url: { url: resolveSeedanceMediaUrl(endRefBase64Raw) },
                            role: 'reference_video'
                        });
                    }
                    effectiveRatio = normalizedRequestedRatio;
                } else {
                    // Seedance 1.5 Pro chỉ hỗ trợ role: "first_frame" | "last_frame"
                    const fallbackFrameUrl = refBase64CdnUrl || refBase64Raw || characterRefUrls[0] || '';
                    if (fallbackFrameUrl) {
                        contentArr.push({
                            type: 'image_url',
                            image_url: { url: resolveSeedanceMediaUrl(fallbackFrameUrl) },
                            role: 'first_frame'
                        });
                        effectiveRatio = 'adaptive';
                    } else {
                        effectiveRatio = normalizedRequestedRatio;
                    }
                }

                let parsedSeed: number | undefined = undefined;
                if (seed !== undefined && seed !== null && String(seed).trim() !== '') {
                    const num = Number(seed);
                    if (!isNaN(num)) {
                        parsedSeed = Math.round(num);
                    }
                }

                const maxSeedanceDuration = isSeedance25Model ? 30 : (isSeedance15Model ? 12 : 15);
                const requestedDur = duration !== undefined && duration !== null ? Number(duration) : (config.defaultDuration || 5);
                const clampedDuration = requestedDur === -1 || (requestedDur === 0 && isSeedanceV2Plus)
                    ? -1
                    : Math.max(4, Math.min(maxSeedanceDuration, Math.round(requestedDur || config.defaultDuration || 5)));
                const seedanceResolution =
                    normalizedResolution === '4k' ? '1080p' : normalizedResolution;

                const seedanceParams: any = {
                    ratio: effectiveRatio,
                    resolution: seedanceResolution,
                    duration: clampedDuration,
                    ...(parsedSeed !== undefined ? { seed: parsedSeed } : {})
                };

                // Chuẩn OpenAPI 3.1.0 của ByteDance Seedance (additionalProperties: false trên root, input và parameters)
                candidateTaskRequests.push({
                    model: actualModel,
                    input: {
                        content: contentArr
                    },
                    parameters: seedanceParams
                });

                payload = null;
            } else if (config.payloadFormat === 'pixverse_sdk') {
                let firstFrameBase64Raw = '';
                let lastFrameBase64Raw = '';
                let imgUrlBase64Raw = '';

                // Extract all specific images
                if (referenceImages && referenceImages.length > 0) {
                    const startImgObj = referenceImages.find((img: any) => img.referenceType === 'START_FRAME' || img.referenceType === 'STORYBOARD');
                    if (startImgObj) {
                        firstFrameBase64Raw = startImgObj.image?.imageBytes || (typeof startImgObj === 'string' ? startImgObj : '');
                        if (firstFrameBase64Raw && !firstFrameBase64Raw.startsWith('data:') && !firstFrameBase64Raw.startsWith('http')) {
                            firstFrameBase64Raw = `data:image/png;base64,${firstFrameBase64Raw}`;
                        }
                    }

                    const endImgObj = referenceImages.find((img: any) => img.referenceType === 'END_FRAME');
                    if (endImgObj) {
                        lastFrameBase64Raw = endImgObj.image?.imageBytes || (typeof endImgObj === 'string' ? endImgObj : '');
                        if (lastFrameBase64Raw && !lastFrameBase64Raw.startsWith('data:') && !lastFrameBase64Raw.startsWith('http')) {
                            lastFrameBase64Raw = `data:image/png;base64,${lastFrameBase64Raw}`;
                        }
                    }

                    const controlImgObj = referenceImages.find((img: any) => img.referenceType === 'CONTROL_IMAGE');
                    if (controlImgObj) {
                        imgUrlBase64Raw = controlImgObj.image?.imageBytes || (typeof controlImgObj === 'string' ? controlImgObj : '');
                        if (imgUrlBase64Raw && !imgUrlBase64Raw.startsWith('data:') && !imgUrlBase64Raw.startsWith('http')) {
                            imgUrlBase64Raw = `data:image/png;base64,${imgUrlBase64Raw}`;
                        }
                    }
                } else {
                    // Fallback to globally processed ones if `referenceImages` is empty
                    if (refBase64DataUri || refBase64Raw) {
                        // Assuming it is a reference image if referenceImages is not provided
                        imgUrlBase64Raw = refBase64DataUri || refBase64Raw;
                    }
                    if (endRefBase64DataUri || endRefBase64Raw) {
                        lastFrameBase64Raw = endRefBase64DataUri || endRefBase64Raw;
                    }
                }

                let sanitizedPrompt = prompt.replace(/\n/g, ' ').trim();
                if (sanitizedPrompt.length > 800) sanitizedPrompt = sanitizedPrompt.substring(0, 800);
                const inputPayload: any = {
                    prompt: sanitizedPrompt
                };
                if (firstFrameBase64Raw) inputPayload.first_frame_url = firstFrameBase64Raw;
                if (lastFrameBase64Raw) inputPayload.last_frame_url = lastFrameBase64Raw;
                if (imgUrlBase64Raw) inputPayload.img_url = imgUrlBase64Raw;

                payload = {
                    model: model.toLowerCase(),
                    input: inputPayload,
                    parameters: {
                        resolution:
                            normalizedResolution === '480p'
                                ? '540p'
                                : normalizedResolution === '4k'
                                  ? '1080p'
                                  : normalizedResolution,
                        ...( (!firstFrameBase64Raw && !lastFrameBase64Raw && !imgUrlBase64Raw) ? { aspect_ratio: aspectRatio || '16:9' } : {} ),
                        duration: Math.ceil(duration || config.defaultDuration || 5),
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                    }
                };
            }

            if (payload) {
                candidateTaskRequests.push(payload);
            }

            // [MINIMAX-FIX] Adapter MiniMax (Hailuo) của proxy KHÔNG hỗ trợ convert
            // format nested_input (input.image_url) -> lỗi
            // "ConvertImageRequest not implemented for minimax adapter".
            // Format chuẩn của MiniMax video API là FLAT: first_frame_image ở root
            // (xem payload user bắt được khi model chạy đúng). Bổ sung các candidate
            // flat để cơ chế thử lần lượt tự tìm được format tương thích.
            if (model.toLowerCase().includes('minimax') || model.toLowerCase().includes('hailuo')) {
                const primaryMiniMaxImg = refBase64CdnUrl || refBase64DataUri || (characterRefUrls.length > 0 ? characterRefUrls[0] : '');
                if (primaryMiniMaxImg) {
                    // Option M1: Flat chuẩn MiniMax Hailuo (first_frame_image ở root)
                    candidateTaskRequests.push({
                        model: model,
                        prompt: prompt,
                        first_frame_image: primaryMiniMaxImg,
                        ...(characterRefUrls.length > 1 ? { reference_images: characterRefUrls } : {}),
                        prompt_optimizer: false,
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || config.defaultDuration || 5)
                    });
                    // Option M2: Flat với image_url (một số adapter map theo key này)
                    candidateTaskRequests.push({
                        model: model,
                        prompt: prompt,
                        image_url: primaryMiniMaxImg,
                        ...(characterRefUrls.length > 1 ? { reference_images: characterRefUrls } : {}),
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || config.defaultDuration || 5)
                    });
                    // Option M3: Nested nhưng dùng first_frame_image trong input
                    candidateTaskRequests.push({
                        model: model,
                        input: {
                            prompt: prompt,
                            first_frame_image: primaryMiniMaxImg,
                            ...(characterRefUrls.length > 1 ? { reference_images: characterRefUrls } : {})
                        },
                        parameters: {
                            aspect_ratio: aspectRatio || '16:9',
                            duration: Math.ceil(duration || config.defaultDuration || 5)
                        }
                    });
                    // Option M4: Sora-style qua endpoint /v1/videos (da xac minh endpoint
                    // ton tai tren proxy - tra 401 thay vi 404). Day la chuan OpenAI Videos
                    // ma adapter cua proxy co the implement thay cho /v1/tasks/submit.
                    candidateTaskRequests.push({
                        model: model,
                        input: {
                            prompt: prompt,
                            reference_image_urls: characterRefUrls.length > 0 ? characterRefUrls : [primaryMiniMaxImg]
                        },
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || config.defaultDuration || 5)
                    });
                    console.log(`[UModelverse MiniMax] Đã bổ sung 3 candidate flat/nested first_frame_image cho ${model}.`);
                }
            }
        }

        // --- FALLBACK NẾU KHÔNG CÓ CONFIG HOẶC ĐỂ DỰ PHÒNG ---
        if (candidateTaskRequests.length === 0) {
            console.log(`[UModelverse Async Video] KHÔNG tìm thấy config cụ thể cho ${model}, dùng fallback options...`);
            candidateTaskRequests = [
                // Option 0: Format chuẩn cho Veo-3.1 (Astraflow/Google)
                {
                    model: model,
                    input: {
                        prompt: prompt,
                        ...(refBase64Raw ? {
                            image: {
                                bytesBase64Encoded: refBase64Raw,
                                mimeType: refMimeType
                            }
                        } : {})
                    },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        resolution: '720p',
                        generate_audio: false,
                        duration: Math.ceil((duration === 4 || duration === 6 || duration === 8) ? duration : 6)
                    }
                },
                // Option 1: Nested standard with Data URI (phổ biến nhất cho Wan/Kling/Vidu trên proxy)
                {
                    model: model,
                    input: {
                        prompt: prompt,
                        ...(refBase64DataUri ? {
                            image: refBase64DataUri,
                            image_url: refBase64DataUri,
                            ref_image: refBase64DataUri
                        } : {}),
                        ...(endRefBase64DataUri ? {
                            image_end: endRefBase64DataUri,
                            last_frame_image: endRefBase64DataUri,
                            end_image_url: endRefBase64DataUri
                        } : {})
                    },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || 5)
                    }
                },
                // Option 1: Nested standard with raw base64
                {
                    model: model,
                    input: {
                        prompt: prompt,
                        ...(refBase64Raw ? {
                            image: refBase64Raw,
                            image_url: refBase64Raw
                        } : {}),
                        ...(endRefBase64Raw ? {
                            image_end: endRefBase64Raw,
                            last_frame_image: endRefBase64Raw,
                            end_image_url: endRefBase64Raw
                        } : {})
                    },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.round(duration || 5)
                    }
                },
                // Option 2: Flat payload standard with Data URI
                {
                    model: model,
                    prompt: prompt,
                    aspect_ratio: aspectRatio || '16:9',
                    duration: Math.ceil(duration || 5),
                    ...(refBase64DataUri ? {
                        image: refBase64DataUri,
                        image_url: refBase64DataUri,
                        first_frame_image: refBase64DataUri
                    } : {}),
                    ...(endRefBase64DataUri ? {
                        image_end: endRefBase64DataUri,
                        last_frame_image: endRefBase64DataUri,
                        end_image_url: endRefBase64DataUri
                    } : {})
                },
                // Option 3: Flat payload with raw base64
                {
                    model: model,
                    prompt: prompt,
                    aspect_ratio: aspectRatio || '16:9',
                    duration: Math.round(duration || 5),
                    ...(refBase64Raw ? {
                        image: refBase64Raw,
                        image_url: refBase64Raw
                    } : {}),
                    ...(endRefBase64Raw ? {
                        image_end: endRefBase64Raw,
                        last_frame_image: endRefBase64Raw,
                        end_image_url: endRefBase64Raw
                    } : {})
                },
                // Option 4: Nested with full referenceImages array (kiểu Google SDK)
                // [MULTI-CHARACTER-FIX] Chi gui URL anh nhan vat (loai bo base64 video mp4
                // REFERENCE_VIDEO lam bay payload hoac bi proxy tu choi).
                {
                    model: model,
                    input: {
                        prompt: prompt,
                        reference_images: characterRefUrls.length > 0
                            ? characterRefUrls
                            : (referenceImages || []).filter(
                                  (img: any) => img.referenceType !== 'REFERENCE_VIDEO',
                              )
                    },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9'
                    }
                },
                // Option 5: Minimal nested only prompt
                {
                    model: model,
                    input: {
                        prompt: prompt
                    }
                },
                // Option 6: Minimal flat only prompt
                {
                    model: model,
                    prompt: prompt
                }
            ];
        }

        // [MULTI-CHARACTER] Nếu prompt có từ 2 nhân vật trở lên, bổ sung option gửi kèm
        // đầy đủ danh sách ảnh nhân vật (mỗi nhân vật một ảnh) để giữ nhất quán nhân vật.
        // Bỏ qua với doubao_sdk và kling_v3_omni vì hai chuẩn này đã đóng gói danh sách ảnh theo schema riêng.
        if (
            characterRefUrls.length > 1 &&
            config?.payloadFormat !== 'doubao_sdk' &&
            config?.payloadFormat !== 'kling_v3_omni'
        ) {
            const primaryImg = refBase64CdnUrl || refBase64DataUri || characterRefUrls[0];
            candidateTaskRequests.push({
                model: model,
                input: {
                    prompt: prompt,
                    image: primaryImg,
                    image_url: primaryImg,
                    reference_images: characterRefUrls
                },
                parameters: {
                    aspect_ratio: aspectRatio || '16:9',
                    duration: Math.ceil(duration || 5)
                }
            });
            console.log(`[UModelverse Multi-Character] Prompt có ${characterRefUrls.length} nhân vật -> gửi kèm ${characterRefUrls.length} ảnh nhân vật.`);
        }

        // [CRITICAL-FIX] Nếu CÓ ảnh tham chiếu (storyboard hoặc nhân vật), TUYỆT ĐỐI
        // loại bỏ mọi payload chỉ có prompt (text-only). Nguyên nhân gốc làm video
        // "không dùng ảnh nhân vật": các payload có ảnh bị từ chối (base64 quá lớn,
        // sai format...) thì cơ chế thử lần lượt sẽ rơi xuống payload text-only ở cuối
        // danh sách và tạo video thuần văn bản một cách ÂM THẦM.
        if (refBase64Raw || refBase64DataUri || characterRefUrls.length > 0 || hasExplicitRefVideo) {
            const beforeCount = candidateTaskRequests.length;
            candidateTaskRequests = candidateTaskRequests.filter((req: any) => {
                const hasImage = this.payloadHasImageRef(req);
                if (!hasImage) {
                    console.warn('[UModelverse Safety Filter] Loại bỏ payload KHÔNG có ảnh tham chiếu:', JSON.stringify(req).substring(0, 120));
                }
                return hasImage;
            });
            console.log(`[UModelverse Safety Filter] Payload có ảnh: ${candidateTaskRequests.length}/${beforeCount} (đã loại ${beforeCount - candidateTaskRequests.length} payload text-only).`);
            if (candidateTaskRequests.length === 0) {
                throw new Error('Có ảnh tham chiếu nhưng không xây dựng được payload hợp lệ chứa ảnh. Đã dừng để tránh tạo video bỏ qua ảnh nhân vật.');
            }
        }

        let taskId = '';
        let taskEndpointUsed = '';
        let lastErrorMsg = '';

        const baseNoV1 = videoApiBase.root;
        const baseWithV1 = videoApiBase.versioned;

        const taskEndpoints = (
            config?.payloadFormat === 'doubao_sdk'
                ? [
                    `${baseWithV1}/tasks/submit`,
                    `${url}/tasks/submit`
                ]
                : [
                    `${baseWithV1}/tasks/submit`,
                    `${url}/tasks/submit`,
                    `${baseWithV1}/tasks`,
                    `${url}/tasks`,
                    `${baseWithV1}/videos/generations`,
                    `${url}/videos/generations`,
                    `${baseNoV1}/tasks/submit`,
                    `${baseNoV1}/tasks`
                ]
        ).filter((ep, idx, arr) => Boolean(ep) && arr.indexOf(ep) === idx);

        console.log(`[UModelverse Async Video] Trực tiếp thử gửi yêu cầu dạng Asynchronous Task...`);
        for (const endpoint of taskEndpoints) {
            if (taskId) break;
            for (let i = 0; i < candidateTaskRequests.length; i++) {
                if (taskId) break;
                const currentBody = candidateTaskRequests[i];

                console.log(`[Task Attempt] endpoint: ${endpoint}, payload Option ${i}:`, JSON.stringify(currentBody));
                try {
                    const submitTaskOnce = async (bodyObj: any) => {
                        const nowMs = Date.now();
                        const scheduledMs = Math.max(nowMs, GenaiService._lastVideoTaskSubmitMs + 120);
                        GenaiService._lastVideoTaskSubmitMs = scheduledMs;
                        const waitMs = scheduledMs - nowMs;
                        if (waitMs > 0) {
                            await new Promise((r) => setTimeout(r, waitMs));
                        }
                        return fetch(endpoint, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(bodyObj)
                        });
                    };

                    let response = await submitTaskOnce(currentBody);
                    let responseText = await response.text();

                    // Tự động retry ngắn nếu cổng proxy giới hạn burst QPS (HTTP 429) khi tạo đồng loạt nhiều scene
                    for (let retry429 = 1; response.status === 429 && retry429 <= 2; retry429++) {
                        console.warn(`[Task Attempt] Endpoint ${endpoint} báo HTTP 429 (Rate Limit), thử lại sau ${retry429 * 1500}ms (${retry429}/2)...`);
                        await new Promise((r) => setTimeout(r, retry429 * 1500));
                        response = await submitTaskOnce(currentBody);
                        responseText = await response.text();
                    }

                    // [VOLCE-ASSET AUTO-REGISTRATION] Nếu ByteDance Seedance chặn ảnh có mặt người thật / chân thực
                    // (InputImageSensitiveContentDetected.PrivacyInformation) hoặc asset:// cũ không còn hiệu lực,
                    // tự động đăng ký ảnh vào Volcengine Asset Library (group_type: AIGC -> asset://<id>) và gửi lại ngay.
                    if (!response.ok && config?.payloadFormat === 'doubao_sdk' && Array.isArray(currentBody?.input?.content)) {
                        const errLower = responseText.toLowerCase();
                        const contentList: any[] = currentBody.input.content;
                        const hasRawMedia = contentList.some(
                            (it: any) =>
                                (it?.type === 'image_url' && it.image_url?.url && !String(it.image_url.url).startsWith('asset://')) ||
                                (it?.type === 'video_url' && it.video_url?.url && !String(it.video_url.url).startsWith('asset://'))
                        );
                        const hasAssetUri = contentList.some(
                            (it: any) =>
                                (it?.type === 'image_url' && String(it.image_url?.url || '').startsWith('asset://')) ||
                                (it?.type === 'video_url' && String(it.video_url?.url || '').startsWith('asset://'))
                        );
                        const isFacePrivacyBlock =
                            (errLower.includes('privacyinformation') || errLower.includes('real person')) && hasRawMedia;
                        const isStaleAssetError =
                            (errLower.includes('asset not found') || errLower.includes('asset not active')) && hasAssetUri;

                        if (isFacePrivacyBlock || isStaleAssetError) {
                            const assetRegion: 'cn' | 'overseas' = model.toLowerCase().includes('global') ? 'overseas' : 'cn';
                            const keyFp = GenaiService.computeKeyFingerprint(key);
                            console.log(`[VolceAsset] Phát hiện ${isFacePrivacyBlock ? 'chặn khuôn mặt người (PrivacyInformation)' : 'asset:// hết hiệu lực'} trên ${model} (${assetRegion}). Tiến hành đăng ký Volcengine AIGC Asset...`);
                            try {
                                this.toastr?.info(
                                    'Đang đăng ký ảnh nhân vật vào Volcengine Asset Library cho Seedance (chỉ cần thực hiện 1 lần cho mỗi ảnh)...',
                                    'Seedance AI',
                                    { timeOut: 10000 }
                                );
                            } catch { /* ignore UI toast error */ }

                            let convertedCount = 0;
                            for (const item of contentList) {
                                if (item?.type === 'image_url' && item.image_url?.url) {
                                    const curUrl = String(item.image_url.url);
                                    if (isStaleAssetError || !curUrl.startsWith('asset://')) {
                                        const origSource = seedanceOriginalMediaMap.get(curUrl) || curUrl;
                                        if (!origSource.startsWith('asset://')) {
                                            const newAssetUri = await this.registerVolceMediaAsset(
                                                baseWithV1,
                                                headers,
                                                keyFp,
                                                origSource,
                                                assetRegion,
                                                'Image',
                                                isStaleAssetError
                                            );
                                            seedanceOriginalMediaMap.set(newAssetUri, origSource);
                                            item.image_url.url = newAssetUri;
                                            convertedCount++;
                                        }
                                    }
                                } else if (item?.type === 'video_url' && item.video_url?.url && errLower.includes('video')) {
                                    const curVidUrl = String(item.video_url.url);
                                    if (isStaleAssetError || !curVidUrl.startsWith('asset://')) {
                                        const origVidSource = seedanceOriginalMediaMap.get(curVidUrl) || curVidUrl;
                                        if (!origVidSource.startsWith('asset://')) {
                                            const newVidAssetUri = await this.registerVolceMediaAsset(
                                                baseWithV1,
                                                headers,
                                                keyFp,
                                                origVidSource,
                                                assetRegion,
                                                'Video',
                                                isStaleAssetError
                                            );
                                            seedanceOriginalMediaMap.set(newVidAssetUri, origVidSource);
                                            item.video_url.url = newVidAssetUri;
                                            convertedCount++;
                                        }
                                    }
                                }
                            }

                            if (convertedCount > 0) {
                                console.log(`[VolceAsset] Đã chuyển đổi ${convertedCount} media sang asset://, gửi lại yêu cầu tạo video tới ${endpoint}...`);
                                response = await submitTaskOnce(currentBody);
                                responseText = await response.text();
                            }
                        }
                    }

                    // DEBUG: Log response
                    try {
                        await fetch('https://cdn1.type.vn/debug-log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                event: 'UMODELVERSE_RESPONSE',
                                endpoint: endpoint,
                                payloadOption: i,
                                status: response.status,
                                responseBody: responseText.substring(0, 2000),
                                timestamp: new Date().toISOString()
                            })
                        });
                    } catch (debugErr) { /* ignore */ }

                    if (response.ok) {
                        let data: any;
                        try { data = JSON.parse(responseText); } catch { data = {}; }

                        // Kiểm tra response OK nhưng body chứa lỗi
                        const errorInBody = data?.message || data?.error?.message || data?.output?.error_message || '';
                        if (errorInBody && errorInBody.toLowerCase().includes('error')) {
                            console.warn(`[Task Warning] HTTP 200 nhưng body chứa lỗi: ${errorInBody}`);
                            lastErrorMsg = errorInBody;
                            continue; // Thử payload tiếp theo
                        }

                        const idVal = data.task_id || data.id || data.output?.task_id || data.data?.task_id || data.data?.id;
                        if (idVal) {
                            taskId = idVal;
                            taskEndpointUsed = endpoint;
                            console.log(`[Task Success] Tạo task thành công! ID: ${taskId} qua endpoint: ${endpoint}`);
                            break;
                        }
                    } else {
                        console.error(`[Task Failed] Endpoint ${endpoint} trả về HTTP ${response.status}:`, responseText);
                        lastErrorMsg = responseText;

                        // Nếu là lỗi an toàn/nhạy cảm, ném lỗi luôn không thử các payload/endpoint khác nữa
                        const errStr = responseText.toLowerCase();
                        if (errStr.includes('sensitive') || errStr.includes('privacyinformation') || errStr.includes('real person') || errStr.includes('violate') || errStr.includes('safety')) {
                            throw new Error("Hình ảnh hoặc nội dung vi phạm tiêu chuẩn an toàn của AI (có thể AI nhận diện nhầm là ảnh người thật, bạo lực, nhạy cảm...). Vui lòng thử hình/từ khoá khác.");
                        }
                        // [MINIMAX-ADAPTER] Adapter cua proxy khong ho tro chuyen doi anh
                        // cho model nay -> moi payload co anh deu se bi tu choi giong het.
                        // Dung som voi thong bao ro rang thay vi thu 30+ request that bai.
                        if (errStr.includes('convertimagerequest not implemented')) {
                            throw new Error("Model này trên proxy Mì Tôm AI hiện CHẢNG hỗ trợ gửi ảnh tham chiỏu (adapter báo: ConvertImageRequest not implemented). Vui lòng chọn model khác có hỗ trợ ảnh (vd: doubao-seedance, kling, wan, veo) hoảc liên hệ nhà cung cấp proxy bổ sung tính năng.");
                        }
                    }
                } catch (e: any) {
                    console.warn(`[Task Exception] Ngoại lệ tại ${endpoint}:`, e);
                    // Bắt luôn lỗi safety hoặc lỗi VolceAsset được ném ra từ bên trong để dừng sớm rõ ràng
                    if (
                        e.message &&
                        (e.message.includes('tiêu chuẩn an toàn của AI') ||
                            e.message.includes('Volcengine Asset') ||
                            e.message.includes('Volcengine kích hoạt Asset'))
                    ) {
                        throw e;
                    }
                }
            }
        }

        if (taskId) {
            // Polling check trạng thái của task
            console.log(`[UModelverse Poll] Bắt đầu kiểm tra trạng thái video sinh từ Task ID: ${taskId}...`);
            const maxPolls = 180; // Chờ tối đa 15 phút (180 * 5s) cho các clip Seedance 2.5 dài
            let pollCount = 0;

            // Xây dựng các format URL check status
            // Gốc dùng để hỏi trạng thái = đúng gốc đã gửi task thành công (có thể là url, baseNoV1 hoặc baseWithV1)
            const taskBase = taskEndpointUsed.replace(/\/tasks(\/submit)?$/i, '').replace(/\/videos\/generations$/i, '') || url;
            let checkUrl = taskEndpointUsed.includes('/tasks/submit') || taskEndpointUsed.includes('/tasks')
                ? `${taskBase}/tasks/status?task_id=${taskId}`
                : `${taskEndpointUsed}/${taskId}`;

            while (pollCount < maxPolls) {
                pollCount++;
                console.log(`[Poll Attempt ${pollCount}/${maxPolls}] Querying: ${checkUrl}`);
                try {
                    let response = await fetch(checkUrl, { method: 'GET', headers });

                    // Fallback thử cả dạng path param /tasks/:id nếu bị 404
                    if (!response.ok) {
                        const fallbackUrl = `${taskBase}/tasks/${taskId}`;
                        console.log(`[Poll Status Failed] Thử URL fallback: ${fallbackUrl}`);
                        response = await fetch(fallbackUrl, { method: 'GET', headers });
                    }

                    if (response.ok) {
                        const data = await response.json();
                        const statusVal = (data.task_status || data.status || data.state || data.data?.status || data.data?.task_status || data.output?.status || data.output?.task_status || '').toLowerCase();

                        console.log(`[Poll Response] Task status: ${statusVal}`);

                        // Debug log mỗi 6 poll (30s) để không spam
                        if (pollCount % 6 === 1) {
                            try {
                                await fetch('https://cdn1.type.vn/debug-log', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        event: 'POLL_STATUS',
                                        pollCount,
                                        checkUrl,
                                        statusVal,
                                        responseKeys: Object.keys(data),
                                        rawResponse: JSON.stringify(data).substring(0, 500),
                                        timestamp: new Date().toISOString()
                                    })
                                });
                            } catch (debugErr) { /* ignore */ }
                        }

                        if (statusVal === 'success' || statusVal === 'succeeded' || statusVal === 'completed' || statusVal === 'done') {
                            const videoUrl =
                                data.video_url ||
                                data.url ||
                                (Array.isArray(data.urls) && data.urls[0]) ||
                                data.output?.video_url ||
                                data.output?.url ||
                                data.output?.video ||
                                (Array.isArray(data.output?.urls) && data.output.urls[0]) ||
                                data.output?.data?.content?.video_url ||
                                data.output?.content?.video_url ||
                                data.data?.video_url ||
                                data.data?.url ||
                                data.data?.content?.video_url ||
                                data.content?.video_url;
                            if (videoUrl) {
                                if (outMeta) {
                                    outMeta.url = videoUrl;
                                }
                                this._lastUmodelverseVideoUrl = videoUrl;
                                console.log(`[Poll Success] Video đã tạo xong! Tiến hành download: ${videoUrl}`);
                                return await this.downloadVideoAsBase64(videoUrl);
                            } else {
                                throw new Error("Task báo Success nhưng không tìm thấy URL video trong JSON.");
                            }
                        } else if (
                            statusVal === 'failed' ||
                            statusVal === 'failure' ||
                            statusVal === 'error' ||
                            statusVal === 'expired' ||
                            statusVal === 'cancelled' ||
                            statusVal === 'canceled'
                        ) {
                            const rawErr =
                                data.error_message ||
                                data.output?.error_message ||
                                data.output?.data?.error?.message ||
                                data.data?.error?.message ||
                                data.error?.message ||
                                data.output?.error ||
                                data.message ||
                                `Task kết thúc với trạng thái ${statusVal}.`;
                            let errMessage = typeof rawErr === 'string'
                                ? rawErr
                                : (rawErr?.message || JSON.stringify(rawErr));

                            if (typeof errMessage === 'string') {
                                if (errMessage.toLowerCase() === 'success') {
                                    errMessage = "Provider server gặp lỗi nội bộ trong quá trình render (Lỗi máy chủ). Vui lòng thử lại sau.";
                                } else if (errMessage.toLowerCase().includes('violate') || errMessage.toLowerCase().includes('safety')) {
                                    errMessage = "Nội dung vi phạm tiêu chuẩn an toàn của AI (bạo lực, nhạy cảm...). Vui lòng thử từ khoá khác.";
                                } else if (errMessage.includes('size must be between 0 and 2500')) {
                                    errMessage = "Tổng độ dài prompt gửi lên hệ thống bị giới hạn ở mức 2500 ký tự. Vui lòng rút gọn nội dung kịch bản hoặc Master Prompt.";
                                }
                            }

                            throw new Error(`Video task failed: ${errMessage}`);
                        }
                    } else {
                        console.warn(`[Poll HTTP Error] Kiểm tra trạng thái trả về: ${response.status}`);
                    }
                } catch (err: any) {
                    console.error("[Poll Exception]", err);
                    if (err.message && (err.message.includes("Video task failed") || err.message.includes("không tìm thấy URL video"))) {
                        throw err;
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            throw new Error(`Quá thời gian chờ tạo video qua proxy (15 phút). Task ID: ${taskId}`);
        }

        if (!taskId && lastErrorMsg) {
            const errStr = lastErrorMsg.toLowerCase();
            if (errStr.includes('sensitive') || errStr.includes('privacyinformation') || errStr.includes('real person') || errStr.includes('violate') || errStr.includes('safety')) {
                throw new Error("Hình ảnh hoặc nội dung vi phạm tiêu chuẩn an toàn của AI (có thể AI nhận diện nhầm là ảnh người thật, bạo lực, nhạy cảm...). Vui lòng thử hình/từ khoá khác.");
            }
        }

        // Nếu là motion-control hoặc ByteDance Seedance (doubao_sdk), không fallback sang /images/generations
        if (!taskId && config && (config.payloadFormat === 'kling_v3_motion' || config.payloadFormat === 'doubao_sdk')) {
            let parsedReason = lastErrorMsg || 'Proxy không phản hồi. Kiểm tra API key và quyền truy cập model.';
            try {
                const errObj = JSON.parse(lastErrorMsg);
                parsedReason = errObj?.error?.message || errObj?.message || parsedReason;
            } catch { /* keep raw text */ }
            throw new Error(`Lỗi tạo video (${model}): ${parsedReason}`);
        }

        // --- BƯỚC 2: FALLBACK SANG CƠ CHẾ SYNCHRONOUS TRUYỀN THỐNG (IMAGES/GENERATIONS) ---
        console.log(`[UModelverse Sync Fallback] Không tìm thấy hoặc lỗi tạo Asynchronous Task. Fallback qua /images/generations...`);

        let sizeVal = '1280x720';
        if (aspectRatio === '21:9') {
            sizeVal = '1344x576';
        } else if (aspectRatio === '9:16') {
            sizeVal = '720x1280';
        } else if (aspectRatio === '1:1') {
            sizeVal = '1024x1024';
        } else if (aspectRatio === '4:3') {
            sizeVal = '1024x768';
        } else if (aspectRatio === '3:4') {
            sizeVal = '768x1024';
        }

        let candidateRequests: any[] = [
            // [NEW] Thử lại các payload chuẩn xác của model đã tạo ở bước Async
            ...candidateTaskRequests,
            // Option 0 (Đầy đủ & đa dạng): Đầy đủ các tham số và nhiều cách biểu diễn để tương thích tối đa
            {
                model: model,
                prompt: prompt,
                aspect_ratio: aspectRatio || '16:9',
                aspectRatio: aspectRatio || '16:9',
                duration: duration,
                ...(referenceImages && referenceImages.length > 0 ? {
                    reference_images: referenceImages,
                    referenceImages: referenceImages,
                    config: {
                        aspectRatio: aspectRatio || '16:9',
                        referenceImages: referenceImages
                    }
                } : {})
            },
            // Option 1 (Flat size format): Định dạng phẳng với tham số size chuẩn của OpenAI
            {
                model: model,
                prompt: prompt,
                size: sizeVal
            },
            // Option 2 (Flat aspect_ratio format): Định dạng phẳng với aspect_ratio đơn giản
            {
                model: model,
                prompt: prompt,
                aspect_ratio: aspectRatio || '16:9'
            },
            // Option 3 (Nested format): Định dạng lồng nhau kiểu Kling/Vidu/Wan-AI trên UModelverse
            {
                model: model,
                input: {
                    prompt: prompt
                },
                parameters: {
                    aspect_ratio: aspectRatio || '16:9'
                }
            },
            // Option 4 (OpenAI Standard Square size): Định dạng phẳng với size vuông cơ bản
            {
                model: model,
                prompt: prompt,
                size: '1024x1024'
            },
            // Option 5 (Minimal): Định dạng tối giản nhất chỉ có model và prompt
            {
                model: model,
                prompt: prompt
            }
        ];

        // [CRITICAL-FIX] Ap dung cung bo loc cho buoc sync fallback:
        // neu co anh tham chieu thi khong duoc gui payload text-only
        if (refBase64Raw || refBase64DataUri || characterRefUrls.length > 0) {
            const beforeSync = candidateRequests.length;
            candidateRequests = candidateRequests.filter((req: any) => this.payloadHasImageRef(req));
            console.log(`[UModelverse Safety Filter][Sync] Payload có ảnh: ${candidateRequests.length}/${beforeSync}`);
            if (candidateRequests.length === 0) {
                throw new Error('Có ảnh tham chiếu nhưng không xây dựng được payload hợp lệ chứa ảnh (sync fallback).');
            }
        }

        lastErrorMsg = '';
        let lastResponseStatus = 200;

        for (let i = 0; i < candidateRequests.length; i++) {
            const currentBody = candidateRequests[i];
            console.log(`UModelverse video attempt ${i} (Body structure):`, JSON.stringify(currentBody));

            try {
                const response = await fetch(`${videoApiBase.versioned}/images/generations`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(currentBody)
                });

                lastResponseStatus = response.status;
                const data = await response.json();

                if (response.ok) {
                    console.log(`UModelverse attempt ${i} succeeded!`);
                    let videoUrl = data.data?.[0]?.url;
                    let b64 = data.data?.[0]?.b64_json;

                    if (b64) {
                        return b64;
                    }

                    if (videoUrl) {
                        if (outMeta) {
                            outMeta.url = videoUrl;
                        }
                        this._lastUmodelverseVideoUrl = videoUrl;
                        return await this.downloadVideoAsBase64(videoUrl);
                    }
                    throw new Error("Không nhận được dữ liệu video (base64 hoặc URL) từ proxy.");
                } else {
                    lastErrorMsg = (data?.error && data.error.message) || `HTTP Error: ${response.status}`;
                    console.warn(`UModelverse attempt ${i} failed:`, lastErrorMsg);
                }
            } catch (err: any) {
                lastErrorMsg = err.message || err.toString();
                console.error(`UModelverse attempt ${i} error:`, err);
            }
        }

        throw new Error(lastErrorMsg || `HTTP Error: ${lastResponseStatus}`);
    }

    private async downloadVideoAsBase64(videoUrl: string): Promise<string> {
        const imgRes = await fetch(videoUrl);
        if (imgRes.ok) {
            const blob = await imgRes.blob();
            const base64Str = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            return base64Str;
        } else {
            throw new Error(`Không thể tải file video từ URL của proxy: ${imgRes.statusText}`);
        }
    }

    async wrap<T>(p: Promise<T>, scope?: Scope): Promise<T> {
        this._start(scope);
        try {
            return await p;
        } finally {
            this._stop(scope);
        }
    }

    /**
     * Dùng AI (Gemini) để tự động phân tích và sinh ra 3-4 câu hỏi / prompt gợi ý tiếp theo
     * dựa trên câu hỏi của người dùng và câu trả lời của AI.
     */
    async generateFollowUpPrompts(lastUserMessage: string, lastAiResponse?: string, context?: string): Promise<string[]> {
        try {
            const promptForAi = `
Dưới đây là đoạn hội thoại vừa diễn ra:
- Yêu cầu/Câu hỏi của người dùng: "${lastUserMessage}"
- Phản hồi của Trợ lý AI: "${(lastAiResponse || '').replace(/<[^>]+>/g, ' ').slice(0, 600)}"
${context ? `- Ngữ cảnh bổ sung: ${context}` : ''}

Nhiệm vụ: Bạn hãy suy nghĩ và sinh ra từ 3 đến 4 câu hỏi tiếp theo hoặc câu lệnh (prompt) gợi ý có tính liên kết cao nhất, sáng tạo, thực tế mà người dùng có thể muốn hỏi hoặc yêu cầu AI làm tiếp theo.
Yêu cầu:
1. Gợi ý phải do AI tự sinh ra dựa trên ngữ cảnh thực tế của câu hỏi và câu trả lời ở trên.
2. Mỗi gợi ý ngắn gọn (khoảng 6 - 15 từ), bắt đầu bằng 1 emoji phù hợp (ví dụ: 💬, 🚀, 📊, ❤️, 👥, ✍️, 🎯...).
3. Chỉ trả về kết quả dưới dạng JSON array duy nhất chứa các chuỗi string (không bọc code block markdown):
["Emoji Gợi ý 1", "Emoji Gợi ý 2", "Emoji Gợi ý 3"]
`.trim();

            const res: any = await this.generateContent({
                model: 'gemini-3.8-flash',
                contents: [{ role: 'user', parts: [{ text: promptForAi }] }],
                config: {
                    systemInstruction: 'Bạn là chuyên gia gợi ý prompt và câu hỏi tiếp theo thông minh. Chỉ trả về định dạng JSON array các chuỗi string.'
                }
            });

            const rawText = res?.text || res?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanJson = rawText.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
            }
        } catch (err) {
            console.warn('[AI Follow-up Generator error]:', err);
        }
        return [];
    }

    /**
     * Dùng AI để phân tích xem yêu cầu của người dùng có phải là một hành động cần xác nhận (Confirm)
     * trước khi thực thi không, và tự động trích xuất các thông số hành động.
     */
    async analyzeActionConfirmation(prompt: string, context?: any): Promise<{
        needConfirmation: boolean;
        actionType?: string;
        actionTitle?: string;
        actionSummary?: string;
        suggestions?: string[];
    }> {
        try {
            const promptForAi = `
Yêu cầu của người dùng: "${prompt}"
${context ? `Ngữ cảnh: ${JSON.stringify(context)}` : ''}

Nhiệm vụ: Phân tích xem yêu cầu trên có phải là một thao tác cần xác nhận trước khi thực thi hay không. Đồng thời tự nghĩ ra 3 câu hỏi/prompt tiếp theo.
Trả về JSON duy nhất (không bọc code block markdown):
{
  "needConfirmation": true/false,
  "actionType": "video_interaction" | "script_execution" | "query",
  "actionTitle": "Tiêu đề tác vụ ngắn",
  "actionSummary": "Tóm tắt tác vụ cần xác nhận",
  "suggestions": ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]
}
`.trim();

            const res: any = await this.generateContent({
                model: 'gemini-3.8-flash',
                contents: [{ role: 'user', parts: [{ text: promptForAi }] }],
                config: {
                    systemInstruction: 'Bạn là AI phân tích ý định người dùng và điều phối tác vụ. Trả về JSON chính xác.'
                }
            });

            const rawText = res?.text || res?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanJson = rawText.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (err) {
            console.warn('[AI Action Confirmation Analysis error]:', err);
        }

        return {
            needConfirmation: /(https?:\/\/[^\s]+)/i.test(prompt),
            suggestions: []
        };
    }

    refreshConfig() {
        this._aiInstance = undefined;
        this._currentKey = '';
        this._umodelverseUrl = '';
        this._umodelverseKey = '';
        this.syncConfigFromStorage();
    }

    /**
     * [PATCH PDF] Chuyen doi moi inlineData application/pdf trong contents
     * thanh phan text da trich xuat bang pdfjs (theo tung trang).
     * Cac tang proxy dinh dang OpenAI-style khong ho tro inlineData PDF,
     * neu khong chuyen doi thi AI se khong thay noi dung file dinh kem.
     */
    private async _convertPdfAttachmentsToText(params: GenerateContentParameters): Promise<boolean> {
        if (!params.contents || !Array.isArray(params.contents)) {
            return false;
        }

        let changed = false;
        for (const content of params.contents as any[]) {
            const parts = content?.parts;
            if (!Array.isArray(parts)) {
                continue;
            }
            for (let idx = 0; idx < parts.length; idx++) {
                const inline = parts[idx]?.inlineData;
                const mime = String(inline?.mimeType || '').toLowerCase();
                if (mime === 'application/pdf' && inline?.data) {
                    const pdfText = await this._pdfTextService.extractTextFromBase64(inline.data);
                    if (pdfText && pdfText.trim().length > 0) {
                        parts.splice(idx, 1, {
                            text: `\n--- Nội dung file PDF đính kèm ---\n${pdfText}\n--- Hết file PDF ---`
                        });
                        changed = true;
                    }
                }
            }
        }
        if (changed) {
            console.info('[GenaiService] Đã trích xuất văn bản từ file PDF đính kèm trước khi gửi AI.');
        }
        return changed;
    }
}
