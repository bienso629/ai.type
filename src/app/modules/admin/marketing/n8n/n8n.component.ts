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
import { RemoveHTMLPipe } from "app/app.pipe";
import { CrawlService } from 'app/_services/crawl';
import { FuseNavigationService, FuseVerticalNavigationComponent } from '@fuse/components/navigation';

import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'n8n',
    templateUrl: './n8n.component.html',
    styleUrls: ['./n8n.component.scss'],
    providers: [CrawlService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AMXHComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;
    isCompact: boolean = false;

    captions: { index: number; text: string }[] = [];
    articleData: any = null;
    removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();

    @ViewChild('drawer') drawer: MatDrawer;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    allPanels: any[] = [
        {
            id: 'profiles',
            icon: 'feather:smartphone',
            title: 'Tài khoản',
            description: 'Quản lý tài khoản Tiktok, Facebook của bạn',
        },
        {
            id: 'script',
            icon: 'feather:sliders',
            title: 'Tiktok',
            description: 'Xem livestream, bấm like, viết comment tự động',
        },
        {
            id: 'share',
            icon: 'feather:share-2',
            title: 'Facebook',
            description: 'Tải video về và chia sẻ lên Facebook',
        }
    ];

    panels: any[] = [];

    selectedPanel: string = 'profiles';
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------
    updatePanels(): void {
        let settings: any = null;
        if (this._multiAccountService) {
            settings = this._multiAccountService.getItem('settings');
        }
        if (!settings && typeof localStorage !== 'undefined') {
            try {
                settings = JSON.parse(localStorage.getItem('settings') || '{}');
            } catch (e) {}
        }
        if (!settings && (this.user as any)?.settings) {
            settings = (this.user as any).settings;
        }

        let mxhautoVal = '';
        if (settings && settings.mxhauto !== undefined && settings.mxhauto !== null) {
            mxhautoVal = String(settings.mxhauto).trim();
        } else if ((this.user as any)?.settings?.mxhauto !== undefined) {
            mxhautoVal = String((this.user as any).settings.mxhauto).trim();
        }

        const hasTiktok = !!(mxhautoVal && mxhautoVal !== '' && mxhautoVal !== 'http://localhost:404');

        this.panels = this.allPanels.filter(p => {
            if (p.id === 'profiles' || p.id === 'script') {
                return hasTiktok;
            }
            return true;
        });

        if (!this.panels.some(p => p.id === this.selectedPanel)) {
            this.selectedPanel = this.panels[0]?.id || 'profiles';
        }

        this._changeDetectorRef.markForCheck();
    }

    detail(uuid: string, name: string, tab: string) {
        this._crawlService.detail({ uuid: uuid, username: name }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (result: any) => {
                if (result && result.data) {
                    this.articleData = result.data;

                    if (result.data.done) {
                        this.captions = result.data.done.map((htmlItem: any, index: number) => {
                            const cleanText = this.removeHTML.transform(htmlItem);

                            return {
                                index: index,
                                text: cleanText,
                            };
                        });
                    }

                    this.goToPanel(tab);
                }
            },
            error: (err) => console.error('Lỗi API Detail:', err)
        });
    }

    /**
     * Navigate to the panel
     *
     * @param panel
     */
    goToPanel(panel: string): void {
        this.selectedPanel = panel;

        this.router.navigate([], {
            relativeTo: this.activatedRoute,
            queryParams: { panel: panel },
            queryParamsHandling: 'merge'
        });

        // Close the drawer on 'over' mode
        if (this.drawerMode === 'over') {
            this.drawer.close();
        }
    }

    toggleCompact(): void {
        this.isCompact = !this.isCompact;
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
        private _crawlService: CrawlService,
        private _fuseConfirmationService: FuseConfirmationService,
        private activatedRoute: ActivatedRoute,
        private router: Router,
        private _fuseMediaWatcherService: FuseMediaWatcherService,
        private _fuseNavigationService: FuseNavigationService,
        private _multiAccountService: MultiAccountService
    ) {
        this.updatePanels();

        this.activatedRoute.queryParams.subscribe((params: Params) => {
            if (params && params.uuid && params.tab && params.user) {
                this.detail(params.uuid, params.user, params.tab);
            } else if (params && params.panel) {
                this.selectedPanel = params.panel;
            }
        });

        // Set selected panel from history state if available
        const state = this.router.getCurrentNavigation()?.extras.state || history.state;
        if (state && state.panel) {
            this.selectedPanel = state.panel;
        }

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
                this.updatePanels();
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.updatePanels();
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
        this.updatePanels();

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
