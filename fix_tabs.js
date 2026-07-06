const fs = require('fs');
let html = fs.readFileSync('src/app/modules/admin/account/settings/admin/admin.component.html', 'utf8');

// Replace the start of the wrapper for Thành viên
html = html.replace(/<div class="flex-auto overflow-y-auto min-h-100 relative mt-4">\s*<ngx-datatable class="material fullscreen" \[virtualization\]="false" \[scrollbarV\]="false" \[scrollbarH\]="false"/g, '<ngx-datatable class="material mt-4" [virtualization]="false"');

// Fix Báo cáo
html = html.replace(/<div class="flex-auto overflow-y-auto min-h-100 relative mt-4">\s*<ngx-datatable \[virtualization\]="false" class="material fullscreen" \[selected\]="selected" \[scrollbarV\]="false" \[scrollbarH\]="false"/g, '<ngx-datatable [virtualization]="false" class="material mt-4" [selected]="selected"');

// Fix N8N
html = html.replace(/<div class="flex-auto overflow-y-auto min-h-100 relative mt-4">\s*<ngx-datatable class="material fullscreen" \[virtualization\]="false" \[scrollbarV\]="false" \[scrollbarH\]="false"/g, '<ngx-datatable class="material mt-4" [virtualization]="false"');

// Fix Lịch sử giao dịch
html = html.replace(/<div class="flex-auto overflow-y-auto min-h-100 relative mt-4">\s*<ngx-datatable \[virtualization\]="false" class="material fullscreen" \[headerHeight\]="50"/g, '<ngx-datatable [virtualization]="false" class="material mt-4" [headerHeight]="50"');

// Now remove the extra </div> that we added for the wrapper in each tab!
// Wait, doing this with regex is tricky because there are many </div>.
// I will just use multi_replace_file_content to do it safely.
