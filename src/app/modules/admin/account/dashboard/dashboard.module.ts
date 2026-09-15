import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { NgModule } from '@angular/core';
import { NgApexchartsModule } from 'ng-apexcharts';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule } from '@angular/material/dialog';
import { FuseAlertModule } from '@fuse/components/alert';
import { SharedModule } from 'app/shared.module';
import { TimeagoModule } from 'ngx-timeago';
import { DashboardComponent } from 'app/modules/admin/account/dashboard/dashboard.component';
import { VideoProjectsComponent } from 'app/modules/admin/account/dashboard/video-projects/video-projects.component';

const Routes: Route[] = [
    {
        path: '',
        component: DashboardComponent,
        data: { reuse: true }
    },
    {
        path: 'video-projects',
        component: VideoProjectsComponent,
        data: { reuse: true }
    }
];

@NgModule({
    declarations: [
        DashboardComponent,
        VideoProjectsComponent
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
        MatSelectModule,
        MatIconModule,
        MatInputModule,
        MatGridListModule,
        FuseAlertModule,
        SharedModule,
        NgApexchartsModule,
        MatDialogModule,
        TimeagoModule.forRoot()
    ]
})
export class DashboardModule {
}
