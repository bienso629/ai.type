import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of, from } from 'rxjs';
import { catchError, map, takeUntil } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

// ── Interfaces ──────────────────────────────────────────────────
export interface Design3DPreset {
    id: string;
    name: string;
    description?: string;
    /** Toàn bộ dữ liệu scene: props, character, room... */
    sceneData?: any;
    thumbnailPath?: string | null;
    propCount?: number;
    hasCharacter?: boolean;
    hasRoom?: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
}

/** Snapshot dữ liệu scene dùng để lưu / nạp lại */
export interface Design3DSnapshot {
    props: any[];
    character?: any;
    scene?: any;
}

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

import { isAutoSaveLocalEnabled } from 'app/_services/user-settings.service';

@Injectable()
export class Design3DService {
    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private http: HttpClient,
        private _h: HelperService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService
    ) {
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });
    }

    private get _username(): string {
        return (this.user as any)?.username || this.user?.name || 'admin';
    }

    private get _electron(): any {
        return (window as any).electron || null;
    }

    private get _useLocal(): boolean {
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
        return isAutoSaveLocal && !!this._electron;
    }

    // ── SERVER REST (mã hóa AES giống tasks.ts) ─────────────────
    private _postServer(
        path: string,
        dataForm: any,
        opName: string,
        fallback: any
    ): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info');
        if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo);
        if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/design3d/${path}`;

        const data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => res),
            catchError(this.handleError(opName, fallback))
        );
    }

    // ── PUBLIC API ──────────────────────────────────────────────

    /** Danh sách toàn bộ mẫu design 3D */
    public list(): Observable<any> {
        if (this._useLocal) {
            return from(this._electron.listDesigns({ username: this._username })).pipe(
                catchError(this.handleError('list', { success: true, data: [] }))
            );
        }
        return this._postServer('all', { username: this._username }, 'list', { error: false, data: [] });
    }

    /** Lấy chi tiết 1 mẫu design theo id (trả về sceneData đầy đủ) */
    public get(id: string): Observable<any> {
        if (this._useLocal) {
            return from(this._electron.getDesign({ username: this._username, designId: id })).pipe(
                catchError(this.handleError('get', { success: false }))
            );
        }
        return this._postServer('get', { username: this._username, id }, 'get', { error: true });
    }

    /**
     * Lưu mẫu design: có id -> cập nhật, không id -> tạo mới.
     * Trả về Observable với meta của mẫu (chứa id để dùng cho thumbnail).
     */
    public save(design: { id?: string; name: string; description?: string; sceneData: Design3DSnapshot }): Observable<any> {
        if (this._useLocal) {
            const payload = {
                username: this._username,
                designId: design.id || ('design_' + Date.now()),
                name: design.name,
                description: design.description || '',
                data: design.sceneData
            };
            return from(this._electron.saveDesign(payload)).pipe(
                catchError(this.handleError('save', { success: false }))
            );
        }
        // REST: gửi gói design gồm id (nếu có) + name + sceneData
        const restDesign: any = {
            name: design.name,
            description: design.description || '',
            sceneData: design.sceneData
        };
        if (design.id) { restDesign.id = design.id; }
        return this._postServer('save', { username: this._username, design: restDesign }, 'save', { error: true });
    }

    /** Đổi tên / mô tả mẫu design (không đụng dữ liệu scene) */
    public rename(id: string, name: string, description?: string): Observable<any> {
        if (this._useLocal) {
            return from(this._electron.renameDesign({
                username: this._username, designId: id, name, description
            })).pipe(
                catchError(this.handleError('rename', { success: false }))
            );
        }
        // REST: dùng save với id — chỉ cập nhật name/description
        return this._postServer('save', {
            username: this._username,
            design: { id, name, description: description || '' }
        }, 'rename', { error: true });
    }

    /** Xóa 1 mẫu design */
    public delete(id: string): Observable<any> {
        if (this._useLocal) {
            return from(this._electron.deleteDesign({ username: this._username, designId: id })).pipe(
                catchError(this.handleError('delete', { success: false }))
            );
        }
        return this._postServer('delete', { username: this._username, id }, 'delete', { error: true });
    }

    /** Nhân bản 1 mẫu design */
    public duplicate(id: string): Observable<any> {
        if (this._useLocal) {
            return from(this._electron.duplicateDesign({ username: this._username, designId: id })).pipe(
                catchError(this.handleError('duplicate', { success: false }))
            );
        }
        return this._postServer('duplicate', { username: this._username, id }, 'duplicate', { error: true });
    }

    /** Lưu thumbnail (PNG base64 chụp từ canvas 3D) cho mẫu design — chỉ Electron */
    public saveThumbnail(designId: string, base64: string): Observable<any> {
        if (this._useLocal) {
            return from(this._electron.saveDesignThumbnail({
                username: this._username, designId, base64
            })).pipe(
                catchError(this.handleError('saveThumbnail', { success: false }))
            );
        }
        // REST: lưu thumbnail như 1 trường của design
        return this._postServer('save', {
            username: this._username,
            design: { id: designId, thumbnail: base64 }
        }, 'saveThumbnail', { error: true });
    }

    private handleError<T>(operation = 'operation', result?: T) {
        return (error: any): Observable<T> => {
            console.error(`[Design3DService] ${operation} failed:`, error);
            return of(result as T);
        };
    }
}
