import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { FormArray, FormGroup, UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, timeout } from 'rxjs';
import { CrawlService } from 'app/modules/_services/crawl';
import { ColumnMode } from '@swimlane/ngx-datatable';
import { ToastrService } from 'ngx-toastr';
import { fuseAnimations } from '@fuse/animations';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config';
import { GenaiService } from 'app/genai.service';

import * as _ from 'lodash';

@Component({
    selector: 'ai-crawl',
    templateUrl: './ai-crawl.component.html',
    providers: [CrawlService],
    animations: fuseAnimations,
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AIWordComponent implements OnInit, OnDestroy {
    animationStates: any;
    config: AppConfig;
    user: User;

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;
    aiLoading: boolean = false;

    sitemapForm: UntypedFormGroup;
    sitemapFormDefaults: any = {
        domain: '',
        main_class: '',
        href_except_contain_str: '',
        href_contain_str: '',
        next_navigation_class: '',
        root_domain: '',
        page_domain: '',
        request: '',
        is_auto_start: true
    };

    links: any[] = [];
    arr: any[] = [];
    domains: any[] = [];
    errCount: number = 0;

    fbCookiePath: String = "C:\\Users\\Wing386\\Documents\\ai.type\\cookie.json";

    downloadJsonHref: any;
    ColumnMode = ColumnMode;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------
    /**
     * Toggle animation state
     *
     * @param animation
     * @param firstState
     * @param secondState
     * @param timeout
     */
    toggleAnimationState(animation: string, firstState: string | boolean, secondState: string | boolean, timeout: number = 500): void {
        // Split the animation
        const animationPath = animation.split('.');

        // Toggle the animation state
        this.animationStates[animationPath[0]][animationPath[1]] = firstState;

        setTimeout(() => {
            this.animationStates[animationPath[0]][animationPath[1]] = secondState;
        }, timeout);
    }

    alert(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo',
            message: message,
            icon: {
                show: true,
                name: 'feather:check',
                color: 'success'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Khởi động lại',
                    color: 'primary'
                },
                cancel: {
                    show: true,
                    label: 'Đóng cửa sổ'
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((result) => {
            if (result === "confirmed") {
                this.reset();
            }
        });
    }

    /**
     * Reset the search form using the default
     */
    reset(): void {
        this.sitemapForm.reset(this.sitemapFormDefaults);

        localStorage.removeItem('history_blog_crawling');
        localStorage.removeItem('history_blog_crawled');
        localStorage.removeItem('history_error_links');

        this.domains = [];
        this.links = [];
        // this.error_links = [];

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    /**
     * Lưu form mỗi lần bấm chạy
     */
    saveForm(): void {
        // lưu form cài đặt tìm nội dung trước khi chạy
        localStorage.setItem('history_crawler_form', JSON.stringify(this.sitemapForm.value));
    }

    /**
     * Tu domain me tim kiem cac link lien quan
     * Cang nhieu domain me thi tim kiem cang nhanh
     */
    async createSitemap() {
        this.arr = this.sitemapForm.controls['domain'].value.split(/\r?\n|\r|\n/g);

        // cào dữ liệu từ từ từng cái một
        this._crawlService.createSitemap({
            "domain": this.arr[0],
            "main_class": this.sitemapForm.controls['main_class'].value,
            "href_except_contain_str": this.sitemapForm.controls['href_except_contain_str'].value,
            "href_contain_str": this.sitemapForm.controls['href_contain_str'].value,
            "next_navigation_class": this.sitemapForm.controls['next_navigation_class'].value,
            "root_domain": this.sitemapForm.controls['root_domain'].value,
            "page_domain": this.sitemapForm.controls['page_domain'].value
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.href_data && result.href_data.length > 0) {
                        this.saveForm();

                        // lấy links mới đè lên links cũ
                        this.links = this.links.concat(result.href_data);

                        // luu lai nhung domain da lam viec
                        // neu domain nao ma lay duoc link thi luu vao trong lich su
                        const index = _.findIndex(this.domains, { 'url': this.arr[0] });
                        if (index < 0) {
                            this.domains.push({
                                url: this.arr[0]
                            });
                        }

                        this.domains = _.uniqBy(this.domains, obj => obj.url);

                        if (result.href_navigation_data && result.href_navigation_data.length > 0) {
                            result.href_navigation_data.map((item: any) => {
                                this.arr.push(item.url);
                            });
                        }

                        // kiểm tra chương trình và đệ quy
                        if (this.arr && this.arr.length > 0) {
                            this.arr = _.uniq(this.arr);

                            _.remove(this.arr, (n) => {
                                for (let i = 0; i < this.domains.length; i++) {
                                    if (n === this.domains[i].url) {
                                        return true;
                                    }
                                }
                            });

                            // tạo mới danh sách quét link
                            this.sitemapForm.controls['domain'].setValue(this.arr.join("\n"));

                            localStorage.setItem('history_blog_crawling', this.arr.join(';'));
                            localStorage.setItem('history_blog_crawled', JSON.stringify(this.domains));

                            this.generateDownloadJsonUri();
                        }

                        // chay lai qua trinh tiem kiem link
                        if (this.arr.length > 0) {
                            this.createSitemap();
                        } else {
                            this.crawlCompany();
                        }

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    } else {
                        this.toastr.error('Chương trình cần được active.', `Quét lại`);
                    }
                },
                error: (e: any) => {
                    console.log(e);
                    this.toggleAnimationState('shake.shake', false, true, 150);
                    // localStorage.setItem('history_error_links', JSON.stringify(this.error_links));
                },
                complete: () => { }
            });
    }

    /**
     * Tiếp tục nhân rộng sitemap
     * Luu tru thong tin doanh nghiep
     */
    crawlCompany(link?: string) {
        this._crawlService.crawlCompany({
            url: (link) ? link : this.links[0].url,
            request: this.sitemapForm.controls['request'].value,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: ((result: any) => {
                    if (result && result.title) {
                        this.storeNodeNoRequest((link) ? link : this.links[0].url, result);
                    } else {
                        this.toastr.error('Link không được phân tích', `Quét lại`);
                    }
                }),
                error: (e: any) => {
                    this.toggleAnimationState('shake.shake', false, true, 150);
                    // localStorage.setItem('history_error_links', JSON.stringify(this.error_links));
                },
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
                        this.links.splice(0, 1);
                        this.links = [...this.links]; // hoặc slice()

                        // lam moi lai giao dien
                        this.cd.markForCheck();

                        this.toastr.success(`${node.title}`, `Ghi nhớ`);
                    } else {
                        this.toastr.error('Không thể lưu.');
                    }
                }),
                error: (e: any) => {
                },
                complete: () => {
                    if (this.links.length > 0) {
                        this.crawlCompany();
                    }
                }
            });
    }

    generateDownloadJsonUri() {
        var theJSON = JSON.stringify(this.links);
        var uri = this.sanitizer.bypassSecurityTrustUrl("data:text/json;charset=UTF-8," + encodeURIComponent(theJSON));
        this.downloadJsonHref = uri;
    }

    readFile(e: any) {
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.readAsText(file);

        reader.onload = async (evt) => {
            const json = JSON.parse((evt as any).target.result);

            if (json.length > 0) {
                this.links = json;
            }

            // lam moi lai giao dien
            this.cd.markForCheck();
        };
    }

    async autoConfigByAI() {
        const url = this.sitemapForm.controls['domain'].value;
        if (!url) {
            this.toastr.warning('Vui lòng nhập URL cần thu thập dữ liệu trước.');
            return;
        }

        this.aiLoading = true;
        this.cd.markForCheck();

        try {
            let htmlContext = '';
            if ((window as any).electron) {
                try {
                    const htmlRes = await (window as any).electron.invoke('ai:fetch-html', url);
                    if (htmlRes && htmlRes.success && htmlRes.html) {
                        let doc = new DOMParser().parseFromString(htmlRes.html, 'text/html');
                        // Xoá các thẻ không cần thiết để tiết kiệm token (KHÔNG xoá nav vì chứa phân trang)
                        let tagsToRemove = ['script', 'style', 'svg', 'noscript', 'iframe', 'header', 'footer'];
                        tagsToRemove.forEach(tag => {
                            let elements = doc.getElementsByTagName(tag);
                            for (let i = elements.length - 1; i >= 0; i--) { elements[i].remove(); }
                        });
                        htmlContext = doc.body.innerHTML;
                        // Lấy tối đa 300,000 ký tự đầu tiên để tránh bị cắt mất phần content
                        htmlContext = htmlContext.substring(0, 300000);
                    } else if (htmlRes && !htmlRes.success) {
                        this.toastr.error('Electron Fetch Error: ' + htmlRes.error);
                        console.error('Electron Fetch Error:', htmlRes.error);
                    }
                } catch (error) {
                    this.toastr.error("Lỗi IPC (Chưa restart App?): " + error.message);
                    console.error("Lỗi khi fetch HTML từ Electron:", error);
                }
            } else {
                this.toastr.error('Môi trường hiện tại không hỗ trợ Electron IPC (Thiếu window.electron). Vui lòng chạy trên App!');
                console.error("Không tìm thấy window.electron.");
            }

            if (!htmlContext || htmlContext.trim() === '') {
                this.toastr.warning('Vẫn không có HTML. Đang dừng tiến trình để tránh đoán mò!');
                this.aiLoading = false;
                this.cd.markForCheck();
                return; // Ngắt ngang luôn, không cho AI chạy để tránh tốn tiền và ra kết quả sai
            } else {
                this.toastr.success('Đã tải thành công HTML thực tế, dung lượng: ' + htmlContext.length + ' ký tự.');
                console.log("HTML Context Preview:", htmlContext.substring(0, 1000));
            }

            const prompt = `Bạn là một chuyên gia Web Scraping. Tôi muốn cào dữ liệu từ trang web sau: ${url}

Dưới đây là một phần mã nguồn HTML THỰC TẾ của trang web này (đã được lược giản để loại bỏ rác):
\`\`\`html
${htmlContext}
\`\`\`

Dựa vào mã nguồn HTML thực tế ở trên, hãy phân tích và tìm ra cấu trúc HTML của trang web này.
Vui lòng trả về kết quả định dạng JSON chứa cấu hình cào dữ liệu:
{
  "root_domain": "Domain gốc của trang (VD: https://domain.com)",
  "main_class": "CSS Selector CHÍNH XÁC TUYỆT ĐỐI của thẻ bọc GẦN NHẤT chứa TẤT CẢ các bài viết trong 1 page. LƯU Ý QUAN TRỌNG: 1) KHÔNG ĐƯỢC dùng các thẻ quá chung chung ở vòng ngoài như #main, #primary, #content. 2) TUYỆT ĐỐI KHÔNG dùng các class dàn trang (layout) của Bootstrap như .col-12, .col-xl-9, .row, .container... Hãy ưu tiên các class mang ý nghĩa nội dung (semantic) như .post-list, .blog-posts, .archive... Phải đi sâu vào trong DOM đến tận div/ul trực tiếp chứa danh sách bài viết!",
  "next_navigation_class": "CSS Selector của THẺ BỌC toàn bộ các nút phân trang (VD: .pagination, .page-numbers, .nav-links). LƯU Ý: Không lấy đích danh một nút next, mà lấy cái khung div/ul bọc bên ngoài tất cả các số trang!",
  "href_contain_str": "Ký tự nhận diện link bài viết (VD: /bai-viet/, /chi-tiet/)",
  "request": "Quy tắc lấy nội dung chi tiết bài viết"
}

LƯU Ý VỀ TRƯỜNG "request":
Quy tắc lấy dữ liệu của tôi có định dạng: <tên_thẻ>|<css_selector_của_thẻ_bọc_nội_dung_chi_tiết>
Ví dụ mẫu nếu thẻ bọc nội dung bài viết là .post-detail-content:
h1|.post-detail-content
h2|.post-detail-content
h3|.post-detail-content
h4|.post-detail-content
h5|.post-detail-content
p|.post-detail-content
span|.post-detail-content
label|.post-detail-content
table|.post-detail-content
img,data-lazy-src+title+alt|.post-detail-content
iframe,data-lazy-src|.post-detail-content
a,href+title|.post-detail-content
li|.post-detail-content
title|html > head
meta,content:name|html > head
meta,content:property|html > head

Hãy tạo ra một chuỗi "request" tương tự, giữ nguyên cấu trúc lấy đầy đủ các thẻ h1->h5, p, span, table, img, iframe, a, li, title, meta... NHƯNG BẠN PHẢI TỰ TÌM CSS Selector chính xác của THẺ BAO BỌC NỘI DUNG BÀI VIẾT (article content container) của trang web ${url} dựa trên mã HTML thực tế ở trên để điền vào sau dấu | (Thay cho .post-detail-content trong ví dụ mẫu).`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                config: {
                    systemInstruction: "Bạn là chuyên gia thu thập dữ liệu (Web Scraper). Bạn chỉ trả về chuỗi JSON hợp lệ, không giải thích gì thêm."
                }
            });

            if (response && response.candidates && response.candidates.length > 0) {
                let content = response.candidates[0].content.parts[0].text;
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                let data = JSON.parse(content);

                this.sitemapForm.patchValue({
                    root_domain: data.root_domain || this.sitemapFormDefaults.root_domain,
                    main_class: data.main_class || this.sitemapFormDefaults.main_class,
                    next_navigation_class: data.next_navigation_class || this.sitemapFormDefaults.next_navigation_class,
                    href_contain_str: data.href_contain_str || this.sitemapFormDefaults.href_contain_str,
                    request: data.request || this.sitemapFormDefaults.request
                });

                this.toastr.success('AI đã phân tích và điền tự động cấu hình!', 'Thành công');
            } else {
                this.toastr.error('AI không trả về kết quả hợp lệ.', 'Lỗi');
            }
        } catch (e) {
            console.error(e);
            this.toastr.error('Có lỗi xảy ra khi gọi AI.', 'Lỗi');
        } finally {
            this.aiLoading = false;
            this.cd.markForCheck();
        }
    }

    /**
     * Constructor
     */
    constructor(
        // private http: HttpClient,
        private _crawlService: CrawlService,
        private _formBuilder: UntypedFormBuilder,
        private toastr: ToastrService,
        private _userService: UserService,
        private cd: ChangeDetectorRef,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private sanitizer: DomSanitizer,
        private _router: Router,
        private titleService: Title,
        private _genaiService: GenaiService
    ) {
        this.titleService.setTitle(`tự động cào bài | ai.type - công cụ tạo content`);

        // Prepare the search form with defatự động cào bàiults
        this.sitemapForm = this._formBuilder.group({
            domain: [this.sitemapFormDefaults.domain],
            main_class: [this.sitemapFormDefaults.main_class],
            href_contain_str: [this.sitemapFormDefaults.href_contain_str],
            next_navigation_class: [this.sitemapFormDefaults.next_navigation_class],
            href_except_contain_str: [this.sitemapFormDefaults.href_except_contain_str],
            root_domain: [this.sitemapFormDefaults.root_domain],
            page_domain: [this.sitemapFormDefaults.page_domain],
            request: [this.sitemapFormDefaults.request],
            is_auto_start: [this.sitemapFormDefaults.is_auto_start]
        });

        // Set the defaults
        this.animationStates = {
            shake: {
                shake: false
            }
        };

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

                if (user.reputation < 10000) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }
            });
    }

    /**
     * On init
     */
    ngOnInit(): void {
        let history_blog_crawling = localStorage.getItem('history_blog_crawling');
        let history_blog_crawled = localStorage.getItem('history_blog_crawled');
        let history_crawler_form = localStorage.getItem('history_crawler_form');
        let history_error_links = localStorage.getItem('history_error_links');

        // Fill the form with the values from query
        if (history_crawler_form) {
            history_crawler_form = JSON.parse(history_crawler_form);

            this.sitemapForm.setValue({
                domain: history_crawler_form['domain'],
                main_class: history_crawler_form['main_class'],
                href_contain_str: history_crawler_form['href_contain_str'],
                next_navigation_class: history_crawler_form['next_navigation_class'],
                href_except_contain_str: history_crawler_form['href_except_contain_str'],
                root_domain: history_crawler_form['root_domain'],
                page_domain: history_crawler_form['page_domain'],
                request: history_crawler_form['request'],
                is_auto_start: history_crawler_form['is_auto_start']
            }, { emitEvent: false });
        }

        // neu domain da duoc crawl thi set vao
        if (history_blog_crawled) {
            this.domains = JSON.parse(history_blog_crawled);
        }

        // neu domain dang duoc crawl thi set vao
        if (history_blog_crawling) {
            let arr = history_blog_crawling.split(';');
            this.sitemapForm.controls['domain'].setValue(arr.join("\r\n"));
        }

        // neu link loi ton tai thi set vao
        if (history_error_links) {
            this.links = JSON.parse(history_error_links);
        }

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    /**
     * On destroy
     */
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
            this._router.navigate(['/sign-out']);
        });
    }
}
