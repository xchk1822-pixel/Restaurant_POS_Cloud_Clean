import { runTransaction } from 'firebase/firestore';
import { smartIncrementField, smartPrepareStockDeductionPlan } from './smartSyncService';
import { buildStockDeductionPlan } from '../utils/stockDeduction';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('./DataService', () => ({ dataService: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  runTransaction: jest.fn(),
  increment: (amount: number) => ({ increment: amount }),
  arrayUnion: (...values: string[]) => ({ arrayUnion: values }),
  Timestamp: { now: () => 'now' },
}));

const cloud = new Map<string, any>();
const orderPath = 'stores/store-a/pos_orders/order-sol';
const fridgePath = 'stores/store-a/fridge_inventory/f1-sol';
const warehousePath = 'stores/store-a/inventory_items/sol';
const operationId = 'stock-order-sol';
const candidate = () => Promise.resolve(buildStockDeductionPlan({
  requests: [{ itemId: 'sol', quantity: 7 }],
  inventoryItems: [{ id: 'sol', currentStock: cloud.get(warehousePath).currentStock }],
  fridgeInventory: [{ id: 'f1-sol', fridgeId: 'f1', itemId: 'sol', quantity: cloud.get(fridgePath).quantity }],
}));

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new Event('online'));
  localStorage.setItem('current_user', JSON.stringify({ storeId: 'store-a' }));
  cloud.clear();
  cloud.set(orderPath, { id: 'order-sol', status: 'completed' });
  cloud.set(fridgePath, { quantity: 7 });
  cloud.set(warehousePath, { currentStock: 0 });
  (runTransaction as jest.Mock).mockImplementation(async (_db, callback) => callback({
    get: async (ref: string) => ({ exists: () => cloud.has(ref), data: () => cloud.get(ref) }),
    set: (ref: string, patch: any) => {
      const next = { ...cloud.get(ref) };
      Object.entries(patch).forEach(([key, value]: [string, any]) => {
        next[key] = value?.increment !== undefined ? (next[key] || 0) + value.increment
          : value?.arrayUnion ? Array.from(new Set([...(next[key] || []), ...value.arrayUnion])) : value;
      });
      cloud.set(ref, next);
    },
  }));
});

test('SOL retry after fridge deduction and a lost completion marker cannot deduct seven more from warehouse', async () => {
  const first = await smartPrepareStockDeductionPlan('order-sol', operationId, candidate);
  await smartIncrementField('fridge_inventory', 'f1-sol', 'quantity', -7, { syncOperationId: `${operationId}-fridge-f1-sol` });
  expect(cloud.get(fridgePath).quantity).toBe(0);
  // A fresh terminal has no cache and sees the already emptied fridge.
  localStorage.removeItem('store_store-a_pos_orders');
  const replan = jest.fn(candidate);
  const retry = await smartPrepareStockDeductionPlan('order-sol', operationId, replan);
  expect(replan).not.toHaveBeenCalled();
  expect(retry).toEqual(first);
  expect(retry.warehouseDeductions).toEqual([]);
  const result = await smartIncrementField('fridge_inventory', 'f1-sol', 'quantity', -7, { syncOperationId: `${operationId}-fridge-f1-sol` });
  expect(result.duplicate).toBe(true);
  expect(cloud.get(fridgePath).quantity).toBe(0);
  expect(cloud.get(warehousePath).currentStock).toBe(0);
});

test('offline retries retain the plan and queue a stock decrement only once', async () => {
  window.dispatchEvent(new Event('offline'));
  localStorage.setItem('store_store-a_fridge_inventory', JSON.stringify([{ id: 'f1-sol', quantity: 7 }]));
  const first = await smartPrepareStockDeductionPlan('order-sol', operationId, candidate);
  await smartIncrementField('fridge_inventory', 'f1-sol', 'quantity', -7, { syncOperationId: `${operationId}-fridge-f1-sol` });
  localStorage.removeItem('store_store-a_pos_orders');
  const replan = jest.fn(candidate);
  expect(await smartPrepareStockDeductionPlan('order-sol', operationId, replan)).toEqual(first);
  expect(replan).not.toHaveBeenCalled();
  const result = await smartIncrementField('fridge_inventory', 'f1-sol', 'quantity', -7, { syncOperationId: `${operationId}-fridge-f1-sol` });
  expect(result.duplicate).toBe(true);
  expect(result.data.quantity).toBe(0);
  const pending = JSON.parse(localStorage.getItem('store_store-a_pending_firestore_changes') || '[]');
  expect(pending.filter((change: any) => change.data.__increment)).toHaveLength(1);
});

test('the same order id in another store gets its own stock plan', async () => {
  await smartPrepareStockDeductionPlan('order-sol', operationId, candidate);
  localStorage.setItem('current_user', JSON.stringify({ storeId: 'store-b' }));
  cloud.set('stores/store-b/pos_orders/order-sol', { id: 'order-sol', status: 'completed' });
  const otherPlan = { fridgeDeductions: [], warehouseDeductions: [{ itemId: 'sol', quantity: 2 }] };
  expect(await smartPrepareStockDeductionPlan('order-sol', operationId, async () => otherPlan)).toMatchObject(otherPlan);
  expect(cloud.get(orderPath).stockDeductionPlan.warehouseDeductions).toEqual([]);
});
