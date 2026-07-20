const CryptoJS = require('crypto-js');

const appId = 'ai.typing';
const gen = '8f3c7e6b5a9d2f1b4e0c8a3d7f6b5c4e'; 

const params = {
    uuids: ["yOED9O3hq"], 
    username: "nghia",
    appId: appId,
    year: 2026,
    appToken: "677d3f8e6c7885b5cc42dc3d0da7e7250f1465dd" 
};

function encrypt(data, secretKey) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), secretKey).toString();
}

const encryptedParams = encrypt(params, gen);

fetch('https://apiv1.type.vn/v1/crawl/node/archive/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: encryptedParams })
}).then(res => res.json()).then(data => {
    console.log("uuids response:", data);
    
    // Now try with 'uuid'
    const params2 = {
        uuid: "yOED9O3hq", 
        username: "nghia",
        appId: appId,
        year: 2026,
        appToken: "677d3f8e6c7885b5cc42dc3d0da7e7250f1465dd"
    };
    fetch('https://apiv1.type.vn/v1/crawl/node/archive/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: encrypt(params2, gen) })
    }).then(res2 => res2.json()).then(data2 => console.log("uuid response:", data2));
});
