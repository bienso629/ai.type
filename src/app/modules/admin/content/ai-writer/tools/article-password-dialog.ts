import { Component, Inject, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface ArticlePasswordDialogData {
    mode: 'set' | 'unlock';
    title?: string;
}

@Component({
    selector: 'article-password-dialog',
    template: `
    <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-100">
            <mat-icon [svgIcon]="data.mode === 'set' ? 'feather:lock' : 'feather:key'" class="text-primary-500"></mat-icon>
            <span>{{ data.mode === 'set' ? 'Mã hóa bài viết / kịch bản' : 'Giải mã nội dung bài viết' }}</span>
        </div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-2 p-0">
        <p class="text-base text-gray-600 dark:text-gray-400 mb-4" *ngIf="data.mode === 'set'">
            Đặt mật khẩu để mã hóa toàn bộ nội dung của <strong>"{{ data.title || 'bài viết' }}"</strong> bằng thuật toán mã hóa <strong>AES-256</strong>. Nội dung trên đĩa/server sẽ được mã hóa hoàn toàn và chỉ mở được khi nhập đúng mật khẩu.
        </p>
        <p class="text-base text-gray-600 dark:text-gray-400 mb-4" *ngIf="data.mode === 'unlock'">
            Bài viết/kịch bản <strong>"{{ data.title || 'này' }}"</strong> đã được bảo vệ. Vui lòng nhập mật khẩu để giải mã và tiếp tục đọc/chỉnh sửa.
        </p>

        <form [formGroup]="passForm" (ngSubmit)="submit()">
            <mat-form-field class="w-full fuse-mat-dense" appearance="fill">
                <mat-label>Mật khẩu bảo vệ</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" [formControlName]="'password'" placeholder="Nhập mật khẩu..." required autofocus />
                <button type="button" mat-icon-button matSuffix (click)="hidePassword = !hidePassword">
                    <mat-icon [svgIcon]="hidePassword ? 'heroicons_outline:eye-off' : 'heroicons_outline:eye'"></mat-icon>
                </button>
            </mat-form-field>

            <mat-form-field *ngIf="data.mode === 'set'" class="w-full fuse-mat-dense mt-2" appearance="fill">
                <mat-label>Xác nhận mật khẩu</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" [formControlName]="'confirmPassword'" placeholder="Nhập lại mật khẩu..." required />
            </mat-form-field>

            <div *ngIf="errorMessage" class="text-red-500 text-sm mt-1 font-medium">
                {{ errorMessage }}
            </div>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
        <button mat-button type="button" mat-dialog-close>Hủy</button>
        <button mat-flat-button color="primary" (click)="submit()" [disabled]="passForm.invalid">
            <mat-icon [svgIcon]="data.mode === 'set' ? 'feather:shield' : 'feather:unlock'"></mat-icon>
            <span class="ml-2">{{ data.mode === 'set' ? 'Mã hóa & Lưu' : 'Giải mã bài viết' }}</span>
        </button>
    </div>
    `
})
export class ArticlePasswordDialog implements OnInit {
    passForm: UntypedFormGroup;
    hidePassword = true;
    errorMessage = '';

    constructor(
        private _formBuilder: UntypedFormBuilder,
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
    }

    submit(): void {
        if (this.passForm.invalid) return;

        const password = this.passForm.get('password')?.value;
        if (this.data.mode === 'set') {
            const confirm = this.passForm.get('confirmPassword')?.value;
            if (password !== confirm) {
                this.errorMessage = 'Mật khẩu xác nhận không trùng khớp!';
                return;
            }
        }

        this.dialogRef.close({ password });
    }
}
