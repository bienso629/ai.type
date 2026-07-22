import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { APP_INITIALIZER, importProvidersFrom, NgModule, CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { BrowserModule, DomSanitizer, Title } from '@angular/platform-browser';
import { AppTitleService } from 'app/core/services/app-title.service';
import { DragDropModule } from '@angular/cdk/drag-drop';
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
import { ToastrModule, ToastNoAnimation, ToastNoAnimationModule } from 'ngx-toastr';
import { AppComponent } from 'app/app.component';
import { appRoutes } from 'app/app.routing';

// import function to register Swiper custom elements
import { register } from 'swiper/element/bundle';
import { MatIconRegistry } from '@angular/material/icon';
import { MultiAccountService } from './modules/_services/multi-account.service';
import { UserClientService } from 'app/modules/_services/user';
import { CrawlService } from 'app/modules/_services/crawl';
import { DomainService } from 'app/modules/_services/domain';
import { TasksService } from 'app/modules/_services/tasks';

// register Swiper custom elements
register();

const routerConfig: ExtraOptions = {
    useHash: true,
    preloadingStrategy: PreloadAllModules,
    scrollPositionRestoration: 'enabled'
};

import { RouteReuseStrategy } from '@angular/router';
import { CustomRouteReuseStrategy } from './core/custom-route-reuse-strategy';

@NgModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
    declarations: [
        AppComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        BrowserModule,
        BrowserAnimationsModule,
        DragDropModule,
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
        ToastNoAnimationModule,
        ToastrModule.forRoot({
            timeOut: 2000,
            positionClass: 'toast-top-center',
            preventDuplicates: true,
            maxOpened: 1,
            autoDismiss: true,
            countDuplicates: true,
            progressBar: false,
            toastComponent: ToastNoAnimation,
        }),
    ],
    bootstrap: [
        AppComponent
    ],
    providers: [
        { provide: RouteReuseStrategy, useClass: CustomRouteReuseStrategy },
        { provide: Title, useClass: AppTitleService },
        {
            provide: APP_INITIALIZER,
            useFactory: initializeApp,
            deps: [MultiAccountService],
            multi: true
        },
        importProvidersFrom(TranslocoCoreModule),
        UserClientService,
        CrawlService,
        DomainService,
        TasksService
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

