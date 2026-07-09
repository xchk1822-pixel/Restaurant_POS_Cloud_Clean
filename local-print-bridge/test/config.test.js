const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../src/config');

test('loads printer config written with a UTF-8 BOM', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-config-test-'));
  const configPath = path.join(tempDir, 'printers.json');

  fs.writeFileSync(configPath, `\uFEFF${JSON.stringify({
    host: '0.0.0.0',
    port: 17777,
    dryRun: false,
    printers: {
      cashier: { enabled: true, printerName: 'FACTURAS' },
      kitchen: { enabled: true, printerName: 'COCINA' },
    },
  })}`, 'utf8');

  try {
    const config = loadConfig(configPath);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.dryRun, false);
    assert.equal(config.printers.cashier.printerName, 'FACTURAS');
    assert.equal(config.printers.kitchen.printerName, 'COCINA');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
