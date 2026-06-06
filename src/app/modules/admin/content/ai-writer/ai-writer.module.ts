import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
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
import { MatBadgeModule } from '@angular/material/badge';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { MatMenuModule } from '@angular/material/menu';
import { FuseAlertModule } from '@fuse/components/alert';
import { MatExpansionModule } from '@angular/material/expansion';
import { NgSelectModule } from '@ng-select/ng-select';
import { SharedModule } from 'app/shared.module';
import { QuillModule } from 'ngx-quill';
import { TimeagoModule } from 'ngx-timeago';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgxCurrencyDirective } from "ngx-currency";

import { AIWriterComponent } from 'app/modules/admin/content/ai-writer/ai-writer.component';
import { CopyPasteDialog } from 'app/modules/admin/content/ai-writer/tools/copy-paste-dialog';
import { GeminiImageDialog } from 'app/modules/admin/content/ai-writer/tools/gemini-image-dialog';
import { MediaDataDialog } from 'app/modules/admin/content/ai-writer/tools/media-data-dialog';
import { WordDataDialog } from 'app/modules/admin/content/ai-writer/tools/word-data-dialog';
import { CommentDialog } from 'app/modules/admin/content/ai-writer/tools/comment-dialog';
import { GeminiMatrixDialog } from 'app/modules/admin/content/ai-writer/tools/gemini-matrix-dialog';
import { ChatGPTDataDialog } from 'app/modules/admin/content/ai-writer/tools/chatgpt-data-dialog';
import { ChatGPTQuestionSheet } from 'app/modules/admin/content/ai-writer/tools/chatgpt-questions-sheet';
import { KeywordGoogleDataDialog } from 'app/modules/admin/content/ai-writer/tools/keyword-google-data-dialog';
import { EditBeforeExportSheet } from 'app/modules/admin/content/ai-writer/tools/edit-before-export-sheet';
import { SettingsDomainLoginComponent } from 'app/modules/admin/account/settings/domain/login/login.component';

const Routes: Route[] = [{
    path: ':name/:uuid',
    component: AIWriterComponent
}, {
    path: '',
    component: AIWriterComponent
}];

@NgModule({
    declarations: [
        AIWriterComponent,
        WordDataDialog,
        ChatGPTDataDialog,
        CopyPasteDialog,
        GeminiImageDialog,
        ChatGPTQuestionSheet,
        EditBeforeExportSheet,
        KeywordGoogleDataDialog,
        CommentDialog,
        MediaDataDialog,
        GeminiMatrixDialog,
        SettingsDomainLoginComponent,
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
        MatBadgeModule,
        ClipboardModule,
        MatExpansionModule,
        MatMenuModule,
        FuseAlertModule,
        NgSelectModule,
        NgxCurrencyDirective,
        QuillModule.forRoot({
            modules: {
                syntax: true,
                toolbar: [
                    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                    ['blockquote', 'code-block'],

                    [{ 'header': 1 }, { 'header': 2 }],               // custom button values
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'script': 'sub' }, { 'script': 'super' }],      // superscript/subscript
                    [{ 'indent': '-1' }, { 'indent': '+1' }],          // outdent/indent
                    [{ 'direction': 'rtl' }],                         // text direction

                    [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

                    [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
                    [{ 'font': [] }],
                    [{ 'align': [] }],

                    ['clean'],                                         // remove formatting button

                    ['link', 'image', 'video']                         // link and image, video
                ]
            }
        }),
        TimeagoModule.forRoot(),
        DragDropModule,
        SharedModule
    ],
    exports: [CopyPasteDialog, GeminiImageDialog, WordDataDialog, CommentDialog, EditBeforeExportSheet, ChatGPTDataDialog, ChatGPTQuestionSheet, KeywordGoogleDataDialog, MediaDataDialog],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AIWriterModule {
}
