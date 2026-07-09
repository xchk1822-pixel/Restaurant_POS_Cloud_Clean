const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PORT = 17777;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'printers.json');
const EXAMPLE_CONFIG_PATH = path.join(__dirname, '..', 'config', 'printers.example.json');

const defaultConfig = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  dryRun: true,
  printers: {
    cashier: { enabled: true, printerName: '' },
    kitchen: { enabled: true, printerName: '' },
    bar: { enabled: false, printerName: '' },
    report: { enabled: false, printerName: '' },
  },
};

const readJsonFile = filePath => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const mergeConfig = (config = {}) => ({
  ...defaultConfig,
  ...config,
  printers: {
    ...defaultConfig.printers,
    ...(config.printers || {}),
  },
});

const loadConfig = (filePath = process.env.PRINT_BRIDGE_CONFIG || DEFAULT_CONFIG_PATH) => {
  const config = readJsonFile(filePath) || readJsonFile(EXAMPLE_CONFIG_PATH) || defaultConfig;
  return mergeConfig(config);
};

const getRolePrinter = (config, role) => {
  const printer = config?.printers?.[role];
  if (!printer || printer.enabled === false) {
    throw new Error(`Printer role is disabled: ${role}`);
  }
  if (!config.dryRun && !String(printer.printerName || '').trim()) {
    throw new Error(`Printer name is required for role: ${role}`);
  }
  return printer;
};

module.exports = {
  DEFAULT_CONFIG_PATH,
  DEFAULT_HOST,
  DEFAULT_PORT,
  EXAMPLE_CONFIG_PATH,
  defaultConfig,
  getRolePrinter,
  loadConfig,
  mergeConfig,
};
