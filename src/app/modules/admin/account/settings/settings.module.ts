import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { NgModule } from '@angular/core';
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
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TimelineModule } from "angular-calendar-timeline";

import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MomentDateModule } from '@angular/material-moment-adapter';

import { NgxCurrencyDirective } from "ngx-currency";
import { FuseCardModule } from '@fuse/components/card';

import { FuseAlertModule } from '@fuse/components/alert';
import { SharedModule } from 'app/shared.module';
import { SettingsComponent } from 'app/modules/admin/account/settings/settings.component';
import { SettingsAccountComponent } from 'app/modules/admin/account/settings/account/account.component';
import { SettingsStyleComponent } from 'app/modules/admin/account/settings/style/style.component';
// import { SettingsSecurityComponent } from 'app/modules/admin/me/settings/security/security.component';
import { SettingsAdminComponent } from 'app/modules/admin/account/settings/admin/admin.component';
import { SettingsMoneyComponent } from 'app/modules/admin/account/settings/money/money.component';
import { SettingsActiveComponent } from 'app/modules/admin/account/settings/active/active.component';
import { SettingsLicenseKeysComponent } from 'app/modules/admin/account/settings/admin/license-keys/license-keys.component';
import { SettingsCreateLicenseKeyComponent } from 'app/modules/admin/account/settings/admin/license-keys/create/create.component';
import { SettingsDomainComponent } from 'app/modules/admin/account/settings/domain/domain.component';
import { SettingsTeamComponent } from 'app/modules/admin/account/settings/team/team.component';
import { AddStyleDialog } from 'app/modules/admin/account/settings/style/dialogs/add-dialog';
import { EmailDialogComponent } from 'app/modules/admin/account/settings/admin/dialogs/email-dialog/email-dialog.component';
import { settingsRoutes } from 'app/modules/admin/account/settings/settings.routing';
import { QRCodeModule } from 'angularx-qrcode';
import { MomoQrDialog } from 'app/modules/admin/account/settings/active/active.component';

import { SettingsPluginsComponent } from 'app/modules/admin/account/settings/plugins/plugins.component';

@NgModule({
    declarations: [
        SettingsComponent,
        SettingsAccountComponent,
        SettingsStyleComponent,
        // SettingsSecurityComponent,
        SettingsMoneyComponent,
        SettingsActiveComponent,
        SettingsLicenseKeysComponent,
        SettingsCreateLicenseKeyComponent,
        SettingsAdminComponent,
        SettingsPluginsComponent,
        SettingsDomainComponent,
        AddStyleDialog,
        EmailDialogComponent,
        SettingsTeamComponent,
        MomoQrDialog
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
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
        DragDropModule,

        MatCheckboxModule,
        MomentDateModule,
        MatDatepickerModule,
        MatNativeDateModule,

        NgxCurrencyDirective,
        FuseAlertModule,
        FuseCardModule,
        TimelineModule.forChild(),
        SharedModule,
        QRCodeModule
    ],
    exports: [
        SettingsLicenseKeysComponent,
        SettingsCreateLicenseKeyComponent
    ]
})
export class SettingsModule {
}
