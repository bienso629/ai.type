const fs = require('fs');
let c = fs.readFileSync('src/main.js', 'utf8');

const progressBlock = `autoUpdater.on('download-progress', (progressObj) => {
        const speed = Math.round(progressObj.bytesPerSecond / 1024);
        const percent = Math.round(progressObj.percent);
        sendToRenderer("tools-log", \`[AutoUpdate] Tốc độ tải: \${speed}KB/s - Đã tải \${percent}%\`);
        if (mainWindow) {
            mainWindow.setProgressBar(progressObj.percent / 100);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendToRenderer("tools-log", '[AutoUpdate] Tải hoàn tất! Ứng dụng sẽ được cập nhật.');
        if (mainWindow) {
            mainWindow.setProgressBar(-1);
        }
        dialog.showMessageBox({
            type: 'info',
            title: 'Cập nhật phần mềm',
            message: \`Đã tải xong phiên bản mới (\${info.version}). Bạn có muốn cài đặt và khởi động lại ngay bây giờ?\`,
            buttons: ['Cài đặt ngay', 'Để sau']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });`;

// We replace the two existing listeners. First we remove them or just replace them.
// Let's use a regex to replace the download-progress and update-downloaded blocks.
c = c.replace(/autoUpdater\.on\('download-progress'[\s\S]*?autoUpdater\.quitAndInstall\(\);\s*\}\s*\}\);\s*\}\);/, progressBlock);

fs.writeFileSync('src/main.js', c);
