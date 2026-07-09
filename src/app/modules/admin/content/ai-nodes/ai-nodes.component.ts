import { ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/modules/_services/crawl';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Clipboard } from '@angular/cdk/clipboard';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';

import * as FileSaver from 'file-saver';

@Component({
    selector: 'ai-nodes',
    styleUrls: ['./ai-nodes.component.scss'],
    templateUrl: './ai-nodes.component.html',
    providers: [CrawlService],
    encapsulation: ViewEncapsulation.None
})
export class AINodesComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    rows = [];
    totalElements: number;
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
    page: Page = {
        pageNumber: 0,
        size: 100,
        totalElements: 0,
        totalPages: 0
    };
    isLoading: boolean = false;
    currentBookmark: string;
    apiFetchedCount: number = 0;

    request = 'h1|body\nh2|body\nh3|body\nh4|body\nh5|body\np|body\nspan|body\nlabel|body\ntable|body\nimg,data-lazy-src+title+alt|body\niframe,data-lazy-src|body\na,href+title|body\nli|body\ntitle|html > head\nmeta,content:name|html > head\nmeta,content:property|html > head';

    downloadJsonHref: any;

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

    copy(link: string) {
        this.clipboard.copy(link);
        this.toastr.success(`Copy link xong.`);
    }

    searchNode(event: any) {
        this.table.offset = 0;
        this.keyword = event.target.value.toLowerCase();
        this.selected = [];
        this.rows = [];
        this.currentBookmark = null;
        this.apiFetchedCount = 0;
        this.cachePageSize = 0;
        this.cache = {};

        if (this.keyword) {
            this._crawlService.totalSearchNode({
                username: this.user.name,
                keyword: this.keyword,
                page: this.page
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
                                    count: this.totalElements
                                });
                            }
                        }
                    },
                    error: () => {
                    },
                    complete: () => { }
                });
        } else {
            this._crawlService.totalSearchNode({
                username: this.user.name,
                keyword: '',
                page: this.page
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res) => {
                        if (res && res.success) {
                            this.totalElements = res.data.total;
                        } else {
                            let temp = localStorage.getItem('statistics');
                            if (temp) {
                                try {
                                    this.totalElements = JSON.parse(temp)['node'] || 0;
                                } catch (e) {
                                    this.totalElements = 0;
                                }
                            } else {
                                this.totalElements = 0;
                            }
                        }

                        if (this.totalElements > 0) {
                            this.setPage({
                                offset: 0,
                                pageSize: undefined,
                                limit: undefined,
                                count: this.totalElements
                            });
                        }
                    }
                });
        }
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo: PageInfo) {
        if (this.isLoading) return;
        if (!pageInfo.pageSize)
            pageInfo.pageSize = this.page.size;

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
            totalPages: 0
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

        const payloadPage = {
            ...this.page
        };

        this._crawlService.nodes({
            username: this.user.name,
            keyword: this.keyword,
            page: payloadPage,
            bookmark: this.currentBookmark
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    const resData = result?.data;
                    const start = this.page.pageNumber * this.page.size;

                    if (resData && resData.docs && resData.docs.length > 0) {
                        // Initialize rows array if it does not exist
                        if (!this.rows) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }



                        let newTotal = this.totalElements || 0;
                        if (start + resData.docs.length > newTotal) {
                            newTotal = start + resData.docs.length;
                        }

                        if (this.totalElements !== newTotal) {
                            this.totalElements = newTotal;
                        }

                        if (this.rows.length !== this.totalElements) {
                            const oldRows = this.rows;
                            this.rows = new Array<any>(this.totalElements);
                            for (let i = 0; i < oldRows.length; i++) {
                                this.rows[i] = oldRows[i];
                            }
                        }

                        const rows = [...this.rows];

                        rows.splice(start, resData.docs.length, ...resData.docs);

                        this.rows = rows;
                        this.apiFetchedCount += resData.docs.length;
                        this.currentBookmark = resData.bookmark;
                        this.cd.detectChanges();
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        // Nếu mảng rỗng nhưng bookmark thay đổi, tiếp tục gọi đệ quy (do PouchDB in-memory filter skip)
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        this.setPage(pageInfo);
                        return;
                    } else if (resData && resData.docs && resData.docs.length === 0) {
                        if (this.totalElements !== start) {
                            this.totalElements = start;
                            if (this.rows && this.rows.length !== this.totalElements) {
                                this.rows = this.rows.slice(0, this.totalElements);
                                this.rows = [...this.rows];
                            }
                        }
                    } else if (!resData || resData.success === false) {
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
                }
            });
    }

    details(node: any) {
        this._crawlService.nodeDetails({
            id: node._id,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        const dialogRef = this.dialog.open(NodeDetailsDialog, {
                            width: 'calc(100vw - 40px)',
                            data: result.data
                        });

                        dialogRef.afterClosed().subscribe(result => {
                            console.log(`Dialog result: ${result}`);
                        });
                    }
                },
                error: () => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    convert(node: any) {
        this._crawlService.convert({
            id: node._id,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        node.uuids.push(result.data.uuid);
                        this.toastr.success(`Chuyển sang lưu trữ thành công!`);
                    }
                },
                error: () => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    /**
     * Tiếp tục nhân rộng sitemap
     * Luu tru thong tin doanh nghiep
     */
    crawlCompany(url: any) {
        if (!url) return;

        this._crawlService.crawlCompany({
            url: url,
            request: this.request,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: ((result: any) => {
                    if (result && result.title) {
                        this.storeNodeNoRequest(url, result);
                    } else {
                        this.toastr.error('Link không được phân tích', `đang quét lại`);
                    }
                }),
                error: (e: any) => { },
                complete: () => { }
            });
    }

    storeNodeNoRequest(url: string, node: any) {
        this._crawlService.storeNode({
            url: url,
            type: 'norequest',
            node: node,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: ((result: any) => {
                    if (result) {
                        this.toastr.success(`${node.title}`, `Ghi nhớ`);
                    } else {
                        this.toastr.error('Không thể lưu.');
                    }
                }),
                error: (e: any) => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    createJsonLink() {
        const blob = new Blob([JSON.stringify(this.selected)], { type: "application/json" });
        FileSaver.saveAs(blob, `${this.user.name}_nodes`);
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _crawlService: CrawlService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private toastr: ToastrService,
        private clipboard: Clipboard,
        public dialog: MatDialog,
        private sanitizer: DomSanitizer,
        private cd: ChangeDetectorRef
    ) {
        this.titleService.setTitle(`tất cả node của bạn | ai.type - công cụ tạo content`);

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;



                // totalSearchNode has been moved to ngOnInit to prioritize localStorage
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    ngOnInit(): void {
        let temp = localStorage.getItem('statistics');
        if (temp) {
            try {
                let parsed = JSON.parse(temp);
                this.totalElements = parsed['node'] || 0;
            } catch (e) {
                this.totalElements = 0;
            }
        } else {
            this.totalElements = 0;
        }

        // Nếu localStorage không có hoặc bằng 0, mới gọi API để đếm
        if (!this.totalElements) {
            this._crawlService.totalSearchNode({
                username: this.user.name,
                keyword: '',
                page: this.page
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res) => {
                        if (res && res.success && !this.keyword) {
                            this.totalElements = res.data.total;
                            this.cd.markForCheck();
                        }
                    }
                });
        }
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

@Component({
    selector: 'node-details-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-4" [svgIcon]="'feather:info'"></mat-icon>
        <mat-label class="self-center">Chi tiết Node</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <pre class="text-sm overflow-y-auto overflow-x-auto h-full w-full">{{data | json}}</pre>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button color="primary" class="float-right" [mat-dialog-close]>Đóng cửa sổ</button>
    </div>`,
})
export class NodeDetailsDialog implements OnInit, OnDestroy {
    constructor(
        public dialogRef: MatDialogRef<any>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) { }

    /**
     * On init
     */
    ngOnInit(): void { }

    /**
     * On destroy
     */
    ngOnDestroy(): void { }
}
