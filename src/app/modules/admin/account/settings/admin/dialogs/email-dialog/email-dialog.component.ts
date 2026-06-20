import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'email-dialog',
    templateUrl: './email-dialog.component.html',
    styleUrls: ['./email-dialog.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class EmailDialogComponent {
    emailComposer = { senderName: 'Ban Quản Trị Type.vn', subject: '', content: '' };
    selectedCount: number = 0;

    constructor(
        public dialogRef: MatDialogRef<EmailDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        if (data && data.selectedCount) {
            this.selectedCount = data.selectedCount;
        }
        if (data && data.subject) {
            this.emailComposer.subject = data.subject;
        }
        if (data && data.content) {
            this.emailComposer.content = data.content;
        }
    }

    submit() {
        this.dialogRef.close(this.emailComposer);
    }
}
