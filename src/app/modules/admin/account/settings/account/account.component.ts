import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { UserClientService } from 'app/modules/_services/user';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'settings-account',
    templateUrl: './account.component.html',
    styleUrls: ['./account.component.scss'],
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsAccountComponent implements OnInit {
    config: AppConfig;
    user: User;
    uniqueID: String;
    fbCookiePath: String = "C:\\Users\\Wing386\\Documents\\ai.type\\cookie.json";

    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;

    accountForm: UntypedFormGroup;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Save
     */
    save(): void {
        // Return if the form is invalid
        if (this.accountForm.invalid) {
            this.toastr.error('Lưu cấu hình thất bại.');
        } else {
            let settings: any = this.accountForm.value;
            const editor = this.multiAccountService.getItem('editor');
            const following_users = this.multiAccountService.getItem('following_users');

            this._userClientService.updateProfile({
                profile: {
                    settings: settings,
                    active_info: this.multiAccountService.getItem('active_info'),
                    editor: (editor && editor != 'undefined') ? editor : {},
                    following_users: (following_users && following_users != 'undefined') ? following_users : [],
                },
                username: this.user.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            // lưu cấu hình mới nhất về máy
                            this.multiAccountService.setItem('settings', settings);
                            this.toastr.success(`Lưu cấu hình!`);
                        } else {
                            this.toastr.error(`Không thể lưu cấu hình.`);
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
                        this.connecting12345();
                    }
                });
        }
    }

    // kết nối với type-lite
    async connecting12345() {
        // Return if the form is invalid
        if (this.accountForm.invalid) {
            this.toastr.error(`Không thể kết nối ${this.accountForm.value['port']}.`);
        } else {
            const statusTypeLite = this.accountForm.value['statusTypeLite'];
            const data = {
                username: this.user.name,
                saveimages: this.accountForm.value['saveimages'],
                statusTypeLite: statusTypeLite,
                autosave: this.accountForm.value['autosave'],
                closethread: this.accountForm.value['closethread'],
                proccessing: this.accountForm.value['proccessing'],
                language: this.accountForm.value['language'],
                defaultlinks: this.accountForm.value['defaultlinks'],
                port: this.accountForm.value['port'],
                typelite_plugin: this.accountForm.value['typelite_plugin'],
                chatbot: this.accountForm.value['chatbot'],
                customer: this.accountForm.value['customer'],
                bigdata: this.accountForm.value['bigdata'],
                downloader_plugin: this.accountForm.value['downloader_plugin'],
                tts: this.accountForm.value['tts'],
                sst: this.accountForm.value['sst'],
                mxhauto: this.accountForm.value['mxhauto'],
                linkDonate: this.accountForm.value['linkDonate'],
                secretKey: this.accountForm.value['secretKey'],
                searchAPIKey: this.accountForm.value['searchAPIKey'],
                n8n: this.accountForm.value['n8n'],
            };

            if (statusTypeLite) {
                // await (window as any).electron.sendPM2Command('server.start');

                this._userClientService.connecting12345(data)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe();
            } else {
                this._userClientService.connecting12345(data)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        complete: () => {
                            // (window as any).electron.sendPM2Command('server.stop');
                        }
                    });
            }
        }
    }

    // kiểm tra đã kết nối tới type-lite chưa
    checkStatusTypeLite() {
        this._userClientService.checkStatusTypeLite({
            username: this.user.name,
            ktkn: 'kiemtraketnoi',
            port: this.accountForm.value['port']
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result.checked) {
                        this.accountForm.controls['statusTypeLite'].setValue(true);
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    // tắt type-lite
    typeLiteExit() {
        this._userClientService.exitTypeLite({
            username: this.user.name,
            port: this.accountForm.value['port']
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (data) => {
                },
                error: () => {
                    this.toastr.error(`Không thể tắt kết nối ${this.accountForm.value['port']}.`);
                },
                complete: () => {
                    this.toastr.success(`Tắt kết nối ${this.accountForm.value['port']} thành công!`);
                }
            });
    }

    onToggleChange(event: MatSlideToggleChange) {
        this.save();
    }

    async connectApps(url: string) {
        // Tạo uniqueID mỗi lần chụp
        // Khi bấm "Đăng nhập Facebook"
        this.uniqueID = Math.random().toString(36).substr(2, 9);
        (window as any).electron.tools({
            command: 'facebook-login',
            url: url,
            uniqueID: this.uniqueID,
            cookiePath: this.fbCookiePath // Đường dẫn file cookie .json đã lưu
        });
    }

    async downloadCookie() {
        // Tạo uniqueID mỗi lần chụp
        (window as any).electron.tools({
            command: 'get-facebook-cookies',
            uniqueID: this.uniqueID  // Sử dụng đúng mã vừa lưu
        });
    }

    async test(url: string) {
        // Tạo uniqueID mỗi lần chụp
        const uniqueID = Math.random().toString(36).substr(2, 9);
        await (window as any).electron.tools({
            url: url,
            command: 'website-crawl',
            uniqueID,
            facegroup: 'yourgroupid',
            maxPosts: 3,
            cookiePath: this.fbCookiePath // Đường dẫn file cookie .json đã lưu
        });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _formBuilder: UntypedFormBuilder,
        private toastr: ToastrService,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService
    ) {
        this.titleService.setTitle(`cấu hình tài khoản | ai.type - công cụ tạo content`);

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Nhận phản hồi
        this.unsubscribeRes = (window as any).electron.onToolsResponse((data: { action: string; success: any; cookies: any; file: any; }) => {
            if (data.action === 'get-facebook-cookies' && data.success) {
                console.log('Cookies:', data.cookies); // Array cookie
                console.log('Đã lưu file:', data.file); // Đường dẫn file .json trong Documents
                // ...xử lý hiển thị hoặc lưu trữ tuỳ ý
            } else if (data.action === 'facebook-login' && data.success) {
                console.log('Đăng nhập Facebook thành công:', data.cookies);
                // this.downloadCookie(); // Tải cookie về
                // this.toastr.success('Đăng nhập Facebook thành công!');
            }
            else if (data.action === 'facebook-crawl' && data.success) {
                console.log('Crawl Facebook thành công:', data);
                // this.toastr.success('Crawl Facebook thành công!');
            }
            else {
                console.error('Lỗi:', data);
                this.toastr.error('Đã xảy ra lỗi trong quá trình xử lý.');
            }
        });

        // Nhận phản hồi
        this.unsubscribeLog = (window as any).electron.onToolsLog((msg: any) => {
            console.log('Log từ main:', msg);
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        let settings: any = this.multiAccountService.getItem('settings');

        // Create the form
        this.accountForm = this._formBuilder.group({
            saveimages: [(settings && settings.saveimages) ? settings.saveimages : false],
            statusTypeLite: [true],
            autosave: [(settings && settings.autosave) ? settings.autosave : false],
            closethread: [false],
            proccessing: [false],
            linkDonate: [(settings && settings.linkDonate) ? settings.linkDonate : ''],
            language: [(settings && settings.language) ? settings.language : 'vi'],
            secretKey: [(settings && settings.secretKey) ? settings.secretKey : ''],
            searchAPIKey: [(settings && settings.searchAPIKey) ? settings.searchAPIKey : ''],
            defaultlinks: [(settings && settings.defaultlinks) ? settings.defaultlinks : ''],
            port: [(settings && settings.port) ? settings.port : ''],
            typelite_plugin: [(settings && settings.typelite_plugin) ? settings.typelite_plugin : ''],
            chatbot: [(settings && settings.chatbot) ? settings.chatbot : ''],
            customer: [(settings && settings.customer) ? settings.customer : ''],
            bigdata: [(settings && settings.bigdata) ? settings.bigdata : ''],
            downloader_plugin: [(settings && settings.downloader_plugin) ? settings.downloader_plugin : ''],
            tts: [(settings && settings.tts) ? settings.tts : ''],
            sst: [(settings && settings.sst) ? settings.sst : ''],
            mxhauto: [(settings && settings.mxhauto) ? settings.mxhauto : ''],
            n8n: [(settings && settings.n8n) ? settings.n8n : ''],
        });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        if (this.unsubscribeLog) this.unsubscribeLog();
        if (this.unsubscribeRes) this.unsubscribeRes();
        
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
