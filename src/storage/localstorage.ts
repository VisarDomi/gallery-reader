interface SavedSearch {
    query: string;
    page?: number;
}

const SAVED_SEARCH_KEY = 'saved_searches';
const FAVORITES_KEY = 'favorites';

function isSavedSearch(value: unknown): value is SavedSearch {
    if (typeof value !== 'object' || value === null) return false;
    const search = value as Partial<SavedSearch>;
    return typeof search.query === 'string'
        && (search.page === undefined || (Number.isInteger(search.page) && search.page > 0));
}

export function loadSearches(): SavedSearch[] {
    const raw = localStorage.getItem(SAVED_SEARCH_KEY);
    if (raw === null) return [];

    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) throw new Error('Stored searches are not an array');
    if (!value.every(isSavedSearch)) throw new Error('Stored searches contain an invalid entry');
    return value;
}

function saveSearches(searches: SavedSearch[]): void {
    localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify(searches));
}

export function saveSearch(query: string, page: number): void {
    const q = query.trim();
    if (!q) return;
    const searches = loadSearches();
    const filtered = searches.filter(s => s.query !== q);
    filtered.unshift({query: q, page});
    saveSearches(filtered);
}

export function removeSearch(query: string): void {
    const searches = loadSearches().filter(s => s.query !== query);
    saveSearches(searches);
}

export function getPage(): number {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved === null) return 1;

    const page = Number(saved);
    if (!Number.isInteger(page) || page <= 0) throw new Error('Stored favorites page is invalid');
    return page;
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
    if (saved === null) return null;

    const position = Number(saved);
    if (!Number.isFinite(position) || position < 0) throw new Error('Stored scroll position is invalid');
    return position;
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
