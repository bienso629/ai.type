const fs = require('fs');
let c = fs.readFileSync('src/main.js', 'utf8');

const progressBlock = `autoUpdater.on('download-progress', (progressObj) => {
        const speed = Math.round(progressObj.bytesPerSecond / 1024);
        const percent = Math.round(progressObj.percent);
        sendToRenderer("tools-log", \`[AutoUpdate] Tốc độ tải: \${speed}KB/s - Đã tải \${percent}%\`);
        
        if (mainWindow && mainWindow.webContents) {
            mainWindow.setProgressBar(progressObj.percent / 100);
            mainWindow.webContents.executeJavaScript(\`
                (function() {
                    let div = document.getElementById('auto-update-progress-overlay');
                    if (!div) {
                        div = document.createElement('div');
                        div.id = 'auto-update-progress-overlay';
                        div.style.cssText = 'position:fixed; bottom:20px; right:20px; width:320px; background:rgba(255,255,255,0.95); border:1px solid #ddd; box-shadow:0 4px 15px rgba(0,0,0,0.2); z-index:99999999; padding:15px; border-radius:8px; font-family:sans-serif; color:#333; transition: all 0.3s ease;';
                        div.innerHTML = "<b>⬇ Đang tải bản cập nhật mới...</b><br><div style='width:100%;background:#e0e0e0;border-radius:5px;margin-top:12px;height:12px;overflow:hidden;'><div id='auto-update-progress-bar' style='width:0%;height:100%;background:#007bff;transition:width 0.2s;'></div></div><div id='auto-update-text' style='margin-top:8px;font-size:13px;text-align:right;color:#555;'>0%</div>";
                        document.body.appendChild(div);
                    }
                    document.getElementById('auto-update-progress-bar').style.width = '\${percent}%';
                    document.getElementById('auto-update-text').innerText = 'Tốc độ: \${speed} KB/s - Đã tải: \${percent}%';
                })();
            \`).catch(err => console.log('inject error', err));
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendToRenderer("tools-log", '[AutoUpdate] Tải hoàn tất! Ứng dụng sẽ được cập nhật.');
        if (mainWindow) {
            mainWindow.setProgressBar(-1);
            mainWindow.webContents.executeJavaScript(\`
                let div = document.getElementById('auto-update-progress-overlay');
                if (div) { div.style.display = 'none'; }
            \`).catch(e=>e);
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

c = c.replace(/autoUpdater\.on\('download-progress'[\s\S]*?autoUpdater\.quitAndInstall\(\);\s*\}\s*\}\);\s*\}\);/, progressBlock);

fs.writeFileSync('src/main.js', c);
