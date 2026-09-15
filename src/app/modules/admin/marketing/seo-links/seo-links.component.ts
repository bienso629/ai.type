import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';

import { MatDrawerContainer } from '@angular/material/sidenav';
import { Subject, takeUntil } from 'rxjs';

// import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { ToastrService } from 'ngx-toastr';
import { LogService } from 'app/_services/link';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';

import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';
import { MatDialog } from '@angular/material/dialog';
import { EditDialog } from './dialogs/edit-dialog';
import { CrawlService } from 'app/_services/crawl';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { DialogContentComponent } from 'app/modules/admin/marketing/seo-links/seo-links.module';

import { AutoLayoutDialogService } from 'app/auto-layout-dialog.service';
import { GenaiService } from 'app/genai.service';
import { marked } from 'marked';
import { HelperService } from 'app/helper.service';

import _ from 'lodash';

@Component({
    selector: 'seo-links',
    templateUrl: './seo-links.component.html',
    providers: [MatDrawerContainer, CrawlService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LinksComponent implements OnInit, OnDestroy {
    year: number = 2023;
    config: AppConfig;
    user: User;

    settings: any;
    secretKey: any;
    searchAPIKey: any;

    // ai: any;
    ai = inject(GenaiService);

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;
    logsForm: UntypedFormGroup;

    rows: any[] = [];
    totalElements: number;
    apiFetchedCount: number = 0;
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

    downloadJsonHref: any;

    panelOpenState = false;
    resultSeo: any = {};

    statistics = {
        status_200: 0,
        status_500: 0,
        status_404: 0,
        facebook: 0,
        site_google: 0
    }

    @ViewChild(DatatableComponent) table: DatatableComponent;
    public selected: any[] = [];
    hostname: any;
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    currentLinkCollection: any;
    allLinkCollections = [];
    loading = false;

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

    generateDownloadJsonUri() {
        var theJSON = JSON.stringify(this.rows);
        var uri = this.sanitizer.bypassSecurityTrustUrl("data:text/json;charset=UTF-8," + encodeURIComponent(theJSON));
        this.downloadJsonHref = uri;
    }

    // thống kê trạng thái của link
    statistic() {
        _(this.rows)
            .groupBy('options.status')
            .map((item, itemId) => {
                this.statistics[`status_${itemId}`] = item.length;
            }).value();

        this.statistics.facebook = this.rows.filter((v: any) => {
            return v.link.indexOf('facebook.com') >= 0;
        }).length;;
    }

    // cập nhật số liệu
    updateCount(n: number) {
        // cập nhật lại tổng
        this.totalElements += n;
        this._h.updateStatistics('links', n);
    }

    linkCollections() {
        this._crawlService.linkCollections({
            username: this.user.name,
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.allLinkCollections = [...result.data];
                    }
                },
                error: () => {
                },
                complete: () => { }
            });
    }

    searchLink(event: any) {
        this.table.offset = 0;
        this.keyword = event.target.value.toLowerCase();
        this.rows = [];
        this.currentBookmark = null; // Reset bookmark khi search mới
        this.apiFetchedCount = 0;
        this.cachePageSize = 0;
        this.cache = {};

        if (this.keyword) {
            this._logService.searchTotal({
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
            let temp = localStorage.getItem('statistics');
            if (temp && temp != 'undefined') {
                try {
                    let parsedTemp = JSON.parse(temp);
                    this.totalElements = parseInt(parsedTemp['links']) || 0;
                } catch (e) {
                    this.totalElements = 0;
                }
            } else {
                this.totalElements = 0;
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
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
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
            totalPages: 0
        };

        if (this.cachePageSize !== this.page.size) {
            this.cachePageSize = this.page.size;
            this.cache = {};
        }

        if (this.cache[this.page.pageNumber]) return;
        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cd.markForCheck();

        const payloadPage = {
            ...this.page,
            size: 100 // Cố định kích thước để tránh lỗi Invalid Bookmark của CouchDB
        };

        this._logService.fetch({
            username: this.user.name,
            keyword: this.keyword,
            page: payloadPage,
            bookmark: this.currentBookmark // Gửi bookmark thay vì lastId
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    // Lưu ý: result.data bây giờ chứa { docs: [], bookmark: "" }
                    const resData = result.data;

                    if (resData && resData.docs && resData.docs.length > 0) {
                        if (!this.rows || this.rows.length === 0) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        const start = this.apiFetchedCount;
                        const rows = [...this.rows];

                        // Map dữ liệu bổ sung như trạng thái loading
                        const newDocs = resData.docs.map((post: any) => {
                            post['status'] = true;
                            post['loadding'] = false;
                            return post;
                        });

                        rows.splice(start, newDocs.length, ...newDocs);
                        this.rows = [...rows];
                        this.apiFetchedCount += newDocs.length;

                        // Quan trọng: Vì API không trả về total, ta phải tự đối chiếu tổng số để ngx-datatable có thể render!
                        if (newDocs.length < this.page.size) {
                            this.totalElements = this.rows.length;
                        } else {
                            // Vẫn còn trang tiếp theo, cộng thêm sức chứa ảo để user còn cuộn tiếp
                            this.totalElements = this.rows.length + this.page.size;
                        }

                        // Cập nhật bookmark cho trang tiếp theo
                        this.currentBookmark = resData.bookmark;

                        this.statistic();
                        this.generateDownloadJsonUri();
                        this.cd.detectChanges();
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
                    this.cd.markForCheck();
                }
            });
    }

    add(urls?: any) {
        if (!urls) {
            urls = this.logsForm.get('url').value;
            urls = urls.split('\n').filter((i: string) => i);

            if (urls.length === 0) {
                // kết thúc ghi link thì thống kê lại
                this.statistic();

                this.toastr.warning(`Bạn chưa có link.`);
                return;
            }
        }

        // mặc định link này là 200
        this._logService.add({
            link: urls[0],
            title: '',
            options: { status: 200, exist: true },
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.rows.unshift({
                            _id: result.data._id,
                            link: result.data.link,
                            options: {
                                status: (result.data.options) ? result.data.options.status : 200,
                                exist: (result.data.options) ? result.data.options.exist : false
                            },
                            updatedAt: result.data.updatedAt
                        });

                        this.rows = [...this.rows];
                        this.logsForm.controls['url'].reset();

                        this.updateCount(1);

                        this.toastr.success(`Link mới đã được thêm!`);
                    } else {
                        this.toastr.error(`Không thể thêm link mới.`);
                    }
                },
                error: (e: any) => { this.toastr.error(`Không thể thêm link mới.`); },
                complete: () => { }
            });
    }

    checkseo(item: any) {
        // Bắt đầu kiểm tra SEO - mở panel và hiển thị loading ngay lập tức
        item['loadding'] = true;
        this._h.openChatGPTWithSEO$.next({
            question: `Kiểm tra SEO: ${item.link}`,
            answer: '',
            loading: true
        });

        this._logService.checkseo(item.link)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    item['loadding'] = false;

                    if (result) {
                        this.seo(result, item);
                    } else {
                        this.toastr.error(`Không thể kiểm tra.`);
                        this._h.openChatGPTWithSEO$.next({
                            question: `Kiểm tra SEO: ${item.link}`,
                            answer: 'Không thể kết nối để lấy kết quả SEO từ máy chủ.',
                            loading: false
                        });
                    }

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
                error: (e: any) => {
                    item['loadding'] = false;
                    this.toastr.error(`Không thể kiểm tra.`);
                    this._h.openChatGPTWithSEO$.next({
                        question: `Kiểm tra SEO: ${item.link}`,
                        answer: 'Có lỗi xảy ra khi gọi dịch vụ kiểm tra SEO.',
                        loading: false
                    });
                },
                complete: () => { }
            });
    }

    async seo(result: any, item: any) {
        try {
            let jsonText = null;
            const prompt = `Dựa vào kết quả SEO của mình: "${JSON.stringify(result)}" hãy phân tích và đánh giá kết quả SEO này một cách chi tiết, cụ thể và dễ hiểu nhất. Sau đó, bạn hãy đưa ra giải pháp và các ví dụ tốt nhất, chính xác và đầy đủ nhất để giúp mình chỉnh sửa lại website sao cho kết quả SEO càng ngày càng tốt hơn. Lưu ý: hãy sử dụng icon để thể hiện hay chính xác hơn các đánh giá và giải pháp của bạn.`;

            const response = await this.ai.generateContent({
                model: 'gemini-3.6-flash',
                contents: prompt,
            }, item._id);

            jsonText = response.text;

            this._h.openChatGPTWithSEO$.next({
                question: `Kiểm tra SEO: ${item.link}`,
                answer: jsonText,
                loading: false
            });
        } catch (error) {
            this.toastr.error(`Gemini hiện chưa thể phản hồi.`);
            this._h.openChatGPTWithSEO$.next({
                question: `Kiểm tra SEO: ${item.link}`,
                answer: 'Gemini hiện chưa thể phản hồi hoặc kết nối tới AI Agent bị gián đoạn.',
                loading: false
            });
        }
    }

    recheck(item: any) {
        this._logService.check({
            links: [item.link],
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        item.options = result.data;
                        this.update(item);

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                },
                error: (e: any) => {
                    this.toastr.error(`Không thể kiểm tra.`);
                },
                complete: () => {
                    // this.statistic();
                }
            });
    }

    update(item: any) {
        this._logService.update({
            _id: item._id,
            link: item.link,
            title: item.title,
            options: item.options,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.toastr.success(`URL đã được kiểm tra.`);
                    }
                },
                error: (e: any) => {
                    this.toastr.error(`Không thể kiểm tra.`);
                },
                complete: () => { }
            });
    }

    crawl(link: string) {
        this._logService.crawl({
            url: link,
            request: 'h1|body\nh2|body\nh3|body\nh4|body\nh5|body\np|body\nspan|body\nlabel|body\ntable|body\nimg,data-lazy-src+title+alt|body\niframe,data-lazy-src|body\na,href+title|body\nli|body\ntitle|html > head\nmeta,content:name|html > head\nmeta,content:property|html > head',
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.title) {
                        this.storeNodeNoRequest(link, result);
                    } else {
                        this.toastr.error('Link không được phân tích', `đang quét lại`);
                    }
                },
                error: (e: any) => {
                    this.toastr.error(`Không thể kiểm tra.`);
                },
                complete: () => {
                }
            });
    }

    edit(item: any) {
        const dialogRef = this.dialog.open(EditDialog, {
            width: '540px',
            data: {
                item: item,
                user: this.user
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result && result.data) {
                item = result.data['item'];

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
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

    updateLinkCollection() {
        let ids = [];

        this.selected.map(item => {
            ids.push(item._id);
        });

        function mergeArraysUnique(array1: any, array2: any) {
            return _.union(array1, array2);
        }

        this.currentLinkCollection.map((item: any) => {
            item['ids'] = mergeArraysUnique(item['ids'], ids);

            return item;
        });

        this._crawlService.storeLinkCollection({
            collections: this.currentLinkCollection,
            username: this.user.name,
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.toastr.success('Cập nhật thành công!');
                    }
                },
                error: () => {
                },
                complete: () => { }
            });
    }

    /**
    * Thêm mới vào Collection
    */
    addCollection = async (title: string): Promise<any> => {
        this.loading = true;
        let ids = [];

        this.selected.map(item => {
            ids.push(item._id);
        });

        return new Promise((resolve) => {
            this._crawlService.createLinkCollection({
                title: title,
                ids: ids,
                username: this.user.name,
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            // Cập nhật danh sách
                            this.allLinkCollections = [...this.allLinkCollections, result.data];
                            this.loading = false;

                            // kết thúc thêm mới
                            resolve(result.data);
                        }
                    },
                    error: () => {
                    },
                    complete: () => { }
                });
        });
    }

    onChangeCollection(_$event: any) {
        // console.log('onChange', $event);
    }

    onCloseCollection(_$event: any) {
        // console.log('onClose', $event);
    }

    onAddCollection($event: any) {
        // console.log('onAddCollection', $event);
    }

    onRemoveCollection($event: any) {
        // console.log('onRemoveCollection', $event);
    }

    onClearCollection() {
        // console.log('onClear');
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _formBuilder: UntypedFormBuilder,
        private _logService: LogService,
        private _userService: UserService,
        private _crawlService: CrawlService,
        public dialog: MatDialog,
        private dialogs: AutoLayoutDialogService,
        private _h: HelperService,
        private cd: ChangeDetectorRef,
        private toastr: ToastrService,
        private sanitizer: DomSanitizer,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        // private _fuseMediaWatcherService: FuseMediaWatcherService
    ) {
        this.titleService.setTitle(`link tốt | ai.type - công cụ tạo content`);

        let temp = localStorage.getItem('statistics');
        if (temp && temp != 'undefined') {
            try {
                let parsedTemp = JSON.parse(temp);
                this.totalElements = parseInt(parsedTemp['links']) || 0;
            } catch (e) {
                this.totalElements = 0;
            }
        } else {
            this.totalElements = 0;
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On Destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    /**
     * On init
     */
    ngOnInit(): void {
        this.logsForm = this._formBuilder.group({
            url: ['']
        });

        // // Subscribe to media changes
        // this._fuseMediaWatcherService.onMediaChange$
        //     .pipe(takeUntil(this._unsubscribeAll))
        //     .subscribe(({ matchingAliases }) => {
        //         // Set the drawerMode and drawerOpened if 'lg' breakpoint is active
        //         if (matchingAliases.includes('lg')) {
        //             this.drawerMode = 'side';
        //             // this.drawerOpened = false;
        //         } else {
        //             this.drawerMode = 'over';
        //             // this.drawerOpened = false;
        //         }

        //         // Mark for check
        //         this._changeDetectorRef.markForCheck();
        //     });

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



                // lấy bộ sưu tập link
                this.linkCollections();

                if (this.totalElements > 0 && (!this.rows || this.rows.length === 0)) {
                    this.setPage({
                        offset: 0,
                        pageSize: undefined,
                        limit: undefined,
                        count: this.totalElements
                    });
                }
            });
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
