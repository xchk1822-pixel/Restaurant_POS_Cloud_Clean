import {
  buildFridgeStocktakeHistoryRecords,
  buildFridgeStocktakeSubmissionId,
  buildFridgeStocktakeViewItems,
  formatStocktakeRecordDateTime,
  getStocktakeRecordDateKey,
  normalizeFridgeInventoryForRefresh,
  normalizeFridgesForRefresh,
  normalizeInventoryItemsForRefresh,
  normalizeStocktakeHistoryForRefresh,
  saveFridgeItemOrderCache,
} from './stocktakeRefresh';

describe('stocktake refresh helpers', () => {
  test('keeps fridge switching usable when optional item-order cache is full', () => {
    const storage = {
      setItem: jest.fn(() => {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      }),
    };

    expect(saveFridgeItemOrderCache(storage, 'fridge-2-order', ['item-a', 'item-b'])).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      'fridge-2-order',
      JSON.stringify(['item-a', 'item-b'])
    );
  });

  test('reuses one submission id for retries of the same fridge count', () => {
    const input = {
      date: '2026-08-24',
      fridgeId: 'fridge-1',
      items: [
        { itemId: 'b', systemStock: 8, actualStock: 7 },
        { itemId: 'a', systemStock: 4, actualStock: 4 },
      ],
    };

    expect(buildFridgeStocktakeSubmissionId(input)).toBe(
      buildFridgeStocktakeSubmissionId({ ...input, items: [...input.items].reverse() })
    );
    expect(buildFridgeStocktakeSubmissionId(input)).not.toBe(
      buildFridgeStocktakeSubmissionId({
        ...input,
        items: [{ itemId: 'a', systemStock: 4, actualStock: 3 }],
      })
    );
  });

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

  test('makes stale fridge cache safe to render instead of crashing the selected fridge page', () => {
    const result = buildFridgeStocktakeViewItems(
      [{
        id: 'fridge-2-drink',
        fridgeId: 'fridge-2',
        itemId: 'drink',
        quantity: { stale: true },
        sortOrder: '4',
      }],
      [{
        id: 'drink',
        name: { stale: true },
        unit: 'BOT',
        barcode: 123456,
      }],
      'fridge-2',
      'Unknown item'
    );

    expect(result).toEqual([expect.objectContaining({
      itemId: 'drink',
      quantity: 0,
      sortOrder: 4,
      itemName: 'Unknown item',
      unit: 'BOT',
      barcode: '123456',
    })]);
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

  test('builds one fridge stocktake history record for each fridge', () => {
    const records = buildFridgeStocktakeHistoryRecords({
      fridges: [
        { id: 'beer', name: '1号冰箱' },
        { id: 'drink', name: '2号冰箱' },
      ],
      fridgeInventory: [
        { id: 'beer-a', fridgeId: 'beer', itemId: 'a', quantity: 10 },
        { id: 'drink-b', fridgeId: 'drink', itemId: 'b', quantity: 5 },
      ],
      inventoryItems: [
        { id: 'a', name: 'Toña', unit: 'BOT', currentStock: 20 },
        { id: 'b', name: 'Coca Cola', unit: 'BOT', currentStock: 30 },
      ],
      actualQuantities: { a: 8, b: 5 },
      now: 1000,
      date: '2026-06-13',
    });

    expect(records).toHaveLength(2);
    expect(records.map(record => record.fridgeId)).toEqual(['beer', 'drink']);
    expect(records[0].items[0]).toMatchObject({
      itemId: 'a',
      itemName: 'Toña',
      systemStock: 10,
      actualStock: 8,
      difference: -2,
    });
    expect(records[1].items[0]).toMatchObject({
      itemId: 'b',
      itemName: 'Coca Cola',
      systemStock: 5,
      actualStock: 5,
      difference: 0,
    });
    expect(records[0].totalDiscrepancies).toBe(1);
    expect(records[1].totalDiscrepancies).toBe(0);
  });

  test('uses fridge inventory as the source of truth when fridge master data is incomplete', () => {
    const records = buildFridgeStocktakeHistoryRecords({
      fridges: [
        { id: 'fridge-2', name: '2号冰箱' },
      ],
      fridgeInventory: [
        { id: 'one-a', fridgeId: 'fridge-1', fridgeName: '1号冰箱', itemId: 'a', itemName: 'Agua', quantity: 4 },
        { id: 'two-b', fridgeId: 'fridge-2', fridgeName: '2号冰箱', itemId: 'b', itemName: 'Toña', quantity: 8 },
        { id: 'three-c', fridgeId: 'fridge-3', fridgeName: '3号冰箱', itemId: 'c', itemName: 'Jugo', quantity: 6 },
      ],
      inventoryItems: [
        { id: 'a', name: 'Agua', unit: 'BOT', currentStock: 10 },
        { id: 'b', name: 'Toña', unit: 'BOT', currentStock: 12 },
        { id: 'c', name: 'Jugo', unit: 'BOT', currentStock: 5 },
      ],
      actualQuantities: { a: 4, b: 7, c: 6 },
      now: 1000,
      date: '2026-06-13',
    });

    expect(records.map(record => record.fridgeId)).toEqual(['fridge-1', 'fridge-2', 'fridge-3']);
    expect(records.map(record => record.fridgeName)).toEqual(['1号冰箱', '2号冰箱', '3号冰箱']);
  });
});
