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
    styleUrls: ['./plugins.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [UserClientService],
    standalone: false
})
export class SettingsPluginsComponent implements OnInit, OnDestroy {
    plugins: any[] = [];
    zaloPluginMode: string = 'tool';
    aiAgentApiKey: string = 'type-vn-local-agent-2026';
    showAiAgentKey: boolean = false;
    ttsVoice: string = 'vi-VN-HoaiMyNeural';
    ttsRate: string = '+0%';
    aiAgentModel: string = 'glm-5.3';
    aiAgentMaxTurns: number = 25;
    aiAgentPrompt: string = '';

    colabStatus: any = { status: 'offline', is_connected: false, gpu: '', colab_url: '' };
    colabChecking: boolean = false;
    isColabLoggedIn: boolean = false;
    isColabStarting: boolean = false;
    isColabAuthenticating: boolean = false;
    colabAuthCode: string = '';
    colabConfigUrl: string = '';
    colabSourceMode: 'binary' | 'config' = 'binary';

    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getPlugin(id: string): any {
        return this.plugins.find(p => p.id === id) || {
            id: id,
            name: id === 'colab_agent' ? 'Colab GPU Agent' : (id === 'ai_agent' ? 'AI Agent' : (id === 'tiktok_100' ? '100 TikTokers' : 'Quản lý Zalo')),
            installed: false,
            enabled: false,
            canInstall: true,
            version: '1.0'
        };
    }

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
                    installed: false,
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
                },
                {
                    id: 'colab_agent',
                    name: 'Colab GPU Agent',
                    description: 'Tự động hóa kết nối Google Colab GPU, bóc tách MinerU và thực thi code từ xa.',
                    installed: false,
                    canInstall: true,
                    enabled: false,
                    version: '1.0'
                },
                {
                    id: 'tiktok_100',
                    name: '100 TikTokers',
                    description: 'Tự động hóa theo dõi, phân tích xu hướng và khai thác nội dung từ 100 kênh TikTok.',
                    installed: false,
                    canInstall: false,
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

            const tiktokPlugin = this.plugins.find(p => p.id === 'tiktok_100');
            if (tiktokPlugin) tiktokPlugin.enabled = settings.tiktokPluginEnabled || false;
            
            this.zaloPluginMode = settings.zaloPluginMode || 'tool';
            this.aiAgentApiKey = settings.aiAgentApiKey || 'type-vn-local-agent-2026';
            this.ttsVoice = settings.ttsVoice || 'vi-VN-HoaiMyNeural';
            this.ttsRate = settings.ttsRate || '+0%';
            this.aiAgentModel = settings.aiAgentModel || 'glm-5.3';
            this.aiAgentMaxTurns = settings.aiAgentMaxTurns !== undefined ? Number(settings.aiAgentMaxTurns) : 25;
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
            this.aiAgentModel = settings.aiAgentModel || 'glm-5.3';
            this.aiAgentMaxTurns = settings.aiAgentMaxTurns !== undefined ? Number(settings.aiAgentMaxTurns) : 25;
            this.aiAgentPrompt = settings.aiAgentPrompt || '';
            this.checkColabStatus();
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
            } else if (plugin.id === 'tiktok_100') {
                plugin.enabled = event.checked;
                const settings = this.multiAccountService.getItem('settings') || {};
                settings.tiktokPluginEnabled = event.checked;
                this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);
                this.toastr.success(event.checked ? 'Đã kích hoạt 100 TikTokers trên trình duyệt.' : 'Đã tắt 100 TikTokers.');
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
            } else if (plugin.id === 'tiktok_100') {
                const res = await (window as any).electronAPI.toggleTiktokPlugin(event.checked);
                if (res && res.success) {
                    plugin.enabled = event.checked;

                    const settings = this.multiAccountService.getItem('settings') || {};
                    settings.tiktokPluginEnabled = event.checked;
                    this.multiAccountService.setItem('settings', settings);
                    this.syncSettingsToBackend(settings);

                    this.toastr.success(event.checked ? 'Đã kích hoạt 100 TikTokers.' : 'Đã hủy kích hoạt 100 TikTokers.');
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái plugin 100 TikTokers.');
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
                    setTimeout(() => this.checkColabStatus(), 500);
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái Colab Agent.');
                }
            }
        } catch (err) {
            this.toastr.error('Lỗi thay đổi trạng thái: ' + err.message);
            event.source.checked = !event.checked;
        }
    }

    colabAccounts: any[] = [];
    colabActiveEmail: string = '';

    async checkColabStatus() {
        this.colabChecking = true;
        try {
            // Lấy cấu hình sst ("Sử dụng Google Colab" trong Cài đặt -> Tài khoản)
            let settings = this.multiAccountService.getItem('settings') || {};
            try {
                const lsSettings = localStorage.getItem('settings');
                if (lsSettings) {
                    settings = { ...settings, ...JSON.parse(lsSettings) };
                }
            } catch(e) {}
            this.colabConfigUrl = (settings.sst || '').trim().replace(/\/+$/, '');

            const colabPlugin = this.getPlugin('colab_agent');
            const hasBinary = !!(colabPlugin?.installed || colabPlugin?.hasBinary);

            if (hasBinary) {
                // Ưu tiên 1: Đã có file binary colab_agent_linux
                this.colabSourceMode = 'binary';
                if ((window as any).electronAPI && (window as any).electronAPI.getColabAuthStatus) {
                    const authRes = await (window as any).electronAPI.getColabAuthStatus();
                    if (authRes) {
                        if (authRes.authenticated !== undefined) {
                            this.isColabLoggedIn = authRes.authenticated;
                        }
                        if (Array.isArray(authRes.accounts) && authRes.accounts.length > 0) {
                            this.colabAccounts = authRes.accounts;
                        }
                        if (authRes.active_email) {
                            this.colabActiveEmail = authRes.active_email;
                        }
                    }
                }

                if (this.colabAccounts.length === 0) {
                    try {
                        const authResp = await fetch('http://127.0.0.1:7868/auth_status');
                        if (authResp.ok) {
                            const authData = await authResp.json();
                            if (authData && authData.authenticated) {
                                this.isColabLoggedIn = true;
                                if (Array.isArray(authData.accounts) && authData.accounts.length > 0) {
                                    this.colabAccounts = authData.accounts;
                                }
                                if (authData.active_email) {
                                    this.colabActiveEmail = authData.active_email;
                                }
                            }
                        }
                    } catch(e) {}
                }

                const resp = await fetch('http://127.0.0.1:7868/status');
                if (resp.ok) {
                    this.colabStatus = await resp.json();
                } else {
                    this.colabStatus = { status: 'offline', is_connected: false };
                }
            } else if (this.colabConfigUrl) {
                // Ưu tiên 2: Không có file binary -> Sử dụng cấu hình "Sử dụng Google Colab" từ tab Tác vụ
                this.colabSourceMode = 'config';
                this.isColabLoggedIn = true; // Đã có cấu hình URL Colab từ xa

                // Nạp danh sách tài khoản Google: Thử lấy từ electronAPI trước (tài khoản đã liên kết trên máy)
                if ((window as any).electronAPI && (window as any).electronAPI.getColabAuthStatus) {
                    try {
                        const authRes = await (window as any).electronAPI.getColabAuthStatus();
                        if (authRes) {
                            if (Array.isArray(authRes.accounts) && authRes.accounts.length > 0) {
                                this.colabAccounts = authRes.accounts;
                            }
                            if (authRes.active_email) {
                                this.colabActiveEmail = authRes.active_email;
                            }
                        }
                    } catch(e) {}
                }

                // Nếu chưa có, thử nạp từ endpoint /auth_status của máy chủ Colab từ xa
                if (this.colabAccounts.length === 0) {
                    try {
                        const authResp = await fetch(`${this.colabConfigUrl}/auth_status`, { signal: AbortSignal.timeout(3000) });
                        if (authResp.ok) {
                            const authData = await authResp.json();
                            if (authData) {
                                if (Array.isArray(authData.accounts) && authData.accounts.length > 0) {
                                    this.colabAccounts = authData.accounts;
                                }
                                if (authData.active_email) {
                                    this.colabActiveEmail = authData.active_email;
                                }
                            }
                        }
                    } catch(e) {}
                }

                try {
                    const resp = await fetch(`${this.colabConfigUrl}/status`, { signal: AbortSignal.timeout(3000) });
                    if (resp.ok) {
                        const data = await resp.json();
                        this.colabStatus = {
                            status: data.status || 'running',
                            is_connected: data.is_connected !== undefined ? data.is_connected : true,
                            colab_url: this.colabConfigUrl,
                            gpu: data.gpu || 'Colab GPU'
                        };
                    } else {
                        this.colabStatus = {
                            status: 'running',
                            is_connected: true,
                            colab_url: this.colabConfigUrl,
                            gpu: 'Colab GPU (Cấu hình Tác vụ)'
                        };
                    }
                } catch(err) {
                    // Nếu máy chủ chưa mở /status, giữ URL cấu hình ở trạng thái sẵn sàng
                    this.colabStatus = {
                        status: 'configured',
                        is_connected: true,
                        colab_url: this.colabConfigUrl,
                        gpu: 'Colab GPU (Cấu hình Tác vụ)'
                    };
                }
            } else {
                this.colabSourceMode = 'binary';
                this.colabStatus = { status: 'offline', is_connected: false };
            }
        } catch(e) {
            this.colabStatus = { status: 'offline', is_connected: false };
        } finally {
            this.colabChecking = false;
            this.cd.detectChanges();
        }
    }

    async switchColabAccount(email: string) {
        if (!email || email === this.colabActiveEmail) return;
        this.toastr.info(`Đang chuyển sang tài khoản ${email}...`);
        try {
            if ((window as any).electronAPI && (window as any).electronAPI.switchColabAccount) {
                const res = await (window as any).electronAPI.switchColabAccount(email);
                if (res && res.success) {
                    this.colabActiveEmail = res.active_email || email;
                    this.colabAccounts = res.accounts || this.colabAccounts;
                    this.toastr.success(`Đã kích hoạt tài khoản ${email}`);
                } else {
                    this.toastr.error(res?.error || 'Không thể chuyển tài khoản.');
                }
            } else {
                const baseUrl = this.colabConfigUrl || 'http://127.0.0.1:7868';
                const resp = await fetch(`${baseUrl}/switch_account`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const res = await resp.json();
                if (res && res.success) {
                    this.colabActiveEmail = res.active_email || email;
                    this.colabAccounts = res.accounts || this.colabAccounts;
                    this.toastr.success(`Đã kích hoạt tài khoản ${email}`);
                }
            }
        } catch(e: any) {
            this.toastr.error('Lỗi chuyển tài khoản: ' + e.message);
        }
        this.cd.detectChanges();
    }

    async removeColabAccount(email: string, event?: MouseEvent) {
        if (event) event.stopPropagation();
        if (!confirm(`Bạn có chắc muốn xóa tài khoản ${email} khỏi danh sách Colab GPU?`)) return;

        try {
            if ((window as any).electronAPI && (window as any).electronAPI.removeColabAccount) {
                const res = await (window as any).electronAPI.removeColabAccount(email);
                if (res && res.success) {
                    this.colabAccounts = res.accounts || [];
                    this.colabActiveEmail = res.active_email || '';
                    this.isColabLoggedIn = this.colabAccounts.length > 0;
                    this.toastr.success(`Đã gỡ tài khoản ${email}`);
                }
            } else {
                const baseUrl = this.colabConfigUrl || 'http://127.0.0.1:7868';
                const resp = await fetch(`${baseUrl}/remove_account`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const res = await resp.json();
                if (res && res.success) {
                    this.colabAccounts = res.accounts || [];
                    this.colabActiveEmail = res.active_email || '';
                    this.isColabLoggedIn = this.colabAccounts.length > 0;
                    this.toastr.success(`Đã gỡ tài khoản ${email}`);
                }
            }
        } catch(e: any) {
            this.toastr.error('Lỗi xóa tài khoản: ' + e.message);
        }
        this.cd.detectChanges();
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
                this.toastr.info('Vui lòng chọn tài khoản Google trên trình duyệt, bấm "Cho phép" và dán mã xác thực (4/0A...) vào ô bên dưới.');
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
            if (count > 60 || !this.isColabAuthenticating) {
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
                this.toastr.success(res.message || 'Đã liên kết tài khoản Google Colab thành công!');
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
            const baseUrl = this.colabConfigUrl || 'http://127.0.0.1:7868';
            const resp = await fetch(`${baseUrl}/restart_runtime`, { method: 'POST' });
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
            settings.aiAgentMaxTurns = Number(this.aiAgentMaxTurns) || 25;
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
            settings.aiAgentMaxTurns = Number(this.aiAgentMaxTurns) || 25;
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
