import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
    selector: 'delivery-policy',
    templateUrl: './delivery-policy.component.html',
    styleUrls: ['./delivery-policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class DeliveryPolicyComponent implements OnInit {
    activeSection: string = 'intro';

    readonly sections = [
        { id: 'intro', title: 'Giới thiệu & Sản phẩm số' },
        { id: 'payment-confirm', title: '1. Xác nhận thanh toán' },
        { id: 'delivery-method', title: '2. Hình thức giao nhận' },
        { id: 'activate-usage', title: '3. Kích hoạt & Sử dụng dịch vụ' },
        { id: 'processing-time', title: '4. Thời gian xử lý & Bàn giao' },
        { id: 'delay-support', title: '5. Trường hợp chậm trễ & Hỗ trợ' },
    ];

    get currentYear(): number {
        return new Date().getFullYear();
    }

    constructor(
        private titleService: Title,
        private location: Location,
        private router: Router,
    ) {
        this.titleService.setTitle(`Chính sách giao nhận (Delivery Policy) | AI.TYPE`);
    }

    ngOnInit(): void {}

    scrollTo(id: string): void {
        this.activeSection = id;
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    goBack(): void {
        if (window.history.length > 1) {
            this.location.back();
        } else {
            this.router.navigate(['/dashboard']);
        }
    }

    print(): void {
        window.print();
    }
}
