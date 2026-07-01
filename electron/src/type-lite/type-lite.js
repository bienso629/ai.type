const express = require('express');
const cryptojs = require('crypto-js');
const os = require('os');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const server = express();
const homeDir = os.homedir();
const documentsDir = path.join(homeDir, 'Documents');
const dirPath = path.join(documentsDir, 'ai.type');
const savePath = path.join(dirPath, 'myfile.txt');
const dataPath = path.join(dirPath, 'data');

puppeteerExtra.use(StealthPlugin());

const createCoreRouter = require('./route.core.js');
const createWordpressRouter = require('./route.wordpress.js');
const createCDNRouter = require('./route.cdn.js');
const createCrawlRouter = require('./route.company.js');
const { decrypt } = require('./crypto.utils.js');
if (typeof File === 'undefined') {
    const { File, Blob } = require('node:buffer');
    global.File = File;
    global.Blob = Blob;
}

// Tự tạo thư mục
fs.mkdir(dirPath, { recursive: true }, (err) => { });
fs.mkdir(dataPath, { recursive: true }, (err) => { });

fs.readFile(savePath, 'utf-8', async (err, content) => {
    if (err || content === 'null') {
        fs.writeFileSync(savePath, 'null', 'utf-8');
        start('null');
    } else {
        start(decrypt(content));
    }
});

const getDirProcess = () => {
    return path.join(require.main ? require.main.path : process.cwd());
}

const getChromiumPath = () => {
    switch (os.platform()) {
        case 'win32': return path.join(dirPath, 'chrome-win', 'chrome.exe');
        case 'darwin': return path.join(dirPath, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
        case 'linux': return path.join(dirPath, 'chrome-linux', 'chrome');
        default: throw new Error('Unsupported platform');
    }
}

const chrome = getChromiumPath();
let port = 12345;
let appToken;
let username = os.userInfo().username;
let args = ['--no-sandbox', '--lang=en-US'];

server.set('view engine', 'html');
server.use('/', express.static(path.join(__dirname, 'views')));
server.use(bodyParser.json({ limit: '50mb' }));
server.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

server.use((req, res, next) => {
    if (req.body && req.body.params) {
        try {
            const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
            let params = cryptojs.AES.decrypt(req.body.params, appToken);
            params = params.toString(cryptojs.enc.Utf8);
            params = params.replace(scriptRegex, '');
            req.body = JSON.parse(params);
        } catch (error) {
            console.log('error decrypting', error.message);
        }
    }
    next();
});

server.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

server.use('/public', express.static(path.join(__dirname, 'data/uploads'), {
    setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); }
}));

// --- ROUTERS ---
server.use(`/`, createCoreRouter({ savePath }));
server.use(`/wordpress`, createWordpressRouter({ dataPath }));
server.use(`/cdn`, createCDNRouter({ dataPath }));
server.use(`/company`, createCrawlRouter({ puppeteerExtra, chrome, dirPath, username, args }));

const start = (content) => {
    server.listen(port, '127.0.0.1', async _ => {
        if (content === 'null') return;
        console.log(`Chạy Cáo nhỏ ${port} thành công!!!`);
        const config = JSON.parse(content);
        appToken = config['appToken'];
        port = config['port'];
        username = config['username'];
        const temp = config['defaultlinks'];
        if (temp) defaultlinks = temp.split('\n');
    });
}