const getHandoverTimestamp = (record: any): number => {
  const candidates = [
    record?.createdAt,
    record?.updatedAt,
    record?.t ? String(record.t).replace(' ', 'T') : undefined,
  ];

  for (const value of candidates) {
    const timestamp = Date.parse(value || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const idTime = Number(String(record?.id || '').match(/\d{10,}/)?.[0] || 0);
  return Number.isFinite(idTime) ? idTime : 0;
};

export const normalizeHandoverRecords = (records: any[]) => {
  return records
    .map((record: any, index: number) => ({
      ...record,
      id: record.id || `handover-${getHandoverTimestamp(record) || Date.now()}-${index}`,
    }))
    .sort((a: any, b: any) => getHandoverTimestamp(b) - getHandoverTimestamp(a));
};
