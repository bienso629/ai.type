import { TranslocoModule } from '@ngneat/transloco';
import { Component, Inject, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { TimeagoModule } from 'ngx-timeago';
import { NgSelectModule } from '@ng-select/ng-select';
import { SharedModule } from 'app/shared.module';
// import { LinksResolver } from 'app/modules/admin/link-seo/link-seo.resolvers';
import { LinksComponent } from 'app/modules/admin/marketing/seo-links/seo-links.component';
import { EditDialog } from 'app/modules/admin/marketing/seo-links/dialogs/edit-dialog';

@Component({
    selector: 'app-dialog-content',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:twitch'"></mat-icon>
        <mat-label class="self-center">{{ 'app.seo_evaluation_results_of' | transloco: { link: data.link } }}</mat-label>
    </div>

    <div id="pdf-content" mat-dialog-content class="mt-4 p-0 ket-qua-seo bg-white" [innerHTML]="data.html"></div>

    <div mat-dialog-actions class="p-0 mt-4 flex justify-between w-full">
        <button mat-flat-button color="medium" (click)="close()" class="ml-0">{{ 'app.close_window' | transloco }}</button>
        <button mat-flat-button color="primary" (click)="exportPDF()" [disabled]="isExporting">
            {{ isExporting ? ('app.processing' | transloco) : ('app.export_pdf' | transloco) }}
        </button>
    </div>`
})

export class DialogContentComponent {
    isExporting = false;

    constructor(public dialogRef: MatDialogRef<DialogContentComponent>, @Inject(MAT_DIALOG_DATA) public data: { html: string, link: string }) { }

    close() {
        this.dialogRef.close();
    }

    async exportPDF() {
        const dataElement = document.getElementById('pdf-content');
        if (dataElement) {
            this.isExporting = true;

            try {
                // Sử dụng thư viện có sẵn trong package.json
                const pdfMake = require('pdfmake/build/pdfmake');
                const pdfFonts = require('pdfmake/build/vfs_fonts');
                const htmlToPdfmake = require('html-to-pdfmake');

                pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

                // Lấy nội dung HTML
                let htmlContent = dataElement.innerHTML;

                // Thuật toán vẽ Emoji thành hình ảnh Base64 để pdfmake có thể nhận diện được
                const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
                htmlContent = htmlContent.replace(emojiRegex, (match) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 30;
                    canvas.height = 30;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.font = '24px "Segoe UI Emoji", "Apple Color Emoji", Arial, sans-serif';
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
                    tableAutoSize: true
                });

                // Thuật toán ép pdfmake hiển thị hình ảnh (icon) nằm trên cùng 1 dòng với văn bản
                const fixInlineImages = (node: any) => {
                    const isInline = (n: any) => typeof n === 'string' || (n && (n.text !== undefined || n.image !== undefined));
                    
                    if (Array.isArray(node)) {
                        for (let i = 0; i < node.length; i++) {
                            if (Array.isArray(node[i])) {
                                const allInline = node[i].every(isInline);
                                const hasImage = node[i].some((n: any) => n && n.image !== undefined);
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
                            const hasImage = node.stack.some((n: any) => n && n.image !== undefined);
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
                    }
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
    }
];

@NgModule({
    declarations: [
        LinksComponent,
        DialogContentComponent,
        EditDialog
    ],
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
        NgSelectModule,
        RouterModule.forChild(logsRoutes),
        TimeagoModule.forRoot(),
        SharedModule,
    ],
    exports: [EditDialog]
})
export class LinksModule {
}
