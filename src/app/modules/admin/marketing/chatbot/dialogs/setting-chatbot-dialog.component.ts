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
        this.dialogRef.close({
            selectedDataSource: this.selectedDataSource,
            selectedDocTypes: this.selectedDocTypes,
            selectedSettingsDomains: this.selectedSettingsDomains,
            customPrompt: this.customPrompt
        });
    }
}
