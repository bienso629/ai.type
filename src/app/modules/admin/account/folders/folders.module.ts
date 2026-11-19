import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Route, RouterModule } from '@angular/router';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import { SharedModule } from 'app/shared.module';
import { VideoTimelineDialogComponent } from 'app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component';
import { WorkspaceFoldersComponent } from './folders.component';

const routes: Route[] = [
    {
        path: '',
        component: WorkspaceFoldersComponent
    }
];

@NgModule({
    declarations: [
        WorkspaceFoldersComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        TextFieldModule,
        RouterModule.forChild(routes),
        MatButtonModule,
        MatCheckboxModule,
        MatIconModule,
        MatTooltipModule,
        MatFormFieldModule,
        MatInputModule,
        MatDialogModule,
        VideoTimelineDialogComponent,
        TranslocoModule,
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class WorkspaceFoldersModule {}
