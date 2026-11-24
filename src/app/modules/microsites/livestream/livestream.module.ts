import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { LivestreamComponent } from 'app/modules/microsites/livestream/livestream.component';

const Routes: Route[] = [
    {
        path: ':uuid',
        component: LivestreamComponent
    }
];

@NgModule({
    declarations: [
        LivestreamComponent,
    ],
    imports: [
        CommonModule,
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatMenuModule,
        MatButtonModule,
        MatIconModule,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class LivestreamModule {
}
