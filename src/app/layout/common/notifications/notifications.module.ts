import { TranslocoModule } from '@jsverse/transloco';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';
import { PortalModule } from '@angular/cdk/portal';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificationsComponent } from 'app/layout/common/notifications/notifications.component';
import { SharedModule } from 'app/shared.module';

@NgModule({
    declarations: [
        NotificationsComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule,
        OverlayModule,
        PortalModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        SharedModule
    ],
    exports: [
        NotificationsComponent
    ]
})
export class NotificationsModule {
}
