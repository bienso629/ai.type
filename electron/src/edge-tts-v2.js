/**
 * edge-tts-v2.js — Loi tong hop giong doc Microsoft Edge (DRM v2).
 * Port tu edge-tts 7.3.1 (rany2/edge-tts): token Sec-MS-GEC tien to "2-"
 * (thuat toan CS64-SHA256 tuy bien) — ban va cho loi 403 khi Microsoft
 * chan token "1-" cua cac client cu.
 * Khong phu thuoc binary edge-tts; dung WebSocket thuan (goi ws).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const WebSocket = require('ws');

// ===================== HANG SO GIAO THUC =====================
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

const WIN_EPOCH = 11644473600;
const TICKS_PER_SECOND = 10000000;
const MP3_BITRATE_BPS = 48000;
const MAX_TEXT_BYTES = 4096;
const RECEIVE_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 10;

// ===================== DRM v2 (port tu drm.py 7.3.1) =====================
let clockSkewSeconds = 0;

const SHA256_INITIAL = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const SHA256_STATE = [
    0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
    0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2,
];
const SHA256_SCHEDULE = [
    0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
    0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
    0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
    0xd258b060, 0x72766564,
];
const SHA256_ROUND_CONSTANTS = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_ADJUSTMENT = 0xc9dc06a7;
const SHA256_BLOCK_CONSTANTS = SHA256_ROUND_CONSTANTS.slice(0, 14)
    .concat([SHA256_ADJUSTMENT])
    .concat(SHA256_ROUND_CONSTANTS.slice(15));
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

const CS64_COEFFICIENTS = [
    [0xe82e91b1, 0xb32700d0],
    [0x44de24c6, 0x88dff51d],
    [0x3beb65bc, 0x29514038],
    [0xc89c5933, 0xb328cbdf],
    [0x8d1ec211, 0xd405b4d5],
    [0x314ef5d5, 0x26e55f3c],
    [0xe92491b1, 0x607801c6],
    [0xf0a5b9d5, 0x82b2c1fb],
    [0x06064cf3, 0xfa51a3da],
    [0xda79fa60, 0x207cc464],
    [0xbed20560, 0x3c3c74f3],
    [0x89f9c9f8, 0xd2d14b61],
    [0x35fa38c6, 0xbb04a2c1],
    [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

const rotr = (v, n) => ((v >>> n) | (v << (32 - n))) >>> 0;
const rol16 = (v) => ((v << 16) | (v >>> 16)) >>> 0;
// sigma0/sigma1 tuy bien (giong SHA-256 chuan sau khi mask 32 bit)
const sigma0 = (v) => (((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3)) >>> 0);
const sigma1 = (v) => (((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10)) >>> 0);

/**
 * Chay cac vong SHA-256 (co the bat dau tu vong startRound — dung cho
 * truong hop khoi tao voi trang thai da tinh san _SHA256_STATE).
 */
function sha256Rounds(state, words, k, startRound) {
    const start = startRound || 0;
    let a = state[0], b = state[1], c = state[2], d = state[3];
    let e = state[4], f = state[5], g = state[6], h = state[7];
    for (let i = start; i < 64; i++) {
        const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = (g ^ (e & (f ^ g))) >>> 0;
        const t1 = (h + s1 + ch + k[i] + words[i]) % 0x100000000;
        const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) | (c & (a | b))) >>> 0;
        const t2 = (s0 + maj) % 0x100000000;
        h = g; g = f; f = e; e = (d + t1) % 0x100000000;
        d = c; c = b; b = a; a = (t1 + t2) % 0x100000000;
    }
    return [a, b, c, d, e, f, g, h];
}

/** Mo rong lich mesage SHA-256 (bang thuat toan tuy bien cua dich vu). */
function expandSchedule(words, firstWord) {
    for (let index = firstWord; index < 64; index++) {
        const x = words[index - 2];
        const y = words[index - 15];
        const s1 = ((x >>> 17) ^ (x << 15) ^ (x >>> 19) ^ (x << 13) ^ (x >>> 10)) >>> 0;
        const s0 = ((y >>> 7) ^ (y << 25) ^ (y >>> 18) ^ (y << 14) ^ (y >>> 3)) >>> 0;
        words.push((s1 + words[index - 7] + s0 + words[index - 16]) % 0x100000000);
    }
}

