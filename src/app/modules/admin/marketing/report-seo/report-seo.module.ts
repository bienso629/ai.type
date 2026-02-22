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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TimeagoModule } from 'ngx-timeago';
import { NgApexchartsModule } from 'ng-apexcharts';
import { SharedModule } from 'app/shared.module';
import { GSCReportComponent } from 'app/modules/admin/marketing/report-seo/report-seo.component';
import { MatSelectModule } from '@angular/material/select';

const Routes: Route[] = [
    {
        path: '',
        component: GSCReportComponent
    }
];

@NgModule({
    declarations: [
        GSCReportComponent,
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
        MatSelectModule,
        MatButtonToggleModule,
        NgApexchartsModule,
        TimeagoModule.forRoot(),
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class GSCReportModule {
}
