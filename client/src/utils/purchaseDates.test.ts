import { buildMissingPurchaseExpenses, getPurchaseExpenseDate } from './purchaseExpenseRepair';
import {
  getPurchaseOrderDateKey,
  getPurchaseOrderTime,
  normalizePurchaseOrderDateFields,
  normalizePurchaseStockRecordDateFields,
} from './purchaseDates';

describe('purchase date normalization', () => {
  test('falls through invalid legacy date objects to a valid update time', () => {
    const updatedAt = new Date(2026, 4, 12, 10, 30, 0);
    const purchase = {
      orderDate: {},
      receivedDate: {},
      updatedAt,
    };

    expect(getPurchaseOrderTime(purchase)).toBe(updatedAt.getTime());
    expect(getPurchaseOrderDateKey(purchase)).toBe('2026-05-12');
    expect(getPurchaseExpenseDate(purchase)).toBe('2026-05-12');
  });

  test('does not fabricate a current expense date for an undated legacy order', () => {
    const purchase = {
      id: 'po-undated',
      orderDate: {},
      receivedDate: {},
      totalAmount: 10,
      paidAmount: 10,
      paymentType: 'cash',
    };

    expect(getPurchaseExpenseDate(purchase)).toBe('');
    expect(buildMissingPurchaseExpenses([purchase], [])).toEqual([]);
  });

  test('restores purchase dates serialized by the offline queue before Firestore sync', () => {
    const order = normalizePurchaseOrderDateFields({
      id: 'po-1',
      orderDate: '2026-07-18T20:35:33.758Z',
      receivedDate: '2026-07-18T20:35:33.758Z',
    });
    const stockRecord = normalizePurchaseStockRecordDateFields({
      id: 'stock-1',
      date: '2026-07-18T20:35:33.758Z',
      createdAt: '2026-07-18T20:35:33.758Z',
    });

    expect(order.orderDate).toBeInstanceOf(Date);
    expect(order.receivedDate).toBeInstanceOf(Date);
    expect(stockRecord.date).toBeInstanceOf(Date);
    expect(stockRecord.createdAt).toBeInstanceOf(Date);
    expect(order.id).toBe('po-1');
  });
});
