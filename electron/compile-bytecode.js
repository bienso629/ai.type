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
const NATIVE_VAULT_DIR = path.join(ROOT_DIR, 'native', 'vault-core');
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

function parseSemverTuple(verStr) {
    const m = String(verStr || '0.0.0').match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function compareSemverDesc(a, b) {
    for (let i = 0; i < 3; i++) {
        if (b[i] !== a[i]) return b[i] - a[i];
    }
    return 0;
}

function resolveBestNodeGyp() {
    const candidates = [];
    if (process.env.NODE_GYP_BIN && fs.existsSync(process.env.NODE_GYP_BIN)) {
        candidates.push(process.env.NODE_GYP_BIN);
    }

    // 1. Kiểm tra global node-gyp (ví dụ npm install -g node-gyp@latest trên CI)
    try {
        const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const gRoot = spawnSync(npmBin, ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 10000 });
        if (gRoot.status === 0 && gRoot.stdout) {
            const gPath = path.join(gRoot.stdout.trim(), 'node-gyp', 'bin', 'node-gyp.js');
            if (fs.existsSync(gPath)) candidates.push(gPath);
        }
    } catch (_) {}

    // 2. Kiểm tra node-gyp đi kèm sẵn với npm của Node.js (v11+ trên Node 22)
    const nodeDir = path.dirname(process.execPath);
    const bundledCandidates = [
        path.join(nodeDir, 'node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
        path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
        path.join(ROOT_DIR, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
        path.join(ROOT_DIR, '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
    ];
    for (const p of bundledCandidates) {
        if (fs.existsSync(p)) candidates.push(p);
    }

    const unique = Array.from(new Set(candidates.map((p) => path.resolve(p))));
    const scored = unique.map((binPath) => {
        let ver = '0.0.0';
        try {
            const pkgPath = path.resolve(path.dirname(binPath), '..', 'package.json');
            ver = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '0.0.0';
        } catch (_) {}
        return { binPath, ver, tuple: parseSemverTuple(ver) };
    });

    scored.sort((a, b) => compareSemverDesc(a.tuple, b.tuple));
    return scored.length > 0 ? scored[0] : null;
}

function tryCompileMsvcDirect(destAddon, env) {
    if (process.platform !== 'win32') return false;
    const nodeVer = process.versions.node;
    const cacheRoots = [
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'node-gyp', 'Cache', nodeVer) : '',
        path.join(os.homedir(), 'AppData', 'Local', 'node-gyp', 'Cache', nodeVer),
        path.join(os.homedir(), '.cache', 'node-gyp', nodeVer),
    ].filter(Boolean);

    const cacheDir = cacheRoots.find((d) => fs.existsSync(path.join(d, 'include', 'node', 'node_api.h')));
    if (!cacheDir) return false;

    const archSub = process.arch === 'arm64' ? 'win-arm64' : (process.arch === 'ia32' ? 'win-x86' : 'win-x64');
    const nodeLib = path.join(cacheDir, archSub, 'node.lib');
    const includeDir = path.join(cacheDir, 'include', 'node');
    if (!fs.existsSync(nodeLib)) return false;

    const srcFile = path.join(NATIVE_VAULT_DIR, 'src', 'vault_core.cc');
    const objOut = path.join(NATIVE_VAULT_DIR, 'build', 'vault_core.obj');
    fs.mkdirSync(path.dirname(objOut), { recursive: true });

    console.log(`[compile-bytecode] Thử biên dịch trực tiếp bằng MSVC cl.exe (${archSub})...`);
    const clRes = spawnSync('cl.exe', [
        '/nologo', '/LD', '/O2', '/MD', '/GR-', '/std:c++17',
        '/DNAPI_VERSION=8',
        '/DNAPI_DISABLE_CPP_EXCEPTIONS',
        '/DNODE_GYP_MODULE_NAME=vault_core',
        '/DBUILDING_NODE_EXTENSION',
        '/D_CRT_SECURE_NO_WARNINGS',
        `/I${includeDir}`,
        `/Fo${objOut}`,
        srcFile,
        nodeLib,
        `/Fe:${destAddon}`,
        '/link', '/DEBUG:NONE', '/OPT:REF', '/OPT:ICF'
    ], {
        cwd: NATIVE_VAULT_DIR,
        env,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 180000,
    });

    if (clRes.error || clRes.status !== 0 || !fs.existsSync(destAddon)) {
        const detail = clRes.error ? clRes.error.message : ((clRes.stderr || '') + '\n' + (clRes.stdout || '')).trim();
        console.warn(`[compile-bytecode] MSVC cl.exe fallback thất bại: ${detail}`);
        return false;
    }
    // Dọn tệp phụ .lib/.exp do MSVC linker tạo cạnh .node
    for (const ext of ['.lib', '.exp']) {
        const sideFile = destAddon.replace(/\.node$/i, ext);
        try { if (fs.existsSync(sideFile)) fs.unlinkSync(sideFile); } catch (_) {}
    }
    return true;
}

function compileNativeVaultCore(masterKey) {
    if (!fs.existsSync(path.join(NATIVE_VAULT_DIR, 'binding.gyp'))) {
        return null;
    }

    // Sinh bảng hoán vị ngẫu nhiên 0..31 và 4 lớp mask (XOR/ADD/XOR/SALT) để khóa 256-bit chỉ tồn tại trong mã máy C++
    const perm = Array.from({ length: 32 }, (_, i) => i);
    for (let i = 31; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const m0 = Buffer.alloc(32);
    const m1 = crypto.randomBytes(32);
    const m2 = crypto.randomBytes(32);
    const m3 = crypto.randomBytes(32);

    for (let i = 0; i < 32; i++) {
        const idx = perm[i];
        const s = (i * 73 + 0x5A) & 0xFF;
        const b = masterKey[i] ^ m3[idx] ^ s;
        const a = (b + m2[idx]) & 0xFF;
        m0[idx] = a ^ m1[idx];
    }

    const fmtArr = (arr) => Array.from(arr).map((v) => '0x' + v.toString(16).padStart(2, '0')).join(',');
    const headerPath = path.join(NATIVE_VAULT_DIR, 'src', 'vault_key_gen.h');
    const buildDir = path.join(NATIVE_VAULT_DIR, 'build');
    const destAddon = path.join(DIST_DIR, 'vault_core.node');
    const headerSrc = [
        '#pragma once',
        '#include <stdint.h>',
        `static const uint8_t VAULT_K_PERM[32] = {${fmtArr(perm)}};`,
        `static const uint8_t VAULT_K_M0[32] = {${fmtArr(m0)}};`,
        `static const uint8_t VAULT_K_M1[32] = {${fmtArr(m1)}};`,
        `static const uint8_t VAULT_K_M2[32] = {${fmtArr(m2)}};`,
        `static const uint8_t VAULT_K_M3[32] = {${fmtArr(m3)}};`,
        ''
    ].join('\n');

    fs.writeFileSync(headerPath, headerSrc, 'utf8');

    try {
        const bestGyp = resolveBestNodeGyp();
        if (!bestGyp) {
            throw new Error('Không tìm thấy node-gyp trong hệ thống hoặc node_modules.');
        }

        const env = Object.assign({}, process.env);
        delete env.NODE_OPTIONS;

        console.log(`[compile-bytecode] Đang biên dịch module native C++ N-API (vault_core.node) bằng node-gyp@${bestGyp.ver}...`);
        const res = spawnSync(process.execPath, [bestGyp.binPath, 'rebuild', '--release'], {
            cwd: NATIVE_VAULT_DIR,
            env,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            timeout: 180000,
        });

        let compiledOk = false;
        if (!res.error && res.status === 0) {
            const builtAddon = path.join(buildDir, 'Release', 'vault_core.node');
            if (fs.existsSync(builtAddon)) {
                fs.copyFileSync(builtAddon, destAddon);
                compiledOk = true;
            }
        }

        if (!compiledOk && process.platform === 'win32') {
            compiledOk = tryCompileMsvcDirect(destAddon, env);
        }

        if (!compiledOk) {
            const detail = res.error ? res.error.message : ((res.stderr || '') + '\n' + (res.stdout || '')).trim();
            throw new Error(`node-gyp@${bestGyp.ver} rebuild thất bại (status=${res.status}):\n${detail}`);
        }

        // Strip thêm ký hiệu cục bộ trên Linux/macOS nếu có công cụ strip
        if (process.platform === 'linux') {
            spawnSync('strip', ['--strip-unneeded', destAddon], { encoding: 'utf8' });
        } else if (process.platform === 'darwin') {
            spawnSync('strip', ['-x', destAddon], { encoding: 'utf8' });
        }

        // Tự kiểm tra giải mã AES-256-GCM trực tiếp qua mã máy C++ vừa biên dịch
        const probePlain = Buffer.from('AI.TYPE-NATIVE-C++-VAULT-VERIFICATION-2026', 'utf8');
        const probeIv = crypto.randomBytes(12);
        const probeCipher = crypto.createCipheriv('aes-256-gcm', masterKey, probeIv);
        const probeEnc = Buffer.concat([probeCipher.update(probePlain), probeCipher.final()]);
        const probeTag = probeCipher.getAuthTag();

        delete require.cache[require.resolve(destAddon)];
        const nativeMod = require(destAddon);
        const probeDec = nativeMod.decryptChunk(probeEnc, probeIv, probeTag, false);
        if (!Buffer.isBuffer(probeDec) || !probeDec.equals(probePlain)) {
            throw new Error('Self-test giải mã native vault_core.node không khớp!');
        }

        const addonStat = fs.statSync(destAddon);
        console.log(
            `[compile-bytecode] Đã biên dịch & xác minh native C++ dist/vault_core.node (${(addonStat.size / 1024).toFixed(1)} KB, N-API ABI v8)`
        );
        return destAddon;
    } catch (err) {
        if (process.env.REQUIRE_NATIVE_VAULT === '1') {
            throw err;
        }
        console.warn(`[compile-bytecode] Cảnh báo: không biên dịch được native vault_core.node (${err.message}). Fallback sang _vault-key.jsc.`);
        return null;
    } finally {
        // Xóa ngay tệp header sinh khóa tạm và thư mục build trung gian (.o/.obj)
        try { if (fs.existsSync(headerPath)) fs.unlinkSync(headerPath); } catch (_) {}
        try { if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true }); } catch (_) {}
    }
}

function buildEncryptedVault(bytecodeObfConfig) {
    if (!fs.existsSync(FALLBACK_DIR)) {
        throw new Error(`Thiếu thư mục Frontend Angular tại ${FALLBACK_DIR}. Hãy chạy "npm run build:frontend" trước.`);
    }

    // Sinh khóa AES-256 ngẫu nhiên mới cho mỗi lần build
    const masterKey = crypto.randomBytes(32);

    // Ưu tiên biên dịch khóa + bộ giải mã AES-256-GCM vào module native C++ dist/vault_core.node
    const nativeAddonPath = compileNativeVaultCore(masterKey);
    const keyDistJs = path.join(DIST_DIR, '_vault-key.js');
    const keyDistJsc = path.join(DIST_DIR, '_vault-key.jsc');

    let fallbackKeyJs = null;
    if (nativeAddonPath) {
        // Xóa sạch _vault-key.js / .jsc cũ — khóa hoàn toàn không tồn tại dưới dạng JS/V8 bytecode
        try { if (fs.existsSync(keyDistJs)) fs.unlinkSync(keyDistJs); } catch (_) {}
        try { if (fs.existsSync(keyDistJsc)) fs.unlinkSync(keyDistJsc); } catch (_) {}
    } else {
        const mask = crypto.randomBytes(32);
        const masked = Buffer.alloc(32);
        for (let i = 0; i < 32; i++) {
            masked[i] = masterKey[i] ^ mask[i];
        }
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
        fs.writeFileSync(keyDistJs, obfuscateCode(keySource, bytecodeObfConfig), 'utf8');
        fallbackKeyJs = keyDistJs;
    }

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
        `[compile-bytecode] Đã mã hóa ${entriesToPack.length} tệp (Angular + MoCap) -> dist/vault.bin (${(totalBytes / 1024 / 1024).toFixed(2)} MB) [engine=${nativeAddonPath ? 'native-cpp-napi' : 'v8-bytecode-fallback'}]`
    );

    return fallbackKeyJs;
}

