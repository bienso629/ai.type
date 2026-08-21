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
        { id: 'intro', title: 'Giới thiệu chung' },
        { id: 'usage-guidelines', title: '1. Quy định sử dụng phần mềm' },
        { id: 'intellectual-property', title: '2. Quyền sở hữu & Bản quyền nội dung' },
        { id: 'orders-pricing', title: '3. Đơn hàng, Bảng giá & Nâng cấp' },
        { id: 'info-errors', title: '4. Xử lý sự cố kỹ thuật' },
        { id: 'important-rules', title: '5. Quy định về gói VIP & XU AI' },
        { id: 'support-contact', title: '6. Kênh hỗ trợ' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Điều khoản sử dụng | AI.TYPE`);
    }

    ngOnInit(): void {}
}
