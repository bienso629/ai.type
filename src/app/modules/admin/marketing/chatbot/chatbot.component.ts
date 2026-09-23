import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
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
import { GenaiService } from 'app/genai.service';

@Component({
    selector: 'chatbot',
    templateUrl: './chatbot.component.html',
    providers: [ChatbotService, DomainService, LogService],
    styleUrls: ['./chatbot.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
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
    selectedFolderPath: string = '';
    fileTableRowHeight: number = 58;

    // Quản lý Chọn nhiều & Học lần lượt (Chuẩn ngx-datatable Selection)
    selected: any[] = [];
    isBatchLearning: boolean = false;
    batchCurrentIndex: number = 0;
    batchTotalCount: number = 0;
    batchCurrentFile: string = '';
    isBatchCancelled: boolean = false;

    // Colab GPU Agent Support
    isColabConnected: boolean = false;
    isColabPluginActive: boolean = false;
    isColabConnecting: boolean = false;

    async checkColabStatus(): Promise<void> {
        try {
            let connected = false;
            let pluginActive = false;
            if ((window as any).electronAPI && (window as any).electronAPI.checkColabGpuStatus) {
                const res = await (window as any).electronAPI.checkColabGpuStatus();
                connected = !!(res && res.is_connected);
                pluginActive = !!(res && res.plugin_active);
            } else {
                const resp = await fetch('http://127.0.0.1:7868/status', { signal: AbortSignal.timeout(1500) });
                if (resp.ok) {
                    const data = await resp.json();
                    connected = !!(data && data.is_connected);
                    pluginActive = true;
                    if (data && data.colab_url) {
                        localStorage.setItem('colabMcpUrl', data.colab_url);
                        localStorage.setItem('isColabMcpEnabled', 'true');
                    }
                }
            }
            this.isColabPluginActive = pluginActive;
            this.isColabConnected = connected;
        } catch (e) {
            this.isColabPluginActive = false;
            this.isColabConnected = false;
        } finally {
            this.cd.markForCheck();
        }
    }

    async toggleColabGpu(enable: boolean): Promise<void> {
        if (this.isColabConnecting) return;
        this.isColabConnecting = true;
        this.cd.markForCheck();

        try {
            if (enable) {
                this.toastr.info('Đang kết nối & khởi chạy GPU Tesla T4 trên Colab...', 'Colab GPU');
                if ((window as any).electronAPI && (window as any).electronAPI.startColabGpu) {
                    const res = await (window as any).electronAPI.startColabGpu();
                    if (res && res.success) {
                        this.toastr.success(res.message || `Đã kết nối GPU Colab (${res.gpu || 'Tesla T4'}) thành công!`, 'Colab GPU');
                        if (res.url) {
                            localStorage.setItem('colabMcpUrl', res.url);
                            localStorage.setItem('isColabMcpEnabled', 'true');
                        }
                    } else {
                        this.toastr.error(res?.error || 'Không thể khởi tạo GPU Colab. Vui lòng kiểm tra tab Plugins trong Cài đặt.', 'Colab GPU');
                    }
                } else {
                    const resp = await fetch('http://127.0.0.1:7868/start_gpu', { method: 'POST', signal: AbortSignal.timeout(30000) });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.success) {
                            this.toastr.success('Đã kết nối GPU Colab thành công!', 'Colab GPU');
                            if (data.url) {
                                localStorage.setItem('colabMcpUrl', data.url);
                                localStorage.setItem('isColabMcpEnabled', 'true');
                            }
                        } else {
                            this.toastr.error(data.error || 'Lỗi khởi chạy GPU Colab.', 'Colab GPU');
                        }
                    }
                }
            } else {
                this.toastr.info('Đang ngắt kết nối và tắt máy ảo Colab GPU...', 'Colab GPU');
                if ((window as any).electronAPI && (window as any).electronAPI.stopColabGpu) {
                    const res = await (window as any).electronAPI.stopColabGpu();
                    if (res && res.success) {
                        this.toastr.success(res.message || 'Đã tắt máy ảo Colab GPU thành công.', 'Colab GPU');
                    }
                } else {
                    await fetch('http://127.0.0.1:7868/stop_gpu', { method: 'POST', signal: AbortSignal.timeout(3000) });
                    this.toastr.success('Đã gửi yêu cầu tắt máy ảo Colab GPU.', 'Colab GPU');
                }
            }
        } catch (e: any) {
            this.toastr.error('Lỗi thao tác Colab GPU: ' + (e?.message || e), 'Colab GPU');
        } finally {
            this.isColabConnecting = false;
            await this.checkColabStatus();
            this.cd.markForCheck();
        }
    }

    Math = Math;

    onSelect({ selected }: { selected: any[] }): void {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
        this.cd.markForCheck();
    }

    async learnSelectedDocuments(): Promise<void> {
        const selectedList = this.selected && this.selected.length > 0 ? [...this.selected] : [];
        if (!selectedList.length) {
            this.toastr.warning('Vui lòng chọn ít nhất 1 tài liệu để học.');
            return;
        }

        this.isBatchLearning = true;
        this.isBatchCancelled = false;
        this.batchTotalCount = selectedList.length;
        this.batchCurrentIndex = 0;
        this.cd.markForCheck();

        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < selectedList.length; i++) {
            if (this.isBatchCancelled) {
                this.toastr.info('Đã dừng tiến trình học hàng loạt.');
                break;
            }

            const row = selectedList[i];
            this.batchCurrentIndex = i + 1;
            this.batchCurrentFile = row.filename;
            this.cd.markForCheck();

            const docType = (row.doc_type && row.doc_type !== 'None') ? row.doc_type : 'qa_detailed';
            try {
                await this.reIndexPdf(docType, row.filename);
                row.is_indexed = true;
                successCount++;
            } catch (err: any) {
                console.error(`[Batch Learn] Lỗi học ${row.filename}:`, err);
                failedCount++;
            }
        }

        this.isBatchLearning = false;
        this.batchCurrentFile = '';
        this.isIndexing = false;
        this.indexingFilename = '';

        if (!this.isBatchCancelled) {
            if (failedCount === 0) {
                this.toastr.success(`Đã hoàn tất học thành công toàn bộ ${successCount} tài liệu đã chọn!`);
            } else {
                this.toastr.info(`Đã hoàn tất: ${successCount} tài liệu thành công, ${failedCount} tài liệu gặp lỗi.`);
            }
        }
        this.cd.markForCheck();
    }

    cancelBatchLearning(): void {
        this.isBatchCancelled = true;
        this.isBatchLearning = false;
        this.isIndexing = false;
        this.indexingFilename = '';
        this.toastr.info('Đã gửi lệnh dừng học hàng loạt.');
        this.cd.markForCheck();
    }

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
    selectedDocType: string | null = 'qa_detailed';

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
    @ViewChild('chatInput') chatInputRef: ElementRef<HTMLInputElement>;
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
                const isValidAvatar = this.user?.avatar && 
                    !this.user.avatar.includes('type.vnnull') && 
                    !this.user.avatar.endsWith('/null') && 
                    !this.user.avatar.endsWith('/undefined') && 
                    this.user.avatar !== 'https://type.vn' && 
                    this.user.avatar !== 'https://type.vn/';

                if (isValidAvatar) {
                    const image = document.createElement('img');
                    image.src = this.user.avatar;
                    image.alt = this.user?.name ?? 'User';
                    image.className = 'w-full h-full rounded-full object-cover';
                    image.crossOrigin = 'anonymous';
                    image.onerror = () => {
                        image.remove();
                        avatar.style.backgroundColor = '#9333ea';
                        avatar.textContent = (this.user?.name || currentName || 'U').charAt(0).toUpperCase();
                    };
                    avatar.appendChild(image);
                } else {
                    avatar.style.backgroundColor = '#9333ea';
                    avatar.textContent = (this.user?.name || currentName || 'U').charAt(0).toUpperCase();
                }
            } else {
                avatar.className = 'avatar bg-white';
                const botImg = document.createElement('img');
                botImg.src = 'assets/images/logo/web.png';
                botImg.alt = 'AI';
                botImg.className = 'w-full h-full object-cover rounded-full';
                avatar.appendChild(botImg);
            }

            const bubble = document.createElement('div');
            bubble.className = `bubble px-6 py-4 leading-6 text-base ${m[2] === 'user' ? 'user' : 'bot'}`;

            // ✅ Parse + sanitize rồi gán innerHTML (không dùng textContent)
            const md = (m[3] ?? '').toString();
            if (m[2] === 'bot' && (!md || md === 'Đang phân tích...')) {
                bubble.innerHTML = `<div class="flex items-center gap-2.5 text-gray-500 dark:text-gray-400">
                    <span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                    <span class="text-base font-medium">Đang suy nghĩ & trả lời...</span>
                </div>`;
            } else {
                const html = marked.parse(md) as string;
                const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
                bubble.innerHTML = clean;
            }

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
                if (this.chatInputRef?.nativeElement) {
                    this.chatInputRef.nativeElement.value = promptText;
                    this.chatInputRef.nativeElement.focus();
                } else {
                    const inputEl = document.querySelector('#chat-container ~ div input[type="text"]') as HTMLInputElement;
                    if (inputEl) {
                        inputEl.value = promptText;
                        inputEl.focus();
                    }
                }
            });
            // 4. Nút PDF (chỉ hiển thị cho câu trả lời của Bot)
            if (m[2] !== 'user') {
                const pdfBtn = document.createElement('button');
                pdfBtn.type = 'button';
                pdfBtn.className = 'flex items-center hover:text-red-600 dark:hover:text-red-400 transition-colors p-0.5 rounded cursor-pointer';
                pdfBtn.title = 'Xuất câu trả lời ra PDF';
                pdfBtn.innerHTML = `<svg class="w-3.5 h-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><span class="text-[11px]">PDF</span>`;
                pdfBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const answerText = (m[3] ?? '').toString();
                    let questionText = '';
                    const msgIdx = messages.indexOf(m);
                    if (msgIdx > 0 && messages[msgIdx - 1]?.[2] === 'user') {
                        questionText = (messages[msgIdx - 1][3] ?? '').toString();
                    }
                    this.exportToPdf(answerText, questionText);
                });
                footer.appendChild(pdfBtn);
            }

            bubbleWrap.appendChild(footer);
            message.appendChild(avatar);
            message.appendChild(bubbleWrap);
            wrapper.appendChild(message);
            chat.appendChild(wrapper);
        });

        this.currentMessages = messages;
        this.cd.markForCheck();
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            setTimeout(() => {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 50);
        }
    }

    async exportToPdf(answerText: string, questionText?: string): Promise<void> {
        if (!answerText || answerText === 'Đang phân tích...' || answerText === 'Đang suy nghĩ & trả lời...') {
            this.toastr.warning('Nội dung câu trả lời chưa sẵn sàng để xuất PDF!');
            return;
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

            // 1. Khối câu hỏi (hiển thị dưới dạng khung viền xanh chuyên nghiệp, không truyền background CSS inline làm lỗi bôi nền văn bản)
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

            // 2. Khối câu trả lời (Markdown chuyển đổi chuẩn, loại bỏ khoảng trắng thừa)
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

            // Tiêu đề và tên file
            const rawTitle = questionText && questionText.trim()
                ? questionText.trim().slice(0, 40)
                : 'Cau_Tra_Loi_AI';
            const safeFileName = rawTitle.replace(/[/\\?%*:|"<> \n\r\t]/g, '_').trim() || 'Cau_Tra_Loi_AI';
            const currentDateStr = new Date().toLocaleDateString('vi-VN');

            const docDefinition = {
                header: (currentPage: number, pageCount: number) => {
                    return {
                        columns: [
                            { text: 'ai.type - Trợ lý AI & Hỏi đáp tài liệu', alignment: 'left', fontSize: 8, color: '#64748b' },
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

    appendTyping() {
        const chat = document.getElementById('chat');
        if (!chat) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'message-row';

        const message = document.createElement('div');
        message.className = 'message';

        const avatar = document.createElement('div');
        avatar.className = 'avatar bg-white';
        const botImg = document.createElement('img');
        botImg.src = 'assets/images/logo/web.png';
        botImg.alt = 'AI';
        botImg.className = 'w-full h-full object-cover rounded-full';
        avatar.appendChild(botImg);

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

    async loadThreads(): Promise<void> {
        const electron = (window as any).electron;
        let localThreads: any[] = [];
        if (electron && electron.invoke) {
            try {
                const res = await electron.invoke('list-local-chatbot-threads', this.user?.name || 'admin');
                if (res?.success && res.threads) {
                    localThreads = res.threads;
                }
            } catch (e) {}

            // Trong môi trường Desktop: Ưu tiên tuyệt đối danh sách local trên máy
            this.threadList = localThreads.map(t => [t.id, t.title, t.title, t.updated_at || '', t.phone || null]);
            this.rebuildThreadRows();
            this.calcThreadTableHeight();
            if (!this.currentThread && this.threadList.length > 0) {
                this.selectThread(this.threadList[0][0]);
            }
            this.cd.markForCheck();
            return;
        }

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

    deleteThread(threadId: any, event?: MouseEvent): void {
        if (event) event.stopPropagation();

        const threadItem = (this.threadRows || []).find(t => String(t.id) === String(threadId));
        const threadName = threadItem?.name || threadItem?.title || ('Hộp thoại #' + threadId);

        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa cuộc trò chuyện',
            message: `Bạn có chắc chắn muốn xóa cuộc trò chuyện <strong>${threadName}</strong> không?`,
            icon: {
                show: true,
                name: 'heroicons_outline:trash',
                color: 'error'
            },
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

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                const electron = (window as any).electron;
                if (electron && electron.invoke) {
                    try {
                        await electron.invoke('delete-local-chatbot-thread', {
                            username: this.user?.name || 'admin',
                            threadId: threadId
                        });
                    } catch (e) {}
                }

                this.threadList = (this.threadList || []).filter(t => String(t?.[0]) !== String(threadId));
                this.rebuildThreadRows();
                if (String(this.currentThread) === String(threadId)) {
                    this.currentThread = null;
                    this.currentMessages = [];
                    this.messages = [];
                    const chat = document.getElementById('chat');
                    if (chat) chat.innerHTML = '';
                    if (this.threadList.length > 0) {
                        this.selectThread(this.threadList[0][0]);
                    }
                }
                this.toastr.success('Đã xóa hộp thoại');
                this.cd.markForCheck();
            }
        });
    }

    clearAllThreads(): void {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa tất cả cuộc trò chuyện',
            message: 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử các cuộc trò chuyện không? Thao tác này không thể hoàn tác.',
            icon: {
                show: true,
                name: 'heroicons_outline:trash',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa tất cả',
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: 'Hủy'
                }
            }
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                const electron = (window as any).electron;
                if (electron && electron.invoke) {
                    try {
                        await electron.invoke('clear-all-local-chatbot-threads', this.user?.name || 'admin');
                    } catch (e) {}
                }
                this.threadList = [];
                this.rebuildThreadRows();
                this.currentThread = null;
                this.currentMessages = [];
                this.messages = [];
                const chat = document.getElementById('chat');
                if (chat) chat.innerHTML = '';
                this.toastr.success('Đã xóa sạch toàn bộ hộp thoại');
                this.cd.markForCheck();
            }
        });
    }

    async selectThread(threadId: number): Promise<void> {
        this.currentThread = threadId;
        this.selectedPanel = `${threadId}`;

        // Kiểm tra và hiển thị ngay lịch sử trò chuyện đã lưu trên máy (0ms)
        const electron = (window as any).electron;
        if (electron && electron.invoke) {
            try {
                const localHist = await electron.invoke('get-local-chatbot-history', {
                    username: this.user?.name || 'admin',
                    threadId: threadId
                });
                if (localHist?.success && localHist?.messages?.length > 0) {
                    this.messages = localHist.messages;
                    this.currentMessages = localHist.messages;
                    this.removeTyping();
                    this.renderMessages(localHist.messages);
                    this.cd.markForCheck();
                    return;
                } else if (localHist?.success) {
                    // Hộp thoại mới tạo hoặc rỗng trên máy
                    this.messages = [];
                    this.currentMessages = [];
                    this.removeTyping();
                    const chat = document.getElementById('chat');
                    if (chat) chat.innerHTML = '';
                    this.cd.markForCheck();
                    return;
                }
            } catch (e) {}
        }

        this._chatbotService.selectThread({
            threadId: threadId,
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (data) => {
                    if (data && data.length > 0) {
                        this.messages = data;
                        this.currentMessages = data;
                        this.removeTyping();
                        this.renderMessages(data);
                        this.cd.markForCheck();
                    } else {
                        this.messages = [];
                        this.currentMessages = [];
                        this.removeTyping();
                        const chat = document.getElementById('chat');
                        if (chat) chat.innerHTML = '';
                        this.cd.markForCheck();
                    }
                },
                error: () => {
                    this.messages = [];
                    this.currentMessages = [];
                    this.removeTyping();
                    const chat = document.getElementById('chat');
                    if (chat) chat.innerHTML = '';
                    this.cd.markForCheck();
                },
                complete: () => {
                }
            });
    }

    async createThread(): Promise<void> {
        const newId = Date.now();
        this.currentThread = newId;
        this.currentMessages = [];
        this.messages = [];
        const chat = document.getElementById('chat');
        if (chat) chat.innerHTML = '';

        const electron = (window as any).electron;
        if (electron && electron.invoke) {
            try {
                await electron.invoke('save-local-chatbot-history', {
                    username: this.user?.name || 'admin',
                    threadId: newId,
                    messages: [],
                    title: 'Hội thoại mới'
                });
            } catch (e) {}
            await this.loadThreads();
        } else {
            try {
                const threadId: any = await new Promise((resolve) => {
                    this._chatbotService.createThread({
                        username: this.user.name,
                        name: 'Hội thoại mới',
                        email: this.user.email,
                        phone: this.help.textToNumber(this.user.name)
                    }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                        next: (id) => resolve(id),
                        error: () => resolve(null),
                        complete: () => {}
                    });
                });
                if (threadId) {
                    this.currentThread = Number(threadId) || threadId;
                }
            } catch (e) {}
            // Chèn ngay vào danh sách threadList phía client nếu chưa có
            const existing = (this.threadList || []).find(t => String(t?.[0]) === String(this.currentThread));
            if (!existing) {
                const dateStr = new Date().toLocaleDateString('vi-VN', {
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                });
                this.threadList = [[this.currentThread, 'Hội thoại mới', 'Hội thoại mới', dateStr, null], ...(this.threadList || [])];
                this.rebuildThreadRows();
                this.calcThreadTableHeight();
            }
        }
        this.toastr.success('Đã tạo cuộc hội thoại mới');
        this.cd.markForCheck();
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

    async sendMessage(explicitText?: string): Promise<void> {
        let msg = (explicitText !== undefined ? explicitText : (this.chatInputRef?.nativeElement?.value || this.inputMessage || '')).trim();
        const attached = this.attachedFile;

        if (!msg && !attached) {
            this.toastr.warning('Vui lòng nhập câu hỏi hoặc đính kèm tệp!');
            return;
        }

        if (!this.currentThread) {
            try {
                const threadId: any = await new Promise((resolve) => {
                    this._chatbotService.createThread({
                        username: this.user.name,
                        name: this.user.name,
                        email: this.user.email,
                        phone: this.help.textToNumber(this.user.name)
                    }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                        next: (id) => resolve(id),
                        error: () => resolve(null),
                        complete: () => {}
                    });
                });
                if (threadId) {
                    this.currentThread = Number(threadId) || threadId;
                    this.loadThreads();
                }
            } catch (e) {}
        }

        if (attached && !msg) {
            msg = `Phân tích tệp đính kèm: ${attached.name}`;
        } else if (attached && msg) {
            msg = `${msg}\n[Tệp đính kèm]: ${attached.name}`;
        }

        if (this.chatInputRef?.nativeElement) {
            this.chatInputRef.nativeElement.value = '';
        }
        this.inputMessage = '';
        if (this.chatbotMessage?.controls['chatgpt']) {
            this.chatbotMessage.controls['chatgpt'].reset();
        }
        this.attachedFile = null;
        this.cd.markForCheck();

        const date = new Date();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // 1. Tạo tin nhắn người dùng
        const userMessage = [this.currentMessages.length + 1, this.currentThread, 'user', msg, null, null, timeStr];

        // Cập nhật tiêu đề hộp thoại ngay lập tức theo câu hỏi đầu tiên của người dùng
        const firstUserQuestion = msg.trim();
        const currentThreadRow = (this.threadRows || []).find(r => String(r.id) === String(this.currentThread));
        if (currentThreadRow && (currentThreadRow.title === 'Hội thoại mới' || !currentThreadRow.title || currentThreadRow.title.startsWith('Hội thoại #'))) {
            currentThreadRow.title = firstUserQuestion;
            currentThreadRow.name = firstUserQuestion;
        }
        const currentThreadItem = (this.threadList || []).find(t => String(t?.[0]) === String(this.currentThread));
        if (currentThreadItem) {
            currentThreadItem[1] = firstUserQuestion;
            currentThreadItem[2] = firstUserQuestion;
        }
        this.rebuildThreadRows();
        this.cd.markForCheck();

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

        // Tự động tìm kiếm ngữ cảnh từ thư mục FAISS cục bộ: Documents/ai.type/data/faiss/{username}
        const electron = (window as any).electron;
        let finalMessage = msg;
        if (electron && electron.invoke) {
            try {
                const localContext = await electron.invoke('get-local-faiss-context', {
                    username: this.user.name,
                    query: msg,
                    maxChunks: 4
                });
                if (localContext?.success && localContext?.context) {
                    console.log('[Chatbot] Đã tìm thấy ngữ cảnh FAISS cục bộ:', localContext.chunksCount, 'đoạn');
                    finalMessage = `${msg}\n\n[DỮ LIỆU TÀI LIỆU LOCAL FAISS TRÍCH XUẤT TỪ DOCUMENTS/AI.TYPE/DATA/FAISS]:\n${localContext.context}`;
                }
            } catch (e) {}
        }

        const payload = {
            thread_id: this.currentThread,
            username: this.user.name,
            message: finalMessage,
            ip_address: "192.168.1.1",
            sender_info: "Chrome on Windows",
            google_api_key: geminiKey,
            llm_model: "gemini-3.6-flash",
            simple_chatbot_data_source: this.selectedDataSource || 'documents',
            index_dir: `faiss_pdf_index`
        };

        // 3. Khởi tạo bộ Render dòng chữ mượt mà 60 FPS (Chống cà giật / giật lag khi stream)
        let targetText = '';
        let displayedText = '';
        let isRendering = true;
        let renderRafId: number = null;

        const updateBubbleDOM = (text: string) => {
            try {
                const html = marked.parse(text) as string;
                bubble.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
                const chatContainer = document.getElementById('chat-container');
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            } catch (e) {}
        };

        const renderLoop = () => {
            if (!isRendering && displayedText.length >= targetText.length) return;

            if (displayedText.length < targetText.length) {
                const diff = targetText.length - displayedText.length;
                const stepSize = diff > 100 ? Math.ceil(diff / 3) : (diff > 30 ? 5 : (diff > 8 ? 2 : 1));
                displayedText = targetText.slice(0, displayedText.length + stepSize);
                updateBubbleDOM(displayedText);
            }
            renderRafId = requestAnimationFrame(renderLoop);
        };

        renderRafId = requestAnimationFrame(renderLoop);

        try {
            console.log('[Chatbot] Đang gửi câu hỏi lên AI Agent (sontinh.type.vn) với dữ liệu FAISS cục bộ...');
            const sysInstruction = `Bạn là Trợ lý AI chuyên nghiệp phân tích và hỏi đáp tài liệu. Hãy trả lời câu hỏi của người dùng một cách mạch lạc, chi tiết, chính xác dựa trên các thông tin tài liệu đã trích xuất bên dưới:`;

            const response = await this._genaiService.generateContent(
                {
                    model: 'gemini-2.0-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: `${msg}\n\n[DỮ LIỆU TÀI LIỆU LOCAL FAISS TRÍCH XUẤT]:\n${finalMessage}` }]
                        }
                    ],
                    config: {
                        systemInstruction: sysInstruction,
                        onStream: (streamText: string, isFinal: boolean) => {
                            if (isFirstChunk) {
                                isFirstChunk = false;
                                bubble.innerHTML = '';
                            }
                            if (isFinal) {
                                targetText = streamText;
                            } else {
                                targetText += streamText;
                            }
                        }
                    } as any
                },
                'chatbot-rag'
            );

            // Kết thúc streaming - chốt nội dung hoàn chỉnh
            isRendering = false;
            if (renderRafId) cancelAnimationFrame(renderRafId);

            let finalReply = '';
            if (response && response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
                finalReply = response.candidates[0].content.parts[0].text;
            } else if (typeof response === 'string') {
                finalReply = response;
            } else if (targetText) {
                finalReply = targetText;
            }

            if (finalReply) {
                updateBubbleDOM(finalReply);
                botMessage[3] = finalReply;
                this.renderMessages(this.currentMessages);

                // Lưu lại toàn bộ nội dung câu hỏi & câu trả lời vào thư mục máy tính cục bộ
                const electron = (window as any).electron;
                if (electron && electron.invoke) {
                    try {
                        const firstQuestion = (this.currentMessages || []).find(m => m[2] === 'user')?.[3] || msg;
                        const titlePreview = firstQuestion ? (firstQuestion.slice(0, 50) + (firstQuestion.length > 50 ? '...' : '')) : 'Hội thoại';
                        await electron.invoke('save-local-chatbot-history', {
                            username: this.user?.name || 'admin',
                            threadId: this.currentThread,
                            messages: this.currentMessages,
                            title: titlePreview
                        });
                    } catch (e) {}
                }
            }
        } catch (err: any) {
            isRendering = false;
            if (renderRafId) cancelAnimationFrame(renderRafId);

            console.error('[Chatbot AI Agent Error]:', err);
            fullText = `<span class="text-red-500 font-medium">Lỗi phản hồi từ AI Agent (sontinh.type.vn): ${err?.message || err}</span>`;
            bubble.innerHTML = fullText;
            botMessage[3] = fullText;
            this.renderMessages(this.currentMessages);
        }
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

    async selectFolder(): Promise<void> {
        const electron = (window as any).electron;
        if (electron && electron.invoke) {
            try {
                const folderPath = await electron.invoke('select-folder-dialog', this.selectedFolderPath || undefined);
                if (folderPath) {
                    this.selectedFolderPath = folderPath;
                    localStorage.setItem('chatbot_document_folder_path', folderPath);
                    this.multiAccountService.setItem('chatbot_document_folder_path', folderPath);
                    this.toastr.success(`Đã chọn thư mục: ${this.getFolderBaseName(folderPath)}`);
                    await this.loadFilesFromFolder(folderPath);
                }
            } catch (err: any) {
                console.error('Error selecting folder:', err);
                this.toastr.error('Không thể chọn thư mục.');
            }
        } else {
            this.toastr.info('Tính năng chọn thư mục cục bộ khả dụng trên ứng dụng Desktop.');
        }
    }

    async loadFilesFromFolder(folderPath: string): Promise<void> {
        if (!folderPath) return;
        const electron = (window as any).electron;
        if (electron && electron.invoke) {
            this.isLoadingFiles = true;
            this.cd.markForCheck();
            try {
                let localIndexedFiles: any = {};
                try {
                    const metaRes = await electron.invoke('get-local-faiss-metadata', this.user?.name || 'admin');
                    if (metaRes?.success && metaRes?.files) {
                        localIndexedFiles = metaRes.files;
                    }
                } catch (me) {}

                const res = await electron.invoke('list-documents-in-folder', folderPath);
                this.isLoadingFiles = false;
                if (res && res.success) {
                    const files = res.files || [];
                    for (const f of files) {
                        const baseName = (f.filename || '').replace(/\.[^/.]+$/, '').trim().toLowerCase();
                        const rawName = (f.filename || '').trim().toLowerCase();
                        for (const key of Object.keys(localIndexedFiles)) {
                            const keyLower = key.toLowerCase().trim();
                            const keyBase = key.replace(/\.[^/.]+$/, '').toLowerCase().trim();
                            if (keyLower === rawName || keyBase === baseName || keyLower === `${baseName}.md` || keyBase === `${baseName}.pdf`) {
                                f.is_indexed = true;
                                if (localIndexedFiles[key]?.doc_type) f.doc_type = localIndexedFiles[key].doc_type;
                                break;
                            }
                        }
                    }
                    this.fileRows = files;
                    this.applyFileFilter();
                } else {
                    this.toastr.warning(res?.error || 'Không thể quét tệp trong thư mục.');
                    this.fileRows = [];
                    this.applyFileFilter();
                }
            } catch (err) {
                this.isLoadingFiles = false;
                console.error('Error loading files from folder:', err);
            } finally {
                this.cd.markForCheck();
            }
        }
    }

    clearSelectedFolder(): void {
        this.selectedFolderPath = '';
        localStorage.removeItem('chatbot_document_folder_path');
        this.multiAccountService.setItem('chatbot_document_folder_path', '');
        this.loadFileRows();
        this.toastr.info('Đã quay về danh sách tài liệu trên máy chủ.');
    }

    refreshFiles(): void {
        if (this.selectedFolderPath) {
            this.loadFilesFromFolder(this.selectedFolderPath);
        } else {
            this.loadFileRows();
        }
    }

    getFolderBaseName(folderPath: string): string {
        if (!folderPath) return '';
        const parts = folderPath.split(/[\\/]/).filter(p => p.trim());
        return parts.pop() || folderPath;
    }

    async openLocalFile(filePath: string): Promise<void> {
        const electron = (window as any).electron;
        if (electron && electron.invoke && filePath) {
            await electron.invoke('open-file-path', filePath);
        }
    }

    async showFileInFolder(filePath: string): Promise<void> {
        const electron = (window as any).electron;
        if (electron && electron.invoke && filePath) {
            await electron.invoke('show-item-in-folder', filePath);
        }
    }

    async loadFileRows(): Promise<void> {
        if (!this.user?.name) return;
        this.isLoadingFiles = true;

        const electron = (window as any).electron;
        let localIndexedFiles: any = {};
        if (electron && electron.invoke) {
            try {
                const metaRes = await electron.invoke('get-local-faiss-metadata', this.user.name);
                if (metaRes?.success && metaRes?.files) {
                    localIndexedFiles = metaRes.files;
                }
            } catch (e) {}
        }

        this._chatbotService.listFiles({
            username: this.user.name
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                this.isLoadingFiles = false;
                let files: any[] = [];
                if (res && res.files) files = res.files;
                else if (res && res.data) files = res.data;
                else if (Array.isArray(res)) files = res;

                // Tự động đồng bộ trạng thái Đã học từ thư mục local FAISS
                for (const f of files) {
                    const baseName = (f.filename || '').replace(/\.[^/.]+$/, '');
                    if (localIndexedFiles[f.filename] || localIndexedFiles[baseName] || localIndexedFiles[`${f.filename}.md`]) {
                        f.is_indexed = true;
                        const match = localIndexedFiles[f.filename] || localIndexedFiles[baseName] || localIndexedFiles[`${f.filename}.md`];
                        if (match?.doc_type) f.doc_type = match.doc_type;
                    }
                }

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
                (f.doc_type && f.doc_type.toLowerCase().includes(q)) ||
                (f.filePath && f.filePath.toLowerCase().includes(q))
            );
        }
        this.cd.markForCheck();
    }

    onStartLearnDocument(row: any, rowIndex: number): void {
        const validValues = this.docTypes.map(d => d.value);
        const initialDocType = (row.doc_type && validValues.includes(row.doc_type)) ? row.doc_type : 'qa_detailed';
        const dialogRef = this.dialog.open(DocTypeDialogComponent, {
            data: {
                docTypes: this.docTypes,
                selectedDocType: initialDocType
            }
        });

        dialogRef.afterClosed().subscribe((selectedType: string) => {
            if (selectedType) {
                row.doc_type = selectedType;
                this.reIndexPdf(selectedType, row.filename, rowIndex);
            }
        });
    }

    async reIndexPdf(doc_type: string, filename: string, rowIndex: number = -1): Promise<void> {
        let isMinerUEnabled = localStorage.getItem('isMinerUEnabled') === 'true';
        let isColabMcpEnabled = localStorage.getItem('isColabMcpEnabled') === 'true';
        let colabMcpUrl = (localStorage.getItem('colabMcpUrl') || '').trim();

        // 0. Tự động kiểm tra và đồng bộ Colab GPU URL mới nhất từ Agent daemon nền và settings
        try {
            if ((window as any).electronAPI && (window as any).electronAPI.checkColabGpuStatus) {
                const statusRes = await (window as any).electronAPI.checkColabGpuStatus();
                if (statusRes && statusRes.colab_url && statusRes.is_connected) {
                    colabMcpUrl = statusRes.colab_url;
                    isColabMcpEnabled = true;
                    localStorage.setItem('colabMcpUrl', colabMcpUrl);
                    localStorage.setItem('isColabMcpEnabled', 'true');
                }
            }
        } catch(e) {}

        if (!colabMcpUrl) {
            try {
                const colabStatusResp = await fetch('http://127.0.0.1:7868/status', { signal: AbortSignal.timeout(1500) });
                if (colabStatusResp.ok) {
                    const cData = await colabStatusResp.json();
                    if (cData && cData.colab_url && cData.is_connected) {
                        colabMcpUrl = cData.colab_url;
                        isColabMcpEnabled = true;
                        localStorage.setItem('colabMcpUrl', colabMcpUrl);
                        localStorage.setItem('isColabMcpEnabled', 'true');
                    }
                }
            } catch(e) {}
        }

        const settings = this.settings || this.multiAccountService.getItem('settings') || {};
        const secretKeys = settings?.secretKey ? settings.secretKey.split(';').map((k: string) => k.trim()).filter((k: string) => k) : [];
        const geminiKey = secretKeys.length > 0 ? secretKeys[Math.floor(Math.random() * secretKeys.length)] : '';

        const electron = (window as any).electron;
        const targetRow = this.fileRows?.find(r => r.filename === filename);
        const dType = doc_type === 'None' ? 'default' : doc_type;
        const backendUrl = this.config?.settings?.chatbot || 'https://bot.type.vn';

        // 1. ƯU TIÊN HÀNG ĐẦU: Chạy trực tiếp trên Google Colab MCP GPU Server & Lưu FAISS Local (dành riêng cho PDF)
        let colabSuccess = false;
        if (filename.toLowerCase().endsWith('.pdf') && (isColabMcpEnabled || colabMcpUrl) && electron) {
            this.isIndexing = true;
            this.indexingFilename = filename;
            this.progressPercent = 15;
            this.progressStatus = 'Đang chuẩn bị file cho Colab GPU...';
            this.cd.markForCheck();

            // Lắng nghe tiến trình chi tiết từ electron nếu có
            const cleanupMcpProgress = electron.onPdfProgress ? electron.onPdfProgress((data: string) => {
                this.progressStatus = data;
                this.cd.markForCheck();
            }) : () => {};

            try {
                let tempPdfPath = '';
                if (targetRow?.is_local && targetRow?.filePath) {
                    tempPdfPath = targetRow.filePath;
                } else {
                    const pdfUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filename)}`;
                    tempPdfPath = await electron.invoke('download-temp-pdf', pdfUrl);
                }

                this.progressPercent = 35;
                this.progressStatus = 'Đang gửi PDF lên Colab GPU bóc tách...';
                this.cd.markForCheck();

                console.log(`[Chatbot] Đang gửi PDF lên Colab MCP GPU: ${filename}`);
                const result = await electron.invoke('run-pdf-analysis-mcp', {
                    filePath: tempPdfPath,
                    mcpUrl: colabMcpUrl,
                    docType: doc_type,
                    googleApiKey: geminiKey,
                    username: this.user?.name || 'admin'
                });
                console.log(`[Chatbot] Colab MCP phân tích xong:`, result);

                if (!result || !result.markdown || result.markdown.trim().length < 20) {
                    throw new Error('Colab GPU trả về kết quả rỗng (chưa trích xuất được nội dung).');
                }

                this.progressPercent = 85;
                this.progressStatus = 'Đang lưu bản chỉ mục FAISS cục bộ...';
                this.cd.markForCheck();

                // Lưu bản chỉ mục & dữ liệu bóc tách cục bộ tại Documents/ai.type/data/faiss/{username}
                const saveRes = await electron.invoke('save-local-faiss-data', {
                    username: this.user.name,
                    filename: filename,
                    doc_type: doc_type,
                    markdown: result.markdown || '',
                    content_json: result.data || result,
                    faiss_base64: result.faiss_base64,
                    pkl_base64: result.pkl_base64
                });

                if (saveRes && saveRes.success) {
                    if (targetRow) {
                        targetRow.is_indexed = true;
                        this.applyFileFilter();
                    }
                    const chunksMsg = result.chunks_count ? ` (${result.chunks_count} đoạn)` : '';
                    this.toastr.success(`Đã tạo FAISS local & học xong ${filename}${chunksMsg}!`);
                    
                    // Đồng bộ kết quả bóc tách từ Colab GPU lên máy chủ bot.type.vn
                    this.progressStatus = 'Đang đồng bộ FAISS lên máy chủ bot.type.vn...';
                    this.cd.markForCheck();
                    try {
                        const jsonPayload = (typeof result.data === 'string') 
                            ? result.data 
                            : (result.data ? JSON.stringify(result.data) : (typeof result === 'string' ? result : JSON.stringify(result)));
                        
                        await new Promise((resolve) => {
                            this._chatbotService.uploadMinerUResult({
                                username: this.user.name,
                                filename: filename,
                                doc_type: doc_type,
                                content_json: jsonPayload
                            }).subscribe({
                                next: (res) => resolve(res),
                                error: (err) => {
                                    console.warn('[Chatbot] Cảnh báo uploadMinerUResult lên server:', err);
                                    resolve(null);
                                }
                            });
                        });
                    } catch (syncErr) {
                        console.warn('[Chatbot] Lỗi đồng bộ mineru lên server:', syncErr);
                    }

                    // Kích hoạt máy chủ cập nhật bản chỉ mục FAISS trên cloud
                    this.triggerNormalReindex(doc_type, filename);
                    colabSuccess = true;
                    return;
                } else {
                    throw new Error(saveRes?.error || 'Lỗi lưu tệp FAISS vào Documents');
                }
            } catch (mcpErr: any) {
                console.warn('[Chatbot] Colab GPU không khả dụng hoặc lỗi:', mcpErr);
                this.toastr.warning('Không thể phân tích qua Colab GPU: ' + (mcpErr?.message || mcpErr) + '. Đang chuyển sang phương thức dự phòng...');
                // Fallback xuống luồng thông thường bên dưới
            } finally {
                cleanupMcpProgress();
            }
        }

        // 2. Chế độ thông thường (OpenAI API hoặc MinerU cục bộ)
        if (!geminiKey && !settings.umodelverseKey) {
            this.isIndexing = false;
            this.indexingFilename = '';
            this.cd.markForCheck();
            this.toastr.warning('Chưa có Google API Key hoặc Colab GPU để học tài liệu.');
            return;
        }

        if (filename.toLowerCase().endsWith('.pdf') && electron) {
            this.isIndexing = true;
            this.indexingFilename = filename;
            this.progressPercent = 10;
            this.progressStatus = 'Đang kiểm tra dữ liệu máy chủ...';
            this.cd.markForCheck();

            const filenameWithoutExt = filename.replace(/\.pdf$/i, '');
            const jsonUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filenameWithoutExt)}.mineru.json`;

            try {
                const checkRes = await fetch(jsonUrl, { method: 'HEAD' });
                if (!checkRes.ok) {
                    let tempPdfPath = '';
                    if (targetRow?.is_local && targetRow?.filePath) {
                        tempPdfPath = targetRow.filePath;
                    } else {
                        const pdfUrl = `${backendUrl}/pdfs/${dType}/${this.user.name}/${encodeURIComponent(filename)}`;
                        tempPdfPath = await electron.invoke('download-temp-pdf', pdfUrl);
                    }

                    const cleanup = electron.onPdfProgress((data: string) => {
                        this.progressStatus = data;
                        this.cd.markForCheck();
                    });

                    try {
                        // Nếu không có MinerU cục bộ, dùng OpenAI / Gemini API
                        let ipcMethod = isMinerUEnabled ? 'run-pdf-analysis' : 'run-pdf-analysis-openai';
                        let configData = undefined;
                        if (!isMinerUEnabled) {
                            try {
                                const currentSettings = this.multiAccountService.getItem('settings') || this.settings;
                                if (currentSettings) {
                                    configData = {
                                        url: currentSettings.umodelverseUrl || '',
                                        key: currentSettings.umodelverseKey || ''
                                    };
                                }
                            } catch (e) {}
                        }

                        let result: any;
                        try {
                            result = await electron.invoke(ipcMethod, tempPdfPath, configData);
                        } catch (ipcErr: any) {
                            // Nếu chạy MinerU cục bộ lỗi do thiếu GPU, tự động fallback sang phân tích qua API
                            if (isMinerUEnabled) {
                                console.warn('[Chatbot] MinerU cục bộ thất bại, tự động chuyển sang OpenAI API:', ipcErr);
                                this.progressStatus = 'Chuyển sang phân tích bằng AI API...';
                                this.cd.markForCheck();
                                const currentSettings = this.multiAccountService.getItem('settings') || this.settings;
                                configData = {
                                    url: currentSettings?.umodelverseUrl || '',
                                    key: currentSettings?.umodelverseKey || ''
                                };
                                result = await electron.invoke('run-pdf-analysis-openai', tempPdfPath, configData);
                            } else {
                                throw ipcErr;
                            }
                        }

                        await new Promise((resolve, reject) => {
                            this._chatbotService.uploadMinerUResult({
                                username: this.user.name,
                                filename: filename,
                                doc_type: doc_type,
                                content_json: result
                            }).subscribe({
                                next: (res) => (res && res.success) ? resolve(res) : reject('Tải kết quả thất bại'),
                                error: reject
                            });
                        });
                    } finally {
                        cleanup();
                    }
                }

                this.triggerNormalReindex(doc_type, filename);
                return;
            } catch (err: any) {
                this.stopProgressPolling();
                this.isIndexing = false;
                this.indexingFilename = '';
                this.cd.markForCheck();
                this.toastr.error('Lỗi phân tích tài liệu AI: ' + (err.message || err));
                return;
            }
        } else {
            // Đối với các tệp không phải PDF (EPUB, MOBI, TXT, DOCX...) thì gửi reindex trực tiếp lên máy chủ
            this.triggerNormalReindex(doc_type, filename);
        }
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

        this.refreshFiles();
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
            icon: {
                show: true,
                name: 'heroicons_outline:trash',
                color: 'error'
            },
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

    onSendForm(event: Event, inputEl?: HTMLInputElement): void {
        event.preventDefault();
        const text = (inputEl ? inputEl.value : (this.chatInputRef?.nativeElement?.value || this.inputMessage || '')).trim();
        if (inputEl) inputEl.value = '';
        if (this.chatInputRef?.nativeElement) this.chatInputRef.nativeElement.value = '';
        this.sendMessage(text);
    }

    sendQuickPrompt(promptText: string): void {
        if (this.chatInputRef?.nativeElement) {
            this.chatInputRef.nativeElement.value = '';
        }
        this.sendMessage(promptText);
    }

    onEnterSendMessage(event: any, inputEl?: HTMLInputElement): void {
        if (!event.shiftKey) {
            event.preventDefault();
            const text = (inputEl ? inputEl.value : (this.chatInputRef?.nativeElement?.value || this.inputMessage || '')).trim();
            if (inputEl) inputEl.value = '';
            if (this.chatInputRef?.nativeElement) this.chatInputRef.nativeElement.value = '';
            this.sendMessage(text);
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
        private taskProgress: TaskProgressService,
        private _genaiService: GenaiService
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

                const savedFolderPath = localStorage.getItem('chatbot_document_folder_path') || this.multiAccountService.getItem('chatbot_document_folder_path');
                if (savedFolderPath) {
                    this.selectedFolderPath = savedFolderPath;
                    this.loadFilesFromFolder(savedFolderPath);
                } else {
                    this.loadFileRows();
                }

                // Tự động kiểm tra trạng thái Google Colab GPU
                this.checkColabStatus();
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