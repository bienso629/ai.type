import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MXHAutoService } from "app/modules/_services/mxhauto";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

@Component({
    selector: 'add-account-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:user-plus'"></mat-icon>
        <mat-label class="self-center">Thêm mới account</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="editForm">
            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>E-mail</mat-label>
                <input [formControlName]="'email'" placeholder="E-mail tài khoản" type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Alias</mat-label>
                <input [formControlName]="'alias'" placeholder="Tinh giản tài khoản" type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Note</mat-label>
                <input [formControlName]="'note'" placeholder="Ghi chú" type="text" required matInput>
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button (click)="save()" color="primary" class="">
            Thêm tài khoản
        </button>
    <button mat-flat-button (click)="onNoClick()" color="medium" class="">Đóng cửa sổ</button>
</div>`,
})
export class AddAccountDialog implements OnInit, OnDestroy {
    editForm: UntypedFormGroup;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    save() {
        if (this.editForm.valid) {
            this._mxhautoService.addAccount({
                profiles_root: this.editForm.get('profiles_root').value,
                platform: this.editForm.get('platform').value,
                email: this.editForm.get('email').value,
                alias: this.editForm.get('alias').value,
                note: this.editForm.get('note').value,
                profiles: this.editForm.get('profiles').value,
                active: this.editForm.get('active').value,
                username: this.data['user']['name']
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result) {
                            this.data['item']['email'] = this.editForm.get('email').value;
                            this.data['item']['alias'] = this.editForm.get('alias').value;
                            this.data['item']['note'] = this.editForm.get('note').value;

                            this.onNoClick();
                            this.toastr.success('Đã thêm mới!');
                        }
                    },
                    error: (e: any) => {
                        this.toastr.error(`Không thể thêm mới.`);
                    },
                    complete: () => { }
                });
        }
    }

    onNoClick(): void {
        this.dialogRef.close({
            data: this.data
        });
    }

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<AddAccountDialog>,
        private toastr: ToastrService,
        private _mxhautoService: MXHAutoService,
        @Inject(MAT_DIALOG_DATA) public data: AddAccountDialog
    ) { }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        // Create the form
        this.editForm = this._formBuilder.group({
            profiles_root: [this.data['item']['profiles_root'], Validators.required],
            platform: [this.data['item']['platform'], Validators.required],
            email: ['', Validators.required],
            alias: ['', Validators.required],
            note: ['', Validators.required],
            profiles: [this.data['item']['profiles'], Validators.required],
            active: [this.data['item']['active'], Validators.required]
        });
    }
}
