export const getRecordVersion = (record: any): number => {
  if (!record) return 0;
  const value = record.lastModified || record.lastUpdated || record.updatedAt || record.createdAt;
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const mergeRecordsByVersion = <T extends { id?: string }>(
  localRecords: T[],
  cloudRecords: any[],
  normalize?: (record: any) => T
): T[] => {
  const merged = new Map<string, T>();

  localRecords.forEach(record => {
    if (record?.id) merged.set(String(record.id), record);
  });

  cloudRecords.forEach(record => {
    if (!record?.id) return;
    const id = String(record.id);
    const incoming = normalize ? normalize(record) : record as T;
    const existing = merged.get(id);

    if (!existing || getRecordVersion(incoming) >= getRecordVersion(existing)) {
      merged.set(id, incoming);
    }
  });

  return Array.from(merged.values());
};
