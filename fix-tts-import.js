const fs = require('fs');
const tsFile = 'src/app/modules/admin/content/ai-text2speech/ai-text2speech.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

tsContent = tsContent.replace(
    `import { UniversalEdgeTTS } from 'edge-tts-universal';`,
    `import { EdgeTTSBrowser } from 'edge-tts-universal';`
);

tsContent = tsContent.replace(
    `new UniversalEdgeTTS(text, voice`,
    `new EdgeTTSBrowser(text, voice`
);

fs.writeFileSync(tsFile, tsContent, 'utf8');
