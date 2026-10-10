import { Injectable, computed, signal } from '@angular/core';
import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';
import { MultiAccountService } from './_services/multi-account.service';
import { getModelverseConfig, getTextModelConfig } from './modelverse.config';
import { ToastrService } from 'ngx-toastr';

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
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService
    ) { }

    /**
     * Upload ảnh base64 lên CDN (cdn1.type.vn) và trả về URL HTTPS.
     * CDN server chạy ở localhost:3333, endpoint POST /upload, field name 'files'.
     * Dùng cho Kling API vì UModelverse proxy không hỗ trợ ConvertImageRequest.
     */
    public async uploadBase64ToCdn(base64Data: string, filename?: string, folder?: string): Promise<string | null> {
        try {
            // Chuyển base64 thành Blob
            let mimeType = 'image/jpeg';
            let rawBase64 = base64Data;
            if (base64Data.startsWith('data:')) {
                const match = base64Data.match(/^data:([a-zA-Z0-9]+\/[^;]+);base64,/);
                if (match) mimeType = match[1];
                rawBase64 = base64Data.split(',')[1];
            }

            const dataUri = `data:${mimeType};base64,${rawBase64}`;
            const fileResp = await fetch(dataUri);
            const blob = await fileResp.blob();

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

    private getSettingsFromStorage(): any {
        try {
            let settings = this.multiAccountService.getItem('settings') || {};
            
            const localSettings = localStorage.getItem('settings');
            if (localSettings) {
                const parsed = JSON.parse(localSettings);
                if (parsed && typeof parsed === 'object') {
                    settings = { ...settings, ...parsed };
                }
            }

            if (settings && Object.keys(settings).length > 0) return settings;

            const sessionData = localStorage.getItem('sessionData');
            if (sessionData) {
                const parsed = JSON.parse(sessionData);
                if (parsed && parsed.settings) return parsed.settings;
            }
        } catch (e) {}
        return {};
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

    public async getUModelverseModels(): Promise<string[]> {
        this.syncConfigFromStorage();
        if (!this.isUModelverseEnabled()) {
            return [];
        }
        try {
            const modelsEndpoint = this._umodelverseUrl.endsWith('/v1')
                ? `${this._umodelverseUrl}/models`
                : `${this._umodelverseUrl}/v1/models`;
            const modelsRes = await fetch(modelsEndpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this._umodelverseKey}`
                }
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

        // Restore model compatibility with existing UModelverse config
        const bypassModelOverride = (params.config as any)?.bypassModelOverride === true;
        const settingsRaw = this.getSettingsFromStorage();
        let isAiAgentActive = settingsRaw?.enableAiAgent === true;
        if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
            try {
                const list = await (window as any).electronAPI.getPluginsStatus();
                const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                if (aiAgent && aiAgent.enabled !== undefined) {
                    isAiAgentActive = aiAgent.enabled === true;
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
            if (isImageRequest && this._umodelverseImageModel) {
                // Nếu người dùng đã cài đặt model ảnh riêng trong Mì Tôm AI, ưu tiên dùng model đó
                params.model = this._umodelverseImageModel;
            } else if (isImageRequest && !isImageEdit && (!params.model || params.model.includes('gemini-') && !params.model.includes('image') || params.model.includes('claude'))) {
                params.model = this._umodelverseImageModel || 'dall-e-3';
            } else if (!bypassModelOverride && !isImageEdit) {
                if (params.model?.startsWith('gemini-3.8-flash') || params.model?.startsWith('gemini-3.7-flash') || params.model?.startsWith('gemini-3.6-flash')) {
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
                    console.warn(`[GenaiService] Mì Tôm AI lỗi (${uErr?.message || uErr}). Đang chuyển sang tầng tiếp theo...`);
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

            for (let i = 0; i < shuffledKeys.length; i++) {
                const key = shuffledKeys[i];
                    try {
                        let aiInstance = this._aiInstance;
                        if (key !== this._currentKey || !aiInstance) {
                            aiInstance = new GoogleGenAI({ apiKey: key });
                        }

                        let googleModel = params.model;
                        if (!googleModel || googleModel === 'agent') {
                            googleModel = isImageEdit ? 'gemini-3.1-flash-image-preview' : 'gemini-2.5-flash';
                        }
                        const candidateGoogleModels = isImageEdit ? [
                            googleModel,
                            'gemini-3.1-flash-image-preview',
                            'gemini-2.5-flash-image',
                            'gemini-3-pro-image-preview'
                        ].filter((v, idx, arr) => arr.indexOf(v) === idx && v && v.startsWith('gemini-')) : [
                            googleModel,
                            'gemini-2.5-flash',
                            'gemini-2.5-pro',
                            'gemini-1.5-flash',
                            'gemini-1.5-pro'
                        ].filter((v, idx, arr) => arr.indexOf(v) === idx && v && v.startsWith('gemini-'));

                        // Lọc sạch config chuẩn cho Google GenAI SDK
                        const cleanConfig: any = {};
                        if (params.config) {
                            if (params.config.maxOutputTokens) cleanConfig.maxOutputTokens = params.config.maxOutputTokens;
                            if (params.config.temperature !== undefined) cleanConfig.temperature = params.config.temperature;
                            if (params.config.topP !== undefined) cleanConfig.topP = params.config.topP;
                            if (params.config.topK !== undefined) cleanConfig.topK = params.config.topK;
                            if (params.config.systemInstruction) cleanConfig.systemInstruction = params.config.systemInstruction;
                            if (params.config.responseMimeType) cleanConfig.responseMimeType = params.config.responseMimeType;
                            if (params.config.responseSchema) cleanConfig.responseSchema = params.config.responseSchema;
                            if (params.config.responseModalities) cleanConfig.responseModalities = params.config.responseModalities;
                            if ((params.config as any).imageConfig) cleanConfig.imageConfig = (params.config as any).imageConfig;
                        }

                        let result;
                        let googleErr: any = null;
                        for (const m of candidateGoogleModels) {
                            try {
                                result = await aiInstance.models.generateContent({
                                    ...params,
                                    model: m,
                                    config: Object.keys(cleanConfig).length > 0 ? cleanConfig : undefined
                                });
                                if (result) break;
                            } catch (mErr: any) {
                                googleErr = mErr;
                                console.warn(`[GenaiService] Model ${m} lỗi trên Google AI:`, mErr?.message || mErr);
                            }
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
                        console.warn(`GenaiService: Lỗi với API Key ${key.substring(0, 8)}... - Thử key tiếp theo nếu có.`, error);
                        lastError = error;
                        // Nếu là lỗi cuối cùng thì ném ra ngoài
                        if (i === shuffledKeys.length - 1) {
                            if (lastError && String(lastError).includes('429')) {
                                throw new Error(`Tất cả ${shuffledKeys.length} API Key của bạn đều đã hết hạn mức (Quota Exceeded). Vui lòng thêm key mới hoặc chờ ngày mai!`);
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

        // Bổ sung max_turns cho Agent
        const maxTurns = (params.config as any)?.maxTurns || (params.config as any)?.max_turns || settings.aiAgentMaxTurns || 25;
        formData.append('max_turns', String(maxTurns));

        this.localAgentAbortController = new AbortController();
        let isAiAgentActive = false;
        let secretApiKey = 'type-vn-local-agent-2026';
        const targetEndpoint = isImageRequest ? '/api/image' : '/api/chat';
        let apiUrl = `https://agent.type.vn${targetEndpoint}`; // Fallback for Web/Mobile

        if (settings.enableAiAgent === true) {
            isAiAgentActive = true;
        }

        if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
            try {
                const list = await (window as any).electronAPI.getPluginsStatus();
                const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                if (aiAgent && aiAgent.enabled !== undefined) {
                    isAiAgentActive = aiAgent.enabled === true;
                    if (aiAgent.apiKey) secretApiKey = aiAgent.apiKey;
                }
            } catch(e) {}
            if (settings.aiAgentApiKey && secretApiKey === 'type-vn-local-agent-2026') {
                secretApiKey = settings.aiAgentApiKey;
            }
            if (secretApiKey && (secretApiKey.startsWith('http://') || secretApiKey.startsWith('https://'))) {
                // Giả định cú pháp setting là: URL|API_KEY (VD: https://agent.type.vn|my-secret)
                const parts = secretApiKey.split('|');
                const baseUrlClean = parts[0].replace(/\/api\/(chat|image)\/?$/, '');
                apiUrl = baseUrlClean + targetEndpoint;
                secretApiKey = parts[1] || 'type-vn-local-agent-2026';
            } else {
                apiUrl = `https://agent.type.vn${targetEndpoint}`;
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
                throw new Error(`AI Agent phản hồi lỗi HTTP ${response.status}`);
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
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        };

        const isImageGeneration = params.config?.responseModalities?.includes('IMAGE');
        const isVideoGeneration = params.config?.responseModalities?.includes('VIDEO');

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
                            
                            if (!refType) {
                                refType = i === 0 ? 'START_FRAME' : 'CONTROL_IMAGE';
                            } else if (refType === 'first_frame') {
                                refType = 'START_FRAME';
                            } else if (refType === 'last_frame') {
                                refType = 'END_FRAME';
                            }

                            referenceImages.push({
                                referenceType: refType,
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
            const configDuration = (params.config as any)?.duration || 5;
            const b64 = await this.generateVideoUModelverse(promptText, configRatio, referenceImages, configDuration, undefined, overrideModel);
            
            return {
                video: {
                    base64: b64
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
        let targetModel = overrideModel || this._umodelverseChatModel || (hasAudio ? 'gemini-2.5-flash' : 'gpt-4o');
        if (targetModel === 'agent') {
            targetModel = this._umodelverseChatModel || (hasAudio ? 'gemini-2.5-flash' : 'gpt-4o');
        }
        const config = getTextModelConfig(targetModel);

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

        if (this.aiAgentCustomInstructions) {
            sysContent += `\n\n--- HƯỚNG DẪN DÀNH CHO AI AGENT (CONTEXT TỪ MÀN HÌNH HIỆN TẠI) ---\n${this.aiAgentCustomInstructions}\n--- HẾT HƯỚNG DẪN ---`;
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
            if ((params as any).tools) {
                body.tools = (params as any).tools;
            }
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
                    body.max_tokens = targetModel.includes('doubao') ? Math.min(params.config.maxOutputTokens, 4096) : params.config.maxOutputTokens;
                }
            } else if (!isReasoningModel) {
                body.max_tokens = targetModel.includes('doubao') ? 4096 : 8192;
            }

            // Tạm thời tắt để tránh lỗi regex trên UModelverse proxy
            // if (params.config?.responseMimeType === 'application/json' && !isReasoningModel) {
            //     body.response_format = { type: 'json_object' };
            // }

            if (config.extraParams) {
                Object.assign(body, config.extraParams);
            }
        }

        let finalUrl = (url || '').trim();
        finalUrl = finalUrl
            .replace(/\/v1\/chat\/completions\/?$/i, '')
            .replace(/\/chat\/completions\/?$/i, '')
            .replace(/\/v1\/?$/i, '')
            .replace(/\/v1beta\/?$/i, '');
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
        
        const isImageEdit = (params.config as any)?.isImageEdit === true;
        let overrideModel = params.model;
        if (!isImageEdit && (overrideModel === 'gemini-3-pro-image' || overrideModel === 'imagen-3.0-generate-002' || overrideModel === 'agent')) {
            overrideModel = null;
        }
        let model = overrideModel || this._umodelverseImageModel || 'dall-e-3';
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
            let baseUrl = url.replace(/\/v1\/?$/, '');
            const geminiUrl = `${baseUrl}/v1beta/models/${activeModel}:generateContent`;

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
                geminiBody.generationConfig = {
                    responseModalities: ["TEXT", "IMAGE"],
                    imageConfig: { imageSize: "1K" }
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
                    return geminiData;
                } else {
                    console.warn(`[UModelverse Image] Gemini Compatible Interface thất bại (mã ${geminiResponse.status}):`, geminiData?.error?.message || geminiResponseText);
                    // Nếu proxy UModelverse không hỗ trợ endpoint Gemini Native /v1beta/models, chuyển activeModel sang model hình ảnh Mì Tôm AI (hoặc dall-e-3) để tiếp tục thử OpenAI format
                    if (this._umodelverseImageModel && this._umodelverseImageModel !== activeModel) {
                        activeModel = this._umodelverseImageModel;
                    } else if (activeModel.includes('gemini')) {
                        activeModel = this._umodelverseImageModel || 'dall-e-3';
                    }
                }
            } catch (e: any) {
                console.warn(`[UModelverse Image] Lỗi khi gọi Gemini Interface:`, e.message);
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
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    aspect_ratio: ratioStr,
                    image: b64DataUris[0],
                    ref_image: b64DataUris[0],
                    images: b64DataUris
                },
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    aspect_ratio: ratioStr,
                    image: b64DataUris[0],
                    ref_image: b64DataUris[0]
                },
                {
                    model: activeModel,
                    prompt: promptText,
                    n: 1,
                    size: size,
                    aspect_ratio: ratioStr,
                    images: b64DataUris
                },
                {
                    model: activeModel,
                    prompt: promptText,
                    image: b64DataUris[0],
                    ref_image: b64DataUris[0]
                },
                {
                    model: activeModel,
                    prompt: promptText,
                    images: b64DataUris
                }
            );
        } else {
            candidateRequests.push({
                model: activeModel,
                prompt: promptText,
                n: 1,
                size: size,
                aspect_ratio: ratioStr
            });
        }

        // Option: Format siêu tối giản (bỏ n, size, image) để bypass các strict validation của model khác
        candidateRequests.push({
            model: activeModel,
            prompt: promptText
        });

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
        let model = overrideModel;
        if (model && (model.includes('gemini') || model === 'agent')) {
            model = null;
        }
        model = model || this._umodelverseVideoModel || 'cogvideox-5b';

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        };

        // --- KIỂM TRA MODEL CÓ ĐƯỢC HỖ TRỢ TRÊN PROXY KHÔNG ---
        try {
            const modelsEndpoint = url.endsWith('/v1') ? `${url}/models` : `${url}/v1/models`;
            console.log(`[UModelverse] Đang kiểm tra danh sách model được hỗ trợ từ: ${modelsEndpoint} ...`);
            const modelsRes = await fetch(modelsEndpoint, {
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
        let refBase64RawOriginal = ''; // Giữ lại bản base64 gốc cho các model cần (Kling v3 motion)
        let refBase64DataUri = '';
        let refBase64CdnUrl = ''; // URL CDN sau khi upload
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
                refBase64RawOriginal = refBase64Raw; // Lưu bản base64 gốc
                
                // Upload ảnh lên CDN để tránh gửi chuỗi base64 quá lớn làm lỗi API proxy
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
                        mode: 'std',
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
                        resolution: '720p',
                        generate_audio: false,
                        duration: veoDuration
                    }
                };
            } else if (config.payloadFormat === 'doubao_sdk') {
                const contentArr: any[] = [];
                if (prompt) {
                    contentArr.push({ type: 'text', text: prompt });
                }

                if (refBase64Raw) {
                    contentArr.push({ type: 'image_url', image_url: { url: config.useDataUri && !refBase64Raw.startsWith('http') ? `data:${refMimeType || 'image/jpeg'};base64,${refBase64Raw}` : refBase64Raw } });
                }
                if (endRefBase64Raw) {
                    contentArr.push({ type: 'image_url', image_url: { url: config.useDataUri && !endRefBase64Raw.startsWith('http') ? `data:${endRefMimeType || 'image/jpeg'};base64,${endRefBase64Raw}` : endRefBase64Raw } });
                }

                let parsedSeed = undefined;
                if (seed !== undefined && seed !== null && String(seed).trim() !== '') {
                    const num = Number(seed);
                    if (!isNaN(num)) {
                        parsedSeed = num;
                    }
                }

                const seedParams = parsedSeed !== undefined ? { seed: parsedSeed } : {};
                const commonParams = {
                    ratio: aspectRatio || '16:9',
                    duration: Math.max(4, Math.min(10, Math.round(duration || config.defaultDuration || 5))),
                    ...seedParams
                };

                // Option 0: Format chuẩn Volcengine Ark (có input và parameters)
                candidateTaskRequests.push({
                    model: model,
                    input: { 
                        prompt: prompt,
                        image_url: refBase64CdnUrl || refBase64Raw,
                        content: contentArr 
                    },
                    parameters: commonParams
                });

                // Option 1: Format có input nhưng ratio/duration ở root
                candidateTaskRequests.push({
                    model: model,
                    input: { 
                        prompt: prompt,
                        image_url: refBase64CdnUrl || refBase64Raw,
                        content: contentArr 
                    },
                    ...commonParams
                });

                // Option 2: Format phẳng hoàn toàn (Doubao API flat format)
                candidateTaskRequests.push({
                    model: model,
                    prompt: prompt,
                    image_url: refBase64CdnUrl || refBase64Raw,
                    content: contentArr,
                    ...commonParams
                });
                
                payload = null; // Do not push again at the end
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
                        resolution: "720p",
                        ...( (!firstFrameBase64Raw && !lastFrameBase64Raw && !imgUrlBase64Raw) ? { aspect_ratio: aspectRatio || '16:9' } : {} ),
                        duration: Math.ceil(duration || config.defaultDuration || 5),
                        ...(seed !== undefined && seed !== null ? { seed: seed } : {})
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

        const baseNoV1 = url.replace(/\/v1\/?$/i, '');
        const baseWithV1 = url.endsWith('/v1') ? url : `${url}/v1`;

        const taskEndpoints = [
            `${url}/tasks/submit`,
            `${url}/tasks`,
            `${url}/videos/generations`,
            `${baseNoV1}/tasks/submit`,
            `${baseNoV1}/tasks`,
            `${baseWithV1}/videos/generations`,
            `${baseWithV1}/tasks/submit`,
            `${baseWithV1}/tasks`
        ].filter((ep, idx, arr) => arr.indexOf(ep) === idx);

        console.log(`[UModelverse Async Video] Trực tiếp thử gửi yêu cầu dạng Asynchronous Task...`);
        for (const endpoint of taskEndpoints) {
            if (taskId) break;
            for (let i = 0; i < candidateTaskRequests.length; i++) {
                if (taskId) break;
                const currentBody = candidateTaskRequests[i];


                console.error(`[Task Attempt] endpoint: ${endpoint}, payload Option ${i}:`, JSON.stringify(currentBody));
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
                            const videoUrl = data.video_url || data.url || (data.urls && data.urls[0]) || data.output?.video_url || data.output?.url || data.output?.video || data.data?.url || (data.output?.urls && data.output.urls[0]) || data.data?.video_url;
                            if (videoUrl) {
                                console.log(`[Poll Success] Video đã tạo xong! Tiến hành download: ${videoUrl}`);
                                return await this.downloadVideoAsBase64(videoUrl);
                            } else {
                                throw new Error("Task báo Success nhưng không tìm thấy URL video trong JSON.");
                            }
                        } else if (statusVal === 'failed' || statusVal === 'failure' || statusVal === 'error') {
                            let errMessage = data.error_message || data.output?.error_message || data.error?.message || data.output?.error || data.message || "Task thất bại.";

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
            throw new Error(`Quá thời gian chờ tạo video qua proxy (10 phút). Task ID: ${taskId}`);
        }

        if (!taskId && lastErrorMsg) {
            const errStr = lastErrorMsg.toLowerCase();
            if (errStr.includes('sensitive') || errStr.includes('privacyinformation') || errStr.includes('real person') || errStr.includes('violate') || errStr.includes('safety')) {
                throw new Error("Hình ảnh hoặc nội dung vi phạm tiêu chuẩn an toàn của AI (có thể AI nhận diện nhầm là ảnh người thật, bạo lực, nhạy cảm...). Vui lòng thử hình/từ khoá khác.");
            }
        }

        // Nếu là motion-control model, không fallback sang /images/generations
        if (!taskId && config && config.payloadFormat === 'kling_v3_motion') {
            throw new Error(`Lỗi tạo video Motion Control: ${lastErrorMsg || 'Proxy không phản hồi. Kiểm tra API key và quyền truy cập model.'}`);
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
                model: 'gemini-2.5-flash',
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
                model: 'gemini-2.5-flash',
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
}
