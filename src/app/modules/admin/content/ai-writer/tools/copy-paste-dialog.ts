import { Component, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";

import * as uuid from 'uuid';

@Component({
    selector: 'chatgpt-paste-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:copy'"></mat-icon>
        <mat-label class="self-center">Paste nội dung</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="chatgptForm">
            <mat-form-field class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0" [subscriptSizing]="'dynamic'">
                <textarea class="max-h-80 min-h-40 px-2" [formControlName]="'chatgpt'" [placeholder]="'Chỉ cần copy và paste nội dung mong muốn vào đây.'" type="text" (paste)=paste($event) (keyup.enter)="send()" required matInput cdkTextareaAutosize></textarea>

                <!-- <button mat-icon-button type="button" matSuffix>
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:clipboard'"></mat-icon>
                </button> -->
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button (click)="send()" color="primary" class="float-right">
            Sử dụng nội dung này
        </button>
        <button mat-flat-button (click)="onNoClick()" color="medium" class="float-right">Đóng cửa sổ</button>
    </div>`,
})
export class CopyPasteDialog implements OnInit {
    chatgptForm: UntypedFormGroup;
    clipboard: Array<String> = [];

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<CopyPasteDialog>,
    ) { }

    ngOnInit(): void {
        // Create the form
        this.chatgptForm = this._formBuilder.group({
            chatgpt: ['', Validators.required]
        });
    }

    paste(event: ClipboardEvent) {
        let data: any = event.clipboardData.getData('text');
        data = data.split(/\r?\n|\r|\n/g);
        data.map((text: String, _index: number) => {
            if (text && text.length > 0) {
                this.clipboard.push(`<p id="source-text-${uuid.v4()}">${text}</p>`);
            }
        });
    }

    send(): void {
        this.dialogRef.close({
            clipboard: this.clipboard
        });
    }

    onNoClick(): void {
        this.dialogRef.close();
    }
}