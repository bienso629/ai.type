import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSidenavModule } from '@angular/material/sidenav';
import { SharedModule } from 'app/shared.module';
import { SitemapComponent } from 'app/modules/admin/content/sitemap/sitemap.component';

const Routes: Route[] = [
    {
        path: '',
        component: SitemapComponent
    }
];

@NgModule({
    declarations: [
        SitemapComponent
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatStepperModule,
        MatSidenavModule,
        SharedModule,
    ]
})
export class SitemapModule {
}
