import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation
} from '@angular/core';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';

import { BlogService } from 'app/modules/_services/blog';
import { DomainService } from 'app/modules/_services/domain';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'images-data-dialog',
    template: `<div class="absolute inset-0 flex flex-col min-w-0 overflow-hidden">
    <!-- Header -->
    <div
        class="flex flex-col sm:flex-row flex-0 sm:items-center sm:justify-between p-4 pb-4 sm:pt-4 sm:pb-4 sm:px-10 bg-gray-50 dark:bg-transparent border-b">
        <div class="flex-1 min-w-0">
            <!-- Breadcrumbs -->
            <div class="hidden sm:flex flex-wrap items-center font-medium">
                <div class="flex items-center whitespace-nowrap">
                    <a class="text-base text-primary-500" [routerLink]="['/dashboard']">ai.type</a>
                </div>
                <div class="flex items-center ml-1 whitespace-nowrap">
                    <mat-icon class="icon-size-4 text-secondary" style="margin-top: 2px;"
                        [svgIcon]="'heroicons_solid:chevron-right'"></mat-icon>
                    <span class="ml-1 text-base text-secondary">{{ 'app.your_image_library' | transloco }}</span>
                </div>
            </div>
            <div class="flex sm:hidden">
                <a class="inline-flex items-center -ml-1.5 text-secondary font-medium" [routerLink]="'./..'">
                    <mat-icon class="icon-size-4 text-secondary"
                        [svgIcon]="'heroicons_solid:chevron-left'"></mat-icon>
                    <span class="ml-1 text-base">quay lại</span>
                </a>
            </div>
            <!-- Title -->
            <!-- <div class="mt-2">
                <p class="tracking-tight leading-7 text-base text-gray-400 sm:leading-10 truncate">
                    cung cấp tự động tạo hình ảnh nhanh và chuẩn xác.
                </p>
            </div> -->
        </div>

        <!-- Actions -->
        <div class="flex shrink-0 items-center mt-6 sm:mt-0 sm:ml-4">
            <button mat-icon-button matTooltip="Đóng" (click)="dialogRef.close()">
                <mat-icon>close</mat-icon>
            </button>
        </div>
    </div>

    <!-- Main -->
    <div class="flex-auto overflow-y-auto bg-transparent relative p-2" cdkScrollable>
        <!-- CONTENT GOES HERE -->
        <div class="flex flex-wrap w-full">
            <div class="thumb-wrap p-2 box-border relative"
                *ngFor="let img of imageUrls" 
                [ngStyle]="{
                    flex: '0 0 ' + (100 / gridSize) + '%',
                    maxWidth: (100 / gridSize) + '%'
                }">
                
                <ng-container *ngIf="img.toLowerCase().endsWith('.mp4'); else imageTemplate">
                    <video [src]="'file:///' + img"
                        class="thumb w-full object-cover rounded-2xl"
                        controls muted loop>
                    </video>
                </ng-container>

                <ng-template #imageTemplate>
                    <img [src]="'file:///' + img" loading="lazy"
                        class="thumb w-full object-cover rounded-2xl" />

                    <div class="thumb-actions">
                        <a mat-icon-button (click)="insert('file:///' + img)"
                            class="rounded-full icon-size-6 hover:bg-white hover:bg-opacity-50">
                            <mat-icon class="icon-size-4 text-blue-600"
                                [svgIcon]="'feather:arrow-down'"></mat-icon>
                        </a>
                    </div>
                </ng-template>
            </div>
        </div>
    </div>
</div>`,
    styleUrls: ['./../../ai-image/ai-image.component.scss'],
    providers: [ChatGPTService, BlogService, DomainService],
    encapsulation: ViewEncapsulation.None
})
export class MediaDataDialog implements OnInit, OnDestroy, AfterViewInit {
    config: AppConfig;
    user: User;

    imageAIForm: UntypedFormGroup;
    imageUrls: any = [];
    processing: boolean = false;

    cols: number;
    // Cấu hình số cột theo độ rộng màn hình (Breakpoints)
    gridByBreakpoint = {
        xl: 10,
        lg: 8,
        md: 6,
        sm: 3,
        xs: 2
    };

    gridSize = 6; // Mặc định
    rowHeight = 110; // Mặc định
    containerWidth = 800; // Biến lưu độ rộng container
    rows = [];

    @ViewChild('datatable', { static: false }) datatable: any;

    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * SỰ KIỆN RESIZE: Cần thiết để giao diện phản hồi (Responsive)
     */
    @HostListener('window:resize', ['$event'])
    onResize(event: any) {
        const oldGridSize = this.gridSize;

        // Tính toán lại kích thước lưới
        this.detectGrid();

        // Chỉ "đập đi xây lại" các hàng (rebuildRows) khi số lượng cột THAY ĐỔI
        // Nếu số lượng cột giữ nguyên (chỉ co giãn nhẹ), detectGrid đã tự cập nhật rowHeight rồi.
        if (this.gridSize !== oldGridSize) {
            this.rebuildRows();
        }

        // Cập nhật UI
        this.cd.detectChanges();
    }

