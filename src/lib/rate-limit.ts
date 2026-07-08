/**
 * In-memory failed-login limiter, keyed per email AND per client IP:
 *  - email: 10 failures / 15 min (slows guessing one account's password)
 *  - IP: 30 failures / 15 min (slows spraying across many accounts; higher
 *    threshold so a shared NAT doesn't lock a whole office out)
 * Per-process only (resets on restart, not shared across serverless
 * instances) — raises the bar against casual brute force; swap for a
 * Redis/Upstash-backed limiter before multi-instance production use.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_KEYS = 2000;

const LIMITS = { email: 10, ip: 30 } as const;
export type LimitScope = keyof typeof LIMITS;

const failures = new Map<string, { count: number; resetAt: number }>();

function keyFor(scope: LimitScope, value: string): string {
  return `${scope}:${value}`;
}

// Hard cap: prune expired entries, then evict oldest-inserted if a flood of
// live keys would otherwise grow the map without bound.
function enforceCap(now: number) {
  if (failures.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of failures) {
    if (entry.resetAt < now) failures.delete(key);
  }
  while (failures.size >= MAX_TRACKED_KEYS) {
    const oldest = failures.keys().next().value;
    if (oldest === undefined) break;
    failures.delete(oldest);
  }
}

export function isRateLimited(scope: LimitScope, value: string): boolean {
  const entry = failures.get(keyFor(scope, value));
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= LIMITS[scope];
}

export function recordFailure(scope: LimitScope, value: string): void {
  const now = Date.now();
  enforceCap(now);
  const key = keyFor(scope, value);
  const entry = failures.get(key);
  if (!entry || entry.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearFailures(scope: LimitScope, value: string): void {
  failures.delete(keyFor(scope, value));
}
