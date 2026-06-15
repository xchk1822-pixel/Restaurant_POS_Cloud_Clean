import {
  filterAndSortOrders,
  getOrderCancellationRecords,
  getOrderCancellationSummary,
  getOrderDateKey,
} from './orderHistory';

describe('order history helpers', () => {
  test('sorts filtered orders newest first', () => {
    const orders = [
      { id: 'old', createdAt: '2026-06-10T10:00:00.000Z', status: 'completed', orderType: 'dine_in' },
      { id: 'new', createdAt: '2026-06-11T10:00:00.000Z', status: 'completed', orderType: 'dine_in' },
    ];

    const result = filterAndSortOrders(orders, {
      searchKeyword: '',
      status: 'all',
      orderType: 'all',
      startDate: '',
      endDate: '',
    });

    expect(result.map(order => order.id)).toEqual(['new', 'old']);
  });

  test('filters by local date key', () => {
    const orders = [
      { id: 'a', createdAt: '2026-06-11T10:00:00.000Z', status: 'completed', orderType: 'takeout' },
      { id: 'b', createdAt: '2026-06-12T10:00:00.000Z', status: 'completed', orderType: 'delivery' },
    ];

    const result = filterAndSortOrders(orders, {
      searchKeyword: '',
      status: 'all',
      orderType: 'all',
      startDate: getOrderDateKey(orders[0]),
      endDate: getOrderDateKey(orders[0]),
    });

    expect(result.map(order => order.id)).toEqual(['a']);
  });

  test('collects full-order and item-level cancellation records', () => {
    const order = {
      id: 'order-1',
      cancelReason: 'customer left',
      cancelledBy: 'manager',
      cancelledAt: '2026-06-15T12:00:00.000Z',
      cancelRecords: [
        {
          id: 'record-1',
          itemName: 'Chicken',
          quantity: 2,
          reason: 'customer left',
          cancelledBy: 'manager',
          cancelledAt: '2026-06-15T12:00:00.000Z',
        },
      ],
      items: [
        {
          id: 'item-1',
          name: 'Soup',
          cancelRecords: [
            {
              id: 'record-2',
              quantity: 1,
              reason: 'wrong item',
              cancelledBy: 'cashier',
              cancelledAt: '2026-06-15T12:05:00.000Z',
            },
          ],
        },
      ],
    };

    expect(getOrderCancellationSummary(order)).toMatchObject({
      reason: 'customer left',
      cancelledBy: 'manager',
      cancelledAt: '2026-06-15T12:00:00.000Z',
    });
    expect(getOrderCancellationRecords(order)).toEqual([
      expect.objectContaining({ itemName: 'Chicken', quantity: 2 }),
      expect.objectContaining({ itemName: 'Soup', quantity: 1 }),
    ]);
  });
});
