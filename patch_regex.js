const fs = require('fs');

const files = [
    'src/app/modules/admin/content/ai-tts/tools/character-dialog.component.ts',
    'src/app/modules/admin/content/ai-tts/tools/edit-scene-prompt-dialog.component.ts',
    'src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.ts'
];

for (const f of files) {
    if (!fs.existsSync(f)) continue;
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace("const match = msg.match(/\\{\"error\":.*\\}/);", "const match = msg.match(/\\{\"error\":[\\s\\S]*?\\}/);");
    fs.writeFileSync(f, c);
}
