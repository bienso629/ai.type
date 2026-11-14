import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of, from } from 'rxjs';
import { catchError, tap, map, takeUntil, switchMap } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

import { isAutoSaveLocalEnabled } from 'app/_services/user-settings.service';

@Injectable()
export class DomainService {
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
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    private resolveAccountUsername(dataForm?: any): string {
        if (dataForm && typeof dataForm.accountUsername === 'string' && dataForm.accountUsername.trim()) {
            return dataForm.accountUsername.trim();
        }
        const isWrapped = !!(dataForm && typeof dataForm.domain === 'object' && dataForm.domain !== null);
        if (isWrapped && typeof dataForm.username === 'string' && dataForm.username.trim()) {
            return dataForm.username.trim();
        }
        if (!isWrapped && dataForm && !dataForm.domain && typeof dataForm.username === 'string' && dataForm.username.trim()) {
            return dataForm.username.trim();
        }
        if (this.user?.name) {
            return this.user.name;
        }
        const sessionUser: any = this.multiAccountService.getItem('user') || this.multiAccountService.getItem('profile');
        if (sessionUser?.name || sessionUser?.username) {
            return sessionUser.name || sessionUser.username;
        }
        let lsUser: string | null = null;
        try {
            lsUser = localStorage.getItem('username');
        } catch (e) {}
        return this.multiAccountService.getItem('username')
            || lsUser
            || this.multiAccountService.currentAccountId
            || 'admin';
    }

    private sanitizeDomainPayload(rawDomain: any): any {
        if (!rawDomain || typeof rawDomain !== 'object') {
            return rawDomain;
        }
        const cleaned: any = { ...rawDomain };
        delete cleaned._showPassword;
        delete cleaned._showServerPassword;
        delete cleaned._dbMonthlyTarget;
        delete cleaned._dbWritingStyle;
        delete cleaned.accountUsername;
        delete cleaned.ownerUsername;
        delete cleaned.oldDomain;
        delete cleaned.plan;
        delete cleaned.childrenItems;
        delete cleaned.streamItems;
        delete cleaned._streamLevels;
        if (typeof cleaned.domain === 'string') {
            cleaned.domain = cleaned.domain.trim();
        }
        if (!cleaned.name && cleaned.domain) {
            cleaned.name = cleaned.domain;
        }
        cleaned.monthlyTarget = Number(cleaned.monthlyTarget) || 0;
        cleaned.writingStyle = cleaned.writingStyle || '';
        return cleaned;
    }

    private getActiveInfoObject(): any {
        let activeInfo = this.multiAccountService.getItem('active_info');
        if (!activeInfo) {
            try {
                activeInfo = localStorage.getItem('active_info');
            } catch (e) {}
        }
        if (!activeInfo) return null;
        return AuthUtils._getActiveInfo(activeInfo);
    }

    private resolveServerApi(): { serverApi: string; genKey: string } {
        const sessionUser: any = this.multiAccountService.getItem('user') || this.user;
        const apiMap = this.config?.settings?.api || {};
        const candidate = (sessionUser?.server && apiMap[sessionUser.server])
            ? sessionUser.server
            : ((this.user?.server && apiMap[this.user.server]) ? this.user.server : 'vn.s1');
        const serverApi = apiMap[candidate] || 'https://apiv1.type.vn/v1';
        const genKey = this.config?.settings?.gen || '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';
        return { serverApi, genKey };
    }

    private normalizeMutationResponse(res: any, fallbackDomain: any, genKey: string): any {
        let decoded = res;
        if (decoded && typeof decoded.data === 'string' && decoded.data.length > 32) {
            try {
                const dec = this._h.decrypt(decoded.data, genKey);
                if (dec) {
                    decoded = typeof dec === 'string' ? JSON.parse(dec) : dec;
                }
            } catch (e) {}
        }
        if (!decoded) {
            return { success: false };
        }
        if (decoded.success === true) {
            return {
                ...decoded,
                data: decoded.data || fallbackDomain
            };
        }
        if (decoded.ok === true || decoded.status === 'ok') {
            return {
                success: true,
                data: {
                    ...(fallbackDomain || {}),
                    ...(decoded.data && typeof decoded.data === 'object' ? decoded.data : {}),
                    _id: decoded.id || decoded._id || decoded.data?._id || fallbackDomain?._id,
                    _rev: decoded.rev || decoded._rev || decoded.data?._rev || fallbackDomain?._rev
                }
            };
        }
        return decoded;
    }

