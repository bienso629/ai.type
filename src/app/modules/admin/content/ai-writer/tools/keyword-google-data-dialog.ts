import { Component, Inject, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSelectionList } from "@angular/material/list";
import { UserService } from "app/core/user/user.service";
import { User } from "app/core/user/user.types";
import { BlogService } from "app/_services/blog";
import { CrawlService } from "app/_services/crawl";
import { MultiAccountService } from "app/_services/multi-account.service";
import { Subject, takeUntil } from "rxjs";

import * as uuid from 'uuid';

@Component({
    selector: 'keyword-google-data-dialog',
    providers: [CrawlService, BlogService],
    template: `<div class="flex items-center justify-between mb-4">
    <div class="text-2xl font-bold text-gray-800 tracking-tight">Phát triển nội dung với "{{data.keyword}}"</div>
    <button mat-icon-button mat-dialog-close type="button">
        <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
    </button>
</div>

    <form [formGroup]="queryForm" class="flex flex-col mt-4">
        <div class="mb-1 text-md text-hint">
            Chỉ quét đoạn văn trên {{queryForm.get('amountCtrl').value}} từ.
        </div>

        <mat-grid-list cols="2" rowHeight="40" gutterSize="10px">
            <mat-grid-tile>
                <mat-form-field class="flex w-full fuse-mat-dense fuse-mat-emphasized-affix"
                        [subscriptSizing]="'dynamic'">
                    <input [currencyMask]="options" [formControlName]="'amountCtrl'" [placeholder]="'trên 20 từ'" required matInput />
                    <mat-span matSuffix>trên {{queryForm.get('amountCtrl').value}} từ</mat-span>
                </mat-form-field>
            </mat-grid-tile>
            <mat-grid-tile>
                <mat-form-field class="flex w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                    <!-- <mat-label>Tự động tạo Content:</mat-label> -->
                    <input [formControlName]="'keyword'" [placeholder]="'Từ khoá'" (keyup.enter)="keywordGoolge()" required matInput />

                    <button mat-icon-button type="button" color="primary" (click)="keywordGoolge()" matTooltipPosition="above" matTooltip="Bắt đầu quét nội dung" matSuffix>
                        <mat-icon class="icon-size-4" [svgIcon]="'feather:arrow-right'"></mat-icon>
                    </button>
                </mat-form-field>
            </mat-grid-tile>
        </mat-grid-list>
    </form>


<div mat-dialog-content class="mt-4 p-0">
    <ng-container *ngIf="blocks.length > 0; else empty">
        <h2 class="mt-2 font-semibold">Đoạn văn:</h2>
        <!-- <p class="hover:bg-grey-50 my-2 border p-2 rounded cursor-pointer" matTooltipPosition="right" matTooltip="Chọn kết quả vào Nguồn" *ngFor="let item of data.data['span']">{{item}}</p> -->
        <mat-selection-list class="m-0 p-0" #item>
            <mat-list-option [disableRipple]="true" class="hover:bg-grey-50 mt-2 border p-2 rounded cursor-pointer" matTooltipPosition="above" *ngFor="let item of blocks" [value]="item">{{item}}</mat-list-option>
        </mat-selection-list>
    </ng-container>

    <ng-template #empty>
        <mat-label class="mt-2">Chưa tìm thấy nội dung nào.</mat-label>
    </ng-template>
</div>

<div mat-dialog-actions *ngIf="blocks.length > 0" class="p-0 mt-6 flex justify-end gap-2">
    <button mat-flat-button color="primary" *ngIf="blocks.length > 0" (click)="get()" class="">
        <mat-label>Sử dụng kết quả</mat-label>
    </button>
</div>`,
})
export class KeywordGoogleDataDialog implements OnInit, OnDestroy {
    user: User;
    code: string = 'td|body\nlabel|body\nspan|body\nh1|body\nh2|body\nh3|body\nh4|body\nh5|body\np|body\nimg,src+title+alt|body\niframe,src|body\na,href+title|body\nli|body\ni|body\ndd|body\npre|body\nsource,src|html\ntitle|html>head\nmeta,content:name|html>head\nmeta,content:property|html>head';
    blocks = [];
    api_keys = [];

    settings: any;
    secretKey: any;
    searchAPIKey: any;

    queryForm: UntypedFormGroup;

    @ViewChild('item') item: MatSelectionList;

    options = {
        align: "left",
        allowNegative: true,
        allowZero: false,
        decimal: ",",
        precision: 0,
        prefix: "",
        suffix: "",
        thousands: ".",
        nullable: false,
        // min: 25000,
        // max: 10000000
    };

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    googleSearch(query: string, index: number, searchType?: string) {
        return this._blogService.googleSearchPromise({
            query: query,
            searchAPIKey: this.searchAPIKey,
            index: index,
            searchType: searchType
        });
    }

    /**
     * Dung tu khoa tim tren google roi tao thanh van ban
     */
    async keywordGoolge() {
        this.blocks = [];

        const requests = [
            this.googleSearch(`${this.queryForm.get('keyword').value}`, 0),
        ];

        const short_keywords = await Promise.all(requests);
        short_keywords.forEach((links: any) => {
            if (links && links.length > 0) {
                links.map((link: any) => {
                    this._crawlService.storeNode({
                        url: link.link,
                        request: this.code,
                        type: 'website',
                        username: this.user.name
                    })
                        .pipe(takeUntil(this._unsubscribeAll))
                        .subscribe({
                            next: async (result) => {
                                if (result && result.success) {
                                    for (var k in result.data) {
                                        if (result.data.hasOwnProperty(k) && k === 'p') {
                                            const temp = result.data[k];

                                            if (temp && temp.length > 0) {
                                                temp.map((content: string, _index: number) => {
                                                    content = content.replace(/(\r\n|\n|\r)/gm, "");

                                                    const limit = this.queryForm.get('amountCtrl').value;
                                                    const wordCount = content ? content.trim().split(/\s+/) : [];
                                                    const words = wordCount.length;

                                                    if (words >= limit) {
                                                        this.blocks.push(content.trimStart());
                                                    }
                                                });
                                            }
                                        }
                                    }
                                }
                            },
                            error: () => {

                            },
                            complete: () => {

                            }
                        });
                });
            }
        });
    }

    getSelected() {
        let results = [];

        if (this.item && this.blocks.length > 0) {
            results.push(this.item.selectedOptions.selected.map(s => `<p id="source-word-${uuid.v4()}">${s.value}</p>`));
        }

        return results;
    }

    get(): void {
        this.dialogRef.close({
            result: this.getSelected(),
        });
    }

    constructor(
        public dialogRef: MatDialogRef<any>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private _blogService: BlogService,
        private _formBuilder: UntypedFormBuilder,
        private _userService: UserService,
        private _crawlService: CrawlService,
        private multiAccountService: MultiAccountService
    ) {
        // lấy secretKey và searchAPIKey
        this.settings = this.multiAccountService.getItem('settings');
        if (this.settings) {
            this.secretKey = (this.settings.secretKey) ? this.settings.secretKey.split(';') : undefined;
            this.searchAPIKey = (this.settings.searchAPIKey) ? this.settings.searchAPIKey.split(';') : undefined;
        }
    }

    /**
     * On init
     */
    ngOnInit(): void {
        // Create the form
        this.queryForm = this._formBuilder.group({
            keyword: [this.data.keyword, Validators.required],
            amountCtrl: [20, Validators.required]
        });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
