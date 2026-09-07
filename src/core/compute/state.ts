// Worker-only, one strict transaction per logical change, including migration/restore.
export interface SavedSearch { query: string; page?: number }
export interface ReaderState { favorites: number[]; searches: SavedSearch[]; page: number; scroll: Record<string, number> }
export interface GalleryBackup { version: 1; indexedDB: ReaderState }
let opened: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
    return opened ??= new Promise((resolve, reject) => {
        const request = indexedDB.open('gallery-reader-data', 1);
        const timer = setTimeout(() => reject(new Error('Reader database open timed out')), 10000);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => {
            clearTimeout(timer);
            const db = request.result;
            db.onversionchange = () => { db.close(); opened = undefined; };
            resolve(db);
        };
        request.onerror = request.onblocked = () => { clearTimeout(timer); opened = undefined; reject(request.error ?? new Error('Reader database blocked')); };
    });
}
export function validateState(value: unknown): ReaderState {
    const state = value as ReaderState;
    if (!state || !Array.isArray(state.favorites) || !state.favorites.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid favorites');
    if (!Array.isArray(state.searches) || !state.searches.every(s => s && typeof s.query === 'string' && (s.page === undefined || (Number.isInteger(s.page) && s.page > 0)))) throw new Error('Invalid saved searches');
    if (!Number.isInteger(state.page) || state.page < 1 || !state.scroll || typeof state.scroll !== 'object' || Array.isArray(state.scroll) || !Object.values(state.scroll).every(y => Number.isFinite(y) && y >= 0)) throw new Error('Invalid page/scroll positions');
    return state;
}
export async function accessState<T>(fn: (state: ReaderState | undefined) => { result: T; next?: ReaderState }, write = false): Promise<T> {
    const db = await database();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('state', write ? 'readwrite' : 'readonly', { durability: 'strict' });
        const store = tx.objectStore('state');
        let result: T;
        let error: unknown;
        const timer = setTimeout(() => { tx.abort(); reject(new Error('Reader database transaction timed out')); }, 10000);
        const request = store.get('reader');
        request.onsuccess = () => {
            try {
                const outcome = fn(request.result);
                result = outcome.result;
                if (outcome.next) store.put(validateState(outcome.next), 'reader');
            } catch (caught) { error = caught; tx.abort(); }
        };
        tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
        tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(error ?? tx.error ?? new Error('Reader transaction aborted')); };
    });
}
export function legacyState(raw: Record<string, string>): ReaderState {
    const scroll = Object.fromEntries(Object.entries(raw).filter(([key]) => key.startsWith('scroll-pos-')).map(([key, value]) => [key.slice(11), Number(value)]));
    return validateState({ favorites: JSON.parse(raw['gallery-reader-favorites-v1'] || '[]'), searches: JSON.parse(raw.saved_searches || '[]'), page: Number(raw.favorites || 1), scroll });
}
export const hasState = () => accessState(state => ({ result: Boolean(state) }));
export const migrateState = (raw: Record<string, string>) => accessState(state => ({ result: undefined, next: state ?? legacyState(raw) }), true);
export const captureState = () => accessState(state => {
    if (!state) throw new Error('Reader storage has not been initialized');
    return { result: { version: 1, indexedDB: validateState(state) } as GalleryBackup };
});
export function validateBackup(data: unknown): GalleryBackup {
    const value = data as GalleryBackup;
    if (value?.version !== 1) throw new Error('Unsupported gallery backup');
    validateState(value.indexedDB);
    return value;
}
export async function restoreState(data: unknown): Promise<void> {
    const next = validateBackup(data).indexedDB;
    await accessState(() => ({ result: undefined, next }), true);
}
export function describeState(data: unknown): string {
    const state = validateBackup(data).indexedDB;
    return `${state.favorites.length} favorites, ${state.searches.length} saved searches, ${Object.keys(state.scroll).length} scroll positions`;
}
