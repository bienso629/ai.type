const fs = require('fs');
const path = require('path');
const file = 'c:/Users/Wing386/ai.type/electron/src/main.js';
let code = fs.readFileSync(file, 'utf8');

const target = `        // Remove file://
        const videoPath = videoUrl.replace('file://', '');
        if (!fs.existsSync(videoPath)) {
            return { success: false, error: 'File gá»‘c khÃ´ng tá»“n táº¡i: ' + videoPath };
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);
        let originalBaseName = baseName.replace(/_trimmed_\\d+/g, '');
        const timestamp = new Date().getTime();
        const outputPath = path.join(dir, \`\${originalBaseName}_trimmed_\${timestamp}\${ext}\`);`;

const replacement = `        // Remove file://
        const videoPath = videoUrl.replace('file://', '');
        const isHttp = videoPath.startsWith('http://') || videoPath.startsWith('https://');
        if (!isHttp && !fs.existsSync(videoPath)) {
            return { success: false, error: 'File gá»‘c khÃ´ng tá»“n táº¡i: ' + videoPath };
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        let outputPath;
        const timestamp = new Date().getTime();
        if (isHttp) {
            const tempDir = path.join(app.getPath('temp'), 'type_video_trim');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            let urlPathname = new URL(videoPath).pathname;
            const ext = path.extname(urlPathname) || '.mp4';
            outputPath = path.join(tempDir, \`trimmed_\${timestamp}\${ext}\`);
        } else {
            const dir = path.dirname(videoPath);
            const ext = path.extname(videoPath);
            const baseName = path.basename(videoPath, ext);
            let originalBaseName = baseName.replace(/_trimmed_\\d+/g, '');
            outputPath = path.join(dir, \`\${originalBaseName}_trimmed_\${timestamp}\${ext}\`);
        }`;

if(code.includes(target)) {
    fs.writeFileSync(file, code.replace(target, replacement));
    console.log('Replaced successfully');
} else {
    console.log('Target not found');
}
