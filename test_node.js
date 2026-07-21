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
    domain_id: "5716f8bbaa7727398d05d5b8e3007963",
    page: 1,
    per_page: 20,
    year: 2023,
    appId: "ai.typing",
    appToken: "7dc7a726-f093-4f7d-958a-2f2e73cb7b3b",
    sys_username: "admin",
    username: "hopthu",
    apppass: "********",
    status: ["publish", "draft", "pending"],
    context: "edit"
};

const params = encrypt(dataForm, genKey);
const jwt = generateJWTToken();

fetch("https://apiv3.type.vn/v1/plugins/wordpress/posts/all", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-api-key": "91cbb423-dcec-4b3d-aee2-d0f29a136d1b",
        "Authorization": `Bearer ${jwt}`
    },
    body: JSON.stringify({ params })
}).then(res => res.text().then(text => ({status: res.status, text}))).then(res => {
    console.log("RESPONSE:", res);
}).catch(err => {
    console.log("ERROR:", err);
});
