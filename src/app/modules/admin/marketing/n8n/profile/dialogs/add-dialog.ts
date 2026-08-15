import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MXHAutoService } from "app/_services/mxhauto";
import { PERSONA_LIBRARY } from "./edit-dialog";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

@Component({
    selector: 'add-account-dialog',
    template: `
    <div class="flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="shrink-0 pb-1">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
                    <mat-icon [svgIcon]="'feather:user-plus'" class="text-primary-600 icon-size-5"></mat-icon>
                    <span>Thêm mới tài khoản & Nhân cách</span>
                </div>
                <button type="button" mat-icon-button (click)="onNoClick()">
                    <mat-icon [svgIcon]="'feather:x'"></mat-icon>
                </button>
            </div>

            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Vui lòng điền đầy đủ thông tin tài khoản để hệ thống có thể kết nối và tự động.
            </p>
        </div>

        <!-- Form -->
        <div class="flex flex-col gap-3">
            <form [formGroup]="editForm" class="flex flex-col gap-3">
                <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                    <mat-label>E-mail*</mat-label>
                    <input [formControlName]="'email'" placeholder="E-mail tài khoản" type="text" required matInput>
                </mat-form-field>

                <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                    <mat-label>Alias (Tên gợi nhớ)*</mat-label>
                    <input [formControlName]="'alias'" placeholder="Ví dụ: Nick seeding 1..." type="text" required matInput>
                </mat-form-field>

                <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                    <mat-label>Chọn Nhân cách (Persona)</mat-label>
                    <mat-select [formControlName]="'personaId'" (selectionChange)="onPersonaChange($event)">
                        <mat-option *ngFor="let p of personas" [value]="p.id">
                            <span class="text-base font-semibold">{{ p.role }}</span>
                            <span class="text-base text-gray-400" *ngIf="p.id !== 99"> - ({{ p.gender }} | {{ p.style }})</span>
                        </mat-option>
                    </mat-select>
                </mat-form-field>

                <ng-container *ngIf="isCustomNote">
                    <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix custom-textarea" [subscriptSizing]="'dynamic'">
                        <mat-label>Ghi chú tùy chỉnh</mat-label>
                        <textarea [formControlName]="'note'" placeholder="Nhập ghi chú cá nhân..." matInput rows="3" cdkTextareaAutosize></textarea>
                    </mat-form-field>
                </ng-container>
            </form>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex items-center justify-end gap-3 mt-5 pt-2">
            <button mat-button (click)="onNoClick()" class="text-gray-600 dark:text-gray-300 font-medium">Hủy</button>
            <button mat-flat-button [color]="'primary'" (click)="save()">
                <mat-icon class="icon-size-4" [svgIcon]="'feather:user-plus'"></mat-icon>
                <mat-label class="ml-2">Thêm tài khoản</mat-label>
            </button>
        </div>
    </div>`,
})
export class AddAccountDialog implements OnInit, OnDestroy {
    editForm: UntypedFormGroup;
    personas = PERSONA_LIBRARY;
    selectedPersona: any;
    isCustomNote = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<AddAccountDialog>,
        private toastr: ToastrService,
        private _mxhautoService: MXHAutoService,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) { }

    ngOnInit(): void {
        const available = this.personas.filter(p => p.id !== 99);
        const rand = available[Math.floor(Math.random() * available.length)];
        this.selectedPersona = rand;

        this.editForm = this._formBuilder.group({
            profiles_root: [this.data['item']['profiles_root'], Validators.required],
            platform: [this.data['item']['platform'], Validators.required],
            email: ['', Validators.required],
            alias: ['', Validators.required],
            personaId: [rand.id],
            note: [JSON.stringify(rand), Validators.required],
            profiles: [this.data['item']['profiles'], Validators.required],
            active: [this.data['item']['active'], Validators.required]
        });
    }

    getPersonaSummary(): string {
        if (!this.selectedPersona) return '';
        return `🎭 Vai trò: ${this.selectedPersona.role}\n👤 Giới tính: ${this.selectedPersona.gender} | Độ tuổi: ${this.selectedPersona.age}\n💬 Phong cách: ${this.selectedPersona.style}`;
    }

    onPersonaChange(event: any) {
        const id = event.value;
        if (id === 99) {
            this.isCustomNote = true;
            this.selectedPersona = null;
            this.editForm.patchValue({ note: '' });
        } else {
            this.isCustomNote = false;
            this.selectedPersona = this.personas.find(p => p.id === id);
            if (this.selectedPersona) {
                this.editForm.patchValue({ note: JSON.stringify(this.selectedPersona) });
            }
        }
    }

    save() {
        if (this.editForm.valid) {
            let finalNote = this.editForm.get('note').value;
            if (!this.isCustomNote && this.selectedPersona) {
                finalNote = JSON.stringify(this.selectedPersona);
            }

            this._mxhautoService.addAccount({
                profiles_root: this.editForm.get('profiles_root').value,
                platform: this.editForm.get('platform').value,
                email: this.editForm.get('email').value,
                alias: this.editForm.get('alias').value,
                note: finalNote,
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
                        this.data['item']['note'] = finalNote;

                        this.onNoClick();
                        this.toastr.success('Đã thêm mới thành công!');
                    }
                },
                error: (e: any) => {
                    this.toastr.error(`Không thể thêm mới.`);
                }
            });
        }
    }

    onNoClick(): void {
        this.dialogRef.close({
            data: this.data
        });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
