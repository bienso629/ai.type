// bootstrap.js
if (typeof global.File === 'undefined') {
    const { File, Blob } = require('undici');  // dùng undici để polyfill đầy đủ
    global.File = File;
    global.Blob = Blob;
}

require('./type-lite.js');
