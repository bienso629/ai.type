const fs = require('fs');
const CryptoJS = require('crypto-js');

const SECRET_KEY = 'ai_type_secret_key_2026_!@#';

const glob = require('glob');
const ldbFiles = glob.sync('/home/yenai/.config/typing/IndexedDB/**/*.ldb');
const logFiles = glob.sync('/home/yenai/.config/typing/IndexedDB/**/*.log');
console.log('LDB Files:', ldbFiles);
console.log('LOG Files:', logFiles);

let allContent = '';
for (const file of [...ldbFiles, ...logFiles]) {
    try {
        allContent += fs.readFileSync(file, 'utf8') + '\n';
    } catch(e) {}
}

const regex = /U2FsdGVkX1[a-zA-Z0-9+/=]+/g;

let matches = [...allContent.matchAll(regex)];
matches = [...new Set(matches.map(m => m[0]))]; // deduplicate

console.log('Found ' + matches.length + ' encrypted blobs. Decrypting...');

for (const blob of matches) {
    try {
        const decrypted = CryptoJS.AES.decrypt(blob, SECRET_KEY).toString(CryptoJS.enc.Utf8);
        if (decrypted && decrypted.includes('appToken')) {
            console.log('SUCCESS! Found appToken in blob:', decrypted.substring(0, 200) + '...');
            const data = JSON.parse(decrypted);
            console.log('appToken:', data.user.appToken);
        }
    } catch (e) {
        // ignore
    }
}
