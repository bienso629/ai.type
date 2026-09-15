import {
    Component,
    OnDestroy,
    OnInit,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { fuseAnimations } from '@fuse/animations';

@Component({
    selector: 'auth-confirmation-required',
    templateUrl: './confirmation-required.component.html',
    encapsulation: ViewEncapsulation.None,
    animations: fuseAnimations,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class AuthConfirmationRequiredComponent implements OnInit, OnDestroy {
    /**
     * Constructor
     */
    constructor() {}

    ngOnInit(): void {
        // throw new Error('Method not implemented.');
    }

    ngOnDestroy(): void {
        // throw new Error('Method not implemented.');
    }
}
