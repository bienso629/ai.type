const fs = require('fs');
let text = fs.readFileSync('src/app/genai.service.ts', 'utf8');

const regex = /if \(config\.payloadFormat === 'kling_v3_motion' \|\| hasReferenceVideo\) \{[\s\S]*?\} else \{([\s\S]*?)\}/;

const match = text.match(regex);
if (match) {
    const elseBlockContent = match[1].trim();
    // Replaces the whole if/else block with just the contents of the else block.
    text = text.replace(match[0], elseBlockContent);
    fs.writeFileSync('src/app/genai.service.ts', text);
    console.log("PATCHED");
} else {
    console.log("NOT FOUND");
}
