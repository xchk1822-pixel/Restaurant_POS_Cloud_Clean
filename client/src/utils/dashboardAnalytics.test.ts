import {
  buildExpenseRankingComparison,
  buildExpenseRankings,
  buildMonthlySalesCalendar,
  buildPeriodComparison,
  buildRankingComparison,
  buildSalesRankings,
  normalizeDashboardRange,
} from './dashboardAnalytics';

const paidOrder = (overrides: any) => ({
  id: overrides.id,
  status: 'completed',
  paymentStatus: 'paid',
  paymentMethod: 'cash',
  totalAmount: overrides.totalAmount,
  completedAt: overrides.completedAt,
  orderType: overrides.orderType || 'dine_in',
  items: overrides.items || [],
});

describe('dashboardAnalytics', () => {
  test('builds expense rankings by supplier payments and parent-child operating categories', () => {
    const expenses = [
      { id: 'e1', date: '2026-06-10', amount: 120, categoryId: 'electric' },
      { id: 'e2', date: '2026-06-11', amount: 80, categoryId: 'cleaning' },
      { id: 'p1', date: '2026-06-12', amount: 300, relatedType: 'purchase', supplierName: 'A供应商饮料', orderNumber: 'P-1' },
    ];
    const categories = [
      { id: 'parent-utilities', name: '房租水电', level: 'parent' },
      { id: 'electric', name: '电费', level: 'child', parentId: 'parent-utilities' },
      { id: 'parent-ops', name: '运营杂费', level: 'parent' },
      { id: 'cleaning', name: '清洁用品', level: 'child', parentId: 'parent-ops' },
    ];

    const rankings = buildExpenseRankings(expenses, categories, [], {
      scope: 'all',
      sortBy: 'amount',
      topN: 10,
    });

    expect(rankings[0]).toMatchObject({
      label: 'A供应商饮料',
      parentCategory: '采购付款',
      fullCategory: 'A供应商饮料',
      type: 'purchase',
      count: 1,
      amount: 300,
      amountShare: 60,
    });
    expect(rankings).toContainEqual(expect.objectContaining({
      label: '电费',
      parentCategory: '房租水电',
      fullCategory: '房租水电 / 电费',
      type: 'operating',
      amount: 120,
      amountShare: 24,
    }));
    expect(rankings).toContainEqual(expect.objectContaining({
      label: '清洁用品',
      parentCategory: '运营杂费',
      fullCategory: '运营杂费 / 清洁用品',
      amount: 80,
      amountShare: 16,
    }));
  });

  test('compares expense rankings with previous period movement', () => {
    const categories = [
      { id: 'parent-utilities', name: '房租水电', level: 'parent' },
      { id: 'electric', name: '电费', level: 'child', parentId: 'parent-utilities' },
      { id: 'parent-ops', name: '运营杂费', level: 'parent' },
      { id: 'cleaning', name: '清洁用品', level: 'child', parentId: 'parent-ops' },
    ];
    const currentExpenses = [
      { id: 'p-current', date: '2026-06-12', amount: 300, relatedType: 'purchase', supplierName: 'A供应商饮料' },
      { id: 'e-current', date: '2026-06-13', amount: 120, categoryId: 'electric' },
    ];
    const previousExpenses = [
      { id: 'p-previous', date: '2026-06-01', amount: 100, relatedType: 'purchase', supplierName: 'A供应商饮料' },
      { id: 'e-previous', date: '2026-06-02', amount: 200, categoryId: 'cleaning' },
    ];

    const movement = buildExpenseRankingComparison(currentExpenses, previousExpenses, categories, [], {
      scope: 'all',
      sortBy: 'amount',
      topN: 10,
    });

    expect(movement.increased[0]).toMatchObject({
      label: 'A供应商饮料',
      currentAmount: 300,
      previousAmount: 100,
      amountDelta: 200,
      amountPercent: 200,
    });
    expect(movement.decreased[0]).toMatchObject({
      label: '清洁用品',
      currentAmount: 0,
      previousAmount: 200,
      amountDelta: -200,
      amountPercent: -100,
    });
  });

  test('includes beverage sales by stock item category when order item has no category', () => {
    const orders = [
      paidOrder({
        id: 'o1',
        totalAmount: 90,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'i1', name: 'Coca cola 600M', quantity: 3, price: 30, subtotal: 90, stockItemId: 'stock-coke' },
        ],
      }),
    ];

    const rankings = buildSalesRankings(orders, [], [
      { id: 'stock-coke', name: 'Coca cola 600M', category: 'Bebida' },
    ], {
      scope: 'beverages',
      sortBy: 'quantity',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'all',
    });

    expect(rankings).toEqual([
      expect.objectContaining({
        name: 'Coca cola 600M',
        category: 'Bebida',
        quantity: 3,
        revenue: 90,
      }),
    ]);
  });

  test('includes beverage sales by item name when category and stock id are missing', () => {
    const orders = [
      paidOrder({
        id: 'o1',
        totalAmount: 110,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'i1', name: 'Toña', quantity: 2, price: 55, subtotal: 110 },
        ],
      }),
    ];

    const rankings = buildSalesRankings(orders, [], [
      { id: 'beer-tona', name: 'Toña', category: 'Cerveza' },
    ], {
      scope: 'beverages',
      sortBy: 'revenue',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'Cerveza',
    });

    expect(rankings[0]).toMatchObject({
      name: 'Toña',
      category: 'Cerveza',
      quantity: 2,
      revenue: 110,
    });
  });

  test('sorts sales rankings by quantity or revenue', () => {
    const orders = [
      paidOrder({
        id: 'o1',
        totalAmount: 350,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'a', name: 'A', category: 'Platos', quantity: 5, price: 10, subtotal: 50 },
          { id: 'b', name: 'B', category: 'Platos', quantity: 1, price: 300, subtotal: 300 },
        ],
      }),
    ];

    expect(buildSalesRankings(orders, [], [], {
      scope: 'all',
      sortBy: 'quantity',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'all',
    })[0].name).toBe('A');
    expect(buildSalesRankings(orders, [], [], {
      scope: 'all',
      sortBy: 'revenue',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'all',
    })[0].name).toBe('B');
  });

  test('filters rankings by order type', () => {
    const orders = [
      paidOrder({
        id: 'dine',
        totalAmount: 200,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        orderType: 'dine_in',
        items: [{ id: 'a', name: 'Mesa Dish', category: 'Platos', quantity: 1, price: 200, subtotal: 200 }],
      }),
      paidOrder({
        id: 'takeout',
        totalAmount: 100,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        orderType: 'takeout',
        items: [{ id: 'b', name: 'Barra Dish', category: 'Platos', quantity: 1, price: 100, subtotal: 100 }],
      }),
    ];

    const rankings = buildSalesRankings(orders, [], [], {
      scope: 'all',
      sortBy: 'revenue',
      orderType: 'takeout',
      topN: 10,
      beverageCategory: 'all',
    });

    expect(rankings.map(item => item.name)).toEqual(['Barra Dish']);
  });

  test('builds a Monday to Sunday monthly sales calendar with weekly totals', () => {
    const orders = [
      paidOrder({ id: 'o1', totalAmount: 100, completedAt: '2026-06-01T12:00:00.000-06:00' }),
      paidOrder({ id: 'o2', totalAmount: 200, completedAt: '2026-06-07T12:00:00.000-06:00' }),
      paidOrder({ id: 'o3', totalAmount: 50, completedAt: '2026-06-08T12:00:00.000-06:00' }),
    ];

    const calendar = buildMonthlySalesCalendar(orders, '2026-06');

    expect(calendar.weekdays).toEqual(['周一', '周二', '周三', '周四', '周五', '周六', '周日']);
    expect(calendar.weeks[0].days[0]).toMatchObject({ date: '2026-06-01', revenue: 100, orderCount: 1 });
    expect(calendar.weeks[0].days[6]).toMatchObject({ date: '2026-06-07', revenue: 200, orderCount: 1 });
    expect(calendar.weeks[0].weeklyRevenue).toBe(300);
    expect(calendar.weeks[1].days[0]).toMatchObject({ date: '2026-06-08', revenue: 50, orderCount: 1 });
    expect(calendar.bestWeekday?.weekday).toBe('周日');
  });

  test('builds period comparison values and percentages', () => {
    expect(buildPeriodComparison(120, 100)).toEqual({ value: 20, percent: 20, direction: 'up' });
    expect(buildPeriodComparison(80, 100)).toEqual({ value: -20, percent: -20, direction: 'down' });
    expect(buildPeriodComparison(50, 0)).toEqual({ value: 50, percent: null, direction: 'up' });
  });

  test('reports products that increased and decreased between periods', () => {
    const currentOrders = [
      paidOrder({
        id: 'current',
        totalAmount: 260,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'a', name: 'Coca cola 600M', category: 'Bebida', quantity: 5, price: 30, subtotal: 150 },
          { id: 'b', name: 'Arroz Chino', category: 'Platos', quantity: 1, price: 110, subtotal: 110 },
        ],
      }),
    ];
    const previousOrders = [
      paidOrder({
        id: 'previous',
        totalAmount: 310,
        completedAt: '2026-05-18T12:00:00.000-06:00',
        items: [
          { id: 'a-prev', name: 'Coca cola 600M', category: 'Bebida', quantity: 2, price: 30, subtotal: 60 },
          { id: 'b-prev', name: 'Arroz Chino', category: 'Platos', quantity: 5, price: 50, subtotal: 250 },
        ],
      }),
    ];

    const movement = buildRankingComparison(currentOrders, previousOrders, [], [], {
      scope: 'all',
      sortBy: 'revenue',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'all',
    });

    expect(movement.increased[0]).toMatchObject({
      name: 'Coca cola 600M',
      currentRevenue: 150,
      previousRevenue: 60,
      revenueDelta: 90,
    });
    expect(movement.decreased[0]).toMatchObject({
      name: 'Arroz Chino',
      currentRevenue: 110,
      previousRevenue: 250,
      revenueDelta: -140,
    });
  });

  test('normalizes previous equal-length date range', () => {
    const range = normalizeDashboardRange('custom', '2026-06-10', '2026-06-16', new Date('2026-06-18T12:00:00.000-06:00'));

    expect(range).toMatchObject({
      startDate: '2026-06-10',
      endDateExclusive: '2026-06-17',
      previousStartDate: '2026-06-03',
      previousEndDateExclusive: '2026-06-10',
    });
  });

  test('normalizes selected dashboard month as the full calendar month', () => {
    const range = normalizeDashboardRange('month', '2026-07-01', '2026-07-31', new Date('2026-07-09T12:00:00.000-06:00'), '2026-06');

    expect(range).toMatchObject({
      startDate: '2026-06-01',
      endDateExclusive: '2026-07-01',
      previousStartDate: '2026-05-01',
      previousEndDateExclusive: '2026-06-01',
      label: '2026-06',
    });
  });
});
