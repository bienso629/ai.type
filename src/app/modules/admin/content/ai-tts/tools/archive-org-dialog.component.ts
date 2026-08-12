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
        <div class="min-w-[460px] p-1 bg-white rounded-lg">
            <div class="flex items-center justify-between mb-4 border-b pb-3">
                <div class="flex items-center text-emerald-700">
                    <mat-icon class="mr-2 icon-size-6 text-emerald-700" [svgIcon]="'heroicons_outline:cloud-upload'"></mat-icon>
                    <h2 class="text-xl font-bold m-0 text-gray-800">Upload lên Archive.org</h2>
                </div>
                <button mat-icon-button (click)="onCancel()" class="text-gray-400 hover:text-gray-600">
                    <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
                </button>
            </div>

            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-xs text-emerald-900 leading-relaxed flex items-start">
                <mat-icon class="icon-size-5 text-emerald-600 mr-2 mt-0.5 shrink-0" [svgIcon]="'heroicons_outline:information-circle'"></mat-icon>
                <div>
                    Để upload trực tiếp lên tài khoản Internet Archive (Archive.org), bạn vui lòng nhập <strong>Access Key</strong> và <strong>Secret Key</strong> lấy từ 
                    <a href="https://archive.org/account/s3.php" target="_blank" class="text-emerald-700 font-semibold underline hover:text-emerald-900 ml-1">archive.org/account/s3.php</a>.
                </div>
            </div>

            <div class="flex flex-col gap-3">
                <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                    <mat-label>S3 Access Key</mat-label>
                    <input matInput [(ngModel)]="accessKey" placeholder="Nhập S3 Access Key..." required />
                    <mat-icon matSuffix class="icon-size-5 text-gray-400">key</mat-icon>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                    <mat-label>S3 Secret Key</mat-label>
                    <input matInput type="password" [(ngModel)]="secretKey" placeholder="Nhập S3 Secret Key..." required />
                    <mat-icon matSuffix class="icon-size-5 text-gray-400">lock</mat-icon>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                    <mat-label>Tiêu đề tác phẩm (Title)</mat-label>
                    <input matInput [(ngModel)]="title" placeholder="Nhập tiêu đề tác phẩm..." required />
                </mat-form-field>

                <div class="grid grid-cols-2 gap-3">
                    <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                        <mat-label>Tác giả (Creator)</mat-label>
                        <input matInput [(ngModel)]="creator" placeholder="Tên tác giả..." />
                    </mat-form-field>

                    <mat-form-field appearance="outline" class="w-full fuse-mat-dense">
                        <mat-label>Bộ sưu tập (Collection)</mat-label>
                        <input matInput [(ngModel)]="collection" placeholder="Mặc định: opensource_audio" />
                    </mat-form-field>
                </div>
            </div>

            <div mat-dialog-actions class="flex justify-end gap-2 mt-6 pt-3 border-t border-gray-100">
                <button mat-button (click)="onCancel()" class="text-gray-600">Hủy bỏ</button>
                <button mat-flat-button class="!bg-emerald-700 hover:!bg-emerald-800 !text-white"
                        [disabled]="!accessKey?.trim() || !secretKey?.trim() || !title?.trim()"
                        (click)="onSubmit()">
                    <mat-icon class="icon-size-4 mr-1 text-white" [svgIcon]="'heroicons_outline:cloud-upload'"></mat-icon>
                    <span>Bắt đầu Upload</span>
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
