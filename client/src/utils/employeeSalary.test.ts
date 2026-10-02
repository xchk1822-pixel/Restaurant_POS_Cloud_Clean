import {
  calculateBaseSalary,
  calculatePeriodBaseSalary,
  calculateLoanSettlement,
  calculateSalaryInstallment,
  getDailySalaryForDate,
  getSemiMonthlySalaryDayRate,
  getSettledSalaryRecordsForRange,
  resolveMonthlySalary,
  roundSalaryAmount,
} from './employeeSalary';

const monthAttendance = (year: number, month: number, days: number) =>
  Array.from({ length: days }, (_, index) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    status: 'normal',
  }));

describe('employee monthly salary helpers', () => {
  test('uses the explicit monthly salary and keeps legacy daily rates compatible', () => {
    expect(resolveMonthlySalary({ monthlySalary: 10000, dailyRate: 300 })).toBe(10000);
    expect(resolveMonthlySalary({ dailyRate: 300 })).toBe(9000);
  });

  test('calculates the daily salary using the actual days in each month', () => {
    expect(getDailySalaryForDate({ monthlySalary: 10000 }, '2026-01-15')).toBeCloseTo(322.58, 2);
    expect(getDailySalaryForDate({ monthlySalary: 10000 }, '2026-02-15')).toBeCloseTo(357.14, 2);
  });

  test('a fully attended month settles to the exact integer monthly salary', () => {
    expect(calculateBaseSalary({ monthlySalary: 10000 }, monthAttendance(2026, 1, 31))).toBe(10000);
    expect(calculateBaseSalary({ monthlySalary: 10000 }, monthAttendance(2026, 2, 28))).toBe(10000);
  });

  test('settles each complete half month to exactly half of the monthly salary', () => {
    const january = monthAttendance(2026, 1, 31);
    const february = monthAttendance(2026, 2, 28);

    expect(calculateBaseSalary({ monthlySalary: 35000 }, january.slice(0, 15))).toBe(17500);
    expect(calculateBaseSalary({ monthlySalary: 8000 }, january.slice(0, 15))).toBe(4000);
    expect(calculateBaseSalary({ monthlySalary: 8000 }, january.slice(15))).toBe(4000);
    expect(calculateBaseSalary({ monthlySalary: 8000 }, february.slice(15))).toBe(4000);
  });

  test('prorates missing days within their own half month', () => {
    expect(getSemiMonthlySalaryDayRate({ monthlySalary: 10000 }, '2026-01-01')).toBeCloseTo(333.33, 2);
    expect(getSemiMonthlySalaryDayRate({ monthlySalary: 10000 }, '2026-01-16')).toBeCloseTo(312.5, 2);
    expect(calculateBaseSalary({ monthlySalary: 10000 }, monthAttendance(2026, 1, 14))).toBe(4667);
  });

  test('monthly salary pays the selected calendar period and deducts only explicit unpaid days', () => {
    const attendance = monthAttendance(2026, 8, 31)
      .filter(record => record.date !== '2026-08-18')
      .map(record => record.date === '2026-08-20' ? { ...record, status: 'absent' } : record);

    expect(calculatePeriodBaseSalary(
      { monthlySalary: 35000, hireDate: '2026-06-01' },
      attendance,
      '2026-08-16',
      '2026-08-31'
    )).toBe(16406);
    expect(calculatePeriodBaseSalary(
      { monthlySalary: 35000, hireDate: '2026-06-01' },
      attendance.filter(record => record.status !== 'absent'),
      '2026-08-16',
      '2026-08-31'
    )).toBe(17500);
  });

  test('starts calendar salary from a mid-period hire date', () => {
    expect(calculatePeriodBaseSalary(
      { monthlySalary: 8000, hireDate: '2026-08-20' },
      [],
      '2026-08-16',
      '2026-08-31'
    )).toBe(3000);
  });

  test('history summary contains paid records inside the range once per employee period', () => {
    const records = [
      { id: 'old', employeeId: 'e1', startDate: '2026-08-01', endDate: '2026-08-15', status: 'paid', lastModified: 1 },
      { id: 'current-1', employeeId: 'e1', startDate: '2026-08-16', endDate: '2026-08-31', status: 'paid', lastModified: 1 },
      { id: 'current-2', employeeId: 'e1', startDate: '2026-08-16', endDate: '2026-08-31', status: 'paid', lastModified: 2 },
      { id: 'pending', employeeId: 'e2', startDate: '2026-08-16', endDate: '2026-08-31', status: 'pending', lastModified: 3 },
    ];

    expect(getSettledSalaryRecordsForRange(records, '2026-08-16', '2026-08-31'))
      .toEqual([records[2]]);
  });

  test('pays normal and rest days only and rounds the final salary once', () => {
    expect(calculateBaseSalary(
      { monthlySalary: 10000 },
      [
        { date: '2026-01-01', status: 'normal' },
        { date: '2026-01-02', status: 'rest' },
        { date: '2026-01-03', status: 'absent' },
      ]
    )).toBe(667);
  });

  test('settles the full loan unless the available wage is insufficient', () => {
    expect(calculateLoanSettlement(1200, 5000)).toBe(1200);
    expect(calculateLoanSettlement(6000, 5000)).toBe(5000);
    expect(calculateLoanSettlement(1200, -1)).toBe(0);
  });

  test('the final installment absorbs prior rounding without changing monthly pay', () => {
    expect(calculateSalaryInstallment(10000, 4839)).toBe(5161);
    expect(4839 + calculateSalaryInstallment(10000, 4839)).toBe(10000);
  });

  test('salary amounts are whole cordobas', () => {
    expect(roundSalaryAmount(9998.49)).toBe(9998);
    expect(roundSalaryAmount(10000.5)).toBe(10001);
  });
});
