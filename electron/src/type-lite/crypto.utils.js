const crypto = require('crypto');
const SECRET_KEY = crypto.createHash('sha256').update('ai.type.vn-secret-key-2026').digest();

function encrypt(text) {
    if (!text || text === 'null') return 'null';
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
        let encrypted = cipher.update(text, 'utf-8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch(e) {
        return text;
    }
}

function decrypt(text) {
    if (!text || text === 'null') return 'null';
    try {
        const parts = text.split(':');
        // Nếu không có dấu hai chấm (không phải format mã hoá của mình), trả về dạng gốc (hỗ trợ đọc file cũ chưa mã hoá)
        if (parts.length !== 2) return text; 
        
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');
        return decrypted;
    } catch (err) {
        return text;
    }
}

module.exports = { encrypt, decrypt };
