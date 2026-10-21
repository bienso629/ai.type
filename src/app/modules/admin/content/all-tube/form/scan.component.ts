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

    isDownloading: boolean = false;
    downloadPercent: number = 0;
    downloadStatus: string = '';
    downloadProgressMap: {
        [url: string]: {
            isDownloading: boolean;
            percent: number;
            status: string;
            done?: boolean;
            error?: boolean;
        };
    } = {};

    getRowUrl(item: any): string {
        if (!item) return '';
        switch (item.id?.kind) {
            case 'youtube#video':
                return `https://www.youtube.com/watch?v=${item.id.videoId}`;
            case 'youtube#playlist':
                return `https://www.youtube.com/playlist?list=${item.id.playlistId}`;
            case 'tiktoker':
                return `${item.id.videoId}`;
            default:
                if (item.url) {
                    return item.url;
                } else if (item.id?.videoId) {
                    return `https://www.youtube.com/watch?v=${item.id.videoId}`;
                }
                return '';
        }
    }

    getRowProgress(item: any) {
        const url = this.getRowUrl(item);
        return url ? this.downloadProgressMap[url] : null;
    }

    private unsubscribeRes: () => void;
    private _unsubscribeDownloadProgress: any = null;

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

    private _triggerYtDlpDownload(urls: string[]) {
        if (!urls || urls.length === 0) {
            this.toastr.warning('Không có đường dẫn video hợp lệ để tải!');
            return;
        }

        if ((window as any).electron) {
            const pendingUrls = urls.filter((u) => !this.downloadProgressMap[u]?.isDownloading);
            if (pendingUrls.length === 0) {
                this.toastr.info('Video này đang được tải rồi!');
                return;
            }
            urls = pendingUrls;
            this.isDownloading = true;
            this.downloadPercent = 0;
            this.downloadStatus = 'Đang bắt đầu tải...';
            urls.forEach((u) => {
                this.downloadProgressMap[u] = {
                    isDownloading: true,
                    percent: 0,
                    status: 'Đang chờ...',
                    done: false,
                    error: false,
                };
            });
            this.toastr.info('Đang bắt đầu tải video...');
            this.cd.detectChanges();

            const settingsStr = localStorage.getItem('settings');
            let customCookies = '';
            if (settingsStr) {
                try {
                    customCookies = JSON.parse(settingsStr).customCookies || '';
                } catch (e) {}
            }

            (window as any).electron
                .invoke('download-video', {
                    urls: urls,
                    customCookies: customCookies,
                    source: 'scan',
                })
                .then((result: any) => {
                    this.isDownloading = false;
                    if (result && result.success) {
                        this.downloadPercent = 100;
                        this.downloadStatus = 'Tải video thành công!';
                        urls.forEach((u) => {
                            this.downloadProgressMap[u] = {
                                isDownloading: false,
                                percent: 100,
                                status: 'Đã tải',
                                done: true,
                                error: false,
                            };
                        });
                        this.toastr.success('Tải video về thành công!');
                    } else {
                        this.downloadStatus = 'Tải thất bại!';
                        urls.forEach((u) => {
                            if (this.downloadProgressMap[u] && !this.downloadProgressMap[u].done) {
                                this.downloadProgressMap[u] = {
                                    isDownloading: false,
                                    percent: 0,
                                    status: 'Lỗi tải',
                                    done: false,
                                    error: true,
                                };
                            }
                        });
                        this.toastr.warning(
                            'Tải video thất bại: ' +
                                (result?.error || 'Unknown error'),
                        );
                    }
                    this.cd.detectChanges();
                })
                .catch((e: any) => {
                    this.isDownloading = false;
                    this.downloadStatus = 'Lỗi tải video!';
                    urls.forEach((u) => {
                        if (this.downloadProgressMap[u] && !this.downloadProgressMap[u].done) {
                            this.downloadProgressMap[u] = {
                                isDownloading: false,
                                percent: 0,
                                status: 'Lỗi tải',
                                done: false,
                                error: true,
                            };
                        }
                    });
                    this.toastr.error('Có lỗi xảy ra: ' + e);
                    this.cd.detectChanges();
                });
        } else {
            this.toastr.warning('Vui lòng chạy trên app Desktop để tải video!');
        }
    }

    singleDownload(item: any) {
        const url = this.getRowUrl(item);
        this.videos = url ? [url] : [];
        this._triggerYtDlpDownload(this.videos);
    }

    async createPost(row: any) {
        const response = await this._genaiService.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
                { role: 'user', parts: [{ text: 'Why is the sky blue?' }] },
            ],
        });
    }

    download() {
        this.videos = [];
        this.selected.forEach((item) => {
            const url = this.getRowUrl(item);
            if (url) {
                this.videos.push(url);
            }
        });

        if (this.videos.length > 0) {
            this._triggerYtDlpDownload(this.videos);
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
            const electronApi = (window as any).electron;
            // Lắng nghe tất cả response từ Electron
            electronApi.onToolsResponse((data: any) => {
                console.log(
                    '--- DEBUG: Dữ liệu từ Electron nhận được: ---',
                    data,
                );

                if (data.action === 'tiktok-crawl-stream') {
                    this.updateTable(data.videos);
                }
                if (data.action === 'tiktok-crawl-finished') {
                    this.toastr.success('Hoàn tất quét!');
                }
            });

            // Lắng nghe log để xem tiến trình cuộn
            electronApi.onToolsLog((msg: string) => {
                console.log('[Electron Log]:', msg);
            });

            if (electronApi.onDownloadVideoProgress) {
                this._unsubscribeDownloadProgress =
                    electronApi.onDownloadVideoProgress((data: any) => {
                        if (data && data.source === 'scan') {
                            this.downloadPercent =
                                data.percent !== undefined
                                    ? data.percent
                                    : this.downloadPercent;
                            this.downloadStatus =
                                data.status || this.downloadStatus;
                            if (data.url) {
                                const isDone = data.percent >= 100 && (data.status || '').startsWith('Tải xong');
                                this.downloadProgressMap[data.url] = {
                                    isDownloading: !isDone,
                                    percent: data.percent || 0,
                                    status: isDone ? 'Đã tải' : `${data.percent || 0}%`,
                                    done: isDone,
                                    error: false,
                                };
                            }
                            if (data.percent < 100) {
                                this.isDownloading = true;
                            }
                            this.cd.detectChanges();
                        }
                    });
            }
        }
    }

    ngOnDestroy(): void {
        if (this.unsubscribeRes) this.unsubscribeRes();
        if (this._unsubscribeDownloadProgress) {
            this._unsubscribeDownloadProgress();
            this._unsubscribeDownloadProgress = null;
        }

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
