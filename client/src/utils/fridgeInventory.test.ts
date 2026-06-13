import {
  canItemEnterFridge,
  resolveFridgeItemOrder,
} from './fridgeInventory';

describe('fridge inventory helpers', () => {
  test('allows Cerveza, Bebida, and Jugo inventory categories into fridges', () => {
    const categories = [
      { key: 'cat_cerveza', name: 'Cerveza' },
      { key: 'cat_bebida', name: 'Bebida' },
      { key: 'cat_jugo', name: 'Jugo' },
      { key: 'ingredient', name: '食材' },
    ];

    expect(canItemEnterFridge({ category: 'cat_cerveza' }, categories)).toBe(true);
    expect(canItemEnterFridge({ category: 'cat_bebida' }, categories)).toBe(true);
    expect(canItemEnterFridge({ category: 'cat_jugo' }, categories)).toBe(true);
    expect(canItemEnterFridge({ category: 'ingredient' }, categories)).toBe(false);
  });

  test('uses cloud sortOrder before stale local order when resolving fridge item order', () => {
    const records = [
      { itemId: 'water', sortOrder: 2 },
      { itemId: 'beer', sortOrder: 0 },
      { itemId: 'juice', sortOrder: 1 },
    ];

    expect(resolveFridgeItemOrder(records, ['water', 'juice', 'beer'])).toEqual([
      'beer',
      'juice',
      'water',
    ]);
  });
});
