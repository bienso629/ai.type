import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common'; // 1. IMPORT DÒNG NÀY
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LivestreamComponent } from 'app/modules/microsites/livestream/livestream.component';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule } from '@ngneat/transloco';
import { MatTooltipModule } from '@angular/material/tooltip';

const Routes: Route[] = [
    {
        path: ':uuid',
        component: LivestreamComponent
    }
];

@NgModule({
    declarations: [
        LivestreamComponent,
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        MatTooltipModule,
        TranslocoModule,
        CommonModule, // 2. THÊM VÀO MẢNG IMPORTS Ở ĐÂY
        RouterModule.forChild(Routes),
        MatMenuModule,
        MatButtonModule,
        MatIconModule,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class LivestreamModule {
}