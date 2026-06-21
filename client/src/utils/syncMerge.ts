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

const MENU_IMAGE_FIELDS = [
  'image',
  'imageUrl',
  'imageThumbUrl',
  'imageStoragePath',
  'imageThumbStoragePath',
  'imageUpdatedAt',
  'imageUploadPending',
  'thumbSize',
  'mediumSize',
];

const hasMenuImageFields = (record: any): boolean => {
  if (!record) return false;
  return MENU_IMAGE_FIELDS.some(field => record[field] !== undefined && record[field] !== null);
};

const hasUploadedMenuImage = (record: any): boolean => {
  return Boolean(record?.imageUrl || record?.imageThumbUrl || record?.imageStoragePath || record?.imageThumbStoragePath);
};

const getMenuImageVersion = (record: any): number => {
  if (!record?.imageUpdatedAt) return 0;
  if (typeof record.imageUpdatedAt === 'number' && Number.isFinite(record.imageUpdatedAt)) {
    return record.imageUpdatedAt;
  }
  if (typeof record.imageUpdatedAt === 'object' && typeof record.imageUpdatedAt.seconds === 'number') {
    return record.imageUpdatedAt.seconds * 1000 + Math.floor((record.imageUpdatedAt.nanoseconds || 0) / 1000000);
  }
  const parsed = new Date(record.imageUpdatedAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const shouldCopyMenuImageFields = (target: any, source: any): boolean => {
  if (!hasMenuImageFields(source)) return false;
  if (!hasMenuImageFields(target)) return true;
  const sourceImageVersion = getMenuImageVersion(source);
  const targetImageVersion = getMenuImageVersion(target);
  if (sourceImageVersion > targetImageVersion) return true;
  if (sourceImageVersion === targetImageVersion && hasUploadedMenuImage(source) && !hasUploadedMenuImage(target)) {
    return true;
  }
  if (sourceImageVersion === targetImageVersion && source.imageUploadPending === false && target.imageUploadPending === true) {
    return true;
  }
  return false;
};

const copyMenuImageFields = <T extends Record<string, any>>(target: T, source: any): T => {
  const next = { ...target };
  MENU_IMAGE_FIELDS.forEach(field => {
    if (source?.[field] !== undefined) {
      next[field as keyof T] = source[field];
    }
  });
  return next;
};

const mergeRecordWithMediaFields = <T extends Record<string, any>>(existing: T, incoming: T): T => {
  const existingVersion = getRecordVersion(existing);
  const incomingVersion = getRecordVersion(incoming);
  const base = incomingVersion >= existingVersion ? incoming : existing;
  const mediaSource = base === incoming ? existing : incoming;

  if (shouldCopyMenuImageFields(base, mediaSource)) {
    return copyMenuImageFields(base, mediaSource);
  }

  return base;
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

    if (!existing) {
      merged.set(id, incoming);
      return;
    }

    merged.set(id, mergeRecordWithMediaFields(existing as T & Record<string, any>, incoming as T & Record<string, any>));
  });

  return Array.from(merged.values());
};
