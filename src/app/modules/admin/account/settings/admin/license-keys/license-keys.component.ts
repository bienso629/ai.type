import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
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
    domains: any[] = [];

    ColumnMode = ColumnMode;
    SelectionType = SelectionType;
    selected = [];

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
        const dialogRef = this.dialog.open(SettingsCreateLicenseKeyComponent, {
            width: '640px',
            data: {
                title: 'Gia hạn',
                icon: 'feather:edit-3',
                type: 'extend',
                user: this.user,
                item: item
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            console.log('result', result);
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
