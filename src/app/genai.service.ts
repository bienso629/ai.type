import { Injectable, computed, signal } from '@angular/core';
import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';

type Scope = string | number;

@Injectable({ providedIn: 'root' })
export class GenaiService {
    // --- State management ---
    private _active = signal(0);
    readonly isLoading = computed(() => this._active() > 0);
    private _scopes = signal<Record<string, number>>({});

    private _aiInstance?: GoogleGenAI;
    private _currentKey: string = '';

    /**
     * Getter xử lý việc khởi tạo instance một cách an toàn.
     * Giải quyết lỗi check key trống bằng cách luôn sync với storage trước.
     */
    private get ai(): GoogleGenAI {
        if (!this._aiInstance) {
            this.syncConfigFromStorage();
        }

        if (!this._aiInstance) {
            throw new Error("GoogleGenAI chưa được khởi tạo. Vui lòng kiểm tra API Key.");
        }

        return this._aiInstance;
    }

    /**
     * Hàm tách biệt để đọc cấu hình, giúp tái sử dụng và xử lý lỗi JSON.
     */
    private syncConfigFromStorage() {
        try {
            const settingsRaw = localStorage.getItem('settings');
            if (!settingsRaw) {
                this._currentKey = '';
                return;
            }

            const settings = JSON.parse(settingsRaw);
            const key = settings.secretKey ? settings.secretKey.split(';')[0] : '';

            if (key && (key !== this._currentKey || !this._aiInstance)) {
                this._currentKey = key;
                this._aiInstance = new GoogleGenAI({ apiKey: key });
                console.log("GenaiService: Đã cập nhật API Key mới.");
            }
        } catch (e) {
            console.error("GenaiService: Lỗi parse settings từ localStorage", e);
            this._currentKey = '';
        }
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
        // Đảm bảo instance và key luôn mới nhất trước khi thực hiện request
        this.syncConfigFromStorage();

        if (!this._currentKey) {
            console.error("API Key is missing in localStorage.");
            throw new Error("API Key không hợp lệ hoặc chưa được cấu hình.");
        }

        this._start(scope);
        try {
            return await this.ai.models.generateContent(params);
        } catch (error) {
            console.error("Lỗi API Gemini:", error);
            throw error;
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

            // Cách 1: Truy cập trực tiếp qua candidates (Chuẩn nhất cho SDK hiện tại)
            // Một kết quả thường có danh sách các 'candidates', chúng ta lấy cái đầu tiên.
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

    /**
     * Dùng hàm này khi bạn thay đổi settings ở component khác 
     * để force service nạp lại key.
     */
    refreshConfig() {
        this._aiInstance = undefined;
        this._currentKey = '';
        this.syncConfigFromStorage();
    }
}