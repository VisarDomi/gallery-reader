interface SavedSearch { query: string; page?: number }

export const SAVED_SEARCH_KEY = 'saved_searches';
export const FAVORITES_KEY = 'favorites';

export function loadSearches(): SavedSearch[] {
    try {
        const raw = localStorage.getItem(SAVED_SEARCH_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(s => s && typeof s.query === 'string');
        }
    } catch {}
    return [];
}

function saveSearches(searches: SavedSearch[]): void {
    localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify(searches));
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

export function getPage(): number {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) {
        const savedPage = parseInt(saved);
        if (!isNaN(savedPage) && savedPage > 0) return savedPage;
    }
    return 1;
}

export function savePage(page: number): void {
    localStorage.setItem(FAVORITES_KEY, String(page));
}
