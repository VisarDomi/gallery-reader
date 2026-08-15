import {render as renderSavedSearch} from "./saved-searches";
import {initProvider, searchUrl} from "../provider";
import cssContent from '../css/style.css?inline';
import {deferScrollRestore, loadScrollPosition, loadSearches, saveScrollPosition} from "../storage/localstorage";

const FIRST_IMAGE_RETRY_MS = 1_000;
const MAX_IMAGE_RETRY_MS = 2_147_483_647;

function retryBrokenImages(selector: ".hs-reader-img" | ".hs-thumb"): void {
    let delay = FIRST_IMAGE_RETRY_MS;
    const retrying = new WeakSet<HTMLImageElement>();

    const retry = () => {
        let retried = false;
        let retryPending = false;
        const imgs = document.querySelectorAll<HTMLImageElement>(selector);
        for (const img of imgs) {
            if (!img.getAttribute('src')?.trim()) {
                retrying.delete(img);
                continue;
            }
            if (img.naturalWidth > 0) {
                retrying.delete(img);
                continue;
            }
            if (!img.complete) {
                retryPending ||= retrying.has(img);
                continue;
            }
            // Safari iOS doesn't execute img.onerror on 429s, so failed images need polling.
            retried = true;
            retryPending = true;
            retrying.add(img);
            const src = new URL(img.src);
            if (src.origin === location.origin) src.searchParams.set('retry', Date.now().toString());
            img.src = ''; // safari ios needs its source cleared first so that it can register the new (same) source
            img.src = src.href;
        }

        if (retried) delay = Math.min(delay * 2, MAX_IMAGE_RETRY_MS);
        else if (!retryPending) delay = FIRST_IMAGE_RETRY_MS;
        window.setTimeout(retry, delay);
    };

    window.setTimeout(retry, delay);
}

export function startInit(documentTitle: string): void {
    window.stop();
    document.open();
    document.close();
    document.title = documentTitle;
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
    retryBrokenImages(".hs-reader-img");
    retryBrokenImages(".hs-thumb");
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
