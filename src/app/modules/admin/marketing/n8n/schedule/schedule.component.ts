import { ChangeDetectorRef, Component, ElementRef, HostListener, Injectable, NgZone, OnDestroy, OnInit, TemplateRef, ViewChild, ViewEncapsulation, AfterViewInit, AfterViewChecked, ChangeDetectionStrategy, Input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { DomainService } from 'app/_services/domain';
import { TasksService } from 'app/_services/tasks';
import { User } from 'app/core/user/user.types';
import {
    catchError,
    map,
    Observable,
    of,
    shareReplay,
    Subject,
    Subscription,
    switchMap,
    take,
    takeUntil,
    timer,
    interval,
    startWith,
    forkJoin,
    firstValueFrom
} from 'rxjs';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';
import { BlogService } from 'app/_services/blog';
import { ToastrService } from 'ngx-toastr';
import {
    DayScaleGenerator,
    StrategyManager,
    TimelineComponent,
    TimelineViewMode,
} from "angular-calendar-timeline";
import type {
    ITimelineItem,
    IItemTimeChangedEvent,
} from "angular-calendar-timeline";
import localeVi from "@angular/common/locales/vi";
import { registerLocaleData } from '@angular/common';
import { MXHAutoService } from 'app/_services/mxhauto';
import { MatSelectionList } from "@angular/material/list";
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { ColumnMode, SelectionType, DatatableComponent } from '@swimlane/ngx-datatable';
import { GenaiService } from 'app/genai.service';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';

import { N8nService } from 'app/_services/n8n.service'; // Bạn kiểm tra lại đường dẫn này nhé
import { MultiAccountService } from 'app/_services/multi-account.service';
import { CrawlService } from 'app/_services/crawl';
import { GlobalAgentService } from 'app/_services/global-agent.service';
import { HelperService } from 'app/helper.service';
import { ForumService } from 'app/_services/forum';
import * as uuid from 'uuid';
registerLocaleData(localeVi);

export interface ICustomTimelineItem extends ITimelineItem {
    domainData?: any;
    autoWrite?: boolean;
    isTotalRow?: boolean;
    persona?: {
        role: string;
        style: string;
        gender: string;
        age: string;
        alias?: string;
    };
}

interface CommentGroup {
    key: string;
    expanded: boolean;
    items: any[];
}

import { getSettings, isAutoSaveLocalEnabled } from 'app/_services/user-settings.service';

@Injectable()
export class ScheduleMonthRangeState {
    startDate: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0);
    endDate: Date = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);
}

@Injectable()
export class SingleMonthDayScaleGenerator extends DayScaleGenerator {
    constructor(private rangeState: ScheduleMonthRangeState) {
        super();
    }

    override getStartDate(): Date {
        return new Date(this.rangeState.startDate);
    }

    override getEndDate(): Date {
        return new Date(this.rangeState.endDate);
    }
}

@Component({
    selector: 'amxh-schedule',
    templateUrl: './schedule.component.html',
    styleUrls: ['./schedule.component.scss'],
    providers: [
        BlogService,
        ScheduleMonthRangeState,
        { provide: DayScaleGenerator, useClass: SingleMonthDayScaleGenerator },
        StrategyManager
    ],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class AMXHScheduleComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked {
    config: AppConfig;
    user: User;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    // ai: any;
    public chatHistory: any[] = [];
    public chatPrompt: string = '';
    public isChatting: boolean = false;
    @ViewChild('chatScroll') chatScroll!: ElementRef;

    private hls?: Hls;
    private videoEl?: HTMLVideoElement;

    profiles: any[] = [];
    profile: any = {};
    totalProfiles: number = 0;

    minZoomIndex: number;
    maxZoomIndex: number;
    currentZoomIndex: number;

    isLoadingSchedule: boolean = true;
    isLoadingMonth: boolean = false;
    /** Đã dựng hàng tên miền của tháng đang xem (từ bộ nhớ đệm hoặc danh sách tên miền) trước khi công việc tải xong. */
    private hasRenderedMonthRows: boolean = false;
    /** Bộ nhớ đệm dữ liệu từng tháng (tồn tại suốt phiên làm việc) để mở lại màn hình hiển thị tức thì. */
    private static _monthViewCache = new Map<string, any[]>();
    private monthTasksSub?: Subscription;
    private monthLoadRequestId: number = 0;
    items: ICustomTimelineItem[] = [];
    
    timelineStartDate: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0);
    timelineEndDate: Date = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

    get isViewingCurrentMonth(): boolean {
        const now = new Date();
        const activeMonth = this.month || (now.getMonth() + 1);
        const activeYear = this.year || now.getFullYear();
        return activeMonth === (now.getMonth() + 1) && activeYear === now.getFullYear();
    }

    updateTimelineMonthRange(month?: number, year?: number) {
        const now = new Date();
        const targetYear = (year && year >= 2000 && year <= 2100) ? year : (this.year || now.getFullYear());
        const targetMonth = (month && month >= 1 && month <= 12) ? month : (this.month || (now.getMonth() + 1));

        this.month = targetMonth;
        this.year = targetYear;
        this.timelineStartDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
        this.timelineEndDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
        if (this.monthRangeState) {
            this.monthRangeState.startDate = new Date(this.timelineStartDate);
            this.monthRangeState.endDate = new Date(this.timelineEndDate);
        }
    }

    updateTimeline3MonthsRange(month?: number, year?: number) {
        this.updateTimelineMonthRange(month, year);
    }
    
    customZooms = [
        { columnWidth: 120, viewMode: TimelineViewMode.Day }, // Mức 0: Nhỏ nhất (5px mỗi giờ)
        { columnWidth: 240, viewMode: TimelineViewMode.Day }, // Mức 1: Vừa (10px mỗi giờ)
        { columnWidth: 720, viewMode: TimelineViewMode.Day }, // Mức 2: To nhất (30px mỗi giờ)
    ];
    disabledDates: Set<string> = new Set();
    disabledAutoWriteDomains: Set<string> = new Set();

    @ViewChild("timeline") timelineComponent: TimelineComponent;
    
    private _timelineElement!: ElementRef;
    @ViewChild("timeline", { read: ElementRef }) set timelineElement(el: ElementRef) {
        const prevNative = this._timelineElement?.nativeElement;
        this._timelineElement = el;
        if (el?.nativeElement && el.nativeElement !== prevNative) {
            this.zone.runOutsideAngular(() => {
                setTimeout(() => this.setupDragToScroll(), 0);
            });
        }
    }
    
    private isDraggingTimeline = false;
    private timelineStartX = 0;
    private timelineStartY = 0;
    private timelineScrollLeft = 0;
    private timelineScrollTop = 0;

    readonly REFRESH_MS = 30_000;
    countdown$!: Observable<number>;

    readonly MAX_CAPTIONS = 400;
    transcript = '';
    job?: { id: string; chunksDir: string; primaryUrl: string, unique_id: string, nickname: string, title: string, bio_description: string };
    segmentSec = 10;

    rooms: any[] = [];
    viewMode: 'grid' | 'list' = 'grid';

    turnOffLiveStream = false;

    @ViewChild('livestreamtiktok') livestreamtiktok: MatSelectionList;
    @ViewChild('sttVideo', { static: false }) sttVideo?: ElementRef<HTMLVideoElement>;

    // Variables cho bảng Captions chính
    @ViewChild('table') table: DatatableComponent;
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;
    captions: { index: number; text: string; selected?: boolean }[] = [];
    selected = [];

    style = "Một người đang tìm mua hàng mỹ phẩm & làm đẹp da";
    comments: any[] = [];

    private liveStop$ = new Subject<void>();
    listening$?: Observable<boolean>;
    errorMessage$?: Observable<string>;

    private ipcRenderer: any;
    @Input('data') data: any;

    @ViewChild('captionsBox', { static: false }) captionsBox!: ElementRef<HTMLDivElement>;

    private sttCaptionUnsub?: () => void;
    private sttCaptionIndex = 0;
    private sttCaptionUnsubscribe?: () => void;

    interimTranscript: string = '';
    monthlyTotalCount: number = 0;
    selectedGroupDomainCount: number = 0;
    selectedGroupStartDate: Date | null = null;
    selectedGroupEndDate: Date | null = null;

    private syncDisabledDatesDebounceTimer: any = null;
    private syncDomainAutoWriteDebounceTimer: any = null;
    private saveAutoWriteContextTimer: any = null;
    private saveScriptContextTimer: any = null;
    private isSyncingDomainsAutoWrite: boolean = false;
    private pendingAutoWriteSyncDomains: Set<string> = new Set();
    private lastMasterCheckboxSig: string = '';
    private lastHeaderCheckboxesSig: string = '';
    private lastSavedChatSig: string = '';
    private lastSavedDisabledDatesSig: string = '';
    private boundTimelineElements: WeakSet<HTMLElement> = new WeakSet();
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // --- VARIABLES FOR DIALOG ---
    @ViewChild('commentDialog') commentDialog: TemplateRef<any>;
    @ViewChild('promptDialog') promptDialog: TemplateRef<any>;

    commentGroups: CommentGroup[] = [];
    isAllSelected: boolean = false;
    totalSelected: number = 0;
    customPromptInput: string = '';
    
    // --- VARIABLES FOR MENTIONS ---
    showMentions: boolean = false;
    mentionIndex: number = 0;
    ignoreNextEnter: boolean = false;
    mentionOptions = [
        { id: 'Lịch viết bài', icon: 'heroicons_outline:calendar', url: '/amxh', panel: 'schedule' },
        { id: 'Quản lý bài viết', icon: 'heroicons_outline:document-text', url: '/admin/marketing/clone-product' },
        { id: 'SEO Links', icon: 'heroicons_outline:link', url: '/admin/marketing/seo-links' }
    ];
    filteredMentionOptions: any[] = [];

    cleanDomain(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }

    normalizeDomainKey(domain: any): string {
        if (!domain) return '';
        return String(domain)
            .toLowerCase()
            .trim()
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/\/+$/, '');
    }

    isDomainAutoWriteEnabled(domainOrItem: any): boolean {
        if (!domainOrItem) return false;
        if (typeof domainOrItem === 'object' && domainOrItem.isTotalRow) {
            return false;
        }
        const raw =
            typeof domainOrItem === 'string'
                ? domainOrItem
                : domainOrItem?.domainData?.domain ||
                  domainOrItem?.domain ||
                  domainOrItem?.name ||
                  '';
        const key = this.normalizeDomainKey(raw);
        if (!key) return false;
        if (this.disabledAutoWriteDomains.has(key)) {
            return false;
        }
        if (typeof domainOrItem === 'object') {
            if (domainOrItem?.domainData?.autoWrite === false) return false;
            if (domainOrItem?.autoWrite === false) return false;
        }
        return true;
    }

    getSelectedAutoWriteDomainKeys(): Set<string> {
        const keys = new Set<string>();
        const realItems = Array.isArray(this.items)
            ? this.items.filter(
                  (it: any) =>
                      it &&
                      !it.isTotalRow &&
                      it.id !== 'total-summary-row' &&
                      it.id !== 'monthly-total-summary-row'
              )
            : [];
        const source =
            realItems.length > 0 ? realItems : this.allDomainsList || [];
        for (const item of source) {
            if (this.isDomainAutoWriteEnabled(item)) {
                const k = this.normalizeDomainKey(
                    item?.domainData?.domain || item?.domain || item?.name
                );
                if (k) keys.add(k);
            }
        }
        return keys;
    }

    private getFlatDomainTasks(d: any): any[] {
        if (!d) return [];
        const unpackedFromStream: any[] = [];
        const rawStream =
            Array.isArray(d?.streamItems) && d.streamItems.length > 0
                ? d.streamItems
                : Array.isArray(d?.childrenItems?.[0]?.streamItems)
                  ? d.childrenItems[0].streamItems
                  : [];
        for (const st of rawStream) {
            if (!st || st.isLoading) continue;
            if (st.isGroup && Array.isArray(st.tasks)) {
                for (const sub of st.tasks) {
                    if (sub && !sub.isLoading) unpackedFromStream.push(sub);
                }
            } else {
                unpackedFromStream.push(st);
            }
        }
        if (unpackedFromStream.length > 0) {
            return unpackedFromStream;
        }
        if (Array.isArray(d?.domainData?.plan) && d.domainData.plan.length > 0) {
            return d.domainData.plan.filter((t: any) => t && !t.isLoading);
        }
        if (Array.isArray(d?.plan) && d.plan.length > 0) {
            return d.plan.filter((t: any) => t && !t.isLoading);
        }
        return [];
    }

    getDomainTargetLabel(item: any): string {
        if (!item || item.isTotalRow) return '0 bài';
        const rawTarget = item.domainData?.monthlyTarget;
        const target =
            typeof rawTarget === 'number' && rawTarget > 0
                ? rawTarget
                : this.getResolvedTarget(
                      item.name,
                      undefined,
                      undefined,
                      item.domainData
                  );
        return `${target || 0} bài`;
    }

    private getAutoWriteStorageKey(): string {
        const accountId =
            this.user?.name ||
            this.multiAccountService?.currentAccountId ||
            'default';
        return `${this.STORAGE_KEY}_DISABLED_AUTO_WRITE_DOMAINS_${accountId}`;
    }

    private persistDisabledAutoWriteDomainsFast(): void {
        const arr = Array.from(this.disabledAutoWriteDomains);
        try {
            const json = JSON.stringify(arr);
            localStorage.setItem(this.getAutoWriteStorageKey(), json);
            localStorage.setItem(
                this.STORAGE_KEY + '_DISABLED_AUTO_WRITE_DOMAINS',
                json
            );
        } catch (e) {}

        if (this.saveAutoWriteContextTimer) {
            clearTimeout(this.saveAutoWriteContextTimer);
        }
        this.zone.runOutsideAngular(() => {
            this.saveAutoWriteContextTimer = setTimeout(() => {
                this.saveAutoWriteContextTimer = null;
                this.updateGlobalAgentScheduleContext();
            }, 600);
        });
    }

    setDomainAutoWriteByKey(rawKey: string, isChecked: boolean): void {
        const key = this.normalizeDomainKey(rawKey);
        if (!key) return;

        if (isChecked) {
            this.disabledAutoWriteDomains.delete(key);
        } else {
            this.disabledAutoWriteDomains.add(key);
        }

        if (Array.isArray(this.items)) {
            for (const item of this.items) {
                if (!item || item.isTotalRow) continue;
                const itemKey = this.normalizeDomainKey(
                    item?.domainData?.domain || item?.name
                );
                if (itemKey === key) {
                    item.autoWrite = isChecked;
                    if (!item.domainData) {
                        item.domainData = {
                            domain: item.name,
                            name: item.name,
                        };
                    }
                    item.domainData.autoWrite = isChecked;
                }
            }
        }

        if (Array.isArray(this.allDomainsList)) {
            for (const d of this.allDomainsList) {
                if (
                    d &&
                    this.normalizeDomainKey(d.domain || d.name) === key
                ) {
                    d.autoWrite = isChecked;
                }
            }
        }

        this.syncPanelDomainCheckboxesDOM(key);
        this.renderPanelMasterCheckbox(true);
        this.persistDisabledAutoWriteDomainsFast();
        this.queuePersistDomainsAutoWrite([key]);
    }

    onToggleDomainAutoWrite(event: Event, item: any): void {
        event.stopPropagation();
        if (!item || item.isTotalRow) return;
        const inputEl = event.target as HTMLInputElement;
        this.setDomainAutoWriteByKey(
            item?.domainData?.domain || item?.name,
            !!inputEl?.checked
        );
    }

    toggleAllDomainsAutoWrite(forceEnable?: boolean): void {
        const realItems = (this.items || []).filter(
            (it: any) =>
                it &&
                !it.isTotalRow &&
                it.id !== 'total-summary-row' &&
                it.id !== 'monthly-total-summary-row'
        );
        if (realItems.length === 0) return;

        const allCurrentlyEnabled = realItems.every((it: any) =>
            this.isDomainAutoWriteEnabled(it)
        );
        const shouldEnable =
            typeof forceEnable === 'boolean'
                ? forceEnable
                : !allCurrentlyEnabled;

        const changedKeys: string[] = [];
        for (const item of realItems) {
            const key = this.normalizeDomainKey(
                item?.domainData?.domain || item?.name
            );
            if (!key) continue;

            const prev = !this.disabledAutoWriteDomains.has(key);
            if (shouldEnable) {
                this.disabledAutoWriteDomains.delete(key);
            } else {
                this.disabledAutoWriteDomains.add(key);
            }

            item.autoWrite = shouldEnable;
            if (!item.domainData) {
                item.domainData = { domain: item.name, name: item.name };
            }
            item.domainData.autoWrite = shouldEnable;

            if (prev !== shouldEnable) {
                changedKeys.push(key);
            }
        }

        if (Array.isArray(this.allDomainsList)) {
            for (const d of this.allDomainsList) {
                if (d) {
                    const key = this.normalizeDomainKey(d.domain || d.name);
                    if (key) {
                        d.autoWrite = shouldEnable;
                    }
                }
            }
        }

        this.syncPanelDomainCheckboxesDOM();
        this.renderPanelMasterCheckbox(true);
        this.persistDisabledAutoWriteDomainsFast();

        if (changedKeys.length > 0) {
            this.queuePersistDomainsAutoWrite(changedKeys);
        }
    }

    private queuePersistDomainsAutoWrite(domainKeys: string[]): void {
        domainKeys.forEach((k) => {
            if (k) this.pendingAutoWriteSyncDomains.add(k);
        });

        if (this.syncDomainAutoWriteDebounceTimer) {
            clearTimeout(this.syncDomainAutoWriteDebounceTimer);
        }

        this.zone.runOutsideAngular(() => {
            this.syncDomainAutoWriteDebounceTimer = setTimeout(() => {
                this.syncDomainAutoWriteDebounceTimer = null;
                this.flushPendingDomainsAutoWrite();
            }, 400);
        });
    }

    private async flushPendingDomainsAutoWrite(): Promise<void> {
        if (this.isSyncingDomainsAutoWrite) {
            return;
        }
        if (
            this.pendingAutoWriteSyncDomains.size === 0 ||
            !this.items ||
            !this.items.length
        ) {
            return;
        }

        this.isSyncingDomainsAutoWrite = true;
        try {
            while (this.pendingAutoWriteSyncDomains.size > 0) {
                const keysBatch = Array.from(this.pendingAutoWriteSyncDomains);
                this.pendingAutoWriteSyncDomains.clear();

                const username = this.user?.name || 'admin';
                for (const key of keysBatch) {
                    const domainItem = this.items.find(
                        (d: any) =>
                            d &&
                            !d.isTotalRow &&
                            d.domainData &&
                            this.normalizeDomainKey(
                                d.domainData.domain || d.name
                            ) === key
                    );
                    if (!domainItem || !domainItem.domainData) continue;

                    const desiredAutoWrite =
                        !this.disabledAutoWriteDomains.has(key);
                    domainItem.domainData.autoWrite = desiredAutoWrite;

                    const slimDomainPayload: any = {
                        ...domainItem.domainData,
                        autoWrite: desiredAutoWrite,
                    };
                    delete slimDomainPayload.plan;
                    delete slimDomainPayload.childrenItems;
                    delete slimDomainPayload.streamItems;
                    delete slimDomainPayload._streamLevels;

                    try {
                        const res: any = await firstValueFrom(
                            this._domainService
                                .edit({
                                    username,
                                    domain: slimDomainPayload,
                                })
                                .pipe(takeUntil(this._unsubscribeAll))
                        );
                        if (res && res.success && res.data && res.data._rev) {
                            domainItem.domainData._rev = res.data._rev;
                        }
                    } catch (e) {
                        // Bỏ qua lỗi mạng lẻ để không nghẽn tiến trình các domain khác
                    }

                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        } finally {
            this.isSyncingDomainsAutoWrite = false;
        }
    }

    isResolvingSingleTask: boolean = false;

    private isTaskPlanningOnlyCommand(text: string): boolean {
        if (!text) return false;
        return /(?:tạo|cập nhật|chỉnh sửa|sửa|lên|phân bổ|xóa|clear|reset|hủy)(?:\s+lại|\s+toàn bộ|\s+sạch|\s+hết)?\s*(?:công việc|task|tasks|lịch)\b/i.test(
            text
        );
    }

    private isScriptWritingCommand(text: string): boolean {
        if (!text) return false;
        return /(?:(?:viết|soạn|tạo|làm|dựng|sinh|chạy)(?:\s+lại)?\s*(?:bài\s+)?kịch bản|kịch bản\s*(?:quảng cáo|video|tvc|tiktok|youtube|reels|short|phim|bán hàng))/i.test(
            text
        );
    }

    private isContentWritingCommand(text: string): boolean {
        if (!text || this.isTaskPlanningOnlyCommand(text)) return false;
        return (
            this.isScriptWritingCommand(text) ||
            /(?:(?:viết|soạn|chạy|sinh|tạo)(?:\s+lại)?\s*(?:bài\s+blog|blog|bài\s+viết|bài\s+quảng\s+cáo|bài|nội\s+dung|chi\s+tiết|quảng\s+cáo|content|tus|status|caption|post)|thực\s+thi\s+công\s+việc|giải\s+quyết\s+công\s+việc)/i.test(
                text
            )
        );
    }

    private formatScriptToHtml(scriptText: string): string {
        if (!scriptText) return '';
        const escapeHtml = (str: string) =>
            str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        const lines = scriptText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        const htmlBlocks: string[] = [];
        for (const line of lines) {
            if (/^(?:CẢNH|PHÂN\s+CẢNH|SCENE|INT\.|EXT\.)\s*/i.test(line)) {
                htmlBlocks.push(`<h2>${escapeHtml(line)}</h2>`);
            } else if (
                line === line.toUpperCase() &&
                line.length <= 45 &&
                /[A-ZÀ-Ỹ]/.test(line)
            ) {
                htmlBlocks.push(`<h3>${escapeHtml(line)}</h3>`);
            } else {
                htmlBlocks.push(`<p>${escapeHtml(line)}</p>`);
            }
        }
        return htmlBlocks.join('\n');
    }

    private formatHtmlToPlainScript(htmlText: string, fallbackTitle: string): string {
        if (!htmlText) return `CẢNH 1 - ${fallbackTitle}\n${fallbackTitle}`;
        const plain = htmlText
            .replace(/<\/(h[1-6]|p|div|li|tr)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .join('\n\n');
        if (!/(?:CẢNH|PHÂN\s+CẢNH|SCENE)\s+\d+/i.test(plain)) {
            return `CẢNH 1 - ${(fallbackTitle || 'KỊCH BẢN QUẢNG CÁO').toUpperCase()}\n\n${plain}`;
        }
        return plain;
    }

    private async generateAndPersistSingleTaskContent(
        task: any,
        userInstruction?: string
    ): Promise<{ savedUuid: string; title: string; isScript: boolean }> {
        const rawDomainName =
            task?.domain ||
            task?.domain_id ||
            task?.domainName ||
            this.editingItemDomain ||
            'website';
        const normTaskDomain = this.normalizeDomainKey(rawDomainName);
        const matchedItem = this.items?.find(
            (item: any) =>
                item &&
                !item.isTotalRow &&
                item.id !== 'total-summary-row' &&
                item.id !== 'monthly-total-summary-row' &&
                this.normalizeDomainKey(item?.domainData?.domain || item?.name) ===
                    normTaskDomain
        );
        const canonicalDomain =
            matchedItem?.domainData?.domain || matchedItem?.name || rawDomainName;
        const domainData = matchedItem?.domainData
            ? { ...matchedItem.domainData, domain: canonicalDomain }
            : { domain: canonicalDomain, name: canonicalDomain };

        let styleInstructions = '';
        if (domainData.note) {
            styleInstructions += `\n- Định hướng chuyên môn tên miền (bám sát): ${domainData.note}`;
        }
        let domainWritingStyle =
            domainData.writingStyle || this.editingItemWritingStyle;
        if (!domainWritingStyle && this.settings?.domainStyles) {
            domainWritingStyle =
                this.settings.domainStyles[canonicalDomain] ||
                this.settings.domainStyles[normTaskDomain];
        }
        if (domainWritingStyle && this.settings?.styles) {
            const styleObj = this.settings.styles.find(
                (s: any) =>
                    s.name === domainWritingStyle || s.id === domainWritingStyle
            );
            if (styleObj) {
                styleInstructions += `\n- Phong cách thể hiện (BẮT BUỘC): ${styleObj.name} (${styleObj.desc})`;
            } else {
                styleInstructions += `\n- Phong cách thể hiện: ${domainWritingStyle}`;
            }
        } else if (domainWritingStyle) {
            styleInstructions += `\n- Phong cách thể hiện: ${domainWritingStyle}`;
        }

        const taskMetaClean = String(task?.meta || '')
            .replace(/\bDone\b/gi, '')
            .trim();
        const combinedContext = `${task?.name || ''} ${taskMetaClean} ${userInstruction || ''}`;
        const shouldSaveAsScript =
            this.isScriptWritingCommand(userInstruction || '') ||
            /(?:kịch bản|tvc|scene|phân cảnh|quay dựng|voiceover|short video|reels)/i.test(
                combinedContext
            );

        const userDirectiveLine =
            userInstruction && userInstruction.trim()
                ? `\n- Yêu cầu trực tiếp từ người dùng (ƯU TIÊN SỐ 1): "${userInstruction.trim()}"`
                : '';
        const taskMetaLine = taskMetaClean
            ? `\n- Mô tả / Ghi chú chi tiết của công việc: "${taskMetaClean}"`
            : '';

        let prompt = '';
        if (shouldSaveAsScript) {
            prompt = `Bạn là Đạo diễn Quảng cáo & Biên kịch Video/TVC chuyên nghiệp. Hãy viết ngay KỊCH BẢN SẢN XUẤT sẵn sàng quay dựng và đăng tải cho kênh/tên miền "${canonicalDomain}" theo công việc:
- Chủ đề / Nhiệm vụ: "${task.name}"${taskMetaLine}${userDirectiveLine}${styleInstructions}

YÊU CẦU BẮT BUỘC:
1. Bám sát CHÍNH XÁC số lượng phân cảnh (scene) và thời lượng được nêu trong chủ đề/mô tả công việc hoặc yêu cầu người dùng (ví dụ: nếu công việc ghi "1 scene 10 giây" hoặc "1 scene 15 giây" thì chỉ viết ĐÚNG DUY NHẤT "CẢNH 1" gói gọn trọn vẹn trong thời lượng đó, tuyệt đối không tự chia thêm cảnh phụ; nếu không ghi rõ số cảnh thì chia 2 - 4 cảnh ngắn gọn phù hợp nền tảng "${canonicalDomain}").
2. Thu hút ngay từ giây đầu (Hook), làm nổi bật điểm đắt giá nhất của sản phẩm/dịch vụ và chốt bằng lời kêu gọi hành động (CTA) sắc gọn.
3. Trường "script" trình bày chuẩn định dạng phân cảnh dựng video:
   - Tiêu đề cảnh: "CẢNH 1 - [NỘI/NGOẠI]. [BỐI CẢNH] ([MỐC THỜI GIAN, VD: 00:00 - 00:10])"
   - Bên dưới mô tả rõ khung hình, góc máy, chuyển động, hiệu ứng âm thanh/nhạc nền và chữ hiển thị trên màn hình (Text on screen).
   - Tên nhân vật hoặc VOICEOVER viết IN HOA trên một dòng riêng, dòng kế tiếp là câu thoại đầy đủ vừa khít thời lượng.
4. Không suy luận lan man, trả về ĐÚNG DUY NHẤT 1 JSON Object hợp lệ theo cấu trúc sau (không kèm giải thích ngoài JSON):
{
  "title": "Tiêu đề kịch bản quảng cáo hấp dẫn, cụ thể",
  "description": "Caption đăng bài thu hút kèm CTA ngắn gọn cho video",
  "image_prompt": "Detailed English prompt to generate key visual or thumbnail for this video script",
  "tags": ["tu-khoa-1", "tu-khoa-2", "tu-khoa-3"],
  "script": "CẢNH 1 - NỘI. BỐI CẢNH CỤ THỂ (00:00 - 00:10)\\nMô tả khung hình, góc máy, hành động, âm thanh và Text on screen.\\n\\nVOICEOVER\\nLời thoại trọn vẹn đúng thời lượng kèm CTA."
}`;
        } else {
            prompt = `Bạn là chuyên gia Content SEO & Copywriting. Hãy viết ngay một bài viết hoàn chỉnh, chuyên sâu (khoảng 800 - 1200 từ) cho kênh/website "${canonicalDomain}" với chủ đề/nhiệm vụ:
- Chủ đề / Nhiệm vụ: "${task.name}"${taskMetaLine}${userDirectiveLine}${styleInstructions}

YÊU CẦU BẮT BUỘC:
1. Mở đầu bằng thẻ <p> Sapo cuốn hút chứa từ khóa chính, tiếp theo triển khai mạch lạc bằng các thẻ <h2>, <h3>, <p>, <ul>, <li>, <strong> (tuyệt đối không dùng Markdown).
2. Không suy luận lan man, trả về ĐÚNG DUY NHẤT 1 JSON Object hợp lệ theo cấu trúc sau (không kèm giải thích ngoài JSON):
{
  "title": "Tiêu đề bài viết chuẩn SEO hấp dẫn",
  "description": "Mô tả Meta Description ngắn gọn chuẩn SEO (140-160 ký tự)",
  "image_prompt": "Detailed English prompt to generate featured illustration for this article",
  "tags": ["tu-khoa-1", "tu-khoa-2", "tu-khoa-3"],
  "content": "<p>Đoạn mở đầu Sapo...</p><h2>Tiêu đề phần 1</h2><p>Nội dung chi tiết...</p>"
}`;
        }

        const response = await this._genaiService.generateContent({
            model: 'gemini-3.8-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            tools: [],
            config: {
                ttsVoice: 'none',
                disableThinking: true,
                systemInstruction:
                    'Trả về trực tiếp duy nhất 1 JSON Object hợp lệ theo đúng cấu trúc được yêu cầu. Không giải thích, không suy luận dài dòng.'
            }
        } as any);

        const rawText =
            response.text || (response as any).response?.text?.() || '';
        const articleData = this.parseArticleDataSafely(
            rawText,
            task.name || 'Nội dung mới'
        );

        const finalTitle = (articleData.title || task.name || 'Nội dung mới').trim();
        let finalScriptText = String(articleData.script || '').trim();
        let finalContentHtml = String(articleData.content || '').trim();
        const rawDescText = String(articleData.description || '').trim();

        if (!finalContentHtml && finalScriptText) {
            const scriptHtml = this.formatScriptToHtml(finalScriptText);
            if (rawDescText) {
                const escapedDesc = rawDescText
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                finalContentHtml = `<p><strong>Caption / Thông điệp:</strong> ${escapedDesc}</p>\n${scriptHtml}`;
            } else {
                finalContentHtml = scriptHtml;
            }
        }
        if (!finalContentHtml && rawText.trim()) {
            finalContentHtml = this.formatScriptToHtml(rawText.trim());
        }
        if (!finalContentHtml) {
            throw new Error('AI không trả về nội dung hợp lệ để lưu CSDL.');
        }

        if (shouldSaveAsScript && !finalScriptText) {
            finalScriptText = this.formatHtmlToPlainScript(
                finalContentHtml,
                finalTitle
            );
        }

        const finalDescription =
            (rawDescText || taskMetaClean || finalTitle).trim();
        const generatedUuid = uuid.v4().replace(/-/g, '').substring(0, 10);

        const archivePayload = this.buildArchivePayload({
            uuid: generatedUuid,
            title: finalTitle,
            content: finalContentHtml,
            description: finalDescription,
            image_prompt: articleData.image_prompt || '',
            tags: articleData.tags || [],
            domainData: domainData,
            rawUrl:
                task._id ||
                task.id ||
                'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            taskId: task._id || task.id
        });

        // 1. Lưu bài viết vào CSDL Soạn bài (SQLite local_articles hoặc Server Archive)
        const archiveRes: any = await firstValueFrom(
            this._crawlService.storeArchive(archivePayload)
        ).catch((err) => ({
            success: false,
            error: err?.message || String(err)
        }));

        if (!archiveRes || archiveRes.success === false || archiveRes.error) {
            throw new Error(
                archiveRes?.error ||
                    archiveRes?.message ||
                    'Không thể lưu bài viết vào CSDL Soạn bài.'
            );
        }

        const savedUuid =
            archiveRes?.uuid ||
            archiveRes?.data?.uuid ||
            archivePayload.uuid ||
            generatedUuid;

        // 2. Nếu là yêu cầu viết kịch bản (hoặc task kịch bản), lưu đồng thời vào CSDL Kịch bản (local_scripts & storeScript)
        if (shouldSaveAsScript && finalScriptText) {
            const activeUsername = this.user?.name || 'admin';
            const isLocal = isAutoSaveLocalEnabled();
            if (
                isLocal &&
                (window as any).electron &&
                (window as any).electron.saveLocalScript
            ) {
                const localScriptRes: any = await (
                    window as any
                ).electron.saveLocalScript({
                    uuid: savedUuid,
                    username: activeUsername,
                    title: finalTitle,
                    outline: finalDescription,
                    script: finalScriptText
                });
                if (localScriptRes && localScriptRes.success === false) {
                    console.warn(
                        'Cảnh báo lưu local_scripts:',
                        localScriptRes.error
                    );
                }
            }

            if (this._blogService) {
                if (!isLocal) {
                    await firstValueFrom(
                        this._blogService.storeScript({
                            username: activeUsername,
                            uuid: savedUuid,
                            title: finalTitle,
                            outline: finalDescription,
                            script: finalScriptText
                        })
                    ).catch(() => null);
                } else {
                    this._blogService
                        .storeScript({
                            username: activeUsername,
                            uuid: savedUuid,
                            title: finalTitle,
                            outline: finalDescription,
                            script: finalScriptText
                        })
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({ next: () => {}, error: () => {} });
                }
            }

            try {
                this.multiAccountService.setItem(
                    `ai_type_script_data_${savedUuid}`,
                    true
                );
            } catch (e) {}
        }

        try {
            this._h?.updateStatistics?.('writing', 1);
        } catch (e) {}

        // 3. Đánh dấu công việc đã hoàn thành [Done] trong RAM và lưu vào CSDL Tasks (SQLite local_tasks hoặc CouchDB)
        const updatedMeta = (
            (taskMetaClean ? taskMetaClean + ' ' : '') + 'Done'
        ).trim();
        task.done = true;
        task.status = 'done';
        task.isDone = true;
        task.completed = true;
        task.percent = 100;
        task.article_uuid = savedUuid;
        task.meta = updatedMeta;
        if (task.originalTask) {
            task.originalTask.done = true;
            task.originalTask.status = 'done';
            task.originalTask.isDone = true;
            task.originalTask.completed = true;
            task.originalTask.percent = 100;
            task.originalTask.article_uuid = savedUuid;
            task.originalTask.meta = updatedMeta;
        }

        const isLocalMode = isAutoSaveLocalEnabled();
        const targetTaskDateIso = task.startDate
            ? this.safeIsoDate(task.startDate)
            : '';

        let flatDomainTasks = matchedItem
            ? this.getFlatDomainTasks(matchedItem)
            : [];
        let planTask = flatDomainTasks.find((t: any) => {
            if (!t) return false;
            const tId = t._id || t.id;
            const targetId = task._id || task.id;
            if (tId && targetId && String(tId) === String(targetId)) {
                return true;
            }
            if (
                targetTaskDateIso &&
                t.startDate &&
                this.safeIsoDate(t.startDate) === targetTaskDateIso &&
                t.name === task.name
            ) {
                return true;
            }
            return false;
        });

        const taskRecordToPersist = planTask || task.originalTask || task;
        taskRecordToPersist.done = true;
        taskRecordToPersist.status = 'done';
        taskRecordToPersist.isDone = true;
        taskRecordToPersist.completed = true;
        taskRecordToPersist.percent = 100;
        taskRecordToPersist.article_uuid = savedUuid;
        taskRecordToPersist.meta = updatedMeta;
        taskRecordToPersist.domain_id = canonicalDomain;
        taskRecordToPersist.domain = canonicalDomain;

        try {
            const existingId =
                taskRecordToPersist._id || taskRecordToPersist.id;
            const isRealCouchDbTask =
                !!existingId &&
                !!taskRecordToPersist._rev &&
                String(taskRecordToPersist._rev).includes('-');
            const canEdit = isLocalMode ? !!existingId : isRealCouchDbTask;

            if (canEdit && existingId) {
                taskRecordToPersist._id = existingId;
                taskRecordToPersist.id = existingId;
                const resEdit: any = await firstValueFrom(
                    this._tasksService.edit({
                        username: this.user?.name || 'admin',
                        task: taskRecordToPersist
                    })
                ).catch(() => null);
                const newRev =
                    resEdit?.rev ||
                    resEdit?._rev ||
                    resEdit?.data?.rev ||
                    resEdit?.data?._rev;
                if (newRev) {
                    taskRecordToPersist._rev = newRev;
                }
            } else {
                const resAdd: any = await firstValueFrom(
                    this._tasksService.add({
                        username: this.user?.name || 'admin',
                        task: taskRecordToPersist
                    })
                ).catch(() => null);
                const newId =
                    resAdd?.id ||
                    resAdd?._id ||
                    resAdd?.data?.id ||
                    resAdd?.data?._id;
                const newRev =
                    resAdd?.rev ||
                    resAdd?._rev ||
                    resAdd?.data?.rev ||
                    resAdd?.data?._rev;
                if (newId) {
                    taskRecordToPersist._id = newId;
                    taskRecordToPersist.id = newId;
                }
                if (newRev) {
                    taskRecordToPersist._rev = newRev;
                }
            }
        } catch (errPersistTask) {
            console.warn('Lỗi cập nhật trạng thái Done cho task:', errPersistTask);
        }

        if (matchedItem) {
            if (!planTask) {
                flatDomainTasks = [...flatDomainTasks, taskRecordToPersist];
            }
            if (!matchedItem.domainData) {
                matchedItem.domainData = { domain: canonicalDomain };
            }
            matchedItem.domainData.plan = flatDomainTasks;
            if (Array.isArray(this.allDomainsList)) {
                const allDom = this.allDomainsList.find(
                    (ad: any) =>
                        ad &&
                        this.normalizeDomainKey(ad.domain || ad.name) ===
                            normTaskDomain
                );
                if (allDom) {
                    allDom.plan = [...flatDomainTasks];
                }
            }
            this.applyPackedTasks(matchedItem, flatDomainTasks);
        }

        this.updateTotalSummaryRow();
        return {
            savedUuid,
            title: finalTitle,
            isScript: shouldSaveAsScript
        };
    }

    private async writeAndSaveContentForTasks(
        tasksToProcess: any[],
        targetDateLocal: string,
        userInstruction?: string,
        skippedUncheckedCount: number = 0
    ): Promise<void> {
        if (!tasksToProcess || tasksToProcess.length === 0) return;

        this.isChatting = true;
        const isScriptBatch = this.isScriptWritingCommand(userInstruction || '');
        const contentKindLabel = isScriptBatch ? 'kịch bản' : 'bài viết';
        const skippedNotice =
            skippedUncheckedCount > 0
                ? ` *(bỏ qua ${skippedUncheckedCount} công việc của tên miền không tích chọn)*`
                : '';

        this.chatHistory.push({
            role: 'model',
            content: `Dạ Sếp! Em đang tiến hành viết chi tiết ${contentKindLabel} và lưu vào CSDL cho **${tasksToProcess.length} công việc** thuộc các tên miền đã chọn của ngày **${targetDateLocal}**${skippedNotice}...`,
            time: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        });
        this.cd.detectChanges();
        this.scrollToBottom();

        let successCount = 0;

        for (let i = 0; i < tasksToProcess.length; i++) {
            if (!this.isChatting) {
                this.chatHistory.push({
                    role: 'model',
                    content: `Đã dừng tiến trình viết ${contentKindLabel} theo yêu cầu của Sếp!`
                });
                break;
            }

            const task = tasksToProcess[i];
            const progressMsg: any = {
                role: 'model',
                content: `⏳ Đang viết và lưu CSDL [${i + 1}/${tasksToProcess.length}]: **${task.name}** (Tên miền: \`${task.domain}\`)...`,
                time: new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };
            this.chatHistory.push(progressMsg);
            this.cd.detectChanges();
            this.scrollToBottom();

            try {
                const savedInfo = await this.generateAndPersistSingleTaskContent(
                    task,
                    userInstruction
                );
                successCount++;
                const savedWhere = savedInfo.isScript
                    ? 'kho **Soạn bài** & **Kịch bản**'
                    : 'kho **Soạn bài**';
                progressMsg.content = `✅ [${i + 1}/${tasksToProcess.length}] Đã viết xong, lưu vào ${savedWhere} và đánh dấu Hoàn thành cho: **${savedInfo.title}** (\`${task.domain}\`)`;
            } catch (err: any) {
                progressMsg.content = `❌ [${i + 1}/${tasksToProcess.length}] Lỗi khi viết/lưu công việc **${task.name}** (\`${task.domain}\`): ${err?.message || err}`;
            }

            this.items = [...this.items];
            this.saveScriptState();
            this.cd.detectChanges();
            this.scrollToBottom();
        }

        const doneSummaryWhere = isScriptBatch
            ? 'CSDL **Soạn bài** & **Kịch bản** (có thể mở xem kịch bản hoặc dựng video ngay)'
            : 'CSDL và kho **Soạn bài**';
        this.chatHistory.push({
            role: 'model',
            content: `🎉 Báo cáo Sếp: Đã hoàn tất viết ${contentKindLabel}, lưu vào ${doneSummaryWhere} và đánh dấu Hoàn thành cho **${successCount}/${tasksToProcess.length} công việc** của ngày **${targetDateLocal}**!`,
            time: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        });
        if (successCount > 0) {
            this.toastr.success(
                `Đã viết và lưu CSDL thành công ${successCount}/${tasksToProcess.length} ${contentKindLabel} ngày ${targetDateLocal}!`
            );
        }
        this.isChatting = false;
        this.saveScriptState();
        this.cd.detectChanges();
        this.scrollToBottom();
    }

    async resolveTask(taskItem?: any): Promise<void> {
        const task = taskItem || this.editingItem;
        if (!task || this.isResolvingSingleTask) return;

        this.isResolvingSingleTask = true;
        this.toastr.info(`Đang dùng AI giải quyết công việc "${task.name}"...`);
        this.cd.markForCheck();

        try {
            const savedInfo = await this.generateAndPersistSingleTaskContent(task);
            this.items = [...this.items];
            this.saveScriptState();
            this.toastr.success(
                `Đã viết và lưu CSDL thành công "${savedInfo.title}"!`
            );
        } catch (err: any) {
            this.toastr.error(
                `Lỗi khi giải quyết công việc: ${err?.message || err}`
            );
        } finally {
            this.isResolvingSingleTask = false;
            this.cd.markForCheck();
        }
    }

    // Biến trạng thái Slide Chat (Bật / Tắt theo nút bấm Ẩn/Hiện)
    isChatOpened: boolean = false;
    isChatFocused: boolean = false;
    isChatPinned: boolean = false;

    toggleChat(): void {
        this.isChatOpened = !this.isChatOpened;
        this.cd.detectChanges();
    }

    isTaskDone(t: any): boolean {
        if (!t) return false;
        if (t.done === true) return true;
        if (t.status === 'done' || t.status === 'completed') return true;
        if (typeof t.meta === 'string' && t.meta.toLowerCase().includes('done')) return true;
        return false;
    }

    clearChatHistory() {
        this.chatHistory = [];
        this.multiAccountService.setItem(this.STORAGE_KEY + '_CHAT', this.chatHistory);
        this.cd.detectChanges();
    }

    copyMessage(text: string) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            this.toastr.success('Đã sao chép nội dung!');
        }).catch(() => {
            this.toastr.info('Đã sao chép nội dung');
        });
    }

    getMessageTime(msg: any): string {
        if (!msg) return '';
        if (msg.time) return msg.time;
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            if (!isNaN(d.getTime())) {
                const formatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                msg.time = formatted;
                return formatted;
            }
        }
        const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msg.time = nowFormatted;
        return nowFormatted;
    }

    reAskMessage(msg: any) {
        let text = msg?.content || '';
        if (msg?.role !== 'user') {
            const idx = this.chatHistory.indexOf(msg);
            if (idx > 0 && this.chatHistory[idx - 1]?.role === 'user') {
                text = this.chatHistory[idx - 1]?.content;
            }
        }
        this.chatPrompt = text;
        this.isChatFocused = true;
        this.isChatOpened = true;
        this.cd.detectChanges();
        const textarea = document.querySelector('textarea[placeholder*="prompt"]') as HTMLTextAreaElement;
        if (textarea) textarea.focus();
    }

    // [NEW] Biến lưu trữ danh sách tất cả tên miền từ DB
    allDomainsList: any[] = [];
    
    // [NEW] Biến tùy chọn active
    autoActivateWorkflows: boolean = true;

    readonly STORAGE_KEY = 'AMXH_SCRIPT_STATE';

    // 1. Thêm biến quản lý link video Like
    // --- Khai báo thêm biến ---
    @ViewChild('likeDialog') likeDialog: TemplateRef<any>;
    likeVideoUrl: string = '';
    likeStartTime: string = ''; // Format: YYYY-MM-DDThh:mm
    likeEndTime: string = '';

    // --- CONSTRUCTOR & INIT ---
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _mxhautoService: MXHAutoService,
        private toastr: ToastrService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private cd: ChangeDetectorRef,
        private zone: NgZone,
        private _matDialog: MatDialog,
        private _n8nService: N8nService, // Inject N8nService
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService,
        private _domainService: DomainService,
        private _tasksService: TasksService,
        private _crawlService: CrawlService,
        private _blogService: BlogService,
        private _globalAgentService: GlobalAgentService,
        private _h: HelperService,
        private _forumService: ForumService,
        private monthRangeState: ScheduleMonthRangeState
    ) {
        this.titleService.setTitle(`lên kịch bản | ai.type - công cụ tạo content`);
        this.updateTimelineMonthRange(this.month, this.year);

        this.settings = getSettings();
        if (this.settings) {
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;

            if (this.secretKey) {
                // let geminiKey = this.secretKey[0];
                // if (this.secretKey[4]) { geminiKey = this.secretKey[4]; }
                // this.ai = new GoogleGenAI({ apiKey: geminiKey });
            }
        }

        try {
            if (window && window.require) {
                const electron = window.require('electron');
                this.ipcRenderer = electron.ipcRenderer;
            }
        } catch (e) {
            console.warn('Không khả dụng', e);
        }
    }

    ngOnInit(): void {
        this.isChatOpened = false;
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        if (this._globalAgentService) {
            this._globalAgentService.actionResult$
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe((result: string) => {
                    if (result) {
                        let parsed = this.getParsedAiTask(result);
                        if (parsed) {
                            if (!Array.isArray(parsed)) {
                                parsed = [parsed];
                            }
                            
                            // Nếu AI Agent gửi lệnh yêu cầu tạo task cho toàn bộ tháng, 
                            // hãy chuyển thành Thẻ Xác Nhận Kế Hoạch Chi Tiết kèm Nút Confirm để Quản trị viên chủ động xác nhận
                            if (parsed[0] && (parsed[0].command === 'create_monthly_tasks' || parsed[0].command === 'schedule_tasks')) {
                                const requestMonth = this.month || (new Date().getMonth() + 1);
                                const requestYear = this.year || new Date().getFullYear();
                                const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                                const validDomains = this.items.filter(
                                    item =>
                                        item &&
                                        !item.isTotalRow &&
                                        item.id !== 'total-summary-row' &&
                                        item.id !== 'monthly-total-summary-row' &&
                                        this.isDomainAutoWriteEnabled(item)
                                );
                                const monthStr = requestMonth.toString().padStart(2, '0');

                                if (validDomains.length === 0) {
                                    this.toastr.warning(
                                        'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái trước khi tạo công việc!',
                                        'Chưa chọn tên miền'
                                    );
                                    this.chatHistory.push({
                                        role: 'model',
                                        content: `⚠️ **Chưa chọn tên miền thực thi**: Báo cáo Sếp, hiện chưa có tên miền nào được tích chọn ở cột **Công việc** bên trái. Sếp vui lòng tích chọn các tên miền muốn tạo công việc rồi gửi lại yêu cầu nhé!`
                                    });
                                    this.saveScriptState();
                                    this.cd.detectChanges();
                                    this.scrollToBottom();
                                    return;
                                }

                                const now = new Date();
                                const startDay = (requestYear === now.getFullYear() && requestMonth === (now.getMonth() + 1)) ? now.getDate() : 1;
                                
                                let workingDaysLeft = 0;
                                for (let i = startDay; i <= daysInMonth; i++) {
                                    const checkDate = `${requestYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
                                    if (!this.disabledDates.has(checkDate)) {
                                        workingDaysLeft++;
                                    }
                                }

                                let totalMonthlyTargetSum = 0;
                                let totalCreatedTasksSum = 0;
                                let totalMissingTasksSum = 0;

                                const domainRows = validDomains.map(item => {
                                    const rawName = (item.name || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
                                    const monthlyTarget = item.domainData?.monthlyTarget || this.getResolvedTarget(item.name, requestMonth, requestYear) || 0;
                                    const streamItems = item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || []);
                                    
                                    const createdTasksInMonth = streamItems.filter((t: any) => {
                                        if (!t.startDate) return false;
                                        const dObj = this.safeDate(t.startDate);
                                        return dObj && dObj.getFullYear() === requestYear && (dObj.getMonth() + 1) === requestMonth;
                                    }).length;

                                    const missingTasksToCreate = Math.max(0, monthlyTarget - createdTasksInMonth);
                                    const dailyTarget = monthlyTarget > 0 ? (workingDaysLeft > 0 ? Math.ceil(missingTasksToCreate / workingDaysLeft) : missingTasksToCreate) : 0;

                                    totalMonthlyTargetSum += monthlyTarget;
                                    totalCreatedTasksSum += createdTasksInMonth;
                                    totalMissingTasksSum += missingTasksToCreate;

                                    return `| \`${rawName}\` | ${createdTasksInMonth} bài | **${missingTasksToCreate} bài** |`;
                                });

                                const confirmContent = `🤖 **KẾ HOẠCH CHI TIẾT TẠO LỊCH THÁNG ${monthStr}/${requestYear}**

### 📊 1. Tổng quan kế hoạch hệ thống:
- 📅 **Thời gian áp dụng**: **01/${monthStr}/${requestYear}** đến **${daysInMonth}/${monthStr}/${requestYear}**
- ⏳ **Số ngày làm việc thực tế**: **${workingDaysLeft} ngày** (đã loại trừ các ngày nghỉ/bỏ qua)
- 🎯 **Tổng chỉ tiêu tên miền đã chọn**: **${totalMonthlyTargetSum} bài** (${validDomains.length} Tên miền)
- 📝 **Số bài đã lên lịch sẵn**: **${totalCreatedTasksSum} bài**
- 🚀 **Số bài bắt buộc tạo mới**: **${totalMissingTasksSum} bài**

---

### 📋 2. Chi tiết phân bổ chỉ tiêu theo từng Tên miền (Domain):

| Tên miền | Đã có | Cần tạo |
|---|:---:|:---:|
${domainRows.join('\n')}

---

👉 *Sếp vui lòng kiểm tra kế hoạch chi tiết ở trên và bấm nút xác nhận bên dưới để em bắt đầu khởi chạy kịch bản nhé!*`;

                                const selectedDomains = validDomains
                                    .map(item => this.normalizeDomainKey(item?.domainData?.domain || item?.name))
                                    .filter(Boolean);

                                this.chatHistory.push({
                                    role: 'model',
                                    content: confirmContent,
                                    isConfirmMessage: true,
                                    confirmData: { type: 'month', month: requestMonth, year: requestYear, selectedDomains }
                                });
                                this.saveScriptState();
                                this.cd.detectChanges();
                                this.scrollToBottom();
                                return;
                            }

                            const success = this.applyParsedTasks(parsed);
                            if (success) {
                                this.toastr.success('Đã cập nhật công việc từ AI', 'Thành công');
                            }
                        }
                    }
                });
        }

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        this.loadScriptState();
        const state = history.state;
        if (state && state.domains && state.domains.length > 0) {
            this.isLoadingSchedule = true;
            this.cd.markForCheck();
            this.processDomains(state.domains, state.statsData, state.month, state.forceGenerate, state.year);
            
            const newState = { ...state };
            delete newState.forceGenerate;
            delete newState.domains; // Xóa luôn domains để F5 không chạy lại
            history.replaceState(newState, '');
        } else {
            this.loadScheduleFromDB();
        }

        try {
            const anyWindow = window as any;
            const electron = anyWindow?.electron;

            if (electron?.stt?.onCaption) {
                this.sttCaptionUnsub = electron.stt.onCaption((payload: any) => {
                    this.zone.run(() => this.handleSttCaption(payload));
                });
            }

            if (electron?.stt?.onMessage) {
                electron.stt.onMessage((msg: any) => {
                });
            }
        } catch (e) {
            console.warn('[STT] cannot setup listeners', e);
        }
    }

    ngAfterViewInit() {
        if (this.timelineComponent) {
            // Khắc phục lỗi thư viện angular-calendar-timeline: viewMode=Day bị làm tròn (snap) theo ngày
            // khiến task không thể hiển thị đúng giờ/phút. Cần tự tính exact position dựa vào local time.
            const timelineAny = this.timelineComponent as any;
            const originalCalculateLeft = timelineAny._calculateItemLeftPosition.bind(this.timelineComponent);
            const originalCalculateWidth = timelineAny._calculateItemWidth.bind(this.timelineComponent);

            timelineAny._calculateItemLeftPosition = (item: any) => {
                if (this.timelineComponent.zoom) {
                    if (!item.startDate || !item.endDate) return 0;
                    const start = new Date(item.startDate);
                    const scaleStart = this.timelineComponent.scale.startDate;
                    
                    let diffInColumns = this.timelineComponent.viewModeAdaptor.getDurationInColumns(scaleStart, start);
                    if (start.getTime() < scaleStart.getTime()) {
                        diffInColumns = -diffInColumns;
                    }
                    
                    return diffInColumns * this.timelineComponent.zoom.columnWidth;
                }
                return originalCalculateLeft(item);
            };

            timelineAny._calculateItemWidth = (item: any) => {
                if (this.timelineComponent.zoom) {
                    if (!item.startDate || !item.endDate) return 0;
                    const start = new Date(item.startDate);
                    const end = new Date(item.endDate);
                    
                    const diffInColumns = this.timelineComponent.viewModeAdaptor.getDurationInColumns(start, end);
                    
                    return diffInColumns * this.timelineComponent.zoom.columnWidth;
                }
                return originalCalculateWidth(item);
            };

            this.minZoomIndex = this.timelineComponent.zoomsHandler.getFirstZoom().index;
            this.maxZoomIndex = this.timelineComponent.zoomsHandler.getLastZoom().index;
            this.currentZoomIndex = this.maxZoomIndex;

            this.timelineComponent.zoomsHandler.activeZoom$.subscribe(
                (zoom) => (this.currentZoomIndex = zoom.index)
            );

            if (!this.isLoadingSchedule) {
                this.focusActiveMonthView();
                if (typeof this.timelineComponent['_recalculateItemPositions'] === 'function') {
                    this.timelineComponent['_recalculateItemPositions']();
                }
            }
        }

        // nếu truyền data captions từ bên ngoài
        if (this.data) {
            this.captions = this.data || [];
        }

        this.isChatOpened = false;
        this.cd.detectChanges();
    }

  private safeDate(d: any): Date {
      if (!d) return new Date();
      let dt: Date;
      if (d instanceof Date) {
          dt = isNaN(d.getTime()) ? new Date() : new Date(d.getTime());
      } else if (typeof d === 'number') {
          dt = new Date(d);
          if (isNaN(dt.getTime())) dt = new Date();
      } else if (typeof d === 'string') {
          dt = new Date(d);
          if (isNaN(dt.getTime())) {
              if (d.includes('/') || d.includes('-')) {
                  const parts = d.split(/[ T]/);
                  const datePart = parts[0];
                  const timePart = parts.length > 1 ? parts[1] : '08:00:00';
                  const dParts = datePart.split(/[\/-]/);
                  if (dParts.length === 3) {
                      const yearPart = dParts.find(p => p.length === 4) || (this.year || new Date().getFullYear()).toString();
                      const otherParts = dParts.filter(p => p.length !== 4);
                      if (otherParts.length === 2) {
                          const p1 = parseInt(otherParts[0], 10);
                          const p2 = parseInt(otherParts[1], 10);
                          const month = p1 > 12 ? p2 : p1;
                          const day = p1 > 12 ? p1 : p2;
                          const formattedMonth = month.toString().padStart(2, '0');
                          const formattedDay = day.toString().padStart(2, '0');
                          dt = new Date(`${yearPart}-${formattedMonth}-${formattedDay}T${timePart}`);
                      }
                  }
              }
          }
          if (isNaN(dt.getTime())) dt = new Date();
      } else {
          dt = new Date();
      }

      if (dt.getFullYear() < 2000 || dt.getFullYear() > 2100) {
          dt.setFullYear(this.year || new Date().getFullYear());
      }

      return dt;
  }

  private isTaskInMonth(t: any, targetMonth: number, targetYear: number): boolean {
      if (!t || !t.startDate) return false;
      const dObj = this.safeDate(t.startDate);
      if (!dObj || isNaN(dObj.getTime())) return false;
      return dObj.getFullYear() === targetYear && (dObj.getMonth() + 1) === targetMonth;
  }

  private safeIsoString(d: any): string {
      const dt = this.safeDate(d);
      const year = dt.getFullYear();
      const month = (dt.getMonth() + 1).toString().padStart(2, '0');
      const day = dt.getDate().toString().padStart(2, '0');
      const hours = dt.getHours().toString().padStart(2, '0');
      const minutes = dt.getMinutes().toString().padStart(2, '0');
      const seconds = dt.getSeconds().toString().padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  private safeIsoDate(d: any): string {
      const dt = this.safeDate(d);
      const year = dt.getFullYear();
      const month = (dt.getMonth() + 1).toString().padStart(2, '0');
      const day = dt.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
  }

    private _cachedMasterCheckbox: HTMLInputElement | null = null;
    private _cachedHeaderCheckboxEl: HTMLElement | null = null;

    ngAfterViewChecked(): void {
        this.renderCheckboxesInHeader();
        this.renderPanelMasterCheckbox();
    }

    private syncPanelDomainCheckboxesDOM(singleKey?: string): void {
        const panelEl =
            this._timelineElement?.nativeElement?.querySelector('timeline-panel');
        if (!panelEl) return;

        const updateRow = (rowEl: Element) => {
            const key = rowEl.getAttribute('data-domain-key') || '';
            if (!key) return;
            const enabled = !this.disabledAutoWriteDomains.has(key);

            const cb = rowEl.querySelector(
                '.domain-autowrite-checkbox'
            ) as HTMLInputElement | null;
            if (cb && cb.checked !== enabled) {
                cb.checked = enabled;
            }

            const nameEl = rowEl.querySelector(
                '.item-name'
            ) as HTMLElement | null;
            if (nameEl) {
                nameEl.classList.toggle('text-gray-800', enabled);
                nameEl.classList.toggle('text-gray-400', !enabled);
            }

            const badgeEl = rowEl.querySelector(
                '.domain-target-badge'
            ) as HTMLElement | null;
            if (badgeEl) {
                badgeEl.classList.toggle('bg-indigo-50', enabled);
                badgeEl.classList.toggle('text-indigo-700', enabled);
                badgeEl.classList.toggle('bg-gray-100', !enabled);
                badgeEl.classList.toggle('text-gray-400', !enabled);
            }
        };

        if (singleKey) {
            const safeSelectorKey = singleKey.replace(/"/g, '\\"');
            const singleRow = panelEl.querySelector(
                `.panel-item[data-domain-key="${safeSelectorKey}"]`
            );
            if (singleRow) {
                updateRow(singleRow);
                return;
            }
        }

        const rows = panelEl.querySelectorAll('.panel-item[data-domain-key]');
        rows.forEach(updateRow);
    }

    private renderPanelMasterCheckbox(force: boolean = false): void {
        const sig = `${this.items?.length || 0}:${this.disabledAutoWriteDomains.size}`;
        if (
            !force &&
            sig === this.lastMasterCheckboxSig &&
            this._cachedMasterCheckbox?.isConnected
        ) {
            return;
        }

        const labelEl = this._timelineElement?.nativeElement?.querySelector(
            'timeline-panel .label'
        ) as HTMLElement | null;
        if (!labelEl) return;

        let totalCount = 0;
        let enabledCount = 0;
        if (Array.isArray(this.items)) {
            for (const it of this.items) {
                if (
                    !it ||
                    it.isTotalRow ||
                    it.id === 'total-summary-row' ||
                    it.id === 'monthly-total-summary-row'
                ) {
                    continue;
                }
                totalCount++;
                if (this.isDomainAutoWriteEnabled(it)) {
                    enabledCount++;
                }
            }
        }

        const allChecked = totalCount > 0 && enabledCount === totalCount;
        const someChecked = enabledCount > 0 && enabledCount < totalCount;

        let masterInput = labelEl.querySelector(
            '.panel-master-checkbox'
        ) as HTMLInputElement | null;
        if (!masterInput) {
            labelEl.style.justifyContent = 'flex-start';
            labelEl.style.padding = '0 12px';

            masterInput = document.createElement('input');
            masterInput.type = 'checkbox';
            masterInput.className = 'panel-master-checkbox';
            masterInput.title =
                'Chọn / bỏ chọn tất cả tên miền để viết bài tự động';
            masterInput.style.width = '16px';
            masterInput.style.height = '16px';
            masterInput.style.marginRight = '8px';
            masterInput.style.flexShrink = '0';
            masterInput.style.pointerEvents = 'auto';
            masterInput.style.cursor = 'pointer';

            const inputRef = masterInput;
            this.zone.runOutsideAngular(() => {
                inputRef.addEventListener('mousedown', (e: Event) =>
                    e.stopPropagation()
                );
                inputRef.addEventListener(
                    'touchstart',
                    (e: Event) => e.stopPropagation(),
                    { passive: true }
                );
                inputRef.addEventListener('click', (e: Event) =>
                    e.stopPropagation()
                );
                inputRef.addEventListener('change', (e: Event) => {
                    e.stopPropagation();
                    this.toggleAllDomainsAutoWrite();
                });
            });

            labelEl.insertBefore(masterInput, labelEl.firstChild);
        }

        if (masterInput.checked !== allChecked) {
            masterInput.checked = allChecked;
        }
        if (masterInput.indeterminate !== someChecked) {
            masterInput.indeterminate = someChecked;
        }
        masterInput.disabled = totalCount === 0;
        this._cachedMasterCheckbox = masterInput;
        this.lastMasterCheckboxSig = sig;
    }

    private renderCheckboxesInHeader(force: boolean = false) {
        if (!this.timelineComponent || !this.timelineComponent.zoom) return;

        // Chỉ thêm checkbox ở chế độ xem Ngày (chứa từng ngày trên 1 cột)
        if (this.timelineComponent.zoom.viewMode !== TimelineViewMode.Day) {
            return;
        }

        const scaleCols = this.timelineComponent.scale?.columns;
        const colCount = scaleCols?.length || 0;
        const firstColTime = scaleCols?.[0]?.date
            ? new Date(scaleCols[0].date).getTime()
            : 0;
        const sig = `${this.month}-${this.year}-${this.timelineComponent.zoom.columnWidth}-${colCount}-${firstColTime}-${this.disabledDates.size}`;
        if (
            !force &&
            sig === this.lastHeaderCheckboxesSig &&
            this._cachedHeaderCheckboxEl?.isConnected
        ) {
            return;
        }

        const headerEl =
            this._timelineElement?.nativeElement?.querySelector(
                'timeline-scale-header'
            );
        if (!headerEl) return;

        const columns = headerEl.querySelectorAll('.columns .column');
        if (!columns || columns.length === 0) return;

        let firstRenderedCheckbox: HTMLElement | null = null;

        columns.forEach((col: HTMLElement, index: number) => {
            const scaleColumn = this.timelineComponent.scale.columns[index];
            if (!scaleColumn || !scaleColumn.date) return;

            const dateStr = this.safeIsoDate(scaleColumn.date);

            let checkboxDiv = col.querySelector(
                '.day-disable-checkbox'
            ) as HTMLElement;
            if (!checkboxDiv) {
                col.style.display = 'flex';
                col.style.flexDirection = 'row';
                col.style.alignItems = 'center';
                col.style.justifyContent = 'center';

                checkboxDiv = document.createElement('div');
                checkboxDiv.className = 'day-disable-checkbox';
                checkboxDiv.setAttribute('data-date-str', dateStr);
                checkboxDiv.style.marginLeft = '8px';
                checkboxDiv.style.display = 'flex';
                checkboxDiv.style.alignItems = 'center';
                checkboxDiv.style.pointerEvents = 'auto';
                checkboxDiv.style.zIndex = '9999';
                checkboxDiv.style.cursor = 'pointer';

                const input = document.createElement('input');
                input.type = 'checkbox';
                input.title = 'Bỏ qua ngày này khi AI lên lịch';
                input.checked = this.disabledDates.has(dateStr);
                input.style.pointerEvents = 'auto';
                input.style.cursor = 'pointer';

                const label = document.createElement('span');
                label.innerText = 'Bỏ qua';
                label.style.fontSize = '10px';
                label.style.marginLeft = '4px';
                label.style.color = '#dc2626';
                label.style.fontWeight = '500';
                label.style.pointerEvents = 'auto';
                label.style.cursor = 'pointer';

                const divRef = checkboxDiv;
                const handleToggle = (e: any) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const activeDateStr =
                        divRef.getAttribute('data-date-str') || dateStr;

                    const isNowChecked = !this.disabledDates.has(activeDateStr);
                    input.checked = isNowChecked;
                    let updatedAny = false;

                    if (isNowChecked) {
                        this.disabledDates.add(activeDateStr);

                        if (this.items && this.items.length) {
                            this.items.forEach((domain) => {
                                if (
                                    domain.domainData &&
                                    domain.domainData.plan &&
                                    domain.domainData.plan.length > 0
                                ) {
                                    const hasTaskOnDate =
                                        domain.domainData.plan.some(
                                            (t: any) =>
                                                t.startDate &&
                                                this.safeIsoDate(
                                                    t.startDate
                                                ) === activeDateStr
                                        );
                                    if (hasTaskOnDate) {
                                        domain.domainData.plan =
                                            domain.domainData.plan.filter(
                                                (t: any) => {
                                                    if (!t.startDate)
                                                        return true;
                                                    return (
                                                        this.safeIsoDate(
                                                            t.startDate
                                                        ) !== activeDateStr
                                                    );
                                                }
                                            );
                                        this.applyPackedTasks(
                                            domain,
                                            domain.domainData.plan
                                        );
                                        updatedAny = true;
                                    }
                                }
                            });
                            if (updatedAny) {
                                this.updateTotalSummaryRow();
                            }
                        }
                    } else {
                        this.disabledDates.delete(activeDateStr);
                    }

                    this.lastHeaderCheckboxesSig = `${this.month}-${this.year}-${this.timelineComponent.zoom.columnWidth}-${colCount}-${firstColTime}-${this.disabledDates.size}`;
                    this.saveScriptState();
                    if (updatedAny) {
                        this.zone.run(() => {
                            this.cd.detectChanges();
                        });
                    }

                    if (this.syncDisabledDatesDebounceTimer) {
                        clearTimeout(this.syncDisabledDatesDebounceTimer);
                    }
                    this.syncDisabledDatesDebounceTimer = setTimeout(
                        async () => {
                            if (
                                this.items &&
                                this.items.length &&
                                this.user &&
                                this.user.name
                            ) {
                                const domainItems = this.items.filter(
                                    (d) =>
                                        d &&
                                        d.domainData &&
                                        !(d as any).isTotalRow
                                );
                                const disabledArr = Array.from(
                                    this.disabledDates
                                );
                                for (const domain of domainItems) {
                                    domain.domainData.disabledDates =
                                        disabledArr;
                                    const slimPayload: any = {
                                        ...domain.domainData,
                                        disabledDates: disabledArr,
                                    };
                                    delete slimPayload.plan;
                                    delete slimPayload.childrenItems;
                                    delete slimPayload.streamItems;
                                    delete slimPayload._streamLevels;
                                    try {
                                        const res: any = await firstValueFrom(
                                            this._domainService
                                                .edit({
                                                    username: this.user.name,
                                                    domain: slimPayload,
                                                })
                                                .pipe(
                                                    takeUntil(
                                                        this._unsubscribeAll
                                                    )
                                                )
                                        );
                                        if (
                                            res &&
                                            res.success &&
                                            res.data &&
                                            res.data._rev
                                        ) {
                                            domain.domainData._rev =
                                                res.data._rev;
                                        }
                                    } catch (e) {
                                        // Bỏ qua lỗi mạng lẻ để không nghẽn tiến trình các domain khác
                                    }
                                    await new Promise((r) => setTimeout(r, 0));
                                }
                            }
                        },
                        800
                    );
                };

                this.zone.runOutsideAngular(() => {
                    divRef.addEventListener('mousedown', handleToggle);
                    divRef.addEventListener('touchstart', handleToggle);
                    divRef.addEventListener('click', (e: any) => {
                        e.preventDefault();
                        e.stopPropagation();
                    });
                });

                checkboxDiv.appendChild(input);
                checkboxDiv.appendChild(label);
                col.appendChild(checkboxDiv);
            } else {
                if (checkboxDiv.getAttribute('data-date-str') !== dateStr) {
                    checkboxDiv.setAttribute('data-date-str', dateStr);
                }
                const input = checkboxDiv.querySelector('input');
                const isDisabled = this.disabledDates.has(dateStr);
                if (input && input.checked !== isDisabled) {
                    input.checked = isDisabled;
                }
            }

            if (!firstRenderedCheckbox) {
                firstRenderedCheckbox = checkboxDiv;
            }
        });

        this._cachedHeaderCheckboxEl = firstRenderedCheckbox;
        this.lastHeaderCheckboxesSig = sig;
    }

    ngOnDestroy(): void {
        if (this.monthTasksSub) {
            this.monthTasksSub.unsubscribe();
            this.monthTasksSub = undefined;
        }
        if (this.syncDisabledDatesDebounceTimer) {
            clearTimeout(this.syncDisabledDatesDebounceTimer);
            this.syncDisabledDatesDebounceTimer = null;
        }
        if (this.syncDomainAutoWriteDebounceTimer) {
            clearTimeout(this.syncDomainAutoWriteDebounceTimer);
            this.syncDomainAutoWriteDebounceTimer = null;
        }
        if (this.saveAutoWriteContextTimer) {
            clearTimeout(this.saveAutoWriteContextTimer);
            this.saveAutoWriteContextTimer = null;
        }
        if (this.saveScriptContextTimer) {
            clearTimeout(this.saveScriptContextTimer);
            this.saveScriptContextTimer = null;
        }
        this.sttCaptionUnsubscribe?.();
        this.sttCaptionUnsubscribe = undefined;
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
        this.liveStop$.next();
        this.liveStop$.complete();
    }

    // --- TIMELINE, ZOOM & ĐIỀU HƯỚNG THÁNG ---
    zoomIn(): void { this.timelineComponent.zoomIn(); }
    zoomOut(): void { this.timelineComponent.zoomOut(); }

    focusActiveMonthView(resetDefaultZoom: boolean = true): void {
        if (!this.timelineComponent) return;
        const focusDate = this.isViewingCurrentMonth
            ? new Date()
            : new Date(this.year || new Date().getFullYear(), (this.month || (new Date().getMonth() + 1)) - 1, 1, 8, 0, 0);

        (this.timelineComponent as any).currentDate = focusDate;
        if (resetDefaultZoom) {
            this.timelineComponent.changeZoomByIndex(1);
        }
        if (typeof this.timelineComponent.redraw === 'function') {
            this.timelineComponent.redraw();
        }
        this.timelineComponent.attachCameraToDate(focusDate);
    }

    scrollToToday(): void {
        if (!this.isViewingCurrentMonth) {
            this.goToCurrentMonth();
            return;
        }
        this.focusActiveMonthView(true);
    }

    prevMonth(): void {
        const currentMonth = this.month || (new Date().getMonth() + 1);
        const currentYear = this.year || new Date().getFullYear();
        let targetMonth = currentMonth - 1;
        let targetYear = currentYear;
        if (targetMonth < 1) {
            targetMonth = 12;
            targetYear -= 1;
        }
        this.navigateToMonth(targetMonth, targetYear);
    }

    nextMonth(): void {
        const currentMonth = this.month || (new Date().getMonth() + 1);
        const currentYear = this.year || new Date().getFullYear();
        let targetMonth = currentMonth + 1;
        let targetYear = currentYear;
        if (targetMonth > 12) {
            targetMonth = 1;
            targetYear += 1;
        }
        this.navigateToMonth(targetMonth, targetYear);
    }

    goToCurrentMonth(): void {
        const now = new Date();
        const nowMonth = now.getMonth() + 1;
        const nowYear = now.getFullYear();
        if (this.month === nowMonth && this.year === nowYear && !this.isLoadingMonth) {
            this.focusActiveMonthView(true);
            return;
        }
        this.navigateToMonth(nowMonth, nowYear);
    }

    navigateToMonth(targetMonth: number, targetYear: number): void {
        if (this.monthTasksSub) {
            this.monthTasksSub.unsubscribe();
            this.monthTasksSub = undefined;
        }

        const requestId = ++this.monthLoadRequestId;
        this.month = targetMonth;
        this.year = targetYear;
        this.updateTimelineMonthRange(targetMonth, targetYear);

        if (!this.allDomainsList || this.allDomainsList.length === 0) {
            this.loadScheduleFromDB(targetMonth, targetYear);
            return;
        }

        this.isLoadingMonth = true;
        this.cd.markForCheck();

        // Tháng đã từng xem trong phiên: hiển thị ngay dữ liệu đệm, công việc mới nhất được nạp ngầm phía sau
        const cachedMonthDomains = AMXHScheduleComponent._monthViewCache.get(
            this.getMonthCacheKey(targetMonth, targetYear)
        );
        if (cachedMonthDomains && cachedMonthDomains.length > 0) {
            this.renderDomainRowsFast(
                this.cloneDomainsForCache(cachedMonthDomains),
                targetMonth,
                targetYear,
                false
            );
        }

        const username = this.user?.name || 'admin';
        const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

        const domainsForMonth = this.allDomainsList.map((d: any) => {
            const norm = normalizeDomain(d.domain || d.name);
            const resolvedTarget = this.getResolvedTarget(norm, targetMonth, targetYear, d);
            return {
                ...d,
                domain: norm,
                name: norm,
                monthlyTarget: resolvedTarget,
                plan: []
            };
        });

        const applyMonthDomains = (tasks: any[]) => {
            if (requestId !== this.monthLoadRequestId) return;

            const filteredMonthTasks = (tasks || []).filter((t: any) => this.isTaskInMonth(t, targetMonth, targetYear));
            domainsForMonth.forEach((d: any) => {
                const dNorm = normalizeDomain(d.domain || d.name || d.id);
                d.plan = filteredMonthTasks.filter((t: any) => {
                    if (t.domain_id === d.domain || t.domain_id === d.id || t.domain_id === d._id) return true;
                    const tNorm = normalizeDomain(t.domain_id || t.domain || t.domainName);
                    return !!(tNorm && dNorm && tNorm === dNorm);
                });
            });

            this.allDomainsList = [...domainsForMonth];
            this.items = domainsForMonth.map((domainData: any, index: number) => {
                const dName = domainData.domain || domainData.name || `Domain-${index + 1}`;
                const normKey = this.normalizeDomainKey(dName);
                const isAutoWrite = normKey ? !this.disabledAutoWriteDomains.has(normKey) : (domainData.autoWrite !== false);
                domainData.autoWrite = isAutoWrite;

                const packed = this.packTasks((domainData.plan || []).map((task: any) => {
                    const sDate = this.safeDate(task.startDate);
                    const eDate = task.endDate ? this.safeDate(task.endDate) : new Date(new Date(sDate).setHours(17, 0, 0, 0));
                    return {
                        ...task,
                        startDate: sDate,
                        endDate: eDate
                    };
                }), index);

                return {
                    id: index,
                    name: dName,
                    autoWrite: isAutoWrite,
                    domainData: domainData,
                    childrenItemsExpanded: true,
                    childrenItems: packed.childrenItems,
                    streamItems: packed.streamItems
                };
            });

            this.updateTotalSummaryRow();
            this.saveScriptState();
            this.isLoadingMonth = false;
            // Nếu lượt nạp ban đầu bị thay thế bởi thao tác chuyển tháng, mở chỉ báo nạp tại đây
            this.isLoadingSchedule = false;
            this.hasRenderedMonthRows = true;
            this.cd.markForCheck();
            this.cd.detectChanges();

            setTimeout(() => {
                if (requestId !== this.monthLoadRequestId) return;
                this.focusActiveMonthView(false);
                if (this.timelineComponent && typeof (this.timelineComponent as any)['_recalculateItemPositions'] === 'function') {
                    (this.timelineComponent as any)['_recalculateItemPositions']();
                }
                this.cd.markForCheck();
                this.cd.detectChanges();
            }, 0);
        };

        this.monthTasksSub = this._tasksService.fetch({
            username: username,
            year: targetYear,
            targetYear: targetYear,
            month: targetMonth,
            onlySelectedMonth: true
        }).subscribe({
            next: (tasksRes: any) => {
                let tasks: any[] = [];
                if (Array.isArray(tasksRes)) {
                    tasks = tasksRes;
                } else if (tasksRes && Array.isArray(tasksRes.data)) {
                    tasks = tasksRes.data;
                } else if (tasksRes && Array.isArray(tasksRes.result)) {
                    tasks = tasksRes.result;
                }
                applyMonthDomains(tasks);
            },
            error: () => {
                applyMonthDomains([]);
            }
        });
    }
    zoomAndFitToContent(): void { this.timelineComponent.fitToContent(50); }
    changeZoom(event: Event): void { this.timelineComponent.changeZoomByIndex(+(event.target as HTMLInputElement).value); }

    onItemTimeChanged(event: IItemTimeChangedEvent): void {
        const item = event.item;
        item.startDate = event.newStartDate ?? item.startDate;
        item.endDate = event.newEndDate ?? item.endDate;
        this.items = [...this.items];
    }

    getViewModeName(): string {
        switch (this.timelineComponent?.zoom?.viewMode) {
            case TimelineViewMode.Day: return "Day";
            case TimelineViewMode.Week: return "Week";
            case TimelineViewMode.Month: return "Month";
            default: return "Unknown";
        }
    }

    addEvent(event: any) { console.log('event', event); }
    trackByIndex = (_: number, c: { index: number }) => c.index;
    @ViewChild('taskDetailDialog') taskDetailDialog: any;
    @ViewChild('groupTasksDialog') groupTasksDialog: any;
    selectedGroupItem: any = null;
    selectedGroupDomain: string = '';

    editingItem: any = null;
    editingItemDomain: string = '';
    editingItemWritingStyle: string = '';

    selectedGroupTaskIds: Set<string> = new Set<string>();

    toggleTaskExpanded(task: any, event?: Event) {
        if (event) event.stopPropagation();
        task._expanded = !task._expanded;
        this.cd.markForCheck();
    }

    toggleAllGroupTasks(expand: boolean) {
        if (this.selectedGroupItem && this.selectedGroupItem.tasks) {
            this.selectedGroupItem.tasks.forEach((t: any) => t._expanded = expand);
            this.cd.markForCheck();
        }
    }

    getTaskUniqueKey(task: any): string {
        return task._id || task.id || (task.name + '_' + (task.taskIndex || ''));
    }

    isTaskSelected(task: any): boolean {
        return !!task?._selected;
    }

    toggleSelectTask(task: any, event?: any) {
        if (event && event.stopPropagation) event.stopPropagation();
        if (task) {
            task._selected = !task._selected;
        }
        this.cd.detectChanges();
    }

    isAllGroupTasksSelected(): boolean {
        const tasks = this.selectedGroupItem?.tasks;
        if (!tasks || tasks.length === 0) return false;
        return tasks.every((t: any) => !!t._selected);
    }

    isSomeGroupTasksSelected(): boolean {
        const tasks = this.selectedGroupItem?.tasks;
        if (!tasks || tasks.length === 0) return false;
        const count = tasks.filter((t: any) => !!t._selected).length;
        return count > 0 && count < tasks.length;
    }

    toggleSelectAllGroupTasks(event?: any) {
        const tasks = this.selectedGroupItem?.tasks;
        if (!tasks || tasks.length === 0) return;
        const targetState = !this.isAllGroupTasksSelected();
        tasks.forEach((t: any) => t._selected = targetState);
        this.cd.detectChanges();
    }

    getSelectedGroupTasks(): any[] {
        const tasks = this.selectedGroupItem?.tasks;
        if (!tasks) return [];
        return tasks.filter((t: any) => !!t._selected);
    }

    hasSelectedGroupTasks(): boolean {
        const tasks = this.selectedGroupItem?.tasks;
        if (!tasks) return false;
        return tasks.some((t: any) => !!t._selected);
    }

    markSelectedTasksDone(done: boolean) {
        const selectedTasks = this.getSelectedGroupTasks();
        if (selectedTasks.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 công việc để thực hiện.');
            return;
        }

        selectedTasks.forEach(task => {
            task.done = done;
            task.status = done ? 'done' : 'pending';
            if (task.originalTask) {
                task.originalTask.done = done;
                task.originalTask.status = done ? 'done' : 'pending';
                if (done) {
                    task.originalTask.meta = (task.originalTask.meta ? task.originalTask.meta.replace(/done/gi, '').trim() + ' ' : '') + 'Done';
                }
            }
            if (this._tasksService) {
                this._tasksService.edit({ username: this.user?.name, task: task }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
            }
        });

        this.toastr.success(done ? `Đã đánh dấu hoàn thành ${selectedTasks.length} công việc.` : `Đã chuyển ${selectedTasks.length} công việc về trạng thái làm lại (chờ xử lý).`);
        this.selectedGroupTaskIds.clear();
        this.cd.markForCheck();
    }

    toggleTaskDone(task: any, event?: Event) {
        if (event) event.stopPropagation();
        task.done = !task.done;
        task.status = task.done ? 'done' : 'pending';
        if (task.originalTask) {
            task.originalTask.done = task.done;
            task.originalTask.status = task.status;
            if (task.done) {
                task.originalTask.meta = (task.originalTask.meta ? task.originalTask.meta.replace(/done/gi, '').trim() + ' ' : '') + 'Done';
            }
        }
        if (this._tasksService) {
            this._tasksService.edit({ username: this.user?.name, task: task }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
        }
        this.cd.markForCheck();
    }

    openSingleTaskDetail(task: any) {
        this._matDialog.closeAll();
        setTimeout(() => {
            this.changeEvent(task);
        }, 150);
    }

    changeEvent(item: any) { 
        if (!item) return;

        if (item.isGroup) {
            this.selectedGroupItem = item;
            this.selectedGroupDomain = '';
            for (let d of this.items) {
                if (d.streamItems && d.streamItems.find((t: any) => t.id === item.id)) {
                    this.selectedGroupDomain = d.name;
                    break;
                }
            }

            if (item.isMonthlyTotalBar && item.tasks && item.tasks.length) {
                const domains = new Set<string>();
                let minTime = Infinity;
                let maxTime = -Infinity;

                item.tasks.forEach((t: any) => {
                    let foundDomainName = '';
                    if (t.domainName) {
                        foundDomainName = t.domainName;
                    } else if (t.domain && typeof t.domain === 'string') {
                        foundDomainName = t.domain;
                    } else if (t.domainId && t.domainId !== 'monthly-total-summary-row' && t.domainId !== 'total-summary-row') {
                        foundDomainName = t.domainId;
                    }

                    if (!foundDomainName) {
                        for (const d of this.items) {
                            if (!(d as any).isTotalRow) {
                                const hasTask = d.streamItems?.some((st: any) => st.id === t.id || st._id === t._id || st.name === t.name) ||
                                                d.childrenItems?.some((child: any) => child.streamItems?.some((st: any) => st.id === t.id || st._id === t._id || st.name === t.name));
                                if (hasTask) {
                                    foundDomainName = String(d.name || d.id);
                                    break;
                                }
                            }
                        }
                    }

                    if (foundDomainName) {
                        domains.add(foundDomainName);
                    }

                    const s = this.safeDate(t.startDate);
                    const e = t.endDate ? this.safeDate(t.endDate) : s;
                    if (s && !isNaN(s.getTime())) {
                        if (s.getTime() < minTime) minTime = s.getTime();
                    }
                    if (e && !isNaN(e.getTime())) {
                        if (e.getTime() > maxTime) maxTime = e.getTime();
                    }
                });

                this.selectedGroupDomainCount = domains.size || 1;
                this.selectedGroupStartDate = minTime !== Infinity ? new Date(minTime) : item.startDate;
                this.selectedGroupEndDate = maxTime !== -Infinity ? new Date(maxTime) : item.endDate;
            }
            this.selectedGroupTaskIds.clear();
            if (this.selectedGroupItem && this.selectedGroupItem.tasks) {
                this.selectedGroupItem.tasks.forEach((t: any) => {
                    t._expanded = false;
                });
            }
            if (this.groupTasksDialog) {
                this._matDialog.open(this.groupTasksDialog, {
                    width: '640px',
                    disableClose: false,
                    panelClass: 'custom-dialog-prompt'
                });
            }
            return;
        }

        if (this.editingItem !== item) {
            console.log('item selected for AI edit', item); 
            this.editingItem = item;
            
            // Find parent domain to get writing style
            this.editingItemDomain = '';
            this.editingItemWritingStyle = 'Không xác định / Tự do';
            for (let d of this.items) {
                let foundDomain: any = null;
                if (d.streamItems && d.streamItems.find((t: any) => t.id === item.id || t._id === item._id || t.name === item.name)) {
                    foundDomain = d;
                } else if (d.childrenItems && d.childrenItems.length) {
                    const foundChild = d.childrenItems.find((childRow: any) => {
                        return childRow.streamItems && childRow.streamItems.find((t: any) => t.id === item.id || t._id === item._id || t.name === item.name);
                    });
                    if (foundChild) foundDomain = d;
                }
                
                if (foundDomain) {
                    this.editingItemDomain = foundDomain.name;
                    let styleId = foundDomain.domainData?.writingStyle;
                    if (!styleId && this.settings?.domainStyles) {
                        styleId = this.settings.domainStyles[foundDomain.domainData?.domain || foundDomain.name];
                    }
                    if (styleId) {
                        this.editingItemWritingStyle = styleId;
                        if (this.settings?.styles) {
                            const styleObj = this.settings.styles.find((s: any) => s.id === styleId || s.name === styleId);
                            if (styleObj) this.editingItemWritingStyle = `${styleObj.name}: ${styleObj.desc}`;
                        }
                    }
                    break;
                }
            }
            
            // Xoá lịch sử chat cũ khi chọn task mới
            this.chatHistory = [];
            this.cd.markForCheck();
        }
        
        if (this.taskDetailDialog) {
            this._matDialog.open(this.taskDetailDialog, {
                width: '600px',
                disableClose: false,
                panelClass: 'custom-dialog-prompt'
            });
        }
    }

    getRowHeight(row: any & { height: number }) { if (!row) return 50; if (row.height === undefined) return 50; return row.height; }

    toggleExpand(item: any) {
        if (item.childrenItems && item.childrenItems.length) {
            item.childrenItemsExpanded = !item.childrenItemsExpanded;
            this.items = [...this.items];
            this.cd.markForCheck();
        }
    }

    // --- MAIN TABLE (CAPTIONS) ---
    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) { return row.title !== 'Ethel Price'; }

    deleteSelectedRows() {
        const temp = this.captions.filter(row => !this.selected.includes(row));
        this.captions = temp;
        this.selected = [];
        this.cd.markForCheck();
    }

    // --- STT HANDLING ---
    private handleSttCaption(payload: any): void {
        const text = (payload?.text || '').trim();
        if (!text) return;

        if (payload.isFinal) {
            this.captions.push({ index: this.sttCaptionIndex++, text, selected: false });
            this.transcript = this.transcript ? this.transcript + ' ' + text : text;
            this.interimTranscript = '';

            if (this.captions.length > this.MAX_CAPTIONS) {
                this.captions.splice(0, this.captions.length - this.MAX_CAPTIONS);
            }
            this.scrollCaptionsToBottom();
        } else {
            this.interimTranscript = text;
            this.scrollCaptionsToBottom();
        }
        this.cd?.markForCheck?.();
    }

    private openSseTranscribe(hlsUrl: string): void {
        if (!hlsUrl) return;
        const url = `http://localhost:7171/?source=${encodeURIComponent(hlsUrl)}`;
        if (this.ipcRenderer) {
            this.ipcRenderer.send('tools-command', { command: 'open-chrome-app', url: url, width: 400, height: 800 });
            this.toastr.info("Đang mở cửa sổ STT...");
        } else {
            window.open(url, '_blank', 'width=1024,height=800');
        }
    }

    private scrollCaptionsToBottom(): void {
        if (!this.captionsBox) return;
        const el = this.captionsBox.nativeElement;
        setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
    }

    // --- PROFILES & DATA ---
    getProfiles(): void {
        this._mxhautoService.profiles({
            profiles_root: this.getProfilesRoot(), host: '127.0.0.1', verify: true, filter: "running", include_accounts: true, platform: 'tiktok', username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (result: any) => {
                if (result && result.ok) {
                    this.profiles = result.results;
                    this.totalProfiles = result.count;
                    this.items = [];
                    const requests = this.profiles.map((data: any, index: number) => this.generateData(data, index));
                    await Promise.all(requests);
                    this.loadScriptState();
                    this.cd.markForCheck();
                }
            },
            error: () => { }, complete: () => { }
        });
    }

    statsData: any;
    month: number = new Date().getMonth() + 1;
    year: number = new Date().getFullYear();

    async processDomains(domains: any[], statsData: any, month: number, forceGenerate: boolean = false, year?: number, targetDomainKeys?: Set<string>) {
        const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const uniqueDomains = new Map<string, any>();
        (domains || []).forEach((d: any) => {
            if (!d) return;
            const dName = d.domain || d.name || '';
            if (dName && !dName.includes('Tổng công việc') && !d.isTotalRow && !d.isMonthlyTotalRow) {
                const norm = normalizeDomain(dName);
                if (norm && !uniqueDomains.has(norm)) {
                    uniqueDomains.set(norm, { ...d, domain: norm, name: norm });
                }
            }
        });
        domains = Array.from(uniqueDomains.values());

        const targetMonth = month || this.month || (new Date().getMonth() + 1);
        const targetYear = year || this.year || new Date().getFullYear();
        this.statsData = statsData;
        this.month = targetMonth;
        this.year = targetYear;
        this.updateTimelineMonthRange(targetMonth, targetYear);
        if (forceGenerate) {
            this.toastr.info('Đang nạp dữ liệu tên miền...', 'Xử lý');
        }
        this.disabledDates.clear();

        if (domains && domains.length > 0) {
            domains.forEach(d => {
                if (d.disabledDates && Array.isArray(d.disabledDates)) {
                    d.disabledDates.forEach((date: string) => this.disabledDates.add(date));
                }
                const normKey = this.normalizeDomainKey(d.domain || d.name);
                if (normKey) {
                    if (
                        !this.pendingAutoWriteSyncDomains.has(normKey) &&
                        !this.isSyncingDomainsAutoWrite &&
                        typeof d.autoWrite === 'boolean'
                    ) {
                        if (d.autoWrite === false) {
                            this.disabledAutoWriteDomains.add(normKey);
                        } else {
                            this.disabledAutoWriteDomains.delete(normKey);
                        }
                    } else {
                        d.autoWrite = !this.disabledAutoWriteDomains.has(normKey);
                    }
                }
            });
        }
        this.lastMasterCheckboxSig = '';
        this.lastHeaderCheckboxesSig = '';

        // Nhường luồng giao diện 1 nhịp để trình duyệt kịp vẽ và xử lý thao tác bấm của người dùng trước khi dựng dữ liệu
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!forceGenerate && (this.month !== targetMonth || this.year !== targetYear)) {
            // Người dùng đã chuyển sang tháng khác trong lúc chờ: bỏ kết quả cũ để không ghi đè tháng mới
            return;
        }

        // Pre-populate all domain rows in this.items immediately so domain list doesn't vanish
        this.items = domains.map((domainData: any, index: number) => {
            const dName = domainData.domain || domainData.name || `Domain-${index + 1}`;
            if (!domainData.domain) domainData.domain = dName;
            if (!domainData.name) domainData.name = dName;
            const normKey = this.normalizeDomainKey(dName);
            const isAutoWrite = normKey ? !this.disabledAutoWriteDomains.has(normKey) : (domainData.autoWrite !== false);
            domainData.autoWrite = isAutoWrite;

            const existingPlan = (domainData.plan || []).filter((task: any) => this.isTaskInMonth(task, targetMonth, targetYear));
            domainData.plan = existingPlan;
            const packed = this.packTasks(existingPlan.map((task: any) => {
                const sDate = this.safeDate(task.startDate);
                const eDate = task.endDate ? this.safeDate(task.endDate) : new Date(new Date(sDate).setHours(17, 0, 0, 0));
                return {
                    ...task,
                    startDate: sDate,
                    endDate: eDate
                };
            }), index);

            return {
                id: index,
                name: dName,
                autoWrite: isAutoWrite,
                domainData: domainData,
                childrenItemsExpanded: true,
                childrenItems: packed.childrenItems,
                streamItems: packed.streamItems
            };
        });
        this.updateTotalSummaryRow();
        this.cd.detectChanges();

        if (forceGenerate) {
            for (let i = 0; i < domains.length; i++) {
                const dNorm = this.normalizeDomainKey(domains[i]?.domain || domains[i]?.name);
                const shouldGen = targetDomainKeys
                    ? targetDomainKeys.has(dNorm)
                    : this.isDomainAutoWriteEnabled(domains[i]);
                await this.generateDomainData(domains[i], i, statsData, targetMonth, shouldGen);
            }
        }
        // Không tạo mới: các hàng đã được đóng gói công việc ở bước trên, KHÔNG gọi lại generateDomainData
        // (trước đây đóng gói lại từng tên miền và tính lại hàng tổng N lần, gây khựng giao diện khi mở màn hình).

        if (forceGenerate) {
            const selectedCount = targetDomainKeys
                ? targetDomainKeys.size
                : domains.filter((d: any) => this.isDomainAutoWriteEnabled(d)).length;
            this._globalAgentService.sendStreamMessage({
                role: 'model',
                content: `✅ Tiến trình phân tích và tạo công việc cho ${selectedCount} tên miền đã chọn đã hoàn tất!`,
                isStreaming: false
            });
            this.updateTotalSummaryRow();
        }

        this.saveScriptState();
        if (forceGenerate) {
            this.toastr.success('Hoàn thành lên kế hoạch cho tên miền!');
        }

        // Mở khóa ngay, cuộn timeline tới tháng đang xem ở nhịp kế tiếp (không chờ thêm độ trễ cố định)
        const shouldResetZoom = !this.hasRenderedMonthRows;
        this.hasRenderedMonthRows = true;
        this.isLoadingSchedule = false;
        this.cd.markForCheck();
        this.cd.detectChanges();
        setTimeout(() => {
            this.focusActiveMonthView(shouldResetZoom);
            if (this.timelineComponent && typeof (this.timelineComponent as any)['_recalculateItemPositions'] === 'function') {
                (this.timelineComponent as any)['_recalculateItemPositions']();
            }
            this.cd.markForCheck();
            this.cd.detectChanges();
        }, 0);
    }

    private getNextValidDate(date: Date): Date {
        let nextDate = new Date(date);
        let currentMonth = nextDate.getMonth() + 1;
        let currentYear = nextDate.getFullYear();
        let checkStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${nextDate.getDate().toString().padStart(2, '0')}`;
        
        let attempts = 0;
        while (this.disabledDates.has(checkStr) && attempts < 30) {
            nextDate.setDate(nextDate.getDate() + 1);
            currentMonth = nextDate.getMonth() + 1;
            currentYear = nextDate.getFullYear();
            checkStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${nextDate.getDate().toString().padStart(2, '0')}`;
            attempts++;
        }
        return nextDate;
    }

    async generateDomainData(domainData: any, index: number, statsData: any, month: number, forceGenerate: boolean = false) {
        const now = new Date();
        const dName = domainData.domain || domainData.name || `Domain-${index + 1}`;
        if (!domainData.domain) domainData.domain = dName;
        if (!domainData.name) domainData.name = dName;
        
        // Tìm domain item đã được pre-populate trong this.items
        let domainItem = this.items.find(it => it.id === index || it.name === dName);
        if (!domainItem) {
            const normKey = this.normalizeDomainKey(dName);
            const isAutoWrite = normKey ? !this.disabledAutoWriteDomains.has(normKey) : (domainData.autoWrite !== false);
            domainData.autoWrite = isAutoWrite;
            domainItem = {
                id: index,
                name: dName,
                autoWrite: isAutoWrite,
                domainData: domainData,
                childrenItemsExpanded: true,
                childrenItems: [],
                streamItems: []
            };
            const realDomainItemsOnly = this.items.filter(it => it && it.id !== 'total-summary-row' && it.id !== 'monthly-total-summary-row');
            this.items = [...realDomainItemsOnly, domainItem];
        }

        if (domainData.plan && domainData.plan.length > 0) {
            this.applyPackedTasks(domainItem, domainData.plan.map((task: any) => ({
                ...task,
                startDate: new Date(task.startDate),
                endDate: new Date(task.endDate || new Date(task.startDate).setHours(17, 0, 0, 0))
            })));
        }

        if (!forceGenerate || !this.isDomainAutoWriteEnabled(domainData)) {
            return;
        }

        // Tính toán chỉ tiêu trong ngày
        let dailyTarget = 0;
        let currentResult = 0;
        let missing = 0;
        const targetYear = this.year || new Date().getFullYear();

        if (domainData.monthlyTarget && domainData.monthlyTarget > 0) {
            const existingTasksInMonth = (domainData.plan || []).filter((t: any) => {
                if (!t || !t.startDate || t.isLoading) return false;
                const dObj = this.safeDate(t.startDate);
                return dObj && dObj.getFullYear() === targetYear && (dObj.getMonth() + 1) === month;
            }).length;

            currentResult = existingTasksInMonth;
            missing = forceGenerate ? domainData.monthlyTarget : Math.max(0, domainData.monthlyTarget - currentResult);
            
            const isCurrentMonth = (targetYear === now.getFullYear() && month === (now.getMonth() + 1));
            const startDay = isCurrentMonth ? now.getDate() : 1;
            const daysInMonth = new Date(targetYear, month, 0).getDate();
            
            let daysLeft = 0;
            for (let i = startDay; i <= daysInMonth; i++) {
                const checkDate = `${targetYear}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
                if (!this.disabledDates.has(checkDate)) {
                    daysLeft++;
                }
            }
            
            if (daysLeft > 0) {
                dailyTarget = Math.ceil((domainData.monthlyTarget) / daysLeft);
            } else {
                dailyTarget = domainData.monthlyTarget;
            }
        }
        
        domainData.computedDailyTarget = dailyTarget;
        domainData.currentResult = currentResult;
        
        if (missing <= 0) {
            return; // Đã đủ chỉ tiêu
        }

        const isCurrentMonth = (targetYear === now.getFullYear() && month === (now.getMonth() + 1));
        const startDay = isCurrentMonth ? now.getDate() : 1;
        const daysInMonthTotal = new Date(targetYear, month, 0).getDate();
        
        let validDates = [];
        for (let i = startDay; i <= daysInMonthTotal; i++) {
            const checkDate = `${targetYear}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
            if (!this.disabledDates.has(checkDate)) {
                validDates.push(new Date(targetYear, month - 1, i));
            }
        }
        if (validDates.length === 0) validDates.push(new Date(targetYear, month - 1, 1));

        // Phân bổ missing tasks vào validDates
        let distribution = new Array(validDates.length).fill(Math.floor(missing / validDates.length));
        let remainder = missing % validDates.length;
        if (remainder > 0) {
            let step = Math.max(1, Math.floor(validDates.length / remainder));
            for (let r = 0; r < remainder; r++) {
                distribution[(r * step) % validDates.length]++;
            }
        }

        // Khi forceGenerate = true (tạo lại lịch cho tháng), loại bỏ các task cũ của chính tháng đó để không bị dồn 290 bài
        let streamItems = (domainData.plan || []).filter((t: any) => {
            if (!t || t.isLoading || !t.startDate) return false;
            if (forceGenerate) {
                const dObj = this.safeDate(t.startDate);
                if (dObj && dObj.getFullYear() === targetYear && (dObj.getMonth() + 1) === month) {
                    return false;
                }
            }
            return true;
        });

        let currentTaskCount = streamItems.length;
        
        // Thêm task loading giả
        let dummyStreamItems = [...streamItems];
        let dummyCount = currentTaskCount;
        let dayDummyIds: string[][] = [];
        for (let j = 0; j < validDates.length; j++) {
            const vDate = validDates[j];
            let sDate = new Date(vDate); sDate.setHours(8, 0, 0, 0);
            let eDate = new Date(vDate); eDate.setHours(18, 0, 0, 0);
            
            dayDummyIds[j] = [];
            for (let k = 0; k < distribution[j]; k++) {
                const dId = `dummy-${index}-${dummyCount++}`;
                dayDummyIds[j].push(dId);
                dummyStreamItems.push({
                    id: dId,
                    name: 'Đang tạo',
                    startDate: new Date(sDate),
                    endDate: new Date(eDate),
                    canResizeLeft: false,
                    canResizeRight: false,
                    canDragX: false,
                    canDragY: false,
                    meta: '',
                    isLoading: true
                });
            }
        }

        const itemIndexForDummy = this.items.findIndex(it => it.id === index);
        if (itemIndexForDummy > -1) {
            this.applyPackedTasks(this.items[itemIndexForDummy], dummyStreamItems);
            this.items[itemIndexForDummy].childrenItemsExpanded = true;
            this.items = [...this.items];
            this.cd.detectChanges();
        }

        let finalStreamItems = [...streamItems];

        // 1 SINGLE AI PROMPT PER DOMAIN (Thay vì loop 20 lần làm quá tải 180 HTTP requests)
        const datesSummary = validDates.map(d => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`).join(', ');
        
        this._globalAgentService.sendStreamMessage({
            role: 'model',
            content: `⏳ Đang phân tích và lập kế hoạch ${missing} bài viết cho tên miền **${domainData.domain}**...`,
            isStreaming: true
        });

        const prompt = `Bạn là chuyên gia SEO. Tên miền: ${domainData.domain}. Phân tích AI: ${domainData.note || 'Chưa có'}. 
Yêu cầu: Lên đúng ${missing} tiêu đề bài viết cần viết cho tên miền này, phân bổ trải đều vào các ngày làm việc sau: [${datesSummary}].
Hãy tự nghĩ ra tiêu đề và nội dung thật phong phú, cụ thể, đa dạng và phù hợp với ngách của tên miền. TUYỆT ĐỐI KHÔNG viết chung chung kiểu "Bài viết SEO 1".
Trả về ĐÚNG ĐỊNH DẠNG MẢNG JSON:
[
  { "date": "YYYY-MM-DD", "title": "Tiêu đề cụ thể", "content": "Tóm tắt nội dung" }
]
Không dùng markdown \`\`\`json.`;

        let aiResults: any[] = [];
        let response: any = null;
        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
            try {
                attempts++;
                response = await this._genaiService.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    tools: [],
                    config: { ttsVoice: 'none' } as any
                } as any);
                success = true;
            } catch (e: any) {
                console.warn(`[Lần thử ${attempts}/3] Lỗi gọi AI domain ${domainData.domain}:`, e?.message || e);
                if (attempts < 3) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        }

        try {
            if (success && response) {
                let resultText = response.text || '';
                if (resultText.includes('\`\`\`json')) resultText = resultText.split('\`\`\`json')[1].split('\`\`\`')[0].trim();
                else if (resultText.includes('\`\`\`')) resultText = resultText.split('\`\`\`')[1].split('\`\`\`')[0].trim();
                
                const startIndex = resultText.indexOf('[');
                let endIndex = resultText.lastIndexOf(']');
                if (startIndex !== -1) {
                    if (endIndex === -1 || endIndex < startIndex) {
                        const lastBrace = resultText.lastIndexOf('}');
                        if (lastBrace !== -1) {
                            resultText = resultText.substring(startIndex, lastBrace + 1) + ']';
                        } else {
                            resultText = resultText.substring(startIndex) + ']';
                        }
                    } else {
                        resultText = resultText.substring(startIndex, endIndex + 1);
                    }
                }
                
                try {
                    aiResults = JSON.parse(resultText);
                    if (!Array.isArray(aiResults)) aiResults = [aiResults];
                } catch (e) {
                    console.warn('Không thể parse JSON, thử sửa bằng regex:', e);
                    const regex = /"title"\s*:\s*"([^"]+)"/g;
                    let match;
                    while ((match = regex.exec(resultText)) !== null) {
                        aiResults.push({ title: match[1], content: '' });
                    }
                }
            }
        } catch (e) {
            console.error('Lỗi sinh nội dung AI cho domain', domainData.domain, e);
        }

        // Đảm bảo đủ số lượng tasks nếu AI trả về thiếu
        for (let k = 0; k < missing; k++) {
            const aiItem = aiResults[k] || { title: `Bài viết SEO ${k + 1}`, content: 'Tự động tạo dự phòng' };
            const vDate = validDates[k % validDates.length];
            
            let sDate = new Date(vDate);
            if (aiItem.date) {
                const parsedD = this.safeDate(aiItem.date);
                if (parsedD && !isNaN(parsedD.getTime())) sDate = parsedD;
            }
            sDate.setHours(8, 0, 0, 0);
            
            let eDate = new Date(sDate);
            eDate.setHours(17, 0, 0, 0);

            finalStreamItems.push({
                id: `${index}-${Date.now()}-${currentTaskCount++}`,
                name: aiItem.title || aiItem.name || `Bài viết SEO ${k + 1}`,
                startDate: sDate,
                endDate: eDate,
                canResizeLeft: true,
                canResizeRight: true,
                canDragX: true,
                canDragY: false,
                meta: aiItem.content || aiItem.meta || ''
            });
        }

        // Cập nhật UI ngay lập tức
        try {
            streamItems = finalStreamItems;
            const itemIndex = this.items.findIndex(it => it.id === index);
            if (itemIndex > -1) {
                this.applyPackedTasks(this.items[itemIndex], streamItems);
                this.items[itemIndex].childrenItemsExpanded = true;
                this.items = [...this.items];
                this.cd.markForCheck();
                this.cd.detectChanges();
                domainData.plan = streamItems;

                // Lưu các task mới vào CSDL ngầm theo nhóm 5 song song (không spam API)
                const dName = domainData.domain || domainData.name;
                const newTasksToAdd = finalStreamItems.filter(t => !t.isLoading);
                const chunkSize = 5;
                for (let i = 0; i < newTasksToAdd.length; i += chunkSize) {
                    const chunk = newTasksToAdd.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(async (t: any) => {
                        const taskPayload = { ...t, domain_id: dName, domain: dName };
                        const res: any = await firstValueFrom(
                            this._tasksService.add({ username: this.user.name, task: taskPayload })
                        ).catch(() => null);
                        if (res && !res.error) {
                            const savedId = res.id || res._id || res.data?.id || res.data?._id;
                            const savedRev = res.rev || res._rev || res.data?.rev || res.data?._rev;
                            if (savedId) {
                                t._id = savedId;
                                t.id = savedId;
                            }
                            if (savedRev) {
                                t._rev = savedRev;
                            }
                        }
                    }));
                    if (i + chunkSize < newTasksToAdd.length) {
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                }
            }
        } catch (error) {
            console.error('Lỗi khi cập nhật domain:', domainData.domain, error);
        }
    }

    generateData(data: any, index: number) {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        let personaData = { role: 'Người xem', style: 'Tự nhiên, thân thiện', gender: 'Không xác định', age: 'Không xác định', alias: '' };
        if (data.accounts && data.accounts.length > 0) {
            const acc = data.accounts[0];
            if (acc.alias) personaData.alias = acc.alias;
            if (acc.note) {
                try {
                    const parsedNote = JSON.parse(acc.note);
                    if (parsedNote && parsedNote.role && parsedNote.style) {
                        personaData.role = parsedNote.role;
                        personaData.style = parsedNote.style;
                        personaData.gender = parsedNote.gender || 'Ẩn';
                        personaData.age = parsedNote.age || 'Ẩn';
                    } else { personaData.style = acc.note; }
                } catch (e) { personaData.style = acc.note; }
            }
        }

        this.items = [...this.items, {
            id: index, name: data.profile, persona: personaData,
            streamItems: [
                { startDate: new Date(now), endDate: new Date(endOfDay), id: index, name: "Viết comment trong Live", canResizeLeft: false, canResizeRight: false, canDragX: false, canDragY: false, meta: [] },
                { startDate: new Date(now), endDate: new Date(endOfDay), id: index, name: "Thả tim trong Live", canResizeLeft: false, canResizeRight: false, canDragX: false, canDragY: false, meta: [] },
                // { startDate: new Date(now), endDate: new Date(endOfDay), id: index, name: "Chia sẻ", canResizeLeft: false, canResizeRight: false, canDragX: false, canDragY: false, meta: [] }
            ],
        }];
        (this as any).cd?.markForCheck?.();
    }

    // --- AI PROMPT & GENERATION ---
    generateComment() {
        this.customPromptInput = '';
        this._matDialog.open(this.promptDialog, {
            width: '600px',
            disableClose: false,
            panelClass: 'custom-dialog-prompt'
        });
    }

    generatNextComment() { this.generateComment(); }

    async confirmGenerateComment() {
        this._matDialog.closeAll();
        try {
            const texts = this.selected.length > 0 ? this.selected.map(s => s.text).join(', ') : '';
            let bio_description = (this.job && this.job.bio_description) ? `"${this.job.bio_description}"` : "không có mô tả";
            let nickname = (this.job && this.job['nickname']) ? `"${this.job['nickname']}"` : "người bán hàng";
            const activeProfiles = this.items.length > 6 ? this.getRandomSubarray(this.items, 6) : this.items;
            const castList = activeProfiles.map(p => {
                const per = p['persona'];
                if (!per) return '';
                const nameDisplay = per.alias ? `${per.alias}` : p.name;
                return `- ID: ${p.id} | Name: ${nameDisplay} | Role: ${per.role} | Gender: ${per.gender} | Style: ${per.style}`;
            }).filter(s => s !== '').join('\n');

            let messageToSend = '';
            const userPromptBlock = this.customPromptInput ? `\nCHỈ ĐẠO CỦA ĐẠO DIỄN (Yêu cầu thời gian, nội dung & LINK VIDEO): "${this.customPromptInput}"\n` : '';

            if (this.chatHistory.length === 0) {
                console.log('Khởi tạo Chat Session mới...');
                const systemInstruction = `
                    Bạn là đạo diễn kịch bản livestream chuyên nghiệp.
                    Nhiệm vụ: Tạo comment tương tác cho danh sách khán giả (Profiles).
                    THÔNG TIN LIVESTREAM: - Tiktoker: ${nickname} - Mô tả: ${bio_description}
                    QUY TẮC QUAN TRỌNG:
                    1. THỜI GIAN:
                       - Nếu có "KHUNG GIỜ CỤ THỂ" (Ví dụ: 10h ngày 15/01/2026): Tính toán "target_time" (ISO 8601) rải rác.
                       - Nếu KHÔNG: Dùng "delay" (số giây).
                    2. LINK VIDEO (BẮT BUỘC NẾU CÓ):
                       - Nếu người dùng cung cấp link video trong "CHỈ ĐẠO CỦA ĐẠO DIỄN", trích xuất vào "videoUrl".
                    OUTPUT JSON: { "data": [ { "id": <ID>, "comment": "...", "result": "...", "target_time": "...", "delay": 120, "videoUrl": "..." } ] }
                `;
                this.chatHistory = [
                    { role: "user", parts: [{ text: systemInstruction }] },
                    { role: "model", parts: [{ text: "Đã hiểu." }] }
                ];
                messageToSend = `Nội dung live: "${texts || 'Đang giới thiệu chung'}". ${userPromptBlock} DANH SÁCH DIỄN VIÊN: ${castList} Tạo kịch bản JSON ngay.`;
            } else {
                messageToSend = `Diễn biến mới: "${texts || 'Vẫn đang tiếp tục'}". ${userPromptBlock} DANH SÁCH DIỄN VIÊN: ${castList} Tiếp tục tạo kịch bản.`;
            }

            this.chatHistory.push({ role: "user", parts: [{ text: messageToSend }] });

            const result = await this._genaiService.generateContent({
                model: 'gemini-3.8-flash',
                contents: this.chatHistory,
                config: { ttsVoice: 'none' } as any
            });
            const jsonMatch = result.text;
            if (jsonMatch) {
                this.chatHistory.push({ role: "model", parts: [{ text: jsonMatch }] });
                try {
                    this.comments = JSON.parse(jsonMatch);
                    this.generateRandomComment();
                    this.toastr.success('Đã tạo kịch bản thành công!');
                } catch (e) {
                    console.error('Lỗi parse JSON:', e);
                    this.toastr.error('AI trả về dữ liệu không đúng định dạng JSON.');
                }
            } else {
                this.toastr.warning('AI không trả về JSON. Thử lại nhé.');
            }
        } catch (error) {
            console.error('Gemini Error:', error);
            this.toastr.error('Lỗi khi gọi AI.');
        }
    }

    generateRandomComment() {
        const newComments = this.comments['data'];
        if (!newComments || newComments.length === 0) return;
        const baseTime = new Date();
        newComments.forEach((commentData: any) => {
            const targetProfile = this.items.find(item => item.id == commentData.id);
            if (targetProfile) {
                const commentStream = targetProfile.streamItems.find(s => s.name === "Viết comment trong Live");
                if (commentStream) {
                    let startTime: Date;
                    if (commentData.target_time) {
                        startTime = new Date(commentData.target_time);
                        if (isNaN(startTime.getTime())) {
                            startTime = this.addSeconds(baseTime, Number(commentData.delay || 10));
                        }
                    } else if (commentData.delay !== undefined && commentData.delay !== null) {
                        startTime = this.addSeconds(baseTime, Number(commentData.delay));
                    } else {
                        const randomGap = Math.floor(Math.random() * 60) + 10;
                        startTime = this.addSeconds(baseTime, randomGap);
                    }
                    commentStream.meta.push({
                        comment: commentData.comment,
                        result: commentData.result,
                        start: startTime,
                        title: commentData.comment,
                        videoUrl: commentData.videoUrl || ''
                    });
                }
            }
        });
        this.items = [...this.items];
        this.saveScriptState();
        this.cd.markForCheck();
    }

    // --- Logic Random trong khoảng Ngày + Giờ ---
    generateLike() {
        const now = new Date();
        const future = new Date(now.getTime() + 60 * 60 * 1000); // Mặc định +1 giờ

        // Set mặc định vào input
        this.likeStartTime = this.formatDateForInput(now);
        this.likeEndTime = this.formatDateForInput(future);
        this.likeVideoUrl = this.job?.primaryUrl || '';

        this._matDialog.open(this.likeDialog, { width: '600px', disableClose: false, panelClass: 'custom-dialog-like' });
    }

    formatDateForInput(date: Date): string {
        const tzoffset = date.getTimezoneOffset() * 60000;
        return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
    }

    confirmGenerateLike() {
        if (!this.likeVideoUrl) {
            this.toastr.warning('Vui lòng nhập Link Video');
            return;
        }

        const start = new Date(this.likeStartTime).getTime();
        const end = new Date(this.likeEndTime).getTime();

        if (end <= start) {
            this.toastr.error('Thời gian kết thúc phải lớn hơn thời gian bắt đầu');
            return;
        }

        this.items.forEach(profileItem => {
            const likeStream = profileItem.streamItems.find(s => s.name === "Thả tim");
            if (likeStream) {
                // Random ngẫu nhiên trong khoảng timestamp start -> end
                const randomTimestamp = Math.floor(Math.random() * (end - start + 1)) + start;
                const executionTime = new Date(randomTimestamp);

                likeStream.meta.push({
                    title: 'Thả tim',
                    videoUrl: this.likeVideoUrl,
                    start: executionTime,
                    profileName: profileItem.name,
                    type: 'LIKE'
                });
            }
        });

        this.items = [...this.items];
        this.saveScriptState();
        this._matDialog.closeAll();
        this.toastr.success(`Đã tạo kịch bản Like cho ${this.items.length} Profiles`);
    }

    // --- Cập nhật n8nComments() để hiển thị rõ ràng ---
    n8nComments() {
        this.commentGroups = [];
        this.isAllSelected = false;
        this.totalSelected = 0;
        const groupsMap: { [key: string]: CommentGroup } = {};

        this.items.forEach(profileItem => {
            // Lấy dữ liệu từ cả 2 luồng
            profileItem.streamItems.forEach(stream => {
                if ((stream.name === 'Viết comment trong Live' || stream.name === 'Thả tim trong Live') && stream.meta.length > 0) {
                    const groupKey = `${profileItem.name} (${profileItem.persona?.role || 'User'})`;
                    if (!groupsMap[groupKey]) groupsMap[groupKey] = { key: groupKey, expanded: true, items: [] };

                    stream.meta.forEach((metaItem: any) => {
                        groupsMap[groupKey].items.push({
                            ...metaItem, // Copy toàn bộ data cũ
                            profileName: profileItem.name,
                            type: stream.name === 'Thả tim trong Live' ? 'LIKE' : 'COMMENT',
                            comment: stream.name === 'Thả tim trong Live' ? '❤️ [Thả tim video]' : metaItem.comment,
                            selected: false,
                            isEditing: false,
                            originalMeta: metaItem,
                            parentList: stream.meta
                        });
                    });
                }
            });
        });

        this.commentGroups = Object.values(groupsMap);
        this.commentGroups.forEach(g => g.items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));

        if (this.commentGroups.length > 0) {
            this._matDialog.open(this.commentDialog, { width: '90vw', height: '80vh', disableClose: false, panelClass: 'custom-dialog-n8n' });
        } else {
            this.toastr.warning('Chưa có dữ liệu để tổng duyệt.');
        }
    }

    countTypeInGroups(type: string): number {
        let count = 0;
        this.commentGroups.forEach(g => {
            count += g.items.filter(i => i.type === type).length;
        });
        return count;
    }

    // [UPDATED] Submit Logic: Dùng N8nService & Webhook Trigger
    /**
     * Tổng duyệt và gửi toàn bộ kịch bản (Comment & Thả tim) sang n8n
     */
    // Hàm hỗ trợ đếm số lượng theo loại trong bảng tổng duyệt
    countType(groups: any[], type: string): number {
        let count = 0;
        groups.forEach(g => {
            count += g.items.filter(i => i.type === type).length;
        });
        return count;
    }

    submitToN8n() {
        const requests: Observable<any>[] = [];
        const profilesRoot = this.getProfilesRoot();
        const selectedItems = [];

        this.commentGroups.forEach(group => {
            group.items.forEach(item => { if (item.selected) selectedItems.push(item); });
        });

        if (selectedItems.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 dòng.');
            return;
        }

        selectedItems.forEach(item => {
            const isLike = item.type === 'LIKE';
            const targetUrl = item.videoUrl || this.job?.primaryUrl || "https://www.tiktok.com/";

            // Tính delay
            const now = new Date().getTime();
            const targetTime = new Date(item.start).getTime();
            let delaySeconds = Math.ceil((targetTime - now) / 1000);
            if (delaySeconds < 0) delaySeconds = 0;

            // Xây dựng Payload dựa trên Type
            let payload: any;
            let apiUrl: string;

            if (isLike) {
                apiUrl = `${this.config?.settings?.['tiktok'] || 'https://tiktok.type.vn'}/v1/like/click`;
                payload = {
                    "site": "tiktok.com",
                    "like_selector": "div[data-e2e=\"live-chat-input-container\"]",
                    "title": "Thả tim trong Live",
                    "profiles": [item.profileName],
                    "profiles_root": profilesRoot,
                    "host": "127.0.0.1",
                    "coords_file": "mouse_coords.json",
                    "profile_urls": { [item.profileName]: targetUrl },
                    "post_dom_settle_ms": 10000,
                    "hover_before_click_ms": 120,
                    "verify_delay_ms": 400,
                    "second_click_delay_ms": 600,
                    "randomize_between_profiles": true,
                    "random_steps": 8,
                    "random_pause_ms": 18,
                    "persist_history": true,
                    "history_db_path": "data/search_click_history.db",
                    "diagnose": false
                };
            } else {
                apiUrl = `${this.config?.settings?.['tiktok'] || 'https://tiktok.type.vn'}/v1/comment/click`;
                payload = {
                    "site": "tiktok.com",
                    "comment_selector": "div[data-e2e=\"live-chat-input-container\"] div[contenteditable=\"plaintext-only\"]",
                    "title_comment_button": "Viết comment trong Live",
                    "profiles": [item.profileName],
                    "profiles_root": profilesRoot,
                    "coords_file": "mouse_coords.json",
                    "profile_urls": { [item.profileName]: targetUrl },
                    "typing_text": item.comment,
                    "type_mode": "per_key",
                    "key_interval_ms": 60,
                    "clear_before_type": false,
                    "press_enter_after": true,
                    "persist_history": true,
                    "history_db_path": "data/search_click_history.db",
                    "diagnose": false
                };
            }

            // Gửi thẳng dữ liệu lên n8n webhook (thay vì tạo workflow mới mỗi lần)
            const webhookPayload = {
                profileName: item.profileName,
                type: item.type,
                delay_seconds: delaySeconds,
                apiUrl: apiUrl,
                payload: payload
            };

            requests.push(this._n8nService.triggerWebhook('tiktok-automation', webhookPayload));
        });

        forkJoin(requests).subscribe({
            next: (results) => {
                const success = results.length;
                this.toastr.success(`Đã gửi thành công ${success} tác vụ lên n8n!`);
                this.removeSentItems(selectedItems); // Tự động xóa items đã gửi khỏi Timeline/Bảng
                if (this.commentGroups.length === 0) this._matDialog.closeAll();
                this.cd.markForCheck();
            },
            error: (err) => {
                console.error(err);
                this.toastr.error('Có lỗi xảy ra khi gửi dữ liệu lên n8n.');
            }
        });
    }

    /**
     * Helper: Xóa các lệnh Like trên Timeline sau khi gửi
     */
    private clearTimelineLikes() {
        this.items.forEach(item => {
            const likeStream = item.streamItems.find(s => s.name === 'Thả tim');
            if (likeStream) likeStream.meta = [];
        });
        this.saveScriptState();
    }

    toggleGroup(group: CommentGroup) { group.expanded = !group.expanded; }

    toggleAllSelection(isChecked: boolean) {
        this.isAllSelected = isChecked;
        this.commentGroups.forEach(group => { group.items.forEach(item => item.selected = isChecked); });
        this.updateSelectionCount();
    }

    updateSelectionCount() {
        let count = 0;
        let allChecked = true;
        if (this.commentGroups.length === 0) allChecked = false;
        for (const group of this.commentGroups) {
            for (const item of group.items) {
                if (item.selected) count++;
                else allChecked = false;
            }
        }
        this.totalSelected = count;
        this.isAllSelected = (this.totalSelected > 0 && allChecked);
    }

    deleteComment(group: CommentGroup, item: any) {
        const confirmation = this._fuseConfirmationService.open({
            title: 'Xóa Comment',
            message: 'Bạn có chắc chắn muốn xóa comment này không?',
            icon: { show: true, name: 'feather:alert-triangle', color: 'warn' },
            actions: { confirm: { show: true, label: 'Xóa', color: 'warn' }, cancel: { show: true, label: 'Hủy' } },
            dismissible: true
        });
        confirmation.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                const index = group.items.indexOf(item);
                if (index > -1) group.items.splice(index, 1);
                if (group.items.length === 0) {
                    const gIndex = this.commentGroups.indexOf(group);
                    if (gIndex > -1) this.commentGroups.splice(gIndex, 1);
                }
                if (item.parentList && item.originalMeta) {
                    const metaIndex = item.parentList.indexOf(item.originalMeta);
                    if (metaIndex > -1) item.parentList.splice(metaIndex, 1);
                }
                this.saveScriptState();
                this.updateSelectionCount();
                this.cd.markForCheck();
                this.toastr.success('Đã xóa comment.');
            }
        });
    }

    enableEdit(item: any) {
        item.isEditing = true;
        item.commentDraft = item.comment;
        item.resultDraft = item.result || '';
        item.videoUrlDraft = item.videoUrl || '';
    }

    saveEdit(item: any) {
        if (!item.commentDraft || item.commentDraft.trim() === '') {
            this.toastr.warning('Nội dung không được trống.');
            return;
        }
        item.comment = item.commentDraft;
        item.result = item.resultDraft;
        item.videoUrl = item.videoUrlDraft;
        item.isEditing = false;
        if (item.originalMeta) {
            item.originalMeta.comment = item.comment;
            item.originalMeta.result = item.result;
            item.originalMeta.videoUrl = item.videoUrl;
        }
        this.saveScriptState();
        this.toastr.success('Đã cập nhật nội dung.');
    }

    cancelEdit(item: any) {
        item.isEditing = false;
        item.commentDraft = '';
        item.resultDraft = '';
        item.videoUrlDraft = '';
    }

    removeSentItems(sentItems: any[]) {
        const sentSet = new Set(sentItems);
        this.commentGroups.forEach(group => {
            group.items = group.items.filter(item => {
                const isSent = sentSet.has(item);
                if (isSent) {
                    if (item.parentList && item.originalMeta) {
                        const metaIndex = item.parentList.indexOf(item.originalMeta);
                        if (metaIndex > -1) item.parentList.splice(metaIndex, 1);
                    }
                }
                return !isSent;
            });
        });
        this.commentGroups = this.commentGroups.filter(group => group.items.length > 0);
        this.saveScriptState();
        this.isAllSelected = false;
        this.updateSelectionCount();
        this.cd.markForCheck();
    }

    // --- HELPERS ---
    getRandomSubarray(arr: any[], size: number) {
        var shuffled = arr.slice(0), i = arr.length, min = i - size, temp, index;
        while (i-- > min) {
            index = Math.floor((i + 1) * Math.random());
            temp = shuffled[index];
            shuffled[index] = shuffled[i];
            shuffled[i] = temp;
        }
        return shuffled.slice(min);
    }

    getResolvedTarget(domain: string, month?: number, selectedYear?: number, domainObj?: any): number {
        const m = month || this.month || (new Date().getMonth() + 1);
        const y = selectedYear || this.year || new Date().getFullYear();
        this.settings = getSettings();
        const domainTargets = this.settings?.domainTargets;

        const norm = (s: string) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const targetDomainNorm = norm(domain);

        let target: any = undefined;
        if (domainTargets) {
            if (domainTargets[domain] !== undefined) {
                target = domainTargets[domain];
            } else {
                const matchedKey = Object.keys(domainTargets).find(k => norm(k) === targetDomainNorm);
                if (matchedKey) {
                    target = domainTargets[matchedKey];
                }
            }
        }

        if (target === undefined && domainObj?.monthlyTargets && typeof domainObj.monthlyTargets === 'object') {
            target = domainObj.monthlyTargets;
        }

        if (target === undefined) {
            return domainObj && domainObj.monthlyTarget !== undefined ? (Number(domainObj.monthlyTarget) || 0) : 0;
        }
        if (typeof target === 'number') return target; // Legacy compatibility
        
        let yearTarget = target[y];
        let legacyTarget = target[m]; // From old structure
        
        if (yearTarget && yearTarget[m] !== undefined && yearTarget[m] !== null) return yearTarget[m];
        if (legacyTarget !== undefined && legacyTarget !== null && typeof legacyTarget === 'number') return legacyTarget;
        
        // Fallback backward...
        if (yearTarget) {
            for (let chkM = m - 1; chkM >= 1; chkM--) {
                if (yearTarget[chkM] !== undefined && yearTarget[chkM] !== null) return yearTarget[chkM];
            }
        }
        
        // legacy fallback
        for (let chkM = m - 1; chkM >= 1; chkM--) {
            if (typeof target[chkM] === 'number') return target[chkM];
        }
        
        return domainObj && domainObj.monthlyTarget !== undefined ? (Number(domainObj.monthlyTarget) || 0) : 0;
    }

    addSeconds(date: Date, seconds: number): Date {
        const result = new Date(date);
        result.setSeconds(result.getSeconds() + seconds);
        return result;
    }

    private getMonthCacheKey(month: number, year: number): string {
        return `${this.user?.name || 'admin'}|${year}-${month}`;
    }

    private cloneDomainsForCache(domains: any[]): any[] {
        return (domains || []).map((d: any) => ({
            ...d,
            plan: Array.isArray(d?.plan) ? d.plan.map((t: any) => ({ ...t })) : [],
        }));
    }

    /** Chụp lại dữ liệu đang hiển thị (tên miền + công việc) vào bộ nhớ đệm của tháng hiện tại. */
    private snapshotCurrentMonthToCache(): void {
        try {
            if (!Array.isArray(this.items) || !this.month || !this.year) return;
            const realItems = this.items.filter(
                (it: any) =>
                    it &&
                    !it.isTotalRow &&
                    it.id !== 'total-summary-row' &&
                    it.id !== 'monthly-total-summary-row' &&
                    it.domainData
            );
            if (realItems.length === 0) return;
            const domains = realItems.map((it: any) => {
                const stream = it.childrenItems?.[0]?.streamItems?.length
                    ? it.childrenItems[0].streamItems
                    : it.streamItems || [];
                const tasks: any[] = [];
                stream.forEach((st: any) => {
                    if (!st || st.isLoading) return;
                    if (Array.isArray(st.tasks) && st.tasks.length) {
                        st.tasks.forEach((t: any) => t && !t.isLoading && tasks.push({ ...t }));
                    } else if (!st.isGroup) {
                        tasks.push({ ...st });
                    }
                });
                return { ...it.domainData, plan: tasks };
            });
            AMXHScheduleComponent._monthViewCache.set(
                this.getMonthCacheKey(this.month, this.year),
                domains
            );
        } catch (e) {}
    }

    /**
     * Dựng nhanh các hàng tên miền (kèm công việc nếu có) mà KHÔNG khóa màn hình,
     * dùng cho bộ nhớ đệm và cho danh sách tên miền khi công việc đang tải.
     */
    private renderDomainRowsFast(domains: any[], month: number, year: number, resetZoom: boolean = true): void {
        const rows = (domains || []).map((d: any) => ({
            ...d,
            plan: (d?.plan || []).filter((t: any) => this.isTaskInMonth(t, month, year)),
        }));
        rows.forEach((d: any) => {
            if (Array.isArray(d.disabledDates)) {
                d.disabledDates.forEach((date: string) => this.disabledDates.add(date));
            }
        });

        this.items = rows.map((domainData: any, index: number) => {
            const dName = domainData.domain || domainData.name || `Domain-${index + 1}`;
            const normKey = this.normalizeDomainKey(dName);
            const isAutoWrite = normKey
                ? !this.disabledAutoWriteDomains.has(normKey)
                : domainData.autoWrite !== false;
            domainData.autoWrite = isAutoWrite;
            const packed = this.packTasks(
                (domainData.plan || []).map((task: any) => {
                    const sDate = this.safeDate(task.startDate);
                    const eDate = task.endDate
                        ? this.safeDate(task.endDate)
                        : new Date(new Date(sDate).setHours(17, 0, 0, 0));
                    return { ...task, startDate: sDate, endDate: eDate };
                }),
                index
            );
            return {
                id: index,
                name: dName,
                autoWrite: isAutoWrite,
                domainData: domainData,
                childrenItemsExpanded: true,
                childrenItems: packed.childrenItems,
                streamItems: packed.streamItems,
            };
        });
        this.lastMasterCheckboxSig = '';
        this.lastHeaderCheckboxesSig = '';
        this.updateTotalSummaryRow();
        this.hasRenderedMonthRows = true;
        this.cd.markForCheck();
        this.cd.detectChanges();

        setTimeout(() => {
            this.focusActiveMonthView(resetZoom);
            if (
                this.timelineComponent &&
                typeof (this.timelineComponent as any)['_recalculateItemPositions'] === 'function'
            ) {
                (this.timelineComponent as any)['_recalculateItemPositions']();
            }
            this.cd.markForCheck();
        }, 0);
    }

    loadScheduleFromDB(targetMonthParam?: number, targetYearParam?: number) {
        if (this.monthTasksSub) {
            this.monthTasksSub.unsubscribe();
            this.monthTasksSub = undefined;
        }
        const requestId = ++this.monthLoadRequestId;
        const activeMonth = targetMonthParam || this.month || (new Date().getMonth() + 1);
        const activeYear = targetYearParam || this.year || new Date().getFullYear();
        this.month = activeMonth;
        this.year = activeYear;
        this.updateTimelineMonthRange(activeMonth, activeYear);

        // Hiển thị NGAY dữ liệu của lần mở gần nhất (nếu có) để người dùng thao tác được liền,
        // dữ liệu mới từ máy chủ sẽ được nạp ngầm và cập nhật lại sau.
        const cachedDomains = AMXHScheduleComponent._monthViewCache.get(
            this.getMonthCacheKey(activeMonth, activeYear)
        );
        this.hasRenderedMonthRows = false;
        if (cachedDomains && cachedDomains.length > 0) {
            this.allDomainsList = this.cloneDomainsForCache(cachedDomains);
            this.renderDomainRowsFast(this.allDomainsList, activeMonth, activeYear);
        }

        this.isLoadingSchedule = true;
        this.cd.markForCheck();
        const username = this.user?.name || 'admin';
        this._domainService.fetch({ username: username }).subscribe({
            next: (res: any) => {
                if (requestId !== this.monthLoadRequestId) return;
                let domains: any[] = [];
                if (res && res.success && Array.isArray(res.data)) {
                    domains = res.data;
                } else if (res && Array.isArray(res.result)) {
                    domains = res.result;
                } else if (Array.isArray(res)) {
                    domains = res;
                }

                if (domains.length > 0) {
                    const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                    const uniqueDomains = new Map<string, any>();
                    domains.forEach((d: any) => {
                        if (d && (d.domain || d.name)) {
                            const norm = normalizeDomain(d.domain || d.name);
                            if (norm && !uniqueDomains.has(norm)) {
                                uniqueDomains.set(norm, { ...d, domain: norm, name: norm });
                            }
                        }
                    });
                    domains = Array.from(uniqueDomains.values());

                    this.allDomainsList = [...domains];
                    domains.forEach((d: any) => {
                        d.monthlyTarget = this.getResolvedTarget(d.domain, activeMonth, activeYear, d);
                        d.plan = []; // Initialize empty plan
                    });

                    // Chưa có dữ liệu cũ để hiển thị: dựng ngay danh sách tên miền (chưa có công việc)
                    // để cột Công việc, checkbox và thanh điều hướng dùng được trong lúc chờ tải công việc.
                    if (!this.hasRenderedMonthRows) {
                        this.renderDomainRowsFast(domains, activeMonth, activeYear);
                    }

                    // Chỉ lấy dữ liệu tasks của đúng tháng đang chọn
                    this.monthTasksSub = this._tasksService.fetch({
                        username: username,
                        year: activeYear,
                        targetYear: activeYear,
                        month: activeMonth,
                        onlySelectedMonth: true
                    }).subscribe({
                        next: (tasksRes: any) => {
                            if (requestId !== this.monthLoadRequestId) return;
                            let tasks: any[] = [];
                            if (Array.isArray(tasksRes)) {
                                tasks = tasksRes;
                            } else if (tasksRes && Array.isArray(tasksRes.data)) {
                                tasks = tasksRes.data;
                            } else if (tasksRes && Array.isArray(tasksRes.result)) {
                                tasks = tasksRes.result;
                            }
                            
                            const filteredMonthTasks = tasks.filter((t: any) => this.isTaskInMonth(t, activeMonth, activeYear));
                            if (filteredMonthTasks.length > 0) {
                                const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                                domains.forEach((d: any) => {
                                    const dNorm = normalizeDomain(d.domain || d.name || d.id);
                                    d.plan = filteredMonthTasks.filter((t: any) => {
                                        if (t.domain_id === d.domain || t.domain_id === d.id || t.domain_id === d._id) return true;
                                        const tNorm = normalizeDomain(t.domain_id || t.domain || t.domainName);
                                        return !!(tNorm && dNorm && tNorm === dNorm);
                                    });
                                });
                            }
                            this.allDomainsList = [...domains];
                            this.processDomains(domains, undefined, activeMonth, false, activeYear);
                        },
                        error: () => {
                            if (requestId !== this.monthLoadRequestId) return;
                            this.processDomains(domains, undefined, activeMonth, false, activeYear);
                        }
                    });
                } else {
                    this.isLoadingSchedule = false;
                    this.loadScriptState();
                    this.cd.markForCheck();
                }
            },
            error: () => {
                if (requestId !== this.monthLoadRequestId) return;
                this.isLoadingSchedule = false;
                this.loadScriptState();
                this.cd.markForCheck();
            }
        });
    }

    saveScriptState() {
        try {
            // Chỉ ghi vào MultiAccountService khi dữ liệu thực sự thay đổi và KHÔNG gọi forceSave() đồng bộ (tránh mã hóa AES chặn luồng giao diện)
            const chatLen = this.chatHistory?.length || 0;
            const lastMsgLen =
                chatLen > 0
                    ? String(this.chatHistory[chatLen - 1]?.content || '').length
                    : 0;
            const chatSig = `${chatLen}:${lastMsgLen}`;
            if (chatSig !== this.lastSavedChatSig) {
                this.lastSavedChatSig = chatSig;
                this.zone.runOutsideAngular(() => {
                    this.multiAccountService.setItem(
                        this.STORAGE_KEY + '_CHAT',
                        this.chatHistory
                    );
                });
            }

            const disabledDatesArr = Array.from(this.disabledDates);
            const datesSig = disabledDatesArr.join(',');
            if (datesSig !== this.lastSavedDisabledDatesSig) {
                this.lastSavedDisabledDatesSig = datesSig;
                try {
                    localStorage.setItem(
                        this.STORAGE_KEY + '_DISABLED_DATES',
                        JSON.stringify(disabledDatesArr)
                    );
                } catch (e) {}
                this.zone.runOutsideAngular(() => {
                    this.multiAccountService.setItem(
                        this.STORAGE_KEY + '_DISABLED_DATES',
                        disabledDatesArr
                    );
                });
            }

            try {
                const autoWriteJson = JSON.stringify(
                    Array.from(this.disabledAutoWriteDomains)
                );
                localStorage.setItem(this.getAutoWriteStorageKey(), autoWriteJson);
                localStorage.setItem(
                    this.STORAGE_KEY + '_DISABLED_AUTO_WRITE_DOMAINS',
                    autoWriteJson
                );
            } catch (e) {}

            if (this.saveScriptContextTimer) {
                clearTimeout(this.saveScriptContextTimer);
            }
            this.zone.runOutsideAngular(() => {
                this.saveScriptContextTimer = setTimeout(() => {
                    this.saveScriptContextTimer = null;
                    this.updateGlobalAgentScheduleContext();
                    if (!this.isLoadingSchedule && !this.isLoadingMonth) {
                        this.snapshotCurrentMonthToCache();
                    }
                }, 300);
            });
        } catch (e) {
            console.error('Lỗi khi lưu trạng thái:', e);
        }
    }

    private updateGlobalAgentScheduleContext(): void {
        try {
            if (!this._globalAgentService || !Array.isArray(this.items)) {
                return;
            }
            const currentMonth = this.month || new Date().getMonth() + 1;
            const currentYear = this.year || new Date().getFullYear();
            const now = new Date();
            const startRemainingDay =
                currentYear === now.getFullYear() &&
                currentMonth === now.getMonth() + 1
                    ? now.getDate()
                    : 1;
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            const monthPadded = currentMonth.toString().padStart(2, '0');

            let remainingDays = 0;
            for (let i = startRemainingDay; i <= daysInMonth; i++) {
                const checkDate = `${currentYear}-${monthPadded}-${i.toString().padStart(2, '0')}`;
                if (!this.disabledDates.has(checkDate)) {
                    remainingDays++;
                }
            }

            const summaryData = this.items
                .filter(
                    (item: any) =>
                        item &&
                        !item.isTotalRow &&
                        item.id !== 'total-summary-row' &&
                        item.id !== 'monthly-total-summary-row' &&
                        this.isDomainAutoWriteEnabled(item)
                )
                .map((item) => {
                    const streamItems = item.childrenItems?.[0]?.streamItems || [];
                    const monthlyTarget =
                        item.domainData?.monthlyTarget ||
                        this.getResolvedTarget(item.name, currentMonth, currentYear) ||
                        0;
                    const currentResult =
                        this.statsData &&
                        this.statsData[item.name] &&
                        this.statsData[item.name][currentMonth]
                            ? this.statsData[item.name][currentMonth]
                            : 0;

                    let missing = monthlyTarget - currentResult;
                    if (missing < 0) missing = 0;
                    const dailyTarget =
                        monthlyTarget > 0
                            ? remainingDays > 0
                                ? Math.ceil(missing / remainingDays)
                                : missing
                            : 0;

                    return {
                        domain: item.name,
                        autoWrite: this.isDomainAutoWriteEnabled(item),
                        monthlyTarget: monthlyTarget,
                        currentResult: currentResult,
                        missingTasks: missing,
                        remainingDays: remainingDays,
                        dailyTarget: dailyTarget,
                        note: item.domainData?.note || 'Chưa có phân tích',
                        tasksCount: streamItems.length,
                        tasks: streamItems.map((t: any) => ({
                            id: t.id,
                            name: t.name,
                            startDate: t.startDate,
                            endDate: t.endDate,
                            meta: t.meta || '',
                        })),
                    };
                });

            const tzOffset = -(new Date().getTimezoneOffset() / 60);
            const tzString = tzOffset >= 0 ? '+' + tzOffset : tzOffset;
            const disabledStr = Array.from(this.disabledDates).join(', ');
            const tzOffsetStr = (date: Date) =>
                new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 10);
            const todayStr = tzOffsetStr(new Date());

            this._globalAgentService.updateContext({
                sourcePage: 'Lịch viết bài (Schedule)',
                action: 'schedule_tasks',
                data: summaryData,
                prompt: `BẠN LÀ MỘT HỆ THỐNG XỬ LÝ DỮ LIỆU. BẠN PHẢI TRẢ VỀ MẢNG JSON [ ... ]. BẠN PHẢI BỌC KẾT QUẢ TRONG CẶP MARKDOWN \`\`\`json VÀ \`\`\`.
KHÔNG ĐƯỢC CHÀO HỎI. KHÔNG ĐƯỢC GIẢI THÍCH.


Mảng JSON phải có cấu trúc MẢNG CHỨA CÁC OBJECT: [ { "domain": "...", "tasks": [ { "name": "...", "meta": "...", "startDate": "YYYY-MM-DDTHH:mm:ss", "endDate": "YYYY-MM-DDTHH:mm:ss" } ] } ]

HÔM NAY LÀ NGÀY: ${todayStr}

YÊU CẦU TẠO TASK CHUYÊN SÂU:
- NẾU YÊU CẦU LÀ CHO CẢ THÁNG (vd: "cho tháng 7"): BẮT BUỘC PHẢI TẠO ĐÚNG TỔNG SỐ LƯỢNG TASK BẰNG 'missingTasks' CHO TỪNG TÊN MIỀN. Tuyệt đối không được lười biếng, phải tạo ra đủ số lượng tác vụ còn thiếu! Hãy phân bổ startDate và endDate trải đều từ hôm nay đến hết tháng.
- NẾU YÊU CẦU LÀ CHO MỘT NGÀY CỤ THỂ: BẮT BUỘC PHẢI TẠO ĐÚNG SỐ LƯỢNG TASK BẰNG 'dailyTarget'.
- Dựa vào 'note' (phân tích ngách), tạo CÁC TIÊU ĐỀ BÀI VIẾT THẬT PHONG PHÚ, CỤ THỂ, ĐA DẠNG. Tuyệt đối không viết chung chung kiểu "Viết bài chuẩn SEO". Nếu cần 10 bài, hãy tạo ra 10 task riêng biệt với 10 tiêu đề khác nhau.
- Để tạo task mới: KHÔNG trả về trường "id". Sửa task: giữ nguyên "id". Xóa task: trả về "_deleted": true kèm "id".
- TẤT CẢ task cùng 1 ngày BẮT BUỘC startDate là 08:00:00 và endDate 17:00:00. Định dạng local: "YYYY-MM-DDTHH:mm:ss" (không có Z).
NGÀY BỊ VÔ HIỆU HÓA: ${disabledStr ? disabledStr : 'Không có'}. KHÔNG lên lịch vào ngày này. Múi giờ: GMT${tzString}.

ĐỊNH DẠNG TRẢ VỀ BẮT BUỘC (CHỈ GỒM CODE JSON, KHÔNG CÓ TEXT NÀO KHÁC):
\`\`\`json
[
  {
    "domain": "type.vn",
    "tasks": [
      {
        "name": "Cách viết bài chuẩn SEO...",
        "startDate": "${todayStr}T08:00:00",
        "endDate": "${todayStr}T17:00:00"
      }
    ]
  }
]
\`\`\``,
            });
        } catch (e) {}
    }

    loadScriptState() {
        try {
            const savedDisabledDates = this.multiAccountService.getItem(this.STORAGE_KEY + '_DISABLED_DATES');
            if (savedDisabledDates && Array.isArray(savedDisabledDates)) {
                savedDisabledDates.forEach(d => this.disabledDates.add(d));
            } else {
                const oldSaved = localStorage.getItem(this.STORAGE_KEY + '_DISABLED_DATES');
                if (oldSaved) {
                    try {
                        const parsedDates = JSON.parse(oldSaved);
                        if (Array.isArray(parsedDates)) {
                            parsedDates.forEach(d => this.disabledDates.add(d));
                        }
                    } catch(e) {}
                }
            }
            this.lastSavedDisabledDatesSig = Array.from(this.disabledDates).join(',');

            let parsedAutoWriteDomains: any[] | null = null;
            try {
                const scopedRaw = localStorage.getItem(this.getAutoWriteStorageKey());
                if (scopedRaw) {
                    const parsed = JSON.parse(scopedRaw);
                    if (Array.isArray(parsed)) {
                        parsedAutoWriteDomains = parsed;
                    }
                }
            } catch (e) {}

            if (!parsedAutoWriteDomains) {
                const savedDisabledDomains = this.multiAccountService.getItem(
                    this.STORAGE_KEY + '_DISABLED_AUTO_WRITE_DOMAINS'
                );
                if (savedDisabledDomains && Array.isArray(savedDisabledDomains)) {
                    parsedAutoWriteDomains = savedDisabledDomains;
                }
            }

            if (!parsedAutoWriteDomains) {
                try {
                    const oldSavedDomains = localStorage.getItem(
                        this.STORAGE_KEY + '_DISABLED_AUTO_WRITE_DOMAINS'
                    );
                    if (oldSavedDomains) {
                        const parsed = JSON.parse(oldSavedDomains);
                        if (Array.isArray(parsed)) {
                            parsedAutoWriteDomains = parsed;
                        }
                    }
                } catch (e) {}
            }

            if (parsedAutoWriteDomains) {
                parsedAutoWriteDomains.forEach((d: any) => {
                    const norm = this.normalizeDomainKey(d);
                    if (norm) this.disabledAutoWriteDomains.add(norm);
                });
            }

            const savedChat = this.multiAccountService.getItem(this.STORAGE_KEY + '_CHAT');
            if (savedChat && Array.isArray(savedChat)) {
                this.chatHistory = savedChat;
            } else {
                const oldChat = localStorage.getItem(this.STORAGE_KEY + '_CHAT');
                if (oldChat) {
                    try {
                        this.chatHistory = JSON.parse(oldChat) || [];
                    } catch(e) {}
                }
            }
            const chatLen = this.chatHistory?.length || 0;
            const lastMsgLen =
                chatLen > 0
                    ? String(this.chatHistory[chatLen - 1]?.content || '').length
                    : 0;
            this.lastSavedChatSig = `${chatLen}:${lastMsgLen}`;
        } catch (e) { console.error('Lỗi khi tải trạng thái giao diện:', e); }
    }

    resetScriptContext() {
        this.chatHistory = [];
        this.selected = [];
        this.captions.forEach(c => c.selected = false);
        localStorage.removeItem(this.STORAGE_KEY);
        this.items.forEach(item => {
            const commentStream = item.streamItems.find(s => s.name === 'Viết comment trong Live');
            if (commentStream) commentStream.meta = [];
        });
        this.items = [...this.items];
        this.cd.markForCheck();
        this.toastr.info('Đã xóa ngữ cảnh AI và kịch bản cũ.');
    }

    async deleteAllMonthTasksFromDB(year: number, month: number, targetDomainKeys?: Set<string>): Promise<number> {
        try {
            // Fetch fresh tasks directly from CouchDB server
            const tasksRes: any = await firstValueFrom(
                this._tasksService.fetch({ username: this.user.name, year: year, month: month })
            ).catch(() => null);
            let serverTasks: any[] = [];
            if (Array.isArray(tasksRes)) {
                serverTasks = tasksRes;
            } else if (tasksRes && Array.isArray(tasksRes.data)) {
                serverTasks = tasksRes.data;
            } else if (tasksRes && Array.isArray(tasksRes.result)) {
                serverTasks = tasksRes.result;
            }

            const matchesTargetDomain = (t: any, fallbackDomain?: string): boolean => {
                if (!targetDomainKeys) return true;
                const rawDom = t?.domain_id || t?.domain || t?.domainName || fallbackDomain || '';
                const norm = this.normalizeDomainKey(rawDom);
                return !!(norm && targetDomainKeys.has(norm));
            };

            const monthTasksToDelete: any[] = [];

            // 1. Check server tasks for matching month (and selected domains when specified)
            serverTasks.forEach((t: any) => {
                if (!t || !t.startDate) return;
                const dObj = this.safeDate(t.startDate);
                if (dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month && matchesTargetDomain(t)) {
                    monthTasksToDelete.push(t);
                }
            });

            // 2. Check RAM tasks for matching month (and selected domains when specified)
            (this.items || []).forEach((d: any) => {
                if (!d || d.isTotalRow || d.id === 'total-summary-row' || d.id === 'monthly-total-summary-row') return;
                const dName = d?.domainData?.domain || d?.name || '';
                const dNorm = this.normalizeDomainKey(dName);
                if (targetDomainKeys && (!dNorm || !targetDomainKeys.has(dNorm))) return;
                const list = d?.childrenItems?.[0]?.streamItems || d?.domainData?.plan || [];
                list.forEach((t: any) => {
                    if (!t || !t.startDate) return;
                    const dObj = this.safeDate(t.startDate);
                    if (dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month) {
                        monthTasksToDelete.push(t);
                    }
                });
            });

            (this.allDomainsList || []).forEach((d: any) => {
                if (!d) return;
                const dName = d?.domain || d?.name || '';
                const dNorm = this.normalizeDomainKey(dName);
                if (targetDomainKeys && (!dNorm || !targetDomainKeys.has(dNorm))) return;
                const list = d?.plan || [];
                list.forEach((t: any) => {
                    if (!t || !t.startDate) return;
                    const dObj = this.safeDate(t.startDate);
                    if (dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month) {
                        monthTasksToDelete.push(t);
                    }
                });
            });

            if (monthTasksToDelete.length > 0) {
                return await this.batchDeleteTasksThrottled(monthTasksToDelete);
            }
        } catch (e) {
            console.error('Lỗi khi xóa task từ CSDL:', e);
        }
        return 0;
    }

    async deleteDayTasksFromDB(year: number, month: number, day: number): Promise<number> {
        try {
            const dayStr = day.toString().padStart(2, '0');
            const monthStr = month.toString().padStart(2, '0');
            const targetDateIso = `${year}-${monthStr}-${dayStr}`;

            // Fetch fresh tasks directly from CouchDB server to ensure we get exact CouchDB _id and _rev
            const tasksRes: any = await firstValueFrom(this._tasksService.fetch({ username: this.user.name, year: year })).catch(() => null);
            let serverTasks: any[] = [];
            if (Array.isArray(tasksRes)) {
                serverTasks = tasksRes;
            } else if (tasksRes && Array.isArray(tasksRes.data)) {
                serverTasks = tasksRes.data;
            } else if (tasksRes && Array.isArray(tasksRes.result)) {
                serverTasks = tasksRes.result;
            }

            const dayTasksToDelete: any[] = [];
            
            // 1. Add matching server tasks that are not done
            serverTasks.forEach((t: any) => {
                if (!t || !t.startDate) return;
                const dObj = this.safeDate(t.startDate);
                if (!dObj) return;
                const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                if (dIso === targetDateIso && !this.isTaskDone(t)) {
                    dayTasksToDelete.push(t);
                }
            });

            // 2. Also add matching RAM tasks
            const sourceLists = [
                ...(this.items || []).flatMap((d: any) => d?.childrenItems?.[0]?.streamItems || (d?.domainData?.plan || [])),
                ...(this.allDomainsList || []).flatMap((d: any) => d?.plan || [])
            ];
            sourceLists.forEach((t: any) => {
                if (!t || !t.startDate) return;
                const dObj = this.safeDate(t.startDate);
                if (!dObj) return;
                const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                if (dIso === targetDateIso && !this.isTaskDone(t)) {
                    dayTasksToDelete.push(t);
                }
            });

            if (dayTasksToDelete.length > 0) {
                const count = await this.batchDeleteTasksThrottled(dayTasksToDelete);

                const taskIdsToRemove = new Set(dayTasksToDelete.map(t => String(t._id || t.id)).filter(Boolean));
                (this.items || []).forEach((domainItem: any) => {
                    const filterFn = (t: any) => {
                        if (!t || !t.startDate) return true;
                        const dObj = this.safeDate(t.startDate);
                        if (!dObj) return true;
                        const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                        if (dIso === targetDateIso && !this.isTaskDone(t)) return false;
                        return !taskIdsToRemove.has(String(t._id || t.id));
                    };
                    if (domainItem.streamItems) {
                        domainItem.streamItems = domainItem.streamItems.filter(filterFn);
                    }
                    if (domainItem.childrenItems?.[0]?.streamItems) {
                        domainItem.childrenItems[0].streamItems = domainItem.childrenItems[0].streamItems.filter(filterFn);
                    }
                    if (domainItem.domainData?.plan) {
                        domainItem.domainData.plan = domainItem.domainData.plan.filter(filterFn);
                    }
                });
                (this.allDomainsList || []).forEach((d: any) => {
                    const filterFn = (t: any) => {
                        if (!t || !t.startDate) return true;
                        const dObj = this.safeDate(t.startDate);
                        if (!dObj) return true;
                        const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                        if (dIso === targetDateIso && !this.isTaskDone(t)) return false;
                        return !taskIdsToRemove.has(String(t._id || t.id));
                    };
                    if (d.plan) {
                        d.plan = d.plan.filter(filterFn);
                    }
                });

                this.updateTotalSummaryRow();
                this.items = [...this.items];
                this.saveScriptState();
                this.cd.detectChanges();
                return count;
            }
        } catch (e) {
            console.error('Lỗi khi xóa task ngày từ CSDL:', e);
        }
        return 0;
    }

    async batchDeleteTasksThrottled(tasks: any[]): Promise<number> {
        if (!tasks || tasks.length === 0) return 0;
        const uniqueTasks = Array.from(new Set(tasks.map(t => t._id || t.id)))
            .map(id => tasks.find(t => (t._id || t.id) === id))
            .filter(Boolean);

        let deletedCount = 0;
        const chunkSize = 5;

        for (let i = 0; i < uniqueTasks.length; i += chunkSize) {
            const chunk = uniqueTasks.slice(i, i + chunkSize);
            await Promise.all(chunk.map(task => {
                return firstValueFrom(this._tasksService.delete({ username: this.user.name, task: task }))
                    .then(() => { deletedCount++; })
                    .catch(err => { console.warn('Lỗi xóa task CSDL:', err); });
            }));

            if (i + chunkSize < uniqueTasks.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        return deletedCount;
    }

    resetCurrentMonth(targetMonthParam?: number, targetYearParam?: number) {
        const currentMonth = targetMonthParam || this.month || (new Date().getMonth() + 1);
        const currentYear = targetYearParam || this.year || new Date().getFullYear();
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Khôi phục Mặc định',
            message: `Bạn có chắc chắn muốn xóa toàn bộ công việc trong tháng ${currentMonth}/${currentYear} không? Hành động này không thể hoàn tác!`,
            icon: { show: true, name: 'feather:alert-triangle', color: 'error' },
            actions: { confirm: { show: true, label: 'Xóa Tất Cả', color: 'warn' }, cancel: { show: true, label: 'Hủy' } },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                // Thu thập các task thuộc tháng mục tiêu trong bộ nhớ trước khi làm rỗng
                const monthTasksToDelete: any[] = [];
                for (const domain of this.items) {
                    if (!domain || domain.id === 'total-summary-row' || domain.id === 'monthly-total-summary-row') continue;
                    const streamItems = domain.childrenItems?.[0]?.streamItems || (domain.domainData?.plan || []);
                    streamItems.forEach((t: any) => {
                        if (!t || !t.startDate) return;
                        const dObj = this.safeDate(t.startDate);
                        if (dObj && dObj.getFullYear() === currentYear && (dObj.getMonth() + 1) === currentMonth) {
                            monthTasksToDelete.push(t);
                        }
                    });
                }

                // 1. Lọc bỏ các task của tháng mục tiêu trên giao diện TỨC THÌ (giữ lại các tháng khác)
                for (let i = 0; i < this.items.length; i++) {
                    const domain = this.items[i];
                    if (!domain || domain.id === 'total-summary-row' || domain.id === 'monthly-total-summary-row') continue;

                    const filterFn = (t: any) => {
                        if (!t || !t.startDate) return true;
                        const dObj = this.safeDate(t.startDate);
                        return !(dObj && dObj.getFullYear() === currentYear && (dObj.getMonth() + 1) === currentMonth);
                    };

                    if (domain.domainData && domain.domainData.plan) {
                        domain.domainData.plan = domain.domainData.plan.filter(filterFn);
                    }
                    if (domain.streamItems) {
                        domain.streamItems = domain.streamItems.filter(filterFn);
                    }
                    if (domain.childrenItems?.[0]?.streamItems) {
                        domain.childrenItems[0].streamItems = domain.childrenItems[0].streamItems.filter(filterFn);
                    }
                    this.applyPackedTasks(domain, domain.domainData?.plan || domain.childrenItems?.[0]?.streamItems || []);
                }

                // Xóa luôn plan trong bộ nhớ allDomainsList
                if (this.allDomainsList && this.allDomainsList.length > 0) {
                    this.allDomainsList.forEach((d: any) => {
                        if (d && d.plan && Array.isArray(d.plan)) {
                            d.plan = d.plan.filter((t: any) => {
                                if (!t || !t.startDate) return false;
                                const dObj = this.safeDate(t.startDate);
                                return dObj && (dObj.getFullYear() !== currentYear || (dObj.getMonth() + 1) !== currentMonth);
                            });
                        }
                    });
                }

                // Cập nhật lại toàn bộ giao diện lập tức không gọi API /tasks/all
                this.updateTotalSummaryRow();
                this.items = [...this.items];
                this.saveScriptState();
                this.cd.detectChanges();
                this.toastr.success(`Đã xóa sạch công việc tháng ${currentMonth}/${currentYear}!`);

                // 2. Xóa ngầm CSDL mà KHÔNG cần gọi lại API /tasks/all
                if (monthTasksToDelete.length > 0) {
                    this.batchDeleteTasksThrottled(monthTasksToDelete).catch(err => {
                        console.warn('Lỗi xóa task CSDL ngầm:', err);
                    });
                }
            }
        });
    }

    cleanText() { this.deleteSelectedRows(); }

    onToggleChange(event: MatSlideToggleChange): void {
        this.turnOffLiveStream = event.checked;
        if (this.turnOffLiveStream) this.liveWatchStart(); else this.liveWatchStop(false);
    }

    getProfilesRoot(): string {
        const stored = localStorage.getItem('opera_profiles_root');
        if (stored && stored.trim()) return stored.trim();
        return '';
    }

    isProfileRunning = false;

    getProfileName(): string {
        const stored = localStorage.getItem('selected_opera_profile');
        if (stored && stored.trim()) return stored.trim();
        return 'Profile000';
    }

    checkProfileRunningStatus(): void {
        const targetProfile = this.getProfileName();
        this._mxhautoService.profiles({
            profiles_root: this.getProfilesRoot(),
            host: '127.0.0.1',
            verify: true,
            username: this.user?.name || 'admin'
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                if (res && res.results && Array.isArray(res.results)) {
                    const p = res.results.find((x: any) => x.profile === targetProfile || x.name === targetProfile);
                    this.isProfileRunning = !!(p && (p.running || p.launched_new || p.ok));
                } else {
                    this.isProfileRunning = false;
                }
                if (!this.isProfileRunning && this.turnOffLiveStream) {
                    this.turnOffLiveStream = false;
                    this.liveStop$.next();
                }
                this.cd.markForCheck();
            },
            error: () => {
                this.isProfileRunning = false;
                this.cd.markForCheck();
            }
        });
    }

    updateRoomsList(newRooms: any[]): void {
        if (!newRooms || !Array.isArray(newRooms)) return;
        if (!this.rooms || !this.rooms.length) {
            this.rooms = [...newRooms];
            this.cd.markForCheck();
            return;
        }

        const existingMap = new Map<string, any>();
        for (const room of this.rooms) {
            const key = room?.id || room?.unique_id || room?.owner?.unique_id || room?.nickname;
            if (key) existingMap.set(String(key), room);
        }

        for (const newRoom of newRooms) {
            const key = newRoom?.id || newRoom?.unique_id || newRoom?.owner?.unique_id || newRoom?.nickname;
            if (key) {
                const keyStr = String(key);
                if (existingMap.has(keyStr)) {
                    Object.assign(existingMap.get(keyStr), newRoom);
                } else {
                    existingMap.set(keyStr, newRoom);
                }
            } else {
                this.rooms.push(newRoom);
            }
        }

        this.rooms = Array.from(existingMap.values());
        this.cd.markForCheck();
    }

    listLiveStream() { this._mxhautoService.listLiveStreasm({ "profile": this.getProfileName(), "profiles_root": this.getProfilesRoot(), "launch_if_needed": true, "live_url": "https://www.tiktok.com/live", "timeout": 0, "max_items": 500, "idle_sec": 10, "max_duration": 60, "username": this.user?.name || "admin" }); }
    liveWatchStart() { this._mxhautoService.liveWatchStart({ "profile": this.getProfileName(), "profiles_root": this.getProfilesRoot(), "launch_if_needed": true, "live_url": "https://www.tiktok.com/live", "interval_sec": 30 }).pipe(takeUntil(this._unsubscribeAll)).subscribe({ next: async (result: any) => { if (result && result.ok && result.watch_id) { this.toastr.success("Mở danh sách LiveStream."); localStorage.setItem('tiktok_watch_id', result.watch_id); this.liveStop$.next(); const totalSec = this.REFRESH_MS / 1000; const tick$ = timer(0, this.REFRESH_MS).pipe(shareReplay({ bufferSize: 1, refCount: true })); const data$ = tick$.pipe(switchMap(() => this.listLiveStream$().pipe(catchError(() => of({ rooms: [] })))), shareReplay({ bufferSize: 1, refCount: true })); data$.pipe(takeUntil(this.liveStop$), takeUntil(this._unsubscribeAll)).subscribe((res: any) => { if (res?.rooms && res.rooms.length > 0) { this.updateRoomsList(res.rooms); } }); this.countdown$ = data$.pipe(switchMap(() => interval(1000).pipe(startWith(0), map(i => Math.max(0, totalSec - i)), take(totalSec + 1))), shareReplay({ bufferSize: 1, refCount: true }), takeUntil(this.liveStop$), takeUntil(this._unsubscribeAll)) as Observable<number>; } }, error: () => { }, complete: () => { } }); }
    liveWatchStop(autorun?: boolean) { this.liveStop$.next(); this._mxhautoService.liveWatchStop({ "watch_id": localStorage.getItem('tiktok_watch_id'), "username": this.user?.name || "admin" }).pipe(takeUntil(this._unsubscribeAll)).subscribe({ next: async (result: any) => { if (result && result.ok) { this.job = null; this.toastr.warning("Tắt danh sách LiveStream."); if (autorun) { this.liveWatchStart(); } } }, error: () => { }, complete: () => { } }); }
    listLiveStream$() { return this._mxhautoService.listLiveStreasm({ "profile": this.getProfileName(), "profiles_root": this.getProfilesRoot(), "launch_if_needed": true, "live_url": "https://www.tiktok.com/live", "timeout": 0, "max_items": 500, "idle_sec": 10, "max_duration": 60, "username": this.user?.name || "admin" }); }
    activeHoverHls?: Hls;
    activeHoverRoom?: any;

    onRoomMouseEnter(room: any, videoEl: HTMLVideoElement): void {
        if (!room || !videoEl) return;
        this.onRoomMouseLeave(room);

        const hlsUrl = this.pickHlsUrlFromRoom(room);
        if (!hlsUrl) return;

        room._hovering = true;
        this.activeHoverRoom = room;

        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30
            });
            hls.loadSource(hlsUrl);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoEl.muted = false;
                videoEl.play().catch(() => {
                    videoEl.muted = true;
                    videoEl.play().catch(() => {});
                });
            });
            this.activeHoverHls = hls;
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = hlsUrl;
            videoEl.muted = false;
            videoEl.play().catch(() => {
                videoEl.muted = true;
                videoEl.play().catch(() => {});
            });
        }
    }

    onRoomMouseLeave(room: any): void {
        if (room) room._hovering = false;
        if (this.activeHoverHls) {
            try { this.activeHoverHls.destroy(); } catch (e) {}
            this.activeHoverHls = undefined;
        }
        this.activeHoverRoom = undefined;
    }

    playLiveStream(room: any) { }
    startLivestream(hlsUrl: string) { }
    stopPlayer() { this.destroyPlayer(); }

    // Video Helper
    private pickHlsUrlFromRoom(room: any): string | null { const candidates: string[] = []; const push = (u?: string | string[] | null) => { if (!u) return; const arr = Array.isArray(u) ? u : [u]; for (const x of arr) { if (this.isHls(x)) { const du = this.decodeUrl(x); if (!candidates.includes(du)) candidates.push(du); } } }; for (const raw of this.getRawStreamDataCandidates(room)) { try { const obj = this.ensureParsed(raw); const data = obj?.data || {}; for (const k of Object.keys(data)) { push(data[k]?.main?.hls); } } catch { } } for (const u of this.findAnyM3u8InObject(room)) push(u); try { const flv1 = room?.flv_pull_url || {}; Object.values(flv1).forEach((flv: any) => push(this.deriveHlsFromFlv(flv))); const flv2 = room?.stream_url?.flv_pull_url || {}; Object.values(flv2).forEach((flv: any) => push(this.deriveHlsFromFlv(flv))); push(this.deriveHlsFromFlv(room?.rtmp_pull_url)); push(this.deriveHlsFromFlv(room?.stream_url?.rtmp_pull_url)); } catch { } const defKey = room?.live_core_sdk_data?.pull_data?.options?.default_quality?.sdk_key || room?.stream_url?.live_core_sdk_data?.pull_data?.options?.default_quality?.sdk_key; const ranked = this.rankByQuality(candidates, (defKey ? [defKey] : []).concat(['origin', 'hd', 'sd', 'ld'])); return ranked[0] || candidates[0] || null; }
    private getRawStreamDataCandidates(room: any): any[] { const out: any[] = []; const a = room?.live_core_sdk_data?.pull_data?.stream_data; const b = room?.stream_url?.live_core_sdk_data?.pull_data?.stream_data; if (a) out.push(a); if (b) out.push(b); return out; }
    private ensureParsed(x: any): any { if (!x) return null; if (typeof x === 'string') { try { const once = JSON.parse(x); if (typeof once === 'string') { try { return JSON.parse(once); } catch { return once; } } return once; } catch { try { return JSON.parse(x.replace(/\\"/g, '"')); } catch { return x; } } } return x; }
    private decodeUrl(u: string): string { return u.replace(/\\u0026/g, '&').replace(/&amp;/g, '&'); }
    private isHls(u: any): u is string { return typeof u === 'string' && /\.m3u8(\?|$)/i.test(u); }
    private findAnyM3u8InObject(obj: any): string[] { const found: string[] = []; const seen = new Set<any>(); const visit = (val: any) => { if (val == null || seen.has(val)) return; seen.add(val); if (typeof val === 'string') { const s = this.decodeUrl(val); const re = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/ig; let m: RegExpExecArray | null; while ((m = re.exec(s))) { const url = m[0]; if (!found.includes(url)) found.push(url); } if (s.includes('{') && s.includes('}')) { try { visit(JSON.parse(s)); } catch { } } } else if (typeof val === 'object') { for (const v of Object.values(val)) visit(v); } }; visit(obj); return found; }
    private deriveHlsFromFlv(flvUrl?: string | null): string[] | null { if (!flvUrl || typeof flvUrl !== 'string') return null; const u = this.decodeUrl(flvUrl); if (!/\.flv(\?|$)/i.test(u) || /only_audio=1/i.test(u)) return null; const base = u.replace(/\/\/pull-flv-/i, '//pull-hls-'); const out: string[] = []; out.push(base.replace(/\.flv(\?|$)/i, '.m3u8$1')); const b2 = base.replace(/_(or\d+|hd|sd|ld)\.flv/i, '_$1/playlist.m3u8').replace(/\.flv(\?|$)/i, '/playlist.m3u8$1'); out.push(b2); return out.filter(x => this.isHls(x)).map(x => this.decodeUrl(x)); }
    private rankByQuality(urls: string[], preferOrder: string[]): string[] { const score = (u: string) => { const m = u.match(/_(or\d+|hd|sd|ld)(?:[/.])/i); const key = (m?.[1] || '').toLowerCase(); const idx = preferOrder.findIndex(k => k.toLowerCase() === key); return idx >= 0 ? idx : 999; }; return [...urls].sort((a, b) => score(a) - score(b)); }
    private destroyPlayer() { try { this.hls?.destroy(); } catch { } this.hls = undefined; if (this.videoEl?.parentElement) this.videoEl.parentElement.innerHTML = ''; this.videoEl = undefined; }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: (message) ? message : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: { show: true, name: 'feather:alert-triangle', color: 'error' },
            actions: { confirm: { show: true, label: 'Đóng', color: 'warn' }, cancel: { show: false, label: 'Đóng lại' } },
            dismissible: false
        });
        dialogRef.afterClosed().subscribe((_) => { this.router.navigate(['/tools']); });
    }

    clearChat() {
        this.chatHistory = [];
        this.cd.detectChanges();
    }

    stopChat() {
        this.isChatting = false;
        if (this._genaiService && typeof this._genaiService.cancelLocalAgent === 'function') {
            this._genaiService.cancelLocalAgent();
        }
        this.cd.detectChanges();
    }

    scrollToBottom() {
        setTimeout(() => {
            if (this.chatScroll && this.chatScroll.nativeElement) {
                this.chatScroll.nativeElement.scrollTop = this.chatScroll.nativeElement.scrollHeight;
            }
        }, 100);
    }

    applyPackedTasks(domainItem: any, plan: any[]) {
        if (!domainItem) return;
        const packed = this.packTasks(plan, domainItem.id);
        domainItem.streamItems = packed.streamItems;
        domainItem.childrenItems = packed.childrenItems;
        this.updateTotalSummaryRow();
    }

    updateTotalSummaryRow() {
        if (!this.items) return;

        const realDomainItems = this.items.filter(it => it && it.id !== 'total-summary-row' && it.id !== 'monthly-total-summary-row');

        const dayMap: { [key: string]: { tasks: any[]; sDate: Date; eDate: Date; seen: Set<string> } } = {};

        realDomainItems.forEach(domainItem => {
            let allStreamItems: any[] = [];
            if (domainItem.childrenItems && domainItem.childrenItems[0] && domainItem.childrenItems[0].streamItems && domainItem.childrenItems[0].streamItems.length > 0) {
                allStreamItems = domainItem.childrenItems[0].streamItems;
            } else if (domainItem.streamItems && domainItem.streamItems.length > 0) {
                allStreamItems = domainItem.streamItems;
            } else if (domainItem.domainData && domainItem.domainData.plan && Array.isArray(domainItem.domainData.plan)) {
                allStreamItems = domainItem.domainData.plan;
            }

            allStreamItems.forEach((st: any) => {
                let taskList: any[] = [];
                if (st.isGroup && st.tasks && st.tasks.length) {
                    taskList = st.tasks;
                } else if (!st.isGroup) {
                    taskList = [st];
                }

                taskList.forEach(t => {
                    if (!t || !t.startDate) return;
                    const sDateObj = this.safeDate(t.startDate);
                    if (isNaN(sDateObj.getTime())) return;
                    const dayKey = this.safeIsoDate(sDateObj);

                    if (!dayMap[dayKey]) {
                        const sDate = new Date(sDateObj.getTime());
                        sDate.setHours(8, 0, 0, 0);
                        const eDate = new Date(sDateObj.getTime());
                        eDate.setHours(17, 0, 0, 0);
                        dayMap[dayKey] = { tasks: [], sDate, eDate, seen: new Set<string>() };
                    }

                    // Khử trùng bằng Set (O(1)) thay cho .some() lồng nhau (O(n²)) khi số công việc lớn
                    const day = dayMap[dayKey];
                    const idKey = t.id ? `id:${t.id}` : '';
                    const revKey = t._id ? `_id:${t._id}` : '';
                    const nameKey = typeof t.startDate === 'string' ? `n:${t.name}|${t.startDate}` : '';
                    if ((idKey && day.seen.has(idKey)) || (revKey && day.seen.has(revKey)) || (nameKey && day.seen.has(nameKey))) {
                        return;
                    }
                    if (idKey) day.seen.add(idKey);
                    if (revKey) day.seen.add(revKey);
                    if (nameKey) day.seen.add(nameKey);
                    day.tasks.push(t);
                });
            });
        });

        const totalStreamItems: any[] = [];
        const allMonthTasks: any[] = [];
        let monthStart: Date | null = null;
        let monthEnd: Date | null = null;

        Object.keys(dayMap).forEach(dayKey => {
            const dayData = dayMap[dayKey];
            const count = dayData.tasks.length;
            if (count > 0) {
                allMonthTasks.push(...dayData.tasks);
                if (!monthStart || dayData.sDate < monthStart) monthStart = dayData.sDate;
                if (!monthEnd || dayData.eDate > monthEnd) monthEnd = dayData.eDate;

                totalStreamItems.push({
                    id: `total-summary-${dayKey}`,
                    name: `${count} công việc`,
                    isGroup: true,
                    isTotalSummaryRow: true,
                    startDate: dayData.sDate,
                    endDate: dayData.eDate,
                    tasks: dayData.tasks,
                    taskCount: count,
                    domainId: 'total-summary-row'
                });
            }
        });

        totalStreamItems.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        const summaryRow = {
            id: 'total-summary-row',
            name: 'Tổng công việc ngày',
            isTotalRow: true,
            streamItems: totalStreamItems,
            childrenItems: []
        };

        // Group tasks by month to create 1 total bar per month
        const monthGroups: { [key: string]: { monthName: string; monthNumber: number; yearNumber: number; startDate: Date; endDate: Date; tasks: any[] } } = {};

        const startRange = this.timelineStartDate || (allMonthTasks.length > 0 ? new Date(Math.min(...allMonthTasks.map(t => this.safeDate(t.startDate)?.getTime() || Date.now()))) : new Date());
        const endRange = this.timelineEndDate || (allMonthTasks.length > 0 ? new Date(Math.max(...allMonthTasks.map(t => this.safeDate(t.endDate || t.startDate)?.getTime() || Date.now()))) : new Date());

        let cur = new Date(startRange.getFullYear(), startRange.getMonth(), 1);
        const last = new Date(endRange.getFullYear(), endRange.getMonth(), 1);

        while (cur <= last) {
            const y = cur.getFullYear();
            const m = cur.getMonth();
            const key = `${y}-${m + 1}`;
            const mStart = new Date(y, m, 1, 0, 15, 0);
            const mEnd = new Date(y, m + 1, 0, 23, 45, 0);
            const monthLabel = `Tháng ${m + 1}`;

            monthGroups[key] = {
                monthName: monthLabel,
                monthNumber: m + 1,
                yearNumber: y,
                startDate: mStart,
                endDate: mEnd,
                tasks: []
            };

            cur = new Date(y, m + 1, 1);
        }

        allMonthTasks.forEach(t => {
            const d = this.safeDate(t.startDate);
            if (d) {
                const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                if (monthGroups[key]) {
                    monthGroups[key].tasks.push(t);
                }
            }
        });

        const monthlyStreamItems: any[] = [];
        let colorIdx = 0;
        Object.keys(monthGroups).forEach(key => {
            const mg = monthGroups[key];
            const currentIdx = colorIdx % 6;
            colorIdx++;

            if (mg.tasks && mg.tasks.length > 0) {
                let minTime = Infinity;
                let maxTime = -Infinity;

                mg.tasks.forEach(t => {
                    const s = this.safeDate(t.startDate);
                    const e = t.endDate ? this.safeDate(t.endDate) : s;
                    if (s && !isNaN(s.getTime())) {
                        if (s.getTime() < minTime) minTime = s.getTime();
                    }
                    if (e && !isNaN(e.getTime())) {
                        if (e.getTime() > maxTime) maxTime = e.getTime();
                    }
                });

                const barStart = (minTime !== Infinity) ? new Date(minTime) : mg.startDate;
                let barEnd = (maxTime !== -Infinity) ? new Date(maxTime) : mg.endDate;

                if (barEnd.getTime() <= barStart.getTime()) {
                    barEnd = new Date(barStart.getTime() + 2 * 3600 * 1000);
                }

                monthlyStreamItems.push({
                    id: `monthly-total-bar-${key}`,
                    name: `${mg.monthName}: ${mg.tasks.length} công việc`,
                    isGroup: true,
                    isMonthlyTotalBar: true,
                    colorIndex: currentIdx,
                    startDate: barStart,
                    endDate: barEnd,
                    tasks: mg.tasks,
                    taskCount: mg.tasks.length,
                    monthLabel: mg.monthName,
                    monthNumber: mg.monthNumber,
                    yearNumber: mg.yearNumber,
                    domainId: 'monthly-total-summary-row'
                });
            }
        });

        const currentViewMonth = this.month || (new Date().getMonth() + 1);
        const currentViewYear = this.year || new Date().getFullYear();
        const tasksInCurrentViewMonth = allMonthTasks.filter(t => {
            const d = this.safeDate(t.startDate);
            return d && d.getFullYear() === currentViewYear && (d.getMonth() + 1) === currentViewMonth;
        });

        const monthlySummaryRow = {
            id: 'monthly-total-summary-row',
            name: `Tổng công việc Tháng ${currentViewMonth.toString().padStart(2, '0')}/${currentViewYear} (${tasksInCurrentViewMonth.length})`,
            isTotalRow: true,
            isMonthlyTotalRow: true,
            streamItems: monthlyStreamItems,
            childrenItems: []
        };

        this.items = [...realDomainItems, summaryRow, monthlySummaryRow];
    }

    getMonthlyBarBg(item: any): string {
        if (!item || !item.isMonthlyTotalBar) return '';
        return '#7c3aed'; // Solid Rich Purple for all monthly total bars
    }

    packTasks(tasks: any[], parentId: string | number) {
        if (!tasks || !tasks.length) return { streamItems: [], childrenItems: [] };

        const validTasks: any[] = [];
        for (const t of tasks) {
            if (!t) continue;
            const startDate = this.safeDate(t.startDate);
            if (isNaN(startDate.getTime())) continue;

            let endDate = t.endDate ? this.safeDate(t.endDate) : new Date(startDate.getTime() + 2 * 3600 * 1000);
            if (isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
                endDate = new Date(startDate.getTime() + 2 * 3600 * 1000);
            }

            validTasks.push({
                ...t,
                startDate,
                endDate
            });
        }

        if (!validTasks.length) return { streamItems: [], childrenItems: [] };

        // Group tasks by day (YYYY-MM-DD)
        const dayGroups: { [key: string]: any[] } = {};
        validTasks.forEach(t => {
            const dayKey = this.safeIsoDate(t.startDate);
            if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
            dayGroups[dayKey].push(t);
        });

        const parentStreamItems: any[] = [];

        Object.keys(dayGroups).forEach(dayKey => {
            const dayTasks = dayGroups[dayKey];
            dayTasks.sort((a, b) => {
                const ta = this.safeDate(a.startDate)?.getTime() || 0;
                const tb = this.safeDate(b.startDate)?.getTime() || 0;
                return ta - tb;
            });
            const count = dayTasks.length;
            const allLoading = dayTasks.every(t => t.isLoading);
            const someLoading = dayTasks.some(t => t.isLoading);
            
            const baseDate = this.safeDate(dayTasks[0].startDate);
            const sDate = new Date(baseDate.getTime());
            sDate.setHours(8, 0, 0, 0);

            const eDate = new Date(baseDate.getTime());
            eDate.setHours(allLoading ? 18 : 17, 0, 0, 0);

            if (count === 1) {
                const t = { ...dayTasks[0] };
                t.startDate = sDate;
                t.endDate = eDate;
                t.isGroup = false;
                parentStreamItems.push(t);
            } else {
                dayTasks.forEach((t, idx) => {
                    t.taskIndex = idx + 1;
                    t.isGroup = false;
                });
                
                parentStreamItems.push({
                    id: `${parentId}-${dayKey}-group`,
                    name: allLoading ? 'Đang tạo' : `${count} công việc`,
                    isGroup: !allLoading,
                    isLoading: someLoading,
                    startDate: sDate,
                    endDate: eDate,
                    tasks: dayTasks,
                    taskCount: count,
                    domainId: parentId
                });
            }
        });

        parentStreamItems.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        parentStreamItems.forEach((item, index) => {
            if (!item.isGroup) {
                item.taskIndex = index + 1;
            }
        });

        return { streamItems: parentStreamItems, childrenItems: [] };
    }

    onChatInput(event: any, inputEl: any) {
        const val = inputEl.value || '';
        const lastAt = val.lastIndexOf('@');
        
        if (lastAt !== -1) {
            const query = val.substring(lastAt + 1).toLowerCase();
            this.filteredMentionOptions = this.mentionOptions.filter(m => m.id.toLowerCase().includes(query));
            this.showMentions = this.filteredMentionOptions.length > 0;
            this.mentionIndex = 0;
        } else {
            this.showMentions = false;
        }
        this.cd.detectChanges();
    }

    onChatKeyDown(event: KeyboardEvent, inputEl: any) {
        if (this.showMentions) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.mentionIndex = (this.mentionIndex + 1) % this.filteredMentionOptions.length;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.mentionIndex = (this.mentionIndex - 1 + this.filteredMentionOptions.length) % this.filteredMentionOptions.length;
            } else if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (this.filteredMentionOptions.length > 0) {
                    this.ignoreNextEnter = true;
                    this.selectMention(this.filteredMentionOptions[this.mentionIndex], inputEl);
                    setTimeout(() => this.ignoreNextEnter = false, 100);
                }
            } else if (event.key === 'Escape') {
                this.showMentions = false;
                this.cd.detectChanges();
            }
        }
    }

    selectMention(option: any, inputEl: any) {
        const val = inputEl.value || '';
        const lastAt = val.lastIndexOf('@');
        if (lastAt !== -1) {
            const newVal = val.substring(0, lastAt) + '@' + option.id + ' ';
            this.chatPrompt = newVal;
            inputEl.value = newVal;
            inputEl.dispatchEvent(new Event('input'));
        }
        inputEl.focus();
        this.showMentions = false;
        this.cd.detectChanges();
    }

    attachedFile: any = null;

    onFileSelected(event: any) {
        const file: File = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                this.attachedFile = {
                    name: file.name,
                    type: file.type || 'text/plain',
                    base64: base64
                };
                this.toastr.success(`Đã đính kèm tệp: ${file.name}`);
            };
            reader.readAsDataURL(file);
        }
        event.target.value = '';
    }

    // -----------------------------------------------------------------------------------------------------
    // @ NEW: Hỗ trợ phân tách và định dạng dàn ý cho màn hình Soạn bài
    // -----------------------------------------------------------------------------------------------------
    cleanArticleJsonString(text: string): string {
        if (!text) return '';
        let cleaned = text.trim();
        const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (jsonBlockMatch && jsonBlockMatch[1]) {
            cleaned = jsonBlockMatch[1].trim();
        } else {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
            }
        }
        return cleaned;
    }

    parseArticleDataSafely(rawText: string, fallbackTitle: string = 'Bài viết mới'): any {
        if (!rawText) return { title: fallbackTitle, content: '', script: '', description: '', image_prompt: '', tags: [] };
        
        // 1. Thử parse JSON hoàn chỉnh
        const cleaned = this.cleanArticleJsonString(rawText);
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') {
                return {
                    title: parsed.title || fallbackTitle,
                    content: parsed.content || '',
                    script: parsed.script || '',
                    description: parsed.description || '',
                    image_prompt: parsed.image_prompt || '',
                    tags: Array.isArray(parsed.tags) ? parsed.tags : []
                };
            }
        } catch (e) {}

        // 2. Thử bóc tách từng trường qua Regex (nếu JSON bị cắt đuôi hoặc bị lỗi format)
        let title = fallbackTitle;
        let content = '';
        let script = '';
        let description = '';
        let imagePrompt = '';

        const titleMatch = rawText.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
        if (titleMatch && titleMatch[1]) {
            try {
                title = JSON.parse(`"${titleMatch[1]}"`);
            } catch (e) {
                title = titleMatch[1].replace(/\\"/g, '"');
            }
        }

        const descMatch = rawText.match(/"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
        if (descMatch && descMatch[1]) {
            try {
                description = JSON.parse(`"${descMatch[1]}"`);
            } catch (e) {
                description = descMatch[1].replace(/\\"/g, '"');
            }
        }

        const imgMatch = rawText.match(/"image_prompt"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
        if (imgMatch && imgMatch[1]) {
            try {
                imagePrompt = JSON.parse(`"${imgMatch[1]}"`);
            } catch (e) {
                imagePrompt = imgMatch[1].replace(/\\"/g, '"');
            }
        }

        // Bóc tách content
        const contentMatch = rawText.match(/"content"\s*:\s*"([\s\S]+?)(?=(?:",\s*"(?:description|image_prompt|tags|title|script)"|"\s*\}|$))/i);
        if (contentMatch && contentMatch[1]) {
            let rawContentStr = contentMatch[1];
            if (rawContentStr.endsWith('"')) {
                rawContentStr = rawContentStr.slice(0, -1);
            }
            try {
                content = JSON.parse(`"${rawContentStr.replace(/"/g, '\\"').replace(/\\"/g, '\\"')}"`);
            } catch (e) {
                content = rawContentStr
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '')
                    .replace(/\\t/g, ' ')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
            }
        }

        // Bóc tách script
        const scriptMatch = rawText.match(/"script"\s*:\s*"([\s\S]+?)(?=(?:",\s*"(?:description|image_prompt|tags|title|content)"|"\s*\}|$))/i);
        if (scriptMatch && scriptMatch[1]) {
            let rawScriptStr = scriptMatch[1];
            if (rawScriptStr.endsWith('"')) {
                rawScriptStr = rawScriptStr.slice(0, -1);
            }
            try {
                script = JSON.parse(`"${rawScriptStr.replace(/"/g, '\\"').replace(/\\"/g, '\\"')}"`);
            } catch (e) {
                script = rawScriptStr
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '')
                    .replace(/\\t/g, ' ')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
            }
        }

        // 3. Fallback: Nếu không bóc tách được content từ JSON, dùng toàn bộ rawText nếu nó chứa HTML hoặc text tự do
        if (!content && !script) {
            let stripped = rawText.trim();
            if (stripped.startsWith('{') && stripped.length < 10) {
                content = '';
            } else {
                content = stripped.replace(/```(?:html|json)?/gi, '').replace(/```/g, '').trim();
            }
        }

        return {
            title: title || fallbackTitle,
            content: content || '',
            script: script || '',
            description: description || '',
            image_prompt: imagePrompt || '',
            tags: []
        };
    }

    splitContentToBlocks(content: any): string[] {
        if (!content) return [];
        let html = '';
        if (Array.isArray(content)) {
            html = content.join('\n');
        } else {
            html = String(content);
        }

        html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
        if (!html) return [];

        const blocks: string[] = [];

        // Thử parse bằng DOMParser
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const body = doc.body;

            if (body && body.children && body.children.length > 0) {
                Array.from(body.children).forEach(child => {
                    const tag = child.tagName.toLowerCase();
                    const inner = child.innerHTML.trim();
                    if (!inner && !['img', 'iframe', 'hr', 'br'].includes(tag)) return;

                    if (tag === 'p') {
                        const id = child.getAttribute('id') || `source-p-${uuid.v4()}`;
                        blocks.push(`<p id="${id}">${inner}</p>`);
                    } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                        blocks.push(`<${tag}>${inner}</${tag}>`);
                    } else if (['ul', 'ol', 'blockquote', 'div', 'table', 'pre', 'figure'].includes(tag)) {
                        blocks.push(child.outerHTML);
                    } else {
                        blocks.push(`<p id="source-p-${uuid.v4()}">${child.outerHTML}</p>`);
                    }
                });
            }
        } catch (e) {}

        // Nếu DOMParser không tách được hoặc nội dung là text thuần / Markdown
        if (blocks.length === 0) {
            const lines = html.split(/\r?\n\r?\n|\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            lines.forEach(l => {
                if (/^##\s+/.test(l)) {
                    blocks.push(`<h2>${l.replace(/^##\s+/, '').trim()}</h2>`);
                } else if (/^###\s+/.test(l)) {
                    blocks.push(`<h3>${l.replace(/^###\s+/, '').trim()}</h3>`);
                } else if (/^#\s+/.test(l)) {
                    blocks.push(`<h1>${l.replace(/^#\s+/, '').trim()}</h1>`);
                } else if (/^<(p|h[1-6]|div|ul|ol|li|blockquote|table|pre|figure)\b/i.test(l)) {
                    if (/^<p\b/i.test(l) && !l.includes('id=')) {
                        blocks.push(l.replace(/^<p\b/i, `<p id="source-p-${uuid.v4()}"`));
                    } else {
                        blocks.push(l);
                    }
                } else {
                    blocks.push(`<p id="source-p-${uuid.v4()}">${l}</p>`);
                }
            });
        }

        return blocks;
    }

    buildArchivePayload(params: {
        uuid?: string;
        title: string;
        content: string;
        description: string;
        image_prompt: string;
        tags?: string[];
        domainData: any;
        rawUrl?: string;
        taskId?: string;
    }): any {
        const targetUuid =
            params.uuid || uuid.v4().replace(/-/g, '').substring(0, 10);
        const title = params.title || 'Bài viết mới';
        const rawContent = params.content || '';
        const description = params.description || '';
        const imagePrompt = params.image_prompt || '';
        const domainData = params.domainData || {};
        const taskId = params.taskId || null;
        const tags = params.tags || [];

        const blocks = this.splitContentToBlocks(rawContent);
        const doneParagraphs: string[] = [];
        const trashHeadings: string[] = [];
        const sourceP: string[] = [];
        const sourceH2: string[] = [];
        const sourceH: string[] = [];

        blocks.forEach(b => {
            const clean = b.trim();
            if (!clean) return;

            if (/^<h2\b/i.test(clean)) {
                sourceH2.push(clean);
                sourceH.push(clean);
                doneParagraphs.push(clean);
            } else if (/^<h[1-6]\b/i.test(clean)) {
                sourceH.push(clean);
                doneParagraphs.push(clean);
            } else if (/^<p\b/i.test(clean)) {
                sourceP.push(clean);
                doneParagraphs.push(clean);
            } else {
                const wrapped = `<p id="source-p-${uuid.v4()}">${clean}</p>`;
                sourceP.push(wrapped);
                doneParagraphs.push(wrapped);
            }
        });

        // Fallback nếu không có đoạn văn nào
        if (doneParagraphs.length === 0 && rawContent) {
            const fallbackP = `<p id="source-p-${uuid.v4()}">${rawContent}</p>`;
            doneParagraphs.push(fallbackP);
            sourceP.push(fallbackP);
        }

        const wordCount = rawContent.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0).length;
        const prePrompt = imagePrompt ? [`<p id="source-pre-${uuid.v4()}">${imagePrompt}</p>`] : [];
        const promptList = description ? [`<p id="source-prompt-${uuid.v4()}">${description}</p>`] : (title ? [`<p id="source-prompt-${uuid.v4()}">${title}</p>`] : []);

        return {
            uuid: targetUuid,
            title: title,
            url: params.rawUrl || (taskId ? String(taskId) : ('draft_' + Date.now() + Math.floor(Math.random() * 1000))),
            content: rawContent || doneParagraphs.join('\n\n'),
            description: description,
            source: {
                p: sourceP,
                span: [],
                li: [],
                i: [],
                dd: [],
                td: [],
                label: [],
                h1: [],
                h2: sourceH2,
                h3: [],
                h4: [],
                h5: [],
                a: [],
                table: [],
                img: [],
                audios: [],
                source: [],
                iframe: [],
                pre: prePrompt,
                prompt: promptList,
                word: [],
                chatgpt: [],
                text: [],
                empty: [],
                backup: blocks.length > 0 ? blocks : (rawContent ? [rawContent] : []),
                playlist: [
                    {
                        youtube: [],
                        tiktok: [],
                        facebook: [],
                    },
                    {
                        mp3: [],
                    },
                ],
                type: 'html',
                synonyms: [],
                keyword: tags.join(', '),
                wp_post_id: null,
                wp_domain: domainData.domain || '',
                wpPosts: [],
                nodes: [],
                totalNodes: 1,
                wp_task_id: taskId
            },
            done: doneParagraphs,
            trash: [],
            seo: {
                mainkey: title,
                title: { length: title.length, text: title, words: title.split(/\s+/).length, characters: title.length, findmainkey: 0 },
                description: { length: description.length, text: description, words: description.split(/\s+/).length, characters: description.length, findmainkey: 0 },
                links: 0,
                words: { basic: wordCount, total: wordCount, find_mainkey_in_first_paragraph: 0, find_mainkey_in_words: 0, mainkey_percent_in_words: 0 },
                images: { total: 0, alt: 0, find_mainkey_in_alt: 0 },
                heading: {
                    h1: { total: 0, keys: [] },
                    h2: { total: sourceH2.length, keys: [] },
                    h3: { total: 0, keys: [] },
                    h4: { total: 0, keys: [] }
                },
                kw: []
            },
            arr_keyword: tags,
            tags: tags,
            domain: domainData.domain || domainData.name || 'https://type.vn',
            username: this.user?.name || 'admin',
            thumbnail: imagePrompt
        };
    }

    // -----------------------------------------------------------------------------------------------------
    // @ NEW: Tự động lưu vào Soạn bài
    // -----------------------------------------------------------------------------------------------------
    saveDraftsToAiWriter(drafts: any[]) {
        if (!drafts || drafts.length === 0) return;

        const eligibleDrafts = drafts.filter((draft: any) => {
            const draftDomainKey = this.normalizeDomainKey(draft?.domain);
            if (!draftDomainKey) return false;
            return this.isDomainAutoWriteEnabled(draftDomainKey);
        });

        if (eligibleDrafts.length === 0) {
            this.toastr.warning('Không có bài viết nào được lưu vì tên miền tương ứng chưa được tích chọn viết bài tự động.');
            return;
        }

        this.toastr.info(`Đang lưu ${eligibleDrafts.length} bài viết vào Soạn bài...`, 'Đang xử lý');
        let savedCount = 0;
        
        eligibleDrafts.forEach(async draft => {
            const draftDomainName = this.normalizeDomainKey(draft.domain);
            let matchedItem = this.items?.find((i: any) => {
                if (!i || i.isTotalRow) return false;
                const dName = this.normalizeDomainKey(i.name);
                return dName === draftDomainName;
            });
            
            let domainData = matchedItem?.domainData || { domain: draft.domain || '' };
            
            let archivePayload = this.buildArchivePayload({
                title: draft.title || 'Bài viết mới',
                content: draft.content || '',
                description: draft.description || '',
                image_prompt: draft.image_prompt || '',
                tags: draft.tags || [],
                domainData: domainData,
                taskId: draft.task_id || null
            });

            try {
                const res: any = await firstValueFrom(this._crawlService.storeArchive(archivePayload));
                if (res && res.success) {
                    savedCount++;
                    
                    // Mark task as done if task_id is provided or title matches
                    if (domainData.plan) {
                        let targetTask = null;
                        if (draft.task_id) {
                            targetTask = domainData.plan.find((t: any) => t.id == draft.task_id || t._id == draft.task_id);
                        }
                        
                        if (!targetTask) {
                            // Fallback matching by title
                            const dTitle = (draft.title || '').toLowerCase().trim();
                            targetTask = domainData.plan.find((t: any) => {
                                const tName = (t.name || '').toLowerCase().trim();
                                return tName && dTitle && (tName.includes(dTitle) || dTitle.includes(tName));
                            });
                        }
                        
                        if (targetTask) {
                            targetTask.done = true;
                            // Trigger view update
                            if (matchedItem) {
                                this.applyPackedTasks(matchedItem, domainData.plan);
                                this.items = [...this.items];
                                this.cd.detectChanges();
                            }
                            // Save task to database
                            this._tasksService.edit({
                                username: this.user.name,
                                task: targetTask
                            }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
                        }
                    }

                    if (savedCount === eligibleDrafts.length) {
                        this.toastr.success(`Đã lưu thành công ${savedCount} bài viết vào kho Soạn bài!`);
                        const successMsg = `Dạ Sếp ơi, em đã tự động lưu thành công ${savedCount} bài viết vào kho Soạn bài rồi nhé!`;
                        this.chatHistory.push({ role: 'model', content: `✅ ${successMsg.replace('vào kho Soạn bài', 'vào kho **Soạn bài** (Dàn ý)')}` });
                        if (window.speechSynthesis) {
                            const utterance = new SpeechSynthesisUtterance(successMsg);
                            utterance.lang = 'vi-VN';
                            utterance.rate = 1.25;
                            window.speechSynthesis.speak(utterance);
                        }
                        this.cd.detectChanges();
                        this.scrollToBottom();
                    }
                } else {
                    this.toastr.error('Lỗi khi lưu bài: ' + draft.title);
                }
            } catch (e) {
                this.toastr.error('Lỗi khi gọi API lưu bài: ' + draft.title);
            }
        });
    }

    get promptSuggestions(): { label: string; text: string; icon: string }[] {
        const now = new Date();
        const dayStr = now.getDate().toString().padStart(2, '0');
        const nowMonthStr = (now.getMonth() + 1).toString().padStart(2, '0');
        const activeMonth = this.month || (now.getMonth() + 1);
        const activeYear = this.year || now.getFullYear();
        const monthStr = activeMonth.toString().padStart(2, '0');
        const year = activeYear;

        const nextMonthDate = new Date(activeYear, activeMonth, 1);
        const nextMonthStr = (nextMonthDate.getMonth() + 1).toString().padStart(2, '0');
        const nextMonthYear = nextMonthDate.getFullYear();

        return [
            {
                label: `Viết blog chuẩn SEO ngày ${dayStr}/${nowMonthStr}`,
                text: `Viết bài blog chi tiết dựa trên tasks ngày ${dayStr}/${nowMonthStr}`,
                icon: 'heroicons_outline:document-text'
            },
            {
                label: `Tạo công việc tháng ${nextMonthStr}`,
                text: `Tạo và phân bổ công việc tháng ${nextMonthStr}/${nextMonthYear} cho tất cả các tên miền`,
                icon: 'heroicons_outline:calendar'
            },
            {
                label: `Xóa công việc tháng ${monthStr}`,
                text: `Xóa toàn bộ công việc tháng ${monthStr}/${year}`,
                icon: 'heroicons_outline:trash'
            },
            {
                label: `Xóa công việc tháng ${nextMonthStr}`,
                text: `Xóa toàn bộ công việc tháng ${nextMonthStr}/${nextMonthYear}`,
                icon: 'heroicons_outline:trash'
            },
            {
                label: `Cập nhật công việc ngày ${dayStr}/${nowMonthStr}`,
                text: `Cập nhật công việc ngày ${dayStr}/${nowMonthStr} cho tất cả tên miền`,
                icon: 'heroicons_outline:refresh'
            },
            {
                label: `Phân bổ công việc tháng ${monthStr}`,
                text: `Tạo công việc tháng ${monthStr}/${year}`,
                icon: 'heroicons_outline:sparkles'
            }
        ];
    }

    usePromptSuggestion(text: string) {
        this.chatPrompt = text;
        this.isChatFocused = true;
        this.isChatOpened = true;
        this.cd.detectChanges();
    }

    async sendChat(event?: Event) {
        if (event) {
            event.preventDefault();
        }
        if (!this.chatPrompt || !this.chatPrompt.trim() || this.isChatting) return;

        // Giao diện không còn bị khóa khi đang nạp dữ liệu, nhưng lệnh AI phải chờ đủ công việc của tháng
        // để tránh tạo trùng / đếm sai số công việc đã có.
        if (this.isLoadingSchedule || this.isLoadingMonth) {
            this.toastr.info(
                'Đang nạp xong dữ liệu công việc của tháng, vui lòng gửi lại sau giây lát.',
                'Đang đồng bộ'
            );
            return;
        }

        let userMessage = this.chatPrompt.trim();
        this.chatPrompt = '';

        // Check for @mentions navigation
        const matchedMention = this.mentionOptions.find(m => userMessage.includes('@' + m.id));
        if (matchedMention) {
            userMessage = userMessage.replace('@' + matchedMention.id, '').trim();
            const currentContext = this._globalAgentService.getContext();
            const isAlreadyOnTarget = currentContext && currentContext.sourcePage && currentContext.sourcePage.toLowerCase().includes(matchedMention.id.toLowerCase());
            
            if (!isAlreadyOnTarget) {
                if (matchedMention.panel) {
                    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
                        this.router.navigate([matchedMention.url], { state: { panel: matchedMention.panel } });
                    });
                } else {
                    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
                        this.router.navigate([matchedMention.url]);
                    });
                }
                return;
            }
        }

        if (!userMessage) return;

        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.chatHistory.push({ role: 'user', content: userMessage, time: nowTime });
        this.scrollToBottom();

        this.isChatting = true;
        this.cd.detectChanges();

        try {
            const isBlogWritingIntent = this.isContentWritingCommand(userMessage);

            if (isBlogWritingIntent) {
                // Phân tích ngày mục tiêu từ câu lệnh người dùng (hỗ trợ dd/mm, dd-mm, ngày dd tháng mm, ngày dd, hôm nay, ngày mai)
                const nowDate = new Date();
                let targetDay = nowDate.getDate();
                let targetMonth = nowDate.getMonth() + 1;
                let targetYear = nowDate.getFullYear();

                const slashDateMatch = userMessage.match(
                    /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])(?:[\/\-](\d{4}))?\b/
                );
                const textDateMatch = userMessage.match(
                    /ngày\s*(0?[1-9]|[12]\d|3[01])\s*tháng\s*(0?[1-9]|1[0-2])(?:\s*năm\s*(\d{4}))?/i
                );
                const dayOnlyMatch = userMessage.match(
                    /(?:ngày|cho\s+ngày)\s*(0?[1-9]|[12]\d|3[01])\b/i
                );
                const isTomorrow = /\b(?:ngày\s+mai|mai)\b/i.test(userMessage);

                if (slashDateMatch) {
                    targetDay = parseInt(slashDateMatch[1], 10);
                    targetMonth = parseInt(slashDateMatch[2], 10);
                    if (slashDateMatch[3]) {
                        targetYear = parseInt(slashDateMatch[3], 10);
                    } else if (this.year && targetMonth === this.month) {
                        targetYear = this.year;
                    }
                } else if (textDateMatch) {
                    targetDay = parseInt(textDateMatch[1], 10);
                    targetMonth = parseInt(textDateMatch[2], 10);
                    if (textDateMatch[3]) {
                        targetYear = parseInt(textDateMatch[3], 10);
                    } else if (this.year && targetMonth === this.month) {
                        targetYear = this.year;
                    }
                } else if (dayOnlyMatch) {
                    targetDay = parseInt(dayOnlyMatch[1], 10);
                    targetMonth = this.month || nowDate.getMonth() + 1;
                    targetYear = this.year || nowDate.getFullYear();
                } else if (isTomorrow) {
                    const tmr = new Date(nowDate);
                    tmr.setDate(tmr.getDate() + 1);
                    targetDay = tmr.getDate();
                    targetMonth = tmr.getMonth() + 1;
                    targetYear = tmr.getFullYear();
                }

                const dayStr = targetDay.toString().padStart(2, '0');
                const monthStr = targetMonth.toString().padStart(2, '0');
                const targetDateIso = `${targetYear}-${monthStr}-${dayStr}`;
                const targetDateLocal = `${dayStr}/${monthStr}/${targetYear}`;

                const realDomainItems = (this.items || []).filter(
                    (d: any) =>
                        d &&
                        !d.isTotalRow &&
                        d.id !== 'total-summary-row' &&
                        d.id !== 'monthly-total-summary-row'
                );
                if (
                    realDomainItems.length > 0 &&
                    realDomainItems.every((d: any) => !this.isDomainAutoWriteEnabled(d))
                ) {
                    this.chatHistory.push({
                        role: 'model',
                        content: `Dạ Sếp ơi, hiện chưa có tên miền nào được tích chọn viết bài tự động ở cột **Công việc** bên trái. Sếp vui lòng tích chọn checkbox ở đằng trước các tên miền muốn xử lý rồi thử lại nhé!`
                    });
                    this.isChatting = false;
                    this.cd.detectChanges();
                    this.scrollToBottom();
                    return;
                }

                // 1. Thu thập chính xác danh sách công việc trong ngày từ từng tên miền (giải nén đầy đủ group items)
                const pendingCheckedDayTasks: any[] = [];
                const allCheckedDayTasks: any[] = [];
                const seenCheckedKeys = new Set<string>();
                const seenSkippedKeys = new Set<string>();
                const skippedDomainNames = new Set<string>();
                let skippedUncheckedCount = 0;

                realDomainItems.forEach((d: any) => {
                    const domainName =
                        d.domainData?.domain || d.name || d.domainData?.name || '';
                    const normDom = this.normalizeDomainKey(domainName);
                    if (!normDom) return;

                    let flatTasks = this.getFlatDomainTasks(d);
                    if (flatTasks.length === 0 && Array.isArray(this.allDomainsList)) {
                        const fallbackDom = this.allDomainsList.find(
                            (ad: any) =>
                                ad &&
                                this.normalizeDomainKey(ad.domain || ad.name) === normDom
                        );
                        if (fallbackDom && Array.isArray(fallbackDom.plan)) {
                            flatTasks = fallbackDom.plan.filter(
                                (t: any) => t && !t.isLoading
                            );
                        }
                    }

                    const isEnabled = this.isDomainAutoWriteEnabled(d);
                    flatTasks.forEach((t: any, idx: number) => {
                        if (!t || !t.startDate) return;
                        if (this.safeIsoDate(t.startDate) !== targetDateIso) return;
                        const uniqueKey = `${normDom}::${
                            t._id || t.id || `${idx}_${t.name || ''}`
                        }`;

                        if (!isEnabled) {
                            if (!this.isTaskDone(t) && !seenSkippedKeys.has(uniqueKey)) {
                                seenSkippedKeys.add(uniqueKey);
                                skippedUncheckedCount++;
                                skippedDomainNames.add(this.cleanDomain(domainName));
                            }
                            return;
                        }

                        if (!seenCheckedKeys.has(uniqueKey)) {
                            seenCheckedKeys.add(uniqueKey);
                            const wrappedTask = {
                                ...t,
                                domain: domainName,
                                originalTask: t
                            };
                            allCheckedDayTasks.push(wrappedTask);
                            if (!this.isTaskDone(t)) {
                                pendingCheckedDayTasks.push(wrappedTask);
                            }
                        }
                    });
                });

                // 2. Fallback truy vấn CSDL nếu trong RAM chưa nạp tháng mục tiêu
                if (
                    allCheckedDayTasks.length === 0 &&
                    skippedUncheckedCount === 0 &&
                    this._tasksService
                ) {
                    try {
                        const serverRes: any = await firstValueFrom(
                            this._tasksService.fetch({
                                username: this.user?.name || 'admin',
                                year: targetYear,
                                month: targetMonth,
                                onlySelectedMonth: true
                            })
                        ).catch(() => null);
                        let serverTasks: any[] = [];
                        if (Array.isArray(serverRes)) serverTasks = serverRes;
                        else if (serverRes && Array.isArray(serverRes.data))
                            serverTasks = serverRes.data;
                        else if (serverRes && Array.isArray(serverRes.result))
                            serverTasks = serverRes.result;

                        serverTasks.forEach((st: any, idx: number) => {
                            if (!st || !st.startDate) return;
                            if (this.safeIsoDate(st.startDate) !== targetDateIso)
                                return;
                            const taskDomain =
                                st.domain || st.domain_id || st.domainName || '';
                            const normDom = this.normalizeDomainKey(taskDomain);
                            if (!normDom) return;
                            const uniqueKey = `${normDom}::${
                                st._id || st.id || `${idx}_${st.name || ''}`
                            }`;

                            if (!this.isDomainAutoWriteEnabled(taskDomain)) {
                                if (
                                    !this.isTaskDone(st) &&
                                    !seenSkippedKeys.has(uniqueKey)
                                ) {
                                    seenSkippedKeys.add(uniqueKey);
                                    skippedUncheckedCount++;
                                    skippedDomainNames.add(
                                        this.cleanDomain(taskDomain)
                                    );
                                }
                                return;
                            }

                            if (!seenCheckedKeys.has(uniqueKey)) {
                                seenCheckedKeys.add(uniqueKey);
                                const wrapped = {
                                    ...st,
                                    domain: taskDomain,
                                    originalTask: st
                                };
                                allCheckedDayTasks.push(wrapped);
                                if (!this.isTaskDone(st)) {
                                    pendingCheckedDayTasks.push(wrapped);
                                }
                            }
                        });
                    } catch (e) {
                        console.error(
                            'Lỗi khi nạp task từ CSDL phục vụ viết bài/kịch bản:',
                            e
                        );
                    }
                }

                const isExplicitRewrite = /(?:viết|soạn|tạo|làm|dựng|sinh|chạy)\s+lại/i.test(
                    userMessage
                );
                const isCustomTopicOrScript =
                    this.isScriptWritingCommand(userMessage) ||
                    !/viết\s+bài\s+blog\s+chi\s+tiết\s+dựa\s+trên\s+tasks/i.test(
                        userMessage
                    );

                let tasksToProcess = pendingCheckedDayTasks;
                if (
                    tasksToProcess.length === 0 &&
                    allCheckedDayTasks.length > 0 &&
                    (isExplicitRewrite || isCustomTopicOrScript)
                ) {
                    tasksToProcess = allCheckedDayTasks;
                }

                // Nếu ngày đó hoàn toàn chưa có công việc nào trên lịch cho các tên miền đã chọn, tự động đề xuất danh sách công việc kèm nút xác nhận viết & lưu CSDL
                if (
                    tasksToProcess.length === 0 &&
                    allCheckedDayTasks.length === 0 &&
                    skippedUncheckedCount === 0
                ) {
                    await this.executeDayTaskGeneration(
                        targetYear,
                        targetMonth,
                        targetDay,
                        userMessage
                    );
                    return;
                }

                if (tasksToProcess.length === 0) {
                    if (skippedUncheckedCount > 0) {
                        const skippedListText =
                            Array.from(skippedDomainNames).join(', ');
                        this.chatHistory.push({
                            role: 'model',
                            content: `Dạ Sếp ơi, ngày **${targetDateLocal}** không có công việc nào thuộc các tên miền được tích chọn (đã bỏ qua **${skippedUncheckedCount} công việc** của tên miền chưa chọn: **${skippedListText}**). Sếp vui lòng tích chọn checkbox trước tên miền muốn thực thi nhé!`
                        });
                    } else {
                        this.chatHistory.push({
                            role: 'model',
                            content: `Dạ Sếp ơi, tất cả công việc ngày **${targetDateLocal}** đều đã hoàn thành rồi ạ! Nếu muốn viết mới đè lên, Sếp nhắn **"Viết lại bài ngày ${dayStr}/${monthStr}"** nhé!`
                        });
                    }
                    this.isChatting = false;
                    this.cd.detectChanges();
                    this.scrollToBottom();
                    return;
                }

                await this.writeAndSaveContentForTasks(
                    tasksToProcess,
                    targetDateLocal,
                    userMessage,
                    skippedUncheckedCount
                );
                return;
            }

            // Chuẩn bị nội dung gửi đi
            let contents = this.chatHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));
            
            let contextData: any[] = [];
            // Nếu có task đang chọn, tiêm dữ liệu vào prompt cuối cùng
            if (contents.length > 0) {
                const lastMsg = contents[contents.length - 1];
                if (lastMsg.role === 'user') {
                    if (this.editingItem) {
                        lastMsg.parts[0].text = `THÔNG TIN CÔNG VIỆC HIỆN TẠI ĐANG CHỌN:
\`\`\`json
{
  "id": "${this.editingItem.id}",
  "name": "${this.editingItem.name}",
  "meta": "${this.editingItem.meta || ''}",
  "startDate": "${this.safeIsoString(this.editingItem.startDate)}",
  "endDate": "${this.safeIsoString(this.editingItem.endDate)}"
}
\`\`\`

YÊU CẦU CỦA NGƯỜI DÙNG:
${userMessage}

HƯỚNG DẪN TRẢ LỜI:
Bạn là trợ lý AI quản lý lịch công việc. Người dùng muốn chỉnh sửa công việc này.
BẠN PHẢI TRẢ VỀ DUY NHẤT MỘT OBJECT JSON, KHÔNG KÈM THEO BẤT KỲ VĂN BẢN GIẢI THÍCH NÀO KHÁC.
Object JSON phải có cấu trúc y hệt trên, chứa nội dung đã sửa. Bạn có thể sửa thời gian startDate, endDate nếu cần.`;
                    } else {
                        // Lấy ngày mục tiêu từ câu chat của user để tính chính xác
                        let targetDate = new Date();
                        const dayMonthSlashMatch = userMessage.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b/) 
                            || userMessage.match(/ngày\s*(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?/i);
                        const dayMonthTextMatch = userMessage.match(/ngày\s*(0?[1-9]|[12]\d|3[01])\s*tháng\s*(0?[1-9]|1[0-2])(?:\s*năm\s*(\d{4}))?/i);
                        const dayOnlyMatch = userMessage.match(/(?:ngày|cho ngày|ngày thứ)\s*(0?[1-9]|[12]\d|3[01])\b/i);

                        const monthYearMatch = userMessage.match(/(?:tháng\s*|\b)(0?[1-9]|1[0-2])\/(\d{4})\b/i);
                        const monthWordMatch = userMessage.match(/tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?/i);

                        let isMonthRequest = false;
                        let isDayRequest = false;
                        let requestDay = 1;
                        let requestMonth = new Date().getMonth() + 1;
                        let requestYear = new Date().getFullYear();

                        const isTodayMention = userMessage.match(/(hôm nay|ngày hôm nay|nay)/i);
                        const isTomorrowMention = userMessage.match(/(ngày mai|mai)/i);

                        if (dayMonthSlashMatch) {
                            isDayRequest = true;
                            requestDay = parseInt(dayMonthSlashMatch[1], 10);
                            requestMonth = parseInt(dayMonthSlashMatch[2], 10);
                            if (dayMonthSlashMatch[3]) {
                                requestYear = parseInt(dayMonthSlashMatch[3], 10);
                            }
                            targetDate = new Date(requestYear, requestMonth - 1, requestDay);
                        } else if (dayMonthTextMatch) {
                            isDayRequest = true;
                            requestDay = parseInt(dayMonthTextMatch[1], 10);
                            requestMonth = parseInt(dayMonthTextMatch[2], 10);
                            if (dayMonthTextMatch[3]) {
                                requestYear = parseInt(dayMonthTextMatch[3], 10);
                            }
                            targetDate = new Date(requestYear, requestMonth - 1, requestDay);
                        } else if (dayOnlyMatch) {
                            isDayRequest = true;
                            requestDay = parseInt(dayOnlyMatch[1], 10);
                            const now = new Date();
                            requestMonth = now.getMonth() + 1;
                            requestYear = now.getFullYear();
                            targetDate = new Date(requestYear, requestMonth - 1, requestDay);
                        } else if (isTodayMention) {
                            isDayRequest = true;
                            const now = new Date();
                            requestDay = now.getDate();
                            requestMonth = now.getMonth() + 1;
                            requestYear = now.getFullYear();
                            targetDate = now;
                        } else if (isTomorrowMention) {
                            isDayRequest = true;
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            requestDay = tomorrow.getDate();
                            requestMonth = tomorrow.getMonth() + 1;
                            requestYear = tomorrow.getFullYear();
                            targetDate = tomorrow;
                        } else if (monthYearMatch) {
                            isMonthRequest = true;
                            requestMonth = parseInt(monthYearMatch[1], 10);
                            requestYear = parseInt(monthYearMatch[2], 10);
                            const now = new Date();
                            if (requestYear === now.getFullYear() && requestMonth === now.getMonth() + 1) {
                                targetDate = new Date();
                            } else {
                                targetDate = new Date(requestYear, requestMonth - 1, 1);
                            }
                        } else if (monthWordMatch) {
                            isMonthRequest = true;
                            requestMonth = parseInt(monthWordMatch[1], 10);
                            requestYear = monthWordMatch[2] ? parseInt(monthWordMatch[2], 10) : targetDate.getFullYear();
                            const now = new Date();
                            if (requestYear === now.getFullYear() && requestMonth === now.getMonth() + 1) {
                                targetDate = new Date();
                            } else {
                                targetDate = new Date(requestYear, requestMonth - 1, 1);
                            }
                        }

                        const isDeleteMonthIntent = !!userMessage.match(/(?:xóa|xoa|clear|reset|hủy|huy)\s*(?:toàn bộ\s*|sạch\s*|hết\s*)?(?:công việc|task|tasks|lịch)?\s*tháng\s*(\d{1,2})(?:[\/\-](\d{4}))?/i);
                        if (isDeleteMonthIntent) {
                            const delMatch = userMessage.match(/tháng\s*(\d{1,2})(?:[\/\-](\d{4}))?/i);
                            const delMonth = delMatch ? parseInt(delMatch[1], 10) : (this.month || (new Date().getMonth() + 1));
                            const delYear = delMatch && delMatch[2] ? parseInt(delMatch[2], 10) : new Date().getFullYear();

                            this.resetCurrentMonth(delMonth, delYear);
                            this.isChatting = false;
                            this.cd.detectChanges();
                            this.scrollToBottom();
                            return;
                        }

                        // BẮT BUỘC hiển thị Thẻ Xác Nhận Kế Hoạch đối với lệnh tạo/sửa công việc (ngoại trừ lệnh viết blog)
                        const isTaskCreateIntent = (isDayRequest 
                            || isMonthRequest 
                            || !!userMessage.match(/(tạo công việc|chỉnh sửa|sửa task|lên lịch|phân bổ|sinh task|tạo mới|cập nhật công việc|đổi|làm task|thêm task|xóa task|sắp xếp|tạo lại)/i))
                            && !isBlogWritingIntent;

                        if (isTaskCreateIntent && !isMonthRequest && !isDayRequest) {
                            isMonthRequest = true; // Mặc định đề xuất kế hoạch tháng hiện tại
                            requestMonth = new Date().getMonth() + 1;
                            requestYear = new Date().getFullYear();
                        }

                        if (isMonthRequest && isTaskCreateIntent) {
                            const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                            const realTimelineItems = Array.isArray(this.items)
                                ? this.items.filter(
                                      (item: any) =>
                                          item &&
                                          !item.isTotalRow &&
                                          item.id !== 'total-summary-row' &&
                                          item.id !== 'monthly-total-summary-row'
                                  )
                                : [];
                            const baseDomains =
                                realTimelineItems.length > 0
                                    ? realTimelineItems
                                    : (this.allDomainsList || []).map((d: any, i: number) => ({
                                          id: i,
                                          name: d.domain || d.name,
                                          autoWrite: d.autoWrite,
                                          domainData: d,
                                          childrenItems: [{ streamItems: d.plan || [] }]
                                      }));
                            const validDomains = baseDomains.filter((item: any) =>
                                this.isDomainAutoWriteEnabled(item)
                            );
                            const monthStr = requestMonth.toString().padStart(2, '0');

                            if (validDomains.length === 0) {
                                this.toastr.warning(
                                    'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái trước khi tạo công việc!',
                                    'Chưa chọn tên miền'
                                );
                                this.chatHistory.push({
                                    role: 'model',
                                    content: `⚠️ **Chưa chọn tên miền thực thi**: Báo cáo Sếp, hiện chưa có tên miền nào được tích chọn ở cột **Công việc** bên trái. Sếp vui lòng tích chọn các tên miền muốn tạo công việc rồi gửi lại yêu cầu nhé!`,
                                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                });
                                this.isChatting = false;
                                this.cd.detectChanges();
                                this.scrollToBottom();
                                return;
                            }

                            const now = new Date();
                            const startDay = (requestYear === now.getFullYear() && requestMonth === (now.getMonth() + 1)) ? now.getDate() : 1;
                            
                            let workingDaysLeft = 0;
                            for (let i = startDay; i <= daysInMonth; i++) {
                                const checkDate = `${requestYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
                                if (!this.disabledDates.has(checkDate)) {
                                    workingDaysLeft++;
                                }
                            }

                            let totalMonthlyTargetSum = 0;
                            let totalCreatedTasksSum = 0;
                            let totalMissingTasksSum = 0;

                            const domainRows = validDomains.map((item: any) => {
                                const rawName = (item.name || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
                                const monthlyTarget = item.domainData?.monthlyTarget || this.getResolvedTarget(item.name, requestMonth, requestYear) || 0;
                                const allDomainPlan = (this.allDomainsList || []).find(
                                    (d: any) => this.normalizeDomainKey(d?.domain || d?.name) === this.normalizeDomainKey(rawName)
                                )?.plan;
                                const streamItems =
                                    requestMonth === this.month && requestYear === this.year
                                        ? item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || [])
                                        : allDomainPlan || item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || []);
                                
                                const doneTasksInMonth = streamItems.filter((t: any) => {
                                    if (!t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    return dObj && dObj.getFullYear() === requestYear && (dObj.getMonth() + 1) === requestMonth && this.isTaskDone(t);
                                }).length;

                                const createdTasksInMonth = streamItems.filter((t: any) => {
                                    if (!t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    return dObj && dObj.getFullYear() === requestYear && (dObj.getMonth() + 1) === requestMonth;
                                }).length;

                                const missingTasksToCreate = Math.max(0, monthlyTarget - doneTasksInMonth);
                                const dailyTarget = monthlyTarget > 0 ? (workingDaysLeft > 0 ? Math.ceil(missingTasksToCreate / workingDaysLeft) : missingTasksToCreate) : 0;

                                totalMonthlyTargetSum += monthlyTarget;
                                totalCreatedTasksSum += createdTasksInMonth;
                                totalMissingTasksSum += missingTasksToCreate;

                                return `| \`${rawName}\` | ${createdTasksInMonth} bài (${doneTasksInMonth} bài đã xong) | **${missingTasksToCreate} bài** |`;
                            });

                            const domainTopicsList = validDomains.map((item: any) => {
                                const dData = item.domainData || {};
                                let style = dData.writingStyle;
                                if (!style && this.settings?.domainStyles) {
                                    style = this.settings.domainStyles[dData.domain || item.name];
                                }
                                const styleInfo = style ? `Phong cách: **${style}**` : 'Nội dung SEO chuyên sâu';
                                const noteInfo = dData.note ? ` | Ghi chú: *${dData.note}*` : '';
                                return `- **\`${item.name}\`**: ${styleInfo}${noteInfo}. Tất cả tiêu đề bài viết sẽ được sinh đúng chuyên môn ngách, tối ưu SEO và rải đều khung giờ 08:00 - 17:00 các ngày làm việc.`;
                            }).join('\n');

                            const confirmContent = `🤖 **KẾ HOẠCH CHI TIẾT TẠO LỊCH THÁNG ${monthStr}/${requestYear}**

### 📊 1. Tổng quan kế hoạch hệ thống:
- 📅 **Thời gian áp dụng**: **01/${monthStr}/${requestYear}** đến **${daysInMonth}/${monthStr}/${requestYear}**
- ⏳ **Số ngày làm việc thực tế**: **${workingDaysLeft} ngày** (đã loại trừ các ngày nghỉ/bỏ qua)
- 🎯 **Tổng chỉ tiêu tên miền đã chọn**: **${totalMonthlyTargetSum} bài** (${validDomains.length} Tên miền)
- 📝 **Số bài đã lên lịch sẵn**: **${totalCreatedTasksSum} bài**
- 🚀 **Số bài bắt buộc tạo mới**: **${totalMissingTasksSum} bài**

---

### 📋 2. Chi tiết phân bổ chỉ tiêu theo từng Tên miền (Domain):

| Tên miền | Đã có | Cần tạo |
|---|:---:|:---:|
${domainRows.join('\n')}

---

### 📝 3. Định hướng chủ đề & Nội dung bài viết chi tiết từng Tên miền:

${domainTopicsList}

---

👉 *Em đã sổ toàn bộ kế hoạch trên khung chat để Sếp duyệt. Sếp kiểm tra xong bấm nút bên dưới để em tiến hành sinh kịch bản ngay nhé!*`;

                            const selectedDomains = validDomains
                                .map((item: any) => this.normalizeDomainKey(item?.domainData?.domain || item?.name))
                                .filter(Boolean);

                            this.chatHistory.push({
                                role: 'model',
                                content: confirmContent,
                                isConfirmMessage: true,
                                confirmData: { type: 'month', month: requestMonth, year: requestYear, selectedDomains }
                            });
                            this.isChatting = false;
                            this.cd.detectChanges();
                            this.scrollToBottom();
                            return;
                        }

                        if (isDayRequest && isTaskCreateIntent) {
                            const dayStr = requestDay.toString().padStart(2, '0');
                            const monthStr = requestMonth.toString().padStart(2, '0');
                            const dateIsoStr = `${requestYear}-${monthStr}-${dayStr}`;

                            const todayObj = new Date();
                            todayObj.setHours(0, 0, 0, 0);
                            const targetDateObj = new Date(requestYear, requestMonth - 1, requestDay, 0, 0, 0, 0);
                            const isPastDay = targetDateObj.getTime() < todayObj.getTime();
                            const isDisabledDay = this.disabledDates.has(dateIsoStr);

                            if (isPastDay || isDisabledDay) {
                                let rejectReason = '';
                                if (isPastDay && isDisabledDay) {
                                    rejectReason = `ngày **${dayStr}/${monthStr}/${requestYear}** vừa là **ngày đã qua trong quá khứ**, vừa đang được tích **"Bỏ qua"**`;
                                } else if (isPastDay) {
                                    rejectReason = `ngày **${dayStr}/${monthStr}/${requestYear}** là **ngày đã qua trong quá khứ**`;
                                } else {
                                    rejectReason = `ngày **${dayStr}/${monthStr}/${requestYear}** đang được tích **"Bỏ qua"**`;
                                }

                                this.chatHistory.push({
                                    role: 'model',
                                    content: `❌ **Không thể tạo/chỉnh sửa công việc**: Báo cáo Sếp, ${rejectReason} nên em không thể tạo hoặc chỉnh sửa công việc cho ngày này được ạ! Sếp vui lòng chọn một ngày từ hôm nay trở đi và chưa bị tích "Bỏ qua" nhé! 😊`,
                                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                });
                                this.isChatting = false;
                                this.cd.detectChanges();
                                this.scrollToBottom();
                                return;
                            }

                            const selectedDomainKeys = this.getSelectedAutoWriteDomainKeys();
                            if (selectedDomainKeys.size === 0) {
                                this.toastr.warning(
                                    'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái trước khi tạo công việc!',
                                    'Chưa chọn tên miền'
                                );
                                this.chatHistory.push({
                                    role: 'model',
                                    content: `⚠️ **Chưa chọn tên miền thực thi**: Báo cáo Sếp, hiện chưa có tên miền nào được tích chọn ở cột **Công việc** bên trái. Sếp vui lòng tích chọn các tên miền muốn tạo công việc rồi gửi lại yêu cầu nhé!`,
                                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                });
                                this.isChatting = false;
                                this.cd.detectChanges();
                                this.scrollToBottom();
                                return;
                            }

                            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            this.chatHistory.push({
                                role: 'model',
                                content: `🚀 Dạ Sếp! Em đang tiến hành dọn dẹp và gọi AI Agent phân tích để tạo mới / cập nhật lại công việc ngày **${dayStr}/${monthStr}/${requestYear}** cho **${selectedDomainKeys.size} tên miền đã chọn**...`,
                                time: nowTime
                            });
                            this.cd.detectChanges();
                            this.scrollToBottom();

                            await this.executeDayTaskGeneration(requestYear, requestMonth, requestDay, userMessage);
                            return;
                        }

                        if (!this.items) {
                            const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                            const validDomains = (this.allDomainsList || []).filter((d: any) => this.isDomainAutoWriteEnabled(d));
                            const totalDomains = validDomains.length;
                            const monthStr = requestMonth.toString().padStart(2, '0');

                            if (totalDomains === 0) {
                                this.toastr.warning(
                                    'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái trước khi tạo công việc!',
                                    'Chưa chọn tên miền'
                                );
                                this.chatHistory.push({
                                    role: 'model',
                                    content: `⚠️ **Chưa chọn tên miền thực thi**: Sếp vui lòng tích chọn ít nhất 1 tên miền ở cột **Công việc** bên trái trước khi tạo lịch nhé!`
                                });
                                this.isChatting = false;
                                this.cd.detectChanges();
                                this.scrollToBottom();
                                return;
                            }

                            const confirmContent = `🤖 **Xác nhận phương án tạo lịch tự động**

Em đã phân tích và chuẩn hóa kế hoạch xử lý cho **Tháng ${monthStr}/${requestYear}** như sau:

- 📅 **Thời gian áp dụng**: Từ **01/${monthStr}/${requestYear}** đến **${daysInMonth}/${monthStr}/${requestYear}**
- 🌐 **Quy mô thực thi**: **${totalDomains} Tên miền đã chọn**
- 🎯 **Quy tắc phân bổ**: Tự động tính số bài thiếu, phân bổ đều theo số ngày làm việc thực tế còn lại (đã trừ các ngày nghỉ/bỏ qua).

👉 *Sếp bấm nút xác nhận bên dưới để em bắt đầu khởi chạy kịch bản tạo lịch nhé!*`;

                            this.chatHistory.push({
                                role: 'model',
                                content: confirmContent,
                                isConfirmMessage: true,
                                confirmData: {
                                    month: requestMonth,
                                    year: requestYear,
                                    selectedDomains: validDomains
                                        .map((d: any) => this.normalizeDomainKey(d?.domain || d?.name))
                                        .filter(Boolean)
                                }
                            });
                            this.isChatting = false;
                            this.cd.detectChanges();
                            this.scrollToBottom();
                            return;
                        }

                        const enabledItemsForContext = this.items.filter(
                            (d: any) =>
                                d &&
                                !d.isTotalRow &&
                                d.id !== 'total-summary-row' &&
                                d.id !== 'monthly-total-summary-row' &&
                                this.isDomainAutoWriteEnabled(d)
                        );

                        if ((isTaskCreateIntent || isBlogWritingIntent) && enabledItemsForContext.length === 0) {
                            this.toastr.warning(
                                'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái!',
                                'Chưa chọn tên miền'
                            );
                            this.chatHistory.push({
                                role: 'model',
                                content: `⚠️ **Chưa chọn tên miền thực thi**: Báo cáo Sếp, hiện chưa có tên miền nào được tích chọn ở cột **Công việc** bên trái. Sếp vui lòng tích chọn các tên miền muốn xử lý rồi gửi lại yêu cầu nhé!`,
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            });
                            this.isChatting = false;
                            this.cd.detectChanges();
                            this.scrollToBottom();
                            return;
                        }

                        contextData = enabledItemsForContext.map((d: any) => {
                            const currentMonth = targetDate.getMonth() + 1;
                            const currentYear = targetDate.getFullYear();
                            this.month = currentMonth;
                            this.updateTimeline3MonthsRange(currentMonth);

                            const monthlyTarget = d.domainData?.monthlyTarget || this.getResolvedTarget(d.name, currentMonth, currentYear) || 0;
                            const streamItems = d.childrenItems?.[0]?.streamItems || (d.domainData?.plan || []);
                            
                            // TH1 - Đếm từ đầu tháng tới cuối tháng đó xem đã có bao nhiêu tasks được tạo ra rồi
                            const createdTasksInMonth = streamItems.filter((t: any) => {
                                if (!t.startDate) return false;
                                const dObj = this.safeDate(t.startDate);
                                return dObj && dObj.getFullYear() === currentYear && (dObj.getMonth() + 1) === currentMonth;
                            }).length;
                            
                            // TH1 - Xác định ngày bắt đầu tính (nếu tháng hiện tại thì tính từ hôm nay, nếu tháng khác thì từ ngày 1) đến cuối tháng, trừ các ngày bỏ qua
                            const now = new Date();
                            const startDay = (currentYear === now.getFullYear() && currentMonth === (now.getMonth() + 1)) ? now.getDate() : 1;
                            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
                            
                            let workingDaysLeft = 0;
                            for (let i = startDay; i <= daysInMonth; i++) {
                                const checkDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
                                if (!this.disabledDates.has(checkDate)) {
                                    workingDaysLeft++;
                                }
                            }
                            
                            let finalMonthlyTarget = monthlyTarget;
                            const targetMatch = userMessage.match(/(?:chỉ tiêu|mục tiêu|lấy).*?(\d+)\s*(?:bài|task|công việc)/i) || userMessage.match(/(\d+)\s*bài/i);
                            if (targetMatch) {
                                finalMonthlyTarget = parseInt(targetMatch[1]);
                                if (d.domainData) {
                                    d.domainData.monthlyTarget = finalMonthlyTarget;
                                }
                            }
                            
                            let finalRemainingDays = workingDaysLeft;
                            const daysMatch = userMessage.match(/(?:chia|còn|trong).*?(\d+)\s*ngày/i);
                            if (daysMatch) {
                                finalRemainingDays = parseInt(daysMatch[1]);
                            }
                            
                            // TH1 - Tính số tasks bắt buộc phải tạo thêm = Chỉ tiêu tháng - Bài đã tạo trong tháng
                            const missingTasksToCreate = Math.max(0, finalMonthlyTarget - createdTasksInMonth);
                            const dailyTarget = finalMonthlyTarget > 0 ? (finalRemainingDays > 0 ? Math.ceil(missingTasksToCreate / finalRemainingDays) : missingTasksToCreate) : 0;

                            let writingStyleInfo = 'Phong cách tự do';
                            let domainWritingStyle = d.domainData?.writingStyle;
                            if (!domainWritingStyle && this.settings?.domainStyles) {
                                domainWritingStyle = this.settings.domainStyles[d.domainData?.domain || d.name];
                            }
                            
                            if (domainWritingStyle && this.settings?.styles) {
                                const style = this.settings.styles.find((s: any) => s.name === domainWritingStyle || s.id === domainWritingStyle);
                                if (style) {
                                    writingStyleInfo = `${style.name}: ${style.desc}`;
                                }
                            }

                            return {
                                domain: d.name,
                                autoWrite: this.isDomainAutoWriteEnabled(d),
                                monthlyTarget: finalMonthlyTarget,
                                createdTasksInMonth: createdTasksInMonth,
                                missingTasksToCreate: missingTasksToCreate,
                                workingDaysLeft: finalRemainingDays,
                                dailyTarget: dailyTarget,
                                aiAnalysis: d.domainData?.note || 'Chưa có phân tích',
                                writingStyle: writingStyleInfo,
                                tasks: streamItems.map((t: any) => {
                                    const tzOffsetStr = (date: any) => {
                                        const d = this.safeDate(date);
                                        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, -5);
                                    };
                                    return {
                                        id: t.id,
                                        name: t.name,
                                        meta: t.meta || '',
                                        startDate: tzOffsetStr(t.startDate),
                                        endDate: tzOffsetStr(t.endDate)
                                    };
                                }) || []
                            };
                        });

                        const tzOffset = -(new Date().getTimezoneOffset() / 60);
                        const tzString = tzOffset >= 0 ? '+' + tzOffset : tzOffset;
                        const todayStr = new Date().toLocaleDateString('vi-VN');
                        const todayIso = new Date().toISOString().slice(0, 10);
                        const disabledStr = Array.from(this.disabledDates).filter(d => d >= todayIso).join(', ');

                        // Tạo instruction động dựa trên yêu cầu của sếp
                        let generateInstruction = '';
                        const isExactDate = userMessage.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b/);
                        const isMonth = userMessage.match(/tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?/i);
                        
                        if (isExactDate && !isMonth) {
                            generateInstruction = `- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH (VD: "hôm nay làm gì", "xem lịch"): Đọc dữ liệu JSON bên trên và kể tên các công việc bằng chữ. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Phần block code JSON bắt buộc phải trả về mảng rỗng: \`\`\`json\n[]\n\`\`\`.
- NẾU NGƯỜI DÙNG YÊU CẦU SỬA/TẠO MỚI/LÊN LỊCH CHO 1 NGÀY CỤ THỂ: Bạn BẮT BUỘC chỉ tạo ĐÚNG [dailyTarget] task cho duy nhất ngày đó (không tạo cho ngày khác). TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP SỬA HOẶC XÓA DỮ LIỆU/CÔNG VIỆC CỦA CÁC THÁNG TRƯỚC HẶC CÁC NGÀY KHÁC.`;
                        } else {
                            generateInstruction = `- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH (VD: "có lịch gì", "làm gì"): Đọc dữ liệu JSON bên trên và liệt kê công việc. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Trả về JSON rỗng \`\`\`json\n[]\n\`\`\`.
- NẾU NGƯỜI DÙNG YÊU CẦU TẠO/SỬA/LÊN LỊCH CHO THÁNG: Bạn BẮT BUỘC chỉ tạo/cập nhật công việc thuộc ĐÚNG tháng đó. TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP SỬA HOẶC XÓA DỮ LIỆU/CÔNG VIỆC CỦA CÁC THÁNG TRƯỚC (Ví dụ: khi đang tạo hay chỉnh sửa công việc tháng 8 thì KHÔNG ĐƯỢC XÓA hay THAY ĐỔI bất kỳ công việc nào của tháng 7 hoặc các tháng trước đó). Mọi công việc của tháng trước phải được giữ nguyên 100%.`;
                        }

                        lastMsg.parts[0].text = `DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI (Hôm nay là: ${todayStr}):
\`\`\`json
${JSON.stringify(contextData, null, 2)}
\`\`\`

YÊU CẦU CỦA NGƯỜI DÙNG:
${userMessage}

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc. Người dùng muốn sửa hoặc thêm dữ liệu JSON lịch.
BẠN HÃY TRÒ CHUYỆN VỚI NGƯỜI DÙNG Ở ĐẦU HOẶC CUỐI CÂU TRẢ LỜI BẰNG GIỌNG ĐIỆU VUI VẺ, THÂN THIỆN, CÓ SỬ DỤNG EMOJI (ĐÓNG VAI LÀ TRỢ LÝ ĐÁNG YÊU, GỌI NGƯỜI DÙNG LÀ SẾP). TUY NHIÊN, DỮ LIỆU CÔNG VIỆC BẮT BUỘC PHẢI ĐƯỢC ĐẶT BÊN TRONG BLOCK CODE MẶC ĐỊNH LÀ \`\`\`json [ ... ] \`\`\`.
Mảng JSON phải có cấu trúc gồm danh sách các domain và các task bên trong. 
LƯU Ý QUAN TRỌNG VỀ SỐ LƯỢNG TÁC VỤ:
- Hệ thống ĐÃ TỰ ĐỘNG TÍNH TOÁN số lượng tác vụ cần tạo MỖI NGÀY và truyền vào trường "dailyTarget" cho từng tên miền, đồng thời tính số ngày làm việc còn lại trong tháng vào trường "remainingDays".
- Nếu dailyTarget <= 0: Tuyệt đối không tạo thêm task cho domain đó.
- BẮT BUỘC ĐỌC kỹ trường "writingStyle" và "aiAnalysis" (nếu có) của từng tên miền. Bạn PHẢI áp dụng "writingStyle" (phong cách viết) vào nội dung và cách diễn đạt. Hãy nghĩ ra tiêu đề (name) và mô tả (meta) thật CỤ THỂ, ĐA DẠNG và ĐÚNG CHUYÊN MÔN / NGÁCH của tên miền đó.
- LƯU Ý ĐẶC BIỆT VỀ NỘI DUNG VÀ NGÀNH NGHỀ TỪNG DOMAIN (TUYỆT ĐỐI KHÔNG SUY DIỄN NGHĨA ĐEN CỦA TÊN MIỀN):
  + Tên miền type.vn / ai.type.vn: Đây là nền tảng AI Content Creator, sáng tạo nội dung, viết bài blog SEO, Marketing, Copywriting, tự động hóa nội dung số. TUYỆT ĐỐI KHÔNG tạo bài viết về "đánh máy chữ, luyện gõ 10 ngón, bàn phím, tốc độ gõ WPM hay bộ gõ tiếng Việt".
  + Tên miền hopthu.vn: Dịch vụ Email Doanh nghiệp (Business Email), bảo mật thư tín, chống thư rác, chứng thực DKIM/SPF.
  + Tên miền tadu.cloud: Dịch vụ Máy chủ đám mây, Cloud Server, Cloud Hosting, VPS tốc độ cao.
  + Tên miền yenai.vn: Tin tức công nghệ, Trí tuệ nhân tạo (AI), AI Agent, phân tích giải pháp công nghệ.
  + Mọi tác vụ và bài viết PHẢI bám sát 100% vào nội dung mô tả chi tiết trong trường "aiAnalysis" của từng tên miền.
- TUYỆT ĐỐI KHÔNG dùng các tên chung chung như "Công việc 1", "Tạo bài viết SEO", "Viết bài mới". 
- QUY TẮC HIỂN THỊ: BẮT BUỘC XỔ TOÀN BỘ KẾ HOẠCH BÀI VIẾT VÀ BẢNG PHÂN BỔ TRỰC TIẾP TRONG NỘI DUNG CHAT CHO QUẢN TRỊ VIÊN ĐỌC. TUYỆT ĐỐI KHÔNG TẠO HOẶC NÊU THÔNG BÁO GHI VÀO FILE .MD RỜI (NHƯ ke_hoach_cong_viec.md HAY BẤT KỲ FILE NÀO KHÁC). MỌI THÔNG TIN PHẢI ĐƯỢC HIỂN THỊ ĐẦY ĐỦ TRÊN KHUNG CHAT.

ĐẶC BIỆT: Nếu người dùng yêu cầu "viết blog", "lên dàn ý" và "lưu vào Soạn bài" (hoặc lưu nháp), BẠN CHỈ ĐƯỢC VIẾT BÀI CHO CÁC TÊN MIỀN CÓ TRƯỜNG "autoWrite": true (TUYỆT ĐỐI BỎ QUA các tên miền có "autoWrite": false) VÀ BẠN KHÔNG TRẢ VỀ MẢNG LỊCH LÀM VIỆC NHƯ BÌNH THƯỜNG. Thay vào đó, bạn PHẢI trả về ĐÚNG định dạng JSON Object sau bên trong block code JSON:
\`\`\`json
{
  "action": "save_to_outline",
  "drafts": [
    {
      "title": "Tiêu đề bài viết 1",
      "content": "Nội dung bài viết 1. ĐÂY PHẢI LÀ MỘT BÀI VIẾT BLOG HOÀN CHỈNH, DÀI VÀ CHI TIẾT (Ít nhất 800 - 1000 từ). KHÔNG được viết kiểu gạch đầu dòng. BẮT BUỘC tuân thủ cấu trúc HTML sau: Mở đầu bằng 1 thẻ <p> chứa đoạn văn Sapo giới thiệu thật hấp dẫn (BẮT BUỘC phải chứa từ khóa chính rút ra từ tiêu đề). Sau đó mới đến các thẻ <h2>, <h3>, <p>, <ul>, <li>. TUYỆT ĐỐI KHÔNG DÙNG MARKDOWN. Hãy viết theo ĐÚNG PHONG CÁCH được yêu cầu trong trường 'writingStyle' và bám sát 'aiAnalysis'.",
      "description": "Mô tả ngắn gọn về công việc/bài viết",
      "image_prompt": "Gợi ý prompt tiếng Anh để tạo ảnh minh họa",
      "tags": ["tag1", "tag2"],
      "domain": "tên miền (bắt buộc, ví dụ: tadu.cloud)",
      "task_id": "BẮT BUỘC lấy chính xác 'id' của task tương ứng trong dữ liệu đầu vào để điền vào đây. Không được để trống nếu đây là bài viết cho một task có sẵn!"
    }
  ]
}
\`\`\`

LƯU Ý VỀ CÁC NGÀY BỊ VÔ HIỆU HÓA (DISABLED DATES):
- Người dùng đã đánh dấu BỎ QUA các ngày sau: ${disabledStr ? disabledStr : 'Không có'}. 
- TUYỆT ĐỐI KHÔNG lên lịch hoặc tạo bất kỳ task nào vào các ngày này. Nếu công thức rơi vào ngày bị bỏ qua, hãy dời sang ngày làm việc tiếp theo gần nhất.

LƯU Ý VỀ CẬP NHẬT DỮ LIỆU:
- Để tạo task mới (chèn thêm vào lịch hiện tại): TUYỆT ĐỐI KHÔNG trả về trường "id" (hệ thống sẽ tự cấp).
- Nếu sửa task cụ thể: giữ nguyên trường "id" của task đó.
- Nếu muốn xóa task cụ thể: trả về thuộc tính "_deleted": true kèm theo "id" của task đó.
- Nếu muốn đánh dấu hoàn thành task cụ thể: trả về thuộc tính "done": true kèm theo "id" của task đó.
QUAN TRỌNG VỀ THỜI GIAN VÀ MÚI GIỜ:
- Hệ thống người dùng đang ở múi giờ: GMT${tzString}. Bạn phải quy đổi múi giờ nếu người dùng yêu cầu múi giờ khác.
- TẤT CẢ các task trong cùng một ngày BẮT BUỘC phải TRÙNG GIỜ VỚI NHAU (đều có startDate là 08:00:00 và endDate là 17:00:00). TUYỆT ĐỐI KHÔNG ĐƯỢC rải rác giờ (ví dụ task 1 lúc 8h, task 2 lúc 9h là SAI). NẾU TẠO 10 TASK CHO 1 NGÀY THÌ CẢ 10 TASK ĐỀU PHẢI GHI ĐÚNG 08:00:00 ĐẾN 17:00:00.
- TUYỆT ĐỐI KHÔNG dùng "24:00:00" vì sẽ gây lỗi Invalid Date, hãy dùng "23:59:59".
- BẮT BUỘC dùng định dạng local: "YYYY-MM-DDTHH:mm:ss" (Ví dụ: "2026-07-16T08:00:00"). TUYỆT ĐỐI KHÔNG CÓ CHỮ 'Z' Ở CUỐI.`;
                    }
                }
            }

            let toolsList: any[] = [];
            const lastUserMsgToCheck = this.chatHistory.slice().reverse().find(m => m.role === 'user')?.content || '';
            const isExactDate = lastUserMsgToCheck.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b/);
            const isMonth = lastUserMsgToCheck.match(/tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?/i);
            
            // Chỉ bật Google Search khi người dùng chọn 1 ngày cụ thể. 
            // Nếu chọn cả tháng, số lượng task quá lớn (hàng trăm) sẽ gây timeout / đứt gãy JSON.
            if (isExactDate && !isMonth) {
                toolsList = [{ googleSearch: {} }];
            }

            let parsed: any = null;
            let aiMessageForChat = '';

            if (isMonth) {
                // Loop through valid dates
                const currentMonth2 = this.month || (new Date().getMonth() + 1);
                const currentYear2 = new Date().getFullYear();
                const daysInMonth2 = new Date(currentYear2, currentMonth2, 0).getDate();
                const validDates: Date[] = [];
                let tDate = new Date();
                if (currentYear2 === tDate.getFullYear() && currentMonth2 === tDate.getMonth() + 1) {
                    tDate = new Date(); // Từ hôm nay
                } else {
                    tDate = new Date(currentYear2, currentMonth2 - 1, 1); // Từ đầu tháng
                }
                
                for (let i = tDate.getDate(); i <= daysInMonth2; i++) {
                    const checkDateStr = `${currentYear2}-${currentMonth2.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
                    if (!this.disabledDates.has(checkDateStr)) {
                        validDates.push(new Date(currentYear2, currentMonth2 - 1, i));
                    }
                }
                
                let allParsedTasks: any[] = [];
                

                
                // Prepare distribution for each domain
                const domainDistributions: any = {};
                contextData.forEach((d: any) => {
                    let missing = d.monthlyTarget - d.currentResult;
                    if (missing < 0) missing = 0;
                    
                    let distribution = new Array(validDates.length).fill(Math.floor(missing / validDates.length));
                    let remainder = missing % validDates.length;
                    if (remainder > 0) {
                        let step = Math.max(1, Math.floor(validDates.length / remainder));
                        for (let r = 0; r < remainder; r++) {
                            distribution[(r * step) % validDates.length]++;
                        }
                    }
                    domainDistributions[d.domain] = distribution;
                });
                
                // Add a placeholder message for progress
                this.chatHistory.push({ role: 'model', content: `⏳ Đang khởi tạo lịch cho ${validDates.length} ngày...` });
                const progressMsgIndex = this.chatHistory.length - 1;
                this.cd.detectChanges();
                this.scrollToBottom();
                
                for (let i = 0; i < validDates.length; i++) {
                    if (!this.isChatting) break;
                    const vDate = validDates[i];
                    const vDateStrLocal = vDate.toLocaleDateString('vi-VN');
                    const vDateStrIso = `${vDate.getFullYear()}-${(vDate.getMonth() + 1).toString().padStart(2, '0')}-${vDate.getDate().toString().padStart(2, '0')}`;
                    
                    // Xóa task của riêng ngày hôm nay trước khi gọi AI
                    let dayDeletionTasks: any[] = [];
                    contextData.forEach((d: any) => {
                        let domainDelTasks: any[] = [];
                        if (d.tasks) {
                            d.tasks.forEach((t: any) => {
                                if (t.startDate) {
                                    const tDateStr = t.startDate.split('T')[0];
                                    if (tDateStr === vDateStrIso) {
                                        domainDelTasks.push({ id: t.id, _deleted: true });
                                    }
                                }
                            });
                        }
                        if (domainDelTasks.length > 0) {
                            dayDeletionTasks.push({ domain: d.domain, tasks: domainDelTasks });
                        }
                    });
                    if (dayDeletionTasks.length > 0) {
                        this.applyParsedTasks(dayDeletionTasks);
                    }

                    // Update contextData with the EXACT target for this day
                    let hasAnyTargetForDay = false;
                    let dayContextData = JSON.parse(JSON.stringify(contextData));
                    dayContextData.forEach((d: any) => {
                        const targetForDay = domainDistributions[d.domain] ? domainDistributions[d.domain][i] : 0;
                        d.dailyTarget = targetForDay;
                        if (targetForDay > 0) hasAnyTargetForDay = true;
                        
                        // Rút gọn task cũ thành mảng string (chỉ lấy tên) để tránh AI copy lại y hệt cấu trúc JSON và trả về
                        if (d.tasks) {
                            d.tasks = d.tasks.map((t: any) => t.name || t.title || 'Task');
                        }
                    });
                    
                    if (!hasAnyTargetForDay) {
                        this.chatHistory[progressMsgIndex].content = `⏳ Đang xử lý ngày ${vDateStrLocal} (${i + 1}/${validDates.length}) - Bỏ qua vì đã đủ chỉ tiêu...`;
                        this.cd.detectChanges();
                        continue;
                    }
                    
                    this.chatHistory[progressMsgIndex].content = `⏳ Đang xử lý ngày ${vDateStrLocal} (${i + 1}/${validDates.length})...`;
                    this.cd.detectChanges();
                    this.scrollToBottom();
                    
                    // Construct prompt for this specific day
                    let dayContents = JSON.parse(JSON.stringify(contents));
                    const lastDayMsg = dayContents[dayContents.length - 1];
                    let oldText = lastDayMsg.parts[0].text;
                    const jsonRegex = /DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI[\s\S]*?```json\n([\s\S]*?)\n```/;
                    if (jsonRegex.test(oldText)) {
                        oldText = oldText.replace(jsonRegex, `DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI:\n\`\`\`json\n${JSON.stringify(dayContextData, null, 2)}\n\`\`\``);
                    }
                    const newText = oldText.replace(/- NẾU NGƯỜI DÙNG YÊU CẦU TẠO\/SỬA\/LÊN LỊCH CHO THÁNG:.*?plan mới lên\)\./s,
                        `- NẾU NGƯỜI DÙNG YÊU CẦU LÊN LỊCH: Bạn BẮT BUỘC chỉ tạo ĐÚNG [dailyTarget] task cho duy nhất ngày ${vDateStrIso}. BẮT BUỘC startDate và endDate của các task này phải nằm trong ngày ${vDateStrIso}. Không cần trả về task cũ (không cần _deleted).`);
                    lastDayMsg.parts[0].text = newText;
                    
                    try {
                        const response = await this._genaiService.generateContent({
                            model: 'gemini-3.8-flash',
                            contents: dayContents,
                            tools: [], // No tools to make it fast
                            config: {
                                ttsVoice: 'none',
                                onStream: (chunk: string, isFull: boolean) => {
                                    const prefix = `⏳ Đang xử lý ngày ${vDateStrLocal} (${i + 1}/${validDates.length})...\n`;
                                    if (isFull) {
                                        this.chatHistory[progressMsgIndex].content = prefix + chunk;
                                    } else {
                                        if (this.chatHistory[progressMsgIndex].content.length <= prefix.length) {
                                            this.chatHistory[progressMsgIndex].content = prefix + chunk;
                                        } else {
                                            this.chatHistory[progressMsgIndex].content += chunk;
                                        }
                                    }
                                    this.cd.detectChanges();
                                    this.scrollToBottom();
                                }
                            }
                        } as any);
                        
                        const aiMsg = response.text || (response as any).response?.text() || '';
                        if (i === validDates.length - 1) {
                            aiMessageForChat = aiMsg;
                        }
                        
                        // --- INTERCEPT DÀN Ý TRONG VÒNG LẶP ---
                        let handledAsDraft = false;
                        try {
                            let textToParse = aiMsg;
                            const jsonMatch = aiMsg.match(/```json([\s\S]*?)```/);
                            if (jsonMatch && jsonMatch[1]) {
                                textToParse = jsonMatch[1].trim();
                            }
                            if (textToParse.includes('save_to_outline')) {
                                const actionIndex = textToParse.indexOf('"action"');
                                if (actionIndex !== -1) {
                                    const firstBrace = textToParse.lastIndexOf('{', actionIndex);
                                    const lastBrace = textToParse.lastIndexOf('}');
                                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                        textToParse = textToParse.substring(firstBrace, lastBrace + 1);
                                    }
                                }
                                
                                const parsedObj = JSON.parse(textToParse);
                                if (parsedObj && parsedObj.action === 'save_to_outline' && Array.isArray(parsedObj.drafts)) {
                                    this.saveDraftsToAiWriter(parsedObj.drafts);
                                    handledAsDraft = true;
                                }
                            }
                        } catch(e) {}
                        if (handledAsDraft) continue;
                        // --- KẾT THÚC ---

                        let dayParsed = this.getParsedAiTask(aiMsg);
                        if (dayParsed) {
                            if (!Array.isArray(dayParsed)) {
                                dayParsed = [dayParsed];
                            }
                            // Nếu AI lười, trả thẳng array task thay vì array domain
                            if (dayParsed.length > 0 && !dayParsed[0].domain && (dayParsed[0].name || dayParsed[0].title)) {
                                dayParsed = [{
                                    domain: contextData[0]?.domain,
                                    tasks: dayParsed
                                }];
                            }
                            
                            // Ép buộc gán lại ngày cho TẤT CẢ task mới (bất chấp AI có trả về ngày gì)
                            dayParsed.forEach((d: any) => {
                                if (d.tasks && Array.isArray(d.tasks)) {
                                    d.tasks.forEach((t: any) => {
                                        t.startDate = `${vDateStrIso}T08:00:00`;
                                        t.endDate = `${vDateStrIso}T17:00:00`;
                                    });
                                }
                            });
                            
                            this.applyParsedTasks(dayParsed);
                            
                            dayParsed.forEach((domainData: any) => {
                                let existingDomain = allParsedTasks.find(d => d.domain === domainData.domain);
                                if (!existingDomain) {
                                    existingDomain = { domain: domainData.domain, tasks: [] };
                                    allParsedTasks.push(existingDomain);
                                }
                                existingDomain.tasks = existingDomain.tasks.concat(domainData.tasks || []);
                            });
                        }
                    } catch (e: any) {
                        console.error('Error generating tasks for day', vDateStrLocal, e);
                        this.chatHistory.push({ role: 'model', content: `❌ Bị lỗi khi gọi AI (có thể do quá tải, Rate Limit) tại ngày ${vDateStrLocal}: ${e.message || e}. Dừng tiến trình!` });
                        this.cd.detectChanges();
                        this.scrollToBottom();
                        break;
                    }
                }
                
                // Remove progress message
                this.chatHistory.splice(progressMsgIndex, 1);
                parsed = allParsedTasks; // Keep it for the diagnostic message
                
            } else {
                this.chatHistory.push({ role: 'model', content: '⏳ Đang phân tích...' });
                const streamIndex = this.chatHistory.length - 1;
                
                const response = await this._genaiService.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: contents,
                    tools: toolsList,
                    config: {
                        ttsVoice: 'none',
                        onStream: (chunk: string, isFull: boolean) => {
                            if (isFull) {
                                this.chatHistory[streamIndex].content = chunk;
                            } else {
                                if (this.chatHistory[streamIndex].content === '⏳ Đang phân tích...') {
                                    this.chatHistory[streamIndex].content = chunk;
                                } else {
                                    this.chatHistory[streamIndex].content += chunk;
                                }
                            }
                            this.cd.detectChanges();
                            this.scrollToBottom();
                        }
                    }
                } as any);
                
                const streamedContent = this.chatHistory[streamIndex]?.content;
                aiMessageForChat = (streamedContent && streamedContent !== '⏳ Đang phân tích...') 
                    ? streamedContent 
                    : (response.text || (response as any).response?.text() || '');
                
                // --- BẮT ĐẦU CHÈN LOGIC INTERCEPT DÀN Ý ---
                try {
                    let textToParse = aiMessageForChat;
                    const jsonMatch = aiMessageForChat.match(/```json([\s\S]*?)```/);
                    if (jsonMatch && jsonMatch[1]) {
                        textToParse = jsonMatch[1].trim();
                    }
                    if (textToParse.includes('save_to_outline')) {
                        const actionIndex = textToParse.indexOf('"action"');
                        if (actionIndex !== -1) {
                            const firstBrace = textToParse.lastIndexOf('{', actionIndex);
                            const lastBrace = textToParse.lastIndexOf('}');
                            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                textToParse = textToParse.substring(firstBrace, lastBrace + 1);
                            }
                        }
                        
                        const parsedObj = JSON.parse(textToParse);
                        if (parsedObj && parsedObj.action === 'save_to_outline' && Array.isArray(parsedObj.drafts)) {
                            this.saveDraftsToAiWriter(parsedObj.drafts);
                            this.chatHistory.splice(streamIndex, 1);
                            this.isChatting = false;
                            this.saveScriptState();
                            return;
                        }
                    }
                } catch(e) {}
                // --- KẾT THÚC ---

                parsed = this.getParsedAiTask(aiMessageForChat);
                if (Array.isArray(parsed) && !isMonth) {
                    this.applyParsedTasks(parsed);
                }
                
                if (parsed) {
                    // Remove the raw streamed message (it contains raw JSON), 
                    // the cleaned message will be pushed at the end.
                    this.chatHistory.splice(streamIndex, 1);
                } else {
                    const textOnly = this.getAiMessageText(aiMessageForChat);
                    if (textOnly && textOnly.trim() !== '' && textOnly !== '⏳ Đang phân tích...') {
                        this.chatHistory[streamIndex].content = textOnly;
                    } else if (aiMessageForChat && aiMessageForChat.trim() !== '' && aiMessageForChat !== '⏳ Đang phân tích...') {
                        this.chatHistory[streamIndex].content = aiMessageForChat;
                    }
                }
            }
            
            if (parsed) {
                if (this.editingItem) {
                    const taskObj = Array.isArray(parsed) ? parsed[0] : parsed;
                    if (taskObj && taskObj.name) {
                        this.editingItem.name = taskObj.name;
                        this.editingItem.meta = taskObj.meta;
                        if (taskObj.startDate) this.editingItem.startDate = this.safeDate(taskObj.startDate);
                        if (taskObj.endDate) this.editingItem.endDate = this.safeDate(taskObj.endDate);
                        
                        this.editingItem = null;
                        this.items = [...this.items];
                        this.cd.markForCheck();
                        this.saveScriptState();
                        this.toastr.success('Cập nhật công việc thành công!');
                        this.chatHistory.push({ role: 'model', content: '✅ Đã cập nhật công việc hiện tại!' });
                    } else {
                        this.chatHistory.push({ role: 'model', content: 'Lỗi: AI không trả về dữ liệu công việc hợp lệ.' });
                    }
                } else if (Array.isArray(parsed)) {
                    let hasAnyTasks = parsed.length > 0;
                    
                    let aiTextOnly = aiMessageForChat.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
                    if (aiTextOnly === '') {
                        aiTextOnly = '✅ Dạ sếp ơi, em đã phân tích và lên lịch xong theo yêu cầu của sếp rồi nhé!';
                    }
                    
                    const firstDomain = contextData[0] || {} as any;
                    aiTextOnly += `\n\n*(Thông tin hệ thống: Tên miền đang xét có chỉ tiêu tháng = ${firstDomain.monthlyTarget || 0} bài, Số ngày làm việc còn lại = ${firstDomain.remainingDays || 0} ngày -> AI được lệnh tạo ${firstDomain.dailyTarget || 0} bài/ngày. Nếu chỉ tiêu tháng bị sai, sếp vui lòng cập nhật lại ở cột "Chỉ tiêu" ngoài bảng tên miền nhé!)*`;

                    // Xây dựng báo cáo để debug (không show ra chat nữa)
                    let diagnosticMsg = `${aiTextOnly}\n\n---\n*Báo cáo hệ thống:\n`;
                    const lastUserMsg = this.chatHistory.slice().reverse().find(m => m.role === 'user')?.content || '';
                    let reportMonth = this.month || (new Date().getMonth() + 1);
                    let reportYear = new Date().getFullYear();
                    let reportTaskDate = new Date();
                    
                    const exactDateMatchReport = lastUserMsg.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b/);
                    const monthMatchReport = lastUserMsg.match(/tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?/i);
                    
                    if (exactDateMatchReport) {
                        const day = parseInt(exactDateMatchReport[1]);
                        reportMonth = parseInt(exactDateMatchReport[2]);
                        if (exactDateMatchReport[3]) {
                            reportYear = parseInt(exactDateMatchReport[3]);
                        }
                        reportTaskDate = new Date(reportYear, reportMonth - 1, day);
                    } else if (monthMatchReport) {
                        reportMonth = parseInt(monthMatchReport[1]);
                        if (monthMatchReport[2]) {
                            reportYear = parseInt(monthMatchReport[2]);
                        }
                        const now = new Date();
                        if (reportYear === now.getFullYear() && reportMonth === now.getMonth() + 1) {
                            reportTaskDate = new Date(); // Today
                        } else {
                            reportTaskDate = new Date(reportYear, reportMonth - 1, 1);
                        }
                    }

                    this.items.forEach(d => {
                        const currentMonth = reportMonth;
                        const currentYear = reportYear;
                        const monthlyTarget = (d as any).domainData?.monthlyTarget || this.getResolvedTarget(d.name, currentMonth, currentYear) || 0;
                        const currentResult = (this.statsData && this.statsData[d.name] && this.statsData[d.name][currentMonth]) ? this.statsData[d.name][currentMonth] : 0;
                        const streamItems = d.childrenItems?.[0]?.streamItems || [];
                        const nowStr = this.safeIsoDate(new Date());
                        const scheduledCount = streamItems.filter((t: any) => {
                            if (!t.startDate) return false;
                            const tDate = this.safeDate(t.startDate);
                            if (tDate.getMonth() + 1 !== currentMonth || tDate.getFullYear() !== currentYear) return false;
                            
                            const tDateStr = this.safeIsoDate(tDate);
                            return tDateStr >= nowStr;
                        }).length;
                        
                        let taskDate = new Date(reportTaskDate);
                        const parsedDomain = parsed.find((p: any) => p.domain?.toLowerCase().trim() === d.name.toLowerCase().trim());
                        if (parsedDomain && parsedDomain.tasks && parsedDomain.tasks.length > 0) {
                            // Ưu tiên task tạo mới
                            let targetTask = parsedDomain.tasks.find((t: any) => !t.id && t.startDate && !t._deleted);
                            
                            if (!targetTask) {
                                // Tìm task có startDate lớn nhất
                                let maxTime = 0;
                                parsedDomain.tasks.forEach((t: any) => {
                                    if (t.startDate && !t._deleted) {
                                        const dTime = this.safeDate(t.startDate).getTime();
                                        if (dTime > maxTime) {
                                            maxTime = dTime;
                                            targetTask = t;
                                        }
                                    }
                                });
                            }

                            if (targetTask && targetTask.startDate) {
                                const dTask = this.safeDate(targetTask.startDate);
                                if (!isNaN(dTask.getTime())) {
                                    taskDate = dTask;
                                }
                            }
                        }
                        const year = taskDate.getFullYear();
                        const taskMonth = taskDate.getMonth() + 1;
                        const daysInMonth = new Date(year, taskMonth, 0).getDate();
                        let remainingDays = 0;
                        for (let i = taskDate.getDate(); i <= daysInMonth; i++) {
                            const checkDate = `${year}-${taskMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
                            if (!this.disabledDates.has(checkDate)) {
                                remainingDays++;
                            }
                        }
                        
                        let dailyTarget = monthlyTarget > 0 ? (remainingDays > 0 ? Math.ceil(monthlyTarget / remainingDays) : monthlyTarget) : 0;
                        diagnosticMsg += `- **${d.name}**: Mục tiêu: ${monthlyTarget}, Đã xong: ${currentResult}, Đã lên lịch: ${scheduledCount}, Số ngày còn lại: ${remainingDays} => Cần tạo: **${dailyTarget} task/ngày**.\n`;
                    });
                    
                    console.log(diagnosticMsg); // In ra log để check
                    
                    if (!hasAnyTasks) {
                        diagnosticMsg += '\n*(Hôm nay không có task nào được lên lịch)*\n\nToàn bộ tên miền đã đạt chỉ tiêu nên không có tác vụ nào được tạo thêm.*';
                        this.toastr.info('Hoàn tất kiểm tra: Các tên miền đã đủ chỉ tiêu, không có việc mới.');
                    } else {
                        diagnosticMsg += `\nĐã tự động tạo các tác vụ thành công trên lịch! (AI đã xử lý ${parsed.length} domains)*`;
                        this.toastr.success('Đã cập nhật toàn bộ lịch!');
                    }

                    this.items = [...this.items];
                    this.saveScriptState();
                    this.cd.markForCheck();
                    this.chatHistory.push({ role: 'model', content: aiTextOnly });
                } else {
                    this.chatHistory.push({ role: 'model', content: 'Lỗi: AI không trả về dữ liệu hợp lệ cho thao tác này.' });
                }
            } else {
                const lastMsg = this.chatHistory[this.chatHistory.length - 1];
                if (!lastMsg || lastMsg.role !== 'model' || lastMsg.content === '⏳ Đang phân tích...') {
                    this.chatHistory.push({ role: 'model', content: aiMessageForChat || 'Dạ sếp ơi, em đã ghi nhận yêu cầu. Sếp muốn điều chỉnh công việc nào ạ?' });
                }
            }
        } catch (err: any) {
            if (!this.isChatting) return;
            console.error('Lỗi gọi AI:', err);
            this.chatHistory.push({ role: 'model', content: 'Đã có lỗi xảy ra: ' + (err.message || err) });
        } finally {
            this.isChatting = false;
            this.saveScriptState(); // Lưu lại lịch sử chat kể cả khi thành công hay lỗi
            this.cd.detectChanges();
            this.scrollToBottom();
        }
    }

    async commitDayTasksToDB(confirmData: any, originatingUserRequest?: string) {
        const { normalizedList, vDateStrIso, vDateStrLocal } = confirmData;
        if (!normalizedList || !Array.isArray(normalizedList)) return;

        this.isChatting = true;
        this.cd.detectChanges();

        const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const isLocalMode = isAutoSaveLocalEnabled();

        // Lấy danh sách task hiện có từ DB của tháng này để đồng bộ chính xác _id/_rev và tránh nhân bản task cũ
        let dbMonthTasks: any[] = [];
        try {
            const tasksRes: any = await firstValueFrom(
                this._tasksService.fetch({
                    username: this.user?.name || 'admin',
                    year: confirmData.year || this.year,
                    month: confirmData.month || this.month,
                    onlySelectedMonth: true
                })
            ).catch(() => null);
            if (Array.isArray(tasksRes)) {
                dbMonthTasks = tasksRes;
            } else if (tasksRes && Array.isArray(tasksRes.data)) {
                dbMonthTasks = tasksRes.data;
            } else if (tasksRes && Array.isArray(tasksRes.result)) {
                dbMonthTasks = tasksRes.result;
            }
        } catch (e) {}

        let savedTasksCount = 0;
        let savedDomainsCount = 0;
        const committedTasksForWriting: any[] = [];

        for (const entry of normalizedList) {
            const targetNorm = normalizeDomain(entry.domain || '');
            const matchedItem = this.items.find(
                (it: any) =>
                    it &&
                    !it.isTotalRow &&
                    normalizeDomain(it?.domainData?.domain || it?.name) ===
                        targetNorm
            );
            if (!matchedItem || !this.isDomainAutoWriteEnabled(matchedItem)) continue;
            savedDomainsCount++;

            const canonicalDomainName = matchedItem.domainData?.domain || matchedItem.name;
            if (!matchedItem.domainData) matchedItem.domainData = { domain: canonicalDomainName };
            const flatCurrentTasks = this.getFlatDomainTasks(matchedItem);

            // Tìm tất cả các task cũ trong RAM của domain này trong ngày vDateStrIso và các ngày khác
            const ramOldDayTasks: any[] = [];
            const otherDayTasks: any[] = [];

            flatCurrentTasks.forEach((t: any) => {
                if (t && t.startDate && this.safeIsoDate(t.startDate) === vDateStrIso) {
                    ramOldDayTasks.push(t);
                } else if (t) {
                    otherDayTasks.push(t);
                }
            });

            // Ghép thông tin _id/_rev thực tế từ DB cho các task ngày vDateStrIso của domain này
            const dbDayTasksForDomain = dbMonthTasks.filter((dbt: any) => {
                if (!dbt || !dbt.startDate || this.safeIsoDate(dbt.startDate) !== vDateStrIso) return false;
                const dbNorm = normalizeDomain(dbt.domain_id || dbt.domain || dbt.domainName || '');
                return dbNorm === targetNorm;
            });

            const oldDayTasks: any[] =
                dbDayTasksForDomain.length > 0 ? dbDayTasksForDomain : ramOldDayTasks;
            const reusedDbIds = new Set<string>();

            const newDayTasksList: any[] = [];
            const desiredTasks = entry.tasks || [];

            // 1. Cập nhật hoặc tạo mới các task theo desiredTasks
            for (let idx = 0; idx < desiredTasks.length; idx++) {
                const t = desiredTasks[idx];
                const existingTask = idx < oldDayTasks.length ? oldDayTasks[idx] : null;

                const taskPayload: any = {
                    name: t.name || t.title || 'Công việc mới',
                    meta: t.meta || t.description || '',
                    domain_id: canonicalDomainName,
                    domain: canonicalDomainName,
                    startDate: t.startDate || `${vDateStrIso}T08:00:00`,
                    endDate: t.endDate || `${vDateStrIso}T17:00:00`,
                    done: false,
                    status: 'pending',
                    isDone: false,
                    completed: false,
                    percent: 0,
                    canResizeLeft: true,
                    canResizeRight: true,
                    canDragX: true,
                    canDragY: false
                };

                try {
                    let savedSuccessfully = false;
                    const existingId = existingTask?._id || existingTask?.id;
                    const isRealCouchDbTask =
                        !!existingTask &&
                        !!existingTask._id &&
                        !!existingTask._rev &&
                        String(existingTask._rev).includes('-');
                    const canEditInPlace = isLocalMode ? !!existingId : isRealCouchDbTask;

                    if (canEditInPlace && existingId) {
                        taskPayload['_id'] = existingId;
                        taskPayload['id'] = existingId;
                        if (existingTask._rev) {
                            taskPayload['_rev'] = existingTask._rev;
                        }
                        const resEdit: any = await firstValueFrom(this._tasksService.edit({ username: this.user?.name || 'admin', task: taskPayload })).catch(() => null);
                        if (resEdit && !resEdit.error && (isLocalMode ? resEdit.success !== false : !resEdit.message)) {
                            savedSuccessfully = true;
                            reusedDbIds.add(String(existingId));
                            const newRev = resEdit.rev || resEdit._rev || resEdit.data?.rev || resEdit.data?._rev;
                            if (newRev) {
                                taskPayload._rev = newRev;
                            }
                        }
                    }

                    if (!savedSuccessfully) {
                        delete taskPayload['_id'];
                        delete taskPayload['id'];
                        delete taskPayload['_rev'];
                        const resAdd: any = await firstValueFrom(this._tasksService.add({ username: this.user?.name || 'admin', task: taskPayload })).catch(() => null);
                        if (resAdd && !resAdd.error) {
                            const newId = resAdd.id || resAdd._id || resAdd.data?.id || resAdd.data?._id;
                            const newRev = resAdd.rev || resAdd._rev || resAdd.data?.rev || resAdd.data?._rev;
                            if (newId) {
                                taskPayload._id = newId;
                                taskPayload.id = newId;
                            }
                            if (newRev) {
                                taskPayload._rev = newRev;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Lỗi lưu task ngày vào CSDL:', err);
                }

                newDayTasksList.push(taskPayload);
                committedTasksForWriting.push({
                    ...taskPayload,
                    domain: canonicalDomainName,
                    originalTask: taskPayload
                });
                savedTasksCount++;
            }

            // 2. Xóa các task cũ trong ngày không được cập nhật trực tiếp (dư thừa hoặc thay mới bằng ID khác)
            const tasksToCleanup = [...dbDayTasksForDomain, ...ramOldDayTasks];
            const cleanedIds = new Set<string>();
            for (const oldTask of tasksToCleanup) {
                const oldId = String(oldTask?._id || oldTask?.id || '');
                if (!oldId || reusedDbIds.has(oldId) || cleanedIds.has(oldId)) continue;
                cleanedIds.add(oldId);
                try {
                    await firstValueFrom(this._tasksService.delete({ username: this.user?.name || 'admin', task: oldTask })).catch(() => null);
                } catch (err) {
                    console.warn('Lỗi xóa task cũ dư thừa trong CSDL:', err);
                }
            }

            // 3. Cập nhật lại toàn bộ plan trong RAM và allDomainsList cho domain này
            matchedItem.domainData.plan = [...otherDayTasks, ...newDayTasksList];
            if (Array.isArray(this.allDomainsList)) {
                const allDomEntry = this.allDomainsList.find(
                    (ad: any) => ad && normalizeDomain(ad.domain || ad.name) === targetNorm
                );
                if (allDomEntry) {
                    allDomEntry.plan = [...matchedItem.domainData.plan];
                }
            }
            this.applyPackedTasks(matchedItem, matchedItem.domainData.plan);
        }

        // Cập nhật các dòng tổng và render lại Timeline
        this.updateTotalSummaryRow();
        this.items = [...this.items];
        this.saveScriptState();
        this.cd.detectChanges();

        const effectivePrompt = String(
            originatingUserRequest || confirmData?.userRequest || ''
        ).trim();

        // Nếu thẻ xác nhận này xuất phát từ lệnh yêu cầu VIẾT kịch bản / bài viết (ví dụ: "Viết kịch bản quảng cáo ngày 14/11"),
        // tiến hành viết trọn vẹn nội dung và lưu thẳng vào CSDL Soạn bài & Kịch bản ngay sau khi lưu lịch!
        if (
            this.isContentWritingCommand(effectivePrompt) &&
            committedTasksForWriting.length > 0
        ) {
            await this.writeAndSaveContentForTasks(
                committedTasksForWriting,
                vDateStrLocal,
                effectivePrompt,
                0
            );
            return;
        }

        this.isChatting = false;
        this.chatHistory.push({
            role: 'model',
            content: `🎉 Báo cáo Sếp: Em đã hoàn tất lưu CSDL và làm mới **${savedTasksCount} công việc** ngày **${vDateStrLocal}** trên lịch cho **${savedDomainsCount} tên miền đã chọn** rồi nhé! 😎`
        });
        this.cd.detectChanges();
        this.scrollToBottom();

        this.toastr.success(`Đã cập nhật và lưu CSDL công việc ngày ${vDateStrLocal}!`);
    }

    async confirmAndExecuteTask(confirmData: any, msg?: any) {
        if (this.isChatting || !confirmData) return;

        const liveSelectedKeys = this.getSelectedAutoWriteDomainKeys();
        if (
            confirmData?.type !== 'save_parsed_tasks' &&
            liveSelectedKeys.size === 0
        ) {
            this.toastr.warning(
                'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái trước khi xác nhận!',
                'Chưa chọn tên miền'
            );
            this.chatHistory.push({
                role: 'model',
                content: `⚠️ **Chưa chọn tên miền thực thi**: Báo cáo Sếp, hiện chưa có tên miền nào được tích chọn ở cột **Công việc** bên trái nên em chưa thực hiện lưu công việc ạ!`
            });
            this.cd.detectChanges();
            this.scrollToBottom();
            return;
        }

        // Truy xuất câu lệnh gốc của người dùng đã tạo ra thẻ xác nhận này (hỗ trợ cả các thẻ đã lưu trong lịch sử chat trước đó)
        let effectiveUserRequest = String(confirmData?.userRequest || '').trim();
        if (!effectiveUserRequest && Array.isArray(this.chatHistory)) {
            const msgIdx = msg
                ? this.chatHistory.indexOf(msg)
                : this.chatHistory.length - 1;
            const searchFrom =
                msgIdx >= 0 ? msgIdx : this.chatHistory.length - 1;
            for (let k = searchFrom; k >= 0; k--) {
                const histItem = this.chatHistory[k];
                if (histItem && histItem.role === 'user' && histItem.content) {
                    effectiveUserRequest = String(histItem.content).trim();
                    break;
                }
            }
        }

        if (msg) {
            msg.isConfirmed = true;
        }
        this.chatHistory.forEach((m: any) => {
            if (m) {
                if (m.isConfirmMessage) m.isConfirmed = true;
                if (m.confirmData) m.confirmData.isConfirmed = true;
            }
        });

        this.isChatting = true;
        this.saveScriptState();
        this.cd.detectChanges();

        try {
            if (confirmData.type === 'save_day_parsed_tasks' && confirmData.normalizedList) {
                await this.commitDayTasksToDB(confirmData, effectiveUserRequest);
                return;
            }

            if (confirmData.type === 'save_parsed_tasks' && confirmData.parsedTasks) {
                const success = this.applyParsedTasks(confirmData.parsedTasks);
                if (success) {
                    this.saveScriptState();
                    this.cd.detectChanges();
                    this.toastr.success('Đã lưu toàn bộ công việc vào CSDL thành công!');
                    this.chatHistory.push({
                        role: 'model',
                        content: `✅ Sếp đã xác nhận! Em đã chính thức lưu công việc vào CSDL thành công!`
                    });
                }
                this.isChatting = false;
                this.scrollToBottom();
                return;
            }

            const targetDomainKeys = this.getSelectedAutoWriteDomainKeys();

            if (confirmData.type === 'day' || confirmData.day) {
                const dayStr = confirmData.day.toString().padStart(2, '0');
                const monthStr = confirmData.month.toString().padStart(2, '0');
                const formattedDate = `${dayStr}/${monthStr}/${confirmData.year}`;

                this.chatHistory.push({
                    role: 'model',
                    content: `🚀 Sếp đã xác nhận! Em bắt đầu tự động tạo và điều chỉnh công việc cho ngày **${formattedDate}** cho **${targetDomainKeys.size} tên miền đã chọn**...`
                });
                this.cd.detectChanges();
                this.scrollToBottom();

                await this.executeDayTaskGeneration(confirmData.year, confirmData.month, confirmData.day, confirmData.userRequest);
            } else {
                const monthStr = confirmData.month.toString().padStart(2, '0');
                this.chatHistory.push({
                    role: 'model',
                    content: `🚀 Sếp đã xác nhận! Em bắt đầu tự động tạo và phân bổ công việc cho **Tháng ${monthStr}/${confirmData.year}** cho **${targetDomainKeys.size} tên miền đã chọn**...`
                });
                this.cd.detectChanges();
                this.scrollToBottom();

                // Chỉ xóa task cũ của tháng này đối với các tên miền ĐÃ CHỌN, giữ nguyên vẹn task của các tên miền không chọn
                await this.deleteAllMonthTasksFromDB(confirmData.year, confirmData.month, targetDomainKeys);

                let rawDomains = (this.allDomainsList && this.allDomainsList.length > 0) ? [...this.allDomainsList] : [];
                if (rawDomains.length === 0) {
                    rawDomains = this.items
                        .filter(item => item && item.id !== 'total-summary-row' && item.id !== 'monthly-total-summary-row')
                        .map(item => {
                            const dData = item.domainData || {};
                            const name = dData.domain || dData.name || item.name;
                            return {
                                ...dData,
                                domain: name,
                                name: name
                            };
                        })
                        .filter(d => !!d && !!d.domain);
                }

                // Bảo toàn task đang hiển thị của các tên miền KHÔNG chọn và chỉ làm sạch plan tháng này của các tên miền ĐÃ CHỌN
                const livePlanByDomain = new Map<string, any[]>();
                (this.items || []).forEach((it: any) => {
                    if (!it || it.isTotalRow || it.id === 'total-summary-row' || it.id === 'monthly-total-summary-row') return;
                    const k = this.normalizeDomainKey(it?.domainData?.domain || it?.name);
                    if (!k) return;
                    const liveTasks = it?.childrenItems?.[0]?.streamItems || it?.domainData?.plan || [];
                    if (Array.isArray(liveTasks) && liveTasks.length > 0) {
                        livePlanByDomain.set(k, [...liveTasks]);
                    }
                });

                [rawDomains, this.allDomainsList].forEach(list => {
                    if (list && list.length > 0) {
                        list.forEach((d: any) => {
                            if (!d) return;
                            const dKey = this.normalizeDomainKey(d.domain || d.name);
                            if (targetDomainKeys.has(dKey)) {
                                if (d.plan && Array.isArray(d.plan)) {
                                    d.plan = d.plan.filter((t: any) => {
                                        if (!t || !t.startDate) return false;
                                        const dObj = this.safeDate(t.startDate);
                                        return dObj && (dObj.getFullYear() !== confirmData.year || (dObj.getMonth() + 1) !== confirmData.month);
                                    });
                                }
                            } else if (dKey && livePlanByDomain.has(dKey)) {
                                const existingPlan = Array.isArray(d.plan) ? d.plan : [];
                                if (existingPlan.length === 0) {
                                    d.plan = [...(livePlanByDomain.get(dKey) || [])];
                                }
                            }
                        });
                    }
                });

                this.month = confirmData.month;
                this.year = confirmData.year || this.year || new Date().getFullYear();
                this.updateTimelineMonthRange(this.month, this.year);
                rawDomains.forEach((d: any) => {
                    d.monthlyTarget = this.getResolvedTarget(d.domain || d.name, this.month, this.year, d);
                });
                await this.processDomains(rawDomains, this.statsData, this.month, true, this.year, targetDomainKeys);
            }
        } catch (err: any) {
            console.error('Lỗi khi thực thi task:', err);
            this.toastr.error('Có lỗi xảy ra khi thực thi. Vui lòng thử lại.');
        } finally {
            this.isChatting = false;
            this.cd.detectChanges();
            this.scrollToBottom();
        }
    }

    async executeDayTaskGeneration(year: number, month: number, day: number, userInstruction?: string) {
        const dayStr = day.toString().padStart(2, '0');
        const monthStr = month.toString().padStart(2, '0');
        const vDateStrLocal = `${dayStr}/${monthStr}/${year}`;
        const vDateStrIso = `${year}-${monthStr}-${dayStr}`;

        const todayObj = new Date();
        todayObj.setHours(0, 0, 0, 0);
        const targetDateObj = new Date(year, month - 1, day, 0, 0, 0, 0);
        const isPastDay = targetDateObj.getTime() < todayObj.getTime();
        const isDisabledDay = this.disabledDates.has(vDateStrIso);

        if (isPastDay || isDisabledDay) {
            let reason = isPastDay ? 'đã qua trong quá khứ' : 'đang bị tích "Bỏ qua"';
            if (isPastDay && isDisabledDay) reason = 'vừa đã qua trong quá khứ vừa đang bị tích "Bỏ qua"';
            this.toastr.warning(`Ngày ${vDateStrLocal} ${reason}. Không thể thực thi!`);
            this.chatHistory.push({
                role: 'model',
                content: `❌ **Từ chối thực thi**: Ngày **${vDateStrLocal}** ${reason} nên em không thực hiện tạo/chỉnh sửa công việc được ạ!`
            });
            this.isChatting = false;
            this.cd.detectChanges();
            return;
        }

        const selectedDomainKeys = this.getSelectedAutoWriteDomainKeys();
        if (selectedDomainKeys.size === 0) {
            this.toastr.warning(
                'Vui lòng tích chọn ít nhất 1 tên miền ở cột Công việc bên trái trước khi tạo công việc!',
                'Chưa chọn tên miền'
            );
            this.chatHistory.push({
                role: 'model',
                content: `⚠️ **Chưa chọn tên miền thực thi**: Báo cáo Sếp, hiện chưa có tên miền nào được tích chọn ở cột **Công việc** bên trái nên em không thể tạo công việc ngày **${vDateStrLocal}** được ạ!`
            });
            this.isChatting = false;
            this.cd.detectChanges();
            return;
        }

        this.toastr.info(`Đang gọi AI Agent phân tích và đề xuất công việc cho ngày ${vDateStrLocal}...`, 'Đang xử lý');
        if (this._globalAgentService) {
            this._globalAgentService.sendStreamMessage({
                role: 'model',
                content: `⏳ Đang gọi AI Agent phân tích và đề xuất công việc ngày **${vDateStrLocal}**...`,
                isStreaming: true
            });
        }

        // Tính số ngày làm việc thực tế còn lại trong tháng (không tính các ngày đã qua của tháng hiện tại)
        const now = new Date();
        const daysInMonth = new Date(year, month, 0).getDate();
        const startWorkingDay =
            year === now.getFullYear() && month === now.getMonth() + 1
                ? Math.min(day, now.getDate())
                : 1;
        let remainingWorkingDays = 0;
        for (let i = startWorkingDay; i <= daysInMonth; i++) {
            const checkDate = `${year}-${monthStr}-${i.toString().padStart(2, '0')}`;
            if (!this.disabledDates.has(checkDate)) {
                remainingWorkingDays++;
            }
        }
        if (remainingWorkingDays === 0) remainingWorkingDays = 1;

        // Kiểm tra nếu người dùng có chỉ định rõ số bài trên mỗi tên miền trong câu lệnh
        let explicitPerDomainCount = 0;
        if (userInstruction && userInstruction.trim()) {
            const strippedDates = userInstruction
                .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, ' ')
                .replace(/(?:ngày|tháng|năm)\s*\d+/gi, ' ');
            const explicitCountMatch = strippedDates.match(
                /(?:tạo|sinh|lên lịch|mỗi tên miền|mỗi domain)\s*(\d+)\s*(?:bài|công việc|task)\b/i
            );
            if (explicitCountMatch) {
                const parsedCount = parseInt(explicitCountMatch[1], 10);
                if (parsedCount > 0 && parsedCount <= 50) {
                    explicitPerDomainCount = parsedCount;
                }
            }
        }

        const normalizeDomainHelper = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const seenDomainNames = new Set<string>();
        const hasConfiguredTargets = !!(this.settings?.domainTargets && Object.keys(this.settings.domainTargets).length > 0);

        let validItems = this.items.filter(item => {
            if (!item || item.isTotalRow || item.id === 'total-summary-row' || item.id === 'monthly-total-summary-row') return false;
            if (!this.isDomainAutoWriteEnabled(item)) return false;
            const rawName = item.domainData?.domain || item.name;
            const norm = normalizeDomainHelper(rawName);
            if (!norm || seenDomainNames.has(norm)) return false;
            seenDomainNames.add(norm);

            const flatTasks = this.getFlatDomainTasks(item);
            const existingOnTargetDay = flatTasks.filter(
                (t: any) => t && t.startDate && this.safeIsoDate(t.startDate) === vDateStrIso
            ).length;
            if (existingOnTargetDay > 0) return true;

            let monthlyTarget = this.getResolvedTarget(norm, month, year);
            if (!hasConfiguredTargets && monthlyTarget === 0) {
                monthlyTarget = item.domainData?.monthlyTarget || 0;
            }
            return monthlyTarget > 0;
        });

        if (validItems.length === 0) {
            this.toastr.warning('Các tên miền đã chọn đều có chỉ tiêu tháng là 0 bài!', 'Không có chỉ tiêu');
            this.chatHistory.push({
                role: 'model',
                content: `⚠️ **Không có chỉ tiêu cần tạo**: Các tên miền đang tích chọn đều có chỉ tiêu tháng **0 bài** nên không có công việc mới cần tạo cho ngày **${vDateStrLocal}** ạ!`
            });
            this.isChatting = false;
            this.saveScriptState();
            this.cd.detectChanges();
            return;
        }

        let contextData = validItems.map((d: any) => {
            let flatTasks = this.getFlatDomainTasks(d);
            const rawName = d.domainData?.domain || d.name;
            const norm = normalizeDomainHelper(rawName);
            if (flatTasks.length === 0 && Array.isArray(this.allDomainsList)) {
                const fallbackDom = this.allDomainsList.find(
                    (ad: any) => ad && normalizeDomainHelper(ad.domain || ad.name) === norm
                );
                if (fallbackDom && Array.isArray(fallbackDom.plan)) {
                    flatTasks = fallbackDom.plan.filter((t: any) => t && !t.isLoading);
                }
            }

            let monthlyTarget = this.getResolvedTarget(norm, month, year);
            if (!hasConfiguredTargets && monthlyTarget === 0) {
                monthlyTarget = d.domainData?.monthlyTarget || 0;
            }
            
            const createdTasksInMonth = flatTasks.filter((t: any) => {
                if (!t || !t.startDate) return false;
                const dObj = this.safeDate(t.startDate);
                return dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month;
            }).length;

            const doneTasksInMonth = flatTasks.filter((t: any) => {
                if (!t || !t.startDate) return false;
                const dObj = this.safeDate(t.startDate);
                return dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month && this.isTaskDone(t);
            }).length;

            const existingDayTasks = flatTasks.filter(
                (t: any) => t && t.startDate && this.safeIsoDate(t.startDate) === vDateStrIso
            );

            const missingTasksToCreate = Math.max(0, monthlyTarget - doneTasksInMonth);

            // Nếu ngày đó đã có sẵn công việc trên lịch (ví dụ 3 + 2 + 3 = 8 bài), giữ nguyên đúng số lượng bài của từng tên miền trong ngày đó khi cập nhật!
            // Nếu ngày đó chưa có công việc nào, tính theo số ngày làm việc thực tế còn lại trong tháng.
            let computedDailyTarget = 1;
            if (explicitPerDomainCount > 0) {
                computedDailyTarget = explicitPerDomainCount;
            } else if (existingDayTasks.length > 0) {
                computedDailyTarget = existingDayTasks.length;
            } else if (d.domainData?.dailyTarget && d.domainData.dailyTarget > 0) {
                computedDailyTarget = d.domainData.dailyTarget;
            } else if (monthlyTarget > 0) {
                const targetPool = missingTasksToCreate > 0 ? missingTasksToCreate : monthlyTarget;
                computedDailyTarget = Math.max(1, Math.ceil(targetPool / remainingWorkingDays));
            }

            let writingStyleInfo = 'Phong cách tự do';
            let domainWritingStyle = d.domainData?.writingStyle;
            if (!domainWritingStyle && this.settings?.domainStyles) {
                domainWritingStyle = this.settings.domainStyles[norm] || this.settings.domainStyles[rawName];
            }
            if (domainWritingStyle && this.settings?.styles) {
                const style = this.settings.styles.find((s: any) => s.name === domainWritingStyle || s.id === domainWritingStyle);
                if (style) {
                    writingStyleInfo = `${style.name}: ${style.desc}`;
                }
            }

            return {
                domain: norm,
                monthlyTarget: monthlyTarget,
                createdTasksInMonth: createdTasksInMonth,
                doneTasksInMonth: doneTasksInMonth,
                existingDayTasksCount: existingDayTasks.length,
                existingDayTasks: existingDayTasks.map((t: any) => ({
                    name: t.name || t.title || '',
                    meta: t.meta || ''
                })),
                missingTasksToCreate: missingTasksToCreate,
                workingDaysLeft: remainingWorkingDays,
                dailyTarget: computedDailyTarget,
                aiAnalysis: d.domainData?.note || 'Chưa có phân tích',
                writingStyle: writingStyleInfo
            };
        });

        const totalExpectedDayTasks = contextData.reduce(
            (sum: number, c: any) => sum + (Number(c.dailyTarget) || 0),
            0
        );
        const perDomainQuotaSummary = contextData
            .map((c: any) => `- ${c.domain}: BẮT BUỘC đúng ${c.dailyTarget} công việc`)
            .join('\n');

        const trimmedUserInstruction = (userInstruction || '').trim();
        const userRequestSection = trimmedUserInstruction
            ? `NGUYÊN VĂN YÊU CẦU TỪ NGƯỜI DÙNG:\n"${trimmedUserInstruction}"\n\nLƯU Ý ƯU TIÊN SỐ 1 VỀ NỘI DUNG: Nếu trong yêu cầu trên người dùng có chỉ định chủ đề, kịch bản hoặc định hướng cụ thể (ví dụ: viết kịch bản quảng cáo sản phẩm, review, khuyến mãi...), BẮT BUỘC 100% tiêu đề (name) và mô tả chi tiết (meta) của TẤT CẢ ${totalExpectedDayTasks} công việc phải bám sát yêu cầu cụ thể đó của người dùng, tùy biến sáng tạo theo từng nền tảng/ngách tên miền và không trùng lặp ý tưởng giữa các bài trong cùng tên miền!`
            : `Tạo mới / cập nhật danh sách công việc (tiêu đề name & mô tả meta) cho các tên miền trong duy nhất ngày ${vDateStrLocal} đạt đúng chỉ tiêu dailyTarget của từng tên miền và đưa toàn bộ về trạng thái MỚI (chưa làm).`;

        let dayPromptText = `DỮ LIỆU JSON CÁC TÊN MIỀN ĐÃ CHỌN CHO NGÀY ${vDateStrLocal}:
\`\`\`json
${JSON.stringify(contextData, null, 2)}
\`\`\`

YÊU CẦU CỦA NGƯỜI DÙNG:
${userRequestSection}

CHỈ TIÊU SỐ LƯỢNG BẮT BUỘC TRONG NGÀY ${vDateStrLocal} (TỔNG CỘNG ĐÚNG ${totalExpectedDayTasks} CÔNG VIỆC):
${perDomainQuotaSummary}

HƯỚNG DẪN ĐỊNH DẠNG TRẢ VỀ:
DỮ LIỆU CÔNG VIỆC BẮT BUỘC ĐẶT TRONG BLOCK CODE \`\`\`json ... \`\`\` THEO ĐÚNG CẤU TRÚC MẢNG SAU:
\`\`\`json
[
  {
    "domain": "ten-mien.com",
    "tasks": [
      {
        "name": "Tiêu đề cụ thể #1",
        "meta": "Mô tả chi tiết kịch bản / nội dung triển khai #1",
        "startDate": "${vDateStrIso}T08:00:00",
        "endDate": "${vDateStrIso}T17:00:00"
      }
    ]
  }
]
\`\`\`

QUY TẮC BẮT BUỘC:
1. Với MỖI tên miền, mảng "tasks" BẮT BUỘC có ĐÚNG số phần tử bằng "dailyTarget" của tên miền đó (Tổng số công việc trên toàn bộ các tên miền phải đúng bằng ${totalExpectedDayTasks} công việc; TUYỆT ĐỐI KHÔNG chỉ trả 1 bài khi dailyTarget > 1, và KHÔNG tạo thừa).
2. Định hướng chuyên môn mặc định (áp dụng kết hợp cùng yêu cầu cụ thể của người dùng):
   - type.vn / ai.type.vn: Nền tảng AI Content Creator, sáng tạo nội dung, bài viết blog SEO, Copywriting, tự động hóa marketing. TUYỆT ĐỐI CẤM viết về bàn phím, gõ 10 ngón, đánh máy chữ.
   - hopthu.vn: Dịch vụ Email Doanh nghiệp (Business Email), bảo mật email, chống spam, xác thực DKIM/SPF/DMARC.
   - tadu.cloud: Máy chủ đám mây, Cloud Server, Cloud Hosting, VPS NVMe tốc độ cao.
   - yenai.vn: Tin tức công nghệ, Trí tuệ nhân tạo (AI), AI Agent, giải pháp chuyển đổi số.
3. Mỗi công việc trong cùng một tên miền phải có tiêu đề (name) và kịch bản/mô tả (meta) riêng biệt, chi tiết, áp dụng đúng "writingStyle", "aiAnalysis" và đặc biệt là yêu cầu cụ thể của người dùng.
4. Tất cả các task BẮT BUỘC thuộc ngày ${vDateStrIso} (startDate: "${vDateStrIso}T08:00:00", endDate: "${vDateStrIso}T17:00:00") và ở trạng thái MỚI (chưa làm).`;

        let contents = [
            {
                role: 'user',
                parts: [{ text: dayPromptText }]
            }
        ];

        try {
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.8-flash',
                contents: contents,
                tools: [],
                config: { ttsVoice: 'none' }
            } as any);

            const aiMsg = response.text || (response as any).response?.text() || '';
            let dayParsed = this.getParsedAiTask(aiMsg);

            if (dayParsed) {
                // Chuẩn hóa mọi cấu trúc JSON từ AI (object map, flat array, tasks/suggested_tasks)
                let rawNormalizedList: { domain: string, tasks: any[] }[] = [];

                if (Array.isArray(dayParsed)) {
                    dayParsed.forEach((item: any) => {
                        if (!item) return;
                        const taskList = item.tasks || item.suggested_tasks || item.suggested_topics || (Array.isArray(item) ? item : null);
                        if (Array.isArray(taskList) && taskList.length > 0) {
                            rawNormalizedList.push({ domain: item.domain || '', tasks: taskList });
                        } else if (item.name || item.title) {
                            rawNormalizedList.push({ domain: item.domain || '', tasks: [item] });
                        }
                    });
                } else if (typeof dayParsed === 'object' && dayParsed !== null) {
                    const wrappedTasks = dayParsed.tasks || dayParsed.suggested_tasks || dayParsed.domains;
                    if (Array.isArray(wrappedTasks)) {
                        wrappedTasks.forEach((sub: any) => {
                            if (sub && (sub.domain || sub.tasks)) {
                                rawNormalizedList.push({
                                    domain: sub.domain || dayParsed.domain || '',
                                    tasks: Array.isArray(sub.tasks) ? sub.tasks : [sub]
                                });
                            }
                        });
                    } else {
                        Object.keys(dayParsed).forEach(key => {
                            if (Array.isArray(dayParsed[key])) {
                                rawNormalizedList.push({ domain: key, tasks: dayParsed[key] });
                            }
                        });
                    }
                }

                // XÂY DỰNG normalizedList CHÍNH XÁC THEO TỪNG TÊN MIỀN TRONG contextData (GỘP TẤT CẢ ENTRY CÙNG DOMAIN)
                let normalizedList: { domain: string, tasks: any[] }[] = [];

                contextData.forEach((ctx: any) => {
                    if (!ctx.domain || ctx.dailyTarget <= 0) return;
                    const normCtxDomain = normalizeDomainHelper(ctx.domain);
                    const matchingEntries = rawNormalizedList.filter(
                        (entry: any) => normalizeDomainHelper(entry.domain) === normCtxDomain
                    );
                    let finalTasks = matchingEntries.flatMap((entry: any) =>
                        Array.isArray(entry.tasks) ? entry.tasks : []
                    );
                    
                    // Cắt bớt nếu AI trả thừa bài
                    if (finalTasks.length > ctx.dailyTarget) {
                        finalTasks = finalTasks.slice(0, ctx.dailyTarget);
                    }

                    // Bổ sung nếu AI trả thiếu bài
                    if (finalTasks.length < ctx.dailyTarget) {
                        const needed = ctx.dailyTarget - finalTasks.length;
                        for (let k = 1; k <= needed; k++) {
                            finalTasks.push({
                                name: `Kịch bản nội dung ${ctx.domain} #${finalTasks.length + 1}`,
                                meta: trimmedUserInstruction
                                    ? `Triển khai theo yêu cầu: ${trimmedUserInstruction} (${vDateStrLocal})`
                                    : `Nội dung truyền thông tự động đạt chỉ tiêu ngày ${vDateStrLocal}`,
                                startDate: `${vDateStrIso}T08:00:00`,
                                endDate: `${vDateStrIso}T17:00:00`
                            });
                        }
                    }

                    normalizedList.push({
                        domain: ctx.domain,
                        tasks: finalTasks
                    });
                });

                // Cập nhật ngày và reset trạng thái 'chưa làm' (pending, done: false) cho tất cả các task
                normalizedList.forEach((d: any) => {
                    if (d.tasks && Array.isArray(d.tasks)) {
                        d.tasks.forEach((t: any) => {
                            t.startDate = t.startDate || `${vDateStrIso}T08:00:00`;
                            t.endDate = t.endDate || `${vDateStrIso}T17:00:00`;
                            t.done = false;
                            t.status = 'pending';
                            t.isDone = false;
                            t.completed = false;
                            t.percent = 0;
                            if (typeof t.meta === 'string') {
                                t.meta = t.meta.replace(/\[done\]/gi, '').replace(/\(done\)/gi, '').trim();
                            }
                        });
                    }
                });

                let previewMessage = `🤖 **DANH SÁCH CÔNG VIỆC AI ĐỀ XUẤT CHO NGÀY ${vDateStrLocal}**:\n\n`;
                let totalTasksCount = 0;
                normalizedList.forEach((d: any) => {
                    if (d.tasks && d.tasks.length > 0) {
                        totalTasksCount += d.tasks.length;
                        previewMessage += `📌 **Tên miền: ${d.domain}** (${d.tasks.length} bài):\n`;
                        d.tasks.forEach((t: any, idx: number) => {
                            previewMessage += `  ${idx + 1}. **${t.name || t.title}** (${t.meta || 'Nội dung SEO'})\n`;
                        });
                        previewMessage += `\n`;
                    }
                });

                const isWritingConfirm = this.isContentWritingCommand(trimmedUserInstruction);
                previewMessage += isWritingConfirm
                    ? `👉 *Sếp vui lòng kiểm tra danh sách **${totalTasksCount} chủ đề** ở trên. Bấm nút xác nhận bên dưới để em tiến hành viết chi tiết toàn bộ và lưu vào CSDL nhé!*`
                    : `👉 *Sếp vui lòng kiểm tra danh sách **${totalTasksCount} công việc** mới ở trên. Bấm nút xác nhận bên dưới để chính thức lưu vào CSDL nhé!*`;

                const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                this.chatHistory.push({
                    role: 'model',
                    content: previewMessage,
                    isConfirmMessage: true,
                    confirmData: {
                        type: 'save_day_parsed_tasks',
                        normalizedList: normalizedList,
                        vDateStrIso: vDateStrIso,
                        vDateStrLocal: vDateStrLocal,
                        year: year,
                        month: month,
                        day: day,
                        userRequest: trimmedUserInstruction,
                        buttonText: isWritingConfirm
                            ? `Xác nhận viết & lưu vào CSDL`
                            : `Xác nhận lưu vào CSDL`
                    },
                    time: nowTime
                });
                this.isChatting = false;
                this.saveScriptState();
                this.cd.detectChanges();
                this.scrollToBottom();
            } else {
                this.chatHistory.push({ role: 'model', content: `❌ Lỗi: AI không trả về dữ liệu hợp lệ cho ngày ${vDateStrLocal}.` });
                this.isChatting = false;
            }
        } catch (e: any) {
            console.error('Error generating day tasks', e);
            this.chatHistory.push({ role: 'model', content: `❌ Lỗi khi gọi AI: ${e.message || e}` });
            this.isChatting = false;
        }

        this.saveScriptState();
        this.cd.markForCheck();
    }

    private applyParsedTasks(parsed: any[]) {
        let hasAnyTasks = false;
        
        // Khắc phục trường hợp Global Agent tự ý wrap JSON vào command payload
        let wrappedData = null;
        if (parsed.length === 1) {
            if (parsed[0].tasks_by_domain) wrappedData = parsed[0].tasks_by_domain;
            else if (parsed[0].domains_to_process) wrappedData = parsed[0].domains_to_process;
        }
        
        if (wrappedData && Array.isArray(wrappedData)) {
            let extractedTasks: any[] = [];
            const tzOffsetStr = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            const currentMonth = this.month || (new Date().getMonth() + 1);
            const currentYear = new Date().getFullYear();
            
            // Build valid dates array
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            let validDates: string[] = [];
            for (let i = new Date().getDate(); i <= daysInMonth; i++) {
                const checkDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
                if (!this.disabledDates.has(checkDate)) {
                    validDates.push(checkDate);
                }
            }
            if (validDates.length === 0) validDates.push(tzOffsetStr(new Date()));
            
            wrappedData.forEach((d: any) => {
                let formattedTasks: any[] = [];
                const itemsToMap = d.suggested_tasks || d.suggested_topics || d.tasks || [];
                
                if (Array.isArray(itemsToMap)) {
                    formattedTasks = itemsToMap.map((t: any, idx: number) => {
                        const assignedDateStr = validDates[idx % validDates.length];
                        if (typeof t === 'object') {
                            return {
                                ...t,
                                name: t.name || t.title,
                                startDate: t.startDate || `${assignedDateStr}T08:00:00`,
                                endDate: t.endDate || `${assignedDateStr}T17:00:00`
                            };
                        }
                        return {
                            name: t,
                            startDate: `${assignedDateStr}T08:00:00`,
                            endDate: `${assignedDateStr}T17:00:00`
                        };
                    });
                }
                
                extractedTasks.push({
                    domain: d.domain,
                    tasks: formattedTasks
                });
            });
            parsed = extractedTasks;
        }

        const firstEnabledDomainName =
            (this.items || []).find(
                (it: any) =>
                    it &&
                    !it.isTotalRow &&
                    it.id !== 'total-summary-row' &&
                    it.id !== 'monthly-total-summary-row' &&
                    this.isDomainAutoWriteEnabled(it)
            )?.name || '';

        // Nếu AI lười, trả thẳng array task thay vì array domain
        if (parsed.length > 0 && !parsed[0].domain && (parsed[0].name || parsed[0].title)) {
            if (!firstEnabledDomainName) return false;
            parsed = [{
                domain: firstEnabledDomainName,
                tasks: parsed
            }];
        }

        // Update all tasks by merging
        parsed.forEach((parsedDomain: any) => {
            if (!parsedDomain) return;
            const domainRaw = (parsedDomain.domain || '').toLowerCase().trim();
            if (domainRaw.includes('tổng công việc')) {
                return; // Skip summary row payloads generated by AI
            }

            if (!parsedDomain.domain && parsedDomain.tasks) {
                parsedDomain.domain = firstEnabledDomainName;
            }
            const domainName = this.normalizeDomainKey(parsedDomain.domain || '');
            if (!domainName) return;

            const existingDomainIndex = this.items.findIndex((d: any) => {
                if (!d || d.isTotalRow || d.id === 'total-summary-row' || d.id === 'monthly-total-summary-row') return false;
                const dName = this.normalizeDomainKey(d?.domainData?.domain || d?.name || '');
                return dName === domainName;
            });

            if (existingDomainIndex === -1) {
                return;
            }

            if (!this.editingItem && !this.isDomainAutoWriteEnabled(this.items[existingDomainIndex])) {
                return;
            }

            if (existingDomainIndex > -1) {
                let existingDomain = { ...this.items[existingDomainIndex] };
                let domainPlan = (existingDomain as any).domainData?.plan;
                let newTasks = (Array.isArray(domainPlan) && domainPlan.length > 0) ? [...domainPlan] : (existingDomain.childrenItems?.[0]?.streamItems ? [...existingDomain.childrenItems[0].streamItems] : (existingDomain.childrenItems?.length ? [...existingDomain.childrenItems] : []));
                
                if (parsedDomain.tasks && Array.isArray(parsedDomain.tasks) && parsedDomain.tasks.length > 0) {
                    hasAnyTasks = true;
                    
                    // Chế độ update: Không tự động xoá task cũ theo ngày nữa.
                    // Các task mới (!t.id) sẽ được append.
                    // Các task cũ có id sẽ được update hoặc xoá (nếu có _deleted).

                    parsedDomain.tasks.forEach((t: any) => {
                        if (t._deleted) {
                            if (t.id) {
                                newTasks = newTasks.filter(existing => existing.id !== t.id);
                            } else if (t.startDate) {
                                // Fallback: Nếu AI quên ID, thử xóa dựa theo Ngày
                                const parseDateStr = (dStr: string | Date) => {
                                    const d = new Date(dStr);
                                    return isNaN(d.getTime()) ? null : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                                };
                                const targetDateStr = parseDateStr(t.startDate);
                                if (targetDateStr) {
                                    newTasks = newTasks.filter(existing => {
                                        if (!existing.startDate) return true;
                                        const existingDateStr = parseDateStr(existing.startDate);
                                        return existingDateStr !== targetDateStr;
                                    });
                                }
                            }
                        } else {
                            // 1. Match by ID
                            let targetTaskInDb = newTasks.find(existing => {
                                if (!existing) return false;
                                const tId = t._id || t.id;
                                const exId = existing._id || existing.id;
                                return tId && exId && String(tId) === String(exId);
                            });

                            // 2. Match by Name + Date
                            if (!targetTaskInDb && (t.name || t.title)) {
                                targetTaskInDb = newTasks.find(existing => {
                                    if (!existing || !existing.name) return false;
                                    if (existing.name.trim().toLowerCase() !== (t.name || t.title).trim().toLowerCase()) return false;
                                    const d1 = this.safeIsoDate(existing.startDate);
                                    const d2 = this.safeIsoDate(t.startDate);
                                    return d1 && d2 && d1 === d2;
                                });
                            }

                            const parseDateStr = (dStr: string) => {
                                if (!dStr) return new Date();
                                let d = new Date(dStr);
                                if (!isNaN(d.getTime())) return d;
                                
                                if (dStr.includes('/') || dStr.includes('-')) {
                                    const parts = dStr.split(/[ T]/);
                                    const datePart = parts[0];
                                    const timePart = parts.length > 1 ? parts[1] : '08:00:00';
                                    const dParts = datePart.split(/[\/-]/);
                                    if (dParts.length === 3) {
                                        const year = dParts.find(p => p.length === 4) || new Date().getFullYear().toString();
                                        const otherParts = dParts.filter(p => p.length !== 4);
                                        if (otherParts.length === 2) {
                                            const p1 = parseInt(otherParts[0]);
                                            const p2 = parseInt(otherParts[1]);
                                            const month = p1 > 12 ? p2 : p1;
                                            const day = p1 > 12 ? p1 : p2;
                                            const formattedMonth = month.toString().padStart(2, '0');
                                            const formattedDay = day.toString().padStart(2, '0');
                                            d = new Date(`${year}-${formattedMonth}-${formattedDay}T${timePart}`);
                                            if (!isNaN(d.getTime())) return d;
                                        }
                                    }
                                }
                                return new Date();
                            };

                            const sDate = this.getNextValidDate(parseDateStr(t.startDate));
                            sDate.setHours(8, 0, 0, 0);
                            const eDate = this.getNextValidDate(parseDateStr(t.endDate));
                            eDate.setHours(17, 0, 0, 0);
                            const tIsoDate = this.safeIsoDate(sDate);

                            // 3. Fallback: Match by Position (Index) among existing tasks on that specific day to avoid doubling tasks!
                            if (!targetTaskInDb && tIsoDate) {
                                const existingOnDay = newTasks.filter(ex => ex && this.safeIsoDate(ex.startDate) === tIsoDate);
                                const indexOfTInParsedDay = parsedDomain.tasks.filter((pt: any) => this.safeIsoDate(pt.startDate) === tIsoDate).indexOf(t);
                                if (indexOfTInParsedDay >= 0 && indexOfTInParsedDay < existingOnDay.length) {
                                    targetTaskInDb = existingOnDay[indexOfTInParsedDay];
                                }
                            }

                            const existingIndex = targetTaskInDb ? newTasks.findIndex(ex => ex === targetTaskInDb) : -1;

                            const mappedTask: any = {
                                id: targetTaskInDb ? (targetTaskInDb._id || targetTaskInDb.id) : (t._id || t.id || Math.random().toString(36).substring(7)),
                                _id: targetTaskInDb ? (targetTaskInDb._id || targetTaskInDb.id) : (t._id || t.id),
                                _rev: targetTaskInDb ? targetTaskInDb._rev : t._rev,
                                name: t.name || t.title,
                                meta: t.meta || '',
                                startDate: sDate,
                                endDate: eDate,
                                done: typeof t.done !== 'undefined' ? t.done : false,
                                status: t.status || 'pending',
                                isDone: false,
                                completed: false,
                                percent: 0,
                                canResizeLeft: true,
                                canResizeRight: true,
                                canDragX: true,
                                canDragY: true
                            };
                            
                            if (existingIndex > -1) {
                                newTasks[existingIndex] = { 
                                    ...newTasks[existingIndex], 
                                    ...mappedTask,
                                    done: typeof t.done !== 'undefined' ? t.done : false,
                                    status: t.status || 'pending',
                                    isDone: false,
                                    completed: false,
                                    percent: 0
                                };
                            } else {
                                const isDup = newTasks.some((ex: any) => {
                                    if (ex.id && mappedTask.id && ex.id === mappedTask.id) return true;
                                    if (ex.name && mappedTask.name && ex.name.trim() === mappedTask.name.trim()) {
                                        return this.safeIsoDate(ex.startDate) === this.safeIsoDate(mappedTask.startDate);
                                    }
                                    return false;
                                });
                                if (!isDup) {
                                    newTasks.push(mappedTask);
                                }
                            }
                        }
                    });
                    
                    const activeViewMonth = this.month || (new Date().getMonth() + 1);
                    const activeViewYear = this.year || new Date().getFullYear();
                    const visibleMonthTasks = newTasks.filter((nt: any) => this.isTaskInMonth(nt, activeViewMonth, activeViewYear));
                    this.applyPackedTasks(existingDomain, visibleMonthTasks);
                    if ((existingDomain as any).domainData) {
                        (existingDomain as any).domainData.plan = visibleMonthTasks;
                    }
                    this.items[existingDomainIndex] = existingDomain;
                }
            }
        });
        
        if (hasAnyTasks) {
            this.items = [...this.items];
            this.saveScriptState();
            this.cd.detectChanges();
        }
        return hasAnyTasks;
    }
    
    getParsedAiTask(content: string): any {
        if (!content) return null;
        
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
        let jsonStr = match && match[1] ? match[1].trim() : content;
        
        const startObj = jsonStr.indexOf('{');
        const startArr = jsonStr.indexOf('[');
        let endObj = jsonStr.lastIndexOf('}');
        let endArr = jsonStr.lastIndexOf(']');
        
        const start = startArr !== -1 && (startObj === -1 || startArr < startObj) ? startArr : startObj;
        let end = endArr !== -1 && (endObj === -1 || endArr > endObj) ? endArr : endObj;
        
        if (start !== -1) {
            if (end === -1 || end < start) {
                // Truncated JSON
                const lastBrace = jsonStr.lastIndexOf('}');
                if (start === startArr) {
                    if (lastBrace !== -1 && lastBrace > start) {
                        jsonStr = jsonStr.substring(start, lastBrace + 1) + ']';
                    } else {
                        jsonStr = jsonStr.substring(start) + ']';
                    }
                } else {
                    jsonStr = jsonStr.substring(start) + '}';
                }
            } else {
                jsonStr = jsonStr.substring(start, end + 1);
            }
            
            try {
                return JSON.parse(jsonStr);
            } catch (e) {
                console.warn('Failed to parse AI JSON:', e);
            }
        }
        
        return null;
    }

    getAiMessageText(content: string): string {
        if (!content) return '';
        const match = content.match(/([\s\S]*?)```(?:json)?/i);
        if (match && match[1]) {
            return match[1].trim();
        }
        
        // If no markdown block, return content without JSON
        const start = content.indexOf('{');
        if (start !== -1) {
            return content.substring(0, start).trim();
        }
        
        return content;
    }



    setupDragToScroll() {
        if (!this._timelineElement) return;
        const ele = this._timelineElement.nativeElement as HTMLElement;
        if (!ele || this.boundTimelineElements.has(ele)) return;
        this.boundTimelineElements.add(ele);

        ele.style.cursor = 'grab';

        this.zone.runOutsideAngular(() => {
            const stopCheckboxBubble = (e: Event) => {
                const target = e.target as HTMLElement | null;
                if (
                    target &&
                    target.classList.contains('domain-autowrite-checkbox')
                ) {
                    e.stopPropagation();
                }
            };

            ele.addEventListener('click', stopCheckboxBubble);
            ele.addEventListener('touchstart', stopCheckboxBubble, {
                passive: true,
            });

            ele.addEventListener('change', (e: Event) => {
                const target = e.target as HTMLInputElement | null;
                if (
                    target &&
                    target.classList.contains('domain-autowrite-checkbox')
                ) {
                    e.stopPropagation();
                    const key =
                        target.getAttribute('data-domain-key') ||
                        target
                            .closest('.panel-item')
                            ?.getAttribute('data-domain-key') ||
                        '';
                    if (key) {
                        this.setDomainAutoWriteByKey(key, !!target.checked);
                    }
                }
            });

            ele.addEventListener('mousedown', (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('domain-autowrite-checkbox')) {
                    e.stopPropagation();
                    return;
                }
                if (
                    target.closest(
                        '.timeline-item, .panel-item, .label, input, button, .item-content, [mwlResizeHandle]'
                    )
                ) {
                    return;
                }

                this.isDraggingTimeline = true;
                ele.style.cursor = 'grabbing';
                this.timelineStartX = e.pageX - ele.offsetLeft;
                this.timelineStartY = e.pageY - ele.offsetTop;
                this.timelineScrollLeft = ele.scrollLeft;
                this.timelineScrollTop = ele.scrollTop;
            });

            ele.addEventListener('mouseleave', () => {
                this.isDraggingTimeline = false;
                ele.style.cursor = 'grab';
            });

            ele.addEventListener('mouseup', () => {
                this.isDraggingTimeline = false;
                ele.style.cursor = 'grab';
            });

            ele.addEventListener('mousemove', (e: MouseEvent) => {
                if (!this.isDraggingTimeline) return;
                e.preventDefault();
                const x = e.pageX - ele.offsetLeft;
                const y = e.pageY - ele.offsetTop;
                const walkX = (x - this.timelineStartX) * 1.5;
                const walkY = (y - this.timelineStartY) * 1.5;
                ele.scrollLeft = this.timelineScrollLeft - walkX;
                ele.scrollTop = this.timelineScrollTop - walkY;
            });
        });
    }
}

// force recompile
