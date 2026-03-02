import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatListModule } from '@angular/material/list';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { NgSelectModule } from '@ng-select/ng-select';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { TimeagoModule } from 'ngx-timeago';
import { SharedModule } from 'app/shared.module';
import { ZmsComponent } from 'app/modules/admin/marketing/zms/zms.component';
import { EditDialog } from 'app/modules/admin/marketing/zms/dialogs/edit-dialog';
import { SMSDialog } from 'app/modules/admin/marketing/zms/dialogs/sms-dialog';

const Routes: Route[] = [
    {
        path: '',
        component: ZmsComponent
    }
];

@NgModule({
    declarations: [
        ZmsComponent,
        EditDialog,
        SMSDialog
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
        MatListModule,
        MatDialogModule,
        MatSortModule,
        MatTableModule,
        MatTooltipModule,
        MatSidenavModule,
        NgSelectModule,
        ClipboardModule,
        TimeagoModule.forRoot(),
        SharedModule
    ]
})
export class ZmsModule {
}
