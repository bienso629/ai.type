const fs = require('fs');

function fixFile(filePath) {
    let data = fs.readFileSync(filePath, 'utf8');

    const searchStr = "            const img = new Image();\r\n            img.crossOrigin = 'Anonymous';";
    const searchStr2 = "            const img = new Image();\n            img.crossOrigin = 'Anonymous';";
    
    let actualSearch = null;
    if (data.indexOf(searchStr) !== -1) actualSearch = searchStr;
    else if (data.indexOf(searchStr2) !== -1) actualSearch = searchStr2;

    if (!actualSearch) {
        console.log('Search string not found in ' + filePath);
        return;
    }

    if (data.indexOf('let finalUrl = url;') !== -1 && data.indexOf('media://SMART_FIND') !== -1) {
        console.log('Already fixed in ' + filePath);
        return;
    }

    const replacement = `            let finalUrl = url;
            if (!finalUrl.startsWith('http') && !finalUrl.startsWith('data:') && !finalUrl.startsWith('blob:') && !finalUrl.startsWith('media://')) {
                finalUrl = finalUrl.replace(/^unsafe:/, '');
                let originalPath = finalUrl.split('?')[0];
                originalPath = originalPath.replace(/^file:\\/\\//i, '');
                const mediaDir = ''; // Need to extract this from somewhere, or just leave empty and rely on uuid
                finalUrl = \`media://SMART_FIND/?path=\${encodeURIComponent(originalPath)}&dir=\${encodeURIComponent(mediaDir)}&uuid=default\`;
            }

            const img = new Image();
            img.crossOrigin = 'Anonymous';`;

    data = data.replace(actualSearch, replacement);
    data = data.replace('img.src = url;', 'img.src = finalUrl;');

    fs.writeFileSync(filePath, data, 'utf8');
    console.log('Fixed ' + filePath);
}

fixFile('c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.ts');
fixFile('c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/character-dialog.component.ts');
