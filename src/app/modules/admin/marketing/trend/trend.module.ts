import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';

import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatExpansionModule } from '@angular/material/expansion';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SharedModule } from 'app/shared.module';
import { AIFacePostComponent } from 'app/modules/admin/marketing/trend/trend.component';

const Routes: Route[] = [
    {
        path: '',
        component: AIFacePostComponent
    }
];

@NgModule({
    declarations: [
        AIFacePostComponent
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonToggleModule,
        MatMenuModule,
        MatSelectModule,
        MatSidenavModule,
        MatSortModule,
        MatTableModule,
        MatGridListModule,
        MatTabsModule,
        MatButtonModule,
        MatTooltipModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatAutocompleteModule,
        MatSlideToggleModule,
        MatExpansionModule,
        SharedModule
    ]
})
export class AIFacePostModule {
}
