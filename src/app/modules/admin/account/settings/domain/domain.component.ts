import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ColumnMode } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { DomainService } from 'app/modules/_services/domain';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'settings-domain',
    templateUrl: './domain.component.html',
    styleUrls: ['./domain.component.scss'],
    providers: [DomainService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsDomainComponent implements OnInit, OnDestroy {
    user: User;

    editing = {};
    rows = [];
    domains: any[] = [];

    showPassword: boolean = false;
    ColumnMode = ColumnMode;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // Trộn ký tự mật khẩu
    maskPassword(password: string): string {
        if (!password) return '';
        const chars = '*#@!$&?';
        let seed = 0;
        for (let i = 0; i < password.length; i++) {
            seed += password.charCodeAt(i);
        }
        
        // Độ dài ngẫu nhiên từ 10 đến 25 ký tự để che giấu độ dài thực
        const length = (seed % 16) + 10;
        let masked = '';
        for (let i = 0; i < length; i++) {
            const randIndex = (seed + i * 13) % chars.length;
            masked += chars[randIndex];
        }
        return masked;
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    fetch() {
        this._domainService.fetch({
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
        this.rows.push({
            "name": "",
            "domain": "",
            "username": "",
            "password": "",
            "addnew": true
        });

        this.rows = [...this.rows];

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    updateValue(event, cell, rowIndex) {
        this.editing[rowIndex + '-' + cell] = false;
        this.rows[rowIndex][cell] = event.target.value;
        this.rows = [...this.rows];
    }

    add(index: number) {
        this._domainService.add({
            username: this.user.name,
            domain: this.rows[index]
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Lưu domain mới của bạn xong.`);
                        this.rows[index].addnew = false;
                    }
                },
                error: () => {
                    this.toastr.error(`Lưu domain mới của bạn lỗi.`);
                },
                complete: () => {
                }
            });
    }

    edit(index: number) {
        this._domainService.edit({
            username: this.user.name,
            domain: this.rows[index]
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Chỉnh sửa domain xong.`);
                    }
                },
                error: () => {
                    this.toastr.error(`Chỉnh sửa domain lỗi.`);
                },
                complete: () => {
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _domainService: DomainService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef) {
        this.titleService.setTitle(`quản lý tên miền | ai.type - công cụ tạo content`);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                // lấy danh sách chatgpt về
                this.fetch();
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
