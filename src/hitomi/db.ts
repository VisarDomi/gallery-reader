function openDB(): Promise<IDBDatabase> {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    const req = indexedDB.open('hitomi_favs', 1);
    req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('favs')) db.createObjectStore('favs', {keyPath: 'galleryId'});
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
    return promise;
}

export async function toggleFav(gid: number): Promise<boolean> {
    const db = await openDB();
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const tx = db.transaction('favs', 'readwrite');
    const store = tx.objectStore('favs');
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
    db.transaction('favs', 'readonly').objectStore('favs').get(gid).onsuccess = (e) => resolve(!!(e.target as IDBRequest).result);
    return promise;
}

export async function getAllFavs(): Promise<number[]> {
    const db = await openDB();
    const { promise, resolve } = Promise.withResolvers<number[]>();
    db.transaction('favs', 'readonly').objectStore('favs').getAll().onsuccess = (e) => {
        const items = (e.target as IDBRequest).result as { galleryId: number; savedAt: number }[];
        items.sort((a, b) => b.savedAt - a.savedAt);
        resolve(items.map(x => x.galleryId));
    };
    return promise;
}
