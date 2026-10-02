import { compactPurchaseExpenseCache, getPendingExpenseIds } from './purchaseLocalCache';

describe('purchase local expense cache recovery', () => {
  test('keeps current and pending expenses intact while removing cloud-reloadable receipt payloads', () => {
    const largeReceipt = `data:image/jpeg;base64,${'x'.repeat(10000)}`;
    const rows = [
      { id: 'current', createdAt: 4, receipt: largeReceipt },
      { id: 'pending', createdAt: 1, receipt: largeReceipt },
      { id: 'cloud-new', createdAt: 3, receipt: largeReceipt },
      { id: 'cloud-old', createdAt: 2, receipt: largeReceipt },
    ];
    const pending = [
      { collection: 'expenses', operation: 'update', id: 'pending' },
      { data: { __purchaseBatch: { expense: { id: 'current' } } } },
    ];

    const requiredIds = getPendingExpenseIds(pending, 'current');
    const compacted = compactPurchaseExpenseCache(rows, requiredIds, 3);

    expect(compacted.map(row => row.id)).toEqual(['current', 'pending', 'cloud-new']);
    expect(compacted.find(row => row.id === 'current')?.receipt).toBe(largeReceipt);
    expect(compacted.find(row => row.id === 'pending')?.receipt).toBe(largeReceipt);
    expect(compacted.find(row => row.id === 'cloud-new')?.receipt).toBeUndefined();
    expect(rows.find(row => row.id === 'cloud-new')?.receipt).toBe(largeReceipt);
  });

  test('does not remove cloud receipt URLs or deleted pending expenses', () => {
    const requiredIds = getPendingExpenseIds([
      { collection: 'expenses', operation: 'delete', id: 'deleted' },
    ]);
    const compacted = compactPurchaseExpenseCache([
      { id: 'cloud', createdAt: 2, receipt: 'https://example.com/receipt.jpg' },
      { id: 'deleted', createdAt: 1, receipt: `data:image/jpeg;base64,${'x'.repeat(10000)}` },
    ], requiredIds, 2);

    expect(requiredIds.has('deleted')).toBe(false);
    expect(compacted[0].receipt).toBe('https://example.com/receipt.jpg');
    expect(compacted[1].receipt).toBeUndefined();
  });
});
