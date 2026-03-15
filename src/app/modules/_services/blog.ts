import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable()
export class BlogService {
    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    private extractFilename = (contentDisposition: string | null): string => {
        if (!contentDisposition) return 'tts.wav';

        const matches = /filename="(.+)"/.exec(contentDisposition);
        return matches && matches[1] ? matches[1] : 'tts.wav';
    }

    constructor(
        private http: HttpClient,
        private _userService: UserService,
        private _h: HelperService,
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

    public async fetchAudioWithHeader(): Promise<string> {
        return fetch('https://bass-game-tuna.ngrok-free.app/result/output_f37f12a7ee9d41a5941c0c9e2ded30e5.wav', {
            headers: {
                'ngrok-skip-browser-warning': 'true'
            }
        }).then(async res => {
            if (!res.ok) {
                // Nếu HTTP lỗi (404, 500, ...)
                const errorText = await res.text();
                throw new Error(`HTTP error ${res.status}: ${errorText}`);
            }

            // Nếu là JSON trả về lỗi từ server
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                const json = await res.json();
                throw new Error(json.detail || "Unknown error from server");
            }

            // Nếu ổn thì trả về blob
            return res.blob();
        })
            .then(blob => {
                return URL.createObjectURL(blob);
            })
            .catch(error => {
                console.error("Lỗi khi tải audio:", error.message);
                return error.message; // Bạn có thể hiển thị ra UI
            });
    }

    public keywords(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/keywords`;

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

    public keywordGoogle(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/google/keyword`;

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

    public googletrend(): Observable<any> {
        return this.http.get<any>(`${this.config.settings.puppeteer}/cdn/trend`, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public googleSearch(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/google/search`;

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

    public googleSearchPromise(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/google/search`;

        return firstValueFrom(this.http.post<any>(url, dataForm, options));
    }

    public synonym(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/synonym`;

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

    public synonymlocal(): Observable<any> {
        const url = `api/common/synonym`;

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

    public text2speech(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/text2speech`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public text2speech2(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api['local']}/blog/text2speech/2024`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public loadmodel(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.tts}/load-model`;

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public text2speech3(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.tts}/submit-merge-job`;

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public getJobStatus(jobId: string): Observable<any> {
        const url = `${this.config.settings.tts}/job-status/${jobId}`;

        return this.http.get<any>(url, {
            observe: 'response', // 👈 để lấy cả headers
            responseType: 'blob' as 'json', // 👈 bắt buộc phải có `as 'json'` vì TypeScript
            headers: new HttpHeaders({
                'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
                'ngrok-skip-browser-warning': 'true',
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public text2speech2024(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/text2speech/2024`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public text2speech2025(dataForm: any): Observable<any> {
        const url = `${this.config.settings.tts}/submit-job`;
        let formData = new FormData();

        formData.append('year', this.year.toString());
        formData.append('appId', 'ai.typing');
        formData.append('speaker_audio', dataForm.speaker_audio);
        formData.append('language', dataForm.language);
        formData.append('tts_text', dataForm.tts_text);
        formData.append('normalize_text', dataForm.normalize_text);
        formData.append('use_filter', dataForm.use_filter);

        return this.http.post<any>(url, formData, {
            observe: 'response', // 👈 để lấy cả headers
            responseType: 'blob' as 'json', // 👈 bắt buộc phải có `as 'json'` vì TypeScript
            headers: new HttpHeaders({
                'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
                'ngrok-skip-browser-warning': 'true',
            })
        }).pipe(
            map((response) => {
                const blob = response.body as Blob;
                // 👇 Lấy filename từ header
                const contentDisposition = response.headers.get('content-disposition');
                const filename = this.extractFilename(contentDisposition);

                return { blob, filename };
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public restart(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/text2speech/2025/restart`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public save(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/text2speech/2025/save`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public upload(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/upload-file/${dataForm.username}`;

        const formData = new FormData();
        formData.append("file", dataForm.file);

        return this.http.post<any>(url, formData, {
            reportProgress: true,
            observe: 'events',
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public img2text(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/img2text/${dataForm.username}`;

        const formData = new FormData();
        formData.append("file", dataForm.file);

        return this.http.post<any>(url, formData, {
            reportProgress: true,
            observe: 'events',
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public img2blog(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/img2blog`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public imgs2blog(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/imgs2blog`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public storeImages(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/upload/images`;

        return firstValueFrom(this.http.post(url, dataForm, options));
    }

    public imgs2BlogPromise(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/imgs2blog`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return firstValueFrom(this.http.post(url, data, options));
    }

    public createImage(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/create/image`;

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

    public uploadThumbnailPromise(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/create/image`;

        return firstValueFrom(this.http.post(url, dataForm, options));
    }

    public allFiles(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/files`;

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public deleteImage(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/delete/image`;

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public uploadImage(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/cdn/website/image`;

        return this.http.post<any>(url, dataForm, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public createPost(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/gemini/create/post`;

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

    public createPostPromise(dataForm: any) {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/gemini/create/post`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return firstValueFrom(this.http.post(url, data, options));
    }

    public sound(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/blog/text2speech/${dataForm.sound}`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public sound2024(urlFile: string): Observable<any> {
        return this.http.get(urlFile, { responseType: 'blob' }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
            }),
            catchError(this.handleError('server', []))
        );
    }

    public synonymscan(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/synonym/crawler`;

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

    public synonymdownload(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.puppeteer}/synonym/crawler/scan`;

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
