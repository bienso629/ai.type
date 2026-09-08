import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserClientService } from 'app/_services/user';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, map, startWith, takeUntil, finalize, timeout, catchError, of } from 'rxjs';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslocoService } from '@ngneat/transloco';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';

interface ModelGroup {
    name: string;
    models: string[];
}

@Component({
    selector: 'settings-account',
    templateUrl: './account.component.html',
    styleUrls: ['./account.component.scss'],
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsAccountComponent implements OnInit {
    chatModelsList: string[] = [];
    imageModelsList: string[] = [];
    videoModelsList: string[] = [];
    allModelsList: string[] = [];
    filteredChatModels$: Observable<string[]>;
    filteredImageModels$: Observable<string[]>;
    filteredVideoModels$: Observable<string[]>;

    chatModels: ModelGroup[] = [];
    imageModels: ModelGroup[] = [];
    videoModels: ModelGroup[] = [];
    config: AppConfig;
    user: User;
    uniqueID: String;
    fbCookiePath: String = "C:\\Users\\Wing386\\Documents\\ai.type\\cookie.json";

    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;

    accountForm: UntypedFormGroup;
    geminiKeys: string[] = [''];
    geminiKeysVisibility: boolean[] = [];
    showSearchAPIKey: boolean = false;
    showUmodelverseKey: boolean = false;
    showN8N: boolean = false;
    showFigmaToken: boolean = false;
    showFigmaMcp: boolean = false;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    toggleKeyVisibility(index: number): void {
        this.geminiKeysVisibility[index] = !this.geminiKeysVisibility[index];
    }

    changeLanguage(lang: string): void {
        if (lang) {
            this._translocoService.setActiveLang(lang);
            this.save();
        }
    }

    /**
     * Save
     */
    save(): void {
        // Return if the form is invalid
        if (this.accountForm.invalid) {
            this.toastr.error('Lưu cấu hình thất bại.');
        } else {
            let currentSettings = this.multiAccountService.getItem('settings') || {};
            let settings: any = { ...currentSettings, ...this.accountForm.value };
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
                        if (result && result.success) {
                            // lưu cấu hình mới nhất về máy
                            this.multiAccountService.setItem('settings', settings);
                            if (settings.autoSaveLocal !== undefined) {
                                localStorage.setItem('ai_type_auto_save_local', settings.autoSaveLocal ? 'true' : 'false');
                            }
                            
                            // Cập nhật giá trị cấu hình trực tiếp vào in-memory config để các component khác nhận ngay
                            this._fuseConfigService.config = {
                                settings: {
                                    chatbot: settings.chatbot || this.config.settings.chatbot,
                                    customer: settings.customer || this.config.settings.customer,
                                    bigdata: settings.bigdata || this.config.settings.bigdata,
                                    tts: settings.tts || this.config.settings.tts,
                                    sst: settings.sst || this.config.settings.sst,
                                    mxhauto: settings.mxhauto || this.config.settings.mxhauto,
                                    puppeteer: settings.port ? `http://localhost:${settings.port}` : this.config.settings.puppeteer
                                }
                            };

                            if (settings.language) {
                                this._translocoService.setActiveLang(settings.language);
                            }
                            
                            this.toastr.success(`Lưu cấu hình!`);
                        } else {
                            this.toastr.error(`Không thể lưu cấu hình.`);
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
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
                port: this.accountForm.value['port'],
                emailConfig_nodebbUrl: this.accountForm.value['emailConfig_nodebbUrl'],
                emailConfig_nodebbToken: this.accountForm.value['emailConfig_nodebbToken'],
                emailConfig_smtpHost: this.accountForm.value['emailConfig_smtpHost'],
                emailConfig_smtpPort: this.accountForm.value['emailConfig_smtpPort'],
                emailConfig_smtpUser: this.accountForm.value['emailConfig_smtpUser'],
                emailConfig_smtpPass: this.accountForm.value['emailConfig_smtpPass'],
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
                figmaToken: this.accountForm.value['figmaToken'],
                figmaMcp: this.accountForm.value['figmaMcp'],
                umodelverseUrl: this.accountForm.value['umodelverseUrl'],
                umodelverseKey: this.accountForm.value['umodelverseKey'],
                umodelverseChatModel: this.accountForm.value['umodelverseChatModel'],
                umodelverseImageModel: this.accountForm.value['umodelverseImageModel'],
                umodelverseVideoModel: this.accountForm.value['umodelverseVideoModel'],
                enableUmodelverse: this.accountForm.value['enableUmodelverse'],
                customCookies: this.accountForm.value['customCookies'],
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



    isBackingUp: boolean = false;
    isRestoring: boolean = false;

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
        private _fuseConfirmationService: FuseConfirmationService,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef,
        private _translocoService: TranslocoService
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

        // Lắng nghe thay đổi settings từ header (ThinLayoutComponent)
        this.multiAccountService.activeAccount$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((data: any) => {
                if (data && data.settings && this.accountForm) {
                    const currentVal = this.accountForm.get('enableUmodelverse').value;
                    if (currentVal !== data.settings.enableUmodelverse) {
                        this.accountForm.patchValue({
                            enableUmodelverse: data.settings.enableUmodelverse
                        }, { emitEvent: false });
                        this.cd.markForCheck();
                    }
                }
            });

        // Nhận phản hồi
        this.unsubscribeRes = (window as any).electron.onToolsResponse((data: any) => {
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
            } else if (data.action === 'zalo-crawl' && data.success) {
                this.toastr.success(`Đã trích xuất dữ liệu Zalo (UID: ${data.uid})`);
                console.log('File saved at:', data.path);
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
            emailConfig_nodebbUrl: [(settings && settings.emailConfig_nodebbUrl) ? settings.emailConfig_nodebbUrl : ''],
            emailConfig_nodebbToken: [(settings && settings.emailConfig_nodebbToken) ? settings.emailConfig_nodebbToken : ''],
            emailConfig_smtpHost: [(settings && settings.emailConfig_smtpHost) ? settings.emailConfig_smtpHost : ''],
            emailConfig_smtpPort: [(settings && settings.emailConfig_smtpPort) ? settings.emailConfig_smtpPort : ''],
            emailConfig_smtpUser: [(settings && settings.emailConfig_smtpUser) ? settings.emailConfig_smtpUser : ''],
            emailConfig_smtpPass: [(settings && settings.emailConfig_smtpPass) ? settings.emailConfig_smtpPass : ''],
            saveimages: [(settings && settings.saveimages) ? settings.saveimages : false],
            statusTypeLite: [true],
            autosave: [(settings && settings.autosave) ? settings.autosave : false],
            autoSaveLocal: [(settings && settings.autoSaveLocal !== undefined) ? settings.autoSaveLocal : (localStorage.getItem('ai_type_auto_save_local') !== 'false')],
            closethread: [false],
            proccessing: [false],
            linkDonate: [(settings && settings.linkDonate) ? settings.linkDonate : ''],
            language: [(settings && settings.language) ? settings.language : 'vi'],
            secretKey: [(settings && settings.secretKey) ? settings.secretKey : ''],
            searchAPIKey: [(settings && settings.searchAPIKey) ? settings.searchAPIKey : ''],
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
            figmaToken: [(settings && settings.figmaToken) ? settings.figmaToken : ''],
            figmaMcp: [(settings && settings.figmaMcp) ? settings.figmaMcp : ''],
            umodelverseUrl: [(settings && settings.umodelverseUrl) ? settings.umodelverseUrl : ''],
            umodelverseKey: [(settings && settings.umodelverseKey) ? settings.umodelverseKey : ''],
            umodelverseChatModel: [(settings && settings.umodelverseChatModel) ? settings.umodelverseChatModel : ''],
            umodelverseImageModel: [(settings && settings.umodelverseImageModel) ? settings.umodelverseImageModel : ''],
            umodelverseVideoModel: [(settings && settings.umodelverseVideoModel) ? settings.umodelverseVideoModel : ''],
            enableUmodelverse: [(settings && settings.enableUmodelverse !== undefined) ? settings.enableUmodelverse : false],
            customCookies: [(settings && settings.customCookies) ? settings.customCookies : ''],
        });

        const secretKeyValue = this.accountForm.get('secretKey').value;
        if (secretKeyValue) {
            this.geminiKeys = secretKeyValue.split(';').filter((k: string) => k.trim() !== '');
            if (this.geminiKeys.length === 0) {
                this.geminiKeys = [''];
            }
        }
        this.geminiKeysVisibility = this.geminiKeys.map(() => false);

        // Fetch umodelverse models
        fetch('https://api-us-ca.umodelverse.ai/v1/models')
            .then(res => res.json())
            .then(data => {
                if (data && data.data) {
                    const allModels = data.data.map((m: any) => m.id).sort();

                    const currentChat = this.accountForm.get('umodelverseChatModel')?.value;
                    const currentImg = this.accountForm.get('umodelverseImageModel')?.value;
                    const currentVid = this.accountForm.get('umodelverseVideoModel')?.value;

                    if (currentChat && !allModels.includes(currentChat)) allModels.unshift(currentChat);
                    if (currentImg && !allModels.includes(currentImg)) allModels.unshift(currentImg);
                    if (currentVid && !allModels.includes(currentVid)) allModels.unshift(currentVid);

                    this.allModelsList = Array.from(new Set(allModels));
                    this.setupAutocompleteFilters();

                    this.cd.markForCheck();
                }
            })
            .catch(err => console.error('Failed to fetch models', err));
    }

    private setupAutocompleteFilters(): void {
        const filterModels = (value: string): string[] => {
            const filterValue = (value || '').toLowerCase().trim();
            if (!filterValue) {
                return this.allModelsList;
            }
            return this.allModelsList.filter(model => model.toLowerCase().includes(filterValue));
        };

        const chatCtrl = this.accountForm.get('umodelverseChatModel');
        const imgCtrl = this.accountForm.get('umodelverseImageModel');
        const vidCtrl = this.accountForm.get('umodelverseVideoModel');

        if (chatCtrl) {
            this.filteredChatModels$ = chatCtrl.valueChanges.pipe(
                startWith(chatCtrl.value || ''),
                map(value => filterModels(value))
            );
        }

        if (imgCtrl) {
            this.filteredImageModels$ = imgCtrl.valueChanges.pipe(
                startWith(imgCtrl.value || ''),
                map(value => filterModels(value))
            );
        }

        if (vidCtrl) {
            this.filteredVideoModels$ = vidCtrl.valueChanges.pipe(
                startWith(vidCtrl.value || ''),
                map(value => filterModels(value))
            );
        }
    }

    addGeminiKey(): void {
        this.geminiKeys.unshift('');
        this.geminiKeysVisibility.unshift(false);
        this.updateSecretKey();
    }

    removeGeminiKey(index: number): void {
        this.geminiKeys.splice(index, 1);
        this.geminiKeysVisibility.splice(index, 1);
        if (this.geminiKeys.length === 0) {
            this.geminiKeys = [''];
            this.geminiKeysVisibility = [false];
        }
        this.updateSecretKey();
    }

    onGeminiKeyChange(index: number, event: Event): void {
        this.geminiKeys[index] = (event.target as HTMLInputElement).value;
        this.updateSecretKey();
    }

    dropGeminiKey(event: CdkDragDrop<string[]>): void {
        moveItemInArray(this.geminiKeys, event.previousIndex, event.currentIndex);
        this.updateSecretKey();
    }

    updateSecretKey(): void {
        const validKeys = this.geminiKeys.filter(k => k.trim() !== '');
        this.accountForm.get('secretKey').setValue(validKeys.join(';'));
    }

    backupDatabase(): void {
        const currentServer = this.user?.server || 'vn.s1';
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Sao lưu Dữ Liệu 2023 về Máy Tính',
            message: `Bạn có muốn tải toàn bộ cơ sở dữ liệu năm <b>2023</b> từ máy chủ <b>${currentServer}</b> về thư mục <b>Documents/ai.type/data/backup</b> không?`,
            icon: {
                show: true,
                name: 'heroicons_outline:cloud-download',
                color: 'info'
            },
            actions: {
                confirm: { show: true, label: 'Bắt đầu Sao lưu', color: 'primary' },
                cancel: { show: true, label: 'Hủy' }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.isBackingUp = true;
                this.cd.markForCheck();

                const username = this.user?.name || 'admin';
                const year = 2023;

                this._userClientService.backupDatabaseToLocal({
                    username: username,
                    year: year
                }).pipe(
                    timeout(90000),
                    catchError((err) => {
                        console.error('[backupDatabase] Lỗi kết nối hoặc timeout:', err);
                        return of({ success: false, message: 'Yêu cầu sao lưu đã hết thời gian chờ hoặc không thể kết nối tới máy chủ.' });
                    })
                ).subscribe({
                    next: async (res) => {
                        try {
                            if (res && res.success) {
                                // Nếu đang chạy trong Electron, tiến hành đồng bộ dữ liệu vào articles.sqlite
                                if (window && (window as any).electron && (window as any).electron.syncBackupToLocalSqlite) {
                                    try {
                                        await (window as any).electron.syncBackupToLocalSqlite({
                                            username: username,
                                            year: year
                                        });
                                    } catch (syncErr) {
                                        console.error('[backupDatabase] Lỗi khi đồng bộ vào articles.sqlite:', syncErr);
                                    }
                                }

                                this.isBackingUp = false;
                                this.cd.markForCheck();

                                const confirmDialog = this._fuseConfirmationService.open({
                                    title: 'Sao lưu & Đồng bộ thành công',
                                    message: 'Toàn bộ dữ liệu của bạn trên server đã được đồng bộ vào database cục bộ <b>articles.sqlite</b> thành công.<br>Ứng dụng sẽ tự động khởi động lại ngay bây giờ để áp dụng dữ liệu mới.',
                                    icon: { show: true, name: 'heroicons_outline:check-circle', color: 'success' },
                                    actions: { confirm: { show: true, label: 'Khởi động lại ngay', color: 'primary' }, cancel: { show: false } }
                                });

                                confirmDialog.afterClosed().subscribe(() => {
                                    if (window && (window as any).electron && (window as any).electron.relaunchApp) {
                                        (window as any).electron.relaunchApp();
                                    } else {
                                        window.location.reload();
                                    }
                                });

                                // Tự động khởi động lại sau 2.5 giây nếu người dùng chưa bấm nút
                                setTimeout(() => {
                                    if (window && (window as any).electron && (window as any).electron.relaunchApp) {
                                        (window as any).electron.relaunchApp();
                                    } else {
                                        window.location.reload();
                                    }
                                }, 2500);
                            } else {
                                this.isBackingUp = false;
                                this.cd.markForCheck();
                                this.toastr.error(res?.message || 'Có lỗi xảy ra khi thực hiện sao lưu.');
                            }
                        } catch (innerErr) {
                            console.error('[backupDatabase] Lỗi trong khối xử lý phản hồi sao lưu:', innerErr);
                            this.isBackingUp = false;
                            this.cd.markForCheck();
                            this.toastr.error('Đã xảy ra lỗi trong quá trình xử lý kết quả sao lưu.');
                        }
                    },
                    error: (err) => {
                        this.isBackingUp = false;
                        this.cd.markForCheck();
                        this.toastr.error('Lỗi khi gửi yêu cầu sao lưu tới máy chủ.');
                    }
                });
            }
        });
    }

    restoreDatabase(): void {
        const currentServer = this.user?.server || 'vn.s1';
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Khôi phục Cơ Sở Dữ Liệu',
            message: `Bạn có chắc chắn muốn khôi phục và đồng bộ toàn bộ cơ sở dữ liệu từ máy chủ <b>${currentServer}</b> về không?<br><b>Cảnh báo:</b> Dữ liệu hiện tại sẽ được cập nhật đồng bộ với máy chủ.`,
            icon: {
                show: true,
                name: 'heroicons_outline:refresh',
                color: 'warn'
            },
            actions: {
                confirm: { show: true, label: 'Bắt đầu Khôi phục', color: 'warn' },
                cancel: { show: true, label: 'Hủy' }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.isRestoring = true;
                this.cd.markForCheck();

                this._userClientService.restoreDatabase({
                    username: this.user?.name || 'admin',
                    year: 2023
                }).pipe(
                    timeout(90000),
                    catchError((err) => {
                        console.error('[restoreDatabase] Lỗi kết nối hoặc timeout:', err);
                        return of({ success: false, message: 'Yêu cầu khôi phục đã hết thời gian chờ hoặc không thể kết nối tới máy chủ.' });
                    })
                ).subscribe({
                    next: (res) => {
                        this.isRestoring = false;
                        this.cd.markForCheck();
                        if (res && res.success) {
                            this._fuseConfirmationService.open({
                                title: 'Khôi phục thành công',
                                message: res.message || 'Lệnh khôi phục cơ sở dữ liệu đã hoàn tất!',
                                icon: { show: true, name: 'heroicons_outline:check-circle', color: 'success' },
                                actions: { confirm: { show: true, label: 'Đóng', color: 'primary' }, cancel: { show: false } }
                            });
                        } else {
                            this.toastr.error(res?.message || 'Có lỗi xảy ra khi thực hiện khôi phục cơ sở dữ liệu.');
                        }
                    },
                    error: (err) => {
                        this.isRestoring = false;
                        this.cd.markForCheck();
                        this.toastr.error('Lỗi khi gửi yêu cầu khôi phục tới máy chủ.');
                    }
                });
            }
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
