import { ChangeDetectionStrategy, Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface PolicySection {
    id: string;
    title: string;
}

@Component({
    selector: 'policy-layout',
    standalone: true,
    imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTooltipModule],
    templateUrl: './policy-layout.component.html',
    styleUrls: ['./policy-layout.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class PolicyLayoutComponent implements OnInit {
    @Input() badgeIcon: string = 'feather:shield';
    @Input() badgeText: string = 'Cam kết bảo vệ & Chính sách';
    @Input() title: string = '';
    @Input() description: string = '';
    @Input() lastUpdated: string = '21 tháng 08, 2026';
    @Input() version: string = '1.2.3';
    @Input() scope: string = 'Desktop App (Win/Mac/Linux) & Web Platform';
    @Input() sidebarBadgeIcon: string = 'feather:lock';
    @Input() sidebarBadgeText: string = '';
    @Input() sections: PolicySection[] = [];

    activeSection: string = '';

    get currentYear(): number {
        return new Date().getFullYear();
    }

    constructor(
        private location: Location,
        private router: Router
    ) {}

    ngOnInit(): void {
        if (this.sections && this.sections.length > 0) {
            this.activeSection = this.sections[0].id;
        }
    }

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

    goHome(): void {
        this.router.navigate(['/']);
    }

    print(): void {
        window.print();
    }
}
