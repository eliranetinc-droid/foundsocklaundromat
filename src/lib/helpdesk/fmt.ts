/** Humanize a duration given in (possibly fractional) hours, minute precision:
 * null/invalid → '—', under a minute → '<1m', under an hour → '12m',
 * otherwise '2h 6m' (bare '2h' when exactly on the hour). */
export function fmtDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return '—';
  const mins = Math.round(hours * 60);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
