export interface WeekRange {
  startDate: string;
  endDate: string;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

const parseDateKey = (dateKey: string): Date => {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return new Date(`${dateKey}T12:00:00`);
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const shiftDateKey = (dateKey: string, days: number): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
};

export const getWeekRange = (dateKey: string): WeekRange => {
  const date = parseDateKey(dateKey);
  const mondayOffset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + mondayOffset);
  const startDate = formatDateKey(date);
  return { startDate, endDate: shiftDateKey(startDate, 6) };
};

export const getWeekDates = (dateKey: string): string[] => {
  const { startDate } = getWeekRange(dateKey);
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(startDate, index));
};

export const getMonthRange = (monthKey: string): WeekRange => {
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const [year, month] = monthKey.split('-').map(Number);
  const endDate = new Date(year, month, 0, 12, 0, 0);
  return {
    startDate: `${monthKey}-01`,
    endDate: formatDateKey(endDate),
  };
};

export const createRestScheduleId = (weekStart: string, employeeId: string): string =>
  `rest_${weekStart}_${String(employeeId).replace(/\//g, '_')}`;

export const normalizeRestDates = (restDates: unknown, legacyRestDate?: unknown): string[] => {
  const candidates = Array.isArray(restDates) ? restDates : [legacyRestDate];
  return Array.from(new Set(
    candidates.filter((value): value is string => typeof value === 'string' && DATE_KEY_PATTERN.test(value))
  )).sort();
};

export const toggleRestDate = (restDates: string[], dateKey: string): string[] => {
  const current = normalizeRestDates(restDates);
  if (current.includes(dateKey)) return current.filter(date => date !== dateKey);
  return [...current, dateKey].sort();
};

