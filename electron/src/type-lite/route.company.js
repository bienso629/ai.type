const Router = require('express');
const typing = require('./lib.typing.js');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36';
const randomUseragent = require('random-useragent');

const createCrawlRouter = ({ puppeteerExtra, chrome, dirPath, username, args }) => {
    const CrawlRouter = Router();

    CrawlRouter.post('/list', async (req, res) => {
        try {
            const browser = await puppeteerExtra.launch({
                headless: true,
                executablePath: chrome,
                userDataDir: `${dirPath}/${username}`,

                defaultViewport: null,
                ignoreDefaultArgs: [
                    '--enable-automation',
                    '--enable-blink-features=IdleDetection' // Ẩn báo idle
                ],

                args: [
                    '--app=data:,',                       // Ẩn toàn bộ address bar (quan trọng nhất)
                    '--window-size=1280,820',
                    '--start-maximized',
                    '--disable-notifications',
                    '--disable-infobars',                 // Ẩn “Chrome is being controlled…”
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-extensions',
                    '--disable-popup-blocking',
                    '--disable-save-password-bubble',
                    '--disable-translate',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--no-default-browser-check',
                    '--no-first-run',
                    '--mute-audio',

                    ...args // giữu args bạn truyền
                ]
            });

            browser.on('disconnected', () => {
                console.log('Mất kết nối!!!');
            });

            const companyListPage = await browser.pages();
            // Randomize User agent or Set a valid one
            const userAgent = randomUseragent.getRandom();
            const UA = userAgent || USER_AGENT;

            await companyListPage[0].setUserAgent(UA);
            typing.getCompanyLink(req, companyListPage[0]).then(async data => {
                // if (!proccessing) mainPage.bringToFront();
                res.send(data);
                browser.close();
            });
        } catch (error) {
            console.log('error', error);
            res.status(500).send({ error: 'Lỗi không thể khởi chạy ChatGPT' });
        }
    });

    CrawlRouter.post('/crawl', async (req, res) => {
        try {
            const browser = await puppeteerExtra.launch({
                headless: true,
                executablePath: chrome,
                userDataDir: `${dirPath}/${username}`,

                defaultViewport: null,
                ignoreDefaultArgs: [
                    '--enable-automation',
                    '--enable-blink-features=IdleDetection' // Ẩn báo idle
                ],

                args: [
                    '--app=data:,',                       // Ẩn toàn bộ address bar (quan trọng nhất)
                    '--window-size=1280,820',
                    '--start-maximized',
                    '--disable-notifications',
                    '--disable-infobars',                 // Ẩn “Chrome is being controlled…”
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-extensions',
                    '--disable-popup-blocking',
                    '--disable-save-password-bubble',
                    '--disable-translate',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--no-default-browser-check',
                    '--no-first-run',
                    '--mute-audio',

                    ...args // giữu args bạn truyền
                ]
            });

            browser.on('disconnected', () => {
                console.log('Mất kết nối!!!');
            });

            const crawlCompanyPage = await browser.pages();
            // Randomize User agent or Set a valid one
            const userAgent = randomUseragent.getRandom();
            const UA = userAgent || USER_AGENT;

            await crawlCompanyPage[0].setUserAgent(UA);
            typing.crawlCompany(req, crawlCompanyPage[0]).then(async data => {
                // if (!proccessing) mainPage.bringToFront();
                res.send(data);
                browser.close();
            });
        } catch (error) {
            console.log('error', error);
            res.status(500).send({ error: 'Lỗi không thể khởi chạy ChatGPT' });
        }
    });

    return CrawlRouter;
}

module.exports = createCrawlRouter;
