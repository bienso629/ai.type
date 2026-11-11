import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UserClientService } from './user';

/**
 * [Refactor 2026-11-11] Nguoi quan ly duy nhat cua "data settings" cua tai khoan.
 *
 * Settings CHI duoc luu va doc tren server (API /user/profile thong qua
 * UserClientService.updateProfile / profile). Khong con ghi vao IndexedDB,
 * localStorage hay file mirror ben local nua. Cache RAM o day chi la ban sao
 * doc nhanh cua du lieu tren server va duoc lam moi moi khi profile duoc tai.
 */
@Injectable({
    providedIn: 'root'
})
export class UserSettingsService {
    private _settings: any = {};
    private _settingsSubject = new BehaviorSubject<any>(this._settings);

    /** Stream phat settings moi nhat (sau khi tai/luu tu server) */
    public settings$ = this._settingsSubject.asObservable();

    private _loading: Promise<any> | null = null;

    constructor(private _userClientService: UserClientService) {
        registerUserSettingsService(this);
    }

    /** Ban sao settings hien tai (doc dong bo tu cache RAM cua du lieu server) */
    getSettings(): any {
        return this._settings;
    }

    /** Flag "Luu cục bộ" doc tu settings tren server (mac dinh bat) */
    isAutoSaveLocalEnabled(): boolean {
        return this._settings?.autoSaveLocal !== false;
    }

    /** Nhan settings moi tu phan hoi API profile (resolver) - chi cap nhat cache RAM */
    adoptFromServer(settings: any): void {
        this._settings = (settings && typeof settings === 'object') ? { ...settings } : {};
        this._settingsSubject.next(this._settings);
    }

    /** Alias de cap nhat cache RAM khi caller tu goi updateProfile */
    updateCache(settings: any): void {
        this.adoptFromServer(settings);
    }

    /** Tai settings tu server ve cache RAM (idempotent khi dang trong qua trinh tai) */
    load(username?: string): Promise<any> {
        if (this._loading) return this._loading;
        this._loading = new Promise(resolve => {
            const body: any = username ? { name: username } : {};
            this._userClientService.profile(body)
                .subscribe({
                    next: (res: any) => {
                        if (res && res.success && res.data && res.data.settings) {
                            this.adoptFromServer(res.data.settings);
                        }
                        this._loading = null;
                        resolve(this._settings);
                    },
                    error: () => {
                        this._loading = null;
                        resolve(this._settings);
                    }
                });
        });
        return this._loading;
    }

    /** Luu toan bo settings len server - khong ghi bat cu noi nao ben local */
    save(settings: any, username?: string): Observable<any> {
        this.adoptFromServer(settings);
        return this._userClientService.updateProfile({
            profile: { settings },
            username: username
        }).pipe(
            tap((res: any) => {
                if (res && res.success && res.data && res.data.settings) {
                    this.adoptFromServer(res.data.settings);
                }
            })
        );
    }

    /** Ghep mot phan cau hinh vao settings hien tai roi luu len server */
    savePartial(partial: any, username?: string): void {
        const doSave = (base: any) => {
            this.save({ ...(base || {}), ...(partial || {}) }, username)
                .subscribe({
                    next: (res: any) => {
                        if (!res || res.success === false) {
                            console.warn('[UserSettingsService] Luu settings len server khong thanh cong.');
                        }
                    },
                    error: () => console.warn('[UserSettingsService] Khong the luu settings len server.')
                });
        };
        if (!this._settings || Object.keys(this._settings).length === 0) {
            this.load(username).then(base => doSave(base));
        } else {
            doSave(this._settings);
        }
    }
}

// ==========================================
// Ham tien ich toan cuc: thay the cac cho doc/ghi settings cuc bo dang rai
// trong codebase ma khong phai inject service vao hang loat class. Cac ham
// nay doc tu cache RAM cua du lieu tren server, khong cham vao IndexedDB,
// localStorage hay file mirror.
// ==========================================

let _instance: UserSettingsService | null = null;

export function registerUserSettingsService(svc: UserSettingsService): void {
    _instance = svc;
}

/** Doc settings hien tai (tu server cache RAM). Tra {} neu chua tai du lieu. */
export function getSettings(): any {
    return _instance ? _instance.getSettings() : {};
}

/** Flag "Luu cục bộ" hien hanh (tu settings tren server, mac dinh bat). */
export function isAutoSaveLocalEnabled(): boolean {
    return _instance ? _instance.isAutoSaveLocalEnabled() : true;
}

/** Cap nhat cache RAM sau khi caller tu goi updateProfile thanh cong. */
export function updateUserSettingsCache(settings: any): void {
    if (_instance) _instance.updateCache(settings);
}

/** Ghep cau hinh mot pham vi roi luu len server (fire-and-forget). */
export function saveSettingsPartial(partial: any, username?: string): void {
    if (_instance) _instance.savePartial(partial, username);
}
