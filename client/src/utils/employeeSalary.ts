export interface SalaryEmployeeRate {
  monthlySalary?: number;
  dailyRate?: number;
  hireDate?: string;
}

export interface SalaryAttendanceDay {
  date: string;
  status: string;
}

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundSalaryAmount = (value: unknown): number =>
  Math.round(toFiniteNumber(value));

export const resolveMonthlySalary = (employee: SalaryEmployeeRate): number => {
  const explicitMonthlySalary = toFiniteNumber(employee.monthlySalary);
  if (explicitMonthlySalary > 0) return explicitMonthlySalary;

  return toFiniteNumber(employee.dailyRate) * 30;
};

export const getCalendarDaysInMonth = (dateText: string): number => {
  const [year, month] = String(dateText).slice(0, 7).split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return 30;
  return new Date(year, month, 0).getDate();
};

export const getDailySalaryForDate = (
  employee: SalaryEmployeeRate,
  dateText: string
): number => resolveMonthlySalary(employee) / getCalendarDaysInMonth(dateText);

export const getSemiMonthlySalaryDayRate = (
  employee: SalaryEmployeeRate,
  dateText: string
): number => {
  const day = Number(String(dateText).slice(8, 10));
  const daysInMonth = getCalendarDaysInMonth(dateText);
  const daysInHalf = day <= 15 ? 15 : Math.max(1, daysInMonth - 15);
  return resolveMonthlySalary(employee) / 2 / daysInHalf;
};

export const calculateBaseSalary = (
  employee: SalaryEmployeeRate,
  attendances: SalaryAttendanceDay[]
): number => {
  const exactBaseSalary = attendances
    .filter(record => record.status === 'normal' || record.status === 'rest')
    .reduce((sum, record) => sum + getSemiMonthlySalaryDayRate(employee, record.date), 0);

  return roundSalaryAmount(exactBaseSalary);
};

const addLocalDays = (dateText: string, days: number): string => {
  const [year, month, day] = String(dateText).slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

export const calculatePeriodBaseSalary = (
  employee: SalaryEmployeeRate,
  attendances: SalaryAttendanceDay[],
  startDate: string,
  endDate: string
): number => {
  const hireDate = String(employee.hireDate || '').slice(0, 10);
  const effectiveStart = hireDate && hireDate > startDate ? hireDate : startDate;
  if (!effectiveStart || !endDate || effectiveStart > endDate) return 0;

  const attendanceByDate = new Map(
    attendances.map(record => [String(record.date).slice(0, 10), record.status])
  );
  let exactBaseSalary = 0;

  for (let date = effectiveStart; date <= endDate; date = addLocalDays(date, 1)) {
    const status = attendanceByDate.get(date);
    if (status !== 'absent' && status !== 'leave') {
      exactBaseSalary += getSemiMonthlySalaryDayRate(employee, date);
    }
  }

  return roundSalaryAmount(exactBaseSalary);
};

export interface SalaryHistoryRecord {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status?: string;
  isDeleted?: boolean;
  lastModified?: number;
}

export const getSettledSalaryRecordsForRange = <T extends SalaryHistoryRecord>(
  records: T[],
  startDate: string,
  endDate: string
): T[] => {
  const uniqueRecords = new Map<string, T>();

  records
    .filter(record =>
      !record.isDeleted &&
      record.status === 'paid' &&
      record.startDate >= startDate &&
      record.endDate <= endDate
    )
    .forEach(record => {
      const key = `${record.employeeId}_${record.startDate}_${record.endDate}`;
      const existing = uniqueRecords.get(key);
      if (!existing || Number(record.lastModified || 0) >= Number(existing.lastModified || 0)) {
        uniqueRecords.set(key, record);
      }
    });

  return Array.from(uniqueRecords.values()).sort((a, b) =>
    a.startDate.localeCompare(b.startDate) ||
    a.endDate.localeCompare(b.endDate) ||
    a.employeeId.localeCompare(b.employeeId)
  );
};

export const calculateLoanSettlement = (
  outstandingLoan: unknown,
  payableBeforeLoan: unknown
): number => Math.min(
  Math.max(0, roundSalaryAmount(outstandingLoan)),
  Math.max(0, roundSalaryAmount(payableBeforeLoan))
);

export const calculateSalaryInstallment = (
  cumulativeBaseSalary: unknown,
  previouslySettledBase: unknown
): number => Math.max(
  0,
  roundSalaryAmount(cumulativeBaseSalary) - roundSalaryAmount(previouslySettledBase)
);
