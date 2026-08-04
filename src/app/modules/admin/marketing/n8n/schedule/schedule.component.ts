import { ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, TemplateRef, ViewChild, ViewEncapsulation, AfterViewInit, AfterViewChecked, ChangeDetectionStrategy, Input } from '@angular/core';
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
    ITimelineItem,
    TimelineComponent,
    IItemTimeChangedEvent,
    TimelineViewMode,
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
registerLocaleData(localeVi);

export interface ICustomTimelineItem extends ITimelineItem {
    domainData?: any;
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

@Component({
    selector: 'amxh-schedule',
    templateUrl: './schedule.component.html',
    styleUrls: ['./schedule.component.scss'],
    providers: [BlogService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
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

    items: ICustomTimelineItem[] = [];
    
    timelineStartDate: Date = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1, 0, 0, 0, 0);
    timelineEndDate: Date = new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0, 23, 59, 59, 999);

    updateTimeline3MonthsRange(month?: number) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const targetMonth = (month && month >= 1 && month <= 12) ? (month - 1) : now.getMonth();
        
        this.timelineStartDate = new Date(currentYear, targetMonth - 1, 1, 0, 0, 0, 0);
        this.timelineEndDate = new Date(currentYear, targetMonth + 2, 0, 23, 59, 59, 999);
    }
    
    customZooms = [
        { columnWidth: 120, viewMode: TimelineViewMode.Day }, // Mức 0: Nhỏ nhất (5px mỗi giờ)
        { columnWidth: 240, viewMode: TimelineViewMode.Day }, // Mức 1: Vừa (10px mỗi giờ)
        { columnWidth: 720, viewMode: TimelineViewMode.Day }, // Mức 2: To nhất (30px mỗi giờ)
    ];
    disabledDates: Set<string> = new Set();

    @ViewChild("timeline") timelineComponent: TimelineComponent;
    
