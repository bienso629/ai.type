import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'policy',
    templateUrl: './policy.component.html',
    styleUrls: ['./policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class PolicyComponent implements OnInit {
    readonly sections = [
        { id: 'purpose', title: '1. Mục đích thu thập thông tin' },
        { id: 'scope', title: '2. Phạm vi thu thập thông tin' },
        { id: 'retention', title: '3. Thời gian lưu trữ dữ liệu' },
        { id: 'authorized-parties', title: '4. Tiếp cận và chia sẻ dữ liệu' },
        { id: 'user-access', title: '5. Quản lý & Chỉnh sửa dữ liệu' },
        { id: 'complaint-mechanism', title: '6. Bảo mật & Giải quyết khiếu nại' },
    ];

    constructor(private titleService: Title) {
        this.titleService.setTitle(`Chính sách bảo mật | AI.TYPE`);
    }

    ngOnInit(): void {}
}
