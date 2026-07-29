import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { BlogService } from 'app/_services/blog';
import { ToastrService } from 'ngx-toastr';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config';
import { Router } from '@angular/router';

@Component({
    selector: 'synonym',
    templateUrl: './synonym.component.html',
    providers: [BlogService],
    encapsulation: ViewEncapsulation.None
})
export class SynonymComponent implements OnInit, OnDestroy {
    config: AppConfig;
    user: User;

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    links: any[] = [];
    words: any[] = [];
    synonyms: any[] = [];
    downloadJsonHref: any;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    synonymscan() {
        this._blogService.synonymscan({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (links) => {
                    if (links && links.length > 0) {
                        this.links = links;

                        const dialogRef = this._fuseConfirmationService.open({
                            title: 'Từ đồng nghĩa',
                            message: `Đã quét được ${links.length} từ có kết quả.`,
                            icon: {
                                show: true,
                                name: 'feather:search',
                                color: 'primary'
                            },
                            actions: {
                                confirm: {
                                    show: true,
                                    label: 'Lưu trữ',
                                    color: 'primary'
                                },
                                cancel: {
                                    show: true,
                                    label: 'Đóng lại'
                                }
                            },
                            dismissible: false
                        });

                        // Subscribe to afterClosed from the dialog reference
                        dialogRef.afterClosed().subscribe((result) => {
                            if (result === "confirmed") {
                                this.synonymdownload(links[0]);
                            }
                        });
                    }
                },
                error: (e: any) => {
                },
                complete: () => {
                }
            });
    }

    synonymdownload(link: string) {
        this._blogService.synonymdownload({
            link: link
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (results) => {
                    if (results) {
                        this.words.push(results);
                        this.toastr.success(`Đã thêm từ "${results.word}"`);
                    }
                },
                error: (e: any) => {
                    this.toastr.warning(`Lỗi trong quá trình phân tích.`);
                },
                complete: () => {
                    this.links.shift();
                    if (this.links.length > 0) {
                        this.synonymdownload(this.links[0]);
                    } else {
                        const dialogRef = this._fuseConfirmationService.open({
                            title: 'Bạn muốn tải file?',
                            message: `Đã quét xong ${this.words.length} từ có kết quả.`,
                            icon: {
                                show: true,
                                name: 'feather:info',
                                color: 'primary'
                            },
                            actions: {
                                confirm: {
                                    show: true,
                                    label: 'Tải xuống',
                                    color: 'primary'
                                },
                                cancel: {
                                    show: true,
                                    label: 'Đóng lại'
                                }
                            },
                            dismissible: false
                        });

                        // Subscribe to afterClosed from the dialog reference
                        dialogRef.afterClosed().subscribe((result) => {
                            if (result === "confirmed") {
                                this.downloadJson(this.words);
                            }
                        });
                    }
                }
            });
    }

    downloadJson(myJson: any) {
        var sJson = JSON.stringify(myJson);
        var element = document.createElement('a');
        element.setAttribute('href', "data:text/json;charset=UTF-8," + encodeURIComponent(sJson));
        element.setAttribute('download', "tu-dong-nghia.json");
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click(); // simulate click
        document.body.removeChild(element);
    }

    synonymlocal() {
        this._blogService.synonymlocal()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (synonyms) => {
                    if (synonyms && synonyms.length > 0) {
                        this.synonyms = synonyms;
                    }
                },
                error: (e: any) => {
                },
                complete: () => {
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _blogService: BlogService,
        private toastr: ToastrService,
    ) {
        this.titleService.setTitle(`tra cứu từ | ai.type - công cụ tạo content`);
    }

    ngOnInit(): void {
        this.synonymlocal();
        
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


            });
    }

    ngOnDestroy(): void {
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
