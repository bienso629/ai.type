import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, TemplateRef, ViewChild, ViewContainerRef, ViewEncapsulation } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { MatButton } from '@angular/material/button';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';
import { ColumnMode } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { HTML2Paragraph } from 'app/app.pipe';
import { ToastrService } from 'ngx-toastr';
import { CrawlService } from 'app/modules/_services/crawl';
import { UserClientService } from 'app/modules/_services/user';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { LogService } from 'app/modules/_services/link';
import { BlogService } from 'app/modules/_services/blog';

import moment from 'moment';
import { GoogleGenAI } from '@google/genai';
import { HelperService } from 'app/helper.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'chatgpt2s',
    templateUrl: './chatgpt2s.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [ChatGPTService, CrawlService, UserClientService, WP2MDService, LogService, BlogService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    exportAs: 'chatgpt2s'
})
export class ChatGPTLayoutComponent implements OnInit, OnDestroy {
    user: User;
    statistics: any = {};
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    ai: any;

    @ViewChild('chatgptOrigin') private _chatgptOrigin: MatButton;
    @ViewChild('chatgptPanel') private _chatgptPanel: TemplateRef<any>;

    @ViewChild('myTable') table: any;
    html2Paragraph: HTML2Paragraph = new HTML2Paragraph();

    chatgpt2s: any[] = [];
    expanded: any = {};
    goiy: string = '';

    totalElements: number;
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    lastId: string;

    ColumnMode = ColumnMode;
    private _overlayRef: OverlayRef;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    toggleExpandRow(row: any) {
        this.table.rowDetail.toggleExpandRow(row);
    }

    onDetailToggle(event: any) { }

    detail(row: any) {
        // console.log('row', row);
    }

    copy(answer: string) {
        this.clipboard.copy(answer);
        this.toastr.success('Đã copy nội dung xong!');
    }

    answer2Node(answer: string) {
        let parser = new DOMParser();
        const doc = parser.parseFromString(answer, 'text/html');

        // remove tất cả html trong đoạn này
        // let content = this.html2Paragraph.transform(answer);
        // console.log('content', content);
    }

    stop() {
        this._chatGPTService.stop2025({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => { },
                error: (e: any) => {
                    this.toastr.warning('Chưa thể dừng thao tác này.');
                },
                complete: () => {
                    this.toastr.success('Đã dừng thao tác này.');
                }
            });
    }

