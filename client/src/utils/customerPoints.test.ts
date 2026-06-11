import {
  loadScopedPointsTransactions,
  saveScopedPointsTransactions,
  getScopedPointsTransactionsKey,
} from './customerPoints';

describe('customer points local cache helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('uses the branch scoped points cache when a store user is logged in', () => {
    localStorage.setItem('current_user', JSON.stringify({ username: 'zeng', storeId: 'branch-a' }));
    localStorage.setItem('points_transactions', JSON.stringify([{ id: 'old-global' }]));

    expect(getScopedPointsTransactionsKey()).toBe('store_branch-a_points_transactions');
    expect(loadScopedPointsTransactions()).toEqual([]);

    saveScopedPointsTransactions([{ id: 'branch-record', customerId: 'c1', type: 'earn', points: 5, description: 'test', createdAt: '2026-06-11T00:00:00.000Z' }]);

    expect(JSON.parse(localStorage.getItem('store_branch-a_points_transactions') || '[]')).toEqual([
      { id: 'branch-record', customerId: 'c1', type: 'earn', points: 5, description: 'test', createdAt: '2026-06-11T00:00:00.000Z' },
    ]);
    expect(localStorage.getItem('points_transactions')).toBeNull();
  });

  test('keeps global points cache for owner accounts without a store id', () => {
    saveScopedPointsTransactions([{ id: 'global-record', customerId: 'c2', type: 'redeem', points: 2, description: 'test', createdAt: '2026-06-11T00:00:00.000Z' }]);

    expect(getScopedPointsTransactionsKey()).toBe('points_transactions');
    expect(loadScopedPointsTransactions()).toEqual([
      { id: 'global-record', customerId: 'c2', type: 'redeem', points: 2, description: 'test', createdAt: '2026-06-11T00:00:00.000Z' },
    ]);
  });
});
