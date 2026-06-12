const STORAGE_KEY = 'hitomi_saved_searches';

export function loadSearches(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(entry => typeof entry === 'string' && entry.trim());
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
    const filtered = searches.filter(entry => entry !== q);
    filtered.unshift(q);
    if (filtered.length > 20) filtered.length = 20;
    saveSearches(filtered);
}

export function removeSearch(query: string): void {
    const searches = loadSearches().filter(entry => entry !== query);
    saveSearches(searches);
}
