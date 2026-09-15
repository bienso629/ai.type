import {
    Component,
    Inject,
    ViewChild,
    ChangeDetectionStrategy,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BlogService } from 'app/_services/blog';
import { Subject, takeUntil } from 'rxjs';

import { GenaiService } from 'app/genai.service';
import { UserService } from 'app/core/user/user.service';
import { FuseConfigService } from '@fuse/services/config';
import { User } from 'app/core/user/user.types';
import { AppConfig } from 'app/core/config/app.config';
import { WordpressService } from 'app/_services/wordpress';
import { ToastrService } from 'ngx-toastr';

import * as $ from 'jquery';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { Router } from '@angular/router';
import { MatSelectionList } from '@angular/material/list';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'gemini-matrix-dialog',
    template: `<div class="flex items-center justify-between mb-4">
            <div class="text-2xl font-bold text-gray-800 tracking-tight">
                Tạo bài viết theo nhiều phong cách
            </div>
            <button mat-icon-button mat-dialog-close type="button">
                <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
            </button>
        </div>

        <div mat-dialog-content class="mt-4 p-0 overflow-hidden">
            <mat-label class="my-2 text-base font-semibold">
                Chọn phong cách viết của bài
            </mat-label>

            <mat-selection-list
                #stylelist
                class="max-h-80 p-0 my-2 overflow-auto"
            >
                @for (style of styles; track style) {
                    <mat-list-option
                        [disableRipple]="false"
                        class="mb-2 last:mb-0 p-3 rounded-lg cursor-pointer bg-gray-50"
                        [value]="style"
                    >
                        @if (style['avatar']) {
                            <div
                                class="w-13 h-13 m-0 my-auto mr-3 rounded-md"
                                [ngStyle]="{
                                    'background-image':
                                        'url(' + style['avatar'] + ')',
                                    'background-size': 'cover',
                                    'background-repeat': 'no-repeat',
                                    'background-position': 'center',
                                }"
                                matListItemIcon
                            ></div>
                        }
                        <div>
                            <p class="font-semibold">{{ style.name }}</p>
                            <p class="text-base line-clamp-1">
                                {{ style.desc }}
                            </p>
                        </div>
                    </mat-list-option>
                }
            </mat-selection-list>

            <div class="w-full mt-3">
                <mat-form-field
                    class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0"
                    [subscriptSizing]="'dynamic'"
                >
                    <mat-label>Bạn muốn viết nội dung như thế nào?</mat-label>
                    <textarea
                        class="max-h-50 min-h-20 px-2"
                        [(ngModel)]="prompt"
                        [placeholder]="'Prompt'"
                        type="text"
                        required
                        matInput
                        cdkTextareaAutosize
                    ></textarea>
                </mat-form-field>
            </div>

            <div class="w-full mt-2">
                <mat-form-field
                    class="w-1/2 fuse-mat-dense fuse-mat-emphasized-affix"
                    [subscriptSizing]="'dynamic'"
                >
                    <mat-label>Domain tham chiếu (option)</mat-label>
                    <mat-icon
                        class="icon-size-4"
                        [svgIcon]="'feather:globe'"
                        matPrefix
                    ></mat-icon>
                    <input [(ngModel)]="cdomain" type="text" matInput />
                </mat-form-field>
            </div>

            <div class="w-full mt-3">
                <mat-form-field
                    class="w-1/2 fuse-mat-dense fuse-mat-emphasized-affix"
                    [subscriptSizing]="'dynamic'"
                >
                    <mat-label>Tiêu đề tham chiếu (option)</mat-label>
                    <mat-icon
                        class="icon-size-4"
                        [svgIcon]="'feather:type'"
                        matPrefix
                    ></mat-icon>
                    <input [(ngModel)]="tdomain" type="text" matInput />
                </mat-form-field>
            </div>
        </div>

        <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
            <button mat-flat-button (click)="send()" color="primary" class="">
                <mat-icon
                    class="icon-size-4 text-white"
                    svgIcon="feather:edit-3"
                ></mat-icon>
                <mat-label class="">Viết nhanh</mat-label>
            </button>
        </div>`,
    providers: [WordpressService, BlogService],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class GeminiMatrixDialog {
    user: User;
    config: AppConfig;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    // ai: any;

    styles: any = [];
    domain: any;
    ccategories: any = {};

    @ViewChild('stylelist') stylelist: MatSelectionList;

    prompt: String = '';
    categories: any;
    cdomain = '';
    tdomain = '';

    publish: boolean = false;
    createThumbnail: boolean = false;
    searchGoogle: boolean = false;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Lấy styles
     */
    getStyles() {
        // Lấy phong cách viết
        const styles = this.multiAccountService.getItem('styles') || [];
        this.styles = styles;
        if (styles.length === 0) {
            // khởi chạy đi nào
            this.alert({
                title: 'Thông báo',
                message: `Bạn chưa tạo phong cách viết của mình.`,
                confirm: 'Tạo ngay',
                cb: () => {
                    this._router.navigate([
                        '/settings',
                        { queryParams: { tab: 'style' } },
                    ]);
                },
            });
        }
    }

    // chọn 1 category tương ứng với domain
    getCategories(e: any): void {
        if (!this.domain || this.domain['domain'] === '') return;

        this._wordpressService
            .categories({
                domain: this.domain['domain'],
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        // Xử lý category
                        let categories = [];

                        result.map((category: any) => {
                            categories.push(category.name);
                            this.ccategories[`${category.name}`] = category.id;
                        });

                        this.categories = categories;
                    }
                },
                error: () => {},
                complete: () => {},
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
            searchType: searchType,
        });
    }

    share(post: any): void {
        this._wordpressService
            .create_post(post)
            .pipe()
            .subscribe({
                next: async (result) => {
                    if (
                        result &&
                        result.success &&
                        result.data &&
                        result.data.id
                    ) {
                        // cập nhật trạng thái facepost đã làm xong
                        this.toastr.success(
                            `Đăng bài ID POST ${result.data.id}!`,
                        );

                        this.dialogRef.close();
                    } else {
                        this.toastr.warning('Đăng bài thất bại.');
                    }
                },
                error: () => {},
                complete: () => {},
            });
    }

    send(): void {
        this.stylelist.selectedOptions.selected.map((style) => {
            let index = 0;

            this.data['selectedItems'].forEach(async (text: string) => {
                // if (this.secretKey) {
                //     let geminiKey = this.secretKey[index % this.secretKey.length];
                //     index++;
                //     this.ai = new GoogleGenAI({ apiKey: geminiKey }); // ok rooi
                // }

                const title = $(text).text();

                const prompt = `${this.prompt}. Bài viết dựa trên chủ đề "${title}" và những hình ảnh đính kèm.
                        Chỉ lấy kết quả bài viết blog thôi, trả kết quả về định dạng JSON với key đầu tiên là title có value đúng định dạng viết hoa đầu câu và chứa một từ khoá chính.
                        Key thứ hai là content với value là nội dung của blog trả về dạng HTML, đoạn văn đầu tiên chứa một từ khoá chính, không gắn link vào bài viết.
                        Key thứ ba là long_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải trên 3 từ trở lên.
                        Key thứ tư là products với value là liệt kê các sản phẩm có trong blog dưới dạng array.
                        Key thứ năm là categories với value là một trong các danh mục mà nội dung blog phù hợp nhất trong mảng ${this.categories}, value dưới dạng array.
                        Key thứ sáu là short_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải dưới 3 từ trở xuống.
                        Key thứ bảy là description với value là bản tóm tắt ngắn gọn của blog, value dưới 160 từ chứa một khoá chính.
                        Key thứ tám là image_prompt với value là gợi ý tạo hình ảnh từ nội dung blog.
                        Lưu ý: Blog mang phong cách của ${style.value.name} (mô tả phong cách ${style.value.desc}), trong key thứ hai content phải có ít nhất 1 thẻ h2 để làm SEO, một link bất kỳ gắn tới website ${this.domain['domain']} với title là ${this.domain['name']} để làm link tham khảo.
                        Tôi muốn bạn trả về dữ liệu dưới định dạng JSON. Ví dụ:
                        {
                            "title": "Tiêu đề",
                            "content": "Chi tiết",
                            "long_keywords": [],
                            "products": [],
                            "categories": [],
                            "short_keywords": [],
                            "description": "Mô tả",
                            "image_prompt": "Mô tả"
                        }
                        Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
                        Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.`;

                const response = await this._genaiService.generateContent({
                    model: 'gemini-3.6-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });

                const jsonText = response.text;
                if (jsonText) {
                    try {
                        const data = JSON.parse(jsonText);

                        const post = {
                            title: data['title'],
                            description: data['description'],
                            tags: [],
                            categories: [],
                            content: data.content,
                            excerpt: data['description'],
                            username: this.domain['username'],
                            apppass: this.domain['password'],
                            status: this.publish ? 'publish' : 'pending',
                            domain: this.domain['domain'],
                        };

                        // thêm nhiều tag cho bài viết
                        if (
                            data.long_keywords &&
                            data.long_keywords.length > 0
                        ) {
                            try {
                                const requests = data.long_keywords.map(
                                    (name: string) => this.createTag(name),
                                );
                                const long_keywords =
                                    await Promise.all(requests);
                                long_keywords.forEach((tag) => {
                                    if (tag) {
                                        post['tags'].push(tag.id);
                                    }
                                });
                            } catch (error) {
                                console.log('error', error);
                            }
                        }

                        // gắn link liên quan cho bài viết
                        if (
                            data.short_keywords &&
                            data.short_keywords.length > 0 &&
                            this.searchGoogle
                        ) {
                            try {
                                const join = data.short_keywords.join(' OR ');
                                const site = this.cdomain
                                    ? this.cdomain
                                    : this.domain['domain'];

                                const requests = [
                                    this.googleSearch(
                                        `${join} site:${site}`,
                                        0,
                                    ),
                                    // this.googleSearch(`${join} site:${this.domain['domain']}`, index, 'image')
                                ];

                                const short_keywords =
                                    await Promise.all(requests);
                                short_keywords.forEach((search: any) => {
                                    if (search && search[0]) {
                                        post.content = post.content.replace(
                                            this.domain['domain'],
                                            search[0]['link'],
                                        );
                                        post.content = post.content.replace(
                                            this.tdomain
                                                ? this.tdomain
                                                : this.domain['name']
                                                  ? this.domain['name']
                                                  : this.domain['domain'],
                                            search[0]['title'],
                                        );
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

                        // lên bài nào
                        this.share(post);
                    } catch (error) {}
                }
            });
        });
    }

    onNoClick(): void {
        this.dialogRef.close();
    }

    constructor(
        public dialogRef: MatDialogRef<GeminiMatrixDialog>,
        private _blogService: BlogService,
        private _userService: UserService,
        private _wordpressService: WordpressService,
        private toastr: ToastrService,
        private _router: Router,
        private _fuseConfirmationService: FuseConfirmationService,
        private _fuseConfigService: FuseConfigService,
        @Inject(MAT_DIALOG_DATA) public data: GeminiMatrixDialog,
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService,
    ) {
        // lấy secretKey và searchAPIKey
        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = this.settings.secretKey
                ? this.settings.secretKey.split(';')
                : undefined;
            this.searchAPIKey = this.settings.searchAPIKey
                ? this.settings.searchAPIKey.split(';')
                : undefined;
        }

        this.getStyles();

        this.domain = data['domain'];
        this.getCategories(this.domain);

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
    ngOnInit(): void {}

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
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
                    show: false,
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
