const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');

async function test() {
    const formData = new FormData();
    formData.append('files', fs.createReadStream('test.txt'));
    formData.append('folder', 'yenai');
    formData.append('username', 'yenai');

    const res = await fetch('https://cdn1.type.vn/upload', {
        method: 'POST',
        headers: {
            'x-api-key': 'type-vn-secret-key-2026-yenai-dep-trai',
            ...formData.getHeaders()
        },
        body: formData
    });
    console.log(await res.text());
}
test();
