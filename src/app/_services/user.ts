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
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable()
export class UserClientService {
    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    private _hasNotifiedTokenMismatch: boolean = false;

    constructor(
        private http: HttpClient,
        private _h: HelperService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService,
        private router: Router,
        private toastr: ToastrService
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

    public updateLinkGetMoney(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/user/linkgetmoney/${dataForm._uid}`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.put<any>(url, data, options).pipe(
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
     * Backend mã hóa response bằng AES (config.gen) khi settings.bcrypt = true
     * (xem HandleSuccess ở _core/helper/success.js). Response lúc đó có dạng
     * { params: "<ciphertext>" } thay vì { success, status, message, data }.
     * Cả hai bên PHẢI dùng cùng secretKey (settings.gen) mới giải mã được.
     */
    private decodeIfEncrypted(data: any): any {
        if (this.config?.settings?.bcrypt && data && data.params) {
            return this._h.decrypt(data.params, this.config.settings.gen);
        }
        return data;
    }

    private checkAndHandleTokenMismatch(resOrErr: any): boolean {
        let msg = '';
        if (typeof resOrErr === 'string') {
            msg = resOrErr;
        } else if (resOrErr) {
            msg = resOrErr.message || resOrErr.error?.message || (typeof resOrErr.error === 'string' ? resOrErr.error : '');
            if (!msg && resOrErr.error && typeof resOrErr.error === 'object') {
                msg = resOrErr.error.message || '';
            }
        }

        const isMismatch = msg && (
            msg.includes('appToken không khớp') || 
            msg.includes('appToken') ||
            msg.includes('Tài khoản này ko được phép truy cập') ||
            msg.includes('không được phép truy cập')
        );

        if (isMismatch) {
            // Xoá active_info không khớp của tài khoản hiện tại ngay lập tức
            try {
                this.multiAccountService.setItem('token_mismatch', true);
                this.multiAccountService.removeItem('active_info');
                localStorage.removeItem('active_info');
                this.multiAccountService.forceSave();
            } catch (e) { }

            if (!this._hasNotifiedTokenMismatch) {
                this._hasNotifiedTokenMismatch = true;
                this.toastr.error(
                    'Tài khoản này chưa có appToken riêng hoặc appToken không khớp. Vui lòng kích hoạt lại License Key để cấp appToken riêng cho tài khoản.',
                    'Yêu cầu kích hoạt lại bản quyền',
                    { timeOut: 8000 }
                );

                // Điều hướng tới tab kích hoạt nếu chưa ở trang settings
                if (!this.router.url.includes('/settings')) {
                    this.router.navigate(['/settings'], { queryParams: { tab: 'active' } });
                }

                // Reset cờ sau 5 giây để không spam thông báo
                setTimeout(() => {
                    this._hasNotifiedTokenMismatch = false;
                }, 5000);
            }
            return true;
        }
        return false;
    }

    private getServerKey(sessionUser?: any): string {
        const candidate = (sessionUser && sessionUser.server) || this.user?.server || 'vn.s3';
        if (this.config?.settings?.api && this.config.settings.api[candidate]) {
            return candidate;
        }
        return 'vn.s3';
    }

    public updateProfile(dataForm: any): Observable<any> {
        // Cập nhật ngay vào cache local để giao diện tức thời
        if (dataForm && dataForm.profile) {
            if (dataForm.profile.settings) {
                this.multiAccountService.setItem('settings', dataForm.profile.settings);
            }
            if (dataForm.profile.editor) {
                this.multiAccountService.setItem('editor', dataForm.profile.editor);
            }
            if (dataForm.profile.following_users) {
                this.multiAccountService.setItem('following_users', dataForm.profile.following_users);
            }
        }

        let activeInfoStr = this.multiAccountService.getItem('active_info');
        if (!activeInfoStr) {
            try { activeInfoStr = localStorage.getItem('active_info'); } catch (e) { }
        }
        if (!activeInfoStr) {
            return of({ success: true, message: 'Đã lưu cấu hình người dùng cục bộ.', data: dataForm?.profile });
        }

        const activeInfoObj = AuthUtils._getActiveInfo(activeInfoStr);
        if (!activeInfoObj || !activeInfoObj['user']) {
            return of({ success: true, message: 'Đã lưu cấu hình người dùng cục bộ.', data: dataForm?.profile });
        }

        const activeUser = activeInfoObj['user'];
        const appToken = activeUser['appToken'];
        const activeOwner = activeUser['username'] || activeUser['name'] || activeUser['email'];

        dataForm = dataForm || {};
        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = appToken;

        const sessionUser: any = this.multiAccountService.getItem('user') || this.user;
        const targetUsername = activeOwner || (dataForm && (dataForm.username || dataForm.name)) || sessionUser?.name;
        dataForm.username = targetUsername;
        dataForm.name = targetUsername;

        const server = this.getServerKey(sessionUser);
        const baseUrl = (this.config?.settings?.api && this.config.settings.api[server]) ? this.config.settings.api[server] : 'https://apiv1.type.vn/v1';
        const url = `${baseUrl}/user/profile/update`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.put<any>(url, data, options).pipe(
            map(data => {
                const decoded = this.decodeIfEncrypted(data);
                if (decoded && (decoded.error || decoded.success === false)) {
                    this.checkAndHandleTokenMismatch(decoded);
                }
                if (decoded && decoded.success && !decoded.data && dataForm.profile) {
                    decoded.data = dataForm.profile;
                }
                return decoded;
            }),
            tap(res => {
                if (res && res.success && res.data) {
                    if (res.data.settings) this.multiAccountService.setItem('settings', res.data.settings);
                }
            }),
            catchError((err) => {
                this.checkAndHandleTokenMismatch(err);
                console.warn('Lưu lên server không thành công, lưu dữ liệu cục bộ:', err);
                return of({ success: true, message: 'Đã lưu cấu hình người dùng cục bộ.', data: dataForm?.profile });
            })
        );
    }

    public profile(dataForm: any): Observable<any> {
        let activeInfoStr = this.multiAccountService.getItem('active_info');
        if (!activeInfoStr) {
            try { activeInfoStr = localStorage.getItem('active_info'); } catch (e) { }
        }
        if (!activeInfoStr) {
            const localSettings = this.multiAccountService.getItem('settings') || {};
            const localEditor = this.multiAccountService.getItem('editor') || {};
            const localFollowing = this.multiAccountService.getItem('following_users') || [];
            const sessionUserName = this.multiAccountService.currentAccountId || 'user';
            const localUser = this.multiAccountService.getItem('user') || this.user || { name: sessionUserName };
            return of({
                success: true,
                data: {
                    user: localUser,
                    settings: localSettings,
                    editor: localEditor,
                    following_users: localFollowing
                }
            });
        }

        const activeInfoObj = AuthUtils._getActiveInfo(activeInfoStr);
        if (!activeInfoObj || !activeInfoObj['user']) {
            const localSettings = this.multiAccountService.getItem('settings') || {};
            const localEditor = this.multiAccountService.getItem('editor') || {};
            const localFollowing = this.multiAccountService.getItem('following_users') || [];
            const sessionUserName = this.multiAccountService.currentAccountId || 'user';
            const localUser = this.multiAccountService.getItem('user') || this.user || { name: sessionUserName };
            return of({
                success: true,
                data: {
                    user: localUser,
                    settings: localSettings,
                    editor: localEditor,
                    following_users: localFollowing
                }
            });
        }

        const activeUser = activeInfoObj['user'];
        const appToken = activeUser['appToken'];
        const activeOwner = activeUser['username'] || activeUser['name'] || activeUser['email'];

        dataForm = dataForm || {};
        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = appToken;

        const sessionUser: any = this.multiAccountService.getItem('user') || this.user;
        const targetUsername = activeOwner || (dataForm && (dataForm.name || dataForm.username)) || sessionUser?.name;
        dataForm.name = targetUsername;
        dataForm.username = targetUsername;

        const server = this.getServerKey(sessionUser);
        const baseUrl = (this.config?.settings?.api && this.config.settings.api[server]) ? this.config.settings.api[server] : 'https://apiv1.type.vn/v1';
        const url = `${baseUrl}/user/profile/${encodeURIComponent(targetUsername)}`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                const decoded = this.decodeIfEncrypted(data);
                if (decoded && (decoded.error || decoded.success === false)) {
                    this.checkAndHandleTokenMismatch(decoded);
                }
                return decoded;
            }),
            catchError((err) => {
                this.checkAndHandleTokenMismatch(err);
                console.warn('Không thể tải profile từ server, dùng dữ liệu cục bộ:', err);
                const localSettings = this.multiAccountService.getItem('settings') || {};
                const localEditor = this.multiAccountService.getItem('editor') || {};
                const localFollowing = this.multiAccountService.getItem('following_users') || [];
                const sessionUserName = targetUsername || this.multiAccountService.currentAccountId || 'user';
                const localUser = this.multiAccountService.getItem('user') || this.user || { name: sessionUserName };
                return of({
                    success: true,
                    data: {
                        user: localUser,
                        settings: localSettings,
                        editor: localEditor,
                        following_users: localFollowing
                    }
                });
            })
        );
    }

    /**
     * Lấy dữ liệu công khai của một username khác (VD: link donate hiển thị trên
     * trang blog/microsite). Không cần appToken khớp username vì đây là dữ liệu
     * công khai — backend chỉ trả field không nhạy cảm (không có settings đầy đủ).
     */
    public publicProfile(dataForm: any): Observable<any> {
        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';

        const url = `${this.config.settings.api[this.user.server]}/user/profile/public/${dataForm.name}`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return this.decodeIfEncrypted(data);
            }),
            catchError(this.handleError('server', []))
        );
    }

    public users(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/user/users`;

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

    public renderTable(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/user/statistic/table/render`;

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

    public updateTable(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/user/statistic/table/update`;

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

    public connecting12345(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.puppeteer}/connecting`;

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

    public exitTypeLite(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.puppeteer}/kill`;

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

    public checkStatusTypeLite(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        let url = `${this.config.settings.puppeteer}/check/status`;

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

    public backupDatabase(dataForm: any): Observable<any> {
        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = dataForm.year || this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/user/database/backup`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return this.decodeIfEncrypted(data);
            }),
            tap(_ => {
                // this.log('backup');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public backupDatabaseToLocal(dataForm: any): Observable<any> {
        let activeInfoStr = this.multiAccountService.getItem('active_info');
        if (!activeInfoStr) {
            try { activeInfoStr = localStorage.getItem('active_info'); } catch (e) { }
        }
        if (!activeInfoStr) {
            return of({ success: false, message: 'Chưa đăng nhập hoặc không tìm thấy thông tin phiên làm việc.' });
        }

        const activeInfo = AuthUtils._getActiveInfo(activeInfoStr);
        if (!activeInfo || !activeInfo['user']) {
            return of({ success: false, message: 'Thông tin xác thực không hợp lệ. Vui lòng đăng nhập lại.' });
        }

        const sessionUser: any = this.multiAccountService.getItem('user') || this.user;
        const activeUser = activeInfo['user'];
        const appToken = activeUser['appToken'];
        const activeOwner = activeUser['username'] || activeUser['name'] || activeUser['email'];

        dataForm = dataForm || {};
        dataForm.year = dataForm.year || 2023;
        dataForm.username = dataForm.username || sessionUser?.name || activeOwner || 'admin';
        dataForm.appId = 'ai.typing';
        dataForm.appToken = appToken;

        const server = this.getServerKey(sessionUser);
        const baseUrl = (this.config?.settings?.api && this.config.settings.api[server]) ? this.config.settings.api[server] : 'https://apiv1.type.vn/v1';
        const url = `${baseUrl}/user/database/backup/local`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => {
                return this.decodeIfEncrypted(res);
            }),
            tap(_ => {
                // this.log('backup/local');
            }),
            catchError(this.handleError('backup/local', { success: false, message: 'Không thể kết nối tới máy chủ sao lưu.' }))
        );
    }

    public restoreDatabase(dataForm: any): Observable<any> {
        let activeInfoStr = this.multiAccountService.getItem('active_info');
        if (!activeInfoStr) {
            try { activeInfoStr = localStorage.getItem('active_info'); } catch (e) { }
        }
        if (!activeInfoStr) {
            return of({ success: false, message: 'Chưa đăng nhập hoặc không tìm thấy thông tin phiên làm việc.' });
        }

        const activeInfo = AuthUtils._getActiveInfo(activeInfoStr);
        if (!activeInfo || !activeInfo['user']) {
            return of({ success: false, message: 'Thông tin xác thực không hợp lệ. Vui lòng đăng nhập lại.' });
        }

        const sessionUser: any = this.multiAccountService.getItem('user') || this.user;
        const activeUser = activeInfo['user'];
        const appToken = activeUser['appToken'];
        const activeOwner = activeUser['username'] || activeUser['name'] || activeUser['email'];

        dataForm = dataForm || {};
        dataForm.year = dataForm.year || this.year;
        dataForm.username = dataForm.username || sessionUser?.name || activeOwner || 'admin';
        dataForm.appId = 'ai.typing';
        dataForm.appToken = appToken;

        const server = this.getServerKey(sessionUser);
        const baseUrl = (this.config?.settings?.api && this.config.settings.api[server]) ? this.config.settings.api[server] : 'https://apiv1.type.vn/v1';
        const url = `${baseUrl}/user/database/restore`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => {
                return this.decodeIfEncrypted(res);
            }),
            tap(_ => {
                // this.log('restore');
            }),
            catchError(this.handleError('restore', { success: false, message: 'Không thể kết nối tới máy chủ khôi phục.' }))
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
