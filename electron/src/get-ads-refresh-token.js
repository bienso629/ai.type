const { OAuth2Client } = require('google-auth-library');
const readline = require('readline');

// DÙNG CHUNG VỚI GSC
const CLIENT_ID = '90514980593-9tqqkt4eobhee5aqrft3f6s5mpkakbp0.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// Redirect URI phải trùng với cái bạn đã config cho client này
// Trong main.js bạn đang dùng:
const REDIRECT_URI = 'http://localhost/google';

const oAuth2Client = new OAuth2Client(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/adwords'],
    prompt: 'consent', // bắt buộc để trả refresh_token
});

console.log('1) Mở link này bằng trình duyệt (dùng đúng account MCC Google Ads):\n');
console.log(authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('\n2) Dán nguyên URL hoặc chỉ giá trị code: \n> ', async (input) => {
    try {
        let value = input.trim();
        // Nếu user dán cả URL, tự tách ra phần code=
        const match = value.match(/code=([^&]+)/);
        const code = match ? match[1] : value;

        const { tokens } = await oAuth2Client.getToken(code);
        console.log('\n=== TOKENS ===');
        console.log(tokens);
        console.log('\nADS_REFRESH_TOKEN của bạn là:\n');
        console.log(tokens.refresh_token);
    } catch (err) {
        console.error('Lỗi lấy token:', err.message || err);
    }
    rl.close();
});
