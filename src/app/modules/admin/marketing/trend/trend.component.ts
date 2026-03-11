import {
    AfterContentChecked,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import {
    UntypedFormBuilder,
    UntypedFormGroup,
    Validators,
} from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CrawlService } from 'app/modules/_services/crawl';
import {
    ColumnMode,
    DatatableComponent,
    SelectionType,
} from '@swimlane/ngx-datatable';
import { ToastrService } from 'ngx-toastr';
import { fuseAnimations } from '@fuse/animations';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config';
import { HttpClient } from '@angular/common/http';
import { YoutubeService } from 'app/modules/_services/youtube';
import { DomainService } from 'app/modules/_services/domain';
import { WordpressService } from 'app/modules/_services/wordpress';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { SharedService } from 'app/shared.service';
import { BlogService } from 'app/modules/_services/blog';
import { UserClientService } from 'app/modules/_services/user';

import * as _ from 'lodash';
import * as uuid from 'uuid';
import moment from 'moment';
import { HelperService } from 'app/helper.service';
import { GoogleGenAI } from '@google/genai';

@Component({
    selector: 'trend',
    templateUrl: './trend.component.html',
    styleUrls: ['./trend.component.scss'],
    providers: [
        CrawlService,
        YoutubeService,
        DomainService,
        WordpressService,
        BlogService,
        UserClientService,
    ],
    animations: fuseAnimations,
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AIFacePostComponent
    implements OnInit, OnDestroy, AfterContentChecked {
    animationStates: any;
    user: User;
    config: AppConfig;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    ai: any;

    uniqueID: String;
    fbCookiePath: String =
        'C:\\Users\\Wing386\\Documents\\ai.type\\cookie.json';

    chatgptForm: UntypedFormGroup;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    autoCreatePost: boolean = false;

    quanlity = 'medium';
    loading: boolean = false;
    isAnalyzing: boolean = false; // Biến trạng thái loading

    domains: any[] = [];
    categories: any[] = [];
    ccategories: any = {};

    sitemapForm: UntypedFormGroup;
    queryParams: Params;

    @ViewChild(DatatableComponent) table: DatatableComponent;

    preview: any = {};
    testCreateBlog: any;
    links: any[] = [];

    rows: any[] = [];
    totalElements: number = 0;
    totalDisplayCount: number = 0; // Biến mới để tính tổng số dòng hiển thị (bao gồm cả header)
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
    page: Page = {
        pageNumber: 0,
        size: 10,
        totalElements: 0,
        totalPages: 0,
    };
    currentBookmark: string;

    SelectionType = SelectionType;

    // Thêm biến lưu ngày cuối cùng của trang trước (để so sánh khi sang trang mới)
    lastDateHeader: string = '';

    activeRow: any = null;
    public selected: any[] = [];
    ColumnMode = ColumnMode;

    allLinkCollections: any = [];

    trendResult: any[] = []; // Biến lưu kết quả trend

    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // Thêm 2 hàm này để xử lý sự kiện
    onSelect({ selected }): void {
        // Lọc bỏ những dòng là nhãn ngày tháng (isHeader === true)
        // Chỉ giữ lại những dòng dữ liệu thật
        const validSelection = selected.filter((row) => !row.isHeader);

        // Cập nhật lại mảng selected với những dòng hợp lệ
        this.selected.splice(0, this.selected.length);
        this.selected.push(...validSelection);

        console.log('Số lượng thực tế được chọn:', this.selected.length);
    }

    displayCheck(row: any) {
        return row && row.text ? true : false;
    }

    // Chặn không cho chọn dòng header
    checkSelectable(row: any): boolean {
        return !row.isHeader;
    }

    onActivate(event: any) {
        if (event.type === 'click') {
            this.activeRow = event.row;
        }
    }

    isActive(row: any): boolean {
        return this.activeRow && this.activeRow.uuid === row.uuid;
    }

    displayFn(domain: any): string {
        return domain && domain.domain ? domain.domain : '';
    }

    displayCollectionFn(collection: any): string {
        return collection && collection.title
            ? collection.title
            : 'Chưa có bộ sưu tập nào';
    }

    linkCollections() {
        this._crawlService
            .linkCollections({
                username: this.user.name,
                page: { size: 100 },
                includeUuid: false,
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
                        this.allLinkCollections = [...result.data];

                        // set mặc định
                        this.sitemapForm.controls['collection'].setValue(
                            result.data[0],
                        );

                        // tự động lấy link đầu tiên để quét
                        this.getLinks(result.data[0]['_id'], 0);
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    /**
     * lấy tất cả link trong collection để chuẩn bị quét bài viết. Nếu có counter thì sẽ reset bảng và tính lại tổng số bài viết để chuẩn bị cho việc phân trang
     */
    getLinks(id: string, counter?: number) {
        this._crawlService
            .linksInCollection({
                username: this.user.name,
                id: id,
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
                        this.links = result.data;

                        // set mặc định
                        this.sitemapForm.controls['domain'].setValue(
                            this.links[0].link,
                        );
                    }
                },
                error: () => {
                    this.toastr.warning(`Không tải dữ liệu về.`);
                },
                complete: () => { },
            });

        // lấy bài theo collection
        if (counter && counter > 0) {
            this.resetTable();
        }
    }

    // lấy tất cả domain làm việc của bạn
    getDomains() {
        this._domainService
            .fetch({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.domains = result.data;
                        this.sitemapForm.controls['domain1'].setValue(
                            this.domains[0],
                        );
                        this.getCategories(this.domains[0] ?? ['domain']);
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    // chọn 1 category tương ứng với domain
    getCategories(e: any): void {
        const domain = this.sitemapForm.controls['domain1'].value;
        if (!domain || domain['domain'] === '') return;

        this._wordpressService
            .categories({
                domain: domain['domain'],
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.categories = result;

                        this.categories.map((category) => {
                            this.ccategories[`${category.name}`] = category.id;
                        });
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    // Reset bảng khi đổi Collection hoặc Search
    resetTable() {
        if (this.table) this.table.offset = 0;
        this.selected = [];
        this.rows = [];
        this.currentBookmark = null; // Quan trọng: Reset bookmark
        this.cachePageSize = 0;
        this.cache = {};
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo?: PageInfo) {
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

        const collection = this.sitemapForm.controls['collection'].value;

        this._crawlService
            .facePosts({
                username: this.user.name,
                keyword: this.keyword,
                facegroup: collection ? collection._id : null,
                page: this.page,
                bookmark: this.currentBookmark, // Truyền bookmark
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    const resData = result.data;
                    if (resData && resData.docs) {
                        const newRowsWithHeaders = [];

                        resData.docs.forEach((doc: any) => {
                            const currentDate = moment(doc.createdAt).format(
                                'DD/MM/YYYY',
                            );

                            // Nếu ngày của row này khác với ngày trước đó, chèn một row "Header"
                            if (currentDate !== this.lastDateHeader) {
                                newRowsWithHeaders.push({
                                    isHeader: true,
                                    dateLabel: currentDate,
                                    selectable: false, // Để logic checkbox biết đường mà tránh
                                });
                                this.lastDateHeader = currentDate;
                            }

                            // Chèn row dữ liệu thật
                            newRowsWithHeaders.push({
                                ...doc,
                                isHeader: false,
                                selectable: true,
                            });
                        });

                        // Đổ vào mảng rows chính (Vì mảng có thêm header nên page size sẽ lệch nhẹ,
                        // nhưng đây là cách đơn giản nhất để hiển thị)
                        this.rows = [
                            ...(this.rows || []),
                            ...newRowsWithHeaders,
                        ];

                        this.totalElements = this.rows.length;
                        this.totalDisplayCount = this.rows.filter(
                            (row) => !row.isHeader,
                        ).length; // Cập nhật số lượng hiển thị thực tế (không tính header)

                        this.currentBookmark = resData.bookmark;
                        this.cd.detectChanges();
                    }
                },
            });
    }

    // cập nhật lại số liệu câu hỏi
    updateTable(key?: string, value?: number) {
        this._userClientService
            .updateTable({
                username: this.user.name,
                createdAt1: moment().startOf('day').toString(),
                createdAt2: moment().endOf('day').toString(),
                table: {
                    key: key,
                    value: value,
                },
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: () => { },
                error: () => { },
                complete: () => { },
            });
    }

    // cập nhật số liệu
    updateCount(n: number) {
        // cập nhật lại tổng
        this.totalElements += n;
        this._h.updateStatistics('faceposts', n);

        // cập nhật báo cáo
        if (n > 0) {
            this.updateTable('table.faceposts', n);
        }
    }

    // tiếp tục quét
    async createAllSitemap() {
        // Tạo uniqueID mỗi lần chụp
        await (window as any).electron.tools({
            command: 'close-all-windows',
        });

        // nếu hết link
        if (this.links[0]) {
            // set lại
            this.sitemapForm.controls['domain'].setValue(this.links[0].link);

            // cào dữ liệu từ từ từng cái một
            this.crawl(this.links[0].link);
        } else {
            this.toastr.info(
                'Đã hoàn tất việc quét tất cả các link trong bộ sưu tập.',
            );
        }
    }

    async crawl(url: string) {
        this.loading = true;
        const collection = this.sitemapForm.controls['collection'].value;

        // Tạo uniqueID mỗi lần chụp
        const uniqueID = Math.random().toString(36).substr(2, 9);

        // Các tham số selector truyền vào backend
        const storySelector = 'data-ad-rendering-role="story_message"';
        const seeMoreSelector = 'div[role="feed"] div[data-ad-rendering-role="story_message"] div[role="button"]';
        const seeMoreText = 'Xem thêm'; // Có thể đổi thành 'See more' tùy tài khoản FB
        const postContainerSelector = '.x1yztbdb'; // Mã này sẽ truyền vào closest()
        const profileNameSelector = 'data-ad-rendering-role="profile_name"';

        await (window as any).electron.tools({
            url: url,
            command: 'facebook-crawl',
            uniqueID,
            facegroup: collection['_id'],
            type: 'post',
            maxPosts: this.sitemapForm.controls['length'].value,
            cookiePath: this.fbCookiePath,
            // Tham số động
            storySelector: storySelector,
            postContainerSelector: postContainerSelector,
            profileNameSelector: profileNameSelector,
            seeMoreSelector: seeMoreSelector,
            seeMoreText: seeMoreText,
        });
    }

    selectRowsByDate(dateLabel: string): void {
        // 1. Lấy tất cả các dòng dữ liệu thật thuộc về ngày này
        const rowsInDate = this.rows.filter(
            (row) =>
                !row.isHeader &&
                moment(row.createdAt).format('DD/MM/YYYY') === dateLabel,
        );

        if (rowsInDate.length === 0) return;

        // 2. Kiểm tra xem TOÀN BỘ các dòng của ngày này đã nằm trong danh sách 'selected' chưa
        const isAllSelected = rowsInDate.every((row) =>
            this.selected.some((s) => s._id === row._id),
        );

        let newSelected = [...this.selected];

        if (isAllSelected) {
            // TRƯỜNG HỢP REMOVE: Nếu đã chọn hết rồi -> Bỏ chọn tất cả các dòng của ngày này
            newSelected = newSelected.filter(
                (s) => moment(s.createdAt).format('DD/MM/YYYY') !== dateLabel,
            );
            this.toastr.info(`Đã bỏ chọn các bài viết ngày ${dateLabel}`);
        } else {
            // TRƯỜNG HỢP SELECT: Thêm những dòng của ngày này còn thiếu vào danh sách chọn
            rowsInDate.forEach((row) => {
                if (!newSelected.some((s) => s._id === row._id)) {
                    newSelected.push(row);
                }
            });
            this.toastr.success(
                `Đã chọn ${rowsInDate.length} bài viết ngày ${dateLabel}`,
            );
        }

        // 3. Cập nhật lại mảng selected để Table hiển thị đúng checkbox
        this.selected = [...newSelected];
        this.cd.markForCheck();
    }

    async analyticsTrend(): Promise<void> {
        // Chỉ lấy từ danh sách đã chọn
        const dataToAnalyze = this.selected;

        if (dataToAnalyze.length === 0) {
            this.toastr.warning(
                'Vui lòng chọn ít nhất một bài viết hoặc một ngày để phân tích!',
            );

            return;
        }

        if (this.secretKey && dataToAnalyze.length > 0) {
            // 1. Lọc dữ liệu sạch: Bắt buộc có text, loại bỏ header, lấy thêm images nếu có
            const cleanedData = dataToAnalyze
                .filter(item => item.text && item.text.trim().length > 0 && !item.isHeader)
                .map(item => ({
                    id: item.id || item._id,
                    text: item.text,
                    images: item.images && item.images.length > 0 ? item.images : []
                }));

            if (cleanedData.length === 0) {
                this.toastr.warning('Không có nội dung văn bản để phân tích xu hướng!');
                return;
            }

            // 2. Bật trạng thái loading
            this.isAnalyzing = true;
            this.trendResult = []; // Xóa kết quả cũ để hiện loading ở khu vực preview
            this.cd.markForCheck();

            // 2. Xây dựng Prompt chi tiết
            const prompt = `
                Hãy phân tích danh sách bài đăng sau đây để tìm ra các xu hướng cụ thể (không nói chung chung).
                Yêu cầu trích xuất chính xác tên sản phẩm, game, hoặc sự kiện đang được nhắc đến.
                
                Dữ liệu: ${JSON.stringify(cleanedData)}

                Yêu cầu trả về JSON array, mỗi phần tử gồm:
                - trend_name: Tên xu hướng cụ thể (VD: "Tranh cãi phí sinh hoạt 100 triệu và học phí IELTS").
                - summary: Phân tích ngắn gọn.
                - contents: Mảng các đối tượng { headline: "Tiêu đề bài viết", image_prompt: "Prompt tạo ảnh bằng tiếng Anh" }.
                - keywords: Các từ khóa liên quan.

                Lưu ý: image_prompt phải mô tả bối cảnh chuyên nghiệp, phong cách hiện đại phù hợp với tiêu đề.
            `;

            let geminiKey = this.secretKey[0];

            if (this.secretKey[6]) {
                geminiKey = this.secretKey[6];
            }

            this.ai = new GoogleGenAI({ apiKey: geminiKey }); // ok rooi

            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const jsonText = response.text.match(/```json\n([\s\S]*?)```/);
            if (jsonText) {
                try {
                    const data = JSON.parse(jsonText[1]);
                    localStorage.setItem('trend_analysis_result', JSON.stringify(data));
                } catch (e) {
                    this.toastr.warning('Không thể phân tích được trend.');
                }
            } else {
                this.toastr.warning('Không thể phân tích được trend.');
            }

            this.isAnalyzing = false; // Tắt loading
            this.cd.markForCheck();
        } else {
            this.toastr.warning('Xin lỗi! Bạn chưa kết nối với Gemini.');
        }
    }

    // Thêm hàm để xóa kết quả nếu cần
    clearTrend(): void {
        localStorage.removeItem('trend_analysis_result');
        this.trendResult = [];
        this.cd.markForCheck();
    }

    // lưu post
    storePost(data?: any) {
        if (data.length > 0) {
            let item = data[0];
            this._crawlService
                .facePostStore({
                    data: item,
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (result) => {
                        if (result && result.success) {
                            this.toastr.success(`Lưu ${item.uuid} thành công!`);

                            // lưu ảnh trên CDN
                            if (item.images && item.images.length > 0) {
                                this.storeImage(item.images);
                            }

                            // cập nhật lại số liệu
                            // this.updateCount(1);

                            // tiếp tục lưu
                            data.splice(0, 1);
                            this.storePost(data);
                        }
                    },
                    error: () => {
                        // lỗi cũng cố gắng chạy lại
                        // data.splice(0, 1);
                        this.storePost(data);
                    },
                    complete: () => { },
                });
        } else {
            // quét tiếp
            if (this.links.length > 0) {
                this.links.splice(0, 1);
                this.createAllSitemap();
            }
        }
    }

    // lưu hình
    storeImage(images: any) {
        images.map((image: string) => {
            if (image.indexOf('https://scontent.') >= 0) {
                this._crawlService
                    .storeImage({
                        imageUrl: image,
                        username: this.user.name,
                    })
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: () => { },
                        error: () => { },
                        complete: () => { },
                    });
            }
        });
    }

    async stop() {
        this.loading = false;

        // Tạo uniqueID mỗi lần chụp
        await (window as any).electron.tools({
            command: 'close-all-windows',
        });
    }

    // chuyển đổi facepost sang archive
    facePost2Node() {
        let p = this.preview.text.split('.').filter((i: string) => i);
        this._crawlService
            .facePost2Node({
                username: this.user.name,
                content: {
                    p: p,
                    img: this.preview.images,
                    a: this.preview.href,
                },
                title: '',
                url: '',
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
                error: (e: any) => { },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    previewNow(post: any) {
        let images = [];
        let href = [];
        this.testCreateBlog = null;

        if (post['images'] && post['images'].length > 0) {
            images = post['images'].filter((i: string) => {
                return i != null && i.indexOf('scontent') >= 0;
            });
        }

        if (post['href'] && post['href'].length >= 1) {
            href = post['href'].filter((i: string) => {
                return (
                    i != null &&
                    (i.indexOf('/photo/') >= 0 || i.indexOf('/videos/') >= 0)
                );
            });
        }

        post['images'] = images;
        post['href'] = href;

        post['text'] = post['text'].split('.').join('. ');
        post['text'] = post['text'].split(',').join(', ');

        this.preview = post;
    }

    createBlogByImages() {
        this._blogService
            .imgs2blog({
                index: 0,
                name: this.domains[0]['domain'],
                content: this.preview.text,
                domain: this.domains[0]['domain'],
                username: this.user.name,
                categories: this.categories,
                images: this.preview.images,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success && result.data) {
                        this.testCreateBlog = result.data;

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    checkVideo() {
        const video = this.preview.href.find((a: string) => {
            return a.indexOf('video') >= 0;
        });

        if (video) {
            return true;
        } else {
            return false;
        }
    }

    downloadVideo(url: string) {
        this._youtubeService
            .download({
                URLS: url,
                quanlity: this.quanlity,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (results) => {
                    if (results && results.success) {
                        this.toastr.success('Tải video về thành công!');
                    } else {
                        this.toastr.warning('Tải video thất bại.');
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Tải video thất bại.');
                },
                complete: () => { },
            });
    }

    downloadImage(url: string) {
        this.http.get(url, { responseType: 'blob' }).subscribe(
            (blob) => {
                // Create a link element
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${uuid.v4()}`; // Set the download filename

                // Append link to the body, click it, and then remove it
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },
            (error) => {
                console.error('Error downloading the image: ', error);
            },
        );
    }

    autoPost() {
        this.alert({
            title: 'Phần mềm tự động tạo bài viết',
            message: `Hệ thống tìm thấy ${this.totalElements} post(s) có thể tạo bài viết trên website ${this.sitemapForm.controls['domain1'].value['domain']}.`,
            confirm: 'Bắt đầu ngay',
            cb: () => {
                localStorage.removeItem('auto_create_content_the_last_id');
                this.sharedService.trigger(
                    this.sitemapForm.value,
                    this.totalElements,
                    this.categories,
                ); // kích hoạt sự kiện
            },
        });
    }

    /**
     * Constructor
     */
    constructor(
        private http: HttpClient,
        private _crawlService: CrawlService,
        private _activatedRoute: ActivatedRoute,
        private _formBuilder: UntypedFormBuilder,
        private toastr: ToastrService,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _youtubeService: YoutubeService,
        private _wordpressService: WordpressService,
        private sharedService: SharedService,
        private _blogService: BlogService,
        private _h: HelperService,
        private cd: ChangeDetectorRef,
        private _domainService: DomainService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private _router: Router,
        private titleService: Title,
    ) {
        this.titleService.setTitle(
            `lấy post từ nhóm facebook | ai.type - công cụ tạo content`,
        );

        this.sitemapForm = this._formBuilder.group({
            collection: [null, Validators.required], // chọn collection
            domain: ['', Validators.required], // link chọn để quét bài
            domain1: [null, Validators.required], // đối tượng domain để post bài lên
            domain2: ['', Validators.required], // domain tham chiếu
            titledomain2: ['', Validators.required], // title tham chiếu
            autocreatenode: [true, Validators.required],
            publish: [false, Validators.required],
            createmore100nodes: [false, Validators.required],
            createthumbnail: [false, Validators.required],
            createvideo: [false, Validators.required],
            autopost: [false, Validators.required],
            length: [3, Validators.required],
        });

        // lấy secretKey và searchAPIKey
        this.settings = localStorage.getItem('settings');
        if (this.settings) {
            this.settings = JSON.parse(this.settings);
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;
        }

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                // lấy domain
                this.getDomains();

                // lấy bộ sưu tập
                this.linkCollections();

                if (user.reputation < 10000) {
                    this.error(
                        'Tài khoản của bạn không đủ điều kiện để truy cập!',
                    );
                    return;
                }
            });

        // sau khi đã vào đây rồi thì ko còn thông báo nữa
        localStorage.removeItem('auto_create_content_the_last_id');

        // Nhận phản hồi, theo dõi hoạt động từ main process
        this.unsubscribeRes = (window as any).electron.onToolsResponse(
            (data: { action: string; success: any; posts: any }) => {
                if (data.action === 'facebook-crawl' && data.success) {
                    if (data && data.posts && data.posts.length > 0) {
                        console.log('Dữ liệu bài viết mới nhận được từ main:', data.posts);
                        
                        // cập nhật bảng
                        this.rows = [...data.posts, ...this.rows];
                        this.selected = [...data.posts, ...this.selected];

                        this.totalElements = this.rows.length;
                        this.totalDisplayCount = this.rows.filter(
                            (row) => !row.isHeader,
                        ).length; // Cập nhật số lượng hiển thị thực tế (không tính header)

                        // lam moi lai giao dien
                        this.loading = false;
                        this.toastr.success(`Quét Facebook thành công!`);

                        // tự động lưu
                        this.storePost(data.posts);

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                }
            },
        );

        // Nhận phản hồi
        this.unsubscribeLog = (window as any).electron.onToolsLog(
            (msg: any) => {
                this.loading = false;
                console.log('Log từ main:', msg);

                // lam moi lai giao dien
                this.cd.markForCheck();
            },
        );
    }

    ngAfterContentChecked(): void { }

    /**
     * On init
     */
    ngOnInit(): void {
        this.chatgptForm = this._formBuilder.group({
            chatgpt: [''],
        });

        // Subscribe to query params change
        this._activatedRoute.queryParams
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((queryParams) => {
                // Store the query params
                this.queryParams = queryParams;

                // lam moi lai giao dien
                this.cd.markForCheck();
            });

        // Đọc dữ liệu từ localStorage khi load trang
        const savedTrend = localStorage.getItem('trend_analysis_result');
        if (savedTrend) {
            try {
                this.trendResult = JSON.parse(savedTrend);
            } catch (e) {
                console.error("Lỗi parse dữ liệu trend", e);
            }
        }
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        if (this.unsubscribeLog) this.unsubscribeLog();
        if (this.unsubscribeRes) this.unsubscribeRes();

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
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
            this._router.navigate(['/sign-out']);
        });
    }

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: alert ? alert.title : 'Hoàn tất!',
            message: alert
                ? alert.message
                : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu. <span class="font-medium">Hãy tiếp tục với một URL mới luôn nào!</span>',
            icon: {
                show: true,
                name: 'feather:check',
                color: 'success',
            },
            actions: {
                confirm: {
                    show: true,
                    label: alert ? alert.confirm : 'Khởi động lại',
                    color: 'primary',
                },
                cancel: {
                    show: true,
                    label: 'Đóng cửa sổ',
                },
            },
            dismissible: true,
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (alert.cb) {
                    alert.cb();
                }
            }
        });
    }
}
