const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3333/#/sign-in', { waitUntil: 'networkidle0' });
  const canvas = await page.evaluate(() => {
    const el = document.getElementById('nativeCaptchaCanvas');
    if (!el) return 'Not found';
    return {
      width: el.width,
      height: el.height,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      display: window.getComputedStyle(el).display,
      parentDisplay: window.getComputedStyle(el.parentElement).display,
      ngxDisplay: window.getComputedStyle(el.parentElement.parentElement).display,
      html: el.parentElement.parentElement.outerHTML
    };
  });
  console.log('CANVAS DATA:', JSON.stringify(canvas, null, 2));
  await browser.close();
})();
