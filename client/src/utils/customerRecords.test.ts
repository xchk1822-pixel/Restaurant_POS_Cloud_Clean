import {
  buildCustomerIdFromPhone,
  filterActiveCustomers,
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from './customerRecords';

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

  test('normalizes Nicaragua phone numbers into one stable customer identity', () => {
    expect(normalizeCustomerPhone('7542 4688')).toBe('50575424688');
    expect(normalizeCustomerPhone('+505 7542-4688')).toBe('50575424688');
    expect(buildCustomerIdFromPhone('7542-4688')).toBe('CUST-PHONE-50575424688');
    expect(isValidCustomerPhone('7542 4688')).toBe(true);
    expect(isValidCustomerPhone('123')).toBe(false);
  });
});
