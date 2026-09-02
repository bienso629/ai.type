import { Component, Inject, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { CustomerService } from "app/_services/customer";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

@Component({
    selector: 'customer-sms-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:copy'"></mat-icon>
        <mat-label class="self-center">Gửi tin nhắn tới nhóm khách hàng</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="smsForm">
            <mat-form-field class="w-full custom-textarea fuse-mat-dense fuse-mat-emphasized-affix p-0" [subscriptSizing]="'dynamic'">
                <textarea class="max-h-80 min-h-40 px-2" [formControlName]="'content'" [placeholder]="'Soạn nội dung.'" type="text" (keyup.enter)="send()" required matInput cdkTextareaAutosize></textarea>
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button (click)="send()" color="primary" class="">
            Gửi tin nhắn
        </button>
    <button mat-button (click)="onNoClick()" class="">Đóng cửa sổ</button>
</div>`,
})
export class SMSDialog implements OnInit {
    smsForm: UntypedFormGroup;
    customers: any = [];
    tokens = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<SMSDialog>,
        private _customerService: CustomerService,
        private toastr: ToastrService,
        @Inject(MAT_DIALOG_DATA) public data: SMSDialog
    ) {
        this.customers = data['selected'];
        this.tokens = this.customers.map((item: any) => item.device_token);
    }

    ngOnInit(): void {
        // Create the form
        this.smsForm = this._formBuilder.group({
            content: ['', Validators.required]
        });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    send(): void {
        this._customerService.notifyMany({
            device_tokens: this.tokens,
            title: "Thông báo!",
            body: this.smsForm.get('content').value,
            data: { "type": "welcome" },
            username: this.data['user']['name']
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.onNoClick();
                        this.toastr.success('Đã gửi SMS!');
                    }
                },
                error: (e: any) => {
                    this.toastr.error(`Không thể gửi SMS.`);
                },
                complete: () => { }
            });
    }

    onNoClick(): void {
        this.dialogRef.close();
    }
}
