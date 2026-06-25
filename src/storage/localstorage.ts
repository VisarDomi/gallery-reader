interface SavedSearch {
    query: string;
    page?: number;
    provider: string;
}

const SAVED_SEARCH_KEY = 'saved_searches';
const FAVORITES_KEY = 'favorites';

export function loadSearches(provider: string): SavedSearch[] {
    const raw = localStorage.getItem(SAVED_SEARCH_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(s => s?.query && s?.provider === provider) as SavedSearch[];
    } catch {
        return [];
    }
}

function saveSearches(searches: SavedSearch[]): void {
    localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify(searches));
}

export function saveSearch(query: string, page: number, provider: string, callback: () => void): void {
    const q = query.trim();
    if (!q) return;
    const searches = loadSearches(provider);
    const filtered = searches.filter(s => s.query !== q);
    filtered.unshift({query: q, page, provider});
    saveSearches(filtered);
    callback();
}

export function removeSearch(query: string, provider: string, callback: () => void): void {
    const searches = loadSearches(provider).filter(s => s.query !== query);
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

// ── scroll persistence (survives bfcache failure) ─────────────
const SCROLL_KEY_PREFIX = 'scroll-pos-';
let _pendingScroll: number | null = null;

export function saveScrollPosition(urlKey: string, y: number): void {
    localStorage.setItem(SCROLL_KEY_PREFIX + urlKey, String(y));
}

export function loadScrollPosition(urlKey: string): number | null {
    const saved = localStorage.getItem(SCROLL_KEY_PREFIX + urlKey);
    return saved !== null ? parseInt(saved, 10) : null;
}

export function deferScrollRestore(y: number): void {
    _pendingScroll = y;
}

export function applyPendingScroll(): void {
    if (_pendingScroll === null) return;
    const y = _pendingScroll;
    _pendingScroll = null;
    requestAnimationFrame(() => {
        window.scrollTo(0, y);
    });
}
