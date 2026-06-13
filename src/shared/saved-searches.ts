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

// ── UI ──────────────────────────────────────────────────────────────

export const HITOMI_ITEMS_PER_PAGE = 25;

function renderSavedSearches(container: HTMLElement, input: HTMLInputElement): void {
    container.innerHTML = '';
    const searches = loadSearches();
    for (let i = 0; i < searches.length; i++) {
        const q = searches[i];
        const chip = document.createElement('span');
        chip.className = 'hs-saved-chip';
        const text = document.createElement('span');
        text.textContent = q;
        chip.appendChild(text);
        const x = document.createElement('span');
        x.className = 'hs-saved-x';
        x.textContent = '\u00D7';
        x.onclick = (e) => {
            e.stopPropagation();
            removeSearch(q);
            chip.remove();
        };
        chip.appendChild(x);
        chip.onclick = () => {
            input.value = q;
            window.location.href = 'https://hitomi.la/search.html?' + encodeURIComponent(q);
        };
        container.appendChild(chip);
    }
}

function createSavedSearchesBar(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hs-saved-searches';
    const header = document.body.firstElementChild;
    if (header) header.insertAdjacentElement('afterend', container);
    return container;
}

function bindEnterToSaveSearch(input: HTMLInputElement): void {
    input.onkeydown = function (e) {
        if (e.key === 'Enter') {
            const val = input.value.trim();
            if (val) addSearch(val);
        }
    };
}

export function setupSavedSearches(): void {
    const container = createSavedSearchesBar();
    const input = document.getElementById('query-input') as HTMLInputElement;
    if (input) {
        bindEnterToSaveSearch(input);
        renderSavedSearches(container, input);
    }
}

export function getGrid(): HTMLDivElement {
    return document.getElementById('hs-grid') as HTMLDivElement;
}
