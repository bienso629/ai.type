import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSidenavModule } from '@angular/material/sidenav';
// --- 1. IMPORT DÒNG NÀY ---
import { MatSelectModule } from '@angular/material/select';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { SharedModule } from 'app/shared.module';
import { Voice2videoComponent } from 'app/modules/admin/content/voice2video/voice2video.component';
import { MatTooltipModule } from '@angular/material/tooltip';

const Routes: Route[] = [
    {
        path: ':name/:uuid',
        component: Voice2videoComponent
    }
];

@NgModule({
    declarations: [
        Voice2videoComponent
    ],
    imports: [
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatStepperModule,
        MatSidenavModule,
        MatSelectModule,
        MatTooltipModule,
        // --- 2. THÊM VÀO MẢNG IMPORTS ---
        DragDropModule,
        SharedModule,
    ]
})
export class Voice2videoModule {
}
