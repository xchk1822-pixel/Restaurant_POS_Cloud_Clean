jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/pos' }),
}), { virtual: true });

import { getAccessibleMenuItems } from './MainLayout';
import { cacheConfiguredRolePermissions } from '../../utils/permissions';

describe('permission-aware navigation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('shows parent modules for granted child permissions and hides ungranted children', () => {
    cacheConfiguredRolePermissions('cashier', {
      permissions: [
        'pos',
        'inventory:warehouse',
        'inventory:fridge',
        'employees:attendance',
        'employees:loans',
        'manager:expenses',
        'manager:handover',
        'manager:orders',
      ],
    });

    const items = getAccessibleMenuItems('cashier');
    expect(items.map(item => item.path)).toEqual([
      '/pos',
      '/inventory',
      '/employees',
      '/manager',
    ]);
    expect(items.find(item => item.path === '/inventory')?.children?.map(child => child.path)).toEqual([
      '/inventory/warehouse',
      '/inventory/fridge',
    ]);
    expect(items.find(item => item.path === '/employees')?.children?.map(child => child.path)).toEqual([
      '/employees/attendance',
      '/employees/loans',
    ]);
    expect(items.find(item => item.path === '/manager')?.children?.map(child => child.path)).toEqual([
      '/manager/expense-records',
      '/manager/shift-handover',
      '/manager/order-history',
    ]);
  });

  test('shows attendance records as a standalone assigned child permission', () => {
    cacheConfiguredRolePermissions('cashier', {
      permissionSchemaVersion: 4,
      permissions: ['employees:attendance-records'],
    });

    const employeesMenu = getAccessibleMenuItems('cashier').find(item => item.path === '/employees');
    expect(employeesMenu?.children?.map(child => child.path)).toEqual([
      '/employees/attendance-records',
    ]);
  });
});
