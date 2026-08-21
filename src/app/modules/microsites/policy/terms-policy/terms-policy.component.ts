import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'terms-policy',
    templateUrl: './terms-policy.component.html',
    styleUrls: ['./terms-policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class TermsPolicyComponent implements OnInit {
    readonly sections = [
        { id: 'intro', title: 'Giới thiệu & Chấp thuận' },
        { id: 'usage-guidelines', title: '1. Hướng dẫn sử dụng & Tài khoản' },
        { id: 'customer-feedback', title: '2. Ý kiến của khách hàng' },
        { id: 'orders-pricing', title: '3. Đơn hàng, Giá cả & Hóa đơn VAT' },
        { id: 'info-errors', title: '4. Xử lý sai lệch thông tin' },
        { id: 'important-rules', title: '5. Những quy định quan trọng' },
        { id: 'support-contact', title: '6. Thông tin liên hệ' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Điều khoản & Chính sách sử dụng | AI.TYPE`);
    }

    ngOnInit(): void {}
}
