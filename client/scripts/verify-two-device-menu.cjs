const { chromium } = require('@playwright/test');

async function openMenu(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();
  await page.goto('https://restaurant-pos-1b420.web.app/inventory/menu', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login') || await page.locator('input[type="password"]').count()) {
    await page.fill('input[type="text"]', 'zeng');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    await page.goto('https://restaurant-pos-1b420.web.app/inventory/menu', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
  }
  const text = await page.locator('body').innerText({ timeout: 30000 });
  return {
    countLine: (text.match(/共\s*\d+\s*个菜品[^\n]*/) || [null])[0],
    hasArroz: text.includes('Arroz Chino Especial'),
    hasBeer: text.includes('Cerveza / Beer'),
    context,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const [deviceA, deviceB] = await Promise.all([openMenu(browser), openMenu(browser)]);
  console.log(JSON.stringify({
    deviceA: { countLine: deviceA.countLine, hasArroz: deviceA.hasArroz, hasBeer: deviceA.hasBeer },
    deviceB: { countLine: deviceB.countLine, hasArroz: deviceB.hasArroz, hasBeer: deviceB.hasBeer },
    sameCount: deviceA.countLine === deviceB.countLine,
  }, null, 2));
  await deviceA.context.close();
  await deviceB.context.close();
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
