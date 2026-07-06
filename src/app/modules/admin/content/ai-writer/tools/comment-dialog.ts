import { Component, OnDestroy, OnInit } from "@angular/core";
import { MatDialogRef } from "@angular/material/dialog";
import { Subject } from "rxjs";

@Component({
    selector: 'comment-dialog',
    template: `<div class="flex items-center justify-between mb-4">
        <div class="text-2xl font-bold text-gray-800 tracking-tight">Viết ghi chú</div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-2 p-0">
        <quill-editor class="w-full comment-editor" [(ngModel)]="comment" theme="snow" format="html" [ngStyle]="{height: '100px'}" placeholder="Nhận xét của bạn">
            <div quill-editor-toolbar> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <select class="ql-header hover:bg-slate-100"> <option value="1">Heading</option> <option value="2">Subheading</option> <option selected>Normal</option> </select> </span> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <button class="ql-bold !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> <button class="ql-italic !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> <button class="ql-underline !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> </span> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <button class="ql-list !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" value="ordered"></button> <button class="ql-list !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" value="bullet"></button> <select class="ql-align !border !border-solid !border-slate-300 rounded hover:bg-slate-100"> <option label="left" selected></option> <option label="center" value="center"></option> <option label="right" value="right"></option> <option label="justify" value="justify"></option> </select> </span> <span class="ql-formats inline-flex gap-1 mb-1"> 
                <button class="ql-blockquote !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Quote"><mat-icon class="icon-size-4" [svgIcon]="'feather:message-square'"></mat-icon></button>
                <button class="ql-code-block !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Code"><mat-icon class="icon-size-4" [svgIcon]="'feather:code'"></mat-icon></button> 
                <button class="ql-link !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Link"><mat-icon class="icon-size-4" [svgIcon]="'feather:link'"></mat-icon></button> 
                <button class="ql-image !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Image"><mat-icon class="icon-size-4" [svgIcon]="'feather:image'"></mat-icon></button> 
                <button class="ql-video !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Video"><mat-icon class="icon-size-4" [svgIcon]="'feather:film'"></mat-icon></button> 
                <button class="ql-clean !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Clear Formatting"><mat-icon class="icon-size-4" [svgIcon]="'feather:delete'"></mat-icon></button> 
            </span> </div>
        </quill-editor>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-end gap-2">
    <button mat-flat-button color="primary" (click)="save($event)">
            <mat-icon class="icon-size-4" [svgIcon]="'feather:send'"></mat-icon>
            <mat-label class="ml-2">Lưu ghi chú</mat-label>
        </button>
</div>`,
    styles: [`
        ::ng-deep .comment-editor .ql-container {
            min-height: 100px !important;
        }
        ::ng-deep .comment-editor .ql-editor {
            padding: 4px !important;
            min-height: 100px !important;
        }
    `]
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