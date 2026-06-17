interface SavedSearch { query: string; page?: number }

const STORAGE_KEY = 'saved_searches';

export function loadSearches(): SavedSearch[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(s => s && typeof s.query === 'string');
        }
    } catch {}
    return [];
}

function saveSearches(searches: SavedSearch[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
}

export function saveSearch(query: string, page: number, callback: () => void): void {
    const q = query.trim();
    if (!q) return;
    const searches = loadSearches();
    const filtered = searches.filter(s => s.query !== q);
    filtered.unshift({ query: q, page });
    saveSearches(filtered);
    callback();
}

export function removeSearch(query: string, callback: () => void): void {
    const searches = loadSearches().filter(s => s.query !== query);
    saveSearches(searches);
    callback();
}