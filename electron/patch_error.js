const fs = require('fs');
let c = fs.readFileSync('src/main.js', 'utf8');

const errBlock = `autoUpdater.on('error', (err) => {
        sendToRenderer("tools-log", \`[AutoUpdate] Lỗi kiểm tra cập nhật: \${err.message}\`);
        if (mainWindow && mainWindow.webContents) {
            let safeError = (err.message || '').replace(/'/g, '"').replace(/\\n/g, ' ');
            mainWindow.webContents.executeJavaScript(\`
                (function(){
                    let div = document.getElementById('auto-update-progress-overlay');
                    if (div) { 
                        div.innerHTML = "<b>❌ Lỗi tải cập nhật!</b><br><span style='font-size:12px;color:red;'>\${safeError}</span><br><br>Vui lòng kiểm tra lại file latest.yml và file .exe trên server xem mã hash đã khớp chưa."; 
                    }
                })();
            \`).catch(e=>e);
        }
    });`;

// Replace the buggy error block I just added.
c = c.replace(/autoUpdater\.on\('error', \(err\) => \{[\s\S]*?\}\);/, errBlock);

fs.writeFileSync('src/main.js', c);
