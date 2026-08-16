import { Component, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { AMXHScriptAppComponent } from '../script/script.component';

@Component({
    selector: 'amxh-shopee',
    templateUrl: '../script/script.component.html',
    styleUrls: ['../script/script.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AMXHShopeeComponent extends AMXHScriptAppComponent {
    platform: string = 'shopee';
}
