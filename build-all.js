const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Terminal colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
};

function logHeader(text) {
    console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  ${text}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

function logStep(stepNum, totalSteps, title) {
    console.log(`\n${colors.bright}${colors.magenta}[${stepNum}/${totalSteps}] ⏳ ${title}...${colors.reset}\n`);
}

function logSuccess(text) {
    console.log(`${colors.bright}${colors.green}✔ ${text}${colors.reset}`);
}

function logError(text) {
    console.error(`${colors.bright}${colors.red}✖ ${text}${colors.reset}`);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)));
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${(ms / 1000).toFixed(1)}s`;
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        console.log(`${colors.yellow}> ${command} ${args.join(' ')}${colors.reset}\n`);
        
        const proc = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        proc.on('close', (code) => {
            const duration = Date.now() - startTime;
            if (code === 0) {
                resolve({ code, duration });
            } else {
                reject(new Error(`Command "${command} ${args.join(' ')}" failed with exit code ${code}`));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

async function main() {
    const rootDir = __dirname;
    const electronDir = path.join(rootDir, 'electron');
    const rootPkg = require('./package.json');

    const args = process.argv.slice(2);
    const isWinOnly = args.includes('--win') || args.includes('--windows');
    const isLinuxOnly = args.includes('--linux') || args.includes('--ubuntu');
    const isMacOnly = args.includes('--mac') || args.includes('--macos');
    const skipFrontend = args.includes('--skip-frontend') || args.includes('--skip-ng');
    const shouldPublish = args.includes('--publish');

    let targetFlags = [];
    let targetNames = [];

    if (isWinOnly) {
        targetFlags.push('--win');
        targetNames.push('Windows (.exe)');
    } else if (isLinuxOnly) {
        targetFlags.push('--linux');
        targetNames.push('Ubuntu/Linux (.deb, .AppImage)');
    } else if (isMacOnly) {
        targetFlags.push('--mac');
        targetNames.push('macOS (.zip)');
    } else {
        targetFlags = ['--win', '--linux', '--mac'];
        targetNames = ['Windows (.exe)', 'Ubuntu/Linux (.deb, .AppImage)', 'macOS (.zip)'];
    }

    if (shouldPublish) {
        targetFlags.push('--publish', 'always');
    } else {
        targetFlags.push('--publish', 'never');
    }

    const totalSteps = skipFrontend ? 2 : 3;
    let currentStep = 1;
    const buildStartTime = Date.now();

    logHeader(`🚀 AI.Type Build System - Version ${rootPkg.version}`);
    console.log(`${colors.bright}Mục tiêu build:${colors.reset} ${targetNames.join(', ')}`);
    console.log(`${colors.bright}Đường dẫn thư mục gốc:${colors.reset} ${rootDir}`);
    console.log(`${colors.bright}Đường dẫn electron:${colors.reset} ${electronDir}\n`);

    try {
        // BƯỚC 1: Build Angular Frontend
        if (!skipFrontend) {
            logStep(currentStep++, totalSteps, 'Biên dịch Angular Frontend (Production Mode)');
            const ngRes = await runCommand('npx', ['ng', 'build', '--configuration=production'], { cwd: rootDir });
            logSuccess(`Angular build hoàn tất (${formatDuration(ngRes.duration)})`);
        }

        // BƯỚC 2: Làm rối mã nguồn Electron (Obfuscate)
        logStep(currentStep++, totalSteps, 'Bảo vệ và làm rối mã nguồn Backend Electron (Obfuscate)');
        const obfRes = await runCommand('npm', ['run', 'obfuscate'], { cwd: electronDir });
        logSuccess(`Obfuscate hoàn tất (${formatDuration(obfRes.duration)})`);

        // BƯỚC 3: Đóng gói Electron App
        logStep(currentStep++, totalSteps, `Đóng gói ứng dụng Electron (${targetNames.join(', ')})`);
        const builderRes = await runCommand('npx', ['electron-builder', ...targetFlags], { cwd: electronDir });
        logSuccess(`Đóng gói Electron hoàn tất (${formatDuration(builderRes.duration)})`);

        // TỔNG KẾT VÀ LIỆT KÊ TỆP ĐẦU RA
        const totalDuration = Date.now() - buildStartTime;
        const distDir = path.join(electronDir, 'dist');

        logHeader(`🎉 BUILD THÀNH CÔNG TẤT CẢ NỀN TẢNG (${formatDuration(totalDuration)})`);

        if (fs.existsSync(distDir)) {
            const files = fs.readdirSync(distDir);
            const installerExts = ['.exe', '.deb', '.appimage', '.zip', '.dmg', '.rpm'];
            const outputFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return installerExts.includes(ext) && !file.includes('uninstaller') && !file.endsWith('.blockmap');
            });

            console.log(`${colors.bright}${colors.green}Danh sách bản cài đặt đã tạo trong electron/dist/:${colors.reset}`);
            console.log('───────────────────────────────────────────────────────────────────');
            
            outputFiles.forEach(file => {
                const filePath = path.join(distDir, file);
                const stat = fs.statSync(filePath);
                const sizeStr = formatBytes(stat.size);
                console.log(` 📦 ${colors.bright}${file.padEnd(35)}${colors.reset} | ${colors.yellow}${sizeStr.padStart(10)}${colors.reset}`);
            });
            console.log('───────────────────────────────────────────────────────────────────\n');
            console.log(`📂 Thư mục chứa file build: ${colors.cyan}${distDir}${colors.reset}\n`);
        }

    } catch (error) {
        console.error('\n');
        logError(`Quá trình build thất bại: ${error.message}`);
        process.exit(1);
    }
}

main();
