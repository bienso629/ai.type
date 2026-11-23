'use strict';

/**
 * vault-loader.js — Bộ giải mã tài nguyên AES-256-GCM trong RAM cho AI.Type.
 * - Giải mã trực tiếp từ dist/vault.bin (trong app.asar) bằng khóa lưu trong V8 Bytecode (_vault-key.jsc).
 * - Phục vụ Frontend Angular qua giao thức nội bộ app://local/ với Cache-Control: no-store (không lưu đệm JS ra đĩa).
 * - Cung cấp nội dung kịch bản Python (như __internal__/video_mocap_3d.py) trực tiếp trong RAM mà không cần tệp .py trên đĩa.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const MAGIC = Buffer.from('AIV1', 'ascii');
const VAULT_FILENAME = 'vault.bin';

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

let _initialized = false;
let _vaultAvailable = false;
let _vaultFd = null;
let _vaultFileSize = 0;
let _vaultKey = null;
let _manifest = null;
let _dataOffsetBase = 0;

function readExactSync(fd, length, position) {
    const out = Buffer.allocUnsafe(length);
    let totalRead = 0;
    while (totalRead < length) {
        const n = fs.readSync(fd, out, totalRead, length - totalRead, position + totalRead);
        if (n <= 0) {
            throw new Error(`Unexpected EOF reading vault at offset ${position + totalRead}`);
        }
        totalRead += n;
    }
    return out;
}

function normalizeKey(relPath) {
    let clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    // Chặn path traversal
    const parts = clean.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
    return parts.join('/');
}

function getMimeType(relPath) {
    const ext = path.extname(relPath || '').toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
}

function resolveVaultFilePath() {
    const rawCandidates = [
        path.join(__dirname, VAULT_FILENAME),
        path.join(__dirname, '..', 'dist', VAULT_FILENAME),
    ];
    // Ưu tiên bản app.asar.unpacked (tệp thật trên OS để fs.readSync đọc theo offset tốn <1MB RAM, không copy tạm)
    for (const cand of rawCandidates) {
        const unpacked = cand.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
        if (unpacked !== cand && fs.existsSync(unpacked)) return unpacked;
    }
    for (const cand of rawCandidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return null;
}

function loadVaultKey() {
    try {
        const keyMod = require('./_vault-key');
        if (keyMod && typeof keyMod.getVaultKey === 'function') {
            const keyBuf = keyMod.getVaultKey();
            if (Buffer.isBuffer(keyBuf) && keyBuf.length === 32) {
                return keyBuf;
            }
        }
    } catch (_) {}
    return null;
}

function initVault() {
    if (_initialized) return _vaultAvailable;
    _initialized = true;

    try {
        const vaultPath = resolveVaultFilePath();
        const key = loadVaultKey();
        if (!vaultPath || !key) {
            _vaultAvailable = false;
            return false;
        }

        const stat = fs.statSync(vaultPath);
        if (stat.size < 36) {
            _vaultAvailable = false;
            return false;
        }

        const fd = fs.openSync(vaultPath, 'r');
        const header = readExactSync(fd, 36, 0);
        if (!header.subarray(0, 4).equals(MAGIC)) {
            fs.closeSync(fd);
            _vaultAvailable = false;
            return false;
        }

        const indexIv = header.subarray(4, 16);
        const indexTag = header.subarray(16, 32);
        const encManifestLen = header.readUInt32BE(32);
        const manifestStart = 36;
        const manifestEnd = manifestStart + encManifestLen;
        if (manifestEnd > stat.size) {
            fs.closeSync(fd);
            _vaultAvailable = false;
            return false;
        }

        const encManifest = readExactSync(fd, encManifestLen, manifestStart);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, indexIv);
        decipher.setAuthTag(indexTag);
        const compressedManifest = Buffer.concat([decipher.update(encManifest), decipher.final()]);
        const manifestJson = zlib.inflateSync(compressedManifest).toString('utf8');

        _manifest = JSON.parse(manifestJson);
        _vaultFd = fd;
        _vaultFileSize = stat.size;
        _vaultKey = key;
        _dataOffsetBase = manifestEnd;
        _vaultAvailable = true;
        return true;
    } catch (err) {
        console.error('[VaultLoader] Không thể mở gói bảo mật vault.bin:', err && err.message ? err.message : err);
        _vaultAvailable = false;
        return false;
    }
}

function isVaultAvailable() {
    return initVault();
}

function readVaultFile(relPath) {
    if (!initVault()) return null;
    const key = normalizeKey(relPath);
    const meta = _manifest[key];
    if (!meta) return null;

    try {
        const start = _dataOffsetBase + meta.o;
        const end = start + meta.l;
        if (start < _dataOffsetBase || end > _vaultFileSize) return null;

        const iv = Buffer.from(meta.i, 'hex');
        const tag = Buffer.from(meta.t, 'hex');
        const encChunk = readExactSync(_vaultFd, meta.l, start);

        const decipher = crypto.createDecipheriv('aes-256-gcm', _vaultKey, iv);
        decipher.setAuthTag(tag);
        let plain = Buffer.concat([decipher.update(encChunk), decipher.final()]);
        if (meta.c) {
            plain = zlib.inflateSync(plain);
        }
        return {
            data: plain,
            mime: meta.m || getMimeType(key),
        };
    } catch (err) {
        console.error('[VaultLoader] Lỗi giải mã tài nguyên:', key, err && err.message ? err.message : err);
        return null;
    }
}

function readVaultText(relPath) {
    const entry = readVaultFile(relPath);
    return entry ? entry.data.toString('utf8') : null;
}

function createAppProtocolHandler() {
    return async (request) => {
        try {
            const parsedUrl = new URL(request.url);
            let pathname = decodeURIComponent(parsedUrl.pathname || '/');
            if (pathname === '/' || pathname === '') {
                pathname = '/index.html';
            }

            let key = normalizeKey(pathname);
            let entry = readVaultFile(key);

            // SPA fallback: chỉ chuyển về index.html nếu đường dẫn không có phần mở rộng tệp
            if (!entry && !path.extname(key)) {
                entry = readVaultFile('index.html');
            }

            if (!entry) {
                return new Response('Not Found', {
                    status: 404,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
                });
            }

            const totalLen = entry.data.length;
            const rangeHeader = request.headers.get('range');
            if (rangeHeader) {
                const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
                if (match) {
                    let start = match[1] ? parseInt(match[1], 10) : 0;
                    let end = match[2] ? parseInt(match[2], 10) : totalLen - 1;
                    if (isNaN(start)) start = 0;
                    if (isNaN(end) || end >= totalLen) end = totalLen - 1;
                    if (start <= end && start < totalLen) {
                        const slice = entry.data.subarray(start, end + 1);
                        return new Response(slice, {
                            status: 206,
                            headers: {
                                'Content-Type': entry.mime,
                                'Content-Length': String(slice.length),
                                'Content-Range': `bytes ${start}-${end}/${totalLen}`,
                                'Accept-Ranges': 'bytes',
                                'Cache-Control': 'no-store',
                            },
                        });
                    }
                }
            }

            return new Response(entry.data, {
                status: 200,
                headers: {
                    'Content-Type': entry.mime,
                    'Content-Length': String(totalLen),
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-store',
                },
            });
        } catch (err) {
            return new Response('Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
            });
        }
    };
}

module.exports = {
    isVaultAvailable,
    readVaultFile,
    readVaultText,
    createAppProtocolHandler,
    getMimeType,
};
