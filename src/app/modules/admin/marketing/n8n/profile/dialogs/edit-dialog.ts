import { Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MXHAutoService } from "app/_services/mxhauto";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";

export const PERSONA_LIBRARY = [
    { id: 1, gender: 'Nam', age: '18-24', style: 'Gen Z, trẻ trung, dùng teencode, thích săn deal rẻ', role: 'Sinh viên săn deal' },
    { id: 2, gender: 'Nữ', age: '18-24', style: 'Gen Z, điệu đà, bắt trend tiktok, khen shop nhiều', role: 'Fan cứng mukbang / livestream' },
    { id: 3, gender: 'Nữ', age: '25-34', style: 'Dân văn phòng, hỏi kỹ về công dụng, phí ship và bảo hành', role: 'Khách hàng kỹ tính' },
    { id: 4, gender: 'Nam', age: '25-34', style: 'Thực tế, hỏi giá, xin ưu đãi, chốt đơn nhanh gọn', role: 'Người mua hàng chốt nhanh' },
    { id: 5, gender: 'Nữ', age: '35-45', style: 'Mẹ bỉm sữa, quan tâm an toàn, chất lượng cho gia đình & bé', role: 'Nội trợ bỉm sữa' },
    { id: 6, gender: 'Nam', age: '40+', style: 'Lịch sự, nghiêm túc, hỏi về nguồn gốc xuất xứ, độ bền', role: 'Khách trung niên' },
    { id: 7, gender: 'Nữ', age: '20-30', style: 'Hài hước, hay trêu chủ shop, tạo tương tác comment vui vẻ', role: 'Cây hài dí dỏm' },
    { id: 8, gender: 'Nữ', age: '18-28', style: 'Đam mê skincare, hỏi về thành phần, loại da phù hợp', role: 'Tín đồ mỹ phẩm' },
    { id: 9, gender: 'Nam', age: '20-32', style: 'Mê công nghệ, hỏi cấu hình, thông số, trải nghiệm thực tế', role: 'Dân công nghệ (Techy)' },
    { id: 10, gender: 'Nữ', age: '20-30', style: 'Thích thời trang, hỏi phối đồ, tư vấn bằng đo size chuẩn', role: 'Tín đồ thời trang' },
    { id: 11, gender: 'Nam', age: '22-35', style: 'Tập gym, thể thao, quan tâm đạm, đồ tập & chất lượng cao', role: 'Dân Gymer / Thể thao' },
    { id: 12, gender: 'Nữ', age: '28-40', style: 'Yêu bếp núc, hỏi công thức, đồ dùng nhà bếp thông minh', role: 'Yêu bếp gia đình' },
    { id: 13, gender: 'Nam', age: '30-50', style: 'Doanh nhân, hỏi combo số lượng lớn, hóa đơn GTGT & hợp đồng', role: 'Khách sỉ / Doanh nhân' },
    { id: 14, gender: 'Nữ', age: '18-28', style: 'Đam mê du lịch, phượt, hỏi mẹo chuẩn bị hành lý', role: 'Tín đồ du lịch' },
    { id: 15, gender: 'Nam', age: '18-25', style: 'Gamer, hỏi phụ kiện chơi game, đèn LED, bàn phím cơ', role: 'Game thủ' },
    { id: 16, gender: 'Nữ', age: '22-32', style: 'Yêu thú cưng, hỏi kinh nghiệm chăm chó mèo, đồ pet', role: 'Con sen yêu thú cưng' },
    { id: 17, gender: 'Nam', age: '25-40', style: 'Yêu xe, thích phượt, hỏi về phụ tùng & chăm sóc xe', role: 'Tín đồ yêu xe' },
    { id: 18, gender: 'Nữ', age: 'bất kỳ', style: 'Tò mò, hay hỏi những câu ngây ngô', role: 'Người mới xem' },
    { id: 99, gender: 'Khác', age: '', style: 'Tự do', role: 'Tự do (Ghi chú thường)' }
];

