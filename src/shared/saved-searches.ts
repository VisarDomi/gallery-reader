const STORAGE_KEY = 'hitomi_saved_searches';

export function loadSearches(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string' && s.trim());
        }
    } catch {}
    return [];
}

function saveSearches(searches: string[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
}

export function addSearch(query: string): void {
    const q = query.trim();
    if (!q) return;
    const searches = loadSearches();
    // Remove if already exists, then add to front
    const filtered = searches.filter(s => s !== q);
    filtered.unshift(q);
    // Keep max 20
    if (filtered.length > 20) filtered.length = 20;
    saveSearches(filtered);
}

export function removeSearch(query: string): void {
    const searches = loadSearches().filter(s => s !== query);
    saveSearches(searches);
}
