import { Component } from "@angular/core";
import { MatDialogRef } from "@angular/material/dialog";
import { BlogService } from "app/_services/blog";

@Component({
    selector: 'gemini-image-dialog',
    template: `<div class="flex items-center justify-between mb-4">
        <div class="text-2xl font-bold text-gray-800 tracking-tight">Prompt</div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <div class="mb-1 text-md text-hint">Bạn muốn viết nội dung như thế nào?</div>

        <mat-form-field class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0" [subscriptSizing]="'dynamic'">
            <textarea class="max-h-80 min-h-40 px-2" [(ngModel)]="string" [placeholder]="'Mô tả điểu bạn muốn ở đây.'" type="text" (keyup.enter)="send()" required matInput cdkTextareaAutosize></textarea>
        </mat-form-field>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
    <button mat-flat-button (click)="send()" color="primary" class="">
            Viết nhanh
        </button>
</div>`,
    providers: [BlogService],
})
export class GeminiImageDialog {
    string: String = '';

    constructor(
        public dialogRef: MatDialogRef<GeminiImageDialog>,
    ) { }

    send(): void {
        this.dialogRef.close({
            data: this.string
        });
    }

    onNoClick(): void {
        this.dialogRef.close();
    }
}
