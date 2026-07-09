import {
  buildCustomerCenterRows,
  buildCustomerCenterSummary,
  filterCustomerRows,
  getCustomerPointLedger,
} from './customerAnalytics';

const customer = (overrides: any) => ({
  id: overrides.id,
  name: overrides.name || overrides.id,
  phone: overrides.phone || '',
  points: overrides.points || 0,
  totalSpent: overrides.totalSpent || 0,
  visitCount: overrides.visitCount || 0,
  createdAt: overrides.createdAt || '2026-01-01T08:00:00.000-06:00',
  lastVisitAt: overrides.lastVisitAt,
  socialAccounts: overrides.socialAccounts || {},
  notes: overrides.notes || '',
});

const order = (overrides: any) => ({
  id: overrides.id,
  customerId: overrides.customerId,
  customerName: overrides.customerName,
  customerPhone: overrides.customerPhone,
  status: overrides.status || 'completed',
  paymentStatus: overrides.paymentStatus || 'paid',
  paymentMethod: 'cash',
  totalAmount: overrides.totalAmount,
  settledAmount: overrides.settledAmount,
  paidAmount: overrides.paidAmount,
  completedAt: overrides.completedAt,
  items: [],
});

describe('customerAnalytics', () => {
  test('builds customer rows from paid orders instead of trusting stale customer totals', () => {
    const rows = buildCustomerCenterRows(
      [
        customer({ id: 'c1', name: 'Ana', points: 1200, totalSpent: 9999, visitCount: 99 }),
        customer({ id: 'c2', name: 'Luis', totalSpent: 50, visitCount: 1 }),
      ],
      [
        order({ id: 'o1', customerId: 'c1', totalAmount: 200, completedAt: '2026-06-01T12:00:00.000-06:00' }),
        order({ id: 'o2', customerId: 'c1', totalAmount: 300, completedAt: '2026-06-20T12:00:00.000-06:00' }),
      ],
      [],
      new Date('2026-06-24T12:00:00.000-06:00')
    );

    expect(rows[0]).toMatchObject({
      id: 'c1',
      lifetimeSpend: 500,
      visitCount: 2,
      averageTicket: 250,
      lastVisitDate: '2026-06-20',
      segment: 'active',
    });
    expect(rows[1]).toMatchObject({
      id: 'c2',
      lifetimeSpend: 50,
      visitCount: 1,
    });
  });

  test('summarizes active sleeping high value and points exposure', () => {
    const rows = buildCustomerCenterRows(
      [
        customer({ id: 'vip', points: 8000 }),
        customer({ id: 'sleep', points: 50, lastVisitAt: '2026-03-01T12:00:00.000-06:00' }),
        customer({ id: 'new', points: 0 }),
      ],
      [
        order({ id: 'vip-order', customerId: 'vip', totalAmount: 12000, completedAt: '2026-06-22T12:00:00.000-06:00' }),
        order({ id: 'sleep-order', customerId: 'sleep', totalAmount: 300, completedAt: '2026-03-01T12:00:00.000-06:00' }),
      ],
      [],
      new Date('2026-06-24T12:00:00.000-06:00')
    );
    const summary = buildCustomerCenterSummary(rows, 100);

    expect(summary).toMatchObject({
      totalCustomers: 3,
      activeCustomers: 1,
      sleepingCustomers: 1,
      highValueCustomers: 1,
      totalPoints: 8050,
      totalSpend: 12300,
      averageSpend: 4100,
      pointsLiability: 80.5,
    });
  });

  test('filters customer rows by segment and ranks by spend or points', () => {
    const rows = buildCustomerCenterRows(
      [
        customer({ id: 'vip', name: 'VIP', points: 3000 }),
        customer({ id: 'points', name: 'Points', points: 1200 }),
        customer({ id: 'sleep', name: 'Dormido', points: 0 }),
      ],
      [
        order({ id: 'o1', customerId: 'vip', totalAmount: 9000, completedAt: '2026-06-21T12:00:00.000-06:00' }),
        order({ id: 'o2', customerId: 'points', totalAmount: 200, completedAt: '2026-06-22T12:00:00.000-06:00' }),
        order({ id: 'o3', customerId: 'sleep', totalAmount: 100, completedAt: '2026-02-01T12:00:00.000-06:00' }),
      ],
      [
        { id: 'points-ledger', customerId: 'points', type: 'earn', points: 1200, description: 'earn', createdAt: '2026-06-22T12:00:00.000-06:00' },
      ],
      new Date('2026-06-24T12:00:00.000-06:00')
    );

    expect(filterCustomerRows(rows, { segment: 'vip', query: '', sortBy: 'spend' }).map(row => row.id)).toEqual(['vip']);
    expect(filterCustomerRows(rows, { segment: 'points', query: '', sortBy: 'points' }).map(row => row.id)[0]).toBe('points');
    expect(filterCustomerRows(rows, { segment: 'sleeping', query: '', sortBy: 'recent' }).map(row => row.id)).toEqual(['sleep']);
  });

  test('returns one customer point ledger newest first', () => {
    const ledger = getCustomerPointLedger('c1', [
      { id: 'old', customerId: 'c1', type: 'earn', points: 10, description: 'old', createdAt: '2026-06-01T12:00:00.000-06:00' },
      { id: 'other', customerId: 'c2', type: 'earn', points: 999, description: 'other', createdAt: '2026-06-24T12:00:00.000-06:00' },
      { id: 'new', customerId: 'c1', type: 'redeem', points: -5, description: 'new', createdAt: '2026-06-23T12:00:00.000-06:00' },
    ]);

    expect(ledger.map(item => item.id)).toEqual(['new', 'old']);
  });
});
