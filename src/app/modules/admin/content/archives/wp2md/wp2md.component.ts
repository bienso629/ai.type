import { ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import * as xml2js from 'xml2js';
import { Title } from '@angular/platform-browser';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Clipboard } from '@angular/cdk/clipboard';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { CrawlService } from 'app/modules/_services/crawl';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';

@Component({
    selector: 'wp2md',
    styleUrls: ['./wp2md.component.scss'],
    templateUrl: './wp2md.component.html',
    providers: [WP2MDService, CrawlService],
    encapsulation: ViewEncapsulation.None
})
export class WP2MDComponent implements OnInit, OnDestroy {
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
    currentBookmark: string = null;
    apiFetchedCount: number = 0;
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

    blockScroll(event: Event) {
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
            this._wp2mdService.searchWp2mdArchive({
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
            this._wp2mdService.totalWp2mdArchive({ username: this.user.name })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res) => {
                        if (res && res.success) {
                            this.totalElements = res.data.total;
                        } else {
                            // Fallback to local storage if API fails
                            let temp = localStorage.getItem('statistics');
                            if (temp) {
                                try {
                                    this.totalElements = JSON.parse(temp)['wp2md'] || 0;
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
            ...this.page,
            size: 25 // Fix size for CouchDB bookmark
        };

        this._wp2mdService.all({
            username: this.user.name,
            keyword: this.keyword,
            page: payloadPage,
            bookmark: this.currentBookmark
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    const resData = result?.data;
                    if (resData && resData.docs && resData.docs.length > 0) {
                        // Initialize rows array if it does not exist
                        if (!this.rows) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        const start = this.apiFetchedCount;
                        const apiPageSize = 25;

                        let newTotal = this.totalElements || 0;
                        if (resData.docs.length < apiPageSize) {
                            newTotal = start + resData.docs.length;
                        } else if (start + resData.docs.length > newTotal) {
                            newTotal = start + resData.docs.length;
                        }

                        if (this.totalElements !== newTotal) {
                            this.totalElements = newTotal;
                        }

                        if (!this.rows || this.rows.length !== this.totalElements) {
                            const oldRows = this.rows || [];
                            this.rows = new Array<any>(this.totalElements);
                            for (let i = 0; i < Math.min(oldRows.length, this.totalElements); i++) {
                                this.rows[i] = oldRows[i];
                            }
                        }

                        // Copy existing data
                        const rows = [...this.rows];

                        // Insert new rows into correct position
                        rows.splice(start, resData.docs.length, ...resData.docs);

                        // Set rows to our new rows for display
                        this.rows = rows;
                        this.apiFetchedCount += resData.docs.length;
                        this.currentBookmark = resData.bookmark;
                        this.cd.detectChanges();
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        this.setPage(pageInfo);
                    } else if (!resData || resData.success === false || (resData.docs && resData.docs.length === 0)) {
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
                }
            });
    }


    details(node: any) {
        this._wp2mdService.details({
            id: node._id,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        const el = document.createElement('div');
                        el.innerHTML = result.data.object['content:encoded'];

                        const p = Array.from(el.children).map((node: any) => {
                            return node.outerHTML;
                        });

                        this.facePost2Node({
                            p: p,
                            title: result.data.object.title,
                            url: result.data.object.link
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

    facePost2Node(doc: any) {
        this._crawlService.facePost2Node({
            username: this.user.name,
            content: {
                p: doc.p
            },
            title: doc.title,
            url: doc.url
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success) {
                        this.toastr.success('Chuyển sang lưu trữ.');
                    } else {
                        this.toastr.error('Lỗi trong quá trình chuyển.');
                    }
                },
                error: (e: any) => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    convert(node: any) {
        this._wp2mdService.convert({
            id: node._id,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        const dialogRef = this.dialog.open(NodeDetailsDialog, {
                            width: 'calc(100vw - 40px)',
                            data: result.data.result
                        });

                        dialogRef.afterClosed().subscribe(result => {
                            console.log(`Dialog result: ${result}`);
                        });

                        // node.uuids.push(result.data.uuid);
                        // this.toastr.success(`Chuyển sang lưu trữ thành công!`);
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

    readFile = (e: any) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsText(file);

        reader.onload = async (evt) => {
            let xmlContent = (evt as any).target.result;
            const parser = new xml2js.Parser({ explicitArray: false });
            try {
                const parsedXml: any = await parser.parseStringPromise(xmlContent);
                if (parsedXml && parsedXml.rss && parsedXml.rss.channel) {
                    let items = parsedXml.rss.channel.item;
                    if (!items) items = [];
                    if (!Array.isArray(items)) {
                        items = [items];
                    }

                    // Build attachment map
                    const attachments: Record<string, string> = {};
                    items.forEach((item: any) => {
                        if (item['wp:post_type'] === 'attachment') {
                            const postId = item['wp:post_id'];
                            const attachmentUrl = item['wp:attachment_url'];
                            if (postId && attachmentUrl) {
                                attachments[postId] = attachmentUrl;
                            }
                        }
                    });

                    // IPC renderer for downloading
                    let ipcRenderer: any;
                    try {
                        ipcRenderer = (window as any).require('electron').ipcRenderer;
                    } catch (e) {
                        console.warn("Electron IPC not available");
                    }

                    // Process posts
                    const posts = items.filter((item: any) => item['wp:post_type'] === 'post');
                    
                    for (const row of posts) {
                        // Extract thumbnail
                        let thumbnailUrl = '';
                        let thumbnailId = '';
                        if (row['wp:postmeta']) {
                            let metaArray = Array.isArray(row['wp:postmeta']) ? row['wp:postmeta'] : [row['wp:postmeta']];
                            const thumbMeta = metaArray.find((m: any) => m['wp:meta_key'] === '_thumbnail_id');
                            if (thumbMeta) {
                                thumbnailId = thumbMeta['wp:meta_value'];
                                thumbnailUrl = attachments[thumbnailId];
                            }
                        }

                        // Download thumbnail if available and ipcRenderer is present
                        if (thumbnailUrl && ipcRenderer) {
                            const extMatch = thumbnailUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                            const ext = extMatch ? `.${extMatch[1]}` : '.jpg';
                            const fileName = `${row['wp:post_id']}${ext}`;
                            
                            try {
                                await ipcRenderer.invoke('download-image', {
                                    url: thumbnailUrl,
                                    fileName: fileName,
                                    customDir: ''
                                });
                            } catch (error) {
                                console.error('Error downloading thumbnail', error);
                            }
                        }

                        // Save to database
                        const hostname = row.link ? new URL(row.link).hostname : 'localhost';
                        this._wp2mdService.store({
                            title: row.title,
                            hostname: hostname,
                            object: row,
                            username: this.user.name
                        }).subscribe({
                            next: (result: any) => {
                                if (result && result.success) {
                                    this.toastr.success(`Đã thêm bài: ${row.title}`);
                                } else {
                                    this.toastr.warning(`Đã tồn tại: ${row.title}`);
                                }
                            },
                            error: (e) => {
                                console.error(e);
                            }
                        });
                    }
                    
                    // Reset input
                    e.target.value = '';
                    // Reload table
                    this.searchNode({ target: { value: this.keyword } });
                } else {
                    this.toastr.warning('Định dạng XML không đúng.');
                }
            } catch (err) {
                this.toastr.error('Lỗi phân tích XML');
                console.error(err);
            }
        };
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _crawlService: CrawlService,
        private _wp2mdService: WP2MDService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private toastr: ToastrService,
        private clipboard: Clipboard,
        public dialog: MatDialog,
        private cd: ChangeDetectorRef
    ) {
        this.titleService.setTitle(`node từ wordpress | ai.type - công cụ tạo content`);

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



                // totalWp2mdArchive moved to ngOnInit to prioritize localStorage
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        let temp = localStorage.getItem('statistics');
        if (temp) {
            try {
                let parsed = JSON.parse(temp);
                this.totalElements = parsed['wp2md'] || 0;
            } catch (e) {
                this.totalElements = 0;
            }
        } else {
            this.totalElements = 0;
        }

        if (!this.totalElements) {
            this._wp2mdService.totalWp2mdArchive({ username: this.user.name })
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
        <mat-icon class="self-center mr-2 icon-size-4" [svgIcon]="'feather:check-circle'"></mat-icon>
        <mat-label class="self-center">Kết quả chuyển đổi Markdown</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <textarea class="w-full min-h-full" value="{{data}}" matInput cdkTextareaAutosize></textarea>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button color="primary" class="float-right" (click)="copy()">Sao chép</button>
        <button mat-flat-button class="float-right ml-2" [mat-dialog-close]>Đóng cửa sổ</button>
    </div>`,
})
export class NodeDetailsDialog implements OnInit, OnDestroy {
    constructor(
        public dialogRef: MatDialogRef<any>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private clipboard: Clipboard,
        private toastr: ToastrService,
    ) { }

    copy() {
        this.clipboard.copy(this.data);
        this.toastr.success(`Sao chép thành công!`);
    }

    /**
     * On init
     */
    ngOnInit(): void { }

    /**
     * On destroy
     */
    ngOnDestroy(): void { }
}
