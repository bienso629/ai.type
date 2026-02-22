import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HelpComponent } from 'app/modules/microsites/help/help.component';

const Routes: Route[] = [
    {
        path: '',
        component: HelpComponent
    }
];

@NgModule({
    declarations: [
        HelpComponent,
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
    ]
})
export class HelpModule {
}
