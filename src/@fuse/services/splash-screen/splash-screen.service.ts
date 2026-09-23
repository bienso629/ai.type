import { Inject, Injectable, DOCUMENT } from '@angular/core';

import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';

@Injectable()
export class FuseSplashScreenService
{
    /**
     * Constructor
     */
    constructor(
        @Inject(DOCUMENT) private _document: any,
        private _router: Router
    )
    {
        // Hide it on the first NavigationEnd, NavigationCancel or NavigationError event
        this._router.events
            .pipe(
                filter(event => event instanceof NavigationEnd || (event as any).constructor?.name === 'NavigationCancel' || (event as any).constructor?.name === 'NavigationError'),
                take(1)
            )
            .subscribe(() => {
                this.hide();
            });

        // Safety fallback: Tự động ẩn splash screen sau 2.5 giây tránh trường hợp router bị kẹt
        setTimeout(() => {
            this.hide();
        }, 2500);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Show the splash screen
     */
    show(): void
    {
        this._document.body.classList.remove('fuse-splash-screen-hidden');
    }

    /**
     * Hide the splash screen
     */
    hide(): void
    {
        this._document.body.classList.add('fuse-splash-screen-hidden');
    }
}
