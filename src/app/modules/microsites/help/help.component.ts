import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title, DomSanitizer } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { GUIDES } from './guides.data';

@Component({
    selector: 'help',
    templateUrl: './help.component.html',
    styleUrls: ['./help.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class HelpComponent implements OnInit, OnDestroy, AfterViewInit {
    routerUrl: string = '';
    code: string = '';
    guides: any[] = [];

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Getter for current year
     */
    get currentYear(): number {
        return new Date().getFullYear();
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private router: Router,
        public dialog: MatDialog,
        private sanitizer: DomSanitizer
    ) {
        this.titleService.setTitle(`hướng dẫn sử dụng | ai.type - công cụ tạo content`);
        this.guides = GUIDES.map(g => ({
            title: g.title,
            html: this.sanitizer.bypassSecurityTrustHtml(g.html)
        }));
    }

    ngAfterViewInit(): void {
        this.routerUrl = this.router.url;
    }

    ngOnInit() {
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
