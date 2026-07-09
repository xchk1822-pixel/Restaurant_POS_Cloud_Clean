const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePrintPayload,
  validatePrintPayload,
  PRINTER_ROLES,
} = require('../src/payload');

test('accepts cashier and kitchen roles from the POS payload', () => {
  assert.deepEqual(PRINTER_ROLES, ['cashier', 'kitchen', 'bar', 'report']);

  const cashier = validatePrintPayload({
    role: 'cashier',
    storeId: 'bluefields',
    orderNumber: '0707001',
    text: 'Recibo\nTotal C$190.00',
    html: '<html>receipt</html>',
    cut: true,
    cutCommandHex: '1D5600',
  });

  const kitchen = validatePrintPayload({
    printerRole: 'kitchen',
    storeId: 'bluefields',
    orderNumber: '0707002',
    text: 'COCINA\nArroz x1',
    cutCommandHex: '1d 56 00',
  });

  assert.equal(cashier.role, 'cashier');
  assert.equal(kitchen.role, 'kitchen');
});

test('rejects unknown roles and missing order numbers', () => {
  assert.throws(
    () => validatePrintPayload({ role: 'office', orderNumber: '0707001', text: 'x' }),
    /Unsupported printer role/
  );
  assert.throws(
    () => validatePrintPayload({ role: 'cashier', text: 'x' }),
    /orderNumber is required/
  );
});

test('normalizes cut command and printable fields', () => {
  const payload = normalizePrintPayload({
    role: 'cashier',
    orderNumber: 707001,
    widthMm: '80',
    text: '  Hola  ',
    html: '',
    cutCommandHex: '1d 56 00',
    feedLines: '4',
  });

  assert.equal(payload.orderNumber, '707001');
  assert.equal(payload.widthMm, 80);
  assert.equal(payload.text, 'Hola');
  assert.equal(payload.html, '');
  assert.equal(payload.cutCommandHex, '1D5600');
  assert.equal(payload.feedLines, 4);
  assert.equal(payload.cut, true);
});
