import { APP_INITIALIZER, importProvidersFrom, NgModule } from '@angular/core';
import { BrowserModule, DomSanitizer } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ExtraOptions, PreloadAllModules, RouterModule } from '@angular/router';
import { FuseModule } from '@fuse';
import { FuseConfigModule } from '@fuse/services/config';
import { FuseMockApiModule } from '@fuse/lib/mock-api';
import { CoreModule } from 'app/core/core.module';
import { appConfig } from 'app/core/config/app.config';
import { mockApiServices } from 'app/api';
import { LayoutModule } from 'app/layout/layout.module';
import { TranslocoCoreModule } from "app/core/transloco.module";
import { ToastrModule } from 'ngx-toastr';
import { AppComponent } from 'app/app.component';
import { appRoutes } from 'app/app.routing';

// import function to register Swiper custom elements
import { register } from 'swiper/element/bundle';
import { MatIconRegistry } from '@angular/material/icon';
import { MultiAccountService } from './modules/_services/multi-account.service';

// register Swiper custom elements
register();

const routerConfig: ExtraOptions = {
    useHash: true,
    preloadingStrategy: PreloadAllModules,
    scrollPositionRestoration: 'enabled'
};

@NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        RouterModule.forRoot(appRoutes, routerConfig),

        // Fuse, FuseConfig & FuseMockAPI
        FuseModule,
        FuseConfigModule.forRoot(appConfig),
        FuseMockApiModule.forRoot(mockApiServices),

        // Core module of your application
        CoreModule,

        // Layout module of your application
        LayoutModule,

        // ToastrModule added
        ToastrModule.forRoot({
            timeOut: 2000,
            positionClass: 'toast-top-center',
            preventDuplicates: true,
            countDuplicates: true,
            progressBar: true
        }),
    ],
    bootstrap: [
        AppComponent
    ],
    providers: [
        {
            provide: APP_INITIALIZER,
            useFactory: initializeApp,
            deps: [MultiAccountService],
            multi: true
        },
        importProvidersFrom(TranslocoCoreModule)
    ]
})

export class AppModule {
    constructor(iconRegistry: MatIconRegistry, sanitizer: DomSanitizer) {
        iconRegistry.addSvgIcon(
            'zalo',
            sanitizer.bypassSecurityTrustResourceUrl('assets/icons/zalo.svg')
        );
        // Có thể dùng namespace nếu muốn:
        // iconRegistry.addSvgIconInNamespace('brand', 'zalo',
        //   sanitizer.bypassSecurityTrustResourceUrl('assets/icons/zalo.svg'));
    }
}

export function initializeApp(multiAccountService: MultiAccountService): () => Promise<any> {
    return () =>
        multiAccountService.isReady.then(() => {
            const settings = multiAccountService.getItem('settings');
            if (settings) {
                // Ghi đè cấu hình settings vào appConfig trước khi các service khác sử dụng
                Object.assign(appConfig.settings, settings);
            }
        });
}

