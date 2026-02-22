import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatListModule } from '@angular/material/list';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatMenuModule } from '@angular/material/menu';
import { FuseCardModule } from '@fuse/components/card';
import { FuseAlertModule } from '@fuse/components/alert';
import { FuseFullscreenModule } from '@fuse/components/fullscreen';
import { SharedModule } from 'app/shared.module';
import { QuillModule } from 'ngx-quill';
import { TimeagoModule } from 'ngx-timeago';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { ReadComponent } from 'app/modules/microsites/read/read.component';

const Routes: Route[] = [
    {
        path: ':hash',
        component: ReadComponent
    }
];

@NgModule({
    declarations: [
        ReadComponent,
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatRadioModule,
        MatSelectModule,
        MatStepperModule,
        MatSidenavModule,
        MatTabsModule,
        MatTooltipModule,
        MatDialogModule,
        MatChipsModule,
        MatListModule,
        MatGridListModule,
        MatBottomSheetModule,
        MatMenuModule,
        FuseFullscreenModule,
        ClipboardModule,
        TimeagoModule.forRoot(),
        FuseCardModule,
        FuseAlertModule,
        QuillModule.forRoot(),
        SharedModule
    ]
})
export class ReadModule {
}
