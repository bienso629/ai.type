import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { TimeagoModule } from 'ngx-timeago';
import { SharedModule } from 'app/shared.module';
import { SynonymComponent } from 'app/modules/admin/content/synonym/synonym.component';
import { SynonymFormComponent } from 'app/modules/admin/content/synonym/form/search.component';

const Routes: Route[] = [
    {
        path: '',
        component: SynonymComponent
    }
];

@NgModule({
    declarations: [
        SynonymComponent,
        SynonymFormComponent
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
        MatExpansionModule,
        MatListModule,
        MatSidenavModule,
        TimeagoModule.forRoot(),
        SharedModule
    ]
})
export class SynonymModule {
}
