const fs = require('fs');
const file = 'c:/Users/Wing386/ai.type/electron/src/main.js';
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const startIndex = lines.findIndex(l => l.includes("ipcMain.handle('trim-video', async (event, payload) => {"));
if (startIndex !== -1) {
    const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes("ipcMain.handle('open-external',"));
    
    if (endIndex !== -1) {
        const replacement = `ipcMain.handle('trim-video', async (event, payload) => {
    try {
        let { videoUrl, trimStart, duration } = payload;
        
        // Remove file://
        const videoPath = videoUrl.replace('file://', '');
        const isHttp = videoPath.startsWith('http://') || videoPath.startsWith('https://');
        
        if (!isHttp && !fs.existsSync(videoPath)) {
            return { success: false, error: 'File gốc không tồn tại: ' + videoPath };
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        let outputPath;
        let localInputPath = videoPath;
        let baseName = '';
        const timestamp = new Date().getTime();
        const tempDir = path.join(app.getPath('temp'), 'type_video_trim');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        // Download file if it's http
        if (isHttp) {
            let urlPathname = new URL(videoPath).pathname;
            const ext = path.extname(urlPathname) || '.mp4';
            baseName = path.basename(urlPathname, ext) || 'video';
            localInputPath = path.join(tempDir, \`download_\${timestamp}\${ext}\`);
            outputPath = path.join(tempDir, \`trimmed_\${timestamp}\${ext}\`);
            
            await new Promise((resolve, reject) => {
                const https = require(videoPath.startsWith('https') ? 'https' : 'http');
                const file = fs.createWriteStream(localInputPath);
                https.get(videoPath, (response) => {
                    response.pipe(file);
                    file.on('finish', () => { file.close(resolve); });
                }).on('error', (err) => {
                    fs.unlink(localInputPath, () => {});
                    reject(err);
                });
            });
        } else {
            const dir = path.dirname(videoPath);
            const ext = path.extname(videoPath);
            baseName = path.basename(videoPath, ext);
            let originalBaseName = baseName.replace(/_trimmed_\\d+/g, '');
            outputPath = path.join(dir, \`\${originalBaseName}_trimmed_\${timestamp}\${ext}\`);
        }

        const args = [
            '-ss', trimStart.toString(),
            '-i', localInputPath,
            '-t', duration.toString(),
            '-c:v', 'libx264',
            '-crf', '28',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-y',
            outputPath
        ];

        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const child = spawn(ffmpegPath, args);
            
            child.on('close', (code) => {
                if (isHttp) { try { fs.unlinkSync(localInputPath); } catch (e) {} }
                if (code === 0 && fs.existsSync(outputPath)) {
                    if (!isHttp && baseName.includes('_trimmed_')) {
                        try { fs.unlinkSync(videoPath); } catch (e) {}
                    }
                    resolve({ success: true, path: outputPath });
                } else {
                    resolve({ success: false, error: \`FFmpeg process exited with code \${code}\` });
                }
            });
            
            child.on('error', (err) => {
                if (isHttp) { try { fs.unlinkSync(localInputPath); } catch (e) {} }
                resolve({ success: false, error: err.message });
            });
        });

    } catch (e) {
        return { success: false, error: e.message };
    }
});
`;
        
        lines.splice(startIndex, endIndex - startIndex, replacement);
        fs.writeFileSync(file, lines.join('\\n'));
        console.log('Successfully replaced lines ' + startIndex + ' to ' + endIndex);
    } else {
        console.log('End index not found');
    }
} else {
    console.log('Start index not found');
}
