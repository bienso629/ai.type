import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { FuseCardModule } from '@fuse/components/card';
import { NgxCurrencyDirective } from "ngx-currency";
import { QRCodeModule } from 'angularx-qrcode';
import { SharedModule } from 'app/shared.module';

import { PaymentComponent } from 'app/modules/microsites/payment/payment.component';

const Routes: Route[] = [
    {
        path: '',
        component: PaymentComponent
    }
];

@NgModule({
    declarations: [
        PaymentComponent,
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatFormFieldModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        FuseCardModule,
        NgxCurrencyDirective,
        QRCodeModule,
        SharedModule
    ]
})
export class PaymentModule {
}
