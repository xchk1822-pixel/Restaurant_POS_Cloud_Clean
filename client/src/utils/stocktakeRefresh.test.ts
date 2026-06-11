import {
  normalizeFridgeInventoryForRefresh,
  normalizeFridgesForRefresh,
  normalizeInventoryItemsForRefresh,
} from './stocktakeRefresh';

describe('stocktake refresh helpers', () => {
  test('normalizes cloud inventory items without preserving local-only records', () => {
    const cloudItems = [
      {
        id: 'cloud-item',
        name: 'Cloud Item',
        currentStock: '12',
        minStock: '3',
        costPrice: '4.5',
        salePrice: '8',
        lastUpdated: '2026-06-11T10:00:00.000Z',
      },
    ];

    const result = normalizeInventoryItemsForRefresh(cloudItems);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cloud-item');
    expect(result[0].currentStock).toBe(12);
    expect(result[0].minStock).toBe(3);
    expect(result[0].costPrice).toBe(4.5);
    expect(result[0].salePrice).toBe(8);
    expect(result[0].lastUpdated).toBeInstanceOf(Date);
  });

  test('normalizes fridge active records from cloud data only', () => {
    const fridges = normalizeFridgesForRefresh([
      { id: 'main', name: 'Main Fridge', createdAt: '2026-06-11T09:00:00.000Z' },
    ]);
    const inventory = normalizeFridgeInventoryForRefresh([
      { id: 'main-drink', fridgeId: 'main', itemId: 'drink', quantity: '7', lastModified: '100' },
    ]);

    expect(fridges).toHaveLength(1);
    expect(fridges[0].createdAt).toBeInstanceOf(Date);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].quantity).toBe(7);
    expect(inventory[0].lastModified).toBe(100);
  });
});
