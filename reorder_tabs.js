const fs = require('fs');
const html = fs.readFileSync('src/app/modules/admin/account/settings/admin/admin.component.html', 'utf8');

// The file has a structure like:
// <div class="w-full">
//     <mat-tab-group ...>
//         <mat-tab ...>
//             ...
//         </mat-tab>
//         ...
//     </mat-tab-group>
// </div>

const startMatch = html.match(/<mat-tab-group[^>]*>/);
const startIdx = startMatch.index + startMatch[0].length;
const endIdx = html.lastIndexOf('</mat-tab-group>');

const beforeTabs = html.substring(0, startIdx);
const afterTabs = html.substring(endIdx);
const tabsHtml = html.substring(startIdx, endIdx);

// We need to split tabsHtml by `<mat-tab`
// But we have to be careful about nested tags. Fortunately, mat-tab shouldn't be nested.
const tabParts = tabsHtml.split(/(?=\s*<mat-tab )/);
// tabParts[0] might be just whitespace
let tabs = tabParts.filter(p => p.trim().startsWith('<mat-tab'));

console.log("Found", tabs.length, "tabs");
// Identify them:
let tabMap = {};
for (let t of tabs) {
    if (t.includes("'app.member'")) tabMap['Member'] = t;
    else if (t.includes("'app.license_keys'")) tabMap['License'] = t;
    else if (t.includes("Lịch sử giao dịch")) tabMap['Transaction'] = t;
    else if (t.includes("'app.report'")) tabMap['Report'] = t;
    else if (t.includes("'app.n8n_workflows'")) tabMap['N8N'] = t;
    else if (t.includes("'app.help'")) tabMap['Help'] = t;
    else if (t.includes("'app.auto_system'")) tabMap['System'] = t;
    else console.log("UNKNOWN TAB:", t.substring(0, 50));
}

const newOrder = [
    tabMap['Member'],
    tabMap['License'],
    tabMap['Transaction'],
    tabMap['Report'],
    tabMap['N8N'],
    tabMap['Help'],
    tabMap['System']
];

fs.writeFileSync('src/app/modules/admin/account/settings/admin/admin.component.html', beforeTabs + '\n' + newOrder.join('\n') + '\n    ' + afterTabs);
console.log("Reordered!");
