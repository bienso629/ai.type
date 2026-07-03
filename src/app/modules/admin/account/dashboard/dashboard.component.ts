import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { UserClientService } from 'app/modules/_services/user';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { CrawlService } from 'app/modules/_services/crawl';
import { Subject, takeUntil } from 'rxjs';
import { TranslocoService } from '@ngneat/transloco';

@Component({
    selector: 'dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    providers: [UserClientService, CrawlService],
    encapsulation: ViewEncapsulation.None
})
export class DashboardComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    collections: any[] = [];
    videoProjects: any[] = [];
    totalVideoProjects: number = 0;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Lấy toàn bộ collection
     */
    collection() {
        this._crawlService
            .collections({
                username: this.user.name,
                page: { size: 100 },
                includeUuid: true
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.collections = result.data.map((col: any) => {
                            let uuids = Array.isArray(col.uuid) ? col.uuid : (col.uuid ? [col.uuid] : []);
                            col.count = uuids.length;
                            return col;
                        });
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    // lấy account về để đồng bộ
    account() {
        this._userClientService.profile({
            name: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        if (result.data.styles && result.data.styles.length > 0) this.multiAccountService.setItem('styles', result.data.styles);
                        if (result.data.editor) this.multiAccountService.setItem('editor', result.data.editor);
                        if (result.data.following_users) this.multiAccountService.setItem('following_users', result.data.following_users);
                        if (result.data.settings) this.multiAccountService.setItem('settings', result.data.settings);
                    }
                },
                error: () => { },
                complete: () => { }
            });
    }

    /**
     * Lấy statistic
     */
    statistic() {
        this._crawlService
            .statistics({
                username: this.user.name
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        localStorage.setItem('statistics', JSON.stringify(result.data));
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService,
        private _crawlService: CrawlService,
        private translocoService: TranslocoService
    ) {
        this.titleService.setTitle(this.translocoService.translate('nav.dashboard.title'));

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

                if (user.reputation < 0) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }

                // đồng bộ account về máy
                this.account();

                this.collection();
                this.statistic();
                
                // Get video projects being built
                setTimeout(() => {
                    let projects = this.multiAccountService.getItemsByPrefix('ai_type_audio_merger_data_') || [];
                    const allProjects = projects.filter(p => p.uuid && p.title).reverse().map(p => {
                        // Calculate dynamic status
                        let statusLabel = 'app.draft';
                        let statusClass = 'bg-blue-100 text-blue-600';
                        
                        if (!p.clips || p.clips.length === 0) {
                            statusLabel = 'app.empty';
                            statusClass = 'bg-gray-100 text-gray-600';
                        } else {
                            const hasAudio = p.clips.some((c: any) => c.localFilePath || c.audioFileName);
                            const allAudio = p.clips.every((c: any) => c.localFilePath || c.audioFileName);
                            
                            if (allAudio) {
                                statusLabel = 'app.ready';
                                statusClass = 'bg-green-100 text-green-600';
                            } else if (hasAudio) {
                                statusLabel = 'app.working';
                                statusClass = 'bg-amber-100 text-amber-600';
                            }
                        }
                        
                        return { ...p, statusLabel, statusClass };
                    });
                    this.totalVideoProjects = allProjects.length;
                    this.videoProjects = allProjects.slice(0, 12);
                }, 500); // wait a bit to ensure multiAccountService has loaded if needed
            });
    }

    ngOnInit(): void {
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: this.translocoService.translate('app.notification'),
            message: (message) ? message : this.translocoService.translate('app.request_not_found'),
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: this.translocoService.translate('app.close'),
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: this.translocoService.translate('app.close_again')
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }

    deleteVideoProject(project: any, event: MouseEvent) {
        event.stopPropagation();
        
        const dialogRef = this._fuseConfirmationService.open({
            title: this.translocoService.translate('app.delete_video_script'),
            message: `${this.translocoService.translate('app.are_you_sure_delete_script')} "<b>${project.title || this.translocoService.translate('app.new_project')}</b>"?<br>${this.translocoService.translate('app.action_cannot_be_undone_delete_all')}`,
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'warn'
            },
            actions: {
                confirm: {
                    show: true,
                    label: this.translocoService.translate('app.delete'),
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: this.translocoService.translate('app.cancel')
                }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                // Xóa localStorage
                this.multiAccountService.removeItem(`ai_type_audio_merger_data_${project.uuid}`);
                this.multiAccountService.removeItem(`ai_type_video_ready_data_${project.uuid}`);
                this.multiAccountService.removeItem(`casting_list_${project.uuid}`);
                
                // Cập nhật mảng trên UI
                this.videoProjects = this.videoProjects.filter(p => p.uuid !== project.uuid);
                this.totalVideoProjects--;
                
                // Xóa file trên đĩa qua Electron IPC
                if ((window as any).electron) {
                    try {
                        await (window as any).electron.invoke('delete-project', {
                            targetUuid: project.uuid,
                            username: this.user.name
                        });
                    } catch (e) {
                        console.error('Lỗi khi xóa file đĩa:', e);
                    }
                }
            }
        });
    }
}
