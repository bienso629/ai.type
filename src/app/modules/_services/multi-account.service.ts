import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import * as CryptoJS from 'crypto-js';
import { BehaviorSubject } from 'rxjs';

// TODO: Đưa SECRET_KEY này vào file environment.ts để bảo mật hơn nhé
const SECRET_KEY = 'ai_type_secret_key_2026_!@#';

export interface AccountSession {
    id: string;          // Khóa chính: username hoặc email
    isActive: number;    // 1 là đang dùng, 0 là tài khoản lưu trữ
    encryptedData: string; // Dữ liệu đã mã hóa
}

// 1. Khởi tạo IndexedDB với Dexie
export class AppDB extends Dexie {
    sessions!: Table<AccountSession, string>;

    constructor() {
        super('AiTypeMultiAccountDB');
        this.version(1).stores({
            sessions: 'id, isActive'
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
    private currentAccountId: string | null = null;

    // Cờ báo hiệu DB đã load xong (dành cho những lúc cần await lúc khởi động app)
    public isReady: Promise<boolean>;

    constructor() {
        // Tải dữ liệu lên Cache ngay khi Service khởi tạo
        this.isReady = this.loadActiveAccount().then(() => true);
    }

    // ==========================================
    // 1. CÁC HÀM "ĐÓNG THẾ" CHO LOCALSTORAGE
    // ==========================================

    /**
     * Thay thế cho localStorage.setItem(key, value)
     * Lưu vào RAM ngay lập tức, rồi âm thầm lưu xuống IndexedDB
     */
    setItem(key: string, value: any): void {
        this.currentSessionData[key] = value;

        if (this.currentAccountId) {
            this.saveToBackground();
        }
    }

    /**
     * Thay thế cho localStorage.getItem(key)
     * Lấy trực tiếp từ RAM, không block UI, trả về đúng kiểu dữ liệu (Object/Array/String)
     */
    getItem(key: string): any {
        return this.currentSessionData[key] !== undefined ? this.currentSessionData[key] : null;
    }

    /**
     * Thay thế cho localStorage.removeItem(key)
     */
    removeItem(key: string): void {
        delete this.currentSessionData[key];
        
        if (this.currentAccountId) {
            this.saveToBackground();
        }
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


    // ==========================================
    // 2. QUẢN LÝ MULTI-ACCOUNT & DB
    // ==========================================

    /**
     * Lưu ngầm dữ liệu từ Cache xuống IndexedDB
     */
    private async saveToBackground(): Promise<void> {
        if (!this.currentAccountId) return;
        
        const encrypted = this.encryptData(this.currentSessionData);
        await db.sessions.put({
            id: this.currentAccountId,
            isActive: 1,
            encryptedData: encrypted
        });
    }

    /**
     * Tự động load tài khoản đang Active khi mở App
     */
    async loadActiveAccount(): Promise<any> {
        const activeRecord = await db.sessions.where('isActive').equals(1).first();
        if (activeRecord) {
            this.currentAccountId = activeRecord.id;
            this.currentSessionData = this.decryptData(activeRecord.encryptedData) || {};
            
            this.activeAccountSubject.next(this.currentSessionData);
            return this.currentSessionData;
        }
        
        this.activeAccountSubject.next(null);
        return null;
    }

    /**
     * Lưu tài khoản mới (Khi đăng nhập thành công)
     */
    async saveAccount(accountId: string, rawData: any): Promise<void> {
        this.currentAccountId = accountId;
        
        // Giữ lại những key cũ nếu có, gộp chung với data mới từ lúc login
        this.currentSessionData = { ...this.currentSessionData, ...rawData }; 
        
        // Tắt active các tài khoản khác
        await db.sessions.toCollection().modify({ isActive: 0 });
        
        // Lưu xuống DB
        await this.saveToBackground();
        
        // Bắn tín hiệu ra toàn App
        this.activeAccountSubject.next(this.currentSessionData);
    }

    /**
     * Lấy danh sách TẤT CẢ tài khoản đang lưu trong máy (Để làm UI Chuyển tài khoản)
     */
    async getAllAccounts(): Promise<any[]> {
        const allRecords = await db.sessions.toArray();
        return allRecords.map(record => {
            const data = this.decryptData(record.encryptedData);
            return {
                id: record.id,
                isActive: record.isActive === 1,
                profile: data?.profile || data?.user || null // Tùy vào cấu trúc data bạn lưu lúc login
            };
        });
    }

    /**
     * Chuyển đổi qua lại giữa các tài khoản
     */
    async switchAccount(accountId: string): Promise<boolean> {
        const targetAccount = await db.sessions.get(accountId);
        if (!targetAccount) return false;

        // Cập nhật DB
        await db.sessions.toCollection().modify({ isActive: 0 });
        await db.sessions.update(accountId, { isActive: 1 });
        
        // Cập nhật Cache & Bắn tín hiệu
        this.currentAccountId = accountId;
        this.currentSessionData = this.decryptData(targetAccount.encryptedData) || {};
        this.activeAccountSubject.next(this.currentSessionData);
        
        return true;
    }

    /**
     * Đăng xuất: Xóa tài khoản khỏi máy
     */
    async removeAccount(accountId: string): Promise<void> {
        await db.sessions.delete(accountId);
        
        // Nếu đang xóa chính tài khoản đang dùng
        if (this.currentAccountId === accountId) {
            const fallback = await db.sessions.toCollection().first();
            if (fallback) {
                // Tự động switch sang tài khoản khác còn trong máy
                await this.switchAccount(fallback.id);
            } else {
                // Hết sạch tài khoản
                this.currentAccountId = null;
                this.currentSessionData = {};
                this.activeAccountSubject.next(null);
            }
        }
    }


    // ==========================================
    // 3. CÁC HÀM MÃ HÓA & GIẢI MÃ
    // ==========================================
    
    private encryptData(data: any): string {
        try {
            const jsonStr = JSON.stringify(data);
            return CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
        } catch (error) {
            console.error('Lỗi mã hóa dữ liệu!', error);
            return '';
        }
    }

    private decryptData(encryptedStr: string): any {
        if (!encryptedStr) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedStr, SECRET_KEY);
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            return JSON.parse(decryptedStr);
        } catch (error) {
            console.error('Lỗi giải mã dữ liệu tài khoản! Có thể sai SECRET_KEY.', error);
            return null;
        }
    }
}