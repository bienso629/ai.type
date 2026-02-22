import { Component, OnDestroy, OnInit } from "@angular/core";
import { MatDialogRef } from "@angular/material/dialog";
import { Subject } from "rxjs";

@Component({
    selector: 'comment-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:twitch'"></mat-icon>
        <mat-label class="self-center">Viết bình luận</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <quill-editor class="w-full mt-2" [(ngModel)]="comment" theme="snow" format="html" [ngStyle]="{height: '100px'}" placeholder="Nhận xét của bạn">
            <div quill-editor-toolbar>
                <span class="ql-formats">
                    <button class="ql-bold"></button>
                    <button class="ql-italic"></button>
                    <button class="ql-underline"></button>
                </span>

                <span class="ql-formats">
                    <button class="ql-blockquote"></button>
                    <button class="ql-code-block"></button>
                    <button class="ql-link"></button>
                </span>
            </div>
        </quill-editor>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button color="primary" (click)="save($event)">
            <mat-icon class="icon-size-4" [svgIcon]="'feather:send'"></mat-icon>
            <mat-label class="ml-2">Gửi bình luận</mat-label>
        </button>

        <button mat-flat-button color="medium" (click)="close()" class="ml-2">Đóng cửa sổ</button>
    </div>`,
})
export class CommentDialog implements OnInit, OnDestroy {
    comment: string = '';
    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        public dialogRef: MatDialogRef<CommentDialog>
    ) { }

    ngOnInit(): void {
        // Create the form
    }

    save(event: MouseEvent): void {
        this.dialogRef.close({
            comment: this.comment
        });

        event.preventDefault();
    }

    close() {
        this.dialogRef.close();
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}