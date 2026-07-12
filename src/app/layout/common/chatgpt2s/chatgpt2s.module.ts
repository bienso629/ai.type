import { TranslocoModule } from '@ngneat/transloco';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';
import { PortalModule } from '@angular/cdk/portal';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TimeagoModule } from 'ngx-timeago';
import { ChatGPTLayoutComponent } from 'app/layout/common/chatgpt2s/chatgpt2s.component';
import { SharedModule } from 'app/shared.module';
import { MarkdownPipe } from 'app/markdown.pipe';

@NgModule({
    declarations: [
        ChatGPTLayoutComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule,
        OverlayModule,
        PortalModule,
        MatButtonModule,
        MatIconModule,
        TimeagoModule,
        MatTooltipModule,
        SharedModule,
        MarkdownPipe
    ],
    exports: [
        ChatGPTLayoutComponent
    ]
})
export class ChatGPTLayoutModule {
}
