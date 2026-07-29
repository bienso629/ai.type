import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

// 1. Thêm Interface này ở đầu file, cùng chỗ với ChatThreadResponse, v.v.
export interface IndexProgressResponse {
    is_running: boolean;  // Có đang chạy index không?
    current?: number;     // Số đoạn đã nhúng xong
    total?: number;       // Tổng số đoạn cần nhúng
    percent?: number;     // Phần trăm (0-100)
    status?: string;      // Dòng trạng thái (ví dụ: "Đang nhúng Vector AI...")
    doc_type?: string;    // Loại tài liệu đang xử lý
}

@Injectable()
export class ChatbotService {
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

    public initDB(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/init-db/${dataForm.username}`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public reindexSpecificFile(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/reindex-file`;

        // Thêm các header chứng thực nếu cần
        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        });
    }

    // 2. Thêm method này vào trong class ChatbotService
    public getIndexProgress(dataForm: any): Observable<IndexProgressResponse> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        const timestamp = new Date().getTime();

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        return this.http.get<IndexProgressResponse>(`${this.config.settings.chatbot}/index-progress/${dataForm.username}?t=${timestamp}`, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        });
    }

    public createThread(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/threads`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public sendMessage(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/messages`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public getMessage(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/messages/${dataForm.username}/${dataForm.currentThread}`;

        return this.http.get<any>(url, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public loadThreads(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/threads/${dataForm.username}`;

        return this.http.get<any>(url, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        }).pipe(
            map(result => {
                if (result && result.data) {
                    return result.data;
                }

                return result;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public selectThread(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/messages/${dataForm.username}/${dataForm.threadId}`;

        return this.http.get<any>(url, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': activeInfo['user']['appToken'],
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    // THÊM VÀO: Hàm chuyên dụng để xử lý Streaming Data (Server-Sent Events)
    public async streamMessage(dataForm: any): Promise<Response> {
        let activeInfo = this.multiAccountService.getItem('active_info');
        if (activeInfo) activeInfo = AuthUtils._getActiveInfo(activeInfo);
        const appToken = activeInfo ? activeInfo['user']['appToken'] : '';

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = appToken;

        const url = `${this.config.settings.chatbot}/messages`;

        // Dùng Fetch API để có thể đọc ReadableStream
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': appToken
            },
            body: JSON.stringify(dataForm)
        });
    }

    public onPdfSelected(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/upload-pdf`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public uploadMinerUResult(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.chatbot}/upload-mineru-result`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => data),
            catchError(this.handleError('server', []))
        );
    }

    public listFiles(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/list-files/${dataForm.username}`;

        return this.http.get<any>(url, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public deleteFile(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/delete-file/${dataForm.username}?doc_type=${dataForm.doc_type}&filename=${dataForm.filename}`;

        return this.http.delete<any>(url, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public reIndexFile(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/reindex-file`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }


    public indexFiles(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/index-files/${dataForm.username}`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public indexDomains(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/crawl-domains`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public saveContentUrl(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/save-content-url`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public triggerIndexDomain(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/trigger-index-domain`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public loadChatbotSettings(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/settings/chatbot/${dataForm.username}`;

        return this.http.get<any>(url, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public confirmChatbotSettings(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.chatbot}/settings/chatbot`;

        return this.http.post<any>(url, dataForm, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
                'x-api-key': dataForm.appToken,
            })
        }).pipe(
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
