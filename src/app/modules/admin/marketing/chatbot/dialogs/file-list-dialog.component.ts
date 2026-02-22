import { Component, Inject, AfterViewInit, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DatatableComponent } from '@swimlane/ngx-datatable';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { ChatbotService } from 'app/modules/_services/chatbot';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';

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
    llm_model: string = "gemini-2.5-flash";
    index_dir: string = `faiss_pdf_index`;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    reIndexPdf(doc_type: string, filename: string, rowIndex: number): void {
        this._chatbotService.reIndexFile({
            username: this.user.name,
            doc_type: doc_type,
            filename: filename,
            google_api_key: this.google_api_key,
            llm_model: this.llm_model,
            index_dir: this.index_dir,
            enable_ocr: false
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (res) => {
                    if (res && res.success) {
                        this.toastr.success('Index lại file thành công: ' + filename);
                    } else {
                        this.toastr.error('Index file thất bại.');
                    }
                },
                error: () => {
                    this.toastr.error('Index file thất bại.');
                },
                complete: () => {
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
