import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { Clipboard } from '@angular/cdk/clipboard';

import { ColumnMode } from '@swimlane/ngx-datatable';
import { WP2MDService } from 'app/modules/_services/wp2md';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { AppConfig } from 'app/core/config/app.config';

const xml2js = require("xml2js");

@Component({
    selector: 'import',
    styleUrls: ['./import.component.scss'],
    templateUrl: './import.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [WP2MDService]
})
export class ImportComponent implements OnInit, OnDestroy {
    xml: any;
    config: AppConfig;
    user: User;
    isLinear = false;

    @ViewChild('stepper') stepper: any;

    editing = {};
    rows = [];
    links = [];

    downloadJsonHref: any;
    ColumnMode = ColumnMode;

    fetch(cb) {
        const req = new XMLHttpRequest();
        req.open('GET', `assets/data/domain.json`);

        req.onload = () => {
            cb(JSON.parse(req.response));
        };

        req.send();
    }

    getRowHeight(row: any) {
        if (!row) {
            return 50;
        }

        if (row.height === undefined) {
            return 50;
        }

        return row.height;
    }

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    readFile = (e: any) => {
        let phantho = '';
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.readAsText(file);

        reader.onload = async (evt) => {
            this.xml = (evt as any).target.result;
            this.xml = await this.parseXmlToJson(this.xml);

            if (this.xml && this.xml.rss && this.xml.rss.channel) {
                this.rows = this.xml.rss.channel.item;
                this.rows.map(row => {
                    phantho += row.link + '\n';
                    this.links.push({
                        link: row.link
                    });
                });

                this.clipboard.copy(phantho);
                this.toastr.success(`Chép phần thô thành công!`);

                this.stepper.selectedIndex = 1;

                // lam moi lai giao dien
                this.cd.markForCheck();
            } else {
                this.stepper.selectedIndex = 2;
                this.toastr.warning(`Định dạng xml không đúng.`);

                if (this.xml && this.xml.urlset && this.xml.urlset.url) {
                    this.xml.urlset.url.map((row: any) => {
                        phantho += row.loc + '\n';
                        this.links.push({
                            link: row.loc
                        });
                    });

                    this.clipboard.copy(phantho);
                    this.toastr.success(`Chép phần thô thành công!`);

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            }
        };
    }

    store() {
        this.rows.map((row: any) => {
            const { hostname } = new URL(row.link);

            this._wp2mdService.store({
                title: row.title,
                hostname: hostname,
                object: row,
                username: this.user.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success) {
                            this.toastr.success(`Thêm mới`);
                        } else {
                            this.toastr.warning(`Đã tồn tại`);
                        }
                    },
                    error: (e: any) => {
                    },
                    complete: () => {
                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                });
        });
    }

    generateDownloadJsonUri(links?: any) {
        var theJSON = JSON.stringify(links);
        var uri = this.sanitizer.bypassSecurityTrustUrl("data:text/json;charset=UTF-8," + encodeURIComponent(theJSON));
        this.downloadJsonHref = uri;
    }

    download(links?: any) {
        this.generateDownloadJsonUri(links);
    }

    async parseXmlToJson(xml: any) {
        // With parser
        const parser = new xml2js.Parser({ explicitArray: false });
        return await parser
            .parseStringPromise(xml)
            .then((result: object) => {
                return result;
            })
            .catch((err: any) => {
                // Failed
            });

        // Without parser
        // return await xml2js
        //     .parseStringPromise(xml, { explicitArray: false })
        //     .then(response => response.Employees.Employee);
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _wp2mdService: WP2MDService,
        private toastr: ToastrService,
        private sanitizer: DomSanitizer,
        private cd: ChangeDetectorRef,
        private clipboard: Clipboard,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _fuseConfigService: FuseConfigService
    ) {
        this.titleService.setTitle(`wordpress importer | ai.type - công cụ tạo content`);

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
            });
    }

    ngOnInit(): void {
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
