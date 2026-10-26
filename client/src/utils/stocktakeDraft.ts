export interface StocktakeDraft {
  date: string;
  submissionId: string;
  actualQuantities: Record<string, number>;
  baselineQuantities: Record<string, number>;
}

export const createStocktakeSubmissionId = (location: string) => {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `stocktake-${location}-${suffix}`;
};

export const loadStocktakeDraft = (storageKey: string, date: string): StocktakeDraft | null => {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;
    const draft = JSON.parse(saved);
    if (draft?.date !== date || !draft?.submissionId) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return {
      date,
      submissionId: String(draft.submissionId),
      actualQuantities: draft.actualQuantities || {},
      baselineQuantities: draft.baselineQuantities || {},
    };
  } catch {
    return null;
  }
};

export const saveStocktakeDraft = (storageKey: string, draft: StocktakeDraft) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch (error) {
    console.warn('Stocktake draft cache write failed:', error);
  }
};

export const clearStocktakeDraft = (storageKey: string) => {
  localStorage.removeItem(storageKey);
};
