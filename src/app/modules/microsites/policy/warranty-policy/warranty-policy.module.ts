import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { TranslocoModule } from '@jsverse/transloco';
import { WarrantyPolicyComponent } from 'app/modules/microsites/policy/warranty-policy/warranty-policy.component';
import { PolicyLayoutComponent } from 'app/modules/microsites/policy/policy-layout/policy-layout.component';

const routes: Route[] = [
    {
        path: '',
        component: WarrantyPolicyComponent
    }
];

@NgModule({
    declarations: [
        WarrantyPolicyComponent,
    ],
    imports: [
        CommonModule,
        TranslocoModule,
        MatTooltipModule,
        MatDividerModule,
        RouterModule.forChild(routes),
        MatButtonModule,
        MatIconModule,
        PolicyLayoutComponent,
    ]
})
export class WarrantyPolicyModule {
}
