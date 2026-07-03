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
import { TextFieldModule } from '@angular/cdk/text-field';
import { Voice2videoComponent } from 'app/modules/admin/content/ai-tts/ai-tts.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VideoTimelineDialogComponent } from 'app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component';
import { AddSceneComponent } from 'app/modules/admin/content/ai-tts/tools/add-scene.component';
import { AudioGenerationComponent } from 'app/modules/admin/content/ai-tts/tools/audio-generation.component';
import { NodeEditorComponent } from 'app/modules/admin/content/ai-tts/tools/node-editor/node-editor.component';
import { MagicPromptDialogComponent } from 'app/modules/admin/content/ai-tts/tools/node-editor/magic-prompt-dialog.component';
import { SharedModule } from 'app/shared.module';
import { TranslocoModule } from '@ngneat/transloco';

const Routes: Route[] = [
    {
        path: ':name/:uuid/timeline',
        component: VideoTimelineDialogComponent
    },
    {
        path: ':name/:uuid/node',
        component: NodeEditorComponent
    },
    {
        path: ':name/:uuid',
        component: Voice2videoComponent
    }
];

@NgModule({
    declarations: [
        Voice2videoComponent,
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        TranslocoModule,
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
        TextFieldModule,
        VideoTimelineDialogComponent,
        AddSceneComponent,
        AudioGenerationComponent,
        MagicPromptDialogComponent,
        NodeEditorComponent,
        SharedModule,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Voice2videoModule {
}
