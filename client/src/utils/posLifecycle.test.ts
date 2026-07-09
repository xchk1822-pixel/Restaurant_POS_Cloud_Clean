import {
  hasNewerCloudOrders,
  getPosOrderCardColor,
  getPosOrderStatusText,
  getPosLifecycleSnapshot,
  isDisplayablePosOrder,
  mergeOrdersByVersion,
  reconcileTableStatusFromOrders,
  type PosLifecycleOrder,
  type PosLifecycleTable,
} from './posLifecycle';

const baseOrder = (overrides: Partial<PosLifecycleOrder> = {}): PosLifecycleOrder => ({
  id: 'order-1',
  orderNumber: '0630001',
  tableId: 'table-1',
  tableNumber: '1',
  orderType: 'dine_in',
  status: 'confirmed',
  paymentStatus: 'unpaid',
  totalAmount: 100,
  paidAmount: 0,
  settledAmount: 0,
  createdAt: new Date('2026-06-30T10:00:00-06:00'),
  lastModified: 1000,
  items: [
    {
      id: 'item-1',
      menuItemId: 'menu-1',
      quantity: 1,
      subtotal: 100,
    },
  ],
  ...overrides,
});

const baseTable = (overrides: Partial<PosLifecycleTable> = {}): PosLifecycleTable => ({
  id: 'table-1',
  status: 'available',
  ...overrides,
});

