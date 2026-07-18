const https = require('https');
const crypto = require('crypto');

const secret = 'sh-0hPYnFVwEa5ydU9zWP9ET3BlbkFJeb81DqndysS0Zun3pOmK';

function base64url(source) {
    let encoded = Buffer.from(source).toString('base64');
    encoded = encoded.replace(/=+$/, '');
    encoded = encoded.replace(/\+/g, '-');
    encoded = encoded.replace(/\//g, '_');
    return encoded;
}

function generateJWTToken(user) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const date = new Date();
    const iat = Math.floor(date.getTime() / 1000);
    const exp = Math.floor((date.setDate(date.getDate() + 7)) / 1000);
    const payload = { iat: iat, iss: 'ai.type', exp: exp, user: user || null };
    
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    
    const signatureInput = encodedHeader + '.' + encodedPayload;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signatureInput);
    const signature = base64url(hmac.digest());
    
    return encodedHeader + '.' + encodedPayload + '.' + signature;
}

function encryptAES(object, key) {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, key.slice(0, 16));
    let encrypted = cipher.update(JSON.stringify(object), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted; // Note: this is just a mockup, CryptoTS uses openSSL format
}

// Actually, CryptoTS uses a specific format (Salted__). Let's use CryptoJS to exactly match!
