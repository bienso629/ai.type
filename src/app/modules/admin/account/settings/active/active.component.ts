import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
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
                                localStorage.setItem('active_info', activeInfo);
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
        private _formBuilder: UntypedFormBuilder
    ) {
        this.titleService.setTitle(`kích hoạt phần mềm | ai.type - công cụ tạo content`);

        const activeInfo = localStorage.getItem('active_info');
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
}
