import { getInclusiveLocalDateKeys, toLocalDateKey } from './localTime';

describe('toLocalDateKey', () => {
  test('keeps date-only values unchanged', () => {
    expect(toLocalDateKey('2026-07-13')).toBe('2026-07-13');
  });

  test('assigns UTC timestamps to the correct Nicaragua business date', () => {
    expect(toLocalDateKey('2026-07-14T00:54:24.696Z')).toBe('2026-07-13');
    expect(toLocalDateKey('2026-07-14T05:59:59.999Z')).toBe('2026-07-13');
    expect(toLocalDateKey('2026-07-14T06:00:00.000Z')).toBe('2026-07-14');
  });
});

describe('getInclusiveLocalDateKeys', () => {
  test('keeps both selected Nicaragua dates in an inclusive range', () => {
    expect(getInclusiveLocalDateKeys('2026-07-01', '2026-07-16')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
    ]);
  });
});
