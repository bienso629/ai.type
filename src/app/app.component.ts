import {
    Component,
    OnDestroy,
    OnInit,
    signal,
    AfterViewInit,
    ChangeDetectorRef,
    NgZone,
    ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { NavigationEnd, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { AppTitleService } from 'app/core/services/app-title.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { DeviceUUID } from 'device-uuid';
import { UserService } from './core/user/user.service';
import { AuthService } from './core/auth/auth.service';
import { ForumService } from './_services/forum';
import { Subject, takeUntil, take, filter, timeout } from 'rxjs';
import { User } from './core/user/user.types';
import { MatDialog } from '@angular/material/dialog';
import { MultiAccountService } from './_services/multi-account.service';
import { UserSettingsService, getSettings } from './_services/user-settings.service';
import { ToastrService } from 'ngx-toastr';
import { LicenseKeyService } from 'app/_services/licensekey';

import { FontService } from './_services/font.service';
import { GenaiService } from './genai.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    providers: [LicenseKeyService],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
    user: User;
    uuid = new DeviceUUID().get();

    checkActiveInfo = false;
    dialogRef: any;

    // Biến để lưu ID của timer giúp dọn dẹp sau này
    private intervalId: any;
    private _groupCheckIntervalId: any;
    private _isCheckingPurchasedGroup = false;
    private _isForcingGroupLogout = false;
    private _lastGroupCheckedUserKey = '';
    private readonly _purchasedGroupCheckIntervalMs = 1000 * 20;
    private readonly _onWindowFocusOrOnline = () => {
        this._verifyPurchasedGroupMembership(false, 3000);
    };
    private readonly _onVisibilityChange = () => {
        if (typeof document !== 'undefined' && !document.hidden) {
            this._verifyPurchasedGroupMembership(false, 3000);
        }
    };

    // 5 phút kiểm tra một lần
    private readonly ONE_HOUR_MS = 1000 * 60 * 5;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // ===== UI Gemini Popup State =====
    isWebviewVisible = false;
    isWebviewMinimized = false;
    isWebviewMaximized = false;
    popupTitle = 'Gemini';
    popupFavicon =
        'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64';
    popupHomeUrl = 'https://gemini.google.com/app?hl=vi';
    isWebviewMobileMode = false;
    private _savedDesktopPopupWidth = 860;

    // Toggle webview: ẩn/hiện nhanh
    toggleWebview() {
        this.isWebviewVisible = !this.isWebviewVisible;
        if (this.isWebviewVisible) {
            this.isWebviewMinimized = false;
        }
    }

    // Thu nhỏ / Khôi phục khung Popup WebTools xuống góc dưới bên phải màn hình
    toggleMinimizeWebview() {
        this.isWebviewMinimized = !this.isWebviewMinimized;
        const popupEl = document.querySelector('.gemini-popup') as HTMLElement;
        if (!popupEl) return;

        if (this.isWebviewMinimized) {
            popupEl.style.transform = 'none';
            popupEl.style.height = '40px';
            popupEl.style.minHeight = '40px';
            popupEl.style.width = '340px';
            popupEl.style.top = 'calc(100vh - 54px)';
            popupEl.style.left = 'calc(100vw - 360px)';
        } else if (this.isWebviewMaximized) {
            this.applyMaximizedWebviewStyles(popupEl, true);
        } else {
            this.applyMaximizedWebviewStyles(popupEl, false);
        }
    }

    // Phóng to toàn màn hình / Khôi phục kích thước chuẩn 600px bên phải của khung Popup WebTools
    toggleMaximizeWebview() {
        this.isWebviewMinimized = false;
        this.isWebviewMaximized = !this.isWebviewMaximized;
        const popupEl = document.querySelector('.gemini-popup') as HTMLElement;
        if (!popupEl) return;
        this.applyMaximizedWebviewStyles(popupEl, this.isWebviewMaximized);
    }

    private applyMaximizedWebviewStyles(
        popupEl: HTMLElement,
        maximized: boolean,
    ) {
        popupEl.style.transform = 'none';
        popupEl.style.minHeight = '400px';
        if (maximized) {
            popupEl.style.top = '12px';
            popupEl.style.left = '16px';
            popupEl.style.width = 'calc(100vw - 32px)';
            popupEl.style.height = 'calc(100vh - 24px)';
        } else {
            const w = this.isWebviewMobileMode
                ? 414
                : this._savedDesktopPopupWidth || 600;
            popupEl.style.top = '20px';
            popupEl.style.left = `calc(100vw - ${w + 20}px)`;
            popupEl.style.width = `${w}px`;
            popupEl.style.height = 'calc(100vh - 40px)';
        }
    }

    // Chuyển đổi chế độ Giả lập Điện thoại (Thu nhỏ khung cửa sổ Popup + Mobile UA + m.facebook.com) cho WebTools
    toggleWebviewMobileMode(forceMobile?: boolean) {
        this.isWebviewMobileMode =
            forceMobile !== undefined ? forceMobile : !this.isWebviewMobileMode;
        const popupEl = document.querySelector('.gemini-popup') as HTMLElement;
        const webview = this.getActiveWebview();

        const mobileUA =
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        const desktopUA =
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

        if (this.isWebviewMobileMode) {
            if (popupEl) {
                if (popupEl.offsetWidth > 430) {
                    this._savedDesktopPopupWidth = popupEl.offsetWidth;
                }
                popupEl.style.width = '414px';
            }
            if (webview) {
                webview.style.width = '100%';
                webview.style.maxWidth = '100%';
                webview.style.margin = '0';
                webview.style.borderLeft = 'none';
                webview.style.borderRight = 'none';
            }
        } else {
            if (popupEl) {
                popupEl.style.width = `${this._savedDesktopPopupWidth || 860}px`;
            }
            if (webview) {
                webview.style.width = '100%';
                webview.style.maxWidth = '100%';
                webview.style.margin = '0';
                webview.style.borderLeft = 'none';
                webview.style.borderRight = 'none';
            }
        }

        if (!webview) return;

        let currentUrl = '';
        try {
            currentUrl =
                typeof webview.getURL === 'function'
                    ? webview.getURL()
                    : webview.getAttribute('src') || this.popupHomeUrl || '';
        } catch (_) {
            currentUrl = webview.getAttribute('src') || this.popupHomeUrl || '';
        }

        if (this.isWebviewMobileMode) {
            try {
                if (typeof webview.setUserAgent === 'function') {
                    webview.setUserAgent(mobileUA);
                }
            } catch (_) {}

            let targetUrl = currentUrl;
            if (/^https?:\/\/(www\.|web\.)?facebook\.com/i.test(targetUrl)) {
                targetUrl = targetUrl.replace(
                    /^https?:\/\/(www\.|web\.)?facebook\.com/i,
                    'https://m.facebook.com',
                );
            }
            if (targetUrl && typeof webview.loadURL === 'function') {
                webview.loadURL(targetUrl, { userAgent: mobileUA });
            } else if (typeof webview.reload === 'function') {
                webview.reload();
            }
        } else {
            try {
                if (typeof webview.setUserAgent === 'function') {
                    webview.setUserAgent(desktopUA);
                }
            } catch (_) {}

            let targetUrl = currentUrl;
            if (/^https?:\/\/m\.facebook\.com/i.test(targetUrl)) {
                targetUrl = targetUrl.replace(
                    /^https?:\/\/m\.facebook\.com/i,
                    'https://www.facebook.com',
                );
            }
            if (targetUrl && typeof webview.loadURL === 'function') {
                webview.loadURL(targetUrl, { userAgent: desktopUA });
            } else if (typeof webview.reload === 'function') {
                webview.reload();
            }
        }
    }

    // Lấy thẻ webview đang được hiển thị trong container
    private getActiveWebview(): any {
        const container = document.getElementById('webview-container-div');
        if (!container) return null;
        const webviews = Array.from(container.querySelectorAll('webview')) as any[];
        if (webviews.length === 0) return null;
        const visibleWv = webviews.find(
            (wv) => wv.style.display !== 'none' && wv.offsetParent !== null,
        );
        return visibleWv || webviews.find((wv) => wv.style.display !== 'none') || webviews[webviews.length - 1];
    }

    // Nút quay lại trang trước trong webview
    webviewGoBack() {
        const webview = this.getActiveWebview();
        if (webview) {
            try {
                if (typeof webview.canGoBack === 'function' && webview.canGoBack()) {
                    webview.goBack();
                    return;
                }
            } catch (err) {}
            if (typeof webview.executeJavaScript === 'function') {
                webview.executeJavaScript('window.history.back();');
            }
        }
    }

    // Mở lại trang chủ của webview hiện tại hoặc tải lại trang
    webviewGoHome() {
        const webview = this.getActiveWebview();
        if (webview) {
            const homeUrl = this.popupHomeUrl || webview.getAttribute('src');
            if (homeUrl && typeof webview.loadURL === 'function') {
                webview.loadURL(homeUrl);
            } else if (typeof webview.reload === 'function') {
                webview.reload();
            }
        }
    }

    // Mở trang WebTool hiện tại trong khung Google Chrome App Mode (hỗ trợ DRM Widevine VMP như Netflix/Spotify và vượt chặn bảo mật)
    async openInChromeApp() {
        const webview = this.getActiveWebview();
        let currentUrl = this.popupHomeUrl || '';
        if (webview) {
            try {
                currentUrl =
                    typeof webview.getURL === 'function'
                        ? webview.getURL()
                        : webview.getAttribute('src') || this.popupHomeUrl || '';
            } catch (_) {
                currentUrl = webview.getAttribute('src') || this.popupHomeUrl || '';
            }
        }

        const popupEl = document.querySelector('.gemini-popup') as HTMLElement;
        let bounds: {
            offsetLeft?: number;
            offsetTop?: number;
            width?: number;
            height?: number;
        } | null = null;
        if (popupEl) {
            const rect = popupEl.getBoundingClientRect();
            if (rect.width >= 300 && rect.height >= 350) {
                bounds = {
                    offsetLeft: Math.round(rect.left),
                    offsetTop: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                };
            }
        }

        // Ẩn ngay khung <webview> nội bộ để cửa sổ Chrome App thế chỗ đúng tại vị trí Popup đó
        this.isWebviewVisible = false;
        this.cdr.detectChanges();

        const electron = (window as any).electron || (window as any).electronAPI;
        if (electron?.launchChromeAppTool) {
            await electron.launchChromeAppTool({
                url: currentUrl,
                bounds,
            });
            return;
        }
        if ((window as any).electron?.invoke) {
            await (window as any).electron.invoke('launch-chrome-app-tool', {
                url: currentUrl,
                bounds,
            });
            return;
        }
        window.open(currentUrl, '_blank');
    }

    // Kiểm tra xem công cụ hiện tại có phải công cụ thuộc hệ sinh thái Google hay không
    get isGoogleTool(): boolean {
        const url = (this.popupHomeUrl || '').toLowerCase();
        const title = (this.popupTitle || '').toLowerCase();
        return (
            url.includes('google.com') ||
            url.includes('gemini') ||
            url.includes('colab') ||
            title.includes('google') ||
            title.includes('gemini') ||
            title.includes('colab')
        );
    }

    // Mở trang đăng nhập Google bằng Chrome thật (Stealth Login)
    async openLoginBrowser() {
        const electron = (window as any).electron;
        if (electron?.googleStealthLogin) {
            const webview = this.getActiveWebview();
            const currentUrl =
                webview && typeof webview.getURL === 'function'
                    ? webview.getURL()
                    : this.popupHomeUrl || '';
            const loginTarget =
                currentUrl &&
                currentUrl.includes('google.com') &&
                !currentUrl.includes('accounts.google.com')
                    ? `https://accounts.google.com/ServiceLogin?hl=vi&continue=${encodeURIComponent(currentUrl)}`
                    : 'https://accounts.google.com/ServiceLogin?hl=vi&continue=https%3A%2F%2Fmyaccount.google.com%2F';

            await electron.googleStealthLogin(loginTarget);
            const container = document.getElementById('webview-container-div');
            if (container) {
                container.querySelectorAll('webview').forEach((wv: any) => {
                    try {
                        if (wv.reloadIgnoringCache) {
                            wv.reloadIgnoringCache();
                        } else if (wv.reload) {
                            wv.reload();
                        }
                    } catch (e) {}
                });
            }
            return;
        }

        const webview = this.getActiveWebview();
        if (webview && typeof webview.executeJavaScript === 'function') {
            webview.executeJavaScript(`
                (function() {
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = 'https://accounts.google.com/ServiceLogin?trigger-stealth-login=true';
                    document.body.appendChild(iframe);
                    setTimeout(() => {
                        try { document.body.removeChild(iframe); } catch(e){}
                    }, 5000);
                })();
            `).catch(() => {
                if (typeof webview.loadURL === 'function') {
                    const curUrl = webview.getURL ? webview.getURL() : (this.popupHomeUrl || 'https://accounts.google.com/ServiceLogin');
                    webview.loadURL(`https://accounts.google.com/ServiceLogin?trigger-stealth-login=true&continue=${encodeURIComponent(curUrl)}`);
                }
            });
        }
    }

    // ===============================

    updateTime(): void {
        // Đã vô hiệu hóa logic tự động ép chuyển hướng sang màn hình Active/Gia hạn
        let activeInfo = this.multiAccountService.getItem('active_info');
        if (activeInfo && activeInfo != 'null' && activeInfo != 'undefined') {
            this.syncActiveInfo(activeInfo);
        }
    }

    private isSyncingLicense: boolean = false;
    private lastSyncUser: string = '';
    private lastSyncTime: number = 0;

    private syncActiveInfo(activeInfoStr: string): void {
        if (this.isSyncingLicense) return;

        const activeInfoObj = AuthUtils._getActiveInfo(activeInfoStr);
        if (
            !activeInfoObj ||
            !activeInfoObj.user ||
            !activeInfoObj.user.licenseKey
        )
            return;
        if (!this.user || !this.user.name) return;

        const now = Date.now();
        // Tránh gọi trùng lặp API activate liên tục cho cùng 1 user trong vòng 10 giây
        if (
            this.lastSyncUser === this.user.name &&
            now - this.lastSyncTime < 10000
        ) {
            return;
        }

        this.isSyncingLicense = true;
        this.lastSyncUser = this.user.name;
        this.lastSyncTime = now;

        const du = new DeviceUUID().parse();
        const syncUsername = activeInfoObj.user.username || activeInfoObj.user.info?.customerName || this.user.name;
        const syncEmail = activeInfoObj.user.email || activeInfoObj.user.info?.email || this.user.email;

        this._licenseKeyService
            .activate({
                username: syncUsername,
                email: syncEmail,
                machine: {
                    uuid: this.uuid,
                    du: du,
                },
                licensekey: activeInfoObj.user.licenseKey,
            })
            .pipe(take(1))
            .subscribe({
                next: async (result) => {
                    this.isSyncingLicense = false;
                    if (result && result.success && result.data) {
                        const newActiveInfo = AuthUtils._generateActiveInfo(
                            result.data,
                            this.uuid,
                        );
                        if (newActiveInfo) {
                            await this.multiAccountService.setItem(
                                'active_info',
                                newActiveInfo,
                            );
                            try {
                                localStorage.setItem('active_info', newActiveInfo);
                                localStorage.setItem('ai_type_backup_active_info', newActiveInfo);
                            } catch (e) {}
                            if ((window as any).electron) {
                                await (window as any).electron.invoke(
                                    'register-license',
                                    newActiveInfo,
                                );
                            }
                        }
                    }
                },
                error: (err) => {
                    this.isSyncingLicense = false;
                },
            });
    }

    /**
     * Constructor
     */
    constructor(
        private _userService: UserService,
        private _authService: AuthService,
        private _forumService: ForumService,
        private _fuseConfirmationService: FuseConfirmationService,
        public dialog: MatDialog,
        private router: Router,
        private multiAccountService: MultiAccountService,
        private cdr: ChangeDetectorRef,
        private toastr: ToastrService,
        private ngZone: NgZone,
        private _translocoService: TranslocoService,
        private _licenseKeyService: LicenseKeyService,
        private _fontService: FontService,
        private _titleService: Title,
        private _genaiService: GenaiService,
        private _userSettingsService: UserSettingsService,
    ) {
        // Khôi phục tài khoản đang Active và chờ DB nạp xong trước khi đọc settings
        // [Fix 2026-11-10] loadActiveAccount là async (nạp IndexedDB mất vài trăm ms).
        // Nếu đọc settings ngay lập tức, RAM còn rỗng => ghi nhầm settings mặc định rỗng
        // đè mất session thật (nguyên nhân settings bị xóa mỗi lần mở app).
        // isReady đã tự gọi loadActiveAccount() trong constructor của service;
        // chỉ cần chờ promise này xong thì RAM chắc chắn đã có session thật.
        this.multiAccountService.isReady.then(() => {
            // [Refactor 2026-11-11] Settings chi luu/doc tren server: doc ban sao cache RAM
            // cua du lieu server, khong tao/ghi settings mac dinh vao local nua.
            const settings: any = getSettings();
            if (settings && settings.language) {
                this._translocoService.setActiveLang(settings.language);
            }
        });

        // Khi settings moi duoc tai/luu tu server (resolver, luu cau hinh...) => dong bo ngon ngu
        this._userSettingsService.settings$.subscribe((s: any) => {
            if (s && s.language) {
                this._translocoService.setActiveLang(s.language);
            }
        });

        // We use native DOM events in ngAfterViewInit instead of ResizeObserver to prevent lag
    }

    ngOnInit() {
        // Lắng nghe sự kiện chuyển trang để cập nhật tiêu đề chuẩn cho Window & kiểm tra quyền nhóm "nhóm-đã-mua-ai-type"
        this.router.events
            .pipe(
                filter((event) => event instanceof NavigationEnd),
                takeUntil(this._unsubscribeAll),
            )
            .subscribe((event: any) => {
                const targetUrl = event.urlAfterRedirects || event.url || '';
                if (this._titleService instanceof AppTitleService) {
                    this._titleService.handleRouteChange(targetUrl);
                }
                if (
                    !targetUrl.startsWith('/sign-in') &&
                    !targetUrl.startsWith('/sign-out') &&
                    !targetUrl.startsWith('/sign-up')
                ) {
                    this._verifyPurchasedGroupMembership(false, 5000);
                }
            });

        // Khởi tạo font hệ thống
        this._fontService.initFontSystem();

        // Xoá CSS variable gây lỗi co rút các Dialog của Angular Material (luôn set 100vw)
        document.documentElement.style.setProperty(
            '--main-pane-width',
            '100vw',
        );

        // Đã xóa bộ đếm chu kỳ kiểm tra license

        // Lắng nghe sự kiện thu hồi quyền nhóm "nhóm-đã-mua-ai-type" từ bất kỳ Guard / Resolver / kiểm tra nền nào
        this._userService.purchasedGroupRevoked$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ user, reason }) => {
                this._forceLogoutMissingPurchasedGroup(user, reason);
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                // Run updateTime after user is loaded so syncActiveInfo has user data
                this.updateTime();

                if (user && (user.email || user.id || user.name)) {
                    const uKey = String(user.email || user.id || user.name).trim().toLowerCase();
                    const curUrl = this.router.url || '';
                    const isAuthRoute =
                        curUrl.startsWith('/sign-in') ||
                        curUrl.startsWith('/sign-out') ||
                        curUrl.startsWith('/sign-up');
                    if (uKey !== this._lastGroupCheckedUserKey && !isAuthRoute) {
                        this._lastGroupCheckedUserKey = uKey;
                        this._isForcingGroupLogout = false;
                        this._verifyPurchasedGroupMembership(true);
                    }
                } else {
                    this._lastGroupCheckedUserKey = '';
                }
            });

        // Định kỳ 20 giây, khi chuyển tab/lấy lại focus hoặc có mạng trở lại: kiểm tra tài khoản còn trong "nhóm-đã-mua-ai-type" hay không
        this._groupCheckIntervalId = setInterval(() => {
            this._verifyPurchasedGroupMembership(true);
        }, this._purchasedGroupCheckIntervalMs);
        window.addEventListener('focus', this._onWindowFocusOrOnline);
        window.addEventListener('online', this._onWindowFocusOrOnline);
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        // Lắng nghe sự kiện toggle webview từ main.js qua phím tắt
        if ((window as any).electron) {
            // Đăng ký license cho main.js kiểm tra (Bảo mật hơn)
            const activeInfo = this.multiAccountService.getItem('active_info');
            if (activeInfo) {
                (window as any).electron.invoke('register-license', activeInfo);
            }

            // Lắng nghe lệnh force-renewal từ main.js
            (window as any).electron.onForceRenewal(() => {
                this.router.navigate(['/settings'], {
                    queryParams: { tab: 'active' },
                });
            });

            (window as any).electron.onToolsResponse((data: any) => {
                if (data && data.action === 'toggle-gemini-webview') {
                    this.toggleWebview();
                    this.cdr.detectChanges();
                } else if (data && data.action === 'hide-gemini-webview') {
                    this.isWebviewVisible = false;
                    this.cdr.detectChanges();
                }
            });
        }

        // Lắng nghe sự kiện qua DOM event từ chuỗi button bên Layout
        window.addEventListener('toggle-gemini', (e: any) => {
            if (e && e.detail && e.detail.forceClose) {
                this.isWebviewVisible = false;
                this.cdr.detectChanges();
                return;
            }
            if (e && e.detail && e.detail.forceOpen) {
                this.isWebviewVisible = true;
                if (e.detail.title) {
                    this.popupTitle = e.detail.title;
                }
                if (e.detail.url) {
                    this.popupHomeUrl = e.detail.url;
                    try {
                        const domain = new URL(e.detail.url).hostname;
                        this.popupFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                    } catch (err) {
                        this.popupFavicon = './assets/images/logo/favicon.svg';
                    }
                }
            } else {
                this.toggleWebview();
            }
            this.cdr.detectChanges();
        });

        // Gửi sang Google Flow
        window.addEventListener('send-to-google-flow', (e: any) => {
            const prompt = e.detail?.prompt;
            if (prompt) {
                this.isWebviewVisible = true;
                this.cdr.detectChanges();

                const webview: any = document.querySelector(
                    '#webview-container-div webview',
                );
                if (webview) {
                    const url = 'https://labs.google/fx/tools/flow';
                    const currentUrl = webview.getURL();

                    const injectScript = () => {
                        const safePrompt = prompt
                            .replace(/\\/g, '\\\\')
                            .replace(/`/g, '\\`')
                            .replace(/\$/g, '\\$');
                        webview.executeJavaScript(`
                            setTimeout(() => {
                                // Google Flow đặt toàn bộ giao diện trong một Iframe bảo mật chéo nguồn (Cross-Origin),
                                // khiến việc dùng code can thiệp trực tiếp từ bên ngoài bị trình duyệt chặn hoàn toàn.
                                // Do đó, cách ổn định nhất là chép vào Clipboard để người dùng tự Paste.
                                
                                navigator.clipboard.writeText(\`${safePrompt}\`).then(() => {
                                    // Tạo một thông báo nổi (Toast) nhỏ góc màn hình
                                    const toast = document.createElement('div');
                                    toast.innerHTML = '✨ <b>Đã copy Prompt!</b><br>Bạn hãy nhấp vào ô "Bạn muốn tạo gì?" và bấm <b>Ctrl + V</b> nhé.';
                                    toast.style.cssText = 'position: fixed; bottom: 30px; right: 30px; background: #4f46e5; color: white; padding: 15px 20px; border-radius: 8px; font-family: sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 999999; animation: slideIn 0.3s ease-out;';
                                    
                                    const style = document.createElement('style');
                                    style.innerHTML = '@keyframes slideIn { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
                                    document.head.appendChild(style);
                                    document.body.appendChild(toast);
                                    
                                    setTimeout(() => {
                                        toast.style.opacity = '0';
                                        toast.style.transition = 'opacity 0.5s';
                                        setTimeout(() => toast.remove(), 500);
                                    }, 5000);
                                }).catch(e => console.log('Clipboard error: ', e));
                            }, 1000);
                        `);
                    };

                    if (!currentUrl.includes('labs.google/fx/tools/flow')) {
                        webview.loadURL(url);
                        webview.addEventListener(
                            'did-stop-loading',
                            function handler() {
                                webview.removeEventListener(
                                    'did-stop-loading',
                                    handler,
                                );
                                injectScript();
                            },
                        );
                    } else {
                        injectScript();
                    }
                }
            }
        });

        // Lắng nghe sự kiện mở & tự động chạy Colab GPU Bridge
        window.addEventListener('open-colab-gpu-bridge', (e: any) => {
            this.isWebviewVisible = true;
            this.popupTitle = 'Google Colab GPU';
            this.popupFavicon =
                'https://colab.research.google.com/img/colab_favicon_256px.png';
            this.cdr.detectChanges();

            const webview: any =
                document.querySelector('#webview-container-div webview') ||
                document.querySelector('webview');
            if (webview) {
                const targetUrl =
                    'https://colab.research.google.com/#create=true';

                const pyCode = `# === AI.TYPE GPU BRIDGE & OMNIVOICE RUNNER ===
import os, sys, time, subprocess, json, base64, threading, io, traceback, re, shutil
print("⏳ [ai.type] Đang chuẩn bị môi trường GPU & OmniVoice...")

os.system("wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1")
os.system("pip install -q fastapi uvicorn pydantic requests soundfile torchaudio sentence-transformers faiss-gpu pypdf pdfplumber > /dev/null 2>&1")
os.system("pip install -q omnivoice > /dev/null 2>&1 || pip install -q git+https://github.com/k2-fsa/OmniVoice.git > /dev/null 2>&1")

import torch
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uvicorn, requests

VOICES_DIR = "/content/voices"
OUTPUT_DIR = "/content/tts_output"
os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

omnivoice_model = None
device = "cuda:0" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if torch.cuda.is_available() else torch.float32

try:
    from omnivoice import OmniVoice
    omnivoice_model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device, dtype=dtype)
    print(f"✅ OmniVoice đã sẵn sàng trên GPU: {device}")
except Exception as e:
    print(f"⚠️ Sẽ nạp OmniVoice khi có yêu cầu đầu tiên: {e}")

app = FastAPI(title="ai.type Colab Bridge", version="1.2.3")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class ToolCallRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = {}

class AudioAsyncRequest(BaseModel):
    text: str
    voice: Optional[str] = "yenai"
    ref_audio_name: Optional[str] = "yenai.wav"
    ref_text: Optional[str] = ""
    speed: Optional[float] = 1.0
    num_step: Optional[int] = 16
    ref_audio_base64: Optional[str] = None

tasks_db = {}

@app.get("/")
@app.get("/status")
def server_status():
    gpu_info = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    vram_free = round(torch.cuda.mem_get_info()[0] / (1024**3), 2) if torch.cuda.is_available() else 0
    return {
        "status": "online",
        "gpu": f"{gpu_info} ({vram_free}GB VRAM Free)",
        "version": "1.2.3",
        "omnivoice_loaded": omnivoice_model is not None,
        "available_voices": [f for f in os.listdir(VOICES_DIR) if f.endswith(('.wav', '.mp3'))]
    }

@app.get("/status/{task_id}")
def get_task_status(task_id: str):
    if task_id not in tasks_db:
        return {"status": "error", "message": "Task không tồn tại"}
    return tasks_db[task_id]

@app.get("/download/{filename}")
def download_file(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File không tồn tại")
    return FileResponse(file_path, media_type="audio/wav", filename=filename)

@app.post("/cancel_task/{task_id}")
def cancel_task(task_id: str):
    if task_id in tasks_db:
        tasks_db[task_id]["status"] = "cancelled"
    return {"success": True}

def run_omnivoice_task(task_id: str, req: AudioAsyncRequest):
    global omnivoice_model
    try:
        tasks_db[task_id] = {"status": "processing", "progress": 20}
        if omnivoice_model is None:
            from omnivoice import OmniVoice
            omnivoice_model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device, dtype=dtype)

        ref_audio_path = None
        if req.ref_audio_base64:
            ref_audio_path = os.path.join(VOICES_DIR, f"{task_id}_ref.wav")
            with open(ref_audio_path, "wb") as f:
                f.write(base64.b64decode(req.ref_audio_base64))
        else:
            target_name = req.ref_audio_name or "yenai.wav"
            candidates = [
                os.path.join(VOICES_DIR, target_name),
                os.path.join(VOICES_DIR, target_name.lower()),
                os.path.join(VOICES_DIR, f"{target_name}.wav"),
                os.path.join(VOICES_DIR, "yenai.wav"),
                os.path.join(VOICES_DIR, "mpsg.wav")
            ]
            for c in candidates:
                if os.path.exists(c):
                    ref_audio_path = c
                    break

        if tasks_db.get(task_id, {}).get("status") == "cancelled":
            return

        gen_kwargs = {"text": req.text}
        if ref_audio_path and os.path.exists(ref_audio_path):
            gen_kwargs["ref_audio"] = ref_audio_path
            ref_text_to_use = req.ref_text.strip() if req.ref_text else ""
            if not ref_text_to_use:
                default_texts = {
                    "yenai": "Đêm giao thừa, cả nhà không ai lo cắm mặt vào điện thoại, chúng tôi ngồi bên nhau, kể chuyện, cười đùa, chờ đợi tiếng pháo nổ giòn giã ngoài ngõ.",
                    "mpsg": "Rachel đã ly dị, đã mất việc, đã chìm trong rượu và cay đắng, chẳng còn nơi nào để đến và đi."
                }
                for k, v in default_texts.items():
                    if k in os.path.basename(ref_audio_path).lower():
                        ref_text_to_use = v
                        break
            if ref_text_to_use:
                gen_kwargs["ref_text"] = ref_text_to_use

        tasks_db[task_id]["progress"] = 50
        audio_list = omnivoice_model.generate(**gen_kwargs)

        out_filename = f"{task_id}.wav"
        out_filepath = os.path.join(OUTPUT_DIR, out_filename)
        sf.write(out_filepath, audio_list[0], 24000)

        tasks_db[task_id] = {
            "status": "done",
            "download_url": f"/download/{out_filename}",
            "task_id": task_id
        }
    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id] = {"status": "error", "message": str(e)}

@app.post("/generate_audio_async")
def generate_audio_async(req: AudioAsyncRequest):
    task_id = f"task_{int(time.time()*1000)}_{os.urandom(3).hex()}"
    tasks_db[task_id] = {"status": "pending", "progress": 0}
    threading.Thread(target=run_omnivoice_task, args=(task_id, req), daemon=True).start()
    return {"task_id": task_id, "status": "started"}

@app.post("/restart_runtime")
def restart_runtime():
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            import gc
            gc.collect()
            torch.cuda.empty_cache()
        return {"status": "success", "message": "Runtime restarted (VRAM cache cleared)"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/call_tool")
def handle_call_tool(req: ToolCallRequest):
    tool, args = req.name, req.arguments
    if tool == "omnivoice_tts":
        text = args.get("text", "")
        voice_name = args.get("voice", "yenai")
        ref_audio_b64 = args.get("ref_audio_base64", None)
        req_obj = AudioAsyncRequest(text=text, ref_audio_name=f"{voice_name}.wav", ref_audio_base64=ref_audio_b64)
        task_id = f"tool_{int(time.time()*1000)}_{os.urandom(3).hex()}"
        run_omnivoice_task(task_id, req_obj)
        result = tasks_db.get(task_id, {})
        if result.get("status") == "done":
            wav_path = os.path.join(OUTPUT_DIR, f"{task_id}.wav")
            with open(wav_path, "rb") as f:
                wav_b64 = base64.b64encode(f.read()).decode("ascii")
            return {"status": "success", "audio_base64": wav_b64, "download_url": result.get("download_url")}
        return {"status": "error", "error": result.get("message", "Xử lý thất bại")}
    elif tool == "execute_code":
        code, lang = args.get("code", ""), args.get("language", "python")
        if lang in ["bash", "shell"]:
            res = subprocess.run(code, shell=True, capture_output=True, text=True, timeout=120)
            return {"stdout": res.stdout, "stderr": res.stderr, "returncode": res.returncode}
        else:
            old_stdout = sys.stdout
            sys.stdout = io.StringIO()
            try:
                exec(code, globals())
                output = sys.stdout.getvalue()
            finally:
                sys.stdout = old_stdout
            return {"stdout": output, "status": "success"}
    elif tool in ["mineru_parse_pdf", "build_faiss_from_pdf"]:
        pdf_b64, filename = args.get("pdf_base64", ""), args.get("filename", "document.pdf")
        try:
            pdf_bytes = base64.b64decode(pdf_b64)
            temp_path = f"/tmp/{filename}"
            with open(temp_path, "wb") as f: f.write(pdf_bytes)
            import pypdf
            reader = pypdf.PdfReader(temp_path)
            extracted = "".join([f"\\n--- [Trang {i+1}] ---\\n" + (p.extract_text() or "") for i, p in enumerate(reader.pages)])
            return {"status": "success", "filename": filename, "total_pages": len(reader.pages), "text": extracted}
        except Exception as e:
            return {"error": str(e), "traceback": traceback.format_exc()}
    elif tool == "restart_runtime":
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        return {"status": "success"}
    return {"error": f"Unknown tool {tool}"}

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
threading.Thread(target=run_server, daemon=True).start()

cmd = "cloudflared tunnel --url http://127.0.0.1:8000"
proc = subprocess.Popen(cmd.split(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
tunnel_url = ""
start = time.time()
while time.time() - start < 30:
    line = proc.stderr.readline()
    if "trycloudflare.com" in line:
        m = re.search(r"https://[a-zA-Z0-9-]+\\.trycloudflare\\.com", line)
        if m:
            tunnel_url = m.group(0)
            break
    time.sleep(0.5)

if tunnel_url:
    print(f"🎉 [ai.type] Tunnel URL: {tunnel_url}")
    gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    try:
        requests.post("http://127.0.0.1:7868/register_tunnel", json={"url": tunnel_url, "gpu": gpu}, timeout=5)
        print("✅ [ai.type] ĐÃ TỰ ĐỘNG BẮT TAY KẾT NỐI VỚI APP AI.TYPE THÀNH CÔNG!")
    except Exception as e:
        print("⚠️ Chưa gửi được tới local daemon:", e)
`;
                // Sao chép code vào clipboard máy chủ trước
                try {
                    navigator.clipboard.writeText(pyCode);
                } catch (e) {}

                const safePyCode = pyCode
                    .replace(/\\/g, '\\\\')
                    .replace(/`/g, '\\`')
                    .replace(/\$/g, '\\$');

                const injectColabScript = () => {
                    webview.executeJavaScript(`
                        (() => {
                            const code = \`${safePyCode}\`;
                            
                            const notify = (msg, isSuccess = false) => {
                                let el = document.getElementById('aitype-colab-toast');
                                if (!el) {
                                    el = document.createElement('div');
                                    el.id = 'aitype-colab-toast';
                                    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#0f172a;color:#38bdf8;padding:12px 24px;border-radius:12px;font-family:sans-serif;font-size:14px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,0.6);border:1.5px solid #38bdf8;z-index:9999999;transition:all 0.3s ease;text-align:center;';
                                    document.body.appendChild(el);
                                }
                                el.style.borderColor = isSuccess ? '#10b981' : '#38bdf8';
                                el.style.color = isSuccess ? '#34d399' : '#38bdf8';
                                el.innerHTML = msg;
                            };

                            notify('🚀 [ai.type] Đang kết nối với Colab & nạp mã GPU Bridge...');

                            let attempts = 0;
                            const interval = setInterval(() => {
                                attempts++;
                                let injected = false;

                                // Cách 1: Monaco Models
                                try {
                                    if (window.monaco && window.monaco.editor) {
                                        const models = window.monaco.editor.getModels();
                                        if (models && models.length > 0) {
                                            models[0].setValue(code);
                                            injected = true;
                                        }
                                    }
                                } catch(e) {}

                                // Cách 2: Textarea / Colab Editor DOM
                                if (!injected) {
                                    const textarea = document.querySelector('textarea.inputarea') || 
                                                     document.querySelector('colab-editor textarea') ||
                                                     document.querySelector('.cell.code textarea');
                                    if (textarea) {
                                        textarea.focus();
                                        document.execCommand('selectAll', false, null);
                                        document.execCommand('insertText', false, code);
                                        injected = true;
                                    }
                                }

                                if (injected) {
                                    clearInterval(interval);
                                    notify('⏳ Đang tự động bấm nút Chạy (Run)...');

                                    setTimeout(() => {
                                        let clicked = false;
                                        
                                        // Thử click nút Play của Cell
                                        const runComponent = document.querySelector('colab-run-button');
                                        if (runComponent) {
                                            const innerBtn = runComponent.shadowRoot ? runComponent.shadowRoot.querySelector('button') : null;
                                            if (innerBtn) {
                                                innerBtn.click();
                                                clicked = true;
                                            } else {
                                                runComponent.click();
                                                clicked = true;
                                            }
                                        }

                                        // Thử click menu Runtime -> Run All
                                        if (!clicked) {
                                            const runtimeMenu = document.querySelector('#runtime-menu-button');
                                            if (runtimeMenu) {
                                                runtimeMenu.click();
                                                setTimeout(() => {
                                                    const runAllMenuItem = document.querySelector('div[command="runall"]') || document.querySelector('colab-menu-item[command="runall"]');
                                                    if (runAllMenuItem) runAllMenuItem.click();
                                                }, 200);
                                                clicked = true;
                                            }
                                        }

                                        // Fallback Ctrl + Enter
                                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true }));

                                        notify('✅ [ai.type] Đã kích hoạt chạy GPU Bridge! Đang kết nối về App...', true);
                                        setTimeout(() => {
                                            const el = document.getElementById('aitype-colab-toast');
                                            if (el) el.style.opacity = '0';
                                        }, 8000);
                                    }, 1000);
                                    return;
                                }

                                if (attempts > 35) {
                                    clearInterval(interval);
                                    notify('ℹ️ [ai.type] Mã đã được Copy! Bạn chỉ cần bấm <b>Ctrl + V</b> và bấm <b>Play (▶)</b> nhé.');
                                }
                            }, 800);
                        })();
                    `);
                };

                webview.loadURL(targetUrl);
                webview.addEventListener(
                    'did-stop-loading',
                    function handler() {
                        webview.removeEventListener(
                            'did-stop-loading',
                            handler,
                        );
                        setTimeout(() => injectColabScript(), 2000);
                    },
                );
            }
        });

        // Lắng nghe sự kiện thu âm hệ thống
        window.addEventListener('start-recording', (e: any) => {
            this.startRecordingSystemAudio();
        });
    }

    isRecordingSystemAudio: boolean = false;
    mediaRecorder: any = null;

    setRecordingState(state: boolean) {
        this.isRecordingSystemAudio = state;
        window.dispatchEvent(
            new CustomEvent('recording-state-changed', { detail: state }),
        );
    }

    showMessage(
        title: string,
        message: string,
        iconName: string = 'feather:info',
        color: string = 'primary',
    ) {
        if (this.dialogRef) this._fuseConfirmationService.close();

        this.dialogRef = this._fuseConfirmationService.open({
            title: title,
            message: message,
            icon: {
                show: true,
                name: iconName,
                color: color as any,
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'primary',
                },
                cancel: {
                    show: false,
                    label: '',
                },
            },
            dismissible: true,
        });
    }

    async startRecordingSystemAudio() {
        // Tự động chuyển sang màn hình AI Writer
        this.router.navigate(['/ai-writer']);

        if (this.isRecordingSystemAudio && this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.setRecordingState(false);
            return;
        }

        try {
            const isElectron = !!(window as any).electron?.invoke;

            let stream: MediaStream;

            if (isElectron) {
                // Khởi tạo file ghi âm mới trên backend Desktop
                await (window as any).electron.invoke('init-system-audio');

                // Lấy danh sách các màn hình/cửa sổ đang mở
                const sources = await (window as any).electron.invoke(
                    'desktop-capturer-get-sources',
                    { types: ['window', 'screen'] },
                );

                const mainScreen = sources.find((s: any) =>
                    s.id.startsWith('screen:'),
                );

                if (!mainScreen) {
                    console.error('Không tìm thấy màn hình.');
                    return;
                }

                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: mainScreen.id,
                        },
                    } as any,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: mainScreen.id,
                        },
                    } as any,
                });
            } else {
                // Môi trường iPad / Mobile / Web browser: Yêu cầu quyền Microphone chuẩn
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false,
                });
            }

            // Lọc bỏ hình ảnh nếu có, chỉ giữ lại kênh âm thanh
            const audioTrack = stream.getAudioTracks()[0];
            const audioStream = new MediaStream([audioTrack]);

            // Xác định mimeType phù hợp nhất của thiết bị
            let options: MediaRecorderOptions = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                options = { mimeType: 'audio/aac' };
            }

            this.mediaRecorder = new MediaRecorder(audioStream, options);
            const audioChunks: Blob[] = [];

            this.mediaRecorder.ondataavailable = (e: any) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                this.toastr.info(
                    'Hệ thống đang dịch âm thanh thành văn bản...',
                    'Đang xử lý',
                );

                try {
                    const actualMime = options.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunks, { type: actualMime });

                    if (isElectron) {
                        const arrayBuffer = await audioBlob.arrayBuffer();
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const savedAudioPath = await (
                            window as any
                        ).electron.invoke('save-system-audio', uint8Array);

                        const settings = getSettings();
                        const secretKeyStr = settings?.secretKey || '';
                        const secretKeys = secretKeyStr
                            ? secretKeyStr.split(';')
                            : [];
                        const geminiKey =
                            secretKeys.length > 1
                                ? secretKeys[1]
                                : secretKeys[0] || '';

                        if (geminiKey) {
                            const text = await (window as any).electron.invoke(
                                'transcribe-system-audio',
                                { apiKey: geminiKey, audioPath: savedAudioPath },
                            );
                            if (text) {
                                window.dispatchEvent(
                                    new CustomEvent('stt-transcribed', {
                                        detail: text,
                                    }),
                                );
                            }
                        } else {
                            this.toastr.warning(
                                'Chưa cấu hình API Key của Gemini trong Cài đặt',
                                'Lỗi cấu hình',
                            );
                        }
                    } else {
                        // iPad / Mobile / Web browser: Chuyển Blob thành base64 và gửi trực tiếp cho Gemini
                        const base64Audio = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const b64 = (reader.result as string).split(',')[1];
                                resolve(b64);
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(audioBlob);
                        });

                        const res: any = await this._genaiService.generateContent({
                            model: 'gemini-3.8-flash',
                            contents: [
                                {
                                    role: 'user',
                                    parts: [
                                        {
                                            inlineData: {
                                                mimeType: actualMime,
                                                data: base64Audio,
                                            },
                                        },
                                        {
                                            text: 'Hãy chép lại chính xác từng lời nói trong đoạn âm thanh này sang văn bản tiếng Việt. Chỉ trả về nội dung lời nói, không giải thích gì thêm.',
                                        },
                                    ],
                                },
                            ],
                        });

                        const transcribedText =
                            res?.text ||
                            res?.candidates?.[0]?.content?.parts?.[0]?.text ||
                            '';

                        if (transcribedText) {
                            window.dispatchEvent(
                                new CustomEvent('stt-transcribed', {
                                    detail: transcribedText.trim(),
                                }),
                            );
                        } else {
                            this.toastr.warning(
                                'Không nhận diện được giọng nói trong đoạn thu âm.',
                            );
                        }
                    }
                } catch (e) {
                    console.error('Lỗi xử lý file hoặc dịch STT:', e);
                    this.toastr.error(
                        'Có lỗi xảy ra khi dịch âm thanh.',
                        'Lỗi phân tích',
                    );
                }

                // Tắt luồng mic
                stream.getTracks().forEach((track: any) => track.stop());
            };

            // Bắt đầu ghi âm
            this.setRecordingState(true);
            this.mediaRecorder.start(1000);
            this.toastr.info(
                'Đang ghi âm qua Microphone. Bấm lại nút Micro để kết thúc và chép lời.',
                'Bắt đầu ghi âm',
            );
        } catch (err: any) {
            console.error('Lỗi thu âm:', err);
            this.setRecordingState(false);
            if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
                this.toastr.error(
                    'Quyền truy cập Microphone bị từ chối. Vui lòng cho phép quyền trong Cài đặt Safari/Thiết bị.',
                    'Quyền truy cập',
                );
            } else {
                this.toastr.error(
                    'Không thể khởi động ghi âm. Vui lòng kiểm tra quyền truy cập Microphone.',
                    'Lỗi hệ thống',
                );
            }
        }
    }

    ngAfterViewInit() {
        // Khởi tạo thẻ webview bằng Javascript nguyên thuỷ (Native DOM) để không bị xích mích với Compiler của Angular
        setTimeout(() => {
            const container = document.getElementById('webview-container-div');
            if (container) {
                const webview = document.createElement('webview');
                webview.setAttribute('data-tool-id', '1'); // Gắn ID mặc định cho Gemini
                // Tách phân vùng riêng để không ảnh hưởng cookie của toàn app
                webview.setAttribute('partition', 'persist:gemini-webview');
                webview.setAttribute(
                    'src',
                    'https://gemini.google.com/app?hl=vi',
                );
                webview.setAttribute('allowpopups', 'true');
                webview.setAttribute('plugins', 'true');
                webview.setAttribute(
                    'webpreferences',
                    'plugins=yes, autoplayPolicy=no-user-gesture-required',
                );
                webview.setAttribute(
                    'allow',
                    'encrypted-media; autoplay; fullscreen; picture-in-picture; clipboard-read; clipboard-write; microphone; camera; geolocation; midi',
                );
                // Không ghi đè thuộc tính useragent bằng navigator.userAgent của Electron
                // để webview kế thừa nguyên vẹn User-Agent của Chrome thật từ partition persist:gemini-webview

                webview.style.width = '100%';
                webview.style.height = '100%';
                webview.style.border = 'none';
                webview.style.display = 'flex';
                webview.style.flex = '1';
                webview.style.opacity = '0';
                webview.style.transition = 'opacity 0.2s ease-in-out';

                // Fallback hiển thị sau 1s nếu dom-ready quá lâu
                setTimeout(() => {
                    webview.style.opacity = '1';
                }, 1000);

                webview.addEventListener('console-message', (e: any) => {
                    console.log(
                        `[Webview Console] level ${e.level}: ${e.message}`,
                    );
                });

                webview.addEventListener('dom-ready', () => {
                    // Inject CSS để làm đẹp thanh cuộn cho webview (dark theme phù hợp với Gemini)
                    const scrollbarCSS = `
                        ::-webkit-scrollbar {
                            width: 6px;
                            height: 6px;
                        }
                        ::-webkit-scrollbar-track {
                            background: transparent;
                        }
                        ::-webkit-scrollbar-thumb {
                            background: rgba(255, 255, 255, 0.2);
                            border-radius: 10px;
                        }
                        ::-webkit-scrollbar-thumb:hover {
                            background: rgba(255, 255, 255, 0.4);
                        }
                    `;
                    try {
                        (webview as any).insertCSS(scrollbarCSS);
                    } catch (e) {
                        console.warn('Không thể inject CSS vào webview:', e);
                    }

                    // Hiện webview sau khi đã tiêm CSS
                    setTimeout(() => {
                        webview.style.opacity = '1';
                    }, 50);
                });

                container.appendChild(webview);

                const electronApi = (window as any).electron;
                if (electronApi?.onGoogleAuthSynced) {
                    electronApi.onGoogleAuthSynced(() => {
                        container.querySelectorAll('webview').forEach((wv: any) => {
                            try {
                                if (wv.reloadIgnoringCache) {
                                    wv.reloadIgnoringCache();
                                } else if (wv.reload) {
                                    wv.reload();
                                }
                            } catch (e) {}
                        });
                    });
                }

                // Xử lý chống lag mượt mà khi kéo viền (resize) hoặc kéo thanh tiêu đề (drag)
                const popupEl = document.querySelector(
                    '.gemini-popup',
                ) as HTMLElement;
                if (popupEl) {
                    // Giữ mousedown chung để tắt pointer-events khi kéo thanh tiêu đề
                    popupEl.addEventListener('mousedown', () => {
                        webview.style.pointerEvents = 'none';
                    });

                    // Logic Custom Resize bắt theo chuỗi sự kiện chuột toàn cục
                    const resizeHandle = document.querySelector(
                        '.gemini-resize-handle',
                    ) as HTMLElement;
                    if (resizeHandle) {
                        let isResizing = false;
                        let startX = 0;
                        let startY = 0;
                        let startWidth = 0;
                        let startHeight = 0;

                        resizeHandle.addEventListener(
                            'mousedown',
                            (e: MouseEvent) => {
                                isResizing = true;
                                startX = e.clientX;
                                startY = e.clientY;
                                startWidth = popupEl.offsetWidth;
                                startHeight = popupEl.offsetHeight;

                                webview.style.pointerEvents = 'none';
                                document.body.style.cursor = 'nwse-resize';
                                document.body.style.userSelect = 'none'; // Ngăn bôi đen chữ khi kéo nhanh

                                e.preventDefault();
                                e.stopPropagation();
                            },
                        );

                        window.addEventListener(
                            'mousemove',
                            (e: MouseEvent) => {
                                if (!isResizing) return;

                                const newWidth = Math.max(
                                    300,
                                    startWidth + (e.clientX - startX),
                                );
                                const newHeight = Math.max(
                                    400,
                                    startHeight + (e.clientY - startY),
                                );

                                popupEl.style.width = newWidth + 'px';
                                popupEl.style.height = newHeight + 'px';
                            },
                        );

                        window.addEventListener('mouseup', () => {
                            if (isResizing) {
                                isResizing = false;
                                document.body.style.cursor = '';
                                document.body.style.userSelect = '';
                            }
                        });
                    }
                }
                window.addEventListener('mouseup', () => {
                    webview.style.pointerEvents = 'auto';
                });
            }
        }, 500); // Đợi DOM sẵn sàng chút xíu
    }

    private _verifyPurchasedGroupMembership(force = false, minCooldownMs = 10000): void {
        const activeUser = this._userService.user;
        if (!activeUser || (!activeUser.id && !activeUser.name && !activeUser.email)) {
            return;
        }
        if (this._isCheckingPurchasedGroup || this._isForcingGroupLogout) {
            return;
        }
        const currentUrl = this.router.url || '';
        if (
            currentUrl.startsWith('/sign-in') ||
            currentUrl.startsWith('/sign-out') ||
            currentUrl.startsWith('/sign-up')
        ) {
            return;
        }
        if (!force && this._userService.isGroupsSyncedRecently(activeUser, minCooldownMs)) {
            return;
        }

        const expectedUserId = String(activeUser.id ?? '');
        const expectedUserEmail = String(activeUser.email || '').trim().toLowerCase();
        const server = activeUser.server || 'vn.s3';
        this._isCheckingPurchasedGroup = true;

        this._forumService
            .getGroups(server)
            .pipe(take(1), timeout(25000), takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    this._isCheckingPurchasedGroup = false;
                    const currentUser = this._userService.user;
                    if (!currentUser) return;
                    if (
                        (expectedUserId && String(currentUser.id ?? '') !== expectedUserId) ||
                        (expectedUserEmail && String(currentUser.email || '').trim().toLowerCase() !== expectedUserEmail)
                    ) {
                        return;
                    }

                    if (
                        result &&
                        result.success &&
                        result.data &&
                        this._userService.hasPurchasedGroupDefinition(result.data.groups)
                    ) {
                        this._userService.markGroupsSynced(currentUser);
                        const purchasedGroup = result.data.groups.find((g: any) =>
                            this._userService.hasPurchasedGroupDefinition([g]),
                        );
                        if (purchasedGroup?.members) {
                            this.multiAccountService.setItem('members', purchasedGroup.members);
                        }

                        const freshGroups = this._userService.extractGroupsFromForumResponse(
                            currentUser,
                            result.data.groups,
                        );
                        const updatedUser: User = { ...currentUser, groups: freshGroups };

                        if (!this._userService.hasPurchasedGroup(updatedUser)) {
                            console.warn(
                                '[Auth] Tài khoản không còn trong nhóm "nhóm-đã-mua-ai-type", tự động đăng xuất:',
                                currentUser.name || currentUser.email,
                            );
                            this._forceLogoutMissingPurchasedGroup(
                                updatedUser,
                                'Tài khoản của bạn không còn thuộc nhóm "nhóm-đã-mua-ai-type" nên đã tự động đăng xuất.',
                            );
                            return;
                        }

                        const prevKey = JSON.stringify([...(currentUser.groups || [])].sort());
                        const nextKey = JSON.stringify([...freshGroups].sort());
                        if (prevKey !== nextKey) {
                            const updatedToken = AuthUtils._generateJWTToken(updatedUser);
                            this._authService.accessToken = updatedToken;
                            this._userService.user = updatedUser;
                            this.multiAccountService.setItem('user', updatedUser);
                            if (updatedUser.email) {
                                this.multiAccountService.saveAccount(updatedUser.email, {
                                    user: updatedUser,
                                    profile: updatedUser,
                                    accessToken: updatedToken,
                                });
                            }
                        }
                    }
                },
                error: () => {
                    this._isCheckingPurchasedGroup = false;
                },
            });
    }

    private _forceLogoutMissingPurchasedGroup(userSnapshot?: User | null, reason?: string): void {
        if (this._isForcingGroupLogout) {
            return;
        }
        this._isForcingGroupLogout = true;
        this._lastGroupCheckedUserKey = '';

        const targetUser = userSnapshot || this._userService.user;
        const doSignOutAndRedirect = () => {
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (_) {}

            this._authService
                .signOut()
                .pipe(take(1))
                .subscribe({
                    next: () => {
                        this._finishForcedLogoutRedirect(reason);
                    },
                    error: () => {
                        this._finishForcedLogoutRedirect(reason);
                    },
                });
        };

        // Cập nhật cache nhóm mới nhất (không còn "nhóm-đã-mua-ai-type") vào danh sách tài khoản đã lưu trước khi xóa phiên active
        if (targetUser?.email) {
            const cleanUser = {
                ...targetUser,
                groups: (targetUser.groups || []).filter(
                    (g) => String(g || '').normalize('NFC').trim().toLowerCase() !== UserService.PURCHASED_GROUP_SLUG,
                ),
            };
            this.multiAccountService
                .saveAccount(targetUser.email, { user: cleanUser, profile: cleanUser, accessToken: null })
                .then(() => this.multiAccountService.forceSave())
                .then(() => doSignOutAndRedirect())
                .catch(() => doSignOutAndRedirect());
        } else {
            doSignOutAndRedirect();
        }
    }

    private _finishForcedLogoutRedirect(reason?: string): void {
        this.ngZone.run(() => {
            this.toastr.warning(
                reason ||
                    'Tài khoản của bạn không còn thuộc nhóm "nhóm-đã-mua-ai-type" nên đã tự động đăng xuất.',
                'Phiên đăng nhập kết thúc',
                { timeOut: 6000 },
            );
            this.router
                .navigate(['/sign-in'], {
                    queryParams: { reason: 'missing_purchased_group' },
                    replaceUrl: true,
                })
                .finally(() => {
                    setTimeout(() => {
                        this._isForcingGroupLogout = false;
                    }, 1200);
                });
        });
    }

    ngOnDestroy() {
        // 3. QUAN TRỌNG: Xóa timer khi component bị hủy để tránh rò rỉ bộ nhớ (memory leak)
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        if (this._groupCheckIntervalId) {
            clearInterval(this._groupCheckIntervalId);
        }
        window.removeEventListener('focus', this._onWindowFocusOrOnline);
        window.removeEventListener('online', this._onWindowFocusOrOnline);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        // đóng trước khi mở
        if (this.dialogRef) this._fuseConfirmationService.close();

        this.dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message
                ? message
                : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn',
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại',
                },
            },
            dismissible: false,
        });

        // Subscribe to afterClosed from the dialog reference
        this.dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/settings'], {
                queryParams: { tab: 'active' },
            });
        });
    }
}