    upload = (e: any) => {
        const file: File = e.target.files[0];

        if (file) {
            this._blogService.upload({
                file: file,
                username: this.user.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result: any) => {
                        if (result && result.body) {
                            this.goiy = `Phân tích https://cdn.type.vn/${this.user.name}/uploads/${result.body.filename}`;
                            this.toastr.success(`${result.body.filename} đã được tải lên!`);
                        }
                    },
                    error: () => {
                        this.toastr.error('Không tải file lên được.');
                    },
                    complete: () => { }
                });
        }
    }

    // cập nhật lại số liệu câu hỏi
    updateTable(key?: string, value?: number) {
        this._userClientService.updateTable({
            username: this.user.name,
            createdAt1: moment().startOf('day').toString(),
            createdAt2: moment().endOf('day').toString(),
            table: {
                key: key,
                value: value
            }
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: () => { },
                error: () => { },
                complete: () => { }
            });
    }

    // cập nhật số liệu
    updateCount(n: number) {
        // lấy statistics dưới local lên và update
        let statistics = localStorage.getItem('statistics');
        if (statistics) {
            statistics = JSON.parse(statistics);
            if (statistics && statistics['chatgpt']) {
                statistics['chatgpt'] = parseInt(statistics['chatgpt']) + n;

                // cập nhật lại tổng
                this.totalElements = parseInt(statistics['chatgpt']);

                // lưu lại kết quả
                localStorage.setItem('statistics', JSON.stringify(statistics));
            }
        }

        // cập nhật báo cáo
        if (n > 0) {
            this.updateTable('table.chatgpt', n);
        }
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo: PageInfo) {
        // Current page number is determined by last call to setPage
        // This is the page the UI is currently displaying
        // The current page is based on the UI pagesize and scroll position
        // Pagesize can change depending on browser size
        this.pageNumber = pageInfo.offset;

        // Calculate row offset in the UI using pageInfo
        // This is the scroll position in rows
        const rowOffset = pageInfo.offset * pageInfo.pageSize;

        const page: Page = {
            pageNumber: Math.floor(rowOffset / pageInfo.pageSize),
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0
        };

        // We keep a index of server loaded pages so we don't load same data twice
        // This is based on the server page not the UI
        if (this.cachePageSize !== page.size) {
            this.cachePageSize = page.size;
            this.cache = {};
        }

        if (this.cache[page.pageNumber]) {
            return;
        }

        this.cache[page.pageNumber] = true;

        this._chatGPTService.fetch({
            username: this.user.name,
            page: page,
            lastId: this.lastId
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data && result.data.length > 0) {
                        if (!this.chatgpt2s) {
                            this.chatgpt2s = new Array<any>(this.totalElements || 0);
                        }

                        // Calc starting row offset
                        // This is the position to insert the new data
                        const start = page.pageNumber * page.size;

                        // Copy existing data
                        const rows = [...this.chatgpt2s];

                        // Insert new rows into correct position
                        rows.splice(start, page.size, ...result.data);

                        // Set rows to our new rows for display
                        this.chatgpt2s = rows;
                        this.lastId = this.chatgpt2s[this.chatgpt2s.length - 1]['_id'];
                    }
                },
                error: () => {
                },
                complete: () => {
                    this.cdref.detectChanges();
                }
            });
    }

    async chatgpt(question: string, index?: number) {
        if (question) {
            if (this.secretKey) {
                let geminiKey = this.secretKey[0];

                if (this.secretKey[2]) {
                    geminiKey = this.secretKey[2];
                }

                this.ai = new GoogleGenAI({ apiKey: this.secretKey[0] });

                const prompt = `Trả lời câu hỏi: "${question}" một cách ngắn gọn và chính xác. Kết quả trả lời là text thuần, không phải định dạng html hoặc markdown.`;

                const result = await this.ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: prompt,
                });

                if (result && result.text) {
                    result.q = question;

                    if (result.imgs && result.imgs.length > 0) {
                        let divImgs = '';

                        result.imgs.map((img: string) => {
                            divImgs = `${divImgs}<p><img src="${img}" class="chatgpt-img" /></p>`;
                        });

                        result.html = `${result.html}<div class="chatgpt-imgs">${divImgs}</div>`;
                    }

                    this.chatgpt2s.unshift({
                        question: question,
                        answer: result.text,
                        updatedAt: new Date()
                    });

                    this.cdref.detectChanges();
                    this.chatgptStore(result.text, question);
                } else {
                    this.toastr.warning('Gemini của bạn chưa hoạt động.');
                }
            } else {
                this.toastr.warning('Bạn chưa kết nối Gemini.');
            }
        } else {
            this.toastr.warning('Xin lỗi! Bạn chưa có prompt.');
        }
    }

    chatgptStore(answer: string, question: string) {
        this._chatGPTService.store({
            content: question,
            answer: answer,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        // cập nhật tính toán
                        this.totalElements++;
                        this._h.updateStatistics('chatgpt', 1);
                        this.cdref.detectChanges();
                        this.toastr.success('ChatGPT đã trả lời bạn.');
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Type Lite của bạn chưa được bật.');
                },
                complete: () => { }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private _chatGPTService: ChatGPTService,
        private _userClientService: UserClientService,
        private _blogService: BlogService,
        private _userService: UserService,
        private _overlay: Overlay,
        private _h: HelperService,
        private cdref: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _viewContainerRef: ViewContainerRef
    ) {
        // lấy secretKey và searchAPIKey
        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // lấy statistics dưới local lên và update
        let statistics = localStorage.getItem('statistics');
        if (statistics) {
            statistics = JSON.parse(statistics);
            this.totalElements = statistics['chatgpt'];
        }

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();

        // Dispose the overlay
        if (this._overlayRef) {
            this._overlayRef.dispose();
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Open the chatgpt panel
     */
    openPanel(): void {
        // Return if the notifications panel or its origin is not defined
        if (!this._chatgptPanel || !this._chatgptOrigin) {
            return;
        }

        // Create the overlay if it doesn't exist
        if (!this._overlayRef) {
            this._createOverlay();
        }

        // Attach the portal to the overlay
        this._overlayRef.attach(new TemplatePortal(this._chatgptPanel, this._viewContainerRef));
    }

    /**
     * Close the notifications panel
     */
    closePanel(): void {
        this._overlayRef.detach();
    }

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Create the overlay
     */
    private _createOverlay(): void {
        // Create the overlay
        this._overlayRef = this._overlay.create({
            hasBackdrop: true,
            backdropClass: 'fuse-backdrop-on-mobile',
            scrollStrategy: this._overlay.scrollStrategies.block(),
            positionStrategy: this._overlay.position()
                .flexibleConnectedTo(this._chatgptOrigin._elementRef.nativeElement)
                .withLockedPosition(true)
                .withPush(true)
                .withPositions([
                    {
                        originX: 'start',
                        originY: 'bottom',
                        overlayX: 'start',
                        overlayY: 'top'
                    },
                    {
                        originX: 'start',
                        originY: 'top',
                        overlayX: 'start',
                        overlayY: 'bottom'
                    },
                    {
                        originX: 'end',
                        originY: 'bottom',
                        overlayX: 'end',
                        overlayY: 'top'
                    },
                    {
                        originX: 'end',
                        originY: 'top',
                        overlayX: 'end',
                        overlayY: 'bottom'
                    }
                ])
        });

        // Detach the overlay from the portal on backdrop click
        this._overlayRef.backdropClick().subscribe(() => {
            this._overlayRef.detach();
        });
    }
}
