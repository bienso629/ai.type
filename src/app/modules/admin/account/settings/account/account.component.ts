import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
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
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

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
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    toggleKeyVisibility(index: number): void {
        this.geminiKeysVisibility[index] = !this.geminiKeysVisibility[index];
    }

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
                umodelverseUrl: this.accountForm.value['umodelverseUrl'],
                umodelverseKey: this.accountForm.value['umodelverseKey'],
                umodelverseChatModel: this.accountForm.value['umodelverseChatModel'],
                umodelverseImageModel: this.accountForm.value['umodelverseImageModel'],
                umodelverseVideoModel: this.accountForm.value['umodelverseVideoModel'],
                enableUmodelverse: this.accountForm.value['enableUmodelverse'],
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

    // Trong SettingsAccountComponent

    async connectApps(url: string) {
        this.uniqueID = Math.random().toString(36).substr(2, 9);

        // Nếu là Zalo thì gọi lệnh crawl đặc biệt
        if (url.includes('zalo')) {
            (window as any).electron.tools({
                command: 'zalo-crawl',
                url: 'https://chat.zalo.me', // URL chính xác của bản web
                uniqueID: this.uniqueID
            });
        } else {
            // Các logic cũ cho Facebook...
            (window as any).electron.tools({
                command: 'facebook-login',
                url: url,
                uniqueID: this.uniqueID,
                cookiePath: this.fbCookiePath
            });
        }
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
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef
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
            umodelverseUrl: [(settings && settings.umodelverseUrl) ? settings.umodelverseUrl : ''],
            umodelverseKey: [(settings && settings.umodelverseKey) ? settings.umodelverseKey : ''],
            umodelverseChatModel: [(settings && settings.umodelverseChatModel) ? settings.umodelverseChatModel : ''],
            umodelverseImageModel: [(settings && settings.umodelverseImageModel) ? settings.umodelverseImageModel : ''],
            umodelverseVideoModel: [(settings && settings.umodelverseVideoModel) ? settings.umodelverseVideoModel : ''],
            enableUmodelverse: [(settings && settings.enableUmodelverse !== undefined) ? settings.enableUmodelverse : false],
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
                    const allModels = data.data.map((m: any) => m.id);
                    
                    const videoKeywords = ['video', 'vidu', 'kling', 'sora', 'veo', 'wan', 'i2v', 't2v', 'r2v', 'luma', 'cogvideo', 'runway', 'pika', 'haiper', 'seedream', 'mimo', 'pixverse', 'hailuo', 'happyhorse', 'seedance'];
                    const imageKeywords = ['image', 'dall-e', 'flux', 'midjourney', 'mj', 'sd', 'stable-diffusion', 'qwen-image'];
                    const excludeKeywords = ['tts', 'speech', 'suno', 'music', 'sound', 'voice', 'lip-sync', 'indextts', 'embedding', 'rerank', 'reranker', 'ocr', 'easydoc', 'parse', 'extract'];

                    const rawChat: string[] = [];
                    const rawImage: string[] = [];
                    const rawVideo: string[] = [];
                    
                    // Loại bỏ các model trùng lặp có chứa prefix (ví dụ: openai/gpt-4o và gpt-4o)
                    const uniqueModels = new Set(allModels);
                    const cleanModels = allModels.filter((id: string) => {
                        if (id.includes('/')) {
                            const baseName = id.split('/').pop();
                            if (baseName && uniqueModels.has(baseName)) {
                                return false;
                            }
                        }
                        return true;
                    });

                    cleanModels.forEach((id: string) => {
                        const lowerId = id.toLowerCase();
                        
                        // Bỏ qua các model không liên quan (âm thanh, nhúng, ocr...)
                        if (excludeKeywords.some(kw => lowerId.includes(kw))) {
                            return;
                        }
                        
                        if (videoKeywords.some(kw => lowerId.includes(kw))) {
                            rawVideo.push(id);
                        } else if (imageKeywords.some(kw => lowerId.includes(kw))) {
                            rawImage.push(id);
                        } else {
                            rawChat.push(id);
                        }
                    });
                    
                    const currentChat = this.accountForm.get('umodelverseChatModel').value;
                    const currentImg = this.accountForm.get('umodelverseImageModel').value;
                    const currentVid = this.accountForm.get('umodelverseVideoModel').value;
                    
                    if (currentChat && !rawChat.includes(currentChat)) rawChat.push(currentChat);
                    if (currentImg && !rawImage.includes(currentImg)) rawImage.push(currentImg);
                    if (currentVid && !rawVideo.includes(currentVid)) rawVideo.push(currentVid);
                    
                    const groupModels = (models: string[]): ModelGroup[] => {
                        const groups: { [key: string]: string[] } = {
                            'OpenAI (GPT/Sora/DALL-E)': [],
                            'Anthropic (Claude)': [],
                            'Google (Gemini/Veo)': [],
                            'Alibaba (Qwen/Wan)': [],
                            'DeepSeek': [],
                            'MiniMax (Hailuo)': [],
                            'ByteDance (Doubao/Mimo)': [],
                            'Kuaishou (Kling)': [],
                            'Tencent (Hunyuan/HappyHorse)': [],
                            'Shengshu (Vidu)': [],
                            'Zhipu (GLM)': [],
                            'Moonshot (Kimi)': [],
                            'Baidu (Ernie)': [],
                            'Black Forest (Flux)': [],
                            'Midjourney': [],
                            'PixVerse': [],
                            'Khác (Others)': []
                        };

                        models.forEach(m => {
                            const lower = m.toLowerCase();
                            if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4') || lower.includes('sora') || lower.includes('dall-e') || lower.includes('codex')) {
                                groups['OpenAI (GPT/Sora/DALL-E)'].push(m);
                            } else if (lower.includes('claude')) {
                                groups['Anthropic (Claude)'].push(m);
                            } else if (lower.includes('gemini') || lower.includes('veo')) {
                                groups['Google (Gemini/Veo)'].push(m);
                            } else if (lower.includes('qwen') || lower.includes('wan') || lower.includes('qwq')) {
                                groups['Alibaba (Qwen/Wan)'].push(m);
                            } else if (lower.includes('deepseek')) {
                                groups['DeepSeek'].push(m);
                            } else if (lower.includes('minimax') || lower.includes('hailuo')) {
                                groups['MiniMax (Hailuo)'].push(m);
                            } else if (lower.includes('doubao') || lower.includes('mimo')) {
                                groups['ByteDance (Doubao/Mimo)'].push(m);
                            } else if (lower.includes('kling')) {
                                groups['Kuaishou (Kling)'].push(m);
                            } else if (lower.includes('happyhorse') || lower.includes('hunyuan') || lower.includes('tencent')) {
                                groups['Tencent (Hunyuan/HappyHorse)'].push(m);
                            } else if (lower.includes('vidu')) {
                                groups['Shengshu (Vidu)'].push(m);
                            } else if (lower.includes('glm')) {
                                groups['Zhipu (GLM)'].push(m);
                            } else if (lower.includes('kimi') || lower.includes('moonshot')) {
                                groups['Moonshot (Kimi)'].push(m);
                            } else if (lower.includes('ernie')) {
                                groups['Baidu (Ernie)'].push(m);
                            } else if (lower.includes('flux')) {
                                groups['Black Forest (Flux)'].push(m);
                            } else if (lower.includes('midjourney') || lower.includes('mj')) {
                                groups['Midjourney'].push(m);
                            } else if (lower.includes('pixverse')) {
                                groups['PixVerse'].push(m);
                            } else {
                                groups['Khác (Others)'].push(m);
                            }
                        });

                        return Object.keys(groups)
                            .filter(k => groups[k].length > 0)
                            .map(k => ({ name: k, models: groups[k].sort() }));
                    };

                    this.chatModels = groupModels(rawChat);
                    this.imageModels = groupModels(rawImage);
                    this.videoModels = groupModels(rawVideo);

                    this.cd.markForCheck();
                }
            })
            .catch(err => console.error('Failed to fetch models', err));
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
