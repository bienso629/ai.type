import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-doc-type-dialog',
    templateUrl: './doc-type-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class DocTypeDialogComponent {
    selectedDocType: string = 'qa_detailed';
    docTypes: any[] = [];

    constructor(
        public dialogRef: MatDialogRef<DocTypeDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
    ) {
        this.docTypes = data.docTypes || [];
        const validValues = this.docTypes.map((d) => d.value);
        if (
            data.selectedDocType &&
            validValues.includes(data.selectedDocType)
        ) {
            this.selectedDocType = data.selectedDocType;
        } else {
            this.selectedDocType = 'qa_detailed';
        }
    }

    onClose(): void {
        this.dialogRef.close();
    }

    onConfirm(): void {
        this.dialogRef.close(this.selectedDocType);
    }
}
