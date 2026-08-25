const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '🚀 [AI.Type] Khởi động Angular Frontend (ng serve)...');

// 1. Khởi chạy Angular
const ngProcess = spawn('npx', ['ng', 'serve'], {
    cwd: __dirname,
    stdio: 'inherit',
    detached: process.platform !== 'win32'
});

let electronStarted = false;
let electronProcess = null;

// 2. Thăm dò localhost:4200
function checkAngularReady() {
    if (electronStarted) return;

    http.get('http://localhost:4200', (res) => {
        if (!electronStarted) {
            electronStarted = true;
            console.log('\n\x1b[32m%s\x1b[0m\n', '✅ [AI.Type] Angular đã sẵn sàng! Đang tự động mở Electron...');
            startElectron();
        }
    }).on('error', () => {
        setTimeout(checkAngularReady, 1000);
    });
}

// Bắt đầu thăm dò sau 2 giây
setTimeout(checkAngularReady, 2000);

// 3. Khởi chạy Electron
function startElectron() {
    electronProcess = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, 'electron'),
        stdio: 'inherit',
        detached: process.platform !== 'win32'
    });

    electronProcess.on('exit', (code) => {
        console.log(`[AI.Type] Electron đã đóng (mã thoát: ${code}).`);
    });
}

// 4. Dọn dẹp tiến trình khi nhấn Ctrl+C
function cleanup() {
    console.log('\n\x1b[33m%s\x1b[0m', '🛑 [AI.Type] Đang dừng toàn bộ tiến trình...');
    if (electronProcess) {
        try {
            if (process.platform !== 'win32' && electronProcess.pid) {
                process.kill(-electronProcess.pid, 'SIGINT');
            } else {
                electronProcess.kill('SIGINT');
            }
        } catch (e) {}
    }
    if (ngProcess) {
        try {
            if (process.platform !== 'win32' && ngProcess.pid) {
                process.kill(-ngProcess.pid, 'SIGINT');
            } else {
                ngProcess.kill('SIGINT');
            }
        } catch (e) {}
    }
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