describe('POS lifecycle merge rules', () => {
  test('cloud completed state overrides a stale paid local order even when local timestamp is newer', () => {
    const localOrder = baseOrder({
      status: 'served',
      paymentStatus: 'paid',
      paidAmount: 100,
      settledAmount: 100,
      lastModified: 5000,
    });
    const cloudOrder = baseOrder({
      status: 'completed',
      paymentStatus: 'paid',
      paidAmount: 100,
      settledAmount: 100,
      completedAt: new Date('2026-06-30T10:15:00-06:00'),
      clearedAt: new Date('2026-06-30T10:15:00-06:00'),
      stockDeducted: true,
      lastModified: 2000,
    });

    expect(hasNewerCloudOrders([cloudOrder], [localOrder])).toBe(true);
    expect(mergeOrdersByVersion([localOrder], [cloudOrder])[0]).toMatchObject({
      status: 'completed',
      stockDeducted: true,
    });
  });

  test('cloud cancelled state overrides a stale confirmed local order and stays displayable for history', () => {
    const localOrder = baseOrder({ status: 'confirmed', lastModified: 5000 });
    const cloudOrder = baseOrder({
      status: 'cancelled',
      cancelReason: 'Cliente cancelo',
      cancelledAt: new Date('2026-06-30T10:05:00-06:00'),
      lastModified: 2000,
    } as Partial<PosLifecycleOrder>);

    const merged = mergeOrdersByVersion([localOrder], [cloudOrder])[0];

    expect(merged.status).toBe('cancelled');
    expect(isDisplayablePosOrder(merged)).toBe(true);
  });

  test('local completed order is not regressed by an older unpaid cloud snapshot', () => {
    const localOrder = baseOrder({
      status: 'completed',
      paymentStatus: 'paid',
      paidAmount: 100,
      settledAmount: 100,
      completedAt: new Date('2026-06-30T10:15:00-06:00'),
      clearedAt: new Date('2026-06-30T10:15:00-06:00'),
      stockDeducted: true,
      lastModified: 5000,
    });
    const cloudOrder = baseOrder({ status: 'confirmed', paymentStatus: 'unpaid', lastModified: 1000 });

    expect(hasNewerCloudOrders([cloudOrder], [localOrder])).toBe(false);
    expect(mergeOrdersByVersion([localOrder], [cloudOrder])[0]).toMatchObject({
      status: 'completed',
      paymentStatus: 'paid',
      stockDeducted: true,
    });
  });

  test('pending local terminal order is not replaced until cloud echoes the same terminal state', () => {
    const localOrder = baseOrder({
      status: 'completed',
      paymentStatus: 'paid',
      completedAt: new Date('2026-06-30T10:15:00-06:00'),
      stockDeducted: true,
      lastModified: 5000,
    });
    const cloudOrder = baseOrder({
      status: 'completed',
      paymentStatus: 'paid',
      completedAt: new Date('2026-06-30T10:10:00-06:00'),
      stockDeducted: false,
      lastModified: 6000,
    });

    const merged = mergeOrdersByVersion([localOrder], [cloudOrder], new Set(['order-1']))[0];

    expect(merged).toMatchObject({
      completedAt: localOrder.completedAt,
      stockDeducted: true,
    });
  });

  test('table status follows unpaid, paid, completed, and cancelled order states', () => {
    expect(
      reconcileTableStatusFromOrders(baseTable(), [baseOrder({ status: 'confirmed', paymentStatus: 'unpaid' })], 100)
    ).toMatchObject({ status: 'occupied', currentOrderId: 'order-1', lastModified: 100 });

    expect(
      reconcileTableStatusFromOrders(baseTable({ status: 'occupied', currentOrderId: 'order-1' }), [
        baseOrder({ status: 'served', paymentStatus: 'paid' }),
      ], 200)
    ).toMatchObject({ status: 'needs_cleaning', currentOrderId: 'order-1', lastModified: 200 });

    expect(
      reconcileTableStatusFromOrders(baseTable({ status: 'needs_cleaning', currentOrderId: 'order-1' }), [
        baseOrder({ status: 'completed', paymentStatus: 'paid', clearedAt: new Date() }),
      ], 300)
    ).toMatchObject({ status: 'available', currentOrderId: '', lastModified: 300 });

    expect(
      reconcileTableStatusFromOrders(baseTable({ status: 'occupied', currentOrderId: 'order-1' }), [
        baseOrder({ status: 'cancelled' }),
      ], 400)
    ).toMatchObject({ status: 'available', currentOrderId: '', lastModified: 400 });
  });

  test('order card visual state follows active red, paid orange, and terminal neutral rules', () => {
    expect(getPosOrderCardColor('confirmed', 'unpaid')).toBe('#fecaca');
    expect(getPosOrderCardColor('preparing', 'unpaid')).toBe('#fecaca');
    expect(getPosOrderCardColor('served', 'unpaid')).toBe('#fecaca');
    expect(getPosOrderCardColor('served', 'paid')).toBe('#fed7aa');
    expect(getPosOrderCardColor('completed', 'paid')).toBe('#ffffff');
    expect(getPosOrderCardColor('cancelled', 'unpaid')).toBe('#ffffff');

    expect(getPosOrderStatusText('served', 'paid')).toBe('Pagado');
    expect(getPosOrderStatusText('completed', 'paid')).toBe('Completado');
    expect(getPosOrderStatusText('cancelled', 'unpaid')).toBe('Cancelado');
  });

  test('dine-in lifecycle flow keeps table status and order card state in lockstep', () => {
    const confirmedOrder = baseOrder({ status: 'confirmed', paymentStatus: 'unpaid' });
    expect(getPosLifecycleSnapshot(confirmedOrder, baseTable(), 100)).toMatchObject({
      tableStatus: 'occupied',
      tableCurrentOrderId: 'order-1',
      orderCardColor: '#fecaca',
      orderStatusText: 'Confirmado',
      isTerminal: false,
    });

    const paidOrder = baseOrder({
      status: 'served',
      paymentStatus: 'paid',
      paidAmount: 100,
      settledAmount: 100,
    });
    expect(getPosLifecycleSnapshot(paidOrder, baseTable({ status: 'occupied', currentOrderId: 'order-1' }), 200))
      .toMatchObject({
        tableStatus: 'needs_cleaning',
        tableCurrentOrderId: 'order-1',
        orderCardColor: '#fed7aa',
        orderStatusText: 'Pagado',
        isTerminal: false,
      });

    const completedOrder = baseOrder({
      status: 'completed',
      paymentStatus: 'paid',
      paidAmount: 100,
      settledAmount: 100,
      completedAt: new Date('2026-06-30T10:15:00-06:00'),
      clearedAt: new Date('2026-06-30T10:16:00-06:00'),
      stockDeducted: true,
    });
    expect(getPosLifecycleSnapshot(completedOrder, baseTable({ status: 'needs_cleaning', currentOrderId: 'order-1' }), 300))
      .toMatchObject({
        tableStatus: 'available',
        tableCurrentOrderId: '',
        orderCardColor: '#ffffff',
        orderStatusText: 'Completado',
        isTerminal: true,
      });

    const cancelledOrder = baseOrder({
      status: 'cancelled',
      paymentStatus: 'unpaid',
      cancelledAt: new Date('2026-06-30T10:08:00-06:00'),
    });
    expect(getPosLifecycleSnapshot(cancelledOrder, baseTable({ status: 'occupied', currentOrderId: 'order-1' }), 400))
      .toMatchObject({
        tableStatus: 'available',
        tableCurrentOrderId: '',
        orderCardColor: '#ffffff',
        orderStatusText: 'Cancelado',
        isTerminal: true,
      });
  });
});
