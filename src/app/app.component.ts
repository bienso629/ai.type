import { Component, OnDestroy, OnInit, signal, AfterViewInit, ChangeDetectorRef } from '@angular/core';
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

            // Chỉ clear phần auth của Puppeteer, không clear cookie toàn app
            if (electron?.clearWebviewAuth) {
                await electron.clearWebviewAuth();
            }

            // Clear trên webview DOM
            const container = document.getElementById('webview-container-div');
            if (container) {
                // Find the currently visible webview
                const activeWebview = Array.from(container.querySelectorAll('webview')).find((wv: any) => wv.style.display !== 'none') as any || container.querySelector('webview') as any;

                if (activeWebview && activeWebview.clearData) {
                    await activeWebview.clearData({ dataTypes: ['cookies', 'storages', 'caches', 'serviceworkers'] });
                    console.log('Webview data cleared.');
                }

                // Tải lại các webview
                const webviews = container.querySelectorAll('webview');
                webviews.forEach((wv: any) => {
                    if (wv.reload) {
                        wv.reload();
                    }
                });
            }
        } catch (err) {
            console.error('Lỗi xoá toàn bộ cookie:', err);
        }
    }

    // Mở trang đăng nhập Google
    openLoginBrowser() {
        const container = document.getElementById('webview-container-div');
        if (container) {
            const activeWebview = Array.from(container.querySelectorAll('webview')).find((wv: any) => wv.style.display !== 'none') as any || container.querySelector('webview') as any;
            if (activeWebview && activeWebview.executeJavaScript) {
                activeWebview.executeJavaScript("window.location.href = 'https://gemini.google.com/trigger-stealth-login';");
            }
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
        private multiAccountService: MultiAccountService,
        private cdr: ChangeDetectorRef
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
        // this.intervalId = setInterval(() => {
        //     this.updateTime();
        // }, this.ONE_HOUR_MS);

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Lắng nghe sự kiện toggle webview từ main.js qua phím tắt
        if ((window as any).electron) {
            (window as any).electron.onToolsResponse((data: any) => {
                if (data && data.action === 'toggle-gemini-webview') {
                    this.toggleWebview();
                    this.cdr.detectChanges();
                }
            });
        }

        // Lắng nghe sự kiện qua DOM event từ chuỗi button bên Layout
        window.addEventListener('toggle-gemini', (e: any) => {
            if (e && e.detail && e.detail.forceOpen) {
                this.leftPaneWidth = 75;
                this.updateRootCssVar();
            } else {
                this.toggleWebview();
            }
            this.cdr.detectChanges();
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
        window.dispatchEvent(new CustomEvent('recording-state-changed', { detail: state }));
    }

    showMessage(title: string, message: string, iconName: string = 'feather:info', color: string = 'primary') {
        if (this.dialogRef) this._fuseConfirmationService.close();

        this.dialogRef = this._fuseConfirmationService.open({
            title: title,
            message: message,
            icon: {
                show: true,
                name: iconName,
                color: color as any
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'primary'
                },
                cancel: {
                    show: false,
                    label: ''
                }
            },
            dismissible: true
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
            // Khởi tạo file ghi âm mới trên backend
            await (window as any).electron.invoke('init-system-audio');

            // Lấy danh sách các màn hình/cửa sổ đang mở
            const sources = await (window as any).electron.invoke('desktop-capturer-get-sources', { types: ['window', 'screen'] });
            
            // Lấy màn hình đầu tiên (thường là màn hình chính)
            const mainScreen = sources.find((s: any) => s.id.startsWith('screen:'));
            
            if (!mainScreen) {
                console.error('Không tìm thấy màn hình.');
                return;
            }

            // Yêu cầu quyền truy cập Audio/Video từ Hệ Điều Hành
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: mainScreen.id
                    }
                } as any,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: mainScreen.id
                    }
                } as any // Bắt buộc phải có cả video thì API desktop capture mới nhả audio
            });

            // Lọc bỏ hình ảnh, chỉ giữ lại kênh âm thanh
            const audioTrack = stream.getAudioTracks()[0];
            const audioStream = new MediaStream([audioTrack]);

            // Khởi tạo bộ ghi âm
            this.mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
            const audioChunks: Blob[] = [];
            
            this.mediaRecorder.ondataavailable = (e: any) => {
                if (e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                this.showMessage('Đang xử lý âm thanh', 'Hệ thống đang dùng Gemini để dịch âm thanh thành văn bản. Quá trình này có thể mất vài chục giây, vui lòng đợi!', 'feather:loader', 'primary');
                
                try {
                    // Gộp tất cả chunk thành 1 cục Blob duy nhất
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);

                    // Gửi MỘT LẦN duy nhất xuống main.js và nhận lại đường dẫn file
                    const savedAudioPath = await (window as any).electron.invoke('save-system-audio', uint8Array);

                    // Lấy API key từ settings
                    const settings = this.multiAccountService.getItem('settings');
                    const secretKeyStr = settings?.secretKey || '';
                    const secretKeys = secretKeyStr ? secretKeyStr.split(';') : [];
                    const geminiKey = secretKeys.length > 1 ? secretKeys[1] : (secretKeys[0] || '');

                    if (geminiKey) {
                        const text = await (window as any).electron.invoke('transcribe-system-audio', { apiKey: geminiKey, audioPath: savedAudioPath });
                        if (text) {
                            window.dispatchEvent(new CustomEvent('stt-transcribed', { detail: text }));
                            this.showMessage('Thành công!', 'Đã xử lý xong văn bản và tự động chèn vào khung soạn thảo.', 'feather:check-circle', 'success');
                        }
                    } else {
                        this.showMessage('Lỗi cấu hình', 'Chưa cấu hình API Key của Gemini trong Cài đặt', 'feather:alert-triangle', 'warn');
                    }
                } catch (e) {
                    console.error('Lỗi xử lý file hoặc dịch STT:', e);
                    this.showMessage('Lỗi phân tích', 'Có lỗi xảy ra khi nhờ Gemini dịch âm thanh. Vui lòng thử lại sau.', 'feather:x-circle', 'error');
                }

                // Tắt luồng mic/loa
                stream.getTracks().forEach((track: any) => track.stop());
            };
            
            // Cắt nhỏ file âm thanh mỗi 1000ms (1 giây) nhưng chỉ lưu vào mảng
            this.setRecordingState(true);
            this.mediaRecorder.start(1000); 
            this.showMessage('Bắt đầu ghi âm', 'Hệ thống đang ghi âm mọi âm thanh phát ra. Bạn có thể lướt xem TikTok hoặc YouTube. Khi xong, hãy bấm lại nút Micro để kết thúc và xuất chữ!', 'feather:mic', 'primary');
            
        } catch (err) {
            console.error('Lỗi thu âm hệ thống:', err);
            this.setRecordingState(false);
            this.showMessage('Lỗi hệ thống', 'Không thể khởi động ghi âm. Vui lòng kiểm tra quyền truy cập hoặc thử lại.', 'feather:x-circle', 'error');
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
                webview.setAttribute('src', 'https://gemini.google.com/app?hl=vi');
                webview.setAttribute('allowpopups', 'true');
                // Sử dụng User Agent gốc từ Electron main process (đã được lọc sạch) để tránh mismatch Client Hints
                webview.setAttribute('useragent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

                webview.style.width = '100%';
                webview.style.height = '100%';
                webview.style.border = 'none';
                webview.style.display = 'flex';
                webview.style.flex = '1';

                webview.addEventListener('console-message', (e: any) => {
                    console.log(`[Webview Console] level ${e.level}: ${e.message}`);
                });

                webview.addEventListener('dom-ready', () => {
                    // Mở devtools để dễ debug lỗi Đang tải
                    // webview.openDevTools();
                });

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