import { Injectable } from '@angular/core';
import { cloneDeep } from 'lodash-es';
import { FuseMockApiService } from '@fuse/lib/mock-api';
import { user as userData } from 'app/api/common/user/data';
import { UserService } from 'app/core/user/user.service';
import { AuthUtils } from 'app/core/auth/auth.utils';

@Injectable({
    providedIn: 'root'
})
export class AuthMockApi {
    private _user: any = userData;

    /**
     * Constructor
     */
    constructor(
        private _fuseMockApiService: FuseMockApiService,
        private _userService: UserService
    ) {
        // Get the user's name
        this._userService.user$.subscribe((user) => {
            this._user = user;
        });

        // Register Mock API handlers
        this.registerHandlers();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Register Mock API handlers
     */
    registerHandlers(): void {
        // -----------------------------------------------------------------------------------------------------
        // @ Forgot password - POST
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/auth/forgot-password', 1000)
            .reply(() =>
                [
                    200,
                    true
                ]
            );

        // -----------------------------------------------------------------------------------------------------
        // @ Reset password - POST
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/auth/reset-password', 1000)
            .reply(() =>
                [
                    200,
                    true
                ]
            );

        // -----------------------------------------------------------------------------------------------------
        // @ Sign in - POST
        // Hàm này tạm khoá lại vì không sử dụng
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/auth/sign-in', 1500)
            .reply(({ request }) => {
                // Sign in successful
                if (request.body.email === 'buctuong2000@gmail.com' && request.body.password === 'admin') {
                    return [
                        200,
                        {
                            user: cloneDeep(this._user),
                            accessToken: AuthUtils._generateJWTToken(this._user),
                            tokenType: 'bearer'
                        }
                    ];
                }

                // Invalid credentials
                return [
                    404,
                    false
                ];
            });

        // -----------------------------------------------------------------------------------------------------
        // @ Sign in using the access token - POST
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/auth/sign-in-with-token')
            .reply(({ request }) => {
                // Get the access token
                const accessToken = request.body.accessToken;

                // Verify the token
                const decodedToken = AuthUtils._decodeToken(accessToken);
                if (AuthUtils._verifyJWTToken(accessToken)) {
                    return [
                        200,
                        {
                            user: cloneDeep(decodedToken.user),
                            accessToken: AuthUtils._generateJWTToken(decodedToken.user),
                            tokenType: 'bearer'
                        }
                    ];
                }

                // Invalid token
                return [
                    401,
                    {
                        error: 'Invalid token'
                    }
                ];
            });

        // -----------------------------------------------------------------------------------------------------
        // @ Sign up - POST
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/auth/sign-up', 1500)
            .reply(() =>
                // Simply return true
                [
                    200,
                    true
                ]
            );

        // -----------------------------------------------------------------------------------------------------
        // @ Unlock session - POST
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/auth/unlock-session', 1500)
            .reply(({ request }) => {
                // Sign in successful
                if (request.body.email === 'buctuong2000@gmail.com' && request.body.password === 'admin') {
                    return [
                        200,
                        {
                            user: cloneDeep(this._user),
                            accessToken: AuthUtils._generateJWTToken(this._user),
                            tokenType: 'bearer'
                        }
                    ];
                }

                // Invalid credentials
                return [
                    404,
                    false
                ];
            });
    }
}
