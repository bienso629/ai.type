import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config/config.service';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import jsonToCsvExport from 'json-to-csv-export';

import { ColumnMode, SelectionType } from '@swimlane/ngx-datatable';
import { WordpressService } from 'app/modules/_services/wordpress';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'linkform',
    templateUrl: './link.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [WordpressService]
})
export class LinkFormComponent implements OnInit, OnDestroy {
    user: User;
    config: AppConfig;

    isLinear = false;

    @ViewChild('stepper') stepper: any;

    link = '';
    links = [];
    products = [];

    public selected: any[] = [];
    hostname: any;
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    onSelect({ selected }) {
        this.selected.splice(0, this.selected.length);
        this.selected.push(...selected);
    }

    displayCheck(row: any) {
        return row.title !== 'Ethel Price';
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

    crawling() {
        this.hostname = new URL(this.link);
        this._wpService.crawler({
            link: this.link,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (links) => {
                    if (links && links.length > 0) {
                        this.links = links;
                        this.stepper.selectedIndex = 1;

                        this.toastr.success(`Quét dữ liệu xong.`);
                    } else {
                        this.toastr.warning(`Không tìm thấy sản phẩm.`);
                    }
                },
                error: (e: any) => {
                    this.toastr.warning(`Lỗi quét dữ liệu.`);
                },
                complete: () => {
                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    async scan() {
        let done = 0;
        this.products = [];

        await Promise.all(this.selected.map(async item => {
            this._wpService.scan({
                link: item.href,
                protocol: this.hostname.protocol,
                hostname: this.hostname.hostname,
                username: this.user.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (data) => {
                        if (data) {
                            if (data) {
                                this.products.push(data);
                            }

                            this.toastr.success(`Đã tìm thấy sản phẩm.`);
                        } else {
                            this.toastr.warning(`Không tìm thấy sản phẩm.`);
                        }
                    },
                    error: (e: any) => {
                        done++;
                        this.toastr.warning(`Lỗi quét dữ liệu.`);
                    },
                    complete: () => {
                        done++;
                        if (done === this.selected.length) {
                            console.log('this.products', this.products);
                            this.selected = [];
                            this.toastr.success(`Hoàn thành quét sản phẩm.`);
                        }
                    }
                });
        }));
    }

    export() {
        jsonToCsvExport({
            data: this.products,
            filename: 'products',
            delimiter: ',',
            headers: ['Type', "SKU", "Name", "Published", "Is featured?", "Visibility in catalog", "Short description", "Description", "Date sale price starts", "Date sale price ends", "Tax status", "Tax class", "In stock?", "Stock", "Backorders allowed?", "Sold individually?", "Weight (lbs)", "Length (in)", "Width (in)", "Height (in)", "Allow customer reviews?", "Purchase note", "Sale price", "Regular price", "Categories", "Tags", "Shipping class", "Images", "Download limit", "Download expiry days", "Parent", "Grouped products", "Upsells", "Cross-sells", "External URL", "Button text", "Position", "Attribute 1 name", "Attribute 1 value(s)", "Attribute 1 visible", "Attribute 1 global", "Attribute 2 name", "Attribute 2 value(s)", "Attribute 2 visible", "Attribute 2 global", "Attribute 3 name", "Attribute 3 value(s)", "Attribute 3 visible", "Attribute 3 global", "Attribute 4 name", "Attribute 4 value(s)", "Attribute 4 visible", "Attribute 4 global", "Meta: _wpcom_is_markdown", "Download 1 name", "Download 1 URL", "Download 2 name", "Download 2 URL"]
        });
    }

    /**
     * Constructor
     */
    constructor(
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private _wpService: WordpressService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
    ) {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    ngOnInit(): void {
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
