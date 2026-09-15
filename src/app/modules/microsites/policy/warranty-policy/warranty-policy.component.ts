import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'warranty-policy',
    templateUrl: './warranty-policy.component.html',
    styleUrls: ['./warranty-policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class WarrantyPolicyComponent implements OnInit {
    readonly sections = [
        { id: 'warranty-duration', title: '1. Thời hạn bảo hành dịch vụ' },
        { id: 'warranty-method', title: '2. Quy tắc bảo hành & Hoàn tiền' },
        { id: 'warranty-exceptions', title: '3. Trường hợp từ chối bảo hành' },
        { id: 'support-contact', title: '4. Kênh tiếp nhận bảo hành' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Chính sách bảo hành | AI.TYPE`);
    }

    ngOnInit(): void {}
}
