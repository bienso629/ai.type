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

@NgModule({
    declarations: [
        CheckExpirationDate, IsObjectPipe, IsIframe, IsMp3, isFirefoxPipe, RemoveHTMLPipe, SEOScorePipe, SlugifyPipe, renderTrustHTML, YoutubePlay, HTML2Paragraph, ShortDomainPipe, StopPropagationDirective, DatatableScrollLockDirective
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
        TranslocoModule
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
        TranslocoModule
    ],
})
export class SharedModule {
}
