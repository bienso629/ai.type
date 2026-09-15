import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
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
import { GSCReportComponent } from 'app/modules/admin/marketing/seo-report/seo-report.component';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTabsModule } from '@angular/material/tabs';

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
        TranslocoModule,
        MatTooltipModule,
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
        MatAutocompleteModule,
        MatTabsModule,
        MatButtonToggleModule,
        NgApexchartsModule,
        TimeagoModule.forRoot(),
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class GSCReportModule {
}
