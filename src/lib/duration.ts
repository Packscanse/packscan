/** Human duration for dwell times: minutes under an hour, hours under two days, else days. */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} d`;
}
