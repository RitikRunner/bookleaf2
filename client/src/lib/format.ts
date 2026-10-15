const HOUR_MS = 60 * 60 * 1000;

/** ₹57,744 with Indian digit grouping (₹1,23,456 for larger amounts). */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** "14 Feb 2026". Date-only API values are UTC midnight, so they are formatted in UTC. */
export function formatDate(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : undefined,
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Compact duration such as "3d 4h", "5h 12m" or "8m". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function timeAgo(value: string, now = Date.now()): string {
  const elapsed = now - new Date(value).getTime();
  return elapsed < 60_000 ? 'just now' : `${formatDuration(elapsed)} ago`;
}

export function hoursSince(value: string, now = Date.now()): number {
  return (now - new Date(value).getTime()) / HOUR_MS;
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
