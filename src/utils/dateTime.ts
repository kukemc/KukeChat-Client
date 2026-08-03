const API_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export function parseApiDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const normalized = API_DATETIME_PATTERN.test(value) ? `${value}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatClockTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) {
    return value ?? '';
  }

  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function formatMessageDateTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) {
    return value ?? '';
  }

  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatChinaDateTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) {
    return value ?? '';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function formatMessageDividerTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) {
    return value ?? '';
  }

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const dateStart = startOfLocalDay(date);
  const dayDiff = Math.floor((todayStart.getTime() - dateStart.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (dayDiff <= 0) {
    return time;
  }
  if (dayDiff === 1) {
    return `昨天 ${time}`;
  }
  if (dayDiff < 7) {
    return `${date.toLocaleDateString('zh-CN', { weekday: 'long' })} ${time}`;
  }
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${time}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
