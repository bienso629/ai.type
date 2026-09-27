import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Route, Router, RouterStateSnapshot, UrlSegment, UrlTree } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from 'app/core/auth/auth.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { UserService } from 'app/core/user/user.service';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard  {
    public static _cachedActiveInfoStr: string | null = null;
    public static _cachedHasValidLicense: boolean = false;

    /**
     * Constructor
     */
    constructor(
        private _authService: AuthService,
        private _router: Router,
        private _multiAccountService: MultiAccountService,
        private _userService: UserService
    ) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Can activate
     *
     * @param route
     * @param state
     */
    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
        const redirectUrl = state.url;
        return this._check(redirectUrl);
    }

    /**
     * Can activate child
     *
     * @param childRoute
     * @param state
     */
    canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
        const redirectUrl = state.url;
        return this._check(redirectUrl);
    }

    /**
     * Can load
     *
     * @param route
     * @param segments
     */
    canLoad(route: Route, segments: UrlSegment[]): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
        return this._check('/sign-in');
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Check if current active license is free or invalid
     */
    private _isFreeOrInvalidLicense(parsed: any): boolean {
        if (!parsed || !parsed.user) {
            return true;
        }
        const user = parsed.user;
        const appId = (user.appId || parsed.appId || '').toLowerCase();
        const plan = (user.plan || user.type || parsed.plan || parsed.type || '').toLowerCase();
        const customerName = (user.info?.customerName || '').toLowerCase();

        // 1. Kiểm tra từ khóa free trực tiếp
        if (appId.includes('free') || plan.includes('free') || customerName.includes('miễn phí') || customerName.includes('free')) {
            return true;
        }

        // 2. Phải có email khách hàng hợp lệ (không phải rỗng, không phải '0', có chứa '@')
        const customerEmail = String(user.info?.email || '').trim().toLowerCase();
        if (!customerEmail || customerEmail === '0' || customerEmail === 'null' || !customerEmail.includes('@')) {
            return true;
        }

        // 3. Phải có licenseKey hoặc appToken
        if (!user.licenseKey && !user.appToken) {
            return true;
        }

        return false;
    }

    /**
     * Check the authenticated and licensed status
     *
     * @param redirectURL
     * @private
     */
    private _check(redirectURL: string): Observable<boolean | UrlTree> {
        const isSignOut = redirectURL.includes('sign-out');
        if (isSignOut) {
            return of(true);
        }

        // Check the authentication status
        return this._authService.check()
            .pipe(
                switchMap((authenticated) => {
                    // If the user is not authenticated...
                    if (!authenticated) {
                        // Redirect to the sign-in page
                        return of(this._router.createUrlTree(['/sign-in'], { queryParams: { redirectURL } }));
                    }

                    // Bắt buộc kiểm tra bản quyền trước khi dùng tính năng
                    // Nếu đang truy cập trang /settings thì cho phép
                    const isSettings = redirectURL.includes('settings') || redirectURL.startsWith('/settings');

                    if (isSettings) {
                        return of(true);
                    }

                    const isMismatch = this._multiAccountService.getItem('token_mismatch');
                    const activeInfoStr = this._multiAccountService.getItem('active_info');

                    let hasValidLicense = false;
                    if (isMismatch !== true && isMismatch !== 'true' && activeInfoStr && activeInfoStr !== 'null' && activeInfoStr !== 'undefined') {
                        // Fast-path: Kiểm tra cache RAM của license validation để chuyển route tức thì
                        if (AuthGuard._cachedActiveInfoStr === activeInfoStr && AuthGuard._cachedHasValidLicense) {
                            return of(true);
                        }

                        try {
                            const isExpired = AuthUtils.isLicenseKeyExpired(activeInfoStr);
                            const parsed = AuthUtils._getActiveInfo(activeInfoStr);
                            const userObj = parsed?.user;
                            
                            const activeOwners = [
                                userObj?.username,
                                userObj?.name,
                                userObj?.email,
                                userObj?.info?.customerName,
                                userObj?.info?.email,
                            ].filter((val) => typeof val === 'string' && val.trim().length > 0).map((v: string) => v.trim().toLowerCase());

                            const sessionUser = this._multiAccountService.getItem('user');
                            const currentIdentifiers = [
                                this._userService.user?.name,
                                this._userService.user?.email,
                                this._multiAccountService.getItem('username'),
                                this._multiAccountService.getItem('email'),
                                sessionUser?.name,
                                sessionUser?.username,
                                sessionUser?.email,
                                this._multiAccountService.currentAccountId,
                            ].filter((val) => typeof val === 'string' && val.trim().length > 0).map((v: string) => v.trim().toLowerCase());

                            const hasValidKey = !!(userObj?.licenseKey || userObj?.appToken);
                            const isOwnerMatch = hasValidKey || activeOwners.length === 0 || currentIdentifiers.length === 0 ||
                                currentIdentifiers.some((id) => activeOwners.includes(id));
                            const isFree = this._isFreeOrInvalidLicense(parsed);

                            if (!isExpired && isOwnerMatch && !isFree) {
                                hasValidLicense = true;
                            }
                        } catch (e) {
                            hasValidLicense = false;
                        }

                        // Lưu vào cache
                        AuthGuard._cachedActiveInfoStr = activeInfoStr;
                        AuthGuard._cachedHasValidLicense = hasValidLicense;
                    } else {
                        AuthGuard._cachedActiveInfoStr = null;
                        AuthGuard._cachedHasValidLicense = false;
                    }

                    if (!hasValidLicense) {
                        return of(this._router.createUrlTree(['/settings'], { queryParams: { tab: 'active' } }));
                    }

                    // Allow the access
                    return of(true);
                })
            );
    }
}
