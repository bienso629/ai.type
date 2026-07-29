import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CrawlService } from 'app/_services/crawl';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { MatChipInputEvent } from '@angular/material/chips';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { PaymentComponent } from 'app/modules/microsites/payment/payment.component';
import { ToastrService } from 'ngx-toastr';

import { FuseAlertService } from '@fuse/components/alert';

import * as _ from 'lodash';
import { UserClientService } from 'app/_services/user';

@Component({
    selector: 'archive',
    templateUrl: './archive.component.html',
    styleUrls: ['./archive.component.scss'],
    providers: [CrawlService, UserClientService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class ArchiveComponent implements OnInit, OnDestroy, AfterViewInit {
    user: User;
    selectedIndex = 0;
    uuid: string;
    name: string;
    linkDonate: string;

    done: any = [];
    arr_keyword = [];
    title: string;
    editor: string = '';

    seo: any;

    details: any;
    selectedChips: any[] = [];

    /**
     * Getter for current year
     */
    get currentYear(): number {
        return new Date().getFullYear();
    }

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Dismiss the alert via the service
     *
     * @param name
     */
    dismiss(name: string): void {
        this._fuseAlertService.dismiss(name);
    }

    /**
     * Show the alert via the service
     *
     * @param name
     */
    show(name: string): void {
        this._fuseAlertService.show(name);
    }

    agree() {
        if (this.details.authors.includes(this.user.name)) {
            this._crawlService.archiveTogetherConfirm({
                uuid: this.uuid,
                username: this.user.name,
                author: this.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success) {
                            this.dismiss('alertBox4');
                            this.toastr.success(`Bạn đã đồng ý viết cùng tác giả.`);
                        } else {
                            this.toastr.warning(`Bạn đã đồng ý viết cùng rồi.`);
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
                        // lam moi lai giao dien
                        this.cd.markForCheck();
                    }
                });
        }
    }

    checkTogetherAgree() {
        this._crawlService.archiveTogetherCheck({
            uuid: this.uuid,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.dismiss('alertBox4');
                    }
                },
                error: () => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    payment() {
        if (this.name === this.user.name) {
            this.toastr.warning(`Không thể tự mua cho mình.`);
        } else {
            const dialogRef = this.dialog.open(PaymentComponent, {
                width: '666px',
                // height: '666px',
                data: {
                    uuid: this.uuid,
                    receiver: this.name,
                    linkDonate: this.linkDonate
                }
            });

            dialogRef.afterClosed().subscribe(result => {

            });
        }
    }

    history(e: any) {
        let editor = _.find(this.details.history, {
            createdAt: e.value
        });

        if (editor) {
            this.setdata(editor);
        } else {
            this.setdata(this.details);
        }
    }

    changeSelected(query: string) {
        const index = this.selectedChips.indexOf(query);

        if (index >= 0) {
            this.selectedChips.splice(index, 1);
        } else {
            this.selectedChips.push(query);
        }
    }

    score: number = 0;
    seoScore() {
        this.score = 0;

        // tiêu đề
        if (this.seo.title.characters >= 30 && this.seo.title.characters <= 60) {
            this.score = this.score + 10;
        }

        if (this.seo.title.findmainkey > 0) {
            this.score = this.score + 10;
        }

        if (this.seo.title.findmainkey === 0) {
            this.score = this.score + 5;
        }

        // mô tả
        if (this.seo.description.characters >= 100 && this.seo.description.characters <= 160) {
            this.score = this.score + 10;
        }

        if (this.seo.description.findmainkey > 0) {
            this.score = this.score + 10;
        }

        // h1
        if (this.seo.heading.h1.total === 1) {
            this.score = this.score + 10;
        }

        if (this.seo.heading.h1.findmainkey >= 0) {
            this.score = this.score + 5;
        }

        // content
        if (this.seo.words.total > 300) {
            this.score = this.score + 10;
        }

        if (this.seo.words.find_mainkey_in_first_paragraph >= 0) {
            this.score = this.score + 10;
        }

        if (this.seo.words.mainkey_percent_in_words <= 8 && this.seo.words.mainkey_percent_in_words > 0) {
            this.score = this.score + 10;
        }

        // image
        if (this.seo['images'].total > 0) {
            this.score = this.score + 5;
        }

        // link
        if (this.seo['links'] >= 1) {
            this.score = this.score + 5;
        }
    }

    setdata(editor: any) {
        this.editor = '';
        this.done = editor.done;
        this.seo = editor.seo;
        this.title = editor.title;
        this.arr_keyword = editor.arr_keyword;
        this.arr_keyword.push(editor.seo.mainkey);

        this.done.map((item: any) => {
            this.editor = `${this.editor}${item}`;
        });

        this.seoScore();
    }

    /**
     * Chi tiết lưu trữ
     */
    detail(uuid: string, name: string) {
        this._crawlService.detail({
            uuid: uuid,
            username: name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.details = result.data;
                        this.setdata(this.details);
                    }
                },
                error: () => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    formControl = new FormControl(['angular']);

    removeKeyword(keyword: string) {
        const index = this.arr_keyword.indexOf(keyword);
        if (index >= 0) {
            this.arr_keyword.splice(index, 1);
        }
    }

    add(event: MatChipInputEvent): void {
        const value = (event.value || '').trim();

        // Add our keyword
        if (value) {
            this.arr_keyword.push(value);
        }

        // Clear the input value
        event.chipInput!.clear();
    }

    /**
     * Lấy thông tin người viết
     */
    getLinkDonate(): void {
        this._userClientService.publicProfile({
            name: this.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.linkDonate = result.data.settings.linkDonate;
                    }
                },
                error: () => {
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private toastr: ToastrService,
        public dialog: MatDialog,
        private _crawlService: CrawlService,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _fuseAlertService: FuseAlertService,
        private cd: ChangeDetectorRef,
        private route: ActivatedRoute,
        private router: Router
    ) {
        this.titleService.setTitle(`mua 1 ly cafe | ai.type - công cụ tạo content`);
    }

    changetab(e: any) {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { tab: e.index },
            queryParamsHandling: 'merge'
        });
    }

    ngAfterViewInit(): void {
        if (this.uuid) {
            this.detail(this.uuid, this.name);
            this.checkTogetherAgree();

            this.getLinkDonate();
        }
    }

    ngOnInit() {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        this.route.params.subscribe((params: Params) => {
            let uuid = params['uuid'];
            let name = params['name'];

            if (uuid) {
                this.uuid = uuid;
                this.name = name;
            }
        });

        this.route.queryParams.subscribe((params: Params) => {
            if (params['tab']) {
                this.selectedIndex = parseInt(params['tab'], 10);
            }
        });
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
