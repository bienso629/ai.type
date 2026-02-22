import {
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';

import { ColumnMode } from '@swimlane/ngx-datatable';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';

import { GoogleGenAI } from '@google/genai';

import {
    ApexAxisChartSeries,
    ApexChart,
    ApexXAxis,
    ApexDataLabels,
    ApexPlotOptions,
    ApexLegend,
    ApexYAxis
} from 'ng-apexcharts';
import { DomainService } from 'app/modules/_services/domain';
import { WordpressService } from 'app/modules/_services/wordpress';

export type ChartOptions = {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    dataLabels?: ApexDataLabels;
    plotOptions?: ApexPlotOptions;
    legend?: ApexLegend;
    yaxis?: ApexYAxis;
};

interface QueryStat {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;       // %
    position: number;
}

interface QueryDailyStat {
    query: string;
    date: string;      // YYYY-MM-DD
    clicks: number;
    impressions: number;
    ctr: number;       // %
    position: number;
}

// Interface lưu kết quả phân tích từng Segment
interface SegmentResult {
    name: string;
    categories: any[];
}

declare global {
    interface Window {
        electron?: {
            gscQuery: (payload: {
                startDate: string;
                endDate: string;
                siteUrl?: string;
                mode?: string;
                dimensions?: any;
                rowLimit?: number;
            }) => Promise<{ success: boolean; rows?: any[]; error?: string }>;
            googleAdsKeyword?: (payload: {
                keywordText: string;
                customerId: string;
                languageConstant?: string;
                geoTargetConstants?: string[];
            }) => Promise<{ success: boolean; results?: any[]; error?: string }>;
            exportGscPdf?: (payload: any) => Promise<{ success: boolean; error?: string }>;
            scheduleSeoEmail?: (payload: any) => Promise<{ success: boolean; error?: string }>;
            analyticsReport?: (payload: {
                propertyId?: string;
                startDate: string;
                endDate: string;
                metrics?: string[];
                dimensions?: string[];
                dimensionFilter?: any;
                limit?: number;
            }) => Promise<{ success: boolean; result?: any; error?: string }>;
        };
    }
}

@Component({
    selector: 'google-search-console.component',
    styleUrls: ['./report-seo.component.scss'],
    templateUrl: './report-seo.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [WP2MDService, DomainService, WordpressService]
})
export class GSCReportComponent implements OnInit, OnDestroy {
    xml: any;
    config: AppConfig;
    user: User;
    isLinear = false;

    settings: any;
    secretKey: any;
    searchAPIKey: any;
    ai: any;

    csvData: string[][] = [];

    // dữ liệu tổng hợp theo keyword
    rows: QueryStat[] = [];
    // dữ liệu đã lọc cho bảng (search)
    filteredRows: QueryStat[] = [];

    columns: string[] = [];
    ColumnMode = ColumnMode;

    // tìm kiếm trong bảng
    searchTerm = '';

    totalClicks = 0;
    totalImpressions = 0;
    avgCtr = 0;
    avgPosition = 0;

    // Danh sách Category Gốc (từ WP)
    categoryItems: any[] = [];
    domainOptions: string[] = [];

    @ViewChild('stepper') stepper: any;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // GSC filter
    siteUrl = 'https://huyenthuyen.vn/';
    startDate = '';
    endDate = '';

    // dữ liệu theo ngày
    dailyStatsAll: QueryDailyStat[] = [];

    // biểu đồ tổng quan
    public chartOptionsTopQueries!: Partial<ChartOptions>;
    public chartOptionsCtr!: Partial<ChartOptions>;

    // biểu đồ theo ngày
    public chartOptionsKeywordCompare!: Partial<ChartOptions> | undefined; // CTR theo ngày
    public chartOptionsKeywordGrowth!: Partial<ChartOptions> | undefined;  // tăng trưởng metric
    public chartOptionsHeatmap: any;                                       // heatmap

    // chọn nhiều keyword để so sánh
    selectedComparisonQueries: string[] = [];

    // metric toggle cho chart tăng trưởng + heatmap
    selectedMetric: 'clicks' | 'impressions' | 'ctr' | 'position' = 'clicks';

    // AI suggestions
    aiSuggestions = '';
    aiLoading = false;

    // Google Ads Keyword Planner
    adsLoading = false;
    adsError = '';
    adsResults: any[] = [];
    currentAdsKeyword = '';
    googleAdsCustomerId = '6453144045';

    // Google Analytics 4 (GA4) Variables
    gaPropertyId = ''; // cho phép nhập từ UI
    gaLoading = false;
    gaError = '';
    gaSummary: {
        activeUsers: number;
        sessions: number;
        screenPageViews: number;
        engagementRate: number;
    } | null = null;

    // Dữ liệu tham chiếu
    gaByCountry: { dimension: string; activeUsers: number }[] = [];
    gaByDevice: { dimension: string; activeUsers: number }[] = [];
    gaByAge: { dimension: string; activeUsers: number }[] = [];

    // --- BIẾN LƯU KẾT QUẢ PHÂN TÍCH NHIỀU SEGMENT ---
    analyzedResults: SegmentResult[] = [];
    gaTopPages: { path: string; title: string; views: number }[] = [];
    // ------------------------------------------------

    // Sync Variables
    syncLoading = false;
    wpSyncSecretKey = 'AI_TYPE_SECRET_2025';

    getRowHeight(row?: any): number {
        return 50;
    }

    /**
     * Lấy tất cả domain của khách
     */
    alldomains() {
        this._domainService.fetch({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.domainOptions = result.data;
                        this.siteUrl = this.domainOptions[0]['domain'];
                        // Lấy danh mục ngay khi có domain
                        this.getCategories();

                        this.cd.markForCheck();
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    /**
     * Lấy danh mục từ WordPress
     * Logic: Ban đầu sort tạm theo số bài viết (count)
     */
    getCategories() {
        this._wordpressService.categories({
            domain: this.siteUrl
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && Array.isArray(result)) {
                        // Khởi tạo views = 0
                        this.categoryItems = result.map((c: any) => ({
                            ...c,
                            attributedViews: 0
                        }));
                        // Sort ban đầu theo count
                        this.categoryItems.sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
                    } else {
                        this.toastr.warning('Lấy danh mục thất bại.');
                    }
                    this.cd.markForCheck();
                },
                error: () => {
                    this.toastr.warning('Lấy danh mục thất bại.');
                },
                complete: () => { }
            });
    }

    // ====== CSV, GSC Charts, AI, Ads Logic (Giữ nguyên) ======

    readFile = (e: any) => {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const reader = new FileReader();
            reader.onload = () => {
                const text = reader.result as string;
                this.parseCsv(text);
            };
            reader.readAsText(file);
        }
    };

    parseCsv(csvString: string): void {
        const lines = csvString
            .split(/\r\n|\n/)
            .filter(line => line.trim().length > 0);

        const parsed = lines.map(line => line.split(','));
        this.csvData = parsed;

        if (parsed.length === 0) {
            this.columns = [];
            this.rows = [];
            this.filteredRows = [];
            return;
        }

        this.columns = parsed[0];

        const idxQuery = this.columns.indexOf('Truy vấn phổ biến nhất');
        const idxClicks = this.columns.indexOf('Lượt nhấp');
        const idxImpressions = this.columns.indexOf('Lượt hiển thị');
        const idxCtr = this.columns.indexOf('CTR');
        const idxPosition = this.columns.indexOf('Vị trí');

        const stats: QueryStat[] = parsed.slice(1).map(line => {
            const rawCtr = (line[idxCtr] || '0').toString().replace('%', '').trim();
            return {
                query: line[idxQuery] ?? '',
                clicks: Number(line[idxClicks] || 0),
                impressions: Number(line[idxImpressions] || 0),
                ctr: Number(rawCtr || 0),
                position: Number(line[idxPosition] || 0)
            };
        });

        this.rows = stats;
        this.filteredRows = [...this.rows];

        this.totalClicks = stats.reduce((sum, r) => sum + r.clicks, 0);
        this.totalImpressions = stats.reduce((sum, r) => sum + r.impressions, 0);
        this.avgCtr = stats.length
            ? stats.reduce((sum, r) => sum + r.ctr, 0) / stats.length
            : 0;
        this.avgPosition = stats.length
            ? stats.reduce((sum, r) => sum + r.position, 0) / stats.length
            : 0;

        this.buildCharts(stats);
    }

    async loadFromGSC(): Promise<void> {
        try {
            if (!window.electron?.gscQuery) {
                this.toastr.error('Không tìm thấy electron.gscQuery');
                return;
            }
            if (!this.startDate || !this.endDate) {
                this.toastr.error('Vui lòng chọn ngày bắt đầu và ngày kết thúc');
                return;
            }

            const detailPromise = window.electron.gscQuery({
                startDate: this.startDate,
                endDate: this.endDate,
                siteUrl: this.siteUrl,
                mode: 'detail',
                dimensions: ['query', 'date'],
                rowLimit: 25000
            });

            const totalsPromise = window.electron.gscQuery({
                startDate: this.startDate,
                endDate: this.endDate,
                siteUrl: this.siteUrl,
                mode: 'totals'
            });

            const [detailRes, totalsRes] = await Promise.all([detailPromise, totalsPromise]);

            if (!detailRes.success) {
                this.toastr.error(`Lỗi GSC (detail): ${detailRes.error}`);
                return;
            }
            if (!totalsRes.success) {
                this.toastr.error(`Lỗi GSC (totals): ${totalsRes.error}`);
                return;
            }

            this.dailyStatsAll = (detailRes.rows || []).map(r => ({
                query: r.keys[0],
                date: r.keys[1],
                clicks: r.clicks || 0,
                impressions: r.impressions || 0,
                ctr: (r.ctr || 0) * 100,
                position: r.position || 0
            }));

            const aggMap = new Map<string, { clicks: number; impressions: number; posSum: number }>();

            for (const d of this.dailyStatsAll) {
                if (!aggMap.has(d.query)) {
                    aggMap.set(d.query, { clicks: 0, impressions: 0, posSum: 0 });
                }
                const a = aggMap.get(d.query)!;
                a.clicks += d.clicks;
                a.impressions += d.impressions;
                a.posSum += d.position * d.impressions;
            }

            const stats: QueryStat[] = Array.from(aggMap.entries()).map(([query, a]) => {
                const impressions = a.impressions;
                const clicks = a.clicks;
                const ctr = impressions ? (clicks / impressions) * 100 : 0;
                const position = impressions ? a.posSum / impressions : 0;
                return { query, clicks, impressions, ctr, position };
            });

            this.rows = stats;
            this.filteredRows = [...this.rows];

            this.buildCharts(stats);

            if (this.selectedComparisonQueries.length) {
                this.updateKeywordCharts();
            }

            const totalRow = (totalsRes.rows || [])[0];

            this.totalClicks = totalRow?.clicks ?? 0;
            this.totalImpressions = totalRow?.impressions ?? 0;
            this.avgCtr = (totalRow?.ctr ?? 0) * 100;     // ctr trả về 0–1
            this.avgPosition = totalRow?.position ?? 0;

            this.cd.markForCheck();
            this.toastr.success('Đã tải báo cáo GSC');
        } catch (e: any) {
            console.error(e);
            this.toastr.error(`Lỗi khi tải GSC: ${e.message || e}`);
        }
    }

    private buildCharts(stats: QueryStat[]): void {
        const topByClicks = [...stats]
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10);

        const categories = topByClicks.map(r => r.query);

        this.chartOptionsTopQueries = {
            series: [
                { name: 'Lượt nhấp', data: topByClicks.map(r => r.clicks) },
                { name: 'Lượt hiển thị', data: topByClicks.map(r => r.impressions) }
            ],
            chart: {
                type: 'bar',
                height: 400
            },
            xaxis: {
                categories,
                labels: { rotate: -45, trim: false }
            },
            dataLabels: { enabled: false },
            plotOptions: {
                bar: { horizontal: false }
            },
            legend: { position: 'top' }
        };

        this.chartOptionsCtr = {
            series: [
                { name: 'CTR (%)', data: topByClicks.map(r => r.ctr) }
            ],
            chart: {
                type: 'line',
                height: 350
            },
            xaxis: {
                categories,
                labels: { rotate: -45, trim: false }
            },
            yaxis: {
                labels: {
                    formatter: (val: number) => `${val.toFixed(1)}%`
                }
            },
            dataLabels: {
                enabled: true,
                formatter: (val: number) => `${val.toFixed(1)}%`
            }
        };
    }

    applyFilter(): void {
        const term = this.searchTerm.trim().toLowerCase();
        if (!term) {
            this.filteredRows = [...this.rows];
            return;
        }
        this.filteredRows = this.rows.filter(r =>
            (r.query || '').toLowerCase().includes(term)
        );
    }

    onSearchTermChange(): void {
        this.applyFilter();
    }

    onTableActivate(event: any): void {
        if (event.type === 'click' && event.row) {
            const row = event.row as QueryStat;
            this.toggleKeywordSelection(row.query);
            this.loadAdsForKeyword(row.query);
        }
    }

    private toggleKeywordSelection(query: string): void {
        const idx = this.selectedComparisonQueries.indexOf(query);
        if (idx >= 0) {
            this.selectedComparisonQueries.splice(idx, 1);
        } else {
            this.selectedComparisonQueries.push(query);
        }
        this.updateKeywordCharts();
    }

    getRowClass = (row: QueryStat) => {
        return this.selectedComparisonQueries.includes(row.query)
            ? 'bg-yellow-50'
            : '';
    };

    private updateKeywordCharts(): void {
        if (!this.dailyStatsAll.length || !this.selectedComparisonQueries.length) {
            this.chartOptionsKeywordCompare = undefined;
            this.chartOptionsKeywordGrowth = undefined;
            this.chartOptionsHeatmap = undefined;
            this.cd.markForCheck();
            return;
        }

        const dates: string[] = [];
        const [sy, sm, sd] = this.startDate.split('-').map(Number);
        const [ey, em, ed] = this.endDate.split('-').map(Number);
        let cur = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);

        while (cur <= end) {
            const y = cur.getFullYear();
            const m = (cur.getMonth() + 1).toString().padStart(2, '0');
            const d = cur.getDate().toString().padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 1);
        }

        const dateLabels = dates.map(d => {
            const [y, m, day] = d.split('-');
            return `${day}/${m}`;
        });

        const ctrSeries: ApexAxisChartSeries = this.selectedComparisonQueries.map(query => {
            const data = dates.map(date => {
                const found = this.dailyStatsAll.find(dd => dd.query === query && dd.date === date);
                return found ? found.ctr : 0;
            });
            return { name: query, data } as any;
        });

        this.chartOptionsKeywordCompare = {
            series: ctrSeries,
            chart: { type: 'line', height: 350 },
            xaxis: { categories: dateLabels },
            yaxis: {
                title: { text: 'CTR (%)' },
                labels: { formatter: (val: number) => `${val.toFixed(1)}%` }
            },
            dataLabels: { enabled: false },
            legend: { position: 'top' }
        };

        const growthSeries: ApexAxisChartSeries = this.selectedComparisonQueries.map(query => {
            const data = dates.map(date => {
                const found = this.dailyStatsAll.find(dd => dd.query === query && dd.date === date);
                if (!found) return 0;
                if (this.selectedMetric === 'clicks') return found.clicks;
                if (this.selectedMetric === 'impressions') return found.impressions;
                if (this.selectedMetric === 'ctr') return found.ctr;
                return found.position;
            });
            return { name: query, data } as any;
        });

        this.chartOptionsKeywordGrowth = {
            series: growthSeries,
            chart: { type: 'line', height: 350 },
            xaxis: { categories: dateLabels },
            yaxis: {
                title: {
                    text:
                        this.selectedMetric === 'clicks' ? 'Clicks'
                            : this.selectedMetric === 'impressions' ? 'Impressions'
                                : this.selectedMetric === 'ctr' ? 'CTR (%)'
                                    : 'Position'
                }
            },
            dataLabels: { enabled: false },
            legend: { position: 'top' }
        };

        const heatmapSeries = this.selectedComparisonQueries.map(query => {
            const data = dates.map((date, i) => {
                const found = this.dailyStatsAll.find(dd => dd.query === query && dd.date === date);
                let value = 0;
                if (found) {
                    if (this.selectedMetric === 'clicks') value = found.clicks;
                    else if (this.selectedMetric === 'impressions') value = found.impressions;
                    else if (this.selectedMetric === 'ctr') value = found.ctr;
                    else value = found.position;
                }
                return { x: dateLabels[i], y: value };
            });
            return { name: query, data };
        });

        this.chartOptionsHeatmap = {
            series: heatmapSeries,
            chart: { type: 'heatmap', height: 400 },
            xaxis: { type: 'category' },
            dataLabels: { enabled: false }
        };

        this.cd.markForCheck();
    }

    changeMetric(): void {
        if (this.selectedComparisonQueries.length) {
            this.updateKeywordCharts();
        }
    }

    downloadCsv(): void {
        if (!this.dailyStatsAll.length) {
            this.toastr.error('Chưa có dữ liệu để xuất CSV');
            return;
        }

        const header = 'query,date,clicks,impressions,ctr,position';
        const lines = this.dailyStatsAll.map(
            d =>
                [
                    `"${d.query.replace(/"/g, '""')}"`,
                    d.date,
                    d.clicks,
                    d.impressions,
                    d.ctr.toFixed(2),
                    d.position.toFixed(2)
                ].join(',')
        );

        const csvContent = [header, ...lines].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `gsc-report-${this.startDate}-${this.endDate}.csv`;
        a.click();

        window.URL.revokeObjectURL(url);
    }

    async exportPdf(): Promise<void> {
        try {
            if (window.electron && window.electron.exportGscPdf) {
                const res = await window.electron.exportGscPdf({
                    siteUrl: this.siteUrl,
                    startDate: this.startDate,
                    endDate: this.endDate
                });
                if (!res.success) {
                    this.toastr.error(res.error || 'Không xuất được PDF');
                    return;
                }
                this.toastr.success('Đã xuất PDF báo cáo');
            } else {
                window.print();
            }
        } catch (e: any) {
            this.toastr.error(e.message || 'Lỗi khi xuất PDF');
        }
    }

    async scheduleDailyEmail(): Promise<void> {
        try {
            if (window.electron && window.electron.scheduleSeoEmail) {
                const res = await window.electron.scheduleSeoEmail({
                    siteUrl: this.siteUrl,
                    startDate: this.startDate,
                    endDate: this.endDate,
                    metric: this.selectedMetric
                });
                if (!res.success) {
                    this.toastr.error(res.error || 'Không tạo được lịch gửi email');
                    return;
                }
                this.toastr.success('Đã tạo lịch gửi báo cáo hằng ngày qua email');
            } else {
                this.toastr.info(
                    'Hook scheduleSeoEmail chưa được implement ở Electron / backend. Hãy nối IPC/API ở phía server.'
                );
            }
        } catch (e: any) {
            this.toastr.error(e.message || 'Lỗi khi lên lịch gửi email');
        }
    }

    async generateAiSuggestions(): Promise<void> {
        if (!this.ai) {
            this.toastr.error('Chưa cấu hình API key Gemini trong settings');
            return;
        }

        if (!this.rows.length) {
            this.toastr.error('Chưa có dữ liệu từ khóa để phân tích');
            return;
        }

        this.aiLoading = true;
        this.aiSuggestions = '';

        try {
            const sorted = [...this.rows].sort((a, b) => {
                const scoreA = (a.impressions || 0) * (1 - (a.ctr || 0) / 100);
                const scoreB = (b.impressions || 0) * (1 - (b.ctr || 0) / 100);
                return scoreB - scoreA;
            });

            const top = sorted.slice(0, 20);

            const prompt = `
Bạn là chuyên gia SEO. Hãy xem danh sách từ khóa Search Console sau:

${JSON.stringify(top, null, 2)}

Với mỗi từ khóa, hãy:
1) Chỉ ra vì sao CTR có thể thấp hoặc vị trí chưa tốt.
2) Gợi ý 2–3 cách tối ưu title, meta description, hoặc nội dung onpage để cải thiện.
3) Ưu tiên những từ khóa có impressions cao nhưng CTR thấp.

Trả lời ngắn gọn, dạng gạch đầu dòng, tiếng Việt, dễ hiểu cho marketer.`;

            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            this.aiSuggestions = response.text;
            this.toastr.success('Đã tạo gợi ý từ AI');
        } catch (e: any) {
            console.error(e);
            this.toastr.error(e.message || 'Lỗi khi gọi AI đề xuất');
        } finally {
            this.aiLoading = false;
            // Google Ads Keyword Planner
            this.adsLoading = false;
            this.adsError = '';
            this.adsResults = [];
            this.currentAdsKeyword = '';
            this.googleAdsCustomerId = '6453144045';

            this.cd.markForCheck();
        }
    }

    async loadAdsForKeyword(query: string): Promise<void> {
        const trimmed = (query || '').trim();
        if (!trimmed) return;

        this.currentAdsKeyword = trimmed;
        this.adsError = '';
        this.adsResults = [];

        if (!window.electron?.googleAdsKeyword) {
            this.adsLoading = false;
            this.adsError = 'Chưa cấu hình bridge electron.googleAdsKeyword trong preload.js / main.js';
            this.cd.markForCheck();
            return;
        }

        this.adsLoading = true;
        this.cd.markForCheck();

        try {
            const res = await window.electron.googleAdsKeyword({
                keywordText: trimmed,
                customerId: this.googleAdsCustomerId,
                languageConstant: 'languageConstants/1004',
                geoTargetConstants: ['geoTargetConstants/2392']
            });

            if (!res || !res.success) {
                this.adsError = res?.error || 'Không lấy được dữ liệu Google Ads';
                return;
            }

            this.adsResults = res.results || [];
        } catch (e: any) {
            this.adsError = e.message || String(e);
        } finally {
            this.adsLoading = false;
            this.cd.markForCheck();
        }
    }

    private async callGaReport(payload: {
        propertyId?: string;
        metrics?: string[];
        dimensions?: string[];
        dimensionFilter?: any;
        limit?: number;
    }): Promise<any | null> {
        if (!window.electron?.analyticsReport) {
            this.toastr.error('Chưa cấu hình bridge analyticsReport trong Electron');
            return null;
        }

        const body = {
            propertyId: this.gaPropertyId || undefined,
            startDate: this.startDate,
            endDate: this.endDate,
            ...payload
        };

        const res = await window.electron.analyticsReport(body);
        if (!res || !res.success) {
            throw new Error(res?.error || 'Không lấy được dữ liệu Google Analytics 4');
        }
        return res.result;
    }

    // ==================================================================================
    // KHU VỰC GA4 LOGIC MỚI: PHÂN TÍCH NHIỀU CATEGORY TỰ ĐỘNG & SYNC
    // ==================================================================================

    async loadGaOverview(): Promise<void> {
        if (!this.startDate || !this.endDate) {
            this.toastr.error('Vui lòng chọn ngày bắt đầu và kết thúc ở bước 1 trước');
            return;
        }

        this.gaLoading = true;
        this.gaError = '';
        this.gaSummary = null;
        this.gaByCountry = [];
        this.gaByDevice = [];
        this.gaByAge = [];
        this.analyzedResults = []; // Reset kết quả

        this.cd.markForCheck();

        try {
            // A. Summary Metrics (Luôn lấy All Users)
            const summary = await this.callGaReport({ metrics: ['activeUsers', 'sessions', 'screenPageViews', 'engagementRate'] });
            const row0 = summary?.rows?.[0]?.metricValues || [];
            const summaryMetrics: any = {};
            (summary?.metricHeaders || []).forEach((m: any, idx: number) => {
                const val = row0[idx]?.value ?? '0';
                summaryMetrics[m.name] = Number(val);
            });
            this.gaSummary = {
                activeUsers: summaryMetrics['activeUsers'] || 0,
                sessions: summaryMetrics['sessions'] || 0,
                screenPageViews: summaryMetrics['screenPageViews'] || 0,
                engagementRate: summaryMetrics['engagementRate'] || 0,
            };

            // B. Load Lists (Country, Device, Age)
            const byCountry = await this.callGaReport({ metrics: ['activeUsers'], dimensions: ['country'], limit: 15 });
            this.gaByCountry = (byCountry?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, activeUsers: Number(r.metricValues?.[0]?.value) }));

            const byDevice = await this.callGaReport({ metrics: ['activeUsers'], dimensions: ['deviceCategory'], limit: 10 });
            this.gaByDevice = (byDevice?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, activeUsers: Number(r.metricValues?.[0]?.value) }));

            const byAge = await this.callGaReport({ metrics: ['activeUsers'], dimensions: ['userAgeBracket'], limit: 10 });
            this.gaByAge = (byAge?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, activeUsers: Number(r.metricValues?.[0]?.value) }));

            // C. Lập danh sách các phân tích cần chạy
            // 1. All Users
            // 2. Mobile
            // 3. Desktop
            // 4. Top Country (nếu có)
            const tasks = [
                { name: 'All Users', filter: undefined },
                { name: 'Mobile', filter: { filter: { fieldName: 'deviceCategory', stringFilter: { value: 'mobile', matchType: 'EXACT' } } } },
                { name: 'Desktop', filter: { filter: { fieldName: 'deviceCategory', stringFilter: { value: 'desktop', matchType: 'EXACT' } } } }
            ];

            if (this.gaByCountry.length > 0) {
                const topCountry = this.gaByCountry[0].dimension;
                tasks.push({
                    name: `Top Country (${topCountry})`,
                    filter: { filter: { fieldName: 'country', stringFilter: { value: topCountry, matchType: 'EXACT' } } }
                });
            }

            // D. Chạy vòng lặp phân tích
            for (const task of tasks) {
                const res = await this.callGaReport({
                    metrics: ['screenPageViews'],
                    dimensions: ['pagePath', 'pageTitle'],
                    dimensionFilter: task.filter,
                    limit: 1000,
                });

                const rawPages = (res?.rows || []).map((r: any) => ({
                    path: r.dimensionValues?.[0]?.value || '/',
                    title: r.dimensionValues?.[1]?.value || '',
                    views: Number(r.metricValues?.[0]?.value || 0),
                }));

                const sortedCats = this.mapGaDataToCategoriesAggregated(rawPages);

                this.analyzedResults.push({
                    name: task.name,
                    categories: sortedCats
                });
            }

            this.toastr.success(`Đã phân tích xong ${this.analyzedResults.length} nhóm đối tượng.`);

        } catch (e: any) {
            console.error(e);
            this.gaError = e.message || 'Lỗi khi gọi Google Analytics 4';
        } finally {
            this.gaLoading = false;
            this.cd.markForCheck();
        }
    }

    // Logic Map Pages -> Categories (Trả về mảng mới để không đè dữ liệu cũ)
    private mapGaDataToCategoriesAggregated(gaPages: { path: string; title: string; views: number }[]): any[] {
        if (!this.categoryItems || this.categoryItems.length === 0) return [];

        const clonedCats = JSON.parse(JSON.stringify(this.categoryItems));

        clonedCats.forEach((cat: any) => {
            let catTotalViews = 0;
            const catSlug = (cat.slug || '').toLowerCase();
            const catName = (cat.name || '').toLowerCase();

            if (!catSlug && !catName) {
                cat.attributedViews = 0;
                return;
            }

            gaPages.forEach(page => {
                const pPath = (page.path || '').toLowerCase();
                const pTitle = (page.title || '').toLowerCase();
                let isMatch = false;

                if (catSlug && pPath.includes(catSlug)) { isMatch = true; }
                else if (catName && pTitle.includes(catName)) { isMatch = true; }

                if (isMatch) { catTotalViews += page.views; }
            });

            cat.attributedViews = catTotalViews;
        });

        // Sort: Views -> Count
        return clonedCats.sort((a: any, b: any) => {
            if (b.attributedViews !== a.attributedViews) {
                return b.attributedViews - a.attributedViews;
            }
            return (b.count || 0) - (a.count || 0);
        });
    }

    // Download JSON cho 1 kết quả cụ thể
    downloadCategoryJson(segmentResult: SegmentResult) {
        if (!segmentResult || !segmentResult.categories || segmentResult.categories.length === 0) {
            this.toastr.warning('Chưa có dữ liệu để tải.');
            return;
        }

        const dataStr = JSON.stringify(segmentResult.categories, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const safeName = segmentResult.name.replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `category_ranking_${safeName}_${this.startDate}.json`;
        a.click();

        window.URL.revokeObjectURL(url);
        this.toastr.success(`Đã tải xuống file JSON: ${segmentResult.name}`);
    }

    /**
     * Hàm đồng bộ dữ liệu về WordPress thông qua Plugin (Dynamic URL)
     * Gửi kèm tên segment để plugin biết lưu vào meta key nào
     */
    async syncToWordpress(segmentResult: any) {
        if (!segmentResult || !segmentResult.categories || segmentResult.categories.length === 0) {
            this.toastr.warning('Không có dữ liệu để đồng bộ.');
            return;
        }

        this.syncLoading = true;
        this.cd.markForCheck();

        // 1. Chuẩn bị payload: Gửi kèm thông tin segment
        const payload = {
            info: {
                segment: segmentResult.name, // "Mobile", "Desktop", ...
                date: new Date().toISOString()
            },
            data: segmentResult.categories.map((cat: any) => ({
                id: cat.id,
                attributedViews: cat.attributedViews
            }))
        };

        // 2. Dynamic URL
        const baseUrl = this.siteUrl.replace(/\/$/, ''); // Xóa dấu / ở cuối nếu có
        const dynamicApiUrl = `${baseUrl}/wp-json/aitype/v1/sync`;

        try {
            const response = await fetch(dynamicApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Aitype-Key': this.wpSyncSecretKey
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.toastr.success(`Đã đồng bộ "${segmentResult.name}" thành công lên ${baseUrl}!`);
            } else {
                throw new Error(data.message || 'Lỗi server');
            }

        } catch (error: any) {
            console.error('Sync Error:', error);
            this.toastr.error('Lỗi khi đồng bộ: ' + error.message);
        } finally {
            this.syncLoading = false;
            this.cd.markForCheck();
        }
    }

    constructor(
        private titleService: Title,
        private _userService: UserService,
        private toastr: ToastrService,
        private _wordpressService: WordpressService,
        private _domainService: DomainService,
        private cd: ChangeDetectorRef,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService
    ) {
        this.titleService.setTitle(`báo cáo seo | ai.type - công cụ tạo content`);

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                if (user.reputation < 3000000) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }
            });

        this.settings = localStorage.getItem('settings');
        if (this.settings) {
            this.settings = this.settings ? JSON.parse(this.settings) : {};
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;

            if (this.secretKey) {
                let geminiKey = this.secretKey[0];
                if (this.secretKey[5]) {
                    geminiKey = this.secretKey[5];
                }
                this.ai = new GoogleGenAI({ apiKey: geminiKey });
            }
        }

        this.alldomains();
    }

    ngOnInit(): void {
        const today = new Date();
        const end = today.toISOString().slice(0, 10);
        const startDateObj = new Date();
        startDateObj.setDate(today.getDate() - 28);
        const start = startDateObj.toISOString().slice(0, 10);

        this.startDate = start;
        this.endDate = end;
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
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

        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}