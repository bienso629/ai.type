const CryptoJS = require("crypto-js");

const genKey = "31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8";

function encrypt(data, key) {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonStr, key).toString();
}

const dataForm = {
    domain: "https://hopthu.vn",
    domain_id: "5716f8bbaa7727398d05d5b8e3007963",
    page: 1,
    per_page: 20,
    year: 2023,
    appId: "ai.typing",
    appToken: "SOME_TOKEN",
    sys_username: "webmaster_lprcx7o",
    username: "hopthu",
    apppass: "********",
    status: ["publish", "draft", "pending"],
    context: "edit"
};

const params = encrypt(dataForm, genKey);

fetch("https://apiv3.type.vn/v1/plugins/wordpress/posts/all", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-api-key": "91cbb423-dcec-4b3d-aee2-d0f29a136d1b"
    },
    body: JSON.stringify({ params })
}).then(res => res.json().then(data => ({status: res.status, data}))).then(res => {
    console.log("RESPONSE:", res);
}).catch(err => {
    console.log("ERROR:", err);
});
