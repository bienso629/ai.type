import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
    selector: 'policy',
    templateUrl: './policy.component.html',
    styleUrls: ['./policy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class PolicyComponent implements OnInit {
    activeSection: string = 'intro';

    readonly sections = [
        { id: 'intro', title: '1. Giới thiệu chung' },
        { id: 'info-collected', title: '2. Thông tin chúng tôi thu thập' },
        { id: 'how-we-use', title: '3. Cách sử dụng thông tin' },
        { id: 'third-party-sharing', title: '4. Chia sẻ & Đối tác bên thứ ba' },
        { id: 'user-rights', title: '5. Quyền & Lựa chọn của bạn' },
        { id: 'data-security', title: '6. An toàn & Bảo mật (AES-256)' },
        { id: 'data-retention', title: '7. Thời hạn lưu trữ dữ liệu' },
        { id: 'children-policy', title: '8. Chính sách bảo vệ trẻ em' },
        { id: 'policy-updates', title: '9. Cập nhật chính sách' },
        { id: 'contact-us', title: '10. Liên hệ với chúng tôi' },
    ];

    get currentYear(): number {
        return new Date().getFullYear();
    }

    constructor(
        private titleService: Title,
        private location: Location,
        private router: Router,
    ) {
        this.titleService.setTitle(`Chính sách quyền riêng tư (Privacy Policy) | AI.TYPE`);
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
