const fs = require('fs');
const file = 'src/app/modules/admin/account/settings/plugins/plugins.component.html';
let content = fs.readFileSync(file, 'utf8');

// Fix button 1
content = content.replace(
    '<span class="ml-1 text-xs">Xác nhận</span>',
    '<span class="ml-2">Xác nhận</span>'
);
content = content.replace(
    '<button mat-button (click)="isColabAuthenticating = false" class="text-xs">',
    '<button mat-button (click)="isColabAuthenticating = false">'
);

// Fix button 2
content = content.replace(
    'class="!text-default font-medium"',
    'color="primary"'
);

fs.writeFileSync(file, content, 'utf8');
