import {
  dedupeOwnerRecordsById,
  dedupeOwnerRecordsByStoreAndId,
  buildOwnerExpenseEvidenceRows,
  summarizeOwnerOrderTypes,
  sumOwnerExpenseByKind,
  sumOwnerSupplierDebt,
} from './ownerDashboardData';

describe('owner dashboard data helpers', () => {
  test('deduplicates records by id and keeps the newest version', () => {
    const records = [
      { id: 'store-a', name: 'Old Store', updatedAt: '2026-01-01 10:00:00' },
      { id: 'store-a', name: 'New Store', lastModified: 1781143901975 },
      { id: 'store-b', name: 'Other Store', lastModified: 1 },
    ];

    expect(dedupeOwnerRecordsById(records)).toEqual([
      { id: 'store-a', name: 'New Store', lastModified: 1781143901975 },
      { id: 'store-b', name: 'Other Store', lastModified: 1 },
    ]);
  });

  test('ignores deleted records while deduplicating', () => {
    const records = [
      { id: 'store-a', name: 'Active Store', lastModified: 1 },
      { id: 'store-b', name: 'Deleted Store', isDeleted: true, lastModified: 2 },
    ];

    expect(dedupeOwnerRecordsById(records)).toEqual([
      { id: 'store-a', name: 'Active Store', lastModified: 1 },
    ]);
  });

  test('splits paid purchase expense from operating expense', () => {
    const expenses = [
      { id: 'purchase-1', amount: 100, relatedType: 'purchase' },
      { id: 'repayment-1', amount: 40, relatedType: 'supplier_repayment' },
      { id: 'rent-1', amount: 25, categoryId: 'rent' },
    ];

    expect(sumOwnerExpenseByKind(expenses, 'purchase')).toBe(140);
    expect(sumOwnerExpenseByKind(expenses, 'operating')).toBe(25);
  });

  test('calculates supplier debt from unpaid purchase balance', () => {
    const purchases = [
      { id: 'cash-1', totalAmount: 100, paidAmount: 100 },
      { id: 'credit-1', totalAmount: 300, paidAmount: 80 },
      { id: 'deleted-1', totalAmount: 999, paidAmount: 0, isDeleted: true },
    ];

    expect(sumOwnerSupplierDebt(purchases)).toBe(220);
  });

  test('deduplicates owner records by store and id without merging different stores', () => {
    const records = [
      { id: 'order-1', storeId: 'store-a', totalAmount: 100, lastModified: 1 },
      { id: 'order-1', storeId: 'store-a', totalAmount: 120, lastModified: 2 },
      { id: 'order-1', storeId: 'store-b', totalAmount: 300, lastModified: 1 },
    ];

    expect(dedupeOwnerRecordsByStoreAndId(records)).toEqual([
      { id: 'order-1', storeId: 'store-a', totalAmount: 120, lastModified: 2 },
      { id: 'order-1', storeId: 'store-b', totalAmount: 300, lastModified: 1 },
    ]);
  });

  test('builds owner expense evidence rows from receipts and purchase invoices', () => {
    const rows = buildOwnerExpenseEvidenceRows(
      [
        {
          id: 'expense-1',
          storeId: 'store-a',
          storeName: 'Bluefields',
          date: '2026-06-21',
          description: 'Taxi',
          amount: 80,
          receipt: 'data:image/png;base64,receipt',
        },
      ],
      [
        {
          id: 'purchase-1',
          storeId: 'store-a',
          storeName: 'Bluefields',
          orderNumber: 'INV-1',
          supplierName: 'Bebidas',
          totalAmount: 500,
          invoiceImage: 'data:image/png;base64,invoice',
        },
      ]
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'expense:expense-1',
        kind: 'operating',
        storeName: 'Bluefields',
        title: 'Taxi',
        image: 'data:image/png;base64,receipt',
      }),
      expect.objectContaining({
        id: 'purchase:purchase-1',
        kind: 'purchase',
        storeName: 'Bluefields',
        title: 'Bebidas - INV-1',
        image: 'data:image/png;base64,invoice',
      }),
    ]);
  });

  test('summarizes owner orders by Mesa Barra and Delivery', () => {
    const summary = summarizeOwnerOrderTypes([
      { id: 'mesa-1', orderType: 'dine_in', totalAmount: 100, paymentStatus: 'paid' },
      { id: 'mesa-2', totalAmount: 200, status: 'completed' },
      { id: 'barra-1', orderType: 'takeout', totalAmount: 50, paymentStatus: 'paid' },
      { id: 'delivery-1', orderType: 'delivery', totalAmount: 70, paymentStatus: 'paid' },
      { id: 'empty', orderType: 'delivery', totalAmount: 0, paymentStatus: 'paid' },
    ]);

    expect(summary).toEqual({
      mesa: 2,
      barra: 1,
      delivery: 1,
    });
  });
});
