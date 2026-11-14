import { Directive, Input } from '@angular/core';

@Directive({
    selector: 'ngx-datatable[appScrollLock]',
    standalone: false
})
export class DatatableScrollLockDirective {
    /**
     * Giữ input tương thích cho toàn bộ template đang bind [appScrollLock]="isLoading",
     * nhưng KHÔNG khóa cứng overflow hoặc chặn sự kiện wheel/touchmove để người dùng
     * luôn có thể cuộn xem và thao tác mượt mà ngay trong lúc dữ liệu đang tải nền.
     */
    @Input('appScrollLock') appScrollLock: boolean = false;
}
