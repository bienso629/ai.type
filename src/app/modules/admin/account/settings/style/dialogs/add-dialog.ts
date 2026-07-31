import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { UserService } from "app/core/user/user.service";
import { User } from "app/core/user/user.types";
import { UserClientService } from "app/_services/user";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";
import { MultiAccountService } from "app/_services/multi-account.service";

@Component({
    selector: 'styles-addmore-dialog',
    providers: [UserClientService],
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:coffee'"></mat-icon>
        <mat-label class="self-center" *ngIf="index < 0">{{ 'app.add_style' | transloco }}</mat-label>
        <mat-label class="self-center" *ngIf="index > -1">{{ 'app.edit_style' | transloco }}</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="editForm">
            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>{{ 'app.style_name' | transloco }}</mat-label>
                <input [formControlName]="'name'" [placeholder]="'app.style_name' | transloco" type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 field-hidden-subscript fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>{{ 'app.style_avatar' | transloco }}</mat-label>
                <input [placeholder]="'app.style_avatar_placeholder' | transloco"
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
                <mat-label>{{ 'app.exact_description' | transloco }}</mat-label>
                <textarea class="max-h-40 min-h-10 px-2" [formControlName]="'desc'" [placeholder]="'app.exact_description_placeholder' | transloco" type="text" required matInput cdkTextareaAutosize></textarea>
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button *ngIf="index < 0" (click)="save()" color="primary" class="">
            {{ 'app.add_style' | transloco }}
        </button>
    <button mat-flat-button *ngIf="index > -1" (click)="update()" color="primary" class="">
            {{ 'app.edit_style' | transloco }}
        </button>
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
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService
    ) {
        if (data && data['index'] !== undefined && data['index'] > -1) {
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
        const targetStyle = (this.data && this.data['styles'] && this.index > -1 && this.data['styles'][this.index]) ? this.data['styles'][this.index] : null;
        // Create the form
        this.editForm = this._formBuilder.group({
            name: [targetStyle ? targetStyle['name'] : '', Validators.required],
            desc: [targetStyle ? targetStyle['desc'] : '', Validators.required],
            avatar: [(targetStyle && targetStyle['avatar']) ? targetStyle['avatar'] : 'assets/images/avatars/brian-hughes.jpg', Validators.required]
        });
    }
}
