import {
  calculatePurchaseLineSubtotal,
  calculatePurchaseOrderTotal,
  roundPurchaseAmount,
} from './purchaseCalculations';

describe('purchase amount calculations', () => {
  test('rounds purchase amounts to two decimals', () => {
    expect(roundPurchaseAmount(1.005)).toBe(1.01);
    expect(roundPurchaseAmount(12.344)).toBe(12.34);
    expect(roundPurchaseAmount(12.345)).toBe(12.35);
  });

  test('rounds line subtotals and order total to two decimals', () => {
    const firstSubtotal = calculatePurchaseLineSubtotal(3, 1.335);
    const secondSubtotal = calculatePurchaseLineSubtotal(2, 2.555);

    expect(firstSubtotal).toBe(4.02);
    expect(secondSubtotal).toBe(5.12);
    expect(calculatePurchaseOrderTotal([
      { subtotal: firstSubtotal },
      { subtotal: secondSubtotal },
    ])).toBe(9.14);
  });
});
