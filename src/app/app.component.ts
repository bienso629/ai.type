import { Component, OnDestroy, OnInit, signal, AfterViewInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { DeviceUUID } from "device-uuid";
import { UserService } from './core/user/user.service';
import { Subject, takeUntil } from 'rxjs';
import { User } from './core/user/user.types';
import { MatDialog } from '@angular/material/dialog';
import { MultiAccountService } from './modules/_services/multi-account.service';
import { ToastrService } from 'ngx-toastr';

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

    // ===== UI Gemini Popup State =====
    isWebviewVisible = false;
    popupTitle = 'Mở rộng';
    popupFavicon = '';
    isDraggingWebview = false;
    isResizingWebview = false;
    private resizeObserver: ResizeObserver | null = null;
    private resizeTimeout: any;

    // Toggle webview: ẩn/hiện nhanh
    toggleWebview() {
        this.isWebviewVisible = !this.isWebviewVisible;
    }

    // Nút quay lại trang trước trong webview
    webviewGoBack() {
        const webview: any = document.querySelector('#webview-container-div webview');
        if (webview && typeof webview.goBack === 'function' && webview.canGoBack()) {
            webview.goBack();
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
        private cdr: ChangeDetectorRef,
        private toastr: ToastrService,
        private ngZone: NgZone
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

        const popupEl = document.querySelector('.gemini-popup');
        if (popupEl) {
            this.resizeObserver = new ResizeObserver(() => {
                if (!this.isResizingWebview && this.isWebviewVisible) {
                    this.isResizingWebview = true;
                    // Kích hoạt change detection nếu cần (nhưng ngZone.run sẽ làm việc này)
                    this.ngZone.run(() => {}); 
                }
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout = setTimeout(() => {
                    this.ngZone.run(() => {
                        this.isResizingWebview = false;
                    });
                }, 250); // Hết kéo 250ms thì bỏ overlay
            });
            this.resizeObserver.observe(popupEl);
        }
    }

    ngOnInit() {
        // Xoá CSS variable gây lỗi co rút các Dialog của Angular Material (luôn set 100vw)
        document.documentElement.style.setProperty('--main-pane-width', '100vw');

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
                this.isWebviewVisible = true;
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

                const webview: any = document.querySelector('#webview-container-div webview');
                if (webview) {
                    const url = 'https://labs.google/fx/tools/flow';
                    const currentUrl = webview.getURL();
                    
                    const injectScript = () => {
                        const safePrompt = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
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
                        webview.addEventListener('did-stop-loading', function handler() {
                            webview.removeEventListener('did-stop-loading', handler);
                            injectScript();
                        });
                    } else {
                        injectScript();
                    }
                }
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
                this.toastr.info('Hệ thống đang dùng Gemini để dịch âm thanh thành văn bản...', 'Đang xử lý');
                
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
                        }
                    } else {
                        this.toastr.warning('Chưa cấu hình API Key của Gemini trong Cài đặt', 'Lỗi cấu hình');
                    }
                } catch (e) {
                    console.error('Lỗi xử lý file hoặc dịch STT:', e);
                    this.toastr.error('Có lỗi xảy ra khi nhờ Gemini dịch âm thanh.', 'Lỗi phân tích');
                }

                // Tắt luồng mic/loa
                stream.getTracks().forEach((track: any) => track.stop());
            };
            
            // Cắt nhỏ file âm thanh mỗi 1000ms (1 giây) nhưng chỉ lưu vào mảng
            this.setRecordingState(true);
            this.mediaRecorder.start(1000); 
            this.toastr.info('Đang ghi âm toàn hệ thống. Bấm lại nút Micro để kết thúc.', 'Bắt đầu ghi âm');
            
        } catch (err) {
            console.error('Lỗi thu âm hệ thống:', err);
            this.setRecordingState(false);
            this.toastr.error('Không thể khởi động ghi âm. Vui lòng kiểm tra quyền truy cập.', 'Lỗi hệ thống');
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
                webview.style.opacity = '0';
                webview.style.transition = 'opacity 0.2s ease-in-out';
                
                // Fallback hiển thị sau 1s nếu dom-ready quá lâu
                setTimeout(() => { webview.style.opacity = '1'; }, 1000);

                webview.addEventListener('console-message', (e: any) => {
                    console.log(`[Webview Console] level ${e.level}: ${e.message}`);
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
                    setTimeout(() => { webview.style.opacity = '1'; }, 50);
                });

                // Hàm cập nhật tiêu đề đáng tin cậy hơn
                const updateTitle = () => {
                    try {
                        const title = (webview as any).getTitle();
                        if (title && title !== this.popupTitle) {
                            this.popupTitle = title;
                            this.cdr.detectChanges();
                        }
                    } catch (err) {}
                };

                webview.addEventListener('did-stop-loading', updateTitle);
                webview.addEventListener('did-navigate', updateTitle);
                webview.addEventListener('did-navigate-in-page', updateTitle);

                // Cập nhật tiêu đề dựa trên trang web hiện tại
                webview.addEventListener('page-title-updated', (e: any) => {
                    if (e.title) {
                        this.popupTitle = e.title;
                        this.cdr.detectChanges();
                    }
                });

                // Cập nhật favicon dựa trên trang web hiện tại
                webview.addEventListener('page-favicon-updated', (e: any) => {
                    if (e.favicons && e.favicons.length > 0) {
                        this.popupFavicon = e.favicons[0];
                        this.cdr.detectChanges();
                    }
                });

                container.appendChild(webview);
            }
        }, 500); // Đợi DOM sẵn sàng chút xíu
    }

    onPopupDragStart() {
        this.isDraggingWebview = true;
    }

    onPopupDragEnd() {
        this.isDraggingWebview = false;
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