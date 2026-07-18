const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const secret = 'sh-0hPYnFVwEa5ydU9zWP9ET3BlbkFJeb81DqndysS0Zun3pOmK';
const gen = '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';

function base64url(source) {
    let encoded = CryptoJS.enc.Base64.stringify(source);
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
    
    const stringifiedHeader = CryptoJS.enc.Utf8.parse(JSON.stringify(header));
    const encodedHeader = base64url(stringifiedHeader);
    
    const stringifiedPayload = CryptoJS.enc.Utf8.parse(JSON.stringify(payload));
    const encodedPayload = base64url(stringifiedPayload);
    
    let signature = encodedHeader + '.' + encodedPayload;
    signature = CryptoJS.HmacSHA256(signature, secret);
    signature = base64url(signature);
    
    return encodedHeader + '.' + encodedPayload + '.' + signature;
}

const user = {
    id: 1,
    name: "admin",
    email: "noreply.typing.vn@gmail.com",
    server: "vn.s1",
    postcount: 127,
    reputation: 100000004,
    avatar: "https://type.vn/assets/uploads/profile/uid-1/1-profileavatar-1736344301967.png",
    status: "online",
    groups: [
        "lập-trình-ai-type",
        "nhóm-big-data",
        "nhóm-chạy-traffic",
        "nhóm-download-video",
        "nhóm-dreamina-ai",
        "nhóm-quét-sitemap",
        "nhóm-seo-và-phân-tích",
        "nhóm-thu-thập-dữ-liệu",
        "nhóm-txt2voice",
        "nhóm-tạo-hình-ảnh",
        "nhóm-tự-động-hóa",
        "nhóm-video2content",
        "nhóm-x-cms",
        "nhóm-đã-mua-ai-type",
        "nhóm-đã-mua-chatbot"
    ]
};

const jwt = generateJWTToken(user);

const dataForm = {
    year: 2023,
    reportYear: 2026,
    appId: 'ai.typing',
    username: user.name,
};

// Remove appToken since we are trying without it
// dataForm.appToken = ...

const encryptedParams = CryptoJS.AES.encrypt(JSON.stringify(dataForm), gen).toString();

console.log('JWT:', jwt);
console.log('PARAMS:', encryptedParams);

fetch('https://apiv1.type.vn/v1/crawl/statistics/all', {
    method: 'POST',
    body: JSON.stringify({ params: encryptedParams }),
    headers: {
        'Authorization': 'Bearer ' + jwt,
        'Content-Type': 'application/json'
    }
}).then(res => res.json()).then(data => {
    console.log('SUCCESS:', data);
}).catch(err => {
    console.log('ERROR:', err);
});
