const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testTrim() {
    const videoUrl = 'https://cdn1.type.vn/public/1781440603690.mp4';
    const trimStart = 0;
    const duration = 10;
    
    const isHttp = videoUrl.startsWith('http://') || videoUrl.startsWith('https://');
    
    const ffmpegPath = "ffmpeg";
    let outputPath;
    let localInputPath = videoUrl;
    let baseName = '';
    const timestamp = new Date().getTime();
    const tempDir = path.join(os.tmpdir(), 'type_video_trim');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    if (isHttp) {
        let urlPathname = new URL(videoUrl).pathname;
        const ext = path.extname(urlPathname) || '.mp4';
        baseName = path.basename(urlPathname, ext) || 'video';
        localInputPath = path.join(tempDir, `download_${timestamp}${ext}`);
        outputPath = path.join(tempDir, `trimmed_${timestamp}${ext}`);
        
        console.log('Downloading...');
        await new Promise((resolve, reject) => {
            const https = require('https');
            const file = fs.createWriteStream(localInputPath);
            https.get(videoUrl, (response) => {
                response.pipe(file);
                file.on('finish', () => { file.close(resolve); });
            }).on('error', (err) => {
                fs.unlink(localInputPath, () => {});
                reject(err);
            });
        });
        console.log('Downloaded to', localInputPath);
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

    console.log('Running ffmpeg...');
    return new Promise((resolve) => {
        const child = spawn(ffmpegPath, args);
        let stderr = '';
        child.stderr.on('data', d => stderr += d.toString());
        
        child.on('close', (code) => {
            if (isHttp) { try { fs.unlinkSync(localInputPath); } catch (e) {} }
            if (code === 0 && fs.existsSync(outputPath)) {
                resolve({ success: true, path: outputPath });
            } else {
                resolve({ success: false, error: `FFmpeg process exited with code ${code}. Stderr: ${stderr}` });
            }
        });
    });
}

testTrim().then(console.log).catch(console.error);
