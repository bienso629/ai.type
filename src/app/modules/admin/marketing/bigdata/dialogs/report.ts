import { Component, Inject, OnInit, ViewChild } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { User } from "app/core/user/user.types";
import { BigDataService } from "app/_services/bigdata";
import { Subject, takeUntil } from "rxjs";
import { ChartComponent } from 'ng-apexcharts';
import type { ApexOptions } from 'apexcharts';

@Component({
    selector: 'bigdata-report-dialog',
    styles: [
        `:host {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .content {
            flex: 1 1 auto;       /* chiếm hết phần còn lại giữa title và actions */
            display: flex;
            min-height: 0;        /* quan trọng để con được co giãn đúng */
        }

        .grid-wrapper {
            flex: 1 1 auto;
            min-height: 0;
        }

        mat-grid-list {
            height: 100%;
        }`,
        `.grid-dialog .mat-mdc-dialog-content, .grid-dialog .mdc-dialog__content {
            max-height: none;
            height: 100%;
            padding: 0;
        }

        .grid-dialog .mdc-dialog__surface {
            height: 100%;
        }`,
        `#chart { width: min(1100px, 100vw); margin: 12px auto; }`,
        `#pie { margin: 12px auto; }`,
        `#totals { width: min(720px, 95vw); margin: 12px auto; }`
    ],
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:pie-chart'"></mat-icon>
        <mat-label class="self-center">Báo cáo tổng quát</mat-label>
    </div>

    <div mat-dialog-content class="overflow-hidden content">
        <!--The content below is only a placeholder and can be replaced.-->
        <!-- template -->
        <div class="grid-wrapper">
            <mat-grid-list cols="4" rowHeight="fit" gutterSize="20px">
                <mat-grid-tile [colspan]="2" [rowspan]="1">
                    <div id="pie">
                        <ng-container *ngIf="chartOptionsStatus as pie">
                            <apx-chart
                            [chart]="pie.chart"
                            [labels]="pie.labels"
                            [series]="pie.series"
                            [legend]="pie.legend"
                            [dataLabels]="pie.dataLabels"
                            [tooltip]="pie.tooltip"
                            [stroke]="pie.stroke"
                            [colors]="pie.colors"
                            [responsive]="pie.responsive"
                            ></apx-chart>
                        </ng-container>
                    </div>
                </mat-grid-tile>

                <mat-grid-tile [colspan]="2" [rowspan]="1">
                    <div id="chart">
                        <ng-container *ngIf="chartOptions as opts">
                            <apx-chart
                            #chart
                            [series]="opts.series"
                            [chart]="opts.chart"
                            [plotOptions]="opts.plotOptions"
                            [dataLabels]="opts.dataLabels"
                            [xaxis]="opts.xaxis"
                            [yaxis]="opts.yaxis"
                            [grid]="opts.grid"
                            [tooltip]="opts.tooltip"
                            [legend]="opts.legend"
                            [noData]="opts.noData"
                            ></apx-chart>
                        </ng-container>
                    </div>
                </mat-grid-tile>
            </mat-grid-list>
        </div>
    </div>`,
})
export class ReportDialog implements OnInit {
    user: User;

    @ViewChild('chart', { static: false }) chart!: ChartComponent;
    chartOptions: Partial<ApexOptions> = {
        chart: { type: 'bar', height: 300 },
        series: [],                             // 👈 tránh undefined
        noData: { text: 'Đang tải dữ liệu…' }   // optional
    };

    chartOptionsStatus!: Partial<ApexOptions>;
    chartOptionsTotals!: Partial<ApexOptions>;

    // ---- Dữ liệu mẫu của bạn (có thể thay bằng dữ liệu API) ----
    overview: any = {};

    private buildStatusPie() {
        // Lấy dữ liệu an toàn
        const src = this.overview?.totals?.by_status ?? {};
        const done = Number((src as any).done ?? 0);
        const error = Number((src as any).error ?? 0);

        const labels = ['Hoàn thành', 'Lỗi'];
        const series = [done, error];
        const total = series.reduce((a, b) => a + b, 0);

        this.chartOptionsStatus = {
            chart: { type: 'pie', width: 400, height: 400, toolbar: { show: false } },
            labels,
            series,
            colors: ['#22c55e', '#ef4444'], // done xanh, error đỏ
            dataLabels: {
                enabled: true,
                // val là % cho pie → giữ 1 chữ số thập phân
                formatter: (val: number) => `${Math.round(val * 10) / 10}%`,
                dropShadow: { enabled: false }
            },
            legend: {
                position: 'bottom',
                formatter: (name: string, opts: any) => {
                    const value = Number(opts.w.globals.series[opts.seriesIndex] || 0);
                    const pct = total ? Math.round((value / total) * 1000) / 10 : 0;
                    return `${name}: ${value.toLocaleString('vi-VN')} (${pct}%)`;
                }
            },
            tooltip: {
                y: { formatter: (v: number) => `${Number(v || 0).toLocaleString('vi-VN')} văn bản` }
            },
            stroke: { width: 1 },
            responsive: [
                { breakpoint: 640, options: { chart: { width: '100%', height: 360 }, legend: { fontSize: '12px' } } }
            ]
        } as Partial<ApexOptions>;
    }

    private buildTotalsProgress() {
        const t = this.overview?.totals ?? {};

        const totalDocs = Number(t.total_docs) || 0;
        const doneDocs = Number(t.done_docs ?? t.by_status?.done) || 0;
        let remainDocs = Number(t.not_done_docs ?? (totalDocs - doneDocs));
        if (!Number.isFinite(remainDocs) || remainDocs < 0) remainDocs = Math.max(0, totalDocs - doneDocs);

        const filesAll = Number(t.files_total_all) || 0;
        const filesDone = Number(t.files_total_done) || 0;
        const filesRemain = Math.max(0, filesAll - filesDone);

        const cats = ['Văn bản', 'Tệp'];
        const seriesDone = [doneDocs, filesDone];
        const seriesRemain = [remainDocs, filesRemain];

        this.chartOptionsTotals = {
            chart: { type: 'bar', height: 140, width: '100%', stacked: true, stackType: '100%', toolbar: { show: false } },
            series: [
                { name: 'Hoàn thành', data: seriesDone },
                { name: 'Chưa xong', data: seriesRemain }
            ],
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: '20px',
                    borderRadius: 6,
                    dataLabels: { position: 'center' }
                }
            },
            xaxis: { // với horizontal bar, categories đặt ở xaxis
                categories: cats,
                labels: { formatter: (v: any) => String(v) }
            },
            yaxis: { labels: { formatter: (v: any) => String(v) } },
            dataLabels: {
                enabled: true,
                style: { fontSize: '12px' },
                formatter: (_val: number, opts: any) => {
                    const si = opts.seriesIndex;           // 0: Done, 1: Remain
                    const di = opts.dataPointIndex;        // 0: Văn bản, 1: Tệp
                    const rawDone = opts.w.globals.series[0][di] || 0;
                    const rawRemain = opts.w.globals.series[1][di] || 0;
                    const tot = rawDone + rawRemain;
                    if (!tot) return '';
                    const part = si === 0 ? rawDone : rawRemain;
                    const pct = Math.round((part / tot) * 1000) / 10; // 1 số thập phân
                    // Ẩn label nếu quá nhỏ để tránh chồng
                    return pct >= 6 ? `${pct}%` : '';
                }
            },
            colors: ['#22c55e', '#9ca3af'], // xanh cho done, xám cho chưa xong
            legend: { position: 'bottom' },
            grid: { strokeDashArray: 3 },
            tooltip: {
                y: {
                    formatter: (val: number, opts: any) => {
                        const di = opts.dataPointIndex;
                        const rawDone = opts.w.globals.series[0][di] || 0;
                        const rawRemain = opts.w.globals.series[1][di] || 0;
                        const tot = rawDone + rawRemain;
                        const pct = tot ? Math.round((val / tot) * 1000) / 10 : 0;
                        return `${Number(val || 0).toLocaleString('vi-VN')} (${pct}%)`;
                    }
                }
            }
        } as Partial<ApexOptions>;
    }

    private buildFromApi() {
        const items = (this.overview?.by_type ?? [])
            .map((i: any) => ({
                label: (i?.type ?? 'Không xác định'),
                value: Number(i?.docs) || 0
            }))
            .sort((a: any, b: any) => b.value - a.value);

        const labels = items.map((i: any) => i.label);
        const values = items.map((i: any) => i.value);

        // 👉 DÀY MỖI THANH VÀ CHIỀU CAO TỰ ĐỘNG
        const BAR_PX = 24;         // độ dày mỗi thanh
        const GAP_PX = 0;         // khoảng cách giữa các thanh (ước lượng)
        const BASE_PX = 80;        // phần header/padding
        const height = Math.min(1600, BASE_PX + items.length * (BAR_PX + GAP_PX));

        const maxVal = Math.max(...values, 0);
        const LABEL_MIN = Math.max(100, Math.round(maxVal * 0.03)); // ngưỡng ~3% hoặc >=100

        this.chartOptions = {
            chart: { type: 'bar', height, width: '100%', toolbar: { show: false } },
            series: [{ name: 'Số văn bản', data: values }],
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: `${BAR_PX}px`,
                    borderRadius: 6,
                    distributed: true,
                    dataLabels: {
                        position: 'right'   // để số nằm phía ngoài đầu thanh
                    }
                }
            },
            dataLabels: {
                enabled: true,
                textAnchor: 'start',   // neo bên trái để không chọc vào nhau
                offsetX: 8,            // đẩy ra ngoài một chút
                style: { fontSize: '12px' },
                formatter: (val: unknown, opts?: any) => {
                    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
                    // Ẩn nhãn nếu quá nhỏ để tránh dồn cục
                    if (!Number.isFinite(num) || num < LABEL_MIN) return '';
                    return num.toLocaleString('vi-VN');
                }
            },
            xaxis: {
                categories: labels,
                labels: {
                    formatter: (v: unknown) => {
                        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
                        return Number.isFinite(n) ? n.toLocaleString('vi-VN') : String(v);
                    }
                },
                tooltip: { enabled: false }
            },
            yaxis: { labels: { formatter: (v: any) => String(v) } },
            grid: { strokeDashArray: 3 },
            tooltip: { y: { formatter: (v: number) => Number(v || 0).toLocaleString('vi-VN') + ' văn bản' } },
            legend: { show: false },
            noData: { text: 'Đang tải dữ liệu…' }
        } as Partial<ApexOptions>;

    }

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    report() {
        this._bigdataService.report({
            username: this.user.name,
            appID: 'fastmailv2.tadu.fastmailv2',
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result) {
                        this.overview = result;

                        this.buildFromApi();     // bar chart
                        this.buildStatusPie();   // pie chart
                        // this.buildTotalsProgress(); // ✅ Stacked bar tiến độ tổng
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    constructor(
        public dialogRef: MatDialogRef<ReportDialog>,
        private _bigdataService: BigDataService,
        @Inject(MAT_DIALOG_DATA) public data: ReportDialog
    ) {
        this.user = data['user'];
    }

    ngOnInit(): void {
        // Chuẩn hoá & sắp xếp giảm dần theo count
        this.report();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    onNoClick(): void {
        this.dialogRef.close();
    }
}
