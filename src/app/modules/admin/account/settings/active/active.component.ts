import {
    ChangeDetectionStrategy,
    Component,
    OnDestroy,
    OnInit,
    ViewEncapsulation,
    Inject,
    ChangeDetectorRef,
} from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import {
    MatDialog,
    MAT_DIALOG_DATA,
    MatDialogRef,
} from '@angular/material/dialog';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { User } from 'app/core/user/user.types';
import { LicenseKeyService } from 'app/_services/licensekey';
import { DeviceUUID } from 'device-uuid';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { TranslocoService } from '@jsverse/transloco';

@Component({
    selector: 'settings-active',
    templateUrl: './active.component.html',
    providers: [LicenseKeyService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class SettingsActiveComponent implements OnInit, OnDestroy {
    activeForm: UntypedFormGroup;
    activeInfo: any = {};
    plans: any[];
    get licenseCustomerEmail(): string {
        const info = this.activeInfo?.user?.info;
        if (!info || !info.email) return '';
        const email = String(info.email).trim();
        return email === '0' || email.toLowerCase() === 'null' ? '' : email;
    }

    get isFreeLicense(): boolean {
        if (!this.activeInfo || !this.activeInfo.user) {
            return false;
        }
        const user = this.activeInfo.user;
        const appId = (user.appId || this.activeInfo.appId || '').toLowerCase();
        const plan = (user.plan || user.type || this.activeInfo.plan || this.activeInfo.type || '').toLowerCase();
        const customerName = (user.info?.customerName || '').toLowerCase();
        const customerEmail = String(user.info?.email || '').trim().toLowerCase();

        // 1. Kiểm tra từ khóa free
        if (appId.includes('free') || plan.includes('free') || customerName.includes('miễn phí') || customerName.includes('free')) {
            return true;
        }

        // 2. License Key chính hãng có email hợp lệ đính kèm (không phải rỗng hoặc '0')
        if (!customerEmail || customerEmail === '0' || !customerEmail.includes('@')) {
            return true;
        }

        return false;
    }

    get canShowPaymentButton(): boolean {
        return !!(this.activeInfo && this.activeInfo.user && !this.isFreeLicense);
    }

    config: AppConfig;
    user: User;
    uuid = new DeviceUUID().get();
    du = new DeviceUUID().parse();

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    onDigitPaste(event: any) {
        let clipboardData = event.clipboardData;
        let pastedText = clipboardData.getData('text');
        pastedText = pastedText.replace(
            /[\s~`!@#$%^&*(){}\[\];:"'<,.>?\/\\|_+=-]/g,
            '',
        );

        const licensekey1 = pastedText.substring(0, 5);
        const licensekey2 = pastedText.substring(5, 10);
        const licensekey3 = pastedText.substring(10, 15);
        const licensekey4 = pastedText.substring(15, 20);
        const licensekey5 = pastedText.substring(20, 25);
        const licensekey6 = pastedText.substring(25, 30);

        this.activeForm.setValue({
            licensekey1: licensekey1,
            licensekey2: licensekey2,
            licensekey3: licensekey3,
            licensekey4: licensekey4,
            licensekey5: licensekey5,
            licensekey6: licensekey6,
        });
    }

    onDigitInput(event: any, previousElement: any, nextElement: any): void {
        if (
            event.code !== 'Backspace' &&
            nextElement !== null &&
            event.target.value.length >= 5
        ) {
            nextElement.focus();
        }

        if (
            event.code === 'Backspace' &&
            previousElement !== null &&
            event.target.value.length === 0
        ) {
            previousElement.focus();
        }
    }

    copy(appToken: string) {
        this.clipboard.copy(`${appToken}`);
        this.toastr.success(
            this._translocoService.translate('app.copy_apptoken_success'),
        );
    }

    /**
     * Save
     */
    save(relaunchApp: boolean = true): void {
        // Return if the form is invalid
        if (this.activeForm.invalid) {
            this.toastr.warning(
                this._translocoService.translate('app.no_license_key_active'),
            );
            return;
        } else {
            const licensekey = `${this.activeForm.value['licensekey1'].toUpperCase()}-${this.activeForm.value['licensekey2'].toUpperCase()}-${this.activeForm.value['licensekey3'].toUpperCase()}-${this.activeForm.value['licensekey4'].toUpperCase()}-${this.activeForm.value['licensekey5'].toUpperCase()}-${this.activeForm.value['licensekey6'].toUpperCase()}`;

            const username = this.user?.name || this.multiAccountService.getItem('username') || 'user';
            const email = this.user?.email || this.multiAccountService.getItem('email') || 'user@type.vn';

            this._licenseKeyService
                .activate({
                    username: username,
                    email: email,
                    machine: {
                        uuid: this.uuid,
                        du: this.du,
                    },
                    licensekey: licensekey,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            const activeInfo = AuthUtils._generateActiveInfo(
                                result.data,
                                this.uuid,
                            );

                            if (activeInfo) {
                                await this.multiAccountService.setItem(
                                    'active_info',
                                    activeInfo,
                                );
                                this.activeInfo =
                                    AuthUtils._getActiveInfo(activeInfo);
                                if ((window as any).electron) {
                                    await (window as any).electron.invoke(
                                        'register-license',
                                        activeInfo,
                                    );
                                }
                            }
                            this._cdr.detectChanges();

                            this.toastr.success(
                                this._translocoService.translate(
                                    'app.activate_success',
                                ),
                            );

                            // Cần delay một chút để ghi PouchDB hoàn tất trước khi restart
                            if (relaunchApp && (window as any).electron) {
                                await this.multiAccountService.forceSave();
                                (window as any).electron.relaunchApp();
                            }
                        } else {
                            const errorMsg = result?.message || result?.error || this._translocoService.translate('app.key_invalid');
                            this.toastr.error(errorMsg);
                        }
                    },
                    error: (err) => {
                        this.toastr.error(err?.message || 'Lỗi kết nối máy chủ kích hoạt.');
                    },
                    complete: () => {},
                });
        }
    }

    restoreLicense(): void {
        this._licenseKeyService
            .restore({
                email: this.user.email,
                appId: 'ai.typing',
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (
                        result &&
                        result.success &&
                        result.data &&
                        result.data.success &&
                        result.data.licenseKey
                    ) {
                        this.toastr.success(
                            'Khôi phục thành công! Đang kích hoạt...',
                        );
                        // Điền vào form và tự động submit
                        const key = result.data.licenseKey.replace(/-/g, '');
                        if (key.length === 30) {
                            this.activeForm.patchValue({
                                licensekey1: key.substring(0, 5),
                                licensekey2: key.substring(5, 10),
                                licensekey3: key.substring(10, 15),
                                licensekey4: key.substring(15, 20),
                                licensekey5: key.substring(20, 25),
                                licensekey6: key.substring(25, 30),
                            });
                            this.save();
                        }
                    } else {
                        this.toastr.error(
                            result?.data?.message ||
                                result?.message ||
                                'Không tìm thấy gói đăng ký nào.',
                        );
                    }
                },
                error: (err) => {
                    this.toastr.error('Có lỗi xảy ra khi khôi phục.');
                },
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _licenseKeyService: LicenseKeyService,
        private toastr: ToastrService,
        private clipboard: Clipboard,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        public dialog: MatDialog,
        private _formBuilder: UntypedFormBuilder,
        private multiAccountService: MultiAccountService,
        private _translocoService: TranslocoService,
        private _cdr: ChangeDetectorRef,
    ) {
        this.titleService.setTitle(
            `kích hoạt phần mềm | ai.type - công cụ tạo content`,
        );

        const activeInfoStr = this.multiAccountService.getItem('active_info');
        if (
            activeInfoStr &&
            activeInfoStr != 'null' &&
            activeInfoStr != 'undefined'
        ) {
            this.activeInfo = AuthUtils._getActiveInfo(activeInfoStr);
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Create the form
        this.activeForm = this._formBuilder.group({
            licensekey1: [''],
            licensekey2: [''],
            licensekey3: [''],
            licensekey4: [''],
            licensekey5: [''],
            licensekey6: [''],
        });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.refreshActiveInfo();
            });

        this.multiAccountService.activeAccount$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.refreshActiveInfo();
            });

        if (this.multiAccountService.isReady) {
            this.multiAccountService.isReady.then(() => {
                this.refreshActiveInfo();
            });
        }
    }

    private refreshActiveInfo(): void {
        const activeInfoStr = this.multiAccountService.getItem('active_info');
        if (
            activeInfoStr &&
            activeInfoStr != 'null' &&
            activeInfoStr != 'undefined'
        ) {
            this.activeInfo = AuthUtils._getActiveInfo(activeInfoStr);
        } else {
            this.activeInfo = {};
        }
        this._cdr.markForCheck();
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message
                ? message
                : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn',
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại',
                },
            },
            dismissible: false,
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }

    openMomoPayment() {
        let formKey = '';
        if (
            this.activeForm &&
            this.activeForm.value &&
            this.activeForm.value['licensekey1']
        ) {
            formKey =
                `${this.activeForm.value['licensekey1']}-${this.activeForm.value['licensekey2']}-${this.activeForm.value['licensekey3']}-${this.activeForm.value['licensekey4']}-${this.activeForm.value['licensekey5']}-${this.activeForm.value['licensekey6']}`.toUpperCase();
        }

        const dialogRef = this.dialog.open(MomoQrDialog, {
            data: {
                user: this.user,
                apiUrl: this.config.settings.api[this.user.server],
                licenseKey:
                    this.activeInfo?.user?.licenseKey ||
                    this.activeInfo?.licenseKey ||
                    (formKey.length > 30 ? formKey : null),
                isActivated: !!(this.activeInfo && this.activeInfo.user),
            },
            width: '700px',
            disableClose: false,
        });

        dialogRef.afterClosed().subscribe((result: any) => {
            if (result === 'restore') {
                this.restoreLicense();
                return;
            }
            if (result && result.status === 'confirmed') {
                this.fireConfetti();

                const generatedKey = result.licenseKey || '...';
                const monthsText = result.months
                    ? `${result.months} ${this._translocoService.translate('app.months')}`
                    : '';

                // Tự động điền key vào form và thông báo
                if (generatedKey && generatedKey.length >= 30) {
                    this.onDigitPaste({
                        clipboardData: { getData: () => generatedKey },
                    });

                    const isAlreadyActivated = !!(
                        this.activeInfo && this.activeInfo.user
                    );
                    // Tự động Active luôn cho tài khoản
                    setTimeout(() => {
                        this.save(!isAlreadyActivated);
                    }, 500);
                }

                let messageHtml = `<div class="mb-4">${this._translocoService.translate('app.payment_success_message')}</div>`;
                if (result.transaction) {
                    messageHtml += `<div class="bg-gray-100 p-4 rounded-lg mt-4 text-left text-sm space-y-2">
                        <div class="flex justify-between border-b pb-2">
                            <span class="text-gray-500 font-medium">Mã giao dịch:</span>
                            <span class="font-semibold text-gray-800">${result.transaction.transactionId || '---'}</span>
                        </div>
                        <div class="flex justify-between border-b pb-2">
                            <span class="text-gray-500 font-medium">Số tiền:</span>
                            <span class="font-semibold text-gray-800">${(result.transaction.amount || 0).toLocaleString('vi-VN')} đ</span>
                        </div>
                        <div class="flex justify-between border-b pb-2">
                            <span class="text-gray-500 font-medium">Gói đăng ký:</span>
                            <span class="font-semibold text-gray-800">${monthsText || '---'}</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-gray-500 font-medium mb-1">Nội dung thanh toán:</span>
                            <span class="font-semibold text-gray-800 break-all text-xs">${result.transaction.content || '---'}</span>
                        </div>
                    </div>`;
                }

                this._fuseConfirmationService.open({
                    title: this._translocoService.translate(
                        'app.payment_success_title',
                    ),
                    message: messageHtml,
                    icon: {
                        show: true,
                        name: 'heroicons_outline:check-circle',
                        color: 'success',
                    },
                    actions: {
                        confirm: {
                            show: false,
                            label: this._translocoService.translate(
                                'app.close',
                            ),
                            color: 'primary',
                        },
                        cancel: {
                            show: false,
                            label: '',
                        },
                    },
                    dismissible: true,
                });
            }
        });
    }

    fireConfetti() {
        const triggerConfetti = () => {
            const canvas = document.createElement('canvas');
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.zIndex = '999999';
            canvas.style.pointerEvents = 'none';
            document.body.appendChild(canvas);

            const myConfetti = (window as any).confetti.create(canvas, {
                resize: true,
            });
            myConfetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
            }).then(() => {
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            });
        };

        if ((window as any).confetti) {
            triggerConfetti();
        } else {
            const script = document.createElement('script');
            script.src =
                'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
            script.onload = triggerConfetti;
            document.body.appendChild(script);
        }
    }
}

@Component({
    selector: 'momo-qr-dialog',
    template: `
        <div class="flex flex-col">
            <!-- Header -->
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <div
                        class="flex items-center justify-center w-10 h-10 rounded-full text-blue-600 bg-blue-100 mr-3"
                    >
                        <mat-icon
                            class="text-current"
                            [svgIcon]="'heroicons_outline:qrcode'"
                        ></mat-icon>
                    </div>
                    <h2 class="m-0 text-xl font-medium">
                        {{ 'app.bank_transfer' | transloco }}
                    </h2>
                </div>
                <button mat-icon-button [matDialogClose]="undefined">
                    <mat-icon
                        class="text-secondary"
                        [svgIcon]="'heroicons_outline:x'"
                    ></mat-icon>
                </button>
            </div>

            <!-- Content Horizontal Layout -->
            <div class="flex flex-col sm:flex-row gap-6 mt-4">
                <!-- Left Side -->
                <div class="flex flex-col w-full sm:w-1/2 py-6">
                    <mat-form-field
                        class="fuse-mat-dense w-full mb-4"
                        appearance="outline"
                        subscriptSizing="dynamic"
                    >
                        <mat-label>{{
                            'app.select_duration' | transloco
                        }}</mat-label>
                        <mat-select [(value)]="selectedMonths">
                            <mat-option [value]="1"
                                >1 {{ 'app.months' | transloco }} (145.000{{
                                    'app.currency' | transloco
                                }})</mat-option
                            >
                            <mat-option [value]="3"
                                >3 {{ 'app.months' | transloco }} (435.000{{
                                    'app.currency' | transloco
                                }})</mat-option
                            >
                            <mat-option [value]="6"
                                >6 {{ 'app.months' | transloco }} (870.000{{
                                    'app.currency' | transloco
                                }})</mat-option
                            >
                            <mat-option [value]="12"
                                >1 {{ 'app.year' | transloco }} (1.740.000{{
                                    'app.currency' | transloco
                                }})</mat-option
                            >
                        </mat-select>
                    </mat-form-field>

                    <div class="text-secondary text-sm">
                        {{ 'app.scan_qr_to_pay' | transloco }}
                        <b
                            >{{
                                (selectedMonths * 145000).toLocaleString(
                                    'vi-VN'
                                )
                            }}{{ 'app.currency' | transloco }}</b
                        >.<br />
                        <div
                            class="flex flex-col items-center gap-1 mt-6 px-4 py-4 border border-dashed border-primary rounded-lg font-medium w-full"
                        >
                            <div
                                class="flex items-center gap-2 text-base text-red-500"
                            >
                                <span>⚠️</span>
                                <span>{{
                                    'app.payment_code_required' | transloco
                                }}</span>
                            </div>
                            <div
                                class="flex flex-col items-center gap-3 w-full"
                            >
                                <b
                                    class="text-primary text-2xl tracking-wider"
                                    >{{ orderCode }}</b
                                >
                            </div>
                        </div>
                        @if (!data?.isActivated) {
                            <div class="text-center w-full mt-2">
                                <span class="text-secondary mr-1">hoặc</span>
                                <a
                                    class="text-sm font-medium text-primary cursor-pointer hover:underline"
                                    [matDialogClose]="'restore'"
                                    >Khôi phục gói đăng ký</a
                                >
                            </div>
                        }
                    </div>
                </div>

                <!-- Right Side -->
                <div
                    class="flex flex-col items-center justify-center w-full sm:w-1/2"
                >
                    <img
                        [src]="
                            'https://vietqr.app/img?bank=MBBank&acc=0938414436&template=compact&amount=' +
                            selectedMonths * 145000 +
                            '&showinfo=true&holder=NGUYEN%20NGOC%20THANH%20VY&store=AI%20Type&des=' +
                            orderCode
                        "
                        class="w-64 rounded"
                        [alt]="'app.qr_code' | transloco"
                    />
                </div>
            </div>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class MomoQrDialog implements OnInit, OnDestroy {
    private pollInterval: any;
    public orderCode: string = '';
    public selectedMonths: number = 1;

    constructor(
        public dialogRef: MatDialogRef<MomoQrDialog>,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            user: User;
            apiUrl: string;
            licenseKey?: string;
            isActivated?: boolean;
        },
        private clipboard: Clipboard,
        private toastr: ToastrService,
    ) {
        this.orderCode = this.generateOrderCode(this.data.user?.email || '');
    }

    copyCode() {
        this.clipboard.copy(this.orderCode);
        this.toastr.success('Đã sao chép mã thanh toán!');
    }

    private generateOrderCode(email: string): string {
        const randomStr = Math.floor(
            100000 + Math.random() * 900000,
        ).toString();
        return 'AITYP' + randomStr;
    }

    ngOnInit() {
        // Bắt đầu tự động kiểm tra giao dịch mỗi 3 giây
        this.pollInterval = setInterval(() => {
            this.checkPayment();
        }, 3000);
    }

    ngOnDestroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }

    async checkPayment() {
        try {
            // Thay vì gọi SePay trực tiếp, ta gọi API backend của mình
            let url = `${this.data.apiUrl}/payment/check?orderCode=${this.orderCode}&username=${encodeURIComponent(this.data.user?.email || '')}`;
            if (this.data.licenseKey) {
                url += `&licenseKey=${encodeURIComponent(this.data.licenseKey)}`;
            }
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const resData = await response.json();

            if (resData && resData.success && resData.licenseKey) {
                // Đóng popup quét QR và chuyển sang popup thông báo thành công cùng với license key
                this.dialogRef.close({
                    status: 'confirmed',
                    licenseKey: resData.licenseKey,
                    months: resData.months,
                    transaction: resData.transaction,
                });
            }
        } catch (error) {
            console.error('Lỗi khi kiểm tra giao dịch từ backend', error);
        }
    }
}
