import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {
    UntypedFormBuilder,
    UntypedFormGroup,
    Validators,
} from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { marked } from 'marked';
import * as $ from 'jquery';
import * as uuid from 'uuid';

@Component({
    selector: 'chatgpt-paste-dialog',
    template: `<div class="flex items-center justify-between mb-4">
            <div class="text-2xl font-bold text-gray-800 tracking-tight">
                Paste nội dung đã copy
            </div>
            <button mat-icon-button mat-dialog-close type="button">
                <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
            </button>
        </div>

        <div mat-dialog-content class="mt-4 p-0">
            <form [formGroup]="chatgptForm">
                <mat-form-field
                    class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0"
                    [subscriptSizing]="'dynamic'"
                >
                    <textarea
                        class="max-h-80 min-h-40 px-2"
                        [formControlName]="'chatgpt'"
                        [placeholder]="'Chỉ cần copy và paste nội dung mong muốn vào đây.'"
                        type="text"
                        required
                        matInput
                        cdkTextareaAutosize
                    ></textarea>
                </mat-form-field>
            </form>
        </div>

        <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
            <button
                mat-flat-button
                (click)="sendTxt()"
                color="primary"
                class=""
            >
                Định dạng Plain Text
            </button>
            <button
                mat-flat-button
                (click)="sendMarkdown()"
                color="warn"
                class=""
            >
                Định dạng Markdown
            </button>
        </div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class CopyPasteDialog implements OnInit {
    chatgptForm: UntypedFormGroup;
    clipboard: Array<String> = [];

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<CopyPasteDialog>,
    ) {}

    ngOnInit(): void {
        // Create the form
        this.chatgptForm = this._formBuilder.group({
            chatgpt: ['', Validators.required],
        });
    }

    sendTxt() {
        let textData = this.chatgptForm.controls['chatgpt'].value;

        textData = textData.split(/\r?\n|\r|\n/g);
        textData.map((text: String, _index: number) => {
            if (text && text.length > 0) {
                this.clipboard.push(
                    `<p id="source-text-${uuid.v4()}">${text}</p>`,
                );
            }
        });

        this.dialogRef.close({
            clipboard: this.clipboard,
        });
    }

    sendMarkdown() {
        let textData = this.chatgptForm.controls['chatgpt'].value;

        // 3. Parse toàn bộ Markdown sang HTML để giữ nguyên cấu trúc phức tạp
        const fullHtmlStr: string = marked.parse(textData) as string;
        console.log('fullHtmlStr', fullHtmlStr);
        // 4. Bọc vào một thẻ div ảo để jQuery dễ dàng lặp qua các top-level elements
        const $container = $(`<div>${fullHtmlStr}</div>`);

        // 5. Lặp qua từng node con (p, pre, table, ul, h1...), gán ID và đẩy vào clipboard
        $container.children().each((_: number, element: HTMLElement) => {
            const $el = $(element);

            // Bọc (wrap) phần tử gốc vào một div để không làm vỡ CSS hay cấu trúc của thẻ đặc biệt (pre, code, table)
            const $wrapper = $('<div></div>').append($el.clone()); // Dùng clone() để bảo toàn khoảng trắng, newlines bên trong thẻ pre

            this.clipboard.push($wrapper.prop('outerHTML'));
        });

        this.dialogRef.close({
            clipboard: this.clipboard,
        });
    }

    onNoClick(): void {
        this.dialogRef.close();
    }
}
