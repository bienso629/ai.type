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
import { CrawlService } from 'app/modules/_services/crawl';
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { ForumService } from 'app/modules/_services/forum';
import { FormControl } from '@angular/forms';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { MatDialog } from '@angular/material/dialog';
import { GenaiService } from 'app/genai.service';

@Component({
    selector: 'archives',
    styleUrls: ['./archives.component.scss'],
    templateUrl: './archives.component.html',
    providers: [CrawlService, ForumService],
    encapsulation: ViewEncapsulation.None,
})
export class AIArchiveComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    rows = [];
    totalElements: number;
    apiFetchedCount: number = 0;
    pageNumber: number;
    isLoading: boolean = false;
    cache: Record<string, boolean> = {};
    cachePageSize = 0;
    keyword: String = '';
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
        this.selected.push(...selected);
    }

    deleteSelected() {
        if (!this.selected || this.selected.length === 0) return;
        
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
                const newRows = [];
                for (let i = 0; i < this.rows.length; i++) {
                    const row = this.rows[i];
                    if (!row || !row.uuid || !uuids.includes(row.uuid)) {
                        newRows.push(row);
                    }
                }
                this.rows = [...newRows];
                this.totalElements = Math.max(0, this.totalElements - uuids.length);
                
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
    }

    // Bulk Edit Logic
    openBulkEditDialog() {
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
        // Kiểm tra nếu row tồn tại và có title mới thực hiện so sánh
        return row && row.title ? row.title !== 'Ethel Price' : false;
    }

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
                            this.totalElements = total;
                        } else {
                            // Mặc định từ statistics (khi xóa keyword)
                            let temp = localStorage.getItem('statistics');
                            if (temp && temp !== 'undefined') {
                                try {
                                    const stats = JSON.parse(temp);
                                    this.totalElements = stats['archives'] || 0;
                                } catch (e) {
                                    this.totalElements = 0;
                                }
                            } else {
                                this.totalElements = 0;
                            }
                        }

                        if (this.totalElements > 0) {
                            this.setPage({ offset: 0, pageSize: this.page.size, limit: this.page.size, count: this.totalElements });
                        }
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
        if (this.isLoading) return;
        if (!pageInfo.pageSize) pageInfo.pageSize = this.page.size;
        this.pageNumber = pageInfo.offset;
        const rowOffset = pageInfo.offset * pageInfo.pageSize;

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

                        if (!this.rows || this.rows.length === 0) {
                            this.rows = new Array(this.totalElements || 0);
                        }

                        let newTotal = this.totalElements || 0;
                        if (start + resData.docs.length > newTotal) {
                            newTotal = start + resData.docs.length;
                        }

                        if (this.totalElements !== newTotal) {
                            this.totalElements = newTotal;
                        }

                        // Resize rows if totalElements increased
                        if (this.rows.length !== this.totalElements) {
                            const oldRows = this.rows;
                            this.rows = Array.from({ length: this.totalElements }, (_, i) => oldRows[i]);
                        }

                        const rows = [...this.rows];

                        // Nối dữ liệu vào đúng vị trí cuối cùng đã nạp từ API
                        rows.splice(start, resData.docs.length, ...resData.docs);
                        this.rows = rows;
                        this.apiFetchedCount += resData.docs.length;

                        // Lưu bookmark từ server để dùng cho request tiếp theo
                        this.currentBookmark = resData.bookmark;
                        this.cd.detectChanges();
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        // Nếu mảng rỗng nhưng bookmark thay đổi, tiếp tục gọi đệ quy (do PouchDB in-memory filter skip)
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        this.setPage(pageInfo);
                        return;
                    } else if (resData && resData.docs && resData.docs.length === 0) {
                        // Hết dữ liệu
                        if (this.totalElements !== start) {
                            this.totalElements = start;
                            if (this.rows && this.rows.length !== this.totalElements) {
                                this.rows = this.rows.slice(0, this.totalElements);
                                this.rows = [...this.rows];
                            }
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
     */
    onChangeCollection() {
        // 1. Trích xuất tất cả UUID bài viết từ các tập đã chọn
        this.uuids = [
            ...new Set(
                (this.selectedCollections || []).flatMap((item: any) => {
                    // item.uuid bây giờ là 1 mảng các string ID bài viết
                    return Array.isArray(item.uuid) ? item.uuid : (item.uuid ? [item.uuid] : []);
                }),
            ),
        ];

        // 2. Reset toàn bộ trạng thái UI và mốc phân trang
        this.isLoading = false;
        if (this.table) this.table.offset = 0;
        this.selected = [];
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
                const stats = JSON.parse(temp);
                this.totalElements = stats['archives'] || 0;
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
                            this.totalElements = total;
                            
                            // Bắt buộc resize lại mảng rows để virtual scroll nhận diện được tổng số bản ghi
                            if (this.rows && this.rows.length !== this.totalElements) {
                                const oldRows = this.rows;
                                this.rows = Array.from({ length: this.totalElements }, (_, i) => oldRows[i]);
                                this.rows = [...this.rows];
                                this.cd.markForCheck();
                            }
                        }
                    }
                });
        } else {
            // Nếu chọn collection, tổng số chính là số lượng UUIDs đã trích xuất
            this.totalElements = this.uuids.length;
        }

        // 4. Kích hoạt lấy dữ liệu trang đầu tiên
        if (this.totalElements > 0 || this.uuids.length === 0) {
            this.setPage({
                offset: 0,
                pageSize: this.page.size,
                limit: this.page.size,
                count: this.totalElements,
            });
        }
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
        console.log('onClear');
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

    ngOnInit(): void {
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
}
