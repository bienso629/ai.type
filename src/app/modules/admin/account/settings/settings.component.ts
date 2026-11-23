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
import { ToastrService } from 'ngx-toastr';

import { FuseNavigationService, FuseVerticalNavigationComponent } from '@fuse/components/navigation';

@Component({
    selector: 'settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SettingsComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;
    isCompact: boolean = (localStorage.getItem('settings_is_compact') === 'true');

    @ViewChild('drawer') drawer: MatDrawer;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;
    private readonly _pluginsPanel = {
        id: 'plugins',
        icon: 'feather:grid',
        title: 'Plugins',
        description: 'Tiện ích mở rộng'
    };
    private _requestedTab: string | null = null;
    private _userLoaded: boolean = false;

    panels: any[] = [
        {
            id: 'account',
            icon: 'feather:user',
            title: 'app.account',
            description: 'app.personal_settings'
        },
        {
            id: 'domain',
            icon: 'feather:globe',
            title: 'app.domain',
            description: 'app.connect_your_website'
        },
        {
            id: 'style',
            icon: 'feather:coffee',
            title: 'app.style',
            description: 'app.create_writing_style'
        },
        {
            id: 'font',
            icon: 'feather:type',
            title: 'Font chữ',
            description: 'Font chữ ứng dụng'
        },
        {
            id: 'active',
            icon: 'feather:calendar',
            title: 'app.renewal',
            description: 'app.maintain_operation'
        },
        {
            id: 'affiliate',
            icon: 'feather:shopping-bag',
            title: 'Affiliate',
            description: 'Tiếp thị liên kết'
        },
    ];

    selectedPanel: string = 'account';
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    get canUsePlugins(): boolean {
        return this._userService.canAccessPlugins(this.user);
    }

    private _syncRestrictedPanels(user: User | null | undefined): void {
        const allowPlugins = this._userService.canAccessPlugins(user);
        const pluginsIdx = this.panels.findIndex(p => p.id === 'plugins');
        if (allowPlugins && pluginsIdx === -1) {
            const styleIdx = this.panels.findIndex(p => p.id === 'style');
            const insertAt = styleIdx >= 0 ? styleIdx + 1 : 3;
            this.panels.splice(insertAt, 0, this._pluginsPanel);
        } else if (!allowPlugins && pluginsIdx !== -1) {
            this.panels.splice(pluginsIdx, 1);
        }

        const allowAdmin = !!(user && user.reputation >= 100000000 && user.name === 'admin');
        const adminIdx = this.panels.findIndex(p => p.id === 'admin');
        if (allowAdmin && adminIdx === -1) {
            this.panels.push({
                id: 'admin',
                icon: 'feather:unlock',
                title: 'app.admin',
                description: 'app.private_management'
            });
        } else if (!allowAdmin && adminIdx !== -1) {
            this.panels.splice(adminIdx, 1);
        }

        if (this._requestedTab === 'plugins') {
            if (allowPlugins) {
                this.selectedPanel = 'plugins';
            } else {
                this._rejectPluginsAccess();
            }
        } else if (this.selectedPanel === 'plugins' && !allowPlugins) {
            this._rejectPluginsAccess();
        }
    }

    private _rejectPluginsAccess(): void {
        this.selectedPanel = 'account';
        this._requestedTab = 'account';
        this._toastr.warning('Chỉ tài khoản thuộc nhóm "nhóm-x-cms" mới được phép sử dụng Plugins.');
        this.router.navigate([], {
            relativeTo: this.activatedRoute,
            queryParams: { tab: 'account' },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Navigate to the panel
     *
     * @param panel
     */
    goToPanel(panel: string): void {
        if (panel === 'plugins' && !this.canUsePlugins) {
            this._rejectPluginsAccess();
            this._changeDetectorRef.markForCheck();
            return;
        }
        this.selectedPanel = panel;
        this._requestedTab = panel;
        this._changeDetectorRef.markForCheck();

        this.router.navigate([], {
            relativeTo: this.activatedRoute,
            queryParams: { tab: panel },
            queryParamsHandling: 'merge'
        });

        // Close the drawer on 'over' mode
        if (this.drawerMode === 'over') {
            this.drawer.close();
        }
    }

    toggleCompact(): void {
        this.isCompact = !this.isCompact;
        try {
            localStorage.setItem('settings_is_compact', String(this.isCompact));
        } catch (e) {}
        this.drawerOpened = true;
        this._changeDetectorRef.markForCheck();
        setTimeout(() => {
            if (this.drawer && (this.drawer as any).container) {
                (this.drawer as any).container.updateContentMargins();
            }
            window.dispatchEvent(new Event('resize'));
        }, 50);
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
        private _fuseMediaWatcherService: FuseMediaWatcherService,
        private _fuseNavigationService: FuseNavigationService,
        private _toastr: ToastrService
    ) {
        this.activatedRoute.queryParams
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((params: Params) => {
                if (params && params.tab) {
                    this._requestedTab = params.tab;
                    if (params.tab === 'plugins') {
                        if (this._userLoaded) {
                            if (this.canUsePlugins) {
                                this.selectedPanel = 'plugins';
                            } else {
                                this._rejectPluginsAccess();
                            }
                        }
                    } else {
                        this.selectedPanel = params.tab;
                    }
                    this._changeDetectorRef.markForCheck();
                }
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
                this._changeDetectorRef.markForCheck();
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this._userLoaded = true;
                this._syncRestrictedPanels(user);
                this._changeDetectorRef.markForCheck();
            });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        this.drawerMode = 'side';
        this.drawerOpened = true;
        // Subscribe to media changes
        this._fuseMediaWatcherService.onMediaChange$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ matchingAliases }) => {
                this.drawerMode = 'side';
                this.drawerOpened = true;
                if (matchingAliases.includes('lg')) {
                    this.isCompact = false;
                }
                else {
                    this.isCompact = true;
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
