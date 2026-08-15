import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MXHAutoService } from "app/_services/mxhauto";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

@Component({
    selector: 'opera-ai-dialog',
    template: `
    <div class="flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="shrink-0 pb-1">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
                    <mat-icon [svgIcon]="'feather:cpu'" class="text-purple-600 icon-size-5"></mat-icon>
                    <span>Tương tác Opera AI (Aria) - {{ data.profile }}</span>
                </div>
                <button type="button" mat-icon-button (click)="onNoClick()">
                    <mat-icon [svgIcon]="'feather:x'"></mat-icon>
                </button>
            </div>

            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Hỏi đáp trực tiếp và tự động tương tác với trợ lý Opera AI (Aria).
            </p>
        </div>

        <!-- Body -->
        <div class="flex flex-col gap-3">
            <!-- Input Area -->
            <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Câu hỏi cho Aria AI</mat-label>
                <input matInput type="text" [(ngModel)]="promptText" (keyup.enter)="askAi()" [disabled]="isLoading" placeholder="Ví dụ: Tóm tắt tin tức mới nhất...">
                <button mat-icon-button matSuffix (click)="askAi()" [disabled]="isLoading || !promptText.trim()" class="text-purple-600 hover:text-purple-700">
                    <mat-icon class="icon-size-4" [svgIcon]="'heroicons_solid:paper-airplane'"></mat-icon>
                </button>
            </mat-form-field>

            <!-- Loading state -->
            <div *ngIf="isLoading" class="flex items-center justify-center p-3 space-x-2 text-purple-600 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-900/30">
                <mat-icon class="animate-spin icon-size-4" [svgIcon]="'feather:loader'"></mat-icon>
                <span class="text-sm font-medium">Aria AI đang suy nghĩ và phản hồi...</span>
            </div>

            <!-- Answer Card -->
            <div *ngIf="lastAnswer" class="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center justify-between text-xs font-semibold text-purple-700 dark:text-purple-300">
                    <span>CÂU TRẢ LỜI TỪ ARIA AI:</span>
                </div>
                <div class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                    {{ lastAnswer }}
                </div>
            </div>

            <!-- Suggestions Section -->
            <div *ngIf="suggestions && suggestions.length > 0" class="space-y-2 pt-1">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">💡 Câu hỏi gợi ý tiếp theo:</span>
                <div class="flex flex-wrap gap-2">
                    <button *ngFor="let sug of suggestions; let i = index" (click)="clickSuggestion(i, sug)" [disabled]="isLoading"
                        class="text-xs bg-white dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 rounded-full px-3 py-1.5 transition flex items-center space-x-1 cursor-pointer">
                        <span>✨ {{ sug }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex items-center justify-end gap-3 mt-5 pt-2">
            <button mat-button (click)="onNoClick()" class="text-gray-600 dark:text-gray-300 font-medium">Đóng</button>
            <button mat-flat-button [color]="'primary'" (click)="askAi()" [disabled]="isLoading || !promptText.trim()">
                <mat-icon class="icon-size-4" [svgIcon]="'heroicons_solid:paper-airplane'"></mat-icon>
                <span class="ml-2">Gửi câu hỏi</span>
            </button>
        </div>
    </div>
    `
})
export class OperaAiDialog implements OnInit, OnDestroy {
    promptText: string = '';
    lastAnswer: string = '';
    suggestions: string[] = [];
    isLoading: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        public dialogRef: MatDialogRef<OperaAiDialog>,
        @Inject(MAT_DIALOG_DATA) public data: { profile: string, profiles_root?: string },
        private _mxhautoService: MXHAutoService,
        private toastr: ToastrService
    ) {}

    ngOnInit(): void {}

    askAi() {
        if (!this.promptText.trim() || this.isLoading) return;
        const q = this.promptText.trim();
        this.isLoading = true;
        this.suggestions = [];

        const profilesRoot = this.data.profiles_root || localStorage.getItem('opera_profiles_root') || '';

        this._mxhautoService.askOperaAi({
            profile: this.data.profile,
            profiles_root: profilesRoot,
            prompt: q,
            timeout_s: 30.0
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                this.isLoading = false;
                if (res && res.ok !== false) {
                    this.lastAnswer = res.answer || res.response || 'Đã gửi thành công.';
                    this.suggestions = res.suggestions || [];
                    this.promptText = '';
                } else {
                    this.toastr.error(res?.message || 'Không thể kết nối Opera AI. Vui lòng đảm bảo Opera profile đang chạy và tính năng Aria AI đã đăng nhập.');
                }
            },
            error: (err) => {
                this.isLoading = false;
                this.toastr.error('Lỗi khi gửi yêu cầu tới Opera AI. Vui lòng thử lại sau.');
            }
        });
    }

    clickSuggestion(idx: number, sugText: string) {
        if (this.isLoading) return;
        this.isLoading = true;

        const profilesRoot = this.data.profiles_root || localStorage.getItem('opera_profiles_root') || '';

        this._mxhautoService.clickAiSuggestion({
            profile: this.data.profile,
            profiles_root: profilesRoot,
            suggestion_index: idx,
            suggestion_text: sugText,
            timeout_s: 30.0
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                this.isLoading = false;
                if (res && res.ok !== false) {
                    this.lastAnswer = res.answer || res.response || 'Đã nhấp gợi ý.';
                    this.suggestions = res.new_suggestions || res.suggestions || [];
                } else {
                    this.toastr.error('Lỗi khi click câu hỏi gợi ý');
                }
            },
            error: () => {
                this.isLoading = false;
                this.toastr.error('Lỗi khi gửi yêu cầu tới Opera AI');
            }
        });
    }

    onNoClick(): void {
        this.dialogRef.close();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
