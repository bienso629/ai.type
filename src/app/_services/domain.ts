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
        if (electron && isAutoSaveLocal) {
            if (electron.listLocalDomains) {
                return from(electron.listLocalDomains()).pipe(
                    map((result: any) => {
                        const localDomains = (result && result.success && Array.isArray(result.data)) ? result.data : [];
                        return { success: true, data: localDomains };
                    }),
                    catchError(this.handleError('fetchLocalDomains', { success: false, data: [] }))
                );
            }
            return of({ success: true, data: [] });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of({ success: true, data: [] }); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of({ success: true, data: [] });

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']?.['appToken'] || '';

        const serverKey = this.user?.server || 'vn.s1';
        const serverApi = this.config?.settings?.api?.[serverKey] || 'https://apiv1.type.vn/v1';
        const genKey = this.config?.settings?.gen || '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';

        const url = `${serverApi}/domain/all`;

        let data = {
            params: this._h.encrypt(dataForm, genKey)
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
        dataForm.appToken = activeInfo['user']?.['appToken'] || '';

        const serverKey = this.user?.server || 'vn.s1';
        const serverApi = this.config?.settings?.api?.[serverKey] || 'https://apiv1.type.vn/v1';
        const genKey = this.config?.settings?.gen || '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';

        const url = `${serverApi}/domain/add`;

        let data = {
            params: this._h.encrypt(dataForm, genKey)
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
        dataForm.appToken = activeInfo['user']?.['appToken'] || '';
        
        const serverKey = this.user?.server || 'vn.s1';
        const serverApi = this.config?.settings?.api?.[serverKey] || 'https://apiv1.type.vn/v1';
        const genKey = this.config?.settings?.gen || '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';

        const url = `${serverApi}/domain/edit`;

        let data = {
            params: this._h.encrypt(dataForm, genKey)
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