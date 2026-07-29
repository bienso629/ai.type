import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/_services/crawl';
import { Subject, takeUntil } from 'rxjs';
import { Page, PageInfo } from 'app/core/navigation/navigation.types';
import { ActivatedRoute } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'app-collection',
    templateUrl: './collection.component.html',
    styleUrls: ['./collection.component.scss'],
    providers: [CrawlService],
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
        private multiAccountService: MultiAccountService
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

        let uuids = Array.isArray(this.selectedCollection.uuid) ? this.selectedCollection.uuid : (this.selectedCollection.uuid ? [this.selectedCollection.uuid] : []);

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

        if (this.rows && this.rows[rowOffset]) return;
        if (this.cache[this.page.pageNumber]) return;

        this.cache[this.page.pageNumber] = true;
        this.isLoading = true;
        this.cd.markForCheck();

        let uuids = Array.isArray(this.selectedCollection.uuid) ? this.selectedCollection.uuid : (this.selectedCollection.uuid ? [this.selectedCollection.uuid] : []);

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
                        if (!this.rows) {
                            this.rows = new Array<any>(this.totalElements || 0);
                        }

                        let newTotal = this.totalElements || 0;
                        if (start + resData.docs.length > newTotal) {
                            newTotal = start + resData.docs.length;
                        }

                        if (this.totalElements !== newTotal) {
                            this.totalElements = newTotal;
                        }

                        if (this.rows.length !== this.totalElements) {
                            const oldRows = this.rows;
                            this.rows = new Array<any>(this.totalElements);
                            for (let i = 0; i < oldRows.length; i++) {
                                this.rows[i] = oldRows[i];
                            }
                        }

                        const rows = [...this.rows];
                        rows.splice(start, resData.docs.length, ...resData.docs);
                        this.rows = rows;
                        this.apiFetchedCount += resData.docs.length;
                        this.currentBookmark = resData.bookmark;
                        this.cd.detectChanges();
                    } else if (resData && resData.docs && resData.docs.length === 0 && resData.bookmark && resData.bookmark !== this.currentBookmark) {
                        this.currentBookmark = resData.bookmark;
                        this.isLoading = false;
                        delete this.cache[this.page.pageNumber];
                        this.cd.detectChanges();
                        this.setPage(pageInfo);
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
}
