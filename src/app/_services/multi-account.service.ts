import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import * as CryptoJS from 'crypto-js';
import { BehaviorSubject } from 'rxjs';

// TODO: Đưa SECRET_KEY này vào file environment.ts để bảo mật hơn nhé
const SECRET_KEY = 'ai_type_secret_key_2026_!@#';

export interface AccountSession {
    id: string;            // Khóa chính: username hoặc email
    isActive: number;      // 1 là đang dùng, 0 là tài khoản lưu trữ
    encryptedData: string; // Dữ liệu đã mã hóa
}

export interface MediaFile {
    id: string; // Tên file
    file: File;
}

// 1. Khởi tạo IndexedDB với Dexie
export class AppDB extends Dexie {
    sessions!: Table<AccountSession, string>;
    mediaFiles!: Table<MediaFile, string>;

    constructor() {
        super('AiTypeMultiAccountDB');
        this.version(1).stores({
            sessions: 'id, isActive'
        });
        this.version(2).stores({
            sessions: 'id, isActive',
            mediaFiles: 'id'
        });
    }
}

export const db = new AppDB();

@Injectable({
    providedIn: 'root'
})
export class MultiAccountService {
    // Để các component khác có thể subscribe và update UI khi đổi tài khoản
    public activeAccountSubject = new BehaviorSubject<any>(null);
    public activeAccount$ = this.activeAccountSubject.asObservable();

    // Biến Cache lưu dữ liệu trên RAM để truy xuất tức thì (Đồng bộ - Synchronous)
    private currentSessionData: any = {};
    public currentAccountId: string | null = null;

    // Cờ báo hiệu DB đã load xong (dành cho những lúc cần await lúc khởi động app)
    public isReady: Promise<boolean>;

    // Cache RAM cho các file Video/Media dung lượng lớn
    // Bây giờ sẽ được đồng bộ với IndexedDB để sống sót qua F5
    public memoryVideoFiles: { [key: string]: File } = {};

    private syncActiveUserWithElectron(username: string | null): void {
        const electron = (window as any)?.electron;
        if (electron && electron.setActiveLocalUser) {
            electron.setActiveLocalUser({ username: username || 'admin' }).catch(() => {});
        }
    }

    async saveMemoryFile(name: string, file: File): Promise<void> {
        this.memoryVideoFiles[name] = file;
        await this.safeDbCall(async () => {
            await db.mediaFiles.put({ id: name, file: file });
        }, undefined);
    }

    constructor() {
        // Tải dữ liệu lên Cache ngay khi Service khởi tạo
        this.isReady = this.loadActiveAccount().then(() => true);
    }

    // ==========================================
    // 1. CÁC HÀM "ĐÓNG THẾ" CHO LOCALSTORAGE
    // ==========================================

    private saveTimeout: any;

