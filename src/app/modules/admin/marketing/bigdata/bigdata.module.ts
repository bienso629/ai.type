import { TranslocoModule } from '@ngneat/transloco';
import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatListModule } from '@angular/material/list';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { NgSelectModule } from '@ng-select/ng-select';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { NgApexchartsModule } from "ng-apexcharts";
import { TimeagoModule } from 'ngx-timeago';
import { MatGridListModule } from '@angular/material/grid-list';
import { SharedModule } from 'app/shared.module';
import { BigDataComponent } from 'app/modules/admin/marketing/bigdata/bigdata.component';
import { ReportDialog } from 'app/modules/admin/marketing/bigdata/dialogs/report';
import { BigDataLogsDialog } from 'app/modules/admin/marketing/bigdata/dialogs/logs';

const Routes: Route[] = [
    {
        path: '',
        component: BigDataComponent
    }
];

@NgModule({
    declarations: [
        BigDataComponent,
        ReportDialog,
        BigDataLogsDialog
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
        MatButtonToggleModule,
        MatTooltipModule,
        MatMenuModule,
        MatFormFieldModule, MatSelectModule, FormsModule, ReactiveFormsModule,
        MatListModule,
        MatDialogModule,
        MatSortModule,
        MatTableModule,
        MatTooltipModule,
        MatSidenavModule,
        MatGridListModule,
        NgSelectModule,
        ClipboardModule,
        NgApexchartsModule,
        TimeagoModule.forRoot(),
        SharedModule
    ]
})
export class BigDataModule {
}
