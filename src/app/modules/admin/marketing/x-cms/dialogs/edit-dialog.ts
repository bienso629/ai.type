import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { User } from "app/core/user/user.types";
import { CustomerService } from "app/modules/_services/customer";
import { LogService } from "app/modules/_services/link";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

@Component({
    selector: 'customer-edit-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:link'"></mat-icon>
        <mat-label class="self-center">Chỉnh sửa thông tin Khách hàng</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="editForm">
            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Họ và tên</mat-label>
                <input [formControlName]="'full_name'" placeholder="Nguyễn Văn A" type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>E-mail</mat-label>
                <input [formControlName]="'email'" placeholder="tencuaban@yourdomain.com" type="text" matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Ảnh đại diện</mat-label>
                <input [formControlName]="'avatar'" placeholder="Đường dẫn" type="text" matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Địa chỉ</mat-label>
                <input [formControlName]="'address'" placeholder="412 Cộng Hoà, P. Tân Bình, TP.Hồ Chí Minh" type="text" matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Sinh nhật</mat-label>
                <input [formControlName]="'birthday'" placeholder="12/12/1995" type="text" matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Giới tính</mat-label>
                <input [formControlName]="'gender'" placeholder="Nam" type="text" matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Công việc</mat-label>
                <input [formControlName]="'job'" placeholder="Nhân viên văn phòng" type="text" matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Trạng thái</mat-label>
                <input [formControlName]="'status'" placeholder="Hoạt động" type="text" required matInput>
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button (click)="save()" color="primary" class="">
            Cập nhật
        </button>
    <button mat-flat-button (click)="onNoClick()" color="medium" class="">Đóng cửa sổ</button>
</div>`,
})
export class EditDialog implements OnInit, OnDestroy {
    editForm: UntypedFormGroup;
    user: User;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<EditDialog>,
        private _customerService: CustomerService,
        private toastr: ToastrService,
        @Inject(MAT_DIALOG_DATA) public data: EditDialog
    ) {
        this.user = data['user'];
        this.details(data['item']['id']);
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        // Create the form
        this.editForm = this._formBuilder.group({
            id: [this.data['item']['id'], Validators.required],
            full_name: [this.data['item']['full_name']],
            email: [this.data['item']['email']],
            avatar: [this.data['item']['avatar']],
            address: [this.data['item']['address']],
            birthday: [this.data['item']['birthday']],
            gender: [this.data['item']['gender']],
            job: [this.data['item']['job']],
            status: [this.data['item']['status']]
        });
    }

    details(customer_id: string) {
        this._customerService.customer({
            username: this.user.name,
            customer_id: customer_id
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result) => {
                },
                error: () => {
                },
                complete: () => { }
            });
    }

    save(): void {
        if (this.editForm.valid) {
            this._customerService.update({
                customer_id: this.editForm.get('id').value,
                full_name: this.editForm.get('full_name').value,
                email: this.editForm.get('email').value,
                avatar: this.editForm.get('avatar').value,
                address: this.editForm.get('address').value,
                birthday: this.editForm.get('birthday').value,
                gender: this.editForm.get('gender').value,
                job: this.editForm.get('job').value,
                status: this.editForm.get('status').value,
                username: this.data['user']['name']
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        console.log('result', result);
                        if (result) {
                            this.onNoClick();
                            this.toastr.success('Cập nhật xong!');
                        }
                    },
                    error: (e: any) => {
                        this.toastr.error(`Không thể chỉnh sửa.`);
                    },
                    complete: () => { }
                });
        } else {
            this.toastr.error(`Không thể chỉnh sửa.`);
        }
    }

    onNoClick(): void {
        this.dialogRef.close({
            data: this.data
        });
    }
}
