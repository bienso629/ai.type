import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ColumnMode, DatatableComponent, SelectionType } from '@swimlane/ngx-datatable';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { CrawlService } from 'app/_services/crawl';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef } from '@angular/material/dialog';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';

import * as uuid from 'uuid';
import * as _ from 'lodash';

import * as xml2js from 'xml2js';

@Component({
    selector: 'dialog-links-profile',
    styleUrls: ['./dialog.links.profile.scss'],
    templateUrl: './dialog.links.profile.html',
    providers: [CrawlService],
})
export class DialogLinksProfile implements OnInit, OnDestroy, AfterViewInit {
    user: User;
    xml: any;

    urlForm: UntypedFormGroup;

    data = [];

    @ViewChild(DatatableComponent) table: DatatableComponent;
    selected = [];
    ColumnMode = ColumnMode;
    SelectionType = SelectionType;

    editing = {};

    downloadJsonHref: any;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

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

    updateValue(event, cell, rowIndex) {
        this.editing[rowIndex + '-' + cell] = false;
        this.data[rowIndex][cell] = event.target.value;
        this.data = [...this.data];
    }

    updateDurationValue(event, cell, rowIndex) {
        this.editing[rowIndex + '-' + cell] = false;
        this.data[rowIndex]['options'][cell] = event.target.value;
        this.data = [...this.data];
    }

    updateLink(e: any, index: number) {
        this._crawlService.updateLink({
            _id: this.data[index]._id,
            link: e.target.value,
            title: uuid.v4(),
            options: this.data[index].options,
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data &&result.data.modifiedCount > 0) {
                        this.toastr.success(`Chỉnh sửa link xong.`);
                        this.generateDownloadJsonUri();
                    } else {
                        this.toastr.warning(`Link không thể sửa.`);
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

    generateDownloadJsonUri() {
        var theJSON = JSON.stringify(this.data);
        var uri = this.sanitizer.bypassSecurityTrustUrl("data:text/json;charset=UTF-8," + encodeURIComponent(theJSON));
        this.downloadJsonHref = uri;
    }

    links(): void {
        this._crawlService.links({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.data = [...result.data];
                        this.generateDownloadJsonUri();
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

    readFile(e: any) {
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.readAsText(file);

        reader.onload = async (evt) => {
            this.xml = JSON.parse((evt as any).target.result);

            if (this.xml.length > 0) {
                this.data = this.xml;
                this.generateDownloadJsonUri();
            }

            // lam moi lai giao dien
            this.cd.markForCheck();
        };
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
    }

    run(): void {
        this.dialogRef.close({
            start: true
        });
    }

    add(): void {
        if (!this.urlForm.get('link').value) return;

        this._crawlService.addLink({
            link: this.urlForm.get('link').value,
            title: uuid.v4(),
            options: {
                duration: this.urlForm.get('duration').value
            },
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.toastr.success(`Thêm link xong.`);
                    } else {
                        this.toastr.warning(`Link này đã tồn tại.`);
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

    close() {
        this.dialogRef.close({
            start: false
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {

    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngAfterViewInit(): void {
    }

    constructor(
        private cd: ChangeDetectorRef,
        private _formBuilder: UntypedFormBuilder,
        private _crawlService: CrawlService,
        private _userService: UserService,
        private toastr: ToastrService,
        private sanitizer: DomSanitizer,
        public dialogRef: MatDialogRef<DialogLinksProfile>
    ) {
        // Create the form
        this.urlForm = this._formBuilder.group({
            link: ['', Validators.required],
            duration: ['', Validators.required],
        });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.links();
            });
    }
}
