import { UserRole } from '../contexts/AuthContext';

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['dashboard', 'settings', 'settings:stores', 'settings:exchange', 'settings:permissions', 'settings:backup'],
  store_manager: [
    'pos',
    'waiter',
    'kitchen',
    'inventory',
    'inventory:items',
    'inventory:menu',
    'inventory:warehouse',
    'inventory:fridge',
    'inventory:suppliers',
    'employees',
    'employees:profile',
    'employees:attendance',
    'employees:loans',
    'employees:salary',
    'manager',
    'manager:expenses',
    'manager:handover',
    'manager:orders',
    'manager:reports',
    'manager:overview',
    'manager:customers',
  ],
  cashier: ['pos'],
  waiter: ['waiter'],
  chef: ['kitchen'],
};

export const getConfiguredRolePermissions = (role: UserRole): string[] | null => {
  try {
    const rolesData = localStorage.getItem('system_roles');
    if (!rolesData) return null;
    const roles = JSON.parse(rolesData);
    const roleConfig = Array.isArray(roles) ? roles.find((item: any) => item.id === role) : null;
    return Array.isArray(roleConfig?.permissions) ? roleConfig.permissions : null;
  } catch {
    return null;
  }
};

export const canAccessPermission = (role: UserRole, permissionId?: string): boolean => {
  if (!permissionId) return true;

  const configured = getConfiguredRolePermissions(role);
  const permissions = configured && configured.length > 0
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
