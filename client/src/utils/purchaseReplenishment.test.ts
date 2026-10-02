import { buildReplenishmentPurchaseDraft, mergePurchaseOrderRange } from './purchaseReplenishment';

const suggestion = {
  itemId: 'item-1',
  itemName: 'Bebida',
  unit: 'bot',
  currentStock: 2,
  minStock: 5,
  targetStock: 10,
  suggestedQuantity: 8,
  supplierId: 'supplier-1',
  supplierName: 'Proveedor Uno',
  supplierSource: 'preferred' as const,
  estimatedUnitCost: 12.3,
  estimatedAmount: 98.4,
};

describe('supplier replenishment purchase loop', () => {
  test('builds a supplier-linked purchase draft from a low-stock suggestion', () => {
    expect(buildReplenishmentPurchaseDraft(suggestion)).toEqual({
      supplierId: 'supplier-1',
      paymentType: 'credit',
      notes: '由低库存补货建议生成',
      source: 'reorder_suggestion',
      reorderSuggestionItemIds: ['item-1'],
      items: [{
        itemId: 'item-1',
        itemName: 'Bebida',
        quantity: 8,
        unitPrice: 12.3,
        subtotal: 98.4,
      }],
    });
  });

  test('does not create a purchase draft before the supplier is linked', () => {
    expect(buildReplenishmentPurchaseDraft({
      ...suggestion,
      supplierId: '',
      supplierName: '未关联供应商',
      supplierSource: 'unlinked',
    })).toBeNull();
  });

  test('replaces only the selected purchase date range and preserves older history', () => {
    const current = [
      { id: 'today-old', orderDate: '2026-07-13', totalAmount: 10 },
      { id: 'history', orderDate: '2026-06-30', totalAmount: 20 },
    ];
    const incoming = [{ id: 'today-new', orderDate: '2026-07-13', totalAmount: 30 }];

    expect(mergePurchaseOrderRange(current, incoming, '2026-07-13', '2026-07-13')).toEqual([
      incoming[0],
      current[1],
    ]);
  });
});
