import { Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MXHAutoService } from "app/_services/mxhauto";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

// 1. Định nghĩa thư viện Nhân cách ngay tại đây (hoặc tách ra file constant riêng)
export const PERSONA_LIBRARY = [
    { id: 1, gender: 'Nam', age: '18-24', style: 'Gen Z, trẻ trung, dùng teencode, thích rẻ', role: 'Sinh viên' },
    { id: 2, gender: 'Nữ', age: '18-24', style: 'Gen Z, điệu đà, thích bắt trend, khen nhiều', role: 'Fan cứng' },
    { id: 3, gender: 'Nữ', age: '25-34', style: 'Dân văn phòng, hỏi kỹ về công dụng, ship hàng', role: 'Khách hàng kỹ tính' },
    { id: 4, gender: 'Nam', age: '25-34', style: 'Thực tế, hỏi giá, chốt đơn nhanh gọn', role: 'Người mua hàng' },
    { id: 5, gender: 'Nữ', age: '35-45', style: 'Mẹ bỉm sữa, quan tâm an toàn, hỏi về con cái', role: 'Nội trợ' },
    { id: 6, gender: 'Nam', age: '40+', style: 'Lịch sự, nghiêm túc, hỏi về nguồn gốc xuất xứ', role: 'Khách trung niên' },
    { id: 7, gender: 'Nữ', age: '20-30', style: 'Hài hước, hay trêu chủ shop, comment vui vẻ', role: 'Cây hài' },
    { id: 8, gender: 'Nữ', age: 'bất kỳ', style: 'Tò mò, hay hỏi những câu ngây ngô', role: 'Người mới xem' },
    { id: 99, gender: 'Khác', age: '', style: 'Tự do', role: 'Tự do (Ghi chú thường)' } // Dành cho note cũ
];

@Component({
    selector: 'edit-account-dialog',
    template: `
    <div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:user-check'"></mat-icon>
        <mat-label class="self-center">Cấu hình Profile & Nhân cách</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <form [formGroup]="editForm">
            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>E-mail</mat-label>
                <input [formControlName]="'email'" placeholder="E-mail tài khoản" type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Alias (Tên gợi nhớ)</mat-label>
                <input [formControlName]="'alias'" placeholder="Ví dụ: Nick chính, Nick seeding 1..." type="text" required matInput>
            </mat-form-field>

            <mat-form-field class="w-full mt-2 mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Chọn Nhân cách (Persona)</mat-label>
                <mat-select [formControlName]="'personaId'" (selectionChange)="onPersonaChange($event)">
                    <mat-option *ngFor="let p of personas" [value]="p.id">
                        <span class="text-base">{{ p.role }} - </span>
                        <span class="text-base text-gray-300">({{ p.gender }} - {{ p.style }})</span>
                    </mat-option>
                </mat-select>
            </mat-form-field>

            <ng-container *ngIf="isCustomNote; else personaDetail">
                <mat-form-field class="w-full mt-2 mb-3 custom-textarea fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                    <mat-label>Ghi chú tùy chỉnh</mat-label>
                    <textarea [formControlName]="'customNote'" matInput cdkTextareaAutosize></textarea>
                </mat-form-field>
            </ng-container>

            <ng-template #personaDetail>
                <div class="bg-gray-50 p-4 rounded-md text-base text-gray-600 mb-3" *ngIf="selectedPersona">
                    <p><strong>Giới tính:</strong> {{ selectedPersona.gender }}</p>
                    <p><strong>Độ tuổi:</strong> {{ selectedPersona.age }}</p>
                    <p><strong>Phong cách:</strong> {{ selectedPersona.style }}</p>
                </div>
            </ng-template>
        </form>
    </div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">
    <button mat-flat-button (click)="save()" color="primary" class="">
            Lưu cấu hình
        </button>
    <button mat-flat-button (click)="onNoClick()" color="warn" class="">Đóng</button>
</div>`,
    encapsulation: ViewEncapsulation.None
})
export class EditAccountDialog implements OnInit, OnDestroy {
    editForm: UntypedFormGroup;
    personas = PERSONA_LIBRARY;
    selectedPersona: any;
    isCustomNote = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        public dialogRef: MatDialogRef<EditAccountDialog>,
        private toastr: ToastrService,
        private _mxhautoService: MXHAutoService,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) { }

    ngOnInit(): void {
        const currentNote = this.data['item']['note'] || '';
        let initialPersonaId = 99;
        let customNoteVal = currentNote;

        // Detect JSON Persona
        try {
            const parsed = JSON.parse(currentNote);
            if (parsed && parsed.role && parsed.style) {
                const found = this.personas.find(p => p.role === parsed.role && p.style === parsed.style);
                if (found) {
                    initialPersonaId = found.id;
                    this.selectedPersona = found;
                } else {
                    initialPersonaId = 99;
                }
            }
        } catch (e) {
            initialPersonaId = 99;
        }

        this.isCustomNote = (initialPersonaId === 99);

        this.editForm = this._formBuilder.group({
            id: [this.data['item']['id']], // ID có thể null nếu tạo mới, không bắt buộc
            platform: [this.data['item']['platform'] || 'tiktok', Validators.required],
            email: [this.data['item']['email'], Validators.required],
            alias: [this.data['item']['alias'], Validators.required],
            personaId: [initialPersonaId],
            customNote: [customNoteVal]
        });
    }

    onPersonaChange(event: any) {
        const id = event.value;
        if (id === 99) {
            this.isCustomNote = true;
            this.selectedPersona = null;
        } else {
            this.isCustomNote = false;
            this.selectedPersona = this.personas.find(p => p.id === id);
        }
    }

    save() {
        if (this.editForm.valid) {
            let finalNote = "";
            if (this.isCustomNote) {
                finalNote = this.editForm.get('customNote').value;
            } else {
                if (this.selectedPersona) {
                    finalNote = JSON.stringify(this.selectedPersona);
                }
            }

            // [QUAN TRỌNG] Lấy profiles_root từ data truyền vào (C:\OperaProfiles)
            // Nếu không có thì fallback về mặc định
            const rootPath = this.data['item']['profiles_root'] || 'C:\\OperaProfiles';

            // [SỬA ĐỔI] Dùng upsertAccount thay vì updateAccount
            // Và gửi kèm profiles_root
            this._mxhautoService.updateAccount({
                profiles_root: rootPath,  // <--- QUAN TRỌNG: Chỉ định nơi lưu DB
                platform: this.editForm.get('platform').value,
                email: this.editForm.get('email').value,
                alias: this.editForm.get('alias').value,
                note: finalNote,
                active: true,
                username: this.data['user']['name']
            })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.ok) {
                            // Cập nhật lại UI
                            this.data['item']['email'] = this.editForm.get('email').value;
                            this.data['item']['alias'] = this.editForm.get('alias').value;
                            this.data['item']['note'] = finalNote;

                            this.onNoClick();
                            this.toastr.success('Đã lưu thành công!');
                        } else {
                            this.toastr.error('Lỗi khi lưu vào CSDL.');
                        }
                    },
                    error: (e) => {
                        console.error(e);
                        this.toastr.error(`Không thể kết nối Server.`);
                    },
                });
        }
    }

    onNoClick(): void {
        this.dialogRef.close({ data: this.data });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}