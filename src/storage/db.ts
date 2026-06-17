const STORAGE_KEY = 'storage_favs';
const OBJECT_STORE_NAME = 'favs';

function openDB(): Promise<IDBDatabase> {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    const req = indexedDB.open(STORAGE_KEY, 1);
    req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) db.createObjectStore(OBJECT_STORE_NAME, {keyPath: 'id'});
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
    return promise;
}

export async function toggleFav(gid: number): Promise<boolean> {
    const db = await openDB();
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const tx = db.transaction(OBJECT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(OBJECT_STORE_NAME);
    store.get(gid).onsuccess = (e) => {
        if ((e.target as IDBRequest).result) {
            store.delete(gid);
            resolve(false);
        } else {
            store.put({galleryId: gid, savedAt: Date.now()});
            resolve(true);
        }
    };
    return promise;
}

export async function isFav(gid: number): Promise<boolean> {
    const db = await openDB();
    const { promise, resolve } = Promise.withResolvers<boolean>();
    db.transaction(OBJECT_STORE_NAME, 'readonly').objectStore(OBJECT_STORE_NAME).get(gid).onsuccess = (e) => resolve(!!(e.target as IDBRequest).result);
    return promise;
}

export async function getAllFavs(): Promise<number[]> {
    const db = await openDB();
    const { promise, resolve } = Promise.withResolvers<number[]>();
    db.transaction(OBJECT_STORE_NAME, 'readonly').objectStore(OBJECT_STORE_NAME).getAll().onsuccess = (e) => {
        const items = (e.target as IDBRequest).result as { galleryId: number; savedAt: number }[];
        items.sort((a, b) => b.savedAt - a.savedAt);
        resolve(items.map(x => x.galleryId));
    };
    return promise;
}
