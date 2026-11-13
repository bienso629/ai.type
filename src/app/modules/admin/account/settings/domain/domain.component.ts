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

import { UserSettingsService, getSettings, updateUserSettingsCache, isAutoSaveLocalEnabled } from 'app/_services/user-settings.service';

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

    private _lastFetchedUsername: string = '';
    private _lastAutoSaveLocal: boolean | null = null;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getCurrentUsername(): string {
        if (this.user?.name) {
            return this.user.name;
        }
        const sessionUser: any = this.multiAccountService.getItem('user') || this.multiAccountService.getItem('profile');
        if (sessionUser?.name || sessionUser?.username) {
            return sessionUser.name || sessionUser.username;
        }
        let lsUser: string | null = null;
        try {
            lsUser = localStorage.getItem('username');
        } catch (e) {}
        return this.multiAccountService.getItem('username')
            || lsUser
            || this.multiAccountService.currentAccountId
            || 'admin';
    }

    hasStyleOption(styleName: string): boolean {
        if (!styleName || !Array.isArray(this.styles)) return false;
        return this.styles.some(s => s && s.name === styleName);
    }

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

    private findDomainSettingKey(mapObj: any, domain: string): string | undefined {
        if (!mapObj || typeof mapObj !== 'object' || !domain) return undefined;
        if (Object.prototype.hasOwnProperty.call(mapObj, domain)) {
            return domain;
        }
        const normTarget = this.normalizeDomain(domain);
        if (!normTarget) return undefined;
        return Object.keys(mapObj).find(k => this.normalizeDomain(k) === normTarget);
    }

    private resolveTargetFromTree(target: any, year: number, month: number): number | undefined {
        if (target === undefined || target === null) return undefined;
        if (typeof target === 'number') return target;
        if (typeof target !== 'object') return undefined;

        const yearTarget = target[year];
        const legacyTarget = target[month];

        if (yearTarget && yearTarget[month] !== undefined && yearTarget[month] !== null) {
            return Number(yearTarget[month]) || 0;
        }
        if (legacyTarget !== undefined && legacyTarget !== null && typeof legacyTarget === 'number') {
            return legacyTarget;
        }

        if (yearTarget && typeof yearTarget === 'object') {
            for (let m = month - 1; m >= 1; m--) {
                if (yearTarget[m] !== undefined && yearTarget[m] !== null) {
                    return Number(yearTarget[m]) || 0;
                }
            }
        }

        for (let m = month - 1; m >= 1; m--) {
            if (typeof target[m] === 'number') {
                return target[m];
            }
        }

        return undefined;
    }

    getResolvedTarget(domain: string, month: number, row?: any): number {
        const settingKey = this.findDomainSettingKey(this.domainTargets, domain);
        if (settingKey !== undefined) {
            const resolvedFromSettings = this.resolveTargetFromTree(this.domainTargets[settingKey], this.selectedYear, month);
            if (resolvedFromSettings !== undefined) {
                return resolvedFromSettings;
            }
        }

        if (row && row.monthlyTargets && typeof row.monthlyTargets === 'object') {
            const resolvedFromRowTree = this.resolveTargetFromTree(row.monthlyTargets, this.selectedYear, month);
            if (resolvedFromRowTree !== undefined) {
                return resolvedFromRowTree;
            }
        }

        if (row) {
            if (row._dbMonthlyTarget !== undefined) {
                return Number(row._dbMonthlyTarget) || 0;
            }
            if (row.monthlyTarget !== undefined) {
                return Number(row.monthlyTarget) || 0;
            }
        }

        return 0;
    }

    getResolvedWritingStyle(domain: string, row?: any): string {
        const styleKey = this.findDomainSettingKey(this.domainStyles, domain);
        if (styleKey !== undefined) {
            return this.domainStyles[styleKey] ?? '';
        }
        if (row) {
            if (row._dbWritingStyle !== undefined) {
                return row._dbWritingStyle || '';
            }
            if (row.writingStyle !== undefined) {
                return row.writingStyle || '';
            }
        }
        return '';
    }

    private applySettingsToRows(): void {
        const settings = getSettings() || {};
        this.domainTargets = settings.domainTargets || {};
        this.domainStyles = settings.domainStyles || {};

        if (!Array.isArray(this.rows) || this.rows.length === 0) {
            this.cd.markForCheck();
            return;
        }

        this.rows.forEach(r => {
            if (!r) return;
            if (r._dbMonthlyTarget === undefined) {
                r._dbMonthlyTarget = Number(r.monthlyTarget) || 0;
            }
            if (r._dbWritingStyle === undefined) {
                r._dbWritingStyle = r.writingStyle || '';
            }
            r.monthlyTarget = this.getResolvedTarget(r.domain, this.selectedMonthNum, r);
            r.writingStyle = this.getResolvedWritingStyle(r.domain, r);
        });

        this.rows = [...this.rows];
        this.cd.markForCheck();
    }

    fetch() {
        const currentUname = this.getCurrentUsername();
        if (!currentUname) return;

        this._lastFetchedUsername = currentUname;
        this._lastAutoSaveLocal = isAutoSaveLocalEnabled();

        this._domainService.fetch({
            username: currentUname,
            accountUsername: currentUname
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (result && result.success && Array.isArray(result.data)) {
                        this.rows = result.data.map((r: any) => ({
                            ...r,
                            _dbMonthlyTarget: Number(r.monthlyTarget) || 0,
                            _dbWritingStyle: r.writingStyle || ''
                        }));
                        this.applySettingsToRows();
                    } else {
                        this.rows = [];
                        this.cd.markForCheck();
                    }
                },
                error: () => {
                    this.rows = [];
                    this.cd.markForCheck();
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
            "serverIp": "",
            "serverUsername": "",
            "serverPassword": "",
            "note": "",
            "writingStyle": "",
            "addnew": true
        };
        this.openEditDialog(newRow, this.rows.length, true);
    }

    openEditDialog(row: any, rowIndex: number, isNew: boolean = false) {
        const oldDomain = (row?.domain || '').trim();
        const oldMonthlyTarget = Number(row?.monthlyTarget) || 0;
        const oldWritingStyle = row?.writingStyle || '';
        const data = { ...row };
        const dialogRef = this._dialog.open(this.editDialogTemplate, {
            width: '560px',
            panelClass: 'dlg-primary',
            data: data
        });

        dialogRef.afterClosed().subscribe(result => {
            if (!result) return;
            const cleanDom = (result.domain || '').trim();
            if (!cleanDom) {
                this.toastr.warning('Vui lòng nhập tên miền.');
                return;
            }

            const cleanedResult: any = {
                ...result,
                domain: cleanDom,
                name: (result.name || '').trim() || cleanDom,
                username: (result.username || '').trim(),
                password: result.password || '',
                monthlyTarget: Number(result.monthlyTarget) || 0,
                writingStyle: result.writingStyle || '',
                ga4PropertyId: (result.ga4PropertyId || '').trim(),
                serverIp: (result.serverIp || '').trim(),
                serverUsername: (result.serverUsername || '').trim(),
                serverPassword: result.serverPassword || '',
                note: result.note || ''
            };
            delete cleanedResult._showPassword;
            delete cleanedResult._showServerPassword;

            if (!cleanedResult.monthlyTargets || typeof cleanedResult.monthlyTargets !== 'object') {
                cleanedResult.monthlyTargets = {};
            } else {
                cleanedResult.monthlyTargets = { ...cleanedResult.monthlyTargets };
            }
            cleanedResult.monthlyTargets[this.selectedYear] = {
                ...(cleanedResult.monthlyTargets[this.selectedYear] || {}),
                [this.selectedMonthNum]: cleanedResult.monthlyTarget
            };
            cleanedResult._dbMonthlyTarget = cleanedResult.monthlyTarget;
            cleanedResult._dbWritingStyle = cleanedResult.writingStyle;

            const domainChanged = !isNew && !!oldDomain && oldDomain !== cleanDom;
            const targetChanged = isNew || domainChanged || cleanedResult.monthlyTarget !== oldMonthlyTarget;
            const styleChanged = isNew || domainChanged || cleanedResult.writingStyle !== oldWritingStyle;

            if (targetChanged || styleChanged) {
                this.saveDomainSettingsToProfile({
                    domain: cleanDom,
                    oldDomain: domainChanged ? oldDomain : undefined,
                    monthlyTarget: cleanedResult.monthlyTarget,
                    updateTarget: targetChanged,
                    writingStyle: cleanedResult.writingStyle,
                    updateStyle: styleChanged
                });
            }

            if (isNew) {
                this.rows.push(cleanedResult);
                this.rows = [...this.rows];
                this.add(this.rows.length - 1);
            } else {
                Object.assign(this.rows[rowIndex], cleanedResult);
                this.rows = [...this.rows];
                this.edit(rowIndex, domainChanged ? oldDomain : undefined);
            }
            this.cd.markForCheck();
        });
    }

    onMonthChange() {
        this.rows.forEach(r => {
            r.monthlyTarget = this.getResolvedTarget(r.domain, this.selectedMonthNum, r);
        });
        this.rows = [...this.rows];
        this.cd.markForCheck();
    }
    
    onYearChange() {
        this.onMonthChange();
        this.fetchStats();
    }
    
    fetchStats() {
        const username = this.getCurrentUsername();

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
        const rawVal = event.target.value;
        this.rows[rowIndex][cell] = cell === 'monthlyTarget' ? (Number(rawVal) || 0) : rawVal;
        this.rows = [...this.rows];
        
        if (cell === 'monthlyTarget') {
            const numTarget = Number(rawVal) || 0;
            this.rows[rowIndex]._dbMonthlyTarget = numTarget;
            if (!this.rows[rowIndex].monthlyTargets || typeof this.rows[rowIndex].monthlyTargets !== 'object') {
                this.rows[rowIndex].monthlyTargets = {};
            }
            this.rows[rowIndex].monthlyTargets[this.selectedYear] = {
                ...(this.rows[rowIndex].monthlyTargets[this.selectedYear] || {}),
                [this.selectedMonthNum]: numTarget
            };
            this.saveTarget(this.rows[rowIndex].domain, numTarget);
            this.edit(rowIndex);
        }
        if (cell === 'writingStyle') {
            this.rows[rowIndex]._dbWritingStyle = rawVal || '';
            this.saveWritingStyle(this.rows[rowIndex].domain, rawVal || '');
            this.edit(rowIndex);
        }
        if (cell === 'note' || cell === 'ga4PropertyId') {
            this.edit(rowIndex);
        }
    }

    private saveDomainSettingsToProfile(opts: {
        domain: string;
        oldDomain?: string;
        monthlyTarget?: number;
        updateTarget?: boolean;
        writingStyle?: string;
        updateStyle?: boolean;
    }): void {
        const currentSettings = getSettings() || {};
        const settings: any = {
            ...currentSettings,
            domainTargets: { ...(currentSettings.domainTargets || {}) },
            domainStyles: { ...(currentSettings.domainStyles || {}) }
        };

        if (opts.oldDomain && opts.oldDomain !== opts.domain) {
            if (settings.domainTargets[opts.oldDomain] !== undefined && settings.domainTargets[opts.domain] === undefined) {
                settings.domainTargets[opts.domain] = settings.domainTargets[opts.oldDomain];
            }
            delete settings.domainTargets[opts.oldDomain];

            if (settings.domainStyles[opts.oldDomain] !== undefined && settings.domainStyles[opts.domain] === undefined) {
                settings.domainStyles[opts.domain] = settings.domainStyles[opts.oldDomain];
            }
            delete settings.domainStyles[opts.oldDomain];
        }

        if (opts.updateTarget) {
            const existingKey = this.findDomainSettingKey(settings.domainTargets, opts.domain) || opts.domain;
            const prevNode = settings.domainTargets[existingKey];
            const domainNode: any = (prevNode && typeof prevNode === 'object') ? { ...prevNode } : {};
            const y = this.selectedYear;
            domainNode[y] = {
                ...(domainNode[y] && typeof domainNode[y] === 'object' ? domainNode[y] : {}),
                [this.selectedMonthNum]: Number(opts.monthlyTarget) || 0
            };
            if (existingKey !== opts.domain) {
                delete settings.domainTargets[existingKey];
            }
            settings.domainTargets[opts.domain] = domainNode;
        }

        if (opts.updateStyle) {
            const existingStyleKey = this.findDomainSettingKey(settings.domainStyles, opts.domain);
            if (existingStyleKey && existingStyleKey !== opts.domain) {
                delete settings.domainStyles[existingStyleKey];
            }
            settings.domainStyles[opts.domain] = opts.writingStyle || '';
        }

        this.domainTargets = settings.domainTargets;
        this.domainStyles = settings.domainStyles;

        updateUserSettingsCache(settings);
        const editor = this.multiAccountService.getItem('editor');
        const following_users = this.multiAccountService.getItem('following_users');
        const currentUname = this.getCurrentUsername();

        this._userClientService.updateProfile({
            profile: {
                settings: settings,
                active_info: this.multiAccountService.getItem('active_info'),
                editor: (editor && editor != 'undefined') ? editor : {},
                following_users: (following_users && following_users != 'undefined') ? following_users : [],
            },
            username: currentUname
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe();
    }

    saveWritingStyle(domain: string, styleName: string) {
        this.saveDomainSettingsToProfile({
            domain,
            writingStyle: styleName,
            updateStyle: true
        });
    }

    saveTarget(domain: string, target: number) {
        this.saveDomainSettingsToProfile({
            domain,
            monthlyTarget: target,
            updateTarget: true
        });
    }

    add(index: number) {
        const currentUname = this.getCurrentUsername();
        this._domainService.add({
            username: currentUname,
            accountUsername: currentUname,
            domain: this.rows[index]
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Lưu domain mới của bạn xong.`);
                        if (this.rows[index]) {
                            this.rows[index].addnew = false;
                            const newId = result.data?._id || result.data?.id || result._id || result.id;
                            const newRev = result.data?._rev || result.data?.rev || result._rev || result.rev;
                            if (newId) this.rows[index]._id = newId;
                            if (newRev) this.rows[index]._rev = newRev;
                            this.rows = [...this.rows];
                            this.cd.markForCheck();
                        }
                    } else {
                        this.toastr.error(result?.error || result?.message || `Lưu domain mới của bạn lỗi.`);
                    }
                },
                error: () => {
                    this.toastr.error(`Lưu domain mới của bạn lỗi.`);
                }
            });
    }

    edit(index: number, oldDomain?: string) {
        const currentUname = this.getCurrentUsername();
        this._domainService.edit({
            username: currentUname,
            accountUsername: currentUname,
            oldDomain: oldDomain,
            domain: this.rows[index]
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Chỉnh sửa domain xong.`);
                        if (this.rows[index]) {
                            const updatedId = result.data?._id || result.data?.id || result._id || result.id;
                            const updatedRev = result.data?._rev || result.data?.rev || result._rev || result.rev;
                            if (updatedId) this.rows[index]._id = updatedId;
                            if (updatedRev) this.rows[index]._rev = updatedRev;
                            this.cd.markForCheck();
                        }
                    } else {
                        this.toastr.error(result?.error || result?.message || `Chỉnh sửa domain lỗi.`);
                    }
                },
                error: () => {
                    this.toastr.error(`Chỉnh sửa domain lỗi.`);
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
        private _userSettingsService: UserSettingsService,
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
                model: 'gemini-3.8-flash',
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
                    const currentUname = this.getCurrentUsername();
                    this._domainService.edit({
                        username: currentUname,
                        accountUsername: currentUname,
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
        this.styles = this.multiAccountService.getItem('styles') || [];

        const initialSettings = getSettings() || {};
        this.domainTargets = initialSettings.domainTargets || {};
        this.domainStyles = initialSettings.domainStyles || {};

        this.fetch();
        this.fetchStats();

        const initialUname = this.getCurrentUsername();
        if (initialUname && (!initialSettings || Object.keys(initialSettings).length === 0)) {
            this._userSettingsService.load(initialUname);
        }

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                if (user) {
                    const prevUname = this._lastFetchedUsername;
                    this.user = user;
                    this.styles = this.multiAccountService.getItem('styles') || this.styles || [];
                    const currentSettings = getSettings() || {};
                    if (user.name && (!currentSettings || Object.keys(currentSettings).length === 0)) {
                        this._userSettingsService.load(user.name);
                    }
                    if (user.name && user.name !== prevUname) {
                        this.fetch();
                        this.fetchStats();
                    }
                    this.cd.markForCheck();
                }
            });

        this._userSettingsService.settings$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((settings: any) => {
                const currentAutoSave = isAutoSaveLocalEnabled();
                if (this._lastAutoSaveLocal !== null && currentAutoSave !== this._lastAutoSaveLocal) {
                    this.fetch();
                    return;
                }
                if (settings && typeof settings === 'object') {
                    this.applySettingsToRows();
                }
            });

        this.multiAccountService.activeAccount$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((account: any) => {
                if (account) {
                    if (Array.isArray(account.styles) && account.styles.length > 0) {
                        this.styles = account.styles;
                    }
                    const accountUserObj = account.user || account.profile;
                    const accountUname = accountUserObj?.name || accountUserObj?.username;
                    if (accountUname && this._lastFetchedUsername && accountUname !== this._lastFetchedUsername) {
                        this.fetch();
                        this.fetchStats();
                    }
                    this.cd.markForCheck();
                }
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
