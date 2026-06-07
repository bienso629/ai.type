const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function extractLastFrame(videoPath, ffmpegPath = 'ffmpeg') {
    return new Promise((resolve, reject) => {
        const tempImage = path.join(os.tmpdir(), `frame_${Date.now()}.png`);
        const args = ['-sseof', '-0.5', '-i', videoPath, '-update', '1', '-q:v', '2', tempImage];
        const child = spawn(ffmpegPath, args);
        child.on('close', (code) => {
            if (code === 0 && fs.existsSync(tempImage)) {
                const base64 = fs.readFileSync(tempImage, { encoding: 'base64' });
                fs.unlinkSync(tempImage);
                resolve(base64);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });
    });
}
