import { Component, Inject, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DatatableComponent } from '@swimlane/ngx-datatable';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { ChatbotService } from 'app/modules/_services/chatbot';
import { ToastrService } from 'ngx-toastr';
import { catchError, interval, of, Subject, Subscription, switchMap, takeUntil, takeWhile } from 'rxjs';

@Component({
    selector: 'app-file-list-dialog',
    providers: [ChatbotService],
    templateUrl: './file-list-dialog.component.html',
})
export class FileListDialogComponent implements AfterViewInit {
    config: AppConfig;
    user: User;

    @ViewChild(DatatableComponent) table!: DatatableComponent;
    rows: any[] = [];

    username: string = '';
    google_api_key: string = '';
    llm_model: string = "gemini-3-flash-preview";
    index_dir: string = `faiss_pdf_index`;

    // THÊM: Các biến quản lý thanh tiến trình
    indexingFilename: string | null = null;
    indexingSubscription: Subscription | null = null;
    isIndexing = false;
    progressPercent = 0;
    progressStatus = 'Đang khởi tạo...';

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // CẬP NHẬT: Hàm reIndexPdf gọi API và kích hoạt Polling
    reIndexPdf(doc_type: string, filename: string, rowIndex: number): void {
        if (!this.google_api_key) {
            this.toastr.warning('Chưa có Google API Key');
            return;
        }

        // Tạo object payload dựa trên các biến đã nhận
        const payload = {
            username: this.username,
            doc_type: doc_type === 'None' ? null : doc_type, // Xử lý doc_type rỗng
            filename: filename,
            index_dir: this.index_dir,
            enable_ocr: false,
            google_api_key: this.google_api_key,
            llm_model: this.llm_model,
        };

        this.indexingFilename = filename;

        // Giả sử service của bạn có hàm này (Bạn cần định nghĩa POST /reindex-file trong chatbot.ts)
        this._chatbotService.reindexSpecificFile(payload).subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.toastr.info(`Đang tiến hành re-index file: ${filename}`);
                    this.startProgressPolling(); // Kích hoạt thanh tiến trình
                } else {
                    this.toastr.error(res.message || 'Lỗi gửi yêu cầu');
                }
            },
            error: (err) => this.toastr.error('Lỗi kết nối đến máy chủ.')
        });
    }

    // THÊM: Logic Polling hỏi thăm Server
    startProgressPolling(): void {
        if (this.indexingSubscription && !this.indexingSubscription.closed) return;

        this.isIndexing = true;
        this.progressPercent = 0;
        this.progressStatus = 'Đang khởi tạo AI...';

        this.indexingSubscription = interval(2000).pipe(
            switchMap(() => this._chatbotService.getIndexProgress({ username: this.username })),
            // Thêm catchError để lỡ gọi API xịt thì không bị đứng form
            catchError(() => of({ is_running: false, percent: 100, status: 'Lỗi lấy tiến độ' })),
            takeWhile((resp: any) => resp.is_running, true)
        ).subscribe({
            next: (resp: any) => {
                if (resp.is_running) {
                    this.progressPercent = resp.percent || 0;
                    this.progressStatus = `${resp.status} (${resp.current || 0}/${resp.total || 0})`;
                    this.cdr.markForCheck();
                } else if (this.isIndexing) {
                    this.handleIndexingComplete();
                }
            },
            error: () => this.stopProgressPolling()
        });
    }

    handleIndexingComplete(): void {
        this.progressPercent = 100;
        this.progressStatus = '✅ Hoàn tất quá trình Index!';
        this.toastr.success('Học tài liệu hoàn tất!');

        // Cập nhật lại trạng thái file trên bảng ngx-datatable

        // 1. Force update local array immediately
        const idx = this.rows.findIndex(r => r.filename === this.indexingFilename);
        if (idx > -1) {
            this.rows[idx] = { ...this.rows[idx], is_indexed: true };
            this.rows = [...this.rows];
            this.cdr.markForCheck();
        }

        // 2. Fetch from server to get accurate size_mb
        this._chatbotService.listFiles({ username: this.username }).subscribe({
            next: (res: any) => {
                if (res && res.files) {
                    this.rows = [...res.files];
                    this.cdr.markForCheck();
                } else if (res && res.data) {
                    this.rows = [...res.data];
                    this.cdr.markForCheck();
                } else if (Array.isArray(res)) {
                    this.rows = [...res];
                    this.cdr.markForCheck();
                }
            }
        });

        setTimeout(() => this.stopProgressPolling(), 2000);
    }

    stopProgressPolling(): void {
        this.isIndexing = false;
        this.progressPercent = 0;
        this.indexingFilename = null;
        if (this.indexingSubscription) {
            this.indexingSubscription.unsubscribe();
            this.indexingSubscription = null;
        }
    }

    indexAll(): void {
        const payload = {
            username: this.username,
            google_api_key: this.google_api_key,
            llm_model: this.llm_model,
            index_dir: this.index_dir
        };

        this._chatbotService.indexFiles(payload).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                if (res && res.success) {
                    this.toastr.info('Đang tiến hành học tất cả tài liệu...');
                    this.indexingFilename = null; // Đánh dấu là đang học tất cả
                    this.startProgressPolling();
                } else {
                    this.toastr.error('Khởi tạo học tài liệu thất bại.');
                }
            },
            error: () => {
                this.toastr.error('Lỗi kết nối đến máy chủ.');
            }
        });
    }

    deletePdf(doc_type: string, filename: string, rowIndex: number): void {
        this._chatbotService.deleteFile({
            username: this.user.name,
            doc_type: doc_type,
            filename: filename
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (res) => {
                    if (res && res.ok) {
                        this.rows.splice(rowIndex, 1);
                        this.rows = [...this.rows];

                        this.toastr.success('Xóa file thành công: ' + filename);
                    } else {
                        this.toastr.error('Xóa file thất bại.');
                    }
                },
                error: () => {
                    this.toastr.error('Xóa file thất bại.');
                },
                complete: () => {
                }
            });
    }

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: any,
        private _userService: UserService,
        private toastr: ToastrService,
        private _chatbotService: ChatbotService,
        private cdr: ChangeDetectorRef
    ) {
        this.rows = data.rows;

        this.username = data.username;
        this.google_api_key = data.google_api_key;
        this.llm_model = data.llm_model;
        this.index_dir = data.index_dir;

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();

        this.stopProgressPolling(); // Ngắt polling khi đóng dialog
    }

    ngAfterViewInit() {
        // đợi dialog animation hoàn thành rồi recalculation
        setTimeout(() => {
            if (this.table) {
                this.table.recalculate();
                this.table.recalculateColumns();
            }
        }, 300);
    }
}
