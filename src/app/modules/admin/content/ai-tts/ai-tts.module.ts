import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
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
import { Voice2videoComponent } from 'app/modules/admin/content/ai-tts/ai-tts.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VideoTimelineDialogComponent } from 'app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component';

const Routes: Route[] = [
    {
        path: ':name/:uuid',
        component: Voice2videoComponent
    }
];

@NgModule({
    declarations: [
        Voice2videoComponent,
        VideoTimelineDialogComponent
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
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Voice2videoModule {
}
