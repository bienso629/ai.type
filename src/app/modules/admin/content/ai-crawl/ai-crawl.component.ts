import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { FormArray, FormGroup, UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, timeout } from 'rxjs';
import { CrawlService } from 'app/_services/crawl';
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

import _ from 'lodash';

@Component({
    selector: 'ai-crawl',
    templateUrl: './ai-crawl.component.html',
    providers: [CrawlService],
    animations: fuseAnimations,
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
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
                    show: false,
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
     * Tự phân tích HTML để trích xuất link bài viết và link phân trang
     */
    private extractLinksFromHtml(html: string, options: any): { href_data: any[], href_navigation_data: any[] } {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const main_class = (options.main_class || '').trim();
        const next_navigation_class = (options.next_navigation_class || '').trim();
        const href_contain_str = (options.href_contain_str || '').trim();
        const href_except_contain_str = (options.href_except_contain_str || '').trim();
        const root_domain = (options.root_domain || '').trim().replace(/\/+$/, '');
        const page_domain = (options.page_domain || '').trim().replace(/\/+$/, '');

        const href_data: any[] = [];
        const href_navigation_data: any[] = [];

        // 1. Trích xuất danh sách link bài viết
        let articleAnchors: Element[] = [];
        if (main_class) {
            try {
                const containers = doc.querySelectorAll(main_class);
                containers.forEach(ct => {
                    const anchors = ct.querySelectorAll('a');
                    anchors.forEach(a => articleAnchors.push(a));
                });
            } catch (e) {
                console.error('Invalid selector main_class:', main_class, e);
            }
        }
        if (articleAnchors.length === 0) {
            articleAnchors = Array.from(doc.querySelectorAll('article a, .post-item a, .blog-post a, .entry-title a, a'));
        }

        const seenUrls = new Set<string>();
        articleAnchors.forEach(el => {
            let rawHref = el.getAttribute('href');
            if (!rawHref) return;
            rawHref = rawHref.trim();
            if (rawHref === '#' || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;

            let fullUrl = rawHref;
            if (fullUrl.startsWith('//')) {
                fullUrl = 'https:' + fullUrl;
            } else if (fullUrl.startsWith('/')) {
                fullUrl = (root_domain || page_domain) + fullUrl;
            } else if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                fullUrl = (root_domain || page_domain) + '/' + fullUrl;
            }

            if (href_contain_str && !fullUrl.includes(href_contain_str)) return;
            if (href_except_contain_str && fullUrl.includes(href_except_contain_str)) return;

            if (!seenUrls.has(fullUrl)) {
                seenUrls.add(fullUrl);
                href_data.push({ url: fullUrl });
            }
        });

        // 2. Trích xuất danh sách link phân trang
        if (next_navigation_class) {
            try {
                const navContainers = doc.querySelectorAll(next_navigation_class);
                navContainers.forEach(nc => {
                    const anchors = nc.querySelectorAll('a');
                    anchors.forEach(a => {
                        let navHref = a.getAttribute('href');
                        if (!navHref) return;
                        navHref = navHref.trim();
                        if (navHref === '#' || navHref.startsWith('javascript:')) return;

                        let fullNavUrl = navHref;
                        if (fullNavUrl.startsWith('//')) {
                            fullNavUrl = 'https:' + fullNavUrl;
                        } else if (fullNavUrl.startsWith('/')) {
                            fullNavUrl = (page_domain || root_domain) + fullNavUrl;
                        } else if (!fullNavUrl.startsWith('http://') && !fullNavUrl.startsWith('https://')) {
                            fullNavUrl = (page_domain || root_domain) + '/' + fullNavUrl;
                        }

                        href_navigation_data.push({ url: fullNavUrl });
                    });
                });
            } catch (e) {
                console.error('Invalid selector next_navigation_class:', next_navigation_class, e);
            }
        }

        return { href_data, href_navigation_data };
    }

    /**
     * Bóc tách chi tiết node theo quy tắc request
     */
    private extractNodeFromHtml(html: string, rulesStr: string, pageUrl: string): any {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const lines = (rulesStr || '').split(/\r?\n|\r|\n/g);
        const result: any = {};

        for (let line of lines) {
            if (!line || !line.trim()) continue;
            const parts = line.split('|');
            const tagDef = parts[0].trim();
            const selector = (parts[1] || '').trim();
            const tagParts = tagDef.split(',');
            const tagName = tagParts[0].trim();
            const attrs = tagParts[1] ? tagParts[1].trim() : '';

            if (!result[tagName]) result[tagName] = [];

            try {
                const fullSelector = selector ? `${selector} ${tagName}` : tagName;
                const elements = doc.querySelectorAll(fullSelector);
                elements.forEach(wrapper => {
                    let val: any = null;
                    if (attrs) {
                        if (attrs.includes(':')) {
                            const [attrVal, attrKey] = attrs.split(':');
                            const k = wrapper.getAttribute(attrKey);
                            const v = wrapper.getAttribute(attrVal);
                            if (k) val = { [k]: v };
                        } else if (attrs.includes('+')) {
                            const attrList = attrs.split('+');
                            const obj: any = {};
                            attrList.forEach(a => {
                                const attrVal = wrapper.getAttribute(a);
                                if (attrVal) obj[a] = attrVal;
                            });
                            if (['img', 'iframe', 'source'].includes(tagName)) {
                                obj['src'] = wrapper.getAttribute('src') || wrapper.getAttribute('data-src') || wrapper.getAttribute('data-lazy-src') || '';
                            }
                            if (tagName === 'a') {
                                obj['text'] = wrapper.textContent?.trim() || '';
                            }
                            val = obj;
                        } else {
                            val = wrapper.getAttribute(attrs);
                        }
                    } else {
                        if (tagName === 'table') {
                            val = wrapper.outerHTML.replace(/(\r\n|\n|\r)/gm, '');
                        } else {
                            val = wrapper.textContent?.trim() || '';
                        }
                    }
                    if (val != null) {
                        result[tagName].push(val);
                    }
                });
            } catch (err) {
                console.error('Error querying selector:', line, err);
            }
        }

        // Lấy tiêu đề dự phòng
        let title = result.title && result.title.length > 0 ? result.title[0] : '';
        if (!title) {
            const h1El = doc.querySelector('h1');
            if (h1El) title = h1El.textContent?.trim() || '';
        }
        if (!title) {
            title = doc.querySelector('title')?.textContent?.trim() || pageUrl;
        }

        return {
            title: title,
            url: pageUrl,
            heading: {
                h1: result.h1 || [],
                h2: result.h2 || [],
                h3: result.h3 || [],
                h4: result.h4 || [],
                h5: result.h5 || []
            },
            p: result.p || [],
            a: result.a || [],
            img: result.img || [],
            source: result.source || [],
            others: {
                pre: result.pre || [],
                iframe: result.iframe || [],
                table: result.table || [],
                label: result.label || [],
                span: result.span || [],
                i: result.i || [],
                li: result.li || [],
                td: result.td || [],
                dd: result.dd || []
            },
            meta: result.meta || []
        };
    }

    /**
     * Tu domain me tim kiem cac link lien quan
     * Cang nhieu domain me thi tim kiem cang nhanh
     */
    async createSitemap() {
        const rawDomains = this.sitemapForm.controls['domain'].value;
        if (!rawDomains || !rawDomains.trim()) {
            this.toastr.warning('Vui lòng nhập ít nhất một URL cần thu thập.', 'Thiếu URL');
            return;
        }

        this.arr = rawDomains.split(/\r?\n|\r|\n/g).map((s: string) => s.trim()).filter((s: string) => !!s);
        if (this.arr.length === 0) return;

        const currentTargetDomain = this.arr[0];
        const dataForm = {
            "domain": currentTargetDomain,
            "main_class": this.sitemapForm.controls['main_class'].value,
            "href_except_contain_str": this.sitemapForm.controls['href_except_contain_str'].value,
            "href_contain_str": this.sitemapForm.controls['href_contain_str'].value,
            "next_navigation_class": this.sitemapForm.controls['next_navigation_class'].value,
            "root_domain": this.sitemapForm.controls['root_domain'].value,
            "page_domain": this.sitemapForm.controls['page_domain'].value
        };

        const handleSitemapResult = (result: any) => {
            if (result && result.href_data && result.href_data.length > 0) {
                this.saveForm();

                // lấy links mới đè lên links cũ
                this.links = this.links.concat(result.href_data);
                this.links = _.uniqBy(this.links, 'url');

                // luu lai nhung domain da lam viec
                const index = _.findIndex(this.domains, { 'url': currentTargetDomain });
                if (index < 0) {
                    this.domains.push({
                        url: currentTargetDomain
                    });
                }
                this.domains = _.uniqBy(this.domains, 'url');

                if (result.href_navigation_data && result.href_navigation_data.length > 0) {
                    result.href_navigation_data.map((item: any) => {
                        this.arr.push(item.url);
                    });
                }

                // kiểm tra danh sách và loại bỏ domain đã quét
                if (this.arr && this.arr.length > 0) {
                    this.arr = _.uniq(this.arr);
                    _.remove(this.arr, (n) => {
                        for (let i = 0; i < this.domains.length; i++) {
                            if (n === this.domains[i].url) {
                                return true;
                            }
                        }
                        return false;
                    });

                    // cập nhật lại danh sách quét link trên form
                    this.sitemapForm.controls['domain'].setValue(this.arr.join("\n"));
                    localStorage.setItem('history_blog_crawling', this.arr.join(';'));
                    localStorage.setItem('history_blog_crawled', JSON.stringify(this.domains));
                    this.generateDownloadJsonUri();
                }

                this.toastr.success(`Đã tìm thấy ${result.href_data.length} links`, 'Thu thập thành công');

                // chay tiep neu con domain
                if (this.arr.length > 0) {
                    this.createSitemap();
                }

                this.cd.markForCheck();
            } else {
                this.toastr.warning('Không tìm thấy link bài viết nào khớp với selector.', 'Kết quả trống');
            }
        };

        // Ưu tiên cào trực tiếp qua Electron IPC nếu có sẵn
        const electron = (window as any).electron;
        if (electron && electron.invoke) {
            try {
                const htmlRes = await electron.invoke('ai:fetch-html', currentTargetDomain);
                if (htmlRes && htmlRes.success && htmlRes.html) {
                    const localResult = this.extractLinksFromHtml(htmlRes.html, dataForm);
                    handleSitemapResult(localResult);
                    return;
                }
            } catch (err) {
                console.warn('Electron direct fetch failed, fallback to crawlService:', err);
            }
        }

        // Fallback gọi service puppeteer / restful-api
        this._crawlService.createSitemap(dataForm)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.href_data && result.href_data.length > 0) {
                        handleSitemapResult(result);
                    } else {
                        // Thử fetch trực tiếp nếu server trả về lỗi token hoặc rỗng
                        if (electron && electron.invoke) {
                            try {
                                const htmlRes = await electron.invoke('ai:fetch-html', currentTargetDomain);
                                if (htmlRes && htmlRes.success && htmlRes.html) {
                                    const localResult = this.extractLinksFromHtml(htmlRes.html, dataForm);
                                    handleSitemapResult(localResult);
                                    return;
                                }
                            } catch (e) {}
                        }
                        this.toastr.error('Không tìm thấy dữ liệu liên kết từ địa chỉ này.', 'Quét lại');
                    }
                },
                error: async (e: any) => {
                    console.log('crawlService createSitemap error:', e);
                    // Fallback thử Electron trực tiếp
                    if (electron && electron.invoke) {
                        try {
                            const htmlRes = await electron.invoke('ai:fetch-html', currentTargetDomain);
                            if (htmlRes && htmlRes.success && htmlRes.html) {
                                const localResult = this.extractLinksFromHtml(htmlRes.html, dataForm);
                                handleSitemapResult(localResult);
                                return;
                            }
                        } catch (err) {}
                    }
                    this.toggleAnimationState('shake.shake', false, true, 150);
                    this.toastr.error('Lỗi khi thu thập sitemap từ máy chủ.', 'Lỗi kết nối');
                },
                complete: () => { }
            });
    }

    /**
     * Tiếp tục nhân rộng sitemap
     * Luu tru thong tin doanh nghiep / bai viet
     */
    async crawlCompany(link?: string) {
        if (!this.links || this.links.length === 0) {
            this.toastr.info('Danh sách link đã quét xong.', 'Hoàn thành');
            return;
        }

        const targetUrl = link ? link : this.links[0].url;
        const requestRules = this.sitemapForm.controls['request'].value;
        const electron = (window as any).electron;

        // Ưu tiên cào nội dung trực tiếp bằng Electron IPC
        if (electron && electron.invoke) {
            try {
                const htmlRes = await electron.invoke('ai:fetch-html', targetUrl);
                if (htmlRes && htmlRes.success && htmlRes.html) {
                    const nodeResult = this.extractNodeFromHtml(htmlRes.html, requestRules, targetUrl);
                    if (nodeResult && nodeResult.title) {
                        this.storeNodeNoRequest(targetUrl, nodeResult);
                        return;
                    }
                }
            } catch (err) {
                console.warn('Electron direct fetch article failed, fallback to crawlService:', err);
            }
        }

        // Fallback gọi crawlService
        this._crawlService.crawlCompany({
            url: targetUrl,
            request: requestRules,
            username: this.user ? this.user.name : 'admin'
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: ((result: any) => {
                    if (result && result.title) {
                        this.storeNodeNoRequest(targetUrl, result);
                    } else {
                        this.toastr.error('Link không được phân tích', `Quét lại`);
                    }
                }),
                error: (e: any) => {
                    this.toggleAnimationState('shake.shake', false, true, 150);
                },
                complete: () => { }
            });
    }

    storeNodeNoRequest(url: string, node: any) {
        this._crawlService.storeNode({
            url: url,
            type: 'norequest',
            node: node,
            username: this.user ? this.user.name : 'admin'
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: ((result: any) => {
                    if (result) {
                        this.links.splice(0, 1);
                        this.links = [...this.links];

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

    selectorPanelOpened: boolean = true;
    rulesPanelOpened: boolean = false;

    async autoConfigByAI() {
        let rawUrl = this.sitemapForm.controls['domain'].value;
        if (!rawUrl || !rawUrl.trim()) {
            this.toastr.warning('Vui lòng nhập URL cần thu thập dữ liệu trước.');
            return;
        }

        // Lấy dòng URL đầu tiên nếu người dùng dán nhiều dòng
        const firstLineUrl = rawUrl.trim().split(/\r?\n|\r|\n/)[0].trim();
        if (!firstLineUrl) {
            this.toastr.warning('Vui lòng nhập URL hợp lệ.');
            return;
        }

        let parsedOrigin = '';
        try {
            parsedOrigin = new URL(firstLineUrl).origin;
        } catch (_) {}

        this.aiLoading = true;
        this.cd.markForCheck();

        try {
            let htmlContext = '';
            let candidateSelectors: string[] = [];
            let paginationCandidates: string[] = [];

            if ((window as any).electron) {
                try {
                    const htmlRes = await (window as any).electron.invoke('ai:fetch-html', firstLineUrl);
                    if (htmlRes && htmlRes.success && htmlRes.html) {
                        const doc = new DOMParser().parseFromString(htmlRes.html, 'text/html');

                        // Tìm các ứng viên tiềm năng cho main_class (thẻ bọc nhiều link bài viết / article)
                        const articles = doc.querySelectorAll('article');
                        if (articles.length > 0) {
                            const parent = articles[0].parentElement;
                            if (parent) {
                                if (parent.id) candidateSelectors.push('#' + parent.id);
                                if (parent.className) {
                                    const cls = Array.from(parent.classList).filter(c => !c.match(/^(col|row|container|grid)/i)).join('.');
                                    if (cls) candidateSelectors.push('.' + cls);
                                }
                            }
                        }

                        // Tìm các ứng viên tiềm năng cho next_navigation_class
                        const pagEls = doc.querySelectorAll('[class*="page"], [class*="pagination"], [class*="nav-links"], [class*="pager"]');
                        pagEls.forEach(el => {
                            if (el.tagName.toLowerCase() === 'ul' || el.tagName.toLowerCase() === 'nav' || el.tagName.toLowerCase() === 'div') {
                                if (el.id) paginationCandidates.push('#' + el.id);
                                if (el.className && typeof el.className === 'string') {
                                    const mainCls = el.className.split(/\s+/).filter(c => c && !c.match(/^(text|flex|relative|col|row)/i)).slice(0, 2).join('.');
                                    if (mainCls) paginationCandidates.push('.' + mainCls);
                                }
                            }
                        });

                        // Xoá các thẻ không cần thiết để tiết kiệm token
                        const tagsToRemove = ['script', 'style', 'svg', 'noscript', 'iframe', 'header', 'footer', 'meta', 'link'];
                        tagsToRemove.forEach(tag => {
                            const elements = doc.getElementsByTagName(tag);
                            for (let i = elements.length - 1; i >= 0; i--) { elements[i].remove(); }
                        });

                        // Lấy phần body hoặc main
                        const mainContent = doc.querySelector('main') || doc.querySelector('#main') || doc.querySelector('#content') || doc.body;
                        htmlContext = mainContent ? mainContent.innerHTML : doc.body.innerHTML;
                        htmlContext = htmlContext.substring(0, 250000);
                    } else if (htmlRes && !htmlRes.success) {
                        this.toastr.error('Lỗi khi tải trang: ' + htmlRes.error);
                    }
                } catch (error) {
                    this.toastr.error("Lỗi IPC: " + error.message);
                }
            } else {
                this.toastr.error('Môi trường hiện tại không hỗ trợ Electron IPC. Vui lòng chạy trên App!');
            }

            if (!htmlContext || htmlContext.trim() === '') {
                this.toastr.warning('Không tải được HTML của trang web để phân tích.');
                this.aiLoading = false;
                this.cd.markForCheck();
                return;
            }

            const candidatesHint = candidateSelectors.length > 0 ? `Gợi ý thẻ bọc danh sách bài viết phát hiện được: ${candidateSelectors.join(', ')}` : '';
            const pagHint = paginationCandidates.length > 0 ? `Gợi ý thẻ bọc phân trang phát hiện được: ${paginationCandidates.join(', ')}` : '';

            const prompt = `Bạn là một chuyên gia Web Scraping dày dạn kinh nghiệm. Nhiệm vụ của bạn là phân tích HTML thực tế của trang danh sách/chuyên mục sau: ${firstLineUrl}
${candidatesHint}
${pagHint}

Dưới đây là một phần mã nguồn HTML THỰC TẾ của trang web:
\`\`\`html
${htmlContext}
\`\`\`

YÊU CẦU PHÂN TÍCH VÀ TRẢ VỀ JSON:
1. "root_domain": Domain gốc (VD: ${parsedOrigin || 'https://domain.com'}).
2. "main_class": CSS Selector CHÍNH XÁC của thẻ cha TRỰC TIẾP hoặc GẦN NHẤT bao bọc toàn bộ danh sách các bài viết / thẻ article trong trang.
   - Thường là một thẻ có ID đặc trưng (VD: #post-list, #posts, #main-posts) hoặc class ngữ nghĩa đặc trưng (VD: .post-list, .blog-posts, .archive-posts, .list-posts).
   - TUYỆT ĐỐI KHÔNG lấy các thẻ container layout chung chung như "body", "#main", "#primary", "#content", ".container", ".row", ".col-12", ".col-lg-9".
   - Hãy tìm thẻ div/ul/section nào là cha trực tiếp chứa các thẻ <article> hoặc các thẻ item bài viết.
3. "next_navigation_class": CSS Selector của thẻ bao bọc TOÀN BỘ các nút/số phân trang (VD: ul.page-numbers, .nav-pagination, .pagination, .page-numbers, .nav-links, .wp-pagenavi).
   - LƯU Ý: Không chọn thẻ a cụ thể của trang 2 hay nút next, mà chọn thẻ bao ngoài danh sách phân trang. Nếu trang không có phân trang, để trống chuỗi "".
4. "page_domain": Nếu link phân trang là dạng rút gọn hoặc đường dẫn relative (VD: /huong-dan/page/2), hãy điền domain gốc hoặc prefix URL để ghép (VD: ${parsedOrigin}), nếu không cần thì để trống "".
5. "href_contain_str": Chuỗi nhận diện chung trong đường dẫn các bài viết cần cào (VD: .html, /bai-viet/, /post/, hoặc để trống "" nếu các bài viết nằm trực tiếp dưới domain).
6. "request": Quy tắc lấy nội dung chi tiết bài viết (giữ theo cú pháp <the>|<selector_noi_dung_bai_viet>). Thẻ bọc nội dung bài viết phổ biến thường là .entry-content, .post-content, .article-content, .detail-content:
h1|.entry-content
h2|.entry-content
h3|.entry-content
h4|.entry-content
h5|.entry-content
p|.entry-content
span|.entry-content
label|.entry-content
table|.entry-content
img,data-lazy-src+data-src+src+title+alt|.entry-content
iframe,data-lazy-src+src|.entry-content
a,href+title|.entry-content
li|.entry-content
title|html > head
meta,content:name|html > head
meta,content:property|html > head

Trả về CHÍNH XÁC một đối tượng JSON (không bọc trong markdown hay lời giải thích nào khác):
{
  "root_domain": "...",
  "main_class": "...",
  "next_navigation_class": "...",
  "page_domain": "...",
  "href_contain_str": "...",
  "request": "..."
}`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                config: {
                    systemInstruction: "Bạn là chuyên gia phân tích cấu trúc DOM và Web Scraping. Bạn chỉ trả về duy nhất chuỗi JSON hợp lệ, không có giải thích, không có chữ thừa."
                }
            });

            if (response && response.candidates && response.candidates.length > 0) {
                let content = response.candidates[0].content.parts[0].text;
                content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    content = jsonMatch[0];
                }
                const data = JSON.parse(content);

                this.sitemapForm.patchValue({
                    root_domain: data.root_domain || parsedOrigin || this.sitemapFormDefaults.root_domain,
                    main_class: data.main_class || this.sitemapFormDefaults.main_class,
                    next_navigation_class: data.next_navigation_class || this.sitemapFormDefaults.next_navigation_class,
                    page_domain: data.page_domain || this.sitemapFormDefaults.page_domain,
                    href_contain_str: data.href_contain_str || this.sitemapFormDefaults.href_contain_str,
                    request: data.request || this.sitemapFormDefaults.request
                });

                // Tự động mở panel SELECTOR để người dùng thấy ngay kết quả
                this.selectorPanelOpened = true;

                this.toastr.success('AI đã phân tích và tìm đúng các selector!', 'Thành công');
            } else {
                this.toastr.error('AI không trả về kết quả hợp lệ.', 'Lỗi');
            }
        } catch (e) {
            console.error(e);
            this.toastr.error('Có lỗi xảy ra khi gọi AI: ' + (e?.message || e), 'Lỗi');
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
