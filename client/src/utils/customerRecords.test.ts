import { filterActiveCustomers } from './customerRecords';

describe('customer record helpers', () => {
  test('filters deleted customers by deletion records and item flag', () => {
    const customers = [
      { id: 'active-1', name: 'Active One' },
      { id: 'deleted-by-record', name: 'Deleted By Record' },
      { id: 'deleted-by-flag', name: 'Deleted By Flag', isDeleted: true },
    ];
    const deletions = [{ id: 'deleted-by-record', customerId: 'deleted-by-record' }];

    const result = filterActiveCustomers(customers, deletions);

    expect(result.map(customer => customer.id)).toEqual(['active-1']);
  });
});
