import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, TemplateRef, ViewChild, ViewContainerRef, ViewEncapsulation } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { MatButton } from '@angular/material/button';
import { Subject, takeUntil } from 'rxjs';
import { Notification } from 'app/layout/common/notifications/notifications.types';
import { NotificationsService } from 'app/layout/common/notifications/notifications.service';
import { ForumService } from 'app/modules/_services/forum';
import { User } from 'app/core/user/user.types';
import { UserService } from 'app/core/user/user.service';
import { SharedService } from 'app/shared.service';
import { CrawlService } from 'app/modules/_services/crawl';
import { BlogService } from 'app/modules/_services/blog';
import { ToastrService } from 'ngx-toastr';
import { DomainService } from 'app/modules/_services/domain';
import { WordpressService } from 'app/modules/_services/wordpress';
import { GenaiService } from 'app/genai.service';

import * as _ from 'lodash';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'notifications',
    templateUrl: './notifications.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [CrawlService, BlogService, DomainService, WordpressService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    exportAs: 'notifications'
})
export class NotificationsComponent implements OnInit, OnDestroy {
    user: User;
    settings: any;
    secretKey: any;
    searchAPIKey: any;
    tasks: any = [];
    styles = [];

    currentIndex = 0;
    processing: boolean = false;
    isCancelled: boolean = false;

    @ViewChild('notificationsOrigin') private _notificationsOrigin: MatButton;
    @ViewChild('notificationsPanel') private _notificationsPanel: TemplateRef<any>;

    domain: any;
    cdomain: any;
    tdomain: any;
    domains: any[] = [];
    categories: any[] = [];
    ccategories: any = {};
    form: any = {};
    total: number = 0;
    budget: number = 0;
    timer: any;
    publish: boolean = false;
    collection: any;

    notifications: Notification[] = [];
    unreadCount: number = 0;

    private _overlayRef: OverlayRef;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Open the notifications panel
     */
    openPanel(): void {
        // Return if the notifications panel or its origin is not defined
        if (!this._notificationsPanel || !this._notificationsOrigin) {
            return;
        }

        // Create the overlay if it doesn't exist
        if (!this._overlayRef) {
            this._createOverlay();
        }

        // Attach the portal to the overlay
        this._overlayRef.attach(new TemplatePortal(this._notificationsPanel, this._viewContainerRef));
    }

    /**
     * Close the notifications panel
     */
    closePanel(): void {
        this._overlayRef.detach();
    }

    /**
     * Mark all notifications as read
     */
    markAllAsRead(): void {
        // Mark all as read
        this._notificationsService.markAllAsRead().subscribe();
    }

    /**
     * Toggle read status of the given notification
     */
    toggleRead(notification: Notification): void {
        // Toggle the read status
        notification.read = !notification.read;

        // Update the notification
        this._notificationsService.update(notification.id, notification).subscribe();
    }

