import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    HostListener,
} from '@angular/core';
import {
    UntypedFormBuilder,
    UntypedFormGroup,
    Validators,
} from '@angular/forms';
import { Title, DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { CrawlService } from 'app/modules/_services/crawl';
import { BlogService } from 'app/modules/_services/blog';
import { UserService } from 'app/core/user/user.service';
import { ForumService } from 'app/modules/_services/forum';
import { User } from 'app/core/user/user.types';
import { ToastrService } from 'ngx-toastr';
import { SEOScorePipe, RemoveHTMLPipe, SlugifyPipe } from 'app/app.pipe';
import {
    interval,
    Subject,
    Subscription,
    switchMap,
    takeUntil,
} from 'rxjs';
import { ActivatedRoute, Params } from '@angular/router';
import { Router } from '@angular/router';
import {
    CdkDragDrop,
    moveItemInArray,
    transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { GenaiService } from 'app/genai.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { SettingsDomainLoginComponent } from 'app/modules/admin/account/settings/domain/login/login.component';
import { AIText2SpeechComponent } from 'app/modules/admin/content/ai-text2speech/ai-text2speech.component';
import { VideoTimelineDialogComponent } from 'app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component';
import { CopyPasteDialog } from 'app/modules/admin/content/ai-writer/tools/copy-paste-dialog';
import { GeminiImageDialog } from 'app/modules/admin/content/ai-writer/tools/gemini-image-dialog';
import { WordDataDialog } from 'app/modules/admin/content/ai-writer/tools/word-data-dialog';
import { CommentDialog } from 'app/modules/admin/content/ai-writer/tools/comment-dialog';
import { GeminiMatrixDialog } from 'app/modules/admin/content/ai-writer/tools/gemini-matrix-dialog';
import { MediaDataDialog } from 'app/modules/admin/content/ai-writer/tools/media-data-dialog';
import { KeywordGoogleDataDialog } from 'app/modules/admin/content/ai-writer/tools/keyword-google-data-dialog';
import { ChatGPTQuestionSheet } from 'app/modules/admin/content/ai-writer/tools/chatgpt-questions-sheet';
import { EditBeforeExportSheet } from 'app/modules/admin/content/ai-writer/tools/edit-before-export-sheet';

import { forkJoin } from 'rxjs'; // RxJS 6 syntax
import { DomainService } from 'app/modules/_services/domain';
import { WordpressService } from 'app/modules/_services/wordpress';
import { Clipboard } from '@angular/cdk/clipboard';

import * as _ from 'lodash';
import * as $ from 'jquery';
import * as uuid from 'uuid';

import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';

import { marked } from 'marked';
import { YoutubeService } from 'app/modules/_services/youtube';
import { LogService } from 'app/modules/_services/link';
import { HelperService } from 'app/helper.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

declare var require: any;
declare var LeaderLine: any;
declare var TurndownService: any;
declare var window: any; // Needed on Angular 8+

interface JobState {
    jobId: number;
    transcript_id: string;
    status: 'waiting' | 'processing' | 'done' | 'error';
    status_step: string;
    total_chunks: number;
    done_chunks: number;
}

@Component({
    selector: 'ai-writer',
    templateUrl: './ai-writer.component.html',
    styleUrls: ['./ai-writer.component.scss'],
    providers: [
        CrawlService,
        BlogService,
        ForumService,
        DomainService,
        YoutubeService,
        LogService,
    ],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AIWriterComponent implements OnInit, OnDestroy, AfterViewInit {
    temp: any;
    wordPopup: any;
    loading: boolean = false;

    // ai: any;

    uuid: string;
    name: string; // username của tác giả
    not_author: boolean = true;
    user: User;
    config: AppConfig;

    domain = null;
    domains = [{
        "domain": "https://type.vn",
        "username": "******",
        "password": "******",
        "name": "",
        "updatedAt": "2026-02-03T07:32:19.276Z",
        "id": "9658d755c35784e658d85564330099d3"
    }];
    synonyms = [];

    technology: String = 'wordpress';
    technologies = [
        { value: 'wordpress', viewValue: 'wordpress' },
        { value: 'nodebb', viewValue: 'nodebb' },
    ];

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    expanded: boolean = true;
    show_code: boolean = false;
    autohidden: boolean = true;

    detectForm: UntypedFormGroup;
    selectedIndex = 0;
    arr_keyword = [];

    seoScore: SEOScorePipe = new SEOScorePipe();
    slugifyPipe: SlugifyPipe = new SlugifyPipe();

    seo: any = {
        mainkey: '',
        title: {
            words: 0,
            characters: 0,
            findmainkey: -1,
        },
        description: {
            text: '',
            words: 0,
            characters: 0,
            findmainkey: -1,
        },
        heading: {
            h1: {
                total: 0,
                words: 0,
                characters: 0,
                findmainkey: -1,
            },
            h2: 0,
        },
        words: {
            total: 0,
            find_mainkey_in_first_paragraph: -1,
            find_mainkey_in_words: -1,
            mainkey_percent_in_words: 0,
        },
        links: 0,
        images: {
            total: 0,
            find_mainkey_in_alt: -1,
        },
    };

    settings: any;
    secretKey: any;
    searchAPIKey: any;
    style: any = {
        name: 'Phong cách tự do',
        desc: 'Văn phong thoải mái, gần gũi, dễ đọc',
    };
    styles: any = [];

    removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();
    @ViewChild('stepper') stepper: any;

    source: any = {
        p: [],
        span: [],
        li: [],
        i: [],
        dd: [],
        td: [],
        label: [],
        h1: [],
        h2: [],
        h3: [],
        h4: [],
        h5: [],
        a: [],
        table: [],
        img: [],
        source: [],
        iframe: [],
        pre: [],
        prompt: [],
        word: [],
        chatgpt: [],
        text: [
            `<p id="source-p-${uuid.v4()}">Click 2 lần vào đoạn văn này để chỉnh sửa.</p>`,
        ],
        empty: [],
        backup: {},
        playlist: [
            {
                youtube: [],
                tiktok: [],
                facebook: [],
            },
            {
                mp3: [],
            },
        ],
    };

    done: any = [];
    trash: any = [];

    details: any;

    time: Date = new Date();
    version_value: Date = new Date();
    new_version: number = -1; // -2 tạo mới version, -1 cập nhật bản gốc, 1, 2...

    timeLeft: number = 60;
    intervalAutoSave: any;

    // dành cho việc điều khiển trạng thái biến video thành bài viết
    videoExtractInterval: number = 1;
    jobStateMap = new Map<number, JobState>();
    jobStates: JobState[] = [];
    jobSubscriptions: Map<number, Subscription> = new Map();

    selectedCollections: any;
    collections: any[] = [];

    // tạo kết quả chỉnh sửa của đồng tác giả
    comments = [];

    // vẽ đường kết nối
    line: any = [];
    drag: any = [];

    score: number = 0;
    forumCategories: any = [];
    favoriteSeason: number = 1;

    permissionText2Voice: boolean = false;
    permissionVideo: boolean = false;

    private saveRouterStrategyReuseLogic: any;

    /* END TWO OBJECTS */
    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------
    selectedItems: Set<string> = new Set();

    toggleSelection(event: MouseEvent, item: string) {
        if (event.ctrlKey || event.metaKey) {
            if (this.selectedItems.has(item)) {
                this.selectedItems.delete(item);
            } else {
                this.selectedItems.add(item);
            }
        } else {
            this.selectedItems.clear();
            this.selectedItems.add(item);
        }
    }

    isSelected(item: string): boolean {
        // const id = $(item).attr('id');
        // console.log('id', id);
        return this.selectedItems.has(item);
    }

    checkseo() {
        this.score = 0;

        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        // tiêu đề
        if (
            this.seo.title.characters >= 30 &&
            this.seo.title.characters <= 60
        ) {
            this.score = this.score + 10;
        }

        if (this.seo.title.findmainkey > 0) {
            this.score = this.score + 10;
        }

        if (this.seo.title.findmainkey === 0) {
            this.score = this.score + 5;
        }

        // mô tả
        if (
            this.seo.description.characters >= 100 &&
            this.seo.description.characters <= 160
        ) {
            this.score = this.score + 10;
        }

        if (this.seo.description.findmainkey > 0) {
            this.score = this.score + 10;
        }

        // h1
        if (this.seo.heading.h1.total === 1) {
            this.score = this.score + 10;
        }

        if (this.seo.heading.h1.findmainkey >= 0) {
            this.score = this.score + 5;
        }

        // content
        if (this.seo.words.total > 300) {
            this.score = this.score + 10;
        }

        if (this.seo.words.find_mainkey_in_first_paragraph >= 0) {
            this.score = this.score + 10;
        }

        if (
            this.seo.words.mainkey_percent_in_words <= 8 &&
            this.seo.words.mainkey_percent_in_words > 0
        ) {
            this.score = this.score + 10;
        }

        // image
        if (this.seo['images'].total > 0) {
            this.score = this.score + 5;
        }

        // link
        if (this.seo['links'] >= 1) {
            this.score = this.score + 5;
        }
    }

    // tạo đường viền cho phần bình luận
    leader(id: string, id2: string, i: number, option?: any) {
        let startEl = document.getElementById(id);
        let endEl = document.getElementById(id2);

        this.line[i] = new LeaderLine(
            startEl,
            endEl,
            option
                ? option
                : {
                    endPlugOutline: false,
                    positionByWindowResize: true,
                    color: '#0c857a',
                    path: 'grid',
                    size: 3,
                    startPlug: 'disc',
                    endPlug: 'arrow',
                    animOptions: { duration: 3000, timing: 'linear' },
                },
        );

        this.line[i].position();
    }

    /**
     * Lựa chọn domain để kết nối
     */

    compareDomainFn = (o1: any, o2: any) => {
        if (!o1 || !o2) return o1 === o2;
        return o1._id === o2._id;
    };

    connect(e: any) {
        this.domain = e.value;
        this.multiAccountService.setItem('domain', this.domain);
    }

    compareStyleFn = (o1: any, o2: any) => {
        if (!o1 || !o2) return o1 === o2;
        return o1.name === o2.name;
    };

    chooseStyle(e: any) {
        this.style = e.value;
        localStorage.setItem('style', JSON.stringify(this.style));
    }

    /**
     * Kéo thả để xây dựng nội dung
     * Cho cả 2 khu là: Chế tác & Hoàn thiện
     */
    drop(event: CdkDragDrop<any[]>) {
        if (event.previousContainer === event.container) {
            moveItemInArray(
                event.container.data,
                event.previousIndex,
                event.currentIndex,
            );
        } else {
            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex,
            );

            // copyArrayItem(
            //     event.previousContainer.data,
            //     event.container.data,
            //     event.previousIndex,
            //     event.currentIndex,
            // );
        }

        const img = $(this.done[event.currentIndex])
            .find('img:first')
            .attr('src');
        // 1. Làm mờ ảnh hiện tại
        $(this.done[event.currentIndex]).find('img:first').css('opacity', 0.5);

        if (img) {
            this.uploadImage(img.replace('file:///', '')).subscribe(
                (result) => {
                    if (result && result?.data?.source_url) {
                        this.done[event.currentIndex] = this.done[
                            event.currentIndex
                        ].replace(img, result.data.source_url);
                    }
                },
            );
        }

        // tinh toan lai seo
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        // thiết kế comment
        this.showComments();

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    googleSearch(query: string, index: number, searchType?: string) {
        return this._blogService.googleSearchPromise({
            query: query,
            searchAPIKey: this.searchAPIKey,
            index: index,
            searchType: searchType,
        });
    }

    /**
     * Từ URL lấy nguyên liệu mẫu để
     * gắn vào source
     * mà hàm này không còn dùng nữa rồi
     */
    detect(event?: any) {
        event.preventDefault();

        if (this.detectForm.get('step2').get('url').value) {
            this._crawlService
                .storeNode({
                    url: this.detectForm.get('step2').get('url').value,
                    request: this.detectForm.get('step2').get('request').value,
                    type: 'website',
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (!result || result.length === 0) {
                            this.alert('Không tìm thấy từ khoá.');
                        } else {
                            if (result && result.success && result.data) {
                                this.generateID(result.data);

                                this.toastr.success(
                                    `Phân tích tài nguyên xong.`,
                                );
                            } else {
                                this.toastr.warning(
                                    'Phân tích tài nguyên không chính xác.',
                                );
                            }
                        }
                    },
                    error: () => {
                        this.toastr.error('Không thể phân tích tài nguyên.');
                    },
                    complete: () => {
                        this.stepper.selectedIndex = 0;

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    },
                });
        } else {
            this.toastr.warning('Bạn cần phải có Link tài nguyên.');
        }
    }

    /**
     * Từ URL lấy nguyên liệu mẫu để
     * gắn vào source
     */
    async clone(event?: any) {
        this.loading = !this.loading;
        event.preventDefault();

        if (this.detectForm.get('step2').get('url').value) {
            const url = this.detectForm.get('step2').get('url').value;

            this._logService
                .read({
                    url: url,
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (
                            result &&
                            result.success &&
                            result.data &&
                            result.data.title &&
                            result.data.textContent
                        ) {
                            this.cloneing(result.data);
                        } else {
                            this.loading = false;
                            this.cd.detectChanges();
                            this.toastr.error(
                                'Không thể phân tích tài nguyên.',
                            );
                        }
                    },
                    error: () => {
                        this.loading = false;
                        this.cd.detectChanges();
                        this.toastr.error('Không thể phân tích tài nguyên.');
                    },
                    complete: () => { },
                });
        } else {
            this.loading = false;
            this.cd.detectChanges();
            this.toastr.warning('Bạn cần phải có Link tài nguyên.');
        }
    }

    async cloneing(result: any) {
        try {
            let your_prompt = '';

            if (this.source.prompt.length > 0) {
                your_prompt = this.source.prompt.join('.');
                your_prompt = this.removeHTML.transform(your_prompt);
                your_prompt += '. ';
            }

            const prompt = `${your_prompt}Hãy viết dựa vào nội dung mẫu sau: "${result.textContent}", và tiêu đề mẫu: "${result.title}".
            Yêu cầu: Trả kết quả về định dạng JSON với key đầu tiên là title có value đúng định dạng viết hoa đầu câu và chứa một từ khoá chính.
            Key thứ hai là content với value là nội dung của blog trả về dạng HTML, đoạn văn đầu tiên chứa một từ khoá chính, không gắn link vào bài viết. Lưu ý khi nội dung trong đoạn văn mà có chứa table thì phải bê nguyên xi cái table đó vào content.
            Key thứ ba là long_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải trên 3 từ trở lên.
            Key thứ tư là short_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải dưới 3 từ trở xuống.
            Key thứ năm là description với value là bản tóm tắt ngắn gọn của blog, value dưới 160 từ chứa một khoá chính.
            Key thứ sáu là image_prompt với value là gợi ý tạo hình ảnh từ nội dung blog.
            Lưu ý: Viết theo phong cách của ${this.style.name} (mô tả phong cách ${this.style.desc}), trong key thứ hai content phải có ít nhất 1 thẻ h2 để làm SEO.
            Tôi muốn bạn trả về dữ liệu dưới định dạng JSON. Ví dụ:
            {
                "title": "Tiêu đề",
                "content": "Chi tiết",
                "long_keywords": [],
                "short_keywords": [],
                "description": "Mô tả",
                "image_prompt": "Mô tả"
            }
            Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
            Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const jsonText = response.text;
            if (jsonText) {
                const data = JSON.parse(jsonText);

                if (data) {
                    this.seo.description.text = data.description;
                    this.detectForm
                        .get('step1')
                        .get('title')
                        .setValue(data.title);
                    this.detectForm
                        .get('step1')
                        .get('description')
                        .setValue(data.description);

                    this.source.pre.push(
                        `<p id="source-pre-${uuid.v4()}">${data.image_prompt}</p>`,
                    );

                    this.detectForm
                        .get('step5')
                        .get('mainkey')
                        .setValue(
                            data.long_keywords[0] ||
                            data.short_keywords[0] ||
                            '',
                        );
                    this.arr_keyword = data.long_keywords.concat(
                        data.short_keywords,
                    );

                    this.stepper.selectedIndex = 0;

                    this.done.push(`${data.content}`);
                    this.toastr.success('Đã tạo nội dung thành công!');
                }
            }

            this.loading = false;
            this.cd.detectChanges();
        } catch (error) {
            this.toastr.error('Không thể tạo thành bài.');
            this.loading = false;
            this.cd.detectChanges();
        }
    }

    // tạo ra dữ liệu chỉnh sửa trong source
    generateID(data: any, cb?: any) {
        // // reset lai nguon
        // for (var k in this.source) {
        //     this.source[k] = [];
        // }

        this.source.iframe =
            data.others && data.others.iframe
                ? data.others.iframe
                : data.iframe
                    ? data.iframe
                    : [];

        if (data.source && data.source.length > 0) {
            data.source.map((i: string, _index: number) => {
                this.source.source.push(`${i}`);
            });
        }

        if (data.a && data.a.length > 0) {
            data.a.map((i: any) => {
                this.source.a.push(i.href ? i.href : i);
            });
        }

        if (data.img && data.img.length > 0) {
            data.img.map((i: any, _index: number) => {
                this.source.img.push(
                    `<img id="source-img-${uuid.v4()}" src="${i.src ? i.src : i}" alt="${i.alt ? i.alt : ''}" title="${i.title ? i.title : ''}" />`,
                );
            });
        }

        if (data.p && data.p.length > 0) {
            data.p.map((i: string, _index: number) => {
                this.source.p.push(`<p id="source-p-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.others && data.others.span && data.others.span.length > 0) {
            data.others.span.map((i: string, _index: number) => {
                this.source.span.push(
                    `<p id="source-span-${uuid.v4()}">${i}</p>`,
                );
            });
        }

        if (data.span && data.span.length > 0) {
            data.span.map((i: string, _index: number) => {
                this.source.span.push(
                    `<p id="source-span-${uuid.v4()}">${i}</p>`,
                );
            });
        }

        if (data.others && data.others.li && data.others.li.length > 0) {
            data.others.li.map((i: string, _index: number) => {
                this.source.li.push(`<p id="source-li-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.li && data.li.length > 0) {
            data.li.map((i: string, _index: number) => {
                this.source.li.push(`<p id="source-li-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.others && data.others.i && data.others.i.length > 0) {
            data.others.i.map((i: string, _index: number) => {
                this.source.i.push(`<p id="source-i-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.i && data.i.length > 0) {
            data.i.map((i: string, _index: number) => {
                this.source.i.push(`<p id="source-i-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.others && data.others.pre && data.others.pre.length > 0) {
            data.others.pre.map((i: string, _index: number) => {
                this.source.pre.push(
                    `<p id="source-pre-${uuid.v4()}">${i}</p>`,
                );
            });
        }

        if (data.pre && data.pre.length > 0) {
            data.pre.map((i: string, _index: number) => {
                this.source.pre.push(`${i}`);
            });
        }

        if (data.prompt && data.prompt.length > 0) {
            data.prompt.map((i: string, _index: number) => {
                this.source.p.push(
                    `<p id="source-prompt-${uuid.v4()}">${i}</p>`,
                );
            });
        }

        if (data.others && data.others.dd && data.others.dd.length > 0) {
            data.others.dd.map((i: string, _index: number) => {
                this.source.dd.push(`<p id="source-dd-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.dd && data.dd.length > 0) {
            data.dd.map((i: string, _index: number) => {
                this.source.dd.push(`<p id="source-dd-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.others && data.others.td && data.others.td.length > 0) {
            data.others.td.map((i: string, _index: number) => {
                this.source.td.push(`<p id="source-td-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.td && data.td.length > 0) {
            data.td.map((i: string, _index: number) => {
                this.source.td.push(`<p id="source-td-${uuid.v4()}">${i}</p>`);
            });
        }

        if (data.others && data.others.label && data.others.label.length > 0) {
            data.others.label.map((i: string, _index: number) => {
                this.source.label.push(
                    `<p id="source-label-${uuid.v4()}">${i}</p>`,
                );
            });
        }

        if (data.label && data.label.length > 0) {
            data.label.map((i: string, _index: number) => {
                this.source.label.push(
                    `<p id="source-label-${uuid.v4()}">${i}</p>`,
                );
            });
        }

        if (data.heading && data.heading.h1 && data.heading.h1.length > 0) {
            data.heading.h1.map((i: string, _index: number) => {
                this.source.h1.push(
                    `<h1 id="source-h1-${uuid.v4()}">${i}</h1>`,
                );
            });
        }

        if (data.h1 && data.h1.length > 0) {
            data.h1.map((i: string, _index: number) => {
                this.source.h1.push(
                    `<h1 id="source-h1-${uuid.v4()}">${i}</h1>`,
                );
            });
        }

        if (data.heading && data.heading.h2 && data.heading.h2.length > 0) {
            data.heading.h2.map((i: string, _index: number) => {
                this.source.h2.push(
                    `<h2 id="source-h2-${uuid.v4()}">${i}</h2>`,
                );
            });
        }

        if (data.h2 && data.h2.length > 0) {
            data.h2.map((i: string, _index: number) => {
                this.source.h2.push(
                    `<h2 id="source-h2-${uuid.v4()}">${i}</h2>`,
                );
            });
        }

        if (data.heading && data.heading.h3 && data.heading.h3.length > 0) {
            data.heading.h3.map((i: string, _index: number) => {
                this.source.h3.push(
                    `<h3 id="source-h3-${uuid.v4()}">${i}</h3>`,
                );
            });
        }

        if (data.h3 && data.h3.length > 0) {
            data.h3.map((i: string, _index: number) => {
                this.source.h3.push(
                    `<h3 id="source-h3-${uuid.v4()}">${i}</h3>`,
                );
            });
        }

        if (data.heading && data.heading.h4 && data.heading.h4.length > 0) {
            data.heading.h4.map((i: string, _index: number) => {
                this.source.h4.push(
                    `<h4 id="source-h4-${uuid.v4()}">${i}</h4>`,
                );
            });
        }

        if (data.h4 && data.h4.length > 0) {
            data.h4.map((i: string, _index: number) => {
                this.source.h4.push(
                    `<h4 id="source-h4-${uuid.v4()}">${i}</h4>`,
                );
            });
        }

        if (data.heading && data.heading.h5 && data.heading.h5.length > 0) {
            data.heading.h5.map((i: string, _index: number) => {
                this.source.h5.push(
                    `<h5 id="source-h5-${uuid.v4()}">${i}</h5>`,
                );
            });
        }

        if (data.h5 && data.h5.length > 0) {
            data.h5.map((i: string, _index: number) => {
                this.source.h5.push(
                    `<h5 id="source-h5-${uuid.v4()}">${i}</h5>`,
                );
            });
        }

        if (data.playlist && data.playlist.length > 0) {
            data.playlist.map((a: any, _index: number) => {
                if (a.youtube && a.youtube.length > 0) {
                    a.youtube.map((i: string) => {
                        this.source.playlist[_index].youtube.push(
                            `<p id="source-youtube-${uuid.v4()}">${i}</p>`,
                        );
                    });
                }
            });
        }

        this.detectForm.get('step1').get('title').setValue(data.title);

        if (cb) {
            cb();
        }
    }

    /**
     * Thay đổi thuật toán & từ khoá bóc tách URL
     */
    code() { }

    markdown2html(source: any, index: number) {
        if (!source[index]) return;
        source[index] = marked.parse(source[index]) as string;
    }

    tomp3(item: any) {
        const dialogRef = this.dialog.open(AIText2SpeechComponent, {
            width: '600px',
            height: '540px',
            data: item,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                this.toastr.success(`Tạo mp3 từ đoạn văn xong.`);

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    /**
     * Dời toàn bộ đoạn văn bản sang dàn ý
     */
    moveall(data: any, event: MouseEvent) {
        event.preventDefault();

        data.map((content: string) => {
            this.done.push(content);
        });

        // tinh toan lai done
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        this.showComments();

        // lam moi lai giao dien
        this.cd.markForCheck();
        this.toastr.success(`Đã chuyển đoạn văn xong.`);
    }

    /**
     * Chuyển toàn bộ đoạn văn bản sang dàn ý
     */
    copyall(data: any, event: MouseEvent) {
        event.preventDefault();

        data.map((content: string) => {
            this.done.push(content);
        });

        // tinh toan lai done
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        this.showComments();

        // lam moi lai giao dien
        this.cd.markForCheck();
        this.toastr.success(`Đã chuyển đoạn văn xong.`);
    }

    /**
     * Xoá toàn bộ
     */
    clearall(event: MouseEvent) {
        event.preventDefault();

        // tinh toan lai done
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        this.showComments();

        // lam moi lai giao dien
        this.cd.markForCheck();
        this.toastr.success(`Đã xoá xong.`);
    }

    /**
     * Chuyển đoạn văn bản sang Dàn ý
     */
    copyto(data: any) {
        this.done.push(data);
        this.toastr.success(`Đã chuyển đoạn văn xong.`);

        // tinh toan lai done
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        this.showComments();

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    /**
     * Tự động tách đoạn
     */
    async split(data: any, index: number) {
        let content = data[index];

        if (!content || typeof content !== 'string') {
            this.toastr.warning(`Dữ liệu không hợp lệ.`);
            return;
        }

        this.loading = true;
        this.cd.markForCheck();

        try {
            const prompt = `Bạn là một chuyên gia chỉnh sửa và cấu trúc văn bản.
Tôi có một khối văn bản dài (có thể chứa mã HTML). Hãy phân tích ngữ nghĩa và cấu trúc của nó, sau đó tách nó ra thành các đoạn văn ngắn gọn, dễ đọc, mạch lạc hơn theo đúng ngữ cảnh.
Yêu cầu: 
- Giữ nguyên tất cả các thẻ HTML (đặc biệt là <ul>, <ol>, <li>, <img>, <iframe>, <a>, <strong>, <em>, ...). 
- KHÔNG làm mất bất kỳ thẻ HTML nào, KHÔNG làm mất chữ nào, KHÔNG tự ý bịa thêm nội dung, chỉ là chia nhỏ đoạn văn đó ra cho hợp lý.
- Trả về dữ liệu dưới định dạng JSON với key là "paragraphs" có value là mảng các chuỗi (Array of Strings). Mỗi phần tử trong mảng là 1 đoạn văn sau khi tách.
Ví dụ:
{
    "paragraphs": [
        "Đoạn 1...",
        "Đoạn 2..."
    ]
}
Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown (\`\`\`json), không có giải thích.
Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.

Nội dung cần tách:
${content}`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const jsonText = response.text;
            if (jsonText) {
                // Đôi khi AI vẫn trả về chuỗi bọc trong markdown code block
                const cleanedJsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
                const result = JSON.parse(cleanedJsonText);
                let parts = result.paragraphs;

                if (parts && parts.length > 0) {
                    data.splice(index, 1, ...parts);
                    this.toastr.success(`Đã dùng AI tách thành ${parts.length} đoạn.`);
                    this.cd.markForCheck();
                } else {
                    this.toastr.warning(`Không thể tách đoạn.`);
                }
            } else {
                this.toastr.warning(`Không nhận được phản hồi từ AI.`);
            }
        } catch (error) {
            console.error(error);
            this.toastr.error(`Lỗi khi dùng AI tách đoạn.`);
        } finally {
            this.loading = false;
            this.cd.markForCheck();
        }
    }

    /**
     * Tạo nội dung mới bằng cách gõ nhập
     */
    createNode() {
        this.source.text.push(`<p id="source-text-${uuid.v4()}"></p>`);
        const lastIndex = this.source.text.length - 1;
        this.edit(this.source.text, lastIndex);
    }

    /**
     * Tự động viết nội dung nhanh
     */
    createShortBlog(item: any, index: number) {
        let img = '';
        try {
            if (typeof item[index] === 'string' && item[index].trim().startsWith('<')) {
                img = $($.parseHTML(item[index])).find('img:first').attr('src') || '';
            }
        } catch (e) { }

        let prompt = '';
        if (this.source.prompt && this.source.prompt.length > 0) {
            prompt = this.source.prompt.join('. ');
            if (this.removeHTML) prompt = this.removeHTML.transform(prompt);
        }

        if (!prompt.trim()) {
            prompt = 'Mô tả chi tiết và sinh động bức ảnh này';
        }

        this.toastr.info('Đang phân tích hình ảnh và viết blog...', 'Đợi chút nhé');

                this._blogService
                    .uploadImage({
                        imagePath: img.replace('file:///', ''),
                        username: this.user.name,
                    })
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: async (result) => {
                            if (result) {
                                let parts: any[] = [
                                    {
                                        text: `${prompt} dựa vào những hình ảnh đính kèm. Blog mang phong cách của ${this.style.name} (mô tả phong cách ${this.style.desc}). Tôi muốn bạn trả về dữ liệu dưới định dạng JSON với key đầu tiên là contents có value là Array. Ví dụ:
                                    {
                                        "contents": ["Chi tiết 1", "Chi tiết 2"]
                                    }
                                    Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
                                    Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.` }
                                ];

                                // Thêm ảnh vừa upload dưới dạng inlineData
                                parts.push({
                                    inlineData: {
                                        mimeType: result.mimeType,
                                        data: result.buffer,
                                    },
                                });

                                // Call AI to generate content
                                const response = await this._genaiService.generateContent({
                                    model: 'gemini-3.5-flash',
                                    contents: [{ role: 'user', parts: parts }],
                                });

                                const jsonText = response.text;
                                if (jsonText) {
                                    const data = JSON.parse(jsonText);

                                    data.contents.map((text: string) => {
                                        this.source.text.push(
                                            `<p id="source-p-${uuid.v4()}">${text}</p>`,
                                        );
                                    });

                                    this.source.pre.push(
                                        `<p id="source-pre-${uuid.v4()}">${data.image_prompt}</p>`,
                                    );

                                    // lam moi lai giao dien
                                    this.cd.markForCheck();
                                    this.toastr.success(
                                        'Đã tạo nội dung từ hình ảnh.',
                                    );
                                }
                            }
                        },
                        error: (e: any) => {
                            this.toastr.warning('Không tải được hình ảnh.');
                        },
                        complete: () => { },
                    });

                // this.source.text = this.source.text.concat(result.data);

                // lam moi lai giao dien
                this.cd.markForCheck();
    }

    loadingDreamina: { [key: number]: boolean } = {};

    /**
     * Chi tiết lưu trữ
     */
    allFiles() {
        const dialogRef = this.dialog.open(MediaDataDialog, {
            width: '80%',
            height: '80%',
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                this.source.img.push(
                    `<p id="source-img-${uuid.v4()}"><img src="${result.img}" /></p>`,
                );

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    async createImgWithDreamina(url: string, item: any, isVid: boolean = false, index: number = -1) {
        if (!this._userService.permissionDreamina(this.user)) {
            this.toastr.error('Đây là chức năng trả phí.');
            return;
        }

        const promptText = this.removeHTML.transform(item);

        // NẾU BẬT MÌ TÔM AI -> DÙNG MÌ TÔM AI THAY VÌ MỞ DREAMINA
        if (this._genaiService.isUModelverseEnabled()) {
            this.toastr.info(`Đang tiến hành tạo ${isVid ? 'video' : 'ảnh'} qua hệ thống Mì Tôm AI...`);
            if (index > -1) {
                this.loadingDreamina[index] = true;
                this.cd.markForCheck();
            }
            try {
                if (isVid) {
                    const base64Str = await this._genaiService.generateVideoUModelverse(promptText);
                    if (base64Str) {
                        const fileName = `umodelverse_video_${Date.now()}.mp4`;
                        const res = await (window as any).electron.invoke('save-base64', {
                            base64: base64Str,
                            fileName: fileName,
                            folder: 'thumbnails',
                            username: this.user.name
                        });

                        if (res && res.success) {
                            this.source.playlist[0]['youtube'].unshift(
                                `<p id="source-youtube-${uuid.v4()}">local-video:${res.path}</p>`
                            );
                            this.toastr.success('Video đã tạo thành công và thêm vào danh sách.');
                            this.cd.markForCheck();
                        } else {
                            this.toastr.error('Lưu video thất bại: ' + (res?.error || 'Unknown error'));
                        }
                    }
                } else {
                    const response = await this._genaiService.generateContent({
                        model: 'gemini-3.1-flash-image-preview',
                        contents: [{ role: 'user', parts: [{ text: promptText }] }],
                        config: { responseModalities: ['IMAGE'] }
                    } as any);

                    let base64Str = '';
                    const parts = response.candidates?.[0]?.content?.parts || [];
                    for (const part of parts) {
                        if (part.inlineData && part.inlineData.data) {
                            base64Str = part.inlineData.data;
                            break;
                        }
                    }

                    if (base64Str) {
                        const fileName = `umodelverse_image_${Date.now()}.png`;
                        const res = await (window as any).electron.invoke('save-base64', {
                            base64: base64Str,
                            fileName: fileName,
                            folder: 'thumbnails',
                            username: this.user.name
                        });

                        if (res && res.success) {
                            this.source.img.unshift(
                                `<p id="source-img-${uuid.v4()}"><img src="file://${res.path}" /></p>`
                            );
                            this.toastr.success('Hình ảnh đã tạo thành công và lưu vào ổ cứng.');
                            this.cd.markForCheck();
                        } else {
                            this.toastr.error('Lưu ảnh thất bại: ' + (res?.error || 'Unknown error'));
                        }
                    } else {
                        console.error('Invalid image response from UModelverse:', response);
                        this.toastr.error('Không tìm thấy dữ liệu ảnh trả về từ máy chủ!');
                        // Ghi ra file để debug
                        try {
                            await (window as any).electron.invoke('save-base64', {
                                base64: btoa(unescape(encodeURIComponent(JSON.stringify(response)))),
                                fileName: `debug_response_${Date.now()}.txt`,
                                folder: 'thumbnails',
                                username: this.user.name
                            });
                        } catch (e) { }
                    }
                }
            } catch (err: any) {
                this.toastr.error(`Lỗi tạo ${isVid ? 'video' : 'ảnh'}: ${err.message || 'Lỗi không xác định'}`);
            } finally {
                if (index > -1) {
                    this.loadingDreamina[index] = false;
                    this.cd.markForCheck();
                }
            }
            return;
        }

        // Sao chép nội dung prompt vào clipboard
        this.clipboard.copy(promptText);
        this.toastr.info('Đã sao chép câu lệnh vào bộ nhớ tạm.');

        if (window && (window as any).electron) {
            this.toastr.success('Mở trình duyệt AI Studio...');
            (window as any).electron.tools({
                command: 'dreamina.capcut',
                targetUrlWithUniqueID: url,
                uniqueID: 'dreamina',
                username: this.user.name,
                options: {
                    prompt: promptText, // Tự động dán nếu backend hỗ trợ
                }
            });
        }
    }

    /**
     * Tạo ảnh mới bằng cách gõ nhập
     */
    createImg0() {
        this.source.img.push(`<p id="source-img-${uuid.v4()}"></p>`);
        const lastIndex = this.source.img.length - 1;

        this.edit(this.source.img, lastIndex);
    }

    // upload ảnh lên server
    uploadImage(imagePath: string) {
        return this._blogService
            .uploadImage({
                imagePath: imagePath,
                domain: this.domain,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll));
    }

    // upload hình lên server
    createImg = async (e: any) => {
        const files: FileList = e.target.files;

        if (files && files.length > 0) {
            this.loading = true;

            try {
                let your_prompt = '';

                if (this.source.prompt.length > 0) {
                    your_prompt = this.source.prompt.join('.');
                    your_prompt = this.removeHTML.transform(your_prompt);
                    your_prompt += '. ';
                }

                let parts: any[] = [
                    {
                        text: `${your_prompt}Nội dung mang phong cách của ${this.style.name} (mô tả phong cách ${this.style.desc}). Tôi muốn bạn trả về dữ liệu dưới định dạng JSON với key đầu tiên là contents có value là Array. Ví dụ:
                    {
                        "contents": ["Chi tiết 1", "Chi tiết 2"]
                    }
                    Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
                    Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.` }
                ];

                // Convert FileList to Base64
                const uploadPromises = Array.from(files).map(
                    (file: File) => new Promise<any>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e: any) => {
                            const base64Data = e.target.result.split(',')[1];
                            resolve({
                                inlineData: {
                                    mimeType: file.type,
                                    data: base64Data
                                }
                            });
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    })
                );

                // Wait for all files to be read
                const imageParts = await Promise.all(uploadPromises);
                parts.push(...imageParts);

                // Call AI to generate content
                const response = await this._genaiService.generateContent({
                    model: 'gemini-3.5-flash',
                    contents: [{ role: 'user', parts: parts }],
                });

                const jsonText = response.text;
                if (jsonText) {
                    const data = JSON.parse(jsonText);

                    data.contents.map((text: string) => {
                        this.source.text.push(
                            `<p id="source-p-${uuid.v4()}">${text}</p>`,
                        );
                    });

                    if (data.image_prompt) {
                        this.source.pre.push(
                            `<p id="source-pre-${uuid.v4()}">${data.image_prompt}</p>`,
                        );
                    }

                    this.toastr.success('Đã tạo nội dung từ hình ảnh.');

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }

                this.loading = false;

                // this._blogService.img2text({
                //     file: file,
                //     username: this.user.name
                // })
                //     .pipe(takeUntil(this._unsubscribeAll))
                //     .subscribe({
                //         next: async (result) => {
                //             if (result && result.body) {
                //                 this.source.img.push(`<p id="source-img-${uuid.v4()}"><img src="${result.body.url}" /></p>`);
                //                 // this.text2Node(text);

                //                 // lam moi lai giao dien
                //                 this.cd.markForCheck();
                //             }
                //         },
                //         error: () => {
                //             this.toastr.error('Chuyển văn bẳn thất bại.');
                //         },
                //         complete: () => {
                //             this.toastr.success('Chuyển hình ảnh thành văn bản.');
                //         }
                //     });
            } catch (error) {
                this.loading = false;
                this.toastr.error('Không tạo bài viết từ hình ảnh.');
            }
        }
    };

    // Xử lý dán hình ảnh khi focus vào section "Biến Hình ảnh thành Bài"
    onPaste(e: ClipboardEvent) {
        const files: FileList | null = e.clipboardData?.files || null;
        if (files && files.length > 0) {
            let hasImage = false;
            const imageFiles: File[] = [];
            for (let i = 0; i < files.length; i++) {
                if (files[i].type.startsWith('image/')) {
                    hasImage = true;
                    imageFiles.push(files[i]);
                }
            }

            if (hasImage) {
                const target = e.target as HTMLElement;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                    // if user is actively typing in a form field, don't hijack unless they want to.
                    // Wait, sometimes they want to paste into contenteditable.
                    // Actually, if they are just pasting an image anywhere, uploading it to the AI image writer is highly likely the intent.
                }

                // create a mock event for createImg

                // Create a DataTransfer object to hold the image files if we want to mimic FileList, 
                // but our createImg just iterates over e.target.files which behaves like an array.
                const mockEvent = { target: { files: imageFiles } };
                this.createImg(mockEvent);
                e.preventDefault();
            }
        }
    }

    /**
     * Tạo a mới bằng cách gõ nhập
     */
    createPrompt() {
        this.source.prompt.push(`<p id="source-prompt-${uuid.v4()}"></p>`);
        const lastIndex = this.source.prompt.length - 1;
        this.edit(this.source.prompt, lastIndex);
    }

    attachedFiles: File[] = [];

    uploadFilesToPrompt(e: any) {
        const files: FileList = e.target.files;
        if (files && files.length > 0) {
            Array.from(files).forEach((file: File) => {
                this.attachedFiles.push(file);
            });
            this.toastr.success('Đã đính kèm tệp thành công. Bạn có thể yêu cầu AI làm việc ngay.');
        }
    }

    async processPromptWithFiles(event?: any) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        let promptText = '';
        if (this.source.prompt && this.source.prompt.length > 0) {
            promptText = this.source.prompt.join('. ');
            if (this.removeHTML) promptText = this.removeHTML.transform(promptText) || '';
        }

        if (!(promptText || '').trim() && (!this.attachedFiles || this.attachedFiles.length === 0)) {
            this.toastr.warning('Bạn cần nhập prompt hoặc đính kèm tệp để AI làm việc.');
            return;
        }

        if (!this.source.text) {
            this.source.text = [];
        }

        this.loading = true;
        this.toastr.info('AI đang xử lý yêu cầu của bạn...', 'Đợi chút nhé');

        const styleGuide = this.style ? ` Blog mang phong cách của ${this.style.name} (mô tả phong cách ${this.style.desc}).` : '';
        try {
            let promptTextAccumulator = (promptText || '') + styleGuide + `\nTrình bày câu trả lời của bạn dưới định dạng JSON với key là "contents", value là một mảng các đoạn văn. Không dùng markdown.`;
            let parts: any[] = [];
            
            if (this.attachedFiles.length > 0) {
                const uploadPromises = this.attachedFiles.map(
                    (file: File) => new Promise<any>((resolve, reject) => {
                        const isText = file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv') || file.name.endsWith('.json');
                        const isPdf = file.name.toLowerCase().endsWith('.pdf');

                        const reader = new FileReader();
                        if (isText) {
                            reader.onload = (e: any) => {
                                resolve({ type: 'text', content: `\n--- Nội dung file ${file.name} ---\n${e.target.result}\n--- Hết file ---` });
                            };
                            reader.onerror = reject;
                            reader.readAsText(file);
                        } else {
                            reader.onload = (e: any) => {
                                const base64Data = e.target.result.split(',')[1];
                                let mimeType = file.type;
                                if (!mimeType) {
                                    if (file.name.toLowerCase().endsWith('.png')) mimeType = 'image/png';
                                    else if (isPdf) mimeType = 'application/pdf';
                                    else mimeType = 'image/jpeg';
                                }
                                resolve({
                                    type: 'image',
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: base64Data
                                    }
                                });
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        }
                    })
                );
                
                const fileResults = await Promise.all(uploadPromises);
                for (const res of fileResults) {
                    if (res.type === 'text') {
                        promptTextAccumulator += res.content;
                    } else if (res.type === 'image') {
                        parts.push({ inlineData: res.inlineData });
                    }
                }
            }
            
            // Add the combined text as the first part
            parts.unshift({ text: promptTextAccumulator });

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: parts }],
            });

            const jsonText = response.text;
            if (jsonText) {
                try {
                    const data = JSON.parse(jsonText);
                    if (data.contents && Array.isArray(data.contents)) {
                        data.contents.forEach((text: string) => {
                            this.source.text.push(`<p id="source-p-${uuid.v4()}">${text}</p>`);
                        });
                        this.toastr.success('AI đã hoàn thành công việc!');
                        this.attachedFiles = [];
                        this.cd.markForCheck();
                    } else {
                        // Fallback if no contents array
                        this.source.text.push(`<p id="source-p-${uuid.v4()}">${jsonText}</p>`);
                        this.toastr.success('AI đã hoàn thành công việc!');
                        this.attachedFiles = [];
                        this.cd.markForCheck();
                    }
                } catch(e) {
                    this.source.text.push(`<p id="source-p-${uuid.v4()}">${jsonText}</p>`);
                    this.toastr.success('AI đã hoàn thành công việc!');
                    this.attachedFiles = [];
                    this.cd.markForCheck();
                }
            }
        } catch (error: any) {
            console.error('Lỗi khi gửi AI: ', error);
            this.toastr.error('Có lỗi xảy ra: ' + (error?.message || 'Không thể kết nối tới AI.'));
        } finally {
            this.loading = false;
            this.cd.detectChanges();
        }
    }

    removeAttachedFile(index: number) {
        this.attachedFiles.splice(index, 1);
    }

    /**
     * Tạo a mới bằng cách gõ nhập
     */
    async createlink(keyword?: string) {
        if (keyword) {
            try {
                let query = keyword;
                if (this.domain && this.domain.domain) {
                    query = `site:${this.domain.domain} ${keyword}`;
                }

                const links: any = await this.googleSearch(query, 0);

                if (links && links.length > 0) {
                    const topLinks = links.slice(0, 10);
                    
                    topLinks.forEach(link => {
                        const title = link.title || link.link;
                        this.source.a.push(`<p id="source-a-${uuid.v4()}">Xem thêm: <a href="${link.link}" title="${title}" target="_blank">${title}</a></p>`);
                    });
                    
                    this.toastr.success(`Đã thêm ${topLinks.length} backlink vào Gắn Backlink.`);
                    this.cd.markForCheck();
                } else {
                    this.toastr.info(`Không tìm thấy kết quả nào cho từ khóa này.`);
                }
            } catch (error) {
                this.toastr.error('Lỗi khi tìm kiếm google');
                console.error(error);
            }
        } else {
            this.source.a.push(`<p id="source-a-${uuid.v4()}"></p>`);
            const lastIndex = this.source.a.length - 1;
            this.edit(this.source.a, lastIndex);
        }
    }

    /**
     * Bắt đầu auto refresh 1 job
     */
    showInputUrl: boolean = false;
    videoUrl: string = '';

    insertVideoUrlSubmit() {
        if (this.videoUrl && this.videoUrl.trim() !== '') {
            this.source.playlist[0]['youtube'].unshift(
                `<p id="source-youtube-${uuid.v4()}">${this.videoUrl.trim()}</p>`
            );
            this.toastr.success('Đã thêm đường dẫn video vào danh sách.');
            this.videoUrl = '';
            this.showInputUrl = false;
            this.cd.markForCheck();
        }
    }

    insertVideoUrl() {
        this.showInputUrl = !this.showInputUrl;
    }

    /**
     * Bắt đầu auto refresh 1 job
     */
    async insertVideo() {
        let electronApi = null;
        if (window && (window as any).electron) {
            electronApi = (window as any).electron;
        }

        if (electronApi) {
            // Chạy trong môi trường Electron: Dùng native dialog để lấy đường dẫn tuyệt đối chuẩn xác
            const filePath = await electronApi.invoke('select-video-file');
            if (filePath) {
                this.source.playlist[0]['youtube'].unshift(
                    `<p id="source-youtube-${uuid.v4()}">${filePath}</p>`
                );
                this.toastr.success('Đã thêm video từ máy tính vào danh sách.');
                this.cd.markForCheck();
            }
        } else {
            // Chạy trên web bình thường (fallback)
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = (e: any) => {
                const file = e.target.files[0];
                if (file) {
                    const filePath = file.path || file.name;
                    this.source.playlist[0]['youtube'].unshift(
                        `<p id="source-youtube-${uuid.v4()}">${filePath}</p>`
                    );
                    this.toastr.success('Đã thêm video từ máy tính vào danh sách.');
                    this.cd.markForCheck();
                }
            };
            input.click();
        }
    }

    startTracking(transcript_id: string, jobId: number) {
        if (this.jobSubscriptions.has(jobId)) return;

        const sub = interval(5000)
            .pipe(switchMap(() => this.transcriptDetails(transcript_id, false)))
            .subscribe((transcript: any) => {
                const full_text = transcript.full_text;

                this.updateJobState(jobId, {
                    status: transcript.status,
                    transcript_id: transcript.id,
                    done_chunks: transcript.done_chunks
                        ? transcript.done_chunks
                        : 0,
                    total_chunks: transcript.total_chunks
                        ? transcript.total_chunks
                        : 0,
                    status_step: transcript.status_step,
                });

                if (
                    transcript.status === 'done' &&
                    full_text &&
                    full_text.length > 0
                ) {
                    this.convertTranscript2Post(transcript);
                    this.stopTracking(jobId);
                }

                this.cd.detectChanges();
            });

        this.jobSubscriptions.set(jobId, sub);
    }

    // Hủy 1 job
    stopTracking(jobId: number) {
        const sub = this.jobSubscriptions.get(jobId);
        if (sub) {
            sub.unsubscribe();
            this.jobSubscriptions.delete(jobId);
        }
    }

    updateJobState(jobId: number, patch: Partial<JobState>) {
        const current = this.jobStateMap.get(jobId) || ({ jobId } as JobState);
        const updated = { ...current, ...patch };

        this.jobStateMap.set(jobId, updated);

        // VERY IMPORTANT: làm cho Angular detect change
        this.jobStateMap = new Map(this.jobStateMap);
    }

    getJobState(jobId: number): JobState | undefined {
        return this.jobStateMap.get(jobId);
    }

    async convertVideo2Post(item: any, jobId: number) {
        if (!this._userService.permissionVideo(this.user)) {
            this.toastr.error('Đây là chức năng trả phí.');
            return;
        }

        let content = this.removeHTML.transform(item).trim();
        if (content.startsWith('local-video:')) {
            content = content.substring('local-video:'.length);
        }

        // Khởi tạo state cho job (giả lập giống cách cũ để UI không bị vỡ)
        this.jobStates.push({
            jobId: jobId,
            transcript_id: 'ai-direct-' + jobId,
            status: 'processing',
            done_chunks: 0,
            total_chunks: 1,
            status_step: 'processing',
        });

        this.updateJobState(jobId, {
            status: 'processing',
            transcript_id: 'ai-direct-' + jobId,
            done_chunks: 0,
            total_chunks: 1,
            status_step: 'processing',
        });

        this.loading = true;
        this.cd.detectChanges();

        try {
            let your_prompt = '';

            if (this.source.prompt.length > 0) {
                your_prompt = this.source.prompt.join('.');
                your_prompt = this.removeHTML.transform(your_prompt);
                your_prompt += '. ';
            }

            const prompt = `${your_prompt}Dựa vào video tại đường dẫn sau: ${content}, hãy phân tích chi tiết hình ảnh, âm thanh, giọng điệu, chữ viết xuất hiện trên màn hình (OCR) và nội dung video để viết thành một bài blog hoàn chỉnh. (Hãy chú ý kĩ các văn bản hoặc phụ đề được ghép trực tiếp trên video).
            Yêu cầu: Trả kết quả về định dạng JSON với key đầu tiên là title có value đúng định dạng viết hoa đầu câu và chứa một từ khoá chính.
            Key thứ hai là content với value là nội dung của blog trả về dạng HTML, đoạn văn đầu tiên chứa một từ khoá chính, không gắn link vào bài viết. Lưu ý khi nội dung trong đoạn văn mà có chứa table thì phải bê nguyên xi cái table đó vào content.
            Key thứ ba là long_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải trên 3 từ trở lên.
            Key thứ tư là short_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải dưới 3 từ trở xuống.
            Key thứ năm là description với value là bản tóm tắt ngắn gọn của blog, value dưới 160 từ chứa một khoá chính.
            Key thứ sáu là image_prompt với value là gợi ý tạo hình ảnh từ nội dung blog.
            Lưu ý: Viết theo phong cách của ${this.style.name} (mô tả phong cách ${this.style.desc}), trong key thứ hai content phải có ít nhất 1 thẻ h2 để làm SEO.
            Tôi muốn bạn trả về dữ liệu dưới định dạng JSON. Ví dụ:
            {
                "title": "Tiêu đề",
                "content": "Chi tiết",
                "long_keywords": [],
                "short_keywords": [],
                "description": "Mô tả",
                "image_prompt": "Mô tả"
            }
            Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
            Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.`;

            let parts: any[] = [{ text: prompt }];

            // Gọi IPC xuống Electron Backend để download & extract frames
            let electronApi = null;
            if (window && window.electron) {
                electronApi = window.electron;
            }

            if (electronApi) {
                this.toastr.info('Đang khởi tạo quá trình phân tích video ở dưới nền...');

                let unsubscribeLog: any = null;
                let lastToastTime = 0;
                if (electronApi.onToolsLog) {
                    unsubscribeLog = electronApi.onToolsLog((msg: string) => {
                        if (msg && msg.includes('[AI Analyze]')) {
                            const cleanMsg = msg.replace('[AI Analyze]', '').trim();

                            let shortMsg = cleanMsg;
                            if (shortMsg.includes('Bắt đầu trích xuất')) shortMsg = 'Đang trích xuất frames...';
                            else if (shortMsg.includes('Sử dụng video')) shortMsg = 'Đang đọc video...';
                            else if (shortMsg.includes('Trích xuất thành công')) shortMsg = 'Hoàn tất trích xuất...';
                            else if (shortMsg.includes('[download]')) shortMsg = 'Đang tải video...';
                            else shortMsg = shortMsg.substring(0, 30) + '...';

                            this.updateJobState(jobId, { status_step: shortMsg });

                            if (cleanMsg.includes('[download]')) {
                                // Throttle download logs to avoid spam
                                const now = Date.now();
                                if (now - lastToastTime > 5000) {
                                    this.toastr.info(cleanMsg);
                                    lastToastTime = now;
                                }
                            } else {
                                this.toastr.info(cleanMsg);
                            }
                        }
                    });
                }

                let result: any;
                try {
                    result = await electronApi.invoke('analyze-video-local', { 
                        url: content, 
                        extractInterval: this.videoExtractInterval,
                        customCookies: this.settings?.customCookies
                    });
                } finally {
                    if (unsubscribeLog) unsubscribeLog();
                }

                if (!result.success) {
                    throw new Error(result.error || 'Lỗi khi trích xuất video');
                }

                if (result.frames && result.frames.length > 0) {
                    this.toastr.info(`Đã trích xuất ${result.frames.length} cảnh. Đang đưa cho AI phân tích...`);
                    // Thêm từng frame vào Gemini
                    for (const frameBase64 of result.frames) {
                        const base64Data = frameBase64.split(',')[1] || frameBase64;
                        parts.push({
                            inlineData: {
                                data: base64Data,
                                mimeType: 'image/jpeg'
                            }
                        });
                    }

                    // Thêm Âm thanh vào Gemini (nếu có)
                    if (result.audio) {
                        const audioData = result.audio.split(',')[1] || result.audio;
                        parts.push({
                            inlineData: {
                                data: audioData,
                                mimeType: 'audio/mp3'
                            }
                        });
                        this.toastr.info('Đã tải thêm âm thanh đính kèm.');
                    }

                    // Chèn phụ đề text vào prompt (nếu có)
                    if (result.subtitles) {
                        parts[0].text += `\n\n=== Dưới đây là Phụ đề trích xuất từ Video ===\n${result.subtitles}`;
                        this.toastr.info('Đã tải thêm phụ đề đính kèm.');
                    }

                } else {
                    throw new Error('Không lấy được hình ảnh từ video.');
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: parts }]
            });

            const jsonText = response.text;
            if (jsonText) {
                let data: any;
                try {
                    const match = jsonText.match(/\{[\s\S]*\}/);
                    const cleanedJson = match ? match[0] : jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
                    data = JSON.parse(cleanedJson);
                } catch (e) {
                    console.error("Lỗi parse JSON từ AI:", e, jsonText);
                    throw new Error("AI không trả về định dạng JSON hợp lệ.");
                }

                if (data) {
                    this.seo.description.text = data.description;
                    this.detectForm
                        .get('step1')
                        .get('title')
                        .setValue(data.title);
                    this.detectForm
                        .get('step1')
                        .get('description')
                        .setValue(data.description);

                    this.detectForm
                        .get('step5')
                        .get('mainkey')
                        .setValue(
                            data.long_keywords[0] ||
                            data.short_keywords[0] ||
                            '',
                        );
                    this.arr_keyword = data.long_keywords.concat(
                        data.short_keywords,
                    );

                    this.source.pre.push(
                        `<p id="source-pre-${uuid.v4()}">${data.image_prompt}</p>`,
                    );

                    this.done.push(`${data.content}`);
                    this.toastr.success('Đã phân tích video và tạo nội dung thành công!');

                    // Đánh dấu hoàn tất cho UI
                    this.updateJobState(jobId, {
                        status: 'done',
                        done_chunks: 1,
                        total_chunks: 1,
                        status_step: 'done',
                    });
                }
            }

            this.loading = false;
            this.cd.detectChanges();
        } catch (error) {
            console.error('Lỗi khi convertVideo2Post:', error);
            this.loading = false;
            const errMsg = error?.message || error || 'Lỗi không xác định';
            this.toastr.error('Lỗi khi phân tích video: ' + errMsg);
            this.updateJobState(jobId, {
                status: 'error',
                status_step: 'error',
            });
            this.cd.detectChanges();
        }
    }



    retryConvertVideo2Post(content: string, jobId: number) {
        this.stopTracking(jobId);
        this.convertVideo2Post(content, jobId);
    }

    transcriptDetails(transcript_id: string, include_snapshots?: boolean) {
        return this._youtubeService.transcriptDetails({
            transcript_id: transcript_id,
            include_snapshots: include_snapshots,
        });
    }

    async convertTranscript2Post(transcript: any) {
        this.loading = !this.loading;

        try {
            let your_prompt = '';

            if (this.source.prompt.length > 0) {
                your_prompt = this.source.prompt.join('.');
                your_prompt = this.removeHTML.transform(your_prompt);
                your_prompt += '. ';
            }

            const prompt = `${your_prompt}Hãy viết dựa vào nội dung mẫu sau: ${transcript.full_text}, và dựa vào mô tả: "${transcript.video_description}" và dựa vào tiêu đề: "${transcript.video_title}".
            Yêu cầu: Trả kết quả về định dạng JSON với key đầu tiên là title có value đúng định dạng viết hoa đầu câu và chứa một từ khoá chính.
            Key thứ hai là content với value là nội dung của blog trả về dạng HTML, đoạn văn đầu tiên chứa một từ khoá chính, không gắn link vào bài viết. Lưu ý khi nội dung trong đoạn văn mà có chứa table thì phải bê nguyên xi cái table đó vào content.
            Key thứ ba là long_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải trên 3 từ trở lên.
            Key thứ tư là short_keywords với value là liệt kê các từ khoá chính trong blog theo dạng array, các khoá chính phải dưới 3 từ trở xuống.
            Key thứ năm là description với value là bản tóm tắt ngắn gọn của blog, value dưới 160 từ chứa một khoá chính.
            Key thứ sáu là image_prompt với value là gợi ý tạo hình ảnh từ nội dung blog.
            Lưu ý: Viết theo phong cách của ${this.style.name} (mô tả phong cách ${this.style.desc}), trong key thứ hai content phải có ít nhất 1 thẻ h2 để làm SEO.
            Tôi muốn bạn trả về dữ liệu dưới định dạng JSON. Ví dụ:
            {
                "title": "Tiêu đề",
                "content": "Chi tiết",
                "long_keywords": [],
                "short_keywords": [],
                "description": "Mô tả",
                "image_prompt": "Mô tả"
            }
            Hãy trả về JSON **hợp lệ tuyệt đối** (valid JSON), không thiếu dấu phẩy, không có bình luận, không có Markdown, không có giải thích.
            Chỉ trả về JSON thuần túy, bắt đầu từ dấu '{' và kết thúc bằng '}'.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            const jsonText = response.text;
            if (jsonText) {
                let data: any;
                try {
                    const match = jsonText.match(/\{[\s\S]*\}/);
                    const cleanedJson = match ? match[0] : jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
                    data = JSON.parse(cleanedJson);
                } catch (e) {
                    console.error("Lỗi parse JSON từ AI:", e, jsonText);
                    throw new Error("AI không trả về định dạng JSON hợp lệ.");
                }

                if (data) {
                    this.seo.description.text = data.description;
                    this.detectForm
                        .get('step1')
                        .get('title')
                        .setValue(data.title);
                    this.detectForm
                        .get('step1')
                        .get('description')
                        .setValue(data.description);

                    this.detectForm
                        .get('step5')
                        .get('mainkey')
                        .setValue(
                            data.long_keywords[0] ||
                            data.short_keywords[0] ||
                            '',
                        );
                    this.arr_keyword = data.long_keywords.concat(
                        data.short_keywords,
                    );

                    this.source.pre.push(
                        `<p id="source-pre-${uuid.v4()}">${data.image_prompt}</p>`,
                    );

                    this.done.push(`${data.content}`);
                    this.toastr.success('Đã tạo nội dung thành công!');
                }
            }

            this.loading = !this.loading;
        } catch (error) {
            this.loading = !this.loading;
            this.toastr.error('Lỗi tạo nội dung.');
        }
    }

    /**
     * Lấy tất cả domain của khách
     */
    alldomains() {
        this._domainService
            .fetch({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.domains = result.data;
                    }

                    if (!this.multiAccountService.getItem('domain')) {
                        this.domain = this.domains[0];
                    }

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
                error: () => { },
                complete: () => { },
            });
    }

    /**
     * Sửa nội dung một đoạn văn bản
     */
    edit(item: any, index: number) {
        // xoá bỏ hết mấy cái line break
        if (item[index] && typeof item[index] === 'string') {
            item[index] = item[index]
                .replace(/&#92;n/g, '')
                .replace(/&bsol;n/g, '')
                .replace(/\\\\n/g, '')
                .replace(/\\n/g, '')
                .replace(/\\\\r/g, '')
                .replace(/\\r/g, '')
                .replace(/(\r\n|\n|\r)/gm, '');
        }

        const bottomSheetRef = this._bottomSheet.open(EditBeforeExportSheet, {
            panelClass: 'edit2export',
            data: {
                title: this.detectForm.get('step1').get('title').value,
                description: this.detectForm.get('step1').get('description')
                    .value,
                content: [item[index]],
                uuid: this.uuid,
                domain: this.domain,
                username: this.user.name,
                tags: [],
                categories: [],
                mainkey: this.detectForm.get('step5').get('mainkey').value,
                function: 'edit',
            },
        });

        bottomSheetRef.afterDismissed().subscribe((result) => {
            // Restore focus to an appropriate element for the user's workflow here.
            if (result && result.content != null) {
                if (typeof result.content === 'string') {
                    result.content = result.content
                        .replace(/&#92;n/g, '')
                        .replace(/&bsol;n/g, '')
                        .replace(/\\\\n/g, '')
                        .replace(/\\n/g, '')
                        .replace(/\\\\r/g, '')
                        .replace(/\\r/g, '')
                        .replace(/(\r\n|\n|\r)/gm, '');
                }

                // chính chủ đã chỉnh sửa
                let id = null;
                try {
                    if (typeof item[index] === 'string' && item[index].trim().startsWith('<')) {
                        id = $($.parseHTML(item[index])).attr('id');
                    }
                } catch (e) { }

                if (id && typeof result.content === 'string') {
                    try {
                        const $parsed = $(`<div>${result.content}</div>`);
                        const firstChild = $parsed.children().first();
                        if (firstChild.length > 0) {
                            firstChild.attr('id', id);
                            item[index] = $parsed.html();
                        } else {
                            item[index] = `<p id="${id}">${result.content}</p>`;
                        }
                    } catch (e) {
                        item[index] = result.content;
                    }
                } else {
                    item[index] = result.content;
                }

                this.detectForm
                    .get('step1')
                    .get('title')
                    .setValue(result.title);
                // item[index] = `<p id="${$(item[index]).attr('id')}">${$(result.content).text()}</p>`;
                // item[index] = `${$(result.content).prop('id', $(item[index]).attr('id'))}`;

                // tinh toan lai done
                this.seo = this.seoScore.transform({
                    done: this.done,
                    title: this.detectForm.get('step1').get('title').value,
                    description: this.detectForm.get('step1').get('description')
                        .value,
                    mainkey: this.detectForm.get('step5').get('mainkey').value,
                });

                this.showComments();

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    /**
     * Dán nội dung mới từ những nguồn khác nhau
     * như chatgpt, google, vnexpress
     */
    paste() {
        const dialogRef = this.dialog.open(CopyPasteDialog, {
            width: '680px',
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                this.source.text = this.source.text.concat(result.clipboard);
                this.selectedIndex = 0;

                // lam moi lai giao dien
                this.toastr.success(`Đã chuyển đoạn văn xong.`);
                this.cd.markForCheck();
            }
        });
    }

    /**
     * Trộn dữ liệu bằng từ Đồng nghĩa
     */
    replace(
        word: string,
        result: string,
        className: string,
        classWord?: string,
    ) {
        for (var k in this.source) {
            this.source[k] = this.source[k].map(
                (item: string, _index: number) => {
                    if (
                        k === 'p' ||
                        k === 'label' ||
                        k === 'pre' ||
                        k === 'li' ||
                        k === 'i' ||
                        k === 'td' ||
                        k === 'dd' ||
                        k === 'span' ||
                        k === 'h1' ||
                        k === 'h2' ||
                        k === 'h3' ||
                        k === 'h4' ||
                        k === 'h5'
                    ) {
                        item = item.replace(new RegExp(word, 'gi'), (_) => {
                            return `<span class="${className}">${result}</span>`;
                        });

                        if (classWord) {
                            item = item.replace(classWord, className);

                            // lam moi lai giao dien
                            this.cd.markForCheck();
                        }
                    }

                    return item;
                },
            );
        }
    }

    /**
     * Làm mới đoạn văn tránh trùng lặp
     */
    reNewQuotation(quotation: string, source: any, index: number) {
        const id = $(source[index]).attr('id');

        let arr = quotation.split(' ');
        arr.map((item: string) => {
            if (item.indexOf('_') >= 0) {
                let str = item
                    .replace(/[@!^&\/\\#,+()$~%.'":*?<>{}\[\]]/g, '')
                    .replace(/[_]/g, ' ');

                if (!this.arr_keyword.includes(str)) {
                    this.arr_keyword.push(str);
                    this.synonyms.map((synonym) => {
                        if (
                            str.toLowerCase() === synonym['word'].toLowerCase()
                        ) {
                            const synonyms = synonym['synonym'].split(', ');
                            const random = Math.floor(
                                Math.random() * synonyms.length,
                            );
                            const value = $(
                                source[index]
                                    .replace(
                                        `<span class="text-replaced">${str}</span>`,
                                        str,
                                    )
                                    .replace(
                                        str,
                                        `<span class="text-replaced">${synonyms[random]}</span>`,
                                    ),
                            ).prop('id', id);
                            source[index] = value.prop('outerHTML');
                        }
                    });
                }
            }
        });
    }

    /**
     * Lọc từ khoá trong một đoạn văn
     */
    keyword(source: any, index: number) {
        this.arr_keyword = [];

        // remove tất cả html trong đoạn này
        let content = this.removeHTML.transform(source[index]);

        this._blogService
            .keywords({
                content: content,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (!result || result.length === 0) {
                    } else {
                        if (result && result.success && result.data) {
                            this.toastr.success(`Phân tích từ khoá xong.`);

                            // làm mới đoạn văn
                            this.reNewQuotation(result.data[1], source, index);
                        }
                    }
                },
                error: () => { },
                complete: () => {
                    this.stepper.selectedIndex = 0;

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Lọc từ khoá trong toàn bộ source
     */
    findKeyword() {
        this.arr_keyword = [];
        let okia = '';

        for (var k in this.source) {
            if (this.source.hasOwnProperty(k)) {
                this.stepper.selectedIndex = 0;
                if (this.source[k] && this.source[k].length > 0) {
                    this.source[k].map((content: string, _index: number) => {
                        // remove tất cả html trong đoạn này
                        okia += this.removeHTML.transform(content) + ' ';
                    });
                }
            } else {
                this.alert('Không thể phân tích từ khoá');
            }
        }

        if (okia && okia.length > 0) {
            this._blogService
                .keywords({
                    content: okia,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            let str = result.data[1];
                            let arr = str.split(' ');

                            arr.map((item: string) => {
                                if (item.indexOf('_') >= 0) {
                                    str = item
                                        .replace(
                                            /[@!^&\/\\#,+()$~%.'":*?<>{}\[\]]/g,
                                            '',
                                        )
                                        .replace(/[_]/g, ' ');

                                    if (!this.arr_keyword.includes(str)) {
                                        this.arr_keyword.push(str);
                                    }

                                    // this.source[k][index] = this.source[k][index].replace(new RegExp(str, "gi"), _ => {
                                    //     return `<span class="text-keyword text-keyword-${str.replace(/\s+/g, '-')}">${str}</span>`;
                                    // });
                                }
                            });
                        }
                    },
                    error: () => { },
                    complete: () => {
                        this.toastr.success(`Phân tích từ khoá xong.`);

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    },
                });
        }
    }

    /**
     * Hỏi ChatGPT trực tiếp
     */
    chatgpt(content?: string, event?: any): void {
        // if (!content) return;
        // event.preventDefault();

        const bottomSheetRef = this._bottomSheet.open(ChatGPTQuestionSheet, {
            data: { content: content || '' },
        });

        bottomSheetRef.afterDismissed().subscribe((data) => {
            // Restore focus to an appropriate element for the user's workflow here.
            if (data && data.result) {
                this.source.chatgpt.push(data.result);
                this.toastr.success(`Nội dung đã được trả lời.`);
                this.selectedIndex = 0;

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    /**
     * Doc 10k từ đồng nghĩa
     */
    fetchSynonyms(cb: any) {
        const req = new XMLHttpRequest();
        req.open('GET', `assets/data/synonym.json`);

        req.onload = () => {
            this.synonyms = JSON.parse(req.response);
            cb(this.synonyms);
        };

        req.send();
    }

    synonymlocal() {
        this._blogService
            .synonymlocal()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (synonyms) => {
                    if (synonyms && synonyms.length > 0) {
                        this.synonyms = synonyms;
                    }
                },
                error: (e: any) => { },
                complete: () => { },
            });
    }

    /**
     * Dùng từ đồng nghĩa đảo câu
     */
    async synonymsForSentence(source: any, index: number, backup: string) {
        const id = $(source[index]).attr('id');

        if (this.source.backup[id] === undefined) {
            this.source.backup[id] = source[index];
        } else {
            source[index] = this.source.backup[id];
        }

        let originalHtml = source[index];
        let plainText = this.removeHTML.transform(originalHtml);
        
        if (!plainText || plainText.trim() === '') {
            this.toastr.warning('Đoạn văn trống, không thể viết lại.');
            return;
        }

        this.loading = true;
        this.cd.detectChanges();

        try {
            const prompt = `Hãy viết lại nội dung của đoạn HTML sau bằng tiếng Việt một cách tự nhiên để tránh trùng lặp nội dung, nhưng vẫn giữ nguyên ý nghĩa và TẤT CẢ các thẻ HTML (như <a>, <b>, <i>, <span>, <img>). Chỉ trả về mã HTML đã viết lại, không giải thích gì thêm, không dùng markdown:\n${originalHtml}`;
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            if (response && response.text) {
                let newContent = response.text.replace(/```html/gi, '').replace(/```/g, '').trim();
                
                if (id) {
                    try {
                        const $parsed = $(`<div>${newContent}</div>`);
                        const firstChild = $parsed.children().first();
                        if (firstChild.length > 0) {
                            firstChild.attr('id', id);
                            source[index] = $parsed.html();
                        } else {
                            source[index] = `<p id="${id}">${newContent}</p>`;
                        }
                    } catch (e) {
                         source[index] = `<p id="${id}">${newContent}</p>`;
                    }
                } else {
                    source[index] = newContent;
                }
                
                this.toastr.success('Đã tạo đoạn văn mới thành công!');
                this.keyword(source, index); // Vẫn gọi để lấy từ khoá nếu API backend hoạt động
            }
        } catch (error) {
            console.error('Lỗi khi viết lại đoạn văn:', error);
            this.toastr.error('Lỗi khi viết lại đoạn văn.');
        } finally {
            this.loading = false;
            this.cd.detectChanges();
        }
    }

    /**
     * Tra từ điển để lấy từ đồng nghĩa
     */
    synonym(keyword: string, event?: any) {
        if (!keyword) return;
        event.preventDefault();

        this._blogService
            .synonym({
                keyword: keyword,
                request: 'span|#content\ndd|#content',
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.words({
                            word: result.data.word,
                            data: {
                                span: result.data.span,
                                dd: result.data.dd,
                                dn: result.data.dn,
                            },
                        });
                    }
                },
                error: () => { },
                complete: () => {
                    this.toastr.success(`Tìm từ đồng nghĩa xong.`);

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Dựa vào từ khoá để tự động tạo ra các đoạn văn
     */
    keywordGoogle(event?: any) {
        const dialogRef = this.dialog.open(KeywordGoogleDataDialog, {
            width: 'calc(100vw - 100px)',
            maxWidth: '600px',
            data: {
                keyword: this.detectForm.get('step3').get('keyword_auto').value,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (
                result &&
                result.result &&
                result.result[0] &&
                result.result[0].length > 0
            ) {
                result.result[0].map((item: String) => {
                    this.source.word.push(item);
                });

                this.toastr.success(`Thêm nội dung mới xong.`);
                this.selectedIndex = 0;

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    /**
     * Giải nghĩa từ thành công và
     * sử dụng content từ Từ điển
     */
    words(data: { word: string; data: object }) {
        const dialogRef = this.dialog.open(WordDataDialog, {
            width: '680px',
            data: data,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.word) {
                this.replace(
                    data.word,
                    result.word,
                    `text-replaced text-keyword-${data.word.replace(/\s+/g, '-')} text-replaced-${result.word.replace(/\s+/g, '-')}`,
                    `text-keyword text-keyword-${data.word.replace(/\s+/g, '-')}`,
                );
            }

            if (
                result &&
                result.result &&
                result.result[0] &&
                result.result[0].length > 0
            ) {
                result.result[0].map((item: String) => {
                    this.source.word.push(item);
                });

                this.toastr.success(`Thêm nội dung mới xong.`);
                this.selectedIndex = 0;
            }

            if (
                result &&
                result.result &&
                result.result[1] &&
                result.result[1].length > 0
            ) {
                result.result[1].map((item: String) => {
                    this.source.word.push(item);
                });

                this.toastr.success(`Thêm nội dung mới xong.`);
                this.selectedIndex = 0;
            }

            // lam moi lai giao dien
            this.cd.markForCheck();
        });
    }

    /**
     * Xoá toàn bộ văn bản làm việc
     * Để tạo mới công việc
     */
    clear(_data?: any) {
        this.done.map((item: string) => {
            this.trash.push(item);
        });

        this.done = [];
        this.toastr.success(`Xoá toàn bộ nội dung xong.`);

        this.showComments();

        // tinh toan lai done
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });
    }

    /**
     * Xoá một đoạn văn
     */
    async editVideo(item: any) {
        let localFilePath = this.removeHTML.transform(item);
        if (!localFilePath || typeof localFilePath !== 'string') return;
        localFilePath = localFilePath.trim();

        let fileUrl = localFilePath;

        // Nếu là URL web, tìm file local trong thư mục Downloads/AI.TYPING
        if (localFilePath.startsWith('http')) {
            let electronApi = null;
            if (window && (window as any).electron) {
                electronApi = (window as any).electron;
            }
            if (electronApi) {
                const foundPath = await electronApi.invoke('find-latest-analyzed-video');
                if (foundPath) {
                    fileUrl = foundPath;
                } else {
                    this.toastr.warning('Không tìm thấy video đã tải về. Vui lòng chọn thủ công.');
                    const manualPath = await electronApi.invoke('select-video-file');
                    if (manualPath) {
                        fileUrl = manualPath;
                    } else {
                        return; // User cancelled
                    }
                }
            } else {
                this.toastr.error('Chỉ hỗ trợ trên ứng dụng Desktop.');
                return;
            }
        }

        // Ensure localFilePath has file:// protocol
        if (!fileUrl.startsWith('file://')) {
            fileUrl = `file://${fileUrl.replace(/\\/g, '/')}`;
        }

        // Lấy thời lượng thực tế của video
        let actualDuration = 5;
        try {
            actualDuration = await new Promise<number>((resolve) => {
                const video = document.createElement('video');
                video.onloadedmetadata = () => {
                    resolve(video.duration);
                };
                video.onerror = () => {
                    resolve(5); // fallback
                };
                video.src = fileUrl;
            });
        } catch (e) {
            actualDuration = 5;
        }

        const randomUuid = uuid.v4();
        const projectData = {
            uuid: randomUuid,
            aspectRatio: '16:9',
            scenes: [
                {
                    videos: [
                        {
                            id: 1,
                            videoUrl: fileUrl,
                            duration: actualDuration,
                            maxDuration: actualDuration
                        }
                    ]
                }
            ]
        };

        this.multiAccountService.setItem('ai_type_video_ready_data_' + randomUuid, projectData);

        const dialogRef = this.dialog.open(VideoTimelineDialogComponent, {
            width: '100vw',
            maxWidth: '100vw',
            height: '100vh',
            maxHeight: '100vh',
            panelClass: 'full-screen-dialog',
            data: {
                uuid: randomUuid,
                projectData: projectData,
                audioList: [],
                videoFormat: 'video'
            },
            disableClose: true,
        });
    }

    clearitem(i: number, data?: any, backup?: string) {
        if (data) {
            this.trash.push(data[i]);
            data.splice(i, 1);
            this.toastr.success(`Xoá nội dung xong.`);

            this.showComments();

            // tinh toan lai done
            this.seo = this.seoScore.transform({
                done: this.done,
                title: this.detectForm.get('step1').get('title').value,
                description: this.detectForm.get('step1').get('description')
                    .value,
                mainkey: this.detectForm.get('step5').get('mainkey').value,
            });
        }
    }

    /**
     * Lưu trữ công việc
     */
    archive() {
        if (this.detectForm.get('step1').get('title').value) {
            this.checkseo();

            this._crawlService
                .storeArchive({
                    title: this.detectForm.get('step1').get('title').value,
                    url: this.detectForm.get('step2').get('url').value,
                    source: this.source,
                    done: this.done,
                    trash: this.trash,
                    seo: this.seo,
                    arr_keyword: this.arr_keyword,
                    domain: this.domain,
                    username: this.user.name,
                    thumbnail: this.detectForm.get('step1').get('thumbnail').value,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            this._h.updateStatistics('writing', 1);

                            this.toastr.success(`Văn bản đã được lưu trữ.`);
                            
                            if (this.source && this.source.wpPosts && this.source.wpPosts.length > 0) {
                                this.syncToWordpress();
                            } else if (this.source && this.source.wp_post_id) {
                                this.export();
                            } else {
                                this.syncToWordpress();
                            }

                            // làm mới lại giao diện
                            this.router.navigate([
                                'ai-writer',
                                this.user.name,
                                result.data.uuid,
                            ]);
                        }
                    },
                    error: () => { },
                    complete: () => {
                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    },
                });
        } else {
            this.toastr.warning(`Lưu trữ chưa có tiêu đề.`);
            this.stepper.selectedIndex = 0;
        }
    }

    syncToWordpress() {
        let postsToUpdate: any[] = [];
        if (this.source.wpPosts && this.source.wpPosts.length > 0) {
            postsToUpdate = this.source.wpPosts;
        } else if (this.source.wp_post_id && this.source.wp_domain) {
            postsToUpdate = [this.source];
        }

        if (postsToUpdate.length > 0) {
            let formattedContent = '';
            this.done.forEach((item: any) => {
                let formattedItem = typeof item === 'string' ? item : JSON.stringify(item);
                if (formattedItem) {
                    formattedItem = formattedItem.replace(/(?:<p><br><\/p>\s*)+<table/gi, '<table');
                    formattedItem = formattedItem.replace(/(?:<br\s*\/?>\s*)+<table/gi, '<table');
                    formattedItem = formattedItem.replace(/<th/gi, '<td').replace(/<\/th>/gi, '</td>');
                    formattedItem = formattedItem.replace(/<thead/gi, '<tbody').replace(/<\/thead>/gi, '</tbody>');
                    formattedItem = formattedItem.replace(/<\/p>\s*<table/gi, '</p><table');
                }
                formattedContent += formattedItem;
            });

            if (!formattedContent || formattedContent.trim() === '') {
                formattedContent = this.source.text.join('');
            }

            postsToUpdate.forEach((post: any) => {
                let apppass = post.wp_password;
                let username = post.wp_username;
                let postDomain = post.wp_domain || post.domain;
                let postId = post.wp_post_id || post.id;

                let domainacc: any = localStorage.getItem(`${postDomain}.account`);
                if (domainacc) {
                    try {
                        domainacc = this._h.decrypt(domainacc, `${postDomain}.account.key`);
                        if (!username) username = domainacc.username;
                        if (!apppass) apppass = domainacc.apppass;
                    } catch (e) {
                        console.error('Decryption error for domain account', e);
                    }
                }

                if (!username || !apppass) {
                    let selectedDomain: any = null;
                    if (this.domains && this.domains.length > 0) {
                        selectedDomain = this.domains.find((d: any) => d.domain === postDomain);
                    }
                    
                    if (!selectedDomain && this.domain && this.domain['domain'] === postDomain) {
                        selectedDomain = this.domain;
                    }
                    
                    if (!username && selectedDomain && selectedDomain.username) {
                        username = selectedDomain.username;
                    }
                    if (!apppass && selectedDomain && selectedDomain.password) {
                        apppass = selectedDomain.password;
                    }
                }

                const wpData = {
                    wp_post_id: postId,
                    domain: postDomain,
                    wp_username: username,
                    wp_password: apppass,
                    title: this.detectForm.get('step1').get('title').value,
                    content: formattedContent,
                    excerpt: this.detectForm.get('step1').get('description').value,
                    thumbnail: this.detectForm.get('step1').get('thumbnail').value,
                    force_update_thumbnail: (this as any).isThumbnailChanged || false
                };

                this._wordpressService.update_post(wpData).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                    next: (res) => {
                        // Because wordpress.ts swallows errors returning empty array [], we check for it
                        if (res && res.id) {
                            (this as any).isThumbnailChanged = false; // Reset the flag after successful upload
                            this.toastr.success(`Đã đồng bộ bài viết ${res.id} lên WordPress thành công!`);
                        } else {
                            this.toastr.error(`Đồng bộ bài viết ${postId} thất bại, vui lòng kiểm tra lại quyền truy cập.`);
                        }
                    },
                    error: (err) => {
                        this.toastr.error(`Lỗi khi đồng bộ bài viết ${postId} lên WordPress.`);
                        console.error('WP Sync Error:', err);
                    }
                });
            });
        }
    }

    /**
     * Hiển thị trình soạn thảo theo các version
     */
    history(e?: any) {
        if (e) {
            this.version_value = e.value;

            if (e.value === this.time) {
                this.new_version = -2; // tạo mới version
                this.setdata(this.details);
            } else if (e.value == this.details.createdAt) {
                this.new_version = -1; // cập nhật bản gốc
                this.setdata(this.details);
            } else {
                this.new_version = 1; // cập nhật theo phiên bản

                let editor = _.find(this.details['history'], {
                    createdAt: e.value,
                });

                if (editor) {
                    this.setdata(editor);
                } else {
                    this.new_version = -1; // cập nhật bản gốc
                    this.version_value = this.details.createdAt;
                    this.setdata(this.details);
                }
            }
        } else {
            if (this.version_value === this.time) {
                this.new_version = -2; // tạo mới version
                this.setdata(this.details);
            } else if (this.version_value == this.details.createdAt) {
                this.new_version = -1; // cập nhật bản gốc
                this.setdata(this.details);
            } else {
                this.new_version = 1; // cập nhật theo phiên bản

                let editor = _.find(this.details['history'], {
                    createdAt: this.version_value,
                });

                if (editor) {
                    this.setdata(editor);
                } else {
                    this.new_version = -1; // cập nhật bản gốc
                    this.version_value = this.details.createdAt;
                    this.setdata(this.details);
                }
            }
        }

        // lưu lại version
        localStorage.version_value = this.version_value;
        // this.toastr.success(`Nội dung đã được làm mới.`);
    }

    /**
     * Sửa archive
     */
    update(confirm: boolean = false) {
        if (!this.uuid) {
            this.archive();
            return;
        }

        this.checkseo();

        let data = {
            uuid: this.uuid,
            title: this.detectForm.get('step1').get('title').value,
            url: this.detectForm.get('step2').get('url').value,
            source: this.source,
            done: this.done,
            trash: this.trash,
            seo: this.seo,
            arr_keyword: this.arr_keyword,
            domain: this.domain,
            username: this.user.name,
            thumbnail: this.detectForm.get('step1').get('thumbnail').value,
            confirm: confirm,
            new_version: this.new_version,
            createdAt: this.version_value,
        };

        this._crawlService
            .archiveUpdate(data)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                error: () => { },
                complete: () => {
                    // this.storelocal();
                    if (this.new_version === -2) {
                        if (this.details) {
                            if (!this.details['history']) this.details['history'] = [];
                            this.details['history'].push(data);
                        }

                        const currentUrl = this.router.url;
                        this.router
                            .navigateByUrl('/', { skipLocationChange: true })
                            .then(() => {
                                this.router.navigate([currentUrl]);
                            });

                        this.toastr.success(`Lưu trữ một phiên bản mới.`);
                    } else {
                        if (this.details && this.details['history']) {
                            let index = _.findIndex(this.details['history'], {
                                createdAt: this.version_value,
                            });

                            if (index > -1) this.details['history'][index] = data;
                        }

                        this.toastr.success(`Văn bản đã được lưu trữ.`);
                        this.syncToWordpress();
                    }

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Chi tiết lưu trữ
     */
    detail(name: string) {
        return this._crawlService
            .detail({
                uuid: this.uuid,
                username: name,
            })
            .pipe(takeUntil(this._unsubscribeAll));
    }

    /**
     * Lấy danh sách đồng tác giả
     */
    together() {
        return this._crawlService
            .archiveTogetherCheck({
                uuid: this.uuid,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll));
    }

    /**
     * Nếu là tác giả thì đọc chi tiết bài viết
     */
    author(name: string) {
        forkJoin([this.together(), this.detail(name)])
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                error: () => {
                    this.alert('Nội dung chưa được tải về.');
                },
                next: async (response: any) => {
                    // const together = response[0];
                    const details = response[1];
                    if (details && details.success && details.data) {
                        this.details = details.data;

                        if (!this.details.source) {
                            this.details.source = { backup: this.source.backup };
                        } else if (!this.details.source.backup) {
                            this.details.source.backup = this.source.backup;
                        }

                        // if (this.details.domain) {
                        //     this.domain = this.details.domain;
                        // }

                        let version_value = localStorage.version_value;
                        if (version_value) {
                            this.version_value = version_value;
                        } else {
                            this.version_value = this.details.createdAt;
                        }

                        this.history();
                        this.nodeInCollection();
                        this.allcomments();
                    } else {
                        this.alert('ID không hợp lệ.');
                    }
                },
                complete: () => {
                    // this.setDefault();
                },
            });
    }

    /**
     * Nếu không phải là tác giả thì vẫn cho đọc chi tiết bài
     * và chỉnh sửa, comment theo nội dung
     */
    notAuthor() {
        this.together()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        // console.log('result', result);
                        this.detail(this.name).subscribe({
                            error: () => {
                                this.alert('Nội dung chưa được tải về.');
                            },
                            next: async (response: any) => {
                                const details = response;
                                if (
                                    details &&
                                    details.success &&
                                    details.data
                                ) {
                                    this.details = details.data;

                                    if (!this.details.source) {
                                        this.details.source = { backup: this.source.backup };
                                    } else if (!this.details.source.backup) {
                                        this.details.source.backup = this.source.backup;
                                    }

                                    // if (this.details.domain) {
                                    //     this.domain = this.details.domain;
                                    // }

                                    let version_value =
                                        localStorage.version_value;
                                    if (version_value) {
                                        this.version_value = version_value;
                                    } else {
                                        this.version_value =
                                            this.details.createdAt;
                                    }

                                    this.history();
                                    this.nodeInCollection();
                                    this.allcomments();
                                    // this.setdata(result.data);
                                } else {
                                    this.alert('ID không hợp lệ.');
                                }
                            },
                            complete: () => {
                                // this.setDefault();
                            },
                        });
                    } else {
                        this.alert('Nội dung tải về không chính xác.');
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    addCustomUser = (term: any) => ({ cid: term, name: term });

    forumCategory() {
        this._forumService
            .category({
                _uid: this.user.id,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.forumCategories = result.data.response.categories.map((item: any) => {
                            if (item.name) {
                                item.name = item.name.replace(/&lsqb;/gi, '[').replace(/&rsqb;/gi, ']');
                                if (item.name.includes('[[category:uncategorized]]')) {
                                    item.name = item.name.replace('[[category:uncategorized]]', 'Chưa phân loại');
                                }
                            }
                            return item;
                        });
                    }
                },
                error: () => { },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    createTopic() {
        const turndownService = new TurndownService();
        const content = turndownService.turndown(this.done.join(''));

        this._forumService
            .createTopic({
                _uid: this.user.id,
                cid: this.favoriteSeason,
                title: this.detectForm.get('step1').get('title').value,
                content: content,
                tags: [this.detectForm.get('step5').get('mainkey').value],
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Đã đăng lên Typing!`);
                    }
                },
                error: () => {
                    this.alert('Chia sẻ thất bại.');
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    async share() {
        try {
            // 2. Load thư viện (Chỉ dùng bản dành cho client, không dùng jsdom/fs)
            const pdfMake = require('pdfmake/build/pdfmake');
            const pdfFonts = require('pdfmake/build/vfs_fonts');
            const htmlToPdfmake = require('html-to-pdfmake');

            // 3. Khởi tạo font (Đây là dòng hay lỗi nhất, viết thế này là chắc chắn nhất)
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            // Giả sử data của bạn là array các string HTML
            const contentArray = this.done; // Hoặc biến chứa array của bạn
            const fullHtml = contentArray.join('');
            const htmlConverted = htmlToPdfmake(fullHtml);

            const docDefinition = {
                content: [
                    htmlConverted
                ],
                defaultStyle: {
                    font: 'Roboto' // Đảm bảo dùng Roboto để hỗ trợ tiếng Việt
                }
            };

            pdfMake.createPdf(docDefinition).download(`${this.uuid}.pdf`);
        } catch (error) {
            console.log(error);
        }
    }

    vialink() {
        const link = btoa(
            `${JSON.stringify([this.name, this.user.server, this.uuid])}`,
        );

        this.clipboard.copy(
            `${this.config.settings.domain}/#/read/${link}`,
        );

        this.toastr.success(`Copy link thành công!`);
    }

    /**
     * Kiểm duyệt để đăng bài
     * Xem trước bài đăng
     */
    export() {
        const isUpdate = this.source && this.source.wp_post_id;
        
        const bottomSheetRef = this._bottomSheet.open(EditBeforeExportSheet, {
            panelClass: 'edit2export',
            data: {
                title: this.detectForm.get('step1').get('title').value,
                description: this.detectForm.get('step1').get('description').value,
                content: this.done,
                uuid: this.uuid,
                domain: this.domain,
                username: this.user.name,
                tags: [],
                categories: [],
                mainkey: this.detectForm.get('step5').get('mainkey').value,
                function: isUpdate ? 'update' : 'share',
                wp_post_id: isUpdate ? this.source.wp_post_id : null,
                wp_username: isUpdate ? this.source.wp_username : null,
                wp_password: isUpdate ? this.source.wp_password : null,
                thumbnail: this.detectForm.get('step1').get('thumbnail').value
            },
        });

        bottomSheetRef.afterDismissed().subscribe((content) => {
            // Restore focus to an appropriate element for the user's workflow here.
            if (content) {
                // Kiểm tra xem có ID trả về từ WordPress không
                let wpId = null;
                if (content.success && content.data && content.data.id) {
                    wpId = content.data.id;
                } else if (content.id) {
                    wpId = content.id;
                }

                if (wpId) {
                    if (!this.source) this.source = {};
                    this.source.wp_post_id = wpId;
                    if (this.domain && this.domain['domain']) {
                        this.source.wp_domain = this.domain['domain'];
                    }
                    this.update(false); // Lưu lại WP ID vào CSDL ngay
                }

                // tinh toan lai done
                this.seo = this.seoScore.transform({
                    done: this.done,
                    title: this.detectForm.get('step1').get('title').value,
                    description: this.detectForm.get('step1').get('description')
                        .value,
                    mainkey: this.detectForm.get('step5').get('mainkey').value,
                });

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    /**
     * Lấy toàn bộ collection
     */
    collection() {
        this._crawlService
            .collections({
                username: this.name,
                page: { size: 100 },
                includeUuid: false
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

    /**
     * Lấy toàn bộ collection
     */
    nodeInCollection() {
        this._crawlService
            .nodeInCollection({
                uuid: this.uuid,
                username: this.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.selectedCollections = result.data;
                    } else {
                        this.alert('Tập của nội dung không chính xác.');
                    }
                },
                error: () => {
                    this.alert('Tập của nội dung chưa được tải về.');
                },
                complete: () => { },
            });
    }

    /**
     * Thêm mới vào Collection
     */
    addCollection(title: string) {
        return new Promise((resolve) => {
            this.loading = true;

            // Simulate backend call.
            setTimeout(() => {
                resolve({ title: title, new: true });
                this.loading = false;
            }, 1000);
        });
    }

    onChangeCollection(_$event: any) {
        // console.log('onChange', $event);
    }

    onCloseCollection(_$event: any) {
        // console.log('onClose', $event);
    }

    onAddCollection($event: any) {
        if (this.uuid) {
            if ($event.new === true) {
                // thêm mới collection
                this._crawlService
                    .createCollection({
                        title: $event.title,
                        uuid: this.uuid,
                        url: this.slugifyPipe.transform($event.title),
                        username: this.user.name,
                    })
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: async (result) => {
                            if (result && result.success) {
                                this.toastr.success(`Tạo nhóm mới thành công.`);
                            } else {
                                this.alert('Tạo nhóm mới thất bại.');
                            }
                        },
                        error: () => {
                            this.alert('Tạo nhóm mới thất bại.');
                        },
                        complete: () => { },
                    });
            } else {
                // cập nhật uuid vào collection
                this._crawlService
                    .storeCollection({
                        _id: $event._id,
                        uuid: this.uuid,
                        username: this.user.name,
                    })
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: async (result) => {
                            if (result && result.success) {
                                this.toastr.success(
                                    `Thêm vào nhóm thành công.`,
                                );
                            } else {
                                this.alert('Thêm vào nhóm thất bại.');
                            }
                        },
                        error: () => {
                            this.alert('Thêm vào nhóm thất bại.');
                        },
                        complete: () => { },
                    });
            }
        } else {
            this.alert('Bài viết này chưa có mã ID');
        }
    }

    onRemoveCollection($event: any) {
        this._crawlService
            .removeCollection({
                _id: $event.value._id,
                uuid: this.uuid,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Gỡ nhóm thành công.`);
                    } else {
                        this.alert('Gỡ nhóm thất bại.');
                    }
                },
                error: () => {
                    this.alert('Gỡ nhóm thất bại.');
                },
                complete: () => { },
            });
    }

    onClearCollection() {
        console.log('onClear');
    }

    openCreateAudioProgram() {
        this.router.navigate(['/voice2video']);
    }

    /**
     * Tự động lưu sau 60s
     */
    autoSave() {
        if (this.name === this.user.name) {
            // chính chủ thì mới lưu
            clearInterval(this.intervalAutoSave);

            this.intervalAutoSave = setInterval(() => {
                if (this.timeLeft > 0) {
                    this.timeLeft--;
                } else {
                    this.timeLeft = 60;

                    // this.storelocal();
                    this.update(false); // tu dong luu tren server luon
                }
            }, 1000);
        }
    }

    /**
     * Tự động gắn dữ liệu dưới local nếu ko tìm thấy details
     */
    setDefault() {
        let editor: any = this.multiAccountService.getItem('editor');

        if (editor) {
            editor = JSON.parse(editor);

            if (
                editor.title &&
                editor.done.length > 0 &&
                editor.uuid === this.uuid
            ) {
                this.setdata(editor);
            } else {
                localStorage.removeItem('editor');
            }
        }
    }

    /**
     * Lưu bài dướii local
     */
    storelocal() {
        localStorage.setItem(
            'editor',
            JSON.stringify({
                uuid: this.uuid,
                title: this.detectForm.get('step1').get('title').value,
                url: this.detectForm.get('step2').get('url').value,
                source: this.source,
                done: this.done,
                trash: this.trash,
                seo: this.seo,
                arr_keyword: this.arr_keyword,
                domain: this.domain,
                thumbnail: this.detectForm.get('step1').get('thumbnail').value,
            }),
        );
    }

    /**
     * Điều khiển công cụ kết nối
     */
    handler(e: { class: string; title?: string }) {
        switch (e.class) {
            case 'btn-reset':
                localStorage.removeItem('editor');

                this.detectForm.get('step1').get('title').setValue('');
                this.detectForm.get('step1').get('thumbnail').setValue('');
                this.detectForm.get('step2').get('url').setValue('');
                // this.domain = '';

                // reset lai nguon
                for (var k in this.source) {
                    this.source[k] = [];
                }

                this.done = [];
                this.trash = [];
                this.arr_keyword = [];

                this.stepper.selectedIndex = 0;
                // this.cd.detectChanges();

                // reset lai seo
                this.seo = this.seoScore.transform({
                    done: this.done,
                    title: this.detectForm.get('step1').get('title').value,
                    description: this.detectForm.get('step1').get('description')
                        .value,
                    mainkey: this.detectForm.get('step5').get('mainkey').value,
                });

                this.toastr.success(`Làm mới nội dung xong.`);
                break;
            case 'btn-login':
                this.dialog.open(SettingsDomainLoginComponent, {
                    width: '460px',
                    data: {
                        domain: e.title,
                    },
                });
                break;
            case 'btn-guide':
                this.toastr.warning(`Tính năng đang được cập nhật.`);
                break;
            default:
                break;
        }
    }

    /**
     * Cài đặt công việc ban đầu
     */
    setdata(editor: any) {
        // this.domain = (editor.domain) ? editor.domain : this.domain;
        // kiểm tra nếu used là -1 có nghĩa là nó được convert từ node sang
        // như vậy phải update lần đầu tiên cho nó ngay
        if (editor.used === -1) {
            this.generateID(editor.source, () => {
                this.confirm();
            });
        } else {
            // cài đặt ban đầu
            if (editor.source) {
                this.source = { ...this.source, ...editor.source };
            }
            this.source.prompt = this.source.prompt ? this.source.prompt : [];

            if (!this.source.playlist) {
                this.source.playlist = [
                    {
                        youtube: [],
                        tiktok: [],
                        facebook: [],
                    },
                    {
                        mp3: [],
                    },
                ];
            }

            // bật tự động lưu
            if (this.settings.autosave) {
                this.autoSave();
            }
        }

        this.done = editor.done ? editor.done : this.done;
        this.trash = editor.trash ? editor.trash : this.trash;
        this.seo = editor.seo && editor.seo.title ? editor.seo : this.seo;
        this.arr_keyword = editor.arr_keyword
            ? editor.arr_keyword
            : this.arr_keyword;

        this.detectForm.get('step1').get('title').setValue(editor.title);
        this.detectForm.get('step2').get('url').setValue(editor.url);

        if (editor.thumbnail) {
            this.detectForm.get('step1').get('thumbnail').setValue(editor.thumbnail);

            if (!this.source.img) {
                this.source.img = [];
            }
            const thumbnails = editor.thumbnail.split('\n').filter((p: string) => p.trim() !== '');
            thumbnails.forEach((thumb: string) => {
                if (this.isImage(thumb)) {
                    let cleanB64 = thumb;
                    if (thumb.startsWith('data:image/')) {
                        cleanB64 = thumb.replace(/;name=[^;]+;/, ';');
                    }
                    let exists = false;
                    for (let i = 0; i < this.source.img.length; i++) {
                        if (typeof this.source.img[i] === 'string' && (this.source.img[i].includes(cleanB64) || this.source.img[i].includes(thumb))) {
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        this.source.img.push(`<p id="source-img-${uuid.v4()}"><img src="${cleanB64}" /></p>`);
                    }
                }
            });
        }

        if (this.seo.description && this.seo.description.text) {
            this.detectForm
                .get('step1')
                .get('description')
                .setValue(this.seo.description.text);
        }

        if (this.seo.mainkey) {
            this.detectForm
                .get('step5')
                .get('mainkey')
                .setValue(this.seo.mainkey);
        }

        // tinh toan lai SEO
        this.seo = this.seoScore.transform({
            done: this.done,
            title: this.detectForm.get('step1').get('title').value,
            description: this.detectForm.get('step1').get('description').value,
            mainkey: this.detectForm.get('step5').get('mainkey').value,
        });

        this.titleService.setTitle(
            `đang tạo "${editor.title}" | ai.type - công cụ tạo content`,
        );

        this.showComments();
        this.checkseo();

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    // thay đổi lại vị trí của line
    updateline() {
        // thay đổi lại vị trí của line
        if (this.line) {
            this.line.map((item) => {
                return item.position();
            });
        }
    }

    scrolled(_event: any): void { }

    isActive = false;
    openComments(_user: string) {
        this.isActive = !this.isActive;
        this.drawerOpened = true;

        this.comments.map((item, i) => {
            // console.log(item);
            this.leader(item._id, item.blockid, i);
        });
    }

    /**
     * Lấy toàn bộ comments
     */
    allcomments() {
        this._crawlService
            .archiveComments({
                author: this.name,
                uuid: this.uuid,
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
                        this.comments = result.data;
                        this.toastr.success(`Ghi chú mới đã được tải về.`);
                        this.showComments();
                    }
                },
                error: () => {
                    this.alert('Ghi chú chưa được tải về.');
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    showComments() {
        let t = this;

        const newdata = _(this.comments)
            .groupBy((x) => x.blockid)
            .value();

        setTimeout(() => {
            // your code to be executed after 1 second
            for (var k in newdata) {
                if (newdata.hasOwnProperty(k)) {
                    const label = $(`#${k}`).parent().children('label');
                    if (label.length > 0) {
                        label.text(`${newdata[k].length}`);
                    } else {
                        $(`#${k}`)
                            .parent()
                            .addClass(
                                'relative bg-yellow-50 rounded-md px-4 py-4',
                            )
                            .delegate('label', 'click', (e: any) => {
                                let id = $(e.currentTarget).attr('data-id');
                                t.renderComment($(`#${id}`));
                            })
                            .append(`<label>${newdata[k].length}</label>`)
                            .find('label')
                            .addClass(
                                'absolute -left-2 -top-2 bg-yellow-100 opacity-100 border border-yellow-200 cursor-pointer w-6 h-6 text-sm justify-center items-center text-center rounded-full',
                            )
                            .attr('data-id', k);
                    }
                }
            }
        }, 1000);
    }

    changetab(_e: any) {
        // console.log('e', e);
        this.showComments();
    }

    openS() {
        // hoan nguyen lai noi dung cu cho tu khoa
        $('body').delegate('.text-replaced', 'click', (e: any) => {
            e.preventDefault();

            let keyword = $(e.target).text();
            keyword = keyword.toLowerCase();

            // filter our data
            const temp = _.find(this.synonyms, function (d) {
                return d.word.toLowerCase().indexOf(keyword) !== -1;
            });

            if (temp) {
                let html = `<ol class="giai-nghia">`;
                html += `<li>"${temp['mean']}"</li>`;
                html += `<li><b>Đồng nghĩa</b>: ${temp['synonym']}</li>`;
                html += `<li><b>Trái nghĩa</b>: ${temp['unsynonym']}</li>`;

                if (temp['sentence_with_synonym'].length > 0) {
                    html += `<li><b>Ví dụ về đồng nghĩa:</b></li>`;
                    temp['sentence_with_synonym'].map((item: any) => {
                        html += `<li>+ ${item}</li>`;
                    });
                }

                if (temp['sentence_with_unsynonym'].length > 0) {
                    html += `<li><b>Ví dụ về trái nghĩa:</b></li>`;
                    temp['sentence_with_unsynonym'].map((item: any) => {
                        html += `<li>+ ${item}</li>`;
                    });
                }

                html += `</ol>`;

                this.popover(`${temp['word']}`, `${html}`);
            } else {
                this.toastr.warning('Không thể tra được từ.');
            }
        });
    }

    /**
     * Viết comment cho mỗi block
     */
    comment(_data: any, item: any, _i: number) {
        let id = null;
        try {
            if (typeof item === 'string' && item.trim().startsWith('<')) {
                id = $($.parseHTML(item.trim())).attr('id');
            }
        } catch (e) { }

        if (!id) {
            id = 'p-' + uuid.v4();
            if (typeof item === 'string') {
                if (item.trim().startsWith('<')) {
                    _data[_i] = `<div id="${id}">${item}</div>`;
                } else {
                    _data[_i] = `<p id="${id}">${item}</p>`;
                }
            } else {
                _data[_i] = `<div id="${id}">${item}</div>`;
            }
        }

        if (id) {
            const dialogRef = this.dialog.open(CommentDialog, {
                width: '680px',
            });

            dialogRef.afterClosed().subscribe((content) => {
                if (content) {
                    this._crawlService
                        .archiveBlockComment({
                            uuid: this.uuid,
                            blockid: id,
                            author: this.name,
                            username: this.user.name,
                            comment: {
                                content: content.comment,
                                username: this.user.name,
                                childrens: [],
                                createdAt: new Date(),
                            },
                        })
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({
                            next: async (result) => {
                                if (result && result.success && result.data) {
                                    this.comments.push(result.data);
                                    this.showComments();
                                    this.toastr.success(
                                        `Ghi chú thành công!`,
                                    );
                                }
                            },
                            error: () => {
                                this.alert('Ghi chú thất bại.');
                            },
                            complete: () => {
                                // lam moi lai giao dien
                                this.cd.markForCheck();
                            },
                        });
                }
            });
        } else {
            this.alert('Phiên bản cũ không thể thêm ghi chú.');
        }
    }

    /**
     * Mở comment form rồi viết góp ý
     */
    renderComment(item: any) {
        const t = this;

        function getRandomNumber(min: number, max: number) {
            return Math.random() * (max - min - 400) + min;
        }

        function dragElement(elmnt, cb?: any) {
            var pos1 = 0,
                pos2 = 0,
                pos3 = 0,
                pos4 = 0;
            if (document.getElementById(elmnt.id + 'header')) {
                /* if present, the header is where you move the DIV from:*/
                document.getElementById(elmnt.id + 'header').onmousedown =
                    dragMouseDown;
            } else {
                /* otherwise, move the DIV from anywhere inside the DIV:*/
                elmnt.onmousedown = dragMouseDown;
            }

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                // get the mouse cursor position at startup:
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                // call a function whenever the cursor moves:
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                // calculate the new cursor position:
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                // set the element's new position:
                elmnt.style.top = elmnt.offsetTop - pos2 + 'px';
                elmnt.style.left = elmnt.offsetLeft - pos1 + 'px';
            }

            function closeDragElement() {
                /* stop moving when mouse button is released:*/
                document.onmouseup = null;
                document.onmousemove = null;

                cb();
            }
        }

        // get window width and height
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let id = null;
        let safeItem: any = item;
        try {
            if (typeof item === 'string') {
                if (item.trim().startsWith('<')) {
                    safeItem = $($.parseHTML(item));
                    id = safeItem.attr('id');
                } else {
                    safeItem = $('<span>').text(item);
                }
            } else {
                safeItem = $(item);
                id = safeItem.attr('id');
            }
        } catch (e) {
            safeItem = $('<span>').text(item);
        }

        const cloneid = 'klon-' + id;
        const overlay = $('<div></div>');
        const close = $('<div></div>').append('<label>Close</label>');
        const content = $('<div></div>')
            .append($(safeItem).clone())
            .prop('id', cloneid);

        $(`body`).append(overlay);
        $(`body`).append(content);
        $(`body`).append(close);

        close.delegate('label', 'click', function () {
            overlay.remove();
            content.remove();
            close.remove();

            comments.map((item) => {
                item.remove();
            });

            t.line[-1].remove();
            t.line.map((item: any) => {
                return item.remove();
            });
            t.line = [];
        });

        // $(`#${id}`).fadeTo("slow", 0.2);
        overlay.fadeIn(1000).addClass('overlay-styles');
        close.fadeIn(1000).addClass('button-close');
        content.fadeIn(500).addClass('overlay-styles-content');

        this.leader(id, cloneid, -1, {
            endPlugOutline: false,
            positionByWindowResize: true,
            color: 'rgba(216, 191, 23, 0.7)',
            path: 'grid',
            size: 3,
            startPlug: 'disc',
            endPlug: 'arrow2',
            dash: { animation: true },
            animOptions: { duration: 2000, timing: 'linear' },
        });

        let comments = [];
        this.comments.map((comment, i) => {
            if (comment.blockid === id) {
                // get random numbers for each element
                const randomTop = getRandomNumber(0, winHeight);
                const randomLeft = getRandomNumber(0, winWidth);

                const formattedDate = new Date(comment.comment.createdAt).toLocaleString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

                comments[i] = $(`<div></div>`);
                comments[i]
                    .html(
                        `<div style="display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; font-size: 12px; padding: 8px 12px; cursor: move; border-top-left-radius: 4px; border-top-right-radius: 4px; color: #475569; font-weight: 500;">
                            <span>${comment.comment.username} lúc ${formattedDate}</span>
                            <span class="copy-comment" style="cursor: pointer; color: #2563eb; display: flex; align-items: center; gap: 4px;" title="Copy">
                                Copy
                            </span>
                        </div>
                        <div style="padding: 12px;">${comment.comment.content}</div>`
                    )
                    .attr('id', comment._id);

                comments[i].find('.copy-comment').on('click', () => {
                    this.clipboard.copy(comment.comment.content);
                    this.toastr.success('Đã copy nội dung nhận xét!');
                });

                comments[i].fadeIn(1500).addClass('overlay-styles-comment');
                comments[i].css({ left: randomLeft, top: randomTop });

                $(`body`).append(comments[i]);

                dragElement(document.getElementById(`${comment._id}`), (_) => {
                    this.updateline();
                });

                this.leader(cloneid, comment._id, i);
            }
        });
    }

    nextItem = (i: number, arr: any) => {
        i = i + 1; // increase i by one
        i = i % arr.length; // if we've gone too high, start from `0` again
        return arr[i]; // give us back the item of where we are now
    };

    prevItem = (i: number, arr: any) => {
        if (i === 0) {
            // i would become 0
            i = arr.length; // so put it at the other end of the array
        }

        i = i - 1; // decrease by one
        return arr[i]; // give us back the item of where we are now
    };

    autoCreatePost() {
        this.dialog.open(GeminiMatrixDialog, {
            width: '680px',
            // height: '50vh',
            data: {
                selectedItems: this.selectedItems,
                domain: this.domain,
            },
        });
    }

    /**
     * Constructor
     */
    constructor(
        private _formBuilder: UntypedFormBuilder,
        private clipboard: Clipboard,
        private _domainService: DomainService,
        private _crawlService: CrawlService,
        private _blogService: BlogService,
        private _logService: LogService,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private _userService: UserService,
        private _forumService: ForumService,
        private _fuseConfigService: FuseConfigService,
        private _h: HelperService,
        private cd: ChangeDetectorRef,
        private titleService: Title,
        public dialog: MatDialog,
        private _youtubeService: YoutubeService,
        private route: ActivatedRoute,
        private router: Router,
        private _bottomSheet: MatBottomSheet,
        private multiAccountService: MultiAccountService,
        private sanitizer: DomSanitizer,
        private _genaiService: GenaiService,
        public _wordpressService: WordpressService
    ) {
        this.route.params.subscribe((params: Params) => {
            if (params['uuid']) {
                this.uuid = params['uuid'];
                this.name = params['name'];
            } else {
                this.uuid = null;
                this.name = null;
            }

            this.titleService.setTitle(
                `${this.uuid ? 'cập nhật lưu trữ' : 'văn bản'} | ai.type - công cụ tạo content`,
            );
        });

        // lấy secretKey và searchAPIKey
        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = this.settings.secretKey
                ? this.settings.secretKey.split(';')
                : undefined;
            this.searchAPIKey = this.settings.searchAPIKey
                ? this.settings.searchAPIKey.split(';')
                : undefined;

            if (this.secretKey) {
                // let geminiKey = this.secretKey[0];
                // if (this.secretKey[1]) { geminiKey = this.secretKey[1]; }
                // this.ai = new GoogleGenAI({ apiKey: geminiKey }); // ok rooi
            }
        }

        const savedDomain = this.multiAccountService.getItem('domain');
        if (savedDomain) {
            this.domain = savedDomain;
        }

        // Lắng nghe sự kiện STT (từ Mic system capture)
        this.onSttTranscribed = this.onSttTranscribed.bind(this);
        window.addEventListener('stt-transcribed', this.onSttTranscribed);

        const cachedStyles = this.multiAccountService.getItem('styles');
        if (cachedStyles) {
            this.styles = cachedStyles;
        } else {
            this.styles = [this.style];
        }

        if (localStorage.getItem('style')) {
            this.style = JSON.parse(localStorage.getItem('style'));
        } else {
            this.style = this.styles[0];
        }

        if (this.arr_keyword.length > 0) {
            this.stepper.selectedIndex = 0;
        }

        // Save logic
        this.saveRouterStrategyReuseLogic =
            this.router.routeReuseStrategy.shouldReuseRoute;
        this.router.routeReuseStrategy.shouldReuseRoute = (future, curr) => {
            return false;
        };

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

                this.permissionText2Voice =
                    this._userService.permissionText2Voice(this.user);
                this.permissionVideo = 
                    this._userService.permissionVideo(this.user);

                this.alldomains();
                this.synonymlocal();
                this.openS();
                this.forumCategory();
                this.collection();


            });

        if (window && (window as any).electron) {
            this.unsubscribeRes = (window as any).electron.onToolsResponse(
                async (data: any) => {
                    if (data.action === 'dreamina-downloaded') {
                        if (data.isVid) {
                            // Tạo thẻ HTML chứa video path và đưa vào playlist
                            this.source.playlist[0]['youtube'].unshift(
                                `<p id="source-youtube-${uuid.v4()}">${data.file}</p>`
                            );
                            this.toastr.success('Video đã được tải xuống và thêm vào danh sách.');
                            this.cd.markForCheck();
                        } else {
                            // Dùng uploadImage (hoặc uploadThumbnailPromise nếu cần base64, nhưng file ở đây là local path)
                            // Sử dụng cách giống fetch/uploadImage:
                            this.uploadImage(data.file).subscribe({
                                next: async (result) => {
                                    if (result && result.img) {
                                        this.source.img.unshift(
                                            `<p id="source-img-${uuid.v4()}"><img src="${result.img}" /></p>`
                                        );
                                        this.toastr.success('Hình ảnh đã được tải lên và thêm vào danh sách.');
                                    } else {
                                        this.toastr.success('Ảnh đã tải xuống nhưng không tải lên server được.');
                                    }
                                },
                                error: () => {
                                    this.toastr.warning('Lỗi tải ảnh lên server.');
                                },
                                complete: () => {
                                    this.cd.markForCheck();
                                }
                            });
                        }
                    }
                }
            );

            this.unsubscribeLog = (window as any).electron.onToolsLog(
                (msg: any) => {
                    console.log('Log từ main:', msg);
                }
            );
        }
    }

    /**
     * On init
     */
    ngOnInit(): void {
        // Horizontal stepper form
        this.detectForm = this._formBuilder.group({
            step1: this._formBuilder.group({
                title: ['', Validators.required],
                description: [''],
                thumbnail: [''],
            }),
            step2: this._formBuilder.group({
                url: [''],
                request: [
                    'td|body\nlabel|body\nspan|body\nh1|body\nh2|body\nh3|body\nh4|body\nh5|body\np|body\nimg,src+title+alt|body\niframe,src|body\na,href+title|body\nli|body\ni|body\ndd|body\npre|body\nsource,src|html\ntitle|html>head\nmeta,content:name|html>head\nmeta,content:property|html>head',
                ],
                type: 'html',
            }),
            step3: this._formBuilder.group({
                keyword_auto: [''],
            }),
            // step4: this._formBuilder.group({
            //     code: [''],
            // }),
            step5: this._formBuilder.group({
                mainkey: ['', Validators.required],
            }),
        });

        const state = history.state;
        if (state && state.wpPosts && state.wpPosts.length > 0) {
            this.source.wpPosts = state.wpPosts;
            
            const post = state.wpPosts[0];
            if (post.title) {
                this.detectForm.get('step1.title').setValue(post.title);
            }
            if (post.content) {
                this.source.text = [post.content];
            }
            if (post.thumbnail) {
                this.detectForm.get('step1.thumbnail').setValue(post.thumbnail);
                this.source.img = [`<p id="source-img-${uuid.v4()}"><img src="${post.thumbnail}" /></p>`];
            }
            if (post.id) {
                this.source.wp_post_id = post.id;
            }
            if (post.domain) {
                this.source.wp_domain = post.domain;
            }
            if (post.wp_username) {
                this.source.wp_username = post.wp_username;
            }
            if (post.wp_password) {
                this.source.wp_password = post.wp_password;
            }
        } else if (state && state.wpPost) {
            const post = state.wpPost;
            
            if (post.title) {
                this.detectForm.get('step1.title').setValue(post.title);
            }
            
            if (post.content) {
                this.source.text = [post.content];
            }
            
            if (post.thumbnail) {
                this.detectForm.get('step1.thumbnail').setValue(post.thumbnail);
                this.source.img = [`<p id="source-img-${uuid.v4()}"><img src="${post.thumbnail}" /></p>`];
            }

            if (post.id) {
                this.source.wp_post_id = post.id;
            }

            if (post.domain) {
                this.source.wp_domain = post.domain;
            }
        }
    }

    ngAfterViewInit(): void {
        if (this.uuid) {
            if (this.name === this.user.name) {
                // chính chủ
                this.author(this.name);
            } else {
                // tác giả sửa cùng
                this.notAuthor();
            }
        }
    }

    onSttTranscribed(e: any) {
        const text = e.detail;
        if (text && this.done) {
            const htmlToInsert = `<p><strong>[Ghi âm]</strong> ${text.replace(/\n/g, '<br>')}</p>`;
            this.done.push(htmlToInsert);

            // Trigger thay đổi giao diện
            this.cd.detectChanges();
            this.toastr.success('Đã tự động chèn kết quả ghi âm!');
        }
    }

    get thumbnailsList(): string[] {
        if (!this.detectForm || !this.detectForm.get('step1')) return [];
        const val = this.detectForm.get('step1').get('thumbnail').value;
        return val ? val.split('\n').filter((p: string) => p.trim() !== '') : [];
    }

    removeThumbnail(index: number) {
        const list = this.thumbnailsList;
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            this.detectForm.get('step1').get('thumbnail').setValue(list.join('\n'));
            this.update(false); // Lưu ngay lập tức
            this.cd.markForCheck();
        }
    }
    private objectUrls: { [key: string]: string } = {};

    isImage(file: string): boolean {
        if (!file) return false;
        const cleanFile = file.trim();
        if (cleanFile.includes('data:image')) return true;
        if (cleanFile.startsWith('local-video:') || cleanFile.startsWith('memory-video:')) return false;
        const lower = cleanFile.toLowerCase();
        return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp');
    }

    isVideo(file: string): boolean {
        if (!file) return false;
        const cleanFile = file.trim();
        if (cleanFile.includes('data:video') || cleanFile.startsWith('local-video:') || cleanFile.startsWith('memory-video:')) return true;
        const lower = cleanFile.toLowerCase();
        return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.mkv') || lower.endsWith('.webm');
    }

    getFileName(fileStr: string): string {
        if (!fileStr) return '';
        if (fileStr.startsWith('local-video:')) {
            const path = fileStr.substring('local-video:'.length);
            return path.split(/[/\\]/).pop();
        }
        if (fileStr.startsWith('memory-video:')) {
            return fileStr.substring('memory-video:'.length);
        }
        if (fileStr.includes('data:')) {
            const match = fileStr.match(/;name=([^;]+);base64,/);
            if (match && match[1]) {
                return decodeURIComponent(match[1]);
            }
            if (fileStr.includes('data:image')) return 'Ảnh đính kèm (Dữ liệu nội bộ)';
            if (fileStr.includes('data:video')) return 'Video đính kèm (Dữ liệu nội bộ)';
            return 'Tệp đính kèm (Dữ liệu nội bộ)';
        }
        return fileStr;
    }

    getFileSrc(file: string): SafeUrl {
        if (!file) return '';
        const cleanFile = file.trim();
        if (this.objectUrls[cleanFile]) {
            return this.sanitizer.bypassSecurityTrustUrl(this.objectUrls[cleanFile]);
        }
        if (cleanFile.startsWith('local-video:')) {
            const path = cleanFile.substring('local-video:'.length);
            let safePath = path.replace(/\\/g, '/');
            if (!safePath.startsWith('/')) {
                safePath = '/' + safePath;
            }
            return this.sanitizer.bypassSecurityTrustUrl('file://' + safePath);
        }
        if (cleanFile.startsWith('http://') || cleanFile.startsWith('https://') || cleanFile.includes('data:image') || cleanFile.startsWith('blob:')) {
            return this.sanitizer.bypassSecurityTrustUrl(cleanFile);
        }
        let safePath = cleanFile.replace(/\\/g, '/');
        if (!safePath.startsWith('/')) {
            safePath = '/' + safePath;
        }
        return this.sanitizer.bypassSecurityTrustUrl('file://' + safePath);
    }

    replaceThumbnailIndex: number = -1;

    private async processLocalFile(file: any): Promise<string> {
        return new Promise((resolve) => {
            if (file.type && file.type.startsWith('video/')) {
                if (file.path) {
                    resolve(`local-video:${file.path}`);
                } else {
                    this.multiAccountService.saveMemoryFile(file.name, file);
                    resolve(`memory-video:${file.name}`);
                }
            } else if (file.type && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e: any) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        const MAX_WIDTH = 1200;
                        const MAX_HEIGHT = 1200;

                        if (width > height) {
                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }
                        } else {
                            if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        
                        // Fill white background in case it's a transparent PNG converted to JPEG
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        let mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                        let quality = 0.85;
                        let result = canvas.toDataURL(mimeType, quality);
                        
                        const getBytes = (b64: string) => Math.round((b64.split(',')[1] || b64).length * 3 / 4);
                        const MAX_SIZE_BYTES = 200 * 1024; // 200KB
                        
                        if (getBytes(result) > MAX_SIZE_BYTES) {
                            mimeType = 'image/jpeg'; // Convert to JPEG for better compression
                            result = canvas.toDataURL(mimeType, quality);
                            
                            while (getBytes(result) > MAX_SIZE_BYTES && quality > 0.1) {
                                // Prioritize resizing over deep-frying JPEG quality to keep it looking sharp
                                if (quality <= 0.6 && getBytes(result) > MAX_SIZE_BYTES) {
                                    width *= 0.8;
                                    height *= 0.8;
                                    canvas.width = width;
                                    canvas.height = height;
                                    
                                    ctx.fillStyle = '#FFFFFF';
                                    ctx.fillRect(0, 0, width, height);
                                    ctx.drawImage(img, 0, 0, width, height);
                                    
                                    quality = 0.85; // Reset quality after resize
                                } else {
                                    quality -= 0.1;
                                }
                                
                                result = canvas.toDataURL(mimeType, Math.max(0.1, quality));
                            }
                        }

                        let finalName = file.name;
                        if (mimeType === 'image/jpeg' && finalName.toLowerCase().endsWith('.png')) {
                            finalName = finalName.replace(/\.png$/i, '.jpg');
                        }
                        
                        const nameParam = `;name=${encodeURIComponent(finalName)};base64,`;
                        const modifiedResult = result.replace(/;?base64,/, nameParam);
                        resolve(modifiedResult);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                const reader = new FileReader();
                reader.onload = (e: any) => {
                    const result = e.target.result as string;
                    const nameParam = `;name=${encodeURIComponent(file.name)};base64,`;
                    const modifiedResult = result.replace(/;?base64,/, nameParam);
                    resolve(modifiedResult);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    onThumbnailReplaced(event: any) {
        if (event.target.files && event.target.files.length > 0 && this.replaceThumbnailIndex >= 0) {
            const file = event.target.files[0]; // Only take the first file for replacement

            this.processLocalFile(file).then(b64 => {
                const b64Key = b64;
                if (b64Key.startsWith('memory-video:')) {
                    this.objectUrls[b64Key] = URL.createObjectURL(file);
                } else if (this.isImage(file.name) || (b64Key.includes('data:video')) || b64Key.startsWith('local-video:')) {
                    this.objectUrls[b64Key] = b64;
                }

                const existingValue = this.detectForm.get('step1').get('thumbnail').value || '';
                let thumbnails = existingValue.split('\n').filter((t: string) => t.trim() !== '');
                
                let oldB64Key = '';
                if (this.replaceThumbnailIndex < thumbnails.length) {
                    oldB64Key = thumbnails[this.replaceThumbnailIndex];
                    thumbnails[this.replaceThumbnailIndex] = b64Key;
                }

                if (oldB64Key && oldB64Key !== b64Key) {
                    if (this.source && this.source.img) {
                        for (let i = 0; i < this.source.img.length; i++) {
                            if (typeof this.source.img[i] === 'string') {
                                this.source.img[i] = this.source.img[i].split(oldB64Key).join(b64Key);
                            }
                        }
                    }
                    if (this.done) {
                        for (let i = 0; i < this.done.length; i++) {
                            if (typeof this.done[i] === 'string') {
                                this.done[i] = this.done[i].split(oldB64Key).join(b64Key);
                            }
                        }
                    }
                }

                // Force update matching index in source.img
                if (this.replaceThumbnailIndex >= 0 && this.source && this.source.img && this.source.img.length > this.replaceThumbnailIndex) {
                    if (typeof this.source.img[this.replaceThumbnailIndex] === 'string') {
                        const match = this.source.img[this.replaceThumbnailIndex].match(/src=["']([^"']+)["']/);
                        const oldSrc = match ? match[1] : null;
                        
                        this.source.img[this.replaceThumbnailIndex] = this.source.img[this.replaceThumbnailIndex].replace(/src="[^"]+"/, `src="${b64Key}"`).replace(/src='[^']+'/, `src='${b64Key}'`);

                        if (oldSrc && oldSrc !== b64Key && this.done) {
                            for (let i = 0; i < this.done.length; i++) {
                                if (typeof this.done[i] === 'string') {
                                    this.done[i] = this.done[i].split(oldSrc).join(b64Key);
                                }
                            }
                        }
                    }
                }

                this.detectForm.get('step1').get('thumbnail').setValue(thumbnails.join('\n'));
                (this as any).isThumbnailChanged = true;
                this.update(false); // Lưu ngay lập tức
                this.toastr.success(`Đã thay thế tệp thành công!`);
                this.cd.markForCheck();
                
                event.target.value = '';
                this.replaceThumbnailIndex = -1;
            });
        }
    }

    onThumbnailSelected(event: any) {
        if (event.target.files && event.target.files.length > 0) {
            const files = Array.from(event.target.files);

            Promise.all(files.map(f => this.processLocalFile(f))).then(base64Strings => {
                const paths = base64Strings.map((b64: string, index: number) => {
                    const file = files[index] as any;
                    const b64Key = b64;
                    if (b64Key.startsWith('memory-video:')) {
                        this.objectUrls[b64Key] = URL.createObjectURL(file);
                    } else if (this.isImage(file.name) || (b64Key.includes('data:video')) || b64Key.startsWith('local-video:')) {
                        this.objectUrls[b64Key] = b64; // Hiển thị base64
                    }
                    
                    if (this.isImage(file.name) && b64Key.startsWith('data:image/')) {
                        let cleanB64 = b64Key.replace(/;name=[^;]+;/, ';');
                        this.source.img.push(`<p id="source-img-${uuid.v4()}"><img src="${cleanB64}" /></p>`);
                    }

                    return b64Key;
                });

                const existingValue = this.detectForm.get('step1').get('thumbnail').value || '';
                const newValue = existingValue.trim() ? existingValue.trim() + '\n' + paths.join('\n') : paths.join('\n');

                this.detectForm.get('step1').get('thumbnail').setValue(newValue);
                (this as any).isThumbnailChanged = true;
                this.update(false); // Lưu ngay lập tức
                this.toastr.success(`Đã đính kèm ${files.length} tệp (Mã hóa nội bộ)!`);
                this.cd.markForCheck();

                event.target.value = '';
            });
        }
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        window.removeEventListener('stt-transcribed', this.onSttTranscribed);
        clearInterval(this.intervalAutoSave);

        if (this.unsubscribeRes) {
            this.unsubscribeRes();
        }
        if (this.unsubscribeLog) {
            this.unsubscribeLog();
        }

        // Giải phóng bộ nhớ của object URLs
        Object.values(this.objectUrls).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (e) { }
        });

        this.jobSubscriptions.forEach((sub) => sub.unsubscribe());
        this.jobSubscriptions.clear();

        $('body').off('click', '.text-replaced');
        this.router.routeReuseStrategy.shouldReuseRoute =
            this.saveRouterStrategyReuseLogic;

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    confirm(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xác nhận!',
            message: message
                ? message
                : 'Hệ thống cần xác nhận Nội dung này được chuyển thể từ Văn bản sang Lưu trữ.',
            icon: {
                show: true,
                name: 'feather:check',
                color: 'warning',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xác nhận',
                    color: 'primary',
                },
                cancel: {
                    show: true,
                    label: 'Đóng lại',
                },
            },
            dismissible: false,
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.update(true);
            } else {
                this.router.navigate(['/archives']);
            }
        });
    }

    popover(title?: string, message?: string, keyword?: string) {
        this.wordPopup = this._fuseConfirmationService.open({
            title: title ? title : 'Giải nghĩa',
            message: message
                ? message
                : 'Nội dung bạn đang yêu cầu hiển thị không được tìm thấy vào lúc này.',
            icon: {
                show: false,
                name: 'feather:info',
                color: 'primary',
            },
            actions: {
                confirm: {
                    show: false,
                    label: 'Thực hiện',
                    color: 'primary',
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại',
                },
            },
            dismissible: true,
        });

        // Subscribe to afterClosed from the dialog reference
        this.wordPopup.afterClosed().subscribe((result) => {
            this.wordPopup = undefined;
        });
    }

    alert(message?: string) {
        this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message ? message : 'Hệ thống không thể xử lý thông tin.',
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
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message
                ? message
                : 'Nội dung bạn đang yêu cầu hiển thị không được tìm thấy vào lúc này.',
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
