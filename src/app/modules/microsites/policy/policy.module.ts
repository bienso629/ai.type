import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PolicyComponent } from 'app/modules/microsites/policy/policy.component';

const Routes: Route[] = [
    {
        path: '',
        component: PolicyComponent
    }
];

@NgModule({
    declarations: [
        PolicyComponent,
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
    ]
})
export class PolicyModule {
}
