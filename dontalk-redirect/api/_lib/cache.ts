const store = new Map<string, { exp: number; val: unknown }>();

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) {
    store.delete(key);
    return undefined;
  }
  return e.val as T;
}

export function cacheSet(key: string, val: unknown, ttlSec: number): void {
  store.set(key, { exp: Date.now() + ttlSec * 1000, val });
}

export async function cached<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const val = await fn();
  cacheSet(key, val, ttlSec);
  return val;
}
