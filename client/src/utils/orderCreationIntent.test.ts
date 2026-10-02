import { OrderCreationCoordinator } from './orderCreationIntent';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

describe('OrderCreationCoordinator', () => {
  test('reuses one document id for every create path in the same order-entry session', () => {
    const coordinator = new OrderCreationCoordinator('intent', createStorage(), () => 'order-intent-1');

    const started = coordinator.beginNew();
    expect(coordinator.claim().id).toBe(started.id);
    expect(coordinator.claim().id).toBe('order-intent-1');
  });

  test('coalesces concurrent official order-number allocation', async () => {
    const coordinator = new OrderCreationCoordinator('intent', createStorage(), () => 'order-intent-1');
    coordinator.beginNew();
    const allocate = jest.fn(async () => '0722050');

    const [first, second] = await Promise.all([
      coordinator.getOrCreateOrderNumber(allocate),
      coordinator.getOrCreateOrderNumber(allocate),
    ]);

    expect(first).toBe('0722050');
    expect(second).toBe('0722050');
    expect(allocate).toHaveBeenCalledTimes(1);
  });

  test('survives route remount and only rotates on an explicit new order', async () => {
    const storage = createStorage();
    const first = new OrderCreationCoordinator('intent', storage, () => 'order-intent-1');
    first.beginNew();
    await first.getOrCreateOrderNumber(async () => '0722050');

    const restored = new OrderCreationCoordinator('intent', storage, () => 'order-intent-2');
    expect(restored.claim()).toMatchObject({ id: 'order-intent-1', orderNumber: '0722050' });
    expect(restored.beginNew().id).toBe('order-intent-2');
  });

  test('binding an existing order prevents a new identity from being created', () => {
    const coordinator = new OrderCreationCoordinator('intent', createStorage(), () => 'should-not-run');
    coordinator.bindExisting('cloud-order-1', '0722049');

    expect(coordinator.claim('cloud-order-1', '0722049')).toMatchObject({
      id: 'cloud-order-1',
      orderNumber: '0722049',
    });
  });

  test('continues in memory when browser storage is unavailable', () => {
    const blockedStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const coordinator = new OrderCreationCoordinator('intent', blockedStorage, () => 'order-intent-1');

    expect(coordinator.beginNew().id).toBe('order-intent-1');
    expect(coordinator.claim().id).toBe('order-intent-1');
    expect(() => coordinator.clear()).not.toThrow();
  });
});
