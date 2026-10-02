import {
  buildLowStockSuggestions,
  isInventoryItemLowStock,
} from './reorderSuggestions';

describe('low stock reorder suggestions', () => {
  test('does not report an item until a positive minimum stock is configured', () => {
    expect(isInventoryItemLowStock({ currentStock: 0, minStock: 0 })).toBe(false);
    expect(isInventoryItemLowStock({ currentStock: 5, minStock: 5 })).toBe(true);
  });

  test('combines warehouse and fridge stock and suggests replenishing to twice the threshold', () => {
    const result = buildLowStockSuggestions({
      inventoryItems: [{ id: 'drink', name: 'Drink', unit: 'BOT', currentStock: 2, minStock: 5, costPrice: 10 }],
      fridgeInventory: [{ itemId: 'drink', quantity: 3 }],
      suppliers: [],
      purchaseOrders: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ currentStock: 5, targetStock: 10, suggestedQuantity: 5 });
  });

  test('uses the preferred supplier before the latest purchase supplier', () => {
    const result = buildLowStockSuggestions({
      inventoryItems: [{
        id: 'beer', name: 'Beer', unit: 'BOT', currentStock: 1, minStock: 4, costPrice: 20,
        preferredSupplierId: 'preferred', preferredSupplierName: 'Preferred Supplier',
      }],
      fridgeInventory: [],
      suppliers: [
        { id: 'preferred', name: 'Preferred Supplier' },
        { id: 'recent', name: 'Recent Supplier' },
      ],
      purchaseOrders: [{
        id: 'order-1', supplierId: 'recent', supplierName: 'Recent Supplier', orderDate: '2026-07-12',
        items: [{ itemId: 'beer', quantity: 10, unitPrice: 18 }],
      }],
    });

    expect(result[0]).toMatchObject({
      supplierId: 'preferred', supplierName: 'Preferred Supplier', supplierSource: 'preferred', estimatedUnitCost: 18,
    });
  });

  test('falls back to the latest non-deleted purchase supplier and unit price', () => {
    const result = buildLowStockSuggestions({
      inventoryItems: [{ id: 'meat', name: 'Meat', unit: 'lb', currentStock: -1, minStock: 3, costPrice: 30 }],
      fridgeInventory: [],
      suppliers: [{ id: 'new-supplier', name: 'New Supplier' }],
      purchaseOrders: [
        { id: 'deleted', supplierId: 'old', orderDate: '2026-07-13', isDeleted: true, items: [{ itemId: 'meat', unitPrice: 99 }] },
        { id: 'latest', supplierId: 'new-supplier', orderDate: '2026-07-12', items: [{ itemId: 'meat', unitPrice: 25 }] },
      ],
    });

    expect(result[0]).toMatchObject({
      currentStock: -1,
      suggestedQuantity: 7,
      supplierName: 'New Supplier',
      supplierSource: 'latest-purchase',
      estimatedUnitCost: 25,
      estimatedAmount: 175,
    });
  });
});
