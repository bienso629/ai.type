import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, from, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { UserService } from 'app/core/user/user.service';

import { ForumService } from 'app/_services/forum';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Injectable()
export class AuthService {
    private _authenticated: boolean = false;

    /**
     * Constructor
     */
    constructor(
        private _httpClient: HttpClient,
        private _forumService: ForumService,
        private _userService: UserService,
        private multiAccountService: MultiAccountService
    ) { }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Setter & getter for access token
     */
    set accessToken(token: string) {
        this.multiAccountService.setItem('accessToken', token);
    }

    get accessToken(): string {
        return this.multiAccountService.getItem('accessToken') || '';
    }

    set authenticated(val: boolean) {
        this._authenticated = val;
    }

    get authenticated(): boolean {
        return this._authenticated;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Forgot password
     *
     * @param email
     */
    forgotPassword(email: string): Observable<any> {
        return this._httpClient.post('api/auth/forgot-password', email);
    }

    /**
     * Reset password
     *
     * @param password
     */
    resetPassword(password: string): Observable<any> {
        return this._httpClient.post('api/auth/reset-password', password);
    }

    /**
     * Sign in
     *
     * @param credentials
     */
    signIn(credentials: { username: string; password: string, server: string, rememberMe: boolean }): Observable<any> {
        if (this._authenticated) {
            return throwError('User is already logged in.');
        }

        return this._forumService.loginv3(credentials).pipe(
            switchMap(result => { // Đổi map thành switchMap để xử lý Promise bên trong
                if (result && result.data && result.data.status && result.data.status.code === 'ok') {
                    result = result.data;

                    const user = {
                        id: result.response.uid,
                        name: result.response.username,
                        email: credentials.username,
                        server: credentials.server,
                        postcount: result.response.postcount,
                        reputation: result.response.reputation,
                        avatar: `https://type.vn${result.response.picture}`,
                        status: result.response.status,
                        groups: []
                    };

                    const token = AuthUtils._generateJWTToken(user);
                    this.accessToken = token;
                    this._authenticated = true;
                    this._userService.user = user;

                    // KHỞI TẠO TÀI KHOẢN VÀO INDEXED DB
                    // Bạn cần dùng switchMap ở trên để có thể trả về Observable từ Promise
                    return from(this.multiAccountService.saveAccount(user.email, { user: user, accessToken: token })).pipe(
                        map(() => user)
                    );
                } else {
                    return of(null);
                }
            }),
            catchError(this.handleError('server', []))
        );
    }

    /**
     * Sign in using the access token
     */
    signInUsingToken(): Observable<any> {
        // Sign in using the token
        return this._httpClient.post('api/auth/sign-in-with-token', {
            accessToken: this.accessToken
        }).pipe(
            catchError(() =>
                // Return false
                of(false)
            ),
            switchMap((result: any) => {
                if (result) {
                    // Replace the access token with the new one if it's available on
                    // the result object.
                    //
                    // This is an added optional step for better security. Once you sign
                    // in using the token, you should generate a new one on the server
                    // side and attach it to the result object. Then the following
                    // piece of code can replace the token with the refreshed one.
                    if (result.accessToken) {
                        this.accessToken = result.accessToken;
                    }

                    // Set the authenticated flag to true
                    this._authenticated = true;

                    // Store the user on the user service
                    this._userService.user = result.user;

                    // Return true
                    return of(true);
                } else {
                    return of(false);
                }
            })
        );
    }

    /**
     * Sign out
     */
    signOut(): Observable<any> {
        // Hủy session active trong IndexedDB và xóa RAM cache
        this._authenticated = false;
        this.accessToken = null;
        this._userService.user = null;
        try {
            const { InitialDataResolver } = require('app/app.resolvers');
            if (InitialDataResolver && InitialDataResolver.resetCache) {
                InitialDataResolver.resetCache();
            }
        } catch(e) {}

        return from(this.multiAccountService.clearActiveSession()).pipe(
            map(() => true)
        );
    }

    /**
     * Sign up
     *
     * @param user
     */
    signUp(user: { name: string; email: string; password: string; company: string }): Observable<any> {
        return this._httpClient.post('api/auth/sign-up', user);
    }

    /**
     * Unlock session
     *
     * @param credentials
     */
    unlockSession(credentials: { email: string; password: string }): Observable<any> {
        return this._httpClient.post('api/auth/unlock-session', credentials);
    }

    /**
     * Check the authentication status
     */

    check(): Observable<boolean> {
        // Fast-path: Nếu tài khoản đã xác thực và có trong RAM, trả về of(true) ngay lập tức để chuyển trang không bị giật lag
        if (this._authenticated && this._userService.user && this.accessToken && !AuthUtils.isTokenExpired(this.accessToken)) {
            return of(true);
        }

        // Ép Angular phải chờ MultiAccountService load xong dữ liệu từ IndexedDB trong lần đầu khởi động
        return from(this.multiAccountService.isReady).pipe(
            switchMap(() => {
                // Chỉ khôi phục khi có tài khoản thực sự active trong IndexedDB
                if (!this.multiAccountService.currentAccountId) {
                    this._authenticated = false;
                    this.accessToken = null;
                    this._userService.user = null;
                    return of(false);
                }

                // Phục hồi user và token từ phiên làm việc nếu chưa có
                const cachedUser = this.multiAccountService.getItem('user') || this.multiAccountService.getItem('profile');
                if (cachedUser) {
                    if (!this.accessToken || AuthUtils.isTokenExpired(this.accessToken)) {
                        const token = AuthUtils._generateJWTToken(cachedUser);
                        this.accessToken = token;
                    }
                    this._userService.user = cachedUser;
                    this._authenticated = true;
                    return of(true);
                } else {
                    this._authenticated = false;
                    this.accessToken = null;
                    return of(false);
                }
            })
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
