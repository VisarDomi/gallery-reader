import {render as renderSavedSearch} from "./saved-searches";
import {preloadFavs} from "../storage/db";
import {initProvider, providerName, searchUrl} from "../provider";
import cssContent from '../css/style.css?inline';
import {loadSearches} from "../storage/localstorage";

function retryBrokenImages(selector: ".hs-reader-img" | ".hs-thumb", interval: number): void {
    setInterval(() => {
        const imgs = document.querySelectorAll<HTMLImageElement>(selector);
        for (const img of imgs) {
            if (!img.complete || img.naturalWidth > 0) continue; // safari ios doesn't execute img.onerror on 429s so we have to do hacks
            const src = img.src;
            img.src = ''; // safari ios needs its source cleared first so that it can register the new (same) source
            img.src = src;
        }
    }, interval);
}

export function startInit() {
    document.open();
    document.close();
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
    retryBrokenImages(".hs-reader-img", 1000);
    retryBrokenImages(".hs-thumb", 10000);
}

function buildSearch(): void {
    const header = document.createElement('div');
    header.id = 'hs-wrap';

    // search.js toggles .active on #query-input's parent — this div
    const searchWrap = document.createElement('div');
    searchWrap.className = 'hs-search-input';

    const input = document.createElement('textarea');
    input.rows = 1;
    input.id = 'query-input';
    input.placeholder = 'Search...';
    input.autocomplete = 'off';
    searchWrap.appendChild(input);

    const button = document.createElement('button');
    button.id = 'search-button';
    button.type = 'button';
    button.textContent = 'Search';

    header.appendChild(searchWrap);
    header.appendChild(button);

    const submit = async () => {
        const val = input.value.trim();
        const query = val || 'language:japanese';
        const saved = loadSearches(providerName()).find(s => s.query === query);
        window.location.href = await searchUrl(query, saved?.page);
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
        }
    });
    button.addEventListener('click', submit);

    document.body.appendChild(header);

    const savedSearches = document.createElement('div');
    savedSearches.className = 'hs-saved-searches';
    header.insertAdjacentElement('afterend', savedSearches);
}

function buildGridPlaceholder(): void {
    const grid = document.createElement('div');
    grid.id = 'hs-grid';
    document.body.appendChild(grid);
}

export async function initShell(): Promise<void> {
    startInit();
    buildSearch();
    renderSavedSearch();
    buildGridPlaceholder();
    void preloadFavs();
    await initProvider();
}
