const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPrintBridgeServer } = require('../src/server');

const request = (baseUrl, pathname, options = {}) => fetch(`${baseUrl}${pathname}`, options);

test('serves health and printer role status', async () => {
  const server = createPrintBridgeServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      dryRun: true,
      printers: {
        cashier: { enabled: true, printerName: 'Receipt' },
        kitchen: { enabled: true, printerName: 'Kitchen' },
      },
    },
  });
  await server.start();
  try {
    const health = await request(server.baseUrl, '/health');
    const printers = await request(server.baseUrl, '/printers');

    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    assert.equal(printers.status, 200);
    assert.equal((await printers.json()).printers.cashier.printerName, 'Receipt');
  } finally {
    await server.stop();
  }
});

test('writes dry-run print job files for cashier payloads', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-bridge-test-'));
  const server = createPrintBridgeServer({
    outputDir,
    config: {
      host: '127.0.0.1',
      port: 0,
      dryRun: true,
      printers: {
        cashier: { enabled: true, printerName: 'Receipt' },
      },
    },
  });
  await server.start();
  try {
    const response = await request(server.baseUrl, '/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'cashier',
        orderNumber: '0707001',
        storeId: 'bluefields',
        text: 'Recibo\nTotal C$190.00',
        html: '<html>receipt</html>',
        cutCommandHex: '1D5600',
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.role, 'cashier');

    const files = fs.readdirSync(outputDir);
    assert.ok(files.some(file => file.endsWith('.json')));
    assert.ok(files.some(file => file.endsWith('.txt')));
    assert.ok(files.some(file => file.endsWith('.html')));
    assert.match(fs.readFileSync(path.join(outputDir, files.find(file => file.endsWith('.txt'))), 'utf8'), /Recibo/);
  } finally {
    await server.stop();
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('returns bad request for invalid print payloads', async () => {
  const server = createPrintBridgeServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      dryRun: true,
      printers: {
        cashier: { enabled: true, printerName: 'Receipt' },
      },
    },
  });
  await server.start();
  try {
    const response = await request(server.baseUrl, '/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'unknown', orderNumber: '1', text: 'x' }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Unsupported printer role/);
  } finally {
    await server.stop();
  }
});

test('allows browser private-network preflight from the hosted POS app', async () => {
  const server = createPrintBridgeServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      dryRun: true,
      printers: {
        cashier: { enabled: true, printerName: 'Receipt' },
      },
    },
  });
  await server.start();
  try {
    const response = await request(server.baseUrl, '/print', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://restaurant-pos-1b420.web.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Private-Network': 'true',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://restaurant-pos-1b420.web.app');
    assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
  } finally {
    await server.stop();
  }
});
