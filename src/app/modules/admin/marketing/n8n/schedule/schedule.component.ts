import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation, AfterViewInit, AfterViewChecked, ElementRef, NgZone, ChangeDetectionStrategy, TemplateRef, Input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { DomainService } from 'app/modules/_services/domain';
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
    forkJoin
} from 'rxjs';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';
import { BlogService } from 'app/modules/_services/blog';
import { ToastrService } from 'ngx-toastr';
import {
    ITimelineItem,
    TimelineComponent,
    IItemTimeChangedEvent,
    TimelineViewMode,
} from "angular-calendar-timeline";
import localeVi from "@angular/common/locales/vi";
import { registerLocaleData } from '@angular/common';
import { MXHAutoService } from 'app/modules/_services/mxhauto';
import { MatSelectionList } from "@angular/material/list";
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { ColumnMode, SelectionType, DatatableComponent } from '@swimlane/ngx-datatable';
import { GenaiService } from 'app/genai.service';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';

// --- IMPORT SERVICE N8N ---
import { N8nService } from 'app/modules/_services/n8n.service'; // Bạn kiểm tra lại đường dẫn này nhé
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

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
    
    customZooms = [
        { columnWidth: 50, viewMode: TimelineViewMode.Month },
        { columnWidth: 100, viewMode: TimelineViewMode.Month },
        { columnWidth: 50, viewMode: TimelineViewMode.Week },
        { columnWidth: 100, viewMode: TimelineViewMode.Week },
        { columnWidth: 100, viewMode: TimelineViewMode.Day }, // 4px per hour
        { columnWidth: 240, viewMode: TimelineViewMode.Day }, // 10px per hour
        { columnWidth: 720, viewMode: TimelineViewMode.Day }, // 30px per hour
        { columnWidth: 1440, viewMode: TimelineViewMode.Day }, // 60px per hour
        { columnWidth: 2880, viewMode: TimelineViewMode.Day }, // 120px per hour
        { columnWidth: 4320, viewMode: TimelineViewMode.Day }, // 180px per hour
    ];

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

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // --- VARIABLES FOR DIALOG ---
    @ViewChild('commentDialog') commentDialog: TemplateRef<any>;
    @ViewChild('promptDialog') promptDialog: TemplateRef<any>;

    commentGroups: CommentGroup[] = [];
    isAllSelected: boolean = false;
    totalSelected: number = 0;
    customPromptInput: string = '';

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
        private _domainService: DomainService
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

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

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

    ngAfterViewChecked(): void { }

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
        // Đặt mặc định zoom tới index 6 (tương đương 30px mỗi giờ) để vừa vặn
        this.timelineComponent.changeZoomByIndex(6); 
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
    editingItem: any = null;
    changeEvent(item: any) { 
        if (this.editingItem !== item) {
            console.log('item selected for AI edit', item); 
            this.editingItem = item;
            // Xoá lịch sử chat cũ khi chọn task mới
            this.chatHistory = [];
            this.cd.markForCheck();
            // Scroll to chat and show a notification
            this.toastr.info(`Đã chọn: ${item.name}. Hãy yêu cầu AI chỉnh sửa.`);
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
            window.open(url, '_blank', 'width=600,height=800');
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
        this.statsData = statsData;
        this.month = month;
        this.toastr.info('Đang nạp dữ liệu tên miền...', 'Xử lý');
        this.items = [];
        const requests = domains.map((domainData: any, index: number) => {
            return this.generateDomainData(domainData, index, statsData, month, forceGenerate);
        });
        
        await Promise.all(requests);
        this.saveScriptState();
        this.cd.markForCheck();
        this.toastr.success('Hoàn thành lên kế hoạch cho tên miền!');
        
        // Cuộn timeline tới khung giờ hiện tại và zoom to nhất để nhìn rõ chữ
        setTimeout(() => {
            this.scrollToToday();
            this.cd.markForCheck();
        }, 100);
    }

    async generateDomainData(domainData: any, index: number, statsData: any, month: number, forceGenerate: boolean = false) {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        let timelineItem: ICustomTimelineItem = {
            id: index, 
            name: domainData.domain,
            childrenItems: [],
            childrenItemsExpanded: true,
            domainData: domainData // Store reference for DB updates
        };

        // Push to items first
        this.items = [...this.items, timelineItem];
        this.cd.markForCheck();

        // Kiểm tra xem đã có kế hoạch chưa (bỏ qua nếu forceGenerate)
        if (!forceGenerate && domainData.plan && domainData.plan.length > 0) {
            // Đã có kế hoạch, hiển thị luôn và không tạo lại
            const streamItems = domainData.plan.map((task: any) => ({
                ...task,
                startDate: new Date(task.startDate),
                endDate: new Date(new Date(task.endDate).setHours(17, 0, 0, 0))
            }));
            
            const itemIndex = this.items.findIndex(it => it.id === index);
            if (itemIndex > -1) {
                this.items[itemIndex].childrenItems = this.packTasks(streamItems, index);
                this.items[itemIndex].childrenItemsExpanded = true;
                this.items[itemIndex].streamItems = undefined;
                this.items = [...this.items];
                this.cd.markForCheck();
            }
            return;
        }

        // Tính toán chỉ tiêu trong ngày
        let dailyTarget = 0;
        let currentResult = 0;
        if (domainData.monthlyTarget && domainData.monthlyTarget > 0) {
            currentResult = (statsData[domainData.domain] && statsData[domainData.domain][month]) ? statsData[domainData.domain][month] : 0;
            
            let scheduledCount = 0;
            if (domainData.plan && domainData.plan.length > 0) {
                const todayStrForCount = new Date().toISOString().split('T')[0];
                scheduledCount = domainData.plan.filter((t: any) => {
                    if (!t.startDate) return false;
                    const tDate = new Date(t.startDate).toISOString().split('T')[0];
                    return tDate >= todayStrForCount;
                }).length;
            }
            
            const missing = Math.max(0, domainData.monthlyTarget - currentResult - scheduledCount);
            
            const d = new Date();
            const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            const daysLeft = daysInMonth - d.getDate() + 1;
            
            if (daysLeft > 0) {
                dailyTarget = Math.ceil(missing / daysLeft);
            } else {
                dailyTarget = missing;
            }
        }
        
        domainData.computedDailyTarget = dailyTarget;
        domainData.currentResult = currentResult;
        
        if (dailyTarget <= 0) {
            return; // Không cần lên kế hoạch nếu không có chỉ tiêu
        }

        // Bắt đầu tính thời gian từ lúc hiện tại hoặc 8h sáng (tùy cái nào lớn hơn)
        let dummyCurrentTime = new Date(now);
        let startHour = new Date(now);
        startHour.setHours(8, 0, 0, 0);
        if (dummyCurrentTime.getTime() < startHour.getTime()) {
            dummyCurrentTime = startHour;
        }
        
        let endWorkTime = new Date(now);
        endWorkTime.setHours(17, 0, 0, 0);
        
        // Tránh lỗi nếu bấm lên kế hoạch sau 17h, đẩy sang ngày mai
        if (dummyCurrentTime.getTime() >= endWorkTime.getTime()) {
            dummyCurrentTime.setDate(dummyCurrentTime.getDate() + 1);
            dummyCurrentTime.setHours(8, 0, 0, 0);
            endWorkTime.setDate(endWorkTime.getDate() + 1);
        }

        let dummyStreamItems = [];
        for (let i = 0; i < dailyTarget; i++) {
            dummyStreamItems.push({
                id: `dummy-${index}-${i}`,
                name: 'Đang phân tích...',
                startDate: new Date(dummyCurrentTime),
                endDate: new Date(endWorkTime),
                canResizeLeft: false,
                canResizeRight: false,
                canDragX: false,
                canDragY: false,
                meta: '',
                isLoading: true // Cờ nhấp nháy
            });
        }

        const itemIndexForDummy = this.items.findIndex(it => it.id === index);
        if (itemIndexForDummy > -1) {
            this.items[itemIndexForDummy].childrenItems = this.packTasks(dummyStreamItems, index);
            this.items[itemIndexForDummy].childrenItemsExpanded = true;
            this.items[itemIndexForDummy].streamItems = undefined;
            this.items = [...this.items];
            this.cd.markForCheck();
        }

        const prompt = `Bạn là chuyên gia SEO. Tên miền: ${domainData.domain}. Phân tích AI: ${domainData.note || 'Chưa có'}. 
Yêu cầu: Lên đúng ${dailyTarget} tiêu đề bài viết cần viết ngay HÔM NAY để đạt chỉ tiêu. 
Trả về ĐÚNG ĐỊNH DẠNG JSON MẢNG: [{"title": "Tiêu đề", "content": "Tóm tắt"}]
Không dùng markdown \`\`\`json.`;

        try {
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            
            let resultText = response.text || '';
            if (resultText.includes('```json')) resultText = resultText.split('```json')[1].split('```')[0].trim();
            else if (resultText.includes('```')) resultText = resultText.split('```')[1].split('```')[0].trim();
            
            // Tìm mảng JSON bằng cách cắt chuỗi từ '[' đến ']'
            const startIndex = resultText.indexOf('[');
            const endIndex = resultText.lastIndexOf(']');
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                resultText = resultText.substring(startIndex, endIndex + 1);
            }
            
            const aiResults = JSON.parse(resultText);
            
            let streamItems = [];
            
            // Tính toán lại thời gian cho các task thật tương tự như dummy tasks
            let currentTime = new Date(now);
            if (currentTime.getTime() < startHour.getTime()) {
                currentTime = startHour;
            }
            if (currentTime.getTime() >= endWorkTime.getTime()) {
                currentTime.setDate(currentTime.getDate() + 1);
                currentTime.setHours(8, 0, 0, 0);
            }
            
            for (let i = 0; i < aiResults.length; i++) {
                const aiTask = aiResults[i];
                
                streamItems.push({
                    id: `${index}-${i}`,
                    name: aiTask.title,
                    startDate: new Date(currentTime),
                    endDate: new Date(endWorkTime),
                    canResizeLeft: true,
                    canResizeRight: true,
                    canDragX: true,
                    canDragY: false,
                    meta: aiTask.content
                });
            }
            
            const itemIndex = this.items.findIndex(it => it.id === index);
            if (itemIndex > -1) {
                this.items[itemIndex].childrenItems = this.packTasks(streamItems, index);
                this.items[itemIndex].childrenItemsExpanded = true;
                this.items[itemIndex].streamItems = undefined;
                this.items = [...this.items];
                this.cd.markForCheck();
                
                // Lưu vào CSDL
                domainData.plan = streamItems;
                this._domainService.edit({
                    username: this.user.name,
                    domain: domainData
                }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
            }
        } catch (error) {
            console.error('Lỗi khi phân tích domain:', domainData.domain, error);
            this.toastr.error(`Lỗi tạo kế hoạch cho ${domainData.domain}. Vui lòng thử lại.`);
            
            // Phục hồi lại dữ liệu cũ hoặc xóa skeleton nếu lỗi
            const itemIndex = this.items.findIndex(it => it.id === index);
            if (itemIndex > -1) {
                if (domainData.plan && domainData.plan.length > 0) {
                    this.items[itemIndex].childrenItems = this.packTasks(domainData.plan.map((task: any) => ({
                        ...task,
                        startDate: new Date(task.startDate),
                        endDate: new Date(new Date(task.startDate).setHours(17, 0, 0, 0))
                    })), index);
                } else {
                    this.items[itemIndex].childrenItems = [];
                }
                this.items[itemIndex].childrenItemsExpanded = true;
                this.items[itemIndex].streamItems = undefined;
                this.items = [...this.items];
                this.cd.markForCheck();
            }
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
                model: 'gemini-3.5-flash',
                contents: this.chatHistory
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
                apiUrl = "https://tiktok.type.vn/v1/like/click";
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
                apiUrl = "https://tiktok.type.vn/v1/comment/click";
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

    getResolvedTarget(domain: string, month: number, selectedYear: number): number {
        this.settings = this.multiAccountService.getItem('settings');
        if (!this.settings || !this.settings.domainTargets) return 0;
        let target = this.settings.domainTargets[domain];
        if (target === undefined) return 0;
        if (typeof target === 'number') return target; // Legacy compatibility
        
        let yearTarget = target[selectedYear];
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

    addSeconds(date: Date, seconds: number): Date {
        const result = new Date(date);
        result.setSeconds(result.getSeconds() + seconds);
        return result;
    }

    loadScheduleFromDB() {
        this._domainService.fetch({ username: this.user.name }).subscribe({
            next: (res: any) => {
                if (res && res.result && res.result.length > 0) {
                    const domainsWithPlan = res.result.filter((d: any) => d.plan && d.plan.length > 0);
                    if (domainsWithPlan.length > 0) {
                        const currentMonth = new Date().getMonth() + 1;
                        const currentYear = new Date().getFullYear();
                        domainsWithPlan.forEach((d: any) => {
                            if (!d.monthlyTarget) {
                                d.monthlyTarget = this.getResolvedTarget(d.domain, currentMonth, currentYear);
                            }
                        });
                        this.processDomains(domainsWithPlan, undefined, currentMonth, false);
                    } else {
                        // Nếu chưa có plan nào trong DB, thử fallback về localStorage
                        this.loadScriptState();
                    }
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
            // Save the entire timeline items for domains
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
        } catch (e) { console.error('Lỗi khi lưu lịch làm việc:', e); }
    }

    loadScriptState() {
        try {
            const savedJson = localStorage.getItem(this.STORAGE_KEY);
            if (!savedJson) return;
            const savedState = JSON.parse(savedJson);
            
            // Convert date strings back to Date objects
            savedState.forEach((item: any) => {
                if (item.childrenItems && item.childrenItems.length > 0) {
                    if (!item.childrenItems[0].streamItems) {
                        // Migrate legacy state
                        const streamItems = item.childrenItems.map((child: any) => {
                            if (child.startDate) child.startDate = new Date(child.startDate);
                            if (child.endDate) child.endDate = new Date(child.endDate);
                            return child;
                        });
                        item.childrenItems = this.packTasks(streamItems, item.id);
                    } else {
                        item.childrenItems.forEach((child: any) => {
                            if (child.streamItems) {
                                child.streamItems.forEach((stream: any) => {
                                    if (stream.startDate) stream.startDate = new Date(stream.startDate);
                                    if (stream.endDate) stream.endDate = new Date(stream.endDate);
                                });
                            }
                        });
                    }
                }
                if (item.streamItems) {
                    item.streamItems.forEach((stream: any) => {
                        if (stream.startDate) stream.startDate = new Date(stream.startDate);
                        if (stream.endDate) stream.endDate = new Date(stream.endDate);
                    });
                }
            });
            this.items = savedState;
            this.cd.markForCheck();
            
            // Zoom lại cho đẹp khi load xong
            setTimeout(() => {
                this.scrollToToday();
            }, 100);
        } catch (e) { console.error('Lỗi khi tải lịch làm việc:', e); }
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

    packTasks(tasks: any[], parentId: string | number) {
        if (!tasks || !tasks.length) return [];
        return [{ id: parentId + "-child", name: 'Công việc', streamItems: tasks }];
    }

    async sendChat(event?: Event) {
        if (event) {
            event.preventDefault();
        }
        if (!this.chatPrompt || !this.chatPrompt.trim() || this.isChatting) return;

        const userMessage = this.chatPrompt.trim();
        this.chatPrompt = '';

        this.chatHistory.push({ role: 'user', content: userMessage });
        this.scrollToBottom();

        this.isChatting = true;
        this.cd.detectChanges();

        try {
            // Chuẩn bị nội dung gửi đi
            let contents = this.chatHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));
            
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
  "startDate": "${this.editingItem.startDate.toISOString()}",
  "endDate": "${this.editingItem.endDate.toISOString()}"
}
\`\`\`

YÊU CẦU CỦA NGƯỜI DÙNG:
${userMessage}

HƯỚNG DẪN TRẢ LỜI:
Bạn là trợ lý AI quản lý lịch công việc. Người dùng muốn chỉnh sửa công việc này.
BẠN PHẢI TRẢ VỀ DUY NHẤT MỘT OBJECT JSON, KHÔNG KÈM THEO BẤT KỲ VĂN BẢN GIẢI THÍCH NÀO KHÁC.
Object JSON phải có cấu trúc y hệt trên, chứa nội dung đã sửa. Bạn có thể sửa thời gian startDate, endDate nếu cần.`;
                    } else {
                        // Gather all tasks to provide global context
                        const contextData = this.items.map((d: any) => {
                            const currentMonth = this.month || (new Date().getMonth() + 1);
                            const currentYear = new Date().getFullYear();
                            const monthlyTarget = this.getResolvedTarget(d.name, currentMonth, currentYear) || d.domainData?.monthlyTarget || 0;
                            const currentResult = (this.statsData && this.statsData[d.name] && this.statsData[d.name][currentMonth]) ? this.statsData[d.name][currentMonth] : 0;
                            const streamItems = d.childrenItems?.[0]?.streamItems || [];
                            let scheduledCount = streamItems.length;
                            const today = new Date();
                            const remainingDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;

                            return {
                                domain: d.name,
                                monthlyTarget: monthlyTarget,
                                currentResult: currentResult,
                                scheduledCount: scheduledCount, // Tất cả công việc trên lịch
                                remainingDays: remainingDays,
                                aiAnalysis: d.domainData?.note || 'Chưa có phân tích',
                                tasks: streamItems.map((t: any) => {
                                    const tzOffsetStr = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -5);
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

                        lastMsg.parts[0].text = `DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI (Hôm nay là: ${todayStr}):
\`\`\`json
${JSON.stringify(contextData, null, 2)}
\`\`\`

YÊU CẦU CỦA NGƯỜI DÙNG:
${userMessage}

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc. Người dùng muốn sửa hoặc thêm dữ liệu JSON lịch.
BẠN PHẢI TRẢ VỀ DUY NHẤT MỘT MẢNG JSON, KHÔNG KÈM THEO BẤT KỲ VĂN BẢN GIẢI THÍCH NÀO KHÁC.
Mảng JSON phải có cấu trúc gồm danh sách các domain và các task bên trong. 
LƯU Ý QUAN TRỌNG VỀ SỐ LƯỢNG TÁC VỤ:
- Bạn phải tự tính toán số lượng tác vụ cần tạo mỗi ngày (dailyTarget) cho mỗi domain theo đúng công thức:
  dailyTarget = Làm tròn lên của (monthlyTarget - currentResult - scheduledCount) / remainingDays
- Nếu dailyTarget <= 0: Tuyệt đối không tạo thêm task cho domain đó.
- Nếu dailyTarget > 0: Bắt buộc tạo ĐÚNG số lượng task bằng với dailyTarget. (Lưu ý: Nếu người dùng yêu cầu con số cụ thể trong prompt của họ, hãy ưu tiên con số của người dùng thay vì công thức).
- Dựa vào 'aiAnalysis' để đưa ra tên (name) và nội dung (meta) của task sao cho hợp lý và tối ưu nhất.

LƯU Ý VỀ CẬP NHẬT DỮ LIỆU:
- Khi bạn tạo task cho một ngày bất kỳ, hệ thống sẽ tự động XÓA HẾT các task cũ của ngày đó để đắp task mới của bạn vào. Bạn KHÔNG CẦN lo việc xóa.
- Để tạo task mới: TUYỆT ĐỐI KHÔNG trả về trường "id" (hệ thống sẽ tự cấp).
- Nếu sửa task cụ thể: giữ nguyên trường "id" của task đó.
QUAN TRỌNG VỀ THỜI GIAN VÀ MÚI GIỜ:
- Hệ thống người dùng đang ở múi giờ: GMT${tzString}. Bạn phải quy đổi múi giờ nếu người dùng yêu cầu múi giờ khác.
- MẶC ĐỊNH TẤT CẢ CÁC TASK PHẢI CÓ startDate LÀ 08:00:00 VÀ endDate LÀ 17:00:00 CỦA ĐÚNG NGÀY MÀ NGƯỜI DÙNG YÊU CẦU (NẾU YÊU CẦU NGÀY 17, PHẢI TẠO NGÀY 17). KHÔNG ĐƯỢC CHIA NHỎ GIỜ.
- TUYỆT ĐỐI KHÔNG dùng "24:00:00" vì sẽ gây lỗi Invalid Date, hãy dùng "23:59:59".
- BẮT BUỘC dùng định dạng local: "YYYY-MM-DDTHH:mm:ss" (Ví dụ: "2026-07-16T08:00:00"). TUYỆT ĐỐI KHÔNG CÓ CHỮ 'Z' Ở CUỐI.`;
                    }
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: contents,
            });

            if (!this.isChatting) return;

            const aiMessage = response.text || (response as any).response?.text() || '';
            let parsed = this.getParsedAiTask(aiMessage);
            
            if (parsed) {
                if (this.editingItem) {
                    const taskObj = Array.isArray(parsed) ? parsed[0] : parsed;
                    if (taskObj && taskObj.name) {
                        this.editingItem.name = taskObj.name;
                        this.editingItem.meta = taskObj.meta;
                        if (taskObj.startDate) this.editingItem.startDate = new Date(taskObj.startDate);
                        if (taskObj.endDate) this.editingItem.endDate = new Date(taskObj.endDate);
                        
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
                    let hasAnyTasks = false;
                    // Update all tasks by merging
                    parsed.forEach((parsedDomain: any) => {
                        const domainName = (parsedDomain.domain || '').toLowerCase().trim();
                        let existingDomainIndex = this.items.findIndex(d => d.name.toLowerCase().trim() === domainName);
                        if (existingDomainIndex > -1) {
                            let existingDomain = { ...this.items[existingDomainIndex] };
                            let newTasks = existingDomain.childrenItems?.[0]?.streamItems ? [...existingDomain.childrenItems[0].streamItems] : (existingDomain.childrenItems?.length ? [...existingDomain.childrenItems] : []);
                            
                            if (parsedDomain.tasks && Array.isArray(parsedDomain.tasks) && parsedDomain.tasks.length > 0) {
                                const hasRealData = parsedDomain.tasks.some((t: any) => !t._deleted);
                                if (!hasRealData) {
                                    return; // Bỏ qua domain này vì AI chỉ toàn gửi cờ xóa mà không có data mới đắp vào
                                }
                                
                                hasAnyTasks = true;
                                
                                // Nếu có data rồi thì reset cái data cũ của ngày đó
                                const targetDates = new Set<string>();
                                parsedDomain.tasks.forEach((t: any) => {
                                    if (!t.id && t.startDate && !t._deleted) {
                                        const d = new Date(t.startDate);
                                        if (!isNaN(d.getTime())) {
                                            targetDates.add(d.toLocaleDateString('vi-VN'));
                                        }
                                    }
                                });

                                if (targetDates.size > 0) {
                                    newTasks = newTasks.filter(existing => {
                                        const d = new Date(existing.startDate);
                                        if (!isNaN(d.getTime())) {
                                            return !targetDates.has(d.toLocaleDateString('vi-VN'));
                                        }
                                        return true;
                                    });
                                }

                                parsedDomain.tasks.forEach((t: any) => {
                                    if (t._deleted) {
                                        newTasks = newTasks.filter(existing => existing.id !== t.id);
                                    } else {
                                        const existingIndex = newTasks.findIndex(existing => existing.id === t.id);
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

                                        const mappedTask = {
                                            id: t.id || Math.random().toString(36).substring(7),
                                            name: t.name || t.title,
                                            meta: t.meta || '',
                                            startDate: parseDateStr(t.startDate),
                                            endDate: parseDateStr(t.endDate),
                                            canResizeLeft: true,
                                            canResizeRight: true,
                                            canDragX: true,
                                            canDragY: true
                                        };
                                        
                                        if (existingIndex > -1) {
                                            newTasks[existingIndex] = { ...newTasks[existingIndex], ...mappedTask };
                                        } else {
                                            newTasks.push(mappedTask);
                                        }
                                    }
                                });
                                
                                existingDomain.childrenItems = this.packTasks(newTasks, existingDomain.id);
                                if ((existingDomain as any).domainData) {
                                    (existingDomain as any).domainData.plan = newTasks;
                                    this._domainService.edit({ username: this.user.name, domain: (existingDomain as any).domainData }).pipe(takeUntil(this._unsubscribeAll)).subscribe();
                                }
                                this.items[existingDomainIndex] = existingDomain;
                            }
                        }
                    });
                    
                    if (!hasAnyTasks) {
                        let sampleDailyTarget = 0;
                        if (this.items.length > 0) {
                            const d = this.items[0];
                            const monthlyTarget = (d as any).domainData?.monthlyTarget || 0;
                            const currentResult = (this.statsData && this.statsData[d.name] && this.statsData[d.name][this.month]) ? this.statsData[d.name][this.month] : 0;
                            let scheduledCount = 0;
                            const streamItems = d.childrenItems?.[0]?.streamItems || [];
                            scheduledCount = streamItems.length;
                            const today = new Date();
                            const remainingDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
                            sampleDailyTarget = monthlyTarget > 0 ? Math.ceil(Math.max(0, monthlyTarget - currentResult - scheduledCount) / remainingDays) : 0;
                        }
                        this.toastr.info('Hoàn tất kiểm tra: Các tên miền đã đủ chỉ tiêu, không có việc mới.');
                        this.chatHistory.push({ role: 'model', content: `✅ Đã kiểm tra theo công thức. Các domain hiện tại đều đã đạt chỉ tiêu nên không có công việc nào cần tạo thêm! (Ghi chú gỡ lỗi: Domain đầu tiên có dailyTarget = ${sampleDailyTarget}, AI trả về: ${JSON.stringify(parsed)})` });
                        this.cd.markForCheck();
                        return;
                    }

                    this.items = [...this.items];
                    this.cd.markForCheck();
                    this.saveScriptState();
                    this.toastr.success('Đã cập nhật toàn bộ lịch!');
                    this.chatHistory.push({ role: 'model', content: `✅ Đã áp dụng thay đổi vào lưới thời gian thành công! (AI đã trả về: ${parsed.length} domains có data)` });
                } else {
                    this.chatHistory.push({ role: 'model', content: 'Lỗi: AI không trả về dữ liệu hợp lệ cho thao tác này.' });
                }
            } else {
                this.chatHistory.push({ role: 'model', content: aiMessage || 'Lỗi: AI không trả về dữ liệu chuẩn JSON.' });
            }
        } catch (err: any) {
            if (!this.isChatting) return;
            console.error('Lỗi gọi AI:', err);
            this.chatHistory.push({ role: 'model', content: 'Đã có lỗi xảy ra: ' + (err.message || err) });
        } finally {
            this.isChatting = false;
            this.cd.detectChanges();
            this.scrollToBottom();
        }
    }
    
    getParsedAiTask(content: string): any {
        if (!content) return null;
        
        // Try to extract from markdown block
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
        let jsonStr = match && match[1] ? match[1].trim() : content;
        
        // Find the first { or [ and last } or ]
        const startObj = jsonStr.indexOf('{');
        const startArr = jsonStr.indexOf('[');
        const endObj = jsonStr.lastIndexOf('}');
        const endArr = jsonStr.lastIndexOf(']');
        
        const start = startArr !== -1 && (startObj === -1 || startArr < startObj) ? startArr : startObj;
        const end = endArr !== -1 && (endObj === -1 || endArr > endObj) ? endArr : endObj;
        
        if (start !== -1 && end !== -1 && end >= start) {
            try {
                return JSON.parse(jsonStr.substring(start, end + 1));
            } catch (e) {
                // Ignore and fall through
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

