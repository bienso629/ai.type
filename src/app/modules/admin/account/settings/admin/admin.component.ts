import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { BlogService } from 'app/modules/_services/blog';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { CrawlService } from 'app/modules/_services/crawl';
import { UserClientService } from 'app/modules/_services/user';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { N8nService } from 'app/modules/_services/n8n.service';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Subject, takeUntil } from 'rxjs';

import moment from 'moment';

@Component({
    selector: 'settings-admin',
    templateUrl: './admin.component.html',
    providers: [BlogService, UserClientService, ChatGPTService, WP2MDService, CrawlService, N8nService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsAdminComponent implements OnInit, OnDestroy {
    user: User;
    chatgptForm: UntypedFormGroup;

    statistics: any = {};

    users = [];
    collectionNames = [];

    // Biến cũ
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    // --- BIẾN CHO TÍNH NĂNG N8N ---
    n8nWorkflows: any[] = [];
    n8nSelected: any[] = [];
    n8nLoading: boolean = false;
    // -------------------------------

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private titleService: Title,
        private _formBuilder: UntypedFormBuilder,
        private router: Router,
        private _fuseConfirmationService: FuseConfirmationService, // Đã inject sẵn
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _crawlService: CrawlService,
        private _blogService: BlogService,
        private _wp2mdService: WP2MDService,
        private _chatgptService: ChatGPTService,
        private _n8nService: N8nService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef
    ) {
        this.titleService.setTitle(`quản lý server | ai.type - công cụ tạo content`);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    ngOnInit(): void {
        this.chatgptForm = this._formBuilder.group({
            'gradio_gologin': [localStorage.getItem('gradio_gologin'), Validators.required],
        });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.getUsers();

                if (user.reputation < 100000) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return row.username !== 'Ethel Price';
    }

    save() {
        localStorage.setItem('gradio_gologin', this.chatgptForm.get('gradio_gologin').value);
        let url = [this.chatgptForm.get('gradio_gologin').value];

        this._blogService.save({
            url: url.join(';'),
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result) this.toastr.success(`Lưu cấu hình API.`);
                },
                error: () => this.toastr.error('Lưu không thành công.')
            });
    }

    getUsers() {
        this._userClientService.users({ username: this.user.name })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success) {
                        if (result.data?.users) this.users = result.data.users;
                        if (result.data?.collectionNames) this.collectionNames = result.data.collectionNames;
                        this.toastr.success(`Tải danh sách khách hàng.`);
                    }
                },
                error: () => this.toastr.error('Không tải được danh sách khách hàng.'),
                complete: () => this.cd.markForCheck()
            });
    }

    renderStatistic(user: any) {
        forkJoin([
            this._crawlService.statistics({ username: user.username }),
            this._chatgptService.total({ username: user.username }),
            this._wp2mdService.totalWp2mdArchive({ username: user.username })
        ]).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (results) => {
                if (results) {
                    const nodes = results[0].data;
                    const chatgpt = results[1].data;
                    const wp2md = results[2].data;

                    this.statistics[`${user.username}`] = {
                        done: nodes[0].length,
                        money: nodes[0].reduce((total: number, obj: any) => obj.amount + total, 0),
                        archives: nodes[2],
                        writing: nodes[1],
                        chatgpt: chatgpt['total'],
                        wp2md: wp2md['total']
                    }
                    this.createReport(user);
                }
            },
            complete: () => this.cd.markForCheck()
        });
    }

    createReport(user: any) {
        this._userClientService.renderTable({
            username: user.username,
            createdAt1: moment().startOf('day').toString(),
            createdAt2: moment().endOf('day').toString(),
            table: { key: 'table', value: this.statistics[user.username] }
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success) this.toastr.success(`Tạo báo cáo thành công!`);
                },
                error: () => this.toastr.error('Không tạo được báo cáo.')
            });
    }

    renderTable() {
        this.selected.map(user => this.renderStatistic(user));
    }

    turnOnTTSModel() {
        this._blogService.loadmodel({ use_deepspeed: false, username: this.user.name })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (res: any) => this.toastr.success(`Bật model thành công!`),
                error: () => this.toastr.error('Không bật được model.')
            });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ N8N METHODS (Đã cập nhật Confirm Dialog đẹp hơn)
    // -----------------------------------------------------------------------------------------------------

    onN8nSelect({ selected }) {
        this.n8nSelected.splice(0, this.n8nSelected.length);
        this.n8nSelected.push(...selected);
    }

    getN8nWorkflows() {
        this.n8nLoading = true;
        this.cd.markForCheck();

        this._n8nService.getWorkflows()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (res: any) => {
                    if (res && res.data) {
                        this.n8nWorkflows = res.data;
                        this.toastr.success(`Đã tải ${this.n8nWorkflows.length} workflows.`);
                    }
                },
                error: (err) => {
                    console.error(err);
                    this.toastr.error('Lỗi khi tải danh sách N8N Workflows.');
                    this.n8nLoading = false;
                    this.cd.markForCheck();
                },
                complete: () => {
                    this.n8nLoading = false;
                    this.cd.markForCheck();
                }
            });
    }

    /**
     * Xóa 1 workflow - Sử dụng FuseConfirmationService
     */
    deleteWorkflow(row: any) {
        // Mở dialog confirm đẹp
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa Workflow',
            message: `Bạn có chắc chắn muốn xóa vĩnh viễn workflow <span class="font-bold">${row.name}</span> không?<br>Hành động này không thể hoàn tác!`,
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'warn'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa ngay',
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: 'Hủy bỏ'
                }
            },
            dismissible: true
        });

        // Xử lý sau khi đóng dialog
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._n8nService.deleteWorkflow(row.id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: () => {
                            this.toastr.success(`Đã xóa: ${row.name}`);
                            this.n8nWorkflows = this.n8nWorkflows.filter(w => w.id !== row.id);
                            this.n8nSelected = this.n8nSelected.filter(w => w.id !== row.id);
                            this.cd.markForCheck();
                        },
                        error: () => this.toastr.error('Xóa thất bại.')
                    });
            }
        });
    }

    /**
     * Xóa nhiều workflow - Sử dụng FuseConfirmationService
     */
    async deleteSelectedWorkflows() {
        const count = this.n8nSelected.length;
        if (count === 0) return;

        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa nhiều Workflow',
            message: `Bạn đang chọn xóa <span class="font-bold text-red-500">${count}</span> workflows.<br>Bạn có chắc chắn muốn tiếp tục không?`,
            icon: {
                show: true,
                name: 'feather:trash-2',
                color: 'warn'
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
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                this.n8nLoading = true;
                this.cd.markForCheck();

                let deletedCount = 0;
                const deletePromises = this.n8nSelected.map((wf: any) => {
                    return new Promise<void>((resolve) => {
                        this._n8nService.deleteWorkflow(wf.id).subscribe({
                            next: () => {
                                deletedCount++;
                                resolve();
                            },
                            error: () => resolve()
                        });
                    });
                });

                await Promise.all(deletePromises);

                this.toastr.success(`Đã xóa thành công ${deletedCount}/${count} workflows.`);
                this.n8nSelected = [];
                this.getN8nWorkflows();
            }
        });
    }

    /**
     * Xóa theo prefix [API] - Sử dụng FuseConfirmationService
     */
    async clearApiWorkflows() {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Dọn dẹp hệ thống',
            message: `Hành động này sẽ xóa <b>TẤT CẢ</b> workflow có tên bắt đầu bằng <span class="bg-gray-200 px-1 rounded font-mono">[API]</span>.<br>Bạn có chắc chắn không?`,
            icon: {
                show: true,
                name: 'feather:alert-octagon',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xác nhận xóa',
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: 'Thôi, đừng xóa'
                }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.n8nLoading = true;
                this.cd.markForCheck();

                this._n8nService.getWorkflows()
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: async (res: any) => {
                            const allWorkflows = res.data || [];
                            const PREFIX = "[API]";
                            const apiWorkflows = allWorkflows.filter((wf: any) => wf.name?.startsWith(PREFIX));

                            if (apiWorkflows.length === 0) {
                                this.toastr.info('Không tìm thấy workflow nào có tiền tố [API].');
                                this.n8nLoading = false;
                                this.cd.markForCheck();
                                return;
                            }

                            this.toastr.info(`Đang tiến hành xóa ${apiWorkflows.length} workflows...`);

                            let deletedCount = 0;
                            const deletePromises = apiWorkflows.map((wf: any) => {
                                return new Promise<void>((resolve) => {
                                    this._n8nService.deleteWorkflow(wf.id).subscribe({
                                        next: () => {
                                            deletedCount++;
                                            resolve();
                                        },
                                        error: () => resolve()
                                    });
                                });
                            });

                            await Promise.all(deletePromises);

                            this.toastr.success(`Hoàn tất! Đã xóa ${deletedCount} workflows.`);
                            this.getN8nWorkflows();
                        },
                        error: () => {
                            this.toastr.error('Lỗi khi lấy danh sách để xóa.');
                            this.n8nLoading = false;
                            this.cd.markForCheck();
                        }
                    });
            }
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Helper methods
    // -----------------------------------------------------------------------------------------------------

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