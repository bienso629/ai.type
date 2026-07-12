import { Component, OnDestroy, OnInit, ViewEncapsulation, ViewChild, TemplateRef, ChangeDetectorRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { UserClientService } from 'app/modules/_services/user';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { CrawlService } from 'app/modules/_services/crawl';
import { Subject, takeUntil } from 'rxjs';
import { TranslocoService } from '@ngneat/transloco';
import { FuseSplashScreenService } from '@fuse/services/splash-screen/splash-screen.service';
import { MatDialog } from '@angular/material/dialog';
import { DomainService } from 'app/modules/_services/domain';

@Component({
    selector: 'dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    providers: [UserClientService, CrawlService, DomainService],
    encapsulation: ViewEncapsulation.None
})
export class DashboardComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    initialLoadCount: number = 0;
    isFirstAppLoad: boolean = false;
    
    checkInitialLoad() {
        this.initialLoadCount--;
        if (this.initialLoadCount <= 0 && this.isFirstAppLoad) {
            this._fuseSplashScreenService.hide();
            this.isFirstAppLoad = false;
        }
    }

    collections: any[] = [];
    videoProjects: any[] = [];
    totalVideoProjects: number = 0;
    statistics: any = null;
    
    totalArticles: number = 0;
    activeDomains: number = 0;
    avgArticles: number = 0;
    chartOptions: any = null;
    sparkline1: any = null;
    sparkline2: any = null;
    sparkline3: any = null;

    totalArticlesStatus: { text: string, color: string, icon: string } = { text: 'Tăng trưởng tốt', color: 'text-blue-600', icon: 'trending_up' };
    activeDomainsStatus: { text: string, color: string, icon: string } = { text: 'Cần tối ưu thêm', color: 'text-red-600', icon: 'trending_down' };
    avgArticlesStatus: { text: string, color: string, icon: string } = { text: 'Đạt mục tiêu', color: 'text-green-600', icon: 'trending_up' };
    
    domainTargets: { [key: string]: any } = JSON.parse(localStorage.getItem('domainTargets') || '{}');
    domainChartOptions: any;
    evalMonthToDisplay: number;
    
    @ViewChild('targetDialogTemplate') targetDialogTemplate: TemplateRef<any>;

    getTargetFor(domain: string, month: number): number {
        if (!this.domainTargets) return 0;
        let target = this.domainTargets[domain];
        if (target === undefined) return 0;
        if (typeof target === 'number') return target; // Legacy compatibility
        
        let yearTarget = target[this.selectedYear];
        let legacyTarget = target[month]; // From old structure
        
        if (yearTarget && yearTarget[month] !== undefined && yearTarget[month] !== null) return yearTarget[month];
        if (legacyTarget !== undefined && legacyTarget !== null && typeof legacyTarget === 'number') return legacyTarget;
        
        // Fallback backward...
        if (yearTarget) {
            for (let m = month - 1; m >= 1; m--) {
                if (yearTarget[m] !== undefined && yearTarget[m] !== null) return yearTarget[m];
            }
        }
        
        // legacy fallback
        for (let m = month - 1; m >= 1; m--) {
            if (typeof target[m] === 'number') return target[m];
        }
        
        return 0;
    }


    selectedDomain: string = 'all';
    selectedMonth: string = 'all';
    selectedYear: number = new Date().getFullYear();
    availableDomains: string[] = [];
    allDomains: any[] = [];
    yearsList: number[] = [this.selectedYear - 3, this.selectedYear - 2, this.selectedYear - 1, this.selectedYear];
    monthsList: any[] = [
        { value: 'all', label: 'Tất cả các tháng' },
        { value: '1', label: 'Tháng 1' },
        { value: '2', label: 'Tháng 2' },
        { value: '3', label: 'Tháng 3' },
        { value: '4', label: 'Tháng 4' },
        { value: '5', label: 'Tháng 5' },
        { value: '6', label: 'Tháng 6' },
        { value: '7', label: 'Tháng 7' },
        { value: '8', label: 'Tháng 8' },
        { value: '9', label: 'Tháng 9' },
        { value: '10', label: 'Tháng 10' },
        { value: '11', label: 'Tháng 11' },
        { value: '12', label: 'Tháng 12' }
    ];
    
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Lấy toàn bộ collection
     */
    collection() {
        // Hiển thị cache tức thì (Optimistic UI)
        const cacheKey = `dashboard_collections_${this.user.name}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                this.collections = JSON.parse(cachedData);
            } catch (e) {}
        }
        
        if ((window as any)['dashboard_collections_preloaded']) {
            (window as any)['dashboard_collections_preloaded'] = false;
            this.checkInitialLoad();
            return;
        }

        this._crawlService
            .collections({
                username: this.user.name,
                page: { size: 100 },
                includeUuid: false // Tắt lấy mảng UUID để chống DB scan & Network payload khổng lồ
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.collections = result.data.map((col: any) => {
                            // Nếu backend có trả về count sẵn thì dùng, ngược lại tạm bỏ qua tính count bằng uuid
                            col.count = col.count || (col.uuid && Array.isArray(col.uuid) ? col.uuid.length : 0);
                            return col;
                        });
                        // Cập nhật lại cache mới nhất (lược bỏ data nặng như mảng uuid)
                        const lightweightCache = this.collections.map(col => ({
                            _id: col._id,
                            title: col.title,
                            count: col.count,
                            lastItemUpdatedAt: col.lastItemUpdatedAt,
                            lastUpdatedAt: col.lastUpdatedAt,
                            lastUpdated: col.lastUpdated,
                            updatedAt: col.updatedAt
                        }));
                        localStorage.setItem(cacheKey, JSON.stringify(lightweightCache));
                    }
                },
                error: () => { this.checkInitialLoad(); },
                complete: () => { this.checkInitialLoad(); },
            });
    }

    // lấy account về để đồng bộ ngay cùng lúc với các API khác
    account() {
        if ((window as any)['profile_synced']) {
            this.checkInitialLoad();
            return;
        }
        (window as any)['profile_synced'] = true;

        this._userClientService.profile({
            name: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        if (result.data.styles && result.data.styles.length > 0) this.multiAccountService.setItem('styles', result.data.styles);
                        if (result.data.editor) this.multiAccountService.setItem('editor', result.data.editor);
                        if (result.data.following_users) this.multiAccountService.setItem('following_users', result.data.following_users);
                        if (result.data.settings) {
                             this.multiAccountService.setItem('settings', result.data.settings);
                             if (result.data.settings.domainTargets) {
                                 this.domainTargets = result.data.settings.domainTargets;
                                 localStorage.setItem('domainTargets', JSON.stringify(this.domainTargets));
                                 this.updateChart();
                             }
                        }
                    }
                },
                error: () => { this.checkInitialLoad(); },
                complete: () => { this.checkInitialLoad(); }
            });
    }

    fetchDomains() {
        if ((window as any)['dashboard_domains_preloaded']) {
            (window as any)['dashboard_domains_preloaded'] = false;
            try {
                const cached = localStorage.getItem(`dashboard_domains_${this.user.name}`);
                if (cached) {
                    this.allDomains = JSON.parse(cached);
                    this._changeDetectorRef.markForCheck();
                }
            } catch (e) {}
            return;
        }

        this._domainService.fetch({
            username: this.user.name
        })
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
            next: (result) => {
                if (result && result.success) {
                    this.allDomains = result.data || [];
                    this._changeDetectorRef.markForCheck();
                }
            }
        });
    }

    /**
     * Lấy statistic
     */
    statistic() {
        if ((window as any)['dashboard_statistics_preloaded']) {
            (window as any)['dashboard_statistics_preloaded'] = false;
            try {
                const cached = localStorage.getItem('statistics');
                if (cached) {
                    this.statistics = JSON.parse(cached);
                    this.availableDomains = Object.keys(this.statistics?.domainStats || {});
                    this.updateChart();
                }
            } catch (e) {}
            return;
        }

        this._crawlService
            .statistics({
                username: this.user.name,
                reportYear: this.selectedYear
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        const nodes = result.data || [];
                        const doneCount = nodes[0] ? nodes[0].length : 0;
                        const moneyCount = nodes[0] ? nodes[0].reduce((total: number, obj: any) => (obj.amount || 0) + total, 0) : 0;
                        const writingData = nodes[1] || { total: 0 };
                        const archivesData = nodes[2] || { total: 0 };
                        const domainStatsData = nodes[3] || {};

                        this.statistics = this.statistics || {};
                        this.statistics.domainStats = domainStatsData;
                        this.availableDomains = Object.keys(domainStatsData);
                        this.updateChart();

                        // Lấy dữ liệu cũ để không ghi đè các trường khác
                        let oldStats: any = {};
                        try {
                            const cached = localStorage.getItem('statistics');
                            if (cached) oldStats = JSON.parse(cached);
                        } catch (e) {}

                        const newStats = {
                            ...oldStats,
                            done: doneCount,
                            money: moneyCount,
                            archives: archivesData.total || archivesData || 0,
                            writing: writingData.total || writingData || 0,
                            domainStats: domainStatsData
                        };
                        this.statistics = newStats;

                        localStorage.setItem('statistics', JSON.stringify(newStats));
                    }
                },
                error: () => {
            if (this.initialLoadCount > 0) this.checkInitialLoad();
        },
        complete: () => { 
            if (this.initialLoadCount > 0) this.checkInitialLoad();
        },
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService,
        private _crawlService: CrawlService,
        private translocoService: TranslocoService,
        private _fuseSplashScreenService: FuseSplashScreenService,
        private _matDialog: MatDialog,
        private _changeDetectorRef: ChangeDetectorRef,
        private _domainService: DomainService
    ) {
        this.titleService.setTitle(this.translocoService.translate('nav.dashboard.title'));

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;



                // Chỉ bật Splash Screen khi tải trang lần đầu tiên (F5)
                this.isFirstAppLoad = !(window as any)['profile_synced'];
                if (this.isFirstAppLoad) {
                    this.initialLoadCount = 3; // Chờ cả 3 API: profile, collection, statistic
                    // Bỏ hiển thị lại splash screen vì gây khó chịu khi điều hướng từ trang khác sang
                } else {
                    this.initialLoadCount = 0;
                }

                // Wait for profile setup
                let profileSyncInterval = setInterval(() => {
                    if (this.user.name) {
                        clearInterval(profileSyncInterval);
                        this.account();
                        this.fetchDomains();
                        this.collection();
                        this.statistic();
                    }
                }, 100);
                
                // Get video projects being built
                setTimeout(() => {
                    let projects = this.multiAccountService.getItemsByPrefix('ai_type_audio_merger_data_') || [];
                    const allProjects = projects.filter(p => p.uuid && p.title).reverse().map(p => {
                        // Calculate dynamic status
                        let statusLabel = 'app.draft';
                        let statusClass = 'bg-blue-100 text-blue-600';
                        
                        if (!p.clips || p.clips.length === 0) {
                            statusLabel = 'app.empty';
                            statusClass = 'bg-gray-100 text-gray-600';
                        } else {
                            const hasAudio = p.clips.some((c: any) => c.localFilePath || c.audioFileName);
                            const allAudio = p.clips.every((c: any) => c.localFilePath || c.audioFileName);
                            
                            if (allAudio) {
                                statusLabel = 'app.ready';
                                statusClass = 'bg-green-100 text-green-600';
                            } else if (hasAudio) {
                                statusLabel = 'app.working';
                                statusClass = 'bg-amber-100 text-amber-600';
                            }
                        }
                        
                        return { ...p, statusLabel, statusClass };
                    });
                    this.totalVideoProjects = allProjects.length;
                    this.videoProjects = allProjects.slice(0, 12);
                }, 500); // wait a bit to ensure multiAccountService has loaded if needed
            });
    }

    ngOnInit(): void {
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: this.translocoService.translate('app.notification'),
            message: (message) ? message : this.translocoService.translate('app.request_not_found'),
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: this.translocoService.translate('app.close'),
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: this.translocoService.translate('app.close_again')
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }

    deleteVideoProject(project: any, event: MouseEvent) {
        event.stopPropagation();
        
        const dialogRef = this._fuseConfirmationService.open({
            title: this.translocoService.translate('app.delete_video_script'),
            message: `${this.translocoService.translate('app.are_you_sure_delete_script')} "<b>${project.title || this.translocoService.translate('app.new_project')}</b>"?<br>${this.translocoService.translate('app.action_cannot_be_undone_delete_all')}`,
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'warn'
            },
            actions: {
                confirm: {
                    show: true,
                    label: this.translocoService.translate('app.delete'),
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: this.translocoService.translate('app.cancel')
                }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                // Xóa localStorage
                this.multiAccountService.removeItem(`ai_type_audio_merger_data_${project.uuid}`);
                this.multiAccountService.removeItem(`ai_type_video_ready_data_${project.uuid}`);
                this.multiAccountService.removeItem(`casting_list_${project.uuid}`);
                
                // Cập nhật mảng trên UI
                this.videoProjects = this.videoProjects.filter(p => p.uuid !== project.uuid);
                this.totalVideoProjects--;
                
                // Xóa file trên đĩa qua Electron IPC
                if ((window as any).electron) {
                    try {
                        await (window as any).electron.invoke('delete-project', {
                            targetUuid: project.uuid,
                            username: this.user.name
                        });
                    } catch (e) {
                        console.error('Lỗi khi xóa file đĩa:', e);
                    }
                }
            }
        });
    }

    updateChart() {
        if (!this.statistics || !this.statistics.domainStats) return;
        
        let domainStatsData = this.statistics.domainStats;
        let series = [];
        let categories = [];
        
        let displayDomains = this.selectedDomain === 'all' ? this.availableDomains : [this.selectedDomain];
        
        displayDomains.sort((a, b) => {
            let totalA = 0;
            if (domainStatsData[a]) { Object.values(domainStatsData[a]).forEach((v: any) => totalA += (v || 0)); }
            let totalB = 0;
            if (domainStatsData[b]) { Object.values(domainStatsData[b]).forEach((v: any) => totalB += (v || 0)); }
            return totalB - totalA;
        });
        
        let displayMonths = this.selectedMonth === 'all' ? [1,2,3,4,5,6,7,8,9,10,11,12] : [parseInt(this.selectedMonth, 10)];
        categories = displayMonths.map(m => 'Tháng ' + m);
        
        for (let domain of displayDomains) {
            let data = [];
            for (let m of displayMonths) {
                data.push((domainStatsData[domain] && domainStatsData[domain][m]) ? domainStatsData[domain][m] : 0);
            }
            series.push({
                name: domain,
                data: data
            });
        }
        
        if (series.length === 0) {
            series.push({
                name: 'Chưa có bài viết',
                data: displayMonths.map(() => 0)
            });
        }
        
        const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#14b8a6'];

        this.chartOptions = {
            series: series,
            colors: chartColors,
            chart: { type: 'area', height: 400, fontFamily: 'inherit', toolbar: { show: false }, animations: { enabled: false } },
            grid: { show: false },
            stroke: { width: 3, curve: 'smooth' },
            fill: {
                type: 'gradient',
                gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] }
            },
            markers: { size: 0, hover: { size: 6 } },
            dataLabels: { 
                enabled: true, 
                offsetY: -5,
                background: { enabled: false, dropShadow: { enabled: false } },
                style: { fontSize: '13px', fontWeight: 600, colors: chartColors },
                formatter: function(val) { return val > 0 ? val : ''; }
            },
            xaxis: { 
                categories: categories, 
                labels: { show: false },
                axisTicks: { show: false },
                tooltip: { enabled: false } 
            },
            yaxis: { 
                labels: { show: false },
                min: 0,
                max: (max) => Math.max(5, Math.ceil(max * 1.3)) 
            },
            tooltip: { 
                shared: true, 
                intersect: false,
                y: { formatter: function (val: number) { return val + " bài" } } 
            },
            legend: { position: 'bottom', horizontalAlign: 'center', itemMargin: { horizontal: 10, vertical: 5 } }
        };

        if (displayDomains.length > 0) {

            // Calculate Stats for mini charts
            let total = 0;
            let activeDoms = new Set();
            let monthlyTotals = new Array(12).fill(0);
            
            let targetMonths = this.selectedMonth === 'all' ? [1,2,3,4,5,6,7,8,9,10,11,12] : [parseInt(this.selectedMonth, 10)];
            
            for (let d in domainStatsData) {
                let hasArticlesInPeriod = false;
                for (let m = 1; m <= 12; m++) {
                    if (domainStatsData[d][m]) {
                        monthlyTotals[m-1] += domainStatsData[d][m];
                        if (targetMonths.includes(m)) {
                            total += domainStatsData[d][m];
                            hasArticlesInPeriod = true;
                        }
                    }
                }
                if (hasArticlesInPeriod) activeDoms.add(d);
            }
            
            let activeMonthsCount = 0;
            for (let m of targetMonths) {
                 if (monthlyTotals[m-1] > 0) activeMonthsCount++;
            }
            if (activeMonthsCount === 0) activeMonthsCount = 1;
            
            // Evaluation logic for total articles comparison
            let currentPeriodTotal = 0;
            let previousPeriodTotal = 0;
            
            if (this.selectedMonth !== 'all') {
                 let m = parseInt(this.selectedMonth, 10);
                 currentPeriodTotal = monthlyTotals[m-1];
                 previousPeriodTotal = m > 1 ? monthlyTotals[m-2] : 0;
            } else {
                 let lastActiveMonth = 11;
                 while(lastActiveMonth >= 0 && monthlyTotals[lastActiveMonth] === 0) lastActiveMonth--;
                 if (lastActiveMonth > 0) {
                     currentPeriodTotal = monthlyTotals[lastActiveMonth];
                     previousPeriodTotal = monthlyTotals[lastActiveMonth - 1];
                 } else {
                     currentPeriodTotal = monthlyTotals[0];
                     previousPeriodTotal = 0;
                 }
            }

            this.totalArticles = total;
            this.activeDomains = activeDoms.size;
            let totalDomainsCount = this.allDomains.length > 0 ? this.allDomains.length : (this.activeDomains || 1);
            
            // Tính trung bình bài viết TRONG THÁNG (hoặc tháng gần nhất có data) để so sánh trực tiếp với mục tiêu hàng tháng
            let periodTotalForAvg = this.selectedMonth === 'all' ? currentPeriodTotal : total;
            this.avgArticles = Math.round(periodTotalForAvg / totalDomainsCount);

            if (currentPeriodTotal >= previousPeriodTotal) {
                 this.totalArticlesStatus = { text: 'Tăng trưởng tốt', color: 'text-blue-600', icon: 'trending_up' };
            } else {
                 this.totalArticlesStatus = { text: 'Tăng trưởng yếu', color: 'text-red-600', icon: 'trending_down' };
            }

            let totalDomainsCountForStatus = this.collections ? this.collections.length : 0;
            if (this.activeDomains > totalDomainsCountForStatus / 2) {
                 this.activeDomainsStatus = { text: 'Hoạt động tốt', color: 'text-green-600', icon: 'trending_up' };
            } else {
                 this.activeDomainsStatus = { text: 'Hoạt động yếu', color: 'text-red-600', icon: 'trending_down' };
            }
            
            let evalMonth = 1;
            if (this.selectedMonth !== 'all') {
                 evalMonth = parseInt(this.selectedMonth, 10);
            } else {
                 let lastActiveMonth = 11;
                 while(lastActiveMonth >= 0 && monthlyTotals[lastActiveMonth] === 0) lastActiveMonth--;
                 evalMonth = lastActiveMonth >= 0 ? lastActiveMonth + 1 : 1;
            }

            let totalTargetForAllDomains = 0;
            if (this.allDomains && this.allDomains.length > 0) {
                this.allDomains.forEach(d => {
                     totalTargetForAllDomains += this.getTargetFor(d.domain, evalMonth);
                });
            } else {
                activeDoms.forEach(d => {
                     totalTargetForAllDomains += this.getTargetFor(d as string, evalMonth);
                });
            }
            
            totalDomainsCount = this.allDomains.length > 0 ? this.allDomains.length : (this.activeDomains || 1);
            let avgTargetPerMonth = totalTargetForAllDomains / totalDomainsCount;
            
            let target = avgTargetPerMonth;

            if (Number(this.avgArticles) >= target) {
                 this.avgArticlesStatus = { text: 'Đạt mục tiêu', color: 'text-green-600', icon: 'trending_up' };
            } else {
                 this.avgArticlesStatus = { text: 'Chưa đạt mục tiêu', color: 'text-red-600', icon: 'trending_down' };
            }
            
            // Calculate the first active month for each domain to estimate historical domain counts
            let currentMonthNum = new Date().getMonth() + 1;
            let domainCreatedMonth: { [key: string]: number } = {};
            this.allDomains.forEach(dom => {
                 let d = dom.domain;
                 let firstActive = 12; // default to end of year
                 let found = false;
                 if (domainStatsData[d]) {
                     for (let m = 1; m <= 12; m++) {
                         if (domainStatsData[d][m] > 0) {
                             firstActive = m;
                             found = true;
                             break;
                         }
                     }
                 }
                 // If a domain never published, assume it was created in the current month
                 domainCreatedMonth[d] = found ? firstActive : currentMonthNum;
            });

            // Tính toán data thật cho các biểu đồ mini theo từng tháng
            let monthlyActiveDomains = new Array(12).fill(0);
            let monthlyAvg = new Array(12).fill(0);
            totalDomainsCount = this.allDomains.length > 0 ? this.allDomains.length : (this.activeDomains || 1);
            for (let m = 1; m <= 12; m++) {
                let activeCount = 0;
                for (let d in domainStatsData) {
                    if (domainStatsData[d][m] > 0) activeCount++;
                }
                monthlyActiveDomains[m-1] = activeCount;
                
                // Đếm số domain đã tồn tại tính đến tháng m
                let domainsExistedInMonth = 0;
                this.allDomains.forEach(dom => {
                     if (domainCreatedMonth[dom.domain] <= m) domainsExistedInMonth++;
                });
                if (domainsExistedInMonth === 0) domainsExistedInMonth = 1;
                
                // Trung bình bài viết của TẤT CẢ domain đã tồn tại trong tháng m
                monthlyAvg[m-1] = Math.round(monthlyTotals[m-1] / domainsExistedInMonth);
            }
            
            const commonSparklineConfig = {
                chart: { type: 'area', height: 60, sparkline: { enabled: true }, animations: { enabled: false } },
                grid: { padding: { top: 15, bottom: 15, left: 5, right: 5 } },
                stroke: { curve: 'smooth', width: 2 },
                yaxis: { 
                    min: 0,
                    max: (max) => Math.max(2, Math.ceil(max * 1.5)) 
                },
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.0, stops: [0, 100] } },
                tooltip: { fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: function () { return '' } } }, marker: { show: false } }
            };

            this.sparkline1 = {
                ...commonSparklineConfig,
                series: [{ data: monthlyTotals }],
                colors: ['#3b82f6'] // Blue
            };

            this.sparkline2 = {
                ...commonSparklineConfig,
                series: [{ data: monthlyActiveDomains }], // Data thật: Domain hoạt động theo tháng
                colors: ['#ef4444'] // Red
            };

            this.sparkline3 = {
                ...commonSparklineConfig,
                series: [{ data: monthlyAvg }], // Data thật: Trung bình bài/domain theo tháng
                colors: ['#10b981'] // Green
            };

            // Build Domain Detailed Chart for evalMonth
            this.evalMonthToDisplay = evalMonth;
            let domainNames = [];
            let targetSeries = [];
            let actualSeries = [];
            
            let domainsToChart = this.allDomains.length > 0 ? this.allDomains : Array.from(activeDoms).map(d => ({ domain: d }));
            
            domainsToChart.forEach(d => {
                let domName = d.domain || d;
                domainNames.push(domName);
                
                let target = this.getTargetFor(domName, evalMonth);
                let actual = 0;
                
                if (domainStatsData[domName] && domainStatsData[domName][evalMonth]) {
                    actual = domainStatsData[domName][evalMonth];
                }
                
                targetSeries.push(target);
                actualSeries.push(actual);
            });
            
            this.domainChartOptions = {
                series: [
                    { name: 'Chỉ tiêu', type: 'line', data: targetSeries },
                    { name: 'Thực tế', type: 'line', data: actualSeries }
                ],
                chart: {
                    type: 'line',
                    height: 60,
                    sparkline: { enabled: true },
                    animations: { enabled: true }
                },
                colors: ['#94a3b8', '#10b981'],
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: [2, 2], dashArray: [4, 0] },
                xaxis: {
                    categories: domainNames,
                    labels: { show: false },
                    tooltip: { enabled: false }
                },
                yaxis: {
                    min: 0,
                    max: (max) => Math.max(5, Math.ceil(max * 1.3)),
                    labels: { show: false }
                },
                tooltip: { 
                    fixed: { enabled: true, position: 'topRight', offsetY: -20, offsetX: 0 }, 
                    x: { show: true }, 
                    marker: { show: false } 
                },
                legend: { show: false },
                grid: { padding: { top: 15, bottom: 15, left: 5, right: 5 } }
            };

        } else {
            this.totalArticles = 0;
            this.activeDomains = 0;
            this.avgArticles = 0;
            this.sparkline1 = null;
            this.sparkline2 = null;
            this.sparkline3 = null;
            this.domainChartOptions = null;
        }
    }

    onFilterChange() {
        this.updateChart();
    }

    onYearChange() {
        // Fetch new data for the selected year
        this.statistic();
    }
}
