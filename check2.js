const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3333/#/sign-in', { waitUntil: 'networkidle0' });
  const isBlank = await page.evaluate(() => {
    const el = document.getElementById('nativeCaptchaCanvas');
    if (!el) return 'Canvas missing';
    const ctx = el.getContext('2d');
    const data = ctx.getImageData(0,0, el.width, el.height).data;
    for(let i=0; i<data.length; i++) {
        if (data[i] !== 0) return false;
    }
    return true;
  });
  console.log('IS BLANK:', isBlank);
  await browser.close();
})();
