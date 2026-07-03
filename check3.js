const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3333/#/sign-in', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: '/home/yenai/Documents/Projects/Typing/ai.type/electron/fallback/test.png', fullPage: true });
  await browser.close();
})();
