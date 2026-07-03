import { TranslocoModule } from '@ngneat/transloco';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TimeagoModule } from 'ngx-timeago';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { SharedModule } from 'app/shared.module';
import { ChatBotComponent } from 'app/modules/admin/marketing/chatbot/chatbot.component';
import { FileListDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/file-list-dialog.component';
import { DocTypeDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/doc-type-dialog.component';
import { IndexDomainsDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/index-domains-dialog.component';
import { SettingChatbotDialogComponent } from 'app/modules/admin/marketing/chatbot/dialogs/setting-chatbot-dialog.component';

const Routes: Route[] = [
    {
        path: '',
        component: ChatBotComponent
    }
];

@NgModule({
    declarations: [
        ChatBotComponent,
        FileListDialogComponent,
        DocTypeDialogComponent,
        IndexDomainsDialogComponent,
        SettingChatbotDialogComponent
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatButtonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatGridListModule,
        MatExpansionModule,
        MatSelectModule,
        MatTooltipModule,
        MatListModule,
        MatSidenavModule,
        MatSlideToggleModule,
        NgxDatatableModule,
        TimeagoModule.forRoot(),
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChatBotModule {
}
