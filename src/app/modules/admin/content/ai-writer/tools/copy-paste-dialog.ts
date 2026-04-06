import { Component, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { marked } from 'marked';
import * as uuid from 'uuid';
import * as $ from 'jquery';

@Component({
    selector: 'chatgpt-paste-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:copy'"></mat-icon>
        <mat-label class="self-center">Paste nội dung</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="chatgptForm">
            <mat-form-field class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0" [subscriptSizing]="'dynamic'">
                <!-- Sửa lại (paste)="paste($event)" cho đúng chuẩn cú pháp Angular -->
                <textarea class="max-h-80 min-h-40 px-2" [formControlName]="'chatgpt'" [placeholder]="'Chỉ cần copy và paste nội dung mong muốn vào đây.'" type="text" (paste)="paste($event)" (keyup.enter)="send()" required matInput cdkTextareaAutosize></textarea>

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

    markdown2html(source: string) {
        // Cấu hình gfm: true để bắt buộc hỗ trợ Github Flavored Markdown (bao gồm Table)
        // breaks: true để giữ nguyên các dấu xuống dòng của text thường
        return marked.parse(source, { gfm: true, breaks: true }) as string;
    }

    paste(event: ClipboardEvent) {
        // 2. Lấy dữ liệu text một cách an toàn
        const textData: string = event.clipboardData?.getData('text') || '';
        if (!textData) return;

        // 3. Parse TOÀN BỘ văn bản Markdown sang HTML TRƯỚC.
        const fullHtmlStr: string = this.markdown2html(textData);

        // 4. Đưa toàn bộ HTML sinh ra vào một container ảo (DOM ảo)
        const $container = $(`<div>${fullHtmlStr}</div>`);

        // 5. Lặp qua từng phần tử top-level (ví dụ: <p>, <table>, <pre>, <ul>...)
        $container.children().each((_: number, element: HTMLElement) => {
            const $el = $(element);

            // 6. Bọc mỗi phần tử vào một thẻ div để cấp ID riêng biệt như bạn muốn
            const $wrapper = $('<div></div>')
                .append($el.clone()); // Dùng clone() để giữ nguyên toàn bộ cấu trúc phức tạp bên trong

            this.clipboard.push($wrapper.prop('outerHTML'));
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