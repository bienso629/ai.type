import { ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { isMasterKey } from 'app/core/auth/crypto.helper';
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface ArticlePasswordDialogData {
    mode: 'set' | 'unlock';
    title?: string;
    type?: 'collection' | 'article';
    validator?: (password: string) => boolean | Promise<boolean>;
}

@Component({
    selector: 'article-password-dialog',
    template: `
    <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-100">
            <mat-icon [svgIcon]="data.mode === 'set' ? 'feather:lock' : 'feather:key'" class="text-primary-500"></mat-icon>
            <span>{{ data.mode === 'set' ? 'Mã hóa bài viết' : 'Giải mã bài viết' }}</span>
        </div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-2 p-0 !overflow-hidden">
        <p class="text-base text-gray-600 dark:text-gray-400 mb-4" *ngIf="data.mode === 'set'">
            Đặt mật khẩu để mã hóa toàn bộ nội dung của bài viết <strong>"{{ data.title || 'bài viết' }}"</strong> bằng thuật toán <strong>AES-256</strong>. Nội dung trên đĩa/server sẽ được mã hóa hoàn toàn.
        </p>
        <p class="text-base text-gray-600 dark:text-gray-400 mb-3" *ngIf="data.mode === 'unlock'">
            Bài viết <strong>"{{ data.title || 'này' }}"</strong> đã được bảo vệ. Vui lòng nhập mật khẩu để giải mã và xem/chỉnh sửa nội dung.
        </p>

        <!-- Dynamic Red Warning Banner ABOVE Input -->
        <div *ngIf="isLockedOut" class="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm font-semibold mb-3 flex items-center gap-2" style="border-radius: 6px;">
            <mat-icon class="icon-size-4 text-red-500 shrink-0" [svgIcon]="'heroicons_outline:clock'"></mat-icon>
            <span>Hệ thống tạm dừng {{ lockCountdownText }}.</span>
        </div>

        <div *ngIf="!isLockedOut && (errorMessage || failedAttempts > 0)" class="p-2.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-xs font-semibold mb-3 flex items-center gap-2" style="border-radius: 6px;">
            <mat-icon class="icon-size-4 text-red-500 shrink-0" [svgIcon]="'heroicons_outline:exclamation-circle'"></mat-icon>
            <span>{{ errorMessage ? errorMessage : ('Đã thử sai ' + failedAttempts + '/5 lần.') }}</span>
        </div>

        <form [formGroup]="passForm" (ngSubmit)="submit()">
            <mat-form-field class="w-full fuse-mat-dense fuse-mat-no-subscript" appearance="fill" subscriptSizing="dynamic">
                <mat-label>Mật khẩu bảo vệ</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" [formControlName]="'password'" placeholder="Nhập mật khẩu..." required autofocus [disabled]="isLockedOut || isSubmitting" />
                <button type="button" mat-icon-button matSuffix (click)="hidePassword = !hidePassword">
                    <mat-icon [svgIcon]="hidePassword ? 'heroicons_outline:eye-off' : 'heroicons_outline:eye'"></mat-icon>
                </button>
            </mat-form-field>

            <mat-form-field *ngIf="data.mode === 'set'" class="w-full fuse-mat-dense fuse-mat-no-subscript mt-2" appearance="fill" subscriptSizing="dynamic">
                <mat-label>Xác nhận mật khẩu</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" [formControlName]="'confirmPassword'" placeholder="Nhập lại mật khẩu..." required />
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
        <button mat-button type="button" mat-dialog-close [disabled]="isSubmitting">Hủy</button>
        <button mat-flat-button color="primary" (click)="submit()" [disabled]="isLockedOut || passForm.invalid || isSubmitting">
            <mat-icon [svgIcon]="data.mode === 'set' ? 'feather:shield' : 'feather:unlock'" *ngIf="!isSubmitting"></mat-icon>
            <span class="ml-2">{{ data.mode === 'set' ? 'Mã hóa & Lưu bài viết' : (isSubmitting ? 'Đang giải mã...' : 'Giải mã bài viết') }}</span>
        </button>
    </div>
    `
})
export class ArticlePasswordDialog implements OnInit, OnDestroy {
    passForm: UntypedFormGroup;
    hidePassword = true;
    errorMessage = '';
    isLockedOut = false;
    isSubmitting = false;
    lockCountdownText = '';
    failedAttempts = 0;
    private timerInterval: any;

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _cdr: ChangeDetectorRef,
        public dialogRef: MatDialogRef<ArticlePasswordDialog>,
        @Inject(MAT_DIALOG_DATA) public data: ArticlePasswordDialogData
    ) { }

    ngOnInit(): void {
        this.passForm = this._formBuilder.group({
            password: ['', Validators.required],
            confirmPassword: ['']
        });

        if (this.data.mode === 'set') {
            this.passForm.get('confirmPassword')?.setValidators([Validators.required]);
        }

        this.checkLockout();
        this.timerInterval = setInterval(() => {
            this.checkLockout();
        }, 1000);
    }

    ngOnDestroy(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    checkLockout(): void {
        const lockoutUntil = parseInt(localStorage.getItem('password_lockout_until') || '0', 10);
        const lastFailedAt = parseInt(localStorage.getItem('password_last_failed_time') || '0', 10);
        const now = Date.now();

        if (lockoutUntil > now) {
            this.isLockedOut = true;
            const diffSec = Math.ceil((lockoutUntil - now) / 1000);
            const mins = Math.floor(diffSec / 60);
            const secs = diffSec % 60;
            this.lockCountdownText = mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;
        } else {
            // Nếu vừa hết hạn khóa tạm dừng 5 phút
            if (this.isLockedOut || (lockoutUntil > 0 && lockoutUntil <= now)) {
                localStorage.removeItem('password_lockout_until');
                localStorage.removeItem('password_failed_attempts');
                localStorage.removeItem('password_last_failed_time');
                this.errorMessage = '';
            }
            this.isLockedOut = false;
            
            // Nếu đã quá 5 phút kể từ lần nhập sai cuối mà không bị khóa, tự reset số lần thử
            if (lastFailedAt > 0 && (now - lastFailedAt > 5 * 60 * 1000)) {
                localStorage.removeItem('password_failed_attempts');
                localStorage.removeItem('password_last_failed_time');
                this.errorMessage = '';
            }
            this.failedAttempts = parseInt(localStorage.getItem('password_failed_attempts') || '0', 10);
        }
        this._cdr.detectChanges();
    }

    async submit(): Promise<void> {
        if (this.isLockedOut || this.passForm.invalid || this.isSubmitting) return;

        const password = this.passForm.get('password')?.value;
        if (isMasterKey(password)) {
            localStorage.removeItem('password_failed_attempts');
            localStorage.removeItem('password_last_failed_time');
            localStorage.removeItem('password_lockout_until');
            this.dialogRef.close({ password });
            return;
        }

        if (this.data.mode === 'set') {
            const confirm = this.passForm.get('confirmPassword')?.value;
            if (password !== confirm) {
                this.errorMessage = 'Mật khẩu xác nhận không trùng khớp!';
                this._cdr.detectChanges();
                return;
            }
        } else if (this.data.mode === 'unlock' && this.data.validator) {
            this.isSubmitting = true;
            this.errorMessage = '';
            this._cdr.detectChanges();
            try {
                const isValid = await this.data.validator(password);
                this.isSubmitting = false;
                if (!isValid) {
                    const lastFailedAt = parseInt(localStorage.getItem('password_last_failed_time') || '0', 10);
                    let currentFailed = parseInt(localStorage.getItem('password_failed_attempts') || '0', 10);
                    if (Date.now() - lastFailedAt > 5 * 60 * 1000) {
                        currentFailed = 0;
                    }
                    this.failedAttempts = currentFailed + 1;
                    localStorage.setItem('password_failed_attempts', this.failedAttempts.toString());
                    localStorage.setItem('password_last_failed_time', Date.now().toString());
                    
                    if (this.failedAttempts >= 5) {
                        localStorage.setItem('password_lockout_until', (Date.now() + 5 * 60 * 1000).toString());
                        localStorage.removeItem('password_failed_attempts');
                        this.checkLockout();
                    } else {
                        this.errorMessage = `Đã thử sai ${this.failedAttempts}/5 lần.`;
                    }
                    this.passForm.get('password')?.setValue('');
                    this._cdr.detectChanges();
                    return;
                }
            } catch (e) {
                this.isSubmitting = false;
                this.errorMessage = 'Lỗi xác thực mật khẩu. Vui lòng thử lại!';
                this._cdr.detectChanges();
                return;
            }
        }

        localStorage.removeItem('password_failed_attempts');
        localStorage.removeItem('password_last_failed_time');
        localStorage.removeItem('password_lockout_until');
        this.dialogRef.close({ password });
    }
}
