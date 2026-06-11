import {
  dedupeOwnerRecordsById,
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
});
