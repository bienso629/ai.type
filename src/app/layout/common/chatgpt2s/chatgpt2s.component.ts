import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, TemplateRef, ViewChild, ViewContainerRef, ViewEncapsulation } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { MatButton } from '@angular/material/button';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';
import { ColumnMode } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { ChatGPTService } from 'app/_services/chatgpt';
import { HTML2Paragraph } from 'app/app.pipe';
import { ToastrService } from 'ngx-toastr';
import { CrawlService } from 'app/_services/crawl';
import { UserClientService } from 'app/_services/user';
import { WP2MDService } from 'app/_services/wp2md';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { LogService } from 'app/_services/link';
import { BlogService } from 'app/_services/blog';
import { ForumService } from 'app/_services/forum';

import moment from 'moment';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { GenaiService } from 'app/genai.service';
import { HelperService } from 'app/helper.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { GlobalAgentService } from '../../../_services/global-agent.service';
import { Router } from '@angular/router';

@Component({
    selector: 'chatgpt2s',
    templateUrl: './chatgpt2s.component.html',
    styles: [
        `
        .chatgpt-result br {
            display: block;
            content: "";
            margin-top: 8px;
        }
        `
    ],
    encapsulation: ViewEncapsulation.None,
    providers: [ChatGPTService, CrawlService, UserClientService, WP2MDService, LogService, BlogService, ForumService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    exportAs: 'chatgpt2s',
    standalone: false
})
export class ChatGPTLayoutComponent implements OnInit, OnDestroy {
    user: User;
    statistics: any = {};
    settings: any;
    secretKey: any;
    searchAPIKey: any;
    isLoading: boolean = false;
    activeChatRow: any = null;

    @ViewChild('chatgptOrigin') private _chatgptOrigin: MatButton;
    @ViewChild('chatgptPanel') private _chatgptPanel: TemplateRef<any>;

    scrollToBottom(immediate: boolean = false) {
        this._doScroll();
        requestAnimationFrame(() => this._doScroll());
        setTimeout(() => this._doScroll(), 50);
        setTimeout(() => this._doScroll(), 150);
        setTimeout(() => this._doScroll(), 300);
        setTimeout(() => this._doScroll(), 600);
    }

    private _doScroll() {
        try {
            const anchor = document.getElementById('chatBottomAnchor');
            if (anchor && typeof anchor.scrollIntoView === 'function') {
                anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
            }
            const el = document.getElementById('chatMessageList');
            if (el) {
                el.scrollTop = el.scrollHeight;
            }
        } catch (err) {
            console.error('Error scrolling to bottom:', err);
        }
    }

    @ViewChild('myTable') table: any;
    html2Paragraph: HTML2Paragraph = new HTML2Paragraph();

    chatgpt2s: any[] = [];
    expanded: any = {};
    goiy: string = '';
    
    showMentions: boolean = false;
    mentionIndex: number = 0;
    ignoreNextEnter: boolean = false;
    mentionOptions = [
        { id: 'Lịch làm việc', icon: 'heroicons_outline:calendar', url: '/amxh', panel: 'schedule' },
        { id: 'Quản lý bài viết', icon: 'heroicons_outline:document-text', url: '/admin/marketing/clone-product' },
        { id: 'SEO Links', icon: 'heroicons_outline:link', url: '/admin/marketing/seo-links' }
    ];
    filteredMentionOptions: any[] = [];

    totalElements: number;
    attachedFileMain: { name: string, type: string, path?: string, base64: string } | null = null;
    attachedFileFollow: { name: string, type: string, path?: string, base64: string } | null = null;

    private getCurrentUsername(): string {
        return this.user?.name || localStorage.getItem('user_name') || localStorage.getItem('username') || 'admin';
    }
    apiFetchedCount: number = 0;
    pageNumber: number;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    currentBookmark: string = null;
    lastId: string;
    page: Page = {
        pageNumber: 0,
        size: 10,
        totalElements: 0,
        totalPages: 0,
    };

    ColumnMode = ColumnMode;
    private _overlayRef: OverlayRef;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    private audioQueue: { mimeType: string, base64Data: string }[] = [];
    private isPlayingAudio: boolean = false;
    private currentAudio: HTMLAudioElement = null;

    private playNextAudio() {
        if (this.audioQueue.length === 0) {
            this.isPlayingAudio = false;
            this.currentAudio = null;
            return;
        }
        this.isPlayingAudio = true;
        const audioData = this.audioQueue.shift();
        this.currentAudio = new Audio('data:' + audioData.mimeType + ';base64,' + audioData.base64Data);
        this.currentAudio.playbackRate = 1.25;
        this.currentAudio.onended = () => {
            this.playNextAudio();
        };
        this.currentAudio.onerror = () => {
            this.playNextAudio();
        };
        this.currentAudio.play().catch(e => {
            console.log('Autoplay prevented:', e);
            this.playNextAudio();
        });
    }

    toggleExpandRow(row: any) {
        this.activeChatRow = this.activeChatRow === row ? null : row;
        this.cdref.detectChanges();
        if (this.activeChatRow) {
            this.scrollToBottom();
        }
    }

    onDetailToggle(event: any) {}

    detail(row: any) {
        // console.log('row', row);
    }

    copy(answer: string) {
        this.clipboard.copy(answer);
        this.toastr.success('Đã copy nội dung xong!');
    }

    copyMessage(text: string) {
        if (!text) return;
        this.clipboard.copy(text);
        this.toastr.success('Đã sao chép nội dung!');
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
        if (this.activeChatRow?.updatedAt) {
            const d = new Date(this.activeChatRow.updatedAt);
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

    reAskMessage(text: string) {
        if (!text) return;
        this.goiy = text;
        const followInput = document.querySelector('#chatMessageList ~ div input') as HTMLInputElement;
        if (followInput) {
            followInput.value = text;
            followInput.focus();
        } else {
            const mainInput = document.querySelector('input[placeholder*="Gemini"]') as HTMLInputElement;
            if (mainInput) {
                mainInput.value = text;
                mainInput.focus();
            }
        }
    }

    reAskModelMessage(msg: any, activeChatRow?: any) {
        let question = '';
        if (activeChatRow) {
            const messages = this.getMessages(activeChatRow);
            const idx = messages.indexOf(msg);
            if (idx > 0 && messages[idx - 1]?.role === 'user') {
                question = messages[idx - 1]?.text;
            } else {
                question = activeChatRow?.question || '';
            }
        }
        this.reAskMessage(question || msg.text || '');
    }

    async exportPdfModelMessage(msg: any, activeChatRow?: any): Promise<void> {
        const answerText = msg?.text;
        if (!answerText) {
            this.toastr.warning('Không có nội dung câu trả lời để xuất PDF!');
            return;
        }

        let questionText = '';
        if (activeChatRow) {
            const messages = this.getMessages(activeChatRow);
            const idx = messages.indexOf(msg);
            if (idx > 0 && messages[idx - 1]?.role === 'user') {
                questionText = messages[idx - 1]?.text;
            } else {
                questionText = activeChatRow?.question || '';
            }
        }

        try {
            this.toastr.info('Đang tạo tệp PDF...');

            const pdfMakeModule = await import('pdfmake/build/pdfmake');
            const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
            const pdfFonts = (pdfFontsModule as any).default || pdfFontsModule;
            const htmlToPdfmakeModule = await import('html-to-pdfmake');
            const htmlToPdfmake = ((htmlToPdfmakeModule as any).default || htmlToPdfmakeModule) as Function;

            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const defaultStyles = {
                p: { margin: [0, 2, 0, 5], lineHeight: 1.35 },
                h1: { fontSize: 16, bold: true, marginTop: 8, marginBottom: 4 },
                h2: { fontSize: 14, bold: true, marginTop: 6, marginBottom: 3 },
                h3: { fontSize: 12, bold: true, marginTop: 5, marginBottom: 2 },
                pre: { background: '#f8fafc', color: '#0f172a', margin: [0, 4, 0, 6] },
                code: { background: '#f1f5f9', color: '#b91c1c', fontSize: 9.5 },
                ul: { marginBottom: 5, marginLeft: 8 },
                ol: { marginBottom: 5, marginLeft: 8 },
                li: { marginBottom: 2 }
            };

            const pdfContent: any[] = [];

            // 1. Khối câu hỏi
            if (questionText && questionText.trim()) {
                const questionHtml = marked.parse(questionText.trim()) as string;
                const cleanQuestionHtml = DOMPurify.sanitize(questionHtml, { USE_PROFILES: { html: true } });
                const questionConverted = htmlToPdfmake(cleanQuestionHtml, {
                    window: window,
                    removeExtraBlanks: true,
                    defaultStyles: defaultStyles
                });

                pdfContent.push({
                    table: {
                        widths: ['*'],
                        body: [
                            [
                                {
                                    stack: [
                                        { text: 'CÂU HỎI:', bold: true, color: '#15803d', fontSize: 10, marginBottom: 4 },
                                        ...(Array.isArray(questionConverted) ? questionConverted : [questionConverted])
                                    ],
                                    fillColor: '#f0fdf4',
                                    margin: [8, 6, 8, 6],
                                    border: [true, false, false, false],
                                    borderColor: ['#16a34a', null, null, null]
                                }
                            ]
                        ]
                    },
                    layout: {
                        hLineWidth: () => 0,
                        vLineWidth: (i: number) => (i === 0 ? 3.5 : 0),
                        vLineColor: () => '#16a34a'
                    },
                    marginBottom: 12
                });
            }

            // 2. Khối câu trả lời
            const answerHtml = marked.parse(answerText.trim()) as string;
            const cleanAnswerHtml = DOMPurify.sanitize(answerHtml, { USE_PROFILES: { html: true } });
            const answerConverted = htmlToPdfmake(cleanAnswerHtml, {
                window: window,
                removeExtraBlanks: true,
                defaultStyles: defaultStyles,
                tableAutoSize: true
            });

            pdfContent.push({
                stack: [
                    { text: 'CÂU TRẢ LỜI:', bold: true, color: '#2563eb', fontSize: 10, marginBottom: 6 },
                    ...(Array.isArray(answerConverted) ? answerConverted : [answerConverted])
                ]
            });

            const rawTitle = questionText && questionText.trim()
                ? questionText.trim().slice(0, 40)
                : 'Cau_Tra_Loi_Gemini';
            const safeFileName = rawTitle.replace(/[/\\?%*:|"<> \n\r\t]/g, '_').trim() || 'Cau_Tra_Loi_Gemini';
            const currentDateStr = new Date().toLocaleDateString('vi-VN');

            const docDefinition = {
                header: (currentPage: number, pageCount: number) => {
                    return {
                        columns: [
                            { text: 'ai.type - Trợ lý AI', alignment: 'left', fontSize: 8, color: '#64748b' },
                            { text: `Xuất ngày: ${currentDateStr}`, alignment: 'right', fontSize: 8, color: '#64748b' }
                        ],
                        margin: [40, 15, 40, 0]
                    };
                },
                footer: (currentPage: number, pageCount: number) => {
                    return {
                        columns: [
                            { text: 'ai.type', alignment: 'left', fontSize: 8, color: '#94a3b8' },
                            { text: `Trang ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 8, color: '#94a3b8' }
                        ],
                        margin: [40, 10, 40, 0]
                    };
                },
                pageMargins: [40, 45, 40, 45],
                content: pdfContent,
                defaultStyle: {
                    font: 'Roboto'
                }
            };

            pdfMake.createPdf(docDefinition).download(`${safeFileName}.pdf`);
            this.toastr.success('Đã xuất tệp PDF thành công!');
        } catch (error: any) {
            console.error('Lỗi khi xuất PDF:', error);
            this.toastr.error('Có lỗi xảy ra khi tạo tệp PDF!');
        }
    }

    answer2Node(answer: string) {
        let parser = new DOMParser();
        const doc = parser.parseFromString(answer, 'text/html');

        // remove tất cả html trong đoạn này
        // let content = this.html2Paragraph.transform(answer);
        // console.log('content', content);
    }

    stop() {
        this._chatGPTService.stop2025({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => { },
                error: (e: any) => {
                    this.toastr.warning('Chưa thể dừng thao tác này.');
                },
                complete: () => {
                    this.toastr.success('Đã dừng thao tác này.');
                }
            });
    }

    async stopChatLoading(row: any) {
        if (row) {
            row['chatLoading'] = false;
        }
        this.isLoading = false;

        this.audioQueue = [];
        this.isPlayingAudio = false;
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        
        let isAiAgentEnabled = this.settings?.enableAiAgent === true;
        if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
            try {
                const list = await (window as any).electronAPI.getPluginsStatus();
                const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                if (aiAgent && aiAgent.enabled !== undefined) {
                    isAiAgentEnabled = aiAgent.enabled;
                }
            } catch(e) {}
        }
        
        if (isAiAgentEnabled) {
            // Dừng tiến trình AI Agent cục bộ (port 54321)
            this._genaiService.cancelLocalAgent();
        } else {
            // Chỉ gọi dừng API từ xa nếu không sử dụng AI Agent cục bộ
            this.stop();
        }
        this.cdref.detectChanges();
    }

    deleteChat(row: any, event?: Event) {
        if (event) {
            event.stopPropagation();
        }

        if (!row) return;
        
        // Cả khi không có _id (tin nhắn tạm/lỗi mạng) vẫn cho phép xóa cục bộ
        if (!row._id && !row.conversation_id) return;

        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa cuộc hội thoại',
            message: 'Sếp có chắc chắn muốn xóa cuộc hội thoại này không?',
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa',
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: 'Hủy'
                }
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                const removeLocal = () => {
                    this.chatgpt2s = this.chatgpt2s.filter(r => r !== row);
                    this.chatgpt2s = [...this.chatgpt2s];
                    
                    this.totalElements = Math.max(0, this.totalElements - 1);
                    
                    let statistics = localStorage.getItem('statistics');
                    if (statistics) {
                        let statObj = JSON.parse(statistics);
                        statObj['chatgpt'] = this.totalElements;
                        localStorage.setItem('statistics', JSON.stringify(statObj));
                    }
                    
                    if (this.activeChatRow === row) {
                        this.activeChatRow = null;
                    }
                    
                    this.cdref.detectChanges();
                };

                const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
                if (isAutoSaveLocal && (window as any).electron?.deleteLocalChat) {
                    (window as any).electron.deleteLocalChat({
                        id: row._id || row.id,
                        conversation_id: row.conversation_id
                    }).then((res: any) => {
                        removeLocal();
                    }).catch((err: any) => {
                        console.error('Lỗi khi xóa cuộc hội thoại cục bộ:', err);
                        removeLocal();
                    });
                } else if (row._id) {
                    this._chatGPTService.destroy(row._id, this.user.name).subscribe({
                        next: (res) => {
                            if (res && res.success) {
                                removeLocal();
                            }
                        },
                        error: (err) => {
                            console.error('Lỗi khi xóa cuộc hội thoại:', err);
                            // Vẫn xóa cục bộ nếu lỗi mạng
                            removeLocal();
                        }
                    });
                } else {
                    removeLocal();
                }
            }
        });
    }

    async upload(e: any, isFollowUp: boolean = false, inputElement?: HTMLInputElement) {
        const file: File = e.target.files[0];

        if (file) {
            const settings = this.multiAccountService.getItem('settings');
            let isAiAgentEnabled = settings?.enableAiAgent === true;
            if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
                try {
                    const list = await (window as any).electronAPI.getPluginsStatus();
                    const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                    if (aiAgent && aiAgent.enabled !== undefined) {
                        isAiAgentEnabled = aiAgent.enabled;
                    }
                } catch(err) {}
            }

            let filePath = (file as any).path;
            if ((window as any).electron && (window as any).electron.getPathForFile) {
                try {
                    filePath = (window as any).electron.getPathForFile(file);
                } catch (err) {
                    console.error('[Upload File] Lỗi getPathForFile:', err);
                }
            }

            // Đọc file thành Base64 ở Client để hiển thị preview hoặc gửi lên Cloud Gemini
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                const attachedFile = {
                    name: file.name,
                    type: file.type,
                    path: filePath,
                    base64: base64
                };

                if (isFollowUp) {
                    this.attachedFileFollow = attachedFile;
                } else {
                    this.attachedFileMain = attachedFile;
                }
                
                // Kích hoạt thay đổi giao diện để sáng nút gửi
                if (isFollowUp && inputElement) {
                    inputElement.dispatchEvent(new Event('input'));
                }
                
                this.toastr.success(`Đã đính kèm tệp: ${file.name}`);
                this.cdref.detectChanges();
            };
            reader.readAsDataURL(file);
        }
    }

    // cập nhật lại số liệu câu hỏi
    updateTable(key?: string, value?: number) {
        this._userClientService.updateTable({
            username: this.user.name,
            createdAt1: moment().startOf('day').toString(),
            createdAt2: moment().endOf('day').toString(),
            table: {
                key: key,
                value: value
            }
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: () => { },
                error: () => { },
                complete: () => { }
            });
    }

    // cập nhật số liệu
    updateCount(n: number) {
        // lấy statistics dưới local lên và update
        let statistics = localStorage.getItem('statistics');
        if (statistics) {
            statistics = JSON.parse(statistics);
            if (statistics && statistics['chatgpt']) {
                statistics['chatgpt'] = parseInt(statistics['chatgpt']) + n;

                // cập nhật lại tổng
                this.totalElements = parseInt(statistics['chatgpt']);

                // lưu lại kết quả
                localStorage.setItem('statistics', JSON.stringify(statistics));
            }
        }

        // cập nhật báo cáo
        if (n > 0) {
            this.updateTable('table.chatgpt', n);
        }
    }

    /**
     * Lấy statistic
     */
    statistic() {
        const username = this.getCurrentUsername();
        if (!username) return;

        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        if (isAutoSaveLocal && (window as any).electron?.getLocalChatTotal) {
            (window as any).electron.getLocalChatTotal({ username }).then((res: any) => {
                if (res && res.success && res.data) {
                    this.totalElements = res.data.total || 0;
                    this.cdref.detectChanges();

                    let statistics = localStorage.getItem('statistics');
                    if (statistics) {
                        let statObj = JSON.parse(statistics);
                        statObj['chatgpt'] = this.totalElements;
                        localStorage.setItem('statistics', JSON.stringify(statObj));
                    }
                }
            }).catch((err: any) => {
                console.error('Lỗi khi lấy tổng chat cục bộ:', err);
            });
            return;
        }

        this._chatGPTService
            .total({
                username: username
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success && result.data !== undefined) {
                        let total = 0;
                        if (typeof result.data === 'number') {
                            total = result.data;
                        } else if (result.data && result.data.total !== undefined) {
                            total = result.data.total;
                        } else if (result.data && result.data.chatgpt !== undefined) {
                            total = result.data.chatgpt;
                        }

                        this.totalElements = total;
                        this.cdref.detectChanges();

                        let statistics = localStorage.getItem('statistics');
                        if (statistics) {
                            let statObj = JSON.parse(statistics);
                            statObj['chatgpt'] = this.totalElements;
                            localStorage.setItem('statistics', JSON.stringify(statObj));
                        }
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    /**
     * Populate the table with new data based on the page number
     * @param page The page to select
     */
    setPage(pageInfo: PageInfo) {
        if (this.isLoading) return;
        const username = this.getCurrentUsername();
        if (!username) return;
        if (!pageInfo.pageSize) pageInfo.pageSize = this.page.size || 10;
        this.pageNumber = pageInfo.offset;
        const rowOffset = pageInfo.offset * pageInfo.pageSize;

        this.page = {
            pageNumber: Math.floor(rowOffset / pageInfo.pageSize),
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0,
        };

        // Ngăn chặn việc gọi API khi scroll lên
        if (this.chatgpt2s && this.chatgpt2s[rowOffset]) {
            return;
        }
        if (this.cache[this.page.pageNumber]) return;
        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cdref.markForCheck();

        const payloadPage = {
            ...this.page,
            size: 25 // Fix cứng size
        };

        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        if (isAutoSaveLocal && (window as any).electron?.listLocalChats) {
            (window as any).electron.listLocalChats({
                username: username,
                page: payloadPage
            }).then(async (result: any) => {
                const resData = result?.data;
                const docs = Array.isArray(resData?.docs) ? resData.docs : (Array.isArray(resData) ? resData : []);

                if (docs && docs.length > 0) {
                    if (!this.chatgpt2s) {
                        this.chatgpt2s = new Array<any>(this.totalElements || 0);
                    }

                    const start = this.apiFetchedCount;
                    let newTotal = this.totalElements || 0;
                    const apiPageSize = 25;

                    if (docs.length < apiPageSize) {
                        newTotal = start + docs.length;
                    } else if (start + docs.length > newTotal) {
                        newTotal = start + docs.length;
                    }

                    if (this.totalElements !== newTotal) {
                        this.totalElements = newTotal;
                    }

                    if (!this.chatgpt2s || this.chatgpt2s.length !== this.totalElements) {
                        const oldRows = this.chatgpt2s || [];
                        this.chatgpt2s = new Array<any>(this.totalElements);
                        for (let i = 0; i < Math.min(oldRows.length, this.totalElements); i++) {
                            this.chatgpt2s[i] = oldRows[i];
                        }
                    }

                    const rows = [...this.chatgpt2s];
                    rows.splice(start, docs.length, ...docs);

                    this.chatgpt2s = rows;
                    this.apiFetchedCount += docs.length;
                } else if (!resData || result.success === false) {
                    delete this.cache[this.page.pageNumber];
                }
                this.isLoading = false;
                this.cdref.detectChanges();
            }).catch((err: any) => {
                console.error('Lỗi khi tải chat cục bộ:', err);
                delete this.cache[this.page.pageNumber];
                this.isLoading = false;
                this.cdref.markForCheck();
            });
            return;
        }

        this._chatGPTService.fetch({
            username: this.user.name,
            page: payloadPage,
            bookmark: this.currentBookmark,
            lastId: this.lastId
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    const resData = result?.data;
                    const isCouchDB = resData && !Array.isArray(resData) && resData.docs !== undefined;
                    const docs = isCouchDB ? resData.docs : (Array.isArray(resData) ? resData : []);
                    const bookmark = isCouchDB ? resData.bookmark : null;

                    if (docs && docs.length > 0) {
                        for (const doc of docs) {
                            if (doc.messages && Array.isArray(doc.messages)) {
                                for (const msg of doc.messages) {
                                    if (msg.inlineData && msg.inlineData.mimeType && msg.inlineData.mimeType.startsWith('image/') && msg.text) {
                                        msg.text = msg.text.replace(/!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/gs, '')
                                                           .replace(/<img[^>]*src=["']data:image\/[^;]+;base64,[^"']+["'][^>]*>/gis, '')
                                                           .trim();
                                    }
                                }
                            }
                        }

                        if (!this.chatgpt2s) {
                            this.chatgpt2s = new Array<any>(this.totalElements || 0);
                        }

                        const start = this.apiFetchedCount;
                        let newTotal = this.totalElements || 0;
                        const apiPageSize = 25;

                        if (docs.length < apiPageSize) {
                            newTotal = start + docs.length;
                        } else if (start + docs.length > newTotal) {
                            newTotal = start + docs.length;
                        }

                        if (this.totalElements !== newTotal) {
                            this.totalElements = newTotal;
                        }

                        if (!this.chatgpt2s || this.chatgpt2s.length !== this.totalElements) {
                            const oldRows = this.chatgpt2s || [];
                            this.chatgpt2s = new Array<any>(this.totalElements);
                            for (let i = 0; i < Math.min(oldRows.length, this.totalElements); i++) {
                                this.chatgpt2s[i] = oldRows[i];
                            }
                        }

                        const rows = [...this.chatgpt2s];
                        rows.splice(start, docs.length, ...docs);

                        this.chatgpt2s = rows;
                        this.apiFetchedCount += docs.length;

                        if (isCouchDB) {
                            this.currentBookmark = bookmark;
                        } else if (docs.length > 0) {
                            this.lastId = docs[docs.length - 1]['_id'];
                        }
                    } else if (docs && docs.length === 0 && isCouchDB && bookmark && bookmark !== this.currentBookmark) {
                        this.currentBookmark = bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cdref.detectChanges();
                        this.setPage(pageInfo);
                        return;
                    } else if (!resData || result.success === false) {
                        delete this.cache[this.page.pageNumber];
                    }
                },
                error: () => {
                    delete this.cache[this.page.pageNumber];
                    this.isLoading = false;
                    this.cdref.markForCheck();
                },
                complete: () => {
                    this.isLoading = false;
                    this.cdref.detectChanges();
                }
            });
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
        this.cdref.detectChanges();
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
            }
        }
    }

    selectMention(option: any, inputEl?: any) {
        if (inputEl) {
            const val = inputEl.value || '';
            const lastAt = val.lastIndexOf('@');
            if (lastAt !== -1) {
                const newVal = val.substring(0, lastAt) + '@' + option.id + ' ';
                inputEl.value = newVal;
                inputEl.dispatchEvent(new Event('input'));
            }
            inputEl.focus();
        } else {
            const lastAt = this.goiy.lastIndexOf('@');
            if (lastAt !== -1) {
                this.goiy = this.goiy.substring(0, lastAt) + '@' + option.id + ' ';
            }
        }
        this.showMentions = false;
    }

    async chatgpt(question: string, index?: number, forceContext: boolean = false) {
        if (this.isLoading) return;

        if (question) {
            // Check for @mentions
            const matchedMention = this.mentionOptions.find(m => question.includes('@' + m.id));
            if (matchedMention) {
                // Remove the mention from the question
                const cleanQuestion = question.replace('@' + matchedMention.id, '').trim();
                
                // Check if already on the target page with correct context
                const currentContext = this.globalAgentService.getContext();
                const isAlreadyOnTarget = currentContext && currentContext.sourcePage && currentContext.sourcePage.toLowerCase().includes(matchedMention.id.toLowerCase());
                
                if (isAlreadyOnTarget) {
                    this.goiy = '';
                    if (cleanQuestion) {
                        this.chatgpt(cleanQuestion, index, true);
                    }
                    return;
                }

                // Navigate to the screen (force reload to ensure ngOnInit triggers if same URL but different panel)
                if (matchedMention.panel) {
                    this._router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
                        this._router.navigate([matchedMention.url], { state: { panel: matchedMention.panel } });
                    });
                } else {
                    this._router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
                        this._router.navigate([matchedMention.url]);
                    });
                }
                this.goiy = '';
                
                // Wait for navigation and component init, then send prompt to THIS agent
                if (cleanQuestion) {
                    this.globalAgentService.clearContext(); // Clear old context
                    let timeoutId: any;
                    let sub: any;
                    
                    sub = this.globalAgentService.currentContext$.subscribe(ctx => {
                        if (ctx && ctx.action) {
                            clearTimeout(timeoutId);
                            if (sub) sub.unsubscribe();
                            this.chatgpt(cleanQuestion, index, true);
                        }
                    });
                    
                    // Fallback in case component takes too long or doesn't set context
                    timeoutId = setTimeout(() => {
                        if (sub) sub.unsubscribe();
                        this.chatgpt(cleanQuestion, index, true);
                    }, 5000); // 5 seconds wait
                }
                return;
            }
            if (this.secretKey) {
                // Đọc cài đặt
                const settings = this.multiAccountService.getItem('settings');
                let isAiAgentEnabled = settings?.enableAiAgent === true;
                if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
                    try {
                        const list = await (window as any).electronAPI.getPluginsStatus();
                        const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                        if (aiAgent && aiAgent.enabled !== undefined) {
                            isAiAgentEnabled = aiAgent.enabled;
                        }
                    } catch(err) {}
                }

                // Chuẩn bị tin nhắn của user
                let systemContext = '';
                const agentContext = this.globalAgentService.getContext();
                const latestApiData = this.globalAgentService.getApiData();
                let apiContextStr = '';
                
                try {
                    // if (latestApiData && Object.keys(latestApiData).length > 0) {
                    //     apiContextStr = '\n- Dữ liệu API gần đây:\n' + JSON.stringify(latestApiData).substring(0, 10000);
                    // }
                } catch (e) {}

                if (agentContext && (forceContext || agentContext.action || agentContext.prompt)) {
                    systemContext = '';
                    if (agentContext.prompt) {
                        systemContext += `HƯỚNG DẪN ĐẶC BIỆT TỪ MÀN HÌNH NÀY: ${agentContext.prompt}\n\n`;
                    }
                } else if (apiContextStr) {
                    // systemContext = `Ngữ cảnh màn hình hiện tại (người dùng đang xem):${apiContextStr}\n\nHãy ưu tiên trả lời hoặc thực hiện yêu cầu dựa trên ngữ cảnh này.\n\n`;
                    systemContext = ``;
                }

                let prompt = '';
                if (agentContext?.action) {
                    prompt = `${systemContext}Yêu cầu của người dùng: "${question}". Hãy thực hiện chính xác theo HƯỚNG DẪN ĐẶC BIỆT.`;
                } else {
                    prompt = `${systemContext}Trả lời câu hỏi: "${question}" một cách ngắn gọn và chính xác. Kết quả trả lời là text thuần, không phải định dạng html hoặc markdown.`;
                }
                const parts: any[] = [{ text: prompt }];
                const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const userMsg: any = { role: 'user', text: question, time: currentTimeStr, timestamp: Date.now() };

                if (this.attachedFileMain) {
                    parts.push({
                        inlineData: {
                            mimeType: this.attachedFileMain.type,
                            data: this.attachedFileMain.base64
                        }
                    });
                    userMsg.inlineData = {
                        mimeType: this.attachedFileMain.type,
                        data: this.attachedFileMain.base64
                    };
                    userMsg.path = this.attachedFileMain.path;

                    if (isAiAgentEnabled && this.attachedFileMain.path) {
                        parts.push({ text: `\n[Tệp đính kèm local]: ${this.attachedFileMain.path}` });
                    }
                }

                // 1. Khởi tạo dòng chat mới và chuyển sang giao diện chat ngay lập tức
                const newRow: any = {
                    conversation_id: '',
                    question: question || (this.attachedFileMain ? 'File đính kèm' : 'AI Agent Chat'),
                    answer: '',
                    updatedAt: new Date(),
                    chatLoading: true,
                    messages: [userMsg]
                };

                this.chatgpt2s.unshift(newRow);
                this.chatgpt2s = [...this.chatgpt2s];
                this.totalElements++;
                this.apiFetchedCount++;
                this.cache = {};
                this.goiy = '';
                this.attachedFileMain = null; // Xóa preview tệp đính kèm
                
                this.activeChatRow = newRow;
                this.isLoading = true; // Block main header inputs
                this.cdref.detectChanges();
                this.scrollToBottom();

                try {
                    const genConfig: any = { bypassUModelverse: agentContext?.action ? true : false };
                    if (agentContext?.action) {
                        genConfig.responseMimeType = 'application/json';
                    }

                    let currentStreamedText = '';
                    genConfig.onStream = (chunk: string, isFull: boolean) => {
                        if (isFull) currentStreamedText = chunk;
                        else currentStreamedText += chunk;
                        
                        let tempText = currentStreamedText;
                        const mdMatches = [...tempText.matchAll(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/gs)];
                        if (mdMatches.length > 0) {
                            newRow.inlineData = { mimeType: mdMatches[0][2], data: mdMatches[0][3] };
                            for (const m of mdMatches) {
                                tempText = tempText.replace(m[0], '').trim();
                            }
                        }
                        const htmlMatches = [...tempText.matchAll(/<img[^>]*src=["'](data:(image\/[^;]+);base64,([^"']+))["'][^>]*>/gis)];
                        if (htmlMatches.length > 0) {
                            if (!newRow.inlineData) {
                                newRow.inlineData = { mimeType: htmlMatches[0][2], data: htmlMatches[0][3] };
                            }
                            for (const m of htmlMatches) {
                                tempText = tempText.replace(m[0], '').trim();
                            }
                        }
                        currentStreamedText = tempText;

                        newRow.answer = currentStreamedText;
                        const modelTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        if (newRow.messages.length === 1) {
                            newRow.messages.push({ role: 'model', text: currentStreamedText, time: modelTimeStr, timestamp: Date.now() });
                        } else {
                            newRow.messages[1].text = currentStreamedText;
                            if (!newRow.messages[1].time) {
                                newRow.messages[1].time = modelTimeStr;
                                newRow.messages[1].timestamp = Date.now();
                            }
                        }
                        this.cdref.detectChanges();
                        this.scrollToBottom();
                    };

                    const result = await this._genaiService.generateContent({
                        model: 'gemini-3.6-flash',
                        contents: [{ role: 'user', parts: parts }],
                        config: genConfig
                    }, newRow.conversation_id || newRow._id);

                    if (result && (result.text || (result.candidates && result.candidates[0]?.content?.parts?.some((p: any) => p.inlineData)))) {
                        (result as any).q = question;

                        if ((result as any).imgs && (result as any).imgs.length > 0) {
                            let divImgs = '';
                            (result as any).imgs.map((img: string) => {
                                divImgs = `${divImgs}<p><img src="${img}" class="chatgpt-img" /></p>`;
                            });
                            (result as any).html = `${(result as any).html}<div class="chatgpt-imgs">${divImgs}</div>`;
                        }

                        let finalDisplayText = result.text || '';
                        if (agentContext && agentContext.action) {
                            this.globalAgentService.sendActionResult(finalDisplayText);
                            
                            const match = result.text?.match(/```(?:json)?\s*([\s\S]*?)```/i);
                            if (match || result.text?.trim().startsWith('[')) {
                                finalDisplayText = `Đã gửi lệnh điều khiển tự động lên màn hình **${agentContext.sourcePage || 'hiện tại'}** thành công! ✅\n\n*(Dữ liệu JSON đã được hệ thống tiếp nhận và cập nhật vào giao diện)*`;
                            }
                        }

                        let displayText = finalDisplayText;
                        let extractedInlineData: any = null;
                        
                        // Extract and remove ALL dataUri markdown images
                        const mdMatches = [...displayText.matchAll(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/gs)];
                        if (mdMatches.length > 0) {
                            extractedInlineData = { mimeType: mdMatches[0][2], data: mdMatches[0][3] };
                            for (const m of mdMatches) {
                                displayText = displayText.replace(m[0], '').trim();
                            }
                        }

                        // Extract and remove ALL dataUri HTML images (if any)
                        const htmlMatches = [...displayText.matchAll(/<img[^>]*src=["'](data:(image\/[^;]+);base64,([^"']+))["'][^>]*>/gis)];
                        if (htmlMatches.length > 0) {
                            if (!extractedInlineData) {
                                extractedInlineData = { mimeType: htmlMatches[0][2], data: htmlMatches[0][3] };
                            }
                            for (const m of htmlMatches) {
                                displayText = displayText.replace(m[0], '').trim();
                            }
                        }

                        finalDisplayText = displayText; // Xóa base64 khổng lồ khỏi chuỗi lưu DB
                        
                        // Kiểm tra xem text có chứa thẻ ảnh (Markdown url hoặc HTML) nào không
                        const hasAnyImageTag = /!\[.*?\]\(.*?\)|<img[^>]+>/is.test(finalDisplayText);
                        
                        // Để tránh hiển thị đúp ảnh trên giao diện live (1 cái từ markdown, 1 cái từ inlineData),
                        // ta sẽ ẩn thẻ ảnh trong text hiển thị live nếu đã có inlineData.
                        let liveDisplayText = displayText;
                        if (hasAnyImageTag && (extractedInlineData || (result.candidates && result.candidates[0]?.content?.parts?.some((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('image/'))))) {
                             liveDisplayText = displayText.replace(/!\[.*?\]\(.*?\)/gs, '').replace(/<img[^>]+>/gis, '').trim();
                        }

                        // Cập nhật câu trả lời hiển thị ban đầu
                        newRow.answer = finalDisplayText;

                        if (newRow.messages.length === 1) {
                             newRow.messages.push({ role: 'model', text: liveDisplayText });
                        } else {
                             newRow.messages[1].text = liveDisplayText;
                        }
                        const modelMsg = newRow.messages[1];
                        if (extractedInlineData) {
                            modelMsg.inlineData = extractedInlineData;
                        }

                        if (result.candidates && result.candidates[0]?.content?.parts) {
                            const parts = result.candidates[0].content.parts;
                            
                            // Phát audio ngay và luôn (không lưu vào thẻ hiển thị/msg)
                            const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));
                            if (audioPart) {
                                this.audioQueue.push({
                                    mimeType: audioPart.inlineData.mimeType,
                                    base64Data: audioPart.inlineData.data
                                });
                                if (!this.isPlayingAudio) {
                                    this.playNextAudio();
                                }
                            }
                            
                            // Chỉ lưu ảnh/video vào inlineData (từ parts nếu có)
                            const mediaPart = parts.find((p: any) => p.inlineData && !p.inlineData.mimeType.startsWith('audio/'));
                            if (mediaPart) {
                                modelMsg.inlineData = mediaPart.inlineData;
                            }
                        }
                        
                        if (modelMsg.inlineData) {
                            // Clone modelMsg and messages to trigger Angular change detection
                            newRow.messages[1] = { ...modelMsg };
                            newRow.messages = [...newRow.messages];
                        }
                        newRow.updatedAt = new Date();
                        if ((result as any).conversation_id) {
                            newRow.conversation_id = (result as any).conversation_id;
                        }

                        // Tự động upload ảnh (base64, local file path) lên CDN server và cập nhật hiển thị/CSDL
                        await this.uploadImagesInMessageToCdn(modelMsg, newRow);
                        newRow.messages[1] = { ...modelMsg };
                        newRow.messages = [...newRow.messages];
                        finalDisplayText = newRow.answer || finalDisplayText;

                        this.chatgptStore(finalDisplayText, question, newRow);
                    } else {
                        this.toastr.warning('Gemini của bạn chưa hoạt động.');
                        newRow.messages.push({ role: 'model', text: 'Gemini chưa hoạt động.' });
                    }
                } catch (error) {
                    console.error('Lỗi hỏi chatgpt:', error);
                    // Nếu là do hủy yêu cầu (abort)
                    if (error && error.name === 'AbortError') {
                        this.toastr.warning('Đã dừng phản hồi AI.');
                        newRow.messages.push({ role: 'model', text: 'Yêu cầu đã bị dừng.' });
                    } else {
                        this.toastr.error('Có lỗi xảy ra khi gọi AI.');
                        newRow.messages.push({ role: 'model', text: 'Lỗi kết nối AI.' });
                    }
                } finally {
                    newRow.chatLoading = false;
                    this.isLoading = false;
                    this.cdref.detectChanges();
                    this.scrollToBottom();
                }
            } else {
                this.toastr.warning('Bạn chưa kết nối Gemini.');
            }
        } else {
            this.toastr.warning('Xin lỗi! Bạn chưa có prompt.');
        }
    }

    chatgptStore(answer: string, question: string, row: any) {
        const username = this.getCurrentUsername();
        const payload: any = {
            _id: row?._id,
            question: question || (row?.messages?.[0]?.path ? 'File đính kèm' : 'AI Agent Chat'),
            content: question || (row?.messages?.[0]?.path ? 'File đính kèm' : 'AI Agent Chat'),
            answer: answer,
            messages: row?.messages,
            conversation_id: row?.conversation_id,
            username: username
        };

        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        if (isAutoSaveLocal && (window as any).electron?.saveLocalChat) {
            (window as any).electron.saveLocalChat(payload).then((result: any) => {
                if (result && result.success) {
                    if (row) {
                        const newId = result.data?._id || result.data?.id || result._id || result.id;
                        if (newId) {
                            row._id = newId;
                        }
                    }
                    let statistics = localStorage.getItem('statistics');
                    if (statistics) {
                        let statObj = JSON.parse(statistics);
                        statObj['chatgpt'] = this.totalElements;
                        localStorage.setItem('statistics', JSON.stringify(statObj));
                        this._h.updateStatistics('chatgpt', 1);
                    }
                    this.cdref.detectChanges();
                    this.toastr.success('ChatGPT đã trả lời bạn.');
                }
            }).catch((err: any) => {
                console.error('Lỗi khi lưu cuộc hội thoại cục bộ:', err);
            });
            return;
        }

        this._chatGPTService.store({
            question: payload.question,
            content: payload.content,
            answer: answer,
            conversation_id: payload.conversation_id,
            username: username
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        if (row) {
                            const newId = result.data?._id || result.data?.id || result._id || result.id;
                            if (newId) {
                                row._id = newId;
                            }
                            if (result.data?._rev || result._rev) {
                                row._rev = result.data?._rev || result._rev;
                            }
                        }
                        let statistics = localStorage.getItem('statistics');
                        if (statistics) {
                            let statObj = JSON.parse(statistics);
                            statObj['chatgpt'] = this.totalElements;
                            localStorage.setItem('statistics', JSON.stringify(statObj));
                            this._h.updateStatistics('chatgpt', 1);
                        }
                        this.cdref.detectChanges();
                        this.toastr.success('ChatGPT đã trả lời bạn.');
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Type Lite của bạn chưa được bật.');
                },
                complete: () => { }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private _router: Router,
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private _chatGPTService: ChatGPTService,
        private _userClientService: UserClientService,
        private _blogService: BlogService,
        private _userService: UserService,
        private _overlay: Overlay,
        private _h: HelperService,
        private cdref: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _viewContainerRef: ViewContainerRef,
        private _genaiService: GenaiService,
        private _fuseConfirmationService: FuseConfirmationService,
        private _forumService: ForumService,
        public globalAgentService: GlobalAgentService
    ) {
        // lấy secretKey và searchAPIKey
        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;
        }

        // Lắng nghe sự kiện chuyển SEO check sang Chat từ các màn hình khác
        this._h.openChatGPTWithSEO$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((data) => {
                this.openPanel();

                if (data.goiy !== undefined) {
                    this.goiy = data.goiy;
                }
                if (data.attachedFile !== undefined) {
                    this.attachedFileMain = data.attachedFile;
                }

                if (!data.question) {
                    this.cdref.detectChanges();
                    return;
                }

                // Tìm xem đã có dòng hội thoại nào trùng tiêu đề/question đang ở trạng thái loading chưa
                let existingRow = this.chatgpt2s?.find(r => r.question === data.question && r['chatLoading']);

                if (existingRow) {
                    if (data.loading) {
                        if (data.answer) {
                            existingRow.answer = data.answer;
                            this.cdref.detectChanges();
                        }
                        return;
                    }
                    // Cập nhật kết quả khi đã quét xong
                    existingRow.answer = data.answer;
                    existingRow.updatedAt = new Date();
                    existingRow['chatLoading'] = false;
                    existingRow.messages = [
                        { role: 'user', text: existingRow.question || '' },
                        { role: 'model', text: data.answer || '' }
                    ];

                    this.chatgpt2s = [...this.chatgpt2s];
                    this.cdref.detectChanges();

                    if (this.activeChatRow && this.activeChatRow.question === existingRow.question) {
                        this.activeChatRow = existingRow;
                        this.cdref.detectChanges();
                        this.scrollToBottom();
                    }

                    // Lưu vĩnh viễn vào cơ sở dữ liệu chat
                    this.chatgptStore(data.answer, data.question, existingRow);
                } else {
                    // Tạo cuộc hội thoại mới
                    const newRow: any = {
                        question: data.question,
                        answer: data.answer,
                        updatedAt: new Date(),
                        messages: [
                            { role: 'user', text: data.question || '' }
                        ]
                    };

                    if (data.loading) {
                        newRow['chatLoading'] = true;
                    } else {
                        let ans = data.answer || '';
                        let extractedInlineData: any = null;
                        const match = ans.match(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/s);
                        if (match) {
                            extractedInlineData = { mimeType: match[2], data: match[3] };
                            ans = ans.replace(match[0], '').trim();
                        }
                        const msgObj: any = { role: 'model', text: ans };
                        if (extractedInlineData) {
                            msgObj.inlineData = extractedInlineData;
                        }
                        newRow.messages.push(msgObj);
                    }

                    if (!this.chatgpt2s) {
                        this.chatgpt2s = [];
                    }
                    this.chatgpt2s.unshift(newRow);
                    this.chatgpt2s = [...this.chatgpt2s];
                    this.totalElements++;
                    this.cdref.detectChanges();

                    this.activeChatRow = newRow;
                    this.cdref.detectChanges();
                    this.scrollToBottom();

                    if (!data.loading) {
                        this.chatgptStore(data.answer, data.question, newRow);
                    }
                }
            });
            
        // Subscribe to direct streaming updates from background tasks (e.g. processDomains)
        this.globalAgentService.streamMessage$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((msg: any) => {
                if (this.activeChatRow) {
                    if (msg.isStreaming || msg.replaceLast) {
                        this.activeChatRow['chatLoading'] = true;
                        this.activeChatRow.answer = msg.content;
                    } else if (msg.isStreaming === false) {
                        this.activeChatRow['chatLoading'] = false;
                        this.activeChatRow.answer = msg.content;
                        if (!this.activeChatRow.messages) {
                            this.activeChatRow.messages = [
                                { role: 'user', text: this.activeChatRow.question || '' }
                            ];
                        }
                        
                        let ans = msg.content || '';
                        let extractedInlineData: any = null;
                        const match = ans.match(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/s);
                        if (match) {
                            extractedInlineData = { mimeType: match[2], data: match[3] };
                            ans = ans.replace(match[0], '').trim();
                        }
                        
                        const msgObj: any = { role: msg.role, text: ans };
                        if (extractedInlineData) {
                            msgObj.inlineData = extractedInlineData;
                        }
                        this.uploadImagesInMessageToCdn(msgObj, this.activeChatRow).then((updated) => {
                            if (updated) {
                                this.cdref.detectChanges();
                            }
                        });
                        this.activeChatRow.messages.push(msgObj);
                    }
                    this.cdref.detectChanges();
                    this.scrollToBottom();
                }
            });
    }

    getMessages(row: any): any[] {
        if (!row) return [];
        const fallbackDate = row.updatedAt || row.createdAt;
        const rowTimeStr = fallbackDate ? new Date(fallbackDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const rowTimestamp = fallbackDate ? new Date(fallbackDate).getTime() : undefined;

        if (!row.messages) {
            let ans = row.answer || '';
            let inlineData: any = null;
            const match = ans.match(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/s);
            if (match) {
                inlineData = { mimeType: match[2], data: match[3] };
                ans = ans.replace(match[0], '').trim();
            }

            const defaultTimeStr = rowTimeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const defaultTimestamp = rowTimestamp || Date.now();
            const modelMsg = { role: 'model', text: ans, inlineData: inlineData, time: defaultTimeStr, timestamp: defaultTimestamp };
            row.messages = [
                { role: 'user', text: row.question || '', time: defaultTimeStr, timestamp: defaultTimestamp },
                modelMsg
            ];

            this.uploadImagesInMessageToCdn(modelMsg, row).then((updated) => {
                if (updated) {
                    row.messages[1] = { ...modelMsg };
                    row.messages = [...row.messages];
                    this.cdref.detectChanges();
                }
            });
        } else if (Array.isArray(row.messages)) {
            // Nếu messages đã có từ database, gán fallback time/timestamp từ updatedAt/createdAt nếu phần tử chưa có
            row.messages.forEach((m: any) => {
                if (m && !m.time && rowTimeStr) {
                    m.time = rowTimeStr;
                    m.timestamp = rowTimestamp;
                }
            });
        }
        return row.messages;
    }

    triggerFollowUp(row: any, inputElement: HTMLInputElement) {
        const val = inputElement.value ? inputElement.value.trim() : '';
        if (val || this.attachedFileFollow) {
            // Check for @mentions
            const matchedMention = this.mentionOptions.find(m => val.includes('@' + m.id));
            if (matchedMention) {
                const cleanQuestion = val.replace('@' + matchedMention.id, '').trim();
                
                this._router.navigate([matchedMention.url]);
                inputElement.value = '';
                
                if (cleanQuestion) {
                    setTimeout(() => {
                        this.sendFollowUp(row, cleanQuestion);
                    }, 800);
                }
                return;
            }

            this.sendFollowUp(row, val);
            inputElement.value = '';
        }
    }

    async sendFollowUp(row: any, newQuestion: string) {
        if (!newQuestion || !newQuestion.trim()) return;
        newQuestion = newQuestion.trim();
        
        this.getMessages(row);
        
        const settings = this.multiAccountService.getItem('settings');
        const isAiAgentEnabled = settings?.enableAiAgent === true;

        const followUpTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMsg: any = { role: 'user', text: newQuestion, time: followUpTimeStr, timestamp: Date.now() };
        if (this.attachedFileFollow) {
            userMsg.inlineData = {
                mimeType: this.attachedFileFollow.type,
                data: this.attachedFileFollow.base64
            };
            userMsg.path = this.attachedFileFollow.path;
        }

        row.messages.push(userMsg);
        row['chatLoading'] = true;
        row.answer = ''; // Clear the old answer so the loading text shows up
        this.attachedFileFollow = null; // Clear attachment preview
        
        this.cdref.detectChanges();
        this.scrollToBottom();
        
        try {
            const contents = row.messages.map((m: any) => {
                const parts: any[] = [{ text: m.text }];
                if (m.inlineData) {
                    parts.push({
                        inlineData: {
                            mimeType: m.inlineData.mimeType,
                            data: m.inlineData.data
                        }
                    });
                    if (isAiAgentEnabled && m.path) {
                        parts.push({ text: `\n[Tệp đính kèm local]: ${m.path}` });
                    }
                }
                return { role: m.role, parts: parts };
            });
            // Inject context into the last user message
            const agentContext = this.globalAgentService.getContext();
            if (agentContext && agentContext.prompt && contents.length > 0 && contents[contents.length - 1].role === 'user') {
                const systemContext = `HƯỚNG DẪN ĐẶC BIỆT: ${agentContext.prompt}\n\n`;
                contents[contents.length - 1].parts[0].text = systemContext + contents[contents.length - 1].parts[0].text;
            }
            
            const genConfig: any = { bypassUModelverse: agentContext?.action ? true : false };
            if (agentContext?.action) {
                genConfig.responseMimeType = 'application/json';
            }

            let currentStreamedText = '';
            let modelMsgRef: any = null;
            genConfig.onStream = (chunk: string, isFull: boolean) => {
                if (isFull) currentStreamedText = chunk;
                else currentStreamedText += chunk;
                
                let tempText = currentStreamedText;
                const mdMatches = [...tempText.matchAll(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/gs)];
                if (mdMatches.length > 0) {
                    if (!modelMsgRef) modelMsgRef = { role: 'model', text: '' };
                    modelMsgRef.inlineData = { mimeType: mdMatches[0][2], data: mdMatches[0][3] };
                    for (const m of mdMatches) {
                        tempText = tempText.replace(m[0], '').trim();
                    }
                }
                const htmlMatches = [...tempText.matchAll(/<img[^>]*src=["'](data:(image\/[^;]+);base64,([^"']+))["'][^>]*>/gis)];
                if (htmlMatches.length > 0) {
                    if (!modelMsgRef) modelMsgRef = { role: 'model', text: '' };
                    if (!modelMsgRef.inlineData) {
                        modelMsgRef.inlineData = { mimeType: htmlMatches[0][2], data: htmlMatches[0][3] };
                    }
                    for (const m of htmlMatches) {
                        tempText = tempText.replace(m[0], '').trim();
                    }
                }
                currentStreamedText = tempText;
                
                if (!modelMsgRef) {
                    modelMsgRef = { role: 'model', text: currentStreamedText };
                    row.messages.push(modelMsgRef);
                } else {
                    modelMsgRef.text = currentStreamedText;
                    if (!row.messages.includes(modelMsgRef)) row.messages.push(modelMsgRef);
                }
                row.answer = currentStreamedText;
                this.cdref.detectChanges();
                this.scrollToBottom();
            };
            // Intercept image generation requests
            const lastMsgText = contents[contents.length - 1]?.parts?.[0]?.text?.toLowerCase() || '';
            const isImageGen = lastMsgText.startsWith('tạo hình') || 
                               lastMsgText.startsWith('vẽ') || 
                               lastMsgText.startsWith('generate image') || 
                               lastMsgText.startsWith('draw');
                               
            if (isImageGen) {
                genConfig.responseModalities = ['IMAGE'];
                
                // Tiền xử lý prompt: Dịch sang tiếng Anh và thêm hướng dẫn như AI Writer
                const promptForPrompt = `Dựa vào yêu cầu sau:
"${contents[contents.length - 1].parts[0].text}"
Hãy viết một prompt tiếng Anh ngắn gọn, chi tiết và có tính chất mô tả trực quan (khoảng 30-50 từ) để làm đầu vào cho mô hình tạo ảnh.
Prompt nên tập trung vào bối cảnh chính, chủ thể chính và phong cách nghệ thuật hiện đại.
Chỉ trả về duy nhất chuỗi prompt tiếng Anh, không kèm theo bất kỳ lời giới thiệu, lời dẫn hay giải thích nào khác.`;

                try {
                    const promptResponse = await this._genaiService.generateContent({
                        model: 'gemini-3.6-flash',
                        contents: [{ role: 'user', parts: [{ text: promptForPrompt }] }],
                        config: { bypassUModelverse: true } as any // Dùng bypass để lấy prompt nhanh bằng API thường
                    });
                    
                    if (promptResponse && promptResponse.text) {
                        let finalPrompt = promptResponse.text.trim();
                        finalPrompt += ', if there is any text in the image, it MUST be written in Vietnamese language.';
                        // Ghi đè lại prompt cuối cùng để gửi đi
                        contents[contents.length - 1].parts[0].text = finalPrompt;
                    }
                } catch(e) {
                    console.error("Lỗi khi tạo prompt tiếng Anh cho ảnh:", e);
                }
            }

            const result = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: contents,
                config: genConfig
            }, row.conversation_id || row._id);
            
            if (result) {
                let finalDisplayText = result.text || '';
                let displayText = finalDisplayText;
                let extractedInlineData: any = null;
                
                const mdMatches = [...displayText.matchAll(/!\[.*?\]\((data:(image\/[^;]+);base64,([^\)]+))\)/gs)];
                if (mdMatches.length > 0) {
                    extractedInlineData = { mimeType: mdMatches[0][2], data: mdMatches[0][3] };
                    for (const m of mdMatches) {
                        displayText = displayText.replace(m[0], '').trim();
                    }
                }

                const htmlMatches = [...displayText.matchAll(/<img[^>]*src=["'](data:(image\/[^;]+);base64,([^"']+))["'][^>]*>/gis)];
                if (htmlMatches.length > 0) {
                    if (!extractedInlineData) {
                        extractedInlineData = { mimeType: htmlMatches[0][2], data: htmlMatches[0][3] };
                    }
                    for (const m of htmlMatches) {
                        displayText = displayText.replace(m[0], '').trim();
                    }
                }

                finalDisplayText = displayText;
                const hasAnyImageTag = /!\[.*?\]\(.*?\)|<img[^>]+>/is.test(finalDisplayText);
                
                let liveDisplayText = displayText;
                if (hasAnyImageTag && (extractedInlineData || (result.candidates && result.candidates[0]?.content?.parts?.some((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('image/'))))) {
                     liveDisplayText = displayText.replace(/!\[.*?\]\(.*?\)/gs, '').replace(/<img[^>]+>/gis, '').trim();
                }

                if (!modelMsgRef) {
                    modelMsgRef = { role: 'model', text: liveDisplayText };
                    row.messages.push(modelMsgRef);
                } else {
                    modelMsgRef.text = liveDisplayText;
                }
                
                if (extractedInlineData) {
                    modelMsgRef.inlineData = extractedInlineData;
                }
                
                if (result.candidates && result.candidates[0]?.content?.parts) {
                    const parts = result.candidates[0].content.parts;
                    const mediaPart = parts.find((p: any) => p.inlineData && !p.inlineData.mimeType.startsWith('audio/'));
                    if (mediaPart) {
                        modelMsgRef.inlineData = mediaPart.inlineData;
                    }
                }
                
                row.answer = finalDisplayText;
                row.updatedAt = new Date();
                
                // Nếu màn hình hiện tại có yêu cầu action, gửi kết quả về cho màn hình xử lý
                if (agentContext && agentContext.action) {
                    this.globalAgentService.sendActionResult(finalDisplayText);
                }
                if ((result as any).conversation_id) {
                    row.conversation_id = (result as any).conversation_id;
                }
                
                // Tự động upload ảnh (base64, local file path) lên CDN server và cập nhật hiển thị/CSDL
                await this.uploadImagesInMessageToCdn(modelMsgRef, row);
                if (row.messages && row.messages.length > 0) {
                    row.messages[row.messages.length - 1] = { ...modelMsgRef };
                    row.messages = [...row.messages];
                }
                finalDisplayText = row.answer || finalDisplayText;
                
                const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
                const username = this.getCurrentUsername();
                const chatPayload: any = {
                    _id: row._id,
                    question: row.question || (row?.messages?.[0]?.path ? 'File đính kèm' : 'AI Agent Chat'),
                    content: row.question || (row?.messages?.[0]?.path ? 'File đính kèm' : 'AI Agent Chat'),
                    answer: finalDisplayText,
                    messages: row.messages,
                    conversation_id: row.conversation_id,
                    username: username
                };

                if (isAutoSaveLocal && (window as any).electron?.saveLocalChat) {
                    (window as any).electron.saveLocalChat(chatPayload).then((res: any) => {
                        if (res && res.success && (res.data?._id || res._id)) {
                            row._id = res.data?._id || res._id;
                        }
                        this.toastr.success('Đã cập nhật cuộc hội thoại!');
                    }).catch((err: any) => {
                        console.error('Lỗi khi lưu cập nhật chat cục bộ:', err);
                    });
                } else {
                    this._chatGPTService.store(chatPayload).subscribe({
                        next: (res) => {
                            this.toastr.success('Đã cập nhật cuộc hội thoại!');
                        },
                        error: () => {
                            this.toastr.warning('Không thể đồng bộ cuộc hội thoại lên máy chủ.');
                        }
                    });
                }
            } else {
                this.toastr.error('AI không phản hồi.');
                row.messages.pop();
            }
        } catch (error) {
            console.error('Lỗi hỏi tiếp:', error);
            this.toastr.error('Có lỗi xảy ra khi gọi AI.');
            row.messages.pop();
        } finally {
            row['chatLoading'] = false;
            this.cdref.detectChanges();
            this.scrollToBottom();
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // lấy statistics dưới local lên và update
        let statistics = localStorage.getItem('statistics');
        if (statistics) {
            statistics = JSON.parse(statistics);
            this.totalElements = statistics['chatgpt'];
        }

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();

        // Dispose the overlay
        if (this._overlayRef) {
            this._overlayRef.dispose();
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Open the chatgpt panel
     */
    openPanel(): void {
        // Return if the notifications panel or its origin is not defined
        if (!this._chatgptPanel || !this._chatgptOrigin) {
            return;
        }

        // Create the overlay if it doesn't exist
        if (!this._overlayRef) {
            this._createOverlay();
        }

        // Return if already attached
        if (this._overlayRef.hasAttached()) {
            return;
        }

        // Attach the portal to the overlay
        this._overlayRef.attach(new TemplatePortal(this._chatgptPanel, this._viewContainerRef));

        // Reset phân trang và tải trang đầu tiên mỗi khi mở Panel
        this.chatgpt2s = [];
        this.cache = {};
        this.apiFetchedCount = 0;
        this.currentBookmark = null;
        this.lastId = null;
        this.pageNumber = 0;
        this.isLoading = false; // reset loading flag
        this.setPage({ offset: 0, pageSize: 10 } as any);

        // Tính tổng lại mỗi lần mở popup
        this.statistic();
    }

    /**
     * Close the notifications panel
     */
    closePanel(): void {
        this._overlayRef.detach();
    }

    public async uploadImagesInMessageToCdn(msgObj: any, rowObj?: any): Promise<boolean> {
        if (!msgObj) return false;
        let updated = false;
        try {
            // 1. Inline base64 image data from Gemini API
            if (msgObj.inlineData && msgObj.inlineData.mimeType && msgObj.inlineData.mimeType.startsWith('image/') && msgObj.inlineData.data) {
                let ext = 'png';
                if (msgObj.inlineData.mimeType.includes('jpeg') || msgObj.inlineData.mimeType.includes('jpg')) ext = 'jpg';
                else if (msgObj.inlineData.mimeType.includes('webp')) ext = 'webp';

                const cdnUrl = await this._genaiService.uploadBase64ToCdn(
                    msgObj.inlineData.data,
                    `chatgpt_${Date.now()}.${ext}`,
                    this.user?.name
                );

                if (cdnUrl) {
                    delete msgObj.inlineData;
                    let text = msgObj.text || '';
                    if (!text.includes(cdnUrl)) {
                        text = (text.trim() + `\n\n![Generated Image](${cdnUrl})`).trim();
                    }
                    msgObj.text = text;
                    updated = true;
                }
            }

            // 2. Base64 markdown/HTML images or local file paths in msgObj.text
            if (msgObj.text && typeof msgObj.text === 'string') {
                let text = msgObj.text;

                // 2a. Base64 markdown image: ![alt](data:image/...;base64,...)
                const mdBase64Matches = [...text.matchAll(/!\[(.*?)\]\((data:(image\/[^;]+);base64,([^\)]+))\)/gs)];
                for (const match of mdBase64Matches) {
                    const alt = match[1] || 'Generated Image';
                    const mimeType = match[3];
                    const base64Data = match[4];
                    let ext = 'png';
                    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';

                    const cdnUrl = await this._genaiService.uploadBase64ToCdn(
                        base64Data,
                        `chatgpt_${Date.now()}.${ext}`,
                        this.user?.name
                    );

                    if (cdnUrl) {
                        text = text.replace(match[0], `![${alt}](${cdnUrl})`);
                        updated = true;
                    }
                }

                // 2b. Base64 HTML image: <img ... src="data:image/...;base64,..." ...>
                const htmlBase64Matches = [...text.matchAll(/<img[^>]*src=["'](data:(image\/[^;]+);base64,([^"']+))["'][^>]*>/gis)];
                for (const match of htmlBase64Matches) {
                    const mimeType = match[2];
                    const base64Data = match[3];
                    let ext = 'png';
                    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';

                    const cdnUrl = await this._genaiService.uploadBase64ToCdn(
                        base64Data,
                        `chatgpt_${Date.now()}.${ext}`,
                        this.user?.name
                    );

                    if (cdnUrl) {
                        text = text.replace(match[1], cdnUrl);
                        updated = true;
                    }
                }

                // 2c. Local file paths (vd: Documents/ai.type/data/profiles/.../wall_photo.jpg, /home/..., file://...)
                const localPathRegex = /(?:!\[(.*?)\]\((?:file:\/\/)?([^)]+\.(?:png|jpg|jpeg|webp|gif))\)|<img[^>]*src=["'](?:file:\/\/)?([^"']+\.(?:png|jpg|jpeg|webp|gif))["'][^>]*>|(?:^|\s|`|\()((?:[a-zA-Z]:\\|\/|Documents\/)[^\s\)`]+\.(?:png|jpg|jpeg|webp|gif))(?:\s|`|\)|$))/gi;
                const localMatches = [...text.matchAll(localPathRegex)];

                for (const match of localMatches) {
                    const alt = match[1] || 'Local Image';
                    let filePath = match[2] || match[3] || match[4];
                    if (filePath && !filePath.startsWith('http://') && !filePath.startsWith('https://') && !filePath.startsWith('data:')) {
                        let fullPath = filePath;
                        if (filePath.startsWith('Documents/')) {
                            fullPath = '/home/yenai/' + filePath;
                        }

                        let b64: string | null = null;
                        if ((window as any).electronAPI && (window as any).electronAPI.readFileBase64) {
                            try {
                                b64 = await (window as any).electronAPI.readFileBase64(fullPath);
                            } catch(e) {}
                        }

                        if (!b64) {
                            try {
                                const resp = await fetch('file://' + fullPath);
                                const blob = await resp.blob();
                                b64 = await new Promise<string>((resolve) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                        const res = reader.result as string;
                                        resolve(res ? res.split(',')[1] : '');
                                    };
                                    reader.readAsDataURL(blob);
                                });
                            } catch(e) {}
                        }

                        if (b64) {
                            let ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
                            const cdnUrl = await this._genaiService.uploadBase64ToCdn(
                                b64,
                                `chatgpt_${Date.now()}.${ext}`,
                                this.user?.name
                            );
                            if (cdnUrl) {
                                if (match[0].startsWith('![')) {
                                    text = text.replace(match[0], `![${alt}](${cdnUrl})`);
                                } else if (match[0].startsWith('<img')) {
                                    text = text.replace(match[0], `<img src="${cdnUrl}" class="rounded-xl object-contain max-h-96 shadow-sm" />`);
                                } else {
                                    const orig = match[4];
                                    if (orig) {
                                        text = text.replace(orig, cdnUrl);
                                    }
                                    if (!text.includes(`![${alt}](${cdnUrl})`)) {
                                        text += `\n\n![${alt}](${cdnUrl})`;
                                    }
                                }
                                updated = true;
                            }
                        }
                    }
                }

                msgObj.text = text;
            }

            if (updated && rowObj) {
                rowObj.answer = msgObj.text;
            }
        } catch (e) {
            console.warn('[CDN Upload] Error processing message images:', e);
        }
        return updated;
    }

    downloadImage(msg: any) {
        if (!msg.inlineData || !msg.inlineData.data) return;
        try {
            const byteString = atob(msg.inlineData.data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: msg.inlineData.mimeType || 'image/png' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'sontinh_' + (msg.path ? msg.path.split('/').pop() : 'image_' + new Date().getTime() + '.png');
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        } catch(e) {
            console.error('Lỗi khi tải ảnh:', e);
        }
    }

    postChatToForum(content: string, row: any) {
        let title = 'Chia sẻ ảnh nghệ thuật';
        if (row.question) {
            const match = row.question.match(/"([^"]+)"/);
            if (match && match[1]) {
                title = `Ảnh AI: ${match[1]}`;
            }
        }
        
        this.isLoading = true;
        this.cdref.detectChanges();
        
        this._forumService.createTopic({
            _uid: this.user.id,
            cid: 1,
            title: title,
            content: content,
            tags: ['ai-image', 'prompt']
        }).subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res && res.success) {
                    this.toastr.success('Đã đăng lên diễn đàn Typing thành công!');
                } else {
                    this.toastr.error('Đăng bài thất bại.');
                }
                this.cdref.detectChanges();
            },
            error: () => {
                this.isLoading = false;
                this.toastr.error('Có lỗi xảy ra khi kết nối diễn đàn.');
                this.cdref.detectChanges();
            }
        });
    }

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Create the overlay
     */
    private _createOverlay(): void {
        // Create the overlay
        this._overlayRef = this._overlay.create({
            hasBackdrop: true,
            backdropClass: 'fuse-backdrop-on-mobile',
            scrollStrategy: this._overlay.scrollStrategies.block(),
            positionStrategy: this._overlay.position()
                .flexibleConnectedTo(this._chatgptOrigin._elementRef.nativeElement)
                .withLockedPosition(true)
                .withPush(true)
                .withPositions([
                    {
                        originX: 'start',
                        originY: 'bottom',
                        overlayX: 'start',
                        overlayY: 'top'
                    },
                    {
                        originX: 'start',
                        originY: 'top',
                        overlayX: 'start',
                        overlayY: 'bottom'
                    },
                    {
                        originX: 'end',
                        originY: 'bottom',
                        overlayX: 'end',
                        overlayY: 'top'
                    },
                    {
                        originX: 'end',
                        originY: 'top',
                        overlayX: 'end',
                        overlayY: 'bottom'
                    }
                ])
        });

        // Detach the overlay from the portal on backdrop click
        this._overlayRef.backdropClick().subscribe(() => {
            this._overlayRef.detach();
        });
    }
}
