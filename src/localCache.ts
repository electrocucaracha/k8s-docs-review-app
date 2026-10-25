export type CacheStore = "github" | "llm-reviews";
export type CacheEntry<T> = { time: number; value: T };

const expiring: CacheStore = "github";
const keepFor = 30 * 24 * 60 * 60_000;
let database: Promise<IDBDatabase | null> | undefined;

function openCache(): Promise<IDBDatabase | null> {
  return (database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open("k8s-docs-review-cache", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("github");
        request.result.createObjectStore("llm-reviews");
      };
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const cutoff = Date.now() - keepFor;
        const cursorRequest = request.result
          .transaction(expiring, "readwrite")
          .objectStore(expiring)
          .openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if ((cursor.value as CacheEntry<unknown>).time < cutoff)
            cursor.delete();
          cursor.continue();
        };
        resolve(request.result);
      };
    } catch {
      resolve(null);
    }
  }));
}

async function run<T>(
  name: CacheStore,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  const db = await openCache();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(name, mode).objectStore(name));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export function readCache<T>(
  name: CacheStore,
  key: string,
): Promise<CacheEntry<T> | undefined> {
  return run(name, "readonly", (store) => store.get(key));
}

export async function writeCache<T>(
  name: CacheStore,
  key: string,
  value: T,
): Promise<void> {
  await run(name, "readwrite", (store) =>
    store.put({ time: Date.now(), value } satisfies CacheEntry<T>, key),
  );
}
