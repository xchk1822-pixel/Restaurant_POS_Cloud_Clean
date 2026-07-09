const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildRawPrintBuffer,
  sendRawPrintJob,
} = require('../src/windowsRawPrinter');

test('builds raw ESC/POS buffer with feed lines and cut command bytes', () => {
  const buffer = buildRawPrintBuffer({
    text: 'Recibo\nTotal C$190.00',
    cut: true,
    feedLines: 2,
    cutCommandHex: '1D5600',
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.match(buffer.toString('utf8'), /Recibo/);
  assert.equal(buffer.at(-3), 0x1d);
  assert.equal(buffer.at(-2), 0x56);
  assert.equal(buffer.at(-1), 0x00);
});

test('normalizes line endings to CRLF before feeding and cutting', () => {
  const buffer = buildRawPrintBuffer({
    text: 'Line 1\nLine 2',
    cut: false,
    feedLines: 1,
  });

  assert.equal(buffer.toString('utf8'), 'Line 1\r\nLine 2\r\n');
});

test('sendRawPrintJob writes a spool file and invokes the PowerShell helper', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-printer-test-'));
  const calls = [];
  const job = await sendRawPrintJob(
    {
      role: 'cashier',
      orderNumber: '0707001',
      text: 'Recibo\nTotal C$190.00',
      cut: true,
      feedLines: 1,
      cutCommandHex: '1D5600',
    },
    { printerName: 'POS-80-Receipt' },
    {
      tempDir,
      spawnRunner: async (command, args) => {
        calls.push({ command, args });
        return { stdout: 'ok', stderr: '' };
      },
    }
  );

  try {
    assert.equal(job.printerName, 'POS-80-Receipt');
    assert.ok(fs.existsSync(job.rawFilePath));
    assert.ok(calls[0].args.includes('-PrinterName'));
    assert.ok(calls[0].args.includes('POS-80-Receipt'));
    assert.ok(calls[0].args.includes('-FilePath'));
    assert.equal(fs.readFileSync(job.rawFilePath).at(-3), 0x1d);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
