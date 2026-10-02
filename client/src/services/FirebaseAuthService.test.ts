import { buildFirestoreAppUser } from './FirebaseAuthService';

describe('buildFirestoreAppUser', () => {
  test('omits undefined multi-store fields for a store account', () => {
    const profile = buildFirestoreAppUser('uid-1', 'cashier1', 'cashier1@restaurant.local', {
      username: 'cashier1',
      name: 'Cashier One',
      role: 'cashier',
      storeId: 'store-1',
      storeName: 'Store One',
      storeIds: undefined,
      assignedStores: undefined,
      status: 'active',
    });

    expect(profile).not.toHaveProperty('storeIds');
    expect(profile).not.toHaveProperty('assignedStores');
    expect(Object.values(profile)).not.toContain(undefined);
  });

  test('keeps assigned stores for a multi-store manager', () => {
    const profile = buildFirestoreAppUser('uid-2', 'manager1', 'manager1@restaurant.local', {
      username: 'manager1',
      name: 'Manager One',
      role: 'multi_store_manager',
      storeId: 'store-1',
      storeName: 'Store One',
      storeIds: ['store-1', 'store-2'],
      assignedStores: [
        { id: 'store-1', name: 'Store One' },
        { id: 'store-2', name: 'Store Two' },
      ],
      status: 'active',
    });

    expect(profile.storeIds).toEqual(['store-1', 'store-2']);
    expect(profile.assignedStores).toHaveLength(2);
    expect(Object.values(profile)).not.toContain(undefined);
  });
});
