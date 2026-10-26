import {
  clearStocktakeDraft,
  createStocktakeSubmissionId,
  loadStocktakeDraft,
  saveStocktakeDraft,
} from './stocktakeDraft';

describe('stocktake draft safety', () => {
  beforeEach(() => localStorage.clear());

  test('restores a same-day draft with its stable submission id', () => {
    const draft = {
      date: '2026-10-25',
      submissionId: createStocktakeSubmissionId('warehouse'),
      actualQuantities: { itemA: 7 },
      baselineQuantities: { itemA: 5 },
    };
    saveStocktakeDraft('warehouse-draft', draft);

    expect(loadStocktakeDraft('warehouse-draft', '2026-10-25')).toEqual(draft);
  });

  test('rejects and clears a stale draft from another day', () => {
    saveStocktakeDraft('warehouse-draft', {
      date: '2026-10-24',
      submissionId: 'old-submission',
      actualQuantities: { itemA: 7 },
      baselineQuantities: { itemA: 5 },
    });

    expect(loadStocktakeDraft('warehouse-draft', '2026-10-25')).toBeNull();
    expect(localStorage.getItem('warehouse-draft')).toBeNull();
  });

  test('clears a committed draft', () => {
    localStorage.setItem('fridge-draft', '{}');
    clearStocktakeDraft('fridge-draft');
    expect(localStorage.getItem('fridge-draft')).toBeNull();
  });
});
