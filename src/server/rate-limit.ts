// Minimal in-memory login rate limiter (failures only — successes clear).
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

interface Entry {
  count: number;
  firstAt: number;
}

const globalStore = globalThis as unknown as { __lhLoginLimit?: Map<string, Entry> };
const store: Map<string, Entry> = (globalStore.__lhLoginLimit ??= new Map());

export function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.firstAt > WINDOW_MS) store.delete(key);
  }
}

export function isLimited(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    store.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const entry = store.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    store.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export function clearRateLimit(key: string): void {
  store.delete(key);
}
