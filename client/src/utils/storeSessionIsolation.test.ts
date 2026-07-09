import {
  STORE_SESSION_CHANGED_EVENT,
  clearAuthenticatedSession,
  persistAuthenticatedSession,
  shouldResetActiveStoreSession,
} from './storeSessionIsolation';

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
});
