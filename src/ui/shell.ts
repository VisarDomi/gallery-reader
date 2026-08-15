import {render as renderSavedSearch} from "./saved-searches";
import {initProvider, searchUrl} from "../provider";
import cssContent from '../css/style.css?inline';
import {deferScrollRestore, loadScrollPosition, loadSearches, saveScrollPosition} from "../storage/localstorage";

const FIRST_IMAGE_RETRY_MS = 1_000;
const MAX_IMAGE_RETRY_MS = 2_147_483_647;

interface ImageRetryState {
    source: string;
    delay: number;
    retryAt: number;
}

function retryBrokenImages(selector: ".hs-reader-img" | ".hs-thumb"): void {
    const retryStates = new WeakMap<HTMLImageElement, ImageRetryState>();

    const retry = () => {
        const now = Date.now();
        const imgs = document.querySelectorAll<HTMLImageElement>(selector);
        for (const img of imgs) {
            if (!img.getAttribute('src')?.trim()) {
                retryStates.delete(img);
                continue;
            }
            if (img.naturalWidth > 0) {
                retryStates.delete(img);
                continue;
            }

            const source = img.src;
            let state = retryStates.get(img);
            if (!state || state.source !== source) {
                state = {source, delay: FIRST_IMAGE_RETRY_MS, retryAt: now};
                retryStates.set(img, state);
            }
            if (!img.complete || now < state.retryAt) continue;

            // Safari iOS doesn't execute img.onerror on 429s, so failed images need polling.
            const src = new URL(source);
            if (src.origin === location.origin) src.searchParams.set('retry', Date.now().toString());
            img.src = ''; // safari ios needs its source cleared first so that it can register the new (same) source
            img.src = src.href;

            state.delay = Math.min(state.delay * 2, MAX_IMAGE_RETRY_MS);
            state.retryAt = now + state.delay;
            state.source = img.src;
        }

        window.setTimeout(retry, FIRST_IMAGE_RETRY_MS);
    };

    window.setTimeout(retry, FIRST_IMAGE_RETRY_MS);
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
