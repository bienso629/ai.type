import { TranslocoModule } from '@jsverse/transloco';
import {
    Component,
    Inject,
    NgModule,
    OnInit,
    inject,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TimeagoModule } from 'ngx-timeago';
import { NgSelectModule } from '@ng-select/ng-select';
import { SharedModule } from 'app/shared.module';
// import { LinksResolver } from 'app/modules/admin/link-seo/link-seo.resolvers';
import { LinksComponent } from 'app/modules/admin/marketing/seo-links/seo-links.component';
import { EditDialog } from 'app/modules/admin/marketing/seo-links/dialogs/edit-dialog';
import { GenaiService } from 'app/genai.service';
import { MarkdownPipe } from 'app/markdown.pipe';

@Component({
    selector: 'app-dialog-content',
    template: ` <div
        class="flex flex-col h-full min-h-[580px] max-h-[85vh] overflow-hidden"
    >
        <!-- Dialog Header -->
        <div
            class="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700 shrink-0"
        >
            <div
                class="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center min-w-0 mr-2"
            >
                <mat-icon
                    class="mr-2 icon-size-5 text-blue-600 shrink-0"
                    [svgIcon]="'heroicons_solid:check-circle'"
                ></mat-icon>
                <span class="truncate"
                    >Kiểm tra & Đề xuất SEO cho: {{ data.link }}</span
                >
            </div>

            <button
                mat-icon-button
                (click)="close()"
                title="Đóng"
                class="shrink-0"
            >
                <mat-icon
                    class="icon-size-5"
                    [svgIcon]="'heroicons_solid:x'"
                ></mat-icon>
            </button>
        </div>

        <!-- Chat area / scroll list -->
        <div
            id="seoChatList"
            class="flex-auto overflow-y-auto my-4 space-y-4 p-4 bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-gray-800 rounded-xl scrollbar-thin"
        >
            @for (msg of messages; track msg; let isFirst = $first) {
                <!-- User message -->
                @if (msg.role === 'user') {
                    <div class="flex justify-end">
                        <div
                            class="max-w-[85%] bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100 rounded-2xl rounded-tr-none px-4 py-2.5 text-sm break-words shadow-sm"
                        >
                            {{ msg.text }}
                        </div>
                    </div>
                }
                <!-- Model message -->
                @if (msg.role === 'model') {
                    <div class="flex justify-start">
                        <div
                            class="max-w-[85%] bg-white dark:bg-slate-800 text-gray-850 dark:text-gray-100 border border-gray-200 dark:border-gray-750 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm break-words shadow-sm chatgpt-result"
                        >
                            <!-- For the first report message, we wrap it in a div so it can be exported as PDF -->
                            <div
                                [id]="isFirst ? 'pdf-content' : null"
                                [innerHTML]="msg.text | markdown"
                            ></div>
                        </div>
                    </div>
                }
            }

            <!-- Loading response spinner -->
            @if (isLoading) {
                <div class="flex justify-start">
                    <div
                        class="max-w-[85%] bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-750 rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center space-x-2 shadow-sm"
                    >
                        <mat-progress-spinner
                            [diameter]="16"
                            [strokeWidth]="2"
                            [mode]="'indeterminate'"
                        ></mat-progress-spinner>
                        <span class="text-xs text-gray-500"
                            >AI Agent đang phân tích...</span
                        >
                    </div>
                </div>
            }
        </div>

        <!-- Dialog Actions & Input -->
        <div
            class="flex flex-col space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700 shrink-0"
        >
            <!-- Chat Input Area -->
            <div
                class="flex items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-sm"
            >
                <input
                    #chatInput
                    (input)="(0)"
                    [(ngModel)]="newQuestion"
                    class="w-full text-base font-normal bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0"
                    placeholder="Hỏi AI Agent để làm rõ kết quả hoặc hướng dẫn sửa đổi..."
                    [disabled]="isLoading"
                    (keyup.enter)="sendMessage()"
                />

                <button
                    mat-mini-fab
                    color="primary"
                    [disabled]="isLoading || !newQuestion?.trim()"
                    (click)="sendMessage()"
                    class="ml-2 w-8 h-8 min-w-8 min-h-8 flex items-center justify-center shadow-sm focus:outline-none shrink-0"
                    title="Gửi câu hỏi"
                >
                    <mat-icon
                        class="icon-size-4 text-white"
                        [svgIcon]="'heroicons_solid:paper-airplane'"
                    ></mat-icon>
                </button>
            </div>

            <!-- Footer Action Row -->
            <div class="flex justify-between items-center w-full">
                <button mat-button (click)="close()" class="ml-0">
                    {{ 'app.close_window' | transloco }}
                </button>

                <button
                    mat-flat-button
                    color="accent"
                    (click)="exportPDF()"
                    [disabled]="isExporting"
                >
                    <mat-icon
                        class="icon-size-4 mr-2"
                        [svgIcon]="'heroicons_solid:download'"
                    ></mat-icon>
                    <span>{{
                        isExporting
                            ? ('app.processing' | transloco)
                            : ('app.export_pdf' | transloco)
                    }}</span>
                </button>
            </div>
        </div>
    </div>`,
    styles: [
        `
            .chatgpt-result p {
                margin-bottom: 0.5rem;
            }
            .chatgpt-result p:last-child {
                margin-bottom: 0;
            }
            .chatgpt-result ul {
                list-style-type: disc !important;
                padding-left: 1.25rem !important;
                margin-bottom: 0.5rem !important;
            }
            .chatgpt-result ol {
                list-style-type: decimal !important;
                padding-left: 1.25rem !important;
                margin-bottom: 0.5rem !important;
            }
            .chatgpt-result li {
                margin-bottom: 0.25rem;
            }
            .chatgpt-result code {
                background-color: #e2e8f0 !important;
                color: #b91c1c !important;
                padding: 0.125rem 0.25rem;
                border-radius: 0.25rem;
                font-family: monospace;
                font-size: 0.8125rem !important;
            }
            .dark .chatgpt-result code {
                background-color: #1e293b !important;
                color: #f87171 !important;
            }
            .chatgpt-result pre {
                background-color: #f8fafc !important;
                border: 1px solid #cbd5e1 !important;
                padding: 0.75rem;
                border-radius: 0.375rem;
                overflow-x: auto;
                margin-bottom: 0.5rem;
            }
            .dark .chatgpt-result pre {
                background-color: #0f172a !important;
                border: 1px solid #334155 !important;
            }
            .chatgpt-result pre code {
                background-color: transparent !important;
                padding: 0 !important;
                color: inherit !important;
                font-size: 0.8125rem !important;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class DialogContentComponent implements OnInit {
    isExporting = false;
    isLoading = false;
    newQuestion = '';
    messages: Array<{ role: 'user' | 'model'; text: string }> = [];

    ai = inject(GenaiService);
    cd = inject(ChangeDetectorRef);

    constructor(
        public dialogRef: MatDialogRef<DialogContentComponent>,
        @Inject(MAT_DIALOG_DATA)
        public data: { markdown: string; link: string; itemId: any },
    ) {}

    ngOnInit() {
        this.messages = [{ role: 'model', text: this.data.markdown }];
        this.scrollToBottom();
    }

    close() {
        this.dialogRef.close();
    }

    async sendMessage() {
        if (!this.newQuestion || !this.newQuestion.trim() || this.isLoading)
            return;

        const text = this.newQuestion.trim();
        this.newQuestion = '';

        this.messages.push({ role: 'user', text });
        this.isLoading = true;
        this.cd.detectChanges();
        this.scrollToBottom();

        try {
            const contents = this.messages.map((m) => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));

            const response = await this.ai.generateContent(
                {
                    model: 'gemini-3.6-flash',
                    contents: contents,
                },
                this.data.itemId,
            );

            if (response && response.text) {
                this.messages.push({ role: 'model', text: response.text });
            } else {
                this.messages.push({
                    role: 'model',
                    text: 'AI Agent không có phản hồi.',
                });
            }
        } catch (error) {
            console.error(error);
            this.messages.push({
                role: 'model',
                text: 'Có lỗi xảy ra khi kết nối với AI Agent.',
            });
        } finally {
            this.isLoading = false;
            this.cd.detectChanges();
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            const el = document.getElementById('seoChatList');
            if (el) {
                el.scrollTop = el.scrollHeight;
            }
        }, 100);
    }

    async exportPDF() {
        const dataElement = document.getElementById('pdf-content');
        if (dataElement) {
            this.isExporting = true;

            try {
                // Sử dụng thư viện có sẵn trong package.json
                const pdfMakeModule = await import('pdfmake/build/pdfmake');
                const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
                const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
                const pdfFonts =
                    (pdfFontsModule as any).default || pdfFontsModule;
                const htmlToPdfmakeModule = await import('html-to-pdfmake');
                const htmlToPdfmake = ((htmlToPdfmakeModule as any).default ||
                    htmlToPdfmakeModule) as Function;

                pdfMake.vfs = pdfFonts.pdfMake
                    ? pdfFonts.pdfMake.vfs
                    : pdfFonts.vfs;

                // Lấy nội dung HTML
                let htmlContent = dataElement.innerHTML;

                // Thuật toán vẽ Emoji thành hình ảnh Base64 để pdfmake có thể nhận diện được
                const emojiRegex =
                    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
                htmlContent = htmlContent.replace(emojiRegex, (match) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 30;
                    canvas.height = 30;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.font =
                            '24px "Segoe UI Emoji", "Apple Color Emoji", Arial, sans-serif';
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'center';
                        ctx.fillText(match, 15, 17);
                    }
                    const dataUrl = canvas.toDataURL('image/png');
                    // Biến Emoji thành thẻ <img> để html-to-pdfmake vẽ như 1 bức ảnh thu nhỏ xen lẫn văn bản
                    return `<img src="${dataUrl}" width="14" height="14" style="margin: 0 2px;" />`;
                });

                // Chuyển đổi HTML -> PDFMake
                const htmlConverted = htmlToPdfmake(htmlContent, {
                    window: window,
                    tableAutoSize: true,
                });

                // Thuật toán ép pdfmake hiển thị hình ảnh (icon) nằm trên cùng 1 dòng với văn bản
                const fixInlineImages = (node: any) => {
                    const isInline = (n: any) =>
                        typeof n === 'string' ||
                        (n && (n.text !== undefined || n.image !== undefined));

                    if (Array.isArray(node)) {
                        for (let i = 0; i < node.length; i++) {
                            if (Array.isArray(node[i])) {
                                const allInline = node[i].every(isInline);
                                const hasImage = node[i].some(
                                    (n: any) => n && n.image !== undefined,
                                );
                                if (allInline && hasImage) {
                                    node[i] = { text: node[i] }; // Ép thành inline text block
                                } else {
                                    fixInlineImages(node[i]);
                                }
                            } else {
                                fixInlineImages(node[i]);
                            }
                        }
                    } else if (node && typeof node === 'object') {
                        if (node.stack) {
                            const allInline = node.stack.every(isInline);
                            const hasImage = node.stack.some(
                                (n: any) => n && n.image !== undefined,
                            );
                            if (allInline && hasImage) {
                                node.text = node.stack;
                                delete node.stack; // Đổi stack thành text block để tránh xuống dòng
                                fixInlineImages(node.text);
                            } else {
                                fixInlineImages(node.stack);
                            }
                        } else {
                            for (let key in node) {
                                if (node.hasOwnProperty(key)) {
                                    fixInlineImages(node[key]);
                                }
                            }
                        }
                    }
                };

                fixInlineImages(htmlConverted);

                const docDefinition = {
                    content: htmlConverted,
                    pageMargins: [42, 42, 42, 42],
                    info: {
                        title: 'Kết quả SEO',
                    },
                };

                pdfMake.createPdf(docDefinition).download('Ket_Qua_SEO.pdf');
            } catch (error) {
                console.error('Lỗi khi xuất PDF:', error);
            } finally {
                this.isExporting = false;
            }
        }
    }
}

const logsRoutes: Route[] = [
    {
        path: '',
        component: LinksComponent,
        // resolve  : {
        //     data: LinksResolver
        // }
    },
];

@NgModule({
    declarations: [LinksComponent, DialogContentComponent, EditDialog],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        MatButtonModule,
        MatButtonToggleModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatDialogModule,
        MatMenuModule,
        MatSelectModule,
        MatSidenavModule,
        MatSortModule,
        MatTableModule,
        MatTooltipModule,
        MatExpansionModule,
        MatProgressSpinnerModule,
        NgSelectModule,
        RouterModule.forChild(logsRoutes),
        TimeagoModule.forRoot(),
        SharedModule,
        MarkdownPipe,
    ],
    exports: [EditDialog],
})
export class LinksModule {}