function runSingleCompileAttempt(electronPath, mode, compilerCore, tmpDir) {
    const compilerScriptPath = path.join(tmpDir, `batch-compiler-${mode}.js`);
    const runnerScript = mode === 'main'
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
    // Tránh NODE_OPTIONS của bước build Angular (--max-old-space-size) làm lỗi V8 của Electron
    delete env.NODE_OPTIONS;

    let args;
    if (mode === 'main') {
        delete env.ELECTRON_RUN_AS_NODE;
        args = ['--no-sandbox', '--user-data-dir=' + path.join(tmpDir, 'userdata'), compilerScriptPath];
    } else {
        env.ELECTRON_RUN_AS_NODE = '1';
        args = [compilerScriptPath];
    }

    return spawnSync(electronPath, args, {
        env,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 180000,
    });
}

function batchCompileToBytecode(jsFiles, electronPath) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitype-v8-batch-'));
    const jobsPath = path.join(tmpDir, 'jobs.json');

    const jobs = jsFiles.map((jsPath) => ({
        input: jsPath,
        output: jsPath.replace(/\.js$/, '.jsc'),
    }));
    fs.writeFileSync(jobsPath, JSON.stringify(jobs), 'utf8');

    const isDarwin = process.platform === 'darwin';

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

    try {
        let res = runSingleCompileAttempt(electronPath, 'node', compilerCore, tmpDir);

        if (isDarwin && (res.error || res.status !== 0)) {
            console.warn(
                `[compile-bytecode] macOS attempt 1 (ELECTRON_RUN_AS_NODE) failed (status=${res.status}, signal=${res.signal}): ${(res.stderr || res.stdout || '').trim()}`
            );

            // Thử ký lại ad-hoc cho Electron.app trên Apple Silicon rồi thử lại ELECTRON_RUN_AS_NODE
            const appIdx = electronPath.indexOf('.app');
            if (appIdx !== -1) {
                const appBundle = electronPath.slice(0, appIdx + 4);
                spawnSync('codesign', ['--force', '--deep', '--sign', '-', appBundle], { encoding: 'utf8' });
                res = runSingleCompileAttempt(electronPath, 'node', compilerCore, tmpDir);
            }
        }

        if (isDarwin && (res.error || res.status !== 0)) {
            console.warn(
                `[compile-bytecode] macOS attempt 2 failed (status=${res.status}, signal=${res.signal}), trying Electron main process...`
            );
            res = runSingleCompileAttempt(electronPath, 'main', compilerCore, tmpDir);
        }

        if (res.error || res.status !== 0) {
            const detail = res.error ? res.error.message : (res.stderr || res.stdout || '').trim();
            if (isDarwin) {
                // Trên runner macOS CI headless không hỗ trợ khởi chạy Electron.app: giữ nguyên JS đã obfuscate + vault.bin AES-256-GCM + @electron/fuses
                console.warn(
                    `[compile-bytecode] Cảnh báo: không thể biên dịch .jsc trên macOS CI (status=${res.status}, signal=${res.signal}): ${detail}. Giữ nguyên bản JS đã obfuscate kèm vault.bin AES-256-GCM.`
                );
                for (const job of jobs) {
                    try { if (fs.existsSync(job.output)) fs.unlinkSync(job.output); } catch (_) {}
                }
                return false;
            }
            throw new Error(
                `Biên dịch V8 Bytecode thất bại (platform=${process.platform}, exit=${res.status}, signal=${res.signal}):\n${detail}`
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
        return true;
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
    const toCompile = vaultKeyJs ? [vaultKeyJs] : [];
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
