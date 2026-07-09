import { getOrderCollectedAmount, getOrderFinancialDateKey } from './financeMetrics';

export interface CustomerProfileRecord {
  id: string;
  name?: string;
  phone?: string;
  points?: number;
  totalSpent?: number;
  visitCount?: number;
  createdAt?: string;
  lastVisitAt?: string;
  notes?: string;
  level?: string;
  socialAccounts?: {
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    telegram?: string;
  };
}

export interface PointTransactionRecord {
  id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'adjust' | string;
  points: number;
  description: string;
  createdAt: string;
}

export type CustomerSegment = 'new' | 'active' | 'sleeping' | 'vip' | 'points';

export interface CustomerCenterRow extends CustomerProfileRecord {
  name: string;
  phone: string;
  points: number;
  lifetimeSpend: number;
  visitCount: number;
  averageTicket: number;
  lastVisitDate: string;
  daysSinceVisit: number | null;
  segment: CustomerSegment;
  redeemValue: number;
}

export interface CustomerCenterSummary {
  totalCustomers: number;
  activeCustomers: number;
  sleepingCustomers: number;
  highValueCustomers: number;
  totalPoints: number;
  totalSpend: number;
  averageSpend: number;
  pointsLiability: number;
}

export type CustomerSortKey = 'recent' | 'spend' | 'points' | 'visits' | 'name';

const toNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateKey = (value: any): string => {
  const time = toTime(value);
  if (!time) return '';
  return new Date(time).toISOString().slice(0, 10);
};

const diffDays = (latestDateKey: string, now: Date): number | null => {
  if (!latestDateKey) return null;
  const dateTime = new Date(`${latestDateKey}T00:00:00`).getTime();
  if (!Number.isFinite(dateTime)) return null;
  return Math.max(Math.floor((now.getTime() - dateTime) / 86400000), 0);
};

const getOrderCustomerKey = (order: any): string => {
  return String(order?.customerId || order?.customerPhone || order?.customerName || '').trim();
};

const getCustomerKeys = (customer: CustomerProfileRecord): string[] => {
  return [customer.id, customer.phone, customer.name].filter(Boolean).map(value => String(value).trim());
};

const isOrderLinkedToCustomer = (order: any, customer: CustomerProfileRecord): boolean => {
  const orderKey = getOrderCustomerKey(order);
  if (!orderKey) return false;
  return getCustomerKeys(customer).includes(orderKey);
};

const getOrderDateValue = (order: any): any => {
  return order?.lastPaidAt || order?.paidAt || order?.completedAt || order?.clearedAt || order?.createdAt || order?.date || order?.orderDate;
};

export const buildCustomerCenterRows = (
  customers: CustomerProfileRecord[],
  orders: any[] = [],
  transactions: PointTransactionRecord[] = [],
  now: Date = new Date(),
  pointsToCurrency = 100
): CustomerCenterRow[] => {
  return (Array.isArray(customers) ? customers : []).map(customer => {
    const linkedOrders = (Array.isArray(orders) ? orders : []).filter(order => isOrderLinkedToCustomer(order, customer));
    const paidOrders = linkedOrders.filter(order => getOrderCollectedAmount(order) > 0);
    const orderSpend = paidOrders.reduce((sum, order) => sum + getOrderCollectedAmount(order), 0);
    const orderDates = paidOrders
      .map(order => getOrderFinancialDateKey(order) || toDateKey(getOrderDateValue(order)))
      .filter(Boolean)
      .sort();
    const latestOrderDate = orderDates[orderDates.length - 1] || '';
    const profileLastVisit = toDateKey(customer.lastVisitAt);
    const lastVisitDate = latestOrderDate || profileLastVisit;
    const visitCount = paidOrders.length || toNumber(customer.visitCount);
    const lifetimeSpend = paidOrders.length ? orderSpend : toNumber(customer.totalSpent);
    const points = toNumber(customer.points);
    const daysSinceVisit = diffDays(lastVisitDate, now);
    const transactionCount = transactions.filter(item => item.customerId === customer.id).length;
    const highValue = lifetimeSpend >= 8000 || points >= 5000;
    const segment: CustomerSegment = highValue
      ? 'vip'
      : points > 0 && transactionCount > 0
        ? 'points'
        : daysSinceVisit !== null && daysSinceVisit > 60
          ? 'sleeping'
          : visitCount > 0
            ? 'active'
            : 'new';

    return {
      ...customer,
      id: customer.id,
      name: customer.name || 'Sin nombre',
      phone: customer.phone || '',
      points,
      lifetimeSpend,
      visitCount,
      averageTicket: visitCount > 0 ? lifetimeSpend / visitCount : 0,
      lastVisitDate,
      daysSinceVisit,
      segment,
      redeemValue: pointsToCurrency > 0 ? points / pointsToCurrency : 0,
    };
  });
};

export const buildCustomerCenterSummary = (
  rows: CustomerCenterRow[],
  pointsToCurrency = 100
): CustomerCenterSummary => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalSpend = safeRows.reduce((sum, row) => sum + row.lifetimeSpend, 0);
  const totalPoints = safeRows.reduce((sum, row) => sum + row.points, 0);

  return {
    totalCustomers: safeRows.length,
    activeCustomers: safeRows.filter(row => row.segment === 'active' || row.segment === 'vip' || row.segment === 'points').length,
    sleepingCustomers: safeRows.filter(row => row.segment === 'sleeping').length,
    highValueCustomers: safeRows.filter(row => row.segment === 'vip').length,
    totalPoints,
    totalSpend,
    averageSpend: safeRows.length ? totalSpend / safeRows.length : 0,
    pointsLiability: pointsToCurrency > 0 ? totalPoints / pointsToCurrency : 0,
  };
};

export const filterCustomerRows = (
  rows: CustomerCenterRow[],
  filters: { query: string; segment: 'all' | CustomerSegment; sortBy: CustomerSortKey }
): CustomerCenterRow[] => {
  const query = filters.query.trim().toLowerCase();
  const filtered = rows.filter(row => {
    const matchesQuery = !query || row.name.toLowerCase().includes(query) || row.phone.includes(query);
    const matchesSegment = filters.segment === 'all' || row.segment === filters.segment;
    return matchesQuery && matchesSegment;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sortBy) {
      case 'spend':
        return b.lifetimeSpend - a.lifetimeSpend;
      case 'points':
        return b.points - a.points;
      case 'visits':
        return b.visitCount - a.visitCount;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'recent':
      default:
        return toTime(b.lastVisitDate) - toTime(a.lastVisitDate);
    }
  });
};

export const getCustomerPointLedger = (
  customerId: string,
  transactions: PointTransactionRecord[]
): PointTransactionRecord[] => {
  return (Array.isArray(transactions) ? transactions : [])
    .filter(transaction => transaction.customerId === customerId)
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
};
