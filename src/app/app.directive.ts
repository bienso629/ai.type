import { Directive, ElementRef, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { fromEvent } from 'rxjs';

@Directive({
    selector: '[stopPropagation]',
    standalone: false
})
export class StopPropagationDirective implements AfterViewInit {
	@Output() public stop2click = new EventEmitter();

	constructor(private elementRef: ElementRef) { }

	public ngAfterViewInit() {
		fromEvent<MouseEvent>(this.elementRef.nativeElement, 'click', { capture: true })
			.subscribe((event: any) => {
				const offsetParent = event.target?.offsetParent;
				if (!offsetParent || !offsetParent.classList) {
					return;
				}

				if (offsetParent.classList.contains('btn-reset')) {
					event.stopPropagation();
					this.stop2click.emit({ class: 'btn-reset' });
				} else if (offsetParent.classList.contains('btn-login')) {
					event.stopPropagation();
					this.stop2click.emit({ class: 'btn-login', title: offsetParent.title });
				} else if (offsetParent.classList.contains('btn-guide')) {
					event.stopPropagation();
					this.stop2click.emit({ class: 'btn-guide' });
				} else if (offsetParent.classList.contains('btn-agree')) {
					event.stopPropagation();
					this.stop2click.emit({ class: 'btn-agree', uuid: offsetParent.uuid });
				}
			});
	}
}