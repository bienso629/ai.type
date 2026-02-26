import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';
import { ToastrService } from 'ngx-toastr';
import { MXHAutoService } from 'app/modules/_services/mxhauto';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import _ from 'lodash';
import { MatDialog } from '@angular/material/dialog';
import { EditAccountDialog } from './dialogs/edit-dialog';
import { AddAccountDialog } from './dialogs/add-dialog';
// Import thư viện sanitizer để inject HTML an toàn
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
    selector: 'amxh-profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss'],
    providers: [],
    encapsulation: ViewEncapsulation.None
})
export class AMXHProfileAppComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;

    profiles: any[] = [];
    profile: any = {};
    totalProfiles: number = 0;

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // Hàm helper để hiển thị cột Nhân cách
    getPersonaDisplay(note: string): SafeHtml {
        if (!note) return '';
        try {
            const p = JSON.parse(note);
            if (p && p.role) {
                // Hiển thị dạng Badge đẹp mắt
                const html = `
                    <div class="flex flex-row items-center space-x-2">
                        <span class="text-primary-600">${p.role}</span>
                        <span class="text-gray-500 truncate" title="${p.style}">"${p.style}"</span>
                    </div>
                `;
                return this.sanitizer.bypassSecurityTrustHtml(html);
            }
        } catch (e) {
            // Nếu không phải JSON, hiển thị text thường (cắt ngắn nếu dài)
            return this.sanitizer.bypassSecurityTrustHtml(`<span class="text-gray-600 text-sm">${note}</span>`);
        }
        return '';
    }

    onImgError(event: Event) {
        const element = event.target as HTMLImageElement;
        element.src = 'assets/images/avatars/612x612.jpg';
    }

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return true; 
    }

    getRowHeight(row: any) {
        return 60; // Tăng chiều cao row một chút để hiển thị 2 dòng nhân cách
    }

    getProfiles(): void {
        this._mxhautoService.profiles({
            profiles_root: 'C:\\OperaProfiles',
            host: '127.0.0.1',
            verify: true,
            filter: "all",
            include_accounts: true,
            platform: 'tiktok',
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.ok) {
                        this.profiles = result.results;
                        this.totalProfiles = result.count;
                        this.cd.markForCheck();
                    }
                },
                error: () => { },
                complete: () => {
                    this.cd.markForCheck();
                }
            });
    }

    addAcc(row: any) {
        const dialogRef = this.dialog.open(AddAccountDialog, {
            width: '540px',
            data: {
                user: this.user,
                item: {
                    profiles_root: 'C:\\\\OperaProfiles',
                    profiles: [row.profile],
                    platform: 'tiktok',
                    active: true
                }
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result && result.data) {
                // Refresh lại list hoặc push tay
                if (!row['accounts']) row['accounts'] = [];
                row['accounts'].push(result.data['item']);
                this.cd.markForCheck();
            }
        });
    }

    editAcc(item: any) {
        const dialogRef = this.dialog.open(EditAccountDialog, {
            width: '600px', // Mở rộng dialog chút
            data: {
                item: item,
                user: this.user
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result && result.data) {
                // Dữ liệu item đã được cập nhật trong dialog (reference)
                // chỉ cần markCheck để UI vẽ lại cột Nhân cách
                this.cd.markForCheck();
            }
        });
    }

    run() {
        const profiles = _.map(this.selected, 'profile');
        if (profiles.length === 0) {
            this.toastr.warning('Vui lòng chọn profile cần chạy');
            return;
        }

        this._mxhautoService.run({
            "profiles_root": "C:\\\\OperaProfiles",
            "profiles": profiles,
            "base_debug_port": 0,
            "opera_path": "C:\\\\Program Files\\\\Opera\\\\opera.exe",
            "devtools_ready_timeout_ms": 8000,
            "close_tabs_on_start": true,
            "leave_one_tab": true,
            "new_tab_url": "tiktok.com",
            "mode": "replace",
            "window_state": "maximized",
            "prefix_title_with_profile": true,
            "title_prefix_apply_all_tabs": true,
            "post_open_wait_ms": 800,
            "activate_opened_tab": true,
            "username": this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.results) {
                        // Update trạng thái running trên UI
                        result.results.forEach((resItem: any) => {
                            const p = this.profiles.find(x => x.profile === resItem.profile);
                            if (p) p.running = resItem.launched_new || resItem.ok;
                        });
                        this.toastr.success(`Đã khởi động ${result.results.length} profiles`);
                    }
                },
                complete: () => this.cd.markForCheck()
            });
    }

    killProfiles() {
        const profiles = _.map(this.selected, 'profile');
        if (profiles.length === 0) return;

        this._mxhautoService.killProfiles({
            "profiles_root": "C:\\\\OperaProfiles",
            "profiles": profiles,
            "mode": "force",
            "force": true,
            "cache_action": "prune",
            "username": this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.results) {
                        result.results.forEach((resItem: any) => {
                            const p = this.profiles.find(x => x.profile === resItem.profile);
                            if (p) p.running = false;
                        });
                        this.toastr.info('Đã đóng profiles');
                    }
                },
                complete: () => this.cd.markForCheck()
            });
    }

    refresh() {
        this.getProfiles(); // Gọi lại hàm getProfiles chuẩn thay vì keepAlive
    }

    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _mxhautoService: MXHAutoService,
        private toastr: ToastrService,
        public dialog: MatDialog,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private cd: ChangeDetectorRef,
        private sanitizer: DomSanitizer // Inject thêm cái này
    ) {
        this.titleService.setTitle(`Quản lý Profile & Nhân cách`);
    }

    ngOnInit(): void {
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        this.getProfiles();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}