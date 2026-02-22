import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { MatDialog } from "@angular/material/dialog";
import { ChatGPTDataDialog } from 'app/modules/admin/content/ai-writer/tools/chatgpt-data-dialog';
import { UserService } from "app/core/user/user.service";
import { User } from "app/core/user/user.types";
import { ChatGPTService } from "app/modules/_services/chatgpt";
import { Subject, takeUntil } from "rxjs";

import * as uuid from 'uuid';
import { ToastrService } from "ngx-toastr";
import { GoogleGenAI } from "@google/genai";

@Component({
    selector: 'chatgpt-questions-sheet',
    template: `<div class="mt-4">
        <fuse-alert [appearance]="'outline'" [type]="'warning'">
            Có thể bạn cần <a href="#" [routerLink]="['/settings']">kết nối</a> với Gemini?.
        </fuse-alert>
    </div>
    <!-- Form -->
    <form [formGroup]="chatgptForm">
        <!-- Secret key -->
        <div class="mt-4">
            <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Hỏi Gemini</mat-label>
                <!-- <mat-icon class="icon-size-4" [svgIcon]="'feather:message-circle'" matPrefix></mat-icon> -->
                <input [formControlName]="'chatgpt'" placeholder="Xin chào! Bạn muốn hỏi về vấn đề gì?" type="text" (keyup.enter)="ask()" required matInput>
                <mat-icon class="icon-size-4" matSuffix [svgIcon]="'feather:message-circle'"></mat-icon>
            </mat-form-field>

            <div class="mt-1 text-md text-hint">Đặt câu hỏi càng rõ ràng càng tốt cho Gemini trả lời</div>
        </div>
    </form>

    <!-- Separator -->
    <div class="flex items-center mt-8">
        <div class="flex-auto mt-px border-t"></div>
        <div class="mx-2 text-secondary text-base">Hoặc sử dụng những câu hỏi gợi ý dưới đây</div>
        <div class="flex-auto mt-px border-t"></div>
    </div>

    <mat-nav-list>
        <a class="hover:bg-grey-50 my-2 border p-2 rounded" mat-list-item (click)="setvalue(data.content + ' là gì?')">
        <span matListItemTitle>{{data.content}} là gì?</span>
        </a>

        <a class="hover:bg-grey-50 my-2 border p-2 rounded" mat-list-item (click)="setvalue(data.content + ' là ai?')">
        <span matListItemTitle>{{data.content}} là ai?</span>
        </a>

        <a class="hover:bg-grey-50 my-2 border p-2 rounded" mat-list-item (click)="setvalue('Tại sao nên sử dụng ' + data.content + '?')">
        <span matListItemTitle>Tại sao lại sử dụng {{data.content}}?</span>
        </a>

        <a class="hover:bg-grey-50 my-2 border p-2 rounded" mat-list-item (click)="setvalue('Hỏi về cách sử dụng ' + data.content + '?')">
        <span matListItemTitle>Hỏi về cách sử dụng {{data.content}}?</span>
        </a>
    </mat-nav-list>`,
    providers: [ChatGPTService]
})

export class ChatGPTQuestionSheet implements OnInit, OnDestroy {
    user: User;
    chatgptForm: UntypedFormGroup;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    ai: any;

    chatgptKey: String;
    type: string = 'warning';

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _bottomSheetRef: MatBottomSheetRef<ChatGPTQuestionSheet>,
        private toastr: ToastrService,
        private _chatGPTService: ChatGPTService,
        private _userService: UserService,
        public dialog: MatDialog,
        @Inject(MAT_BOTTOM_SHEET_DATA) public data: { content: string }
    ) {
        // lấy secretKey và searchAPIKey
        this.settings = localStorage.getItem('settings');
        if (this.settings) {
            this.settings = JSON.parse(this.settings);
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;

            this.chatgptKey = this.settings.secretKey;
        }

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnInit(): void {
        // Create the form
        this.chatgptForm = this._formBuilder.group({
            chatgpt: ['', Validators.required]
        });
    }

    setvalue(question: string) {
        this.chatgptForm.setValue({
            chatgpt: question
        });
    }

    ask() {
        this.chatgptForm.get('chatgpt').disable();
        this.chatgpt(this.chatgptForm.get('chatgpt').value);
    }

    async chatgpt(question: string, index?: number) {
        if (question) {
            if (this.secretKey) {
                let geminiKey = this.secretKey[0];

                if (this.secretKey[3]) {
                    geminiKey = this.secretKey[3];
                }

                this.ai = new GoogleGenAI({ apiKey: geminiKey }); // ok rooi

                const prompt = `Trả lời câu hỏi: "${question}" một cách chi tiết và chính xác.`;

                const result = await this.ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });

                if (result && result.text) {
                    this.openchatgpt({
                        question: question,
                        answer: result.text
                    });
                } else {
                    this.toastr.warning('Kiểm tra trạng thái của Type Lite.');
                }

                this.chatgptForm.get('chatgpt').enable();
            } else {
                this.toastr.warning('Xin lỗi! Bạn chưa kết nối với Gemini.');
            }
        } else {
            this.toastr.warning('Xin lỗi! Bạn chưa có prompt.');
        }
    }

    chatgptStore(answer: string, question: string) {
        this._chatGPTService.store({
            content: question,
            answer: answer,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        // cập nhật tính toán
                        this.toastr.success('Gemini đã trả lời bạn.');
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Gemini của bạn chưa được bật.');
                },
                complete: () => { }
            });
    }

    openchatgpt(data: { question: string, answer: string }) {
        const dialogRef = this.dialog.open(ChatGPTDataDialog, {
            width: '680px',
            data: data
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this._bottomSheetRef.dismiss({
                    result: `<p id="source-chatgpt-${uuid.v4()}">${result}</p>`
                });
            }
        });
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
