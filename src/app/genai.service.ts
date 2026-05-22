import { Injectable, computed, signal } from '@angular/core';
import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';
import { MultiAccountService } from './modules/_services/multi-account.service';

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

    constructor(
        private multiAccountService: MultiAccountService
    ) { }

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
                this._umodelverseUrl = '';
                this._umodelverseKey = '';
                return;
            }

            const settings = settingsRaw;
            
            // Cập nhật cấu hình Mì Tôm AI
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
            this._umodelverseUrl = '';
            this._umodelverseKey = '';
            this._umodelverseChatModel = '';
            this._umodelverseImageModel = '';
        }
    }

    public isUModelverseEnabled(): boolean {
        this.syncConfigFromStorage();
        return !!this._umodelverseUrl;
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
        if (params.model === 'gemini-3-flash-preview') {
            params.model = 'gemini-3-flash-preview';
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
            if (this.isUModelverseEnabled()) {
                return await this.generateWithUModelverse(params);
            } else {
                if (!this._currentKey) {
                    console.error("API Key is missing in localStorage.");
                    throw new Error("API Key không hợp lệ hoặc chưa được cấu hình.");
                }
                const aiInstance = this.googleAi;
                if (!aiInstance) throw new Error("GoogleGenAI chưa được khởi tạo.");
                return await aiInstance.models.generateContent(params);
            }
        } catch (error) {
            console.error("Lỗi AI API:", error);
            throw error;
        } finally {
            this._stop(scope);
        }
    }

    private async generateWithUModelverse(params: GenerateContentParameters): Promise<any> {
        const url = this._umodelverseUrl;
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

        // Xử lý systemInstruction
        if (params.config && params.config.systemInstruction) {
            let sysContent = '';
            if (typeof params.config.systemInstruction === 'string') {
                sysContent = params.config.systemInstruction;
            } else if ((params.config.systemInstruction as any).parts) {
                sysContent = (params.config.systemInstruction as any).parts.map((p: any) => p.text).join('\n');
            }
            if (sysContent) {
                messages.push({ role: 'system', content: sysContent });
            }
        }

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
                                }
                                return {
                                    type: 'image_url',
                                    image_url: { url: `data:${mimeType};base64,${p.inlineData.data}` }
                                };
                            }
                            return { type: 'text', text: p.text || '' };
                        });
                        messages.push({ role, content: mappedParts });
                    }
                }
            }
        }

        const overrideModel = params.model === 'gemini-3-flash-preview' ? null : params.model;
        
        const body: any = {
            model: overrideModel || this._umodelverseChatModel || 'gpt-4o',
            messages: messages,
            temperature: params.config?.temperature,
            max_tokens: params.config?.maxOutputTokens || 8192,
            top_p: params.config?.topP,
        };

        if (params.config?.responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }

        const response = await fetch(`${url}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error((data.error && data.error.message) || `HTTP Error: ${response.status}`);
        }

        // Fake GenerateContentResponse format
        const replyText = data.choices?.[0]?.message?.content || '';
        return {
            get text() { return replyText; },
            candidates: [
                {
                    content: {
                        parts: [ { text: replyText } ],
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
        if (params.contents && (params.contents as any).length > 0) {
            const firstContent = params.contents[0];
            if (firstContent.parts) {
                // Chỉ trích xuất phần text, bỏ qua phần reference images nhị phân (inlineData) để tránh lỗi định dạng prompt
                promptText = firstContent.parts
                    .filter((p: any) => p.text)
                    .map((p: any) => p.text)
                    .join(' ');
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

        const body: any = {
            model: activeModel,
            prompt: promptText,
            n: 1,
            size: size,
            response_format: 'b64_json'
        };

        console.log(`[UModelverse Image] Gửi yêu cầu tạo ảnh: model = ${activeModel}, size = ${size}`);

        let response = await fetch(`${url}/images/generations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        let data = await response.json();

        // --- LỚP DỰ PHÒNG 1: THỬ LẠI KHÔNG DÙNG response_format NẾU BỊ LỖI (VÌ NHIỀU PROXY BỊ CRASH 500 VỚI B64_JSON) ---
        if (!response.ok && body.response_format) {
            console.warn("[UModelverse Image] Yêu cầu thất bại hoặc gặp lỗi 500. Đang thử lại mà không gửi 'response_format'...");
            const fallbackBody = { ...body };
            delete fallbackBody.response_format;
            
            try {
                const retryRes = await fetch(`${url}/images/generations`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(fallbackBody)
                });
                const retryData = await retryRes.json();
                if (retryRes.ok) {
                    response = retryRes;
                    data = retryData;
                    delete body.response_format; // Cập nhật lại body chính để các khâu sau đồng bộ
                }
            } catch (err) {
                console.error("[UModelverse Image response_format Retry Exception]", err);
            }
        }

        // --- LỚP DỰ PHÒNG 2: NẾU VẪN LỖI (BẤT KỲ LỖI 400, 404, 500 NÀO), QUÉT DANH SÁCH /models ĐỂ THAY THẾ MODEL KHẢ DỤNG ---
        if (!response.ok) {
            console.warn(`[UModelverse Image Warning] Tạo ảnh thất bại (${response.status}): ${data?.error?.message || 'Unknown'}. Đang tự động quét tìm model sinh ảnh khả dụng từ tài khoản của bạn...`);
            try {
                const modelsRes = await fetch(`${url}/models`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this._umodelverseKey}`
                    }
                });
                if (modelsRes.ok) {
                    const modelsData = await modelsRes.json();
                    if (modelsData && Array.isArray(modelsData.data)) {
                        const modelIds = modelsData.data.map((m: any) => m.id);
                        console.log("[UModelverse Image] Các model khả dụng trên tài khoản của bạn:", modelIds);
                        
                        // Ưu tiên tìm các model sinh ảnh phổ biến trong tài khoản proxy (Flux, Dall-E, SD, v.v.)
                        const alternativeModel = modelIds.find((id: string) => {
                            const lid = id.toLowerCase();
                            return (lid.includes('flux') || lid.includes('dall') || lid.includes('sdxl') || lid.includes('stable-diffusion') || lid.includes('playground') || lid.includes('art') || lid.includes('mj') || lid.includes('midjourney')) && id !== activeModel;
                        });
                        
                        if (alternativeModel) {
                            console.log(`[UModelverse Image Fallback] Đã tìm thấy model ảnh thay thế: '${alternativeModel}'. Bắt đầu thử tạo lại...`);
                            body.model = alternativeModel;
                            activeModel = alternativeModel;
                            
                            // Tiến hành gọi lại với model thay thế mới tìm được
                            response = await fetch(`${url}/images/generations`, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(body)
                            });
                            data = await response.json();
                        }
                    }
                }
            } catch (err) {
                console.error("[UModelverse Image Dynamic Fallback Exception]", err);
            }
        }

        // --- LỚP DỰ PHÒNG 3: NẾU VẪN LỖI DO response_format SAU KHI ĐÃ ĐỔI MODEL ---
        if (!response.ok && data?.error && body.response_format && (
            data.error.message?.includes('response_format') ||
            data.error.message?.includes('Unknown parameter')
        )) {
            console.warn("[UModelverse Image] Model mới không hỗ trợ response_format. Thử lại không dùng tham số này...");
            delete body.response_format;
            response = await fetch(`${url}/images/generations`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            data = await response.json();
        }

        if (!response.ok) {
            throw new Error((data?.error && data.error.message) || `HTTP Error: ${response.status}`);
        }

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

        if (!b64) throw new Error("Không nhận được dữ liệu ảnh (base64 hoặc URL) từ OpenAI image generation");

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
    }

    async generateText(
        params: GenerateContentParameters,
        scope?: Scope
    ): Promise<string> {
        try {
            const res = await this.generateContent(params, scope);

            const candidate = res.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.text) {
                return candidate.content.parts[0].text;
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
        duration?: number
    ): Promise<string> {
        this.syncConfigFromStorage();
        
        const url = this._umodelverseUrl;
        const key = this._umodelverseKey;
        const model = this._umodelverseVideoModel || 'cogvideox-5b';
        
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
                            id.toLowerCase().includes('sora')
                        );
                        const errorMsg = `Model [${model}] không được hỗ trợ bởi tài khoản proxy của bạn. Danh sách các model video đang có sẵn: ${videoModels.join(', ') || 'Không tìm thấy model video nào, danh sách tất cả: ' + modelIds.slice(0, 10).join(', ')}`;
                        console.error(`[UModelverse Error] ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                }
            } else {
                console.warn(`[UModelverse] Không thể tải danh sách model, HTTP status: ${modelsRes.status}`);
            }
        } catch (e: any) {
            console.error("[UModelverse Model Check Exception]", e);
            if (e.message && e.message.includes("không được hỗ trợ bởi tài khoản proxy")) {
                throw e;
            }
        }

        // Chuẩn hoá referenceImages sang các định dạng phổ biến cho Video model
        let refBase64Raw = '';
        let refBase64DataUri = '';
        if (referenceImages && referenceImages.length > 0) {
            const firstImg = referenceImages[0];
            refBase64Raw = firstImg.image?.imageBytes || (typeof firstImg === 'string' ? firstImg : '');
            if (refBase64Raw && !refBase64Raw.startsWith('data:')) {
                refBase64DataUri = `data:image/png;base64,${refBase64Raw}`;
            } else if (refBase64Raw.startsWith('data:')) {
                refBase64DataUri = refBase64Raw;
                refBase64Raw = refBase64Raw.split(',')[1];
            }
        }

        // --- BƯỚC 1: THỬ QUA CÁC ENDPOINT ASYNC TASK (PHÙ HỢP CHO VIDEO MODELS TRÊN UMODELVERSE) ---
        const candidateTaskRequests: any[] = [
            // Option 0: Nested standard with Data URI (phổ biến nhất cho Wan/Kling/Vidu trên proxy)
            {
                model: model,
                input: {
                    prompt: prompt,
                    ...(refBase64DataUri ? {
                        image: refBase64DataUri,
                        image_url: refBase64DataUri,
                        ref_image: refBase64DataUri
                    } : {})
                },
                parameters: {
                    aspect_ratio: aspectRatio || '16:9',
                    duration: duration || 5
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
                    } : {})
                },
                parameters: {
                    aspect_ratio: aspectRatio || '16:9',
                    duration: duration || 5
                }
            },
            // Option 2: Flat payload standard with Data URI
            {
                model: model,
                prompt: prompt,
                aspect_ratio: aspectRatio || '16:9',
                duration: duration || 5,
                ...(refBase64DataUri ? {
                    image: refBase64DataUri,
                    image_url: refBase64DataUri,
                    first_frame_image: refBase64DataUri
                } : {})
            },
            // Option 3: Flat payload with raw base64
            {
                model: model,
                prompt: prompt,
                aspect_ratio: aspectRatio || '16:9',
                duration: duration || 5,
                ...(refBase64Raw ? {
                    image: refBase64Raw,
                    image_url: refBase64Raw
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

        let taskId = '';
        let taskEndpointUsed = '';
        
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
                console.log(`[Task Attempt] endpoint: ${endpoint}, payload Option ${i}:`, JSON.stringify(currentBody));
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(currentBody)
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const idVal = data.task_id || data.id || data.output?.task_id || data.data?.task_id || data.data?.id;
                        if (idVal) {
                            taskId = idVal;
                            taskEndpointUsed = endpoint;
                            console.log(`[Task Success] Tạo task thành công! ID: ${taskId} qua endpoint: ${endpoint}`);
                            break;
                        }
                    } else {
                        const errText = await response.text();
                        console.warn(`[Task Failed] Endpoint ${endpoint} trả về HTTP ${response.status}:`, errText);
                    }
                } catch (e) {
                    console.warn(`[Task Exception] Ngoại lệ tại ${endpoint}:`, e);
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
                        const statusVal = (data.task_status || data.status || data.state || data.data?.status || data.output?.status || '').toLowerCase();
                        
                        console.log(`[Poll Response] Task status: ${statusVal}`);

                        if (statusVal === 'success' || statusVal === 'succeeded' || statusVal === 'completed' || statusVal === 'done') {
                            const videoUrl = data.video_url || data.url || data.output?.video_url || data.output?.url || data.output?.video || data.data?.url || (data.output?.urls && data.output.urls[0]) || data.data?.video_url;
                            if (videoUrl) {
                                console.log(`[Poll Success] Video đã tạo xong! Tiến hành download: ${videoUrl}`);
                                return await this.downloadVideoAsBase64(videoUrl);
                            } else {
                                throw new Error("Task báo Success nhưng không tìm thấy URL video trong JSON.");
                            }
                        } else if (statusVal === 'failed' || statusVal === 'failure' || statusVal === 'error') {
                            const errMessage = data.error_message || data.error?.message || data.message || "Task thất bại.";
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

        let lastErrorMsg = '';
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
