import {
  PERMISSION_SCHEMA_VERSION,
  canAccessPermission
} from './permissions';

describe('permissions compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('legacy store manager inventory permissions include the new supplier module', () => {
    localStorage.setItem('system_roles', JSON.stringify([
      { id: 'store_manager', permissions: ['inventory'] }
    ]));

    expect(canAccessPermission('store_manager', 'suppliers:manage')).toBe(true);
  });

  test('versioned store manager permissions can explicitly hide the supplier module', () => {
    localStorage.setItem('system_roles', JSON.stringify([
      {
        id: 'store_manager',
        permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
        permissions: ['inventory']
      }
    ]));

    expect(canAccessPermission('store_manager', 'suppliers:manage')).toBe(false);
  });
});
