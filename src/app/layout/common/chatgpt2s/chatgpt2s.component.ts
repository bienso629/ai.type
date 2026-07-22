import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, TemplateRef, ViewChild, ViewContainerRef, ViewEncapsulation } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { MatButton } from '@angular/material/button';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';
import { ColumnMode } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { HTML2Paragraph } from 'app/app.pipe';
import { ToastrService } from 'ngx-toastr';
import { CrawlService } from 'app/modules/_services/crawl';
import { UserClientService } from 'app/modules/_services/user';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { LogService } from 'app/modules/_services/link';
import { BlogService } from 'app/modules/_services/blog';
import { ForumService } from 'app/modules/_services/forum';

import moment from 'moment';
import { GenaiService } from 'app/genai.service';
import { HelperService } from 'app/helper.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { GlobalAgentService } from '../../../modules/_services/global-agent.service';
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
    exportAs: 'chatgpt2s'
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

    scrollToBottom() {
        this._doScroll();
        setTimeout(() => this._doScroll(), 100);
        setTimeout(() => this._doScroll(), 300);
        setTimeout(() => this._doScroll(), 600);
    }

    private _doScroll() {
        try {
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

    stopChatLoading(row: any) {
        if (row) {
            row['chatLoading'] = false;
        }
        this.isLoading = false;
        
        const isAiAgentEnabled = this.settings?.enableAiAgent === true;
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

        if (!row || !row._id) return;

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
                this._chatGPTService.destroy(row._id, this.user.name).subscribe({
                    next: (res) => {
                        if (res && res.success) {
                            this.chatgpt2s = this.chatgpt2s.filter(r => r._id !== row._id);
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
                        }
                    },
                    error: (err) => {
                        console.error('Lỗi khi xóa cuộc hội thoại:', err);
                    }
                });
            }
        });
    }

    upload(e: any, isFollowUp: boolean = false, inputElement?: HTMLInputElement) {
        const file: File = e.target.files[0];

        if (file) {
            const settings = this.multiAccountService.getItem('settings');
            const isAiAgentEnabled = settings?.enableAiAgent === true;

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
        if (!this.user) return;

        this._chatGPTService
            .total({
                username: this.user.name
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
        if (!this.user || !this.user.name) return;
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

    async chatgpt(question: string, index?: number) {
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
                        this.chatgpt(cleanQuestion, index);
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
                            this.chatgpt(cleanQuestion, index);
                        }
                    });
                    
                    // Fallback in case component takes too long or doesn't set context
                    timeoutId = setTimeout(() => {
                        if (sub) sub.unsubscribe();
                        this.chatgpt(cleanQuestion, index);
                    }, 5000); // 5 seconds wait
                }
                return;
            }
            if (this.secretKey) {
                // Đọc cài đặt
                const settings = this.multiAccountService.getItem('settings');
                const isAiAgentEnabled = settings?.enableAiAgent === true;

                // Chuẩn bị tin nhắn của user
                let systemContext = '';
                const agentContext = this.globalAgentService.getContext();
                const latestApiData = this.globalAgentService.getApiData();
                let apiContextStr = '';
                
                try {
                    if (latestApiData && Object.keys(latestApiData).length > 0) {
                        apiContextStr = '\n- Dữ liệu API gần đây:\n' + JSON.stringify(latestApiData).substring(0, 10000);
                    }
                } catch (e) {}

                if (agentContext) {
                    let ctxData = '';
                    try { ctxData = JSON.stringify(agentContext.data); } catch (e) {}
                    systemContext = `Ngữ cảnh màn hình hiện tại (người dùng đang xem):\n- Màn hình: ${agentContext.sourcePage}\n- Dữ liệu tóm tắt (chính xác nhất, cập nhật theo thời gian thực): ${ctxData}${apiContextStr}\n\nHãy ưu tiên trả lời dựa trên Dữ liệu tóm tắt. Dữ liệu API chỉ dùng để bổ sung chi tiết. Nếu có mâu thuẫn về trạng thái (ví dụ task đã xong hay chưa), LUÔN LUÔN tin tưởng Dữ liệu tóm tắt.\n\n`;
                    
                    if (agentContext.prompt) {
                        systemContext += `HƯỚNG DẪN ĐẶC BIỆT TỪ MÀN HÌNH NÀY: ${agentContext.prompt}\n\n`;
                    }
                    
                    // Removed sendUserPrompt call
                } else if (apiContextStr) {
                    systemContext = `Ngữ cảnh màn hình hiện tại (người dùng đang xem):${apiContextStr}\n\nHãy ưu tiên trả lời hoặc thực hiện yêu cầu dựa trên ngữ cảnh này.\n\n`;
                }

                let prompt = '';
                if (agentContext?.action) {
                    prompt = `${systemContext}Yêu cầu của người dùng: "${question}". Hãy thực hiện chính xác theo HƯỚNG DẪN ĐẶC BIỆT.`;
                } else {
                    prompt = `${systemContext}Trả lời câu hỏi: "${question}" một cách ngắn gọn và chính xác. Kết quả trả lời là text thuần, không phải định dạng html hoặc markdown.`;
                }
                const parts: any[] = [{ text: prompt }];
                const userMsg: any = { role: 'user', text: question };

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
                    question: question,
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
                        
                        newRow.answer = currentStreamedText;
                        if (newRow.messages.length === 1) {
                            newRow.messages.push({ role: 'model', text: currentStreamedText });
                        } else {
                            newRow.messages[1].text = currentStreamedText;
                        }
                        this.cdref.detectChanges();
                        this.scrollToBottom();
                    };

                    const result = await this._genaiService.generateContent({
                        model: 'gemini-3.5-flash',
                        contents: [{ role: 'user', parts: parts }],
                        config: genConfig
                    });

                    if (result && result.text) {
                        (result as any).q = question;

                        if ((result as any).imgs && (result as any).imgs.length > 0) {
                            let divImgs = '';
                            (result as any).imgs.map((img: string) => {
                                divImgs = `${divImgs}<p><img src="${img}" class="chatgpt-img" /></p>`;
                            });
                            (result as any).html = `${(result as any).html}<div class="chatgpt-imgs">${divImgs}</div>`;
                        }

                        let finalDisplayText = result.text;
                        if (agentContext && agentContext.action) {
                            this.globalAgentService.sendActionResult(result.text);
                            
                            const match = result.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
                            if (match || result.text.trim().startsWith('[')) {
                                finalDisplayText = `Đã gửi lệnh điều khiển tự động lên màn hình **${agentContext.sourcePage || 'hiện tại'}** thành công! ✅\n\n*(Dữ liệu JSON đã được hệ thống tiếp nhận và cập nhật vào giao diện)*`;
                            }
                        }

                        // Cập nhật câu trả lời từ AI
                        newRow.answer = finalDisplayText;
                        
                        if (newRow.messages.length === 1) {
                             newRow.messages.push({ role: 'model', text: finalDisplayText });
                        } else {
                             newRow.messages[1].text = finalDisplayText;
                        }
                        const modelMsg = newRow.messages[1];

                        if (result.candidates && result.candidates[0]?.content?.parts) {
                            const parts = result.candidates[0].content.parts;
                            const mediaPart = parts.find((p: any) => p.inlineData);
                            if (mediaPart) {
                                modelMsg.inlineData = mediaPart.inlineData;
                            }
                        }
                        
                        newRow.updatedAt = new Date();

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
        this._chatGPTService.store({
            content: question,
            answer: answer,
            username: this.user.name
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
                        newRow.messages.push({ role: 'model', text: data.answer || '' });
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
                        this.activeChatRow.messages.push({ role: msg.role, text: msg.content });
                    }
                    this.cdref.detectChanges();
                    this.scrollToBottom();
                }
            });
    }

    getMessages(row: any): any[] {
        if (!row) return [];
        if (!row.messages) {
            row.messages = [
                { role: 'user', text: row.question || '' },
                { role: 'model', text: row.answer || '' }
            ];
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

        const userMsg: any = { role: 'user', text: newQuestion };
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
            if (agentContext && contents.length > 0 && contents[contents.length - 1].role === 'user') {
                let ctxData = '';
                try { ctxData = JSON.stringify(agentContext.data); } catch (e) {}
                const systemContext = `Ngữ cảnh màn hình hiện tại:\n- Màn hình: ${agentContext.sourcePage}\n- Dữ liệu tóm tắt: ${ctxData}\n\nHãy ưu tiên trả lời hoặc thực hiện yêu cầu dựa trên ngữ cảnh này.\n\n`;
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
                
                if (!modelMsgRef) {
                    modelMsgRef = { role: 'model', text: currentStreamedText };
                    row.messages.push(modelMsgRef);
                } else {
                    modelMsgRef.text = currentStreamedText;
                }
                row.answer = currentStreamedText;
                this.cdref.detectChanges();
                this.scrollToBottom();
            };

            const result = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: contents,
                config: genConfig
            }, row._id);
            
            if (result) {
                if (!modelMsgRef) {
                    modelMsgRef = { role: 'model', text: result.text || '' };
                    row.messages.push(modelMsgRef);
                } else {
                    modelMsgRef.text = result.text || '';
                }
                
                if (result.candidates && result.candidates[0]?.content?.parts) {
                    const parts = result.candidates[0].content.parts;
                    const mediaPart = parts.find((p: any) => p.inlineData);
                    if (mediaPart) {
                        modelMsgRef.inlineData = mediaPart.inlineData;
                    }
                }
                
                row.answer = result.text || '';
                row.updatedAt = new Date();
                
                // Nếu màn hình hiện tại có yêu cầu action, gửi kết quả về cho màn hình xử lý
                if (agentContext && agentContext.action) {
                    this.globalAgentService.sendActionResult(result.text);
                }
                
                this._chatGPTService.store({
                    _id: row._id,
                    content: row.question,
                    answer: result.text,
                    messages: row.messages,
                    username: this.user.name
                }).subscribe({
                    next: (res) => {
                        this.toastr.success('Đã cập nhật cuộc hội thoại!');
                    },
                    error: () => {
                        this.toastr.warning('Không thể đồng bộ cuộc hội thoại lên máy chủ.');
                    }
                });
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
