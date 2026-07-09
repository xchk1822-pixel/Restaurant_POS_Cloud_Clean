const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { getRolePrinter, loadConfig } = require('./config');
const { validatePrintPayload } = require('./payload');
const { sendRawPrintJob } = require('./windowsRawPrinter');

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'logs', 'print-jobs');

const getCorsOrigin = req => {
  const origin = String(req?.headers?.origin || '').trim();
  return origin || '*';
};

const sendJson = (req, res, statusCode, body) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
  });
  res.end(JSON.stringify(body));
};

const readRequestBody = req => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      reject(new Error('Request body too large'));
      req.destroy();
    }
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const safeFilePart = value => String(value || '')
  .replace(/[^a-zA-Z0-9_-]/g, '_')
  .slice(0, 64) || 'print';

const writeDryRunJob = (payload, printer, outputDir = DEFAULT_OUTPUT_DIR) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${stamp}_${safeFilePart(payload.role)}_${safeFilePart(payload.orderNumber)}`;
  const metaPath = path.join(outputDir, `${baseName}.json`);
  const textPath = path.join(outputDir, `${baseName}.txt`);
  const htmlPath = path.join(outputDir, `${baseName}.html`);

  fs.writeFileSync(metaPath, JSON.stringify({ payload, printer }, null, 2), 'utf8');
  fs.writeFileSync(textPath, payload.text || '', 'utf8');
  fs.writeFileSync(htmlPath, payload.html || '', 'utf8');

  return { metaPath, textPath, htmlPath };
};

const createPrintBridgeServer = ({ config = loadConfig(), outputDir = DEFAULT_OUTPUT_DIR } = {}) => {
  let httpServer = null;
  let activeConfig = config;

  const handlePrint = async (req, res) => {
    try {
      const rawBody = await readRequestBody(req);
      const payload = validatePrintPayload(JSON.parse(rawBody || '{}'));
      const printer = getRolePrinter(activeConfig, payload.role);
      let job;

      if (activeConfig.dryRun) {
        job = writeDryRunJob(payload, printer, outputDir);
      } else {
        job = await sendRawPrintJob(payload, printer);
      }

      sendJson(req, res, 200, {
        ok: true,
        mode: activeConfig.dryRun ? 'dryRun' : 'raw',
        role: payload.role,
        orderNumber: payload.orderNumber,
        job,
      });
    } catch (error) {
      const statusCode = /Unsupported|required|disabled|JSON/.test(String(error?.message)) ? 400 : 500;
      sendJson(req, res, statusCode, { ok: false, error: error?.message || 'Print failed' });
    }
  };

  const requestHandler = async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      return sendJson(req, res, 204, {});
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(req, res, 200, {
        ok: true,
        dryRun: !!activeConfig.dryRun,
        roles: Object.keys(activeConfig.printers || {}),
      });
    }
    if (req.method === 'GET' && url.pathname === '/printers') {
      return sendJson(req, res, 200, {
        ok: true,
        dryRun: !!activeConfig.dryRun,
        printers: activeConfig.printers || {},
      });
    }
    if (req.method === 'POST' && url.pathname === '/print') {
      return handlePrint(req, res);
    }
    return sendJson(req, res, 404, { ok: false, error: 'Not found' });
  };

  return {
    get baseUrl() {
      if (!httpServer?.address()) return '';
      const address = httpServer.address();
      return `http://127.0.0.1:${address.port}`;
    },
    start: () => new Promise(resolve => {
      httpServer = http.createServer(requestHandler);
      httpServer.listen(activeConfig.port, activeConfig.host, resolve);
    }),
    stop: () => new Promise(resolve => {
      if (!httpServer) return resolve();
      httpServer.close(resolve);
    }),
  };
};

if (require.main === module) {
  const server = createPrintBridgeServer();
  const config = loadConfig();
  server.start().then(() => {
    console.log(`Restaurant local print bridge listening on http://${config.host}:${config.port}`);
    console.log(`Mode: ${config.dryRun ? 'dry-run (no physical printing)' : 'raw printer output'}`);
  });
}

module.exports = {
  DEFAULT_OUTPUT_DIR,
  createPrintBridgeServer,
  writeDryRunJob,
};
