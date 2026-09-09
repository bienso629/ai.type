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
    TemplateRef,
} from '@angular/core';
import {
    UntypedFormBuilder,
    UntypedFormGroup,
    Validators,
} from '@angular/forms';
import { Title, DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { FuseLoadingService } from '@fuse/services/loading';
import { CrawlService } from 'app/_services/crawl';
import { BlogService } from 'app/_services/blog';
import { UserService } from 'app/core/user/user.service';
import { ForumService } from 'app/_services/forum';
import { User } from 'app/core/user/user.types';
import { ToastrService } from 'ngx-toastr';
import { SEOScorePipe, RemoveHTMLPipe, SlugifyPipe } from 'app/app.pipe';
import {
    interval,
    Subject,
    Subscription,
    switchMap,
    takeUntil,
    Observable,
    firstValueFrom,
    from,
    of,
    map
} from 'rxjs';
import { ActivatedRoute, Params } from '@angular/router';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import {
    CdkDragDrop,
    moveItemInArray,
    transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GenaiService } from 'app/genai.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { SettingsDomainLoginComponent } from 'app/modules/admin/account/settings/domain/login/login.component';
import { AIText2SpeechComponent } from 'app/modules/admin/content/ai-text2speech/ai-text2speech.component';
import { ArchiveOrgDialogComponent } from 'app/modules/admin/content/ai-tts/tools/archive-org-dialog.component';
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
import { ArticlePasswordDialog } from 'app/modules/admin/content/ai-writer/tools/article-password-dialog';
import { ScriptDialog } from 'app/modules/admin/content/ai-writer/tools/script-dialog';
import { tryDecryptWithMasterFallback, isMasterKey, PRIMARY_MASTER_KEY } from 'app/core/auth/crypto.helper';

import { forkJoin } from 'rxjs'; // RxJS 6 syntax
import { DomainService } from 'app/_services/domain';
import { WordpressService } from 'app/_services/wordpress';
import { GlobalAgentService } from 'app/_services/global-agent.service';
import { Clipboard } from '@angular/cdk/clipboard';

import * as _ from 'lodash';
import * as $ from 'jquery';
import * as uuid from 'uuid';
import * as CryptoJS from 'crypto-js';

import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';

import { marked } from 'marked';
import { YoutubeService } from 'app/_services/youtube';
import { LogService } from 'app/_services/link';
import { HelperService } from 'app/helper.service';
import { MultiAccountService } from 'app/_services/multi-account.service';

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
    isGeneratingScript: boolean = false;
    isGeneratingImage: boolean = false;

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
    rightSelectedIndex = 0;
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

    /**
     * AI hay tra ve khoang trang dang &nbsp; hoac ky tu U+00A0 (va cac unicode
     * space khac) lan trong text thuong. Chuan hoa ve khoang trang thuong
     * truoc khi luu vao source, tranh hien thi dung nhung HTML ngam chua
     * &nbsp; sai ban chat (giong cach script-view.component.ts xu ly).
     */
    private sanitizeAIText(text: string): string {
        if (typeof text !== 'string') return text;
        return text
            .replace(/&nbsp;/gi, ' ')
            .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');
    }

    cleanDomain(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }

    @ViewChild('stepper') stepper: any;
    @ViewChild('generateImageDialog') generateImageDialog: TemplateRef<any>;
    generateImageDialogRef: MatDialogRef<any>;
    customImagePrompt: string = '';
    referenceImageBase64: string | null = null;
    currentParagraphItem: any = null;

    @ViewChild('refreshOutlineDialog') refreshOutlineDialog: TemplateRef<any>;
    refreshOutlineDialogRef: MatDialogRef<any>;
    customRefreshOutlinePrompt: string = '';
    referenceOutlineImageBase64: string | null = null;
    isRefreshingOutline: boolean = false;

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
        audios: [],
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

    downloadingItemIndex: number | null = null;
    downloadItemPercent: { [index: number]: number } = {};

    details: any;
    articlePassword: string = '';
    autoSaveLocal: boolean = localStorage.getItem('ai_type_auto_save_local') !== 'false';

    toggleAutoSaveLocal(event: any) {
        this.autoSaveLocal = event.checked;
        localStorage.setItem('ai_type_auto_save_local', this.autoSaveLocal ? 'true' : 'false');
        if (this.autoSaveLocal) {
            this.toastr.success('Bật tự động lưu bản sao xuống máy tính cục bộ.');
            this.saveToLocalDiskQuick();
        } else {
            this.toastr.info('Đã tắt tự động lưu bản sao cục bộ.');
        }
    }

    openEncryptionDialog() {
        this.toastr.info('Tính năng mã hóa mật khẩu bài viết đã được gỡ bỏ hoàn toàn.');
    }

    encryptPayload(sourceData: any, doneData: any, trashData: any, password: string, extraData?: any) {
        return { source: sourceData, done: doneData, trash: trashData };
    }

    decryptPayload(ciphertext: string, password: string, masterCipher?: string) {
        return null;
    }

    splitIntoParagraphs(raw: any): string[] {
        if (!raw) return [];
        const extractString = (val: any): string[] => {
            if (!val && val !== 0) return [];
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        return extractString(parsed);
                    } catch (e) {}
                }
                if (trimmed.includes('\n')) {
                    return trimmed.split(/\r?\n\r?\n|\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                }
                return trimmed ? [trimmed] : [];
            }
            if (typeof val === 'object') {
                if (Array.isArray(val)) {
                    const res: string[] = [];
                    val.forEach(item => {
                        res.push(...extractString(item));
                    });
                    return res;
                }
                if (val.text && typeof val.text === 'string') return extractString(val.text);
                if (val.content && typeof val.content === 'string') return extractString(val.content);
                if (val.html && typeof val.html === 'string') return extractString(val.html);
                if (val.value && typeof val.value === 'string') return extractString(val.value);
                if (val.p) return extractString(val.p);
                if (val.done) return extractString(val.done);
                if (val.backup) return extractString(val.backup);

                const res: string[] = [];
                ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'span', 'li', 'td', 'label', 'text', 'done', 'backup'].forEach(k => {
                    if (val[k]) {
                        res.push(...extractString(val[k]));
                    }
                });
                if (res.length > 0) return res;

                return [];
            }
            return [String(val).trim()];
        };

        return extractString(raw);
    }

    formatDoneParagraphs(raw: any): string[] {
        const paragraphs = this.splitIntoParagraphs(raw);
        if (paragraphs.length === 0) return [];

        return paragraphs.map((p: string) => {
            let clean = p.trim();
            if (clean.startsWith('<p') || clean.startsWith('<h') || clean.startsWith('<div') || clean.startsWith('<table') || clean.startsWith('<blockquote') || clean.startsWith('<ul') || clean.startsWith('<ol')) {
                return clean;
            }
            return `<p id="source-p-${uuid.v4()}">${clean}</p>`;
        });
    }

    parseRawContentToDone(rawContent: any): string[] {
        if (!rawContent) return [];
        if (Array.isArray(rawContent)) return rawContent;
        let str = String(rawContent);

        // Strip Markdown headers if present
        str = str.replace(/^#\s+[^\n]*\n+/g, '');
        str = str.replace(/^>\s*\*\*Domain\*\*:[^\n]*\n+/g, '');
        str = str.replace(/^---\s*\n+/g, '');
        str = str.trim();

        if (str.includes('<p') || str.includes('<div') || str.includes('<h')) {
            const matches = str.match(/<(p|div|h[1-6]|table|blockquote)[^>]*>[\s\S]*?<\/\1>/gi);
            if (matches && matches.length > 0) {
                return matches;
            }
        }

        const lines = str.split(/\r?\n\r?\n|\r?\n/);
        const result: string[] = [];
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.length > 0 && !trimmed.startsWith('```')) {
                if (trimmed.startsWith('<')) {
                    result.push(trimmed);
                } else if (trimmed.startsWith('#')) {
                    result.push(`<h2>${trimmed.replace(/^#+\s*/, '')}</h2>`);
                } else {
                    result.push(`<p>${trimmed}</p>`);
                }
            }
        });
        return result.length > 0 ? result : [`<p>${str}</p>`];
    }

    time: any = new Date();
    version_value: any = new Date();
    new_version: number = -1; // -2 tạo mới version, -1 cập nhật bản gốc, 1, 2...

    timeLeft: number = 60;
    intervalAutoSave: any;

    // dành cho việc điều khiển trạng thái biến video thành bài viết
    videoExtractInterval: number = 5;
    jobStateMap = new Map<number, JobState>();
    jobStates: JobState[] = [];
    jobSubscriptions: Map<number, Subscription> = new Map();

    selectedCollections: any;
    collections: any[] = [];
    articlesInCollection: any[] = [];
    selectedArticleInCollection: string | null = null;
    isGeneratingNextChapter: boolean = false;
    hasCustomSavedStyle: boolean = false;

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
        const target = event.target as HTMLElement;
        if (target && (target.tagName === 'AUDIO' || target.closest('audio') || target.closest('.audio-player-wrapper'))) {
            return;
        }

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
        const s1 = typeof o1 === 'string' ? o1 : o1.domain;
        const s2 = typeof o2 === 'string' ? o2 : o2.domain;
        const cleanO1 = (s1 || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        const cleanO2 = (s2 || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        return cleanO1 === cleanO2;
    };

    applyDomainStyle(domainObj: any) {
        if (!domainObj) return;
        if (this.hasCustomSavedStyle) return;
        let settings = this.multiAccountService.getItem('settings') || {};
        let domainStyles = settings.domainStyles || {};
        let styleName = domainStyles[domainObj.domain];
        if (styleName && this.styles && this.styles.length > 0) {
            let foundStyle = this.styles.find(s => s.name === styleName);
            if (foundStyle) {
                this.style = foundStyle;
                localStorage.setItem('style', JSON.stringify(this.style));
            }
        }
    }

    connect(e: any) {
        this.domain = e.value;
        this.multiAccountService.setItem('domain', this.domain);
        this.applyDomainStyle(this.domain);
    }

    compareStyleFn = (o1: any, o2: any) => {
        if (!o1 || !o2) return o1 === o2;
        const name1 = typeof o1 === 'string' ? o1 : (o1.name || o1._id || o1);
        const name2 = typeof o2 === 'string' ? o2 : (o2.name || o2._id || o2);
        return name1 === name2;
    };

    chooseStyle(e: any) {
        this.style = e.value;
        this.hasCustomSavedStyle = true;
        if (!this.source) this.source = {};
        this.source.style = this.style;
        localStorage.setItem('style', JSON.stringify(this.style));
        if (this.uuid) {
            this.update(false);
        }
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

        const img = $(`<div>${this.done[event.currentIndex]}</div>`)
            .find('img:first')
            .attr('src');

        if (img && this.domain && this.domain.domain) {
            // 1. Làm mờ ảnh hiện tại để báo hiệu đang tải lên
            $(event.item.element.nativeElement).find('img:first').css('opacity', 0.5);

            (async () => {
                let base64DataUrl = '';
                if (img.startsWith('data:image/')) {
                    base64DataUrl = img;
                } else {
                    let localPath = img;
                    if (localPath.startsWith('file:///')) {
                        localPath = localPath.substring('file:///'.length);
                        if (!localPath.startsWith('/') && !/^[a-zA-Z]:/.test(localPath)) {
                            localPath = '/' + localPath;
                        }
                    } else if (localPath.startsWith('file://')) {
                        localPath = localPath.substring('file://'.length);
                    }

                    try {
                        const res = await (window as any).electron?.invoke('read-file-base64', { filePath: localPath });
                        if (res && res.success && res.base64) {
                            const fileName = localPath.split(/[\\/]/).pop() || 'image.png';
                            const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
                            const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
                            base64DataUrl = `data:${mimeType};name=${encodeURIComponent(fileName)};base64,${res.base64}`;
                        }
                    } catch (err) {
                        console.error('Lỗi đọc ảnh cục bộ khi kéo thả:', err);
                    }
                }

                if (base64DataUrl && this.domain && this.domain.domain) {
                    // Lấy thông tin đăng nhập WordPress cho domain được chọn
                    let uname = this.domain.username || '';
                    let pass = this.domain.password || '';
                    const domainAccKey = `${this.domain.domain}.account`;
                    const domainAccEncrypted = localStorage.getItem(domainAccKey);
                    if (domainAccEncrypted) {
                        try {
                            const decrypted: any = this._h.decrypt(domainAccEncrypted, `${this.domain.domain}.account.key`);
                            if (decrypted && decrypted.username && decrypted.apppass) {
                                uname = decrypted.username;
                                pass = decrypted.apppass;
                            }
                        } catch (e) {
                            console.error('Lỗi giải mã credentials khi kéo thả:', e);
                        }
                    }

                    // Tải ảnh trực tiếp lên WordPress domain được chọn
                    this._wordpressService.upload_media(this.domain.domain, base64DataUrl, uname, pass, this.domain)
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({
                            next: (result: any) => {
                                $(event.item.element.nativeElement).find('img:first').css('opacity', 1);
                                if (result && result.data && result.data.source_url) {
                                    // Thay thế URL local bằng URL trên domain WordPress
                                    this.done[event.currentIndex] = this.done[event.currentIndex].replace(img, result.data.source_url);
                                    this.update(false); // Lưu bài viết ngay lập tức
                                    this.toastr.success('Hình ảnh đã được tải lên domain chọn và nhúng vào Dàn ý!');
                                    this.cd.markForCheck();
                                }
                            },
                            error: (err) => {
                                console.error('Lỗi tải ảnh kéo thả lên WordPress:', err);
                                $(event.item.element.nativeElement).find('img:first').css('opacity', 1);
                            }
                        });
                } else {
                    $(event.item.element.nativeElement).find('img:first').css('opacity', 1);
                }
            })();
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
                model: 'gemini-3.6-flash',
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

    tomp3(item?: any, source?: any, index?: number) {
        const dialogRef = this.dialog.open(AIText2SpeechComponent, {
            width: '600px',
            maxWidth: '95vw',
            panelClass: 'dlg-primary',
            data: item,
            autoFocus: false
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                if (result.action === 'insert' && result.audioUrl) {
                    if (!this.source.audios) {
                        this.source.audios = [];
                    }

                    const audioHtml = `<p class="audio-player-wrapper my-2" data-audio-url="${result.audioUrl}"><audio controls preload="none" src="${result.audioUrl}" class="w-full h-9 rounded-lg !border-none !outline-none !shadow-none !bg-transparent"></audio></p>`;
                    this.source.audios.push(audioHtml);

                    this.toastr.success('Đã thêm vào danh sách Audio đã chọn!');
                } else {
                    this.toastr.success(`Tạo giọng đọc từ đoạn văn xong.`);
                }

                // lam moi lai giao dien
                this.cd.markForCheck();
            }
        });
    }

    openText2SpeechDialog() {
        this.tomp3('');
    }

    openArchiveOrgDialog(singleItem?: string) {
        if (!this.source.audios || this.source.audios.length === 0) {
            this.toastr.warning('Chưa có audio nào trong danh sách Audio đã chọn để upload.');
            return;
        }

        const itemsToUpload = singleItem ? [singleItem] : this.source.audios;
        const title = this.detectForm?.get('step1')?.get('title')?.value || 'Audio AI Writer';

        const dialogRef = this.dialog.open(ArchiveOrgDialogComponent, {
            data: {
                title: title,
                username: this.user?.name || 'AI.Type User',
            },
            width: '520px',
            disableClose: false,
        });

        dialogRef.afterClosed().subscribe(async (credentials: any) => {
            if (!credentials) return;

            this.toastr.info('Đang kết nối và upload audio lên tài khoản Archive.org...', 'Archive.org Upload');

            try {
                const clips = itemsToUpload.map((item: string, index: number) => {
                    const srcMatch = item.match(/src="([^"]+)"/) || item.match(/src='([^']+)'/);
                    let audioUrl = srcMatch ? srcMatch[1] : '';
                    let localFilePath = '';
                    let audioFileName = '';

                    if (audioUrl.startsWith('file:///')) {
                        localFilePath = decodeURIComponent(audioUrl.substring('file://'.length));
                        if (!localFilePath.startsWith('/') && !/^[a-zA-Z]:/.test(localFilePath)) {
                            localFilePath = '/' + localFilePath;
                        }
                        audioFileName = localFilePath.split(/[\\/]/).pop() || `audio_${index + 1}.mp3`;
                    } else if (audioUrl.startsWith('file://')) {
                        localFilePath = decodeURIComponent(audioUrl.substring('file://'.length));
                        audioFileName = localFilePath.split(/[\\/]/).pop() || `audio_${index + 1}.mp3`;
                    } else {
                        audioFileName = audioUrl.split('/').pop()?.split('?')[0] || `audio_${index + 1}.mp3`;
                        if (!audioUrl.startsWith('http')) {
                            localFilePath = audioUrl;
                        }
                    }

                    return {
                        id: `audio-${index + 1}`,
                        name: audioFileName,
                        localFilePath: localFilePath,
                        audioFileName: audioFileName,
                    };
                });

                const payload = {
                    accessKey: credentials.accessKey,
                    secretKey: credentials.secretKey,
                    title: credentials.title || title,
                    creator: credentials.creator || this.user?.name || 'AI.Type',
                    collection: credentials.collection || 'opensource_audio',
                    uuid: this.uuid,
                    username: this.user?.name || 'anonymous',
                    clips: clips
                };

                if ((window as any).electron && (window as any).electron.invoke) {
                    const res = await (window as any).electron.invoke('upload-to-archive-org', payload);
                    if (res && res.success) {
                        const uploadedFiles = res.files || [];

                        if (uploadedFiles.length > 0) {
                            if (!this.source.audios) this.source.audios = [];

                            uploadedFiles.forEach((f: any) => {
                                const newPlayerHtml = `<p class="audio-player-wrapper my-2" data-audio-url="${f.directUrl}"><audio controls preload="none" src="${f.directUrl}" class="w-full h-9 rounded-lg !border-none !outline-none !shadow-none !bg-transparent"></audio></p>`;

                                // 1. Cập nhật trong source.audios
                                let replacedInAudios = false;
                                for (let i = 0; i < this.source.audios.length; i++) {
                                    const item = this.source.audios[i];
                                    if (typeof item === 'string' && (item.includes(f.fileName) || item.includes(encodeURIComponent(f.fileName)) || (singleItem && item === singleItem))) {
                                        this.source.audios[i] = newPlayerHtml;
                                        replacedInAudios = true;
                                    }
                                }

                                if (!replacedInAudios) {
                                    this.source.audios.push(newPlayerHtml);
                                }

                                // 2. Cập nhật trong Dàn ý (done) nếu có chứa file cũ
                                let replacedInDone = false;
                                if (this.done && this.done.length > 0) {
                                    for (let j = 0; j < this.done.length; j++) {
                                        const doneItem = this.done[j];
                                        if (typeof doneItem === 'string' && (doneItem.includes(f.fileName) || doneItem.includes(encodeURIComponent(f.fileName)))) {
                                            this.done[j] = newPlayerHtml;
                                            replacedInDone = true;
                                        }
                                    }
                                }

                                // 3. Nếu là upload 1 file đơn lẻ hoặc theo yêu cầu, chèn player trực tiếp vào Dàn ý nếu chưa có trong Dàn ý
                                if (singleItem && !replacedInDone) {
                                    this.done.push(newPlayerHtml);
                                }
                            });

                            this.source.audios = [...this.source.audios];
                            if (this.done) this.done = [...this.done];
                        }

                        this.toastr.success(`Đã upload thành công ${res.uploadedCount || clips.length} file và cập nhật Audio Player từ Archive.org!`, 'Thành công');
                        if (this.settings?.autosave) {
                            this.autoSave();
                        }
                        this.cd.markForCheck();
                    } else {
                        const errMsg = res?.error || 'Không thể upload lên Archive.org.';
                        this.toastr.error(errMsg, 'Upload thất bại');
                    }
                } else {
                    this.toastr.info('Tính năng upload Archive.org yêu cầu chạy trên ứng dụng Desktop.');
                }
            } catch (error: any) {
                console.error('Archive.org upload error:', error);
                this.toastr.error('Có lỗi xảy ra khi upload lên archive.org.');
            }
        });
    }

    uploadSingleAudioToArchive(item: string, index: number) {
        this.openArchiveOrgDialog(item);
    }

    async createAudio(event: any) {
        const files: FileList = event.target.files;
        if (!files || files.length === 0) return;

        if (!this.source.audios) {
            this.source.audios = [];
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileUrl = (file as any).path ? `file://${(file as any).path}` : URL.createObjectURL(file);
            const audioHtml = `<p class="audio-player-wrapper my-2" data-audio-url="${fileUrl}"><audio controls preload="none" src="${fileUrl}" class="w-full h-9 rounded-lg !border-none !outline-none !shadow-none !bg-transparent"></audio></p>`;
            this.source.audios.push(audioHtml);
        }

        this.toastr.success(`Đã thêm ${files.length} file audio vào danh sách.`);
        this.cd.markForCheck();
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
        this.cd.detectChanges();

        try {
            const prompt = `Bạn là một chuyên gia chỉnh sửa và cấu trúc văn bản.
Tôi có một khối văn bản dài (có thể chứa mã HTML). Hãy phân tích ngữ nghĩa và cấu trúc của nó, sau đó tách nó ra thành các đoạn văn ngắn gọn, dễ đọc, mạch lạc hơn theo đúng ngữ cảnh.
Yêu cầu: 
- Giữ nguyên tất cả các thẻ HTML (đặc biệt là <ul>, <ol>, <li>, <img>, <iframe>, <a>, <strong>, <em>, ...). 
- KHÔNG làm mất bất kỳ thẻ HTML nào, KHÔNG làm mất chữ nào, KHÔNG tự ý bịa thêm nội dung, chỉ là chia nhỏ đoạn văn đó ra cho hợp lý.
- Ngăn cách mỗi đoạn văn (sau khi tách) bằng ĐÚNG một chuỗi ký tự "===SPLIT===". 
- CHỈ trả về nội dung đã tách, tuyệt đối KHÔNG có lời mở đầu, KHÔNG có kết luận, KHÔNG dùng markdown.

Nội dung cần tách:
${content}`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { bypassUModelverse: true, bypassModelOverride: true } as any
            });

            let text = response.text || '';
            text = text.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim(); // Remove markdown block if any
            
            let parts = text.split('===SPLIT===').map(p => p.trim()).filter(p => p.length > 0);

            if (parts && parts.length > 0) {
                data.splice(index, 1, ...parts);
                if (data === this.done) {
                    this.done = [...this.done];
                }
                if (this.source) {
                    this.source = { ...this.source };
                }
                this.toastr.success(`Đã dùng AI tách thành ${parts.length} đoạn.`);
                this.cd.detectChanges();
            } else {
                this.toastr.warning(`Không thể tách đoạn.`);
            }
        } catch (error) {
            console.error(error);
            this.toastr.error(`Lỗi khi dùng AI tách đoạn.`);
        } finally {
            this.loading = false;
            this.cd.detectChanges();
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
                                    model: 'gemini-3.6-flash',
                                    contents: [{ role: 'user', parts: parts }],
                                });

                                const jsonText = response.text;
                                if (jsonText) {
                                    const data = JSON.parse(jsonText);

                                    data.contents.map((text: string) => {
                                        this.source.text.push(
                                            `<p id="source-p-${uuid.v4()}">${this.sanitizeAIText(text)}</p>`,
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

        let promptText = this.removeHTML.transform(item);
        promptText += ' (Nếu có văn bản xuất hiện trong hình ảnh, bắt buộc phải sử dụng Tiếng Việt)';


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
                        model: 'gemini-3.6-flash',
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
                        let cdnUrl: string | null = null;
                        try {
                            cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Str, fileName, 'thumbnails');
                        } catch (e) {
                            console.warn('Upload CDN thất bại, fallback lưu local:', e);
                        }

                        const res = await (window as any).electron.invoke('save-base64', {
                            base64: base64Str,
                            fileName: fileName,
                            folder: 'thumbnails',
                            username: this.user.name
                        });

                        const finalImgSrc = cdnUrl || (res && res.success ? `file://${res.path}` : '');

                        if (finalImgSrc) {
                            this.source.img.unshift(
                                `<p id="source-img-${uuid.v4()}"><img src="${finalImgSrc}" /></p>`
                            );
                            this.toastr.success(cdnUrl ? 'Hình ảnh đã tạo và tải lên CDN thành công!' : 'Hình ảnh đã tạo thành công và lưu vào ổ cứng.');
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
        if (this.technology === 'wordpress' && this.domain) {
            return new Observable(observer => {
                fetch('file:///' + imagePath).then(res => res.blob()).then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64Data = (reader.result as string).split(',')[1];
                        this._wordpressService.upload_media(
                            this.domain.domain,
                            base64Data,
                            '',
                            '',
                            this.domain
                        ).subscribe({
                            next: (res) => {
                                if (res && res.data && res.data.source_url) {
                                    observer.next({ img: res.data.source_url });
                                    observer.complete();
                                } else {
                                    observer.next({ img: null });
                                    observer.complete();
                                }
                            },
                            error: (err) => {
                                observer.error(err);
                            }
                        });
                    };
                    reader.onerror = (err) => observer.error(err);
                    reader.readAsDataURL(blob);
                }).catch(err => observer.error(err));
            }).pipe(takeUntil(this._unsubscribeAll));
        } else {
            return this._blogService
                .uploadImage({
                    imagePath: imagePath,
                    domain: this.domain,
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll));
        }
    }

    // Chọn hình ảnh từ máy tính để đưa vào danh sách nguồn/dàn ý
    createImg = async (e: any) => {
        const files: FileList | File[] = e.target?.files || e.files;

        if (files && files.length > 0) {
            this.loading = true;
            try {
                if (!this.source.img) {
                    this.source.img = [];
                }

                let count = 0;
                for (let i = 0; i < files.length; i++) {
                    const file: File = files[i];
                    if (!file.type.startsWith('image/')) continue;

                    let filePath = (file as any).path;
                    if ((window as any).electron && (window as any).electron.getPathForFile) {
                        try {
                            filePath = (window as any).electron.getPathForFile(file);
                        } catch (err) {
                            console.error('[Upload Image] Lỗi getPathForFile:', err);
                        }
                    }

                    if (filePath) {
                        this.source.img.push(
                            `<p id="source-img-${uuid.v4()}"><img src="file:///${filePath.replace(/^file:\/\/\/?/i, '')}" alt="${file.name}" /></p>`
                        );
                        count++;
                    } else {
                        await new Promise<void>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (readEvent: any) => {
                                const imgSrc = readEvent.target.result;
                                this.source.img.push(
                                    `<p id="source-img-${uuid.v4()}"><img src="${imgSrc}" alt="${file.name}" /></p>`
                                );
                                count++;
                                resolve();
                            };
                            reader.onerror = () => resolve();
                            reader.readAsDataURL(file);
                        });
                    }
                }

                this.loading = false;
                this.cd.markForCheck();
                if (count > 0) {
                    this.toastr.success(`Đã thêm ${count} hình ảnh vào danh sách.`);
                }
            } catch (error) {
                this.loading = false;
                this.toastr.error('Lỗi khi tải hình ảnh.');
            } finally {
                if (e.target) {
                    e.target.value = '';
                }
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
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: parts }],
            });

            const jsonText = response.text;
            if (jsonText) {
                try {
                    const data = JSON.parse(jsonText);
                    if (data.contents && Array.isArray(data.contents)) {
                        data.contents.forEach((text: string) => {
                            this.source.text.push(`<p id="source-p-${uuid.v4()}">${this.sanitizeAIText(text)}</p>`);
                        });
                        this.toastr.success('AI đã hoàn thành công việc!');
                        this.attachedFiles = [];
                        this.cd.markForCheck();
                    } else {
                        // Fallback if no contents array
                        this.source.text.push(`<p id="source-p-${uuid.v4()}">${this.sanitizeAIText(jsonText)}</p>`);
                        this.toastr.success('AI đã hoàn thành công việc!');
                        this.attachedFiles = [];
                        this.cd.markForCheck();
                    }
                } catch(e) {
                    this.source.text.push(`<p id="source-p-${uuid.v4()}">${this.sanitizeAIText(jsonText)}</p>`);
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
     * Tạo hoặc tìm kiếm backlink từ Google và đưa thẳng vào block Thêm Backlink (source.a)
     */
    async createlink(keyword?: string) {
        if (keyword) {
            try {
                let domainStr = '';
                if (this.domain) {
                    if (typeof this.domain === 'string') {
                        domainStr = this.domain;
                    } else if (this.domain.domain) {
                        domainStr = this.domain.domain;
                    }
                }
                domainStr = this.cleanDomain(domainStr);

                let query = keyword.trim();
                if (domainStr) {
                    query = `site:${domainStr} ${keyword.trim()}`;
                }

                // Cập nhật searchAPIKey từ settings mới nhất
                this.settings = this.multiAccountService.getItem('settings');
                if (this.settings && this.settings.searchAPIKey) {
                    this.searchAPIKey = this.settings.searchAPIKey.split(';');
                }

                this.toastr.info(`Đang tìm kiếm backlink cho "${keyword}"...`);
                const links: any = await this.googleSearch(query, 0);

                if (links && Array.isArray(links) && links.length > 0) {
                    if (!this.source.a) {
                        this.source.a = [];
                    }

                    const topLinks = links.slice(0, 10);
                    topLinks.forEach((link: any) => {
                        const title = link.title || link.link;
                        const url = link.link;
                        this.source.a.push(
                            `<p id="source-a-${uuid.v4()}">Xem thêm: <a href="${url}" title="${title}" target="_blank">${title}</a></p>`
                        );
                    });

                    this.selectedIndex = 0; // Chuyển sang tab Nguyên liệu để người dùng thấy ngay
                    this.autohidden = true;
                    this.toastr.success(`Đã thêm ${topLinks.length} backlink vào block Thêm Backlink.`);
                    this.cd.markForCheck();
                } else {
                    this.toastr.info(`Không tìm thấy kết quả nào cho từ khóa "${keyword}".`);
                }
            } catch (error: any) {
                console.error('Lỗi khi tìm kiếm Google API:', error);
                this.toastr.error('Lỗi khi tìm kiếm Google API.');
            }
        } else {
            if (!this.source.a) {
                this.source.a = [];
            }
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
                model: 'gemini-3.6-flash',
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
                model: 'gemini-3.6-flash',
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

                    let targetDomainStr = this.source?.wp_domain;
                    let selectedDomain = null;
                    if (targetDomainStr) {
                        selectedDomain = this.domains.find(d => d.domain.replace(/^(https?:\/\/)|(www\.)/g, "").split("\/")[0] === targetDomainStr.replace(/^(https?:\/\/)|(www\.)/g, "").split("\/")[0]);
                    }

                    if (selectedDomain) {
                        this.domain = selectedDomain;
                        this.multiAccountService.setItem('domain', this.domain);
                    } else if (!this.multiAccountService.getItem('domain')) {
                        this.domain = this.domains[0];
                    } else {
                        let cached = this.multiAccountService.getItem('domain');
                        const cleanCached = (cached?.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
                        let found = this.domains.find(d => (d.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] === cleanCached);
                        this.domain = found ? found : this.domains[0];
                    }
                    
                    this.applyDomainStyle(this.domain);

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
                outline: this.done.filter((paragraph: string) => paragraph !== item[index]),
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

        if (this.done && this.done.length > 0) {
            this.done.map((content: any) => {
                if (typeof content === 'string') {
                    // remove tất cả html trong đoạn này
                    okia += this.removeHTML.transform(content) + ' ';
                }
            });
        }

        if (okia && okia.length > 0) {
            // Giới hạn độ dài xuống 3000 để tránh lỗi Internal Server Error (500) từ backend NLP với văn bản quá dài
            let safeContent = okia.substring(0, 3000);
            
            this.stepper.selectedIndex = 0;
            this.selectedIndex = 0;
            this.cd.markForCheck();
            
            this._blogService
                .keywords({
                    content: safeContent,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        this.stepper.selectedIndex = 0;
                        this.selectedIndex = 0;
                        
                        if (result && result.success && result.data) {
                            let str = result.data[1];
                            let arr = (str || '').split(' ');

                            arr.map((item: string) => {
                                if (item.indexOf('_') >= 0) {
                                    let kw = item
                                        .replace(
                                            /[@!^&\/\\#,+()$~%.'":*?<>{}\[\]]/g,
                                            '',
                                        )
                                        .replace(/[_]/g, ' ');

                                    if (!this.arr_keyword.includes(kw)) {
                                        this.arr_keyword.push(kw);
                                    }
                                }
                            });
                            
                            if (this.arr_keyword.length === 0) {
                                this.toastr.warning(`Máy chủ xử lý thành công nhưng không tìm thấy từ khoá ghép nào trong đoạn văn.`, '0 từ khoá');
                            } else {
                                this.toastr.success(`Tìm thấy ${this.arr_keyword.length} từ khoá trong Dàn ý.`);
                            }
                        } else {
                            this.toastr.warning('Máy chủ không trả về dữ liệu từ khoá.', 'Lỗi dữ liệu');
                        }
                        this.cd.markForCheck();
                    },
                    error: (err) => { 
                        this.stepper.selectedIndex = 0;
                        this.selectedIndex = 0;
                        this.toastr.error('Máy chủ NLP báo lỗi hoặc không thể xử lý đoạn văn này (Lỗi 500).', 'Lỗi máy chủ');
                        this.cd.markForCheck();
                    },
                    complete: () => {
                        this.cd.markForCheck();
                    },
                });
        } else {
            this.toastr.warning('Dàn ý chưa có nội dung chữ nào để tìm từ khoá!', 'Trống');
        }
    }

    /**
     * Biến dàn ý thành kịch bản tập phim chuyên nghiệp
     */
    async generateScript() {
        let outlineText = '';
        if (this.done && this.done.length > 0) {
            this.done.map((content: any) => {
                if (typeof content === 'string') {
                    outlineText += this.removeHTML.transform(content) + '\n\n';
                }
            });
        }

        if (!outlineText.trim()) {
            this.toastr.warning('Dàn ý chưa có nội dung để tạo kịch bản!', 'Trống');
            return;
        }

        this.isGeneratingScript = true;
        this.cd.markForCheck();

        // Đọc toàn bộ nội dung các bài viết trong Collection để nắm rõ bối cảnh tiểu thuyết
        let collectionSummary = '';
        let targetCols = this.selectedCollections || [];
        if ((!targetCols || targetCols.length === 0) && this.collections && this.uuid) {
            targetCols = this.collections.filter((c: any) => {
                if (Array.isArray(c.uuid)) return c.uuid.includes(this.uuid);
                return c.uuid === this.uuid;
            });
        }

        if (targetCols && targetCols.length > 0) {
            let uuids: string[] = [];
            targetCols.forEach((col: any) => {
                const fullCol = (this.collections || []).find((c: any) => c._id === col._id || c.id === col.id);
                const targetCol = fullCol || col;
                if (Array.isArray(targetCol.uuid)) {
                    uuids = uuids.concat(targetCol.uuid);
                } else if (targetCol.uuid) {
                    uuids.push(targetCol.uuid);
                }
            });

            uuids = Array.from(new Set(uuids));

            if (uuids.length > 0) {
                try {
                    this.toastr.info('Đang tải toàn bộ dữ liệu Collection để phân tích tiểu thuyết...', 'Đang đọc tác phẩm');
                    const detailPromises = uuids.map(uuid => 
                        firstValueFrom(this._crawlService.detail({ uuid: uuid, username: this.user?.name || this.name })).catch(() => null)
                    );

                    const detailResults: any[] = await Promise.all(detailPromises);
                    const fullDocs = detailResults
                        .filter(res => res && res.data)
                        .map(res => res.data);

                    if (fullDocs && fullDocs.length > 0) {
                        collectionSummary = fullDocs.map((art: any, idx: number) => {
                            const title = art.title || `Phần ${idx + 1}`;
                            const desc = art.seo?.description?.text || art.description ? `Mô tả: ${art.seo?.description?.text || art.description}` : '';
                            
                            let contentFromDone = '';
                            if (art.done) {
                                if (Array.isArray(art.done)) {
                                    contentFromDone = art.done
                                        .map((paragraph: any) => typeof paragraph === 'string' ? paragraph.replace(/<[^>]*>?/gm, '').trim() : '')
                                        .filter((text: string) => text.length > 0)
                                        .join('\n\n');
                                } else if (typeof art.done === 'string') {
                                    contentFromDone = art.done.replace(/<[^>]*>?/gm, '').trim();
                                }
                            }

                            if (!contentFromDone && art.source) {
                                if (art.source.prompt && Array.isArray(art.source.prompt)) {
                                    contentFromDone = art.source.prompt
                                        .map((item: any) => typeof item === 'string' ? item.replace(/<[^>]*>?/gm, '').trim() : '')
                                        .filter((text: string) => text.length > 0)
                                        .join('\n\n');
                                } else if (art.source.pre && Array.isArray(art.source.pre)) {
                                    contentFromDone = art.source.pre
                                        .map((item: any) => typeof item === 'string' ? item.replace(/<[^>]*>?/gm, '').trim() : '')
                                        .filter((text: string) => text.length > 0)
                                        .join('\n\n');
                                }
                            }

                            if (contentFromDone.length > 4000) {
                                contentFromDone = contentFromDone.substring(0, 4000) + '... [còn tiếp]';
                            }

                            return `========================================
[CHƯƠNG ${idx + 1} / PHẦN ${idx + 1}]
Tiêu đề: ${title}
${desc ? desc + '\n' : ''}Nội dung:
${contentFromDone || '(Chưa có văn bản)'}
========================================`;
                        }).join('\n\n');
                    }
                } catch (err) {
                    console.warn('Lỗi khi đọc chi tiết Collection cho kịch bản:', err);
                }
            }
        }

        this._blogService.getScript({
            username: this.user.name,
            uuid: this.uuid
        }).subscribe({
            next: (checkRes: any) => {
                const existingScript = (checkRes && checkRes.success && checkRes.data && checkRes.data.script) || (checkRes && checkRes.script);
                if (existingScript) {
                    this.multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
                    this.toastr.success('Kịch bản đã tồn tại! Đang chuyển hướng...');
                    this.isGeneratingScript = false;
                    this.cd.markForCheck();
                    this.router.navigate(['/ai-writer', this.name, this.uuid, 'script']);
                } else {
                    this.proceedGenerateScript(outlineText, collectionSummary);
                }
            },
            error: (err) => {
                console.warn('Lỗi kiểm tra kịch bản, tiến hành tạo mới:', err);
                this.proceedGenerateScript(outlineText, collectionSummary);
            }
        });
    }

    async proceedGenerateScript(outlineText: string, collectionSummary: string = '') {
        this.toastr.info('Đang gửi dàn ý lên AI để dựng kịch bản phim...', 'Đang xử lý');
        
        const title = (this.detectForm?.get('step1')?.get('title')?.value || this.details?.title || '').trim() || 'Kịch bản chưa đặt tên';

        let prompt = `Bạn là một Nhà biên kịch Điện ảnh Chuyên nghiệp. Nhiệm vụ của bạn là CHUYỂN THỂ TRUNG THỰC TUYỆT ĐỐI (100% High-Fidelity Adaptation) tác phẩm dưới đây thành một KỊCH BẢN PHIM ĐIỆN ẢNH chuẩn mực chiếu rạp.\n\n`;

        if (collectionSummary && collectionSummary.trim()) {
            prompt += `TOÀN BỘ NỘI DUNG VĂN BẢN GỐC (TRƯỜNG DONE):\n${collectionSummary}\n\n`;
        }

        prompt += `NỘI DUNG VĂN BẢN / DÀN Ý BÀI VIẾT NÀY:\n${outlineText}\n\n`;

        prompt += `QUY TẮC BẮT BUỘC - BẢO TỒN NGUYÊN VẸN NGUYÊN TÁC VÀ BÁM SÁT TỪNG ĐOẠN VĂN:

1. BÁM SÁT 100% TỪNG ĐOẠN VĂN GỐC - KHÔNG ĐƯỢC THIẾU BẤT KỲ CHI TIẾT NÀO (100% ZERO-OMISSION PARAGRAPH COVERAGE):
- Bạn PHẢI chuyển thể TUẦN TỰ TỪNG ĐOẠN VĂN của bài viết nguồn trong trường DONE sang các phân cảnh phim (Scene).
- KHÔNG BỎ SÓT BẤT KỲ ĐOẠN VĂN NÀO, KHÔNG BỎ SÓT BẤT KỲ CHI TIẾT NÀO. Mọi ý niệm, câu chuyện, nhân vật, đồ vật, sự kiện dù là nhỏ nhất trong văn bản DONE đều BẮT BUỘC phải xuất hiện trong kịch bản.
- THỨ TỰ DIỄN BIẾN: Bắt đầu lần lượt từ đoạn văn đầu tiên cho tới đoạn văn cuối cùng. TUYỆT ĐỐI KHÔNG đảo trật tự, KHÔNG nhảy cảnh, KHÔNG đưa đoạn sau lên trước.

2. VIẾT CỰC KỲ CHI TIẾT HÀNH ĐỘNG, THOẠI VÀ BỐI CẢNH (ULTRA-DETAILED ACTION & FULL DIALOGUE):
- DÒNG HÀNH ĐỘNG (ACTION LINES) SIÊU CHI TIẾT: Chuyển hóa từng đoạn văn thành các mô tả điện ảnh sinh động: mổ xẻ tỉ mỉ từng cử chỉ tay chân, ánh mắt, nụ cười, nhíu mày, tư thế, di chuyển, âm thanh môi trường (tiếng gió, tiếng mưa, tiếng gõ cửa), ánh sáng (nắng gắt, đèn vàng âm u) và góc quay máy ảnh.
- LỜI THOẠI (DIALOGUE) TRỌN VẸN 100%: Chuyển thể đầy đủ từng câu thoại của nhân vật. Đặt rõ sắc thái cảm xúc trong ngoặc đơn bên dưới tên nhân vật. CẤM TẮT THOẠI, cấm dùng các từ tóm tắt hời hợt như "hai người tiếp tục trò chuyện...", "v.v.", "...".
- ĐỘ TUỔI, TÊN GỐC & NGHỀ NGHIỆP: Giữ nguyên 100% tên gốc, con số độ tuổi (Ví dụ: Nếu nguyên tác ghi "40 tuổi" thì kịch bản BẮT BUỘC ghi (40), TUYỆT ĐỐI KHÔNG ĐỔI THÀNH 20 hay 30 tuổi!) và nghề nghiệp nguyên tác.

3. ĐỊNH DẠNG KỊCH BẢN ĐIỆN ẢNH CHIẾU RẠP CHUẨN MỰC:
- BẢO TỒN TIÊU ĐỀ: BẮT BUỘC giữ nguyên 100% Tiêu đề chính xác của tác phẩm: "${title}".
- GIỚI THIỆU NHÂN VẬT TRONG ACTION LINE: Lần đầu tiên nhân vật xuất hiện trên màn ảnh, IN HOA TÊN GỐC, kèm theo độ tuổi chính xác từ nguyên tác.
- TIÊU ĐỀ CẢNH (SCENE HEADING): Đánh số cảnh tăng dần từ Cảnh 1 đến hết theo đúng thứ tự thời gian của bài viết. Định dạng: [Số cảnh] [NỘI. / NGOẠI.] [ĐỊA ĐIỂM] - [NGÀY / ĐÊM].
- DÒNG HÀNH ĐỘNG (ACTION LINES): Miêu tả trực quan những gì ống kính máy quay thấy và nghe thấy. Viết ở ngôi thứ ba, thì hiện tại, súc tích. IN HOA tiếng động và góc nhìn đặc biệt.
- LỜI THOẠI (DIALOGUE): Tên nhân vật IN HOA ở giữa lề, dùng (O.S.), (V.O.) khi cần. Đặt sắc thái thoại trong ngoặc đơn bên dưới tên nhân vật.
- BẮT ĐẦU NGAY LẬP TỨC: Bắt đầu kịch bản trực tiếp bằng cảnh 1 hoặc "FADE IN:" mà không kèm lời giới thiệu hay giải thích thừa.`;

        try {
            this.stepper.selectedIndex = 0;
            this.selectedIndex = 0;
            this.cd.markForCheck();

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { temperature: 0.1 }
            });

            const scriptText = response.text;
            if (scriptText) {
                const title = (this.detectForm?.get('step1')?.get('title')?.value || this.details?.title || '').trim() || 'Kịch bản chưa đặt tên';
                
                this._blogService.storeScript({
                    username: this.user.name,
                    uuid: this.uuid,
                    title: title,
                    outline: outlineText,
                    script: scriptText
                }).subscribe({
                    next: (res) => {
                        this.multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
                        this.toastr.success('Dựng kịch bản phim thành công và đã lưu vào database!');
                        this.isGeneratingScript = false;
                        this.cd.markForCheck();
                        
                        // Chuyển hướng sang route mới
                        this.router.navigate(['/ai-writer', this.name, this.uuid, 'script']);
                    },
                    error: (err) => {
                        console.error('Lỗi khi lưu kịch bản vào database:', err);
                        this.toastr.error('Dựng kịch bản thành công nhưng không thể lưu vào database.', 'Lỗi lưu trữ');
                        this.isGeneratingScript = false;
                        this.cd.markForCheck();
                    }
                });
            } else {
                this.toastr.error('AI không phản hồi nội dung kịch bản.', 'Lỗi AI');
                this.isGeneratingScript = false;
                this.cd.markForCheck();
            }
        } catch (error) {
            console.error('Lỗi dựng kịch bản:', error);
            this.toastr.error('Không thể kết nối đến máy chủ AI để dựng kịch bản.', 'Lỗi kết nối');
            this.isGeneratingScript = false;
            this.cd.markForCheck();
        }
    }

    async generateImageFromOutline() {
        if (this.isGeneratingImage) return;

        let outlineText = '';
        if (this.done && this.done.length > 0) {
            this.done.map((content: any) => {
                if (typeof content === 'string') {
                    outlineText += this.removeHTML.transform(content) + '\n\n';
                }
            });
        }

        if (!outlineText.trim()) {
            this.toastr.warning('Dàn ý chưa có nội dung để tạo hình ảnh!', 'Trống');
            return;
        }

        this.isGeneratingImage = true;
        this.toastr.info('Đang tiến hành tạo ảnh qua API...', 'Tạo hình ảnh');
        this.cd.markForCheck();

        try {
            let imagePrompt = '';
            if (this.customImagePrompt && this.customImagePrompt.trim()) {
                imagePrompt = `Tạo hình ảnh minh họa cho dàn ý bài viết với định hướng sau:\n${this.customImagePrompt.trim()}\n\nNội dung dàn ý chi tiết:\n"${outlineText.trim()}"\n\nYêu cầu: Hình ảnh phải phản ánh chính xác nội dung, ý tưởng chính và bối cảnh của dàn ý. Phong cách nghệ thuật hiện đại, đẹp mắt.`;
            } else {
                imagePrompt = `Tạo hình ảnh minh họa cho dàn ý chi tiết sau:\n\n"${outlineText.trim()}"\n\nYêu cầu: Hình ảnh phải phản ánh chính xác nội dung, ý tưởng chính và bối cảnh của dàn ý trên. Phong cách nghệ thuật hiện đại, đẹp mắt.`;
            }
            imagePrompt += ', if there is any text in the image, it MUST be written in Vietnamese language.';

            const partsForImage: any[] = [{ text: imagePrompt }];

            if (this.referenceImageBase64) {
                const mimeType = this.referenceImageBase64.substring(
                    this.referenceImageBase64.indexOf(':') + 1,
                    this.referenceImageBase64.indexOf(';')
                ) || 'image/jpeg';
                const base64Data = this.referenceImageBase64.split(',')[1] || this.referenceImageBase64;
                partsForImage.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }

            // Gửi trực tiếp tới endpoint /api/image
            const imageResponse = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: partsForImage }],
                config: { responseModalities: ['IMAGE'] }
            } as any);

            let base64Str = '';
            const parts = imageResponse.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    base64Str = part.inlineData.data;
                    break;
                }
            }

            if (base64Str) {
                const fileName = `outline_image_${Date.now()}.png`;
                let cdnUrl: string | null = null;
                try {
                    cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Str, fileName, 'thumbnails');
                } catch (e) {
                    console.warn('Upload CDN thất bại, fallback lưu local:', e);
                }

                let localPath = '';
                const res = await (window as any).electron.invoke('save-base64', {
                    base64: base64Str,
                    fileName: fileName,
                    folder: 'thumbnails',
                    username: this.user.name
                });
                if (res && res.success) {
                    localPath = res.path;
                }

                const finalImgSrc = cdnUrl || (localPath ? `file://${localPath}` : '');
                const thumbValue = cdnUrl || localPath;

                if (finalImgSrc) {
                    const existingValue = this.detectForm.get('step1').get('thumbnail').value || '';
                    const newValue = existingValue.trim() ? existingValue.trim() + '\n' + thumbValue : thumbValue;
                    this.detectForm.get('step1').get('thumbnail').setValue(newValue);
                    
                    (this as any).isThumbnailChanged = true;
                    this.update(false); // Lưu lại ngay lập tức

                    this.source.img.push(`<p id="source-img-${uuid.v4()}"><img src="${finalImgSrc}" /></p>`);

                    this.toastr.success(cdnUrl ? 'Ảnh minh họa đã tạo và tải lên CDN thành công!' : 'Ảnh minh họa đã tạo và lưu vào ổ cứng.');
                    this.cd.markForCheck();
                } else {
                    this.toastr.error('Lưu ảnh thất bại: ' + (res?.error || 'Lỗi không xác định'));
                }
            } else {
                this.toastr.error('Không nhận được dữ liệu ảnh từ máy chủ AI!');
            }
        } catch (error) {
            console.error('Lỗi tạo ảnh từ dàn ý:', error);
            this.toastr.error('Có lỗi xảy ra khi tạo ảnh từ dàn ý!');
        } finally {
            this.isGeneratingImage = false;
            this.cd.markForCheck();
        }
    }

    async generateImageFromParagraph(item: any) {
        if (this.isGeneratingImage) return;

        const paragraphText = this.removeHTML.transform(item);
        if (!paragraphText || !paragraphText.trim()) {
            this.toastr.warning('Đoạn văn chưa có nội dung để tạo hình ảnh!', 'Trống');
            return;
        }

        this.isGeneratingImage = true;
        this.toastr.info('Đang tiến hành tạo ảnh qua API...', 'Tạo hình ảnh');
        this.cd.markForCheck();

        try {
            let imagePrompt = '';
            if (this.customImagePrompt && this.customImagePrompt.trim()) {
                imagePrompt = `Tạo hình ảnh minh họa cho đoạn văn với định hướng sau:\n${this.customImagePrompt.trim()}\n\nNội dung đoạn văn chi tiết:\n"${paragraphText.trim()}"\n\nYêu cầu: Hình ảnh phải thể hiện đầy đủ, chính xác bối cảnh và ý tưởng của đoạn văn. Phong cách nghệ thuật hiện đại, đẹp mắt.`;
            } else {
                imagePrompt = `Tạo hình ảnh minh họa cho nội dung đoạn văn chi tiết sau:\n\n"${paragraphText.trim()}"\n\nYêu cầu: Hình ảnh phải thể hiện đầy đủ, chính xác bối cảnh và ý tưởng của đoạn văn trên. Phong cách nghệ thuật hiện đại, đẹp mắt.`;
            }
            imagePrompt += ', if there is any text in the image, it MUST be written in Vietnamese language.';

            const partsForImage: any[] = [{ text: imagePrompt }];

            if (this.referenceImageBase64) {
                const mimeType = this.referenceImageBase64.substring(
                    this.referenceImageBase64.indexOf(':') + 1,
                    this.referenceImageBase64.indexOf(';')
                ) || 'image/jpeg';
                const base64Data = this.referenceImageBase64.split(',')[1] || this.referenceImageBase64;
                partsForImage.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }

            // Gửi trực tiếp tới endpoint /api/image
            const imageResponse = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: partsForImage }],
                config: { responseModalities: ['IMAGE'] }
            } as any);

            let base64Str = '';
            const parts = imageResponse.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    base64Str = part.inlineData.data;
                    break;
                }
            }

            if (base64Str) {
                const fileName = `paragraph_image_${Date.now()}.png`;
                let cdnUrl: string | null = null;
                try {
                    cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Str, fileName, 'thumbnails');
                } catch (e) {
                    console.warn('Upload CDN thất bại, fallback lưu local:', e);
                }

                let localPath = '';
                const res = await (window as any).electron.invoke('save-base64', {
                    base64: base64Str,
                    fileName: fileName,
                    folder: 'thumbnails',
                    username: this.user.name
                });
                if (res && res.success) {
                    localPath = res.path;
                }

                const finalImgSrc = cdnUrl || (localPath ? `file://${localPath}` : '');

                if (finalImgSrc) {
                    this.source.img.push(`<p id="source-img-${uuid.v4()}"><img src="${finalImgSrc}" /></p>`);
                    this.update(false); // Lưu lại ngay lập tức

                    this.toastr.success(cdnUrl ? 'Ảnh minh họa đã tạo và tải lên CDN thành công!' : 'Ảnh minh họa đã tạo và lưu vào ổ cứng.');
                    this.cd.markForCheck();
                } else {
                    this.toastr.error('Lưu ảnh thất bại: ' + (res?.error || 'Lỗi không xác định'));
                }
            } else {
                this.toastr.error('Không nhận được dữ liệu ảnh từ máy chủ AI!');
            }
        } catch (error) {
            console.error('Lỗi tạo ảnh từ đoạn văn:', error);
            this.toastr.error('Có lỗi xảy ra khi tạo ảnh từ đoạn văn!');
        } finally {
            this.isGeneratingImage = false;
            this.cd.markForCheck();
        }
    }

    /**
     * Tiến trình tự động kiểm tra tất cả ảnh nội bộ/local/file/base64 trong bài viết,
     * tự động đẩy lên CDN (cdn1.type.vn) và cập nhật đường dẫn HTTPS mới vào lại giao diện & dữ liệu.
     */
    async autoUploadLocalImagesToCDN() {
        let uploadCount = 0;
        const replacements: { [oldUrl: string]: string } = {};

        // 1. Kiểm tra danh sách Thumbnail trong form
        const thumbValue = this.detectForm?.get('step1')?.get('thumbnail')?.value || '';
        if (thumbValue) {
            const lines = thumbValue.split('\n');
            const updatedLines: string[] = [];

            for (let line of lines) {
                const cleanLine = line.trim();
                if (!cleanLine) continue;

                // Bỏ qua nếu đã là URL online HTTPS/HTTP
                if (cleanLine.startsWith('http://') || cleanLine.startsWith('https://')) {
                    updatedLines.push(cleanLine);
                    continue;
                }

                try {
                    let base64Data = '';
                    let ext = 'png';
                    let localPath = cleanLine.startsWith('file://') ? cleanLine.substring(7) : cleanLine;

                    if (cleanLine.startsWith('data:image/')) {
                        const parts = cleanLine.split(',');
                        base64Data = parts[1] || '';
                        if (cleanLine.includes('image/jpeg') || cleanLine.includes('image/jpg')) ext = 'jpg';
                    } else if ((window as any).electron && localPath) {
                        const readRes = await (window as any).electron.invoke('read-file-base64', { filePath: localPath });
                        if (readRes && readRes.success && readRes.base64) {
                            base64Data = readRes.base64;
                            if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) ext = 'jpg';
                        }
                    }

                    if (base64Data) {
                        const fileName = `auto_cdn_${Date.now()}.${ext}`;
                        const cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Data, fileName, 'thumbnails');
                        if (cdnUrl) {
                            updatedLines.push(cdnUrl);
                            replacements[cleanLine] = cdnUrl;
                            if (localPath && localPath !== cleanLine) {
                                replacements[localPath] = cdnUrl;
                                replacements['file://' + localPath] = cdnUrl;
                            }
                            uploadCount++;
                            console.log(`[Auto CDN] Đã chuyển thumbnail local lên CDN: ${cleanLine} -> ${cdnUrl}`);
                        } else {
                            updatedLines.push(cleanLine);
                        }
                    } else {
                        updatedLines.push(cleanLine);
                    }
                } catch (e) {
                    console.warn('[Auto CDN] Lỗi upload thumbnail local:', e);
                    updatedLines.push(cleanLine);
                }
            }

            if (uploadCount > 0) {
                this.detectForm.get('step1').get('thumbnail').setValue(updatedLines.join('\n'));
                (this as any).isThumbnailChanged = true;
            }
        }

        // 2. Kiểm tra danh sách Phân tích hình ảnh (source.img)
        if (this.source && Array.isArray(this.source.img)) {
            for (let i = 0; i < this.source.img.length; i++) {
                const item = this.source.img[i];
                if (typeof item !== 'string') continue;

                const match = item.match(/src=["']([^"']+)["']/);
                if (match && match[1]) {
                    const imgSrc = match[1].trim();
                    if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
                        continue;
                    }

                    try {
                        let base64Data = '';
                        let ext = 'png';
                        let localPath = imgSrc.startsWith('file://') ? imgSrc.substring(7) : imgSrc;

                        if (imgSrc.startsWith('data:image/')) {
                            const parts = imgSrc.split(',');
                            base64Data = parts[1] || '';
                            if (imgSrc.includes('image/jpeg') || imgSrc.includes('image/jpg')) ext = 'jpg';
                        } else if ((window as any).electron && localPath) {
                            const readRes = await (window as any).electron.invoke('read-file-base64', { filePath: localPath });
                            if (readRes && readRes.success && readRes.base64) {
                                base64Data = readRes.base64;
                                if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) ext = 'jpg';
                            }
                        }

                        if (base64Data) {
                            const fileName = `auto_cdn_${Date.now()}_${i}.${ext}`;
                            const cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Data, fileName, 'thumbnails');
                            if (cdnUrl) {
                                this.source.img[i] = item.replace(/src="[^"]+"/, `src="${cdnUrl}"`).replace(/src='[^']+'/, `src='${cdnUrl}'`);
                                replacements[imgSrc] = cdnUrl;
                                if (localPath && localPath !== imgSrc) {
                                    replacements[localPath] = cdnUrl;
                                    replacements['file://' + localPath] = cdnUrl;
                                }
                                uploadCount++;
                                console.log(`[Auto CDN] Đã chuyển source.img local lên CDN: ${imgSrc} -> ${cdnUrl}`);
                            }
                        }
                    } catch (e) {
                        console.warn('[Auto CDN] Lỗi upload source.img local:', e);
                    }
                }
            }
        }

        // 3. Cập nhật các đường dẫn vừa upload trong mục nội dung dàn ý / bài viết (done)
        if (this.done && Array.isArray(this.done)) {
            for (let d = 0; d < this.done.length; d++) {
                if (typeof this.done[d] === 'string') {
                    for (const [oldUrl, newUrl] of Object.entries(replacements)) {
                        if (this.done[d].includes(oldUrl)) {
                            this.done[d] = this.done[d].split(oldUrl).join(newUrl);
                        }
                    }
                }
            }
        }

        // 4. Nếu có ảnh nào được đẩy lên CDN thành công -> tự động lưu lại bài viết và thông báo
        if (uploadCount > 0) {
            this.update(false); // Lưu lại dữ liệu bài viết
            this.toastr.success(`Đã tự động đẩy ${uploadCount} hình ảnh nội bộ lên CDN thành công!`);
            this.cd.markForCheck();
        }
    }

    /**
     * Hỏi ChatGPT trực tiếp
     */
    chatgpt(content?: string, event?: any): void {
        if (event) {
            event.preventDefault();
        }

        // Redirect to Global Agent (Header)
        this._h.openChatGPTWithSEO$.next({
            goiy: content ? "Hãy giải thích hoặc trả lời câu hỏi liên quan đến nội dung này:\n\n" + content : "Bạn cần hỏi gì?",
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
                model: 'gemini-3.6-flash',
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

    confirmClear() {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xác nhận xóa nội dung',
            message: 'Bạn có chắc chắn muốn xóa toàn bộ các đoạn văn bản trong bài viết này không?',
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation',
                color: 'warn'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa ngay',
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: 'Hủy'
                }
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.clear();
            }
        });
    }

    async saveToLocalDiskQuick(event?: MouseEvent, silent: boolean = false): Promise<any> {
        if (event) event.preventDefault();
        const title = this.detectForm?.get('step1')?.get('title')?.value || this.details?.title || 'Bài viết chưa đặt tên';
        const content = (this.done || []).join('\n\n');
        const domainStr = this.domain?.domain || (typeof this.domain === 'string' ? this.domain : 'local.ai.type');

        let pureMarkdown = '';
        try {
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                hr: '---'
            });
            turndownService.addRule('image', {
                filter: 'img',
                replacement: (imgContent: string, node: any) => {
                    const alt = node.getAttribute('alt') || '';
                    const src = node.getAttribute('src') || '';
                    const imgTitle = node.getAttribute('title') || '';
                    const titlePart = imgTitle ? ` "${imgTitle}"` : '';
                    return src ? `\n\n![${alt}](${src}${titlePart})\n\n` : '';
                }
            });
            pureMarkdown = turndownService.turndown(content).replace(/\n{3,}/g, '\n\n').trim();
        } catch (e) {
            pureMarkdown = content;
        }

        if ((window as any).electron && (window as any).electron.saveLocalArticle) {
            const res = await (window as any).electron.saveLocalArticle({
                title,
                url: this.detectForm?.get('step2')?.get('url')?.value || '',
                content,
                markdown: pureMarkdown,
                domain: domainStr,
                username: this.user?.name || 'admin',
                uuid: this.uuid || undefined,
                source: this.source,
                done: this.done,
                trash: this.trash,
                seo: this.seo,
                arr_keyword: this.arr_keyword,
                style: this.style,
                thumbnail: this.detectForm?.get('step1')?.get('thumbnail')?.value || '',
                description: this.detectForm?.get('step1')?.get('description')?.value || '',
                password: this.articlePassword || undefined
            });
            if (res && res.success) {
                if (!silent) this.toastr.success(`Đã lưu bài viết`);
            } else if (!silent) {
                this.toastr.error(`Lỗi khi lưu cục bộ: ${res?.error || 'Không rõ lỗi'}`);
            }
            return res;
        } else if (!silent) {
            const blob = new Blob([`# ${title}\n\n${pureMarkdown}`], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
            a.click();
            URL.revokeObjectURL(url);
            this.toastr.success(`Đã tải tệp Markdown cục bộ về máy!`, 'Lưu Cục Bộ');
        }
        return null;
    }

    /**
     * Xoá một đoạn văn
     */
    async editVideo(item: any, index: number = -1) {
        try {
            let existingUuid = null;
            if (typeof item === 'string') {
                const uuidMatch = item.match(/data-uuid="([^"]+)"/);
                if (uuidMatch && uuidMatch[1]) {
                    existingUuid = uuidMatch[1];
                }
            }

            let localFilePath = this.removeHTML.transform(item);
            if (!localFilePath || typeof localFilePath !== 'string') return;
            localFilePath = localFilePath.trim();

            // Fallback: Khôi phục uuid từ map lưu local nếu bị mất khỏi HTML do load từ server
            let videoMap = this.multiAccountService.getItem('ai_type_video_uuid_map_' + this.uuid) || {};
            if (!existingUuid && videoMap[localFilePath]) {
                existingUuid = videoMap[localFilePath];
            }

            let electronApi = null;
            if (window && (window as any).electron) {
                electronApi = (window as any).electron;
            }

            // 1. Kiểm tra nếu đã có projectData và video đã tải về máy -> Bật dialog lên luôn, không tải lại
            let projectData: any = null;
            if (existingUuid) {
                projectData = await this.multiAccountService.getItem('ai_type_video_ready_data_' + existingUuid);
                if (projectData && projectData.scenes && projectData.scenes.length > 0 && projectData.scenes[0].videos && projectData.scenes[0].videos.length > 0) {
                    const existingVideoUrl = projectData.scenes[0].videos[0].videoUrl;
                    if (existingVideoUrl) {
                        let fileExists = true;
                        if (electronApi && electronApi.checkFileExists) {
                            fileExists = await electronApi.checkFileExists(existingVideoUrl);
                        }
                        if (fileExists) {
                            // Cập nhật duration chính xác nếu trước đó bị lưu nhầm 5s
                            if (projectData.scenes.length === 1 && projectData.scenes[0].videos.length === 1) {
                                const v0 = projectData.scenes[0].videos[0];
                                if (electronApi && electronApi.getMediaDuration) {
                                    const durRes = await electronApi.getMediaDuration(existingVideoUrl);
                                    if (durRes && durRes.success && durRes.duration > 0) {
                                        v0.duration = Math.round(durRes.duration * 10) / 10;
                                        v0.maxDuration = v0.duration;
                                        this.multiAccountService.setItem('ai_type_video_ready_data_' + existingUuid, projectData);
                                    }
                                }
                            }

                            // Đã có video tải về sẵn sàng -> Bật dialog lên luôn
                            this.dialog.open(VideoTimelineDialogComponent, {
                                width: '100vw',
                                maxWidth: '100vw',
                                height: '100vh',
                                maxHeight: '100vh',
                                panelClass: ['custom-timeline-container', 'dialog-no-padding', 'overflow-hidden'],
                                data: {
                                    uuid: existingUuid,
                                    projectData: projectData,
                                    audioList: [],
                                    videoFormat: 'video'
                                },
                                disableClose: true,
                            });
                            return;
                        }
                    }
                }
            }

            let fileUrl = localFilePath;
            let downloadCache = this.multiAccountService.getItem('ai_type_video_download_cache') || {};

            // 2. Kiểm tra nếu url online này đã được tải về local trước đó và file vẫn còn tồn tại trên máy
            let hasCachedFile = false;
            if (localFilePath.startsWith('http') && downloadCache[localFilePath]) {
                const cachedPath = downloadCache[localFilePath];
                if (electronApi && electronApi.checkFileExists) {
                    const exists = await electronApi.checkFileExists(cachedPath);
                    if (exists) {
                        fileUrl = cachedPath;
                        hasCachedFile = true;
                    }
                } else {
                    fileUrl = cachedPath;
                    hasCachedFile = true;
                }
            }

            // 3. Nếu chưa có trên local và là link online -> Tải video về máy
            if (localFilePath.startsWith('http') && !hasCachedFile) {
                if (electronApi) {
                    if (index >= 0) {
                        this.downloadingItemIndex = index;
                        this.downloadItemPercent[index] = 0;
                        this.cd.detectChanges();
                    }
                    this.toastr.info('Đang tải video chất lượng cao nhất về máy để chỉnh sửa...');
                    let customCookies = this.settings?.customCookies || '';
                    if (!customCookies) {
                        const settingsStr = localStorage.getItem('settings');
                        if (settingsStr) {
                            try {
                                customCookies = JSON.parse(settingsStr).customCookies || '';
                            } catch (e) {}
                        }
                    }
                    if (!customCookies) {
                        customCookies = this.multiAccountService.getItem('setting_cookies') || '';
                    }
                    const payload = {
                        url: localFilePath,
                        customCookies: customCookies
                    };
                    const downloadResult = await electronApi.invoke('download-single-video-temp', payload);
                    if (downloadResult && downloadResult.success) {
                        fileUrl = downloadResult.path;
                        downloadCache[localFilePath] = fileUrl;
                        this.multiAccountService.setItem('ai_type_video_download_cache', downloadCache);
                    } else {
                        this.toastr.error('Lỗi khi tải video: ' + (downloadResult?.error || 'Unknown error'));
                        return;
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
                if (electronApi && electronApi.getMediaDuration) {
                    const durRes = await electronApi.getMediaDuration(fileUrl);
                    if (durRes && durRes.success && durRes.duration > 0) {
                        actualDuration = Math.round(durRes.duration * 10) / 10;
                    }
                }
                if (actualDuration === 5) {
                    actualDuration = await new Promise<number>((resolve) => {
                        const video = document.createElement('video');
                        video.preload = 'metadata';
                        const cleanup = () => {
                            video.onloadedmetadata = null;
                            video.onerror = null;
                            video.src = '';
                            try { video.load(); } catch (e) {}
                        };
                        video.onloadedmetadata = () => {
                            const dur = video.duration || 5;
                            cleanup();
                            resolve(dur);
                        };
                        video.onerror = () => {
                            cleanup();
                            resolve(5); // fallback
                        };
                        video.src = fileUrl;
                    });
                }
            } catch (e) {
                actualDuration = 5;
            }

            let sceneAssets: any[] = [
                {
                    id: 1,
                    videoUrl: fileUrl,
                    duration: actualDuration,
                    maxDuration: actualDuration
                }
            ];

            const randomUuid = existingUuid || uuid.v4();
            
            if (!existingUuid) {
                let videoMap = this.multiAccountService.getItem('ai_type_video_uuid_map_' + this.uuid) || {};
                videoMap[localFilePath] = randomUuid;
                this.multiAccountService.setItem('ai_type_video_uuid_map_' + this.uuid, videoMap);
            }

            if (projectData && projectData.scenes && projectData.scenes.length > 0) {
                // Đã có projectData cũ nhưng file video bị mất -> Cập nhật URL file mới tải về vào scenes
                for (const scene of projectData.scenes) {
                    if (scene.videos) {
                        for (const vid of scene.videos) {
                            vid.videoUrl = fileUrl;
                            vid.duration = actualDuration;
                            vid.maxDuration = actualDuration;
                        }
                    }
                }
            } else {
                projectData = {
                    uuid: randomUuid,
                    aspectRatio: '16:9',
                    scenes: [
                        {
                            videos: sceneAssets
                        }
                    ]
                };
            }

            this.multiAccountService.setItem('ai_type_video_ready_data_' + randomUuid, projectData);
            // Bỏ việc can thiệp vào `item` (HTML string) vì UUID đã được quản lý an toàn qua `videoMap`.
            const dialogRef = this.dialog.open(VideoTimelineDialogComponent, {
                width: '100vw',
                maxWidth: '100vw',
                height: '100vh',
                maxHeight: '100vh',
                panelClass: ['custom-timeline-container', 'dialog-no-padding', 'overflow-hidden'],
                data: {
                    uuid: randomUuid,
                    projectData: projectData,
                    audioList: [],
                    videoFormat: 'video'
                },
                disableClose: true,
            });
        } catch (err: any) {
            console.error('Lỗi khi mở video:', err);
            this.toastr.error('Lỗi: ' + (err?.message || err));
        } finally {
            if (this.downloadingItemIndex === index) {
                this.downloadingItemIndex = null;
                if (index >= 0) delete this.downloadItemPercent[index];
                this.cd.detectChanges();
            }
        }
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

            let sourceToSend = this.source;
            let doneToSend = this.done;
            let trashToSend = this.trash;
            let isEncrypted = false;

            if (this.articlePassword) {
                isEncrypted = true;
                const encryptedObj = this.encryptPayload(this.source, this.done, this.trash, this.articlePassword);
                sourceToSend = encryptedObj.source;
                doneToSend = encryptedObj.done;
                trashToSend = encryptedObj.trash;
            }

            if (this.autoSaveLocal && (window as any).electron && (window as any).electron.saveLocalArticle) {
                const targetUuid = this.uuid || this._h.generateNanoId(10);
                (window as any).electron.saveLocalArticle({
                    title: this.detectForm.get('step1').get('title').value,
                    url: this.detectForm.get('step2').get('url').value,
                    content: (this.done || []).join('\n\n'),
                    source: sourceToSend,
                    done: doneToSend,
                    trash: trashToSend,
                    seo: this.seo,
                    arr_keyword: this.arr_keyword,
                    domain: this.domain,
                    username: this.user.name,
                    thumbnail: isEncrypted ? '' : this.detectForm.get('step1').get('thumbnail').value,
                    description: this.detectForm.get('step1').get('description').value,
                    uuid: targetUuid,
                    password: this.articlePassword || undefined
                }).then((res: any) => {
                    if (res && res.success) {
                        this.uuid = res.uuid || targetUuid;
                        this._h.updateStatistics('writing', 1);
                        this.toastr.success(`Đã lưu bài viết`);

                        if (this.source && this.source.wpPosts && this.source.wpPosts.length > 0) {
                            this.syncToWordpress();
                        } else if (this.source && this.source.wp_post_id) {
                            this.export();
                        } else {
                            this.syncToWordpress();
                        }

                        this.router.navigate([
                            'ai-writer',
                            this.user.name,
                            this.uuid,
                        ]);
                    } else {
                        this.toastr.error(`Lỗi khi lưu bài viết vào database cục bộ: ${res?.error || 'Không rõ lỗi'}`);
                    }
                    this.cd.markForCheck();
                }).catch((err: any) => {
                    this.toastr.error(`Lỗi khi lưu bài viết cục bộ: ${err?.message || err}`);
                    this.cd.markForCheck();
                });
                return;
            }

            this._crawlService
                .storeArchive({
                    title: this.detectForm.get('step1').get('title').value,
                    url: this.detectForm.get('step2').get('url').value,
                    source: sourceToSend,
                    done: doneToSend,
                    trash: trashToSend,
                    seo: this.seo,
                    arr_keyword: this.arr_keyword,
                    domain: this.domain,
                    username: this.user.name,
                    thumbnail: isEncrypted ? '' : this.detectForm.get('step1').get('thumbnail').value,
                    is_encrypted: isEncrypted
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            this._h.updateStatistics('writing', 1);

                            this.toastr.success(`Đã lưu bài viết`);
                            
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
            formattedContent = this.sanitizeAIText(formattedContent);

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
                        if (postDomain) {
                            const cleanPost = (postDomain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
                            selectedDomain = this.domains.find((d: any) => (d.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] === cleanPost);
                        }
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
                let editor = _.find(this.details['history'], (item: any) => {
                    if (!item || !item.createdAt || !e.value) return false;
                    return item.createdAt === e.value ||
                        (new Date(item.createdAt).getTime() === new Date(e.value).getTime());
                });

                if (editor) {
                    this.new_version = 1; // cập nhật theo phiên bản
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
                let editor = _.find(this.details['history'], (item: any) => {
                    if (!item || !item.createdAt || !this.version_value) return false;
                    return item.createdAt === this.version_value ||
                        (new Date(item.createdAt).getTime() === new Date(this.version_value).getTime());
                });

                if (editor) {
                    this.new_version = 1; // cập nhật theo phiên bản
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
    }

    compareVersionDates = (o1: any, o2: any): boolean => {
        if (o1 === o2) return true;
        if (!o1 || !o2) return false;
        return new Date(o1).getTime() === new Date(o2).getTime();
    };

    compareCollections = (item1: any, item2: any): boolean => {
        if (item1 === item2) return true;
        if (!item1 || !item2) return false;
        const id1 = item1._id || item1.id || (typeof item1 === 'string' ? item1 : null);
        const id2 = item2._id || item2.id || (typeof item2 === 'string' ? item2 : null);
        if (id1 && id2) return id1 === id2;
        return item1.title && item2.title ? item1.title === item2.title : false;
    };

    /**
     * Sửa archive
     */
    update(confirm: boolean = false, syncWp: boolean = true) {
        if (!this.uuid) {
            this.archive();
            return;
        }

        this.checkseo();

        if (this.style && this.source) {
            this.source.style = this.style;
        }

        let sourceToSend = this.source ? JSON.parse(JSON.stringify(this.source)) : {};
        let doneToSend = this.done;
        let trashToSend = this.trash;
        let isEncrypted = false;

        if (!this.articlePassword && this.uuid) {
            const cachedPwd = sessionStorage.getItem('unlocked_pwd_' + this.uuid);
            if (cachedPwd) {
                this.articlePassword = cachedPwd;
            }
        }

        if (this.articlePassword) {
            isEncrypted = true;
            const encryptedObj = this.encryptPayload(this.source, this.done, this.trash, this.articlePassword);
            sourceToSend = encryptedObj.source;
            doneToSend = encryptedObj.done;
            trashToSend = encryptedObj.trash;
            if (this.uuid) {
                localStorage.setItem('article_encrypted_' + this.uuid, 'true');
                sessionStorage.setItem('unlocked_pwd_' + this.uuid, this.articlePassword);
            }
            if (this.details) {
                this.details.is_encrypted = true;
            }
        } else {
            isEncrypted = false;
            if (sourceToSend) {
                sourceToSend.encrypted = false;
                delete sourceToSend.cipher;
            }
            if (this.source) {
                this.source.encrypted = false;
                delete this.source.cipher;
            }
            if (this.details) {
                this.details.is_encrypted = false;
                delete this.details.cipher;
                if (this.details.source) {
                    this.details.source.encrypted = false;
                    delete this.details.source.cipher;
                }
            }
            if (this.uuid) {
                localStorage.removeItem('article_encrypted_' + this.uuid);
                sessionStorage.removeItem('unlocked_pwd_' + this.uuid);
            }
        }

        let data = {
            uuid: this.uuid,
            title: this.detectForm.get('step1').get('title').value,
            url: this.detectForm.get('step2').get('url').value,
            source: sourceToSend,
            done: doneToSend,
            trash: trashToSend,
            seo: this.seo,
            arr_keyword: this.arr_keyword,
            domain: this.domain,
            style: this.style,
            username: this.user.name,
            thumbnail: isEncrypted ? '' : this.detectForm.get('step1').get('thumbnail').value,
            confirm: confirm,
            new_version: this.new_version,
            createdAt: this.version_value,
            has_script: !!this.multiAccountService.getItem(`ai_type_script_data_${this.uuid}`),
            is_encrypted: isEncrypted
        };

        if (this.autoSaveLocal && (window as any).electron && (window as any).electron.saveLocalArticle) {
            this.saveToLocalDiskQuick(undefined, false).then((res: any) => {
                if (res && res.success) {
                    if (this.new_version === -2) {
                        if (this.details) {
                            if (!this.details['history']) this.details['history'] = [];
                            this.details['history'].push(data);
                        }

                        this.new_version = 1;
                        this.time = new Date();
                        localStorage.version_value = this.version_value;

                        const currentUrl = this.router.url;
                        this.router
                            .navigateByUrl('/', { skipLocationChange: true })
                            .then(() => {
                                this.router.navigate([currentUrl]);
                            });

                        this.toastr.success(`Đã lưu phiên bản mới vào database cục bộ.`);
                    } else {
                        if (this.details && this.details['history']) {
                            let index = _.findIndex(this.details['history'], {
                                createdAt: this.version_value,
                            });

                            if (index > -1) this.details['history'][index] = data;
                        }

                        if (syncWp) {
                            this.syncToWordpress();
                        }
                    }
                }
                this.cd.markForCheck();
            });
            return;
        }

        this._crawlService
            .archiveUpdate(data)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                error: () => { },
                complete: () => {
                    if (this.new_version === -2) {
                        if (this.details) {
                            if (!this.details['history']) this.details['history'] = [];
                            this.details['history'].push(data);
                        }

                        this.new_version = 1;
                        this.time = new Date();
                        localStorage.version_value = this.version_value;

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

                        this.toastr.success(`Đã lưu bài viết`);
                        if (syncWp) {
                            this.syncToWordpress();
                        }
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
     * Xử lý dữ liệu bài viết sau khi nạp về (bao gồm tự động giải mã và bảo mật)
     */
    private handleLoadedArticle(details: any) {
        if (!details || !details.success || !details.data) {
            this.alert('ID không hợp lệ hoặc dữ liệu không tồn tại.');
            return;
        }

        this.details = details.data;

        const finishInit = () => {
            if (!this.details.source) {
                this.details.source = { backup: this.source.backup };
            } else if (!this.details.source.backup) {
                this.details.source.backup = this.source.backup;
            }

            let version_value = localStorage.version_value;
            if (version_value) {
                this.version_value = version_value;
            } else {
                this.version_value = this.details.createdAt;
            }

            this.history();
            this.nodeInCollection();
            this.allcomments();
            this.setDefault();
        };

        const possibleKeys = [
            this.uuid,
            this.details?.uuid,
            this.details?._id,
            this.details?.id,
            this.name
        ].filter(Boolean);

        finishInit();
    }

    author(name: string) {
        if ((window as any).electron && (window as any).electron.readLocalArticle) {
            (window as any).electron.readLocalArticle({ uuid: this.uuid, username: name }).then((localRes: any) => {
                if (localRes && localRes.success && localRes.article) {
                    this.handleLoadedArticle({ success: true, data: localRes.article });
                    return;
                }
                // Nếu không tìm thấy trong database local, gọi API server bình thường
                forkJoin([this.together(), this.detail(name)])
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        error: () => {
                            this.alert('Nội dung chưa được tải về.');
                        },
                        next: async (response: any) => {
                            const details = response[1];
                            this.handleLoadedArticle(details);
                        },
                        complete: () => {
                        },
                    });
            }).catch(() => {
                forkJoin([this.together(), this.detail(name)])
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        error: () => {
                            this.alert('Nội dung chưa được tải về.');
                        },
                        next: async (response: any) => {
                            const details = response[1];
                            this.handleLoadedArticle(details);
                        },
                        complete: () => {
                        },
                    });
            });
            return;
        }

        forkJoin([this.together(), this.detail(name)])
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                error: () => {
                    this.alert('Nội dung chưa được tải về.');
                },
                next: async (response: any) => {
                    const details = response[1];
                    this.handleLoadedArticle(details);
                },
                complete: () => {
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
                        this.detail(this.name).subscribe({
                            error: () => {
                                this.alert('Nội dung chưa được tải về.');
                            },
                            next: async (response: any) => {
                                this.handleLoadedArticle(response);
                            },
                            complete: () => {
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

    /**
     * Tự động quét và tải toàn bộ hình ảnh cục bộ (file://, base64) trong Dàn ý & Thumbnail lên CDN (cdn1.type.vn)
     */
    async ensureAllDoneImagesOnCDN(): Promise<{ replacements: { [oldUrl: string]: string }, topicThumb: string }> {
        const replacements: { [oldUrl: string]: string } = {};
        let topicThumb = '';
        let uploadCount = 0;

        // 1. Quét và tải Thumbnail chủ đề lên CDN trước
        const rawThumbVal = this.detectForm?.get('step1')?.get('thumbnail')?.value || '';
        if (rawThumbVal) {
            const lines = rawThumbVal.split('\n').map((l: string) => l.trim()).filter((l: string) => l);
            const updatedLines: string[] = [];

            for (let line of lines) {
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    updatedLines.push(line);
                    if (!topicThumb) topicThumb = line;
                    continue;
                }

                try {
                    let base64Data = '';
                    let ext = 'png';
                    let localPath = line.startsWith('file://') ? line.substring(7) : line;

                    if (line.startsWith('data:image/')) {
                        const parts = line.split(',');
                        base64Data = parts[1] || '';
                        if (line.includes('image/jpeg') || line.includes('image/jpg')) ext = 'jpg';
                    } else if ((window as any).electron && localPath) {
                        if (!localPath.startsWith('/') && !/^[a-zA-Z]:/.test(localPath)) {
                            localPath = '/' + localPath;
                        }
                        const readRes = await (window as any).electron.invoke('read-file-base64', { filePath: localPath });
                        if (readRes && readRes.success && readRes.base64) {
                            base64Data = readRes.base64;
                            if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) ext = 'jpg';
                        }
                    }

                    if (base64Data) {
                        const fileName = `nodebb_thumb_${Date.now()}.${ext}`;
                        const cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Data, fileName, 'thumbnails');
                        if (cdnUrl) {
                            updatedLines.push(cdnUrl);
                            replacements[line] = cdnUrl;
                            if (!topicThumb) topicThumb = cdnUrl;
                            uploadCount++;
                            console.log(`[NodeBB CDN] Đã chuyển thumbnail lên CDN: ${line} -> ${cdnUrl}`);
                        } else {
                            updatedLines.push(line);
                        }
                    } else {
                        updatedLines.push(line);
                    }
                } catch (e) {
                    console.warn('[NodeBB CDN] Lỗi upload thumbnail:', e);
                    updatedLines.push(line);
                }
            }

            if (updatedLines.length > 0) {
                this.detectForm.get('step1').get('thumbnail').setValue(updatedLines.join('\n'));
            }
        }

        // 2. Quét và tải toàn bộ ảnh trong Dàn ý (done) lên CDN
        if (this.done && Array.isArray(this.done)) {
            for (let i = 0; i < this.done.length; i++) {
                let block = this.done[i];
                if (typeof block !== 'string') continue;

                const imgMatches = Array.from(block.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi));
                for (const match of imgMatches) {
                    const rawSrc = match[1]?.trim();
                    if (!rawSrc) continue;

                    // Nếu đã là link HTTPS online
                    if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) {
                        if (!topicThumb) topicThumb = rawSrc;
                        continue;
                    }

                    // Nếu đã upload trước đó trong cùng phiên thì tái sử dụng
                    if (replacements[rawSrc]) {
                        this.done[i] = this.done[i].split(rawSrc).join(replacements[rawSrc]);
                        if (!topicThumb) topicThumb = replacements[rawSrc];
                        continue;
                    }

                    try {
                        let base64Data = '';
                        let ext = 'png';
                        let localPath = rawSrc.startsWith('file://') ? rawSrc.substring(7) : rawSrc;

                        if (rawSrc.startsWith('data:image/')) {
                            const parts = rawSrc.split(',');
                            base64Data = parts[1] || '';
                            if (rawSrc.includes('image/jpeg') || rawSrc.includes('image/jpg')) ext = 'jpg';
                        } else if ((window as any).electron && localPath) {
                            if (!localPath.startsWith('/') && !/^[a-zA-Z]:/.test(localPath)) {
                                localPath = '/' + localPath;
                            }
                            const readRes = await (window as any).electron.invoke('read-file-base64', { filePath: localPath });
                            if (readRes && readRes.success && readRes.base64) {
                                base64Data = readRes.base64;
                                if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) ext = 'jpg';
                            }
                        } else {
                            try {
                                const resp = await fetch(rawSrc.startsWith('file://') ? rawSrc : `file:///${localPath.replace(/^\//, '')}`);
                                const blob = await resp.blob();
                                base64Data = await new Promise<string>((res, rej) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                        const resStr = reader.result as string;
                                        res(resStr.split(',')[1] || '');
                                    };
                                    reader.onerror = rej;
                                    reader.readAsDataURL(blob);
                                });
                            } catch (fetchErr) {
                                console.warn('[CDN Upload] Không thể đọc blob từ ảnh local:', fetchErr);
                            }
                        }

                        if (base64Data) {
                            const fileName = `nodebb_cdn_${Date.now()}_${i}.${ext}`;
                            const cdnUrl = await this._genaiService.uploadBase64ToCdn(base64Data, fileName, 'thumbnails');
                            if (cdnUrl) {
                                replacements[rawSrc] = cdnUrl;
                                this.done[i] = this.done[i].split(rawSrc).join(cdnUrl);
                                if (!topicThumb) topicThumb = cdnUrl;
                                uploadCount++;
                                console.log(`[NodeBB CDN] Đã chuyển ảnh local lên CDN: ${rawSrc} -> ${cdnUrl}`);
                            }
                        }
                    } catch (imgErr) {
                        console.error('[NodeBB CDN] Lỗi upload ảnh lên CDN:', imgErr);
                    }
                }
            }
        }

        if (uploadCount > 0) {
            // Đồng bộ sang source.img
            if (this.source && Array.isArray(this.source.img)) {
                for (let s = 0; s < this.source.img.length; s++) {
                    if (typeof this.source.img[s] === 'string') {
                        for (const [oldUrl, newUrl] of Object.entries(replacements)) {
                            if (this.source.img[s].includes(oldUrl)) {
                                this.source.img[s] = this.source.img[s].split(oldUrl).join(newUrl);
                            }
                        }
                    }
                }
            }

            this.update(false);
            this.cd.markForCheck();
        }

        return { replacements, topicThumb };
    }

    /**
     * Đăng bài lên diễn đàn NodeBB với đầy đủ 4 tiêu chí:
     * 1. Danh mục diễn đàn đã được chọn
     * 2. Ảnh mô tả cho chủ đề (Topic Thumbnail) lấy từ Thumbnail hoặc ảnh đầu tiên
     * 3. Toàn bộ hình ảnh trong bài được tự động đẩy lên CDN
     * 4. Chuyển đổi nội dung sang Markdown chuẩn
     */
    async createTopic() {
        // Tiêu chí 1: Danh mục diễn đàn
        if (!this.favoriteSeason) {
            this.toastr.warning('Vui lòng chọn một Danh mục diễn đàn trước khi đăng bài!');
            return;
        }

        const title = this.detectForm?.get('step1')?.get('title')?.value?.trim();
        if (!title) {
            this.toastr.warning('Vui lòng nhập Tiêu đề bài viết trước khi đăng bài!');
            return;
        }

        if (!this.done || this.done.length === 0) {
            this.toastr.warning('Bài viết chưa có nội dung trong Dàn ý để đăng!');
            return;
        }

        this.loading = true;
        this.toastr.info('Đang xử lý hình ảnh lên CDN, ảnh mô tả chủ đề và chuẩn hóa định dạng Markdown...', 'Đang đăng bài');
        this.cd.markForCheck();

        try {
            // Tiêu chí 2 & 3: Xử lý hình ảnh trong bài lên CDN và lấy ảnh mô tả chủ đề (Topic Thumbnail)
            const { topicThumb } = await this.ensureAllDoneImagesOnCDN();

            // Tiêu chí 4: Chuyển đổi nội dung HTML sang Markdown chuẩn NodeBB
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                hr: '---'
            });

            // Tùy biến xử lý ảnh sang Markdown chuẩn
            turndownService.addRule('image', {
                filter: 'img',
                replacement: (content: string, node: any) => {
                    const alt = node.getAttribute('alt') || 'image';
                    const src = node.getAttribute('src') || '';
                    const titleAttr = node.getAttribute('title') || '';
                    const titlePart = titleAttr ? ` "${titleAttr}"` : '';
                    return src ? `\n\n![${alt}](${src}${titlePart})\n\n` : '';
                }
            });

            const fullHtml = this.done.join('\n\n');
            let markdownContent = turndownService.turndown(fullHtml);
            markdownContent = markdownContent.replace(/\n{3,}/g, '\n\n').trim();

            const tags = [];
            const mainKey = this.detectForm?.get('step5')?.get('mainkey')?.value?.trim();
            if (mainKey) {
                tags.push(mainKey);
            }

            // Tiến hành đăng bài lên NodeBB kèm ảnh mô tả chủ đề
            this._forumService
                .createTopic({
                    _uid: this.user.id,
                    cid: this.favoriteSeason,
                    title: title,
                    content: markdownContent,
                    thumb: topicThumb || '',
                    image: topicThumb || '',
                    thumbnail: topicThumb || '',
                    tags: tags,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        this.loading = false;
                        if (result && (result.success || result.topic || result.tid)) {
                            this.toastr.success('Đã đăng bài lên diễn đàn NodeBB thành công!');
                        } else {
                            this.toastr.error('Đăng bài lên diễn đàn thất bại. Vui lòng kiểm tra lại!');
                        }
                        this.cd.markForCheck();
                    },
                    error: (err) => {
                        this.loading = false;
                        console.error('[NodeBB Post Error]', err);
                        this.toastr.error('Có lỗi xảy ra khi kết nối tới diễn đàn NodeBB.');
                        this.cd.markForCheck();
                    },
                    complete: () => {
                        this.loading = false;
                        this.cd.markForCheck();
                    },
                });
        } catch (err) {
            this.loading = false;
            console.error('[NodeBB Process Error]', err);
            this.toastr.error('Lỗi khi xử lý hình ảnh hoặc định dạng Markdown.');
            this.cd.markForCheck();
        }
    }

    async share() {
        try {
            // 2. Load thư viện (Chỉ dùng bản dành cho client, không dùng jsdom/fs)
            const pdfMakeModule = await import('pdfmake/build/pdfmake');
            const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
            const pdfFonts = (pdfFontsModule as any).default || pdfFontsModule;
            const htmlToPdfmakeModule = await import('html-to-pdfmake');
            const htmlToPdfmake = ((htmlToPdfmakeModule as any).default || htmlToPdfmakeModule) as Function;

            // 3. Khởi tạo font (Đây là dòng hay lỗi nhất, viết thế này là chắc chắn nhất)
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            // Giả sử data của bạn là array các string HTML
            const contentArray = this.done; // Hoặc biến chứa array của bạn
            const fullHtml = contentArray.join('');
            const htmlConverted = htmlToPdfmake(fullHtml);

            const rawTitle = this.detectForm?.get('step1')?.get('title')?.value || this.uuid || 'Bài viết';
            const fileName = rawTitle.replace(/[/\\?%*:|"<>]/g, '-').trim();

            const docDefinition = {
                header: (currentPage: number, pageCount: number) => {
                    return {
                        columns: [
                            { text: rawTitle, alignment: 'left', fontSize: 9, color: '#666666' },
                            { text: 'Type.vn - Sáng tạo nội dung AI', alignment: 'right', fontSize: 9, color: '#666666' }
                        ],
                        margin: [40, 15, 40, 0]
                    };
                },
                footer: (currentPage: number, pageCount: number) => {
                    return {
                        columns: [
                            { text: `Xuất ngày: ${new Date().toLocaleDateString('vi-VN')}`, alignment: 'left', fontSize: 9, color: '#888888' },
                            { text: `Trang ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 9, color: '#888888' }
                        ],
                        margin: [40, 10, 40, 0]
                    };
                },
                pageMargins: [40, 45, 40, 45],
                content: [
                    htmlConverted
                ],
                defaultStyle: {
                    font: 'Roboto' // Đảm bảo dùng Roboto để hỗ trợ tiếng Việt
                }
            };

            pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
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
    async export() {
        console.log('--- EXPORT BUTTON CLICKED ---');
        console.log('source.wp_post_id:', this.source?.wp_post_id);
        console.log('source.wpPosts:', this.source?.wpPosts);
        
        let isUpdate = this.source && (this.source.wp_post_id || (this.source.wpPosts && this.source.wpPosts.length > 0));
        console.log('isUpdate evaluated to:', isUpdate);
        
        if (isUpdate) {
            // Check if post still exists on WordPress
            try {
                this.detectForm.disable();
                
                let checkDomain = (this.domain && this.domain.domain) ? this.domain.domain : this.source.wp_domain;
                let checkPostId = this.source.wp_post_id;
                let checkUsername = this.source.wp_username || this.user.name;
                let checkPassword = this.source.wp_password;
                
                if (!checkPostId && this.source.wpPosts && this.source.wpPosts.length > 0) {
                    checkDomain = this.source.wpPosts[0].wp_domain || this.source.wpPosts[0].domain;
                    checkPostId = this.source.wpPosts[0].wp_post_id || this.source.wpPosts[0].id;
                    checkUsername = this.source.wpPosts[0].wp_username || this.user.name;
                    checkPassword = this.source.wpPosts[0].wp_password;
                }
                
                console.log('--- START EXPORT API CHECK ---');
                console.log('Export check_post_exists targetDomain:', checkDomain, 'ID:', checkPostId);
                const wpPostsResponse = await firstValueFrom(
                    this._wordpressService.check_post_exists(
                        checkDomain, 
                        checkPostId, 
                        checkUsername, 
                        checkPassword
                    )
                );
                
                if (!wpPostsResponse || !wpPostsResponse.id) {
                    // Deleted on WP!
                    isUpdate = false;
                    this.source.wp_post_id = null;
                    if (this.source.wpPosts) this.source.wpPosts = [];
                    this.update(false); // save local
                    this.toastr.warning('Bài viết này đã bị xoá trên WordPress. Tự động chuyển sang đăng mới!');
                }
            } catch (e: any) {
                console.error('Check post error:', e);
                if (e && e.status === 0) {
                     this.toastr.warning('Không thể kiểm tra API trực tiếp do bị chặn CORS. Vẫn tiếp tục mở Cập nhật.');
                }
            } finally {
                this.detectForm.enable();
            }
        }

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
                    this.update(false, false); // Lưu lại WP ID vào CSDL ngay, không cần sync Wp trùng lặp
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
         const targetUsername = this.user?.name || this.name || 'admin';
         this._crawlService
             .collections({
                 username: targetUsername,
                 page: { size: 100 },
                 includeUuid: true
             })
             .pipe(takeUntil(this._unsubscribeAll))
             .subscribe({
                 next: async (result) => {
                     if (result && result.success) {
                         this.collections = result.data || [];
                         this.loadArticlesInCollection();
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
         const targetUsername = this.user?.name || this.name || 'admin';
         this._crawlService
             .nodeInCollection({
                 uuid: this.uuid,
                 username: targetUsername,
             })
             .pipe(takeUntil(this._unsubscribeAll))
             .subscribe({
                 next: async (result) => {
                     if (result && result.success) {
                         this.selectedCollections = result.data || [];
                         this.loadArticlesInCollection();
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

     loadArticlesInCollection() {
         if (!this.selectedCollections || this.selectedCollections.length === 0) return;

         let uuids: string[] = [];
         this.selectedCollections.forEach((col: any) => {
             const fullCol = (this.collections && this.collections.length > 0)
                 ? this.collections.find((c: any) => c._id === col._id || c.id === col.id)
                 : null;
             const targetCol = fullCol || col;

             if (Array.isArray(targetCol.uuid)) {
                 uuids = uuids.concat(targetCol.uuid);
             } else if (targetCol.uuid) {
                 uuids.push(targetCol.uuid);
             }
         });

         // Loại bỏ trùng lặp nếu có
         uuids = Array.from(new Set(uuids.filter(Boolean)));

         if (uuids.length === 0) return;

         const targetUsername = this.user?.name || this.name || 'admin';
         this._crawlService.archive({
             username: targetUsername,
             keyword: '',
             uuids: uuids,
             page: { pageNumber: 0, size: 200 }
         }).pipe(takeUntil(this._unsubscribeAll)).subscribe((res: any) => {
             const docsList = res?.data?.docs || res?.articles || (Array.isArray(res?.data) ? res.data : null);
             if (docsList && docsList.length > 0) {
                 const uuidSet = new Set(uuids);
                 const matchedDocs = docsList.filter((doc: any) => doc && doc.uuid && uuidSet.has(doc.uuid));
                 this.articlesInCollection = matchedDocs.length > 0 ? matchedDocs : docsList;
                 this.selectedArticleInCollection = this.uuid;
                 this.cd.detectChanges();
             }
         });
     }

    goToArticle(event: any) {
        let articleUuid = event?.uuid || event;
        if (!articleUuid || articleUuid === this.uuid) return;
        const article = this.articlesInCollection ? this.articlesInCollection.find(a => a.uuid === articleUuid) : null;
        const targetUsername = article?.username || this.user?.name || this.name;
        if (targetUsername) {
            this.router.navigate(['/ai-writer', targetUsername, articleUuid]);
        }
    }

    openGenerateImageDialog(targetItem: any = null) {
        this.currentParagraphItem = targetItem;
        this.customImagePrompt = '';
        this.referenceImageBase64 = null;

        this.generateImageDialogRef = this.dialog.open(this.generateImageDialog, {
            width: '600px',
            panelClass: 'custom-dialog-bulk',
            disableClose: false
        });
    }

    onReferenceImageSelected(event: any) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.referenceImageBase64 = e.target.result;
                this.cd.markForCheck();
            };
            reader.readAsDataURL(file);
        }
    }

    confirmGenerateImage() {
        if (this.generateImageDialogRef) {
            this.generateImageDialogRef.close();
        }
        if (this.currentParagraphItem) {
            this.generateImageFromParagraph(this.currentParagraphItem);
        } else {
            this.generateImageFromOutline();
        }
    }

    openRefreshOutlineDialog() {
        this.customRefreshOutlinePrompt = '';
        this.referenceOutlineImageBase64 = null;

        this.refreshOutlineDialogRef = this.dialog.open(this.refreshOutlineDialog, {
            width: '600px',
            panelClass: 'custom-dialog-bulk',
            disableClose: false
        });
    }

    onReferenceOutlineImageSelected(event: any) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.referenceOutlineImageBase64 = e.target.result;
                this.cd.markForCheck();
            };
            reader.readAsDataURL(file);
        }
    }

    async confirmRefreshOutline() {
        if (this.refreshOutlineDialogRef) {
            this.refreshOutlineDialogRef.close();
        }
        await this.regenerateOutlineWithAI();
    }

    async regenerateOutlineWithAI() {
        this.isRefreshingOutline = true;
        this.rightSelectedIndex = 0;
        if (this._fuseLoadingService) {
            this._fuseLoadingService.show();
        }
        this.toastr.info('AI Agent đang tiến hành làm mới lại dàn ý...', 'Đang xử lý');
        this.cd.markForCheck();

        try {
            const title = this.detectForm.get('step1')?.get('title')?.value || '';
            const description = this.detectForm.get('step1')?.get('description')?.value || '';
            
            let outlineContent = '';
            if (this.done && this.done.length > 0) {
                outlineContent = this.done.map(item => typeof item === 'string' ? this.removeHTML.transform(item) : JSON.stringify(item)).join('\n');
            }

            let promptText = `YÊU CẦU: Hãy làm mới lại kết quả dàn ý (Outline) cho bài viết dựa trên các thông tin sau:\n`;
            if (title) promptText += `- Tiêu đề: ${title}\n`;
            if (description) promptText += `- Mô tả: ${description}\n`;
            if (outlineContent) promptText += `- Dàn ý hiện tại:\n${outlineContent}\n`;
            
            if (this.customRefreshOutlinePrompt && this.customRefreshOutlinePrompt.trim()) {
                promptText += `- YÊU CẦU TÙY CHỈNH CỦA NGUỜI DÙNG: ${this.customRefreshOutlinePrompt.trim()}\n`;
            }

            const styleGuide = this.style ? ` Blog mang phong cách của ${this.style.name} (${this.style.desc || ''}).` : '';
            promptText += styleGuide + `\nTrình bày câu trả lời của bạn dưới định dạng JSON với key là "contents", value là một mảng các đoạn văn HTML (<p>...</p>) làm dàn ý chi tiết. Không sử dụng mảng lồng nhau.`;

            let parts: any[] = [];
            if (this.referenceOutlineImageBase64) {
                const base64Data = this.referenceOutlineImageBase64.split(',')[1];
                let mimeType = 'image/png';
                if (this.referenceOutlineImageBase64.startsWith('data:image/jpeg')) mimeType = 'image/jpeg';
                else if (this.referenceOutlineImageBase64.startsWith('data:image/webp')) mimeType = 'image/webp';
                
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }

            parts.unshift({ text: promptText });

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: parts }],
            });

            const jsonText = response.text;
            if (jsonText) {
                try {
                    let cleanedJson = jsonText.trim();
                    const markdownMatch = cleanedJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (markdownMatch) {
                        cleanedJson = markdownMatch[1].trim();
                    }
                    const data = JSON.parse(cleanedJson);
                    if (data.contents && Array.isArray(data.contents) && data.contents.length > 0) {
                        this.done = data.contents.map((text: string) => {
                            const cleanText = this.sanitizeAIText(text);
                            return cleanText.startsWith('<p>') ? cleanText : `<p id="outline-p-${uuid.v4()}">${cleanText}</p>`;
                        });
                    } else if (Array.isArray(data)) {
                        this.done = data.map((text: string) => `<p id="outline-p-${uuid.v4()}">${this.sanitizeAIText(text)}</p>`);
                    } else {
                        this.done = [`<p id="outline-p-${uuid.v4()}">${this.sanitizeAIText(jsonText)}</p>`];
                    }
                } catch(e) {
                    this.done = [`<p id="outline-p-${uuid.v4()}">${this.sanitizeAIText(jsonText)}</p>`];
                }

                // Cập nhật lại SEO score
                this.seo = this.seoScore.transform({
                    done: this.done,
                    title: this.detectForm.get('step1')?.get('title')?.value,
                    description: this.detectForm.get('step1')?.get('description')?.value,
                    mainkey: this.detectForm.get('step5')?.get('mainkey')?.value,
                });

                if (this.uuid) {
                    const newVersionIso = (new Date()).toISOString();
                    this.version_value = newVersionIso;
                    this.time = new Date();
                    this.new_version = -2; // Tạo mới version để bảo lưu bản cũ và tạo phiên bản khác của Dàn ý
                    localStorage.version_value = this.version_value;
                    this.toastr.success('Đã tạo phiên bản dàn ý mới và lưu trữ thành công!');
                    this.update(true);
                } else {
                    this.toastr.success('Đã làm mới lại dàn ý thành công!');
                }
            }
        } catch (err) {
            console.error('Lỗi khi làm mới dàn ý:', err);
            this.toastr.error('Có lỗi xảy ra khi làm mới dàn ý. Vui lòng thử lại.');
        } finally {
            this.isRefreshingOutline = false;
            if (this._fuseLoadingService) {
                this._fuseLoadingService.hide();
            }
            this.cd.markForCheck();
        }
    }

    async generateNextChapterInCollection() {
        if (!this.selectedCollections || this.selectedCollections.length === 0) {
            this.toastr.warning('Vui lòng chọn bộ bài viết (Collection) trước.');
            return;
        }

        let uuids: string[] = [];
        this.selectedCollections.forEach((col: any) => {
            const fullCol = this.collections.find((c: any) => c._id === col._id || c.id === col.id);
            const targetCol = fullCol || col;
            if (Array.isArray(targetCol.uuid)) {
                uuids = uuids.concat(targetCol.uuid);
            } else if (targetCol.uuid) {
                uuids.push(targetCol.uuid);
            }
        });

        uuids = Array.from(new Set(uuids));

        if (uuids.length === 0) {
            this.toastr.warning('Không tìm thấy bài viết nào trong Collection này.');
            return;
        }

        this.isGeneratingNextChapter = true;
        this.cd.detectChanges();

        try {
            // Truy vấn CHI TIẾT từng bài viết qua API /crawl/node/archive/:uuid để lấy 100% dữ liệu data.done
            const detailPromises = uuids.map(uuid => 
                firstValueFrom(this._crawlService.detail({ uuid: uuid, username: this.user?.name || this.name })).catch(() => null)
            );

            const detailResults: any[] = await Promise.all(detailPromises);
            const fullDocs = detailResults
                .filter(res => res && res.data)
                .map(res => res.data);

            if (!fullDocs || fullDocs.length === 0) {
                this.toastr.warning('Không lấy được dữ liệu chi tiết các bài viết trước trong CSDL.');
                this.isGeneratingNextChapter = false;
                this.cd.detectChanges();
                return;
            }

            const previousSummary = fullDocs.map((art: any, idx: number) => {
                const title = art.title || `Phần ${idx + 1}`;
                const desc = art.seo?.description?.text || art.description ? `Mô tả: ${art.seo?.description?.text || art.description}` : '';
                
                // Trích xuất Toàn bộ Nội dung từ mảng data.done (truy vấn trực tiếp từ API /crawl/node/archive/:uuid)
                let contentFromDone = '';
                if (art.done) {
                    if (Array.isArray(art.done)) {
                        contentFromDone = art.done
                            .map((paragraph: any) => typeof paragraph === 'string' ? paragraph.replace(/<[^>]*>?/gm, '').trim() : '')
                            .filter((text: string) => text.length > 0)
                            .join('\n\n');
                    } else if (typeof art.done === 'string') {
                        contentFromDone = art.done.replace(/<[^>]*>?/gm, '').trim();
                    }
                }

                // Nếu chưa có done, trích xuất thêm từ source.prompt hoặc source.pre
                if (!contentFromDone && art.source) {
                    if (art.source.prompt && Array.isArray(art.source.prompt)) {
                        contentFromDone = art.source.prompt
                            .map((item: any) => typeof item === 'string' ? item.replace(/<[^>]*>?/gm, '').trim() : '')
                            .filter((text: string) => text.length > 0)
                            .join('\n\n');
                    } else if (art.source.pre && Array.isArray(art.source.pre)) {
                        contentFromDone = art.source.pre
                            .map((item: any) => typeof item === 'string' ? item.replace(/<[^>]*>?/gm, '').trim() : '')
                            .filter((text: string) => text.length > 0)
                            .join('\n\n');
                    }
                }

                if (contentFromDone.length > 4000) {
                    contentFromDone = contentFromDone.substring(0, 4000) + '... [còn tiếp]';
                }

                return `========================================
[CHƯƠNG ${idx + 1} / PHẦN ${idx + 1}]
Tiêu đề: ${title}
${desc ? desc + '\n' : ''}Nội dung chi tiết (Dữ liệu data.done truy vấn từ /crawl/node/archive/${art.uuid}):
${contentFromDone || '(Chưa có văn bản trong done)'}
========================================`;
            }).join('\n\n');

            const activeStyle = this.style || (fullDocs[0]?.source?.style) || (fullDocs[0]?.style);
            const styleName = typeof activeStyle === 'string' ? activeStyle : (activeStyle?.name || 'Nhà văn / tác giả tiểu thuyết chuyên nghiệp');
            const styleDesc = typeof activeStyle === 'object' && activeStyle?.desc ? ` (${activeStyle.desc})` : '';

            let prompt = `Bạn là một tác giả / chuyên gia sáng tạo nội dung theo phong cách "${styleName}"${styleDesc}.
Dưới đây là TOÀN BỘ CÁC CHƯƠNG/PHẦN ĐÃ VIẾT TRƯỚC ĐÓ trong cùng bộ tiểu thuyết (Collection) được TRUY VẤN TRỰC TIẾP TỪ CSDL (dữ liệu trường 'done'):

${previousSummary}
Dựa vào TOÀN BỘ NỘI DUNG & TÌNH TIẾT CỦA CÁC CHƯƠNG TRƯỚC Ở TRÊN, hãy sáng tạo và lập kịch bản nối tiếp cho PHẦN TIẾP THEO (Chương tiếp theo/Phần nối tiếp) chuẩn theo phong cách "${styleName}".

YÊU CẦU QUAN TRỌNG:
1. TIÊU ĐỀ: Tên tiêu đề bài viết/chương tiếp theo.
2. MÔ TẢ: Mô tả tổng quan chi tiết mạch truyện của chương mới này.
3. CÁC PROMPT GỢI Ý CHI TIẾT (prompts):
   - Đưa ra 4 đến 6 đoạn Prompt gợi ý miêu tả thật CHI TIẾT, ĐẦY ĐỦ, GIÀU HÌNH ẢNH về hành động nhân vật, bối cảnh, mâu thuẫn và diễn biến tâm lý của từng phân cảnh trong chương này, thể hiện rõ nét phong cách "${styleName}".
   - KHÔNG ĐÁNH SỐ THỨ TỰ (TUYỆT ĐỐI KHÔNG ghi "1. ", "2. ", "3. " ở đầu các câu prompt).

Trả về kết quả bằng định dạng JSON duy nhất như sau:
{
    "title": "Tên tiêu đề bài viết/chương tiếp theo (Ví dụ: Chương I: Phần II: ...)",
    "description": "Mô tả chi tiết nội dung và diễn biến chính của chương mới này",
    "prompts": [
        "Mô tả chi tiết phân cảnh 1: nhân vật làm gì, bối cảnh ra sao, cảm xúc và hành động cụ thể...",
        "Mô tả chi tiết phân cảnh 2: biến cố tiếp theo diễn ra như thế nào, chi tiết hình ảnh kịch tính...",
        "Mô tả chi tiết phân cảnh 3: cuộc chạm trán hoặc cao trào của phân đoạn...",
        "Mô tả chi tiết phân cảnh 4: kết thúc phân đoạn với nút thắt mở ra diễn biến mới..."
    ]
}
Chỉ trả về JSON thuần túy, bắt đầu từ '{' và kết thúc bằng '}', không bọc trong markdown block.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const rawText = response.text || '';
            let cleanJson = rawText.trim();
            if (cleanJson.includes('{') && cleanJson.includes('}')) {
                cleanJson = cleanJson.substring(cleanJson.indexOf('{'), cleanJson.lastIndexOf('}') + 1);
            }

            const data = JSON.parse(cleanJson);

            if (data && data.title) {
                const newTitle = data.title;
                const newDescription = data.description || '';
                const rawList = Array.isArray(data.prompts) ? data.prompts : (Array.isArray(data.outline) ? data.outline : []);
                
                // Làm sạch các số thứ tự ở đầu dòng nếu có ("1. ", "2. ", "1/ ")
                const promptList = rawList.map((item: string) => {
                    return item.replace(/^\d+[\.\/]\s*/, '').trim();
                }).filter((item: string) => item.length > 0);

                // Build source object for new article (bỏ dany trùng lặp, lưu style vào source.style)
                let newSource: any = {
                    description: newDescription,
                    pre: [],
                    prompt: promptList.map((item: string) => `<p id="source-prompt-${uuid.v4()}">${item}</p>`),
                    style: this.style || this.source?.style || ''
                };

                const newSeo: any = {
                    title: newTitle,
                    description: newDescription,
                };

                const newUuid = uuid.v4();
                const newSlug = this.slugifyPipe.transform(newTitle);

                let isEncryptedChapter = false;
                if (this.articlePassword || (this.details && this.details.is_encrypted)) {
                    if (this.articlePassword) {
                        isEncryptedChapter = true;
                        const encryptedObj = this.encryptPayload(newSource, [], [], this.articlePassword, {
                            title: newTitle,
                            url: newSlug,
                            description: newDescription,
                            seo: newSeo,
                            arr_keyword: []
                        });
                        newSource = encryptedObj.source;
                    }
                }

                const newArchiveData: any = {
                    uuid: newUuid,
                    title: newTitle,
                    url: newSlug,
                    source: newSource,
                    done: isEncryptedChapter ? ['<p>[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU CÁ NHÂN]</p>'] : [],
                    trash: [],
                    seo: newSeo,
                    arr_keyword: [],
                    domain: this.domain,
                    style: this.style || this.source?.style || '',
                    username: this.user?.name || this.name,
                    thumbnail: '',
                    confirm: false,
                    is_encrypted: isEncryptedChapter
                };

                const saveRes: any = await firstValueFrom(this._crawlService.storeArchive(newArchiveData));
                if (saveRes && saveRes.success) {
                    // Gắn bài viết mới vào Collection hiện tại
                    const colPromises = this.selectedCollections.map((col: any) => {
                        const targetId = col._id || col.id;
                        if (targetId) {
                            return firstValueFrom(this._crawlService.storeCollection({
                                _id: targetId,
                                uuid: newUuid,
                                username: this.user?.name || this.name
                            })).catch(() => null);
                        }
                        return Promise.resolve(null);
                    });

                    await Promise.all(colPromises);

                    this.toastr.success(`Đã tạo phần tiếp theo: "${newTitle}" thành công!`);
                    
                    // Chuyển hướng sang bài viết mới vừa tạo
                    this.router.navigate(['/ai-writer', this.user?.name || this.name, newUuid]);
                } else {
                    this.toastr.error('Không thể tạo bài viết mới trong CSDL.');
                }
            } else {
                this.toastr.error('AI không thể tạo cấu trúc bài viết mới.');
            }
        } catch (err: any) {
            console.error('Error generating next chapter:', err);
            this.toastr.error('Có lỗi xảy ra khi tạo phần tiếp theo bằng AI.');
        } finally {
            this.isGeneratingNextChapter = false;
            this.cd.detectChanges();
        }
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
        // Tính năng tự lưu bị tắt theo yêu cầu của người dùng, chuyển sang lưu thủ công bằng Ctrl + S
        if (this.name === this.user.name) {
            clearInterval(this.intervalAutoSave);
        }
    }

    /**
     * Tự động gắn dữ liệu dưới local nếu ko tìm thấy details
     */
    setDefault() {
        // Nếu bài viết đã nạp từ server thành công và đã có nội dung (hoặc đã mở khóa), không dùng cache local để đè lên
        if (this.details && (this.details.done?.length > 0 || this.details.source?.backup?.length > 0)) {
            return;
        }

        let editor: any = this.multiAccountService.getItem('editor');

        if (editor) {
            try {
                if (typeof editor === 'string') {
                    editor = JSON.parse(editor);
                }
            } catch (e) {
                console.error('Lỗi khi parse editor data:', e);
                editor = null;
            }

            if (
                editor && 
                editor.title &&
                editor.done && editor.done.length > 0 &&
                editor.uuid === this.uuid
            ) {
                this.setdata(editor);
            } else {
                this.multiAccountService.removeItem('editor');
            }
        }
    }

    /**
     * Lưu bài dướii local
     */
    storelocal() {
        this.multiAccountService.setItem(
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
                this.multiAccountService.removeItem('editor');

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
        if (editor.domain) {
            if (typeof editor.domain === 'string' && this.domains) {
                const cleanEditor = (editor.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
                let found = this.domains.find(d => (d.domain || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] === cleanEditor);
                if (found) {
                    this.domain = found;
                    this.multiAccountService.setItem('domain', this.domain);
                }
            } else if (typeof editor.domain === 'object') {
                this.domain = editor.domain;
                this.multiAccountService.setItem('domain', this.domain);
            }
        }

        const savedStyle = editor.source?.style || editor.style;
        if (savedStyle) {
            this.hasCustomSavedStyle = true;
            const styleName = typeof savedStyle === 'string' ? savedStyle : (savedStyle.name || savedStyle._id);
            if (this.styles && this.styles.length > 0) {
                let foundStyle = this.styles.find(s => s.name === styleName || s._id === styleName);
                this.style = foundStyle || (typeof savedStyle === 'object' ? savedStyle : { name: styleName });
            } else {
                this.style = typeof savedStyle === 'object' ? savedStyle : { name: styleName };
            }
            localStorage.setItem('style', JSON.stringify(this.style));
        } else if (this.domain && !this.hasCustomSavedStyle) {
            this.applyDomainStyle(this.domain);
        }
        // kiểm tra nếu used là -1 có nghĩa là nó được convert từ node sang
        // như vậy phải update lần đầu tiên cho nó ngay
        if (editor.used === -1) {
            this.generateID(editor.source, () => {
                this.confirm();
            });
        } else {
            // cài đặt ban đầu
            const defaultSource = {
                p: [], span: [], li: [], i: [], dd: [], td: [], label: [],
                h1: [], h2: [], h3: [], h4: [], h5: [], a: [], table: [],
                img: [], audios: [], source: [], iframe: [], pre: [],
                prompt: [], word: [], chatgpt: [], text: [], empty: [],
                backup: {}, playlist: [{ youtube: [], tiktok: [], facebook: [] }, { mp3: [] }]
            };

            const targetSource = (editor.source && typeof editor.source === 'object') ? editor.source : (this.source || {});
            this.source = { ...defaultSource, ...targetSource };

            // Đảm bảo tất cả các mảng bắt buộc luôn tồn tại dưới dạng mảng
            ['p', 'span', 'li', 'i', 'dd', 'td', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'a', 'table', 'img', 'audios', 'source', 'iframe', 'pre', 'prompt', 'word', 'chatgpt', 'text', 'empty'].forEach(key => {
                if (!Array.isArray(this.source[key])) {
                    this.source[key] = [];
                }
            });

            if (this.source.audios && Array.isArray(this.source.audios)) {
                this.source.audios = this.source.audios.map((item: any) => {
                    if (typeof item === 'string' && item.includes('<audio')) {
                        const srcMatch = item.match(/src=["']([^"']+)["']/);
                        if (srcMatch && srcMatch[1]) {
                            return `<p class="audio-player-wrapper my-2" data-audio-url="${srcMatch[1]}"><audio controls preload="none" src="${srcMatch[1]}" class="w-full h-9 rounded-lg !border-none !outline-none !shadow-none !bg-transparent"></audio></p>`;
                        }
                    }
                    return item;
                });
            }

            if (this.source.done && Array.isArray(this.source.done)) {
                this.source.done = this.source.done.map((item: any) => {
                    if (typeof item === 'string' && item.includes('<audio')) {
                        const srcMatch = item.match(/src=["']([^"']+)["']/);
                        if (srcMatch && srcMatch[1]) {
                            return `<p class="audio-player-wrapper my-2" data-audio-url="${srcMatch[1]}"><audio controls preload="none" src="${srcMatch[1]}" class="w-full h-9 rounded-lg !border-none !outline-none !shadow-none !bg-transparent"></audio></p>`;
                        }
                    }
                    return item;
                });
            }

            if (!this.source.playlist || !Array.isArray(this.source.playlist) || this.source.playlist.length === 0 || !this.source.playlist[0]) {
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
            } else {
                if (!this.source.playlist[0].youtube) this.source.playlist[0].youtube = [];
                if (!this.source.playlist[0].tiktok) this.source.playlist[0].tiktok = [];
                if (!this.source.playlist[0].facebook) this.source.playlist[0].facebook = [];
                if (!this.source.playlist[1]) {
                    this.source.playlist[1] = { mp3: [] };
                } else if (!this.source.playlist[1].mp3) {
                    this.source.playlist[1].mp3 = [];
                }
            }

            // bật tự động lưu
            if (this.settings.autosave) {
                this.autoSave();
            }
        }

        const isLocked = (editor.is_encrypted || (editor.source && editor.source.encrypted)) && !this.articlePassword && (!editor.done || editor.done.length === 0 || (editor.done.length === 1 && typeof editor.done[0] === 'string' && editor.done[0].includes('MÃ HÓA')));
        if (isLocked) {
            this.source.img = [];
            this.source.prompt = [];
            this.source.backup = ['[NỘI DUNG MÃ HÓA AES-256]'];
            this.done = ['<p>[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU CÁ NHÂN]</p>'];
            this.detectForm.get('step1').get('thumbnail').setValue('');
            this.detectForm.get('step1').get('description').setValue('');
            return;
        }

        let rawDone = (editor.done && editor.done.length > 0 && !(editor.done.length === 1 && typeof editor.done[0] === 'string' && editor.done[0].includes('MÃ HÓA')))
            ? editor.done
            : ((editor.source && editor.source.backup && editor.source.backup.length > 0 && !(editor.source.backup.length === 1 && typeof editor.source.backup[0] === 'string' && editor.source.backup[0].includes('MÃ HÓA')))
                ? editor.source.backup
                : ((editor.source && editor.source.done && editor.source.done.length > 0 && !(editor.source.done.length === 1 && typeof editor.source.done[0] === 'string' && editor.source.done[0].includes('MÃ HÓA')))
                    ? editor.source.done
                    : ((this.done && this.done.length > 0 && !(this.done.length === 1 && typeof this.done[0] === 'string' && this.done[0].includes('MÃ HÓA')))
                        ? this.done
                        : ((this.source && this.source.backup && this.source.backup.length > 0 && !(this.source.backup.length === 1 && typeof this.source.backup[0] === 'string' && this.source.backup[0].includes('MÃ HÓA')))
                            ? this.source.backup
                            : this.done))));

        if (this.source && this.source.backup) {
            this.source.backup = this.splitIntoParagraphs(this.source.backup);
        }

        this.done = this.formatDoneParagraphs(rawDone);
        if (this.source) {
            this.source.done = this.done;
        }
        if (this.details) {
            this.details.done = this.done;
            if (this.details.source) {
                this.details.source.done = this.done;
            }
        }
        this.trash = Array.isArray(editor.trash) ? [...editor.trash] : [];
        this.seo = (editor.seo && typeof editor.seo === 'object' && editor.seo.title) ? editor.seo : (editor.source?.seo || this.seo || {});
        this.arr_keyword = Array.isArray(editor.arr_keyword)
            ? [...editor.arr_keyword]
            : (Array.isArray(editor.source?.arr_keyword) ? [...editor.source.arr_keyword] : []);

        const titleVal = editor.title || editor.source?.title || '';
        if (titleVal) {
            this.detectForm.get('step1').get('title').setValue(titleVal);
        }

        const urlVal = editor.url || editor.source?.url || '';
        if (urlVal) {
            this.detectForm.get('step2').get('url').setValue(urlVal);
        }

        let thumbVal = editor.thumbnail || editor.source?.thumbnail || '';
        if (!thumbVal && editor.source?.img && Array.isArray(editor.source.img) && editor.source.img.length > 0) {
            const firstImg = editor.source.img[0];
            if (typeof firstImg === 'string') {
                const match = firstImg.match(/src=["']([^"']+)["']/);
                thumbVal = match && match[1] ? match[1] : firstImg;
            }
        }

        if (thumbVal) {
            this.detectForm.get('step1').get('thumbnail').setValue(thumbVal);

            if (!this.source.img) {
                this.source.img = [];
            }
            const thumbnails = thumbVal.split('\n').filter((p: string) => p.trim() !== '');
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

        let descVal = editor.description || editor.source?.description || '';
        if (!descVal && this.seo?.description?.text) {
            descVal = this.seo.description.text;
        }
        if (!descVal && editor.source?.prompt && Array.isArray(editor.source.prompt) && editor.source.prompt.length > 0) {
            descVal = editor.source.prompt.map((p: any) => typeof p === 'string' ? p.replace(/<[^>]*>/g, '') : p).join('\n');
        }
        if (descVal) {
            this.detectForm.get('step1').get('description').setValue(descVal);
            if (!this.source.prompt || this.source.prompt.length === 0) {
                this.source.prompt = [`<p id="source-prompt-${uuid.v4()}">${descVal}</p>`];
            }
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

        // Tự động kiểm tra và đẩy các ảnh local/file:// chưa lên CDN
        setTimeout(() => {
            this.autoUploadLocalImagesToCDN();
        }, 800);

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
                                'absolute -left-2 -top-2 bg-yellow-100 opacity-100 border border-yellow-200 cursor-pointer flex w-6 h-6 text-sm justify-center items-center text-center rounded-full',
                            )
                            .attr('data-id', k);
                    }
                }
            }
        }, 1000);
    }

    changetab(e: any) {
        if (e && e.index !== undefined) {
            this.selectedIndex = e.index;
        }
        this.showComments();
    }

    changeRightTab(e: any) {
        if (e && e.index !== undefined) {
            this.rightSelectedIndex = e.index;
        }
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
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = comment.comment.content || '';
                    const plainText = tempDiv.textContent || tempDiv.innerText || '';
                    this.clipboard.copy(plainText.trim());
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
    hasScriptData(): boolean {
        if (!this.uuid) return false;
        if (this.details && this.details.has_script) return true;
        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_script_data_${this.uuid}`) || !!this.multiAccountService.getItem(`ai_type_script_merger_data_${this.uuid}`);
        }
        return false;
    }

    hasVideoData(): boolean {
        if (!this.uuid) return false;
        if (this.details && this.details.has_video) return true;
        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_audio_merger_data_${this.uuid}`);
        }
        return false;
    }

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
        private location: Location,
        private _bottomSheet: MatBottomSheet,
        private multiAccountService: MultiAccountService,
        private sanitizer: DomSanitizer,
        private _genaiService: GenaiService,
        public _wordpressService: WordpressService,
        public globalAgentService: GlobalAgentService,
        private _fuseLoadingService: FuseLoadingService
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

        this.route.queryParams.subscribe((params: Params) => {
            if (params['tab']) {
                this.selectedIndex = parseInt(params['tab'], 10);
            }
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

        if (typeof window !== 'undefined' && (window as any).electron) {
            const electronApi = (window as any).electron;
            if (electronApi.onDownloadSingleVideoProgress) {
                electronApi.onDownloadSingleVideoProgress((data: any) => {
                    if (data && this.downloadingItemIndex !== null && this.downloadingItemIndex !== undefined) {
                        this.downloadItemPercent[this.downloadingItemIndex] = data.percent || 0;
                        this.cd.detectChanges();
                    }
                });
            }
        }

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

        this.updateAgentContext();
    }

    updateAgentContext() {
        this.globalAgentService.updateContext({
            sourcePage: 'Văn Bản (AI Writer)',
            action: 'EDIT_ARTICLE',
            data: {
                title: this.detectForm?.get('step1.title')?.value || '',
                documentCount: this.done?.length || 0,
            }
        });
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
                    let cleanOld = oldB64Key.trim();
                    let cleanOld2 = cleanOld.startsWith('file://') ? cleanOld.substring('file://'.length) : cleanOld;
                    let cleanNew = b64Key.trim();

                    if (this.source && this.source.img) {
                        for (let i = 0; i < this.source.img.length; i++) {
                            if (typeof this.source.img[i] === 'string') {
                                const match = this.source.img[i].match(/src=["']([^"']+)["']/);
                                if (match && match[1]) {
                                    const imgSrc = match[1].trim();
                                    let cleanImgSrc = imgSrc.startsWith('file://') ? imgSrc.substring('file://'.length) : imgSrc;
                                    if (cleanImgSrc === cleanOld || cleanImgSrc === cleanOld2 || imgSrc === cleanOld || imgSrc === cleanOld2) {
                                        this.source.img[i] = this.source.img[i].replace(/src="[^"]+"/, `src="${cleanNew}"`).replace(/src='[^']+'/, `src='${cleanNew}'`);
                                    }
                                }
                            }
                        }
                    }
                    if (this.done) {
                        for (let i = 0; i < this.done.length; i++) {
                            if (typeof this.done[i] === 'string') {
                                this.done[i] = this.done[i].split(oldB64Key).join(b64Key);
                                this.done[i] = this.done[i].split('file://' + oldB64Key).join(b64Key);
                                if (oldB64Key.startsWith('file://')) {
                                    this.done[i] = this.done[i].split(oldB64Key.substring('file://'.length)).join(b64Key);
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
        this.articlePassword = '';
        if (this.uuid) {
            sessionStorage.removeItem('nav_handshake_pwd_' + this.uuid);
            sessionStorage.removeItem('unlocked_pwd_' + this.uuid);
        }
        this.globalAgentService.clearContext();
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

    @HostListener('document:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.storelocal();
            this.update(false);
            this.toastr.success('Đã lưu tài liệu thành công!');
        }
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
