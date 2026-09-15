import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FuseCardModule } from '@fuse/components/card';
import { FuseAlertModule } from '@fuse/components/alert';
import { SharedModule } from 'app/shared.module';
import { AuthSignInComponent } from 'app/modules/auth/sign-in/sign-in.component';
import { TelegramSupportDialogComponent } from 'app/modules/auth/sign-in/dialogs/telegram-support-dialog.component';
import { authSignInRoutes } from 'app/modules/auth/sign-in/sign-in.routing';

@NgModule({
    declarations: [
        AuthSignInComponent,
        TelegramSupportDialogComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(authSignInRoutes),
        MatButtonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatSelectModule,
        FuseCardModule,
        FuseAlertModule,
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AuthSignInModule {
}
