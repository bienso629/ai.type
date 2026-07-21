const crypto = require('crypto');
const CryptoJS = require("crypto-js");
const genKey = "31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8";

function encrypt(data, key) {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonStr, key).toString();
}

function generateJWTToken() {
    const header = Buffer.from(JSON.stringify({"alg": "HS256", "typ": "JWT"})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        "uid": "1",
        "username": "admin",
        "email": "admin@localhost",
        "iat": Math.floor(Date.now() / 1000),
        "exp": Math.floor(Date.now() / 1000) + 86400,
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', genKey).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
}

const dataForm = {
    domain: "https://hopthu.vn",
    page: 1,
    username: "hopthu",
    apppass: "********"
};

const params = encrypt(dataForm, genKey);
const jwt = generateJWTToken();

fetch("https://apiv3.type.vn/v1/plugins/wordpress/posts/all", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "x-api-key": "91cbb423-dcec-4b3d-aee2-d0f29a136d1b",
        "Authorization": `Bearer ${jwt}`
    },
    body: JSON.stringify({ params })
}).then(res => res.text().then(text => ({status: res.status, text}))).then(res => {
    console.log("RESPONSE:", res);
}).catch(err => {
    console.log("ERROR:", err);
});
