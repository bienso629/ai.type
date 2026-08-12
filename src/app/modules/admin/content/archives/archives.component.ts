import {
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    TemplateRef,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
    ColumnMode,
    DatatableComponent,
    SelectionType,
} from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/_services/crawl';
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { ForumService } from 'app/_services/forum';
import { BlogService } from 'app/_services/blog';
import { FormControl } from '@angular/forms';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { MatDialog } from '@angular/material/dialog';
import { GenaiService } from 'app/genai.service';
import { ArticlePasswordDialog } from '../ai-writer/tools/article-password-dialog';
import * as CryptoJS from 'crypto-js';

@Component({
    selector: 'archives',
    styleUrls: ['./archives.component.scss'],
    templateUrl: './archives.component.html',
    providers: [CrawlService, ForumService, BlogService],
    encapsulation: ViewEncapsulation.None,
})
export class AIArchiveComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    rows = [];
    totalElements: number;
    actualTotalElements: number = 0;
    get realTotalCount(): number {
        const realDocs = (this.masterLoadedRows || []).filter((doc: any) => doc && !doc.isGroupHeader && doc.uuid);
        if (this.selectedCollections && this.selectedCollections.length > 0) {
            return realDocs.length;
        }
        if (this.keyword && this.keyword.toString().trim().length > 0) {
            return realDocs.length;
        }
        return this.actualTotalElements > 0 ? this.actualTotalElements : realDocs.length;
    }
    get selectedCountReal(): number {
        return (this.selected || []).filter(item => item && !item.isGroupHeader && item.uuid).length;
    }
    apiFetchedCount: number = 0;
    pageNumber: number;
    isLoading: boolean = false;
    isGeneratingCollectionScript: boolean = false;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
    dateGroupOptions = ['Tất cả thời gian', 'Hôm nay', 'Hôm qua', '7 ngày qua', '30 ngày qua', 'Cũ hơn'];
    selectedDateGroup: string = 'Tất cả thời gian';
    allRowsBackup: any[] = null;
    masterLoadedRows: any[] = [];
    uuids: any[] = [];
    page: Page = {
        pageNumber: 0,
        size: 10,
        totalElements: 0,
        totalPages: 0,
    };
    currentBookmark: string = null;

    authors = new FormControl([]);
    selectedToppings = [];
    following_users = [];

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    selectedCollections: any;
    collections: any[] = [];

    @ViewChild('bulkEditDialog') bulkEditDialogTemplate: TemplateRef<any>;
    bulkEditPrompt: string = '';
    bulkEditImageBase64: string = null;
    bulkEditDialogRef: any;
    bulkEditInProgress: boolean = false;
    bulkEditProgress: number = 0;
    bulkEditTotal: number = 0;
    bulkEditStatusText: string = '';

    permissionText2Voice: boolean = false;
    permissionScriptCommentLike: boolean = false;



    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        const validSelected = selected ? selected.filter((item: any) => item && !item.isGroupHeader) : [];
        this.selected.push(...validSelected);
    }

    deleteSelected() {
        if (!this.selected || this.selected.length === 0) return;
        
        this.ensureMultipleUnlocked(this.selected, (unlocked) => {
            if (!unlocked) return;

            const dialogRef = this._fuseConfirmationService.open({
                title: 'Xác nhận xóa',
                message: `Bạn có chắc muốn xóa <b>${this.selected.length}</b> bài viết đã chọn? Hành động này không thể hoàn tác.`,
                icon: {
                    show: true,
                    name: 'heroicons_outline:exclamation',
                    color: 'warn',
                },
                actions: {
                    confirm: {
                        show: true,
                        label: 'Xóa ngay',
                        color: 'warn',
                    },
                    cancel: {
                        show: true,
                        label: 'Hủy',
                    },
                },
                dismissible: true,
            });

            dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                const uuids = this.selected.map((r: any) => r.uuid);
                
                // Lấy chi tiết từng bài viết để lấy _rev, sau đó gán _deleted = true để xóa triệt để khỏi CouchDB
                this.selected.forEach((r: any) => {
                    this._crawlService.detail({ uuid: r.uuid, username: this.user.name })
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({
                            next: (res: any) => {
                                if (res && res.success && res.data) {
                                    const fullDoc = res.data;
                                    const payload = {
                                        ...fullDoc,
                                        uuid: fullDoc.uuid || r.uuid,
                                        username: this.user.name,
                                        _deleted: true,
                                        trash: true,
                                        new_version: -1
                                    };
                                    this._crawlService.archiveUpdate(payload).pipe(takeUntil(this._unsubscribeAll)).subscribe();
                                }
                            }
                        });
                });

                this.toastr.success(`Đã xóa ${uuids.length} bài viết.`);
                        
                // Cập nhật lại UI (xóa khỏi mảng dữ liệu nội bộ)
                this.masterLoadedRows = (this.masterLoadedRows || []).filter((row: any) => row && row.uuid && !uuids.includes(row.uuid));
                this.rows = this.groupRowsWithHeaders(this.masterLoadedRows);
                this.totalElements = this.rows.length;
                
                this.cache = {}; // Reset cache
                this.selected = [];
                this.cd.detectChanges();
                
                // Cập nhật lại selectedCollections để bỏ các bài vừa xóa (nếu đang bật filter)
                if (this.selectedCollections && this.selectedCollections.length > 0) {
                    this.selectedCollections.forEach((col: any) => {
                        if (col.uuid) {
                            if (Array.isArray(col.uuid)) {
                                col.uuid = col.uuid.filter((id: string) => !uuids.includes(id));
                            } else if (uuids.includes(col.uuid)) {
                                col.uuid = null;
                            }
                        }
                    });
                }

                // Gỡ khỏi các bộ sưu tập trên server (nếu có)
                if (this.selectedCollections && this.selectedCollections.length > 0) {
                    this.selectedCollections.forEach((col: any) => {
                        uuids.forEach((id: string) => {
                            this._crawlService.removeCollection({ _id: col._id || col.id, uuid: id, username: this.user.name })
                                .pipe(takeUntil(this._unsubscribeAll))
                                .subscribe();
                        });
                    });
                } else {
                    // Nếu người dùng không chọn cụ thể nhóm nào ở filter, tự tìm nhóm để gỡ
                    uuids.forEach((id: string) => {
                        this._crawlService.nodeInCollection({ uuid: id, username: this.user.name })
                            .pipe(takeUntil(this._unsubscribeAll))
                            .subscribe(res => {
                                if (res && res.success && res.data) {
                                    res.data.forEach((col: any) => {
                                        this._crawlService.removeCollection({ _id: col._id || col.id, uuid: id, username: this.user.name })
                                            .pipe(takeUntil(this._unsubscribeAll))
                                            .subscribe();
                                    });
                                }
                            });
                    });
                }
            }
        });
        });
    }

    // Bulk Edit Logic
    openBulkEditDialog() {
        if (!this.selected || this.selected.length === 0) return;

        this.ensureMultipleUnlocked(this.selected, (unlocked) => {
            if (!unlocked) return;

            this.bulkEditPrompt = '';
            this.bulkEditImageBase64 = null;
            this.bulkEditInProgress = false;
            this.bulkEditProgress = 0;
            this.bulkEditTotal = 0;
            this.bulkEditStatusText = '';
            this.bulkEditDialogRef = this._matDialog.open(this.bulkEditDialogTemplate, {
                width: '600px',
                panelClass: 'custom-dialog-bulk',
                disableClose: false
            });
        });
    }

    onBulkEditImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.bulkEditImageBase64 = e.target.result as string;
            };
            reader.readAsDataURL(file);
        }
    }

    async confirmBulkEdit() {
        this.bulkEditDialogRef.close();
        this.bulkEditInProgress = true;
        this.bulkEditTotal = this.selected.length;
        this.bulkEditProgress = 0;
        
        let successCount = 0;
        let failCount = 0;

        for (let index = 0; index < this.selected.length; index++) {
            const r = this.selected[index];
            try {
                // Lấy chi tiết bài viết
                const res: any = await this._crawlService.detail({ uuid: r.uuid, username: this.user.name }).toPromise();
                if (res && res.success && res.data) {
                    const fullDoc = res.data;
                    
                    // Thêm prompt và ảnh vào block "Gợi ý prompt cho bạn" (source.prompt)
                    if (!fullDoc.source) fullDoc.source = {};
                    if (!fullDoc.source.prompt) fullDoc.source.prompt = [];
                    
                    if (this.bulkEditPrompt) {
                        fullDoc.source.prompt.push(`<p id="source-prompt-${r.uuid}">${this.bulkEditPrompt}</p>`);
                    }
                    if (this.bulkEditImageBase64) {
                        fullDoc.source.prompt.push(`<p id="source-pre-${r.uuid}">Hình ảnh đính kèm: <img src="${this.bulkEditImageBase64}"/></p>`);
                    }

                    // Nếu bài có dàn ý (done), cho AI sửa lại
                    let currentOutline = '';
                    if (fullDoc.done && fullDoc.done.length > 0) {
                        currentOutline = fullDoc.done.join('\n');
                        
                        const promptText = `Bạn là một chuyên gia biên tập và chuẩn hóa nội dung chuẩn SEO Google.
Nhiệm vụ của bạn là xem xét dàn ý/nội dung hiện tại và sửa đổi nó dựa trên yêu cầu sau: "${this.bulkEditPrompt}".

YÊU CẦU QUAN TRỌNG VỀ SEO:
- BẮT BUỘC phải bắt đầu bài viết bằng một đoạn văn mở đầu (thẻ <p>) giới thiệu thật hấp dẫn và tóm tắt nội dung chính. Tuyệt đối KHÔNG bắt đầu ngay bằng thẻ tiêu đề (<h2>, <h3>).
- Giữ hoặc tối ưu hóa cấu trúc Heading (H2, H3) sao cho logic, mỗi Heading phải đi kèm các đoạn văn (<p>) diễn giải chi tiết.

Nội dung hiện tại:
${currentOutline}

Yêu cầu đầu ra:
- Trả về dữ liệu dưới định dạng JSON với key là "done", value là mảng các chuỗi HTML.
Ví dụ:
{
    "done": [
        "<p>Đây là đoạn văn mở đầu siêu chuẩn SEO dẫn dắt vào bài viết...</p>",
        "<h2>Phần 1...</h2><p>Nội dung phần 1...</p>",
        "<h2>Phần 2...</h2><p>Nội dung phần 2...</p>"
    ]
}
Chỉ trả về JSON thuần túy hợp lệ. Không giải thích, không dùng markdown code block thừa.`;

                        const parts: any[] = [{ text: promptText }];

                        if (this.bulkEditImageBase64) {
                            // Extract mimeType and base64 from data URI
                            // e.g., data:image/png;base64,iVBORw0KGgo...
                            const match = this.bulkEditImageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                            if (match && match.length === 3) {
                                parts.push({
                                    inlineData: {
                                        mimeType: match[1],
                                        data: match[2]
                                    }
                                });
                            }
                        }

                        const aiResponse = await this._genaiService.generateContent({
                            model: 'gemini-3.6-flash',
                            contents: [{ role: 'user', parts: parts }],
                        });

                        let responseText = aiResponse.text;
                        if (typeof responseText === 'function') {
                            responseText = (aiResponse as any).text();
                        }
                        
                        try {
                            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.done && Array.isArray(parsed.done)) {
                                    fullDoc.done = parsed.done;
                                } else if (parsed.contents && Array.isArray(parsed.contents)) {
                                    fullDoc.done = parsed.contents;
                                } else {
                                    throw new Error('JSON không chứa mảng "done" hoặc "contents"');
                                }
                            } else {
                                throw new Error('Không tìm thấy JSON hợp lệ trong phản hồi');
                            }
                        } catch (e) {
                            console.error('Lỗi parse JSON AI:', e, responseText);
                            this.toastr.error('Lỗi phân tích cú pháp AI: ' + e.message);
                            failCount++;
                            this.bulkEditProgress++;
                            continue;
                        }
                    }

                    // Tạo payload chuẩn xác như ai-writer để tránh lỗi "Not found" từ Backend
                    const payload = {
                        uuid: fullDoc.uuid || r.uuid,
                        _rev: fullDoc._rev,
                        title: fullDoc.title,
                        url: fullDoc.url,
                        source: fullDoc.source,
                        done: fullDoc.done,
                        trash: fullDoc.trash || false,
                        seo: fullDoc.seo,
                        arr_keyword: fullDoc.arr_keyword,
                        domain: fullDoc.domain,
                        username: this.user.name,
                        thumbnail: fullDoc.thumbnail,
                        confirm: fullDoc.confirm,
                        createdAt: fullDoc.createdAt,
                        new_version: -1
                    };
                    
                    // Lưu bài viết
                    const updateRes: any = await this._crawlService.archiveUpdate(payload).toPromise();
                    if (updateRes && updateRes.data && updateRes.data.error) {
                        throw new Error(updateRes.data.error);
                    }
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error(error);
                failCount++;
            }
            this.bulkEditProgress++;
        }

        this.bulkEditInProgress = false;
        if (failCount === 0) {
            this.toastr.success(`Đã xử lý xong ${successCount} bài viết.`);
        } else {
            this.toastr.warning(`Đã xử lý xong ${successCount} bài, thất bại ${failCount} bài.`);
        }
    }

    displayCheck(row: any) {
        return row && !row.isGroupHeader && !!row.uuid;
    }

    getRowClass = (row: any) => {
        return {
            'is-group-header': row && row.isGroupHeader
        };
    };

    getRowHeight(row: any) {
        if (!row) {
            return 50;
        }
        if (row.height === undefined) {
            return 50;
        }
        return row.height;
    }

    copy(uuid: string) {
        this.clipboard.copy(
            `${this.config.settings.domain}/#/archive/${this.user.name}/${uuid}`,
        );
        this.toastr.success(`Copy link mã ${uuid} xong.`);
    }

    together(uuid: string, authors: any) {
        const d = new Date();
        let year = d.getFullYear();

        this._crawlService
            .archiveUpdate({
                uuid: uuid,
                authors: authors,
                year: year,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Mã ${uuid} đã mời xong.`);
                    }
                },
                error: () => { },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    getDomainString(row: any): string {
        if (!row) return '';
        const d = row?.source?.wp_domain || row?.domain;
        if (!d) return '';
        if (typeof d === 'string') return d;
        if (typeof d === 'object') {
            return d.domain || d.name || d.url || d.host || '';
        }
        return String(d);
    }

    openWPPost(row: any, wpItem?: any) {
        let link = '';
        let domain = '';
        let postId = '';

        if (wpItem) {
            link = wpItem.link || wpItem.url || wpItem.post_url || wpItem.wp_post_link || wpItem.guid || '';
            domain = wpItem.domain || row?.source?.wp_domain || row?.domain || '';
            postId = wpItem.id || wpItem.wp_post_id || '';
        } else if (row && row.source) {
            link = row.source.wp_post_link || row.source.wp_link || row.source.link || row.source.url || '';
            domain = row.source.wp_domain || row.domain || '';
            postId = row.source.wp_post_id || '';
        }

        if (!link && domain && postId) {
            let formattedDomain = domain.trim();
            if (!formattedDomain.startsWith('http://') && !formattedDomain.startsWith('https://')) {
                formattedDomain = 'https://' + formattedDomain;
            }
            if (formattedDomain.endsWith('/')) {
                formattedDomain = formattedDomain.slice(0, -1);
            }
            link = `${formattedDomain}/?p=${postId}`;
        } else if (!link && domain) {
            let formattedDomain = domain.trim();
            if (!formattedDomain.startsWith('http://') && !formattedDomain.startsWith('https://')) {
                formattedDomain = 'https://' + formattedDomain;
            }
            link = formattedDomain;
        }

        if (link) {
            window.open(link, '_blank');
        }
    }

    hasVideoProject(row: any): boolean {
        if (!row) return false;
        const uuid = typeof row === 'string' ? row : (row.uuid || row._id || row.id);
        if (!uuid) return false;
        if (typeof row === 'object' && (row.has_video || row.hasVideo)) return true;
        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_audio_merger_data_${uuid}`);
        }
        return false;
    }

    hasScriptProject(row: any): boolean {
        if (!row || !row.uuid) return false;
        if (row.has_script) return true;
        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_script_data_${row.uuid}`) || !!this.multiAccountService.getItem(`ai_type_script_merger_data_${row.uuid}`);
        }
        return false;
    }

    disconnectWP(row: any, index: number) {
        if (!row || !row.source) return;

        const dialogRef = this._fuseConfirmationService.open({
            title: 'Hủy kết nối WordPress',
            message: 'Bạn có chắc chắn muốn hủy kết nối đồng bộ WordPress cho bài viết này?',
            icon: { show: true, name: 'heroicons_outline:exclamation', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Hủy kết nối', color: 'warn' },
                cancel: { show: true, label: 'Đóng' }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._crawlService.detail({ uuid: row.uuid, username: this.user.name })
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: (res: any) => {
                            if (res && res.success && res.data) {
                                const fullDoc = res.data;
                                
                                if (!fullDoc.source) fullDoc.source = {};
                                
                                if (index === -1) {
                                    fullDoc.source.wp_post_id = "";
                                    fullDoc.source.wp_post_link = "";
                                } else if (fullDoc.source.wpPosts) {
                                    fullDoc.source.wpPosts.splice(index, 1);
                                    if (fullDoc.source.wpPosts.length === 0) {
                                        fullDoc.source.wpPosts = [];
                                    }
                                }

                                fullDoc.new_version = -1;
                                fullDoc.username = this.user.name;

                                this._crawlService.archiveUpdate(fullDoc).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                                    next: () => {
                                        this.toastr.success('Đã hủy kết nối WordPress thành công.');
                                        
                                        if (index === -1) {
                                            row.source.wp_post_id = "";
                                            row.source.wp_post_link = "";
                                        } else if (row.source.wpPosts) {
                                            row.source.wpPosts.splice(index, 1);
                                            if (row.source.wpPosts.length === 0) {
                                                row.source.wpPosts = [];
                                            }
                                        }
                                        this.cd.markForCheck();
                                    },
                                    error: () => {
                                        this.toastr.error('Có lỗi xảy ra khi hủy kết nối.');
                                    }
                                });
                            } else {
                                this.toastr.error('Không thể lấy thông tin chi tiết bài viết.');
                            }
                        },
                        error: () => {
                            this.toastr.error('Lỗi khi tải dữ liệu bài viết.');
                        }
                    });
            }
        });
    }

    /**
     * Hàm Tìm kiếm Node - Reset toàn bộ dấu mốc bookmark
     */
    searchNode() {
        this.isLoading = false;
        if (this.table) this.table.offset = 0;

        this.selected = [];
        this.currentBookmark = null;
        this.apiFetchedCount = 0;
        this.cachePageSize = 0;
        this.cache = {};
        this.allRowsBackup = null;
        this.masterLoadedRows = [];

        this.cd.markForCheck();

        if (this.uuids.length > 0) {
            // Nếu có keyword khi đang trong Collection thì filter local
            if (this.keyword) {
                this.rows = [...this.rows.filter((item) =>
                    item.title.toLowerCase().includes(this.keyword.toLowerCase()),
                )];

                this.totalElements = this.rows.length;
                this.table.recalculatePages();
                this.cd.markForCheck();
            } else {
                this.onChangeCollection();
            }
        } else {
            this.rows = [];
            this.rows = [...this.rows]; // force update empty state

            const query = {
                username: this.user.name,
                keyword: this.keyword,
                uuids: this.uuids,
                page: this.page,
            };

            this._crawlService.searchTotalArchive(query)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (result: any) => {
                        // Lấy total từ lớp bọc hệ thống
                        let total = result?.data?.total;
                        if (total === undefined) total = result?.data?.data?.total;

                        if (total !== undefined) {
                            this.actualTotalElements = total;
                        } else {
                            // Mặc định từ statistics (khi xóa keyword)
                            let temp = localStorage.getItem('statistics');
                            if (temp && temp !== 'undefined') {
                                try {
                                    const stats = JSON.parse(temp);
                                    this.actualTotalElements = stats['archives'] || 0;
                                } catch (e) {
                                    this.actualTotalElements = 0;
                                }
                            } else {
                                this.actualTotalElements = 0;
                            }
                        }

                        this.setPage({ offset: 0, pageSize: this.page.size, limit: this.page.size, count: this.actualTotalElements });
                    },
                    complete: () => {
                        if (this.table) this.table.recalculatePages();
                        this.cd.markForCheck();
                    }
                });
        }
    }

    /**
     * setPage: Xử lý dữ liệu bọc trong result.data.docs và result.data.bookmark
     */
    setPage(pageInfo: PageInfo) {
        if (!pageInfo.pageSize) pageInfo.pageSize = this.page.size;
        this.pageNumber = pageInfo.offset;
        const rowOffset = pageInfo.offset * pageInfo.pageSize;
        const targetPage = Math.floor(rowOffset / pageInfo.pageSize);

        if (this.isLoading && this.page.pageNumber === targetPage) return;

        this.page = {
            pageNumber: Math.floor(rowOffset / pageInfo.pageSize),
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0,
        };

        // Ngăn chặn việc gọi API khi scroll lên (nếu dữ liệu tại vị trí này đã được nạp)
        if (this.rows && this.rows[rowOffset]) {
            return;
        }
        if (this.cache[this.page.pageNumber]) return;
        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cd.markForCheck();

        const payloadPage = {
            ...this.page
        };

        this._crawlService.archive({
            username: this.user.name,
            keyword: this.keyword,
            uuids: this.uuids,
            page: payloadPage,
            bookmark: this.currentBookmark, // Sử dụng bookmark
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    const start = this.page.pageNumber * this.page.size;
                    const resData = result?.data;
                    if (resData && resData.docs && resData.docs.length > 0) {
                        const docsWithGroup = resData.docs.map((doc: any) => ({
                            ...doc,
                            is_encrypted: this.isRowEncrypted(doc),
                            dateGroup: this.getDateGroup(doc)
                        }));
                        if (!this.masterLoadedRows) this.masterLoadedRows = [];
                        docsWithGroup.forEach((doc: any) => {
                            if (doc && doc.uuid && !this.masterLoadedRows.some((m: any) => m.uuid === doc.uuid)) {
                                this.masterLoadedRows.push(doc);
                            }
                        });
                        this.verifyLoadedRowsEncryption();

                        if (this.selectedDateGroup && this.selectedDateGroup !== 'Tất cả thời gian') {
                            this.applyDateFilter();
                        } else {
                            this.rows = this.groupRowsWithHeaders(this.masterLoadedRows);
                            if (resData.docs.length < this.page.size) {
                                this.totalElements = this.rows.length;
                            } else {
                                this.totalElements = this.rows.length + this.page.size;
                            }
                        }

                        this.apiFetchedCount += resData.docs.length;

                        // Lưu bookmark từ server để dùng cho request tiếp theo
                        this.currentBookmark = resData.bookmark;
                        this.cd.detectChanges();
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        // Nếu mảng rỗng nhưng bookmark thay đổi, tiếp tục gọi ngầm bất đồng bộ (tránh block UI thread)
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        setTimeout(() => { this.setPage(pageInfo); }, 50);
                        return;
                    } else if (resData && resData.docs && resData.docs.length === 0) {
                        // Hết dữ liệu thì chốt cứng totalElements bằng số row đang có
                        if (this.rows) {
                            this.totalElements = this.rows.length;
                            this.rows = [...this.rows]; // Cập nhật lại mảng để ngx-datatable tính lại chiều cao virtual scroll
                        }
                    } else if (!resData || resData.success === false) {
                        // Nếu không lấy được dữ liệu do lỗi, gỡ cache để lần cuộn sau có thể gọi tiếp
                        delete this.cache[this.page.pageNumber];
                    }
                },
                error: (err) => {
                    // Xóa cache khi có lỗi mạng để người dùng cuộn lại thì fetch lại
                    delete this.cache[this.page.pageNumber];
                    this.isLoading = false;
                    this.cd.markForCheck();
                },
                complete: () => {
                    this.isLoading = false;
                    if (this.table) {
                        this.table.recalculatePages();
                        setTimeout(() => {
                            this.table.recalculate();
                            window.dispatchEvent(new Event('resize'));
                        }, 50);
                    }
                    this.cd.markForCheck();
                }
            });
    }

    /**
     * onChangeCollection: Trích xuất đúng UUID từ mảng selectedCollections
    /**
     * onChangeCollection: Trích xuất đúng UUID từ mảng selectedCollections
     */
    onChangeCollection() {
        // 1. Trích xuất tất cả UUID bài viết từ các tập đã chọn
        const rawUuids: string[] = [];
        if (Array.isArray(this.selectedCollections)) {
            for (const item of this.selectedCollections) {
                if (!item) continue;
                const u = item.uuid || item.uuids || item.nodes || item.articles;
                if (Array.isArray(u)) {
                    rawUuids.push(...u.map((x: any) => typeof x === 'string' ? x : (x?.uuid || x?._id || x?.id)));
                } else if (typeof u === 'string' && u.trim()) {
                    rawUuids.push(u.trim());
                }
            }
        } else if (this.selectedCollections) {
            const item = this.selectedCollections;
            const u = item.uuid || item.uuids || item.nodes || item.articles;
            if (Array.isArray(u)) {
                rawUuids.push(...u.map((x: any) => typeof x === 'string' ? x : (x?.uuid || x?._id || x?.id)));
            } else if (typeof u === 'string' && u.trim()) {
                rawUuids.push(u.trim());
            }
        }
        this.uuids = Array.from(new Set(rawUuids)).filter((u: string) => !!u);

        // 2. Reset toàn bộ trạng thái UI, mảng bài viết đã load và mốc phân trang
        this.isLoading = false;
        if (this.table) this.table.offset = 0;
        this.selected = [];
        this.masterLoadedRows = []; // BẮT BUỘC: Reset mảng chứa bài viết gốc để loại bỏ dữ liệu cũ!
        this.allRowsBackup = null;
        this.rows = [];
        this.rows = [...this.rows]; // force empty array update for datatable
        this.currentBookmark = null; // BẮT BUỘC: Bookmark cũ không dùng được cho tập UUIDs mới
        this.apiFetchedCount = 0;
        this.cachePageSize = 0;
        this.cache = {};
        this.cd.markForCheck();

        // 3. Tính toán lại tổng số phần tử (totalElements)
        if (this.uuids.length === 0) {
            // Nếu không chọn collection nào, lấy tổng số từ statistics (Tất cả bài viết)
            let temp = localStorage.getItem('statistics');
            if (temp && temp !== 'undefined') {
                try {
                    const stats = JSON.parse(temp);
                    this.totalElements = stats['archives'] || 0;
                } catch (e) {
                    this.totalElements = 0;
                }
            }

            // Luôn luôn gọi API để đảm bảo tổng số là chính xác
            this._crawlService.searchTotalArchive({
                username: this.user.name,
                keyword: this.keyword,
                uuids: this.uuids,
                page: this.page,
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (res: any) => {
                        let total = res?.data?.total;
                        if (total === undefined) total = res?.data?.data?.total;
                        if (total !== undefined) {
                            this.actualTotalElements = total;
                            this.totalElements = total;
                            this.cd.markForCheck();
                        }
                    }
                });
        } else {
            // Nếu chọn collection, tổng số chính là số lượng UUIDs đã trích xuất
            this.actualTotalElements = this.uuids.length;
            this.totalElements = this.uuids.length;
        }

        // 4. Kích hoạt lấy dữ liệu trang đầu tiên
        this.setPage({
            offset: 0,
            pageSize: this.page.size,
            limit: this.page.size,
            count: this.actualTotalElements,
        });
    }

    following() {
        this._forumService
            .following({
                _uid: this.user.id,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    console.log('following', result);
                    if (
                        result &&
                        result.counts &&
                        result.counts.following > 0
                    ) {
                        this.following_users = result.users;
                        localStorage.following_users = JSON.stringify(this.following_users);
                    }
                },
                error: () => { },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                },
            });
    }

    /**
     * Lấy toàn bộ collection
     */
    collection() {
        this._crawlService
            .collections({
                username: this.user.name,
                page: { size: 100 },
                includeUuid: true
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.collections = result.data;
                    }
                },
                error: () => { },
                complete: () => { },
            });
    }

    onCloseCollection(e: any) {
        console.log('onClose', e);
    }

    onClearCollection() {
        this.selectedCollections = [];
        this.onChangeCollection();
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _crawlService: CrawlService,
        private _forumService: ForumService,
        private _userService: UserService,
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService,
        private _blogService: BlogService,
        public _matDialog: MatDialog
    ) {
        this.titleService.setTitle(`lưu trữ | ai.type - công cụ tạo content`);

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                this.permissionText2Voice =
                    this._userService.permissionText2Voice(this.user);

                this.permissionScriptCommentLike =
                    this._userService.permissionScriptCommentLike(this.user);



                // Load following users from multiAccountService
                let following = this.multiAccountService.getItem('following_users');
                if (following && Array.isArray(following) && following.length > 0) {
                    this.following_users = following;
                } else {
                    this.following();
                }

                this.collection();
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    async loadLocalArticles() {
        if ((window as any).electron && (window as any).electron.listLocalArticles) {
            try {
                const res = await (window as any).electron.listLocalArticles({ username: this.user.name });
                if (res && res.success && res.articles && res.articles.length > 0) {
                    const localDocs = res.articles.map((art: any) => ({
                        uuid: art.uuid,
                        title: art.title || 'Bài viết cục bộ',
                        domain: art.domain || 'local.ai.type',
                        used: 0,
                        is_local: true,
                        is_encrypted: !!art.is_encrypted,
                        created_at: art.created_at || art.updated_at || new Date().toISOString(),
                        updated_at: art.updated_at || art.created_at || new Date().toISOString(),
                        dateGroup: this.getDateGroup(art)
                    }));

                    if (!this.masterLoadedRows) this.masterLoadedRows = [];
                    localDocs.forEach((doc: any) => {
                        if (!this.masterLoadedRows.some((m: any) => m.uuid === doc.uuid)) {
                            this.masterLoadedRows.unshift(doc);
                        }
                    });

                    this.rows = this.groupRowsWithHeaders(this.masterLoadedRows);
                    this.totalElements = this.rows.length;
                    this.cd.markForCheck();
                }
            } catch (e) {
                console.error('Lỗi khi nạp bài viết cục bộ:', e);
            }
        }
    }

    async verifyPasswordForArticles(encryptedItems: any[], password: string): Promise<boolean> {
        if (!password || !encryptedItems || encryptedItems.length === 0) return false;

        for (const item of encryptedItems) {
            let cipher = item?.cipher || item?.source?.cipher;

            // Nếu cipher chưa có sẵn trên row object trong datatable list, nạp chi tiết bài viết
            if (!cipher && item && item.uuid) {
                try {
                    const res: any = await firstValueFrom(this._crawlService.detail({ uuid: item.uuid, username: this.user.name }));
                    if (res && res.success && res.data) {
                        cipher = res.data.cipher || res.data.source?.cipher;
                    }
                } catch (e) {}
            }

            if (cipher) {
                try {
                    const bytes = CryptoJS.AES.decrypt(cipher, password);
                    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
                    if (!decryptedText || decryptedText.length === 0) {
                        return false; // Mật khẩu không giải mã được cipher
                    }
                } catch (e) {
                    return false; // Mật khẩu sai
                }
            } else {
                // Nếu bài viết được đánh dấu mã hóa nhưng không có cipher, yêu cầu mật khẩu không rỗng
                if (!password || password.trim().length === 0) return false;
            }
        }

        return true;
    }

    isRowEncrypted(row: any): boolean {
        if (!row || row.isGroupHeader) return false;
        if (row.is_encrypted || row.encrypted) return true;
        if (row.cipher) return true;
        if (row.source) {
            if (row.source.encrypted || row.source.is_encrypted || row.source.cipher) return true;
        }
        const uuid = row.uuid || row._id || row.id;
        if (uuid) {
            if (localStorage.getItem('article_encrypted_' + uuid) === 'true') return true;
            if (sessionStorage.getItem('nav_handshake_pwd_' + uuid)) return true;
        }
        return false;
    }

    verifyLoadedRowsEncryption() {
        if (!this.masterLoadedRows || this.masterLoadedRows.length === 0) return;
        this.masterLoadedRows.forEach((row: any) => {
            if (row && row.uuid && !row.isGroupHeader) {
                if (this.isRowEncrypted(row)) {
                    row.is_encrypted = true;
                    localStorage.setItem('article_encrypted_' + row.uuid, 'true');
                } else {
                    this._crawlService.detail({ uuid: row.uuid, username: this.user.name })
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe((res: any) => {
                            if (res && res.success && res.data) {
                                const fullDoc = res.data;
                                const isEnc = !!(fullDoc.is_encrypted || fullDoc.cipher || (fullDoc.source && (fullDoc.source.encrypted || fullDoc.source.cipher)));
                                if (isEnc) {
                                    row.is_encrypted = true;
                                    if (!row.source) row.source = {};
                                    row.source.encrypted = true;
                                    localStorage.setItem('article_encrypted_' + row.uuid, 'true');
                                    this.cd.markForCheck();
                                }
                            }
                        });
                }
            }
        });
    }

    ensureMultipleUnlocked(items: any[], callback: (unlocked: boolean, password?: string) => void) {
        if (!items || items.length === 0) {
            callback(true);
            return;
        }

        const encryptedItems = items.filter(r => this.isRowEncrypted(r));
        if (encryptedItems.length === 0) {
            callback(true);
            return;
        }

        // Kiểm tra xem tất cả bài viết mã hóa đã có token giải mã trong sessionStorage hay chưa
        const unhandledEncrypted = encryptedItems.filter(r => {
            const uuid = r.uuid || r._id || r.id;
            if (!uuid) return false;
            const token = sessionStorage.getItem('nav_handshake_pwd_' + uuid);
            return !token;
        });

        if (unhandledEncrypted.length === 0) {
            // Tất cả đã được mở khóa hợp lệ trong phiên làm việc
            callback(true);
            return;
        }

        const targetRow = unhandledEncrypted[0];
        const dialogRef = this._matDialog.open(ArticlePasswordDialog, {
            data: {
                mode: 'unlock',
                type: 'article',
                title: targetRow.title || `Danh sách bài viết đã chọn (${encryptedItems.length} bài mã hóa)`,
                validator: async (pwd: string) => {
                    return await this.verifyPasswordForArticles(encryptedItems, pwd);
                }
            },
            width: '450px',
            disableClose: true
        });

        dialogRef.afterClosed().subscribe((res: any) => {
            if (res && res.password) {
                encryptedItems.forEach(r => {
                    const targetUuid = r.uuid || r._id || r.id;
                    if (targetUuid) {
                        sessionStorage.setItem('nav_handshake_pwd_' + targetUuid, JSON.stringify({ password: res.password, ts: Date.now() }));
                    }
                });
                callback(true, res.password);
            } else {
                callback(false);
            }
        });
    }

    ensureUnlocked(row: any, callback: (unlocked: boolean, password?: string) => void) {
        if (!row) {
            callback(true);
            return;
        }

        const isEncrypted = this.isRowEncrypted(row);
        if (!isEncrypted) {
            callback(true);
            return;
        }

        const targetUuid = row.uuid || row._id || row.id;
        if (targetUuid) {
            const token = sessionStorage.getItem('nav_handshake_pwd_' + targetUuid);
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    if (parsed && parsed.password) {
                        callback(true, parsed.password);
                        return;
                    }
                } catch (e) {}
            }
        }

        const dialogRef = this._matDialog.open(ArticlePasswordDialog, {
            data: {
                mode: 'unlock',
                type: 'article',
                title: row.title || 'Bài viết',
                validator: async (pwd: string) => {
                    return await this.verifyPasswordForArticles([row], pwd);
                }
            },
            width: '450px',
            disableClose: true
        });

        dialogRef.afterClosed().subscribe((res: any) => {
            if (res && res.password) {
                if (targetUuid) {
                    sessionStorage.setItem('nav_handshake_pwd_' + targetUuid, JSON.stringify({ password: res.password, ts: Date.now() }));
                }
                callback(true, res.password);
            } else {
                callback(false);
            }
        });
    }

    openRowArticle(row: any) {
        if (!row) return;
        this.ensureUnlocked(row, (unlocked) => {
            if (unlocked) {
                const username = this.user?.name || 'admin';
                this.router.navigate(['/ai-writer', username, row.uuid]);
            }
        });
    }

    openRowScript(row: any) {
        if (!row) return;
        this.ensureUnlocked(row, (unlocked) => {
            if (unlocked) {
                const username = this.user?.name || 'admin';
                this.router.navigate(['/ai-writer', username, row.uuid, 'script']);
            }
        });
    }

    openRowVideo(row: any) {
        if (!row) return;
        this.ensureUnlocked(row, (unlocked) => {
            if (unlocked) {
                const username = this.user?.name || 'admin';
                this.router.navigate(['/voice2video', username, row.uuid]);
            }
        });
    }

    openCollectionEncryptionDialog() {
        if (!this.selectedCollections || this.selectedCollections.length === 0) {
            this.toastr.warning('Vui lòng chọn 1 Tập hợp (Collection) trước khi cài đặt mật khẩu.');
            return;
        }

        const colName = this.selectedCollections[0]?.title || 'Collection';
        const dialogRef = this._matDialog.open(ArticlePasswordDialog, {
            data: {
                mode: 'set',
                type: 'collection',
                title: colName
            },
            width: '450px'
        });

        dialogRef.afterClosed().subscribe((res: any) => {
            if (res && res.password) {
                this.toastr.success(`Đã cài đặt mật khẩu mã hóa AES-256 cho Collection: "${colName}"!`, 'Mã Hóa Collection');
                this.cd.markForCheck();
            }
        });
    }

    ngOnInit(): void {
                // this.loadLocalArticles();
        let temp = localStorage.getItem('statistics');
        if (temp && temp !== 'undefined') {
            try {
                let parsed = JSON.parse(temp);
                this.totalElements = parsed['archives'] || 0;
            } catch (e) {
                this.totalElements = 0;
            }
        } else {
            this.totalElements = 0;
        }

        // Luôn luôn gọi API để cập nhật tổng số bản ghi chính xác nhất, bỏ qua check !this.totalElements
        this._crawlService.searchTotalArchive({
            username: this.user.name,
            keyword: '',
            uuids: this.uuids,
            page: this.page,
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (res: any) => {
                    if (!this.keyword && this.uuids.length === 0) {
                        let total = res?.data?.total;
                        if (total === undefined) total = res?.data?.data?.total;
                        if (total !== undefined) {
                            this.totalElements = total;
                            this.actualTotalElements = total;
                            
                            // Bắt buộc resize lại mảng rows để virtual scroll nhận diện được tổng số bản ghi
                            if (this.rows && this.rows.length !== this.totalElements) {
                                const oldRows = this.rows;
                                this.rows = Array.from({ length: this.totalElements }, (_, i) => oldRows[i]);
                                this.rows = [...this.rows];
                            }
                            
                            this.cd.markForCheck();
                        }
                    }
                }
            });
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message
                ? message
                : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn',
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại',
                },
            },
            dismissible: false,
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }

    // Group date helper method
    getDateGroup(doc: any): string {
        if (!doc) return 'Cũ hơn';
        let dateVal = doc.createdAt || doc.created_at || doc.updatedAt || doc.updated_at || doc.date || doc.updated || doc.created;
        if (!dateVal) return 'Cũ hơn';

        if (typeof dateVal === 'string' && /^\d+$/.test(dateVal)) {
            dateVal = Number(dateVal);
        }
        if (typeof dateVal === 'number' && dateVal < 10000000000) {
            dateVal = dateVal * 1000;
        }

        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return 'Cũ hơn';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

        const diffTime = today.getTime() - itemDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

        if (diffDays <= 0) return 'Hôm nay';
        if (diffDays === 1) return 'Hôm qua';
        if (diffDays > 1 && diffDays <= 7) return '7 ngày qua';
        if (diffDays > 7 && diffDays <= 30) return '30 ngày qua';
        return 'Cũ hơn';
    }

    groupRowsWithHeaders(docs: any[]): any[] {
        if (!docs || docs.length === 0) return [];

        const realDocs = docs.filter((doc: any) => doc && !doc.isGroupHeader && doc.uuid);
        if (realDocs.length === 0) return [];

        const groupOrder = ['Hôm nay', 'Hôm qua', '7 ngày qua', '30 ngày qua', 'Cũ hơn'];
        const grouped: { [key: string]: any[] } = {};

        groupOrder.forEach(g => { grouped[g] = []; });

        realDocs.forEach(doc => {
            const group = this.getDateGroup(doc);
            if (!grouped[group]) {
                grouped[group] = [];
            }
            grouped[group].push(doc);
        });

        const result: any[] = [];
        groupOrder.forEach(groupName => {
            const docsInGroup = grouped[groupName] || [];
            if (docsInGroup.length > 0) {
                result.push({
                    isGroupHeader: true,
                    groupTitle: groupName,
                    count: docsInGroup.length,
                    uuid: 'group-header-' + groupName
                });
                result.push(...docsInGroup);
            }
        });

        return result;
    }

    applyDateFilter() {
        const selectedGroup = this.selectedDateGroup;
        if (this.table) {
            this.table.offset = 0;
        }

        if (!selectedGroup || selectedGroup === 'Tất cả thời gian') {
            const docs = (this.masterLoadedRows && this.masterLoadedRows.length > 0)
                ? this.masterLoadedRows
                : (this.allRowsBackup ? this.allRowsBackup.filter(r => r && r.uuid && !r.isGroupHeader) : []);
            this.rows = this.groupRowsWithHeaders(docs);
            this.totalElements = (this.actualTotalElements > 0) ? this.actualTotalElements : this.rows.length;
        } else {
            const allDocs = (this.masterLoadedRows && this.masterLoadedRows.length > 0)
                ? this.masterLoadedRows
                : (this.allRowsBackup ? this.allRowsBackup.filter(r => r && r.uuid && !r.isGroupHeader) : (this.rows ? this.rows.filter(r => r && r.uuid && !r.isGroupHeader) : []));

            const filtered = allDocs.filter(row => row && !row.isGroupHeader && this.getDateGroup(row) === selectedGroup);
            this.rows = this.groupRowsWithHeaders(filtered);
            this.totalElements = this.rows.length;
        }

        this.selected = [];
        if (this.table) {
            this.table.recalculatePages();
            setTimeout(() => {
                if (this.table) this.table.recalculate();
            }, 50);
        }
        this.cd.markForCheck();
    }

    onFilterDateGroup(event: any) {
        let selectedGroup = this.selectedDateGroup;
        if (typeof event === 'string') {
            selectedGroup = event;
        } else if (event && event.value) {
            selectedGroup = event.value;
        }
        this.selectedDateGroup = selectedGroup;

        if (!this.allRowsBackup && this.rows && this.rows.length > 0) {
            this.allRowsBackup = [...this.rows];
        }

        this.applyDateFilter();
    }

    hasCollectionScriptFromArchives(): boolean {
        let targetCols = this.selectedCollections || [];
        if ((!targetCols || targetCols.length === 0) && this.collections && this.collections.length > 0) {
            targetCols = [this.collections[0]];
        }
        if (!targetCols || targetCols.length === 0) return false;

        const col = targetCols[0];
        let firstUuid = '';
        if (Array.isArray(col.uuid) && col.uuid.length > 0) {
            firstUuid = col.uuid[0];
        } else if (typeof col.uuid === 'string') {
            firstUuid = col.uuid;
        }

        if (!firstUuid) return false;
        if (col.has_script) return true;

        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_script_data_${firstUuid}`) ||
                   !!this.multiAccountService.getItem(`ai_type_script_merger_data_${firstUuid}`) ||
                   !!this.multiAccountService.getItem(`ai_type_script_data_${col._id}`) ||
                   !!this.multiAccountService.getItem(`ai_type_script_merger_data_${col._id}`);
        }
        return false;
    }

    readCollectionScriptFromArchives() {
        let targetCols = this.selectedCollections || [];
        if ((!targetCols || targetCols.length === 0) && this.collections && this.collections.length > 0) {
            targetCols = [this.collections[0]];
        }
        if (!targetCols || targetCols.length === 0) return;

        const col = targetCols[0];
        let firstUuid = '';
        if (Array.isArray(col.uuid) && col.uuid.length > 0) {
            firstUuid = col.uuid[0];
        } else if (typeof col.uuid === 'string') {
            firstUuid = col.uuid;
        }

        if (!firstUuid) return;
        const username = this.user?.name || 'admin';
        this.router.navigate(['/ai-writer', username, firstUuid, 'script']);
    }

    extractCleanDoneContent(art: any): string {
        if (!art) return '';
        let content = '';
        const rawDone = art.done || art.content || art.text || (art.source ? (art.source.done || art.source.text || art.source.prompt) : null);
        if (rawDone) {
            if (Array.isArray(rawDone)) {
                content = rawDone
                    .map((paragraph: any) => typeof paragraph === 'string' ? paragraph.replace(/<[^>]*>?/gm, '').trim() : '')
                    .filter((text: string) => text.length > 0)
                    .join('\n\n');
            } else if (typeof rawDone === 'string') {
                content = rawDone.replace(/<[^>]*>?/gm, '').trim();
            }
        }
        return content;
    }

    async fetchCollectionContentBulk(uuids: string[], username: string): Promise<any[]> {
        if (!uuids || uuids.length === 0) return [];
        let docsMap: Record<string, any> = {};

        try {
            const bulkRes: any = await firstValueFrom(this._crawlService.archive({
                username: username,
                uuids: uuids,
                page: { size: Math.max(uuids.length, 2000) }
            })).catch(() => null);

            let docsList: any[] = [];
            if (bulkRes && bulkRes.data) {
                if (Array.isArray(bulkRes.data.docs)) {
                    docsList = bulkRes.data.docs;
                } else if (Array.isArray(bulkRes.data)) {
                    docsList = bulkRes.data;
                } else if (Array.isArray(bulkRes.data.data)) {
                    docsList = bulkRes.data.data;
                }
            } else if (bulkRes && Array.isArray(bulkRes.docs)) {
                docsList = bulkRes.docs;
            }

            docsList.forEach((doc: any) => {
                if (doc) {
                    const cleanContent = this.extractCleanDoneContent(doc);
                    const docItem = {
                        uuid: doc.uuid || doc._id || doc.id,
                        title: doc.title || doc.name || '',
                        done: cleanContent,
                        style: (doc.source && doc.source.style) ? doc.source.style : (doc.style || null),
                        createdAt: doc.createdAt || doc.created_at || doc.date || doc.updatedAt || 0
                    };
                    if (doc.uuid) docsMap[doc.uuid] = docItem;
                    if (doc._id) docsMap[doc._id] = docItem;
                    if (doc.id) docsMap[doc.id] = docItem;
                }
            });
        } catch (err) {
            console.warn('Lỗi gọi bulk archive:', err);
        }

        let resultDocs = uuids.map(uuid => docsMap[uuid]).filter(doc => !!doc && !!doc.done);
        if (resultDocs.length === 0 && Object.keys(docsMap).length > 0) {
            resultDocs = Object.values(docsMap).filter((doc: any) => !!doc && !!doc.done);
        }

        resultDocs.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || a.created_at || a.date || a.updatedAt || 0).getTime();
            const dateB = new Date(b.createdAt || b.created_at || b.date || b.updatedAt || 0).getTime();
            return dateA - dateB;
        });
        return resultDocs;
    }

    async generateCollectionScriptFromArchives() {
        if (this.isGeneratingCollectionScript) return;

        let targetCols = this.selectedCollections || [];
        
        if ((!targetCols || targetCols.length === 0) && this.selected && this.selected.length > 0) {
            targetCols = (this.collections || []).filter((c: any) => {
                return (this.selected || []).some((sel: any) => {
                    if (Array.isArray(c.uuid)) return c.uuid.includes(sel.uuid);
                    return c.uuid === sel.uuid;
                });
            });
        }

        if (!targetCols || targetCols.length === 0) {
            if (this.collections && this.collections.length > 0) {
                targetCols = [this.collections[0]];
            } else {
                this.toastr.warning('Vui lòng chọn 1 Collection ở bộ lọc bên trên để tạo kịch bản!', 'Chưa chọn Collection');
                return;
            }
        }

        this.isGeneratingCollectionScript = true;
        this.cd.markForCheck();

        let collectionTitle = targetCols[0]?.title || 'Kịch bản Bộ Tiểu Thuyết';
        let uuids: string[] = [];

        targetCols.forEach((col: any) => {
            if (Array.isArray(col.uuid)) {
                uuids = uuids.concat(col.uuid);
            } else if (col.uuid) {
                uuids.push(col.uuid);
            }
        });

        uuids = Array.from(new Set(uuids));

        if (uuids.length === 0 && this.rows && this.rows.length > 0) {
            uuids = this.rows.map((r: any) => r.uuid).filter((u: any) => !!u);
        }

        if (uuids.length === 0) {
            this.toastr.warning('Collection này chưa có bài viết nào để dựng kịch bản!', 'Trống');
            this.isGeneratingCollectionScript = false;
            this.cd.markForCheck();
            return;
        }

        try {
            this.toastr.info(`Đang siêu tối ưu đọc ${uuids.length} chương trong Collection "${collectionTitle}"...`, 'Đang xử lý siêu tốc');
            const username = this.user?.name || 'admin';
            
            const fullDocs = await this.fetchCollectionContentBulk(uuids, username);

            if (fullDocs && fullDocs.length > 0) {
                const firstUuid = uuids[0];
                let fullScriptParts: string[] = [];
                let currentSceneNumber = 1;

                this.toastr.info(`Bắt đầu chuyển thể chi tiết trọn vẹn ${fullDocs.length} chương sang kịch bản...`, 'Chuyển thể siêu chi tiết');

                for (let idx = 0; idx < fullDocs.length; idx++) {
                    const art = fullDocs[idx];
                    const chapterTitle = art.title || `Chương ${idx + 1}`;
                    
                    let contentFromDone = '';
                    if (art.done) {
                        if (Array.isArray(art.done)) {
                            contentFromDone = art.done
                                .map((paragraph: any) => typeof paragraph === 'string' ? paragraph.replace(/<[^>]*>?/gm, '').trim() : '')
                                .filter((text: string) => text.length > 0)
                                .join('\n\n');
                        } else if (typeof art.done === 'string') {
                            contentFromDone = art.done.replace(/<[^>]*>?/gm, '').trim();
                        }
                    }

                    if (!contentFromDone && art.source) {
                        if (art.source.prompt && Array.isArray(art.source.prompt)) {
                            contentFromDone = art.source.prompt
                                .map((item: any) => typeof item === 'string' ? item.replace(/<[^>]*>?/gm, '').trim() : '')
                                .filter((text: string) => text.length > 0)
                                .join('\n\n');
                        } else if (art.source.pre && Array.isArray(art.source.pre)) {
                            contentFromDone = art.source.pre
                                .map((item: any) => typeof item === 'string' ? item.replace(/<[^>]*>?/gm, '').trim() : '')
                                .filter((text: string) => text.length > 0)
                                .join('\n\n');
                        }
                    }

                    if (!contentFromDone || !contentFromDone.trim()) {
                        continue;
                    }

                    this.toastr.info(`[Chương ${idx + 1}/${fullDocs.length}] Đang dựng kịch bản mổ xẻ chi tiết cho: "${chapterTitle}"...`, 'Đang xử lý từng chương');

                    let prompt = `Bạn là một Nhà biên kịch Điện ảnh Chuyên nghiệp.
Nhiệm vụ của bạn là CHUYỂN THỂ TRUNG THỰC TUYỆT ĐỐI (100% High-Fidelity Adaptation) CHƯƠNG ${idx + 1}/${fullDocs.length} thuộc tác phẩm dưới đây thành một KỊCH BẢN PHIM ĐIỆN ẢNH chuẩn mực chiếu rạp.

TIÊU ĐỀ TÁC PHẨM TỔNG THỂ: ${collectionTitle}
CHƯƠNG HIỆN TẠI (CHƯƠNG ${idx + 1}/${fullDocs.length}): ${chapterTitle}

NỘI DUNG VĂN BẢN GỐC CỦA CHƯƠNG NÀY (TRƯỜNG DONE):
${contentFromDone}

QUY TẮC BẮT BUỘC CHUYỂN THỂ SIÊU CHI TIẾT:
1. BÁM SÁT 100% TỪNG ĐOẠN VĂN CỦA CHƯƠNG NÀY - ZERO OMISSION:
- Chuyển thể TUẦN TỰ TỪNG ĐOẠN VĂN từ đầu tới cuối của Chương này sang phân cảnh kịch bản. KHÔNG BỎ SÓT BẤT KỲ ĐOẠN VĂN HAY CHI TIẾT NÀO.
- ĐÁNH SỐ CẢNH: Bắt đầu đánh số phân cảnh từ CẢNH ${currentSceneNumber}. Tăng dần số cảnh liên tục (Cảnh ${currentSceneNumber}, Cảnh ${currentSceneNumber + 1}, ...).

2. VIẾT CỰC KỲ CHI TIẾT HÀNH ĐỘNG, THOẠI VÀ BỐI CẢNH (ULTRA-DETAILED ACTION & FULL DIALOGUE):
- DÒNG HÀNH ĐỘNG (ACTION LINES) SIÊU CHI TIẾT: Mổ xẻ tỉ mỉ cử chỉ, biểu cảm, ánh mắt, tư thế, di chuyển, âm thanh môi trường và ánh sáng bối cảnh.
- LỜI THOẠI (DIALOGUE) TRỌN VẸN 100%: Viết đầy đủ từng câu thoại, mở ngoặc đơn sắc thái tình cảm. CẤM VIẾT TẮT, cấm dùng các từ tóm tắt hời hợt như "v.v.", "...", "hai người tiếp tục trò chuyện...".
- ĐỘ TUỔI, TÊN GỐC & NGHỀ NGHIỆP: Giữ nguyên 100% tên gốc, con số độ tuổi (Ví dụ: Nếu nguyên tác ghi "40 tuổi" thì kịch bản BẮT BUỘC ghi (40), TUYỆT ĐỐI KHÔNG ĐỔI THÀNH 20 hay 30 tuổi!) và nghề nghiệp nguyên tác.

3. ĐỊNH DẠNG KỊCH BẢN ĐIỆN ẢNH CHUẨN ĐIỆN ẢNH CHIẾU RẠP:
- TUYỆT ĐỐI KHÔNG VIẾT MỤC 'NHÂN VẬT:' HOẶC LIỆT KÊ DANH SÁCH NHÂN VẬT Ở ĐẦU KỊCH BẢN.
- GIỚI THIỆU NHÂN VẬT TRỰC TIẾP TRONG DÒNG HÀNH ĐỘNG (ACTION LINES) khi nhân vật xuất hiện lần đầu tiên ở phân cảnh (Ví dụ: MAI (27), một phụ nữ trẻ cương nghị...).
- Bắt đầu kịch bản ngay bằng CẢNH ${currentSceneNumber} hoặc "FADE IN:". KHÔNG kèm lời dẫn hay giải thích thừa.`;

                    try {
                        const response = await this._genaiService.generateContent({
                            model: 'gemini-3.6-flash',
                            contents: [{ role: 'user', parts: [{ text: prompt }] }],
                            config: { temperature: 0.1 }
                        });

                        const chapterScript = response.text ? response.text.trim() : '';
                        if (chapterScript) {
                            const sceneMatches = chapterScript.match(/(?:CẢNH|SCENE)\s+(\d+)/gi);
                            if (sceneMatches && sceneMatches.length > 0) {
                                const lastMatch = sceneMatches[sceneMatches.length - 1];
                                const numMatch = lastMatch.match(/\d+/);
                                if (numMatch) {
                                    currentSceneNumber = parseInt(numMatch[0], 10) + 1;
                                }
                            } else {
                                currentSceneNumber += 5;
                            }

                            fullScriptParts.push(`========================================\n[PHẦN KỊCH BẢN CHƯƠNG ${idx + 1}: ${chapterTitle}]\n========================================\n\n` + chapterScript);
                        }
                    } catch (e) {
                        console.warn(`Lỗi khi dựng kịch bản cho Chương ${idx + 1}:`, e);
                    }
                }

                const scriptText = fullScriptParts.join('\n\n');

                if (!scriptText || !scriptText.trim()) {
                    this.toastr.error('Không thể dựng kịch bản cho Collection này!', 'Lỗi');
                    this.isGeneratingCollectionScript = false;
                    this.cd.markForCheck();
                    return;
                }

                if (scriptText) {
                    const scriptTitle = `${collectionTitle}`;
                    this._blogService.storeScript({
                        username: username,
                        uuid: firstUuid,
                        title: scriptTitle,
                        outline: `Toàn bộ Collection (${uuids.length} chương)`,
                        script: scriptText
                    }).subscribe({
                        next: (res) => {
                            this.multiAccountService.setItem(`ai_type_script_data_${firstUuid}`, true);
                            this.toastr.success(`Dựng kịch bản trọn vẹn chi tiết toàn bộ Collection "${collectionTitle}" (${fullDocs.length} chương) thành công!`);
                            this.isGeneratingCollectionScript = false;
                            this.cd.markForCheck();
                            
                            const firstRowName = (this.rows && this.rows.length > 0 && this.rows[0].name) ? this.rows[0].name : username;
                            this.router.navigate(['/ai-writer', firstRowName, firstUuid, 'script']);
                        },
                        error: (err) => {
                            console.error('Lỗi khi lưu kịch bản Collection:', err);
                            this.toastr.error('Dựng kịch bản thành công nhưng không thể lưu vào database.', 'Lỗi lưu trữ');
                            this.isGeneratingCollectionScript = false;
                            this.cd.markForCheck();
                        }
                    });
                } else {
                    this.toastr.error('AI không phản hồi nội dung kịch bản.', 'Lỗi AI');
                    this.isGeneratingCollectionScript = false;
                    this.cd.markForCheck();
                }
            } else {
                this.toastr.error('Không thể đọc nội dung các chương trong Collection.', 'Lỗi dữ liệu');
                this.isGeneratingCollectionScript = false;
                this.cd.markForCheck();
            }
        } catch (error) {
            console.error('Lỗi dựng kịch bản Collection:', error);
            this.toastr.error('Không thể kết nối đến máy chủ AI để dựng kịch bản Collection.', 'Lỗi kết nối');
            this.isGeneratingCollectionScript = false;
            this.cd.markForCheck();
        }
    }
}
