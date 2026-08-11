const FAVORITES_KEY = 'gallery-reader-favorites-v1';

function readFavorites(): number[] {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw === null) return [];

    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) throw new Error('Stored favorites are not an array');
    if (!value.every(item => Number.isInteger(item) && item > 0)) {
        throw new Error('Stored favorites contain an invalid gallery ID');
    }
    return value as number[];
}

function saveFavorites(next: number[]): void {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
}

export function getFavs(): number[] {
    return readFavorites();
}

export function isFav(gid: number): boolean {
    return readFavorites().includes(gid);
}

export function toggleFav(gid: number): boolean {
    const favorites = readFavorites();
    const existingIndex = favorites.indexOf(gid);
    if (existingIndex === -1) {
        saveFavorites([gid, ...favorites]);
        return true;
    }

    const next = [...favorites];
    next.splice(existingIndex, 1);
    saveFavorites(next);
    return false;
}

export function mergeFavs(ids: number[]): number {
    const favorites = readFavorites();
    const existing = new Set(favorites);
    const additions: number[] = [];
    for (const id of ids) {
        if (!Number.isInteger(id) || id <= 0 || existing.has(id)) continue;
        existing.add(id);
        additions.push(id);
    }
    if (additions.length > 0) saveFavorites([...additions, ...favorites]);
    return additions.length;
}
