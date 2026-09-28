const fs = require('fs');
const file = 'src/app/modules/admin/content/ai-image/ai-image.component.html';
let content = fs.readFileSync(file, 'utf8');

const target = `<div class="flex items-center gap-2">`;
const replacement = `<div class="flex items-center gap-2">
                                                    <button
                                                        mat-stroked-button
                                                        (click)="loadNativeGallery()"
                                                    >
                                                        <mat-icon svgIcon="feather:image"></mat-icon>
                                                        <span class="ml-2">Đồng bộ Gallery</span>
                                                    </button>`;

if (content.includes(target) && !content.includes('loadNativeGallery()')) {
    content = content.replace(target, replacement);
}

fs.writeFileSync(file, content, 'utf8');
