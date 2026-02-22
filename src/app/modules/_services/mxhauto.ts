import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

export interface SseEvent<T = any> {
    event: string;   // 'ready' | 'segment' | 'silence' | 'heartbeat' | 'done' | 'error' | 'message'
    data: T;
}

@Injectable({
    providedIn: 'root'
})
export class MXHAutoService {
    year: number = 2023;
    config: AppConfig;
    user: User;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    stream<T = any>(url: string, events = ['message', 'ready', 'segment', 'silence', 'heartbeat', 'done', 'error']): Observable<SseEvent<T>> {
        return new Observable<SseEvent<T>>((observer) => {
            const es = new EventSource(url);

            // default 'message' (không có "event:" trong SSE)
            es.onmessage = (ev) => {
                this.zone.run(() => {
                    let parsed: any = ev.data;
                    try { parsed = JSON.parse(ev.data); } catch { }
                    observer.next({ event: 'message', data: parsed });
                });
            };

            // các event có tên
            for (const name of events.filter(e => e !== 'message')) {
                es.addEventListener(name, (ev: MessageEvent) => {
                    this.zone.run(() => {
                        let parsed: any = (ev as any).data;
                        try { parsed = JSON.parse((ev as any).data); } catch { }
                        observer.next({ event: name, data: parsed });
                    });
                });
            }

            es.onerror = (err) => { console.warn('SSE error', err); };
            return () => es.close();
        });
    }

    constructor(
        private http: HttpClient,
        private _h: HelperService,
        private zone: NgZone,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService
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

    public profiles(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/profiles/list?profiles_root=${dataForm.profiles_root}&host=${dataForm.host}${(dataForm.verify) ? "&verify=" + dataForm.verify : ""}${(dataForm.filter) ? "&filter=" + dataForm.filter : ""}${(dataForm.include_accounts) ? "&include_accounts=" + dataForm.include_accounts : ""}${(dataForm.platform) ? "&platform=" + dataForm.platform : ""}`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.get<any>(url, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public run(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/profiles/start-profiles`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public runRange(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/profiles/start-range`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public liveWatchStart(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/tiktok/captions/live-watch/start`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public liveWatchStop(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/tiktok/captions/live-watch/stop-all?close_opera=true`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public listLiveStreasm(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/tiktok/captions/live-list`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public watchLiveStream(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/tiktok/captions/direct-stream/start`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public streamSse<T = any>(sessionId: string) {
        const url = `${this.config.settings.mxhauto}/v1/tiktok/captions/direct-stream/sse?session_id=${encodeURIComponent(sessionId)}`;
        return this.stream<T>(url); // hàm stream<EventSource> bạn đã có
    }

    public captchaStream(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/captcha-auto/stream?profiles_root=${dataForm.profiles_root}&profiles=${dataForm.profiles}&ontop_on_detect=${dataForm.ontop_on_detect}&topmost_ms=${dataForm.topmost_ms}`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.get<any>(url, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public searchAndFollow(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/search/click`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public like(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/like/click`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public comment(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/comment/click`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public keepAlive(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/session/keepalive`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public killAll(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/profiles/kill-all`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public killProfiles(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.mxhauto}/v1/opera/profiles/kill-profiles`;

        // let data = {
        //     params: this._h.encrypt(dataForm, dataForm.appToken)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public addAccount(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.mxhauto}/v1/opera/accounts/sqlite/upsert`;

        // let data = {
        //     params: this._h.encrypt(dataForm, this.config.settings.gen)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public updateAccount(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.mxhauto}/v1/opera/accounts/sqlite/update`;

        // let data = {
        //     params: this._h.encrypt(dataForm, this.config.settings.gen)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public deleteAccount(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.mxhauto}/v1/opera/accounts/sqlite/delete`;

        // let data = {
        //     params: this._h.encrypt(dataForm, this.config.settings.gen)
        // };

        return this.http.post<any>(url, dataForm, options).pipe(
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
