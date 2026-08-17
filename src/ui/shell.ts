import {render as renderSavedSearch} from "./saved-searches";
import {initProvider, searchUrl} from "../provider";
import cssContent from '../css/style.css?inline';
import {deferScrollRestore, loadScrollPosition, loadSearches, saveScrollPosition} from "../storage/localstorage";

export function startInit(documentTitle: string): void {
    window.stop();
    document.open();
    document.close();
    document.title = documentTitle;
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
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

    const submit = () => {
        const val = input.value.trim();
        const query = val || 'language:japanese';
        const saved = loadSearches().find(s => s.query === query);
        window.location.href = searchUrl(query, saved?.page);
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
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

function syncInputFromUrl(query?: string): void {
    const input = document.getElementById('query-input') as HTMLInputElement;
    input.value = query ? query : "";
}

function initAppState(query?: string) {
    syncInputFromUrl(query);
    window.addEventListener('pagereveal', () => syncInputFromUrl(query)); // bfcache in action
    const saveScroll = () => saveScrollPosition(location.pathname + location.search, window.scrollY);
    window.addEventListener('scrollend', () => {
        setTimeout(saveScroll, 100);
    });
    window.addEventListener('pagehide', saveScroll);
    const urlKey = location.pathname + location.search;
    const savedY = loadScrollPosition(urlKey);
    if (savedY !== null) deferScrollRestore(savedY);
}

export async function initShell(query?: string): Promise<void> {
    buildSearch();
    renderSavedSearch();
    buildGridPlaceholder();
    await initProvider();
    initAppState(query);
}
