import {
    Component,
    ChangeDetectionStrategy,
    ViewEncapsulation,
    OnInit,
    OnDestroy,
    AfterViewInit,
    ViewChild,
    ChangeDetectorRef,
    NgZone
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { ColumnMode, SelectionType, DatatableComponent } from '@swimlane/ngx-datatable';
import { Subject, takeUntil } from 'rxjs';

import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MXHAutoService } from 'app/_services/mxhauto';
import { N8nService } from 'app/_services/n8n.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { GenaiService } from 'app/genai.service';
import { CrawlService } from 'app/_services/crawl';
import { BlogService } from 'app/_services/blog';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AMXHScriptAppComponent } from '../script/script.component';

@Component({
    selector: 'amxh-type',
    templateUrl: './type.component.html',
    styleUrls: ['./type.component.scss'],
    providers: [CrawlService, BlogService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AMXHTypeComponent extends AMXHScriptAppComponent implements OnInit, OnDestroy, AfterViewInit {
    override platform: string = 'type';

    // Archives State
    archiveRows: any[] = [];
    archiveSelected: any[] = [];
    archiveTotalElements: number = 0;
    actualTotalArchives: number = 0;
    archivePageNumber: number = 0;
    archiveIsLoading: boolean = false;
    archiveKeyword: string = '';
    archiveCollections: any[] = [];
    archiveSelectedCollections: any[] = [];
    archiveUuids: any[] = [];
    archivePage: Page = {
        pageNumber: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0
    };
    archiveBookmark: string = null;
    archiveCache: Record<string, boolean> = {};

    @ViewChild('archiveTable') archiveTable: DatatableComponent;

    constructor(
        titleService: Title,
        userService: UserService,
        mxhautoService: MXHAutoService,
        toastr: ToastrService,
        fuseConfigService: FuseConfigService,
        fuseConfirmationService: FuseConfirmationService,
        router: Router,
        cd: ChangeDetectorRef,
        zone: NgZone,
        matDialog: MatDialog,
        n8nService: N8nService,
        multiAccountService: MultiAccountService,
        genaiService: GenaiService,
        public crawlService: CrawlService
    ) {
        super(
            titleService,
            userService,
            mxhautoService,
            toastr,
            fuseConfigService,
            fuseConfirmationService,
            router,
            cd,
            zone,
            matDialog,
            n8nService,
            multiAccountService,
            genaiService
        );
        this.platform = 'type';
    }

    get currentUsername(): string {
        if (this.user?.name) return this.user.name;
        try {
            let activeInfo = this.multiAccountService.getItem('active_info');
            if (activeInfo) {
                const parsed = AuthUtils._getActiveInfo(activeInfo);
                if (parsed?.user?.name) return parsed.user.name;
                if (parsed?.user?.username) return parsed.user.username;
            }
        } catch (e) {}
        return this.user?.name || 'admin';
    }

    override ngOnInit(): void {
        super.ngOnInit();

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                if (user && user.name) {
                    this.user = user;
                    this.loadArchiveCollections();
                    this.searchArchiveNode();
                }
            });

        if (this.currentUsername && this.currentUsername !== 'admin') {
            this.loadArchiveCollections();
            this.searchArchiveNode();
        }
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    // --- ARCHIVE COLLECTIONS ---
    loadArchiveCollections(): void {
        const username = this.currentUsername;
        if (!username) return;

        this.crawlService.collections({
            username: username,
            page: { size: 100 },
            includeUuid: true
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (result: any) => {
                if (result && result.success) {
                    this.archiveCollections = result.data || [];
                    this.cd.markForCheck();
                }
            },
            error: () => {}
        });
    }

    onChangeArchiveCollection(): void {
        if (this.archiveSelectedCollections && this.archiveSelectedCollections.length > 0) {
            const uuidsSet = new Set<string>();
            this.archiveSelectedCollections.forEach((col: any) => {
                if (col.uuids && Array.isArray(col.uuids)) {
                    col.uuids.forEach((id: string) => uuidsSet.add(id));
                }
            });

            this.archiveUuids = Array.from(uuidsSet);
            if (this.archiveUuids.length === 0) {
                const selectedIds = this.archiveSelectedCollections.map((c: any) => c._id || c.id);
                this.crawlService.getUUIDsInCollection({
                    username: this.currentUsername,
                    collectionIds: selectedIds
                }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                    next: (res: any) => {
                        if (res && res.success && res.data) {
                            this.archiveUuids = res.data;
                            this.fetchNodesByUUIDs();
                        }
                    }
                });
                return;
            }
            this.fetchNodesByUUIDs();
        } else {
            this.archiveUuids = [];
            this.searchArchiveNode();
        }
    }

    onClearArchiveCollection(): void {
        this.archiveSelectedCollections = [];
        this.archiveUuids = [];
        this.searchArchiveNode();
    }

    private fetchNodesByUUIDs(): void {
        if (this.archiveUuids.length === 0) {
            this.archiveRows = [];
            this.archiveTotalElements = 0;
            this.cd.markForCheck();
            return;
        }

        this.archiveIsLoading = true;
        this.cd.markForCheck();

        this.crawlService.getNodesInCollection({
            username: this.currentUsername,
            uuids: this.archiveUuids,
            page: { pageNumber: 0, size: 100 }
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (res: any) => {
                this.archiveIsLoading = false;
                if (res && res.success && res.data) {
                    let docs = res.data.docs || res.data;
                    if (this.archiveKeyword) {
                        const kw = this.archiveKeyword.toLowerCase();
                        docs = docs.filter((d: any) => d.title && d.title.toLowerCase().includes(kw));
                    }
                    this.archiveRows = [...docs];
                    this.archiveTotalElements = this.archiveRows.length;
                } else {
                    this.archiveRows = [];
                    this.archiveTotalElements = 0;
                }
                this.cd.markForCheck();
            },
            error: () => {
                this.archiveIsLoading = false;
                this.cd.markForCheck();
            }
        });
    }

    // --- SEARCH & PAGINATION ---
    searchArchiveNode(): void {
        this.archiveIsLoading = false;
        if (this.archiveTable) this.archiveTable.offset = 0;

        this.archiveSelected = [];
        this.archiveBookmark = null;
        this.archiveCache = {};
        this.archiveRows = [];

        this.cd.markForCheck();

        if (this.archiveUuids.length > 0) {
            this.onChangeArchiveCollection();
            return;
        }

        const query = {
            username: this.currentUsername,
            keyword: this.archiveKeyword,
            uuids: this.archiveUuids,
            page: this.archivePage
        };

        this.crawlService.searchTotalArchive(query)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    let total = result?.data?.total;
                    if (total === undefined) total = result?.data?.data?.total;

                    if (total !== undefined) {
                        this.actualTotalArchives = total;
                    } else {
                        const temp = localStorage.getItem('statistics');
                        if (temp && temp !== 'undefined') {
                            try {
                                const stats = JSON.parse(temp);
                                this.actualTotalArchives = stats['archives'] || 0;
                            } catch (e) {
                                this.actualTotalArchives = 0;
                            }
                        } else {
                            this.actualTotalArchives = 0;
                        }
                    }

                    this.setArchivePage({
                        offset: 0,
                        pageSize: this.archivePage.size,
                        limit: this.archivePage.size,
                        count: this.actualTotalArchives
                    });
                },
                complete: () => {
                    if (this.archiveTable) this.archiveTable.recalculatePages();
                    this.cd.markForCheck();
                }
            });
    }

    setArchivePage(pageInfo: PageInfo): void {
        if (!pageInfo.pageSize) pageInfo.pageSize = this.archivePage.size || 20;
        this.archivePageNumber = pageInfo.offset;
        const rowOffset = pageInfo.offset * pageInfo.pageSize;
        const targetPage = Math.floor(rowOffset / pageInfo.pageSize);

        if (this.archiveIsLoading && this.archivePage.pageNumber === targetPage) return;

        this.archivePage = {
            pageNumber: targetPage,
            size: pageInfo.pageSize,
            totalElements: 0,
            totalPages: 0
        };

        if (this.archiveRows && this.archiveRows[rowOffset]) {
            return;
        }
        if (this.archiveCache[this.archivePage.pageNumber]) return;
        this.archiveCache[this.archivePage.pageNumber] = true;
        this.archiveIsLoading = true;
        this.cd.markForCheck();

        const payloadPage = { ...this.archivePage };

        this.crawlService.archive({
            username: this.currentUsername,
            keyword: this.archiveKeyword,
            uuids: this.archiveUuids,
            page: payloadPage,
            bookmark: this.archiveBookmark
        }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: (result: any) => {
                const start = this.archivePage.pageNumber * this.archivePage.size;
                const resData = result?.data;
                if (resData && resData.docs && resData.docs.length > 0) {
                    const docs = resData.docs.map((doc: any) => ({
                        ...doc,
                        is_encrypted: this.isRowEncrypted(doc)
                    }));

                    const tempRows = [...this.archiveRows];
                    for (let i = 0; i < docs.length; i++) {
                        tempRows[start + i] = docs[i];
                    }
                    this.archiveRows = tempRows;
                    this.archiveBookmark = resData.bookmark || null;

                    const loadedCount = this.archiveRows.filter(x => !!x).length;
                    if (resData.docs.length < this.archivePage.size) {
                        this.archiveTotalElements = loadedCount;
                    } else if (this.actualTotalArchives > loadedCount) {
                        this.archiveTotalElements = this.actualTotalArchives;
                    } else {
                        this.archiveTotalElements = loadedCount + this.archivePage.size;
                    }
                } else if (resData && Array.isArray(resData)) {
                    this.archiveRows = [...resData];
                    this.archiveTotalElements = resData.length;
                } else if (resData && resData.docs && resData.docs.length === 0) {
                    this.archiveTotalElements = this.archiveRows.filter(x => !!x).length;
                    this.archiveRows = [...this.archiveRows];
                }

                this.archiveIsLoading = false;
                if (this.archiveTable) this.archiveTable.recalculatePages();
                this.cd.markForCheck();
            },
            error: () => {
                this.archiveIsLoading = false;
                this.cd.markForCheck();
            }
        });
    }

    // --- SELECTION & ROW HELPERS ---
    onArchiveSelect(event: { selected: any[] }): void {
        this.archiveSelected = event.selected || [];
        this.cd.markForCheck();
    }

    displayCheck(row: any): boolean {
        return row && !row.isGroupHeader && !!row.uuid;
    }

    getRowClass(row: any): string {
        return row?.isGroupHeader ? 'group-header-row bg-gray-50 dark:bg-gray-800/50' : '';
    }

    getDomainString(row: any): string {
        if (!row) return '';
        return row.source?.wp_domain || row.domain || row.wp_domain || '';
    }

    getDateDisplay(row: any): string {
        if (!row) return '';
        const d = row.updated_at || row.created_at || row.time || row.date;
        if (!d) return '';
        try {
            const dateObj = new Date(d);
            if (!isNaN(dateObj.getTime())) {
                return dateObj.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            }
        } catch (e) {}
        return String(d).substring(0, 10);
    }

    isRowEncrypted(row: any): boolean {
        if (!row) return false;
        return !!(row.is_encrypted || row.isEncrypted || (row.title && row.title.startsWith('U2FsdGVkX1')));
    }

    openRowArticle(row: any): void {
        if (!row || !row.uuid) return;
        this.router.navigate(['/ai-writer', row.uuid]);
    }

    openWPPost(row: any): void {
        const domain = this.getDomainString(row);
        if (!domain) return;
        let url = domain.startsWith('http') ? domain : `https://${domain}`;
        window.open(url, '_blank');
    }

    // --- INSERT ARTICLE INTO PROMPT ---
    insertArticleToPrompt(row: any): void {
        if (!row) return;

        const title = row.title || 'Bài viết';
        const uuid = row.uuid || '';
        const domain = this.getDomainString(row);

        let snippet = `[Bài viết: ${title}`;
        if (domain) snippet += ` | Domain: ${domain}`;
        if (uuid) snippet += ` | ID: ${uuid}`;
        snippet += `]`;

        let cur = this.chatInput || '';
        this.chatInput = cur ? `${cur.trim()}\n${snippet} ` : `${snippet} `;
        this.cd.markForCheck();

        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
            }
        }, 50);

        this.toastr.info(`Đã thêm bài viết "${title}" vào khung prompt.`);
    }

    insertSelectedArticlesToPrompt(): void {
        if (!this.archiveSelected || this.archiveSelected.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất một bài viết từ danh sách.');
            return;
        }

        const items = this.archiveSelected.map(r => {
            const domain = this.getDomainString(r);
            return `- ${r.title} (ID: ${r.uuid}${domain ? ', Domain: ' + domain : ''})`;
        }).join('\n');

        const prefix = `Tôi muốn đăng/chia sẻ các bài viết sau lên Diễn đàn Type:\n${items}\nHãy giúp tôi soạn thảo nội dung thảo luận và các tương tác phù hợp.`;

        let cur = this.chatInput || '';
        this.chatInput = cur ? `${cur.trim()}\n\n${prefix}` : prefix;
        this.cd.markForCheck();

        setTimeout(() => {
            if (this.scriptChatInputRef?.nativeElement) {
                this.scriptChatInputRef.nativeElement.focus();
            }
        }, 50);

        this.toastr.success(`Đã đưa ${this.archiveSelected.length} bài viết vào khung prompt.`);
    }
}
