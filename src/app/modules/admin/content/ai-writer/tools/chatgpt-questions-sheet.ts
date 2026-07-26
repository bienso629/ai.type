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
import { GenaiService } from 'app/genai.service';
import { MultiAccountService } from "app/modules/_services/multi-account.service";

@Component({
    selector: 'chatgpt-questions-sheet',
    template: `<div class="mt-4">
        <fuse-alert [appearance]="'outline'" [type]="'warning'">
            Bạn cần phải có <a href="#" [routerLink]="['/settings']">API Key</a> để Gemini hoạt động.
        </fuse-alert>
    </div>
    <!-- Form -->
    <form [formGroup]="chatgptForm" (submit)="$event.preventDefault()">
        <!-- Secret key -->
        <div class="mt-4">
            <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Nhờ Gemini lên ý tưởng, tóm tắt nội dung hoặc trả lời câu hỏi:</mat-label>
                <input [formControlName]="'chatgpt'" placeholder="Đặt vấn đề của bạn tại đây" type="text" (keyup.enter)="chatgpt(chatgptForm.get('chatgpt').value, $event)" required matInput>

                <input hidden type="file" class="file-input" (change)="upload($event)" #fileUpload>
                
                <button type="button" mat-icon-button matSuffix class="mr-1 icon-size-8" matTooltip="Đính kèm tệp" (click)="fileUpload.click()" [disabled]="loading">
                    <mat-icon class="icon-size-4 text-current" [svgIcon]="'feather:paperclip'"></mat-icon>
                </button>

                <button type="button" mat-icon-button matSuffix class="icon-size-8" matTooltip="Gửi yêu cầu AI" (click)="chatgpt(chatgptForm.get('chatgpt').value, $event)" [disabled]="loading || !chatgptForm.get('chatgpt').value">
                    <mat-icon *ngIf="!loading" class="icon-size-4 text-primary" [svgIcon]="'feather:send'"></mat-icon>
                    <mat-icon *ngIf="loading" class="animate-spin icon-size-4 text-primary" [svgIcon]="'feather:loader'"></mat-icon>
                </button>
            </mat-form-field>

            <div *ngIf="selectedFileName" class="mt-1 flex items-center bg-blue-50 px-2 py-1 rounded border border-blue-200">
                <span class="text-sm text-blue-600 font-medium">{{ selectedFileName }}</span>
                <button mat-icon-button color="warn" type="button" (click)="removeFile()" class="ml-1" style="width: 24px; height: 24px; line-height: 24px;">
                    <mat-icon style="font-size: 18px;">close</mat-icon>
                </button>
            </div>

            <div *ngIf="!selectedFileName" class="mt-0 text-md text-hint">Đính kèm tệp để AI phân tích.</div>
        </div>
    </form>

    <!-- Separator -->
    <div class="flex items-center mt-8">
        <div class="flex-auto mt-px border-t"></div>
        <div class="mx-2 text-secondary text-base">Hoặc sử dụng những câu hỏi gợi ý dưới đây</div>
        <div class="flex-auto mt-px border-t"></div>
    </div>

    <mat-nav-list>
        <a class="hover:bg-gray-50 my-2 border p-2 rounded-lg" mat-list-item (click)="setvalue(data.content + ' là gì?')">
        <span matListItemTitle>{{data.content}} là gì?</span>
        </a>

        <a class="hover:bg-gray-50 my-2 border p-2 rounded-lg" mat-list-item (click)="setvalue(data.content + ' là ai?')">
        <span matListItemTitle>{{data.content}} là ai?</span>
        </a>

        <a class="hover:bg-gray-50 my-2 border p-2 rounded-lg" mat-list-item (click)="setvalue('Tại sao nên sử dụng ' + data.content + '?')">
        <span matListItemTitle>Tại sao lại sử dụng {{data.content}}?</span>
        </a>

        <a class="hover:bg-gray-50 my-2 border p-2 rounded-lg" mat-list-item (click)="setvalue('Hỏi về cách sử dụng ' + data.content + '?')">
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

    // ai: any;

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
                this.toastr.info('Đang xử lý file...');
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(this.files);
                });
                parts.push({
                    inlineData: {
                        data: base64Data,
                        mimeType: this.files.type
                    }
                });
            }

            // Gửi toàn bộ nội dung
            const result = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: parts.map(p => typeof p === 'string' ? { text: p } : p) }]
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
            question: question,
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
        private _genaiService: GenaiService,
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
        // let geminiKey = this.secretKey[3] || this.secretKey[0];
        // if (!geminiKey) {
        //     this.toastr.warning('Không tìm thấy API Key.');
        // } else {
        //     this.ai = new GoogleGenAI({ apiKey: geminiKey });
        // }

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
