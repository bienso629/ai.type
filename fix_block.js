const fs = require('fs');
let txt = fs.readFileSync('c:/Users/Wing386/ai.type/electron/src/main.js', 'utf8');

const correctBlock = `ipcMain.handle('analyze-video-local', async (event, payload) => {
    try {
        let { url, extractInterval } = payload;
        if (!url) {
            return { success: false, error: 'Không có URL hợp lệ' };
        }
        url = url.trim();

        const ytdlpPath = binaries.ytdlp || "yt-dlp";
        const ffmpegPath = binaries.ffmpeg || "ffmpeg";

        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        // Tạo một thư mục tạm thời riêng cho task này
        const timestamp = Date.now();
        const tempDir = path.join(aiTypingDir, \`_temp_\${timestamp}\`);
        fs.mkdirSync(tempDir, { recursive: true });

        let isLocalFile = false;
        let videoPath = '';
        let subtitlesText = "";
        let videoFile = "";

        // Kiểm tra xem URL có phải là file local không
        if (fs.existsSync(url) && fs.statSync(url).isFile()) {
            isLocalFile = true;
            videoPath = url;
            videoFile = path.basename(url);
            sendToRenderer("tools-log", \`[AI Analyze] Sử dụng video từ máy tính: \${url}\`);
        } else {
            // Nếu url giống một đường dẫn máy tính (bắt đầu bằng ổ đĩa C:\\ hoặc D:\\ hoặc /) nhưng không tồn tại file
            if (/^[a-zA-Z]:\\\\/.test(url) || url.startsWith('/')) {
                return { success: false, error: \`Không tìm thấy file video trên máy tính tại: \${url}. Có thể file đã bị xóa hoặc đổi tên.\` };
            }

            // Tải video độ phân giải vừa đủ để tăng tốc, KÈM THEO PHỤ ĐỀ
            const outputTemplate = path.join(tempDir, 'video.%(ext)s');

            sendToRenderer("tools-log", \`[AI Analyze] Đang tải video từ YouTube để phân tích...\`);

            const ytdlpArgs = [
                '-o', outputTemplate,
                '--newline',
                '--ignore-errors',
                '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
                '--write-auto-subs',
                '--write-subs',
                '--sub-lang', 'vi,en.*'
            ];
            if (binaries.ffmpeg) {
                ytdlpArgs.push('--ffmpeg-location', binaries.ffmpeg);
            }

            // Bổ sung cookie từ trình duyệt Chrome đối với Facebook để tránh bị chặn
            const cookiesTxtPath = path.join(__dirname, 'cookies.txt');
            const cookiesJsonPath = path.join(__dirname, 'cookies.json');

            let hasCustomCookies = false;

            if (fs.existsSync(cookiesTxtPath)) {
                ytdlpArgs.push('--cookies', cookiesTxtPath);
                hasCustomCookies = true;
            } else if (fs.existsSync(cookiesJsonPath)) {
                try {
                    const cookiesData = JSON.parse(fs.readFileSync(cookiesJsonPath, 'utf8'));
                    let netscapeStr = "# Netscape HTTP Cookie File\\n# http://curl.haxx.se/rfc/cookie_spec.html\\n# This file was generated from cookies.json\\n\\n";
                    for (const c of cookiesData) {
                        let domain = c.domain || '';
                        let includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                        let cPath = c.path || '/';
                        let secure = c.secure ? 'TRUE' : 'FALSE';
                        let expiration = c.expirationDate ? Math.round(c.expirationDate) : (c.expires ? Math.round(c.expires) : 0);
                        netscapeStr += \`\${domain}\\t\${includeSubdomains}\\t\${cPath}\\t\${secure}\\t\${expiration}\\t\${c.name}\\t\${c.value}\\n\`;
                    }
                    const tempCookiePath = path.join(tempDir, 'cookies_temp.txt');
                    fs.writeFileSync(tempCookiePath, netscapeStr, 'utf8');
                    ytdlpArgs.push('--cookies', tempCookiePath);
                    hasCustomCookies = true;
                } catch (err) {
                    console.error("Lỗi đọc file cookies.json", err);
                }
            }

            // Nếu không có file cookie nào được xuất, thì mới dùng cookie từ trình duyệt Chrome
            if (!hasCustomCookies && (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com'))) {
                ytdlpArgs.push('--cookies-from-browser', 'chrome');
            }

            ytdlpArgs.push(url);

            await new Promise((resolve, reject) => {
                const child = spawn(ytdlpPath, ytdlpArgs);
                child.stdout.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line && line.includes('[download]')) sendToRenderer("tools-log", \`[AI Analyze] \${line}\`);
                });
                child.stderr.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) sendToRenderer("tools-log", \`[AI Analyze] \${line}\`);
                });
                child.on('close', (code) => {
                    resolve();
                });
            });

            // Tìm file video và phụ đề vừa tải về trong thư mục tạm
            const files = fs.readdirSync(tempDir);
            const foundVideoFile = files.find(f => f.startsWith('video.') && !f.endsWith('.vtt') && !f.endsWith('.srt') && !f.endsWith('.lrc') && !f.endsWith('.json'));
            const subtitleFile = files.find(f => f.startsWith('video.') && (f.endsWith('.vtt') || f.endsWith('.srt')));

            if (!foundVideoFile) {
                throw new Error('Không tìm thấy video tải về.');
            }

            videoFile = foundVideoFile;
            videoPath = path.join(tempDir, videoFile);
            if (subtitleFile) {
                try {
                    const subPath = path.join(tempDir, subtitleFile);
                    subtitlesText = fs.readFileSync(subPath, 'utf8');
                    sendToRenderer("tools-log", \`[AI Analyze] Đã lấy được phụ đề của video.\`);
                } catch (e) { }
            }
        }

        sendToRenderer("tools-log", \`[AI Analyze] Bắt đầu trích xuất phân cảnh và âm thanh...\`);

        const framePattern = path.join(tempDir, 'frame_%03d.jpg');
        const audioPath = path.join(tempDir, 'audio.mp3');

        // Lệnh FFmpeg: Cắt frame ảnh
        const interval = parseFloat(extractInterval) || 1;
        const fps = (1 / interval).toFixed(4); // ví dụ: 5s/frame => fps=0.2

        const ffmpegFrameArgs = [
            '-y',
            '-i', videoPath,
            '-vf', \`fps=\${fps},scale=640:-1\`, '-q:v', '5', framePattern
        ];

        await new Promise((resolve, reject) => {
            const child = spawn(ffmpegPath, ffmpegFrameArgs);
            child.stderr.on('data', (data) => {
                // Log stderr of ffmpeg if needed, but it's very noisy
            });
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(\`Trích xuất phân cảnh thất bại với mã thoát: \${code}\`));
            });
        });

        // Lệnh FFmpeg: Cắt âm thanh
        const ffmpegAudioArgs = [
            '-y',
            '-i', videoPath,
            '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audioPath
        ];

        // Lấy âm thanh nhưng không làm hỏng tiến trình nếu video không có tiếng
        await new Promise((resolve) => {
            const child = spawn(ffmpegPath, ffmpegAudioArgs);
            child.on('close', () => {
                resolve();
            });
        });

        sendToRenderer("tools-log", \`[AI Analyze] Trích xuất thành công. Đang đóng gói dữ liệu gửi cho AI...\`);

        // Đọc các frame
        const allFiles = fs.readdirSync(tempDir);
        const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();

        // Giới hạn tối đa 100 frames (trải đều khắp video) để AI nhìn được tổng quan mà không bị quá tải token
        const maxFrames = 100;
        let selectedFrames = [];
        if (frameFiles.length <= maxFrames) {
            selectedFrames = frameFiles;
        } else {
            const step = frameFiles.length / maxFrames;
            for (let i = 0; i < maxFrames; i++) {
                const index = Math.min(Math.floor(i * step), frameFiles.length - 1);
                selectedFrames.push(frameFiles[index]);
            }
            // Loại bỏ các phần tử trùng lặp (nếu có do làm tròn)
            selectedFrames = [...new Set(selectedFrames)];
        }

        const base64Frames = [];
        for (const frameFile of selectedFrames) {
            const framePath = path.join(tempDir, frameFile);
            const data = fs.readFileSync(framePath);
            base64Frames.push(\`data:image/jpeg;base64,\${data.toString('base64')}\`);
        }

        // Đọc audio
        let audioBase64 = "";
        if (fs.existsSync(audioPath)) {
            const audioData = fs.readFileSync(audioPath);
            audioBase64 = \`data:audio/mp3;base64,\${audioData.toString('base64')}\`;
        }

        // Move video ra thư mục AI.TYPING chính nếu là video tải về
        let finalVideoPath = videoPath;
        if (!isLocalFile) {
            finalVideoPath = path.join(aiTypingDir, \`analyze_video_\${timestamp}\${path.extname(videoFile)}\`);
            fs.renameSync(videoPath, finalVideoPath);
        }

        // Xóa thư mục tạm (chứa các file jpg)
        // try {
        //     fs.rmSync(tempDir, { recursive: true, force: true });
        // } catch(e) {}

        sendToRenderer("tools-log", \`[AI Analyze] Đã hoàn tất! Video được lưu/sử dụng tại \${finalVideoPath}\`);

        return {
            success: true,
            frames: base64Frames,
            audio: audioBase64,
            subtitles: subtitlesText
        };

    } catch (err) {
        console.error("Analyze Video Local Error:", err);
        sendToRenderer("tools-log", \`[AI Analyze] Lỗi: \${err.message}\`);
        return { success: false, error: err.message };
    }
});`;

const originalStartIdx = txt.indexOf("ipcMain.handle('analyze-video-local', async (event, payload) => {");
if (originalStartIdx === -1) {
    console.error("Could not find analyze-video-local block!");
    process.exit(1);
}

// Find the end of the block. We know the next IPC handle is 'ai:fetch-html'
const nextHandleIdx = txt.indexOf("ipcMain.handle('ai:fetch-html'", originalStartIdx);
if (nextHandleIdx === -1) {
    console.error("Could not find next handler!");
    process.exit(1);
}

// The block ends right before "// ==== AI: FETCH HTML ===="
let endIdx = txt.lastIndexOf("});", nextHandleIdx);
// Find the exact "});" that ends analyze-video-local
endIdx = endIdx + 3; // include the "});"

const newTxt = txt.substring(0, originalStartIdx) + correctBlock + txt.substring(endIdx);

fs.writeFileSync('c:/Users/Wing386/ai.type/electron/src/main.js', newTxt, 'utf8');
console.log("Successfully replaced block!");
