export const fmtPercent = (value: number) => `${Math.round(value)}%`;

export const fmtNumber = (value: number) => value.toLocaleString('en-US');

export const fmtDateTime = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

export const quotaColor = (percent: number | null, options?: { missingExpected?: boolean }): string => {
  if (options?.missingExpected) return 'var(--danger)';
  if (percent === null) return 'var(--muted)';
  if (percent > 60) return 'var(--success)';
  if (percent > 20) return 'var(--warning)';
  return 'var(--danger)';
};

export const fmtDurationUntil = (value: string, now = Date.now()): string => {
  const target = Date.parse(value);
  if (!Number.isFinite(target)) return '-';
  const diff = Math.max(0, target - now);
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
};
