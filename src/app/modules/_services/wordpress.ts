import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';
import { saveAs } from "file-saver";

import { Observable, Subject, firstValueFrom, of } from 'rxjs';
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
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${dataForm.domain}/wp-json/wp/v2/categories?per_page=100`;

        let options = {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
            })
        };

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

    public posts(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${dataForm.domain}/wp-json/wp/v2/posts?per_page=100&_embed=1`;
        if (dataForm.page) {
            url += `&page=${dataForm.page}`;
        }
        if (dataForm.keyword) {
            url += `&search=${encodeURIComponent(dataForm.keyword)}`;
        }
        if (dataForm.category) {
            url += `&categories=${dataForm.category}`;
        }

        let options = {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
            })
        };

        return this.http.get<any>(url, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public update_post(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        const url = `${dataForm.domain}/wp-json/wp/v2/posts/${dataForm.wp_post_id}`;

        let headers = new HttpHeaders({
            'content-type': 'application/json'
        });

        const uname = dataForm.wp_username || dataForm.username;
        const pass = dataForm.wp_password || dataForm.apppass;

        if (uname && pass) {
            const authStr = btoa(`${uname}:${pass}`);
            headers = headers.append('Authorization', `Basic ${authStr}`);
        } else {
            console.warn('Missing wp_username/username or wp_password/apppass for WP update_post!');
        }

        let options = { headers };

        const payload: any = {
            title: dataForm.title,
            content: dataForm.content
        };
        
        if (dataForm.excerpt !== undefined) {
            payload.excerpt = dataForm.excerpt;
        }
        
        if (dataForm.categories && dataForm.categories.length > 0) {
            payload.categories = dataForm.categories;
        }
        if (dataForm.tags && dataForm.tags.length > 0) {
            payload.tags = dataForm.tags;
        }

        let uploadObs: Observable<any> = of(null);
        if (dataForm.thumbnail) {
            const firstThumb = dataForm.thumbnail.split('\n')[0].trim();
            if (firstThumb && firstThumb.startsWith('data:image')) {
                uploadObs = this.upload_media(dataForm.domain, firstThumb, uname, pass);
            }
        }

        return uploadObs.pipe(
            switchMap(mediaRes => {
                if (mediaRes && mediaRes.id) {
                    payload.featured_media = mediaRes.id;
                }
                return this.http.post<any>(url, payload, options).pipe(
                    map(res => res),
                    catchError(this.handleError('server', []))
                );
            })
        );
    }

    public upload_media(domain: string, b64: string, uname: string, pass: string): Observable<any> {
        const url = `${domain}/wp-json/wp/v2/media`;

        const matches = b64.match(/^data:(.+);name=(.+);base64,(.*)$/);
        let mimeType = 'image/jpeg';
        let fileName = 'image.jpg';
        let b64Data = b64;
        
        if (matches) {
            mimeType = matches[1];
            fileName = decodeURIComponent(matches[2]);
            b64Data = matches[3];
        } else {
            const matches2 = b64.match(/^data:([^;]+);base64,(.*)$/);
            if (matches2) {
                mimeType = matches2[1];
                b64Data = matches2[2];
            }
        }

        const byteCharacters = atob(b64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        let headers = new HttpHeaders({
            'Content-Disposition': `attachment; filename="image.jpg"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            'Content-Type': mimeType
        });

        if (uname && pass) {
            const authStr = btoa(`${uname}:${pass}`);
            headers = headers.append('Authorization', `Basic ${authStr}`);
        }

        return this.http.post<any>(url, blob, { headers }).pipe(
            catchError(this.handleError('upload_media', null))
        );
    }

    public create_category(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/wordpress/create/category`;

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

    public tags(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${dataForm.domain}/wp-json/wp/v2/tags?per_page=100`;

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

    public create_tag(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/wordpress/create/tag`;

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

    public createTagPromise(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/wordpress/create/tag`;

        return firstValueFrom(this.http.post(url, dataForm, options));
    }

    public create_post(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/post/create`;

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
