import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'settings-plugins',
    templateUrl: './plugins.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPluginsComponent implements OnInit {
    plugins: any[] = [];
    zaloPluginMode: string = 'tool';
    aiAgentApiKey: string = 'type-vn-local-agent-2026';
    ttsVoice: string = 'vi-VN-HoaiMyNeural';
    ttsRate: string = '+0%';

    constructor(
        private _fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService
    ) {}

    ngOnInit(): void {
        this.getPluginsStatus();
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
            
            const settings = this.multiAccountService.getItem('settings') || {};
            const zaloPlugin = this.plugins.find(p => p.id === 'zalo_reply');
            if (zaloPlugin) zaloPlugin.enabled = settings.zaloPluginEnabled || false;
            
            const aiAgentPlugin = this.plugins.find(p => p.id === 'ai_agent');
            if (aiAgentPlugin) aiAgentPlugin.enabled = settings.enableAiAgent || false;
            
            this.zaloPluginMode = settings.zaloPluginMode || 'tool';
            this.aiAgentApiKey = settings.aiAgentApiKey || 'type-vn-local-agent-2026';
            this.ttsVoice = settings.ttsVoice || 'vi-VN-HoaiMyNeural';
            this.ttsRate = settings.ttsRate || '+0%';
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
            
            const settings = this.multiAccountService.getItem('settings') || {};
            this.ttsVoice = settings.ttsVoice || 'vi-VN-HoaiMyNeural';
            this.ttsRate = settings.ttsRate || '+0%';
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
                this.toastr.success(event.checked ? 'Đã kích hoạt AI Agent trên trình duyệt/mobile.' : 'Đã tắt AI Agent.');
            } else if (plugin.id === 'zalo_reply') {
                plugin.enabled = event.checked;
                const settings = this.multiAccountService.getItem('settings') || {};
                settings.zaloPluginEnabled = event.checked;
                this.multiAccountService.setItem('settings', settings);
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
                    
                    this.toastr.success(event.checked ? 'Đã kích hoạt Quản lý Zalo.' : 'Đã hủy kích hoạt Quản lý Zalo.');
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái plugin.');
                }
            } else if (plugin.id === 'ai_agent') {
                const res = await (window as any).electronAPI.toggleAiAgent(event.checked, this.aiAgentApiKey);
                if (res && res.success) {
                    plugin.enabled = event.checked;
                    
                    const settings = this.multiAccountService.getItem('settings') || {};
                    settings.enableAiAgent = event.checked;
                    this.multiAccountService.setItem('settings', settings);
                    try { localStorage.setItem('settings', JSON.stringify(settings)); } catch(e){}
                    
                    this.toastr.success(event.checked ? 'Đã kích hoạt AI Agent.' : 'Đã hủy kích hoạt AI Agent.');
                } else {
                    this.toastr.error(res?.error || 'Không thể thay đổi trạng thái plugin.');
                }
            }
        } catch (err) {
            this.toastr.error('Lỗi thay đổi trạng thái: ' + err.message);
            event.source.checked = !event.checked;
        }
    }

    async saveAiAgentKey(plugin: any) {
        if (!(window as any).electronAPI) {
            const settings = this.multiAccountService.getItem('settings') || {};
            settings.aiAgentApiKey = this.aiAgentApiKey;
            settings.ttsVoice = this.ttsVoice;
            settings.ttsRate = this.ttsRate;
            this.multiAccountService.setItem('settings', settings);
            this.toastr.success('Đã lưu cấu hình AI Agent trên trình duyệt/mobile.');
            return;
        }
        try {
            const settings = this.multiAccountService.getItem('settings') || {};
            settings.ttsVoice = this.ttsVoice;
            settings.ttsRate = this.ttsRate;
            this.multiAccountService.setItem('settings', settings);

            const res = await (window as any).electronAPI.toggleAiAgent(plugin.enabled, this.aiAgentApiKey);
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
