import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'delivery-policy',
    templateUrl: './delivery-policy.component.html',
    styleUrls: ['./delivery-policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class DeliveryPolicyComponent implements OnInit {
    readonly sections = [
        { id: 'scope', title: '1. Phạm vi áp dụng' },
        { id: 'delivery-method', title: '2. Phương thức bàn giao số' },
        { id: 'delivery-time', title: '3. Thời gian kích hoạt & Bàn giao' },
        { id: 'customer-responsibility', title: '4. Trách nhiệm người dùng' },
        { id: 'support-contact', title: '5. Hỗ trợ giao nhận' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Chính sách giao nhận | AI.TYPE`);
    }

    ngOnInit(): void {}
}
