import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { NgModule } from '@angular/core';
import {
    HTTP_INTERCEPTORS,
    provideHttpClient,
    withInterceptorsFromDi,
    withXhr,
} from '@angular/common/http';
import { AuthService } from 'app/core/auth/auth.service';
import { AuthInterceptor } from 'app/core/auth/auth.interceptor';
import { GlobalAgentInterceptor } from 'app/_services/global-agent.interceptor';

@NgModule({
    imports: [TranslocoModule, MatTooltipModule],
    providers: [
        AuthService,
        {
            provide: HTTP_INTERCEPTORS,
            useClass: AuthInterceptor,
            multi: true,
        },
        {
            provide: HTTP_INTERCEPTORS,
            useClass: GlobalAgentInterceptor,
            multi: true,
        },
        provideHttpClient(withXhr(), withInterceptorsFromDi()),
    ],
})
export class AuthModule {}
