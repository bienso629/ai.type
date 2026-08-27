const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function getOperaFfmpegPath() {
    const candidates = [
        '/usr/lib/x86_64-linux-gnu/opera-gx-stable/libffmpeg.so',
        '/usr/lib/x86_64-linux-gnu/opera/libffmpeg.so',
        '/usr/lib/opera-gx/libffmpeg.so',
        '/usr/lib/opera/libffmpeg.so'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return '/usr/lib/x86_64-linux-gnu/opera-gx-stable/libffmpeg.so';
}

function registerOperaCodecHandlers(ipcMain) {
    ipcMain.handle('opera:check-ffmpeg', async () => {
        if (process.platform !== 'linux') {
            return {
                exists: true,
                isProprietary: true,
                platform: process.platform,
                message: 'Windows/macOS đã tích hợp sẵn codec từ hệ điều hành.'
            };
        }
        const targetPath = getOperaFfmpegPath();
        if (!fs.existsSync(targetPath)) {
            return {
                exists: false,
                path: targetPath,
                isProprietary: false,
                size: 0,
                message: 'Chưa tìm thấy file libffmpeg.so của Opera'
            };
        }
        try {
            const stat = fs.statSync(targetPath);
            const sizeMB = stat.size / (1024 * 1024);
            // Stock Opera ffmpeg is ~1.6MB without H.264/AAC. Proprietary ffmpeg is >2.5MB.
            const isProprietary = stat.size >= 2.5 * 1024 * 1024;
            return {
                exists: true,
                path: targetPath,
                isProprietary: isProprietary,
                size: stat.size,
                sizeFormatted: sizeMB.toFixed(2) + ' MB',
                message: isProprietary ? 'Đã cài đặt đầy đủ Codec Video (H.264 / AAC)' : 'Đang dùng codec rút gọn (thiếu H.264/AAC cho TikTok/Facebook)'
            };
        } catch (e) {
            return { exists: false, path: targetPath, isProprietary: false, error: e.message };
        }
    });

    ipcMain.handle('opera:install-ffmpeg', async () => {
        const targetPath = getOperaFfmpegPath();
        const downloadUrl = 'https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/0.115.0/0.115.0-linux-x64.zip';
        const tmpZip = path.join(os.tmpdir(), 'opera_ffmpeg.zip');
        const tmpDir = path.join(os.tmpdir(), 'opera_ffmpeg_ext');

        try {
            execSync(`curl -L "${downloadUrl}" -o "${tmpZip}" && unzip -o "${tmpZip}" -d "${tmpDir}"`, { stdio: 'pipe' });
            const extractedSo = path.join(tmpDir, 'libffmpeg.so');
            if (!fs.existsSync(extractedSo)) {
                throw new Error('Không tìm thấy libffmpeg.so sau khi giải nén');
            }

            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            fs.copyFileSync(extractedSo, targetPath);
            fs.chmodSync(targetPath, 0o644);

            try {
                fs.unlinkSync(tmpZip);
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch (e) {}

            return {
                ok: true,
                path: targetPath,
                message: 'Đã cài đặt thành công thư viện giải mã Video H.264 & AAC cho Opera!'
            };
        } catch (err) {
            return {
                ok: false,
                error: err.message
            };
        }
    });
}

module.exports = {
    registerOperaCodecHandlers,
    getOperaFfmpegPath
};
