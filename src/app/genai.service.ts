import { Injectable, computed, signal } from '@angular/core';
import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';
import { MultiAccountService } from './modules/_services/multi-account.service';
import { getModelverseConfig, getTextModelConfig } from './modelverse.config';

type Scope = string | number;

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
    private _enableUmodelverse: boolean = false;

    constructor(
        private multiAccountService: MultiAccountService
    ) { }

    /**
     * Upload ảnh base64 lên CDN (cdn1.type.vn) và trả về URL HTTPS.
     * CDN server chạy ở localhost:3333, endpoint POST /upload, field name 'files'.
     * Dùng cho Kling API vì UModelverse proxy không hỗ trợ ConvertImageRequest.
     */
    private async uploadBase64ToCdn(base64Data: string, filename?: string): Promise<string | null> {
        try {
            // Chuyển base64 thành Blob
            let mimeType = 'image/jpeg';
            let rawBase64 = base64Data;
            if (base64Data.startsWith('data:')) {
                const match = base64Data.match(/^data:([a-zA-Z0-9]+\/[^;]+);base64,/);
                if (match) mimeType = match[1];
                rawBase64 = base64Data.split(',')[1];
            }

            const byteChars = atob(rawBase64);
            const byteArray = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
                byteArray[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([byteArray], { type: mimeType });

            // Tạo File + FormData
            let ext = 'jpg';
            if (mimeType.includes('png')) ext = 'png';
            else if (mimeType.includes('mp4')) ext = 'mp4';
            else if (mimeType.includes('webm')) ext = 'webm';
            else if (mimeType.includes('quicktime')) ext = 'mov';

            const fname = filename || `kling_upload_${Date.now()}.${ext}`;
            const file = new File([blob], fname, { type: mimeType });

            const formData = new FormData();
            formData.append('files', file); // CDN server dùng multer.array('files')

            // Upload lên CDN server (cdn1.type.vn)
            const uploadUrl = 'https://cdn1.type.vn/upload';
            console.log(`[CDN Upload] Uploading ${fname} (${Math.round(rawBase64.length / 1024)}KB) to ${uploadUrl}...`);

            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                console.error(`[CDN Upload] HTTP ${response.status}: ${await response.text()}`);
                return null;
            }

            const result = await response.json();

            // Server trả về { url: "origin/public/filename", filename: "timestamp.ext" }
            if (result?.filename) {
                const cdnUrl = `https://cdn1.type.vn/public/${result.filename}`;
                console.log(`[CDN Upload] Thành công! URL: ${cdnUrl}`);
                return cdnUrl;
            }

            // Fallback: nếu server trả url trực tiếp
            if (result?.url) {
                // Thay origin bằng domain CDN thật
                const cdnUrl = result.url.replace(/^https?:\/\/[^\/]+/, 'https://cdn1.type.vn');
                console.log(`[CDN Upload] Thành công (fallback)! URL: ${cdnUrl}`);
                return cdnUrl;
            }

            console.warn('[CDN Upload] Không tìm thấy filename/url trong response:', result);
            return null;
        } catch (err) {
            console.error('[CDN Upload] Lỗi upload:', err);
            return null;
        }
    }

    public get googleAi(): GoogleGenAI | null {
        if (!this._aiInstance && !this.isUModelverseEnabled()) {
            this.syncConfigFromStorage();
        }
        return this._aiInstance || null;
    }

    private syncConfigFromStorage() {
        try {
            const settingsRaw = this.multiAccountService.getItem('settings');
            if (!settingsRaw) {
                this._currentKey = '';
                this._enableUmodelverse = false;
                this._umodelverseUrl = '';
                this._umodelverseKey = '';
                return;
            }

            const settings = settingsRaw;

            // Cập nhật cấu hình Mì Tôm AI
            this._enableUmodelverse = settings.enableUmodelverse === true;
            this._umodelverseUrl = settings.umodelverseUrl?.trim() || '';
            this._umodelverseKey = settings.umodelverseKey?.trim() || '';
            this._umodelverseChatModel = settings.umodelverseChatModel?.trim() || '';
            this._umodelverseImageModel = settings.umodelverseImageModel?.trim() || '';
            this._umodelverseVideoModel = settings.umodelverseVideoModel?.trim() || '';

            // Nếu umodelverseUrl bị thiếu giao thức, thêm vào (mặc định https)
            if (this._umodelverseUrl && !this._umodelverseUrl.startsWith('http')) {
                this._umodelverseUrl = 'https://' + this._umodelverseUrl;
            }
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
        }
    }

    public isUModelverseEnabled(): boolean {
        this.syncConfigFromStorage();
        return this._enableUmodelverse && !!this._umodelverseUrl;
    }

    public get umodelverseUrl(): string { return this._umodelverseUrl; }
    public get umodelverseKey(): string { return this._umodelverseKey; }
    public get umodelverseChatModel(): string { return this._umodelverseChatModel; }
    public get umodelverseImageModel(): string { return this._umodelverseImageModel; }
    public get umodelverseVideoModel(): string { return this._umodelverseVideoModel; }

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

        // Restore model compatibility with existing UModelverse config
        if (params.model === 'gemini-3.5-flash') {
            params.model = 'gemini-3.5-flash';
        } else if (
            params.model === 'gemini-3.1-flash-image-preview' ||
            params.model === 'imagen-3.0-generate-001' ||
            params.model === 'gemini-3-pro-image-preview' ||
            params.model?.includes('image') ||
            params.model?.includes('imagen')
        ) {
            // Nếu dùng UModelverse thì chuyển đổi sang Image Model tuỳ chọn của họ (mặc định dall-e-3), nếu dùng trực tiếp thì dùng model chuẩn của Google
            params.model = this.isUModelverseEnabled() ? (this._umodelverseImageModel || 'dall-e-3') : 'imagen-3.0-generate-002';
        }

        this._start(scope);
        try {
            const bypassUModelverse = (params.config as any)?.bypassUModelverse === true;
            if (this.isUModelverseEnabled() && !bypassUModelverse) {
                return await this.generateWithUModelverse(params);
            } else {
                const settingsRaw = this.multiAccountService.getItem('settings');
                const keys = settingsRaw?.secretKey ? settingsRaw.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];

                if (keys.length === 0) {
                    console.error("API Key is missing in localStorage.");
                    throw new Error("API Key không hợp lệ hoặc chưa được cấu hình.");
                }

                // Xáo trộn mảng keys để random load balancing (vẫn ưu tiên key hiện tại nếu nó đang dùng tốt)
                const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
                // Đưa _currentKey lên đầu nếu có để ưu tiên thử lại key đang sống
                if (this._currentKey && shuffledKeys.includes(this._currentKey)) {
                    shuffledKeys.splice(shuffledKeys.indexOf(this._currentKey), 1);
                    shuffledKeys.unshift(this._currentKey);
                }

                let lastError: any;
                for (let i = 0; i < shuffledKeys.length; i++) {
                    const key = shuffledKeys[i];
                    try {
                        let aiInstance = this._aiInstance;
                        if (key !== this._currentKey || !aiInstance) {
                            aiInstance = new GoogleGenAI({ apiKey: key });
                        }

                        // Thử gọi API
                        let result;
                        try {
                            result = await aiInstance.models.generateContent(params);
                        } catch (apiError: any) {
                            const errStr = String(apiError);
                            if (errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE')) {
                                console.warn(`[Fallback] Model ${params.model} bị quá tải (503), đang tự động chuyển sang gemini-2.0-flash...`);
                                const fallbackParams = { ...params, model: 'gemini-2.0-flash' };
                                result = await aiInstance.models.generateContent(fallbackParams);
                            } else {
                                throw apiError;
                            }
                        }

                        // Nếu thành công thì lưu lại key này làm key mặc định cho các lượt tiếp theo
                        if (key !== this._currentKey) {
                            this._currentKey = key;
                            this._aiInstance = aiInstance;
                            console.log(`GenaiService: Đã chuyển sang Key an toàn (${key.substring(0, 8)}...)`);
                        }
                        return result;
                    } catch (error: any) {
                        console.warn(`GenaiService: Lỗi với API Key ${key.substring(0, 8)}... - Thử key tiếp theo nếu có.`, error);
                        lastError = error;
                        // Nếu là lỗi cuối cùng thì ném ra ngoài
                        if (i === shuffledKeys.length - 1) {
                            throw lastError;
                        }
                    }
                }
                throw lastError;
            }
        } catch (error) {
            console.error("Lỗi AI API:", error);
            throw error;
        } finally {
            this._stop(scope);
        }
    }

    public async generateWithUModelverse(params: GenerateContentParameters): Promise<any> {
        this.syncConfigFromStorage();
        const url = this._umodelverseUrl;
        if (!url) {
            throw new Error("Vui lòng cấu hình Base URL (Mì tôm AI) trong mục Cài đặt trước khi sử dụng.");
        }
        const key = this._umodelverseKey;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        };

        const isImageGeneration = params.config?.responseModalities?.includes('IMAGE');

        if (isImageGeneration) {
            return await this.generateImageUModelverse(url, headers, params);
        } else {
            return await this.generateChatUModelverse(url, headers, params);
        }
    }

    private async generateChatUModelverse(url: string, headers: any, params: GenerateContentParameters): Promise<any> {
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
                                    if (config.apiFormat !== 'gemini' && config.apiFormat !== 'anthropic') {
                                        console.warn("Bỏ qua âm thanh vì model hiện tại không hỗ trợ dạng input_audio");
                                        return { type: 'text', text: '[Audio Omitted]' };
                                    } else {
                                        let format = 'mp3';
                                        if (mimeType.includes('wav')) format = 'wav';
                                        return {
                                            type: 'input_audio',
                                            input_audio: {
                                                data: p.inlineData.data,
                                                format: format
                                            }
                                        };
                                    }
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

        const overrideModel = params.model === 'gemini-3.5-flash' ? null : params.model;
        const targetModel = overrideModel || this._umodelverseChatModel || 'gpt-4o';
        const config = getTextModelConfig(targetModel);

        let endpointPath = config.endpointOverride || '/v1/chat/completions';
        if (endpointPath.includes('{model}')) {
            endpointPath = endpointPath.replace('{model}', targetModel);
        }
        let body: any = {};
        let isReasoningModel = false;

        // Xử lý systemInstruction chung cho các format OpenAI / Claude
        let sysContent = '';
        if (params.config && params.config.systemInstruction) {
            if (typeof params.config.systemInstruction === 'string') {
                sysContent = params.config.systemInstruction;
            } else if ((params.config.systemInstruction as any).parts) {
                sysContent = (params.config.systemInstruction as any).parts.map((p: any) => p.text).join('\n');
            }
        }

        if (config.apiFormat === 'gemini') {
            body = {
                contents: params.contents,
                generationConfig: {
                    temperature: params.config?.temperature,
                    topP: params.config?.topP,
                    maxOutputTokens: params.config?.maxOutputTokens
                }
            };
            if (sysContent) {
                body.systemInstruction = { parts: [{ text: sysContent }] };
            }
            // Tạm thời tắt để tránh lỗi regex trên UModelverse proxy
            // if (params.config?.responseMimeType === 'application/json') {
            //     body.generationConfig.responseMimeType = 'application/json';
            // }
            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        } else if (config.apiFormat === 'anthropic') {
            body = {
                model: targetModel,
                messages: messages, // Các message user/assistant đã gom ở trên
                max_tokens: params.config?.maxOutputTokens || 8192,
                temperature: params.config?.temperature,
                top_p: params.config?.topP
            };
            if (sysContent) {
                body.system = sysContent;
            }
            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        } else {
            // Chuẩn OpenAI mặc định
            if (sysContent) {
                messages.unshift({ role: 'system', content: sysContent });
            }
            body = {
                model: targetModel,
                messages: messages,
                temperature: params.config?.temperature,
                top_p: params.config?.topP,
            };

            isReasoningModel = config.useMaxCompletionTokens || targetModel.includes('gpt-5') || targetModel.includes('o1') || targetModel.includes('o3') || targetModel.includes('deepseek-reasoner') || targetModel.includes('kimi') || targetModel.includes('qwq') || targetModel.includes('r1');

            if (params.config?.maxOutputTokens) {
                if (isReasoningModel) {
                    if (params.config.maxOutputTokens !== 8192) {
                        body.max_completion_tokens = params.config.maxOutputTokens;
                    }
                } else {
                    body.max_tokens = params.config.maxOutputTokens;
                }
            } else if (!isReasoningModel) {
                body.max_tokens = 8192;
            }

            // Tạm thời tắt để tránh lỗi regex trên UModelverse proxy
            // if (params.config?.responseMimeType === 'application/json' && !isReasoningModel) {
            //     body.response_format = { type: 'json_object' };
            // }

            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        }

        let finalUrl = url;
        if (finalUrl.endsWith('/')) {
            finalUrl = finalUrl.slice(0, -1);
        }
        if (finalUrl.endsWith('/v1') && (endpointPath.startsWith('/v1/') || endpointPath.startsWith('/v1beta/'))) {
            finalUrl = finalUrl.slice(0, -3);
        }

        const response = await fetch(`${finalUrl}${endpointPath}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body, null, 2)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error((data.error && data.error.message) || `HTTP Error: ${response.status}`);
        }

        let replyText = '';
        let finishReason = '';

        if (config.apiFormat === 'gemini') {
            const candidate = data.candidates?.[0];
            replyText = candidate?.content?.parts?.[0]?.text || '';
            finishReason = candidate?.finishReason || '';
        } else if (config.apiFormat === 'anthropic') {
            replyText = data.content?.[0]?.text || '';
            finishReason = data.stop_reason || '';
        } else {
            // OpenAI format
            const choice = data.choices?.[0];
            replyText = choice?.message?.content || '';
            finishReason = choice?.finish_reason || '';
        }

        return {
            get text() {
                if ((finishReason === 'length' || finishReason === 'max_tokens') && !replyText) {
                    throw new Error(`Model ${targetModel} đã đạt giới hạn độ dài (max tokens) trong quá trình suy luận và bị ngắt giữa chừng. Hãy dùng một model khác (VD: gpt-4o, claude-3-5-sonnet) cho kịch bản dài này.`);
                }
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
                promptTokenCount: data.usage?.prompt_tokens,
                candidatesTokenCount: data.usage?.completion_tokens,
                totalTokenCount: data.usage?.total_tokens
            }
        };
    }

    private async generateImageUModelverse(url: string, headers: any, params: GenerateContentParameters): Promise<any> {
        let promptText = '';
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

        if (configRatio) {
            const ratioStr = String(configRatio).trim();
            if (['16:9', '3:2', '4:3', '21:9', '5:4', '8:1', '4:1'].includes(ratioStr)) {
                size = '1792x1024'; // Chiều ngang rộng (Landscape)
            } else if (['9:16', '2:3', '3:4', '1:4', '4:5', '1:8'].includes(ratioStr)) {
                size = '1024x1792'; // Chiều dọc cao (Portrait)
            } else if (ratioStr === '1:1') {
                size = '1024x1024'; // Vuông
            }
        }

        let activeModel = params.model || 'dall-e-3';

        // Auto-correct model names for UModelverse / Astraflow
        if (activeModel === 'gemini-3-pro-image') {
            activeModel = 'gemini-3-pro-image-preview'; // Sửa theo chuẩn tên phổ biến nhất của Google
        }

        // --- XỬ LÝ RIÊNG CHO GEMINI MODELS BẰNG GEMINI COMPATIBLE INTERFACE ---
        if (activeModel.includes('gemini')) {
            console.log(`[UModelverse Image] Dùng Gemini Compatible Interface cho model: ${activeModel}`);

            // Chuyển đổi url từ /v1 sang /v1beta để gọi API Gemini chuẩn của proxy
            let baseUrl = url.replace(/\/v1\/?$/, '');
            const geminiUrl = `${baseUrl}/v1beta/models/${activeModel}:generateContent`;

            try {
                const geminiBody: any = {
                    contents: [
                        {
                            parts: [{ text: promptText }]
                        }
                    ]
                };

                // Cập nhật generationConfig chuẩn
                geminiBody.generationConfig = {
                    responseModalities: ["IMAGE"],
                    imageConfig: {}
                };

                // Nếu user có setting configRatio
                if (configRatio) {
                    geminiBody.generationConfig.imageConfig.aspectRatio = String(configRatio).trim();
                }

                const geminiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers, // Giữ nguyên Authorization Bearer proxy key
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
                    return geminiData;
                } else {
                    console.warn(`[UModelverse Image] Gemini Compatible Interface thất bại, tự động chuyển sang OpenAI Compatible Interface. Lỗi:`, geminiData?.error?.message || geminiResponse.status);
                }
            } catch (e: any) {
                console.warn(`[UModelverse Image] Lỗi khi gọi Gemini Interface, chuyển sang OpenAI Interface:`, e.message);
            }
        }
        // --- KẾT THÚC XỬ LÝ GEMINI ---

        const candidateRequests: any[] = [
            // Option 0: Chuẩn OpenAI đầy đủ
            {
                model: activeModel,
                prompt: promptText,
                n: 1,
                size: size,
                response_format: 'b64_json',
                image: referenceBase64 ? `data:image/png;base64,${referenceBase64}` : undefined
            },
            // Option 1: Bỏ response_format (nhiều proxy crash với b64_json)
            {
                model: activeModel,
                prompt: promptText,
                n: 1,
                size: size,
                image: referenceBase64 ? `data:image/png;base64,${referenceBase64}` : undefined
            },
            // Option 2: Format dành cho Gemini/Midjourney (không dùng n, size, mà dùng aspect_ratio)
            {
                model: activeModel,
                prompt: promptText,
                aspect_ratio: configRatio || '1:1',
                response_format: 'b64_json'
            },
            // Option 3: Bỏ luôn cả response_format cho Gemini/Midjourney
            {
                model: activeModel,
                prompt: promptText,
                aspect_ratio: configRatio || '1:1'
            },
            // Option 4: Siêu tối giản, chỉ có model và prompt
            {
                model: activeModel,
                prompt: promptText
            }
        ];

        let lastErrorMsg = '';
        let lastResponseStatus = 200;
        let data: any = null;

        console.log(`[UModelverse Image] Bắt đầu quá trình tạo ảnh với model = ${activeModel}`);

        for (let i = 0; i < candidateRequests.length; i++) {
            const body = candidateRequests[i];
            console.log(`[UModelverse Image] Thử nghiệm cấu hình request ${i}:`, JSON.stringify(body));

            try {
                let targetUrl = `${url}/images/generations`;
                if (activeModel.includes('flux')) {
                    let baseUrl = url.replace(/\/v1\/?$/, '');
                    targetUrl = `${baseUrl}/v1/${activeModel}`;
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
                    lastErrorMsg = (data?.error && data.error.message) || `HTTP Error: ${response.status}`;
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
        console.warn(`[UModelverse Image Warning] Không thể tạo ảnh với model ${activeModel}. Đang quét tìm model sinh ảnh thay thế...`);
        try {
            const modelsRes = await fetch(`${url}/models`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${headers['Authorization'].split(' ')[1]}` }
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

                        const retryResponse = await fetch(`${url}/images/generations`, {
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
                const textParts = candidate.content.parts.filter((p: any) => p.text).map((p: any) => p.text);
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

    public async generateVideoUModelverse(
        prompt: string,
        aspectRatio?: string,
        referenceImages?: any[],
        duration?: number,
        seed?: number,
        overrideModel?: string
    ): Promise<string> {
        this.syncConfigFromStorage();

        const url = this._umodelverseUrl;
        const key = this._umodelverseKey;
        const model = overrideModel || this._umodelverseVideoModel || 'cogvideox-5b';

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        };

        // --- KIỂM TRA MODEL CÓ ĐƯỢC HỖ TRỢ TRÊN PROXY KHÔNG ---
        try {
            console.log(`[UModelverse] Đang kiểm tra danh sách model được hỗ trợ từ: ${url}/models ...`);
            const modelsRes = await fetch(`${url}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${key}`
                }
            });
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                if (modelsData && Array.isArray(modelsData.data)) {
                    const modelIds = modelsData.data.map((m: any) => m.id);
                    console.log("[UModelverse] Danh sách model được hỗ trợ trên API proxy:", modelIds);

                    const isSupported = modelIds.includes(model);
                    if (!isSupported) {
                        const videoModels = modelIds.filter((id: string) =>
                            id.toLowerCase().includes('video') ||
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
                        // Xoá dòng throw Error để cho phép thử nghiệm các model ẩn
                    }
                }
            } else {
                console.warn(`[UModelverse] Không thể tải danh sách model, HTTP status: ${modelsRes.status}`);
            }
        } catch (e: any) {
            console.error("[UModelverse Model Check Exception]", e);
        }

        // Chuẩn hoá referenceImages sang các định dạng phổ biến cho Video model
        let refBase64Raw = '';
        let refBase64DataUri = '';
        let refMimeType = 'image/png';
        if (referenceImages && referenceImages.length > 0) {
            // Lấy START_FRAME hoặc STORYBOARD. Nếu không có, lấy CONTROL_IMAGE làm fallback.
            const startImg = referenceImages.find(img => img.referenceType === 'START_FRAME' || img.referenceType === 'STORYBOARD')
                || referenceImages.find(img => img.referenceType === 'CONTROL_IMAGE');
            if (startImg) {
                refBase64Raw = startImg.image?.imageBytes || (typeof startImg === 'string' ? startImg : '');
                if (refBase64Raw && !refBase64Raw.startsWith('data:')) {
                    refBase64DataUri = `data:image/png;base64,${refBase64Raw}`;
                } else if (refBase64Raw.startsWith('data:')) {
                    refBase64DataUri = refBase64Raw;
                    refMimeType = refBase64Raw.substring(5, refBase64Raw.indexOf(';'));
                    refBase64Raw = refBase64Raw.split(',')[1];
                }
            }
        }

        // [NEW] Xử lý ảnh cuối (END_FRAME) cho Luma/Kling/Wan
        let endRefBase64Raw = '';
        let endRefBase64DataUri = '';
        let endRefMimeType = 'image/png';
        if (referenceImages && referenceImages.length > 0) {
            // Lấy END_FRAME hoặc REFERENCE_VIDEO
            const endImg = referenceImages.find(img => img.referenceType === 'END_FRAME' || img.referenceType === 'REFERENCE_VIDEO');
            if (endImg) {
                endRefBase64Raw = endImg.image?.imageBytes || (typeof endImg === 'string' ? endImg : '');
                if (endRefBase64Raw && !endRefBase64Raw.startsWith('data:')) {
                    const mime = endImg.referenceType === 'REFERENCE_VIDEO' ? 'video/mp4' : 'image/png';
                    endRefBase64DataUri = `data:${mime};base64,${endRefBase64Raw}`;
                } else if (endRefBase64Raw.startsWith('data:')) {
                    endRefBase64DataUri = endRefBase64Raw;
                    endRefMimeType = endRefBase64Raw.substring(5, endRefBase64Raw.indexOf(';'));
                    endRefBase64Raw = endRefBase64Raw.split(',')[1];
                }

                // Nếu là video, ép buộc upload lên CDN lấy URL vì API thường không nhận Base64 cho video quá nặng
                if (endImg.referenceType === 'REFERENCE_VIDEO') {
                    try {
                        const videoUrl = await this.uploadBase64ToCdn(endRefBase64DataUri, `kling_video_${Date.now()}.mp4`);
                        if (videoUrl) {
                            endRefBase64Raw = videoUrl;
                            endRefBase64DataUri = videoUrl;
                        }
                    } catch (e) {
                        console.error("Lỗi upload video mẫu lên CDN:", e);
                    }
                }
            }
        }

        // --- XÂY DỰNG PAYLOAD DỰA TRÊN CONFIG ---
        let candidateTaskRequests: any[] = [];
        const config = getModelverseConfig(model);

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

                payload = {
                    model: model,
                    input: { prompt: modifiedPrompt },
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.max(3, Math.min(15, Math.ceil(duration || config.defaultDuration || 5))),
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                    }
                };

                if (klingImageList.length > 0) {
                    payload.parameters.image_list = klingImageList;
                }
            } else if (config.payloadFormat === 'kling_v3' || config.payloadFormat === 'kling_v3_motion') {
                // Tự động nâng cấp lên kling_v3_motion nếu có video mẫu
                if (config.payloadFormat === 'kling_v3_motion' || endRefMimeType === 'video/mp4') {
                    payload = {
                        model: model,
                        input: { prompt: prompt },
                        parameters: {
                            aspect_ratio: aspectRatio || '16:9',
                            duration: Math.max(3, Math.min(15, Math.ceil(duration || config.defaultDuration || 5))),
                            ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                        }
                    };
                    if (refBase64Raw) {
                        payload.input.img_url = refBase64Raw;
                        payload.parameters.character_orientation = "image";
                    }
                    if (endRefBase64Raw) {
                        payload.input.video_url = endRefBase64Raw;
                    }
                } else {
                    payload = {
                        model: model,
                        input: { prompt: prompt },
                        parameters: {
                            aspect_ratio: aspectRatio || '16:9',
                            duration: Math.max(3, Math.min(15, Math.ceil(duration || config.defaultDuration || 5))),
                            ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                        }
                    };
                    if (refBase64Raw) {
                        payload.parameters.image = refBase64Raw;
                    }
                    if (endRefBase64Raw) {
                        payload.parameters.image_tail = endRefBase64Raw;
                    }
                }
            } else if (config.payloadFormat === 'nested_input') {
                payload = {
                    model: model,
                    input: inputPayload,
                    parameters: {
                        aspect_ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || config.defaultDuration || 5),
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                    }
                };
            } else if (config.payloadFormat === 'flat') {
                payload = {
                    model: model,
                    ...inputPayload,
                    aspect_ratio: aspectRatio || '16:9',
                    duration: Math.ceil(duration || config.defaultDuration || 5),
                    ...(seed !== undefined && seed !== null ? { seed: seed } : {})
                };
            } else if (config.payloadFormat === 'google_sdk') {
                // Xử lý riêng cho Veo / Google SDK format
                payload = {
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
                        duration: Math.ceil(duration || config.defaultDuration || 6)
                    }
                };
            } else if (config.payloadFormat === 'doubao_sdk') {
                const contentArr: any[] = [];
                if (prompt) {
                    contentArr.push({ type: 'text', text: prompt });
                }

                if (referenceImages && referenceImages.length > 0) {
                    for (const ref of referenceImages) {
                        let imgRaw = ref.image?.imageBytes || (typeof ref === 'string' ? ref : '');
                        let imgUri = imgRaw;
                        if (imgRaw && !imgRaw.startsWith('data:')) {
                            imgUri = `data:image/png;base64,${imgRaw}`;
                        }
                        if (ref.referenceType === 'START_FRAME' || ref.referenceType === 'STORYBOARD') {
                            contentArr.push({ type: 'image_url', image_url: { url: imgUri }, role: 'first_frame' });
                        } else if (ref.referenceType === 'END_FRAME') {
                            contentArr.push({ type: 'image_url', image_url: { url: imgUri }, role: 'last_frame' });
                        } else {
                            // Any other reference image is treated as a character/style reference
                            contentArr.push({ type: 'image_url', image_url: { url: imgUri }, role: 'reference_image' });
                        }
                    }
                } else {
                    // Fallback using single image references
                    if (refBase64Raw) {
                        contentArr.push({ type: 'image_url', image_url: { url: `data:${refMimeType || 'image/jpeg'};base64,${refBase64Raw}` }, role: 'first_frame' });
                    }
                    if (endRefBase64Raw) {
                        contentArr.push({ type: 'image_url', image_url: { url: `data:${endRefMimeType || 'image/jpeg'};base64,${endRefBase64Raw}` }, role: 'last_frame' });
                    }
                }

                let parsedSeed = undefined;
                if (seed !== undefined && seed !== null && String(seed).trim() !== '') {
                    const num = Number(seed);
                    if (!isNaN(num)) {
                        parsedSeed = num;
                    }
                }

                payload = {
                    model: model,
                    input: { content: contentArr },
                    parameters: {
                        ratio: aspectRatio || '16:9',
                        duration: Math.ceil(duration || config.defaultDuration || 5),
                        ...(parsedSeed !== undefined ? { seed: parsedSeed } : {})
                    }
                };
            }

            if (payload) {
                candidateTaskRequests.push(payload);
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
                {
                    model: model,
                    input: {
                        prompt: prompt,
                        reference_images: referenceImages
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

        let taskId = '';
        let taskEndpointUsed = '';
        let lastErrorMsg = '';

        const taskEndpoints = [
            `${url}/tasks/submit`,
            `${url}/tasks`,
            `${url}/videos/generations`
        ];

        console.log(`[UModelverse Async Video] Trực tiếp thử gửi yêu cầu dạng Asynchronous Task...`);
        for (const endpoint of taskEndpoints) {
            if (taskId) break;
            for (let i = 0; i < candidateTaskRequests.length; i++) {
                if (taskId) break;
                const currentBody = candidateTaskRequests[i];

                // DEBUG: Gửi payload sang CDN server để log (vì DevTools bị khóa)
                try {
                    await fetch('https://cdn1.type.vn/debug-log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'SENDING_TO_UMODELVERSE',
                            endpoint: endpoint,
                            payloadOption: i,
                            payload: currentBody,
                            timestamp: new Date().toISOString()
                        })
                    });
                } catch (debugErr) { /* ignore debug errors */ }

                console.log(`[Task Attempt] endpoint: ${endpoint}, payload Option ${i}:`, JSON.stringify(currentBody));
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(currentBody)
                    });

                    const responseText = await response.text();

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
                    }
                } catch (e: any) {
                    console.warn(`[Task Exception] Ngoại lệ tại ${endpoint}:`, e);
                    // Bắt luôn lỗi safety được ném ra từ bên trong để break hẳn ra ngoài vòng lặp
                    if (e.message && e.message.includes('tiêu chuẩn an toàn của AI')) {
                        throw e;
                    }
                }
            }
        }

        if (taskId) {
            // Polling check trạng thái của task
            console.log(`[UModelverse Poll] Bắt đầu kiểm tra trạng thái video sinh từ Task ID: ${taskId}...`);
            const maxPolls = 120; // Chờ tối đa 10 phút (120 * 5s)
            let pollCount = 0;

            // Xây dựng các format URL check status
            let checkUrl = taskEndpointUsed.includes('/tasks/submit') || taskEndpointUsed.includes('/tasks')
                ? `${url}/tasks/status?task_id=${taskId}`
                : `${taskEndpointUsed}/${taskId}`;

            while (pollCount < maxPolls) {
                pollCount++;
                console.log(`[Poll Attempt ${pollCount}/${maxPolls}] Querying: ${checkUrl}`);
                try {
                    let response = await fetch(checkUrl, { method: 'GET', headers });

                    // Fallback thử cả dạng path param /tasks/:id nếu bị 404
                    if (!response.ok) {
                        const fallbackUrl = `${url}/tasks/${taskId}`;
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
                            const videoUrl = data.video_url || data.url || data.output?.video_url || data.output?.url || data.output?.video || data.data?.url || (data.output?.urls && data.output.urls[0]) || data.data?.video_url;
                            if (videoUrl) {
                                console.log(`[Poll Success] Video đã tạo xong! Tiến hành download: ${videoUrl}`);
                                return await this.downloadVideoAsBase64(videoUrl);
                            } else {
                                throw new Error("Task báo Success nhưng không tìm thấy URL video trong JSON.");
                            }
                        } else if (statusVal === 'failed' || statusVal === 'failure' || statusVal === 'error') {
                            let errMessage = data.error_message || data.output?.error_message || data.error?.message || data.output?.error || data.message || "Task thất bại.";

                            if (typeof errMessage === 'string') {
                                if (errMessage.toLowerCase().includes('violate') || errMessage.toLowerCase().includes('safety')) {
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
            throw new Error(`Quá thời gian chờ tạo video qua proxy (10 phút). Task ID: ${taskId}`);
        }

        if (!taskId && lastErrorMsg) {
            const errStr = lastErrorMsg.toLowerCase();
            if (errStr.includes('sensitive') || errStr.includes('privacyinformation') || errStr.includes('real person') || errStr.includes('violate') || errStr.includes('safety')) {
                throw new Error("Hình ảnh hoặc nội dung vi phạm tiêu chuẩn an toàn của AI (có thể AI nhận diện nhầm là ảnh người thật, bạo lực, nhạy cảm...). Vui lòng thử hình/từ khoá khác.");
            }
        }

        // --- BƯỚC 2: FALLBACK SANG CƠ CHẾ SYNCHRONOUS TRUYỀN THỐNG (IMAGES/GENERATIONS) ---
        console.log(`[UModelverse Sync Fallback] Không tìm thấy hoặc lỗi tạo Asynchronous Task. Fallback qua /images/generations...`);

        let sizeVal = '1280x720';
        if (aspectRatio === '9:16') {
            sizeVal = '720x1280';
        } else if (aspectRatio === '1:1') {
            sizeVal = '1024x1024';
        } else if (aspectRatio === '4:3') {
            sizeVal = '1024x768';
        } else if (aspectRatio === '3:4') {
            sizeVal = '768x1024';
        }

        const candidateRequests: any[] = [
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

        lastErrorMsg = '';
        let lastResponseStatus = 200;

        for (let i = 0; i < candidateRequests.length; i++) {
            const currentBody = candidateRequests[i];
            console.log(`UModelverse video attempt ${i} (Body structure):`, JSON.stringify(currentBody));

            try {
                const response = await fetch(`${url}/images/generations`, {
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

    refreshConfig() {
        this._aiInstance = undefined;
        this._currentKey = '';
        this._umodelverseUrl = '';
        this._umodelverseKey = '';
        this.syncConfigFromStorage();
    }
}
