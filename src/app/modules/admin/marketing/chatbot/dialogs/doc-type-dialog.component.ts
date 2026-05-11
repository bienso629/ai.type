import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-doc-type-dialog',
    templateUrl: './doc-type-dialog.component.html'
})
export class DocTypeDialogComponent {
    selectedDocType: string | null = 'analysis';
    docTypes: any[] = [];

    constructor(
        public dialogRef: MatDialogRef<DocTypeDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.docTypes = data.docTypes || [];
        if (data.selectedDocType) {
            this.selectedDocType = data.selectedDocType;
        }
    }

    onClose(): void {
        this.dialogRef.close();
    }

    onConfirm(): void {
        this.dialogRef.close(this.selectedDocType);
    }
}
