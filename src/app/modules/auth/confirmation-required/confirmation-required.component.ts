import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { fuseAnimations } from '@fuse/animations';

@Component({
    selector: 'auth-confirmation-required',
    templateUrl: './confirmation-required.component.html',
    encapsulation: ViewEncapsulation.None,
    animations: fuseAnimations
})
export class AuthConfirmationRequiredComponent implements OnInit, OnDestroy {
    /**
     * Constructor
     */
    constructor() {
    }

    ngOnInit(): void {
        // throw new Error('Method not implemented.');
    }
    
    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
    }
}
