import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation, Inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { User } from 'app/core/user/user.types';
import { LicenseKeyService } from 'app/modules/_services/licensekey';
import { DeviceUUID } from "device-uuid";
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { TranslocoService } from '@ngneat/transloco';

@Component({
    selector: 'settings-active',
    templateUrl: './active.component.html',
    providers: [LicenseKeyService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsActiveComponent implements OnInit, OnDestroy {
    activeForm: UntypedFormGroup;
    activeInfo: any = {};
    plans: any[];
    showPaymentButton: boolean = true;

    config: AppConfig;
    user: User;
    uuid = new DeviceUUID().get();
    du = new DeviceUUID().parse();

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    onDigitPaste(event: any) {
        let clipboardData = event.clipboardData;
        let pastedText = clipboardData.getData('text');
        pastedText = pastedText.replace(/[\s~`!@#$%^&*(){}\[\];:"'<,.>?\/\\|_+=-]/g, '');

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
        if (event.code !== 'Backspace' && nextElement !== null && event.target.value.length >= 5) {
            nextElement.focus();
        }

        if (event.code === 'Backspace' && previousElement !== null && event.target.value.length === 0) {
            previousElement.focus();
        }
    }

    copy(appToken: string) {
        this.clipboard.copy(`${appToken}`);
        this.toastr.success(this._translocoService.translate('app.copy_apptoken_success'));
    }

    /**
     * Save
     */
    save(relaunchApp: boolean = true): void {
        // Return if the form is invalid
        if (this.activeForm.invalid) {
            this.toastr.warning(this._translocoService.translate('app.no_license_key_active'));
            return;
        } else {
            const licensekey = `${this.activeForm.value['licensekey1'].toUpperCase()}-${this.activeForm.value['licensekey2'].toUpperCase()}-${this.activeForm.value['licensekey3'].toUpperCase()}-${this.activeForm.value['licensekey4'].toUpperCase()}-${this.activeForm.value['licensekey5'].toUpperCase()}-${this.activeForm.value['licensekey6'].toUpperCase()}`;

            this._licenseKeyService.activate({
                username: this.user.name,
                email: this.user.email,
                machine: {
                    uuid: this.uuid,
                    du: this.du
                },
                licensekey: licensekey
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            const activeInfo = AuthUtils._generateActiveInfo(result.data, this.uuid);

                            if (activeInfo) {
                                await this.multiAccountService.setItem('active_info', activeInfo);
                                this.activeInfo = AuthUtils._getActiveInfo(activeInfo);
                                if ((window as any).electron) {
                                    await (window as any).electron.invoke('register-license', activeInfo);
                                }
                            }

                            this.toastr.success(this._translocoService.translate('app.activate_success'));

                            if (relaunchApp && (window as any).electron) {
                                (window as any).electron.relaunchApp();
                            }
                        } else {
                            this.toastr.error(this._translocoService.translate('app.key_invalid'));
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
                    }
                });
        }
    }

    restoreLicense(): void {
        this._licenseKeyService.restore({
            email: this.user.email,
            appId: 'ai.typing'
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (result && result.success && result.data && result.data.success && result.data.licenseKey) {
                        this.toastr.success('Khôi phục thành công! Đang kích hoạt...');
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
                        this.toastr.error(result?.data?.message || result?.message || 'Không tìm thấy gói đăng ký nào.');
                    }
                },
                error: (err) => {
                    this.toastr.error('Có lỗi xảy ra khi khôi phục.');
                }
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
        private _translocoService: TranslocoService
    ) {
        this.titleService.setTitle(this._translocoService.translate('app.activate_software_title'));

        const activeInfoStr = this.multiAccountService.getItem('active_info');
        if (activeInfoStr && activeInfoStr != 'null' && activeInfoStr != 'undefined') {
            this.activeInfo = AuthUtils._getActiveInfo(activeInfoStr);
            
            // Nếu có key, kiểm tra xem nó còn bao lâu thì hết hạn
            const expirationDate = AuthUtils._getTokenExpirationDate(activeInfoStr);
            if (expirationDate) {
                const now = new Date().valueOf();
                const exp = expirationDate.valueOf();
                const daysLeft = (exp - now) / (1000 * 60 * 60 * 24);
                
                // Nếu còn hơn 45 ngày thì ẩn nút, ngược lại (<= 45 ngày hoặc đã hết hạn) thì hiện
                if (daysLeft > 45) {
                    this.showPaymentButton = false;
                } else {
                    this.showPaymentButton = true;
                }
            }
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

                if (user.reputation < 0) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: (message) ? message : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại'
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }

    openMomoPayment() {
        let formKey = '';
        if (this.activeForm && this.activeForm.value && this.activeForm.value['licensekey1']) {
            formKey = `${this.activeForm.value['licensekey1']}-${this.activeForm.value['licensekey2']}-${this.activeForm.value['licensekey3']}-${this.activeForm.value['licensekey4']}-${this.activeForm.value['licensekey5']}-${this.activeForm.value['licensekey6']}`.toUpperCase();
        }
        
        const dialogRef = this.dialog.open(MomoQrDialog, {
            data: { 
                user: this.user,
                apiUrl: this.config.settings.api[this.user.server],
                licenseKey: this.activeInfo?.user?.licenseKey || this.activeInfo?.licenseKey || (formKey.length > 30 ? formKey : null),
                isActivated: !!(this.activeInfo && this.activeInfo.user)
            },
            width: '400px',
            disableClose: false
        });

        dialogRef.afterClosed().subscribe((result: any) => {
            if (result === 'restore') {
                this.restoreLicense();
                return;
            }
            if (result && result.status === 'confirmed') {
                this.fireConfetti();
                
                const generatedKey = result.licenseKey || '...';
                const monthsText = result.months ? `${result.months} ${this._translocoService.translate('app.months')}` : '';
                
                // Tự động điền key vào form và thông báo
                if (generatedKey && generatedKey.length >= 30) {
                    this.onDigitPaste({
                        clipboardData: { getData: () => generatedKey }
                    });
                    
                    const isAlreadyActivated = !!(this.activeInfo && this.activeInfo.user);
                    // Tự động Active luôn cho tài khoản
                    setTimeout(() => {
                        this.save(!isAlreadyActivated);
                    }, 500);
                }

                this._fuseConfirmationService.open({
                    title: this._translocoService.translate('app.payment_success_title'),
                    message: this._translocoService.translate('app.payment_success_message', { months: monthsText, key: generatedKey }),
                    icon: {
                        show: true,
                        name: 'heroicons_outline:check-circle',
                        color: 'success'
                    },
                    actions: {
                        confirm: {
                            show: false,
                            label: this._translocoService.translate('app.close'),
                            color: 'primary'
                        },
                        cancel: {
                            show: false,
                            label: ''
                        }
                    },
                    dismissible: true
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
            
            const myConfetti = (window as any).confetti.create(canvas, { resize: true });
            myConfetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }).then(() => {
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            });
        };

        if ((window as any).confetti) {
            triggerConfetti();
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
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
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center">
                    <div class="flex items-center justify-center w-10 h-10 rounded-full text-blue-600 bg-blue-100 mr-3">
                        <mat-icon class="text-current" [svgIcon]="'heroicons_outline:qrcode'"></mat-icon>
                    </div>
                    <h2 class="m-0 text-xl font-medium">{{ 'app.bank_transfer' | transloco }}</h2>
                </div>
                <button mat-icon-button [matDialogClose]="undefined">
                    <mat-icon class="text-secondary" [svgIcon]="'heroicons_outline:x'"></mat-icon>
                </button>
            </div>
            
            <!-- Content -->
            <div class="flex flex-col mt-2">
                <div class="flex justify-end mb-2" *ngIf="!data?.isActivated">
                    <a class="text-sm font-medium text-primary cursor-pointer hover:underline" [matDialogClose]="'restore'">Khôi phục gói đăng ký</a>
                </div>
                <mat-form-field class="fuse-mat-dense w-full mb-2" appearance="outline" subscriptSizing="dynamic">
                    <mat-label>{{ 'app.select_duration' | transloco }}</mat-label>
                    <mat-select [(value)]="selectedMonths">
                        <mat-option [value]="1">1 {{ 'app.months' | transloco }} (2.000{{ 'app.currency' | transloco }})</mat-option>
                        <mat-option [value]="3">3 {{ 'app.months' | transloco }} (6.000{{ 'app.currency' | transloco }})</mat-option>
                        <mat-option [value]="6">6 {{ 'app.months' | transloco }} (12.000{{ 'app.currency' | transloco }})</mat-option>
                        <mat-option [value]="12">1 {{ 'app.year' | transloco }} (24.000{{ 'app.currency' | transloco }})</mat-option>
                    </mat-select>
                </mat-form-field>

                <div class="text-secondary text-center text-sm mt-2">
                    {{ 'app.scan_qr_to_pay' | transloco }} <b>{{(selectedMonths * 2000).toLocaleString('vi-VN')}}{{ 'app.currency' | transloco }}</b>.<br/>
                    <div class="flex flex-col items-center gap-1 mt-6 mb-2 px-8 py-4 border border-dashed border-primary rounded-lg font-medium w-full">
                        <div class="flex items-center gap-2 text-lg">
                            <span>⚠️</span>
                            <span>{{ 'app.payment_code_required' | transloco }}</span>
                        </div>
                        <div class="flex flex-col items-center gap-3 mt-2 w-full">
                            <b class="text-primary text-2xl tracking-wider">{{orderCode}}</b>
                        </div>
                    </div>
                </div>
                
                <div class="flex flex-col items-center justify-center w-full my-4">
                    <img [src]="'https://vietqr.app/img?bank=MBBank&acc=0938414436&template=compact&amount=' + (selectedMonths * 2000) + '&showinfo=true&holder=NGUYEN%20NGOC%20THANH%20VY&store=AI%20Type&memo=' + orderCode" class="w-64 rounded" [alt]="'app.qr_code' | transloco" />
                    <p class="text-xs text-secondary mt-4 max-w-xs text-center italic">
                        * Nếu bạn quên nhập mã hoặc giao dịch chưa được cộng, vui lòng liên hệ Fanpage/Zalo kèm biên lai để được hỗ trợ.
                    </p>
                </div>
            </div>
        </div>
    `
})
export class MomoQrDialog implements OnInit, OnDestroy {
    private pollInterval: any;
    public orderCode: string = '';
    public selectedMonths: number = 1;

    constructor(
        public dialogRef: MatDialogRef<MomoQrDialog>,
        @Inject(MAT_DIALOG_DATA) public data: { user: User, apiUrl: string, licenseKey?: string, isActivated?: boolean },
        private clipboard: Clipboard,
        private toastr: ToastrService
    ) {
        this.orderCode = this.generateOrderCode(this.data.user?.email || '');
    }

    copyCode() {
        this.clipboard.copy(this.orderCode);
        this.toastr.success('Đã sao chép mã thanh toán!');
    }

    private generateOrderCode(email: string): string {
        if (!email) return 'AITYP';
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            const char = email.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        const positiveHash = Math.abs(hash) % 1000000;
        return 'AITYP' + positiveHash.toString().padStart(6, '0');
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
                    'Content-Type': 'application/json'
                }
            });
            const resData = await response.json();
            
            if (resData && resData.success && resData.licenseKey) {
                // Đóng popup quét QR và chuyển sang popup thông báo thành công cùng với license key
                this.dialogRef.close({ status: 'confirmed', licenseKey: resData.licenseKey, months: resData.months });
            }
        } catch (error) {
            console.error('Lỗi khi kiểm tra giao dịch từ backend', error);
        }
    }
}
