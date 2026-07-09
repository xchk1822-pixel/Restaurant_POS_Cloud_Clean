export type PrinterRole = 'cashier' | 'kitchen' | 'bar' | 'report';

export const LOCAL_PRINT_BRIDGE_URL = 'http://127.0.0.1:17777/print';
export const ESC_POS_FULL_CUT_HEX = '1D5600';
export const ESC_POS_FULL_CUT = String.fromCharCode(0x1d, 0x56, 0x00);
const ESC = String.fromCharCode(0x1b);
const GS = String.fromCharCode(0x1d);
const ESC_POS_INIT = `${ESC}@`;
const ESC_POS_BOLD_ON = `${ESC}E\x01`;
const ESC_POS_BOLD_OFF = `${ESC}E\x00`;
const ESC_POS_UNDERLINE_ON = `${ESC}-\x01`;
const ESC_POS_UNDERLINE_OFF = `${ESC}-\x00`;
const ESC_POS_ALIGN_LEFT = `${ESC}a\x00`;
const ESC_POS_ALIGN_CENTER = `${ESC}a\x01`;
const ESC_POS_FONT_A = `${ESC}M\x00`;
const ESC_POS_PRINT_MODE_NORMAL = `${ESC}!\x00`;
const ESC_POS_PRINT_DENSITY_DARK = `${String.fromCharCode(0x12)}#\x08`;
const ESC_POS_DARKER_PRINT = `${ESC}7\x07\xff\x03`;
const ESC_POS_NORMAL_SIZE = `${GS}!\x00`;

export interface StoreReceiptProfile {
  nameLine1: string;
  nameLine2: string;
  addressLines: string[];
  phoneLine: string;
  footerLine: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price?: number;
  subtotal?: number;
  notes?: string;
}

export interface ReceiptTotals {
  consumo: number;
  discount: number;
  subtotal: number;
  tax: number;
  serviceFee: number;
  total: number;
}

export interface LocalPrintPayload {
  role: PrinterRole;
  printerRole: PrinterRole;
  storeId: string;
  orderNumber: string;
  widthMm: number;
  html: string;
  text: string;
  cut: boolean;
  cutCommandHex: string;
  feedLines: number;
  createdAt: string;
}

const money = (value: number | undefined) => `C$${(Number(value) || 0).toFixed(2)}`;
const amount = (value: number | undefined) => `${(Number(value) || 0).toFixed(2)}`;

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const splitAddress = (address: string) => String(address || '')
  .split(/\s*\n\s*|\s{2,}/)
  .map(line => line.trim())
  .filter(Boolean);

