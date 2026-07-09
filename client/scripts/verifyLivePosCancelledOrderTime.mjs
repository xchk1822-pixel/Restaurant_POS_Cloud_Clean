import { chromium } from 'playwright';

const url = 'https://restaurant-pos-1b420.web.app/pos';
const fixedNow = new Date('2026-06-22T23:58:00-06:00').getTime();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];

await page.addInitScript((mockNow) => {
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(mockNow);
      } else {
        super(...args);
      }
    }

    static now() {
      return mockNow;
    }
  }
  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;
  MockDate.prototype = RealDate.prototype;
  window.Date = MockDate;
}, fixedNow);

page.on('console', message => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  const inputs = page.locator('input');
  if (await inputs.count() >= 2) {
    await inputs.nth(0).fill('zeng');
    await inputs.nth(1).fill('123456');
    const loginButton = page.locator('button').filter({ hasText: /登录|登入|Login|Entrar/i }).first();
    if (await loginButton.count()) {
      await loginButton.click();
    } else {
      await inputs.nth(1).press('Enter');
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(10000);

  const bodyText = await page.locator('body').innerText({ timeout: 30000 });
  const hasCancelled = /Cancelado|已取消|取消/.test(bodyText);
  const hasFixedCancelledTime = /Pedido\s+21:55|21:55/.test(bodyText);
  const invalidTimeErrors = consoleErrors.filter(error => /Invalid time value|toISOString/i.test(error));

  console.log(JSON.stringify({
    hasCancelled,
    hasFixedCancelledTime,
    invalidTimeErrorCount: invalidTimeErrors.length,
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
    invalidTimeErrors,
    excerpt: bodyText
      .split('\n')
      .filter(line => /Cancelado|已取消|取消|21:55|#N\/A|Delivery|C\$0\.00|Pedido|Preparando|Pagado|Confirmado|待支付|已确认/.test(line))
      .slice(0, 80),
    tail: bodyText.split('\n').slice(-120)
  }, null, 2));

  if (!hasCancelled || !hasFixedCancelledTime || invalidTimeErrors.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
