import { ChangeDetectorRef, Component, Inject, OnInit, ViewChild } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { ColumnMode, DatatableComponent } from "@swimlane/ngx-datatable";
import { User } from "app/core/user/user.types";
import { BigDataService } from "app/modules/_services/bigdata";
import { LogStreamService } from "app/modules/_services/log-stream.service";
import { ToastrService } from "ngx-toastr";
import { auditTime, Subject, Subscription, takeUntil } from "rxjs";

@Component({
    selector: 'bigdata-logs-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:clock'"></mat-icon>
        <mat-label class="self-center">Xem logs</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <div class="log-view w-full h-full min-h-100 relative">
            <ngx-datatable
                #table
                id="logsTable"
                class="border rounded material fullscreen shadow-none"
                [virtualization]="true"
                [headerHeight]="50"
                [columnMode]="ColumnMode.force"
                [footerHeight]="50"
                [rowHeight]="50"
                [scrollbarV]="true"
                [rows]="logs"
                [rowIdentity]="rowIdentity"
            >
                <ngx-datatable-column name="URL" [sortable]="false" [canAutoResize]="true" [draggable]="false" [resizeable]="false">
                    <ng-template let-row="row" ngx-datatable-cell-template>
                        <p class="truncate hover:text-clip">{{row.url || 'Chưa có link'}}</p>
                    </ng-template>
                </ngx-datatable-column>

                <ngx-datatable-column name="Status" [width]="100" [sortable]="false" [canAutoResize]="false" [draggable]="false" [resizeable]="false">
                    <ng-template let-row="row" ngx-datatable-cell-template>
                        <p class="truncate hover:text-clip">{{row.status || 'Chưa xác định'}}</p>
                    </ng-template>
                </ngx-datatable-column>
            </ngx-datatable>
        </div>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button (click)="stop()" color="primary" class="float-right">
            Tắt chương trình
        </button>

        <button mat-flat-button (click)="onNoClick()" color="medium" class="float-right">Đóng cửa sổ</button>
    </div>`,
})
export class BigDataLogsDialog implements OnInit {
    private static readonly MAX_LOGS = 2000;
    rowIdentity = (row: any) => row.id ?? row.url ?? row.ts ?? row.raw ?? Math.random();
    logs: any[] = [];
    user: User;
    jobID: string = '';
    sub?: Subscription;

    private buffer: any[] = [];
    private flushTimer?: any;

    @ViewChild(DatatableComponent) table: DatatableComponent;
    ColumnMode = ColumnMode;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    startStream() {
        this.sub?.unsubscribe();
        this.sub = this.logStream.streamJobLogs().subscribe({
            next: (data) => {
                try { this.buffer.push(JSON.parse(data)); } catch { this.buffer.push({ raw: data }); }

                if (!this.flushTimer) {
                    this.flushTimer = setTimeout(() => {
                        this.logs = [...this.logs, ...this.buffer];
                        this.buffer = [];
                        this.flushTimer = undefined;

                        setTimeout(() => {
                            this.table?.recalculate();
                            const bodyEl = (this.table as any)?.element?.querySelector?.('.datatable-body') as HTMLElement;
                            bodyEl && (bodyEl.scrollTop = bodyEl.scrollHeight);
                            this.cd.markForCheck();
                        });
                    }, 100); // gom mỗi 100ms
                }
            },
            error: (e) => console.log(e),
        });
    }

    stop() {
        this._bigdataService.stopAllJob({
            username: this.user.name,
            appID: 'fastmailv2.tadu.fastmailv2'
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.toastr.success("Đã dừng tiến trình.");
                    }
                },
                error: () => { },
                complete: () => { }
            });
    }

    constructor(
        public dialogRef: MatDialogRef<BigDataLogsDialog>,
        private _bigdataService: BigDataService,
        private logStream: LogStreamService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        @Inject(MAT_DIALOG_DATA) public data: BigDataLogsDialog
    ) {
        this.user = data['user'];
        this.jobID = localStorage.getItem('dataJobID');
        this.startStream();
    }

    ngOnInit(): void {
    }


    ngAfterViewInit(): void {
        // Cho chắc: tính lại layout lần đầu
        setTimeout(() => this.table?.recalculate());
    }

    ngOnDestroy(): void {
        this.sub?.unsubscribe();
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    onNoClick(): void {
        this.dialogRef.close();
    }
}
