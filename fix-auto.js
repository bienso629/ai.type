const fs = require('fs');

// 1. Remove the manual button
const htmlFile = 'src/app/modules/admin/content/ai-image/ai-image.component.html';
let htmlContent = fs.readFileSync(htmlFile, 'utf8');
const buttonStr = `<button
                                                        mat-stroked-button
                                                        (click)="loadNativeGallery()"
                                                    >
                                                        <mat-icon svgIcon="feather:image"></mat-icon>
                                                        <span class="ml-2">Đồng bộ Gallery</span>
                                                    </button>`;
htmlContent = htmlContent.replace(buttonStr, '');
fs.writeFileSync(htmlFile, htmlContent, 'utf8');

// 2. Add this.loadNativeGallery() to ngOnInit
const tsFile = 'src/app/modules/admin/content/ai-image/ai-image.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

if (!tsContent.includes('this.loadNativeGallery();')) {
    tsContent = tsContent.replace(
        `    ngOnInit(): void {`,
        `    ngOnInit(): void {\n        this.loadNativeGallery();`
    );
}
fs.writeFileSync(tsFile, tsContent, 'utf8');

