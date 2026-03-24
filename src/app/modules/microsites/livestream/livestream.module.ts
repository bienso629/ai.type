import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common'; // 1. IMPORT DÒNG NÀY
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LivestreamComponent } from 'app/modules/microsites/livestream/livestream.component';

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
        CommonModule, // 2. THÊM VÀO MẢNG IMPORTS Ở ĐÂY
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class LivestreamModule {
}