import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';
import { saveAs } from "file-saver";

import { Observable, Subject, firstValueFrom, of, throwError, from } from 'rxjs';
import { catchError, tap, map, takeUntil, switchMap, shareReplay } from 'rxjs/operators';
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

    private _typeVnCategoriesCache$: Observable<any> | null = null;

    public categories(dataForm: any): Observable<any> {
        const domainStr = (dataForm?.domain || '').toLowerCase();
        if (domainStr.includes('type.vn')) {
            if (this._typeVnCategoriesCache$) {
                return this._typeVnCategoriesCache$;
            }
            this._typeVnCategoriesCache$ = this.http.get<any>('https://type.vn/api/categories').pipe(
                map((res: any) => {
                    const list = res?.categories || [];
                    return list.map((c: any) => {
                        let name = c.name || '';
                        if (name) {
                            name = name.replace(/&lsqb;/gi, '[').replace(/&rsqb;/gi, ']');
                            if (name.includes('[[category:uncategorized]]')) {
                                name = name.replace('[[category:uncategorized]]', 'Chưa phân loại');
                            }
                        }
                        return {
                            id: c.cid !== undefined ? c.cid : c.id,
                            cid: c.cid !== undefined ? c.cid : c.id,
                            name: name,
                            slug: c.slug
                        };
                    });
                }),
                shareReplay(1),
                catchError((err) => {
                    this._typeVnCategoriesCache$ = null;
                    return this.handleError('typeVnCategoriesDirect', [])(err);
                })
            );
            return this._typeVnCategoriesCache$;
        }

        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpCategories) {
            return from(electron.wpCategories({
                domain: dataForm?.domain,
                username: dataForm?.username,
                password: dataForm?.password || dataForm?.apppass
            })).pipe(
                map((res: any) => (res && res.success) ? res.data : (res?.data || [])),
                catchError(this.handleError('wpCategoriesLocal', []))
            );
        }

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


    public check_post_exists(domain: string, postId: number|string, username: string, apppass: string): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        if (domain && typeof domain === 'string' && !domain.startsWith('http')) {
            domain = 'https://' + domain;
        }

        let dataForm: any = {
            domain: domain,
            id: postId,
            wp_post_id: postId,
            username: username,
            apppass: apppass,
            year: this.year,
            appId: 'ai.typing',
            appToken: activeInfo['user']['appToken'],
            sys_username: this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name'])
        };

        let url = `${this.config.settings.api[this.user.server]}/plugins/wordpress/post/get`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, {
            headers: new HttpHeaders({
                'content-type': 'application/json',
            })
        }).pipe(
            map(res => {
                return res && res.success !== undefined ? res.data : res;
            }),
            catchError(err => {
                console.error('WP API CHECK FAILED:', err);
                return of(null);
            })
        );
    }

    public posts(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpPosts) {
            return from(electron.wpPosts({
                domain: dataForm?.domain,
                username: dataForm?.username,
                password: dataForm?.password || dataForm?.apppass,
                apppass: dataForm?.apppass || dataForm?.password,
                page: dataForm?.page || 1,
                per_page: dataForm?.per_page || 100,
                keyword: dataForm?.keyword || dataForm?.search,
                category: dataForm?.category || dataForm?.categories,
                status: dataForm?.status
            })).pipe(
                map((res: any) => (res && res.success) ? res.data : (res?.data || [])),
                catchError(this.handleError('wpPostsLocal', []))
            );
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpDeletePost) {
            return from(electron.wpDeletePost({
                domain: dataForm?.domain,
                id: dataForm?.id || dataForm?.wp_post_id || dataForm?.post_id,
                username: dataForm?.username || dataForm?.wp_username,
                password: dataForm?.password || dataForm?.wp_password || dataForm?.apppass,
                force: dataForm?.force || false
            })).pipe(
                map((res: any) => (res && res.success) ? (res.data || { id: dataForm?.id || 'deleted' }) : res),
                catchError(this.handleError('wpDeletePostLocal', null))
            );
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpUpdatePost) {
            return from(electron.wpUpdatePost({
                domain: dataForm?.domain,
                id: dataForm?.id || dataForm?.wp_post_id || dataForm?.post_id,
                username: dataForm?.username || dataForm?.wp_username,
                password: dataForm?.password || dataForm?.wp_password || dataForm?.apppass,
                apppass: dataForm?.apppass || dataForm?.wp_password || dataForm?.password,
                status: dataForm?.status,
                title: dataForm?.title,
                content: dataForm?.content,
                excerpt: dataForm?.excerpt,
                featured_media: dataForm?.featured_media
            })).pipe(
                switchMap((res: any) => {
                    if (res && res.success) {
                        return of(res.data || { id: dataForm?.id || 'updated', ...res });
                    }
                    // Trả thẳng lỗi từ local WordPress REST API, tuyệt đối không âm thầm gọi lên Server API
                    return of({ success: false, error: res?.error || 'Cập nhật bài viết thất bại' });
                }),
                catchError((err) => of({ success: false, error: err?.message || 'Lỗi kết nối tới website WordPress' }))
            );
        }

        return this.update_post_server(dataForm);
    }

    private update_post_server(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info');
        if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo);
        if (!activeInfo) return of(null);

        dataForm.year = this.year;
        if (dataForm.domain && typeof dataForm.domain === 'string' && !dataForm.domain.startsWith('http')) {
            dataForm.domain = 'https://' + dataForm.domain;
        }
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        dataForm.sys_username = this.user ? this.user.name : (activeInfo['user']['username'] || activeInfo['user']['name']);
        dataForm.domain_id = dataForm.domain_id || (dataForm.domainObj ? (dataForm.domainObj.id || dataForm.domainObj._id) : null) || dataForm.id;

        const postId = dataForm.id || dataForm.wp_post_id || dataForm.post_id;
        if (postId) {
            dataForm.id = postId;
            dataForm.wp_post_id = postId;
            dataForm.post_id = postId;
        }

        const uname = dataForm.username || dataForm.wp_username;
        if (uname) {
            dataForm.username = uname;
            dataForm.wp_username = uname;
        }

        const pass = dataForm.apppass || dataForm.wp_password || dataForm.password;
        if (pass) {
            dataForm.apppass = pass;
            dataForm.wp_password = pass;
            dataForm.password = pass;
        }

        if (dataForm && typeof dataForm.content === 'string') {
            dataForm.content = dataForm.content
                .replace(/&nbsp;/gi, ' ')
                .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpUploadMedia) {
            return from(electron.wpUploadMedia({
                domain: domain,
                b64: b64,
                username: uname,
                password: pass,
                apppass: pass
            })).pipe(
                switchMap((res: any) => {
                    if (res && res.success && res.data) {
                        return of(res.data);
                    }
                    if (res && res.id) {
                        return of(res);
                    }
                    return throwError(() => new Error(res?.error || 'Tải ảnh lên WordPress thất bại'));
                }),
                catchError(err => throwError(() => err))
            );
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpCreateCategory) {
            return from(electron.wpCreateCategory({
                domain: dataForm?.domain,
                name: dataForm?.name,
                username: dataForm?.username,
                password: dataForm?.password || dataForm?.apppass,
                apppass: dataForm?.apppass || dataForm?.password
            })).pipe(
                map((res: any) => (res && res.success) ? (res.data || res) : res),
                catchError(this.handleError('wpCreateCategoryLocal', null))
            );
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpTags) {
            return from(electron.wpTags({
                domain: dataForm?.domain,
                username: dataForm?.username,
                password: dataForm?.password || dataForm?.apppass,
                apppass: dataForm?.apppass || dataForm?.password
            })).pipe(
                map((res: any) => (res && res.success) ? res.data : (res?.data || [])),
                catchError(this.handleError('wpTagsLocal', []))
            );
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpCreateTag) {
            return from(electron.wpCreateTag({
                domain: dataForm?.domain,
                name: dataForm?.name,
                username: dataForm?.username,
                password: dataForm?.password || dataForm?.apppass,
                apppass: dataForm?.apppass || dataForm?.password
            })).pipe(
                map((res: any) => (res && res.success) ? (res.data || res) : res),
                catchError(this.handleError('wpCreateTagLocal', null))
            );
        }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;
        if (isAutoSaveLocal && electron && electron.wpCreatePost) {
            return from(electron.wpCreatePost({
                domain: dataForm?.domain,
                username: dataForm?.username || dataForm?.wp_username,
                password: dataForm?.password || dataForm?.wp_password || dataForm?.apppass,
                apppass: dataForm?.apppass || dataForm?.wp_password || dataForm?.password,
                title: dataForm?.title,
                content: dataForm?.content,
                status: dataForm?.status || 'publish',
                excerpt: dataForm?.excerpt,
                featured_media: dataForm?.featured_media,
                categories: dataForm?.categories,
                tags: dataForm?.tags
            })).pipe(
                map((res: any) => {
                    if (res && res.success && res.data) {
                        return res;
                    }
                    if (res && res.id) {
                        return { success: true, data: res, id: res.id };
                    }
                    return res;
                }),
                catchError(this.handleError('wpCreatePostLocal', null))
            );
        }

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

        const uname = dataForm.username || dataForm.wp_username;
        if (uname) {
            dataForm.username = uname;
            dataForm.wp_username = uname;
        }

        const pass = dataForm.apppass || dataForm.wp_password || dataForm.password;
        if (pass) {
            dataForm.apppass = pass;
            dataForm.wp_password = pass;
            dataForm.password = pass;
        }

        if (dataForm && typeof dataForm.content === 'string') {
            dataForm.content = dataForm.content
                .replace(/&nbsp;/gi, ' ')
                .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');
        }

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
