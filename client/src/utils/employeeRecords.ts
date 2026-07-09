export const filterActiveEmployees = (employees: any[], deletionRecords: any[] = []) => {
  const deletedEmployeeIds = new Set(
    deletionRecords.map((record: any) => String(record.employeeId || record.id))
  );

  return employees.filter((employee: any) =>
    employee &&
    !employee.isDeleted &&
    employee.status !== 'inactive' &&
    !deletedEmployeeIds.has(String(employee.id))
  );
};

export const parseOptionalMoneyInput = (value: string): number | undefined => {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const firstDayOfMonth = (dateText: string) => `${dateText.slice(0, 7)}-01`;
const sixteenthDayOfMonth = (dateText: string) => `${dateText.slice(0, 7)}-16`;
const fifteenthDayOfMonth = (dateText: string) => `${dateText.slice(0, 7)}-15`;

const clampDateRangeStart = (startDate: string, endDate: string) =>
  startDate > endDate ? endDate : startDate;

export const getSingleSalaryDefaultPeriod = (
  employee: { id: string; hireDate?: string },
  salaryRecords: Array<{ employeeId: string; startDate: string; endDate: string }>,
  today: string
) => {
  const monthStart = firstDayOfMonth(today);
  const monthFifteenth = fifteenthDayOfMonth(today);
  const monthSixteenth = sixteenthDayOfMonth(today);

  const hasFirstHalfSettlement = salaryRecords.some(record =>
    String(record.employeeId) === String(employee.id) &&
    record.startDate >= monthStart &&
    record.startDate <= monthFifteenth &&
    record.endDate >= monthFifteenth &&
    record.endDate <= today
  );

  const periodStart = hasFirstHalfSettlement ? monthSixteenth : monthStart;
  const hireDate = String(employee.hireDate || '').slice(0, 10);
  const startDate = hireDate && hireDate > periodStart ? hireDate : periodStart;

  return {
    startDate: clampDateRangeStart(startDate, today),
    endDate: today,
  };
};
