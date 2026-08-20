import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserClientService } from 'app/_services/user';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'settings-plugins',
    templateUrl: './plugins.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [UserClientService]
})
export class SettingsPluginsComponent implements OnInit, OnDestroy {
    plugins: any[] = [];
    zaloPluginMode: string = 'tool';
    aiAgentApiKey: string = 'type-vn-local-agent-2026';
    ttsVoice: string = 'vi-VN-HoaiMyNeural';
    ttsRate: string = '+0%';
    aiAgentModel: string = 'gemini-3.6-flash';
    aiAgentPrompt: string = '';

    colabStatus: any = { status: 'offline', is_connected: false, gpu: '', colab_url: '' };
    colabChecking: boolean = false;
    isColabLoggedIn: boolean = false;
    isColabStarting: boolean = false;
    isColabAuthenticating: boolean = false;
    colabAuthCode: string = '';

    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private titleService: Title,
        private _fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _userService: UserService,
        private _userClientService: UserClientService
    ) {
        this.titleService.setTitle(`plugins | ai.type - công cụ tạo content`);
    }

    ngOnInit(): void {
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
        this.getPluginsStatus();
        this.checkColabStatus();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    syncSettingsToBackend(settings: any) {
        if (!this.user || !this.user.name) return;
        const editor = this.multiAccountService.getItem('editor');
        const following_users = this.multiAccountService.getItem('following_users');
        this._userClientService.updateProfile({
            profile: {
                settings: settings,
                active_info: this.multiAccountService.getItem('active_info'),
                editor: (editor && editor !== 'undefined') ? editor : {},
                following_users: (following_users && following_users !== 'undefined') ? following_users : [],
            },
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
    }


    async getPluginsStatus() {
        if (!(window as any).electronAPI || !(window as any).electronAPI.getPluginsStatus) {
            // Mẫu tĩnh khi test trên trình duyệt
            this.plugins = [
                {
                    id: 'zalo_reply',
                    name: 'Quản lý Zalo',
                    description: 'Tự động đọc và trả lời tin nhắn Zalo thông minh.',
                    installed: true,
                    canInstall: true,
                    enabled: false,
                    mode: 'tool',
                    version: '1.0'
                },
                {
                    id: 'ai_agent',
                    name: 'AI Agent System',
                    description: 'Tích hợp Agent thông minh trên máy tính của bạn.',
                    installed: false,
                    canInstall: true,
                    enabled: false,
                    version: '1.0'
                }
            ];
            
            let settings = this.multiAccountService.getItem('settings') || {};
            
            try {
                const lsSettings = localStorage.getItem('settings');
                if (lsSettings) {
                    const parsed = JSON.parse(lsSettings);
                    settings = { ...settings, ...parsed };
                }
            } catch(e) {}
            
            const zaloPlugin = this.plugins.find(p => p.id === 'zalo_reply');
            if (zaloPlugin) zaloPlugin.enabled = settings.zaloPluginEnabled || false;
            
            const aiAgentPlugin = this.plugins.find(p => p.id === 'ai_agent');
            if (aiAgentPlugin) aiAgentPlugin.enabled = settings.enableAiAgent || false;
            
            this.zaloPluginMode = settings.zaloPluginMode || 'tool';
            this.aiAgentApiKey = settings.aiAgentApiKey || 'type-vn-local-agent-2026';
            this.ttsVoice = settings.ttsVoice || 'vi-VN-HoaiMyNeural';
            this.ttsRate = settings.ttsRate || '+0%';
            this.aiAgentModel = settings.aiAgentModel || 'gemini-3.6-flash';
            this.aiAgentPrompt = settings.aiAgentPrompt || '';
            this.cd.detectChanges();
            return;
        }

        try {
            const list = await (window as any).electronAPI.getPluginsStatus();
            this.plugins = list || [];
            const zalo = this.plugins.find(p => p.id === 'zalo_reply');
            if (zalo) {
                this.zaloPluginMode = zalo.mode || 'tool';
            }
            const aiAgent = this.plugins.find(p => p.id === 'ai_agent');
            if (aiAgent && aiAgent.apiKey) {
                this.aiAgentApiKey = aiAgent.apiKey;
            } else {
                this.aiAgentApiKey = 'type-vn-local-agent-2026';
            }
            
            let settings = this.multiAccountService.getItem('settings') || {};
            
            try {
                // Luôn ưu tiên đọc từ localStorage vì IndexedDB có thể chưa kịp lưu do debounce 500ms
                const lsSettings = localStorage.getItem('settings');
                if (lsSettings) {
                    const parsed = JSON.parse(lsSettings);
                    settings = { ...settings, ...parsed };
                }
            } catch(e) {}
            
            this.ttsVoice = settings.ttsVoice || 'vi-VN-HoaiMyNeural';
            this.ttsRate = settings.ttsRate || '+0%';
            this.aiAgentModel = settings.aiAgentModel || 'gemini-3.6-flash';
            this.aiAgentPrompt = settings.aiAgentPrompt || '';
        } catch (err) {
            this.toastr.error('Lỗi khi lấy trạng thái plugin: ' + err.message);
        }
        this.cd.detectChanges();
    }

    async installPlugin(plugin: any) {
        if (!(window as any).electronAPI || !(window as any).electronAPI.installPlugin) {
            this.toastr.error('Tính năng này chỉ khả dụng trên ứng dụng Desktop.');
            return;
        }
        
        try {
            const res = await (window as any).electronAPI.installPlugin(plugin.id);
            if (res && res.success) {
                this.toastr.success(res.message || 'Cài đặt plugin thành công!');
                this.getPluginsStatus();
            } else {
                this.toastr.error(res?.error || 'Cài đặt plugin thất bại.');
            }
        } catch (err) {
            this.toastr.error('Lỗi cài đặt plugin: ' + err.message);
        }
    }

    async uninstallPlugin(plugin: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Gỡ cài đặt Plugin',
            message: `Bạn có chắc chắn muốn gỡ cài đặt plugin <span class="font-semibold">${plugin.name}</span> không?`,
            icon: { show: true, name: 'feather:alert-triangle', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Gỡ bỏ', color: 'warn' },
                cancel: { show: true, label: 'Hủy' }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                if (!(window as any).electronAPI || !(window as any).electronAPI.uninstallPlugin) {
                    this.toastr.error('Tính năng này chỉ khả dụng trên ứng dụng Desktop.');
                    return;
                }
                
                try {
                    const res = await (window as any).electronAPI.uninstallPlugin(plugin.id);
                    if (res && res.success) {
                        this.toastr.success('Đã gỡ cài đặt plugin.');
                        this.getPluginsStatus();
                    } else {
                        this.toastr.error(res?.error || 'Gỡ cài đặt plugin thất bại.');
                    }
                } catch (err) {
                    this.toastr.error('Lỗi gỡ cài đặt: ' + err.message);
                }
            }
        });
    }

    async togglePlugin(plugin: any, event: any) {
        if (!(window as any).electronAPI) {
            if (plugin.id === 'ai_agent') {
                plugin.enabled = event.checked;
                const settings = this.multiAccountService.getItem('settings') || {};
                settings.enableAiAgent = event.checked;
                this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);
                this.toastr.success(event.checked ? 'Đã kích hoạt AI Agent trên trình duyệt/mobile.' : 'Đã tắt AI Agent.');
            } else if (plugin.id === 'zalo_reply') {
                plugin.enabled = event.checked;
                const settings = this.multiAccountService.getItem('settings') || {};
                settings.zaloPluginEnabled = event.checked;
                this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);
                this.toastr.success(event.checked ? 'Đã kích hoạt Zalo trên trình duyệt.' : 'Đã tắt Zalo.');
            }
            return;
        }

        try {
            if (plugin.id === 'zalo_reply') {
                const res = await (window as any).electronAPI.toggleZaloPlugin(event.checked, this.zaloPluginMode);
                if (res && res.success) {
                    plugin.enabled = event.checked;

                    const settings = this.multiAccountService.getItem('settings') || {};
                    settings.zaloPluginEnabled = event.checked;
                    this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);

                    this.toastr.success(event.checked ? 'Đã kích hoạt Quản lý Zalo.' : 'Đã hủy kích hoạt Quản lý Zalo.');
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái plugin.');
                }
            } else if (plugin.id === 'ai_agent') {
                const settings = this.multiAccountService.getItem('settings') || {};
                const res = await (window as any).electronAPI.toggleAiAgent(event.checked, this.aiAgentApiKey, {
                    umodelverseUrl: settings.umodelverseUrl,
                    umodelverseKey: settings.umodelverseKey
                });
                if (res && res.success) {
                    plugin.enabled = event.checked;
                    settings.enableAiAgent = event.checked;
                    this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);


                    this.toastr.success(event.checked ? 'Đã kích hoạt AI Agent.' : 'Đã hủy kích hoạt AI Agent.');
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái plugin.');
                }
            } else if (plugin.id === 'colab_agent') {
                const res = await (window as any).electronAPI.toggleColabAgent(event.checked);
                if (res && res.success) {
                    plugin.enabled = event.checked;
                    this.toastr.success(event.checked ? 'Đã kích hoạt Colab GPU Agent.' : 'Đã tắt Colab GPU Agent.');
                    if (event.checked) setTimeout(() => this.checkColabStatus(), 1000);
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái Colab Agent.');
                }
            }
        } catch (err) {
            this.toastr.error('Lỗi thay đổi trạng thái: ' + err.message);
            event.source.checked = !event.checked;
        }
    }

    async checkColabStatus() {
        this.colabChecking = true;
        try {
            if ((window as any).electronAPI && (window as any).electronAPI.getColabAuthStatus) {
                const authRes = await (window as any).electronAPI.getColabAuthStatus();
                this.isColabLoggedIn = authRes && authRes.authenticated;
            }

            const resp = await fetch('http://127.0.0.1:7868/status');
            if (resp.ok) {
                this.colabStatus = await resp.json();
            } else {
                this.colabStatus = { status: 'offline', is_connected: false };
            }
        } catch(e) {
            this.colabStatus = { status: 'offline', is_connected: false };
        } finally {
            this.colabChecking = false;
            this.cd.detectChanges();
        }
    }

    async loginGoogleColab() {
        if (!(window as any).electronAPI || !(window as any).electronAPI.loginColabGoogle) {
            this.toastr.info('Tính năng này hoạt động trên ứng dụng Desktop.');
            return;
        }

        this.isColabAuthenticating = true;
        this.toastr.info('Đang mở trình duyệt để xác thực Google Colab...');
        try {
            const res = await (window as any).electronAPI.loginColabGoogle();
            if (res && res.success) {
                this.toastr.info('Vui lòng bấm "Cho phép" trên trình duyệt, sau đó dán mã xác thực (4/0A...) vào ô bên dưới.');
                // Lắng nghe clipboard tự động nếu người dùng vừa copy
                this.startClipboardWatcher();
            } else {
                this.toastr.error(res?.error || 'Không thể mở trình duyệt xác thực.');
            }
        } catch(e) {
            this.toastr.error('Lỗi: ' + e.message);
        }
        this.cd.detectChanges();
    }

    startClipboardWatcher() {
        let count = 0;
        const interval = setInterval(async () => {
            count++;
            if (count > 60 || this.isColabLoggedIn || !this.isColabAuthenticating) {
                clearInterval(interval);
                return;
            }
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim().startsWith('4/') && text.trim().length > 20 && text.trim() !== this.colabAuthCode) {
                        this.colabAuthCode = text.trim();
                        clearInterval(interval);
                        this.submitColabAuthCode();
                    }
                }
            } catch(e) {}
        }, 1000);
    }

    async submitColabAuthCode() {
        if (!this.colabAuthCode || !this.colabAuthCode.trim()) {
            this.toastr.warning('Vui lòng nhập hoặc dán mã xác thực (4/0A...).');
            return;
        }

        if (!(window as any).electronAPI || !(window as any).electronAPI.exchangeColabCode) return;

        this.toastr.info('Đang kiểm tra và xác thực mã Google Colab...');
        try {
            const res = await (window as any).electronAPI.exchangeColabCode(this.colabAuthCode.trim());
            if (res && res.success) {
                this.isColabLoggedIn = true;
                this.isColabAuthenticating = false;
                this.colabAuthCode = '';
                this.toastr.success(res.message || 'Đã liên kết Google Colab thành công!');
                this.checkColabStatus();
            } else {
                this.toastr.error(this.formatErrorMessage(res?.error || 'Mã xác thực không hợp lệ hoặc đã hết hạn.'));
            }
        } catch(e) {
            this.toastr.error(this.formatErrorMessage('Lỗi xác thực: ' + e.message));
        }
        this.cd.detectChanges();
    }

    private formatErrorMessage(err: any): string {
        if (!err) return 'Đã có lỗi xảy ra.';
        const errStr = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
        if (errStr.includes('TooManyAssignmentsError') || errStr.includes('412') || errStr.includes('Too many assignments')) {
            return 'Tài khoản Google đã đạt giới hạn cấp phát GPU Colab hôm nay. Vui lòng thử lại sau vài giờ.';
        }
        if (errStr.includes('Unauthenticated') || errStr.includes('401') || errStr.includes('invalid_grant')) {
            return 'Phiên đăng nhập Google Colab đã hết hạn. Vui lòng liên kết lại mã xác thực.';
        }
        const cleanLines = errStr.split('\n').map(l => l.trim().replace(/^\|+\s*/, '')).filter(l => l && !l.startsWith('Traceback') && !l.startsWith('File ') && !l.startsWith('site-packages/'));
        const lastLine = cleanLines[cleanLines.length - 1];
        if (lastLine && lastLine.length > 5) {
            return lastLine.length > 120 ? lastLine.slice(0, 120) + '...' : lastLine;
        }
        return errStr.length > 120 ? errStr.slice(0, 120) + '...' : errStr;
    }

    async startColabGpuCli() {
        if (!(window as any).electronAPI || !(window as any).electronAPI.startColabGpu) return;
        this.isColabStarting = true;
        this.toastr.info('Đang khởi tạo máy ảo GPU Tesla T4 trên Colab...');
        try {
            const res = await (window as any).electronAPI.startColabGpu();
            if (res && res.success) {
                this.toastr.success(res.message || 'Đã kết nối GPU Colab thành công!');
                this.checkColabStatus();
                setTimeout(() => this.checkColabStatus(), 2000);
            } else {
                this.toastr.error(this.formatErrorMessage(res?.error || 'Không thể khởi tạo GPU Colab.'));
            }
        } catch(e) {
            this.toastr.error(this.formatErrorMessage('Lỗi: ' + e.message));
        } finally {
            this.isColabStarting = false;
            this.cd.detectChanges();
        }
    }

    async stopColabGpuCli() {
        if (!(window as any).electronAPI || !(window as any).electronAPI.stopColabGpu) return;
        try {
            const res = await (window as any).electronAPI.stopColabGpu();
            if (res && res.success) {
                this.toastr.success('Đã giải phóng máy ảo Colab GPU.');
                this.checkColabStatus();
            } else {
                this.toastr.error(this.formatErrorMessage(res?.error || 'Không thể dừng GPU.'));
            }
        } catch(e) {
            this.toastr.error(this.formatErrorMessage('Lỗi: ' + e.message));
        }
        this.cd.detectChanges();
    }

    openColabNotebook() {
        window.dispatchEvent(new CustomEvent('open-colab-gpu-bridge'));
    }

    async restartColabRuntime() {
        try {
            const resp = await fetch('http://127.0.0.1:7868/restart_runtime', { method: 'POST' });
            if (resp.ok) {
                this.toastr.success('Đã gửi yêu cầu khởi động lại Colab Runtime.');
                setTimeout(() => this.checkColabStatus(), 1500);
            } else {
                this.toastr.error('Không thể khởi động lại Colab Runtime.');
            }
        } catch(e) {
            this.toastr.error('Colab Agent Plugin chưa được khởi chạy.');
        }
    }

    async saveAiAgentKey(plugin: any) {
        if (!(window as any).electronAPI) {
            const settings = this.multiAccountService.getItem('settings') || {};
            settings.aiAgentApiKey = this.aiAgentApiKey;
            settings.ttsVoice = this.ttsVoice;
            settings.ttsRate = this.ttsRate;
            settings.aiAgentModel = this.aiAgentModel;
            settings.aiAgentPrompt = this.aiAgentPrompt;
            this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);

            this.toastr.success('Đã lưu cấu hình AI Agent trên trình duyệt/mobile.');
            return;
        }
        try {
            const settings = this.multiAccountService.getItem('settings') || {};
            settings.ttsVoice = this.ttsVoice;
            settings.ttsRate = this.ttsRate;
            settings.aiAgentApiKey = this.aiAgentApiKey;
            settings.aiAgentModel = this.aiAgentModel;
            settings.aiAgentPrompt = this.aiAgentPrompt;
            this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);


            const res = await (window as any).electronAPI.toggleAiAgent(plugin.enabled, this.aiAgentApiKey, {
                umodelverseUrl: settings.umodelverseUrl,
                umodelverseKey: settings.umodelverseKey
            });
            if (res && res.success) {
                this.toastr.success('Đã lưu cấu hình. Hệ thống sẽ khởi động lại AI Agent nếu đang bật.');
            } else {
                this.toastr.error(res?.error || 'Lỗi lưu cấu hình.');
            }
        } catch (err) {
            this.toastr.error('Lỗi: ' + err.message);
        }
    }
}
