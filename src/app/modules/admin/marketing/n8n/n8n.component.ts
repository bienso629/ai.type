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

    captions: { index: number; text: string }[] = [];
    articleData: any = null;
    removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();

    @ViewChild('drawer') drawer: MatDrawer;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;
    panels: any[] = [
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
            description: 'Xem livstream, bấm like, viết comment tự động',
        },
        {
            id: 'schedule',
            icon: 'feather:calendar',
            title: 'Lịch làm việc',
            description: 'Lên kịch bản tự động hóa theo thời gian',
        },
        {
            id: 'share',
            icon: 'feather:share-2',
            title: 'Facebook',
            description: 'Tải video về và chia sẻ lên Facebook',
        }
    ];

    selectedPanel: string = 'profiles';
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------
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
        private _fuseMediaWatcherService: FuseMediaWatcherService
    ) {
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
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;


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
