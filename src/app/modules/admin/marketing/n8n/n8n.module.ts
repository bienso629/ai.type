import { TranslocoModule } from '@ngneat/transloco';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';

import { FuseAlertModule } from '@fuse/components/alert';
import { SharedModule } from 'app/shared.module';
import { AMXHComponent } from 'app/modules/admin/marketing/n8n/n8n.component';
import { AMXHProfileAppComponent } from 'app/modules/admin/marketing/n8n/profile/profile.component';
import { AMXHScriptAppComponent } from 'app/modules/admin/marketing/n8n/script/script.component';
import { AMXHShopeeComponent } from 'app/modules/admin/marketing/n8n/shopee/shopee.component';
import { AMXHTypeComponent } from 'app/modules/admin/marketing/n8n/type/type.component';
import { AMXHShareAppComponent } from 'app/modules/admin/marketing/n8n/share/share.component';
import { settingsRoutes } from 'app/modules/admin/marketing/n8n/n8n.routing';

import { AddAccountDialog } from 'app/modules/admin/marketing/n8n/profile/dialogs/add-dialog';
import { EditAccountDialog } from 'app/modules/admin/marketing/n8n/profile/dialogs/edit-dialog';
import { OperaAiDialog } from 'app/modules/admin/marketing/n8n/profile/dialogs/opera-ai-dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AMXHScheduleComponent } from 'app/modules/admin/marketing/n8n/schedule/schedule.component';

@NgModule({
    declarations: [
        AMXHComponent,
        AMXHProfileAppComponent,
        AMXHScriptAppComponent,
        AMXHShopeeComponent,
        AMXHTypeComponent,
        AMXHShareAppComponent,
        AMXHScheduleComponent,
        AddAccountDialog,
        EditAccountDialog,
        OperaAiDialog
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        MatMenuModule,
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
        MatCheckboxModule,
        FormsModule,
        NgSelectModule,
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
