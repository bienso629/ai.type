import {
    AfterViewInit,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import {
    UntypedFormBuilder,
    UntypedFormGroup,
    NgForm,
    Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { fuseAnimations } from '@fuse/animations';
import { FuseAlertType } from '@fuse/components/alert';
import { AuthService } from 'app/core/auth/auth.service';
import { Subject, takeUntil } from 'rxjs';
import { NgxCaptchaService } from '@binssoft/ngx-captcha';
import { ForumService } from 'app/modules/_services/forum';
import { UserService } from 'app/core/user/user.service';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { UserClientService } from 'app/modules/_services/user';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'auth-sign-in',
    templateUrl: './sign-in.component.html',
    styleUrl: './sign-in.component.scss',
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    animations: fuseAnimations,
})
export class AuthSignInComponent implements OnInit, OnDestroy, AfterViewInit {
    captchaStatus: boolean = false;
    captchaConfig: any = {
        type: 1, // 1 or 2 or 3 or 4
        length: 6,
        cssClass: 'captcha-container-custom',
        back: {
            stroke: '#2F9688',
            solid: '#ffffff',
        },
        font: {
            color: '#222222',
            size: '20px',
        },
    };

    foods = [
        // { value: 'local', viewValue: 'Máy tính cá nhân' },
        { value: 'vn.s1', viewValue: 'Việt Nam - TP.HCM/S1 (ổn định)' },
        { value: 'vn.s2', viewValue: 'Việt Nam - TP.HCM/S2 (ổn định)' },
    ];

    members = [];
    accounts = [];

    @ViewChild('signInNgForm') signInNgForm: NgForm;

    alert: { type: FuseAlertType; message: string } = {
        type: 'success',
        message: '',
    };
    signInForm: UntypedFormGroup;
    showAlert: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------
    /**
     * Sign out
     */
    signOut(): void {
        this._router.navigate(['/sign-out']);
    }

    /**
     * Sign in
     */
    signIn(): void {
        if (this.signInForm.invalid) {
            this.alert = {
                type: 'error',
                message: 'Thiếu thông tin đăng nhập.',
            };

            this.showAlert = true;
            return;
        } else {
            // Disable the form
            this.signInForm.disable();
            this.showAlert = false;

            this._authService.signIn(this.signInForm.value).subscribe(
                (user) => {
                    if (user) {
                        this.checkAccount(user);
                    } else {
                        // this.multiAccountService.removeItem('accessToken');

                        // Re-enable the form
                        this.signInForm.enable();

                        this.alert = {
                            type: 'error',
                            message: 'Tài khoản của bạn không đúng.',
                        };

                        this.showAlert = true;
                    }
                },
                (_) => {
                    // Re-enable the form
                    this.signInForm.enable();
                    this.alert = {
                        type: 'error',
                        message: 'Tài khoản của bạn không được chấp nhận.',
                    };

                    this.showAlert = true;
                },
            );
        }
    }

    async onSelectAccount(accountId: string, index: number) {
        const success = await this.multiAccountService.switchAccount(accountId);
        if (success) {
            const user = this.accounts[index]['profile'];
            if (user) {
                this.checkAccount(user);
            }
        }
    }

    /**
     * Save
     */
    save(user: User): void {
        this._userClientService
            .updateProfile({
                profile: {},
                username: user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (_) => { },
                error: () => { },
                complete: () => { },
            });
    }

    checkAccount(user: any) {
        this._forumService
            .getGroups(this.signInForm.get('server').value)
            .subscribe((result) => {
                if (result && result.success && result.data) {
                    result.data.groups.map((g: any) => {
                        if (g.slug === 'nhóm-đã-mua-ai-type') {
                            this.multiAccountService.setItem('members', g.members);
                        }

                        g.members.map((m: any) => {
                            if (m.uid === user.id) {
                                if (
                                    !user.groups?.includes(
                                        g.slug,
                                    )
                                ) {
                                    user.groups.push(g.slug);
                                }
                            }
                        });
                    });

                    if (this.signInForm.value.rememberMe) {
                        // Store the access token in the local storage
                        this._authService.accessToken = AuthUtils._generateJWTToken(user);
                    }

                    // Store the user on the user service
                    this._userService.user = user;
                    this.save(user);

                    const redirectURL =
                        this._activatedRoute.snapshot.queryParamMap.get(
                            'redirectURL',
                        ) || '/signed-in-redirect';
                    this._router.navigateByUrl(redirectURL);
                } else {
                    // this.multiAccountService.removeItem('accessToken');

                    // Re-enable the form
                    this.signInForm.enable();

                    this.alert = {
                        type: 'warning',
                        message: 'Tài khoản của bạn không đúng.',
                    };
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private _activatedRoute: ActivatedRoute,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _authService: AuthService,
        private _formBuilder: UntypedFormBuilder,
        private captchaService: NgxCaptchaService,
        private _forumService: ForumService,
        private _router: Router,
        private multiAccountService: MultiAccountService
    ) {
        this.captchaService.captchStatus.subscribe((status) => {
            this.captchaStatus = status;
            if (status === false) {
                this.alert = {
                    type: 'error',
                    message: 'Vui lòng nhập đúng mã Captcha.',
                };

                this.showAlert = true;
            }

            if (status === true) {
                this.alert = {
                    type: 'success',
                    message: 'Mã captcha đã nhập đúng.',
                };

                this.showAlert = true;
            }
        });
    }
    /**
     * On init
     */
    ngOnInit(): void {
        // Create the form
        this.signInForm = this._formBuilder.group({
            username: ['', [Validators.required, Validators.email]],
            password: ['', Validators.required],
            server: ['vn.s2', Validators.required],
            rememberMe: [true],
        });

        this.multiAccountService.getAllAccounts().then(accounts => {
            if (accounts && accounts.length > 0) {
                this.accounts = accounts;
            }
        });
    }

    ngAfterViewInit() {
        setTimeout(() => {
            const text = document.querySelector(
                'ngx-captcha .captcha-actions input[type=text]'
            ) as HTMLInputElement;

            if (text) {
                text.placeholder = "Nhập các ký tự và bấm kiểm tra";
            }

            const btn = document.querySelector(
                'ngx-captcha .captcha-actions input[type=button]'
            ) as HTMLInputElement;

            if (btn) {
                btn.value = "Kiểm tra";
            }
        }, 100);
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();

        this.captchaService.unsubscribe();
    }
}
