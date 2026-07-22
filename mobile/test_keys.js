const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

function encrypt(text, password) {
    const salt = crypto.randomBytes(8);
    const keyAndIv = crypto.pbkdf2Sync(password, salt, 1, 48, 'md5');
    const key = keyAndIv.slice(0, 32);
    const iv = keyAndIv.slice(32, 48);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(text));
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const prefix = Buffer.from('Salted__');
    return Buffer.concat([prefix, salt, encrypted]).toString('base64');
}

const activeInfo = JSON.parse(fs.readFileSync('/home/yenai/.config/ai.type/active_info.json', 'utf8') || '{}');
// wait, I don't know where activeInfo is stored for the emulator.
