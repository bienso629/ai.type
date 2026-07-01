import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

helpers = """
function cleanFilePath(fileUrl) {
    if (!fileUrl) return '';
    let p = fileUrl;

    if (p.startsWith('media://')) {
        p = p.substring(8);
        if (p.toLowerCase().startsWith('auto_find/')) {
            const rest = p.substring(10);
            const parts = rest.split('/');
            const uuid = parts[0];
            const basename = parts.slice(1).join('/');
            const docPath = app.getPath('documents');
            p = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin', uuid, basename);
        } else if (p.toLowerCase().startsWith('smart_find/')) {
            // Very simplified smart_find resolver for safety
            const queryString = p.substring(p.indexOf('?') + 1);
            const params = new URLSearchParams(queryString);
            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\\/\\//i, '');
            if (originalPath.includes('?')) originalPath = originalPath.split('?')[0];
            if (originalPath.includes('#')) originalPath = originalPath.split('#')[0];
            p = originalPath;
        } else {
            if (p.startsWith('/')) p = p.substring(1);
            const driveMatch = p.match(/^([a-zA-Z])(:?)\\//);
            if (driveMatch) {
                const driveLetter = driveMatch[1].toUpperCase();
                if (driveMatch[2] === ':') p = driveLetter + p.substring(1);
                else p = driveLetter + ':' + p.substring(1);
            } else {
                p = '/' + p;
            }
        }
    }

    if (p.startsWith('file://')) {
        try {
            const url = require('url');
            p = url.fileURLToPath(p);
        } catch (e) {
            p = p.substring(7); // Giữ lại dấu / đầu tiên
            if (process.platform === 'win32' && p.match(/^\\/[a-zA-Z]:/)) {
                p = p.substring(1);
            }
        }
    }

    try {
        p = decodeURIComponent(p); // Giải mã %20 thành dấu cách
    } catch (e) { }

    if (process.platform === 'win32') {
        p = p.replace(/\\//g, '\\\\');
    }

    return p;
}
"""

import re
# Replace the original cleanFilePath implementation with the new one
pattern = re.compile(r'function cleanFilePath\(fileUrl\) \{[\s\S]*?return p;\n\}')
content = pattern.sub(helpers.strip(), content)

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Modified cleanFilePath.")
