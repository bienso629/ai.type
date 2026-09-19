import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation, TemplateRef, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { DomainService } from 'app/_services/domain';
import { CrawlService } from 'app/_services/crawl';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserClientService } from 'app/_services/user';
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
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SettingsDomainComponent implements OnInit, OnDestroy {
    @ViewChild('editDialogTemplate') editDialogTemplate: TemplateRef<any>;
    user: User;

    editing = {};
    rows = [];
    selected = [];
    domains: any[] = [];
    domainTargets: any = {};
    domainStatsData: any = {};
    domainStyles: any = {};
    currentMonthNum: number = new Date().getMonth() + 1;
    selectedMonthNum: number = new Date().getMonth() + 1;
    selectedYear: number = new Date().getFullYear();
    months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    years = [2024, 2025, 2026, 2027, 2028];

    showPassword: boolean = false;
    isAnalyzing: boolean = false;
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;
    styles: any[] = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    cleanDomain(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '');
    }

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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;

        if (isAutoSaveLocal && electron && electron.listLocalDomains) {
            const currentUname = this.user?.name || this.multiAccountService.getItem('username') || localStorage.getItem('username');
            electron.listLocalDomains({ username: currentUname }).then((res: any) => {
                if (res && res.success && res.data) {
                    this.rows = res.data;
                    let settings = this.multiAccountService.getItem('settings') || {};
                    this.domainTargets = settings.domainTargets || {};
                    this.domainStyles = settings.domainStyles || {};
                    
                    this.rows.forEach(r => {
                        r.monthlyTarget = this.getResolvedTarget(r.domain, this.selectedMonthNum);
                        r.writingStyle = this.domainStyles[r.domain] || '';
                    });
                    
                    this.rows = [...this.rows];
                    this.cd.markForCheck();
                } else {
                    this.rows = [];
                    this.cd.markForCheck();
                }
            }).catch(() => {
                this.rows = [];
                this.cd.markForCheck();
            });
            return;
        }

        if (isAutoSaveLocal) {
            this.rows = [];
            this.cd.markForCheck();
            return;
        }

        this.fetchServerDomains();
    }

    private fetchServerDomains() {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        if (isAutoSaveLocal) return;
        if (!this.user || !this.user.name) return;

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
                        this.domainStyles = settings.domainStyles || {};
                        
                        this.rows.forEach(r => {
                            r.monthlyTarget = this.getResolvedTarget(r.domain, this.selectedMonthNum);
                            r.writingStyle = this.domainStyles[r.domain] || '';
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
        const newRow = {
            "name": "",
            "domain": "",
            "username": "",
            "password": "",
            "monthlyTarget": 0,
            "ga4PropertyId": "",
            "note": "",
            "writingStyle": "",
            "addnew": true
        };
        this.openEditDialog(newRow, this.rows.length, true);
    }

    openEditDialog(row: any, rowIndex: number, isNew: boolean = false) {
        const data = { ...row };
        const dialogRef = this._dialog.open(this.editDialogTemplate, {
            width: '560px',
            panelClass: 'dlg-primary',
            data: data
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                const oldMonthlyTarget = row.monthlyTarget;
                const oldWritingStyle = row.writingStyle;
                
                if (isNew) {
                    this.rows.push(result);
                    this.add(this.rows.length - 1);
                } else {
                    Object.assign(this.rows[rowIndex], result);
                    this.rows = [...this.rows];
                    
                    if (result.monthlyTarget !== oldMonthlyTarget) {
                        this.saveTarget(result.domain, Number(result.monthlyTarget));
                    }
                    if (result.writingStyle !== oldWritingStyle) {
                        this.saveWritingStyle(result.domain, result.writingStyle);
                    }
                    
                    this.edit(rowIndex);
                }
                this.cd.markForCheck();
            }
        });
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
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const username = this.user?.name || 'admin';

        if (!isAutoSaveLocal && !this.user) return;

        this._crawlService.statistics({ username: username, reportYear: this.selectedYear })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((res: any) => {
                if (res && res.success) {
                    const nodes = res.data || [];
                    this.domainStatsData = nodes[3] || {};
                    this.cd.markForCheck();
                }
            });
    }

    normalizeDomain(domain: string): string {
        if (!domain) return '';
        let normalized = domain.trim().toLowerCase();
        if (normalized.includes('[object') || normalized.includes('object object')) return '';
        if (normalized.startsWith('http://')) normalized = normalized.substring(7);
        if (normalized.startsWith('https://')) normalized = normalized.substring(8);
        if (normalized.startsWith('www.')) normalized = normalized.substring(4);
        if (normalized.endsWith('/')) normalized = normalized.substring(0, normalized.length - 1);
        return normalized;
    }

    getDomainStat(domain: string, month: number): number {
        if (!this.domainStatsData || !domain) return 0;
        const norm = this.normalizeDomain(domain);
        if (this.domainStatsData[norm] && this.domainStatsData[norm][month]) {
            return this.domainStatsData[norm][month];
        }
        return 0;
    }

    updateValue(event, cell, rowIndex) {
        this.editing[rowIndex + '-' + cell] = false;
        this.rows[rowIndex][cell] = event.target.value;
        this.rows = [...this.rows];
        
        if (cell === 'monthlyTarget') {
            this.saveTarget(this.rows[rowIndex].domain, Number(event.target.value));
            this.edit(rowIndex);
        }
        if (cell === 'writingStyle') {
            this.saveWritingStyle(this.rows[rowIndex].domain, event.target.value);
            this.edit(rowIndex);
        }
        if (cell === 'note' || cell === 'ga4PropertyId') {
            this.edit(rowIndex);
        }
    }

    saveWritingStyle(domain: string, styleName: string) {
        let settings = this.multiAccountService.getItem('settings') || {};
        if (!settings.domainStyles) settings.domainStyles = {};
        
        settings.domainStyles[domain] = styleName;
        this.domainStyles[domain] = styleName;
        
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
        }).subscribe();
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
                        if (result.data && result.data._rev) {
                            this.rows[index]._rev = result.data._rev;
                        }
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

    private async fetchWebsiteMetadata(rawDomain: string): Promise<{ title: string; description: string; keywords: string; sampleText: string; isLive: boolean }> {
        const fallback = { title: '', description: '', keywords: '', sampleText: '', isLive: false };
        if (!rawDomain) return fallback;

        // Ưu tiên chạy qua Electron main process để tránh hoàn toàn lỗi CORS / SSL
        const electron = (window as any).electron;
        if (electron && electron.fetchDomainMetadata) {
            try {
                const meta = await electron.fetchDomainMetadata(rawDomain);
                if (meta && (meta.title || meta.description || meta.isLive)) {
                    return meta;
                }
            } catch (err) {
                console.warn(`Lỗi khi fetch qua electron.fetchDomainMetadata:`, err);
            }
        }

        let targetUrl = rawDomain.trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
            targetUrl = 'https://' + targetUrl;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const resp = await fetch(targetUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            clearTimeout(timeoutId);

            if (!resp.ok) {
                return fallback;
            }

            const html = await resp.text();
            if (!html) return fallback;

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const title = doc.querySelector('title')?.textContent?.trim() || 
                          doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';

            const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
                                doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
                                doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content')?.trim() || '';

            const keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content')?.trim() ||
                             doc.querySelector('meta[name="news_keywords"]')?.getAttribute('content')?.trim() || '';

            // Loại bỏ các thẻ script, style, noscript, svg, header/footer phụ
            doc.querySelectorAll('script, style, noscript, iframe, svg').forEach(el => el.remove());

            const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
                .map(h => h.textContent?.trim())
                .filter(t => !!t)
                .slice(0, 8)
                .join(' | ');

            let rawText = doc.body?.textContent || '';
            rawText = rawText.replace(/\s+/g, ' ').trim();
            const sampleText = (headings ? `Tiêu đề mục: ${headings}. ` : '') + rawText.substring(0, 1000);

            return {
                title,
                description,
                keywords,
                sampleText,
                isLive: true
            };
        } catch (e) {
            console.warn(`Không thể tự động tải nội dung từ ${targetUrl}:`, e);
            return fallback;
        }
    }

    async analyzeDomains() {
        if (this.selected.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất một tên miền để phân tích.');
            return;
        }
        
        const domainsList = this.selected.map(r => r.domain);
        this.toastr.info(`Đang thu thập nội dung trang chủ (Title, Description, Keywords) & phân tích cho: ${domainsList.join(', ')}...`, 'Đang xử lý');
        
        this.isAnalyzing = true;
        this.cd.markForCheck();
        
        try {
            // 1. Quét nội dung metadata thực tế của từng tên miền
            const crawledData: any[] = [];
            for (const d of domainsList) {
                const meta = await this.fetchWebsiteMetadata(d);
                crawledData.push({
                    domain: d,
                    ...meta
                });
            }

            // 2. Tạo prompt kèm dữ liệu thực tế đã bóc tách
            const domainsContext = crawledData.map(item => {
                let info = `Tên miền: ${item.domain}\n`;
                if (item.isLive) {
                    if (item.title) info += `- Tiêu đề website (Title): ${item.title}\n`;
                    if (item.description) info += `- Thẻ mô tả (Meta Description): ${item.description}\n`;
                    if (item.keywords) info += `- Từ khóa (Meta Keywords): ${item.keywords}\n`;
                    if (item.sampleText) info += `- Trích đoạn nội dung chính: ${item.sampleText}\n`;
                } else {
                    info += `- Ghi chú: Không truy cập được trực tiếp nội dung web, hãy phân tích dựa trên tên miền và đặc trưng ngành nghề.\n`;
                }
                return info;
            }).join('\n---\n');

            const prompt = `Bạn là chuyên gia phân tích website, nội dung số và SEO. Hãy phân tích ngắn gọn, chính xác (từ 1 đến 2 câu súc tích) về chủ đề hoạt động, đối tượng phục vụ, sản phẩm/dịch vụ cốt lõi và định hướng nội dung của từng tên miền dưới đây.

BẮT BUỘC: Bạn phải căn cứ sát vào dữ liệu Tiêu đề (Title), Thẻ mô tả (Description), Từ khóa (Keywords) và Trích đoạn nội dung trang web đã thu thập được để phân tích thật chính xác, không suy đoán vô căn cứ.

Dữ liệu thu thập:
${domainsContext}

Trả về ĐÚNG định dạng JSON mảng các object:
[
  {"domain": "tên miền", "analysis": "nội dung phân tích súc tích"}
]`;
            
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
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
                    }).subscribe((res: any) => {
                        if (res && res.success && res.data && res.data._rev) {
                            this.rows[rowIndex]._rev = res.data._rev;
                        }
                    });
                    
                    updatedCount++;
                }
            }
            
            this.rows = [...this.rows];
            this.toastr.success(`Đã phân tích dựa trên nội dung thực tế và lưu thành công ${updatedCount} tên miền!`);
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
        // Lấy danh sách styles từ cache cục bộ
        this.styles = this.multiAccountService.getItem('styles') || [];

        // Lấy dữ liệu ngay lập tức không phụ thuộc vào luồng user$ từ server
        this.fetch();
        this.fetchStats();

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                if (user) {
                    this.user = user;
                    this.styles = this.multiAccountService.getItem('styles') || [];
                    this.fetch();
                    this.fetchStats();
                }
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
