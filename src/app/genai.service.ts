import { Injectable, computed, signal } from '@angular/core';
import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';

type Scope = string | number;

@Injectable({ providedIn: 'root' })
export class GenaiService {
    // --- loading toàn cục ---
    private _active = signal(0);
    readonly isLoading = computed(() => this._active() > 0);

    // --- loading theo scope ---
    private _scopes = signal<Record<string, number>>({});

    private _aiInstance?: GoogleGenAI;
    // Lưu trữ key hiện tại để kiểm tra mà không cần truy cập vào private property của SDK
    private _currentKey: string = '';

    /**
     * Lấy instance của GoogleGenAI. 
     */
    private get ai(): GoogleGenAI {
        const settingsRaw = localStorage.getItem('settings');
        const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
        const key = settings.secretKey ? settings.secretKey.split(';')[0] : '';

        // Nếu instance chưa tồn tại hoặc key trong storage khác với key đang dùng
        if (!this._aiInstance || this._currentKey !== key) {
            this._currentKey = key;
            this._aiInstance = new GoogleGenAI({ apiKey: key });
        }

        return this._aiInstance;
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
        // Sử dụng _currentKey để kiểm tra thay vì this.ai.apiKey
        if (!this._currentKey) {
            console.error("API Key is missing in localStorage.");
            throw new Error("API Key không hợp lệ hoặc chưa được cấu hình.");
        }

        this._start(scope);
        try {
            return await this.ai.models.generateContent(params);
        } finally {
            this._stop(scope);
        }
    }

    async generateText(
        params: GenerateContentParameters,
        scope?: Scope
    ): Promise<string> {
        try {
            const res = await this.generateContent(params, scope);
            return (res as any)?.text ?? '';
        } catch (error) {
            console.error("Lỗi khi generate text:", error);
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

    /**
     * Reset instance để force load lại key mới từ localStorage
     */
    refreshConfig() {
        this._aiInstance = undefined;
        this._currentKey = '';
    }
}