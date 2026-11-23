'use strict';

/**
 * Quy trình bảo vệ mã nguồn Electron + Frontend Angular + Python MoCap (đa nền tảng Windows / macOS / Linux):
 * 1. Đóng gói & mã hóa AES-256-GCM toàn bộ thư mục fallback/ (Angular production) + scripts/video_mocap_3d.py
 *    thành 1 tệp nhị phân mã hóa duy nhất dist/vault.bin với khóa 256-bit ngẫu nhiên mỗi lần build.
 *    Khóa này được chia XOR vào dist/_vault-key.js rồi obfuscate + biên dịch V8 Bytecode (.jsc).
 * 2. Chạy javascript-obfuscator cho toàn bộ module Electron Main + type-lite (bỏ qua views/) + preload.js.
 * 3. Biên dịch tất cả module Main + type-lite + vault-loader + _vault-key sang V8 Bytecode (.jsc)
 *    trong MỘT tiến trình Electron duy nhất:
 *    - Windows / Linux: chạy qua ELECTRON_RUN_AS_NODE=1 (nhanh ~2 giây).
 *    - macOS (darwin): chạy trực tiếp trong Electron Main Process (app.whenReady) để không bị
 *      Hardened Runtime của castLabs Electron macOS chặn ELECTRON_RUN_AS_NODE=1.
 * 4. Ghi đè mỗi tệp .js đã biên dịch bằng loader 1 dòng nạp tệp .jsc tương ứng.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const FALLBACK_DIR = path.join(ROOT_DIR, 'fallback');
const MOCAP_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'video_mocap_3d.py');
const OBFUSCATOR_CONFIG_PATH = path.join(ROOT_DIR, '.obfuscatorrc.json');

const MAIN_MODULES = [
    'main.js',
    'vault-loader.js',
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

const MIME_MAP = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf',
    '.py': 'text/x-python; charset=utf-8',
};

const COMPRESSIBLE_EXTS = new Set([
    '.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml', '.py', '.gltf', '.wasm'
]);

function collectFiles(dir, skipDirs = new Set(), filterFn = null, result = []) {
    if (!fs.existsSync(dir)) return result;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!skipDirs.has(entry.name)) {
                collectFiles(fullPath, skipDirs, filterFn, result);
            }
        } else if (entry.isFile()) {
            if (!filterFn || filterFn(fullPath, entry.name)) {
                result.push(fullPath);
            }
        }
    }
    return result;
}

function obfuscateCode(source, options) {
    return JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode();
}

function obfuscateFile(inputPath, outputPath, options) {
    const source = fs.readFileSync(inputPath, 'utf8');
    const obfuscated = obfuscateCode(source, options);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, obfuscated, 'utf8');
}

function buildEncryptedVault(bytecodeObfConfig) {
    if (!fs.existsSync(FALLBACK_DIR)) {
        throw new Error(`Thiếu thư mục Frontend Angular tại ${FALLBACK_DIR}. Hãy chạy "npm run build:frontend" trước.`);
    }

    // Sinh khóa AES-256 ngẫu nhiên mới cho mỗi lần build
    const masterKey = crypto.randomBytes(32);
    const mask = crypto.randomBytes(32);
    const masked = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
        masked[i] = masterKey[i] ^ mask[i];
    }

    // Tạo module dist/_vault-key.js (sẽ được obfuscate + biên dịch sang V8 Bytecode _vault-key.jsc)
    const keySource = [
        "'use strict';",
        `const _a = [${Array.from(masked).join(',')}];`,
        `const _b = [${Array.from(mask).join(',')}];`,
        'function getVaultKey() {',
        '  const out = Buffer.alloc(_a.length);',
        '  for (let i = 0; i < _a.length; i++) out[i] = _a[i] ^ _b[i];',
        '  return out;',
        '}',
        'module.exports = { getVaultKey };',
    ].join('\n');

    const keyDistJs = path.join(DIST_DIR, '_vault-key.js');
    fs.writeFileSync(keyDistJs, obfuscateCode(keySource, bytecodeObfConfig), 'utf8');

    // Thu thập toàn bộ tệp Angular trong fallback/ (bỏ qua .map nếu có) + scripts/video_mocap_3d.py
    const entriesToPack = [];
    const fallbackFiles = collectFiles(FALLBACK_DIR, new Set(), (_full, name) => !name.endsWith('.map'));
    for (const filePath of fallbackFiles) {
        const relKey = path.relative(FALLBACK_DIR, filePath).replace(/\\/g, '/');
        entriesToPack.push({ key: relKey, filePath });
    }

    if (fs.existsSync(MOCAP_SCRIPT_PATH)) {
        entriesToPack.push({ key: '__internal__/video_mocap_3d.py', filePath: MOCAP_SCRIPT_PATH });
    }

    const manifest = {};
    const encryptedChunks = [];
    let currentOffset = 0;

    for (const item of entriesToPack) {
        const raw = fs.readFileSync(item.filePath);
        const ext = path.extname(item.key).toLowerCase();
        let payload = raw;
        let compressed = false;

        if (COMPRESSIBLE_EXTS.has(ext) && raw.length > 128) {
            const deflated = zlib.deflateSync(raw, { level: 6 });
            if (deflated.length < raw.length) {
                payload = deflated;
                compressed = true;
            }
        }

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
        const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
        const tag = cipher.getAuthTag();

        manifest[item.key] = {
            o: currentOffset,
            l: enc.length,
            i: iv.toString('hex'),
            t: tag.toString('hex'),
            c: compressed ? 1 : 0,
            m: MIME_MAP[ext] || 'application/octet-stream',
        };

        encryptedChunks.push(enc);
        currentOffset += enc.length;
    }

    const manifestCompressed = zlib.deflateSync(Buffer.from(JSON.stringify(manifest), 'utf8'), { level: 9 });
    const indexIv = crypto.randomBytes(12);
    const indexCipher = crypto.createCipheriv('aes-256-gcm', masterKey, indexIv);
    const encManifest = Buffer.concat([indexCipher.update(manifestCompressed), indexCipher.final()]);
    const indexTag = indexCipher.getAuthTag();

    const header = Buffer.alloc(36);
    Buffer.from('AIV1', 'ascii').copy(header, 0);
    indexIv.copy(header, 4);
    indexTag.copy(header, 16);
    header.writeUInt32BE(encManifest.length, 32);

    const vaultPath = path.join(DIST_DIR, 'vault.bin');
    const fd = fs.openSync(vaultPath, 'w');
    let totalBytes = 0;
    try {
        fs.writeSync(fd, header);
        totalBytes += header.length;
        fs.writeSync(fd, encManifest);
        totalBytes += encManifest.length;
        for (const chunk of encryptedChunks) {
            fs.writeSync(fd, chunk);
            totalBytes += chunk.length;
        }
    } finally {
        fs.closeSync(fd);
    }

    console.log(
        `[compile-bytecode] Đã mã hóa ${entriesToPack.length} tệp (Angular + MoCap) -> dist/vault.bin (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`
    );

    return keyDistJs;
}

function batchCompileToBytecode(jsFiles, electronPath) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitype-v8-batch-'));
    const jobsPath = path.join(tmpDir, 'jobs.json');
    const compilerScriptPath = path.join(tmpDir, 'batch-compiler.js');

    const jobs = jsFiles.map((jsPath) => ({
        input: jsPath,
        output: jsPath.replace(/\.js$/, '.jsc'),
    }));
    fs.writeFileSync(jobsPath, JSON.stringify(jobs), 'utf8');

    const isDarwin = process.platform === 'darwin';

    // Trên macOS: chạy bên trong Electron Main Process thực (app.whenReady) để vượt qua Hardened Runtime
    // chặn ELECTRON_RUN_AS_NODE=1 trên castLabs Electron macOS.
    // Trên Windows / Linux: chạy nhanh với ELECTRON_RUN_AS_NODE=1 (không cần X11 / GUI).
    const compilerCore = `
const fs = require('fs');
const Module = require('module');
const vm = require('vm');
const v8 = require('v8');

v8.setFlagsFromString('--no-lazy');
v8.setFlagsFromString('--no-flush-bytecode');

function compileAll() {
    const jobs = JSON.parse(fs.readFileSync(${JSON.stringify(jobsPath)}, 'utf8'));
    for (const job of jobs) {
        const raw = fs.readFileSync(job.input, 'utf8').replace(/^#!.*/, '');
        const wrapped = Module.wrap(raw);
        const script = new vm.Script(wrapped, { produceCachedData: true });
        const buf = typeof script.createCachedData === 'function' ? script.createCachedData() : script.cachedData;
        if (!buf || buf.length === 0) {
            throw new Error('Empty V8 bytecode generated for: ' + job.input);
        }
        fs.writeFileSync(job.output, buf);
    }
}
`;

    const runnerScript = isDarwin
        ? `${compilerCore}