    /**
     * TÍNH TOÁN GRID (CỘT & DÒNG)
     * Hàm này chạy 1 lần khi Init và mỗi khi Resize
     */
    detectGrid() {
        const w = window.innerWidth;

        // 1. Tính số cột (Cols) dựa trên Breakpoints
        if (w >= 1280) this.gridSize = this.gridByBreakpoint.xl;
        else if (w >= 1024) this.gridSize = this.gridByBreakpoint.lg;
        else if (w >= 768) this.gridSize = this.gridByBreakpoint.md;
        else if (w >= 480) this.gridSize = this.gridByBreakpoint.sm;
        else this.gridSize = this.gridByBreakpoint.xs;

        // 2. Tính chiều cao dòng (Row Height) để ảnh vuông
        let containerW = w;

        if (this.datatable && this.datatable.element && this.datatable.element.clientWidth > 0) {
            // Nếu bảng đã hiện, lấy kích thước thật
            containerW = this.datatable.element.clientWidth;
        } else {
            // Nếu bảng chưa hiện (lúc Init), ước lượng kích thước trừ đi Sidebar & Padding
            // Giả sử sidebar side mode ~280px + padding ~40px
            if (w >= 1024) containerW = w - 320;
            else containerW = w - 32; // Mobile full width trừ padding
        }

        // Tính chiều rộng 1 ô
        const cellWidth = containerW / this.gridSize;

        // Gán chiều cao dòng bằng chiều rộng ô - 2px padding bottom cho thoáng
        this.rowHeight = Math.round(cellWidth) - 2;
    }

    /**
     * Chia danh sách ảnh thành các hàng (rows) cho ngx-datatable
     */
    rebuildRows() {
        this.rows = this.chunkImages(this.imageUrls, this.gridSize);
    }

    chunkImages(list: string[], size: number) {
        const out: any[] = [];
        if (!list) return out;

        for (let i = 0; i < list.length; i += size) {
            const images = list.slice(i, i + size);
            out.push({ images });
        }
        return out;
    }

    insert(img: string) {
        this.dialogRef.close({
            img: img
        });
    }

    /**
     * Chi tiết lưu trữ
     */
    fetch() {
        this._blogService.allFiles({
            username: this.user.name, folder: 'thumbnails'
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (result) => {
                if (result) this.imageUrls = result.files;
                this.rebuildRows();
            },
            complete: () => { }
        });
    }

    /**
     * Constructor
     */
    constructor(
        public dialogRef: MatDialogRef<MediaDataDialog>, // Đã có sẵn
        private _userService: UserService,
        private _blogService: BlogService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _formBuilder: UntypedFormBuilder,
        private cd: ChangeDetectorRef,
    ) { }

    ngOnInit(): void {
        // Create the form
        this.imageAIForm = this._formBuilder.group({
            chatgpt: ['']
        });

            // Chỉ chạy tính toán khi Dialog đã mở xong hoàn toàn (hết animation)
        this.dialogRef.afterOpened().subscribe(() => {
            this.detectGrid();

            // Kích hoạt giả lập resize sau khi dialog mở để ngx-datatable tự căn chỉnh lại chiều rộng chính xác
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 150);

            // Subscribe to config changes
            this._fuseConfigService.config$
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe((config: AppConfig) => {
                    this.config = config;
                });

            // Subscribe to user changes
            this._userService.user$
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe((user: User) => {
                    this.user = user;

                    if (user.reputation < 2000) {
                        this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                        return;
                    } else {
                        this.fetch();
                    }
                });
        });
    }

    ngAfterViewInit() { }

    ngOnDestroy(): void {
        if (this.unsubscribeLog) this.unsubscribeLog();
        if (this.unsubscribeRes) this.unsubscribeRes();

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: (alert) ? alert.title : 'Hoàn tất!',
            message: (alert) ? alert.message : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu. <span class="font-medium">Hãy tiếp tục với một URL mới luôn nào!</span>',
            icon: {
                show: true,
                name: 'feather:check',
                color: 'success'
            },
            actions: {
                confirm: {
                    show: true,
                    label: (alert) ? alert.confirm : 'Khởi động lại',
                    color: 'primary'
                },
                cancel: {
                    show: true,
                    label: 'Đóng cửa sổ'
                }
            },
            dismissible: true
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((result) => {
            if (result === "confirmed") {
                if (alert.cb) {
                    alert.cb();
                }
            }
        });
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: (message) ? message : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại'
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}
