import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatStepperModule } from '@angular/material/stepper';
import { TimeagoModule } from 'ngx-timeago';
import { SharedModule } from 'app/shared.module';
import { WoocommerceExportComponent } from 'app/modules/admin/marketing/clone-product/export.component';
import { LinkFormComponent } from 'app/modules/admin/marketing/clone-product/form/link.component';

const Routes: Route[] = [
    {
        path: '',
        component: WoocommerceExportComponent
    }
];

@NgModule({
    declarations: [
        WoocommerceExportComponent,
        LinkFormComponent
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
        MatButtonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatStepperModule,
        MatGridListModule,
        MatExpansionModule,
        MatListModule,
        MatSidenavModule,
        TimeagoModule.forRoot(),
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class WoocommerceExportModule {
}
