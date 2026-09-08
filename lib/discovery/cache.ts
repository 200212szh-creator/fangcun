type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

export const CACHE_TTL = { search: 24 * 60 * 60 * 1000, exact: 30 * 24 * 60 * 60 * 1000 };

export function getCached<T>(key: string) {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttl: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

export function clearDiscoveryCache() {
  cache.clear();
}
