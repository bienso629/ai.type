import { Component, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface DialogChatGPTData {
    question: string;
    answer: string;
}

@Component({
    selector: 'chatgpt-data-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:alert-circle'"></mat-icon>
        <mat-label class="self-center">Hỏi "{{data.question}}"</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <h2 class="mb-2 font-semibold">Trả lời:</h2>
        <p class="hover:bg-grey-50 border p-2 rounded">{{data.answer}}</p>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button color="primary" class="" [mat-dialog-close]="data.answer">
            Sử dụng câu trả lời này
        </button>
    <button mat-flat-button (click)="onNoClick()" color="medium" class="">Đóng cửa sổ</button>
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