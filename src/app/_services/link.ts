import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { BehaviorSubject, Observable, Subject, of, from } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable({
    providedIn: 'root',
})
export class LogService {
    private _data: BehaviorSubject<any> = new BehaviorSubject(null);

    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for data
     */
    get data$(): Observable<any> {
        return this._data.asObservable();
    }

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

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get data
     */
    getData(): Observable<any> {
        return this.http.get('api/dashboards/crypto').pipe(
            tap((response: any) => {
                this._data.next(response);
            })
        );
    }

    public fetch(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal) {
            if (electron && electron.listLocalLinks) {
                return from(electron.listLocalLinks({
                    username: (this.user && this.user.name) || (dataForm && dataForm.username) || 'admin',
                    keyword: dataForm && dataForm.keyword,
                    page: dataForm && dataForm.page
                })).pipe(
                    catchError(this.handleError('listLocalLinks', { success: false, data: { docs: [], total: 0 } }))
                );
            }
            return of({ success: true, data: { docs: [], total: 0 } });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/crawl/links`;

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

    public total(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal) {
            if (electron && electron.listLocalLinks) {
                return from(electron.listLocalLinks({
                    username: (this.user && this.user.name) || (dataForm && dataForm.username) || 'admin',
                    keyword: dataForm && dataForm.keyword
                })).pipe(
                    map((res: any) => ({
                        success: true,
                        data: { total: (res && res.total) || (res && res.data && res.data.total) || 0 }
                    })),
                    catchError(this.handleError('listLocalLinksTotal', { success: true, data: { total: 0 } }))
                );
            }
            return of({ success: true, data: { total: 0 } });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/crawl/link/total`;

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

    public searchTotal(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal) {
            if (electron && electron.listLocalLinks) {
                return from(electron.listLocalLinks({
                    username: (this.user && this.user.name) || (dataForm && dataForm.username) || 'admin',
                    keyword: dataForm && dataForm.keyword
                })).pipe(
                    map((res: any) => ({
                        success: true,
                        data: { total: (res && res.total) || (res && res.data && res.data.total) || 0 }
                    })),
                    catchError(this.handleError('searchLocalLinksTotal', { success: true, data: { total: 0 } }))
                );
            }
            return of({ success: true, data: { total: 0 } });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/crawl/link/search/total`;

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

    public check(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';

        const url = `${this.config.settings.puppeteer}/links/check`;

        let data = {
            params: this._h.encrypt(dataForm, dataForm.appToken)
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

    public checkseo(url: string): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info');
        activeInfo = AuthUtils._getActiveInfo(activeInfo);

        const dataForm: any = {
            links: [url],
            year: this.year,
            appId: 'ai.typing',
            appToken: (activeInfo && activeInfo['user'] && activeInfo['user']['appToken']) || ''
        };

        const serverKey = (this.user && this.user.server) || 'local';
        const baseUrl = (this.config && this.config.settings && this.config.settings.api && this.config.settings.api[serverKey]) || 'http://localhost:1122/v1';
        const apiUrl = `${baseUrl}/crawl/link/seo`;

        const secretKey = (this.config && this.config.settings && this.config.settings.gen) || '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';
        const data = {
            params: this._h.encrypt(dataForm, secretKey)
        };

        return this.http.post<any>(apiUrl, data, options).pipe(
            map(res => {
                if (res && res.data) {
                    return res.data;
                }
                return res;
            }),
            catchError(this.handleError('checkseo', null))
        );
    }

    public crawl(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';

        const url = `${this.config.settings.puppeteer}/company/crawl`;

        let data = {
            params: this._h.encrypt(dataForm, dataForm.appToken)
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

    public read(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        const url = `${this.config.settings.api[this.user.server]}/blog/reader?url=${dataForm.url}`;

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
        if (isAutoSaveLocal) {
            if (electron && electron.addLocalLink) {
                return from(electron.addLocalLink({
                    link: dataForm.link,
                    title: dataForm.title || dataForm.link,
                    options: dataForm.options || {},
                    username: (this.user && this.user.name) || dataForm.username || 'admin'
                })).pipe(
                    catchError(this.handleError('addLocalLink', { success: false }))
                );
            }
            return of({ success: false, message: 'Chế độ lưu cục bộ chưa sẵn sàng' });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/crawl/link/add`;

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

    public seo(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/crawl/link/seo`;

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

    public update(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal) {
            if (electron && electron.updateLocalLink) {
                return from(electron.updateLocalLink({
                    _id: dataForm._id || dataForm.id,
                    link: dataForm.link,
                    title: dataForm.title || dataForm.link,
                    options: dataForm.options || {},
                    username: (this.user && this.user.name) || dataForm.username || 'admin'
                })).pipe(
                    catchError(this.handleError('updateLocalLink', { success: false }))
                );
            }
            return of({ success: true });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/crawl/link/update`;

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
