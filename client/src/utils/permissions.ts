import type { UserRole } from '../contexts/AuthContext';

export const PERMISSION_SCHEMA_VERSION = 7;

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['dashboard', 'customers:promotion-settings', 'settings', 'settings:stores', 'settings:exchange', 'settings:permissions', 'settings:backup'],
  store_manager: [
    'pos',
    'waiter',
    'kitchen',
    'inventory',
    'inventory:items',
    'inventory:menu',
    'inventory:purchase',
    'inventory:warehouse',
    'inventory:fridge',
    'suppliers:manage',
    'employees',
    'employees:profile',
    'employees:attendance',
    'employees:attendance-records',
    'employees:loans',
    'employees:salary',
    'manager',
    'manager:expenses',
    'manager:handover',
    'manager:orders',
    'manager:reports',
    'manager:overview',
    'customers:manage',
    'customers:promotion',
    'customers:promotion-settings',
  ],
  multi_store_manager: [
    'pos',
    'waiter',
    'kitchen',
    'inventory',
    'inventory:items',
    'inventory:menu',
    'inventory:purchase',
    'inventory:warehouse',
    'inventory:fridge',
    'suppliers:manage',
    'employees',
    'employees:profile',
    'employees:attendance',
    'employees:attendance-records',
    'employees:loans',
    'employees:salary',
    'manager',
    'manager:expenses',
    'manager:handover',
    'manager:orders',
    'manager:reports',
    'manager:overview',
    'customers:manage',
    'customers:promotion',
    'customers:promotion-settings',
  ],
  cashier: ['pos'],
  waiter: ['waiter'],
  chef: ['kitchen'],
};

export const migrateRolePermissions = (
  role: UserRole,
  permissions: string[],
  permissionSchemaVersion?: number,
  promotionSettingsPermissionConfigured?: boolean
): string[] => {
  const next = permissions.filter(permission =>
    permission !== 'inventory:suppliers' &&
    permission !== 'manager:customers'
  );

  if (
    (role === 'store_manager' || role === 'multi_store_manager') &&
    permissionSchemaVersion !== PERMISSION_SCHEMA_VERSION &&
    (permissions.includes('inventory') || permissions.includes('inventory:suppliers')) &&
    !next.includes('suppliers:manage')
  ) {
    next.push('suppliers:manage');
  }

  if (
    (role === 'store_manager' || role === 'multi_store_manager') &&
    permissionSchemaVersion !== PERMISSION_SCHEMA_VERSION &&
    (permissions.includes('manager') || permissions.includes('manager:customers')) &&
    !next.includes('customers:manage')
  ) {
    next.push('customers:manage');
  }

  if (
    (role === 'store_manager' || role === 'multi_store_manager') &&
    permissionSchemaVersion !== PERMISSION_SCHEMA_VERSION &&
    (permissions.includes('customers:manage') || permissions.includes('manager:customers')) &&
    !next.includes('customers:promotion')
  ) {
    next.push('customers:promotion');
  }

  if (
    (role === 'super_admin' || role === 'store_manager' || role === 'multi_store_manager') &&
    promotionSettingsPermissionConfigured !== true &&
    (role === 'super_admin' || permissions.includes('customers:promotion') || permissions.includes('customers:manage')) &&
    !next.includes('customers:promotion-settings')
  ) {
    next.push('customers:promotion-settings');
  }

  if (
    (role === 'store_manager' || role === 'multi_store_manager') &&
    permissionSchemaVersion !== PERMISSION_SCHEMA_VERSION &&
    permissions.includes('employees:attendance') &&
    !next.includes('employees:attendance-records')
  ) {
    next.push('employees:attendance-records');
  }

  return next;
};

export const getConfiguredRolePermissions = (role: UserRole): string[] | null => {
  try {
    const rolesData = localStorage.getItem('system_roles');
    if (!rolesData) return null;
    const roles = JSON.parse(rolesData);
    const roleConfig = Array.isArray(roles) ? roles.find((item: any) => item.id === role) : null;
    return Array.isArray(roleConfig?.permissions)
      ? migrateRolePermissions(
          role,
          roleConfig.permissions,
          roleConfig.permissionSchemaVersion,
          roleConfig.promotionSettingsPermissionConfigured
        )
      : null;
  } catch {
    return null;
  }
};

export const cacheConfiguredRolePermissions = (
  role: UserRole,
  roleConfig: Record<string, any>
): string[] => {
  const permissions = migrateRolePermissions(
    role,
    Array.isArray(roleConfig.permissions) ? roleConfig.permissions : [],
    roleConfig.permissionSchemaVersion,
    roleConfig.promotionSettingsPermissionConfigured
  );

  let cachedRoles: any[] = [];
  try {
    const saved = localStorage.getItem('system_roles');
    const parsed = saved ? JSON.parse(saved) : [];
    cachedRoles = Array.isArray(parsed) ? parsed : [];
  } catch {
    cachedRoles = [];
  }

  const nextRole = {
    ...roleConfig,
    id: role,
    permissions,
    permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
    promotionSettingsPermissionConfigured: roleConfig.promotionSettingsPermissionConfigured === true,
  };
  localStorage.setItem('system_roles', JSON.stringify([
    ...cachedRoles.filter(item => item?.id !== role),
    nextRole,
  ]));
  return permissions;
};

export const canAccessPermission = (role: UserRole, permissionId?: string): boolean => {
  if (!permissionId) return true;

  const configured = getConfiguredRolePermissions(role);
  const permissions = configured !== null
    ? configured
    : DEFAULT_ROLE_PERMISSIONS[role] || [];

  const parentPermission = permissionId.includes(':') ? permissionId.split(':')[0] : permissionId;
  return permissions.includes(permissionId) || permissions.includes(parentPermission);
};

export const getDefaultPathForRole = (role: UserRole): string => {
  switch (role) {
    case 'super_admin':
      return '/dashboard';
    case 'store_manager':
    case 'multi_store_manager':
      return '/manager';
    case 'cashier':
      return '/pos';
    case 'waiter':
      return '/waiter';
    case 'chef':
      return '/kitchen';
    default:
      return '/login';
  }
};
