import { filterAndSortOrders, getOrderDateKey } from './orderHistory';

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
});
