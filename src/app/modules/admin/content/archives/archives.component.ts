import {
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
    ColumnMode,
    DatatableComponent,
    SelectionType,
} from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/modules/_services/crawl';
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { ForumService } from 'app/modules/_services/forum';
import { FormControl } from '@angular/forms';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';

@Component({
    selector: 'archives',
    styleUrls: ['./archives.component.scss'],
    templateUrl: './archives.component.html',
    providers: [CrawlService, ForumService],
    encapsulation: ViewEncapsulation.None,
})
export class AIArchiveComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    rows = [];
    totalElements: number;
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
    uuids: any[] = [];
    page: Page = {
        pageNumber: 0,
        size: 10,
        totalElements: 0,
        totalPages: 0,
    };
    lastId: string;

    authors = new FormControl([]);
    selectedToppings = [];
    following_users = [];

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    selectedCollections: any;
    collections: any[] = [];

    permissionText2Voice: boolean = false;

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

    copy(uuid: string) {
        this.clipboard.copy(
            `${this.config.settings.domain}/#/archive/${this.user.name}/${uuid}`,
        );
        this.toastr.success(`Copy link mã ${uuid} xong.`);
    }

    together(uuid: string, authors: any) {
        const d = new Date();
        let year = d.getFullYear();

        this._crawlService
            .archiveUpdate({
                uuid: uuid,
                authors: authors,
                year: year,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Mã ${uuid} đã mời xong.`);
                    }
                },
                error: () => {},
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    searchNode() {
        this.table.offset = 0;
        this.selected = [];
        this.lastId = null;
        this.cachePageSize = 0;
        this.cache = {};

        if (this.uuids.length > 0) {
            if (this.keyword) {
                this.rows = this.rows.filter((item) =>
                    item.title.toLowerCase().includes(this.keyword),
                );

                this.totalElements = this.rows.length;

                this.table.recalculatePages();
                // lam moi lai giao dien
                this.cd.markForCheck();
            } else {
                this.onChangeCollection();
            }
        } else {
            this.rows = [];

            const query = {
                username: this.user.name,
                keyword: this.keyword,
                uuids: this.uuids,
                page: this.page,
            };

            if (this.keyword) {
                this._crawlService
                    .searchTotalArchive(query)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: async (result) => {
                            if (result && result.success) {
                                // Create array to store data if missing
                                // The array should have the correct number of with "holes" for missing data
                                if (!this.rows) {
                                    this.rows = new Array<any>(
                                        this.totalElements || 0,
                                    );
                                }

                                if (result.data.length > 0) {
                                    // Calc starting row offset
                                    // This is the position to insert the new data
                                    const start =
                                        this.page.pageNumber * this.page.size;

                                    // Copy existing data
                                    const rows = [...this.rows];

                                    // Insert new rows into correct position
                                    rows.splice(
                                        start,
                                        this.page.size,
                                        ...result.data,
                                    );

                                    // Set rows to our new rows for display
                                    this.rows = rows;
                                    this.lastId =
                                        this.rows.length > 0
                                            ? this.rows[this.rows.length - 1][
                                                  '_id'
                                              ]
                                            : null;
                                }

                                this.totalElements = result.data.total;

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
                        complete: () => {
                            this.table.recalculatePages();
                            // lam moi lai giao dien
                            this.cd.markForCheck();
                        },
                    });
            } else {
                let temp = localStorage.getItem('statistics');
                temp = JSON.parse(temp);
                this.totalElements = temp['writing'];

                if (this.totalElements > 0) {
                    this.setPage({
                        offset: 0,
                        pageSize: undefined,
                        limit: undefined,
                        count: this.totalElements,
                    });
                }
            }
        }
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo: PageInfo) {
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

        this._crawlService
            .archive({
                username: this.user.name,
                keyword: this.keyword,
                uuids: this.uuids,
                page: this.page,
                lastId: this.lastId,
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
                        // Create array to store data if missing
                        // The array should have the correct number of with "holes" for missing data
                        if (!this.rows) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        if (result.data.length > 0) {
                            // Calc starting row offset
                            // This is the position to insert the new data
                            const start = this.page.pageNumber * this.page.size;

                            // Copy existing data
                            const rows = [...this.rows];

                            // Insert new rows into correct position
                            rows.splice(start, this.page.size, ...result.data);

                            // Set rows to our new rows for display
                            this.rows = rows;
                            this.lastId =
                                this.rows.length > 0
                                    ? this.rows[this.rows.length - 1]['_id']
                                    : null;
                        }
                    }
                },
                error: () => {},
                complete: () => {
                    this.table.recalculatePages();
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    following() {
        this._forumService
            .following({
                _uid: this.user.id,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (
                        result &&
                        result.counts &&
                        result.counts.following > 0
                    ) {
                        this.following_users = result.users;
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
     * Lấy toàn bộ collection
     */
    collection() {
        this._crawlService
            .collections({
                username: this.user.name,
                page: { size: 100 },
                includeUuid: false
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.collections = result.data;
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    onChangeCollection() {
        this.uuids = [
            ...new Set(
                this.selectedCollections.flatMap((item: any) => item.uuid),
            ),
        ];

        if (this.uuids.length === 0) {
            let temp = localStorage.getItem('statistics');
            temp = JSON.parse(temp);
            this.totalElements = temp['writing'];

            this.table.offset = 0;
            this.selected = [];
            this.rows = [];
            this.lastId = null;
            this.cachePageSize = 0;
            this.cache = {};

            if (this.totalElements > 0) {
                this.setPage({
                    offset: 0,
                    pageSize: undefined,
                    limit: undefined,
                    count: this.totalElements,
                });
            }
        } else {
            this.totalElements = this.uuids.length;

            this.table.offset = 0;
            this.selected = [];
            this.rows = [];
            this.lastId = null;
            this.cachePageSize = 0;
            this.cache = {};

            if (this.totalElements > 0) {
                this.setPage({
                    offset: 0,
                    pageSize: undefined,
                    limit: undefined,
                    count: this.totalElements,
                });
            }
        }
    }

    onCloseCollection(e: any) {
        console.log('onClose', e);
    }

    onClearCollection() {
        console.log('onClear');
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _crawlService: CrawlService,
        private _forumService: ForumService,
        private _userService: UserService,
        private clipboard: Clipboard,
        private toastr: ToastrService,
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

                this.permissionText2Voice =
                    this._userService.permissionText2Voice(this.user);

                if (user.reputation < 0) {
                    this.error(
                        'Tài khoản của bạn không đủ điều kiện để truy cập!',
                    );
                    return;
                }

                if (localStorage.following_users) {
                    this.following_users = JSON.parse(
                        localStorage.following_users,
                    );
                } else {
                    this.following();
                }

                this.collection();
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

    ngOnInit(): void {
        let temp = localStorage.getItem('statistics');
        if (temp && temp != 'undefined') {
            temp = JSON.parse(temp);
            this.totalElements = temp['writing'];
        }
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
