'use strict';

/**
 * Quy trình bảo vệ mã nguồn Electron Main Process (đa nền tảng Windows / macOS / Linux):
 * 1. Chạy javascript-obfuscator cho tất cả module Electron Main + type-lite + preload.js.
 * 2. Biên dịch toàn bộ module Electron Main + type-lite từ JS đã obfuscate sang V8 Bytecode (.jsc)
 *    bằng bytenode chạy đúng runtime V8 của bản Electron đi kèm (ELECTRON_RUN_AS_NODE=1).
 * 3. Ghi đè mỗi tệp .js đã biên dịch bằng loader 1 dòng nạp tệp .jsc tương ứng để giữ nguyên
 *    100% tương thích với mọi lệnh require('./...') (kể cả có đuôi .js).
 *    Riêng dist/preload.js giữ dạng JS đã obfuscate (không dùng .jsc) để tương thích context Renderer.
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const bytenode = require('bytenode');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OBFUSCATOR_CONFIG_PATH = path.join(ROOT_DIR, '.obfuscatorrc.json');

const MAIN_MODULES = [
    'main.js',
    'mcp-client.js',
    'local-cli-agent.js',
    'export-import-project.js',
    'project-store.js',
    'local-articles.js',
    'local-profiles.js',
    'glb-sanitizer.js',
    'design-presets.js',
    'fonts.js',
    'workspace-folders.js',
    'database.js',
    'opera-codec.js',
    'edge-tts-v2.js',
    'extract_frame.js'
];

function collectJsFiles(dir, skipDirs = new Set(), result = []) {
    if (!fs.existsSync(dir)) return result;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!skipDirs.has(entry.name)) {
                collectJsFiles(fullPath, skipDirs, result);
            }
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            result.push(fullPath);
        }
    }
    return result;
}

function obfuscateFile(inputPath, outputPath, options) {
    const source = fs.readFileSync(inputPath, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, obfuscated, 'utf8');
}

async function compileJsToBytecodeWithLoader(jsFilePath, electronPath) {
    const baseName = path.basename(jsFilePath, '.js');
    const jscPath = path.join(path.dirname(jsFilePath), `${baseName}.jsc`);

    await bytenode.compileFile({
        filename: jsFilePath,
        output: jscPath,
        electron: true,
        electronPath
    });

    if (!fs.existsSync(jscPath) || fs.statSync(jscPath).size === 0) {
        throw new Error(`Biên dịch bytecode thất bại (tệp rỗng): ${jscPath}`);
    }

    // Thay thế tệp .js bằng loader 1 dòng để mọi require('./foo') và require('./foo.js') đều chạy .jsc
    const loaderCode = `'use strict';require('bytenode');module.exports=require('./${baseName}.jsc');\n`;
    fs.writeFileSync(jsFilePath, loaderCode, 'utf8');
}

async function run() {
    const baseConfig = JSON.parse(fs.readFileSync(OBFUSCATOR_CONFIG_PATH, 'utf8'));
    // selfDefending dùng Function.prototype.toString() vốn không tương thích V8 bytecode (.jsc)
    const bytecodeObfConfig = { ...baseConfig, selfDefending: false };
    // Riêng preload.js giữ dạng JS đã obfuscate nên bật selfDefending bình thường
    const preloadObfConfig = { ...baseConfig, selfDefending: true };

    const electronPath = require('electron');
    if (typeof electronPath !== 'string' || !fs.existsSync(electronPath)) {
        throw new Error(`Không tìm thấy tệp thực thi Electron để biên dịch bytecode: ${String(electronPath)}`);
    }

    fs.mkdirSync(DIST_DIR, { recursive: true });

    console.log(`[compile-bytecode] Sử dụng Electron V8 tại: ${electronPath}`);

    // 1) Obfuscate preload.js -> dist/preload.js (giữ dạng JS obfuscate cho Renderer preload)
    const preloadSrc = path.join(ROOT_DIR, 'preload.js');
    const preloadDist = path.join(DIST_DIR, 'preload.js');
    obfuscateFile(preloadSrc, preloadDist, preloadObfConfig);
    console.log('[compile-bytecode] Obfuscated dist/preload.js');

    // 2) Obfuscate + biên dịch V8 bytecode cho tất cả module chính trong src/
    const toCompile = [];
    for (const relName of MAIN_MODULES) {
        const srcPath = path.join(SRC_DIR, relName);
        const distPath = path.join(DIST_DIR, relName);
        if (!fs.existsSync(srcPath)) {
            throw new Error(`Thiếu module nguồn bắt buộc: ${srcPath}`);
        }
        obfuscateFile(srcPath, distPath, bytecodeObfConfig);
        toCompile.push(distPath);
    }

    // 3) Obfuscate + biên dịch V8 bytecode cho toàn bộ src/type-lite/**/*.js (bỏ qua views/ là JS trình duyệt)
    const typeLiteSrcDir = path.join(SRC_DIR, 'type-lite');
    const typeLiteDistDir = path.join(DIST_DIR, 'type-lite');
    fs.mkdirSync(typeLiteDistDir, { recursive: true });

    for (const srcJs of collectJsFiles(typeLiteSrcDir, new Set(['views']))) {
        const rel = path.relative(typeLiteSrcDir, srcJs);
        const distJs = path.join(typeLiteDistDir, rel);
        obfuscateFile(srcJs, distJs, bytecodeObfConfig);
        toCompile.push(distJs);
    }

    // Copy views của type-lite (HTML/CSS/JS trình duyệt — giữ nguyên không biên dịch .jsc)
    const viewsSrc = path.join(typeLiteSrcDir, 'views');
    const viewsDist = path.join(typeLiteDistDir, 'views');
    if (fs.existsSync(viewsSrc)) {
        fs.rmSync(viewsDist, { recursive: true, force: true });
        fs.cpSync(viewsSrc, viewsDist, { recursive: true, force: true });
    }

    // 4) Biên dịch tuần tự sang V8 Bytecode (.jsc) bằng đúng binary Electron hiện tại
    console.log(`[compile-bytecode] Đang biên dịch ${toCompile.length} module sang V8 Bytecode (.jsc)...`);
    for (const jsPath of toCompile) {
        const rel = path.relative(DIST_DIR, jsPath);
        await compileJsToBytecodeWithLoader(jsPath, electronPath);
        console.log(`[compile-bytecode] Compiled dist/${rel.replace(/\.js$/, '.jsc')}`);
    }

    console.log(`[compile-bytecode] Hoàn tất: ${toCompile.length} tệp .jsc + dist/preload.js`);
}

run().catch((err) => {
    console.error('[compile-bytecode] LỖI:', err);
    process.exit(1);
});
