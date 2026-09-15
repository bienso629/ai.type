import {
    ChangeDetectorRef,
    Component,
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
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { ForumService } from 'app/_services/forum';
import { ReportDialog } from './dialogs/report';
import { BigDataLogsDialog } from './dialogs/logs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { MatDialog } from '@angular/material/dialog';
import { BigDataService } from 'app/_services/bigdata';
import { shuffle } from 'lodash';

@Component({
    selector: 'bigdata',
    styleUrls: ['./bigdata.component.scss'],
    templateUrl: './bigdata.component.html',
    providers: [CrawlService, ForumService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class BigDataComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    rows = [];
    totalElements: number = 0;
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
    page: Page = {
        pageNumber: 0,
        size: 100,
        totalElements: 0,
        totalPages: 0,
    };
    isLoading: boolean = false;

    levels: any[] = [];

    group: any = 'all';
    groups: any[] = [
        'all',
        '404',
        'done',
        'error',
        'no_files',
        'verify_timeout',
    ];

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return row.title !== 'Ethel Price';
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

    status(e: any) {
        this.group = e.value;

        this.table.offset = 0;
        this.selected = [];
        this.rows = [];
        this.cachePageSize = 0;
        this.cache = {};

        this._bigdataService
            .records({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                q: this.keyword || null,
                page: this.page,
                page_size: this.page.size,
                fields: 'url,title,status,http_status',
                sort: '-updated_at',
                status: this.group,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.total > 0) {
                        this.totalElements = result.total;
                        if (this.totalElements > 0) {
                            this.setPage({
                                offset: 0,
                                pageSize: undefined,
                                limit: undefined,
                                count: this.totalElements,
                            });
                        }
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    searchNode(event: any) {
        this.table.offset = 0;
        this.keyword = event.target.value.toLowerCase();
        this.selected = [];
        this.rows = [];
        this.cachePageSize = 0;
        this.cache = {};

        this._bigdataService
            .records({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                q: this.keyword || null,
                page: this.page,
                page_size: this.page.size,
                fields: 'url,title,status,http_status',
                sort: '-updated_at',
                status: this.group,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.total > 0) {
                        this.totalElements = result.total;
                        if (this.totalElements > 0) {
                            this.setPage({
                                offset: 0,
                                pageSize: undefined,
                                limit: undefined,
                                count: this.totalElements,
                            });
                        }
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo: PageInfo) {
        if (this.isLoading) return;
        if (!pageInfo.pageSize) pageInfo.pageSize = this.page.size;

        // Current page number is determined by last call to setPage
        // This is the page the UI is currently displaying
        // The current page is based on the UI pagesize and scroll position
        // Pagesize can change depending on browser size
        this.pageNumber = pageInfo.offset;

        // Calculate row offset in the UI using pageInfo
        // This is the scroll position in rows
        const rowOffset = pageInfo.offset * pageInfo.pageSize;

        this.page = {
            pageNumber: Math.floor(rowOffset / pageInfo.pageSize),
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0,
        };

        // We keep a index of server loaded pages so we don't load same data twice
        // This is based on the server page not the UI
        if (this.cachePageSize !== this.page.size) {
            this.cachePageSize = this.page.size;
            this.cache = {};
        }

        if (this.cache[this.page.pageNumber]) {
            return;
        }

        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cd.markForCheck();

        this._bigdataService
            .records({
                username: this.user.name,
                keyword: this.keyword,
                appID: 'fastmailv2.tadu.fastmailv2',
                page: this.page,
                page_size: this.page.size,
                q: this.keyword,
                fields: 'url,title,status,http_status',
                sort: '-updated_at',
                status: this.group,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.items && result.items.length > 0) {
                        this.totalElements = result.total;

                        // Create array to store data if missing
                        // The array should have the correct number of with "holes" for missing data
                        if (!this.rows || this.rows.length === 0) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        // Calc starting row offset
                        // This is the position to insert the new data
                        const start = this.page.pageNumber * this.page.size;

                        // Copy existing data
                        const rows = [...this.rows];

                        // Insert new rows into correct position
                        rows.splice(
                            start,
                            result.items.length,
                            ...result.items,
                        );

                        // Set rows to our new rows for display
                        this.rows = rows;
                    } else if (
                        !result ||
                        result.success === false ||
                        (result.items && result.items.length === 0)
                    ) {
                        delete this.cache[this.page.pageNumber];
                    }
                },
                error: (err) => {
                    delete this.cache[this.page.pageNumber];
                    this.isLoading = false;
                    this.cd.markForCheck();
                },
                complete: () => {
                    this.isLoading = false;
                    if (this.table) {
                        this.table.recalculatePages();
                    }
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    logs() {
        const dialogRef = this.dialog.open(BigDataLogsDialog, {
            width: '50vw',
            position: {
                bottom: '100px', // khoảng cách từ top của màn hình
                right: '100px', // khoảng cách từ left của màn hình
            },
            data: {
                user: this.user,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    report() {
        const dialogRef = this.dialog.open(ReportDialog, {
            width: '80vw',
            height: '80vh', // hoặc maxHeight: '80vh'
            panelClass: 'grid-dialog', // để áp CSS riêng cho dialog này
            data: {
                user: this.user,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    scanSitemap() {
        this._bigdataService
            .sitemaps({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                rootURL: 'https://thuvienphapluat.vn/sitemap.xml',
                headless: false,
                dedupe: true,
                write_files: true,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.toastr.success('Tạo sitemap xong.');
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    storeBigData() {
        this._bigdataService
            .storeJob1({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                links_file: 'never_links.txt',
                queue_key: 'tvpl-main',
                alloc_size: 200,
                lease_ttl_sec: 300,
                auto_next_block: true,
                headless: false,
                upsert: true,
                force: true,
                shuffle: false,
                delay_ms: 200,
                sleep_min: 0.3,
                sleep_max: 1.2,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        localStorage.setItem('dataJobID', result.job_id);
                        this.toastr.success('Mở logs để xem tiến trình.');
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    scanErrorLinks() {
        this._bigdataService
            .scanErrorLinksJob3({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                queue_key: 'tvpl-main',
                alloc_size: 200,
                use_allocator: true,
                auto_next_block: true,
                headless: false,
                sleep_min: 2.0,
                sleep_max: 5.0,
                delay_ms: 0,
                shuffle: false,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        localStorage.setItem('dataJobID', result.job_id);
                        this.toastr.success('Xử lý link bị lỗi.');
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    neverLinks() {
        this._bigdataService
            .neverLinks({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                source: 'path',
                file_path: 'all_links.txt',
                output_path: 'never_links.txt',
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.toastr.success(
                            'Làm mới tất cả các link chưa quét',
                        );
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    donwload() {
        this._bigdataService
            .downloadJob2({
                username: this.user.name,
                appID: 'fastmailv2.tadu.fastmailv2',
                include_statuses: ['done', 'fallback'],
                headless: false,
                max_docs: 200,
                sleep_between_files: 0.0,
                reattempt_failed: false,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        localStorage.setItem(
                            'downloadFilesJobID',
                            result.job_id,
                        );
                        this.toastr.success('Tiền trình download chạy ngầm.');
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _bigdataService: BigDataService,
        private _userService: UserService,
        private toastr: ToastrService,
        public dialog: MatDialog,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private cd: ChangeDetectorRef,
    ) {
        this.titleService.setTitle(`lưu trữ | ai.type - công cụ tạo content`);

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {}

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
