const fs = require('fs');
const file = 'c:/Users/Wing386/ai.type/electron/src/main.js';
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const startIndex = lines.findIndex(l => l.includes("const ffmpegPath = binaries.ffmpeg || \"ffmpeg\";"));
if (startIndex !== -1) {
    const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes("        const args = ["));
    
    if (endIndex !== -1) {
        const replacement = [
            "        const ffmpegPath = binaries.ffmpeg || \"ffmpeg\";",
            "        let outputPath;",
            "        let baseName = '';",
            "        const timestamp = new Date().getTime();",
            "        if (isHttp) {",
            "            const tempDir = path.join(app.getPath('temp'), 'type_video_trim');",
            "            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });",
            "            let urlPathname = new URL(videoPath).pathname;",
            "            const ext = path.extname(urlPathname) || '.mp4';",
            "            outputPath = path.join(tempDir, `trimmed_${timestamp}${ext}`);",
            "        } else {",
            "            const dir = path.dirname(videoPath);",
            "            const ext = path.extname(videoPath);",
            "            baseName = path.basename(videoPath, ext);",
            "            let originalBaseName = baseName.replace(/_trimmed_\\d+/g, '');",
            "            outputPath = path.join(dir, `${originalBaseName}_trimmed_${timestamp}${ext}`);",
            "        }",
            ""
        ];
        
        lines.splice(startIndex, endIndex - startIndex, ...replacement);
        fs.writeFileSync(file, lines.join('\n'));
        console.log('Successfully replaced lines ' + startIndex + ' to ' + endIndex);
    } else {
        console.log('End index not found');
    }
} else {
    console.log('Start index not found');
}
