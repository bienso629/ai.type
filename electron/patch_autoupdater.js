const fs = require('fs');
let c = fs.readFileSync('src/main.js', 'utf8');
c = c.replace('autoUpdater.autoDownload = true;', 'autoUpdater.autoDownload = false;');

const newBlock = `autoUpdater.on('update-available', (info) => {
        sendToRenderer("tools-log", \`[AutoUpdate] Tìm thấy phiên bản mới: \${info.version}\`);
        dialog.showMessageBox({
            type: 'info',
            title: 'Cập nhật',
            message: \`Đã có phiên bản mới (\${info.version}). Bạn có muốn tải về không?\`,
            buttons: ['Tải cập nhật', 'Để sau']
        }).then((result) => {
            if (result.response === 0) {
                sendToRenderer("tools-log", '[AutoUpdate] Đang bắt đầu tải...');
                autoUpdater.downloadUpdate();
            }
        });
    });`;

c = c.replace(/autoUpdater\.on\('update-available', \(info\) => \{[\s\S]*?\}\);/, newBlock);
fs.writeFileSync('src/main.js', c);
