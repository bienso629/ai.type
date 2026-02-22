import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { MatDrawer } from '@angular/material/sidenav';
import { Subject, takeUntil } from 'rxjs';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { UserService } from 'app/core/user/user.service';
import { AppConfig } from 'app/core/config/app.config';
import { User } from 'app/core/user/user.types';

@Component({
    selector: 'settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;

    @ViewChild('drawer') drawer: MatDrawer;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;
    panels: any[] = [
        {
            id: 'account',
            icon: 'feather:user',
            title: 'Tài khoản',
            description: 'Cài đặt cá nhân'
        },
        {
            id: 'domain',
            icon: 'feather:globe',
            title: 'Tên miền',
            description: 'Kết nối Website có sẵn'
        },
        {
            id: 'style',
            icon: 'feather:coffee',
            title: 'Phong cách',
            description: 'Tạo phong cách viết'
        },
        {
            id: 'active',
            icon: 'feather:calendar',
            title: 'Gia hạn',
            description: 'Duy trì hoạt động'
        },
        // {
        //     id: 'money',
        //     icon: 'feather:credit-card',
        //     title: 'Nạp tiền vào ví',
        //     description: 'Tài khoản chính'
        // }
        // {
        //     id: 'team',
        //     icon: 'feather:users',
        //     title: 'Đội ngũ',
        //     description: 'Cùng mọi người viết bài'
        // }
    ];

    selectedPanel: string = 'account';
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Navigate to the panel
     *
     * @param panel
     */
    goToPanel(panel: string): void {
        this.selectedPanel = panel;

        // Close the drawer on 'over' mode
        if (this.drawerMode === 'over') {
            this.drawer.close();
        }
    }

    /**
     * Get the details of the panel
     *
     * @param id
     */
    getPanelInfo(id: string): any {
        return this.panels.find(panel => panel.id === id);
    }

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    /**
     * Constructor
     */
    constructor(
        private _userService: UserService,
        private _changeDetectorRef: ChangeDetectorRef,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private activatedRoute: ActivatedRoute,
        private router: Router,
        private _fuseMediaWatcherService: FuseMediaWatcherService
    ) {
        this.activatedRoute.queryParams.subscribe((params: Params) => {
            if (params && params.tab) {
                this.goToPanel(params.tab);
            }
        });

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
                } else if (user.reputation >= 100000000) {
                    this.panels.push({
                        id: 'admin',
                        icon: 'feather:unlock',
                        title: 'Admin',
                        description: 'Quản lý riêng'
                    });
                }
            });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Subscribe to media changes
        this._fuseMediaWatcherService.onMediaChange$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ matchingAliases }) => {
                // Set the drawerMode and drawerOpened
                if (matchingAliases.includes('lg')) {
                    this.drawerMode = 'side';
                    this.drawerOpened = true;
                }
                else {
                    this.drawerMode = 'over';
                    this.drawerOpened = false;
                }

                // Mark for check
                this._changeDetectorRef.markForCheck();
            });
    }

    /**
     * On destroy
     */
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
