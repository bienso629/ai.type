import {
    AfterViewInit,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    ElementRef,
    ChangeDetectionStrategy,
    NgZone,
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

import { ForumService } from 'app/_services/forum';
import { UserService } from 'app/core/user/user.service';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { UserClientService } from 'app/_services/user';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/_services/multi-account.service';

import { MatDialog } from '@angular/material/dialog';
import { TelegramSupportDialogComponent } from './dialogs/telegram-support-dialog.component';

@Component({
    selector: 'auth-sign-in',
    templateUrl: './sign-in.component.html',
    styleUrl: './sign-in.component.scss',
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    animations: fuseAnimations,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class AuthSignInComponent implements OnInit, OnDestroy, AfterViewInit {
    captchaStatus: boolean = false;
    captchaCode: string = '';
    captchaInput: string = '';

    foods = [
        // { value: 'local', viewValue: 'Máy tính cá nhân' },
        { value: 'vn.s3', viewValue: 'Việt Nam - TP.HCM/S3 (ổn định)' },
    ];

    members = [];
    accounts = [];

    @ViewChild('signInNgForm') signInNgForm: NgForm;
    @ViewChild('nativeCaptchaCanvas')
    nativeCaptchaCanvas: ElementRef<HTMLCanvasElement>;

    alert: { type: FuseAlertType; message: string } = {
        type: 'success',
        message: '',
    };
    signInForm: UntypedFormGroup;
    showAlert: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    openTelegramDialog(): void {
        this._matDialog.open(TelegramSupportDialogComponent, {
            autoFocus: false,
            panelClass: 'dark-theme-dialog',
        });
    }

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
        if (!this.captchaStatus) {
            this.alert = {
                type: 'error',
                message: 'Vui lòng nhập đúng mã Captcha.',
            };
            this.showAlert = true;
            return;
        }

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
        try {
            const success = await this.multiAccountService.switchAccount(accountId);
            if (success) {
                const user = this.accounts[index]?.['profile'];
                if (user) {
                    if (user.server && this.signInForm?.get('server')) {
                        this.signInForm.get('server').setValue(user.server);
                    }
                    this.checkAccount(user);
                }
            }
        } catch (err) {
            console.error('Lỗi khi chọn tài khoản:', err);
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
                next: async (_) => {},
                error: () => {},
                complete: () => {},
            });
    }

    async checkAccount(user: any) {
        // Đánh dấu xác thực ngay lập tức để Guard và UI thông qua
        const token = AuthUtils._generateJWTToken(user);
        this._authService.authenticated = true;
        this._authService.accessToken = token;
        this._userService.user = user;

        const server = user?.server || this.signInForm?.get('server')?.value || 'vn.s3';

        // Đảm bảo lưu xong session xuống DB và localStorage trước khi chuyển trang
        await this.multiAccountService.saveAccount(user.email, { user: user, accessToken: token });
        await this.multiAccountService.forceSave();

        // Điều hướng ngay lập tức trong NgZone
        this._ngZone.run(() => {
            const redirectURL =
                this._activatedRoute.snapshot.queryParamMap.get(
                    'redirectURL',
                ) || '/signed-in-redirect';
            this._router.navigateByUrl(redirectURL);
        });

        // Đồng bộ nhóm từ forum chạy ngầm trong background, không chặn luồng đăng nhập
        this._forumService
            .getGroups(server)
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        result.data.groups?.map((g: any) => {
                            if (g.slug === 'nhóm-đã-mua-ai-type') {
                                this.multiAccountService.setItem(
                                    'members',
                                    g.members,
                                );
                            }

                            g.members?.map((m: any) => {
                                if (m.uid === user.id) {
                                    if (!user.groups) {
                                        user.groups = [];
                                    }
                                    if (!user.groups.includes(g.slug)) {
                                        user.groups.push(g.slug);
                                    }
                                }
                            });
                        });
                        this.multiAccountService.saveAccount(user.email, { user: user, accessToken: token });
                    }
                },
                error: () => {}
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
        private _forumService: ForumService,
        private _router: Router,
        private multiAccountService: MultiAccountService,
        private _matDialog: MatDialog,
        private _ngZone: NgZone,
    ) {}

    generateCaptcha(retryCount = 0) {
        const characters =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const charactersLength = characters.length;
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(
                Math.floor(Math.random() * charactersLength),
            );
        }
        this.captchaCode = result;
        this.captchaStatus = null;
        this.captchaInput = '';

        setTimeout(() => {
            let canvas = null;
            if (
                this.nativeCaptchaCanvas &&
                this.nativeCaptchaCanvas.nativeElement
            ) {
                canvas = this.nativeCaptchaCanvas.nativeElement;
            } else {
                canvas = document.getElementById(
                    'nativeCaptchaCanvas',
                ) as HTMLCanvasElement;
            }

            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.strokeStyle = '#2F9688';
                for (let i = 0; i < 15; i++) {
                    ctx.beginPath();
                    ctx.moveTo(
                        Math.random() * canvas.width,
                        Math.random() * canvas.height,
                    );
                    ctx.lineTo(
                        Math.random() * canvas.width,
                        Math.random() * canvas.height,
                    );
                    ctx.stroke();
                }

                ctx.font = '24px Arial';
                ctx.fillStyle = '#222222';
                ctx.fillText(this.captchaCode, 40, 35);
            } else if (retryCount < 5) {
                // Retry if DOM is not ready
                setTimeout(() => this.generateCaptcha(retryCount + 1), 200);
            }
        }, 50);
    }

    validateCaptcha() {
        if (
            this.captchaInput &&
            this.captchaInput.toLowerCase() === this.captchaCode.toLowerCase()
        ) {
            this.captchaStatus = true;
            this.showAlert = false;
        } else {
            this.captchaStatus = false;
        }
    }
    /**
     * On init
     */
    ngOnInit(): void {
        // Create the form
        this.signInForm = this._formBuilder.group({
            username: ['', [Validators.required, Validators.email]],
            password: ['', Validators.required],
            server: ['vn.s3', Validators.required],
            rememberMe: [true],
        });

        this.multiAccountService.getAllAccounts().then((accounts) => {
            if (accounts && accounts.length > 0) {
                this.accounts = accounts.map((acc: any) => {
                    if (acc.profile && acc.profile.avatar) {
                        acc.profile.avatar = acc.profile.avatar.replace(
                            /&#x2F;/gi,
                            '/',
                        );
                    }
                    return acc;
                });
            }
        });
    }

    ngAfterViewInit() {
        setTimeout(() => this.generateCaptcha(), 100);
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();

        this._unsubscribeAll.complete();
    }
}
