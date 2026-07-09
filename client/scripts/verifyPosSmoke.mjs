import { chromium } from '@playwright/test';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  const next = process.argv[i + 1];
  if (key.startsWith('--')) {
    args.set(key.slice(2), next && !next.startsWith('--') ? next : true);
    if (next && !next.startsWith('--')) i += 1;
  }
}

const url = args.get('url') || process.env.POS_SMOKE_URL || 'https://restaurant-pos-1b420.web.app';
const username = args.get('username') || process.env.POS_SMOKE_USERNAME || 'zeng';
const password = args.get('password') || process.env.POS_SMOKE_PASSWORD;
const channel = args.get('channel') || process.env.POS_SMOKE_BROWSER || 'msedge';

if (!password) {
  console.error('Usage: npm run verify:pos-smoke -- --password <password> [--username zeng] [--url https://...] [--channel msedge]');
  process.exit(1);
}

const main = async () => {
  const browser = await chromium.launch({ channel, headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${url.replace(/\/$/, '')}/login?redirect=%2Fpos`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.locator('input').nth(0).fill(username);
  await page.locator('input').nth(1).fill(password);
  await page.locator('button').first().click();
  await page.waitForURL(/\/pos/, { timeout: 30000 });
  await page.waitForTimeout(5000);

  const text = await page.locator('body').innerText();
  const bundle = await page
    .locator('script[src*="main."]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));

  const result = {
    url: page.url(),
    hasMesas: text.includes('Mesas'),
    hasPedidos: text.includes('Pedidos'),
    errorCount: errors.length,
    errors: errors.slice(0, 5),
    bundle,
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  if (!result.hasMesas || !result.hasPedidos || result.errorCount > 0) {
    process.exit(1);
  }
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
