const fs = require('fs');
let file2 = 'src/app/modules/admin/marketing/gologin/gologin.component.ts';
let content2 = fs.readFileSync(file2, 'utf8');

content2 = content2.replace(
    'this.unsubscribeRes = (window as any).electron.onToolsResponse(',
    'if ((window as any).electron) {\n        this.unsubscribeRes = (window as any).electron.onToolsResponse('
);
content2 = content2.replace(
    /                console\.log\('Crawl Facebook thành công:', data\);\n            \},\n        \);/g,
    '                console.log(\'Crawl Facebook thành công:\', data);\n            },\n        ); }'
);

content2 = content2.replace(
    'this.unsubscribeLog = (window as any).electron.onToolsLog(',
    'if ((window as any).electron) {\n        this.unsubscribeLog = (window as any).electron.onToolsLog('
);
content2 = content2.replace(
    /                console\.log\('Log từ main:', msg\);\n            \},\n        \);/g,
    '                console.log(\'Log từ main:\', msg);\n            },\n        ); }'
);
fs.writeFileSync(file2, content2, 'utf8');
