import {
  buildDailyExpenseBreakdown,
  calculateOrderStatusSummary,
  calculateFinancialReportTotals,
  getExpenseDateKey,
  getLatestHandoverAmountForDate,
  getOrderCollectedAmount,
  getOrderFinancialDateKey,
  getOrderPaymentBreakdown,
  isPurchaseRelatedExpense,
  sumExpensesByKind,
} from './financeMetrics';

describe('finance metrics helpers', () => {
  test('detects paid purchase and supplier repayment expenses', () => {
    expect(isPurchaseRelatedExpense({ relatedType: 'purchase' })).toBe(true);
    expect(isPurchaseRelatedExpense({ relatedType: 'supplier_repayment' })).toBe(true);
    expect(isPurchaseRelatedExpense({ categoryId: 'supplier_payment' })).toBe(true);
    expect(isPurchaseRelatedExpense({ id: 'purchase_123' })).toBe(true);
    expect(isPurchaseRelatedExpense({ categoryId: 'rent' })).toBe(false);
  });

  test('sums paid purchase expense separately from operating expense', () => {
    const expenses = [
      { id: 'purchase_1', date: '2026-06-11', amount: 100 },
      { id: 'rent_1', date: '2026-06-11', amount: 30, categoryId: 'rent' },
      { id: 'purchase_2', date: '2026-06-12', amount: 999 },
    ];

    expect(sumExpensesByKind(expenses, '2026-06-11', '2026-06-12', 'purchase')).toBe(100);
    expect(sumExpensesByKind(expenses, '2026-06-11', '2026-06-12', 'operating')).toBe(30);
  });

  test('normalizes expense date keys', () => {
    expect(getExpenseDateKey({ date: '2026-06-11' })).toBe('2026-06-11');
  });

  test('counts only collected order amounts for financial reports', () => {
    expect(getOrderCollectedAmount({ status: 'confirmed', paymentStatus: 'unpaid', totalAmount: 100 })).toBe(0);
    expect(getOrderCollectedAmount({ status: 'served', paymentStatus: 'partial', totalAmount: 100, paidAmount: 40 })).toBe(40);
    expect(getOrderCollectedAmount({ status: 'served', paymentStatus: 'paid', totalAmount: 100, paidAmount: 100 })).toBe(100);
    expect(getOrderCollectedAmount({ status: 'completed', totalAmount: 80 })).toBe(80);
    expect(getOrderCollectedAmount({ status: 'cancelled', paymentStatus: 'paid', totalAmount: 100 })).toBe(0);
  });

  test('splits collected order amounts by payment method', () => {
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 100, paymentMethod: 'cash' })).toEqual({ cash: 100, card: 0 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 100, paymentMethod: 'card' })).toEqual({ cash: 0, card: 100 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 120, paymentMethod: 'mixed', cashAmount: 50, cardAmount: 70 })).toEqual({ cash: 50, card: 70 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'partial', totalAmount: 120, paidAmount: 30, paymentMethod: 'cash' })).toEqual({ cash: 30, card: 0 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'unpaid', totalAmount: 120, paymentMethod: 'cash' })).toEqual({ cash: 0, card: 0 });
  });

  test('removes cash change from payment breakdown when saved cash includes tendered amount', () => {
    expect(getOrderPaymentBreakdown({
      paymentStatus: 'paid',
      totalAmount: 100,
      cashAmount: 120,
      cardAmount: 0,
    })).toEqual({ cash: 100, card: 0 });

    expect(getOrderPaymentBreakdown({
      paymentStatus: 'paid',
      totalAmount: 100,
      cashAmount: 50,
      cardAmount: 70,
    })).toEqual({ cash: 30, card: 70 });
  });

  test('uses payment date as financial order date', () => {
    const order = {
      status: 'served',
      paymentStatus: 'paid',
      totalAmount: 100,
      createdAt: '2026-06-10T23:30:00.000-06:00',
      lastPaidAt: '2026-06-11T00:10:00.000-06:00',
    };

    expect(getOrderFinancialDateKey(order)).toBe('2026-06-11');
    expect(getOrderFinancialDateKey({ ...order, paymentStatus: 'unpaid' })).toBe('');
  });

  test('summarizes daily completed orders cancelled orders and cancelled dishes separately', () => {
    const orders = [
      {
        id: 'paid-table-order',
        status: 'completed',
        paymentStatus: 'paid',
        totalAmount: 100,
        lastPaidAt: '2026-06-12T10:00:00.000-06:00',
      },
      {
        id: 'cancelled-whole-order',
        status: 'cancelled',
        totalAmount: 80,
        cancelledAt: '2026-06-12T11:00:00.000-06:00',
        items: [{ name: 'Dish A', quantity: 2 }],
      },
      {
        id: 'cancelled-items-order-record',
        status: 'confirmed',
        paymentStatus: 'unpaid',
        createdAt: '2026-06-12T12:00:00.000-06:00',
        cancelRecords: [
          { orderType: 'item', quantity: 2, cancelledAt: '2026-06-12T12:05:00.000-06:00' },
          { orderType: 'order', quantity: 9, cancelledAt: '2026-06-12T12:10:00.000-06:00' },
        ],
      },
      {
        id: 'paid-order-with-item-record',
        status: 'served',
        paymentStatus: 'paid',
        totalAmount: 50,
        lastPaidAt: '2026-06-12T13:00:00.000-06:00',
        items: [
          {
            name: 'Dish B',
            cancelRecords: [{ quantity: 1, cancelledAt: '2026-06-12T13:05:00.000-06:00' }],
          },
        ],
      },
      {
        id: 'other-day-cancelled',
        status: 'cancelled',
        cancelledAt: '2026-06-11T11:00:00.000-06:00',
        cancelRecords: [{ orderType: 'item', quantity: 99, cancelledAt: '2026-06-11T11:05:00.000-06:00' }],
      },
    ];

    expect(calculateOrderStatusSummary(orders, '2026-06-12')).toEqual({
      completedOrders: 2,
      cancelledOrders: 1,
      cancelledItems: 3,
    });
  });

  test('calculates financial report totals with cash-based handover difference included in profit loss', () => {
    expect(calculateFinancialReportTotals({
      cashPayment: 100,
      cardPayment: 30,
      purchaseAmount: 20,
      expenseAmount: 10,
      handoverAmount: 95,
    })).toEqual({
      totalSales: 130,
      profit: 125,
      difference: 25,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 100,
      cardPayment: 30,
      purchaseAmount: 20,
      expenseAmount: 10,
      handoverAmount: 105,
    })).toEqual({
      totalSales: 130,
      profit: 135,
      difference: 35,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 200,
      cardPayment: 0,
      purchaseAmount: 50,
      expenseAmount: 0,
      handoverAmount: 140,
    })).toEqual({
      totalSales: 200,
      profit: 140,
      difference: -10,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 500,
      cardPayment: 500,
      purchaseAmount: 100,
      expenseAmount: 100,
      handoverAmount: 310,
    })).toEqual({
      totalSales: 1000,
      profit: 810,
      difference: 10,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 28370,
      cardPayment: 0,
      purchaseAmount: 10308.125,
      expenseAmount: 10232,
      handoverAmount: 7850,
    })).toEqual({
      totalSales: 28370,
      profit: 7850,
      difference: 20.12,
    });
  });

  test('uses latest handover amount for the report date', () => {
    expect(getLatestHandoverAmountForDate([
      { id: 'newer', t: '2026-06-12 21:00:00', rawG: 105 },
      { id: 'older', t: '2026-06-12 09:00:00', rawG: 95 },
      { id: 'other-day', t: '2026-06-11 23:00:00', rawG: 999 },
    ], '2026-06-12')).toBe(105);
  });

  test('builds daily expense groups with readable category names and purchase order labels', () => {
    const breakdown = buildDailyExpenseBreakdown([
      {
        id: 'purchase_1',
        date: '2026-06-12',
        amount: 100,
        relatedType: 'purchase',
        categoryId: 'supplier_payment',
        description: 'Supplier A',
        supplierName: 'A供应商饮料',
        orderNumber: 'INV-001',
        createdAt: '2026-06-12T10:00:00.000-06:00',
      },
      {
        id: 'rent_1',
        date: '2026-06-12',
        amount: 30,
        categoryId: 'cat-rent',
        description: '店租',
        createdAt: '2026-06-12T11:00:00.000-06:00',
      },
      {
        id: 'rent_2',
        date: '2026-06-12',
        amount: 20,
        categoryId: 'cat-rent',
        description: '追加',
        createdAt: '2026-06-12T12:00:00.000-06:00',
      },
      {
        id: 'other_day',
        date: '2026-06-11',
        amount: 999,
        categoryName: '不应出现',
      },
    ], '2026-06-12', [
      { id: 'cat-rent', name: '租金' },
      { id: 'supplier_payment', name: '供应商货款' },
    ], [
      {
        id: 'po-1',
        orderNumber: 'INV-001',
        supplierName: 'A供应商饮料',
        items: [
          { itemName: 'Coca Cola', quantity: 2, unitPrice: 35, subtotal: 70 },
          { itemName: 'Toña', quantity: 1, unitPrice: 30, subtotal: 30 },
        ],
      },
    ]);

    expect(breakdown.summaries).toEqual([
      expect.objectContaining({ type: 'purchase', typeLabel: '采购付款', category: 'A供应商饮料 - 单号 INV-001', count: 1, amount: 100 }),
      expect.objectContaining({ type: 'operating', typeLabel: '日常开支', parentCategory: '房租水电', category: '租金', count: 2, amount: 50 }),
    ]);
    expect(breakdown.groups.map(group => ({
      title: group.title,
      amount: group.amount,
      descriptions: group.details.map(detail => detail.description),
    }))).toEqual([
      { title: 'A供应商饮料 - 单号 INV-001', amount: 100, descriptions: ['Coca Cola', 'Toña'] },
      { title: '房租水电 / 租金', amount: 50, descriptions: ['追加', '店租'] },
    ]);
    expect(breakdown.details.map(detail => detail.description)).toEqual(['追加', '店租', 'Coca Cola', 'Toña']);
    expect(breakdown.details.map(detail => detail.category)).not.toContain('cat-rent');
    expect(breakdown.groups[0].details.map(detail => ({
      orderNumber: detail.orderNumber,
      quantity: detail.quantity,
      unitPrice: detail.unitPrice,
      amount: detail.amount,
    }))).toEqual([
      { orderNumber: 'INV-001', quantity: 2, unitPrice: 35, amount: 70 },
      { orderNumber: 'INV-001', quantity: 1, unitPrice: 30, amount: 30 },
    ]);
  });

  test('builds daily expense groups with parent and child category labels', () => {
    const breakdown = buildDailyExpenseBreakdown([
      {
        id: 'exp-utilities-1',
        date: '2026-06-12',
        amount: 80,
        parentCategoryId: 'parent-utilities',
        categoryId: 'child-electric',
        description: '六月电费',
        createdAt: '2026-06-12T12:00:00.000-06:00',
      },
      {
        id: 'exp-utilities-2',
        date: '2026-06-12',
        amount: 20,
        parentCategoryId: 'parent-utilities',
        categoryId: 'child-water',
        description: '六月水费',
        createdAt: '2026-06-12T13:00:00.000-06:00',
      },
    ], '2026-06-12', [
      { id: 'parent-utilities', name: '房租水电', level: 'parent' },
      { id: 'child-electric', name: '电费', level: 'child', parentId: 'parent-utilities' },
      { id: 'child-water', name: '水费', level: 'child', parentId: 'parent-utilities' },
    ]);

    expect(breakdown.groups.map(group => ({
      parentCategory: group.parentCategory,
      category: group.category,
      title: group.title,
      amount: group.amount,
    }))).toEqual([
      { parentCategory: '房租水电', category: '电费', title: '房租水电 / 电费', amount: 80 },
      { parentCategory: '房租水电', category: '水费', title: '房租水电 / 水费', amount: 20 },
    ]);
    expect(breakdown.details.map(detail => ({
      parentCategory: detail.parentCategory,
      category: detail.category,
      description: detail.description,
    }))).toEqual([
      { parentCategory: '房租水电', category: '水费', description: '六月水费' },
      { parentCategory: '房租水电', category: '电费', description: '六月电费' },
    ]);
  });
});
