import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'app-archive-org-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
    ],
    template: `
        <div class="flex flex-col min-w-[460px] max-h-[calc(90vh-48px)] overflow-hidden">
            <!-- Header -->
            <div class="shrink-0 pb-2">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-100">
                        <mat-icon [svgIcon]="'heroicons_outline:cloud-upload'" class="text-emerald-500 icon-size-6"></mat-icon>
                        <span>Upload lên Archive.org</span>
                    </div>
                    <button type="button" mat-icon-button (click)="onCancel()" class="bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-400">
                        <mat-icon class="icon-size-5" [svgIcon]="'heroicons_outline:x'"></mat-icon>
                    </button>
                </div>

                <p class="text-base text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Để upload trực tiếp lên tài khoản Internet Archive (Archive.org), bạn vui lòng nhập <strong>Access Key</strong> và <strong>Secret Key</strong> lấy từ 
                    <a href="https://archive.org/account/s3.php" target="_blank" class="text-emerald-600 font-semibold underline hover:text-emerald-800">archive.org/account/s3.php</a>.
                </p>
            </div>

            <!-- Form (Scrollable) -->
            <div class="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
                <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                    <mat-label>S3 Access Key*</mat-label>
                    <input matInput [(ngModel)]="accessKey" placeholder="Nhập S3 Access Key..." required />
                    <mat-icon matSuffix class="icon-size-5 text-gray-400">key</mat-icon>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                    <mat-label>S3 Secret Key*</mat-label>
                    <input matInput type="password" [(ngModel)]="secretKey" placeholder="Nhập S3 Secret Key..." required />
                    <mat-icon matSuffix class="icon-size-5 text-gray-400">lock</mat-icon>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                    <mat-label>Tiêu đề tác phẩm (Title)*</mat-label>
                    <input matInput [(ngModel)]="title" placeholder="Nhập tiêu đề tác phẩm..." required />
                </mat-form-field>

                <div class="flex gap-4">
                    <mat-form-field appearance="outline" class="flex-1 fuse-mat-dense">
                        <mat-label>Tác giả (Creator)</mat-label>
                        <input matInput [(ngModel)]="creator" placeholder="Tên tác giả..." />
                    </mat-form-field>

                    <mat-form-field appearance="outline" class="flex-1 fuse-mat-dense">
                        <mat-label>Bộ sưu tập (Collection)</mat-label>
                        <input matInput [(ngModel)]="collection" placeholder="Mặc định: opensource_audio" />
                    </mat-form-field>
                </div>
            </div>

            <!-- Footer -->
            <div class="shrink-0 flex items-center justify-end gap-3 mt-6">
                <button mat-button (click)="onCancel()" class="text-gray-600 dark:text-gray-300 font-medium">Hủy bỏ</button>
                <button mat-flat-button class="!bg-emerald-700 hover:!bg-emerald-800 !text-white"
                        [disabled]="!accessKey?.trim() || !secretKey?.trim() || !title?.trim()"
                        (click)="onSubmit()">
                    <mat-icon class="icon-size-5" [svgIcon]="'heroicons_outline:cloud-upload'"></mat-icon>
                    <mat-label class="ml-2">Bắt đầu Upload</mat-label>
                </button>
            </div>
        </div>
    `,
})
export class ArchiveOrgDialogComponent implements OnInit {
    accessKey: string = '';
    secretKey: string = '';
    title: string = '';
    creator: string = '';
    collection: string = 'opensource_audio';

    constructor(
        public dialogRef: MatDialogRef<ArchiveOrgDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private multiAccountService: MultiAccountService
    ) {}

    ngOnInit(): void {
        this.title = this.data?.title || 'Giọng đọc AI';
        this.creator = this.data?.username || 'AI.Type User';

        const savedConfig = this.multiAccountService.getItem('archive_org_credentials');
        if (savedConfig) {
            if (savedConfig.accessKey) this.accessKey = savedConfig.accessKey;
            if (savedConfig.secretKey) this.secretKey = savedConfig.secretKey;
            if (savedConfig.collection) this.collection = savedConfig.collection;
            if (savedConfig.creator) this.creator = savedConfig.creator;
        }
    }

    onSubmit(): void {
        const credentials = {
            accessKey: this.accessKey.trim(),
            secretKey: this.secretKey.trim(),
            title: this.title.trim(),
            creator: this.creator.trim(),
            collection: this.collection.trim() || 'opensource_audio',
        };

        this.multiAccountService.setItem('archive_org_credentials', credentials);
        this.dialogRef.close(credentials);
    }

    onCancel(): void {
        this.dialogRef.close(null);
    }
}
