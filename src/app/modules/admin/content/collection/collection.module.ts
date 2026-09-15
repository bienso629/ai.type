import { TranslocoModule } from '@jsverse/transloco';
import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatListModule } from '@angular/material/list';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NgSelectModule } from '@ng-select/ng-select';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { TimeagoModule } from 'ngx-timeago';
import { SharedModule } from 'app/shared.module';
import { MatSidenavModule } from '@angular/material/sidenav';
import { CollectionComponent } from './collection.component';

const Routes: Route[] = [
    {
        path: '',
        component: CollectionComponent
    }
];

import { NgxDatatableModule } from '@swimlane/ngx-datatable';

@NgModule({
    declarations: [
        CollectionComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonToggleModule,
        MatTooltipModule,
        MatMenuModule,
        MatSidenavModule,
        MatSelectModule, FormsModule, ReactiveFormsModule,
        MatListModule,
        NgSelectModule,
        ClipboardModule,
        TimeagoModule.forRoot(),
        SharedModule,
        NgxDatatableModule
    ]
})
export class CollectionModule { }
