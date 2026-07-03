import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { AuthService } from 'app/core/auth/auth.service';
import { AuthInterceptor } from 'app/core/auth/auth.interceptor';

@NgModule({
    imports: [
        TranslocoModule,
        MatTooltipModule,
        HttpClientModule
    ],
    providers: [
        AuthService,
        {
            provide: HTTP_INTERCEPTORS,
            useClass: AuthInterceptor,
            multi: true
        }
    ]
})
export class AuthModule {
}
