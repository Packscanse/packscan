/**
 * Failed-login limiter, keyed per email AND per client IP:
 *  - email: 10 failures / 15 min (slows guessing one account's password/PIN)
 *  - IP: 30 failures / 15 min (slows spraying; higher threshold so a shared
 *    NAT doesn't lock a whole office out)
 *
 * Backend: Upstash Redis via REST when UPSTASH_REDIS_REST_URL/TOKEN are set
 * (required for multi-instance production — per-process counters are
 * useless behind a load balancer). Falls back to a bounded in-memory map
 * for single-instance/dev. Fails open on Redis errors: an unreachable
 * limiter must not lock every user out.
 */
const WINDOW_MS = 15 * 60_000;
const WINDOW_S = WINDOW_MS / 1000;
const MAX_TRACKED_KEYS = 2000;

const LIMITS = { email: 10, ip: 30 } as const;
export type LimitScope = keyof typeof LIMITS;

const keyFor = (scope: LimitScope, value: string) => `packscan:rl:${scope}:${value}`;

// ---------- Upstash REST backend ----------

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redisPipeline(commands: (string | number)[][]): Promise<unknown[] | null> {
  const config = upstash();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: unknown }[];
    return data.map((d) => d.result);
  } catch {
    return null; // fail open
  }
}

// ---------- In-memory fallback ----------

const failures = new Map<string, { count: number; resetAt: number }>();

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

// ---------- Public API ----------

export async function isRateLimited(scope: LimitScope, value: string): Promise<boolean> {
  if (upstash()) {
    const result = await redisPipeline([["GET", keyFor(scope, value)]]);
    const count = result ? Number(result[0] ?? 0) : 0;
    return count >= LIMITS[scope];
  }
  const entry = failures.get(keyFor(scope, value));
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= LIMITS[scope];
}

export async function recordFailure(scope: LimitScope, value: string): Promise<void> {
  if (upstash()) {
    const key = keyFor(scope, value);
    // NX keeps the window fixed from the first failure.
    await redisPipeline([
      ["INCR", key],
      ["EXPIRE", key, WINDOW_S, "NX"],
    ]);
    return;
  }
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

export async function clearFailures(scope: LimitScope, value: string): Promise<void> {
  if (upstash()) {
    await redisPipeline([["DEL", keyFor(scope, value)]]);
    return;
  }
  failures.delete(keyFor(scope, value));
}
