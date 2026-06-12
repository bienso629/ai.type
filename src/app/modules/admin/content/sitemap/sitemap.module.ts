import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
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
        MatSelectModule,
        MatInputModule,
        SharedModule,
    ]
})
export class SitemapModule {
}
