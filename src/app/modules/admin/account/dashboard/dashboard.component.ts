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
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Lấy toàn bộ collection
     */
    collection() {
        this._crawlService
            .collections({
                username: this.user.name,
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
