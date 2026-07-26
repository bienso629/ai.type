const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');

async function test() {
    const formData = new FormData();
    formData.append('files', fs.createReadStream('test.txt'));
    formData.append('folder', 'testuser123');
    
    const res = await fetch('https://cdn1.type.vn/upload', {
        method: 'POST',
        headers: {
            'x-api-key': 'type-vn-secret-key-2026-yenai-dep-trai',
            ...formData.getHeaders()
        },
        body: formData
    });
    
    const result = await res.json();
    console.log(result);
}
test();
