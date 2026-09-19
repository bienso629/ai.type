import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of, from } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable({
    providedIn: 'root'
})
export class ForumService {
    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private http: HttpClient,
        private _h: HelperService,
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

    public loginv3(dataForm: any): Observable<any> {
        const url = `${this.config.settings.api[dataForm.server]}/forum/login/v3`;

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

    public group(dataForm: any): Observable<any> {
        const url = `${this.config.settings.api[dataForm.server]}/forum/group`;

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

    public groupMembers(dataForm: any): Observable<any> {
        const url = `${this.config.settings.api[dataForm.server]}/forum/group/members`;

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

    public groups(dataForm: any): Observable<any> {
        const url = `${this.config.settings.api[dataForm.server]}/forum/groups`;

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

    /**
     * slug to check
     *
     * @param slug
     */
    public getGroup(slug: string, server: string): Observable<any> {
        return this.group({
            slug: slug,
            server: server
        })
            .pipe(takeUntil(this._unsubscribeAll))
    }

    /**
     * slug to check
     *
     * @param slug
     */
    public getGroupMembers(slug: string, server: string, uid: number): Observable<any> {
        return this.groupMembers({
            slug: slug,
            uid: uid,
            server: server
        })
            .pipe(takeUntil(this._unsubscribeAll))
    }

    /**
     * slug to check
     *
     * @param slug
     */
    public getGroups(server: string): Observable<any> {
        const targetServer = (server && this.config?.settings?.api?.[server]) ? server : 'vn.s3';
        return this.groups({
            server: targetServer
        })
            .pipe(takeUntil(this._unsubscribeAll))
    }

    public createTopic(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.createLocalForumTopic) {
            return from(electron.createLocalForumTopic(dataForm)).pipe(
                map(data => data),
                catchError(this.handleError('createLocalForumTopic', { success: true }))
            );
        }

        const url = `${this.config.settings.api[this.user.server]}/forum/topic/create/${dataForm._uid}`;

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

    public category(dataForm?: any): Observable<any> {
        // Luôn gọi trực tiếp https://type.vn/api/categories từ Angular Http Client
        // để DevTools Network hiển thị rõ ràng và lấy dữ liệu chuyên mục mới nhất từ diễn đàn type.vn
        return this.http.get<any>('https://type.vn/api/categories').pipe(
            map((res: any) => {
                const rawList = res?.categories || [];
                const categories = rawList.map((item: any) => {
                    const cid = item.cid !== undefined ? item.cid : item.id;
                    let name = item.name || '';
                    if (name) {
                        name = name.replace(/&lsqb;/gi, '[').replace(/&rsqb;/gi, ']');
                        if (name.includes('[[category:uncategorized]]')) {
                            name = name.replace('[[category:uncategorized]]', 'Chưa phân loại');
                        }
                    }
                    return {
                        ...item,
                        cid: cid,
                        id: cid,
                        name: name
                    };
                });

                // Đồng bộ ngầm vào SQLite nếu đang chạy trong môi trường Electron
                const electron = (window as any).electron;
                if (electron && electron.saveLocalForumCategories) {
                    try {
                        electron.saveLocalForumCategories(categories);
                    } catch (e) {}
                }

                return {
                    success: true,
                    data: {
                        response: {
                            categories: categories
                        }
                    }
                };
            }),
            catchError((err) => {
                console.warn('[ForumService] Lỗi gọi https://type.vn/api/categories trực tiếp, fallback sang local/server:', err);
                const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
                const electron = (window as any).electron;
                if (isAutoSaveLocal && electron && electron.listLocalForumCategories) {
                    return from(electron.listLocalForumCategories(dataForm || {})).pipe(
                        map(data => data),
                        catchError(this.handleError('listLocalForumCategories', {
                            success: true,
                            data: {
                                response: {
                                    categories: [
                                        { cid: 1, id: 1, name: 'Cafe Buổi Sáng', slug: '1/cafe-buổi-sáng' },
                                        { cid: 3, id: 3, name: 'Giới thiệu Phim', slug: '3/giới-thiệu-phim' },
                                        { cid: 28, id: 28, name: 'Giới thiệu Trò chơi', slug: '28/giới-thiệu-trò-chơi' },
                                        { cid: 15, id: 15, name: 'Chuyện đời', slug: '15/chuyện-đời' },
                                        { cid: 27, id: 27, name: 'Radio Chill Phết', slug: '27/radio-chill-phết' },
                                        { cid: 25, id: 25, name: 'Truyện Hay Phết', slug: '25/truyện-hay-phết' },
                                        { cid: 29, id: 29, name: 'Mô hình AI Thiết kế', slug: '29/mô-hình-ai-thiết-kế' },
                                        { cid: 8, id: 8, name: 'Mô hình AI Âm thanh', slug: '8/mô-hình-ai-âm-thanh' },
                                        { cid: 7, id: 7, name: 'Mô hình AI sáng tạo Hình ảnh', slug: '7/mô-hình-ai-sáng-tạo-hình-ảnh' },
                                        { cid: 6, id: 6, name: 'Mô hình AI sáng tạo Video', slug: '6/mô-hình-ai-sáng-tạo-video' },
                                        { cid: 5, id: 5, name: 'Mô hình AI viết', slug: '5/mô-hình-ai-viết' },
                                        { cid: 24, id: 24, name: 'Học làm Video', slug: '24/học-làm-video' },
                                        { cid: 13, id: 13, name: 'Content SEO', slug: '13/content-seo' },
                                        { cid: 10, id: 10, name: 'Lập trình Python', slug: '10/lập-trình-python' },
                                        { cid: 12, id: 12, name: 'Bí Kíp Viết', slug: '12/bí-kíp-viết' },
                                        { cid: 4, id: 4, name: 'Chợ phần mềm', slug: '4/chợ-phần-mềm' },
                                        { cid: 14, id: 14, name: 'Phần mềm AI.TYPE', slug: '14/phần-mềm-ai-type' }
                                    ]
                                }
                            }
                        }))
                    );
                }

                if (this.config?.settings?.api && this.user?.server && dataForm?._uid) {
                    const url = `${this.config.settings.api[this.user.server]}/forum/category/${dataForm._uid}`;
                    let data = {
                        params: this._h.encrypt(dataForm, this.config.settings.gen)
                    };
                    return this.http.post<any>(url, data, options).pipe(
                        catchError(this.handleError('server', { success: false, data: { response: { categories: [] } } }))
                    );
                }

                return of({
                    success: true,
                    data: {
                        response: {
                            categories: []
                        }
                    }
                });
            })
        );
    }

    public notification(dataForm: any): Observable<any> {
        const url = `${this.config.settings.api[this.user.server]}/forum/notification/${dataForm._uid}`;

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

    public following(dataForm: any): Observable<any> {
        const url = `${this.config.settings.api[this.user.server]}/forum/following/${dataForm.username}/${dataForm._uid}`;

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