@Component({
    selector: 'edit-account-dialog',
    template: `
    <div class="flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="shrink-0 pb-1">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
                    <mat-icon [svgIcon]="'feather:user-check'" class="text-purple-600 icon-size-5"></mat-icon>
                    <span>Cấu hình Profile & Nhân cách</span>
                </div>
                <button type="button" mat-icon-button (click)="onNoClick()">
                    <mat-icon [svgIcon]="'feather:x'"></mat-icon>
                </button>
            </div>

            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Vui lòng điền đầy đủ thông tin profile để hệ thống có thể kết nối và tự động.
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
                    <input [formControlName]="'alias'" placeholder="Ví dụ: Nick chính, Nick seeding 1..." type="text" required matInput>
                </mat-form-field>

                <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                    <mat-label>Proxy Dân Cư / Private Proxy (Tùy chọn)</mat-label>
                    <input [formControlName]="'proxy'" placeholder="Ví dụ: 103.15.50.1:8080:user:pass hoặc http://user:pass@ip:port" type="text" matInput>
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
                        <textarea [formControlName]="'customNote'" placeholder="Nhập ghi chú cá nhân..." matInput rows="3" cdkTextareaAutosize></textarea>
                    </mat-form-field>
                </ng-container>
            </form>
        </div>

        <!-- Footer -->
        <div class="shrink-0 flex items-center justify-end gap-3 mt-5 pt-2">
            <button mat-button (click)="onNoClick()" class="text-gray-600 dark:text-gray-300 font-medium">Hủy</button>
            <button mat-flat-button [color]="'primary'" (click)="save()">
                <mat-icon class="icon-size-4" [svgIcon]="'feather:check'"></mat-icon>
                <mat-label class="ml-2">Lưu lại</mat-label>
            </button>
        </div>
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
                }
            }
        } catch (e) {}

        // Ưu tiên ngẫu nhiên chọn 1 nhân cách nếu chưa có nhân cách được gán trước đó
        if (!this.selectedPersona) {
            const available = this.personas.filter(p => p.id !== 99);
            const rand = available[Math.floor(Math.random() * available.length)];
            initialPersonaId = rand.id;
            this.selectedPersona = rand;
        }

        this.isCustomNote = (initialPersonaId === 99);

        let initialProxy = '';
        if (this.data['item']) {
            const prx = this.data['item']['proxy'];
            if (typeof prx === 'string') {
                initialProxy = prx;
            } else if (prx && prx.raw) {
                initialProxy = prx.raw;
            }
        }

        this.editForm = this._formBuilder.group({
            id: [this.data['item']['id']],
            platform: [this.data['item']['platform'] || 'tiktok', Validators.required],
            email: [this.data['item']['email'], Validators.required],
            alias: [this.data['item']['alias'], Validators.required],
            proxy: [initialProxy],
            personaId: [initialPersonaId],
            customNote: [customNoteVal]
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

            const rootPath = this.data['item']['profiles_root'] || localStorage.getItem('opera_profiles_root') || '';
            const proxyVal = (this.editForm.get('proxy')?.value || '').trim();
            const profileName = this.data['item']['profile'] || (this.data['item']['profiles'] && this.data['item']['profiles'][0]);

            if (profileName) {
                if (proxyVal) {
                    this._mxhautoService.setProfileProxy({
                        profiles_root: rootPath,
                        profile: profileName,
                        proxy: proxyVal
                    }).subscribe({
                        next: () => {
                            this.data['item']['proxy'] = proxyVal;
                        }
                    });
                } else {
                    this._mxhautoService.removeProfileProxy({
                        profiles_root: rootPath,
                        profiles: [profileName]
                    }).subscribe({
                        next: () => {
                            this.data['item']['proxy'] = null;
                        }
                    });
                }
            }

            this._mxhautoService.updateAccount({
                profiles_root: rootPath,
                id: this.editForm.get('id').value,
                platform: this.editForm.get('platform').value,
                email: this.editForm.get('email').value,
                alias: this.editForm.get('alias').value,
                note: finalNote,
                username: this.data['user'] ? this.data['user']['name'] : ''
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.data['item']['email'] = this.editForm.get('email').value;
                        this.data['item']['alias'] = this.editForm.get('alias').value;
                        this.data['item']['note'] = finalNote;

                        this.dialogRef.close({ data: this.data });
                        this.toastr.success('Cập nhật thành công!');
                    }
                },
                error: (e: any) => {
                    this.toastr.error(`Không thể lưu cấu hình.`);
                }
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