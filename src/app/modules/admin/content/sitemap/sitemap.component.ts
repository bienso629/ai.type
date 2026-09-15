import {
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    TemplateRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

import { ColumnMode, DatatableComponent } from '@swimlane/ngx-datatable';
import { WP2MDService } from 'app/_services/wp2md';
import { DomainService } from 'app/_services/domain';
import { WordpressService } from 'app/_services/wordpress';
import { CrawlService } from 'app/_services/crawl';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { FuseLoadingService } from '@fuse/services/loading';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';

import * as xml2js from 'xml2js';

@Component({
    selector: 'sitemap',
    styleUrls: ['./sitemap.component.scss'],
    templateUrl: './sitemap.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [WP2MDService, DomainService, WordpressService, CrawlService],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class SitemapComponent implements OnInit, OnDestroy {
    xml: any;
    config: AppConfig;
    user: User;
    isLinear = false;

    @ViewChild('stepper') stepper: any;
    @ViewChild('table') table: DatatableComponent;
    @ViewChild('domainConfigDialogTemplate')
    domainConfigDialogTemplate: TemplateRef<any>;
    domainConfigDialogRef: MatDialogRef<any>;
    configDomainData: any = {
        domain: '',
        username: '',
        password: '',
        _showPassword: false,
    };

    editing = {};
    rows = [];
    links = [];

    downloadJsonHref: any;
    ColumnMode = ColumnMode;

    domains: any[] = [];
    selectedDomain: any;
    posts: any[] = [];
    selected: any[] = [];

    keyword: string = '';
    categories: any[] = [];
    selectedCategory: any = '';
    selectedStatus: string = 'all'; // 'all' (cả publish và draft), 'publish', 'draft'

    compareDomainFn(d1: any, d2: any): boolean {
        if (!d1 || !d2) return d1 === d2;
        const cleanD1 = ((typeof d1 === 'string' ? d1 : d1.domain) || '')
            .replace(/^(https?:\/\/)?(www\.)?/, '')
            .split('/')[0];
        const cleanD2 = ((typeof d2 === 'string' ? d2 : d2.domain) || '')
            .replace(/^(https?:\/\/)?(www\.)?/, '')
            .split('/')[0];
        return cleanD1 === cleanD2;
    }

    cleanDomain(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }

    onDomainChange(event: any) {
        this.selectedDomain = event.value;
        localStorage.setItem(
            'sitemap_selected_domain',
            this.selectedDomain.domain,
        );
        this.keyword = '';
        this.selectedCategory = '';
        this.categories = [];
        this.fetchCategories();
        this.fetchPosts();
    }

    onSelect({ selected }: any) {
        this.selected = Array.isArray(selected)
            ? selected.filter((p) => !!p && typeof p === 'object')
            : [];
    }

    page: number = 1;
    loadingPosts: boolean = false;
    hasMorePosts: boolean = true;

    fetchPosts(reset: boolean = true) {
        if (!this.selectedDomain) return;

        if (reset) {
            this.page = 1;
            this.hasMorePosts = true;
            this.posts = [];
        }

        if (!this.hasMorePosts || this.loadingPosts) return;

        this.loadingPosts = true;
        this._fuseLoadingService.show();
        this.cd.markForCheck();

        let hostname = '';
        try {
            hostname = new URL(this.selectedDomain.domain).hostname;
        } catch (e) {
            hostname = this.selectedDomain.domain;
        }

        const username =
            this.selectedDomain.wp_username || this.selectedDomain.username;
        const apppass =
            this.selectedDomain.wp_password || this.selectedDomain.password;

        const queryPayload: any = {
            domain: this.selectedDomain.domain,
            domain_id: this.selectedDomain._id,
            sys_username: this.selectedDomain.sys_username,
            year: this.selectedDomain.year,
            page: this.page,
            per_page: 20,
            username: username,
            apppass: apppass,
        };

        // Luôn luôn lấy tất cả các trạng thái bài viết (publish, draft, pending, trash)
        queryPayload.status = ['publish', 'draft', 'pending', 'trash'];
        queryPayload.context = 'edit';

        if (this.keyword && this.keyword.trim() !== '') {
            queryPayload.keyword = this.keyword.trim();
        }

        if (this.selectedCategory) {
            queryPayload.category = this.selectedCategory;
        }

        this._wordpressService
            .posts(queryPayload)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    this.loadingPosts = false;
                    this._fuseLoadingService.hide();
                    if (result && Array.isArray(result)) {
                        if (result.length < 20) {
                            this.hasMorePosts = false;
                        }
                        const newPosts = result.map((doc: any) => ({
                            title: this.decodeHTMLEntities(
                                doc.title?.rendered || doc.title || '',
                            ),
                            link: doc.link || doc.url || '',
                            date: doc.date || new Date().toISOString(),
                            content: doc.content?.rendered || '',
                            thumbnail:
                                doc._embedded?.['wp:featuredmedia']?.[0]
                                    ?.source_url || '',
                            status: doc.status || 'publish',
                            id: doc.id,
                            domain: this.selectedDomain.domain,
                            wp_username: this.selectedDomain.username,
                            wp_password: this.selectedDomain.password,
                        }));

                        if (reset) {
                            this.posts = newPosts;
                        } else {
                            // Loại bỏ trùng lặp id khi phân trang
                            const existingIds = new Set(
                                this.posts.map((p) => p.id),
                            );
                            const uniqueNew = newPosts.filter(
                                (p: any) => !existingIds.has(p.id),
                            );
                            this.posts = [...this.posts, ...uniqueNew];
                        }
                    } else {
                        this.hasMorePosts = false;
                        if (reset) {
                            this.posts = [];
                        }
                    }
                    this.cd.markForCheck();
                    setTimeout(() => {
                        if (
                            this.table &&
                            typeof this.table.recalculate === 'function'
                        ) {
                            this.table.recalculate();
                        }
                    }, 100);
                },
                error: () => {
                    this.loadingPosts = false;
                    this._fuseLoadingService.hide();
                    if (reset) {
                        this.posts = [];
                    }
                    this.cd.markForCheck();
                },
            });
    }

    loadMorePosts() {
        if (!this.loadingPosts && this.hasMorePosts) {
            this.page++;
            this.fetchPosts(false);
        }
    }

    onScroll(event: any) {
        if (!event) return;
        const dtBody = document.querySelector('.datatable-body');
        const scrollHeight = dtBody
            ? dtBody.scrollHeight
            : this.posts.length * 50;
        const clientHeight = dtBody ? dtBody.clientHeight : 700;
        const offsetY =
            event.offsetY !== undefined
                ? event.offsetY
                : event.target
                  ? event.target.scrollTop
                  : dtBody
                    ? dtBody.scrollTop
                    : 0;

        // Kích hoạt loadmore khi cuộn xuống gần cuối danh sách (cách đáy dưới 350px hoặc vượt qua 50% nội dung có thể cuộn)
        const maxScroll = scrollHeight - clientHeight;
        if (
            offsetY > 30 &&
            (offsetY + 350 >= maxScroll ||
                (maxScroll > 0 && offsetY >= maxScroll * 0.5))
        ) {
            this.loadMorePosts();
        }
    }

    fetchCategories() {
        if (!this.selectedDomain) return;

        this._wordpressService
            .categories({
                domain: this.selectedDomain.domain,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    if (result && Array.isArray(result)) {
                        this.categories = result;
                    } else {
                        this.categories = [];
                    }
                    this.cd.markForCheck();
                },
                error: () => {
                    this.categories = [];
                    this.cd.markForCheck();
                },
            });
    }

    editPost(row: any) {
        this._crawlService
            .archiveWpCheck({
                wp_post_id: row.id,
                wp_domain: row.domain,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    if (
                        result &&
                        result.success &&
                        result.data &&
                        result.data.uuid
                    ) {
                        this.router.navigate([
                            '/ai-writer',
                            this.user.name,
                            result.data.uuid,
                        ]);
                    } else {
                        this.router.navigate(['/ai-writer'], {
                            state: { wpPost: row },
                        });
                    }
                },
                error: () => {
                    this.router.navigate(['/ai-writer'], {
                        state: { wpPost: row },
                    });
                },
            });
    }

    async publishSelectedPosts() {
        if (!this.selected || this.selected.length === 0) return;

        const validSelected = this.selected.filter((p) => !!p && p.id);
        const postsToPublish = validSelected.filter(
            (post) => post.status !== 'publish',
        );

        if (postsToPublish.length === 0) {
            this.toastr.info('Tất cả bài viết đã được publish!');
            return;
        }

        this.loadingPosts = true;
        this.cd.detectChanges();

        const username =
            this.selectedDomain.wp_username || this.selectedDomain.username;
        const apppass =
            this.selectedDomain.wp_password || this.selectedDomain.password;

        const publishTasks = postsToPublish.map((post) => {
            const dataForm = {
                id: post.id,
                status: 'publish',
                domain: this.selectedDomain.domain,
                domain_id: this.selectedDomain._id,
                sys_username: this.selectedDomain.sys_username,
                year: this.selectedDomain.year,
                username: username,
                apppass: apppass,
            };
            return firstValueFrom(this._wordpressService.update_post(dataForm));
        });

        try {
            const results = await Promise.all(publishTasks);
            const successfulPosts: any[] = [];
            const failedErrors: string[] = [];

            results.forEach((r, idx) => {
                if (r && r.success === false) {
                    failedErrors.push(r.error || 'Thất bại');
                } else if (r && (r.id || r.status === 'publish' || r.data)) {
                    successfulPosts.push(postsToPublish[idx]);
                } else if (!r) {
                    failedErrors.push('Không nhận được phản hồi từ WordPress');
                }
            });

            if (successfulPosts.length > 0) {
                this.toastr.success(
                    `Đã publish thành công ${successfulPosts.length} bài viết!`,
                );
                const updatedIds = successfulPosts.map((p) => p.id);
                this.posts = this.posts.map((p) => {
                    if (updatedIds.includes(p.id)) {
                        return { ...p, status: 'publish' };
                    }
                    return p;
                });
                this.posts = [...this.posts];
            }

            if (failedErrors.length > 0) {
                const firstErr = failedErrors[0];
                if (
                    firstErr.includes('401') ||
                    firstErr.includes('not allowed to edit') ||
                    firstErr.includes('rest_cannot_edit')
                ) {
                    this.toastr.error(
                        `WordPress từ chối (401): Mật khẩu ứng dụng chưa đúng hoặc tài khoản không có quyền sửa bài viết trên domain này!`,
                        'Lỗi xác thực',
                        { timeOut: 7000 },
                    );
                } else {
                    this.toastr.error(
                        `Lỗi publish (${failedErrors.length} bài): ${firstErr}`,
                    );
                }
            }

            this.selected = [];
            this.loadingPosts = false;
            this.cd.detectChanges();
        } catch (err) {
            console.error(err);
            this.toastr.error(
                'Có lỗi xảy ra khi publish bài viết: ' + (err?.message || err),
            );
            this.loadingPosts = false;
            this.cd.detectChanges();
        }
    }

    get canPublish(): boolean {
        if (!this.selected || this.selected.length === 0) return false;
        // Show publish if ANY selected item is draft or pending
        return this.selected.some(
            (post) =>
                post && (post.status === 'draft' || post.status === 'pending'),
        );
    }

    get canUnpublish(): boolean {
        if (!this.selected || this.selected.length === 0) return false;
        // Show unpublish if ANY selected item is publish
        return this.selected.some((post) => post && post.status === 'publish');
    }

    get canDelete(): boolean {
        return (
            this.selected &&
            this.selected.length > 0 &&
            this.selected.some((post) => !!post)
        );
    }

    async unpublishSelectedPosts() {
        if (!this.selected || this.selected.length === 0) return;

        const validSelected = this.selected.filter((p) => !!p && p.id);
        const postsToUnpublish = validSelected.filter(
            (post) => post.status !== 'draft',
        );

        if (postsToUnpublish.length === 0) {
            this.toastr.info('Tất cả bài viết đã ở trạng thái draft!');
            return;
        }

        this.loadingPosts = true;
        this.cd.detectChanges();

        const username =
            this.selectedDomain.wp_username || this.selectedDomain.username;
        const apppass =
            this.selectedDomain.wp_password || this.selectedDomain.password;

        const unpublishTasks = postsToUnpublish.map((post) => {
            const dataForm = {
                id: post.id,
                status: 'draft',
                domain: this.selectedDomain.domain,
                domain_id: this.selectedDomain._id,
                sys_username: this.selectedDomain.sys_username,
                year: this.selectedDomain.year,
                username: username,
                apppass: apppass,
            };
            return firstValueFrom(this._wordpressService.update_post(dataForm));
        });

        try {
            const results = await Promise.all(unpublishTasks);
            const successfulPosts: any[] = [];
            const failedErrors: string[] = [];

            results.forEach((r, idx) => {
                if (r && r.success === false) {
                    failedErrors.push(r.error || 'Thất bại');
                } else if (r && (r.id || r.status === 'draft' || r.data)) {
                    successfulPosts.push(postsToUnpublish[idx]);
                } else if (!r) {
                    failedErrors.push('Không nhận được phản hồi từ WordPress');
                }
            });

            if (successfulPosts.length > 0) {
                this.toastr.success(
                    `Đã unpublish thành công ${successfulPosts.length} bài viết!`,
                );
                const updatedIds = successfulPosts.map((p) => p.id);
                this.posts = this.posts.map((p) => {
                    if (updatedIds.includes(p.id)) {
                        return { ...p, status: 'draft' };
                    }
                    return p;
                });
                this.posts = [...this.posts];
            }

            if (failedErrors.length > 0) {
                const firstErr = failedErrors[0];
                if (
                    firstErr.includes('401') ||
                    firstErr.includes('not allowed to edit') ||
                    firstErr.includes('rest_cannot_edit')
                ) {
                    this.toastr.error(
                        `WordPress từ chối (401): Mật khẩu ứng dụng chưa đúng hoặc tài khoản không có quyền sửa bài viết trên domain này!`,
                        'Lỗi xác thực',
                        { timeOut: 7000 },
                    );
                } else {
                    this.toastr.error(
                        `Lỗi unpublish (${failedErrors.length} bài): ${firstErr}`,
                    );
                }
            }

            this.selected = [];
            this.loadingPosts = false;
            this.cd.detectChanges();
        } catch (err) {
            console.error(err);
            this.toastr.error(
                'Có lỗi xảy ra khi unpublish bài viết: ' +
                    (err?.message || err),
            );
            this.loadingPosts = false;
            this.cd.detectChanges();
        }
    }

    async deleteSelectedPosts() {
        if (!this.selected || this.selected.length === 0) return;

        const count = this.selected.length;

        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa bài viết',
            message: `Bạn đang chọn xóa <span class="font-semibold text-red-500">${count}</span> bài viết.<br>Hành động này sẽ đưa các bài viết vào thùng rác trên WordPress. Bạn có chắc chắn muốn tiếp tục không?`,
            icon: {
                show: true,
                name: 'feather:trash-2',
                color: 'warn',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa ngay',
                    color: 'warn',
                },
                cancel: {
                    show: true,
                    label: 'Hủy',
                },
            },
            dismissible: true,
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                const postsToDelete = this.selected;

                this.loadingPosts = true;
                this.cd.detectChanges();

                const username =
                    this.selectedDomain.wp_username ||
                    this.selectedDomain.username;
                const apppass =
                    this.selectedDomain.wp_password ||
                    this.selectedDomain.password;

                const deleteTasks = postsToDelete.map((post) => {
                    const dataForm = {
                        id: post.id,
                        domain: this.selectedDomain.domain,
                        domain_id: this.selectedDomain._id,
                        sys_username: this.selectedDomain.sys_username,
                        year: this.selectedDomain.year,
                        username: username,
                        apppass: apppass,
                    };
                    return firstValueFrom(
                        this._wordpressService.delete_post(dataForm),
                    );
                });

                try {
                    const results = await Promise.all(deleteTasks);
                    const successCount = results.filter((r) => r).length;
                    this.toastr.success(
                        `Đã xoá thành công ${successCount} bài viết!`,
                    );

                    const deletedIds = postsToDelete.map((p) => p.id);
                    this.posts = this.posts.filter(
                        (p) => !deletedIds.includes(p.id),
                    );
                    this.posts = [...this.posts]; // trigger change detection

                    this.selected = [];
                    this.loadingPosts = false;
                    this.cd.detectChanges();
                } catch (err) {
                    console.error(err);
                    this.toastr.error('Có lỗi xảy ra khi xoá bài viết');
                    this.loadingPosts = false;
                    this.cd.detectChanges();
                }
            }
        });
    }

    decodeHTMLEntities(text: string): string {
        if (!text) return '';
        let decoded = text;
        // Handle double encoding by doing it twice
        for (let i = 0; i < 2; i++) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = decoded;
            decoded = textarea.value;
            // Regex fallback
            decoded = decoded.replace(/&#(\d+);/g, (match, dec) =>
                String.fromCharCode(dec),
            );
        }
        return decoded;
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

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    readFile = (e: any) => {
        let phantho = '';
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.readAsText(file);

        reader.onload = async (evt) => {
            this.xml = (evt as any).target.result;
            this.xml = await this.parseXmlToJson(this.xml);

            if (this.xml && this.xml.rss && this.xml.rss.channel) {
                this.rows = this.xml.rss.channel.item;
                this.rows.map((row) => {
                    phantho += row.link + '\n';
                    this.links.push({
                        link: row.link,
                    });
                });

                this.clipboard.copy(phantho);
                this.toastr.success(`Chép phần thô thành công!`);

                this.stepper.selectedIndex = 1;

                // lam moi lai giao dien
                this.cd.markForCheck();
            } else {
                this.stepper.selectedIndex = 2;
                this.toastr.warning(`Định dạng xml không đúng.`);

                if (this.xml && this.xml.urlset && this.xml.urlset.url) {
                    this.xml.urlset.url.map((row: any) => {
                        phantho += row.loc + '\n';
                        this.links.push({
                            link: row.loc,
                        });
                    });

                    this.clipboard.copy(phantho);
                    this.toastr.success(`Chép phần thô thành công!`);

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            }
        };
    };

    store() {
        this.rows.map((row: any) => {
            const { hostname } = new URL(row.link);

            this._wp2mdService
                .store({
                    title: row.title,
                    hostname: hostname,
                    object: row,
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success) {
                            this.toastr.success(`Thêm mới`);
                        } else {
                            this.toastr.warning(`Đã tồn tại`);
                        }
                    },
                    error: (e: any) => {},
                    complete: () => {
                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    },
                });
        });
    }

    generateDownloadJsonUri(links?: any) {
        var theJSON = JSON.stringify(links);
        var uri = this.sanitizer.bypassSecurityTrustUrl(
            'data:text/json;charset=UTF-8,' + encodeURIComponent(theJSON),
        );
        this.downloadJsonHref = uri;
    }

    download(links?: any) {
        this.generateDownloadJsonUri(links);
    }

    async parseXmlToJson(xml: any) {
        // With parser
        const parser = new xml2js.Parser({ explicitArray: false });
        return await parser
            .parseStringPromise(xml)
            .then((result: object) => {
                return result;
            })
            .catch((err: any) => {
                // Failed
            });

        // Without parser
        // return await xml2js
        //     .parseStringPromise(xml, { explicitArray: false })
        //     .then(response => response.Employees.Employee);
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _wp2mdService: WP2MDService,
        private _domainService: DomainService,
        private _wordpressService: WordpressService,
        private toastr: ToastrService,
        private sanitizer: DomSanitizer,
        private cd: ChangeDetectorRef,
        private clipboard: Clipboard,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService,
        private _crawlService: CrawlService,
        private _dialog: MatDialog,
        private _fuseLoadingService: FuseLoadingService,
    ) {
        this.titleService.setTitle(
            `wordpress importer | ai.type - công cụ tạo content`,
        );

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
            });
    }

    ngOnInit(): void {
        this._domainService
            .fetch({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success && result.data.length > 0) {
                        this.domains = result.data;

                        const savedDomain = localStorage.getItem(
                            'sitemap_selected_domain',
                        );
                        if (savedDomain) {
                            const cleanSaved = (savedDomain || '')
                                .replace(/^(https?:\/\/)?(www\.)?/, '')
                                .split('/')[0];
                            const found = this.domains.find(
                                (d) =>
                                    (d.domain || '')
                                        .replace(/^(https?:\/\/)?(www\.)?/, '')
                                        .split('/')[0] === cleanSaved,
                            );
                            this.selectedDomain = found
                                ? found
                                : this.domains[0];
                        } else {
                            this.selectedDomain = this.domains[0];
                        }

                        this.fetchCategories();
                        this.fetchPosts();
                        this.cd.markForCheck();
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    ngOnDestroy(): void {
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
            this.router.navigate(['/tools']);
        });
    }

    openDomainConfigDialog() {
        if (!this.selectedDomain) return;
        this.configDomainData = {
            domain: this.selectedDomain.domain,
            username:
                this.selectedDomain.username ||
                this.selectedDomain.wp_username ||
                '',
            password:
                this.selectedDomain.password ||
                this.selectedDomain.wp_password ||
                '',
            _showPassword: false,
        };
        this.domainConfigDialogRef = this._dialog.open(
            this.domainConfigDialogTemplate,
            {
                width: '480px',
                disableClose: false,
            },
        );
    }

    async saveDomainConfig() {
        if (!this.configDomainData || !this.configDomainData.domain) return;

        const username = (this.configDomainData.username || '').trim();
        const password = (this.configDomainData.password || '').trim();

        const payload = {
            ...this.selectedDomain,
            domain: this.configDomainData.domain,
            username: username,
            password: password,
        };

        const electron = (window as any).electron;
        if (electron && electron.saveLocalDomain) {
            try {
                const res = await electron.saveLocalDomain(payload);
                if (res && res.success) {
                    this.toastr.success(
                        'Đã lưu cấu hình tài khoản WordPress thành công!',
                    );
                    this.selectedDomain.username = username;
                    this.selectedDomain.password = password;
                    this.selectedDomain.wp_username = username;
                    this.selectedDomain.wp_password = password;

                    // Cập nhật lại trong danh sách domains
                    const targetDomain = this.domains.find((d) =>
                        this.compareDomainFn(d, this.selectedDomain),
                    );
                    if (targetDomain) {
                        targetDomain.username = username;
                        targetDomain.password = password;
                        targetDomain.wp_username = username;
                        targetDomain.wp_password = password;
                    }

                    if (this.domainConfigDialogRef) {
                        this.domainConfigDialogRef.close();
                    }
                    this.cd.markForCheck();
                    return;
                } else {
                    this.toastr.error(
                        'Lỗi khi lưu: ' + (res?.error || 'Không xác định'),
                    );
                }
            } catch (err) {
                this.toastr.error('Lỗi khi lưu: ' + (err?.message || err));
            }
        } else {
            this._domainService.edit(payload).subscribe({
                next: (res: any) => {
                    this.toastr.success(
                        'Đã lưu cấu hình tài khoản WordPress thành công!',
                    );
                    this.selectedDomain.username = username;
                    this.selectedDomain.password = password;
                    if (this.domainConfigDialogRef) {
                        this.domainConfigDialogRef.close();
                    }
                    this.cd.markForCheck();
                },
                error: (err) => {
                    this.toastr.error(
                        'Lỗi khi lưu cấu hình: ' + (err?.message || err),
                    );
                },
            });
        }
    }
}
