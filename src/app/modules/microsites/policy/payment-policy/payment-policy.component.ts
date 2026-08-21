import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'payment-policy',
    templateUrl: './payment-policy.component.html',
    styleUrls: ['./payment-policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class PaymentPolicyComponent implements OnInit {
    readonly sections = [
        { id: 'intro', title: 'Quy trình đặt mua' },
        { id: 'payment-methods', title: '1. Phương thức thanh toán' },
        { id: 'payment-confirmation', title: '2. Xác nhận thanh toán' },
        { id: 'payment-conditions', title: '3. Điều kiện thanh toán' },
        { id: 'support-contact', title: '4. Kênh hỗ trợ thanh toán' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Chính sách thanh toán | AI.TYPE`);
    }

    ngOnInit(): void {}
}