const { app } = require('electron');
if (typeof app.disableHardwareAcceleration === 'function') app.disableHardwareAcceleration();
app.whenReady().then(() => {
    try {
        compileAll();
        app.exit(0);
    } catch (err) {
        process.stderr.write(String((err && err.stack) || err) + '\\n');
        app.exit(1);
    }
});
`
        : `${compilerCore}
try {
    compileAll();
    process.exit(0);
} catch (err) {
    process.stderr.write(String((err && err.stack) || err) + '\\n');
    process.exit(1);
}
`;

    fs.writeFileSync(compilerScriptPath, runnerScript, 'utf8');

    const env = Object.assign({}, process.env);
    let args;
    if (isDarwin) {
        delete env.ELECTRON_RUN_AS_NODE;
        args = ['--no-sandbox', '--user-data-dir=' + path.join(tmpDir, 'userdata'), compilerScriptPath];
    } else {
        env.ELECTRON_RUN_AS_NODE = '1';
        args = [compilerScriptPath];
    }

    try {
        const res = spawnSync(electronPath, args, {
            env,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            timeout: 180000,
        });

        if (res.error) {
            throw res.error;
        }
        if (res.status !== 0) {
            throw new Error(
                `Biên dịch V8 Bytecode thất bại (platform=${process.platform}, exit=${res.status}, signal=${res.signal}):\n${(res.stderr || res.stdout || '').trim()}`
            );
        }

        // Kiểm tra file .jsc và ghi đè .js gốc bằng loader 1 dòng
        for (const job of jobs) {
            if (!fs.existsSync(job.output) || fs.statSync(job.output).size === 0) {
                throw new Error(`Thiếu tệp bytecode đầu ra: ${job.output}`);
            }
            const baseName = path.basename(job.input, '.js');
            const loaderCode = `'use strict';require('bytenode');module.exports=require('./${baseName}.jsc');\n`;
            fs.writeFileSync(job.input, loaderCode, 'utf8');
        }
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
}

async function run() {
    const baseConfig = JSON.parse(fs.readFileSync(OBFUSCATOR_CONFIG_PATH, 'utf8'));
    const bytecodeObfConfig = { ...baseConfig, selfDefending: false };
    const preloadObfConfig = { ...baseConfig, selfDefending: true };

    const electronPath = require('electron');
    if (typeof electronPath !== 'string' || !fs.existsSync(electronPath)) {
        throw new Error(`Không tìm thấy tệp thực thi Electron để biên dịch bytecode: ${String(electronPath)}`);
    }

    fs.mkdirSync(DIST_DIR, { recursive: true });
    console.log(`[compile-bytecode] Platform=${process.platform}, Electron V8=${electronPath}`);

    // 1) Đóng gói & mã hóa AES-256-GCM Frontend Angular + video_mocap_3d.py -> dist/vault.bin + dist/_vault-key.js
    const vaultKeyJs = buildEncryptedVault(bytecodeObfConfig);

    // 2) Obfuscate preload.js -> dist/preload.js (giữ dạng JS obfuscate cho Renderer preload)
    const preloadSrc = path.join(ROOT_DIR, 'preload.js');
    const preloadDist = path.join(DIST_DIR, 'preload.js');
    obfuscateFile(preloadSrc, preloadDist, preloadObfConfig);
    console.log('[compile-bytecode] Obfuscated dist/preload.js');

    // 3) Obfuscate toàn bộ module chính trong src/
    const toCompile = [vaultKeyJs];
    for (const relName of MAIN_MODULES) {
        const srcPath = path.join(SRC_DIR, relName);
        const distPath = path.join(DIST_DIR, relName);
        if (!fs.existsSync(srcPath)) {
            throw new Error(`Thiếu module nguồn bắt buộc: ${srcPath}`);
        }
        obfuscateFile(srcPath, distPath, bytecodeObfConfig);
        toCompile.push(distPath);
    }

    // 4) Obfuscate toàn bộ src/type-lite/**/*.js (bỏ qua views/ là JS trình duyệt)
    const typeLiteSrcDir = path.join(SRC_DIR, 'type-lite');
    const typeLiteDistDir = path.join(DIST_DIR, 'type-lite');
    fs.mkdirSync(typeLiteDistDir, { recursive: true });

    for (const srcJs of collectFiles(typeLiteSrcDir, new Set(['views']), (_f, n) => n.endsWith('.js'))) {
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

    // 5) Biên dịch toàn bộ sang V8 Bytecode (.jsc) trong 1 tiến trình Electron duy nhất
    console.log(`[compile-bytecode] Đang biên dịch ${toCompile.length} module sang V8 Bytecode (.jsc)...`);
    batchCompileToBytecode(toCompile, electronPath);
    console.log(`[compile-bytecode] Hoàn tất: ${toCompile.length} tệp .jsc + dist/preload.js + dist/vault.bin`);
}

run().catch((err) => {
    console.error('[compile-bytecode] LỖI:', err);
    process.exit(1);
});
