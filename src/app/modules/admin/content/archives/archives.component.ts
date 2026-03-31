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
    currentBookmark: string = null;

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
    permissionScriptCommentLike: boolean = false;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        // Kiểm tra nếu row tồn tại và có title mới thực hiện so sánh
        return row && row.title ? row.title !== 'Ethel Price' : false;
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
                error: () => { },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Hàm Tìm kiếm Node - Reset toàn bộ dấu mốc bookmark
     */
    searchNode() {
        this.table.offset = 0;
        this.selected = [];
        this.currentBookmark = null;
        this.cachePageSize = 0;
        this.cache = {};

        if (this.uuids.length > 0) {
            // Nếu có keyword khi đang trong Collection thì filter local
            if (this.keyword) {
                this.rows = this.rows.filter((item) =>
                    item.title.toLowerCase().includes(this.keyword.toLowerCase()),
                );
                this.totalElements = this.rows.length;
                this.table.recalculatePages();
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
                this._crawlService.searchTotalArchive(query)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: (result: any) => {
                            // Lấy total từ lớp bọc hệ thống
                            const total = result.data?.total || result.data?.data?.total || 0;
                            this.totalElements = total;

                            if (this.totalElements > 0) {
                                this.setPage({ offset: 0, pageSize: this.page.size, limit: this.page.size, count: this.totalElements });
                            }
                        },
                        complete: () => {
                            this.table.recalculatePages();
                            this.cd.markForCheck();
                        }
                    });
            } else {
                // Mặc định từ statistics (Sài Gòn)
                if (this.totalElements > 0) {
                    this.setPage({ offset: 0, pageSize: this.page.size, limit: this.page.size, count: this.totalElements });
                }
            }
        }
    }

    /**
     * setPage: Xử lý dữ liệu bọc trong result.data.docs và result.data.bookmark
     */
    setPage(pageInfo: PageInfo) {
        if (!pageInfo.pageSize) pageInfo.pageSize = this.page.size;
        this.pageNumber = pageInfo.offset;
        const rowOffset = pageInfo.offset * pageInfo.pageSize;

        this.page = {
            pageNumber: Math.floor(rowOffset / pageInfo.pageSize),
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0,
        };

        if (this.cachePageSize !== this.page.size) {
            this.cachePageSize = this.page.size;
            this.cache = {};
        }
        if (this.cache[this.page.pageNumber]) return;
        this.cache[this.page.pageNumber] = true;

        this._crawlService.archive({
            username: this.user.name,
            keyword: this.keyword,
            uuids: this.uuids,
            page: this.page,
            bookmark: this.currentBookmark, // Sử dụng bookmark
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    // Bóc tách theo cấu trúc middleware trả về: result.data.docs
                    const resData = result.data;
                    if (resData && resData.docs) {
                        if (!this.rows || this.rows.length === 0) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        const start = this.page.pageNumber * this.page.size;
                        const rows = [...this.rows];

                        // GIỮ NGUYÊN LOGIC GỐC CỦA BẠN: Splice vào vị trí start
                        rows.splice(start, this.page.size, ...resData.docs);
                        this.rows = rows;

                        // Lưu bookmark từ server để dùng cho request tiếp theo
                        this.currentBookmark = resData.bookmark;
                    }
                },
                complete: () => {
                    this.table.recalculatePages();
                    this.cd.markForCheck();
                }
            });
    }

    /**
     * onChangeCollection: Trích xuất đúng UUID từ mảng selectedCollections
     */
    onChangeCollection() {
        // 1. Trích xuất tất cả UUID bài viết từ các tập đã chọn
        this.uuids = [
            ...new Set(
                this.selectedCollections.flatMap((item: any) => {
                    // item.uuid bây giờ là 1 mảng các string ID bài viết
                    return Array.isArray(item.uuid) ? item.uuid : (item.uuid ? [item.uuid] : []);
                }),
            ),
        ];

        // 2. Reset toàn bộ trạng thái UI và mốc phân trang
        if (this.table) this.table.offset = 0;
        this.selected = [];
        this.rows = [];
        this.currentBookmark = null; // BẮT BUỘC: Bookmark cũ không dùng được cho tập UUIDs mới
        this.cachePageSize = 0;
        this.cache = {};

        // 3. Tính toán lại tổng số phần tử (totalElements)
        if (this.uuids.length === 0) {
            // Nếu không chọn collection nào, lấy tổng số từ statistics (Tất cả bài viết)
            let temp = localStorage.getItem('statistics');
            if (temp) {
                const stats = JSON.parse(temp);
                this.totalElements = stats['writing'] || 0;
            }
        } else {
            // Nếu chọn collection, tổng số chính là số lượng UUIDs đã trích xuất
            this.totalElements = this.uuids.length;
        }

        // 4. Kích hoạt lấy dữ liệu trang đầu tiên
        if (this.totalElements > 0 || this.uuids.length === 0) {
            this.setPage({
                offset: 0,
                pageSize: this.page.size,
                limit: this.page.size,
                count: this.totalElements,
            });
        }
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
                error: () => { },
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
                includeUuid: true
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.collections = result.data;
                    }
                },
                error: () => { },
                complete: () => { },
            });
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

                this.permissionScriptCommentLike =
                    this._userService.permissionScriptCommentLike(this.user);

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
