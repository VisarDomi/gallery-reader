const STORAGE_KEY = 'hitomi_saved_searches';
const VISIBLE_DEFAULT = 3;

interface SavedSearch { query: string; page?: number }

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

export function saveSearch(query: string, page?: number): void {
    const q = query.trim();
    if (!q) return;
    const searches = loadSearches();
    const filtered = searches.filter(s => s.query !== q);
    filtered.unshift({ query: q, page });
    saveSearches(filtered);
    render();
}

function removeSearch(query: string): void {
    const searches = loadSearches().filter(s => s.query !== query);
    saveSearches(searches);
    render();
}

// ── UI ──────────────────────────────────────────────────────────────

function render(): void {
    const container = document.querySelector('.hs-saved-searches') as HTMLElement | null;
    const input = document.getElementById('query-input') as HTMLTextAreaElement | null;
    if (!container || !input) return;

    container.innerHTML = '';
    const searches = loadSearches();
    if (searches.length === 0) return;

    const expanded = container.dataset.expanded === 'true';
    const visible = expanded ? searches : searches.slice(0, VISIBLE_DEFAULT);

    for (let i = 0; i < visible.length; i++) {
        const s = visible[i];
        const chip = document.createElement('span');
        chip.className = 'hs-saved-chip';
        const text = document.createElement('span');
        text.textContent = s.query;
        chip.appendChild(text);
        const x = document.createElement('span');
        x.className = 'hs-saved-x';
        x.textContent = '\u00D7';
        x.onclick = (e) => {
            e.stopPropagation();
            removeSearch(s.query);
        };
        chip.appendChild(x);
        chip.onclick = () => {
            input.value = s.query;
            let url = 'https://hitomi.la/search.html?' + encodeURIComponent(s.query);
            if (s.page && s.page > 1) url += '#' + s.page;
            window.location.href = url;
        };
        container.appendChild(chip);
    }

    if (!expanded && searches.length > VISIBLE_DEFAULT) {
        const remaining = searches.length - VISIBLE_DEFAULT;
        const btn = document.createElement('button');
        btn.className = 'hs-saved-show-more';
        btn.textContent = `Show ${remaining} more`;
        btn.onclick = () => {
            container.dataset.expanded = 'true';
            render();
        };
        container.appendChild(btn);
    }
}

function createSavedSearchesBar(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hs-saved-searches';
    const header = document.body.firstElementChild;
    if (header) header.insertAdjacentElement('afterend', container);
    return container;
}

export function setupSavedSearches(): void {
    createSavedSearchesBar();
    const input = document.getElementById('query-input') as HTMLTextAreaElement;
    if (!input) return;

    input.onkeydown = function (e) {
        if (e.key === 'Enter') {
            const val = input.value.trim();
            if (val) saveSearch(val);
        }
    };

    render();
}
