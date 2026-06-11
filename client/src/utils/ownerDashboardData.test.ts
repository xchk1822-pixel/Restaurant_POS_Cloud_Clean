import { dedupeOwnerRecordsById } from './ownerDashboardData';

describe('owner dashboard data helpers', () => {
  test('deduplicates records by id and keeps the newest version', () => {
    const records = [
      { id: 'store-a', name: 'Old Store', updatedAt: '2026-01-01 10:00:00' },
      { id: 'store-a', name: 'New Store', lastModified: 1781143901975 },
      { id: 'store-b', name: 'Other Store', lastModified: 1 },
    ];

    expect(dedupeOwnerRecordsById(records)).toEqual([
      { id: 'store-a', name: 'New Store', lastModified: 1781143901975 },
      { id: 'store-b', name: 'Other Store', lastModified: 1 },
    ]);
  });

  test('ignores deleted records while deduplicating', () => {
    const records = [
      { id: 'store-a', name: 'Active Store', lastModified: 1 },
      { id: 'store-b', name: 'Deleted Store', isDeleted: true, lastModified: 2 },
    ];

    expect(dedupeOwnerRecordsById(records)).toEqual([
      { id: 'store-a', name: 'Active Store', lastModified: 1 },
    ]);
  });
});
