import {
  createRestScheduleId,
  getMonthRange,
  normalizeRestDates,
  getWeekDates,
  getWeekRange,
  shiftDateKey,
  toggleRestDate,
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

  test('supports any number of rest days without a hard-coded limit', () => {
    expect(toggleRestDate([], '2026-10-20')).toEqual(['2026-10-20']);
    expect(toggleRestDate(['2026-10-20'], '2026-10-22')).toEqual(['2026-10-20', '2026-10-22']);
    expect(toggleRestDate(['2026-10-20', '2026-10-22'], '2026-10-24')).toEqual(['2026-10-20', '2026-10-22', '2026-10-24']);
    expect(toggleRestDate(['2026-10-20', '2026-10-22', '2026-10-24'], '2026-10-20')).toEqual(['2026-10-22', '2026-10-24']);
  });

  test('keeps legacy single-day records readable', () => {
    expect(normalizeRestDates(undefined, '2026-10-21')).toEqual(['2026-10-21']);
  });
});