    /**
     * Delete the given notification
     */
    delete(notification: Notification): void {
        // Delete the notification
        this._notificationsService.delete(notification.id).subscribe();
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
                .flexibleConnectedTo(this._notificationsOrigin._elementRef.nativeElement)
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

    /**
     * Calculate the unread count
     *
     * @private
     */
    private _calculateUnreadCount(): void {
        let count = 0;

        if (this.notifications && this.notifications.length) {
            count = this.notifications.filter(notification => !notification.read).length;
        }

        this.unreadCount = count;
    }

    // bắt đầu chạy
    startAutoCreateNode() {
        this.processing = true;

        // Kiểm tra điều kiện trước khi chạy
        if (this.form && this.form.autocreatenode && this.total > 0) {
            this.getFacePosts();
        }
    }

    /**
     * Duyệt tất cả các post chưa được sử dụng. Lấy về 5000 post từ Facegroup
     * và bắt đầu chạy tự động tạo bài viết.
     */
    getFacePosts() {
        this._crawlService.facePosts({
            username: this.user.name,
            facegroup: this.collection._id,
            page: { size: 5000 }
        })
            .pipe()
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data && result.data.length > 0) {
                        this.tasks = result.data;

                        // làm mới notification
                        this.notifications = [];

                        // bắt đầu chạy với 7 post
                        this.processInBatches(7);
                    }
                },
                error: () => { },
                complete: () => { }
            });
    }

    // Hàm xử lý theo lô
    async processInBatches(batchSize: number): Promise<void> {
        this.processing = true;
        this.isCancelled = false;

        while (this.tasks.length > 0) {
            if (this.isCancelled) {
                console.warn('⚠️ Quá trình đã bị huỷ bởi người dùng.');
                break; // Thoát khỏi vòng lặp ngay
            }

            const currentBatch = this.tasks.slice(0, batchSize);

            const results = await Promise.allSettled(
                currentBatch.map((data: any, index: number) =>
                    this.createPost(data, index)
                )
            );

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    console.log(`✅ Task ${this.currentIndex + index} thành công`);
                } else {
                    console.warn(`❌ Task ${this.currentIndex + index} lỗi:`, result.reason);
                }
            });

            this.currentIndex += currentBatch.length;
            this.tasks.splice(0, batchSize);
            this.notifications = []; // ✅ Xoá sau khi hoàn tất
        }

        // Sau khi xử lý hết mọi thứ:
        this.processing = false;
        this.isCancelled = false;
        this.cd.markForCheck(); // ✅ Cập nhật giao diện
        console.log('🎉 Đã xử lý xong toàn bộ tasks.');
    }

    stopProcessing() {
        this.alert({
            title: 'Thông báo',
            message: `Bạn muốn dừng quá trình chạy tự đông?`,
            confirm: 'Dừng ngay',
            cb: () => {
                this.isCancelled = true;
                this.toastr.success('Đã dừng thành công!');
            }
        });
    }

    resumeProcessing() {
        if (!this.processing && this.currentIndex < this.tasks.length) {
            this.processInBatches(7);
        }
    }

    // Giả lập hàm tạo hình ảnh (trả về Promise)
    createPost(content: any, index: number): Promise<void> {
        console.log(`🔨 Đang tạo bài viết ${content._id} với index ${index}`);
        return new Promise(resolve => {
            setTimeout(() => {
                // tạo sẵn notification
                this.notifications.push({
                    id: `${content._id}`,
                    image: 'https://type.vn/assets/uploads/favicon.png',
                    title: 'Đang tạo title',
                    time: `${Date.now()}`,
                    description: content.text,
                    useRouter: false,
                    read: false
                });

                this.generateContent(content, index).then(async response => {
                    // bắt đầu chạy 7 bài (thực ra có bao nhiêu chạy bấy nhiêu, lớn hơn 7 thì dừng)
                    if (response && response.text) {
                        let post: any;
                        const jsonText = response.text.match(/```json\n([\s\S]*?)```/);

                        if (jsonText) {
                            try {
                                const data = JSON.parse(jsonText[1]);
                                this.notifications[index]['title'] = data.title || null;
                                this.notifications[index]['description'] = data.description || null;

                                post = {
                                    title: this.notifications[index]['title'],
                                    description: this.notifications[index]['description'],
                                    tags: [],
                                    categories: [],
                                    content: data.content,
                                    excerpt: this.notifications[index]['description'],
                                    username: this.domain['username'],
                                    apppass: this.domain['password'],
                                    status: (this.publish) ? 'publish' : 'pending',
                                    domain: this.domain['domain']
                                };

                                // thêm nhiều tag cho bài viết
                                if (data.long_keywords && data.long_keywords.length > 0) {
                                    try {
                                        const requests = data.long_keywords.map((name: string) => this.createTag(name));
                                        const long_keywords = await Promise.all(requests);
                                        long_keywords.forEach(tag => {
                                            if (tag) {
                                                post['tags'].push(tag.id);
                                            }
                                        });
                                    } catch (error) {
                                        console.log('error', error);
                                    }
                                }

                                // gắn ảnh thumbnail cho bài viết
                                if (data.image_prompt && this.form.createthumbnail) {
                                    try {
                                        const image = await this.createImage(data.image_prompt, index);

                                        if (image && image.candidates[0] && image.candidates[0].content && image.candidates[0].content.parts) {
                                            for (const part of image.candidates[0].content.parts) {
                                                // Based on the part type, either show the text or save the image
                                                if (part.text) {
                                                    console.log('tạo hình: ', part.text);
                                                } else if (part.inlineData) {
                                                    const imageData = part.inlineData.data;
                                                    const thumbnail = await Promise.all([
                                                        this._blogService.uploadThumbnailPromise({
                                                            domain: this.domain,
                                                            imageData: imageData,
                                                            folder: 'thumbnails',
                                                            username: this.user.name
                                                        })
                                                    ]);

                                                    thumbnail.forEach(image => {
                                                        // hiển thị ảnh đã tạo ra được
                                                        if (image && image['img']) {
                                                            this.notifications[index]['image'] = `file:///${image['img']}`;
                                                        }

                                                        // nhét ID vô
                                                        if (image && image['data']) {
                                                            post['featured_media'] = image['data']['id'];
                                                        }
                                                    });
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        console.log('error', error);
                                    }
                                }

                                // gắn link liên quan cho bài viết
                                if (data.short_keywords && data.short_keywords.length > 0) {
                                    try {
                                        const join = data.short_keywords.join(' OR ');
                                        const site = (this.cdomain) ? this.cdomain : this.domain['domain'];

                                        const requests = [
                                            this.googleSearch(`${join} site:${site}`, index),
                                            // this.googleSearch(`${join} site:${this.domain['domain']}`, index, 'image')
                                        ];

                                        const short_keywords = await Promise.all(requests);
                                        short_keywords.forEach((search: any) => {
                                            if (search && search[0]) {
                                                post.content = post.content.replace(this.domain['domain'], search[0]['link']);
                                                post.content = post.content.replace((this.tdomain) ? this.tdomain : (this.domain['name']) ? this.domain['name'] : this.domain['domain'], search[0]['title']);
                                            }
                                        });
                                    } catch (error) {
                                        console.log('error', error);
                                    }
                                }

                                // thêm category cho bài viết
                                data.categories.map((category: string) => {
                                    post['categories'].push(this.ccategories[category]);
                                });

                                // lên bài Wordpress nào
                                this._wordpressService.create_post(post)
                                    .pipe()
                                    .subscribe({
                                        next: async (result) => {
                                            if (result && result.success && result.data && result.data.id) {
                                                // cập nhật trạng thái facepost đã làm xong
                                                this._crawlService.facePostUpdate({
                                                    username: this.user.name,
                                                    id: content._id
                                                }).subscribe({
                                                    next: async (result) => {
                                                        if (result && result.success) {
                                                            // đếm số bài viết còn lại có thể tự động tạo được
                                                            this.budget = (this.budget === 0) ? this.total - 1 : this.budget - 1;

                                                            // lấy statistics dưới local lên và update
                                                            let statistics = localStorage.getItem('statistics');
                                                            if (statistics) {
                                                                statistics = JSON.parse(statistics);
                                                                if (statistics && statistics['faceposts']) {
                                                                    statistics['faceposts'] = parseInt(statistics['faceposts']) - 1;
                                                                    localStorage.setItem('statistics', JSON.stringify(statistics));
                                                                }
                                                            }

                                                            // lam moi lai giao dien
                                                            this.cd.markForCheck();
                                                            console.log(`✅ Hoàn thành bài viết ${content._id}`);
                                                        }

                                                        resolve();
                                                    },
                                                    error: () => {
                                                        resolve();
                                                    },
                                                    complete: () => { }
                                                });

                                                this.toastr.success(`Đăng bài ID POST ${result.data.id}!`);
                                            } else {
                                                resolve();
                                                this.toastr.warning('Đăng bài thất bại.');
                                            }
                                        },
                                        error: (err) => {
                                            console.log(err);
                                            resolve();
                                        },
                                        complete: () => { }
                                    });
                            } catch (error) {
                                this.toastr.warning(`Đăng bài thất bại ${content._id}.`);
                                resolve();
                            }
                        }
                    } else {
                        resolve();
                    }
                });
            }, 1000); // Giả lập delay 1 giây
        });
    }

    async generateContent(item: any, index: number) {
        const title = (this.tdomain) ? this.tdomain : (this.domain['name']) ? this.domain['name'] : this.domain['domain']

        const prompt = `Viết blog đầy đủ trên 600 từ dựa trêm chủ đề "${item.text}" và những hình ảnh đính kèm.
        Chỉ lấy kết quả bài viết blog thôi, trả kết quả về định dạng JSON với key đầu tiên là title có value đúng định dạng viết hoa đầu câu và chứa một từ khoá chính.
        Key thứ hai là content với value là nội dung của blog trả về dạng HTML, đoạn văn đầu tiên chứa một từ khoá chính, không gắn link vào bài viết.
        Key thứ ba là long_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải trên 3 từ trở lên.
        Key thứ tư là products với value là liệt kê các sản phẩm có trong blog dưới dạng array.
        Key thứ năm là categories với value là một trong các danh mục mà nội dung blog phù hợp nhất trong mảng ${this.categories}, value dưới dạng array.
        Key thứ sáu là short_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải dưới 3 từ trở xuống.
        Key thứ bảy là description với value là bản tóm tắt ngắn gọn của blog, value dưới 160 từ chứa một khoá chính.
        Key thứ tám là image_prompt với value là gợi ý tạo hình ảnh từ nội dung blog.
        Lưu ý: Blog mang phong cách của ${this.styles[0].name} (mô tả phong cách ${this.styles[0].desc}), trong key thứ hai content phải có ít nhất 1 thẻ h2 để làm SEO, một link bất kỳ gắn tới website ${this.domain['domain']} với title là ${title} để làm link tham khảo.
        Tôi muốn bạn trả về dữ liệu dưới định dạng JSON. Ví dụ:
        {
            "title": "Tiêu đề",
            "content": "Chi tiết",
            "long_keywords": [],
            "products": [],
            "categories": [],s
            "short_keywords": [],
            "description": "Mô tả",
            "image_prompt": "Mô tả"
        }
        Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
        Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.`;

        let images = [];
        let imageParts: any = [prompt];

        if (item.images && item.images.length > 0) {
            // làm sạch images
            images = item['images'].filter((i: string) => { return i != null; });
        }

        if (images.length > 0) {
            // store hình trước đã
            const results: any = await this._blogService.storeImages({
                username: this.user.name,
                images: images
            });

            // tạo lệnh viết bài theo hình ảnh
            results.map(async (data: any) => {
                // phải có base64Image2File mới thêm ảnh
                if (data && data.base64Image2File) {
                    imageParts.push({
                        inlineData: {
                            mimeType: data.mimeType,
                            data: data.base64Image2File,
                        },
                    });
                }
            });
        }

        // phải tạo được inlineData mới gen thành bài viết được
        if (imageParts.length > 1) {
            try {
                const parts = imageParts.map((p: any) => {
                    if (typeof p === 'string') return { text: p };
                    if (p.inlineData) return { inlineData: p.inlineData };
                    return p;
                });

                return this._genaiService.generateContent({
                    model: 'gemini-3.5-flash',
                    contents: [{ role: 'user', parts: parts }]
                });
            } catch (error) {
                return { text: null };
            }
        } else {
            // dừng lại nếu số từ quá ngắn
            if (!item.text || item.text.length <= 40) {
                return { text: null };
            } else {
                try {
                    return this._genaiService.generateContent({
                        model: 'gemini-3.5-flash',
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    });
                } catch (error) {
                    return { text: null };
                }
            }
        }
    }

    async createImage(prompt: string, index: number) {
        return this._genaiService.generateContent({
            model: 'gemini-3.6-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseModalities: ['IMAGE'],
            } as any,
        });
    }

    createTag(name: string) {
        return this._wordpressService.createTagPromise({
            name: name,
            domain: this.domain['domain'],
            username: this.domain['username'],
            apppass: this.domain['password'],
        });
    }

    googleSearch(query: string, index: number, searchType?: string) {
        return this._blogService.googleSearchPromise({
            query: query,
            searchAPIKey: this.searchAPIKey,
            index: index,
            searchType: searchType
        });
    }

    /**
     * Lấy notification về
     */
    fetch() {
        // Optimistic UI: Hiển thị ngay từ Cache để UI không bị trống
        const cacheKey = `notifications_cache_${this.user?.id || 'guest'}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                this.notifications = JSON.parse(cached);
                this._calculateUnreadCount();
                this.cd.markForCheck();
            } catch (e) {}
        }

        // Trì hoãn 5 giây để nhường băng thông và Backend xử lý cho các màn hình chính (tránh nghẽn mạng lúc vừa vào app)
        setTimeout(() => {
            if (!this.user || !this.user.id) return;
            
            this._forumService.notification({
                _uid: this.user.id
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data && result.data.notifications) {
                            this.notifications = result.data.notifications.map((item: any) => {
                                item = {
                                    id: item.pid,
                                    icon: (item.user?.picture) ? `https://type.vn${item.user.picture.replace(/&#x2F;/g, '/')}` : 'https://type.vn/assets/uploads/favicon.png',
                                    image: (item.image) ? `https://type.vn${item.image.replace(/&#x2F;/g, '/')}` : null,
                                    title: item.subject,
                                    description: (item.type === 'follow') ? `${item.user?.username || 'Ai đó'} bắt đầu theo dõi bạn` : (item.bodyLong ? new DOMParser().parseFromString(item.bodyLong, 'text/html').body.textContent.trim() : ''),
                                    time: item.datetimeISO,
                                    link: `https://type.vn${item.path ? item.path.replace(/&#x2F;/g, '/') : ''}`,
                                    useRouter: false,
                                    read: item.read
                                };
    
                                return item;
                            });
                            
                            // Lưu Cache lại
                            localStorage.setItem(cacheKey, JSON.stringify(this.notifications));
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
                        // Calculate the unread count
                        this._calculateUnreadCount();
    
                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                });
        }, 5000);
    }

    /**
     * Constructor
     */
    constructor(
        private cd: ChangeDetectorRef,
        private _notificationsService: NotificationsService,
        private _forumService: ForumService,
        private _crawlService: CrawlService,
        private _userService: UserService,
        private _blogService: BlogService,
        private _wordpressService: WordpressService,
        private sharedService: SharedService,
        private _fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService,
        private _router: Router,
        private _overlay: Overlay,
        private _viewContainerRef: ViewContainerRef,
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService
    ) { }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                // lấy các notice nào
                this.fetch();
            });

        // lắng nghe sự kiện kêu chạy thì chạy luôn
        this.sharedService.event$.subscribe(data => {
            this.currentIndex = 0;

            // set danh mục để chạy
            this.categories = data.categories || [];

            // cài đặt để lưu trữ
            this.form = data.form || {};
            this.total = data.total || 0;

            this.collection = data.form.collection || {};
            this.domain = data.form.domain1 || {};
            this.cdomain = data.form.domain2;
            this.tdomain = data.form.titledomain2;
            this.publish = data.form.publish || false;

            // Xử lý category
            let categories = [];
            this.categories.map((category: any) => {
                categories.push(category.name);
                this.ccategories[`${category.name}`] = category.id;
            });
            this.categories = categories;

            // lấy secretKey và searchAPIKey
            this.settings = this.multiAccountService.getItem('settings');
            this.secretKey = (this.settings && this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings && this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;

            // Lấy phong cách viết
            const styles = this.multiAccountService.getItem('styles') || [];
            if (styles) {
                this.styles = styles;
                if (styles.length > 0) {
                    // khởi chạy đi nào
                    this.startAutoCreateNode();
                } else {
                    this.alert({
                        title: 'Thông báo',
                        message: `Bạn chưa tạo phong cách viết của mình.`,
                        confirm: 'Tạo ngay',
                        cb: () => {
                            this._router.navigate(['/settings', { queryParams: { tab: 'style' } }]);
                        }
                    });
                }
            }
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

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: (alert) ? alert.title : 'Hoàn tất!',
            message: (alert) ? alert.message : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu. <span class="font-medium">Hãy tiếp tục với một URL mới luôn nào!</span>',
            icon: {
                show: true,
                name: 'feather:check',
                color: 'success'
            },
            actions: {
                confirm: {
                    show: true,
                    label: (alert) ? alert.confirm : 'Khởi động lại',
                    color: 'primary'
                },
                cancel: {
                    show: false,
                    label: 'Đóng cửa sổ'
                }
            },
            dismissible: true
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((result) => {
            if (result === "confirmed") {
                if (alert.cb) {
                    alert.cb();
                }
            }
        });
    }
}
