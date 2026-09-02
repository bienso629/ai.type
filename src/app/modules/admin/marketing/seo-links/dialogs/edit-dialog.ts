import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { LogService } from "app/_services/link";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";
import { TranslocoService } from "@ngneat/transloco";

@Component({
    selector: 'chatgpt-paste-dialog',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:link'"></mat-icon>
        <mat-label class="self-center">{{ 'app.edit' | transloco }}</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="editForm">
            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>{{ 'app.title' | transloco }}</mat-label>
                <input [formControlName]="'title'" placeholder="{{ 'app.what_do_you_want_to_note_for_title' | transloco }}" type="text" required matInput>

                <!-- <button mat-icon-button type="button" matSuffix>
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:clipboard'"></mat-icon>
                </button> -->
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>{{ 'app.link' | transloco }}</mat-label>
                <input [formControlName]="'link'" placeholder="{{ 'app.attach_your_link_here' | transloco }}" type="text" required matInput>

                <!-- <button mat-icon-button type="button" matSuffix>
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:clipboard'"></mat-icon>
                </button> -->
            </mat-form-field>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button (click)="save()" color="primary" class="">
            {{ 'app.edit_link' | transloco }}
        </button>
    <button mat-button (click)="onNoClick()" class="">{{ 'app.close_window' | transloco }}</button>
</div>`,
})
export class EditDialog implements OnInit, OnDestroy {
    editForm: UntypedFormGroup;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<EditDialog>,
        private toastr: ToastrService,
        private _logService: LogService,
        private translocoService: TranslocoService,
        @Inject(MAT_DIALOG_DATA) public data: EditDialog
    ) { }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        // Create the form
        this.editForm = this._formBuilder.group({
            id: [this.data['item']['_id'], Validators.required],
            title: [this.data['item']['title'], Validators.required],
            link: [this.data['item']['link'], Validators.required]
        });
    }

    delete() {

    }

    save(): void {
        if (this.editForm.valid) {
            this._logService.update({
                _id: this.editForm.get('id').value,
                link: this.editForm.get('link').value,
                title: this.editForm.get('title').value,
                username: this.data['user']['name']
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.success && result.data) {
                            this.data['item']['title'] = this.editForm.get('title').value;
                            this.data['item']['link'] = this.editForm.get('link').value;

                            this.onNoClick();
                            this.toastr.success(this.translocoService.translate('app.update_completed'));
                        }
                    },
                    error: (e: any) => {
                        this.toastr.error(this.translocoService.translate('app.cannot_edit'));
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
}