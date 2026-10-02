const getRowVersion = (row: any): number => {
  const value = row?.lastModified ?? row?.updatedAt ?? row?.createdAt ?? row?.date;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const LARGE_LOCAL_ATTACHMENT_FIELDS = ['receipt', 'receiptImage', 'invoiceImage'] as const;

const stripCloudReloadableAttachments = (row: any) => {
  const compacted = { ...row };
  LARGE_LOCAL_ATTACHMENT_FIELDS.forEach(field => {
    const value = compacted[field];
    if (typeof value === 'string' && value.startsWith('data:') && value.length > 8192) {
      delete compacted[field];
    }
  });
  return compacted;
};

export const getPendingExpenseIds = (changes: any[], currentExpenseId?: string): Set<string> => {
  const ids = new Set<string>();
  if (currentExpenseId) ids.add(currentExpenseId);

  changes.forEach(change => {
    if (change?.collection === 'expenses' && change?.operation !== 'delete' && change?.id) {
      ids.add(String(change.id));
    }
    const batchExpenseId = change?.data?.__purchaseBatch?.expense?.id;
    if (batchExpenseId) ids.add(String(batchExpenseId));
  });
  return ids;
};

export const compactPurchaseExpenseCache = (
  rows: any[],
  requiredIds: Set<string>,
  limit = 80
) => {
  const requiredRows = rows.filter(row => requiredIds.has(String(row?.id || '')));
  const recentRows = rows
    .filter(row => !requiredIds.has(String(row?.id || '')))
    .sort((a, b) => getRowVersion(b) - getRowVersion(a))
    .slice(0, Math.max(0, limit - requiredRows.length))
    .map(stripCloudReloadableAttachments);

  return [...requiredRows, ...recentRows];
};
