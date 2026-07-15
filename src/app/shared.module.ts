import { MatTooltipModule } from '@angular/material/tooltip';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { StopPropagationDirective } from 'app/app.directive';
import { DatatableScrollLockDirective } from 'app/datatable-scroll-lock.directive';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CheckExpirationDate, IsObjectPipe, IsIframe, IsMp3, isFirefoxPipe, RemoveHTMLPipe, SEOScorePipe, SlugifyPipe, renderTrustHTML, YoutubePlay, HTML2Paragraph, ShortDomainPipe } from "app/app.pipe";
import { MarkdownPipe } from "app/markdown.pipe";
import { TranslocoModule } from '@ngneat/transloco';

import { VideoEditorSettingsDialogComponent } from './shared/components/video-editor-settings-dialog/video-editor-settings-dialog.component';

import { MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';

@NgModule({
    declarations: [
        CheckExpirationDate, IsObjectPipe, IsIframe, IsMp3, isFirefoxPipe, RemoveHTMLPipe, SEOScorePipe, SlugifyPipe, renderTrustHTML, YoutubePlay, HTML2Paragraph, ShortDomainPipe, StopPropagationDirective, DatatableScrollLockDirective,
        VideoEditorSettingsDialogComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        CommonModule,
        FormsModule,
        NgxDatatableModule,
        MatProgressSpinnerModule,
        ReactiveFormsModule,
        MarkdownPipe,
        TranslocoModule,
        MatDialogModule,
        MatSelectModule,
        MatFormFieldModule,
        MatIconModule,
        MatButtonModule,
        MatInputModule
    ],
    exports: [
        CommonModule,
        FormsModule,
        NgxDatatableModule,
        MatProgressSpinnerModule,
        ReactiveFormsModule,
        CheckExpirationDate, IsObjectPipe, IsIframe, IsMp3, isFirefoxPipe, RemoveHTMLPipe, SEOScorePipe, SlugifyPipe, renderTrustHTML, YoutubePlay, HTML2Paragraph, ShortDomainPipe,
        MarkdownPipe,
        StopPropagationDirective,
        DatatableScrollLockDirective,
        TranslocoModule,
        VideoEditorSettingsDialogComponent,
        MatDialogModule,
        MatSelectModule,
        MatFormFieldModule,
        MatIconModule,
        MatButtonModule,
        MatInputModule
    ],
})
export class SharedModule {
}
