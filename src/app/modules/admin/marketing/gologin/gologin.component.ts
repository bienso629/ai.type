import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
    ColumnMode,
    DatatableComponent,
    SelectionType,
} from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/_services/crawl';
import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Clipboard } from '@angular/cdk/clipboard';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { ForumService } from 'app/_services/forum';
import { GoLoginService } from 'app/_services/gologin';
import { MatDialog } from '@angular/material/dialog';
import { DialogLinksProfile } from 'app/modules/admin/marketing/gologin/dialogs/dialog-links-profile';

import { filter } from 'rxjs/operators';

import _ from 'lodash';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { DomainService } from 'app/_services/domain';
import { MatMenu } from '@angular/material/menu';
import { HttpClient } from '@angular/common/http';

/**
 * An object used to get page information from the server
 */
export class Page {
    // The number of elements in the page
    size: number = 0;
    // The total number of elements
    totalElements: number = 0;
    // The total number of pages
    totalPages: number = 0;
    // The current page number
    pageNumber: number = 0;
}

function feed<T>(from: Observable<T>, to: Subject<T>): Subscription {
    return from.subscribe(
        (data) => to.next(data),
        (err) => to.error(err),
        () => to.complete(),
    );
}

@Component({
    selector: 'profiles',
    styleUrls: ['./gologin.component.scss'],
    templateUrl: './gologin.component.html',
    providers: [CrawlService, ForumService, GoLoginService, DomainService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class ProfilesComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('searchMenu') searchMenu!: MatMenu;

    user: User;
    config: AppConfig;

    browsersIds = [];
    token: string = '';
    link: string = '';

    page = new Page();

    rows = [];
    temp = [];
    data = [];

    domains = [];

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    cleanDomain(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }

    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    openDialog(): void {
        const dialogRef = this.dialog.open(DialogLinksProfile, {
            width: '960px',
            // height: '500px'
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.start) {
                this.selected = [];
                this.browsersIds = [];
                this.rows.map((item) => {
                    this.selected.push(item);
                    this.browsersIds.push(item);

                    this.startProfile(item);
                });
            }
        });
    }

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return row.title !== 'Ethel Price';
    }

    updateFilter(event: any) {
        const val = event.target.value.toLowerCase();

        // filter our data
        const temp = this.temp.filter(function (d) {
            return d.name.toLowerCase().indexOf(val) !== -1 || !val;
        });

        // update the rows
        this.rows = temp;

        // cache our list
        this.data = _(this.rows).slice(0).take(300).value();

        // Whenever the filter changes, always go back to the first page
        this.table.offset = 0;
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

    copy(token: string) {
        this.clipboard.copy(token);
        this.toastr.success(`Copy token xong.`);
    }

    updateLink(event: any) {
        if (event.target.value) {
            this.link = event.target.value;
            // localStorage.setItem('link', this.link);
            this.play();
            this.toastr.success(`Nào mình cùng đi like dạo.`);
        } else {
            this.toastr.warning(`Chạy profile không được.`);
        }
    }

    updateDuration(event: any) {}

    playYoutube() {
        this.play();
        this.toastr.success(`Nào mình cùng đi xem phim.`);
    }

    /**
     * Tải về máy tất cả profile
     */
    export() {
        this.browsersIds = [];
        this.selected.map((item) => {
            this.browsersIds.push(item.id);
        });

        this._goLoginService
            .exportProfile2CSV(
                {
                    browsersIds: this.browsersIds,
                },
                this.token,
            )
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    // console.log('result', result);
                },
                error: () => {},
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Thêm mới token để lấy profile về
     */
    addToken(event: any) {
        const token = event.target.value;

        this._goLoginService
            .addToken({
                token: token,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Mã token đã thêm mới.`);
                        this.allProfile(result.data.token, true);
                    } else {
                        this.toastr.warning(`Mã token này đã tồn tại.`);
                    }
                },
                error: () => {},
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Lấy danh sách profile từ token
     */
    allProfile(token: string, update: boolean) {
        this._goLoginService
            .listProfiles(token ? token : this.token)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (
                        result &&
                        result.profiles &&
                        result.profiles.length > 0
                    ) {
                        if (update) {
                            this.updateToken(token, result.profiles);
                        }
                        // console.log('result.profiles', result.profiles);

                        await result.profiles.map((profile: any) => {
                            profile.status = 'stoped';
                            profile.token = token;

                            return profile;
                        });

                        this.rows = this.rows.concat(result.profiles);

                        // cache our list
                        this.temp = [...this.rows];

                        // cache our list
                        this.data = _(this.rows).slice(0).take(300).value();
                    } else {
                        this.toastr.warning(`1 mã token không tồn tại.`);
                    }
                },
                error: (err) => {
                    console.log('err', err);
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo: any) {
        // console.log('pageInfo', pageInfo);
        this.selected = [];
        this.data = _(this.rows)
            .slice(pageInfo.offset * 300)
            .take(300)
            .value();
    }

    updateToken(token: string, profiles: any) {
        this._goLoginService
            .updateToken({
                username: this.user.name,
                token: token,
                profiles: profiles,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        // console.log('result.profiles', result.profiles);
                        this.toastr.success(`1 mã token cập nhật thành công!`);
                    } else {
                        this.toastr.warning(`1 mã token không được cập nhật.`);
                    }
                },
                error: (err) => {
                    console.log('err', err);
                },
                complete: () => {
                    // lam moi lai giao dien
                },
            });
    }

    /**
     * Lấy danh sách token
     */
    allTokens() {
        this._goLoginService
            .allTokens({
                username: (this.user && this.user.name) || 'admin',
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (
                        result &&
                        result.success &&
                        result.data &&
                        result.data.length > 0
                    ) {
                        // console.log('result.data', result.data);
                        result.data.map((item: any) => {
                            this.allProfile(
                                item.token,
                                item.profiles.length === 0 ? true : false,
                            );
                        });
                    } else {
                        this.toastr.warning(`1 mã token không tồn tại.`);
                    }
                },
                error: () => {},
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Chơi toàn bộ profile
     */
    play() {
        this.browsersIds = [];
        this.selected.map((item) => {
            this.browsersIds.push(item);
            this.startProfile(item, this.link);
        });
    }

    /**
     * Chạy từng profile
     */
    startProfile(profile: any, link?: string) {
        const body = {
            profile_id: profile.id,
            token: profile.token,
            link: link || 'https://ai.type.vn',
        };

        // Gọi tới service đang chạy ngầm trên port 3333
        this.http.post('http://127.0.0.1:3333/start', body).subscribe({
            next: (res: any) => {
                if (res.success) {
                    profile['status'] = 'running';
                    this.cd.markForCheck();
                }
            },
            error: (err) => console.error('Service chưa bật hoặc lỗi:', err),
        });
    }

    // Đóng 1 profile
    stopProfile(profile: any) {
        (window as any).electron
            .stopGoLoginProfile(profile.id)
            .then((res: any) => {
                if (res.success) {
                    profile['status'] = 'stoped';
                    this.toastr.info(`Đã đóng profile: ${profile.name}`);
                    this.cd.markForCheck();
                }
            });
    }

    // Đóng toàn bộ
    stopAll() {
        (window as any).electron.stopAllGoLoginProfiles().then((res: any) => {
            if (res.success) {
                this.rows.forEach((row) => (row['status'] = 'stoped'));
                this.toastr.warning('Đã đóng tất cả profile đang chạy');
                this.cd.markForCheck();
            }
        });
    }

    deleteProfiles() {
        if (!this.selected || this.selected.length === 0) {
            this.toastr.warning('Vui lòng chọn profile cần xóa');
            return;
        }

        const confirmDialog = this._fuseConfirmationService.open({
            title: 'Xóa vĩnh viễn Profile',
            message: `Bạn có chắc chắn muốn xóa hẳn ${this.selected.length} profile đã chọn? Hành động này không thể hoàn tác.`,
            actions: {
                confirm: {
                    label: 'Xóa vĩnh viễn',
                    color: 'warn',
                },
                cancel: {
                    label: 'Hủy',
                },
            },
        });

        confirmDialog.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                const toDelete = [...this.selected];
                let count = 0;

                toDelete.forEach((profile: any) => {
                    if (profile.token && profile.id) {
                        this._goLoginService
                            .deleteProfile(profile.token, profile.id)
                            .pipe(takeUntil(this._unsubscribeAll))
                            .subscribe({
                                next: () => {
                                    count++;
                                    this.rows = this.rows.filter(
                                        (r) => r.id !== profile.id,
                                    );
                                    this.data = this.data.filter(
                                        (d) => d.id !== profile.id,
                                    );
                                    if (count === toDelete.length) {
                                        this.toastr.success(
                                            `Đã xóa hẳn ${count} profile thành công`,
                                        );
                                        this.selected = [];
                                        this.cd.markForCheck();
                                    }
                                },
                            });
                    } else {
                        this.rows = this.rows.filter(
                            (r) => r.id !== profile.id,
                        );
                        this.data = this.data.filter(
                            (d) => d.id !== profile.id,
                        );
                    }
                });
                this.selected = [];
                this.cd.markForCheck();
            }
        });
    }

    deleteSingleProfile(row: any) {
        if (!row || !row.id) return;

        const confirmDialog = this._fuseConfirmationService.open({
            title: 'Xóa vĩnh viễn Profile',
            message: `Bạn có chắc chắn muốn xóa hẳn profile "${row.name || row.id}"? Hành động này không thể hoàn tác.`,
            actions: {
                confirm: {
                    label: 'Xóa vĩnh viễn',
                    color: 'warn',
                },
                cancel: {
                    label: 'Hủy',
                },
            },
        });

        confirmDialog.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (row.token && row.id) {
                    this._goLoginService
                        .deleteProfile(row.token, row.id)
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({
                            next: () => {
                                this.toastr.success(
                                    `Đã xóa hẳn profile ${row.name || row.id}`,
                                );
                                this.rows = this.rows.filter(
                                    (r) => r.id !== row.id,
                                );
                                this.data = this.data.filter(
                                    (d) => d.id !== row.id,
                                );
                                this.cd.markForCheck();
                            },
                            error: () => {
                                this.toastr.error(
                                    'Có lỗi xảy ra khi xóa profile',
                                );
                            },
                        });
                } else {
                    this.rows = this.rows.filter((r) => r.id !== row.id);
                    this.data = this.data.filter((d) => d.id !== row.id);
                    this.toastr.success(`Đã xóa profile`);
                    this.cd.markForCheck();
                }
            }
        });
    }

    /**
     * click vào kết quả tìm kiếm của Google
     */
    googleClick(profile: any, e: any) {
        if (e.target.value) {
            this._goLoginService
                .googleClick({
                    profileid: profile.id,
                    token: profile.token,
                    searchQuery: e.target.value,
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {},
                    error: () => {},
                    complete: () => {
                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    },
                });
        }
    }

    /**
     * click vào kết quả tìm kiếm của Google
     */
    restart() {
        this._goLoginService
            .restart({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {},
                error: () => {},
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Lấy tất cả domain của khách
     */
    alldomains() {
        this._domainService
            .fetch({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.domains = result.data;
                    } else {
                        this.domains = [{ domain: 'https://type.vn' }] as any;
                    }

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
                error: () => {},
                complete: () => {},
            });
    }

    private configureMenuClose(old: MatMenu['close']): MatMenu['close'] {
        const upd = new EventEmitter();

        feed(
            upd.pipe(
                filter((event) => {
                    // console.log(`menu.close(${JSON.stringify(event)})`);
                    if (event === 'click') {
                        // Ignore clicks inside the menu
                        return false;
                    }
                    return true;
                }),
            ),
            old,
        );

        return upd;
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _goLoginService: GoLoginService,
        private _userService: UserService,
        private _domainService: DomainService,
        private toastr: ToastrService,
        public dialog: MatDialog,
        private clipboard: Clipboard,
        private http: HttpClient,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private cd: ChangeDetectorRef,
    ) {
        this.titleService.setTitle(
            `kéo view cho website | ai.type - công cụ tạo content`,
        );

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                if (this.user) {
                    this.alldomains();
                }
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        this.page.pageNumber = 0;
        this.page.size = 300;

        // Nhận phản hồi, theo dõi hoạt động từ main process
        if ((window as any).electron) {
        this.unsubscribeRes = (window as any).electron.onToolsResponse(
            (data: any) => {
                console.log('Crawl Facebook thành công:', data);
            },
        ); }

        // Nhận phản hồi
        if ((window as any).electron) {
        this.unsubscribeLog = (window as any).electron.onToolsLog(
            (msg: any) => {
                console.log('Log từ main:', msg);
            },
        ); }
    }

    ngAfterViewInit() {
        // Inject our custom logic of menu close
        (this.searchMenu as any).closed = this.configureMenuClose(
            this.searchMenu.close,
        );
    }

    ngOnDestroy(): void {
        if (this.unsubscribeLog) this.unsubscribeLog();
        if (this.unsubscribeRes) this.unsubscribeRes();

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        this.allTokens();
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
}
