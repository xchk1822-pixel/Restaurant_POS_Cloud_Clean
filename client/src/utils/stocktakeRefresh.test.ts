import {
  formatStocktakeRecordDateTime,
  getStocktakeRecordDateKey,
  normalizeFridgeInventoryForRefresh,
  normalizeFridgesForRefresh,
  normalizeInventoryItemsForRefresh,
  normalizeStocktakeHistoryForRefresh,
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
      { id: 'main-drink', fridgeId: 'main', itemId: 'drink', quantity: '7', sortOrder: '3', lastModified: '100' },
    ]);

    expect(fridges).toHaveLength(1);
    expect(fridges[0].createdAt).toBeInstanceOf(Date);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].quantity).toBe(7);
    expect(inventory[0].sortOrder).toBe(3);
    expect(inventory[0].lastModified).toBe(100);
  });

  test('keeps local date-only stocktake records on the selected Nicaragua date', () => {
    const record = { date: '2026-06-13', createdAt: '2026-06-13 09:30:00' };

    expect(getStocktakeRecordDateKey(record)).toBe('2026-06-13');
    expect(formatStocktakeRecordDateTime(record)).toContain('2026');
  });

  test('normalizes stocktake history newest first for refresh caches', () => {
    const result = normalizeStocktakeHistoryForRefresh([
      { id: 'old', date: '2026-06-11', lastModified: 100 },
      { id: 'new', date: '2026-06-13', lastModified: 300 },
      { id: 'middle', date: '2026-06-12', lastModified: 200 },
    ]);

    expect(result.map(record => record.id)).toEqual(['new', 'middle', 'old']);
    expect(result[0].date).toBe('2026-06-13');
  });
});
