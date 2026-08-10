const STORAGE_KEY = 'storage_favs';
const DB_VERSION = 1;
const OBJECT_STORE_NAME = 'favs';
const TRANSACTION_TIMEOUT_MS = 10_000;

let dbPromise: Promise<IDBDatabase> | null = null;
let database: IDBDatabase | null = null;
let connectionGeneration = 0;
const activeReadTransactions = new Set<IDBTransaction>();

function clearConnection(db: IDBDatabase): void {
    if (database !== db) return;
    database = null;
    dbPromise = null;
}

function closeDatabase(): void {
    connectionGeneration++;
    for (const transaction of activeReadTransactions) {
        try {
            transaction.abort();
        } catch {
            // The transaction may already be finishing.
        }
    }
    activeReadTransactions.clear();

    const db = database;
    database = null;
    dbPromise = null;
    // Active writes are allowed to commit before the connection closes.
    db?.close();
}

window.addEventListener('pagehide', closeDatabase);

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    const generation = connectionGeneration;
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    let settled = false;
    const req = indexedDB.open(STORAGE_KEY, DB_VERSION);

    req.onupgradeneeded = (event) => {
        const db = req.result;
        if (event.oldVersion < 1 && !db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
            db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id' });
        }
    };
    req.onsuccess = () => {
        const db = req.result;
        if (settled || generation !== connectionGeneration) {
            db.close();
            if (!settled) {
                settled = true;
                reject(new DOMException('IndexedDB open was cancelled by navigation', 'AbortError'));
            }
            return;
        }

        settled = true;
        database = db;
        db.onversionchange = () => {
            clearConnection(db);
            db.close();
        };
        db.onclose = () => clearConnection(db);
        resolve(db);
    };
    req.onerror = () => {
        if (settled) return;
        settled = true;
        reject(req.error ?? new DOMException('Could not open IndexedDB', 'UnknownError'));
    };
    req.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new DOMException('IndexedDB upgrade is blocked by another page', 'InvalidStateError'));
    };

    dbPromise = promise;
    void promise.catch(() => {
        if (dbPromise === promise) dbPromise = null;
    });
    return promise;
}

function waitForTransaction(transaction: IDBTransaction, isDisposableRead: boolean): Promise<void> {
    if (isDisposableRead) activeReadTransactions.add(transaction);

    return new Promise<void>((resolve, reject) => {
        let timedOut = false;
        let settled = false;
        const timeout = window.setTimeout(() => {
            timedOut = true;
            try {
                transaction.abort();
            } catch {
                // Reject below even if Safari no longer considers the transaction abortable.
            }
            finish(() => reject(new DOMException('IndexedDB transaction timed out', 'TimeoutError')));
        }, TRANSACTION_TIMEOUT_MS);

        const finish = (complete: () => void): void => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            activeReadTransactions.delete(transaction);
            complete();
        };

        transaction.addEventListener('complete', () => finish(resolve), { once: true });
        transaction.addEventListener('abort', () => finish(() => reject(
            timedOut
                ? new DOMException('IndexedDB transaction timed out', 'TimeoutError')
                : transaction.error ?? new DOMException('IndexedDB transaction was aborted', 'AbortError'),
        )), { once: true });
    });
}

async function useTransaction(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => void,
): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(OBJECT_STORE_NAME, mode);
    const done = waitForTransaction(transaction, mode === 'readonly');
    try {
        operation(transaction.objectStore(OBJECT_STORE_NAME));
    } catch (error) {
        try {
            transaction.abort();
        } catch {
            // Preserve the original synchronous error.
        }
        void done.catch(() => undefined);
        throw error;
    }
    await done;
}

let favsPromise: Promise<number[]> | null = null;
let favSet: Set<number> | null = null;

async function getAllFavs(): Promise<number[]> {
    let items: { id: number; savedAt: number }[] = [];
    await useTransaction('readonly', store => {
        const req = store.getAll();
        req.onsuccess = () => { items = req.result as { id: number; savedAt: number }[]; };
    });
    items.sort((a, b) => b.savedAt - a.savedAt);
    return items.map(item => item.id);
}

export function preloadFavs(): Promise<number[]> {
    if (!favsPromise) {
        const promise = getAllFavs().then(ids => {
            favSet = new Set(ids);
            return ids;
        });
        favsPromise = promise;
        void promise.catch(() => {
            if (favsPromise === promise) favsPromise = null;
        });
    }
    return favsPromise;
}

export async function isFav(gid: number): Promise<boolean> {
    await preloadFavs();
    return favSet!.has(gid);
}

export async function toggleFav(gid: number): Promise<boolean> {
    await preloadFavs();
    let nowFavorite = false;
    await useTransaction('readwrite', store => {
        const req = store.get(gid);
        req.onsuccess = () => {
            if (req.result) {
                store.delete(gid);
                nowFavorite = false;
            } else {
                store.put({ id: gid, savedAt: Date.now() });
                nowFavorite = true;
            }
        };
    });

    if (nowFavorite) favSet!.add(gid);
    else favSet!.delete(gid);
    favsPromise = Promise.resolve([...favSet!]);
    return nowFavorite;
}

export async function mergeFavs(ids: number[]): Promise<number> {
    await preloadFavs();
    const existing = new Set(favSet!);
    const additions: number[] = [];
    for (const id of ids) {
        if (existing.has(id)) continue;
        existing.add(id);
        additions.push(id);
    }
    if (additions.length === 0) return 0;

    const now = Date.now();
    await useTransaction('readwrite', store => {
        for (const id of additions) store.put({ id, savedAt: now });
    });
    for (const id of additions) favSet!.add(id);
    favsPromise = getAllFavs().then(savedIds => {
        favSet = new Set(savedIds);
        return savedIds;
    });
    await favsPromise;
    return additions.length;
}
