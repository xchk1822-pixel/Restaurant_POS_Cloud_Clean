import { normalizeHandoverRecords } from './handoverRecords';

describe('handover record helpers', () => {
  test('normalizes ids and sorts newest first', () => {
    const records = normalizeHandoverRecords([
      { id: 'old', t: '2026-06-10 09:00:00', rawG: 100 },
      { t: '2026-06-11 10:00:00', rawG: 200 },
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].rawG).toBe(200);
    expect(records[0].id).toBeTruthy();
    expect(records[1].id).toBe('old');
  });

  test('keeps empty cloud handover refresh empty', () => {
    expect(normalizeHandoverRecords([])).toEqual([]);
  });
});
