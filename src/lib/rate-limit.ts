/**
 * In-memory failed-login limiter: 10 failures per key per 15 minutes.
 * Per-process only (resets on restart, not shared across serverless
 * instances) — raises the bar against casual brute force; swap for a
 * Redis/Upstash-backed limiter before multi-instance production use.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const MAX_TRACKED_KEYS = 1000;

const failures = new Map<string, { count: number; resetAt: number }>();

function pruneExpired(now: number) {
  if (failures.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of failures) {
    if (entry.resetAt < now) failures.delete(key);
  }
}

export function isRateLimited(key: string): boolean {
  const entry = failures.get(key);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  pruneExpired(now);
  const entry = failures.get(key);
  if (!entry || entry.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
