import {
  PERMISSION_SCHEMA_VERSION,
  cacheConfiguredRolePermissions,
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

  test('multi-store manager has manager modules by default and can be configured independently', () => {
    expect(canAccessPermission('multi_store_manager', 'manager:overview')).toBe(true);

    localStorage.setItem('system_roles', JSON.stringify([{
      id: 'multi_store_manager',
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: ['manager', 'manager:orders'],
    }]));

    expect(canAccessPermission('multi_store_manager', 'manager:orders')).toBe(true);
    expect(canAccessPermission('multi_store_manager', 'inventory:items')).toBe(false);
  });

  test('cloud cashier permissions are cached for a different login device', () => {
    const permissions = cacheConfiguredRolePermissions('cashier', {
      permissions: [
        'pos',
        'inventory:warehouse',
        'inventory:fridge',
        'employees:attendance',
        'manager:expenses',
        'manager:handover',
        'manager:orders',
        'manager:customers',
        'employees:loans',
      ],
    });

    expect(permissions).toHaveLength(8);
    expect(canAccessPermission('cashier', 'inventory:warehouse')).toBe(true);
    expect(canAccessPermission('cashier', 'employees:attendance')).toBe(true);
    expect(canAccessPermission('cashier', 'manager:orders')).toBe(true);
    expect(canAccessPermission('cashier', 'manager:customers')).toBe(false);
  });

  test('an explicitly empty cloud role does not fall back to default access', () => {
    cacheConfiguredRolePermissions('cashier', {
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: [],
    });

    expect(canAccessPermission('cashier', 'pos')).toBe(false);
  });

  test('attendance records are independently assignable from attendance marking', () => {
    cacheConfiguredRolePermissions('cashier', {
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: ['employees:attendance'],
    });

    expect(canAccessPermission('cashier', 'employees:attendance')).toBe(true);
    expect(canAccessPermission('cashier', 'employees:attendance-records')).toBe(false);

    cacheConfiguredRolePermissions('cashier', {
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: ['employees:attendance-records'],
    });

    expect(canAccessPermission('cashier', 'employees:attendance')).toBe(false);
    expect(canAccessPermission('cashier', 'employees:attendance-records')).toBe(true);
  });

  test('purchase entry is independently assignable to an employee role', () => {
    cacheConfiguredRolePermissions('cashier', {
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: ['inventory:items', 'inventory:purchase'],
    });

    expect(canAccessPermission('cashier', 'inventory:purchase')).toBe(true);
    expect(canAccessPermission('cashier', 'inventory:warehouse')).toBe(false);
  });

  test('legacy manager attendance access migrates to the separate records permission', () => {
    localStorage.setItem('system_roles', JSON.stringify([{
      id: 'store_manager',
      permissionSchemaVersion: 3,
      permissions: ['employees:attendance'],
    }]));

    expect(canAccessPermission('store_manager', 'employees:attendance-records')).toBe(true);
  });

  test('keeps wheel operation separate from manager-only probability settings', () => {
    cacheConfiguredRolePermissions('cashier', {
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: ['customers:promotion'],
    });

    expect(canAccessPermission('cashier', 'customers:promotion')).toBe(true);
    expect(canAccessPermission('cashier', 'customers:promotion-settings')).toBe(false);
    expect(canAccessPermission('store_manager', 'customers:promotion-settings')).toBe(true);
    expect(canAccessPermission('super_admin', 'customers:promotion-settings')).toBe(true);
  });

  test('migrates an existing manager wheel permission to the separate settings page', () => {
    localStorage.setItem('system_roles', JSON.stringify([{
      id: 'store_manager',
      permissionSchemaVersion: 7,
      permissions: ['customers:manage', 'customers:promotion'],
    }]));

    expect(canAccessPermission('store_manager', 'customers:promotion-settings')).toBe(true);
  });

  test('respects an explicit manager removal after the settings permission migration', () => {
    localStorage.setItem('system_roles', JSON.stringify([{
      id: 'store_manager',
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      promotionSettingsPermissionConfigured: true,
      permissions: ['customers:manage', 'customers:promotion'],
    }]));

    expect(canAccessPermission('store_manager', 'customers:promotion-settings')).toBe(false);
  });
});
