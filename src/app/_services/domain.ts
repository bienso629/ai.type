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

    public fetch(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal) {
            const localObs = (electron && electron.listLocalDomains)
                ? from(electron.listLocalDomains()).pipe(
                    map((result: any) => (result && result.success && Array.isArray(result.data)) ? result.data : []),
                    catchError(() => of([]))
                )
                : of([]);

            // Thử lấy danh sách domain chuẩn từ Server API (có _id và cấu hình server)
            let serverObs: Observable<any[]> = of([]);
            try {
                let activeInfo = this.multiAccountService.getItem('active_info');
                if (activeInfo) {
                    activeInfo = AuthUtils._getActiveInfo(activeInfo);
                    if (activeInfo && activeInfo['user'] && activeInfo['user']['appToken'] && this.config && this.user) {
                        const serverPayload = {
                            year: 2023,
                            appId: 'ai.typing',
                            appToken: activeInfo['user']['appToken'],
                            username: this.user.name
                        };
                        const url = `${this.config.settings.api[this.user.server]}/domain/all`;
                        const data = {
                            params: this._h.encrypt(serverPayload, this.config.settings.gen)
                        };
                        serverObs = this.http.post<any>(url, data, options).pipe(
                            map(res => (res && res.success && Array.isArray(res.data)) ? res.data : []),
                            catchError(() => of([]))
                        );
                    }
                }
            } catch (e) {
                serverObs = of([]);
            }

            return serverObs.pipe(
                switchMap(serverDomains => localObs.pipe(
                    map(localDomains => {
                        const domainMap = new Map();
                        
                        // 1. Nạp domains từ Server trước (có đầy đủ _id chuẩn)
                        for (const sd of serverDomains) {
                            const clean = (sd.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
                            if (clean) {
                                domainMap.set(clean, { ...sd });
                            }
                        }

                        // 2. Ghi đè/bổ sung từ Local SQLite (nếu local có password thật được cấu hình)
                        for (const ld of localDomains) {
                            const clean = (ld.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
                            if (clean) {
                                const existing = domainMap.get(clean) || {};
                                domainMap.set(clean, {
                                    ...existing,
                                    ...ld,
                                    _id: existing._id || existing.id || ld._id || ld.id,
                                    // Ưu tiên password local nếu đã nhập, ngược lại giữ của server
                                    password: ld.password || existing.password || '',
                                    username: ld.username || existing.username || ''
                                });
                            }
                        }

                        const merged = Array.from(domainMap.values());
                        return { success: true, data: merged.length > 0 ? merged : localDomains };
                    })
                )),
                catchError(this.handleError('fetchMergedDomains', { success: false, data: [] }))
            );
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/domain/all`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public add(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.saveLocalDomain) {
            const domainPayload = dataForm && dataForm.domain ? dataForm.domain : dataForm;
            return from(electron.saveLocalDomain(domainPayload)).pipe(
                map((res: any) => ({ success: true, data: domainPayload, message: 'Lưu cấu hình tên miền cục bộ thành công.' })),
                catchError(this.handleError('saveLocalDomain', { success: false }))
            );
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/domain/add`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public edit(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.saveLocalDomain) {
            const domainPayload = dataForm && dataForm.domain ? dataForm.domain : dataForm;
            return from(electron.saveLocalDomain(domainPayload)).pipe(
                map((res: any) => ({ success: true, data: domainPayload, message: 'Cập nhật cấu hình tên miền cục bộ thành công.' })),
                catchError(this.handleError('editLocalDomain', { success: false }))
            );
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        
        const url = `${this.config.settings.api[this.user.server]}/domain/edit`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
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