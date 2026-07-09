import {
  buildExpenseDetailRankings,
  filterExpenseRecords,
} from './expenseRecordInsights';

const categories = [
  { id: 'parent-purchase', name: '采购支出', level: 'parent' },
  { id: 'purchase_food', name: '食材采购', level: 'child', parentId: 'parent-purchase' },
  { id: 'parent-ops', name: '运营杂费', level: 'parent' },
  { id: 'transport', name: '交通费', level: 'child', parentId: 'parent-ops' },
];

describe('expenseRecordInsights', () => {
  test('filters records by all today specific date and month modes', () => {
    const expenses = [
      { id: 'e-0626', date: '2026-06-26', categoryId: 'transport', amount: 50, description: 'Taxi' },
      { id: 'e-0627', date: '2026-06-27', categoryId: 'transport', amount: 80, description: 'Bus' },
      { id: 'e-0701', date: '2026-07-01', categoryId: 'transport', amount: 120, description: 'Rent' },
    ];

    const baseFilters = {
      parentCategoryId: 'all',
      categoryId: 'all',
      query: '',
    };

    expect(filterExpenseRecords(expenses, categories, [], {
      ...baseFilters,
      dateMode: 'all',
      date: '',
    }).map(expense => expense.id)).toEqual(['e-0626', 'e-0627', 'e-0701']);

    expect(filterExpenseRecords(expenses, categories, [], {
      ...baseFilters,
      dateMode: 'today',
      date: '2026-06-27',
    }).map(expense => expense.id)).toEqual(['e-0627']);

    expect(filterExpenseRecords(expenses, categories, [], {
      ...baseFilters,
      dateMode: 'date',
      date: '2026-06-26',
    }).map(expense => expense.id)).toEqual(['e-0626']);

    expect(filterExpenseRecords(expenses, categories, [], {
      ...baseFilters,
      dateMode: 'month',
      date: '',
      month: '2026-06',
    }).map(expense => expense.id)).toEqual(['e-0626', 'e-0627']);
  });

  test('searches purchase item details within the active expense filters', () => {
    const expenses = [
      {
        id: 'purchase-expense-po-1',
        date: '2026-06-27',
        categoryId: 'purchase_food',
        amount: 350,
        relatedType: 'purchase',
        supplierName: 'Mercado Central',
        purchaseOrderId: 'po-1',
        orderNumber: 'P-001',
      },
      {
        id: 'purchase-expense-po-2',
        date: '2026-06-26',
        categoryId: 'purchase_food',
        amount: 90,
        relatedType: 'purchase',
        supplierName: 'Mercado Central',
        purchaseOrderId: 'po-2',
        orderNumber: 'P-002',
      },
      {
        id: 'daily-1',
        date: '2026-06-27',
        categoryId: 'transport',
        amount: 50,
        description: '出租车',
      },
    ];
    const purchases = [
      {
        id: 'po-1',
        orderNumber: 'P-001',
        supplierName: 'Mercado Central',
        items: [
          { itemName: '鸡肉', quantity: 5, unitPrice: 40, subtotal: 200 },
          { itemName: '洋葱', quantity: 3, unitPrice: 50, subtotal: 150 },
        ],
      },
      {
        id: 'po-2',
        orderNumber: 'P-002',
        supplierName: 'Mercado Central',
        items: [{ itemName: '鸡肉', quantity: 2, unitPrice: 45, subtotal: 90 }],
      },
    ];

    const result = filterExpenseRecords(expenses, categories, purchases, {
      parentCategoryId: 'all',
      categoryId: 'all',
      date: '2026-06-27',
      query: '鸡肉',
    });

    expect(result.map(expense => expense.id)).toEqual(['purchase-expense-po-1']);
  });

  test('builds item-level expense rankings from the filtered records', () => {
    const expenses = [
      {
        id: 'purchase-expense-po-1',
        date: '2026-06-27',
        amount: 350,
        relatedType: 'purchase',
        supplierName: 'Mercado Central',
        purchaseOrderId: 'po-1',
        orderNumber: 'P-001',
      },
    ];
    const purchases = [
      {
        id: 'po-1',
        orderNumber: 'P-001',
        supplierName: 'Mercado Central',
        items: [
          { itemName: '鸡肉', quantity: 5, unitPrice: 40, subtotal: 200 },
          { itemName: '洋葱', quantity: 3, unitPrice: 50, subtotal: 150 },
        ],
      },
    ];

    const rankings = buildExpenseDetailRankings(expenses, purchases, '', 5);

    expect(rankings).toEqual([
      expect.objectContaining({ label: '鸡肉', amount: 200, quantity: 5, count: 1 }),
      expect.objectContaining({ label: '洋葱', amount: 150, quantity: 3, count: 1 }),
    ]);
  });
});
