import { Component, OnDestroy, OnInit, signal, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { DeviceUUID } from "device-uuid";
import { UserService } from './core/user/user.service';
import { Subject, takeUntil } from 'rxjs';
import { User } from './core/user/user.types';
import { MatDialog } from '@angular/material/dialog';
import { MultiAccountService } from './modules/_services/multi-account.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
    user: User;
    uuid = new DeviceUUID().get();

    checkActiveInfo = false;
    dialogRef: any;

    // Biến để lưu ID của timer giúp dọn dẹp sau này
    private intervalId: any;

    // 5 phút kiểm tra một lần
    private readonly ONE_HOUR_MS = 1000 * 60 * 5;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // ===== UI Split-Pane State =====
    // 3 mức snap: 100 (ẩn webview), 75 (1/4 webview), 50 (2/4 webview)
    leftPaneWidth: number = 100; // Mặc định ẩn webview
    isDragging: boolean = false;
    private dragStartX: number = 0;

    get isWebviewVisible(): boolean {
        return this.leftPaneWidth < 100;
    }

    startDragging(event: MouseEvent) {
        this.isDragging = true;
        this.dragStartX = event.clientX;
        event.preventDefault();
    }

    stopDragging() {
        if (this.isDragging) {
            this.isDragging = false;
            // Snap vào mức gần nhất: 50%, 75%, 100%
            this.snapToNearest();
        }
    }

    onDrag(event: MouseEvent) {
        if (!this.isDragging) return;
        const newWidth = (event.clientX / window.innerWidth) * 100;
        // Cho phép kéo tự do trong khoảng 40-100
        if (newWidth >= 40 && newWidth <= 100) {
            this.leftPaneWidth = newWidth;
            this.updateRootCssVar();
        }
    }

    // Đồng bộ CSS variable lên :root để cdk-overlay-container (nằm ở body) đọc được
    private updateRootCssVar() {
        document.documentElement.style.setProperty('--main-pane-width', this.leftPaneWidth + 'vw');
    }

    private snapToNearest() {
        // Snap vào mức gần nhất
        const snapPoints = [50, 75, 100];
        let closest = snapPoints[0];
        let minDist = Math.abs(this.leftPaneWidth - closest);
        for (const point of snapPoints) {
            const dist = Math.abs(this.leftPaneWidth - point);
            if (dist < minDist) {
                minDist = dist;
                closest = point;
            }
        }
        this.leftPaneWidth = closest;
        this.updateRootCssVar();
    }

    // Toggle webview: ẩn/hiện nhanh
    toggleWebview() {
        if (this.leftPaneWidth >= 100) {
            this.leftPaneWidth = 75;
        } else {
            this.leftPaneWidth = 100;
        }
        this.updateRootCssVar();
    }

    // Xoá toàn bộ cookie và làm mới webview
    async clearWebviewCookie() {
        try {
            const electron = (window as any).electron;
            if (electron?.clearAllCookies) {
                await electron.clearAllCookies();
            } else if (electron?.clearGoogleCookies) {
                await electron.clearGoogleCookies();
            }

            // Clear trên webview DOM
            const container = document.getElementById('webview-container-div');
            if (container) {
                const webview = container.querySelector('webview') as any;
                if (webview && webview.clearData) {
                    await webview.clearData({ datatypes: ['cookies', 'storages', 'caches', 'serviceworkers'] });
                    console.log('Webview data cleared.');
                }
                if (webview?.reloadIgnoringCache) {
                    webview.loadURL('https://labs.google/fx/vi/tools/flow');
                }
            }
        } catch (err) {
            console.error('Lỗi xoá toàn bộ cookie:', err);
        }
    }
    // ===============================

    updateTime(): void {
        let activeInfo = this.multiAccountService.getItem('active_info');

        if (activeInfo && activeInfo != 'null' && activeInfo != 'undefined') {
            const isLicenseKeyExpired = AuthUtils.isLicenseKeyExpired(activeInfo);
            // this.checkActiveInfo = AuthUtils._verifyActiveInfo(activeInfo, this.uuid);

            if (isLicenseKeyExpired === true) {
                this.error('Phần mềm của bạn đã hết hạn.');

                this.router.navigate(['/settings'], {
                    queryParams: {
                        tab: 'active'
                    }
                });
            } else {
                // Phần mềm đã được kích hoạt
                if (this.intervalId) {
                    clearInterval(this.intervalId);
                }
            }
        } else {
            this.error('Bạn chưa kích hoạt phần mềm.');
        }
    }

    /**
     * Constructor
     */
    constructor(
        private _userService: UserService,
        private _fuseConfirmationService: FuseConfirmationService,
        public dialog: MatDialog,
        private router: Router,
        private multiAccountService: MultiAccountService
    ) {
        // kiểm tra settings và khởi tạo
        this.multiAccountService.loadActiveAccount().then(data => {
            const groups = data.user?.groups;
            if (groups && groups.length === 0) {
                this.multiAccountService.clearCurrentAccountData();
            }
        });

        let settings: any = this.multiAccountService.getItem('settings');
        if (!settings || settings == 'undefined') {
            settings = {
                saveimages: false,
                statusTypeLite: false,
                autosave: true,
                closethread: true,
                proccessing: false,
                linkDonate: null,
                language: 'vi',
                secretKey: null,
                defaultlinks: null,
                port: 12345,
                styles: [],
                typelite_plugin: 'http://localhost:12345', // Type Lite Plugin
                downloader_plugin: 'http://localhost:12345', // Downloader Plugin
                tts: '', // Text to Speech Plugin
                sst: '', // Speech to Text Plugin
                mxhauto: '', // MXH tự động Plugin
                chatbot: '', // Chatbot Api
                bigdata: '', // Big Data Plugin
                customer: '', // Device Token Api
                searchAPIKey: '', // API key for search functionality
                n8n: '', // API key for n8n functionality
            };

            this.multiAccountService.setItem('settings', settings);
        }
    }

    ngOnInit() {
        // Set CSS variable ban đầu cho cdk-overlay-container
        this.updateRootCssVar();

        // 2. Thiết lập bộ đếm (Timer)
        this.intervalId = setInterval(() => {
            this.updateTime();
        }, this.ONE_HOUR_MS);

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngAfterViewInit() {
        // Khởi tạo thẻ webview bằng Javascript nguyên thuỷ (Native DOM) để không bị xích mích với Compiler của Angular
        setTimeout(() => {
            const container = document.getElementById('webview-container-div');
            if (container) {
                const webview = document.createElement('webview');
                webview.setAttribute('src', 'https://labs.google/fx/vi/tools/flow');
                webview.setAttribute('allowpopups', 'true');

                webview.style.width = '100%';
                webview.style.height = '100%';
                webview.style.border = 'none';
                webview.style.display = 'flex';
                webview.style.flex = '1';

                container.appendChild(webview);
            }
        }, 500); // Đợi DOM sẵn sàng chút xíu
    }

    ngOnDestroy() {
        // 3. QUAN TRỌNG: Xóa timer khi component bị hủy để tránh rò rỉ bộ nhớ (memory leak)
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    error(message?: string) {
        // đóng trước khi mở
        if (this.dialogRef) this._fuseConfirmationService.close();

        this.dialogRef = this._fuseConfirmationService.open({
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
        this.dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/settings']);
        });
    }
}