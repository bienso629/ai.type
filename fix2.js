const fs = require('fs');
let data = fs.readFileSync('electron/src/main.js', 'utf8');

const target = `        const args = [
            \`--text=\${text}\`,
            \`--voice=\${voice}\`,`;

const replace = `        // Loại bỏ ký tự xuống dòng để tránh lỗi "No audio was received" của edge-tts
        const safeText = (text || '').replace(/\\r?\\n/g, ' ');

        const args = [
            \`--text=\${safeText}\`,
            \`--voice=\${voice}\`,`;

data = data.replace(target, replace);
fs.writeFileSync('electron/src/main.js', data, 'utf8');
console.log('Replaced successfully.');
