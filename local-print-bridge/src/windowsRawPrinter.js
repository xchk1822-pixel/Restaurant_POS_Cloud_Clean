const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'send-raw-print.ps1');

const hexToBuffer = hex => {
  const clean = String(hex || '').replace(/[^a-fA-F0-9]/g, '');
  return clean ? Buffer.from(clean, 'hex') : Buffer.alloc(0);
};

const buildRawPrintBuffer = payload => {
  const feedLines = Math.max(0, Number(payload?.feedLines || 0));
  const normalizedText = String(payload?.text || '').replace(/\r?\n/g, '\r\n');
  const textBuffer = Buffer.from(normalizedText, 'utf8');
  const feedBuffer = Buffer.from('\r\n'.repeat(feedLines), 'utf8');
  const cutBuffer = payload?.cut === false ? Buffer.alloc(0) : hexToBuffer(payload?.cutCommandHex || '1D5600');

  return Buffer.concat([textBuffer, feedBuffer, cutBuffer]);
};

const runProcess = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true });
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.on('error', reject);
  child.on('close', code => {
    if (code === 0) {
      resolve({ stdout, stderr });
    } else {
      reject(new Error(stderr || stdout || `print helper exited with ${code}`));
    }
  });
});

const safeFilePart = value => String(value || '')
  .replace(/[^a-zA-Z0-9_-]/g, '_')
  .slice(0, 64) || 'print';

const sendRawPrintJob = async (payload, printer, options = {}) => {
  const printerName = String(printer?.printerName || '').trim();
  if (!printerName) {
    throw new Error(`Printer name is required for role: ${payload?.role || 'unknown'}`);
  }

  const tempDir = options.tempDir || path.join(os.tmpdir(), 'restaurant-print-bridge');
  fs.mkdirSync(tempDir, { recursive: true });
  const rawFilePath = path.join(
    tempDir,
    `${Date.now()}_${safeFilePart(payload?.role)}_${safeFilePart(payload?.orderNumber)}.bin`
  );
  fs.writeFileSync(rawFilePath, buildRawPrintBuffer(payload));

  const scriptPath = options.scriptPath || DEFAULT_SCRIPT_PATH;
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-PrinterName',
    printerName,
    '-FilePath',
    rawFilePath,
  ];
  const runner = options.spawnRunner || runProcess;
  const result = await runner('powershell.exe', args);

  return {
    printerName,
    rawFilePath,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

module.exports = {
  DEFAULT_SCRIPT_PATH,
  buildRawPrintBuffer,
  sendRawPrintJob,
};
