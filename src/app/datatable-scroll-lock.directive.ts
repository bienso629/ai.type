import { Directive, ElementRef, HostListener, Input, DoCheck } from '@angular/core';

@Directive({
    selector: 'ngx-datatable[appScrollLock]'
})
export class DatatableScrollLockDirective implements DoCheck {
    private scrollerElement: HTMLElement;
    private _isLoading = false;

    @Input('appScrollLock') appScrollLock: boolean = false;

    constructor(private el: ElementRef) {}

    ngDoCheck() {
        if (this._isLoading !== this.appScrollLock) {
            this._isLoading = this.appScrollLock;
            this.toggleScrollLock(this.appScrollLock);
        }
    }

    private toggleScrollLock(lock: boolean) {
        if (!this.scrollerElement) {
            this.scrollerElement = this.el.nativeElement.querySelector('datatable-body');
        }

        if (this.scrollerElement) {
            if (lock) {
                this.scrollerElement.style.setProperty('overflow', 'hidden', 'important');
                this.scrollerElement.style.setProperty('overflow-y', 'hidden', 'important');
            } else {
                this.scrollerElement.style.removeProperty('overflow');
                this.scrollerElement.style.removeProperty('overflow-y');
            }
        }
    }

    @HostListener('wheel', ['$event'])
    @HostListener('touchmove', ['$event'])
    onScroll(event: Event) {
        if (this._isLoading) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}