/** Trang thai khoi tao SHA-256 tuy bien, tinh tu 7 byte muoi (salt). */
function sha256Init(salt) {
    const words = new Array(14).fill(0);
    words.push(((salt[0] << 16) | (salt[1] << 8) | salt[2]) >>> 0);
    words.push(salt.readUInt32BE(3) >>> 0);
    for (let index = 16; index < 30; index++) {
        let value = SHA256_SCHEDULE[index - 16];
        if (index - 2 >= 14) {
            value += index === 16
                ? (sigma1(words[index - 2]) ^ SHA256_SIGMA1_ADJUSTMENT)
                : sigma1(words[index - 2]);
        }
        if (index - 7 >= 14) value += words[index - 7];
        if (index - 15 >= 14) {
            value += index === 29
                ? (sigma0(words[index - 15]) ^ SHA256_SIGMA0_ADJUSTMENT)
                : sigma0(words[index - 15]);
        }
        words.push(value % 0x100000000);
    }
    words.push(
        (sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] +
            SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]) >>> 0,
    );
    expandSchedule(words, 31);
    const working = sha256Rounds(SHA256_STATE, words, SHA256_BLOCK_CONSTANTS, 14);
    return working.map((w, i) => (w + SHA256_INITIAL[i]) >>> 0);
}

/** Digest SHA-256 tuy bien cho du lieu token. */
function sha256Digest(data) {
    if (data.length < 7) throw new Error('Token salt phai co it nhat 7 byte');
    const length = 57 + data.length;
    const zeroCount = (((55 - length) % 64) + 64) % 64;
    const lenBuf = Buffer.alloc(8);
    lenBuf.writeBigUInt64BE(BigInt(length) * BigInt(8));
    const blocks = Buffer.concat([
        data.subarray(7),
        Buffer.from([0x80]),
        Buffer.alloc(zeroCount),
        lenBuf,
    ]);
    let state = sha256Init(data.subarray(0, 7));
    for (let offset = 0; offset < blocks.length; offset += 64) {
        const words = [];
        for (let i = 0; i < 16; i++) words.push(blocks.readUInt32BE(offset + i * 4));
        expandSchedule(words, 16);
        const working = sha256Rounds(state, words, SHA256_ROUND_CONSTANTS, 0);
        state = state.map((s, i) => (s + working[i]) >>> 0);
    }
    const out = Buffer.alloc(32);
    state.forEach((v, i) => out.writeUInt32BE(v >>> 0, i * 4));
    return out;
}

/** Tach du lieu thanh cac tu 32 bit little-endian, bu so 0 de soi chan. */
function wordsLE4Even(buf) {
    const padLen = (4 - (buf.length % 4)) % 4;
    const padded = Buffer.concat([buf, Buffer.alloc(padLen)]);
    const words = [];
    for (let i = 0; i + 4 <= padded.length; i += 4) words.push(padded.readUInt32LE(i));
    if (words.length % 2) words.push(0);
    return words;
}

