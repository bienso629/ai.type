import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SwiperDirective } from "app/swiper.directive";
import { SharedModule } from 'app/shared.module';
import { AIToolsComponent } from 'app/modules/admin/account/tools/tools.component';

const Routes: Route[] = [
    {
        path: '',
        component: AIToolsComponent
    }
];

@NgModule({
    declarations: [
        AIToolsComponent
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatGridListModule,
        MatIconModule,
        MatButtonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        SwiperDirective,
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AIToolsModule {
}
