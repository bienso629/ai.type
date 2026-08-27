import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { interval, Subject, takeUntil } from 'rxjs';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';
import { ToastrService } from 'ngx-toastr';
import { MXHAutoService } from 'app/_services/mxhauto';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import _ from 'lodash';
import { MatDialog } from '@angular/material/dialog';
import { EditAccountDialog } from './dialogs/edit-dialog';
import { AddAccountDialog } from './dialogs/add-dialog';
import { OperaAiDialog } from './dialogs/opera-ai-dialog';
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
    profilesRoot: string = '';
    operaPath: string = '';
    bulkVpnValue: string = 'optimal';

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getProfilesRoot(): string {
        if (this.profilesRoot && this.profilesRoot.trim()) {
            return this.profilesRoot.trim();
        }
        const savedRoot = localStorage.getItem('opera_profiles_root');
        if (savedRoot && savedRoot.trim()) {
            return savedRoot.trim();
        }
        // Để trống để Python Backend tự động lấy Path.home() / "OperaProfiles" của hệ điều hành hiện tại
        return '';
    }

    getOperaPath(): string {
        const savedPath = localStorage.getItem('opera_executable_path');
        if (savedPath && savedPath.trim()) {
            return savedPath.trim();
        }
        return '/usr/bin/opera-gx';
    }

    updateProfilesRoot(val: string) {
        this.profilesRoot = val;
        localStorage.setItem('opera_profiles_root', val);
        this.getProfiles();
    }

    updateOperaPath(val: string) {
        this.operaPath = val;
        localStorage.setItem('opera_executable_path', val);
    }

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

    getAccountAvatar(row: any): string {
        if (row.accounts && row.accounts.length > 0) {
            const acc = row.accounts[0];
            const name = acc.alias || (acc.email ? acc.email.split('@')[0] : '');
            if (name) {
                return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&bold=true&size=128`;
            }
        }
        if (row.avatar) {
            return 'file:///' + row.avatar;
        }
        return 'assets/images/avatars/612x612.jpg';
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

    getProfiles(isSilent: boolean = false): void {
        const reqData: any = {
            host: '127.0.0.1',
            verify: true,
            filter: "all",
            include_accounts: true,
            platform: 'tiktok',
            username: this.user ? this.user.name : ''
        };

        const rootPath = this.getProfilesRoot();
        if (rootPath) {
            reqData.profiles_root = rootPath;
        }

        this._mxhautoService.profiles(reqData)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.ok) {
                        const newResults = result.results || [];
                        if (this.profiles && this.profiles.length > 0 && isSilent) {
                            newResults.forEach((item: any) => {
                                const p = this.profiles.find(x => x.profile === item.profile);
                                if (p) {
                                    p.running = item.running;
                                    p.devtools_port = item.devtools_port;
                                    p.accounts = item.accounts;
                                }
                            });
                        } else {
                            this.profiles = newResults;
                        }
                        this.totalProfiles = result.count || this.profiles.length;
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
            width: '560px',
            panelClass: 'dlg-primary',
            data: {
                user: this.user,
                item: {
                    profiles_root: this.getProfilesRoot(),
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
            width: '560px',
            panelClass: 'dlg-primary',
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

    isHeadless: boolean = false;
    codecStatus: any = null;
    isInstallingCodec: boolean = false;

    async checkOperaCodec(): Promise<void> {
        try {
            if ((window as any).electron && (window as any).electron.invoke) {
                this.codecStatus = await (window as any).electron.invoke('opera:check-ffmpeg');
                this.cd.markForCheck();
            }
        } catch (e) {
            console.error('checkOperaCodec error:', e);
        }
    }

    async installOperaCodec(): Promise<void> {
        if (this.isInstallingCodec) return;
        this.isInstallingCodec = true;
        this.toastr.info('Đang tải và cài đặt thư viện Codec Video H.264/AAC cho Opera...');
        this.cd.markForCheck();
        try {
            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('opera:install-ffmpeg');
                if (res && res.ok) {
                    this.toastr.success('Đã cài đặt thành công Codec Video H.264 & AAC cho Opera!');
                    await this.checkOperaCodec();
                } else {
                    this.toastr.error(res?.error || 'Không thể cài đặt Codec');
                }
            } else {
                this.toastr.warning('Chức năng cài đặt tự động chỉ hỗ trợ trên ứng dụng Electron.');
            }
        } catch (e: any) {
            this.toastr.error(e?.message || 'Lỗi khi cài đặt Codec');
        } finally {
            this.isInstallingCodec = false;
            this.cd.markForCheck();
        }
    }

    openOperaAi(row: any) {
        if (!row || !row.profile) return;
        this.dialog.open(OperaAiDialog, {
            width: '640px',
            data: {
                profile: row.profile,
                profiles_root: this.getProfilesRoot()
            }
        });
    }

    getVpnValue(row: any): string {
        if (!row || !row.vpn) return 'optimal';
        if (row.vpn.enabled === false) return 'off';
        return row.vpn.location || 'optimal';
    }

    onVpnChange(row: any, value: string) {
        if (value === 'off') {
            this.setProfileVpn(row, false, 'optimal');
        } else {
            this.setProfileVpn(row, true, value);
        }
    }

    setProfileVpn(row: any, enabled: boolean = true, location: string = 'optimal') {
        if (!row || !row.profile) return;
        const validLocation = (location === 'off' || !location) ? 'optimal' : location;
        this._mxhautoService.setProfileVpn(row.profile, { 
            enabled: enabled, 
            location: validLocation,
            profiles_root: this.getProfilesRoot(),
            username: this.user ? this.user.name : ''
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (res: any) => {
                    if (res && res.ok !== false) {
                        row.vpn = { enabled, location: validLocation };
                        this.toastr.success(enabled ? `Đã cài đặt VPN ${validLocation.toUpperCase()} cho ${row.profile}` : `Đã tắt VPN cho ${row.profile}`);
                    } else {
                        this.toastr.error(res?.message || 'Không thể đổi VPN');
                    }
                    this.cd.markForCheck();
                },
                error: (err: any) => this.toastr.error(`Có lỗi xảy ra khi đổi VPN: ${err?.error?.detail?.[0]?.msg || err?.message || ''}`)
            });
    }

    setBulkVpn(enabled: boolean = true, location: string = 'optimal') {
        const profiles = _.map(this.selected, 'profile');
        if (profiles.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 profile');
            return;
        }

        const validLocation = (location === 'off' || !location) ? 'optimal' : location;

        this._mxhautoService.setVpnRange({
            start: 0,
            end: 99,
            zero_pad: 3,
            prefix: 'Profile',
            enabled: enabled,
            location: validLocation,
            profiles: profiles,
            profiles_root: this.getProfilesRoot(),
            username: this.user ? this.user.name : ''
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                this.toastr.success(enabled ? `Đã áp dụng VPN [${validLocation.toUpperCase()}] cho ${profiles.length} profiles` : `Đã tắt VPN cho ${profiles.length} profiles`);
                this.getProfiles(true);
            },
            error: () => this.toastr.error('Có lỗi khi cài đặt VPN hàng loạt')
        });
    }

    run(headless: boolean = this.isHeadless) {
        const stoppedSelected = (this.selected || []).filter(item => !item.running);
        const profiles = _.map(stoppedSelected, 'profile');
        if (profiles.length === 0) {
            if (this.selected && this.selected.length > 0) {
                this.toastr.info('Tất cả profile được chọn đều đang chạy (Running)');
            } else {
                this.toastr.warning('Vui lòng chọn profile cần chạy');
            }
            return;
        }

        const payload: any = {
            "profiles": profiles,
            "base_debug_port": 0,
            "opera_path": this.getOperaPath(),
            "extra_args": ["--ignore-certificate-errors", "--disable-quic"],
            "devtools_ready_timeout_ms": 8000,
            "close_tabs_on_start": false,
            "leave_one_tab": false,
            "new_tab_url": null,
            "mode": "skip",
            "window_state": "maximized",
            "headless": headless,
            "prefix_title_with_profile": true,
            "title_prefix_apply_all_tabs": true,
            "post_open_wait_ms": 800,
            "activate_opened_tab": false,
            "username": this.user ? this.user.name : ''
        };

        const root = this.getProfilesRoot();
        if (root) payload.profiles_root = root;

        this._mxhautoService.run(payload)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.results) {
                        // Update trạng thái running trên UI
                        result.results.forEach((resItem: any) => {
                            const p = this.profiles.find(x => x.profile === resItem.profile);
                            if (p) p.running = resItem.launched_new || resItem.ok;
                        });
                        this.toastr.success(`Đã khởi động ${result.results.length} profiles ${headless ? '(Ẩn Headless)' : ''}`);
                    }
                },
                complete: () => this.cd.markForCheck()
            });
    }

    killProfiles() {
        const profiles = _.map(this.selected, 'profile');
        if (profiles.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 profile để dừng');
            return;
        }

        try {
            this._mxhautoService.liveWatchStop({ username: this.user ? this.user.name : '' }).subscribe({ error: () => {} });
        } catch (e) {}

        this._mxhautoService.killProfiles({
            "profiles_root": this.getProfilesRoot(),
            "profiles": profiles,
            "mode": "force",
            "force": true,
            "cache_action": "prune",
            "username": this.user ? this.user.name : ''
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    profiles.forEach(pName => {
                        const p = this.profiles.find(x => x.profile === pName);
                        if (p) p.running = false;
                    });
                    this.toastr.info(`Đã đóng ${profiles.length} profiles`);
                    setTimeout(() => this.getProfiles(true), 500);
                },
                error: (err: any) => {
                    this.toastr.error('Có lỗi xảy ra khi đóng profiles');
                    this.getProfiles(true);
                },
                complete: () => this.cd.markForCheck()
            });
    }

    runSingleProfile(row: any) {
        if (!row || !row.profile) return;
        const payload: any = {
            "profiles": [row.profile],
            "base_debug_port": 0,
            "opera_path": this.getOperaPath(),
            "extra_args": ["--ignore-certificate-errors", "--disable-quic"],
            "devtools_ready_timeout_ms": 8000,
            "close_tabs_on_start": false,
            "leave_one_tab": false,
            "new_tab_url": null,
            "mode": "skip",
            "window_state": "maximized",
            "headless": false,
            "prefix_title_with_profile": true,
            "title_prefix_apply_all_tabs": true,
            "post_open_wait_ms": 800,
            "activate_opened_tab": false,
            "username": this.user ? this.user.name : ''
        };
        const root = this.getProfilesRoot();
        if (root) payload.profiles_root = root;

        this._mxhautoService.run(payload)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    row.running = true;
                    this.toastr.success(`Đã khởi động ${row.profile}`);
                    setTimeout(() => this.getProfiles(true), 1000);
                    this.cd.markForCheck();
                },
                error: (err: any) => {
                    this.toastr.error(`Không thể khởi động ${row.profile}`);
                    this.cd.markForCheck();
                },
                complete: () => this.cd.markForCheck()
            });
    }

    stopSingleProfile(row: any) {
        if (!row || !row.profile) return;
        try {
            this._mxhautoService.liveWatchStop({ username: this.user ? this.user.name : '' }).subscribe({ error: () => {} });
        } catch (e) {}

        this._mxhautoService.killProfiles({
            "profiles_root": this.getProfilesRoot(),
            "profiles": [row.profile],
            "mode": "force",
            "force": true,
            "cache_action": "prune",
            "username": this.user ? this.user.name : ''
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (result: any) => {
                row.running = false;
                this.toastr.warning(`Đã tắt ${row.profile}`);
                setTimeout(() => this.getProfiles(true), 500);
                this.cd.markForCheck();
            },
            error: () => {
                this.toastr.error(`Lỗi khi tắt ${row.profile}`);
                this.getProfiles(true);
            }
        });
    }

    deleteProfiles() {
        const profiles = _.map(this.selected, 'profile');
        if (profiles.length === 0) {
            this.toastr.warning('Vui lòng chọn profile cần xóa');
            return;
        }

        const confirmDialog = this._fuseConfirmationService.open({
            title: 'Xóa vĩnh viễn Profile',
            message: `Bạn có chắc chắn muốn xóa hẳn ${profiles.length} profile đã chọn? Hành động này sẽ đóng và xóa hoàn toàn dữ liệu.`,
            actions: {
                confirm: {
                    label: 'Xóa vĩnh viễn',
                    color: 'warn'
                },
                cancel: {
                    label: 'Hủy'
                }
            }
        });

        confirmDialog.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._mxhautoService.killProfiles({
                    "profiles_root": this.getProfilesRoot(),
                    "profiles": profiles,
                    "mode": "force",
                    "force": true,
                    "cache_action": "prune",
                    "username": this.user ? this.user.name : ''
                }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                    next: () => {
                        this._mxhautoService.deleteProfiles({
                            "profiles_root": this.getProfilesRoot(),
                            "profiles": profiles,
                            "username": this.user ? this.user.name : ''
                        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                            next: () => {
                                this.toastr.success(`Đã xóa hẳn ${profiles.length} profile thành công`);
                                this.selected = [];
                                this.refresh();
                            },
                            error: () => {
                                this.toastr.error('Có lỗi xảy ra khi xóa profile');
                            }
                        });
                    }
                });
            }
        });
    }

    deleteSingleProfile(row: any) {
        if (!row || !row.profile) return;

        const confirmDialog = this._fuseConfirmationService.open({
            title: 'Xóa vĩnh viễn Profile',
            message: `Bạn có chắc chắn muốn xóa hẳn profile "${row.profile}"? Hành động này không thể hoàn tác.`,
            actions: {
                confirm: {
                    label: 'Xóa vĩnh viễn',
                    color: 'warn'
                },
                cancel: {
                    label: 'Hủy'
                }
            }
        });

        confirmDialog.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._mxhautoService.killProfiles({
                    "profiles_root": this.getProfilesRoot(),
                    "profiles": [row.profile],
                    "mode": "force",
                    "force": true,
                    "cache_action": "prune",
                    "username": this.user ? this.user.name : ''
                }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                    next: () => {
                        this._mxhautoService.deleteProfiles({
                            "profiles_root": this.getProfilesRoot(),
                            "profiles": [row.profile],
                            "username": this.user ? this.user.name : ''
                        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                            next: () => {
                                this.toastr.success(`Đã xóa hẳn profile ${row.profile}`);
                                this.refresh();
                            },
                            error: () => {
                                this.toastr.error('Có lỗi xảy ra khi xóa profile');
                            }
                        });
                    }
                });
            }
        });
    }

    clearSingleProfileSession(row: any): void {
        const confirmDialog = this._fuseConfirmationService.open({
            title: 'Xóa Cookie & Session',
            message: `Bạn có chắc chắn muốn làm sạch Cookie & Session cho profile "${row.profile}"? Toàn bộ tài khoản đăng nhập trên profile này sẽ được đăng xuất.`,
            actions: {
                confirm: {
                    label: 'Xóa Cookie',
                    color: 'warn'
                },
                cancel: {
                    label: 'Hủy'
                }
            }
        });

        confirmDialog.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._mxhautoService.clearProfileSession(row.profile, this.getProfilesRoot())
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: (res: any) => {
                            if (res && res.ok) {
                                this.toastr.success(`Đã làm sạch Cookie & Session cho ${row.profile}`);
                            } else {
                                this.toastr.warning(res?.detail || 'Không thể làm sạch session profile');
                            }
                        },
                        error: (err: any) => {
                            this.toastr.error(err?.message || 'Có lỗi xảy ra khi xóa cookie');
                        }
                    });
            }
        });
    }

    clearSelectedProfilesSession(): void {
        if (!this.selected || this.selected.length === 0) return;

        const profileNames = this.selected.map((r: any) => r.profile);
        const confirmDialog = this._fuseConfirmationService.open({
            title: 'Xóa Cookie & Session hàng loạt',
            message: `Bạn có chắc chắn muốn làm sạch Cookie & Session cho ${profileNames.length} profile đã chọn (${profileNames.slice(0, 5).join(', ')}${profileNames.length > 5 ? '...' : ''})?`,
            actions: {
                confirm: {
                    label: 'Xóa hàng loạt',
                    color: 'warn'
                },
                cancel: {
                    label: 'Hủy'
                }
            }
        });

        confirmDialog.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                let completed = 0;
                let hasError = false;
                profileNames.forEach((prof: string) => {
                    this._mxhautoService.clearProfileSession(prof, this.getProfilesRoot())
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({
                            next: () => {
                                completed++;
                                if (completed === profileNames.length && !hasError) {
                                    this.toastr.success(`Đã xóa sạch Cookie & Session cho ${profileNames.length} profile!`);
                                }
                            },
                            error: () => {
                                hasError = true;
                            }
                        });
                });
            }
        });
    }

    refresh() {
        this.checkOperaCodec();
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
        this.checkOperaCodec();
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.profilesRoot = this.getProfilesRoot();
                this.operaPath = this.getOperaPath();
            });

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        // Tự động gọi API GET /v1/opera/profiles/config để lấy cấu hình hệ thống chuẩn
        this._mxhautoService.getConfig()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (cfg: any) => {
                    if (cfg && cfg.profiles_root && !localStorage.getItem('opera_profiles_root')) {
                        this.profilesRoot = cfg.profiles_root;
                    }
                    if (cfg && cfg.opera_exe && !localStorage.getItem('opera_executable_path')) {
                        this.operaPath = cfg.opera_exe;
                    }
                    this.cd.markForCheck();
                }
            });

        this.getProfiles();

        // Tự động đồng bộ trạng thái Running / Stopped trực tiếp với trình duyệt Opera mỗi 3 giây
        interval(3000)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.getProfiles(true);
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}