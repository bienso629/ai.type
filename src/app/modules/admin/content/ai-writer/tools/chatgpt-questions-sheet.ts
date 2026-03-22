import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from "@angular/core";
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
import { GoogleGenAI, createPartFromUri } from "@google/genai";
import { MultiAccountService } from "app/modules/_services/multi-account.service";

@Component({
    selector: 'chatgpt-questions-sheet',
    template: `<div class="mt-4">
        <fuse-alert [appearance]="'outline'" [type]="'warning'">
            Có thể bạn cần API key để <a href="#" [routerLink]="['/settings']">kết nối</a> với Gemini?.
        </fuse-alert>
    </div>
    <!-- Form -->
    <form [formGroup]="chatgptForm" (submit)="$event.preventDefault()">
        <!-- Secret key -->
        <div class="mt-4">
            <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Bạn hỏi Gemini trả lời</mat-label>
                <!-- <mat-icon class="icon-size-4" [svgIcon]="'feather:message-circle'" matPrefix></mat-icon> -->
                <input [formControlName]="'chatgpt'" placeholder="Xin chào! Bạn muốn hỏi về vấn đề gì?" type="text" (keyup.enter)="chatgpt(chatgptForm.get('chatgpt').value, $event)" required matInput>

                <input hidden type="file" accept="application/pdf" class="file-input" (change)="upload($event)" #fileUpload>
                <a mat-icon-button matSuffix class="ml-0" [matTooltip]="'Upload file lên CDN'" (click)="fileUpload.click()" [disabled]="loading">
                    <mat-icon *ngIf="!loading" class="icon-size-4 text-current" [svgIcon]="'feather:file'"></mat-icon>
                    <mat-icon *ngIf="loading" class="animate-spin icon-size-5 text-primary" [svgIcon]="'feather:loader'"></mat-icon>
                </a>
            </mat-form-field>

            <div *ngIf="selectedFileName" class="mt-1 flex items-center bg-blue-50 px-2 py-1 rounded border border-blue-200">
                <span class="text-sm text-blue-600 font-medium">{{ selectedFileName }}</span>
                <button mat-icon-button color="warn" type="button" (click)="removeFile()" class="ml-1" style="width: 24px; height: 24px; line-height: 24px;">
                    <mat-icon style="font-size: 18px;">close</mat-icon>
                </button>
            </div>

            <div *ngIf="!selectedFileName" class="mt-1 text-md text-hint">Đặt câu hỏi càng rõ ràng càng tốt cho Gemini trả lời</div>
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

    loading: boolean = false;

    ai: any;

    @ViewChild('fileUpload') fileUpload: ElementRef; // Khai báo ViewChild
    selectedFileName: string = '';
    files: File | null = null;

    chatgptKey: String;
    type: string = 'warning';

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    upload = (e: any) => {
        const fileList: FileList = e.target.files;
        if (fileList && fileList.length > 0) {
            this.files = fileList[0];
            this.selectedFileName = this.files.name;
        }
    }

    removeFile(): void {
        this.files = null;
        this.selectedFileName = '';
        if (this.fileUpload) this.fileUpload.nativeElement.value = '';
    }

    setvalue(question: string) {
        this.chatgptForm.setValue({
            chatgpt: question
        });
    }

    async chatgpt(question: string, event?: Event) {
        // CHẶN SUBMIT MẶC ĐỊNH NGAY LẬP TỨC
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (!question) {
            this.toastr.warning('Xin lỗi! Bạn chưa có prompt.');
            return;
        }

        try {
            this.loading = true;
            this.chatgptForm.get('chatgpt').disable();
            let parts: any[] = [question];

            if (this.files) {
                this.toastr.info('Đang tải file lên Gemini...');

                // Upload lên Google File API
                const uploadResponse = await this.ai.files.upload({
                    file: this.files,
                    config: { displayName: this.selectedFileName }
                });

                // Chờ xử lý (Polling)
                let getFile = await this.ai.files.get({ name: uploadResponse.name });
                while (getFile.state === 'PROCESSING') {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    getFile = await this.ai.files.get({ name: uploadResponse.name });
                }

                if (getFile.state === 'FAILED') throw new Error('File lỗi');

                // Tạo part từ URI
                const filePart = createPartFromUri(getFile.uri, getFile.mimeType);
                parts.push(filePart);
            }

            // Gửi toàn bộ nội dung
            const result = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash', // Dùng bản 2.0 ổn định
                contents: parts
            });

            if (result.text) {
                this.openchatgpt({ question, answer: result.text });
            }
        } catch (error) {
            console.error("Lỗi Gemini:", error);
            this.loading = false;
            // Nếu vẫn báo lỗi API Key, hãy thử kiểm tra xem chuỗi geminiKey có bị trống không
            this.toastr.error('Lỗi: ' + error.message);
        } finally {
            this.chatgptForm.get('chatgpt').enable();
            this.loading = false;
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

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _bottomSheetRef: MatBottomSheetRef<ChatGPTQuestionSheet>,
        private toastr: ToastrService,
        private _chatGPTService: ChatGPTService,
        private _userService: UserService,
        public dialog: MatDialog,
        private multiAccountService: MultiAccountService,
        @Inject(MAT_BOTTOM_SHEET_DATA) public data: { content: string }
    ) {
        // lấy secretKey và searchAPIKey
        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;
            this.chatgptKey = this.settings.secretKey;

        }

        // Lấy key từ settings của bạn
        let geminiKey = this.secretKey[3] || this.secretKey[0];
        if (!geminiKey) {
            this.toastr.warning('Không tìm thấy API Key.');
        } else {
            this.ai = new GoogleGenAI({ apiKey: geminiKey });
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

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
