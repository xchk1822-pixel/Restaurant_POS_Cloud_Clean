import {
  ESC_POS_FULL_CUT_HEX,
  buildLocalPrintPayload,
  buildStoreReceiptProfile,
  buildThermalReceiptText,
  buildThermalReceiptHtml,
  buildKitchenTicketPayload,
} from './receiptPrinter';

const stripReceiptControls = (value: string) => value
  .replace(/\x1B@/g, '')
  .replace(/\x1B!\x00/g, '')
  .replace(/\x1BM\x00/g, '')
  .replace(/\x12#\x08/g, '')
  .replace(/\x1B7\x07\xff\x03/g, '')
  .replace(/\x1BE[\x00\x01]/g, '')
  .replace(/\x1B-[\x00\x01]/g, '')
  .replace(/\x1Ba[\x00\x01]/g, '')
  .replace(/\x1D!\x00/g, '');

describe('receipt printer helpers', () => {
  test('builds an 80mm receipt with store phone and address', () => {
    const profile = buildStoreReceiptProfile({
      id: 'store_1',
      name: 'COMIDA CHINA BLUEFIELDS',
      receiptName: 'COMIDA CHINA BLUEFIELDS',
      code: 'bluefields',
      address: 'Calle Stephen, BAC 1/2 c al Sur, frente al Colegio San Marcos Primaria',
      phone: 'Tigo:7542 4688, Claro:5830 1539',
    }, { storeName: 'Bluefields' });

    const html = buildThermalReceiptHtml({
      storeProfile: profile,
      orderNumber: '0707003',
      orderTypeText: 'Barra',
      tableNumber: '',
      customerName: 'Clientes Varios',
      customerPhone: '',
      customerAddress: '',
      createdAt: new Date('2026-07-07T10:21:00-06:00'),
      items: [
        { name: 'Arroz Chino Pollo con camarones', quantity: 1, price: 260, subtotal: 260 },
      ],
      totals: {
        consumo: 260,
        discount: 0,
        subtotal: 260,
        tax: 0,
        serviceFee: 0,
        total: 260,
      },
      paymentLines: ['Efectivo C$260.00'],
      cashierName: 'zeng',
      widthMm: 80,
    });

    expect(html).toContain('@page { size: 80mm auto; margin: 0; }');
    expect(html).toContain('COMIDA CHINA BLUEFIELDS');
    expect(html).toContain('Tigo:7542 4688, Claro:5830 1539');
    expect(html).toContain('Desc. de Consumo');
    expect(html).toContain('Arroz Chino Pollo con camarones');
    expect(html).toContain('Total C$');
    expect(html).toContain('<span>1 x C$260.00</span>');
    expect(html).toContain('<span>260.00</span>');
    expect(html).toContain('<span>Total C$</span>');
    expect(html).not.toContain('<span>C$260.00</span>');
    expect(html).toContain('font-weight: 700');
    expect(html).not.toContain('font-weight: 900');
    expect(html).not.toContain('font-weight: 800');
    expect(html).not.toContain('font-weight: 650');
    expect(html).not.toContain('max-width: 300px');
  });

  test('receipt header uses the configured receipt name instead of the branch name', () => {
    const configured = buildStoreReceiptProfile({
      id: 'store_1',
      name: 'BLUEFIELDS',
      receiptName: 'REST ANO NUEVO CHINO',
      receiptPhone: 'Tigo 7542 4688 Claro 5830 1539',
    }, { storeName: 'Bluefields' });

    expect(configured.nameLine1).toBe('REST ANO NUEVO CHINO');
    expect(configured.phoneLine).toBe('Tigo 7542 4688 Claro 5830 1539');

    const fallback = buildStoreReceiptProfile({
      id: 'store_1',
      name: 'BLUEFIELDS',
    }, { storeName: 'Bluefields' });

    expect(fallback.nameLine1).toBe('Restaurante Chino');
    expect(fallback.nameLine1).not.toBe('BLUEFIELDS');
  });

  test('builds clear raw receipt text with global darker printing and inset amount columns', () => {
    const profile = buildStoreReceiptProfile({
      receiptName: 'REST ANO NUEVO CHINO',
      receiptPhone: 'Tigo 7542 4688 Claro 5830 1539',
    });

    const text = buildThermalReceiptText({
      storeProfile: profile,
      orderNumber: '070800',
      orderTypeText: 'Barra',
      createdAt: new Date('2026-07-08T13:36:00-06:00'),
      items: [
        { name: 'Arroz Chino Especial', quantity: 1, price: 460, subtotal: 460 },
      ],
      totals: {
        consumo: 460,
        discount: 0,
        subtotal: 460,
        tax: 0,
        serviceFee: 0,
        total: 460,
      },
      paymentLines: ['Efectivo C$460.00'],
      cashierName: 'zeng',
      widthMm: 80,
    });

    expect(text).toContain('\x1B@');
    expect(text).toContain('\x1BM\x00');
    expect(text).toContain('\x1B!\x00');
    expect(text).toContain('\x12#\x08');
    expect(text).toContain('\x1B7\x07\xff\x03');
    expect(text).toContain('\x1BE\x01');
    expect(text).toContain('REST ANO NUEVO CHINO');
    expect(text).toContain('070800    ');
    expect(text).toContain('Arroz Chino Especial');
    expect(text).toContain('TOTAL C$');
    expect(text).toContain('\x1B-\x01Formas de Pago\x1B-\x00');
    expect(text).toContain('1 x C$460.00');
    expect(text).toContain('460.00    ');
    expect(text).not.toContain('C$460.00 C$460.00');
    expect(text).not.toContain('\x1D!\x01');
    expect(text).not.toContain('Pedido: 070800');
    const printableLines = stripReceiptControls(text).split(/\r?\n/);
    const orderLine = printableLines.find(line => line.includes('070800'));
    const itemAmountLine = printableLines.find(line => line.includes('1 x C$460.00'));
    const totalLine = printableLines.find(line => line.includes('TOTAL C$'));
    expect(orderLine).toBeTruthy();
    expect(orderLine).toMatch(/\s{4}$/);
    expect(itemAmountLine).toMatch(/460\.00\s{4}$/);
    expect(totalLine).toMatch(/460\.00\s{4}$/);
    expect(printableLines.every(line => line.length <= 42)).toBe(true);
  });

  test('builds local printer payloads with bridge-managed cut and enough feed', () => {
    const payload = buildLocalPrintPayload({
      role: 'cashier',
      storeId: 'store_1',
      orderNumber: '0707003',
      html: '<html>receipt</html>',
      text: 'receipt text',
      widthMm: 80,
    });

    expect(payload.role).toBe('cashier');
    expect(payload.widthMm).toBe(80);
    expect(payload.cut).toBe(true);
    expect(payload.cutCommandHex).toBe(ESC_POS_FULL_CUT_HEX);
    expect(payload.feedLines).toBe(8);
    expect(payload.text).not.toContain('\x1D\x56\x00');
  });

  test('builds kitchen ticket payload for the kitchen printer role only', () => {
    const payload = buildKitchenTicketPayload({
      storeId: 'store_1',
      orderNumber: '0707004',
      orderTypeText: 'Mesa',
      tableNumber: '6',
      createdAt: new Date('2026-07-07T10:22:00-06:00'),
      items: [
        { name: 'Chop Suey Pollo', quantity: 2 },
      ],
    });

    expect(payload.role).toBe('kitchen');
    expect(payload.cut).toBe(true);
    expect(payload.cutCommandHex).toBe(ESC_POS_FULL_CUT_HEX);
    expect(payload.text).toContain('COCINA');
    expect(payload.text).toContain('Mesa 6');
    expect(payload.text).toContain('Chop Suey Pollo x2');
  });

  test('local bridge fetch opts into browser local network access', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(process.cwd(), 'src/utils/receiptPrinter.ts'), 'utf8');

    expect(source).toContain("targetAddressSpace: 'local'");
  });
});
