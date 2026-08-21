import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'warranty-policy',
    templateUrl: './warranty-policy.component.html',
    styleUrls: ['./warranty-policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class WarrantyPolicyComponent implements OnInit {
    readonly sections = [
        { id: 'warranty-duration', title: '1. Thời gian bảo hành' },
        { id: 'warranty-method', title: '2. Cách thức & Hình thức bảo hành' },
        { id: 'refund-policy', title: '3. Quy định hoàn tiền khi phát sinh lỗi' },
        { id: 'warranty-conditions', title: '4. Điều kiện áp dụng bảo hành' },
        { id: 'support-contact', title: '5. Kênh tiếp nhận & Quy trình hỗ trợ' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Chính sách bảo hành | AI.TYPE`);
    }

    ngOnInit(): void {}
}
