const fs = require('fs');
const path = require('path');

const dir = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/tools';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    
    // Replace header
    content = content.replace(
        /<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">([\s\S]*?)<mat-label class="self-center">(.*?)<\/mat-label>\s*<\/div>/g,
        `<div class="flex items-center justify-between mb-4">
        <div class="text-2xl font-bold text-gray-800 tracking-tight">$2</div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>`
    );

    // Replace mat-dialog-actions
    content = content.replace(
        /<div mat-dialog-actions class="p-0 mt-4 flex justify-start gap-2">/g,
        `<div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">`
    );

    // Remove close buttons
    content = content.replace(/\s*<button[^>]*>Đóng cửa sổ<\/button>/g, '');

    fs.writeFileSync(path.join(dir, file), content, 'utf8');
});
console.log('Done');
