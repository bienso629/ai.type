import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LivestreamComponent } from 'app/modules/microsites/livestream/livestream.component';

const Routes: Route[] = [
    {
        path: '',
        component: LivestreamComponent
    }
];

@NgModule({
    declarations: [
        LivestreamComponent,
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class LivestreamModule {
}
