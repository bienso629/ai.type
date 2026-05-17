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
    private _umodelverseImageModel: string = '';

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
            this._umodelverseImageModel = settings.umodelverseImageModel?.trim() || '';
            
            // Nếu umodelverseUrl bị thiếu giao thức, thêm vào (mặc định https)
            if (this._umodelverseUrl && !this._umodelverseUrl.startsWith('http')) {
                this._umodelverseUrl = 'https://' + this._umodelverseUrl;
            }
            if (this._umodelverseUrl.endsWith('/')) {
                this._umodelverseUrl = this._umodelverseUrl.slice(0, -1);
            }

            const key = settings.secretKey ? settings.secretKey.split(';')[0] : '';

            if (key && (key !== this._currentKey || !this._aiInstance)) {
                this._currentKey = key;
                this._aiInstance = new GoogleGenAI({ apiKey: key });
                console.log("GenaiService: Đã cập nhật API Key mới.");
            }
        } catch (e) {
            console.error("GenaiService: Lỗi parse settings từ localStorage", e);
            this._currentKey = '';
            this._umodelverseUrl = '';
            this._umodelverseKey = '';
        }
    }

    public isUModelverseEnabled(): boolean {
        return !!(this._umodelverseUrl && this._umodelverseKey);
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
        if (params.model === 'gemini-3.1-flash-preview') {
            params.model = 'gemini-3-flash-preview';
        } else if (params.model === 'gemini-3.1-flash-image-preview') {
            // UModelverse chưa hỗ trợ model tạo ảnh của Gemini, fallback về model tùy chọn hoặc dall-e-3
            params.model = this.isUModelverseEnabled() ? (this._umodelverseImageModel || 'dall-e-3') : 'gemini-3.1-flash-image-preview';
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
        if (params.contents && Array.isArray(params.contents)) {
            for (const content of params.contents) {
                const role = (content as any).role === 'model' ? 'assistant' : 'user';
                const parts = (content as any).parts;
                
                if (parts && parts.length === 1 && parts[0].text && !parts[0].inlineData) {
                    messages.push({ role, content: parts[0].text });
                } else if (parts && parts.length > 0) {
                    const mappedParts = parts.map((p: any) => {
                        if (p.inlineData) {
                            return {
                                type: 'image_url',
                                image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` }
                            };
                        }
                        return { type: 'text', text: p.text || '' };
                    });
                    messages.push({ role, content: mappedParts });
                }
            }
        }

        const body = {
            model: params.model || 'gpt-4o',
            messages: messages,
            temperature: params.config?.temperature,
            max_tokens: params.config?.maxOutputTokens,
            top_p: params.config?.topP,
        };

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
                promptText = firstContent.parts.map((p: any) => p.text).join(' ');
            }
        }

        const size = params.config?.imageConfig?.imageSize || '1024x1024';

        const body = {
            model: params.model || 'dall-e-3',
            prompt: promptText,
            n: 1,
            size: size,
            response_format: 'b64_json'
        };

        const response = await fetch(`${url}/images/generations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error((data.error && data.error.message) || `HTTP Error: ${response.status}`);
        }

        const b64 = data.data?.[0]?.b64_json;
        if (!b64) throw new Error("Không nhận được dữ liệu base64 từ OpenAI image generation");

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