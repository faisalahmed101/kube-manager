type Entry = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_GLOBAL = 50;
const GLOBAL_KEY = "*";

// dev-এ hot reload হলেও গণনা টিকে থাকবে
const g = globalThis as unknown as { __loginFails?: Map<string, Entry> };
const fails = (g.__loginFails ??= new Map<string, Entry>());

function current(key: string, now: number): Entry | undefined {
  const e = fails.get(key);
  if (e && e.resetAt <= now) {
    fails.delete(key);
    return undefined;
  }
  return e;
}

function bump(key: string, now: number) {
  const e = current(key, now);
  if (e) e.count++;
  else fails.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

function prune(now: number) {
  if (fails.size < 5000) return;
  for (const [k, v] of fails) if (v.resetAt <= now) fails.delete(k);
}

export function checkLoginAllowed(ip: string): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  for (const [key, max] of [[ip, MAX_PER_IP], [GLOBAL_KEY, MAX_GLOBAL]] as const) {
    const e = current(key, now);
    if (e && e.count >= max) return { allowed: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  prune(now);
  bump(ip, now);
  bump(GLOBAL_KEY, now);
}

export function clearLoginFailures(ip: string) {
  fails.delete(ip);
}