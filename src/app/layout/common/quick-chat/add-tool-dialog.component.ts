import { Component, Inject, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface AddToolDialogData {
    name?: string;
    url?: string;
    icon?: string;
}

@Component({
    selector: 'add-tool-dialog',
    template: `
    <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-100">
            <mat-icon [svgIcon]="'feather:plus-circle'" class="text-primary-500"></mat-icon>
            <span>Thêm công cụ mới</span>
        </div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-2 p-0 !overflow-hidden">
        <p class="text-base text-gray-600 dark:text-gray-400 mb-3">
            Thêm ứng dụng hoặc trang web vào danh sách truy cập nhanh trên bảng điều khiển.
        </p>

        <form [formGroup]="toolForm" (ngSubmit)="submit()">
            <mat-form-field class="w-full fuse-mat-dense fuse-mat-no-subscript" appearance="fill" subscriptSizing="dynamic">
                <mat-label>Tên hiển thị</mat-label>
                <input matInput formControlName="name" placeholder="VD: Facebook, Capcut..." required autofocus />
            </mat-form-field>

            <mat-form-field class="w-full fuse-mat-dense fuse-mat-no-subscript mt-2" appearance="fill" subscriptSizing="dynamic">
                <mat-label>Đường dẫn (URL)</mat-label>
                <input matInput formControlName="url" placeholder="https://..." required />
            </mat-form-field>

            <div class="flex items-center gap-3 mt-3">
                <input #newIconFileInput type="file" class="hidden" accept="image/*" (change)="onIconSelected($event)">
                <div class="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity overflow-hidden relative group shrink-0" (click)="newIconFileInput.click()" matTooltip="Nhấp để thay đổi icon">
                    <img *ngIf="iconUrl" [src]="iconUrl" class="w-full h-full object-cover" />
                    <mat-icon *ngIf="!iconUrl" class="icon-size-5 text-gray-400 group-hover:text-primary-500 transition-colors" [svgIcon]="'feather:camera'"></mat-icon>
                    <div *ngIf="iconUrl" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <mat-icon class="icon-size-4 text-white" [svgIcon]="'feather:camera'"></mat-icon>
                    </div>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="text-xs text-gray-500 cursor-pointer hover:text-primary-600" (click)="newIconFileInput.click()">Tải icon tùy chỉnh (nhấp vào avatar)</span>
                    <button type="button" mat-button color="warn" class="text-xs !p-0 !min-w-0 h-auto text-left" *ngIf="iconUrl" (click)="iconUrl = ''">
                        Xóa icon
                    </button>
                </div>
            </div>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
        <button mat-button type="button" mat-dialog-close>Hủy</button>
        <button mat-flat-button color="primary" (click)="submit()" [disabled]="toolForm.invalid">
            <mat-icon [svgIcon]="'feather:plus'"></mat-icon>
            <span class="ml-2">Thêm vào danh sách</span>
        </button>
    </div>
    `
})
export class AddToolDialog implements OnInit {
    toolForm: UntypedFormGroup;
    iconUrl: string = '';

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<AddToolDialog>,
        @Inject(MAT_DIALOG_DATA) public data: AddToolDialogData
    ) { }

    ngOnInit(): void {
        this.toolForm = this._formBuilder.group({
            name: [this.data?.name || '', Validators.required],
            url: [this.data?.url || '', Validators.required]
        });
        if (this.data?.icon) {
            this.iconUrl = this.data.icon;
        }
    }

    onIconSelected(event: any): void {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.iconUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    submit(): void {
        if (this.toolForm.invalid) return;
        this.dialogRef.close({
            name: this.toolForm.get('name')?.value,
            url: this.toolForm.get('url')?.value,
            icon: this.iconUrl
        });
    }
}
