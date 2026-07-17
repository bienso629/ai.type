import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { DomainService } from 'app/modules/_services/domain';
import { CrawlService } from 'app/modules/_services/crawl';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { UserClientService } from 'app/modules/_services/user';
import { GenaiService } from 'app/genai.service';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

@Component({
    selector: 'settings-domain',
    templateUrl: './domain.component.html',
    styleUrls: ['./domain.component.scss'],
    providers: [DomainService, CrawlService, UserClientService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsDomainComponent implements OnInit, OnDestroy {
    user: User;

    editing = {};
    rows = [];
    selected = [];
    domains: any[] = [];
    domainTargets: any = {};
    domainStatsData: any = {};
    currentMonthNum: number = new Date().getMonth() + 1;
    selectedMonthNum: number = new Date().getMonth() + 1;
    selectedYear: number = new Date().getFullYear();
    months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    years = [2024, 2025, 2026, 2027, 2028];

    showPassword: boolean = false;
    isAnalyzing: boolean = false;
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    // Trộn ký tự mật khẩu
    maskPassword(password: string): string {
        if (!password) return '';
        const chars = '*#@!$&?';
        let seed = 0;
        for (let i = 0; i < password.length; i++) {
            seed += password.charCodeAt(i);
        }
        
        // Độ dài ngẫu nhiên từ 10 đến 25 ký tự để che giấu độ dài thực
        const length = (seed % 16) + 10;
        let masked = '';
        for (let i = 0; i < length; i++) {
            const randIndex = (seed + i * 13) % chars.length;
            masked += chars[randIndex];
        }
        return masked;
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    getResolvedTarget(domain: string, month: number): number {
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

    fetch() {
        this._domainService.fetch({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.rows = result.data;
                        
                        let settings = this.multiAccountService.getItem('settings') || {};
                        this.domainTargets = settings.domainTargets || {};
                        
                        this.rows.forEach(r => {
                            r.monthlyTarget = this.getResolvedTarget(r.domain, this.selectedMonthNum);
                        });
                        
                        this.rows = [...this.rows];

                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    getRowHeight(row: any) {
        if (!row) {
            return 50;
        }

        if (row.height === undefined) {
            return 50;
        }
        return row.height;
    }

    addNewForm() {
        this.rows.push({
            "name": "",
            "domain": "",
            "username": "",
            "password": "",
            "monthlyTarget": 0,
            "addnew": true
        });

        this.rows = [...this.rows];

        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    onMonthChange() {
        this.rows.forEach(r => {
            r.monthlyTarget = this.getResolvedTarget(r.domain, this.selectedMonthNum);
        });
        this.rows = [...this.rows];
    }
    
    onYearChange() {
        this.onMonthChange();
        this.fetchStats();
    }
    
    fetchStats() {
        if (!this.user) return;
        this._crawlService.statistics({ username: this.user.name, reportYear: this.selectedYear })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((res: any) => {
                if (res && res.success) {
                    const nodes = res.data || [];
                    this.domainStatsData = nodes[3] || {};
                    this.cd.markForCheck();
                }
            });
    }

    updateValue(event, cell, rowIndex) {
        this.editing[rowIndex + '-' + cell] = false;
        this.rows[rowIndex][cell] = event.target.value;
        this.rows = [...this.rows];
        
        if (cell === 'monthlyTarget') {
            this.saveTarget(this.rows[rowIndex].domain, Number(event.target.value));
        }
    }

    saveTarget(domain: string, target: number) {
        let settings = this.multiAccountService.getItem('settings') || {};
        if (!settings.domainTargets) settings.domainTargets = {};
        if (!settings.domainTargets[domain] || typeof settings.domainTargets[domain] === 'number') {
             settings.domainTargets[domain] = {};
        }
        
        let y = this.selectedYear;
        if (!settings.domainTargets[domain][y]) {
            settings.domainTargets[domain][y] = {};
        }
        
        settings.domainTargets[domain][y][this.selectedMonthNum] = target;
        this.domainTargets[domain] = settings.domainTargets[domain];
        
        this.multiAccountService.setItem('settings', settings);
        let editor = this.multiAccountService.getItem('editor');
        let following_users = this.multiAccountService.getItem('following_users');

        this._userClientService.updateProfile({
            profile: {
                settings: settings,
                active_info: this.multiAccountService.getItem('active_info'),
                editor: (editor && editor != 'undefined') ? editor : {},
                following_users: (following_users && following_users != 'undefined') ? following_users : [],
            },
            username: this.user.name
        })
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe();
    }

    add(index: number) {
        this._domainService.add({
            username: this.user.name,
            domain: this.rows[index]
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Lưu domain mới của bạn xong.`);
                        this.rows[index].addnew = false;
                    }
                },
                error: () => {
                    this.toastr.error(`Lưu domain mới của bạn lỗi.`);
                },
                complete: () => {
                }
            });
    }

    edit(index: number) {
        this._domainService.edit({
            username: this.user.name,
            domain: this.rows[index]
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Chỉnh sửa domain xong.`);
                    }
                },
                error: () => {
                    this.toastr.error(`Chỉnh sửa domain lỗi.`);
                },
                complete: () => {
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _domainService: DomainService,
        private _crawlService: CrawlService,
        private _userClientService: UserClientService,
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService,
        private _genaiService: GenaiService,
        private _dialog: MatDialog,
        private _router: Router,
        private cd: ChangeDetectorRef) {
        this.titleService.setTitle(`quản lý tên miền | ai.type - công cụ tạo content`);
    }

    async analyzeDomains() {
        if (this.selected.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất một tên miền để phân tích.');
            return;
        }
        
        const domains = this.selected.map(r => r.domain).join(', ');
        this.toastr.info(`Đang phân tích nội dung & chức năng cho: ${domains}...`, 'Đang xử lý');
        
        this.isAnalyzing = true;
        this.cd.markForCheck();
        
        try {
            const prompt = `Phân tích ngắn gọn (tối đa 2 câu) về chủ đề, nội dung và chức năng của các tên miền sau dựa vào tên miền (không cần lướt web nếu không thể). Trả về ĐÚNG định dạng JSON mảng các object: [{"domain": "tên miền", "analysis": "nội dung phân tích"}]. Danh sách tên miền: ${domains}`;
            
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            
            let resultText = response.text || '';
            
            // Lọc chuỗi JSON nếu bị bọc trong markdown
            if (resultText.includes('```json')) {
                resultText = resultText.split('```json')[1].split('```')[0].trim();
            } else if (resultText.includes('```')) {
                resultText = resultText.split('```')[1].split('```')[0].trim();
            }
            
            const aiResults = JSON.parse(resultText);
            
            let updatedCount = 0;
            for (let aiData of aiResults) {
                const rowIndex = this.rows.findIndex(r => r.domain === aiData.domain);
                if (rowIndex !== -1) {
                    this.rows[rowIndex].note = aiData.analysis; // Ghi vào trường note
                    
                    // Gọi API lưu vào Database
                    this._domainService.edit({
                        username: this.user.name,
                        domain: this.rows[rowIndex]
                    }).subscribe();
                    
                    updatedCount++;
                }
            }
            
            this.rows = [...this.rows];
            this.toastr.success(`Đã phân tích và lưu thành công ${updatedCount} tên miền!`);
        } catch (error) {
            console.error('Lỗi khi phân tích:', error);
            this.toastr.error('Có lỗi xảy ra trong quá trình phân tích bằng AI.');
        } finally {
            this.isAnalyzing = false;
            this.cd.markForCheck();
        }
    }

    planDomains() {
        if (this.selected.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất một tên miền để lên kế hoạch.');
            return;
        }
        
        // Navigate to amxh screen and pass domains via state
        this._router.navigate(['/amxh'], {
            state: {
                panel: 'schedule',
                domains: this.selected,
                statsData: this.domainStatsData,
                month: this.selectedMonthNum,
                forceGenerate: true
            }
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                this.user = user;

                // lấy danh sách domains
                this.fetch();
                
                // lấy số lượng bài viết để hiển thị thực tế
                this.fetchStats();
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
