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
import { EditDialog } from './dialogs/edit-dialog';
import { SMSDialog } from './dialogs/sms-dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { CustomerService } from 'app/_services/customer';
import { MatDialog } from '@angular/material/dialog';

@Component({
    selector: 'x-cms',
    styleUrls: ['./x-cms.component.scss'],
    templateUrl: './x-cms.component.html',
    providers: [CrawlService, ForumService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class XCmsComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    rows = [];
    totalElements: number = 20;
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
    page: Page = {
        pageNumber: 0,
        size: 100,
        totalElements: 20,
        totalPages: 0,
    };
    isLoading: boolean = false;
    lastId: string;

    levels: any[] = [];

    group: any = 'Khách thường';
    groups: any[] = [];

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

    chooseGroup(e: any) {
        this.group = e.value;
    }

    getGroups() {
        this._customerService
            .groups({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (result && result.success) {
                        this.groups = result.data;
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    getLevels() {
        this._customerService
            .levels({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (result && result.success) {
                        this.levels = result.data;
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    edit(item: any) {
        const dialogRef = this.dialog.open(EditDialog, {
            width: '540px',
            data: {
                item: item,
                user: this.user,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.data) {
                item = result.data['item'];
                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    sms() {
        const dialogRef = this.dialog.open(SMSDialog, {
            width: '540px',
            data: {
                selected: this.selected,
                user: this.user,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.data) {
                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    searchNode(event: any) {
        this.table.offset = 0;
        this.keyword = event.target.value.toLowerCase();
        this.selected = [];
        this.rows = [];
        this.lastId = null;
        this.cachePageSize = 0;
        this.cache = {};

        if (this.keyword) {
            this._customerService
                .deviceTokens({
                    username: this.user.name,
                    keyword: this.keyword,
                    appID: 'fastmailv2.tadu.fastmailv2',
                    page: this.page,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success) {
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
                    complete: () => {},
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

        this._customerService
            .deviceTokens({
                username: this.user.name,
                keyword: this.keyword,
                appID: 'fastmailv2.tadu.fastmailv2',
                page: this.page,
                lastId: this.lastId,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.data && result.data.length > 0) {
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
                        rows.splice(start, this.page.size, ...result.data);

                        // Set rows to our new rows for display
                        this.rows = rows;
                        this.lastId =
                            this.rows.length > 0 &&
                            this.rows[this.rows.length - 1] &&
                            this.rows[this.rows.length - 1]['_id']
                                ? this.rows[this.rows.length - 1]['_id']
                                : null;
                    } else if (!result || result.success === false) {
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
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _customerService: CustomerService,
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

                this.getGroups();
                this.getLevels();
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
