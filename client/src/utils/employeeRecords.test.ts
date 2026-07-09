import {
  filterActiveEmployees,
  getSingleSalaryDefaultPeriod,
  parseOptionalMoneyInput,
} from './employeeRecords';

describe('employee record helpers', () => {
  test('filters deleted employees by deletion records and item flag', () => {
    const employees = [
      { id: 'active-1', name: 'Active One', status: 'active' },
      { id: 'deleted-by-record', name: 'Deleted By Record', status: 'active' },
      { id: 'deleted-by-flag', name: 'Deleted By Flag', status: 'inactive', isDeleted: true },
    ];
    const deletions = [{ id: 'deleted-by-record', employeeId: 'deleted-by-record' }];

    const result = filterActiveEmployees(employees, deletions);

    expect(result.map(employee => employee.id)).toEqual(['active-1']);
  });

  test('keeps optional money input empty while typing', () => {
    expect(parseOptionalMoneyInput('')).toBeUndefined();
    expect(parseOptionalMoneyInput('   ')).toBeUndefined();
    expect(parseOptionalMoneyInput('0')).toBe(0);
    expect(parseOptionalMoneyInput('125.50')).toBe(125.5);
  });

  test('defaults single salary settlement to month start through today', () => {
    const period = getSingleSalaryDefaultPeriod(
      { id: 'emp-1', hireDate: '2026-05-10' },
      [],
      '2026-07-08'
    );

    expect(period).toEqual({ startDate: '2026-07-01', endDate: '2026-07-08' });
  });

  test('defaults single salary settlement to day 16 after first half is settled', () => {
    const period = getSingleSalaryDefaultPeriod(
      { id: 'emp-1', hireDate: '2026-05-10' },
      [{ employeeId: 'emp-1', startDate: '2026-07-01', endDate: '2026-07-15' }],
      '2026-07-20'
    );

    expect(period).toEqual({ startDate: '2026-07-16', endDate: '2026-07-20' });
  });

  test('uses hire date for mid-period new employees', () => {
    const period = getSingleSalaryDefaultPeriod(
      { id: 'emp-1', hireDate: '2026-07-06' },
      [],
      '2026-07-20'
    );

    expect(period).toEqual({ startDate: '2026-07-06', endDate: '2026-07-20' });
  });
});
