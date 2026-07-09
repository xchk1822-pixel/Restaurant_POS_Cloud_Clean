const PRINTER_ROLES = ['cashier', 'kitchen', 'bar', 'report'];
const DEFAULT_CUT_COMMAND_HEX = '1D5600';

const normalizeHex = value => {
  const hex = String(value || DEFAULT_CUT_COMMAND_HEX)
    .replace(/[^a-fA-F0-9]/g, '')
    .toUpperCase();
  return hex || DEFAULT_CUT_COMMAND_HEX;
};

const normalizePositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const normalizePrintPayload = payload => {
  const role = String(payload?.role || payload?.printerRole || '').trim();
  return {
    role,
    printerRole: role,
    storeId: String(payload?.storeId || '').trim(),
    orderNumber: String(payload?.orderNumber || '').trim(),
    widthMm: normalizePositiveNumber(payload?.widthMm, 80),
    html: String(payload?.html || ''),
    text: String(payload?.text || '').trim(),
    cut: payload?.cut !== false,
    cutCommandHex: normalizeHex(payload?.cutCommandHex),
    feedLines: normalizePositiveNumber(payload?.feedLines, 4),
    createdAt: payload?.createdAt ? String(payload.createdAt) : new Date().toISOString(),
  };
};

const validatePrintPayload = payload => {
  const normalized = normalizePrintPayload(payload);

  if (!PRINTER_ROLES.includes(normalized.role)) {
    throw new Error(`Unsupported printer role: ${normalized.role || '(empty)'}`);
  }
  if (!normalized.orderNumber) {
    throw new Error('orderNumber is required');
  }
  if (!normalized.text && !normalized.html) {
    throw new Error('text or html is required');
  }

  return normalized;
};

module.exports = {
  DEFAULT_CUT_COMMAND_HEX,
  PRINTER_ROLES,
  normalizePrintPayload,
  validatePrintPayload,
};
