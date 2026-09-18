import {
    ChangeDetectorRef,
    Component,
    inject,
    OnDestroy,
    OnInit,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import type { SwiperOptions } from 'swiper/types';
import { A11y, Mousewheel, Navigation, Pagination } from 'swiper/modules';
import { Subject, takeUntil } from 'rxjs';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'ai-tools',
    templateUrl: './tools.component.html',
    encapsulation: ViewEncapsulation.None,
    styles: [
        `
            @keyframes zalo-simple-blink {
                0%,
                100% {
                    opacity: 0.75;
                    filter: drop-shadow(0 0 1px rgba(0, 104, 255, 0.25));
                }
                50% {
                    opacity: 1;
                    filter: drop-shadow(0 0 5px rgba(0, 104, 255, 0.65));
                }
            }
            .zalo-background-running {
                color: #0068ff !important;
                display: inline-block !important;
                animation: zalo-simple-blink 2.2s infinite ease-in-out;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class AIToolsComponent implements OnInit, OnDestroy {
    year: number = 2023;
    config: AppConfig;
    user: User;

    isZaloInstalled: boolean = false;
    isZaloRunningBackground: boolean = false;
    isTiktokPluginActive: boolean = false;

    cols: number;

    gridByBreakpoint = {
        xl: 4,
        lg: 4,
        md: 3,
        sm: 3,
        xs: 3,
    };

    public swipe: SwiperOptions = {
        modules: [Navigation, Pagination, A11y, Mousewheel],
        autoHeight: false,
        direction: 'horizontal',
        mousewheel: true,
        autoplay: false,
        keyboard: true,
        loop: false,
        hashNavigation: false,
        spaceBetween: 0,
        navigation: false,
        pagination: { clickable: true, dynamicBullets: true },
        slidesPerView: 1,
        centeredSlides: true,
        grid: {
            fill: 'row',
            rows: 1,
        },
        breakpoints: {
            '576': { slidesPerView: 1 },
            '768': { slidesPerView: 1 },
            '992': { slidesPerView: 1 },
        },
    };

    public cn = {
        cn2: 0,
        cn3: 0,
    };
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private breakpointObserver: BreakpointObserver,
        private cd: ChangeDetectorRef,
        private _multiAccountService: MultiAccountService,
    ) {
        this.titleService.setTitle(
            `bộ công cụ | ai.type - công cụ tạo content`,
        );

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
                this.cn = this._userService.permissionF(user);
                this.user = user;
            });

        this.breakpointObserver
            .observe([
                Breakpoints.XSmall,
                Breakpoints.Small,
                Breakpoints.Medium,
                Breakpoints.Large,
                Breakpoints.XLarge,
            ])
            .subscribe((result) => {
                if (result.matches) {
                    if (result.breakpoints[Breakpoints.XSmall]) {
                        this.cols = this.gridByBreakpoint.xs;
                    }
                    if (result.breakpoints[Breakpoints.Small]) {
                        this.cols = this.gridByBreakpoint.sm;
                    }
                    if (result.breakpoints[Breakpoints.Medium]) {
                        this.cols = this.gridByBreakpoint.md;
                    }
                    if (result.breakpoints[Breakpoints.Large]) {
                        this.cols = this.gridByBreakpoint.lg;
                    }
                    if (result.breakpoints[Breakpoints.XLarge]) {
                        this.cols = this.gridByBreakpoint.xl;
                    }
                }
            });
    }

    ngOnInit(): void {
        this.checkPlugins();
    }

    async checkPlugins() {
        let settings = this._multiAccountService?.getItem('settings') || {};
        try {
            const ls = localStorage.getItem('settings');
            if (ls) {
                settings = { ...settings, ...JSON.parse(ls) };
            }
        } catch (e) {}

        if (
            (window as any).electronAPI &&
            (window as any).electronAPI.getPluginsStatus
        ) {
            try {
                const list = await (
                    window as any
                ).electronAPI.getPluginsStatus();
                const zalo = list.find((p: any) => p.id === 'zalo_reply');
                this.isZaloInstalled = zalo
                    ? zalo.installed && zalo.enabled
                    : false;
                this.isZaloRunningBackground = zalo
                    ? zalo.installed && zalo.enabled
                    : false;

                const tiktok = list.find((p: any) => p.id === 'tiktok_100');
                this.isTiktokPluginActive = tiktok
                    ? tiktok.installed && tiktok.enabled
                    : !!settings.tiktokPluginEnabled;
            } catch (e) {
                this.isZaloInstalled = false;
                this.isZaloRunningBackground = false;
                this.isTiktokPluginActive = !!settings.tiktokPluginEnabled;
            }
        } else {
            // Chạy trên browser dev mode thì đọc từ settings
            this.isZaloInstalled = true;
            this.isZaloRunningBackground = true;
            this.isTiktokPluginActive = !!settings.tiktokPluginEnabled;
        }
        this.cd.detectChanges();
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
