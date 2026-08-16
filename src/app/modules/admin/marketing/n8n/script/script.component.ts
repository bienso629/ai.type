import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation, AfterViewInit, AfterViewChecked, ElementRef, NgZone, ChangeDetectionStrategy, TemplateRef, Input, HostListener } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
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
import { BlogService } from 'app/_services/blog';
import { ToastrService } from 'ngx-toastr';
import { MXHAutoService } from 'app/_services/mxhauto';
import { MatSelectionList } from "@angular/material/list";
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { ColumnMode, SelectionType, DatatableComponent } from '@swimlane/ngx-datatable';
import { GenaiService } from 'app/genai.service';
import { MatDialog } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';

// --- IMPORT SERVICE N8N ---
import { N8nService } from 'app/_services/n8n.service';
import { MultiAccountService } from 'app/_services/multi-account.service';

interface CommentGroup {
    key: string;
    expanded: boolean;
    items: any[];
}

@Component({
    selector: 'amxh-script',
    templateUrl: './script.component.html',
    styleUrls: ['./script.component.scss'],
    providers: [BlogService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AMXHScriptAppComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked {
    config: AppConfig;
    user: User;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    private chatHistory: any[] = [];

    private hls?: Hls;
    private videoEl?: HTMLVideoElement;

    profiles: any[] = [];
    profile: any = {};
    totalProfiles: number = 0;

    readonly REFRESH_MS = 30_000;
    countdown$!: Observable<number>;

    readonly MAX_CAPTIONS = 400;
    transcript = '';
    job?: { id: string; chunksDir: string; primaryUrl: string, unique_id: string, nickname: string, title: string, bio_description: string };
    segmentSec = 10;

    rooms: any[] = [];
    gridRows: any[] = [];
    gridSize: number = 3;
    rowHeight: number = 220;
    viewMode: 'grid' | 'list' = 'grid';

    turnOffLiveStream = false;
    isProfileRunning = false;

    // AI Chat Assistant State
    chatInput: string = '';
    chatMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    items: any[] = [];

    quickActionChips = [
        { label: 'Phân tích video đã chọn', icon: 'heroicons_outline:sparkles', action: 'analyze' },
        { label: 'Tự động thích video của bạn', icon: 'feather:heart', action: 'like' },
        { label: 'Tự động bình luận cho video của bạn', icon: 'feather:message-square', action: 'comment' }
    ];

    formatAiResponse(rawText: string): string {
        if (!rawText) return '';
        let clean = rawText;

        // 1. Loại bỏ markdown code blocks ```html và ```
        clean = clean.replace(/```html/gi, '');
        clean = clean.replace(/```/g, '');

        // 2. Thay thế AI Agent và sontinh.type.vn bằng "Trợ lý phân tích"
        clean = clean.replace(/AI Agent/gi, 'Trợ lý phân tích');
        clean = clean.replace(/sontinh\.type\.vn/gi, 'Trợ lý phân tích');
        clean = clean.replace(/sontinh/gi, 'Trợ lý phân tích');

        // 3. Gom nhiều xuống dòng liên tiếp thành 1 xuống dòng để tránh thưa mét
        clean = clean.replace(/\r\n/g, '\n');
        clean = clean.replace(/\n{2,}/g, '\n');
        clean = clean.trim();

        // 4. Chuyển \n thành <br/>
        clean = clean.replace(/\n/g, '<br/>');

        // 5. Xóa bớt <br/> sau các thẻ đóng khối HTML
        clean = clean.replace(/(<\/(?:p|div|h[1-6]|ul|ol|li|table|tr|td|th)>)\s*(?:<br\s*\/?>)+/gi, '$1');

        return clean;
    }

    async sendChatMessage(): Promise<void> {
        if (!this.chatInput || !this.chatInput.trim()) return;
        const text = this.chatInput.trim();
        this.chatMessages.push({ role: 'user', content: text });
        this.chatInput = '';
        this.cd.markForCheck();

        const loadingMsg: { role: 'user' | 'assistant'; content: string } = {
            role: 'assistant',
            content: '⏳ <b>Trợ lý phân tích</b> đang suy nghĩ và phân tích...'
        };
        this.chatMessages.push(loadingMsg);
        this.cd.markForCheck();

        try {
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text }] }],
                config: {
                    systemInstruction: `Bạn là Trợ lý phân tích chuyên nghiệp hỗ trợ xây dựng kịch bản livestream, phân tích video và tự động hóa tương tác MXH. Hãy phản hồi ngắn gọn, trình bày HTML sạch sẽ, không dùng code block markdown và không ghi chữ AI Agent hay sontinh.type.vn.`
                }
            });

            const replyText = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || 'Đã xử lý xong yêu cầu của bạn.';
            loadingMsg.content = this.formatAiResponse(replyText);
        } catch (err: any) {
            console.error('Lỗi khi gọi Trợ lý phân tích:', err);
            loadingMsg.content = `❌ Không thể kết nối tới Trợ lý phân tích: ${err?.message || 'Đã có lỗi xảy ra'}`;
        }
        this.cd.markForCheck();
    }

    selectedRoom: any = null;

    selectRoom(room: any): void {
        if (!room) return;
        this.rooms.forEach(r => r.is_selected = false);
        room.is_selected = true;
        this.selectedRoom = room;

        // Đưa video được chọn lên đầu danh sách
        this.rooms = [room, ...this.rooms.filter(r => r !== room)];
        this.rebuildGridRows();

        this.toastr.info(`Đã chọn & đưa Livestream của @${room.nickname || 'Tiktoker'} lên đầu danh sách`);
        this.cd.markForCheck();
    }

    sendQuickAction(chip: any): void {
        if (chip.action === 'like') {
            this.generateLike();
        } else if (chip.action === 'comment') {
            this.generateComment();
        } else if (chip.action === 'analyze') {
            this.analyzeSelectedRoom();
        } else {
            this.chatInput = chip.label;
            this.sendChatMessage();
        }
    }

    private analysisIntervals = new Map<string, any>();

    startContinuousAnalysis(room: any): void {
        if (!room) return;
        this.selectRoom(room);
        room.is_analyzing = true;

        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const roomId = String(room.id || room.unique_id || nickname);

        // Giữ luồng phát video liên tục
        room._hovering = true;
        this.cd.markForCheck();

        this.toastr.success(`Đã bật Phân tích Realtime cho @${nickname}`);

        this.chatMessages.push({
            role: 'user',
            content: `🔴 <b>Bắt đầu phân tích trực tiếp:</b> @${nickname}`
        });

        const loadingMsg: { role: 'user' | 'assistant'; content: string } = {
            role: 'assistant',
            content: `📡 <b>Trợ lý phân tích</b> đang duy trì phát luồng video liên tục và phân tích dữ liệu trực tiếp...`
        };
        this.chatMessages.push(loadingMsg);
        this.cd.markForCheck();

        // Chạy phân tích bước đầu tiên
        this.runStreamAnalysisStep(room, loadingMsg);

        // Thiết lập interval phân tích liên tục mỗi 15 giây
        if (this.analysisIntervals.has(roomId)) {
            clearInterval(this.analysisIntervals.get(roomId));
        }

        const intervalId = setInterval(() => {
            if (!room.is_analyzing || room.is_live === false) {
                this.stopContinuousAnalysis(room);
                return;
            }
            // Giữ cho video tiếp tục phát liên tục
            room._hovering = true;
            this.runStreamAnalysisStep(room);
        }, 15000);

        this.analysisIntervals.set(roomId, intervalId);
    }

    async runStreamAnalysisStep(room: any, targetMsg?: { role: 'user' | 'assistant'; content: string }): Promise<void> {
        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const title = room.title || 'Phiên phát trực tiếp';
        const viewers = room.user_count || 0;
        const hlsUrl = this.pickHlsUrlFromRoom(room) || '';
        const timeNow = new Date().toLocaleTimeString('vi-VN');

        const promptText = `
[THỜI GIAN REALTIME: ${timeNow}]
Phân tích cập nhật luồng phát trực tiếp của @${nickname}:
- Tiêu đề: ${title}
- Mắt xem hiện tại: ${viewers}
- Luồng HLS: ${hlsUrl || 'N/A'}

Hãy cập nhật kết quả phân tích theo thời gian thực:
1. Tóm tắt diễn biến kịch bản vừa diễn ra.
2. Đánh giá thái độ/tương tác khán giả.
3. Đề xuất 2 câu comment Seeding phù hợp ngay thời điểm này.
        `.trim();

        try {
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                config: {
                    systemInstruction: `Bạn là Trợ lý phân tích duy trì phân tích luồng Livestream liên tục. Định dạng HTML thuần cực kỳ gọn gàng, tuyệt đối KHÔNG bao bọc bằng mã markdown (\`\`\`html), không khoảng cách dòng thưa mét, không ghi chữ AI Agent hay sontinh.type.vn, báo cáo rõ mốc thời gian [${timeNow}].`
                }
            });

            const replyText = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || 'Đã phân tích luồng thành công.';
            const formattedContent = this.formatAiResponse(replyText);

            if (targetMsg) {
                targetMsg.content = formattedContent;
            } else {
                this.chatMessages.push({
                    role: 'assistant',
                    content: `⏱️ <b>[${timeNow}] Cập nhật luồng @${nickname}:</b><br/>${formattedContent}`
                });
            }
        } catch (err: any) {
            console.error('Lỗi phân tích stream:', err);
            if (targetMsg) {
                targetMsg.content = `❌ Tạm thời mất kết nối Trợ lý phân tích: ${err?.message || 'Lỗi mạng'}`;
            }
        }
        this.cd.markForCheck();
    }

    stopContinuousAnalysis(room: any): void {
        if (!room) return;
        room.is_analyzing = false;
        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const roomId = String(room.id || room.unique_id || nickname);

        if (this.analysisIntervals.has(roomId)) {
            clearInterval(this.analysisIntervals.get(roomId));
            this.analysisIntervals.delete(roomId);
        }

        this.toastr.warning(`Đã tắt phân tích trực tiếp cho @${nickname}`);
        this.chatMessages.push({
            role: 'assistant',
            content: `🛑 <b>Đã dừng phân tích luồng trực tiếp của @${nickname}.</b>`
        });
        this.cd.markForCheck();
    }

    async analyzeSelectedRoom(): Promise<void> {
        const targetRoom = this.selectedRoom || (this.rooms && this.rooms.length > 0 ? this.rooms[0] : null);
        if (!targetRoom) {
            this.toastr.warning('Chưa có Livestream nào trong danh sách để phân tích.');
            return;
        }

        if (targetRoom.is_analyzing) {
            this.stopContinuousAnalysis(targetRoom);
        } else {
            this.startContinuousAnalysis(targetRoom);
        }
    }

    clearChatMessages(): void {
        this.chatMessages = [];
        this.cd.markForCheck();
    }

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
        private _genaiService: GenaiService
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

        this.getProfiles();
        this.loadScriptState();
        this.checkProfileRunningStatus();
        timer(0, 5000).pipe(takeUntil(this._unsubscribeAll)).subscribe(() => {
            this.checkProfileRunningStatus();
        });

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
        if (this.data) {
            this.captions = this.data || [];
        }
    }

    ngAfterViewChecked(): void { }

    ngOnDestroy(): void {
        this.analysisIntervals.forEach(intervalId => clearInterval(intervalId));
        this.analysisIntervals.clear();
        this.sttCaptionUnsubscribe?.();
        this.sttCaptionUnsubscribe = undefined;
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
        this.liveStop$.next();
        this.liveStop$.complete();
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

    addSeconds(date: Date, seconds: number): Date {
        const result = new Date(date);
        result.setSeconds(result.getSeconds() + seconds);
        return result;
    }

    saveScriptState() {
        try {
            const stateToSave = this.items.map(item => ({
                id: item.id, name: item.name, comments: item.streamItems.find(s => s.name === 'Viết comment trong Live')?.meta || []
            }));
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) { console.error(e); }
    }

    loadScriptState() { }

    resetScriptContext() {
        this.chatHistory = [];
        this.selected = [];
        this.captions.forEach(c => c.selected = false);
        this.clearChatMessages();
        this.cd.markForCheck();
        this.toastr.info('Đã xóa ngữ cảnh AI và kịch bản cũ.');
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

    @HostListener('window:resize', ['$event'])
    onResize(event: any) {
        this.rebuildGridRows();
    }

    detectGrid(): void {
        const w = window.innerWidth;
        if (w >= 1280) this.gridSize = 4;
        else if (w >= 768) this.gridSize = 3;
        else this.gridSize = 2;

        const containerW = 750;
        const cellWidth = (containerW - 32) / this.gridSize;
        this.rowHeight = Math.round(cellWidth) + 12;
    }

    rebuildGridRows(): void {
        this.detectGrid();
        const out: any[] = [];
        if (this.rooms && this.rooms.length > 0) {
            for (let i = 0; i < this.rooms.length; i += this.gridSize) {
                out.push({ rooms: this.rooms.slice(i, i + this.gridSize) });
            }
        }
        this.gridRows = out;
        this.cd.markForCheck();
    }

    getRoomKeys(room: any): string[] {
        const keys: string[] = [];
        if (!room) return keys;
        if (room.id) keys.push(String(room.id));
        if (room.room_id) keys.push(String(room.room_id));
        if (room.unique_id) keys.push(String(room.unique_id));
        if (room.owner?.unique_id) keys.push(String(room.owner.unique_id));
        if (room.nickname) keys.push(String(room.nickname));
        if (room.owner?.nickname) keys.push(String(room.owner.nickname));
        return keys;
    }

    updateRoomsList(newRooms: any[]): void {
        if (!newRooms || !Array.isArray(newRooms)) return;

        const activeKeysSet = new Set<string>();
        const newRoomsMap = new Map<string, any>();

        for (const newRoom of newRooms) {
            newRoom.is_live = true;
            const keys = this.getRoomKeys(newRoom);
            for (const k of keys) {
                activeKeysSet.add(k);
                if (!newRoomsMap.has(k)) {
                    newRoomsMap.set(k, newRoom);
                }
            }
        }

        if (!this.rooms || !this.rooms.length) {
            this.rooms = newRooms.map(r => ({ ...r, is_live: true, miss_count: 0 }));
            this.rebuildGridRows();
            return;
        }

        // Cập nhật trạng thái từng phòng trong danh sách hiện tại
        for (const room of this.rooms) {
            const keys = this.getRoomKeys(room);
            const matchedKey = keys.find(k => activeKeysSet.has(k));

            if (matchedKey) {
                const freshData = newRoomsMap.get(matchedKey);
                Object.assign(room, freshData, { is_live: true, miss_count: 0 });
            } else {
                // Nếu không xuất hiện trong lần poll này (có thể do phân trang API)
                room.miss_count = (room.miss_count || 0) + 1;

                // Chỉ đánh dấu ĐÃ TẮT nếu vắng mặt liên tiếp từ 3 lần poll trở lên (90s) và không phải phòng đang được chọn / AI phân tích
                if (room.miss_count >= 3 && !room.is_analyzing && this.selectedRoom !== room) {
                    room.is_live = false;
                } else {
                    room.is_live = true;
                }
            }
        }

        // Bổ sung các phòng livestream mới phát chưa có trong danh sách
        for (const newRoom of newRooms) {
            const newKeys = this.getRoomKeys(newRoom);
            const exists = this.rooms.some(r => {
                const rKeys = this.getRoomKeys(r);
                return rKeys.some(rk => newKeys.includes(rk));
            });

            if (!exists) {
                this.rooms.unshift({ ...newRoom, is_live: true, miss_count: 0 });
            }
        }

        // Ưu tiên đưa các video được chọn hoặc đang phân tích lên vị trí đầu tiên
        this.rooms.sort((a, b) => {
            const aSel = (a === this.selectedRoom || a.is_selected || a.is_analyzing) ? 1 : 0;
            const bSel = (b === this.selectedRoom || b.is_selected || b.is_analyzing) ? 1 : 0;
            return bSel - aSel;
        });

        this.rebuildGridRows();
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
}
