/** mm:ss (or h:mm:ss) transcript timestamp, matching the mac app. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(mm)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Elapsed-clock style mm:ss (or h:mm:ss) for the progress card. */
export function formatClock(totalSeconds: number): string {
  return formatTimestamp(totalSeconds);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ', '
    + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function displayName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}
