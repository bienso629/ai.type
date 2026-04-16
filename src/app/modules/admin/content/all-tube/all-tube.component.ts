import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { YoutubeService } from 'app/modules/_services/youtube';
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

    cbCreatePost: boolean = false;
    strLinks: string = '';

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    async download() {
        const value = this.strLinks;
        const urlRegex = /(((https?:\/\/)|(www\.))[^\s]+)/g;
        const urls = value.match(urlRegex);

        if (this.cbCreatePost) {
            this._youtubeService.video2Post({
                urls: urls,
                username: this.user.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (data) => {
                        if (data && data.results && data.results.length > 0) {
                            const requests = data.results.map((item: any) => this.transcriptDetails(item.transcript_id, true));
                            const transcripts = await Promise.all(requests);
                            transcripts.forEach(transcript => {
                                if (transcript) {
                                    console.log('transcript', transcript);
                                }
                            });
                        }
                    },
                    error: (e: any) => {
                        this.toastr.warning('Tải video thất bại.');
                    },
                    complete: () => { }
                });
        } else {
            if ((window as any).electron) {
                this.toastr.info('Đang bắt đầu tải video...');
                (window as any).electron.invoke('download-video', {
                    urls: urls
                }).then((result: any) => {
                    if (result && result.success) {
                        this.toastr.success('Tải video về thành công!');
                    } else {
                        this.toastr.warning('Tải video thất bại: ' + (result?.error || 'Unknown error'));
                    }
                }).catch((e: any) => {
                    this.toastr.error('Có lỗi xảy ra: ' + e);
                });
            } else {
                this.toastr.warning('Vui lòng chạy trên app Desktop để tải video!');
            }
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

                if (user.reputation < 2000) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }
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
