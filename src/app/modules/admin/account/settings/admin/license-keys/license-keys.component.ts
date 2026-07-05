import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation, ViewChild, TemplateRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { LicenseKeyService } from 'app/modules/_services/licensekey';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { SettingsCreateLicenseKeyComponent } from 'app/modules/admin/account/settings/admin/license-keys/create/create.component';
import { HelperService } from 'app/helper.service';
import { DeviceUUID } from "device-uuid";
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { EmailDialogComponent } from 'app/modules/admin/account/settings/admin/dialogs/email-dialog/email-dialog.component';

@Component({
    selector: 'license-keys',
    templateUrl: './license-keys.component.html',
    styleUrls: ['./license-keys.component.scss'],
    providers: [LicenseKeyService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsLicenseKeysComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;
    uuid = new DeviceUUID().get();
    du = new DeviceUUID().parse();

    editing = {};
    rows = [];
    tempRows = [];
    domains: any[] = [];

    ColumnMode = ColumnMode;
    SelectionType = SelectionType;
    selected = [];

    @ViewChild('extendDialogTemplate') extendDialogTemplate: TemplateRef<any>;
    manualMonths: number = 1;
    isActivating: boolean = false;
    currentExtendRow: any;

    onSelect({ selected }) {
        this.selected = selected;
    }

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    activate(licensekey: string, appId: string) {
        this.toastr.error(`Chức năng này đã tạm khoá.`);
        return;

        this._licenseKeyService.activate({
            username: this.user.name,
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
                        let arrTemp = licensekey.split('-');
                        let so1 = arrTemp[0];
                        let so3 = arrTemp[2];
                        let so4 = arrTemp[3];
                        let so6 = arrTemp[(arrTemp.length) - 1];

                        arrTemp[0] = so6;
                        arrTemp[2] = so4;
                        arrTemp[3] = so3;
                        arrTemp[(arrTemp.length) - 1] = so1;

                        let secrectKey = arrTemp.join('-');
                        localStorage.setItem(`${appId}`, `${licensekey}-${this._h.encrypt(result.data, secrectKey)}`);

                        this.toastr.success(`Kích hoạt thành công.`);
                    } else {
                        this.toastr.error(`License Key này đã sử dụng.`);
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    check(licensekey: string, appId: string) {
        this._licenseKeyService.check({
            username: this.user.name,
            licensekey: licensekey
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.params) {
                        let arrTemp = licensekey.split('-');
                        let so1 = arrTemp[0];
                        let so3 = arrTemp[2];
                        let so4 = arrTemp[3];
                        let so6 = arrTemp[(arrTemp.length) - 1];

                        arrTemp[0] = so6;
                        arrTemp[2] = so4;
                        arrTemp[3] = so3;
                        arrTemp[(arrTemp.length) - 1] = so1;

                        let secrectKey = arrTemp.join('-');

                        result.data = this._h.decrypt(result.params, secrectKey);
                        localStorage.setItem(`${appId}`, `${licensekey}-${this._h.encrypt(result.data.data, secrectKey)}`);

                        this.toastr.success(`Kiểm tra thành công.`);
                    } else {
                        this.toastr.error(`License Key này đã sử dụng.`);
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });

        // const store = localStorage.getItem(`${appId}`);

        // if (store) {
        //     let arrTemp = store.split('-');
        //     let fruits = [arrTemp[0], arrTemp[1], arrTemp[2], arrTemp[3], arrTemp[4], arrTemp[5]];
        //     let licenseKey = fruits.join("-");
        //     let info = store.substring(36);

        //     arrTemp = licenseKey.split('-');

        //     let so1 = arrTemp[0];
        //     let so3 = arrTemp[2];
        //     let so4 = arrTemp[3];
        //     let so6 = arrTemp[(arrTemp.length) - 1];

        //     arrTemp[0] = so6;
        //     arrTemp[2] = so4;
        //     arrTemp[3] = so3;
        //     arrTemp[(arrTemp.length) - 1] = so1;

        //     let secrectKey = arrTemp.join('-');

        //     const activationInfo = this._h.decrypt(info, secrectKey);
        //     console.log('expirationDate', activationInfo['expirationDate']);
        //     this.toastr.success(`Kiểm tra thành công.`);
        // } else {
        //     this.toastr.error(`License Key này đã hết hạn sử dụng.`);
        // }
    }

    fetch() {
        this._licenseKeyService.fetch({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.rows = result.data;
                        this.tempRows = [...result.data];
                        this.rows = [...this.rows];

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    filterData(event: any) {
        const val = event.target.value.toLowerCase();

        // filter our data
        const temp = this.tempRows.filter(function (d) {
            if (!val) return true;
            
            const safeIncludes = (str: string | undefined | null) => {
                return str ? str.toLowerCase().includes(val) : false;
            };

            return safeIncludes(d.info?.customerName) || 
                   safeIncludes(d.info?.email) || 
                   safeIncludes(d.licenseKey) ||
                   safeIncludes(d.appToken) ||
                   safeIncludes(d.orderCode) ||
                   safeIncludes(d.paymentCode) ||
                   safeIncludes(d.info?.orderCode) ||
                   safeIncludes(d.info?.paymentCode) ||
                   safeIncludes(d.info?.address);
        });

        // update the rows
        this.rows = temp;
        this.cd.markForCheck();
    }

    getRowHeight(row: any) {
        if (!row) {
            return 50;
        }

        if (row.height === undefined) {
            return 50;
        }
        return row.height;
    }

    addNewForm() {
        const dialogRef = this.dialog.open(SettingsCreateLicenseKeyComponent, {
            width: '640px',
            data: {
                title: 'Thêm mới',
                icon: 'feather:edit-3',
                type: 'create',
                user: this.user
            }
        });

        dialogRef.afterClosed().subscribe();
    }

    copy(licensekey: string) {
        this.clipboard.copy(licensekey);
        this.toastr.success(`Copy License Key xong.`);
    }

    clone(item: any) {
        const dialogRef = this.dialog.open(SettingsCreateLicenseKeyComponent, {
            width: '640px',
            data: {
                title: 'Sao chép',
                icon: 'feather:edit-3',
                user: this.user,
                type: 'clone',
                item: item
            }
        });

        dialogRef.afterClosed().subscribe();
    }

    updateValue(event, cell, rowIndex) {
        this.editing[rowIndex + '-' + cell] = false;
        this.rows[rowIndex][cell] = event.target.value;
        this.rows = [...this.rows];
    }

    extend(item: any) {
        this.currentExtendRow = item;
        this.manualMonths = 1;
        this.dialog.open(this.extendDialogTemplate, {
            width: '400px',
            data: item
        });
    }

    confirmExtend() {
        this.isActivating = true;
        
        const createDate = new Date();
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + this.manualMonths);
        
        const licenseInfo = {
            ...this.currentExtendRow,
            info: {
                ...this.currentExtendRow.info,
                createDate: createDate.toISOString()
            },
            expirationDate: expirationDate.toISOString()
        };

        this._licenseKeyService.extend({
            username: this.user.name,
            licenseInfo: licenseInfo
        })
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
            next: (result) => {
                this.isActivating = false;
                if (result && result.success) {
                    this.toastr.success(`Đã gia hạn thêm ${this.manualMonths} tháng cho ${this.currentExtendRow?.info?.email || this.currentExtendRow?.info?.customerName}`);
                    this.dialog.closeAll();
                    this.fetch(); // Reload data
                } else {
                    this.toastr.error(`Gia hạn lỗi.`);
                }
            },
            error: () => {
                this.isActivating = false;
                this.toastr.error(`Gia hạn lỗi.`);
            }
        });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _h: HelperService,
        private _userService: UserService,
        private _licenseKeyService: LicenseKeyService,
        private toastr: ToastrService,
        private clipboard: Clipboard,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        public dialog: MatDialog,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef) {
        this.titleService.setTitle(`key hoạt động của app | ai.type - công cụ tạo content`);

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

                if (user.reputation < 1000000) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }

                // lấy danh sách chatgpt về
                this.fetch();
            });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void { }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    async sendMail(row: any) {
        if (!(window as any).electronAPI || !(window as any).electronAPI.sendMassEmails) {
            this.toastr.error('Chưa kết nối được với hệ thống Electron.');
            return;
        }

        const expDate = new Date(row.expirationDate).toLocaleDateString('vi-VN');

        const defaultContent = `Chào ${row.info.customerName},<br><br>
Thông tin phần mềm của bạn:<br>
- Người mua: ${row.info.customerName}<br>
- App ID: ${row.appId}<br>
- Version: ${row.appVersion}<br>
- Ngày hết hạn: ${expDate}<br>
- License Key: ${row.licenseKey}<br><br>
Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!`;

        const dialogRef = this.dialog.open(EmailDialogComponent, {
            width: '600px',
            disableClose: true,
            data: { 
                selectedCount: 1,
                subject: `Thông tin License Key - App ID: ${row.appId}`,
                content: defaultContent
            }
        });

        dialogRef.afterClosed().subscribe(async (emailComposer) => {
            if (emailComposer) {
                const settings = this.multiAccountService.getItem('settings') || {};
                const emailConfig = {
                    nodebbUrl: settings.emailConfig_nodebbUrl || 'https://type.vn',
                    nodebbToken: settings.emailConfig_nodebbToken || '',
                    smtpHost: settings.emailConfig_smtpHost || 'smtp.gmail.com',
                    smtpPort: parseInt(settings.emailConfig_smtpPort || '587', 10),
                    smtpUser: settings.emailConfig_smtpUser || '',
                    smtpPass: settings.emailConfig_smtpPass || ''
                };

                const userPayload = {
                    email: row.info.email,
                    username: row.info.customerName,
                    uid: row.appId
                };

                try {
                    const result = await (window as any).electronAPI.sendMassEmails({
                        senderName: emailComposer.senderName,
                        subject: emailComposer.subject,
                        htmlContent: emailComposer.content,
                        users: [userPayload],
                        config: emailConfig
                    });

                    if (result && result.success) {
                        this.toastr.success(result.message);
                    } else {
                        this.toastr.error('Lỗi khi gửi email: ' + (result?.error || 'Unknown'));
                    }
                } catch (error) {
                    this.toastr.error('Lỗi kết nối Electron: ' + error.message);
                }
            }
        });
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
