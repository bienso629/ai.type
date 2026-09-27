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

                    // Allow the access once authenticated
                    return of(true);
                })
            );
    }
}
