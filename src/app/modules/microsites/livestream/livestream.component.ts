import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

@Component({
    selector: 'livestream',
    templateUrl: './livestream.component.html',
    styleUrls: ['./livestream.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class LivestreamComponent implements OnInit, OnDestroy, AfterViewInit {
    routerUrl: string = '';
    code: string = '';

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
    ) {
        this.titleService.setTitle(`hướng dẫn sử dụng | ai.type - công cụ tạo content`);
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
