import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { catchError, interval, of, Subject, Subscription, switchMap, takeUntil, takeWhile } from 'rxjs';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';
import { MatDrawer } from '@angular/material/sidenav';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { HelperService } from 'app/helper.service';
import { marked } from 'marked';
import { ChatbotService } from 'app/_services/chatbot';

import { MatDialog } from '@angular/material/dialog';
import { FileListDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/file-list-dialog.component';
import { DocTypeDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/doc-type-dialog.component';
import { IndexDomainsDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/index-domains-dialog.component';
import { SettingChatbotDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/setting-chatbot-dialog.component';
import { TaskProgressService } from 'app/layout/common/task-progress/task-progress.service';

import DOMPurify from 'dompurify';
import { DomainService } from 'app/_services/domain';
import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { LogService } from 'app/_services/link';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'chatbot',
    templateUrl: './chatbot.component.html',
    providers: [ChatbotService, DomainService, LogService],
    styleUrls: ['./chatbot.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatBotComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;
    settings: any;

    // Quản lý Danh sách Files ở cột trái
    fileRows: any[] = [];
    filteredFileRows: any[] = [];
    fileSearchText: string = '';
    isLoadingFiles: boolean = false;

    // Quản lý Right Sidebar Hộp Thoại đã chat
    showThreadsSidebar: boolean = true;
    threadSearchText: string = '';

    get filteredThreadRows(): any[] {
        if (!this.threadSearchText?.trim()) {
            return this.threadRows || [];
        }
        const q = this.threadSearchText.toLowerCase().trim();
        return (this.threadRows || []).filter(t => 
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.title && t.title.toLowerCase().includes(q)) ||
            (t.id && String(t.id).includes(q))
        );
    }

    toggleThreadsSidebar(): void {
        this.showThreadsSidebar = !this.showThreadsSidebar;
    }

    // Trạng thái tiến trình Indexing
    indexingFilename: string | null = null;
    indexingSubscription: Subscription | null = null;
    isIndexing = false;
    progressPercent = 0;
    progressStatus = 'Đang khởi tạo...';

    // Giá trị user chọn trong radio
    selectedDocType: string | null = 'analysis';

    // ✅ BIẾN NÀY (doc_type thực tế dùng để upload)
    currentDocType: string | null = null;

    // Tóm tắt / Pháp lý / Phân tích / Kỹ thuật / Hỏi đáp chi tiết / Sách giáo khoa / Luận văn / Hợp đồng / Bản trình chiếu / Bài báo học thuật
    docTypes = [
        { value: 'summary', label: 'Tóm tắt' },
        { value: 'legal', label: 'Pháp lý' },
        { value: 'analysis', label: 'Phân tích' },
        { value: 'technical', label: 'Kỹ thuật' },
        { value: 'qa_detailed', label: 'Hỏi đáp chi tiết' },
        { value: 'textbook', label: 'Sách giáo khoa' },
        { value: 'thesis', label: 'Luận văn' },
        { value: 'contract', label: 'Hợp đồng' },
        { value: 'slides', label: 'Bản trình chiếu' },
        { value: 'academic_article', label: 'Bài báo học thuật' },
    ];

    selectedDataSource: 'documents' | 'website' | 'all' = 'documents';

    // Danh sách docTypes đã chọn trong Settings
    selectedDocTypes: string[] = [];

    // ✅ NEW: Danh sách domains đã chọn trong Settings
    selectedSettingsDomains: string[] = [];

    // ✅ NEW: Custom Prompt
    customPrompt: string = '';

    // Dữ liệu popup Index Domains
    selectedDomain: string | null = null;

    // Textarea: mỗi dòng 1 sitemap URL
    sitemapsText = '';

    // Danh sách domain lấy từ API (dạng object {id, domain, ...})
    domainOptions: any[] = [];

    @ViewChild('drawer') drawer: MatDrawer;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    selectedPanel: string = 'account';
    chatbotMessage: UntypedFormGroup;

    currentThread: number = null;
    threadList: any[] = [];
    messages: any[] = [];
    currentMessages: any[] = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    threadRows: any[] = []; // rows cho ngx-datatable
    threadTableHeight = 520; // sẽ tính lại theo viewport (optional)

    inputMessage: string = '';
    isLoading: boolean = false;
    attachedFile: { name: string, type: string, path?: string, base64?: string, file?: File } | null = null;

    failedUrls: string[] = []; // Biến mới: Lưu URL lỗi
    retryCount: number = 0;    // Biến mới: Đếm số lần thử lại
    maxRetries: number = 3;    // Biến mới: Giới hạn thử lại

    statusIndex: any = {
        domain: '',
        status: '',
        files: '',
        urls: [],
        total: 0,       // Thêm: Tổng số URL
        completed: 0,   // Thêm: Số URL thành công
        failed: 0,      // Thêm: Số URL lỗi
        retrying: false,// Thêm: Trạng thái đang thử lại
        retryTurn: 0
    }

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    private rebuildThreadRows(): void {
        // threadList: [id, title, name, email, phone]
        this.threadRows = (this.threadList || []).map(t => ({
            id: t?.[0],
            title: t?.[1] || '',
            name: t?.[2] || '',
            email: t?.[3] || '',
            phone: t?.[4] ?? null,
            raw: t, // giữ raw để dùng nếu cần
        }));

        this.cd.markForCheck();
    }

    private calcThreadTableHeight(): void {
        const h = Math.max(120, window.innerHeight - 356);
        this.threadTableHeight = h;
        this.cd.markForCheck();
    }

    get selectedThreadRows(): any[] {
        const id = Number(this.selectedPanel);
        if (!id) return [];
        const found = (this.threadRows || []).find(r => Number(r?.id) === id);
        return found ? [found] : [];
    }

    @HostListener('window:resize')
    onResize() {
        this.calcThreadTableHeight();
    }

    call(phone: number) {
        window.location.href = `tel:+${phone}`;
    }

    onThreadRowActivate(ev: any) {
        if (ev?.type === 'click' && ev?.row?.id) {
            this.selectThread(ev.row.id);
        }
    }

    initDB() {
        this._chatbotService.initDB({
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.username) {
                        this.toastr.success('Kích hoạt Chatbot thành công!');
                    }

                    this.loadThreads();
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    renderMessages(messages: any[]) {
        const chat = document.getElementById('chat');
        if (!chat) return;

        chat.innerHTML = '';

        const currentThread = this.threadList.filter((item: any) => item[0] === this.currentThread);
        const currentName = currentThread?.[0]?.[2] ?? this.user?.name ?? 'U';

        messages.forEach(m => {
            const wrapper = document.createElement('div');
            wrapper.className = `message-row ${m[2] === 'user' ? 'user' : ''}`;

            const message = document.createElement('div');
            message.className = `message ${m[2] === 'user' ? 'user' : ''}`;

            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            if (m[2] === 'user') {
                if (currentThread?.[0]?.[3]) {
                    const image = document.createElement('img');
                    image.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentName)}`;
                    image.alt = this.user?.name ?? 'U';
                    avatar.appendChild(image);
                } else {
                    avatar.textContent = 'U';
                }
            } else {
                avatar.textContent = 'B';
            }

            const bubble = document.createElement('div');
            bubble.className = `bubble px-6 py-4 leading-6 text-base ${m[2] === 'user' ? 'user' : 'bot'}`;

            // ✅ Parse + sanitize rồi gán innerHTML (không dùng textContent)
            const md = (m[3] ?? '').toString();
            const html = marked.parse(md) as string;
            const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
            bubble.innerHTML = clean;

            // Tuỳ chọn: ép link mở tab mới & an toàn
            bubble.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            });

            const bubbleWrap = document.createElement('div');
            bubbleWrap.className = 'flex flex-col';
            bubbleWrap.appendChild(bubble);

            // Render tags (an toàn)
            if (m[4]) {
                try {
                    const tags = JSON.parse(m[4]);
                    if (Array.isArray(tags) && tags.length) {
                        const container = document.createElement('div');
                        container.className = 'tags-container hidden mb-2 flex flex-col';

                        const labelDiv = document.createElement('div');
                        labelDiv.className = 'text-md my-2 cursor-pointer hover:text-gray-600';
                        labelDiv.textContent = 'Nguồn [+]';
                        bubble.appendChild(labelDiv);

                        labelDiv.addEventListener('click', () => {
                            container.classList.toggle('hidden');
                        });

                        tags.forEach((tag: any) => {
                            const tagDiv = document.createElement('label');
                            tagDiv.className = 'tag font-normal cursor-pointer hover:text-gray-800';
                            tagDiv.textContent = String(tag);
                            container.appendChild(tagDiv);
                        });

                        bubble.appendChild(container);
                    }
                } catch { /* ignore malformed JSON */ }
            }

            // Footer dưới mỗi bong bóng: Thời gian, Nút Copy, Nút Hỏi lại
            const footer = document.createElement('div');
            footer.className = `flex items-center gap-2 mt-1 px-1 text-xs text-gray-400 dark:text-gray-400 select-none ${m[2] === 'user' ? 'justify-end' : 'justify-start'}`;

            // 1. Thời gian
            const timeSpan = document.createElement('span');
            const date = new Date();
            const baseTime = m[6] || date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeSpan.textContent = (m[7] && m[8]) ? `${baseTime}, IP: ${m[7]}, From: ${m[8]}` : baseTime;
            footer.appendChild(timeSpan);

            // 2. Nút Copy
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'flex items-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-0.5 rounded cursor-pointer';
            copyBtn.title = 'Sao chép nội dung';
            copyBtn.innerHTML = `<svg class="w-3.5 h-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="text-[11px]">Copy</span>`;
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rawText = (m[3] ?? '').toString();
                navigator.clipboard.writeText(rawText).then(() => {
                    this.toastr.success('Đã sao chép nội dung!');
                }).catch(() => {
                    this.toastr.info('Đã sao chép nội dung');
                });
            });
            footer.appendChild(copyBtn);

            // 3. Nút Hỏi lại
            const reAskBtn = document.createElement('button');
            reAskBtn.type = 'button';
            reAskBtn.className = 'flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-0.5 rounded cursor-pointer';
            reAskBtn.title = 'Hỏi lại nội dung này';
            reAskBtn.innerHTML = `<svg class="w-3.5 h-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg><span class="text-[11px]">Hỏi lại</span>`;
            reAskBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let promptText = (m[3] ?? '').toString();
                if (m[2] !== 'user') {
                    const msgIdx = messages.indexOf(m);
                    if (msgIdx > 0 && messages[msgIdx - 1]?.[2] === 'user') {
                        promptText = (messages[msgIdx - 1][3] ?? '').toString();
                    }
                }
                if (this.chatbotMessage) {
                    this.chatbotMessage.get('text')?.setValue(promptText);
                }
                const inputEl = document.querySelector('#chat-container ~ div textarea, #chat-container ~ div input') as HTMLInputElement | HTMLTextAreaElement;
                if (inputEl) inputEl.focus();
            });
            footer.appendChild(reAskBtn);

            bubbleWrap.appendChild(footer);
            message.appendChild(avatar);
            message.appendChild(bubbleWrap);
            wrapper.appendChild(message);
            chat.appendChild(wrapper);
        });

        this.currentMessages = messages;
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    appendTyping() {
        const chat = document.getElementById('chat');
        if (!chat) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'message-row';

        const message = document.createElement('div');
        message.className = 'message';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = 'B';

        const bubble = document.createElement('div');
        bubble.className = 'bubble bot text-base animate-pulse';
        bubble.textContent = 'Đang trả lời...';

        message.appendChild(avatar);
        message.appendChild(bubble);
        wrapper.appendChild(message);
        wrapper.id = 'typing';

        chat.appendChild(wrapper);
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    removeTyping() {
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
    }

    toggleDarkMode(): void {
        document.documentElement.classList.toggle('dark');
    }

    loadThreads(): void {
        this._chatbotService.loadThreads({
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (data) => {
                    if (data) {
                        this.threadList = data;
                        this.rebuildThreadRows();
                        this.calcThreadTableHeight();

                        if (data.length > 0 && !this.currentThread) {
                            this.selectThread(data[0][0]);
                        }

                        this.cd.markForCheck();
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    selectThread(threadId: number): void {
        this.currentThread = threadId;
        this.selectedPanel = `${threadId}`;

        this._chatbotService.selectThread({
            threadId: threadId,
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (data) => {
                    this.messages = data;

                    this.removeTyping();
                    this.renderMessages(data);
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    createThread(): void {
        this._chatbotService.createThread({
            username: this.user.name,
            name: this.user.name,
            email: this.user.email,
            phone: this.help.textToNumber(this.user.name)
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (threadId) => {
                    this.currentThread = threadId;
                    this.loadThreads();
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    getMessage(currentThread: any): void {
        this._chatbotService.getMessage({
            username: this.user.name,
            currentThread: currentThread
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (messages) => {
                    this.removeTyping();
                    this.currentMessages = messages;
                    this.renderMessages(messages);
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    sendMessage() {
        let msg = this.chatbotMessage.get('chatgpt')?.value || '';
        const attached = this.attachedFile;

        if (!this.currentThread || (!msg?.trim() && !attached)) {
            this.toastr.warning('Chưa có cuộc trò chuyện hoặc tin nhắn trống!');
            return;
        }

        if (attached && !msg?.trim()) {
            msg = `Phân tích tệp đính kèm: ${attached.name}`;
        } else if (attached && msg?.trim()) {
            msg = `${msg.trim()}\n[Tệp đính kèm]: ${attached.name}`;
        }

        this.chatbotMessage.controls['chatgpt'].reset();
        this.attachedFile = null;

        const date = new Date();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // 1. Tạo tin nhắn người dùng
        const userMessage = [this.currentMessages.length + 1, this.currentThread, 'user', msg, null, null, timeStr];

        // 2. Tạo KHUNG TRỐNG cho tin nhắn của Bot (chuẩn bị hứng chữ)
        const botIndex = this.currentMessages.length + 2;
        const botMessage = [botIndex, this.currentThread, 'bot', 'Đang phân tích...', null, null, timeStr];

        this.currentMessages = [...this.currentMessages, userMessage, botMessage];
        this.renderMessages(this.currentMessages);

        // Chuẩn bị DOM element để bắn text vào liên tục
        const chat = document.getElementById('chat');
        if (!chat) return;
        const lastRow = chat.lastElementChild;
        const bubble = lastRow.querySelector('.bubble');

        let fullText = '';
        let isFirstChunk = true; // Cờ để xóa chữ "Đang phân tích..."

        const secretKeys = this.settings.secretKey ? this.settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];
        const geminiKey = secretKeys.length > 0 ? secretKeys[Math.floor(Math.random() * secretKeys.length)] : '';

        if (!geminiKey) {
            this.toastr.warning('Bạn chưa có mã Google Gemini Key');
            return;
        }

        const payload = {
            thread_id: this.currentThread,
            username: this.user.name,
            message: msg,
            ip_address: "192.168.1.1",
            sender_info: "Chrome on Windows",
            google_api_key: geminiKey,
            llm_model: "gemini-3.6-flash",
            simple_chatbot_data_source: this.selectedDataSource || 'documents',
            index_dir: `faiss_pdf_index`
        };

        // 3. Gọi API Streaming
        this._chatbotService.streamMessage(payload).then(async response => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            // Vòng lặp đọc dữ liệu liên tục từ Server
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Ghép nối các mảnh data bị đứt đoạn do đường truyền
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // Giữ lại mảnh cuối (chưa hoàn chỉnh) để vòng lặp sau xử lý

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));

                            // Nếu Server văng lỗi
                            if (data.error) {
                                fullText = `<span class="text-red-500 font-medium">Lỗi hệ thống AI: ${data.error}</span>`;
                            }
                            // Nếu là luồng chữ trả về
                            else if (data.chunk) {
                                if (isFirstChunk) {
                                    fullText = ''; // Phá bỏ chữ "Đang phân tích..." ban đầu
                                    isFirstChunk = false;
                                }
                                fullText += data.chunk;
                            }

                            // Dịch Markdown sang HTML và Update thẳng vào Bubble ngay lập tức
                            const html = marked.parse(fullText) as string;
                            bubble.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
                            const chatContainer = document.getElementById('chat-container');
                            if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight; // Cuộn chat xuống

                            // Khi kết thúc toàn bộ luồng
                            if (data.done) {
                                botMessage[3] = fullText;
                                botMessage[4] = data.sources ? JSON.stringify(data.sources) : null;

                                // Gọi render 1 lần cuối cùng để kích hoạt các UI vệ tinh (vd: Thẻ Nguồn gốc, Nút Copy...)
                                this.renderMessages(this.currentMessages);

                                // Có thể xem Profiler ở Console
                                if (data.profiler_seconds) {
                                    console.log('⏱️ Tốc độ xử lý (giây):', data.profiler_seconds);
                                }
                            }
                        } catch (e) {
                            // Bỏ qua các JSON lỗi do mạng chập chờn chia cắt
                        }
                    }
                }
            }
        }).catch(err => {
            console.error('Lỗi streaming:', err);
            this.toastr.error('Mất kết nối với máy chủ AI.');
        });
    }

    /**
     * Lấy tất cả domain của khách
     */
    alldomains() {
        this._domainService.fetch({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.domainOptions = result.data;
                    } else {
                        this.domainOptions = [{ domain: 'https://type.vn' }] as any;
                    }
                    this.selectedDomain = this.domainOptions[0]['domain'];
                    this.cd.markForCheck();
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    triggerPdfUpload(): void {
        const dialogRef = this.dialog.open(DocTypeDialogComponent, {
            data: {
                docTypes: this.docTypes,
                selectedDocType: this.selectedDocType
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.selectedDocType = result;
                this.confirmDocType();
            }
        });
    }

    confirmDocType() {
        if (!this.selectedDocType) {
            this.toastr.warning('Vui lòng chọn loại tài liệu');
            return;
        }

        // Lưu doc_type để dùng khi upload
        this.currentDocType = this.selectedDocType;
        localStorage.setItem('last_doc_type', this.currentDocType!);

        setTimeout(() => {
            document.getElementById('pdfInput')?.click();
        }, 0);
    }

    async onPdfSelected(event: any): Promise<void> {
        const file = (event.target as HTMLInputElement)?.files?.[0];
        if (!file) return;

        if (!file) return;

        const triggerIndex = (filename: string) => {
            const secretKeys = this.settings?.secretKey ? this.settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];
            const geminiKey = secretKeys.length > 0 ? secretKeys[Math.floor(Math.random() * secretKeys.length)] : '';

            const payload = {
                username: this.user.name,
                google_api_key: geminiKey,
                llm_model: "gemini-3.6-flash",
                index_dir: `faiss_pdf_index`,
                filename: filename,
                doc_type: this.currentDocType
            };

            this._chatbotService.indexFiles(payload).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: (res: any) => {
                    if (res && res.success) {
                        this.toastr.info('AI đang bắt đầu học tài liệu này...');
                    }
                }
            });
        };

        if (file.name.toLowerCase().endsWith('.pdf')) {
            try {
                const electron = (window as any).electron;
                if (!electron) {
                    this.toastr.error('Chức năng phân tích chỉ khả dụng trên ứng dụng máy tính (Desktop).');
                    return;
                }

                const filePath = electron.getPathForFile(file);
                if (!filePath) {
                    this.toastr.error('Không thể xác định đường dẫn file cục bộ.');
                    return;
                }

                // Hiển thị component Task Progress ở giữa trên cùng
                this.taskProgress.show(`Phân tích: ${file.name}`, 'Đang chuẩn bị dữ liệu...');

                // Đăng ký nhận luồng dữ liệu tiến trình từ Electron
                const cleanup = electron.onPdfProgress((data: string) => {
                    this.taskProgress.updateMessage(data);
                });

                // Xử lý khi user bấm nút Cancel trên popup
                const cancelSub = this.taskProgress.cancel$.subscribe(() => {
                    electron.invoke('cancel-pdf-analysis').catch(console.error);
                });

                try {
                    let serverApiUrl = 'http://localhost:8002'; // Mặc định
                    try {
                        const settings = this.multiAccountService.getItem('settings');
                        if (settings && settings.umodelverseUrl) {
                            serverApiUrl = settings.umodelverseUrl;
                        }
                    } catch (e) { }

                    serverApiUrl = serverApiUrl.replace(/\/$/, ''); // Xoá dấu gạch chéo cuối nếu có

                    let result: any;
                    this.taskProgress.updateMessage(`Đang gửi qua Server Chatbot (${serverApiUrl})...`);
                    const response = await fetch(`${serverApiUrl}/analyze_pdf`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_path: filePath })
                    });
                    if (!response.ok) {
                        throw new Error(`Lỗi Server: ${response.statusText}`);
                    }
                    const resData = await response.json();
                    if (resData.status !== 'success') {
                        throw new Error(resData.message || 'Lỗi phân tích từ server.py');
                    }
                    result = typeof resData.data === 'string' ? resData.data : JSON.stringify(resData.data);

                    this.taskProgress.done('Phân tích hoàn tất! Đang lưu lên hệ thống...');
                    console.log("Kết quả phân tích từ AI:", result);

                    // Đẩy kết quả phân tích JSON về Server
                    this._chatbotService.uploadMinerUResult({
                        username: this.user.name,
                        filename: file.name,
                        doc_type: this.currentDocType,
                        content_json: result // result đã được main.js trích xuất phần data
                    }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                        next: (res) => {
                            if (res && res.success) {
                                this.toastr.success('Đã lưu kết quả thông minh vào máy chủ!');
                                triggerIndex(file.name);
                            } else {
                                this.toastr.error('Lỗi khi lưu kết quả lên máy chủ');
                            }
                        },
                        error: (err) => {
                            console.error("Lỗi gửi server:", err);
                            this.toastr.error('Không kết nối được với máy chủ để lưu file');
                        }
                    });

                } catch (error: any) {
                    console.error("Lỗi phân tích:", error);
                    // Nếu lỗi do user cancel (ví dụ API trả về 499) thì không hiển thị lỗi đỏ
                    if (error?.message?.includes('cancelled')) {
                        return;
                    }
                    this.taskProgress.error('Có lỗi xảy ra: ' + (error?.message || error));
                } finally {
                    cleanup(); // Hủy lắng nghe event để tránh leak memory
                    cancelSub.unsubscribe();
                }

            } catch (error: any) {
                console.error(error);
                this.toastr.error('Có lỗi xảy ra: ' + (error?.message || error));
            } finally {
                // Clear input
                (event.target as HTMLInputElement).value = '';
            }
            return;
        }
        // Nếu không phải file PDF, sẽ đi tiếp upload như bình thường

        const formData = new FormData();
        formData.append('file', file);
        formData.append('doc_type', this.currentDocType); // 👈 NEW
        formData.append('username', this.user.name);

        this._chatbotService.onPdfSelected(formData)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (res) => {
                    if (res.success) {
                        this.toastr.success('Upload thành công!');
                        triggerIndex(file.name);
                    } else {
                        this.toastr.error('Upload thất bại.');
                    }
                },
                error: () => {
                    this.toastr.error('Upload thất bại.');
                },
                complete: () => {
                    (event.target as HTMLInputElement).value = '';
                }
            });
    }

    loadFileRows(): void {
        if (!this.user?.name) return;
        this.isLoadingFiles = true;
        this._chatbotService.listFiles({
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                this.isLoadingFiles = false;
                let files: any[] = [];
                if (res && res.files) files = res.files;
                else if (res && res.data) files = res.data;
                else if (Array.isArray(res)) files = res;
                this.fileRows = files;
                this.applyFileFilter();
                this.cd.markForCheck();
            },
            error: () => {
                this.isLoadingFiles = false;
                this.cd.markForCheck();
            }
        });
    }

    applyFileFilter(): void {
        if (!this.fileSearchText?.trim()) {
            this.filteredFileRows = [...this.fileRows];
        } else {
            const q = this.fileSearchText.toLowerCase().trim();
            this.filteredFileRows = this.fileRows.filter(f => 
                (f.filename && f.filename.toLowerCase().includes(q)) ||
                (f.doc_type && f.doc_type.toLowerCase().includes(q))
            );
        }
        this.cd.markForCheck();
    }

    async reIndexPdf(doc_type: string, filename: string, rowIndex?: number): Promise<void> {
        const secretKeys = this.settings?.secretKey ? this.settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];
        const geminiKey = secretKeys.length > 0 ? secretKeys[Math.floor(Math.random() * secretKeys.length)] : '';
        if (!geminiKey) {
            this.toastr.warning('Chưa có Google API Key trong Cài đặt');
            return;
        }

        const isMinerUEnabled = localStorage.getItem('isMinerUEnabled') === 'true';

        if (filename.toLowerCase().endsWith('.pdf')) {
            const electron = (window as any).electron;
            if (electron) {
                this.isIndexing = true;
                this.indexingFilename = filename;
                this.progressPercent = 10;
                this.progressStatus = 'Đang kiểm tra dữ liệu...';
                this.cd.markForCheck();

                const dType = doc_type === 'None' ? 'default' : doc_type;
                const backendUrl = this.config?.settings?.chatbot || 'https://bot.type.vn';
                const filenameWithoutExt = filename.replace(/\.pdf$/i, '');
                const jsonUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filenameWithoutExt)}.mineru.json`;

                try {
                    const checkRes = await fetch(jsonUrl, { method: 'HEAD' });
                    if (!checkRes.ok) {
                        this.progressStatus = 'Đang tải PDF từ Server...';
                        this.progressPercent = 30;
                        this.cd.markForCheck();

                        const pdfUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filename)}`;
                        const tempPdfPath = await electron.invoke('download-temp-pdf', pdfUrl);

                        this.progressStatus = isMinerUEnabled ? 'Đang chuẩn bị phân tích bằng MinerU...' : 'Đang chuẩn bị phân tích bằng OpenAI (Local)...';
                        this.progressPercent = 50;
                        this.cd.markForCheck();

                        const cleanup = electron.onPdfProgress((data: string) => {
                            this.progressStatus = data;
                            this.cd.markForCheck();
                        });

                        try {
                            const ipcMethod = isMinerUEnabled ? 'run-pdf-analysis' : 'run-pdf-analysis-openai';
                            let configData = undefined;
                            if (!isMinerUEnabled) {
                                try {
                                    const settings = this.multiAccountService.getItem('settings');
                                    if (settings) {
                                        configData = {
                                            url: settings.umodelverseUrl || '',
                                            key: settings.umodelverseKey || ''
                                        };
                                    }
                                } catch (e) {}
                            }

                            const result = await electron.invoke(ipcMethod, tempPdfPath, configData);
                            this.progressStatus = 'Đang lưu kết quả AI lên Server...';
                            this.progressPercent = 90;
                            this.cd.markForCheck();

                            await new Promise((resolve, reject) => {
                                this._chatbotService.uploadMinerUResult({
                                    username: this.user.name,
                                    filename: filename,
                                    doc_type: doc_type,
                                    content_json: result
                                }).subscribe({
                                    next: (res) => {
                                        if (res && res.success) resolve(res);
                                        else reject('Tải kết quả lên Server thất bại');
                                    },
                                    error: reject
                                });
                            });
                        } finally {
                            cleanup();
                        }
                    } else {
                        this.progressStatus = 'Đã có dữ liệu AI...';
                        this.progressPercent = 95;
                        this.cd.markForCheck();
                    }

                    this.triggerNormalReindex(doc_type, filename);
                    return;
                } catch (err: any) {
                    this.stopProgressPolling();
                    this.toastr.error('Lỗi phân tích tài liệu AI: ' + (err.message || err));
                    return;
                }
            }
        }

        this.triggerNormalReindex(doc_type, filename);
    }

    triggerNormalReindex(doc_type: string, filename: string): void {
        const secretKeys = this.settings?.secretKey ? this.settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];
        const geminiKey = secretKeys.length > 0 ? secretKeys[Math.floor(Math.random() * secretKeys.length)] : '';

        const payload = {
            username: this.user.name,
            doc_type: doc_type === 'None' ? null : doc_type,
            filename: filename,
            index_dir: `faiss_pdf_index`,
            enable_ocr: false,
            google_api_key: geminiKey,
            llm_model: "gemini-3.6-flash",
        };

        this.indexingFilename = filename;

        this._chatbotService.reindexSpecificFile(payload).subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.toastr.info(`Đang tiến hành học file: ${filename}`);
                    this.startProgressPolling();
                } else {
                    this.toastr.error(res.message || 'Lỗi gửi yêu cầu');
                    this.stopProgressPolling();
                }
            },
            error: () => {
                this.toastr.error('Lỗi kết nối đến máy chủ.');
                this.stopProgressPolling();
            }
        });
    }

    startProgressPolling(): void {
        if (this.indexingSubscription && !this.indexingSubscription.closed) return;

        this.isIndexing = true;
        this.progressPercent = 0;
        this.progressStatus = 'Đang khởi tạo AI...';

        this.indexingSubscription = interval(2000).pipe(
            switchMap(() => this._chatbotService.getIndexProgress({ username: this.user.name })),
            catchError(() => of({ is_running: false, percent: 100, status: 'Lỗi lấy tiến độ' })),
            takeWhile((resp: any) => resp.is_running, true)
        ).subscribe({
            next: (resp: any) => {
                if (resp.is_running) {
                    this.progressPercent = resp.percent || 0;
                    this.progressStatus = `${resp.status} (${resp.current || 0}/${resp.total || 0})`;
                    this.cd.markForCheck();
                } else if (this.isIndexing) {
                    this.handleIndexingComplete();
                }
            },
            error: () => this.stopProgressPolling()
        });
    }

    handleIndexingComplete(): void {
        this.progressPercent = 100;
        this.progressStatus = '✅ Hoàn tất học tài liệu!';
        this.toastr.success('Học tài liệu hoàn tất!');

        const idx = this.fileRows.findIndex(r => r.filename === this.indexingFilename);
        if (idx > -1) {
            this.fileRows[idx] = { ...this.fileRows[idx], is_indexed: true };
            this.applyFileFilter();
        }

        this.loadFileRows();
        setTimeout(() => this.stopProgressPolling(), 2000);
    }

    stopProgressPolling(): void {
        this.isIndexing = false;
        this.progressPercent = 0;
        this.indexingFilename = null;
        if (this.indexingSubscription) {
            this.indexingSubscription.unsubscribe();
            this.indexingSubscription = null;
        }
        this.cd.markForCheck();
    }

    indexAll(): void {
        const secretKeys = this.settings?.secretKey ? this.settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];
        const geminiKey = secretKeys.length > 0 ? secretKeys[Math.floor(Math.random() * secretKeys.length)] : '';

        if (!geminiKey) {
            this.toastr.warning('Chưa có Google API Key trong Cài đặt');
            return;
        }

        const payload = {
            username: this.user.name,
            google_api_key: geminiKey,
            llm_model: "gemini-3.6-flash",
            index_dir: `faiss_pdf_index`
        };

        this._chatbotService.indexFiles(payload).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                if (res && res.success) {
                    this.toastr.info('Đang tiến hành học tất cả tài liệu...');
                    this.indexingFilename = null;
                    this.startProgressPolling();
                } else {
                    this.toastr.error('Khởi tạo học tài liệu thất bại.');
                }
            },
            error: () => {
                this.toastr.error('Lỗi kết nối đến máy chủ.');
            }
        });
    }

    downloadPdf(doc_type: string, filename: string): void {
        const dType = (!doc_type || doc_type === 'None') ? 'default' : doc_type;
        const backendUrl = this.config?.settings?.chatbot || 'https://bot.type.vn';

        let downloadFilename = filename;
        let fileUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filename)}`;

        if (filename.toLowerCase().endsWith('.pdf')) {
            const filenameWithoutExt = filename.replace(/\.pdf$/i, '');
            downloadFilename = `${filenameWithoutExt}.mineru.json`;
            fileUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filenameWithoutExt)}.mineru.json`;
        }

        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    deletePdf(doc_type: string, filename: string, rowIndex?: number): void {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa tài liệu',
            message: `Bạn có chắc chắn muốn xóa file <strong>${filename}</strong> không?`,
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
                this._chatbotService.deleteFile({
                    username: this.user.name,
                    doc_type: doc_type,
                    filename: filename
                }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                    next: (res) => {
                        if (res && res.ok) {
                            this.fileRows = this.fileRows.filter(r => r.filename !== filename);
                            this.applyFileFilter();
                            this.toastr.success('Xóa file thành công: ' + filename);
                        } else {
                            this.toastr.error('Xóa file thất bại.');
                        }
                    },
                    error: () => {
                        this.toastr.error('Xóa file thất bại.');
                    }
                });
            }
        });
    }

    sendQuickPrompt(promptText: string): void {
        this.chatbotMessage.patchValue({ chatgpt: promptText });
        this.sendMessage();
    }

    onEnterSendMessage(event: any): void {
        if (!event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    async onChatFileSelected(event: any): Promise<void> {
        const file: File = event.target.files?.[0];
        if (!file) return;

        let filePath = (file as any).path;
        if ((window as any).electron && (window as any).electron.getPathForFile) {
            try {
                filePath = (window as any).electron.getPathForFile(file);
            } catch (err) {
                console.error('[Upload File] Lỗi getPathForFile:', err);
            }
        }

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            this.attachedFile = {
                name: file.name,
                type: file.type,
                path: filePath,
                base64: base64,
                file: file
            };
            this.toastr.success(`Đã đính kèm tệp: ${file.name}`);
            this.cd.markForCheck();
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    }

    removeAttachedFile(): void {
        this.attachedFile = null;
        this.cd.markForCheck();
    }

    clearChat(): void {
        this.messages = [];
        this.currentMessages = [];
        const chat = document.getElementById('chat');
        if (chat) chat.innerHTML = '';
        this.toastr.info('Đã xóa nội dung hiển thị trò chuyện');
    }

    listFiles() {
        this.loadFileRows();
    }

    // Lưu trạng thái hiện tại vào localStorage
    saveProcessState() {
        const state = {
            statusIndex: this.statusIndex,
            failedUrls: this.failedUrls,
            retryCount: this.retryCount
        };
        localStorage.setItem('chatbot_crawl_state', JSON.stringify(state));
    }

    // Xóa trạng thái khi đã quét xong toàn bộ
    clearProcessState() {
        localStorage.removeItem('chatbot_crawl_state');
    }

    checkResumeState() {
        const savedState = localStorage.getItem('chatbot_crawl_state');
        if (savedState) {
            const state = JSON.parse(savedState);

            // Kiểm tra xem thực sự có URL nào đang chờ quét hoặc đang lỗi không
            if (state.statusIndex && (state.statusIndex.urls.length > 0 || state.failedUrls?.length > 0)) {
                const dialogRef = this._fuseConfirmationService.open({
                    title: 'Phát hiện tiến trình dang dở!',
                    message: `Bạn có một tiến trình quét domain ${state.statusIndex.domain} chưa hoàn thành (${state.statusIndex.completed}/${state.statusIndex.total} link). Bạn có muốn chạy tiếp không?`,
                    icon: { show: true, name: 'heroicons_outline:clock', color: 'info' },
                    actions: {
                        confirm: { show: true, label: 'Tiếp tục quét', color: 'primary' },
                        cancel: { show: true, label: 'Hủy bỏ' }
                    },
                    dismissible: false
                });

                dialogRef.afterClosed().subscribe((result) => {
                    if (result === 'confirmed') {
                        // Phục hồi dữ liệu từ localStorage
                        this.statusIndex = state.statusIndex;
                        this.failedUrls = state.failedUrls || [];
                        this.retryCount = state.retryCount || 0;

                        this.toastr.info('Đang tiếp tục tiến trình quét...');
                        this.turnOnCrawlWebsite(this.statusIndex.domain);
                    } else {
                        // Người dùng chọn Hủy -> Xóa state rác
                        this.clearProcessState();
                    }
                });
            } else {
                this.clearProcessState();
            }
        }
    }

    indexDomains() {
        if (this.statusIndex.status === 'running') {
            this.toastr.warning('Quá trình cập nhật đang diễn ra.');
            return;
        }

        const dialogRef = this.dialog.open(IndexDomainsDialogComponent, {
            width: '500px',
            height: 'auto',
            data: {
                domainOptions: this.domainOptions,
                selectedDomain: this.selectedDomain
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.selectedDomain = result.selectedDomain;
                this.sitemapsText = result.sitemapsText;
                this.confirmIndexDomains();
            }
        });
    }

    confirmIndexDomains() {
        const domain = (this.selectedDomain || '').trim();

        if (!domain) {
            this.toastr.warning('Vui lòng chọn domain.');
            return;
        }

        this.statusIndex.domain = domain;

        // parse textarea: mỗi dòng 1 link, bỏ dòng trống
        const sitemaps = (this.sitemapsText || '')
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);

        if (sitemaps.length === 0) {
            this.toastr.warning('Vui lòng nhập ít nhất 1 link sitemap (mỗi dòng 1 link).');
            return;
        }

        const payload = {
            username: this.user?.name,
            domains: [domain],
            sitemaps,
        };

        this._chatbotService.indexDomains(payload)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    if (result && result.success) {
                        Object.entries(result.data).forEach(([key, urls]) => {
                            if (domain.indexOf(key) >= 0) {
                                this.statusIndex.urls = urls as string[]; // Ép kiểu để an toàn
                            }
                        });

                        // --- THÊM PHẦN KHỞI TẠO TRẠNG THÁI Ở ĐÂY ---
                        this.statusIndex.total = this.statusIndex.urls.length;
                        this.statusIndex.completed = 0;
                        this.statusIndex.failed = 0;
                        this.statusIndex.retrying = false;
                        this.statusIndex.retryTurn = 0;
                        this.failedUrls = [];
                        this.retryCount = 0;
                        // ------------------------------------------

                        this.saveProcessState();
                        this.turnOnCrawlWebsite(domain);

                        this.toastr.success('Đang cập nhật chatbot của bạn.');
                    } else {
                        this.toastr.error('Lỗi trong quá trình cập nhật.');
                    }
                },
                error: (err: any) => {
                    this.toastr.error('Lỗi trong quá trình cập nhật.');
                }
            });
    }

    turnOnCrawlWebsite(domain: string) {
        if (this.statusIndex.urls.length > 0) {
            this.statusIndex.status = 'running';
            let url = this.statusIndex.urls[0];

            if (url !== domain && url !== `${domain}/`) {
                this.getContentUrl(url, domain);
            } else {
                this.statusIndex.urls.splice(0, 1);
                this.turnOnCrawlWebsite(domain);
            }
        }
        // --- THÊM LOGIC KIỂM TRA QUÉT LẠI (RETRY) ---
        else if (this.failedUrls.length > 0 && this.retryCount < this.maxRetries) {
            this.retryCount++;
            this.statusIndex.retrying = true;
            this.statusIndex.retryTurn = this.retryCount;
            this.statusIndex.status = 'retrying';

            this.toastr.info(`Đang thử lại lần ${this.retryCount} cho ${this.failedUrls.length} URL lỗi...`);

            // Đổ các URL lỗi vào lại mảng chính để quét, sau đó làm rỗng mảng lỗi
            this.statusIndex.urls = [...this.failedUrls];
            this.failedUrls = [];
            this.saveProcessState(); // <--- CHÈN VÀO ĐÂY

            // Nghỉ 2 giây trước khi chạy lại
            setTimeout(() => {
                this.turnOnCrawlWebsite(domain);
            }, 2000);
        }
        // -------------------------------------------
        else {
            // Khi đã hết hoàn toàn danh sách hoặc chạm trần số lần retry
            this.statusIndex.failed = this.failedUrls.length;
            this.triggerIndexDomain(domain);
        }
    }

    getContentUrl(url: string, domain: string) {
        this._logService.read({
            url: url,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success && result.data && result.data.title && result.data.textContent) {
                        this.saveContentUrl(url, domain, result.data);
                    } else {
                        // NẾU LỖI LOGIC: Lưu URL vào danh sách failedUrls
                        this.failedUrls.push(url);
                        this.statusIndex.failed = this.failedUrls.length;

                        this.statusIndex.urls.splice(0, 1);
                        this.saveProcessState(); // <--- CHÈN VÀO ĐÂY
                        this.turnOnCrawlWebsite(domain);
                    }
                },
                error: () => {
                    // NẾU LỖI SERVER (500, 404...): Lưu URL vào danh sách failedUrls
                    this.failedUrls.push(url);
                    this.statusIndex.failed = this.failedUrls.length;

                    this.statusIndex.urls.splice(0, 1);
                    this.saveProcessState(); // <--- CHÈN VÀO ĐÂY
                    this.turnOnCrawlWebsite(domain);
                },
                complete: () => { }
            });
    }

    saveContentUrl(url: string, domain: string, data: any) {
        this._chatbotService.saveContentUrl({
            "username": this.user.name,
            "domain": domain,
            "url": url,
            "data": data
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (result) {
                        this.toastr.success(`Lưu thành công "${data.title}"`);

                        this.statusIndex.completed++; // <--- THÊM DÒNG NÀY ĐỂ TĂNG SỐ LƯỢNG THÀNH CÔNG

                        this.statusIndex.urls.splice(0, 1);
                        this.saveProcessState(); // <--- CHÈN VÀO ĐÂY
                        this.turnOnCrawlWebsite(domain);
                    }
                },
                error: (err: any) => {
                    // Nếu lỗi khi lưu DB, cũng đẩy ngược vào failedUrls
                    this.failedUrls.push(url);
                    this.statusIndex.failed = this.failedUrls.length;

                    this.statusIndex.urls.splice(0, 1);
                    this.saveProcessState(); // <--- CHÈN VÀO ĐÂY
                    this.turnOnCrawlWebsite(domain);

                    this.toastr.error('Lưu không thành công.');
                }
            });
    }

    triggerIndexDomain(domain: string) {
        this._chatbotService.triggerIndexDomain({
            username: this.user.name,
            domain: domain
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (_) => {
                    this.statusIndex.status = 'done';
                    this.clearProcessState(); // <--- XÓA TRẠNG THÁI
                    this.toastr.success(`Kết thúc cập nhật!`);
                },
                error: (err: any) => {
                    this.statusIndex.status = 'error';
                    this.clearProcessState(); // <--- XÓA TRẠNG THÁI
                    this.toastr.error('Kết thúc cập nhật.');
                }
            });
    }

    private loadChatbotSettings(): void {
        this._chatbotService.loadChatbotSettings({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (cfg: any) => {
                    if (cfg?.data_source) this.selectedDataSource = cfg.data_source;
                    this.selectedDocTypes = Array.isArray(cfg?.doc_types) ? cfg.doc_types : [];
                    this.selectedSettingsDomains = Array.isArray(cfg?.domains) ? cfg.domains : [];

                    // ✅ NEW: Load custom prompt từ settings
                    this.customPrompt = cfg?.custom_prompt || '';

                    this.cd.markForCheck();
                },
                error: (err: any) => {
                    // fallback mặc định
                    this.selectedDataSource = 'documents';
                    this.selectedDocTypes = [];
                    this.selectedSettingsDomains = [];
                    this.customPrompt = '';
                    this.cd.markForCheck();
                }
            });
    }

    confirmChatbotSettings(): void {
        if (!this.selectedDataSource) {
            this.toastr.warning('Vui lòng chọn nguồn dữ liệu');
            return;
        }

        // Validate: nếu chọn Documents/All thì phải có ít nhất 1 loại doc
        if ((this.selectedDataSource === 'documents' || this.selectedDataSource === 'all') && (!this.selectedDocTypes || this.selectedDocTypes.length === 0)) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 loại tài liệu (docTypes)');
            return;
        }

        // Validate: nếu chọn Website/All thì phải có ít nhất 1 domain
        if ((this.selectedDataSource === 'website' || this.selectedDataSource === 'all') && (!this.selectedSettingsDomains || this.selectedSettingsDomains.length === 0)) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 Website');
            return;
        }

        this._chatbotService.confirmChatbotSettings({
            username: this.user.name,
            data_source: this.selectedDataSource,
            doc_types: this.selectedDocTypes,
            domains: this.selectedSettingsDomains,
            custom_prompt: this.customPrompt // ✅ Gửi prompt lên backend
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (cfg: any) => {
                    if (cfg?.data_source) this.selectedDataSource = cfg.data_source;
                    this.selectedDocTypes = Array.isArray(cfg?.doc_types) ? cfg.doc_types : [];
                    this.selectedSettingsDomains = Array.isArray(cfg?.domains) ? cfg.domains : [];
                    this.customPrompt = cfg?.custom_prompt || ''; // update lại biến

                    this.toastr.success('Lưu cấu hình thành công!');
                    this.cd.markForCheck();
                },
                error: (err: any) => {
                    this.toastr.error('Lưu cấu hình thất bại');
                    // fallback mặc định nếu lỗi
                    this.selectedDataSource = 'documents';
                    this.selectedDocTypes = [];
                    this.cd.markForCheck();
                }
            });
    }

    toggleDocType(dt: string): void {
        const idx = this.selectedDocTypes.indexOf(dt);
        if (idx >= 0) this.selectedDocTypes.splice(idx, 1);
        else this.selectedDocTypes.push(dt);
        this.selectedDocTypes = [...this.selectedDocTypes];
        this.cd.markForCheck();
    }

    // ✅ NEW: Hàm toggle cho Domain checkbox trong settings
    toggleSettingsDomain(domain: string): void {
        const idx = this.selectedSettingsDomains.indexOf(domain);
        if (idx >= 0) this.selectedSettingsDomains.splice(idx, 1);
        else this.selectedSettingsDomains.push(domain);
        this.selectedSettingsDomains = [...this.selectedSettingsDomains];
        this.cd.markForCheck();
    }

    settingChatbot() {
        // Load lại settings mới nhất mỗi khi mở popup
        this.loadChatbotSettings();

        // Wait for config to load or just open with what we have
        // Actually better to open the dialog inside the loadChatbotSettings or just pass current state
        const dialogRef = this.dialog.open(SettingChatbotDialogComponent, {
            width: '560px',
            panelClass: 'dlg-primary',
            data: {
                selectedDataSource: this.selectedDataSource,
                docTypes: this.docTypes,
                selectedDocTypes: this.selectedDocTypes,
                domainOptions: this.domainOptions,
                selectedSettingsDomains: this.selectedSettingsDomains,
                customPrompt: this.customPrompt
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.selectedDataSource = result.selectedDataSource;
                this.selectedDocTypes = result.selectedDocTypes;
                this.selectedSettingsDomains = result.selectedSettingsDomains;
                this.customPrompt = result.customPrompt;
                this.confirmChatbotSettings();
            }
        });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _chatbotService: ChatbotService,
        private _domainService: DomainService,
        private _logService: LogService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private _formBuilder: UntypedFormBuilder,
        public dialog: MatDialog,
        private help: HelperService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private router: Router,
        private multiAccountService: MultiAccountService,
        private taskProgress: TaskProgressService
    ) {
        this.titleService.setTitle(`hỏi chatgpt | ai.type - công cụ tạo content`);
    }

    ngOnInit(): void {
        this.settings = this.multiAccountService.getItem('settings');
        this.currentDocType = localStorage.getItem('last_doc_type');

        this.chatbotMessage = this._formBuilder.group({
            chatgpt: ['']
        });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;



                this.initDB();
                this.alldomains();
                this.loadChatbotSettings();
                this.loadFileRows();
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: (message) ? message : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại'
                }
            },
            dismissible: false
        });

        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}