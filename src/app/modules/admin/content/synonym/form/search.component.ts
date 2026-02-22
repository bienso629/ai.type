import { AfterContentChecked, ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { ColumnMode, DatatableComponent } from '@swimlane/ngx-datatable';
import * as _ from 'lodash';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
    selector: 'synonymform',
    templateUrl: './search.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SynonymFormComponent implements OnInit, OnDestroy, AfterContentChecked {
    user: User;
    chatgptForm: UntypedFormGroup;
    result: string = '';

    limit = 20;
    offset = 0;
    temp = [];

    @ViewChild(DatatableComponent) table: DatatableComponent;
    ColumnMode = ColumnMode;

    @Input() items = []; // decorate the property with @Input()

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getRowHeight(row: any) {
        if (!row) {
            return 50;
        }
        if (row.height === undefined) {
            return 50;
        }
        return row.height;
    }

    find() {
        const val = this.chatgptForm.get('chatgpt').value;

        // filter our data
        const temp = this.temp.filter(function (d) {
            return d.word.toLowerCase().indexOf(val.toLowerCase()) !== -1 || !val.toLowerCase();
        });

        // update the rows
        this.items = temp;

        // Whenever the filter changes, always go back to the first page
        this.table.offset = 0;
    }

    search(data: any) {
        const keyword = data.word;

        // filter our data
        const temp = _.find(this.items, function (d) {
            return d.word.indexOf(keyword) !== -1;
        });

        if (temp) {
            let html = `<ol class="giai-nghia">`;
            html += `<li>"${temp['mean']}"</li>`;
            html += `<li><b>Đồng nghĩa</b>: ${temp['synonym']}</li>`;
            html += `<li><b>Trái nghĩa</b>: ${temp['unsynonym']}</li>`;

            if (temp['sentence_with_synonym'].length > 0) {
                html += `<li><b>Ví dụ về đồng nghĩa:</b></li>`;
                temp['sentence_with_synonym'].map((item: any) => {
                    html += `<li>+ ${item}</li>`;
                });
            }

            if (temp['sentence_with_unsynonym'].length > 0) {
                html += `<li><b>Ví dụ về trái nghĩa:</b></li>`;
                temp['sentence_with_unsynonym'].map((item: any) => {
                    html += `<li>+ ${item}</li>`;
                });
            }

            html += `</ol>`;

            this.popover(`${temp['word']}`, `${html}`);
        }
    }

    popover(title?: string, message?: string, keyword?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: (title) ? title : 'Giải nghĩa',
            message: (message) ? message : 'Nội dung bạn đang yêu cầu hiển thị không được tìm thấy vào lúc này.',
            icon: {
                show: false,
                name: 'feather:info',
                color: 'primary'
            },
            actions: {
                confirm: {
                    show: false,
                    label: 'Thực hiện',
                    color: 'primary'
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại'
                }
            },
            dismissible: true
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((result) => {
            if (result === "confirmed") {}
        });
    }

    /**
     * Constructor
     */
    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _fuseConfirmationService: FuseConfirmationService,
        private _userService: UserService,
    ) { }

    ngAfterContentChecked(): void {
        //Called after every check of the component's or directive's content.
        //Add 'implements AfterContentChecked' to the class.
        // cache our list
        if (this.temp.length === 0) {
            this.temp = [...this.items];
        }
    }

    ngOnInit(): void {
        // throw new Error('Method not implemented.');
        // Create the form
        this.chatgptForm = this._formBuilder.group({
            chatgpt: ['']
        });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
