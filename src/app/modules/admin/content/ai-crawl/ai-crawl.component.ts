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

    sitemapForm: UntypedFormGroup;
    sitemapFormDefaults: any = {
        domain: 'https://wiki.nhanhoa.com/chuyen-muc/thu-thuat-wordpress/page/1/',
        main_class: '#tessera-main-wrapper .container .row .col-xl-9',
        ai_main_class: '',
        href_except_contain_str: '',
        href_contain_str: '/kb/',
        next_navigation_class: '.tessera-pager .pagination',
        root_domain: '',
        page_domain: '',
        request: 'h1|#tessera-post-wrapper\nh2|#tessera-post-wrapper\nh3|#tessera-post-wrapper\nh4|#tessera-post-wrapper\nh5|#tessera-post-wrapper\np|#tessera-post-wrapper\nspan|#tessera-post-wrapper\nlabel|#tessera-post-wrapper\ntable|#tessera-post-wrapper\nimg,data-lazy-src+title+alt|#tessera-post-wrapper\niframe,data-lazy-src|#tessera-post-wrapper\na,href+title|#tessera-post-wrapper\nli|#tessera-post-wrapper\ntitle|html > head\nmeta,content:name|html > head\nmeta,content:property|html > head',
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

    createMainClassGroup(): FormGroup {
        return this._formBuilder.group({
            key: [''],
            value: ['']
        });
    }

    get mainClassArray(): FormArray {
        return this.sitemapForm.get('ai_main_class') as FormArray;
    }

    addMainClassField(): void {
        this.mainClassArray.push(this.createMainClassGroup());
    }

    removeMainClassField(index: number): void {
        this.mainClassArray.removeAt(index);
    }

    async scanNow() {
        this.arr = this.sitemapForm.controls['domain'].value.split(/\r?\n|\r|\n/g);

        // Tạo uniqueID mỗi lần chụp
        const uniqueID = Math.random().toString(36).substr(2, 9);
        const data = {
            url: this.arr[0],
            command: 'website-crawl',
            uniqueID,
            facegroup: 'yourgroupid',
            maxPosts: 3,
            cookiePath: this.fbCookiePath, // Đường dẫn file cookie .json đã lưu
            selector: this.sitemapForm.controls['ai_main_class'].value,
        };

        console.log('test', data);

        // await (window as any).electron.tools(data);
    }

    test() {
        console.log(this.sitemapForm.controls['ai_main_class'].value);
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
        private titleService: Title
    ) {
        this.titleService.setTitle(`tự động cào bài | ai.type - công cụ tạo content`);

        // Prepare the search form with defatự động cào bàiults
        this.sitemapForm = this._formBuilder.group({
            domain: [this.sitemapFormDefaults.domain],
            main_class: [this.sitemapFormDefaults.main_class],
            ai_main_class: this._formBuilder.array([
                this.createMainClassGroup()
            ]),
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
                ai_main_class: history_crawler_form['ai_main_class'],
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
