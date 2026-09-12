import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { YoutubeService } from 'app/_services/youtube';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'alltube',
    templateUrl: './all-tube.component.html',
    providers: [YoutubeService],
    encapsulation: ViewEncapsulation.None
})
export class AllTubeComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    downloadJsonHref: any;
    quality = 'medium';

    strLinks: string = '';
    isDownloading: boolean = false;
    downloadPercent: number = 0;
    downloadStatus: string = '';
    downloadSpeed: string = '';
    downloadEta: string = '';

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    async download() {
        const value = this.strLinks;
        const urlRegex = /(((https?:\/\/)|(www\.))[^\s]+)/g;
        const urls = value ? value.match(urlRegex) : null;

        if (!urls || urls.length === 0) {
            this.toastr.warning('Vui lòng nhập ít nhất một đường dẫn video hợp lệ!');
            return;
        }

        if ((window as any).electron) {
            this.isDownloading = true;
            this.downloadPercent = 0;
            this.downloadStatus = 'Đang bắt đầu tải...';
            this.downloadSpeed = '';
            this.downloadEta = '';
            this.toastr.info('Đang bắt đầu tải video...');
            this._changeDetectorRef.detectChanges();

            const settingsStr = localStorage.getItem('settings');
            let customCookies = '';
            if (settingsStr) {
                try {
                    customCookies = JSON.parse(settingsStr).customCookies || '';
                } catch (e) {}
            }
            (window as any).electron.invoke('download-video', {
                urls: urls,
                customCookies: customCookies
            }).then((result: any) => {
                this.isDownloading = false;
                if (result && result.success) {
                    this.downloadPercent = 100;
                    this.downloadStatus = 'Tải video thành công!';
                    this.toastr.success('Tải video về thành công!');
                } else {
                    this.downloadStatus = 'Tải thất bại!';
                    this.toastr.warning('Tải video thất bại: ' + (result?.error || 'Unknown error'));
                }
                this._changeDetectorRef.detectChanges();
            }).catch((e: any) => {
                this.isDownloading = false;
                this.downloadStatus = 'Lỗi tải video!';
                this.toastr.error('Có lỗi xảy ra: ' + e);
                this._changeDetectorRef.detectChanges();
            });
        } else {
            this.toastr.warning('Vui lòng chạy trên app Desktop để tải video!');
        }
    }

    transcriptDetails(transcript_id: string, include_snapshots?: boolean) {
        return this._youtubeService.transcriptDetails({
            transcript_id: transcript_id,
            include_snapshots: include_snapshots
        });
    }

    convertTranscript2Post(transcript: any) {
        console.log('transcript', transcript);
    }

    private _unsubscribeDownloadProgress: any = null;

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private toastr: ToastrService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _youtubeService: YoutubeService,
        private _changeDetectorRef: ChangeDetectorRef,
    ) {
        this.titleService.setTitle(`tải toàn bộ kênh youtube | ai.type - công cụ tạo content`);
    }

    ngOnInit(): void {
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

        // Lắng nghe tiến trình tải video từ Electron
        if (typeof window !== 'undefined' && (window as any).electron) {
            const electronApi = (window as any).electron;
            if (electronApi.onDownloadVideoProgress) {
                this._unsubscribeDownloadProgress = electronApi.onDownloadVideoProgress((data: any) => {
                    if (data) {
                        this.downloadPercent = data.percent !== undefined ? data.percent : this.downloadPercent;
                        this.downloadStatus = data.status || this.downloadStatus;
                        this.downloadSpeed = data.speed || '';
                        this.downloadEta = data.eta || '';
                        if (data.percent < 100) {
                            this.isDownloading = true;
                        }
                        this._changeDetectorRef.detectChanges();
                    }
                });
            }
        }
    }

    ngOnDestroy(): void {
        if (this._unsubscribeDownloadProgress) {
            this._unsubscribeDownloadProgress();
            this._unsubscribeDownloadProgress = null;
        }
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
            this.router.navigate(['/tools']);
        });
    }
}
