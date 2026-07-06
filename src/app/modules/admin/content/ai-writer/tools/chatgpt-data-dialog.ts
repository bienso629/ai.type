import { Component, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface DialogChatGPTData {
    question: string;
    answer: string;
}

@Component({
    selector: 'chatgpt-data-dialog',
    template: `<div class="flex items-center justify-between mb-4">
        <div class="text-2xl font-bold text-gray-800 tracking-tight">Hỏi "{{data.question}}"</div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <h2 class="mb-2 font-semibold">Trả lời:</h2>
        <p class="hover:bg-grey-50 border p-2 rounded">{{data.answer}}</p>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
    <button mat-flat-button color="primary" class="" [mat-dialog-close]="data.answer">
            Sử dụng câu trả lời này
        </button>
</div>`,
})
export class ChatGPTDataDialog {
    constructor(
        public dialogRef: MatDialogRef<ChatGPTDataDialog>,
        @Inject(MAT_DIALOG_DATA) public data: DialogChatGPTData,
    ) { }

    onNoClick(): void {
        this.dialogRef.close();
    }
}