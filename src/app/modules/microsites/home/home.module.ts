import { TranslocoModule } from '@ngneat/transloco';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseCardModule } from '@fuse/components/card';
import { SwiperDirective } from "app/swiper.directive";
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTabsModule } from '@angular/material/tabs';
import { TagCloudComponent } from 'angular-tag-cloud-module';
import { SharedModule } from 'app/shared.module';
import { LandingAppComponent } from 'app/modules/microsites/home/home.component';

const Routes: Route[] = [
    {
        path: '',
        component: LandingAppComponent
    }
];

@NgModule({
    declarations: [
        LandingAppComponent,
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
        MatGridListModule,
        FuseCardModule,
        SwiperDirective,
        MatSelectModule,
        MatSidenavModule,
        MatDialogModule,
        MatListModule,
        MatTooltipModule,
        MatTabsModule,
        TagCloudComponent,
        DragDropModule,
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class LandingAppModule {
}
