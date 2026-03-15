import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { UserClientService } from 'app/modules/_services/user';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import moment from 'moment';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { LogService } from 'app/modules/_services/link';
import { CrawlService } from 'app/modules/_services/crawl';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'dashboard',
    templateUrl: './dashboard.component.html',
    providers: [UserClientService, CrawlService, ChatGPTService, CrawlService, WP2MDService, LogService],
    encapsulation: ViewEncapsulation.None
})
export class DashboardComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    appVersion: string = '1.0.0'; // Giá trị mặc định
    activeInfo: any = {};

    _statistics = {
        done: 0,
        writing: 0,
        money: 0,
        archives: 0,
        wp2md: 0,
        faceposts: 0
    };

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // lấy số liệu công việc cho mỗi user
    createStatistic() {
        forkJoin([
            this._crawlService.statistics({
                username: this.user.name
            }),
            this._chatGPTService.total({
                username: this.user.name
            }),
            this._wp2mdService.totalWp2mdArchive({
                username: this.user.name
            }),
            this._crawlService.faceTotalPost({
                username: this.user.name
            }),
            this._logService.total({
                username: this.user.name
            }),
        ]).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (results) => {
                const nodes = (results && results[0] && results[0].data) ? results[0].data : [[], 0, 0];
                const chatgpt = (results && results[1] && results[1].data) ? results[1].data : { total: 0 };
                const wp2md = (results && results[2] && results[2].data) ? results[2].data : { total: 0 };
                const faceposts = (results && results[3] && results[3].data) ? results[3].data : { total: 0 };
                const links = (results && results[4] && results[4].data) ? results[4].data : { total: 0 };

                this.statistics[`${this.user.name}`] = {
                    done: nodes[0].length,
                    money: nodes[0].reduce((total: number, obj: any) => obj.amount + total, 0),
                    archives: nodes[2]['total'],
                    writing: nodes[1]['total'],
                    chatgpt: chatgpt['total'],
                    wp2md: wp2md['total'],
                    faceposts: faceposts['total'],
                    links: links['total'],
                }

                // tạo báo cáo
                this.createReport();
            },
            error: (e: any) => {
                console.log('e', e)
            },
            complete: () => { }
        });
    }

    // tạo báo cáo công việc cho mỗi user
    createReport() {
        this._userClientService.renderTable({
            username: this.user.name,
            createdAt1: moment().startOf('day').toString(),
            createdAt2: moment().endOf('day').toString(),
            table: {
                key: 'table',
                value: this.statistics[this.user.name]
            }
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result && result.success) {
                        localStorage.setItem('statistics', JSON.stringify(this.statistics[`${this.user.name}`]));
                        this.statistics();
                    }
                },
                error: () => { },
                complete: () => { }
            });
    }

    // lấy account về để đồng bộ
    account() {
        this._userClientService.profile({
            name: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        // // Nếu đã active rồi thì lấy về và không yêu cầu active lại nữa
                        // localStorage.setItem('active_info', result.data.active_info);

                        if (result.data.styles && result.data.styles.length > 0) localStorage.setItem('styles', JSON.stringify(result.data.styles));
                        if (result.data.editor) localStorage.setItem('editor', JSON.stringify(result.data.editor));
                        if (result.data.following_users) localStorage.setItem('following_users', JSON.stringify(result.data.following_users));

                        if (result.data.settings) this.multiAccountService.setItem('settings', result.data.settings);

                        // lập báo cáo theo ngày
                        this.createStatistic();
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    statistics() {
        let temp = localStorage.getItem('statistics');
        if (temp && temp !== 'undefined') {
            temp = JSON.parse(temp);

            this._statistics.done = temp['done'] ? temp['done'] : 0;
            this._statistics.money = temp['money'] ? temp['money'] : 0;
            this._statistics.archives = temp['archives'] ? temp['archives'] : 0;
            this._statistics.writing = temp['writing'] ? temp['writing'] : 0;
            this._statistics.wp2md = (temp['wp2md']) ? temp['wp2md'] : 0;
            this._statistics.faceposts = (temp['faceposts']) ? temp['faceposts'] : 0;
        }
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _chatGPTService: ChatGPTService,
        private _logService: LogService,
        private _crawlService: CrawlService,
        private _wp2mdService: WP2MDService,
        private _userClientService: UserClientService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService
    ) {
        this.titleService.setTitle(`thống kê | ai.type - công cụ tạo content`);

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

                if (user.reputation < 0) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }

                // đồng bộ account về máy
                this.account();
                this.statistics();
            });

        const activeInfo = this.multiAccountService.getItem('active_info');
        if (activeInfo && activeInfo != 'null' && activeInfo != 'undefined') {
            this.activeInfo = AuthUtils._getActiveInfo(activeInfo);
        }
    }

    async ngOnInit(): Promise<void> {
        // throw new Error('Method not implemented.');

        // Kiểm tra xem có đang chạy trong môi trường Electron không
        if ((window as any).electron) {
            this.appVersion = await (window as any).electron.getAppVersion();
        }
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
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

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}
