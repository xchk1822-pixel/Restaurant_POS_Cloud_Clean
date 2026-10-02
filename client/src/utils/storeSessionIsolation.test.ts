import {
  STORE_SESSION_CHANGED_EVENT,
  clearAuthenticatedSession,
  persistAuthenticatedSession,
  shouldApplyStoreCacheReload,
  shouldResetActiveStoreSession,
} from './storeSessionIsolation';
import { dataService } from '../services/DataService';
import { dataManager } from '../services/dataManager';

describe('store session isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('detects switching between branch users and admin scope', () => {
    expect(shouldResetActiveStoreSession(
      { id: 'a', role: 'store_manager', storeId: 'store-a' },
      { id: 'a', role: 'store_manager', storeId: 'store-a' }
    )).toBe(false);

    expect(shouldResetActiveStoreSession(
      { id: 'a', role: 'store_manager', storeId: 'store-a' },
      { id: 'b', role: 'store_manager', storeId: 'store-b' }
    )).toBe(true);

    expect(shouldResetActiveStoreSession(
      { id: 'admin', role: 'super_admin' },
      { id: 'b', role: 'store_manager', storeId: 'store-b' }
    )).toBe(true);
  });

  test('branch switch dispatches a reset event without deleting offline store caches', () => {
    localStorage.setItem('current_user', JSON.stringify({ id: 'a', role: 'store_manager', storeId: 'store-a' }));
    localStorage.setItem('store_store-a_pos_orders', '[{"id":"old"}]');
    localStorage.setItem('store_store-b_pos_orders', '[{"id":"new"}]');
    localStorage.setItem('local_pending_sync_conflicts', '[{"id":"pending"}]');
    const handler = jest.fn();
    window.addEventListener(STORE_SESSION_CHANGED_EVENT, handler);

    persistAuthenticatedSession({ id: 'b', role: 'store_manager', storeId: 'store-b' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('current_user') || '{}').storeId).toBe('store-b');
    expect(localStorage.getItem('store_store-a_pos_orders')).toBe('[{"id":"old"}]');
    expect(localStorage.getItem('store_store-b_pos_orders')).toBe('[{"id":"new"}]');
    expect(localStorage.getItem('local_pending_sync_conflicts')).toBe('[{"id":"pending"}]');
  });

  test('the same multi-store manager can switch branches without mixing or deleting caches', () => {
    localStorage.setItem('current_user', JSON.stringify({
      id: 'manager-a',
      role: 'multi_store_manager',
      storeId: 'store-a',
      storeIds: ['store-a', 'store-b'],
    }));
    localStorage.setItem('store_store-a_pos_orders', '[{"id":"order-a"}]');
    localStorage.setItem('store_store-b_pos_orders', '[{"id":"order-b"}]');
    const handler = jest.fn();
    window.addEventListener(STORE_SESSION_CHANGED_EVENT, handler);

    persistAuthenticatedSession({
      id: 'manager-a',
      role: 'multi_store_manager',
      storeId: 'store-b',
      storeIds: ['store-a', 'store-b'],
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(dataService.getData('pos_orders')).toEqual([{ id: 'order-b' }]);
    expect(localStorage.getItem('store_store-a_pos_orders')).toBe('[{"id":"order-a"}]');
  });

  test('logout dispatches a store reset event and keeps branch caches intact', () => {
    localStorage.setItem('current_user', JSON.stringify({ id: 'a', role: 'store_manager', storeId: 'store-a' }));
    localStorage.setItem('store_store-a_inventory_items', '[{"id":"item"}]');
    const handler = jest.fn();
    window.addEventListener(STORE_SESSION_CHANGED_EVENT, handler);

    clearAuthenticatedSession();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('current_user')).toBeNull();
    expect(localStorage.getItem('store_store-a_inventory_items')).toBe('[{"id":"item"}]');
  });

  test('switching to an empty branch cannot read another branch or bare global business cache', () => {
    localStorage.setItem('current_user', JSON.stringify({ id: 'a', role: 'store_manager', storeId: 'store-a' }));
    localStorage.setItem('store_store-a_pos_orders', '[{"id":"order-a"}]');
    localStorage.setItem('pos_orders', '[{"id":"legacy-global"}]');
    dataManager.clearCache();

    expect(dataManager.getData('orders')).toEqual([{ id: 'order-a' }]);
    expect(dataService.getData('pos_orders')).toEqual([{ id: 'order-a' }]);

    persistAuthenticatedSession({ id: 'b', role: 'store_manager', storeId: 'store-b' });

    expect(dataManager.getData('orders')).toEqual([]);
    expect(dataService.getData('pos_orders')).toEqual([]);

    localStorage.setItem('store_store-b_pos_orders', '[{"id":"order-b"}]');
    dataManager.clearCache();
    expect(dataManager.getData('orders')).toEqual([{ id: 'order-b' }]);
    expect(dataService.getData('pos_orders')).toEqual([{ id: 'order-b' }]);
  });

  test('store cache key creation is blocked without an active branch', () => {
    expect(() => dataService.getStoreKey('pos_orders')).toThrow(
      'Missing storeId; refusing store-scoped cache access: pos_orders'
    );
  });

  test('a partial data sync cannot clear cloud state for a collection with no local snapshot', () => {
    expect(shouldApplyStoreCacheReload('dataSynced', false)).toBe(false);
    expect(shouldApplyStoreCacheReload('dataSynced', true)).toBe(true);
    expect(shouldApplyStoreCacheReload('storeSessionChanged', false)).toBe(true);
    expect(shouldApplyStoreCacheReload(undefined, false)).toBe(true);
  });
});
