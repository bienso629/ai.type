import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';
import { saveAs } from "file-saver";

import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { catchError, tap, map, takeUntil, switchMap } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable()
export class WordpressService {
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

    public categories(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/categories/all`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data && data.success !== undefined ? data.data : data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public posts(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);

        let url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/posts/all`;

        if (dataForm.keyword) {
            dataForm.search = dataForm.keyword;
        }
        if (dataForm.category) {
            dataForm.categories = dataForm.category;
        }
        
        dataForm.per_page = 100;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data && data.success !== undefined ? data.data : data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public delete_post(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);
        dataForm.domain_id = dataForm.domain_id || (dataForm.domainObj ? (dataForm.domainObj.id || dataForm.domainObj._id) : null) || dataForm.id;

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/post/delete`;

        let options = {
            headers: new HttpHeaders({
                'content-type': 'application/json'
            })
        };

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => {
                if (res && res.success !== undefined) {
                    if (res.success && !res.data) {
                        return { id: dataForm.id || 'deleted', ...res };
                    }
                    return res.data;
                }
                return res;
            })
        );
    }

    public update_post(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);
        dataForm.domain_id = dataForm.domain_id || (dataForm.domainObj ? (dataForm.domainObj.id || dataForm.domainObj._id) : null) || dataForm.id;

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/post/update`;

        let options = {
            headers: new HttpHeaders({
                'content-type': 'application/json'
            })
        };

        let uploadObs: Observable<any> = of(null);
        if (dataForm.thumbnail && dataForm.force_update_thumbnail) {
            const thumbs = dataForm.thumbnail.split('\n').map((t: string) => t.trim()).filter((t: string) => t);
            const dataImageThumb = thumbs.find((t: string) => t.startsWith('data:image'));
            
            if (dataImageThumb) {
                // Pass uname and pass as empty strings, domainObj as dataForm
                uploadObs = this.upload_media(dataForm.domain, dataImageThumb, '', '', dataForm);
            }
        }

        return uploadObs.pipe(
            switchMap(mediaRes => {
                if (mediaRes && mediaRes.id) {
                    dataForm.featured_media = mediaRes.id;
                }
                
                let data = {
                    params: this._h.encrypt(dataForm, this.config.settings.gen)
                };

                return this.http.post<any>(url, data, options).pipe(
                    map(res => {
                        if (res && res.success !== undefined) {
                            if (res.success && !res.data) {
                                // Backend might return data: null on successful update.
                                // Construct a valid response so the callers (which expect result.id) do not fail.
                                return { id: dataForm.id || dataForm.wp_post_id || 'updated', ...res };
                            }
                            return res.data;
                        }
                        return res;
                    }),
                    catchError(this.handleError('server', []))
                );
            })
        );
    }

    public upload_media(domain: string, b64: string, uname: string, pass: string, domainObj?: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);
        
        if (typeof domain === 'string' && !domain.startsWith('http')) {
            domain = 'https://' + domain;
        }

        let dataForm: any = {
             domain: domain,
             b64: b64,
             domain_id: domainObj ? (domainObj.domain_id || domainObj.id || domainObj._id) : null,
             wp_username: uname,
             wp_password: pass,
             username: uname,
             apppass: pass,
             year: this.year,
             appId: 'ai.typing',
             appToken: activeInfo['user']['appToken'],
             sys_username: this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name'])
        };

        const url = `${this.config.settings.api[this.user.server]}/wordpress/media/upload`;
        
        let data = dataForm;

        let options = {
            headers: new HttpHeaders({
                'content-type': 'application/json'
            })
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => res && res.success !== undefined ? res.data : res),
            catchError(err => throwError(() => err))
        );
    }

    public create_category(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);
        dataForm.domain_id = dataForm.domain_id || (dataForm.domainObj ? (dataForm.domainObj.id || dataForm.domainObj._id) : null) || dataForm.id;

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/categories/create`;

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

    public tags(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/tags/all`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data && data.success !== undefined ? data.data : data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public create_tag(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);
        dataForm.domain_id = dataForm.domain_id || (dataForm.domainObj ? (dataForm.domainObj.id || dataForm.domainObj._id) : null) || dataForm.id;

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/tags/create`;

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

    public createTagPromise(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/wordpress/create/tag`;

        return firstValueFrom(this.http.post(url, dataForm, options));
    }

    public create_post(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);
        dataForm.domain_id = dataForm.domain_id || (dataForm.domainObj ? (dataForm.domainObj.id || dataForm.domainObj._id) : null) || dataForm.id;

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/post/create`;

        let options = {
            headers: new HttpHeaders({
                'content-type': 'application/json'
            })
        };

        let uploadObs: Observable<any> = of(null);
        if (dataForm.thumbnail && dataForm.force_update_thumbnail) {
            const thumbs = dataForm.thumbnail.split('\n').map((t: string) => t.trim()).filter((t: string) => t);
            const dataImageThumb = thumbs.find((t: string) => t.startsWith('data:image'));
            
            if (dataImageThumb) {
                // Pass uname and pass as empty strings, domainObj as dataForm
                uploadObs = this.upload_media(dataForm.domain, dataImageThumb, '', '', dataForm);
            }
        }

        return uploadObs.pipe(
            switchMap(mediaRes => {
                if (mediaRes && mediaRes.id) {
                    dataForm.featured_media = mediaRes.id;
                }
                
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
            })
        );
    }

    public async downloadmp3(filesData: any): Promise<any> {
        for (let i = 0; i < filesData.length; i++) {
            let curFile = filesData[i];
            saveAs(curFile.path, 'download.mp3');
        }
    }

    public crawler(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/woo/crawler`;

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

    public scan(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/woo/crawler/scan`;

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
