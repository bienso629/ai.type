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
    forkJoin,
    firstValueFrom
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
    platform: string = 'tiktok';

    // AI Chat Assistant State & Profile Mention Popup (@)
    @ViewChild('scriptChatInput') scriptChatInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('profileSearchInput') profileSearchInputRef?: ElementRef<HTMLInputElement>;

    showProfileMentionPopup: boolean = false;
    profileSearchQuery: string = '';
    runningProfiles: any[] = [];
    filteredRunningProfiles: any[] = [];
    selectedRunningProfiles: any[] = [];

    chatInput: string = '';
    chatMessages: { role: 'user' | 'assistant' | 'divider'; content: string }[] = [];

    items: any[] = [];

    get quickActionChips() {
        const activeAnalyzingRoom = (this.selectedRoom && this.selectedRoom.is_analyzing)
            ? this.selectedRoom
            : (this.rooms ? this.rooms.find(r => r.is_analyzing) : null);
        const isAnalyzing = Boolean(activeAnalyzingRoom);

        return [
            {
                label: isAnalyzing ? 'Dừng phân tích video đã chọn' : 'Phân tích video đã chọn',
                icon: isAnalyzing ? 'feather:stop-circle' : 'heroicons_outline:sparkles',
                action: isAnalyzing ? 'stop_analyze' : 'analyze'
            },
            { label: 'Tự động thích video của bạn', icon: 'feather:heart', action: 'like' },
            { label: 'Tự động bình luận cho video của bạn', icon: 'feather:message-square', action: 'comment' },
            { label: 'Tìm giá thấp nhất', icon: 'feather:tag', action: 'lowest_price' }
        ];
    }

    async analyzeSelectedRoom(): Promise<void> {
        let targetRoom = this.selectedRoom;
        if (!targetRoom && this.rooms && this.rooms.length > 0) {
            targetRoom = this.rooms[0];
        }

        if (!targetRoom) {
            this.toastr.warning('Chưa có phiên Livestream nào để phân tích.');
            return;
        }

        // Đảm bảo chọn targetRoom
        this.selectRoom(targetRoom);

        // Đảo trạng thái phân tích
        if (targetRoom.is_analyzing) {
            this.stopContinuousAnalysis(targetRoom);
        } else {
            this.startContinuousAnalysis(targetRoom);
        }
    }

    formatAiResponse(rawText: string): string {
        if (!rawText) return '';
        let clean = rawText.trim();

        // 1. Loại bỏ markdown code blocks ```html và ```
        clean = clean.replace(/```html/gi, '');
        clean = clean.replace(/```/g, '');

        // 2. Thay thế tên thương hiệu cũ nếu có
        clean = clean.replace(/AI Agent/gi, 'Trợ lý phân tích');
        clean = clean.replace(/sontinh\.type\.vn/gi, 'Trợ lý phân tích');
        clean = clean.replace(/sontinh/gi, 'Trợ lý phân tích');

        // 3. Xóa triệt để các thẻ <br> rác bị chèn sai vị trí bên trong các danh sách <ul>, <ol>, <li>, <table>, <tr>
        clean = clean.replace(/(<(?:ul|ol|table|tr)[^>]*>)\s*(?:<br\s*\/?>)+/gi, '$1');
        clean = clean.replace(/(?:<br\s*\/?>)+\s*(<\/(?:ul|ol|table|tr)>)/gi, '$1');
        clean = clean.replace(/(<\/li>)\s*(?:<br\s*\/?>)+/gi, '$1');
        clean = clean.replace(/(?:<br\s*\/?>)+\s*(<li>)/gi, '$1');

        // 4. Nếu câu trả lời ĐÃ CHỨA thẻ HTML khối (p, div, ul, ol, li, h1-h6), KHÔNG tự ý chèn <br/> vào dấu \n
        const hasBlockTags = /<(?:p|div|ul|ol|li|h[1-6]|table|tr|td|th)[^>]*>/i.test(clean);
        if (!hasBlockTags) {
            clean = clean.replace(/\r\n/g, '\n');
            clean = clean.replace(/\n{2,}/g, '\n');
            clean = clean.replace(/\n/g, '<br/>');
        } else {
            // Gom bớt các <br/> thừa liên tiếp nếu có sẵn
            clean = clean.replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br/>');
        }

        // 5. Triệt tiêu toàn bộ <br/> thừa ở ĐẦU và CUỐI chuỗi
        clean = clean.replace(/^(?:\s*<br\s*\/?>\s*)+/gi, '');
        clean = clean.replace(/(?:\s*<br\s*\/?>\s*)+$/gi, '');

        // 6. Xóa <br/> thừa trước và sau các thẻ HTML khối
        clean = clean.replace(/(?:<br\s*\/?>\s*)+(<(?:p|div|h[1-6]|ul|ol|li|table|tr|td|th)[^>]*>)/gi, '$1');
        clean = clean.replace(/(<\/(?:p|div|h[1-6]|ul|ol|li|table|tr|td|th)>)\s*(?:<br\s*\/?>)+/gi, '$1');

        return clean.trim();
    }

    getIpcRenderer(): any {
        if (this.ipcRenderer) return this.ipcRenderer;
        try {
            const w = window as any;
            if (w.ipcRenderer) {
                this.ipcRenderer = w.ipcRenderer;
                return w.ipcRenderer;
            }
            if (w.electronAPI) {
                this.ipcRenderer = w.electronAPI;
                return w.electronAPI;
            }
            if (w.require) {
                const electron = w.require('electron');
                if (electron && electron.ipcRenderer) {
                    this.ipcRenderer = electron.ipcRenderer;
                    return electron.ipcRenderer;
                }
            }
        } catch (e) {
            console.warn('[getIpcRenderer Warning]:', e);
        }
        return null;
    }

    saveAnalysisToSqlite(room: any, analysisText: string): void {
        if (!room || !analysisText) return;

        const roomId = String(room.id || room.room_id || room.unique_id || room.nickname || 'unknown_room');
        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const title = room.title || 'Phiên phát trực tiếp';
        const hlsUrl = this.pickHlsUrlFromRoom(room) || '';
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const now = Date.now();

        // Lưu qua Electron IPC SQLite (Desktop App)
        const ipc = this.getIpcRenderer();
        if (ipc && ipc.invoke) {
            ipc.invoke('db-tiktok-save', {
                room_id: roomId,
                date_str: dateStr,
                nickname: nickname,
                title: title,
                hls_url: hlsUrl,
                analysis_text: analysisText
            }).then((res: any) => {
                if (res && res.success) {
                    console.log(`[SQLite tiktok.sqlite] Đã lưu phân tích phòng ${roomId} thành công (ID: ${res.id})`);
                }
            }).catch((err: any) => {
                console.warn('[SQLite tiktok.sqlite Save Warning]:', err);
            });
        }
    }

    aiFilteredRoomIds: Set<string> | null = null;

    getRoomViewerCount(room: any): number {
        if (!room) return 0;
        let val = room._raw_user_count ??
                  room.user_count ??
                  room.viewer_count ??
                  room.user_count_str ??
                  room.stats?.user_count ??
                  room.stats?.viewer_count ??
                  room.stats?.total_user ??
                  room.live_room?.user_count ??
                  0;

        if (typeof val === 'string') {
            val = parseInt(val.replace(/[^0-9]/g, ''), 10);
        }
        val = Number(val) || 0;

        // Lưu giữ số mắt gốc thu thập từ API
        room._raw_user_count = val;

        // Khi phiên đang trong chế độ Phân tích AI Realtime (is_analyzing)
        if (room.is_analyzing && val > 0) {
            if (!room._base_viewer_count || Math.abs(room._base_viewer_count - val) > 30) {
                room._base_viewer_count = val;
                room._realtime_user_count = val;
            } else {
                // Tạo biến động mắt xem thực tế ngẫu nhiên (±1% đến 2.5%) mỗi lần quét
                const delta = Math.floor((Math.random() - 0.46) * Math.max(4, Math.floor(val * 0.025)));
                room._realtime_user_count = Math.max(1, (room._realtime_user_count || val) + delta);
            }
            room.user_count = room._realtime_user_count;
            return room._realtime_user_count;
        }

        return val;
    }

    copyMessage(content: string) {
        if (!content) return;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const text = tempDiv.textContent || tempDiv.innerText || content;
        navigator.clipboard.writeText(text).then(() => {
            this.toastr.success('Đã sao chép nội dung!');
        }).catch(() => {
            this.toastr.info('Đã sao chép nội dung');
        });
    }

    getMessageTime(msg: any): string {
        if (msg?.time) return msg.time;
        if (msg?.timestamp) {
            const d = new Date(msg.timestamp);
            if (!isNaN(d.getTime())) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    reAskMessage(msg: any) {
        let text = msg?.content || '';
        if (msg?.role === 'assistant') {
            const idx = this.chatMessages.indexOf(msg);
            if (idx > 0 && this.chatMessages[idx - 1]?.role === 'user') {
                text = this.chatMessages[idx - 1]?.content;
            } else {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = text;
                text = tempDiv.textContent || text;
            }
        }
        this.chatInput = text;
        this.cd.markForCheck();
        const inputEl = document.querySelector('input[placeholder*="prompt"]') as HTMLInputElement;
        if (inputEl) inputEl.focus();
    }

    continuePrompt(msg: any): void {
        let text = '';
        if (msg?.confirmAction?.videoUrl) {
            const profilesStr = (msg.confirmAction.profiles || []).map((p: string) => {
                const found = this.runningProfiles.find(rp => rp.name === p);
                const tag = found?.persona?.alias ? found.persona.alias : p;
                return `@${tag.replace(/\s+/g, '_')}`;
            }).join(' ');
            text = profilesStr ? `${profilesStr} cùng viết bình luận cho video ${msg.confirmAction.videoUrl} ` : `Viết bình luận cho video ${msg.confirmAction.videoUrl} `;
        } else if (msg?.role === 'user') {
            text = `${msg.content} - Hãy phân tích chi tiết hơn: `;
        } else {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = msg.content || '';
            const plain = tempDiv.textContent?.trim() || '';
            const firstSnippet = plain.slice(0, 50).replace(/\s+/g, ' ');
            text = firstSnippet ? `Hỏi tiếp về: ${firstSnippet}... ` : 'Hỏi tiếp: ';
        }
        this.chatInput = text;
        this.cd.markForCheck();
        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
                const len = this.chatInput.length;
                this.scriptChatInputRef.nativeElement.setSelectionRange(len, len);
            }
        }, 50);
    }

    applyFollowUpPrompt(promptText: string): void {
        if (!promptText) return;
        const cleanPrompt = promptText.replace(/^[^\w\s@À-ỹ]+/, '').trim();
        this.chatInput = cleanPrompt;
        this.cd.markForCheck();
        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
            }
        }, 50);
    }

    confirmAndExecuteAction(msg: any): void {
        if (!msg || !msg.confirmAction) return;
        const ca = msg.confirmAction;
        ca.status = 'executed';

        if (ca.runPayload) {
            this._mxhautoService.run(ca.runPayload)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: () => {
                        this.toastr.success(`Đang mở ${ca.profiles.length} profile truy cập video...`);
                        if (ca.isLikeIntent && ca.videoUrl) {
                            setTimeout(() => {
                                const likePayload = {
                                    site: "tiktok.com",
                                    title: "Thả tim",
                                    profiles: ca.profiles,
                                    profiles_root: this.getProfilesRoot(),
                                    profile_urls: ca.profiles.reduce((acc: any, cur: string) => { acc[cur] = ca.videoUrl; return acc; }, {}),
                                    coords_file: "mouse_coords.json"
                                };
                                this._mxhautoService.like(likePayload).subscribe({
                                    next: () => this.toastr.success(`Đã tự động gửi lệnh Thả tim cho ${ca.profiles.join(', ')}`),
                                    error: () => {}
                                });
                            }, 3000);
                        }
                    },
                    error: () => this.toastr.error('Lỗi khi khởi chạy profile')
                });
        }
        this.cd.markForCheck();
    }

    cancelAction(msg: any): void {
        if (!msg || !msg.confirmAction) return;
        msg.confirmAction.status = 'cancelled';
        this.toastr.info('Đã hủy thực thi tác vụ');
        this.cd.markForCheck();
    }

    // --- PROFILE MENTION POPUP (@) LOGIC ---
    onChatInputChange(event: any): void {
        const val = this.chatInput || '';
        const inputEl = event?.target as HTMLInputElement;
        const cursor = inputEl?.selectionStart ?? val.length;

        const textBeforeCursor = val.slice(0, cursor);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1) {
            const queryAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
            if (!/\s/.test(queryAfterAt)) {
                this.profileSearchQuery = queryAfterAt;
                this.openProfileMentionPopup();
                return;
            }
        }

        if (this.showProfileMentionPopup && lastAtIndex === -1) {
            this.showProfileMentionPopup = false;
            this.cd.markForCheck();
        }
    }

    onChatInputKeydown(event: KeyboardEvent): void {
        if (event.key === '@') {
            setTimeout(() => {
                this.openProfileMentionPopup();
            }, 0);
        } else if (event.key === 'Escape' && this.showProfileMentionPopup) {
            this.closeProfileMentionPopup();
            event.preventDefault();
        }
    }

    toggleProfileMentionPopup(): void {
        this.showNgSelectBar = !this.showNgSelectBar;
        this.showProfileMentionPopup = this.showNgSelectBar;
        if (this.showNgSelectBar) {
            this.fetchRunningProfiles();
        }
        this.cd.markForCheck();
    }

    openProfileMentionPopup(): void {
        this.showNgSelectBar = true;
        this.showProfileMentionPopup = true;
        this.fetchRunningProfiles();
        this.filterRunningProfiles();
        this.cd.markForCheck();
    }

    closeProfileMentionPopup(): void {
        this.showProfileMentionPopup = false;
        this.profileSearchQuery = '';
        this.cd.markForCheck();
    }

    profileDisplayFn(prof: any): string {
        return '';
    }

    onProfileOptionSelected(event: any): void {
        const prof = event?.option?.value;
        if (!prof) return;

        const tag = prof.persona?.alias ? prof.persona.alias : prof.name;
        const mentionToken = `@${tag.replace(/\s+/g, '_')} `;

        let val = this.chatInput || '';
        const lastAtIndex = val.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            val = val.slice(0, lastAtIndex) + mentionToken;
        } else {
            val = val ? `${val.trim()} ${mentionToken}` : mentionToken;
        }

        this.chatInput = val;
        this.closeProfileMentionPopup();
        this.cd.markForCheck();

        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
            }
        }, 50);
    }

    // --- NG-SELECT MULTI-SELECT PROFILE LOGIC (GIỐNG HỆT MỜI VIẾT CÙNG) ---
    selectedProfilesForScript: any[] = [];
    showNgSelectBar: boolean = false;

    toggleNgSelectBar(): void {
        this.showNgSelectBar = !this.showNgSelectBar;
        if (this.showNgSelectBar) {
            this.fetchRunningProfiles();
        }
        this.cd.markForCheck();
    }

    selectAllNgProfiles(): void {
        this.selectedProfilesForScript = this.runningProfiles.map(p => p.name);
        this.cd.markForCheck();
    }

    clearAllNgProfiles(): void {
        this.selectedProfilesForScript = [];
        this.cd.markForCheck();
    }

    onNgSelectProfilesChange(selected: any[]): void {
        this.selectedProfilesForScript = selected || [];
        this.cd.markForCheck();
    }

    applyNgProfilesToPrompt(): void {
        if (!this.selectedProfilesForScript || this.selectedProfilesForScript.length === 0) return;

        const mentionTokens = this.selectedProfilesForScript.map(pName => {
            const found = this.runningProfiles.find(p => p.name === pName);
            const tag = found?.persona?.alias ? found.persona.alias : pName;
            return `@${tag.replace(/\s+/g, '_')}`;
        }).join(' ');

        let cur = this.chatInput || '';
        cur = cur ? `${cur.trim()} ${mentionTokens} ` : `${mentionTokens} `;
        this.chatInput = cur;
        this.showNgSelectBar = false;
        this.showProfileMentionPopup = false;
        this.cd.markForCheck();

        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
            }
        }, 50);
    }

    onSearchInputEnter(): void {
        if (this.selectedRunningProfiles.length > 0) {
            this.applySelectedProfileMentions();
        } else if (this.filteredRunningProfiles.length === 1) {
            this.toggleProfileSelection(this.filteredRunningProfiles[0]);
            this.applySelectedProfileMentions();
        }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.showProfileMentionPopup) return;
        const target = event.target as HTMLElement;
        if (!target) return;

        const insidePopup = target.closest('.profile-mention-popup-container');
        const insideInput = target.closest('.script-chat-input-container');
        if (!insidePopup && !insideInput) {
            this.closeProfileMentionPopup();
        }
    }

    fetchRunningProfiles(): void {
        // 1. Dùng danh sách items / profiles có sẵn hiển thị 0ms
        const currentList = (this.items && this.items.length > 0) ? this.items : this.profiles;
        this.populateRunningProfilesList(currentList);

        // 2. Tải thêm từ server để đồng bộ mới nhất
        this._mxhautoService.profiles({
            profiles_root: this.getProfilesRoot(),
            host: '127.0.0.1',
            verify: true,
            filter: 'running',
            include_accounts: true,
            platform: this.platform || 'tiktok',
            username: this.user?.name || 'admin'
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (result: any) => {
                if (result && result.ok && Array.isArray(result.results)) {
                    this.populateRunningProfilesList(result.results);
                    this.filterRunningProfiles();
                    this.cd.markForCheck();
                }
            },
            error: () => {}
        });
    }

    private populateRunningProfilesList(rawList: any[]): void {
        if (!Array.isArray(rawList)) return;
        this.runningProfiles = rawList.map((p, idx) => {
            const name = p.name || p.profile || `Profile ${idx + 1}`;
            const acc = (p.accounts && p.accounts.length > 0) ? p.accounts[0] : null;
            let avatar = acc?.avatar || p.avatar || p.raw?.avatar || '';
            if (avatar && !avatar.startsWith('http://') && !avatar.startsWith('https://') && !avatar.startsWith('assets/') && !avatar.startsWith('data:') && !avatar.startsWith('file:///')) {
                avatar = 'file:///' + avatar;
            }
            if (!avatar) {
                const aliasOrName = acc?.alias || p.profile || name || `Profile ${idx + 1}`;
                avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(aliasOrName)}&background=0d9488&color=fff&bold=true&size=128`;
            }
            const account_username = acc?.username || acc?.nickname || '';
            const persona = p.persona || (acc?.alias ? { alias: acc.alias, role: 'Người xem', style: 'Tự nhiên' } : { role: 'Người xem', style: 'Tự nhiên' });
            return {
                id: p.id !== undefined ? p.id : idx,
                name: name,
                avatar: avatar,
                account_username: account_username,
                persona: persona,
                raw: p
            };
        });
        this.filterRunningProfiles();
    }

    getProfileAvatar(userOrName: any): string {
        if (!userOrName) return 'assets/images/avatars/612x612.jpg';
        let found: any = null;
        if (typeof userOrName === 'object') {
            found = userOrName;
        } else {
            found = this.runningProfiles.find(p => p.name === userOrName || p.id === userOrName);
        }

        if (found) {
            if (found.avatar) {
                return found.avatar;
            }
            const acc = (found.raw?.accounts && found.raw.accounts.length > 0) ? found.raw.accounts[0] : null;
            if (acc?.avatar) {
                return acc.avatar;
            }
            const displayName = found.persona?.alias || acc?.alias || found.name || 'P';
            return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0d9488&color=fff&bold=true&size=128`;
        }

        const nameStr = typeof userOrName === 'string' ? userOrName : 'Profile';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(nameStr)}&background=0d9488&color=fff&bold=true&size=128`;
    }

    getProfileDisplayName(userOrName: any): string {
        if (!userOrName) return '';
        if (typeof userOrName === 'object') {
            const alias = userOrName.persona?.alias;
            return alias ? `${alias} (${userOrName.name})` : userOrName.name;
        }
        const found = this.runningProfiles.find(p => p.name === userOrName);
        if (found && found.persona?.alias) {
            return `${found.persona.alias} (${found.name})`;
        }
        return userOrName;
    }

    onImgError(event: Event): void {
        const element = event.target as HTMLImageElement;
        if (element) {
            element.src = 'assets/images/avatars/612x612.jpg';
        }
    }

    onProfileSearchChange(): void {
        this.filterRunningProfiles();
        this.cd.markForCheck();
    }

    filterRunningProfiles(): void {
        const q = (this.profileSearchQuery || '').toLowerCase().trim();
        if (!q) {
            this.filteredRunningProfiles = [...this.runningProfiles];
        } else {
            this.filteredRunningProfiles = this.runningProfiles.filter(p => {
                const name = (p.name || '').toLowerCase();
                const alias = (p.persona?.alias || '').toLowerCase();
                const role = (p.persona?.role || '').toLowerCase();
                const style = (p.persona?.style || '').toLowerCase();
                const username = (p.account_username || '').toLowerCase();
                return name.includes(q) || alias.includes(q) || role.includes(q) || style.includes(q) || username.includes(q);
            });
        }
    }

    isProfileSelected(prof: any): boolean {
        return this.selectedRunningProfiles.some(p => p.name === prof.name || (p.id !== undefined && p.id === prof.id));
    }

    toggleProfileSelection(prof: any): void {
        const idx = this.selectedRunningProfiles.findIndex(p => p.name === prof.name || (p.id !== undefined && p.id === prof.id));
        if (idx !== -1) {
            this.selectedRunningProfiles.splice(idx, 1);
        } else {
            this.selectedRunningProfiles.push(prof);
        }
        this.cd.markForCheck();
    }

    isAllProfilesSelected(): boolean {
        return this.filteredRunningProfiles.length > 0 && 
               this.filteredRunningProfiles.every(p => this.isProfileSelected(p));
    }

    toggleSelectAllProfiles(): void {
        if (this.isAllProfilesSelected()) {
            const filteredNames = new Set(this.filteredRunningProfiles.map(p => p.name));
            this.selectedRunningProfiles = this.selectedRunningProfiles.filter(p => !filteredNames.has(p.name));
        } else {
            for (const prof of this.filteredRunningProfiles) {
                if (!this.isProfileSelected(prof)) {
                    this.selectedRunningProfiles.push(prof);
                }
            }
        }
        this.cd.markForCheck();
    }

    applySelectedProfileMentions(): void {
        if (this.selectedRunningProfiles.length === 0) {
            this.closeProfileMentionPopup();
            return;
        }

        const mentionTokens = this.selectedRunningProfiles.map(p => {
            const tag = p.persona?.alias ? p.persona.alias : p.name;
            return `@${tag.replace(/\s+/g, '_')}`;
        }).join(' ');

        let cur = this.chatInput || '';
        const lastAtIndex = cur.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            cur = cur.slice(0, lastAtIndex) + mentionTokens + ' ';
        } else {
            cur = cur ? `${cur.trim()} ${mentionTokens} ` : `${mentionTokens} `;
        }

        this.chatInput = cur;
        this.closeProfileMentionPopup();
        this.cd.markForCheck();

        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
            }
        }, 50);
    }

    async sendChatMessage(): Promise<void> {
        this.closeProfileMentionPopup();
        if (!this.chatInput || !this.chatInput.trim()) return;
        const text = this.chatInput.trim();
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.chatMessages.push({ role: 'user', content: text, time: nowTime } as any);
        this.chatInput = '';
        this.cd.markForCheck();

        const loadingMsg: { role: 'user' | 'assistant'; content: string; time?: string } = {
            role: 'assistant',
            content: '<b>Trợ lý phân tích AI</b> đang xử lý yêu cầu và phân tích danh sách...',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.chatMessages.push(loadingMsg as any);
        this.cd.markForCheck();
        this.scrollToBottom();

        // 0. Kiểm tra xem người dùng có truyền link video và chỉ đạo hành động (Xem video, Like, Thả tim...) cho các Profile không
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const matchedUrls = text.match(urlRegex) || [];
        const targetUrl = matchedUrls.length > 0 ? matchedUrls[0] : '';

        const mentionedProfiles: any[] = [];
        const pool = [...(this.runningProfiles || []), ...(this.profiles || []), ...(this.items || [])];
        pool.forEach(p => {
            const pName = p.name || p.profile || '';
            const alias = p.persona?.alias || p.accounts?.[0]?.alias || '';
            const tokens = [
                `@${pName.replace(/\s+/g, '_')}`,
                `@${pName}`,
                alias ? `@${alias.replace(/\s+/g, '_')}` : '',
                alias ? `@${alias}` : ''
            ].filter(Boolean);

            const isMatch = tokens.some(tok => text.toLowerCase().includes(tok.toLowerCase()));
            if (isMatch && !mentionedProfiles.some(m => (m.profile || m.name) === (p.profile || p.name))) {
                mentionedProfiles.push(p);
            }
        });

        const isLikeIntent = /(like|thích|thả tim|tha tim)/i.test(text);
        const isCommentIntent = /(comment|bình luận|viet comment|cmt)/i.test(text);
        const isViewIntent = /(xem|xem video|truy cập|vao xem|mở video|open)/i.test(text);

        // NẾU CÓ CHỈ ĐẠO HÀNH ĐỘNG VÀ LINK VIDEO (HOẶC PROFILES GẮN THẺ) -> THỰC THI NGAY
        if (targetUrl && (mentionedProfiles.length > 0 || isLikeIntent || isViewIntent)) {
            const targetProfiles = mentionedProfiles.length > 0 
                ? mentionedProfiles 
                : (this.selectedProfilesForScript?.length ? this.selectedProfilesForScript.map(n => ({ profile: n, name: n })) : [{ profile: 'Profile000', name: 'Profile000' }]);
            const profileNames = targetProfiles.map(p => p.profile || p.name);

            // 1. Tự động Khởi chạy / Điều hướng Opera cho danh sách Profile
            const runPayload: any = {
                profiles: profileNames,
                base_debug_port: 0,
                opera_path: this.getOperaPath(),
                devtools_ready_timeout_ms: 8000,
                close_tabs_on_start: false,
                leave_one_tab: false,
                new_tab_url: targetUrl,
                mode: "skip",
                window_state: "normal",
                headless: false,
                prefix_title_with_profile: true,
                title_prefix_apply_all_tabs: true,
                post_open_wait_ms: 800,
                activate_opened_tab: true,
                username: this.user ? this.user.name : ''
            };
            const root = this.getProfilesRoot();
            if (root) runPayload.profiles_root = root;

            this._mxhautoService.run(runPayload)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res: any) => {
                        this.toastr.success(`Đang mở ${profileNames.length} profile truy cập video...`);

                        // 2. Nếu có yêu cầu Like / Thả tim, tự động kích hoạt Like API sau 3s (để trang load)
                        if (isLikeIntent) {
                            setTimeout(() => {
                                const likePayload = {
                                    site: "tiktok.com",
                                    title: "Thả tim",
                                    profiles: profileNames,
                                    profiles_root: this.getProfilesRoot(),
                                    profile_urls: profileNames.reduce((acc: any, cur: string) => { acc[cur] = targetUrl; return acc; }, {}),
                                    coords_file: "mouse_coords.json"
                                };
                                this._mxhautoService.like(likePayload).subscribe({
                                    next: () => {
                                        this.toastr.success(`Đã tự động gửi lệnh Thả tim cho ${profileNames.join(', ')}`);
                                    },
                                    error: () => {}
                                });
                            }, 3000);
                        }
                    },
                    error: (err: any) => {
                        this.toastr.error('Có lỗi xảy ra khi khởi chạy profile');
                    }
                });

            // 3. Tự động thêm vào Timeline Kịch bản để người dùng theo dõi
            targetProfiles.forEach(tp => {
                const pName = tp.profile || tp.name;
                let actor = this.items.find(it => it.name === pName);
                if (!actor) {
                    actor = {
                        id: this.items.length + 1,
                        name: pName,
                        streamItems: [
                            { name: "Thả tim", meta: [] },
                            { name: "Viết comment trong Live", meta: [] }
                        ],
                        persona: tp.persona || {}
                    };
                    this.items.push(actor);
                }
                if (isLikeIntent) {
                    const likeStream = actor.streamItems?.find(s => s.name === "Thả tim");
                    if (likeStream) {
                        likeStream.meta.push({
                            title: 'Thả tim video',
                            start: new Date(),
                            videoUrl: targetUrl
                        });
                    }
                }
            });
            this.items = [...this.items];
            this.saveScriptState();

            // 4. Render thông báo thực thi trực quan trong chat
            const actionText = isLikeIntent 
                ? 'Mở trình duyệt Opera, truy cập video & tự động bấm Thích (Like ❤️)' 
                : 'Mở trình duyệt Opera & Xem video';

            loadingMsg.content = `
                <div class="space-y-3">
                    <div class="font-semibold text-gray-800 dark:text-gray-100">🚀 <b>Đã tiếp nhận chỉ đạo và đang thực thi tự động ngay:</b></div>
                    <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 space-y-2">
                        <div class="font-bold flex items-center gap-1.5"><span class="text-base">✨</span> Chi tiết tác vụ tự động:</div>
                        <ul class="list-disc pl-5 text-sm space-y-1">
                            <li><b>Profiles thực hiện:</b> ${profileNames.join(', ')}</li>
                            <li><b>Đường dẫn Video:</b> <a href="${targetUrl}" target="_blank" class="underline text-primary-600 font-medium">${targetUrl}</a></li>
                            <li><b>Hành động:</b> ${actionText}</li>
                            <li><b>Trạng thái:</b> <span class="text-green-600 font-bold">Đang khởi chạy Opera và thực hiện...</span></li>
                        </ul>
                    </div>
                </div>
            `;
            (loadingMsg as any).confirmAction = {
                actionType: 'video_interaction',
                profiles: profileNames,
                videoUrl: targetUrl,
                status: 'executed',
                isLikeIntent: isLikeIntent,
                runPayload: runPayload
            };

            // AI tự động phân tích và sinh ra các câu hỏi/prompt gợi ý tiếp theo dựa trên video và profiles
            this._genaiService.generateFollowUpPrompts(
                text,
                `Đã thực thi mở Opera xem video ${targetUrl} cho các profile: ${profileNames.join(', ')}`,
                `Profiles: ${profileNames.join(', ')} | URL: ${targetUrl} | Hành động: ${actionText}`
            ).then(prompts => {
                if (prompts && prompts.length > 0) {
                    (loadingMsg as any).followUpPrompts = prompts;
                    this.cd.markForCheck();
                }
            });

            this.cd.markForCheck();
            this.scrollToBottom();
            return;
        }

        // 1. Gửi toàn bộ dữ liệu phiên Livestream cho Gemini AI để phân tích và lọc thông minh
        const roomSummaries = (this.rooms || []).map((r, idx) => ({
            id: String(r.id || r.room_id || r.unique_id || r.nickname || idx),
            nickname: r.nickname || r.owner?.nickname || 'Streamer',
            unique_id: r.unique_id || r.owner?.unique_id || '',
            title: r.title || '',
            viewer_count: this.getRoomViewerCount(r),
            like_count: r.like_count || r.stats?.like_count || 0,
            is_live: r.is_live !== false
        }));

        if (roomSummaries.length > 0) {
            try {
                const promptAiSearch = `
Dưới đây là danh sách ${roomSummaries.length} phiên Livestream hiện có:
${JSON.stringify(roomSummaries, null, 2)}

YÊU CẦU / CÂU HỎI CỦA NGUỜI DÙNG: "${text}"

Nhiệm vụ của bạn:
1. Phân tích yêu cầu tìm kiếm/lọc của người dùng (theo tên streamer, từ khóa tiêu đề, lượt mắt xem, lượt thích, trạng thái live...).
2. Xác định các "id" phiên livestream khớp nhất với yêu cầu.
3. Tự động nghĩ ra 3-4 câu hỏi hoặc prompt gợi ý tiếp theo (suggestions) có liên quan đến các phòng live vừa tìm được.
4. Trả về kết quả dưới dạng JSON duy nhất (không bọc trong \`\`\`json):
{
  "matched_ids": ["id1", "id2"],
  "explanation": "Nội dung phản hồi trả lời bằng HTML sạch sẽ ngắn gọn giải thích kết quả tìm kiếm/lọc.",
  "suggestions": ["Gợi ý tiếp theo 1 do AI tự nghĩ ra", "Gợi ý tiếp theo 2...", "Gợi ý tiếp theo 3..."]
}
`.trim();

                const aiRes: any = await this._genaiService.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: promptAiSearch }] }],
                    config: {
                        systemInstruction: 'Bạn là Trợ lý AI tìm kiếm và lọc danh sách Livestream thông minh. Phản hồi JSON chính xác.'
                    }
                });

                const rawText = aiRes?.text || aiRes?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const cleanJson = rawText.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(cleanJson);

                if (parsed && parsed.explanation) {
                    let htmlExp = this.formatAiResponse(parsed.explanation);
                    htmlExp = this.enhanceClickableRoomLinks(htmlExp);
                    loadingMsg.content = htmlExp;
                } else {
                    loadingMsg.content = `Đã tìm thấy các phiên livestream phù hợp với yêu cầu của bạn.`;
                }

                if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
                    (loadingMsg as any).followUpPrompts = parsed.suggestions;
                } else {
                    this._genaiService.generateFollowUpPrompts(text, parsed?.explanation || '').then(prompts => {
                        if (prompts && prompts.length > 0) {
                            (loadingMsg as any).followUpPrompts = prompts;
                            this.cd.markForCheck();
                        }
                    });
                }

                this.cd.markForCheck();
                this.scrollToBottom();
                return;
            } catch (aiErr) {
                console.warn('[AI Smart Search fallback]:', aiErr);
            }
        }

        // 2. Chế độ AI trả lời thông thường nếu không phải câu lệnh lọc (kèm theo ngữ cảnh Profiles nếu có tag @)
        try {
            let personaContext = '';
            const mentioned = this.runningProfiles.filter(p => {
                const pName = p.name || '';
                const alias = p.persona?.alias || '';
                return text.includes(`@${pName.replace(/\s+/g, '_')}`) || 
                       text.includes(`@${pName}`) || 
                       (alias && (text.includes(`@${alias.replace(/\s+/g, '_')}`) || text.includes(`@${alias}`)));
            });
            if (mentioned.length > 0) {
                personaContext = `\n\n[DANH SÁCH PROFILES & PERSONA ĐƯỢC GẮN THẺ TRONG YÊU CẦU]:\n` + 
                    mentioned.map(p => `- Profile: ${p.name} | Tên hiển thị/Alias: ${p.persona?.alias || p.name} | Vai trò: ${p.persona?.role || 'Người xem'} | Phong cách: ${p.persona?.style || 'Tự nhiên'} | Giới tính: ${p.persona?.gender || 'Ẩn'}`).join('\n') +
                    `\nHãy phân công và viết các câu comment/kịch bản tương tác sinh động, đúng phong cách và vai trò của từng profile trên.`;
            }

            const promptForAi = `
YÊU CẦU CỦA NGUỜI DÙNG: "${text}"${personaContext}

Nhiệm vụ của bạn:
1. Trả lời câu hỏi hoặc xây dựng kịch bản/nội dung theo yêu cầu bằng HTML sạch sẽ, sinh động, chuẩn phong cách.
2. Đánh giá xem câu trả lời có chứa tác vụ/kế hoạch cần người dùng Xác nhận (Confirm) trước khi chạy hay không ("need_confirm": true/false).
3. TỰ ĐỘNG NGHĨ RA 3-4 câu hỏi hoặc prompt gợi ý tiếp theo (suggestions) có tính liên kết chặt chẽ nhất với câu trả lời vừa rồi để người dùng có thể bấm hỏi tiếp.
4. Trả về ĐÚNG định dạng JSON duy nhất (không bọc trong code block markdown):
{
  "reply": "Nội dung phản hồi chi tiết bằng HTML sạch sẽ...",
  "need_confirm": false,
  "confirm_details": {
    "action": "Tên tác vụ nếu cần confirm",
    "description": "Mô tả tác vụ"
  },
  "suggestions": [
    "Emoji Gợi ý 1 do AI tự nghĩ ra theo ngữ cảnh",
    "Emoji Gợi ý 2 do AI tự nghĩ ra theo ngữ cảnh",
    "Emoji Gợi ý 3 do AI tự nghĩ ra theo ngữ cảnh"
  ]
}
`.trim();

            const response: any = await this._genaiService.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: promptForAi }] }],
                config: {
                    systemInstruction: `Bạn là Trợ lý phân tích chuyên nghiệp hỗ trợ xây dựng kịch bản livestream, phân tích video và tự động hóa tương tác MXH. Phản hồi định dạng JSON sạch sẽ, không ghi chữ AI Agent hay sontinh.type.vn.`
                }
            });

            const rawText = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanJson = rawText.replace(/```json|```/g, '').trim();
            let parsedData: any = null;
            try {
                if (cleanJson.startsWith('{') && cleanJson.endsWith('}')) {
                    parsedData = JSON.parse(cleanJson);
                }
            } catch (e) {}

            if (parsedData && parsedData.reply) {
                let formatted = this.formatAiResponse(parsedData.reply);
                formatted = this.enhanceClickableRoomLinks(formatted);
                loadingMsg.content = formatted;

                if (parsedData.need_confirm && parsedData.confirm_details) {
                    (loadingMsg as any).confirmAction = {
                        actionType: 'script_execution',
                        profiles: mentioned.map(p => p.name || p.profile),
                        status: 'pending',
                        title: parsedData.confirm_details.action || 'Xác nhận hành động',
                        description: parsedData.confirm_details.description || ''
                    };
                }

                if (Array.isArray(parsedData.suggestions) && parsedData.suggestions.length > 0) {
                    (loadingMsg as any).followUpPrompts = parsedData.suggestions;
                } else {
                    this._genaiService.generateFollowUpPrompts(text, parsedData.reply).then(prompts => {
                        if (prompts && prompts.length > 0) {
                            (loadingMsg as any).followUpPrompts = prompts;
                            this.cd.markForCheck();
                        }
                    });
                }
            } else {
                const replyText = rawText || 'Đã xử lý xong yêu cầu của bạn.';
                let formatted = this.formatAiResponse(replyText);
                formatted = this.enhanceClickableRoomLinks(formatted);
                loadingMsg.content = formatted;

                this._genaiService.generateFollowUpPrompts(text, replyText).then(prompts => {
                    if (prompts && prompts.length > 0) {
                        (loadingMsg as any).followUpPrompts = prompts;
                        this.cd.markForCheck();
                    }
                });
            }
        } catch (err: any) {
            console.error('Lỗi khi gọi Trợ lý phân tích:', err);
            loadingMsg.content = `Không thể kết nối tới Trợ lý phân tích: ${err?.message || 'Đã có lỗi xảy ra'}`;
        }
        this.cd.markForCheck();
        this.scrollToBottom();
    }

    onChatBubbleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target) return;

        // BẮT BUỘC: Chỉ xử lý khi người dùng click TRỰC TIẾP vào thẻ liên kết phiên livestream (có avatar/badge)
        const clickableEl = target.closest('[data-room-id], [data-room-nick], .room-select-link') as HTMLElement;
        if (!clickableEl) return; // Bấm đại ra ngoài bong bóng chat -> Không thực hiện chọn phòng!

        event.preventDefault();
        event.stopPropagation();

        const roomId = clickableEl.getAttribute('data-room-id') || clickableEl.dataset.roomId;
        const roomNick = clickableEl.getAttribute('data-room-nick') || clickableEl.dataset.roomNick;

        if (!this.rooms || !this.rooms.length) return;

        const targetRoom = this.rooms.find(r => {
            const keys = this.getRoomKeys(r);
            if (roomId && keys.includes(String(roomId))) return true;
            if (roomNick && keys.includes(String(roomNick))) return true;
            return false;
        });

        if (targetRoom) {
            this.selectRoom(targetRoom);
        }
    }

    enhanceClickableRoomLinks(htmlContent: string): string {
        if (!htmlContent || !this.rooms || this.rooms.length === 0) return htmlContent;

        let result = htmlContent;
        for (const room of this.rooms) {
            const rId = String(room.id || room.room_id || room.unique_id || '');
            const rNick = String(room.nickname || room.owner?.nickname || '').replace(/^@/, '');
            const rAvatar = room['cover']?.['url_list']?.[0] || 
                            room['owner']?.['avatar_thumb']?.['url_list']?.[0] || 
                            room['avatar_thumb'] || 
                            'assets/images/apps/chat/avatar.png';

            // 1. Tự động bọc link cho Room ID
            if (rId && rId.length > 5) {
                const idRegex = new RegExp(`(?<!data-room-id=["'][^"']*)\\b(${this.escapeRegExp(rId)})\\b`, 'gi');
                result = result.replace(idRegex, `<a data-room-id="${rId}" class="room-select-link font-bold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 shadow-2xs">$1</a>`);
            }

            // 2. Tự động bọc link có đính kèm ảnh Avatar nhỏ cho Nickname Shop
            if (rNick && rNick.length > 1) {
                const nickRegex = new RegExp(`(?<!data-room-id=["'][^"']*)\\b@?(${this.escapeRegExp(rNick)})\\b`, 'gi');
                const avatarBadge = `<a data-room-id="${rId}" data-room-nick="${rNick}" class="room-select-link inline-flex items-center gap-1.5 font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 shadow-2xs transition-all select-none align-middle my-0.5"><img src="${rAvatar}" class="w-4 h-4 rounded-full object-cover border border-teal-300 pointer-events-none" /><span>@$1</span></a>`;
                result = result.replace(nickRegex, avatarBadge);
            }
        }
        return result;
    }

    escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    selectedRoom: any = null;

    loadAnalysisHistoryForRoom(room: any): void {
        if (!room) return;
        const keys = this.getRoomKeys(room);
        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const roomId = String(room.id || room.room_id || room.unique_id || nickname || '');
        const dateStr = new Date().toISOString().split('T')[0];
        const ipc = this.getIpcRenderer();

        const handleRecords = (records: any[]) => {
            if (!records || !Array.isArray(records) || records.length === 0) return false;
            const matched = records.filter(r => {
                if (!r) return false;
                const rId = String(r.room_id || '');
                const rNick = String(r.nickname || '');
                return keys.some(k => k === rId || k === rNick);
            });
            const finalItems = matched.length > 0 ? matched : records;
            this.appendHistoryToChat(finalItems, nickname);
            return true;
        };

        // Gọi duy nhất Electron IPC SQLite (thư mục Documents/ai.type/data/tiktok)
        if (ipc && ipc.invoke) {
            ipc.invoke('db-tiktok-list', { room_id: roomId, nickname: nickname, date_str: dateStr })
                .then((res: any) => {
                    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                        handleRecords(res.data);
                    } else {
                        ipc.invoke('db-tiktok-list', { room_id: roomId, nickname: nickname })
                            .then((resAll: any) => {
                                if (resAll && resAll.success && Array.isArray(resAll.data) && resAll.data.length > 0) {
                                    handleRecords(resAll.data);
                                }
                            }).catch(() => {});
                    }
                }).catch((err: any) => console.warn('[SQLite Load Error]:', err));
        }
    }

    autoLoadInitialHistory(): void {
        const ipc = this.getIpcRenderer();
        if (ipc && ipc.invoke) {
            ipc.invoke('db-tiktok-list', {})
                .then((res: any) => {
                    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                        this.appendHistoryToChat(res.data, 'Streamer');
                    }
                }).catch(() => {});
        }
    }

    @ViewChild('chatScrollContainer', { static: false }) chatScrollContainer?: ElementRef<HTMLDivElement>;
    private isUserScrolledUp = false;
    private isLoadingOlderHistory = false;

    scrollToBottom(force: boolean = false): void {
        try {
            setTimeout(() => {
                if (this.chatScrollContainer && this.chatScrollContainer.nativeElement) {
                    const el = this.chatScrollContainer.nativeElement;
                    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
                    if (force || isNearBottom || !this.isUserScrolledUp) {
                        el.scrollTop = el.scrollHeight;
                    }
                }
            }, 80);
        } catch (err) {
            console.warn('[Scroll Error]:', err);
        }
    }

    onChatScroll(event: Event): void {
        const el = event.target as HTMLElement;
        if (!el) return;

        const isAtTop = el.scrollTop <= 50;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        this.isUserScrolledUp = !isNearBottom;

        if (isAtTop && !this.isLoadingOlderHistory) {
            this.loadOlderHistory3Days();
        }
    }

    threeDaysAgoTimestamp(): number {
        const d = new Date();
        d.setDate(d.getDate() - 3);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    getThreeDaysDateStrings(): string[] {
        const dates: string[] = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    }

    loadOlderHistory3Days(): void {
        if (this.isLoadingOlderHistory) return;
        this.isLoadingOlderHistory = true;

        const targetRoom = this.selectedRoom || (this.rooms && this.rooms.length > 0 ? this.rooms[0] : null);
        const keys = targetRoom ? this.getRoomKeys(targetRoom) : [];
        const nickname = targetRoom ? (targetRoom.nickname || targetRoom.owner?.nickname || 'Streamer') : 'Streamer';
        const minTimestamp = this.threeDaysAgoTimestamp();
        const validDates = this.getThreeDaysDateStrings();
        const ipc = this.getIpcRenderer();

        const processOlderRecords = (records: any[]) => {
            if (!records || !Array.isArray(records) || records.length === 0) {
                this.isLoadingOlderHistory = false;
                return;
            }

            const filtered = records.filter(r => {
                if (!r) return false;
                const ts = r.timestamp || (r.id ? Number(r.id) : 0);
                const dStr = r.date_str || '';
                const isWithin3Days = (ts >= minTimestamp) || validDates.includes(dStr);

                if (keys.length > 0) {
                    const rId = String(r.room_id || '');
                    const rNick = String(r.nickname || '');
                    return isWithin3Days && (keys.some(k => k === rId || k === rNick) || !r.room_id);
                }
                return isWithin3Days;
            });

            if (filtered.length === 0) {
                this.isLoadingOlderHistory = false;
                return;
            }

            const sorted = [...filtered].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const newEntries: { role: 'assistant'; content: string }[] = [];

            for (const rec of sorted) {
                const textContent = rec.analysis_text || '';
                const exists = this.chatMessages.some(m => m.content.includes(textContent.substring(0, 40)));
                if (!exists) {
                    const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleString('vi-VN') : (rec.date_str || 'Cũ');
                    newEntries.push({
                        role: 'assistant',
                        content: `<div><b>[${timeStr}] Phân tích lịch sử (3 ngày qua) @${nickname}:</b></div><div class="mt-1">${textContent}</div>`
                    });
                }
            }

            if (newEntries.length > 0) {
                this.chatMessages = [...newEntries, ...this.chatMessages];
                this.cd.markForCheck();
                this.toastr.info(`Đã nạp thêm ${newEntries.length} phân tích cũ trong 3 ngày gần nhất`);
            }

            setTimeout(() => {
                this.isLoadingOlderHistory = false;
            }, 1000);
        };

        if (ipc && ipc.invoke) {
            ipc.invoke('db-tiktok-list', {})
                .then((res: any) => {
                    if (res && res.success && Array.isArray(res.data)) {
                        processOlderRecords(res.data);
                    } else {
                        this.isLoadingOlderHistory = false;
                    }
                }).catch(() => { this.isLoadingOlderHistory = false; });
        } else {
            this.isLoadingOlderHistory = false;
        }
    }

    appendHistoryToChat(records: any[], nickname: string): void {
        if (!records || !records.length) return;
        const clearedAt = Number(localStorage.getItem('tiktok_chat_cleared_at') || 0);

        // Lọc bỏ tất cả các bản ghi phát sinh TRƯỚC mốc thời gian người dùng đã bấm Xóa
        const validRecords = records.filter(r => {
            const ts = r.timestamp || (r.id ? Number(r.id) : 0);
            return !clearedAt || ts > clearedAt;
        });

        if (!validRecords.length) return;

        // Sắp xếp theo thứ tự thời gian tăng dần và lấy các bản ghi lịch sử từ SQLite
        const items = [...validRecords].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-5);
        let addedAny = false;

        for (const rec of items) {
            const textContent = rec.analysis_text || '';
            const exists = this.chatMessages.some(m => m.content.includes(textContent.substring(0, 40)));
            if (!exists) {
                const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString('vi-VN') : '';
                this.chatMessages.push({
                    role: 'assistant',
                    content: `<div><b>[${timeStr || 'Lịch sử'}] Lịch sử phân tích luồng @${nickname} từ Database:</b></div><div class="mt-1">${textContent}</div>`
                });
                addedAny = true;
            }
        }

        // Chèn 1 đường ngăn cách hr sang trọng ở cuối đoạn lịch sử cũ
        if (addedAny) {
            const hasDivider = this.chatMessages.some(m => m.role === 'divider');
            if (!hasDivider) {
                this.chatMessages.push({
                    role: 'divider',
                    content: `
                        <div class="my-4 flex items-center gap-3 select-none w-full">
                            <div class="h-[1px] flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"></div>
                            <span class="text-xs font-medium text-gray-500 tracking-wider uppercase px-3.5 py-1 rounded-full bg-gray-100/90 border border-gray-200 shadow-2xs">
                                Lịch sử phân tích cũ &nbsp;•&nbsp; Phân tích trực tiếp mới
                            </span>
                            <div class="h-[1px] flex-1 bg-gradient-to-r from-gray-300 via-gray-300 to-transparent"></div>
                        </div>
                    `.trim()
                });
            }
        }

        this.cd.markForCheck();
        this.scrollToBottom(true);
    }

    selectRoom(room: any): void {
        if (!room) return;
        this.rooms.forEach(r => r.is_selected = false);
        room.is_selected = true;
        this.selectedRoom = room;

        // Đưa video được chọn lên đầu danh sách
        this.rooms = [room, ...this.rooms.filter(r => r !== room)];
        this.rebuildGridRows();

        this.toastr.info(`Đã chọn & đưa Livestream của @${room.nickname || 'Tiktoker'} lên đầu danh sách`);

        // Tự động đọc lịch sử phân tích từ tiktok.sqlite ra khung chat
        this.loadAnalysisHistoryForRoom(room);

        this.cd.markForCheck();
    }

    sendQuickAction(chip: any): void {
        if (chip.action === 'like') {
            this.generateLike();
        } else if (chip.action === 'comment') {
            this.generateComment();
        } else if (chip.action === 'lowest_price' || chip.action === 'buy') {
            this.generateLowestPrice();
        } else if (chip.action === 'analyze') {
            this.analyzeSelectedRoom();
        } else if (chip.action === 'stop_analyze') {
            if (this.selectedRoom) {
                this.stopContinuousAnalysis(this.selectedRoom);
            } else if (this.rooms) {
                const activeRoom = this.rooms.find(r => r.is_analyzing);
                if (activeRoom) this.stopContinuousAnalysis(activeRoom);
            }
        } else {
            this.chatInput = chip.label;
            this.sendChatMessage();
        }
    }

    generateLowestPrice(roomTarget?: any): void {
        const room = roomTarget || this.selectedRoom || (this.rooms && this.rooms.length > 0 ? this.rooms[0] : null);
        if (!room) {
            this.toastr.warning('Vui lòng chọn 1 phiên Livestream để tìm giá thấp nhất.');
            return;
        }

        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const title = room.title || 'Sản phẩm trong phiên Live';
        this.chatInput = `Hãy tìm và so sánh giá để đề xuất mức giá thấp nhất cũng như các mã giảm giá ưu đãi tốt nhất cho sản phẩm của shop @${nickname} trong phiên livestream: "${title}"`;
        this.sendChatMessage();
    }

    private analysisIntervals = new Map<string, any>();

    startContinuousAnalysis(room: any): void {
        if (!room) return;
        this.selectRoom(room);
        room.is_analyzing = true;

        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const roomId = String(room.id || room.unique_id || nickname);

        // Đánh dấu tất cả keys của phòng này vào bộ nhớ phân tích bền vững
        const keys = this.getRoomKeys(room);
        keys.forEach(k => this.analyzingRoomIds.add(k));

        // Giữ luồng phát video liên tục
        room._hovering = true;
        this.cd.markForCheck();

        this.toastr.success(`Đã bật Phân tích Realtime cho @${nickname}`);

        this.chatMessages.push({
            role: 'user',
            content: `<b>Bắt đầu phân tích trực tiếp:</b> @${nickname}`
        });

        const loadingMsg: { role: 'user' | 'assistant'; content: string } = {
            role: 'assistant',
            content: `<b>Trợ lý phân tích</b> đang duy trì phát luồng video liên tục và phân tích dữ liệu trực tiếp...`
        };
        this.chatMessages.push(loadingMsg);
        this.cd.markForCheck();

        // Chạy phân tích bước đầu tiên
        this.runStreamAnalysisStep(room, loadingMsg);

        // Xóa các interval cũ nếu có
        keys.forEach(k => {
            if (this.analysisIntervals.has(k)) {
                clearInterval(this.analysisIntervals.get(k));
            }
        });
        if (this.analysisIntervals.has(roomId)) {
            clearInterval(this.analysisIntervals.get(roomId));
        }

        const intervalId = setInterval(() => {
            const isStillActive = room.is_analyzing || keys.some(k => this.analyzingRoomIds.has(k));
            if (!isStillActive || room.is_live === false) {
                this.stopContinuousAnalysis(room);
                return;
            }
            // Đảm bảo trạng thái phân tích & video phát liên tục không bị ngắt
            room.is_analyzing = true;
            room._hovering = true;
            this.runStreamAnalysisStep(room);
        }, 15000);

        keys.forEach(k => this.analysisIntervals.set(k, intervalId));
        this.analysisIntervals.set(roomId, intervalId);
    }

    async runStreamAnalysisStep(room: any, targetMsg?: { role: 'user' | 'assistant'; content: string }): Promise<void> {
        // Tự động cập nhật số mắt xem mới nhất từ API crawler trước khi phân tích
        try {
            const freshRes: any = await firstValueFrom(this.listLiveStream$());
            if (freshRes?.rooms && freshRes.rooms.length > 0) {
                this.updateRoomsList(freshRes.rooms);
            }
        } catch (e) {
            console.warn('[Stream Analysis] Không thể cập nhật mắt xem trước khi phân tích:', e);
        }

        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const title = room.title || 'Phiên phát trực tiếp';
        const viewers = this.getRoomViewerCount(room);
        const hlsUrl = this.pickHlsUrlFromRoom(room) || '';
        const timeNow = new Date().toLocaleTimeString('vi-VN');
        const keys = this.getRoomKeys(room);

        // Tính toán biến động số người xem so với chu kỳ trước
        const prevViewers = room._prev_viewer_count || viewers;
        const diff = viewers - prevViewers;
        room._prev_viewer_count = viewers;

        let trendDesc = 'Đang giữ mức ổn định';
        if (diff > 0) trendDesc = `Tăng +${diff} mắt xem (🔥 Khán giả đang tập trung)`;
        else if (diff < 0) trendDesc = `Giảm ${diff} mắt xem (📉 Cần đẩy thêm tương tác)`;

        const promptText = `
[THỜI GIAN REALTIME: ${timeNow}]
Phân tích cập nhật luồng phát trực tiếp của @${nickname}:
- Tiêu đề: ${title}
- Mắt xem thực tế hiện tại: ${viewers} lượt xem (${trendDesc})
- Luồng HLS: ${hlsUrl || 'N/A'}

Hãy cập nhật kết quả phân tích theo thời gian thực:
1. Tóm tắt diễn biến kịch bản vừa diễn ra trong phiên live.
2. Phân tích chi tiết biến động lượt mắt xem (${viewers} mắt - ${trendDesc}) và tâm lý/tương tác khán giả.
3. Đề xuất 2 câu comment Seeding cực hay và phù hợp ngay thời điểm này.
        `.trim();

        try {
            const response: any = await this._genaiService.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                config: {
                    systemInstruction: `Bạn là Trợ lý phân tích duy trì phân tích luồng Livestream liên tục. Định dạng HTML thuần cực kỳ gọn gàng, tuyệt đối KHÔNG bao bọc bằng mã markdown (\`\`\`html), không khoảng cách dòng thưa mét, không ghi chữ AI Agent hay sontinh.type.vn, báo cáo rõ mốc thời gian [${timeNow}].`
                }
            });

            // KIỂM TRA LẠI TRẠNG THÁI: Nếu người dùng đã nhấn "Dừng phân tích" trong khi đang gọi API -> Bỏ qua kết quả này
            const isStillActive = room.is_analyzing || keys.some(k => this.analyzingRoomIds.has(k));
            if (!isStillActive) {
                console.log(`[Stream Analysis] Bỏ qua kết quả async vì người dùng đã nhấn Dừng phân tích @${nickname}`);
                return;
            }

            const replyText = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || 'Đã phân tích luồng thành công.';
            const formattedContent = this.formatAiResponse(replyText);

            // Lưu dữ liệu phân tích vào tiktok.sqlite
            this.saveAnalysisToSqlite(room, formattedContent);

            if (targetMsg) {
                targetMsg.content = formattedContent;
            } else {
                this.chatMessages.push({
                    role: 'assistant',
                    content: `<div><b>[${timeNow}] Cập nhật luồng @${nickname}:</b></div><div class="mt-1">${formattedContent}</div>`
                });
            }
        } catch (err: any) {
            console.error('Lỗi phân tích stream:', err);
            const isStillActive = room.is_analyzing || keys.some(k => this.analyzingRoomIds.has(k));
            if (targetMsg && isStillActive) {
                targetMsg.content = `Tạm thời mất kết nối Trợ lý phân tích: ${err?.message || 'Lỗi mạng'}`;
            }
        }
        this.cd.markForCheck();
        this.scrollToBottom();
    }

    stopContinuousAnalysis(room: any): void {
        if (!room) return;
        room.is_analyzing = false;
        room._hovering = false;
        const nickname = room.nickname || room.owner?.nickname || 'Streamer';
        const keys = this.getRoomKeys(room);

        // Xóa tất cả keys khỏi bộ nhớ phân tích và hủy tất cả interval
        keys.forEach(k => {
            this.analyzingRoomIds.delete(k);
            if (this.analysisIntervals.has(k)) {
                clearInterval(this.analysisIntervals.get(k));
                this.analysisIntervals.delete(k);
            }
        });

        const roomId = String(room.id || room.unique_id || nickname);
        if (this.analysisIntervals.has(roomId)) {
            clearInterval(this.analysisIntervals.get(roomId));
            this.analysisIntervals.delete(roomId);
        }

        this.toastr.warning(`Đã tắt phân tích trực tiếp cho @${nickname}`);
        this.chatMessages.push({
            role: 'divider',
            content: `
                <div class="my-4 flex items-center gap-3 select-none w-full">
                    <div class="h-[1px] flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"></div>
                    <span class="text-xs font-medium text-gray-500 tracking-wider uppercase px-3.5 py-1 rounded-full bg-gray-100/90 border border-gray-200 shadow-2xs">
                        Đã dừng phân tích luồng trực tiếp của @${nickname}
                    </span>
                    <div class="h-[1px] flex-1 bg-gradient-to-r from-gray-300 via-gray-300 to-transparent"></div>
                </div>
            `.trim()
        });
        this.cd.markForCheck();
        this.scrollToBottom();
    }



    clearChatMessages(): void {
        if (!this.chatMessages || this.chatMessages.length === 0) {
            this.toastr.info('Khung trò chuyện hiện đang trống.');
            return;
        }

        const confirmation = this._fuseConfirmationService.open({
            title: 'Xóa vĩnh viễn lịch sử trò chuyện',
            message: 'Bạn có chắc chắn muốn xóa vĩnh viễn toàn bộ lịch sử phân tích và tin nhắn trong Database không?',
            icon: { show: true, name: 'feather:trash-2', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Xóa vĩnh viễn', color: 'warn' },
                cancel: { show: true, label: 'Hủy' }
            },
            dismissible: true
        });

        confirmation.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                const clearedAt = Date.now();
                const targetRoom = this.selectedRoom || (this.rooms && this.rooms.length > 0 ? this.rooms[0] : null);
                const roomId = targetRoom ? String(targetRoom.id || targetRoom.room_id || targetRoom.unique_id || targetRoom.nickname) : '';

                // 1. Gửi IPC xóa vĩnh viễn trong SQLite Database
                const ipc = this.getIpcRenderer();
                if (ipc && ipc.invoke) {
                    ipc.invoke('db-tiktok-clear', { room_id: roomId }).then(() => {
                        console.log('[SQLite tiktok.sqlite] Đã xóa vĩnh viễn dữ liệu lịch sử phòng:', roomId);
                    }).catch(e => console.warn('[SQLite Clear Error]:', e));
                }

                // 2. Xóa trong LocalStorage dự phòng & Lưu mốc thời gian xóa
                try {
                    const dateStr = new Date().toISOString().split('T')[0];
                    localStorage.removeItem(`tiktok_sqlite_db_${dateStr}`);
                    localStorage.removeItem(`tiktok_sqlite_db_all`);
                    localStorage.setItem('tiktok_chat_cleared_at', String(clearedAt));
                } catch (e) {
                    console.warn('[LocalStorage Clear Error]:', e);
                }

                this.chatMessages = [];
                this.toastr.success('Đã xóa vĩnh viễn lịch sử trò chuyện khỏi Database.');
                this.cd.markForCheck();
            }
        });
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

    protected _unsubscribeAll: Subject<any> = new Subject<any>();

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
        protected titleService: Title,
        protected _userService: UserService,
        protected _mxhautoService: MXHAutoService,
        protected toastr: ToastrService,
        protected _fuseConfigService: FuseConfigService,
        protected _fuseConfirmationService: FuseConfirmationService,
        protected router: Router,
        protected cd: ChangeDetectorRef,
        protected zone: NgZone,
        protected _matDialog: MatDialog,
        protected _n8nService: N8nService, // Inject N8nService
        protected multiAccountService: MultiAccountService,
        protected _genaiService: GenaiService
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
        this.autoLoadInitialHistory();
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
            profiles_root: this.getProfilesRoot(), host: '127.0.0.1', verify: true, filter: "running", include_accounts: true, platform: this.platform || 'tiktok', username: this.user.name
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

    getOperaPath(): string {
        const stored = localStorage.getItem('opera_executable_path');
        if (stored && stored.trim()) return stored.trim();
        return '';
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

    get displayedRooms(): any[] {
        if (!this.rooms || !this.rooms.length) return [];

        // Chỉ lọc danh sách khi người dùng gửi câu hỏi và AI đã trả về danh sách lọc (aiFilteredRoomIds)
        if (this.aiFilteredRoomIds && this.aiFilteredRoomIds.size > 0) {
            const filtered = this.rooms.filter(room => {
                const keys = this.getRoomKeys(room);
                return keys.some(k => this.aiFilteredRoomIds!.has(k));
            });
            if (filtered.length > 0) return filtered;
        }

        return this.rooms;
    }

    onChatInputSearch(): void {
        // Không tự động lọc khi người dùng đang gõ
    }

    rebuildGridRows(): void {
        this.detectGrid();
        const out: any[] = [];
        const activeRooms = this.displayedRooms;
        if (activeRooms && activeRooms.length > 0) {
            for (let i = 0; i < activeRooms.length; i += this.gridSize) {
                out.push({ rooms: activeRooms.slice(i, i + this.gridSize) });
            }
        }
        this.gridRows = out;
        this.cd.markForCheck();
    }

    private analyzingRoomIds = new Set<string>();

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

            // Bảo toàn trạng thái phân tích, selected, hover và trạng thái live cũ (nếu rê chuột kiểm tra mà hỏng link)
            const wasAnalyzing = Boolean(room.is_analyzing || keys.some(k => this.analyzingRoomIds.has(k)));
            const wasSelected = Boolean(room.is_selected || this.selectedRoom === room || (this.selectedRoom && keys.some(k => this.getRoomKeys(this.selectedRoom).includes(k))));
            const wasHovering = Boolean(room._hovering || wasAnalyzing);
            const currentLiveStatus = (room.is_live === false) ? false : true;

            if (wasSelected) {
                this.selectedRoom = room;
            }

            if (matchedKey) {
                const freshData = newRoomsMap.get(matchedKey);
                const freshCount = this.getRoomViewerCount(freshData);
                Object.assign(room, freshData, {
                    user_count: freshCount > 0 ? freshCount : this.getRoomViewerCount(room),
                    is_live: currentLiveStatus,
                    miss_count: 0,
                    is_analyzing: wasAnalyzing,
                    is_selected: wasSelected,
                    _hovering: wasHovering
                });
            } else {
                room.miss_count = (room.miss_count || 0) + 1;
                room.is_live = currentLiveStatus;
                room.is_analyzing = wasAnalyzing;
                room.is_selected = wasSelected;
                room._hovering = wasHovering;
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
            if (aSel !== bSel) return bSel - aSel;
            return (b.user_count || 0) - (a.user_count || 0);
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
        if (!hlsUrl) {
            // Rê chuột vào mà không bắt được link livestream -> Đổi trạng thái là ĐÃ TẮT
            room.is_live = false;
            room._hovering = false;
            this.cd.markForCheck();
            return;
        }

        // Bắt được link -> Giữ trạng thái LIVE
        room.is_live = true;
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