    public fetch(dataForm: any): Observable<any> {
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
        const electron = (window as any).electron;
        const accountUsername = this.resolveAccountUsername(dataForm);

        if (electron && isAutoSaveLocal) {
            if (electron.listLocalDomains) {
                return from(electron.listLocalDomains({ username: accountUsername, accountUsername })).pipe(
                    map((result: any) => {
                        const localDomains = (result && result.success && Array.isArray(result.data)) ? result.data : [];
                        return { success: true, data: localDomains };
                    }),
                    catchError(this.handleError('fetchLocalDomains', { success: false, data: [] }))
                );
            }
            return of({ success: true, data: [] });
        }

        const activeInfo = this.getActiveInfoObject();
        if (!activeInfo) {
            if (electron && electron.listLocalDomains) {
                return from(electron.listLocalDomains({ username: accountUsername, accountUsername })).pipe(
                    map((result: any) => {
                        const localDomains = (result && result.success && Array.isArray(result.data)) ? result.data : [];
                        return { success: true, data: localDomains };
                    }),
                    catchError(this.handleError('fetchLocalDomainsFallback', { success: false, data: [] }))
                );
            }
            return of({ success: true, data: [] });
        }

        const payload = {
            ...(dataForm || {}),
            username: accountUsername,
            year: 2023,
            appId: 'ai.typing',
            appToken: activeInfo['user']?.['appToken'] || ''
        };

        const { serverApi, genKey } = this.resolveServerApi();
        const url = `${serverApi}/domain/all`;

        const data = {
            params: this._h.encrypt(payload, genKey)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => {
                if (Array.isArray(res)) {
                    return { success: true, data: res };
                }
                if (res && res.data && Array.isArray(res.data)) {
                    return { success: true, data: res.data };
                }
                if (res && res.success && Array.isArray(res.data)) {
                    return res;
                }
                return { success: true, data: [] };
            }),
            catchError(this.handleError('server', { success: false, data: [] }))
        );
    }

    public add(dataForm: any): Observable<any> {
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
        const electron = (window as any).electron;
        const accountUsername = this.resolveAccountUsername(dataForm);
        const rawDomain = (dataForm && typeof dataForm.domain === 'object' && dataForm.domain !== null) ? dataForm.domain : dataForm;
        const domainPayload = this.sanitizeDomainPayload(rawDomain);

        if (isAutoSaveLocal && electron && electron.saveLocalDomain) {
            return from(electron.saveLocalDomain({
                accountUsername,
                domain: domainPayload
            })).pipe(
                map((res: any) => ({
                    success: !!(res && res.success !== false),
                    data: (res && res.data) || domainPayload,
                    error: res?.error,
                    message: res?.message || 'Lưu cấu hình tên miền cục bộ thành công.'
                })),
                catchError(this.handleError('saveLocalDomain', { success: false }))
            );
        }

        const activeInfo = this.getActiveInfoObject();
        if (!activeInfo) {
            if (electron && electron.saveLocalDomain) {
                return from(electron.saveLocalDomain({
                    accountUsername,
                    domain: domainPayload
                })).pipe(
                    map((res: any) => ({
                        success: !!(res && res.success !== false),
                        data: (res && res.data) || domainPayload,
                        error: res?.error,
                        message: res?.message || 'Lưu cấu hình tên miền cục bộ thành công.'
                    })),
                    catchError(this.handleError('saveLocalDomainFallback', { success: false }))
                );
            }
            return of({ success: false, message: 'Chưa kích hoạt tài khoản để lưu tên miền lên máy chủ.' });
        }

        const serverPayload = {
            username: accountUsername,
            domain: domainPayload,
            year: 2023,
            appId: 'ai.typing',
            appToken: activeInfo['user']?.['appToken'] || ''
        };

        const { serverApi, genKey } = this.resolveServerApi();
        const url = `${serverApi}/domain/add`;

        const data = {
            params: this._h.encrypt(serverPayload, genKey)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => this.normalizeMutationResponse(res, domainPayload, genKey)),
            catchError(this.handleError('server', { success: false }))
        );
    }

    public edit(dataForm: any): Observable<any> {
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
        const electron = (window as any).electron;
        const accountUsername = this.resolveAccountUsername(dataForm);
        const isWrapped = !!(dataForm && typeof dataForm.domain === 'object' && dataForm.domain !== null);
        const rawDomain = isWrapped ? dataForm.domain : dataForm;
        const oldDomain = (isWrapped ? dataForm.oldDomain : rawDomain?.oldDomain) || undefined;
        const domainPayload = this.sanitizeDomainPayload(rawDomain);

        if (isAutoSaveLocal && electron && electron.saveLocalDomain) {
            return from(electron.saveLocalDomain({
                accountUsername,
                oldDomain,
                domain: domainPayload
            })).pipe(
                map((res: any) => ({
                    success: !!(res && res.success !== false),
                    data: (res && res.data) || domainPayload,
                    error: res?.error,
                    message: res?.message || 'Cập nhật cấu hình tên miền cục bộ thành công.'
                })),
                catchError(this.handleError('editLocalDomain', { success: false }))
            );
        }

        const activeInfo = this.getActiveInfoObject();
        if (!activeInfo) {
            if (electron && electron.saveLocalDomain) {
                return from(electron.saveLocalDomain({
                    accountUsername,
                    oldDomain,
                    domain: domainPayload
                })).pipe(
                    map((res: any) => ({
                        success: !!(res && res.success !== false),
                        data: (res && res.data) || domainPayload,
                        error: res?.error,
                        message: res?.message || 'Cập nhật cấu hình tên miền cục bộ thành công.'
                    })),
                    catchError(this.handleError('editLocalDomainFallback', { success: false }))
                );
            }
            return of({ success: false, message: 'Chưa kích hoạt tài khoản để cập nhật tên miền lên máy chủ.' });
        }

        const serverPayload = {
            username: accountUsername,
            domain: domainPayload,
            year: 2023,
            appId: 'ai.typing',
            appToken: activeInfo['user']?.['appToken'] || ''
        };

        const { serverApi, genKey } = this.resolveServerApi();
        const url = `${serverApi}/domain/edit`;

        const data = {
            params: this._h.encrypt(serverPayload, genKey)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => this.normalizeMutationResponse(res, domainPayload, genKey)),
            catchError(this.handleError('server', { success: false }))
        );
    }

    // tslint:disable-next-line: typedef
    private handleError<T>(operation = 'operation', result?: T) {
        return (error: any): Observable<T> => {
            // TODO: send the error to remote logging infrastructure
            console.error(error); // log to console instead

            // TODO: better job of transforming error for user consumption
            this.log(`${operation} failed: ${error.message}`);

            // Let the app keep running by returning an empty result.
            return of(result as T);
        };
    }

    /** Log a HeroService message with the MessageService */
    // tslint:disable-next-line: typedef
    private log(message: string) {
        console.log(message);
    }
}