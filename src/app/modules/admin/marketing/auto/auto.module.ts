import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { NgxCurrencyDirective } from "ngx-currency";
import { FuseCardModule } from '@fuse/components/card';
import { TimelineModule } from "angular-calendar-timeline";
import { DraggableDirective } from 'app/draggable.directive';
import { MatCheckboxModule } from '@angular/material/checkbox'; // <--- Import cái này
import { FormsModule } from '@angular/forms'; // <--- Và cái này

import { FuseAlertModule } from '@fuse/components/alert';
import { SharedModule } from 'app/shared.module';
import { AMXHComponent } from 'app/modules/admin/marketing/auto/auto.component';
import { AMXHProfileAppComponent } from 'app/modules/admin/marketing/auto/profile/profile.component';
import { AMXHScriptAppComponent } from 'app/modules/admin/marketing/auto/script/script.component';
import { settingsRoutes } from 'app/modules/admin/marketing/auto/auto.routing';

import { AddAccountDialog } from 'app/modules/admin/marketing/auto/profile/dialogs/add-dialog';
import { EditAccountDialog } from 'app/modules/admin/marketing/auto/profile/dialogs/edit-dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

@NgModule({
    declarations: [
        AMXHComponent,
        AMXHProfileAppComponent,
        AMXHScriptAppComponent,
        AddAccountDialog,
        EditAccountDialog
    ],
    imports: [
        RouterModule.forChild(settingsRoutes),
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatRadioModule,
        MatSelectModule,
        MatSidenavModule,
        MatTabsModule,
        MatSlideToggleModule,
        MatAutocompleteModule,
        MatDialogModule,
        MatGridListModule,
        MatCheckboxModule, // <--- Thêm vào đây
        FormsModule,       // <--- Thêm vào đây
        MatTooltipModule,
        NgxCurrencyDirective,
        FuseAlertModule,
        FuseCardModule,
        DraggableDirective,
        TimelineModule.forChild(),
        SharedModule
    ],
    exports: [AddAccountDialog, EditAccountDialog],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AMXHModule {
}
