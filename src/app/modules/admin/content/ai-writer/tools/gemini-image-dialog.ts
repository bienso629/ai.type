import { Component } from "@angular/core";
import { MatDialogRef } from "@angular/material/dialog";
import { BlogService } from "app/modules/_services/blog";

@Component({
    selector: 'gemini-image-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:edit-2'"></mat-icon>
        <mat-label class="self-center">Prompt</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <div class="mb-1 text-md text-hint">Bạn muốn viết nội dung như thế nào?</div>

        <mat-form-field class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0" [subscriptSizing]="'dynamic'">
            <textarea class="max-h-80 min-h-40 px-2" [(ngModel)]="string" [placeholder]="'Mô tả điểu bạn muốn ở đây.'" type="text" (keyup.enter)="send()" required matInput cdkTextareaAutosize></textarea>
        </mat-form-field>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button (click)="send()" color="primary" class="float-right">
            Viết nhanh
        </button>
        <button mat-flat-button (click)="onNoClick()" color="medium" class="float-right">Đóng cửa sổ</button>
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
