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
                        this.collections = result.data;
                        // Calculate real usage and max updated date for each collection
                        let allUuids = new Set<string>();
                        for (let col of this.collections) {
                            // Default values
                            col.totalUsed = 0;
                            col.lastItemUpdatedAt = col.updatedAt;
                            
                            let uuids = Array.isArray(col.uuid) ? col.uuid : (col.uuid ? [col.uuid] : []);
                            uuids.forEach(u => allUuids.add(u));
                        }

                        if (allUuids.size > 0) {
                            this._crawlService.archive({
                                username: this.user.name,
                                keyword: '',
                                uuids: Array.from(allUuids),
                                page: { size: 10000, pageNumber: 0 },
                                bookmark: null
                            }).subscribe((res: any) => {
                                if (res && res.data && res.data.docs) {
                                    const allDocs = res.data.docs;
                                    
                                    for (let col of this.collections) {
                                        let uuids = Array.isArray(col.uuid) ? col.uuid : (col.uuid ? [col.uuid] : []);
                                        if (uuids.length === 0) continue;
                                        
                                        let totalUsed = 0;
                                        let maxTime = new Date(col.updatedAt).getTime();
                                        let maxDate = col.updatedAt;
                                        
                                        const colDocs = allDocs.filter((doc: any) => uuids.includes(doc.uuid) || uuids.includes(doc._id));
                                        
                                        colDocs.forEach((doc: any) => {
                                            if (doc.used && doc.used > 0) {
                                                totalUsed += doc.used;
                                            }
                                            if (doc.updatedAt) {
                                                const docTime = new Date(doc.updatedAt).getTime();
                                                if (docTime > maxTime) {
                                                    maxTime = docTime;
                                                    maxDate = doc.updatedAt;
                                                }
                                            }
                                        });
                                        
                                        col.totalUsed = totalUsed;
                                        col.lastItemUpdatedAt = maxDate;
                                    }
                                    
                                    // Trigger change detection implicitly if needed or let Angular handle it
                                }
                            });
                        }
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
        private _crawlService: CrawlService
    ) {
        this.titleService.setTitle(`thống kê | ai.type - công cụ tạo content`);

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
                    this.videoProjects = projects.filter(p => p.uuid && p.title).map(p => {
                        // Calculate dynamic status
                        let statusLabel = 'Bản nháp';
                        let statusClass = 'bg-blue-100 text-blue-600';
                        
                        if (!p.clips || p.clips.length === 0) {
                            statusLabel = 'Trống';
                            statusClass = 'bg-gray-100 text-gray-600';
                        } else {
                            const hasAudio = p.clips.some((c: any) => c.localFilePath || c.audioFileName);
                            const allAudio = p.clips.every((c: any) => c.localFilePath || c.audioFileName);
                            
                            if (allAudio) {
                                statusLabel = 'Sẵn sàng';
                                statusClass = 'bg-green-100 text-green-600';
                            } else if (hasAudio) {
                                statusLabel = 'Đang làm';
                                statusClass = 'bg-amber-100 text-amber-600';
                            }
                        }
                        
                        return { ...p, statusLabel, statusClass };
                    });
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
