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
        this.toastr.success(`Copy appToken xong.`);
    }

    /**
     * Save
     */
    save(): void {
        // Return if the form is invalid
        if (this.activeForm.invalid) {
            this.toastr.warning(`Chưa có License Key kích hoạt.`);
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
                                this.multiAccountService.setItem('active_info', activeInfo);
                            }

                            this.toastr.success(`Kích hoạt thành công!`);

                            if ((window as any).electron) {
                                (window as any).electron.relaunchApp();
                            }
                        } else {
                            this.toastr.error(`Key này không thể sử dụng.`);
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
                    }
                });
        }
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
        private multiAccountService: MultiAccountService
    ) {
        this.titleService.setTitle(`kích hoạt phần mềm | ai.type - công cụ tạo content`);

        const activeInfo = this.multiAccountService.getItem('active_info');
        if (activeInfo && activeInfo != 'null' && activeInfo != 'undefined') {
            this.activeInfo = AuthUtils._getActiveInfo(activeInfo);
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
        const dialogRef = this.dialog.open(MomoQrDialog, {
            data: { user: this.user },
            width: '400px',
            disableClose: false
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.fireConfetti();
                this._fuseConfirmationService.open({
                    title: 'Thanh toán thành công',
                    message: 'Cảm ơn bạn! Vui lòng kiểm tra email của bạn để nhận License Key. (Có thể mất vài phút để chúng tôi kiểm tra giao dịch và gửi email cho bạn).',
                    icon: {
                        show: true,
                        name: 'heroicons_outline:check-circle',
                        color: 'success'
                    },
                    actions: {
                        confirm: {
                            show: false,
                            label: 'Đóng',
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
                    <h2 class="m-0 text-xl font-medium">Thanh toán chuyển khoản</h2>
                </div>
                <button mat-icon-button [matDialogClose]="undefined">
                    <mat-icon class="text-secondary" [svgIcon]="'heroicons_outline:x'"></mat-icon>
                </button>
            </div>
            
            <!-- Content -->
            <div class="text-secondary text-center text-sm">
                Để nhận License Key, bạn vui lòng quét mã QR bên dưới để thanh toán <b>2.000đ</b>.<br/>
                ⚠️ Bắt buộc nhập Mã thanh toán: <b class="text-primary">{{orderCode}}</b>
            </div>
            
            <div class="flex justify-center w-full my-4">
                <img [src]="'https://vietqr.app/img?bank=MBBank&acc=0938414436&template=compact&amount=2000&showinfo=true&holder=NGUYEN%20NGOC%20THANH%20VY&store=C%E1%BB%ADa%20h%C3%A0ng%20AI%20Type&memo=' + orderCode" class="w-64 rounded" alt="Mã QR Chuyển Khoản" />
            </div>
        </div>
    `
})
export class MomoQrDialog implements OnInit, OnDestroy {
    private pollInterval: any;
    private sepayToken = 'LSSRM1WYJUTDKOWHOJ9XQ6LSGVW5CX96FTNHVOMAK0CJ7PNIF3UNDQVG8XBMTCEP';
    private initialLatestTxId: number = 0;
    private isFirstLoad: boolean = true;
    public orderCode: string = '';

    constructor(
        public dialogRef: MatDialogRef<MomoQrDialog>,
        @Inject(MAT_DIALOG_DATA) public data: { user: User }
    ) {
        this.orderCode = this.generateOrderCode(this.data.user?.email || '');
    }

    private generateOrderCode(email: string): string {
        if (!email) return 'AITYPE';
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            const char = email.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        const positiveHash = Math.abs(hash) % 1000000;
        return 'AITYPE' + positiveHash.toString().padStart(6, '0');
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
            const response = await fetch('https://my.sepay.vn/userapi/transactions/list', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + this.sepayToken,
                    'Content-Type': 'application/json'
                }
            });
            const resData = await response.json();
            
            if (resData && resData.status === 200 && resData.transactions) {
                const transactions = resData.transactions;
                
                if (transactions.length > 0) {
                    if (this.isFirstLoad) {
                        // Lưu lại ID của giao dịch gần nhất khi vừa mở popup
                        this.initialLatestTxId = parseInt(transactions[0].id, 10);
                        this.isFirstLoad = false;
                        return;
                    }
                    
                    const orderCodeLower = this.orderCode.toLowerCase();
                    
                    // Tìm giao dịch có chứa đúng mã orderCode
                    const found = transactions.find((t: any) => {
                        const content = (t.transaction_content || '').toLowerCase();
                        const amount = parseFloat(t.amount_in);
                        
                        return content.includes(orderCodeLower) && amount >= 2000;
                    });

                    if (found) {
                        // Đóng popup quét QR và chuyển sang popup thông báo thành công
                        this.dialogRef.close('confirmed');
                    }
                }
            }
        } catch (error) {
            console.error('Lỗi khi kiểm tra giao dịch SePay', error);
        }
    }
}