const getDateText = (value: Date) => {
  try {
    return new Date(value).toLocaleString('es-NI', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
};

const getReceiptDateText = (value: Date) => {
  try {
    return new Date(value).toLocaleString('es-NI', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
};

const stripControlCodes = (value: string) => [
  ESC_POS_INIT,
  ESC_POS_BOLD_ON,
  ESC_POS_BOLD_OFF,
  ESC_POS_UNDERLINE_ON,
  ESC_POS_UNDERLINE_OFF,
  ESC_POS_ALIGN_LEFT,
  ESC_POS_ALIGN_CENTER,
  ESC_POS_FONT_A,
  ESC_POS_PRINT_MODE_NORMAL,
  ESC_POS_PRINT_DENSITY_DARK,
  ESC_POS_DARKER_PRINT,
  ESC_POS_NORMAL_SIZE,
].reduce((text, code) => text.split(code).join(''), String(value || ''));

const safeLine = (value: any) => String(value ?? '').replace(/\s+/g, ' ').trim();
const emphasize = (value: any) => safeLine(value);
const underline = (value: any) => `${ESC_POS_UNDERLINE_ON}${safeLine(value)}${ESC_POS_UNDERLINE_OFF}`;

const splitTextLine = (value: string, maxLength: number): string[] => {
  const text = safeLine(value);
  if (!text) return [''];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let cutAt = remaining.lastIndexOf(' ', maxLength);
    if (cutAt < Math.floor(maxLength * 0.55)) cutAt = maxLength;
    chunks.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }
  chunks.push(remaining);
  return chunks;
};

const printableLength = (value: string) => stripControlCodes(value).length;

const padColumnsInset = (left: string, right: string, width: number, rightInset: number) => {
  const leftText = safeLine(left);
  const rightText = String(right || '');
  const inset = Math.max(0, Math.min(rightInset, 6));
  const available = Math.max(1, width - inset - printableLength(rightText));
  const visibleLeft = stripControlCodes(leftText).slice(0, Math.max(1, available - 1));
  const spaces = Math.max(1, available - visibleLeft.length);
  return `${visibleLeft}${' '.repeat(spaces)}${rightText}${' '.repeat(inset)}`;
};

const divider = (width: number, char = '-') => char.repeat(width);

export const buildStoreReceiptProfile = (store: any, currentUser?: any): StoreReceiptProfile => {
  const storeName = String(store?.receiptName || 'Restaurante Chino').trim();
  const subtitle = String(store?.receiptSubtitle || store?.receiptStoreName || '').trim();
  const address = String(store?.receiptAddress || store?.address || '').trim();
  const phone = String(store?.receiptPhone || store?.phone || '').trim();
  const footer = String(store?.receiptFooter || store?.code || store?.name || currentUser?.storeName || '').trim();

  return {
    nameLine1: storeName,
    nameLine2: subtitle,
    addressLines: splitAddress(address),
    phoneLine: phone,
    footerLine: footer,
  };
};

export const buildThermalReceiptText = ({
  storeProfile,
  orderNumber,
  orderTypeText,
  tableNumber,
  customerName,
  customerPhone,
  customerAddress,
  createdAt,
  items,
  totals,
  paymentLines,
  cashierName,
  widthMm = 80,
}: {
  storeProfile: StoreReceiptProfile;
  orderNumber: string;
  orderTypeText: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  createdAt: Date;
  items: ReceiptItem[];
  totals: ReceiptTotals;
  paymentLines: string[];
  cashierName?: string;
  widthMm?: 80 | 58 | number;
}) => {
  const lineWidth = widthMm >= 80 ? 42 : 30;
  const customer = customerName || 'Clientes Varios';
  const lines: string[] = [
    ESC_POS_INIT,
    ESC_POS_PRINT_MODE_NORMAL,
    ESC_POS_FONT_A,
    ESC_POS_PRINT_DENSITY_DARK,
    ESC_POS_DARKER_PRINT,
    ESC_POS_BOLD_ON,
    ESC_POS_NORMAL_SIZE,
    ESC_POS_ALIGN_CENTER,
    emphasize(storeProfile.nameLine1),
  ];

  if (storeProfile.nameLine2) lines.push(safeLine(storeProfile.nameLine2));
  storeProfile.addressLines.forEach(line => lines.push(...splitTextLine(line, lineWidth)));
  if (storeProfile.phoneLine) lines.push(...splitTextLine(storeProfile.phoneLine, lineWidth));

  lines.push(
    ESC_POS_ALIGN_LEFT,
    divider(lineWidth),
    padColumnsInset(getReceiptDateText(createdAt), emphasize(orderNumber), lineWidth, 4),
    emphasize(`${safeLine(orderTypeText)}${tableNumber ? ` ${safeLine(tableNumber)}` : ''}`),
    `Cliente: ${safeLine(customer)}`,
    `Tel: ${safeLine(customerPhone || 'NA')}`,
    `Dir: ${safeLine(customerAddress || 'NA')}`,
    divider(lineWidth),
    padColumnsInset('Desc. de Consumo', 'Total', lineWidth, 4),
    divider(lineWidth),
  );

  items.forEach(item => {
    splitTextLine(item.name, lineWidth).forEach((line, index) => {
      lines.push(index === 0 ? emphasize(line) : line);
    });
    lines.push(padColumnsInset(
      `${Number(item.quantity) || 0} x ${money(item.price)}`,
      amount(item.subtotal),
      lineWidth,
      4
    ));
    if (item.notes) lines.push(...splitTextLine(`Nota: ${item.notes}`, lineWidth));
  });

  lines.push(
    divider(lineWidth),
    padColumnsInset('Consumo C$', amount(totals.consumo), lineWidth, 4),
    padColumnsInset('Descuento C$', amount(totals.discount), lineWidth, 4),
    padColumnsInset('Sub Total C$', amount(totals.subtotal), lineWidth, 4),
    padColumnsInset('IVA C$', amount(totals.tax), lineWidth, 4),
    padColumnsInset('Propina Voluntaria C$', amount(totals.serviceFee), lineWidth, 4),
    padColumnsInset('TOTAL C$', amount(totals.total), lineWidth, 4),
    divider(lineWidth),
    underline('Formas de Pago'),
    ...(paymentLines.length > 0 ? paymentLines.map(safeLine) : ['Pendiente']),
  );

  if (cashierName) lines.push(`Atendido por: ${safeLine(cashierName)}`);
  if (storeProfile.footerLine) {
    lines.push(ESC_POS_ALIGN_CENTER, safeLine(storeProfile.footerLine), ESC_POS_ALIGN_LEFT);
  }
  lines.push(ESC_POS_ALIGN_CENTER, 'Gracias por su compra', ESC_POS_ALIGN_LEFT, ESC_POS_BOLD_OFF);

  return lines
    .map(line => stripControlCodes(line).length > lineWidth + 8 ? splitTextLine(line, lineWidth).join('\n') : line)
    .join('\n');
};

export const getCurrentStoreReceiptProfile = (): StoreReceiptProfile => {
  let currentUser: any = null;
  let store: any = null;

  try {
    const userRaw = localStorage.getItem('current_user');
    currentUser = userRaw ? JSON.parse(userRaw) : null;
    const storesRaw = localStorage.getItem('stores');
    const stores = storesRaw ? JSON.parse(storesRaw) : [];
    store = Array.isArray(stores)
      ? stores.find(record => String(record?.id || '') === String(currentUser?.storeId || ''))
      : null;
  } catch {
    store = null;
  }

  return buildStoreReceiptProfile(store, currentUser);
};

const totalsRow = (label: string, value: number, strong = false) => `
  <div class="${strong ? 'total-row total-strong' : 'total-row'}">
    <span>${escapeHtml(label)}</span>
    <span>${amount(value)}</span>
  </div>
`;

export const buildThermalReceiptHtml = ({
  storeProfile,
  orderNumber,
  orderTypeText,
  tableNumber,
  customerName,
  customerPhone,
  customerAddress,
  createdAt,
  items,
  totals,
  paymentLines,
  cashierName,
  widthMm = 80,
}: {
  storeProfile: StoreReceiptProfile;
  orderNumber: string;
  orderTypeText: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  createdAt: Date;
  items: ReceiptItem[];
  totals: ReceiptTotals;
  paymentLines: string[];
  cashierName?: string;
  widthMm?: 80 | 58 | number;
}) => {
  const contentWidth = widthMm >= 80 ? 72 : 52;
  const dateText = getDateText(createdAt);
  const customer = customerName || 'Clientes Varios';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recibo ${escapeHtml(orderNumber)}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: "Courier New", monospace; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt { box-sizing: border-box; width: ${contentWidth}mm; margin: 0 auto; padding: 4mm 1.5mm 12mm; font-size: 13px; line-height: 1.32; font-weight: 700; }
    .center { text-align: center; }
    .store-title { font-size: 17px; font-weight: 700; line-height: 1.2; text-transform: uppercase; }
    .store-subtitle { font-size: 14px; font-weight: 400; line-height: 1.2; text-transform: uppercase; }
    .muted { font-size: 12px; font-weight: 700; }
    .row, .total-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 4mm; align-items: baseline; column-gap: 6px; min-width: 0; }
    .row > span:last-child, .total-row > span:last-child { grid-column: 2; }
    .receipt-meta { display: grid; grid-template-columns: minmax(0, 1fr) auto 4mm; align-items: baseline; column-gap: 4px; }
    .receipt-meta span { min-width: 0; overflow-wrap: anywhere; }
    .receipt-meta strong { grid-column: 2; white-space: nowrap; flex-shrink: 0; padding-left: 4px; }
    .divider { border-top: 1px dashed #111; margin: 6px 0; }
    .solid { border-top: 1px solid #111; margin: 6px 0; }
    .section-title { font-weight: 700; }
    .item { margin: 5px 0; }
    .item-name { font-weight: 700; overflow-wrap: anywhere; }
    .item-meta { display: grid; grid-template-columns: minmax(0, 1fr) auto 4mm; column-gap: 6px; padding-left: 8px; }
    .item-meta span:last-child { grid-column: 2; }
    .total-strong { font-size: 16px; font-weight: 700; margin-top: 4px; }
    .cut-feed { height: 18mm; }
    @media screen {
      body { background: #f3f4f6; padding: 12px 0; }
      .receipt { background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
      .toolbar { display: flex; gap: 8px; width: ${contentWidth}mm; margin: 0 auto 8px; }
      .toolbar button { flex: 1; border: 0; padding: 10px; border-radius: 4px; color: #fff; font-weight: 500; cursor: pointer; }
      .print-btn { background: #2563eb; }
      .back-btn { background: #6b7280; }
    }
    @media print {
      .toolbar { display: none !important; }
      .receipt { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="print-btn" onclick="window.print()">Imprimir</button>
    <button class="back-btn" onclick="window.close()">Volver</button>
  </div>
  <div class="receipt" data-receipt-width="${widthMm}" data-printer-role="cashier">
    <div class="center">
      <div class="store-title">${escapeHtml(storeProfile.nameLine1)}</div>
      ${storeProfile.nameLine2 ? `<div class="store-subtitle">${escapeHtml(storeProfile.nameLine2)}</div>` : ''}
      ${storeProfile.addressLines.map(line => `<div class="muted">${escapeHtml(line)}</div>`).join('')}
      ${storeProfile.phoneLine ? `<div class="muted">${escapeHtml(storeProfile.phoneLine)}</div>` : ''}
    </div>
    <div class="divider"></div>
    <div class="row receipt-meta"><span>${escapeHtml(dateText)}</span><strong>${escapeHtml(orderNumber)}</strong></div>
    <div class="section-title">${escapeHtml(orderTypeText)}${tableNumber ? ` ${escapeHtml(tableNumber)}` : ''}</div>
    <div>Cliente: ${escapeHtml(customer)}</div>
    <div>Tel: ${escapeHtml(customerPhone || 'NA')}</div>
    <div>Dir: ${escapeHtml(customerAddress || 'NA')}</div>
    <div class="solid"></div>
    <div class="row section-title"><span>Desc. de Consumo</span><span>Total</span></div>
    <div class="solid"></div>
    ${items.map(item => `
      <div class="item">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">
          <span>${Number(item.quantity) || 0} x ${money(item.price)}</span>
          <span>${amount(item.subtotal)}</span>
        </div>
        ${item.notes ? `<div class="muted">Nota: ${escapeHtml(item.notes)}</div>` : ''}
      </div>
    `).join('')}
    <div class="solid"></div>
    ${totalsRow('Consumo C$', totals.consumo)}
    ${totalsRow('Descuento C$', totals.discount)}
    ${totalsRow('Sub Total C$', totals.subtotal)}
    ${totalsRow('IVA C$', totals.tax)}
    ${totalsRow('Propina Voluntaria C$', totals.serviceFee)}
    ${totalsRow('Total C$', totals.total, true)}
    <div class="divider"></div>
    <div class="section-title">Formas de Pago</div>
    ${paymentLines.length > 0 ? paymentLines.map(line => `<div>${escapeHtml(line)}</div>`).join('') : '<div>Pendiente</div>'}
    ${cashierName ? `<div class="muted">Atendido por: ${escapeHtml(cashierName)}</div>` : ''}
    ${storeProfile.footerLine ? `<div class="center muted">${escapeHtml(storeProfile.footerLine)}</div>` : ''}
    <div class="center muted">Gracias por su compra</div>
    <div class="cut-feed"></div>
  </div>
  <script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;
};

export const buildLocalPrintPayload = ({
  role,
  storeId,
  orderNumber,
  html,
  text,
  widthMm = 80,
}: {
  role: PrinterRole;
  storeId: string;
  orderNumber: string;
  html: string;
  text: string;
  widthMm?: number;
}): LocalPrintPayload => ({
  role,
  printerRole: role,
  storeId,
  orderNumber,
  widthMm,
  html,
  text,
  cut: true,
  cutCommandHex: ESC_POS_FULL_CUT_HEX,
  feedLines: 8,
  createdAt: new Date().toISOString(),
});

export const buildKitchenTicketPayload = ({
  storeId,
  orderNumber,
  orderTypeText,
  tableNumber,
  createdAt,
  items,
}: {
  storeId: string;
  orderNumber: string;
  orderTypeText: string;
  tableNumber?: string;
  createdAt: Date;
  items: ReceiptItem[];
}) => {
  const lines = [
    '******** COCINA ********',
    `${orderTypeText}${tableNumber ? ` ${tableNumber}` : ''}`,
    `Pedido: ${orderNumber}`,
    getDateText(createdAt),
    '------------------------',
    ...items.map(item => `${item.name} x${Number(item.quantity) || 0}${item.notes ? ` (${item.notes})` : ''}`),
    '------------------------',
  ];

  return buildLocalPrintPayload({
    role: 'kitchen',
    storeId,
    orderNumber,
    widthMm: 80,
    text: lines.join('\n'),
    html: `<pre data-printer-role="kitchen">${escapeHtml(lines.join('\n'))}</pre>`,
  });
};

export const printViaLocalBridge = async (
  payload: LocalPrintPayload,
  options: { timeoutMs?: number; endpoint?: string } = {}
): Promise<{ success: boolean; error?: string }> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 900);
  try {
    const response = await fetch(options.endpoint || LOCAL_PRINT_BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      targetAddressSpace: 'local',
    } as RequestInit & { targetAddressSpace: 'local' });
    return { success: response.ok, error: response.ok ? undefined : `http-${response.status}` };
  } catch (error: any) {
    return { success: false, error: error?.name || 'local-print-unavailable' };
  } finally {
    window.clearTimeout(timeout);
  }
};

export const openBrowserPrintWindow = (html: string) => {
  const printWindow = window.open('', '_blank', 'width=520,height=720');
  if (!printWindow) return false;
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
};
