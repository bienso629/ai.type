import { Component, Inject, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DatatableComponent } from '@swimlane/ngx-datatable';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { ChatbotService } from 'app/modules/_services/chatbot';
import { ToastrService } from 'ngx-toastr';
import { catchError, interval, of, Subject, Subscription, switchMap, takeUntil, takeWhile } from 'rxjs';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

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

    async reIndexPdf(doc_type: string, filename: string, rowIndex: number): Promise<void> {
        if (!this.google_api_key) {
            this.toastr.warning('Chưa có Google API Key');
            return;
        }

        const isMinerUEnabled = localStorage.getItem('isMinerUEnabled') === 'true';

        if (filename.toLowerCase().endsWith('.pdf')) {
            const electron = (window as any).electron;
            if (electron) {
                this.isIndexing = true;
                this.indexingFilename = filename;
                this.progressPercent = 10;
                this.progressStatus = 'Đang kiểm tra dữ liệu...';
                this.cdr.markForCheck();

                const dType = doc_type === 'None' ? 'default' : doc_type;
                const backendUrl = this.config?.settings?.chatbot || 'https://bot.type.vn';
                const filenameWithoutExt = filename.replace(/\.pdf$/i, '');
                const jsonUrl = `${backendUrl}/pdfs/${dType}/${this.username}/${encodeURIComponent(filenameWithoutExt)}.mineru.json`;

                try {
                    // Bước 1: Kiểm tra xem file json đã tồn tại trên server chưa
                    const checkRes = await fetch(jsonUrl, { method: 'HEAD' });
                    if (!checkRes.ok) {
                        // Chưa có .mineru.json -> Tải PDF về và phân tích
                        this.progressStatus = 'Đang tải PDF từ Server...';
                        this.progressPercent = 30;
                        this.cdr.markForCheck();

                        const pdfUrl = `${backendUrl}/pdfs/${dType}/${this.username}/${encodeURIComponent(filename)}`;

                        // Gọi main.js tải file PDF về thư mục temp
                        const tempPdfPath = await electron.invoke('download-temp-pdf', pdfUrl);

                        this.progressStatus = isMinerUEnabled ? 'Đang chuẩn bị phân tích bằng MinerU...' : 'Đang chuẩn bị phân tích bằng OpenAI (Local)...';
                        this.progressPercent = 50;
                        this.cdr.markForCheck();

                        // Lắng nghe tiến trình AI
                        const cleanup = electron.onPdfProgress((data: string) => {
                            this.progressStatus = data;
                            this.cdr.markForCheck();
                        });

                        try {
                            const ipcMethod = isMinerUEnabled ? 'run-pdf-analysis' : 'run-pdf-analysis-openai';

                            let configData = undefined;
                            if (!isMinerUEnabled) {
                                try {
                                    const settings = this._multiAccountService.getItem('settings');
                                    if (settings) {
                                        configData = {
                                            url: settings.umodelverseUrl || '',
                                            key: settings.umodelverseKey || ''
                                        };
                                        console.log("Constructed configData:", configData);
                                    } else {
                                        console.log("settings is empty or null!");
                                    }
                                } catch (e) {
                                    console.error("Error loading settings:", e);
                                }
                            }

                            const result = await electron.invoke(ipcMethod, tempPdfPath, configData);

                            this.progressStatus = 'Đang lưu kết quả AI lên Server...';
                            this.progressPercent = 90;
                            this.cdr.markForCheck();

                            // Upload file json lên server
                            await new Promise((resolve, reject) => {
                                this._chatbotService.uploadMinerUResult({
                                    username: this.username,
                                    filename: filename,
                                    doc_type: doc_type,
                                    content_json: result
                                }).subscribe({
                                    next: (res) => {
                                        if (res && res.success) resolve(res);
                                        else reject('Tải kết quả lên Server thất bại');
                                    },
                                    error: reject
                                });
                            });
                        } finally {
                            cleanup();
                            // Không cần thiết phải gọi cancel-pdf-analysis vì đã chạy xong hoặc lỗi
                        }
                    } else {
                        // Đã có JSON -> Chỉ cần Re-index
                        this.progressStatus = 'Đã có dữ liệu AI...';
                        this.progressPercent = 95;
                        this.cdr.markForCheck();
                    }

                    // Bước cuối: Gọi API Re-index bình thường
                    this.triggerNormalReindex(doc_type, filename);
                    return;

                } catch (err: any) {
                    this.stopProgressPolling();
                    this.toastr.error('Lỗi phân tích tài liệu AI: ' + (err.message || err));
                    return;
                }
            }
        }

        // Nếu không bật MinerU hoặc không phải file PDF thì reindex bình thường
        this.triggerNormalReindex(doc_type, filename);
    }

    triggerNormalReindex(doc_type: string, filename: string): void {
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

        this._chatbotService.reindexSpecificFile(payload).subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.toastr.info(`Đang tiến hành re-index file: ${filename}`);
                    this.startProgressPolling(); // Kích hoạt thanh tiến trình
                } else {
                    this.toastr.error(res.message || 'Lỗi gửi yêu cầu');
                    this.stopProgressPolling();
                }
            },
            error: (err) => {
                this.toastr.error('Lỗi kết nối đến máy chủ.');
                this.stopProgressPolling();
            }
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

    downloadPdf(doc_type: string, filename: string): void {
        const dType = (!doc_type || doc_type === 'None') ? 'default' : doc_type;
        const backendUrl = this.config?.settings?.chatbot || 'https://bot.type.vn';

        let downloadFilename = filename;
        let fileUrl = `${backendUrl}/pdfs/${dType}/${this.username}/${encodeURIComponent(filename)}`;

        // Nếu là file PDF, chuyển sang tải file JSON kết quả của MinerU
        if (filename.toLowerCase().endsWith('.pdf')) {
            const filenameWithoutExt = filename.replace(/\.pdf$/i, '');
            downloadFilename = `${filenameWithoutExt}.mineru.json`;
            fileUrl = `${backendUrl}/pdfs/${dType}/${this.username}/${encodeURIComponent(filenameWithoutExt)}.mineru.json`;
        }

        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
        private cdr: ChangeDetectorRef,
        private _multiAccountService: MultiAccountService
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
