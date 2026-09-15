import { TranslocoModule } from '@jsverse/transloco';
import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';

import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SharedModule } from 'app/shared.module';
import { AIWordComponent } from 'app/modules/admin/content/ai-crawl/ai-crawl.component';

const Routes: Route[] = [
    {
        path: '',
        component: AIWordComponent
    }
];

@NgModule({
    declarations: [
        AIWordComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatButtonToggleModule,
        MatMenuModule,
        MatSelectModule,
        MatSidenavModule,
        MatSortModule,
        MatTableModule,
        MatTabsModule,
        MatButtonModule,
        MatButtonModule,
        MatCheckboxModule,
        MatTooltipModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatExpansionModule,
        SharedModule
    ]
})
export class AIWordModule {
}
