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
import { MatDialogModule } from '@angular/material/dialog';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { TimeagoModule } from 'ngx-timeago';
import { SharedModule } from 'app/shared.module';
import { WP2MDComponent, NodeDetailsDialog } from 'app/modules/admin/content/wp2md/wp2md.component';

const Routes: Route[] = [
    {
        path: '',
        component: WP2MDComponent
    }
];

@NgModule({
    declarations: [
        WP2MDComponent,
        NodeDetailsDialog
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
        MatButtonToggleModule,
        MatTooltipModule,
        MatMenuModule,
        MatFormFieldModule, MatSelectModule, FormsModule, ReactiveFormsModule,
        MatDialogModule,
        MatListModule,
        NgSelectModule,
        ClipboardModule,
        TimeagoModule.forRoot(),
        SharedModule
    ]
})
export class WP2MDModule {
}
