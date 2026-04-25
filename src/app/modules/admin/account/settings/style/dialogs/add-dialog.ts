import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { UserService } from "app/core/user/user.service";
import { User } from "app/core/user/user.types";
import { UserClientService } from "app/modules/_services/user";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";
import { MultiAccountService } from "app/modules/_services/multi-account.service";

@Component({
    selector: 'styles-addmore-dialog',
    providers: [UserClientService],
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:coffee'"></mat-icon>
        <mat-label class="self-center">Thêm phong cách</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="editForm">
            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Tên phong cách</mat-label>
                <input [formControlName]="'name'" placeholder="Tên phong cách" type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 field-hidden-subscript fuse-mat-dense fuse-mat-emphasized-affix">
                <mat-label>Ảnh phong cách</mat-label>
                <input placeholder="Đường dẫn ảnh mô tả phong cách"
                    [formControlName]="'avatar'" matInput
                    [matAutocomplete]="avatar">
                <mat-icon class="icon-size-4" matPrefix [svgIcon]="'feather:camera'"></mat-icon>

                <mat-autocomplete #avatar="matAutocomplete" (optionSelected)="getAvatar($event.option.value)">
                    <mat-option *ngFor="let avatar of avatars" [value]="avatar"
                        class="py-2 mb-2">
                        <img class="w-10 h-10" src="{{avatar}}" />
                    </mat-option>
                </mat-autocomplete>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 custom-textarea fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Mô tả chính xác</mat-label>
                <textarea class="max-h-40 min-h-10 px-2" [formControlName]="'desc'" [placeholder]="'Mô tả chính xác phong cách của bạn.'" type="text" required matInput cdkTextareaAutosize></textarea>
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button *ngIf="index < 0" (click)="save()" color="primary" class="float-right">
            Thêm phong cách
        </button>

        <button mat-flat-button *ngIf="index > -1" (click)="update()" color="primary" class="float-right">
            Sửa phong cách
        </button>

        <button mat-flat-button (click)="onNoClick()" color="medium" class="float-right">Đóng cửa sổ</button>
    </div>`,
})
export class AddStyleDialog implements OnInit, OnDestroy {
    user: User;
    index: number = -1;
    editForm: UntypedFormGroup;

    avatars = [
        'assets/images/avatars/brian-hughes.jpg',
        'assets/images/avatars/female-01.jpg',
        'assets/images/avatars/male-01.jpg',
        'assets/images/avatars/female-02.jpg',
        'assets/images/avatars/male-02.jpg',
        'assets/images/avatars/female-03.jpg',
        'assets/images/avatars/male-03.jpg',
        'assets/images/avatars/female-04.jpg'
    ];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getAvatar(avatar: string) {
        this.editForm.controls['avatar'].setValue(avatar);
    }

    save(): void {
        let styles: any = this.multiAccountService.getItem('styles') || [];

        if (this.editForm.valid) {
            let style = this.editForm.value;

            styles.push(style);

            this._userClientService.updateProfile({
                profile: {
                    styles: styles,
                },
                username: this.user.name
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            this.multiAccountService.setItem('styles', styles);
                            this.onNoClick(style);

                            this.toastr.success(`Lưu phong cách thành công!`);
                        } else {
                            this.toastr.error(`Không thể lưu phong cách.`);
                        }
                    },
                    error: () => {
                    },
                    complete: () => {
                    }
                });
        } else {
            this.toastr.error('Lưu phong cách thất bại.');
        }
    }

    update() {
        this.data['styles'][this.index] = this.editForm.value;

        this._userClientService.updateProfile({
            profile: {
                styles: this.data['styles'],
            },
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.multiAccountService.setItem('styles', this.data['styles']);
                        this.onNoClick(this.data['styles'][this.index]);
                        this.toastr.success(`Đồng bộ phong cách xong!`);
                    } else {
                        this.toastr.error(`Không thể đồng bô phong cách.`);
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    onNoClick(data?: any): void {
        this.dialogRef.close(data);
    }

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _userService: UserService,
        private _userClientService: UserClientService,
        public dialogRef: MatDialogRef<AddStyleDialog>,
        @Inject(MAT_DIALOG_DATA) public data: AddStyleDialog,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService
    ) {
        if (data && data['index'] > -1) {
            this.index = data['index'];
        }

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        // Create the form
        this.editForm = this._formBuilder.group({
            name: [(this.data && this.data['styles'][this.data['index']]['name']) ? this.data['styles'][this.data['index']]['name'] : '', Validators.required],
            desc: [this.data && (this.data['styles'][this.data['index']]['desc']) ? this.data['styles'][this.data['index']]['desc'] : '', Validators.required],
            avatar: [(this.data && this.data['styles'][this.data['index']]['avatar']) ? this.data['styles'][this.data['index']]['avatar'] : 'assets/images/avatars/brian-hughes.jpg', Validators.required]
        });
    }
}
