import {
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';

import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { YoutubeService } from 'app/_services/youtube';
import { ToastrService } from 'ngx-toastr';
import { LogService } from 'app/_services/link';

import { GenaiService } from 'app/genai.service';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'scanvideolinkform',
    templateUrl: './scan.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [YoutubeService, LogService],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class ScanVideoLinkFormComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    isLinear = false;
    @ViewChild('stepper') stepper: any;

    options: string[] = ['One', 'Two', 'Three'];

    quality = 'medium';
    mode = 'sequential';
    channel = 'https://www.youtube.com/@vothuatcanchien';
    tiktoker = '';
    channels = [];
    items = [];
    videos = [];
    links: any[] = [];

    public selected: any[] = [];
    hostname: any;
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    private unsubscribeRes: () => void;

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return row.title !== 'Ethel Price';
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

    /**
     * lấy tất cả link facebook
     */
    getLinks() {
        this._logService
            .fetch({
                username: this.user.name,
                keyword: 'youtube.com',
                page: {
                    pageNumber: 0,
                    size: 100,
                    totalElements: 0,
                    totalPages: 0,
                },
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
                        this.channel =
                            this.links[0]?.link || 'https://youtube.com';
                    }
                },
                error: () => {
                    this.toastr.warning(`Không tải dữ liệu về.`);
                },
                complete: () => {},
            });
    }

    start() {
        if (this.channel && !this.tiktoker) {
            this._youtubeService
                .channelid(this.channel)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (channelid) => {
                        if (channelid) {
                            this.items = []; // clear dữ liệu
                            this.crawling(channelid, null);
                        } else {
                            this.toastr.warning(`Không tìm thấy kênh.`);
                        }
                    },
                    error: (e: any) => {
                        this.toastr.warning(`Lỗi quét dữ liệu.`);
                    },
                    complete: () => {},
                });
        } else if (this.tiktoker) {
            // this._youtubeService.tiktokCrawler(this.tiktoker)
            //     .pipe(takeUntil(this._unsubscribeAll))
            //     .subscribe({
            //         next: (data) => {
            //             this.getLinksTiktoker();
            //         },
            //         error: (e: any) => {
            //             this.toastr.warning(`Lỗi quét dữ liệu.`);
            //         },
            //         complete: () => { }
            //     });

            // GỌI ELECTRON CRAWL TIKTOK
            this.items = []; // Xóa danh sách cũ trước khi bắt đầu quét mới
            this.toastr.info(
                'Vui lòng giải Captcha nếu có để bắt đầu tự động cuộn.',
            );

            (window as any).electron.tools({
                command: 'tiktok-crawl',
                tiktoker: this.tiktoker,
                uniqueID: Date.now().toString(),
            });
        } else {
            this.toastr.warning(`Không có kênh nào để quét.`);
        }
    }

    updateTable(videos: any[]) {
        const newBatch = videos.map((v) => ({
            id: { kind: 'tiktoker', videoId: v.url },
            snippet: {
                title: v.title,
                thumbnails: { high: { url: v.thumbnail } },
            },
            url: v.url,
        }));
        console.log('newBatch:', newBatch);
        this.items = [...this.items, ...newBatch];
        this.cd.detectChanges();
    }

    crawling(channelid: string, pageToken: string) {
        this._youtubeService
            .crawler(channelid, 50, pageToken)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (links) => {
                    if (links && links.items.length > 0) {
                        this.items = this.items.concat(links.items);
                        this.stepper.selectedIndex = 1;

                        if (links.nextPageToken) {
                            this.toastr.success(`Tiếp tục quét.`);
                            this.crawling(channelid, links.nextPageToken);
                        } else {
                            this.selected = [];
                            this.toastr.success(`Quét dữ liệu xong.`);
                        }
                    } else {
                        this.toastr.warning(`Không tìm thấy video.`);
                    }
                },
                error: (e: any) => {
                    this.toastr.warning(`Lỗi quét dữ liệu.`);
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    getLinksTiktoker() {
        this._youtubeService
            .getLinksTiktoker(this.tiktoker)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (links) => {
                    if (links && links.results && links.results.length > 0) {
                        this.items = [];

                        links.results.map((item: any) => {
                            this.items.push({
                                id: {
                                    kind: 'tiktoker',
                                    videoId: item.url,
                                    playlistId: '',
                                },
                                snippet: {
                                    title: item.video,
                                    thumbnails: {
                                        high: {
                                            url: `file://${item.thumbnail}`,
                                        },
                                    },
                                },
                                url: item.url,
                            });
                        });
                    }

                    this.stepper.selectedIndex = 1;
                    this.toastr.success(`Quét dữ liệu xong.`);

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
                error: (e: any) => {
                    this.toastr.warning(`Lỗi quét dữ liệu.`);
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    share() {
        this.videos = [];

        Promise.all(
            this.selected.map((item) => {
                switch (item.id.kind) {
                    case 'youtube#video':
                        this.videos.push(item.id.videoId);
                        break;
                    default:
                        break;
                }
            }),
        );

        this._youtubeService
            .youtube2Archive({
                username: this.user.name,
                content: {
                    playlist: [
                        {
                            youtube: this.videos,
                        },
                    ],
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
                error: (e: any) => {},
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    listing(item: any) {
        console.log('item', item);
    }

    singleDownload(item: any) {
        this.videos = [];
        switch (item.id.kind) {
            case 'youtube#video':
                this.videos.push(
                    `https://www.youtube.com/watch?v=${item.id.videoId}`,
                );
                break;
            case 'youtube#playlist':
                this.videos.push(
                    `https://www.youtube.com/playlist?list=${item.id.playlistId}`,
                );
                break;
            case 'tiktoker':
                this.videos.push(`${item.id.videoId}`);
                break;
            default:
                break;
        }

        this._youtubeService
            .download({
                URLS: this.videos,
                quality: this.quality,
                username: this.user.name,
                subtitle: false,
                thumbnail: false,
                mode: this.mode,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (results) => {
                    if (results && results.success) {
                        this.toastr.success(`Tải video thành công!`);
                    } else {
                        this.toastr.warning(`Không tải được video này.`);
                    }
                },
                error: (e: any) => {
                    this.toastr.warning(`Không tải được video này.`);
                },
                complete: () => {},
            });
    }

    async createPost(row: any) {
        // let settings = this.multiAccountService.getItem('settings');

        // const ai = new GoogleGenAI({ apiKey: settings['secretKey'] });
        const response = await this._genaiService.generateContent({
            model: 'gemini-3.6-flash',
            contents: [
                { role: 'user', parts: [{ text: 'Why is the sky blue?' }] },
            ],
        });
    }

    download() {
        this.videos = [];
        Promise.all(
            this.selected.map((item) => {
                // let channelTitle = item.snippet.channelTitle;
                switch (item.id.kind) {
                    case 'youtube#video':
                        this.videos.push(
                            `https://www.youtube.com/watch?v=${item.id.videoId}`,
                        );
                        break;
                    case 'youtube#playlist':
                        this.videos.push(
                            `https://www.youtube.com/playlist?list=${item.id.playlistId}`,
                        );
                        break;
                    case 'tiktoker':
                        this.videos.push(`${item.id.videoId}`);
                        break;
                    default:
                        break;
                }
            }),
        );

        if (this.videos.length > 0) {
            this._youtubeService
                .download({
                    URLS: this.videos,
                    quality: this.quality,
                    username: this.user.name,
                    subtitle: true,
                    thumbnail: true,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (results) => {
                        if (results && results.success) {
                            this.toastr.success(`Tải video thành công!`);
                        } else {
                            this.toastr.warning(`Không tải được video này.`);
                        }
                    },
                    error: (e: any) => {
                        this.toastr.warning(`Không tải được video này.`);
                    },
                    complete: () => {},
                });
        }
    }

    /**
     * Constructor
     */
    constructor(
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private _logService: LogService,
        private _youtubeService: YoutubeService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService,
    ) {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                this.getLinks();
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    ngOnInit(): void {
        if ((window as any).electron) {
            // Lắng nghe tất cả response từ Electron
            (window as any).electron.onToolsResponse((data: any) => {
                console.log(
                    '--- DEBUG: Dữ liệu từ Electron nhận được: ---',
                    data,
                ); // THÊM DÒNG NÀY

                if (data.action === 'tiktok-crawl-stream') {
                    this.updateTable(data.videos);
                }
                if (data.action === 'tiktok-crawl-finished') {
                    this.toastr.success('Hoàn tất quét!');
                }
            });

            // Lắng nghe log để xem tiến trình cuộn
            (window as any).electron.onToolsLog((msg: string) => {
                console.log('[Electron Log]:', msg);
            });
        }
    }

    ngOnDestroy(): void {
        if (this.unsubscribeRes) this.unsubscribeRes();

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
