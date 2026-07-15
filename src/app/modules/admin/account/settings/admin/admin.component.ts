import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { FuseConfigService } from '@fuse/services/config';
import { EmailDialogComponent } from './dialogs/email-dialog/email-dialog.component';
import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { BlogService } from 'app/modules/_services/blog';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { CrawlService } from 'app/modules/_services/crawl';
import { UserClientService } from 'app/modules/_services/user';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { N8nService } from 'app/modules/_services/n8n.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { ForumService } from 'app/modules/_services/forum';

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
    tempUsers = [];
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

    // --- BIẾN CHO TÍNH NĂNG NODEBB EMAIL ---
    forumUsers: any[] = [];
    tempForumUsers: any[] = [];
    forumSelected: any[] = [];
    isSendingEmail: boolean = false;
    emailProgressStatus: string = '';
    emailSuccess: number = 0;
    emailFail: number = 0;
    emailTotal: number = 0;

    forumGroups: any[] = [];
    selectedGroups: any[] = [];
    isAddingToGroups: boolean = false;
    // -------------------------------

    // --- BIẾN CHO LỊCH SỬ GIAO DỊCH ---
    transactions: any[] = [];
    transactionsLoading: boolean = false;
    transactionEmailSearch: string = '';
    config: any;
    // --- BIẾN CHO PLUGINS ---
    plugins: any[] = [];
    zaloPluginMode: string = 'tool';
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
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _matDialog: MatDialog,
        private _forumService: ForumService,
        private _fuseConfigService: FuseConfigService
    ) {
        this.titleService.setTitle(`admin | ai.type - công cụ tạo content`);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    ngOnInit(): void {
        const settings = this.multiAccountService.getItem('settings') || {};
        this.chatgptForm = this._formBuilder.group({
            'gradio_gologin': [settings.gradio_gologin || '', Validators.required],
        });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.getUsers();


            });

        if (this._fuseConfigService && this._fuseConfigService.config$) {
            this._fuseConfigService.config$
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe((config: any) => {
                    this.config = config;
                });
        }

        // Lắng nghe tiến trình gửi email từ Electron Main Process
        if ((window as any).electronAPI && (window as any).electronAPI.onEmailProgress) {
            (window as any).electronAPI.onEmailProgress((progress: any) => {
                this.emailSuccess = progress.success || this.emailSuccess;
                this.emailFail = progress.fail || this.emailFail;
                this.emailTotal = progress.total || this.emailTotal;
                
                if (progress.status === 'fetching_users') {
                    this.emailProgressStatus = 'Đang tải danh sách thành viên từ NodeBB...';
                } else if (progress.status === 'sending') {
                    this.emailProgressStatus = `Đang gửi mail cho ${progress.user} (${this.emailSuccess}/${this.emailTotal})`;
                }
                this.cd.detectChanges();
            });
        }

        // Lắng nghe thông báo tin nhắn mới từ Zalo Web (qua plugin) để hiển thị Toaster
        if ((window as any).electronAPI && (window as any).electronAPI.onZaloNotification) {
            (window as any).electronAPI.onZaloNotification((data: any) => {
                this.toastr.info(
                    `Phát hiện tin nhắn mới từ <b>${data.sender}</b>: "${data.text}"`,
                    'Zalo Plugin',
                    {
                        timeOut: 10000,
                        progressBar: true,
                        enableHtml: true
                    }
                );
            });
        }

        // Tải dữ liệu cho tab mặc định (Thành viên - index 0) vì onTabChanged không kích hoạt ở lần tải trang đầu tiên
        this.getForumUsers();
        this.getForumGroups();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------
    onTabChanged(event: any) {
        if (event.index === 0) { // Member
            if (!this.forumUsers || this.forumUsers.length === 0) {
                this.getForumUsers();
            }
            if (!this.forumGroups || this.forumGroups.length === 0) {
                this.getForumGroups();
            }
        } else if (event.index === 4) { // N8N
            if (!this.n8nWorkflows || this.n8nWorkflows.length === 0) {
                this.getN8nWorkflows();
            }
        } else if (event.index === 2) { // Lịch sử giao dịch
            if (!this.transactions || this.transactions.length === 0) {
                this.getTransactions();
            }
        }
    }

    async getTransactions() {
        this.transactionsLoading = true;
        this.cd.markForCheck();
        
        try {
            const apiUrl = this.config?.settings?.api[this.user?.server] || 'https://apiv1.type.vn/v1';
            let url = `${apiUrl}/payment/transactions`;
            if (this.transactionEmailSearch) {
                url += `?email=${encodeURIComponent(this.transactionEmailSearch)}`;
            }
            const response = await fetch(url);
            const res = await response.json();
            
            if (res && res.success) {
                this.transactions = res.data || [];
            } else {
                this.toastr.error('Không thể lấy lịch sử giao dịch.');
            }
        } catch (error) {
            console.error(error);
            this.toastr.error('Lỗi khi lấy lịch sử giao dịch.');
        } finally {
            this.transactionsLoading = false;
            this.cd.markForCheck();
        }
    }

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    onForumSelect({ selected }) {
        this.forumSelected.splice(0, this.forumSelected.length);
        this.forumSelected.push(...selected);
    }

    displayCheck(row: any) {
        return row.username !== 'Ethel Price';
    }

    saveZaloMode() {
        // ... (logic để gửi request lên server nếu cần)
        // Ví dụ:
        // const res = await this._pluginService.updateMode(this.zaloPluginMode);
        // if (res && res.success) {
        //     this.toastr.success('Đã cập nhật chế độ chạy Zalo.');
        // }
        
        // Lưu cấu hình vào LocalStorage
        const settings = this.multiAccountService.getItem('settings') || {};
        settings.zaloPluginMode = this.zaloPluginMode;
        this.multiAccountService.setItem('settings', settings);
        this.cd.detectChanges();
    }

    save() {
        const settings = this.multiAccountService.getItem('settings') || {};
        settings.gradio_gologin = this.chatgptForm.get('gradio_gologin').value;
        this.multiAccountService.setItem('settings', settings);

        const editor = this.multiAccountService.getItem('editor');
        const following_users = this.multiAccountService.getItem('following_users');

        this._userClientService.updateProfile({
            profile: {
                settings: settings,
                active_info: this.multiAccountService.getItem('active_info'),
                editor: (editor && editor !== 'undefined') ? editor : {},
                following_users: (following_users && following_users !== 'undefined') ? following_users : [],
            },
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    if (result && result.success) {
                        this.toastr.success(`Đã lưu thiết lập API lên server.`);
                    } else {
                        this.toastr.error('Lưu thiết lập API thất bại.');
                    }
                },
                error: () => this.toastr.error('Lưu không thành công.')
            });
        
        let url = [this.chatgptForm.get('gradio_gologin').value];

        this._blogService.save({
            url: url.join(';'),
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe();
    }

    getUsers() {
        this._userClientService.users({ username: this.user.name })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success) {
                        if (result.data?.users) {
                            this.users = result.data.users;
                            this.tempUsers = [...result.data.users];
                        }
                        if (result.data?.collectionNames) this.collectionNames = result.data.collectionNames;
                        this.toastr.success(`Tải danh sách khách hàng.`);
                    }
                },
                error: () => this.toastr.error('Không tải được danh sách khách hàng.'),
                complete: () => this.cd.markForCheck()
            });
    }

    async getForumUsers() {
        const settings = this.multiAccountService.getItem('settings') || {};
        if (!settings.emailConfig_nodebbUrl || !settings.emailConfig_nodebbToken) {
            this.toastr.warning('Vui lòng vào Cấu hình -> Tài khoản để thiết lập Type.VN URL và Token trước.');
            return;
        }

        if (!(window as any).electronAPI || !(window as any).electronAPI.fetchForumUsers) {
            this.toastr.error('Chưa kết nối được với hệ thống Electron.');
            return;
        }

        this.n8nLoading = true;
        this.cd.detectChanges();

        try {
            const config = {
                nodebbUrl: settings.emailConfig_nodebbUrl,
                nodebbToken: settings.emailConfig_nodebbToken
            };
            const result = await (window as any).electronAPI.fetchForumUsers(config);
            if (result && result.success) {
                this.forumUsers = result.users;
                this.tempForumUsers = [...result.users];
                this.forumUsers = [...this.forumUsers];
                this.toastr.success(`Đã tải ${this.forumUsers.length} thành viên.`);
            } else {
                this.toastr.error('Lỗi khi tải thành viên: ' + (result?.error || 'Unknown'));
            }
        } catch (error) {
            this.toastr.error('Lỗi kết nối Electron: ' + error.message);
        }

        this.n8nLoading = false;
        this.cd.detectChanges();
    }

    async getForumGroups() {
        const settings = this.multiAccountService.getItem('settings') || {};
        if (!settings.emailConfig_nodebbUrl || !settings.emailConfig_nodebbToken) return;

        if (!(window as any).electronAPI || !(window as any).electronAPI.fetchForumGroups) return;

        try {
            const config = {
                nodebbUrl: settings.emailConfig_nodebbUrl,
                nodebbToken: settings.emailConfig_nodebbToken
            };
            const result = await (window as any).electronAPI.fetchForumGroups(config);
            if (result && result.success) {
                this.forumGroups = result.groups;
                this.cd.detectChanges();
            }
        } catch (error) {
            console.error('Lỗi tải nhóm NodeBB', error);
        }
        this.cd.detectChanges();
    }

    filterForumUsers(event: any) {
        const val = event.target.value.toLowerCase();

        // filter our data
        const temp = this.tempForumUsers.filter(function (d) {
            return (d.username && d.username.toLowerCase().indexOf(val) !== -1) || 
                   (d.email && d.email.toLowerCase().indexOf(val) !== -1) || 
                   !val;
        });

        // update the rows
        this.forumUsers = temp;
        this.cd.markForCheck();
    }

    filterReports(event: any) {
        const val = event.target.value.toLowerCase();

        // filter our data
        const temp = this.tempUsers.filter(function (d) {
            return (d.name && d.name.toLowerCase().indexOf(val) !== -1) || 
                   (d.email && d.email.toLowerCase().indexOf(val) !== -1) || 
                   !val;
        });

        // update the rows
        this.users = temp;
        this.cd.markForCheck();
    }

    onGroupSelectOpened(opened: boolean, row: any) {
        if (!opened || row.groupsLoaded) return;
        
        const server = this.user?.server || 'type';

        this._forumService.getGroups(server).subscribe({
            next: (result) => {
                if (result && result.success && result.data && result.data.groups) {
                    const groupSlugs: string[] = [];
                    result.data.groups.forEach((g: any) => {
                        if (g.members && Array.isArray(g.members)) {
                            g.members.forEach((m: any) => {
                                if (String(m.uid) === String(row.uid)) {
                                    if (!groupSlugs.includes(g.slug)) {
                                        groupSlugs.push(g.slug);
                                    }
                                }
                            });
                        }
                    });

                    // Đảm bảo Admin luôn nằm trong administrators
                    if (row.administrator && !groupSlugs.includes('administrators')) {
                        groupSlugs.push('administrators');
                    }

                    row.selectedGroups = groupSlugs;
                    row._originalGroups = [...row.selectedGroups];
                    row.groupsLoaded = true;
                    this.cd.markForCheck();
                } else {
                    this.toastr.error('Lỗi: Không lấy được dữ liệu nhóm từ server.');
                }
            },
            error: (error) => {
                console.error('Lỗi tải nhóm của user', error);
                this.toastr.error('Lỗi kết nối khi tải nhóm.');
            }
        });
    }

    async onUserGroupChange(row: any, newSelectedGroups: string[]) {
        const settings = this.multiAccountService.getItem('settings') || {};
        const config = {
            nodebbUrl: settings.emailConfig_nodebbUrl,
            nodebbToken: settings.emailConfig_nodebbToken
        };

        const original = row._originalGroups || [];
        const added = newSelectedGroups.filter(slug => !original.includes(slug));
        const removed = original.filter(slug => !newSelectedGroups.includes(slug));

        if (added.length > 0) {
            await (window as any).electronAPI.addForumUsersToGroups({
                userIds: [row.uid],
                groupSlugs: added,
                config: config
            });
        }
        if (removed.length > 0) {
            await (window as any).electronAPI.removeForumUsersFromGroups({
                userIds: [row.uid],
                groupSlugs: removed,
                config: config
            });
        }
        
        row._originalGroups = [...newSelectedGroups];
        this.toastr.success(`Đã cập nhật nhóm cho ${row.username}`);
    }

    async sendEmailToSelected() {
        if (this.forumSelected.length === 0) return;
        if (!(window as any).electronAPI || !(window as any).electronAPI.sendMassEmails) {
            this.toastr.error('Chưa kết nối được với hệ thống Electron.');
            return;
        }

        // Mở dialog soạn thảo email
        const dialogRef = this._matDialog.open(EmailDialogComponent, {
            width: '600px',
            disableClose: true,
            data: { selectedCount: this.forumSelected.length }
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result) {
                await this.confirmSendEmail(result);
            }
        });
    }

    async confirmSendEmail(emailComposer: any) {
        this.isSendingEmail = true;
        this.emailSuccess = 0;
        this.emailFail = 0;
        this.emailTotal = this.forumSelected.length;
        this.emailProgressStatus = 'Bắt đầu...';
        this.cd.markForCheck();

        const settings = this.multiAccountService.getItem('settings') || {};
        const emailConfig = {
            nodebbUrl: settings.emailConfig_nodebbUrl || 'https://type.vn',
            nodebbToken: settings.emailConfig_nodebbToken || '',
            smtpHost: settings.emailConfig_smtpHost || 'smtp.gmail.com',
            smtpPort: parseInt(settings.emailConfig_smtpPort || '587', 10),
            smtpUser: settings.emailConfig_smtpUser || '',
            smtpPass: settings.emailConfig_smtpPass || ''
        };

        try {
            const result = await (window as any).electronAPI.sendMassEmails({
                senderName: emailComposer.senderName,
                subject: emailComposer.subject,
                htmlContent: emailComposer.content,
                users: this.forumSelected,
                config: emailConfig
            });

            if (result && result.success) {
                this.toastr.success(result.message);
                this.emailProgressStatus = result.message;
            } else {
                this.toastr.error('Lỗi khi gửi email: ' + (result?.error || 'Unknown'));
                this.isSendingEmail = false;
            }
        } catch (error) {
            this.toastr.error('Lỗi kết nối Electron: ' + error.message);
            this.isSendingEmail = false;
        }

        this.cd.markForCheck();
    }

    renderStatistic(user: any) {
        forkJoin([
            this._crawlService.statistics({ username: user.username }),
            this._chatgptService.total({ username: user.username }),
            this._wp2mdService.totalWp2mdArchive({ username: user.username })
        ]).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (results) => {
                if (results) {
                    const nodes = results[0]?.data || [];
                    const chatgpt = results[1]?.data || { total: 0 };
                    const wp2md = results[2]?.data || { total: 0 };

                    this.statistics[`${user.username}`] = {
                        done: nodes[0] ? nodes[0].length : 0,
                        money: nodes[0] ? nodes[0].reduce((total: number, obj: any) => obj.amount + total, 0) : 0,
                        archives: nodes[2] || { total: 0 },
                        writing: nodes[1] || { total: 0 },
                        chatgpt: chatgpt['total'] || 0,
                        wp2md: wp2md['total'] || 0
                    };
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

    backupDatabase() {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Backup Cơ Sở Dữ Liệu',
            message: `Bạn có chắc chắn muốn đẩy toàn bộ cơ sở dữ liệu hiện tại lên máy chủ <b>data.type.vn</b> không?<br>Quá trình này sẽ chạy ngầm và đồng bộ dữ liệu.`,
            icon: {
                show: true,
                name: 'heroicons_outline:cloud-upload',
                color: 'info'
            },
            actions: {
                confirm: { show: true, label: 'Bắt đầu Backup', color: 'primary' },
                cancel: { show: true, label: 'Hủy' }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this._userClientService.backupDatabase({}).subscribe((res) => {
                    if (res && res.success) {
                        this._fuseConfirmationService.open({
                            title: 'Thành công',
                            message: res.message || 'Lệnh backup đã được gửi tới hệ thống.',
                            icon: { show: true, name: 'heroicons_outline:check-circle', color: 'success' },
                            actions: { confirm: { show: true, label: 'Đóng', color: 'primary' }, cancel: { show: false } }
                        });
                    } else {
                        this.error(res?.message || 'Có lỗi xảy ra khi thực hiện backup.');
                    }
                });
            }
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
            message: `Bạn có chắc chắn muốn xóa vĩnh viễn workflow <span class="font-semibold">${row.name}</span> không?<br>Hành động này không thể hoàn tác!`,
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
            message: `Bạn đang chọn xóa <span class="font-semibold text-red-500">${count}</span> workflows.<br>Bạn có chắc chắn muốn tiếp tục không?`,
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