    private _timelineElement!: ElementRef;
    @ViewChild("timeline", { read: ElementRef }) set timelineElement(el: ElementRef) {
        if (el && !this._timelineElement) {
            this._timelineElement = el;
            setTimeout(() => this.setupDragToScroll(), 0);
        } else {
            this._timelineElement = el;
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
        { id: 'Lịch làm việc', icon: 'heroicons_outline:calendar', url: '/amxh', panel: 'schedule' },
        { id: 'Quản lý bài viết', icon: 'heroicons_outline:document-text', url: '/admin/marketing/clone-product' },
        { id: 'SEO Links', icon: 'heroicons_outline:link', url: '/admin/marketing/seo-links' }
    ];
    filteredMentionOptions: any[] = [];

    // [NEW] Biến trạng thái Slide Chat rộng (Hover & Pin)
    isChatHovered: boolean = false;
    isChatFocused: boolean = false;
    isChatPinned: boolean = false;
    private chatHoverTimeout: any = null;

    onChatMouseEnter() {
        if (this.chatHoverTimeout) {
            clearTimeout(this.chatHoverTimeout);
            this.chatHoverTimeout = null;
        }
        if (!this.isChatHovered) {
            this.isChatHovered = true;
            this.cd.detectChanges();
        }
    }

    onChatMouseLeave() {
        if (this.chatHoverTimeout) {
            clearTimeout(this.chatHoverTimeout);
        }
        this.chatHoverTimeout = setTimeout(() => {
            this.isChatHovered = false;
            this.cd.detectChanges();
        }, 250);
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
        private _globalAgentService: GlobalAgentService,
        private _h: HelperService,
        private _forumService: ForumService
    ) {
        this.titleService.setTitle(`lên kịch bản | ai.type - công cụ tạo content`);

        this.settings = this.multiAccountService.getItem('settings');
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
                                const requestYear = new Date().getFullYear();
                                const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                                const validDomains = this.items.filter(item => item && item.id !== 'total-summary-row' && item.id !== 'monthly-total-summary-row');
                                const monthStr = requestMonth.toString().padStart(2, '0');

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
- 🎯 **Tổng chỉ tiêu toàn hệ thống**: **${totalMonthlyTargetSum} bài** (${validDomains.length} Tên miền)
- 📝 **Số bài đã lên lịch sẵn**: **${totalCreatedTasksSum} bài**
- 🚀 **Số bài bắt buộc tạo mới**: **${totalMissingTasksSum} bài**

---

### 📋 2. Chi tiết phân bổ chỉ tiêu theo từng Tên miền (Domain):

| Tên miền | Đã có | Cần tạo |
|---|:---:|:---:|
${domainRows.join('\n')}

---

👉 *Sếp vui lòng kiểm tra kế hoạch chi tiết ở trên và bấm nút xác nhận bên dưới để em bắt đầu khởi chạy kịch bản nhé!*`;

                                this.chatHistory.push({
                                    role: 'model',
                                    content: confirmContent,
                                    isConfirmMessage: true,
                                    confirmData: { month: requestMonth, year: requestYear }
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
            this.processDomains(state.domains, state.statsData, state.month, state.forceGenerate);
            
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

            this.scrollToToday();
            
            // Ép timeline tính toán lại toàn bộ vị trí các khối task
            if (typeof this.timelineComponent['_recalculateItemPositions'] === 'function') {
                this.timelineComponent['_recalculateItemPositions']();
                this.cd.detectChanges();
            }
        }

        // nếu truyền data captions từ bên ngoài
        if (this.data) {
            this.captions = this.data || [];
        }
    }

  private safeDate(d: any): Date {
      if (!d) return new Date();
      let dt: Date;
      if (d instanceof Date) {
          dt = isNaN(d.getTime()) ? new Date() : d;
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
                      const year = new Date().getFullYear().toString();
                      const otherParts = dParts.filter(p => p.length !== 4);
                      if (otherParts.length === 2) {
                          const p1 = parseInt(otherParts[0], 10);
                          const p2 = parseInt(otherParts[1], 10);
                          const month = p1 > 12 ? p2 : p1;
                          const day = p1 > 12 ? p1 : p2;
                          const formattedMonth = month.toString().padStart(2, '0');
                          const formattedDay = day.toString().padStart(2, '0');
                          dt = new Date(`${year}-${formattedMonth}-${formattedDay}T${timePart}`);
                      }
                  }
              }
          }
          if (isNaN(dt.getTime())) dt = new Date();
      } else {
          dt = new Date();
      }

      // If the date's year is different from the current view year (e.g. 2023 vs 2026),
      // adjust the year to current year so the timeline component doesn't attempt to compute 3 years of columns and freeze!
      const currentYear = new Date().getFullYear();
      if (dt.getFullYear() !== currentYear) {
          dt.setFullYear(currentYear);
      }

      return dt;
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

    ngAfterViewChecked(): void { 
        this.renderCheckboxesInHeader();
    }

    private renderCheckboxesInHeader() {
        if (!this.timelineComponent || !this.timelineComponent.zoom) return;
        
        // Chỉ thêm checkbox ở chế độ xem Ngày (chứa từng ngày trên 1 cột)
        if (this.timelineComponent.zoom.viewMode !== TimelineViewMode.Day) return;

        const headerEl = this._timelineElement?.nativeElement?.querySelector('timeline-scale-header');
        if (!headerEl) return;
        
        const columns = headerEl.querySelectorAll('.columns .column');
        if (!columns || columns.length === 0) return;

        columns.forEach((col: HTMLElement, index: number) => {
            const scaleColumn = this.timelineComponent.scale.columns[index];
            if (!scaleColumn || !scaleColumn.date) return;
            
            const dateStr = this.safeIsoDate(scaleColumn.date);
            const colWidth = col.offsetWidth || col.getBoundingClientRect().width;

            let checkboxDiv = col.querySelector('.day-disable-checkbox') as HTMLElement;
            if (!checkboxDiv) {
                col.style.display = 'flex';
                col.style.flexDirection = 'row';
                col.style.alignItems = 'center';
                col.style.justifyContent = 'center';

                checkboxDiv = document.createElement('div');
                checkboxDiv.className = 'day-disable-checkbox';
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
                
                // Xử lý sự kiện ngay khi chuột ấn xuống (mousedown/touchstart) để đạt tốc độ phản hồi nhanh nhất và né bị thư viện chặn
                const handleToggle = (e: any) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    this.zone.run(() => {
                        const isNowChecked = !this.disabledDates.has(dateStr);
                        input.checked = isNowChecked;
                        
                        if (isNowChecked) {
                            this.disabledDates.add(dateStr);
                            
                            // Chỉ lọc và repack cho các domain có task rơi vào ngày này
                            let updatedAny = false;
                            if (this.items && this.items.length) {
                                this.items.forEach(domain => {
                                    if (domain.domainData && domain.domainData.plan && domain.domainData.plan.length > 0) {
                                        const hasTaskOnDate = domain.domainData.plan.some((t: any) => t.startDate && this.safeIsoDate(t.startDate) === dateStr);
                                        if (hasTaskOnDate) {
                                            domain.domainData.plan = domain.domainData.plan.filter((t: any) => {
                                                if (!t.startDate) return true;
                                                return this.safeIsoDate(t.startDate) !== dateStr;
                                            });
                                            this.applyPackedTasks(domain, domain.domainData.plan);
                                            updatedAny = true;
                                        }
                                    }
                                });
                                if (updatedAny) {
                                    this.updateTotalSummaryRow();
                                }
                            }
                        } else {
                            this.disabledDates.delete(dateStr);
                        }
                        
                        this.saveScriptState();
                        this.cd.detectChanges();

                        // Hoãn lưu xuống CSDL DB (Debounce 800ms): Xử lý LẦN LƯỢT TỪNG DOMAIN để không làm quá tải băng thông & CSDL
                        if (this.syncDisabledDatesDebounceTimer) {
                            clearTimeout(this.syncDisabledDatesDebounceTimer);
                        }
                        this.syncDisabledDatesDebounceTimer = setTimeout(async () => {
                            if (this.items && this.items.length && this.user && this.user.name) {
                                const domainItems = this.items.filter(d => d && d.domainData && !(d as any).isTotalRow);
                                for (const domain of domainItems) {
                                    domain.domainData.disabledDates = Array.from(this.disabledDates);
                                    try {
                                        const res: any = await firstValueFrom(
                                            this._domainService.edit({
                                                username: this.user.name,
                                                domain: domain.domainData
                                            }).pipe(takeUntil(this._unsubscribeAll))
                                        );
                                        if (res && res.success && res.data && res.data._rev) {
                                            domain.domainData._rev = res.data._rev;
                                        }
                                    } catch (e) {
                                        // Bỏ qua lỗi mạng lẻ để không nghẽn tiến trình các domain khác
                                    }
                                }
                            }
                        }, 800);
                    });
                };

                checkboxDiv.addEventListener('mousedown', handleToggle);
                checkboxDiv.addEventListener('touchstart', handleToggle);
                checkboxDiv.addEventListener('click', (e: any) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                
                checkboxDiv.appendChild(input);
                checkboxDiv.appendChild(label);
                col.appendChild(checkboxDiv);
            } else {
                const input = checkboxDiv.querySelector('input');
                if (input && input.checked !== this.disabledDates.has(dateStr)) {
                    input.checked = this.disabledDates.has(dateStr);
                }
            }
        });
        
        // Cuộn khung chat xuống dưới cùng khi mới vào màn hình
        this.scrollToBottom();
    }

    ngOnDestroy(): void {
        this.sttCaptionUnsubscribe?.();
        this.sttCaptionUnsubscribe = undefined;
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
        this.liveStop$.next();
        this.liveStop$.complete();
    }

    // --- TIMELINE & ZOOM ---
    zoomIn(): void { this.timelineComponent.zoomIn(); }
    zoomOut(): void { this.timelineComponent.zoomOut(); }
    scrollToToday(): void { 
        // Đặt mặc định zoom tới index 1 (tương đương 10px mỗi giờ) để lịch nhỏ gọn hơn
        this.timelineComponent.changeZoomByIndex(1); 
        this.timelineComponent.attachCameraToDate(new Date()); 
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

    toggleTaskDone(task: any, event?: Event) {
        if (event) event.stopPropagation();
        task.done = !task.done;
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
            profiles_root: 'C:\\OperaProfiles', host: '127.0.0.1', verify: true, filter: "running", include_accounts: true, platform: 'tiktok', username: this.user.name
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
    month: number;

    async processDomains(domains: any[], statsData: any, month: number, forceGenerate: boolean = false) {
        domains = (domains || []).filter((d: any) => {
            if (!d) return false;
            const dName = d.domain || d.name || '';
            return dName && !dName.includes('Tổng công việc') && !d.isTotalRow && !d.isMonthlyTotalRow;
        });
        this.statsData = statsData;
        this.month = month;
        this.updateTimeline3MonthsRange(month);
        this.toastr.info('Đang nạp dữ liệu tên miền...', 'Xử lý');
        this.disabledDates.clear();

        if (domains && domains.length > 0) {
            domains.forEach(d => {
                if (d.disabledDates && Array.isArray(d.disabledDates)) {
                    d.disabledDates.forEach((date: string) => this.disabledDates.add(date));
                }
            });
        }

        // Pre-populate all domain rows in this.items immediately so domain list doesn't vanish
        this.items = domains.map((domainData: any, index: number) => {
            const dName = domainData.domain || domainData.name || `Domain-${index + 1}`;
            if (!domainData.domain) domainData.domain = dName;
            if (!domainData.name) domainData.name = dName;

            const existingPlan = domainData.plan || [];
            const packed = this.packTasks(existingPlan.map((task: any) => ({
                ...task,
                startDate: new Date(task.startDate),
                endDate: new Date(task.endDate || new Date(task.startDate).setHours(17, 0, 0, 0))
            })), index);

            return {
                id: index,
                name: dName,
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
                await this.generateDomainData(domains[i], i, statsData, month, forceGenerate);
            }
        } else {
            const requests = domains.map((domainData: any, index: number) => {
                return this.generateDomainData(domainData, index, statsData, month, forceGenerate);
            });
            await Promise.all(requests);
        }
        
        if (forceGenerate) {
            this._globalAgentService.sendStreamMessage({
                role: 'model',
                content: '✅ Tiến trình phân tích và tạo công việc cho tất cả tên miền đã hoàn tất!',
                isStreaming: false
            });
        }
        
        this.updateTotalSummaryRow();
        this.saveScriptState();
        this.cd.markForCheck();
        this.toastr.success('Hoàn thành lên kế hoạch cho tên miền!');
        
        // Cuộn timeline tới khung giờ hiện tại và zoom to nhất để nhìn rõ chữ
        setTimeout(() => {
            this.scrollToToday();
            this.cd.markForCheck();
        }, 100);
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
            domainItem = {
                id: index,
                name: dName,
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

        if (!forceGenerate) {
            return;
        }

        // Tính toán chỉ tiêu trong ngày
        let dailyTarget = 0;
        let currentResult = 0;
        let missing = 0;
        const targetYear = new Date().getFullYear();

        if (domainData.monthlyTarget && domainData.monthlyTarget > 0) {
            const existingTasksInMonth = (domainData.plan || []).filter((t: any) => {
                if (!t || !t.startDate || t.isLoading) return false;
                const dObj = this.safeDate(t.startDate);
                return dObj && dObj.getFullYear() === targetYear && (dObj.getMonth() + 1) === month;
            }).length;

            currentResult = existingTasksInMonth;
            missing = forceGenerate ? domainData.monthlyTarget : Math.max(0, domainData.monthlyTarget - currentResult);
            
            const isCurrentMonth = (month === (new Date().getMonth() + 1));
            const startDay = isCurrentMonth ? new Date().getDate() : 1;
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

        const isCurrentMonth = (month === (new Date().getMonth() + 1));
        const startDay = isCurrentMonth ? new Date().getDate() : 1;
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
            let eDate = new Date(vDate); eDate.setHours(17, 0, 0, 0);
            
            dayDummyIds[j] = [];
            for (let k = 0; k < distribution[j]; k++) {
                const dId = `dummy-${index}-${dummyCount++}`;
                dayDummyIds[j].push(dId);
                dummyStreamItems.push({
                    id: dId,
                    name: `Đang phân tích ngày ${vDate.getDate()}/${vDate.getMonth()+1}...`,
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
                    model: 'gemini-3.6-flash',
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
                    await Promise.all(chunk.map(t => {
                        const taskPayload = { ...t, domain_id: dName, domain: dName };
                        return firstValueFrom(this._tasksService.add({ username: this.user.name, task: taskPayload })).catch(() => {});
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
                model: 'gemini-3.6-flash',
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
        const profilesRoot = "D:\\\\OperaProfiles";
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

    getResolvedTarget(domain: string, month?: number, selectedYear?: number): number {
        const m = month || this.month || (new Date().getMonth() + 1);
        const y = selectedYear || new Date().getFullYear();
        this.settings = this.multiAccountService.getItem('settings');
        if (!this.settings || !this.settings.domainTargets) return 0;
        let target = this.settings.domainTargets[domain];
        if (target === undefined) return 0;
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
        for (let m = month - 1; m >= 1; m--) {
            if (typeof target[m] === 'number') return target[m];
        }
        
        return 0;
    }

    addSeconds(date: Date, seconds: number): Date {
        const result = new Date(date);
        result.setSeconds(result.getSeconds() + seconds);
        return result;
    }

    loadScheduleFromDB() {
        this._domainService.fetch({ username: this.user.name }).subscribe({
            next: (res: any) => {
                let domains: any[] = [];
                if (res && res.success && Array.isArray(res.data)) {
                    domains = res.data;
                } else if (res && Array.isArray(res.result)) {
                    domains = res.result;
                } else if (Array.isArray(res)) {
                    domains = res;
                }

                if (domains.length > 0) {
                    this.allDomainsList = [...domains];
                    const currentMonth = new Date().getMonth() + 1;
                    const currentYear = new Date().getFullYear();
                    domains.forEach((d: any) => {
                        if (!d.monthlyTarget) {
                            d.monthlyTarget = this.getResolvedTarget(d.domain, currentMonth, currentYear);
                        }
                        d.plan = []; // Initialize empty plan
                    });

                    // Fetch tasks from tasks db
                    this._tasksService.fetch({ username: this.user.name, year: currentYear }).subscribe({
                        next: (tasksRes: any) => {
                            let tasks: any[] = [];
                            if (Array.isArray(tasksRes)) {
                                tasks = tasksRes;
                            } else if (tasksRes && Array.isArray(tasksRes.data)) {
                                tasks = tasksRes.data;
                            } else if (tasksRes && Array.isArray(tasksRes.result)) {
                                tasks = tasksRes.result;
                            }
                            
                            if (tasks.length > 0) {
                                const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                                domains.forEach((d: any, index: number) => {
                                    const dNorm = normalizeDomain(d.domain || d.name || d.id);
                                    d.plan = tasks.filter((t: any) => {
                                        if (t.domain_id === d.domain || t.domain_id === d.id || t.domain_id === d._id) return true;
                                        const tNorm = normalizeDomain(t.domain_id || t.domain || t.domainName);
                                        return !!(tNorm && dNorm && tNorm === dNorm);
                                    });
                                });
                            }
                            this.processDomains(domains, undefined, currentMonth, false);
                        },
                        error: () => {
                            // If tasks fail to load, still process domains
                            this.processDomains(domains, undefined, currentMonth, false);
                        }
                    });
                } else {
                    this.loadScriptState();
                }
            },
            error: () => {
                this.loadScriptState();
            }
        });
    }

    saveScriptState() {
        try {
            // Chỉ lưu trạng thái giao diện UI (lịch sử chat, ngày bỏ qua), DỮ LIỆU CÔNG VIỆC VÀ TÊN MIỀN BẮT BUỘC LƯU VÀO CSDL COUCHDB
            this.multiAccountService.setItem(this.STORAGE_KEY + '_CHAT', this.chatHistory);
            this.multiAccountService.setItem(this.STORAGE_KEY + '_DISABLED_DATES', Array.from(this.disabledDates));
            this.multiAccountService.forceSave();
            
            // Cập nhật ngữ cảnh cho Global AI Agent trên Header
            if (this._globalAgentService) {
                const currentMonth = this.month || (new Date().getMonth() + 1);
                const currentYear = new Date().getFullYear();
                
                const summaryData = this.items.map(item => {
                    const streamItems = item.childrenItems?.[0]?.streamItems || [];
                    const monthlyTarget = item.domainData?.monthlyTarget || this.getResolvedTarget(item.name, currentMonth, currentYear) || 0;
                    const currentResult = (this.statsData && this.statsData[item.name] && this.statsData[item.name][currentMonth]) ? this.statsData[item.name][currentMonth] : 0;
                    
                    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
                    let remainingDays = 0;
                    for (let i = new Date().getDate(); i <= daysInMonth; i++) {
                        const checkDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
                        if (!this.disabledDates.has(checkDate)) {
                            remainingDays++;
                        }
                    }
                    
                    let missing = monthlyTarget - currentResult;
                    if (missing < 0) missing = 0;
                    const dailyTarget = monthlyTarget > 0 ? (remainingDays > 0 ? Math.ceil(missing / remainingDays) : missing) : 0;

                    return {
                        domain: item.name,
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
                            meta: t.meta || ''
                        }))
                    };
                });
                const tzOffset = -(new Date().getTimezoneOffset() / 60);
                const tzString = tzOffset >= 0 ? '+' + tzOffset : tzOffset;
                const disabledStr = Array.from(this.disabledDates).join(', ');

                const tzOffsetStr = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                const todayStr = tzOffsetStr(new Date());

                this._globalAgentService.updateContext({
                    sourcePage: 'Lịch làm việc (Schedule)',
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
\`\`\``
                });
            }
        } catch (e) { console.error('Lỗi khi lưu trạng thái:', e); }
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

    async deleteAllMonthTasksFromDB(year: number, month: number): Promise<number> {
        try {
            const monthTasksToDelete: any[] = [];
            const sourceLists = [
                ...(this.items || []).flatMap((d: any) => d?.childrenItems?.[0]?.streamItems || (d?.domainData?.plan || [])),
                ...(this.allDomainsList || []).flatMap((d: any) => d?.plan || [])
            ];

            sourceLists.forEach((t: any) => {
                if (!t || !t.startDate) return;
                const dObj = this.safeDate(t.startDate);
                if (dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month) {
                    monthTasksToDelete.push(t);
                }
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

    resetCurrentMonth() {
        const currentMonth = this.month || (new Date().getMonth() + 1);
        const currentYear = new Date().getFullYear();
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Khôi phục Mặc định',
            message: `Bạn có chắc chắn muốn xóa toàn bộ công việc trong tháng ${currentMonth} không? Hành động này không thể hoàn tác!`,
            icon: { show: true, name: 'feather:alert-triangle', color: 'error' },
            actions: { confirm: { show: true, label: 'Xóa Tất Cả', color: 'warn' }, cancel: { show: true, label: 'Hủy' } },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                // Thu thập các task thuộc tháng hiện tại trong bộ nhớ trước khi làm rỗng
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

                // 1. Xóa triệt để items trên giao diện TỨC THÌ (0ms chờ)
                for (let i = 0; i < this.items.length; i++) {
                    const domain = this.items[i];
                    if (!domain || domain.id === 'total-summary-row' || domain.id === 'monthly-total-summary-row') continue;

                    if (domain.domainData) {
                        domain.domainData.plan = [];
                    }
                    domain.streamItems = [];
                    domain.childrenItems = [];
                    this.applyPackedTasks(domain, []);
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
                this.toastr.success(`Đã xóa sạch công việc tháng ${currentMonth}!`);

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

    listLiveStream() { this._mxhautoService.listLiveStreasm({ "profile": "C:\\OperaProfiles\\Profile101", "port": 101, "launch_if_needed": true, "live_url": "https://www.tiktok.com/live", "timeout": 0, "max_items": 500, "idle_sec": 10, "max_duration": 60, "username": this.user.name }); }
    liveWatchStart() { this._mxhautoService.liveWatchStart({ "profile": "C:\\OperaProfiles\\Profile101", "port": 101, "launch_if_needed": true, "live_url": "https://www.tiktok.com/live", "interval_sec": 180 }).pipe(takeUntil(this._unsubscribeAll)).subscribe({ next: async (result: any) => { if (result && result.ok && result.watch_id) { this.toastr.success("Mở danh sách LiveStream."); localStorage.setItem('tiktok_watch_id', result.watch_id); this.liveStop$.next(); const totalSec = this.REFRESH_MS / 1000; const tick$ = timer(0, this.REFRESH_MS).pipe(shareReplay({ bufferSize: 1, refCount: true })); const data$ = tick$.pipe(switchMap(() => this.listLiveStream$().pipe(catchError(() => of({ rooms: [] })))), shareReplay({ bufferSize: 1, refCount: true })); data$.pipe(takeUntil(this.liveStop$), takeUntil(this._unsubscribeAll)).subscribe((res: any) => { if (res?.rooms) { this.rooms = [...res.rooms]; this.cd.markForCheck(); } }); this.countdown$ = data$.pipe(switchMap(() => interval(1000).pipe(startWith(0), map(i => Math.max(0, totalSec - i)), take(totalSec + 1))), shareReplay({ bufferSize: 1, refCount: true }), takeUntil(this.liveStop$), takeUntil(this._unsubscribeAll)) as Observable<number>; } }, error: () => { }, complete: () => { } }); }
    liveWatchStop(autorun?: boolean) { this.liveStop$.next(); this._mxhautoService.liveWatchStop({ "watch_id": localStorage.getItem('tiktok_watch_id'), "username": this.user.name }).pipe(takeUntil(this._unsubscribeAll)).subscribe({ next: async (result: any) => { if (result && result.ok) { this.job = null; this.toastr.warning("Tắt danh sách LiveStream."); if (autorun) { this.liveWatchStart(); } } }, error: () => { }, complete: () => { } }); }
    listLiveStream$() { return this._mxhautoService.listLiveStreasm({ "profile": "C:\\OperaProfiles\\Profile101", "port": 101, "launch_if_needed": true, "live_url": "https://www.tiktok.com/live", "timeout": 0, "max_items": 500, "idle_sec": 10, "max_duration": 60, "username": this.user.name }); }
    playLiveStream(room: any) { const hlsUrl = this.pickHlsUrlFromRoom(room); if (!hlsUrl) { console.error('Không tìm thấy HLS URL trong room'); return; } this.openSseTranscribe(hlsUrl); }
    startLivestream(hlsUrl: string) { if (this.ipcRenderer) { this.ipcRenderer.send('stt-send-to-chrome', { type: 'set-source', source: hlsUrl }); } }
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

        const dayMap: { [key: string]: { tasks: any[]; sDate: Date; eDate: Date } } = {};

        realDomainItems.forEach(domainItem => {
            let allStreamItems: any[] = [];
            if (domainItem.streamItems && domainItem.streamItems.length) {
                allStreamItems.push(...domainItem.streamItems);
            }
            if (domainItem.childrenItems && domainItem.childrenItems.length) {
                domainItem.childrenItems.forEach((child: any) => {
                    if (child && child.streamItems && child.streamItems.length) {
                        allStreamItems.push(...child.streamItems);
                    } else if (child && !child.streamItems) {
                        allStreamItems.push(child);
                    }
                });
            }
            if (domainItem.domainData && domainItem.domainData.plan && Array.isArray(domainItem.domainData.plan)) {
                allStreamItems.push(...domainItem.domainData.plan);
            }

            const uniqueStreamItems = Array.from(new Set(allStreamItems.map(st => st.id || st._id || st.name)))
                .map(id => allStreamItems.find(st => (st.id || st._id || st.name) === id))
                .filter(Boolean);

            uniqueStreamItems.forEach((st: any) => {
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
                        dayMap[dayKey] = { tasks: [], sDate, eDate };
                    }

                    if (!dayMap[dayKey].tasks.some(existing => (existing.id && existing.id === t.id) || (existing._id && existing._id === t._id) || (existing.name === t.name && existing.startDate === t.startDate))) {
                        dayMap[dayKey].tasks.push(t);
                    }
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
        const monthGroups: { [key: string]: { monthName: string; startDate: Date; endDate: Date; tasks: any[] } } = {};

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
                    domainId: 'monthly-total-summary-row'
                });
            }
        });

        const currentViewMonth = this.month || (new Date().getMonth() + 1);
        const tasksInCurrentViewMonth = allMonthTasks.filter(t => {
            const d = this.safeDate(t.startDate);
            return d && (d.getMonth() + 1) === currentViewMonth;
        });

        const monthlySummaryRow = {
            id: 'monthly-total-summary-row',
            name: `Tổng công việc Tháng ${currentViewMonth.toString().padStart(2, '0')} (${tasksInCurrentViewMonth.length})`,
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
            const count = dayTasks.length;
            
            const baseDate = this.safeDate(dayTasks[0].startDate);
            const sDate = new Date(baseDate.getTime());
            sDate.setHours(8, 0, 0, 0);

            const eDate = new Date(baseDate.getTime());
            eDate.setHours(17, 0, 0, 0);

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
                    name: `${count} công việc`,
                    isGroup: true,
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
    // @ NEW: Tự động lưu vào Soạn bài
    // -----------------------------------------------------------------------------------------------------
    saveDraftsToAiWriter(drafts: any[]) {
        if (!drafts || drafts.length === 0) return;
        this.toastr.info(`Đang lưu ${drafts.length} bài viết vào Soạn bài...`, 'Đang xử lý');
        let savedCount = 0;
        
        drafts.forEach(async draft => {
            const draftDomainName = (draft.domain || '').toLowerCase().trim().replace(/https?:\/\//, '').replace(/\/$/, '');
            let matchedItem = this.items?.find((i: any) => {
                const dName = (i.name || '').toLowerCase().trim().replace(/https?:\/\//, '').replace(/\/$/, '');
                return dName === draftDomainName;
            });
            if (!matchedItem && this.items && this.items.length > 0) {
                matchedItem = this.items[0]; // Fallback to first domain if not found
            }
            
            let domainData = matchedItem?.domainData || { domain: draft.domain || '' };
            
            let archivePayload = {
                title: draft.title || 'Bài viết mới',
                url: 'draft_' + Date.now() + Math.floor(Math.random() * 1000),
                source: {
                    title: [], description: [], url: [], domain: [],
                    img: [], h: [], a: [], p: [], source: [],
                    iframe: [], pre: [ draft.image_prompt || '' ], type: 'html', prompt: [ draft.title ],
                    synonyms: [], keyword: '', wp_post_id: null,
                    wp_domain: domainData.domain || draft.domain, wpPosts: [],
                    nodes: [], totalNodes: 1, wp_task_id: null
                },
                done: [ draft.content || '' ],
                trash: [],
                seo: {
                    description: { length: 0, text: draft.description || '' },
                    title: { length: 0, text: draft.title || '' },
                    links: 0, words: { basic: 0, total: 0 },
                    images: { total: 0, alt: 0 },
                    heading: {
                        h1: { total: 0, keys: [] }, h2: { total: 0, keys: [] },
                        h3: { total: 0, keys: [] }, h4: { total: 0, keys: [] }
                    }
                },
                arr_keyword: draft.tags || [],
                domain: domainData,
                username: this.user.name,
                thumbnail: draft.image_prompt || ''
            };

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

                    if (savedCount === drafts.length) {
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

    async sendChat(event?: Event) {
        if (event) {
            event.preventDefault();
        }
        if (!this.chatPrompt || !this.chatPrompt.trim() || this.isChatting) return;

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
                
                if (userMessage) {
                    // Send to global agent instead
                    // Wait for navigation, but for simplicity, we just skip it here
                    // because the global chatgpt2s component will handle global states.
                    // To keep it simple, we just navigate.
                }
                return;
            }
        }

        if (!userMessage) return;

        this.chatHistory.push({ role: 'user', content: userMessage });
        this.scrollToBottom();

        this.isChatting = true;
        this.cd.detectChanges();

        try {
            const executeMatch = userMessage.match(/(chạy|thực thi|viết bài).*?(bài viết|nội dung|kịch bản)/i);
            const isToday = userMessage.match(/(hôm nay|nay)/i);

            if (executeMatch && isToday) {
                let todayTasks: any[] = [];
                let todayStr = this.safeIsoDate(new Date());
                this.items.forEach((domain: any) => {
                    if (domain.childrenItems && domain.childrenItems[0] && domain.childrenItems[0].streamItems) {
                        domain.childrenItems[0].streamItems.forEach((task: any) => {
                            if (task.startDate) {
                                let tDate = this.safeIsoDate(task.startDate);
                                if (tDate === todayStr) {
                                    todayTasks.push({ ...task, domain: domain.name, originalTask: task });
                                }
                            }
                        });
                    }
                });

                if (todayTasks.length === 0) {
                    this.chatHistory.push({ role: 'model', content: `Dạ Sếp ơi, hôm nay không có task nào cả, sếp nghỉ ngơi đi ạ! 😎` });
                    this.isChatting = false;
                    this.cd.detectChanges();
                    this.scrollToBottom();
                    return;
                }

                this.chatHistory.push({ role: 'model', content: `Dạ Sếp! Em đang tiến hành chạy kịch bản viết bài cho **${todayTasks.length} task** của ngày hôm nay... 🚀` });
                this.cd.detectChanges();
                this.scrollToBottom();

                let successCount = 0;
                let pendingArticles = this.multiAccountService.getItem('pending_articles') || [];

                for (let i = 0; i < todayTasks.length; i++) {
                    if (!this.isChatting) {
                        this.chatHistory.push({ role: 'model', content: `🛑 Đã dừng xử lý theo yêu cầu của Sếp!` });
                        break;
                    }
                    const task = todayTasks[i];
                    
                    this.chatHistory.push({ role: 'model', content: `⏳ Đang xử lý task [${i+1}/${todayTasks.length}]: **${task.name}** (Domain: ${task.domain})...` });
                    this.cd.detectChanges();
                    this.scrollToBottom();

                    let domainData = this.items?.find((i: any) => i.name === task.domain)?.domainData || { domain: task.domain };
                    let styleInstructions = '';
                    if (domainData.note) {
                        styleInstructions += `\n- Phân tích chuyên môn (bám sát): ${domainData.note}`;
                    }
                    
                    let domainWritingStyle = domainData.writingStyle;
                    if (!domainWritingStyle && this.settings?.domainStyles) {
                        domainWritingStyle = this.settings.domainStyles[task.domain];
                    }
                    
                    if (domainWritingStyle && this.settings?.styles) {
                        const styleObj = this.settings.styles.find((s: any) => s.name === domainWritingStyle || s.id === domainWritingStyle);
                        if (styleObj) {
                            styleInstructions += `\n- Phong cách viết (BẮT BUỘC): ${styleObj.name} (${styleObj.desc})`;
                        }
                    }

                    try {
                        const prompt = `Bạn là chuyên gia Content SEO. Hãy viết một bài blog chi tiết cho website ${task.domain} với chủ đề/nhiệm vụ: "${task.name}".
Yêu cầu:${styleInstructions}
- Trả về ĐÚNG định dạng JSON sau, không kèm bất kỳ giải thích nào khác:
{
  "title": "Tiêu đề bài viết",
  "content": "Nội dung bài viết (HTML, có thẻ h2, h3)",
  "description": "Mô tả ngắn gọn",
  "image_prompt": "Gợi ý ảnh tiếng Anh cho bài viết"
}`;
                        const response = await this._genaiService.generateContent({
                            model: 'gemini-3.6-flash',
                            contents: [{ role: 'user', parts: [{ text: prompt }] }],
                            config: { ttsVoice: 'none' } as any
                        });
                        
                        let jsonText = response.text;
                        let articleData = null;
                        if (jsonText) {
                            try {
                                const jsonMatch = jsonText.match(/```json([\s\S]*?)```/);
                                if (jsonMatch) jsonText = jsonMatch[1];
                                articleData = JSON.parse(jsonText.trim());
                            } catch (e) {
                                articleData = { title: task.name, content: jsonText };
                            }
                        }
                        let archivePayload = {
                            title: articleData?.title || task.name,
                            url: task.id,
                            source: {
                                title: [], description: [], url: [], domain: [],
                                img: [], h: [], a: [], p: [], source: [],
                                iframe: [], pre: [ articleData?.image_prompt || '' ], type: 'html', prompt: [ task.name ],
                                synonyms: [], keyword: '', wp_post_id: null,
                                wp_domain: domainData.domain, wpPosts: [],
                                nodes: [], totalNodes: 1, wp_task_id: task.id
                            },
                            done: [ articleData?.content || '' ],
                            trash: [],
                            seo: {
                                description: { length: 0, text: articleData?.description || '' },
                                title: { length: 0, text: articleData?.title || task.name },
                                links: 0, words: { basic: 0, total: 0 },
                                images: { total: 0, alt: 0 },
                                heading: {
                                    h1: { total: 0, keys: [] }, h2: { total: 0, keys: [] },
                                    h3: { total: 0, keys: [] }, h4: { total: 0, keys: [] }
                                }, kw: []
                            },
                            arr_keyword: [],
                            domain: domainData,
                            username: this.user.name,
                            thumbnail: articleData?.image_prompt || ''
                        };

                        try {
                            const res: any = await firstValueFrom(this._crawlService.storeArchive(archivePayload));
                            if (res && res.success) {
                                this.chatHistory.push({ role: 'model', content: `✅ Đã viết và lưu xong bài: **${articleData?.title || task.name}** (UUID: ${res.data?.uuid}).` });
                            } else {
                                this.chatHistory.push({ role: 'model', content: `⚠️ Cảnh báo: API lưu bài thất bại - ${JSON.stringify(res)}` });
                            }
                        } catch (e: any) {
                            this.chatHistory.push({ role: 'model', content: `❌ Lỗi khi gọi API lưu bài: ${e.message}` });
                        }
                        task.originalTask.meta = (task.originalTask.meta ? task.originalTask.meta + ' ' : '') + 'Done';
                        task.originalTask.done = true;
                        successCount++;
                        
                        // Save to database by updating the real plan reference
                        let currentDomainData = this.items?.find((i: any) => i.name === task.domain)?.domainData;
                        if (currentDomainData && currentDomainData.plan) {
                            let planTask = currentDomainData.plan.find((t: any) => t.id === task.originalTask.id);
                            if (planTask) {
                                planTask.done = true;
                                planTask.meta = task.originalTask.meta;
                            }
                            this._tasksService.edit({
                                username: this.user.name,
                                task: planTask
                            }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
                        }
                        
                        // Force Angular Calendar Timeline to detect changes deeply by rebuilding from plan
                        let itemIndex = this.items.findIndex(it => it.name === task.domain);
                        if (itemIndex > -1 && currentDomainData && currentDomainData.plan) {
                            this.applyPackedTasks(this.items[itemIndex], currentDomainData.plan);
                        }
                        this.items = [...this.items];
                        this.cd.detectChanges();
                    } catch (err: any) {
                        this.chatHistory.push({ role: 'model', content: `❌ Lỗi khi xử lý task **${task.name}**: ${err.message}` });
                    }
                    
                    this.cd.detectChanges();
                    this.scrollToBottom();
                }

                if (this.isChatting) {
                    this.chatHistory.push({ role: 'model', content: `🎉 Báo cáo Sếp: Đã thực thi hoàn tất ${successCount}/${todayTasks.length} task! Toàn bộ bài viết & thumbnail đã được lưu ở trạng thái Chờ duyệt (Pending). Sếp có thể vào kiểm tra nhé! 😎` });
                }
                
                this.items = [...this.items];
                this.isChatting = false;
                this.cd.detectChanges();
                this.scrollToBottom();
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

                        // BẮT BUỘC hiển thị Thẻ Xác Nhận Kế Hoạch (Confirm Proposal Card) đối với mọi lệnh tạo/sửa công việc/lịch/ngày/tháng!
                        const isTaskCreateIntent = isDayRequest 
                            || isMonthRequest 
                            || !!userMessage.match(/(tạo|chỉnh sửa|sửa|lên|viết|phân bổ|sinh|tạo mới|cập nhật|đổi|làm|thêm|xóa|sắp xếp|tạo lại)/i);

                        if (isTaskCreateIntent && !isMonthRequest && !isDayRequest) {
                            isMonthRequest = true; // Mặc định đề xuất kế hoạch tháng hiện tại
                            requestMonth = new Date().getMonth() + 1;
                            requestYear = new Date().getFullYear();
                        }

                        if (isMonthRequest && isTaskCreateIntent) {
                            const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                            let validDomains = (this.allDomainsList && this.allDomainsList.length > 0) 
                                ? this.allDomainsList.map((d: any, i: number) => ({ id: i, name: d.domain || d.name, domainData: d, childrenItems: [{ streamItems: d.plan || [] }] }))
                                : this.items.filter((item: any) => item && item.id !== 'total-summary-row' && item.id !== 'monthly-total-summary-row');
                            const monthStr = requestMonth.toString().padStart(2, '0');

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
                                const streamItems = item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || []);
                                
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
- 🎯 **Tổng chỉ tiêu toàn hệ thống**: **${totalMonthlyTargetSum} bài** (${validDomains.length} Tên miền)
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

                            this.chatHistory.push({
                                role: 'model',
                                content: confirmContent,
                                isConfirmMessage: true,
                                confirmData: { type: 'month', month: requestMonth, year: requestYear }
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
                                    content: `❌ **Không thể tạo/chỉnh sửa công việc**: Báo cáo Sếp, ${rejectReason} nên em không thể tạo hoặc chỉnh sửa công việc cho ngày này được ạ! Sếp vui lòng chọn một ngày từ hôm nay trở đi và chưa bị tích "Bỏ qua" nhé! 😊`
                                });
                                this.isChatting = false;
                                this.cd.detectChanges();
                                this.scrollToBottom();
                                return;
                            }

                            let validDomains: any[] = (this.allDomainsList && this.allDomainsList.length > 0) 
                                ? this.allDomainsList.map((d: any, i: number) => ({ id: i, name: d.domain || d.name, domainData: d, childrenItems: [{ streamItems: d.plan || [] }] }))
                                : this.items.filter((item: any) => item && item.id !== 'total-summary-row' && item.id !== 'monthly-total-summary-row');

                            validDomains = validDomains.filter((item: any) => {
                                const monthlyTarget = item.domainData?.monthlyTarget || this.getResolvedTarget(item.name, requestMonth, requestYear) || 0;
                                const streamItems = item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || []);
                                const createdTasksOnDay = streamItems.filter((t: any) => {
                                    if (!t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    if (!dObj) return false;
                                    const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                                    return dIso === dateIsoStr;
                                }).length;
                                return monthlyTarget > 0 || createdTasksOnDay > 0;
                            });

                            const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                            const now = new Date();
                            const startDay = (requestYear === now.getFullYear() && requestMonth === (now.getMonth() + 1)) ? now.getDate() : 1;
                            
                            let workingDaysLeft = 0;
                            for (let i = startDay; i <= daysInMonth; i++) {
                                const checkDate = `${requestYear}-${monthStr}-${i.toString().padStart(2, '0')}`;
                                if (!this.disabledDates.has(checkDate)) {
                                    workingDaysLeft++;
                                }
                            }

                            let totalDayCreatedTasksSum = 0;
                            let totalDayUpdatedTasksSum = 0;
                            let totalDayNewTasksSum = 0;

                            const domainDayRows = validDomains.map((item: any) => {
                                const rawName = (item.name || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
                                const monthlyTarget = item.domainData?.monthlyTarget || this.getResolvedTarget(item.name, requestMonth, requestYear) || 0;
                                const streamItems = item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || []);
                                
                                const createdTasksOnDay = streamItems.filter((t: any) => {
                                    if (!t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    if (!dObj) return false;
                                    const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                                    return dIso === dateIsoStr;
                                }).length;

                                const doneTasksInMonth = streamItems.filter((t: any) => {
                                    if (!t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    return dObj && dObj.getFullYear() === requestYear && (dObj.getMonth() + 1) === requestMonth && this.isTaskDone(t);
                                }).length;

                                const doneTasksOnDay = streamItems.filter((t: any) => {
                                    if (!t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    if (!dObj) return false;
                                    const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                                    return dIso === dateIsoStr && this.isTaskDone(t);
                                }).length;

                                const missingTasksInMonth = Math.max(0, monthlyTarget - (doneTasksInMonth - doneTasksOnDay));
                                const dailyTarget = monthlyTarget > 0 ? (workingDaysLeft > 0 ? Math.ceil(missingTasksInMonth / workingDaysLeft) : missingTasksInMonth) : 0;

                                const existingToUpdate = Math.min(createdTasksOnDay, dailyTarget);
                                const newToCreate = Math.max(0, dailyTarget - createdTasksOnDay);

                                totalDayCreatedTasksSum += createdTasksOnDay;

                                let actionText = '';
                                if (existingToUpdate > 0 && newToCreate > 0) {
                                    actionText = `**Sửa ${existingToUpdate} bài cũ + Tạo mới ${newToCreate} bài (Tổng: ${dailyTarget} bài)**`;
                                    totalDayUpdatedTasksSum += existingToUpdate;
                                    totalDayNewTasksSum += newToCreate;
                                } else if (existingToUpdate > 0) {
                                    actionText = `**Cập nhật & Sửa lại ${existingToUpdate} bài hiện có**`;
                                    totalDayUpdatedTasksSum += existingToUpdate;
                                } else if (newToCreate > 0) {
                                    actionText = `**Tạo mới ${newToCreate} bài**`;
                                    totalDayNewTasksSum += newToCreate;
                                } else {
                                    actionText = `*Đã đủ chỉ tiêu*`;
                                }

                                return `| \`${rawName}\` | ${createdTasksOnDay} bài | ${actionText} |`;
                            });

                            const domainDayTopicsList = validDomains.map((item: any) => {
                                const dData = item.domainData || {};
                                let style = dData.writingStyle;
                                if (!style && this.settings?.domainStyles) {
                                    style = this.settings.domainStyles[dData.domain || item.name];
                                }
                                const styleInfo = style ? `Phong cách: **${style}**` : 'Nội dung SEO chuyên sâu';
                                const noteInfo = dData.note ? ` | Ghi chú: *${dData.note}*` : '';
                                return `- **\`${item.name}\`**: ${styleInfo}${noteInfo}. Tất cả tác vụ cho ngày ${dayStr}/${monthStr}/${requestYear} sẽ được sinh/cập nhật đúng chuyên môn ngách và rải đều khung giờ 08:00 - 17:00.`;
                            }).join('\n');

                            const disabledNotice = isDisabledDay ? `\n⚠️ **CHÚ Ý**: Ngày ${dayStr}/${monthStr}/${requestYear} hiện đang bị tắt (Disabled Date).\n` : '';

                            const confirmContent = `🤖 **KẾ HOẠCH CHI TIẾT TẠO/SỬA LỊCH NGÀY ${dayStr}/${monthStr}/${requestYear}**

### 📊 1. Tổng quan kế hoạch ngày:
- 📅 **Ngày áp dụng**: **${dayStr}/${monthStr}/${requestYear}**
- 🌐 **Quy mô thực thi**: **${validDomains.length} Tên miền**
- 📝 **Bài đã có trong ngày**: **${totalDayCreatedTasksSum} bài**
- ✏️ **Bài sẽ cập nhật & sửa lại**: **${totalDayUpdatedTasksSum} bài hiện có**
- 🚀 **Bài sẽ tạo mới bổ sung**: **${totalDayNewTasksSum} bài**
${disabledNotice}
---

### 📋 2. Chi tiết phân bổ tác vụ ngày ${dayStr}/${monthStr}/${requestYear}:

| Tên miền | Đã có trong ngày | Kế hoạch thực hiện |
|---|:---:|:---:|
${domainDayRows.join('\n')}

---

### 📝 3. Định hướng chủ đề & Nội dung bài viết chi tiết:

${domainDayTopicsList}

---

👉 *Em đã sổ toàn bộ kế hoạch cho ngày **${dayStr}/${monthStr}/${requestYear}** trên khung chat để Sếp duyệt. Sếp kiểm tra xong bấm nút xác nhận bên dưới để em tiến hành thực thi ngay nhé!*`;

                            this.chatHistory.push({
                                role: 'model',
                                content: confirmContent,
                                isConfirmMessage: true,
                                confirmData: { 
                                    type: 'day',
                                    day: requestDay, 
                                    month: requestMonth, 
                                    year: requestYear,
                                    dateStr: dateIsoStr
                                }
                            });
                            this.isChatting = false;
                            this.cd.detectChanges();
                            this.scrollToBottom();
                            return;
                        }

                        if (!this.items) {
                            const daysInMonth = new Date(requestYear, requestMonth, 0).getDate();
                            const validDomains = this.items.filter(item => item && item.id !== 'total-summary-row' && item.id !== 'monthly-total-summary-row');
                            const totalDomains = validDomains.length;
                            const monthStr = requestMonth.toString().padStart(2, '0');

                            const confirmContent = `🤖 **Xác nhận phương án tạo lịch tự động**

Em đã phân tích và chuẩn hóa kế hoạch xử lý cho **Tháng ${monthStr}/${requestYear}** như sau:

- 📅 **Thời gian áp dụng**: Từ **01/${monthStr}/${requestYear}** đến **${daysInMonth}/${monthStr}/${requestYear}**
- 🌐 **Quy mô thực thi**: **${totalDomains} Tên miền**
- 🎯 **Quy tắc phân bổ**: Tự động tính số bài thiếu, phân bổ đều theo số ngày làm việc thực tế còn lại (đã trừ các ngày nghỉ/bỏ qua).

👉 *Sếp bấm nút xác nhận bên dưới để em bắt đầu khởi chạy kịch bản tạo lịch nhé!*`;

                            this.chatHistory.push({
                                role: 'model',
                                content: confirmContent,
                                isConfirmMessage: true,
                                confirmData: { month: requestMonth, year: requestYear }
                            });
                            this.isChatting = false;
                            this.cd.detectChanges();
                            this.scrollToBottom();
                            return;
                        }

                        contextData = this.items.map((d: any) => {
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
${generateInstruction}
- BẮT BUỘC ĐỌC kỹ trường "writingStyle" và "aiAnalysis" (nếu có) của từng tên miền. Bạn PHẢI áp dụng "writingStyle" (phong cách viết) vào nội dung và cách diễn đạt. Hãy nghĩ ra tiêu đề (name) và mô tả (meta) thật CỤ THỂ, ĐA DẠNG và ĐÚNG CHUYÊN MÔN / NGÁCH của tên miền đó.
- TUYỆT ĐỐI KHÔNG dùng các tên chung chung như "Công việc 1", "Tạo bài viết SEO", "Viết bài mới". 
- QUY TẮC HIỂN THỊ: BẮT BUỘC XỔ TOÀN BỘ KẾ HOẠCH BÀI VIẾT VÀ BẢNG PHÂN BỔ TRỰC TIẾP TRONG NỘI DUNG CHAT CHO QUẢN TRỊ VIÊN ĐỌC. TUYỆT ĐỐI KHÔNG TẠO HOẶC NÊU THÔNG BÁO GHI VÀO FILE .MD RỜI (NHƯ ke_hoach_cong_viec.md HAY BẤT KỲ FILE NÀO KHÁC). MỌI THÔNG TIN PHẢI ĐƯỢC HIỂN THỊ ĐẦY ĐỦ TRÊN KHUNG CHAT.

ĐẶC BIỆT: Nếu người dùng yêu cầu "viết blog", "lên dàn ý" và "lưu vào Soạn bài" (hoặc lưu nháp), BẠN KHÔNG TRẢ VỀ MẢNG LỊCH LÀM VIỆC NHƯ BÌNH THƯỜNG. Thay vào đó, bạn PHẢI trả về ĐÚNG định dạng JSON Object sau bên trong block code JSON:
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
                            model: 'gemini-3.6-flash',
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
                    model: 'gemini-3.6-flash',
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

    async confirmAndExecuteTask(confirmData: { month: number, year: number, day?: number, dateStr?: string, type?: string }, msg?: any) {
        if (this.isChatting) return;

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
            if (confirmData.type === 'day' || confirmData.day) {
                const dayStr = confirmData.day.toString().padStart(2, '0');
                const monthStr = confirmData.month.toString().padStart(2, '0');
                const formattedDate = `${dayStr}/${monthStr}/${confirmData.year}`;

                this.chatHistory.push({
                    role: 'model',
                    content: `🚀 Sếp đã xác nhận! Em bắt đầu tự động tạo và điều chỉnh công việc cho ngày **${formattedDate}** cho tất cả các tên miền...`
                });
                this.cd.detectChanges();
                this.scrollToBottom();

                await this.executeDayTaskGeneration(confirmData.year, confirmData.month, confirmData.day);
            } else {
                const monthStr = confirmData.month.toString().padStart(2, '0');
                this.chatHistory.push({
                    role: 'model',
                    content: `🚀 Sếp đã xác nhận! Em bắt đầu tự động tạo và phân bổ công việc cho **Tháng ${monthStr}/${confirmData.year}** cho tất cả các tên miền...`
                });
                this.cd.detectChanges();
                this.scrollToBottom();

                // Sweep CSDL CouchDB xóa sạch task cũ của tháng này trước khi tạo lịch mới
                await this.deleteAllMonthTasksFromDB(confirmData.year, confirmData.month);

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

                // Xóa sạch plan của tháng này trong bộ nhớ allDomainsList và rawDomains trước khi tạo
                [rawDomains, this.allDomainsList].forEach(list => {
                    if (list && list.length > 0) {
                        list.forEach((d: any) => {
                            if (d && d.plan && Array.isArray(d.plan)) {
                                d.plan = d.plan.filter((t: any) => {
                                    if (!t || !t.startDate) return false;
                                    const dObj = this.safeDate(t.startDate);
                                    return dObj && (dObj.getFullYear() !== confirmData.year || (dObj.getMonth() + 1) !== confirmData.month);
                                });
                            }
                        });
                    }
                });

                this.month = confirmData.month;
                this.updateTimeline3MonthsRange(confirmData.month);
                await this.processDomains(rawDomains, this.statsData, confirmData.month, true);
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

    async executeDayTaskGeneration(year: number, month: number, day: number) {
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

        this.toastr.info(`Đang dọn dẹp và gọi AI phân tích CSDL cho ngày ${vDateStrLocal}...`, 'Đang xử lý');
        if (this._globalAgentService) {
            this._globalAgentService.sendStreamMessage({
                role: 'model',
                content: `⏳ Đang dọn dẹp bài cũ và phân tích CSDL công việc ngày **${vDateStrLocal}**...`,
                isStreaming: true
            });
        }

        // BƯỚC 1: Xóa sạch toàn bộ task cũ chưa hoàn thành của ngày này trên CSDL CouchDB & RAM TRƯỚC
        await this.deleteDayTasksFromDB(year, month, day);

        // BƯỚC 2: AI suy nghĩ và tính toán chỉ tiêu số lượng tasks trên dữ liệu sạch vừa xóa
        const daysInMonth = new Date(year, month, 0).getDate();
        const now = new Date();
        const startDay = (year === now.getFullYear() && month === (now.getMonth() + 1)) ? now.getDate() : 1;
        
        let workingDaysLeft = 0;
        for (let i = startDay; i <= daysInMonth; i++) {
            const checkDate = `${year}-${monthStr}-${i.toString().padStart(2, '0')}`;
            if (!this.disabledDates.has(checkDate)) {
                workingDaysLeft++;
            }
        }

        let validItems = this.items.filter(item => {
            if (!item || item.id === 'total-summary-row' || item.id === 'monthly-total-summary-row') return false;
            const streamItems = item.childrenItems?.[0]?.streamItems || (item.domainData?.plan || []);
            const monthlyTarget = item.domainData?.monthlyTarget || this.getResolvedTarget(item.name, month, year) || 0;
            const tasksOnDay = streamItems.filter((t: any) => {
                if (!t.startDate) return false;
                const dObj = this.safeDate(t.startDate);
                if (!dObj) return false;
                const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                return dIso === vDateStrIso;
            });
            return monthlyTarget > 0 || tasksOnDay.length > 0;
        });

        let contextData = validItems.map((d: any) => {
            const streamItems = d.childrenItems?.[0]?.streamItems || (d.domainData?.plan || []);
            const monthlyTarget = d.domainData?.monthlyTarget || this.getResolvedTarget(d.name, month, year) || 0;
            
            const tasksOnDay = streamItems.filter((t: any) => {
                if (!t.startDate) return false;
                const dObj = this.safeDate(t.startDate);
                if (!dObj) return false;
                const dIso = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, '0')}-${dObj.getDate().toString().padStart(2, '0')}`;
                return dIso === vDateStrIso;
            }).map((t: any) => ({
                id: t._id || t.id,
                _id: t._id || t.id,
                _rev: t._rev,
                name: t.name,
                meta: t.meta || ''
            }));

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

            const doneTasksInMonth = streamItems.filter((t: any) => {
                if (!t.startDate) return false;
                const dObj = this.safeDate(t.startDate);
                return dObj && dObj.getFullYear() === year && (dObj.getMonth() + 1) === month && this.isTaskDone(t);
            }).length;

            const doneTasksOnDay = tasksOnDay.filter((t: any) => this.isTaskDone(t)).length;

            const missingTasksInMonth = Math.max(0, monthlyTarget - (doneTasksInMonth - doneTasksOnDay));
            let computedDailyTarget = monthlyTarget > 0 ? (workingDaysLeft > 0 ? Math.ceil(missingTasksInMonth / workingDaysLeft) : missingTasksInMonth) : 0;

            return {
                domain: d.name,
                monthlyTarget: monthlyTarget,
                dailyTarget: computedDailyTarget,
                existingTasksCountOnDay: tasksOnDay.length,
                aiAnalysis: d.domainData?.note || 'Chưa có phân tích',
                writingStyle: writingStyleInfo,
                existingTasksOnDay: tasksOnDay
            };
        });

        const tzOffset = -(new Date().getTimezoneOffset() / 60);
        const tzString = tzOffset >= 0 ? '+' + tzOffset : tzOffset;

        let dayPromptText = `DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI VÀ CÁC TASK TRONG NGÀY ${vDateStrLocal}:
\`\`\`json
${JSON.stringify(contextData, null, 2)}
\`\`\`

YÊU CẦU CỦA NGƯỜI DÙNG:
Chỉnh sửa và bổ sung công việc (tiêu đề name & mô tả meta) cho tất cả các tên miền cho duy nhất ngày ${vDateStrLocal} để đạt đúng chỉ tiêu dailyTarget.

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc.
BẠN HÃY TRÒ CHUYỆN VỚI NGƯỜI DÙNG BẰNG GIỌNG ĐIỆU VUI VẺ, THÂN THIỆN, CÓ SỬ DỤNG EMOJI (ĐÓNG VAI LÀ TRỢ LÝ ĐÁNG YÊU, GỌI NGƯỜI DÙNG LÀ SẾP).
DỮ LIỆU CÔNG VIỆC BẮT BUỘC PHẢI ĐƯỢC ĐẶT BÊN TRONG BLOCK CODE MẶC ĐỊNH LÀ \`\`\`json [ ... ] \`\`\`.

QUY TẮC BẮT BUỘC:
1. Đối với mỗi tên miền: BẠN BẮT BUỘC GIỮ NGUYÊN "id" CỦA TẤT CẢ CÁC TASK CŨ TRONG "existingTasksOnDay" (và sửa lại name/meta cho hay hơn).
2. Nếu số bài cũ ít hơn "dailyTarget": Bạn BẮT BUỘC tạo bổ sung các task mới (không truyền "id") cho đến khi TỔNG SỐ BÀI (cũ + mới) của tên miền đó đúng bằng "dailyTarget".
3. Tất cả các task BẮT BUỘC chỉ thuộc về ngày ${vDateStrIso} (startDate là "${vDateStrIso}T08:00:00", endDate là "${vDateStrIso}T17:00:00").
4. Áp dụng đúng phong cách "writingStyle" và "aiAnalysis" của từng tên miền.
5. Đặt tiêu đề (name) và mô tả (meta) cụ thể, độc đáo.`;

        let contents = [
            {
                role: 'user',
                parts: [{ text: dayPromptText }]
            }
        ];

        try {
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: contents,
                tools: [{ googleSearch: {} }],
                config: { ttsVoice: 'none' }
            } as any);

            const aiMsg = response.text || (response as any).response?.text() || '';
            let dayParsed = this.getParsedAiTask(aiMsg);

            if (dayParsed) {
                // Chuẩn hóa mọi cấu trúc JSON từ AI (object map, flat array, tasks/suggested_tasks)
                let normalizedList: { domain: string, tasks: any[] }[] = [];

                if (Array.isArray(dayParsed)) {
                    dayParsed.forEach((item: any) => {
                        if (!item) return;
                        const taskList = item.tasks || item.suggested_tasks || item.suggested_topics || (Array.isArray(item) ? item : null);
                        if (Array.isArray(taskList) && taskList.length > 0) {
                            normalizedList.push({ domain: item.domain || '', tasks: taskList });
                        } else if (item.name || item.title) {
                            normalizedList.push({ domain: item.domain || '', tasks: [item] });
                        }
                    });
                } else if (typeof dayParsed === 'object' && dayParsed !== null) {
                    const wrappedTasks = dayParsed.tasks || dayParsed.suggested_tasks || dayParsed.domains;
                    if (Array.isArray(wrappedTasks)) {
                        wrappedTasks.forEach((sub: any) => {
                            if (sub && (sub.domain || sub.tasks)) {
                                normalizedList.push({
                                    domain: sub.domain || dayParsed.domain || '',
                                    tasks: Array.isArray(sub.tasks) ? sub.tasks : [sub]
                                });
                            }
                        });
                    } else {
                        Object.keys(dayParsed).forEach(key => {
                            if (Array.isArray(dayParsed[key])) {
                                normalizedList.push({ domain: key, tasks: dayParsed[key] });
                            }
                        });
                    }
                }

                // Đảm bảo đủ chỉ tiêu dailyTarget cho tất cả tên miền trong contextData
                const normalizeDomainHelper = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                contextData.forEach((ctx: any) => {
                    if (!ctx.domain || ctx.dailyTarget <= 0) return;
                    const normCtxDomain = normalizeDomainHelper(ctx.domain);
                    let normEntry = normalizedList.find((entry: any) => normalizeDomainHelper(entry.domain) === normCtxDomain);
                    if (!normEntry) {
                        normEntry = { domain: ctx.domain, tasks: [] };
                        normalizedList.push(normEntry);
                    }
                    
                    const existingTasksCount = normEntry.tasks ? normEntry.tasks.length : 0;
                    if (existingTasksCount < ctx.dailyTarget) {
                        const needed = ctx.dailyTarget - existingTasksCount;
                        if (!normEntry.tasks) normEntry.tasks = [];
                        for (let k = 1; k <= needed; k++) {
                            normEntry.tasks.push({
                                name: `Bài viết SEO ${ctx.domain} #${existingTasksCount + k}`,
                                meta: `Nội dung truyền thông tự động đạt chỉ tiêu ngày ${vDateStrLocal}`,
                                startDate: `${vDateStrIso}T08:00:00`,
                                endDate: `${vDateStrIso}T17:00:00`
                            });
                        }
                    }
                });

                // Cập nhật ngày cho các task
                normalizedList.forEach((d: any) => {
                    if (d.tasks && Array.isArray(d.tasks)) {
                        d.tasks.forEach((t: any) => {
                            t.startDate = t.startDate || `${vDateStrIso}T08:00:00`;
                            t.endDate = t.endDate || `${vDateStrIso}T17:00:00`;
                        });
                    }
                });

                this.applyParsedTasks(normalizedList);

                // Lưu tất cả task của ngày vào CSDL CouchDB ngầm qua API /tasks/add hoặc /tasks/edit
                const normalizeDomain = (s: any) => (String(s || '')).toLowerCase().trim().replace(/https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                const allRamTasks = [
                    ...(this.items || []).flatMap((d: any) => d?.childrenItems?.[0]?.streamItems || (d?.domainData?.plan || [])),
                    ...(this.allDomainsList || []).flatMap((d: any) => d?.plan || [])
                ];

                for (const entry of normalizedList) {
                    if (!entry.tasks || !entry.tasks.length) continue;
                    const targetNorm = normalizeDomain(entry.domain || '');
                    const matchedItem = this.items.find(it => it && it.name && normalizeDomain(it.name) === targetNorm) || this.items[0];
                    const canonicalDomainName = matchedItem ? (matchedItem.domainData?.domain || matchedItem.name) : (entry.domain || '');

                    for (const t of entry.tasks) {
                        if (!t) continue;
                        const targetId = t._id || t.id;
                        let existingDbTask = targetId ? allRamTasks.find((rt: any) => rt && (String(rt._id) === String(targetId) || String(rt.id) === String(targetId))) : null;
                        if (!existingDbTask && (t.name || t.title)) {
                            const tName = (t.name || t.title || '').trim().toLowerCase();
                            existingDbTask = allRamTasks.find((rt: any) => {
                                if (!rt || !rt.name) return false;
                                if (rt.name.trim().toLowerCase() !== tName) return false;
                                return this.safeIsoDate(rt.startDate) === vDateStrIso;
                            });
                        }

                        const taskPayload: any = {
                            name: t.name || t.title || 'Công việc mới',
                            meta: t.meta || t.description || '',
                            domain_id: canonicalDomainName,
                            domain: canonicalDomainName,
                            startDate: t.startDate || `${vDateStrIso}T08:00:00`,
                            endDate: t.endDate || `${vDateStrIso}T17:00:00`,
                            canResizeLeft: true,
                            canResizeRight: true,
                            canDragX: true,
                            canDragY: false
                        };

                        try {
                            let savedSuccessfully = false;
                            const isRealCouchDbTask = existingDbTask && existingDbTask._id && existingDbTask._rev && String(existingDbTask._rev).includes('-');
                            
                            if (isRealCouchDbTask) {
                                taskPayload['_id'] = existingDbTask._id;
                                taskPayload['id'] = existingDbTask._id;
                                taskPayload['_rev'] = existingDbTask._rev;
                                const resEdit: any = await firstValueFrom(this._tasksService.edit({ username: this.user.name, task: taskPayload })).catch(() => null);
                                if (resEdit && !resEdit.error && !resEdit.message) {
                                    savedSuccessfully = true;
                                    const newRev = resEdit.rev || resEdit._rev || resEdit.data?.rev || resEdit.data?._rev;
                                    if (newRev) {
                                        existingDbTask._rev = newRev;
                                        t._rev = newRev;
                                    }
                                    existingDbTask.name = taskPayload.name;
                                    existingDbTask.meta = taskPayload.meta;
                                }
                            }

                            if (!savedSuccessfully) {
                                delete taskPayload['_id'];
                                delete taskPayload['id'];
                                delete taskPayload['_rev'];
                                const resAdd: any = await firstValueFrom(this._tasksService.add({ username: this.user.name, task: taskPayload })).catch(() => null);
                                if (resAdd && !resAdd.error) {
                                    const newId = resAdd.id || resAdd._id || resAdd.data?.id || resAdd.data?._id;
                                    const newRev = resAdd.rev || resAdd._rev || resAdd.data?.rev || resAdd.data?._rev;
                                    if (newId) { 
                                        t._id = newId; t.id = newId; 
                                        if (existingDbTask) { existingDbTask._id = newId; existingDbTask.id = newId; }
                                        const tName = (t.name || t.title || '').trim().toLowerCase();
                                        const ramTarget = allRamTasks.find((rt: any) => {
                                            if (!rt || !rt.name) return false;
                                            if (rt.name.trim().toLowerCase() !== tName) return false;
                                            return this.safeIsoDate(rt.startDate) === vDateStrIso;
                                        });
                                        if (ramTarget) {
                                            ramTarget._id = newId;
                                            ramTarget.id = newId;
                                            if (newRev) ramTarget._rev = newRev;
                                        }
                                    }
                                    if (newRev) { 
                                        t._rev = newRev; 
                                        if (existingDbTask) { existingDbTask._rev = newRev; }
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn('Lỗi lưu task ngày vào CSDL:', err);
                        }
                    }
                }

                this.updateTotalSummaryRow();
                this.items = [...this.items];
                this.saveScriptState();
                this.cd.detectChanges();

                this.toastr.success(`Đã cập nhật và lưu CSDL công việc ngày ${vDateStrLocal}!`);
                this.chatHistory.push({
                    role: 'model',
                    content: `🎉 Báo cáo Sếp: Em đã hoàn tất tạo và lưu CSDL công việc ngày **${vDateStrLocal}** trên lịch cho tất cả các tên miền rồi nhé! 😎`
                });
            } else {
                this.chatHistory.push({ role: 'model', content: `❌ Lỗi: AI không trả về dữ liệu hợp lệ cho ngày ${vDateStrLocal}.` });
            }
        } catch (e: any) {
            console.error('Error generating day tasks', e);
            this.chatHistory.push({ role: 'model', content: `❌ Lỗi khi gọi AI: ${e.message || e}` });
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

        // Nếu AI lười, trả thẳng array task thay vì array domain
        if (parsed.length > 0 && !parsed[0].domain && (parsed[0].name || parsed[0].title)) {
            parsed = [{
                domain: this.items.length > 0 ? this.items[0].name : '',
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
                 parsedDomain.domain = this.items.length > 0 ? this.items[0].name : '';
            }
            const domainName = (parsedDomain.domain || '').toLowerCase().trim().replace(/https?:\/\//, '').replace(/\/$/, '');
            let existingDomainIndex = this.items.findIndex(d => {
                const dName = d.name.toLowerCase().trim().replace(/https?:\/\//, '').replace(/\/$/, '');
                return dName === domainName;
            });
            
            // Đã xóa fallback dùng includes() để tránh nhầm lẫn subdomain (ví dụ: type.vn và ai.type.vn)
            
            // Fallback nếu không tìm thấy domain khớp
            if (existingDomainIndex === -1 && this.items.length > 0) {
                existingDomainIndex = 0; // Tự động gán vào domain đầu tiên
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
                                canResizeLeft: true,
                                canResizeRight: true,
                                canDragX: true,
                                canDragY: true
                            };
                            
                            if (typeof t.done !== 'undefined') {
                                mappedTask.done = t.done;
                            }
                            
                            if (existingIndex > -1) {
                                newTasks[existingIndex] = { ...newTasks[existingIndex], ...mappedTask };
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
                    
                    this.applyPackedTasks(existingDomain, newTasks);
                    if ((existingDomain as any).domainData) {
                        (existingDomain as any).domainData.plan = newTasks;
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
        
        ele.style.cursor = 'grab';

        ele.addEventListener('mousedown', (e: MouseEvent) => {
            // Prevent panning if clicking on a timeline item, panel item, button, or resize handle
            const target = e.target as HTMLElement;
            if (target.closest('.timeline-item') || target.closest('.panel-item') || target.closest('button') || target.closest('.item-content') || target.closest('[mwlResizeHandle]')) {
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
            const walkX = (x - this.timelineStartX) * 1.5; // Scroll speed multiplier
            const walkY = (y - this.timelineStartY) * 1.5;
            ele.scrollLeft = this.timelineScrollLeft - walkX;
            ele.scrollTop = this.timelineScrollTop - walkY;
        });
    }
}

// force recompile
