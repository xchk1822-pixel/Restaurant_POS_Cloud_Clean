import { filterActiveEmployees } from './employeeRecords';

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
});