/** Digest CS64 tuy bien — trai tim cua token DRM v2. */
function cs64Digest(data, digest) {
    const keyA = digest.readUInt32LE(0) | 1;
    const keyB = digest.readUInt32LE(4) | 1;
    const factors = [
        Math.imul(keyA, CS64_FACTOR) >>> 0,
        Math.imul(keyB, CS64_FACTOR) >>> 0,
    ];
    const terms = CS64_COEFFICIENTS.map((pair, i) => Math.imul(pair[0], factors[i % 2]) >>> 0);
    const offsets = CS64_COEFFICIENTS.map((pair) => pair[1]);
    const words = wordsLE4Even(Buffer.concat([Buffer.from([0]), data]));
    for (let index = 0; index < words.length; index++) {
        const word = words[index];
        let term = Math.imul(word, index % 2 === 0 ? keyA : keyB) >>> 0;
        let offset = Math.imul(rol16(word), index % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
        if (index === 0) {
            term = (term + Math.imul(CS64_ADJUSTMENT0, factors[0])) >>> 0;
            offset = (offset + CS64_ADJUSTMENT1) >>> 0;
        }
        terms.push(term);
        offsets.push(offset);
    }
    let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
    for (let index = 0; index < terms.length; index += 2) {
        const x = terms[index];
        const y = terms[index + 1];
        let t = rol16((offsets[index] + x) >>> 0);
        let q = Math.imul(t, 0x76f50f34) >>> 0;
        swapAcc += (Math.imul(rol16(q), 0xc3efea97) + q) >>> 0;
        t = rol16((offsets[index + 1] + y) >>> 0);
        q = Math.imul(t, 0x1881ce3c) >>> 0;
        swapLast = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
        swapAcc = (swapAcc + swapLast) >>> 0;

        state = (Math.imul(state, keyA) + x) >>> 0;
        state = Math.imul(rol16(state), 0xcf98b111) >>> 0;
        state = Math.imul(rol16(state), 0x87085b9f) >>> 0;
        state = Math.imul(rol16(state), 0x12ceb96d) >>> 0;
        state = Math.imul(rol16(state), 0x257e1d83) >>> 0;
        acc += state;
        t = (Math.imul(state, keyB) + y) >>> 0;
        t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
        t = Math.imul(rol16(t), 0xd38396ff) >>> 0;
        state = Math.imul(rol16(Math.imul(rol16(t), 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
        acc = (acc + state) >>> 0;
    }
    return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

/** Sinh token Sec-MS-GEC v2 dinh dang "<16 hex>-<64 hex>". */
function generateSecMsGecV2(unixTimestamp) {
    let ticks = unixTimestamp == null
        ? Date.now() / 1000 + clockSkewSeconds
        : unixTimestamp;
    ticks += WIN_EPOCH;
    ticks -= ticks % 300;
    ticks *= 1e7;
    const strToHash = Buffer.from(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
    const digest = sha256Digest(strToHash);
    const cs64Words = cs64Digest(strToHash, digest);
    const cs64Buf = Buffer.alloc(8);
    cs64Buf.writeUInt32LE(cs64Words[0], 0);
    cs64Buf.writeUInt32LE(cs64Words[1], 4);
    const cs64 = cs64Buf.toString('hex').toUpperCase();
    const sha256 = digest.toString('hex').toUpperCase();
    return `${cs64}-${sha256}`;
}

/** Chinh sua do lech dong ho dua tren header Date cua phan hoi 403. */
function adjustClockSkewFromResponse(res) {
    const dateHeader = res && res.headers && res.headers.date;
    if (!dateHeader) throw new Error('Khong co header Date tu may chu.');
    const serverDate = Date.parse(dateHeader) / 1000;
    if (Number.isNaN(serverDate)) throw new Error(`Khong doc duoc ngay tu may chu: ${dateHeader}`);
    clockSkewSeconds += serverDate - Date.now() / 1000;
}

const generateMuid = () => crypto.randomBytes(16).toString('hex').toUpperCase();
const uuidHex = () => crypto.randomUUID().replace(/-/g, '');

/** Chuoi thoi gian kieu JavaScript (gio he t cua Microsoft Edge). */
function dateString() {
    const d = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p2 = (n) => String(n).padStart(2, '0');
    return (
        `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p2(d.getUTCDate())} ${d.getUTCFullYear()} ` +
        `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} ` +
        'GMT+0000 (Coordinated Universal Time)'
    );
}

// ===================== XU LY VAN BAN =====================
/** Dich vu khong ho tro mot vai khoang ky tu (loai bo ky tu khong tuong thich). */
function removeIncompatibleCharacters(str) {
    let out = '';
    for (const ch of str) {
        const code = ch.codePointAt(0);
        out += code <= 8 || (code >= 11 && code <= 12) || (code >= 14 && code <= 31) ? ' ' : ch;
    }
    return out;
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = (s) => s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');

const stripAscii = (s) => s.replace(/^[\t\n\v\f\r ]+/, '').replace(/[\t\n\v\f\r ]+$/, '');

/** Dung SSML tu cac tham so (dung dinh dang cua dich vu). */
function mkssml(voice, rate, volume, pitch, escapedText) {
    return (
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
        `<voice name='${voice}'>` +
        `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
        `${escapedText}` +
        '</prosody></voice></speak>'
    );
}

function parseHeaders(buf) {
    const map = {};
    for (const line of buf.toString('utf8').split('\r\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) map[line.substring(0, idx)] = line.substring(idx + 1);
    }
    return map;
}

/** Tim diem cat an toan theo UTF-8 (khong xuyen qua ky tu da byte). */
function findSafeUtf8SplitPoint(buf) {
    let splitAt = buf.length;
    let i = splitAt - 1;
    while (i >= 0 && (buf[i] & 0xc0) === 0x80) i--;
    if (i < 0) return 0;
    const lead = buf[i];
    let seqLen = 1;
    if (lead >= 0xf0) seqLen = 4;
    else if (lead >= 0xe0) seqLen = 3;
    else if (lead >= 0xc0) seqLen = 2;
    if (i + seqLen > splitAt) return i;
    return splitAt;
}

/** Lui diem cat de khong cat giua cac thuc the XML nhu &amp;. */
function adjustForXmlEntity(buf, splitAt) {
    let at = splitAt;
    while (at > 0) {
        const amp = buf.lastIndexOf(0x26, at - 1);
        if (amp < 0) break;
        const semi = buf.indexOf(0x3b, amp);
        if (semi >= 0 && semi < at) break;
        at = amp;
    }
    return at;
}

/** Chia van ban theo do dai byte, uu tien cat tai dau xuong dong/khoang trang. */
function splitTextByByteLength(text, byteLength) {
    let buf = Buffer.from(text, 'utf8');
    const chunks = [];
    while (buf.length > byteLength) {
        const searchLimit = Math.min(byteLength, buf.length);
        let splitAt = buf.lastIndexOf(0x0a, searchLimit - 1);
        if (splitAt < 0) splitAt = buf.lastIndexOf(0x20, searchLimit - 1);
        if (splitAt < 0) splitAt = findSafeUtf8SplitPoint(buf.subarray(0, searchLimit) === buf ? buf : buf);
        splitAt = adjustForXmlEntity(buf, splitAt);
        if (splitAt < 0) throw new Error('Do dai toi da qua nho hoac van ban khong hop le');
        const cut = splitAt > 0 ? splitAt : 1;
        const part = stripAscii(buf.subarray(0, splitAt > 0 ? splitAt : 0).toString('utf8'));
        if (part.length > 0) chunks.push(part);
        buf = buf.subarray(cut);
    }
    const rest = stripAscii(buf.toString('utf8'));
    if (rest.length > 0) chunks.push(rest);
    return chunks;
}

// ===================== WEBSOCKET TTS =====================
/**
 * Tong hop mot doan van ban qua mot ket noi WebSocket moi.
 * Tra ve { audio: Buffer, audioBytes: number, cues: Array }.
 */
function synthesizeOnce(chunkText, voice, rate, volume, pitch, offsetCompensation) {
    return new Promise((resolve, reject) => {
        const connectionId = uuidHex();
        const token = generateSecMsGecV2(Date.now() / 1000 + clockSkewSeconds);
        const url = `${WSS_URL}&ConnectionId=${connectionId}&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

        const ws = new WebSocket(url, {
            headers: {
                Pragma: 'no-cache',
                'Cache-Control': 'no-cache',
                Origin: ORIGIN,
                'User-Agent': USER_AGENT,
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9',
                Cookie: `muid=${generateMuid()};`,
            },
            perMessageDeflate: false,
            handshakeTimeout: 10000,
        });

        let settled = false;
        let audioReceived = false;
        let audioBytes = 0;
        const audioParts = [];
        const cues = [];
        let watchdog = null;

        const finish = (err, result) => {
            if (settled) return;
            settled = true;
            if (watchdog) clearTimeout(watchdog);
            try { ws.terminate(); } catch (e) { /* bo qua */ }
            if (err) reject(err);
            else resolve(result);
        };

        const resetWatchdog = () => {
            if (watchdog) clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                finish(new Error('Het thoi gian cho du lieu tu may chu (60 giay).'));
            }, RECEIVE_TIMEOUT_MS);
        };
        resetWatchdog();

        ws.on('open', () => {
            resetWatchdog();
            // Tin speech.config: bat nghiep do cau (SentenceBoundary) va dinh dang am thanh
            ws.send(
                `X-Timestamp:${dateString()}\r\n` +
                'Content-Type:application/json; charset=utf-8\r\n' +
                'Path:speech.config\r\n\r\n' +
                '{"context":{"synthesis":{"audio":{"metadataoptions":{' +
                '"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"' +
                '},' +
                '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"' +
                '}}}}\r\n',
            );
            // Tin ssml voi van ban can doc
            const ssml = mkssml(voice, rate, volume, pitch, xmlEscape(chunkText));
            ws.send(
                `X-RequestId:${uuidHex()}\r\n` +
                'Content-Type:application/ssml+xml\r\n' +
                `X-Timestamp:${dateString()}Z\r\n` +
                'Path:ssml\r\n\r\n' +
                ssml,
            );
        });

        ws.on('message', (data, isBinary) => {
            resetWatchdog();
            if (isBinary) {
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                if (buf.length < 2) {
                    finish(new Error('Tin nhi phan qua ngan, thieu do dai header.'));
                    return;
                }
                const headerLength = buf.readUInt16BE(0);
                if (headerLength > buf.length) {
                    finish(new Error('Do dai header lon hon do dai du lieu.'));
                    return;
                }
                const parameters = parseHeaders(buf.subarray(2, 2 + headerLength));
                const payload = buf.subarray(2 + headerLength);
                if (parameters.Path !== 'audio') {
                    finish(new Error('Tin nhi phan khong phai du lieu am thanh.'));
                    return;
                }
                const contentType = parameters['Content-Type'] || null;
                if (contentType !== 'audio/mpeg' && contentType !== null) {
                    finish(new Error('Kieu noi dung am thanh khong mong doi.'));
                    return;
                }
                if (contentType === null) {
                    if (payload.length === 0) return; // tin ket thuc stream, hop le
                    finish(new Error('Tin nhi phan khong co Content-Type nhung co du lieu.'));
                    return;
                }
                if (payload.length === 0) {
                    finish(new Error('Tin am thanh nhung thieu du lieu.'));
                    return;
                }
                audioReceived = true;
                audioBytes += payload.length;
                audioParts.push(payload);
                return;
            }
            // Tin van ban (TEXT)
            const str = data.toString('utf8');
            const idx = str.indexOf('\r\n\r\n');
            if (idx < 0) return;
            const parameters = parseHeaders(Buffer.from(str.substring(0, idx), 'utf8'));
            const payloadStr = str.substring(idx + 4);
            const msgPath = parameters.Path;
            if (msgPath === 'audio.metadata') {
                let metadata;
                try { metadata = JSON.parse(payloadStr); } catch (e) {
                    finish(new Error('Khong parse duoc metadata JSON.'));
                    return;
                }
                for (const metaObj of metadata.Metadata || []) {
                    const metaType = metaObj.Type;
                    if (metaType === 'WordBoundary' || metaType === 'SentenceBoundary') {
                        cues.push({
                            offset: metaObj.Data.Offset + offsetCompensation,
                            duration: metaObj.Data.Duration,
                            text: xmlUnescape(metaObj.Data.text.Text),
                        });
                        return; // dich vu chi gui mot cue trong moi tin
                    }
                    if (metaType === 'SessionEnd') continue;
                    finish(new Error(`Loai metadata khong xac dinh: ${metaType}`));
                    return;
                }
                return;
            }
            if (msgPath === 'turn.end') {
                finish(null, {
                    audio: Buffer.concat(audioParts),
                    audioBytes,
                    cues,
                });
                return;
            }
            if (msgPath !== 'turn.start' && msgPath !== 'response') {
                finish(new Error(`Duong dan khong xac dinh: ${msgPath}`));
            }
        });

        ws.on('unexpected-response', (req, res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                let message = `Loi bat tay WebSocket (HTTP ${res.statusCode}).`;
                if (body) message += ` Chi tiet: ${String(body).substring(0, 300)}`;
                if (res.statusCode === 403) {
                    try {
                        adjustClockSkewFromResponse(res);
                        message = `Loi 403 (da hieu chinh do lech dong ho ${clockSkewSeconds.toFixed(1)} giay).`;
                    } catch (e) {
                        message = `Loi 403: ${e.message}`;
                    }
                }
                finish(new Error(message));
            });
        });

        ws.on('error', (err) => {
            finish(new Error(`Loi WebSocket: ${err.message}`));
        });

        ws.on('close', () => {
            if (settled) return;
            if (audioReceived) {
                // May chu ngat ket noi som nhung da nhan duoc am thanh — chap nhan phan da nhan
                finish(null, { audio: Buffer.concat(audioParts), audioBytes, cues });
            } else {
                finish(new Error('Khong nhan duoc am thanh nao tu may chu (NoAudioReceived).'));
            }
        });
    });
}

/**
 * Tong hop mot doan van ban voi vong thu lai (loi NoAudioReceived xay ra
 * ngau nhien, ty le thanh cong khoang 1/5 lan goi — xem issue #473).
 */
async function synthesizeChunk(chunkText, voice, rate, volume, pitch, offsetCompensation, onLog) {
    const log = onLog || (() => {});
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await synthesizeOnce(chunkText, voice, rate, volume, pitch, offsetCompensation);
        } catch (e) {
            lastError = e;
            if (attempt < MAX_ATTEMPTS) {
                const delay = Math.min(1000 * attempt, 5000);
                log(`[TTS-v2] Lan thu ${attempt}/${MAX_ATTEMPTS} that bai (${e.message}). Thu lai sau ${delay}ms...`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

// ===================== COMPOSER PHU DE (SRT) =====================
function formatUs(us) {
    const msTotal = Math.floor(us / 1000);
    const hh = Math.floor(msTotal / 3600000);
    const mm = Math.floor((msTotal % 3600000) / 60000);
    const ss = Math.floor((msTotal % 60000) / 1000);
    const mmm = msTotal % 1000;
    const p2 = (n) => String(n).padStart(2, '0');
    const p3 = (n) => String(n).padStart(3, '0');
    return `${p2(hh)}:${p2(mm)}:${p2(ss)},${p3(mmm)}`;
}

/** Ghep cac cue thanh noi dung SRT (dung dinh dang nhu edge-tts CLI). */
function composeSrt(cues) {
    const subs = [];
    for (const cue of cues) {
        const text = (cue.text || '').trim();
        if (!text) continue;
        const startUs = Math.round(cue.offset / 10);
        const endUs = Math.round((cue.offset + cue.duration) / 10);
        if (startUs < 0) continue;
        if (endUs <= startUs) continue;
        subs.push({ startUs, endUs, text });
    }
    subs.sort((a, b) => (a.startUs - b.startUs) || (a.endUs - b.endUs));
    return subs
        .map((s, i) => `${i + 1}\n${formatUs(s.startUs)} --> ${formatUs(s.endUs)}\n${s.text}\n\n`)
        .join('');
}

// ===================== API CHINH =====================
/**
 * Tao file audio MP3 (va phu de SRT) tu van ban su dung dich vu Edge TTS.
 * Giao dien tuong thich voi generateEdgeAudioByExe cu.
 * @param {string} text Van ban can doc
 * @param {string} voice Ten giong doc (vd: vi-VN-HoaiMyNeural)
 * @param {string} outputPath Duong dan file .mp3 dau ra
 * @param {string} subPath Duong dan file phu de dau ra
 * @param {string} rate Van toc doc (vd: "+20%")
 * @param {string} pitch Cao do giong (vd: "+5Hz")
 * @param {function} [onLog] Ham ghi log tien trinh
 * @returns {Promise<{audio: string, sub: string}>}
 */
async function generateEdgeAudio(text, voice, outputPath, subPath, rate, pitch, onLog) {
    const log = onLog || (() => {});
    if (!text || typeof text !== 'string' || !text.trim()) {
        throw new Error('Khong co van ban de tao giong doc.');
    }
    const safeRate = rate || '+0%';
    const safePitch = pitch || '+0Hz';
    const volume = '+0%';

    // Xu ly van ban: loai ky tu khong tuong thich, escape XML, chia theo byte
    const prepared = xmlEscape(removeIncompatibleCharacters(text));
    const chunks = splitTextByByteLength(prepared, MAX_TEXT_BYTES);

    const audioParts = [];
    const allCues = [];
    let cumulativeBytes = 0;

    for (let i = 0; i < chunks.length; i++) {
        if (chunks.length > 1) {
            log(`[TTS-v2] Tong hop phan ${i + 1}/${chunks.length}...`);
        }
        // Bu thoi gian offset giua cac phan dua tren so byte am thanh CBR (48 kbps)
        const offsetCompensation = Math.floor(
            (cumulativeBytes * 8 * TICKS_PER_SECOND) / MP3_BITRATE_BPS,
        );
        const result = await synthesizeChunk(
            chunks[i], voice, safeRate, volume, safePitch, offsetCompensation, log,
        );
        if (!result.audio || result.audio.length === 0) {
            throw new Error('Khong nhan duoc du lieu am thanh tu dich vu.');
        }
        audioParts.push(result.audio);
        cumulativeBytes += result.audioBytes;
        for (const cue of result.cues) allCues.push(cue);
    }

    const audioBuffer = Buffer.concat(audioParts);
    fs.writeFileSync(outputPath, audioBuffer);
    if (subPath) {
        fs.writeFileSync(subPath, composeSrt(allCues), 'utf8');
    }
    return { audio: outputPath, sub: subPath || null };
}

module.exports = {
    generateEdgeAudio,
    generateSecMsGecV2,
    synthesizeChunk,
    composeSrt,
};
