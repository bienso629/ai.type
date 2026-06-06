import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FuseAlertModule } from '@fuse/components/alert';
import { SharedModule } from 'app/shared.module';
import { TimeagoModule } from 'ngx-timeago';
import { DashboardComponent } from 'app/modules/admin/account/dashboard/dashboard.component';
import { VideoProjectsComponent } from 'app/modules/admin/account/dashboard/video-projects/video-projects.component';

const Routes: Route[] = [
    {
        path: '',
        component: DashboardComponent
    },
    {
        path: 'video-projects',
        component: VideoProjectsComponent
    }
];

@NgModule({
    declarations: [
        DashboardComponent,
        VideoProjectsComponent
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
        MatGridListModule,
        FuseAlertModule,
        SharedModule,
        TimeagoModule.forRoot()
    ]
})
export class DashboardModule {
}