    /**
     * Thay thế cho localStorage.setItem(key, value)
     */
    async setItem(key: string, value: any): Promise<void> {
        this.currentSessionData[key] = value;
        this.activeAccountSubject.next(this.currentSessionData);

        // Đảm bảo luôn lưu xuống Storage ngay cả khi chưa gán currentAccountId
        if (!this.currentAccountId) {
            const userObj = this.currentSessionData?.user || this.currentSessionData?.profile;
            this.currentAccountId = userObj?.email || userObj?.username || userObj?.name || 'default_user';
            localStorage.setItem('ai_type_active_account_id', this.currentAccountId);
        }

        // Lưu bản backup cô lập theo từng accountId riêng biệt
        if (key === 'active_info' && this.currentAccountId) {
            try {
                localStorage.setItem(`ai_type_active_info_${this.currentAccountId}`, typeof value === 'string' ? value : JSON.stringify(value));
            } catch (e) {}
        }

        // Debounce ghi DB và mã hóa AES (Rất nặng CPU) để tránh lag khi gọi setItem liên tục
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveToBackground();
        }, 500);
    }

    /**
     * Thay thế cho localStorage.getItem(key)
     */
    getItem(key: string): any {
        if (this.currentSessionData[key] !== undefined && this.currentSessionData[key] !== null) {
            return this.currentSessionData[key];
        }
        if (key === 'active_info' && this.currentAccountId) {
            const backup = localStorage.getItem(`ai_type_active_info_${this.currentAccountId}`);
            if (backup && backup !== 'null' && backup !== 'undefined') {
                this.currentSessionData[key] = backup;
                return backup;
            }
        }
        return null;
    }

    /**
     * Thay thế cho localStorage.removeItem(key)
     */
    async removeItem(key: string): Promise<void> {
        delete this.currentSessionData[key];
        if (key === 'active_info' && this.currentAccountId) {
            localStorage.removeItem(`ai_type_active_info_${this.currentAccountId}`);
        }
        this.activeAccountSubject.next(this.currentSessionData);
        
        if (!this.currentAccountId) {
            const userObj = this.currentSessionData?.user || this.currentSessionData?.profile;
            this.currentAccountId = userObj?.email || userObj?.username || userObj?.name || 'default_user';
            localStorage.setItem('ai_type_active_account_id', this.currentAccountId);
        }

        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveToBackground();
        }, 500);
    }

    /**
     * Thay thế cho localStorage.clear() - Xóa toàn bộ data của user HIỆN TẠI
     */
    clearCurrentAccountData(): void {
        this.currentSessionData = {};
        if (this.currentAccountId) {
            this.saveToBackground();
        }
    }

    /**
     * Lấy các items có key bắt đầu bằng prefix
     */
    getItemsByPrefix(prefix: string): any[] {
        if (!this.currentSessionData) return [];
        return Object.keys(this.currentSessionData)
            .filter(key => key.startsWith(prefix))
            .map(key => this.currentSessionData[key]);
    }

    // ==========================================
    // 2. HÀM XỬ LÝ LỖI TOÀN CỤC CHO INDEXEDDB
    // ==========================================
    
    /**
     * Bọc các thao tác DB để không bao giờ làm crash App khi mất quyền truy cập Storage
     */
    private async safeDbCall<T>(operation: () => Promise<T>, fallbackValue: T): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            console.error('🚨 [IndexedDB Error]: Trình duyệt từ chối hoặc lỗi bộ nhớ!', error);
            return fallbackValue;
        }
    }

    // ==========================================
    // 3. QUẢN LÝ MULTI-ACCOUNT & DB (ĐÃ BỌC TRY-CATCH)
    // ==========================================

    /**
     * Lưu ngay lập tức xuống DB (dành cho các thao tác quan trọng như Active)
     */
    public async forceSave(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        await this.saveToBackground();
    }

    /**
     * Lưu ngầm dữ liệu từ Cache xuống IndexedDB
     */
    private async saveToBackground(): Promise<void> {
        if (!this.currentAccountId) {
            const userObj = this.currentSessionData?.user || this.currentSessionData?.profile;
            this.currentAccountId = userObj?.email || userObj?.username || userObj?.name || 'default_user';
            localStorage.setItem('ai_type_active_account_id', this.currentAccountId);
        }
        
        await this.safeDbCall(async () => {
            if (this.currentAccountId) {
                localStorage.setItem('ai_type_active_account_id', this.currentAccountId);
                await db.sessions.where('id').notEqual(this.currentAccountId).modify({ isActive: 0 });
            }
            const encrypted = this.encryptData(this.currentSessionData);
            await db.sessions.put({
                id: this.currentAccountId!,
                isActive: 1,
                encryptedData: encrypted
            });
        }, undefined);
    }

    /**
     * Tự động load tài khoản đang Active khi mở App
     */
    async loadActiveAccount(): Promise<any> {
        return this.safeDbCall(async () => {
            try {
                // Khôi phục tất cả Media File từ IndexedDB vào RAM sau khi F5
                const allMedia = await db.mediaFiles.toArray();
                for (const m of allMedia) {
                    this.memoryVideoFiles[m.id] = m.file;
                }
            } catch (e) {
                console.warn('Could not load media files', e);
            }

            let activeRecord: any = null;
            const savedActiveId = localStorage.getItem('ai_type_active_account_id');
            if (savedActiveId) {
                activeRecord = await db.sessions.get(savedActiveId);
                if (activeRecord && activeRecord.isActive !== 1) {
                    await db.sessions.update(savedActiveId, { isActive: 1 });
                    activeRecord.isActive = 1;
                }
            }

            if (!activeRecord) {
                activeRecord = await db.sessions.where('isActive').equals(1).first();
            }

            if (!activeRecord) {
                activeRecord = await db.sessions.toCollection().first();
                if (activeRecord) {
                    await db.sessions.update(activeRecord.id, { isActive: 1 });
                    activeRecord.isActive = 1;
                }
            }

            if (activeRecord && activeRecord.encryptedData) {
                this.currentAccountId = activeRecord.id;
                localStorage.setItem('ai_type_active_account_id', activeRecord.id);
                this.currentSessionData = this.decryptData(activeRecord.encryptedData, activeRecord.id) || {};
                
                const userObj = this.currentSessionData?.user || this.currentSessionData?.profile;
                const uname = userObj?.name || userObj?.username || this.currentAccountId;
                this.syncActiveUserWithElectron(uname);

                this.activeAccountSubject.next(this.currentSessionData);
                return this.currentSessionData;
            }
            
            this.currentAccountId = 'default_user';
            localStorage.setItem('ai_type_active_account_id', this.currentAccountId);
            this.currentSessionData = {};
            this.syncActiveUserWithElectron(null);
            this.activeAccountSubject.next(null);
            return null;
        }, null);
    }

    /**
     * Hủy phiên hoạt động hiện tại (Đăng xuất phiên làm việc)
     */
    async clearActiveSession(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        localStorage.removeItem('ai_type_active_account_id');
        await this.safeDbCall(async () => {
            await db.sessions.toCollection().modify({ isActive: 0 });
        }, undefined);
        this.currentAccountId = null;
        this.currentSessionData = {};
        this.syncActiveUserWithElectron(null);
        this.activeAccountSubject.next(null);
    }

    /**
     * Lưu tài khoản mới (Khi đăng nhập thành công)
     */
    async saveAccount(accountId: string, rawData: any): Promise<void> {
        this.currentAccountId = accountId;
        
        // Lấy dữ liệu cũ của account này (nếu có) để tránh dính data của account trước đó
        let existingData = await this.safeDbCall(async () => {
            const existingRecord = await db.sessions.get(accountId);
            if (existingRecord && existingRecord.encryptedData) {
                return this.decryptData(existingRecord.encryptedData, accountId) || {};
            }
            return {};
        }, {});

        // Giữ lại accessToken nếu có trong existingData hoặc currentSessionData mà rawData không truyền
        const preservedToken = rawData.accessToken || existingData.accessToken || this.currentSessionData?.accessToken;
        this.currentSessionData = this.sanitizeAccountData(accountId, { ...existingData, ...rawData }); 
        if (preservedToken) {
            this.currentSessionData.accessToken = preservedToken;
        }
        
        await this.safeDbCall(async () => {
            await db.sessions.toCollection().modify({ isActive: 0 });
        }, undefined);
        
        await this.saveToBackground();
        localStorage.setItem('ai_type_active_account_id', accountId);
        const userObj = this.currentSessionData?.user || this.currentSessionData?.profile;
        const uname = userObj?.name || userObj?.username || this.currentAccountId;
        this.syncActiveUserWithElectron(uname);
        this.activeAccountSubject.next(this.currentSessionData);
    }

    /**
     * Lấy danh sách TẤT CẢ tài khoản đang lưu trong máy (Để làm UI Chuyển tài khoản)
     */
    async getAllAccounts(): Promise<any[]> {
        return this.safeDbCall(async () => {
            const allRecords = await db.sessions.toArray();
            return allRecords
                .filter(record => record != null)
                .map(record => {
                    const data = this.decryptData(record?.encryptedData || '', record?.id);
                    return {
                        id: record?.id,
                        isActive: record?.isActive === 1,
                        profile: data?.profile || data?.user || null
                    };
                });
        }, []);
    }

    /**
     * Chuyển đổi qua lại giữa các tài khoản
     */
    async switchAccount(accountId: string): Promise<boolean> {
        return this.safeDbCall(async () => {
            const targetAccount = await db.sessions.get(accountId);
            if (!targetAccount || !targetAccount.encryptedData) return false;

            await db.sessions.toCollection().modify({ isActive: 0 });
            await db.sessions.update(accountId, { isActive: 1 });
            
            this.currentAccountId = accountId;
            localStorage.setItem('ai_type_active_account_id', accountId);
            this.currentSessionData = this.decryptData(targetAccount.encryptedData, accountId) || {};
            const userObj = this.currentSessionData?.user || this.currentSessionData?.profile;
            const uname = userObj?.name || userObj?.username || this.currentAccountId;
            this.syncActiveUserWithElectron(uname);
            this.activeAccountSubject.next(this.currentSessionData);
            
            return true;
        }, false);
    }

    /**
     * Đăng xuất: Xóa tài khoản khỏi máy
     */
    async removeAccount(accountId: string): Promise<void> {
        await this.safeDbCall(async () => {
            await db.sessions.delete(accountId);
            
            if (this.currentAccountId === accountId) {
                const fallback = await db.sessions.toCollection().first();
                if (fallback) {
                    await this.switchAccount(fallback.id);
                } else {
                    this.currentAccountId = null;
                    this.currentSessionData = {};
                    this.syncActiveUserWithElectron(null);
                    this.activeAccountSubject.next(null);
                }
            }
        }, undefined);
    }


    // ==========================================
    // 4. CÁC HÀM MÃ HÓA & GIẢI MÃ
    // ==========================================
    
    private sanitizeAccountData(accountId: string, data: any): any {
        if (!data) return data;
        const userObj = data.user || data.profile;
        const username = userObj?.name || userObj?.username || '';
        const email = userObj?.email || accountId || '';

        const isAdmin = (
            email === 'noreply.typing.vn@gmail.com' ||
            username === 'admin' ||
            (Array.isArray(userObj?.groups) && userObj.groups.includes('lập-trình-ai-type'))
        );

        if (!isAdmin && data.settings) {
            // Kiểm tra nếu settings đang chứa dấu hiệu của admin (SMTP typevn, nodebb admin token...)
            const s = data.settings;
            const hasAdminSignature = (
                s.emailConfig_smtpUser === 'typevn@gmail.com' ||
                s.emailConfig_nodebbToken === '001780c4-1e43-4e42-be0b-9a998e13715a' ||
                (s.secretKey && s.secretKey.includes('AIzaSyCMje8tT-29bmn314Mu1Lb2T-ddgTB7EpU'))
            );

            if (hasAdminSignature) {
                // Xoá triệt để các cấu hình nhạy cảm bị lây chéo từ admin
                delete s.secretKey;
                delete s.umodelverseKey;
                delete s.umodelverseUrl;
                delete s.umodelverseChatModel;
                delete s.umodelverseImageModel;
                delete s.umodelverseVideoModel;
                delete s.chatbot;
                delete s.emailConfig_nodebbUrl;
                delete s.emailConfig_nodebbToken;
                delete s.emailConfig_smtpHost;
                delete s.emailConfig_smtpPort;
                delete s.emailConfig_smtpUser;
                delete s.emailConfig_smtpPass;
                delete s.typelite_plugin;
                delete s.downloader_plugin;
                delete s.port;
                s.enableUmodelverse = false;
            }
        }
        return data;
    }

    private encryptData(data: any): string {
        try {
            const jsonStr = JSON.stringify(data);
            return CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
        } catch (error) {
            console.error('Lỗi mã hóa dữ liệu!', error);
            return '';
        }
    }

    public decryptData(encryptedStr: string, accountId?: string): any {
        if (!encryptedStr) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedStr, SECRET_KEY);
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            let parsed = JSON.parse(decryptedStr);
            if (accountId) {
                parsed = this.sanitizeAccountData(accountId, parsed);
            }
            return parsed;
        } catch (error) {
            console.error('Lỗi giải mã dữ liệu tài khoản! Có thể sai SECRET_KEY.', error);
            return null;
        }
    }
}