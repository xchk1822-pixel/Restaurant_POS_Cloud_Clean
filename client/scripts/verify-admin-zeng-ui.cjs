const { chromium } = require('@playwright/test');

async function login(page, username, password, targetPath) {
  await page.goto(`https://restaurant-pos-1b420.web.app${targetPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login') || await page.locator('input[type="password"]').count()) {
    await page.waitForSelector('input[type="password"]', { timeout: 30000 });
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    await page.goto(`https://restaurant-pos-1b420.web.app${targetPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(5000);
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const adminMessages = [];
  admin.on('console', message => {
    const text = message.text();
    if (/error|permission|denied|失败/i.test(text)) adminMessages.push(`${message.type()}: ${text}`.slice(0, 400));
  });

  await login(admin, 'admin', 'admin123', '/dashboard');
  const dashboardText = await admin.locator('body').innerText({ timeout: 30000 });

  await admin.goto('https://restaurant-pos-1b420.web.app/settings/permissions', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await admin.waitForTimeout(5000);
  const permissionsText = await admin.locator('body').innerText({ timeout: 30000 });

  await admin.goto('https://restaurant-pos-1b420.web.app/settings/stores', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await admin.waitForTimeout(5000);
  const storesText = await admin.locator('body').innerText({ timeout: 30000 });

  const zeng = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(zeng, 'zeng', '123456', '/inventory/menu');
  const menuText = await zeng.locator('body').innerText({ timeout: 30000 });

  console.log(JSON.stringify({
    adminDashboard: {
      url: admin.url(),
      hasBluefields: dashboardText.includes('Bluefields'),
      hasSalesCards: dashboardText.includes('139') || dashboardText.includes('订单') || dashboardText.includes('销售'),
      bodyLength: dashboardText.length,
    },
    permissions: {
      hasManager: permissionsText.includes('店长'),
      hasCashier: permissionsText.includes('收银'),
      hasWaiter: permissionsText.includes('服务生'),
      hasChef: permissionsText.includes('厨师'),
      noAddRoleButton: !permissionsText.includes('添加角色'),
    },
    stores: {
      hasBluefields: storesText.includes('Bluefields'),
      zengCount: (storesText.match(/zeng/g) || []).length,
      adminCount: (storesText.match(/admin/g) || []).length,
    },
    zengMenu: {
      has139Count: menuText.includes('共 139 个菜品'),
      countLine: (menuText.match(/共\s*\d+\s*个菜品[^\n]*/) || [null])[0],
      hasImportedItem: menuText.includes('Arroz Chino Especial'),
      hasBeerCategory: menuText.includes('Cerveza / Beer'),
    },
    adminMessages: adminMessages.slice(-10),
  }, null, 2));

  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
