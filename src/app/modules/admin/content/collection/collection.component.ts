import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/_services/crawl';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { ActivatedRoute, Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { GenaiService } from 'app/genai.service';
import { BlogService } from 'app/_services/blog';

@Component({
    selector: 'app-collection',
    templateUrl: './collection.component.html',
    styleUrls: ['./collection.component.scss'],
    providers: [CrawlService, BlogService],
    encapsulation: ViewEncapsulation.None
})
export class CollectionComponent implements OnInit, OnDestroy {
    user: User;

    collections: any[] = [];
    selectedCollection: any;

    editingTitle: boolean = false;
    newTitle: string = '';

    rows = [];
    totalElements: number = 0;
    apiFetchedCount: number = 0;
    pageNumber: number = 0;
    isLoading: boolean = false;
    cache: Record<string, boolean> = {};
    page: Page = {
        pageNumber: 0,
        size: 10,
        totalElements: 0,
        totalPages: 0,
    };
    currentBookmark: string = null;

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    permissionText2Voice: boolean = false;
    permissionScriptCommentLike: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private titleService: Title,
        private _crawlService: CrawlService,
        private _userService: UserService,
        private route: ActivatedRoute,
        private cd: ChangeDetectorRef,
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private multiAccountService: MultiAccountService,
        private router: Router,
        private _genaiService: GenaiService,
        private _blogService: BlogService
    ) {
        this.titleService.setTitle(`tập của bạn | ai.type - công cụ tạo content`);

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.permissionText2Voice = this._userService.permissionText2Voice(this.user);
                this.permissionScriptCommentLike = this._userService.permissionScriptCommentLike(this.user);

                this.loadCollections();
            });
    }

    ngOnInit(): void {
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    loadCollections() {
        this._crawlService
            .collections({
                username: this.user.name,
                page: { size: 100 },
                includeUuid: true
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                    if (result && result.success) {
                        this.collections = result.data;

                        // Check if collectionId is in query params
                        this.route.queryParams.subscribe(params => {
                            if (params['collectionId']) {
                                const found = this.collections.find(c => c._id === params['collectionId']);
                                if (found) {
                                    this.goToCollection(found);
                                }
                            } else if (this.collections.length > 0) {
                                this.goToCollection(this.collections[0]);
                            }
                        });
                    }
                },
                complete: () => { this.cd.markForCheck(); }
            });
    }

    goToCollection(collection: any) {
        this.selectedCollection = collection;
        this.onChangeCollection();
    }

    onChangeCollection() {
        if (!this.selectedCollection) return;
        this.isLoading = false;
        if (this.table) this.table.offset = 0;
        this.selected = [];
        this.rows = [];
        this.rows = [...this.rows];
        this.currentBookmark = null;
        this.apiFetchedCount = 0;
        this.cache = {};
        this.cd.markForCheck();

        let rawUuids = Array.isArray(this.selectedCollection.uuid) ? this.selectedCollection.uuid : (this.selectedCollection.uuid ? [this.selectedCollection.uuid] : []);
        let uuids = Array.from(new Set(rawUuids)).filter((u: any) => !!u);

        if (uuids && uuids.length > 0 && this.user) {
            this._blogService.getScript({ username: this.user.name, uuid: uuids[0] }).subscribe({
                next: (checkRes: any) => {
                    const existingScript = (checkRes && checkRes.success && checkRes.data && checkRes.data.script) || (checkRes && checkRes.script);
                    if (existingScript) {
                        this.selectedCollection.has_script = true;
                        this.multiAccountService.setItem(`ai_type_script_data_${uuids[0]}`, true);
                        this.cd.markForCheck();
                    }
                },
                error: (err) => {}
            });
        }

        this.totalElements = uuids.length;

        if (this.totalElements > 0) {
            this.setPage({
                offset: 0,
                pageSize: this.page.size,
                limit: this.page.size,
                count: this.totalElements,
            });
        }
    }

    setPage(pageInfo: PageInfo) {
        if (!this.selectedCollection) return;
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

        if (this.rows && this.rows[rowOffset]) return;
        if (this.cache[this.page.pageNumber]) return;

        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cd.markForCheck();

        let rawUuids = Array.isArray(this.selectedCollection.uuid) ? this.selectedCollection.uuid : (this.selectedCollection.uuid ? [this.selectedCollection.uuid] : []);
        let uuids = Array.from(new Set(rawUuids)).filter((u: any) => !!u);

        const payloadPage = {
            ...this.page
        };

        this._crawlService.archive({
            username: this.user.name,
            keyword: '',
            uuids: uuids,
            page: payloadPage,
            bookmark: this.currentBookmark,
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    const resData = result?.data;
                    const start = this.page.pageNumber * this.page.size;
                    
                    if (resData && resData.docs && resData.docs.length > 0) {
                        if (this.page.pageNumber === 0) {
                            this.rows = resData.docs;
                            this.totalElements = (resData.totalDocs !== undefined && resData.totalDocs !== null) ? resData.totalDocs : resData.docs.length;
                        } else {
                            if (!this.rows) {
                                this.rows = new Array<any>(this.totalElements || 0);
                            }
                            const rows = [...this.rows];
                            rows.splice(start, resData.docs.length, ...resData.docs);
                            this.rows = rows;
                            if (start + resData.docs.length > this.totalElements) {
                                this.totalElements = start + resData.docs.length;
                            }
                        }
                        this.apiFetchedCount += resData.docs.length;
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        this.cd.detectChanges();
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        setTimeout(() => { this.setPage(pageInfo); }, 50);
                        return;
                    } else if (resData && resData.docs && resData.docs.length === 0) {
                        if (this.totalElements !== start) {
                            this.totalElements = start;
                            if (this.rows && this.rows.length !== this.totalElements) {
                                this.rows = this.rows.slice(0, this.totalElements);
                                this.rows = [...this.rows];
                            }
                        }
                    } else {
                        delete this.cache[this.page.pageNumber];
                    }
                },
                error: () => {
                    delete this.cache[this.page.pageNumber];
                    this.isLoading = false;
                    this.cd.markForCheck();
                },
                complete: () => {
                    this.isLoading = false;
                    if (this.table) {
                        this.table.recalculatePages();
                    }
                    this.cd.markForCheck();
                }
            });
    }

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return row && row.title ? row.title !== 'Ethel Price' : false;
    }

    startEditTitle(collection: any) {
        this.editingTitle = true;
        this.newTitle = collection.title;
    }

    cancelEditTitle() {
        this.editingTitle = false;
        this.newTitle = '';
    }

    saveTitle() {
        if (!this.selectedCollection) return;
        const newTitle = this.newTitle.trim();
        if (newTitle && newTitle !== this.selectedCollection.title) {
            this._crawlService.updateCollection({
                _id: this.selectedCollection._id,
                title: newTitle,
                username: this.user.name
            }).subscribe(res => {
                if (res.success || res.ok) {
                    this.selectedCollection.title = newTitle;
                    this.toastr.success('Cập nhật tên tập thành công');
                    this.editingTitle = false;
                    this.cd.markForCheck();
                } else {
                    this.toastr.error('Lỗi khi cập nhật tên tập');
                }
            });
        } else {
            this.editingTitle = false;
        }
    }

    removeFromCollection(row: any) {
        if (!this.selectedCollection || !row.uuid) return;
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa khỏi tập',
            message: `Bạn có chắc chắn muốn gỡ công việc ${row.uuid} khỏi tập này?`,
            icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Gỡ bỏ', color: 'warn' },
                cancel: { show: true, label: 'Hủy' }
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._crawlService.removeCollection({
                    _id: this.selectedCollection._id,
                    uuid: row.uuid,
                    username: this.user.name
                }).subscribe(res => {
                    if (res.success || res.ok) {
                        this.toastr.success('Đã gỡ công việc khỏi tập');
                        if (this.selectedCollection.uuid && Array.isArray(this.selectedCollection.uuid)) {
                            this.selectedCollection.uuid = this.selectedCollection.uuid.filter(u => u !== row.uuid);
                        }
                        this.onChangeCollection();
                    } else {
                        this.toastr.error('Có lỗi xảy ra');
                    }
                });
            }
        });
    }

    removeSelectedFromCollection() {
        if (!this.selectedCollection || this.selected.length === 0) return;
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa hàng loạt',
            message: `Bạn có chắc chắn muốn gỡ ${this.selected.length} công việc đã chọn khỏi tập này?`,
            icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'warn' },
            actions: {
                confirm: { show: true, label: 'Gỡ bỏ', color: 'warn' },
                cancel: { show: true, label: 'Hủy' }
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                let count = 0;
                let total = this.selected.length;
                this.selected.forEach(row => {
                    this._crawlService.removeCollection({
                        _id: this.selectedCollection._id,
                        uuid: row.uuid,
                        username: this.user.name
                    }).subscribe(res => {
                        count++;
                        if (res.success || res.ok) {
                            if (this.selectedCollection.uuid && Array.isArray(this.selectedCollection.uuid)) {
                                this.selectedCollection.uuid = this.selectedCollection.uuid.filter(u => u !== row.uuid);
                            }
                        }
                        if (count === total) {
                            this.toastr.success(`Đã gỡ ${total} công việc khỏi tập`);
                            this.onChangeCollection();
                        }
                    });
                });
            }
        });
    }

    hasVideoProject(uuid: string): boolean {
        if (!uuid) return false;
        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_audio_merger_data_${uuid}`);
        }
        return false;
    }

    hasScriptProject(row: any): boolean {
        if (!row || !row.uuid) return false;
        if (row.has_script) return true;
        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_script_data_${row.uuid}`);
        }
        return false;
    }

    hasCollectionScript(): boolean {
        const activeCol = this.selectedCollection || (this.collections && this.collections[0]);
        if (!activeCol) return false;

        let firstUuid = '';
        if (Array.isArray(activeCol.uuid) && activeCol.uuid.length > 0) {
            firstUuid = activeCol.uuid[0];
        } else if (typeof activeCol.uuid === 'string') {
            firstUuid = activeCol.uuid;
        } else if (this.rows && this.rows.length > 0 && this.rows[0].uuid) {
            firstUuid = this.rows[0].uuid;
        }

        if (!firstUuid) return false;
        if (activeCol.has_script) return true;

        if (this.multiAccountService) {
            return !!this.multiAccountService.getItem(`ai_type_script_data_${firstUuid}`) ||
                   !!this.multiAccountService.getItem(`ai_type_script_data_${activeCol._id}`);
        }
        return false;
    }

    readCollectionScript() {
        const activeCol = this.selectedCollection || (this.collections && this.collections[0]);
        if (!activeCol) return;

        let firstUuid = '';
        if (Array.isArray(activeCol.uuid) && activeCol.uuid.length > 0) {
            firstUuid = activeCol.uuid[0];
        } else if (typeof activeCol.uuid === 'string') {
            firstUuid = activeCol.uuid;
        } else if (this.rows && this.rows.length > 0 && this.rows[0].uuid) {
            firstUuid = this.rows[0].uuid;
        }

        if (!firstUuid) {
            this.toastr.warning('Không tìm thấy UUID của Collection!', 'Cảnh báo');
            return;
        }

        const username = this.user?.name || 'admin';
        this.router.navigate(['/ai-writer', username, firstUuid, 'script']);
    }

    isGeneratingCollectionScript: boolean = false;

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
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
        });
        return resultDocs;
    }

    async generateCollectionScriptFromCollectionPage() {
        if (this.isGeneratingCollectionScript) return;

        if (!this.selectedCollection && (!this.collections || this.collections.length === 0)) {
            this.toastr.warning('Vui lòng chọn 1 Bộ sưu tập (Collection) để tạo kịch bản!', 'Cảnh báo');
            return;
        }

        const activeCol = this.selectedCollection || (this.collections && this.collections[0]);
        const collectionTitle = activeCol?.title || 'Kịch bản Bộ Tiểu Thuyết';
        
        let uuids: string[] = [];
        if (activeCol) {
            if (Array.isArray(activeCol.uuid)) {
                uuids = activeCol.uuid;
            } else if (activeCol.uuid) {
                uuids = [activeCol.uuid];
            }
        }

        if (uuids.length === 0 && this.rows && this.rows.length > 0) {
            uuids = this.rows.map((r: any) => r.uuid).filter((u: any) => !!u);
        }

        if (uuids.length === 0) {
            this.toastr.warning('Collection này chưa có bài viết nào để dựng kịch bản!', 'Trống');
            return;
        }

        this.isGeneratingCollectionScript = true;
        this.cd.markForCheck();

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
                    const contentFromDone = (art.done || '').trim();
                    if (!contentFromDone) continue;

                    this.toastr.info(`[Chương ${idx + 1}/${fullDocs.length}] Đang dựng kịch bản mổ xẻ chi tiết cho: "${chapterTitle}"...`, 'Đang xử lý từng chương');

                    let prompt = `Bạn là một Nhà biên kịch Điện ảnh Chuyên nghiệp.
Nhiệm vụ của bạn là CHUYỂN THỂ TRUNG THỰC TUYỆT ĐỐI (100% High-Fidelity Adaptation) CHƯƠNG ${idx + 1}/${fullDocs.length} thuộc tác phẩm dưới đây thành một KỊCH BẢN PHIM ĐIỆN ẢNH chuẩn mực chiếu rạp.

TIÊU ĐỀ TÁC PHẨM TỔNG THỂ: ${collectionTitle}
CHƯƠNG HIỆN TẠI (CHƯƠNG ${idx + 1}/${fullDocs.length}): ${chapterTitle}
`;
                    if (art.style) {
                        if (typeof art.style === 'string' && art.style.trim()) {
                            prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n${art.style.trim()}\n`;
                        } else if (typeof art.style === 'object') {
                            const styleName = art.style.name || '';
                            const styleDesc = art.style.desc || '';
                            if (styleName || styleDesc) {
                                prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n`;
                                if (styleName) prompt += `- Tên phong cách: ${styleName}\n`;
                                if (styleDesc) prompt += `- Mô tả phong cách: ${styleDesc}\n`;
                            }
                        }
                    }

                    prompt += `\nNỘI DUNG VĂN BẢN GỐC CỦA CHƯƠNG NÀY (TRƯỜNG DONE):
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
                            
                            this.router.navigate(['/ai-writer', username, firstUuid, 'script']);
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
