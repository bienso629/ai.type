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
import { WP2MDService } from 'app/_services/wp2md';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';

import { GenaiService } from 'app/genai.service';

import {
    ApexAxisChartSeries,
    ApexChart,
    ApexXAxis,
    ApexDataLabels,
    ApexPlotOptions,
    ApexLegend,
    ApexYAxis
} from 'ng-apexcharts';
import { DomainService } from 'app/_services/domain';
import { WordpressService } from 'app/_services/wordpress';
import { MultiAccountService } from 'app/_services/multi-account.service';

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
    styleUrls: ['./seo-report.component.scss'],
    templateUrl: './seo-report.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [WP2MDService, DomainService, WordpressService]
})
export class GSCReportComponent implements OnInit, OnDestroy {
    xml: any;
    config: AppConfig;
    user: User;
    isLinear = false;
    selectedIndex = 0;

    settings: any;
    secretKey: any;
    searchAPIKey: any;
    // ai: any;

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
    gscLoading = false;

    // Google Ads Keyword Planner
    adsLoading = false;
    adsError = '';
    adsResults: any[] = [];
    currentAdsKeyword = '';
    googleAdsCustomerId = '6453144045';

    // Google Analytics 4 (GA4) Variables
    gaPropertyId = ''; // cho phép nhập từ UI
    gaPropertyIds: string[] = [];
    gaLoading = false;
    gaError = '';
    gaSummary: {
        totalUsers: number;
        sessions: number;
        screenPageViews: number;
        engagementRate: number;
    } | null = null;

    // Biểu đồ xu hướng theo tháng (từ 01/01 năm hiện tại đến hôm nay), độc lập với khoảng ngày Từ/Đến ở Bước 1
    chartOptionsGaUsersTrend?: ChartOptions;
    chartOptionsGaSessionsTrend?: ChartOptions;
    chartOptionsGaPageViewsTrend?: ChartOptions;
    chartOptionsGaEngagementTrend?: ChartOptions;

    // Dữ liệu tham chiếu
    gaByCountry: { dimension: string; totalUsers: number }[] = [];
    gaByDevice: { dimension: string; totalUsers: number }[] = [];
    gaByAge: { dimension: string; totalUsers: number }[] = [];
    gaByEvent: { dimension: string; count: number }[] = [];

    // --- BIẾN LƯU KẾT QUẢ PHÂN TÍCH NHIỀU SEGMENT ---
    analyzedResults: SegmentResult[] = [];
    gaTopPages: { path: string; title: string; views: number }[] = [];
    // ------------------------------------------------

