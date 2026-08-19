import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TaskProgressService } from 'app/layout/common/task-progress/task-progress.service';

@Component({
    selector: 'app-setting-chatbot-dialog',
    templateUrl: './setting-chatbot-dialog.component.html'
})
export class SettingChatbotDialogComponent {
    selectedDataSource: 'documents' | 'website' | 'all' = 'documents';
    docTypes: any[] = [];
    selectedDocTypes: string[] = [];
    domainOptions: any[] = [];
    selectedSettingsDomains: string[] = [];
    customPrompt: string = '';
    
    // Colab MCP Configuration
    colabMcpUrl: string = '';
    isColabMcpEnabled: boolean = false;
    isTestingMcp: boolean = false;
    mcpStatus: any = null;
    mcpError: string = '';

    constructor(
        public dialogRef: MatDialogRef<SettingChatbotDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private taskProgress: TaskProgressService
    ) {
        this.selectedDataSource = data.selectedDataSource || 'documents';
        this.docTypes = data.docTypes || [];
        this.selectedDocTypes = [...(data.selectedDocTypes || [])];
        this.domainOptions = data.domainOptions || [];
        this.selectedSettingsDomains = [...(data.selectedSettingsDomains || [])];
        this.customPrompt = data.customPrompt || '';
        
        this.colabMcpUrl = localStorage.getItem('colabMcpUrl') || '';
        this.isColabMcpEnabled = localStorage.getItem('isColabMcpEnabled') === 'true';
    }

    async testMcpConnection() {
        if (!this.colabMcpUrl) return;
        this.isTestingMcp = true;
        this.mcpStatus = null;
        this.mcpError = '';

        try {
            const electron = (window as any).electron;
            if (!electron || !electron.invoke) {
                throw new Error('Tính năng này yêu cầu chạy trên ứng dụng Electron');
            }

            const res = await electron.invoke('mcp-connect', this.colabMcpUrl.trim());
            if (!res.success) {
                throw new Error(res.error || 'Không thể kết nối');
            }

            // Try to check GPU status tool
            let gpuInfo = '';
            try {
                const gpuRes = await electron.invoke('mcp-call-tool', 'check_gpu_status', {});
                if (gpuRes && gpuRes.success && gpuRes.data) {
                    gpuInfo = gpuRes.data.gpu || '';
                }
            } catch (e) {}

            this.mcpStatus = {
                tools: res.tools || [],
                serverInfo: res.serverInfo,
                gpu: gpuInfo
            };

            // Save immediately on success
            localStorage.setItem('colabMcpUrl', this.colabMcpUrl.trim());
            localStorage.setItem('isColabMcpEnabled', 'true');
            this.isColabMcpEnabled = true;
        } catch (err: any) {
            this.mcpError = err.message || String(err);
        } finally {
            this.isTestingMcp = false;
        }
    }

    getToolNames(tools: any[]): string {
        if (!tools || !tools.length) return '';
        return tools.map(t => t.name).join(', ');
    }

    toggleDocType(value: string) {
        const index = this.selectedDocTypes.indexOf(value);
        if (index > -1) {
            this.selectedDocTypes.splice(index, 1);
        } else {
            this.selectedDocTypes.push(value);
        }
    }

    toggleSettingsDomain(domain: string) {
        const index = this.selectedSettingsDomains.indexOf(domain);
        if (index > -1) {
            this.selectedSettingsDomains.splice(index, 1);
        } else {
            this.selectedSettingsDomains.push(domain);
        }
    }

    normalizeDomainUrl(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    }

    onClose(): void {
        this.dialogRef.close();
    }

    onConfirm(): void {
        localStorage.setItem('colabMcpUrl', (this.colabMcpUrl || '').trim());
        localStorage.setItem('isColabMcpEnabled', this.isColabMcpEnabled ? 'true' : 'false');

        this.dialogRef.close({
            selectedDataSource: this.selectedDataSource,
            selectedDocTypes: this.selectedDocTypes,
            selectedSettingsDomains: this.selectedSettingsDomains,
            customPrompt: this.customPrompt,
            colabMcpUrl: this.colabMcpUrl,
            isColabMcpEnabled: this.isColabMcpEnabled
        });
    }
}
