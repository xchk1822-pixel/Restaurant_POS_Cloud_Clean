import { getExpenseDateKey, isPurchaseRelatedExpense, sumExpensesByKind } from './financeMetrics';

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
});
