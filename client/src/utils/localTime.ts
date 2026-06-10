export const NICARAGUA_TIME_ZONE = 'America/Managua';

const getNicaraguaParts = (date: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NICARAGUA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute,
    second: byType.second,
  };
};

export const getLocalDateTime = (date: Date = new Date()): string => {
  const parts = getNicaraguaParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export const getLocalDateTimeString = getLocalDateTime;

export const getLocalDateString = (date: Date = new Date()): string => {
  const parts = getNicaraguaParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getTodayString = (): string => getLocalDateString();

export const toTimestampMillis = (value: any): number => {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  if (typeof value === 'string') {
    const localMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (localMatch) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] = localMatch;
      const time = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-06:00`).getTime();
      return Number.isFinite(time) ? time : 0;
    }
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const parseLocalDateTime = (dateTimeStr: string): Date => {
  return new Date(toTimestampMillis(dateTimeStr));
};

export const formatDisplayTime = (dateTimeStr: string): string => {
  if (!dateTimeStr) return '';
  return getLocalDateTime(new Date(toTimestampMillis(dateTimeStr)));
};

export const formatNicaraguaTime = (value: any): string => {
  const timestamp = toTimestampMillis(value);
  if (!timestamp) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: NICARAGUA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
};

export const formatNicaraguaDate = (value: any): string => {
  const timestamp = toTimestampMillis(value);
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: NICARAGUA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(timestamp));
};

export const formatNicaraguaDateTime = (value: any): string => {
  const timestamp = toTimestampMillis(value);
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: NICARAGUA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
};
