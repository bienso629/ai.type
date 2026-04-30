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
    apiFetchedCount: number = 0;
    pageNumber: number;
    isLoading: boolean = false;
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
        this.isLoading = false;
        if (this.table) this.table.offset = 0;

        this.selected = [];
        this.currentBookmark = null;
        this.apiFetchedCount = 0;
        this.cachePageSize = 0;
        this.cache = {};

        this.cd.markForCheck();

        if (this.uuids.length > 0) {
            // Nếu có keyword khi đang trong Collection thì filter local
            if (this.keyword) {
                this.rows = [...this.rows.filter((item) =>
                    item.title.toLowerCase().includes(this.keyword.toLowerCase()),
                )];

                this.totalElements = this.rows.length;
                this.table.recalculatePages();
                this.cd.markForCheck();
            } else {
                this.onChangeCollection();
            }
        } else {
            this.rows = [];
            this.rows = [...this.rows]; // force update empty state

            const query = {
                username: this.user.name,
                keyword: this.keyword,
                uuids: this.uuids,
                page: this.page,
            };

            this._crawlService.searchTotalArchive(query)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (result: any) => {
                        // Lấy total từ lớp bọc hệ thống
                        let total = result?.data?.total;
                        if (total === undefined) total = result?.data?.data?.total;

                        if (total !== undefined) {
                            this.totalElements = total;
                        } else {
                            // Mặc định từ statistics (khi xóa keyword)
                            let temp = localStorage.getItem('statistics');
                            if (temp && temp !== 'undefined') {
                                try {
                                    const stats = JSON.parse(temp);
                                    this.totalElements = stats['archives'] || 0;
                                } catch (e) {
                                    this.totalElements = 0;
                                }
                            } else {
                                this.totalElements = 0;
                            }
                        }

                        if (this.totalElements > 0) {
                            this.setPage({ offset: 0, pageSize: this.page.size, limit: this.page.size, count: this.totalElements });
                        }
                    },
                    complete: () => {
                        if (this.table) this.table.recalculatePages();
                        this.cd.markForCheck();
                    }
                });
        }
    }

    /**
     * setPage: Xử lý dữ liệu bọc trong result.data.docs và result.data.bookmark
     */
    setPage(pageInfo: PageInfo) {
        if (this.isLoading) return;
        if (!pageInfo.pageSize) pageInfo.pageSize = this.page.size;
        this.pageNumber = pageInfo.offset;
        const rowOffset = pageInfo.offset * pageInfo.pageSize;

        this.page = {
            pageNumber: Math.floor(rowOffset / pageInfo.pageSize),
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0,
        };

        // Ngăn chặn việc gọi API khi scroll lên (nếu dữ liệu tại vị trí này đã được nạp)
        if (this.rows && this.rows[rowOffset]) {
            return;
        }
        if (this.cache[this.page.pageNumber]) return;
        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cd.markForCheck();

        const payloadPage = {
            ...this.page,
            size: 25 // Fix cứng size để CouchDB không báo lỗi Invalid Bookmark
        };

        this._crawlService.archive({
            username: this.user.name,
            keyword: this.keyword,
            uuids: this.uuids,
            page: payloadPage,
            bookmark: this.currentBookmark, // Sử dụng bookmark
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    // Bóc tách theo cấu trúc middleware trả về: result.data.docs
                    const resData = result?.data;
                    if (resData && resData.docs && resData.docs.length > 0) {
                        if (!this.rows) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        // Sử dụng biến độc lập apiFetchedCount để đảm bảo data luôn nối đuôi liên tục
                        // dù page.size của UI và API (25) khác nhau.
                        const start = this.apiFetchedCount;

                        let newTotal = this.totalElements || 0;
                        const apiPageSize = 25; // Size cố định từ backend
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

                        const rows = [...this.rows];

                        // Nối dữ liệu vào đúng vị trí cuối cùng đã nạp từ API
                        rows.splice(start, resData.docs.length, ...resData.docs);
                        this.rows = rows;
                        this.apiFetchedCount += resData.docs.length;

                        // Lưu bookmark từ server để dùng cho request tiếp theo
                        this.currentBookmark = resData.bookmark;
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        // Nếu mảng rỗng nhưng bookmark thay đổi, tiếp tục gọi đệ quy (do PouchDB in-memory filter skip)
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        this.setPage(pageInfo);
                        return;
                    } else if (!resData || !resData.success === false) {
                        // Nếu không lấy được dữ liệu do lỗi, gỡ cache để lần cuộn sau có thể gọi tiếp
                        delete this.cache[this.page.pageNumber];
                    }
                },
                error: (err) => {
                    // Xóa cache khi có lỗi mạng để người dùng cuộn lại thì fetch lại
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

    /**
     * onChangeCollection: Trích xuất đúng UUID từ mảng selectedCollections
     */
    onChangeCollection() {
        // 1. Trích xuất tất cả UUID bài viết từ các tập đã chọn
        this.uuids = [
            ...new Set(
                (this.selectedCollections || []).flatMap((item: any) => {
                    // item.uuid bây giờ là 1 mảng các string ID bài viết
                    return Array.isArray(item.uuid) ? item.uuid : (item.uuid ? [item.uuid] : []);
                }),
            ),
        ];

        // 2. Reset toàn bộ trạng thái UI và mốc phân trang
        this.isLoading = false;
        if (this.table) this.table.offset = 0;
        this.selected = [];
        this.rows = [];
        this.rows = [...this.rows]; // force empty array update for datatable
        this.currentBookmark = null; // BẮT BUỘC: Bookmark cũ không dùng được cho tập UUIDs mới
        this.apiFetchedCount = 0;
        this.cachePageSize = 0;
        this.cache = {};
        this.cd.markForCheck();

        // 3. Tính toán lại tổng số phần tử (totalElements)
        if (this.uuids.length === 0) {
            // Nếu không chọn collection nào, lấy tổng số từ statistics (Tất cả bài viết)
            let temp = localStorage.getItem('statistics');
            if (temp && temp !== 'undefined') {
                const stats = JSON.parse(temp);
                this.totalElements = stats['archives'] || 0;
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
                    try {
                        this.following_users = JSON.parse(localStorage.following_users);
                    } catch (e) {
                        this.following_users = [];
                    }
                } else {
                    this.following();
                }

                this.collection();

                // searchTotalArchive moved to ngOnInit to prioritize localStorage
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
        if (temp && temp !== 'undefined') {
            try {
                let parsed = JSON.parse(temp);
                this.totalElements = parsed['archives'] || 0;
            } catch (e) {
                this.totalElements = 0;
            }
        } else {
            this.totalElements = 0;
        }

        if (!this.totalElements) {
            this._crawlService.searchTotalArchive({
                username: this.user.name,
                keyword: '',
                uuids: this.uuids,
                page: this.page,
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res: any) => {
                        if (!this.keyword && this.uuids.length === 0) {
                            let total = res?.data?.total;
                            if (total === undefined) total = res?.data?.data?.total;
                            if (total !== undefined) {
                                this.totalElements = total;
                                this.cd.markForCheck();
                            }
                        }
                    }
                });
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
