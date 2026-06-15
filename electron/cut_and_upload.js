const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const FormData = require('form-data');

const videoUrl = 'https://cdn1.type.vn/public/1781440603690.mp4';
const tempDir = path.join(__dirname, 'temp_trim');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const downloadPath = path.join(tempDir, 'downloaded.mp4');
const trimmedPath = path.join(tempDir, 'trimmed.mp4');

console.log('1. Đang tải video từ CDN...');
const file = fs.createWriteStream(downloadPath);
https.get(videoUrl, (response) => {
    response.pipe(file);
    file.on('finish', () => {
        file.close(() => {
            console.log('2. Tải xong. Bắt đầu cắt xuống 10s bằng ffmpeg...');
            
            // Cắt video
            const ffmpegCmd = `ffmpeg -y -i "${downloadPath}" -ss 0 -t 10 -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 128k "${trimmedPath}"`;
            exec(ffmpegCmd, (err, stdout, stderr) => {
                if (err) {
                    console.error('Lỗi cắt video:', err);
                    return;
                }
                console.log('3. Cắt video thành công. Đang upload lên CDN...');
                
                // Upload lên CDN
                const form = new FormData();
                form.append('files', fs.createReadStream(trimmedPath), {
                    filename: `trimmed_${Date.now()}.mp4`,
                    contentType: 'video/mp4'
                });
                
                const formHeaders = form.getHeaders();
                formHeaders['x-api-key'] = 'type-vn-secret-key-2026-yenai-dep-trai';
                
                const uploadReq = https.request('https://cdn1.type.vn/upload', {
                    method: 'POST',
                    headers: formHeaders
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        console.log('4. Upload thành công! URL mới của bạn là:');
                        try {
                            const parsed = JSON.parse(data);
                            console.log(parsed.urls[0] || parsed.url || parsed.data || parsed);
                        } catch (e) {
                            console.log(data);
                        }
                    });
                });
                
                uploadReq.on('error', (e) => console.error('Lỗi upload:', e));
                form.pipe(uploadReq);
            });
        });
    });
});
