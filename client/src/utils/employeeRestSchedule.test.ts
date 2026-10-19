import {
  createRestScheduleId,
  getMonthRange,
  getWeekDates,
  getWeekRange,
  shiftDateKey,
} from './employeeRestSchedule';

describe('employee weekly rest schedule helpers', () => {
  test('uses Monday through Sunday for a normal week', () => {
    expect(getWeekRange('2026-10-19')).toEqual({
      startDate: '2026-10-19',
      endDate: '2026-10-25',
    });
    expect(getWeekRange('2026-10-25')).toEqual({
      startDate: '2026-10-19',
      endDate: '2026-10-25',
    });
  });

  test('crosses month and year boundaries without UTC drift', () => {
    expect(getWeekDates('2026-01-01')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('uses the real final day of the selected month', () => {
    expect(getMonthRange('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(getMonthRange('2028-02')).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });

  test('creates one stable document id per employee and week', () => {
    expect(createRestScheduleId('2026-10-19', 'employee/1')).toBe('rest_2026-10-19_employee_1');
  });
});
