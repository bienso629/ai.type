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
                }
            ];
            this.zaloPluginMode = 'tool';
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
            this.toastr.error('Chưa kết nối được với hệ thống Electron.');
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
                const res = await (window as any).electronAPI.toggleAiAgent(event.checked);
                if (res && res.success) {
                    plugin.enabled = event.checked;
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
}