    // ------------------------------------------------

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
                    } else {
                        this.domainOptions = [{ domain: 'https://type.vn' }] as any;
                    }
                    this.siteUrl = this.domainOptions[0]['domain'];
                    // Lấy danh mục ngay khi có domain
                    this.getCategories();

                    this.cd.markForCheck();
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

            this.gscLoading = true;
            this.cd.markForCheck();

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
        } finally {
            this.gscLoading = false;
            this.cd.markForCheck();
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

    async generateAIAnalysis(): Promise<void> {
        // if (!this.ai) {
        //     this.toastr.error('Bạn chưa cấu hình API Key cho Google Gemini trong phần Cài đặt.');
        //     return;
        // }

        if (!this.rows || this.rows.length === 0) {
            this.toastr.error('Chưa có dữ liệu từ khóa để phân tích. Hãy tải dữ liệu GSC trước.');
            return;
        }

        this.aiLoading = true;
        this.aiSuggestions = '';
        this.cd.markForCheck();

        try {
            // Lấy tối đa 50 từ khóa hàng đầu để tránh quá tải token
            const top50 = this.rows.slice(0, 50);
            const dataString = top50.map((r: any) =>
                `- Từ khóa: "${r.query}", Lượt nhấp: ${r.clicks}, Hiển thị: ${r.impressions}, CTR: ${r.ctr.toFixed(1)}%, Vị trí TB: ${r.position.toFixed(1)}`
            ).join('\n');

            let gaContext = '';
            if (this.gaSummary) {
                gaContext = `
Đồng thời, trang web đang có các chỉ số Google Analytics 4 (GA4) tổng quan trong cùng kỳ như sau:
- Total Users (Tổng Người dùng): ${this.gaSummary.totalUsers}
- Sessions (Phiên): ${this.gaSummary.sessions}
- Page Views (Lượt xem trang): ${this.gaSummary.screenPageViews}
- Engagement Rate (Tỷ lệ tương tác): ${(this.gaSummary.engagementRate * 100).toFixed(2)}%
`;
            }

            const prompt = `
Bạn là một chuyên gia SEO hàng đầu với 10 năm kinh nghiệm phân tích dữ liệu đa kênh (Google Search Console & Google Analytics 4). 
Dưới đây là số liệu 50 từ khóa hàng đầu của website tôi hiện tại (từ GSC):

${dataString}
${gaContext}
Hãy phân tích và trình bày cấu trúc kết quả theo trình tự sau:

PHẦN 1: TỔNG QUAN HIỆU SUẤT VÀ TRẢI NGHIỆM NGƯỜI DÙNG
- Những điểm sáng đã làm tốt: Ghi nhận thành quả của những từ khóa top, hoặc tỷ lệ tương tác (nếu có).
- Trọng tâm cần cải thiện: Tóm tắt ngắn gọn các nguyên nhân kìm hãm lượng truy cập (CTR kém, hoặc nếu có GA4 thì nhận xét xem Tỷ lệ tương tác/Page views có tương xứng với Lượt nhấp không). Mức tương tác dưới 50% thường được xem là thấp.

PHẦN 2: CHI TIẾT TỪNG TIÊU CHÍ (Kết hợp dữ liệu nếu có)
1. Low-hanging fruit (Trái ngọt dễ hái): Từ khóa rơi vị trí 11-20 nhưng Impressions rất cao (Hãy kể tên từ khóa và đề xuất gắn thêm liên kết nội bộ).
2. Tối ưu tiêu đề (Title): Từ khóa có vị trí Top 1 đến Top 5 rất tốt, có Impressions cao nhưng CTR lại quá thấp (< 4%).
3. Tăng trưởng đột ngột: Từ khóa có Impressions lớn một cách bất thường, có thể là do trend (đề xuất viết thêm bài chuyên sâu).
4. Phễu lưu giữ người dùng: Từ những từ khóa mang lại Lượt nhấp nhiều nhất so với Tỷ lệ tương tác tổng quan, hãy đề xuất 2-3 cách điều hướng UI/UX hoặc bổ sung Media/Video để giữ chân người dùng ở lại trang lâu hơn.
5. Đề xuất nhóm Long-tail keyword: Những từ khoá có đuôi dài mang tính hỏi đáp để viết mới.

Trả về kết quả bằng ĐỊNH DẠNG BẢNG HTML (dùng chuỗi thẻ <table>, <thead>, <tbody>, <tr>, <th>, <td>).
VƠI MỖI TIÊU CHÍ TRÊN, HÃY TẠO RIÊNG MỘT BẢNG VÀ CHÈN SẴN style="margin-top: 1.5rem; margin-bottom: 2rem;" VÀO THẺ &lt;table&gt; ĐỂ CÁCH ĐỀU. Các cột khuyên dùng: "Từ khóa", "Vị trí", "Lượt hiển thị", "CTR", "Đề xuất tối ưu". 
KHÔNG DÙNG danh sách <ul> <li> để liệt kê từ khóa nữa. Có thể dùng <h3> cho tiêu đề từng tiêu chí.
KHÔNG DÙNG MARKDOWN. KHÔNG ĐÓNG DẤU \`\`\`html hoặc \`\`\` quanh bài viết. Nếu một tiêu chí nào không có số liệu thỏa mãn thì có thể bỏ qua.
Trình bày chuyên nghiệp trực diện, xưng hô "hệ thống" với "bạn".`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            let responseText = response.text || '';

            // Loại bỏ bọc markdown nếu có bị dính
            responseText = responseText.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();

            this.aiSuggestions = responseText;
        } catch (error: any) {
            this.toastr.error('Lỗi khi phân tích AI: ' + error.message);
            console.error('AI Error:', error);
        } finally {
            this.aiLoading = false;
            this.cd.markForCheck();
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

    isExportingPdf: boolean = false;

    async exportPdf(): Promise<void> {
        this.isExportingPdf = true;
        this.cd.detectChanges();

        // Ngủ 500ms để chờ Angular nặn hàng ngàn thẻ table row (DOM) ra màn hình thay vì cuộn ảo
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const element = document.querySelector('google-search-console') as HTMLElement
                || document.querySelector('google-search-console\\.component') as HTMLElement;

            if (!element) {
                this.toastr.error('Không tìm thấy vùng báo cáo để chụp PDF');
                return;
            }

            this.toastr.info('Đang kết xuất hình ảnh báo cáo (có thể mất vài giây)...');

            // 1. Phá vỡ các giới hạn scroll, cắt thẻ flex-auto để web bung vô hạn chiều dọc
            const scrollContainer = element.querySelector('.overflow-y-auto') as HTMLElement;
            const targetCapture = scrollContainer || element;

            // Xoá tạm thời class dark của ứng dụng nếu có để ngăn PDF bị ám đen màu nền
            const darkElements = Array.from(document.querySelectorAll('.dark'));
            darkElements.forEach(el => el.classList.remove('dark'));

            // Gán chết màu nền trắng vào thuộc tính style inline để dập lại màu nền xám đen (#212121) của cửa sổ BrowserWindow
            const htmlTag = document.documentElement;
            const bodyTag = document.body;
            const originalHtmlBg = htmlTag.style.backgroundColor;
            const originalBodyBg = bodyTag.style.backgroundColor;
            htmlTag.style.backgroundColor = '#ffffff';
            bodyTag.style.backgroundColor = '#ffffff';

            // 2. Tách đúng đoạn HTML của google-search-console ra một DOM tĩnh hoàn toàn để thoát ly khỏi cấu trúc Angular Flexbox
            const printOverlay = document.createElement('div');
            printOverlay.id = 'static-print-overlay';
            // Cảm ơn Angular vì đã render Virtual Scroll ở đoạn await delay 500ms phía trên, giờ ta chỉ việc lấy HTML tĩnh.
            printOverlay.innerHTML = targetCapture.outerHTML;
            document.body.appendChild(printOverlay);

            // 3. Tạo một style động dành riêng cho quá trình in 
            const printStyle = document.createElement('style');
            printStyle.innerHTML = `
                @media print {
                    /* Ép toàn bộ khung nền màn hình thành màu trắng tinh khiết chống lại cờ Dark Mode */
                    html, body {
                        background-color: white !important;
                        color: black !important;
                    }
                    /* Ẩn hoàn toàn gốc rễ ứng dụng Angular hiện hành */
                    app-root {
                        display: none !important;
                    }
                    /* Layout tĩnh phải trôi tự do (relative/static) mới được trình duyệt tự cắt trang (Pagination) */
                    #static-print-overlay {
                        display: block !important;
                        position: relative !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        background: white !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    /* Ép bung toàn bộ chiều cao các box cuộn */
                    .overflow-y-auto, .absolute.inset-0, .v-scroll, .flex-auto {
                        position: relative !important;
                        overflow: visible !important;
                        height: auto !important;
                        display: block !important;
                        max-height: none !important;
                        width: auto !important;
                        flex: none !important;
                    }
                    /* Khắc phục biểu đồ (SVG của ApexChart) fix cứng width theo OuterHTML khiến chúng đè lên nhau */
                    apx-chart, apx-chart > div {
                        width: 100% !important;
                        max-width: 100% !important;
                        overflow: hidden !important;
                    }
                    apx-chart svg {
                        width: 100% !important;
                        height: auto !important;
                    }
                    /* Ẩn ba cái nút lặt vặt */
                    .border-b, button, mat-form-field, input[type="file"], .hidden-print {
                        display: none !important;
                    }
                    /* Ép in màu nền */
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
                @media screen {
                    /* Trên màn hình người dùng, ẩn cái frame nháp này đi một cách kín đáo */
                    #static-print-overlay {
                        display: none !important;
                    }
                }
            `;
            document.head.appendChild(printStyle);

            this.toastr.info('Đang kết xuất báo cáo thành File PDF Vector...');

            // 4. Gửi lệnh qua Electron để tiến hành kêt xuất PDF Native (Chromium)
            await (window as any).electron.exportGscPdf({
                siteUrl: this.siteUrl,
                startDate: this.startDate,
                endDate: this.endDate
            });

            // 5. Quét dọn chiến trường sau khi hoàn tất
            document.body.removeChild(printOverlay);
            document.head.removeChild(printStyle);
            darkElements.forEach(el => el.classList.add('dark'));
            htmlTag.style.backgroundColor = originalHtmlBg;
            bodyTag.style.backgroundColor = originalBodyBg;

            this.toastr.success('✅ Đã xuất File Báo Cáo thành công!');

        } catch (e: any) {
            this.toastr.error(e.message || 'Lỗi khi xuất PDF');
            console.error("Lỗi xuất File PDF: ", e);
        } finally {
            this.isExportingPdf = false;
            this.cd.detectChanges();
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
        // if (!this.ai) {
        //     this.toastr.error('Chưa cấu hình API key Gemini trong settings');
        //     return;
        // }

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

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
        startDate?: string;
        endDate?: string;
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
        if (this.gaPropertyId) {
            const trimmed = this.gaPropertyId.trim();
            if (trimmed && !this.gaPropertyIds.includes(trimmed)) {
                this.gaPropertyIds.unshift(trimmed);
                if (this.gaPropertyIds.length > 20) this.gaPropertyIds.pop();
                this.multiAccountService.setItem('gaPropertyIds', this.gaPropertyIds);
            }
        }

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
        this.gaByEvent = [];
        this.analyzedResults = []; // Reset kết quả

        this.cd.markForCheck();

        try {
            // A. Summary Metrics (Luôn lấy All Users)
            const summary = await this.callGaReport({ metrics: ['totalUsers', 'sessions', 'screenPageViews', 'engagementRate'] });
            const row0 = summary?.rows?.[0]?.metricValues || [];
            const summaryMetrics: any = {};
            (summary?.metricHeaders || []).forEach((m: any, idx: number) => {
                const val = row0[idx]?.value ?? '0';
                summaryMetrics[m.name] = Number(val);
            });
            this.gaSummary = {
                totalUsers: summaryMetrics['totalUsers'] || 0,
                sessions: summaryMetrics['sessions'] || 0,
                screenPageViews: summaryMetrics['screenPageViews'] || 0,
                engagementRate: summaryMetrics['engagementRate'] || 0,
            };

            // A2. Biểu đồ xu hướng theo tháng (từ 01/01 năm hiện tại đến hôm nay)
            await this.buildGaMonthlyTrendCharts();

            // B. Load Lists (Country, Device, Age)
            const byCountry = await this.callGaReport({ metrics: ['totalUsers'], dimensions: ['country'], limit: 15 });
            this.gaByCountry = (byCountry?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, totalUsers: Number(r.metricValues?.[0]?.value) }));

            const byDevice = await this.callGaReport({ metrics: ['totalUsers'], dimensions: ['deviceCategory'], limit: 10 });
            this.gaByDevice = (byDevice?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, totalUsers: Number(r.metricValues?.[0]?.value) }));

            const byAge = await this.callGaReport({ metrics: ['totalUsers'], dimensions: ['userAgeBracket'], limit: 10 });
            this.gaByAge = (byAge?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, totalUsers: Number(r.metricValues?.[0]?.value) }));

            const byEvent = await this.callGaReport({ metrics: ['eventCount'], dimensions: ['eventName'], limit: 10 });
            this.gaByEvent = (byEvent?.rows || []).map((r: any) => ({ dimension: r.dimensionValues?.[0]?.value, count: Number(r.metricValues?.[0]?.value) }));

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

    /**
     * Xây 4 biểu đồ sparkline xu hướng theo tháng (Người dùng, Phiên, Lượt xem, Tỷ lệ tương tác)
     * Luôn lấy dữ liệu từ 01/01 năm hiện tại đến hôm nay, độc lập với khoảng ngày Từ/Đến ở Bước 1.
     */
    private async buildGaMonthlyTrendCharts(): Promise<void> {
        const today = new Date();
        const yearStart = `${today.getFullYear()}-01-01`;
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const monthly = await this.callGaReport({
            metrics: ['totalUsers', 'sessions', 'screenPageViews', 'engagementRate'],
            dimensions: ['yearMonth'],
            startDate: yearStart,
            endDate: todayStr,
            limit: 12,
        });

        const rows = (monthly?.rows || []).slice().sort((a: any, b: any) => {
            return (a.dimensionValues?.[0]?.value || '').localeCompare(b.dimensionValues?.[0]?.value || '');
        });

        const metricHeaders = (monthly?.metricHeaders || []).map((m: any) => m.name);
        const idxUsers = metricHeaders.indexOf('totalUsers');
        const idxSessions = metricHeaders.indexOf('sessions');
        const idxPageViews = metricHeaders.indexOf('screenPageViews');
        const idxEngagement = metricHeaders.indexOf('engagementRate');

        const categories = rows.map((r: any) => {
            const ym = r.dimensionValues?.[0]?.value || ''; // VD: "202607"
            return ym.length === 6 ? `${ym.slice(4, 6)}/${ym.slice(0, 4)}` : ym;
        });

        const buildSeriesData = (idx: number, isPercent = false) => rows.map((r: any) => {
            const val = Number(r.metricValues?.[idx]?.value || 0);
            return isPercent ? Math.round(val * 10000) / 100 : val;
        });

        const makeSparkline = (name: string, data: number[], color: string, isPercent = false): ChartOptions => ({
            series: [{ name, data }],
            chart: { type: 'area', height: 80, sparkline: { enabled: true } } as any,
            colors: [color],
            xaxis: { categories },
            dataLabels: { enabled: false },
            yaxis: isPercent ? { labels: { formatter: (val: number) => `${val.toFixed(1)}%` } } : undefined,
            plotOptions: undefined,
            legend: undefined,
        } as any);

        this.chartOptionsGaUsersTrend = makeSparkline('Người dùng', buildSeriesData(idxUsers), '#2563eb');
        this.chartOptionsGaSessionsTrend = makeSparkline('Phiên truy cập', buildSeriesData(idxSessions), '#16a34a');
        this.chartOptionsGaPageViewsTrend = makeSparkline('Lượt xem trang', buildSeriesData(idxPageViews), '#9333ea');
        this.chartOptionsGaEngagementTrend = makeSparkline('Tỷ lệ tương tác', buildSeriesData(idxEngagement, true), '#ea580c', true);
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

    constructor(
        private titleService: Title,
        private _userService: UserService,
        private toastr: ToastrService,
        private _wordpressService: WordpressService,
        private _domainService: DomainService,
        private cd: ChangeDetectorRef,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService,
        private route: ActivatedRoute
    ) {
        this.titleService.setTitle(`báo cáo seo | ai.type - công cụ tạo content`);

        this.route.queryParams.subscribe((params: Params) => {
            if (params['tab']) {
                this.selectedIndex = parseInt(params['tab'], 10);
            }
        });

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;


            });

        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;

            if (this.secretKey) {
                // let geminiKey = this.secretKey[0];
                // if (this.secretKey[5]) { geminiKey = this.secretKey[5]; }
                // this.ai = new GoogleGenAI({ apiKey: geminiKey });
            }
        }

        this.alldomains();
    }

    ngOnInit(): void {
        const savedGaIds = this.multiAccountService.getItem('gaPropertyIds');
        if (savedGaIds && Array.isArray(savedGaIds)) {
            this.gaPropertyIds = savedGaIds;
            if (!this.gaPropertyId && this.gaPropertyIds.length > 0) {
                this.gaPropertyId = this.gaPropertyIds[0];
            }
        }

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        this.startDate = `${year}-${month}-01`;
        this.endDate = `${year}-${month}-${day}`;
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
    // PageSpeed Insights
    pageSpeedData: any = null;
    isPageSpeedLoading = false;
    pageSpeedError = '';
    pageSpeedActiveTab = 'performance';

    async fetchPageSpeedData() {
        this.pageSpeedError = '';
        this.pageSpeedData = null;

        if (!this.siteUrl) {
            this.pageSpeedError = "Vui lòng chọn hoặc nhập Domain!";
            return;
        }

        this.isPageSpeedLoading = true;
        this.cd.markForCheck();

        const API_KEY = 'AIzaSyD8CKrKLMTByra9kiAZFcTRYgoarpVixXA';
        const normalizedUrl = /^https?:\/\//i.test(this.siteUrl) ? this.siteUrl : `https://${this.siteUrl}`;
        const apiEndpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(normalizedUrl)}&strategy=desktop&key=${API_KEY}&category=performance&category=accessibility&category=best-practices&category=seo`;

        try {
            const response = await fetch(apiEndpoint);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || `Lỗi HTTP: ${response.status}`);
            }

            this.pageSpeedData = await response.json();
            this.pageSpeedActiveTab = 'performance';
        } catch (error: any) {
            console.error(error);
            this.pageSpeedError = `Đã xảy ra lỗi: ${error.message}`;
        } finally {
            this.isPageSpeedLoading = false;
            this.cd.markForCheck();
        }
    }

    getPageSpeedScore(category: string): number | string {
        if (!this.pageSpeedData) return 'N/A';
        const score = this.pageSpeedData.lighthouseResult?.categories[category]?.score;
        return score !== undefined ? Math.round(score * 100) : 'N/A';
    }

    getPageSpeedScoreColor(category: string): string {
        const scoreVal = this.getPageSpeedScore(category);
        if (scoreVal === 'N/A') return '#9aa0a6';
        const score = scoreVal as number;
        if (score >= 90) return '#1e8e3e';
        if (score >= 50) return '#f9ab00';
        return '#d93025';
    }

    switchPageSpeedTab(tab: string) {
        this.pageSpeedActiveTab = tab;
        this.cd.markForCheck();
    }

    getAuditLists(categoryKey: string) {
        if (!this.pageSpeedData) return { passed: [], failed: [], inform: [], category: null };
        const category = this.pageSpeedData.lighthouseResult.categories[categoryKey];
        const audits = this.pageSpeedData.lighthouseResult.audits;
        const passed: any[] = [];
        const failed: any[] = [];
        const inform: any[] = [];

        if (category && category.auditRefs) {
            category.auditRefs.forEach((ref: any) => {
                const audit = audits[ref.id];
                if (!audit) return;
                
                audit.cleanDesc = audit.description ? audit.description.replace(/\[(.*?)\]\((.*?)\)/g, '$1') : '';
                audit.isPassed = audit.score !== null && audit.score >= 0.9;
                audit.isInformational = audit.score === null;
                audit.isExpanded = false;

                if (audit.isPassed) passed.push(audit);
                else if (audit.isInformational) inform.push(audit);
                else failed.push(audit);
            });
        }
        return { passed, failed, inform, category };
    }

    toggleAuditDetail(audit: any) {
        audit.isExpanded = !audit.isExpanded;
        this.cd.markForCheck();
    }

    truncateUrl(url: string) {
        try {
            const parsed = new URL(url);
            let path = parsed.pathname + parsed.search;
            if (path.length > 40) {
                path = path.substring(0, 18) + '...' + path.substring(path.length - 15);
            }
            return parsed.hostname + path;
        } catch(e) {
            return url.length > 40 ? url.substring(0, 37) + '...' : url;
        }
    }

    formatAuditValue(val: any, heading: any, key: string) {
        if (val === undefined || val === null) return '';
        if (typeof val === 'object' && val.type === 'url') return val.value;
        if (heading.valueType === 'bytes') return (val / 1024).toFixed(1) + ' KB';
        if (heading.valueType === 'timespanMs' || key.includes('Ms') || key.includes('time')) {
            return typeof val === 'number' ? val.toFixed(0) + ' ms' : val;
        }
        return val;
    }

    isUrlValue(val: any) {
        return (typeof val === 'object' && val.type === 'url') || (typeof val === 'string' && val.startsWith('http'));
    }
    
    getUrlValue(val: any) {
        if (typeof val === 'object' && val.type === 'url') return val.value;
        return val;
    }

    getFieldData(experience: any) {
        if (!experience || !experience.metrics) return null;
        
        const category = experience.overall_category || 'AVERAGE';
        let badgeClass = 'badge none';
        let badgeText = 'TRUNG BÌNH';
        if (category === 'FAST') { badgeClass = 'badge passed'; badgeText = 'ĐẠT (FAST)'; }
        else if (category === 'SLOW') { badgeClass = 'badge failed'; badgeText = 'TỆ (SLOW)'; }
        
        const metricsMapping: any = {
            'FIRST_CONTENTFUL_PAINT_MS': 'FCP (First Contentful Paint)',
            'LARGEST_CONTENTFUL_PAINT_MS': 'LCP (Largest Contentful Paint)',
            'CUMULATIVE_LAYOUT_SHIFT_SCORE': 'CLS (Cumulative Layout Shift)',
            'INTERACTIVE_TO_NEXT_PAINT': 'INP (Interaction to Next Paint)',
            'FIRST_INPUT_DELAY_MS': 'FID (First Input Delay)'
        };

        const metricsList = Object.keys(experience.metrics).map(key => {
            const metric = experience.metrics[key];
            const name = metricsMapping[key] || key;
            const val = metric.percentile;
            const dists = metric.distributions;
            let displayVal = val;
            if (key.includes('MS') || key === 'INTERACTIVE_TO_NEXT_PAINT') {
                displayVal = (val / 1000).toFixed(2) + ' s';
            } else if (key.includes('SHIFT')) {
                displayVal = (val / 100).toFixed(3);
            }
            const goodPct = Math.round((dists[0]?.proportion || 0) * 100);
            const avgPct = Math.round((dists[1]?.proportion || 0) * 100);
            const poorPct = Math.round((dists[2]?.proportion || 0) * 100);

            return { name, displayVal, goodPct, avgPct, poorPct };
        });

        return { category, badgeClass, badgeText, metricsList };
    }

    downloadFullJSON() {
        if (!this.pageSpeedData) return;
        let domainName = "domain";
        try {
            domainName = new URL(this.siteUrl).hostname.replace('www.', '');
        } catch(e) {}
        const filename = `PageSpeed_RawData_${domainName}_${new Date().toISOString().slice(0,10)}.json`;
        const jsonStr = JSON.stringify(this.pageSpeedData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
    }

    changetab(e: any) {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { tab: e.index },
            queryParamsHandling: 'merge'
        });
    }
}
