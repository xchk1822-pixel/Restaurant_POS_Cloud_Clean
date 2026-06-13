import {
  buildDailyExpenseBreakdown,
  calculateFinancialReportTotals,
  getExpenseDateKey,
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

  test('calculates financial report totals from cash card expense and handover formulas', () => {
    expect(calculateFinancialReportTotals({
      cashPayment: 100,
      cardPayment: 30,
      purchaseAmount: 20,
      expenseAmount: 10,
      handoverAmount: 95,
    })).toEqual({
      totalSales: 130,
      profit: 100,
      difference: 5,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 100,
      cardPayment: 30,
      purchaseAmount: 20,
      expenseAmount: 10,
      handoverAmount: 105,
    })).toEqual({
      totalSales: 130,
      profit: 100,
      difference: -5,
    });
  });

  test('builds daily expense category summaries and details for reports', () => {
    const breakdown = buildDailyExpenseBreakdown([
      {
        id: 'purchase_1',
        date: '2026-06-12',
        amount: 100,
        relatedType: 'purchase',
        categoryName: '采购付款',
        description: 'Supplier A',
        createdAt: '2026-06-12T10:00:00.000-06:00',
      },
      {
        id: 'rent_1',
        date: '2026-06-12',
        amount: 30,
        categoryName: '租金',
        description: '店租',
        createdAt: '2026-06-12T11:00:00.000-06:00',
      },
      {
        id: 'rent_2',
        date: '2026-06-12',
        amount: 20,
        categoryName: '租金',
        description: '追加',
        createdAt: '2026-06-12T12:00:00.000-06:00',
      },
      {
        id: 'other_day',
        date: '2026-06-11',
        amount: 999,
        categoryName: '不应出现',
      },
    ], '2026-06-12');

    expect(breakdown.summaries).toEqual([
      { type: 'purchase', typeLabel: '采购付款', category: '采购付款', count: 1, amount: 100 },
      { type: 'operating', typeLabel: '日常开支', category: '租金', count: 2, amount: 50 },
    ]);
    expect(breakdown.details.map(detail => detail.description)).toEqual(['追加', '店租', 'Supplier A']);
  });
});
