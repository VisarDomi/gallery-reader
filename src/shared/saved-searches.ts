const STORAGE_KEY = 'hitomi_saved_searches';
const VISIBLE_DEFAULT = 3;

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

function saveSearch(query: string): void {
    const q = query.trim();
    if (!q) return;
    const searches = loadSearches();
    const filtered = searches.filter(entry => entry !== q);
    filtered.unshift(q);
    saveSearches(filtered);
    render();
}

function removeSearch(query: string): void {
    const searches = loadSearches().filter(entry => entry !== query);
    saveSearches(searches);
    render();
}

// ── UI ──────────────────────────────────────────────────────────────

function render(): void {
    const container = document.querySelector('.hs-saved-searches') as HTMLElement | null;
    const input = document.getElementById('query-input') as HTMLInputElement | null;
    if (!container || !input) return;

    container.innerHTML = '';
    const searches = loadSearches();
    if (searches.length === 0) return;

    const expanded = container.dataset.expanded === 'true';
    const visible = expanded ? searches : searches.slice(0, VISIBLE_DEFAULT);

    for (let i = 0; i < visible.length; i++) {
        const q = visible[i];
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
        };
        chip.appendChild(x);
        chip.onclick = () => {
            input.value = q;
            window.location.href = 'https://hitomi.la/search.html?' + encodeURIComponent(q);
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
    const input = document.getElementById('query-input') as HTMLInputElement;
    if (!input) return;

    input.onkeydown = function (e) {
        if (e.key === 'Enter') {
            const val = input.value.trim();
            if (val) saveSearch(val);
        }
    };

    render();
}

export function getGrid(): HTMLDivElement {
    return document.getElementById('hs-grid') as HTMLDivElement;
}
