import {
  buildSupplierAccountSnapshot,
  buildSupplierLedgerEntries,
  filterSupplierOrdersByDateRange,
  filterSupplierPaymentsByDateRange,
  getCurrentMonthSupplierRange,
  getPurchaseAccountLabel,
  getPurchaseRemainingDebt,
  summarizeSupplierLedgerEntries,
  getUnpaidPurchaseOrders
} from './supplierLedger';

describe('new supplier ledger module', () => {
  test('keeps cash purchase orders settled instead of treating them as supplier debt', () => {
    const cashOrder = {
      id: 'cash-1',
      supplierId: 'sup-1',
      orderNumber: 'CASH-001',
      paymentType: 'cash',
      totalAmount: 300,
      paidAmount: 300,
      orderDate: '2026-06-24',
      items: [{ itemName: 'Bebida', subtotal: 300 }]
    };

    expect(getPurchaseAccountLabel(cashOrder)).toBe('现付采购');
    expect(getPurchaseRemainingDebt(cashOrder)).toBe(0);
    expect(getUnpaidPurchaseOrders([cashOrder])).toEqual([]);
  });

  test('builds dated ledger entries with correct purchase and payment labels', () => {
    const entries = buildSupplierLedgerEntries(
      [
        {
          id: 'cash-1',
          supplierId: 'sup-1',
          orderNumber: 'CASH-001',
          paymentType: 'cash',
          totalAmount: 300,
          paidAmount: 300,
          orderDate: '2026-06-23',
          items: [{ itemName: 'Bebida', subtotal: 300 }]
        },
        {
          id: 'credit-1',
          supplierId: 'sup-1',
          orderNumber: 'CR-001',
          paymentType: 'credit',
          totalAmount: 500,
          paidAmount: 150,
          orderDate: '2026-06-24',
          items: [{ itemName: 'Verdura', subtotal: 500 }]
        }
      ],
      [
        {
          id: 'pay-1',
          supplierId: 'sup-1',
          orderId: 'credit-1',
          orderNumber: 'CR-001',
          amount: 150,
          paymentDate: '2026-06-24',
          paymentMethod: 'cash'
        }
      ]
    );

    expect(entries.map(entry => entry.dateKey)).toContain('2026-06-24');
    expect(entries.find(entry => entry.id === 'purchase-cash-1')).toMatchObject({
      label: '现付采购',
      paidAmount: 300,
      remainingDebt: 0
    });
    expect(entries.find(entry => entry.id === 'purchase-credit-1')).toMatchObject({
      label: '部分挂账',
      paidAmount: 150,
      remainingDebt: 350
    });
    expect(entries.find(entry => entry.id === 'payment-pay-1')).toMatchObject({
      label: '还款',
      dateKey: '2026-06-24',
      amount: 150
    });
  });

  test('summarizes supplier debt from purchase orders and paid amounts', () => {
    const summary = buildSupplierAccountSnapshot(
      { id: 'sup-1', name: 'Proveedor' },
      [
        { id: 'cash-1', supplierId: 'sup-1', paymentType: 'cash', totalAmount: 300, paidAmount: 300, orderDate: '2026-06-23' },
        { id: 'credit-1', supplierId: 'sup-1', paymentType: 'credit', totalAmount: 500, paidAmount: 150, orderDate: '2026-06-24' }
      ],
      [{ id: 'pay-1', supplierId: 'sup-1', amount: 150, paymentDate: '2026-06-24' }]
    );

    expect(summary.totalPurchase).toBe(800);
    expect(summary.totalPaid).toBe(450);
    expect(summary.totalDebt).toBe(350);
    expect(summary.unpaidOrderCount).toBe(1);
  });

  test('defaults supplier bill range to the current month', () => {
    expect(getCurrentMonthSupplierRange(new Date(2026, 5, 24))).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });
  });

  test('filters supplier bills and payments by selected date range', () => {
    const range = { startDate: '2026-06-01', endDate: '2026-06-30' };
    const orders = [
      { id: 'may-po', supplierId: 'sup-1', totalAmount: 100, paidAmount: 100, orderDate: '2026-05-31' },
      { id: 'jun-po', supplierId: 'sup-1', totalAmount: 300, paidAmount: 300, orderDate: '2026-06-15' },
      { id: 'jul-po', supplierId: 'sup-1', totalAmount: 500, paidAmount: 0, orderDate: '2026-07-01' }
    ];
    const payments = [
      { id: 'may-pay', supplierId: 'sup-1', amount: 50, paymentDate: '2026-05-31' },
      { id: 'jun-pay', supplierId: 'sup-1', amount: 70, paymentDate: '2026-06-20' }
    ];

    const filteredOrders = filterSupplierOrdersByDateRange(orders, range);
    const filteredPayments = filterSupplierPaymentsByDateRange(payments, range);
    const summary = summarizeSupplierLedgerEntries(buildSupplierLedgerEntries(filteredOrders, filteredPayments));

    expect(filteredOrders.map(order => order.id)).toEqual(['jun-po']);
    expect(filteredPayments.map(payment => payment.id)).toEqual(['jun-pay']);
    expect(summary).toEqual({
      purchaseAmount: 300,
      purchaseCount: 1,
      paymentAmount: 70,
      paymentCount: 1
    });
  });
});
